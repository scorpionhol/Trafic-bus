// Application Logic - Trafic Bus ERP

// Global state variable
let db = null;
let currentMonth = new Date(2026, 6, 1); // July 2026
let isAuthenticated = false;

// Charts instances
let costChart = null;
let statusChart = null;

function findBusByValue(busValue) {
  const input = String(busValue ?? "").trim().toLowerCase();
  if (!input) return null;
  return db?.bus?.find(bus => [bus.id, bus.numero, bus.immatriculation]
    .some(value => String(value ?? "").trim().toLowerCase() === input)) || null;
}

function findAssignedChauffeur(busValue) {
  const bus = findBusByValue(busValue);
  if (!bus) return null;
  return db.chauffeurs.find(chauffeur => findBusByValue(chauffeur.busAffecte)?.id === bus.id) || null;
}

function getAssignedChauffeurInfo(busValue) {
  const chauffeur = findAssignedChauffeur(busValue);
  if (!chauffeur) return { chauffeur: "", matricule: "" };
  return {
    chauffeur: `${chauffeur.prenom || ""} ${chauffeur.nom || ""}`.trim(),
    matricule: chauffeur.matricule || ""
  };
}

function setChauffeurBusAffectation(chauffeur, busValue) {
  const bus = findBusByValue(busValue);
  chauffeur.busAffecte = bus?.id || "";
  if (bus) {
    db.chauffeurs.forEach(other => {
      if (other !== chauffeur && findBusByValue(other.busAffecte)?.id === bus.id) other.busAffecte = "";
    });
  }
}

function synchronizeFleetReferences() {
  let modified = false;

  db.chauffeurs.forEach(chauffeur => {
    const bus = findBusByValue(chauffeur.busAffecte);
    const normalizedBusId = bus?.id || "";
    if (chauffeur.busAffecte !== normalizedBusId) {
      chauffeur.busAffecte = normalizedBusId;
      modified = true;
    }
  });

  ["excelPeinture", "excelCarrosserie"].forEach(collection => {
    (db[collection] || []).forEach(row => {
      const info = getAssignedChauffeurInfo(row.vehicule);
      if (!info.chauffeur) return;
      if (row.chauffeur !== info.chauffeur || row.matricule !== info.matricule) {
        row.chauffeur = info.chauffeur;
        row.matricule = info.matricule;
        modified = true;
      }
    });
  });

  if (modified) saveDB(db);
  return modified;
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  db = getDB();
  synchronizeFleetReferences();
  const lastUsername = localStorage.getItem("trafic_bus_last_login_username") || "";

  document.body.classList.add("app-locked");
  isAuthenticated = false;
  setupLoginScreen();

  if (lastUsername) {
    const usernameInput = document.getElementById("login-username");
    if (usernameInput) usernameInput.value = lastUsername;
  }

  const savedTheme = localStorage.getItem("trafic_bus_theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme);

  const appShell = document.querySelector(".sidebar");
  const mainContent = document.querySelector(".main-content");
  if (appShell) appShell.style.display = "none";
  if (mainContent) mainContent.style.display = "none";
});

function setupLoginScreen() {
  const loginForm = document.getElementById("login-form");
  if (!loginForm) return;

  loginForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const username = document.getElementById("login-username").value.trim();
    const errorBox = document.getElementById("login-error");
    const loginCard = document.querySelector(".login-card");
    const loginBtn = document.querySelector(".btn-login");

    if (loginBtn && loginBtn.classList.contains("loading")) return;

    if (!username) {
      triggerLoginError("Veuillez saisir votre nom d'utilisateur.");
      return;
    }

    const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) {
      triggerLoginError("Utilisateur introuvable.");
      return;
    }

    // Success - add loading state for a premium entry animation
    if (loginBtn) loginBtn.classList.add("loading");
    if (errorBox) errorBox.textContent = "";

    setTimeout(() => {
      try {
        isAuthenticated = true;
        localStorage.setItem("trafic_bus_last_login_username", user.username);
        db.currentUser = { ...user };
        saveDB(db);
        populateUserSwitcher();
        updateUserDisplay();

        document.body.classList.remove("app-locked");
        if (loginBtn) loginBtn.classList.remove("loading");

        const appShell = document.querySelector(".sidebar");
        const mainContent = document.querySelector(".main-content");
        if (appShell) appShell.style.display = "flex";
        if (mainContent) mainContent.style.display = "flex";

        const activeLink = document.querySelector(".sidebar-link.active") || document.querySelector(".sidebar-link[onclick*='dashboard']");
        if (activeLink) {
          const tabName = activeLink.getAttribute("onclick").match(/'([^']+)'/)[1];
          switchTab(tabName);
        } else {
          initDashboard();
        }
        checkNotificationAlerts();
        lucide.createIcons();
      } catch (err) {
        console.error("Erreur d'initialisation de la session :", err);
        if (loginBtn) loginBtn.classList.remove("loading");
        triggerLoginError("Erreur d'initialisation : " + err.message);
      }
    }, 1000);

    function triggerLoginError(message) {
      if (errorBox) errorBox.textContent = message;
      if (loginCard) {
        loginCard.classList.remove("shake");
        // force reflow
        void loginCard.offsetWidth;
        loginCard.classList.add("shake");
        setTimeout(() => loginCard.classList.remove("shake"), 500);
      }
    }
  });
}

function togglePasswordVisibility() {
  const passwordInput = document.getElementById("login-password");
  const toggleIcon = document.getElementById("password-toggle-icon");
  if (!passwordInput || !toggleIcon) return;

  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    toggleIcon.setAttribute("data-lucide", "eye-off");
  } else {
    passwordInput.type = "password";
    toggleIcon.setAttribute("data-lucide", "eye");
  }
  lucide.createIcons();
}


function logoutUser() {
  isAuthenticated = false;
  document.body.classList.add("app-locked");
  const loginUsername = document.getElementById("login-username");
  if (loginUsername) loginUsername.value = db.currentUser?.username || "";
  const loginPassword = document.getElementById("login-password");
  if (loginPassword) loginPassword.value = "";
  const errorBox = document.getElementById("login-error");
  if (errorBox) errorBox.textContent = "";

  if (document.getElementById("role-switcher")) {
    document.getElementById("role-switcher").value = db.currentUser.id;
  }
}

// Update the user details display in sidebar
function updateUserDisplay() {
  const user = db.currentUser;
  const avatar = document.getElementById("header-avatar");
  const username = document.getElementById("header-username");
  const role = document.getElementById("header-role");
  
  if (avatar && username && role) {
    const initials = user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    avatar.textContent = initials;
    username.textContent = user.name;
    role.textContent = user.role === 'admin' ? "Administrateur" : 
                     user.role === 'chef_atelier' ? "Chef d'Atelier" : 
                     user.role === 'parc_mgr' ? "Resp. Parc" : "Lecteur Seul";
  }
  
  // Enforce read-only permissions on current tab
  applyPermissions();
}

// Enforce read-only locks on buttons based on roles
function applyPermissions() {
  const role = db.currentUser.role;
  const writeButtons = document.querySelectorAll(".btn-primary, .btn-danger, .btn-sm:not(.btn-secondary)");
  
  writeButtons.forEach(btn => {
    // If user is reader (lecteur), disable all write actions
    if (role === "lecteur") {
      btn.style.opacity = "0.4";
      btn.style.pointerEvents = "none";
      btn.setAttribute("title", "Action non autorisée pour votre rôle (Lecteur)");
    } else {
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
      btn.removeAttribute("title");
    }
  });

  // Specific role restrictions
  if (role === "chef_atelier") {
    // Chef d'atelier cannot add new bus or chauffeur or change settings
    document.querySelectorAll(".sidebar-link").forEach(link => {
      const onclickAttr = link.getAttribute("onclick");
      if (onclickAttr && (onclickAttr.includes("settings") || onclickAttr.includes("backup-api"))) {
        // Can read but maybe warn
      }
    });
  }
}

// Tab navigation routing
function switchTab(tabId) {
  if (!isAuthenticated) {
    document.body.classList.add("app-locked");
    return;
  }

  // Hide all views
  document.querySelectorAll(".view-container").forEach(el => {
    el.classList.remove("active");
  });
  
  // Show selected view
  const targetView = document.getElementById(`view-${tabId}`);
  if (targetView) {
    targetView.classList.add("active");
  }
  
  // Update sidebar links active class
  document.querySelectorAll(".sidebar-link").forEach(el => {
    el.classList.remove("active");
  });
  
  // Find correct link
  const links = document.querySelectorAll(".sidebar-link");
  links.forEach(link => {
    if (link.getAttribute("onclick").includes(tabId)) {
      link.classList.add("active");
    }
  });
  
  // Call specific tab rendering functions
  switch (tabId) {
    case "dashboard":
      initDashboard();
      break;
    case "reparations":
      renderReparations();
      break;
    case "peinture":
      renderPeinture();
      break;
    case "suivi-peinture":
      renderExcelModule();
      break;
    case "suivi-carrosserie":
      renderCarrosserieModule();
      break;
    case "incidents":
      renderIncidents();
      break;
    case "planning":
      renderPlanning();
      break;
    case "bus":
      renderBus();
      break;
    case "garages":
      renderGarages();
      break;
    case "chauffeurs":
      renderChauffeurs();
      break;
    case "pieces":
      renderPieces();
      break;
    case "fournisseurs":
      renderFournisseurs();
      break;
    case "users":
      renderUsers();
      break;
    case "audit":
      renderAudit();
      break;
    case "settings":
      loadSettings();
      break;
    case "backup-api":
      runSimulatedAPI(); // Load default
      break;
  }
  
  // Re-apply permissions and lucide icons
  applyPermissions();
  lucide.createIcons();
}

// Simulated Role Switcher
function populateUserSwitcher() {
  const switcher = document.getElementById("role-switcher");
  if (!switcher) return;

  switcher.innerHTML = db.users.map(user => `
    <option value="${user.id}" ${user.id === db.currentUser.id ? "selected" : ""}>${user.name} (${user.role})</option>
  `).join("");

  switcher.value = db.currentUser.id;
}

function changeUser(userId) {
  if (!userId) return;

  const user = db.users.find(u => u.id === userId);
  if (!user) return;

  if (user.id !== db.currentUser.id) {
    const enteredPassword = prompt(`Saisissez le mot de passe pour ${user.name || user.username} :`);
    if (enteredPassword === null) {
      populateUserSwitcher();
      return;
    }

    if (String(user.password || "") !== String(enteredPassword)) {
      alert("Mot de passe incorrect. Accès refusé.");
      populateUserSwitcher();
      return;
    }
  }

  db.currentUser = { ...user };
  saveDB(db);
  logAction(user.id, "Connexion utilisateur", `L'utilisateur ${user.name} s'est connecté au système.`);
  updateUserDisplay();

  const activeLink = document.querySelector(".sidebar-link.active");
  if (activeLink) {
    const tabName = activeLink.getAttribute("onclick").match(/'([^']+)'/)[1];
    switchTab(tabName);
  }
}

function changeUserRole(roleVal) {
  const user = db.users.find(u => u.role === roleVal);
  if (user) {
    changeUser(user.id);
  }
}

// Global Theme Management
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("trafic_bus_theme", newTheme);
  updateThemeIcon(newTheme);
  
  // Re-render charts with new theme colors if dashboard is active
  if (document.getElementById("view-dashboard").classList.contains("active")) {
    initDashboard();
  }
}

function updateThemeIcon(theme) {
  const icon = document.getElementById("theme-icon");
  if (icon) {
    icon.setAttribute("data-lucide", theme === "dark" ? "sun" : "moon");
    lucide.createIcons();
  }
}

// Modal open/close utilities
function showModal(title, bodyHtml, footerHtml) {
  document.getElementById("modal-title").innerHTML = title;
  document.getElementById("modal-body").innerHTML = bodyHtml;
  document.getElementById("modal-footer").innerHTML = footerHtml;
  document.getElementById("modal-overlay").classList.add("active");
  lucide.createIcons();
}

function closeModal(event, force = false) {
  if (force || event.target.id === "modal-overlay") {
    document.getElementById("modal-overlay").classList.remove("active");
  }
}

// System notifications/alerts checker
function checkNotificationAlerts() {
  const alerts = [];
  
  // 1. Check garage quotas
  db.garages.forEach(g => {
    const activeReps = db.reparations.filter(r => r.garageId === g.id && (r.statut === "En cours" || r.statut === "En attente")).length;
    const passCount = getGaragePassageCount(g.id);
    const passLimit = getGaragePassLimit(g);

    if (passCount >= passLimit) {
      alerts.push({
        type: "danger",
        title: `Quota passages atteint : ${g.nom}`,
        desc: `Le garage a totalisé ${passCount}/${passLimit} passages. Nouvelle affectation recommandée.`
      });
    }

    if (activeReps >= g.quotaMax) {
      alerts.push({
        type: "danger",
        title: `Quota saturé : ${g.nom}`,
        desc: `Capacité maximale (${g.quotaMax}) atteinte ou dépassée (${activeReps} bus en attente/cours).`
      });
    } else if (activeReps >= g.quotaMax - 1) {
      alerts.push({
        type: "warning",
        title: `Quota critique : ${g.nom}`,
        desc: `${activeReps}/${g.quotaMax} places occupées.`
      });
    }
  });

  // 2. Check parts stock level
  db.pieces.forEach(p => {
    if (p.quantiteStock <= p.seuilAlerte) {
      alerts.push({
        type: "warning",
        title: `Stock bas : ${p.designation}`,
        desc: `Stock restant : ${p.quantiteStock} pièces (Seuil d'alerte : ${p.seuilAlerte}). Code : ${p.code}`
      });
    }
  });

  // 3. New incidents
  const pendingIncidents = db.incidents.filter(i => i.statut === "En attente").length;
  if (pendingIncidents > 0) {
    alerts.push({
      type: "info",
      title: `Incidents en attente`,
      desc: `${pendingIncidents} incident(s) signalé(s) en attente de traitement.`
    });
  }

  // Update notification bell dot
  const dot = document.getElementById("notif-dot");
  if (dot) {
    dot.style.display = alerts.length > 0 ? "block" : "none";
  }

  return alerts;
}

const BUS_GARAGE_PASSAGE_LIMIT = 40;

function getBusGaragePassageCount(busId, garageId) {
  if (!busId || !garageId) return 0;
  const bus = db.bus.find(b => b.id === busId);
  if (!bus || !bus.garagePassages) return 0;
  return bus.garagePassages[garageId] || 0;
}

function canAssignBusToGarage(busId, garageId) {
  if (!busId || !garageId) return true;
  return getBusGaragePassageCount(busId, garageId) < BUS_GARAGE_PASSAGE_LIMIT;
}

function getAlternateGarageForBus(busId, currentGarageId) {
  return db.garages
    .filter(g => g.active && g.id !== currentGarageId)
    .filter(g => canAssignBusToGarage(busId, g.id))
    .sort((a, b) => getBusGaragePassageCount(busId, a.id) - getBusGaragePassageCount(busId, b.id))[0] || null;
}

function getGaragePassageCount(garageId) {
  return db.bus.reduce((sum, bus) => {
    if (!bus.garagePassages) return sum;
    return sum + (bus.garagePassages[garageId] || 0);
  }, 0);
}

function getGaragePassLimit(garage) {
  if (garage && typeof garage.passLimit === "number") {
    return garage.passLimit;
  }
  return db.settings?.garagePassageLimit || 40;
}

function getAlternateGarageFor(garageId) {
  const candidates = db.garages
    .filter(g => g.active && g.id !== garageId)
    .map(g => ({
      garage: g,
      passages: getGaragePassageCount(g.id),
      activeReps: db.reparations.filter(r => r.garageId === g.id && (r.statut === "En cours" || r.statut === "En attente")).length
    }))
    .filter(c => c.passages < getGaragePassLimit(c.garage) && c.activeReps < c.garage.quotaMax)
    .sort((a, b) => a.passages - b.passages || a.activeReps - b.activeReps);
  return candidates.length ? candidates[0].garage : null;
}

function openNotifications() {
  const alerts = checkNotificationAlerts();
  let html = `<div style="display:flex; flex-direction:column; gap:12px;">`;
  
  if (alerts.length === 0) {
    html += `<p class="list-meta">Aucune alerte active dans le système. Tout fonctionne nominalement.</p>`;
  } else {
    alerts.forEach(a => {
      const color = a.type === "danger" ? "var(--color-danger)" : a.type === "warning" ? "var(--color-warning)" : "var(--color-secondary)";
      html += `
        <div style="border-left: 4px solid ${color}; padding: 10px 14px; background: rgba(255,255,255,0.02); border-radius: 0 8px 8px 0;">
          <h4 style="font-size:0.9rem; font-weight:600; margin-bottom:2px; display:flex; align-items:center; gap:8px;">
            <span class="badge badge-${a.type === 'danger' ? 'danger' : a.type === 'warning' ? 'warning' : 'info'}">${a.type.toUpperCase()}</span>
            ${a.title}
          </h4>
          <p style="font-size:0.8rem; color:var(--text-muted);">${a.desc}</p>
        </div>
      `;
    });
  }
  
  html += `</div>`;
  
  showModal(
    `<i data-lucide="bell" style="vertical-align:middle; margin-right:8px;"></i> Centre d'alertes & notifications`,
    html,
    `<button class="btn btn-secondary" onclick="closeModal(null, true)">Fermer</button>`
  );
}


/* ==========================================================================
   MODULE 1: TABLEAU DE BORD (DASHBOARD)
   ========================================================================== */

function initDashboard() {
  const alerts = checkNotificationAlerts();
  
  // Calculate Dashboard Metrics
  const activeBus = db.bus.filter(b => b.statut === "En service").length;
  const totalBus = db.bus.length;
  const inRepairBus = db.bus.filter(b => b.statut === "En réparation" || b.statut === "En peinture").length;
  const totalGaragePassages = db.bus.reduce((sum, bus) => {
    return sum + Object.values(bus.garagePassages || {}).reduce((count, value) => count + value, 0);
  }, 0);
  const totalActions = db.auditLog.length;
  
  // Total cost
  let totalCost = 0;
  db.reparations.forEach(r => {
    totalCost += r.coutReel || r.coutEstime || 0;
  });
  db.peinture.forEach(p => {
    totalCost += (p.coutMatiere || 0) + (p.coutMainOeuvre || 0);
  });

  const excelRows = Array.isArray(db.excelPeinture) ? db.excelPeinture : [];
  const carrosserieRows = Array.isArray(db.excelCarrosserie) ? db.excelCarrosserie : [];
  const excelActive = excelRows.filter(r => !r.dateRetour).length;
  const excelTotalUSD = excelRows.reduce((sum, r) => sum + Number(r.incidentUSD || 0) + Number(r.peintureUSD || 0), 0);
  const carrosserieTotalUSD = carrosserieRows.reduce((sum, r) => sum + Number(r.montantCarrosserieUSD || 0), 0);
  const totalTrackedUSD = excelTotalUSD + carrosserieTotalUSD;
  totalCost += totalTrackedUSD;
  const totalCostCDF = Math.round(totalCost * (db.excelSettings?.tauxChange || 2300));
  const trackedBusIds = new Set([...excelRows, ...carrosserieRows]
    .map(row => findBusByValue(row.vehicule)?.id)
    .filter(Boolean));
  const followupQuota = Number(db.excelSettings?.quotaGarage || 40);
  const quotaExceededBusCount = [...trackedBusIds].filter(busId => {
    const count = [...excelRows, ...carrosserieRows].filter(row => findBusByValue(row.vehicule)?.id === busId).length;
    return count >= followupQuota;
  }).length;
  
  const lowStockCount = db.pieces.filter(p => p.quantiteStock <= p.seuilAlerte).length;
  
  // Render KPIs
  const kpisContainer = document.getElementById("dashboard-kpis");
  kpisContainer.innerHTML = `
    <div class="card-stat">
      <div class="stat-details">
        <h3>Disponibilité Parc</h3>
        <p>${activeBus} / ${totalBus}</p>
      </div>
      <div class="stat-icon" style="background-color: var(--color-success);">
        <i data-lucide="bus"></i>
      </div>
    </div>
    <div class="card-stat">
      <div class="stat-details">
        <h3>En Atelier</h3>
        <p>${inRepairBus}</p>
      </div>
      <div class="stat-icon" style="background-color: var(--color-primary);">
        <i data-lucide="wrench"></i>
      </div>
    </div>
    <div class="card-stat">
      <div class="stat-details">
        <h3>Coût Total Maintenance</h3>
        <p><strong>$${totalCost.toLocaleString('fr-FR')}</strong> / <strong>${totalCostCDF.toLocaleString('fr-FR')} CDF</strong></p>
      </div>
      <div class="stat-icon" style="background-color: var(--color-secondary);">
        <i data-lucide="dollar-sign"></i>
      </div>
    </div>
    <div class="card-stat">
      <div class="stat-details">
        <h3>Suivis Peinture + Carrosserie</h3>
        <p><strong>$${totalTrackedUSD.toLocaleString('fr-FR')}</strong></p>
        <small>${excelRows.length + carrosserieRows.length} dossiers — ${excelActive + carrosserieRows.filter(r => !r.dateRetour).length} en cours</small>
      </div>
      <div class="stat-icon" style="background-color: var(--color-warning);">
        <i data-lucide="paint-brush"></i>
      </div>
    </div>
    <div class="card-stat">
      <div class="stat-details">
        <h3>Quota par bus</h3>
        <p>${trackedBusIds.size}</p>
        <small>${quotaExceededBusCount} bus au quota de ${followupQuota} suivis</small>
      </div>
      <div class="stat-icon" style="background-color: ${quotaExceededBusCount ? 'var(--color-danger)' : 'var(--color-success)'};">
        <i data-lucide="gauge"></i>
      </div>
    </div>
    <div class="card-stat">
      <div class="stat-details">
        <h3>Passages Garage</h3>
        <p>${totalGaragePassages}</p>
      </div>
      <div class="stat-icon" style="background-color: var(--color-warning);">
        <i data-lucide="repeat"></i>
      </div>
    </div>
    <div class="card-stat">
      <div class="stat-details">
        <h3>Alertes Stock</h3>
        <p>${lowStockCount}</p>
      </div>
      <div class="stat-icon" style="background-color: ${lowStockCount > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">
        <i data-lucide="package"></i>
      </div>
    </div>
  `;

  // Render Alerts List
  const alertContainer = document.getElementById("dashboard-alerts");
  alertContainer.innerHTML = "";
  if (alerts.length === 0) {
    alertContainer.innerHTML = `
      <div class="list-item">
        <div class="list-icon" style="background-color: rgba(16, 185, 129, 0.15); color: #10b981;">
          <i data-lucide="check-circle"></i>
        </div>
        <div class="list-content">
          <div class="list-title">Aucune anomalie détectée</div>
          <div class="list-desc">Les quotas et les stocks de pièces sont optimaux.</div>
        </div>
      </div>
    `;
  } else {
    alerts.slice(0, 3).forEach(al => {
      const isDanger = al.type === "danger";
      alertContainer.innerHTML += `
        <div class="list-item">
          <div class="list-icon" style="background-color: ${isDanger ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)'}; color: ${isDanger ? '#ef4444' : '#f59e0b'};">
            <i data-lucide="alert-triangle"></i>
          </div>
          <div class="list-content">
            <div class="list-title">${al.title}</div>
            <div class="list-desc">${al.desc}</div>
          </div>
        </div>
      `;
    });
  }

  // Render Recent Activity (Audit Log)
  const actContainer = document.getElementById("dashboard-activities");
  actContainer.innerHTML = "";
  db.auditLog.slice(0, 4).forEach(log => {
    let icon = "info";
    let color = "var(--color-secondary)";
    if (log.action.includes("Création") || log.action.includes("Ajout")) {
      icon = "plus-circle";
      color = "var(--color-success)";
    } else if (log.action.includes("Validation")) {
      icon = "shield-check";
      color = "var(--color-primary)";
    } else if (log.action.includes("Suppression") || log.action.includes("Réinitialiser")) {
      icon = "trash";
      color = "var(--color-danger)";
    }
    
    const logDate = new Date(log.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    
    actContainer.innerHTML += `
      <div class="list-item">
        <div class="list-icon" style="background-color: rgba(255,255,255,0.05); color: ${color};">
          <i data-lucide="${icon}"></i>
        </div>
        <div class="list-content">
          <div class="list-title">${log.action} - <span style="font-weight:400; color:var(--text-muted);">${log.username}</span></div>
          <div class="list-desc">${log.details}</div>
        </div>
        <div class="list-meta">${logDate}</div>
      </div>
    `;
  });

  // Re-instantiate charts
  renderDashboardCharts();
  lucide.createIcons();
}

function renderDashboardCharts() {
  // Chart.js helper styles
  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  const gridColor = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)";
  const textColor = isDark ? "#9ca3af" : "#64748b";

  // 1. Costs Chart
  const ctxCost = document.getElementById('cost-chart').getContext('2d');
  if (costChart) costChart.destroy();
  
  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const year = currentMonth.getFullYear();
  const costsPerMonth = Object.fromEntries(monthNames.map(month => [month, 0]));
  const addCost = (date, amount) => {
    const parsed = String(date || "");
    if (!parsed.startsWith(String(year)) || !Number.isFinite(Number(amount))) return;
    const month = Number(parsed.slice(5, 7)) - 1;
    if (month >= 0 && month < 12) costsPerMonth[monthNames[month]] += Number(amount);
  };

  db.reparations.forEach(r => addCost(r.dateDebut, r.coutReel || r.coutEstime || 0));
  db.peinture.forEach(p => {
    const rep = db.reparations.find(r => r.id === p.reparationId);
    addCost(rep?.dateDebut, (p.coutMatiere || 0) + (p.coutMainOeuvre || 0));
  });
  (db.excelPeinture || []).forEach(row => addCost(row.dateInscription || row.dateDepart, Number(row.incidentUSD || 0) + Number(row.peintureUSD || 0)));
  (db.excelCarrosserie || []).forEach(row => addCost(row.dateInscription || row.dateDepart, row.montantCarrosserieUSD || 0));

  costChart = new Chart(ctxCost, {
    type: 'bar',
    data: {
      labels: Object.keys(costsPerMonth),
      datasets: [{
        label: 'Coût (€)',
        data: Object.values(costsPerMonth),
        backgroundColor: '#6366f1',
        borderRadius: 6,
        hoverBackgroundColor: '#818cf8'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor } },
        y: { grid: { color: gridColor }, ticks: { color: textColor } }
      }
    }
  });

  // 2. Bus Status Chart
  const ctxStatus = document.getElementById('bus-status-chart').getContext('2d');
  if (statusChart) statusChart.destroy();

  const statuses = {
    "En service": db.bus.filter(b => b.statut === "En service").length,
    "En réparation": db.bus.filter(b => b.statut === "En réparation").length,
    "En peinture": db.bus.filter(b => b.statut === "En peinture").length,
    "Hors service": db.bus.filter(b => b.statut === "Hors service").length
  };

  statusChart = new Chart(ctxStatus, {
    type: 'doughnut',
    data: {
      labels: Object.keys(statuses),
      datasets: [{
        data: Object.values(statuses),
        backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
        borderWidth: 2,
        borderColor: isDark ? '#0b0f19' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: textColor, font: { family: 'Outfit' } }
        }
      },
      cutout: '65%'
    }
  });
}


