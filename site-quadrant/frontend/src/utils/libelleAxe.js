// Helpers de formatage des libellés d'axes (X et Y) du quadrant.
//
// Deux variantes :
//   - formatLibelle(variable, dateInser) : forme générique
//     « Taux ... (18 mois) » utilisée dans les tooltips et tableaux.
//   - formatLibelleAxe(variable, dateInser, population) : variante
//     pour titre d'axe SVG, qui bascule sur la forme « variable à N
//     mois (population) » quand la population est connue — évite de
//     doubler les parenthèses « (18 mois) (sortants 2023) ».
//
// Centralisés ici pour assurer la cohérence entre :
//   - Quadrant.jsx (vue principale) — voir formatLibelleAxe interne
//     historiquement défini là.
//   - QuadrantAnime.jsx (modale d'animation Phase 11b).

export function formatLibelle(variable, dateInser) {
  if (!variable) return '';
  if (!dateInser) return variable;
  return `${variable} (${dateInser} mois)`;
}

export function formatLibelleAxe(variable, dateInser, population) {
  if (!variable) return '';
  if (!population) return formatLibelle(variable, dateInser);
  if (!dateInser)  return `${variable} (${population})`;
  return `${variable} à ${dateInser} mois (${population})`;
}
