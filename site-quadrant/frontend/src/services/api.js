// Client API du frontend Quadrant.
//
// Pas d'axios : fetch natif suffit largement et évite une dépendance.
// Toutes les fonctions retournent une Promise qui résout vers le JSON parsé,
// ou rejette avec une Error portant le détail (status HTTP, code d'erreur
// applicatif, message). Les composants n'ont donc qu'à try/catch.
//
// Mode dev : on injecte automatiquement `contexte_id` à chaque appel
// pour court-circuiter la validation session côté API quand
// `mode_dev=true` en config serveur. La source du contexte_id suit
// un ordre de priorité (cf. getContexteIdDev) :
//   1. query string de la page hôte (`?contexte_id=...`) — utile
//      pour tester l'app déployée en standalone (par ex.
//      https://quadsies.dgesip.fr/?contexte_id=xxxxx) sans rebuilder.
//   2. variable d'env Vite `VITE_CONTEXTE_ID_DEV` — utilisée par
//      `npm run dev` local avec un `.env.development.local`.
//   3. rien : en prod réelle, les tokens passeront par POST iframe.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const CONTEXTE_ID_DEV = import.meta.env.VITE_CONTEXTE_ID_DEV || '';

// Forme attendue d'un contexte_id : 5 caractères alphanumériques
// (alphabet a-z + A-Z + 0-9). Conforme à la spec API (cf. CLAUDE.md
// §10 : « identifiant 5 caractères alphanumériques »). Une valeur
// non conforme est ignorée — pas la peine de fuiter un input
// utilisateur arbitraire dans les query strings et les chunks
// Matomo / PNG / exports.
const CONTEXTE_ID_REGEX = /^[a-zA-Z0-9]{5}$/;

/**
 * Récupère le contexte_id à injecter en mode dev.
 *
 * Ordre de priorité :
 *   1. window.location.search → ?contexte_id=...
 *   2. variable d'env Vite VITE_CONTEXTE_ID_DEV
 *   3. null
 *
 * Valide la forme (5 alphanum) à chaque source. Une valeur mal formée
 * est ignorée silencieusement (pas d'exception, pas de log : on ne
 * sait pas si l'utilisateur a juste tapé l'URL au hasard).
 *
 * Exporté pour pouvoir être réutilisé côté composants (traçabilité
 * d'exports, etc.) avec la même règle de fallback.
 */
export function getContexteIdDev() {
  if (typeof window !== 'undefined' && window.location) {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('contexte_id');
      if (fromUrl && CONTEXTE_ID_REGEX.test(fromUrl)) return fromUrl;
    } catch {
      // ignore : URLSearchParams sur un search malformé peut throw
    }
  }
  if (CONTEXTE_ID_DEV && CONTEXTE_ID_REGEX.test(CONTEXTE_ID_DEV)) {
    return CONTEXTE_ID_DEV;
  }
  return null;
}

/**
 * Erreur API personnalisée : porte le code applicatif et le status HTTP en
 * plus du message lisible. Permet aux composants de discriminer
 * (`error.code === 'forbidden'` etc.) sans parser le message.
 */
export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Lit la valeur d'un <meta name="..." content="..."> dans le document
 * courant. Retourne null si le tag n'existe pas (cas dev local hors
 * iframe : l'app est servie par Vite, pas par /auth/init).
 */
function readMeta(name) {
  if (typeof document === 'undefined') return null;
  const meta = document.querySelector(`meta[name="${name}"]`);
  return meta ? meta.getAttribute('content') : null;
}

/**
 * Construit les headers d'authentification iframe (3 tokens) à partir
 * des <meta> injectés par /auth/init côté API. Cohabite avec les
 * autres modes :
 *   - Iframe prod (servi par /auth/init) : meta tags présents →
 *     headers transmis → Session.php valide la session via cache.
 *   - Dev local (npm run dev) : pas de meta tag → pas de header →
 *     mode_dev=true côté API accepte le `contexte_id` en query
 *     string (cf. getContexteIdDev).
 *   - URL directe prod (https://quadsies.dgesip.fr/?contexte_id=…
 *     sans iframe) : pas de meta tag → pas de header →
 *     mode_dev=false → 401, comportement attendu (sécurité OK).
 *
 * Les noms de headers sont alignés sur lib/Session.php :
 *   X-Connexion-Token, X-User-Token, X-Campagne-Token.
 */
function getAuthHeaders() {
  const headers = {};
  const tc    = readMeta('token-connexion');
  const tu    = readMeta('token-utilisateur');
  const tcamp = readMeta('token-campagne');
  if (tc)    headers['X-Connexion-Token'] = tc;
  if (tu)    headers['X-User-Token']      = tu;
  if (tcamp) headers['X-Campagne-Token']  = tcamp;
  return headers;
}

/**
 * Construit une URL absolue (API_BASE_URL + path + query string), en injectant
 * automatiquement le contexte_id de dev si configuré.
 */
function buildUrl(path, params = {}) {
  const finalParams = { ...params };
  if (!('contexte_id' in finalParams)) {
    const contexteId = getContexteIdDev();
    if (contexteId) finalParams.contexte_id = contexteId;
  }

  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(finalParams)) {
    if (value === undefined || value === null || value === '') continue;
    usp.append(key, String(value));
  }

  const qs = usp.toString();
  const sep = qs ? '?' : '';
  return `${API_BASE_URL}${path}${sep}${qs}`;
}

/**
 * Wrapper fetch unifié : parse le JSON, lève ApiError sur non-2xx.
 */
async function request(path, params = {}) {
  const url = buildUrl(path, params);

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        // Headers d'auth iframe — silencieux si pas de meta tag
        // injecté (dev local, URL directe).
        ...getAuthHeaders(),
      },
    });
  } catch (err) {
    // Erreur réseau / DNS / mixed content — pas de status HTTP.
    throw new ApiError(`Erreur réseau : ${err.message}`, { status: 0 });
  }

  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const code = body?.error || 'http_error';
    const message = body?.message || `Erreur HTTP ${response.status}`;
    throw new ApiError(message, { status: response.status, code });
  }

  return body;
}

// =============================================================================
// Endpoints
// =============================================================================

export function getHealth() {
  return request('/health');
}

export function getHealthFull() {
  return request('/health', { check: 'full' });
}

export function getQuadrant(params) {
  return request('/quadrant', params);
}

export function getQuadrantDetails(params) {
  return request('/quadrant/details', params);
}

export function getQuadrantSerieTemporelle(params) {
  return request('/quadrant/serie-temporelle', params);
}

export function getReferentielDisciplinaire(params) {
  return request('/referentiel/disciplinaire', params);
}

export function getReferentielMillesimes(params) {
  return request('/referentiel/millesimes', params);
}

export function getReferentielVariables(params) {
  return request('/referentiel/variables', params);
}

export function getEtablissementsVisibles(params) {
  return request('/etablissements-visibles', params);
}

export function getFrontendConfig() {
  return request('/frontend-config');
}
