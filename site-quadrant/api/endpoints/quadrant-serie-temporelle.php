<?php
/**
 * GET /quadrant/serie-temporelle
 *
 * Renvoie les données quadrant pour TOUS les millésimes disponibles pour
 * la combinaison (var1, var2, formation, vue, filtres). Utilisé par la
 * future modale d'animation temporelle (Phase 11) pour faire glisser
 * les bulles entre millésimes successifs (style Hans Rosling / Gapminder).
 *
 * Paramètres (query string) — IDENTIQUES à /quadrant SAUF :
 *   - PAS de `millesime` (la fonction trouve elle-même les millésimes
 *     communs aux deux variables).
 *   - PAS de `for_export` (on applique systématiquement le seuil, cf. §3).
 *   - PAS de `agregation` (les axes sont tous calculés systématiquement).
 *
 * Headers requis : X-Connexion-Token, X-User-Token, X-Campagne-Token
 *
 * Réponse :
 *   {
 *     "millesimes_disponibles": [2020, 2021, 2022, 2023],
 *     "series": {
 *       "2020": { "bulles": [...], "axes": {...} },
 *       "2021": { "bulles": [...], "axes": {...} },
 *       ...
 *     },
 *     "seuil_applique": 20
 *   }
 *
 * Si moins de 2 millésimes communs : `millesimes_disponibles` vide,
 * `series` vide (objet, pas tableau), `info=animation_indisponible`.
 *
 * Spécificités vs /quadrant :
 *
 *  1. Seuil de diffusion appliqué systématiquement (Phase 11).
 *     L'utilisateur a explicitement demandé à se limiter aux bulles
 *     SANS effectifs sensibles sur l'un OU l'autre des indicateurs.
 *     On applique le seuil diffusable (config exports.seuil_diffusable,
 *     20 par défaut) sur denom_x ET denom_y. Toute bulle avec un denom
 *     < seuil sur un axe est exclue. Conséquence : toutes les formes
 *     sont `rond`, pas de triangle ni de croix.
 *
 *  2. Identifiants stables entre millésimes.
 *     Vue Mentions : `diplom` (stable). Vue Établissements : `id_paysage`
 *     pour les accessibles, `anon_<crc32 hexa 8 chars>` pour les
 *     anonymes (stable cross-millésime pour le même id_paysage).
 *
 *  3. Tous les modes d'axes calculés en parallèle.
 *     Vue Mentions : `mediane_etab_x/y`, `moyenne_etab_x/y`,
 *     `moyenne_nationale_x/y`, `mediane_nationale_x/y` (Phase 15.2 —
 *     seuil 20, cohérent /quadrant). Vue Établissements : `mediane_x/y`,
 *     `moyenne_x/y`. Permet au frontend de basculer la référence sans
 *     refetch.
 *
 *  4. Pas de mentions_non_representees ni de champ `info` par série.
 *
 * Stratégie SQL — optimisée pour la perf :
 *   Plutôt que de faire un self-join par millésime (lent : ~2s par
 *   millésime pour vue=etablissements à cause de la table 572k lignes),
 *   on tire DEUX requêtes flat (une par indicateur) sur tous les
 *   millésimes communs avec `millesime IN (...)`, puis on joint côté
 *   PHP via une Map (millesime, diplom, id_paysage). En vue Mentions
 *   où la moyenne nationale est calculée hors-contexte, on tire 2
 *   requêtes supplémentaires nationales (sans le LIKE filtre_perimetre).
 *
 *   Benchmark vue=etablissements 4 millésimes Master :
 *     - Self-join répété : ~7500 ms
 *     - 2 requêtes flat + join PHP : ~800 ms
 *
 * Codes d'erreur 400 : mêmes que /quadrant. 500 : `cursus_incoherent`.
 */

require_once __DIR__ . '/../lib/Database.php';
require_once __DIR__ . '/../lib/Response.php';
require_once __DIR__ . '/../lib/Session.php';
require_once __DIR__ . '/../lib/Diffusion.php';
require_once __DIR__ . '/../lib/Anonymizer.php';
require_once __DIR__ . '/../lib/RateLimit.php';

Response::cors();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('method_not_allowed', 'Seul GET est autorisé sur cet endpoint.', 405);
}

// =============================================================================
// 1. Session + paramètres
// =============================================================================

$session    = new Session();
$contexteId = $session->getContexteId();

// Endpoint sensible (Phase 14.11) : historique complet multi-millésimes
// (2 requêtes flat sur tous les millésimes). Seuil
// config.rate_limit.seuil_sensible (15/min/contexte par défaut).
RateLimit::enforce('quadrant_serie_temporelle:' . $contexteId);

