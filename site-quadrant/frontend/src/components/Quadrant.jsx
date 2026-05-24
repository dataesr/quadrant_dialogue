import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { zoom, zoomIdentity } from 'd3-zoom';
import { select } from 'd3-selection';
import { quantile } from 'd3-array';

import { useApp } from '../context/AppContext.jsx';
import { useQuadrant } from '../hooks/useQuadrant.js';
import Axes from './quadrant/Axes.jsx';
import Bulles from './quadrant/Bulles.jsx';
import LignesReference from './quadrant/LignesReference.jsx';
import {
  WIDTH, HEIGHT, MARGIN, PLOT_WIDTH, PLOT_HEIGHT,
  xScaleBase, yScaleBase,
  rayonBulle,
} from './quadrant/geometry.js';
import { COLORS_DOMAINE } from '../utils/colors.js';

// Composant principal du quadrant. Orchestrateur :
//   1. fetch des bulles via useQuadrant
//   2. publication des libellés de mentions dans AppContext (pour la
//      barre de recherche)
//   3. gestion du zoom (d3-zoom : wheel/drag/double-clic, boutons UI)
//   4. gestion du tooltip de survol (overlay HTML)
//   5. rendu du SVG (axes / lignes ref / bulles) avec scales transformées
//   6. rendu des légendes (couleurs des domaines présents + tailles)

const LIBELLES_DOMAINES = {
  DEG:    'Droit, économie, gestion (DEG)',
  LLA:    'Lettres, langues, arts (LLA)',
  SHS:    'Sciences humaines et sociales (SHS)',
  STS:    'Sciences, technologies, santé (STS)',
  INTERD: 'Pluridisciplinaire (INTERD)',
};

const ORDRE_DOMAINES = ['DEG', 'LLA', 'SHS', 'STS', 'INTERD'];

// Marge de débordement autorisée pour les bulles autour du plot strict.
// Le clipPath dédié aux bulles englobe (plot ± OVERFLOW), de sorte qu'une
// grosse bulle centrée près du bord puisse mordre légèrement dehors —
// plus lisible que la couper à ras. Les marges du SVG (cf. geometry.js)
// sont dimensionnées pour absorber ces 30 px.
const OVERFLOW = 30;

