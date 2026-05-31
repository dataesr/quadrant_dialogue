import { useApp } from '../../context/AppContext.jsx';

// Sélecteur Type de Master.
//
// Visible TOUJOURS dans le panneau « Plus d'options », mais désactivé
// avec mention « (non disponible) » quand le cursus n'est pas Master.
// Permet à l'utilisateur de voir d'un coup d'œil l'ensemble des filtres
// disponibles dans l'app et de comprendre pourquoi certains sont
// inaccessibles dans le contexte courant, plutôt que de découvrir des
// filtres qui apparaissent/disparaissent en changeant d'onglet.
//
// Valeurs API attendues côté /quadrant : 'Master enseignement' |
// 'Master hors enseignement'. L'option par défaut « Tous » correspond à
// « pas de filtre » côté API (paramètre vide).

const OPTIONS = [
  { value: 'Master enseignement',      label: 'Master enseignement' },
  { value: 'Master hors enseignement', label: 'Master hors enseignement' },
];

export default function TypeMasterSelect({ disabled = false, disponibles = null }) {
  const { cursus, typeMaster, setTypeMaster } = useApp();

  const nonApplicable = cursus !== 'Master';
  const isDisabled    = disabled || nonApplicable;
  const labelText     = nonApplicable
    ? 'Type de Master (non disponible — cursus Master uniquement)'
    : 'Type de Master';

  // Grisage par établissement de référence (Phase 14.9, vue Positionnement) :
  // `disponibles` = Set des types de Master présents dans l'établissement.
  const setDispo = disponibles ? new Set(disponibles) : null;
  const TITRE_ABSENT = "Aucune mention de cette modalité dans l'établissement de référence";

  return (
    <div className={`fr-select-group${isDisabled ? ' fr-select-group--disabled' : ''}`}>
      <label className="fr-label" htmlFor="quadrant-type-master">
        {labelText}
      </label>
      <select
        id="quadrant-type-master"
        className="fr-select"
        value={typeMaster || ''}
        onChange={(e) => setTypeMaster(e.target.value === '' ? null : e.target.value)}
        disabled={isDisabled}
      >
        <option value="">Tous</option>
        {OPTIONS.map((opt) => {
          const absent = setDispo ? !setDispo.has(opt.value) : false;
          return (
            <option
              key={opt.value}
              value={opt.value}
              disabled={absent}
              title={absent ? TITRE_ABSENT : undefined}
            >
              {opt.label}
            </option>
          );
        })}
      </select>
    </div>
  );
}
