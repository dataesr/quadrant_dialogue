import { scaleLinear, scaleSqrt, scalePow } from 'd3-scale';
import { extent } from 'd3-array';

// Géométrie partagée du quadrant. Les sous-composants (Axes, Bulles,
// LignesReference) consomment les mêmes scales pour rester alignés.
//
// Le viewBox SVG vit en coordonnées internes (WIDTH × HEIGHT). Le SVG
// s'adapte au conteneur via width="100%" height="auto" ; les valeurs
// numériques restent stables, c'est l'affichage qui suit.
//
// Choix des dimensions : SVG carré 700×700. La zone-quadrant fait
// ~700 px utiles (1000 - 280 de sidebar - paddings/gaps). Marges
// équilibrées pour que le plot reste carré et bien aéré.

export const WIDTH  = 700;
export const HEIGHT = 700;

// Marges internes : laissent de la place pour les graduations + titres
// d'axes ET pour la zone de débordement contrôlé des bulles. Une grosse
// bulle centrée sur (0,0) doit pouvoir « mordre » légèrement hors du
// cadre du plot — c'est plus lisible que la couper à ras. Le clip path
// dédié aux bulles (cf. Quadrant.jsx) élargit le plot de 30 px sur chaque
// côté, donc les marges doivent au minimum absorber ces 30 px.
export const MARGIN = {
  top:    50,
  right:  50,
  bottom: 80,
  left:   80,
};

// Aire utile du plot (intérieur des axes).
export const PLOT_WIDTH  = WIDTH  - MARGIN.left - MARGIN.right;
export const PLOT_HEIGHT = HEIGHT - MARGIN.top  - MARGIN.bottom;

// Échelles « identité » : domaine 0..100 → range SVG. Servent de point
// de départ ; le zoom les transforme via .rescaleX / .rescaleY pour
// produire des scales effectives à chaque rendu (cf. Quadrant.jsx).
export const xScaleBase = scaleLinear()
  .domain([0, 100])
  .range([MARGIN.left, MARGIN.left + PLOT_WIDTH]);

export const yScaleBase = scaleLinear()
  .domain([0, 100])
  .range([MARGIN.top + PLOT_HEIGHT, MARGIN.top]);

// Les bulles renvoyées par l'API ont x/y entre 0 et 1 (taux). On les
// passe en 0..100 ici pour rester cohérent avec les échelles ci-dessus.
export const toPercent = (v) => v * 100;

// ---------------------------------------------------------------------------
// Calcul du rayon d'une bulle
// ---------------------------------------------------------------------------
//
// 4 modes proposés (mode TEMPORAIRE de comparaison visuelle, le choix
// définitif sera retenu et `scaleMode` disparaîtra ensuite) :
//
//  - sqrt     : d3.scaleSqrt() avec range [5, 30] sur [min, max] observés
//               → surface proportionnelle au dénominateur (préconisé par
//               les guides de dataviz pour les bulles d'effectif).
//  - cbrt     : d3.scalePow().exponent(1/3) — racine cubique, range [4, 20]
//               → écrase davantage les très grandes valeurs.
//  - lineaire : d3.scaleLinear().domain([0, 100]).range([4, 30]).clamp(true)
//               → croît linéairement, clampé pour ne pas exploser.
//  - paliers  : escalier discret (4 niveaux).
//
// Pour sqrt et cbrt, on a besoin de l'ensemble des denoms observés
// (allDenoms) pour fixer le domain. Les modes paliers et lineaire
// ignorent ce paramètre.

export const SCALE_MODES = ['sqrt', 'paliers', 'cbrt', 'lineaire'];

export function rayonBulle(denom, mode = 'sqrt', allDenoms = []) {
  if (!denom || denom <= 0) return 3;

  if (mode === 'paliers') {
    if (denom < 20)  return 4;
    if (denom < 50)  return 8;
    if (denom < 200) return 12;
    return 18;
  }

  if (mode === 'lineaire') {
    return scaleLinear().domain([0, 100]).range([4, 30]).clamp(true)(denom);
  }

  // sqrt et cbrt : domaine basé sur l'extent du dataset, fallback raisonnable.
  const [minObs, maxObs] = extent(allDenoms);
  const domain = [
    Number.isFinite(minObs) ? minObs : 5,
    Number.isFinite(maxObs) && maxObs > 0 ? maxObs : 500,
  ];
  if (domain[0] === domain[1]) domain[1] = domain[0] + 1; // évite division par zéro

  if (mode === 'cbrt') {
    return scalePow().exponent(1 / 3).domain(domain).range([4, 20]).clamp(true)(denom);
  }
  // sqrt (défaut)
  return scaleSqrt().domain(domain).range([5, 30]).clamp(true)(denom);
}

// Graduations : on demande directement à la scale ses ticks via
// .ticks(5). En zoom = identité (domaine 0..100) ça donne pile
// 0/25/50/75/100 ; en zoom > 1 ça s'adapte automatiquement.
