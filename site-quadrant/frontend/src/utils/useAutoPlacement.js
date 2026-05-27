import { useLayoutEffect, useRef } from 'react';

// Hook utilitaire : ajuste la position d'un élément flottant (tooltip,
// popover) pour qu'il reste dans le viewport. Posé en transform plutôt
// qu'en `left`/`top` pour ne pas reboucler la mesure (transform sort
// du flux). Renvoie un ref à attacher à l'élément à ajuster.
//
// Le hook resette `transform` à chaque exécution (dépendances), mesure
// `getBoundingClientRect`, puis applique un décalage si l'élément
// dépasse à droite / gauche / bas / haut. Marge configurable (8 px par
// défaut).
//
// Utile dans une iframe à largeur contrainte : window.innerWidth y
// correspond à la largeur de l'iframe, donc le clamp s'applique à
// l'espace réellement visible — pas du site hôte.
export function useAutoPlacement(deps = [], options = {}) {
  const ref = useRef(null);
  const { margin = 8 } = options;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = '';
    const rect = el.getBoundingClientRect();
    const viewportWidth  = typeof window !== 'undefined' ? window.innerWidth  : 0;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    let dx = 0;
    let dy = 0;
    if (rect.right > viewportWidth - margin) {
      dx = (viewportWidth - margin) - rect.right;
    } else if (rect.left < margin) {
      dx = margin - rect.left;
    }
    if (rect.bottom > viewportHeight - margin) {
      dy = (viewportHeight - margin) - rect.bottom;
    } else if (rect.top < margin) {
      dy = margin - rect.top;
    }
    if (dx !== 0 || dy !== 0) {
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
