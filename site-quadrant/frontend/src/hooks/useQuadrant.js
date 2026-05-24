import { useEffect, useState } from 'react';
import { ApiError, getQuadrant } from '../services/api.js';

// Hook qui charge /quadrant à partir des filtres du AppContext. Renvoie
// { loading, data, error }. Annule proprement les requêtes obsolètes via
// un drapeau `cancelled` — sans cela, un changement rapide de filtres
// peut laisser arriver une réponse antérieure et écraser la suivante.
//
// Les paramètres requis sont vérifiés en amont : si l'un d'eux manque
// (pas encore de millésime, de variables, etc.), on reste en idle plutôt
// que d'appeler l'API avec un payload invalide.
//
// Le filtre `mention` est volontairement ignoré sur vue=mentions (cf.
// /quadrant côté API qui le court-circuite). Idem pour `dateInserX/Y`
// qui ne sont passés que sur indicateurs déclinables — la cohérence est
// déjà gérée par les setters du contexte, mais on filtre les chaînes
// vides ici pour ne pas polluer la query string.

export function useQuadrant({
  cursus,
  vue,
  millesime,
  variableX,
  variableY,
  dateInserX,
  dateInserY,
  etabContexte,
  domaine,
  discipline,
  secteur,
  mention,
  typeMaster,
  representativite,
  ligneReference,
}) {
  const [state, setState] = useState({ loading: false, data: null, error: null });

  // Tous les paramètres « bloquants » : tant qu'un seul manque, pas d'appel.
  const ready =
    cursus && vue && millesime && variableX && variableY && etabContexte;

  useEffect(() => {
    if (!ready) {
      setState({ loading: false, data: null, error: null });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    const params = {
      formation: cursus,
      vue,
      millesime,
      var1: variableX,
      var2: variableY,
      date_inser_var1: dateInserX || '',
      date_inser_var2: dateInserY || '',
      etab_contexte: etabContexte,
      representativite: representativite ? 'representatif' : 'toutes',
      agregation: ligneReference,
    };

    // Filtres optionnels : on n'envoie que ce qui est réellement renseigné.
    if (domaine)    params.dom      = domaine;
    if (discipline) params.discipli = discipline;
    if (secteur)    params.secteur  = secteur;
    if (mention)    params.mention  = mention;
    if (typeMaster) params.master   = typeMaster;

    getQuadrant(params)
      .then((data) => {
        if (cancelled) return;
        setState({ loading: false, data, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? `${err.message}${err.code ? ` (${err.code})` : ''}`
            : err?.message || String(err);
        setState({ loading: false, data: null, error: message });
      });

    return () => {
      cancelled = true;
    };
  }, [
    ready,
    cursus, vue, millesime,
    variableX, variableY, dateInserX, dateInserY,
    etabContexte,
    domaine, discipline, secteur, mention, typeMaster,
    representativite, ligneReference,
  ]);

  return state;
}
