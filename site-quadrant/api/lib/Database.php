<?php
/**
 * Couche d'accès à la base de données.
 *
 * Singleton PDO : une seule connexion partagée pour toute la durée de la requête.
 * Mode exception activé pour ne pas avaler les erreurs silencieusement.
 */

class Database
{
    private static ?PDO $pdo = null;

    /**
     * Retourne l'instance PDO, en l'initialisant si nécessaire.
     */
    public static function get(): PDO
    {
        if (self::$pdo === null) {
            $config = require __DIR__ . '/../config/config.php';
            $db = $config['db'];

            $dsn = sprintf(
                'mysql:host=%s;dbname=%s;charset=%s',
                $db['host'],
                $db['name'],
                $db['charset']
            );

            self::$pdo = new PDO($dsn, $db['user'], $db['password'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
            ]);
        }

        return self::$pdo;
    }
}
