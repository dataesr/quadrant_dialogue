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
 *  - millesime : optionnel, '\d{4}'. Si présent, la réponse inclut un champ
 *                `disponibilites` : pour chaque indicateur autorisé sur ce cursus,
 *                la liste des `date_inser` effectivement présents dans
 *                `stats_quadrant` pour ce millésime. Permet au frontend de griser
 *                dans les sélecteurs les indicateurs / délais non encore disponibles
 *                (typiquement le millésime le plus récent qui n'a pas tous les
 *                délais d'insertion). La structure des variables et des couples
 *                est indépendante du millésime, donc la liste complète reste
 *                renvoyée.
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
 *    "dates_insertion": ["6", "12", "18", "24", "30"],
 *    "defauts": {
 *      "millesime":    "2022",
 *      "indicateur_x": "Taux de réussite en 2 ou 3 ans",
 *      "indicateur_y": "Taux sortants en emploi salarié en France",
 *      "date_inser_x": null,
 *      "date_inser_y": "18"
 *    }
 *  }
 *
 * Le champ `defauts` est lu dans `dim_defaut_cursus` (cf. migration 003). Une
 * ligne par cursus, tous les champs nullables : un NULL signifie « le frontend
 * applique sa logique de fallback » (premier millésime, premier couple, 12 mois
 * pour les délais). Si aucune ligne dans la table pour ce cursus (cas
 * improbable), `defauts` vaut `null` et le frontend tombe sur le fallback.
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
if ($millesime !== '' && !preg_match('/^\d{4}$/', $millesime)) {
    Response::error('invalid_millesime', 'Paramètre millesime invalide.');
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

// Défauts métier pour ce cursus, depuis dim_defaut_cursus (migration 003).
// Renvoie null si la table n'a pas de ligne pour ce cursus — le frontend
// retombe alors sur sa logique de fallback mécanique.
$stmt = Database::get()->prepare("
    SELECT millesime, indicateur_x, indicateur_y, date_inser_x, date_inser_y
    FROM dim_defaut_cursus
    WHERE formation = :formation
    LIMIT 1
");
$stmt->execute([':formation' => $formation]);
$rowDefauts = $stmt->fetch();

$defauts = null;
if ($rowDefauts) {
    $defauts = [
        'millesime'    => $rowDefauts['millesime']    ?? null,
        'indicateur_x' => $rowDefauts['indicateur_x'] ?? null,
        'indicateur_y' => $rowDefauts['indicateur_y'] ?? null,
        'date_inser_x' => $rowDefauts['date_inser_x'] ?? null,
        'date_inser_y' => $rowDefauts['date_inser_y'] ?? null,
    ];
}

// Disponibilités par (indicateur, date_inser) pour le millésime demandé.
// Calculé à la demande : si aucun millésime n'est passé, on n'expose pas
// ce champ. Évite une requête supplémentaire pour le cas d'appel initial
// du frontend (qui charge les variables avant de connaître le millésime).
$disponibilites = null;
if ($millesime !== '') {
    $stmt = Database::get()->prepare("
        SELECT DISTINCT indicateur, date_inser
        FROM stats_quadrant
        WHERE formation = :formation
          AND millesime = :millesime
    ");
    $stmt->execute([
        ':formation' => $formation,
        ':millesime' => $millesime,
    ]);

    // Carte indicateur => liste des date_inser présents.
    // Convention : date_inser '' (non déclinable) est représenté par
    // chaîne vide côté API — cohérent avec /quadrant qui binde la même
    // chaîne vide quand declinable_delai=false.
    $disponibilites = [];
    foreach ($stmt->fetchAll() as $r) {
        $ind  = (string)$r['indicateur'];
        $date = (string)($r['date_inser'] ?? '');
        if (!isset($disponibilites[$ind])) {
            $disponibilites[$ind] = [];
        }
        if (!in_array($date, $disponibilites[$ind], true)) {
            $disponibilites[$ind][] = $date;
        }
    }
    // Garde-fou : pour chaque indicateur autorisé sur ce cursus mais
    // totalement absent du millésime, on émet une entrée vide ['dates' => []].
    // Le frontend distingue alors « indisponible » (clé présente avec
    // tableau vide) d'« information manquante » (clé absente).
    foreach ($variables as $v) {
        $lib = $v['libelle'];
        if (!isset($disponibilites[$lib])) {
            $disponibilites[$lib] = [];
        }
    }
}

$reponse = [
    'formation'         => $formation,
    'variables'         => $variables,
    'couples_autorises' => $couplesAutorises,
    'dates_insertion'   => ['6', '12', '18', '24', '30'],
    'defauts'           => $defauts,
];
if ($disponibilites !== null) {
    $reponse['millesime']      = $millesime;
    $reponse['disponibilites'] = $disponibilites;
}

Response::json($reponse);
