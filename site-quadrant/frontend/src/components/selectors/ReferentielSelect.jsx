// Sélecteur générique pour les listes du référentiel disciplinaire :
// Domaine, Discipline, Secteur, Mention. Les 4 listes restent indépendantes
// (pas de cascade), conformément à la spec phase 3.
//
// Props :
//  - id          : id technique (pour htmlFor)
//  - label       : libellé visible (ex : "Domaine")
//  - defaultLabel: texte de l'option par défaut (ex : "Tous", "Toutes")
//  - items       : tableau d'objets {code, libelle} (et éventuellement
//                  d'autres propriétés, ignorées ici)
//  - value       : code courant ou null
//  - onChange    : (newCode) => void  — null si l'option par défaut sélectionnée
//  - disabled    : booléen
//  - loading     : true tant que la liste charge

export default function ReferentielSelect({
  id,
  label,
  defaultLabel,
  items,
  value,
  onChange,
  disabled = false,
  loading = false,
}) {
  const list = Array.isArray(items) ? items : [];
  const groupDisabled = disabled || loading;

  return (
    <div className={`fr-select-group${groupDisabled ? ' fr-select-group--disabled' : ''}`}>
      <label className="fr-label" htmlFor={id}>
        {label}
        {loading && <span className="fr-hint-text">Chargement…</span>}
      </label>
      <select
        id={id}
        className="fr-select"
        value={value || ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        disabled={groupDisabled}
      >
        <option value="">{defaultLabel}</option>
        {list.map((item) => (
          <option key={item.code} value={item.code}>
            {item.libelle || item.code}
          </option>
        ))}
      </select>
    </div>
  );
}
