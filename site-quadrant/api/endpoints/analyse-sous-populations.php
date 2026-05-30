<?php
/**
 * GET /analyse-sous-populations
 *
 * Analyse fine de l'insertion d'une mention par sous-population (Phase 14).
 * Croise, pour une mention donnée (id_paysage + diplom + millesime), les
 * données de la table `stats_sous_populations` selon 4 critères :
 *   - obtention_diplome : ensemble | diplômé
 *   - genre             : ensemble | femme | homme
 *   - nationalite       : ensemble | français
 *   - regime_inscription: ensemble | apprentissage
 *
 * Toute la modale est construite autour d'une RÉFÉRENCE unifiée :
 *   diplômé / ensemble / français / ensemble.
 *
 * Paramètres (query string) :
 *  - id_paysage : 5 alphanum (établissement de la mention)
 *  - diplom     : code SIES de la mention (1-20 alphanum)
 *  - millesime  : ex '2024'
 *  - date_inser : optionnel — si fourni (6/12/18/24/30), restreint la
 *                 réponse à cette seule durée ; sinon toutes les durées
 *                 disponibles sont renvoyées (l'animation est pilotée
 *                 côté frontend).
 *
 * Headers requis : X-Connexion-Token, X-User-Token, X-Campagne-Token
 *
 * Sécurité : la mention ciblée doit être dans le périmètre du contexte
 * (filtre_perimetre LIKE %;contexte_id;%). Sinon 403, sans distinguer
 * « inexistante » de « interdite » (anti-énumération, comme /quadrant/details).
 *
 * Diffusion : le flag `diffusable` masque (taux à null) les valeurs dont
 * l'effectif est sous le seuil configuré (`analyse_sous_populations.seuil`,
 * 20 par défaut) — sur nb_etudiants pour le Taux de poursuivants, sur
 * nb_sortants pour les taux d'emploi. L'endpoint REFUSE de répondre (500)
 * si le seuil n'est pas configuré (garde-fou cohérent avec la Phase 11).
 *
 * Codes d'erreur :
 *  - 400 invalid_id_paysage / invalid_diplom / invalid_millesime / invalid_date_inser
 *  - 403 forbidden          : mention hors périmètre
 *  - 404 no_data            : aucune donnée sous-population pour cette mention
 *  - 500 config_missing     : seuil de masquage non configuré
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
// 2. Paramètres + validation
// =============================================================================

$idPaysage = $_GET['id_paysage'] ?? '';
$diplom    = $_GET['diplom']     ?? '';
$millesime = $_GET['millesime']  ?? '';
$dateInser = $_GET['date_inser'] ?? '';

if (!preg_match('/^[A-Za-z0-9]{5}$/', $idPaysage)) {
    Response::error('invalid_id_paysage', 'Paramètre id_paysage invalide (5 caractères alphanumériques attendus).');
}
if (!preg_match('/^[A-Za-z0-9]{1,20}$/', $diplom)) {
    Response::error('invalid_diplom', 'Paramètre diplom invalide (1-20 caractères alphanumériques attendus).');
}
if (!preg_match('/^\d{4}$/', $millesime)) {
    Response::error('invalid_millesime', 'Paramètre millesime invalide.');
}
$delaisAutorises = ['6', '12', '18', '24', '30'];
if ($dateInser !== '' && !in_array($dateInser, $delaisAutorises, true)) {
    Response::error('invalid_date_inser', 'Paramètre date_inser invalide (6/12/18/24/30 attendu).');
}

// =============================================================================
// 3. Config : seuil de masquage (refus explicite si absent)
// =============================================================================

$config   = require __DIR__ . '/../config/config.php';
$seuilCfg = $config['analyse_sous_populations']['seuil'] ?? null;
if ($seuilCfg === null) {
    Response::error(
        'config_missing',
        'Le seuil de masquage (analyse_sous_populations.seuil) n\'est pas configuré côté serveur.',
        500
    );
}
$seuil = (int)$seuilCfg;

// =============================================================================
// 4. Chargement des données + contrôle de périmètre
// =============================================================================
//
// Une seule requête ramène toutes les lignes de la mention (au plus
// ~120 : 24 combinaisons × 5 durées). Le filtre_perimetre LIKE gate
// l'accès : zéro ligne ⇒ 403, sans distinguer « interdite » de
// « inexistante » (anti-énumération).

$pdo           = Database::get();
$motifContexte = '%;' . $contexteId . ';%';

$sql = "
    SELECT
        date_inser,
        obtention_diplome,
        genre,
        nationalite,
        regime_inscription,
        formation,
        population,
        nb_etudiants,
        nb_poursuivants,
        nb_sortants,
        nb_sortants_emploi_sal_fr,
        nb_sortants_emploi_non_sal,
        nb_sortants_emploi_stable
    FROM stats_sous_populations
    WHERE id_paysage = :id_paysage
      AND diplom = :diplom
      AND millesime = :millesime
      AND filtre_perimetre LIKE :motif
";
$params = [
    ':id_paysage' => $idPaysage,
    ':diplom'     => $diplom,
    ':millesime'  => $millesime,
    ':motif'      => $motifContexte,
];
if ($dateInser !== '') {
    $sql .= " AND date_inser = :date_inser";
    $params[':date_inser'] = $dateInser;
}

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

if (empty($rows)) {
    // Soit hors périmètre, soit mention sans données sous-population.
    // On vérifie l'existence hors périmètre pour distinguer 403 / 404
    // tout en restant non-énumérant : si la mention existe pour
    // d'autres contextes, c'est un refus d'accès (403) ; sinon 404.
    $check = $pdo->prepare("
        SELECT 1 FROM stats_sous_populations
        WHERE id_paysage = :id_paysage AND diplom = :diplom AND millesime = :millesime
        LIMIT 1
    ");
    $check->execute([
        ':id_paysage' => $idPaysage,
        ':diplom'     => $diplom,
        ':millesime'  => $millesime,
    ]);
    if ($check->fetchColumn()) {
        Response::error('forbidden', "Vous n'êtes pas autorisé à consulter l'analyse de cette mention.", 403);
    }
    Response::error('no_data', "Aucune donnée de sous-population pour cette mention.", 404);
}

// =============================================================================
// 5. Indexation des lignes par (durée, clé de sous-population)
// =============================================================================

$formation = (string)$rows[0]['formation'];
$population = (string)($rows[0]['population'] ?? '');

// Index : $parDuree[date_inser][cle] = row, où cle = od|genre|nat|reg
$parDuree = [];
foreach ($rows as $r) {
    $d   = (string)$r['date_inser'];
    $cle = cleSousPopulation(
        $r['obtention_diplome'],
        $r['genre'],
        $r['nationalite'],
        $r['regime_inscription']
    );
    $parDuree[$d][$cle] = $r;
}

$dureesDisponibles = array_keys($parDuree);
usort($dureesDisponibles, static fn($a, $b) => (int)$a <=> (int)$b);

// =============================================================================
// 6. Définition des sous-populations (référence + 7 déclinaisons)
// =============================================================================
//
// L'ordre est l'ordre d'affichage du tableau. `croisement` marque les
// croisements genre×régime, masqués par le toggle « croisements simples »
// côté frontend.

$DEFINITIONS = [
    [
        'id' => 'reference', 'libelle' => 'Diplômés français', 'critere' => 'reference',
        'croisement' => false,
        'od' => 'diplômé', 'genre' => 'ensemble', 'nat' => 'français', 'reg' => 'ensemble',
    ],
    [
        'id' => 'femmes', 'libelle' => 'Femmes diplômées françaises', 'critere' => 'genre',
        'croisement' => false,
        'od' => 'diplômé', 'genre' => 'femme', 'nat' => 'français', 'reg' => 'ensemble',
    ],
    [
        'id' => 'hommes', 'libelle' => 'Hommes diplômés français', 'critere' => 'genre',
        'croisement' => false,
        'od' => 'diplômé', 'genre' => 'homme', 'nat' => 'français', 'reg' => 'ensemble',
    ],
    [
        'id' => 'apprentis', 'libelle' => 'Apprentis diplômés français', 'critere' => 'regime',
        'croisement' => false,
        'od' => 'diplômé', 'genre' => 'ensemble', 'nat' => 'français', 'reg' => 'apprentissage',
    ],
    [
        'id' => 'femmes_apprenties', 'libelle' => 'Femmes diplômées françaises en apprentissage', 'critere' => 'genre+regime',
        'croisement' => true,
        'od' => 'diplômé', 'genre' => 'femme', 'nat' => 'français', 'reg' => 'apprentissage',
    ],
    [
        'id' => 'hommes_apprentis', 'libelle' => 'Hommes diplômés français en apprentissage', 'critere' => 'genre+regime',
        'croisement' => true,
        'od' => 'diplômé', 'genre' => 'homme', 'nat' => 'français', 'reg' => 'apprentissage',
    ],
    [
        // obtention_diplome='ensemble' = diplômés + non-diplômés ;
        // nationalité=français. Vs la référence (diplômés seuls), c'est
        // l'effet de la diplomation à nationalité constante.
        'id' => 'ensemble_diplomation', 'libelle' => 'Diplômés et non diplômés français', 'critere' => 'diplomation',
        'croisement' => false,
        'od' => 'ensemble', 'genre' => 'ensemble', 'nat' => 'français', 'reg' => 'ensemble',
    ],
    [
        // nationalité='ensemble' = français + étrangers ; diplômés.
        // Vs la référence (français seuls), c'est l'effet nationalité.
        'id' => 'tous_nationalite', 'libelle' => 'Diplômés français et étrangers', 'critere' => 'nationalite',
        'croisement' => false,
        'od' => 'diplômé', 'genre' => 'ensemble', 'nat' => 'ensemble', 'reg' => 'ensemble',
    ],
];

// =============================================================================
// 7. Construction de donnees_par_duree
// =============================================================================

$donneesParDuree = [];
foreach ($dureesDisponibles as $d) {
    $index = $parDuree[$d];

    // Référence de la durée (sert de base aux écarts).
    $refRow = $index[cleSousPopulation('diplômé', 'ensemble', 'français', 'ensemble')] ?? null;
    $reference = construireIndicateurs($refRow, $seuil);

    // Sous-populations (tout sauf la référence elle-même).
    $sousPopulations = [];
    foreach ($DEFINITIONS as $def) {
        if ($def['id'] === 'reference') {
            continue;
        }
        $row  = $index[cleSousPopulation($def['od'], $def['genre'], $def['nat'], $def['reg'])] ?? null;
        $ind  = construireIndicateurs($row, $seuil);

        $sousPopulations[] = [
            'id'                 => $def['id'],
            'libelle'            => $def['libelle'],
            'critere'            => $def['critere'],
            'croisement'         => $def['croisement'],
            'present'            => $row !== null,
            'criteres_techniques' => [
                'obtention_diplome'  => $def['od'],
                'genre'              => $def['genre'],
                'nationalite'        => $def['nat'],
                'regime_inscription' => $def['reg'],
            ],
            'nb_etudiants'       => $ind['nb_etudiants'],
            'nb_poursuivants'    => $ind['nb_poursuivants'],
            'nb_sortants'        => $ind['nb_sortants'],
            'taux_poursuivants'  => $ind['taux_poursuivants'],
            'taux_emploi_sal_fr' => $ind['taux_emploi_sal_fr'],
            'taux_emploi_non_sal' => $ind['taux_emploi_non_sal'],
            'taux_emploi_stable' => $ind['taux_emploi_stable'],
            'diffusable'         => $ind['diffusable'],
            'ecart_taux_poursuivants'  => ecart($ind['taux_poursuivants'],  $reference['taux_poursuivants']),
            'ecart_taux_emploi_sal_fr' => ecart($ind['taux_emploi_sal_fr'], $reference['taux_emploi_sal_fr']),
            'ecart_taux_emploi_non_sal' => ecart($ind['taux_emploi_non_sal'], $reference['taux_emploi_non_sal']),
            'ecart_taux_emploi_stable' => ecart($ind['taux_emploi_stable'], $reference['taux_emploi_stable']),
        ];
    }

    $donneesParDuree[$d] = [
        'reference'        => $reference,
        'sous_populations' => $sousPopulations,
    ];
}

// =============================================================================
// 8. Répartitions structurelles (indépendantes de date_inser)
// =============================================================================
//
// La composition de la promotion (genre, nationalité, régime, devenir)
// ne dépend pas de la durée d'observation : nb_etudiants / nb_poursuivants
// / nb_sortants sont constants entre durées (vérifié en BDD). On calcule
// donc les répartitions sur la première durée disponible.

$repartitions = construireRepartitions($parDuree[$dureesDisponibles[0]], $seuil);

// =============================================================================
// 9. Identité de la mention (libellés depuis stats_quadrant)
// =============================================================================

$identite = chargerIdentiteMention($pdo, $idPaysage, $diplom, $millesime);

// Total des inscrits en année terminale (ensemble/ensemble/ensemble/ensemble) :
// toutes obtentions, tous genres, toutes nationalités, tous régimes. Sert au
// cartouche de la modale (« N total » + % de la référence). Date-indépendant
// → lu sur la première durée. null si la ligne n'est pas présente (mentions
// à données partielles) → le frontend retombe sur l'affichage sans total.
$rowTotal = $parDuree[$dureesDisponibles[0]][cleSousPopulation('ensemble', 'ensemble', 'ensemble', 'ensemble')] ?? null;
$nbTotalInscrits = $rowTotal && $rowTotal['nb_etudiants'] !== null ? (int)$rowTotal['nb_etudiants'] : null;

// =============================================================================
// 10. Réponse
// =============================================================================

Response::json([
    'contexte' => [
        'id_paysage'        => $idPaysage,
        'diplom'            => $diplom,
        'formation'         => $formation,
        'libelle_intitule'  => $identite['libelle_intitule'],
        'uo_lib'            => $identite['uo_lib'],
        'millesime'         => $millesime,
        'population'        => $population,
        'seuil_applique'    => $seuil,
        'nb_total_inscrits' => $nbTotalInscrits,
    ],
    'durees_disponibles' => $dureesDisponibles,
    'donnees_par_duree'  => $donneesParDuree,
    'repartitions'       => $repartitions,
]);


// =============================================================================
// Fonctions auxiliaires
// =============================================================================

/**
 * Clé d'indexation stable d'une sous-population (4 critères).
 */
