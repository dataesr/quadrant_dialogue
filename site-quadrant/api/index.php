<?php
/**
 * Point d'entrée unique de l'API.
 *
 * Lit le chemin demandé et route vers le fichier endpoint correspondant.
 * Tous les endpoints sont dans /endpoints/ sous forme de fichiers PHP autonomes.
 *
 * Routes :
 *   GET  /quadrant                          → endpoints/quadrant.php
 *   GET  /quadrant/details                  → endpoints/quadrant-details.php
 *   GET  /quadrant/mentions-non-representees → endpoints/quadrant-mentions-non-representees.php
 *   GET  /etablissements-visibles           → endpoints/etablissements-visibles.php
 *   GET  /referentiel/disciplinaire         → endpoints/referentiel-disciplinaire.php
 *   GET  /referentiel/millesimes            → endpoints/referentiel-millesimes.php
 *   GET  /referentiel/variables             → endpoints/referentiel-variables.php
 *   GET  /export/csv                        → endpoints/export-csv.php
 *   GET  /health                            → endpoints/health.php
 *   GET  /diagnostic                        → endpoints/diagnostic.php
 *   POST /auth/init                         → endpoints/auth-init.php
 */

require_once __DIR__ . '/lib/Response.php';

// Affichage des erreurs PHP : activé uniquement en mode_dev.
// En prod, les erreurs vont dans les logs serveur — pas de stack
// trace fuitée dans la réponse HTTP. error_reporting reste sur
// E_ALL pour que les logs serveur restent informatifs.
//
// Fail-safe : si config.php n'est pas lisible (typo, perms), on
// FORCE display_errors=0 pour ne pas devenir le mode dev par
// défaut. Un 500 minimal est servi via Response::error pour
// signaler le problème sans cracher de stack trace.
error_reporting(E_ALL);
$configPath = __DIR__ . '/config/config.php';
if (is_readable($configPath)) {
    $bootConfig = require $configPath;
    if (!empty($bootConfig['mode_dev'])) {
        ini_set('display_errors', '1');
        ini_set('display_startup_errors', '1');
    } else {
        ini_set('display_errors', '0');
    }
} else {
    ini_set('display_errors', '0');
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'config_unreadable', 'message' => 'Configuration serveur indisponible.']);
    exit;
}

// Le chemin demandé, normalisé (sans query string, sans slash final)
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = rtrim($path, '/');

// Préfixe à retirer si l'API est dans un sous-dossier (ajustable selon le déploiement)
$prefix = '/api';
if (strpos($path, $prefix) === 0) {
    $path = substr($path, strlen($prefix));
}

// Routage
$routes = [
    '/quadrant'                            => 'quadrant.php',
    '/quadrant/details'                    => 'quadrant-details.php',
    '/quadrant/mentions-non-representees'  => 'quadrant-mentions-non-representees.php',
    '/etablissements-visibles'             => 'etablissements-visibles.php',
    '/referentiel/disciplinaire'           => 'referentiel-disciplinaire.php',
    '/referentiel/millesimes'              => 'referentiel-millesimes.php',
    '/referentiel/variables'               => 'referentiel-variables.php',
    '/export/csv'                          => 'export-csv.php',
    '/health'                              => 'health.php',
    '/diagnostic'                          => 'diagnostic.php',
    '/auth/init'                           => 'auth-init.php',
];

if (!isset($routes[$path])) {
    Response::cors();
    Response::error('not_found', 'Endpoint inexistant.', 404);
}

// Exécution de l'endpoint
require __DIR__ . '/endpoints/' . $routes[$path];
