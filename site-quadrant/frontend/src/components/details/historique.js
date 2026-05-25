// Utilitaires pour le panneau de détails (phase 5).
//
// L'API /quadrant/details renvoie :
//   - donnees_courantes : liste des tuples (indicateur, date_inser) du
//     millésime courant — alignée sur dim_indicateur_cursus côté API.
//   - historique : pour chaque millésime, la même liste de tuples.
//
// Ce module fournit :
//   1. Extraction d'une série mono-courbe (indicateur, date_inser) →
//      [{millesime, taux, denominateur, nonDiffusable}].
//   2. Détection des indicateurs déclinables (≥1 date_inser non vide
//      dans les données).
//   3. Découpage en groupes pour la section « Autres » du panneau :
//      Réussite (regroupé), Insertion (1 groupe par indicateur),
//      Indicateurs simples (1 ligne chacun).
//   4. Extraction d'une série multi-courbes (1 courbe par variante)
//      pour les graphiques de groupe.
//   5. Calcul d'une échelle Y adaptative + générateur de graduations.

// =============================================================================
// Série mono-courbe (utilisée par MiniGrapheEvolution)
// =============================================================================

// Convertit en number ou null. Convention partagée par tous les
// consommateurs (segmenter, rendu de points) : null/undefined ≠ valeur.
// Une valeur de 0 reste une vraie valeur (effectif très faible, taux 0)
// — ce n'est pas un marqueur de manquant.
function asNumberOrNull(v) {
  return typeof v === 'number' && !Number.isNaN(v) ? v : null;
}

export function extraireSerie(historique, indicateur, dateInser) {
  const out = [];
  for (const h of historique || []) {
    const row = (h.donnees || []).find(
      (r) => r.indicateur === indicateur && (r.date_inser ?? '') === (dateInser ?? '')
    );
    if (!row) {
      out.push({
        millesime: Number(h.millesime),
        taux: null,
        numerateur: null,
        denominateur: null,
      });
      continue;
    }
    // Sanitization : tout ce qui n'est pas un Number devient null. Sans
    // ça, un éventuel `undefined` côté JSON (ou un type inattendu) se
    // propage et fait basculer des comparaisons « !== null » à true,
    // ce qui pousse de faux points dans les segments et trace des
    // lignes vers des coordonnées indéfinies.
    out.push({
      millesime:     Number(h.millesime),
      taux:          asNumberOrNull(row.taux),
      numerateur:    asNumberOrNull(row.numerateur),
      denominateur:  asNumberOrNull(row.denominateur),
      nonDiffusable: row.non_diffusable === true,
    });
  }
  return out.sort((a, b) => a.millesime - b.millesime);
}

// Borne la série au premier et dernier millésime ayant au moins une
// trace (denom numérique). Conserve les trous intermédiaires pour
// pouvoir interrompre la ligne proprement entre deux années
// renseignées.
//
// Convention « valeur présente » : typeof === 'number'. Un denom
// undefined ou null est traité comme manquant (cohérent avec
// segmenterPar et les checks de rendu).
export function decouperDomaineSerie(serie) {
  const debut = serie.findIndex((p) => typeof p.denominateur === 'number');
  if (debut === -1) return [];
  let fin = serie.length - 1;
  while (fin >= 0 && typeof serie[fin].denominateur !== 'number') fin--;
  return serie.slice(debut, fin + 1);
}

export function nbPointsValides(serie) {
  let n = 0;
  for (const p of serie) if (typeof p.taux === 'number') n++;
  return n;
}

// Tronçonne en segments aux points absents (taux non-numérique) —
// utilisé pour dessiner des polylines séparées au lieu d'une ligne
// qui sauterait les trous. Une valeur 0 est traitée comme un vrai
// point (un taux peut légitimement être 0).
export function segmenter(serie) {
  const segments = [];
  let courant = [];
  for (const p of serie) {
    if (typeof p.taux === 'number') {
      courant.push(p);
    } else if (courant.length) {
      segments.push(courant);
      courant = [];
    }
  }
  if (courant.length) segments.push(courant);
  return segments;
}

// =============================================================================
// Détection des indicateurs déclinables
// =============================================================================

// Vrai si l'indicateur a au moins une donnée avec date_inser non vide
// (= se décline par délai dans la base).
export function estIndicateurDeclinable(indicateur, historique) {
  for (const h of historique || []) {
    for (const r of h.donnees || []) {
      if (r.indicateur === indicateur && r.date_inser) return true;
    }
  }
  return false;
}

