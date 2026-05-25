import { useEffect, useState } from 'react';
import { ApiError, getQuadrantDetails } from '../services/api.js';

// Hook qui charge /quadrant/details pour la bulle « cible » courante.
//
// Différence majeure avec useQuadrant : on cache la réponse en mémoire
// par tuple de paramètres. Une session de consultation typique enchaîne
// les clics sur 3-5 bulles différentes ; ouvrir/fermer/rouvrir la même
// bulle ne doit pas reconsommer le quota (rate-limit 30/min côté
// serveur cf. lib/RateLimit.php).
//
// Le cache est module-scope : il persiste tant que le module reste
// chargé (= toute la session de l'iframe). Aucune éviction explicite —
// le payload est petit (~16 KB par bulle) et la cardinalité est faible.
//
// Annulation : on garde un drapeau `cancelled` au lieu d'AbortController
// pour rester aligné avec useQuadrant ; en pratique le service request()
// ne propage pas le signal et le surcoût d'une réponse ignorée est nul.

const cache = new Map();

function cleCache(params) {
  // L'ordre des clés varie selon comment l'objet est construit, on stringify
  // une version triée pour des clés stables.
  const keys = Object.keys(params).sort();
  const ordonne = {};
  for (const k of keys) ordonne[k] = params[k];
  return JSON.stringify(ordonne);
}

function messageDepuisErreur(err) {
  if (!(err instanceof ApiError)) {
    return err?.message || String(err);
  }
  if (err.status === 429) {
    return 'Trop de requêtes envoyées au serveur. Veuillez patienter quelques secondes avant de cliquer sur une autre bulle.';
  }
  if (err.status === 403) {
    return 'Détails non disponibles pour cette bulle (hors de votre périmètre).';
  }
  if (err.status >= 500) {
    return `Erreur serveur (${err.code || err.status}) — réessayez plus tard.`;
  }
  return `${err.message}${err.code ? ` (${err.code})` : ''}`;
}

export function useQuadrantDetails({
  vue,
  formation,
  millesime,
  targetId,
  etabContexte,
  mention,
}) {
  const [state, setState] = useState({ loading: false, data: null, error: null });

  // Idle tant qu'aucune cible n'est fixée. On distingue ce cas du « loading »
  // côté composant via data === null && !loading && !error.
  const ready =
    !!vue && !!formation && !!millesime && !!targetId &&
    (vue !== 'etablissements' || !!etabContexte);

  useEffect(() => {
    if (!ready) {
      setState({ loading: false, data: null, error: null });
      return;
    }

    const params = {
      vue,
      formation,
      millesime,
      target_id: targetId,
    };
    if (etabContexte) params.etab_contexte = etabContexte;
    if (mention)      params.mention       = mention;

    const cle = cleCache(params);
    const cached = cache.get(cle);
    if (cached) {
      setState({ loading: false, data: cached, error: null });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    getQuadrantDetails(params)
      .then((data) => {
        if (cancelled) return;
        cache.set(cle, data);
        setState({ loading: false, data, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ loading: false, data: null, error: messageDepuisErreur(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [ready, vue, formation, millesime, targetId, etabContexte, mention]);

  return state;
}
