# Brief d'installation du projet Quadrant

## Configuration

- **BDD MySQL** : OVH mutualisé (déjà en place avec 572K lignes importées)
- **Serveur web + API PHP** : OVH (même hébergement)
- **Site de développement** : `quadrant-dev.exemple.fr` sur OVH
- **Mac** : poste de développement (code, Git, React Vite local)
- **Site hôte** : sur un autre serveur OVH (déjà en production)

Vous éditez le code sur votre Mac, vous le poussez sur GitHub, et vous le déployez sur OVH (FTP, SSH, ou via une action manuelle) pour le voir tourner.

---

## 1. Structure cible du repo

Un seul repo GitHub privé avec deux périmètres distincts :

```
quadrant-projet/
├── README.md
├── .gitignore
├── docs/
│   ├── cadrage-quadrant.md       Document de cadrage
│   ├── CONTRATS.md               Contrats API ↔ site hôte
│   ├── INSTALL.md                Ce document
│   └── migrations/
│       └── 001_init.sql          Script init BDD (déjà exécuté)
│
├── site-quadrant/                === Application Quadrant ===
│   ├── api/                      API PHP 8.x (à déployer sur OVH)
│   │   ├── index.php
│   │   ├── .htaccess
│   │   ├── config/
│   │   │   ├── config.example.php
│   │   │   └── config.php        (gitignored)
│   │   ├── lib/
│   │   └── endpoints/
│   ├── iframe/                   Application React (Vite, dev local)
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.js
│   └── tests/
│       └── test-api.html
│
└── site-hote/                    === Composants pour le site hôte ===
    ├── verify-session.php
    └── embed-quadrant.php
```

---

## 2. Prérequis sur le Mac

Stack minimaliste vu que tout le PHP/MySQL tourne sur OVH.

### À installer

**Homebrew** (gestionnaire de paquets, si absent) :
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**Git** :
```bash
brew install git
git --version
```

**Node.js 20 LTS** (uniquement pour le React) :
```bash
brew install node@20
brew link node@20 --force
node -v
npm -v
```

**GitHub CLI** (pratique pour créer/cloner les repos) :
```bash
brew install gh
gh auth login
```

### Éditeur

**VS Code** :
```bash
brew install --cask visual-studio-code
```

Extensions utiles à installer dans VS Code :
- **PHP Intelephense** : autocomplétion PHP
- **ESLint** : analyse JS/JSX
- **ES7+ React snippets**
- **GitLens** : historique Git riche
- **SFTP** ou **ftp-simple** : déploiement par FTP vers OVH directement depuis VS Code

### Outil BDD pour interroger OVH

Pour explorer la BDD à distance depuis le Mac :

**TablePlus** (gratuit en version réduite, suffisant) :
```bash
brew install --cask tableplus
```
ou **DBeaver Community** (gratuit complet) :
```bash
brew install --cask dbeaver-community
```

Une fois installé, vous vous connectez à la BDD OVH par son hostname et exécutez des requêtes SQL depuis le Mac.

### Optionnel mais utile

**Postman** ou **Bruno** pour tester les appels API :
```bash
brew install --cask postman
# ou
brew install --cask bruno
```

---

## 3. Création du repo GitHub

### 3.1. Via interface web

1. Aller sur https://github.com/new
2. Nom : `quadrant-projet` (ou autre)
3. **Privé** (important : projet interne)
4. Cocher "Add a README file"
5. Pas de `.gitignore` template (on créera le nôtre)
6. Pas de license pour l'instant
7. Créer le repo

### 3.2. Cloner sur le Mac

```bash
mkdir -p ~/dev
cd ~/dev

gh repo clone USERNAME/quadrant-projet
# ou en HTTPS :
git clone https://github.com/USERNAME/quadrant-projet.git

cd quadrant-projet
```

### 3.3. Configurer une clé SSH GitHub (recommandé)

Pour ne plus saisir le mot de passe à chaque push :

```bash
ssh-keygen -t ed25519 -C "votre.email@exemple.fr"
eval "$(ssh-agent -s)"
ssh-add --apple-use-keychain ~/.ssh/id_ed25519
pbcopy < ~/.ssh/id_ed25519.pub
```

Puis sur https://github.com/settings/keys, "New SSH key" et coller. Changer l'URL du remote :
```bash
git remote set-url origin git@github.com:USERNAME/quadrant-projet.git
```

---

## 4. Initialisation de la structure

### 4.1. Récupérer les livrables

Vous avez déjà reçu plusieurs archives. Décompressez et répartissez :

| Livraison | Destination |
|---|---|
| `api-quadrant-v0.1.zip` → contenu du dossier `api/` | `site-quadrant/api/` |
| `test-api.html` | `site-quadrant/tests/test-api.html` |
| `site-hote-v0.1.zip` → fichiers à la racine | `site-hote/` |
| `init_db.sql` | `docs/migrations/001_init.sql` |
| `cadrage-quadrant.md` | `docs/cadrage-quadrant.md` |
| `CONTRATS.md` (inclus dans site-hote-v0.1.zip) | `docs/CONTRATS.md` (déplacement) |
| `INSTALL.md` (ce document) | `docs/INSTALL.md` |

