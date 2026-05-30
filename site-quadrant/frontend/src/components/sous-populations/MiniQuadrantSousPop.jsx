import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { zoom, zoomIdentity } from 'd3-zoom';
import { select } from 'd3-selection';
import Axes from '../quadrant/Axes.jsx';
import { useAutoPlacement } from '../../utils/useAutoPlacement.js';
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
// Reprend les patterns du quadrant principal (Quadrant.jsx) : zoom
// d3-zoom (molette / drag / boutons), tooltip de survol via la classe
// .quadrant-tooltip + useAutoPlacement, ordre de rendu grosses bulles
// au fond / petites au premier plan (sinon une petite bulle nichée
// derrière la grosse référence devient impossible à survoler).
//
// Mêmes principes d'animation que QuadrantAnime.jsx : bulles
// translatées via la PROPRIÉTÉ CSS transform (fluide cross-navigateur),
// traces dérivées des données (useMemo), filigrane de durée.

const OVERFLOW = 30;

// Construit la liste des points (référence + sous-populations
// diffusables) pour une durée donnée. Coordonnées 0..1 : emploi
// salarié FR en X, emploi stable en Y.
function pointsPourDuree(donneesParDuree, duree) {
  const bloc = donneesParDuree?.[String(duree)];
  if (!bloc) return [];
  const out = [];
  const ref = bloc.reference;
  if (ref && ref.taux_emploi_sal_fr != null && ref.taux_emploi_stable != null) {
    out.push({
      id: 'reference',
      critere: 'reference',
      libelle: 'Référence (diplômés français)',
      nb_etudiants: ref.nb_etudiants,
      taux_poursuivants: ref.taux_poursuivants,
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
      taux_poursuivants: sp.taux_poursuivants,
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

function formaterPct(taux) {
  if (taux == null) return 'n.s.';
  return `${(taux * 100).toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`;
}

export default function MiniQuadrantSousPop({
  donneesParDuree,
  dureesDisponibles,
  dureeCourante,
  phaseAnim = 'normal',
  dureeTransitionMs = 800,
}) {
  // ---------------- Zoom (d3-zoom, cf. Quadrant.jsx) ----------------
  const [svgEl, setSvgEl] = useState(null);
  const zoomRef = useRef(null);
  const [transform, setTransform] = useState(zoomIdentity);
  // Pendant un geste de zoom/pan on coupe les transitions CSS des
  // bulles : sinon chaque event de drag déclencherait une transition
  // de 800 ms → pan saccadé. L'animation de durée reste fluide hors zoom.
  const [zooming, setZooming] = useState(false);

  useEffect(() => {
    if (!svgEl) return;
    const svg = select(svgEl);
    const z = zoom()
      .scaleExtent([1, 8])
      .extent([[0, 0], [WIDTH, HEIGHT]])
      .translateExtent([[0, 0], [WIDTH, HEIGHT]])
      .on('start', () => setZooming(true))
      .on('zoom', (event) => setTransform(event.transform))
      .on('end', () => setZooming(false));
    svg.call(z);
    zoomRef.current = z;
    return () => {
      svg.on('.zoom', null);
      zoomRef.current = null;
    };
  }, [svgEl]);

  function zoomBy(factor) {
    if (!zoomRef.current || !svgEl) return;
    select(svgEl).transition().duration(180).call(zoomRef.current.scaleBy, factor);
  }
  function zoomReset() {
    if (!zoomRef.current || !svgEl) return;
    select(svgEl).transition().duration(180).call(zoomRef.current.transform, zoomIdentity);
  }

  // Échelles effectives = base × transform d3-zoom.
  const xScale = transform.rescaleX(xScaleBase);
  const yScale = transform.rescaleY(yScaleBase);

  // ---------------- Tooltip de survol ----------------
  const plotRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const handleHover = useCallback((point, event) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHovered({
      point,
      x: event.clientX - rect.left + 12,
      y: event.clientY - rect.top + 12,
    });
  }, []);
  const handleLeave = useCallback(() => setHovered(null), []);

  // ---------------- Données dérivées ----------------
  const pointsCourants = useMemo(
    () => pointsPourDuree(donneesParDuree, dureeCourante),
    [donneesParDuree, dureeCourante]
  );
  const pointParId = useMemo(() => {
    const m = new Map();
    for (const p of pointsCourants) m.set(p.id, p);
    return m;
  }, [pointsCourants]);

  // Ensemble stable des points sur toutes les durées (pour un rendu
  // cohérent quand un point apparaît/disparaît selon la durée). Tri par
  // effectif DÉCROISSANT : les grosses bulles d'abord (= peintes au
  // fond), les petites ensuite (= au premier plan, survolables). La
  // référence, plus grosse que les sous-populations, passe donc au fond.
  const idsAffiches = useMemo(() => {
    const map = new Map();
    for (const d of (dureesDisponibles || [])) {
      for (const p of pointsPourDuree(donneesParDuree, d)) {
        if (!map.has(p.id)) map.set(p.id, p);
      }
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => (b.nb_etudiants ?? 0) - (a.nb_etudiants ?? 0));
    return arr;
  }, [donneesParDuree, dureesDisponibles]);

  const allNb = useMemo(
    () => idsAffiches.map((p) => p.nb_etudiants ?? 0).filter((n) => n > 0),
    [idsAffiches]
  );

  const refCourante = pointParId.get('reference') || null;

  // Traces résiduelles en coordonnées taux (0..1) — converties en pixels
  // au rendu via xScale/yScale pour suivre le zoom sans recalcul du memo.
  const tracesTaux = useMemo(() => {
    const result = new Map();
    const durees = dureesDisponibles || [];
    const idxCourant = durees.indexOf(dureeCourante);
    if (idxCourant === -1) return result;
    for (let i = 0; i <= idxCourant; i++) {
      for (const p of pointsPourDuree(donneesParDuree, durees[i])) {
        const arr = result.get(p.id) || [];
        arr.push({ x: p.x, y: p.y });
        result.set(p.id, arr);
      }
    }
    return result;
  }, [donneesParDuree, dureesDisponibles, dureeCourante]);

  // ---------------- Transitions ----------------
  const enSnap = phaseAnim === 'snap';
  const transitionBulle = zooming
    ? 'none'
    : enSnap
      ? 'opacity 400ms ease-in-out'
      : `transform ${dureeTransitionMs}ms ease-in-out, opacity 400ms ease-in-out`;
  const transitionLigne = (zooming || enSnap)
    ? 'none'
    : `transform ${dureeTransitionMs}ms ease-in-out`;

  function opacite(present) {
    if (phaseAnim === 'fade-out' || phaseAnim === 'snap') return 0;
    return present ? 1 : 0;
  }

  const criteresPresents = useMemo(() => {
    const seen = new Set();
    for (const p of idsAffiches) {
      if (!p.estReference) seen.add(p.critere);
    }
    return Array.from(seen);
  }, [idsAffiches]);

  return (
    <div className="mini-quadrant-sp">
      <div className="mini-quadrant-sp-plot" ref={plotRef}>
        <svg
          ref={setSvgEl}
          className="mini-quadrant-sp-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Trajectoires d'insertion — observation à ${dureeCourante} mois`}
        >
          <defs>
            <clipPath id="msp-clip-bulles">
              <rect
                x={MARGIN.left - OVERFLOW}
                y={MARGIN.top - OVERFLOW}
                width={PLOT_WIDTH + 2 * OVERFLOW}
                height={PLOT_HEIGHT + 2 * OVERFLOW}
              />
            </clipPath>
          </defs>

          {/* Durée courante en filigrane (fixe, hors zoom) */}
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

          {/* Surface de capture pour le drag d3-zoom */}
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={PLOT_WIDTH}
            height={PLOT_HEIGHT}
            fill="transparent"
            pointerEvents="all"
          />

          <Axes
            xScale={xScale}
            yScale={yScale}
            libelleX="Taux sortants en emploi salarié en France"
            libelleY="Taux sortants en emploi stable"
          />

          <g clipPath="url(#msp-clip-bulles)">
            {/* Lignes de référence sur la référence courante */}
            {refCourante && (() => {
              const xPx = xScale(toPercent(refCourante.x));
              const yPx = yScale(toPercent(refCourante.y));
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
              {Array.from(tracesTaux.entries()).map(([id, positions]) => {
                if (!positions || positions.length < 2) return null;
                const p = idsAffiches.find((q) => q.id === id);
                const couleur = couleurCritere(p?.critere);
                const points = positions
                  .map((pt) => `${xScale(toPercent(pt.x))},${yScale(toPercent(pt.y))}`)
                  .join(' ');
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

            {/* Bulles (grosses au fond, petites au premier plan) */}
            <g className="mini-quadrant-sp-bulles">
              {idsAffiches.map((meta) => {
                const courant = pointParId.get(meta.id);
                const present = !!courant;
                const p = courant || meta;
                const cx = xScale(toPercent(p.x));
                const cy = yScale(toPercent(p.y));
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
                      cursor: 'pointer',
                    }}
                    onMouseMove={(e) => present && handleHover(p, e)}
                    onMouseEnter={(e) => present && handleHover(p, e)}
                    onMouseLeave={handleLeave}
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
                        pointerEvents="none"
                      >
                        Référence
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </g>
        </svg>

        {/* Boutons de zoom (mêmes classes que le quadrant principal) */}
        <div className="quadrant-zoom-controls">
          <button type="button" onClick={() => zoomBy(1.5)}    aria-label="Zoom avant">+</button>
          <button type="button" onClick={() => zoomBy(1 / 1.5)} aria-label="Zoom arrière">−</button>
          <button type="button" onClick={zoomReset}            aria-label="Réinitialiser le zoom">⌂</button>
        </div>

        {hovered && <TooltipSousPop hovered={hovered} />}
      </div>

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

// Tooltip de survol — même conteneur visuel (.quadrant-tooltip) et même
// auto-placement que le quadrant principal.
function TooltipSousPop({ hovered }) {
  const ref = useAutoPlacement([hovered]);
  const p = hovered.point;
  return (
    <div
      ref={ref}
      className="quadrant-tooltip"
      style={{ left: `${hovered.x}px`, top: `${hovered.y}px` }}
    >
      <div className="libelle">{p.libelle}</div>
      <div>Effectif : {p.nb_etudiants != null ? p.nb_etudiants.toLocaleString('fr-FR') : '—'}</div>
      <div>Emploi salarié FR : {formaterPct(p.x)}</div>
      <div>Emploi stable&nbsp;&nbsp;&nbsp;&nbsp;: {formaterPct(p.y)}</div>
      <div>Poursuite d'études : {formaterPct(p.taux_poursuivants)}</div>
    </div>
  );
}