export default function Quadrant() {
  const {
    cursus, vue, millesime,
    variableX, variableY, dateInserX, dateInserY,
    etabContexte,
    domaine, discipline, secteur, mention, typeMaster,
    representativite, ligneReference,
    scaleMode,
    rechercheMention,
    setMentionsAffichees,
  } = useApp();

  const { loading, data, error } = useQuadrant({
    cursus, vue, millesime,
    variableX, variableY, dateInserX, dateInserY,
    etabContexte,
    domaine, discipline, secteur, mention, typeMaster,
    representativite, ligneReference,
  });

  // ---------------- Tooltip ----------------
  // hovered : { bulle, x, y } en coordonnées du wrapper (pixels écran
  // relatifs au .quadrant-wrapper, pas au SVG).
  const [hovered, setHovered] = useState(null);
  const wrapperRef = useRef(null);

  const handleHover = useCallback((bulle, event) => {
    const wrapperRect = wrapperRef.current?.getBoundingClientRect();
    if (!wrapperRect) return;
    setHovered({
      bulle,
      x: event.clientX - wrapperRect.left + 12,
      y: event.clientY - wrapperRect.top  + 12,
    });
  }, []);
  const handleLeave = useCallback(() => setHovered(null), []);

  // ---------------- Zoom ----------------
  // Callback ref : le useEffect d'attachement de d3-zoom doit pouvoir
  // s'exécuter quand le SVG arrive dans le DOM. Avec un useRef classique,
  // au premier render le SVG n'est pas encore monté (early-return sur
  // loading=true) ; un useEffect [] ne se redéclencherait pas. On
  // utilise donc un state-backed callback ref qui re-trigger le useEffect
  // dès que l'élément change (mount ou unmount).
  const [svgEl, setSvgEl] = useState(null);
  const zoomRef = useRef(null);
  const [transform, setTransform] = useState(zoomIdentity);

  useEffect(() => {
    if (!svgEl) return;
    const svg = select(svgEl);
    const z = zoom()
      .scaleExtent([1, 10])
      .extent([[0, 0], [WIDTH, HEIGHT]])
      .translateExtent([[0, 0], [WIDTH, HEIGHT]])
      .on('zoom', (event) => setTransform(event.transform));
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

  // Scales effectives : original × transform d3-zoom. Quand transform =
  // identité, on retombe sur xScaleBase / yScaleBase (domaine 0..100).
  const xScale = transform.rescaleX(xScaleBase);
  const yScale = transform.rescaleY(yScaleBase);

  // ---------------- Données dérivées ----------------
  // Memoize : sans ça, `bulles` change de référence à chaque render et
  // tous les useMemo/useEffect en aval s'invalident inutilement
  // → boucle infinie via setMentionsAffichees.
  const bulles = useMemo(() => data?.bulles || [], [data?.bulles]);

  // Dénominateurs pour le calcul du rayon : on prend denom_x pour les
  // bulles autorisées et denom (bruité) pour les bulles anonymes.
  const allDenoms = useMemo(
    () => bulles.map((b) => b.denom_x ?? b.denom).filter((d) => d > 0),
    [bulles]
  );

  // Domaines présents dans les bulles affichées — pour ne montrer dans
  // la légende que les couleurs réellement à l'écran. Vide en
  // vue=etablissements (pas de `dom` sur les bulles d'étab).
  const domainesPresents = useMemo(() => {
    if (vue !== 'mentions') return [];
    const set = new Set();
    for (const b of bulles) if (b.dom) set.add(b.dom);
    return ORDRE_DOMAINES.filter((d) => set.has(d));
  }, [bulles, vue]);

  // Quartiles des denoms pour la légende de taille. Si l'échantillon
  // est trop petit ou identique, on retombe sur des valeurs indicatives.
  const taillesLegende = useMemo(() => {
    if (allDenoms.length === 0) return [];
    const sorted = [...allDenoms].sort((a, b) => a - b);
    const p25 = Math.round(quantile(sorted, 0.25) || 0);
    const p50 = Math.round(quantile(sorted, 0.50) || 0);
    const p75 = Math.round(quantile(sorted, 0.75) || 0);
    // Élimine les doublons (cas de datasets très resserrés) en gardant
    // l'ordre.
    const seen = new Set();
    return [p25, p50, p75].filter((v) => v > 0 && !seen.has(v) && seen.add(v));
  }, [allDenoms]);

  // Publier la liste des libellés de mentions affichées (pour la
  // datalist / combobox de recherche). On compare avant de setter pour
  // garantir une no-op si la liste est inchangée — un setState avec
  // un nouveau tableau de même contenu déclencherait quand même un
  // re-render chez les abonnés.
  useEffect(() => {
    if (vue !== 'mentions') {
      setMentionsAffichees((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const libelles = bulles
      .map((b) => b.libelle)
      .filter((l) => typeof l === 'string' && l.length > 0);
    setMentionsAffichees((prev) => {
      if (
        prev.length === libelles.length &&
        prev.every((l, i) => l === libelles[i])
      ) {
        return prev;
      }
      return libelles;
    });
  }, [bulles, vue, setMentionsAffichees]);

  // ---------------- États d'affichage non-data ----------------
  if (loading) {
    return (
      <div className="fr-alert fr-alert--info">
        <p>Chargement du quadrant…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="fr-alert fr-alert--error" role="alert">
        <p>{error}</p>
      </div>
    );
  }
  if (!data) return null;

  // Libellés d'axes — variable seule, sans préciser « Axe horizontal :»
  // (la position du libellé indique déjà l'axe).
  const libelleX = formatLibelle(variableX, dateInserX);
  const libelleY = formatLibelle(variableY, dateInserY);

  return (
    <div className="quadrant-wrapper" ref={wrapperRef}>
      <svg
        ref={setSvgEl}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        role="img"
        aria-label="Quadrant"
      >
        {/* Deux clipPath distincts :
            - quadrant-clip-plot : strict, pour les lignes de référence
              (qui ne doivent pas dépasser).
            - quadrant-clip-bulles : élargi de OVERFLOW px de chaque
              côté, pour permettre aux grosses bulles près du bord de
              déborder légèrement (plus lisible que les couper à ras). */}
        <defs>
          <clipPath id="quadrant-clip-plot">
            <rect
              x={MARGIN.left}
              y={MARGIN.top}
              width={PLOT_WIDTH}
              height={PLOT_HEIGHT}
            />
          </clipPath>
          <clipPath id="quadrant-clip-bulles">
            <rect
              x={MARGIN.left - OVERFLOW}
              y={MARGIN.top  - OVERFLOW}
              width={PLOT_WIDTH  + 2 * OVERFLOW}
              height={PLOT_HEIGHT + 2 * OVERFLOW}
            />
          </clipPath>
        </defs>

        {/* Couche de fond invisible mais capturante : sert de surface
            de drag pour d3-zoom. fill="transparent" ne paint rien donc
            sans pointerEvents="all" un SVG laisserait passer les events
            (default visiblePainted). */}
        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={PLOT_WIDTH}
          height={PLOT_HEIGHT}
          fill="transparent"
          pointerEvents="all"
        />

        <Axes xScale={xScale} yScale={yScale} libelleX={libelleX} libelleY={libelleY} />

        <g clipPath="url(#quadrant-clip-plot)">
          <LignesReference reference={data.reference} xScale={xScale} yScale={yScale} />
        </g>

        <g clipPath="url(#quadrant-clip-bulles)">
          <Bulles
            bulles={bulles}
            vue={vue}
            xScale={xScale}
            yScale={yScale}
            scaleMode={scaleMode}
            allDenoms={allDenoms}
            rechercheMention={rechercheMention}
            onHover={handleHover}
            onLeave={handleLeave}
          />
        </g>
      </svg>

      {/* Boutons de zoom en surimpression */}
      <div className="quadrant-zoom-controls">
        <button type="button" onClick={() => zoomBy(1.5)}   aria-label="Zoom avant">+</button>
        <button type="button" onClick={() => zoomBy(1/1.5)} aria-label="Zoom arrière">−</button>
        <button type="button" onClick={zoomReset}           aria-label="Réinitialiser le zoom">⌂</button>
      </div>

      {/* Tooltip flottant */}
      {hovered && (
        <div
          className="quadrant-tooltip"
          style={{ left: `${hovered.x}px`, top: `${hovered.y}px` }}
        >
          {hovered.bulle.libelle && (
            <div className="libelle">{hovered.bulle.libelle}</div>
          )}
          <div>Axe horizontal : {(hovered.bulle.x * 100).toFixed(1)} %</div>
          <div>Axe vertical&nbsp;&nbsp; : {(hovered.bulle.y * 100).toFixed(1)} %</div>
        </div>
      )}

      {/* Message API « pas de données » (filtres valides mais résultat vide) */}
      {data.info && (
        <div className="fr-alert fr-alert--info fr-mt-2w">
          <p>{data.info}</p>
        </div>
      )}

      {/* Légendes (couleurs des grands domaines + tailles de bulles) */}
      <div className="legende-bloc">
        {domainesPresents.length > 0 && (
          <div className="legende-domaines" aria-label="Couleurs par grand domaine">
            {domainesPresents.map((d) => (
              <span key={d}>
                <span className="puce" style={{ background: COLORS_DOMAINE[d] }} />
                {LIBELLES_DOMAINES[d] || d}
              </span>
            ))}
          </div>
        )}
        {taillesLegende.length > 0 && (
          <div className="legende-tailles" aria-label="Taille des bulles">
            <span className="titre">Taille des bulles :</span>
            {taillesLegende.map((d) => {
              const r = rayonBulle(d, scaleMode, allDenoms);
              const dim = Math.ceil(r * 2 + 2);
              return (
                <span key={d}>
                  <svg width={dim} height={dim}>
                    <circle
                      cx={dim / 2}
                      cy={dim / 2}
                      r={r}
                      fill="#888"
                      fillOpacity={0.4}
                      stroke="#888"
                      strokeWidth={1}
                    />
                  </svg>
                  {d}
                </span>
              );
            })}
            <span style={{ color: '#777' }}>(effectif)</span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatLibelle(variable, dateInser) {
  if (!variable) return '';
  if (!dateInser) return variable;
  return `${variable} (${dateInser} mois)`;
}
