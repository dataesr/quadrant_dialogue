import { useEffect, useState } from 'react';
import { ApiError, getQuadrantDetails } from '../services/api.js';
import { messageErreur } from '../utils/errors.js';

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

// Spécialisé pour /quadrant/details : ce hook a deux cas contextuels
// (429 → message qui renvoie au clic, 403 → hors périmètre) qui
// méritent un libellé propre. Le reste retombe sur la mise en forme
// commune messageErreur() — un seul endroit à maintenir pour les
// statuts génériques (réseau, 404, 5xx).
function messageDepuisErreur(err) {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return 'Trop de requêtes envoyées au serveur. Veuillez patienter quelques secondes avant de cliquer sur une autre bulle.';
    }
    if (err.status === 403) {
      return 'Détails non disponibles pour cette bulle (hors de votre périmètre).';
    }
  }
  return messageErreur(err);
}

export function useQuadrantDetails({
  vue,
  formation,
  millesime,
  targetId,
  etabContexte,
  mention,
  // Filtres disciplinaires actifs (Phase 14.8) : transmis uniquement en
  // vue=etablissements pour que /quadrant/details calcule la disponibilité
  // de l'analyse fine AGRÉGÉE (mêmes filtres que /quadrant). Ignorés
  // serveur en vue=mentions.
  dom, discipli, secteur, master,
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
    if (vue === 'etablissements') {
      if (dom)      params.dom      = dom;
      if (discipli) params.discipli = discipli;
      if (secteur)  params.secteur  = secteur;
      if (master)   params.master   = master;
    }

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
  }, [ready, vue, formation, millesime, targetId, etabContexte, mention, dom, discipli, secteur, master]);

  return state;
}
