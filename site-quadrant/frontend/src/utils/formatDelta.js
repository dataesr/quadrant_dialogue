// Formatage du delta entre deux taux (valeurs entre 0 et 1) pour
// l'affichage à côté d'une valeur courante. Convention française :
//   « (+0,3 pt) » pour une variation positive,
//   « (-3,0 pt) » pour négative,
//   « (0,0 pt)  » quand le delta est nul,
//   chaîne vide quand la valeur précédente est manquante (mention
//   inexistante l'année d'avant, cohorte non observable…).
//
// Le suffixe « pt » est la convention statistique française pour
// « point de pourcentage ». Une décimale, virgule.
//
// Utilisé par :
//   - Quadrant.jsx (QuadrantTooltip) — survol des bulles
//   - DetailsPanel.jsx (ValeurCourante) — cards X et Y

export function formatDelta(courant, precedent) {
  if (typeof courant !== 'number' || typeof precedent !== 'number') {
    return '';
  }
  // courant et precedent sont des taux dans [0, 1]. Le delta s'exprime
  // en POINTS de pourcentage : (courant - precedent) × 100.
  const deltaPts = (courant - precedent) * 100;
  const arrondi  = Math.round(deltaPts * 10) / 10; // 1 décimale

  if (arrondi === 0) return '(0,0 pt)';

  const signe = arrondi > 0 ? '+' : '-';
  const abs   = Math.abs(arrondi).toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `(${signe}${abs} pt)`;
}
