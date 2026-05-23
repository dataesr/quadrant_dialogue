// Bloc d'information neutre affiché dans la zone principale en l'absence de
// contenu réel (quadrant + filtres pas encore branchés). Utilise l'alerte
// info du DSFR — pas de couleur ni de typographie custom.

const MESSAGES = {
  'no-selection': 'Sélectionner un établissement pour afficher le quadrant.',
  'placeholder':
    'Le quadrant et les filtres seront affichés ici (phase 3 à venir).',
};

export default function EmptyState({ variant = 'placeholder' }) {
  return (
    <div className="fr-alert fr-alert--info">
      <p>{MESSAGES[variant] || MESSAGES['placeholder']}</p>
    </div>
  );
}
