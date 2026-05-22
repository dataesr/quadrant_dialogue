# Quadrant établissements — cadrage

Outil de visualisation par bulles permettant de comparer les performances des établissements universitaires selon différents indicateurs de réussite et d'insertion. Intégré par iframe dans un site hôte existant.

**Statut** : application transitoire, vouée à être remplacée par une application dédiée à terme. Les choix techniques privilégient la simplicité et la rapidité de mise en œuvre sur l'évolutivité long terme.

---

## 1. Architecture

**Deux sous-domaines du même domaine racine** :
- `etablissement.exemple.fr` : site hôte existant en PHP 5.6
- `quadrant.exemple.fr` : iframe React + API PHP 8.x, hébergement OVH mutualisé

**Stack technique** :
- Frontend : React (composant autonome, intégrable par iframe)
- API : PHP 8.x sur OVH mutualisé
- BDD : MySQL OVH (inclus dans l'hébergement)
- Aucune couche intermédiaire (pas de Node.js, pas de Redis)

**Sauvegardes** : OVH natif (30 jours), suffisant.

---

## 2. Authentification

Le site hôte gère ses comptes localement. L'authentification s'appuie sur **deux tables existantes** côté site hôte :

- `connexions` : sessions des utilisateurs (`tokenConnexion`, `token`, `expirationForm`, `Etat`...)
- `dial_campagne_utilisateurs_connexions` : contextes d'utilisation (`token_campagne_utilisateurs` lié à un `tokenConnexion`)

Le site quadrant **ne maintient pas sa propre logique d'authentification**. Il interroge le site hôte pour vérifier la validité d'une session.

### Trois identifiants transmis du site hôte à l'iframe

- `tokenConnexion` (UUID) : la session active de l'utilisateur
- `token` : l'identifiant utilisateur dans cette session
- `token_campagne_utilisateurs` : le contexte d'utilisation (rôle + entité ciblée)

Transmission par **POST caché auto-soumis** depuis la page hôte vers l'iframe (token jamais dans une URL).

### Vérification périodique server-to-server

L'API quadrant vérifie périodiquement (délai N à arbitrer à l'implémentation, ordre de grandeur 2 à 5 minutes) la validité de la session en appelant un endpoint dédié du site hôte via cURL PHP-à-PHP.

L'endpoint de vérification reçoit les trois identifiants, vérifie en BDD :
- `connexions.Etat = 'I'` (actif)
- `connexions.expirationForm > NOW()`
- `dial_campagne_utilisateurs_connexions.fin` non échue
- Cohérence des tokens entre les deux tables

