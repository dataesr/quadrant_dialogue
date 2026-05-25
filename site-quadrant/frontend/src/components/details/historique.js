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
