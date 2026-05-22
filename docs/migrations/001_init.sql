-- =============================================================================
-- Script de création de la base de données pour l'application Quadrant
-- =============================================================================
-- Cible : MySQL 8.x ou MariaDB 10.x sur OVH mutualisé
-- Encodage : UTF-8 (utf8mb4)
-- 
-- Ce script crée 4 tables :
--   1. stats_quadrant         : table principale des statistiques (copie du JSON SIES)
--   2. app_session_cache      : cache de validation des sessions iframe
--   3. etl_import_batch       : traçabilité des imports
--   4. dim_indicateur_cursus  : matrice de disponibilité des indicateurs par cursus
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Table principale : stats_quadrant
-- -----------------------------------------------------------------------------
-- Copie dénormalisée des données source SIES, à la maille mention.
-- Une ligne par couple (mention, millésime, indicateur, délai).
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS stats_quadrant;

CREATE TABLE stats_quadrant (
  -- Identifiants de contexte (collation binaire pour casse mixte)
  id_paysage                            VARCHAR(5)   NOT NULL  COLLATE utf8mb4_bin  COMMENT 'Identifiant établissement (5 car. alphanumériques casse mixte)',
  id_reg                                VARCHAR(5)             COLLATE utf8mb4_bin  COMMENT 'Identifiant rectorat (vide pour données nationales)',
  id_nat                                VARCHAR(5)   NOT NULL  COLLATE utf8mb4_bin  COMMENT 'Identifiant national',
  filtre_perimetre                      VARCHAR(30)  NOT NULL  COLLATE utf8mb4_bin  COMMENT 'Format ;id_nat;id_reg;id_paysage; pour filtrage LIKE',
  
  -- Établissement
  uo_lib                                VARCHAR(255)                                COMMENT 'Libellé de l''établissement',
  typologie_d_universites_et_assimiles  VARCHAR(100)                                COMMENT 'Typologie : pluridisciplinaire avec santé, scientifique, etc.',
  reg_id                                VARCHAR(10)                                 COMMENT 'Code région (R84, R93, etc.)',
  reg_nom                               VARCHAR(100)                                COMMENT 'Nom région',
  
  -- Cursus et mention
  formation                             VARCHAR(50)  NOT NULL                       COMMENT 'Licence générale | Licence professionnelle | Bachelor universitaire de technologie | Master',
  type_diplome_sise                     VARCHAR(2)                                  COMMENT 'XA=LG, DP=LP, DR=BUT, XB=Master hors enseignement, XD=Master enseignement',
  diplom                                VARCHAR(20)  NOT NULL                       COMMENT 'Identifiant SIES de la mention',
  libelle_intitule                      VARCHAR(255)                                COMMENT 'Libellé de la mention',
  master                                VARCHAR(30)                                 COMMENT 'Master enseignement | Master hors enseignement | vide pour les non-Masters',
  
  -- Référentiel disciplinaire
  dom                                   VARCHAR(10)                                 COMMENT 'Code grand domaine : DEG, LLA, SHS, STS, INTERD',
  dom_lib                               VARCHAR(100)                                COMMENT 'Libellé grand domaine',
  discipli                              VARCHAR(2)                                  COMMENT 'Code discipline sur 2 caractères',
  discipli_lib                          VARCHAR(100)                                COMMENT 'Libellé discipline',
  secteur_disciplinaire_quadrant        VARCHAR(100)                                COMMENT 'Secteur quadrant (17 valeurs, sert à la coloration)',
  
  -- Indicateur
  type                                  VARCHAR(20)  NOT NULL                       COMMENT 'Réussite | Insertion',
  indicateur                            VARCHAR(100) NOT NULL                       COMMENT 'Libellé indicateur (Taux de réussite en 3 ans, etc.)',
  date_inser                            VARCHAR(10)                                 COMMENT '6, 12, 18, 24, 30 ou vide pour indicateur non déclinable',
  
  -- Millésime et population
  millesime                             VARCHAR(4)   NOT NULL                       COMMENT 'Année du millésime (2019, 2020, etc.)',
  promo                                 VARCHAR(10)                                 COMMENT 'Identifiant promo source (S2021, etc.)',
  population                            VARCHAR(50)                                 COMMENT 'Description de la population (sortants 2021, etc.)',
  
  -- Valeurs
  numerateur                            INT                                         COMMENT 'Numérateur du taux',
  denominateur                          INT                                         COMMENT 'Dénominateur du taux (effectif). Règles diffusion : <5 non diffusable, 5-19 fiabilité limitée, ≥20 normal',
  
  -- Métadonnées
  source                                VARCHAR(100)                                COMMENT 'Nom du fichier source d''origine',
  
  -- Index pour les performances
  INDEX idx_filtre              (filtre_perimetre),
  INDEX idx_formation_millesime (formation, millesime),
  INDEX idx_secteur             (secteur_disciplinaire_quadrant),
  INDEX idx_diplom              (diplom, millesime),
  INDEX idx_paysage             (id_paysage)
) 
ENGINE=InnoDB 
DEFAULT CHARSET=utf8mb4 
COLLATE=utf8mb4_unicode_ci
COMMENT='Statistiques de réussite et insertion à la maille mention - copie source SIES';


