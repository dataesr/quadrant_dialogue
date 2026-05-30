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

// Mini-quadrant animé de la modale d'analyse fine (Phase 14, étendu 14.1).
//
// Axes FIXES : X = emploi salarié FR, Y = emploi stable. L'animation
// porte sur la durée d'observation (6 → 30 mois). Reprend les patterns
// du quadrant principal : zoom d3-zoom, tooltip .quadrant-tooltip, ordre
// de rendu grosses bulles au fond / petites au premier plan.
//
// Phase 14.1 :
//   - bouton « Zoomer sur les bulles » : cadrage auto sur la bounding
//     box des bulles (marge 10 %, marge mini si concentrées) ;
//   - reset du zoom au lancement de l'animation (enLecture) — sinon les
//     bulles sortent du cadre zoomé ;
//   - libellés courts à côté des bulles UNIQUEMENT quand le zoom est
//     actif (placement anti-chevauchement 4 positions).

const OVERFLOW = 30;
const ZOOM_MAX = 8;

// Libellés courts pour l'affichage sur les bulles (zoom actif).
const LIBELLE_COURT = {
  femmes: 'Femmes',
  hommes: 'Hommes',
  apprentis: 'Apprentis',
  femmes_apprenties: 'Femmes app.',
  hommes_apprentis: 'Hommes app.',
  ensemble_diplomation: 'Dip.+non-dip.',
  tous_nationalite: 'Fr.+étrangers',
};

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

// Placement anti-chevauchement des libellés. `pts` : [{id, cx, cy, r, text}].
// Essaie droite → bas → gauche → haut ; ignore la bulle si tout chevauche.
function placerLibelles(pts) {
  const H = 13;
  const charW = 6.0;
  const placed = [];
  const bubbleRects = pts.map((p) => ({ x0: p.cx - p.r, y0: p.cy - p.r, x1: p.cx + p.r, y1: p.cy + p.r }));
  const chevauche = (a, b) => !(a.x1 <= b.x0 || a.x0 >= b.x1 || a.y1 <= b.y0 || a.y0 >= b.y1);
  const result = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const w = p.text.length * charW;
    const candidats = [
      { anchor: 'start',  x: p.cx + p.r + 5, y: p.cy, rect: { x0: p.cx + p.r + 5, y0: p.cy - H / 2, x1: p.cx + p.r + 5 + w, y1: p.cy + H / 2 } },
      { anchor: 'middle', x: p.cx, y: p.cy + p.r + 5 + H * 0.7, rect: { x0: p.cx - w / 2, y0: p.cy + p.r + 5, x1: p.cx + w / 2, y1: p.cy + p.r + 5 + H } },
      { anchor: 'end',    x: p.cx - p.r - 5, y: p.cy, rect: { x0: p.cx - p.r - 5 - w, y0: p.cy - H / 2, x1: p.cx - p.r - 5, y1: p.cy + H / 2 } },
      { anchor: 'middle', x: p.cx, y: p.cy - p.r - 7, rect: { x0: p.cx - w / 2, y0: p.cy - p.r - 7 - H, x1: p.cx + w / 2, y1: p.cy - p.r - 7 } },
    ];
    let choisi = null;
    for (const cand of candidats) {
      const collPlaced = placed.some((r) => chevauche(cand.rect, r));
      const collBulle = bubbleRects.some((r, j) => j !== i && chevauche(cand.rect, r));
      if (!collPlaced && !collBulle) { choisi = cand; break; }
    }
    if (choisi) {
      placed.push(choisi.rect);
      result.push({ id: p.id, text: p.text, x: choisi.x, y: choisi.y, anchor: choisi.anchor });
    }
  }
  return result;
}

