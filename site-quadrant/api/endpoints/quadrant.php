<?php
/**
 * GET /quadrant
 *
 * Renvoie les données nécessaires pour dessiner un quadrant complet :
 *  - les bulles à afficher (avec position, taille, forme, couleur)
 *  - les médianes ou moyennes à tracer
 *  - la liste des mentions non représentées (si vue=mentions)
 *
 * Paramètres (query string) :
 *  - formation         : 'Licence générale' | 'Licence professionnelle' | 'Bachelor universitaire de technologie' | 'Master'
 *  - vue               : 'mentions' | 'etablissements'
 *  - millesime         : ex '2023'
 *  - var1              : libellé indicateur axe X
 *  - var2              : libellé indicateur axe Y
 *  - date_inser_var1   : optionnel, vide si non déclinable
 *  - date_inser_var2   : optionnel, vide si non déclinable
 *  - dom               : optionnel, code grand domaine
 *  - discipli          : optionnel, code discipline
 *  - secteur           : optionnel, secteur quadrant
 *  - master            : optionnel, 'Master enseignement' | 'Master hors enseignement'
 *  - etab_contexte     : id_paysage de l'établissement sélectionné
 *  - representativite  : 'toutes' (défaut) | 'representatif'
 *  - agregation        : 'mediane' (défaut) | 'moyenne'
 *
 * Headers requis : X-Connexion-Token, X-User-Token, X-Campagne-Token
 */

require_once __DIR__ . '/../lib/Database.php';
require_once __DIR__ . '/../lib/Response.php';
require_once __DIR__ . '/../lib/Session.php';
require_once __DIR__ . '/../lib/Diffusion.php';

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

$formation        = $_GET['formation']        ?? '';
$vue              = $_GET['vue']              ?? '';
$millesime        = $_GET['millesime']        ?? '';
$var1             = $_GET['var1']             ?? '';
$var2             = $_GET['var2']             ?? '';
$dateInserVar1    = $_GET['date_inser_var1']  ?? '';
$dateInserVar2    = $_GET['date_inser_var2']  ?? '';
$dom              = $_GET['dom']              ?? '';
$discipli         = $_GET['discipli']         ?? '';
$secteur          = $_GET['secteur']          ?? '';
$master           = $_GET['master']           ?? '';
$etabContexte     = $_GET['etab_contexte']    ?? '';
$representativite = $_GET['representativite'] ?? 'toutes';
$agregation       = $_GET['agregation']       ?? 'mediane';

// Validations basiques
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
if (!preg_match('/^\d{4}$/', $millesime)) {
    Response::error('invalid_millesime', 'Paramètre millesime invalide.');
}
if ($var1 === '' || $var2 === '' || $var1 === $var2) {
    Response::error('invalid_variables', 'Les deux variables doivent être renseignées et différentes.');
}
if (!in_array($agregation, ['mediane', 'moyenne'], true)) {
    Response::error('invalid_agregation', 'Paramètre agregation invalide.');
}
if (!in_array($representativite, ['toutes', 'representatif'], true)) {
    Response::error('invalid_representativite', 'Paramètre representativite invalide.');
}

// =============================================================================
// 3. Construction du filtre WHERE commun
// =============================================================================

// Le motif LIKE est calculé en PHP pour empêcher toute injection via le contexte
$motifContexte = '%;' . $contexteId . ';%';

$conditions = [
    'm1.formation = :formation',
    'm1.millesime = :millesime',
    'm1.indicateur = :var1',
    'm1.date_inser = :date1',
    'm2.indicateur = :var2',
    'm2.date_inser = :date2',
];
$params = [
    ':formation' => $formation,
    ':millesime' => $millesime,
    ':var1'      => $var1,
    ':date1'     => $dateInserVar1,
    ':var2'      => $var2,
    ':date2'     => $dateInserVar2,
];

// Filtrage par contexte (cf. cadrage §3 et §4) :
//  - vue=mentions       : on restreint les bulles au périmètre de l'utilisateur
//                         (filtre_perimetre LIKE %;<contexte_id>;%).
//  - vue=etablissements : pas de filtre — toutes les bulles de France sont
//                         renvoyées. La discrimination entre bulles détaillables
//                         et bulles anonymes se fait ensuite via le drapeau
//                         details_accessibles calculé par peutAccederDetail().
if ($vue === 'mentions') {
    $conditions[] = 'm1.filtre_perimetre LIKE :motif';
    $params[':motif'] = $motifContexte;
}