-- -----------------------------------------------------------------------------
-- 2. Cache de validation des sessions iframe : app_session_cache
-- -----------------------------------------------------------------------------
-- Évite d'appeler le site hôte à chaque requête API.
-- Renouvelé toutes les N minutes (à configurer, ordre 2-5 minutes).
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS app_session_cache;

CREATE TABLE app_session_cache (
  token_connexion       VARCHAR(36)  NOT NULL  COLLATE utf8mb4_bin  COMMENT 'tokenConnexion transmis par le site hôte (UUID)',
  token                 VARCHAR(35)  NOT NULL  COLLATE utf8mb4_bin  COMMENT 'Identifiant utilisateur de la session',
  token_campagne        VARCHAR(26)  NOT NULL  COLLATE utf8mb4_bin  COMMENT 'token_campagne_utilisateurs (contexte)',
  contexte_id           VARCHAR(5)             COLLATE utf8mb4_bin  COMMENT 'Identifiant de contexte renvoyé par site hôte',
  last_verified_at      DATETIME     NOT NULL                       COMMENT 'Dernière vérification réussie auprès du site hôte',
  
  PRIMARY KEY (token_connexion, token, token_campagne),
  INDEX idx_last_verified (last_verified_at)
) 
ENGINE=InnoDB 
DEFAULT CHARSET=utf8mb4 
COLLATE=utf8mb4_unicode_ci
COMMENT='Cache de validation des sessions iframe (purge périodique des entrées anciennes)';


-- -----------------------------------------------------------------------------
-- 3. Traçabilité des imports ETL : etl_import_batch
-- -----------------------------------------------------------------------------
-- Garde la trace de chaque exécution de l'ETL avec son résultat.
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS etl_import_batch;

CREATE TABLE etl_import_batch (
  batch_id              INT AUTO_INCREMENT PRIMARY KEY,
  source_filename       VARCHAR(255) NOT NULL                       COMMENT 'Nom du fichier source ingéré',
  started_at            DATETIME     NOT NULL                       COMMENT 'Début de l''ingestion',
  ended_at              DATETIME                                    COMMENT 'Fin de l''ingestion (NULL si en cours ou échec)',
  status                ENUM('en_cours', 'succes', 'echec')  NOT NULL DEFAULT 'en_cours',
  lignes_lues           INT          NOT NULL  DEFAULT 0             COMMENT 'Nombre total de lignes lues du fichier',
  lignes_inserees       INT          NOT NULL  DEFAULT 0             COMMENT 'Nombre de lignes effectivement insérées',
  lignes_rejetees       INT          NOT NULL  DEFAULT 0             COMMENT 'Nombre de lignes rejetées (incohérences)',
  message               TEXT                                        COMMENT 'Message de résultat ou détail d''erreur',
  
  INDEX idx_started (started_at),
  INDEX idx_status  (status)
) 
ENGINE=InnoDB 
DEFAULT CHARSET=utf8mb4 
COLLATE=utf8mb4_unicode_ci
COMMENT='Traçabilité des batchs d''ingestion ETL';


