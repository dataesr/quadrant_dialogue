<?php
declare(strict_types=1);

/**
 * Endpoint de diagnostic infra (/api/diagnostic).
 *
 * Objectif : permettre à l'équipe de vérifier en un appel l'état de
 * la chaîne (IP sortante OVH, joignabilité verify-session.php côté
 * site hôte, BDD, fichiers frontend) sans avoir besoin d'un accès
 * SSH. Utile notamment quand l'IP sortante OVH change : on récupère
 * la nouvelle IP par cet endpoint et on la communique à l'équipe
 * site hôte pour mise à jour de la liste blanche.
 *
 * Sécurité :
 *  - Protégé par une clé partagée stockée dans config.php
 *    (`diagnostic.key`), comparée via hash_equals (anti-timing).
 *  - `diagnostic.enabled === false` → 404 (ne révèle même pas
 *    l'existence du endpoint).
 *  - Clé encore à la valeur d'exemple → 403 (anti-config-par-défaut).
 *  - La réponse n'expose AUCUNE donnée sensible : pas de credentials
 *    BDD, pas de vrais tokens, pas l'api_key partagée — uniquement
 *    un booléen `host_verify_api_key_set` pour confirmer la présence.
 */

require_once __DIR__ . '/../lib/Database.php';
require_once __DIR__ . '/../lib/Response.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$config = require __DIR__ . '/../config/config.php';

// 1. Endpoint désactivé → 404 sans indice.
if (empty($config['diagnostic']['enabled'])) {
    http_response_code(404);
    echo json_encode(['error' => 'not_found']);
    exit;
}

// 2. Vérification de la clé. Triple garde-fou :
//    - clé absente ou vide dans la config → 403
//    - clé encore à la valeur d'exemple → 403 (anti-config-par-défaut)
//    - hash_equals pour la comparaison (anti-timing-attack)
$expectedKey = $config['diagnostic']['key'] ?? '';
$providedKey = $_GET['key'] ?? '';

$valeursExemple = ['CHANGE_ME_BEFORE_DEPLOY', 'À_GÉNÉRER', ''];
if (in_array($expectedKey, $valeursExemple, true)
    || !is_string($providedKey)
    || !hash_equals($expectedKey, $providedKey)) {
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

// 3. Collecte des informations.
$result = [
    'timestamp' => date('c'),
    'php' => [
        'version' => PHP_VERSION,
        'sapi'    => PHP_SAPI,
    ],
    'config' => [
        'mode_dev'                => !empty($config['mode_dev']),
        'host_verify_url'         => $config['host_verify']['url'] ?? null,
        'host_verify_enabled'     => !empty($config['host_verify']['enabled']),
        // On expose UNIQUEMENT le booléen — jamais la clé elle-même.
        'host_verify_api_key_set' => !empty($config['host_verify']['api_key'])
                                     && $config['host_verify']['api_key'] !== 'CHANGE_ME_SHARED_SECRET_WITH_HOST',
    ],
    'outbound_ip' => [
        'v4' => fetchOutboundIp('https://ipv4.icanhazip.com/'),
        'v6' => fetchOutboundIp('https://ipv6.icanhazip.com/'),
    ],
    'reachability' => [
        'verify_session'    => null,
        'database'          => pingDatabase(),
        'dist_index_html'   => checkFile(__DIR__ . '/../../dist/index.html'),
        'methodologie_json' => checkFile(__DIR__ . '/../../dist/methodologie.json'),
    ],
];

// Ping verify-session.php uniquement si on a une URL + une clé. On
// envoie un payload volontairement invalide ('diagnostic_ping_invalid')
// — le site hôte doit nous répondre avec un code d'erreur qui nous
// indique néanmoins que l'IP est autorisée et que l'API key est OK.
if (!empty($config['host_verify']['url']) && !empty($config['host_verify']['api_key'])) {
    $result['reachability']['verify_session'] = pingVerifySession(
        $config['host_verify']['url'],
        $config['host_verify']['api_key'],
        (int)($config['host_verify']['timeout'] ?? 5)
    );
}

echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
exit;

// =====================================================================
// Helpers
// =====================================================================

/**
 * Interroge un service externe qui retourne l'IP sortante (icanhazip,
 * ifconfig.me équivalent). Retourne null si curl échoue (DNS bloqué,
 * timeout, IPv6 indisponible…) — pas d'exception.
 */
function fetchOutboundIp(string $url): ?string
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 3,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $body  = curl_exec($ch);
    $errno = curl_errno($ch);
    curl_close($ch);

    if ($errno !== 0 || $body === false) {
        return null;
    }
    $trimmed = trim((string)$body);
    return $trimmed !== '' ? $trimmed : null;
}

