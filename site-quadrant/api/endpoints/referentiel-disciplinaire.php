<?php
/**
 * GET /referentiel/disciplinaire
 *
 * Alimente les sélecteurs disciplinaires côté React. Renvoie les trois
 * nomenclatures (domaines, disciplines, secteurs quadrant) filtrées pour
 * ne contenir que les valeurs effectivement présentes en données dans
 * le périmètre demandé.
 *
 * Paramètres (query string) :
 *  - formation     : 'Licence générale' | 'Licence professionnelle' | 'Bachelor universitaire de technologie' | 'Master'
 *  - millesime     : ex '2023'
 *  - vue           : 'mentions' | 'etablissements'
 *  - etab_contexte : optionnel, id_paysage de l'établissement de référence
 *                    (utilisé uniquement en vue=mentions ; fallback sur contexte_id si absent)
 *
 * Headers requis : X-Connexion-Token, X-User-Token, X-Campagne-Token
 *
 * Filtrage selon la vue :
 *  - vue=mentions       : restreint aux mentions de l'établissement de contexte
 *                         (id_paysage = etab_contexte, ou contexte_id en fallback)
 *  - vue=etablissements : restreint au périmètre du contexte
 *                         (filtre_perimetre LIKE %;<contexte_id>;%)
 *
 * Structure de la réponse :
 *  {
 *    "domaines":    [{"code": "DEG", "libelle": "Droit, économie, gestion"}, ...],
 *    "disciplines": [{"code": "01",  "libelle": "Droit"}, ...],
 *    "secteurs":    [{"code": "Droit", "libelle": "Droit"}, ...]
 *  }
 *
 * Tri alphabétique par libellé pour stabilité de l'affichage côté React.
 * Les valeurs nulles ou vides sont ignorées. Sur la vue Établissements,
 * seuls les secteurs sont effectivement consommés côté React, mais les
 * trois listes sont renvoyées par cohérence et flexibilité.
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

$formation    = $_GET['formation']     ?? '';
$millesime    = $_GET['millesime']     ?? '';
$vue          = $_GET['vue']           ?? '';
$etabContexte = $_GET['etab_contexte'] ?? '';

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
if (!in_array($vue, ['mentions', 'etablissements'], true)) {
    Response::error('invalid_vue', 'Paramètre vue invalide.');
}
if ($etabContexte !== '' && !preg_match('/^[a-zA-Z0-9]{5}$/', $etabContexte)) {
    Response::error('invalid_etab_contexte', 'Paramètre etab_contexte invalide (5 caractères alphanumériques attendus).');
}

// =============================================================================
// 3. Construction du filtre WHERE commun aux trois requêtes
// =============================================================================

$conditions = [
    'formation = :formation',
    'millesime = :millesime',
];
$params = [
    ':formation' => $formation,
    ':millesime' => $millesime,
];

if ($vue === 'mentions') {
    // En vue=mentions, on cible un établissement précis. Fallback sur le
    // contexte_id si etab_contexte n'a pas été transmis (cas d'un rôle
    // "établissement" où contexte et établissement sont identiques).
    $etab = $etabContexte !== '' ? $etabContexte : $contexteId;
    $conditions[] = 'id_paysage = :etab';
    $params[':etab'] = $etab;
} else {
    // En vue=etablissements, on filtre sur le périmètre du contexte
    // via filtre_perimetre LIKE %;<contexte_id>;%
    $conditions[] = 'filtre_perimetre LIKE :motif';
    $params[':motif'] = '%;' . $contexteId . ';%';
}

$whereClause = implode(' AND ', $conditions);

// =============================================================================
// 4. Trois requêtes DISTINCT, une par nomenclature
// =============================================================================

$pdo = Database::get();

$domaines    = chargerNomenclature($pdo, 'dom',      'dom_lib',      $whereClause, $params);
$disciplines = chargerNomenclature($pdo, 'discipli', 'discipli_lib', $whereClause, $params);
$secteurs    = chargerNomenclature($pdo, 'secteur_disciplinaire_quadrant', null, $whereClause, $params);

// =============================================================================
// 5. Réponse JSON
// =============================================================================

Response::json([
    'domaines'    => $domaines,
    'disciplines' => $disciplines,
    'secteurs'    => $secteurs,
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
