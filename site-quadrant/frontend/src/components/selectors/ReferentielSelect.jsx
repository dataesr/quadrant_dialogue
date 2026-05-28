// Sélecteur générique pour les listes du référentiel disciplinaire :
// Domaine, Discipline, Secteur, Mention.
//
// Filtrage en cascade : un appelant peut passer `isItemDisabled` pour
// griser les items incompatibles avec une sélection upstream. Ex.
// quand Domaine=STS est choisi, les disciplines hors STS sont
// passées en `disabled` dans le <option>. L'utilisateur les voit mais
// ne peut pas les sélectionner.
//
// Props :
//  - id             : id technique (pour htmlFor)
//  - label          : libellé visible (ex : "Domaine")
//  - defaultLabel   : texte de l'option par défaut (ex : "Tous", "Toutes")
//  - items          : tableau d'objets {code, libelle, ...} — les
//                     propriétés additionnelles (dom_code, discipli_code…)
//                     sont utilisées par `isItemDisabled` côté appelant.
//  - value          : code courant ou null
//  - onChange       : (newCode) => void  — null si option par défaut
//  - disabled       : booléen — grise tout le groupe
//  - loading        : true tant que la liste charge
//  - isItemDisabled : (item) => boolean — optionnel, grise un item
//                     spécifique dans la liste sans désactiver le
//                     groupe entier.

export default function ReferentielSelect({
  id,
  label,
  defaultLabel,
  items,
  value,
  onChange,
  disabled = false,
  loading = false,
  isItemDisabled = null,
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
          <option
            key={item.code}
            value={item.code}
            disabled={typeof isItemDisabled === 'function' ? isItemDisabled(item) : false}
          >
            {item.libelle || item.code}
          </option>
        ))}
      </select>
    </div>
  );
}
