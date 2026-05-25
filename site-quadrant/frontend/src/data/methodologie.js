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
export function getDefinitionIndicateur(libelleIndicateur, cursus) {
  if (!cache || !libelleIndicateur || !cursus) return null;

  const norm = (s) => s.trim().toLowerCase();
  const ciblage = norm(libelleIndicateur);

  const blocCursus = cache.cursus?.[cursus];
  if (!blocCursus) return null;

  const trouve = (blocCursus.indicateurs || []).find(
    (i) => norm(i.libelle) === ciblage
  );
  if (trouve) return trouve.definition;

  if (blocCursus.insertion && norm(blocCursus.insertion.libelle) === ciblage) {
    return blocCursus.insertion.definition;
  }

  // Indicateurs d'insertion à délai (cf. dim_indicateur_cursus :
  // declinable_delai=1). Pas de définition spécifique au délai —
  // on rabat sur la définition générale d'insertion du cursus.
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
