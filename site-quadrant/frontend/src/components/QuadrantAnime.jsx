import { useMemo } from 'react';
import Axes from './quadrant/Axes.jsx';
import {
  WIDTH, HEIGHT, MARGIN, PLOT_WIDTH, PLOT_HEIGHT,
  xScaleBase, yScaleBase, toPercent, rayonBulle,
} from './quadrant/geometry.js';
import {
  COLORS_DOMAINE, COULEUR_ETAB_PAR_KEY,
} from '../utils/colors.js';

// Quadrant SVG animé pour la modale d'évolution temporelle (Phase 11
// MVP). Différences avec Quadrant.jsx :
//   - pas de zoom, pas d'interaction (clic, survol, tooltip)
//   - pas de tri par couleur/profondeur (bulles dans l'ordre du tableau)
//   - rendu sans état React local (props-driven seulement)
//   - bulles avec transition CSS sur cx/cy/opacity → animation
//     fluide quand le millésime courant change
//   - axes pointillés animés via les mêmes transitions
//
// Toutes les bulles renvoyées par /quadrant/serie-temporelle ont
// `forme=rond` (seuil systématique appliqué côté API), donc pas de
// gestion triangle/croix.
//
// Stratégie d'animation : on rend TOUS les <circle> indexés par leur
// id stable (HMAC pour les anonymes), avec une clé React = id. Quand
// le millésime change, les bulles partagent la même clé entre les
// deux renders → React conserve le DOM node → CSS transitions
// s'appliquent automatiquement sur cx/cy.
//
// Bulles présentes au millésime précédent mais absentes du nouveau :
// on les rend en `opacity: 0` (CSS transition l'estompe sur 400 ms).
// Inverse pour les nouvelles bulles (montent en opacity).

export default function QuadrantAnime({
  bulles,             // bulles du millésime courant (peut contenir < bulles totales)
  axes,               // { mediane_etab_x, ... } selon vue
  referenceAxesMode,  // 'mediane_etab' | 'moyenne_etab' | 'moyenne_nationale' | 'mediane' | 'moyenne'
  vue,                // 'mentions' | 'etablissements'
  libelleX,
  libelleY,
  millesimeCourant,   // pour l'affichage du grand chiffre en arrière-plan
  bullesTouteSerie,   // ensemble (Map id → meta) des bulles qui apparaissent au moins une fois — pour les fade-out
}) {
  // Index id → bulle courante. Permet de savoir vite si une bulle est
  // présente ce millésime ou non, et de lire ses x/y/denom.
  const bulleParId = useMemo(() => {
    const m = new Map();
    for (const b of bulles) m.set(b.id, b);
    return m;
  }, [bulles]);

  // Pour rendre les fade-in/out propres, on itère sur l'UNION des
  // bulles de toute la série, pas juste celles du millésime courant.
  // Si une bulle est absente du courant, on la rend à sa dernière
  // position connue avec opacity: 0.
  //
  // bullesTouteSerie = Map<id, dernière bulle meta connue>. Si non
  // fourni, on retombe sur les bulles du millésime courant
  // uniquement (pas de fade-out gracieux dans ce cas).
  const idsAffiches = useMemo(() => {
    if (bullesTouteSerie && bullesTouteSerie.size > 0) {
      return Array.from(bullesTouteSerie.keys());
    }
    return bulles.map((b) => b.id);
  }, [bullesTouteSerie, bulles]);

  // Rayons : on calcule à partir des denoms de toute la série (sinon
  // la taille des bulles ferait du yo-yo entre millésimes). Pour
  // l'animation, on veut une échelle stable.
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

  // Référence des axes : x/y des lignes pointillées selon le mode.
  const refXY = useMemo(() => {
    if (!axes) return null;
    const xKey = `${referenceAxesMode}_x`;
    const yKey = `${referenceAxesMode}_y`;
    const x = axes[xKey];
    const y = axes[yKey];
    if (x == null || y == null) return null;
    return { x, y };
  }, [axes, referenceAxesMode]);

  return (
    <svg
      className="quadrant-anime-svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      role="img"
      aria-label={`Quadrant animé — millésime ${millesimeCourant}`}
    >
      {/* Année courante en filigrane (sobre, pas trop intrusif) */}
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

      {/* Lignes de référence (pointillés). Transition CSS sur les
          positions → glissement fluide entre millésimes. */}
      {refXY && (
        <g className="quadrant-anime-ref">
          <line
            className="quadrant-anime-ref-line"
            x1={xScaleBase(toPercent(refXY.x))}
            x2={xScaleBase(toPercent(refXY.x))}
            y1={MARGIN.top}
            y2={MARGIN.top + PLOT_HEIGHT}
            stroke="#555"
            strokeDasharray="4 3"
          />
          <line
            className="quadrant-anime-ref-line"
            x1={MARGIN.left}
            x2={MARGIN.left + PLOT_WIDTH}
            y1={yScaleBase(toPercent(refXY.y))}
            y2={yScaleBase(toPercent(refXY.y))}
            stroke="#555"
            strokeDasharray="4 3"
          />
        </g>
      )}

      {/* Bulles. Une <circle> par id stable, key=id. Les transitions
          CSS sur cx/cy/opacity gèrent l'animation. */}
      <g className="quadrant-anime-bulles">
        {idsAffiches.map((id) => {
          const present = bulleParId.has(id);
          // Bulle courante OU dernière position connue (pour fade-out)
          const b = present
            ? bulleParId.get(id)
            : bullesTouteSerie?.get(id);
          if (!b) return null;

          const cx = xScaleBase(toPercent(b.x));
          const cy = yScaleBase(toPercent(b.y));
          const denom = b.denom_x ?? b.denom ?? 0;
          const r = rayonBulle(denom, 'sqrt', allDenoms);
          const couleur = vue === 'mentions'
            ? (COLORS_DOMAINE[b.dom] || '#888')
            : (COULEUR_ETAB_PAR_KEY[b.couleur_key] || '#888');

          return (
            <circle
              key={id}
              className="quadrant-anime-bulle"
              cx={cx}
              cy={cy}
              r={r}
              fill={couleur}
              fillOpacity={0.61}
              stroke={couleur}
              strokeWidth={1}
              style={{ opacity: present ? 1 : 0 }}
            />
          );
        })}
      </g>
    </svg>
  );
}