function cleSousPopulation(string $od, string $genre, string $nat, string $reg): string
{
    return $od . '|' . $genre . '|' . $nat . '|' . $reg;
}

/**
 * Construit le bloc d'indicateurs (effectifs + taux + diffusable) à
 * partir d'une ligne BDD (ou null si la sous-population est absente).
 *
 *  - taux_poursuivants  = nb_poursuivants / nb_etudiants (masqué si
 *    nb_etudiants < seuil)
 *  - taux_emploi_*      = nb_sortants_emploi_* / nb_sortants (masqué si
 *    nb_sortants < seuil)
 *  - diffusable         = nb_etudiants >= seuil (drapeau d'ensemble de
 *    la ligne, centré entrants)
 *
 * Une ligne absente renvoie des effectifs/taux à null et diffusable=false.
 */
function construireIndicateurs(?array $row, int $seuil): array
{
    if ($row === null) {
        return [
            'nb_etudiants'       => null,
            'nb_poursuivants'    => null,
            'nb_sortants'        => null,
            'taux_poursuivants'  => null,
            'taux_emploi_sal_fr' => null,
            'taux_emploi_non_sal' => null,
            'taux_emploi_stable' => null,
            'diffusable'         => false,
        ];
    }

    $nbEtudiants = $row['nb_etudiants']    !== null ? (int)$row['nb_etudiants']    : 0;
    $nbPours     = $row['nb_poursuivants'] !== null ? (int)$row['nb_poursuivants'] : 0;
    $nbSortants  = $row['nb_sortants']     !== null ? (int)$row['nb_sortants']     : 0;
    $nbSalFr     = $row['nb_sortants_emploi_sal_fr']  !== null ? (int)$row['nb_sortants_emploi_sal_fr']  : 0;
    $nbNonSal    = $row['nb_sortants_emploi_non_sal'] !== null ? (int)$row['nb_sortants_emploi_non_sal'] : 0;
    $nbStable    = $row['nb_sortants_emploi_stable']  !== null ? (int)$row['nb_sortants_emploi_stable']  : 0;

    $diffusableEntrants = $nbEtudiants >= $seuil;
    $diffusableSortants = $nbSortants  >= $seuil;

    return [
        'nb_etudiants'       => $nbEtudiants,
        'nb_poursuivants'    => $nbPours,
        'nb_sortants'        => $nbSortants,
        'taux_poursuivants'  => $diffusableEntrants && $nbEtudiants > 0 ? round($nbPours / $nbEtudiants, 3) : null,
        'taux_emploi_sal_fr' => $diffusableSortants && $nbSortants > 0 ? round($nbSalFr / $nbSortants, 3) : null,
        'taux_emploi_non_sal' => $diffusableSortants && $nbSortants > 0 ? round($nbNonSal / $nbSortants, 3) : null,
        'taux_emploi_stable' => $diffusableSortants && $nbSortants > 0 ? round($nbStable / $nbSortants, 3) : null,
        'diffusable'         => $diffusableEntrants,
    ];
}

