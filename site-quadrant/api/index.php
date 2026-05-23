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
 */

require_once __DIR__ . '/lib/Response.php';

// Désactivation des erreurs PHP affichées (sécurité). Les erreurs vont dans les logs serveur.
ini_set('display_errors', '0');
error_reporting(E_ALL);

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
];

if (!isset($routes[$path])) {
    Response::cors();
    Response::error('not_found', 'Endpoint inexistant.', 404);
}

// Exécution de l'endpoint
require __DIR__ . '/endpoints/' . $routes[$path];
