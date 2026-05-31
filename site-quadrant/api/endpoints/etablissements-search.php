<?php
/**
 * GET /etablissements/search
 *
 * Recherche intelligente d'établissement pour le sélecteur global
 * (contexte rectorat / national). Recherche multi-champs pondérée
 * (sigle, noms, identifiants externes, localisation) avec scoring côté
 * PHP (Phase 14.10).
 *
 * Paramètres (query string) :
 *  - q     : chaîne de recherche (1 caractère min ; vide → résultats vides)
 *  - limit : nombre max de résultats (défaut 10, max 50)
 *
 * Headers requis : X-Connexion-Token, X-User-Token, X-Campagne-Token
 *
 * Sécurité d'accès : la table `etablissements` porte sa PROPRE colonne
 * filtre_perimetre (`;id_nat;id_reg;id_paysage;`). Une requête PLATE
 * `LIKE %;contexte_id;%` ramène les établissements autorisés (1 en
 * contexte établissement, N en rectorat, ≤ 70 en national) — aucune
 * jointure avec stats_quadrant (cf. principe Phase 14.8). Le scoring se
 * fait ensuite en PHP sur cet ensemble borné.
 *
 * Réponse :
 *  {
 *    "resultats": [ { id_paysage, uo_lib, sigle, typologie, reg_nom,
 *                     com_nom, score } ],
 *    "total_avant_limite": <int>,
 *    "query_utilisee": "<q normalisée>"
 *  }
 */

require_once __DIR__ . '/../lib/Database.php';
require_once __DIR__ . '/../lib/Response.php';
require_once __DIR__ . '/../lib/Session.php';

Response::cors();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('method_not_allowed', 'Seul GET est autorisé sur cet endpoint.', 405);
}

// =============================================================================
// 1. Session
// =============================================================================

$session    = new Session();
$contexteId = $session->getContexteId();

// =============================================================================
// 2. Paramètres
// =============================================================================

$q     = (string)($_GET['q'] ?? '');
$limit = (int)($_GET['limit'] ?? 10);
if ($limit < 1)  { $limit = 10; }
if ($limit > 50) { $limit = 50; }

// Normalisation lowercase + sans accents : le scoring se fait en PHP (pas
// en SQL), donc la collation accent-insensitive de la table NE s'applique
// PAS — on doit replier les accents nous-mêmes pour que « universite »
// matche « Université », « clermont » matche « Clermont », etc.
$qNorm = normaliser(trim($q));

// Requête vide → résultats vides (l'UI debounce et n'appelle pas à vide,
// mais on reste robuste).
if ($qNorm === '') {
    Response::json([
        'resultats'          => [],
        'total_avant_limite' => 0,
        'query_utilisee'     => '',
    ]);
}

// =============================================================================
// 3. Établissements autorisés du contexte (requête plate, sans jointure)
// =============================================================================