// Filtres disciplinaires (uniquement vue=mentions)
if ($vue === 'mentions') {
    if ($dom !== '') {
        $conditions[] = 'm1.dom = :dom';
        $params[':dom'] = $dom;
    }
    if ($discipli !== '') {
        $conditions[] = 'm1.discipli = :discipli';
        $params[':discipli'] = $discipli;
    }
}

// Filtre secteur quadrant (les deux vues)
if ($secteur !== '') {
    $conditions[] = 'm1.secteur_disciplinaire_quadrant = :secteur';
    $params[':secteur'] = $secteur;
}

// Filtre type de Master (Masters uniquement)
if ($formation === 'Master' && $master !== '') {
    $conditions[] = 'm1.master = :master';
    $params[':master'] = $master;
}

$whereClause = implode(' AND ', $conditions);

// =============================================================================
// 4. Requête principale : self-join pour récupérer var1 et var2 ensemble
// =============================================================================

$sql = "
    SELECT
        m1.diplom,
        m1.libelle_intitule,
        m1.id_paysage,
        m1.uo_lib,
        m1.reg_id,
        m1.typologie_d_universites_et_assimiles AS typologie,
        m1.secteur_disciplinaire_quadrant,
        m1.filtre_perimetre,
        m1.numerateur   AS num_x,
        m1.denominateur AS denom_x,
        m2.numerateur   AS num_y,
        m2.denominateur AS denom_y
    FROM stats_quadrant m1
    INNER JOIN stats_quadrant m2
        ON m1.diplom    = m2.diplom
       AND m1.id_paysage = m2.id_paysage
       AND m1.millesime = m2.millesime
    WHERE $whereClause
";

$stmt = Database::get()->prepare($sql);
$stmt->execute($params);
$lignes = $stmt->fetchAll();

// =============================================================================
// 5. Agrégation selon la vue
// =============================================================================

if ($vue === 'mentions') {
    // Une bulle = une mention. Mais une mention peut avoir plusieurs lignes
    // si plusieurs étabs ont la même mention. Pour la vue mentions, on filtre
    // sur l'établissement de contexte : seules ses mentions à lui sont affichées.
    $pointsBruts = [];
    foreach ($lignes as $l) {
        if ($etabContexte !== '' && $l['id_paysage'] !== $etabContexte) {
            continue;
        }
        $pointsBruts[] = $l;
    }
} else {
    // vue = etablissements. On agrège par établissement.
    // Toutes les lignes d'un même id_paysage portent le même filtre_perimetre
    // (forme `;<id_nat>;<id_reg>;<id_paysage>;`) : on le mémorise une fois.
    $parEtab = [];
    foreach ($lignes as $l) {
        $uai = $l['id_paysage'];
        if (!isset($parEtab[$uai])) {
            $parEtab[$uai] = [
                'id_paysage'       => $uai,
                'uo_lib'           => $l['uo_lib'],
                'reg_id'           => $l['reg_id'],
                'typologie'        => $l['typologie'],
                'filtre_perimetre' => $l['filtre_perimetre'],
                'num_x'            => 0,
                'denom_x'          => 0,
                'num_y'            => 0,
                'denom_y'          => 0,
            ];
        }
        $parEtab[$uai]['num_x']   += (int)$l['num_x'];
        $parEtab[$uai]['denom_x'] += (int)$l['denom_x'];
        $parEtab[$uai]['num_y']   += (int)$l['num_y'];
        $parEtab[$uai]['denom_y'] += (int)$l['denom_y'];
    }
    $pointsBruts = array_values($parEtab);
}

// =============================================================================
// 6. Calcul des coordonnées et formes pour chaque point
// =============================================================================

$bulles = [];
$pointsCalculables = []; // pour le calcul de la médiane/moyenne (avant filtres d'affichage)

