import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';

// Combobox custom de recherche dans les libellés affichés au quadrant.
// Remplace la datalist HTML5 initiale (qui tronque les libellés longs :
// les libellés MEN tels que « MÉTIERS DE L'ENSEIGNEMENT, DE… »
// étaient illisibles).
//
// S'adapte à la vue active :
//   - Vue Mentions       : recherche une mention.
//   - Vue Positionnement : recherche un établissement (parmi les
//                          bulles avec details_accessibles=true ;
//                          les bulles anonymes n'ont pas de libellé
//                          utile).
//
// Visibilité :
//   - Vue Mentions       : toujours visible.
//   - Vue Positionnement : visible ssi nbBullesAccessibles >= 2.
//     En dessous (1 seule bulle accessible pour un user étab), la
//     barre de recherche n'apporte rien.
//
// Choix d'implémentation :
//   - panneau de suggestions HTML positionné en absolu sous l'input,
//     largeur supérieure à l'input (400 px) pour afficher les libellés
//     en entier (le panneau peut dépasser à droite — sans souci puisque
//     c'est un overlay z-index 20).
//   - filtre insensible à la casse, sur sous-chaîne (.includes).
//   - synchronisation : si AppContext.rechercheMention change ailleurs
//     (par ex. reset), on aligne l'input local dessus.
//   - fermeture par click-outside (mousedown sur document) + ferme
//     au choix d'une suggestion.

const MAX_SUGGESTIONS = 100;

export default function MentionSearch() {
  const {
    vue,
    etabContexte,
    rechercheMention,
    setRechercheMention,
    mentionsAffichees,
    nbBullesAccessibles,
  } = useApp();

  const [open, setOpen]   = useState(false);
  const [texte, setTexte] = useState(rechercheMention || '');
  const wrapperRef = useRef(null);

  const disabled = !etabContexte;
  const visible = vue === 'mentions' || nbBullesAccessibles >= 2;

  // Libellés et identifiants adaptés à la vue. On garde le même id
  // d'input ; seul le texte change. L'aria-label suit le libellé.
  const label       = vue === 'mentions' ? 'Rechercher une mention' : 'Rechercher un établissement';
  const placeholder = vue === 'mentions' ? 'Rechercher une mention…' : 'Rechercher un établissement…';

  // Si le contexte global pousse une nouvelle valeur (reset depuis
  // un bouton « Réinitialiser », par exemple), l'input doit suivre.
  useEffect(() => {
    setTexte(rechercheMention || '');
  }, [rechercheMention]);

  // Click-outside ferme le panneau. mousedown plutôt que click pour ne
  // pas s'auto-fermer juste avant le onClick d'une <li> de suggestion.
  useEffect(() => {
    function handleMouseDown(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const suggestions = useMemo(() => {
    if (!Array.isArray(mentionsAffichees) || mentionsAffichees.length === 0) {
      return [];
    }
    const t = texte.trim().toLowerCase();
    const filtres = t
      ? mentionsAffichees.filter((m) => m.toLowerCase().includes(t))
      : mentionsAffichees;
    // Tri alphabétique pour parcours facile + cap MAX_SUGGESTIONS pour
    // garder le panneau réactif si jamais la vue contient des centaines
    // de mentions.
    return [...filtres].sort((a, b) => a.localeCompare(b, 'fr')).slice(0, MAX_SUGGESTIONS);
  }, [texte, mentionsAffichees]);

  function selectionner(libelle) {
    setTexte(libelle);
    setRechercheMention(libelle);
    setOpen(false);
  }

  function effacer() {
    setTexte('');
    setRechercheMention('');
    setOpen(false);
  }

  if (!visible) return null;

  return (
    <div ref={wrapperRef} className="recherche-mention-combobox">
      <label className="fr-label" htmlFor="quadrant-recherche-mention">
        {label}
      </label>
      <div className="combobox-input-wrapper">
        <input
          id="quadrant-recherche-mention"
          type="text"
          value={texte}
          placeholder={placeholder}
          autoComplete="off"
          disabled={disabled}
          onChange={(e) => {
            setTexte(e.target.value);
            setRechercheMention(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {texte && (
          <button
            type="button"
            onClick={effacer}
            aria-label="Effacer la recherche"
            tabIndex={-1}
          >
            ×
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="combobox-suggestions" role="listbox">
          {suggestions.map((s) => (
            <li
              key={s}
              role="option"
              aria-selected={s === rechercheMention}
              // mousedown plutôt que click : empêche le click-outside de
              // fermer le panneau avant que le click n'atteigne la <li>.
              onMouseDown={(e) => {
                e.preventDefault();
                selectionner(s);
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
