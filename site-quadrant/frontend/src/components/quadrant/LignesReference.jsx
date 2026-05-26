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
// Positionnement des libellés :
//   - Label de la ligne verticale (axe X) : posé EN BAS du quadrant,
//     sous l'axe X, centré sur la ligne. Évite le chevauchement avec
//     les bulles centrales.
//   - Label de la ligne horizontale (axe Y) : posé À GAUCHE du
//     quadrant, à gauche de l'axe Y, aligné sur la ligne. Même
//     justification.
// Position antérieure (haut/droite) provoquait des collisions
// systématiques avec les bulles denses.
//
// Style : trait pointillé gris foncé (cf. cadrage §11), épaisseur 1px.
// Les scales sont passées en props : le zoom les transforme côté
// orchestrateur (Quadrant.jsx), on n'utilise donc pas les xScale/yScale
// bruts de geometry.js ici.

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

      {/* Label de la verticale, en bas (dans la marge inférieure).
          y = bord bas du plot + 50 px → en-dessous des graduations
          X (qui sont à y = PLOT_HEIGHT + ~30 px). Marge bottom=80
          dans geometry.js : il reste donc 30 px sous le label pour
          le respirer. textAnchor middle pour aligner le label sur
          la ligne pointillée. */}
      {label && (
        <text
          x={x}
          y={MARGIN.top + PLOT_HEIGHT + 50}
          fontSize={11}
          fill="#555"
          textAnchor="middle"
        >
          {label}
        </text>
      )}

      {/* Label de l'horizontale, à gauche (dans la marge gauche).
          textAnchor="end" et x = MARGIN.left - 8 : le texte s'aligne
          à droite, juste avant l'axe Y. Marge left=160 dans
          geometry.js permet d'accueillir « Moyenne établissement »
          (~145 px à fontSize 11) sans déborder du viewBox. y+4 pour
          centrer verticalement la ligne de texte sur la pointillée. */}
      {label && (
        <text
          x={MARGIN.left - 8}
          y={y + 4}
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