Il **prolonge `expirationForm`** (chaque appel quadrant compte comme une action de l'utilisateur sur le site hôte) et retourne `{ valid: true, role: '...', contexte_id: '...' }`.

### Sécurisation de l'endpoint de vérification

- Restreint par allowlist IP (seules les IP sortantes de l'hébergement quadrant)
- Protégé par une clé d'API server-to-server simple (header)
- Pas de header CORS, non documenté publiquement
- Journalisation des appels

### Contexte figé pour la durée de l'iframe

Le `token_campagne_utilisateurs` représente un contexte précis et figé : un établissement précis, une région précise, ou national. Si l'utilisateur change de casquette, il change de page sur le site hôte, ce qui régénère le `token_campagne_utilisateurs` et provoque un rechargement complet de l'iframe.

Conséquence : l'iframe n'a jamais à gérer un changement de contexte au cours de sa vie. Le contexte est connu dès le chargement et reste stable.

### Cache de vérification côté API quadrant

Pour éviter un appel cURL à chaque requête API, le résultat de la vérification est mis en cache côté quadrant pendant N minutes. Au-delà, ré-appel vers l'hôte. Le cache contient le rôle et le contexte_id renvoyés par l'hôte.

---

## 3. Contexte d'utilisation et périmètre

### Principe : un identifiant de contexte unique

Le quadrant ne raisonne pas en termes de rôles explicites. Toute la logique d'autorisation passe par un **identifiant de contexte** fourni par le site hôte après vérification.

Cet identifiant peut être :
- L'identifiant d'un établissement précis (pour un utilisateur établissement)
- L'identifiant d'un rectorat (pour un utilisateur rectorat)
- L'identifiant national (pour un utilisateur national)

L'API quadrant ne sait pas a priori de quel type il s'agit — elle se contente de filtrer les données qui contiennent cet identifiant dans leur champ `contextes_id`.

### Format des identifiants de contexte

Tous les identifiants (`id_etablissement`, `id_rectorat`, `id_national`) suivent un format unifié : **5 caractères alphanumériques**.

L'unicité est garantie **par construction** : ces identifiants désignent les structures du système (établissements, rectorats, national) dans un référentiel unique côté site hôte. Un token donné désigne une et une seule structure, sans ambiguïté possible quelle que soit sa nature.

Conséquences :
- L'API n'a pas besoin de connaître la nature d'un token pour le traiter correctement
- Tous les id ont la même longueur, donc aucun risque qu'un id soit préfixe d'un autre
- La colonne `contextes_id` a un format fixe : `;xxxxx;xxxxx;xxxxx;` (19 caractères), `VARCHAR(30)` confortable
- La gestion des tokens (création, unicité, attribution) est intégralement du ressort du site hôte

### Combobox d'établissement conditionnel

Après filtrage des données selon le contexte, l'API compte les `id_etablissement` distincts visibles :
- **Un seul** : pas de combobox dans l'iframe, l'établissement est implicite (cas typique : utilisateur établissement)
- **Plusieurs** : combobox alimenté par la liste obtenue, permettant la navigation entre établissements du périmètre autorisé (cas typique : utilisateur rectorat ou national)

Le combobox est servi par un endpoint dédié de l'API quadrant qui interroge la BDD métier filtrée par contexte.

### Contexte figé pour la durée de l'iframe

Le contexte de session ne change pas pendant la vie de l'iframe. Si l'utilisateur veut changer de périmètre (basculer entre des casquettes différentes selon ses droits), il change de page sur le site hôte, ce qui régénère le `token_campagne_utilisateurs` et provoque un rechargement complet de l'iframe.

---

## 4. Les 8 onglets

### Groupe 1 — Mentions (onglets 1 à 4)

- Licence générale — Mentions
- Licence professionnelle — Mentions
- BUT — Mentions
- Master — Mentions

**Une bulle = une mention** de l'établissement de contexte.

**Coloration** : par secteur disciplinaire quadrant selon la nomenclature à **16 postes** (référentiel propre adapté de SIES).

**Liste des mentions non représentées** : affichée en complément du graphique, pour tous les rôles, pour l'établissement de contexte. Précise pour chaque mention pourquoi elle n'apparaît pas (dénominateur insuffisant sur var1, sur var2, pas de matching réussite/insertion).

### Groupe 2 — Établissements (onglets 5 à 8)

- Licence générale — Établissements
- Licence professionnelle — Établissements
- BUT — Établissements
- Master — Établissements

**Une bulle = un établissement**. Toutes les bulles sont visibles dans le graphique pour tous les rôles.

**Coloration** : 5 catégories selon la relation région/typologie avec l'établissement de contexte :
1. L'établissement sélectionné lui-même
2. Même région ET même typologie
3. Même région, autre typologie
4. Même typologie, autre région
5. Autres

**Restriction d'accès aux infobulles** :
- `etablissement` : détail uniquement pour sa bulle
- `rectorat` : détail pour les étabs de sa région
- `national` : détail pour toutes les bulles

Bulles non autorisées : aucune infobulle, ni au survol ni au clic. Curseur non actif.

### Onglet par défaut

- `etablissement` → onglet **4** (Master — Mentions)
- `rectorat` et `national` → onglet **8** (Master — Établissements)

Rationnel : l'insertion professionnelle ne se mesure correctement qu'à la sortie du Master. Les étudiants en sortie de Licence partent majoritairement vers d'autres études, le Master est donc le niveau le plus pertinent pour l'analyse principale.

---

## 5. Sélecteurs et interactions

### Sélecteurs disponibles (persistance : aucune entre sessions)

- **Établissement de contexte** (combobox conditionnel : affiché uniquement si plusieurs établissements visibles selon le contexte d'autorisation transmis)
- **Millésime** (dernier publié par défaut, liste déroulante)
- **Filtres disciplinaires** : comportement différent selon le type d'onglet.
  - **Sur les onglets Mentions** (1-4) : trois filtres **indépendants** (pas de cascade), chacun pouvant être positionné individuellement :
    - **Grand domaine (GDDISC)** : 5 valeurs (Droit-Économie-AES / Lettres-Langues-SHS / Sciences et sciences de l'ingénieur / Santé / STAPS)
    - **Discipline (DISCIPLI)** : 16 valeurs
    - **Secteur disciplinaire quadrant** : 16 valeurs — nomenclature propre au quadrant
    
    Les trois nomenclatures ne sont **pas strictement imbriquées** : le secteur quadrant peut traverser plusieurs disciplines, et plusieurs disciplines peuvent contribuer à un même secteur quadrant. Effet de chaque filtre : restreindre le périmètre de calcul des bulles à l'intersection des trois critères actifs.
  
  - **Sur les onglets Établissements** (5-8) : un seul filtre **Secteur quadrant**, dont la liste **s'adapte dynamiquement à l'établissement de référence**. Un secteur n'apparaît dans le sélecteur que si l'établissement de référence a au moins une mention dont les dénominateurs des deux variables actuellement choisies (X et Y) sont ≥ 5 sur le millésime sélectionné. La liste se recalcule à chaque changement d'établissement, de millésime, ou de variables.
- **Variables des axes X et Y** : liste ordonnée canonique d'indicateurs organisée par thématique (Réussite, Insertion). Contrainte `var1 < var2` (l'UI empêche l'inverse). Pour 3 indicateurs d'insertion (Taux sortants emploi salarié en France, non salarié, stable), un **sélecteur de délai dynamique** apparaît à côté de l'indicateur, proposant les valeurs 6, 12, 18, 24, 30 mois. Pour les autres indicateurs, ce sélecteur est masqué.
- La matrice cursus × indicateur (quels indicateurs sont proposés sur quels onglets) est stockée en BDD comme une table de configuration, à finaliser avec l'équipe métier au fil de la livraison des données.
- **Filtre Type de formation** (onglets Master uniquement, 4 et 8) : trois valeurs `Tous` (défaut), `Master enseignement`, `Master hors enseignement`. Le champ `formation` de la source identifie le cursus (LG, LP, BUT, Master). Le filtre s'appuie sur le champ `master` (Master enseignement / Master hors enseignement / vide), qui n'est renseigné que pour les Masters. N'apparaît pas sur les autres onglets. À envisager : renommage du filtre en « Type de Master » au moment des maquettes pour clarification UX.
- **Filtre Représentativité** (tous les onglets) : deux valeurs `Toutes` (défaut), `Représentatif uniquement` (denom ≥ 20 sur les deux axes). Quand actif, masque visuellement les bulles avec fiabilité limitée (triangles et croix). La médiane/moyenne reste calculée sur tous les points calculables, indépendamment de ce filtre.
- **Toggle médiane / moyenne** pour les lignes de référence (par défaut : médiane)

### Caractéristiques graphiques

- **Axes** : toujours 0% à 100% (échelle fixe, pas de zoom adaptatif)
- **Lignes de médiane/moyenne** : calculées sur **tous les points calculables** (y compris non diffusables individuellement), pour donner une référence statistique juste
- **Taille des bulles** : proportionnelle au **dénominateur de la variable de l'axe X** (recalculée si l'utilisateur change var1)

### Formes des bulles selon les dénominateurs

| Dénominateur var1 | Dénominateur var2 | Forme |
|---|---|---|
| ≥ 20 | ≥ 20 | Rond |
| ≥ 20 | entre 5 et 19 | Triangle pointé vers le bas |
| entre 5 et 19 | ≥ 20 | Triangle pointé vers la gauche |
| entre 5 et 19 | entre 5 et 19 | Croix (×) |

### Infobulles

- Au **survol** : affichage du détail
- Au **clic** : épinglage de l'infobulle (reste affichée jusqu'à clic ailleurs)
- Pas d'infobulle au survol pour les bulles non autorisées
- Stratégie de chargement (en bloc ou à la demande) : à arbitrer à l'implémentation selon les performances

---

## 6. Règles de diffusion statistique

Données fines stockées en BDD (numérateurs ET dénominateurs ET taux). L'API applique le filtrage.

### Règles fondées sur le dénominateur

- **Dénominateur < 5** : indicateur non diffusable
- **Dénominateur entre 5 et 19** : indicateur diffusé avec forme spéciale (triangle / croix)
- **Dénominateur ≥ 20** : indicateur diffusé normalement

### Conséquences sur l'affichage

- Une bulle s'affiche uniquement si les dénominateurs des deux variables d'axes sont ≥ 5
- Si l'une des deux variables a un dénominateur < 5 → bulle absente du graphique
- Cas vide : graphique avec message explicite « Aucune donnée diffusable »

### Médiane et moyenne

Calculées sur tous les points où les taux sont calculables, y compris ceux non diffusés individuellement. Cela donne une référence robuste indépendante du hasard de la diffusion.

---

## 7. Exports

| Onglet | Export PNG | Export CSV |
|---|---|---|
| Mentions (1-3) | Oui | Oui |
| Établissements (4-6) | Oui | Non |

### CSV (onglets Mentions uniquement)

- Une ligne par mention de l'établissement de contexte (toutes les mentions, pas seulement celles avec bulle)
- Une colonne par variable disponible
- Cellule = valeur du taux si dénominateur ≥ 5, « non diffusable » si < 5, vide si indicateur indisponible

### PNG (tous les onglets)

Capture du graphique tel qu'affiché. Pas d'autres restrictions.

---

## 8. Modèle de données

### Principe : table unique dénormalisée

Compte tenu du caractère transitoire de l'application et de la volumétrie modeste, on adopte une approche pragmatique : **une seule table de faits qui copie la structure du JSON source SIES tel quel**, sans tables de dimensions séparées.

**Avantages** :
- ETL trivial (chargement direct du JSON dans la table)
- Cohérence garantie avec la source : pas de risque de désynchronisation entre dimensions et faits
- Requêtes API simples sans jointures
- Maintenance facile, déboguage immédiat
- Volumétrie négligeable (quelques dizaines de milliers de lignes)

### Table principale `stats_quadrant`

Reprend tous les champs du JSON source, plus quelques contraintes techniques :

```sql
CREATE TABLE stats_quadrant (
  -- Identifiants de contexte
  id_paysage           VARCHAR(5)  NOT NULL COLLATE utf8mb4_bin,
  id_reg               VARCHAR(5)           COLLATE utf8mb4_bin,  -- vide pour national
  id_nat               VARCHAR(5)  NOT NULL COLLATE utf8mb4_bin,
  filtre_perimetre     VARCHAR(30) NOT NULL COLLATE utf8mb4_bin,
  
  -- Établissement
  uo_lib               VARCHAR(255),
  typologie_d_universites_et_assimiles VARCHAR(100),
  reg_id               VARCHAR(10),
  reg_nom              VARCHAR(100),
  
  -- Cursus et mention
  formation            VARCHAR(50)  NOT NULL,
  type_diplome_sise    VARCHAR(2),
  diplom               VARCHAR(20)  NOT NULL,
  libelle_intitule     VARCHAR(255),
  master               VARCHAR(30),  -- 'Master enseignement' / 'Master hors enseignement' / vide
  
  -- Référentiel disciplinaire
  dom                  VARCHAR(10),
  dom_lib              VARCHAR(100),
  discipli             VARCHAR(2),
  discipli_lib         VARCHAR(100),
  secteur_disciplinaire_quadrant VARCHAR(100),
  
  -- Indicateur
  type                 VARCHAR(20)  NOT NULL,   -- 'Réussite' | 'Insertion'
  indicateur           VARCHAR(100) NOT NULL,
  date_inser           VARCHAR(10),             -- '6', '12', '18', '24', '30' ou '' (chaîne vide pour indicateur non déclinable). Le .0 du JSON source est retiré à l'ingestion.
  
  -- Millésime et population
  millesime            VARCHAR(4)   NOT NULL,
  promo                VARCHAR(10),
  population           VARCHAR(50),
  
  -- Valeurs
  numerateur           INT,
  denominateur         INT,
  
  -- Métadonnées
  source               VARCHAR(100),
  
  INDEX idx_filtre (filtre_perimetre),
  INDEX idx_formation_millesime (formation, millesime),
  INDEX idx_secteur (secteur_disciplinaire_quadrant),
  INDEX idx_diplom (diplom, millesime)
);
```

Pas de clé primaire composée formelle vu la complexité (gestion du NULL sur `date_inser`). L'unicité est garantie côté ETL par la nature de la source SIES.

### Tables techniques additionnelles

Trois petites tables complètent le dispositif, leur contenu ne se déduit pas de la source :

- `app_session_cache` : cache de validation des sessions iframe (voir section 2)
- `etl_import_batch` : traçabilité des imports
- `dim_indicateur_cursus` : matrice de disponibilité des indicateurs par cursus (~30 lignes), alimente les sélecteurs dynamiques de Variables X et Y

### Référentiels disciplinaires : alimentés à la volée

Les listes pour les sélecteurs (5 grands domaines, 15 disciplines, 17 secteurs quadrant) sont alimentées par requêtes `SELECT DISTINCT` sur la table principale :

```sql
SELECT DISTINCT dom, dom_lib FROM stats_quadrant ORDER BY dom;
SELECT DISTINCT discipli, discipli_lib FROM stats_quadrant ORDER BY discipli;
SELECT DISTINCT secteur_disciplinaire_quadrant FROM stats_quadrant ORDER BY secteur_disciplinaire_quadrant;
```

Pas de table dédiée, pas de risque de désynchronisation.

### Ordre canonique des indicateurs

L'ordre canonique des 11 indicateurs pour la contrainte `var1 < var2` est **codé dans l'application** (côté API et React), pas en BDD. Cohérent avec le caractère stable de cette liste.

### Filtrage par contexte

Le filtrage d'autorisation s'appuie sur la colonne `filtre_perimetre` au format `;<id_nat>;<id_reg>;<id_paysage>;` **déjà calculé dans la source SIES**. L'ETL ne le construit pas, il le copie tel quel.

Requête type :

```sql
SELECT ...
FROM stats_quadrant
WHERE filtre_perimetre LIKE :motif
  AND formation = :cursus
  AND millesime = :millesime
  ...
```

Avec `:motif` = `'%;<id_recu>;%'` calculé en PHP. Les délimiteurs systématiques évitent les faux positifs.

**Cas particulier : id_reg vide pour le national**. Les indicateurs nationaux n'ont pas de rattachement régional, leur `id_reg` est une chaîne vide, donc `filtre_perimetre` a la forme `;<id_nat>;;<id_paysage>;`. Le filtrage par `LIKE '%;<id_nat>;%'` les trouve quand même.

**Collation binaire obligatoire** : les tokens étant en casse mixte (a-z + A-Z + 0-9), `filtre_perimetre` et les colonnes d'identifiants doivent utiliser `utf8mb4_bin` pour distinguer `a3Bf2` de `A3bF2`.

### Agrégation à la volée

Toutes les agrégations (au niveau établissement sur les onglets Établissements, sur un filtre disciplinaire, etc.) sont **recalculées à la volée par l'API** à partir de la maille mention. Pas de pré-agrégation stockée.

---

## 9. API

### Endpoints

| Verbe | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/etablissements-visibles` | Tokens | Liste des étabs distincts visibles selon le contexte (alimente le combobox) |
| `GET` | `/quadrant` | Tokens | Bulles de l'onglet courant |
| `GET` | `/quadrant/details` | Tokens | Détails d'une bulle |
| `GET` | `/quadrant/mentions-non-representees` | Tokens | Mentions absentes du quadrant (Mentions uniquement) |
| `GET` | `/referentiel/disciplinaire` | Tokens | Référentiel à 3 niveaux |
| `GET` | `/export/csv` | Tokens | Export CSV (Mentions uniquement) |
| `GET` | `/health` | Aucune | Health check |

L'iframe transmet à chaque appel les trois identifiants (`tokenConnexion`, `token`, `token_campagne_utilisateurs`) dans des headers HTTP (par exemple `X-Connexion-Token`, `X-User-Token`, `X-Campagne-Token`).

L'API quadrant valide ces identifiants via son cache local ou en appelant l'endpoint de vérification du site hôte (voir section 2).

### Caractéristiques

- Verbes : `GET` pour lecture, `POST` pour mutation
- Format : JSON sauf `/auth/establish` (HTML) et `/export/csv` (CSV)
- Headers : `Cache-Control: no-store` partout, `X-Content-Type-Options: nosniff`
- CORS strict : `Access-Control-Allow-Origin: https://etablissement.exemple.fr`
- CSP : `frame-ancestors https://etablissement.exemple.fr`
- Format d'erreur : `{ "error": "code_court", "message": "explication" }`

### Stratégie d'appels

Un seul appel groupé ou plusieurs appels séparés : à arbitrer à l'implémentation selon les performances.

---

## 10. Sécurité

### Couches actives

- HTTPS obligatoire (HSTS)
- Authentification déléguée au site hôte (vérification server-to-server)
- Endpoint de vérification côté hôte protégé par IP allowlist + clé d'API
- CORS strict, CSP `frame-ancestors`
- Validation par allowlist de tous les paramètres reçus
- Requêtes PDO préparées partout (intégrité SQL)
- Rate limit par utilisateur + détection d'erreurs répétées (auth failed, 403 répétés) avec blocage temporaire automatique

### Chiffrement au repos

Recommandé pour MySQL OVH : `innodb_encrypt_tables`, à activer si le module est disponible sur l'offre.

### Audit

- Format JSON Lines : `{"ts", "uid", "ev"}` (minimal)
- Conservation : 6 mois
- Journal séparé des données métier (fichier sur le serveur)
- Pas de détection comportementale poussée (détection par rate limit uniquement)

---

## 11. ETL

### Source

Fichier CSV/Excel à la maille mention, fourni périodiquement par le SIES (mode de dépôt hors scope, géré en amont).

### Processus

1. Lecture du fichier
2. Validation : formats, plages, code UAI connu, mention rattachable à un secteur
3. Calcul de cohérence (taux ≈ numérateur/dénominateur)
4. Insertion en BDD (`INSERT ... ON DUPLICATE KEY UPDATE`)
5. Mise à jour de `dim_millesime` (statut `publie`) en fin de batch réussi
6. Traçabilité dans `etl_import_batch`

### Publication

Immédiate après ingestion réussie. Pas de circuit de validation manuelle entre ingestion et publication. L'ETL est responsable seul de la qualité de ce qu'il publie.

### Chargement initial

Plusieurs millésimes à importer en série au démarrage. Même mécanisme que les chargements périodiques ultérieurs (un seul script à maintenir).

### Reprise sur incident

Hors scope : géré par les admins en direct SQL.

---

## 12. UI/UX

### Principes directeurs

- **Sobre, simple, efficace**
- Pas d'emojis
- Pas d'ornementation décorative
- Cible : desktop uniquement (1024px et plus)
- Sous 1024px : bandeau d'avertissement non bloquant, l'application reste utilisable
- Français uniquement (pas d'i18n)

### Erreurs

Messages explicites avec suggestion d'action. Catalogue à standardiser. Aucun détail technique exposé à l'utilisateur.

### Navigateurs

Navigateurs récents (Chrome, Firefox, Edge, Safari, 2 dernières versions). Sur navigateur trop ancien : message d'incompatibilité, pas de fonctionnement dégradé.

### Accessibilité

Bonnes pratiques sans viser de certification RGAA. Combobox accessible au clavier, sémantique HTML correcte, contrastes suffisants.

---

## 13. Déploiement et exploitation

### Environnement

- **Un seul environnement** : production
- Pas de recette, pas de pré-production
- Compensation : stratégie de déploiement progressive (pilote sur un seul établissement avant ouverture générale)

### Déploiement

- Manuel via procédure documentée et script
- Pas de CI/CD automatisée
- Code source dans dépôt Git privé
- Secrets en variables d'environnement OVH, jamais dans Git

### Maintenance

Assurée par l'équipe interne. Pas de SLA contractuel.

### Audit de sécurité

Aucun pentest planifié avant production. Possible sur demande ultérieure. Documentation et code conçus pour être audit-friendly.

---

## 14. RGPD et conformité

- Déclaration RGPD couverte par celle du site hôte (à compléter dans le registre des traitements)
- Audit minimal pour respecter la minimisation des données
- Conservation 6 mois (à valider avec le DPO)
- Procédure d'effacement RGPD : passe par le DPO du site hôte → équipe technique expurge l'audit log

---

## 15. Plan de réalisation

### Découpage en trois projets

**Projet A — Embedding sécurisé**
- Site hôte : génération du token HMAC, formulaire POST caché
- Iframe : réception du token, session, cookie, silent reauth
- Contenu minimal (juste valider la chaîne d'auth)

**Projet B — UI et API métier**
- UI React complète (8 onglets, sélecteurs, infobulles, exports)
- API PHP : tous les endpoints métier
- BDD : schéma complet, jeu de données réel adapté
- Aucune sécurité d'accès (rôle simulé en dur)

**Projet C — Convergence**
- Intégration : authentification du A devient préalable des appels du B
- Ajout des contrôles RBAC sur chaque endpoint
- Validation manuelle de bout en bout

Les Projets A et B sont menés **en parallèle**, ordre de finalisation indifférent. Le Projet C ne peut démarrer qu'à la convergence des deux premiers.

### Tests

Pas de tests automatisés systématiques. Validation manuelle par phase.

### Livrables

- Code React
- Code API PHP
- Schéma BDD (SQL)
- Documentation technique minimale (README + architecture haut niveau)

Pas de maquettes formelles, pas de guide utilisateur, pas de jeu de tests dédié.

---

## 16. Évolutions identifiées pour versions ultérieures

### Architecture de sécurité renforcée contre le rejeu / MITM via proxies

Une architecture de sécurité plus robuste a été étudiée, à activer si la menace de rejeu / interception via proxies d'inspection HTTPS (courants en milieu administratif) se confirme comme prioritaire.

**Principe**

Combinaison de deux mécanismes complémentaires :

1. **Communication serveur-à-serveur invisible au navigateur (back-channel)**
   - Au chargement initial, le site hôte appelle l'API quadrant via cURL PHP-à-PHP
   - L'API renvoie un secret de session unique + les données initiales déjà filtrées selon le rôle
   - Le HTML servi au navigateur contient l'iframe pré-remplie
   - Aucun appel API JavaScript au démarrage, donc rien à intercepter pour le proxy de l'utilisateur

2. **Signature multi-facteurs sur les appels API dynamiques**
   - Chaque requête API (changement de filtre, etc.) embarque une signature HMAC calculée sur : nonce de requête + timestamp + méthode + chemin + paramètres + identifiants de session
   - Le secret de signature reste côté serveur (PHP du site hôte ↔ API quadrant), jamais accessible au JavaScript
   - Le React demande la signature au site hôte via postMessage (sans appel réseau) avant chaque appel API
   - Validation côté API : signature correcte + nonce non consommé + timestamp dans une fenêtre courte (par exemple 30 s)

**Apports**

- Anti-rejeu fort : une requête capturée ne peut pas être rejouée (nonce à usage unique)
- Anti-manipulation : modifier un paramètre casse la signature
- Protection contre vol de cookie : le cookie seul ne suffit plus pour faire des appels API
- Le secret n'est jamais exposé au navigateur ni au proxy

**Inconvénients**

- Complexité accrue : cURL server-to-server, gestion du secret de session, postMessage par appel
- Le PHP 5.6 du site hôte devient partie prenante de la sécurité (endpoint de signature)
- Quelques millisecondes ajoutées à chaque appel API

**Conditions de déclenchement de l'évolution**

- Constat opérationnel d'une vraie exposition au MITM via proxies
- Demande explicite RSSI / audit
- Migration du site hôte vers une version PHP plus récente (rendrait l'évolution plus simple)

### Vue trajectoires et score de stabilité

Pour enrichir la lecture des quadrants par la dimension temporelle, deux fonctionnalités à intégrer en v1.5+ :

**Vue dédiée avec trajectoires**

Pour une mention ou un établissement, affichage de ses positions successives sur le quadrant à travers les millésimes. Permet de distinguer une bulle stable d'une bulle volatile, et d'identifier les tendances (amélioration constante, dégradation, oscillation).

**Score de stabilité numérique simple**

Métrique synthétique (coefficient de variation ou équivalent, à définir) calculée sur les N derniers millésimes pour qualifier la fiabilité statistique d'une mention dans le temps.

**Anticipation côté BDD dès la v1**

Pour rendre ces fonctionnalités possibles sans refonte ultérieure, la v1 doit garantir :
- Conservation complète de l'historique (déjà tranché)
- Stockage des numérateurs et dénominateurs sur tous les millésimes (déjà tranché)
- Identifiant de mention stable dans le temps (fourni par SIES)

**Règle métier figée dès maintenant** : une mention = un identifiant stable. Identifiant différent = mention différente, aucune gestion de correspondance entre identifiants. Les ruptures éventuelles côté SIES sont traitées comme l'apparition d'une nouvelle mention et la disparition d'une autre.

---

## 17. Points ouverts à finaliser

À traiter au fur et à mesure du projet, sans bloquer le démarrage :

- Liste des 11 indicateurs validée (Réussite : 7, Insertion : 4). Ordre canonique pour la contrainte var1 < var2 à finaliser. Trois indicateurs (9, 10, 11) déclinables par délai (6, 12, 18, 24, 30 mois).
- Matrice cursus × indicateur (`dim_indicateur_cursus`) connue d'après les données réelles : LG = {réussite 3 ans, 4 ans, 3 ou 4 ans, Taux de poursuite, Taux de poursuivants, + 3 indicateurs d'emploi} ; Master = {réussite 2 ans, 3 ans, 2 ou 3 ans, Taux de poursuivants, + 3 indicateurs d'emploi} ; LP = {Taux de réussite, Taux de poursuivants, + 3 indicateurs d'emploi} ; BUT = {Taux de réussite, Taux de poursuite, Taux de poursuivants, + 3 indicateurs d'emploi}.
- L'indicateur **"Taux de réussite"** est unique en BDD : il représente un taux de réussite en 1 an, partagé entre LP (seule année du cursus) et BUT (dernière année du cursus, particularité documentée). La table `dim_indicateur` contient une seule ligne ; la matrice cursus × indicateur l'associe aux deux cursus.
- Millésimes disponibles en v1 (constatés dans la donnée source) : LG 2019-2023, Master 2019-2023, LP 2019-2024, BUT 2022 et 2024. Le BUT s'affiche normalement avec ses deux millésimes, sans fonctionnalités temporelles riches (trajectoires) tant qu'il n'a pas au moins 3 millésimes. Les fonctionnalités v1.5+ s'activeront automatiquement quand le nombre de millésimes BUT le permettra.
- Référentiel disciplinaire complet à 3 niveaux (mapping exact des 13 secteurs vers leurs disciplines et domaines)
- Palette de **17 couleurs** pour les secteurs disciplinaires quadrant — codes hex extraits (couleurs de base, avant transparence) : Droit `#44709D`, Sciences économiques `#6D91B1`, Gestion `#8CB8D3`, Autres formations juridiques/économiques `#BFDBF1`, Lettres-langue-arts `#B8502B`, Psychologie `#C65D26`, Histoire-géographie `#E6782D`, Information communication `#EEA95E`, Autres sciences humaines et sociales `#F2CF75`, Sciences de la vie-terre-univers `#2B6443`, Sciences fondamentales `#3C874C`, Sciences de l'ingénieur `#5F9D5A`, Informatique `#71B467`, Autres sciences-technologies `#90C486`, STAPS `#9DD28A`, Santé `#B4DEAE`, **Interdisciplinaire à définir** (proposition par défaut : violet sobre `#8B6FA8` ou brun chaud `#A87C5F`, à valider avec l'équipe métier ou à comparer avec la maquette d'origine). Note : STAPS et Santé sont visuellement dans la famille des verts au même titre que les sciences, à reconsidérer éventuellement aux maquettes pour distinction.
- Palette de 5 couleurs pour la catégorisation région/typologie (sur les onglets Établissements) — codes hex extraits (couleurs de base, avant transparence) : Établissement sélectionné `#DD5957`, Même région autres typologies `#4A7AAA`, Même région ET typologie `#5C9D5B`, Même typologie autres régions `#ECC94B`, Autres établissements `#BBB0AA`.
- Transparence d'affichage des bulles : **61% d'opacité** (alpha = 0.61) appliquée uniformément sur les deux palettes lors du rendu dans le quadrant, pour permettre d'identifier les chevauchements de bulles.
- Modalités d'identification du rôle à la connexion (gestion via les comptes locaux du site hôte)
- Calibrage des seuils anti-abus (rate limit, détection d'erreurs)
- Adaptation du modèle BDD au format réel du fichier source SIES
- Stratégie d'appels API (groupés ou séparés)
- Calendrier de mise en production
