// Calcul d'un histogramme de distribution sur 10 tranches de 10 %
// (par défaut), à partir d'une liste de bulles et d'un axe (« x » ou
// « y »). Les valeurs sont les taux côté API : nombres entre 0 et 1.
//
// Les bulles dont la valeur n'est pas un nombre (anonymes sans x/y
// jamais — cf. Quadrant.jsx, déjà filtrées en amont — mais aussi cas
// hypothétiques de non-diffusable post-traité) ne comptent pas — c'est
// cohérent avec le filtre `typeof === 'number'` déjà appliqué côté
// rendu des bulles.

export function calculerHistogramme(bulles, axe, nbTranches = 10) {
  const counts = new Array(nbTranches).fill(0);
  for (const b of bulles) {
    const v = b?.[axe];
    if (typeof v !== 'number' || v < 0 || v > 1) continue;
    const tranche = Math.min(nbTranches - 1, Math.floor(v * nbTranches));
    counts[tranche] += 1;
  }
  return counts;
}
