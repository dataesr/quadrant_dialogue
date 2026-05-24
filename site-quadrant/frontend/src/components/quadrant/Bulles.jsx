import { toPercent, rayonBulle } from './geometry.js';
import { COLORS_DOMAINE, COULEUR_ETAB_PAR_KEY } from '../../utils/colors.js';

// Rendu SVG des bulles.
//
// Reçoit les scales en props (pour que le zoom puisse passer des
// échelles transformées) et un mode d'échelle pour le rayon. Délègue les
// événements de survol à l'orchestrateur (Quadrant.jsx) via les
// callbacks onHover/onLeave.
//
// Highlight de recherche : quand `highlightId` est non-null, la bulle
// correspondante est mise en avant (rayon × 1.5, bordure plus épaisse)
// et les autres bulles sont atténuées (opacité réduite). Comparaison
// par libellé exact (insensible à la casse) — c'est ce que la barre de
// recherche met à disposition.
//
// Conventions de couleur :
//  - vue=mentions : couleur par grand domaine (champ `dom` côté API)
//  - vue=etablissements : couleur par `couleur_key` calculé côté API
//    (mapping partagé avec la légende — cf. utils/colors.js).

const COULEUR_INCONNUE = '#999';
const COULEUR_HIGHLIGHT = '#E91719'; // rouge d'accent, cohérent avec selectionne

function couleurBulle(bulle, vue) {
  if (vue === 'mentions') {
    return COLORS_DOMAINE[bulle.dom] || COULEUR_INCONNUE;
  }
  return COULEUR_ETAB_PAR_KEY[bulle.couleur_key] || COULEUR_INCONNUE;
}

function libellesMatchent(libelleBulle, recherche) {
  if (!recherche || !libelleBulle) return false;
  return libelleBulle.trim().toLowerCase() === recherche.trim().toLowerCase();
}

export default function Bulles({
  bulles,
  vue,
  xScale,
  yScale,
  scaleMode = 'sqrt',
  allDenoms = [],
  rechercheMention = '',
  onHover,
  onLeave,
}) {
  if (!bulles?.length) return null;

  const aucuneRecherche = !rechercheMention;
  const aUneRechercheActive = !aucuneRecherche;

  return (
    <g className="quadrant-bulles">
      {bulles.map((b) => {
        const cx = xScale(toPercent(b.x));
        const cy = yScale(toPercent(b.y));
        const denom = b.denom_x ?? b.denom;
        const baseRayon = rayonBulle(denom, scaleMode, allDenoms);
        const fill = couleurBulle(b, vue);

        const estMatch = libellesMatchent(b.libelle, rechercheMention);
        const estAttenue = aUneRechercheActive && !estMatch;

        const r = estMatch ? baseRayon * 1.5 : baseRayon;
        const fillOpacity   = estAttenue ? 0.2  : 0.61;
        const strokeOpacity = estAttenue ? 0.3  : 0.9;
        const strokeColor   = estMatch ? COULEUR_HIGHLIGHT : fill;
        const strokeWidth   = estMatch ? 3 : 1;

        const commun = {
          fill,
          fillOpacity,
          stroke: strokeColor,
          strokeOpacity,
          strokeWidth,
          style: { cursor: b.details_accessibles ? 'pointer' : 'default' },
          onMouseEnter: (e) => onHover?.(b, e),
          onMouseMove:  (e) => onHover?.(b, e),
          onMouseLeave: () => onLeave?.(),
        };

        switch (b.forme) {
          case 'rond':
            return <circle key={b.id} cx={cx} cy={cy} r={r} {...commun} />;

          case 'triangle_bas':
            return (
              <polygon
                key={b.id}
                points={trianglePoints(cx, cy, r, 'bas')}
                {...commun}
              />
            );

          case 'triangle_gauche':
            return (
              <polygon
                key={b.id}
                points={trianglePoints(cx, cy, r, 'gauche')}
                {...commun}
              />
            );

          case 'croix':
            // Croix : les deux dénominateurs faibles. Bornée par un
            // <g> portant les handlers, pour que les deux segments
            // partagent le survol.
            return (
              <g
                key={b.id}
                onMouseEnter={(e) => onHover?.(b, e)}
                onMouseMove={(e)  => onHover?.(b, e)}
                onMouseLeave={() => onLeave?.()}
                style={{ cursor: b.details_accessibles ? 'pointer' : 'default' }}
              >
                <line
                  x1={cx - r} y1={cy - r} x2={cx + r} y2={cy + r}
                  stroke={strokeColor} strokeOpacity={strokeOpacity} strokeWidth={strokeWidth + 1}
                />
                <line
                  x1={cx - r} y1={cy + r} x2={cx + r} y2={cy - r}
                  stroke={strokeColor} strokeOpacity={strokeOpacity} strokeWidth={strokeWidth + 1}
                />
              </g>
            );

          default:
            return null;
        }
      })}
    </g>
  );
}

function trianglePoints(cx, cy, r, direction) {
  if (direction === 'bas') {
    return [
      [cx,       cy + r],
      [cx - r,   cy - r * 0.7],
      [cx + r,   cy - r * 0.7],
    ].map((p) => p.join(',')).join(' ');
  }
  return [
    [cx - r,        cy],
    [cx + r * 0.7,  cy - r],
    [cx + r * 0.7,  cy + r],
  ].map((p) => p.join(',')).join(' ');
}
