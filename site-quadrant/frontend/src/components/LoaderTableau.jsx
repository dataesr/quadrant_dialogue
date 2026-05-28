// Loader « tableau » : 4 rangées horizontales qui pulsent en séquence
// pour évoquer le remplissage d'un tableau ligne par ligne. Pendant
// d'esprit de LoaderQuadrant (4 cellules) mais avec une thématique
// claire de tableau — utilisé quand l'utilisateur bascule sur la vue
// Tableau et qu'un fetch /quadrant est en cours.
//
// Couleurs des 4 grands domaines disciplinaires (DEG/LLA/STS/SHS) —
// même palette que LoaderQuadrant pour la cohérence visuelle entre
// les deux loaders : l'utilisateur perçoit que c'est la même app qui
// charge, juste pour une représentation différente des données.
//
// Largeurs variables des rangées (60, 48, 56, 42 px) pour évoquer la
// réalité d'un tableau dont les colonnes n'ont pas toutes la même
// largeur — moins « parfait » que 4 rectangles identiques, plus
// reconnaissable comme métaphore de tableau.
//
// Accessibilité : role=status + aria-live=polite (annonce le
// chargement), SVG aria-hidden (décoratif), message texte. Respecte
// prefers-reduced-motion (animation stoppée, opacité fixée).
import { COLORS_DOMAINE } from '../utils/colors.js';
import PromoDataEsr from './PromoDataEsr.jsx';

export default function LoaderTableau({ message = 'Chargement du tableau…' }) {
  return (
    <div className="loader-tableau" role="status" aria-live="polite">
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
        <rect className="lt-row lt-row-1" x="6" y="10" width="60" height="10" rx="2" fill={COLORS_DOMAINE.DEG} />
        <rect className="lt-row lt-row-2" x="6" y="24" width="48" height="10" rx="2" fill={COLORS_DOMAINE.LLA} />
        <rect className="lt-row lt-row-3" x="6" y="38" width="56" height="10" rx="2" fill={COLORS_DOMAINE.STS} />
        <rect className="lt-row lt-row-4" x="6" y="52" width="42" height="10" rx="2" fill={COLORS_DOMAINE.SHS} />
      </svg>
      <p className="loader-tableau-message">{message}</p>
      <PromoDataEsr />
    </div>
  );
}
