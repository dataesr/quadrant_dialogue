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
