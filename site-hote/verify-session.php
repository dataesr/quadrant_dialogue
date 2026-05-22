<?php
/**
 * Endpoint de vérification de session côté site hôte.
 *
 * Appelé en server-to-server par l'API quadrant pour valider une session
 * et récupérer le contexte_id associé.
 *
 * CONTRAT D'INTERFACE (voir CONTRATS.md)
 *
 * Requête entrante :
 *   POST /api/internal/verify-session.php
 *   Header X-Api-Key: <secret partagé>
 *   Body JSON : {"tokenConnexion": "...", "token": "...", "token_campagne_utilisateurs": "..."}
 *
 * Réponse :
 *   200 OK avec {"valid": true, "contexte_id": "xxxxx"} ou {"valid": false}
 *   401 si X-Api-Key manquant ou incorrect
 *   403 si IP d'origine non autorisée
 *   500 si erreur BDD
 *
 * COMPATIBILITÉ : PHP 5.6 strict — pas de syntaxes modernes (typages stricts,
 * arrow functions, null coalescing, etc.).
 */

// =============================================================================
// Configuration — à externaliser dans un fichier hors versionnement
// =============================================================================

// IPs sortantes du serveur OVH de l'API quadrant (à récupérer auprès d'OVH)
$ALLOWED_IPS = array(
    '203.0.113.42',  // remplacer par l'IP réelle de prod
    '203.0.113.43',  // IP secondaire si IP flottante
);

// Clé d'API partagée avec l'API quadrant
// IMPORTANT : doit être identique à $config['host_verify']['api_key'] côté API quadrant
$API_KEY = 'CHANGE_ME_SHARED_SECRET_BETWEEN_HOST_AND_QUADRANT';

// Configuration BDD (en production : utiliser les credentials existants du site hôte)
$DB_HOST = 'localhost';
$DB_NAME = 'sitehote';
$DB_USER = 'sitehote_app';
$DB_PASS = 'CHANGE_ME';

// =============================================================================
// Désactiver l'affichage d'erreurs (sécurité)
// =============================================================================

ini_set('display_errors', '0');
error_reporting(E_ALL);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// =============================================================================
// 1. Vérification IP
// =============================================================================

$clientIp = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
if (!in_array($clientIp, $ALLOWED_IPS, true)) {
    http_response_code(403);
    echo json_encode(array('error' => 'ip_not_allowed'));
    exit;
}

// =============================================================================
// 2. Vérification de la clé d'API
// =============================================================================

$receivedKey = '';
if (isset($_SERVER['HTTP_X_API_KEY'])) {
    $receivedKey = $_SERVER['HTTP_X_API_KEY'];
}

if (!hash_equals($API_KEY, $receivedKey)) {
    http_response_code(401);
    echo json_encode(array('error' => 'invalid_api_key'));
    exit;
}

// =============================================================================
// 3. Lecture et validation du payload JSON
// =============================================================================

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(array('error' => 'method_not_allowed'));
    exit;
}

$rawBody = file_get_contents('php://input');
$payload = json_decode($rawBody, true);

if (!is_array($payload)
    || !isset($payload['tokenConnexion'])
    || !isset($payload['token'])
    || !isset($payload['token_campagne_utilisateurs']))
{
    http_response_code(400);
    echo json_encode(array('error' => 'invalid_payload'));
    exit;
}

$tokenConnexion = $payload['tokenConnexion'];
$token          = $payload['token'];
$tokenCampagne  = $payload['token_campagne_utilisateurs'];

// Validation basique des formats
if (!preg_match('/^[a-f0-9\-]{36}$/i', $tokenConnexion)) {
    echo json_encode(array('valid' => false));
    exit;
}

// =============================================================================
// 4. Connexion à la BDD
// =============================================================================