foreach ($pointsBruts as $p) {
    $denomX = (int)$p['denom_x'];
    $denomY = (int)$p['denom_y'];

    if ($denomX === 0 || $denomY === 0) {
        continue; // impossible de calculer le taux
    }

    $x = (int)$p['num_x'] / $denomX;
    $y = (int)$p['num_y'] / $denomY;

    // Tous les points calculables servent au calcul de référence
    $pointsCalculables[] = ['x' => $x, 'y' => $y];

    // Forme selon les seuils de diffusion
    $forme = Diffusion::forme($denomX, $denomY);
    if ($forme === null) {
        continue; // bulle non diffusable, on ne l'inclut pas dans les bulles affichées
    }

    // Filtre Représentativité
    if ($representativite === 'representatif' && !Diffusion::estRepresentative($denomX, $denomY)) {
        continue;
    }

    // Détermination de la couleur selon la vue
    if ($vue === 'mentions') {
        $couleurKey = $p['secteur_disciplinaire_quadrant'];
    } else {
        // Pour vue=etablissements, couleur selon relation région/typologie avec étab de contexte
        $couleurKey = categoriserEtablissement($p, $etabContexte, $pointsBruts);
    }

    // Vérification des droits au détail (selon contexte et bulle)
    $detailsAccessibles = peutAccederDetail($p, $contexteId);

    // Anonymisation des bulles hors contexte sur vue=etablissements : la bulle
    // reste visible (position, couleur, forme, taille) mais le libellé n'est
    // pas exposé pour ne pas révéler l'identité de l'établissement.
    // L'id technique (id_paysage) reste renseigné : opaque pour un humain,
    // utile au frontend pour clés React et déduplication.
    if ($vue === 'etablissements' && !$detailsAccessibles) {
        $libelle = '';
    } else {
        $libelle = $vue === 'mentions' ? $p['libelle_intitule'] : $p['uo_lib'];
    }

    $bulles[] = [
        'id'                  => $vue === 'mentions' ? $p['diplom'] : $p['id_paysage'],
        'libelle'             => $libelle,
        'x'                   => round($x, 4),
        'y'                   => round($y, 4),
        'denom_x'             => $denomX,
        'denom_y'             => $denomY,
        'forme'               => $forme,
        'couleur_key'         => $couleurKey,
        'details_accessibles' => $detailsAccessibles,
    ];
}

// =============================================================================
// 7. Calcul de la médiane ou moyenne (sur tous les points calculables)
// =============================================================================

$reference = null;
if (!empty($pointsCalculables)) {
    $xs = array_column($pointsCalculables, 'x');
    $ys = array_column($pointsCalculables, 'y');

    if ($agregation === 'moyenne') {
        $reference = [
            'x'    => round(array_sum($xs) / count($xs), 4),
            'y'    => round(array_sum($ys) / count($ys), 4),
            'type' => 'moyenne',
        ];
    } else {
        $reference = [
            'x'    => round(mediane($xs), 4),
            'y'    => round(mediane($ys), 4),
            'type' => 'mediane',
        ];
    }
}

// =============================================================================
// 8. Mentions non représentées (vue=mentions uniquement)
// =============================================================================

$mentionsNonRepresentees = [];

if ($vue === 'mentions') {
    $mentionsNonRepresentees = calculerMentionsNonRepresentees(
        $formation, $millesime, $var1, $var2,
        $dateInserVar1, $dateInserVar2,
        $etabContexte, $motifContexte,
        $dom, $discipli, $secteur, $master,
        array_column($bulles, 'id')
    );
}

// =============================================================================
// 9. Réponse JSON
// =============================================================================

$reponse = [
    'bulles'    => $bulles,
    'reference' => $reference,
];

if ($vue === 'mentions') {
    $reponse['mentions_non_representees'] = $mentionsNonRepresentees;
}

Response::json($reponse);


// =============================================================================
// Fonctions auxiliaires
// =============================================================================

/**
 * Calcule la médiane d'un tableau de nombres.
 */
function mediane(array $valeurs): float
{
    sort($valeurs);
    $n = count($valeurs);
    if ($n === 0) return 0.0;
    if ($n % 2 === 1) {
        return (float)$valeurs[(int)($n / 2)];
    }
    return ($valeurs[$n / 2 - 1] + $valeurs[$n / 2]) / 2;
}

/**
 * Détermine la catégorie de coloration d'un étab par rapport à l'étab de contexte.
 * Retourne l'une des 5 valeurs définies pour la palette région/typologie.
 */
function categoriserEtablissement(array $etab, string $etabContexte, array $tous): string
{
    if ($etab['id_paysage'] === $etabContexte) {
        return 'selectionne';
    }

    // Retrouver l'étab de contexte pour comparer
    $contexte = null;
    foreach ($tous as $e) {
        if ($e['id_paysage'] === $etabContexte) {
            $contexte = $e;
            break;
        }
    }

    if ($contexte === null) {
        return 'autres';
    }

    $memeRegion    = $etab['reg_id']    === $contexte['reg_id'];
    $memeTypologie = $etab['typologie'] === $contexte['typologie'];

    if ($memeRegion && $memeTypologie) return 'meme_region_et_typologie';
    if ($memeRegion)                   return 'meme_region_autre_typologie';
    if ($memeTypologie)                return 'meme_typologie_autre_region';
    return 'autres';
}

