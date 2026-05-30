import { useEffect, useMemo, useRef, useState } from 'react';
import { getAnalyseSousPopulations } from '../../services/api.js';
import { messageErreur } from '../../utils/errors.js';
import { LIBELLE_SOURCE, MENTION_DIFFUSION } from '../../utils/constants.js';
import { useDelayedLoading } from '../../hooks/useDelayedLoading.js';
import LoaderBarre from '../LoaderBarre.jsx';
import TableauEcarts from './TableauEcarts.jsx';
import MiniQuadrantSousPop from './MiniQuadrantSousPop.jsx';
import SankeyParcoursSousPop from './SankeyParcoursSousPop.jsx';
import SliderDuree from './SliderDuree.jsx';

// Modale large « Analyse de l'insertion par sous-population » (Phase 14).
//
// Hérite du millésime du quadrant principal et d'une durée d'observation
// initiale, puis l'animation pilote la durée (6 → 12 → 18 → 24 → 30 mois).
// Toute la modale est construite autour d'une référence unifiée
// (diplômés français).
//
// Moteur d'animation calqué sur ModaleAnimation (modale temporelle) :
//   - boucle setInterval lisant un ref synchronisé inconditionnellement ;
//   - bouclage fin de cycle fade-out → snap → fade-in (pas de glissement
//     30 → 6 qui n'aurait pas de sens chronologique) ;
//   - 3 vitesses (Lente / Moyenne / Rapide).

const VITESSES = {
  lente:   { tickMs: 2000, transitionMs: 1600, libelle: 'Lente' },
  moyenne: { tickMs: 1000, transitionMs:  800, libelle: 'Moyenne' },
  rapide:  { tickMs:  500, transitionMs:  400, libelle: 'Rapide' },
};

const ONGLETS = [
  { id: 'comparaison', libelle: 'Comparaison' },
  { id: 'quadrant',    libelle: 'Quadrant' },
  { id: 'parcours',    libelle: 'Parcours' },
];

