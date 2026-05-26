import { MARGIN, PLOT_WIDTH, PLOT_HEIGHT, toPercent } from './geometry.js';

// Lignes de référence : médiane ou moyenne. Type porté par
// `reference.type` :
//   - vue=mentions  : 'mediane_etab' | 'moyenne_etab' | 'moyenne_nationale'
//                     (cf. AppContext.referenceAxes)
//   - vue=etablissements : 'mediane' | 'moyenne' (paramètre agregation
//                     côté API — bridé à 'mediane' par défaut depuis
//                     la suppression du sélecteur « Ligne de référence »
//                     en phase 8 corrections)
//
// Positionnement des libellés (à l'INTÉRIEUR du plot, près des
// lignes pointillées pour ne pas déformer les marges externes du
// quadrant) :
//   - Label de la verticale (ref X) : posé en haut du plot, juste à
//     GAUCHE de la ligne pointillée, textAnchor="end" pour que le
//     texte se termine contre la ligne. Aligné dans le quadrant
//     haut-gauche pour ne pas se coller aux bulles de la zone
//     haut-droite (souvent dense).
//   - Label de l'horizontale (ref Y) : posé à droite du plot, juste
//     AU-DESSUS de la ligne pointillée, textAnchor="end" pour que le
//     texte se termine contre le bord droit. Aligné dans le quadrant
//     haut-droite (zone naturellement moins dense pour les indicateurs
//     positifs).
//
// Apparence discrète : fontSize 11, fill #666. Le but est informatif —
// si une bulle recouvre brièvement le libellé, c'est acceptable (le
// zoom permet de lever l'ambiguïté).
//
// Style des lignes : trait pointillé gris foncé (cf. cadrage §11),
// épaisseur 1px. Les scales sont passées en props : le zoom les
// transforme côté orchestrateur (Quadrant.jsx).

const LABEL = {
  // Vue Mentions (3 modes du nouveau sélecteur)
  mediane_etab:      'Médiane établissement',
  moyenne_etab:      'Moyenne établissement',
  moyenne_nationale: 'Moyenne nationale',
  // Vue Positionnement (paramètre `agregation` côté API)
  mediane: 'Médiane',
  moyenne: 'Moyenne',
};

export default function LignesReference({ reference, xScale, yScale }) {
  if (!reference) return null;

  const x = xScale(toPercent(reference.x));
  const y = yScale(toPercent(reference.y));
  const label = LABEL[reference.type] || '';

  // Bornes du plot (utiles pour le positionnement des labels).
  const plotTop    = MARGIN.top;
  const plotRight  = MARGIN.left + PLOT_WIDTH;

  return (
    <g className="quadrant-reference">
      {/* Ligne verticale (x = référence) */}
      <line
        x1={x} x2={x}
        y1={plotTop} y2={MARGIN.top + PLOT_HEIGHT}
        stroke="#555"
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      {/* Ligne horizontale (y = référence) */}
      <line
        x1={MARGIN.left} x2={plotRight}
        y1={y} y2={y}
        stroke="#555"
        strokeWidth={1}
        strokeDasharray="4 3"
      />

      {/* Label de la verticale : intérieur du plot, en haut, juste à
          gauche de la pointillée. textAnchor=end → texte aligné à
          droite contre x-5. */}
      {label && (
        <text
          x={x - 5}
          y={plotTop + 14}
          fontSize={11}
          fill="#666"
          textAnchor="end"
        >
          {label}
        </text>
      )}

      {/* Label de l'horizontale : intérieur du plot, à droite, juste
          au-dessus de la pointillée. textAnchor=end → texte aligné à
          droite contre le bord droit du plot. */}
      {label && (
        <text
          x={plotRight - 5}
          y={y - 5}
          fontSize={11}
          fill="#666"
          textAnchor="end"
        >
          {label}
        </text>
      )}
    </g>
  );
}
