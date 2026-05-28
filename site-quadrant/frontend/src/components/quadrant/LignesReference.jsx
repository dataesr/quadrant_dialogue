import { MARGIN, PLOT_WIDTH, PLOT_HEIGHT, toPercent } from './geometry.js';

// Lignes de référence : médiane ou moyenne. Type porté par
// `reference.type` :
//   - vue=mentions       : 'mediane_etab' | 'moyenne_etab' | 'moyenne_nationale'
//                          (cf. AppContext.referenceAxes)
//   - vue=etablissements : 'mediane' | 'moyenne' (cf.
//                          AppContext.referenceAxesPositionnement —
//                          propagé à l'API via le paramètre `agregation`).
//
// Positionnement des libellés (à l'INTÉRIEUR du plot, dans les
// zones les MOINS denses) :
//   - Label de la verticale (ref X) : posé en bas du plot, à gauche
//     de la ligne pointillée, textAnchor="end" → texte aligné à
//     droite, qui se termine contre la ligne. Zone bas-gauche du
//     quadrant : peu de bulles habituellement (= mauvais sur les
//     deux axes — rare).
//   - Label de l'horizontale (ref Y) : posé à gauche du plot, juste
//     AU-DESSUS de la ligne pointillée, textAnchor="start" → texte
//     aligné à gauche depuis le bord gauche du plot. Zone gauche du
//     quadrant : également moins fournie que la zone droite.
//
// Logique métier : les bulles « intéressantes » (taux élevés sur les
// deux axes) sont en haut-droite. Les zones bas-gauche et gauche-
// centrale étaient le précédent emplacement (haut-droite et haut-
// gauche) systématiquement masquées par les clusters denses.
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
  // Vue Positionnement (référence pilotée par agregation côté API,
  // libellés courts puisque la vue est nationale par construction)
  mediane: 'Médiane',
  moyenne: 'Moyenne',
};

// Format d'une valeur de taux (0..1) en pourcentage français : une
// décimale, virgule, espace insécable avant le %. Cohérent avec
// QuadrantAnime (formaterPourcentage). « 0,755 » → « 75,5 % ».
function formaterPourcentage(taux) {
  const v = (taux ?? 0) * 100;
  return v.toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) + ' %';
}

export default function LignesReference({ reference, xScale, yScale }) {
  if (!reference) return null;

  const x = xScale(toPercent(reference.x));
  const y = yScale(toPercent(reference.y));
  const label = LABEL[reference.type] || '';
  // La valeur de référence est différente sur chaque axe : sur la
  // verticale on lit reference.x (position horizontale de la ligne),
  // sur l'horizontale reference.y. Format « Libellé : 75,5 % ».
  const labelX = label ? `${label} : ${formaterPourcentage(reference.x)}` : '';
  const labelY = label ? `${label} : ${formaterPourcentage(reference.y)}` : '';

  // Bornes du plot (utiles pour le positionnement des labels).
  const plotTop    = MARGIN.top;
  const plotBottom = MARGIN.top + PLOT_HEIGHT;
  const plotLeft   = MARGIN.left;
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

      {/* Label de la verticale : intérieur du plot, EN BAS, juste à
          gauche de la pointillée. textAnchor=end → texte aligné à
          droite contre x-5. Zone bas-gauche du quadrant : peu
          fournie en bulles d'habitude. */}
      {label && (
        <text
          x={x - 5}
          y={plotBottom - 8}
          fontSize={11}
          fill="#666"
          textAnchor="end"
        >
          {labelX}
        </text>
      )}

      {/* Label de l'horizontale : intérieur du plot, À GAUCHE, juste
          au-dessus de la pointillée. textAnchor=start → texte aligné
          à gauche depuis plotLeft+5. Zone gauche-centrale : moins
          dense que la zone droite (« haut-droite » = bulles les
          mieux placées sur les deux axes, où les clusters se
          concentrent). */}
      {label && (
        <text
          x={plotLeft + 5}
          y={y - 5}
          fontSize={11}
          fill="#666"
          textAnchor="start"
        >
          {labelY}
        </text>
      )}
    </g>
  );
}
