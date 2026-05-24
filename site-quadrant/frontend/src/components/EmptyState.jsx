// Bloc d'information neutre affiché dans la zone principale en l'absence
// de contenu réel (aucun établissement sélectionné). Utilise l'alerte
// info du DSFR — pas de couleur ni de typographie custom.

const MESSAGES = {
  'no-selection': 'Sélectionner un établissement pour afficher le quadrant.',
};

export default function EmptyState({ variant = 'no-selection' }) {
  return (
    <div className="fr-alert fr-alert--info">
      <p>{MESSAGES[variant] || MESSAGES['no-selection']}</p>
    </div>
  );
}
