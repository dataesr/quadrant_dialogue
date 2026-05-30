import { useMemo } from 'react';
import Axes from '../quadrant/Axes.jsx';
import {
  WIDTH, HEIGHT, MARGIN, PLOT_WIDTH, PLOT_HEIGHT,
  xScaleBase, yScaleBase, toPercent, rayonBulle,
} from '../quadrant/geometry.js';
import {
  COULEUR_CRITERE_SOUS_POP, LIBELLE_CRITERE_SOUS_POP,
} from '../../utils/colors.js';

// Mini-quadrant animé de la modale d'analyse fine (Phase 14, Section 3).
//
// Axes FIXES : X = Taux sortants en emploi salarié en France,
// Y = Taux sortants en emploi stable. L'animation porte sur la durée
// d'observation (6 → 12 → 18 → 24 → 30 mois), pas sur le millésime.
//
// Mêmes principes de rendu que QuadrantAnime.jsx (modale temporelle) :
//   - bulles translatées via la PROPRIÉTÉ CSS transform (fluide
//     cross-navigateur), pas l'attribut SVG ;
//   - traces résiduelles DÉRIVÉES des données (useMemo), pas accumulées ;
//   - filigrane de la durée courante en grand, semi-transparent.
//
// La référence (diplômés français) est une bulle grise étiquetée. Les
// autres sous-populations sont colorées par critère. Seules les
// sous-populations diffusables (taux non masqués) apparaissent.

// Construit la liste des points (référence + sous-populations
// diffusables) pour une durée donnée. Un point porte ses coordonnées
// 0..1 (taux emploi salarié FR en X, emploi stable en Y).
function pointsPourDuree(donneesParDuree, duree) {
  const bloc = donneesParDuree?.[String(duree)];
  if (!bloc) return [];
  const out = [];
  const ref = bloc.reference;
  if (ref && ref.taux_emploi_sal_fr != null && ref.taux_emploi_stable != null) {
    out.push({
      id: 'reference',
      critere: 'reference',
      libelle: 'Référence',
      nb_etudiants: ref.nb_etudiants,
      x: ref.taux_emploi_sal_fr,
      y: ref.taux_emploi_stable,
      estReference: true,
    });
  }
  for (const sp of (bloc.sous_populations || [])) {
    if (!sp.diffusable) continue;
    if (sp.taux_emploi_sal_fr == null || sp.taux_emploi_stable == null) continue;
    out.push({
      id: sp.id,
      critere: sp.critere,
      libelle: sp.libelle,
      nb_etudiants: sp.nb_etudiants,
      x: sp.taux_emploi_sal_fr,
      y: sp.taux_emploi_stable,
      estReference: false,
    });
  }
  return out;
}

function couleurCritere(critere) {
  return COULEUR_CRITERE_SOUS_POP[critere] || '#888';
}