$formation        = $_GET['formation']        ?? '';
$vue              = $_GET['vue']              ?? '';
$var1             = $_GET['var1']             ?? '';
$var2             = $_GET['var2']             ?? '';
$dateInserVar1    = $_GET['date_inser_var1']  ?? '';
$dateInserVar2    = $_GET['date_inser_var2']  ?? '';
$dom              = $_GET['dom']              ?? '';
$discipli         = $_GET['discipli']         ?? '';
$secteur          = $_GET['secteur']          ?? '';
$master           = $_GET['master']           ?? '';
$etabContexte     = $_GET['etab_contexte']    ?? '';
$mention          = $_GET['mention']          ?? '';
$representativite = $_GET['representativite'] ?? 'toutes';
$memeTypologie    = !empty($_GET['meme_typologie']);

// =============================================================================
// 2. Validation (identique /quadrant minus millesime)
// =============================================================================

$formationsAutorisees = [
    'Licence générale',
    'Licence professionnelle',
    'Bachelor universitaire de technologie',
    'Master',
];
if (!in_array($formation, $formationsAutorisees, true)) {
    Response::error('invalid_formation', 'Paramètre formation invalide.');
}
if (!in_array($vue, ['mentions', 'etablissements'], true)) {
    Response::error('invalid_vue', 'Paramètre vue invalide.');
}
if ($var1 === '' || $var2 === '' || $var1 === $var2) {
    Response::error('invalid_variables', 'Les deux variables doivent être renseignées et différentes.');
}
if (!in_array($representativite, ['toutes', 'representatif'], true)) {
    Response::error('invalid_representativite', 'Paramètre representativite invalide.');
}
if ($mention !== '' && !preg_match('/^[A-Za-z0-9]{1,20}$/', $mention)) {
    Response::error('invalid_mention', 'Paramètre mention invalide.');
}
if ($vue !== 'etablissements') $mention = '';

$indicateursAutorises = chargerIndicateursCursus($formation);
if (empty($indicateursAutorises)) {
    Response::error(
        'cursus_incoherent',
        "Aucun indicateur défini pour le cursus « $formation » dans dim_indicateur_cursus.",
        500
    );
}
if (!isset($indicateursAutorises[$var1])) {
    Response::error('invalid_var1', "L'indicateur var1 « $var1 » n'est pas autorisé pour le cursus.");
}
if (!isset($indicateursAutorises[$var2])) {
    Response::error('invalid_var2', "L'indicateur var2 « $var2 » n'est pas autorisé pour le cursus.");
}
if ($indicateursAutorises[$var1]['ordre'] >= $indicateursAutorises[$var2]['ordre']) {
    Response::error('invalid_order', 'var1 doit précéder var2 dans l\'ordre canonique du cursus.');
}
$delaisAutorises = ['6', '12', '18', '24', '30'];
foreach ([['var1', $var1, $dateInserVar1], ['var2', $var2, $dateInserVar2]] as $check) {
    [$nom, $ind, $date] = $check;
    $declinable = $indicateursAutorises[$ind]['declinable_delai'];
    if ($declinable && !in_array($date, $delaisAutorises, true)) {
        Response::error('invalid_date_inser', "date_inser_$nom doit valoir 6/12/18/24/30 (indicateur déclinable).");
    }
    if (!$declinable && $date !== '') {
        Response::error('invalid_date_inser', "date_inser_$nom doit être vide (indicateur non déclinable).");
    }
}

// =============================================================================
// 3. Config (seuil diffusable + secret d'anonymisation) + connexion BDD
// =============================================================================

$config = require __DIR__ . '/../config/config.php';
$seuil  = (int)($config['exports']['seuil_diffusable'] ?? 20);

// Initialisation du hash anonymisant. La classe Anonymizer LÈVE une
// exception si le secret n'est pas configuré ou est resté à sa
// valeur sentinelle — l'endpoint refuse alors de répondre, plutôt
// que de servir des IDs faussement anonymes (réversibles).
try {
    Anonymizer::init($config['anonymization']['secret'] ?? '');
} catch (RuntimeException $e) {
    Response::error(
        'anonymization_misconfigured',
        'Anonymisation non configurée — contacter l\'administrateur de l\'application.',
        500
    );
}

$pdo = Database::get();

// =============================================================================
// 4. Identifier les millésimes communs aux deux variables
// =============================================================================

$millesimesCommuns = trouverMillesimesCommuns($pdo, $formation, $var1, $dateInserVar1, $var2, $dateInserVar2);

if (count($millesimesCommuns) < 2) {
    Response::json([
        'millesimes_disponibles' => array_map('intval', $millesimesCommuns),
        'series'                 => (object)[],
        'seuil_applique'         => $seuil,
        'info'                   => 'animation_indisponible',
    ]);
}

