# Projet Quadrant — Brief pour Claude Code

Ce document fournit le contexte permanent du projet. Le lire en début de session, ne pas y revenir ensuite sauf si demandé.

---

## Environnement de développement local

- **Machine** : Mac sans PHP installé. Toute commande PHP locale échoue (`php`, `php -l`, `php -S`, `composer`). NE PAS tenter.
- **Test PHP** :
  - syntaxe : `ssh ovh 'php -l /homez.10002/mesouvm/quadsies/api/<chemin>'`
  - endpoint : `curl -sS "https://quadsies.dgesip.fr/api/<route>"` (mode dev actif, `contexte_id=zKsfQ` accepté en query — cf. §7 pour la liste des contextes de test et leur niveau)
- **Déploiement PHP** : `scp <fichier local> ovh:/homez.10002/mesouvm/quadsies/api/<chemin distant>`. Alias SSH `ovh` configuré (user `mesouvm-app`, host `ssh01.cluster121.gra.hosting.ovh.net`).
- **Production API** : `https://quadsies.dgesip.fr/`. Le frontend en dev (`npm run dev`) proxie `/api` vers cette URL.
- **Frontend** : Node + Vite installés localement, `npm run dev` / `npm run build` fonctionnent.

## Pièges techniques connus (résolus en sessions précédentes — ne pas redébugger)

### Mode clair DSFR ne tient pas malgré `data-fr-scheme="light"`
La DSFR (`dsfr.module.js` l.3826) lit en PRIORITÉ `localStorage.getItem('scheme')` AVANT l'attribut HTML. Si une visite antérieure a stocké 'system' ou 'dark', l'attribut HTML est ignoré. Solution déjà en place dans `index.html` :
```html
<html lang="fr" data-fr-scheme="light" data-fr-theme="light">
  <head>
    ...
    <script>try { localStorage.setItem('scheme', 'light'); } catch (_) {}</script>
  </head>
</html>
```
Le `data-fr-theme="light"` posé en dur en complément évite un flash sombre au boot.

### PDO `Invalid parameter number` (`SQLSTATE[HY093]`)
`Database.php` configure PDO avec `ATTR_EMULATE_PREPARES = false`. Les prepared statements natifs MySQL n'acceptent PAS un même placeholder nommé à plusieurs endroits du SQL. Solution : dédoubler les bindings avec des alias distincts (`:var1_num`, `:var1_denom`, `:var1_pop`…) en bindant la même valeur à chaque alias.

---

## 1. Vue d'ensemble

**Nature** : application web **transitoire** de visualisation par quadrants à bulles pour comparer les indicateurs de réussite et d'insertion d'établissements universitaires. Inspirée d'un outil Tableau MESR-SIES existant.

**Caractère transitoire** : l'application sera remplacée à terme par un outil dédié. Cela conditionne nos choix : pragmatisme avant tout, simplicité avant optimisation, fonctionnalité avant raffinement.

**Périmètre métier** : 8 onglets (4 cursus × 2 vues), 11 indicateurs, 3 rôles utilisateurs (établissement, rectorat, national), filtres disciplinaires, calculs statistiques avec règles de diffusion.

---

## 2. Architecture

```
┌─────────────────────────┐         ┌─────────────────────────┐
│  Site hôte              │         │  App Quadrant           │
│  etablissement.exemple  │         │  quadrant.exemple.fr    │
│  PHP 5.6 (existant)     │         │  PHP 8.x + React        │
│  OVH Mutualisé          │         │  OVH Mutualisé          │
└──────────┬──────────────┘         └────────┬────────────────┘
           │                                  │
           │ 1. Iframe avec POST caché        │
           │    (3 tokens)                    │
           └──────────────► iframe React ─────┤
                                              │
           ◄──── 2. Vérification ─────────────┤
                 server-to-server             │
                 (3 tokens → contexte_id)     │
                                              │
                                              ▼
                                    ┌─────────────────┐
                                    │  MySQL OVH      │
                                    │  stats_quadrant │
                                    │  572K lignes    │
                                    └─────────────────┘
```

**Mac (dev)** : édite le code, push vers GitHub, déploie vers OVH (rsync ou FTP).
**OVH (prod et dev)** : héberge l'API PHP, la BDD, et l'iframe React une fois buildée.
**GitHub** : repo privé, source de vérité du code.

### Chemins de référence

**Sur le Mac (poste de développement)** :
```
/Users/yann/quadrant/quadrant/          ← racine du repo Git
├── CLAUDE.md
├── docs/
├── site-quadrant/
│   ├── api/                            ← code de l'API PHP
│   └── frontend/                       ← code du React (Vite)
└── site-hote/
```

**Sur OVH (déploiement)** :
```
/quadsies/                              ← racine web de quadrant.exemple.fr
├── api/                                ← API PHP déployée (copie de site-quadrant/api/)
└── dist/                               ← build React déployé (sortie de "npm run build")
```

Cette séparation en deux sous-dossiers permet :
- Des déploiements indépendants de l'API et du React
- D'éviter tout effacement accidentel des fichiers de l'autre côté
- Une structure claire pour les sauvegardes et le suivi

**URLs résultantes** :
- `https://quadrant.exemple.fr/api/health` → endpoint de santé
- `https://quadrant.exemple.fr/api/quadrant?...` → endpoint principal
- `https://quadrant.exemple.fr/dist/` → iframe React (URL ciblée par le formulaire POST du site hôte)

**Configuration Vite associée** : `vite.config.js` doit déclarer `base: '/dist/'` pour que les chemins relatifs vers les assets après build pointent correctement.

**GitHub** : `https://github.com/dataesr/quadrant_dialogue` (repo privé)

---

## 3. Stack technique

| Composant | Techno |
|---|---|
| API quadrant | PHP 8.x natif, **pas de framework**, **pas de Composer** |
| BDD | MySQL/MariaDB OVH mutualisé, charset utf8mb4 |
| Iframe | React 18 + Vite, **JavaScript** (pas TypeScript) |
| Site hôte | PHP 5.6 (existant, immuable) |
| Versionnement | Git + GitHub privé |
| Déploiement | Manuel (rsync ou FTP), pas d'automatisation CI/CD pour l'instant |

**Pas de** : Composer, framework PHP (Laravel/Symfony), TypeScript, framework UI (Material UI, Ant Design...), Tailwind, Redux, ORM, tests automatisés systématiques.

**OUI** : PDO, fetch (ou axios), CSS vanille ou modules CSS, composants React fonctionnels avec hooks.

---

## 4. Conventions de code

### PHP

- PHP 8.x strict, typages quand pertinents
- PSR-12 pour le style, sans en faire une religion
- PDO préparé partout, **jamais** de concaténation dans les requêtes SQL
- Réponses JSON via `Response::json()` (déjà en place)
- Erreurs via `Response::error()` avec code + message clair
- Pas de `print_r` ni `var_dump` dans le code commité

### React / JS

- Composants fonctionnels uniquement, pas de classes
- Hooks : `useState`, `useEffect`, `useMemo`, `useCallback` selon besoin
- Pas de gestion d'état globale lourde (Redux/Zustand) : `useState` + `props` ou Context API si nécessaire
- Nommage en français pour les variables métier (`bulles`, `mentionsNonRepresentees`), en anglais pour les variables techniques (`useState`, `onClick`)
- Pas de bibliothèque UI : tout est custom CSS sobre
- SVG natif pour le quadrant (pas de wrapper, on contrôle tout)

### CSS

- Pas de Tailwind, pas de Bootstrap
- CSS modules ou styles colocalisés selon le composant
- Variables CSS pour les couleurs (les 17 secteurs + les 5 catégories sont définies dans le cadrage)
- Approche sobre, professionnelle, **pas d'emojis** dans l'UI
- Desktop only (≥ 1024 px). Sous cette résolution, message d'avertissement non bloquant.

### Sécurité

- Credentials jamais commités (`config.php` est dans `.gitignore`)
- Validation stricte de tous les paramètres entrants
- HTTPS obligatoire en production
- CORS strict en production (origine = site hôte uniquement)
- Pas de `eval`, pas de `unserialize` sur input externe

---

## 5. Structure du repo

```
quadrant-projet/
├── CLAUDE.md                    ← ce document
├── README.md
├── .gitignore
├── docs/
│   ├── cadrage-quadrant.md      ← spec métier complète (référence)
│   ├── CONTRATS.md              ← contrats API ↔ site hôte
│   ├── INSTALL.md               ← brief d'installation
│   └── migrations/
│       └── 001_init.sql         ← script init BDD (déjà exécuté)
│
├── site-quadrant/
│   ├── api/                     ← API PHP 8 (à déployer sur OVH)
│   │   ├── index.php            ← point d'entrée + routage
│   │   ├── .htaccess
│   │   ├── config/
│   │   │   ├── config.example.php
│   │   │   └── config.php       ← gitignored
│   │   ├── lib/
│   │   │   ├── Database.php     ← singleton PDO
│   │   │   ├── Response.php     ← helpers JSON / CORS
│   │   │   ├── Session.php      ← validation tokens + cache
│   │   │   └── Diffusion.php    ← règles statistiques
│   │   └── endpoints/
│   │       ├── health.php
│   │       └── quadrant.php
│   ├── frontend/                ← React (Vite)
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.js
│   └── tests/
│       └── test-api.html        ← page de test manuel
│
└── site-hote/                   ← composants pour le site hôte PHP 5.6
    ├── verify-session.php
    └── embed-quadrant.php
```

---

## 6. État d'avancement