/* ==========================================================================
   MODULE 2: GESTION DES REPARATIONS
   ========================================================================== */

function renderReparations() {
  const tbody = document.getElementById("reparations-table-body");
  const filterSearch = document.getElementById("rep-filter-search").value.toLowerCase();
  const filterStatut = document.getElementById("rep-filter-statut").value;
  
  tbody.innerHTML = "";
  
  const filtered = db.reparations.filter(r => {
    const bus = db.bus.find(b => b.id === r.busId);
    const garage = db.garages.find(g => g.id === r.garageId);
    
    const matchesSearch = r.description.toLowerCase().includes(filterSearch) || 
                          (bus && bus.immatriculation.toLowerCase().includes(filterSearch)) ||
                          (bus && bus.numero.includes(filterSearch)) ||
                          (garage && garage.nom.toLowerCase().includes(filterSearch));
                          
    const matchesStatut = filterStatut === "" || r.statut === filterStatut;
    
    return matchesSearch && matchesStatut;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;" class="text-muted">Aucun dossier de réparation trouvé.</td></tr>`;
    return;
  }

  filtered.forEach(r => {
    const bus = db.bus.find(b => b.id === r.busId);
    const garage = db.garages.find(g => g.id === r.garageId);
    
    const badgeStatut = r.statut === "Terminé" ? "success" : r.statut === "En cours" ? "info" : "warning";
    const badgeVal = r.validation.includes("Validé") ? "success" : "warning";
    
    const cost = r.coutReel > 0 ? r.coutReel : r.coutEstime;
    const isCompleted = r.statut === "Terminé";
    const isAwaitingVal = r.validation.includes("attente");
    
    // Actions buttons based on permissions
    let actionButtons = ``;
    
    if (db.currentUser.role !== 'lecteur') {
      if (isAwaitingVal && (db.currentUser.role === 'admin' || db.currentUser.role === 'chef_atelier')) {
        actionButtons += `<button class="btn btn-secondary btn-sm" onclick="approveReparation('${r.id}')" title="Approuver"><i data-lucide="check"></i> Valider</button> `;
      }
      if (r.statut === "En cours") {
        actionButtons += `<button class="btn btn-primary btn-sm" onclick="completeReparationModal('${r.id}')" title="Terminer"><i data-lucide="check-square"></i> Clôturer</button> `;
      }
      actionButtons += `<button class="btn btn-secondary btn-sm" onclick="editReparationModal('${r.id}')" title="Modifier"><i data-lucide="edit"></i></button> `;
      actionButtons += `<button class="btn btn-danger btn-sm" onclick="deleteReparation('${r.id}')" title="Supprimer"><i data-lucide="trash-2"></i></button>`;
    } else {
      actionButtons = `<span class="text-muted">Lecture seule</span>`;
    }

    tbody.innerHTML += `
      <tr>
        <td><strong>REP-${r.id.toUpperCase()}</strong></td>
        <td>
          <div style="font-weight:600;">Bus ${bus ? bus.numero : 'Inconnu'}</div>
          <div class="list-meta">${bus ? bus.immatriculation : ''}</div>
        </td>
        <td>${garage ? garage.nom : 'Non affecté'}</td>
        <td>${r.description}</td>
        <td>${r.dateDebut}</td>
        <td>${r.dateFinPrevue}</td>
        <td><strong>${cost} €</strong></td>
        <td><span class="badge badge-${badgeStatut}">${r.statut}</span></td>
        <td><span class="badge badge-${badgeVal}">${r.validation}</span></td>
        <td>
          <div style="display:flex; gap:4px;">
            ${actionButtons}
          </div>
        </td>
      </tr>
    `;
  });
  
  lucide.createIcons();
}

function openNewReparationModal() {
  const busOptions = db.bus.map(b => `<option value="${b.id}">Bus ${b.numero} - ${b.immatriculation} (${b.statut})</option>`).join("");
  const garageOptions = db.garages.filter(g => g.active).map(g => {
    const passCount = getGaragePassageCount(g.id);
    const passLimit = getGaragePassLimit(g);
    const busId = db.bus[0]?.id || "";
    const busLimited = !canAssignBusToGarage(busId, g.id);
    return `<option value="${g.id}" ${busLimited ? 'disabled' : ''}>${g.nom} (Quota bus: ${g.quotaMax}, passages totales: ${passCount}/${passLimit})</option>`;
  }).join("");
  
  const body = `
    <form id="form-reparation" onsubmit="saveNewReparation(event)">
      <div class="form-group">
        <label for="rep-bus">Sélectionner le Bus</label>
        <select class="form-control" id="rep-bus" required>${busOptions}</select>
      </div>
      <div class="form-group">
        <label for="rep-garage">Affecter à un Garage / Atelier</label>
        <select class="form-control" id="rep-garage" required>${garageOptions}</select>
      </div>
      <div class="form-group">
        <label for="rep-desc">Description des travaux à effectuer</label>
        <textarea class="form-control" id="rep-desc" required placeholder="Ex: Vidange complète, changement disques de freins..."></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="rep-date-deb">Date de Début</label>
          <input type="date" class="form-control" id="rep-date-deb" value="2026-07-13" required>
        </div>
        <div class="form-group">
          <label for="rep-date-fin">Date de Fin Prévue</label>
          <input type="date" class="form-control" id="rep-date-fin" value="2026-07-16" required>
        </div>
      </div>
      <div class="form-group">
        <label for="rep-cout">Estimation du Coût (€)</label>
        <input type="number" class="form-control" id="rep-cout" min="0" required placeholder="Ex: 800">
      </div>
    </form>
  `;
  
  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null, true)">Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-reparation">Créer le dossier</button>
  `;
  
  showModal("Créer une Demande de Réparation", body, footer);

  const repBusSelect = document.getElementById("rep-bus");
  const repGarageSelect = document.getElementById("rep-garage");

  function refreshGarageOptionsForBus() {
    const selectedBusId = repBusSelect.value;
    const availableGarages = db.garages.filter(g => g.active);
    const options = availableGarages.map(g => {
      const allowed = canAssignBusToGarage(selectedBusId, g.id);
      const passCount = getBusGaragePassageCount(selectedBusId, g.id);
      return `<option value="${g.id}" ${allowed ? '' : 'disabled'} ${g.id === repGarageSelect.value ? 'selected' : ''}>${g.nom} (${passCount}/${BUS_GARAGE_PASSAGE_LIMIT} quota bus)</option>`;
    }).join("");

    repGarageSelect.innerHTML = options || '<option value="">Aucun garage disponible pour ce bus</option>';
    if (!options) {
      repGarageSelect.disabled = true;
      return;
    }
    repGarageSelect.disabled = false;

    const validChoice = Array.from(repGarageSelect.options).some(option => !option.disabled && option.value === repGarageSelect.value);
    if (!validChoice) {
      repGarageSelect.value = Array.from(repGarageSelect.options).find(option => !option.disabled)?.value || "";
    }
  }

  repBusSelect.addEventListener("change", refreshGarageOptionsForBus);
  refreshGarageOptionsForBus();
}

function saveNewReparation(e) {
  e.preventDefault();
  
  const busId = document.getElementById("rep-bus").value;
  const garageId = document.getElementById("rep-garage").value;
  const description = document.getElementById("rep-desc").value;
  const dateDebut = document.getElementById("rep-date-deb").value;
  const dateFinPrevue = document.getElementById("rep-date-fin").value;
  const coutEstime = parseInt(document.getElementById("rep-cout").value);

  if (!canAssignBusToGarage(busId, garageId)) {
    alert(`Le bus a déjà atteint le quota de ${BUS_GARAGE_PASSAGE_LIMIT} passages dans ce garage. Sélectionnez un autre garage.`);
    return;
  }
  
  // Create repair object
  const newRep = {
    id: "r" + (db.reparations.length + 1),
    busId,
    garageId,
    description,
    dateDebut,
    dateFinPrevue,
    coutEstime,
    coutReel: 0,
    statut: "En attente",
    validation: "En attente de validation",
    piecesConsommees: []
  };

  db.reparations.push(newRep);
  saveDB(db);
  logAction(db.currentUser.id, "Création Réparation", `Dossier REP-${newRep.id.toUpperCase()} créé pour le bus ${db.bus.find(b => b.id === busId).numero}`);
  closeModal(null, true);
  renderReparations();
}

function approveReparation(repId) {
  const rep = db.reparations.find(r => r.id === repId);
  if (!rep) return;

  const bus = db.bus.find(b => b.id === rep.busId);
  const originalGarage = db.garages.find(g => g.id === rep.garageId);
  let assignedGarage = originalGarage;

  if (bus && originalGarage) {
    const busGarageCount = getBusGaragePassageCount(bus.id, originalGarage.id);
    if (busGarageCount >= BUS_GARAGE_PASSAGE_LIMIT) {
      const alternate = getAlternateGarageForBus(bus.id, originalGarage.id);
      if (alternate) {
        rep.garageId = alternate.id;
        assignedGarage = alternate;
        alert(`Le bus "Bus ${bus.numero}" a déjà atteint ${BUS_GARAGE_PASSAGE_LIMIT} passages dans "${originalGarage.nom}". Le dossier est réaffecté automatiquement au garage "${alternate.nom}".`);
      } else {
        alert(`Le bus "Bus ${bus.numero}" a atteint le quota de ${BUS_GARAGE_PASSAGE_LIMIT} passages dans "${originalGarage.nom}". Aucun autre garage disponible pour ce bus.`);
        return;
      }
    }
  }

  const activeReps = db.reparations.filter(r => r.garageId === rep.garageId && r.statut === "En cours").length;
  if (assignedGarage && activeReps >= assignedGarage.quotaMax) {
    alert(`ATTENTION: Le quota du garage "${assignedGarage.nom}" est dépassé (${activeReps}/${assignedGarage.quotaMax}). Vous pouvez forcer la validation, mais un avertissement sera affiché au tableau de bord.`);
  }

  rep.validation = "Validé par " + db.currentUser.name;
  rep.statut = "En cours";
  
  // Set bus state and count garage passage
  if (bus) {
    bus.statut = rep.description.toLowerCase().includes("peinture") ? "En peinture" : "En réparation";
    bus.garagePassages = bus.garagePassages || {};
    bus.garagePassages[rep.garageId] = (bus.garagePassages[rep.garageId] || 0) + 1;
  }

  saveDB(db);
  logAction(db.currentUser.id, "Validation Réparation", `Dossier REP-${rep.id.toUpperCase()} validé et passé En Cours.`);
  renderReparations();
  checkNotificationAlerts();
}

function completeReparationModal(repId) {
  const rep = db.reparations.find(r => r.id === repId);
  if (!rep) return;
  
  // Display parts consuming options
  const partsListHtml = db.pieces.map(p => `
    <div style="display:flex; align-items:center; justify-content:between; margin-bottom:8px;">
      <span style="flex:1; font-size:0.85rem;">${p.designation} (${p.quantiteStock} en stock)</span>
      <input type="number" class="form-control piece-quantity" data-id="${p.id}" min="0" max="${p.quantiteStock}" value="0" style="width:70px; padding:4px 8px; font-size:0.8rem;">
    </div>
  `).join("");

  const body = `
    <form id="form-complete-rep" onsubmit="saveCompleteReparation(event, '${repId}')">
      <div class="form-group">
        <label for="rep-cout-reel">Coût Réel Final des Travaux (€)</label>
        <input type="number" class="form-control" id="rep-cout-reel" value="${rep.coutEstime}" min="0" required>
      </div>
      <div class="form-group">
        <label>Pièces consommées lors de l'intervention</label>
        <div style="max-height: 150px; overflow-y:auto; border:1px solid var(--border-color); padding:10px; border-radius:8px;">
          ${partsListHtml}
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null, true)">Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-complete-rep">Clôturer la réparation</button>
  `;

  showModal(`Clôture de l'intervention REP-${rep.id.toUpperCase()}`, body, footer);
}

function saveCompleteReparation(e, repId) {
  e.preventDefault();
  const rep = db.reparations.find(r => r.id === repId);
  if (!rep) return;

  const coutReel = parseInt(document.getElementById("rep-cout-reel").value);
  rep.coutReel = coutReel;
  rep.statut = "Terminé";
  
  // Deduct parts stock
  const inputs = document.querySelectorAll(".piece-quantity");
  inputs.forEach(input => {
    const qty = parseInt(input.value);
    const pieceId = input.getAttribute("data-id");
    if (qty > 0) {
      const piece = db.pieces.find(p => p.id === pieceId);
      if (piece) {
        piece.quantiteStock -= qty;
        rep.piecesConsommees.push({ pieceId, quantite: qty });
      }
    }
  });

  // Release Bus status to service
  const bus = db.bus.find(b => b.id === rep.busId);
  if (bus) {
    bus.statut = "En service";
  }

  saveDB(db);
  logAction(db.currentUser.id, "Clôture Réparation", `Dossier REP-${rep.id.toUpperCase()} terminé pour un coût réel de ${coutReel} €.`);
  closeModal(null, true);
  renderReparations();
  checkNotificationAlerts();
}

function deleteReparation(repId) {
  if (confirm("Voulez-vous vraiment supprimer ce dossier de réparation ?")) {
    db.reparations = db.reparations.filter(r => r.id !== repId);
    saveDB(db);
    logAction(db.currentUser.id, "Suppression Réparation", `Dossier de réparation ${repId.toUpperCase()} supprimé.`);
    renderReparations();
  }
}

function editReparationModal(repId) {
  const rep = db.reparations.find(r => r.id === repId);
  if (!rep) return;
  
  const busOptions = db.bus.map(b => `<option value="${b.id}" ${b.id === rep.busId ? 'selected' : ''}>Bus ${b.numero} - ${b.immatriculation} (${b.statut})</option>`).join("");
  const garageOptions = db.garages.filter(g => g.active || g.id === rep.garageId).map(g => {
    const isSelected = g.id === rep.garageId;
    const allowed = canAssignBusToGarage(rep.busId, g.id) || isSelected;
    return `<option value="${g.id}" ${isSelected ? 'selected' : ''} ${allowed ? '' : 'disabled'}>${g.nom} (${getBusGaragePassageCount(rep.busId, g.id)}/${BUS_GARAGE_PASSAGE_LIMIT} quota bus)</option>`;
  }).join("");
  
  const body = `
    <form id="form-edit-reparation" onsubmit="saveEditReparation(event, '${repId}')">
      <div class="form-group">
        <label for="edit-rep-bus">Sélectionner le Bus</label>
        <select class="form-control" id="edit-rep-bus" required>${busOptions}</select>
      </div>
      <div class="form-group">
        <label for="edit-rep-garage">Affecter à un Garage / Atelier</label>
        <select class="form-control" id="edit-rep-garage" required>${garageOptions}</select>
      </div>
      <div class="form-group">
        <label for="edit-rep-desc">Description des travaux à effectuer</label>
        <textarea class="form-control" id="edit-rep-desc" required placeholder="Ex: Vidange complète, changement disques de freins...">${rep.description}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="edit-rep-date-deb">Date de Début</label>
          <input type="date" class="form-control" id="edit-rep-date-deb" value="${rep.dateDebut}" required>
        </div>
        <div class="form-group">
          <label for="edit-rep-date-fin">Date de Fin Prévue</label>
          <input type="date" class="form-control" id="edit-rep-date-fin" value="${rep.dateFinPrevue}" required>
        </div>
      </div>
      <div class="form-group">
        <label for="edit-rep-cout">Estimation du Coût (€)</label>
        <input type="number" class="form-control" id="edit-rep-cout" min="0" value="${rep.coutEstime}" required>
      </div>
      ${rep.statut === 'Terminé' ? `
      <div class="form-group">
        <label for="edit-rep-cout-reel">Coût Réel Final (€)</label>
        <input type="number" class="form-control" id="edit-rep-cout-reel" min="0" value="${rep.coutReel}" required>
      </div>
      ` : ''}
    </form>
  `;
  
  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null, true)">Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-edit-reparation">Enregistrer les modifications</button>
  `;
  
  showModal(`Modifier le dossier de réparation REP-${rep.id.toUpperCase()}`, body, footer);

  const editRepBus = document.getElementById("edit-rep-bus");
  const editRepGarage = document.getElementById("edit-rep-garage");

  function refreshEditGarageOptions() {
    const selectedBusId = editRepBus.value;
    const availableGarages = db.garages.filter(g => g.active || g.id === rep.garageId);
    const optionsHtml = availableGarages.map(g => {
      const isSelected = g.id === editRepGarage.value || g.id === rep.garageId;
      const allowed = canAssignBusToGarage(selectedBusId, g.id) || g.id === rep.garageId;
      const passCount = getBusGaragePassageCount(selectedBusId, g.id);
      return `<option value="${g.id}" ${isSelected ? 'selected' : ''} ${allowed ? '' : 'disabled'}>${g.nom} (${passCount}/${BUS_GARAGE_PASSAGE_LIMIT} quota bus)</option>`;
    }).join("");

    editRepGarage.innerHTML = optionsHtml || '<option value="">Aucun garage disponible pour ce bus</option>';
    if (!optionsHtml) editRepGarage.disabled = true;
    else editRepGarage.disabled = false;
  }

  editRepBus.addEventListener("change", refreshEditGarageOptions);
  refreshEditGarageOptions();
}

function saveEditReparation(e, repId) {
  e.preventDefault();
  const rep = db.reparations.find(r => r.id === repId);
  if (!rep) return;
  
  const busId = document.getElementById("edit-rep-bus").value;
  const garageId = document.getElementById("edit-rep-garage").value;
  const description = document.getElementById("edit-rep-desc").value;
  const dateDebut = document.getElementById("edit-rep-date-deb").value;
  const dateFinPrevue = document.getElementById("edit-rep-date-fin").value;
  const coutEstime = parseInt(document.getElementById("edit-rep-cout").value);

  if (!canAssignBusToGarage(busId, garageId) && garageId !== rep.garageId) {
    alert(`Le bus a déjà atteint le quota de ${BUS_GARAGE_PASSAGE_LIMIT} passages dans ce garage. Sélectionnez un autre garage.`);
    return;
  }
  
  rep.busId = busId;
  rep.garageId = garageId;
  rep.description = description;
  rep.dateDebut = dateDebut;
  rep.dateFinPrevue = dateFinPrevue;
  rep.coutEstime = coutEstime;
  
  if (rep.statut === 'Terminé') {
    const coutReel = parseInt(document.getElementById("edit-rep-cout-reel").value);
    rep.coutReel = coutReel;
  }
  
  saveDB(db);
  logAction(db.currentUser.id, "Modification Réparation", `Dossier REP-${rep.id.toUpperCase()} modifié.`);
  closeModal(null, true);
  renderReparations();
}


/* ==========================================================================
   MODULE 3: GESTION DE LA PEINTURE
   ========================================================================== */

function renderPeinture() {
  const tbody = document.getElementById("peinture-table-body");
  tbody.innerHTML = "";
  
  if (db.peinture.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;" class="text-muted">Aucune fiche de peinture enregistrée.</td></tr>`;
    return;
  }

  db.peinture.forEach(p => {
    const bus = db.bus.find(b => b.id === p.busId);
    const total = p.coutMatiere + p.coutMainOeuvre;
    const badge = p.statut === "Terminé" ? "success" : "info";
    
    let actions = ``;
    if (db.currentUser.role !== 'lecteur') {
      if (p.statut === "En cours") {
        actions += `<button class="btn btn-success btn-sm" onclick="completePeinture('${p.id}')">Clôturer</button> `;
      }
      actions += `<button class="btn btn-danger btn-sm" onclick="deletePeinture('${p.id}')"><i data-lucide="trash-2"></i></button>`;
    } else {
      actions = `<span class="text-muted">-</span>`;
    }

    tbody.innerHTML += `
      <tr>
        <td><strong>PT-${p.id.toUpperCase()}</strong></td>
        <td>${p.devisRef}</td>
        <td>
          <div style="font-weight:600;">Bus ${bus ? bus.numero : 'Inconnu'}</div>
          <div class="list-meta">${bus ? bus.immatriculation : ''}</div>
        </td>
        <td>${p.typePeinture}</td>
        <td>${p.surfaceM2} m²</td>
        <td>${p.quantiteL} L</td>
        <td>${p.coutMatiere} €</td>
        <td>${p.coutMainOeuvre} €</td>
        <td><strong>${total} €</strong></td>
        <td><span class="badge badge-${badge}">${p.statut}</span></td>
        <td>${actions}</td>
      </tr>
    `;
  });

  lucide.createIcons();
}