export default function MiniQuadrantSousPop({
  donneesParDuree,
  dureesDisponibles,
  dureeCourante,
  phaseAnim = 'normal',
  dureeTransitionMs = 800,
}) {
  // Points du millésime courant, indexés par id.
  const pointsCourants = useMemo(
    () => pointsPourDuree(donneesParDuree, dureeCourante),
    [donneesParDuree, dureeCourante]
  );
  const pointParId = useMemo(() => {
    const m = new Map();
    for (const p of pointsCourants) m.set(p.id, p);
    return m;
  }, [pointsCourants]);

  // Ensemble stable des ids/critères/libellés sur toutes les durées
  // (pour un rendu cohérent quand un point apparaît/disparaît selon la
  // durée — diffusabilité variable). Trié : grosses bulles d'abord
  // (au fond), référence toujours rendue en dernier (au-dessus).
  const idsAffiches = useMemo(() => {
    const map = new Map();
    for (const d of (dureesDisponibles || [])) {
      for (const p of pointsPourDuree(donneesParDuree, d)) {
        if (!map.has(p.id)) map.set(p.id, p);
      }
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      if (a.estReference) return 1;       // référence au-dessus
      if (b.estReference) return -1;
      return (b.nb_etudiants ?? 0) - (a.nb_etudiants ?? 0);
    });
    return arr;
  }, [donneesParDuree, dureesDisponibles]);

  // Rayons stables : on calibre sur tous les effectifs observés.
  const allNb = useMemo(
    () => idsAffiches.map((p) => p.nb_etudiants ?? 0).filter((n) => n > 0),
    [idsAffiches]
  );

  // Référence du millésime courant (lignes pointillées).
  const refCourante = pointParId.get('reference') || null;

  // Traces résiduelles : pour chaque id, positions successives depuis la
  // première durée jusqu'à la durée courante (incluse). Dérivées des
  // données, pas accumulées. Un point absent (non diffusable) à une
  // durée interrompt la trace (on ne pousse pas de position).
  const traces = useMemo(() => {
    const result = new Map();
    const durees = dureesDisponibles || [];
    const idxCourant = durees.indexOf(dureeCourante);
    if (idxCourant === -1) return result;
    for (let i = 0; i <= idxCourant; i++) {
      for (const p of pointsPourDuree(donneesParDuree, durees[i])) {
        const arr = result.get(p.id) || [];
        arr.push({ cx: xScaleBase(toPercent(p.x)), cy: yScaleBase(toPercent(p.y)) });
        result.set(p.id, arr);
      }
    }
    return result;
  }, [donneesParDuree, dureesDisponibles, dureeCourante]);

  // Transitions : désactivées au snap (retour 30 → 6) pour ne pas voir
  // les bulles « voler » à l'envers.
  const enSnap = phaseAnim === 'snap';
  const transitionBulle = enSnap
    ? 'opacity 400ms ease-in-out'
    : `transform ${dureeTransitionMs}ms ease-in-out, opacity 400ms ease-in-out`;
  const transitionLigne = enSnap
    ? 'none'
    : `transform ${dureeTransitionMs}ms ease-in-out`;

  // Opacité : 0 pendant fade-out et snap (disparition en fin de boucle),
  // sinon présente uniquement si le point existe à la durée courante.
  function opacite(present) {
    if (phaseAnim === 'fade-out' || phaseAnim === 'snap') return 0;
    return present ? 1 : 0;
  }

  // Légende dynamique : critères réellement présents (hors référence,
  // affichée séparément).
  const criteresPresents = useMemo(() => {
    const seen = new Set();
    for (const p of idsAffiches) {
      if (!p.estReference) seen.add(p.critere);
    }
    return Array.from(seen);
  }, [idsAffiches]);

  return (
    <div className="mini-quadrant-sp">
      <svg
        className="mini-quadrant-sp-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Trajectoires d'insertion — observation à ${dureeCourante} mois`}
      >
        {/* Durée courante en filigrane */}
        <text
          className="mini-quadrant-sp-duree"
          x={MARGIN.left + PLOT_WIDTH - 16}
          y={MARGIN.top + PLOT_HEIGHT - 16}
          textAnchor="end"
          fontSize={120}
          fontWeight={700}
          fill="#000091"
          opacity={0.08}
        >
          {dureeCourante} mois
        </text>

        <Axes
          xScale={xScaleBase}
          yScale={yScaleBase}
          libelleX="Taux sortants en emploi salarié en France"
          libelleY="Taux sortants en emploi stable"
        />

        {/* Lignes de référence sur les valeurs de la référence courante */}
        {refCourante && (() => {
          const xPx = xScaleBase(toPercent(refCourante.x));
          const yPx = yScaleBase(toPercent(refCourante.y));
          return (
            <g>
              <line
                x1={0} x2={0}
                y1={MARGIN.top} y2={MARGIN.top + PLOT_HEIGHT}
                stroke="#888780"
                strokeDasharray="4 3"
                style={{ transform: `translate(${xPx}px, 0px)`, transition: transitionLigne }}
              />
              <line
                x1={MARGIN.left} x2={MARGIN.left + PLOT_WIDTH}
                y1={0} y2={0}
                stroke="#888780"
                strokeDasharray="4 3"
                style={{ transform: `translate(0px, ${yPx}px)`, transition: transitionLigne }}
              />
            </g>
          );
        })()}

        {/* Traces résiduelles (trajectoire 6 → durée courante) */}
        <g className="mini-quadrant-sp-traces">
          {Array.from(traces.entries()).map(([id, positions]) => {
            if (!positions || positions.length < 2) return null;
            const p = idsAffiches.find((q) => q.id === id);
            const couleur = couleurCritere(p?.critere);
            const points = positions.map((pt) => `${pt.cx},${pt.cy}`).join(' ');
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

        {/* Bulles */}
        <g className="mini-quadrant-sp-bulles">
          {idsAffiches.map((meta) => {
            const courant = pointParId.get(meta.id);
            const present = !!courant;
            const p = courant || meta; // position de repli quand absent
            const cx = xScaleBase(toPercent(p.x));
            const cy = yScaleBase(toPercent(p.y));
            const couleur = couleurCritere(meta.critere);
            const r = meta.estReference
              ? Math.max(rayonBulle(meta.nb_etudiants, 'sqrt', allNb), 14)
              : rayonBulle(meta.nb_etudiants, 'sqrt', allNb);
            return (
              <g
                key={meta.id}
                style={{
                  transform: `translate(${cx}px, ${cy}px)`,
                  transition: transitionBulle,
                  opacity: opacite(present),
                }}
              >
                <circle
                  cx={0}
                  cy={0}
                  r={r}
                  fill={couleur}
                  fillOpacity={meta.estReference ? 0.75 : 0.61}
                  stroke={couleur}
                  strokeWidth={1}
                />
                {meta.estReference && (
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11}
                    fontWeight={700}
                    fill="#fff"
                  >
                    Référence
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="mini-quadrant-sp-legende">
        <span className="mini-quadrant-sp-legende-item">
          <span className="puce" style={{ background: COULEUR_CRITERE_SOUS_POP.reference }} />
          {LIBELLE_CRITERE_SOUS_POP.reference}
        </span>
        {criteresPresents.map((c) => (
          <span key={c} className="mini-quadrant-sp-legende-item">
            <span className="puce" style={{ background: couleurCritere(c) }} />
            {LIBELLE_CRITERE_SOUS_POP[c] || c}
          </span>
        ))}
        <span className="mini-quadrant-sp-legende-taille">
          Taille = effectif de la sous-population
        </span>
      </div>
    </div>
  );
}
