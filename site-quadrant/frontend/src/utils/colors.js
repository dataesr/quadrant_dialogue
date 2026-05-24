// Palette officielle du quadrant. Non utilisée en phase 3 (pas encore de
// SVG), mais préparée pour la phase 4 (bulles + légende).

// Couleurs par grand domaine (vue Mentions, code `dom`).
export const COLORS_DOMAINE = {
  DEG:    '#29598F',
  LLA:    '#B478F1',
  SHS:    '#82B5F2',
  STS:    '#31A7AE',
  INTERD: '#CFB1F5',
};

// Couleurs par catégorie d'établissement (vue Établissements), relative à
// l'établissement de contexte (cf. cadrage §4 — Groupe 2).
export const COLORS_ETAB = {
  SELECTIONNE:                  '#E91719',
  MEME_REGION_MEME_TYPOLOGIE:   '#5C68E5',
  MEME_REGION_AUTRE_TYPOLOGIE:  '#29598F',
  AUTRE_REGION_MEME_TYPOLOGIE:  '#31A7AE',
  AUTRES:                       '#B1B1B1',
};

// Mapping couleur_key (champ API) → couleur de la palette. Utilisé par
// Bulles.jsx (rendu SVG) et par Quadrant.jsx (puces de la légende).
// Garder en synchro avec COLORS_ETAB.
export const COULEUR_ETAB_PAR_KEY = {
  selectionne:                 COLORS_ETAB.SELECTIONNE,
  meme_region_et_typologie:    COLORS_ETAB.MEME_REGION_MEME_TYPOLOGIE,
  meme_region_autre_typologie: COLORS_ETAB.MEME_REGION_AUTRE_TYPOLOGIE,
  meme_typologie_autre_region: COLORS_ETAB.AUTRE_REGION_MEME_TYPOLOGIE,
  autres:                      COLORS_ETAB.AUTRES,
};

// Libellés humains des catégories d'établissement, partagés entre la
// légende sous le quadrant et le tooltip de survol. Phrase complète
// (« Établissement de la même région et de la même typologie »)
// volontairement préférée à une formulation synthétique : la légende
// doit être lisible sans connaissance du code interne, et le tooltip
// d'une bulle anonyme n'a souvent QUE cette ligne pour s'expliquer.
export const LIBELLES_CATEGORIES_ETAB = {
  selectionne:                 'Établissement sélectionné',
  meme_region_et_typologie:    'Établissement de la même région et de la même typologie',
  meme_region_autre_typologie: 'Établissement de la même région, autre typologie',
  meme_typologie_autre_region: 'Établissement de la même typologie, autre région',
  autres:                      'Autre établissement',
};

// Ordre canonique des catégories — du plus spécifique (étab de
// contexte) au plus générique (autres). Sert au rendu de la légende
// dans Quadrant.jsx (filtrage des catégories réellement présentes
// puis tri).
export const ORDRE_CATEGORIES_ETAB = [
  'selectionne',
  'meme_region_et_typologie',
  'meme_region_autre_typologie',
  'meme_typologie_autre_region',
  'autres',
];
