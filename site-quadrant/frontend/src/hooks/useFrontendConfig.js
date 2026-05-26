import { useEffect, useState } from 'react';
import { getFrontendConfig } from '../services/api.js';

// Récupère la configuration applicable côté UI (activation des
// boutons d'export essentiellement) depuis /api/frontend-config.
//
// Fallback permissif : si le fetch échoue (404, réseau, CSP), on
// retombe sur « tous les exports activés ». Le but est de ne JAMAIS
// casser l'app à cause d'un problème de config — l'utilisateur
// retrouve juste les exports si la config est inaccessible. Désactiver
// effectivement un export passe forcément par un fichier config.php
// existant et lisible.

const DEFAULTS = Object.freeze({
  exports: Object.freeze({
    png_enabled:        true,
    xlsx_enabled:       true,
    docx_fiche_enabled: true,
  }),
});

export function useFrontendConfig() {
  const [config, setConfig] = useState(DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    getFrontendConfig()
      .then((data) => {
        if (cancelled) return;
        setConfig({
          exports: {
            png_enabled:        data?.exports?.png_enabled        ?? true,
            xlsx_enabled:       data?.exports?.xlsx_enabled       ?? true,
            docx_fiche_enabled: data?.exports?.docx_fiche_enabled ?? true,
          },
        });
      })
      .catch(() => {
        // Fallback silencieux : on garde DEFAULTS.
      });
    return () => { cancelled = true; };
  }, []);

  return config;
}