/**
 * Détermine si l'utilisateur peut accéder au détail de cette bulle.
 *
 * Règle : le contexte_id (id_paysage, id_reg ou id_nat selon le rôle de
 * l'utilisateur) doit être présent dans le filtre_perimetre de la bulle.
 * Les délimiteurs `;` encadrant le contexte_id dans le motif évitent qu'un id
 * soit faux-positif d'un autre (les id ont une longueur fixe de 5 caractères,
 * mais ceinture et bretelles).
 *
 *  - vue=mentions       : le filtre LIKE de la requête principale a déjà
 *                         exclu les bulles hors contexte, donc cette fonction
 *                         renvoie true sur toutes les bulles renvoyées (garde-fou).
 *  - vue=etablissements : la requête principale ne filtre PAS sur le contexte
 *                         (cf. cadrage §4 — anonymisation), c'est ici qu'on
 *                         discrimine les bulles détaillables des bulles anonymes.
 */
function peutAccederDetail(array $row, string $contexteId): bool
{
    if (!isset($row['filtre_perimetre'])) {
        return false;
    }
    return strpos($row['filtre_perimetre'], ';' . $contexteId . ';') !== false;
}

/**
 * Calcule la liste des mentions de l'étab de contexte qui ne sont pas représentées,
 * avec la raison de leur absence.
 */
function calculerMentionsNonRepresentees(
    string $formation, string $millesime, string $var1, string $var2,
    string $dateInserVar1, string $dateInserVar2,
    string $etabContexte, string $motifContexte,
    string $dom, string $discipli, string $secteur, string $master,
    array $idsBullesAffichees
): array {
    // Récupérer toutes les mentions de l'étab de contexte pour le millésime et la formation,
    // avec leurs denom pour var1 et var2 séparément (LEFT JOIN pour gérer l'absence).

    $conditions = [
        'm.id_paysage = :etab',
        'm.filtre_perimetre LIKE :motif',
        'm.formation = :formation',
        'm.millesime = :millesime',
    ];
    $params = [
        ':etab'      => $etabContexte,
        ':motif'     => $motifContexte,
        ':formation' => $formation,
        ':millesime' => $millesime,
        ':var1'      => $var1,
        ':date1'     => $dateInserVar1,
        ':var2'      => $var2,
        ':date2'     => $dateInserVar2,
    ];

    if ($dom !== '')      { $conditions[] = 'm.dom = :dom';           $params[':dom'] = $dom; }
    if ($discipli !== '') { $conditions[] = 'm.discipli = :discipli'; $params[':discipli'] = $discipli; }
    if ($secteur !== '')  { $conditions[] = 'm.secteur_disciplinaire_quadrant = :secteur'; $params[':secteur'] = $secteur; }
    if ($formation === 'Master' && $master !== '') {
        $conditions[] = 'm.master = :master';
        $params[':master'] = $master;
    }

    $whereClause = implode(' AND ', $conditions);

    $sql = "
        SELECT
            m.diplom,
            MAX(m.libelle_intitule) AS libelle,
            MAX(CASE WHEN m.indicateur = :var1 AND m.date_inser = :date1 THEN m.denominateur END) AS denom_x,
            MAX(CASE WHEN m.indicateur = :var2 AND m.date_inser = :date2 THEN m.denominateur END) AS denom_y
        FROM stats_quadrant m
        WHERE $whereClause
        GROUP BY m.diplom
    ";

    $stmt = Database::get()->prepare($sql);
    $stmt->execute($params);
    $toutes = $stmt->fetchAll();

    $resultats = [];
    foreach ($toutes as $m) {
        if (in_array($m['diplom'], $idsBullesAffichees, true)) {
            continue; // déjà représentée, on l'ignore
        }

        $denomX = $m['denom_x'] !== null ? (int)$m['denom_x'] : null;
        $denomY = $m['denom_y'] !== null ? (int)$m['denom_y'] : null;

        if ($denomX === null && $denomY === null) {
            $raison = 'pas_de_matching';
        } elseif ($denomX === null) {
            $raison = 'pas_de_donnee_var1';
        } elseif ($denomY === null) {
            $raison = 'pas_de_donnee_var2';
        } elseif ($denomX < Diffusion::SEUIL_DIFFUSION && $denomY < Diffusion::SEUIL_DIFFUSION) {
            $raison = 'denom_var1_et_var2_insuffisants';
        } elseif ($denomX < Diffusion::SEUIL_DIFFUSION) {
            $raison = 'denom_var1_insuffisant';
        } elseif ($denomY < Diffusion::SEUIL_DIFFUSION) {
            $raison = 'denom_var2_insuffisant';
        } else {
            // Cas qui ne devrait pas arriver (sinon la bulle serait représentée)
            continue;
        }

        $resultats[] = [
            'diplom'  => $m['diplom'],
            'libelle' => $m['libelle'],
            'raison'  => $raison,
        ];
    }

    return $resultats;
}
