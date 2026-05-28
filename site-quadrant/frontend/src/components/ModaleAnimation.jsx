import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { getQuadrantSerieTemporelle } from '../services/api.js';
import { messageErreur } from '../utils/errors.js';
import { LIBELLE_SOURCE, MENTION_DIFFUSION } from '../utils/constants.js';
import { formatLibelleAxe } from '../utils/libelleAxe.js';
import QuadrantAnime, { bulleCxCy } from './QuadrantAnime.jsx';
import Skeleton from './Skeleton.jsx';

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
//    Désactivée en vue=etablissements (~700 polylines = bruit visuel
//    + coût).
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
  // Map<id, Array<{cx, cy}>>. Désactivée pour vue=etablissements.
  const traceContinueEnabled = vue === 'mentions';
  const [traceContinue, setTraceContinue] = useState(() => new Map());

  // -------------------- Mode Comparer (v2) --------------------
  // null OU { from: Map<id,{cx,cy}>, to: Map<id,{cx,cy}>, fading: bool }
  const [traceComparaison, setTraceComparaison] = useState(null);
  const [comparerEnCours, setComparerEnCours]   = useState(false);
  const comparerInstanceRef = useRef(0);

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
          setTraceContinue(new Map());
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
  useEffect(() => {
    if (!enLecture || !data) return;
    const ms = data.millesimes_disponibles || [];
    if (ms.length < 2) return;

    intervalRef.current = setInterval(() => {
      setMillesimeCourant((courant) => {
        const i = ms.indexOf(courant);
        return i === -1 || i === ms.length - 1 ? ms[0] : ms[i + 1];
      });
    }, tickMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [enLecture, data, tickMs]);

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
  //   - si avancée (idx > précédent) : append des positions courantes
  //     (FIFO à TRACE_MAX_POSITIONS).
  //   - si recul ou saut non séquentiel : reset (trace vide).
  // Skip pendant le mode Comparer (le ref M-1 → M peut faire baisser
  // le millésime temporairement et déclencherait un reset à tort).
  useEffect(() => {
    if (!traceContinueEnabled) return;
    if (millesimeCourant == null) return;
    if (comparerEnCours) return;

    const ms = data?.millesimes_disponibles || [];
    const iCourant = ms.indexOf(millesimeCourant);
    const iPrec    = ms.indexOf(millesimePrecedentRef.current);

    if (iCourant === -1) return;

    if (iPrec === -1 || iCourant !== iPrec + 1) {
      // Saut non séquentiel : reset
      setTraceContinue(new Map());
    } else {
      // Avancée d'un cran : append
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
    }

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

        {loading && (
          <div className="modale-animation-loading">
            <Skeleton height="400px" width="100%" radius="4px" />
          </div>
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
                traceContinue={traceContinueEnabled ? traceContinue : null}
                traceComparaison={traceComparaison}
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
              <div className="modale-animation-vitesse">
                <span className="label">Vitesse :</span>
                {Object.entries(VITESSES).map(([code, conf]) => (
                  <label key={code} className="fr-radio-group fr-radio-group--sm">
                    <input
                      type="radio"
                      name="vitesse-anim"
                      value={code}
                      checked={vitesse === code}
                      onChange={() => setVitesse(code)}
                      disabled={comparerEnCours}
                    />
                    <span>{conf.libelle}</span>
                  </label>
                ))}
              </div>

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

            <div className="modale-animation-ref-axes">
              <span className="label">Référence des axes :</span>
              {modesAxes.map((m) => (
                <label key={m.code} className="fr-radio-group fr-radio-group--sm">
                  <input
                    type="radio"
                    name="ref-axes-anim"
                    value={m.code}
                    checked={refMode === m.code}
                    onChange={() => setRefMode(m.code)}
                  />
                  <span>{m.libelle}</span>
                </label>
              ))}
            </div>

            <p className="modale-animation-mention-seuil">
              ⓘ Pour l&apos;exploration historique, seules les bulles avec
              au moins {data.seuil_applique} effectifs sur les deux
              indicateurs sont affichées (les bulles fragiles présentes
              à l&apos;écran principal sont donc masquées ici).
              {traceContinueEnabled
                ? ' Les traces fines derrière chaque bulle montrent ses 3 dernières positions.'
                : " Traces résiduelles désactivées en vue Positionnement (trop de bulles pour rester lisible)."}
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
