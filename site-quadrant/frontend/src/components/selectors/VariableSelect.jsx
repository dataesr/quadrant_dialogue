// Sélecteur de variable d'axe (X ou Y). Les options sont calculées par
// l'appelant (FilterBar) à partir de `couples_autorises` — l'interdépendance
// X↔Y reste donc maîtrisée à un seul endroit.
//
// Props :
//  - axis      : 'X' | 'Y' (utilisé pour l'id et le libellé)
//  - value     : libellé courant (string | null)
//  - options   : tableau d'objets { libelle, declinable_delai?, disponible? }
//                disponible=false → option grisée (visible mais non sélectionnable)
//                Sert au cas où le millésime courant ne couvre pas
//                l'indicateur (cf. /referentiel/variables?millesime=Y).
//  - onChange  : (newLibelle) => void
//  - disabled  : booléen
//  - loading   : true tant que le référentiel charge
//  - cursus    : cursus courant (pour la définition de l'indicateur
//                affichée dans le tooltip à droite du label)
//  - population: libellé de population de référence (« entrants
//                AAAA-AA », « sortants AAAA » — Phase 10). Affiché en
//                suffixe discret après le libellé d'axe. null = pas
//                de suffixe (population non disponible ou indicateur
//                agnostique).

import IndicateurTooltip from '../IndicateurTooltip.jsx';

const LABEL_AXE = { X: 'Axe horizontal', Y: 'Axe vertical' };

export default function VariableSelect({
  axis,
  value,
  options,
  onChange,
  disabled = false,
  loading = false,
  cursus,
  population = null,
}) {
  const groupDisabled = disabled || loading || options.length === 0;
  const id = `quadrant-variable-${axis.toLowerCase()}`;

  return (
    <div className={`fr-select-group${groupDisabled ? ' fr-select-group--disabled' : ''}`}>
      <label className="fr-label" htmlFor={id}>
        {LABEL_AXE[axis]}
        {population && (
          <span className="population-suffixe">
            {' · Population : '}{population}
          </span>
        )}
        {loading && <span className="fr-hint-text">Chargement…</span>}
        {value && cursus && (
          <IndicateurTooltip libelle={value} cursus={cursus} mode="iconOnly" />
        )}
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
        {options.map((opt) => {
          const indispo = opt.disponible === false;
          return (
            <option
              key={opt.libelle}
              value={opt.libelle}
              disabled={indispo}
              title={indispo ? 'Non disponible pour ce millésime' : undefined}
            >
              {opt.libelle}{indispo ? ' (non disponible)' : ''}
            </option>
          );
        })}
      </select>
    </div>
  );
}
