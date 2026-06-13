import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { getQuadrantSerieTemporelle } from '../services/api.js';
import { messageErreur } from '../utils/errors.js';
import { trackEvent } from '../utils/matomo.js';
import { LIBELLE_SOURCE, MENTION_DIFFUSION } from '../utils/constants.js';
import { formatLibelleAxe } from '../utils/libelleAxe.js';
import QuadrantAnime, { bulleCxCy } from './QuadrantAnime.jsx';
import LoaderBarre from './LoaderBarre.jsx';
import SliderDuree from './sous-populations/SliderDuree.jsx';
import Combobox from './selectors/Combobox.jsx';
import ReferenceAxesSelector from './ReferenceAxesSelector.jsx';
import { descripteursReferences } from '../utils/referenceAxes.js';
import { VITESSES, VITESSE_DEFAUT } from '../utils/animationSpeeds.js';
import { useDelayedLoading } from '../hooks/useDelayedLoading.js';

// Modale d'animation temporelle (Phase 11b — MVP + v2).
//
// Fetch /api/quadrant/serie-temporelle puis affiche les bulles
// glissant entre millésimes via QuadrantAnime, avec contrôles de
// lecture, sélecteur de référence des axes, et trois enrichissements
// v2 :
//
// 1. Trace résiduelle (continue) : pour chaque bulle, polyline reliant
//    TOUTES ses positions depuis le premier millésime jusqu'au
//    millésime courant — trajectoire complète à la Gapminder.
//    Dérivée directement des données (useMemo) plutôt qu'accumulée
//    dans un state : la cohérence est garantie quel que soit le sens
//    du parcours (lecture séquentielle, slider arrière, sauts). Active
//    dans les deux vues — la vue Positionnement plafonne à ~80 bulles
//    × ~6 millésimes = ~80 polylines de 5 segments max, coût trivial.
//
// 2. Mode « Comparer avec millésime précédent » : flow async qui
//    saute instantanément à M-1, attend 200 ms, lance une transition
//    longue (1500 ms) vers M, et dessine une trace marquée
//    (stroke 2, opacity 0.6) qui reste 5 s puis fade-out 1 s.
//    Pendant ce flow le bouton est verrouillé pour éviter le double-
//    clic.
//
// 3. Sélecteur 3 vitesses : Lente (3 s/millésime), Normale (2 s),
//    Rapide (1 s) — recalibrage Phase 15.3, cf. utils/animationSpeeds.js.
//    La durée de transition CSS des bulles s'adapte en parallèle pour
//    rester proportionnelle à l'intervalle (transition = ~80 % du tick)
//    — évite que les bulles n'aient pas le temps de finir leur
//    mouvement avant le tick suivant.

// 4. Suivi d'une mention (Phase 15.3, vue Mentions) : un sélecteur
//    « Suivre une mention » (liste TOUTES les mentions de la série, tous
//    millésimes confondus) pilote le même état `rechercheMention` que la
//    barre de recherche du quadrant principal. La bulle correspondante
//    reçoit un halo coloré dans QuadrantAnime, qui la suit au fil des
//    millésimes (et disparaît aux millésimes où elle n'est pas affichée).

// VITESSES + VITESSE_DEFAUT : importés de utils/animationSpeeds.js
// (source unique partagée avec la modale d'analyse fine).

// Mode « Comparer » : durée de la transition one-shot M-1 → M (plus
// lent que les transitions normales pour bien voir le mouvement) et
// durées de la phase « trace visible » et « fade-out » qui suivent.
const COMPARER_TRANSITION_MS = 1500;
const COMPARER_VISIBLE_MS    = 5000;
const COMPARER_FADE_OUT_MS   = 1000;
const COMPARER_FLASH_PAUSE_MS = 200; // pause à M-1 avant de relancer

