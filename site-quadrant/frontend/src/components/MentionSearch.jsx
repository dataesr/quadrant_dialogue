import { useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import Combobox from './selectors/Combobox.jsx';

// Recherche dans les libellés affichés au quadrant. Délègue toute
// l'UX d'autocomplétion à <Combobox>. Mode « free-text » : on branche
// onTextChange ET onSelect sur rechercheMention pour piloter le
// highlight SVG dès la frappe (highlight exact à match complet, cf.
// libellesMatchent dans Bulles.jsx).
//
// S'adapte à la vue :
//   - Vue Mentions       : recherche une mention.
//   - Vue Positionnement : recherche un établissement parmi les bulles
//                          accessibles (les bulles anonymes n'ont pas
//                          de libellé utile et sont filtrées en amont
//                          par <Quadrant>).
//
// Visibilité (le parent App.jsx masque déjà la vue Positionnement,
// redondante avec le sélecteur d'étab du haut) :
//   - Affichage Tableau : jamais visible (highlight = bulle SVG).
//   - Pas d'établissement sélectionné : input désactivé.

export default function MentionSearch() {
  const {
    vue,
    affichage,
    etabContexte,
    rechercheMention,
    setRechercheMention,
    mentionsAffichees,
    nbBullesAccessibles,
  } = useApp();

  const visible =
    affichage === 'graphique' &&
    (vue === 'mentions' || nbBullesAccessibles >= 2);

  const label       = vue === 'mentions' ? 'Rechercher une mention' : 'Rechercher un établissement';
  const placeholder = vue === 'mentions' ? 'Rechercher une mention…' : 'Rechercher un établissement…';

  // Combobox attend des items { id, libelle, hint? }. Pour la recherche
  // libre on a juste des libellés — id === libelle, ce qui aligne `value`
  // (rechercheMention) sur l'identifiant d'item.
  const items = useMemo(
    () => (mentionsAffichees || []).map((l) => ({ id: l, libelle: l })),
    [mentionsAffichees]
  );

  if (!visible) return null;

  return (
    <Combobox
      id="quadrant-recherche-mention"
      label={label}
      placeholder={placeholder}
      items={items}
      value={rechercheMention}
      onSelect={(id) => setRechercheMention(id)}
      onTextChange={(t) => setRechercheMention(t)}
      disabled={!etabContexte}
    />
  );
}
