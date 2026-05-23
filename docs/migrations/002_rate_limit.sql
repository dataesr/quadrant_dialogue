-- =============================================================================
-- Migration 002 : table app_rate_limit
-- =============================================================================
-- Compteurs glissants par fenêtre d'une minute, partagés par tous les endpoints
-- de l'API qui souhaitent appliquer un rate limit. Utilisé par lib/RateLimit.php.
--
-- Sémantique :
--   - cle             : identifiant arbitraire de l'usage à compter,
--                       typiquement "<nom_endpoint>:<contexte_id>".
--   - fenetre_minute  : timestamp UNIX divisé par 60 (numéro de minute UTC).
--   - compteur        : nombre d'appels comptabilisés dans cette fenêtre.
--
-- Chaque appel à RateLimit::check() :
--   - supprime les fenêtres anciennes (purge en ligne, fenetre_minute < now-5),
--   - INSERT ... ON DUPLICATE KEY UPDATE compteur = compteur + 1
--     dans la fenêtre courante,
--   - relit le compteur et indique si la limite est dépassée.
--
-- À jouer une fois, manuellement, sur la BDD OVH avant le déploiement
-- de /quadrant/details.
-- =============================================================================

DROP TABLE IF EXISTS app_rate_limit;

CREATE TABLE app_rate_limit (
  cle             VARCHAR(100) NOT NULL  COLLATE utf8mb4_bin  COMMENT 'Clé de rate limit (ex: <endpoint>:<contexte_id>)',
  fenetre_minute  INT          NOT NULL                       COMMENT 'Timestamp UNIX divisé par 60 (numéro de minute)',
  compteur        INT          NOT NULL  DEFAULT 0            COMMENT 'Nombre d''appels comptabilisés dans cette fenêtre',

  PRIMARY KEY (cle, fenetre_minute),
  INDEX idx_fenetre (fenetre_minute)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci
COMMENT='Compteurs de rate limit par fenêtre glissante d''une minute';
