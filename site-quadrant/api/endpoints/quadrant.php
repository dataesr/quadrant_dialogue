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
 *  - mention           : optionnel, diplom d'une mention précise (vue=etablissements
 *                        uniquement). Cible une comparaison « tous les étabs sur cette
 *                        mention » : chaque bulle reste un établissement, mais x/y sont
 *                        ceux de la mention demandée (pas d'agrégation). Silencieusement
 *                        ignoré sur vue=mentions (chaque bulle y est déjà une mention).
 *  - representativite  : 'toutes' (défaut) | 'representatif'
 *  - agregation        : 'mediane' (défaut) | 'moyenne'
 *
 * Headers requis : X-Connexion-Token, X-User-Token, X-Campagne-Token
 *
 * Codes d'erreur 400 :
 *  - invalid_formation, invalid_vue, invalid_millesime, invalid_variables,
 *    invalid_agregation, invalid_representativite, invalid_mention
 *  - invalid_var1 / invalid_var2 : l'indicateur n'est pas autorisé pour ce cursus
 *    (matrice de référence : dim_indicateur_cursus)
 *  - invalid_order : ordre canonique non respecté (var1 doit précéder var2)
 *  - invalid_date_inser : incohérence entre date_inser et declinable_delai
 *    (valeur 6/12/18/24/30 requise si déclinable, vide sinon)
 *
 * Code d'erreur 500 :
 *  - cursus_incoherent : le cursus demandé n'a aucun indicateur dans
 *    dim_indicateur_cursus (devrait être impossible : alerte exploitation)
 *
 * Réponse de succès enrichie :
 *  - quand `bulles` est vide, ajoute un champ `info` pour distinguer une
 *    combinaison sans résultats d'une erreur (frontend : afficher un état
 *    « pas de données » plutôt qu'une page vide muette).
 *  - en vue=mentions uniquement, chaque bulle expose en plus :
 *      * `numerateur_x`, `numerateur_y`, `taux_x`, `taux_y` — valeurs brutes
 *        et taux arrondis à 1 décimale, pour l'export XLSX côté React ;
 *      * `dom`, `dom_lib` — code et libellé du grand domaine, pour la
 *        coloration par domaine et l'export.
 *    Asymétrie volontaire avec vue=etablissements : ces champs y sont
 *    absents même pour les bulles détaillables, pour préserver
 *    l'anonymisation des bulles hors périmètre (pas de fuite indirecte
 *    si l'anonymisation évolue) et parce qu'un agrégat d'établissement
 *    n'a pas de domaine unique.
 *  - en vue=mentions uniquement, chaque entrée de `mentions_non_representees`
 *    porte `diplom`, `libelle`, `raison`, plus — pour chaque axe dont
 *    la donnée est diffusable (denom >= SEUIL_DIFFUSION) — les champs
 *    `x` (ratio 0-1), `denom_x`, `population_x` et leurs équivalents Y.
 *    Permet au frontend d'afficher en tableau la valeur diffusable d'un
 *    axe même quand l'autre manque ou est sous le seuil de diffusion.
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
$mention          = $_GET['mention']          ?? '';
$representativite = $_GET['representativite'] ?? 'toutes';
$agregation       = $_GET['agregation']       ?? 'mediane';
$forExport        = !empty($_GET['for_export']);

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
if ($mention !== '' && !preg_match('/^[A-Za-z0-9]{1,20}$/', $mention)) {
    Response::error('invalid_mention', 'Paramètre mention invalide.');
}

// Le filtre mention n'est applicable qu'à la vue Établissements. Sur la vue
// Mentions chaque bulle est déjà une mention, donc le filtre serait inopérant :
// on l'ignore silencieusement plutôt que de remonter une erreur.
if ($vue !== 'etablissements') {
    $mention = '';
}

// =============================================================================
// 2bis. Validation des indicateurs via dim_indicateur_cursus
// =============================================================================
//
// dim_indicateur_cursus est la source de vérité de la matrice cursus × indicateur
// (cf. cadrage §5). On y récupère pour chaque indicateur autorisé sur ce cursus
// son ordre canonique et son drapeau de déclinabilité par délai. Cela permet de :
//   - valider que var1 et var2 sont des indicateurs reconnus pour ce cursus ;
//   - vérifier la contrainte d'ordre var1 < var2 (cf. cadrage §5) ;
//   - vérifier la cohérence date_inser vs declinable_delai pour les deux variables.

$indicateursAutorises = chargerIndicateursCursus($formation);
if (empty($indicateursAutorises)) {
    // Cursus reconnu côté formation mais inconnu de dim_indicateur_cursus :
    // incohérence de configuration BDD, à corriger côté exploitation.
    Response::error(
        'cursus_incoherent',
        "Aucun indicateur défini pour le cursus « $formation » dans dim_indicateur_cursus.",
        500
    );
}

if (!isset($indicateursAutorises[$var1])) {
    Response::error('invalid_var1', "L'indicateur var1 « $var1 » n'est pas autorisé pour le cursus « $formation ».");
}
if (!isset($indicateursAutorises[$var2])) {
    Response::error('invalid_var2', "L'indicateur var2 « $var2 » n'est pas autorisé pour le cursus « $formation ».");
}

// Ordre canonique : var1 doit strictement précéder var2.
if ($indicateursAutorises[$var1]['ordre'] >= $indicateursAutorises[$var2]['ordre']) {
    Response::error(
        'invalid_order',
        "L'ordre des variables est incorrect : var1 doit précéder var2 dans l'ordre canonique du cursus."
    );
}

// Cohérence date_inser ↔ declinable_delai pour var1 ET var2.
// On applique la règle aux deux variables car certains indicateurs
// déclinables peuvent occuper la position var1 (ordres 60/70/80).
$delaisAutorises = ['6', '12', '18', '24', '30'];
foreach ([['var1', $var1, $dateInserVar1], ['var2', $var2, $dateInserVar2]] as $check) {
    [$nom, $ind, $date] = $check;
    $declinable = $indicateursAutorises[$ind]['declinable_delai'];

    if ($declinable && !in_array($date, $delaisAutorises, true)) {
        Response::error(
            'invalid_date_inser',
            "L'indicateur $nom (« $ind ») est déclinable par délai : date_inser_$nom doit valoir 6, 12, 18, 24 ou 30."
        );
    }
    if (!$declinable && $date !== '') {
        Response::error(
            'invalid_date_inser',
            "L'indicateur $nom (« $ind ») n'est pas déclinable par délai : date_inser_$nom doit être vide."
        );
    }
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

// Filtre mention (vue=etablissements uniquement, déjà court-circuité ailleurs) :
// restreint à une mention précise, ramenant chaque établissement à une seule
// ligne — l'agrégation par étab est alors court-circuitée plus bas.
if ($mention !== '') {
    $conditions[] = 'm1.diplom = :mention';
    $params[':mention'] = $mention;
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
        m1.dom,
        m1.dom_lib,
        m1.filtre_perimetre,
        m1.numerateur   AS num_x,
        m1.denominateur AS denom_x,
        m1.population   AS population_x,
        m2.numerateur   AS num_y,
        m2.denominateur AS denom_y,
        m2.population   AS population_y
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
} elseif ($mention !== '') {
    // vue = etablissements AVEC filtre mention.
    // La contrainte SQL `m1.diplom = :mention` garantit déjà qu'on a au plus
    // une ligne par établissement pour la mention demandée — pas d'agrégation
    // à faire. Les coordonnées x/y reflètent les indicateurs de cette mention
    // précise pour chaque établissement, ce qui est exactement le but du filtre.
    // Les lignes SQL contiennent déjà toutes les clés attendues plus bas
    // (id_paysage, uo_lib, reg_id, typologie, filtre_perimetre, num_x/y, denom_x/y).
    $pointsBruts = $lignes;
} else {
    // vue = etablissements sans filtre mention. On agrège par établissement.
    // Toutes les lignes d'un même id_paysage portent le même filtre_perimetre
    // (forme `;<id_nat>;<id_reg>;<id_paysage>;`) : on le mémorise une fois.
    $parEtab = [];
    foreach ($lignes as $l) {
        $uai = $l['id_paysage'];
        if (!isset($parEtab[$uai])) {
            // population_x / population_y sont des libellés métier
            // (« inscrits 2021 », « sortants 2020 »…) dépendant de
            // l'indicateur, pas de l'étab/mention. Sur toutes les
            // lignes d'un même indicateur ils sont identiques — on
            // les recopie une fois, au premier insert.
            $parEtab[$uai] = [
                'id_paysage'       => $uai,
                'uo_lib'           => $l['uo_lib'],
                'reg_id'           => $l['reg_id'],
                'typologie'        => $l['typologie'],
                'filtre_perimetre' => $l['filtre_perimetre'],
                'population_x'     => $l['population_x'],
                'population_y'     => $l['population_y'],
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
$compteurAnonyme = 0;    // numérote les bulles anonymes (vue=etablissements hors périmètre)

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
    // reste visible (position, couleur, forme) mais on masque tout ce qui permet
    // de rapprocher la bulle d'un établissement réel :
    //   - id      : "anon_<N>" local à la réponse au lieu de l'id_paysage
    //               (l'id_paysage est rapprochable d'un étab via les référentiels publics).
    //   - libelle : chaîne vide.
    //   - denom   : denom_x brouillé ±15% (bruit déterministe par id_paysage)
    //               à la place de denom_x et denom_y. Un effectif précis identifie
    //               un étab par recoupement ; le brouillage le rend non rapprochable
    //               tout en restant cohérent avec la taille visuelle de la bulle.
    //               Borne basse à 5 pour ne pas créer artificiellement une bulle
    //               non diffusable.
    //
    // Côté frontend, la taille de la bulle est calculée à partir de :
    //   - denom_x pour les bulles autorisées (vue=mentions, ou vue=etablissements
    //     avec details_accessibles=true)
    //   - denom   pour les bulles anonymes (vue=etablissements avec
    //     details_accessibles=false). Les champs denom_x / denom_y y sont absents.
    if ($vue === 'etablissements' && !$detailsAccessibles) {
        $compteurAnonyme++;

        // Bruit multiplicatif ±15% stable par id_paysage : crc32 % 31 donne un
        // entier dans [0, 30] qu'on recentre sur [-15, +15] puis on divise par 100.
        $hash  = crc32($p['id_paysage']);
        $ratio = (($hash % 31) - 15) / 100.0;
        $denomBrouille = max(5, (int) round($denomX * (1 + $ratio)));

        $bulles[] = [
            'id'                  => 'anon_' . $compteurAnonyme,
            'libelle'             => '',
            'x'                   => round($x, 4),
            'y'                   => round($y, 4),
            'denom'               => $denomBrouille,
            'forme'               => $forme,
            'couleur_key'         => $couleurKey,
            'details_accessibles' => $detailsAccessibles,
        ];
    } else {
        $id      = $vue === 'mentions' ? $p['diplom'] : $p['id_paysage'];
        $libelle = $vue === 'mentions' ? $p['libelle_intitule'] : $p['uo_lib'];

        // Libellé de population (« inscrits », « sortants »…) — string
        // ou null. La colonne est VARCHAR(50) nullable ; on force à null
        // les valeurs vides pour que le frontend puisse simplement
        // tester l'absence (== null) sans gérer aussi la chaîne vide.
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
            'forme'               => $forme,
            'couleur_key'         => $couleurKey,
            'details_accessibles' => $detailsAccessibles,
        ];

        // En vue=mentions, on expose les valeurs brutes (numérateurs et taux
        // non normalisés) pour alimenter l'export XLSX généré côté React.
        // En vue=etablissements ces champs sont volontairement absents même
        // pour les bulles détaillables, afin de préserver l'anonymisation
        // des bulles hors périmètre (pas de fuite indirecte si elle évolue).
        //
        // Sécurité diffusion : à ce point du code denomX et denomY sont
        // garantis >= SEUIL_DIFFUSION (5) par Diffusion::forme() plus haut
        // (toute bulle non diffusable a été écartée par le `continue`).
        // num/taux peuvent donc être exposés sans test supplémentaire.
        if ($vue === 'mentions') {
            $numX = (int)$p['num_x'];
            $numY = (int)$p['num_y'];
            $bulle['numerateur_x'] = $numX;
            $bulle['numerateur_y'] = $numY;
            $bulle['taux_x']       = round($numX / $denomX * 100, 1);
            $bulle['taux_y']       = round($numY / $denomY * 100, 1);

            // Domaine grand (code + libellé) : utile au frontend pour la coloration
            // par domaine et l'export XLSX. Non exposé en vue=etablissements — pas
            // de notion de domaine pour un agrégat d'établissement (un étab couvre
            // plusieurs domaines simultanément).
            $bulle['dom']     = (string)($p['dom']     ?? '');
            $bulle['dom_lib'] = (string)($p['dom_lib'] ?? '');
        }

        $bulles[] = $bulle;
    }
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
// 7 bis. Trois références d'axes pour vue=mentions
// =============================================================================
// Le frontend offre désormais 3 modes de référence en vue Mentions :
//   - médiane étab (= comportement historique, déjà calculé dans
//     `reference` ci-dessus quand agregation=mediane) ;
//   - moyenne pondérée étab : SUM(num)/SUM(denom) sur les mentions
//     de l'étab. C'est une vraie « moyenne par tête », pas une
//     moyenne arithmétique des taux (qui surreprésente les petites
//     mentions). Cohérent avec la sémantique métier d'un taux global.
//   - moyenne pondérée nationale : SUM(num)/SUM(denom) sur TOUTES les
//     mentions remontées par la requête (= France entière avec les
//     filtres disciplinaires appliqués, mais sans filtre étab). On
//     réutilise $lignes (variable SQL brute, avant filtrage par
//     contexte étab à la section 5) pour ne pas relancer une seconde
//     requête.
//
// Les 3 valeurs sont retournées en parallèle dans `axes` ; le frontend
// choisit laquelle utiliser pour positionner les lignes pointillées.
// Garde le champ `reference` historique pour compat ascendante.
//
// Vue=etablissements : `axes` est null (les axes restent la
// médiane/moyenne existante sur les bulles agrégées par étab).

$axes = null;
if ($vue === 'mentions') {
    // Médiane étab (toujours calculée — indépendamment du paramètre
    // `agregation` historique qui pouvait l'écraser au profit d'une
    // moyenne arithmétique). Source : pointsCalculables (= taux x,y
    // par mention de l'étab).
    $medEtabX = null;
    $medEtabY = null;
    if (!empty($pointsCalculables)) {
        $medEtabX = round(mediane(array_column($pointsCalculables, 'x')), 4);
        $medEtabY = round(mediane(array_column($pointsCalculables, 'y')), 4);
    }

    // Moyenne pondérée étab (sur pointsBruts, filtrés à l'étab côté
    // section 5). SUM(num)/SUM(denom) — moyenne « par tête » qui ne
    // surreprésente pas les petites mentions.
    $sumNumXEtab   = 0;
    $sumDenomXEtab = 0;
    $sumNumYEtab   = 0;
    $sumDenomYEtab = 0;
    foreach ($pointsBruts as $p) {
        $sumNumXEtab   += (int)$p['num_x'];
        $sumDenomXEtab += (int)$p['denom_x'];
        $sumNumYEtab   += (int)$p['num_y'];
        $sumDenomYEtab += (int)$p['denom_y'];
    }

    // Moyenne pondérée nationale (sur $lignes, toutes les mentions
    // France entière avec filtres disciplinaires appliqués mais sans
    // filtre étab). Réutilise la requête SQL principale — pas de
    // requête supplémentaire.
    $sumNumXNat   = 0;
    $sumDenomXNat = 0;
    $sumNumYNat   = 0;
    $sumDenomYNat = 0;
    foreach ($lignes as $l) {
        $sumNumXNat   += (int)$l['num_x'];
        $sumDenomXNat += (int)$l['denom_x'];
        $sumNumYNat   += (int)$l['num_y'];
        $sumDenomYNat += (int)$l['denom_y'];
    }

    $axes = [
        'mediane_etab_x'      => $medEtabX,
        'mediane_etab_y'      => $medEtabY,
        'moyenne_etab_x'      => $sumDenomXEtab > 0 ? round($sumNumXEtab / $sumDenomXEtab, 4) : null,
        'moyenne_etab_y'      => $sumDenomYEtab > 0 ? round($sumNumYEtab / $sumDenomYEtab, 4) : null,
        'moyenne_nationale_x' => $sumDenomXNat  > 0 ? round($sumNumXNat  / $sumDenomXNat,  4) : null,
        'moyenne_nationale_y' => $sumDenomYNat  > 0 ? round($sumNumYNat  / $sumDenomYNat,  4) : null,
    ];
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
// 8 bis. Post-traitement seuil de diffusion pour les exports
// =============================================================================
// Quand `?for_export=1` est passé, on applique le seuil
// `exports.seuil_diffusable` configuré (20 par défaut, plus strict que
// le seuil d'affichage 5). Objectif : protéger les données fragiles
// dans les fichiers exportés, qui peuvent circuler hors contexte.
//
// Logique :
//   - pour chaque bulle, si denom_x < seuil → on remet x, num_x,
//     denom_x à null et on ajoute raison_x='effectif_insuffisant_export'.
//     Idem pour Y. Le frontend (XLSX/Word) affichera « Non diffusable »
//     italique gris à la place de la valeur.
//   - si les DEUX axes sont sous-seuil → la bulle disparaît
//     entièrement des `bulles` (et en vue=mentions, est rajoutée à
//     mentions_non_representees pour la table récap XLSX).
//
// Ce traitement est en POST-traitement (après SQL + Diffusion::forme)
// pour ne pas affecter l'affichage écran : la même requête sans
// `for_export=1` continue à renvoyer les bulles fragiles 5-19 avec
// leurs valeurs (juste avec une forme spéciale côté SVG).

if ($forExport) {
    $configForExport = require __DIR__ . '/../config/config.php';
    $seuilExport     = (int)($configForExport['exports']['seuil_diffusable'] ?? 20);

    $bullesFiltrees = [];
    foreach ($bulles as $bulle) {
        // Les bulles anonymes (vue=etablissements hors périmètre) n'ont
        // que `denom` (brouillé). On les évalue sur ce champ unique.
        if (!isset($bulle['denom_x'])) {
            if (isset($bulle['denom']) && (int)$bulle['denom'] < $seuilExport) {
                continue; // bulle anonyme sous seuil : on la retire.
            }
            $bullesFiltrees[] = $bulle;
            continue;
        }

        $sousSeuilX = (int)$bulle['denom_x'] < $seuilExport;
        $sousSeuilY = (int)$bulle['denom_y'] < $seuilExport;

        if ($sousSeuilX && $sousSeuilY) {
            // Les deux axes sont sous seuil : la bulle est intotalement
            // retirée. En vue=mentions on la rajoute aux non_representees
            // pour qu'elle apparaisse dans le récap XLSX. En vue=etabs,
            // on la perd simplement (la table récap n'existe pas).
            if ($vue === 'mentions') {
                $mentionsNonRepresentees[] = [
                    'diplom'  => $bulle['id'],
                    'libelle' => $bulle['libelle'],
                    'raison'  => 'effectif_insuffisant_export',
                ];
            }
            continue;
        }

        if ($sousSeuilX) {
            // Axe X non diffusable, axe Y OK : on garde la bulle mais
            // on null l'axe X. Le frontend marque la cellule X comme
            // « Non diffusable » (italique gris), Y reste affiché.
            $bulle['x']            = null;
            $bulle['denom_x']      = null;
            $bulle['raison_x']     = 'effectif_insuffisant_export';
            if (isset($bulle['numerateur_x'])) $bulle['numerateur_x'] = null;
            if (isset($bulle['taux_x']))       $bulle['taux_x']       = null;
            if (isset($bulle['population_x'])) $bulle['population_x'] = null;
        }
        if ($sousSeuilY) {
            $bulle['y']            = null;
            $bulle['denom_y']      = null;
            $bulle['raison_y']     = 'effectif_insuffisant_export';
            if (isset($bulle['numerateur_y'])) $bulle['numerateur_y'] = null;
            if (isset($bulle['taux_y']))       $bulle['taux_y']       = null;
            if (isset($bulle['population_y'])) $bulle['population_y'] = null;
        }

        $bullesFiltrees[] = $bulle;
    }
    $bulles = $bullesFiltrees;
}

// =============================================================================
// 9. Réponse JSON
// =============================================================================

$reponse = [
    'bulles'    => $bulles,
    'reference' => $reference,
];

// Vue Mentions : exposer les 3 références d'axes (cf. section 7 bis)
// pour permettre au frontend de basculer entre médiane étab,
// moyenne étab, moyenne nationale.
if ($axes !== null) {
    $reponse['axes'] = $axes;
}

// Distinguer le « pas de données » légitime (combinaison valide mais vide en BDD)
// d'une erreur silencieuse côté frontend. Ce champ n'apparaît que quand la liste
// est effectivement vide ; le frontend peut afficher un message d'état dédié.
if (empty($bulles)) {
    $reponse['info'] = 'Aucune donnée pour cette combinaison de filtres';
}

if ($vue === 'mentions') {
    $reponse['mentions_non_representees'] = $mentionsNonRepresentees;
}

Response::json($reponse);


// =============================================================================
// Fonctions auxiliaires
// =============================================================================

/**
 * Charge la matrice cursus × indicateur depuis dim_indicateur_cursus.
 *
 * Retourne un tableau associatif : indicateur => ['ordre' => int, 'declinable_delai' => bool].
 * Tableau vide si le cursus n'a aucune entrée (incohérence de configuration).
 */
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
    // ATTR_EMULATE_PREPARES = false (cf. Database.php) : MySQL en
    // prepared statements natifs n'autorise pas un même placeholder
    // nommé à plusieurs endroits du SQL. On dédouble donc les bindings
    // de var1/var2/date1/date2 (utilisés une fois par CASE ci-dessous).
    $params = [
        ':etab'      => $etabContexte,
        ':motif'     => $motifContexte,
        ':formation' => $formation,
        ':millesime' => $millesime,
        ':var1_num'    => $var1, ':date1_num'   => $dateInserVar1,
        ':var1_denom'  => $var1, ':date1_denom' => $dateInserVar1,
        ':var1_pop'    => $var1, ':date1_pop'   => $dateInserVar1,
        ':var2_num'    => $var2, ':date2_num'   => $dateInserVar2,
        ':var2_denom'  => $var2, ':date2_denom' => $dateInserVar2,
        ':var2_pop'    => $var2, ':date2_pop'   => $dateInserVar2,
    ];

    if ($dom !== '')      { $conditions[] = 'm.dom = :dom';           $params[':dom'] = $dom; }
    if ($discipli !== '') { $conditions[] = 'm.discipli = :discipli'; $params[':discipli'] = $discipli; }
    if ($secteur !== '')  { $conditions[] = 'm.secteur_disciplinaire_quadrant = :secteur'; $params[':secteur'] = $secteur; }
    if ($formation === 'Master' && $master !== '') {
        $conditions[] = 'm.master = :master';
        $params[':master'] = $master;
    }

    $whereClause = implode(' AND ', $conditions);

    // On agrège num/denom/population pour CHAQUE axe — pour pouvoir,
    // dans le résultat final, exposer la valeur diffusable d'un axe
    // même quand l'autre est manquant ou non diffusable.
    $sql = "
        SELECT
            m.diplom,
            MAX(m.libelle_intitule) AS libelle,
            MAX(CASE WHEN m.indicateur = :var1_num   AND m.date_inser = :date1_num   THEN m.numerateur   END) AS num_x,
            MAX(CASE WHEN m.indicateur = :var1_denom AND m.date_inser = :date1_denom THEN m.denominateur END) AS denom_x,
            MAX(CASE WHEN m.indicateur = :var1_pop   AND m.date_inser = :date1_pop   THEN m.population   END) AS population_x,
            MAX(CASE WHEN m.indicateur = :var2_num   AND m.date_inser = :date2_num   THEN m.numerateur   END) AS num_y,
            MAX(CASE WHEN m.indicateur = :var2_denom AND m.date_inser = :date2_denom THEN m.denominateur END) AS denom_y,
            MAX(CASE WHEN m.indicateur = :var2_pop   AND m.date_inser = :date2_pop   THEN m.population   END) AS population_y
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

        $resultat = [
            'diplom'  => $m['diplom'],
            'libelle' => $m['libelle'],
            'raison'  => $raison,
        ];

        // Expose la donnée diffusable de chaque axe quand elle existe — on
        // s'aligne sur la structure des bulles principales : `x` (ratio 0-1),
        // `denom_x`, `population_x` (et idem Y). Le frontend réutilise ainsi
        // sa CellulePourcentage sans cas particulier.
        //
        // Politique d'exposition : on n'expose un axe que si son denom >=
        // SEUIL_DIFFUSION (5). Une donnée non diffusable ne doit pas fuiter
        // de proportion calculée sur trop peu d'individus — cohérent avec
        // Diffusion::forme() qui filtre les bulles principales.
        $popX = ($m['population_x'] ?? '') !== '' ? (string)$m['population_x'] : null;
        $popY = ($m['population_y'] ?? '') !== '' ? (string)$m['population_y'] : null;

        if ($denomX !== null && $denomX >= Diffusion::SEUIL_DIFFUSION) {
            $numX = (int)$m['num_x'];
            $resultat['x']            = round($numX / $denomX, 4);
            $resultat['denom_x']      = $denomX;
            $resultat['population_x'] = $popX;
        }
        if ($denomY !== null && $denomY >= Diffusion::SEUIL_DIFFUSION) {
            $numY = (int)$m['num_y'];
            $resultat['y']            = round($numY / $denomY, 4);
            $resultat['denom_y']      = $denomY;
            $resultat['population_y'] = $popY;
        }

        $resultats[] = $resultat;
    }

    return $resultats;
}
