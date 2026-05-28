<?php
/**
 * GET /quadrant/details
 *
 * Détail enrichi affiché au clic sur une bulle dans le quadrant.
 * Renvoie l'identité de la bulle, les valeurs des indicateurs pour le
 * millésime courant, et l'historique sur tous les millésimes disponibles.
 *
 * Paramètres (query string) :
 *  - vue           : 'mentions' | 'etablissements'
 *  - formation     : 'Licence générale' | 'Licence professionnelle' | 'Bachelor universitaire de technologie' | 'Master'
 *  - millesime     : ex '2023' (millésime affiché à l'écran)
 *  - target_id     : identifiant de la bulle cliquée :
 *                    - vue=mentions       → diplom (1-20 alphanum)
 *                    - vue=etablissements → id_paysage (5 alphanum)
 *  - etab_contexte : id_paysage de l'établissement de référence
 *                    (obligatoire en vue=etablissements ; en vue=mentions
 *                     fallback sur le contexte_id si absent)
 *  - mention       : optionnel (vue=etablissements uniquement) — diplom de la
 *                    mention en cours de filtrage à l'écran. Quand présent,
 *                    les données renvoyées portent sur cette seule mention.
 *
 * Headers requis : X-Connexion-Token, X-User-Token, X-Campagne-Token
 *
 * Codes d'erreur :
 *  - 400 invalid_vue / invalid_formation / invalid_millesime / invalid_target_id
 *        / missing_etab_contexte / invalid_etab_contexte / invalid_mention
 *  - 403 forbidden            : la bulle n'est pas dans le périmètre du contexte
 *  - 429 rate_limited         : > 30 appels/min pour ce contexte_id sur cet endpoint
 *  - 500 cursus_incoherent    : matrice vide pour ce cursus dans dim_indicateur_cursus
 *
 * Diffusion : les indicateurs dont denom < 5 sont exposés (indicateur,
 * date_inser, denominateur) mais numerateur et taux sont à null avec un
 * drapeau non_diffusable=true. Cohérent avec les règles de diffusion
 * appliquées aux bulles du quadrant.
 */

require_once __DIR__ . '/../lib/Database.php';
require_once __DIR__ . '/../lib/Response.php';
require_once __DIR__ . '/../lib/Session.php';
require_once __DIR__ . '/../lib/Diffusion.php';
require_once __DIR__ . '/../lib/RateLimit.php';

Response::cors();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('method_not_allowed', 'Seul GET est autorisé sur cet endpoint.', 405);
}

// =============================================================================
// 1. Validation de la session
// =============================================================================

$session = new Session();
$contexteId = $session->getContexteId();

// =============================================================================
// 2. Rate limiting (30 appels par minute, par contexte_id)
// =============================================================================

$rl = RateLimit::check('quadrant_details:' . $contexteId, 30);
if (!$rl['allowed']) {
    header('Retry-After: ' . $rl['retry_after_seconds']);
    Response::json([
        'error'               => 'rate_limited',
        'message'             => "Trop de requêtes sur /quadrant/details. Réessayez dans {$rl['retry_after_seconds']} seconde(s).",
        'retry_after_seconds' => $rl['retry_after_seconds'],
    ], 429);
}

// =============================================================================
// 3. Lecture et validation des paramètres
// =============================================================================

$vue          = $_GET['vue']           ?? '';
$formation    = $_GET['formation']     ?? '';
$millesime    = $_GET['millesime']     ?? '';
$targetId     = $_GET['target_id']     ?? '';
$etabContexte = $_GET['etab_contexte'] ?? '';
$mention      = $_GET['mention']       ?? '';
$forExport    = !empty($_GET['for_export']);

