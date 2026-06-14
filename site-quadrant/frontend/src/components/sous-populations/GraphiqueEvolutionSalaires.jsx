import { useMemo } from 'react';
import { donneesVersPoints, echelleCommune, formatEuroSalaire } from '../../utils/salaires.js';

// Graphique d'évolution des salaires à 3 courbes (Q1 / Q2 / Q3), en SVG
// natif comme le reste de l'app (Phase 15.6).
//
//  - Q2 (médiane) : couleur principale, trait épais, points marqués.
//  - Q1 / Q3      : gris clair, traits fins (bornes de la fourchette).
//  - Abscisses    : millésimes OU durées d'observation (12/18/24/30 mois).
//  - Courbes interrompues si une valeur manque (segments autour des trous).
//  - Marqueur ● (anneau) sur l'abscisse courante (millésime ou durée).
//  - Échelle Y : commune si `echelle_y` fournie (comparer 2 graphiques),
//    sinon adaptée aux données du graphe.
//
// Props :
//   - donnees   : { "2019": {q1,q2,q3}|null, ... } ou { "12": {...}, ... }
//   - abscisses : 'millesimes' | 'durees'
//   - marqueur_x: valeur d'abscisse à marquer (millésime ou durée)
//   - echelle_y : { min, max } optionnel
//   - hauteur   : px (défaut 120)

const COULEUR_Q2     = '#0E0E60'; // médiane — bleu principal (cf. MiniGrapheEvolution)
const COULEUR_QUART  = '#9a9aa8'; // Q1 / Q3 — gris
const COULEUR_GRILLE = '#e6e6e6';

export default function GraphiqueEvolutionSalaires({
  donnees,
  abscisses = 'durees',
  marqueur_x,
  echelle_y = null,
  hauteur = 120,
}) {
  const points = useMemo(() => donneesVersPoints(donnees), [donnees]);

  const echelle = useMemo(() => {
    if (echelle_y) return echelle_y;
    const auto = echelleCommune(points);
    return auto || { min: 0, max: 1 };
  }, [echelle_y, points]);

  if (points.length === 0) {
    return <p className="graphe-salaire-vide">Pas de donnée à afficher</p>;
  }

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

  const polyline = (cle, couleur, largeur) =>
    segments(cle).map((seg, i) => (
      <polyline
        key={`${cle}-${i}`}
        points={seg.map((p) => `${xScale(p.x)},${yScale(p[cle])}`).join(' ')}
        fill="none"
        stroke={couleur}
        strokeWidth={largeur}
      />
    ));

  const labelX = (x) => (abscisses === 'durees' ? `${x}` : `${x}`);

  return (
    <div className="graphe-salaire">
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
              {labelX(p.x)}
            </text>
          </g>
        ))}
        {abscisses === 'durees' && (
          <text x={M.left + PLOT_W} y={M.top + PLOT_H + 14} fontSize={8} textAnchor="end" fill="#999">
            mois
          </text>
        )}

        {/* Courbes Q1 / Q3 (gris) puis Q2 (principal, au-dessus) */}
        {polyline('q1', COULEUR_QUART, 1.2)}
        {polyline('q3', COULEUR_QUART, 1.2)}
        {polyline('q2', COULEUR_Q2, 2)}

        {/* Points Q2 + marqueur sur l'abscisse courante */}
        {points.map((p) => {
          if (typeof p.q2 !== 'number') return null;
          const cx = xScale(p.x);
          const cy = yScale(p.q2);
          const courant = marqueur_x != null && Number(p.x) === Number(marqueur_x);
          return (
            <g key={`pt-${p.x}`}>
              {courant && (
                <circle cx={cx} cy={cy} r={5.5} fill="none" stroke={COULEUR_Q2} strokeWidth={1.5} />
              )}
              <circle cx={cx} cy={cy} r={courant ? 3.2 : 2.4} fill={COULEUR_Q2}>
                <title>
                  {abscisses === 'durees' ? `${p.x} mois` : p.x} — médiane {formatEuroSalaire(p.q2)}
                </title>
              </circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
