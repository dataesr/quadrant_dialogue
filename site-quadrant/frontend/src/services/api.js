// Client API du frontend Quadrant.
//
// Pas d'axios : fetch natif suffit largement et évite une dépendance.
// Toutes les fonctions retournent une Promise qui résout vers le JSON parsé,
// ou rejette avec une Error portant le détail (status HTTP, code d'erreur
// applicatif, message). Les composants n'ont donc qu'à try/catch.
//
// Mode dev : on injecte automatiquement `contexte_id` (lu dans
// VITE_CONTEXTE_ID_DEV) à chaque appel — cela court-circuite la validation
// session côté API quand `mode_dev=true` en config serveur.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const CONTEXTE_ID_DEV = import.meta.env.VITE_CONTEXTE_ID_DEV || '';

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
 * Construit une URL absolue (API_BASE_URL + path + query string), en injectant
 * automatiquement le contexte_id de dev si configuré.
 */
function buildUrl(path, params = {}) {
  const finalParams = { ...params };
  if (CONTEXTE_ID_DEV && !('contexte_id' in finalParams)) {
    finalParams.contexte_id = CONTEXTE_ID_DEV;
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
      headers: { Accept: 'application/json' },
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

export function getReferentielDisciplinaire(params) {
  return request('/referentiel/disciplinaire', params);
}

export function getEtablissementsVisibles(params) {
  return request('/etablissements-visibles', params);
}
