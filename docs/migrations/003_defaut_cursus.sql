-- =============================================================================
-- Migration 003 : table dim_defaut_cursus
-- =============================================================================
-- Paramètres par défaut par cursus, lus par /referentiel/variables et renvoyés
-- au frontend dans la clé `defauts` de la réponse. Permet d'imposer un point
-- de départ métier pertinent (par exemple Master = réussite 2-ou-3 ans ×
-- insertion à 18 mois) plutôt que le premier couple alphabétique mécanique.
--
-- Une ligne par formation. Tous les champs sauf `formation` sont nullables :
-- un NULL signifie « le frontend applique sa logique de fallback » (premier
-- millésime disponible, premier couple autorisé, 12 mois pour les délais).
--
-- À jouer une fois sur OVH (SSH MySQL ou phpMyAdmin) après déploiement du
-- code. Les valeurs métier seront positionnées ultérieurement par UPDATE.
-- =============================================================================

CREATE TABLE IF NOT EXISTS dim_defaut_cursus (
  formation    VARCHAR(100) NOT NULL,
  millesime    VARCHAR(10)  NULL,
  indicateur_x VARCHAR(255) NULL,
  indicateur_y VARCHAR(255) NULL,
  date_inser_x VARCHAR(10)  NULL,
  date_inser_y VARCHAR(10)  NULL,
  PRIMARY KEY (formation),
  CONSTRAINT chk_formation_valide CHECK (
    formation IN (
      'Licence générale',
      'Licence professionnelle',
      'Bachelor universitaire de technologie',
      'Master'
    )
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO dim_defaut_cursus (formation) VALUES
  ('Licence générale'),
  ('Licence professionnelle'),
  ('Bachelor universitaire de technologie'),
  ('Master')
ON DUPLICATE KEY UPDATE formation = VALUES(formation);
