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
        'enabled'   => true,
        'url'       => 'https://dialogue.dgesip.fr/Dial/verify-session.php',
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

    // Endpoint de diagnostic infra (/api/diagnostic). Protégé par une
    // clé secrète passée en query string `?key=...`. Permet de
    // vérifier sans SSH : IP sortante OVH, joignabilité
    // verify-session.php, BDD, fichiers frontend.
    //
    // - `enabled` à false → l'endpoint renvoie 404 (rien ne fuite).
    // - `key` à 'CHANGE_ME_BEFORE_DEPLOY' (valeur d'exemple) →
    //   l'endpoint renvoie 403 même si la query string matche, pour
    //   éviter qu'un déploiement avec config par défaut soit ouvert.
    //
    // Génération de la clé : `openssl rand -hex 32`.
    'diagnostic' => [
        'enabled' => true,
        'key'     => 'CHANGE_ME_BEFORE_DEPLOY',
    ],

    // Activation des boutons d'export côté frontend. Permet de
    // (dés)activer un type d'export par configuration sans déployer
    // de nouveau bundle JS — utile pour désactiver temporairement
    // un export en cas de bug bloquant en prod.
    //
    // - `png_enabled`        : bouton PNG (mode Graphique)
    // - `xlsx_enabled`       : bouton XLSX (mode Tableau)
    // - `docx_fiche_enabled` : bouton fiche Word dans le panneau de
    //                          détails
    // - `seuil_diffusable`   : effectif minimum pour qu'une valeur
    //                          soit incluse dans un export. À 20 par
    //                          défaut, plus strict que le seuil
    //                          d'affichage écran (5). Appliqué par
    //                          l'API quand le paramètre query
    //                          `?for_export=1` est présent sur les
    //                          endpoints /quadrant, /quadrant/details
    //                          et /quadrant/mentions-non-representees.
    //                          NON exposé au frontend via
    //                          /api/frontend-config (sécurité : on
    //                          ne révèle pas le seuil exact).
    'exports' => [
        'png_enabled'        => true,
        'xlsx_enabled'       => true,
        'docx_fiche_enabled' => true,
        'seuil_diffusable'   => 20,
    ],
];
