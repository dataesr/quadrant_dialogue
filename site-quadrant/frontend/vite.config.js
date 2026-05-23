import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy de développement optionnel : si VITE_API_PROXY_TARGET est défini dans
// le .env, on redirige les appels /api/* vers ce domaine. Permet d'appeler
// l'API de prod depuis localhost sans souci CORS (le navigateur voit du
// same-origin). Si non défini, pas de proxy — les appels passent par
// l'URL absolue indiquée dans VITE_API_BASE_URL.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_API_PROXY_TARGET;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      ...(proxyTarget
        ? {
            proxy: {
              '/api': {
                target: proxyTarget,
                changeOrigin: true,
                secure: true,
              },
            },
          }
        : {}),
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
