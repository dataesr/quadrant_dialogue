<?php
/**
 * GET /referentiel/variables
 *
 * Alimente les sélecteurs de variables X / Y côté React. Renvoie pour le
 * cursus demandé la liste des indicateurs disponibles, leur ordre canonique,
 * leur drapeau `declinable_delai`, et l'ensemble des couples (X, Y)
 * autorisés (où `ordre(X) < ordre(Y)` — contrainte d'ordre du cadrage §5).
 *
 * Paramètres (query string) :
 *  - formation : 'Licence générale' | 'Licence professionnelle' | 'Bachelor universitaire de technologie' | 'Master'
 *
 * Headers requis : X-Connexion-Token, X-User-Token, X-Campagne-Token
 *
 * Source : table `dim_indicateur_cursus` — colonnes (formation, indicateur,
 * ordre, declinable_delai). Pas de colonne `code` séparée : l'identifiant
 * d'un indicateur côté API est son libellé (utilisé tel quel en `var1` /
 * `var2` dans /quadrant). On expose donc `libelle` seul, pas de `code`
 * synthétique (cf. principe « pas de fausse symétrie » du repo).
 *
 * Comme la liste des variables est structurelle (matrice cursus × indicateur),
 * elle est indépendante du contexte de l'utilisateur. L'auth reste requise.
 *
 * Réponse :
 *  {
 *    "formation": "Master",
 *    "variables": [
 *      {"libelle": "Taux de réussite en 2 ans", "ordre": 10, "declinable_delai": false},
 *      {"libelle": "Taux sortants en emploi stable", "ordre": 80, "declinable_delai": true},
 *      ...
 *    ],
 *    "couples_autorises": [
 *      ["Taux de réussite en 2 ans", "Taux de réussite en 3 ans"],
 *      ["Taux de réussite en 2 ans", "Taux sortants en emploi stable"],
 *      ...
 *    ],
 *    "dates_insertion": ["6", "12", "18", "24", "30"]
 *  }
 *
 * Note sur la même variable des deux côtés (cas hypothétique « insertion à 6 mois
 * vs insertion à 18 mois ») : non autorisé. Le validateur de /quadrant rejette
 * `var1 === var2` indépendamment des délais, donc on émet uniquement les couples
 * stricts `ordre(X) < ordre(Y)`.
 */

require_once __DIR__ . '/../lib/Database.php';
require_once __DIR__ . '/../lib/Response.php';
require_once __DIR__ . '/../lib/Session.php';

Response::cors();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('method_not_allowed', 'Seul GET est autorisé sur cet endpoint.', 405);
}

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
    SELECT indicateur, ordre, declinable_delai
    FROM dim_indicateur_cursus
    WHERE formation = :formation
    ORDER BY ordre
");
$stmt->execute([':formation' => $formation]);

$variables = [];
foreach ($stmt->fetchAll() as $r) {
    $variables[] = [
        'libelle'          => (string)$r['indicateur'],
        'ordre'            => (int)$r['ordre'],
        'declinable_delai' => (int)$r['declinable_delai'] === 1,
    ];
}

// Couples autorisés : produit cartésien (X, Y) avec ordre(X) < ordre(Y).
// Comme la requête est triée par ordre ASC, une simple boucle imbriquée
// (i < j) suffit. Quand des indicateurs partagent le même `ordre` (peu
// probable mais pas exclu par le schéma), on les exclut du couple
// (contrainte stricte var1 < var2).
$couplesAutorises = [];
$n = count($variables);
for ($i = 0; $i < $n; $i++) {
    for ($j = $i + 1; $j < $n; $j++) {
        if ($variables[$i]['ordre'] < $variables[$j]['ordre']) {
            $couplesAutorises[] = [
                $variables[$i]['libelle'],
                $variables[$j]['libelle'],
            ];
        }
    }
}

Response::json([
    'formation'         => $formation,
    'variables'         => $variables,
    'couples_autorises' => $couplesAutorises,
    'dates_insertion'   => ['6', '12', '18', '24', '30'],
]);
