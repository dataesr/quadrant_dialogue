<?php
/**
 * Configuration de l'API Quadrant.
 *
 * En production : remplacer ces valeurs par celles du serveur,
 * ou mieux les charger depuis des variables d'environnement OVH.
 * Ce fichier ne doit JAMAIS être versionné avec de vraies valeurs.
 */

return [

    // Base de données MySQL OVH
    'db' => [
        'host'     => 'mysql-quadrant.exemple.fr',
        'name'     => 'quadrant',
        'user'     => 'quadrant_app',
        'password' => 'CHANGE_ME_IN_PRODUCTION',
        'charset'  => 'utf8mb4',
    ],

    // Endpoint de vérification côté site hôte (PHP 5.6)
    'host_verify' => [
        'url'       => 'https://etablissement.exemple.fr/api/internal/verify-session.php',
        'api_key'   => 'CHANGE_ME_SHARED_SECRET_WITH_HOST',
        'timeout'   => 5, // secondes
    ],

    // Cache de validation des sessions iframe
    'session' => [
        'cache_ttl_minutes' => 5, // durée de validité du cache local avant ré-appel hôte
    ],

    // Origine autorisée pour CORS (le site hôte qui embarque l'iframe)
    'cors_origin' => 'https://etablissement.exemple.fr',

    // Audit
    'audit' => [
        'log_path' => '/var/log/quadrant/audit.jsonl',
    ],

    // Mode debug (à false en production)
    'debug' => false,

    // Mode dev : si true, l'API accepte un paramètre `contexte_id` directement
    // dans la query string et bypasse l'authentification par tokens.
    // À utiliser UNIQUEMENT en développement.
    // À METTRE IMPÉRATIVEMENT À FALSE EN PRODUCTION.
    'mode_dev' => false,
];
