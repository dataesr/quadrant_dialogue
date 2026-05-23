<?php
/**
 * GET /etablissements-visibles
 *
 * Alimente le sélecteur d'établissement de référence côté React (rôles
 * rectorat et national). Renvoie la liste des établissements présents dans
 * le périmètre du contexte utilisateur, pour un cursus et un millésime donnés.
 *
 * Paramètres (query string) :
 *  - formation : 'Licence générale' | 'Licence professionnelle' | 'Bachelor universitaire de technologie' | 'Master'
 *  - millesime : ex '2023'
 *
 * Headers requis : X-Connexion-Token, X-User-Token, X-Campagne-Token
 *
 * Filtrage : uniforme via filtre_perimetre LIKE %;<contexte_id>;%, comme pour
 * /referentiel/disciplinaire. Couvre les trois rôles sans branchement :
 *   - établissement : retourne sa propre fiche (1 ligne, l'endpoint n'a
 *     normalement pas vocation à être appelé dans ce cas) ;
 *   - rectorat     : tous les étabs de la région ;
 *   - national     : tous les étabs de France.
 *
 * Structure de la réponse :
 *  {
 *    "etablissements": [
 *      {
 *        "id":        "<id_paysage>",
 *        "libelle":   "<uo_lib>",
 *        "region":    {"code": "<reg_id>", "libelle": "<reg_nom>"},
 *        "typologie": "<typologie_d_universites_et_assimiles>"
 *      },
 *      ...
 *    ]
 *  }
 *
 * Notes sur la forme :
 *  - region : code + libellé séparés en BDD (reg_id / reg_nom) → structure
 *    {code, libelle}. Fallback sur le code si le libellé est vide.
 *  - typologie : la BDD ne porte qu'une seule colonne, déjà parlante. On la
 *    renvoie comme simple chaîne (pas de fausse symétrie avec region).
 *
 * Tri : ORDER BY uo_lib. La colonne hérite de la collation de table
 * utf8mb4_unicode_ci (accent-insensitive), ce qui produit un tri « humain » :
 * « École » se classe entre les « E… » et les « F… », pas après « Z ». Aucun
 * COLLATE override ni tri PHP via Collator n'est donc nécessaire.
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
// 3. Requête principale
// =============================================================================

// Motif LIKE calculé en PHP pour éviter toute injection via le contexte.
$motif = '%;' . $contexteId . ';%';

$sql = "
    SELECT DISTINCT
        id_paysage,
        uo_lib,
        reg_id,
        reg_nom,
        typologie_d_universites_et_assimiles AS typologie
    FROM stats_quadrant
    WHERE formation = :formation
      AND millesime = :millesime
      AND filtre_perimetre LIKE :motif
    ORDER BY uo_lib
";

$stmt = Database::get()->prepare($sql);
$stmt->execute([
    ':formation' => $formation,
    ':millesime' => $millesime,
    ':motif'     => $motif,
]);

// =============================================================================
// 4. Construction de la réponse
// =============================================================================

$etablissements = [];
foreach ($stmt->fetchAll() as $r) {
    $idPaysage = (string)$r['id_paysage'];
    $libelle   = $r['uo_lib'] !== null && $r['uo_lib'] !== '' ? (string)$r['uo_lib'] : $idPaysage;

    $regCode    = (string)($r['reg_id']  ?? '');
    $regLibelle = $r['reg_nom'] !== null && $r['reg_nom'] !== '' ? (string)$r['reg_nom'] : $regCode;

    $etablissements[] = [
        'id'        => $idPaysage,
        'libelle'   => $libelle,
        'region'    => [
            'code'    => $regCode,
            'libelle' => $regLibelle,
        ],
        'typologie' => (string)($r['typologie'] ?? ''),
    ];
}

Response::json([
    'etablissements' => $etablissements,
]);
