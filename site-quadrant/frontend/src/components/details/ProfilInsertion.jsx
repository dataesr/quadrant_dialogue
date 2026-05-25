import {
  DELAIS_CANONIQUES,
  millesimesAvecDonnees,
  couleursParMillesime,
} from './historique.js';
import LegendeMillesimes from './LegendeMillesimes.jsx';

// Profil d'insertion : axe X = délai (6/12/18/24/30 mois), axe Y =
// taux (0-100 %), une courbe par millésime.
//
// Règles de tracé identiques à MiniGrapheEvolution :
//   - taux != null               → point plein, ligne reliante
//   - non_diffusable === true    → point creux à 50 %, ligne interrompue
//   - taux === null && denom===null → rien
//
// La courbe du millésime courant est en bleu DSFR (#0E0E60) ; les
// autres en dégradé de gris ordonné par millésime (du plus clair pour
// le plus ancien au plus foncé pour le plus récent).
//
// Affichage conditionnel : on rend le SVG seulement si la courbe du
// millésime courant a >= 2 points valides (taux != null). En-dessous
// de ce seuil, le profil dégénère en un point isolé — pas
// d'information visuelle utile.

const W = 280;
const H = 160;
const M = { top: 12, right: 16, bottom: 26, left: 32 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

const COULEUR_GRILLE = '#cccccc';

const delaisNum = DELAIS_CANONIQUES.map(Number);
const delaiMin = Math.min(...delaisNum);
const delaiMax = Math.max(...delaisNum);

const xScale = (delai) =>
  M.left + ((delai - delaiMin) / (delaiMax - delaiMin)) * PLOT_W;
const yScale = (taux) => M.top + (1 - taux / 100) * PLOT_H;

export default function ProfilInsertion({
  indicateurName,
  profil,            // Map<millesime, Array<point>>
  millesimeCourant,
  showTitle = true,
}) {
  const millesimes = millesimesAvecDonnees(profil);
  const millesimeCourantNum = Number(millesimeCourant);

  // Gating : la courbe du courant doit avoir >= 2 points valides.
  const pointsCourants = profil.get(millesimeCourantNum) || [];
  const nbValidesCourant = pointsCourants.filter((p) => p.taux !== null).length;
  if (nbValidesCourant < 2) return null;

  const couleurs = couleursParMillesime(millesimes, millesimeCourantNum);
  // Ordre de rendu : autres en premier (au fond), courant en dernier
  // (au premier plan, jamais masqué par les autres courbes).
  const ordreRendu = [
    ...millesimes.filter((m) => m !== millesimeCourantNum),
    ...(millesimes.includes(millesimeCourantNum) ? [millesimeCourantNum] : []),
  ];

  return (
    <div className="graphe-indicateur">
      {showTitle && <h4 className="graphe-titre">{indicateurName}</h4>}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Profil d'insertion : ${indicateurName}`}>
        {/* Lignes de repère 0/50/100% */}
        <line x1={M.left} x2={M.left + PLOT_W} y1={yScale(50)} y2={yScale(50)}
              stroke={COULEUR_GRILLE} strokeDasharray="2 3" strokeWidth={1} />
        <text x={M.left - 4} y={yScale(0)  + 3} fontSize={9} textAnchor="end" fill="#666">0 %</text>
        <text x={M.left - 4} y={yScale(50) + 3} fontSize={9} textAnchor="end" fill="#666">50 %</text>
        <text x={M.left - 4} y={yScale(100) + 3} fontSize={9} textAnchor="end" fill="#666">100 %</text>

        {/* Axe X : un tick par délai canonique */}
        {delaisNum.map((d) => (
          <g key={d}>
            <line x1={xScale(d)} x2={xScale(d)}
                  y1={M.top + PLOT_H} y2={M.top + PLOT_H + 3}
                  stroke="#666" strokeWidth={1} />
            <text x={xScale(d)} y={M.top + PLOT_H + 14}
                  fontSize={9} textAnchor="middle" fill="#666">
              {d} m
            </text>
          </g>
        ))}

        {/* Une courbe par millésime. */}
        {ordreRendu.map((m) => {
          const points = profil.get(m) || [];
          const couleur = couleurs.get(m) || '#888';
          const courant = m === millesimeCourantNum;
          return (
            <CourbeMillesime
              key={m}
              points={points}
              couleur={couleur}
              accent={courant}
            />
          );
        })}
      </svg>
      <LegendeMillesimes
        millesimes={millesimes}
        millesimeCourant={millesimeCourantNum}
        couleurs={couleurs}
      />
    </div>
  );
}

// Une seule courbe (un millésime). On découpe en segments aux points
// non-diffusables / absents, comme dans MiniGrapheEvolution.
function CourbeMillesime({ points, couleur, accent }) {
  const segments = [];
  let courant = [];
  for (const p of points) {
    if (p.taux !== null) {
      courant.push(p);
    } else if (courant.length) {
      segments.push(courant);
      courant = [];
    }
  }
  if (courant.length) segments.push(courant);

  const strokeWidth = accent ? 1.8 : 1;
  const rayonPoint = accent ? 3 : 2.4;

  return (
    <g>
      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.map((p) => `${xScale(p.delaiNum)},${yScale(p.taux)}`).join(' ')}
          fill="none"
          stroke={couleur}
          strokeWidth={strokeWidth}
        />
      ))}
      {points.map((p) => {
        if (p.taux !== null) {
          return (
            <circle key={p.delaiNum}
              cx={xScale(p.delaiNum)} cy={yScale(p.taux)} r={rayonPoint}
              fill={couleur} />
          );
        }
        if (p.nonDiffusable) {
          return (
            <circle key={p.delaiNum}
              cx={xScale(p.delaiNum)} cy={yScale(50)} r={rayonPoint}
              fill="white" stroke={couleur} strokeWidth={1.2} />
          );
        }
        return null;
      })}
    </g>
  );
}
