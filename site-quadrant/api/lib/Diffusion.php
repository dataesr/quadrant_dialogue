<?php
/**
 * Application des règles de diffusion statistique.
 *
 * Rappel :
 *  - denom < 5  : indicateur non diffusable (bulle absente)
 *  - denom 5-19 : indicateur diffusable, mais fiabilité limitée (forme spéciale)
 *  - denom ≥ 20 : indicateur diffusable normalement (rond)
 *
 * Les bulles n'apparaissent que si les DEUX dénominateurs (var1 et var2) sont ≥ 5.
 */

class Diffusion
{
    public const SEUIL_DIFFUSION = 5;
    public const SEUIL_FIABILITE = 20;

    /**
     * Détermine la forme d'une bulle selon les dénominateurs.
     * Renvoie null si la bulle n'est pas diffusable (au moins un denom < 5).
     */
    public static function forme(int $denomX, int $denomY): ?string
    {
        if ($denomX < self::SEUIL_DIFFUSION || $denomY < self::SEUIL_DIFFUSION) {
            return null; // bulle non affichée
        }

        $xFaible = $denomX < self::SEUIL_FIABILITE;
        $yFaible = $denomY < self::SEUIL_FIABILITE;

        if ($xFaible && $yFaible) {
            return 'croix';
        }
        if ($yFaible) {
            return 'triangle_bas';
        }
        if ($xFaible) {
            return 'triangle_gauche';
        }
        return 'rond';
    }

    /**
     * Indique si une bulle passe le filtre "représentatif uniquement"
     * (les deux dénominateurs ≥ 20).
     */
    public static function estRepresentative(int $denomX, int $denomY): bool
    {
        return $denomX >= self::SEUIL_FIABILITE && $denomY >= self::SEUIL_FIABILITE;
    }
}