export default function ModaleAnimation({ open, onClose }) {
  const {
    etabInfo, cursus, vue, millesime,
    variableX, variableY, dateInserX, dateInserY,
    etabContexte, domaine, discipline, secteur, mention, typeMaster,
    representativite, memeTypologie,
    mesureAxes, perimetresAxes, referenceAxesPositionnement,
    rechercheMention, setRechercheMention,
  } = useApp();

  const fermerRef = useRef(null);

  // -------------------- État fetch --------------------
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [data, setData]       = useState(null);

  // -------------------- État animation --------------------
  const [millesimeCourant, setMillesimeCourant] = useState(null);
  const [enLecture, setEnLecture] = useState(false);
  const intervalRef = useRef(null);
  const millesimePrecedentRef = useRef(null);

  // -------------------- Vitesse (v2, recalibrée Phase 15.3) --------------------
  const [vitesse, setVitesse] = useState(VITESSE_DEFAUT);
  // Durée de transition appliquée par défaut ; un override (mode
  // Comparer) peut le forcer temporairement.
  const [dureeOverride, setDureeOverride] = useState(null);
  const tickMs       = VITESSES[vitesse].tickMs;
  const transitionMs = dureeOverride ?? VITESSES[vitesse].transitionMs;

  // -------------------- Trace résiduelle (v2) --------------------
  // La Map<id, Array<{cx, cy}>> est calculée plus bas via useMemo —
  // pas de state intermédiaire, pas d'accumulation par effet de bord.
  // Active dans les deux vues.
  const traceContinueEnabled = true;

  // -------------------- Mode Comparer (v2) --------------------
  // null OU { from: Map<id,{cx,cy}>, to: Map<id,{cx,cy}>, fading: bool }
  const [traceComparaison, setTraceComparaison] = useState(null);
  const [comparerEnCours, setComparerEnCours]   = useState(false);
  const comparerInstanceRef = useRef(0);

  // -------------------- Boucle smooth (v2 ajustement) --------------------
  // Phase de l'animation à la transition dernier → premier millésime :
  //   'normal'   : transitions cx/cy normales
  //   'fade-out' : opacity → 0 sur 400 ms (transitions cx/cy actives,
  //                mais les bulles disparaissent avant de bouger)
  //   'snap'     : changement de millésime instantané, transitions
  //                cx/cy DÉSACTIVÉES pour ne pas voir les bulles
  //                « voler » du dernier point au premier
  //   après 'snap' on revient à 'normal' → opacité revient à 1
  //                (fade-in via la transition opacity 400 ms).
  const [phaseAnim, setPhaseAnim] = useState('normal');

  // Références des axes (Phase 15.2) : pilotées par l'ÉTAT PARTAGÉ de
  // l'app (mesureAxes + perimetresAxes / referenceAxesPositionnement) via
  // le sélecteur enrichi commun rendu dans la modale (ReferenceAxesSelector).
  // Plus de state local `refMode` — tout choix dans la modale se
  // répercute sur la vue principale et inversement. Les descripteurs
  // sont résolus en coordonnées par QuadrantAnime depuis les axes du
  // millésime courant. L'endpoint serie-temporelle calcule désormais
  // les 4 clés Mentions (dont mediane_nationale, Phase 15.2).
  const referencesAxes = useMemo(
    () => descripteursReferences(vue, { mesureAxes, perimetresAxes, referenceAxesPositionnement }),
    [vue, mesureAxes, perimetresAxes, referenceAxesPositionnement]
  );

  // -------------------- Fetch au montage --------------------
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    const params = {
      formation: cursus, vue,
      var1: variableX, var2: variableY,
      date_inser_var1: dateInserX, date_inser_var2: dateInserY,
      etab_contexte: etabContexte,
      dom: domaine, discipli: discipline, secteur, mention,
      master: typeMaster,
      representativite: representativite ? 'representatif' : 'toutes',
      ...(memeTypologie ? { meme_typologie: 1 } : {}),
    };

    getQuadrantSerieTemporelle(params)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        const ms = res?.millesimes_disponibles || [];
        if (ms.length >= 2) {
          setMillesimeCourant(ms[0]);
          millesimePrecedentRef.current = ms[0];
          // La trace est dérivée des données via useMemo plus bas —
          // pas besoin d'initialisation explicite.
          setPhaseAnim('normal');
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(messageErreur(err));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [
    open, cursus, vue, variableX, variableY, dateInserX, dateInserY,
    etabContexte, domaine, discipline, secteur, mention, typeMaster, representativite, memeTypologie,
  ]);

  // -------------------- Lecture auto --------------------
  // Au tick, si on est au dernier millésime, on déclenche le flow
  // « smooth loop » (fade-out → snap au premier → fade-in) au lieu
  // d'un setMillesimeCourant brutal qui ferait voler les bulles à
  // l'envers à travers tout le quadrant.
  useEffect(() => {
    if (!enLecture || !data) return;
    if (phaseAnim !== 'normal') return; // boucle en cours, on attend
    const ms = data.millesimes_disponibles || [];
    if (ms.length < 2) return;

    intervalRef.current = setInterval(() => {
      const courant = millesimePrecedentRef.current; // valeur la plus à jour
      const i = ms.indexOf(courant);
      if (i === ms.length - 1) {
        // Loop smooth : fade-out, snap, fade-in
        lancerBouclage();
      } else {
        setMillesimeCourant(ms[i + 1]);
      }
    }, tickMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLecture, data, tickMs, phaseAnim]);

  // Orchestre la transition dernier → premier millésime en fade.
  async function lancerBouclage() {
    const ms = data.millesimes_disponibles || [];
    if (ms.length < 2) return;
    setPhaseAnim('fade-out');
    // Attendre la fin du fade-out (400 ms = même durée que la
    // transition opacity côté SVG)
    await new Promise((r) => setTimeout(r, 400));
    setPhaseAnim('snap');
    setMillesimeCourant(ms[0]);
    // Attendre 2 frames pour laisser React commit le DOM avec
    // transition: none AVANT de réactiver les transitions.
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    setPhaseAnim('normal'); // fade-in via opacity transition
  }

  // -------------------- Échap ferme --------------------
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => fermerRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  // -------------------- Bulles courantes + toute série --------------------
  const bullesTouteSerie = useMemo(() => {
    if (!data?.series) return new Map();
    const m = new Map();
    for (const serie of Object.values(data.series)) {
      for (const b of (serie.bulles || [])) m.set(b.id, b);
    }
    return m;
  }, [data]);

  const bullesCourantes = useMemo(() => {
    if (!data?.series || millesimeCourant == null) return [];
    return data.series[String(millesimeCourant)]?.bulles || [];
  }, [data, millesimeCourant]);

  // -------------------- Suivi d'une mention (Phase 15.3) --------------------
  // Liste des libellés à proposer dans le sélecteur « Suivre une
  // mention » : l'UNION des mentions sur TOUS les millésimes de la
  // série (pas seulement le millésime courant — cf. demande métier),
  // pour pouvoir suivre une mention qui n'apparaît pas à l'année
  // affichée. Dédoublonné par libellé, trié en français. Vue Mentions
  // uniquement (en Positionnement le suivi établissement est déjà
  // assuré par le sélecteur d'étab global).
  const mentionsSuivables = useMemo(() => {
    if (vue !== 'mentions') return [];
    const libelles = new Set();
    for (const b of bullesTouteSerie.values()) {
      if (b.libelle) libelles.add(b.libelle);
    }
    return Array.from(libelles).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [bullesTouteSerie, vue]);

  const axesCourants = useMemo(() => {
    if (!data?.series || millesimeCourant == null) return null;
    return data.series[String(millesimeCourant)]?.axes || null;
  }, [data, millesimeCourant]);

  // Populations de référence au millésime courant (« entrants
  // 2021-22 », « sortants 2023 »…). Variables par millésime →
  // libellés des axes se mettent à jour pendant l'animation, ce qui
  // est informatif (« cette cohorte → cette autre cohorte »).
  // Chaque bulle d'un même indicateur/millésime porte la MÊME
  // population_x/y (constante métier), on lit donc la première.
  const populationX = bullesCourantes[0]?.population_x || null;
  const populationY = bullesCourantes[0]?.population_y || null;

  // Libellés d'axes au format harmonisé avec Quadrant.jsx :
  //   « variable à N mois (population) » si déclinable
  //   « variable (population) » sinon
  const libelleAxeX = formatLibelleAxe(variableX, dateInserX, populationX);
  const libelleAxeY = formatLibelleAxe(variableY, dateInserY, populationY);

  // -------------------- Trace continue (dérivée des données) --------------------
  // Pour chaque bulle présente entre ms[0] et le millésime courant
  // inclus, on construit la liste de ses positions successives
  // (Map<id, Array<{cx, cy}>>). Le rendu côté QuadrantAnime trace une
  // polyline reliant ces points dans l'ordre.
  //
  // Trajectoire complète, esprit Gapminder : pas de plafond — la
  // bulle traîne tout son chemin parcouru. Au snap loop (ms[N-1] →
  // ms[0]), la trace redevient un point unique (et la polyline
  // disparaît tant qu'on n'a pas un 2ᵉ millésime). Bouclage smooth
  // visuel inchangé.
  //
  // Dérivation pure des données : pas d'historique en state, pas de
  // sensibilité au sens du parcours (slider arrière OU avant → la
  // trace reflète toujours strictement « ms[0] → millesimeCourant »).
  const traceContinue = useMemo(() => {
    const result = new Map();
    if (!data?.series || !traceContinueEnabled || millesimeCourant == null) {
      return result;
    }
    const ms = data.millesimes_disponibles || [];
    const idxCourant = ms.indexOf(millesimeCourant);
    if (idxCourant === -1) return result;

    for (let i = 0; i <= idxCourant; i++) {
      const bullesM = data.series[String(ms[i])]?.bulles || [];
      for (const b of bullesM) {
        const arr = result.get(b.id) || [];
        arr.push(bulleCxCy(b));
        result.set(b.id, arr);
      }
    }
    return result;
  }, [data, millesimeCourant, traceContinueEnabled]);

  // -------------------- Sync inconditionnel du ref --------------------
  // Le setInterval de lecture auto lit `millesimePrecedentRef.current`
  // pour décider du millésime suivant. Sans ce sync, le timer se
  // figeait au 2ᵉ millésime (régression Phase 11b → 12-13).
  useEffect(() => {
    if (millesimeCourant != null) {
      millesimePrecedentRef.current = millesimeCourant;
    }
  }, [millesimeCourant]);

  // -------------------- Handlers de base --------------------
  function handlePlayPause() {
    if (comparerEnCours) return;
    // Suivi Matomo : on ne trace que le passage en LECTURE (pas la pause).
    // Hors de l'updater setState pour rester pur (StrictMode double-invoque
    // les updaters en dev → sinon double comptage).
    if (!enLecture) {
      trackEvent('Animation temporelle', 'lecture', null, {
        etab: etabInfo?.libelle, vue, cursus, millesime,
      });
    }
    setEnLecture((p) => !p);
  }
  function handlePrev() {
    if (comparerEnCours) return;
    setEnLecture(false);
    const ms = data?.millesimes_disponibles || [];
    const i = ms.indexOf(millesimeCourant);
    if (i > 0) setMillesimeCourant(ms[i - 1]);
  }
  function handleNext() {
    if (comparerEnCours) return;
    setEnLecture(false);
    const ms = data?.millesimes_disponibles || [];
    const i = ms.indexOf(millesimeCourant);
    if (i < ms.length - 1) setMillesimeCourant(ms[i + 1]);
  }
  // Changement de millésime via le curseur DSFR (déjà snappé sur un
  // millésime disponible par SliderDuree). Déplacement manuel → pause.
  function handleChoisirMillesime(m) {
    if (comparerEnCours) return;
    setEnLecture(false);
    setMillesimeCourant(m);
  }

  // -------------------- Mode Comparer (v2) --------------------
  // Async flow avec verrou (instance ref) pour ignorer les clics
  // pendant que le flow tourne. Promesses de timing pour orchestrer
  // les phases.
  async function handleComparer() {
    if (!data || comparerEnCours) return;
    const ms = data.millesimes_disponibles || [];
    const iCourant = ms.indexOf(millesimeCourant);
    if (iCourant <= 0) return;

    const instance = ++comparerInstanceRef.current;
    const isStillCurrent = () => comparerInstanceRef.current === instance;

    setEnLecture(false);
    setComparerEnCours(true);

    const mAvant = ms[iCourant - 1];
    const mApres = millesimeCourant;

    // Capturer les positions à M-1 et à M depuis la série (avant
    // tout setState) — sert à dessiner la trace M-1 → M.
    const positionsFrom = new Map();
    const positionsTo   = new Map();
    for (const b of (data.series[String(mAvant)]?.bulles || [])) {
      positionsFrom.set(b.id, bulleCxCy(b));
    }
    for (const b of (data.series[String(mApres)]?.bulles || [])) {
      positionsTo.set(b.id, bulleCxCy(b));
    }

    // Phase 1 : saut instantané à M-1 (transition désactivée)
    setDureeOverride(0);
    setMillesimeCourant(mAvant);

    // 2 frames pour laisser React commit + le navigateur appliquer
    // transition: 0 ms avant le saut visible.
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    if (!isStillCurrent()) return;

    // Phase 2 : pause à M-1 (transition reste désactivée pour ne
    // pas animer un retour incident)
    await new Promise((r) => setTimeout(r, COMPARER_FLASH_PAUSE_MS));
    if (!isStillCurrent()) return;

    // Phase 3 : transition longue vers M, trace marquée affichée
    setDureeOverride(COMPARER_TRANSITION_MS);
    setMillesimeCourant(mApres);
    setTraceComparaison({ from: positionsFrom, to: positionsTo, fading: false });

    // Attendre fin de transition + phase visible (5 s)
    await new Promise((r) => setTimeout(r, COMPARER_TRANSITION_MS + COMPARER_VISIBLE_MS));
    if (!isStillCurrent()) {
      setTraceComparaison(null);
      setDureeOverride(null);
      setComparerEnCours(false);
      return;
    }

    // Phase 4 : fade-out
    setTraceComparaison((t) => t ? ({ ...t, fading: true }) : null);
    await new Promise((r) => setTimeout(r, COMPARER_FADE_OUT_MS));
    if (!isStillCurrent()) return;

    // Reset
    setTraceComparaison(null);
    setDureeOverride(null);
    setComparerEnCours(false);
  }

  // -------------------- Rendu --------------------
  // Hook conditionnel interdit : appel inconditionnel, on traitera
  // `open=false` plus bas. Anti-flash 350 ms — pour un fetch très
  // rapide on n'affiche jamais la barre de progression.
  const showLoader = useDelayedLoading(loading);
  if (!open) return null;
  const ms = data?.millesimes_disponibles || [];
  const animationDispo = ms.length >= 2;
  const iCourant = ms.indexOf(millesimeCourant);

  return (
    <div
      className="modale-animation-overlay"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modale-animation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modale-animation-titre"
      >
        <header>
          <h2 id="modale-animation-titre">Évolution dans le temps</h2>
          <button
            ref={fermerRef}
            type="button"
            className="bouton-fermer fr-icon-close-line"
            aria-label="Fermer la fenêtre d'animation"
            onClick={onClose}
          />
        </header>

        <div className="modale-animation-contexte">
          <strong>{etabInfo?.libelle}</strong>
          {' · '}{cursus}
          {' · '}Vue {vue === 'mentions' ? 'Mentions' : 'Positionnement'}
        </div>

        {loading && showLoader && (
          <div className="modale-animation-loading">
            <LoaderBarre />
          </div>
        )}
        {loading && !showLoader && (
          <div className="modale-animation-loading" aria-busy="true" />
        )}

        {error && (
          <div className="fr-alert fr-alert--error">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && data && !animationDispo && (
          <div className="fr-alert fr-alert--info">
            <p>
              L&apos;animation nécessite au moins 2 millésimes avec ces
              indicateurs. Essayez d&apos;autres axes ou un autre cursus.
            </p>
          </div>
        )}

        {!loading && !error && animationDispo && (
          <>
            {/* Suivi d'une mention (Phase 15.3, vue Mentions uniquement) :
                liste TOUTES les mentions de la série (tous millésimes),
                pilote `rechercheMention` partagé → halo coloré sur la
                bulle suivie dans QuadrantAnime + highlight cohérent sur
                le quadrant principal. Mode free-text (comme la barre de
                recherche) : onSelect ET onTextChange écrivent l'état. */}
            {vue === 'mentions' && mentionsSuivables.length > 0 && (
              <div className="modale-animation-suivi">
                <Combobox
                  id="modale-anim-suivi-mention"
                  label="Suivre une mention"
                  placeholder="Choisir une mention à mettre en évidence…"
                  items={mentionsSuivables.map((l) => ({ id: l, libelle: l }))}
                  value={rechercheMention}
                  onSelect={(id) => setRechercheMention(id)}
                  onTextChange={(t) => setRechercheMention(t)}
                />
              </div>
            )}

            {/* Curseur de millésime DSFR — au-dessus du quadrant (Phase 14.6) */}
            <div className="modale-animation-slider-commun">
              <SliderDuree
                valeurs={ms}
                valeur={millesimeCourant}
                onChanger={handleChoisirMillesime}
                idBase="anim-millesime"
                libelle="Millésime"
                suffixe=""
                disabled={comparerEnCours}
              />
            </div>

            <div className="modale-animation-quadrant">
              <QuadrantAnime
                bulles={bullesCourantes}
                axes={axesCourants}
                references={referencesAxes}
                vue={vue}
                libelleX={libelleAxeX}
                libelleY={libelleAxeY}
                millesimeCourant={millesimeCourant}
                bullesTouteSerie={bullesTouteSerie}
                dureeTransitionMs={transitionMs}
                traceContinue={traceContinue}
                traceComparaison={traceComparaison}
                phaseAnim={phaseAnim}
                rechercheMention={rechercheMention}
              />
            </div>

            {/* Référence des axes — sélecteur enrichi COMMUN (Phase 15.2),
                identique à la vue principale et branché sur le même état
                partagé (mesureAxes + perimetresAxes). Placé AU-DESSUS des
                contrôles de lecture/vitesse (Phase 15.3). */}
            <div className="modale-animation-ref-axes-bandeau">
              <ReferenceAxesSelector />
            </div>

            {/* Contrôles de lecture + vitesse — SOUS le quadrant (Phase 14.6).
                Lecture à gauche, vitesse à droite ; wrap sur 2 lignes si
                l'espace manque. */}
            <div className="modale-animation-controls">
              <div className="modale-animation-controls-lecture">
                <button
                  type="button"
                  className="fr-btn fr-btn--sm fr-btn--tertiary"
                  onClick={handlePrev}
                  disabled={iCourant <= 0 || comparerEnCours}
                  aria-label="Millésime précédent"
                >⏮</button>
                <button
                  type="button"
                  className="fr-btn fr-btn--sm"
                  onClick={handlePlayPause}
                  disabled={comparerEnCours}
                  aria-label={enLecture ? 'Pause' : 'Lecture'}
                >{enLecture ? '⏸ Pause' : '▶ Lecture'}</button>
                <button
                  type="button"
                  className="fr-btn fr-btn--sm fr-btn--tertiary"
                  onClick={handleNext}
                  disabled={iCourant >= ms.length - 1 || comparerEnCours}
                  aria-label="Millésime suivant"
                >⏭</button>
              </div>

              {/* Sélecteur de vitesse — composant DSFR `fr-segmented`
                  en taille `--sm` (boutons inline plus esthétiques que
                  les radios verticaux pour des libellés courts comme
                  Lente / Moyenne / Rapide). */}
              <fieldset
                className="fr-segmented fr-segmented--sm"
                disabled={comparerEnCours}
              >
                <legend className="fr-segmented__legend">Vitesse</legend>
                <div className="fr-segmented__elements">
                  {Object.entries(VITESSES).map(([code, conf]) => {
                    const id = `modale-anim-vitesse-${code}`;
                    return (
                      <div key={code} className="fr-segmented__element">
                        <input
                          type="radio"
                          id={id}
                          name="modale-anim-vitesse"
                          value={code}
                          checked={vitesse === code}
                          onChange={() => setVitesse(code)}
                        />
                        <label className="fr-label" htmlFor={id}>{conf.libelle}</label>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            </div>

            {/* Bouton « Comparer » retiré en Phase 14.7 — fonctionnalité
                conservée pour usage futur (état comparerEnCours, handleComparer,
                trace pointillée et styles afférents restent en place). */}

            <p className="modale-animation-mention-seuil">
              ⓘ Pour l&apos;exploration historique, seules les bulles avec
              au moins {data.seuil_applique} effectifs sur les deux
              indicateurs sont affichées (les bulles fragiles présentes
              à l&apos;écran principal sont donc masquées ici). Les
              traces fines derrière chaque bulle montrent leur
              trajectoire depuis le premier millésime jusqu&apos;à
              celui affiché.
            </p>

            <p className="modale-animation-source">
              {LIBELLE_SOURCE} · {MENTION_DIFFUSION}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
