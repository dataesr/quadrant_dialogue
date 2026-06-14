import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { donneesVersPoints, echelleCommune, formatEuroSalaire } from '../../utils/salaires.js';
import { useAutoPlacement } from '../../utils/useAutoPlacement.js';

// Graphique d'évolution des salaires à 3 courbes (Q1 / Q2 / Q3), en SVG
// natif comme le reste de l'app (Phase 15.6 ; styles harmonisés 15.6.1).
//
//  - Q2 (médiane) : couleur principale, TRAIT PLEIN, plus épais.
//  - Q1 : gris, POINTILLÉ COURT (dasharray 4 2).
//  - Q3 : gris, POINTILLÉ LONG  (dasharray 8 4).
//  - Abscisses    : millésimes OU durées d'observation (12/18/24/30 mois).
//  - Courbes interrompues si une valeur manque (segments autour des trous).
//  - Tooltip au survol d'une abscisse : Q1 + médiane + Q3 du point (bande
//    de survol invisible couvrant toute la hauteur du plot).
//  - Légende Q1/Q2/Q3 sous le graphe (swatches au style de ligne réel).
//  - Échelle Y : commune si `echelle_y` fourni (comparer 2 graphes), sinon
//    adaptée aux données du graphe.
//
// Variants (cf. brief 15.6.1) :
//   - 'compact'  (barre latérale) : SANS marqueur (cohérent avec les autres
//     mini-graphes du panneau, qui n'en ont pas).
//   - 'standard' (modale)         : AVEC marqueur (anneau) sur l'abscisse
//     courante — lisible pendant l'animation.
//
// Props :
//   - donnees   : { "2019": {q1,q2,q3}|null, ... } ou { "12": {...}, ... }
//   - abscisses : 'millesimes' | 'durees'
//   - marqueur_x: valeur d'abscisse à marquer (variant 'standard' seulement)
//   - echelle_y : { min, max } optionnel
//   - hauteur   : px (défaut 120)
//   - variant   : 'compact' | 'standard' (défaut 'compact')

const COULEUR_Q2     = '#0E0E60'; // médiane — bleu principal (cf. MiniGrapheEvolution)
const COULEUR_QUART  = '#9a9aa8'; // Q1 / Q3 — gris
const COULEUR_GRILLE = '#e6e6e6';

const DASH_Q1 = '4 2'; // pointillé court
const DASH_Q3 = '8 4'; // pointillé long

