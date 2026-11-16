// Note de lecture sur le périmètre de calcul des agrégats, affichée sous
// le quadrant (graphique et tableau).
//
//  - Vue Mentions : une mention n'est placée que si elle dispose des DEUX
//    indicateurs ; les références (médiane / moyenne, établissement et
//    nationales) sont calculées sur ces seules mentions.
//  - Vue Positionnement (sans filtre mention) : chaque axe d'une bulle
//    établissement est calculé sur TOUTES les mentions disposant de
//    l'indicateur, indépendamment de l'autre axe (cf. /quadrant section 4).
//    Les deux axes peuvent donc porter sur des ensembles de mentions
//    différents, d'où un écart possible avec la vue Mentions.
//  - Vue Positionnement filtrée sur une mention : chaque bulle est une
//    seule mention, la note n'a pas lieu d'être.
export default function NoteCalculAgregats({ vue, mention }) {
  let texte = null;
  if (vue === 'mentions') {
    texte =
      'Les médianes et moyennes de référence (établissement et nationales) '
      + 'sont calculées uniquement sur les mentions pour lesquelles les deux '
      + 'indicateurs sélectionnés sont disponibles.';
  } else if (vue === 'etablissements' && !mention) {
    texte =
      'Pour chaque établissement, chaque axe est calculé sur l’ensemble des '
      + 'mentions disposant de l’indicateur correspondant : les deux axes '
      + 'peuvent donc porter sur des mentions différentes. Cela peut expliquer '
      + 'un écart avec la vue « Mentions de l’établissement », '
      + 'dont les références ne retiennent que les mentions disposant des deux '
      + 'indicateurs.';
  }
  if (!texte) return null;
  return <p className="note-calcul-agregats">{texte}</p>;
}