**Livré et fonctionnel** :
- BDD MySQL initialisée et chargée (572 180 lignes dans `stats_quadrant`)
- API PHP : endpoints `/health`, `/quadrant`, `/quadrant/details`, `/referentiel/disciplinaire`, `/referentiel/millesimes`, `/referentiel/variables` et `/etablissements-visibles` opérationnels en mode dev
- Frontend React : projet Vite initialisé dans `site-quadrant/frontend/`.
  - Phase 1 — structure de dossiers, couche service `src/services/api.js` avec wrapper `fetch` + `ApiError`. Proxy Vite optionnel via `VITE_API_PROXY_TARGET` pour contourner CORS en dev.
  - Phase 2 — squelette UI : `src/context/AppContext.jsx` (Provider + `useApp()` hook ; charge `/etablissements-visibles` au montage et déduit `mode` = `"etab"` | `"rectorat_national"`), composants `EtabSelector`, `ViewTabs`, `CursusTabs`, `EmptyState`. Trois états gérés : chargement / établissement unique auto-sélectionné / sélection requise. Onglets désactivés tant qu'aucun étab n'est sélectionné.
  - Phase 3 — filtres : `FilterBar` (millésime + variable X + date X + variable Y + date Y, dates conditionnelles à `declinable_delai`), `AdvancedFilters` (panneau replié avec domaine/discipline/secteur/mention/type Master/représentativité/ligne de référence + bouton « Réinitialiser », auto-dépli si au moins un filtre actif). Référentiels chargés via le hook `useReferentiels` (cache par `formation` ou `(formation, millésime)`). Setters intelligents : `setCursus` reset le cascade (millésime, variables, dates, disciplinaire, typeMaster) ; `setVariableX/Y` ajustent automatiquement la date d'insertion selon `declinable_delai`. Interdépendance X↔Y maîtrisée dans `FilterBar` à partir de `couples_autorises`. Palette `src/utils/colors.js` posée pour la phase 4.
  - **Habillage : DSFR** ([Système de Design de l'État](https://www.systeme-de-design.gouv.fr/)). Tous les composants utilisent les classes DSFR vanilla — `fr-segmented` pour les onglets vue/cursus, `fr-select-group` pour les sélecteurs, `fr-checkbox-group` pour la représentativité, `fr-collapse` pour le panneau avancé (collapse géré en React state, pas par le JS DSFR — moins de surprises avec un arbre dynamique), `fr-alert--error`/`fr-alert--info` pour les messages. Seul `src/styles/global.css` porte du CSS custom (~10 lignes : cadre 1000px). **Agrément DINUM à demander** avant prod, cf. `site-quadrant/frontend/README.md`.
  - `/health?check=full` : diagnostic de cohérence `dim_indicateur_cursus` ↔ `stats_quadrant` (indicateurs non référencés, indicateurs sans données, incohérences `declinable_delai`/`date_inser`). À déclencher après chaque import ETL.
  - `/quadrant/details` : tooltip enrichi au clic. Vérifie l'autorisation via `filtre_perimetre`, rate-limité à 30 appels/min/contexte via `lib/RateLimit.php` (table `app_rate_limit`, cf. migration `002_rate_limit.sql`). Renvoie identité + données courantes + historique multi-millésimes, normalisés contre `dim_indicateur_cursus` avec règles de diffusion (denom < 5 → non_diffusable).
  - `/quadrant/serie-temporelle` (Phase 11a) : retourne `{ bulles, axes }` pour tous les millésimes communs aux deux variables. Alimentera la future modale d'animation temporelle. Spécificités vs `/quadrant` : (1) seuil diffusable appliqué systématiquement sur denom_x ET denom_y (toutes les formes deviennent `rond`, pas de fragiles 5-19) ; (2) IDs anonymes stables cross-millésimes via **HMAC-SHA256 salé** `anon_<8 chars hex>` (cf. `lib/Anonymizer.php` + `config.anonymization.secret`, Phase 11b T0) — crc32 utilisé initialement était réversible car id_paysage est public et stable ; (3) tous les modes d'axes calculés en parallèle (Mentions : 3 paires médiane/moyenne étab + moyenne nationale ; Établissements : médiane + moyenne) — permet bascule sans refetch côté frontend. Stratégie SQL : 2 requêtes flat (une par indicateur) sur `millesime IN (…)` + jointure PHP via Map (millesime, diplom, id_paysage), ~9× plus rapide qu'un self-join répété par millésime. Bench Master vue=etablissements 4 millésimes : ~1,8 s end-to-end. **Pré-requis déploiement** : générer `openssl rand -hex 32` et poser dans `config.anonymization.secret` (sentinelle `CHANGE_ME_BEFORE_DEPLOY` refusée par `Anonymizer::init` → 500 explicite).
- Squelette `verify-session.php` (PHP 5.6) — requête SQL de jointure à compléter côté équipe site hôte
- Composant `embed-quadrant.php` (PHP 5.6) prêt à utiliser
- Page de test `test-api.html` fonctionnelle
- Cadrage complet figé dans `docs/cadrage-quadrant.md`

**Phase 12-13 — performances + loaders + distributions + corrections** :
- Animation temporelle : transitions via la **propriété CSS** `transform: translate(Xpx, Ypx)` posée en `style={...}` inline. Le passage initial par l'**attribut SVG** `transform=` (Phase 12-13 commit 0c1bf0b) cassait l'interpolation CSS — les bulles sautaient au lieu de glisser. La propriété CSS est composite par le GPU et animable de façon fiable cross-navigateur. Volumétrie réelle observée : ~80 bulles maximum par millésime en vue Positionnement (pas ~700 comme estimé initialement) — la perf n'est plus le moteur principal du choix, mais la propriété CSS reste préférable à l'animation `cx/cy` pour la stabilité de rendu Firefox/Chromium. Voir `QuadrantAnime.jsx`.
- Lecture auto stable : le ref `millesimePrecedentRef` (lu par `setInterval` pour décider du prochain millésime) est synchronisé **inconditionnellement** par un useEffect dédié. Avant ce fix, en vue Positionnement (`traceContinueEnabled` était à `false`), le ref n'était jamais mis à jour, le timer avançait au 2ᵉ millésime puis se figeait. La trace continue est désormais active dans les **deux** vues.
- Trace continue = **trajectoire complète** depuis le premier millésime jusqu'au millésime courant (esprit Gapminder). Le plafond initial de 3 segments (Phase 11b v2) était arbitraire — supprimé. La trace est désormais **dérivée** des données via `useMemo` plutôt qu'accumulée dans un state : la cohérence est garantie quel que soit le sens du parcours (slider arrière → trace se raccourcit, slider avant → s'allonge, snap loop → repart à un point unique). Pas de plafond → ~5 segments max pour 6 millésimes, coût trivial.
- Valeur de référence affichée sur les axes : libellé enrichi de la forme « Moyenne nationale : 75,5 % » sur le quadrant principal (`LignesReference.jsx`) et la modale d'animation (`QuadrantAnime.jsx`). Format français : 1 décimale, virgule, espace insécable avant le %. La valeur se met à jour à chaque changement de mode de référence et à chaque millésime dans la modale.
- Loaders avec anti-flash 350 ms (hook `useDelayedLoading`) :
  - `LoaderQuadrant` : mini-quadrant 4 cellules qui s'allument en rotation, couleurs des grands domaines (DEG/LLA/STS/SHS) — affiché dans `Quadrant.jsx` pendant le fetch de `/quadrant`.
  - `LoaderBarre` : barre indéterminée — affichée dans `ModaleAnimation.jsx` pendant le fetch de `/quadrant/serie-temporelle`.
  - Tous deux respectent `prefers-reduced-motion` (animation stoppée, opacité fixée).
  - L'instance off-screen d'export (`forExport=true`) ne montre pas le loader animé : elle sert exclusivement de source à `html-to-image` et garde un Skeleton statique pour éviter qu'un export déclenché pendant un fetch ne capture le loader.
  - **Promotion #dataESR** (`PromoDataEsr.jsx`) injectée sous chaque loader. Fade-in 600 ms après 1 s d'attente — visible uniquement sur les chargements > ~1,35 s en cumulé (350 ms d'anti-flash + 1 s de délai). Lien externe vers `https://data.esr.gouv.fr` (`target="_blank"` + `rel="noopener noreferrer"`), tout le bloc cliquable. Contraste graphique caractéristique de la marque : `#data` en gras 700, `ESR` en light 300, bleu Marianne `#000091`. URL en bleu DSFR `#0063CB`. `aria-label` explicite (« ouvre dans une nouvelle fenêtre »). Animation respectée sous `prefers-reduced-motion` (apparition instantanée).
- **Filtre « Même typologie uniquement »** (vue Positionnement uniquement) : case à cocher dans `AdvancedFilters`, restreint les étabs affichés à ceux qui partagent la typologie de l'étab de contexte. Backend pré-fetche la typologie d'`etab_contexte` (1 ligne) puis ajoute un `AND m1.typologie_d_universites_et_assimiles = …` au WHERE — pas de sous-SELECT corrélé (planner MySQL pas toujours malin). Cas dégénéré (typologie de l'étab inconnue en BDD) : checkbox sans effet plutôt que vidage total. Filtre **non** appliqué à la moyenne nationale (qui reste un agrégat France entière). S'applique à `/quadrant` ET à `/quadrant/serie-temporelle` pour la cohérence avec la modale d'animation.
- **Delta vs millésime précédent** : chaque bulle de `/quadrant` expose `x_prev` et `y_prev` (coordonnées au millésime-1 pour la même mention/étab et les mêmes filtres). Calcul côté SQL via `millesime IN (current, prev)` + split + agrégation appliquée aux deux seaux (helper PHP `agregerLignesParVue`), jointure par clé stable (`diplom` en vue Mentions, `id_paysage` en vue Positionnement — l'anonymisation se fait *après* la jointure donc reste correcte). Côté frontend, `utils/formatDelta.js` produit « (+0,3 pt) » / « (-3,0 pt) » / « (0,0 pt) » / chaîne vide si pas de précédent ; affiché dans le tooltip de bulle (`QuadrantTooltip`) et dans la valeur principale des cards X/Y du panneau de détails (`ValeurCourante`, qui lit la ligne précédente dans `historique` via `trouverLignePrecedente`). Couleur neutre (gris) — un vert/rouge porterait un jugement implicite (« mieux/moins bien ») trompeur pour certains axes. Sémantique à garder en tête : c'est une comparaison **deux cohortes différentes** d'étudiants (millésime N vs N-1), pas un suivi longitudinal.
- **Tracking du contexte dans Matomo** : le `contexte_id` (5 alphanum, identifie un périmètre — étab, rectorat, national — partagé entre plusieurs utilisateurs, donc **pas une PII**) est posé en **Custom Variable** Matomo au scope `visit`, slot 1 (`'contexte_id'`). Tous les events de la session héritent du tag, on peut filtrer les stats Matomo par contexte sans enrichir chaque `trackEvent`. Source du contexte : helper partagé `getContexteId()` dans `services/api.js` — lit le `<meta name="contexte-id">` en iframe prod puis retombe sur `getContexteIdDev()` (query string + `VITE_CONTEXTE_ID_DEV`) en dev local. Note de migration : les Custom Variables sont marquées « legacy » dans la doc Matomo ; le code peut basculer vers une Custom Dimension sans changement frontend dès que l'admin MESRE crée le slot côté instance.
- Histogrammes de distribution (toggle « Afficher les distributions » dans `AdvancedFilters`, désactivé par défaut). Quand actif, le quadrant affiche 10 barres en haut (axe X) et 10 barres à droite (axe Y) comptant les bulles par tranche de 10 %. Bandes posées dans les marges existantes (top/right = 50 px) — pas de réduction de l'aire de plot, pas de débordement de l'iframe. S'applique aux deux vues. Pas pris en compte dans le compteur de filtres actifs (option d'affichage purement visuelle).
  - **Tooltip de répartition** au survol d'une barre : « 70 % - 80 % : 5 / 22 (23 %) » — borne basse/haute, compte de la tranche, total sur l'axe, pourcentage. Conteneur visuel commun avec le tooltip de bulle (`.quadrant-tooltip`), positionnement géré par `useAutoPlacement`.
  - **Masquage au zoom** : les barres sont calculées sur l'échelle 0..100 et restent dans les marges, donc elles ne suivent pas les bulles repositionnées par d3-zoom — incohérence visuelle. Le composant n'est plus rendu dès que `transform.k !== 1` ou que `transform.x/y !== 0`. Réapparition au reset du zoom (bouton ⌂ ou double-clic).
  - L'instance off-screen lit `afficherDistributions` depuis le même `AppContext` — les histogrammes sont donc inclus dans l'export PNG quand le toggle est actif (le zoom n'est jamais actif sur cette instance, qui rend l'état non-zoomé). Voir `Histogrammes.jsx` + `utils/histogramme.js`.

**Phase 14 — Analyse de l'insertion par sous-population** :
- **Nouvelle table BDD `stats_sous_populations`** (~2,64 M lignes, chargée sur OVH). Croise l'insertion d'une mention (`id_paysage` + `diplom` + `millesime` + `date_inser` ∈ {6,12,18,24,30}) selon 4 critères : `obtention_diplome` (ensemble | diplômé), `genre` (ensemble | femme | homme), `nationalite` (ensemble | français), `regime_inscription` (ensemble | apprentissage). Effectifs bruts : `nb_etudiants`, `nb_poursuivants`, `nb_sortants`, `nb_sortants_emploi_sal_fr`, `nb_sortants_emploi_non_sal`, `nb_sortants_emploi_stable`. Sécurité d'accès via `filtre_perimetre` (même format `;id_nat;id_reg;id_paysage;`). **Pas de colonne d'intitulé** : les libellés (mention, établissement) sont lus dans `stats_quadrant`. Faits vérifiés en BDD : `nb_etudiants = nb_poursuivants + nb_sortants` ; `nb_etudiants`/`nb_poursuivants`/`nb_sortants` (et donc `taux_poursuivants`) **constants entre durées** — seuls les 3 indicateurs d'emploi varient avec `date_inser` ; toutes les 24 combinaisons ne sont pas toujours présentes (ex. `homme`+`apprentissage` absent dans ~65 % des mentions Master) → l'API doit dégrader gracieusement en « n.s. ».
- **Config `analyse_sous_populations.seuil`** (20 par défaut). Effectif minimum sous lequel une valeur est masquée : sur `nb_etudiants` pour le Taux de poursuivants (centré entrants), sur `nb_sortants` pour les taux d'emploi (centrés sortants). L'endpoint refuse de répondre (500 explicite) si la clé est absente — garde-fou cohérent avec la Phase 11.
- **Endpoint `/api/analyse-sous-populations`** (`?id_paysage&diplom&millesime[&date_inser]`). Une seule requête ramène toutes les lignes de la mention (≤ ~120). Réponse : `contexte`, `durees_disponibles`, `donnees_par_duree[durée] = { reference, sous_populations[] }` (référence diplômé/ensemble/français/ensemble + 7 sous-populations : femmes, hommes, apprentis, femmes apprenties, hommes apprentis, « Diplômés et non diplômés français » [effet diplomation, obtention=ensemble], « Diplômés français et étrangers » [effet nationalité, nationalité=ensemble]) avec taux + écarts (sous-population − référence, en points) + `diffusable`, et `repartitions` (genre/nationalité/régime/devenir de la promo) **indépendantes de date_inser**, avec `_sous_seuil` listant les segments grisés. 403 hors-périmètre, 404 sans données.
- **Enrichissement `/quadrant/details`** : ajoute `analyse_sous_populations { disponible, nb_etudiants_reference }` pour activer/désactiver le bouton sans appel supplémentaire. ⚠ `nb_etudiants_reference` est lu **directement sur la référence de `stats_sous_populations`** (diplômé/ensemble/français/ensemble), **PAS** sur le dénominateur du Taux de poursuivants de `stats_quadrant` : ce dernier est empiriquement **~5× plus élevé** (les deux tables comptent des populations différentes — la convention métier annoncée « denom poursuivants = nb_etudiants référence » est fausse dans les données). Le drapeau doit refléter exactement la référence qu'affichera la modale, sinon un bouton actif ouvrirait une modale « effectifs insuffisants ».
- **Frontend** : bouton « Analyse de l'insertion par sous-population » en bas de la fiche détaillée (`DetailsPanel.jsx`, deux vues), ouvre `ModaleAnalyseSousPopulations` (large ~90 % viewport, état local au panneau). Cartouche : « Étudiants inscrits en année terminale en {millésime} — Référence : diplômés français (N=…) ». Deux sections : `TableauEcarts` et `MiniQuadrantSousPop` (mini-quadrant animé sur la durée d'observation, axes emploi salarié FR × emploi stable, bulles colorées par critère via `COULEUR_CRITERE_SOUS_POP`). La modale hérite du millésime du quadrant et d'une durée initiale (`dateInserX || dateInserY`), puis l'animation pilote la durée.
- **Tableau regroupé par impact** (Phase 14.1) : `TableauEcarts` structure les sous-populations en 4 groupes (Impact du genre / de l'apprentissage / de la diplomation / de la nationalité). Chaque groupe = ligne titre + barre de répartition empilée 100 % (composition de la promo sur ce critère, dérivée **côté client** des `nb_etudiants` des sous-populations + seuil `data.contexte.seuil_applique` ; segments sous le seuil hachurés, tooltip sans effectif) + lignes de sous-populations. La répartition « devenir de la promo » reste à venir (sankey, phase ultérieure). L'ancien composant standalone `RepartitionsPromo` a été supprimé (fusion dans le tableau).
- **Onglets + cartouche enrichi** (Phase 14.2) : la modale est structurée en **onglets DSFR** (`fr-tabs`) pilotés en React — `Comparaison` (TableauEcarts), `Quadrant` (mini-quadrant), `Parcours` (placeholder du futur sankey). Le cartouche commun (au-dessus des onglets) affiche le total des inscrits (`contexte.nb_total_inscrits` = ligne ensemble/ensemble/ensemble/ensemble, exposée par l'API) et la référence avec son % du total. Quitter l'onglet Quadrant met l'animation en pause. ⚠ Le slider DSFR `fr-tabs` (panneaux superposés `left:-100%` déplacés par transform via le JS DSFR) est **neutralisé en CSS** (`.modale-asp-tabs`) puisqu'on pilote l'onglet actif en React, sinon le panneau actif partirait hors écran. Seul le panneau actif scrolle → l'en-tête du tableau est **sticky**. Les barres de répartition reprennent les **couleurs des bulles** (`COULEUR_CRITERE_SOUS_POP`, modalité de référence saturée / complémentaire translucide). Le tooltip des barres est rendu en **portail `position:fixed`** (coordonnées viewport) — corrige un décalage de positionnement lié au scroll/cascade.
- **Ajustements modale** (Phase 14.3) : le cartouche est une **bande dédiée** entre le titre et les onglets (`.modale-asp-cartouche`, sibling de `fr-tabs`). Le tooltip portalisé reçoit `z-index:10000` (au-dessus de l'overlay z-index 200, qui le masquait). L'**en-tête sticky est abandonné** (peu robuste en iframe) au profit d'un **rappel d'en-tête** (`tr.ligne-rappel-entete`, `aria-hidden`) inséré au début de chaque rubrique d'impact, dans le même `<table>` (alignement des colonnes préservé). L'onglet **Comparaison** porte un **slider de durée** (sans play/vitesse, ticks cliquables) pilotant `dureeCourante` partagé avec le mini-quadrant ; masqué si une seule durée disponible.
- **Corrections modale** (Phase 14.4) : **onglets sous le cartouche** — le reorder 14.3 n'avait aucun effet visuel car DSFR pose `fr-tabs__list { order:1 }` / `fr-tabs__panel { order:3 }` et la neutralisation 14.2 avait remis le panneau à `order:initial` (=0), le faisant passer AVANT la liste en `flex-direction:column` → onglets en bas. Fix : `order:0` sur la liste, `order:1` sur le panneau. **Marge** : padding horizontal porté sur `.fr-tabs__list` ET `.fr-tabs__panel` (1.25rem) au lieu du conteneur, le texte du tableau ne colle plus au bord. **Couleurs cohérentes bulles ↔ barres** : passage d'une couleur par **critère** à une couleur par **modalité** (`COULEUR_MODALITE_SOUS_POP` + dérivés `COULEUR_BULLE_SOUS_POP` / `COULEUR_SEGMENT_SOUS_POP`) — chaque modalité (Femmes, Hommes, Apprentis, Non-apprentis, Diplômés, Non-diplômés, Français, Étrangers) a EXACTEMENT la même couleur dans le mini-quadrant et dans les segments de barre (plus d'`opacity:0.5`). Les unions prennent la couleur distinctive (ensemble_diplomation → non-diplômés, tous_nationalite → étrangers) ; croisements genre×régime gardent `#8B6FB0`. Texte de segment clair/sombre selon la luminance. Légende du mini-quadrant refaite par bulle (mêmes couleurs).
- **Mini-quadrant — zoom & libellés** (Phase 14.1) : bouton « Zoomer sur les bulles » (cadrage auto sur la bounding box des bulles + marge 10 %, marge mini si concentrées) ; reset du zoom au lancement de l'animation (`enLecture`) car les bulles bougeraient hors cadre ; libellés courts à côté des bulles **uniquement quand le zoom est actif** (placement anti-chevauchement 4 positions, halo blanc). Zoom d3-zoom + tooltip `.quadrant-tooltip` comme le quadrant principal.
- **Animation sur la durée d'observation** (et non le millésime) : boucle 6→12→18→24→30, bouclage fin de cycle fade-out → snap → fade-in (pas de glissement 30→6, chronologiquement absurde), 3 vitesses. Même moteur que la modale temporelle (`setInterval` + ref synchronisé inconditionnellement, traces dérivées via `useMemo`, bulles translatées par la **propriété CSS** `transform`).

**Phase 14.5 — Onglet « Parcours » : sankey comparatif de l'insertion** :
- **Enrichissement `/analyse-sous-populations`** : chaque `donnees_par_duree[durée]` expose désormais un bloc `sankey` (en plus de `reference` et `sous_populations`). Pour chacun des 4 critères (`genre`, `apprentissage`, `diplomation`, `nationalite`), `sankey[critère] = { disponible, raison_indisponibilite, sous_populations[2] }`. Chaque sous-population porte sa décomposition du devenir : `nb_etudiants`, `nb_poursuivants`, `nb_sortants`, `nb_sortants_emploi_sal_fr`, `nb_sortants_emploi_non_sal`, `nb_sortants_autres` (= `nb_sortants − sal_fr − non_sal`, complément à 100 % des sortants). Périmètre : **diplômés français**. Les sous-pop dérivées sont calculées **par soustraction ligne à ligne** (non-apprentis = réf − apprentis ; non-diplômés = ensemble/français − diplômé/français ; étrangers = diplômé/ensemble-nat − diplômé/français). Cas `base.nb_etudiants < sub.nb_etudiants` (incohérence source) → dérivée traitée comme absente. `disponible=true` ssi les 2 sous-pop existent ET `nb_sortants >= seuil` chacune ; sinon `raison_indisponibilite ∈ { sous_population_absente, effectif_<slug>_sous_seuil }` (`<slug>` = femmes/hommes/apprentis/non_apprentis/diplomes/non_diplomes/francais/etrangers → le frontend en dérive le tooltip du sélecteur grisé). Helpers PHP `construireSankey` / `sankeyPop`.
- **Composant `SankeyParcoursSousPop.jsx`** (remplace le placeholder de l'onglet « Parcours ») : sankey **d3-sankey** à 3 colonnes — (0) les 2 sous-populations comparées, (1) Poursuivants / Sortants (nœuds **fusionnés**, totaux), (2) Emploi salarié FR / non salarié / Autres situations. Les flux gardent la **couleur de leur sous-population d'origine** (`COULEUR_MODALITE_SOUS_POP`) à la traversée du nœud « Sortants » via des **liens parallèles** Sortants→col2 (un par sous-pop) plutôt qu'un nœud invisible — d3-sankey colore chaque lien indépendamment, sans rupture visuelle. Sélecteur de critère en 4 pilules (grisées + `title` explicatif quand indisponible, repli auto sur le 1ᵉʳ critère disponible, dérivé en rendu pour éviter un flash). Slider de durée identique à l'onglet Comparaison (`dureeCourante` partagé via `onChangerDuree`). Tooltips en **portail `position:fixed` z-index 10000** (immune au scroll du panneau) : sur un flux « libellé → cible / N personnes (% des inscrits de la sous-pop) », sur un nœud « N personnes (% de la promotion comparée) + décomposition par sous-pop ». Étiquettes de nœud col-0 raccourcies (`LABEL_COURT_MODALITE`) pour ne pas déborder du SVG (libellé complet conservé dans la légende + tooltips). Message « Aucune comparaison… disponible » si les 4 critères sont indisponibles. SVG `viewBox 720×430`, largeur 100 %.
- **Dépendance ajoutée** : `d3-sankey` (^0.12.3) — `sankey`, `sankeyLeft`, `sankeyLinkHorizontal`. Première dépendance d3 au-delà de scale/array/selection/zoom déjà présentes.

**Phase 14.5.1 — Sankey : croisements, tooltips, curseurs DSFR** :
- **Croisements col 2 → col 3 (esthétique sankey classique)** : la v14.5 gardait les bandes en couloirs séparés (d3-sankey, avec un nœud « Sortants » unique, trouve toujours un agencement sans croisement en regroupant les liens sortants par cible). Fix dans `construireGraphe` : (1) `linkSort` **par sous-pop d'origine** (popIdx) → chaque sous-pop forme une bande contiguë qui s'évase, ce qui autorise les croisements ; (2) layout en **2 passes** car `nodeSort` est global (fige toutes les colonnes) — passe 1 en relaxation libre pour récupérer l'ordre col 2 (insertion) minimisant les croisements, passe 2 en figeant col 0 (référence en haut) et col 1 (Poursuivants en haut) à la convention puis en réinjectant l'ordre col 2 de la passe 1. La couleur reste portée par chaque lien (préservée même quand une bande en traverse une autre). Pas de nœud invisible.
- **Tooltips de flux clarifiés** : le % d'un flux représente le **taux dans la sous-pop source**, base explicitée. Flux col 0 → col 1 (devenir) : `value / nb_etudiants` → « X % des `<libellé sous-pop>` » (ex. « 66 % des apprentis diplômés français »). Flux col 1 → col 2 (insertion) : `value / nb_sortants` → « X % des `<sous-pop>` sortant·e·s » avec accord en genre/nombre (`PHRASE_SORTANTS` : « des femmes sortantes », « des apprentis sortants », « des diplômés étrangers sortants »…). Chaque lien porte `type` / `denom` / `phrasePct`. Tooltip de nœud inchangé.
- **Curseurs DSFR (`fr-range`)** : nouveau composant partagé `SliderDuree.jsx` (structure `fr-range-group` > `fr-range fr-range--step fr-range--sm`, `data-fr-suffix=" mois"` → l'ergot et les bornes min/max affichent « 6 mois » / « 18 mois » / « 24 mois » via le décorateur DSFR). Utilisé par les onglets **Comparaison** (`TableauEcarts`), **Quadrant** (slider dans `ModaleAnalyseSousPopulations`, à côté de lecture/pause) et **Parcours** (`SankeyParcoursSousPop`). Valeur **contrôlée** par React (état `dureeCourante` partagé) ; le JS DSFR instancie le composant (`data-fr-js-range`) et gère remplissage + ergot, mais ne recalcule que sur événements `input`/`change` natifs → on **ré-émet un `input` natif** à chaque changement programmatique (clic sur un cran, autre onglet, animation) pour resynchroniser. **Crans cliquables** préservés via un overlay de boutons invisibles positionnés `calc(var(--thumb-size)*0.5 + pct*(100% - var(--thumb-size)))` (le `fr-range--step` n'affiche que des crans visuels non cliquables). Le `step` est le PGCD des écarts (= 6 pour 6/12/18/24/30). *(Migré et généralisé en Phase 14.6 ci-dessous.)*

**Phase 14.6 — Harmonisation des sliders DSFR + repositionnement** :
- **`SliderDuree` rendu générique** : props `valeurs`, `valeur`, `onChanger`, `idBase`, `libelle` (défaut « Observation à »), `suffixe` (défaut « mois »), `disabled`. Le label devient `${libelle} : ${valeur}${suffixe}`, `data-fr-suffix={suffixe}`, `step = PGCD(valeurs)` (6 pour les durées, 1 pour des millésimes contigus). Sert aux durées (6/12/18/24/30) ET aux millésimes (2019…2024, `libelle="Millésime"`, `suffixe=""`). Le **value-tracker de React** (un `input` synthétique dont la valeur n'a pas changé ne déclenche pas `onChange`) garantit que la resync DSFR pendant l'animation n'interrompt PAS la lecture, tandis qu'un glissement/clic réel (valeur ≠) déclenche `onChange` → pause si le parent la gère.
- **Modale analyse fine — slider unique commun** : les 3 sliders par-onglet sont remplacés par **un seul** `SliderDuree` dans `ModaleAnalyseSousPopulations`, **sous la barre d'onglets** et au-dessus du panneau actif (`.modale-asp-slider-commun`, `order:1` entre liste `order:0` et panneaux `order:2`). Il pilote `dureeCourante` via `handleChoisirDuree` (pause sur déplacement manuel). `TableauEcarts` ne reçoit plus que `bloc`+`seuil` ; `SankeyParcoursSousPop` plus que `data`+`dureeCourante`+`seuilDiffusion` ; le slider de la sous-ligne Quadrant est retiré (restent ⏮ ▶ ⏭ + Vitesse). Masqué si `durees.length < 2`. L'animation du Quadrant fait avancer le slider commun en temps réel.
- **Modale animation temporelle (Phase 11) — réorganisation** : le slider millésime custom (`<input type=range>` + ticks `<span>`) est remplacé par `SliderDuree` générique, placé **au-dessus du quadrant** (`.modale-animation-slider-commun`). Les contrôles ⏮ ▶ ⏭ passent **sous le quadrant** (`.modale-animation-controls` en flex `space-between` : `.modale-animation-controls-lecture` à gauche, **Vitesse** à droite). `handleChoisirMillesime` remplace `handleSlider` (respecte `comparerEnCours`, pause au déplacement). Bouton « Comparer », sélecteur « Référence des axes » et mode Comparer inchangés. CSS mort des anciens sliders supprimé. Plus aucun `<input type=range>` custom : seul `SliderDuree` (DSFR) subsiste dans toute l'app.

**Phase 14.7 — Finitions sliders et contrôles** :
- **Bouton « Comparer » retiré de l'UI** (modale animation temporelle) : le `<button>` qui déclenchait le mode Comparer est supprimé du rendu (commentaire de traçabilité en place), mais TOUTE la logique reste (état `comparerEnCours`, `handleComparer`, `comparerInstanceRef`, `traceComparaison`, trace pointillée, styles `.modale-animation-comparer`) — réactivable en réinsérant le bouton.
- **Contrôles de l'onglet Quadrant (analyse fine) sur 1 ligne** : lecture (⏮ ▶ ⏭) à gauche, **Vitesse** à droite, via `.modale-asp-controls` (flex `space-between`) + `.modale-asp-controls-lecture` — même structure que la modale d'animation temporelle.
- **Sliders harmonisés et alignés à droite** : largeur fixe commune `width:400px; max-width:100%` sur `.slider-duree.fr-range-group` (durées ET millésimes). Les conteneurs (`.modale-asp-slider-commun`, `.modale-animation-slider-commun`) passent en `display:flex; justify-content:flex-end` → slider collé à droite, espace vide à gauche. `.modale-asp-slider-commun` reçoit `width:100%` (sinon, étant un flex-item de la colonne `fr-tabs`, il se réduisait à son contenu et l'alignement était sans effet). CSS mort des anciens sliders (`.modale-asp-slider`, `.modale-asp-ticks`) supprimé.

**Phase 14.8 — Généralisation de l'analyse fine à la vue Positionnement** :
- **Endpoint `/analyse-sous-populations` — mode établissement** : `diplom` devient optionnel. Deux modes : *mention* (`?id_paysage&diplom&millesime`, historique inchangé) et *établissement* (`?id_paysage&formation&millesime` + filtres `dom/discipli/secteur/master`). En mode établissement, le backend **résout lui-même** la liste des mentions filtrées (le frontend transmet les filtres qu'il connaît déjà, PAS une liste de diploms) puis agrège `stats_sous_populations` en `SUM(...) GROUP BY date_inser, obtention_diplome, genre, nationalite, regime_inscription`. Format de réponse **identique** au mode mention (composants réutilisés tels quels) ; `contexte` enrichi de `mode`, `diplom` (null en étab), `libelle_intitule` (null sauf 1 mention), `nb_mentions_agregees`, `mentions_agregees[{diplom,libelle_intitule}]`, `diploms_agreges`. 400 `invalid_mode` si ni diplom ni formation ; 403 hors-périmètre ; 404 si aucune mention filtrée. ⚠ `nb_etudiants` étant constant entre durées, la somme de référence prend `MAX(nb_etudiants)` par diplom puis `SUM` (sinon ×nb durées).
- **Lib `SousPopulations.php`** (partagée) : `resoudreMentionsFiltrees` (requête **plate** sur stats_quadrant, GROUP BY diplom — pas de jointure, cf. préférence projet), `clauseInDiploms` (fragment `IN (:d0,…)` + bindings distincts), `sommeReferenceAgregee`, `etablissementDansPerimetre`. La résolution applique les mêmes filtres que /quadrant ; la **représentativité n'entre pas** (filtre d'affichage des bulles fragiles, pas de sélection de population) — cohérent avec la bulle établissement qui somme toutes ses mentions.
- **`/quadrant/details` — disponibilité agrégée** : en vue=etablissements SANS mention, le drapeau `analyse_sous_populations.disponible` est calculé sur la **référence agrégée** des mentions filtrées (mêmes filtres résolus pareil → cohérence avec la modale). L'endpoint reçoit désormais `dom/discipli/secteur/master` (transmis par `useQuadrantDetails`). Le bouton de `DetailsPanel` s'active donc aussi en Positionnement.
- **Frontend** : `DetailsPanel` calcule `aspMode` (`'etablissement'` si vue Positionnement sans filtre mention, sinon `'mention'`) et transmet `mode` + `filtres` à la modale. `ModaleAnalyseSousPopulations` choisit les params de fetch selon `mode`, affiche un **cartouche adaptatif** (« N mentions de `<cursus>` agrégées » si ≥2, sinon « `<cursus>` · `<libellé mention>` ») et des **onglets dynamiques** (ajout de « Mentions agrégées » si mode établissement ET ≥2 mentions). Nouveau composant `OngletMentionsAgregees.jsx` : liste informative triée `localeCompare('fr', {sensitivity:'base'})` (accents corrects : ÉCONOMIE entre DROIT et ÉLECTRONIQUE), multi-colonnes. Cursus → libellé : « BUT » pour Bachelor universitaire de technologie.

**Phase 14.9 — Cartouche enrichi (rappel des filtres) + grisage des filtres par établissement de référence** :
- **Cartouche analyse fine (mode établissement)** : la ligne « X mentions de `<cursus>` agrégées » devient un **rappel des filtres actifs** : `<cursus pluriel>` · `<domaine code>` · `<master>` · `<discipline OU secteur>` `(N mentions agrégées)`. Sans filtre → « Tous les `<cursus pluriel>` (N mentions agrégées) ». 1 mention → format mention inchangé. `formaterLibelleFiltres()` + `pluraliserCursus()` dans `ModaleAnalyseSousPopulations` ; la discipline est résolue en libellé (`aspFiltres.discipli_lib`) côté `DetailsPanel`.
- **Grisage des filtres par établissement de référence** : `/referentiel/disciplinaire` accepte un `id_paysage` optionnel et renvoie alors `disponibles { dom, discipli, secteur, master }` = modalités présentes dans CET établissement (une requête plate `SELECT DISTINCT … WHERE id_paysage … filtre_perimetre`). ⚠ accumuler des **valeurs** + `array_unique` (pas des clés de tableau) pour éviter la coercition PHP des clés numériques (« 15 » → int) qui casserait la comparaison de chaînes côté JS. `useReferentiels` passe `idPaysage = etabContexte` (clé de cache incluse). `AdvancedFilters` grise (option `disabled` + `title`) les modalités absentes de `disponibles`, **dans les deux vues** (l'établissement du sélecteur global pilote le grisage partout — outil de dialogue établissement par établissement), combiné au grisage en cascade existant (domaine→discipline→secteur). `ReferentielSelect` accepte `itemTitle` ; `TypeMasterSelect` accepte `disponibles`. Pas d'établissement sélectionné (rectorat/national sans choix) → `disponibles=null` → tout actif. Contexte établissement → `disponibles` couvre déjà toutes les options (référentiel limité au périmètre) → rien de grisé. Les deux vues grisent de façon identique sur un même établissement (cohérence cross-vues).

**Phase 14.10 — Sélecteur d'établissement enrichi (table dédiée + scoring pondéré)** :
- **Table BDD `etablissements`** (70 lignes, 100 % de couverture vs stats_quadrant). 4 façons de nommer (`uo_lib`, `uo_lib_officiel`, `sigle`, `nom_court`), champ agrégé `champ_recherche` (variantes/anciens noms/traductions séparés par `;`), identifiants externes (`anciens_codes_uai`, `siret`, `siren`, `identifiant_wikidata`, `identifiant_ror` — multi-valeurs possibles séparées par `;`), métadonnées géo (`com_nom`, `uucr_nom`, `dep_nom`, `aca_nom`, `reg_nom`), `typologie_d_universites_et_assimiles`, et sa **propre** colonne `filtre_perimetre` (`;id_nat;id_reg;id_paysage;`, indexée) → contrôle d'accès **sans jointure** avec stats_quadrant (principe Phase 14.8). ⚠ Pipeline d'import futur : maintenir `filtre_perimetre` à jour (mapping id_paysage → id_reg → id_nat).
- **Endpoint `GET /etablissements/search?q=&limit=`** : une requête plate `SELECT … WHERE filtre_perimetre LIKE %;contexte_id;%` ramène les établissements autorisés (1 en contexte établissement, N en rectorat, ≤ 70 en national), puis **scoring pondéré côté PHP** (sigle 250/200/150 > uo_lib/nom_court 200/150/100 > uo_lib_officiel 180/135/90 > identifiants 100/50 > commune 60/30 > unité urbaine 50/25 > région 15 > champ_recherche 50). Fallback multi-mots (chaîne complète d'abord ; si < 3 résultats et espace, somme des mots × 0,7). Tri desc, `limit` premiers. ⚠ Le scoring se faisant en **PHP** (pas en SQL), la collation accent-insensitive de la table ne s'applique pas → repli des accents en PHP (`normaliser()` : `mb_strtolower` + `strtr` é→e, ç→c…) pour que « universite » matche « Université ». Réponse : `{ resultats:[{id_paysage, uo_lib, sigle, typologie, reg_nom, com_nom, score}], total_avant_limite, query_utilisee }`.
- **Frontend** : `EtabSelector` remplace le filtrage client (sur `uo_lib`) par une recherche serveur **debouncée 250 ms** (`searchEtablissements`). `etabList` (via `/etablissements-visibles`) reste chargé pour la liste complète au focus (sans saisie) + la résolution du libellé courant + l'auto-sélection mode 'etab'. `Combobox` gagne `serverFiltered` (affiche les items API tels quels, sans refiltrer par libellé — sinon « UCBL » masquerait « Université Claude Bernard ») et `valueLabel` (libellé courant stable pendant la frappe). Affichage inchangé (ligne 1 nom usuel, ligne 2 région + typologie). La sélection appelle toujours `setEtabContexte(id)` → répercutée partout.

**Phase 14.11 — Rate limiting ciblé des endpoints sensibles** :
- **Mécanisme** (existant, `lib/RateLimit.php` + table `app_rate_limit`, migration 002) : fenêtre glissante d'**1 minute**, compteur atomique `INSERT … ON DUPLICATE KEY UPDATE`, purge en ligne. Clé = `"<endpoint>:<contexte_id>"` → comptage **par endpoint ET par contexte** (compteurs distincts : saturer un endpoint n'épuise PAS le quota d'un autre ; pas de comptage par IP). Dépassement → **429** + header `Retry-After` + body `{error:'rate_limited', message, retry_after_seconds}` (`retry_after` = secondes jusqu'à la minute pleine). `allowed = compteur <= limite` (le (limite+1)ᵉ appel de la minute est refusé).
- **Sucre `RateLimit::enforce($cle, $limite=null)`** (Phase 14.11) : applique + répond 429 + `exit` en une ligne. `$limite` null → lu dans `config.rate_limit.seuil_sensible` (**15** par défaut) → **modifiable à chaud** côté OVH (édition `config.php`, sans redéploiement ; fallback 15 si la clé manque).
- **Endpoints protégés à 15/min/contexte** (coûteux + données fines + susceptibles d'extraction massive par itération) :

  | Endpoint | Rate limit | Justification |
  |---|---|---|
  | `/analyse-sous-populations` | **15/min** | Le plus lourd (agrégation par sous-population, ≤ centaines de lignes en mode établissement), données fines. |
  | `/quadrant/details` | **15/min** (était 30) | Fiche riche (métadonnées + flags), extraction massive si itérée sur toutes les bulles. |
  | `/quadrant/serie-temporelle` | **15/min** | Historique complet multi-millésimes (2 requêtes flat sur tous les millésimes). |
  | `/quadrant` | — | Vue principale, filtrée par contexte, appelée à chaque changement de filtre (un seuil bas créerait des faux positifs). |
  | `/etablissements/search`, `/etablissements-visibles`, `/referentiel/*` | — | Requêtes légères / référentiels, usage utilisateur normal. |
  | `/health`, `/frontend-config`, `/diagnostic` (clé), `/auth/init` | — | Health/config/admin/auth — ne pas gêner les smoke-tests ni l'authentification. |

  Critères de décision : (1) coût d'exécution, (2) richesse des données retournées, (3) susceptibilité à l'extraction massive par itération d'un paramètre. Usage normal de l'app (clic bulle → details caché côté client ; modale analyse fine = 1 fetch ; « Voir l'évolution » = 1 fetch) reste très en deçà de 15/min.

**À faire (par ordre logique)** :
1. Composants React un par un (sélecteurs, quadrant SVG, tooltip, mentions non représentées, export XLSX côté navigateur via SheetJS à partir des valeurs brutes renvoyées par `/quadrant` en vue Mentions — pas d'endpoint d'export côté PHP)
2. Intégration complète et tests bout en bout
3. Désactivation du mode dev, mise en production

**Migrations BDD à jouer manuellement sur OVH** :
- `docs/migrations/002_rate_limit.sql` — création de `app_rate_limit` (requis avant le déploiement de `/quadrant/details`).
- `docs/migrations/003_defaut_cursus.sql` — création de `dim_defaut_cursus` (lue par `/referentiel/variables` pour fournir les défauts métier au frontend). Initialise une ligne par cursus avec toutes valeurs à NULL — à compléter par UPDATE selon les choix métier.

### Mise à jour de la méthodologie sans recompilation

Le contenu de la méthodologie (texte général + bloc par cursus) est externalisé dans un JSON statique chargé par le frontend au démarrage et utilisé par :
- les tooltips d'indicateurs (cards X/Y du panneau, en-têtes de tableau, sélecteurs de variables),
- la modale « Méthodologie » accessible depuis le panneau de filtres,
- la feuille « Méthodologie » du XLSX,
- l'annexe Méthodologie de la fiche Word.

Source de vérité côté repo : `site-quadrant/frontend/public/methodologie.json` (copié dans `dist/` au build).

**Procédure de mise à jour en production sans rebuild** : éditer directement `/homez.10002/mesouvm/quadsies/dist/methodologie.json` sur OVH (SFTP). Les utilisateurs voient la mise à jour au prochain rechargement de l'app (le fichier est servi statiquement, pas de cache applicatif côté serveur).

Format attendu — clés `cursus` alignées sur les valeurs `formation` renvoyées par l'API (`"Licence générale"`, `"Licence professionnelle"`, `"Master"`). Le BUT n'est volontairement pas couvert à ce stade ; les helpers gèrent l'absence gracieusement (tooltips absents, pas de plantage).

Pour conserver la cohérence dépôt ↔ prod, dupliquer la modification dans le JSON commité une fois validée.

---

## 7. Mode dev — IMPORTANT

L'application a un **mode dev** activé via `'mode_dev' => true` dans `config/config.php`.

**En mode dev** :
- L'API accepte un paramètre `contexte_id` directement dans la query string
- Aucun token n'est nécessaire
- Aucun appel au site hôte n'est fait
- Tout le reste fonctionne normalement

**Utilisation** :
```
GET /quadrant?contexte_id=zKsfQ&formation=Master&vue=mentions&...
```

**`contexte_id` de test** (à choisir selon ce qu'on veut couvrir) :

| contexte_id | Niveau | Usage typique |
|---|---|---|
| `zKsfQ` | rectorat (régional) | **Défaut** — couvre 7 établissements visibles. Indispensable pour tester la vue Positionnement avec ses 5 catégories sémantiques (sélectionné, même région+typo, même région, même typo, autres). C'est la valeur de `VITE_CONTEXTE_ID_DEV` du frontend. |
| `etBz7` | établissement (Université Claude Bernard - Lyon 1) | Test du niveau étab : 1 seule bulle accessible en vue Positionnement, AffichageSelector masqué. |
| `evv7S` | établissement | Test des « mentions non représentées » (a des mentions avec denom < 5 sur certains indicateurs). |
| `3Z5e6` | établissement | Variante simple, peu de mentions non représentées. |

**À mettre à `false` impérativement avant la mise en production**. Toute action de déploiement en prod doit vérifier ce point.

---

## 7 bis. Déploiement OVH

### Pré-requis avant déploiement
- [ ] `mode_dev = false` dans `site-quadrant/api/config/config.php` (cf. §7 ci-dessus).
- [ ] `cors_origin` réglé sur le vrai domaine du site hôte (pas `*`).
- [ ] Credentials BDD OVH renseignés dans `config.php` (jamais commités).
- [ ] Clé API partagée site hôte ↔ API quadrant configurée des deux côtés.
- [ ] Migrations `docs/migrations/002_rate_limit.sql` et `003_defaut_cursus.sql` jouées sur la BDD OVH (cf. §6).
- [ ] Vérifier que `VITE_CONTEXTE_ID_DEV` est absent du `.env` de prod (sinon l'iframe forcera ce contexte au lieu d'attendre les tokens du site hôte).

### Build et upload frontend
```bash
cd site-quadrant/frontend
npm run build
# Le résultat est dans dist/ (statique, copiable tel quel).
# Sauvegarde du dist/ courant avant de l'écraser (cf. Rollback) :
ssh ovh 'rm -rf /homez.10002/mesouvm/quadsies/dist.bak && cp -r /homez.10002/mesouvm/quadsies/dist /homez.10002/mesouvm/quadsies/dist.bak'
# Upload du nouveau build :
scp -r dist/* ovh:/homez.10002/mesouvm/quadsies/dist/
```

### Déploiement API (PHP)
Pas de build — les fichiers PHP sont copiés tels quels.
```bash
# Depuis la racine du repo :
scp -r site-quadrant/api/* ovh:/homez.10002/mesouvm/quadsies/api/
# config.php n'est PAS dans le repo (.gitignored) — à ne JAMAIS écraser.
# Si le scp -r écrase, refaire un upload ciblé du config.php sauvegardé.
```

### Mise à jour de la méthodologie sans recompilation
Le contenu est dans `/homez.10002/mesouvm/quadsies/dist/methodologie.json` (cf. §6 « Mise à jour de la méthodologie »). Éditer directement en SFTP ; visible au prochain rechargement de l'app, pas de rebuild requis. Penser à dupliquer la modification dans `site-quadrant/frontend/public/methodologie.json` côté repo pour conserver la cohérence dépôt ↔ prod.

### Vérification post-déploiement
- [ ] `curl -sS https://quadsies.dgesip.fr/api/health` → `{"status":"ok"}` HTTP 200.
- [ ] `curl -sS https://quadsies.dgesip.fr/api/health?check=full` → vérifications de cohérence `dim_indicateur_cursus` ↔ `stats_quadrant` sans erreur.
- [ ] Iframe avec POST des 3 tokens cachés → quadrant s'affiche (smoke test sur page hôte).
- [ ] Clic sur une bulle → panneau de détails s'ouvre, données arrivent.
- [ ] Export PNG + XLSX + Word d'une bulle quelconque → fichiers produits, contenus cohérents.
- [ ] `methodologie.json` accessible directement : `curl -sS https://quadsies.dgesip.fr/dist/methodologie.json` renvoie le JSON.

### Rollback
```bash
ssh ovh 'cd /homez.10002/mesouvm/quadsies && rm -rf dist && mv dist.bak dist'
# Pour l'API, garder en local une copie versionnée avant déploiement.
# Pas d'automatisme de rollback côté API à ce stade — un mauvais
# déploiement se rattrape par redéploiement de la version précédente
# depuis git (git checkout <commit-précédent> ; scp -r site-quadrant/api/*).
```

### Sécurité de session (rappel)
- Tokens validés côté API via appel server-to-server au site hôte (cf. `lib/Session.php`).
- Cache de session via `app_rate_limit` table (migration 002).
- HTTPS obligatoire — le site hôte est en HTTPS, le navigateur refuserait sinon un POST cross-origin.

### Authentification iframe (chaîne complète)

Flux : le site hôte (`dialogue.dgesip.fr`) soumet un formulaire POST vers `https://quadsies.dgesip.fr/api/auth/init` avec 3 tokens cachés (`tokenConnexion`, `token`, `token_campagne_utilisateurs`). L'endpoint :

1. valide le format des 3 tokens (20–64 alphanum) ;
2. relaie au site hôte via `host_verify.url` (POST JSON + `X-Api-Key`) ;
3. vérifie le `contexte_id` renvoyé (5 alphanum) ;
4. met à jour `app_session_cache` (best-effort) ;
5. sert `dist/index.html` en injectant 4 `<meta>` tags juste après `<head>` :
   - `<meta name="contexte-id" content="…">`
   - `<meta name="token-connexion" content="…">`
   - `<meta name="token-utilisateur" content="…">`
   - `<meta name="token-campagne" content="…">`

Côté frontend (`src/services/api.js`), `getAuthHeaders()` lit ces meta tags et propage 3 headers HTTP sur chaque appel API (`X-Connexion-Token`, `X-User-Token`, `X-Campagne-Token`). `Session.php` valide ces headers contre `app_session_cache` (validité TTL configuré dans `session.cache_ttl_minutes`).

**Cohabitation des modes** :
- **Iframe prod** : meta tags présents → headers transmis → Session.php OK.
- **Dev local** (`npm run dev`) : pas de meta tag → pas de header → `mode_dev=true` accepte `contexte_id` en query string.
- **URL directe prod** (`https://quadsies.dgesip.fr/?contexte_id=...` sans iframe) : pas de meta tag → pas de header → `mode_dev=false` → 401 (sécurité OK).

`display_errors` est activé UNIQUEMENT en `mode_dev=true` (cf. `index.php`). En prod, les stack traces vont dans les logs serveur, jamais dans la réponse HTTP. Si `config.php` est illisible, `index.php` renvoie un 500 minimal sans stack trace plutôt que de basculer en mode dev par défaut.

### Diagnostic infra (`/api/diagnostic`)

Endpoint pour vérifier sans SSH l'état de la chaîne (IP sortante OVH, joignabilité de `verify-session.php` côté site hôte, BDD, fichiers frontend).

Protégé par une clé partagée stockée dans `config.php` :
```php
'diagnostic' => [
    'enabled' => true,
    'key'     => '<générée via openssl rand -hex 32>',
],
```

Triple garde-fou : `enabled=false` → 404 ; clé absente ou laissée à la valeur d'exemple (`CHANGE_ME_BEFORE_DEPLOY`) → 403 ; comparaison via `hash_equals` (anti-timing).

Utilisation :
```bash
openssl rand -hex 32                                                 # à faire une fois
curl 'https://quadsies.dgesip.fr/api/diagnostic?key=<DIAGNOSTIC_KEY>' | jq
```

Cas d'usage typique : récupérer la nouvelle IP sortante OVH (`outbound_ip.v4`) à communiquer à l'équipe site hôte pour mise à jour de la liste blanche `$ALLOWED_IPS` dans `verify-session.php`.

La réponse n'expose AUCUNE donnée sensible — pas les credentials BDD, pas les vrais tokens, pas l'`api_key` partagée (juste un booléen `host_verify_api_key_set`).

### IPs OVH — entrante vs sortante

L'hébergement OVH mutualisé (cluster 121) utilise **deux IPv4 distinctes** pour `quadsies.dgesip.fr` :

| Type | IPv4 | Usage |
|---|---|---|
| Entrante | `188.165.53.185` | Résolution DNS publique de `quadsies.dgesip.fr` — vue par le navigateur de l'utilisateur. |
| Sortante (gateway) | `5.135.48.114` | IP source des requêtes HTTP émises par notre PHP (cURL, `file_get_contents`…) vers des services tiers. |

Conséquence concrète : quand l'API quadrant appelle `verify-session.php` côté `dialogue.dgesip.fr` (vérification server-to-server des 3 tokens iframe, cf. §7 bis « Authentification iframe »), c'est l'IP **sortante** qui apparaît dans la requête, pas l'entrante. C'est donc `5.135.48.114` qu'il faut whitelister dans `$ALLOWED_IPS` côté site hôte, jamais `188.165.53.185`.

**Note sécurité**. L'IP sortante `5.135.48.114` est partagée par tous les hébergements mutualisés du cluster 121 (potentiellement plusieurs centaines de sites). Le check IP n'isole donc pas spécifiquement `quadsies.dgesip.fr` — il filtre seulement le cluster. La vraie authentification entre l'API quadrant et le site hôte repose sur la **clé API partagée** (`X-Api-Key`, cf. `host_verify.api_key` dans `config.php`). L'IP whitelist sert de première ligne de défense, pas de garant d'identité.

**Vérification rapide depuis n'importe quel poste** (OVH peut faire évoluer la gateway) :
```bash
curl 'https://quadsies.dgesip.fr/api/diagnostic?key=<DIAGNOSTIC_KEY>' | jq .outbound_ip
```
La réponse expose `outbound_ip.v4` et `outbound_ip.v6` tels qu'observés depuis OVH au moment de l'appel — source de vérité pour communiquer à l'équipe site hôte.

Source OVH : la liste complète des IPs par pays + l'IP gateway commune est documentée dans la base de connaissances OVH des hébergements mutualisés (chercher « adresses IP du cluster »).

### Configuration des exports (`exports`)

Bloc `exports` dans `config.php` :
```php
'exports' => [
    'png_enabled'        => true,
    'xlsx_enabled'       => true,
    'docx_fiche_enabled' => true,
    'seuil_diffusable'   => 20,
],
```

- `png_enabled`/`xlsx_enabled`/`docx_fiche_enabled` : permet de désactiver un type d'export sans déployer de nouveau bundle JS. Exposés au frontend via `GET /api/frontend-config` (aucune auth, fallback permissif côté JS si l'endpoint est KO).
- `seuil_diffusable` : effectif minimum pour qu'une valeur soit incluse dans un export (20 par défaut, plus strict que le seuil d'affichage écran = 5). Appliqué par l'API quand le paramètre query `?for_export=1` est passé sur `/quadrant` ou `/quadrant/details`. **Non exposé** au frontend pour ne pas faciliter une déduction des effectifs sous-seuil. Le frontend (BoutonExport, DetailsPanel export Word) demande automatiquement la version filtrée pour ses exports — l'affichage écran continue d'utiliser le seuil 5.

### Référence des axes (vue Mentions)

En vue Mentions, la référence des axes (lignes pointillées + classification des cadrans du tableau) se choisit via un **sélecteur enrichi « mesure × périmètre »** (Phase 15.1) :

- **Mesure** : Médiane *ou* Moyenne (exclusif, l'une toujours active, médiane par défaut).
- **Périmètre** : Établissement *et/ou* National (multi-sélection — 0, 1 ou 2 actifs ; étab par défaut). 0 actif = mode « sans référence », aucune ligne tracée.

Les 4 combinaisons mappent sur les clés du bloc `axes` :

- **Médiane / Moyenne établissement** — médiane / moyenne pondérée `SUM(num)/SUM(denom)` (« par tête ») des taux sur les mentions de l'établissement courant.
- **Médiane / Moyenne nationale** — médiane / moyenne pondérée des taux sur toutes les mentions France entière (filtres disciplinaires appliqués, sans filtre étab).

Calculé par `/quadrant` dans le bloc `axes` de la réponse (`mediane_etab_x/y`, `moyenne_etab_x/y`, `moyenne_nationale_x/y`, `mediane_nationale_x/y`). La moyenne nationale réutilise la même requête SQL que les bulles (avant filtrage par étab côté agrégation) — pas de requête supplémentaire. State frontend (AppContext) : `mesureAxes` (`'mediane'` par défaut) + `perimetresAxes` (`['etab']` par défaut). Un `referenceAxes` **dérivé** (mode principal string — étab si présent, sinon national) est exposé pour les consommateurs mono-référence (classification des cadrans du tableau, exports PNG/XLSX, libellés) qui n'affichent qu'un repère.

**Convention métier — seuil de la médiane nationale (Phase 15.1)** : la médiane nationale (`calculerMedianesNationales`) n'inclut que les mentions à `denom_x >= 20 ET denom_y >= 20` (`Diffusion::SEUIL_FIABILITE`). C'est une **asymétrie volontaire** avec la médiane établissement, qui inclut au contraire **toutes** les mentions à `denom > 0` (y compris les fragiles 1-19, via `pointsCalculables`). Rationale : la médiane établissement doit refléter fidèlement le positionnement de l'étab (micro-mentions comprises) ; un repère national, lui, doit être robuste et non tiré par le bruit des micro-mentions multipliées à l'échelle France entière. Même JOIN/périmètre que `calculerSommesNationales` (sans `filtre_perimetre`), mais récupère les lignes individuelles pour une médiane PHP (`mediane()`) au lieu d'une moyenne pondérée. Champ additif : strictement compatible ascendant, aucun champ existant retiré.

**UI du sélecteur (Phase 15.1, compacté 15.2, replacé 15.3)** : sorti du panneau « Plus d'options » et rendu **visible par défaut, sur une seule ligne, au-dessus du quadrant DANS la zone de droite** (`ReferenceAxesSelector.jsx`, premier enfant de `.zone-quadrant`, avant `FiltresActifs`) — pas au-dessus du panneau de filtres de gauche. Placé avant `FiltresActifs` pour rester stable quand les pills de filtres apparaissent/disparaissent. En mode « avec détails » (`.zone-quadrant--avec-details`, grille 2 colonnes au clic sur une bulle), `.ref-axes-container` porte `grid-column: 1 / -1` → pleine largeur et **aucun effet secondaire à l'ouverture de la barre latérale** (même principe que `.filtres-actifs`). Forme : `Référence des axes : [Médiane] [Moyenne]   [Établissement] [National]` — pilules, **sans** labels « Mesure »/« Périmètre » (le titre suffit ; les groupes gardent un `aria-label`). Mesure exclusive, Périmètre multi avec **contrainte « au moins un actif »** (`togglePerimetreAxes` bascule automatiquement et silencieusement sur l'autre périmètre si on désactive le dernier — jamais 0 ligne en vue Mentions). Pilules de périmètre actives colorées comme leur ligne (étab = bleu Marianne `#000091`, national = gris `#666`). N'entre plus dans le compteur de filtres actifs d'`AdvancedFilters`. `flex-wrap` → repli sur 2 lignes seulement en écran étroit.

**Affichage multiple des lignes (Phase 15.1)** : `LignesReference.jsx` reçoit un **tableau** de références (0, 1 ou 2) et trace une paire (verticale + horizontale) par référence active. Différenciation visuelle quand les deux périmètres sont affichés : établissement = bleu Marianne, pointillé court `4 4` ; national = gris, pointillé long `8 4`. Les libellés de ligne (« Médiane établissement : 41 % ») sont posés à l'**intérieur du plot** (marges du SVG inchangées, `MARGIN.left = 80`). Style/libellés/clés `axes`/descripteurs mutualisés dans `utils/referenceAxes.js` (`STYLE_PERIMETRE`, `libelleReference`, `cleAxe`, `descripteursReferences`) — partagés entre le quadrant statique et le quadrant animé.

En vue Positionnement, seule la **Mesure** est proposée (Médiane / Moyenne) — le périmètre est national par construction (pas de filtre étab), donc implicite et masqué. Pilote `referenceAxesPositionnement` → paramètre `agregation` de l'API → `data.reference` (ligne unique, style gris neutre `4 3`). L'ancien sélecteur « Ligne de référence » (paramètre `ligneReference`) reste retiré ; `agregation` est figé à `'mediane'` côté `useQuadrant` du quadrant principal pour préserver `data.axes`.

**Modale d'animation temporelle — uniformisation (Phase 15.2)** : la modale (`/quadrant/serie-temporelle`) ne porte plus son propre sélecteur de référence. Elle rend le **même** `ReferenceAxesSelector` branché sur le **même état partagé** (`mesureAxes` + `perimetresAxes` / `referenceAxesPositionnement`) → tout choix dans la modale se répercute hors modale et inversement. Le sélecteur est placé **au-dessus** des contrôles de lecture/vitesse (Phase 15.3) ; la modale est alignée en haut de l'écran (`align-items: flex-start`) pour éviter le scroll de la page hôte. `QuadrantAnime` reçoit désormais un **tableau** de descripteurs (`references`, via `descripteursReferences`) et trace 0/1/2 lignes animées avec la même différenciation visuelle et le même placement de libellés (slots opposés + bascule anti-débordement) que `LignesReference`. L'endpoint `serie-temporelle` calcule désormais `mediane_nationale_x/y` par millésime (seuil 20, même asymétrie que `/quadrant`), si bien que la combinaison médiane + national s'anime correctement dans la modale.

### UX — Positionnement intelligent des libellés de référence (Phase 15.1)

Chaque ligne pointillée porte un libellé « Mesure périmètre : valeur % » (ex. « Médiane nationale : 44 % »), coloré comme sa ligne. Placement dans `LignesReference.jsx` :

- **1 seule référence** : emplacement habituel — libellé de la verticale en bas, libellé de l'horizontale à gauche.
- **2 références (étab + national)** : emplacements **opposés** pour éviter le chevauchement. L'étab garde l'emplacement habituel (verticale → bas, horizontale → gauche), le national prend l'opposé (verticale → haut, horizontale → droite). Comme les deux labels d'un même axe sont alors à des extrémités opposées, ils ne se recouvrent pas même si les deux valeurs sont proches.
- **Bascule anti-débordement selon la valeur** (indépendante du slot) :
  - verticale (valeur X) : X < 30 % → texte à droite de la ligne (`textAnchor=start`, sinon il sortirait à gauche) ; X > 70 % → à gauche (`end`) ; entre les deux → à gauche par défaut.
  - horizontale (valeur Y) : Y > 70 % (proche du haut) → texte **sous** la ligne (sinon il sortirait en haut) ; sinon au-dessus.

### Animation temporelle enrichie (Phase 15.3)

Trois améliorations à l'animation temporelle (Phase 11), suite aux retours utilisateurs :

**1. Recalibrage des vitesses (centralisation).** Le mapping vitesse → durées (ms) est désormais une **source unique** dans `frontend/src/utils/animationSpeeds.js` (`VITESSES` + `VITESSE_DEFAUT`), consommée par `ModaleAnimation.jsx` (millésimes) ET `ModaleAnalyseSousPopulations.jsx` (durée d'observation) — plus de duplication. Tout est décalé d'un cran vers le plus lent et l'ancienne « rapide » (500 ms) est supprimée :

| Libellé | tick (ms) | transition (ms) | clé |
|---|---|---|---|
| Lente | 3000 | 2400 | `lente` |
| Normale | 2000 | 1600 | `normale` |
| Rapide | 1000 | 800 | `rapide` |

`transitionMs` ≈ 80 % du tick (les bulles finissent leur mouvement avant le tick suivant). Défaut = `normale`. Les libellés restent « Lente / Normale / Rapide » (la clé `moyenne` est renommée `normale`). Plus aucune valeur de vitesse en dur dans les composants. (Les autres timings — fade-out 400 ms, fade-out trace comparaison 1000 ms, constantes `COMPARER_*` — restent locaux à `ModaleAnimation`, hors périmètre de la centralisation.)

**2. Suivi d'une mention (halo) — vue Mentions uniquement.** Réutilise le filtre existant **« Rechercher une mention »** (état partagé `rechercheMention`). Dans la modale d'animation, un sélecteur **« Suivre une mention »** (`Combobox`) liste **l'union des mentions sur TOUS les millésimes** de la série (`bullesTouteSerie`, pas seulement le millésime courant — pour pouvoir suivre une mention absente à l'année affichée) et écrit `rechercheMention`. `QuadrantAnime` reçoit `rechercheMention` et trace un **halo** (anneau `fill:none`, stroke `#E91719` — même rouge que le highlight de recherche du quadrant principal, cf. `Bulles.jsx`) autour de la bulle dont le libellé correspond, dans une couche au-dessus des bulles, translaté comme elle (il glisse d'un millésime à l'autre). **Cas mention absente à un millésime : option A** — `opaciteBulle(false)=0` masque le halo (pas de position fantôme) ; il revient si la mention réapparaît. Changer/effacer la sélection déplace/retire le halo. L'état étant partagé, la sélection persiste sur le quadrant principal après fermeture (cohérent avec la barre de recherche). Pas applicable en vue Positionnement (suivi établissement déjà assuré par le sélecteur d'étab global).

**3. Compteur de mouvements de bulles — vue Mentions uniquement.** Affiché en permanence **sous le quadrant principal** (`CompteurMouvements.jsx`, pas sur l'instance d'export), il contextualise les mouvements entre le millésime courant et le précédent. Calculé côté **backend** (`/quadrant`, helper `calculerMouvements`) à partir des points **bruts** (avant filtrage d'affichage : forme/diffusion, représentativité), pas d'appel supplémentaire. Exposé dans `data.mouvements` uniquement en `vue=mentions` AVEC un établissement de contexte (sinon les diploms de plusieurs étabs se chevaucheraient). Cohérent avec les filtres disciplinaires actifs (déjà dans le WHERE de `/quadrant`).

**Convention de comptage (seuil de fiabilité 20).** État d'une mention pour le couple (denom_x, denom_y) : `0`=absente (un denom à 0 → non mesurée), `1`=sous seuil (présente mais denom < 20 sur un axe), `2`=visible (denom ≥ 20 sur les **deux** axes). Le seuil retenu est **`Diffusion::SEUIL_FIABILITE` (20)** : « visible » = repère fiable (choix produit, cf. Phase 15.3 ; assumé incohérent avec l'affichage du quadrant principal qui dessine aussi les bulles fragiles 5-19 en triangles/croix). Quatre catégories mutuellement exclusives par mention :

- **nouvelles** : absente au précédent → visible au courant (vraie nouveauté).
- **disparues** : présente (≥ 1) au précédent → absente au courant (vraie disparition).
- **réapparues** : sous le seuil au précédent → visible au courant (franchit le seuil à la hausse).
- **masquées par seuil** : présente au courant mais sous le seuil (état courant `1`) — la mention existe mais n'est **pas** un repère fiable. **Distinction métier** : une « disparue » est sortie du référentiel (effectif tombé à 0 / mention supprimée), une « masquée par seuil » est toujours là mais avec un effectif < 20 (artefact de fiabilité, pas une vraie disparition).

Chaque catégorie expose la **liste des libellés** concernés (le frontend en dérive le compteur + un détail au survol). `comparaison_disponible=false` quand aucune ligne n'existe au millésime précédent (premier millésime / année creuse) → le frontend affiche « Première année observée — pas de comparaison ». Champ **additif**, strictement compatible ascendant.

### UX — Reset automatique du zoom

Le zoom du quadrant est automatiquement réinitialisé à chaque changement de paramètre structurel (vue, cursus, millésime, axes, filtres avancés, `mesureAxes`/`perimetresAxes`). Évite de rester zoomé sur une zone sans bulles après une bascule de filtre. Le clic sur une bulle ne change aucun de ces paramètres → le zoom est conservé pendant l'exploration interactive.

---

## 8. Documents clés à consulter

| Document | À consulter pour... |
|---|---|
| `docs/cadrage-quadrant.md` | Toute question métier, comportements attendus, règles de calcul, palettes, etc. |
| `docs/CONTRATS.md` | Interface entre l'API quadrant et le site hôte |
| `docs/INSTALL.md` | Mise en place de l'environnement de développement |
| `docs/migrations/001_init.sql` | Schéma BDD exact |

**Règle d'or** : si le cadrage répond à une question, suivre le cadrage. Si le cadrage est ambigu sur un point, le mentionner explicitement et poser la question avant de coder.

---

## 9. Règles de travail

### Quand on me demande de coder

- Je m'aligne sur les conventions ci-dessus
- Je relis les fichiers concernés avant de modifier pour comprendre le contexte
- Je signale tout choix non trivial et les arbitrages que je fais
- Je ne livre que ce qui est demandé, pas plus (pas de feature creep)
- Je préfère plusieurs petits changements clairs à un gros refactor opaque
- J'évite d'introduire des dépendances nouvelles sans demander
- Pour les fichiers PHP, je vérifie la syntaxe avant de livrer (`php -l`)

### Quand j'ai un doute

- Je pose la question avant de coder
- Je propose 2-3 options avec les implications de chacune
- Je ne suppose pas le besoin métier : je demande

### Quand je trouve un problème dans le code existant

- Je le signale sans le corriger d'autorité
- Si c'est un bug évident, je propose le correctif
- Si c'est un choix discutable, je présente l'alternative sans imposer

### Format des réponses

- Je suis concis et direct
- J'évite la flagornerie ("excellente question !") et les introductions inutiles
- Je vais droit au but
- Si je dois exposer plusieurs options, je les structure clairement
- Pas d'emojis dans le code ni dans les réponses, sauf demande explicite

---

## 10. Référentiels métier rapides

Pour éviter de fouiller dans le cadrage à chaque fois :

### Cursus (champ `formation`)

| Valeur en BDD | Onglets associés |
|---|---|
| `Licence générale` | 1 (Mentions) et 5 (Étabs) |
| `Licence professionnelle` | 2 (Mentions) et 6 (Étabs) |
| `Bachelor universitaire de technologie` | 3 (Mentions) et 7 (Étabs) |
| `Master` | 4 (Mentions) et 8 (Étabs) |

### Indicateurs (11 au total)

**Réussite** : `Taux de réussite`, `Taux de réussite en 2 ans`, `... en 3 ans`, `... en 2 ou 3 ans`, `... en 4 ans`, `... en 3 ou 4 ans`, `Taux de poursuite`

**Insertion** : `Taux de poursuivants`, `Taux sortants en emploi salarié en France` (déclinable), `... en emploi non salarié` (déclinable), `... en emploi stable` (déclinable)

**Déclinables par délai** : seulement les 3 derniers indicateurs d'insertion. Délais en BDD : `6`, `12`, `18`, `24`, `30` (chaîne vide pour les non déclinables).

**Source de vérité** : la table `dim_indicateur_cursus` est le référentiel officiel de la matrice cursus × indicateur. Colonnes :
- `formation` (lié à `stats_quadrant.formation`)
- `indicateur` (lié à `stats_quadrant.indicateur`)
- `ordre` (entier, ordre canonique pour la contrainte `var1 < var2`)
- `declinable_delai` (0 ou 1, dicte si `date_inser` doit être renseigné)

`/quadrant` valide var1/var2/contrainte d'ordre/cohérence `date_inser` contre cette table. Toute évolution de la liste d'indicateurs autorisés ou de leur déclinabilité passe par cette table — pas de constante en dur dans le code.

### Règles de diffusion statistique

| Dénominateur | Affichage |
|---|---|
| < 5 | Bulle non affichée (non diffusable) |
| 5-19 | Bulle affichée avec forme spéciale (triangle ou croix) |
| ≥ 20 | Bulle affichée normalement (rond) |

Une bulle s'affiche uniquement si les **deux** dénominateurs (var1 et var2) sont ≥ 5.

**Cas particulier `denom ≤ 0` — absence d'observation** (cf. `normaliserDonnees` dans `quadrant-details.php`). Le source SIES encode systématiquement les tuples (mention, indicateur, millésime) non encore mesurables — « Taux de réussite en 4 ans » sur une cohorte trop récente, enquête d'insertion à 30 mois pas encore réalisée, mention créée après le millésime — par une row présente avec `numerateur=0, denominateur=0` (vérifié empiriquement : ~11 000 lignes en BDD ; jamais `num > 0` quand `denom = 0`, jamais de NULL ni au num ni au denom). L'API détecte `denom ≤ 0` et efface complètement le tuple côté détails (num/denom/taux tous à null en sortie). Sans cette normalisation, le graphe % a un trou (taux=null car division par 0 impossible) mais le graphe d'effectifs traçait des faux 0 sur les deux courbes (num=0, denom=0 = points sur l'axe horizontal) — incohérence visuelle qui suggère à tort « cohorte de 0 individus observés ».

⚠ Précédente itération (`num === null && denom ≤ 0`) ne se déclenchait jamais en pratique — SIES n'utilise pas NULL pour encoder l'absence. La règle effective porte uniquement sur `denom ≤ 0`.

Cas distinct `denom 1–4` + `num quelconque` : règle de diffusion classique, exposée comme `non_diffusable=true` côté API et collapsée par `extraireSerie` côté frontend (cf. `historique.js`).

### Coloration

- **Onglets Mentions** : 17 couleurs par secteur disciplinaire (codes hex dans le cadrage, transparence 61% appliquée au rendu)
- **Onglets Établissements** : 5 couleurs selon relation région/typologie avec établissement de référence

### Filtrage par contexte

Le `contexte_id` est un identifiant 5 caractères alphanumériques (a-z + A-Z + 0-9), casse mixte. Le filtrage par `filtre_perimetre LIKE '%;<contexte_id>;%'` n'est pas appliqué uniformément sur tous les endpoints :

- **Vue Mentions** (`vue=mentions`) : filtrage SQL classique sur `filtre_perimetre`. Toutes les bulles renvoyées sont autorisées (`details_accessibles = true` partout). Chaque bulle expose en plus les **valeurs brutes** `numerateur_x`, `numerateur_y`, `taux_x`, `taux_y` (taux arrondi à 1 décimale). Sert à générer l'export XLSX côté React (SheetJS) — il n'y a pas d'endpoint `/export/xlsx` côté PHP. Asymétrie volontaire avec la vue Établissements : ces 4 champs y sont absents même pour les bulles détaillables, pour éviter toute fuite indirecte si l'anonymisation évolue.
- **Vue Établissements** (`vue=etablissements`) : **pas** de filtrage SQL sur `filtre_perimetre`. Toutes les bulles de France remontent. Pour chaque bulle, l'API calcule un drapeau `details_accessibles` en testant si `filtre_perimetre` contient le `contexte_id` de l'utilisateur. Les bulles non accessibles sont **anonymisées** dans la réponse — la bulle reste affichée (position, couleur, forme) mais toute donnée rapprochable d'un établissement réel est masquée :
  - `id` remplacé par `"anon_<N>"` (compteur local à la réponse)
  - `libelle` = `""`
  - `denom_x` / `denom_y` supprimés, remplacés par un champ unique `denom` = `denom_x` brouillé ±15 % (bruit déterministe seedé sur l'id_paysage, borné à ≥ 5)
  - `x`, `y`, `forme`, `couleur_key` inchangés
  - pas d'infobulle ni d'interaction au clic

  Côté frontend, la taille de la bulle utilise `denom_x` quand disponible, sinon `denom`. Voir le cadrage §4 — Groupe 2 — Établissements.

Cette dissymétrie est volontaire : sur la vue Établissements, chaque utilisateur doit pouvoir situer son périmètre dans le paysage national complet, tout en respectant les restrictions d'accès au détail.

### Filtre mention (vue Établissements uniquement)

`/quadrant` accepte un paramètre optionnel `mention` (un `diplom`) **uniquement sur vue=etablissements**. Quand il est passé :
- L'API ajoute `m1.diplom = :mention` dans le WHERE et court-circuite l'agrégation par établissement.
- Chaque bulle reste un établissement, mais ses x/y portent sur **cette seule mention** (pas un agrégat toutes mentions confondues).
- Anonymisation, catégorisation région/typologie et calcul de médiane/moyenne fonctionnent à l'identique.
- Sur `vue=mentions` le paramètre est silencieusement ignoré (chaque bulle y est déjà une mention).

---

## 11. Quadrant SVG — spécifications techniques

Le quadrant est l'élément central de l'application. **SVG natif sans wrapper de bibliothèque** (pas de Recharts, Chart.js, Plotly, ni D3 complet). Seuls les utilitaires d3-scale et d3-array peuvent être importés pour les échelles et calculs.

### Contraintes d'intégration

L'application est embarquée par iframe dans un site hôte qui impose les dimensions du conteneur :

- **Largeur iframe : 1000px maximum, FIXE** (imposée par le site hôte). Pas de responsive en dessous de cette largeur — cohérent avec la décision "desktop only ≥ 1024px".
- **Hauteur iframe : 850px par défaut, extensible vers le haut** si le contenu le justifie (la hauteur peut donc croître, jamais décroître sous 850px).
- **Conséquence sur le layout** : penser le composant pour cette largeur fixe. Pas de sidebar large ; les sélecteurs vont en bandeau supérieur ou compacts à droite du quadrant.
- **SVG du quadrant** : ~950-960px de large utiles après marges du composant.
- **Répartition verticale indicative** : bandeau supérieur (~150-200px) + quadrant (~500-550px) + légende / mentions non représentées (~100-150px) = ~750-900px au total.

### Gestion de la hauteur de l'iframe

Par défaut, l'iframe est dimensionnée à **850 px de hauteur avec scroll interne** si le contenu dépasse (tableaux longs en mode Tableau, panneau de détails ouvert, modale méthodologie). C'est le comportement attendu hors box dynamique.

**Option pour iframe dynamiquement redimensionnée** : non implémentée par défaut, à activer si l'équipe du site hôte le souhaite (élimine le scroll interne au prix d'une coordination JS site hôte ↔ app). Nécessite deux modifications symétriques :

**Côté app Quadrant** — ajouter un hook qui mesure la hauteur du contenu via `ResizeObserver` et émet la nouvelle hauteur vers le parent à chaque changement :

```js
useEffect(() => {
  const cible = document.documentElement; // ou un wrapper précis
  const observer = new ResizeObserver(() => {
    const h = cible.scrollHeight;
    window.parent.postMessage(
      { type: 'quadrant:resize', height: h },
      'https://etablissement.exemple.fr', // origine exacte du site hôte, pas '*'
    );
  });
  observer.observe(cible);
  return () => observer.disconnect();
}, []);
```

**Côté site hôte** — écouter ces messages et ajuster la hauteur de l'iframe :

```js
window.addEventListener('message', function (event) {
  if (event.origin !== 'https://quadsies.dgesip.fr') return;
  if (event.data && event.data.type === 'quadrant:resize') {
    document.getElementById('quadrant').style.height = event.data.height + 'px';
  }
});
```

Points d'attention si l'option est activée :
- L'origine cible côté `postMessage` doit être l'origine exacte du site hôte, jamais `'*'` — sinon n'importe quel parent peut intercepter (peu critique pour une simple hauteur, mais bonne hygiène).
- L'écouteur côté hôte doit filtrer `event.origin` (`'https://quadsies.dgesip.fr'`) pour ne pas se laisser piéger par un autre frame.
- Pendant une animation (ouverture modale, etc.), `ResizeObserver` peut émettre plusieurs fois en succession — l'effet visuel reste fluide tant que le site hôte applique la hauteur sans transition CSS contraire.
- En cas de retour au comportement par défaut (scroll interne 850 px), désactiver le hook côté app suffit : l'absence de message laisse l'iframe à sa hauteur statique.

À coordonner avec l'équipe du site hôte avant activation (origine exacte, comportement attendu pour les utilisateurs déjà habitués au scroll interne).

### Géométrie générale

- **Axes X et Y fixes** : 0% à 100%, échelle linéaire
- **Origine** : coin bas-gauche (0%, 0%)
- **viewBox SVG responsive recommandé** : `viewBox="0 0 W H"` avec dimensions intrinsèques ajustées en cours d'implémentation. Largeur typique 600-800px, hauteur ajustée pour préserver le ratio.
- **Marges internes** : prévoir suffisamment d'espace pour les graduations (gauche, bas) et un peu d'air (haut, droite). Quelque chose comme `padding: { top: 20, right: 30, bottom: 50, left: 60 }` est un bon point de départ.

### Grille et axes

- **Lignes principales** tous les 25% (donc à 25%, 50%, 75%) : marquées, gris clair `#ccc` ou équivalent
- Les axes 0% et 100% sont les bordures du cadre
- **Pas de grille intermédiaire** tous les 10% : seulement les marques de 25%
- Graduations textuelles : `0%`, `25%`, `50%`, `75%`, `100%` sur les deux axes
- Titres des axes : libellé de l'indicateur en bas (axe X) et à gauche (axe Y, texte tourné à -90°)

### Bulles

- **Forme normale** : rond (cercle SVG)
- **Forme triangle bas** : si `denom_y` ∈ [5, 19] et `denom_x` ≥ 20
- **Forme triangle gauche** : si `denom_x` ∈ [5, 19] et `denom_y` ≥ 20
- **Forme croix** : si `denom_x` ∈ [5, 19] ET `denom_y` ∈ [5, 19]
- **Taille** : rayon = `k × √denom_x` (la **surface** est proportionnelle au dénominateur de l'axe X). Constante `k` à ajuster pour que les bulles soient lisibles sans déborder. Bornes raisonnables : rayon min 3px, rayon max 25-30px.
- **Couleur** : selon la palette appropriée (17 couleurs pour Mentions, 5 pour Établissements), avec **opacité 0.61** (61%)
- **Stroke** : léger contour de la même couleur que le fill mais à opacité plus élevée, pour aider à voir les chevauchements

### Lignes de référence (médiane/moyenne)

- Une **ligne verticale** au niveau de la valeur X de référence (médiane ou moyenne)
- Une **ligne horizontale** au niveau de la valeur Y de référence
- Style : trait pointillé gris foncé (`stroke-dasharray="4 3"` par exemple), épaisseur 1px
- Texte court à proximité : "Médiane" ou "Moyenne"

### Survol et interactions

- **Survol d'une bulle** : surbrillance par outline net (par exemple bordure plus épaisse et plus opaque), **pas de zoom ni d'agrandissement**. Le tooltip enrichi apparaît à proximité.
- **Clic sur une bulle** : épingle le tooltip (qui reste affiché jusqu'à clic ailleurs)
- **Cursor** : `cursor: pointer` au survol d'une bulle
- **Bulles non autorisées au détail** : pas de tooltip, pas d'interaction (selon `details_accessibles` renvoyé par l'API)

### Animations

- **Transitions douces** sur les changements (200-300ms) :
  - Quand un filtre change et que les bulles sont remplacées : transition de position
  - Quand la médiane bouge : transition de la position des lignes
  - Quand une bulle apparaît/disparaît : fondu en opacité
- **CSS transitions** suffisent pour la majorité des cas.
- **Animer la propriété CSS `transform`, pas l'attribut SVG `transform=`** : l'attribut SVG est transitionnable en théorie mais Firefox notamment n'interpole pas — les bulles sautent au lieu de glisser. Utiliser `style={{ transform: 'translate(Xpx, Ypx)', transition: 'transform 800ms …' }}`. Composite par le GPU, fluide cross-navigateur. Bulles rendues à `cx=0, cy=0` et translatées, position visuelle équivalente (cf. `QuadrantAnime.jsx` Phase 12-13). Animer `cx`/`cy` directement déclenche un *forced reflow* sensible au-delà de quelques centaines de bulles ; sur les volumes effectifs de l'app (≤ 80 en Positionnement, ≤ 50 en Mentions) c'est marginal, mais la propriété CSS reste préférable pour la stabilité d'interpolation.
- Pas d'animation excessive ni de chorégraphie complexe : sobre

### Légende

- **Affichée en HTML à côté du SVG** dans l'interface, pas dans le SVG lui-même. Plus flexible pour le layout responsive et le style.
- **Intégrée dans le SVG uniquement à l'export PNG** : au moment de l'export, on génère une variante du SVG qui inclut la légende, pour qu'elle apparaisse dans l'image téléchargée.
- La légende n'affiche que les couleurs effectivement présentes dans le quadrant (légende dynamique), pas les 17 couleurs systématiquement.

### Mentions non représentées (vue Mentions uniquement)

- Affichées **hors du SVG**, en HTML sous le quadrant ou dans un panneau latéral
- Format : liste avec libellé de la mention + raison de non-représentation (libellée clairement)
- Recalculée à chaque changement de filtre / variable

### Export PNG

L'export PNG doit être **autoporteur** : il doit pouvoir être consulté hors de l'application avec toutes les informations de contexte nécessaires pour l'interpréter. Génération via `html-to-image` ou équivalent.

**Composition de l'image générée** (à organiser visuellement de manière sobre) :

- **Logo MESRE** : fichier fourni par le client (à intégrer quand disponible). Position à arbitrer à l'implémentation, proposition à faire en cours de développement.
- **Titre exhaustif** : doit contenir toutes les informations contextuelles pour rendre l'image autoporteuse :
  - Nom de l'établissement de référence (`uo_lib`)
  - Cursus (`formation`)
  - Type de vue (Mentions ou Établissements)
  - Variables X et Y (avec délai si déclinable)
  - Millésime
- **Quadrant** : le SVG du quadrant avec ses bulles, axes, lignes de référence
- **Légende des couleurs** : intégrée dans l'image (en HTML, elle est externe au SVG ; à l'export PNG, elle doit être incluse). Légende dynamique : seulement les couleurs effectivement présentes.
- **Mention de source** : exactement `Source : MESRE-SIES - Outil Quadrant`, sans date ni millésime supplémentaire (le millésime figure déjà dans le titre).

**À ne pas inclure** :
- Date de génération du PNG (pollue inutilement)
- Filtres appliqués sous forme de mention (les filtres se devinent au contenu : si "Filtre = Sciences fondamentales", on ne voit que des bulles vertes ; pas besoin de le redire)
- Disclaimers ou URL

**Format technique** :
- Résolution suffisante pour usage écran ET impression (typiquement 2x la résolution écran)
- Format PNG avec transparence supportée
- Encodage propre des caractères accentués dans le titre

### Performances

- Avec quelques dizaines à quelques centaines de bulles, SVG natif sans optimisation particulière fonctionne bien
- Si dans certains cas on dépasse 500 bulles : envisager `requestAnimationFrame` pour les animations, ou simplifier le rendu
- Ne pas pré-optimiser : commencer simple et instrumenter si nécessaire
