import { useMemo, useState } from 'react';
import {
  decouperDomaineSerie,
  nbPointsValides,
  segmenter,
  calculerEchelleY,
} from './historique.js';

// Mini-graphique d'évolution mono-courbe (utilisé pour les cards X/Y
// du panneau de détails ; aussi disponible si on veut une trace simple
// ailleurs). SVG natif comme le reste du quadrant.
//
//  - Axe X : un tick par millésime du domaine de l'indicateur (du
//    premier au dernier où une trace existe).
//  - Axe Y : adaptatif via calculerEchelleY (plus de range fixe
//    0-100 %). 3 à 5 graduations horizontales avec étiquettes.
//  - Plus de ligne « 50 % » : remplacée par les graduations, plus
//    neutres (50 % donnait à tort l'air d'une référence métier).
//  - Points pleins : taux diffusable.
//  - Pas de point pour les entrées non-diffusables : collapsées en
//    données absentes par extraireSerie() — la polyline saute le
//    millésime, idem qu'un trou dans la série.
//  - Tooltip au survol : « millésime : XX,X % sur N » à côté du point.
//
// Gating : ne rend rien si < 2 points valides dans le domaine.

const W = 240;
const H = 100;
const M = { top: 10, right: 14, bottom: 22, left: 32 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

const COULEUR_PRINCIPALE = '#0E0E60';
const COULEUR_GRILLE     = '#e0e0e0';

export default function MiniGrapheEvolution({
  serie,
  millesimeCourant,
  indicateurName,
  showTitle = true,
}) {
  const [hovered, setHovered] = useState(null);

  // Tous les hooks d'abord (rules of hooks : pas de return conditionnel
  // avant la fin des useMemo). Le gating est tranché ensuite.
  const domaine = useMemo(() => decouperDomaineSerie(serie), [serie]);
  const tauxValides = useMemo(
    () => domaine.filter((p) => typeof p.taux === 'number').map((p) => p.taux),
    [domaine]
  );
  const { yMin, yMax, ticks } = useMemo(
    () => calculerEchelleY(tauxValides),
    [tauxValides]
  );

  if (nbPointsValides(domaine) < 2) return null;

  const xs = domaine.map((p) => p.millesime);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xScale = (m) =>
    xMin === xMax
      ? M.left + PLOT_W / 2
      : M.left + ((m - xMin) / (xMax - xMin)) * PLOT_W;

  const yScale = (taux) => M.top + (1 - (taux - yMin) / (yMax - yMin)) * PLOT_H;

  const segments = segmenter(domaine);

  return (
    <div className="graphe-indicateur">
      {showTitle && indicateurName && (
        <h4 className="graphe-titre">{indicateurName}</h4>
      )}
      <div className="graphe-zone">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
             aria-label={`Évolution sur les millésimes${indicateurName ? ' : ' + indicateurName : ''}`}>
          {/* Graduations Y (lignes + étiquettes en %). */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left} x2={M.left + PLOT_W}
                y1={yScale(t)} y2={yScale(t)}
                stroke={COULEUR_GRILLE} strokeWidth={1}
              />
              <text
                x={M.left - 4} y={yScale(t) + 3}
                fontSize={9} textAnchor="end" fill="#666"
              >
                {t} %
              </text>
            </g>
          ))}

          {/* Axe X : un tick par millésime du domaine. */}
          {domaine.map((p) => (
            <g key={p.millesime}>
              <line
                x1={xScale(p.millesime)} x2={xScale(p.millesime)}
                y1={M.top + PLOT_H} y2={M.top + PLOT_H + 3}
                stroke="#666" strokeWidth={1}
              />
              <text x={xScale(p.millesime)} y={M.top + PLOT_H + 14}
                    fontSize={9} textAnchor="middle" fill="#666">
                {p.millesime}
              </text>
            </g>
          ))}

          {/* Courbe segmentée. */}
          {segments.map((seg, i) => (
            <polyline
              key={i}
              points={seg.map((p) => `${xScale(p.millesime)},${yScale(p.taux)}`).join(' ')}
              fill="none"
              stroke={COULEUR_PRINCIPALE}
              strokeWidth={1.5}
            />
          ))}

          {/* Points. */}
          {domaine.map((p) => {
            const cx = xScale(p.millesime);
            const courant = String(p.millesime) === String(millesimeCourant);
            if (typeof p.taux === 'number') {
              const cy = yScale(p.taux);
              return (
                <g key={p.millesime}>
                  {courant && (
                    <circle cx={cx} cy={cy} r={5}
                      fill="none" stroke={COULEUR_PRINCIPALE}
                      strokeWidth={1} opacity={0.5} />
                  )}
                  <circle
                    cx={cx} cy={cy} r={3.5}
                    fill={COULEUR_PRINCIPALE}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHovered({
                      x: cx + 8, y: cy - 4,
                      millesime: p.millesime,
                      contenu: `${formatPourcent(p.taux)}${p.denominateur ? ` sur ${p.denominateur}` : ''}`,
                    })}
                    onMouseLeave={() => setHovered(null)}
                  />
                </g>
              );
            }
            return null;
          })}
        </svg>

        {hovered && (
          <div
            className="graphe-tooltip"
            style={{ left: hovered.x, top: hovered.y }}
          >
            {hovered.millesime}
            <br />
            {hovered.contenu}
          </div>
        )}
      </div>
    </div>
  );
}

function formatPourcent(taux) {
  return `${taux.toFixed(1).replace('.', ',')} %`;
}
