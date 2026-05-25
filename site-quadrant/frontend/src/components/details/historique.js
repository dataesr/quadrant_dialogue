// Utilitaires de manipulation de la série historique d'un indicateur.
//
// Entrée typique : un tableau d'objets { millesime, taux, denominateur,
// non_diffusable? } construit à partir de la réponse /quadrant/details.
//
// La logique métier :
//  - un point « valide » a taux != null (qu'il soit diffusable ou non-
//    diffusable ; non-diffusable a taux=null donc non valide pour le
//    tracé — voir plus bas).
//  - un point « absent » a denominateur === null && taux === null.
//
// Pour le tracé :
//  - point plein  : taux != null
//  - point creux  : non_diffusable === true ET denominateur >= 1
//  - pas de point : taux === null ET non_diffusable !== true
//
// L'axe X s'adapte aux années de disponibilité de l'indicateur (du
// premier millésime avec UNE donnée — diffusable, non-diffusable ou pas
// de matière — au dernier), en gardant les années intermédiaires
// (lignes interrompues si l'année manque entre deux points valides).

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
      taux:          row.taux,                  // null si non diff ou absent
      denominateur:  row.denominateur,          // peut être null (pas de donnée)
      nonDiffusable: row.non_diffusable === true,
    });
  }
  return out.sort((a, b) => a.millesime - b.millesime);
}

// Renvoie la sous-série « significative » : du premier point qui n'est
// pas « pas de donnée » au dernier, en gardant les trous intermédiaires.
// Un point est « significatif » si denominateur !== null (qu'il soit ou
// non diffusable) ; ainsi les années où l'indicateur n'existait pas
// encore (insertion T+30 sur 2024) ou plus disparaissent en bord, mais
// un trou entre deux années renseignées reste visible.
export function decouperDomaineSerie(serie) {
  const debut = serie.findIndex((p) => p.denominateur !== null);
  if (debut === -1) return [];
  let fin = serie.length - 1;
  while (fin >= 0 && serie[fin].denominateur === null) fin--;
  return serie.slice(debut, fin + 1);
}

// Nombre de points « tracables » : taux non-null. C'est la base du
// gating UI : on n'affiche pas de graphe si < 2 points valides.
export function nbPointsValides(serie) {
  let n = 0;
  for (const p of serie) if (p.taux !== null) n++;
  return n;
}

// Groupe les points consécutifs avec taux != null pour tracer des
// segments de ligne. Renvoie [[p1,p2,p3], [p5,p6]] pour une série avec
// un trou à p4. Les points non-diffusables (taux=null mais
// denom>=1) interrompent aussi la ligne.
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

// ---------------------------------------------------------------------
// Profil d'insertion (indicateurs déclinables par délai)
// ---------------------------------------------------------------------
//
// Un indicateur « déclinable_delai » (Taux sortants en emploi salarié,
// non salarié, stable) existe en 5 versions : date_inser = 6/12/18/
// 24/30 mois. Plutôt que de tracer 5 évolutions temporelles
// indépendantes, on les regroupe en UN graphique « profil d'insertion » :
//   - axe X = délai (6 → 30 mois)
//   - axe Y = taux
//   - une courbe par millésime
//
// Les non-déclinables ont date_inser='' partout → on les détecte par
// la présence/absence d'au moins un date_inser non vide.

export function estIndicateurDeclinable(indicateur, historique) {
  for (const h of historique || []) {
    for (const r of h.donnees || []) {
      if (r.indicateur === indicateur && r.date_inser) return true;
    }
  }
  return false;
}

// Ordre canonique des délais (en chaîne pour rester aligné avec l'API).
export const DELAIS_CANONIQUES = ['6', '12', '18', '24', '30'];

// Retourne, pour un indicateur déclinable donné, une Map indexée par
// millésime → tableau de points { delaiNum, taux, denominateur,
// nonDiffusable } ordonnés par délai croissant. Les délais sans
// donnée pour un millésime sont remplis avec { taux: null,
// denominateur: null } pour préserver l'ordre.
export function extraireProfilInsertion(indicateur, historique) {
  const out = new Map();
  for (const h of historique || []) {
    const millesime = Number(h.millesime);
    const pointsParDelai = new Map();
    for (const r of h.donnees || []) {
      if (r.indicateur !== indicateur) continue;
      if (!r.date_inser) continue; // sécurité : ignore les tuples non déclinés
      pointsParDelai.set(r.date_inser, {
        delaiNum:      Number(r.date_inser),
        taux:          r.taux,
        denominateur:  r.denominateur,
        nonDiffusable: r.non_diffusable === true,
      });
    }
    // Reconstitution ordonnée + remplissage des absents (un millésime
    // qui n'a pas d'entrée pour un délai donné).
    const points = DELAIS_CANONIQUES.map((d) =>
      pointsParDelai.get(d) || {
        delaiNum: Number(d),
        taux: null,
        denominateur: null,
        nonDiffusable: false,
      }
    );
    out.set(millesime, points);
  }
  return out;
}

// Liste ordonnée chronologiquement des millésimes ayant au moins UNE
// entrée pour l'indicateur (point valide ou non-diff). Sert à dessiner
// uniquement les courbes pertinentes et à construire la légende.
export function millesimesAvecDonnees(profil) {
  const result = [];
  for (const [m, points] of profil.entries()) {
    if (points.some((p) => p.taux !== null || p.nonDiffusable)) {
      result.push(m);
    }
  }
  return result.sort((a, b) => a - b);
}

// Palette pour le profil : millésime courant = bleu DSFR primaire,
// autres = dégradé de gris (du plus clair pour le plus ancien au
// plus foncé pour le plus récent, en sautant le courant). Discrimine
// sans surcharger ; le courant reste mis en avant comme « ce que vous
// regardez dans le quadrant ».
export function couleursParMillesime(millesimes, millesimeCourant) {
  const sorted = [...millesimes].sort((a, b) => a - b);
  const courant = Number(millesimeCourant);
  const result = new Map();
  const autres = sorted.filter((m) => m !== courant);
  const n = autres.length;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    // Interpolation linéaire de #d0d0d0 (clair) à #4a4a4a (foncé).
    const v = Math.round(208 + (74 - 208) * t);
    const hex = v.toString(16).padStart(2, '0');
    result.set(autres[i], `#${hex}${hex}${hex}`);
  }
  if (sorted.includes(courant)) result.set(courant, '#0E0E60');
  return result;
}