// =============================================================================
// 5. Pré-fetch optimisé : 2 requêtes flat sur tous les millésimes communs
// =============================================================================
//
// Au lieu de répéter un self-join par millésime, on tire UNE requête pour
// var1 + UNE pour var2 sur tous les millésimes via IN (). Puis on joint
// côté PHP via une Map indexée par (millesime, diplom, id_paysage). Voir
// commentaire d'en-tête pour le bench (×9 plus rapide).
//
// Filtres SQL appliqués ici :
//   - formation, indicateur, date_inser, millesime IN (...) (toujours)
//   - filtre_perimetre LIKE (vue=mentions uniquement)
//   - dom, discipli (vue=mentions, optionnels)
//   - secteur (les deux vues, optionnel)
//   - mention diplom (vue=etablissements avec filtre mention, optionnel)
//   - master (formation=Master, optionnel)
//
// Filtres APPLIQUÉS APRÈS jointure (côté PHP) :
//   - etabContexte (vue=mentions, filtre étab unique)
//
// Pour la moyenne nationale (vue=mentions uniquement), on tirera 2
// requêtes supplémentaires sans filtre_perimetre LIKE — voir §7.

// Filtre « Même typologie uniquement » (vue=etablissements, etab de
// contexte requis). On pré-fetch la typologie de l'étab de contexte
// une fois ; chaîne vide → la fonction de fetch principal ignorera la
// contrainte. Cohérent avec /quadrant.php.
$typologieContexte = '';
if ($memeTypologie && $vue === 'etablissements' && $etabContexte !== '') {
    $stmtTypo = $pdo->prepare(
        "SELECT typologie_d_universites_et_assimiles
         FROM stats_quadrant WHERE id_paysage = :etab LIMIT 1"
    );
    $stmtTypo->execute([':etab' => $etabContexte]);
    $val = $stmtTypo->fetchColumn();
    if (is_string($val)) $typologieContexte = $val;
}

$lignesContextuelles = fetcherLignesPourVariables(
    $pdo, $formation, $millesimesCommuns,
    $var1, $dateInserVar1, $var2, $dateInserVar2,
    $vue, $contexteId,
    $dom, $discipli, $secteur, $master, $mention,
    $typologieContexte,
    /* national = */ false
);

// =============================================================================
// 6. Construction des bulles par millésime
// =============================================================================

$series = [];
// Points bruts par millésime (avant filtrage d'affichage) — réutilisés
// pour le compteur de mouvements (Phase 15.4), qui compare chaque
// millésime au précédent de la série.
$pointsBrutsParMillesime = [];
foreach ($millesimesCommuns as $millesime) {
    $millesimeStr = (string)$millesime;
    $lignesM = $lignesContextuelles[$millesimeStr] ?? [];

    // Filtre etabContexte (vue=mentions : on ne garde que les mentions
    // de l'étab sélectionné — équivalent au filtre $etabContexte côté
    // /quadrant.php).
    if ($vue === 'mentions' && $etabContexte !== '') {
        $lignesM = array_values(array_filter(
            $lignesM,
            fn($l) => $l['id_paysage'] === $etabContexte
        ));
    }

    // Agrégation : vue Mentions = 1 ligne par mention (déjà filtrée).
    // Vue Établissements sans filtre mention = agrégation par
    // id_paysage. Vue Établissements avec filtre mention = 1 ligne
    // par étab (déjà unique par diplom).
    if ($vue === 'mentions' || $mention !== '') {
        $pointsBruts = $lignesM;
    } else {
        $pointsBruts = agregerParEtablissement($lignesM);
    }
    $pointsBrutsParMillesime[$millesimeStr] = $pointsBruts;

    [$bulles, $pointsCalculables] = construireBulles(
        $pointsBruts, $vue, $etabContexte, $contexteId, $seuil, $representativite
    );

    $axes = calculerAxes(
        $vue, $pointsCalculables, $pointsBruts
    );

    $series[$millesimeStr] = [
        'bulles' => $bulles,
        'axes'   => $axes,
    ];
}

// =============================================================================
// 7. Moyenne nationale (vue=mentions uniquement) — 1 paire de requêtes
//    flat sans filtre_perimetre, joint en PHP, ventilé par millésime
// =============================================================================

