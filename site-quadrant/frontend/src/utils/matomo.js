// Tracker Matomo (instance MESRE).
//
// Mode RGPD safe :
//   - `disableCookies` : aucun cookie posé côté navigateur (cf.
//     spec MESRE — instance configurée pour ne pas en exiger).
//   - `setExcludedQueryParams` : liste des paramètres sensibles
//     stripped des URL trackées (tokens, identifiants personnels,
//     champs de paiement…) pour ne pas leaker via le referer ou
//     une éventuelle inspection des logs Matomo.
//   - IP anonymisée côté serveur Matomo (réglage instance).
//
// Robustesse : tous les helpers exposés sont sans-op si window._paq
// n'existe pas (réseau coupé, blocage adblocker, CSP). L'app
// continue de fonctionner sans tracking — ne rien faire échouer.

const MATOMO_URL = 'https://piwik.enseignementsup-recherche.pro/';
const MATOMO_SITE_ID = '53';

// Liste officielle MESRE — paramètres sensibles à exclure des URL
// trackées (FR / EN / DE / ES / autres langues recensées par le
// service Matomo). Tableau gelé pour éviter une mutation accidentelle.
const EXCLUDED_QUERY_PARAMS = Object.freeze([
  'account', 'accountnum', 'address', 'address1', 'address2', 'address3',
  'addressline1', 'addressline2', 'adres', 'adresse', 'adresse1', 'adresse2',
  'adresse3', 'adresse_email', 'adresseemail', 'adressepostale',
  'age', 'alter', 'auth', 'authpw', 'bic', 'billingaddress',
  'billingaddress1', 'billingaddress2',
  'calle', 'cardnumber', 'carte', 'cartebancaire', 'carteidentite', 'cb', 'cc',
  'ccc', 'cccsc', 'cccvc', 'cccvv', 'ccexpiry', 'ccexpmonth', 'ccexpyear',
  'ccname', 'ccnumber', 'cctype', 'cell', 'cellphone',
  'city', 'civilite', 'civilité', 'cle', 'clientid', 'clientsecret', 'clé',
  'codepostal', 'company',
  'consumerkey', 'consumersecret', 'contrasenya', 'contraseña', 'courriel',
  'cp', 'creditcard',
  'creditcardnumber', 'cvc', 'cvv', 'datedenaissance', 'dateexpiration',
  'datenaissance', 'dateofbirth',
  'debitcard', 'departement', 'dirección', 'dob', 'domain', 'département',
  'ebost', 'email', 'emailaddress',
  'emailadresse', 'entreprise', 'epos', 'epost', 'eposta', 'exp',
  'expiration', 'familyname', 'firma',
  'firstname', 'formlogin', 'fullname', 'gender', 'genre', 'geschlecht',
  'gst', 'gstnumber', 'handynummer',
  'hasło', 'heslo', 'iban', 'ibanaccountnum', 'ibanaccountnumber', 'id',
  'identifiant', 'identifier',
  'identitenationale', 'indirizzo', 'kartakredytowa', 'kennwort',
  'keyconsumerkey', 'keyconsumersecret',
  'konto', 'kontonr', 'kontonummer', 'kredietkaart', 'kreditkarte',
  'kreditkort', 'lastname', 'login',
  'mail', 'mdp', 'mobiili', 'mobile', 'mobilne', 'mot_de_passe', 'motdepasse',
  'nachname', 'name',
  'nationalite', 'nickname', 'nom', 'nomcomplet', 'nomdefamille',
  'nomfamille', 'nss', 'numero_fiscal',
  'numerocarte', 'numerocarteidentite', 'numerocompte', 'numerodecarte',
  'numerofiscal',
  'numeroidentite', 'numeromobile', 'numeropasseport',
  'numerosecuritesociale', 'numerotelephone',
  'numerotva', 'numfiscal', 'numsecu', 'numtva', 'osoite', 'parole', 'pass',
  'passeport', 'passord',
  'password', 'passwort', 'pasword', 'paswort', 'paword', 'pays', 'phone',
  'pin', 'plz', 'portable',
  'postalcode', 'postcode', 'postleitzahl', 'prenom', 'privatekey', 'prénom',
  'publickey', 'pw', 'pwd',
  'pword', 'pwrd', 'questionsecrete', 'region', 'reponsesecrete', 'rib', 'rue',
  'secret', 'secretclé',
  'secretq', 'secretquestion', 'securitesociale', 'sexe', 'shippingaddress',
  'shippingaddress1',
  'shippingaddress2', 'signature', 'siren', 'siret', 'socialsec',
  'socialsecuritynumber', 'societe',
  'socsec', 'sokak', 'ssn', 'steuernummer', 'strasse', 'street', 'surname',
  'swift', 'tax', 'taxnumber',
  'tel', 'telefon', 'telefonnr', 'telefonnummer', 'telefono', 'telephone',
  'titre', 'token', 'token_auth',
  'tokenauth', 'tva', 'téléphone', 'ulica', 'user', 'username', 'utilisateur',
  'vat', 'vatnumber', 'via',
  'ville', 'voie', 'vorname', 'wachtwoord', 'wagwoord', 'webhooksecret',
  'website', 'zip', 'zipcode',
]);