// Seuil de diffusion appliqué sur les valeurs courantes/historiques.
//   - Affichage écran : Diffusion::SEUIL_DIFFUSION (5).
//   - Export Word     : `exports.seuil_diffusable` (20 par défaut),
//                       déclenché par ?for_export=1. Plus strict —
//                       cohérent avec /quadrant.
$seuilDetails = (function () {
    $cfg = require __DIR__ . '/../config/config.php';
    return (int)($cfg['exports']['seuil_diffusable'] ?? 20);
})();

if (!in_array($vue, ['mentions', 'etablissements'], true)) {
    Response::error('invalid_vue', 'Paramètre vue invalide.');
}

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

// target_id : format différent selon la vue.
if ($vue === 'mentions') {
    if (!preg_match('/^[A-Za-z0-9]{1,20}$/', $targetId)) {
        Response::error('invalid_target_id', 'Paramètre target_id invalide pour vue=mentions (diplom attendu, 1-20 caractères alphanumériques).');
    }
} else {
    if (!preg_match('/^[A-Za-z0-9]{5}$/', $targetId)) {
        Response::error('invalid_target_id', 'Paramètre target_id invalide pour vue=etablissements (id_paysage attendu, 5 caractères alphanumériques).');
    }
}

// etab_contexte : obligatoire en vue=etablissements ; fallback sur contexte_id
// en vue=mentions s'il n'est pas fourni.
if ($vue === 'etablissements') {
    if ($etabContexte === '') {
        Response::error('missing_etab_contexte', 'Paramètre etab_contexte requis en vue=etablissements.');
    }
    if (!preg_match('/^[A-Za-z0-9]{5}$/', $etabContexte)) {
        Response::error('invalid_etab_contexte', 'Paramètre etab_contexte invalide (5 caractères alphanumériques attendus).');
    }
} else {
    if ($etabContexte !== '' && !preg_match('/^[A-Za-z0-9]{5}$/', $etabContexte)) {
        Response::error('invalid_etab_contexte', 'Paramètre etab_contexte invalide (5 caractères alphanumériques attendus).');
    }
    if ($etabContexte === '') {
        $etabContexte = $contexteId;
    }
}

// mention : valide uniquement en vue=etablissements ; silencieusement
// neutralisé sinon (cohérent avec /quadrant).
if ($mention !== '' && !preg_match('/^[A-Za-z0-9]{1,20}$/', $mention)) {
    Response::error('invalid_mention', 'Paramètre mention invalide.');
}
if ($vue !== 'etablissements') {
    $mention = '';
}

// =============================================================================
// 4. Vérification d'autorisation et chargement de l'identité
// =============================================================================
//
// On charge une ligne de stats_quadrant qui prouve à la fois l'existence du
// target_id ET le fait que le contexte_id de l'utilisateur a le droit de le
// consulter (via filtre_perimetre LIKE %;contexte_id;%). Si la requête ne
// renvoie rien : 403 sans distinguer « inexistant » de « interdit » pour ne
// pas faciliter l'énumération.

$motifContexte = '%;' . $contexteId . ';%';
$pdo = Database::get();

