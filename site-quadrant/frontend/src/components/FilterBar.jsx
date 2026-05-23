import { useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import MillesimeSelect from './selectors/MillesimeSelect.jsx';
import VariableSelect from './selectors/VariableSelect.jsx';
import DateInserSelect from './selectors/DateInserSelect.jsx';

// Barre de filtres essentiels : Millésime, Variable X, Date X (conditionnel),
// Variable Y, Date Y (conditionnel). Toujours visible mais désactivée tant
// qu'aucun établissement n'est sélectionné.
//
// Interdépendance X ↔ Y : la liste des Y possibles dépend de X (couples
// autorisés par /referentiel/variables). Quand X change et que Y courant
// n'est plus compatible, on bascule Y sur la première Y valide.

export default function FilterBar() {
  const {
    etabContexte,
    referentiels,
    variableX, variableY,
    dateInserX, dateInserY,
    setVariableX, setVariableY,
    setDateInserX, setDateInserY,
  } = useApp();

  const disabled = !etabContexte;
  const variablesData = referentiels.variables.data;
  const variablesLoading = referentiels.variables.loading;

  const allVars = variablesData?.variables || [];
  const couples = variablesData?.couples_autorises || [];
  const dates   = variablesData?.dates_insertion || ['6', '12', '18', '24', '30'];

  // Index libellé → variable (pour récupérer declinable_delai).
  const varByLibelle = useMemo(() => {
    const map = new Map();
    for (const v of allVars) map.set(v.libelle, v);
    return map;
  }, [allVars]);

  // X = ensemble des premières positions dans couples_autorises.
  const xOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const [x] of couples) {
      if (seen.has(x)) continue;
      seen.add(x);
      const meta = varByLibelle.get(x);
      out.push({ libelle: x, declinable_delai: meta?.declinable_delai ?? false });
    }
    return out;
  }, [couples, varByLibelle]);

  // Y = toutes les secondes positions de couples_autorises où la première = variableX.
  const yOptions = useMemo(() => {
    if (!variableX) return [];
    const out = [];
    for (const [x, y] of couples) {
      if (x !== variableX) continue;
      const meta = varByLibelle.get(y);
      out.push({ libelle: y, declinable_delai: meta?.declinable_delai ?? false });
    }
    return out;
  }, [couples, varByLibelle, variableX]);

  const declinableX = varByLibelle.get(variableX)?.declinable_delai ?? false;
  const declinableY = varByLibelle.get(variableY)?.declinable_delai ?? false;

  // Change X. Si le Y courant n'est plus autorisé avec le nouveau X, on
  // bascule Y vers la première option valide.
  function handleChangeX(newX) {
    setVariableX(newX);
    const newYs = couples
      .filter(([x]) => x === newX)
      .map(([, y]) => y);
    if (!newYs.includes(variableY) && newYs.length > 0) {
      setVariableY(newYs[0]);
    }
  }

  return (
    <div className="fr-grid-row fr-grid-row--gutters fr-mb-2w">
      <div className="fr-col-12 fr-col-md-2">
        <MillesimeSelect disabled={disabled} />
      </div>
      <div className="fr-col-12 fr-col-md-3">
        <VariableSelect
          axis="X"
          value={variableX}
          options={xOptions}
          onChange={handleChangeX}
          disabled={disabled}
          loading={variablesLoading}
        />
      </div>
      {declinableX && (
        <div className="fr-col-12 fr-col-md-2">
          <DateInserSelect
            axis="X"
            value={dateInserX}
            dates={dates}
            onChange={setDateInserX}
            disabled={disabled}
          />
        </div>
      )}
      <div className="fr-col-12 fr-col-md-3">
        <VariableSelect
          axis="Y"
          value={variableY}
          options={yOptions}
          onChange={setVariableY}
          disabled={disabled}
          loading={variablesLoading}
        />
      </div>
      {declinableY && (
        <div className="fr-col-12 fr-col-md-2">
          <DateInserSelect
            axis="Y"
            value={dateInserY}
            dates={dates}
            onChange={setDateInserY}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
