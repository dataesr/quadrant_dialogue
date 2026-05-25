import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import ReferentielSelect from './selectors/ReferentielSelect.jsx';
import TypeMasterSelect from './selectors/TypeMasterSelect.jsx';
import BinaryToggle from './selectors/BinaryToggle.jsx';
import MentionFilterCombobox from './MentionFilterCombobox.jsx';
import ModaleMethodologie from './ModaleMethodologie.jsx';

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

// IMPORTANT : ces deux constantes DOIVENT rester alignées avec celles
// d'AppContext.jsx, sinon le compteur de filtres actifs est faux dès le
// chargement (un filtre paraîtra actif alors qu'il est à son défaut).
const DEFAULT_REPRESENTATIVITE = false;
const DEFAULT_LIGNE_REFERENCE  = 'mediane';

export default function AdvancedFilters() {
  const {
    etabContexte,
    cursus,
    referentiels,
    domaine, discipline, secteur, mention,
    typeMaster,
    representativite, ligneReference,
    scaleMode,
    setDomaine, setDiscipline, setSecteur,
    setRepresentativite, setLigneReference,
    setScaleMode,
    resetAdvancedFilters,
  } = useApp();

  const [open, setOpen] = useState(false);
  const [modaleMethodOpen, setModaleMethodOpen] = useState(false);
  const disabled = !etabContexte;

  // Nombre de filtres avancés en écart par rapport à leur défaut.
  const activeCount = useMemo(() => {
    let n = 0;
    if (domaine     !== null) n++;
    if (discipline  !== null) n++;
    if (secteur     !== null) n++;
    if (mention     !== null) n++;
    if (cursus === 'Master' && typeMaster !== null) n++;
    if (representativite !== DEFAULT_REPRESENTATIVITE) n++;
    if (ligneReference   !== DEFAULT_LIGNE_REFERENCE)  n++;
    return n;
  }, [domaine, discipline, secteur, mention, cursus, typeMaster,
      representativite, ligneReference]);

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
          {/* Filtre Mention : utile seulement en vue Établissements +
              Graphique (cible une mention précise pour comparer les
              étabs sur cette mention).
              - Vue Mentions : chaque bulle est déjà une mention, le
                filtre serait redondant (et l'API l'ignore).
              - Vue Positionnement + Tableau : le tableau liste des
                établissements ; un filtre mention compliquerait la
                lecture sans bénéfice clair. À ré-évaluer si le besoin
                remonte.
              Combobox dédié (cf. MentionFilterCombobox) : autocomplete
              + liste restreinte aux mentions de l'étab de référence
              (et non l'ensemble du cursus, beaucoup trop large). */}
          <MentionFilterCombobox disabled={disabled} />

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

          <BinaryToggle
            id="quadrant-ligne-ref"
            legend="Ligne de référence"
            options={[
              { value: 'mediane', label: 'Médiane' },
              { value: 'moyenne', label: 'Moyenne' },
            ]}
            value={ligneReference}
            onChange={setLigneReference}
            disabled={disabled}
          />

          {/* TEMPORAIRE — sélecteur d'échelle de bulle pour comparaison
              visuelle. Sera supprimé après validation d'un mode unique. */}
          <div className="fr-select-group">
            <label className="fr-label" htmlFor="quadrant-scale-mode">
              Échelle des bulles (temporaire)
            </label>
            <select
              id="quadrant-scale-mode"
              className="fr-select"
              value={scaleMode}
              onChange={(e) => setScaleMode(e.target.value)}
              disabled={disabled}
            >
              <option value="sqrt">sqrt (racine carrée)</option>
              <option value="paliers">paliers (escalier)</option>
              <option value="cbrt">cbrt (racine cubique)</option>
              <option value="lineaire">linéaire clampé</option>
            </select>
          </div>

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

      {/* Lien vers la méthodologie complète. Posé en pied du panneau
          d'options pour rester visible quel que soit l'état (replié /
          déplié) du panneau avancé. */}
      <button
        type="button"
        className="fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-btn--icon-left fr-icon-question-line bouton-methodologie"
        onClick={() => setModaleMethodOpen(true)}
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
