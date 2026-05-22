# Projet Quadrant — Brief pour Claude Code

Ce document fournit le contexte permanent du projet. Le lire en début de session, ne pas y revenir ensuite sauf si demandé.

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
- API PHP : endpoints `/health` et `/quadrant` opérationnels en mode dev
- Squelette `verify-session.php` (PHP 5.6) — requête SQL de jointure à compléter côté équipe site hôte
- Composant `embed-quadrant.php` (PHP 5.6) prêt à utiliser
- Page de test `test-api.html` fonctionnelle
- Cadrage complet figé dans `docs/cadrage-quadrant.md`

**À faire (par ordre logique)** :
1. Setup React + Vite (sera lancé avec un prompt dédié)
2. Endpoint `/etablissements-visibles` (combobox rectorat/national)
3. Endpoint `/referentiel/disciplinaire` (alimente les sélecteurs)
4. Endpoint `/quadrant/details` (tooltip enrichi au clic)
5. Endpoint `/export/csv` (export sur onglets Mentions)
6. Composants React un par un
7. Intégration complète et tests bout en bout
8. Désactivation du mode dev, mise en production

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
GET /quadrant?contexte_id=etBz7&formation=Master&vue=mentions&...
```

**À mettre à `false` impérativement avant la mise en production**. Toute action de déploiement en prod doit vérifier ce point.

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

### Règles de diffusion statistique

| Dénominateur | Affichage |
|---|---|
| < 5 | Bulle non affichée (non diffusable) |
| 5-19 | Bulle affichée avec forme spéciale (triangle ou croix) |
| ≥ 20 | Bulle affichée normalement (rond) |

Une bulle s'affiche uniquement si les **deux** dénominateurs (var1 et var2) sont ≥ 5.

### Coloration

- **Onglets Mentions** : 17 couleurs par secteur disciplinaire (codes hex dans le cadrage, transparence 61% appliquée au rendu)
- **Onglets Établissements** : 5 couleurs selon relation région/typologie avec établissement de référence

### Filtrage par contexte

Tous les endpoints API filtrent par `filtre_perimetre LIKE '%;<contexte_id>;%'`. Le `contexte_id` est un identifiant 5 caractères alphanumériques (a-z + A-Z + 0-9), casse mixte.

---

## 11. Quadrant SVG — spécifications techniques

Le quadrant est l'élément central de l'application. **SVG natif sans wrapper de bibliothèque** (pas de Recharts, Chart.js, Plotly, ni D3 complet). Seuls les utilitaires d3-scale et d3-array peuvent être importés pour les échelles et calculs.

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
- **CSS transitions** suffisent pour la majorité des cas (`transition: cx 250ms, cy 250ms, opacity 250ms`)
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
