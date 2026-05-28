// Loader « barre de progression » indéterminée : segment qui balaye
// horizontalement la piste. L'endpoint /serie-temporelle renvoie tout
// en une seule réponse, donc pas de vrai pourcentage — l'animation
// indique simplement « ça travaille ».
//
// Accessibilité : role=status + aria-live=polite, message texte,
// prefers-reduced-motion → animation stoppée (segment figé à pleine
// largeur, opacité réduite — l'utilisateur voit qu'on charge).
import PromoDataEsr from './PromoDataEsr.jsx';

export default function LoaderBarre({ message = 'Chargement de l’historique…' }) {
  return (
    <div className="loader-barre" role="status" aria-live="polite">
      <div className="loader-barre-track" aria-hidden="true">
        <div className="loader-barre-fill" />
      </div>
      <p className="loader-barre-message">{message}</p>
      <PromoDataEsr />
    </div>
  );
}
