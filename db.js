// Base de données simulée pour l'ERP de Gestion des Réparations et Peinture des Bus

const DEFAULT_DB = {
  users: [
    { id: "u1", username: "admin", name: "admin", role: "admin", email: "admin@traficbus.fr" },
    { id: "u2", username: "chef_atelier", name: "Marc Moreau (Chef)", role: "chef_atelier", email: "m.moreau@traficbus.fr", password: "atelier123" },
    { id: "u3", username: "parc_mgr", name: "Alice Bertrand (Parc)", role: "parc_mgr", email: "a.bertrand@traficbus.fr", password: "parc123" },
    { id: "u4", username: "lecteur", name: "Visiteur", role: "lecteur", email: "guest@traficbus.fr", password: "lecture123" }
  ],
  currentUser: { id: "u1", username: "admin", name: "admin", role: "admin", email: "admin@traficbus.fr" },
  bus: [
    { id: "b1", immatriculation: "AA-123-AA", numero: "101", marque: "Mercedes-Benz", modele: "Citaro C2", annee: 2018, statut: "En service", kilometrage: 142000, motorisation: "Diesel (Euro 6)", documents: ["carte_grise.pdf", "assurance_2026.pdf"] },
    { id: "b2", immatriculation: "BB-456-BB", numero: "204", marque: "Iveco", modele: "Urbanway 12", annee: 2020, statut: "En réparation", kilometrage: 89000, motorisation: "Hybride", documents: ["carte_grise_204.pdf"] },
    { id: "b3", immatriculation: "CC-789-CC", numero: "312", marque: "Volvo", modele: "7900 Electric", annee: 2021, statut: "En peinture", kilometrage: 62000, motorisation: "Électrique", documents: ["carte_grise_312.pdf", "garantie_batterie.pdf"] },
    { id: "b4", immatriculation: "DD-101-DD", numero: "405", marque: "MAN", modele: "Lion's City", annee: 2019, statut: "En service", kilometrage: 115000, motorisation: "GNV", documents: ["carte_grise_405.pdf"] },
    { id: "b5", immatriculation: "EE-202-EE", numero: "518", marque: "Scania", modele: "Citywide", annee: 2017, statut: "Hors service", kilometrage: 198000, motorisation: "Diesel", documents: ["carte_grise_518.pdf"] }
  ],
  garages: [
    { id: "g1", nom: "Garage Central - Maintenance", adresse: "45 Avenue de la Gare, Paris", telephone: "01 40 20 30 40", quotaMax: 5, active: true },
    { id: "g2", nom: "Garage Est - Réparations Rapides", adresse: "12 Rue de l'Industrie, Noisy-le-Sec", telephone: "01 48 50 60 70", quotaMax: 3, active: true },
    { id: "g3", nom: "Atelier Peinture Nord", adresse: "8 Boulevard des Carrossiers, Saint-Denis", telephone: "01 49 10 20 30", quotaMax: 2, active: true }
  ],
  chauffeurs: [
    { id: "c1", nom: "Dupont", prenom: "Jean", matricule: "CH-0042", telephone: "06 12 34 56 78", busAffecte: "b1", statut: "Actif" },
    { id: "c2", nom: "Martin", prenom: "Marie", matricule: "CH-0089", telephone: "06 98 76 54 32", busAffecte: "b4", statut: "Actif" },
    { id: "c3", nom: "Dubois", prenom: "Pierre", matricule: "CH-0105", telephone: "06 45 67 89 01", busAffecte: "", statut: "En congé" },
    { id: "c4", nom: "Lefevre", prenom: "Sophie", matricule: "CH-0122", telephone: "06 89 01 23 45", busAffecte: "b2", statut: "Actif" }
  ],
  reparations: [
    { id: "r1", busId: "b2", garageId: "g1", description: "Remplacement disques et plaquettes de frein avant", dateDebut: "2026-07-10", dateFinPrevue: "2026-07-14", coutEstime: 1200, coutReel: 0, statut: "En cours", validation: "Validé", piecesConsommees: [{ pieceId: "p1", quantite: 2 }] },
    { id: "r2", busId: "b3", garageId: "g3", description: "Peinture complète flanc gauche suite accrochage", dateDebut: "2026-07-12", dateFinPrevue: "2026-07-16", coutEstime: 2800, coutReel: 0, statut: "En cours", validation: "Validé", piecesConsommees: [{ pieceId: "p4", quantite: 15 }, { pieceId: "p5", quantite: 1 }] },
    { id: "r3", busId: "b5", garageId: "g2", description: "Panne alternateur et problème de batterie", dateDebut: "2026-07-01", dateFinPrevue: "2026-07-04", coutEstime: 850, coutReel: 910, statut: "Terminé", validation: "Validé", piecesConsommees: [{ pieceId: "p2", quantite: 1 }] },
    { id: "r4", busId: "b1", garageId: "g1", description: "Entretien périodique - Vidange + filtres", dateDebut: "2026-06-25", dateFinPrevue: "2026-06-26", coutEstime: 450, coutReel: 450, statut: "Terminé", validation: "Validé", piecesConsommees: [{ pieceId: "p3", quantite: 3 }] },
    { id: "r5", busId: "b5", garageId: "g1", description: "Changement boîte de vitesses hydraulique", dateDebut: "2026-07-13", dateFinPrevue: "2026-07-24", coutEstime: 5400, coutReel: 0, statut: "En attente", validation: "En attente de validation", piecesConsommees: [] }
  ],
  peinture: [
    { id: "pt1", reparationId: "r2", busId: "b3", devisRef: "DEV-2026-098", typePeinture: "Polyuréthane Brillant Direct", surfaceM2: 18, quantiteL: 15, coutMatiere: 450, coutMainOeuvre: 2350, statut: "En cours" },
    { id: "pt2", reparationId: "r4", busId: "b1", devisRef: "DEV-2026-042", typePeinture: "Retouches vernis pare-choc", surfaceM2: 2, quantiteL: 1.5, coutMatiere: 80, coutMainOeuvre: 250, statut: "Terminé" }
  ],
  incidents: [
    { id: "in1", busId: "b3", chauffeurId: "c2", titre: "Accrochage flanc gauche contre poteau", description: "Le chauffeur a heurté un poteau de signalisation en tournant au dépôt. Carrosserie froissée sur 2 mètres, peinture écaillée. Pas de blessés.", date: "2026-07-11", priorite: "Moyenne", statut: "En cours", photo: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800", carrosserieRef: "", factureRef: "", coutCarrosserie: 0, garageCarrosserie: "" },
    { id: "in2", busId: "b5", chauffeurId: "c3", titre: "Surchauffe moteur avec fumée blanche", description: "Surchauffe brutale sur l'autoroute A4. Arrêt d'urgence. Remorquage nécessaire. Suspicion de joint de culasse ou fuite liquide de refroidissement majeure.", date: "2026-07-13", priorite: "Haute", statut: "En attente", photo: "", carrosserieRef: "", factureRef: "", coutCarrosserie: 0, garageCarrosserie: "" },
    { id: "in3", busId: "b4", chauffeurId: "c1", titre: "Voyant ABS allumé par intermittence", description: "Le témoin ABS s'allume brièvement lors des freinages appuyés sur chaussée humide. Le comportement de freinage semble normal.", date: "2026-07-05", priorite: "Faible", statut: "Résolu", photo: "", carrosserieRef: "", factureRef: "", coutCarrosserie: 0, garageCarrosserie: "" }
  ],
  pieces: [
    { id: "p1", code: "P-BRK-32", designation: "Disques de frein ventilés (paire)", categorie: "Freinage", quantiteStock: 8, seuilAlerte: 3, prixUnitaire: 280, fournisseurId: "f1" },
    { id: "p2", code: "P-ALT-88", designation: "Alternateur 24V 150A", categorie: "Électricité", quantiteStock: 2, seuilAlerte: 2, prixUnitaire: 420, fournisseurId: "f2" },
    { id: "p3", code: "P-FIL-01", designation: "Filtre à huile moteur gros volume", categorie: "Filtration", quantiteStock: 25, seuilAlerte: 10, prixUnitaire: 35, fournisseurId: "f1" },
    { id: "p4", code: "P-PNT-BLU", designation: "Peinture Bleu RATP (Pot 1L)", categorie: "Peinture", quantiteStock: 30, seuilAlerte: 15, prixUnitaire: 24, fournisseurId: "f3" },
    { id: "p5", code: "P-PNT-PRM", designation: "Apprêt Carrosserie Antirouille (Pot 5L)", categorie: "Peinture", quantiteStock: 4, seuilAlerte: 2, prixUnitaire: 90, fournisseurId: "f3" },
    { id: "p6", code: "P-PNT-CLR", designation: "Vernis acrylique haute brillance (Pot 5L)", categorie: "Peinture", quantiteStock: 1, seuilAlerte: 3, prixUnitaire: 110, fournisseurId: "f3" }
  ],
  fournisseurs: [
    { id: "f1", nom: "EuroParts Bus & Coach", contact: "Gérard Lambert", telephone: "04 72 30 40 50", email: "contact@europarts.fr", commandesEncours: 2, facturesImpayees: 1250 },
    { id: "f2", nom: "PowerVolt Auto-Electric", contact: "Valérie Dumas", telephone: "02 40 80 90 10", email: "info@powervolt.com", commandesEncours: 0, facturesImpayees: 0 },
    { id: "f3", nom: "Carrosserie & Peinture Pro", contact: "Stéphane Rossi", telephone: "05 56 12 34 56", email: "commande@cppro.fr", commandesEncours: 1, facturesImpayees: 890 }
  ],
  excelPeinture: (typeof EXCEL_PEINTURE_DATA !== "undefined" ? JSON.parse(JSON.stringify(EXCEL_PEINTURE_DATA)) : []),
  excelSettings: {
    tauxChange: 2300,
    quotaGarage: 40
  },
  excelCarrosserie: [
    { id: "car-1", sourceNo: 1, garage: "GEORGES", dateInscription: "2026-07-01", chauffeur: "KABAMBA PIERRE", matricule: "CH-0042", vehicule: "312", facture: "CAR-2026-01", montantCarrosserieUSD: 850.0, typeDegat: "Débosselage", travaux: "Débosselage aile avant droite et remplacement vitre latérale", dateDepart: "2026-07-01", dateRetour: "2026-07-08", incidentId: "in1" },
    { id: "car-2", sourceNo: 2, garage: "AUTO LUSHI", dateInscription: "2026-07-04", chauffeur: "MARTIN MARIE", matricule: "CH-0089", vehicule: "405", facture: "CAR-2026-02", montantCarrosserieUSD: 1250.0, typeDegat: "Pare-chocs", travaux: "Redressage face avant suite impact et fixation pare-choc", dateDepart: "2026-07-04", dateRetour: "2026-07-14", incidentId: "" },
    { id: "car-3", sourceNo: 3, garage: "MERCURIS", dateInscription: "2026-07-10", chauffeur: "LEFEVRE SOPHIE", matricule: "CH-0122", vehicule: "204", facture: "CAR-2026-03", montantCarrosserieUSD: 450.0, typeDegat: "Vitrage", travaux: "Remplacement pare-brise fissuré et tôlerie portière chauffeur", dateDepart: "2026-07-10", dateRetour: "", incidentId: "" }
  ],
  carrosserieSettings: {
    tauxChange: 2300,
    quotaGarage: 40
  },
  auditLog: [
    { id: "a1", date: "2026-07-13T08:00:00.000Z", userId: "u1", username: "admin", action: "Connexion", details: "L'administrateur s'est connecté au système." },
    { id: "a2", date: "2026-07-13T08:15:30.000Z", userId: "u2", username: "chef_atelier", action: "Création Réparation", details: "Dossier de réparation r5 créé pour le bus b5." }
  ],
  settings: {
    tva: 20,
    coutMainOeuvreHoraire: 75,
    garagePassageLimit: 40,
    typesIncidents: ["Accident", "Panne mécanique", "Panne électrique", "Carrosserie/Peinture", "Autre"],
    alertesActivees: true
  }
};

const DB_KEY = "trafic_bus_erp_db";

function getDB() {
  const data = localStorage.getItem(DB_KEY);
  if (!data) {
    saveDB(DEFAULT_DB);
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
  try {
    const db = JSON.parse(data);
    let modified = false;

    // Module strict Suivi Peinture Excel (321 lignes d'origine)
    if (!Array.isArray(db.excelPeinture) || db.excelPeinture.length === 0) {
      db.excelPeinture = (typeof EXCEL_PEINTURE_DATA !== "undefined")
        ? JSON.parse(JSON.stringify(EXCEL_PEINTURE_DATA))
        : [];
      modified = true;
    }
    if (!db.excelSettings) {
      db.excelSettings = { tauxChange: 2300, quotaGarage: 40 };
      modified = true;
    }

    if (!Array.isArray(db.excelCarrosserie)) {
      db.excelCarrosserie = [];
      modified = true;
    }

    // Remove legacy carrosserie columns from the painting module and migrate them once.
    const legacyCarrosserieRows = (db.excelPeinture || []).filter(row =>
      Number(row.carrosserieUSD || 0) > 0 || row.typeDegat || row.incidentId
    );
    if (legacyCarrosserieRows.length) {
      const nextSourceNo = (db.excelCarrosserie || []).reduce((max, row) => Math.max(max, Number(row.sourceNo) || 0), 0);
      legacyCarrosserieRows.forEach((row, index) => {
        db.excelCarrosserie.push({
          id: `car-migrated-${Date.now()}-${index}`,
          sourceNo: nextSourceNo + index + 1,
          garage: row.garage || "SANS GARAGE",
          dateInscription: row.dateInscription || row.dateDepart || "",
          chauffeur: row.chauffeur || "",
          matricule: row.matricule || "",
          vehicule: row.vehicule || "",
          facture: row.facture || "",
          montantCarrosserieUSD: Number(row.carrosserieUSD || 0),
          typeDegat: row.typeDegat || "",
          travaux: row.travaux || "",
          dateDepart: row.dateDepart || "",
          dateRetour: row.dateRetour || "",
          incidentId: row.incidentId || ""
        });
      });
      modified = true;
    }
    if (Array.isArray(db.excelPeinture)) {
      db.excelPeinture = db.excelPeinture.map(row => {
        const clean = { ...row };
        ["carrosserieUSD", "typeDegat", "incidentId"].forEach(key => {
          if (Object.prototype.hasOwnProperty.call(clean, key)) {
            delete clean[key];
            modified = true;
          }
        });
        return clean;
      });
    }

    // Module dédié Suivi Carrosserie Excel
    if (!Array.isArray(db.excelCarrosserie) || db.excelCarrosserie.length === 0) {
      db.excelCarrosserie = JSON.parse(JSON.stringify(DEFAULT_DB.excelCarrosserie));
      modified = true;
    }
    db.excelCarrosserie = db.excelCarrosserie.map(row => ({
      ...row,
      montantCarrosserieUSD: Number(row.montantCarrosserieUSD ?? row.montantUSD ?? row.carrosserieUSD ?? 0),
      typeDegat: row.typeDegat || "",
      photo: row.photo || ""
    }));
    if (!db.carrosserieSettings) {
      db.carrosserieSettings = { tauxChange: 2300, quotaGarage: 40 };
      modified = true;
    }

    // Synchronisation / Justification avec les Incidents
    if (Array.isArray(db.incidents)) {
      db.incidents.forEach(inc => {
        if (typeof inc.carrosserieRef === "undefined") {
          inc.carrosserieRef = "";
          modified = true;
        }
        if (typeof inc.factureRef === "undefined") {
          inc.factureRef = "";
          modified = true;
        }
        if (typeof inc.coutCarrosserie === "undefined") {
          inc.coutCarrosserie = 0;
          modified = true;
        }
        if (typeof inc.garageCarrosserie === "undefined") {
          inc.garageCarrosserie = "";
          modified = true;
        }
      });
    }

    if (db.users) {
      db.users.forEach(u => {
        if (u.id === "u1" && u.name === "Jean Administrateur") {
          u.name = "admin";
          modified = true;
        }
        if (u.id === "u1" && Object.prototype.hasOwnProperty.call(u, "password")) {
          delete u.password;
          modified = true;
        }
      });
    }
    if (db.currentUser && db.currentUser.id === "u1" && db.currentUser.name === "Jean Administrateur") {
      db.currentUser.name = "admin";
      modified = true;
    }
    if (db.currentUser && db.currentUser.id === "u1" && Object.prototype.hasOwnProperty.call(db.currentUser, "password")) {
      delete db.currentUser.password;
      modified = true;
    }
    if (modified) {
      saveDB(db);
    }
    return db;
  } catch (e) {
    console.error("Erreur lors de la lecture du LocalStorage, réinitialisation...", e);
    saveDB(DEFAULT_DB);
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function resetDB() {
  saveDB(DEFAULT_DB);
  return JSON.parse(JSON.stringify(DEFAULT_DB));
}

function logAction(userId, action, details) {
  const db = getDB();
  const user = db.users.find(u => u.id === userId);
  const newLog = {
    id: "a_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    date: new Date().toISOString(),
    userId: userId,
    username: user ? user.username : "Système",
    action: action,
    details: details
  };
  db.auditLog.unshift(newLog);
  if (db.auditLog.length > 200) {
    db.auditLog = db.auditLog.slice(0, 200);
  }
  saveDB(db);
}
