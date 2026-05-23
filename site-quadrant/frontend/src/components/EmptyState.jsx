// Bloc neutre affiché dans la zone principale tant que le contenu réel
// (quadrant + filtres) n'est pas disponible. Deux variantes :
//   - "no-selection" : aucun étab choisi (rôle rectorat/national au démarrage)
//   - "placeholder"  : étab choisi, contenu phase 3 à venir

const MESSAGES = {
  'no-selection': 'Sélectionner un établissement pour afficher le quadrant.',
  'placeholder':
    'Le quadrant et les filtres seront affichés ici (phase 3 à venir).',
};

export default function EmptyState({ variant = 'placeholder' }) {
  return (
    <div className="empty-state">
      {MESSAGES[variant] || MESSAGES['placeholder']}
    </div>
  );
}
