// Sélecteur de variable d'axe (X ou Y). Les options sont calculées par
// l'appelant (FilterBar) à partir de `couples_autorises` — l'interdépendance
// X↔Y reste donc maîtrisée à un seul endroit.
//
// Props :
//  - axis      : 'X' | 'Y' (label affiché)
//  - value     : libellé courant (string | null)
//  - options   : tableau d'objets { libelle, declinable_delai? }
//  - onChange  : (newLibelle) => void
//  - disabled  : booléen
//  - loading   : true tant que le référentiel charge

export default function VariableSelect({
  axis,
  value,
  options,
  onChange,
  disabled = false,
  loading = false,
}) {
  const groupDisabled = disabled || loading || options.length === 0;
  const id = `quadrant-variable-${axis.toLowerCase()}`;

  return (
    <div className={`fr-select-group${groupDisabled ? ' fr-select-group--disabled' : ''}`}>
      <label className="fr-label" htmlFor={id}>
        Variable {axis}
        {loading && <span className="fr-hint-text">Chargement…</span>}
      </label>
      <select
        id={id}
        className="fr-select"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={groupDisabled}
      >
        {value === null && (
          <option value="" disabled>
            —
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.libelle} value={opt.libelle}>
            {opt.libelle}
          </option>
        ))}
      </select>
    </div>
  );
}
