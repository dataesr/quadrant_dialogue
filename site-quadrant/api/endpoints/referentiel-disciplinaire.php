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
 *    "disciplines": [{"code": "01",  "libelle": "Droit", "dom_code": "DEG"}, ...],
 *    "secteurs":    [{"code": "Droit", "libelle": "Droit",
 *                     "discipli_code": "01", "dom_code": "DEG"}, ...],
 *    "mentions":    [{"code": "<diplom>", "libelle": "<intitulé>", "secteur": "<secteur>"}, ...]
 *  }
 *
 * Les domaines portent juste {code, libelle}. Les disciplines portent
 * en plus `dom_code` (domaine parent) et les secteurs portent
 * `discipli_code` + `dom_code` — utilisés côté frontend pour griser
 * les options incompatibles dans les sélecteurs en cascade
 * (Domaine → Discipline → Secteur). Les mentions portent le secteur
 * quadrant rattaché, utile au filtre mention sur la vue Établissements.
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
// Optionnel (Phase 14.9) : établissement de référence (sélecteur global).
// Quand fourni, on renvoie en plus `disponibles` = modalités effectivement
// présentes dans CET établissement, pour griser côté frontend (vue
// Positionnement) les filtres absents de l'établissement de référence.
$idPaysage = $_GET['id_paysage'] ?? '';

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
if ($idPaysage !== '' && !preg_match('/^[A-Za-z0-9]{5}$/', $idPaysage)) {
    Response::error('invalid_id_paysage', 'Paramètre id_paysage invalide (5 caractères alphanumériques attendus).');
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
$disciplines = chargerDisciplinesAvecDomaine($pdo, $whereClause, $params);
$secteurs    = chargerSecteursAvecParents($pdo, $whereClause, $params);
$mentions    = chargerMentions($pdo, $whereClause, $params);

// =============================================================================
// 4 bis. Modalités présentes dans l'établissement de référence (Phase 14.9)
// =============================================================================
//
// Les listes ci-dessus restent à l'échelle du PÉRIMÈTRE (options affichées).
// `disponibles` ajoute les codes effectivement présents dans l'établissement
// de référence (sélecteur global) — une seule requête plate DISTINCT, le
// frontend grise les options absentes. null si aucun établissement fourni.
$disponibles = null;
if ($idPaysage !== '') {
    $stmtDisp = $pdo->prepare("
        SELECT DISTINCT dom, discipli,
               secteur_disciplinaire_quadrant AS secteur, master
        FROM stats_quadrant
        WHERE formation = :formation
          AND millesime = :millesime
          AND id_paysage = :id_paysage
          AND filtre_perimetre LIKE :motif
    ");
    $stmtDisp->execute([
        ':formation'  => $formation,
        ':millesime'  => $millesime,
        ':id_paysage' => $idPaysage,
        ':motif'      => $params[':motif'],
    ]);
    // NB : on accumule des VALEURS (pas des clés) puis array_unique, pour
    // éviter la coercition PHP des clés de tableau numériques (« 15 » →
    // int 15) qui casserait la comparaison de chaînes côté frontend.
    $sets = ['dom' => [], 'discipli' => [], 'secteur' => [], 'master' => []];
    foreach ($stmtDisp->fetchAll() as $r) {
        foreach ($sets as $cle => $_) {
            $v = $r[$cle] ?? null;
            if ($v !== null && $v !== '') {
                $sets[$cle][] = (string)$v;
            }
        }
    }
    $disponibles = [
        'dom'      => array_values(array_unique($sets['dom'])),
        'discipli' => array_values(array_unique($sets['discipli'])),
        'secteur'  => array_values(array_unique($sets['secteur'])),
        'master'   => array_values(array_unique($sets['master'])),
    ];
}

// =============================================================================
// 5. Réponse JSON
// =============================================================================

Response::json([
    'domaines'    => $domaines,
    'disciplines' => $disciplines,
    'secteurs'    => $secteurs,
    'mentions'    => $mentions,
    'disponibles' => $disponibles,
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
/**
 * Charge les disciplines présentes dans le périmètre AVEC leur domaine
 * parent. Sert au filtrage en cascade côté frontend : sélectionner un
 * domaine grise les disciplines incompatibles.
 *
 * Structure : [{"code": "01", "libelle": "Droit", "dom_code": "DEG"}, ...]
 *
 * GROUP BY discipli garantit l'unicité même si plusieurs rows portent
 * le même (discipli, dom) — ce qui devrait être le cas standard, une
 * discipline étant rattachée à un seul domaine. MAX(dom) absorbe une
 * éventuelle incohérence source en choisissant arbitrairement (les
 * doublons par discipline sont des cas de données aberrantes, on évite
 * juste de planter dessus).
 */
function chargerDisciplinesAvecDomaine(PDO $pdo, string $whereClause, array $params): array
{
    $sql = "
        SELECT
            discipli              AS code,
            MAX(discipli_lib)     AS libelle,
            MAX(dom)              AS dom_code
        FROM stats_quadrant
        WHERE $whereClause
          AND discipli IS NOT NULL AND discipli <> ''
        GROUP BY discipli
        ORDER BY COALESCE(NULLIF(MAX(discipli_lib), ''), discipli)
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $resultats = [];
    foreach ($rows as $r) {
        $code = (string)$r['code'];
        $lib  = $r['libelle'] !== null && $r['libelle'] !== '' ? (string)$r['libelle'] : $code;
        $resultats[] = [
            'code'     => $code,
            'libelle'  => $lib,
            'dom_code' => $r['dom_code'] !== null ? (string)$r['dom_code'] : '',
        ];
    }
    return $resultats;
}

/**
 * Charge les secteurs présents dans le périmètre AVEC leur discipline
 * et domaine parents. Sert au filtrage en cascade côté frontend.
 *
 * Structure : [{"code": "Droit", "libelle": "Droit",
 *               "discipli_code": "01", "dom_code": "DEG"}, ...]
 *
 * Le secteur n'a pas de colonne libellé séparée — le code EST le
 * libellé (varchar long). On garde le pattern {code, libelle} pour
 * que le frontend traite uniformément les trois nomenclatures.
 */
function chargerSecteursAvecParents(PDO $pdo, string $whereClause, array $params): array
{
    $sql = "
        SELECT
            secteur_disciplinaire_quadrant AS code,
            MAX(discipli)                  AS discipli_code,
            MAX(dom)                       AS dom_code
        FROM stats_quadrant
        WHERE $whereClause
          AND secteur_disciplinaire_quadrant IS NOT NULL
          AND secteur_disciplinaire_quadrant <> ''
        GROUP BY secteur_disciplinaire_quadrant
        ORDER BY secteur_disciplinaire_quadrant
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $resultats = [];
    foreach ($rows as $r) {
        $code = (string)$r['code'];
        $resultats[] = [
            'code'          => $code,
            'libelle'       => $code,
            'discipli_code' => $r['discipli_code'] !== null ? (string)$r['discipli_code'] : '',
            'dom_code'      => $r['dom_code']      !== null ? (string)$r['dom_code']      : '',
        ];
    }
    return $resultats;
}

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
