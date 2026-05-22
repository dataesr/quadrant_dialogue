<?php
/**
 * GET /health
 *
 * Health check : vérifie que l'API tourne et peut joindre la BDD.
 * Pas d'authentification requise. Utile pour monitoring et smoke tests post-déploiement.
 */

require_once __DIR__ . '/../lib/Database.php';
require_once __DIR__ . '/../lib/Response.php';

Response::cors();

$status = 'ok';
$dbStatus = 'unknown';

try {
    $stmt = Database::get()->query('SELECT 1');
    $stmt->fetch();
    $dbStatus = 'ok';
} catch (Throwable $e) {
    $status = 'degraded';
    $dbStatus = 'unreachable';
}

Response::json([
    'status'    => $status,
    'database'  => $dbStatus,
    'timestamp' => date('c'),
]);
