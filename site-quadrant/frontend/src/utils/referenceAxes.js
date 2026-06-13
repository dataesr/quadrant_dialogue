// Helpers partagés pour les lignes de référence des axes (Phase 15.1/15.2).
// Mutualisés entre le quadrant statique (LignesReference.jsx) et le
// quadrant animé (QuadrantAnime.jsx) pour garantir une différenciation
// visuelle et des libellés strictement identiques.

// Différenciation visuelle par périmètre :
//   - établissement   : bleu Marianne, pointillé court.
//   - national         : gris, pointillé long.
//   - positionnement   : gris neutre (référence unique de la vue
//                        Positionnement — pas de distinction étab/national).
export const STYLE_PERIMETRE = {
  etab:           { stroke: '#000091', dash: '4 4' },
  national:       { stroke: '#666666', dash: '8 4' },
  positionnement: { stroke: '#555555', dash: '4 3' },
};

const NOM_MESURE = { mediane: 'Médiane', moyenne: 'Moyenne' };
const SUFFIXE_PERIMETRE = { etab: 'etab', national: 'nationale' };

// Libellé humain d'une référence (« Médiane établissement »,
// « Moyenne nationale », « Médiane » en Positionnement).
export function libelleReference(ref) {
  const m = NOM_MESURE[ref.mesure] || 'Médiane';
  if (ref.perimetre === 'etab')     return `${m} établissement`;
  if (ref.perimetre === 'national') return `${m} nationale`;
  return m; // positionnement (vue nationale par construction)
}

// Clé du bloc `axes` correspondant à une référence (sans le suffixe
// _x / _y). Mentions : `${mesure}_etab` | `${mesure}_nationale`.
// Positionnement : `mediane` | `moyenne` (data.reference dérivé de
// l'agrégation côté API → on lit data.reference, pas data.axes).
export function cleAxe(ref) {
  if (ref.perimetre === 'positionnement') return ref.mesure;
  return `${ref.mesure}_${SUFFIXE_PERIMETRE[ref.perimetre]}`;
}

// Descripteurs des références ACTIVES (sans coordonnées) selon la vue et
// l'état du sélecteur. Le rendu (statique ou animé) résout ensuite les
// coordonnées x/y depuis son propre bloc `axes`.
//   - Mentions       : une entrée par périmètre actif (étab / national).
//   - Positionnement : une entrée unique (mesure pilotée par
//                      referenceAxesPositionnement).
export function descripteursReferences(vue, { mesureAxes, perimetresAxes, referenceAxesPositionnement }) {
  if (vue !== 'mentions') {
    return [{ perimetre: 'positionnement', mesure: referenceAxesPositionnement }];
  }
  return (perimetresAxes || []).map((perimetre) => ({ perimetre, mesure: mesureAxes }));
}

// Format d'un taux (0..1) en pourcentage français : une décimale,
// virgule, espace insécable avant le %. « 0,755 » → « 75,5 % ».
export function formaterPourcentage(taux) {
  const v = (taux ?? 0) * 100;
  return v.toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) + ' %';
}
