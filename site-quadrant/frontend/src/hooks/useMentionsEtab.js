import { useMemo } from 'react';
import { useQuadrant } from './useQuadrant.js';

// Liste des mentions effectivement offertes par l'établissement de
// référence pour le couple (cursus, millésime, indicateurs courants).
// Sert à alimenter le filtre Mention en vue Positionnement, où on ne
// veut pas montrer les ~170 mentions du cursus mais uniquement
// celles présentes dans l'établissement sélectionné.
//
// Implémentation : on réutilise /quadrant en forçant `vue: 'mentions'`
// pour le contexte courant. Le payload est le même qu'une visite
// utilisateur en vue Mentions — bulles[].id (= diplom) et
// bulles[].libelle suffisent. Pas de surcoût significatif côté API
// (requête déjà cacheable côté front via useQuadrant), pas de
// nouvel endpoint à créer.
//
// Le résultat est trié alphabétiquement (français). Si une variable
// n'a pas encore de valeur sélectionnée (initialisation), useQuadrant
// reste idle et on retourne `[]`.

export function useMentionsEtab({
  cursus,
  millesime,
  etabContexte,
  variableX,
  variableY,
  dateInserX,
  dateInserY,
}) {
  // Fetch vue=mentions pour cet étab. On ne propage AUCUN filtre
  // disciplinaire / typeMaster / mention : on veut la liste exhaustive
  // des mentions de l'étab, pas une sous-liste filtrée. Paramètres
  // d'affichage (representativité, ligne de référence) idem — sans
  // effet sur l'identité des bulles, mais on force des valeurs
  // neutres pour stabiliser le cache.
  const quadrant = useQuadrant({
    cursus,
    vue: 'mentions',
    millesime,
    variableX,
    variableY,
    dateInserX,
    dateInserY,
    etabContexte,
    domaine: null,
    discipline: null,
    secteur: null,
    mention: null,
    typeMaster: null,
    representativite: false,
  });

  const mentions = useMemo(() => {
    const bulles = quadrant.data?.bulles || [];
    return bulles
      .filter((b) => b.id && b.libelle)
      .map((b) => ({ diplom: b.id, libelle: b.libelle }))
      .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
  }, [quadrant.data]);

  return {
    loading: quadrant.loading,
    error: quadrant.error,
    mentions,
  };
}
