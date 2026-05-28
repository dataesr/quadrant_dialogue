import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { trackEvent } from '../utils/matomo.js';
import ReferentielSelect from './selectors/ReferentielSelect.jsx';
import TypeMasterSelect from './selectors/TypeMasterSelect.jsx';
import ModaleMethodologie from './ModaleMethodologie.jsx';
import ModaleAnimation from './ModaleAnimation.jsx';

// Panneau de filtres avancés, replié par défaut. S'ouvre automatiquement
// dès qu'au moins un filtre est positionné différemment de son défaut.
// Le titre indique le nombre de filtres avancés actifs.
//
// On ne réutilise pas le composant DSFR fr-accordion : il s'appuie sur du
// JS qui s'attache au DOM au chargement, ce qui ne joue pas bien avec un
// arbre React qui se reconstruit. On gère la collapse à la main, en
// gardant les styles DSFR (fr-collapse, fr-collapse--expanded, fr-btn).
//
// Layout : utilisé dans le panneau latéral (.panneau-filtres, 280 px de
// large) → contenu en colonne unique, chaque sélecteur prenant toute la
// largeur de la colonne.

// IMPORTANT : ces constantes DOIVENT rester alignées avec celles
// d'AppContext.jsx, sinon le compteur de filtres actifs est faux dès
// le chargement (un filtre paraîtra actif alors qu'il est à son
// défaut).
const DEFAULT_REPRESENTATIVITE              = false;
const DEFAULT_REFERENCE_AXES                = 'mediane_etab';
const DEFAULT_REFERENCE_AXES_POSITIONNEMENT = 'mediane';

