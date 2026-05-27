import { useCallback, useLayoutEffect, useRef } from 'react';

// Hook utilitaire : ajuste la position d'un élément flottant (tooltip,
// popover) pour qu'il reste dans le viewport. Posé en transform plutôt
// qu'en `left`/`top` pour ne pas reboucler la mesure (transform sort
// du flux). Renvoie un callback-ref à attacher à l'élément à ajuster.
//
// Implémentation — pourquoi callback-ref + double mesure :
//
// 1) Callback-ref plutôt que useRef classique. La callback ref est
//    invoquée SYNCHRONEMENT par React à l'attachement de l'élément
//    DOM (et avec null au détachement). En tirant la mesure dans cette
//    callback, on a la garantie que l'élément est en place quand on
//    appelle getBoundingClientRect — y compris lors du tout premier
//    render où le tooltip est monté (cas où useLayoutEffect peut
//    s'exécuter avant que le ref classique ne soit pointé sur le
//    nouvel élément selon le micro-timing de la commit phase).
//
// 2) useLayoutEffect + requestAnimationFrame. La useLayoutEffect tire
//    aussi à chaque changement de deps (survol d'un autre point d'un
//    graphe par ex.). On y refait la mesure pour rattraper le cas où
//    React garde le même élément DOM monté mais met juste à jour
//    style.left/top — la callback ref ne re-fire pas dans ce cas-là.
//    Le requestAnimationFrame en complément attrape les layouts qui
//    se stabilisent en plusieurs étapes (panneau-details avec
//    overflow-y: auto entraîne overflow-x: auto implicite, ce qui
//    décale parfois la mesure d'un cran).
//
// Utile dans une iframe à largeur contrainte : window.innerWidth y
// correspond à la largeur de l'iframe, donc le clamp s'applique à
// l'espace réellement visible — pas du site hôte.
export function useAutoPlacement(deps = [], options = {}) {
  const { margin = 8 } = options;
  const elRef = useRef(null);

  const adjust = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    // Reset transform AVANT mesure, sinon on cumulerait les corrections
    // d'un survol à l'autre quand React garde le même élément monté.
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
  }, [margin]);

  // Re-mesure à chaque changement de deps (typiquement le state qui
  // déclenche le re-positionnement du tooltip via style.left/top).
  // useLayoutEffect tire AVANT la peinture du navigateur → l'utilisateur
  // ne voit jamais la position non-translatée.
  // requestAnimationFrame en filet de sécurité pour les conteneurs à
  // overflow qui re-layout en plusieurs frames.
  useLayoutEffect(() => {
    adjust();
    const rafId = typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame(adjust)
      : null;
    return () => {
      if (rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(rafId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjust, ...deps]);

  // Callback ref : invoquée par React à l'attachement avec l'élément
  // et au détachement avec null. À l'attachement on déclenche un
  // adjust() immédiat — couvre le mount initial du tooltip où la
  // useLayoutEffect du même commit a pu tirer avant l'attachement
  // selon le micro-timing.
  const setRef = useCallback(
    (el) => {
      elRef.current = el;
      if (el) adjust();
    },
    [adjust],
  );

  return setRef;
}
