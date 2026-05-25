import {
  decouperDomaineSerie,
  nbPointsValides,
  segmenter,
} from './historique.js';

// Sparkline minimaliste : silhouette de la série, sans axe ni étiquette.
// Pensé pour la colonne de droite de la table « Autres indicateurs ».
//
// Comme le MiniGrapheEvolution :
//  - on découpe au domaine où l'indicateur est disponible ;
//  - on n'affiche rien si < 2 points valides ;
//  - non-diffusable = point creux à hauteur médiane (50% de l'échelle
//    locale), pas de valeur à représenter.

const W = 60;
const H = 16;
const PAD = 2;

const COULEUR = '#666666';

export default function Sparkline({ serie }) {
  const domaine = decouperDomaineSerie(serie);
  if (nbPointsValides(domaine) < 2) return null;

  // Échelle Y locale : entre le min et le max de la série pour bien
  // utiliser la hauteur (le sparkline n'a pas besoin de l'échelle
  // absolue 0-100 ; il porte une forme, pas un niveau).
  const tauxNonNuls = domaine.map((p) => p.taux).filter((t) => typeof t === 'number');
  let yMin = Math.min(...tauxNonNuls);
  let yMax = Math.max(...tauxNonNuls);
  if (yMin === yMax) {
    yMin -= 1; yMax += 1; // évite la division par zéro et plateau écrasé
  }

  const xs = domaine.map((p) => p.millesime);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xScale = (m) =>
    xMin === xMax ? W / 2 : PAD + ((m - xMin) / (xMax - xMin)) * (W - 2 * PAD);
  const yScale = (taux) =>
    PAD + (1 - (taux - yMin) / (yMax - yMin)) * (H - 2 * PAD);

  const segments = segmenter(domaine);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Évolution">
      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.map((p) => `${xScale(p.millesime)},${yScale(p.taux)}`).join(' ')}
          fill="none"
          stroke={COULEUR}
          strokeWidth={1}
        />
      ))}
      {domaine.map((p) => {
        if (typeof p.taux === 'number') {
          return (
            <circle key={p.millesime}
              cx={xScale(p.millesime)} cy={yScale(p.taux)} r={1.4}
              fill={COULEUR}
            />
          );
        }
        if (p.nonDiffusable) {
          return (
            <circle key={p.millesime}
              cx={xScale(p.millesime)} cy={H / 2} r={1.4}
              fill="white" stroke={COULEUR} strokeWidth={0.8}
            />
          );
        }
        return null;
      })}
    </svg>
  );
}
