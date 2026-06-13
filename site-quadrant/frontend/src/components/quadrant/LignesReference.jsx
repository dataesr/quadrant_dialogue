import { MARGIN, PLOT_WIDTH, PLOT_HEIGHT, toPercent } from './geometry.js';
import {
  STYLE_PERIMETRE,
  libelleReference,
  formaterPourcentage,
} from '../../utils/referenceAxes.js';

// Lignes de référence des axes (Phase 15.1 — affichage multiple).
//
// Reçoit un TABLEAU `references` (0, 1 ou 2 entrées). Chaque référence :
//   { x, y, perimetre: 'etab' | 'national' | 'positionnement', mesure }
//   - x / y : taux de référence (0..1) sur chaque axe.
//   - perimetre : pilote la différenciation visuelle (couleur + pointillé)
//     et le libellé.
//   - mesure : 'mediane' | 'moyenne' (entre dans le libellé).
//
// Différenciation visuelle (Tâche 3) : les deux références (étab +
// national) doivent rester distinguables par COULEUR et par STYLE de
// pointillé :
//   - établissement   : bleu Marianne #000091, pointillé court 4 4.
//   - national         : gris #666, pointillé long 8 4.
//   - positionnement   : gris neutre #555, pointillé 4 3 (référence
//     unique de la vue Positionnement — pas de notion étab/national).
//
// Positionnement des libellés (Tâche 4) :
//   - 1 seule référence → emplacement « habituel » : label de la
//     verticale en bas, label de l'horizontale à gauche.
//   - 2 références → emplacements OPPOSÉS pour éviter le chevauchement :
//     verticales = un label en haut / un en bas ; horizontales = un à
//     gauche / un à droite. L'étab garde l'emplacement habituel
//     (bas / gauche), le national prend l'opposé (haut / droite).
//   - Bascule « anti-débordement » selon la valeur, indépendante du
//     slot : si la ligne est proche d'un bord, le texte bascule du côté
//     opposé pour ne pas sortir du plot.
//     · verticale (valeur X) : X < 30 % → texte à droite de la ligne
//       (textAnchor=start) ; X > 70 % → à gauche (end) ; sinon à gauche.
//     · horizontale (valeur Y) : Y > 70 % (proche du haut) → texte
//       SOUS la ligne ; sinon au-dessus.

export default function LignesReference({ references, xScale, yScale }) {
  // Compat ascendante : ancienne prop `reference` (objet unique).
  const liste = Array.isArray(references)
    ? references
    : (references ? [references] : []);
  if (liste.length === 0) return null;

  const plotTop    = MARGIN.top;
  const plotBottom = MARGIN.top + PLOT_HEIGHT;
  const plotLeft   = MARGIN.left;
  const plotRight  = MARGIN.left + PLOT_WIDTH;

  const aDeux = liste.length === 2;

  return (
    <g className="quadrant-reference">
      {liste.map((ref, i) => {
        const style = STYLE_PERIMETRE[ref.perimetre] || STYLE_PERIMETRE.positionnement;
        const x = xScale(toPercent(ref.x));
        const y = yScale(toPercent(ref.y));
        const label = libelleReference(ref);
        const labelX = `${label} : ${formaterPourcentage(ref.x)}`;
        const labelY = `${label} : ${formaterPourcentage(ref.y)}`;

        // Slot opposé pour la 2ᵉ référence (le national passe en
        // haut / droite ; l'étab — ou la référence unique — reste en
        // bas / gauche).
        const secondaire = aDeux && ref.perimetre === 'national';

        // --- Label de la VERTICALE (position X) ---
        // Slot vertical : bas (défaut) ou haut (secondaire).
        const vLabelY = secondaire ? plotTop + 14 : plotBottom - 8;
        // Bascule horizontale anti-débordement selon la valeur X.
        let vAnchor = 'end';
        let vLabelX = x - 5;
        if (ref.x < 0.30) { vAnchor = 'start'; vLabelX = x + 5; }
        else if (ref.x > 0.70) { vAnchor = 'end'; vLabelX = x - 5; }

        // --- Label de l'HORIZONTALE (position Y) ---
        // Slot horizontal : gauche (défaut) ou droite (secondaire).
        const hAnchor = secondaire ? 'end' : 'start';
        const hLabelX = secondaire ? plotRight - 5 : plotLeft + 5;
        // Bascule verticale anti-débordement selon la valeur Y : proche
        // du haut → texte sous la ligne ; sinon au-dessus.
        const hLabelY = ref.y > 0.70 ? y + 14 : y - 5;

        return (
          <g key={`${ref.perimetre}-${i}`}>
            {/* Ligne verticale (x = référence) */}
            <line
              x1={x} x2={x}
              y1={plotTop} y2={plotBottom}
              stroke={style.stroke}
              strokeWidth={1}
              strokeDasharray={style.dash}
            />
            {/* Ligne horizontale (y = référence) */}
            <line
              x1={plotLeft} x2={plotRight}
              y1={y} y2={y}
              stroke={style.stroke}
              strokeWidth={1}
              strokeDasharray={style.dash}
            />
            {/* Label de la verticale */}
            <text
              x={vLabelX}
              y={vLabelY}
              fontSize={11}
              fill={style.stroke}
              textAnchor={vAnchor}
            >
              {labelX}
            </text>
            {/* Label de l'horizontale */}
            <text
              x={hLabelX}
              y={hLabelY}
              fontSize={11}
              fill={style.stroke}
              textAnchor={hAnchor}
            >
              {labelY}
            </text>
          </g>
        );
      })}
    </g>
  );
}
