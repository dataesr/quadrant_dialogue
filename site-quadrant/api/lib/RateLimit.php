<?php
/**
 * Rate limiting glissant à la minute, partagé entre endpoints.
 *
 * Stockage : table app_rate_limit (cf. docs/migrations/002_rate_limit.sql).
 * Une ligne par couple (clé, minute) avec un compteur incrémenté de façon
 * atomique côté MySQL (INSERT ... ON DUPLICATE KEY UPDATE).
 *
 * Usage typique côté endpoint :
 *
 *   $status = RateLimit::check('quadrant_details:' . $contexteId, 30);
 *   if (!$status['allowed']) {
 *       header('Retry-After: ' . $status['retry_after_seconds']);
 *       Response::json([
 *           'error'               => 'rate_limited',
 *           'message'             => "Trop de requêtes…",
 *           'retry_after_seconds' => $status['retry_after_seconds'],
 *       ], 429);
 *   }
 *
 * La librairie ne termine pas l'exécution elle-même : elle renvoie un statut
 * et laisse l'endpoint décider du format de réponse (un endpoint peut vouloir
 * logger, headers spécifiques, etc.).
 */

require_once __DIR__ . '/Database.php';

class RateLimit
{
    /**
     * Incrémente le compteur (clé, minute courante) et indique si l'appel
     * est sous la limite.
     *
     * - $cle            : identifiant arbitraire (ex: "<endpoint>:<contexte_id>")
     * - $limitePerMinute: seuil au-delà duquel allowed = false
     *
     * Retour : ['allowed' => bool, 'compteur' => int, 'limite' => int,
     *          'retry_after_seconds' => int].
     *
     * allowed devient false dès que compteur > limite (donc le N+1 ième
     * appel dans la minute déclenche le refus). retry_after_seconds est le
     * temps restant jusqu'à la prochaine minute pleine.
     */
    public static function check(string $cle, int $limitePerMinute): array
    {
        $pdo     = Database::get();
        $now     = time();
        $fenetre = intdiv($now, 60);

        // Purge en ligne des fenêtres anciennes (5 minutes de marge).
        // Petit coût, indexé sur fenetre_minute — pas de cron nécessaire.
        $pdo->prepare("DELETE FROM app_rate_limit WHERE fenetre_minute < :seuil")
            ->execute([':seuil' => $fenetre - 5]);

        // Incrément atomique du compteur de la fenêtre courante.
        $pdo->prepare("
            INSERT INTO app_rate_limit (cle, fenetre_minute, compteur)
            VALUES (:cle, :fenetre, 1)
            ON DUPLICATE KEY UPDATE compteur = compteur + 1
        ")->execute([':cle' => $cle, ':fenetre' => $fenetre]);

        // Relecture du compteur courant (utilisé pour décider et exposer).
        $stmt = $pdo->prepare("
            SELECT compteur FROM app_rate_limit
            WHERE cle = :cle AND fenetre_minute = :fenetre
        ");
        $stmt->execute([':cle' => $cle, ':fenetre' => $fenetre]);
        $compteur = (int)$stmt->fetchColumn();

        $allowed = $compteur <= $limitePerMinute;

        return [
            'allowed'             => $allowed,
            'compteur'            => $compteur,
            'limite'              => $limitePerMinute,
            'retry_after_seconds' => $allowed ? 0 : (60 - ($now % 60)),
        ];
    }

    /**
     * Applique le rate limit et, en cas de dépassement, répond 429 et TERMINE
     * l'exécution (header Retry-After + JSON). Sucre « une ligne par endpoint »
     * pour les endpoints sensibles (Phase 14.11) :
     *
     *   RateLimit::enforce('analyse_sous_populations:' . $contexteId);
     *
     * - $cle    : clé de comptage, convention "<endpoint>:<contexte_id>"
     *             → compteur PAR endpoint et PAR contexte (clés distinctes,
     *             pas de quota partagé entre endpoints).
     * - $limite : seuil/min ; si null, lu dans config.rate_limit.seuil_sensible
     *             (défaut 15) → modifiable par config.php sans redéploiement.
     */
    public static function enforce(string $cle, ?int $limite = null): void
    {
        if ($limite === null) {
            $limite = self::seuilSensibleConfig();
        }
        $status = self::check($cle, $limite);
        if (!$status['allowed']) {
            require_once __DIR__ . '/Response.php';
            header('Retry-After: ' . $status['retry_after_seconds']);
            Response::json([
                'error'               => 'rate_limited',
                'message'             => 'Trop de requêtes en peu de temps. Réessayez plus tard.',
                'retry_after_seconds' => $status['retry_after_seconds'],
            ], 429); // Response::json() appelle exit.
        }
    }

    /** Seuil des endpoints sensibles (config.rate_limit.seuil_sensible, défaut 15). */
    private static function seuilSensibleConfig(): int
    {
        $cfg = require __DIR__ . '/../config/config.php';
        return (int)($cfg['rate_limit']['seuil_sensible'] ?? 15);
    }
}