if ($vue === 'mentions') {
    $lignesNationales = fetcherLignesPourVariables(
        $pdo, $formation, $millesimesCommuns,
        $var1, $dateInserVar1, $var2, $dateInserVar2,
        $vue, $contexteId,
        $dom, $discipli, $secteur, $master, $mention,
        /* typologieContexte = */ '', // moyenne nationale : pas de filtre typologie
        /* national = */ true
    );

    foreach ($millesimesCommuns as $millesime) {
        $millesimeStr = (string)$millesime;
        $lignes       = $lignesNationales[$millesimeStr] ?? [];

        // Moyenne nationale pondérée (SUM(num)/SUM(denom)) sur toutes les
        // mentions France entière.
        $snx = 0; $sdx = 0; $sny = 0; $sdy = 0;
        // Médiane nationale (Phase 15.2) : médiane des taux par mention,
        // seuil de fiabilité 20 sur les DEUX dénominateurs (asymétrie
        // volontaire avec la médiane étab — cf. /quadrant.php
        // calculerMedianesNationales et CLAUDE.md). Permet à la modale
        // d'animation d'afficher la médiane nationale comme le quadrant.
        $natTauxX = []; $natTauxY = [];
        foreach ($lignes as $l) {
            $dnx = (int)$l['denom_x']; $dny = (int)$l['denom_y'];
            $snx += (int)$l['num_x']; $sdx += $dnx;
            $sny += (int)$l['num_y']; $sdy += $dny;
            if ($dnx >= Diffusion::SEUIL_FIABILITE && $dny >= Diffusion::SEUIL_FIABILITE) {
                $natTauxX[] = (int)$l['num_x'] / $dnx;
                $natTauxY[] = (int)$l['num_y'] / $dny;
            }
        }

        $series[$millesimeStr]['axes']['moyenne_nationale_x'] = $sdx > 0 ? round($snx / $sdx, 4) : null;
        $series[$millesimeStr]['axes']['moyenne_nationale_y'] = $sdy > 0 ? round($sny / $sdy, 4) : null;
        $series[$millesimeStr]['axes']['mediane_nationale_x'] = !empty($natTauxX) ? round(mediane($natTauxX), 4) : null;
        $series[$millesimeStr]['axes']['mediane_nationale_y'] = !empty($natTauxY) ? round(mediane($natTauxY), 4) : null;
    }
}

// =============================================================================
// 8. Compteur de mouvements par millésime (Phase 15.4, vue Mentions)
// =============================================================================
//
// Pour chaque millésime de la série, on compte les mouvements de bulles
// par rapport au millésime PRÉCÉDENT de la série (la « frame » que
// l'utilisateur vient de voir glisser). Calculé sur les points BRUTS
// (avant seuil/représentativité), au seuil de fiabilité (20). Le
// premier millésime n'a pas de précédent → comparaison_disponible=false
// (« Première année observée » côté frontend). Vue Mentions uniquement.
if ($vue === 'mentions') {
    $precedent = null; // points bruts du millésime précédent de la série
    $precMillesime = null;
    foreach ($millesimesCommuns as $millesime) {
        $millesimeStr = (string)$millesime;
        $courant = $pointsBrutsParMillesime[$millesimeStr] ?? [];
        $series[$millesimeStr]['mouvements'] = calculerMouvements(
            $courant,
            $precedent,
            $precMillesime
        );
        $precedent     = $courant;
        $precMillesime = (int)$millesime;
    }
}

Response::json([
    'millesimes_disponibles' => array_map('intval', $millesimesCommuns),
    'series'                 => $series,
    'seuil_applique'         => $seuil,
]);


// =============================================================================
// Fonctions auxiliaires
// =============================================================================

/**
 * Compteur de mouvements de bulles entre un millésime et le précédent
 * de la série (Phase 15.4, vue Mentions). Clé de jointure = diplom.
 *
 * Aide à distinguer les vraies évolutions du référentiel SIES des
 * simples franchissements du seuil de fiabilité. Calculé sur les points
 * BRUTS (avant filtrage d'affichage).
 *
 * État d'une mention pour le couple (denom_x, denom_y) :
 *   0 = absente    (un denom à 0 → non mesurée, aucune bulle possible)
 *   1 = sous seuil (présente mais denom < SEUIL_FIABILITE sur un axe)
 *   2 = visible    (denom >= SEUIL_FIABILITE sur les DEUX axes)
 *
 * Quatre catégories (mutuellement exclusives par mention) :
 *   - nouvelles      : absente au précédent → visible au courant.
 *   - disparues      : présente (>= 1) au précédent → absente au courant.
 *   - masquees_seuil : présente au courant mais sous le seuil (état 1).
 *   - reapparues     : sous le seuil au précédent → visible au courant.
 *   (visible → visible = stable, non compté.)
 *
 * $pointsPrec null (premier millésime) → comparaison_disponible=false.
 * `millesime_precedent` informe le libellé frontend (« Par rapport au
 * millésime 2021 — … »).
 */
