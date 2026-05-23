# Quadrant — Frontend

Frontend React de l'application Quadrant. Servi depuis l'hébergement OVH dans
`dist/` après build Vite, sur le même domaine que l'API PHP.

## Stack

- **Vite** + **React 18** (JavaScript, pas de TypeScript)
- **CSS pur** (`src/styles/global.css`) — pas de Tailwind ni CSS-in-JS
- **d3-scale / d3-array** pour les futurs calculs SVG
- **SheetJS** pour l'export Excel généré côté navigateur — **pas encore
  installé**. Le paquet `xlsx` sur npm est obsolète (CVE non corrigées,
  cf. [advisory GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)).
  Installation depuis le CDN officiel SheetJS au moment de l'implémentation
  de l'export :
  ```bash
  npm install https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz
  ```

Pas de Redux, pas de framework UI : le strict nécessaire.

## Lancer en développement

```bash
cd site-quadrant/frontend
cp .env.example .env       # à compléter, voir ci-dessous
npm install
npm run dev
```

Le serveur Vite démarre sur http://localhost:5173.

## Build pour la production

```bash
npm run build              # génère dist/
npm run preview            # sert dist/ sur http://localhost:4173 pour vérifier
```

Le dossier `dist/` est ensuite déployé tel quel sur OVH (cf. `deploy.sh` à la
racine du repo).

## Variables d'environnement

Voir `.env.example` pour la liste complète. Résumé :

| Variable | Rôle |
|---|---|
| `VITE_API_BASE_URL` | Préfixe de toutes les URLs API côté fetch. `/api` en dev (avec proxy) et en prod (même origine). |
| `VITE_API_PROXY_TARGET` | Cible du proxy Vite en dev. Si renseigné, `/api/*` est redirigé vers cette URL → contourne CORS. |
| `VITE_CONTEXTE_ID_DEV` | `contexte_id` à 5 caractères, injecté automatiquement dans toutes les requêtes pour court-circuiter la session en mode dev côté API. |

## Mode dev — comment l'API est appelée

L'API tourne avec `mode_dev=true` côté serveur, ce qui accepte un paramètre
`contexte_id` en query string à la place des trois tokens de session. Le client
API (`src/services/api.js`) lit `VITE_CONTEXTE_ID_DEV` et l'ajoute à chaque
appel. Pour basculer en mode prod (authentification réelle par tokens
postMessage depuis le site hôte), il suffira de vider cette variable et de
brancher le passage de tokens.

## Structure

```
frontend/
├── public/                # fichiers statiques copiés tels quels dans dist/
├── src/
│   ├── App.jsx            # composant racine
│   ├── main.jsx           # point d'entrée React
│   ├── assets/            # logos, images
│   ├── components/        # composants UI (à venir)
│   ├── context/           # React Context (à venir)
│   ├── hooks/             # hooks personnalisés (à venir)
│   ├── services/
│   │   ├── api.js         # client API (fetch + ApiError)
│   │   └── mock.js        # fausses réponses pour dev offline
│   ├── styles/
│   │   └── global.css     # reset léger + styles globaux
│   └── utils/             # helpers divers (à venir)
├── index.html
├── package.json
├── vite.config.js
└── .env.example
```

Cf. `CLAUDE.md` à la racine du repo pour le contexte global du projet.
