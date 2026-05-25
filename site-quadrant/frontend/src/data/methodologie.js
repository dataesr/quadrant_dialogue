// Contenu méthodologique de l'outil Quadrant — texte de référence
// affiché dans :
//   - tooltips contextuels sur les libellés d'indicateurs (cf.
//     IndicateurTooltip)
//   - modale « Méthodologie » accessible depuis le panneau de filtres
//   - feuille « Méthodologie » du XLSX
//   - annexe du Word (section générale + bloc cursus courant)
//
// Le texte est conservé tel quel (source MESRE-SIES) et structuré pour
// permettre une recherche par libellé d'indicateur. Les clés de
// METHODOLOGIE_CURSUS DOIVENT correspondre aux valeurs `formation`
// renvoyées par l'API (cf. AppContext : 'Licence générale',
// 'Licence professionnelle', 'Master'). Le BUT (« Bachelor universitaire
// de technologie ») est volontairement absent — non couvert par la
// méthodologie diffusée à ce stade ; le helper `getDefinitionIndicateur`
// retourne `null` proprement dans ce cas.

export const METHODOLOGIE_GENERALE = `Cet outil propose un ensemble de nuages de points qui croisent les valeurs de deux indicateurs liés à la réussite, l'orientation et l'insertion professionnelle des étudiants inscrits en université de 3 types de diplôme : licence générale, licence professionnelle et master.

Parmi les 6 onglets proposés, les 3 premiers permettent de croiser les informations au niveau de chaque mention de diplôme d'une université. Les 3 derniers s'intéressent au niveau de chaque université pour l'ensemble des disciplines ou pour un ensemble disciplinaire distinct. Un point du nuage représente donc respectivement une mention de diplôme d'une université ou l'ensemble des mentions d'une université.

Dans les quadrants, chaque axe d'un nuage de points est coupé en deux plans selon la médiane de chacun des deux indicateurs calculés à partir des points présents sur le graphique. De chaque côté se trouvent la moitié des points. Les points sont ainsi présents dans l'un des quatre quadrants du graphique. La taille de chaque point est proportionnelle à l'effectif de référence du premier indicateur (dénominateur de l'indicateur 1). Chaque quadrant du graphique ne contient que très rarement un quart des points du nuage.

Certaines mentions et certains établissements peuvent ne pas apparaître sur ces nuages de points en fonction du type de diplôme, de la discipline ou des indicateurs sélectionnés. C'est le cas lorsque l'établissement ne propose pas un type diplôme ou cette discipline, lorsque certaines mentions proposées par un établissement ne correspondent pas dans le temps (différence entre l'offre de formation au moment de l'inscription en début de cursus et celle au moment de la diplomation) ou lorsque les effectifs de référence des taux (dénominateurs des indicateurs) sont inférieurs à 5, ce qui est le cas de beaucoup d'indicateurs d'insertion des mentions de licence générale qui ont moins de 5 sortants parmi les diplômés.

Les indicateurs proposés sont calculés à partir des données des dispositifs SISE et InserSup. Les valeurs des indicateurs calculés sur de faibles effectifs, généralement inférieurs à 20, sont à prendre avec précaution. Les données relatives aux étudiants inscrits dans les établissements composantes ne sont pas prises en compte dans ces nuages de points.`;