// Vrai si le libellé d'indicateur appartient au groupe « Réussite »
// (regroupement à la durée : « Taux de réussite en 2 ans », « ... en
// 2 ou 3 ans », etc.). Règle métier figée dans le code car le préfixe
// est canonique côté API.
export function estIndicateurReussite(indicateur) {
  return typeof indicateur === 'string' && indicateur.startsWith('Taux de réussite en ');
}

// Extrait la « variante » d'un indicateur Réussite à partir du libellé.
// « Taux de réussite en 2 ou 3 ans » → « 2 ou 3 ans ».
export function varianteReussite(indicateur) {
  return indicateur.replace(/^Taux de réussite en\s+/, '');
}

// =============================================================================
// Découpage en groupes (utilisé par la section « Autres indicateurs »)
// =============================================================================
//
// Trois groupes mutuellement exclusifs, dans l'ordre de rendu :
//   - reussite : Array<string> des noms d'indicateurs de réussite
//                (à présenter en UN graphique multi-courbes si >= 2)
//   - simples  : Array<string> des indicateurs non-déclinables et hors
//                réussite (à présenter en lignes compactes)
//   - insertion: Array<string> des indicateurs déclinables hors réussite
//                (chacun → un graphique multi-courbes propre)
//
// Les indicateurs des axes X/Y du quadrant ne sont PAS exclus des
// groupes Réussite et Insertion — le graphique de groupe doit
// inclure TOUTES les variantes (y compris celle déjà affichée en
// card X/Y), pour montrer l'indicateur du quadrant dans son contexte.
// En revanche, les indicateurs SIMPLES qui sont en axe sont exclus,
// car ils seraient affichés en doublon sans contexte additionnel.

export function decouperGroupes(donneesCourantes, historique, indicateursAxes) {
  const axesSet = new Set((indicateursAxes || []).filter(Boolean));

  // Préserver l'ordre d'apparition dans donnees_courantes (= ordre
  // canonique dim_indicateur_cursus côté API).
  const ordre = [];
  const seen = new Set();
  for (const r of donneesCourantes || []) {
    if (!seen.has(r.indicateur)) {
      seen.add(r.indicateur);
      ordre.push(r.indicateur);
    }
  }

  const reussite = [];
  const insertion = [];
  const simples = [];

  for (const nom of ordre) {
    if (estIndicateurReussite(nom)) {
      reussite.push(nom);
    } else if (estIndicateurDeclinable(nom, historique)) {
      insertion.push(nom);
    } else if (!axesSet.has(nom)) {
      simples.push(nom);
    }
  }

  return { reussite, insertion, simples };
}

// =============================================================================
// Série multi-courbes (utilisée par GrapheMultiCourbes)
// =============================================================================
//
// Structure produite :
//   { variantes: Array<{ key, libelle }>,
//     parVariante: Map<key, Array<{millesime, taux, denominateur, nonDiffusable}>> }
//
// Pour le groupe Réussite : une variante par indicateur, libellé =
// fragment de durée extrait du nom.
// Pour un groupe Insertion : une variante par délai canonique
// (6/12/18/24/30 mois), libellé = « N mois ».

export const DELAIS_CANONIQUES = ['6', '12', '18', '24', '30'];

export function seriesReussite(reussiteIndicateurs, historique) {
  const variantes = reussiteIndicateurs.map((nom) => ({
    key: nom,
    libelle: varianteReussite(nom),
  }));
  const parVariante = new Map();
  for (const v of variantes) {
    parVariante.set(v.key, extraireSerie(historique, v.key, ''));
  }
  return { variantes, parVariante };
}

export function seriesInsertion(indicateur, historique) {
  // Filtre aux délais réellement présents dans les données — robuste
  // si on retire une variante en BDD demain.
  const presents = new Set();
  for (const h of historique || []) {
    for (const r of h.donnees || []) {
      if (r.indicateur === indicateur && r.date_inser) {
        presents.add(r.date_inser);
      }
    }
  }
  const delais = DELAIS_CANONIQUES.filter((d) => presents.has(d));

  const variantes = delais.map((d) => ({
    key: d,
    libelle: `${d} mois`,
  }));
  const parVariante = new Map();
  for (const v of variantes) {
    parVariante.set(v.key, extraireSerie(historique, indicateur, v.key));
  }
  return { variantes, parVariante };
}

// =============================================================================
// Échelle Y adaptative + graduations
// =============================================================================
//
// On ne fige plus l'axe Y à [0, 100] : on s'adapte aux valeurs
// présentes pour gagner en lisibilité, avec des garde-fous :
//   - jamais en dehors de [0, 100] (un taux ne peut pas)
//   - amplitude minimale 15 points (un graphique tassé est illisible)
//   - bornes arrondies à 5 pour des ticks lisibles
//
// Les ticks sont espacés selon l'amplitude :
//   - <= 20 pts → tous les 5
//   - <= 50 pts → tous les 10
//   - sinon    → tous les 25

