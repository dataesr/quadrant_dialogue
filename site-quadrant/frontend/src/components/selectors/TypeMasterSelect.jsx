import { useApp } from '../../context/AppContext.jsx';

// Sélecteur Type de Master. Visible uniquement quand cursus === 'Master'
// (l'API ignore ce paramètre pour les autres cursus, mais autant ne pas
// afficher du contrôle inutile à l'utilisateur).
//
// Valeurs API attendues côté /quadrant : 'Master enseignement' |
// 'Master hors enseignement'. L'option par défaut « Tous » correspond à
// « pas de filtre » côté API (paramètre vide).

const OPTIONS = [
  { value: 'Master enseignement',      label: 'Master enseignement' },
  { value: 'Master hors enseignement', label: 'Master hors enseignement' },
];

export default function TypeMasterSelect({ disabled = false }) {
  const { cursus, typeMaster, setTypeMaster } = useApp();

  if (cursus !== 'Master') {
    return null;
  }

  return (
    <div className={`fr-select-group${disabled ? ' fr-select-group--disabled' : ''}`}>
      <label className="fr-label" htmlFor="quadrant-type-master">
        Type de Master
      </label>
      <select
        id="quadrant-type-master"
        className="fr-select"
        value={typeMaster || ''}
        onChange={(e) => setTypeMaster(e.target.value === '' ? null : e.target.value)}
        disabled={disabled}
      >
        <option value="">Tous</option>
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
