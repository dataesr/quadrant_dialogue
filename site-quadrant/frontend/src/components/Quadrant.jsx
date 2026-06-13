import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAutoPlacement } from '../utils/useAutoPlacement.js';
import { zoom, zoomIdentity } from 'd3-zoom';
import { select } from 'd3-selection';

import { useApp } from '../context/AppContext.jsx';
import { useQuadrant } from '../hooks/useQuadrant.js';
import Axes from './quadrant/Axes.jsx';
import Bulles from './quadrant/Bulles.jsx';
import Histogrammes from './quadrant/Histogrammes.jsx';
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
import { formatLibelle, formatLibelleAxe } from '../utils/libelleAxe.js';
import { descripteursReferences, cleAxe } from '../utils/referenceAxes.js';
import { formatDelta } from '../utils/formatDelta.js';
import { trackEvent } from '../utils/matomo.js';
import MessageErreur from './MessageErreur.jsx';
import Skeleton from './Skeleton.jsx';
import LoaderQuadrant from './LoaderQuadrant.jsx';
import { useDelayedLoading } from '../hooks/useDelayedLoading.js';

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

// Ordre de rendu de la légende des formes (codé sur la sémantique :
// du plus fiable au moins fiable, gauche → droite). Les libellés
// reprennent la convention API (cf. CLAUDE.md §11) : forme = fonction
// du couple (denom_x, denom_y) vs. le seuil 20.
const ORDRE_FORMES = ['rond', 'triangle_gauche', 'triangle_bas', 'croix'];
const LIBELLES_FORMES = {
  rond:             'Effectifs ≥ 20',
  triangle_gauche:  'Effectif fragile sur l’axe horizontal',
  triangle_bas:     'Effectif fragile sur l’axe vertical',
  croix:            'Effectifs fragiles sur les deux axes',
};

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

