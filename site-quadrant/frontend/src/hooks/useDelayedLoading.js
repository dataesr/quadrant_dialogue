import { useEffect, useState } from 'react';

// Anti-flash : retarde l'affichage d'un loader tant que le chargement
// n'a pas franchi `delai` ms. Un changement de filtre qui revient en
// <350 ms ne fait jamais clignoter de loader — l'utilisateur voit le
// passage directement aux nouvelles données.
//
// Usage :
//   const { loading, data } = useQuadrant(...);
//   const showLoader = useDelayedLoading(loading);
//   if (showLoader) return <LoaderQuadrant />;
//
// Reset immédiat dès que isLoading repasse à false (sans délai),
// pour ne pas laisser un loader persister après l'arrivée des données.
export function useDelayedLoading(isLoading, delai = 350) {
  const [showLoader, setShowLoader] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowLoader(false);
      return undefined;
    }
    const t = setTimeout(() => setShowLoader(true), delai);
    return () => clearTimeout(t);
  }, [isLoading, delai]);

  return showLoader;
}
