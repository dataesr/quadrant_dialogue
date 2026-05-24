import { MARGIN, PLOT_WIDTH, PLOT_HEIGHT, toPercent } from './geometry.js';

// Lignes de référence : médiane ou moyenne. Le type est porté par
// `reference.type` ('mediane' ou 'moyenne'), ce qui détermine le libellé
// affiché à côté de chaque ligne.
//
// Style : trait pointillé gris foncé (cf. cadrage §11), épaisseur 1px.
// Les labels sont placés à un endroit qui ne chevauche pas les bulles
// centrales :
//   - "Méd."/"Moy." en haut de la ligne verticale (juste sous le bord supérieur)
//   - "Méd."/"Moy." à droite de la ligne horizontale (juste avant le bord droit)
//
// Les scales sont passées en props : le zoom les transforme côté
// orchestrateur (Quadrant.jsx), on n'utilise donc pas les xScale/yScale
// bruts de geometry.js ici.

const LABEL = {
  mediane: 'Médiane',
  moyenne: 'Moyenne',
};

export default function LignesReference({ reference, xScale, yScale }) {
  if (!reference) return null;

  const x = xScale(toPercent(reference.x));
  const y = yScale(toPercent(reference.y));
  const label = LABEL[reference.type] || '';

  return (
    <g className="quadrant-reference">
      {/* Ligne verticale (x = référence) */}
      <line
        x1={x} x2={x}
        y1={MARGIN.top} y2={MARGIN.top + PLOT_HEIGHT}
        stroke="#555"
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      {/* Ligne horizontale (y = référence) */}
      <line
        x1={MARGIN.left} x2={MARGIN.left + PLOT_WIDTH}
        y1={y} y2={y}
        stroke="#555"
        strokeWidth={1}
        strokeDasharray="4 3"
      />

      {/* Label sur la verticale, en haut */}
      {label && (
        <text
          x={x + 4}
          y={MARGIN.top + 12}
          fontSize={11}
          fill="#555"
        >
          {label}
        </text>
      )}

      {/* Label sur l'horizontale, à droite */}
      {label && (
        <text
          x={MARGIN.left + PLOT_WIDTH - 4}
          y={y - 4}
          fontSize={11}
          fill="#555"
          textAnchor="end"
        >
          {label}
        </text>
      )}
    </g>
  );
}