// Prop `forExport` (default false) : quand true, le Quadrant alimente
// sa requête /quadrant avec ?for_export=1. Utilisé par l'instance
// off-screen montée en parallèle dans App.jsx, qui sert de source au
// capture html-to-image pour les exports PNG (respecte le seuil de
// diffusion configuré côté API). L'instance visible reste en
// forExport=false — l'écran continue à afficher les bulles fragiles
// (5-19) avec leurs formes spéciales.
export default function Quadrant({ forExport = false } = {}) {
  const {
    cursus, vue, millesime,
    variableX, variableY, dateInserX, dateInserY,
    etabContexte, etabInfo,
    domaine, discipline, secteur, mention, typeMaster,
    representativite,
    memeTypologie,
    mesureAxes,
    perimetresAxes,
    referenceAxesPositionnement,
    scaleMode,
    rechercheMention,
    setMentionsAffichees,
    nbBullesAccessibles,
    setNbBullesAccessibles,
    affichage,
    setAffichage,
    setDetailsCible,
    referentiels,
    afficherDistributions,
  } = useApp();

  // Populations de référence à incruster dans les titres d'axes du SVG
  // (Phase 10). Lecture du référentiel `populations` chargé via
  // /referentiel/variables?millesime=... — déjà fetché pour le grisage
  // des indicateurs. Si pas encore chargé OU indicateur sans population
  // définie : fallback gracieux, on omet le suffixe.
  const populationsMap = referentiels?.populations?.data;
  const populationX = (populationsMap && variableX)
    ? populationsMap[variableX]?.[dateInserX ?? ''] || null
    : null;
  const populationY = (populationsMap && variableY)
    ? populationsMap[variableY]?.[dateInserY ?? ''] || null
    : null;

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
    trackEvent('Détails', 'clic_bulle', b.libelle, {
      etab: etabInfo?.libelle,
      vue,
      cursus,
      millesime,
    });
  }, [setDetailsCible, vue, mention, etabInfo, cursus, millesime]);

  const { loading, data, error } = useQuadrant({
    cursus, vue, millesime,
    variableX, variableY, dateInserX, dateInserY,
    etabContexte,
    domaine, discipline, secteur, mention, typeMaster,
    representativite,
    memeTypologie,
    // Vue Positionnement : le sélecteur Médiane/Moyenne pilote data.reference
    // via le paramètre `agregation` de l'API. Vue Mentions : data.axes est
    // consulté via referenceAxes côté Quadrant — on laisse 'mediane' (sans
    // effet sur l'affichage).
    agregation: vue === 'etablissements' ? referenceAxesPositionnement : 'mediane',
    forExport,
  });

  // ---------------- Tooltip ----------------
  // hovered : { bulle, x, y } en coordonnées du wrapper (pixels écran
  // relatifs au .quadrant-wrapper, pas au SVG).
  const [hovered, setHovered] = useState(null);
  // hoveredHisto : tooltip de répartition au survol d'une barre
  // d'histogramme. Même format de coordonnées que `hovered`. State
  // séparé : un tooltip de bulle et un tooltip d'histogramme ne peuvent
  // pas être actifs simultanément en pratique (les barres sont dans
  // les marges, les bulles dans le plot), mais on garde la séparation
  // pour ne pas mélanger les sémantiques.
  const [hoveredHisto, setHoveredHisto] = useState(null);
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

  const handleHoverHisto = useCallback((info, event) => {
    const wrapperRect = wrapperRef.current?.getBoundingClientRect();
    if (!wrapperRect) return;
    setHoveredHisto({
      info,
      x: event.clientX - wrapperRect.left + 12,
      y: event.clientY - wrapperRect.top  + 12,
    });
  }, []);
  const handleLeaveHisto = useCallback(() => setHoveredHisto(null), []);

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

  // Reset automatique du zoom au changement de tout paramètre qui
  // déclenche un rechargement des bulles. Sans ça, un zoom appliqué
  // pour explorer un sous-ensemble de bulles reste actif après un
  // changement de cursus / vue / filtre, et peut centrer la vue sur
  // une zone qui n'a plus aucune bulle visible.
  // Le clic sur une bulle ne change aucune de ces dépendances → le
  // zoom est conservé pendant l'exploration interactive.
  useEffect(() => {
    zoomReset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    vue, cursus, millesime,
    variableX, variableY, dateInserX, dateInserY,
    etabContexte,
    domaine, discipline, secteur, mention, typeMaster,
    representativite,
    memeTypologie,
    mesureAxes,
    perimetresAxes,
    referenceAxesPositionnement,
  ]);

  // Scales effectives : original × transform d3-zoom. Quand transform =
  // identité, on retombe sur xScaleBase / yScaleBase (domaine 0..100).
  const xScale = transform.rescaleX(xScaleBase);
  const yScale = transform.rescaleY(yScaleBase);

  // Zoom actif = transform ≠ identité. Sert à masquer les histogrammes
  // pendant le zoom : ceux-ci sont calculés sur l'échelle 0..100 et
  // rendus dans les marges, donc ils restent en place pendant que les
  // bulles bougent — incohérence visuelle. Plus simple de les cacher.
  const zoomActif = transform.k !== 1 || transform.x !== 0 || transform.y !== 0;

  // ---------------- Données dérivées ----------------
  // Memoize : sans ça, `bulles` change de référence à chaque render et
  // tous les useMemo/useEffect en aval s'invalident inutilement
  // → boucle infinie via setMentionsAffichees.
  //
  // Le SVG peint dans l'ordre de déclaration → dernier élément du
  // tableau = AU-DESSUS visuellement (et capteur d'événements en
  // priorité). On trie donc selon une logique propre à chaque vue :
  //   - vue=mentions       : par denom décroissant. Les grosses
  //                          bulles arrivent en tête (= au fond),
  //                          les petites en queue (= au-dessus).
  //                          Sans ça, une petite mention nichée
  //                          derrière une grosse devient impossible
  //                          à survoler ou cliquer. Le tri ne
  //                          modifie pas les coordonnées des bulles
  //                          ni le calcul des médianes (ces dernières
  //                          viennent de l'API, indépendantes du
  //                          rendu).
  //   - vue=etablissements : z-index sémantique (cf. ORDRE_RENDU_ETAB) —
  //                          « autres » en fond, « selectionne » au
  //                          premier plan pour garantir la bulle de
  //                          contexte toujours visible.
  const bulles = useMemo(() => {
    // Filtre des bulles non plottables en 2D : une bulle avec x=null
    // ou y=null (cas du post-traitement ?for_export=1 quand un axe
    // est sous seuil_diffusable) ne peut pas être positionnée sur le
    // plan SVG. JavaScript coerce null en 0 dans `null * 100`, ce qui
    // ferait apparaître ces bulles au coin (0%, 0%) du quadrant —
    // c'est précisément le bug de la PNG d'export observé (triangles
    // collés à 0% pour des bulles fragiles 5-19). On les retire ici
    // du flux de rendu SVG. Le tableau et l'XLSX, qui lisent
    // data.bulles directement, gardent la sémantique « Non
    // diffusable » par axe — c'est ce qu'on veut côté tableau.
    const list = (data?.bulles || []).filter(
      (b) => typeof b.x === 'number' && typeof b.y === 'number'
    );
    if (vue === 'mentions') {
      return [...list].sort((a, b) => {
        const da = a.denom_x ?? a.denom ?? 0;
        const db = b.denom_x ?? b.denom ?? 0;
        return db - da; // grosses d'abord (fond), petites ensuite (1er plan)
      });
    }
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

  // Formes de bulles effectivement présentes (rond, triangle_bas,
  // triangle_gauche, croix). Sert à conditionner l'affichage de la
  // légende des formes : on ne la rend que si au moins une bulle
  // non-ronde existe (= au moins un effectif fragile 5-19). Quand
  // toutes les bulles sont rondes, la légende n'apporte rien.
  const formesPresentes = useMemo(() => {
    const set = new Set();
    for (const b of bulles) if (b.forme) set.add(b.forme);
    return ORDRE_FORMES.filter((f) => set.has(f));
  }, [bulles]);
  const aDesFormesFragiles = formesPresentes.some((f) => f !== 'rond');

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
    // Guard : pas de publication tant que le fetch n'a pas livré ses
    // données. Sinon un transient bulles=[] pendant un fetch en cours
    // écraserait une valeur correcte précédente. Critique pour la
    // safety useEffect plus bas (qui repose sur nbBullesAccessibles).
    if (!data) return;
    // L'instance off-screen montée pour l'export (forExport=true) ne
    // doit PAS publier dans AppContext — sinon son fetch filtré
    // (seuil_diffusable=20) écraserait la liste utilisée par la
    // combobox de recherche et le safety toggle Graphique/Tableau.
    if (forExport) return;
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
  }, [data, bulles, vue, setMentionsAffichees, forExport]);

  // Publier le nombre de bulles accessibles (= avec details_accessibles).
  // Sert à conditionner la visibilité du toggle Graphique/Tableau et
  // de la barre de recherche en vue=etablissements (un user étab ne voit
  // qu'une seule bulle accessible — pas la peine d'afficher ces UI).
  useEffect(() => {
    // Idem : guard data. Sans ça, un Quadrant fraîchement remonté ou
    // un changement de filtres en cours de fetch publierait
    // transitoirement 0 → la safety useEffect plus bas bascule
    // affichage='graphique' à tort (bug Positionnement reporté en
    // session précédente).
    if (!data) return;
    // L'instance off-screen pour l'export (forExport=true) ne publie
    // pas son décompte — celui-ci pourrait être plus bas que le
    // décompte visible (seuil_diffusable=20 vs seuil affichage=5) et
    // déclencher à tort la safety useEffect plus bas.
    if (forExport) return;
    const nbAccess = bulles.filter((b) => b.details_accessibles).length;
    setNbBullesAccessibles((prev) => (prev === nbAccess ? prev : nbAccess));
  }, [data, bulles, setNbBullesAccessibles, forExport]);

  // Garde-fou cohérence affichage/contexte : en vue Positionnement, si
  // l'utilisateur est au niveau étab (1 seule bulle accessible),
  // AffichageSelector est masqué — mais si `affichage` est resté à
  // 'tableau' suite à un passage par la vue Mentions, le tableau
  // s'afficherait quand même avec une seule ligne, sans toggle pour
  // en sortir. On force le retour à 'graphique' dans ce cas.
  // Ne tourne pas sur l'instance off-screen d'export.
  useEffect(() => {
    if (forExport) return;
    if (vue === 'etablissements' && nbBullesAccessibles < 2 && affichage === 'tableau') {
      setAffichage('graphique');
    }
  }, [vue, nbBullesAccessibles, affichage, setAffichage, forExport]);

  // ---------------- États d'affichage non-data ----------------
  // Anti-flash : pendant les 350 premiers ms d'un fetch, on garde
  // l'ancien rendu (ou rien si premier render). Au-delà, on bascule
  // sur LoaderQuadrant. Évite le clignotement loader → données sur
  // les requêtes rapides (changement de filtre <350 ms).
  // L'instance off-screen forExport ne sert qu'à la capture html-to-image
  // → on lui sert le Skeleton (forme stable) sans délai, sinon le PNG
  // capturé pendant un fetch contiendrait le loader.
  const showLoader = useDelayedLoading(loading);
  if (loading) {
    if (forExport) {
      return (
        <div
          className="quadrant-wrapper quadrant-wrapper--skeleton"
          aria-busy="true"
          aria-label="Chargement du quadrant"
        >
          <Skeleton height="480px" radius="4px" />
        </div>
      );
    }
    if (!showLoader) {
      return (
        <div
          className="quadrant-wrapper quadrant-wrapper--skeleton"
          aria-busy="true"
          aria-label="Chargement du quadrant"
        />
      );
    }
    return (
      <div
        className="quadrant-wrapper quadrant-wrapper--skeleton"
        aria-busy="true"
        aria-label="Chargement du quadrant"
      >
        <LoaderQuadrant />
      </div>
    );
  }
  if (error) {
    return (
      <MessageErreur error={error} />
    );
  }
  if (!data) return null;

  // Libellés d'axes — variable seule, sans préciser « Axe horizontal :»
  // (la position du libellé indique déjà l'axe). On y incruste la
  // population de référence en suffixe entre parenthèses (Phase 10) :
  //   « Taux de réussite en 2 ou 3 ans (entrants 2021-22) »
  //   « Taux sortants en emploi salarié en France à 18 mois (sortants 2023) »
  // — la forme « à N mois » remplace ici le suffixe « (N mois) » pour
  // éviter de doubler les parenthèses avec celles du libellé population.
  const libelleX = formatLibelleAxe(variableX, dateInserX, populationX);
  const libelleY = formatLibelleAxe(variableY, dateInserY, populationY);

  // Masquage du SVG quand aucune bulle n'est représentée — un quadrant
  // vide avec ses axes pointillés n'apporte rien. On garde l'instance
  // off-screen (forExport=true) rendue inconditionnellement pour que
  // html-to-image trouve un DOM à capturer même quand l'utilisateur
  // déclenche un export sur un état temporairement vide ; les boutons
  // d'export sont par ailleurs désactivés via `aDesDonnees` côté
  // BoutonExport.
  const aucuneBulle = bulles.length === 0;
  if (aucuneBulle && !forExport) {
    return (
      <div className="quadrant-wrapper quadrant-wrapper--vide">
        <div className="fr-alert fr-alert--info">
          <p>{data.info || 'Aucune donnée pour cette combinaison de filtres.'}</p>
        </div>
      </div>
    );
  }

  // Références à tracer (Phase 15.1) : tableau de 0, 1 ou 2 références.
  //   - vue Positionnement : une seule référence (data.reference
  //     historique, pilotée par `agregation` côté API). Périmètre
  //     'positionnement' → style neutre.
  //   - vue Mentions : une référence par périmètre actif (étab /
  //     national), lue dans data.axes selon la mesure choisie
  //     (médiane/moyenne). 0 périmètre actif → aucune ligne. Fallback
  //     sur data.reference si data.axes est absent (backend ancien).
  const referencesTracees = (() => {
    const descripteurs = descripteursReferences(vue, {
      mesureAxes, perimetresAxes, referenceAxesPositionnement,
    });
    // Positionnement : coordonnées depuis data.reference (pilotée par
    // le paramètre `agregation` côté API).
    if (vue !== 'mentions') {
      return data.reference
        ? descripteurs.map((d) => ({ ...d, x: data.reference.x, y: data.reference.y }))
        : [];
    }
    // Mentions : coordonnées depuis data.axes via la clé de chaque réf.
    if (!data.axes) {
      return data.reference
        ? [{ perimetre: 'etab', mesure: mesureAxes, x: data.reference.x, y: data.reference.y }]
        : [];
    }
    const refs = [];
    for (const d of descripteurs) {
      const key = cleAxe(d);
      const x = data.axes[`${key}_x`];
      const y = data.axes[`${key}_y`];
      if (x == null || y == null) continue;
      refs.push({ ...d, x, y });
    }
    return refs;
  })();

  return (
    <div
      className={'quadrant-wrapper' + (forExport ? ' quadrant-wrapper--export' : '')}
      ref={wrapperRef}
    >
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
          <LignesReference references={referencesTracees} xScale={xScale} yScale={yScale} />
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

        {/* Histogrammes de distribution (toggle « Afficher les
            distributions »). Rendus hors clip-bulles, dans les marges
            haut/droit du SVG. Calculés sur la liste `bulles` déjà
            filtrée (zone visible + seuil applicable en export). Masqués
            tant qu'un zoom est actif (les barres sont en coords du plot
            non-zoomé et créeraient une incohérence avec les bulles
            repositionnées). */}
        {afficherDistributions && !zoomActif && (
          <Histogrammes
            bulles={bulles}
            onHoverBar={handleHoverHisto}
            onLeaveBar={handleLeaveHisto}
          />
        )}
      </svg>

      {/* Boutons de zoom en surimpression */}
      <div className="quadrant-zoom-controls">
        <button type="button" onClick={() => zoomBy(1.5)}   aria-label="Zoom avant">+</button>
        <button type="button" onClick={() => zoomBy(1/1.5)} aria-label="Zoom arrière">−</button>
        <button type="button" onClick={zoomReset}           aria-label="Réinitialiser le zoom">⌂</button>
      </div>

      {/* Compteur de mouvements : déplacé dans la modale d'animation
          (Phase 15.4) — sa lecture prend tout son sens quand on voit
          la transition se faire. Plus affiché sous le quadrant
          principal statique. */}

      {/* Tooltip flottant.
          Vue Mentions : libellé de la mention (gras) + valeurs X/Y.
          Vue Positionnement : libellé de l'étab si disponible, +
            ligne discrète indiquant la catégorie (« Établissement de
            la même région… »). Pour les bulles anonymes (libelle
            vide), seule la catégorie subsiste — c'est ce qui rend
            le tooltip informatif sans révéler l'identité. */}
      {hovered && (
        <QuadrantTooltip hovered={hovered} vue={vue} />
      )}

      {/* Tooltip de répartition au survol d'une barre d'histogramme.
          Format : « 70 % - 80 % : 5 / 22 (23 %) ». Réutilise le même
          conteneur visuel (.quadrant-tooltip) que le tooltip de bulle. */}
      {hoveredHisto && (
        <HistogrammeTooltip hovered={hoveredHisto} />
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

      {/* Légende des formes : pose le contrat sur la fragilité des
          effectifs. Affichée uniquement quand au moins une bulle
          non-ronde est présente (forme = signal d'effectif 5-19). Les
          icônes SVG inline reproduisent fidèlement le rendu des
          bulles — mêmes polygones que dans Bulles.jsx, à dimension
          fixe (rayon 6 px) et en gris neutre pour rester sémantiques
          et indépendantes des palettes de couleur. */}
      {aDesFormesFragiles && (
        <div className="legende-bloc">
          <div
            className="legende-formes"
            aria-label="Formes des bulles selon la fragilité des effectifs"
          >
            <span className="legende-formes-titre">
              Effectifs de référence&nbsp;:
            </span>
            {formesPresentes.map((f) => (
              <span key={f} className="legende-forme-entree">
                <FormeIcone forme={f} />
                {LIBELLES_FORMES[f]}
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

// formatLibelle / formatLibelleAxe : importés de utils/libelleAxe.js
// (centralisés pour assurer la cohérence avec QuadrantAnime.jsx).

// Tooltip de survol des bulles, extrait en sous-composant pour ancrer
// proprement un useLayoutEffect d'ajustement post-mesure (cf. ci-dessous).
// Mesurer après rendu via getBoundingClientRect, puis translater
// horizontalement pour rester dans la fenêtre — sans ça, un survol près
// du bord droit de l'iframe coupe le tooltip (cas signalé Phase 9).
// Le décalage est appliqué en transform plutôt qu'en ajustant `left`
// pour ne pas se mettre en boucle de mesure (transform sort du flux,
// le layout du parent reste stable).
function QuadrantTooltip({ hovered, vue }) {
  const ref = useAutoPlacement([hovered]);

  return (
    <div
      ref={ref}
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
      <div>
        Axe horizontal : {(hovered.bulle.x * 100).toFixed(1)} %
        {hovered.bulle.x_prev != null && (
          <span className="delta">{' '}{formatDelta(hovered.bulle.x, hovered.bulle.x_prev)}</span>
        )}
      </div>
      <div>
        Axe vertical&nbsp;&nbsp; : {(hovered.bulle.y * 100).toFixed(1)} %
        {hovered.bulle.y_prev != null && (
          <span className="delta">{' '}{formatDelta(hovered.bulle.y, hovered.bulle.y_prev)}</span>
        )}
      </div>
    </div>
  );
}

// Tooltip de répartition au survol d'une barre d'histogramme. Format
// « 70 % - 80 % : 5 / 22 (23 %) » — tranche × compte × total × pct.
// useAutoPlacement gère le débordement à droite/bas du wrapper.
function HistogrammeTooltip({ hovered }) {
  const ref = useAutoPlacement([hovered]);
  const { borneInf, borneSup, compte, total } = hovered.info;
  const pct = total > 0 ? Math.round((compte / total) * 100) : 0;
  return (
    <div
      ref={ref}
      className="quadrant-tooltip"
      style={{ left: `${hovered.x}px`, top: `${hovered.y}px` }}
    >
      {borneInf}&nbsp;% – {borneSup}&nbsp;% : {compte}&nbsp;/ {total} ({pct}&nbsp;%)
    </div>
  );
}

// Icône SVG inline reproduisant la forme d'une bulle (rond, triangle
// bas/gauche, croix) à dimension fixe. Conserve la même géométrie que
// Bulles.jsx (cf. trianglePoints) — un coup d'œil ici doit
// littéralement faire correspondre l'icône à une bulle du quadrant.
function FormeIcone({ forme }) {
  const W = 18;
  const r = 6;
  const cx = W / 2;
  const cy = W / 2;
  const stroke = '#444';
  const strokeWidth = 1.5;
  const fill = 'none';

  if (forme === 'rond') {
    return (
      <svg
        className="forme-icone" width={W} height={W} viewBox={`0 0 ${W} ${W}`}
        aria-hidden="true"
      >
        <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
    );
  }
  if (forme === 'triangle_bas') {
    const points = [
      [cx,         cy + r],
      [cx - r,     cy - r * 0.7],
      [cx + r,     cy - r * 0.7],
    ].map((p) => p.join(',')).join(' ');
    return (
      <svg
        className="forme-icone" width={W} height={W} viewBox={`0 0 ${W} ${W}`}
        aria-hidden="true"
      >
        <polygon points={points} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
    );
  }
  if (forme === 'triangle_gauche') {
    const points = [
      [cx - r,         cy],
      [cx + r * 0.7,   cy - r],
      [cx + r * 0.7,   cy + r],
    ].map((p) => p.join(',')).join(' ');
    return (
      <svg
        className="forme-icone" width={W} height={W} viewBox={`0 0 ${W} ${W}`}
        aria-hidden="true"
      >
        <polygon points={points} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
    );
  }
  if (forme === 'croix') {
    return (
      <svg
        className="forme-icone" width={W} height={W} viewBox={`0 0 ${W} ${W}`}
        aria-hidden="true"
      >
        <line x1={cx - r} y1={cy - r} x2={cx + r} y2={cy + r} stroke={stroke} strokeWidth={strokeWidth + 0.5} />
        <line x1={cx - r} y1={cy + r} x2={cx + r} y2={cy - r} stroke={stroke} strokeWidth={strokeWidth + 0.5} />
      </svg>
    );
  }
  return null;
}
