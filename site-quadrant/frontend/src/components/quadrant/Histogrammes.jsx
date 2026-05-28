import { MARGIN, PLOT_WIDTH, PLOT_HEIGHT } from './geometry.js';
import { calculerHistogramme } from '../../utils/histogramme.js';

// Histogrammes de distribution sur 10 tranches de 10 %, posés à
// l'extérieur du plot — en haut (axe X) et à droite (axe Y) — pour
// révéler la concentration des bulles le long de chaque axe sans
// surcharger l'aire de plot.
//
// Choix de placement : dans la marge existante (MARGIN.top = 50 px,
// MARGIN.right = 50 px) plutôt qu'en augmentant les marges et en
// rétrécissant le plot. La marge supérieure est libre (pas de titre
// d'axe X — celui-ci est en bas) ; la marge droite l'est aussi (les
// ticks Y sont à gauche). Aucune réduction de l'aire de plot, aucun
// débordement.
//
// Le composant n'est rendu que si `afficherDistributions === true` côté
// appelant ; il assume sa visibilité.
//
// Interactions : chaque barre est survolable. Le composant émet
// onHoverBar(info, event) et onLeaveBar() — le parent (Quadrant.jsx)
// affiche un tooltip HTML positionné selon l'événement.

const HISTO_NB_TRANCHES = 10;
const HISTO_BAND_TAILLE = 38;   // épaisseur de la bande (haut/droit)
const HISTO_GAP         = 4;    // espace entre la bande et le plot
const HISTO_COULEUR     = '#85B7EB';
const HISTO_OPACITE     = 0.7;
// Largeur minimale visuelle d'une barre non vide. Sans ce plancher, une
// tranche à 1 bulle sur un échantillon de 80 produit une barre quasi
// invisible (½ px) et impossible à survoler. On force 3 px ≈ 2 segments
// d'épaisseur de bordure, suffisant pour fournir une cible cliquable.
const HISTO_TAILLE_MIN_BARRE = 3;

export default function Histogrammes({ bulles, onHoverBar, onLeaveBar }) {
  if (!bulles || bulles.length === 0) return null;

  const countsX = calculerHistogramme(bulles, 'x', HISTO_NB_TRANCHES);
  const countsY = calculerHistogramme(bulles, 'y', HISTO_NB_TRANCHES);
  const maxX = Math.max(1, ...countsX);
  const maxY = Math.max(1, ...countsY);
  const totalX = countsX.reduce((a, b) => a + b, 0);
  const totalY = countsY.reduce((a, b) => a + b, 0);

  const xBarWidth  = PLOT_WIDTH  / HISTO_NB_TRANCHES;
  const yBarHeight = PLOT_HEIGHT / HISTO_NB_TRANCHES;

  // Coord du « bas » de la bande supérieure (juste au-dessus du plot)
  // et de la « gauche » de la bande droite (juste à droite du plot).
  const topBottom = MARGIN.top - HISTO_GAP;
  const rightLeft = MARGIN.left + PLOT_WIDTH + HISTO_GAP;

  // Construit l'objet info pour les callbacks de survol. Le tooltip
  // se charge du formatage côté parent.
  function infoTranche(axe, i, compte, total) {
    return {
      axe,
      borneInf: i * 10,
      borneSup: (i + 1) * 10,
      compte,
      total,
    };
  }

  return (
    <g className="quadrant-histogrammes">
      {/* Histogramme axe X (en haut) — barres verticales.
          Tranche i couvre l'intervalle [i*10%, (i+1)*10%]. */}
      {countsX.map((c, i) => {
        if (c === 0) return null;
        const h = Math.max(HISTO_TAILLE_MIN_BARRE, (c / maxX) * HISTO_BAND_TAILLE);
        const x = MARGIN.left + i * xBarWidth;
        const info = infoTranche('x', i, c, totalX);
        return (
          <rect
            key={`hx-${i}`}
            x={x + 1}
            y={topBottom - h}
            width={xBarWidth - 2}
            height={h}
            fill={HISTO_COULEUR}
            opacity={HISTO_OPACITE}
            style={{ cursor: 'help' }}
            onMouseEnter={(e) => onHoverBar?.(info, e)}
            onMouseMove={(e)  => onHoverBar?.(info, e)}
            onMouseLeave={()  => onLeaveBar?.()}
          />
        );
      })}
      {/* Histogramme axe Y (à droite) — barres horizontales.
          Axe Y inversé en SVG : tranche 0 = bas du plot. */}
      {countsY.map((c, i) => {
        if (c === 0) return null;
        const w = Math.max(HISTO_TAILLE_MIN_BARRE, (c / maxY) * HISTO_BAND_TAILLE);
        const yBottom = MARGIN.top + PLOT_HEIGHT - i * yBarHeight;
        const info = infoTranche('y', i, c, totalY);
        return (
          <rect
            key={`hy-${i}`}
            x={rightLeft}
            y={yBottom - yBarHeight + 1}
            width={w}
            height={yBarHeight - 2}
            fill={HISTO_COULEUR}
            opacity={HISTO_OPACITE}
            style={{ cursor: 'help' }}
            onMouseEnter={(e) => onHoverBar?.(info, e)}
            onMouseMove={(e)  => onHoverBar?.(info, e)}
            onMouseLeave={()  => onLeaveBar?.()}
          />
        );
      })}
    </g>
  );
}
