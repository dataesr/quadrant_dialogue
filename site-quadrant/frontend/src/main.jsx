import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// DSFR (Système de Design de l'État). À charger AVANT global.css pour que
// nos quelques règles custom (cap 1000px du conteneur principal) puissent
// surcharger les marges/paddings DSFR si besoin via la cascade.
//
// L'usage du DSFR est soumis à agrément DINUM — cf. README.
import '@gouvfr/dsfr/dist/dsfr.min.css';
import '@gouvfr/dsfr/dist/utility/utility.min.css';
import '@gouvfr/dsfr/dist/dsfr.module.min.js';

import App from './App.jsx';
import './styles/global.css';
import { chargerMethodologie } from './data/methodologie.js';
import { initMatomo } from './utils/matomo.js';

// Préchargement de la méthodologie en parallèle du premier rendu —
// fire & forget. Le contenu est externalisé dans `public/methodologie.json`
// pour permettre une mise à jour métier sans rebuild (cf. CLAUDE.md
// § « Mise à jour de la méthodologie sans recompilation »). Les
// consommateurs (tooltips, modale, exports) gèrent gracieusement le
// cas où le cache n'est pas encore prêt.
chargerMethodologie();

// Initialisation du tracker Matomo (instance MESRE, sans cookie).
// Idempotent : safe vis-à-vis du double mount React.StrictMode en dev.
initMatomo();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
