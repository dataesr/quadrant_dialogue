<?php
/**
 * Anonymisation cryptographique d'identifiants publics.
 *
 * Contexte : `id_paysage` est un identifiant public stable (utilisé par
 * plusieurs applications du MESRE et présent dans des publications
 * ouvertes). Hasher l'id_paysage sans sel ne l'anonymise PAS — c'est
 * juste un encodage. Un attaquant peut pré-calculer la table de
 * correspondance complète (~700 établissements universitaires en
 * France, hashage instantané).
 *
 * On utilise donc un HMAC-SHA256 salé avec un secret cryptographique
 * stocké dans config.php (jamais versionné). Sans le secret, la
 * fonction de hachage n'est pas pré-calculable : l'anonymisation tient.
 *
 * Usage :
 *   Anonymizer::init($config['anonymization']['secret']);
 *   $id = Anonymizer::hash($idPaysage);  // 'anon_a1b2c3d4'
 *
 * Sortie : 'anon_' + 8 caractères hex = 4 milliards de combinaisons.
 * Probabilité de collision sur 700 établissements : ~6e-8, négligeable.
 *
 * Invalidation : changer le secret invalide rétroactivement tous les
 * IDs anonymes (même id_paysage → hash différent). Acceptable pour un
 * endpoint d'exploration sans stockage persistant des IDs.
 *
 * Sécurité opérationnelle :
 *   - Le secret est stocké uniquement dans config.php (gitignored).
 *   - Generation recommandée : `openssl rand -hex 32` (32 octets aléatoires).
 *   - Pas de log du secret (PHP::error_log ne montre que le name de la
 *     classe et les méthodes, pas les valeurs static private).
 *   - hash_hmac de PHP est implémenté en C, pas vulnérable au timing
 *     attack pour la fonction de hash elle-même.
 */
class Anonymizer
{
    private static ?string $secret = null;

    /**
     * Refus explicite des valeurs sentinelles (config par défaut non
     * remplacée). Lève une RuntimeException pour bloquer le démarrage
     * de l'endpoint plutôt que produire des IDs faussement anonymes.
     */
    private const SENTINELLES_INTERDITES = [
        '',
        'CHANGE_ME_BEFORE_DEPLOY',
        'À_GÉNÉRER',
    ];

    /**
     * Initialise le secret. Doit être appelé une fois au début de
     * l'endpoint, avant tout appel à hash(). Refuse les sentinelles
     * (config non remplacée par une vraie clé).
     */
    public static function init(string $secret): void
    {
        if (in_array($secret, self::SENTINELLES_INTERDITES, true)) {
            throw new RuntimeException(
                'Anonymizer::init — secret cryptographique non configuré. '
                . 'Générer une clé via `openssl rand -hex 32` et la poser '
                . 'dans config.php > anonymization.secret.'
            );
        }
        // Garde-fou supplémentaire : exiger au moins 32 caractères
        // (= 16 octets, niveau d'entropie minimal pour un HMAC). Le
        // standard openssl rand -hex 32 produit 64 caractères hex.
        if (strlen($secret) < 32) {
            throw new RuntimeException(
                'Anonymizer::init — secret trop court (< 32 caractères). '
                . 'Utiliser `openssl rand -hex 32` pour générer 64 caractères.'
            );
        }
        self::$secret = $secret;
    }

    /**
     * Retourne un identifiant anonyme stable pour un id_paysage donné.
     * Format : 'anon_' + 8 caractères hex (préfixe du HMAC-SHA256).
     *
     * Stabilité : pour un secret fixe, le même id_paysage produit
     * toujours le même hash. Permet de tracer une bulle anonyme entre
     * millésimes successifs côté frontend (Phase 11).
     *
     * @throws RuntimeException si init() n'a pas été appelé.
     */
    public static function hash(string|int $idPaysage): string
    {
        if (self::$secret === null) {
            throw new RuntimeException(
                'Anonymizer::hash — appel sans init() préalable. '
                . 'Appeler Anonymizer::init($config[\'anonymization\'][\'secret\']) '
                . 'au début de l\'endpoint.'
            );
        }
        $hmac = hash_hmac('sha256', (string)$idPaysage, self::$secret);
        return 'anon_' . substr($hmac, 0, 8);
    }
}
