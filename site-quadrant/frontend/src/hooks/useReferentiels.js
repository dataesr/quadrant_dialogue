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
  const [disciplinaire,   setDisciplinaire]   = useState(emptyState());

  // Caches : Map<formation, payload> pour millesimes & variables ;
  // Map<`${formation}|${millesime}`, payload> pour disponibilites & disciplinaire.
  const cacheMillesimes     = useRef(new Map());
  const cacheVariables      = useRef(new Map());
  const cacheDisponibilites = useRef(new Map());
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

  // Disponibilités : besoin de formation ET millesime. Réutilise
  // /referentiel/variables avec le paramètre `millesime` — l'endpoint
  // expose alors un champ `disponibilites` qu'on isole ici. On ne casse
  // pas le cache `variables` (formation seule) : c'est un fetch parallèle
  // dédié à la disponibilité par millésime, mis en cache à part.
  useEffect(() => {
    if (!formation || !millesime) {
      setDisponibilites(emptyState());
      return;
    }

    let cancelled = false;
    const key = `${formation}|${millesime}`;

    loadCached(
      cacheDisponibilites.current,
      key,
      () => getReferentielVariables({ formation, millesime })
        .then((res) => res?.disponibilites || {}),
      setDisponibilites,
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

  return { millesimes, variables, disponibilites, disciplinaire };
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