function openNewPeintureModal() {
  const busOptions = db.bus.map(b => `<option value="${b.id}">Bus ${b.numero} - ${b.immatriculation}</option>`).join("");
  const repOptions = db.reparations.filter(r => r.statut === "En cours").map(r => `<option value="${r.id}">REP-${r.id.toUpperCase()} - ${r.description}</option>`).join("");
  
  const body = `
    <form id="form-peinture" onsubmit="saveNewPeinture(event)">
      <div class="form-row">
        <div class="form-group">
          <label for="pt-bus">Bus</label>
          <select class="form-control" id="pt-bus" required>${busOptions}</select>
        </div>
        <div class="form-group">
          <label for="pt-rep">Dossier Réparation associé</label>
          <select class="form-control" id="pt-rep">${repOptions}<option value="">Aucun</option></select>
        </div>
      </div>
      <div class="form-group">
        <label for="pt-devis">Référence Devis Peinture</label>
        <input type="text" class="form-control" id="pt-devis" placeholder="Ex: DEV-2026-105" required>
      </div>
      <div class="form-group">
        <label for="pt-type">Type de Peinture</label>
        <input type="text" class="form-control" id="pt-type" placeholder="Ex: Polyuréthane Satiné RATP" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="pt-surface">Surface à peindre (m²)</label>
          <input type="number" class="form-control" id="pt-surface" min="1" step="0.5" required oninput="autoCalculatePaint()">
        </div>
        <div class="form-group">
          <label for="pt-quantite">Volume Estimé (Litres)</label>
          <input type="number" class="form-control" id="pt-quantite" min="0.5" step="0.1" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="pt-matiere">Coût Estimé Matières (€)</label>
          <input type="number" class="form-control" id="pt-matiere" min="0" required>
        </div>
        <div class="form-group">
          <label for="pt-mo">Coût Estimé Main d'Œuvre (€)</label>
          <input type="number" class="form-control" id="pt-mo" min="0" required>
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null, true)">Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-peinture">Valider et enregistrer</button>
  `;

  showModal("Création Fiche Peinture", body, footer);
}

// Auto calculation helper based on settings
function autoCalculatePaint() {
  const surface = parseFloat(document.getElementById("pt-surface").value) || 0;
  if (surface > 0) {
    // Estimations: 1 liter covers ~1.5m² average in multiple layers
    const litres = (surface / 1.5).toFixed(1);
    document.getElementById("pt-quantite").value = litres;
    
    // Estimate cost based on parameters
    const hourlyCost = db.settings.coutMainOeuvreHoraire;
    // Estimate 2.5 hours per m² including preparation/drying
    const estimatedHours = surface * 2.5;
    document.getElementById("pt-mo").value = Math.round(estimatedHours * hourlyCost);
    
    // Estimate paint cost: ~20€ per liter
    document.getElementById("pt-matiere").value = Math.round(litres * 20);
  }
}

function saveNewPeinture(e) {
  e.preventDefault();
  
  const busId = document.getElementById("pt-bus").value;
  const reparationId = document.getElementById("pt-rep").value;
  const devisRef = document.getElementById("pt-devis").value;
  const typePeinture = document.getElementById("pt-type").value;
  const surfaceM2 = parseFloat(document.getElementById("pt-surface").value);
  const quantiteL = parseFloat(document.getElementById("pt-quantite").value);
  const coutMatiere = parseInt(document.getElementById("pt-matiere").value);
  const coutMainOeuvre = parseInt(document.getElementById("pt-mo").value);

  const newPt = {
    id: "pt" + (db.peinture.length + 1),
    reparationId,
    busId,
    devisRef,
    typePeinture,
    surfaceM2,
    quantiteL,
    coutMatiere,
    coutMainOeuvre,
    statut: "En cours"
  };

  db.peinture.push(newPt);
  saveDB(db);
  logAction(db.currentUser.id, "Ajout Fiche Peinture", `Devis ${devisRef} enregistré pour le bus ${db.bus.find(b => b.id === busId).numero}`);
  closeModal(null, true);
  renderPeinture();
}

function completePeinture(peintId) {
  const pt = db.peinture.find(p => p.id === peintId);
  if (pt) {
    pt.statut = "Terminé";
    saveDB(db);
    logAction(db.currentUser.id, "Clôture Peinture", `Fiche peinture PT-${pt.id.toUpperCase()} marquée comme terminée.`);
    renderPeinture();
  }
}

function deletePeinture(peintId) {
  if (confirm("Supprimer cette fiche peinture ?")) {
    db.peinture = db.peinture.filter(p => p.id !== peintId);
    saveDB(db);
    logAction(db.currentUser.id, "Suppression Peinture", `Fiche peinture ${peintId.toUpperCase()} supprimée.`);
    renderPeinture();
  }
}


/* ==========================================================================
   MODULE 4: INCIDENTS
   ========================================================================== */

function renderIncidents() {
  const tbody = document.getElementById("incidents-table-body");
  tbody.innerHTML = "";
  
  if (db.incidents.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;" class="text-muted">Aucun incident déclaré.</td></tr>`;
    return;
  }

  db.incidents.forEach(inc => {
    const bus = db.bus.find(b => b.id === inc.busId);
    const chauffeur = db.chauffeurs.find(c => c.id === inc.chauffeurId);
    
    const badgePriorite = inc.priorite === "Haute" ? "danger" : inc.priorite === "Moyenne" ? "warning" : "info";
    const badgeStatut = inc.statut === "Résolu" ? "success" : inc.statut === "En cours" ? "info" : "warning";
    const carrosserieJustification = inc.carrosserieRef
      ? `<span class="badge badge-success">Facture ${excelEsc(inc.factureRef || "-")}</span><br><small>${excelEsc(inc.garageCarrosserie || "Garage non renseigné")} (${excelMoney(inc.coutCarrosserie || 0)} $)</small>`
      : `<span class="text-muted">Non justifié</span>`;
    
    const photoIcon = inc.photo ? `<img src="${inc.photo}" alt="Incident Photo" style="width: 50px; height: 35px; object-fit: cover; border-radius: 4px; cursor: pointer;" onclick="viewPhoto('${inc.photo}')">` : `<span class="text-muted">Aucune</span>`;
    
    let actions = ``;
    if (db.currentUser.role !== 'lecteur') {
      if (inc.statut !== "Résolu") {
        actions += `<button class="btn btn-success btn-sm" onclick="resolveIncident('${inc.id}')">Résoudre</button> `;
      }
      actions += `<button class="btn btn-danger btn-sm" onclick="deleteIncident('${inc.id}')"><i data-lucide="trash-2"></i></button>`;
    } else {
      actions = `<span class="text-muted">-</span>`;
    }

    tbody.innerHTML += `
      <tr>
        <td>${inc.date}</td>
        <td>
          <div style="font-weight:600;">Bus ${bus ? bus.numero : 'Inconnu'}</div>
          <div class="list-meta">${bus ? bus.immatriculation : ''}</div>
        </td>
        <td>${chauffeur ? (chauffeur.prenom + " " + chauffeur.nom) : 'Inconnu'}</td>
        <td>
          <div style="font-weight:600;">${inc.titre}</div>
          <div class="text-muted" style="font-size:0.8rem; margin-top:2px;">${inc.description}</div>
        </td>
        <td><span class="badge badge-${badgePriorite}">${inc.priorite}</span></td>
        <td><span class="badge badge-${badgeStatut}">${inc.statut}</span></td>
        <td>${carrosserieJustification}</td>
        <td>${photoIcon}</td>
        <td>${actions}</td>
      </tr>
    `;
  });

  lucide.createIcons();
}

function readSelectedImageFile(fileInput) {
  return new Promise((resolve, reject) => {
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
      resolve("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      reject(new Error("Le fichier sélectionné n'est pas une image valide."));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Impossible de lire l'image sélectionnée."));
    reader.readAsDataURL(file);
  });
}

function viewPhoto(url) {
  showModal(
    "Photo de l'incident",
    `<img src="${url}" alt="Incident" style="width:100%; max-height:400px; object-fit:contain; border-radius:8px;">`,
    `<button class="btn btn-secondary" onclick="closeModal(null, true)">Fermer</button>`
  );
}

function openNewIncidentModal() {
  const busOptions = db.bus.map(b => `<option value="${b.id}">Bus ${b.numero} - ${b.immatriculation}</option>`).join("");
  const chauffeurOptions = db.chauffeurs.map(c => `<option value="${c.id}">${c.prenom} ${c.nom}</option>`).join("");
  
  const body = `
    <form id="form-incident" onsubmit="saveNewIncident(event)">
      <div class="form-row">
        <div class="form-group">
          <label for="inc-bus">Bus concerné</label>
          <select class="form-control" id="inc-bus" required>${busOptions}</select>
        </div>
        <div class="form-group">
          <label for="inc-ch">Chauffeur en service</label>
          <select class="form-control" id="inc-ch" required>${chauffeurOptions}</select>
        </div>
      </div>
      <div class="form-group">
        <label for="inc-titre">Titre de l'incident</label>
        <input type="text" class="form-control" id="inc-titre" placeholder="Ex: Rétroviseur cassé, surchauffe moteur..." required>
      </div>
      <div class="form-group">
        <label for="inc-desc">Description détaillée</label>
        <textarea class="form-control" id="inc-desc" required placeholder="Décrivez les circonstances du sinistre..."></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="inc-date">Date de l'événement</label>
          <input type="date" class="form-control" id="inc-date" value="2026-07-13" required>
        </div>
        <div class="form-group">
          <label for="inc-prio">Niveau de Priorité</label>
          <select class="form-control" id="inc-prio" required>
            <option value="Faible">Faible (Roule toujours)</option>
            <option value="Moyenne">Moyenne (A planifier)</option>
            <option value="Haute">Haute (Arrêt immédiat)</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label for="inc-photo-file">Photo de l'incident (Optionnel)</label>
        <input type="file" class="form-control" id="inc-photo-file" accept="image/*">
        <small class="text-muted" style="display:block; margin:8px 0 6px;">ou bien saisissez un lien externe</small>
        <input type="url" class="form-control" id="inc-photo-url" placeholder="https://images.unsplash.com/photo-...">
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null, true)">Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-incident">Déclarer l'incident</button>
  `;

  showModal("Déclarer un Incident / Sinistre", body, footer);
}

async function saveNewIncident(e) {
  e.preventDefault();
  
  const busId = document.getElementById("inc-bus").value;
  const chauffeurId = document.getElementById("inc-ch").value;
  const titre = document.getElementById("inc-titre").value;
  const description = document.getElementById("inc-desc").value;
  const date = document.getElementById("inc-date").value;
  const priorite = document.getElementById("inc-prio").value;

  let photo = "";
  try {
    photo = (await readSelectedImageFile(document.getElementById("inc-photo-file"))) || document.getElementById("inc-photo-url").value.trim();
  } catch (error) {
    alert(error.message || "Une erreur s'est produite sur la photo.");
    return;
  }

  const newInc = {
    id: "in" + (db.incidents.length + 1),
    busId,
    chauffeurId,
    titre,
    description,
    date,
    priorite,
    statut: "En attente",
    photo,
    carrosserieRef: "",
    factureRef: "",
    coutCarrosserie: 0,
    garageCarrosserie: ""
  };

  // Change bus status to Hors Service if incident is High priority
  if (priorite === "Haute") {
    const bus = db.bus.find(b => b.id === busId);
    if (bus) bus.statut = "Hors service";
  }

  db.incidents.push(newInc);
  saveDB(db);
  logAction(db.currentUser.id, "Déclaration Incident", `Nouvel incident de priorité ${priorite} sur le bus ${db.bus.find(b => b.id === busId).numero}`);
  closeModal(null, true);
  renderIncidents();
  checkNotificationAlerts();
}

function resolveIncident(incId) {
  const inc = db.incidents.find(i => i.id === incId);
  if (inc) {
    inc.statut = "Résolu";
    
    // Put back bus into active service if it was HS
    const bus = db.bus.find(b => b.id === inc.busId);
    if (bus && bus.statut === "Hors service") {
      bus.statut = "En service";
    }
    
    saveDB(db);
    logAction(db.currentUser.id, "Résolution Incident", `L'incident ${incId.toUpperCase()} a été résolu.`);
    renderIncidents();
    checkNotificationAlerts();
  }
}

function deleteIncident(incId) {
  if (confirm("Supprimer cet incident du registre ?")) {
    db.incidents = db.incidents.filter(i => i.id !== incId);
    saveDB(db);
    logAction(db.currentUser.id, "Suppression Incident", `L'incident ${incId.toUpperCase()} a été supprimé.`);
    renderIncidents();
  }
}


/* ==========================================================================
   MODULE 5: PLANNING & CALENDRIER
   ========================================================================== */

function renderPlanning() {
  // Calendar Render
  const grid = document.getElementById("calendar-grid");
  const calTitle = document.getElementById("calendar-title");
  
  grid.innerHTML = "";
  
  // Set Calendar Title
  const monthsStr = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  calTitle.textContent = `${monthsStr[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

  // Calendar Header Days (Lu, Ma, Me...)
  const headerDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  headerDays.forEach(day => {
    grid.innerHTML += `<div class="calendar-header-day">${day}</div>`;
  });

  // Calculate day offsets
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  
  // First day of month (0 = Sunday, 1 = Monday...)
  let firstDay = new Date(year, month, 1).getDay();
  // Adjust to Monday = 0
  firstDay = firstDay === 0 ? 6 : firstDay - 1;
  
  const totalDays = new Date(year, month + 1, 0).getDate();
  
  // Draw empty cells for offset
  for (let i = 0; i < firstDay; i++) {
    grid.innerHTML += `<div></div>`;
  }

  // Draw days
  for (let day = 1; day <= totalDays; day++) {
    const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // Find active repairs on this day
    const dayReparations = db.reparations.filter(r => {
      return dayStr >= r.dateDebut && dayStr <= r.dateFinPrevue;
    });

    let eventsHtml = "";
    dayReparations.forEach(r => {
      const bus = db.bus.find(b => b.id === r.busId);
      const isPaint = r.description.toLowerCase().includes("peinture");
      const color = isPaint ? "var(--color-warning)" : r.statut === "Terminé" ? "var(--color-success)" : "var(--color-primary)";
      eventsHtml += `
        <div class="calendar-event" style="background-color: ${color};" onclick="viewReparationInfo('${r.id}')">
          B${bus ? bus.numero : '??'} : ${r.description}
        </div>
      `;
    });

    const isToday = day === 13 && month === 6 && year === 2026; // Highlight today (simulated date)
    grid.innerHTML += `
      <div class="calendar-day ${isToday ? 'today' : ''}">
        <span class="calendar-day-num">${day}</span>
        <div style="display:flex; flex-direction:column; gap:4px; overflow-y:auto; flex:1;">
          ${eventsHtml}
        </div>
      </div>
    `;
  }

  // Render Garages Occupancy progress bars
  const occupancyContainer = document.getElementById("garages-occupancy-list");
  occupancyContainer.innerHTML = "";
  
  db.garages.forEach(g => {
    // count current ongoing repairs
    const activeCount = db.reparations.filter(r => r.garageId === g.id && (r.statut === "En cours" || r.statut === "En attente")).length;
    const rate = Math.round((activeCount / g.quotaMax) * 100);
    const color = rate > 90 ? "var(--color-danger)" : rate > 60 ? "var(--color-warning)" : "var(--color-success)";
    
    occupancyContainer.innerHTML += `
      <div>
        <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;">
          <span><strong>${g.nom}</strong></span>
          <span>${activeCount} / ${g.quotaMax} (${rate}%)</span>
        </div>
        <div style="background-color:rgba(255,255,255,0.05); height:8px; border-radius:4px; overflow:hidden;">
          <div style="background-color:${color}; width:${Math.min(rate, 100)}%; height:100%; border-radius:4px; transition: width 0.3s ease;"></div>
        </div>
      </div>
    `;
  });

  lucide.createIcons();
}

function viewReparationInfo(repId) {
  const r = db.reparations.find(rep => rep.id === repId);
  if (!r) return;
  const bus = db.bus.find(b => b.id === r.busId);
  const garage = db.garages.find(g => g.id === r.garageId);

  const body = `
    <div style="line-height:1.6;">
      <p><strong>Code Dossier :</strong> REP-${r.id.toUpperCase()}</p>
      <p><strong>Véhicule :</strong> Bus ${bus ? bus.numero : 'Inconnu'} (${bus ? bus.immatriculation : ''})</p>
      <p><strong>Atelier :</strong> ${garage ? garage.nom : 'Non affecté'}</p>
      <p><strong>Description :</strong> ${r.description}</p>
      <p><strong>Période :</strong> Du ${r.dateDebut} au ${r.dateFinPrevue}</p>
      <p><strong>Coût Estimé :</strong> ${r.coutEstime} €</p>
      <p><strong>Statut :</strong> <span class="badge badge-${r.statut === 'Terminé' ? 'success' : 'warning'}">${r.statut}</span></p>
    </div>
  `;

  showModal(
    "Détail de l'intervention",
    body,
    `<button class="btn btn-secondary" onclick="closeModal(null, true)">Fermer</button>`
  );
}

function prevMonth() {
  currentMonth.setMonth(currentMonth.getMonth() - 1);
  renderPlanning();
}

function nextMonth() {
  currentMonth.setMonth(currentMonth.getMonth() + 1);
  renderPlanning();
}


/* ==========================================================================
   MODULE 6: VEHICULES (BUS)
   ========================================================================== */

function renderBus() {
  const tbody = document.getElementById("bus-table-body");
  tbody.innerHTML = "";
  
  if (db.bus.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;" class="text-muted">Aucun bus enregistré.</td></tr>`;
    return;
  }

  db.bus.forEach(b => {
    let badge = "muted";
    if (b.statut === "En service") badge = "success";
    else if (b.statut === "En réparation") badge = "primary";
    else if (b.statut === "En peinture") badge = "warning";
    else if (b.statut === "Hors service") badge = "danger";
    
    const docs = b.documents ? b.documents.map(d => `<a href="#" style="color:var(--color-secondary); text-decoration:none; margin-right:5px; font-size:0.75rem;"><i data-lucide="file-text" style="width:12px; height:12px; vertical-align:middle;"></i> ${d}</a>`).join("") : "Aucun";

    let actions = ``;
    if (db.currentUser.role !== 'lecteur') {
      actions += `<button class="btn btn-secondary btn-sm" onclick="editBusModal('${b.id}')"><i data-lucide="edit"></i></button> `;
      actions += `<button class="btn btn-danger btn-sm" onclick="deleteBus('${b.id}')"><i data-lucide="trash-2"></i></button>`;
    } else {
      actions = `<span class="text-muted">-</span>`;
    }

    tbody.innerHTML += `
      <tr>
        <td><strong>N° ${b.numero}</strong></td>
        <td>${b.immatriculation}</td>
        <td>${b.marque} ${b.modele}</td>
        <td>${b.annee}</td>
        <td>${b.kilometrage.toLocaleString('fr-FR')} km</td>
        <td>${b.motorisation}</td>
        <td><div style="display:flex; flex-direction:column; gap:2px;">${docs}</div></td>
        <td><span class="badge badge-${badge}">${b.statut}</span></td>
        <td><div style="display:flex; gap:4px;">${actions}</div></td>
      </tr>
    `;
  });

  lucide.createIcons();
}

function openNewBusModal() {
  const body = `
    <form id="form-bus" onsubmit="saveNewBus(event)">
      <div class="form-row">
        <div class="form-group">
          <label for="bus-num">Numéro de Parc</label>
          <input type="text" class="form-control" id="bus-num" placeholder="Ex: 102" required>
        </div>
        <div class="form-group">
          <label for="bus-immat">Immatriculation</label>
          <input type="text" class="form-control" id="bus-immat" placeholder="Ex: XX-123-XX" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="bus-marque">Marque</label>
          <input type="text" class="form-control" id="bus-marque" placeholder="Ex: Mercedes-Benz" required>
        </div>
        <div class="form-group">
          <label for="bus-modele">Modèle</label>
          <input type="text" class="form-control" id="bus-modele" placeholder="Ex: Citaro" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="bus-annee">Année</label>
          <input type="number" class="form-control" id="bus-annee" value="2020" min="2000" max="2027" required>
        </div>
        <div class="form-group">
          <label for="bus-km">Kilométrage Actuel</label>
          <input type="number" class="form-control" id="bus-km" min="0" required>
        </div>
      </div>
      <div class="form-group">
        <label for="bus-motor">Motorisation</label>
        <select class="form-control" id="bus-motor" required>
          <option value="Diesel">Diesel (Euro 6)</option>
          <option value="GNV">Gaz Naturel (GNV)</option>
          <option value="Hybride">Hybride</option>
          <option value="Électrique">100% Électrique</option>
        </select>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null, true)">Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-bus">Ajouter le bus</button>
  `;

  showModal("Ajouter un Véhicule au Parc", body, footer);
}

