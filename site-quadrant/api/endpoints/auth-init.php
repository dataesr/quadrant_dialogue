<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/Database.php';
require_once __DIR__ . '/../lib/Response.php';

header('Content-Type: text/html; charset=utf-8');

// 1. Méthode POST uniquement
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    serveErrorPage('Méthode non autorisée');
    exit;
}

// 2. Récupération des champs
$tokenConnexion = isset($_POST['tokenConnexion']) ? trim($_POST['tokenConnexion']) : '';
$token          = isset($_POST['token']) ? trim($_POST['token']) : '';
$tokenCampagne  = isset($_POST['token_campagne_utilisateurs']) ? trim($_POST['token_campagne_utilisateurs']) : '';

// 3. Validation formats
if (!preg_match('/^[a-zA-Z0-9]{20,64}$/', $tokenConnexion)
    || !preg_match('/^[a-zA-Z0-9]{20,64}$/', $token)
    || !preg_match('/^[a-zA-Z0-9]{20,64}$/', $tokenCampagne))
{
    error_log('auth-init: validation format échouée. Longueurs reçues: tc=' . strlen($tokenConnexion) 
        . ' tk=' . strlen($token) . ' tcamp=' . strlen($tokenCampagne));
    http_response_code(400);
    serveErrorPage('Paramètres de session invalides.');
    exit;
}

// 4. Appel verify-session.php côté site hôte
$config = require __DIR__ . '/../config/config.php';
$verifyConfig = $config['host_verify'];

$payload = json_encode([
    'tokenConnexion' => $tokenConnexion,
    'token' => $token,
    'token_campagne_utilisateurs' => $tokenCampagne,
]);

$ch = curl_init($verifyConfig['url']);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => $verifyConfig['timeout'],
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'X-Api-Key: ' . $verifyConfig['api_key'],
    ],
    CURLOPT_SSL_VERIFYPEER => true,
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($response === false || $httpCode !== 200) {
    error_log("auth/init: verify-session HTTP $httpCode err=$curlErr");
    http_response_code(503);
    serveErrorPage('Vérification de session indisponible.');
    exit;
}

$data = json_decode($response, true);
if (!is_array($data) || empty($data['valid']) || empty($data['contexte_id'])) {
    http_response_code(403);
    serveErrorPage('Session non autorisée.');
    exit;
}

$contexteId = $data['contexte_id'];

// 5. Validation format contexte_id
if (!preg_match('/^[a-zA-Z0-9]{5}$/', $contexteId)) {
    error_log("auth/init: contexte_id format invalide reçu : $contexteId");
    http_response_code(502);
    serveErrorPage('Réponse de session inattendue.');
    exit;
}

try {
    $pdo = Database::get();
    $stmt = $pdo->prepare("
        INSERT INTO app_session_cache 
            (token_connexion, token, token_campagne, contexte_id, last_verified_at)
        VALUES 
            (:tc, :tk, :tcamp, :cid, NOW())
        ON DUPLICATE KEY UPDATE
            contexte_id = VALUES(contexte_id),
            last_verified_at = NOW()
    ");
    $stmt->execute([
        ':tc'    => $tokenConnexion,
        ':tk'    => $token,
        ':tcamp' => $tokenCampagne,
        ':cid'   => $contexteId,
    ]);
} catch (Throwable $e) {
    error_log('auth/init: app_session_cache update failed: ' . $e->getMessage());
    // On ne bloque pas — la session reste valide même si le cache n'est pas mis à jour
}

// 7. Servir dist/index.html avec injection des métadonnées
serveFrontendWithContext($contexteId, $tokenConnexion, $token, $tokenCampagne);

// =====================================================================

function serveFrontendWithContext(
    string $contexteId, 
    string $tokenConnexion, 
    string $token, 
    string $tokenCampagne
): void
{
    $indexPath = __DIR__ . '/../../dist/index.html';
    
    if (!is_readable($indexPath)) {
        http_response_code(500);
        serveErrorPage('Frontend indisponible.');
        exit;
    }
    
    $html = file_get_contents($indexPath);
    
    // Injection des balises <meta> juste après <head>
    $cidEsc   = htmlspecialchars($contexteId,    ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $tcEsc    = htmlspecialchars($tokenConnexion, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $tkEsc    = htmlspecialchars($token,          ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $tcampEsc = htmlspecialchars($tokenCampagne,  ENT_QUOTES | ENT_HTML5, 'UTF-8');

    $metaTags = "\n"
    . "<meta name=\"contexte-id\" content=\"$cidEsc\">\n"
    . "<meta name=\"token-connexion\" content=\"$tcEsc\">\n"
    . "<meta name=\"token-utilisateur\" content=\"$tkEsc\">\n"
    . "<meta name=\"token-campagne\" content=\"$tcampEsc\">\n";
    
    $html = preg_replace('/(<head[^>]*>)/i', '$1' . $metaTags, $html, 1);
    
    // CSP iframe — autoriser uniquement le site hôte à embarquer
    header('Content-Security-Policy: frame-ancestors https://dialogue.dgesip.fr');
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    
    echo $html;
}

function serveErrorPage(string $message): void
{
    $msgEsc = htmlspecialchars($message, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    echo <<<HTML
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Erreur - Quadrant</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 2rem; color: #333; }
        h1 { color: #c9191e; font-size: 1.25rem; }
        p { line-height: 1.5; }
    </style>
</head>
<body>
    <h1>Quadrant indisponible</h1>
    <p>{$msgEsc}</p>
    <p>Si le problème persiste, contactez l'administrateur.</p>
</body>
</html>
HTML;
}