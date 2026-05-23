// Toggle binaire générique basé sur le contrôle segmenté DSFR. Utilisé pour
// le choix Médiane / Moyenne de la ligne de référence (et réutilisable
// ailleurs si besoin).
//
// Props :
//  - id        : préfixe identifiant pour les radios (rendu unique entre
//                instances multiples sur la même page)
//  - legend    : libellé visible au-dessus du segmented
//  - options   : tableau de { value, label } — exactement 2 (par convention)
//  - value     : valeur courante
//  - onChange  : (newValue) => void
//  - disabled  : booléen

export default function BinaryToggle({
  id,
  legend,
  options,
  value,
  onChange,
  disabled = false,
}) {
  return (
    <fieldset className="fr-segmented fr-segmented--sm" disabled={disabled}>
      <legend className="fr-segmented__legend">{legend}</legend>
      <div className="fr-segmented__elements">
        {options.map((opt) => {
          const inputId = `${id}-${opt.value}`;
          return (
            <div className="fr-segmented__element" key={opt.value}>
              <input
                type="radio"
                name={id}
                id={inputId}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
              />
              <label className="fr-label" htmlFor={inputId}>
                {opt.label}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
