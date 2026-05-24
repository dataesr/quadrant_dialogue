// Sélecteur de date d'insertion — visible seulement quand la variable
// associée est déclinable. Liste alimentée par dates_insertion du
// référentiel /referentiel/variables, fallback '6/12/18/24/30'.

const DATES_FALLBACK = ['6', '12', '18', '24', '30'];

const LABEL_AXE = {
  X: "Délai de l'axe horizontal (mois)",
  Y: "Délai de l'axe vertical (mois)",
};

export default function DateInserSelect({
  axis,
  value,
  dates,
  onChange,
  disabled = false,
}) {
  const list = Array.isArray(dates) && dates.length > 0 ? dates : DATES_FALLBACK;
  const id = `quadrant-date-${axis.toLowerCase()}`;

  return (
    <div className={`fr-select-group${disabled ? ' fr-select-group--disabled' : ''}`}>
      <label className="fr-label" htmlFor={id}>
        {LABEL_AXE[axis]}
      </label>
      <select
        id={id}
        className="fr-select"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {list.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </div>
  );
}
