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
// Série mono-courbe (utilisée par MiniGrapheEvolution + Sparkline)
// =============================================================================

export function extraireSerie(historique, indicateur, dateInser) {
  const out = [];
  for (const h of historique || []) {
    const row = (h.donnees || []).find(
      (r) => r.indicateur === indicateur && (r.date_inser ?? '') === (dateInser ?? '')
    );
    if (!row) {
      out.push({ millesime: Number(h.millesime), taux: null, denominateur: null });
      continue;
    }
    out.push({
      millesime:     Number(h.millesime),
      taux:          row.taux,
      denominateur:  row.denominateur,
      nonDiffusable: row.non_diffusable === true,
    });
  }
  return out.sort((a, b) => a.millesime - b.millesime);
}

// Borne la série au premier et dernier millésime ayant au moins une
// trace (diffusable, non-diffusable, ou même simplement denom != null).
// Conserve les trous intermédiaires pour pouvoir interrompre la ligne
// proprement entre deux années renseignées.
export function decouperDomaineSerie(serie) {
  const debut = serie.findIndex((p) => p.denominateur !== null);
  if (debut === -1) return [];
  let fin = serie.length - 1;
  while (fin >= 0 && serie[fin].denominateur === null) fin--;
  return serie.slice(debut, fin + 1);
}

export function nbPointsValides(serie) {
  let n = 0;
  for (const p of serie) if (p.taux !== null) n++;
  return n;
}

// Tronçonne en segments aux points absents (taux null) — utilisé pour
// dessiner des polylines séparées au lieu d'une ligne qui sauterait
// les trous.
export function segmenter(serie) {
  const segments = [];
  let courant = [];
  for (const p of serie) {
    if (p.taux !== null) {
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
  const marge = Math.max(range * 0.1, 5);

  let yMin = Math.max(0, min - marge);
  let yMax = Math.min(100, max + marge);

  // Garantir une amplitude visuelle de 15 points (sinon le graphique
  // semble plat même si les valeurs varient).
  if (yMax - yMin < 15) {
    const milieu = (yMax + yMin) / 2;
    yMin = Math.max(0, milieu - 7.5);
    yMax = Math.min(100, milieu + 7.5);
    // Si on a buté sur une borne, on rééquilibre depuis l'autre côté.
    if (yMax - yMin < 15) {
      if (yMin === 0) yMax = Math.min(100, 15);
      else if (yMax === 100) yMin = Math.max(0, 85);
    }
  }

  yMin = Math.floor(yMin / 5) * 5;
  yMax = Math.ceil(yMax / 5) * 5;

  const amplitude = yMax - yMin;
  let step;
  if (amplitude <= 20)      step = 5;
  else if (amplitude <= 50) step = 10;
  else                      step = 25;

  const ticks = [];
  for (let t = yMin; t <= yMax + 0.001; t += step) {
    ticks.push(Math.round(t));
  }

  return { yMin, yMax, ticks };
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