export function calculerEchelleY(tauxValeurs) {
  const valides = (tauxValeurs || []).filter((t) => typeof t === 'number');
  if (valides.length === 0) {
    return { yMin: 0, yMax: 100, ticks: [0, 25, 50, 75, 100] };
  }
  const min = Math.min(...valides);
  const max = Math.max(...valides);
  const range = max - min;

  // Marge resserrée : 5 % de l'amplitude ou 0,5 point au minimum.
  // Permet aux indicateurs à petites valeurs (Taux non salarié ~1-2 %)
  // d'occuper l'espace vertical au lieu d'être écrasés contre l'axe.
  const marge = Math.max(range * 0.05, 0.5);

  let yMin = Math.max(0, min - marge);
  let yMax = Math.min(100, max + marge);

  // Amplitude minimale 3 points (au lieu de 15 historiquement) :
  // garde-fou contre le « plat parfait » d'un graphique à valeur
  // unique sans gonfler artificiellement les micro-variations.
  if (yMax - yMin < 3) {
    const milieu = (yMax + yMin) / 2;
    yMin = Math.max(0, milieu - 1.5);
    yMax = Math.min(100, milieu + 1.5);
    if (yMax - yMin < 3) {
      if (yMin === 0)        yMax = Math.min(100, 3);
      else if (yMax === 100) yMin = Math.max(0, 97);
    }
  }

  // Granularité d'arrondi adaptée : pas de pas de 5 sur une fenêtre
  // qui ferait 3 points de haut. En dessous de 10 points d'amplitude
  // brute, on arrondit au point entier.
  const amplitudeBrute = yMax - yMin;
  const granularity = amplitudeBrute < 10 ? 1 : 5;
  yMin = Math.floor(yMin / granularity) * granularity;
  yMax = Math.ceil(yMax / granularity) * granularity;

  // Pas de tick : choisi pour produire ~4-5 graduations selon
  // l'amplitude. Sous 5 points, step=1 pour rester lisible.
  const amplitude = yMax - yMin;
  let step;
  if (amplitude <= 5)       step = 1;
  else if (amplitude <= 20) step = 5;
  else if (amplitude <= 50) step = 10;
  else                      step = 25;

  const ticks = [];
  for (let t = yMin; t <= yMax + 0.001; t += step) {
    ticks.push(t);
  }

  return { yMin, yMax, ticks };
}

// Échelle Y pour des effectifs absolus (numérateur + dénominateur).
// Diffère de calculerEchelleY :
//   - pas de borne haute à 100 (on est en effectifs, pas en %)
//   - on part TOUJOURS de 0 (un effectif négatif n'a pas de sens, et
//     démarrer à 0 permet de comparer visuellement num vs denom sans
//     trompe-l'œil)
//   - on choisit un step « rond » sur des magnitudes 1/2/5 × 10^k
export function calculerEchelleYEffectifs(valeurs) {
  const valides = (valeurs || []).filter((v) => typeof v === 'number' && v >= 0);
  if (valides.length === 0) {
    return { yMin: 0, yMax: 10, ticks: [0, 5, 10] };
  }
  const max = Math.max(...valides);
  if (max === 0) {
    return { yMin: 0, yMax: 1, ticks: [0, 1] };
  }

  // Cible ~4 ticks. On choisit le step parmi 1, 2, 5 × 10^k qui
  // produit entre 3 et 6 ticks. Approche classique « nice scale ».
  const rawStep = max / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / magnitude;
  let stepBase;
  if (norm <= 1)      stepBase = 1;
  else if (norm <= 2) stepBase = 2;
  else if (norm <= 5) stepBase = 5;
  else                stepBase = 10;
  const step = stepBase * magnitude;

  const yMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let t = 0; t <= yMax + step / 2; t += step) {
    ticks.push(t);
  }
  return { yMin: 0, yMax, ticks };
}

// =============================================================================
// Palette catégorielle pour les courbes
// =============================================================================
//
// Pour un graphique multi-courbes (Réussite ou Insertion), chaque
// variante doit être discernable. Pas de dégradé — on veut
// distinguer, pas ordonner. Palette de 5 couleurs DSFR-compatibles
// (#0E0E60 est le bleu primaire) ; au-delà on cycle (cas peu probable
// — au plus 5 délais d'insertion).
const PALETTE_VARIANTES = [
  '#0E0E60', // bleu DSFR
  '#C44A4A', // rouge orangé
  '#1F8E3E', // vert
  '#B27A00', // ocre
  '#5A5A5A', // gris foncé
];

export function couleurVariante(index) {
  return PALETTE_VARIANTES[index % PALETTE_VARIANTES.length];
}