### 4.2. Créer le `.gitignore`

À la racine du repo :

```gitignore
# === Configuration sensible ===
**/config/config.php
.env
.env.local

# === Node (React) ===
node_modules/
dist/
build/
.vite/
*.log
npm-debug.log*

# === macOS ===
.DS_Store
.AppleDouble
.LSOverride
._*

# === IDE ===
.vscode/
.idea/
*.swp
*.swo
*~

# === Logs et temporaires ===
*.log
tmp/
temp/

# === PHP ===
vendor/
composer.lock

# === Déploiement ===
deploy.sh
.ftpconfig
```

### 4.3. Protéger les credentials

Le fichier `site-quadrant/api/config/config.php` contient les credentials BDD OVH et **ne doit jamais** être versionné :

```bash
cd site-quadrant/api/config/
cp config.php config.example.php
# Dans config.example.php : remplacer les valeurs réelles par 'CHANGE_ME'
```

Le `config.php` reste sur votre Mac et sur OVH, mais n'apparaît jamais dans Git.

### 4.4. README à la racine

```markdown
# Projet Quadrant

Application transitoire de visualisation par quadrants à bulles pour comparer
les performances d'établissements universitaires.

## Architecture

- `site-quadrant/` : application autonome
  - `api/` : API PHP 8.x (déploiement OVH)
  - `iframe/` : application React (Vite, dev local + déploiement OVH)
  - `tests/` : outils de test manuels
- `site-hote/` : composants pour intégration côté site hôte (PHP 5.6)
- `docs/` : cadrage, contrats d'interface, migrations SQL

## Démarrage

Voir `docs/INSTALL.md`.

## Cadrage métier

Voir `docs/cadrage-quadrant.md`.
```

---

## 5. Initialiser le projet React (iframe)

C'est la partie qui n'a pas encore été générée. À faire sur votre Mac :

```bash
cd ~/dev/quadrant-projet/site-quadrant/

# Création du projet avec Vite (template React, sans TypeScript)
npm create vite@latest iframe -- --template react

cd iframe
npm install

# Test du serveur de dev
npm run dev
```

Vite démarre sur `http://localhost:5173`. Si vous voyez la page d'accueil React par défaut, l'install est OK.

### Dépendances utiles à ajouter

```bash
npm install axios               # appels API (optionnel, fetch natif suffit)
npm install d3-scale d3-array   # utilitaires SVG (échelles, calculs)
npm install html-to-image       # export PNG depuis SVG (plus tard)
```

Pas de framework UI lourd (Material UI, Ant Design, etc.) pour rester sobre comme spécifié dans le cadrage.

### Configurer Vite pour appeler l'API distante

Modifier `vite.config.js` pour ajouter un proxy vers OVH (évite les soucis CORS en dev) :

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://quadrant-dev.exemple.fr',
        changeOrigin: true,
        secure: true,
      }
    }
  }
})
```

Avec cette config, depuis le React local, vous appelez `/api/quadrant?...` et Vite redirige vers `https://quadrant-dev.exemple.fr/api/quadrant?...` sans CORS.

---

## 6. Déploiement de l'API sur OVH

L'API PHP doit être déployée sur le site `quadrant-dev.exemple.fr`.

### 6.1. Premier déploiement (FTP via FileZilla, Cyberduck ou l'extension SFTP de VS Code)

1. Se connecter au serveur OVH (FTP ou SFTP, selon votre offre)
2. Uploader tout le contenu de `site-quadrant/api/` à la racine web (ou dans un sous-dossier `/api` si vous préférez préfixer les URLs)
3. **Vérifier que `.htaccess` est bien transféré** (les fichiers cachés sont parfois ignorés par défaut)
4. **Vérifier que `config.php`** contient les bonnes credentials OVH et que `mode_dev = true` est activé pour tester

### 6.2. Test du déploiement

Depuis un navigateur :
```
https://quadrant-dev.exemple.fr/health
```

Réponse attendue :
```json
{"status":"ok","database":"ok","timestamp":"..."}
```

