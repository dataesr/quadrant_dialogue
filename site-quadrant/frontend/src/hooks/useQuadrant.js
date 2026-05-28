import { useEffect, useState } from 'react';
import { getQuadrant } from '../services/api.js';

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
  memeTypologie,
  // En vue Positionnement (= vue=etablissements côté API), 'mediane' ou
  // 'moyenne' selon le sélecteur. En vue Mentions, le paramètre est
  // ignoré : data.reference n'y est plus consulté (cf. Quadrant.jsx
  // qui lit data.axes via referenceAxes) — on laisse 'mediane' par
  // défaut, ça vaut son comportement historique.
  agregation = 'mediane',
  // forExport=true ajoute `?for_export=1` à la requête. L'API applique
  // alors le seuil de diffusion configuré (seuil_diffusable, 20 par
  // défaut) : valeurs sous-seuil deviennent null + raison_x/y='effectif
  // _insuffisant_export'. Utilisé par BoutonExport pour le XLSX.
  forExport = false,
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
      // `agregation` dicte `data.reference` côté API. Pertinent en vue
      // Positionnement (sélecteur Médiane / Moyenne) ; en vue Mentions
      // on continue à lire data.axes via `referenceAxes` côté frontend
      // (cf. Quadrant.jsx) donc la valeur d'agregation n'a pas d'effet
      // visible, mais on transmet quand même pour préserver le contrat
      // API.
      agregation,
    };

    // Filtres optionnels : on n'envoie que ce qui est réellement renseigné.
    if (domaine)    params.dom      = domaine;
    if (discipline) params.discipli = discipline;
    if (secteur)    params.secteur  = secteur;
    if (mention)    params.mention  = mention;
    if (typeMaster) params.master   = typeMaster;
    if (memeTypologie) params.meme_typologie = 1;
    if (forExport)  params.for_export = 1;

    getQuadrant(params)
      .then((data) => {
        if (cancelled) return;
        setState({ loading: false, data, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        // On expose l'objet erreur brut (ApiError porte .status et
        // .code). Le composant consommateur utilise <MessageErreur>
        // / messageErreur() pour le formater en fonction du status.
        setState({ loading: false, data: null, error: err });
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
    representativite,
    memeTypologie,
    agregation,
    forExport,
  ]);

  return state;
}
