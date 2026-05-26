import { useMemo, useState } from 'react';
import {
  decouperDomaineSerie,
  calculerEchelleYEffectifs,
} from './historique.js';

// Variante « effectifs » de MiniGrapheEvolution. Affiche les deux
// composantes brutes d'un indicateur — numérateur (la sous-population
// mesurée, par ex. « reçus », « sortants en emploi ») et dénominateur
// (la population de référence, par ex. « entrants », « sortants ») —
// sur la même échelle absolue, pour permettre à l'utilisateur de
// comprendre si une variation du taux vient d'un changement de num,
// de denom, ou des deux.
//
// Règles graphiques :
//  - Axe Y absolu, démarre TOUJOURS à 0 (comparaison directe num/denom).
//  - 2 courbes : denom en gris (#5A5A5A, plus discret), num en bleu
//    DSFR (#0E0E60, mis en avant).
//  - Pour chaque courbe : segments interrompus quand la valeur est
//    null (point absent). Cas non-diffusable : les entrées sont
//    collapsées en « tout null » par extraireSerie() — le millésime
//    est sauté sur les deux courbes, pas de point isolé.
//  - Tooltip au survol : « <millésime> / num = X, denom = Y ».
//
// Gating : ≥ 2 points valides total (num et denom confondus).

const W = 240;
const H = 100;
const M = { top: 10, right: 14, bottom: 22, left: 40 }; // left élargi : effectifs à 3-4 chiffres
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

// Bleu et rouge Marianne (couleurs officielles DSFR) pour un contraste
// fort entre numérateur et dénominateur. La hiérarchie « num inclus
// dans denom » est portée par les libellés et la sémantique ; les
// couleurs servent uniquement à distinguer.
const COULEUR_NUM    = '#000091'; // Bleu Marianne
const COULEUR_DENOM  = '#E1000F'; // Rouge Marianne
const COULEUR_GRILLE = '#e0e0e0';

export default function MiniGrapheEffectifs({ serie, millesimeCourant }) {
  const [hovered, setHovered] = useState(null);

  const domaine = useMemo(() => decouperDomaineSerie(serie), [serie]);

  const valeurs = useMemo(() => {
    const out = [];
    for (const p of domaine) {
      if (typeof p.numerateur === 'number')   out.push(p.numerateur);
      if (typeof p.denominateur === 'number') out.push(p.denominateur);
    }
    return out;
  }, [domaine]);

  const { yMin, yMax, ticks } = useMemo(
    () => calculerEchelleYEffectifs(valeurs),
    [valeurs]
  );

  if (valeurs.length < 2) return null;

  const xs = domaine.map((p) => p.millesime);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xScale = (m) =>
    xMin === xMax
      ? M.left + PLOT_W / 2
      : M.left + ((m - xMin) / (xMax - xMin)) * PLOT_W;
  const yScale = (v) =>
    yMax === yMin
      ? M.top + PLOT_H / 2
      : M.top + (1 - (v - yMin) / (yMax - yMin)) * PLOT_H;

  // Segmentation par courbe (num puis denom) sur la base d'un prédicat
  // « la valeur est-elle un nombre ? ». Les segments sont interrompus
  // sur les trous et les non-diffusables (num = null).
  const segmentsNum   = segmenterPar(domaine, (p) => p.numerateur);
  const segmentsDenom = segmenterPar(domaine, (p) => p.denominateur);

  return (
    <div className="graphe-indicateur">
      <div className="graphe-zone">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Évolution des effectifs">
          {/* Graduations Y (étiquettes en effectifs absolus, pas de %) */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left} x2={M.left + PLOT_W}
                y1={yScale(t)} y2={yScale(t)}
                stroke={COULEUR_GRILLE} strokeWidth={1}
              />
              <text x={M.left - 4} y={yScale(t) + 3}
                    fontSize={9} textAnchor="end" fill="#666">
                {t}
              </text>
            </g>
          ))}

          {/* Axe X : un tick par millésime */}
          {domaine.map((p) => (
            <g key={p.millesime}>
              <line x1={xScale(p.millesime)} x2={xScale(p.millesime)}
                    y1={M.top + PLOT_H} y2={M.top + PLOT_H + 3}
                    stroke="#666" strokeWidth={1} />
              <text x={xScale(p.millesime)} y={M.top + PLOT_H + 14}
                    fontSize={9} textAnchor="middle" fill="#666">
                {p.millesime}
              </text>
            </g>
          ))}

          {/* Courbe Dénominateur (en arrière-plan, gris) */}
          {segmentsDenom.map((seg, i) => (
            <polyline
              key={`denom-${i}`}
              points={seg.map((p) => `${xScale(p.millesime)},${yScale(p.denominateur)}`).join(' ')}
              fill="none" stroke={COULEUR_DENOM} strokeWidth={1.5}
            />
          ))}

          {/* Courbe Numérateur (au premier plan, bleu) */}
          {segmentsNum.map((seg, i) => (
            <polyline
              key={`num-${i}`}
              points={seg.map((p) => `${xScale(p.millesime)},${yScale(p.numerateur)}`).join(' ')}
              fill="none" stroke={COULEUR_NUM} strokeWidth={1.5}
            />
          ))}

          {/* Points sur chaque courbe + tooltips */}
          {domaine.map((p) => {
            const cx = xScale(p.millesime);
            const courant = String(p.millesime) === String(millesimeCourant);
            const elements = [];

            if (typeof p.denominateur === 'number') {
              const cy = yScale(p.denominateur);
              elements.push(
                <circle
                  key={`d-${p.millesime}`}
                  cx={cx} cy={cy} r={3}
                  fill={COULEUR_DENOM}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHovered({
                    x: cx + 8, y: cy - 4,
                    millesime: p.millesime,
                    contenu: tooltipEffectifs(p),
                  })}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            }
            if (typeof p.numerateur === 'number') {
              const cy = yScale(p.numerateur);
              elements.push(
                <g key={`n-${p.millesime}`}>
                  {courant && (
                    <circle cx={cx} cy={cy} r={5}
                      fill="none" stroke={COULEUR_NUM} strokeWidth={1} opacity={0.5} />
                  )}
                  <circle
                    cx={cx} cy={cy} r={3.5}
                    fill={COULEUR_NUM}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHovered({
                      x: cx + 8, y: cy - 4,
                      millesime: p.millesime,
                      contenu: tooltipEffectifs(p),
                    })}
                    onMouseLeave={() => setHovered(null)}
                  />
                </g>
              );
            }
            return elements;
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

      <div className="legende-variantes">
        <span>
          <span className="puce" style={{ background: COULEUR_NUM }} />
          Numérateur
        </span>
        <span>
          <span className="puce" style={{ background: COULEUR_DENOM }} />
          Dénominateur
        </span>
      </div>
    </div>
  );
}

function segmenterPar(serie, getter) {
  const segments = [];
  let courant = [];
  for (const p of serie) {
    const v = getter(p);
    if (typeof v === 'number') {
      courant.push(p);
    } else if (courant.length) {
      segments.push(courant);
      courant = [];
    }
  }
  if (courant.length) segments.push(courant);
  return segments;
}

function tooltipEffectifs(p) {
  const parts = [];
  if (typeof p.numerateur === 'number')   parts.push(`num = ${p.numerateur}`);
  if (typeof p.denominateur === 'number') parts.push(`denom = ${p.denominateur}`);
  return parts.length ? parts.join(' · ') : '—';
}
