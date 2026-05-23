<?php
/**
 * GET /referentiel/disciplinaire
 *
 * Alimente les sélecteurs disciplinaires côté React. Renvoie les quatre
 * listes (domaines, disciplines, secteurs quadrant, mentions) filtrées
 * pour ne contenir que les valeurs effectivement présentes en données
 * dans le périmètre du contexte utilisateur.
 *
 * Paramètres (query string) :
 *  - formation : 'Licence générale' | 'Licence professionnelle' | 'Bachelor universitaire de technologie' | 'Master'
 *  - millesime : ex '2023'
 *
 * Headers requis : X-Connexion-Token, X-User-Token, X-Campagne-Token
 *
 * Filtrage : uniforme via filtre_perimetre LIKE %;<contexte_id>;%.
 * Cette logique fonctionne pour tous les rôles (établissement, rectorat,
 * national) car filtre_perimetre contient l'id du contexte dans tous
 * les cas. Aucun paramètre vue ni etab_contexte n'est nécessaire.
 *
 * Structure de la réponse :
 *  {
 *    "domaines":    [{"code": "DEG", "libelle": "Droit, économie, gestion"}, ...],
 *    "disciplines": [{"code": "01",  "libelle": "Droit"}, ...],
 *    "secteurs":    [{"code": "Droit", "libelle": "Droit"}, ...],
 *    "mentions":    [{"code": "<diplom>", "libelle": "<intitulé>", "secteur": "<secteur>"}, ...]
 *  }
 *
 * Les domaines / disciplines / secteurs ont la même forme {code, libelle}.
 * Les mentions portent en plus le secteur quadrant rattaché, utile au
 * filtre mention sur la vue Établissements.
 *
 * Tri alphabétique par libellé pour stabilité de l'affichage côté React.
 * Les valeurs nulles ou vides sont ignorées.
 */

require_once __DIR__ . '/../lib/Database.php';
require_once __DIR__ . '/../lib/Response.php';
require_once __DIR__ . '/../lib/Session.php';

Response::cors();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('method_not_allowed', 'Seul GET est autorisé sur cet endpoint.', 405);
}

// =============================================================================
// 1. Validation de la session et récupération du contexte_id
// =============================================================================

$session = new Session();
$contexteId = $session->getContexteId();

// =============================================================================
// 2. Lecture et validation des paramètres
// =============================================================================

$formation = $_GET['formation'] ?? '';
$millesime = $_GET['millesime'] ?? '';

$formationsAutorisees = [
    'Licence générale',
    'Licence professionnelle',
    'Bachelor universitaire de technologie',
    'Master',
];
if (!in_array($formation, $formationsAutorisees, true)) {
    Response::error('invalid_formation', 'Paramètre formation invalide.');
}
if (!preg_match('/^\d{4}$/', $millesime)) {
    Response::error('invalid_millesime', 'Paramètre millesime invalide.');
}

// =============================================================================
// 3. Construction du filtre WHERE commun aux quatre requêtes
// =============================================================================

// Filtrage uniforme par périmètre : couvre les trois rôles (établissement,
// rectorat, national) car filtre_perimetre encode `;id_nat;id_reg;id_paysage;`
// et le contexte_id est forcément l'un de ces trois identifiants.
$conditions = [
    'formation = :formation',
    'millesime = :millesime',
    'filtre_perimetre LIKE :motif',
];
$params = [
    ':formation' => $formation,
    ':millesime' => $millesime,
    ':motif'     => '%;' . $contexteId . ';%',
];

$whereClause = implode(' AND ', $conditions);

// =============================================================================
// 4. Quatre requêtes DISTINCT
// =============================================================================

$pdo = Database::get();

$domaines    = chargerNomenclature($pdo, 'dom',      'dom_lib',      $whereClause, $params);
$disciplines = chargerNomenclature($pdo, 'discipli', 'discipli_lib', $whereClause, $params);
$secteurs    = chargerNomenclature($pdo, 'secteur_disciplinaire_quadrant', null, $whereClause, $params);
$mentions    = chargerMentions($pdo, $whereClause, $params);