/**
 * Ping verify-session.php avec des tokens volontairement invalides.
 * L'objectif n'est pas d'obtenir un 200 mais de diagnostiquer la
 * couche réseau (IP autorisée ?) et l'authentification (api_key
 * valide ?) sans exposer de vrais tokens.
 *
 * Convention de réponse attendue côté site hôte :
 *   - 403 + { error: "ip_not_allowed" }   → IP OVH pas autorisée
 *   - 401 + { error: "invalid_api_key" }  → IP OK mais clé KO
 *   - 200 + { valid: false, ... }         → IP + clé OK (tokens KO,
 *                                            attendu : on a envoyé du
 *                                            faux exprès)
 */
function pingVerifySession(string $url, string $apiKey, int $timeout): array
{
    $payload = json_encode([
        'tokenConnexion'              => 'diagnostic_ping_invalid',
        'token'                       => 'diagnostic_ping_invalid',
        'token_campagne_utilisateurs' => 'diagnostic_ping_invalid',
    ]);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'X-Api-Key: ' . $apiKey,
        ],
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $body     = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $errno    = curl_errno($ch);
    $errStr   = curl_error($ch);
    curl_close($ch);

    $out = [
        'url'           => $url,
        'http_code'     => $httpCode,
        'curl_errno'    => $errno,
        'curl_error'    => $errStr,
        'reachable'     => $errno === 0 && $httpCode > 0,
        'ip_allowed'    => null,
        'api_key_valid' => null,
    ];

    if ($body !== false && $body !== null) {
        $data = json_decode((string)$body, true);
        if (is_array($data)) {
            if ($httpCode === 403 && ($data['error'] ?? '') === 'ip_not_allowed') {
                $out['ip_allowed'] = false;
            } elseif ($httpCode === 401 && ($data['error'] ?? '') === 'invalid_api_key') {
                $out['ip_allowed']    = true;
                $out['api_key_valid'] = false;
            } elseif ($httpCode === 200) {
                $out['ip_allowed']    = true;
                $out['api_key_valid'] = true;
            }
        }
    }

    return $out;
}

/**
 * Pinge la BDD via une requête simple et renvoie un état lisible.
 * `SELECT NOW(), VERSION()` confirme à la fois la connexion et la
 * version MySQL/MariaDB sans toucher aux tables applicatives.
 */
function pingDatabase(): array
{
    try {
        $pdo  = Database::get();
        $stmt = $pdo->query('SELECT NOW() AS now_db, VERSION() AS version');
        $row  = $stmt->fetch();
        return [
            'reachable' => true,
            'now_db'    => $row['now_db'] ?? null,
            'version'   => $row['version'] ?? null,
        ];
    } catch (Throwable $e) {
        return [
            'reachable' => false,
            'error'     => $e->getMessage(),
        ];
    }
}

/**
 * Présence et lisibilité d'un fichier du frontend (dist/index.html,
 * dist/methodologie.json). Permet de détecter rapidement un mauvais
 * déploiement ou un .htaccess qui bloque l'accès.
 */
function checkFile(string $path): array
{
    $exists   = file_exists($path);
    $readable = $exists && is_readable($path);
    return [
        'path'     => $path,
        'exists'   => $exists,
        'readable' => $readable,
        'size'     => $readable ? filesize($path) : null,
    ];
}
