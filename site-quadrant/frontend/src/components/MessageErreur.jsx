import { messageErreur } from '../utils/errors.js';

// Bandeau d'erreur DSFR standardisé.
//
// Accepte un `error` : ApiError, Error standard, chaîne (héritage)
// ou null. Si null/undefined, ne rend rien. Sinon affiche une alerte
// fr-alert--error avec le message formaté par messageErreur().
//
// `compact` rend l'alerte en taille fr-alert--sm (utile dans un
// panneau étroit comme DetailsPanel ou dans un toast d'export).

export default function MessageErreur({ error, compact = false }) {
  const message = messageErreur(error);
  if (!message) return null;
  const className = compact
    ? 'fr-alert fr-alert--error fr-alert--sm'
    : 'fr-alert fr-alert--error';
  return (
    <div className={className} role="alert">
      <p>{message}</p>
    </div>
  );
}