export default function GraphiqueEvolutionSalaires({
  donnees,
  abscisses = 'durees',
  marqueur_x,
  echelle_y = null,
  hauteur = 120,
  variant = 'compact',
}) {
  const [hovered, setHovered] = useState(null);
  const tooltipRef = useAutoPlacement([hovered]);

  const points = useMemo(() => donneesVersPoints(donnees), [donnees]);

  const echelle = useMemo(() => {
    if (echelle_y) return echelle_y;
    const auto = echelleCommune(points);
    return auto || { min: 0, max: 1 };
  }, [echelle_y, points]);

  if (points.length === 0) {
    return <p className="graphe-salaire-vide">Pas de donnée à afficher</p>;
  }

  const avecMarqueur = variant === 'standard';

  const W = 280;
  const H = hauteur;
  const M = { top: 10, right: 14, bottom: 20, left: 46 };
  const PLOT_W = W - M.left - M.right;
  const PLOT_H = H - M.top - M.bottom;

  const xs = points.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xScale = (x) =>
    xMin === xMax
      ? M.left + PLOT_W / 2
      : M.left + ((x - xMin) / (xMax - xMin)) * PLOT_W;

  const { min: yMin, max: yMax } = echelle;
  const yScale = (v) =>
    yMax === yMin
      ? M.top + PLOT_H / 2
      : M.top + (1 - (v - yMin) / (yMax - yMin)) * PLOT_H;

  // 3 graduations Y (min, milieu, max) arrondies à 50 € près.
  const yTicks = [yMin, (yMin + yMax) / 2, yMax].map((t) => Math.round(t / 50) * 50);

  // Segments continus (autour des trous) pour un quartile donné.
  const segments = (cle) => {
    const segs = [];
    let cur = [];
    for (const p of points) {
      if (typeof p[cle] === 'number') {
        cur.push(p);
      } else if (cur.length) {
        segs.push(cur);
        cur = [];
      }
    }
    if (cur.length) segs.push(cur);
    return segs;
  };

  const polyline = (cle, couleur, largeur, dash) =>
    segments(cle).map((seg, i) => (
      <polyline
        key={`${cle}-${i}`}
        points={seg.map((p) => `${xScale(p.x)},${yScale(p[cle])}`).join(' ')}
        fill="none"
        stroke={couleur}
        strokeWidth={largeur}
        strokeDasharray={dash || undefined}
      />
    ));

  const libelleX = (x) => (abscisses === 'durees' ? `${x} mois` : `${x}`);

  // Largeur d'une bande de survol (centrée sur chaque abscisse).
  const bandW = points.length > 1 ? PLOT_W / points.length : PLOT_W;

  function montrerTooltip(e, p) {
    montrerTooltipPos(e.clientX + 8, e.clientY - 4, p);
  }
  function montrerTooltipPos(x, y, p) {
    const fmt = (v) => (typeof v === 'number' ? formatEuroSalaire(v) : 'n.d.');
    setHovered({
      x, y,
      titre: libelleX(p.x),
      contenu: `Q1 : ${fmt(p.q1)} · Médiane : ${fmt(p.q2)} · Q3 : ${fmt(p.q3)}`,
    });
  }

  return (
    <div className="graphe-salaire">
      <div className="graphe-zone">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={`Évolution des salaires (quartiles) ${abscisses === 'durees' ? 'sur la durée d\'observation' : 'sur les millésimes'}`}
        >
          {/* Graduations Y */}
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={M.left} x2={M.left + PLOT_W}
                y1={yScale(t)} y2={yScale(t)}
                stroke={COULEUR_GRILLE} strokeWidth={1}
              />
              <text x={M.left - 5} y={yScale(t) + 3} fontSize={9} textAnchor="end" fill="#666">
                {formatEuroSalaire(t)}
              </text>
            </g>
          ))}

          {/* Ticks X */}
          {points.map((p) => (
            <g key={p.x}>
              <line
                x1={xScale(p.x)} x2={xScale(p.x)}
                y1={M.top + PLOT_H} y2={M.top + PLOT_H + 3}
                stroke="#666" strokeWidth={1}
              />
              <text x={xScale(p.x)} y={M.top + PLOT_H + 14} fontSize={9} textAnchor="middle" fill="#666">
                {abscisses === 'durees' ? `${p.x}` : p.x}
              </text>
            </g>
          ))}
          {abscisses === 'durees' && (
            <text x={M.left + PLOT_W} y={M.top + PLOT_H + 14} fontSize={8} textAnchor="end" fill="#999">
              mois
            </text>
          )}

          {/* Courbes Q1 (court) / Q3 (long) en gris, puis Q2 (plein) au-dessus */}
          {polyline('q1', COULEUR_QUART, 1.2, DASH_Q1)}
          {polyline('q3', COULEUR_QUART, 1.2, DASH_Q3)}
          {polyline('q2', COULEUR_Q2, 2)}

          {/* Marqueur (variant standard uniquement) sur l'abscisse courante */}
          {avecMarqueur && points.map((p) => {
            if (typeof p.q2 !== 'number') return null;
            const courant = marqueur_x != null && Number(p.x) === Number(marqueur_x);
            if (!courant) return null;
            return (
              <g key={`mk-${p.x}`}>
                <circle cx={xScale(p.x)} cy={yScale(p.q2)} r={5.5} fill="none" stroke={COULEUR_Q2} strokeWidth={1.5} />
                <circle cx={xScale(p.x)} cy={yScale(p.q2)} r={3.2} fill={COULEUR_Q2} />
              </g>
            );
          })}

          {/* Bandes de survol invisibles (tooltip Q1+Q2+Q3 par abscisse) */}
          {points.map((p) => (
            <rect
              key={`hit-${p.x}`}
              x={xScale(p.x) - bandW / 2}
              y={M.top}
              width={bandW}
              height={PLOT_H}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => montrerTooltip(e, p)}
              onMouseMove={(e) => montrerTooltip(e, p)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>

        {hovered && createPortal(
          <div
            ref={tooltipRef}
            className="graphe-tooltip"
            style={{ left: hovered.x, top: hovered.y }}
          >
            {hovered.titre}
            <br />
            {hovered.contenu}
          </div>,
          document.body
        )}
      </div>

      <div className="legende-salaires" aria-hidden="true">
        <span><LigneSwatch couleur={COULEUR_QUART} dash={DASH_Q1} />1er quartile</span>
        <span><LigneSwatch couleur={COULEUR_Q2} largeur={2.4} />Médiane</span>
        <span><LigneSwatch couleur={COULEUR_QUART} dash={DASH_Q3} />3e quartile</span>
      </div>
    </div>
  );
}

// Petit échantillon de ligne au style réel (dash/couleur) pour la légende.
function LigneSwatch({ couleur, dash, largeur = 1.6 }) {
  return (
    <svg className="legende-salaires-swatch" width="22" height="8" aria-hidden="true">
      <line
        x1="1" y1="4" x2="21" y2="4"
        stroke={couleur}
        strokeWidth={largeur}
        strokeDasharray={dash || undefined}
      />
    </svg>
  );
}