-- -----------------------------------------------------------------------------
-- 4. Matrice cursus × indicateur : dim_indicateur_cursus
-- -----------------------------------------------------------------------------
-- Définit quels indicateurs sont sélectionnables pour quel cursus.
-- Alimente les listes déroulantes Variable X et Variable Y dans l'iframe.
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS dim_indicateur_cursus;

CREATE TABLE dim_indicateur_cursus (
  formation             VARCHAR(50)  NOT NULL                       COMMENT 'Doit correspondre à stats_quadrant.formation',
  indicateur            VARCHAR(100) NOT NULL                       COMMENT 'Doit correspondre à stats_quadrant.indicateur',
  ordre                 SMALLINT     NOT NULL                       COMMENT 'Ordre canonique pour la contrainte var1 < var2',
  declinable_delai      TINYINT(1)   NOT NULL  DEFAULT 0            COMMENT '1 si déclinable par délai (indicateurs 9, 10, 11)',
  
  PRIMARY KEY (formation, indicateur),
  INDEX idx_ordre (formation, ordre)
) 
ENGINE=InnoDB 
DEFAULT CHARSET=utf8mb4 
COLLATE=utf8mb4_unicode_ci
COMMENT='Matrice de disponibilité des indicateurs par cursus, avec ordre canonique';


-- -----------------------------------------------------------------------------
-- Données initiales : matrice cursus × indicateur
-- -----------------------------------------------------------------------------
-- D'après l'observation des données réelles SIES.
-- L'ordre canonique commence par les indicateurs de réussite, puis poursuite,
-- puis insertion. Ajustable selon le besoin métier.
-- -----------------------------------------------------------------------------

INSERT INTO dim_indicateur_cursus (formation, indicateur, ordre, declinable_delai) VALUES
-- Licence générale
('Licence générale',                       'Taux de réussite en 3 ans',                  10, 0),
('Licence générale',                       'Taux de réussite en 4 ans',                  20, 0),
('Licence générale',                       'Taux de réussite en 3 ou 4 ans',             30, 0),
('Licence générale',                       'Taux de poursuite',                          40, 0),
('Licence générale',                       'Taux de poursuivants',                       50, 0),
('Licence générale',                       'Taux sortants en emploi salarié en France',  60, 1),
('Licence générale',                       'Taux sortants en emploi non salarié',        70, 1),
('Licence générale',                       'Taux sortants en emploi stable',             80, 1),

-- Licence professionnelle
('Licence professionnelle',                'Taux de réussite',                           10, 0),
('Licence professionnelle',                'Taux de poursuivants',                       50, 0),
('Licence professionnelle',                'Taux sortants en emploi salarié en France',  60, 1),
('Licence professionnelle',                'Taux sortants en emploi non salarié',        70, 1),
('Licence professionnelle',                'Taux sortants en emploi stable',             80, 1),

-- Bachelor universitaire de technologie
('Bachelor universitaire de technologie',  'Taux de réussite',                           10, 0),
('Bachelor universitaire de technologie',  'Taux de poursuite',                          40, 0),
('Bachelor universitaire de technologie',  'Taux de poursuivants',                       50, 0),
('Bachelor universitaire de technologie',  'Taux sortants en emploi salarié en France',  60, 1),
('Bachelor universitaire de technologie',  'Taux sortants en emploi non salarié',        70, 1),
('Bachelor universitaire de technologie',  'Taux sortants en emploi stable',             80, 1),

-- Master
('Master',                                 'Taux de réussite en 2 ans',                  10, 0),
('Master',                                 'Taux de réussite en 3 ans',                  20, 0),
('Master',                                 'Taux de réussite en 2 ou 3 ans',             30, 0),
('Master',                                 'Taux de poursuivants',                       50, 0),
('Master',                                 'Taux sortants en emploi salarié en France',  60, 1),
('Master',                                 'Taux sortants en emploi non salarié',        70, 1),
('Master',                                 'Taux sortants en emploi stable',             80, 1);


-- =============================================================================
-- Fin du script
-- =============================================================================
