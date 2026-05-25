import {
  decouperDomaineSerie,
  nbPointsValides,
  segmenter,
} from './historique.js';

// Mini-graphique d'évolution d'un indicateur sur les millésimes
// disponibles. SVG natif (cohérent avec le reste du quadrant).
//
//  - Axe X : un tick par millésime, étiquetté (année à 4 chiffres
//    affichée tournée pour économiser la largeur ? non — on reste sur
//    horizontal, c'est plus lisible. 6 millésimes max pour Master,
//    largement tenables).
//  - Axe Y : 0-100 %, ligne pointillée grise à 50 % comme repère.
//  - Points pleins : taux diffusable.
//  - Points creux  : non-diffusable (denom < 5, taux masqué).
//  - Ligne reliant les points consécutifs avec taux != null. Les
//    non-diffusables interrompent la ligne (pas de valeur à relier).
//
// Si l'historique a moins de 2 points valides, on n'affiche rien — le
// composant parent décidera de l'absence visuelle.
//
// Highlight du millésime « courant » : si props.millesimeCourant est
// renseigné, le point correspondant a un anneau autour.

const W = 240;
const H = 100;
const M = { top: 10, right: 14, bottom: 22, left: 28 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

const COULEUR_PRINCIPALE = '#0E0E60'; // bleu DSFR neutre
const COULEUR_GRILLE     = '#cccccc';

export default function MiniGrapheEvolution({ serie, millesimeCourant }) {
  const domaine = decouperDomaineSerie(serie);
  if (nbPointsValides(domaine) < 2) return null;

  // Échelles : X linéaire sur la plage de millésimes du domaine (en
  // pratique 5-6 années pour Master, mais on n'hardcode pas).
  const xs = domaine.map((p) => p.millesime);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xScale = (m) =>
    xMin === xMax
      ? M.left + PLOT_W / 2
      : M.left + ((m - xMin) / (xMax - xMin)) * PLOT_W;
  const yScale = (taux) => M.top + (1 - taux / 100) * PLOT_H;

  const segments = segmenter(domaine);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Évolution sur les millésimes">
      {/* Ligne de repère à 50% — sert d'ancrage visuel rapide. */}
      <line
        x1={M.left} x2={M.left + PLOT_W}
        y1={yScale(50)} y2={yScale(50)}
        stroke={COULEUR_GRILLE} strokeDasharray="2 3" strokeWidth={1}
      />
      {/* Axe Y : 0 et 100% étiquetés discrètement. */}
      <text x={M.left - 4} y={yScale(0)  + 3} fontSize={9} textAnchor="end" fill="#666">0 %</text>
      <text x={M.left - 4} y={yScale(100) + 3} fontSize={9} textAnchor="end" fill="#666">100 %</text>

      {/* Axe X : un tick par millésime du domaine. */}
      {domaine.map((p) => (
        <g key={p.millesime}>
          <line
            x1={xScale(p.millesime)} x2={xScale(p.millesime)}
            y1={M.top + PLOT_H} y2={M.top + PLOT_H + 3}
            stroke="#666" strokeWidth={1}
          />
          <text
            x={xScale(p.millesime)}
            y={M.top + PLOT_H + 14}
            fontSize={9}
            textAnchor="middle"
            fill="#666"
          >
            {p.millesime}
          </text>
        </g>
      ))}

      {/* Segments de la courbe (lignes continues entre points valides
          consécutifs ; les non-diffusables et les trous interrompent). */}
      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.map((p) => `${xScale(p.millesime)},${yScale(p.taux)}`).join(' ')}
          fill="none"
          stroke={COULEUR_PRINCIPALE}
          strokeWidth={1.5}
        />
      ))}

      {/* Points. */}
      {domaine.map((p) => {
        const cx = xScale(p.millesime);
        const courant = String(p.millesime) === String(millesimeCourant);
        if (p.taux !== null) {
          return (
            <g key={p.millesime}>
              {courant && (
                <circle cx={cx} cy={yScale(p.taux)} r={5}
                  fill="none" stroke={COULEUR_PRINCIPALE} strokeWidth={1} opacity={0.5} />
              )}
              <circle cx={cx} cy={yScale(p.taux)} r={3}
                fill={COULEUR_PRINCIPALE} />
            </g>
          );
        }
        if (p.nonDiffusable) {
          // Point creux à mi-hauteur faute de taux à représenter — c'est
          // un repère « il y a eu une mesure mais sous le seuil de
          // diffusion ». Position au niveau du repère 50% pour ne pas
          // perturber la lecture de l'échelle.
          return (
            <circle
              key={p.millesime}
              cx={cx} cy={yScale(50)} r={3}
              fill="white" stroke={COULEUR_PRINCIPALE} strokeWidth={1.2}
            />
          );
        }
        return null; // pas de donnée : rien
      })}
    </svg>
  );
}
