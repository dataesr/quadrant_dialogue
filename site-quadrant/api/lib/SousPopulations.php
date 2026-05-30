<?php
/**
 * Helpers partagés pour l'analyse fine par sous-population en mode
 * ÉTABLISSEMENT (Phase 14.8).
 *
 * En vue Positionnement, l'analyse agrège toutes les mentions du cursus de
 * l'établissement sélectionné qui passent les filtres actifs (mêmes filtres
 * disciplinaires que /quadrant : dom, discipli, secteur, master). La liste
 * des diploms est résolue côté serveur par une requête PLATE sur
 * stats_quadrant (pas de jointure) — le frontend ne fait que transmettre
 * les filtres qu'il connaît déjà. /quadrant/details et /analyse-sous-
 * populations résolvent la même liste avec les mêmes paramètres → cohérence
 * entre le drapeau de disponibilité et le contenu de la modale.
 */
class SousPopulations
{
    /**
     * Résout la liste des mentions (diplom + libellé) d'un établissement
     * pour un cursus/millésime, en appliquant les filtres disciplinaires
     * de /quadrant, dans le périmètre du contexte. Requête plate sur
     * stats_quadrant, GROUP BY diplom (≈ 5-100 lignes).
     *
     * @param array $filtres ['dom'=>?, 'discipli'=>?, 'secteur'=>?, 'master'=>?]
     * @return array<int, array{diplom:string, libelle_intitule:string}>
     */
    public static function resoudreMentionsFiltrees(
        PDO $pdo,
        string $idPaysage,
        string $formation,
        string $millesime,
        array $filtres,
        string $motifContexte
    ): array {
        $conditions = [
            'id_paysage = :id',
            'formation = :formation',
            'millesime = :millesime',
            'filtre_perimetre LIKE :motif',
        ];
        $params = [
            ':id'        => $idPaysage,
            ':formation' => $formation,
            ':millesime' => $millesime,
            ':motif'     => $motifContexte,
        ];
        // Mêmes filtres que /quadrant. La représentativité (filtre
        // d'AFFICHAGE des bulles fragiles) n'entre PAS ici : l'agrégat
        // établissement somme toutes ses mentions, comme le fait /quadrant
        // pour positionner la bulle établissement.
        if (!empty($filtres['dom'])) {
            $conditions[] = 'dom = :dom';
            $params[':dom'] = $filtres['dom'];
        }
        if (!empty($filtres['discipli'])) {
            $conditions[] = 'discipli = :discipli';
            $params[':discipli'] = $filtres['discipli'];
        }
        if (!empty($filtres['secteur'])) {
            $conditions[] = 'secteur_disciplinaire_quadrant = :secteur';
            $params[':secteur'] = $filtres['secteur'];
        }
        if (!empty($filtres['master'])) {
            $conditions[] = 'master = :master';
            $params[':master'] = $filtres['master'];
        }
        $where = implode(' AND ', $conditions);

        $stmt = $pdo->prepare("
            SELECT diplom, MAX(libelle_intitule) AS libelle_intitule
            FROM stats_quadrant
            WHERE $where
            GROUP BY diplom
        ");
        $stmt->execute($params);

        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[] = [
                'diplom'           => (string)$r['diplom'],
                'libelle_intitule' => (string)($r['libelle_intitule'] ?? ''),
            ];
        }
        return $out;
    }

    /**
     * Construit le fragment `diplom IN (:d0, :d1, ...)` + les bindings
     * associés (placeholders distincts, ATTR_EMULATE_PREPARES=false oblige).
     *
     * @param string[] $diploms
     * @return array{0:string, 1:array<string,string>} [fragment, params]
     */
    public static function clauseInDiploms(array $diploms): array
    {
        $place = [];
        $params = [];
        foreach (array_values($diploms) as $i => $d) {
            $ph = ":d$i";
            $place[] = $ph;
            $params[$ph] = $d;
        }
        return ['diplom IN (' . implode(', ', $place) . ')', $params];
    }

    /**
     * Somme de l'effectif de RÉFÉRENCE (diplômé/ensemble/français/ensemble)
     * agrégé sur les mentions données. nb_etudiants étant constant entre
     * durées, on prend MAX par diplom (= la valeur) puis on somme — éviter
     * de multiplier par le nombre de date_inser présentes. Sert au drapeau
     * de disponibilité du bouton côté /quadrant/details.
     */
    public static function sommeReferenceAgregee(
        PDO $pdo,
        string $idPaysage,
        string $millesime,
        array $diploms,
        string $motifContexte
    ): ?int {
        if (empty($diploms)) {
            return null;
        }
        [$inClause, $inParams] = self::clauseInDiploms($diploms);
        $params = array_merge(
            [':id' => $idPaysage, ':millesime' => $millesime, ':motif' => $motifContexte],
            $inParams
        );
        $stmt = $pdo->prepare("
            SELECT SUM(ne) FROM (
                SELECT diplom, MAX(nb_etudiants) AS ne
                FROM stats_sous_populations
                WHERE id_paysage = :id
                  AND millesime = :millesime
                  AND $inClause
                  AND obtention_diplome = 'diplômé'
                  AND genre = 'ensemble'
                  AND nationalite = 'français'
                  AND regime_inscription = 'ensemble'
                  AND filtre_perimetre LIKE :motif
                GROUP BY diplom
            ) t
        ");
        $stmt->execute($params);
        $v = $stmt->fetchColumn();
        return ($v === false || $v === null) ? null : (int)$v;
    }

    /**
     * L'établissement a-t-il au moins une ligne dans le périmètre ?
     * Sert à distinguer 403 (hors périmètre) de 404 (aucune donnée).
     */
    public static function etablissementDansPerimetre(
        PDO $pdo,
        string $idPaysage,
        string $motifContexte
    ): bool {
        $stmt = $pdo->prepare("
            SELECT 1 FROM stats_quadrant
            WHERE id_paysage = :id AND filtre_perimetre LIKE :motif
            LIMIT 1
        ");
        $stmt->execute([':id' => $idPaysage, ':motif' => $motifContexte]);
        return (bool)$stmt->fetchColumn();
    }
}
