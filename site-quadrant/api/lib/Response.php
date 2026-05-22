<?php
/**
 * Helpers pour les réponses HTTP/JSON uniformes.
 *
 * Tous les endpoints renvoient du JSON via ces fonctions.
 * Format d'erreur uniforme : {"error": "code_court", "message": "explication"}.
 */

class Response
{
    /**
     * Envoie une réponse JSON et termine l'exécution.
     */
    public static function json(array $data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /**
     * Envoie une réponse d'erreur et termine l'exécution.
     */
    public static function error(string $code, string $message, int $status = 400): void
    {
        self::json([
            'error'   => $code,
            'message' => $message,
        ], $status);
    }

    /**
     * Configure les headers CORS pour les requêtes cross-origin (iframe sur autre sous-domaine).
     */
    public static function cors(): void
    {
        $config = require __DIR__ . '/../config/config.php';
        header('Access-Control-Allow-Origin: ' . $config['cors_origin']);
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, X-Connexion-Token, X-User-Token, X-Campagne-Token');
        header('Access-Control-Max-Age: 3600');

        // Préflight OPTIONS : on répond immédiatement sans logique métier
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }
}
