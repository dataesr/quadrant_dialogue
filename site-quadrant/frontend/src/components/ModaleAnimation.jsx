import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { getQuadrantSerieTemporelle } from '../services/api.js';
import { messageErreur } from '../utils/errors.js';
import { LIBELLE_SOURCE, MENTION_DIFFUSION } from '../utils/constants.js';
import { formatLibelleAxe } from '../utils/libelleAxe.js';
import QuadrantAnime, { bulleCxCy } from './QuadrantAnime.jsx';
import LoaderBarre from './LoaderBarre.jsx';
import { useDelayedLoading } from '../hooks/useDelayedLoading.js';

// Modale d'animation temporelle (Phase 11b — MVP + v2).
//
// Fetch /api/quadrant/serie-temporelle puis affiche les bulles
// glissant entre millésimes via QuadrantAnime, avec contrôles de
// lecture, sélecteur de référence des axes, et trois enrichissements
// v2 :
//
// 1. Trace résiduelle (continue) : pour chaque bulle qui bouge, on
//    dessine une polyline fine reliant ses 3 dernières positions.
//    FIFO : ajouter la nouvelle, retirer la plus ancienne au-delà de
//    4 points. Reset si l'utilisateur recule manuellement le slider
//    (sinon traces incohérentes en mode aller-retour).
//    Active dans les deux vues : la vue Positionnement plafonne à
//    ~80 bulles par millésime, soit ~240 segments — coût négligeable.
//
// 2. Mode « Comparer avec millésime précédent » : flow async qui
//    saute instantanément à M-1, attend 200 ms, lance une transition
//    longue (1500 ms) vers M, et dessine une trace marquée
//    (stroke 2, opacity 0.6) qui reste 5 s puis fade-out 1 s.
//    Pendant ce flow le bouton est verrouillé pour éviter le double-
//    clic.
//
// 3. Sélecteur 3 vitesses : Lente (2 s/millésime), Moyenne (1 s),
//    Rapide (0.5 s). La durée de transition CSS des bulles s'adapte
//    en parallèle pour rester proportionnelle à l'intervalle
//    (transition = ~80 % du tick) — évite que les bulles n'aient pas
//    le temps de finir leur mouvement avant le tick suivant.

// Map vitesse → { tickMs, transitionMs }
const VITESSES = {
  lente:   { tickMs: 2000, transitionMs: 1600, libelle: 'Lente' },
  moyenne: { tickMs: 1000, transitionMs:  800, libelle: 'Moyenne' },
  rapide:  { tickMs:  500, transitionMs:  400, libelle: 'Rapide' },
};

// Pour la trace résiduelle continue : max 4 positions par bulle
// (= 3 segments). Ajustable si on souhaite plus/moins de mémoire
// visuelle.
const TRACE_MAX_POSITIONS = 4;

// Mode « Comparer » : durée de la transition one-shot M-1 → M (plus
// lent que les transitions normales pour bien voir le mouvement) et
// durées de la phase « trace visible » et « fade-out » qui suivent.
const COMPARER_TRANSITION_MS = 1500;
const COMPARER_VISIBLE_MS    = 5000;
const COMPARER_FADE_OUT_MS   = 1000;
const COMPARER_FLASH_PAUSE_MS = 200; // pause à M-1 avant de relancer

const MODES_AXES_MENTIONS = [
  { code: 'mediane_etab',      libelle: 'Médiane établissement' },
  { code: 'moyenne_etab',      libelle: 'Moyenne établissement' },
  { code: 'moyenne_nationale', libelle: 'Moyenne nationale' },
];
const MODES_AXES_ETAB = [
  { code: 'mediane', libelle: 'Médiane' },
  { code: 'moyenne', libelle: 'Moyenne' },
];

