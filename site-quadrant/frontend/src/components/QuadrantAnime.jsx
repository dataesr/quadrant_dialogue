import { useMemo } from 'react';
import Axes from './quadrant/Axes.jsx';
import {
  WIDTH, HEIGHT, MARGIN, PLOT_WIDTH, PLOT_HEIGHT,
  xScaleBase, yScaleBase, toPercent, rayonBulle,
} from './quadrant/geometry.js';
import {
  COLORS_DOMAINE, COULEUR_ETAB_PAR_KEY,
} from '../utils/colors.js';

// Z-index sémantique pour la vue Établissements (cohérent avec
// Quadrant.jsx). « autres » en fond, « selectionne » au premier plan.
// Le SVG peint dans l'ordre du tableau → dernier élément = au-dessus.
// On trie donc par z ASCENDANT (faibles d'abord = au fond).
const ORDRE_RENDU_ETAB = {
  autres:                      0,
  meme_typologie_autre_region: 1,
  meme_region_autre_typologie: 2,
  meme_region_et_typologie:    3,
  selectionne:                 4,
};

// Libellés des modes d'axes (cohérent LignesReference.jsx) — affichés
// à côté des pointillés dans le quadrant animé.
const LABEL_REF = {
  mediane_etab:      'Médiane établissement',
  moyenne_etab:      'Moyenne établissement',
  moyenne_nationale: 'Moyenne nationale',
  mediane: 'Médiane',
  moyenne: 'Moyenne',
};

// Quadrant SVG animé pour la modale d'évolution temporelle (Phase 11b).
//
// Props :
//   - bulles, axes, referenceAxesMode, vue, libelleX, libelleY,
//     millesimeCourant, bullesTouteSerie : cf. MVP.
//   - dureeTransitionMs : durée des transitions CSS sur cx/cy
//     (adaptée à la vitesse de lecture, cf. ModaleAnimation).
//   - traceContinue : Map<id, Array<{cx, cy}>> — positions
//     successives des bulles (max 4 = 3 segments). Dessine une
//     polyline fine derrière chaque bulle pour montrer sa
//     trajectoire récente.
//   - traceComparaison : null OU { from: {id→{cx,cy}}, to: {id→{cx,cy}},
//     fading: bool } — trace one-shot du mode « Comparer avec
//     millésime précédent », plus visible (stroke 2, opacity 0.6),
//     fade-out sur 1 s quand fading=true.
//
// Différences avec Quadrant.jsx (rappel MVP) : pas de zoom, pas
// d'interaction (clic, survol, tooltip). Toutes les bulles sont
// `forme=rond` (seuil systématique côté API).