try {
    $pdo = new PDO(
        'mysql:host=' . $DB_HOST . ';dbname=' . $DB_NAME . ';charset=utf8mb4',
        $DB_USER,
        $DB_PASS,
        array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        )
    );
} catch (PDOException $e) {
    http_response_code(500);
    error_log('verify-session DB error: ' . $e->getMessage());
    echo json_encode(array('error' => 'db_unavailable'));
    exit;
}

// =============================================================================
// 5. Vérification de la session (table connexions)
// =============================================================================

$stmt = $pdo->prepare("
    SELECT tokenConnexion, token, expirationForm
    FROM connexions
    WHERE tokenConnexion = :tc
      AND token = :t
      AND Etat = 'I'
      AND expirationForm > NOW()
    LIMIT 1
");
$stmt->execute(array(
    ':tc' => $tokenConnexion,
    ':t'  => $token,
));
$row = $stmt->fetch();

if (!$row) {
    echo json_encode(array('valid' => false));
    exit;
}

// =============================================================================
// 6. Vérification du token_campagne_utilisateurs
// =============================================================================

$stmt = $pdo->prepare("
    SELECT token_campagne_utilisateurs
    FROM dial_campagne_utilisateurs_connexions
    WHERE tokenConnexion = :tc
      AND token_campagne_utilisateurs = :tcamp
      AND (fin IS NULL OR fin > NOW())
    LIMIT 1
");
$stmt->execute(array(
    ':tc'    => $tokenConnexion,
    ':tcamp' => $tokenCampagne,
));
$campagneRow = $stmt->fetch();

if (!$campagneRow) {
    echo json_encode(array('valid' => false));
    exit;
}

// =============================================================================
// 7. Récupération du contexte_id via jointure
// =============================================================================
//
// EMPLACEMENT À COMPLÉTER : la requête ci-dessous est un EXEMPLE. Vous devez
// l'adapter à votre modèle interne. La jointure doit relier le
// token_campagne_utilisateurs au contexte_id (5 caractères alphanumériques)
// qui sera utilisé par l'API quadrant pour filtrer les données.
//
// EXEMPLE supposant une table parent `dial_campagne_utilisateurs` avec une
// colonne `contexte_id`. À REMPLACER par vos vrais noms de tables/colonnes.

$stmt = $pdo->prepare("
    SELECT
        -- adapter selon votre modèle :
        dcu.contexte_id
    FROM dial_campagne_utilisateurs_connexions AS dcuc
    -- adapter les jointures suivantes selon votre modèle :
    INNER JOIN dial_campagne_utilisateurs AS dcu
        ON dcu.token_campagne_utilisateurs = dcuc.token_campagne_utilisateurs
    WHERE dcuc.token_campagne_utilisateurs = :tcamp
    LIMIT 1
");
$stmt->execute(array(
    ':tcamp' => $tokenCampagne,
));
$ctxRow = $stmt->fetch();

if (!$ctxRow || empty($ctxRow['contexte_id'])) {
    // Pas de contexte_id récupérable → session invalide pour le quadrant
    echo json_encode(array('valid' => false));
    exit;
}

$contexteId = $ctxRow['contexte_id'];

// Validation format (5 caractères alphanumériques casse mixte)
if (!preg_match('/^[a-zA-Z0-9]{5}$/', $contexteId)) {
    error_log('verify-session: contexte_id invalide pour token_campagne=' . $tokenCampagne);
    echo json_encode(array('valid' => false));
    exit;
}

// =============================================================================
// 8. Prolongation de expirationForm (chaque appel quadrant = action utilisateur)
// =============================================================================
//
// Adapter la durée de prolongation à la politique du site hôte.
// EXEMPLE : 30 minutes glissantes.

$stmt = $pdo->prepare("
    UPDATE connexions
    SET expirationForm = DATE_ADD(NOW(), INTERVAL 30 MINUTE)
    WHERE tokenConnexion = :tc
");
$stmt->execute(array(':tc' => $tokenConnexion));

// =============================================================================
// 9. Réponse positive
// =============================================================================

echo json_encode(array(
    'valid'       => true,
    'contexte_id' => $contexteId,
));
exit;