export const METHODOLOGIE_CURSUS = {
  'Licence générale': {
    libelle: 'Licence générale',
    champ: `Le champ des inscrits est constitué des néo-bacheliers inscrits en première année de licence (L1) à la rentrée universitaire N. En sont exclus les étudiants ayant pris une inscription parallèle en STS, DUT ou CPGE ou ayant obtenu le diplôme de Licence à l'issue de la première année.\nLes indicateurs sont des ratios rapportant des effectifs d'étudiants selon leur établissement et leur mention d'inscription en L1.`,
    indicateurs: [
      {
        libelle: 'Taux de réussite en 3 ans',
        definition: `Étudiants du champ ayant obtenu une licence générale ou professionnelle aux sessions N+2 ou N+3, quels que soit l'établissement ou la mention d'obtention.`,
      },
      {
        libelle: 'Taux de réussite en 3 ou 4 ans',
        definition: `Étudiants du champ ayant obtenu une licence générale ou professionnelle aux sessions N+2, N+3 ou N+4, quels que soit l'établissement ou la mention d'obtention.`,
      },
      {
        libelle: 'Taux de poursuite d’étude',
        definition: `Étudiants du champ ayant obtenu une licence générale ou professionnelle aux sessions N+3 ou N+4, quels que soit l'établissement ou la mention d'obtention, et poursuivant des études supérieure à la rentrée suivant l'obtention du diplôme de licence générale ou professionnelle.`,
      },
    ],
    champ_insertion: `Diplômés de licence générale de nationalité française et âgés de moins de 30 ans ne poursuivant pas d'études au cours des deux années universitaires suivant leur diplomation.`,
    insertion: {
      libelle: 'Insertion professionnelle',
      definition: `Proportion de diplômés du champ occupant un emploi salarié en France à 6, 12, 18, 24, et 30 mois.`,
    },
  },
  'Licence professionnelle': {
    libelle: 'Licence professionnelle',
    champ: `Primo-inscrits en licence professionnelle (LP) à la rentrée universitaire N.\nLes indicateurs de réussite sont des ratios rapportant des effectifs d'étudiants selon leur établissement et leur mention d'inscription en licence professionnelle.`,
    indicateurs: [
      {
        libelle: 'Taux de réussite en 1 an',
        definition: `Étudiants du champ ayant obtenu une licence professionnelle à la session N+1, quels que soit l'établissement ou la mention d'obtention.`,
      },
    ],
    champ_insertion: `Diplômés de licence professionnelle de nationalité française et âgés de moins de 30 ans ne poursuivant pas d'études au cours des deux années universitaires suivant leur diplomation.`,
    insertion: {
      libelle: 'Insertion professionnelle',
      definition: `Proportion de diplômés du champ occupant un emploi salarié en France à 6, 12, 18, 24, et 30 mois.`,
    },
  },
  'Master': {
    libelle: 'Master',
    champ: `Primo-inscrits en première année de master (M1) à la rentrée universitaire N.\nLes indicateurs de réussite sont des ratios rapportant des effectifs d'étudiants selon leur établissement et leur mention d'inscription en M1.`,
    indicateurs: [
      {
        libelle: 'Taux de réussite en 2 ans',
        definition: `Étudiants du champ ayant obtenu un master à la session N+2, quels que soit l'établissement ou la mention d'obtention.`,
      },
      {
        libelle: 'Taux de réussite en 2 ou 3 ans',
        definition: `Étudiants du champ ayant obtenu un master aux sessions N+2 ou N+3, quels que soit l'établissement ou la mention d'obtention.`,
      },
    ],
    champ_insertion: `Diplômés de master de nationalité française et âgés de moins de 30 ans ne poursuivant pas d'études au cours des deux années universitaires suivant leur diplomation.`,
    insertion: {
      libelle: 'Insertion professionnelle',
      definition: `Proportion de diplômés du champ occupant un emploi salarié en France à 6, 12, 18, 24, et 30 mois.`,
    },
  },
};

// Cherche la définition d'un indicateur dans la méthodologie du cursus
// donné. Retourne `null` si introuvable (cursus non couvert, libellé
// inconnu) — l'appelant est responsable de masquer l'élément
// déclencheur dans ce cas. La comparaison se fait sur le libellé
// normalisé (trim + lowercase) pour tolérer les petites variations
// de casse / espaces. Les indicateurs d'insertion à délai
// (`Taux sortants en emploi salarié en France`, etc.) renvoient tous
// la même définition générale d'insertion — la méthodologie ne
// distingue pas par délai.
export function getDefinitionIndicateur(libelleIndicateur, cursus) {
  if (!libelleIndicateur || !cursus) return null;
  const norm = (s) => s.trim().toLowerCase();
  const ciblage = norm(libelleIndicateur);

  const blocCursus = METHODOLOGIE_CURSUS[cursus];
  if (!blocCursus) return null;

  const trouve = blocCursus.indicateurs.find((i) => norm(i.libelle) === ciblage);
  if (trouve) return trouve.definition;

  if (norm(blocCursus.insertion.libelle) === ciblage) {
    return blocCursus.insertion.definition;
  }

  // Indicateurs d'insertion à délai (cf. dim_indicateur_cursus :
  // declinable_delai=1). Pas de définition spécifique au délai dans
  // la méthodologie — on rabat sur la définition générale d'insertion
  // du cursus.
  if (
    ciblage.includes('emploi salari')
    || ciblage.includes('emploi non salari')
    || ciblage.includes('emploi stable')
  ) {
    return blocCursus.insertion.definition;
  }

  return null;
}
