import { useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import MillesimeSelect from './selectors/MillesimeSelect.jsx';
import VariableSelect from './selectors/VariableSelect.jsx';
import DateInserSelect from './selectors/DateInserSelect.jsx';

// Filtres essentiels (Millésime + Variables X/Y + Délais conditionnels).
// Empilés verticalement dans le panneau latéral : chaque <select> prend
// 100 % de la largeur de la colonne (280 px) → les libellés longs comme
// « Taux sortants en emploi salarié en France » tiennent sans troncature.
//
// Le composant retourne un Fragment et laisse le parent .panneau-filtres
// gérer l'espacement (flex column + gap). Les fr-select-group ont leur
// margin-bottom intrinsèque DSFR neutralisée via global.css.
//
// Interdépendance X ↔ Y : la liste des Y possibles dépend de X (couples
// autorisés par /referentiel/variables). Quand X change et que Y courant
// n'est plus compatible, on bascule Y sur la première Y valide.

// Détermine si une combinaison (variable, dateInser) est disponible pour
// le millésime courant — d'après `disponibilites` renvoyé par
// /referentiel/variables. Format attendu : { [libelle]: [date_inser, ...] }
// où une chaîne vide '' signifie « pas de date » (indicateur non
// déclinable). Si `disponibilites` n'est pas encore chargé (data === null),
// retourne true par défaut (pas de grisage tant qu'on ne sait pas).
function estDisponible(disponibilites, libelle, dateInser) {
  if (!disponibilites) return true;
  const dates = disponibilites[libelle];
  if (!Array.isArray(dates)) return false; // libellé absent du millésime
  return dates.includes(dateInser ?? '');
}

export default function FilterBar() {
  const {
    etabContexte,
    cursus,
    referentiels,
    variableX, variableY,
    dateInserX, dateInserY,
    setVariableX, setVariableY,
    setDateInserX, setDateInserY,
  } = useApp();

  const disabled = !etabContexte;
  const variablesData = referentiels.variables.data;
  const variablesLoading = referentiels.variables.loading;
  const disponibilites = referentiels.disponibilites.data;
  const populations    = referentiels.populations.data;

  // Population de référence pour l'axe courant — affichée en suffixe
  // discret après le libellé d'axe (« Axe horizontal · Population :
  // entrants 2021-22 »). Lit le mapping `populations` du référentiel
  // (cf. /referentiel/variables Phase 10). Retourne null si pas encore
  // chargé ou si l'indicateur n'a pas de population définie côté API.
  function populationDe(variable, dateInser) {
    if (!populations || !variable) return null;
    const byDate = populations[variable];
    if (!byDate) return null;
    return byDate[dateInser ?? ''] || null;
  }
  const populationX = populationDe(variableX, dateInserX);
  const populationY = populationDe(variableY, dateInserY);

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
  // Une option X est `disponible` si elle est présente dans la carte
  // de disponibilités avec AU MOINS une date_inser (= au moins une
  // combinaison existe dans le millésime). Non déclinable : check sur
  // la présence de '' dans la liste. Déclinable : présence d'au moins
  // une des dates 6/12/18/24/30.
  const xOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const [x] of couples) {
      if (seen.has(x)) continue;
      seen.add(x);
      const meta = varByLibelle.get(x);
      const declinable = meta?.declinable_delai ?? false;
      const aDesDispos = disponibilites
        ? (disponibilites[x] || []).length > 0
        : true;
      out.push({
        libelle: x,
        declinable_delai: declinable,
        disponible: aDesDispos,
      });
    }
    return out;
  }, [couples, varByLibelle, disponibilites]);

  // Y = toutes les secondes positions de couples_autorises où la première = variableX.
  const yOptions = useMemo(() => {
    if (!variableX) return [];
    const out = [];
    for (const [x, y] of couples) {
      if (x !== variableX) continue;
      const meta = varByLibelle.get(y);
      const declinable = meta?.declinable_delai ?? false;
      const aDesDispos = disponibilites
        ? (disponibilites[y] || []).length > 0
        : true;
      out.push({
        libelle: y,
        declinable_delai: declinable,
        disponible: aDesDispos,
      });
    }
    return out;
  }, [couples, varByLibelle, variableX, disponibilites]);

  const declinableX = varByLibelle.get(variableX)?.declinable_delai ?? false;
  const declinableY = varByLibelle.get(variableY)?.declinable_delai ?? false;

  // Dates disponibles pour l'axe courant (X ou Y) selon le millésime.
  // Pour le grisage des entrées du <select> de délai (6/12/18/24/30).
  const datesDispoX = useMemo(() => {
    if (!disponibilites || !variableX) return null;
    return new Set(disponibilites[variableX] || []);
  }, [disponibilites, variableX]);
  const datesDispoY = useMemo(() => {
    if (!disponibilites || !variableY) return null;
    return new Set(disponibilites[variableY] || []);
  }, [disponibilites, variableY]);

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

  // Bascule auto si la combinaison courante (variable + date_inser) devient
  // indisponible suite à un changement de millésime. Logique :
  //   - si la variable X n'a aucune dispo : bascule vers le premier X
  //     disponible (et son couple Y associé) ;
  //   - sinon si la date X n'est plus dispo : bascule vers la première
  //     date dispo de cette variable (ou '' si non déclinable).
  //   - idem pour Y.
  // Tourne après le chargement de `disponibilites`. Ignoré pendant le
  // chargement (`disponibilites === null`) pour éviter une bascule fausse
  // sur un fetch en cours.
  useEffect(() => {
    if (!disponibilites) return;
    if (!variableX || !variableY) return;

    // 1. La variable X est-elle disponible ?
    if (!estDisponible(disponibilites, variableX, dateInserX)) {
      // X indisponible OU sa date l'est : on cherche un fallback.
      const xFallback = xOptions.find((o) => o.disponible);
      if (xFallback && xFallback.libelle !== variableX) {
        handleChangeX(xFallback.libelle);
        return;
      }
      // Même variable X, mais date différente : prendre la première date dispo.
      if (declinableX && datesDispoX) {
        const premiereDispo = dates.find((d) => datesDispoX.has(d));
        if (premiereDispo && premiereDispo !== dateInserX) {
          setDateInserX(premiereDispo);
          return;
        }
      }
    }

    // 2. Idem Y.
    if (!estDisponible(disponibilites, variableY, dateInserY)) {
      const yFallback = yOptions.find((o) => o.disponible);
      if (yFallback && yFallback.libelle !== variableY) {
        setVariableY(yFallback.libelle);
        return;
      }
      if (declinableY && datesDispoY) {
        const premiereDispo = dates.find((d) => datesDispoY.has(d));
        if (premiereDispo && premiereDispo !== dateInserY) {
          setDateInserY(premiereDispo);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disponibilites]);

  return (
    <>
      <MillesimeSelect disabled={disabled} />

      <VariableSelect
        axis="X"
        value={variableX}
        options={xOptions}
        onChange={handleChangeX}
        disabled={disabled}
        loading={variablesLoading}
        cursus={cursus}
        population={populationX}
      />
      {declinableX && (
        <DateInserSelect
          axis="X"
          value={dateInserX}
          dates={dates}
          datesDisponibles={datesDispoX}
          onChange={setDateInserX}
          disabled={disabled}
        />
      )}

      <VariableSelect
        axis="Y"
        value={variableY}
        options={yOptions}
        onChange={setVariableY}
        disabled={disabled}
        loading={variablesLoading}
        cursus={cursus}
        population={populationY}
      />
      {declinableY && (
        <DateInserSelect
          axis="Y"
          value={dateInserY}
          dates={dates}
          datesDisponibles={datesDispoY}
          onChange={setDateInserY}
          disabled={disabled}
        />
      )}
    </>
  );
}
