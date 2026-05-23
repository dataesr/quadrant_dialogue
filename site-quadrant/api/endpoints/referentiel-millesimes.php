<?php
/**
 * GET /referentiel/millesimes
 *
 * Alimente le sélecteur de millésime côté React. Renvoie pour le cursus
 * demandé la liste des millésimes effectivement présents dans
 * stats_quadrant, triés du plus récent au plus ancien.
 *
 * Paramètres (query string) :
 *  - formation : 'Licence générale' | 'Licence professionnelle' | 'Bachelor universitaire de technologie' | 'Master'
 *
 * Headers requis : X-Connexion-Token, X-User-Token, X-Campagne-Token
 *
 * Note : la liste de millésimes est une information structurelle (quelles
 * années ont été chargées par l'ETL). Elle est donc indépendante du
 * contexte de l'utilisateur — on valide la session mais on n'applique
 * pas de filtre `filtre_perimetre`.
 *
 * Réponse :
 *  {
 *    "formation":  "Master",
 *    "millesimes": ["2023", "2022", "2021", "2020"]
 *  }
 */

require_once __DIR__ . '/../lib/Database.php';
require_once __DIR__ . '/../lib/Response.php';
require_once __DIR__ . '/../lib/Session.php';

Response::cors();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('method_not_allowed', 'Seul GET est autorisé sur cet endpoint.', 405);
}

// Validation de session — on n'utilise pas le contexte_id pour filtrer
// (les millésimes sont structurels), mais l'auth reste requise.
$session = new Session();
$session->getContexteId();

$formation = $_GET['formation'] ?? '';

$formationsAutorisees = [
    'Licence générale',
    'Licence professionnelle',
    'Bachelor universitaire de technologie',
    'Master',
];
if (!in_array($formation, $formationsAutorisees, true)) {
    Response::error('invalid_formation', 'Paramètre formation invalide.');
}

$stmt = Database::get()->prepare("
    SELECT DISTINCT millesime
    FROM stats_quadrant
    WHERE formation = :formation
      AND millesime IS NOT NULL
      AND millesime <> ''
    ORDER BY millesime DESC
");
$stmt->execute([':formation' => $formation]);

$millesimes = [];
foreach ($stmt->fetchAll() as $r) {
    $millesimes[] = (string)$r['millesime'];
}

Response::json([
    'formation'  => $formation,
    'millesimes' => $millesimes,
]);
