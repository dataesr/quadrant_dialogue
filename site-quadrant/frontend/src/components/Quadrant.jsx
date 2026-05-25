import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { zoom, zoomIdentity } from 'd3-zoom';
import { select } from 'd3-selection';

import { useApp } from '../context/AppContext.jsx';
import { useQuadrant } from '../hooks/useQuadrant.js';
import Axes from './quadrant/Axes.jsx';
import Bulles from './quadrant/Bulles.jsx';
import LignesReference from './quadrant/LignesReference.jsx';
import {
  WIDTH, HEIGHT, MARGIN, PLOT_WIDTH, PLOT_HEIGHT,
  xScaleBase, yScaleBase,
} from './quadrant/geometry.js';
import {
  COLORS_DOMAINE,
  COULEUR_ETAB_PAR_KEY,
  LIBELLES_CATEGORIES_ETAB,
  ORDRE_CATEGORIES_ETAB,
} from '../utils/colors.js';
import { LIBELLE_SOURCE, MENTION_DIFFUSION } from '../utils/constants.js';

// Composant principal du quadrant. Orchestrateur :
//   1. fetch des bulles via useQuadrant
//   2. publication des libellés affichés dans AppContext (pour la barre
//      de recherche) — mentions en vue=mentions, libellés d'étabs
//      accessibles en vue=etablissements
//   3. publication de nbBullesAccessibles pour conditionner la
//      visibilité du toggle Graphique/Tableau et de la recherche
//   4. gestion du zoom (d3-zoom : wheel/drag/double-clic, boutons UI)
//   5. gestion du tooltip de survol (overlay HTML)
//   6. rendu du SVG (axes / lignes ref / bulles) avec scales transformées
//   7. rendu de la légende des couleurs (pas de légende de taille — la
//      taille des bulles reflète une moyenne d'effectifs, non
//      interprétable en valeur absolue)

const LIBELLES_DOMAINES = {
  DEG:    'Droit, économie, gestion (DEG)',
  LLA:    'Lettres, langues, arts (LLA)',
  SHS:    'Sciences humaines et sociales (SHS)',
  STS:    'Sciences, technologies, santé (STS)',
  INTERD: 'Pluridisciplinaire (INTERD)',
};

const ORDRE_DOMAINES = ['DEG', 'LLA', 'SHS', 'STS', 'INTERD'];

