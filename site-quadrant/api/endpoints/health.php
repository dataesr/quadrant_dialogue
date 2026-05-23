<?php
/**
 * GET /health
 *
 * Health check : vérifie que l'API tourne et peut joindre la BDD.
 * Pas d'authentification requise. Utile pour monitoring et smoke tests post-déploiement.
 *
 * Paramètre optionnel :
 *  - check=full : déclenche une vérification de cohérence entre la table de
 *    référence dim_indicateur_cursus et les données réelles de stats_quadrant.
 *    Outil d'exploitation à appeler après chaque import ETL ou en cas de doute.
 *    Statut HTTP toujours 200, même si des incohérences sont détectées : le
 *    diagnostic est dans le payload (indicateurs_coherence.status = degraded).
 *    Hors check=full, l'endpoint reste léger pour le monitoring fréquent.
 *
 * Réponse de base :
 *   {"status":"ok","database":"ok","timestamp":"..."}
 *
 * Réponse avec check=full (ajoute) :
 *   "indicateurs_coherence": {
 *     "status": "ok" | "degraded",
 *     "indicateurs_non_references": [...],   // en BDD, absents de la référence
 *     "indicateurs_sans_donnees":   [...],   // dans la référence, absents en BDD
 *     "incoherences_delai":         [...]    // declinable_delai ↔ date_inser
 *   }
 */

require_once __DIR__ . '/../lib/Database.php';
require_once __DIR__ . '/../lib/Response.php';

Response::cors();

$status   = 'ok';
$dbStatus = 'unknown';

try {
    $stmt = Database::get()->query('SELECT 1');
    $stmt->fetch();
    $dbStatus = 'ok';
} catch (Throwable $e) {
    $status   = 'degraded';
    $dbStatus = 'unreachable';
}

$reponse = [
    'status'    => $status,
    'database'  => $dbStatus,
    'timestamp' => date('c'),
];

// Vérification approfondie sur demande explicite. On la saute si la BDD n'est
// pas joignable — la cause racine est déjà signalée par database=unreachable.
if (($_GET['check'] ?? '') === 'full' && $dbStatus === 'ok') {
    $reponse['indicateurs_coherence'] = verifierCoherenceIndicateurs();
}

Response::json($reponse);


// =============================================================================
// Vérification de cohérence dim_indicateur_cursus ↔ stats_quadrant
// =============================================================================
//
// Les SELECT ci-dessous n'ont aucun paramètre utilisateur ; le risque
// d'injection est nul. Pas de prepare() nécessaire.

/**
 * Orchestre les trois contrôles et agrège leur statut.
 */
function verifierCoherenceIndicateurs(): array
{
    $nonReferences     = couplesNonReferences();
    $sansDonnees       = couplesSansDonnees();
    $incoherencesDelai = incoherencesDelai();

    $coherent = empty($nonReferences) && empty($sansDonnees) && empty($incoherencesDelai);

    return [
        'status'                     => $coherent ? 'ok' : 'degraded',
        'indicateurs_non_references' => $nonReferences,
        'indicateurs_sans_donnees'   => $sansDonnees,
        'incoherences_delai'         => $incoherencesDelai,
    ];
}

/**
 * Contrôle 1 — couples (formation, indicateur) présents en stats_quadrant mais
 * absents de dim_indicateur_cursus. Symptôme typique : import ETL d'un nouvel
 * indicateur sans mise à jour de la table de référence ; l'indicateur ne pourra
 * pas être proposé dans l'UI (validation invalid_var1 / invalid_var2 côté API).
 */
function couplesNonReferences(): array
{
    $stmt = Database::get()->query("
        SELECT DISTINCT s.formation, s.indicateur
        FROM stats_quadrant s
        LEFT JOIN dim_indicateur_cursus d
            ON d.formation  = s.formation
           AND d.indicateur = s.indicateur
        WHERE d.indicateur IS NULL
        ORDER BY s.formation, s.indicateur
    ");
    return $stmt->fetchAll();
}

/**
 * Contrôle 2 — couples (formation, indicateur) référencés mais sans aucune ligne
 * en stats_quadrant. Symptôme typique : indicateur déclaré dans la matrice mais
 * non encore livré par la source ; sélectionnable dans l'UI mais l'appel
 * /quadrant renverra une réponse avec info="Aucune donnée…".
 */
function couplesSansDonnees(): array
{
    $stmt = Database::get()->query("
        SELECT d.formation, d.indicateur
        FROM dim_indicateur_cursus d
        LEFT JOIN stats_quadrant s
            ON d.formation  = s.formation
           AND d.indicateur = s.indicateur
        WHERE s.indicateur IS NULL
        GROUP BY d.formation, d.indicateur
        ORDER BY d.formation, d.indicateur
    ");
    return $stmt->fetchAll();
}

/**
 * Contrôle 3 — cohérence du flag declinable_delai avec les date_inser présents
 * en BDD pour chaque couple (formation, indicateur).
 *
 *  - declinable_delai = 1 ET aucun délai non vide en BDD → incohérence
 *  - declinable_delai = 0 ET au moins un délai non vide en BDD → incohérence
 *
 * L'agrégation se fait côté SQL via GROUP_CONCAT pour ramener une seule ligne
 * par couple, puis on classe en PHP. Les date_inser NULL sont normalisées en
 * chaîne vide pour cohérence avec la sémantique « pas de déclinaison ».
 */
function incoherencesDelai(): array
{
    $stmt = Database::get()->query("
        SELECT
            d.formation,
            d.indicateur,
            d.declinable_delai,
            GROUP_CONCAT(DISTINCT IFNULL(s.date_inser, '')) AS delais_observes
        FROM dim_indicateur_cursus d
        INNER JOIN stats_quadrant s
            ON d.formation  = s.formation
           AND d.indicateur = s.indicateur
        GROUP BY d.formation, d.indicateur, d.declinable_delai
        ORDER BY d.formation, d.indicateur
    ");

    $resultats = [];
    foreach ($stmt->fetchAll() as $r) {
        $declinable = (int)$r['declinable_delai'] === 1;
        $delais     = $r['delais_observes'] !== null
            ? explode(',', $r['delais_observes'])
            : [];

        // Les '' représentent l'absence de délai (indicateur non déclinable).
        $delaisNonVides = array_values(array_filter($delais, fn($d) => $d !== ''));

        if ($declinable && empty($delaisNonVides)) {
            $resultats[] = [
                'formation'          => $r['formation'],
                'indicateur'         => $r['indicateur'],
                'declinable_attendu' => true,
                'delais_observes'    => $delais,
                'probleme'           => 'indicateur déclaré déclinable mais aucun délai en BDD',
            ];
        } elseif (!$declinable && !empty($delaisNonVides)) {
            $resultats[] = [
                'formation'          => $r['formation'],
                'indicateur'         => $r['indicateur'],
                'declinable_attendu' => false,
                'delais_observes'    => $delais,
                'probleme'           => 'indicateur déclaré non déclinable mais des délais existent en BDD',
            ];
        }
    }

    return $resultats;
}
