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
- **Delta vs millésime précédent** : chaque bulle de `/quadrant` expose `x_prev` et `y_prev` (coordonnées au millésime-1 pour la même mention/étab et les mêmes filtres). Calcul côté SQL via `millesime IN (current, prev)` + split + agrégation appliquée aux deux seaux (helper PHP `agregerLignesParVue`), jointure par clé stable (`diplom` en vue Mentions, `id_paysage` en vue Positionnement — l'anonymisation se fait *après* la jointure donc reste correcte). Côté frontend, `utils/formatDelta.js` produit « (+0,3 pt) » / « (-3,0 pt) » / « (0,0 pt) » / chaîne vide si pas de précédent ; affiché dans le tooltip de bulle (`QuadrantTooltip`) et dans la valeur principale des cards X/Y du panneau de détails (`ValeurCourante`, qui lit la ligne précédente dans `historique` via `trouverLignePrecedente`). Couleur neutre (gris) — un vert/rouge porterait un jugement implicite (« mieux/moins bien ») trompeur pour certains axes. Sémantique à garder en tête : c'est une comparaison **deux cohortes différentes** d'étudiants (millésime N vs N-1), pas un suivi longitudinal.
- Histogrammes de distribution (toggle « Afficher les distributions » dans `AdvancedFilters`, désactivé par défaut). Quand actif, le quadrant affiche 10 barres en haut (axe X) et 10 barres à droite (axe Y) comptant les bulles par tranche de 10 %. Bandes posées dans les marges existantes (top/right = 50 px) — pas de réduction de l'aire de plot, pas de débordement de l'iframe. S'applique aux deux vues. Pas pris en compte dans le compteur de filtres actifs (option d'affichage purement visuelle).
  - **Tooltip de répartition** au survol d'une barre : « 70 % - 80 % : 5 / 22 (23 %) » — borne basse/haute, compte de la tranche, total sur l'axe, pourcentage. Conteneur visuel commun avec le tooltip de bulle (`.quadrant-tooltip`), positionnement géré par `useAutoPlacement`.
  - **Masquage au zoom** : les barres sont calculées sur l'échelle 0..100 et restent dans les marges, donc elles ne suivent pas les bulles repositionnées par d3-zoom — incohérence visuelle. Le composant n'est plus rendu dès que `transform.k !== 1` ou que `transform.x/y !== 0`. Réapparition au reset du zoom (bouton ⌂ ou double-clic).
  - L'instance off-screen lit `afficherDistributions` depuis le même `AppContext` — les histogrammes sont donc inclus dans l'export PNG quand le toggle est actif (le zoom n'est jamais actif sur cette instance, qui rend l'état non-zoomé). Voir `Histogrammes.jsx` + `utils/histogramme.js`.

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

En vue Mentions, l'utilisateur peut basculer entre 3 modes de référence pour les axes du quadrant (lignes pointillées + classification des cadrans dans le tableau) :

- **Médiane établissement** (défaut) — médiane des taux sur les mentions de l'établissement courant.
- **Moyenne établissement** — moyenne pondérée `SUM(num)/SUM(denom)` sur les mentions de l'établissement (= « moyenne par tête », ne surreprésente pas les petites mentions).
- **Moyenne nationale** — moyenne pondérée sur toutes les mentions France entière (filtres disciplinaires appliqués, sans filtre étab).

Calculé par `/quadrant` dans le bloc `axes` de la réponse (`mediane_etab_x/y`, `moyenne_etab_x/y`, `moyenne_nationale_x/y`). La moyenne nationale réutilise la même requête SQL que les bulles (avant filtrage par étab côté agrégation) — pas de requête supplémentaire. State frontend : `referenceAxes` dans AppContext (défaut `'mediane_etab'`).

Présenté côté UI comme un groupe de 3 boutons radio empilés verticalement (`fr-fieldset` + `fr-radio-group`) dans le panneau « Plus d'options ». Le segment control horizontal ne tenait pas la largeur du panneau latéral 280 px (libellés tronqués). Les libellés complets sont également reportés directement sur le quadrant : le label de la ligne de référence verticale est en bas (sous l'axe X, centré sur la ligne), celui de la ligne horizontale à gauche (dans la marge gauche, aligné sur la ligne). La marge gauche du SVG (`MARGIN.left` dans `geometry.js`) a été augmentée à 160 px pour accueillir « Moyenne établissement » (~145 px à fontSize 11).

En vue Positionnement le sélecteur est masqué (les axes sont déjà calculés sur le bloc `data.reference` par l'API, défaut « médiane »). L'ancien sélecteur « Ligne de référence » (Médiane / Moyenne, paramètre `ligneReference`) a été retiré — l'API garde son paramètre `agregation` figé à `'mediane'` côté useQuadrant pour préserver le calcul de `data.reference`.

### UX — Reset automatique du zoom

Le zoom du quadrant est automatiquement réinitialisé à chaque changement de paramètre structurel (vue, cursus, millésime, axes, filtres avancés, `referenceAxes`). Évite de rester zoomé sur une zone sans bulles après une bascule de filtre. Le clic sur une bulle ne change aucun de ces paramètres → le zoom est conservé pendant l'exploration interactive.

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
