import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import ReferentielSelect from './selectors/ReferentielSelect.jsx';
import TypeMasterSelect from './selectors/TypeMasterSelect.jsx';
import BinaryToggle from './selectors/BinaryToggle.jsx';

// Panneau de filtres avancés, replié par défaut. S'ouvre automatiquement
// dès qu'au moins un filtre est positionné différemment de son défaut.
// Le titre indique le nombre de filtres avancés actifs.
//
// On ne réutilise pas le composant DSFR fr-accordion : il s'appuie sur du
// JS qui s'attache au DOM au chargement, ce qui ne joue pas bien avec une
// arbre React qui se reconstruit. On gère la collapse à la main, en
// gardant les styles DSFR (fr-collapse, fr-collapse--expanded, fr-btn).

const DEFAULT_REPRESENTATIVITE = true;
const DEFAULT_LIGNE_REFERENCE  = 'mediane';

export default function AdvancedFilters() {
  const {
    etabContexte,
    cursus,
    referentiels,
    domaine, discipline, secteur, mention,
    typeMaster,
    representativite, ligneReference,
    setDomaine, setDiscipline, setSecteur, setMention,
    setRepresentativite, setLigneReference,
    resetAdvancedFilters,
  } = useApp();

  const [open, setOpen] = useState(false);
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

  const title =
    activeCount > 0
      ? `Plus de filtres (${activeCount} actif${activeCount > 1 ? 's' : ''})`
      : 'Plus de filtres';

  const chevron = open ? 'fr-icon-arrow-up-s-line' : 'fr-icon-arrow-down-s-line';

  return (
    <section className="fr-mb-2w">
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
        <div className="fr-pt-2w">
          {/* Ligne 1 : référentiels disciplinaires (4 colonnes indépendantes) */}
          <div className="fr-grid-row fr-grid-row--gutters">
            <div className="fr-col-12 fr-col-md-3">
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
            </div>
            <div className="fr-col-12 fr-col-md-3">
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
            </div>
            <div className="fr-col-12 fr-col-md-3">
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
            </div>
            <div className="fr-col-12 fr-col-md-3">
              <ReferentielSelect
                id="quadrant-mention"
                label="Mention"
                defaultLabel="Toutes"
                items={disciData?.mentions}
                value={mention}
                onChange={setMention}
                disabled={disabled}
                loading={disciLoading}
              />
            </div>
          </div>

          {/* Ligne 2 : options diverses */}
          <div className="fr-grid-row fr-grid-row--gutters fr-mt-2w">
            {cursus === 'Master' && (
              <div className="fr-col-12 fr-col-md-4">
                <TypeMasterSelect disabled={disabled} />
              </div>
            )}
            <div className="fr-col-12 fr-col-md-4">
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
            </div>
            <div className="fr-col-12 fr-col-md-4">
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
            </div>
          </div>

          {/* Bouton de réinitialisation aligné à droite */}
          <div className="fr-grid-row fr-grid-row--right fr-mt-2w">
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
      </div>
    </section>
  );
}