function saveNewBus(e) {
  e.preventDefault();
  
  const numero = document.getElementById("bus-num").value;
  const immatriculation = document.getElementById("bus-immat").value;
  const marque = document.getElementById("bus-marque").value;
  const modele = document.getElementById("bus-modele").value;
  const annee = parseInt(document.getElementById("bus-annee").value);
  const kilometrage = parseInt(document.getElementById("bus-km").value);
  const motorisation = document.getElementById("bus-motor").value;

  const newBus = {
    id: "b" + (db.bus.length + 1),
    numero,
    immatriculation,
    marque,
    modele,
    annee,
    kilometrage,
    motorisation,
    statut: "En service",
    documents: ["carte_grise_" + numero + ".pdf"]
  };

  db.bus.push(newBus);
  saveDB(db);
  logAction(db.currentUser.id, "Ajout Bus", `Bus N°${numero} (${immatriculation}) ajouté.`);
  closeModal(null, true);
  renderBus();
}

function deleteBus(busId) {
  if (confirm("Supprimer ce véhicule du parc automobile ?")) {
    db.bus = db.bus.filter(b => b.id !== busId);
    saveDB(db);
    logAction(db.currentUser.id, "Suppression Bus", `Bus ${busId} supprimé.`);
    renderBus();
  }
}

function editBusModal(busId) {
  const bus = db.bus.find(b => b.id === busId);
  if (!bus) return;
  
  const body = `
    <form id="form-edit-bus" onsubmit="saveEditBus(event, '${busId}')">
      <div class="form-row">
        <div class="form-group">
          <label for="edit-bus-num">Numéro de Parc</label>
          <input type="text" class="form-control" id="edit-bus-num" value="${bus.numero}" required>
        </div>
        <div class="form-group">
          <label for="edit-bus-immat">Immatriculation</label>
          <input type="text" class="form-control" id="edit-bus-immat" value="${bus.immatriculation}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="edit-bus-marque">Marque</label>
          <input type="text" class="form-control" id="edit-bus-marque" value="${bus.marque}" required>
        </div>
        <div class="form-group">
          <label for="edit-bus-modele">Modèle</label>
          <input type="text" class="form-control" id="edit-bus-modele" value="${bus.modele}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="edit-bus-annee">Année</label>
          <input type="number" class="form-control" id="edit-bus-annee" value="${bus.annee}" min="2000" max="2027" required>
        </div>
        <div class="form-group">
          <label for="edit-bus-km">Kilométrage Actuel</label>
          <input type="number" class="form-control" id="edit-bus-km" value="${bus.kilometrage}" min="0" required>
        </div>
      </div>
      <div class="form-group">
        <label for="edit-bus-motor">Motorisation</label>
        <select class="form-control" id="edit-bus-motor" required>
          <option value="Diesel" ${bus.motorisation.includes('Diesel') ? 'selected' : ''}>Diesel (Euro 6)</option>
          <option value="GNV" ${bus.motorisation.includes('GNV') ? 'selected' : ''}>Gaz Naturel (GNV)</option>
          <option value="Hybride" ${bus.motorisation.includes('Hybride') ? 'selected' : ''}>Hybride</option>
          <option value="Électrique" ${bus.motorisation.includes('Électrique') ? 'selected' : ''}>100% Électrique</option>
        </select>
      </div>
      <div class="form-group">
        <label for="edit-bus-statut">Statut du Véhicule</label>
        <select class="form-control" id="edit-bus-statut" required>
          <option value="En service" ${bus.statut === 'En service' ? 'selected' : ''}>En service</option>
          <option value="En réparation" ${bus.statut === 'En réparation' ? 'selected' : ''}>En réparation</option>
          <option value="En peinture" ${bus.statut === 'En peinture' ? 'selected' : ''}>En peinture</option>
          <option value="Hors service" ${bus.statut === 'Hors service' ? 'selected' : ''}>Hors service</option>
        </select>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null, true)">Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-edit-bus">Enregistrer les modifications</button>
  `;

  showModal(`Modifier le bus N° ${bus.numero}`, body, footer);
}

function saveEditBus(e, busId) {
  e.preventDefault();
  const bus = db.bus.find(b => b.id === busId);
  if (!bus) return;
  
  const numero = document.getElementById("edit-bus-num").value;
  const immatriculation = document.getElementById("edit-bus-immat").value;
  const marque = document.getElementById("edit-bus-marque").value;
  const modele = document.getElementById("edit-bus-modele").value;
  const annee = parseInt(document.getElementById("edit-bus-annee").value);
  const kilometrage = parseInt(document.getElementById("edit-bus-km").value);
  const motorisation = document.getElementById("edit-bus-motor").value;
  const statut = document.getElementById("edit-bus-statut").value;

  bus.numero = numero;
  bus.immatriculation = immatriculation;
  bus.marque = marque;
  bus.modele = modele;
  bus.annee = annee;
  bus.kilometrage = kilometrage;
  bus.motorisation = motorisation;
  bus.statut = statut;

  saveDB(db);
  logAction(db.currentUser.id, "Modification Bus", `Bus N°${numero} (${immatriculation}) mis à jour.`);
  closeModal(null, true);
  renderBus();
}


/* ==========================================================================
   MODULE 7: GARAGES
   ========================================================================== */

function renderGarages() {
  const tbody = document.getElementById("garages-table-body");
  tbody.innerHTML = "";

  db.garages.forEach(g => {
    const passCount = getGaragePassageCount(g.id);
    const passLimit = getGaragePassLimit(g);
    const ongoing = db.reparations.filter(r => r.garageId === g.id && (r.statut === "En cours" || r.statut === "En attente")).length;
    
    let actions = ``;
    if (db.currentUser.role !== 'lecteur') {
      actions += `<button class="btn btn-secondary btn-sm" onclick="editGarageModal('${g.id}')"><i data-lucide="edit"></i></button> `;
      actions += `<button class="btn btn-danger btn-sm" onclick="deleteGarage('${g.id}')"><i data-lucide="trash-2"></i></button>`;
    } else {
      actions = `<span class="text-muted">-</span>`;
    }

    tbody.innerHTML += `
      <tr>
        <td><strong>${g.nom}</strong></td>
        <td>${g.adresse}</td>
        <td>${g.telephone}</td>
        <td><strong>${g.quotaMax} bus max</strong></td>
        <td><strong>${passCount}/${passLimit}</strong></td>
        <td>
          <span style="font-weight:600; color:${ongoing >= g.quotaMax ? 'var(--color-danger)' : 'var(--text-main)'}">${ongoing} bus</span>
        </td>
        <td>
          <span class="badge badge-${g.active ? 'success' : 'muted'}">${g.active ? 'Actif' : 'Inactif'}</span>
        </td>
        <td><div style="display:flex; gap:4px;">${actions}</div></td>
      </tr>
    `;
  });

  lucide.createIcons();
}

function openNewGarageModal() {
  const body = `
    <form id="form-garage" onsubmit="saveNewGarage(event)">
      <div class="form-group">
        <label for="gar-nom">Nom de l'atelier / Garage</label>
        <input type="text" class="form-control" id="gar-nom" placeholder="Ex: Atelier Carrosserie Est" required>
      </div>
      <div class="form-group">
        <label for="gar-adresse">Adresse</label>
        <input type="text" class="form-control" id="gar-adresse" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="gar-tel">Téléphone</label>
          <input type="text" class="form-control" id="gar-tel" placeholder="01 XX XX XX XX" required>
        </div>
        <div class="form-group">
          <label for="gar-quota">Capacité d'accueil (Quota)</label>
          <input type="number" class="form-control" id="gar-quota" min="1" max="10" value="3" required>
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null, true)">Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-garage">Ajouter le garage</button>
  `;

  showModal("Ajouter un Garage partenaire", body, footer);
}

function saveNewGarage(e) {
  e.preventDefault();
  
  const nom = document.getElementById("gar-nom").value;
  const adresse = document.getElementById("gar-adresse").value;
  const telephone = document.getElementById("gar-tel").value;
  const quotaMax = parseInt(document.getElementById("gar-quota").value);

  const newGar = {
    id: "g" + (db.garages.length + 1),
    nom,
    adresse,
    telephone,
    quotaMax,
    active: true
  };

  db.garages.push(newGar);
  saveDB(db);
  logAction(db.currentUser.id, "Ajout Garage", `Garage ${nom} (Quota: ${quotaMax}) créé.`);
  closeModal(null, true);
  renderGarages();
}

function deleteGarage(garId) {
  if (confirm("Désactiver ce garage ?")) {
    const garage = db.garages.find(g => g.id === garId);
    if (garage) {
      garage.active = false;
      saveDB(db);
      logAction(db.currentUser.id, "Désactivation Garage", `Garage ${garage.nom} désactivé.`);
      renderGarages();
    }
  }
}

function editGarageModal(garId) {
  const garage = db.garages.find(g => g.id === garId);
  if (!garage) return;
  
  const body = `
    <form id="form-edit-garage" onsubmit="saveEditGarage(event, '${garId}')">
      <div class="form-group">
        <label for="edit-gar-nom">Nom de l'atelier / Garage</label>
        <input type="text" class="form-control" id="edit-gar-nom" value="${garage.nom}" required>
      </div>
      <div class="form-group">
        <label for="edit-gar-adresse">Adresse</label>
        <input type="text" class="form-control" id="edit-gar-adresse" value="${garage.adresse}" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="edit-gar-tel">Téléphone</label>
          <input type="text" class="form-control" id="edit-gar-tel" value="${garage.telephone}" required>
        </div>
        <div class="form-group">
          <label for="edit-gar-quota">Capacité d'accueil (Quota)</label>
          <input type="number" class="form-control" id="edit-gar-quota" min="1" max="10" value="${garage.quotaMax}" required>
        </div>
      </div>
      <div class="form-group" style="display:flex; align-items:center; gap:8px;">
        <input type="checkbox" id="edit-gar-active" style="width:18px; height:18px; cursor:pointer;" ${garage.active ? 'checked' : ''}>
        <label for="edit-gar-active" style="margin-bottom:0; cursor:pointer;">Atelier actif</label>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null, true)">Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-edit-garage">Enregistrer les modifications</button>
  `;

  showModal(`Modifier le garage ${garage.nom}`, body, footer);
}

function saveEditGarage(e, garId) {
  e.preventDefault();
  const garage = db.garages.find(g => g.id === garId);
  if (!garage) return;
  
  const nom = document.getElementById("edit-gar-nom").value;
  const adresse = document.getElementById("edit-gar-adresse").value;
  const telephone = document.getElementById("edit-gar-tel").value;
  const quotaMax = parseInt(document.getElementById("edit-gar-quota").value);
  const active = document.getElementById("edit-gar-active").checked;

  garage.nom = nom;
  garage.adresse = adresse;
  garage.telephone = telephone;
  garage.quotaMax = quotaMax;
  garage.active = active;

  saveDB(db);
  logAction(db.currentUser.id, "Modification Garage", `Garage ${nom} (Quota: ${quotaMax}, Actif: ${active}) mis à jour.`);
  closeModal(null, true);
  renderGarages();
}


/* ==========================================================================
   MODULE 8: CHAUFFEURS
   ========================================================================== */

function renderUsers() {
  const tbody = document.getElementById("users-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  db.users.forEach(user => {
    const roleLabel = user.role === 'admin' ? 'Administrateur' :
      user.role === 'chef_atelier' ? 'Chef d\'Atelier' :
      user.role === 'parc_mgr' ? 'Resp. Parc' : 'Lecteur';

    let actions = ``;
    if (db.currentUser.role !== 'lecteur') {
      actions += `<button class="btn btn-secondary btn-sm" onclick="editUserModal('${user.id}')"><i data-lucide="edit"></i></button> `;
      if (user.id !== db.currentUser.id) {
        actions += `<button class="btn btn-danger btn-sm" onclick="deleteUser('${user.id}')"><i data-lucide="trash-2"></i></button>`;
      }
    } else {
      actions = `<span class="text-muted">-</span>`;
    }

    tbody.innerHTML += `
      <tr>
        <td>${user.name}</td>
        <td>${user.username}</td>
        <td>${user.email}</td>
        <td><span class="badge badge-info">${roleLabel}</span></td>
        <td><div style="display:flex; gap:4px;">${actions}</div></td>
      </tr>
    `;
  });

  lucide.createIcons();
}

function openNewUserModal() {
  const body = `
    <form id="form-user" onsubmit="saveNewUser(event)">
      <div class="form-row">
        <div class="form-group">
          <label for="user-name">Nom complet</label>
          <input type="text" class="form-control" id="user-name" required>
        </div>
        <div class="form-group">
          <label for="user-username">Nom d'utilisateur</label>
          <input type="text" class="form-control" id="user-username" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="user-email">Email</label>
          <input type="email" class="form-control" id="user-email" required>
        </div>
        <div class="form-group">
          <label for="user-role">Rôle</label>
          <select class="form-control" id="user-role" required>
            <option value="admin">Administrateur</option>
            <option value="chef_atelier">Chef d'atelier</option>
            <option value="parc_mgr">Responsable Parc</option>
            <option value="lecteur">Lecteur</option>
          </select>
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null, true)">Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-user">Créer l'utilisateur</button>
  `;

  showModal("Ajouter un utilisateur", body, footer);
}

function saveNewUser(e) {
  e.preventDefault();

  const name = document.getElementById("user-name").value.trim();
  const username = document.getElementById("user-username").value.trim();
  const email = document.getElementById("user-email").value.trim();
  const role = document.getElementById("user-role").value;

  if (!name || !username || !email || !role) {
    alert("Tous les champs sont obligatoires pour créer un utilisateur.");
    return;
  }

  if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    alert("Ce nom d'utilisateur existe déjà.");
    return;
  }

  const newUser = {
    id: "u" + (db.users.length + 1),
    username,
    name,
    role,
    email
  };

  db.users.push(newUser);
  saveDB(db);
  populateUserSwitcher();
  logAction(db.currentUser.id, "Ajout utilisateur", `Utilisateur ${name} (${username}) créé avec le rôle ${role}.`);
  closeModal(null, true);
  renderUsers();
}

function editUserModal(userId) {
  const user = db.users.find(u => u.id === userId);
  if (!user) return;

  const body = `
    <form id="form-edit-user" onsubmit="saveEditUser(event, '${user.id}')">
      <div class="form-row">
        <div class="form-group">
          <label for="edit-user-name">Nom complet</label>
          <input type="text" class="form-control" id="edit-user-name" value="${user.name}" required>
        </div>
        <div class="form-group">
          <label for="edit-user-username">Nom d'utilisateur</label>
          <input type="text" class="form-control" id="edit-user-username" value="${user.username}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="edit-user-email">Email</label>
          <input type="email" class="form-control" id="edit-user-email" value="${user.email}" required>
        </div>
        <div class="form-group">
          <label for="edit-user-role">Rôle</label>
          <select class="form-control" id="edit-user-role" required>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrateur</option>
            <option value="chef_atelier" ${user.role === 'chef_atelier' ? 'selected' : ''}>Chef d'atelier</option>
            <option value="parc_mgr" ${user.role === 'parc_mgr' ? 'selected' : ''}>Responsable Parc</option>
            <option value="lecteur" ${user.role === 'lecteur' ? 'selected' : ''}>Lecteur</option>
          </select>
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null, true)">Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-edit-user">Enregistrer</button>
  `;

  showModal(`Modifier l'utilisateur ${user.name}`, body, footer);
}

function saveEditUser(e, userId) {
  e.preventDefault();

  const user = db.users.find(u => u.id === userId);
  if (!user) return;

  const name = document.getElementById("edit-user-name").value.trim();
  const username = document.getElementById("edit-user-username").value.trim();
  const email = document.getElementById("edit-user-email").value.trim();
  const role = document.getElementById("edit-user-role").value;

  if (!name || !username || !email || !role) {
    alert("Tous les champs doivent être remplis.");
    return;
  }

  const duplicate = db.users.some(u => u.id !== userId && u.username.toLowerCase() === username.toLowerCase());
  if (duplicate) {
    alert("Ce nom d'utilisateur est déjà attribué.");
    return;
  }

  user.name = name;
  user.username = username;
  user.email = email;
  user.role = role;

  if (db.currentUser.id === user.id) {
    db.currentUser = { ...user };
    updateUserDisplay();
  }

  saveDB(db);
  populateUserSwitcher();
  logAction(db.currentUser.id, "Modification utilisateur", `Utilisateur ${name} mis à jour.`);
  closeModal(null, true);
  renderUsers();
}

function deleteUser(userId) {
  if (userId === db.currentUser.id) {
    alert("Vous ne pouvez pas supprimer l'utilisateur actuellement connecté.");
    return;
  }

  const user = db.users.find(u => u.id === userId);
  if (!user) return;

  if (!confirm(`Supprimer l'utilisateur ${user.name} (${user.username}) ?`)) return;

  db.users = db.users.filter(u => u.id !== userId);
  saveDB(db);
  populateUserSwitcher();
  logAction(db.currentUser.id, "Suppression utilisateur", `Utilisateur ${user.name} supprimé.`);
  renderUsers();
}

function renderChauffeurs() {
  const tbody = document.getElementById("chauffeurs-table-body");
  tbody.innerHTML = "";

  db.chauffeurs.forEach(c => {
    const bus = db.bus.find(b => b.id === c.busAffecte);
    
    let actions = ``;
    if (db.currentUser.role !== 'lecteur') {
      actions += `<button class="btn btn-secondary btn-sm" onclick="editChauffeurModal('${c.id}')"><i data-lucide="edit"></i></button> `;
      actions += `<button class="btn btn-danger btn-sm" onclick="deleteChauffeur('${c.id}')"><i data-lucide="trash-2"></i></button>`;
    } else {
      actions = `<span class="text-muted">-</span>`;
    }

    tbody.innerHTML += `
      <tr>
        <td><strong>${c.matricule}</strong></td>
        <td>${c.prenom} ${c.nom}</td>
        <td>${c.telephone}</td>
        <td>${bus ? 'Bus ' + bus.numero + ' (' + bus.immatriculation + ')' : '<span class="text-muted">Aucun</span>'}</td>
        <td>
          <span class="badge badge-${c.statut === 'Actif' ? 'success' : 'muted'}">${c.statut}</span>
        </td>
        <td><div style="display:flex; gap:4px;">${actions}</div></td>
      </tr>
    `;
  });

  lucide.createIcons();
}

function normalizeChauffeurText(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function parseChauffeurRowsFromMatrix(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return [];
  const headerIndex = matrix.findIndex(row => Array.isArray(row) && row.some(cell => /nom|prenom|prénom|matricule|telephone|tel|conducteur|chauffeur|bus|affectation/.test(normalizeChauffeurText(cell))));
  if (headerIndex < 0) return [];

  const header = matrix[headerIndex].map(cell => normalizeChauffeurText(cell));
  const indexOf = (patterns) => header.findIndex(entry => patterns.some(pattern => entry.includes(pattern)));

  const colMap = {
    nom: indexOf(["nom", "family", "familly"]),
    prenom: indexOf(["prenom", "prénom", "first", "given"]),
    matricule: indexOf(["matricule", "licence", "badge"]),
    telephone: indexOf(["telephone", "tel", "phone", "mobile"]),
    bus: indexOf(["bus", "affectation", "vehicule", "vehicle"])
  };

  const rows = [];
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (!Array.isArray(row) || !row.some(cell => String(cell ?? "").trim())) continue;

    const nom = String(row[colMap.nom] ?? "").trim();
    const prenom = String(row[colMap.prenom] ?? "").trim();
    const matricule = String(row[colMap.matricule] ?? "").trim();
    const telephone = String(row[colMap.telephone] ?? "").trim();
    const busAffecte = String(row[colMap.bus] ?? "").trim();

    if (!nom && !prenom && !matricule && !telephone) continue;

    rows.push({
      nom: nom || "",
      prenom: prenom || "",
      matricule: matricule || "",
      telephone: telephone || "",
      busAffecte: busAffecte || "",
      statut: "Actif"
    });
  }

  return rows;
}

function parseChauffeurRowsFromText(text) {
  if (!text || !text.trim()) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map(item => ({
        nom: String(item.nom || item.Nom || item.name || "").trim(),
        prenom: String(item.prenom || item.prenom || item.firstName || item.firstname || "").trim(),
        matricule: String(item.matricule || item.matricule || item.code || "").trim(),
        telephone: String(item.telephone || item.tel || item.phone || "").trim(),
        busAffecte: String(item.busAffecte || item.bus || item.vehicule || "").trim(),
        statut: String(item.statut || item.status || "Actif").trim() || "Actif"
      })).filter(row => row.nom || row.prenom || row.matricule || row.telephone);
    }
  } catch (error) {
    // ignore and continue to text parsing
  }

  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [];

  const delimiterCandidates = [";", ",", "\t", "|"];
  const delimiter = delimiterCandidates.reduce((best, candidate) => {
    const firstLine = lines[0];
    const score = firstLine.split(candidate).length;
    if (score > best.score) return { score, candidate };
    return best;
  }, { score: 0, candidate: ";" }).candidate;

  const rows = lines.slice(1).map(line => {
    const values = line.split(delimiter).map(value => value.trim());
    return {
      nom: values[0] || "",
      prenom: values[1] || "",
      matricule: values[2] || "",
      telephone: values[3] || "",
      busAffecte: values[4] || "",
      statut: values[5] || "Actif"
    };
  }).filter(row => row.nom || row.prenom || row.matricule || row.telephone);

  const header = lines[0].split(delimiter).map(value => normalizeChauffeurText(value));
  const colMap = {
    nom: header.findIndex(value => /nom|family|familly/.test(value)),
    prenom: header.findIndex(value => /prenom|prénom|first|given/.test(value)),
    matricule: header.findIndex(value => /matricule|badge|licence/.test(value)),
    telephone: header.findIndex(value => /telephone|tel|phone|mobile/.test(value)),
    bus: header.findIndex(value => /bus|vehicule|affectation|vehicle/.test(value)),
    statut: header.findIndex(value => /statut|status/.test(value))
  };

  if (colMap.nom >= 0 || colMap.prenom >= 0 || colMap.matricule >= 0 || colMap.telephone >= 0) {
    return lines.slice(1).map(line => {
      const values = line.split(delimiter).map(value => value.trim());
      return {
        nom: String(values[colMap.nom] ?? "").trim(),
        prenom: String(values[colMap.prenom] ?? "").trim(),
        matricule: String(values[colMap.matricule] ?? "").trim(),
        telephone: String(values[colMap.telephone] ?? "").trim(),
        busAffecte: String(values[colMap.bus] ?? "").trim(),
        statut: String(values[colMap.statut] ?? "Actif").trim() || "Actif"
      };
    }).filter(row => row.nom || row.prenom || row.matricule || row.telephone);
  }

  return rows;
}

function importChauffeursFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve([]);
      return;
    }

    const ext = String(file.name || "").split(".").pop()?.toLowerCase();
    const isExcelLike = ["xlsx", "xls", "csv"].includes(ext) || ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"].includes(file.type);

    if (isExcelLike) {
      if (typeof XLSX === "undefined") {
        reject(new Error("La bibliothèque Excel n'est pas disponible."));
        return;
      }

      const reader = new FileReader();
      reader.onload = function (event) {
        try {
          const arrayBuffer = event.target.result;
          const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
          const rows = [];

          workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
            rows.push(...parseChauffeurRowsFromMatrix(matrix));
          });

          resolve(rows);
        } catch (error) {
          reject(new Error("Le fichier Excel est invalide ou illisible."));
        }
      };
      reader.onerror = () => reject(new Error("Impossible de lire le fichier Excel."));
      reader.readAsArrayBuffer(file);
      return;
    }

    if (["txt", "json"].includes(ext) || file.type.includes("json") || file.type.includes("text")) {
      const reader = new FileReader();
      reader.onload = function (event) {
        try {
          const text = String(event.target.result || "");
          resolve(parseChauffeurRowsFromText(text));
        } catch (error) {
          reject(new Error("Le fichier texte est invalide."));
        }
      };
      reader.onerror = () => reject(new Error("Impossible de lire le fichier texte."));
      reader.readAsText(file);
      return;
    }

    reject(new Error("Format de fichier non accepté. Utilisez Excel, CSV, TXT ou JSON."));
  });
}

function triggerChauffeurImport() {
  const input = document.getElementById("chauffeur-import-file");
  if (!input) return;
  input.value = "";
  input.click();
}

async function handleChauffeurFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (db.currentUser.role === "lecteur") {
    alert("Vous n'avez pas les droits pour importer des chauffeurs.");
    return;
  }

  try {
    const rows = await importChauffeursFromFile(file);
    if (!rows.length) {
      alert("Aucune donnée de chauffeur détectée dans le fichier sélectionné.");
      return;
    }

    let imported = 0;
    rows.forEach(row => {
      if (!row.nom && !row.prenom && !row.matricule && !row.telephone) return;

      const existing = db.chauffeurs.find(chauffeur => {
        if (row.matricule && chauffeur.matricule && String(chauffeur.matricule).trim().toLowerCase() === String(row.matricule).trim().toLowerCase()) return true;
        if (!row.matricule && chauffeur.nom && chauffeur.prenom) {
          return chauffeur.nom.toLowerCase() === String(row.nom || "").toLowerCase() && chauffeur.prenom.toLowerCase() === String(row.prenom || "").toLowerCase();
        }
        return false;
      });

      const normalizedRow = {
        nom: String(row.nom || "").trim(),
        prenom: String(row.prenom || "").trim(),
        matricule: String(row.matricule || "").trim(),
        telephone: String(row.telephone || "").trim(),
        busAffecte: String(row.busAffecte || "").trim(),
        statut: String(row.statut || "Actif").trim() || "Actif"
      };

      if (existing) {
        Object.assign(existing, normalizedRow);
      } else {
        db.chauffeurs.push({
          id: `c-import-${Date.now()}-${imported}`,
          ...normalizedRow
        });
      }
      imported += 1;
    });

    synchronizeFleetReferences();
    saveDB(db);
    renderChauffeurs();
    logAction(db.currentUser.id, "Import Chauffeurs", `${imported} chauffeur(s) importé(s) depuis ${file.name}.`);
    alert(`${imported} chauffeur(s) importé(s) avec succès.`);
  } catch (error) {
    alert(error.message || "Erreur lors de l'import des chauffeurs.");
  } finally {
    const input = document.getElementById("chauffeur-import-file");
    if (input) input.value = "";
  }
}

function openNewChauffeurModal() {
  const busOptions = db.bus.map(b => `<option value="${b.id}">Bus ${b.numero} - ${b.immatriculation}</option>`).join("");
  
  const body = `
    <form id="form-ch" onsubmit="saveNewChauffeur(event)">
      <div class="form-row">
        <div class="form-group">
          <label for="ch-nom">Nom</label>
          <input type="text" class="form-control" id="ch-nom" required>
        </div>
        <div class="form-group">
          <label for="ch-prenom">Prénom</label>
          <input type="text" class="form-control" id="ch-prenom" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="ch-mat">Matricule</label>
          <input type="text" class="form-control" id="ch-mat" placeholder="Ex: CH-0234" required>
        </div>
        <div class="form-group">
          <label for="ch-tel">Téléphone</label>
          <input type="text" class="form-control" id="ch-tel" placeholder="06 XX XX XX XX" required>
        </div>
      </div>
      <div class="form-group">
        <label for="ch-bus">Affectation Bus principal</label>
        <select class="form-control" id="ch-bus">${busOptions}<option value="">Aucun</option></select>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null, true)">Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-ch">Enregistrer</button>
  `;

  showModal("Ajouter un Chauffeur", body, footer);
}

function saveNewChauffeur(e) {
  e.preventDefault();
  
  const nom = document.getElementById("ch-nom").value;
  const prenom = document.getElementById("ch-prenom").value;
  const matricule = document.getElementById("ch-mat").value;
  const telephone = document.getElementById("ch-tel").value;
  const busAffecte = document.getElementById("ch-bus").value;

  const newCh = {
    id: "c" + (db.chauffeurs.length + 1),
    nom,
    prenom,
    matricule,
    telephone,
    busAffecte: "",
    statut: "Actif"
  };

  db.chauffeurs.push(newCh);
  setChauffeurBusAffectation(newCh, busAffecte);
  saveDB(db);
  logAction(db.currentUser.id, "Ajout Chauffeur", `Conducteur ${prenom} ${nom} enregistré.`);
  closeModal(null, true);
  renderChauffeurs();
}

function deleteChauffeur(chId) {
  if (confirm("Supprimer ce chauffeur ?")) {
    db.chauffeurs = db.chauffeurs.filter(c => c.id !== chId);
    saveDB(db);
    logAction(db.currentUser.id, "Suppression Chauffeur", `Chauffeur ${chId} supprimé.`);
    renderChauffeurs();
  }
}

function editChauffeurModal(chId) {
  const chauffeur = db.chauffeurs.find(c => c.id === chId);
  if (!chauffeur) return;
  
  const busOptions = db.bus.map(b => `<option value="${b.id}" ${b.id === chauffeur.busAffecte ? 'selected' : ''}>Bus ${b.numero} - ${b.immatriculation}</option>`).join("");
  
  const body = `
    <form id="form-edit-ch" onsubmit="saveEditChauffeur(event, '${chId}')">
      <div class="form-row">
        <div class="form-group">
          <label for="edit-ch-nom">Nom</label>
          <input type="text" class="form-control" id="edit-ch-nom" value="${chauffeur.nom}" required>
        </div>
        <div class="form-group">
          <label for="edit-ch-prenom">Prénom</label>
          <input type="text" class="form-control" id="edit-ch-prenom" value="${chauffeur.prenom}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="edit-ch-mat">Matricule</label>
          <input type="text" class="form-control" id="edit-ch-mat" value="${chauffeur.matricule}" required>
        </div>
        <div class="form-group">
          <label for="edit-ch-tel">Téléphone</label>
          <input type="text" class="form-control" id="edit-ch-tel" value="${chauffeur.telephone}" required>
        </div>
      </div>
      <div class="form-group">
        <label for="edit-ch-bus">Affectation Bus principal</label>
        <select class="form-control" id="edit-ch-bus">
          <option value="">Aucun</option>
          ${busOptions}
        </select>
      </div>
      <div class="form-group">
        <label for="edit-ch-statut">Statut Chauffeur</label>
        <select class="form-control" id="edit-ch-statut" required>
          <option value="Actif" ${chauffeur.statut === 'Actif' ? 'selected' : ''}>Actif</option>
          <option value="En congé" ${chauffeur.statut === 'En congé' ? 'selected' : ''}>En congé</option>
          <option value="Inactif" ${chauffeur.statut === 'Inactif' ? 'selected' : ''}>Inactif</option>
        </select>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null, true)">Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-edit-ch">Enregistrer les modifications</button>
  `;

  showModal(`Modifier le chauffeur ${chauffeur.prenom} ${chauffeur.nom}`, body, footer);
}

function saveEditChauffeur(e, chId) {
  e.preventDefault();
  const chauffeur = db.chauffeurs.find(c => c.id === chId);
  if (!chauffeur) return;
  
  const nom = document.getElementById("edit-ch-nom").value;
  const prenom = document.getElementById("edit-ch-prenom").value;
  const matricule = document.getElementById("edit-ch-mat").value;
  const telephone = document.getElementById("edit-ch-tel").value;
  const busAffecte = document.getElementById("edit-ch-bus").value;
  const statut = document.getElementById("edit-ch-statut").value;

  chauffeur.nom = nom;
  chauffeur.prenom = prenom;
  chauffeur.matricule = matricule;
  chauffeur.telephone = telephone;
  setChauffeurBusAffectation(chauffeur, busAffecte);
  chauffeur.statut = statut;

  saveDB(db);
  logAction(db.currentUser.id, "Modification Chauffeur", `Conducteur ${prenom} ${nom} mis à jour.`);
  closeModal(null, true);
  renderChauffeurs();
}


/* ==========================================================================
   MODULE 9: PIECES DETACHEES
   ========================================================================== */

function renderPieces() {
  const tbody = document.getElementById("pieces-table-body");
  tbody.innerHTML = "";

  db.pieces.forEach(p => {
    const prov = db.fournisseurs.find(f => f.id === p.fournisseurId);
    const lowStock = p.quantiteStock <= p.seuilAlerte;
    const badgeStock = lowStock ? "danger" : "success";
    const statusText = lowStock ? "Seuil critique" : "Optimal";
    
    let actions = ``;
    if (db.currentUser.role !== 'lecteur') {
      actions += `<button class="btn btn-secondary btn-sm" onclick="editPieceModal('${p.id}')"><i data-lucide="edit"></i></button> `;
      actions += `<button class="btn btn-danger btn-sm" onclick="deletePiece('${p.id}')"><i data-lucide="trash-2"></i></button>`;
    } else {
      actions = `<span class="text-muted">-</span>`;
    }

    tbody.innerHTML += `
      <tr>
        <td><strong>${p.code}</strong></td>
        <td>${p.designation}</td>
        <td>${p.categorie}</td>
        <td><strong>${p.quantiteStock} pièces</strong></td>
        <td>${p.seuilAlerte}</td>
        <td>${p.prixUnitaire} €</td>
        <td>${prov ? prov.nom : 'Direct'}</td>
        <td><span class="badge badge-${badgeStock}">${statusText}</span></td>
        <td><div style="display:flex; gap:4px;">${actions}</div></td>
      </tr>
    `;
  });

  lucide.createIcons();
}

function openNewPieceModal() {
  const fOptions = db.fournisseurs.map(f => `<option value="${f.id}">${f.nom}</option>`).join("");
  
  const body = `
    <form id="form-piece" onsubmit="saveNewPiece(event)">
      <div class="form-row">
        <div class="form-group">
          <label for="p-code">Code Pièce</label>
          <input type="text" class="form-control" id="p-code" placeholder="Ex: P-MOT-44" required>
        </div>
        <div class="form-group">
          <label for="p-des">Désignation</label>
          <input type="text" class="form-control" id="p-des" placeholder="Ex: Filtre à air" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="p-cat">Catégorie</label>
          <select class="form-control" id="p-cat" required>
            <option value="Moteur">Moteur & Transmission</option>
            <option value="Freinage">Freinage</option>
            <option value="Filtration">Filtration</option>
            <option value="Électricité">Électricité</option>
            <option value="Peinture">Carrosserie / Peinture</option>
            <option value="Autre">Autre</option>
          </select>
        </div>
        <div class="form-group">
          <label for="p-prov">Fournisseur</label>
          <select class="form-control" id="p-prov" required>${fOptions}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="p-qty">Quantité en stock</label>
          <input type="number" class="form-control" id="p-qty" value="10" min="0" required>
        </div>
        <div class="form-group">
          <label for="p-seuil">Seuil d'alerte de réapprovisionnement</label>
          <input type="number" class="form-control" id="p-seuil" value="3" min="1" required>
        </div>
      </div>
      <div class="form-group">
        <label for="p-px">Prix Unitaire (€)</label>
        <input type="number" class="form-control" id="p-px" min="0" required>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null, true)">Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-piece">Enregistrer</button>
  `;

  showModal("Référencer une Pièce Détachée", body, footer);
}

function saveNewPiece(e) {
  e.preventDefault();
  
  const code = document.getElementById("p-code").value;
  const designation = document.getElementById("p-des").value;
  const categorie = document.getElementById("p-cat").value;
  const fournisseurId = document.getElementById("p-prov").value;
  const quantiteStock = parseInt(document.getElementById("p-qty").value);
  const seuilAlerte = parseInt(document.getElementById("p-seuil").value);
  const prixUnitaire = parseFloat(document.getElementById("p-px").value);

  const newP = {
    id: "p" + (db.pieces.length + 1),
    code,
    designation,
    categorie,
    quantiteStock,
    seuilAlerte,
    prixUnitaire,
    fournisseurId
  };

  db.pieces.push(newP);
  saveDB(db);
  logAction(db.currentUser.id, "Ajout Stock Pièce", `Référence ${code} (${designation}) insérée en stock.`);
  closeModal(null, true);
  renderPieces();
  checkNotificationAlerts();
}

function deletePiece(pieceId) {
  if (confirm("Supprimer cette pièce du catalogue ?")) {
    db.pieces = db.pieces.filter(p => p.id !== pieceId);
    saveDB(db);
    logAction(db.currentUser.id, "Suppression Stock Pièce", `Référence de pièce ${pieceId} supprimée.`);
    renderPieces();
  }
}

function editPieceModal(pieceId) {
  const piece = db.pieces.find(p => p.id === pieceId);
  if (!piece) return;
  
  const fOptions = db.fournisseurs.map(f => `<option value="${f.id}" ${f.id === piece.fournisseurId ? 'selected' : ''}>${f.nom}</option>`).join("");
  
  const body = `
    <form id="form-edit-piece" onsubmit="saveEditPiece(event, '${pieceId}')">
      <div class="form-row">
        <div class="form-group">
          <label for="edit-p-code">Code Pièce</label>
          <input type="text" class="form-control" id="edit-p-code" value="${piece.code}" required>
        </div>
        <div class="form-group">
          <label for="edit-p-des">Désignation</label>
          <input type="text" class="form-control" id="edit-p-des" value="${piece.designation}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="edit-p-cat">Catégorie</label>
          <select class="form-control" id="edit-p-cat" required>
            <option value="Moteur" ${piece.categorie === 'Moteur' ? 'selected' : ''}>Moteur & Transmission</option>
            <option value="Freinage" ${piece.categorie === 'Freinage' ? 'selected' : ''}>Freinage</option>
            <option value="Filtration" ${piece.categorie === 'Filtration' ? 'selected' : ''}>Filtration</option>
            <option value="Électricité" ${piece.categorie === 'Électricité' ? 'selected' : ''}>Électricité</option>
            <option value="Peinture" ${piece.categorie === 'Peinture' ? 'selected' : ''}>Carrosserie / Peinture</option>
            <option value="Autre" ${piece.categorie === 'Autre' ? 'selected' : ''}>Autre</option>
          </select>
        </div>
        <div class="form-group">
          <label for="edit-p-prov">Fournisseur</label>
          <select class="form-control" id="edit-p-prov" required>${fOptions}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="edit-p-qty">Quantité en stock</label>
          <input type="number" class="form-control" id="edit-p-qty" value="${piece.quantiteStock}" min="0" required>
        </div>
        <div class="form-group">
          <label for="edit-p-seuil">Seuil d'alerte</label>
          <input type="number" class="form-control" id="edit-p-seuil" value="${piece.seuilAlerte}" min="1" required>
        </div>
      </div>
      <div class="form-group">
        <label for="edit-p-px">Prix Unitaire (€)</label>
        <input type="number" class="form-control" id="edit-p-px" value="${piece.prixUnitaire}" min="0" required>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null, true)">Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-edit-piece">Enregistrer les modifications</button>
  `;

  showModal(`Modifier la pièce ${piece.designation}`, body, footer);
}

function saveEditPiece(e, pieceId) {
  e.preventDefault();
  const piece = db.pieces.find(p => p.id === pieceId);
  if (!piece) return;
  
  const code = document.getElementById("edit-p-code").value;
  const designation = document.getElementById("edit-p-des").value;
  const categorie = document.getElementById("edit-p-cat").value;
  const fournisseurId = document.getElementById("edit-p-prov").value;
  const quantiteStock = parseInt(document.getElementById("edit-p-qty").value);
  const seuilAlerte = parseInt(document.getElementById("edit-p-seuil").value);
  const prixUnitaire = parseFloat(document.getElementById("edit-p-px").value);

  piece.code = code;
  piece.designation = designation;
  piece.categorie = categorie;
  piece.fournisseurId = fournisseurId;
  piece.quantiteStock = quantiteStock;
  piece.seuilAlerte = seuilAlerte;
  piece.prixUnitaire = prixUnitaire;

  saveDB(db);
  logAction(db.currentUser.id, "Modification Stock Pièce", `Référence ${code} (${designation}) mise à jour.`);
  closeModal(null, true);
  renderPieces();
  checkNotificationAlerts();
}


/* ==========================================================================
   MODULE 10: FOURNISSEURS
   ========================================================================== */

function renderFournisseurs() {
  const tbody = document.getElementById("fournisseurs-table-body");
  tbody.innerHTML = "";

  db.fournisseurs.forEach(f => {
    let actions = ``;
    if (db.currentUser.role !== 'lecteur') {
      actions += `<button class="btn btn-secondary btn-sm" onclick="editFournisseurModal('${f.id}')"><i data-lucide="edit"></i></button> `;
      actions += `<button class="btn btn-danger btn-sm" onclick="deleteFournisseur('${f.id}')"><i data-lucide="trash-2"></i></button>`;
    } else {
      actions = `<span class="text-muted">-</span>`;
    }

    tbody.innerHTML += `
      <tr>
        <td><strong>${f.nom}</strong></td>
        <td>${f.contact}</td>
        <td>${f.telephone}</td>
        <td><a href="mailto:${f.email}" style="color:var(--color-secondary);">${f.email}</a></td>
        <td>${f.commandesEncours} commande(s)</td>
        <td><strong>${f.facturesImpayees} €</strong></td>
        <td><div style="display:flex; gap:4px;">${actions}</div></td>
      </tr>
    `;
  });

  lucide.createIcons();
}

function openNewFournisseurModal() {
  const body = `
    <form id="form-prov" onsubmit="saveNewFournisseur(event)">
      <div class="form-group">
        <label for="f-nom">Nom de l'entreprise</label>
        <input type="text" class="form-control" id="f-nom" placeholder="Ex: Peinture Pro SAS" required>
      </div>
      <div class="form-group">
        <label for="f-con">Contact commercial</label>
        <input type="text" class="form-control" id="f-con" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="f-tel">Téléphone</label>
          <input type="text" class="form-control" id="f-tel" required>
        </div>
        <div class="form-group">
          <label for="f-mail">Email</label>
          <input type="email" class="form-control" id="f-mail" required>
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null, true)">Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-prov">Créer la fiche</button>
  `;

  showModal("Ajouter un Fournisseur", body, footer);
}

function saveNewFournisseur(e) {
  e.preventDefault();
  
  const nom = document.getElementById("f-nom").value;
  const contact = document.getElementById("f-con").value;
  const telephone = document.getElementById("f-tel").value;
  const email = document.getElementById("f-mail").value;

  const newF = {
    id: "f" + (db.fournisseurs.length + 1),
    nom,
    contact,
    telephone,
    email,
    commandesEncours: 0,
    facturesImpayees: 0
  };

  db.fournisseurs.push(newF);
  saveDB(db);
  logAction(db.currentUser.id, "Ajout Fournisseur", `Fournisseur ${nom} créé.`);
  closeModal(null, true);
  renderFournisseurs();
}

function deleteFournisseur(fournId) {
  if (confirm("Supprimer ce fournisseur ?")) {
    db.fournisseurs = db.fournisseurs.filter(f => f.id !== fournId);
    saveDB(db);
    logAction(db.currentUser.id, "Suppression Fournisseur", `Fournisseur ${fournId} supprimé.`);
    renderFournisseurs();
  }
}

function editFournisseurModal(fournId) {
  const f = db.fournisseurs.find(fourn => fourn.id === fournId);
  if (!f) return;
  
  const body = `
    <form id="form-edit-prov" onsubmit="saveEditFournisseur(event, '${fournId}')">
      <div class="form-group">
        <label for="edit-f-nom">Nom de l'entreprise</label>
        <input type="text" class="form-control" id="edit-f-nom" value="${f.nom}" required>
      </div>
      <div class="form-group">
        <label for="edit-f-con">Contact commercial</label>
        <input type="text" class="form-control" id="edit-f-con" value="${f.contact}" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="edit-f-tel">Téléphone</label>
          <input type="text" class="form-control" id="edit-f-tel" value="${f.telephone}" required>
        </div>
        <div class="form-group">
          <label for="edit-f-mail">Email</label>
          <input type="email" class="form-control" id="edit-f-mail" value="${f.email}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="edit-f-cmd">Commandes en cours</label>
          <input type="number" class="form-control" id="edit-f-cmd" value="${f.commandesEncours}" min="0" required>
        </div>
        <div class="form-group">
          <label for="edit-f-fact">Encours Facturation (€)</label>
          <input type="number" class="form-control" id="edit-f-fact" value="${f.facturesImpayees}" min="0" required>
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null, true)">Annuler</button>
    <button class="btn btn-primary" type="submit" form="form-edit-prov">Enregistrer les modifications</button>
  `;

  showModal(`Modifier le fournisseur ${f.nom}`, body, footer);
}

function saveEditFournisseur(e, fournId) {
  e.preventDefault();
  const f = db.fournisseurs.find(fourn => fourn.id === fournId);
  if (!f) return;
  
  const nom = document.getElementById("edit-f-nom").value;
  const contact = document.getElementById("edit-f-con").value;
  const telephone = document.getElementById("edit-f-tel").value;
  const email = document.getElementById("edit-f-mail").value;
  const commandesEncours = parseInt(document.getElementById("edit-f-cmd").value);
  const facturesImpayees = parseInt(document.getElementById("edit-f-fact").value);

  f.nom = nom;
  f.contact = contact;
  f.telephone = telephone;
  f.email = email;
  f.commandesEncours = commandesEncours;
  f.facturesImpayees = facturesImpayees;

  saveDB(db);
  logAction(db.currentUser.id, "Modification Fournisseur", `Fournisseur ${nom} mis à jour.`);
  closeModal(null, true);
  renderFournisseurs();
}


/* ==========================================================================
   MODULE 11: EXPORT CSV & BACKUPS
   ========================================================================== */

