// Vitesses d'animation — source unique partagée (Phase 15.3).
//
// Centralise le mapping vitesse → durées (ms) utilisé par TOUTES les
// animations de l'app :
//   - modale d'évolution temporelle (millésimes, ModaleAnimation.jsx)
//   - modale d'analyse fine, onglet Quadrant (durée d'observation,
//     ModaleAnalyseSousPopulations.jsx)
//
// Recalibrage Phase 15.3 (retour utilisateur : l'ancienne « rapide » à
// 0,5 s était trop rapide pour suivre les bulles). Tout est décalé d'un
// cran vers le plus lent ; l'ancienne « rapide » (500 ms) est supprimée
// et une vitesse « encore plus lente » apparaît :
//
//   Lente   3000 ms/tick  (plus lente que l'ancienne « lente »)
//   Normale 2000 ms/tick  (= ancienne « lente »)
//   Rapide  1000 ms/tick  (= ancienne « moyenne »)
//
// Les libellés affichés restent « Lente / Normale / Rapide » (3 niveaux).
// `transitionMs` ≈ 80 % du tick : laisse les bulles finir leur
// déplacement avant le tick suivant tout en restant fluide.
//
// L'ordre des clés conditionne l'ordre des boutons du sélecteur
// (Object.entries) — de la plus lente à la plus rapide.

export const VITESSES = {
  lente:   { tickMs: 3000, transitionMs: 2400, libelle: 'Lente' },
  normale: { tickMs: 2000, transitionMs: 1600, libelle: 'Normale' },
  rapide:  { tickMs: 1000, transitionMs:  800, libelle: 'Rapide' },
};

// Vitesse par défaut au montage des modales.
export const VITESSE_DEFAUT = 'normale';