function calculerMouvements(array $pointsCourant, ?array $pointsPrec, ?int $millesimePrec): array
{
    $etat = static function (array $p): int {
        $dx = (int)$p['denom_x'];
        $dy = (int)$p['denom_y'];
        if ($dx < 1 || $dy < 1) {
            return 0;
        }
        if ($dx >= Diffusion::SEUIL_FIABILITE && $dy >= Diffusion::SEUIL_FIABILITE) {
            return 2;
        }
        return 1;
    };

    $base = [
        'comparaison_disponible' => $pointsPrec !== null,
        'millesime_precedent'    => $millesimePrec,
        'seuil'                  => Diffusion::SEUIL_FIABILITE,
        'nouvelles'              => [],
        'disparues'              => [],
        'masquees_seuil'         => [],
        'reapparues'             => [],
    ];

    if ($pointsPrec === null) {
        return $base; // premier millésime : pas de comparaison
    }

    $etatCourant = [];
    $libelles    = [];
    foreach ($pointsCourant as $p) {
        $cle = $p['diplom'];
        $etatCourant[$cle] = $etat($p);
        $libelles[$cle]    = (string)($p['libelle_intitule'] ?? '');
    }
    $etatPrec = [];
    foreach ($pointsPrec as $p) {
        $cle = $p['diplom'];
        $etatPrec[$cle] = $etat($p);
        if (!isset($libelles[$cle]) || $libelles[$cle] === '') {
            $libelles[$cle] = (string)($p['libelle_intitule'] ?? '');
        }
    }

    $nouvelles  = [];
    $disparues  = [];
    $masquees   = [];
    $reapparues = [];

    $toutesCles = array_unique(array_merge(array_keys($etatCourant), array_keys($etatPrec)));
    foreach ($toutesCles as $cle) {
        $c   = $etatCourant[$cle] ?? 0;
        $p   = $etatPrec[$cle]    ?? 0;
        $lib = $libelles[$cle]    ?? '';
        if ($c === 1) {
            $masquees[] = $lib;
        } elseif ($p === 0 && $c === 2) {
            $nouvelles[] = $lib;
        } elseif ($p >= 1 && $c === 0) {
            $disparues[] = $lib;
        } elseif ($p === 1 && $c === 2) {
            $reapparues[] = $lib;
        }
        // p >= 1 & c === 2 (hors p === 1) ou p === 2 & c === 2 : stable.
    }

    $tri = static function (array $libs): array {
        sort($libs, SORT_NATURAL | SORT_FLAG_CASE);
        return $libs;
    };

    $base['nouvelles']      = $tri($nouvelles);
    $base['disparues']      = $tri($disparues);
    $base['masquees_seuil'] = $tri($masquees);
    $base['reapparues']     = $tri($reapparues);
    return $base;
}

