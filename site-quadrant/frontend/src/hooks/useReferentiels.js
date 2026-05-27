import { useEffect, useRef, useState } from 'react';
import {
  getReferentielDisciplinaire,
  getReferentielMillesimes,
  getReferentielVariables,
} from '../services/api.js';
import { messageErreur } from '../utils/errors.js';

// Hook qui regroupe les référentiels nécessaires aux filtres :
//   - millesimes : dépend du cursus
//   - variables  : dépend du cursus (structure stable cursus × indicateur)
//   - disponibilites : dépend du couple (cursus, millesime) — pour chaque
//     indicateur, la liste des `date_inser` effectivement présents dans
//     stats_quadrant ce millésime. Sert au grisage des options indispos
//     dans VariableSelect / DateInserSelect.
//   - populations : dépend du couple (cursus, millesime) — pour chaque
//     (indicateur, date_inser), libellé de population de référence
//     ("entrants AAAA-AA" pour réussite/poursuite,
//      "sortants AAAA" pour insertion/poursuivants). Sert à afficher
//     la population à côté du libellé d'axe (Phase 10).
//   - disciplinaire (domaines / disciplines / secteurs / mentions) : dépend
//     du couple (cursus, millesime)
//
// Chaque référentiel expose un état { loading, data, error }. Un cache
// simple en useRef évite de re-fetcher après un retour sur un cursus déjà
// chargé pendant la session. Pas de stratégie d'invalidation : la session
// est courte (vie de l'iframe), le cache reste valide.

const emptyState = () => ({ loading: false, data: null, error: null });

export function useReferentiels({ formation, millesime }) {
  const [millesimes,      setMillesimes]      = useState(emptyState());
  const [variables,       setVariables]       = useState(emptyState());
  const [disponibilites,  setDisponibilites]  = useState(emptyState());
  const [populations,     setPopulations]     = useState(emptyState());
  const [disciplinaire,   setDisciplinaire]   = useState(emptyState());

  // Caches : Map<formation, payload> pour millesimes & variables ;
  // Map<`${formation}|${millesime}`, payload> pour disponibilites/populations
  // & disciplinaire. disponibilites + populations partagent le même fetch
  // (/referentiel/variables?millesime=...) — on lit la réponse une fois et
  // on alimente les deux caches en parallèle pour ne pas dédoubler la requête.
  const cacheMillesimes     = useRef(new Map());
  const cacheVariables      = useRef(new Map());
  const cacheRefMillesime   = useRef(new Map()); // disponibilites + populations
  const cacheDisciplinaire  = useRef(new Map());

  // Millésimes & variables : changent avec le cursus.
  useEffect(() => {
    if (!formation) {
      setMillesimes(emptyState());
      setVariables(emptyState());
      return;
    }

    let cancelled = false;

    loadCached(
      cacheMillesimes.current,
      formation,
      () => getReferentielMillesimes({ formation }),
      setMillesimes,
      () => cancelled,
    );

    loadCached(
      cacheVariables.current,
      formation,
      () => getReferentielVariables({ formation }),
      setVariables,
      () => cancelled,
    );

    return () => {
      cancelled = true;
    };
  }, [formation]);

  // Disponibilités + populations : besoin de formation ET millesime.
  // Réutilise /referentiel/variables avec le paramètre `millesime` —
  // l'endpoint expose `disponibilites` et `populations` en une seule
  // requête. On les extrait et alimente les deux états séparément
  // (consommés différemment côté UI), mais via UN SEUL fetch via le
  // cache partagé pour éviter le double aller-retour.
  useEffect(() => {
    if (!formation || !millesime) {
      setDisponibilites(emptyState());
      setPopulations(emptyState());
      return;
    }

    let cancelled = false;
    const key = `${formation}|${millesime}`;

    // Le payload mis en cache est l'objet { disponibilites, populations }.
    // Chacun des deux setters consomme ensuite son sous-champ.
    loadCached(
      cacheRefMillesime.current,
      key,
      () => getReferentielVariables({ formation, millesime })
        .then((res) => ({
          disponibilites: res?.disponibilites || {},
          populations:    res?.populations    || {},
        })),
      (state) => {
        setDisponibilites({
          loading: state.loading,
          data:    state.data ? state.data.disponibilites : null,
          error:   state.error,
        });
        setPopulations({
          loading: state.loading,
          data:    state.data ? state.data.populations : null,
          error:   state.error,
        });
      },
      () => cancelled,
    );

    return () => {
      cancelled = true;
    };
  }, [formation, millesime]);

  // Disciplinaire : besoin de formation ET millesime.
  useEffect(() => {
    if (!formation || !millesime) {
      setDisciplinaire(emptyState());
      return;
    }

    let cancelled = false;
    const key = `${formation}|${millesime}`;

    loadCached(
      cacheDisciplinaire.current,
      key,
      () => getReferentielDisciplinaire({ formation, millesime }),
      setDisciplinaire,
      () => cancelled,
    );

    return () => {
      cancelled = true;
    };
  }, [formation, millesime]);

  return { millesimes, variables, disponibilites, populations, disciplinaire };
}

/**
 * Lit le cache s'il contient une entrée pour `key`, sinon déclenche le
 * `fetcher` et alimente le cache. Met à jour le state via `setter`.
 */
function loadCached(cache, key, fetcher, setter, isCancelled) {
  if (cache.has(key)) {
    setter({ loading: false, data: cache.get(key), error: null });
    return;
  }
  setter({ loading: true, data: null, error: null });
  fetcher()
    .then((data) => {
      if (isCancelled()) return;
      cache.set(key, data);
      setter({ loading: false, data, error: null });
    })
    .catch((err) => {
      if (isCancelled()) return;
      setter({ loading: false, data: null, error: messageErreur(err) });
    });
}