/**
 * Écart simple (sous-population − référence) en points de taux, arrondi
 * à 3 décimales. null si l'une des deux valeurs est masquée/absente.
 */
function ecart(?float $valeur, ?float $reference): ?float
{
    if ($valeur === null || $reference === null) {
        return null;
    }
    return round($valeur - $reference, 3);
}

/**
 * Répartitions structurelles de la promotion (proportions 0..1).
 *
 *  - genre        : femmes / hommes parmi diplômés français
 *  - nationalite  : français / étrangers parmi diplômés (étrangers par
 *                   soustraction tous − français)
 *  - regime       : apprentis / non-apprentis parmi diplômés français
 *                   (non-apprentis par soustraction)
 *  - devenir_promo: décompose la promotion COMPLÈTE (toutes nationalités,
 *                   obtention ensemble) en poursuivants/sortants ×
 *                   diplômés/non-diplômés
 *
 * Chaque segment dont l'effectif est sous le seuil est listé dans
 * `_sous_seuil` (clés « groupe.segment ») pour l'affichage grisé/hachuré.
 */
function construireRepartitions(array $index, int $seuil): array
{
    $get = static function (string $od, string $genre, string $nat, string $reg) use ($index): ?array {
        return $index[cleSousPopulation($od, $genre, $nat, $reg)] ?? null;
    };
    $ne = static function (?array $r): int {
        return $r !== null && $r['nb_etudiants'] !== null ? (int)$r['nb_etudiants'] : 0;
    };
    $champ = static function (?array $r, string $c): int {
        return $r !== null && $r[$c] !== null ? (int)$r[$c] : 0;
    };

    $sousSeuil = [];
    $part = static function (int $num, int $denom): float {
        return $denom > 0 ? round($num / $denom, 4) : 0.0;
    };

    // --- Genre (parmi diplômés français) ---
    $femmes  = $ne($get('diplômé', 'femme', 'français', 'ensemble'));
    $hommes  = $ne($get('diplômé', 'homme', 'français', 'ensemble'));
    $totGenre = $femmes + $hommes;
    if ($femmes > 0 && $femmes < $seuil) { $sousSeuil[] = 'genre.femmes'; }
    if ($hommes > 0 && $hommes < $seuil) { $sousSeuil[] = 'genre.hommes'; }

    // --- Nationalité (parmi diplômés) ---
    $francais  = $ne($get('diplômé', 'ensemble', 'français', 'ensemble'));
    $tousNat   = $ne($get('diplômé', 'ensemble', 'ensemble', 'ensemble'));
    $etrangers = max(0, $tousNat - $francais);
    if ($etrangers > 0 && $etrangers < $seuil) { $sousSeuil[] = 'nationalite.etrangers'; }

    // --- Régime (parmi diplômés français) ---
    $apprentis    = $ne($get('diplômé', 'ensemble', 'français', 'apprentissage'));
    $nonApprentis = max(0, $francais - $apprentis);
    if ($apprentis > 0 && $apprentis < $seuil) { $sousSeuil[] = 'regime.apprentis'; }

    // --- Devenir de la promotion complète (toutes nationalités) ---
    $promo     = $get('ensemble', 'ensemble', 'ensemble', 'ensemble');
    $diplomes  = $get('diplômé', 'ensemble', 'ensemble', 'ensemble');
    $basePromo = $ne($promo);
    $poursDip  = $champ($diplomes, 'nb_poursuivants');
    $sortDip   = $champ($diplomes, 'nb_sortants');
    $poursTot  = $champ($promo, 'nb_poursuivants');
    $sortTot   = $champ($promo, 'nb_sortants');
    $poursNonDip = max(0, $poursTot - $poursDip);
    $sortNonDip  = max(0, $sortTot  - $sortDip);

    return [
        'genre' => [
            'femmes' => $part($femmes, $totGenre),
            'hommes' => $part($hommes, $totGenre),
        ],
        'nationalite' => [
            'francais'  => $part($francais, $tousNat),
            'etrangers' => $part($etrangers, $tousNat),
        ],
        'regime' => [
            'apprentis'     => $part($apprentis, $francais),
            'non_apprentis' => $part($nonApprentis, $francais),
        ],
        'devenir_promo' => [
            'poursuivants_diplomes'     => $part($poursDip, $basePromo),
            'poursuivants_non_diplomes' => $part($poursNonDip, $basePromo),
            'sortants_diplomes'         => $part($sortDip, $basePromo),
            'sortants_non_diplomes'     => $part($sortNonDip, $basePromo),
        ],
        '_sous_seuil' => $sousSeuil,
    ];
}

/**
 * Libellés de la mention et de l'établissement, lus dans stats_quadrant
 * (la table stats_sous_populations ne porte pas d'intitulé). L'accès a
 * déjà été autorisé en amont, pas de filtre_perimetre ici.
 */
function chargerIdentiteMention(PDO $pdo, string $idPaysage, string $diplom, string $millesime): array
{
    $stmt = $pdo->prepare("
        SELECT libelle_intitule, uo_lib
        FROM stats_quadrant
        WHERE id_paysage = :id AND diplom = :diplom AND millesime = :millesime
        LIMIT 1
    ");
    $stmt->execute([
        ':id'        => $idPaysage,
        ':diplom'    => $diplom,
        ':millesime' => $millesime,
    ]);
    $row = $stmt->fetch();

    return [
        'libelle_intitule' => $row && $row['libelle_intitule'] !== null ? (string)$row['libelle_intitule'] : '',
        'uo_lib'           => $row && $row['uo_lib'] !== null ? (string)$row['uo_lib'] : '',
    ];
}