export default function QuadrantAnime({
  bulles,
  axes,
  referenceAxesMode,
  vue,
  libelleX,
  libelleY,
  millesimeCourant,
  bullesTouteSerie,
  dureeTransitionMs = 800,
  traceContinue,
  traceComparaison,
  phaseAnim = 'normal',
}) {
  // Index id → bulle courante. Permet de savoir vite si une bulle
  // est présente ce millésime et de lire ses coords.
  const bulleParId = useMemo(() => {
    const m = new Map();
    for (const b of bulles) m.set(b.id, b);
    return m;
  }, [bulles]);

  // Ordre stable des bulles (cf. principe Quadrant.jsx) :
  //   - vue=mentions : par denom décroissant. Grosses bulles en fond,
  //     petites au premier plan.
  //   - vue=etablissements : z-index sémantique via ORDRE_RENDU_ETAB.
  // Tri basé sur bullesTouteSerie pour rester stable entre millésimes.
  const idsAffiches = useMemo(() => {
    if (!bullesTouteSerie || bullesTouteSerie.size === 0) {
      return bulles.map((b) => b.id);
    }
    const entries = Array.from(bullesTouteSerie.entries());
    if (vue === 'mentions') {
      return entries
        .sort(([, a], [, b]) =>
          (b.denom_x ?? b.denom ?? 0) - (a.denom_x ?? a.denom ?? 0)
        )
        .map(([id]) => id);
    }
    return entries
      .sort(([, a], [, b]) => {
        const za = ORDRE_RENDU_ETAB[a.couleur_key] ?? 0;
        const zb = ORDRE_RENDU_ETAB[b.couleur_key] ?? 0;
        return za - zb;
      })
      .map(([id]) => id);
  }, [bullesTouteSerie, bulles, vue]);

  // Rayons stables sur toute la série
  const allDenoms = useMemo(() => {
    const out = [];
    if (bullesTouteSerie) {
      for (const b of bullesTouteSerie.values()) {
        out.push(b.denom_x ?? b.denom ?? 0);
      }
    } else {
      for (const b of bulles) out.push(b.denom_x ?? b.denom ?? 0);
    }
    return out.filter((d) => d > 0);
  }, [bullesTouteSerie, bulles]);

  // Référence des axes (lignes pointillées)
  const refXY = useMemo(() => {
    if (!axes) return null;
    const x = axes[`${referenceAxesMode}_x`];
    const y = axes[`${referenceAxesMode}_y`];
    if (x == null || y == null) return null;
    return { x, y };
  }, [axes, referenceAxesMode]);

  // Helper : couleur d'une bulle selon vue + id
  function couleurPourBulle(b) {
    if (!b) return '#888';
    return vue === 'mentions'
      ? (COLORS_DOMAINE[b.dom] || '#888')
      : (COULEUR_ETAB_PAR_KEY[b.couleur_key] || '#888');
  }

  // Style de transition appliqué inline (durée variable selon vitesse).
  // L'opacité a sa propre durée fixe (400 ms) pour les fade-in/out
  // qui sont visuellement OK indépendamment de la vitesse.
  //
  // Animation via `transform: translate()` plutôt que cx/cy — le
  // transform est composité par le GPU et n'invalide pas le layout
  // SVG, alors qu'animer cx/cy déclenche un forced reflow visible
  // dès qu'on dépasse ~100 bulles. En vue Positionnement (~700
  // bulles), la version cx/cy provoquait une saccade systématique
  // entre deux millésimes (mesurée à ~34 ms de reflow, > budget
  // 60 fps). Les bulles sont rendues à (0, 0) et translatées : la
  // position visuelle est strictement équivalente.
  //
  // phaseAnim (smooth loop) :
  //   - 'normal'   : transitions transform + opacité actives
  //   - 'fade-out' : transitions actives, mais la prop opacité ci-dessous
  //                  force 0 → fade-out animé par la transition opacity
  //   - 'snap'     : transitions transform DÉSACTIVÉES (pour ne pas
  //                  voir les bulles voler du dernier point au premier).
  //                  L'opacité reste à 0 jusqu'au retour à 'normal'.
  const enSnap = phaseAnim === 'snap';
  const transitionStyleBulle = {
    transition: enSnap
      ? 'opacity 400ms ease-in-out' // pas de transition transform pendant le snap
      : `transform ${dureeTransitionMs}ms ease-in-out, opacity 400ms ease-in-out`,
  };
  const transitionStyleLigne = {
    transition: enSnap
      ? 'none'
      : `transform ${dureeTransitionMs}ms ease-in-out`,
  };

  // Opacité à appliquer aux bulles : 0 pendant fade-out et snap,
  // sinon état présent/absent normal.
  function opaciteBulle(present) {
    if (phaseAnim === 'fade-out' || phaseAnim === 'snap') return 0;
    return present ? 1 : 0;
  }

  return (
    <svg
      className="quadrant-anime-svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Quadrant animé — millésime ${millesimeCourant}`}
    >
      {/* Année courante en filigrane */}
      <text
        className="quadrant-anime-millesime"
        x={MARGIN.left + PLOT_WIDTH - 16}
        y={MARGIN.top + PLOT_HEIGHT - 16}
        textAnchor="end"
        fontSize={120}
        fontWeight={700}
        fill="#000091"
        opacity={0.08}
      >
        {millesimeCourant}
      </text>

      <Axes
        xScale={xScaleBase}
        yScale={yScaleBase}
        libelleX={libelleX}
        libelleY={libelleY}
      />

      {/* Lignes de référence + libellés (cohérent LignesReference.jsx).
          Libellé verticale en bas-gauche du plot (zone peu dense),
          libellé horizontale à gauche juste au-dessus de la ligne.
          Animation via transform translate (cf. transitionStyleBulle
          ci-dessus) plutôt que x1/x2/y1/y2 / x/y — même bénéfice de
          composition GPU. */}
      {refXY && (() => {
        const xPx = xScaleBase(toPercent(refXY.x));
        const yPx = yScaleBase(toPercent(refXY.y));
        const plotTop    = MARGIN.top;
        const plotBottom = MARGIN.top + PLOT_HEIGHT;
        const plotLeft   = MARGIN.left;
        const label      = LABEL_REF[referenceAxesMode] || '';
        return (
          <g>
            {/* Ligne verticale : base à x=0 (de plotTop à plotBottom),
                translatée horizontalement par xPx. */}
            <line
              className="quadrant-anime-ref-line"
              x1={0} x2={0}
              y1={plotTop} y2={plotBottom}
              transform={`translate(${xPx} 0)`}
              stroke="#555"
              strokeDasharray="4 3"
              style={transitionStyleLigne}
            />
            {/* Ligne horizontale : base à y=0 (de plotLeft à plotRight),
                translatée verticalement par yPx. */}
            <line
              className="quadrant-anime-ref-line"
              x1={plotLeft} x2={plotLeft + PLOT_WIDTH}
              y1={0} y2={0}
              transform={`translate(0 ${yPx})`}
              stroke="#555"
              strokeDasharray="4 3"
              style={transitionStyleLigne}
            />
            {label && (
              <>
                <text
                  x={-5}
                  y={plotBottom - 8}
                  transform={`translate(${xPx} 0)`}
                  fontSize={11}
                  fill="#666"
                  textAnchor="end"
                  style={transitionStyleLigne}
                >
                  {label}
                </text>
                <text
                  x={plotLeft + 5}
                  y={-5}
                  transform={`translate(0 ${yPx})`}
                  fontSize={11}
                  fill="#666"
                  textAnchor="start"
                  style={transitionStyleLigne}
                >
                  {label}
                </text>
              </>
            )}
          </g>
        );
      })()}

      {/* Traces résiduelles continues — fines, opacity 0.3, max 3
          segments par bulle. Dessinées AVANT les bulles pour rester
          en arrière-plan.
          En vue=etablissements (~700 bulles), désactivées (cf.
          ModaleAnimation passe traceContinue=null dans ce cas). */}
      {traceContinue && (
        <g className="quadrant-anime-traces-continues">
          {Array.from(traceContinue.entries()).map(([id, positions]) => {
            if (!positions || positions.length < 2) return null;
            const points = positions.map((p) => `${p.cx},${p.cy}`).join(' ');
            const b = bullesTouteSerie?.get(id) || bulleParId.get(id);
            const couleur = couleurPourBulle(b);
            return (
              <polyline
                key={`trace-${id}`}
                points={points}
                stroke={couleur}
                strokeWidth={1}
                strokeOpacity={0.3}
                strokeLinecap="round"
                fill="none"
              />
            );
          })}
        </g>
      )}

      {/* Trace de comparaison M-1 → M (mode « Comparer ») — plus
          visible (stroke 2, opacity 0.6). Fade-out via opacity 0
          quand traceComparaison.fading=true (transition CSS 1 s). */}
      {traceComparaison && (
        <g
          className="quadrant-anime-trace-comparaison"
          style={{
            opacity: traceComparaison.fading ? 0 : 1,
            transition: 'opacity 1000ms ease-in-out',
          }}
        >
          {idsAffiches.map((id) => {
            const from = traceComparaison.from?.get(id);
            const to   = traceComparaison.to?.get(id);
            if (!from || !to) return null;
            const b = bullesTouteSerie?.get(id) || bulleParId.get(id);
            const couleur = couleurPourBulle(b);
            return (
              <line
                key={`cmp-${id}`}
                x1={from.cx} y1={from.cy}
                x2={to.cx}   y2={to.cy}
                stroke={couleur}
                strokeWidth={2}
                strokeOpacity={0.6}
                strokeLinecap="round"
              />
            );
          })}
        </g>
      )}

      {/* Bulles. Transition CSS via inline style (durée variable). */}
      <g className="quadrant-anime-bulles">
        {idsAffiches.map((id) => {
          const present = bulleParId.has(id);
          const b = present
            ? bulleParId.get(id)
            : bullesTouteSerie?.get(id);
          if (!b) return null;

          const cx = xScaleBase(toPercent(b.x));
          const cy = yScaleBase(toPercent(b.y));
          const denom = b.denom_x ?? b.denom ?? 0;
          const r = rayonBulle(denom, 'sqrt', allDenoms);
          const couleur = couleurPourBulle(b);

          return (
            <circle
              key={id}
              className="quadrant-anime-bulle"
              cx={0}
              cy={0}
              r={r}
              transform={`translate(${cx} ${cy})`}
              fill={couleur}
              fillOpacity={0.61}
              stroke={couleur}
              strokeWidth={1}
              style={{
                ...transitionStyleBulle,
                opacity: opaciteBulle(present),
              }}
            />
          );
        })}
      </g>
    </svg>
  );
}

// Helper exporté : calcule (cx, cy) en coordonnées SVG pour une bulle.
// Sert à ModaleAnimation pour stocker les positions des bulles dans
// l'historique de trace (pas envie de dupliquer le calcul xScaleBase
// + toPercent dans deux endroits).
export function bulleCxCy(b) {
  return {
    cx: xScaleBase(toPercent(b.x)),
    cy: yScaleBase(toPercent(b.y)),
  };
}