// Export data directly as CSV
function handleGlobalSearch() {
  const val = document.getElementById("global-search").value.toLowerCase();
  if (val.trim() === "") return;
  
  // Custom SPA search triggers based on active tabs, but we'll show alerts if results match
  console.log("Recherche globale: " + val);
}

function exportBackup() {
  const jsonStr = JSON.stringify(db, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = `trafic_bus_backup_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  logAction(db.currentUser.id, "Sauvegarde", "Base de données exportée au format JSON.");
}

function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed.bus && parsed.reparations && parsed.garages) {
        db = parsed;
        saveDB(db);
        logAction(db.currentUser.id, "Restauration", "Base de données restaurée depuis un fichier.");
        alert("Restauration réussie ! L'application va se recharger.");
        window.location.reload();
      } else {
        alert("Le format du fichier de sauvegarde est invalide.");
      }
    } catch (err) {
      alert("Erreur lors de la lecture du fichier JSON.");
      console.error(err);
    }
  };
  reader.readAsText(file);
}

function confirmResetDB() {
  if (confirm("Voulez-vous vraiment réinitialiser toutes les données de l'ERP ? Cette action écrasera toutes vos modifications.")) {
    db = resetDB();
    logAction("u1", "Réinitialiser base", "La base de données a été remise à son état d'origine.");
    alert("Données réinitialisées !");
    window.location.reload();
  }
}


/* ==========================================================================
   MODULE 12: SIMULATED API CONSOLE
   ========================================================================== */

function runSimulatedAPI() {
  const method = document.getElementById("api-method").value;
  const endpoint = document.getElementById("api-endpoint").value;
  const terminal = document.getElementById("api-terminal");
  
  let responseData = null;
  
  if (method === "GET") {
    switch (endpoint) {
      case "/api/bus":
        responseData = db.bus;
        break;
      case "/api/garages":
        responseData = db.garages;
        break;
      case "/api/reparations":
        responseData = db.reparations;
        break;
      case "/api/pieces":
        responseData = db.pieces;
        break;
    }
  } else if (method === "POST") {
    responseData = {
      status: "success",
      message: `Simulation d'envoi POST sur ${endpoint} réussie.`,
      timestamp: new Date().toISOString()
    };
  }

  terminal.innerHTML = `
    <div class="terminal-line"><span class="terminal-info">[API Request]</span> ${method} ${endpoint}</div>
    <div class="terminal-line"><span class="terminal-success">HTTP/1.1 200 OK</span></div>
    <pre style="color: #6ee7b7; font-size:0.75rem; margin-top:8px; max-height:180px; overflow-y:auto;">${JSON.stringify(responseData, null, 2)}</pre>
  `;
}


/* ==========================================================================
   MODULE 13: JOURNAL D'AUDIT
   ========================================================================== */

function renderAudit() {
  const tbody = document.getElementById("audit-table-body");
  tbody.innerHTML = "";
  
  db.auditLog.forEach(log => {
    const formattedDate = new Date(log.date).toLocaleString('fr-FR');
    tbody.innerHTML += `
      <tr>
        <td class="text-muted" style="font-size:0.75rem;">${formattedDate}</td>
        <td><strong>${log.username}</strong> <span class="text-muted" style="font-size:0.75rem;">(ID: ${log.userId})</span></td>
        <td><span class="badge badge-info">${log.action}</span></td>
        <td>${log.details}</td>
      </tr>
    `;
  });
}


/* ==========================================================================
   MODULE 14: PARAMETRES (SETTINGS)
   ========================================================================== */

function loadSettings() {
  document.getElementById("settings-tva").value = db.settings.tva;
  document.getElementById("settings-mo").value = db.settings.coutMainOeuvreHoraire;
  document.getElementById("settings-incidents").value = db.settings.typesIncidents.join(", ");
  document.getElementById("settings-alerts").checked = db.settings.alertesActivees;
}

function saveSettings(e) {
  e.preventDefault();
  
  const tva = parseFloat(document.getElementById("settings-tva").value);
  const coutMainOeuvreHoraire = parseInt(document.getElementById("settings-mo").value);
  const typesIncidents = document.getElementById("settings-incidents").value.split(",").map(t => t.trim());
  const alertesActivees = document.getElementById("settings-alerts").checked;

  db.settings = {
    tva,
    coutMainOeuvreHoraire,
    typesIncidents,
    alertesActivees
  };

  saveDB(db);
  logAction(db.currentUser.id, "Paramètres modifiés", "Configuration globale mise à jour.");
  alert("Paramètres enregistrés avec succès !");
}


/* ============================================================
   MODULE SUIVI PEINTURE — REPRODUCTION DES OPERATIONS EXCEL
   ============================================================ */