En cas d'erreur 500 : vérifier les logs PHP sur le serveur OVH (espace client, "Logs"). Souvent un problème de :
- Credentials BDD incorrects
- Module PHP manquant (PDO MySQL normalement activé par défaut sur OVH)
- `.htaccess` non transféré
- Version de PHP différente de celle attendue (vérifier dans l'espace OVH)

### 6.3. Workflow de déploiement ultérieur

**Option A** : déploiement manuel par FTP/SFTP
- Simple, sans automatisation
- Risque d'oublier des fichiers

**Option B** : script bash local
```bash
# deploy.sh (à mettre dans .gitignore)
#!/bin/bash
rsync -avz --exclude='config.php' --exclude='.git' \
    site-quadrant/api/ \
    USER@FTP_HOST:/www/api/
```

**Option C** : GitHub Actions avec déploiement SFTP automatique
- Plus de mise en place, plus fiable
- À envisager plus tard

Je suggère de commencer avec l'**option B** : un script bash local avec rsync.

---

## 7. Configuration pour le développement local

### 7.1. Le React appelle l'API distante

Grâce au proxy Vite configuré en section 5, depuis le React local :

```javascript
fetch('/api/quadrant?contexte_id=etBz7&...')
```

est automatiquement redirigé vers `https://quadrant-dev.exemple.fr/api/quadrant?...`.

### 7.2. Activer CORS côté API pour la page de test

La page `test-api.html` ouverte en local (URL `file://`) doit pouvoir appeler l'API distante. Sur OVH, dans `site-quadrant/api/config/config.php`, mettre temporairement :

```php
'cors_origin' => '*',
'mode_dev' => true,
```

À remettre à la vraie valeur (`https://etablissement.exemple.fr`) avant la mise en production.

### 7.3. Tester la connexion BDD depuis le Mac

Dans TablePlus ou DBeaver :
- Hostname : `mysql-XXXX.exemple.fr` (à récupérer dans l'espace OVH)
- Port : `3306`
- Database : `quadrant` (ou le nom donné par OVH)
- User : votre utilisateur
- Password : votre mot de passe
- SSL : selon les recommandations OVH

Une fois connecté, vérifier que :
```sql
SELECT COUNT(*) FROM stats_quadrant;
```
retourne environ 572 180.

---

## 8. Workflow de développement quotidien

### 8.1. Démarrage

```bash
# Terminal : React en local
cd ~/dev/quadrant-projet/site-quadrant/iframe
npm run dev
# → http://localhost:5173
```

L'API tourne en permanence sur OVH, rien à démarrer.

### 8.2. Cycle de développement

**Pour modifier le React** : éditer dans VS Code, le hot reload Vite affiche les changements en direct dans le navigateur.

**Pour modifier l'API PHP** : éditer dans VS Code en local, puis déployer sur OVH (script ou FTP) pour voir les changements. Tester avec :
- `test-api.html` ouvert en local
- depuis le React en local (via le proxy)
- ou directement avec curl/Postman

### 8.3. Commits Git

Pour un projet à un dev, structure simple :
- `main` : branche stable
- `dev` : branche courante (optionnel)

Commits clairs et atomiques :
```
api: endpoint /quadrant/details
react: composant SelecteurOnglets
fix: filtre représentativité ignorait les triangles
docs: maj cadrage section 8
```

```bash
git add .
git commit -m "react: composant SelecteurOnglets"
git push
```

---

## 9. Push initial sur GitHub

Une fois la structure en place :

```bash
cd ~/dev/quadrant-projet

# Vérifier que config.php est bien ignoré
git status
# config.php ne doit PAS apparaître

# Premier commit
git add .
git commit -m "init: structure projet + livrables v0.1"
git push origin main
```

---

## 10. Checklist de validation

- [ ] Repo GitHub privé créé et cloné sur le Mac
- [ ] `.gitignore` actif (vérifier que `config.php` n'apparaît pas dans `git status`)
- [ ] Node 20 installé (`node -v`)
- [ ] Vite démarre sur http://localhost:5173 (`npm run dev`)
- [ ] API déployée sur OVH, `/health` répond OK avec `database: ok`
- [ ] TablePlus/DBeaver peut se connecter à la BDD OVH
- [ ] La requête `SELECT COUNT(*) FROM stats_quadrant` retourne ~572K
- [ ] `test-api.html` peut appeler `/quadrant` et obtenir des bulles
- [ ] Le proxy Vite redirige bien `/api/...` vers OVH
- [ ] Un commit + push fonctionne
- [ ] Une copie du `config.php` local est sauvegardée hors du repo (par sécurité)

---

## 11. Points d'attention

**Credentials** : `config.php` ne doit JAMAIS être commité. Si jamais un commit en contient, traiter comme une fuite : changer immédiatement les mots de passe BDD OVH et nettoyer l'historique Git (`git filter-branch` ou BFG Repo-Cleaner).

**Synchronisation Mac → OVH** : toujours déployer depuis la branche `main`, jamais des fichiers locaux non commités. Garantit la cohérence entre dev et Git.

**Versionnement BDD** : tout changement de schéma passe par un nouveau fichier dans `docs/migrations/` numéroté (`002_ajout_colonne.sql`, etc.). Trace ordonnée et reproductible.

**Sauvegarde** :
- GitHub sauvegarde le code, pas la BDD
- OVH propose des sauvegardes natives 30 jours pour la BDD
- Pour plus de sécurité, exporter périodiquement via `mysqldump` ou phpMyAdmin OVH

**Performance OVH mutualisé** : les premiers appels API depuis le Mac peuvent paraître lents (latence réseau + cold start PHP). Une fois rodé, c'est rapide. Si vraiment lent, vérifier la version PHP active dans l'espace client OVH.

**Sécurité OVH** : activer le HTTPS forcé (HSTS) dans l'espace client. Vérifier que le `.htaccess` est bien interprété (mod_rewrite activé).