function chargerIndicateursCursus(string $formation): array
{
    $stmt = Database::get()->prepare("
        SELECT indicateur, ordre, declinable_delai
        FROM dim_indicateur_cursus
        WHERE formation = :formation
    ");
    $stmt->execute([':formation' => $formation]);
    $map = [];
    foreach ($stmt->fetchAll() as $r) {
        $map[$r['indicateur']] = [
            'ordre'            => (int)$r['ordre'],
            'declinable_delai' => (int)$r['declinable_delai'] === 1,
        ];
    }
    return $map;
}

/**
 * Identifie les millésimes communs où les DEUX indicateurs sont
 * présents. Sort triée croissante (chronologique).
 */
function trouverMillesimesCommuns(
    PDO $pdo, string $formation,
    string $var1, string $date1, string $var2, string $date2
): array {
    $stmt = $pdo->prepare("
        SELECT DISTINCT millesime
        FROM stats_quadrant
        WHERE formation = :formation
          AND indicateur = :indicateur
          AND date_inser = :date_inser
    ");
    $stmt->execute([':formation' => $formation, ':indicateur' => $var1, ':date_inser' => $date1]);
    $m1 = array_column($stmt->fetchAll(), 'millesime');

    $stmt->execute([':formation' => $formation, ':indicateur' => $var2, ':date_inser' => $date2]);
    $m2 = array_column($stmt->fetchAll(), 'millesime');

    $communs = array_values(array_intersect($m1, $m2));
    sort($communs);
    return $communs;
}

/**
 * Tire 2 requêtes flat (une par indicateur) sur tous les millésimes,
 * puis joint côté PHP. Retourne un tableau `[millesime => [lignes
 * jointes]]` où chaque ligne contient les colonnes attendues par la
 * suite (diplom, id_paysage, num_x/y, denom_x/y, secteur, dom, dom_lib,
 * libelle_intitule, uo_lib, reg_id, typologie, filtre_perimetre).
 *
 * Paramètre `$national` : si true, omet `filtre_perimetre LIKE` —
 * utilisé pour la moyenne nationale (vue=mentions). Toujours appliqué
 * aux filtres disciplinaires (dom/discipli/secteur/master) et au
 * filtre mention si présent.
 */
function fetcherLignesPourVariables(
    PDO $pdo, string $formation, array $millesimes,
    string $var1, string $date1, string $var2, string $date2,
    string $vue, string $contexteId,
    string $dom, string $discipli, string $secteur, string $master, string $mention,
    string $typologieContexte,
    bool $national
): array {
    $placeholders = implode(',', array_map(fn($i) => ":m$i", array_keys($millesimes)));

    // Construction du WHERE commun aux deux requêtes
    $conditions = [
        'formation = :formation',
        "millesime IN ($placeholders)",
    ];
    $paramsCommuns = [':formation' => $formation];
    foreach ($millesimes as $i => $m) $paramsCommuns[":m$i"] = $m;

    // Filtre périmètre contextuel (vue=mentions, hors national)
    if ($vue === 'mentions' && !$national) {
        $conditions[] = 'filtre_perimetre LIKE :motif';
        $paramsCommuns[':motif'] = '%;' . $contexteId . ';%';
    }
    // Filtres disciplinaires (vue=mentions, hors mention bug bridge)
    if ($vue === 'mentions') {
        if ($dom !== '')      { $conditions[] = 'dom = :dom';           $paramsCommuns[':dom'] = $dom; }
        if ($discipli !== '') { $conditions[] = 'discipli = :discipli'; $paramsCommuns[':discipli'] = $discipli; }
    }
    if ($secteur !== '')  { $conditions[] = 'secteur_disciplinaire_quadrant = :secteur'; $paramsCommuns[':secteur'] = $secteur; }
    if ($mention !== '')  { $conditions[] = 'diplom = :mention';       $paramsCommuns[':mention'] = $mention; }
    if ($formation === 'Master' && $master !== '') {
        $conditions[] = 'master = :master';
        $paramsCommuns[':master'] = $master;
    }
    // Filtre « Même typologie uniquement » (vue=etablissements,
    // pré-fetché côté appelant). Pas de filtre national : la moyenne
    // nationale reste un agrégat France entière.
    if (!$national && $typologieContexte !== '') {
        $conditions[] = 'typologie_d_universites_et_assimiles = :typologieContexte';
        $paramsCommuns[':typologieContexte'] = $typologieContexte;
    }
    $whereCommun = implode(' AND ', $conditions);

    // Colonnes : on récupère tout ce dont on a besoin pour les
    // bulles + la `population` (libellé métier qui dépend de
    // (indicateur, date_inser, millesime) — sert au formatage des
    // titres d'axes côté frontend, cohérent /quadrant.php).
    // Pour la requête Y on n'a besoin que des effectifs et de la
    // population côté Y.
    $sqlX = "
        SELECT millesime, diplom, id_paysage,
               numerateur AS num_x, denominateur AS denom_x,
               population AS population_x,
               secteur_disciplinaire_quadrant, dom, dom_lib,
               libelle_intitule, uo_lib, reg_id,
               typologie_d_universites_et_assimiles AS typologie,
               filtre_perimetre
        FROM stats_quadrant
        WHERE $whereCommun
          AND indicateur = :ind AND date_inser = :date
    ";
    $sqlY = "
        SELECT millesime, diplom, id_paysage,
               numerateur AS num_y, denominateur AS denom_y,
               population AS population_y
        FROM stats_quadrant
        WHERE $whereCommun
          AND indicateur = :ind AND date_inser = :date
    ";

    $stmt = $pdo->prepare($sqlX);
    $stmt->execute(array_merge($paramsCommuns, [':ind' => $var1, ':date' => $date1]));
    $lignesX = $stmt->fetchAll();

    $stmt = $pdo->prepare($sqlY);
    $stmt->execute(array_merge($paramsCommuns, [':ind' => $var2, ':date' => $date2]));
    $lignesY = $stmt->fetchAll();

    // Index Y par (millesime, diplom, id_paysage)
    $indexY = [];
    foreach ($lignesY as $ly) {
        $key = $ly['millesime'] . '|' . $ly['diplom'] . '|' . $ly['id_paysage'];
        $indexY[$key] = $ly;
    }

    // Jointure + ventilation par millésime
    $parMillesime = [];
    foreach ($lignesX as $lx) {
        $key = $lx['millesime'] . '|' . $lx['diplom'] . '|' . $lx['id_paysage'];
        if (!isset($indexY[$key])) continue;
        $ly = $indexY[$key];
        $ligne = $lx;
        $ligne['num_y']        = $ly['num_y'];
        $ligne['denom_y']      = $ly['denom_y'];
        $ligne['population_y'] = $ly['population_y'];
        $m = $lx['millesime'];
        if (!isset($parMillesime[$m])) $parMillesime[$m] = [];
        $parMillesime[$m][] = $ligne;
    }
    return $parMillesime;
}

/**
 * Agrégation par établissement (vue=etablissements sans filtre mention).
 * Toutes les mentions d'un même id_paysage sont sommées.
 */
function agregerParEtablissement(array $lignes): array
{
    $parEtab = [];
    foreach ($lignes as $l) {
        $uai = $l['id_paysage'];
        if (!isset($parEtab[$uai])) {
            // population_x/y identiques sur toutes les lignes d'un
            // même indicateur/millésime → on les recopie une fois.
            $parEtab[$uai] = [
                'id_paysage'       => $uai,
                'uo_lib'           => $l['uo_lib'],
                'reg_id'           => $l['reg_id'],
                'typologie'        => $l['typologie'],
                'filtre_perimetre' => $l['filtre_perimetre'],
                'population_x'     => $l['population_x'] ?? null,
                'population_y'     => $l['population_y'] ?? null,
                'num_x' => 0, 'denom_x' => 0,
                'num_y' => 0, 'denom_y' => 0,
            ];
        }
        $parEtab[$uai]['num_x']   += (int)$l['num_x'];
        $parEtab[$uai]['denom_x'] += (int)$l['denom_x'];
        $parEtab[$uai]['num_y']   += (int)$l['num_y'];
        $parEtab[$uai]['denom_y'] += (int)$l['denom_y'];
    }
    return array_values($parEtab);
}

/**
 * Construit la liste des bulles + des points calculables pour un
 * millésime. Applique le seuil systématique (cf. en-tête fichier).
 */
function construireBulles(
    array $pointsBruts, string $vue, string $etabContexte,
    string $contexteId, int $seuil, string $representativite
): array {
    $bulles = [];
    $pointsCalculables = [];

    foreach ($pointsBruts as $p) {
        $denomX = (int)$p['denom_x'];
        $denomY = (int)$p['denom_y'];
        if ($denomX === 0 || $denomY === 0) continue;
        // Seuil systématique
        if ($denomX < $seuil || $denomY < $seuil) continue;

        $x = (int)$p['num_x'] / $denomX;
        $y = (int)$p['num_y'] / $denomY;
        $pointsCalculables[] = ['x' => $x, 'y' => $y];

        if ($representativite === 'representatif'
            && !Diffusion::estRepresentative($denomX, $denomY)) {
            continue;
        }

        // Couleur
        $couleurKey = $vue === 'mentions'
            ? $p['secteur_disciplinaire_quadrant']
            : categoriserEtablissement($p, $etabContexte, $pointsBruts);

        $detailsAccessibles = peutAccederDetail($p, $contexteId);

        // Anonymisation stable cross-millésime via HMAC-SHA256 salé.
        // crc32 (Phase 11a) était RÉVERSIBLE — id_paysage est public et
        // stable, un attaquant pouvait pré-calculer toute la table.
        // Anonymizer::hash() utilise un secret cryptographique (cf.
        // config.anonymization.secret), non précalculable.
        // Le brouillage ±15% du denom reste sur crc32 — non sensible
        // car la valeur denom elle-même est ce qu'on cherche à protéger ;
        // récupérer le ratio nécessiterait déjà de connaître le vrai
        // denom (raisonnement circulaire, pas un vecteur d'attaque).
        if ($vue === 'etablissements' && !$detailsAccessibles) {
            $idAnonyme  = Anonymizer::hash($p['id_paysage']);
            $hash       = crc32($p['id_paysage']);
            $ratio      = (($hash % 31) - 15) / 100.0;
            $denomBrouille = max($seuil, (int)round($denomX * (1 + $ratio)));

            $bulles[] = [
                'id'                  => $idAnonyme,
                'libelle'             => '',
                'x'                   => round($x, 4),
                'y'                   => round($y, 4),
                'denom'               => $denomBrouille,
                'forme'               => 'rond',
                'couleur_key'         => $couleurKey,
                'details_accessibles' => false,
            ];
            continue;
        }

        $id      = $vue === 'mentions' ? $p['diplom'] : $p['id_paysage'];
        $libelle = $vue === 'mentions' ? $p['libelle_intitule'] : $p['uo_lib'];

        // population_x/y : libellés métier de la cohorte (« entrants
        // 2021-22 », « sortants 2023 »...). Variables par millésime ;
        // exposés ici pour que le frontend puisse construire les
        // titres d'axes au format harmonisé avec Quadrant.jsx
        // (« variable à N mois (population) »). Convention :
        // chaîne vide → null pour faciliter le test d'absence côté JS.
        $popX = $p['population_x'] ?? null;
        $popY = $p['population_y'] ?? null;
        if ($popX === '') $popX = null;
        if ($popY === '') $popY = null;

        $bulle = [
            'id'                  => $id,
            'libelle'             => $libelle,
            'x'                   => round($x, 4),
            'y'                   => round($y, 4),
            'denom_x'             => $denomX,
            'denom_y'             => $denomY,
            'population_x'        => $popX,
            'population_y'        => $popY,
            'forme'               => 'rond',
            'couleur_key'         => $couleurKey,
            'details_accessibles' => $detailsAccessibles,
        ];
        if ($vue === 'mentions') {
            $bulle['dom']     = (string)($p['dom']     ?? '');
            $bulle['dom_lib'] = (string)($p['dom_lib'] ?? '');
        }
        $bulles[] = $bulle;
    }

    return [$bulles, $pointsCalculables];
}

/**
 * Calcule les axes. Vue Mentions : médiane étab + moyenne étab
 * (la moyenne nationale est ajoutée après dans le main, après
 * fetch national). Vue Établissements : médiane + moyenne.
 */
function calculerAxes(string $vue, array $pointsCalculables, array $pointsBruts): array
{
    if ($vue === 'mentions') {
        $medX = null; $medY = null;
        if (!empty($pointsCalculables)) {
            $medX = round(mediane(array_column($pointsCalculables, 'x')), 4);
            $medY = round(mediane(array_column($pointsCalculables, 'y')), 4);
        }
        $snx = 0; $sdx = 0; $sny = 0; $sdy = 0;
        foreach ($pointsBruts as $p) {
            $snx += (int)$p['num_x']; $sdx += (int)$p['denom_x'];
            $sny += (int)$p['num_y']; $sdy += (int)$p['denom_y'];
        }
        return [
            'mediane_etab_x'      => $medX,
            'mediane_etab_y'      => $medY,
            'moyenne_etab_x'      => $sdx > 0 ? round($snx / $sdx, 4) : null,
            'moyenne_etab_y'      => $sdy > 0 ? round($sny / $sdy, 4) : null,
            // moyenne_nationale ET mediane_nationale ajoutées par le main (cf. §7)
            'moyenne_nationale_x' => null,
            'moyenne_nationale_y' => null,
            'mediane_nationale_x' => null,
            'mediane_nationale_y' => null,
        ];
    }

    // Vue Établissements
    $medX = null; $medY = null; $moyX = null; $moyY = null;
    if (!empty($pointsCalculables)) {
        $medX = round(mediane(array_column($pointsCalculables, 'x')), 4);
        $medY = round(mediane(array_column($pointsCalculables, 'y')), 4);
    }
    $snx = 0; $sdx = 0; $sny = 0; $sdy = 0;
    foreach ($pointsBruts as $p) {
        $snx += (int)$p['num_x']; $sdx += (int)$p['denom_x'];
        $sny += (int)$p['num_y']; $sdy += (int)$p['denom_y'];
    }
    if ($sdx > 0) $moyX = round($snx / $sdx, 4);
    if ($sdy > 0) $moyY = round($sny / $sdy, 4);
    return [
        'mediane_x' => $medX,
        'mediane_y' => $medY,
        'moyenne_x' => $moyX,
        'moyenne_y' => $moyY,
    ];
}

function mediane(array $valeurs): float
{
    sort($valeurs);
    $n = count($valeurs);
    if ($n === 0) return 0.0;
    if ($n % 2 === 1) return (float)$valeurs[(int)($n / 2)];
    return ($valeurs[$n / 2 - 1] + $valeurs[$n / 2]) / 2;
}

function categoriserEtablissement(array $etab, string $etabContexte, array $tous): string
{
    if ($etab['id_paysage'] === $etabContexte) return 'selectionne';
    $contexte = null;
    foreach ($tous as $e) {
        if ($e['id_paysage'] === $etabContexte) { $contexte = $e; break; }
    }
    if ($contexte === null) return 'autres';
    $memeRegion    = $etab['reg_id']    === $contexte['reg_id'];
    $memeTypologie = $etab['typologie'] === $contexte['typologie'];
    if ($memeRegion && $memeTypologie) return 'meme_region_et_typologie';
    if ($memeRegion)                   return 'meme_region_autre_typologie';
    if ($memeTypologie)                return 'meme_typologie_autre_region';
    return 'autres';
}

function peutAccederDetail(array $row, string $contexteId): bool
{
    if (!isset($row['filtre_perimetre'])) return false;
    return strpos($row['filtre_perimetre'], ';' . $contexteId . ';') !== false;
}
