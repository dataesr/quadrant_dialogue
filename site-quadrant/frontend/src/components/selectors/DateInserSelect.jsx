// Sélecteur de date d'insertion — visible seulement quand la variable
// associée est déclinable. Liste alimentée par dates_insertion du
// référentiel /referentiel/variables, fallback '6/12/18/24/30'.
//
// Prop `datesDisponibles` : Set<string> | null. Quand fournie, les dates
// hors de ce Set sont grisées (disabled) avec une mention « (non
// disponible) » — sert à signaler à l'utilisateur les délais d'insertion
// pas encore couverts par le millésime courant. null = pas de grisage
// (référentiel non chargé ou non pertinent).

const DATES_FALLBACK = ['6', '12', '18', '24', '30'];

const LABEL_AXE = {
  X: 'Axe horizontal : situation à',
  Y: 'Axe vertical : situation à',
};

export default function DateInserSelect({
  axis,
  value,
  dates,
  datesDisponibles = null,
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
        {/* `value` reste le nombre seul (envoyé tel quel à l'API
            sous le paramètre date_inser_var1/var2). Seul le texte
            affiché à l'utilisateur change. */}
        {list.map((d) => {
          const indispo = datesDisponibles !== null && !datesDisponibles.has(d);
          return (
            <option
              key={d}
              value={d}
              disabled={indispo}
              title={indispo ? 'Non disponible pour ce millésime' : undefined}
            >
              {d} mois{indispo ? ' (non disponible)' : ''}
            </option>
          );
        })}
      </select>
    </div>
  );
}
