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

export default function AdvancedFilters() {
  const {
    etabContexte, etabInfo,
    vue, cursus, millesime,
    referentiels,
    domaine, discipline, secteur, mention,
    typeMaster,
    representativite,
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
  // La référence des axes ne compte PLUS ici : elle a été sortie du
  // panneau « Plus d'options » (Phase 15.1) vers un sélecteur visible
  // sous le quadrant (cf. ReferenceAxesSelector.jsx).
  const activeCount = useMemo(() => {
    let n = 0;
    if (domaine     !== null) n++;
    if (discipline  !== null) n++;
    if (secteur     !== null) n++;
    if (mention     !== null) n++;
    if (cursus === 'Master' && typeMaster !== null) n++;
    if (representativite !== DEFAULT_REPRESENTATIVITE) n++;
    if (vue === 'etablissements' && memeTypologie) n++;
    return n;
  }, [domaine, discipline, secteur, mention, cursus, typeMaster,
      representativite, memeTypologie, vue]);

  // Auto-dépli quand un filtre devient actif (au montage si l'utilisateur
  // recharge avec un état pré-positionné, ou en cours d'utilisation).
  useEffect(() => {
    if (activeCount > 0) setOpen(true);
  }, [activeCount]);

  const disciData = referentiels.disciplinaire.data;
  const disciLoading = referentiels.disciplinaire.loading;

  // Grisage par établissement de référence (Phase 14.9). `disponibles` =
  // modalités présentes dans l'établissement du sélecteur global
  // (etabContexte), renvoyé par /referentiel/disciplinaire. Appliqué dans
  // LES DEUX vues : l'établissement de référence pilote le grisage partout
  // (Quadrant = dialogue établissement par établissement). null tant qu'aucun
  // établissement n'est sélectionné (rectorat/national sans choix) → toutes
  // les modalités actives.
  const disponibles = disciData?.disponibles || null;
  const dispoDom      = disponibles ? new Set(disponibles.dom)      : null;
  const dispoDiscipli = disponibles ? new Set(disponibles.discipli) : null;
  const dispoSecteur  = disponibles ? new Set(disponibles.secteur)  : null;
  const TITRE_ABSENT = "Aucune mention de cette modalité dans l'établissement de référence";
  const titreSiAbsent = (set) =>
    set ? (it) => (!set.has(it.code) ? TITRE_ABSENT : undefined) : null;

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
      {/* « Voir l'évolution » placé AU-DESSUS du toggle « Plus
          d'options » plutôt qu'en pied de section : c'est une action
          de premier plan (ouverture de la modale d'animation
          temporelle), elle gagne en visibilité ici. Disabled tant
          qu'aucun étab n'est sélectionné — cohérent avec les autres
          contrôles du panneau. */}
      <button
        type="button"
        className="fr-btn fr-btn--sm fr-btn--secondary fr-btn--icon-left fr-icon-play-fill bouton-voir-evolution"
        onClick={() => {
          trackEvent('Animation temporelle', 'ouverture_modale', null, {
            etab: etabInfo?.libelle, vue, cursus, millesime,
          });
          setModaleAnimOpen(true);
        }}
        disabled={!etabContexte}
      >
        Voir l&apos;évolution
      </button>
      {modaleAnimOpen && (
        <ModaleAnimation open onClose={() => setModaleAnimOpen(false)} />
      )}

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
            /* Grisage par établissement de référence (vue Positionnement) :
               domaines absents de l'établissement sélectionné. */
            isItemDisabled={dispoDom ? (it) => !dispoDom.has(it.code) : null}
            itemTitle={titreSiAbsent(dispoDom)}
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
            /* Filtrage en cascade (Domaine → Discipline) combiné au grisage
               par établissement de référence. Items portent `dom_code`. */
            isItemDisabled={
              (domaine || dispoDiscipli)
                ? (it) =>
                    (domaine && it.dom_code !== domaine) ||
                    (dispoDiscipli && !dispoDiscipli.has(it.code))
                : null
            }
            itemTitle={titreSiAbsent(dispoDiscipli)}
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
            /* Cascade (Domaine + Discipline) combinée au grisage par
               établissement de référence. */
            isItemDisabled={
              (domaine || discipline || dispoSecteur)
                ? (it) =>
                    (domaine    && it.dom_code      !== domaine) ||
                    (discipline && it.discipli_code !== discipline) ||
                    (dispoSecteur && !dispoSecteur.has(it.code))
                : null
            }
            itemTitle={titreSiAbsent(dispoSecteur)}
          />
          {/* Le filtre Mention (vue Positionnement) a été remonté
              hors d'AdvancedFilters dans le panneau principal — il
              reste visible quel que soit l'état du toggle « Plus
              d'options » et quel que soit le mode d'affichage
              (Graphique / Tableau). Cf. App.jsx +
              MentionFilterCombobox.jsx. */}

          {/* Options diverses. TypeMasterSelect gère lui-même sa
              désactivation hors cursus Master (libellé enrichi
              « (non disponible) ») pour rester visible et discoverable. */}
          <TypeMasterSelect disabled={disabled} disponibles={disponibles?.master || null} />

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

          {/* Filtre « Même typologie uniquement » — vue Positionnement
              uniquement. Caché en vue Mentions (toutes les bulles
              proviennent d'un seul étab, le filtre n'a pas de sens).
              L'état interne `memeTypologie` est préservé : si l'on
              repasse en vue Positionnement le réglage revient tel quel. */}
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

          {/* Le sélecteur « Référence des axes » a été déplacé hors de
              ce panneau (Phase 15.1, repositionné 15.2) — il est désormais
              visible en haut, au-dessus de la zone filtres/quadrant.
              Cf. ReferenceAxesSelector.jsx. */}

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

      {/* « Voir l'évolution » est désormais au-dessus du toggle
          « Plus d'options ». Méthodologie reste en pied (rôle
          secondaire). */}
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