if ($vue === 'mentions') {
    $stmt = $pdo->prepare("
        SELECT diplom, libelle_intitule, secteur_disciplinaire_quadrant
        FROM stats_quadrant
        WHERE diplom = :diplom
          AND id_paysage = :etab
          AND filtre_perimetre LIKE :motif
        LIMIT 1
    ");
    $stmt->execute([
        ':diplom' => $targetId,
        ':etab'   => $etabContexte,
        ':motif'  => $motifContexte,
    ]);
    $row = $stmt->fetch();
    if (!$row) {
        Response::error('forbidden', "Vous n'êtes pas autorisé à consulter le détail de cette mention.", 403);
    }
    $identite = [
        'diplom'  => (string)$row['diplom'],
        'libelle' => (string)($row['libelle_intitule'] ?? ''),
        'secteur' => (string)($row['secteur_disciplinaire_quadrant'] ?? ''),
    ];
} else {
    $stmt = $pdo->prepare("
        SELECT id_paysage, uo_lib, reg_id, reg_nom,
               typologie_d_universites_et_assimiles AS typologie
        FROM stats_quadrant
        WHERE id_paysage = :id
          AND filtre_perimetre LIKE :motif
        LIMIT 1
    ");
    $stmt->execute([
        ':id'    => $targetId,
        ':motif' => $motifContexte,
    ]);
    $row = $stmt->fetch();
    if (!$row) {
        Response::error('forbidden', "Vous n'êtes pas autorisé à consulter le détail de cet établissement.", 403);
    }
    $regCode    = (string)($row['reg_id']  ?? '');
    $regLibelle = $row['reg_nom'] !== null && $row['reg_nom'] !== '' ? (string)$row['reg_nom'] : $regCode;
    $identite = [
        'id_paysage' => (string)$row['id_paysage'],
        'uo_lib'     => (string)($row['uo_lib'] ?? ''),
        'region'     => ['code' => $regCode, 'libelle' => $regLibelle],
        'typologie'  => (string)($row['typologie'] ?? ''),
    ];
}

// =============================================================================
// 5. Référentiel des indicateurs autorisés pour ce cursus
// =============================================================================

$indicateursReferentiel = chargerIndicateursCursusDetails($formation);
if (empty($indicateursReferentiel)) {
    Response::error(
        'cursus_incoherent',
        "Aucun indicateur défini pour le cursus « $formation » dans dim_indicateur_cursus.",
        500
    );
}

// Liste canonique des tuples (indicateur, date_inser) attendus, déduite du
// référentiel : un indicateur non déclinable produit un seul tuple
// (indicateur, ''), un indicateur déclinable produit 5 tuples (un par délai).
$canonique = listeCanoniqueIndicateurs($indicateursReferentiel);

// =============================================================================
// 6. Données courantes (millésime actuel)
// =============================================================================

$rowsCourant = chargerDonneesBrutes(
    $pdo, $vue, $targetId, $etabContexte, $mention,
    $formation, $millesime
);
// Seuil effectif : si on est en mode export (for_export=1), on
// applique le seuil plus strict configuré (seuil_diffusable), sinon
// le seuil standard d'affichage (Diffusion::SEUIL_DIFFUSION = 5).
$seuilEffectif = $forExport ? $seuilDetails : Diffusion::SEUIL_DIFFUSION;

$donneesCourantes = normaliserDonnees($canonique, $rowsCourant, $seuilEffectif);

// =============================================================================
// 7. Historique (tous les millésimes disponibles, ordre chronologique)
// =============================================================================

$rowsHistorique = chargerDonneesBrutes(
    $pdo, $vue, $targetId, $etabContexte, $mention,
    $formation, null /* tous millésimes */
);

// Bucket par millésime, puis on normalise chaque seau avec la liste canonique.
$parMillesime = [];
foreach ($rowsHistorique as $r) {
    $parMillesime[(string)$r['millesime']][] = $r;
}
ksort($parMillesime);

$historique = [];
foreach ($parMillesime as $m => $rows) {
    $historique[] = [
        'millesime' => $m,
        'donnees'   => normaliserDonnees($canonique, $rows, $seuilEffectif),
    ];
}

// =============================================================================
// 8. Réponse
// =============================================================================

$filtresActifs = [
    'formation' => $formation,
    'millesime' => $millesime,
];
if ($mention !== '') {
    $filtresActifs['mention_filtre'] = $mention;
}

Response::json([
    'type'              => $vue === 'mentions' ? 'mention' : 'etablissement',
    'identite'          => $identite,
    'filtres_actifs'    => $filtresActifs,
    'donnees_courantes' => $donneesCourantes,
    'historique'        => $historique,
]);


// =============================================================================
// Fonctions auxiliaires
// =============================================================================

/**
 * Charge la matrice cursus × indicateur depuis dim_indicateur_cursus.
 * Variante locale (mêmes données qu'en quadrant.php) : on évite la dépendance
 * inter-endpoints. À factoriser dans une lib si réutilisé ailleurs.
 */
function chargerIndicateursCursusDetails(string $formation): array
{
    $stmt = Database::get()->prepare("
        SELECT indicateur, ordre, declinable_delai
        FROM dim_indicateur_cursus
        WHERE formation = :formation
        ORDER BY ordre
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
 * Liste canonique des tuples (indicateur, date_inser) attendus pour un cursus,
 * dans l'ordre canonique de dim_indicateur_cursus. Un indicateur déclinable
 * produit cinq tuples (6/12/18/24/30), un non-déclinable un seul tuple ('').
 */
function listeCanoniqueIndicateurs(array $referentiel): array
{
    $delais = ['6', '12', '18', '24', '30'];
    $tuples = [];
    foreach ($referentiel as $indicateur => $info) {
        if ($info['declinable_delai']) {
            foreach ($delais as $d) {
                $tuples[] = ['indicateur' => $indicateur, 'date_inser' => $d];
            }
        } else {
            $tuples[] = ['indicateur' => $indicateur, 'date_inser' => ''];
        }
    }
    return $tuples;
}

/**
 * Charge les données brutes de stats_quadrant pour la bulle cible.
 *
 *  - vue=mentions          : filtre par diplom + id_paysage (etab_contexte)
 *  - vue=etablissements
 *      sans mention        : agrège par établissement (SUM num/denom)
 *      avec mention        : filtre par id_paysage + diplom, pas d'agrégation
 *
 * Si $millesime est null, on charge tous les millésimes (pour l'historique).
 * Sinon on cible un millésime précis (pour les données courantes).
 *
 * Renvoie une liste de lignes avec les clés :
 *   millesime, indicateur, date_inser, numerateur, denominateur
 */
function chargerDonneesBrutes(
    PDO $pdo,
    string $vue,
    string $targetId,
    string $etabContexte,
    string $mention,
    string $formation,
    ?string $millesime
): array {
    $params = [
        ':formation' => $formation,
    ];
    $conditions = ['formation = :formation'];

    if ($vue === 'mentions') {
        $conditions[] = 'diplom = :diplom';
        $conditions[] = 'id_paysage = :etab';
        $params[':diplom'] = $targetId;
        $params[':etab']   = $etabContexte;
    } elseif ($mention !== '') {
        // vue=etablissements avec filtre mention : une mention pour un étab.
        $conditions[] = 'id_paysage = :id';
        $conditions[] = 'diplom = :mention';
        $params[':id']      = $targetId;
        $params[':mention'] = $mention;
    } else {
        // vue=etablissements sans filtre mention : agrégat sur toutes les mentions.
        $conditions[] = 'id_paysage = :id';
        $params[':id'] = $targetId;
    }

    if ($millesime !== null) {
        $conditions[] = 'millesime = :millesime';
        $params[':millesime'] = $millesime;
    }

    $where = implode(' AND ', $conditions);

    $agrege = ($vue === 'etablissements' && $mention === '');

    if ($agrege) {
        // Agrégation par établissement : on somme num et denom à travers les
        // mentions, par (millesime, indicateur, date_inser).
        $sql = "
            SELECT
                millesime,
                indicateur,
                date_inser,
                SUM(numerateur)   AS numerateur,
                SUM(denominateur) AS denominateur
            FROM stats_quadrant
            WHERE $where
            GROUP BY millesime, indicateur, date_inser
            ORDER BY millesime, indicateur, date_inser
        ";
    } else {
        $sql = "
            SELECT
                millesime,
                indicateur,
                date_inser,
                numerateur,
                denominateur
            FROM stats_quadrant
            WHERE $where
            ORDER BY millesime, indicateur, date_inser
        ";
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

/**
 * Normalise une liste de lignes BDD par rapport à la liste canonique des
 * tuples (indicateur, date_inser) attendus pour le cursus.
 *
 *  - Pour chaque tuple canonique présent en BDD :
 *      - denom < SEUIL_DIFFUSION → numerateur=null, taux=null, non_diffusable=true
 *      - sinon                   → taux = round(num/denom*100, 1)
 *  - Pour chaque tuple canonique absent en BDD : ligne avec num=null,
 *    denom=null, taux=null (la structure de réponse reste stable pour le frontend).
 *
 * Renvoie la liste dans l'ordre du référentiel.
 */
function normaliserDonnees(array $canonique, array $rowsBdd, int $seuil = null): array
{
    // Seuil effectif : laisse l'appelant le surdéfinir (mode export
    // → seuil_diffusable plus strict). Défaut = seuil d'affichage
    // standard.
    if ($seuil === null) {
        $seuil = Diffusion::SEUIL_DIFFUSION;
    }
    // Index des lignes BDD par (indicateur, date_inser) pour lookup O(1).
    $index = [];
    foreach ($rowsBdd as $r) {
        $cle = $r['indicateur'] . '|' . ($r['date_inser'] ?? '');
        $index[$cle] = $r;
    }

    $resultat = [];
    foreach ($canonique as $tuple) {
        $cle = $tuple['indicateur'] . '|' . $tuple['date_inser'];

        if (!isset($index[$cle])) {
            $resultat[] = [
                'indicateur'   => $tuple['indicateur'],
                'date_inser'   => $tuple['date_inser'],
                'numerateur'   => null,
                'denominateur' => null,
                'taux'         => null,
            ];
            continue;
        }

        $r     = $index[$cle];
        $denom = $r['denominateur'] !== null ? (int)$r['denominateur'] : null;
        $num   = $r['numerateur']   !== null ? (int)$r['numerateur']   : null;

        if ($denom === null || $denom <= 0) {
            // Cas « cohorte non observable » : numerateur ET
            // denominateur tous deux absents ou nuls. Le source SIES
            // encode régulièrement ainsi les tuples (mention, indicateur,
            // millésime) qui ne sont pas encore mesurables — un
            // « Taux de réussite en 4 ans » sur une cohorte trop récente,
            // un « emploi à 30 mois » dont l'enquête n'a pas eu lieu,
            // une mention créée après le millésime — plutôt que d'omettre
            // la row du fichier source. Côté frontend, conserver
            // `denominateur = 0` ferait apparaître un faux 0 sur le
            // graphe d'effectifs là où le graphe % a un trou.
            // On efface donc TOTALEMENT l'observation : cohérence
            // visuelle entre les deux graphes (un trou des deux côtés).
            //
            // Cas exotique num != null mais denom invalide (donnée
            // source incohérente) : on conserve la structure historique
            // (num masqué, denom préservé tel quel) pour ne pas écraser
            // un signal de qualité de données.
            $absenceObservation = ($num === null);
            $resultat[] = [
                'indicateur'   => $tuple['indicateur'],
                'date_inser'   => $tuple['date_inser'],
                'numerateur'   => null,
                'denominateur' => $absenceObservation ? null : $denom,
                'taux'         => null,
            ];
            continue;
        }

        if ($denom < $seuil) {
            // Sous le seuil : on conserve le denom (information sur la taille
            // de la population) mais on masque le numerateur et le taux.
            $resultat[] = [
                'indicateur'      => $tuple['indicateur'],
                'date_inser'      => $tuple['date_inser'],
                'numerateur'      => null,
                'denominateur'    => $denom,
                'taux'            => null,
                'non_diffusable'  => true,
            ];
            continue;
        }

        $resultat[] = [
            'indicateur'   => $tuple['indicateur'],
            'date_inser'   => $tuple['date_inser'],
            'numerateur'   => $num,
            'denominateur' => $denom,
            'taux'         => $num !== null ? round($num / $denom * 100, 1) : null,
        ];
    }

    return $resultat;
}
