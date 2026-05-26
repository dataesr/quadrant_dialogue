// Libellés humains des modes de référence des axes.
//
// Deux familles distinctes :
//   - Vue Mentions       : 3 modes (étab vs nationale → suffixe utile)
//                          Source : AppContext.referenceAxes
//   - Vue Positionnement : 2 modes (libellés courts, vue déjà nationale
//                          par construction → suffixe « nationale »
//                          implicite, ne pas l'ajouter)
//                          Source : AppContext.referenceAxesPositionnement
//
// Utilisé par QuadrantTable.jsx (mention au-dessus des sous-tableaux),
// exportXlsx.js (feuille Métadonnées + mention au-dessus de la
// feuille Données), exportPng.js (bandeau « Filtres » quand non-défaut).

export const LIBELLES_REFERENCE_AXES_MENTIONS = {
  mediane_etab:      'Médiane établissement',
  moyenne_etab:      'Moyenne établissement',
  moyenne_nationale: 'Moyenne nationale',
};

export const LIBELLES_REFERENCE_AXES_POSITIONNEMENT = {
  mediane: 'Médiane',
  moyenne: 'Moyenne',
};

// Résout le libellé selon la vue active. Fallback sur le défaut métier
// de chaque vue si filtres.* est manquant.
export function libelleReferenceAxes(vue, filtres) {
  if (vue === 'etablissements') {
    return LIBELLES_REFERENCE_AXES_POSITIONNEMENT[filtres?.referenceAxesPositionnement]
      || 'Médiane';
  }
  return LIBELLES_REFERENCE_AXES_MENTIONS[filtres?.referenceAxes]
    || 'Médiane établissement';
}
