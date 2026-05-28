// Loader « mini-quadrant » : 4 cellules carrées qui s'allument en
// rotation, reprenant les couleurs des grands domaines disciplinaires
// (DEG/LLA/SHS/STS) — visuellement raccord avec le quadrant principal.
// Utilisé en remplacement du Skeleton générique pendant un fetch lourd
// (typiquement vue Positionnement, plusieurs secondes).
//
// Accessibilité : role=status + aria-live=polite pour annoncer le
// chargement, SVG aria-hidden (purement décoratif), message texte
// explicite. Respecte prefers-reduced-motion (animation stoppée, opacité
// fixée à 0.6 — l'utilisateur voit toujours qu'on charge).
import { COLORS_DOMAINE } from '../utils/colors.js';

export default function LoaderQuadrant({ message = 'Chargement des données…' }) {
  return (
    <div className="loader-quadrant" role="status" aria-live="polite">
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
        <rect className="lq-cell lq-cell-1" x="6"  y="6"  width="28" height="28" rx="2" fill={COLORS_DOMAINE.DEG} />
        <rect className="lq-cell lq-cell-2" x="38" y="6"  width="28" height="28" rx="2" fill={COLORS_DOMAINE.LLA} />
        <rect className="lq-cell lq-cell-3" x="38" y="38" width="28" height="28" rx="2" fill={COLORS_DOMAINE.STS} />
        <rect className="lq-cell lq-cell-4" x="6"  y="38" width="28" height="28" rx="2" fill={COLORS_DOMAINE.SHS} />
      </svg>
      <p className="loader-quadrant-message">{message}</p>
    </div>
  );
}