export default function MiniQuadrantSousPop({
  donneesParDuree,
  dureesDisponibles,
  dureeCourante,
  phaseAnim = 'normal',
  dureeTransitionMs = 800,
  enLecture = false,
}) {
  // ---------------- Zoom (d3-zoom, cf. Quadrant.jsx) ----------------
  const [svgEl, setSvgEl] = useState(null);
  const zoomRef = useRef(null);
  const [transform, setTransform] = useState(zoomIdentity);
  const [zooming, setZooming] = useState(false);

  useEffect(() => {
    if (!svgEl) return;
    const svg = select(svgEl);
    const z = zoom()
      .scaleExtent([1, ZOOM_MAX])
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

  function zoomReset() {
    if (!zoomRef.current || !svgEl) return;
    select(svgEl).transition().duration(220).call(zoomRef.current.transform, zoomIdentity);
  }
  function zoomBy(factor) {
    if (!zoomRef.current || !svgEl) return;
    select(svgEl).transition().duration(180).call(zoomRef.current.scaleBy, factor);
  }

  const xScale = transform.rescaleX(xScaleBase);
  const yScale = transform.rescaleY(yScaleBase);
  const estZoome = transform.k !== 1 || transform.x !== 0 || transform.y !== 0;

  // ---------------- Tooltip de survol ----------------
  const plotRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const handleHover = useCallback((point, event) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHovered({ point, x: event.clientX - rect.left + 12, y: event.clientY - rect.top + 12 });
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

  // ---------------- Cadrage auto sur les bulles ----------------
  function zoomToBubbles() {
    if (!zoomRef.current || !svgEl || pointsCourants.length === 0) return;
    let xMin = Math.min(...pointsCourants.map((p) => p.x));
    let xMax = Math.max(...pointsCourants.map((p) => p.x));
    let yMin = Math.min(...pointsCourants.map((p) => p.y));
    let yMax = Math.max(...pointsCourants.map((p) => p.y));
    let mx = (xMax - xMin) * 0.10;
    let my = (yMax - yMin) * 0.10;
    // Bulles concentrées (< 5 % d'étendue) : marge mini ±2.5 % du centre.
    if (xMax - xMin < 0.05) { const c = (xMin + xMax) / 2; xMin = c - 0.025; xMax = c + 0.025; mx = 0; }
    if (yMax - yMin < 0.05) { const c = (yMin + yMax) / 2; yMin = c - 0.025; yMax = c + 0.025; my = 0; }
    const vMinX = Math.max(0, xMin - mx);
    const vMaxX = Math.min(1, xMax + mx);
    const vMinY = Math.max(0, yMin - my);
    const vMaxY = Math.min(1, yMax + my);

    const px0 = xScaleBase(toPercent(vMinX));
    const px1 = xScaleBase(toPercent(vMaxX));
    const pyTop = yScaleBase(toPercent(vMaxY)); // Y inversé : taux max en haut
    const pyBot = yScaleBase(toPercent(vMinY));
    const bboxW = Math.abs(px1 - px0);
    const bboxH = Math.abs(pyBot - pyTop);
    if (bboxW < 1 || bboxH < 1) return;

    let k = Math.min(PLOT_WIDTH / bboxW, PLOT_HEIGHT / bboxH);
    k = Math.max(1, Math.min(k, ZOOM_MAX));
    const cx = (px0 + px1) / 2;
    const cy = (pyTop + pyBot) / 2;
    const pcx = MARGIN.left + PLOT_WIDTH / 2;
    const pcy = MARGIN.top + PLOT_HEIGHT / 2;
    const tx = pcx - k * cx;
    const ty = pcy - k * cy;
    const target = zoomIdentity.translate(tx, ty).scale(k);
    select(svgEl).transition().duration(300).call(zoomRef.current.transform, target);
  }

  // Reset du zoom au lancement de l'animation (les bulles bougeraient
  // hors cadre). Ne se redéclenche qu'au passage en lecture.
  useEffect(() => {
    if (enLecture) zoomReset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLecture]);

  // ---------------- Libellés conditionnels (zoom actif) ----------------
  const labels = useMemo(() => {
    if (!estZoome) return [];
    const pts = pointsCourants
      .filter((p) => !p.estReference)
      .map((p) => ({
        id: p.id,
        cx: xScale(toPercent(p.x)),
        cy: yScale(toPercent(p.y)),
        r: rayonBulle(p.nb_etudiants, 'sqrt', allNb),
        text: LIBELLE_COURT[p.id] || p.libelle,
      }));
    return placerLibelles(pts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estZoome, pointsCourants, transform, allNb]);

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

            {/* Libellés courts à côté des bulles (zoom actif uniquement) */}
            {estZoome && labels.map((l) => (
              <text
                key={`lbl-${l.id}`}
                className="mini-quadrant-sp-label"
                x={l.x}
                y={l.y}
                textAnchor={l.anchor}
                dominantBaseline="middle"
                fontSize={11}
              >
                {l.text}
              </text>
            ))}
          </g>
        </svg>

        <div className="quadrant-zoom-controls">
          <button type="button" onClick={() => zoomBy(1.5)}    aria-label="Zoom avant">+</button>
          <button type="button" onClick={() => zoomBy(1 / 1.5)} aria-label="Zoom arrière">−</button>
          <button type="button" onClick={zoomReset}            aria-label="Réinitialiser le zoom">⌂</button>
        </div>

        {hovered && <TooltipSousPop hovered={hovered} />}
      </div>

      <div className="mini-quadrant-sp-barre-actions">
        <button
          type="button"
          className="fr-btn fr-btn--sm fr-btn--tertiary fr-icon-zoom-in-line fr-btn--icon-left"
          onClick={() => (estZoome ? zoomReset() : zoomToBubbles())}
        >
          {estZoome ? 'Réinitialiser le zoom' : 'Zoomer sur les bulles'}
        </button>
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