export default function ModaleAnimation({ open, onClose }) {
  const {
    etabInfo, cursus, vue, millesime,
    variableX, variableY, dateInserX, dateInserY,
    etabContexte, domaine, discipline, secteur, mention, typeMaster,
    representativite, referenceAxes, referenceAxesPositionnement,
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

  // -------------------- Vitesse (v2) --------------------
  const [vitesse, setVitesse] = useState('moyenne');
  // Durée de transition appliquée par défaut ; un override (mode
  // Comparer) peut le forcer temporairement.
  const [dureeOverride, setDureeOverride] = useState(null);
  const tickMs       = VITESSES[vitesse].tickMs;
  const transitionMs = dureeOverride ?? VITESSES[vitesse].transitionMs;

  // -------------------- Trace résiduelle (v2) --------------------
  // Map<id, Array<{cx, cy}>>. Active dans les deux vues (la vue
  // Positionnement plafonne à ~80 bulles, coût négligeable).
  const traceContinueEnabled = true;
  const [traceContinue, setTraceContinue] = useState(() => new Map());

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

  // Mode de référence des axes (initialise sur celui de l'app)
  const [refMode, setRefMode] = useState(
    vue === 'mentions' ? referenceAxes : referenceAxesPositionnement
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
    };

    getQuadrantSerieTemporelle(params)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        const ms = res?.millesimes_disponibles || [];
        if (ms.length >= 2) {
          setMillesimeCourant(ms[0]);
          millesimePrecedentRef.current = ms[0];
          // Init trace avec les positions du PREMIER millésime —
          // évite le bug off-by-one où la position initiale n'était
          // pas enregistrée et le 1er segment manquait. Trace active
          // dans les deux vues depuis la Phase 12-13.
          const initialTrace = new Map();
          for (const b of (res.series[String(ms[0])]?.bulles || [])) {
            initialTrace.set(b.id, [bulleCxCy(b)]);
          }
          setTraceContinue(initialTrace);
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
    etabContexte, domaine, discipline, secteur, mention, typeMaster, representativite,
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

  // -------------------- Mise à jour de la trace continue --------------------
  // À chaque changement de millesimeCourant :
  //   - même millésime (init, snap loop) : skip (la trace est gérée
  //     ailleurs — init au fetch, reset au snap).
  //   - avancée séquentielle (idx = prev + 1) : append à la queue (FIFO
  //     plafonné à TRACE_MAX_POSITIONS = 4 positions = 3 segments).
  //   - loop (last → first) : reset à la nouvelle position courante
  //     (l'animation entame un nouveau cycle).
  //   - saut non séquentiel (slider en arrière) : reset à la position
  //     courante.
  // Skip pendant comparer (le ref M-1 → M déclencherait un reset à tort).
  //
  // À la fin, le ref `millesimePrecedentRef` est mis à jour
  // SYSTÉMATIQUEMENT, y compris quand la logique de trace est sautée
  // (comparer en cours, traces sans effet ce render). Le setInterval
  // de lecture auto lit ce ref pour calculer la prochaine étape — sans
  // sync inconditionnel, après un premier tick le ref restait sur la
  // valeur initiale et l'animation se figeait au 2ᵉ millésime
  // (régression observée dès Phase 11b en vue Positionnement, où le
  // trace useEffect retournait early sur `!traceContinueEnabled`).
  useEffect(() => {
    if (millesimeCourant == null) return;

    const traceLogique = traceContinueEnabled && !comparerEnCours;
    const ms = data?.millesimes_disponibles || [];
    const iCourant = ms.indexOf(millesimeCourant);
    const iPrec    = ms.indexOf(millesimePrecedentRef.current);

    if (traceLogique && iCourant !== -1 && iCourant !== iPrec) {
      const enAvancee = iCourant === iPrec + 1;
      const enLoop    = iPrec === ms.length - 1 && iCourant === 0;

      if (enAvancee) {
        // Append : nouvelle position à la queue, pop tête si > 4.
        setTraceContinue((prev) => {
          const next = new Map(prev);
          for (const b of bullesCourantes) {
            const { cx, cy } = bulleCxCy(b);
            const historique = next.get(b.id)?.slice() || [];
            historique.push({ cx, cy });
            if (historique.length > TRACE_MAX_POSITIONS) historique.shift();
            next.set(b.id, historique);
          }
          return next;
        });
      } else if (enLoop) {
        // Loop : reset à la position du premier millésime (nouveau cycle)
        setTraceContinue(() => {
          const next = new Map();
          for (const b of bullesCourantes) {
            next.set(b.id, [bulleCxCy(b)]);
          }
          return next;
        });
      } else {
        // Saut non séquentiel : reset à la position courante
        setTraceContinue(() => {
          const next = new Map();
          for (const b of bullesCourantes) {
            next.set(b.id, [bulleCxCy(b)]);
          }
          return next;
        });
      }
    }

    // Synchronisation inconditionnelle — la lecture auto (setInterval)
    // lit ce ref pour décider du millésime suivant.
    millesimePrecedentRef.current = millesimeCourant;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [millesimeCourant, bullesCourantes, comparerEnCours, traceContinueEnabled]);

  // -------------------- Handlers de base --------------------
  function handlePlayPause() {
    if (comparerEnCours) return;
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
  function handleSlider(e) {
    if (comparerEnCours) return;
    setEnLecture(false);
    const target = parseInt(e.target.value, 10);
    const arr = data?.millesimes_disponibles || [];
    let plusProche = arr[0];
    let dMin = Math.abs(target - arr[0]);
    for (const m of arr) {
      const d = Math.abs(target - m);
      if (d < dMin) { plusProche = m; dMin = d; }
    }
    setMillesimeCourant(plusProche);
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
  const modesAxes = vue === 'mentions' ? MODES_AXES_MENTIONS : MODES_AXES_ETAB;

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
            <div className="modale-animation-quadrant">
              <QuadrantAnime
                bulles={bullesCourantes}
                axes={axesCourants}
                referenceAxesMode={refMode}
                vue={vue}
                libelleX={libelleAxeX}
                libelleY={libelleAxeY}
                millesimeCourant={millesimeCourant}
                bullesTouteSerie={bullesTouteSerie}
                dureeTransitionMs={transitionMs}
                traceContinue={traceContinue}
                traceComparaison={traceComparaison}
                phaseAnim={phaseAnim}
              />
            </div>

            <div className="modale-animation-controls">
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

              <input
                type="range"
                className="modale-animation-slider"
                min={ms[0]}
                max={ms[ms.length - 1]}
                step={1}
                value={millesimeCourant}
                onChange={handleSlider}
                disabled={comparerEnCours}
                aria-label="Millésime"
              />

              <div className="modale-animation-millesimes-ticks">
                {ms.map((m) => (
                  <span
                    key={m}
                    className={'tick' + (m === millesimeCourant ? ' actif' : '')}
                  >{m}</span>
                ))}
              </div>
            </div>

            <div className="modale-animation-options">
              {/* Sélecteur de vitesse — composant DSFR `fr-segmented`
                  en taille `--sm` (boutons inline plus esthétiques que
                  les radios verticaux pour des libellés courts comme
                  Lente / Moyenne / Rapide). Cohérent avec
                  AffichageSelector qui utilise déjà ce pattern. */}
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

              <button
                type="button"
                className="fr-btn fr-btn--sm fr-btn--tertiary modale-animation-comparer"
                onClick={handleComparer}
                disabled={iCourant <= 0 || comparerEnCours}
                title={iCourant <= 0 ? 'Pas de millésime antérieur disponible' : undefined}
              >
                Comparer avec millésime précédent
              </button>
            </div>

            {/* Référence des axes — même composant `fr-segmented--sm`,
                cohérent avec le sélecteur de vitesse au-dessus. Pour
                les libellés longs (« Moyenne nationale »), le segment
                wrap si besoin de largeur. */}
            <fieldset className="fr-segmented fr-segmented--sm modale-animation-ref-axes">
              <legend className="fr-segmented__legend">Référence des axes</legend>
              <div className="fr-segmented__elements">
                {modesAxes.map((m) => {
                  const id = `modale-anim-ref-${m.code}`;
                  return (
                    <div key={m.code} className="fr-segmented__element">
                      <input
                        type="radio"
                        id={id}
                        name="modale-anim-ref"
                        value={m.code}
                        checked={refMode === m.code}
                        onChange={() => setRefMode(m.code)}
                      />
                      <label className="fr-label" htmlFor={id}>{m.libelle}</label>
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <p className="modale-animation-mention-seuil">
              ⓘ Pour l&apos;exploration historique, seules les bulles avec
              au moins {data.seuil_applique} effectifs sur les deux
              indicateurs sont affichées (les bulles fragiles présentes
              à l&apos;écran principal sont donc masquées ici). Les
              traces fines derrière chaque bulle montrent ses 3
              dernières positions.
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