export default function AdvancedFilters() {
  const {
    etabContexte, etabInfo,
    vue, cursus, millesime,
    referentiels,
    domaine, discipline, secteur, mention,
    typeMaster,
    representativite,
    referenceAxes, setReferenceAxes,
    referenceAxesPositionnement, setReferenceAxesPositionnement,
    setDomaine, setDiscipline, setSecteur,
    setRepresentativite,
    memeTypologie, setMemeTypologie,
    afficherDistributions, setAfficherDistributions,
    resetAdvancedFilters,
  } = useApp();

  function ouvrirModaleMethodologie() {
    setModaleMethodOpen(true);
    trackEvent('Méthodologie', 'ouverture_modale', null, {
      etab: etabInfo?.libelle,
      vue,
      cursus,
      millesime,
    });
  }

  const [open, setOpen] = useState(false);
  const [modaleMethodOpen, setModaleMethodOpen] = useState(false);
  const [modaleAnimOpen,   setModaleAnimOpen]   = useState(false);
  const disabled = !etabContexte;

  // Nombre de filtres avancés en écart par rapport à leur défaut.
  // referenceAxes ne compte que sur vue=mentions, referenceAxesPositionnement
  // sur vue=etablissements (les contrôles ne sont affichés que dans leur
  // vue respective — l'autre reste à son défaut sans visibilité).
  const activeCount = useMemo(() => {
    let n = 0;
    if (domaine     !== null) n++;
    if (discipline  !== null) n++;
    if (secteur     !== null) n++;
    if (mention     !== null) n++;
    if (cursus === 'Master' && typeMaster !== null) n++;
    if (representativite !== DEFAULT_REPRESENTATIVITE) n++;
    if (vue === 'etablissements' && memeTypologie) n++;
    if (vue === 'mentions' && referenceAxes !== DEFAULT_REFERENCE_AXES) n++;
    if (vue === 'etablissements'
        && referenceAxesPositionnement !== DEFAULT_REFERENCE_AXES_POSITIONNEMENT) n++;
    return n;
  }, [domaine, discipline, secteur, mention, cursus, typeMaster,
      representativite, memeTypologie, vue, referenceAxes, referenceAxesPositionnement]);

  // Auto-dépli quand un filtre devient actif (au montage si l'utilisateur
  // recharge avec un état pré-positionné, ou en cours d'utilisation).
  useEffect(() => {
    if (activeCount > 0) setOpen(true);
  }, [activeCount]);

  const disciData = referentiels.disciplinaire.data;
  const disciLoading = referentiels.disciplinaire.loading;

  // Renommage volontaire : « options » plutôt que « filtres ». Le panneau
  // inclut aussi des contrôles d'affichage (Ligne de référence,
  // Représentativité) qui ne sont pas des filtres au sens strict. L'accord
  // au féminin (« active(s) ») suit naturellement.
  const title =
    activeCount > 0
      ? `Plus d'options (${activeCount} active${activeCount > 1 ? 's' : ''})`
      : "Plus d'options";

  const chevron = open ? 'fr-icon-arrow-up-s-line' : 'fr-icon-arrow-down-s-line';

  return (
    <section>
      <button
        type="button"
        className={`fr-btn fr-btn--tertiary-no-outline fr-btn--icon-left ${chevron}`}
        aria-expanded={open}
        aria-controls="quadrant-advanced-filters"
        onClick={() => setOpen((v) => !v)}
      >
        {title}
      </button>

      <div
        id="quadrant-advanced-filters"
        className={`fr-collapse${open ? ' fr-collapse--expanded' : ''}`}
        style={{ display: open ? 'block' : 'none' }}
      >
        <div className="liste-filtres-avances fr-pt-2w">
          {/* Référentiels disciplinaires — 4 sélecteurs indépendants en colonne. */}
          <ReferentielSelect
            id="quadrant-domaine"
            label="Domaine"
            defaultLabel="Tous"
            items={disciData?.domaines}
            value={domaine}
            onChange={setDomaine}
            disabled={disabled}
            loading={disciLoading}
          />
          <ReferentielSelect
            id="quadrant-discipline"
            label="Discipline"
            defaultLabel="Toutes"
            items={disciData?.disciplines}
            value={discipline}
            onChange={setDiscipline}
            disabled={disabled}
            loading={disciLoading}
          />
          <ReferentielSelect
            id="quadrant-secteur"
            label="Secteur"
            defaultLabel="Tous"
            items={disciData?.secteurs}
            value={secteur}
            onChange={setSecteur}
            disabled={disabled}
            loading={disciLoading}
          />
          {/* Le filtre Mention (vue Positionnement) a été remonté
              hors d'AdvancedFilters dans le panneau principal — il
              reste visible quel que soit l'état du toggle « Plus
              d'options » et quel que soit le mode d'affichage
              (Graphique / Tableau). Cf. App.jsx +
              MentionFilterCombobox.jsx. */}

          {/* Options diverses (Master only pour TypeMaster, sinon caché). */}
          {cursus === 'Master' && <TypeMasterSelect disabled={disabled} />}

          <div className="fr-checkbox-group">
            <input
              type="checkbox"
              id="quadrant-representativite"
              checked={representativite}
              onChange={(e) => setRepresentativite(e.target.checked)}
              disabled={disabled}
            />
            <label className="fr-label" htmlFor="quadrant-representativite">
              Représentatif uniquement (denom ≥ 20)
            </label>
          </div>

          {/* Vue Positionnement uniquement : restreint les étabs
              affichés à ceux qui partagent la typologie de l'étab de
              contexte. La typologie est lue côté backend à partir
              d'etab_contexte — pas besoin de la dupliquer côté state.
              En vue Mentions, n'apparaît pas (toutes les bulles
              proviennent d'un seul étab, le filtre n'aurait pas de
              sens). */}
          {vue === 'etablissements' && (
            <div className="fr-checkbox-group">
              <input
                type="checkbox"
                id="quadrant-meme-typologie"
                checked={memeTypologie}
                onChange={(e) => setMemeTypologie(e.target.checked)}
                disabled={disabled}
              />
              <label className="fr-label" htmlFor="quadrant-meme-typologie">
                Établissements de même typologie uniquement
              </label>
            </div>
          )}

          {/* Affichage des histogrammes de distribution sur les bords
              haut/droit. Hors filtre — pas pris en compte dans
              `activeCount` (option d'affichage purement visuelle). */}
          <div className="fr-checkbox-group">
            <input
              type="checkbox"
              id="quadrant-afficher-distributions"
              checked={afficherDistributions}
              onChange={(e) => setAfficherDistributions(e.target.checked)}
              disabled={disabled}
            />
            <label className="fr-label" htmlFor="quadrant-afficher-distributions">
              Afficher les distributions
            </label>
          </div>

          {/* Référence des axes — vue Mentions uniquement.
              En vue Positionnement, les axes sont déjà calculés sur
              l'ensemble France (cf. data.reference côté API), le
              sélecteur n'a pas de sens et reste masqué.

              Layout vertical via fr-radio-group plutôt que segment
              control : les libellés complets (« Moyenne nationale »
              etc.) débordent du panneau latéral 280 px en disposition
              horizontale. */}
          {vue === 'mentions' && (
            <fieldset className="fr-fieldset" disabled={disabled}>
              <legend className="fr-fieldset__legend">Référence des axes</legend>
              {[
                { value: 'mediane_etab',      label: 'Médiane établissement' },
                { value: 'moyenne_etab',      label: 'Moyenne établissement' },
                { value: 'moyenne_nationale', label: 'Moyenne nationale'     },
              ].map((opt) => {
                const inputId = `quadrant-reference-axes-${opt.value}`;
                // Markup DSFR conforme : fr-fieldset__element wrappe
                // chaque fr-radio-group. Sans cette structure, le CSS
                // DSFR ne stylise pas les radios (apparence « lune »
                // partiellement remplie au lieu du cercle plein
                // attendu). Cf.
                // https://www.systeme-de-design.gouv.fr/elements-d-interface/composants/case-a-cocher-et-bouton-radio/
                return (
                  <div key={opt.value} className="fr-fieldset__element">
                    <div className="fr-radio-group">
                      <input
                        type="radio"
                        id={inputId}
                        name="quadrant-reference-axes"
                        value={opt.value}
                        checked={referenceAxes === opt.value}
                        onChange={() => setReferenceAxes(opt.value)}
                      />
                      <label className="fr-label" htmlFor={inputId}>
                        {opt.label}
                      </label>
                    </div>
                  </div>
                );
              })}
            </fieldset>
          )}

          {/* Vue Positionnement : 2 options (Médiane / Moyenne).
              Pas de suffixe « nationale » dans les libellés — la vue
              est nationale par construction (pas de filtre étab), donc
              implicite. Distinct du sélecteur Mentions ci-dessus (3
              modes) pour éviter toute confusion. Propagé au backend
              via le paramètre `agregation` de /api/quadrant. */}
          {vue === 'etablissements' && (
            <fieldset className="fr-fieldset" disabled={disabled}>
              <legend className="fr-fieldset__legend">Référence des axes</legend>
              {[
                { value: 'mediane', label: 'Médiane' },
                { value: 'moyenne', label: 'Moyenne' },
              ].map((opt) => {
                const inputId = `quadrant-reference-axes-pos-${opt.value}`;
                return (
                  <div key={opt.value} className="fr-fieldset__element">
                    <div className="fr-radio-group">
                      <input
                        type="radio"
                        id={inputId}
                        name="quadrant-reference-axes-positionnement"
                        value={opt.value}
                        checked={referenceAxesPositionnement === opt.value}
                        onChange={() => setReferenceAxesPositionnement(opt.value)}
                      />
                      <label className="fr-label" htmlFor={inputId}>
                        {opt.label}
                      </label>
                    </div>
                  </div>
                );
              })}
            </fieldset>
          )}

          <button
            type="button"
            className="fr-btn fr-btn--secondary fr-btn--sm"
            onClick={resetAdvancedFilters}
            disabled={disabled || activeCount === 0}
          >
            Réinitialiser les filtres
          </button>
        </div>
      </div>

      {/* Bouton « Voir l'évolution » + Méthodologie en pied du
          panneau d'options. Posés en pied pour rester visibles quel
          que soit l'état (replié / déplié) du panneau avancé.
          Animation au-dessus de Méthodologie (Phase 11b). */}
      <button
        type="button"
        className="fr-btn fr-btn--sm fr-btn--secondary fr-btn--icon-left fr-icon-play-fill bouton-voir-evolution"
        onClick={() => setModaleAnimOpen(true)}
        disabled={!etabContexte}
      >
        Voir l&apos;évolution
      </button>
      {modaleAnimOpen && (
        <ModaleAnimation open onClose={() => setModaleAnimOpen(false)} />
      )}
      <button
        type="button"
        className="fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-btn--icon-left fr-icon-question-line bouton-methodologie"
        onClick={ouvrirModaleMethodologie}
      >
        Méthodologie
      </button>
      <ModaleMethodologie
        open={modaleMethodOpen}
        onClose={() => setModaleMethodOpen(false)}
      />
    </section>
  );
}