// Z-index sémantique des bulles en vue=etablissements (du fond vers
// le premier plan). La bulle de l'établissement de contexte
// (couleur_key=selectionne) est TOUJOURS rendue au-dessus pour ne
// jamais être masquée par un cluster. Les bulles « autres » (gris
// neutre, gros volume) servent de toile de fond.
const ORDRE_RENDU_ETAB = {
  autres:                      0,
  meme_typologie_autre_region: 1,
  meme_region_autre_typologie: 2,
  meme_region_et_typologie:    3,
  selectionne:                 4,
};

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
    nbBullesAccessibles,
    setNbBullesAccessibles,
    affichage,
    setAffichage,
    setDetailsCible,
  } = useApp();

  // Clic sur une bulle accessible → ouvre le panneau de détails.
  // En vue=etablissements avec filtre mention, on transmet la mention
  // pour que /quadrant/details renvoie les données de cette mention pour
  // cet établissement précis plutôt que l'agrégat.
  const handleSelectBulle = useCallback((b) => {
    setDetailsCible({
      type: vue === 'mentions' ? 'mention' : 'etablissement',
      targetId: b.id,
      ...(vue === 'etablissements' && mention ? { mention } : {}),
    });
  }, [setDetailsCible, vue, mention]);

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
  //
  // En vue=etablissements, on trie en plus par z-index sémantique (cf.
  // ORDRE_RENDU_ETAB) : le SVG dessine les éléments dans l'ordre de
  // déclaration → le dernier élément est rendu AU-DESSUS. On veut donc
  // « autres » en tête de tableau (= en fond visuel) et « selectionne »
  // en queue (= au premier plan, jamais masqué par un cluster).
  // En vue=mentions, pas de tri (ordre API préservé).
  const bulles = useMemo(() => {
    const list = data?.bulles || [];
    if (vue !== 'etablissements') return list;
    return [...list].sort((a, b) => {
      const za = ORDRE_RENDU_ETAB[a.couleur_key] ?? 0;
      const zb = ORDRE_RENDU_ETAB[b.couleur_key] ?? 0;
      return za - zb; // z faibles en premier = au fond
    });
  }, [data?.bulles, vue]);

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

  // Pendant vue=etablissements : catégories d'établissement effectivement
  // présentes (au moins une bulle). Sert à filtrer la légende — un user
  // qui n'a pas de pair « même région et même typologie » dans la
  // requête n'a pas besoin de voir cette puce.
  const categoriesEtabPresentes = useMemo(() => {
    if (vue !== 'etablissements') return [];
    const set = new Set();
    for (const b of bulles) if (b.couleur_key) set.add(b.couleur_key);
    return ORDRE_CATEGORIES_ETAB.filter((c) => set.has(c));
  }, [bulles, vue]);

  // Publier la liste des libellés affichés (pour la combobox de
  // recherche) :
  //   - vue=mentions       : toutes les bulles (chaque bulle est une
  //                          mention détaillable par construction du
  //                          filtre SQL côté API)
  //   - vue=etablissements : uniquement les bulles avec
  //                          details_accessibles=true (les bulles
  //                          anonymes ont libelle="" et n'ont aucun
  //                          intérêt dans la recherche).
  //
  // On compare avant de setter pour garantir une no-op si la liste est
  // inchangée — un setState avec un nouveau tableau de même contenu
  // déclencherait quand même un re-render chez les abonnés.
  useEffect(() => {
    const source = vue === 'mentions'
      ? bulles
      : bulles.filter((b) => b.details_accessibles);
    const libelles = source
      .map((b) => b.libelle)
      .filter((l) => typeof l === 'string' && l.length > 0);
    setMentionsAffichees((prev) => (
      prev.length === libelles.length && prev.every((l, i) => l === libelles[i])
        ? prev
        : libelles
    ));
  }, [bulles, vue, setMentionsAffichees]);

  // Publier le nombre de bulles accessibles (= avec details_accessibles).
  // Sert à conditionner la visibilité du toggle Graphique/Tableau et
  // de la barre de recherche en vue=etablissements (un user étab ne voit
  // qu'une seule bulle accessible — pas la peine d'afficher ces UI).
  useEffect(() => {
    const nbAccess = bulles.filter((b) => b.details_accessibles).length;
    setNbBullesAccessibles((prev) => (prev === nbAccess ? prev : nbAccess));
  }, [bulles, setNbBullesAccessibles]);

  // Garde-fou cohérence affichage/contexte : en vue Positionnement, si
  // l'utilisateur est au niveau étab (1 seule bulle accessible),
  // AffichageSelector est masqué — mais si `affichage` est resté à
  // 'tableau' suite à un passage par la vue Mentions, le tableau
  // s'afficherait quand même avec une seule ligne, sans toggle pour
  // en sortir. On force le retour à 'graphique' dans ce cas.
  useEffect(() => {
    if (vue === 'etablissements' && nbBullesAccessibles < 2 && affichage === 'tableau') {
      setAffichage('graphique');
    }
  }, [vue, nbBullesAccessibles, affichage, setAffichage]);

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
            onSelect={handleSelectBulle}
          />
        </g>
      </svg>

      {/* Boutons de zoom en surimpression */}
      <div className="quadrant-zoom-controls">
        <button type="button" onClick={() => zoomBy(1.5)}   aria-label="Zoom avant">+</button>
        <button type="button" onClick={() => zoomBy(1/1.5)} aria-label="Zoom arrière">−</button>
        <button type="button" onClick={zoomReset}           aria-label="Réinitialiser le zoom">⌂</button>
      </div>

      {/* Tooltip flottant.
          Vue Mentions : libellé de la mention (gras) + valeurs X/Y.
          Vue Positionnement : libellé de l'étab si disponible, +
            ligne discrète indiquant la catégorie (« Établissement de
            la même région… »). Pour les bulles anonymes (libelle
            vide), seule la catégorie subsiste — c'est ce qui rend
            le tooltip informatif sans révéler l'identité. */}
      {hovered && (
        <div
          className="quadrant-tooltip"
          style={{ left: `${hovered.x}px`, top: `${hovered.y}px` }}
        >
          {hovered.bulle.libelle && (
            <div className="libelle">{hovered.bulle.libelle}</div>
          )}
          {vue === 'etablissements' && LIBELLES_CATEGORIES_ETAB[hovered.bulle.couleur_key] && (
            <div className="categorie">
              {LIBELLES_CATEGORIES_ETAB[hovered.bulle.couleur_key]}
            </div>
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

      {/* Légende des couleurs.
          Vue Mentions : par grand domaine (5 catégories).
          Vue Positionnement : par catégorie d'étab relative au contexte
            (5 catégories : sélectionné / même région+typo / même
            région / même typo / autres).
          Filtrée dans les deux cas aux entrées effectivement présentes.
          Pas de légende de taille : la taille d'une bulle est dérivée
          d'une moyenne d'entrants/sortants sur plusieurs cohortes, non
          interprétable comme une grandeur métier en valeur absolue. */}
      {domainesPresents.length > 0 && (
        <div className="legende-bloc">
          <div className="legende-domaines" aria-label="Couleurs par grand domaine">
            {domainesPresents.map((d) => (
              <span key={d}>
                <span className="puce" style={{ background: COLORS_DOMAINE[d] }} />
                {LIBELLES_DOMAINES[d] || d}
              </span>
            ))}
          </div>
        </div>
      )}
      {categoriesEtabPresentes.length > 0 && (
        <div className="legende-bloc">
          <div className="legende-domaines" aria-label="Catégories d'établissements">
            {categoriesEtabPresentes.map((c) => (
              <span key={c}>
                <span className="puce" style={{ background: COULEUR_ETAB_PAR_KEY[c] }} />
                {LIBELLES_CATEGORIES_ETAB[c]}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="source-attribution">
        {LIBELLE_SOURCE} · {MENTION_DIFFUSION}
      </p>
    </div>
  );
}

function formatLibelle(variable, dateInser) {
  if (!variable) return '';
  if (!dateInser) return variable;
  return `${variable} (${dateInser} mois)`;
}
