import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { getQuadrantSerieTemporelle } from '../services/api.js';
import { messageErreur } from '../utils/errors.js';
import { LIBELLE_SOURCE, MENTION_DIFFUSION } from '../utils/constants.js';
import QuadrantAnime from './QuadrantAnime.jsx';
import Skeleton from './Skeleton.jsx';

// Modale d'animation temporelle (Phase 11b MVP).
//
// Fetch /api/quadrant/serie-temporelle au montage avec les filtres
// courants. Pendant le chargement : skeleton. Une fois les données
// arrivées :
//   - bulles glissent entre millésimes via QuadrantAnime
//   - contrôles play/pause + slider + ⏮/⏭ + sélecteur de référence
//
// Hors scope MVP (Phase 11b v2 à venir) :
//   - trace résiduelle (lignes des positions précédentes)
//   - mode "Comparer avec millésime précédent" (one-shot avec trace
//     épaisse)
//   - sélecteur 3 vitesses (1 vitesse fixe ici : 1000 ms par millésime)
//
// La modale est en sandbox : ferme via [✕] ou Escape. L'app
// principale ne voit aucun changement d'état (le millésime du
// dropdown principal reste inchangé).
//
// Vitesse par défaut : 1000 ms = 1 millésime par seconde, avec
// transition CSS de 800 ms côté bulles. La transition tient dans
// l'intervalle, donc l'animation est continue.

const VITESSE_MS = 1000;

// Libellés des modes d'axes (par vue).
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

  // État fetch
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [data, setData]       = useState(null); // { millesimes_disponibles, series, seuil_applique, info? }

  // État animation
  const [millesimeCourant, setMillesimeCourant] = useState(null);
  const [enLecture, setEnLecture] = useState(false);
  const intervalRef = useRef(null);

  // Mode de référence des axes (initialise sur celui de l'app principale)
  const [refMode, setRefMode] = useState(
    vue === 'mentions' ? referenceAxes : referenceAxesPositionnement
  );

  // -------------------- Effets --------------------

  // Fetch au montage
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
      // representativite côté AppContext est un booléen ; l'API
      // attend 'toutes' / 'representatif' (cohérent /quadrant). Même
      // conversion que useQuadrant.js.
      representativite: representativite ? 'representatif' : 'toutes',
    };

    getQuadrantSerieTemporelle(params)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        const ms = res?.millesimes_disponibles || [];
        if (ms.length >= 2) {
          // Initialiser au premier millésime (en pause)
          setMillesimeCourant(ms[0]);
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

  // Lecture auto : avance d'un millésime toutes les VITESSE_MS,
  // boucle au début quand on atteint la fin.
  useEffect(() => {
    if (!enLecture || !data) return;
    const ms = data.millesimes_disponibles || [];
    if (ms.length < 2) return;

    intervalRef.current = setInterval(() => {
      setMillesimeCourant((courant) => {
        const i = ms.indexOf(courant);
        const next = i === -1 || i === ms.length - 1 ? ms[0] : ms[i + 1];
        return next;
      });
    }, VITESSE_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [enLecture, data]);

  // Échap ferme la modale
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

  // -------------------- Dérivés --------------------

  // Toutes les bulles vues au moins une fois dans la série, indexées
  // par id. Sert au fade-out gracieux des bulles qui disparaissent
  // ponctuellement (denom < seuil un millésime donné par exemple).
  // Si la même id apparaît à plusieurs millésimes, on garde la
  // dernière vue (peu importe — sert juste à connaître l'existence
  // et la dernière position connue).
  const bullesTouteSerie = useMemo(() => {
    if (!data?.series) return new Map();
    const m = new Map();
    for (const serie of Object.values(data.series)) {
      for (const b of (serie.bulles || [])) {
        m.set(b.id, b);
      }
    }
    return m;
  }, [data]);

  const bullesCourantes = useMemo(() => {
    if (!data?.series || millesimeCourant == null) return [];
    const k = String(millesimeCourant);
    return data.series[k]?.bulles || [];
  }, [data, millesimeCourant]);

  const axesCourants = useMemo(() => {
    if (!data?.series || millesimeCourant == null) return null;
    const k = String(millesimeCourant);
    return data.series[k]?.axes || null;
  }, [data, millesimeCourant]);

  const modesAxes = vue === 'mentions' ? MODES_AXES_MENTIONS : MODES_AXES_ETAB;

  // -------------------- Handlers --------------------

  function handlePlayPause() {
    setEnLecture((p) => !p);
  }
  function handlePrev() {
    setEnLecture(false);
    const ms = data?.millesimes_disponibles || [];
    const i = ms.indexOf(millesimeCourant);
    if (i > 0) setMillesimeCourant(ms[i - 1]);
  }
  function handleNext() {
    setEnLecture(false);
    const ms = data?.millesimes_disponibles || [];
    const i = ms.indexOf(millesimeCourant);
    if (i < ms.length - 1) setMillesimeCourant(ms[i + 1]);
  }
  function handleSlider(e) {
    setEnLecture(false);
    const target = parseInt(e.target.value, 10);
    const arr = data?.millesimes_disponibles || [];
    // Snap au millésime disponible le plus proche (sécurise le cas
    // où les millésimes ne seraient pas strictement consécutifs).
    let plusProche = arr[0];
    let dMin = Math.abs(target - arr[0]);
    for (const m of arr) {
      const d = Math.abs(target - m);
      if (d < dMin) { plusProche = m; dMin = d; }
    }
    setMillesimeCourant(plusProche);
  }

  // -------------------- Rendu --------------------

  if (!open) return null;

  // États non-data : skeleton ou erreur
  const ms = data?.millesimes_disponibles || [];
  const animationDispo = ms.length >= 2;

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
            <Skeleton height="500px" width="100%" radius="4px" />
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
                libelleX={variableX}
                libelleY={variableY}
                millesimeCourant={millesimeCourant}
                bullesTouteSerie={bullesTouteSerie}
              />
            </div>

            <div className="modale-animation-controls">
              <button
                type="button"
                className="fr-btn fr-btn--sm fr-btn--tertiary"
                onClick={handlePrev}
                disabled={ms.indexOf(millesimeCourant) <= 0}
                aria-label="Millésime précédent"
              >
                ⏮
              </button>
              <button
                type="button"
                className="fr-btn fr-btn--sm"
                onClick={handlePlayPause}
                aria-label={enLecture ? 'Pause' : 'Lecture'}
              >
                {enLecture ? '⏸ Pause' : '▶ Lecture'}
              </button>
              <button
                type="button"
                className="fr-btn fr-btn--sm fr-btn--tertiary"
                onClick={handleNext}
                disabled={ms.indexOf(millesimeCourant) >= ms.length - 1}
                aria-label="Millésime suivant"
              >
                ⏭
              </button>

              <input
                type="range"
                className="modale-animation-slider"
                min={ms[0]}
                max={ms[ms.length - 1]}
                step={1}
                value={millesimeCourant}
                onChange={handleSlider}
                aria-label="Millésime"
              />

              <div className="modale-animation-millesimes-ticks">
                {ms.map((m) => (
                  <span
                    key={m}
                    className={'tick' + (m === millesimeCourant ? ' actif' : '')}
                  >
                    {m}
                  </span>
                ))}
              </div>
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