let initialised = false;

/**
 * Initialise le tracker Matomo (mode sans cookie). Idempotent — un
 * second appel est ignoré silencieusement (cas double mount React
 * en mode strict, dev).
 *
 * À appeler une fois au démarrage (cf. main.jsx).
 */
export function initMatomo() {
  if (initialised || typeof window === 'undefined') return;
  initialised = true;

  window._paq = window._paq || [];

  // Configuration RGPD : pas de cookies, paramètres sensibles filtrés.
  window._paq.push(['setExcludedQueryParams', [...EXCLUDED_QUERY_PARAMS]]);
  window._paq.push(['disableCookies']);

  // Iframe cross-origin (hébergement quadsies.dgesip.fr embarqué
  // depuis dialogue.dgesip.fr). Matomo essaie par défaut d'auto-détecter
  // URL et referrer en lisant `window.top.location` / `window.parent` —
  // ce qui lève SecurityError en cross-origin et pollue la console.
  // On force des valeurs explicites :
  //   - setCustomUrl : URL de l'iframe (sans tokens, déjà absents du
  //     window.location.href côté API quadrant).
  //   - setReferrerUrl : chaîne vide, on n'expose pas le referrer
  //     (cohérent avec la posture RGPD globale).
  // À pousser AVANT setTrackerUrl/setSiteId pour que la 1ʳᵉ pageview
  // utilise déjà ces valeurs.
  try {
    window._paq.push(['setCustomUrl', window.location.href]);
  } catch (_) { /* défensif */ }
  window._paq.push(['setReferrerUrl', '']);

  // Endpoint et identifiant du site dans l'instance Matomo MESRE.
  window._paq.push(['setTrackerUrl', MATOMO_URL + 'matomo.php']);
  window._paq.push(['setSiteId', MATOMO_SITE_ID]);

  // Tracking de vue initial + tracking automatique des clics sur liens.
  window._paq.push(['trackPageView']);
  window._paq.push(['enableLinkTracking']);

  // Chargement async du script Matomo. On bascule sur appendChild dans
  // <head> si le DOM ne contient pas encore de <script> (cas d'un
  // module ES qui s'exécute avant tout autre script — rare mais
  // possible).
  const g = document.createElement('script');
  g.async = true;
  g.src = MATOMO_URL + 'matomo.js';
  const s = document.getElementsByTagName('script')[0];
  if (s && s.parentNode) {
    s.parentNode.insertBefore(g, s);
  } else {
    document.head.appendChild(g);
  }
}

/**
 * Track un événement Matomo avec contexte enrichi.
 * No-op silencieux si Matomo n'est pas chargé.
 *
 * @param {string} category - 'Navigation' | 'Détails' | 'Export' | 'Méthodologie'
 * @param {string} action   - identifiant court d'action ('change_vue', etc.)
 * @param {string|null} name      - libellé spécifique (libellé bulle, etc.)
 * @param {object}      contexte  - { etab, vue, cursus, millesime }
 *
 * Forme du name envoyé à Matomo :
 *   - si `name` fourni : `<name> (etab=...; vue=...; ...)`
 *   - sinon            : `etab=...; vue=...; ...`
 *
 * Convention « pas de PII » : ne JAMAIS passer ici un token, un id
 * utilisateur, une adresse ou tout autre champ personnel. Le contexte
 * accepté ci-dessus est explicitement borné (étab, vue, cursus,
 * millésime — tous des dimensions analytiques).
 */
export function trackEvent(category, action, name = null, contexte = {}) {
  if (typeof window === 'undefined' || !window._paq) return;

  const parts = [];
  if (contexte.etab)      parts.push(`etab=${contexte.etab}`);
  if (contexte.vue)       parts.push(`vue=${contexte.vue}`);
  if (contexte.cursus)    parts.push(`cursus=${contexte.cursus}`);
  if (contexte.millesime) parts.push(`millesime=${contexte.millesime}`);

  const suffixe = parts.length ? ` (${parts.join('; ')})` : '';
  const nameEnrichi = name ? `${name}${suffixe}` : (parts.join('; ') || null);

  if (nameEnrichi) {
    window._paq.push(['trackEvent', category, action, nameEnrichi]);
  } else {
    window._paq.push(['trackEvent', category, action]);
  }
}
