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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
