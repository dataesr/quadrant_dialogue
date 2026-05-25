import { useMemo, useState } from 'react';
import {
  segmenter,
  calculerEchelleY,
  couleurVariante,
} from './historique.js';
import LegendeVariantes from './LegendeVariantes.jsx';

// Graphique multi-courbes : axe X = millésime, axe Y = taux,
// une courbe par variante (un délai pour Insertion, une durée pour
// Réussite). Remplace l'ancien ProfilInsertion (axe X = délai) — le
// retour utilisateur a montré qu'avoir le temps en X est plus parlant
// pour suivre l'évolution.
//
// Props :
//   titre        : string affiché en <h4> au-dessus du SVG.
//   variantes    : Array<{ key, libelle }> ordonnées chronologiquement
//                  (délai croissant ou durée croissante).
//   parVariante  : Map<key, Array<point>> — point = { millesime, taux,
//                  denominateur, nonDiffusable }.
//   millesimeCourant : pour le highlight (anneau autour du point).
//
// Comportement :
//   - Échelle Y adaptative (calculerEchelleY) + graduations.
//   - Tooltip au survol des points : libellé variante + millésime + taux.
//   - Une seule courbe ? Le composant fonctionne quand même (cas Réussite
//     avec un seul indicateur restant après suppression d'une variante en
//     BDD). À l'appelant de décider s'il préfère basculer en
//     MiniGrapheEvolution simple pour ce cas.
//   - Gating : au moins 2 points valides TOTAUX sur l'ensemble des
//     courbes (sinon le graphique dégénère).

const W = 280;
const H = 160;
const M = { top: 12, right: 16, bottom: 26, left: 36 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

const COULEUR_GRILLE = '#e0e0e0';

export default function GrapheMultiCourbes({
  titre,
  variantes,
  parVariante,
  millesimeCourant,
}) {
  const [hovered, setHovered] = useState(null);

  // Tous les hooks DOIVENT être appelés inconditionnellement, donc on
  // calcule l'ensemble des derived state AVANT le gating ≥ 2 points
  // qui peut retourner null.
  const tousLesPoints = useMemo(() => {
    const out = [];
    for (const v of variantes) {
      const points = parVariante.get(v.key) || [];
      for (const p of points) if (p.taux !== null) out.push(p);
    }
    return out;
  }, [variantes, parVariante]);

  const millesimes = useMemo(() => {
    const set = new Set();
    for (const v of variantes) {
      const points = parVariante.get(v.key) || [];
      for (const p of points) {
        if (p.taux !== null || p.nonDiffusable || p.denominateur !== null) {
          set.add(p.millesime);
        }
      }
    }
    return [...set].sort((a, b) => a - b);
  }, [variantes, parVariante]);

  const { yMin, yMax, ticks } = useMemo(
    () => calculerEchelleY(tousLesPoints.map((p) => p.taux)),
    [tousLesPoints]
  );

  const couleurs = useMemo(() => {
    const map = new Map();
    variantes.forEach((v, i) => map.set(v.key, couleurVariante(i)));
    return map;
  }, [variantes]);

  if (tousLesPoints.length < 2 || millesimes.length === 0) return null;

  const xMin = millesimes[0];
  const xMax = millesimes[millesimes.length - 1];
  const xScale = (m) =>
    xMin === xMax ? M.left + PLOT_W / 2
                  : M.left + ((m - xMin) / (xMax - xMin)) * PLOT_W;
  const yScale = (taux) => M.top + (1 - (taux - yMin) / (yMax - yMin)) * PLOT_H;
  const yPourNonDiff = M.top + PLOT_H / 2;

  return (
    <div className="graphe-indicateur">
      {titre && <h4 className="graphe-titre">{titre}</h4>}
      <div className="graphe-zone">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
             aria-label={titre ? `Graphique : ${titre}` : 'Graphique multi-courbes'}>
          {/* Graduations horizontales (ticks Y) — lignes très discrètes,
              étiquettes en pourcentage à gauche. */}
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

          {/* Axe X : un tick par millésime. */}
          {millesimes.map((m) => (
            <g key={m}>
              <line x1={xScale(m)} x2={xScale(m)}
                    y1={M.top + PLOT_H} y2={M.top + PLOT_H + 3}
                    stroke="#666" strokeWidth={1} />
              <text x={xScale(m)} y={M.top + PLOT_H + 14}
                    fontSize={9} textAnchor="middle" fill="#666">
                {m}
              </text>
            </g>
          ))}

          {/* Une courbe par variante. */}
          {variantes.map((v) => {
            const points = parVariante.get(v.key) || [];
            const couleur = couleurs.get(v.key) || '#888';
            return (
              <Courbe
                key={v.key}
                variante={v}
                points={points}
                couleur={couleur}
                xScale={xScale}
                yScale={yScale}
                yPourNonDiff={yPourNonDiff}
                millesimeCourant={millesimeCourant}
                onHoverPoint={(infos) => setHovered(infos)}
                onLeavePoint={() => setHovered(null)}
              />
            );
          })}
        </svg>

        {hovered && (
          <div
            className="graphe-tooltip"
            style={{ left: hovered.x, top: hovered.y }}
          >
            {hovered.millesime} — {hovered.libelle}
            <br />
            {hovered.contenu}
          </div>
        )}
      </div>

      <LegendeVariantes variantes={variantes} couleurs={couleurs} />
    </div>
  );
}

function Courbe({
  variante,
  points,
  couleur,
  xScale,
  yScale,
  yPourNonDiff,
  millesimeCourant,
  onHoverPoint,
  onLeavePoint,
}) {
  const segments = segmenter(points);
  return (
    <g>
      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.map((p) => `${xScale(p.millesime)},${yScale(p.taux)}`).join(' ')}
          fill="none"
          stroke={couleur}
          strokeWidth={1.5}
        />
      ))}
      {points.map((p) => {
        if (p.taux !== null) {
          const cx = xScale(p.millesime);
          const cy = yScale(p.taux);
          const courant = String(p.millesime) === String(millesimeCourant);
          return (
            <g key={p.millesime}>
              {courant && (
                <circle cx={cx} cy={cy} r={5}
                  fill="none" stroke={couleur} strokeWidth={1} opacity={0.5} />
              )}
              <circle
                cx={cx} cy={cy} r={3.5}
                fill={couleur}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => onHoverPoint({
                  x: cx + 8, y: cy - 4,
                  millesime: p.millesime,
                  libelle: variante.libelle,
                  contenu: `${formatPourcent(p.taux)}${p.denominateur ? ` sur ${p.denominateur}` : ''}`,
                })}
                onMouseLeave={onLeavePoint}
              />
            </g>
          );
        }
        if (p.nonDiffusable) {
          const cx = xScale(p.millesime);
          return (
            <circle
              key={p.millesime}
              cx={cx} cy={yPourNonDiff} r={3}
              fill="white" stroke={couleur} strokeWidth={1.2}
              style={{ cursor: 'help' }}
              onMouseEnter={() => onHoverPoint({
                x: cx + 8, y: yPourNonDiff - 4,
                millesime: p.millesime,
                libelle: variante.libelle,
                contenu: `Non diffusable (denom = ${p.denominateur ?? '?'})`,
              })}
              onMouseLeave={onLeavePoint}
            />
          );
        }
        return null;
      })}
    </g>
  );
}

function formatPourcent(taux) {
  return `${taux.toFixed(1).replace('.', ',')} %`;
}