$pdo  = Database::get();
$stmt = $pdo->prepare("
    SELECT id_paysage, uo_lib, uo_lib_officiel, sigle, nom_court,
           typologie_d_universites_et_assimiles AS typologie,
           anciens_codes_uai, siret, siren,
           identifiant_wikidata, identifiant_ror,
           com_nom, uucr_nom, dep_nom, aca_nom, reg_nom,
           champ_recherche
    FROM etablissements
    WHERE filtre_perimetre LIKE :motif
");
$stmt->execute([':motif' => '%;' . $contexteId . ';%']);
$autorises = $stmt->fetchAll();

// =============================================================================
// 4. Scoring
// =============================================================================

$scores = [];
foreach ($autorises as $e) {
    $score = scorerEtablissement($e, $qNorm);
    if ($score > 0) {
        $scores[$e['id_paysage']] = ['etab' => $e, 'score' => $score];
    }
}

// Fallback multi-mots si peu de résultats sur la chaîne complète.
if (count($scores) < 3 && str_contains($qNorm, ' ')) {
    $mots = array_filter(preg_split('/\s+/', $qNorm), static fn($m) => $m !== '');
    foreach ($autorises as $e) {
        $scoreMots = 0;
        foreach ($mots as $mot) {
            $scoreMots += scorerEtablissement($e, $mot);
        }
        $scoreMots = (int)($scoreMots * 0.7); // poids moindre pour le multi-mots
        if ($scoreMots > 0) {
            $id = $e['id_paysage'];
            if (isset($scores[$id])) {
                $scores[$id]['score'] = max($scores[$id]['score'], $scoreMots);
            } else {
                $scores[$id] = ['etab' => $e, 'score' => $scoreMots];
            }
        }
    }
}

$liste = array_values($scores);
// Tri descendant par score ; à score égal, ordre alphabétique du nom usuel
// pour une sortie stable.
usort($liste, static function ($a, $b) {
    if ($b['score'] !== $a['score']) {
        return $b['score'] - $a['score'];
    }
    return strcmp((string)$a['etab']['uo_lib'], (string)$b['etab']['uo_lib']);
});

$total     = count($liste);
$resultats = [];
foreach (array_slice($liste, 0, $limit) as $item) {
    $e = $item['etab'];
    $resultats[] = [
        'id_paysage' => (string)$e['id_paysage'],
        'uo_lib'     => (string)($e['uo_lib'] ?? ''),
        'sigle'      => (string)($e['sigle'] ?? ''),
        'typologie'  => (string)($e['typologie'] ?? ''),
        'reg_nom'    => (string)($e['reg_nom'] ?? ''),
        'com_nom'    => (string)($e['com_nom'] ?? ''),
        'score'      => $item['score'],
    ];
}

Response::json([
    'resultats'          => $resultats,
    'total_avant_limite' => $total,
    'query_utilisee'     => $qNorm,
]);


// =============================================================================
// Scoring (cf. Phase 14.10 — table de poids)
// =============================================================================

/**
 * Score d'un établissement pour une requête normalisée (lowercase, trim).
 * Somme des contributions par colonne selon le type de match
 * (exact > préfixe > contient). Les colonnes multi-valeurs
 * (anciens_codes_uai, siret) sont matchées par `str_contains` (V1).
 */
/**
 * Lowercase + repli des accents (é→e, ç→c, œ→oe…). Rend la recherche PHP
 * insensible à la casse ET aux accents. mb_strtolower si dispo (gère É→é),
 * sinon strtolower (le strtr couvre alors les minuscules accentuées).
 */
function normaliser(string $s): string
{
    $s = function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s);
    static $map = [
        'à' => 'a', 'á' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'å' => 'a',
        'ç' => 'c',
        'è' => 'e', 'é' => 'e', 'ê' => 'e', 'ë' => 'e',
        'ì' => 'i', 'í' => 'i', 'î' => 'i', 'ï' => 'i',
        'ñ' => 'n',
        'ò' => 'o', 'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o',
        'ù' => 'u', 'ú' => 'u', 'û' => 'u', 'ü' => 'u',
        'ý' => 'y', 'ÿ' => 'y',
        'œ' => 'oe', 'æ' => 'ae',
    ];
    return strtr($s, $map);
}

function scorerEtablissement(array $e, string $q): int
{
    $exact   = static fn($v) => $v !== null && $v !== '' && normaliser((string)$v) === $q;
    $prefixe = static fn($v) => $v !== null && $v !== '' && str_starts_with(normaliser((string)$v), $q);
    $contient = static fn($v) => $v !== null && $v !== '' && str_contains(normaliser((string)$v), $q);

    $score = 0;

    // Sigle
    if     ($exact($e['sigle']))    { $score += 250; }
    elseif ($prefixe($e['sigle']))  { $score += 200; }
    elseif ($contient($e['sigle'])) { $score += 150; }

    // uo_lib (nom usuel)
    if     ($exact($e['uo_lib']))    { $score += 200; }
    elseif ($prefixe($e['uo_lib']))  { $score += 150; }
    elseif ($contient($e['uo_lib'])) { $score += 100; }

    // nom_court
    if     ($exact($e['nom_court']))    { $score += 200; }
    elseif ($prefixe($e['nom_court']))  { $score += 150; }
    elseif ($contient($e['nom_court'])) { $score += 100; }

    // uo_lib_officiel
    if     ($exact($e['uo_lib_officiel']))    { $score += 180; }
    elseif ($prefixe($e['uo_lib_officiel']))  { $score += 135; }
    elseif ($contient($e['uo_lib_officiel'])) { $score += 90; }

    // Identifiants externes (exact ou contient — multi-valeurs possibles)
    foreach (['anciens_codes_uai', 'identifiant_wikidata', 'identifiant_ror', 'siret', 'siren'] as $col) {
        if     ($exact($e[$col]))    { $score += 100; }
        elseif ($contient($e[$col])) { $score += 50; }
    }

    // Commune
    if     ($prefixe($e['com_nom']))  { $score += 60; }
    elseif ($contient($e['com_nom'])) { $score += 30; }

    // Unité urbaine
    if     ($prefixe($e['uucr_nom']))  { $score += 50; }
    elseif ($contient($e['uucr_nom'])) { $score += 25; }

    // Région
    if ($contient($e['reg_nom'])) { $score += 15; }

    // Champ de recherche agrégé (filet de sécurité : noms alternatifs,
    // anciens noms, traductions…)
    if ($contient($e['champ_recherche'])) { $score += 50; }

    return $score;
}