export default function ModaleAnalyseSousPopulations({
  open,
  onClose,
  idPaysage,
  diplom,
  millesime,
  formation,
  etabLabel,
  mentionLabel,
  initialDateInser,
}) {
  const fermerRef = useRef(null);

  // -------------------- État fetch --------------------
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [data, setData]       = useState(null);

  // -------------------- État animation (durée) --------------------
  const [dureeCourante, setDureeCourante] = useState(null);
  const [enLecture, setEnLecture]         = useState(false);
  const [phaseAnim, setPhaseAnim]         = useState('normal');
  const intervalRef        = useRef(null);
  const dureePrecedenteRef = useRef(null);

  const [vitesse, setVitesse] = useState('moyenne');
  const tickMs       = VITESSES[vitesse].tickMs;
  const transitionMs = VITESSES[vitesse].transitionMs;

  // Onglet actif (Phase 14.2). Quitter l'onglet « Quadrant » met
  // l'animation en pause (les bulles ne défilent pas hors écran).
  const [ongletActif, setOngletActif] = useState('comparaison');
  function changerOnglet(id) {
    if (id !== 'quadrant') setEnLecture(false);
    setOngletActif(id);
  }

  // -------------------- Fetch à l'ouverture --------------------
  useEffect(() => {
    if (!open || !idPaysage || !diplom || !millesime) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setEnLecture(false);
    setPhaseAnim('normal');

    getAnalyseSousPopulations({ id_paysage: idPaysage, diplom, millesime })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        const durees = res?.durees_disponibles || [];
        if (durees.length > 0) {
          // Durée initiale : celle héritée du quadrant si disponible,
          // sinon la première.
          const heritee = Number(initialDateInser);
          const choisie = durees.includes(heritee) ? heritee : durees[0];
          setDureeCourante(choisie);
          dureePrecedenteRef.current = choisie;
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(messageErreur(err));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, idPaysage, diplom, millesime, initialDateInser]);

  // -------------------- Lecture auto --------------------
  useEffect(() => {
    if (!enLecture || !data) return;
    if (phaseAnim !== 'normal') return;
    const durees = data.durees_disponibles || [];
    if (durees.length < 2) return;

    intervalRef.current = setInterval(() => {
      const courant = dureePrecedenteRef.current;
      const i = durees.indexOf(courant);
      if (i === durees.length - 1) {
        lancerBouclage();
      } else {
        setDureeCourante(durees[i + 1]);
      }
    }, tickMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLecture, data, tickMs, phaseAnim]);

  // Bouclage fin de cycle : pause visible à la dernière durée, fade-out,
  // snap à la première durée (transitions coupées), fade-in.
  async function lancerBouclage() {
    const durees = data.durees_disponibles || [];
    if (durees.length < 2) return;
    setPhaseAnim('fade-out');
    await new Promise((r) => setTimeout(r, 400));
    setPhaseAnim('snap');
    setDureeCourante(durees[0]);
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    setPhaseAnim('normal');
  }

  // -------------------- Sync inconditionnel du ref --------------------
  useEffect(() => {
    if (dureeCourante != null) {
      dureePrecedenteRef.current = dureeCourante;
    }
  }, [dureeCourante]);

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

  // -------------------- Handlers contrôles --------------------
  function handlePlayPause() { setEnLecture((p) => !p); }
  function handlePrev() {
    setEnLecture(false);
    const durees = data?.durees_disponibles || [];
    const i = durees.indexOf(dureeCourante);
    if (i > 0) setDureeCourante(durees[i - 1]);
  }
  function handleNext() {
    setEnLecture(false);
    const durees = data?.durees_disponibles || [];
    const i = durees.indexOf(dureeCourante);
    if (i < durees.length - 1) setDureeCourante(durees[i + 1]);
  }
  // Changement de durée via le curseur (clic/glissement) → met en pause et
  // applique la durée (déjà snappée sur une durée disponible par SliderDuree).
  function handleChoisirDuree(d) {
    setEnLecture(false);
    setDureeCourante(d);
  }

  const showLoader = useDelayedLoading(loading);
  if (!open) return null;

  const durees = data?.durees_disponibles || [];
  const blocCourant = data?.donnees_par_duree?.[String(dureeCourante)] || null;
  const refCourante = blocCourant?.reference || null;
  // Données exploitables = au moins une durée ET référence diffusable
  // (sinon toute la mention est sous le seuil → message dédié).
  const donneesUtilisables =
    !!data && durees.length > 0 && !!refCourante && refCourante.diffusable;
  const animationDispo = durees.length >= 2;
  const iCourant = durees.indexOf(dureeCourante);

  const refN = data?.donnees_par_duree?.[String(durees[0])]?.reference?.nb_etudiants;
  // Total des inscrits en année terminale (ensemble/ensemble/ensemble/ensemble)
  // + pourcentage de la référence. nb_total_inscrits peut être absent
  // (mentions à données partielles) → on retombe sur l'affichage sans total.
  const nTotal = data?.contexte?.nb_total_inscrits;
  const pctRef = (nTotal && nTotal > 0 && refN != null)
    ? Math.round((refN / nTotal) * 100)
    : null;

  return (
    <div
      className="modale-asp-overlay"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modale-asp"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modale-asp-titre"
      >
        <header>
          <h2 id="modale-asp-titre">Analyse de l&apos;insertion par sous-population</h2>
          <button
            ref={fermerRef}
            type="button"
            className="bouton-fermer fr-icon-close-line"
            aria-label="Fermer la fenêtre d'analyse"
            onClick={onClose}
          />
        </header>

        {/* Cartouche commun à tous les onglets (Phase 14.3 : bande dédiée
            sous le titre, au-dessus des onglets). */}
        <div className="modale-asp-cartouche">
          <p className="modale-asp-contexte">
            <strong>{etabLabel}</strong>
            {' · '}{formation}
            {mentionLabel ? <>{' · '}{mentionLabel}</> : null}
          </p>
          {donneesUtilisables && (
            <>
              <p className="modale-asp-reference">
                Étudiants inscrits en année terminale en {millesime}
                {nTotal != null ? ` (N = ${nTotal.toLocaleString('fr-FR')})` : ''}
              </p>
              <p className="modale-asp-reference">
                Référence : diplômés français
                {refN != null
                  ? ` (N = ${refN.toLocaleString('fr-FR')}${pctRef != null ? `, soit ${pctRef} %` : ''})`
                  : ''}
              </p>
            </>
          )}
        </div>

        {loading && showLoader && (
          <div className="modale-asp-loading"><LoaderBarre /></div>
        )}
        {loading && !showLoader && (
          <div className="modale-asp-loading" aria-busy="true" />
        )}

        {error && (
          <div className="fr-alert fr-alert--error"><p>{error}</p></div>
        )}

        {!loading && !error && data && !donneesUtilisables && (
          <div className="fr-alert fr-alert--info modale-asp-insuffisant">
            <p>
              Effectifs insuffisants pour l&apos;analyse fine. La population
              de référence (diplômés français) compte moins de
              {' '}{data.contexte?.seuil_applique ?? 20} étudiants, ce qui ne
              permet pas une analyse fiable des sous-populations.
            </p>
          </div>
        )}

        {!loading && !error && donneesUtilisables && (
          <>
            <div className="modale-asp-tabs fr-tabs">
              <ul className="fr-tabs__list" role="tablist" aria-label="Sections de l'analyse">
                {ONGLETS.map((o) => (
                  <li key={o.id} role="presentation">
                    <button
                      id={`tab-${o.id}`}
                      className="fr-tabs__tab"
                      tabIndex={ongletActif === o.id ? 0 : -1}
                      role="tab"
                      aria-selected={ongletActif === o.id}
                      aria-controls={`tabpanel-${o.id}`}
                      onClick={() => changerOnglet(o.id)}
                    >
                      {o.libelle}
                    </button>
                  </li>
                ))}
              </ul>

              {/* Slider de durée COMMUN aux 3 onglets (Phase 14.6) : posé
                  sous la barre d'onglets, au-dessus du contenu. Pilote
                  l'état partagé `dureeCourante` ; un déplacement manuel met
                  l'animation en pause (handleChoisirDuree). */}
              {animationDispo && (
                <div className="modale-asp-slider-commun">
                  <SliderDuree
                    valeurs={durees}
                    valeur={dureeCourante}
                    onChanger={handleChoisirDuree}
                    idBase="asp-duree"
                    libelle="Observation à"
                    suffixe=" mois"
                  />
                </div>
              )}

              <div
                id="tabpanel-comparaison"
                className={'fr-tabs__panel' + (ongletActif === 'comparaison' ? ' fr-tabs__panel--selected' : '')}
                role="tabpanel"
                aria-labelledby="tab-comparaison"
                tabIndex={0}
              >
                <TableauEcarts
                  bloc={blocCourant}
                  seuil={data.contexte?.seuil_applique}
                />
              </div>

              <div
                id="tabpanel-quadrant"
                className={'fr-tabs__panel' + (ongletActif === 'quadrant' ? ' fr-tabs__panel--selected' : '')}
                role="tabpanel"
                aria-labelledby="tab-quadrant"
                tabIndex={0}
              >
                <MiniQuadrantSousPop
                  donneesParDuree={data.donnees_par_duree}
                  dureesDisponibles={durees}
                  dureeCourante={dureeCourante}
                  phaseAnim={phaseAnim}
                  dureeTransitionMs={transitionMs}
                  enLecture={enLecture}
                />

                {animationDispo && (
                  /* Contrôles sur UNE ligne (Phase 14.7) : lecture à gauche,
                     vitesse à droite — même structure que la modale d'animation
                     temporelle (Mentions/Positionnement). */
                  <div className="modale-asp-controls">
                    <div className="modale-asp-controls-lecture">
                      <button
                        type="button"
                        className="fr-btn fr-btn--sm fr-btn--tertiary"
                        onClick={handlePrev}
                        disabled={iCourant <= 0}
                        aria-label="Durée précédente"
                      >⏮</button>
                      <button
                        type="button"
                        className="fr-btn fr-btn--sm"
                        onClick={handlePlayPause}
                        aria-label={enLecture ? 'Pause' : 'Lecture'}
                      >{enLecture ? '⏸ Pause' : '▶ Lecture'}</button>
                      <button
                        type="button"
                        className="fr-btn fr-btn--sm fr-btn--tertiary"
                        onClick={handleNext}
                        disabled={iCourant >= durees.length - 1}
                        aria-label="Durée suivante"
                      >⏭</button>
                    </div>

                    <fieldset className="fr-segmented fr-segmented--sm modale-asp-vitesse">
                      <legend className="fr-segmented__legend">Vitesse</legend>
                      <div className="fr-segmented__elements">
                        {Object.entries(VITESSES).map(([code, conf]) => {
                          const id = `modale-asp-vitesse-${code}`;
                          return (
                            <div key={code} className="fr-segmented__element">
                              <input
                                type="radio"
                                id={id}
                                name="modale-asp-vitesse"
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
                )}
              </div>

              <div
                id="tabpanel-parcours"
                className={'fr-tabs__panel' + (ongletActif === 'parcours' ? ' fr-tabs__panel--selected' : '')}
                role="tabpanel"
                aria-labelledby="tab-parcours"
                tabIndex={0}
              >
                <SankeyParcoursSousPop
                  data={blocCourant?.sankey}
                  dureeCourante={dureeCourante}
                  seuilDiffusion={data.contexte?.seuil_applique}
                />
              </div>
            </div>

            <p className="modale-asp-source">
              {LIBELLE_SOURCE} · {MENTION_DIFFUSION}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