function excelEsc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function excelMoney(v) {
  return Number(v || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

function excelDate(v) {
  if (!v) return "";
  const d = new Date(v + (String(v).length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("fr-FR");
}

function excelDays(row) {
  if (!row.dateDepart || !row.dateRetour) return "En cours";
  const a = new Date(row.dateDepart + "T00:00:00");
  const b = new Date(row.dateRetour + "T00:00:00");
  const n = Math.round((b - a) / 86400000);
  return n >= 0 ? n : 0;
}

function isExcelTreatmentComplete(r) {
  return Boolean(
    r &&
    r.garage &&
    r.vehicule &&
    r.dateInscription &&
    r.travaux &&
    r.dateDepart &&
    r.dateRetour
  );
}

function excelRate() {
  return Number(db.excelSettings?.tauxChange || 2300);
}

function excelQuota() {
  return Number(db.excelSettings?.quotaGarage || 40);
}

function excelCDF(usd) {
  return Number(usd || 0) * excelRate();
}

function excelGarages() {
  const names = ["MERCURIS", "GEORGES", "AUTO LUSHI", "CFAO", "AUTO MOTIVE"];
  const dynamic = (db.excelPeinture || []).map(x => (x.garage || "").trim()).filter(Boolean);
  return [...new Set(names.concat(dynamic))];
}

function excelFilteredRows() {
  const bus = (document.getElementById("excel-filter-bus")?.value || "").trim().toLowerCase();
  const garage = document.getElementById("excel-filter-garage")?.value || "";
  const start = document.getElementById("excel-filter-start")?.value || "";
  const end = document.getElementById("excel-filter-end")?.value || "";

  return (db.excelPeinture || []).filter(r => {
    const vehicle = String(r.vehicule || "").toLowerCase();
    const okBus = !bus || vehicle.includes(bus);
    const okGarage = !garage || String(r.garage || "").trim() === garage;
    const okStart = !start || String(r.dateDepart || "") >= start;
    const okEnd = !end || String(r.dateDepart || "") <= end;
    return okBus && okGarage && okStart && okEnd;
  });
}

function excelSummary(rows) {
  const map = {};
  rows.forEach(r => {
    const g = (r.garage || "SANS GARAGE").trim();
    if (!map[g]) map[g] = { garage:g, count:0, incident:0, paint:0, durations:[], total:0, busCounts:{} };
    const s = map[g];
    s.count++;
    const busKey = findBusByValue(r.vehicule)?.id || String(r.vehicule || "").trim().toLowerCase();
    if (busKey) s.busCounts[busKey] = (s.busCounts[busKey] || 0) + 1;
    s.incident += Number(r.incidentUSD || 0);
    s.paint += Number(r.peintureUSD || 0);
    s.total += Number(r.incidentUSD || 0) + Number(r.peintureUSD || 0);
    const d = excelDays(r);
    if (typeof d === "number" && d > 0) s.durations.push(d);
  });
  return Object.values(map).map(s => ({
    ...s,
    avg: s.durations.length ? s.durations.reduce((a,b)=>a+b,0)/s.durations.length : 0,
    totalCDF: excelCDF(s.total),
    status: Math.max(0, ...Object.values(s.busCounts)) >= excelQuota() ? "QUOTA BUS ATTEINT" : "OK"
  }));
}

function excelRecommendGarage() {
  const bus = (document.getElementById("excel-filter-bus")?.value || "").trim();
  const start = document.getElementById("excel-filter-start")?.value || "";
  const end = document.getElementById("excel-filter-end")?.value || "";
  const box = document.getElementById("excel-assignment-box");
  if (!box) return;

  if (!bus) {
    box.innerHTML = "Saisissez un numéro de bus dans le filtre pour reproduire l'affectation automatique.";
    return;
  }

  const all = db.excelPeinture || [];
  const garages = excelGarages();
  const rows = all.filter(r => {
    const vehicle = String(r.vehicule || "").toLowerCase();
    return vehicle.includes(bus.toLowerCase())
      && (!start || String(r.dateDepart || "") >= start)
      && (!end || String(r.dateDepart || "") <= end);
  });
  const busTreatmentCount = all.filter(r => findBusByValue(r.vehicule)?.numero === bus || String(r.vehicule || "").trim().toLowerCase() === bus.toLowerCase()).length;

  const summaries = excelSummary(all.filter(r =>
    (!start || String(r.dateDepart || "") >= start) &&
    (!end || String(r.dateDepart || "") <= end)
  ));

  // Même principe que la formule Excel : historique du bus, sinon garage
  // ayant le plus grand total facturé. Si le garage choisi a atteint le quota,
  // la décision doit être faite manuellement.
  let recommendation = "";
  let reason = "";

  if (busTreatmentCount >= excelQuota()) {
    recommendation = "QUOTA BUS ATTEINT";
    reason = `Ce bus compte ${busTreatmentCount} suivis, soit le quota de ${excelQuota()}.`;
  } else if (rows.length === 0) {
    const candidates = garages.map(g => {
      const s = summaries.find(x => x.garage === g);
      return { garage:g, total:s ? s.total : 0, count:s ? s.count : 0 };
    }).sort((a,b) => b.total-a.total);
    recommendation = candidates[0]?.garage || "Aucun garage";
    reason = "Aucun historique pour ce bus : sélection selon le total facturé historique.";
  } else {
    const counts = garages.map(g => {
      const s = summaries.find(x => x.garage === g);
      return { garage:g, count:s ? s.count : 0, total:s ? s.total : 0 };
    }).sort((a,b) => b.count-a.count);
    const best = counts[0];
    recommendation = best?.garage || "Aucun garage";
    reason = "Historique du bus trouvé : sélection du garage ayant le plus de traitements sur la période.";
  }

  box.innerHTML = `<strong style="font-size:1.05rem;">${excelEsc(recommendation)}</strong>
    <div class="list-meta" style="margin-top:6px;">${excelEsc(reason)}</div>`;
}

function renderExcelModule() {
  if (!db || !document.getElementById("view-suivi-peinture")) return;

  const rate = document.getElementById("excel-rate");
  const quota = document.getElementById("excel-quota");
  if (rate) rate.value = excelRate();
  if (quota) quota.value = excelQuota();

  const garageSelect = document.getElementById("excel-filter-garage");
  if (garageSelect) {
    const current = garageSelect.value;
    garageSelect.innerHTML = `<option value="">Tous les garages</option>` +
      excelGarages().map(g => `<option value="${excelEsc(g)}">${excelEsc(g)}</option>`).join("");
    garageSelect.value = current;
  }

  const rows = excelFilteredRows();
  const summary = excelSummary(rows);

  const totalInc = rows.reduce((s,r)=>s+Number(r.incidentUSD||0),0);
  const totalPaint = rows.reduce((s,r)=>s+Number(r.peintureUSD||0),0);
  const total = totalInc + totalPaint;
  const durations = rows.map(excelDays).filter(x=>typeof x==="number" && x>0);
  const avg = durations.length ? durations.reduce((a,b)=>a+b,0)/durations.length : 0;
  const active = rows.filter(r => !r.dateRetour).length;

  const kpi = document.getElementById("excel-kpis");
  if (kpi) {
    kpi.innerHTML = `
      <div class="card-stat"><div class="stat-details"><h3>Bus / traitements</h3><p>${rows.length}</p></div><div class="stat-icon"><i data-lucide="bus"></i></div></div>
      <div class="card-stat"><div class="stat-details"><h3>Incidents USD</h3><p>${excelMoney(totalInc)}</p></div><div class="stat-icon"><i data-lucide="alert-triangle"></i></div></div>
      <div class="card-stat"><div class="stat-details"><h3>Peinture USD</h3><p>${excelMoney(totalPaint)}</p></div><div class="stat-icon"><i data-lucide="paintbrush"></i></div></div>
      <div class="card-stat"><div class="stat-details"><h3>Délai moyen</h3><p>${avg.toFixed(1)} j</p></div><div class="stat-icon"><i data-lucide="timer"></i></div></div>
      <div class="card-stat"><div class="stat-details"><h3>En cours</h3><p>${active}</p></div><div class="stat-icon"><i data-lucide="clock"></i></div></div>`;
  }

  const sb = document.getElementById("excel-summary-body");
  if (sb) {
    sb.innerHTML = summary.length ? summary.map(s => `
      <tr>
        <td><strong>${excelEsc(s.garage)}</strong></td>
        <td>${s.count}</td>
        <td>${excelMoney(s.incident)}</td>
        <td>${excelMoney(s.paint)}</td>
        <td>${s.avg.toFixed(1)} j</td>
        <td><strong>${excelMoney(s.total)}</strong></td>
        <td>${excelMoney(s.totalCDF)}</td>
        <td><span class="badge badge-${s.status === "QUOTA BUS ATTEINT" ? "danger":"success"}">${excelEsc(s.status)}</span></td>
      </tr>`).join("") :
      `<tr><td colspan="9" class="text-muted" style="text-align:center;">Aucune donnée pour ces filtres.</td></tr>`;
  }

  const tb = document.getElementById("excel-treatment-body");
  if (tb) {
    tb.innerHTML = rows.length ? rows.map(r => {
      const duration = excelDays(r);
      const total = Number(r.incidentUSD||0)+Number(r.peintureUSD||0);
      const incomplete = !isExcelTreatmentComplete(r);
      return `<tr>
        <td>${excelEsc(r.sourceNo)}</td>
        <td>${excelEsc(r.garage)}</td>
        <td>${excelDate(r.dateInscription)}</td>
        <td>${excelEsc(r.chauffeur)}</td>
        <td>${excelEsc(r.matricule)}</td>
        <td>${excelEsc(r.vehicule)}</td>
        <td>${excelEsc(r.facture)}</td>
        <td>${excelMoney(r.incidentUSD)}</td>
        <td>${excelMoney(excelCDF(r.incidentUSD))}</td>
        <td>${excelMoney(r.peintureUSD)}</td>
        <td>${excelMoney(excelCDF(r.peintureUSD))}</td>
        <td style="min-width:260px;">${excelEsc(r.travaux)}</td>
        <td>${excelDate(r.dateDepart)}</td>
        <td>${excelDate(r.dateRetour)}</td>
        <td><span class="badge badge-${duration === "En cours" ? "warning":"info"}">${duration === "En cours" ? duration : duration+" j"}</span></td>
        <td>
          ${db.currentUser.role !== "lecteur"
            ? `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                 <div style="display:flex; gap:4px;">
                   <button class="btn btn-secondary btn-sm" onclick="editExcelOperation('${excelEsc(r.id)}')">Modifier</button>
                   <button class="btn btn-danger btn-sm" onclick="deleteExcelOperation('${excelEsc(r.id)}')">Supprimer</button>
                 </div>
                 ${incomplete ? '<span class="incomplete-warning" title="Données incomplètes : remplir les champs requis avant validation.">Données incomplètes</span>' : ''}
               </div>`
            : `<span class="text-muted">Lecture</span>`}
        </td>
      </tr>`;
    }).join("") :
      `<tr><td colspan="18" class="text-muted" style="text-align:center;">Aucun traitement.</td></tr>`;
  }

  const countLabel = document.getElementById("excel-count-label");
  if (countLabel) countLabel.textContent = `${rows.length} ligne(s) affichée(s) — taux ${excelRate().toLocaleString("fr-FR")} CDF/USD`;

  excelRecommendGarage();
  lucide.createIcons();
}

function updateExcelRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return;
  db.excelSettings.tauxChange = n;
  saveDB(db);
  logAction(db.currentUser.id, "Taux Excel modifié", `Taux de conversion défini à ${n} CDF/USD.`);
  renderExcelModule();
}

function updateExcelQuota(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return;
  db.excelSettings.quotaGarage = Math.floor(n);
  saveDB(db);
  logAction(db.currentUser.id, "Quota Excel modifié", `Quota garage défini à ${Math.floor(n)}.`);
  renderExcelModule();
}

function getBusAssignedChauffeurInfo(busValue) {
  return getAssignedChauffeurInfo(busValue);
}

function syncBusChauffeurFields(busInputId, chauffeurInputId, matriculeInputId) {
  const busInput = document.getElementById(busInputId);
  const chauffeurInput = document.getElementById(chauffeurInputId);
  const matriculeInput = document.getElementById(matriculeInputId);
  if (!busInput || !chauffeurInput || !matriculeInput) return;

  const sync = () => {
    const bus = findBusByValue(busInput.value);
    const info = getBusAssignedChauffeurInfo(busInput.value);
    if (bus) {
      chauffeurInput.value = info.chauffeur;
      matriculeInput.value = info.matricule;
    }
  };

  busInput.addEventListener("change", sync);
  busInput.addEventListener("input", sync);
  sync();
}

function openExcelOperationModal(id = null) {
  const existing = id ? db.excelPeinture.find(x => x.id === id) : null;
  const r = existing || {
    garage:"", dateInscription:"", chauffeur:"", matricule:"", vehicule:"",
    facture:"", incidentUSD:0, peintureUSD:0, travaux:"", dateDepart:"", dateRetour:""
  };
  const garages = excelGarages().map(g => `<option value="${excelEsc(g)}" ${r.garage===g?"selected":""}>${excelEsc(g)}</option>`).join("");

  const body = `
    <form id="excel-operation-form" onsubmit="saveExcelOperation(event, '${existing ? excelEsc(id) : ""}')">
      <div class="form-row">
        <div class="form-group"><label>Garage</label><select class="form-control" id="ex-garage" required><option value="">Choisir</option>${garages}</select></div>
        <div class="form-group"><label>N° véhicule / bus</label><input class="form-control" id="ex-vehicule" value="${excelEsc(r.vehicule)}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Date inscription</label><input class="form-control" id="ex-inscription" type="date" value="${excelEsc(r.dateInscription)}" required></div>
        <div class="form-group"><label>Nom chauffeur</label><input class="form-control" id="ex-chauffeur" value="${excelEsc(r.chauffeur)}"></div>
        <div class="form-group"><label>Matricule</label><input class="form-control" id="ex-matricule" value="${excelEsc(r.matricule)}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>N° facture / proforma</label><input class="form-control" id="ex-facture" value="${excelEsc(r.facture)}"></div>
        <div class="form-group"><label>Incident (USD)</label><input class="form-control" id="ex-incident" type="number" step="0.01" min="0" value="${Number(r.incidentUSD||0)}"></div>
        <div class="form-group"><label>Peinture (USD)</label><input class="form-control" id="ex-peinture" type="number" step="0.01" min="0" value="${Number(r.peintureUSD||0)}"></div>
      </div>
      <div class="form-group"><label>Travaux à faire</label><textarea class="form-control" id="ex-travaux" rows="3" required>${excelEsc(r.travaux)}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Date départ</label><input class="form-control" id="ex-depart" type="date" value="${excelEsc(r.dateDepart)}" required></div>
        <div class="form-group"><label>Date retour</label><input class="form-control" id="ex-retour" type="date" value="${excelEsc(r.dateRetour)}"></div>
      </div>
      <div class="card" style="padding:12px;margin-top:8px;">
        <span class="list-meta">Les colonnes CDF et Durée sont calculées automatiquement, comme dans Excel.</span>
      </div>
    </form>`;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null,true)">Annuler</button>
    <button class="btn btn-primary" type="submit" form="excel-operation-form">${existing ? "Enregistrer les modifications" : "Ajouter le traitement"}</button>`;

  showModal(existing ? "Modifier un traitement Excel" : "Nouveau traitement peinture", body, footer);
  syncBusChauffeurFields("ex-vehicule", "ex-chauffeur", "ex-matricule");
}

function saveExcelOperation(e, id = "") {
  e.preventDefault();
  const data = {
    garage: document.getElementById("ex-garage").value.trim(),
    vehicule: document.getElementById("ex-vehicule").value.trim(),
    dateInscription: document.getElementById("ex-inscription").value,
    chauffeur: document.getElementById("ex-chauffeur").value.trim(),
    matricule: document.getElementById("ex-matricule").value.trim(),
    facture: document.getElementById("ex-facture").value.trim(),
    incidentUSD: Number(document.getElementById("ex-incident").value || 0),
    peintureUSD: Number(document.getElementById("ex-peinture").value || 0),
    travaux: document.getElementById("ex-travaux").value.trim(),
    dateDepart: document.getElementById("ex-depart").value,
    dateRetour: document.getElementById("ex-retour").value
  };

  const busInfo = getBusAssignedChauffeurInfo(data.vehicule);
  if (busInfo.chauffeur) {
    data.chauffeur = busInfo.chauffeur;
    data.matricule = busInfo.matricule;
  }

  const missingFields = [];
  if (!data.garage) missingFields.push("garage");
  if (!data.vehicule) missingFields.push("n° véhicule / bus");
  if (!data.dateInscription) missingFields.push("date inscription");
  if (!data.travaux) missingFields.push("travaux à faire");
  if (!data.dateDepart) missingFields.push("date départ");

  if (missingFields.length) {
    alert(`Données incomplètes : ${missingFields.join(", ")}. Complétez les champs requis avant de valider.`);
    return;
  }

  if (data.dateRetour && data.dateRetour < data.dateDepart) {
    alert("La date de retour ne peut pas être antérieure à la date de départ.");
    return;
  }

  if (id) {
    const idx = db.excelPeinture.findIndex(x => x.id === id);
    if (idx >= 0) db.excelPeinture[idx] = {...db.excelPeinture[idx], ...data};
    logAction(db.currentUser.id, "Modification traitement peinture", `Traitement ${id} modifié.`);
  } else {
    const maxNo = db.excelPeinture.reduce((m,x)=>Math.max(m, Number(x.sourceNo)||0),0);
    db.excelPeinture.push({id:"excel-"+Date.now(), sourceNo:maxNo+1, ...data});
    logAction(db.currentUser.id, "Ajout traitement peinture", `Nouveau traitement enregistré pour ${data.vehicule}.`);
  }
  saveDB(db);
  closeModal(null,true);
  renderExcelModule();
}

function editExcelOperation(id) {
  if (db.currentUser.role === "lecteur") return;
  openExcelOperationModal(id);
}

function deleteExcelOperation(id) {
  if (db.currentUser.role === "lecteur") return;
  const r = db.excelPeinture.find(x=>x.id===id);
  if (!r) return;
  if (!confirm(`Supprimer le traitement N° ${r.sourceNo} ?`)) return;
  db.excelPeinture = db.excelPeinture.filter(x=>x.id!==id);
  saveDB(db);
  logAction(db.currentUser.id, "Suppression traitement peinture", `Traitement N°${r.sourceNo} supprimé.`);
  renderExcelModule();
}

function exportPeintureCSV() {
  const rows = excelFilteredRows();
  const headers = [
    "N°","GARAGE","DATE INSCRIPTION","NOM CHAUFFEUR","MATRICULE","VEHICULE","N°FACT",
    "MONTANT INCIDENT (USD)","INCIDENT CDF","MONTANT PEINTURE (USD)","PEINTURE CDF",
    "TRAVAUX A FAIRE","DATE DEPART","DATE RETOUR","DUREE"
  ];
  const csvRows = [headers, ...rows.map(r => [
    r.sourceNo, r.garage, r.dateInscription, r.chauffeur, r.matricule, r.vehicule, r.facture,
    r.incidentUSD, excelCDF(r.incidentUSD),
    r.peintureUSD, excelCDF(r.peintureUSD),
    r.travaux, r.dateDepart, r.dateRetour, excelDays(r)
  ])];
  const csv = csvRows.map(row => row.map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(";")).join("\n");
  const blob = new Blob(["\ufeff"+csv], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "suivi_travaux_peinture.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/* ============================================================
   IMPORTATION & SYNCHRONISATION FICHIERS EXCEL (.XLSX / .XLS / .CSV)
   ============================================================ */

function triggerExcelImport() {
  const input = document.getElementById("excel-import-file");
  if (!input) return;
  input.value = "";
  input.click();
}

function handleExcelFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (typeof XLSX === "undefined") {
    alert("La bibliothèque SheetJS (xlsx.full.min.js) n'est pas encore chargée. Veuillez vérifier que le fichier est présent et recharger la page.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        alert("Le classeur Excel ne contient aucune feuille de calcul.");
        return;
      }

      // Priorité à la feuille 'Traitement', 'Suivi', 'Peinture' ou 'Carrosserie', sinon première feuille
      let selectedSheetName = workbook.SheetNames[0];
      const preferred = workbook.SheetNames.find(n => /traitement|suivi|peinture|carrosserie/i.test(n));
      if (preferred) selectedSheetName = preferred;

      const worksheet = workbook.Sheets[selectedSheetName];
      const rawMatrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

      if (!rawMatrix || rawMatrix.length === 0) {
        alert(`La feuille "${selectedSheetName}" est vide.`);
        return;
      }

      // Recherche dynamique de la ligne d'en-tête par correspondance de mots-clés
      let bestHeaderIdx = -1;
      let maxMatches = 0;
      const keywords = ["garage", "vehicule", "bus", "travaux", "facture", "incident", "peinture", "matricule", "chauffeur", "depart", "retour"];

      for (let i = 0; i < Math.min(rawMatrix.length, 25); i++) {
        const row = rawMatrix[i];
        if (!Array.isArray(row)) continue;
        let matches = 0;
        row.forEach(cell => {
          const str = String(cell || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (keywords.some(kw => str.includes(kw))) matches++;
        });
        if (matches > maxMatches) {
          maxMatches = matches;
          bestHeaderIdx = i;
        }
      }

      if (bestHeaderIdx === -1 || maxMatches < 2) {
        bestHeaderIdx = 0;
      }

      const headerRow = rawMatrix[bestHeaderIdx];
      const colMap = {};

      headerRow.forEach((colName, idx) => {
        const clean = String(colName || "").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (/^(n|no|num|numero|n°)$/.test(clean)) colMap.sourceNo = idx;
        else if (/garage|atelier/.test(clean)) colMap.garage = idx;
        else if (/inscription|entree/.test(clean)) colMap.dateInscription = idx;
        else if (/chauffeur|conducteur/.test(clean)) colMap.chauffeur = idx;
        else if (/matricule|plaque/.test(clean)) colMap.matricule = idx;
        else if (/vehicule|bus|auto/.test(clean)) colMap.vehicule = idx;
        else if (/facture|proforma|fact/.test(clean)) colMap.facture = idx;
        else if (/incident/.test(clean)) {
          if (!clean.includes("cdf")) colMap.incidentUSD = idx;
        }
        else if (/peinture/.test(clean)) {
          if (!clean.includes("cdf")) colMap.peintureUSD = idx;
        }
        else if (/travaux|motif|panne|description|observation/.test(clean)) colMap.travaux = idx;
        else if (/depart|debut/.test(clean)) colMap.dateDepart = idx;
        else if (/retour|fin/.test(clean)) colMap.dateRetour = idx;
      });

      function parseDateValue(val) {
        if (!val) return "";
        if (val instanceof Date) {
          if (isNaN(val.getTime())) return "";
          return val.toISOString().slice(0, 10);
        }
        if (typeof val === "number" && val > 20000 && val < 60000) {
          const d = new Date(Math.round((val - 25569) * 86400 * 1000));
          return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
        }
        const s = String(val).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
        if (m) {
          const dd = m[1].padStart(2, '0');
          const mm = m[2].padStart(2, '0');
          const yyyy = m[3];
          return `${yyyy}-${mm}-${dd}`;
        }
        return s;
      }

      function parseNumberValue(val) {
        if (typeof val === "number") return isNaN(val) ? 0 : val;
        if (!val) return 0;
        const clean = String(val).replace(/[^0-9.,-]/g, "").replace(/\s/g, "").replace(",", ".");
        const n = parseFloat(clean);
        return isNaN(n) ? 0 : n;
      }

      const parsedRows = [];
      let autoNo = 1;

      for (let i = bestHeaderIdx + 1; i < rawMatrix.length; i++) {
        const row = rawMatrix[i];
        if (!Array.isArray(row) || row.length === 0) continue;

        const getCol = (key) => (colMap[key] !== undefined ? row[colMap[key]] : "");

        const garage = String(getCol("garage") || "").trim();
        const vehicule = String(getCol("vehicule") || "").trim();
        const travaux = String(getCol("travaux") || "").trim();
        const dateInscription = parseDateValue(getCol("dateInscription"));
        const dateDepart = parseDateValue(getCol("dateDepart"));
        const dateRetour = parseDateValue(getCol("dateRetour"));
        const chauffeur = String(getCol("chauffeur") || "").trim();
        const matricule = String(getCol("matricule") || "").trim();
        const facture = String(getCol("facture") || "").trim();
        const incidentUSD = parseNumberValue(getCol("incidentUSD"));
        const peintureUSD = parseNumberValue(getCol("peintureUSD"));

        let sourceNo = parseInt(getCol("sourceNo"));
        if (isNaN(sourceNo) || sourceNo <= 0) sourceNo = autoNo;
        autoNo = Math.max(autoNo, sourceNo) + 1;

        if (!garage && !vehicule && !travaux && !dateInscription && !facture) continue;

        parsedRows.push({
          id: "excel-" + Date.now() + "-" + Math.random().toString(36).substr(2, 6),
          sourceNo,
          garage: garage || "SANS GARAGE",
          dateInscription: dateInscription || dateDepart || new Date().toISOString().slice(0, 10),
          chauffeur,
          matricule,
          vehicule: vehicule || "Inconnu",
          facture,
          incidentUSD,
          peintureUSD,
          travaux: travaux || "Travaux généraux",
          dateDepart: dateDepart || dateInscription || new Date().toISOString().slice(0, 10),
          dateRetour
        });
      }

      if (parsedRows.length === 0) {
        alert("Aucune ligne de traitement valide n'a pu être extraite du fichier Excel.");
        return;
      }

      window._pendingExcelImport = {
        fileName: file.name,
        sheetName: selectedSheetName,
        rows: parsedRows
      };

      showExcelSyncPreviewModal();
    } catch (err) {
      console.error("Erreur lors de la lecture du fichier Excel:", err);
      alert("Erreur lors de l'analyse du fichier Excel : " + err.message);
    }
  };

  reader.readAsArrayBuffer(file);
}

function showExcelSyncPreviewModal() {
  const pending = window._pendingExcelImport;
  if (!pending) return;

  const { fileName, sheetName, rows } = pending;
  const sample = rows.slice(0, 5);
  const totalInc = rows.reduce((s, r) => s + (r.incidentUSD || 0), 0);
  const totalPnt = rows.reduce((s, r) => s + (r.peintureUSD || 0), 0);
  const totalUSD = totalInc + totalPnt;
  const garages = [...new Set(rows.map(r => r.garage).filter(Boolean))];

  const sampleHtml = sample.map(r => `
    <tr>
      <td><strong>${excelEsc(r.sourceNo)}</strong></td>
      <td>${excelEsc(r.garage)}</td>
      <td>${excelEsc(r.vehicule)}</td>
      <td>${excelEsc(r.facture || "-")}</td>
      <td>${excelMoney(r.incidentUSD)}</td>
      <td>${excelMoney(r.peintureUSD)}</td>
      <td style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${excelEsc(r.travaux)}</td>
      <td>${excelDate(r.dateDepart)}</td>
    </tr>
  `).join("");

  const body = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div class="card" style="padding:14px; background:rgba(99,102,241,0.06); border:1px solid rgba(99,102,241,0.2);">
        <div style="font-weight:600; font-size:1.05rem; margin-bottom:6px;">
          <i data-lucide="file-spreadsheet" style="vertical-align:middle; margin-right:6px;"></i>
          ${excelEsc(fileName)} — Feuille : <span class="badge badge-info">${excelEsc(sheetName)}</span>
        </div>
        <div class="list-meta" style="font-size:0.9rem; line-height:1.5;">
          • <strong>${rows.length}</strong> lignes prêtes à être synchronisées<br>
          • <strong>${garages.length}</strong> garages identifiés (${garages.slice(0, 4).join(", ")}${garages.length > 4 ? "..." : ""})<br>
          • Montants détectés : Incidents = <strong>${excelMoney(totalInc)} $</strong> | Peinture = <strong>${excelMoney(totalPnt)} $</strong><br>
          • Total facturé détecté : <strong>${excelMoney(totalUSD)} $</strong> (~${excelMoney(excelCDF(totalUSD))} CDF)
        </div>
      </div>

      <div>
        <h4 style="margin-bottom:8px; font-size:0.95rem;">Aperçu des 5 premières lignes :</h4>
        <div class="table-container" style="max-height:220px; overflow-y:auto;">
          <table>
            <thead><tr>
              <th>N°</th><th>Garage</th><th>Véhicule</th><th>Facture</th>
              <th>Incident $</th><th>Peinture $</th><th>Travaux</th><th>Départ</th>
            </tr></thead>
            <tbody>${sampleHtml}</tbody>
          </table>
        </div>
      </div>

      <div class="card" style="padding:14px; border:1px solid var(--border-color);">
        <h4 style="margin-bottom:8px; font-size:0.95rem;">Choisissez le mode de synchronisation :</h4>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer;">
            <input type="radio" name="sync-mode" value="merge" checked style="margin-top:3px;">
            <div>
              <strong>Synchronisation intelligente & Fusion (Recommandé)</strong>
              <div class="list-meta">Met à jour les opérations existantes (par N° d'opération, n° facture ou véhicule) et ajoute les nouvelles sans effacer les autres données.</div>
            </div>
          </label>
          <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer;">
            <input type="radio" name="sync-mode" value="replace" style="margin-top:3px;">
            <div>
              <strong>Remplacement complet</strong>
              <div class="list-meta">Remplace l'intégralité du module de suivi par les données exactes de ce fichier Excel.</div>
            </div>
          </label>
        </div>
      </div>
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal(null, true)">Annuler</button>
    <button class="btn btn-primary" onclick="confirmExcelSync()"><i data-lucide="check"></i> Confirmer la synchronisation</button>
  `;

  showModal("Synchronisation du fichier Excel", body, footer);
  lucide.createIcons();
}

function confirmExcelSync() {
  const pending = window._pendingExcelImport;
  if (!pending) return;

  const modeRadio = document.querySelector("input[name='sync-mode']:checked");
  const mode = modeRadio ? modeRadio.value : "merge";

  const importedRows = pending.rows;
  let updatedCount = 0;
  let addedCount = 0;

  if (mode === "replace") {
    db.excelPeinture = importedRows;
    addedCount = importedRows.length;
  } else {
    const existing = db.excelPeinture || [];
    importedRows.forEach(newRow => {
      let matchIdx = -1;
      if (newRow.facture) {
        matchIdx = existing.findIndex(x => x.facture && x.facture.trim().toLowerCase() === newRow.facture.trim().toLowerCase());
      }
      if (matchIdx === -1 && newRow.sourceNo) {
        matchIdx = existing.findIndex(x => Number(x.sourceNo) === Number(newRow.sourceNo));
      }
      if (matchIdx === -1 && newRow.vehicule && newRow.dateDepart) {
        matchIdx = existing.findIndex(x => x.vehicule === newRow.vehicule && x.dateDepart === newRow.dateDepart);
      }

      if (matchIdx >= 0) {
        existing[matchIdx] = { ...existing[matchIdx], ...newRow, id: existing[matchIdx].id };
        updatedCount++;
      } else {
        existing.push(newRow);
        addedCount++;
      }
    });
    db.excelPeinture = existing;
  }

  saveDB(db);
  logAction(db.currentUser.id, "Synchronisation Excel", `Importation de ${importedRows.length} lignes depuis ${pending.fileName} (Mode: ${mode === "replace" ? "Remplacement" : "Fusion"}). Ajoutés: ${addedCount}, Mis à jour: ${updatedCount}.`);
  closeModal(null, true);
  window._pendingExcelImport = null;
  renderExcelModule();

  alert(`Synchronisation Excel réussie !\n\n• ${addedCount} ligne(s) ajoutée(s)\n• ${updatedCount} ligne(s) mise(s) à jour\n• Total dans le suivi : ${db.excelPeinture.length} traitements.`);
}

/* ============================================================
   MODULE SUIVI CARROSSERIE — OPERATIONS ET INCIDENTS
   ============================================================ */

function carrosserieRate() { return Number(db.carrosserieSettings?.tauxChange || 2300); }
function carrosserieQuota() { return Number(db.carrosserieSettings?.quotaGarage || 40); }
function carrosserieCDF(usd) { return Number(usd || 0) * carrosserieRate(); }

function carrosserieGarages() {
  return [...new Set((db.excelCarrosserie || []).map(row => String(row.garage || "").trim()).filter(Boolean))];
}

function carrosserieFilteredRows() {
  const bus = (document.getElementById("carrosserie-filter-bus")?.value || "").trim().toLowerCase();
  const garage = document.getElementById("carrosserie-filter-garage")?.value || "";
  const start = document.getElementById("carrosserie-filter-start")?.value || "";
  const end = document.getElementById("carrosserie-filter-end")?.value || "";
  return (db.excelCarrosserie || []).filter(row => {
    const vehicle = String(row.vehicule || "").toLowerCase();
    return (!bus || vehicle.includes(bus)) && (!garage || row.garage === garage) &&
      (!start || String(row.dateDepart || "") >= start) && (!end || String(row.dateDepart || "") <= end);
  });
}

function carrosserieSummary(rows) {
  const grouped = {};
  rows.forEach(row => {
    const garage = row.garage || "SANS ATELIER";
    grouped[garage] ||= { garage, count: 0, total: 0, durations: [], busCounts: {} };
    grouped[garage].count++;
    const busKey = findBusByValue(row.vehicule)?.id || String(row.vehicule || "").trim().toLowerCase();
    if (busKey) grouped[garage].busCounts[busKey] = (grouped[garage].busCounts[busKey] || 0) + 1;
    grouped[garage].total += Number(row.montantCarrosserieUSD || 0);
    const duration = excelDays(row);
    if (typeof duration === "number" && duration > 0) grouped[garage].durations.push(duration);
  });
  return Object.values(grouped).map(item => ({
    ...item,
    avg: item.durations.length ? item.durations.reduce((sum, value) => sum + value, 0) / item.durations.length : 0,
    totalCDF: carrosserieCDF(item.total),
    status: Math.max(0, ...Object.values(item.busCounts)) >= carrosserieQuota() ? "QUOTA BUS ATTEINT" : "OK"
  }));
}

function renderCarrosserieModule() {
  if (!db || !document.getElementById("view-suivi-carrosserie")) return;
  const rate = document.getElementById("carrosserie-rate");
  const quota = document.getElementById("carrosserie-quota");
  if (rate) rate.value = carrosserieRate();
  if (quota) quota.value = carrosserieQuota();

  const garageSelect = document.getElementById("carrosserie-filter-garage");
  if (garageSelect) {
    const current = garageSelect.value;
    garageSelect.innerHTML = `<option value="">Tous les ateliers</option>` + carrosserieGarages().map(garage => `<option value="${excelEsc(garage)}">${excelEsc(garage)}</option>`).join("");
    garageSelect.value = current;
  }

  const rows = carrosserieFilteredRows();
  const total = rows.reduce((sum, row) => sum + Number(row.montantCarrosserieUSD || 0), 0);
  const durations = rows.map(excelDays).filter(value => typeof value === "number" && value > 0);
  const linked = rows.filter(row => row.incidentId).length;
  const kpi = document.getElementById("carrosserie-kpis");
  if (kpi) kpi.innerHTML = `
    <div class="card-stat"><div class="stat-details"><h3>Bus traités</h3><p>${rows.length}</p></div><div class="stat-icon"><i data-lucide="bus"></i></div></div>
    <div class="card-stat"><div class="stat-details"><h3>Total Carrosserie USD</h3><p>${excelMoney(total)}</p></div><div class="stat-icon"><i data-lucide="wrench"></i></div></div>
    <div class="card-stat"><div class="stat-details"><h3>Total CDF</h3><p>${excelMoney(carrosserieCDF(total))}</p></div><div class="stat-icon"><i data-lucide="banknote"></i></div></div>
    <div class="card-stat"><div class="stat-details"><h3>Délai moyen tôlerie</h3><p>${(durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0).toFixed(1)} j</p></div><div class="stat-icon"><i data-lucide="timer"></i></div></div>
    <div class="card-stat"><div class="stat-details"><h3>En cours</h3><p>${rows.filter(row => !row.dateRetour).length}</p></div><div class="stat-icon"><i data-lucide="clock"></i></div></div>
    <div class="card-stat"><div class="stat-details"><h3>Incidents justifiés</h3><p>${linked}</p></div><div class="stat-icon"><i data-lucide="shield-check"></i></div></div>`;

  const summaryBody = document.getElementById("carrosserie-summary-body");
  if (summaryBody) summaryBody.innerHTML = carrosserieSummary(rows).map(item => `<tr>
    <td><strong>${excelEsc(item.garage)}</strong></td><td>${item.count}</td><td>${excelMoney(item.total)}</td><td>${excelMoney(item.totalCDF)}</td>
    <td>${item.avg.toFixed(1)} j</td><td><span class="badge badge-${item.status === "QUOTA BUS ATTEINT" ? "danger" : "success"}">${excelEsc(item.status)}</span></td>
  </tr>`).join("") || `<tr><td colspan="6" class="text-muted" style="text-align:center;">Aucune donnée pour ces filtres.</td></tr>`;

  const treatmentBody = document.getElementById("carrosserie-treatment-body");
  if (treatmentBody) treatmentBody.innerHTML = rows.map(row => {
    const incident = db.incidents.find(item => item.id === row.incidentId);
    const justification = incident ? `<span class="badge badge-success">${excelEsc(incident.id.toUpperCase())}</span><br><small>${excelEsc(row.facture || "Sans facture")} · ${excelEsc(row.garage)}</small>` : `<span class="badge badge-warning">Non rattaché</span>`;
    const photoPreview = row.photo ? `<div style="margin-top:8px;"><img src="${row.photo}" alt="Photo carrosserie" style="width:72px; height:54px; object-fit:cover; border-radius:6px; border:1px solid var(--border-color); cursor:pointer;" onclick="viewPhoto('${row.photo.replace(/'/g, "\\'")}' )"></div>` : `<div class="list-meta" style="margin-top:8px;">Aucune photo</div>`;
    return `<tr><td>${excelEsc(row.sourceNo)}</td><td>${excelEsc(row.garage)}</td><td>${excelDate(row.dateInscription)}</td><td>${excelEsc(row.chauffeur)}</td><td>${excelEsc(row.matricule)}</td>
      <td>${excelEsc(row.vehicule)}</td><td>${excelEsc(row.facture)}</td><td>${excelMoney(row.montantCarrosserieUSD)}</td><td>${excelMoney(carrosserieCDF(row.montantCarrosserieUSD))}</td>
      <td><strong>${excelEsc(row.typeDegat || "")}</strong><br>${excelEsc(row.travaux)}${photoPreview}</td><td>${justification}</td><td>${excelDate(row.dateDepart)}</td><td>${excelDate(row.dateRetour)}</td>
      <td><span class="badge badge-${row.dateRetour ? "info" : "warning"}">${row.dateRetour ? excelDays(row) + " j" : "En cours"}</span></td>
      <td>${db.currentUser.role === "lecteur" ? "-" : `<button class="btn btn-secondary btn-sm" onclick="openCarrosserieOperationModal('${excelEsc(row.id)}')">Modifier</button> <button class="btn btn-danger btn-sm" onclick="deleteCarrosserieOperation('${excelEsc(row.id)}')">Supprimer</button>`}</td></tr>`;
  }).join("") || `<tr><td colspan="15" class="text-muted" style="text-align:center;">Aucune opération.</td></tr>`;
  const count = document.getElementById("carrosserie-count-label");
  if (count) count.textContent = `${rows.length} ligne(s) affichée(s) — taux ${carrosserieRate().toLocaleString("fr-FR")} CDF/USD`;
  lucide.createIcons();
}

function updateCarrosserieRate(value) { const rate = Number(value); if (rate > 0) { db.carrosserieSettings.tauxChange = rate; saveDB(db); renderCarrosserieModule(); } }
function updateCarrosserieQuota(value) { const quota = Number(value); if (quota > 0) { db.carrosserieSettings.quotaGarage = Math.floor(quota); saveDB(db); renderCarrosserieModule(); } }

function updateCarrosserieAmountState() {
  const departInput = document.getElementById("car-depart");
  const retourInput = document.getElementById("car-retour");
  const montantInput = document.getElementById("car-montant");
  if (!retourInput || !montantInput) return;

  const depart = departInput?.value || "";
  const retour = retourInput.value;
  const isValidReturn = Boolean(retour) && (!depart || retour >= depart);

  montantInput.disabled = !isValidReturn;
  montantInput.required = isValidReturn;
  if (!isValidReturn) {
    montantInput.value = "0";
    montantInput.setAttribute("aria-invalid", "false");
  }
}

function openCarrosserieOperationModal(id = null) {
  const existing = id ? db.excelCarrosserie.find(row => row.id === id) : null;
  const row = existing || { garage: "", dateInscription: "", chauffeur: "", matricule: "", vehicule: "", facture: "", montantCarrosserieUSD: 0, typeDegat: "", travaux: "", dateDepart: "", dateRetour: "", incidentId: "", photo: "" };
  const garages = carrosserieGarages().map(garage => `<option value="${excelEsc(garage)}" ${row.garage === garage ? "selected" : ""}>${excelEsc(garage)}</option>`).join("");
  const body = `<form id="carrosserie-operation-form" onsubmit="saveCarrosserieOperation(event, '${existing ? excelEsc(id) : ""}')">
    <div class="form-row"><div class="form-group"><label>Atelier / Garage</label><input class="form-control" id="car-garage" value="${excelEsc(row.garage)}" list="car-garages" required><datalist id="car-garages">${garages}</datalist></div><div class="form-group"><label>N° véhicule / bus</label><input class="form-control" id="car-vehicule" value="${excelEsc(row.vehicule)}" required></div></div>
    <div class="form-row"><div class="form-group"><label>Date inscription</label><input class="form-control" id="car-inscription" type="date" value="${excelEsc(row.dateInscription)}" required></div><div class="form-group"><label>Chauffeur</label><input class="form-control" id="car-chauffeur" value="${excelEsc(row.chauffeur)}"></div><div class="form-group"><label>Matricule</label><input class="form-control" id="car-matricule" value="${excelEsc(row.matricule)}"></div></div>
    <div class="form-row"><div class="form-group"><label>N° facture</label><input class="form-control" id="car-facture" value="${excelEsc(row.facture)}"></div><div class="form-group"><label>Montant carrosserie (USD)</label><input class="form-control" id="car-montant" type="number" step="0.01" min="0" value="${Number(row.montantCarrosserieUSD || 0)}" ${row.dateRetour && row.dateDepart && row.dateRetour >= row.dateDepart ? "" : "disabled"}></div><div class="form-group"><label>Type de dégât / Situation</label><input class="form-control" id="car-type" value="${excelEsc(row.typeDegat || "")}" placeholder="Vitre / Grillage / Plastique / Carrosserie"></div></div>
    <div class="form-group"><label>Travaux de carrosserie</label><textarea class="form-control" id="car-travaux" required>${excelEsc(row.travaux)}</textarea></div>
    <div class="form-group"><label>Image de référence (optionnel)</label><input class="form-control" id="car-photo-file" type="file" accept="image/*" aria-label="Choisir une image depuis mon ordinateur"><input type="hidden" id="car-photo-existing" value="${excelEsc(row.photo || "")}"></div>
    <div class="form-row"><div class="form-group"><label>Date départ</label><input class="form-control" id="car-depart" type="date" value="${excelEsc(row.dateDepart)}" required></div><div class="form-group"><label>Date retour</label><input class="form-control" id="car-retour" type="date" value="${excelEsc(row.dateRetour)}" onchange="updateCarrosserieAmountState()" oninput="updateCarrosserieAmountState()"></div></div>
  </form>`;
  showModal(existing ? "Modifier une opération carrosserie" : "Nouvelle opération carrosserie", body, `<button class="btn btn-secondary" onclick="closeModal(null,true)">Annuler</button><button class="btn btn-primary" type="submit" form="carrosserie-operation-form">Enregistrer</button>`);
  updateCarrosserieAmountState();
  document.getElementById("car-depart")?.addEventListener("change", updateCarrosserieAmountState);
  document.getElementById("car-retour")?.addEventListener("change", updateCarrosserieAmountState);
  syncBusChauffeurFields("car-vehicule", "car-chauffeur", "car-matricule");
}

async function saveCarrosserieOperation(event, id = "") {
  event.preventDefault();
  const depart = document.getElementById("car-depart").value;
  const retour = document.getElementById("car-retour").value;
  const montantInput = document.getElementById("car-montant");
  const existingPhoto = document.getElementById("car-photo-existing")?.value.trim() || "";
  let photo = "";
  try {
    photo = (await readSelectedImageFile(document.getElementById("car-photo-file"))) || existingPhoto;
  } catch (error) {
    alert(error.message || "Une erreur s'est produite sur la photo.");
    return;
  }
  const busValue = document.getElementById("car-vehicule").value.trim();
  const busInfo = getBusAssignedChauffeurInfo(busValue);
  const chauffeur = busInfo.chauffeur || document.getElementById("car-chauffeur").value.trim();
  const matricule = busInfo.matricule || document.getElementById("car-matricule").value.trim();
  const row = { garage: document.getElementById("car-garage").value.trim(), vehicule: busValue, dateInscription: document.getElementById("car-inscription").value, chauffeur, matricule, facture: document.getElementById("car-facture").value.trim(), montantCarrosserieUSD: Number(montantInput?.value || 0), typeDegat: document.getElementById("car-type").value.trim(), travaux: document.getElementById("car-travaux").value.trim(), photo, dateDepart: depart, dateRetour: retour };
  if (retour && retour < depart) return alert("La date de retour ne peut pas être antérieure à la date de départ.");
  if (!row.garage || !row.vehicule || !row.dateInscription || !row.travaux || !row.dateDepart) return alert("Complétez le garage, le bus, les dates et les travaux.");
  if (retour && Number(row.montantCarrosserieUSD || 0) <= 0) return alert("Saisissez le montant carrosserie après validation de la date de retour.");
  if (!retour) row.montantCarrosserieUSD = 0;
  if (id) { const index = db.excelCarrosserie.findIndex(item => item.id === id); if (index >= 0) db.excelCarrosserie[index] = { ...db.excelCarrosserie[index], ...row }; }
  else { const sourceNo = db.excelCarrosserie.reduce((max, item) => Math.max(max, Number(item.sourceNo) || 0), 0) + 1; db.excelCarrosserie.push({ id: `car-${Date.now()}`, sourceNo, incidentId: "", ...row }); }
  saveDB(db); closeModal(null, true); renderCarrosserieModule();
}

function deleteCarrosserieOperation(id) { if (db.currentUser.role !== "lecteur" && confirm("Supprimer cette opération carrosserie ?")) { db.excelCarrosserie = db.excelCarrosserie.filter(row => row.id !== id); saveDB(db); renderCarrosserieModule(); } }

function exportCarrosserieCSV() {
  const headers = ["N°", "GARAGE", "DATE INSCRIPTION", "CHAUFFEUR", "MATRICULE", "VEHICULE", "FACTURE", "MONTANT CARROSSERIE USD", "MONTANT CDF", "TYPE DEGAT", "TRAVAUX", "DATE DEPART", "DATE RETOUR", "DUREE", "INCIDENT"];
  const csv = [headers, ...carrosserieFilteredRows().map(row => [row.sourceNo, row.garage, row.dateInscription, row.chauffeur, row.matricule, row.vehicule, row.facture, row.montantCarrosserieUSD, carrosserieCDF(row.montantCarrosserieUSD), row.typeDegat, row.travaux, row.dateDepart, row.dateRetour, excelDays(row), row.incidentId])].map(line => line.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" })); link.download = "suivi_carrosserie.csv"; link.click(); URL.revokeObjectURL(link.href);
}

function triggerCarrosserieImport() {
  const input = document.getElementById("excel-carrosserie-import-file");
  if (input) { input.value = ""; input.click(); }
}

function resetCarrosserieData() {
  if (db.currentUser?.role === "lecteur") return alert("Vous n'avez pas les droits pour réinitialiser le suivi carrosserie.");
  if (!confirm("Voulez-vous effacer toutes les données enregistrées du suivi carrosserie ?\n\nCette action vide le registre des opérations carrosserie et détache les justifications incidents associées.")) return;

  db.excelCarrosserie = [];
  db.incidents = (db.incidents || []).map(incident => ({
    ...incident,
    carrosserieRef: "",
    factureRef: "",
    coutCarrosserie: 0,
    garageCarrosserie: ""
  }));
  saveDB(db);
  renderCarrosserieModule();
  renderIncidents();
  alert("Le registre carrosserie a été vidé. Vous pouvez maintenant importer un nouveau fichier.");
}

function handleCarrosserieFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file || typeof XLSX === "undefined") return alert("La bibliothèque Excel locale est indisponible.");
  const reader = new FileReader();
  reader.onload = function(loadEvent) {
    try {
      const workbook = XLSX.read(new Uint8Array(loadEvent.target.result), { type: "array", cellDates: true });
      const pending = { fileName: file.name, references: { bus: [], garages: [], chauffeurs: [], incidents: [] }, operations: [], ignoredTables: [] };

      workbook.SheetNames.forEach(sheetName => {
        const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
        const parsed = parseCarrosserieReferenceSheet(sheetName, matrix);
        if ((parsed.type === "operation" || parsed.type === "operations") && parsed.rows.length) {
          pending.operations.push({ sheetName, rows: parsed.rows });
        } else if (parsed.type && parsed.rows.length) {
          pending.references[parsed.type].push(...parsed.rows);
        } else if (parsed.type === "operation" || parsed.type === "operations") {
          pending.ignoredTables.push(sheetName);
        }
      });

      const referenceCounts = Object.entries(pending.references).map(([type, rows]) => `${rows.length} ${type}`).filter(item => !item.startsWith("0 "));
      const operationCount = pending.operations.reduce((total, sheet) => total + sheet.rows.length, 0);
      if (!referenceCounts.length && !operationCount) {
        window._pendingCarrosserieImport = null;
        return showModal("Aucune référence détectée", `<p>Le fichier <strong>${excelEsc(file.name)}</strong> ne contient ni tableau de référence ni tableau d'opérations exploitable.</p><p class="list-meta">Le module carrosserie accepte les feuilles de bus, ateliers, chauffeurs, incidents ou un suivi de travaux avec garage, véhicule, dates et travaux.</p>`, `<button class="btn btn-primary" onclick="closeModal(null,true)">OK</button>`);
      }

      window._pendingCarrosserieImport = pending;
      const operationSummary = operationCount ? `<p class="list-meta">Tableaux d'opérations détectés : <strong>${operationCount}</strong> lignes dans ${pending.operations.length} feuille(s).</p>` : "";
      showModal("Synchronisation des tableaux carrosserie", `<p><strong>${excelEsc(file.name)}</strong> contient plusieurs tableaux liés.</p>${referenceCounts.length ? `<p class="list-meta">Tableaux de référence détectés : ${excelEsc(referenceCounts.join(" · "))}.</p>` : ""}${operationSummary}<p class="list-meta">Tableaux ignorés : ${excelEsc(pending.ignoredTables.join(", ") || "Aucun tableau sans données exploitables")}. </p><label class="checkbox-container"><input type="checkbox" id="car-import-sync" checked><span class="checkmark"></span><span class="checkbox-text">Synchroniser aussi les incidents avec les références importées</span></label><label class="checkbox-container"><input type="checkbox" id="car-import-reset" checked><span class="checkmark"></span><span class="checkbox-text">Vider le registre carrosserie avant l'import</span></label>`, `<button class="btn btn-secondary" onclick="closeModal(null,true)">Annuler</button><button class="btn btn-primary" onclick="confirmCarrosserieImport()">Synchroniser les tableaux</button>`);
    } catch (error) { alert("Erreur lors de l'analyse du fichier carrosserie : " + error.message); }
  };
  reader.readAsArrayBuffer(file);
}

function parseCarrosserieReferenceSheet(sheetName, matrix) {
  const normalize = value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const sheetLabel = normalize(sheetName);
  const headerIndex = matrix.findIndex(row => Array.isArray(row) && row.some(cell => /bus|vehicule|garage|atelier|chauffeur|conducteur|incident|sinistre|immatriculation|matricule|adresse/.test(normalize(cell))));
  if (headerIndex < 0) return { type: null, rows: [] };
  const headers = matrix[headerIndex].map(normalize);
  const has = pattern => headers.some(header => pattern.test(header));
  const indexOf = pattern => headers.findIndex(header => pattern.test(header));
  const valueAt = (row, pattern) => { const index = indexOf(pattern); return index >= 0 ? row[index] : ""; };
  const tableLooksLikeOperation = /operation|opération|traitement|suivi/.test(sheetLabel) || (has(/travaux|description/) && has(/garage|atelier/) && has(/date.*depart|depart|debut/));

  if (tableLooksLikeOperation) {
    const parseDate = value => { if (!value) return ""; if (value instanceof Date) return value.toISOString().slice(0, 10); const text = String(value).trim(); const match = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : text; };
    const text = value => String(value || "").trim();
    const toNumber = value => {
      if (value === null || value === undefined || value === "") return 0;
      if (typeof value === "number") return Number.isFinite(value) ? value : 0;
      const clean = String(value).replace(/[^0-9,.-]/g, "").replace(/\s/g, "").replace(",", ".");
      const parsed = Number.parseFloat(clean);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const rows = matrix.slice(headerIndex + 1).filter(row => Array.isArray(row) && row.some(cell => String(cell).trim())).map((source, offset) => {
      const garage = text(valueAt(source, /garage|atelier/));
      const vehicule = text(valueAt(source, /bus|vehicule|véhicule|numero|numéro|n°/));
      const chauffeur = text(valueAt(source, /chauffeur|conducteur/));
      const matricule = text(valueAt(source, /matricule|immatriculation/));
      const facture = text(valueAt(source, /facture|proforma|fact/));
      const montant = toNumber(valueAt(source, /montant|cout|coût|usd|amount/));
      const typeDegat = text(valueAt(source, /type.*degat|type.*dégat|degat|dégat/));
      const travaux = text(valueAt(source, /travaux|description|motif|observation|detail|détail/));
      const dateInscription = parseDate(valueAt(source, /inscription|entree|entrée|date.*creation/));
      const dateDepart = parseDate(valueAt(source, /depart|départ|debut|début/));
      const dateRetour = parseDate(valueAt(source, /retour|fin/));
      return {
        sourceNo: offset + 1,
        garage,
        chauffeur,
        matricule,
        vehicule,
        facture,
        montantCarrosserieUSD: montant,
        typeDegat,
        travaux,
        dateInscription: dateInscription || dateDepart || "",
        dateDepart: dateDepart || dateInscription || "",
        dateRetour: dateRetour || "",
        incidentId: ""
      };
    }).filter(row => row.garage || row.vehicule || row.facture || row.travaux || row.dateDepart || row.dateInscription);
    return { type: "operations", rows };
  }

  let type = null;
  if (/incident|sinistre|accident/.test(sheetLabel) || has(/incident|sinistre|accident/)) type = "incidents";
  else if (/chauffeur|conducteur/.test(sheetLabel) || (has(/chauffeur|conducteur/) && has(/matricule|nom/))) type = "chauffeurs";
  else if (/garage|atelier/.test(sheetLabel) || (has(/garage|atelier/) && has(/adresse|telephone|tel|quota/))) type = "garages";
  else if (/bus|vehicule|véhicule|parc/.test(sheetLabel) || (has(/immatriculation/) && has(/numero|n°|parc|bus/))) type = "bus";
  if (!type) return { type: null, rows: [] };

  const parseDate = value => { if (!value) return ""; if (value instanceof Date) return value.toISOString().slice(0, 10); const text = String(value).trim(); const match = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : text; };
  const text = value => String(value || "").trim();
  const rows = matrix.slice(headerIndex + 1).filter(row => Array.isArray(row) && row.some(cell => String(cell).trim())).map((source, offset) => {
    if (type === "bus") return { sourceNo: offset + 1, immatriculation: text(valueAt(source, /immatriculation|plaque/)), numero: text(valueAt(source, /numero|n°|parc|bus/)), marque: text(valueAt(source, /marque/)), modele: text(valueAt(source, /modele|model/)), statut: text(valueAt(source, /statut|status/)) || "En service" };
    if (type === "garages") return { nom: text(valueAt(source, /nom|garage|atelier/)), adresse: text(valueAt(source, /adresse|address/)), telephone: text(valueAt(source, /telephone|tel/)), quotaMax: Number(valueAt(source, /quota|capacite|capacité/)) || 40, active: true };
    if (type === "chauffeurs") return { nom: text(valueAt(source, /nom/)), prenom: text(valueAt(source, /prenom|prénom/)), matricule: text(valueAt(source, /matricule/)), telephone: text(valueAt(source, /telephone|tel/)), busAffecte: text(valueAt(source, /bus|vehicule/)), statut: text(valueAt(source, /statut|status/)) || "Actif" };
    return { busRef: text(valueAt(source, /bus|vehicule|numero/)), titre: text(valueAt(source, /titre|objet|incident/)), description: text(valueAt(source, /description|details|détail/)), date: parseDate(valueAt(source, /date/)), priorite: text(valueAt(source, /priorite|priorité|urgence/)) || "Moyenne", statut: text(valueAt(source, /statut|status/)) || "En attente" };
  }).filter(row => Object.values(row).some(value => value !== "" && value !== 0));
  return { type, rows };
}

function syncCarrosserieOperations(rows) {
  let importedCount = 0;
  (rows || []).forEach(row => {
    if (!row || (!row.garage && !row.vehicule && !row.facture && !row.travaux && !row.dateDepart && !row.dateInscription)) return;
    if (!row.garage || !row.vehicule || !row.dateInscription || !row.travaux || !row.dateDepart) return;

    const normalizedFacture = String(row.facture || "").trim().toLowerCase();
    const existing = normalizedFacture
      ? db.excelCarrosserie.find(item => String(item.facture || "").trim().toLowerCase() === normalizedFacture)
      : null;

    if (existing) {
      Object.assign(existing, row, { id: existing.id });
      return;
    }

    db.excelCarrosserie.push({
      id: `car-import-${Date.now()}-${importedCount}`,
      sourceNo: db.excelCarrosserie.length + 1 + importedCount,
      incidentId: "",
      ...row
    });
    importedCount += 1;
  });
  return importedCount;
}

function confirmCarrosserieImport() {
  const pending = window._pendingCarrosserieImport;
  if (!pending) return;
  const shouldSync = document.getElementById("car-import-sync")?.checked !== false;
  const shouldReset = document.getElementById("car-import-reset")?.checked !== false;

  if (shouldReset) {
    db.excelCarrosserie = [];
    db.incidents = (db.incidents || []).map(incident => ({
      ...incident,
      carrosserieRef: "",
      factureRef: "",
      coutCarrosserie: 0,
      garageCarrosserie: ""
    }));
  }

  const counts = syncCarrosserieReferenceTables(pending.references);
  const importedOperations = syncCarrosserieOperations((pending.operations || []).flatMap(sheet => sheet.rows));
  saveDB(db);
  closeModal(null, true);
  window._pendingCarrosserieImport = null;
  if (shouldSync) syncCarrosserieWithIncidents(false);
  renderCarrosserieModule();
  renderIncidents();
  alert(`Synchronisation terminée : ${counts.bus} bus, ${counts.garages} garages, ${counts.chauffeurs} chauffeurs et ${counts.incidents} incidents référencés. ${importedOperations} opération(s) importée(s) dans le registre carrosserie. Le registre a été ${shouldReset ? "remplacé" : "conservé"}.`);
}

function syncCarrosserieReferenceTables(references) {
  const counts = { bus: 0, garages: 0, chauffeurs: 0, incidents: 0 };
  (references.bus || []).forEach(row => {
    const existing = db.bus.find(bus => (row.numero && String(bus.numero) === String(row.numero)) || (row.immatriculation && bus.immatriculation === row.immatriculation));
    if (existing) Object.assign(existing, row);
    else db.bus.push({ id: `b-import-${Date.now()}-${counts.bus}`, ...row });
    counts.bus++;
  });
  (references.garages || []).forEach(row => {
    if (!row.nom) return;
    const existing = db.garages.find(garage => garage.nom.toLowerCase() === row.nom.toLowerCase());
    if (existing) Object.assign(existing, row);
    else db.garages.push({ id: `g-import-${Date.now()}-${counts.garages}`, ...row });
    counts.garages++;
  });
  (references.chauffeurs || []).forEach(row => {
    if (!row.matricule && !row.nom) return;
    const existing = db.chauffeurs.find(chauffeur => row.matricule && chauffeur.matricule === row.matricule);
    if (existing) Object.assign(existing, row);
    else db.chauffeurs.push({ id: `c-import-${Date.now()}-${counts.chauffeurs}`, ...row });
    counts.chauffeurs++;
  });
  (references.incidents || []).forEach(row => {
    if (!row.titre && !row.description) return;
    const bus = db.bus.find(item => String(item.numero) === row.busRef || item.immatriculation === row.busRef);
    const existing = db.incidents.find(incident => bus && incident.busId === bus.id && incident.date === row.date && incident.titre === row.titre);
    const incident = { id: existing?.id || `in-import-${Date.now()}-${counts.incidents}`, busId: bus?.id || "", chauffeurId: "", titre: row.titre || "Incident importé", description: row.description || row.titre, date: row.date || new Date().toISOString().slice(0, 10), priorite: row.priorite, statut: row.statut, photo: "", carrosserieRef: existing?.carrosserieRef || "", factureRef: existing?.factureRef || "", coutCarrosserie: existing?.coutCarrosserie || 0, garageCarrosserie: existing?.garageCarrosserie || "" };
    if (existing) Object.assign(existing, incident); else db.incidents.push(incident);
    counts.incidents++;
  });
  return counts;
}

function syncCarrosserieWithIncidents(showFeedback = true) {
  let linked = 0;
  let created = 0;
  (db.excelCarrosserie || []).forEach(operation => {
    if (operation.incidentId && db.incidents.some(incident => incident.id === operation.incidentId)) return;
    const bus = String(operation.vehicule || "").replace(/\D/g, "");
    const operationDate = new Date(operation.dateInscription || operation.dateDepart || "");
    const match = db.incidents.find(incident => {
      const incidentBus = db.bus.find(item => item.id === incident.busId);
      const incidentNumber = String(incidentBus?.numero || "").replace(/\D/g, "");
      const incidentDate = new Date(incident.date || "");
      return bus && bus === incidentNumber && Math.abs(incidentDate - operationDate) <= 45 * 86400000;
    });
    const incident = match || { id: `in-car-${Date.now()}-${created}`, busId: db.bus.find(item => String(item.numero).replace(/\D/g, "") === bus)?.id || "", chauffeurId: "", titre: `Dégât carrosserie bus ${operation.vehicule}`, description: `Incident généré depuis l'intervention ${operation.facture || operation.id}. ${operation.travaux}`, date: operation.dateInscription || operation.dateDepart, priorite: "Moyenne", statut: "En cours", photo: "", carrosserieRef: operation.id, factureRef: operation.facture || "", coutCarrosserie: Number(operation.montantCarrosserieUSD || 0), garageCarrosserie: operation.garage };
    if (!match) { db.incidents.push(incident); created++; }
    else { incident.carrosserieRef = operation.id; incident.factureRef = operation.facture || incident.factureRef || ""; incident.coutCarrosserie = Number(operation.montantCarrosserieUSD || 0); incident.garageCarrosserie = operation.garage; }
    operation.incidentId = incident.id;
    linked++;
  });
  saveDB(db);
  renderIncidents();
  renderCarrosserieModule();
  if (showFeedback) alert(`${linked} opération(s) rattachée(s), dont ${created} incident(s) créé(s).`);
}
