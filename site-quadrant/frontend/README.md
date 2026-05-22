# Application React (frontend)

Ce dossier sera initialisé avec Vite à la première mise en place.

## Initialisation (une seule fois)

Depuis le dossier `site-quadrant/` :

```bash
# Suppression de ce placeholder
rm -rf frontend

# Création du projet React avec Vite
npm create vite@latest frontend -- --template react
cd frontend
npm install

# Démarrage du serveur de dev
npm run dev
```

Le serveur démarre sur http://localhost:5173.

## Configuration Vite pour appeler l'API distante

Modifier `vite.config.js` après l'initialisation pour ajouter le proxy
qui évite les soucis CORS en dev :

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

## Dépendances utiles à ajouter

```bash
npm install axios               # appels API (optionnel, fetch natif suffit)
npm install d3-scale d3-array   # utilitaires SVG (échelles, calculs)
npm install html-to-image       # export PNG (plus tard)
```

Voir `CLAUDE.md` à la racine pour les conventions et le contexte du projet.
