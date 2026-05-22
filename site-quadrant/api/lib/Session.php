<?php
/**
 * Gestion des sessions iframe.
 *
 * Cycle normal :
 *  1. Lit les 3 tokens dans les headers HTTP (tokenConnexion, token, token_campagne)
 *  2. Cherche dans le cache local app_session_cache
 *  3. Si pas trouvé ou cache trop ancien : appel à l'endpoint de vérification du site hôte
 *  4. Met à jour le cache avec le contexte_id reçu
 *  5. Renvoie le contexte_id (5 caractères) qui servira au filtrage des données
 *
 * MODE DEV : si config['mode_dev'] est true, on accepte un paramètre GET 'contexte_id'
 * qui court-circuite toute la chaîne d'authentification. À utiliser uniquement
 * en développement local. À mettre IMPÉRATIVEMENT à false en production.
 *
 * En cas d'échec : 401 et fin d'exécution.
 */

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Response.php';

class Session
{
    private string $tokenConnexion = '';
    private string $token = '';
    private string $tokenCampagne = '';
    private ?string $contexteId = null;
    private bool $modeDev = false;

    /**
     * Initialise la session.
     *
     * En mode normal : lit les 3 tokens dans les headers HTTP.
     * En mode dev : lit contexte_id dans la query string.
     */
    public function __construct()
    {
        $config = require __DIR__ . '/../config/config.php';
        $this->modeDev = !empty($config['mode_dev']);

        if ($this->modeDev) {
            // Mode test : on accepte contexte_id directement en query string
            $ctx = $_GET['contexte_id'] ?? '';
            if ($ctx === '' || !preg_match('/^[a-zA-Z0-9]{5}$/', $ctx)) {
                Response::error(
                    'missing_contexte_id_in_dev_mode',
                    'En mode dev, le paramètre contexte_id (5 caractères alphanumériques) est requis dans la query string.',
                    400
                );
            }
            $this->contexteId = $ctx;
            return;
        }

        // Mode normal : lecture des 3 tokens dans les headers
        $headers = $this->readHeaders();

        $this->tokenConnexion = $headers['X-Connexion-Token'] ?? '';
        $this->token          = $headers['X-User-Token']     ?? '';
        $this->tokenCampagne  = $headers['X-Campagne-Token'] ?? '';

        if ($this->tokenConnexion === '' || $this->token === '' || $this->tokenCampagne === '') {
            Response::error('missing_tokens', 'Un ou plusieurs tokens d\'authentification sont manquants.', 401);
        }
    }

    /**
     * Récupère le contexte_id (5 car. alphanumériques) pour cette session.
     * En mode dev : retourne directement la valeur passée en query.
     * En mode normal : cache puis appel au site hôte si nécessaire.
     */
    public function getContexteId(): string
    {
        if ($this->contexteId !== null) {
            return $this->contexteId;
        }

        // 1. Tentative depuis le cache
        $cached = $this->lookupCache();
        if ($cached !== null) {
            $this->contexteId = $cached;
            return $cached;
        }

        // 2. Appel à l'endpoint de vérification du site hôte
        $verified = $this->verifyAtHost();
        if ($verified === null) {
            Response::error('session_invalid', 'Votre session a expiré. Veuillez vous reconnecter depuis le site hôte.', 401);
        }

        // 3. Mise en cache pour les prochains appels
        $this->writeCache($verified);
        $this->contexteId = $verified;

        return $verified;
    }

    /**
     * Cherche dans app_session_cache une entrée non expirée pour ces 3 tokens.
     */
    private function lookupCache(): ?string
    {
        $config = require __DIR__ . '/../config/config.php';
        $ttl = (int)$config['session']['cache_ttl_minutes'];

        $stmt = Database::get()->prepare("
            SELECT contexte_id
            FROM app_session_cache
            WHERE token_connexion = :tc
              AND token = :t
              AND token_campagne = :tcamp
              AND last_verified_at > (NOW() - INTERVAL :ttl MINUTE)
            LIMIT 1
        ");
        $stmt->execute([
            ':tc'    => $this->tokenConnexion,
            ':t'     => $this->token,
            ':tcamp' => $this->tokenCampagne,
            ':ttl'   => $ttl,
        ]);

        $row = $stmt->fetch();
        return $row ? $row['contexte_id'] : null;
    }

    /**
     * Écrit (insert ou update) une entrée dans le cache.
     */
    private function writeCache(string $contexteId): void
    {
        $stmt = Database::get()->prepare("
            INSERT INTO app_session_cache
                (token_connexion, token, token_campagne, contexte_id, last_verified_at)
            VALUES (:tc, :t, :tcamp, :ctx, NOW())
            ON DUPLICATE KEY UPDATE
                contexte_id = VALUES(contexte_id),
                last_verified_at = NOW()
        ");
        $stmt->execute([
            ':tc'    => $this->tokenConnexion,
            ':t'     => $this->token,
            ':tcamp' => $this->tokenCampagne,
            ':ctx'   => $contexteId,
        ]);
    }

    /**
     * Appelle l'endpoint de vérification du site hôte en cURL.
     */
    private function verifyAtHost(): ?string
    {
        $config = require __DIR__ . '/../config/config.php';
        $host = $config['host_verify'];

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $host['url']);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $host['timeout']);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'X-Api-Key: ' . $host['api_key'],
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
            'tokenConnexion'             => $this->tokenConnexion,
            'token'                      => $this->token,
            'token_campagne_utilisateurs'=> $this->tokenCampagne,
        ]));

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200 || $response === false) {
            return null;
        }

        $data = json_decode($response, true);
        if (!is_array($data) || empty($data['valid']) || empty($data['contexte_id'])) {
            return null;
        }

        if (!preg_match('/^[a-zA-Z0-9]{5}$/', $data['contexte_id'])) {
            return null;
        }

        return $data['contexte_id'];
    }

    /**
     * Lit les headers HTTP de la requête courante.
     */
    private function readHeaders(): array
    {
        if (function_exists('getallheaders')) {
            return getallheaders();
        }

        $headers = [];
        foreach ($_SERVER as $name => $value) {
            if (substr($name, 0, 5) === 'HTTP_') {
                $key = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))));
                $headers[$key] = $value;
            }
        }
        return $headers;
    }
}
