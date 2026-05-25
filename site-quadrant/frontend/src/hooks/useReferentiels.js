import { useEffect, useRef, useState } from 'react';
import {
  getReferentielDisciplinaire,
  getReferentielMillesimes,
  getReferentielVariables,
} from '../services/api.js';
import { messageErreur } from '../utils/errors.js';

// Hook qui regroupe les trois référentiels nécessaires aux filtres :
//   - millesimes : dépend du cursus
//   - variables  : dépend du cursus
//   - disciplinaire (domaines / disciplines / secteurs / mentions) : dépend
//     du couple (cursus, millesime)
//
// Chaque référentiel expose un état { loading, data, error }. Un cache
// simple en useRef évite de re-fetcher après un retour sur un cursus déjà
// chargé pendant la session. Pas de stratégie d'invalidation : la session
// est courte (vie de l'iframe), le cache reste valide.

const emptyState = () => ({ loading: false, data: null, error: null });

export function useReferentiels({ formation, millesime }) {
  const [millesimes,    setMillesimes]    = useState(emptyState());
  const [variables,     setVariables]     = useState(emptyState());
  const [disciplinaire, setDisciplinaire] = useState(emptyState());

  // Caches : Map<formation, payload> pour millesimes & variables ;
  // Map<`${formation}|${millesime}`, payload> pour disciplinaire.
  const cacheMillesimes    = useRef(new Map());
  const cacheVariables     = useRef(new Map());
  const cacheDisciplinaire = useRef(new Map());

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

  return { millesimes, variables, disciplinaire };
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
