// Chargeur asynchrone du contenu méthodologique.
//
// La méthodologie est externalisée dans `public/methodologie.json` —
// servi en statique par Vite (dev) et copié dans `dist/` au build
// (prod). Objectif : permettre à l'équipe métier de modifier les
// textes directement par SFTP sur OVH sans rebuild ni redeploiement
// JS.
//
// Cycle de vie :
//   1. `chargerMethodologie()` lance le fetch (idempotent : appels
//      simultanés partagent la même promesse, appels ultérieurs
//      tapent dans le cache).
//   2. Les consommateurs synchrones (`IndicateurTooltip`,
//      `getDefinitionIndicateur`) lisent `getMethodologie()` qui
//      retourne le cache ou null.
//   3. Les exports XLSX / Word `await chargerMethodologie()` avant de
//      sérialiser — garantit que le contenu est dispo dans le fichier
//      produit même si l'utilisateur exporte avant d'avoir ouvert la
//      modale ou survolé un tooltip.
//
// Robustesse : si le fetch échoue (404, JSON malformé, etc.), on
// installe un cache vide (`{ generale: '', cursus: {} }`) — l'app
// continue de fonctionner, les tooltips sont absents, la modale
// affiche un état vide informatif. Pas d'erreur fatale.

// URL résolue à partir de BASE_URL : suit la configuration `base` de
// Vite. En dev BASE_URL='/' → '/methodologie.json'. En prod si
// `base: '/dist/'` est posé un jour → '/dist/methodologie.json'.
const URL_METHODOLOGIE = `${import.meta.env.BASE_URL}methodologie.json`;

let cache = null;
let loadingPromise = null;

export async function chargerMethodologie() {
  if (cache) return cache;
  if (loadingPromise) return loadingPromise;

  loadingPromise = fetch(URL_METHODOLOGIE)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      cache = data;
      loadingPromise = null;
      return cache;
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Erreur chargement méthodologie:', err);
      loadingPromise = null;
      // Fallback : structure vide pour ne pas planter l'app.
      cache = { generale: '', cursus: {} };
      return cache;
    });

  return loadingPromise;
}

// Accesseur synchrone. Retourne null si le cache n'est pas encore
// prêt — l'appelant doit gérer ce cas (afficher un état de chargement
// ou ne rien rendre).
export function getMethodologie() {
  return cache;
}

// Définition d'un indicateur dans le cursus donné. Synchrone : lit
// le cache. Retourne null si :
//   - le cache n'est pas encore prêt (la définition apparaîtra au
//     prochain rendu une fois le fetch terminé) ;
//   - le cursus n'est pas couvert (BUT par exemple) ;
//   - le libellé n'est pas trouvé.
// La comparaison est sur libellé normalisé (trim + lowercase).
// Les indicateurs d'insertion à délai sont rabattus sur la
// définition générale d'insertion du cursus — la méthodologie ne
// distingue pas par délai.
//
// Priorité de résolution (Phase 10 — refonte) :
//  1. Top-level `indicateurs.<libelle>` → renvoie `definition_courte`.
//     Les clés sont les libellés API EXACTS (stats_quadrant.indicateur).
//     Recherche par clé directe sur la version normalisée (trim +
//     lowercase) pour absorber les variations d'espaces / casse.
//     Une entrée par indicateur API distinct : 10 entrées au total
//     (5 variantes de réussite + poursuite + poursuivants + 3
//     d'insertion).
//  2. `cursus[X].indicateurs[]` → définition par cursus (legacy,
//     conservée pour ne pas casser d'éventuels indicateurs hors-
//     famille référencés uniquement à ce niveau).
//  3. `cursus[X].insertion` → définition générale d'insertion pour
//     les indicateurs d'insertion à délai (filet de sécurité ; la
//     voie 1 doit normalement matcher d'abord).
export function getDefinitionIndicateur(libelleIndicateur, cursus) {
  if (!cache || !libelleIndicateur || !cursus) return null;

  const norm = (s) => s.trim().toLowerCase();
  const ciblage = norm(libelleIndicateur);

  // 1. Recherche dans la structure top-level `indicateurs` (Phase 10).
  //    Les clés sont les libellés API exacts. On compare en version
  //    normalisée pour rester souple face aux variations d'espace.
  const indicateurs = cache.indicateurs || {};
  for (const [cle, ind] of Object.entries(indicateurs)) {
    if (norm(cle) === ciblage) {
      return ind.definition_courte || ind.definition_longue || null;
    }
  }

  // 2. Fallback sur la définition par cursus (legacy).
  const blocCursus = cache.cursus?.[cursus];
  if (!blocCursus) return null;

  const trouve = (blocCursus.indicateurs || []).find(
    (i) => norm(i.libelle) === ciblage
  );
  if (trouve) return trouve.definition;

  if (blocCursus.insertion && norm(blocCursus.insertion.libelle) === ciblage) {
    return blocCursus.insertion.definition;
  }

  // 3. Indicateurs d'insertion à délai — filet de sécurité si jamais
  // la voie 1 ne matche pas (libellé API divergent).
  if (
    blocCursus.insertion
    && (
      ciblage.includes('emploi salari')
      || ciblage.includes('emploi non salari')
      || ciblage.includes('emploi stable')
    )
  ) {
    return blocCursus.insertion.definition;
  }

  return null;
}