// =============================================================================
// 5. Réponse JSON
// =============================================================================

Response::json([
    'domaines'    => $domaines,
    'disciplines' => $disciplines,
    'secteurs'    => $secteurs,
    'mentions'    => $mentions,
]);


// =============================================================================
// Fonctions auxiliaires
// =============================================================================

/**
 * Charge une nomenclature (code + libellé) en DISTINCT, filtrée et triée.
 *
 * - $colonneCode    : nom de la colonne code (dom, discipli, secteur_…)
 * - $colonneLibelle : nom de la colonne libellé, ou null si le code est aussi le libellé
 * - $whereClause    : clause WHERE déjà construite (sans le mot-clé WHERE)
 * - $params         : tableau de paramètres préparés
 *
 * Les noms de colonnes ne viennent JAMAIS de l'extérieur — ils sont écrits
 * en dur dans le code appelant, donc l'interpolation directe dans le SQL
 * est sûre. Seules les valeurs des filtres passent par paramètres préparés.
 *
 * Ignore les valeurs vides ('') et NULL. Tri alphabétique par libellé.
 */
function chargerNomenclature(PDO $pdo, string $colonneCode, ?string $colonneLibelle, string $whereClause, array $params): array
{
    if ($colonneLibelle !== null) {
        $sql = "
            SELECT DISTINCT
                $colonneCode    AS code,
                $colonneLibelle AS libelle
            FROM stats_quadrant
            WHERE $whereClause
              AND $colonneCode IS NOT NULL
              AND $colonneCode <> ''
            ORDER BY COALESCE(NULLIF($colonneLibelle, ''), $colonneCode)
        ";
    } else {
        // Pas de colonne libellé séparée : le code sert aussi de libellé.
        $sql = "
            SELECT DISTINCT
                $colonneCode AS code
            FROM stats_quadrant
            WHERE $whereClause
              AND $colonneCode IS NOT NULL
              AND $colonneCode <> ''
            ORDER BY $colonneCode
        ";
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $resultats = [];
    foreach ($rows as $r) {
        $code    = (string)$r['code'];
        $libelle = isset($r['libelle']) && $r['libelle'] !== null && $r['libelle'] !== ''
            ? (string)$r['libelle']
            : $code;
        $resultats[] = [
            'code'    => $code,
            'libelle' => $libelle,
        ];
    }

    return $resultats;
}

/**
 * Charge la liste des mentions présentes dans le périmètre, avec le
 * secteur quadrant rattaché. Utilisée notamment par le filtre mention
 * de la vue Établissements.
 *
 * Structure renvoyée : [{"code": "<diplom>", "libelle": "<intitulé>", "secteur": "<secteur>"}, ...]
 *
 * Tri alphabétique par libellé. Une même diplom peut apparaître sur plusieurs
 * lignes (plusieurs étabs, plusieurs indicateurs) mais on consolide via
 * GROUP BY diplom pour garantir l'unicité. MAX() est neutre puisque libellé
 * et secteur ne varient pas à diplom donné.
 *
 * Ignore les lignes sans diplom.
 */
function chargerMentions(PDO $pdo, string $whereClause, array $params): array
{
    $sql = "
        SELECT
            diplom                                AS code,
            MAX(libelle_intitule)                 AS libelle,
            MAX(secteur_disciplinaire_quadrant)   AS secteur
        FROM stats_quadrant
        WHERE $whereClause
          AND diplom IS NOT NULL
          AND diplom <> ''
        GROUP BY diplom
        ORDER BY COALESCE(NULLIF(MAX(libelle_intitule), ''), diplom)
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $resultats = [];
    foreach ($rows as $r) {
        $code    = (string)$r['code'];
        $libelle = $r['libelle'] !== null && $r['libelle'] !== '' ? (string)$r['libelle'] : $code;
        $secteur = $r['secteur'] !== null ? (string)$r['secteur'] : '';
        $resultats[] = [
            'code'    => $code,
            'libelle' => $libelle,
            'secteur' => $secteur,
        ];
    }

    return $resultats;
}
