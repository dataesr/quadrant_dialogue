// Helper centralisé de mise en forme des erreurs API en messages
// utilisateur. Accepte indifféremment une instance d'ApiError, une
// Error standard, ou une chaîne (héritage : certains hooks stockent
// historiquement le message déjà formaté). Retourne null si pas
// d'erreur — pratique pour un rendu conditionnel.
//
// Convention de statut :
//   - `status === 0` (ou absent) : erreur réseau (DNS, timeout, mixed
//     content). C'est ApiError qui pose `status: 0` quand fetch lui-
//     même rejette — cf. services/api.js > request().
//   - 404           : ressource introuvable côté API.
//   - 429           : rate-limit serveur (cf. lib/RateLimit.php).
//   - 5xx           : erreur serveur générique.
//   - autres        : on retombe sur le message de l'API si dispo,
//                     sinon un libellé générique.

export function messageErreur(err) {
  if (!err) return null;

  // Cas d'une chaîne déjà formatée (rétro-compat) : on la renvoie
  // telle quelle. Pas idéal, mais ne pas casser les hooks qui
  // stockent encore err.message.
  if (typeof err === 'string') return err;

  const status = typeof err.status === 'number' ? err.status : null;

  if (status === null || status === 0) {
    return 'Connexion impossible. Vérifiez votre accès internet et réessayez.';
  }
  if (status === 404) {
    return 'Données non disponibles pour cette combinaison.';
  }
  if (status === 429) {
    return 'Trop de requêtes en peu de temps. Patientez quelques secondes avant de réessayer.';
  }
  if (status >= 500) {
    return 'Erreur serveur. Réessayez dans quelques instants. '
      + 'Si le problème persiste, contactez l\'administrateur.';
  }
  return err.message || 'Une erreur est survenue.';
}
