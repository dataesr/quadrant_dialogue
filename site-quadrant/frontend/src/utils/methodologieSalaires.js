// Texte d'aide court des indicateurs de salaire (Phase 15.7).
//
// Source unique réutilisée par les deux « ? » contextuels : la rubrique
// « Salaires des diplômés » de la barre latérale (DetailsPanel) et l'en-tête
// de l'onglet « Salaires » de la modale d'analyse fine (OngletSalaires).
//
// Tooltip purement contextuel (~50 mots) — pas de renvoi vers la modale
// méthodologie, qui porte le texte SIES complet (cf. `salaires` dans
// public/methodologie.json). Conservé en constante JS (et non dans le JSON
// SFTP) pour être disponible synchroniquement, sans dépendre du chargement
// asynchrone de la méthodologie.

export const AIDE_SALAIRES =
  'Salaire mensuel net en équivalent temps plein, calculé à partir de la DSN. '
  + 'Inclut les primes et indemnités. Exclut les emplois aidés (sauf contrats '
  + 'aidés) et l’apprentissage. Salaires observés de 12 à 30 mois après la '
  + 'diplomation. Médiane et quartiles affichés uniquement si au moins 20 salariés.';
