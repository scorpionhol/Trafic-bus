# Suivis Excel

L'application maintient deux registres Excel indépendants :

- **Suivi Peinture — Excel** : `db.excelPeinture` conserve uniquement `garage`, `dateInscription`, `chauffeur`, `matricule`, `vehicule`, `facture`, `incidentUSD`, `peintureUSD`, `travaux`, `dateDepart` et `dateRetour`. Son import, ses KPI, ses conversions CDF et son export CSV sont strictement dédiés à la peinture.
- **Suivi Carrosserie — Excel** : `db.excelCarrosserie` conserve les opérations de tôlerie avec `montantCarrosserieUSD`, `typeDegat`, `travaux` et `incidentId`. Le module possède ses propres paramètres, import, export, synthèse et KPI.

Le bouton **Synchroniser avec Incidents** rapproche les opérations par numéro de bus et période. Il rattache ou crée un incident et renseigne `carrosserieRef`, `factureRef`, `coutCarrosserie` et `garageCarrosserie`.

Une migration automatique retire les anciennes colonnes carrosserie du suivi peinture et déplace les données correspondantes vers le registre carrosserie. Le classeur peinture d'origine reste ainsi limité à ses 321 lignes et à ses colonnes strictes.

Lors d'un import carrosserie multi-feuilles, les tableaux `Bus`, `Garages`, `Chauffeurs` et `Incidents` sont fusionnés avec les référentiels locaux par leurs identifiants métier. Les tableaux nommés `Opération`, `Opérations`, `Traitement` ou `Suivi` sont volontairement ignorés : ils ne sont pas ajoutés à `db.excelCarrosserie`.

