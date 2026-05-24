import { useEffect, useMemo, useRef, useState } from 'react';

// Combobox d'autocomplétion réutilisable.
//
// Cas d'usage actuels :
//   - <MentionSearch> : recherche d'une mention parmi celles affichées
//     dans le quadrant. Mode « free-text » : la valeur courante est le
//     texte tapé, qui peut ne correspondre à aucun item. onTextChange
//     est branché sur le contexte global pour piloter le highlight SVG.
//   - <EtabSelector> (mode rectorat_national) : sélection d'un
//     établissement parmi la liste visible. Mode « select strict » :
//     seule une sélection valide met à jour le contexte ; l'input
//     affiche le libellé de l'établissement courant.
//
// API :
//   - id           : id du <input>, lié à <label htmlFor>.
//   - label        : libellé visible (texte).
//   - placeholder  : placeholder de l'input.
//   - items        : tableau d'options { id, libelle, hint? }. hint
//                    est optionnel, affiché en gris à droite du libellé
//                    dans la liste (utile pour désambiguer).
//   - value        : id de l'item sélectionné, ou chaîne vide.
//   - onSelect     : (id, item) => void. Tiré uniquement sur sélection
//                    explicite (clic, Entrée, ou clear).
//   - onTextChange : (text) => void. Tiré sur chaque frappe. Optionnel —
//                    omis dans les cas « select strict ».
//   - disabled     : booléen.
//   - maxSuggestions : cap d'affichage du panneau (défaut 100).
//
// Navigation clavier : ArrowUp/ArrowDown déplacent le surlignage,
// Entrée valide, Échap ferme. Click-outside (mousedown) ferme aussi.

const MAX_SUGGESTIONS_DEFAULT = 100;

export default function Combobox({
  id,
  label,
  placeholder,
  items,
  value,
  onSelect,
  onTextChange,
  disabled = false,
  maxSuggestions = MAX_SUGGESTIONS_DEFAULT,
}) {
  const itemsSafe = Array.isArray(items) ? items : [];

  // Libellé de l'item courant (si value pointe sur un item connu).
  const selectedLibelle = useMemo(() => {
    const it = itemsSafe.find((x) => x.id === value);
    return it?.libelle ?? value ?? '';
  }, [itemsSafe, value]);

  const [open, setOpen]           = useState(false);
  const [texte, setTexte]         = useState(selectedLibelle);
  const [highlight, setHighlight] = useState(-1);
  const wrapperRef = useRef(null);

  // Sync : si la sélection change ailleurs (reset, sélection programmée),
  // l'input s'aligne sur le libellé de la nouvelle valeur.
  useEffect(() => {
    setTexte(selectedLibelle);
  }, [selectedLibelle]);

  // Click-outside ferme le panneau. mousedown plutôt que click : un
  // click sur une <li> de suggestion provoquerait sinon la fermeture
  // avant que le handler de la <li> ne s'exécute.
  useEffect(() => {
    function handle(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const suggestions = useMemo(() => {
    const t = texte.trim().toLowerCase();
    // Quand l'input contient pile le libellé sélectionné (ou rien), on
    // affiche la liste complète : on n'oblige pas l'utilisateur à effacer
    // pour explorer.
    const exact = t === (selectedLibelle || '').toLowerCase();
    const filtres = !t || exact
      ? itemsSafe
      : itemsSafe.filter((it) => it.libelle.toLowerCase().includes(t));
    return [...filtres]
      .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))
      .slice(0, maxSuggestions);
  }, [texte, itemsSafe, selectedLibelle, maxSuggestions]);

  function selectionner(item) {
    setTexte(item.libelle);
    onSelect?.(item.id, item);
    onTextChange?.(item.libelle);
    setOpen(false);
    setHighlight(-1);
  }

  function effacer() {
    setTexte('');
    onSelect?.('', null);
    onTextChange?.('');
    setOpen(false);
    setHighlight(-1);
  }

  function handleChange(e) {
    const t = e.target.value;
    setTexte(t);
    onTextChange?.(t);
    setOpen(true);
    setHighlight(0);
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      const it = suggestions[highlight];
      if (it) {
        e.preventDefault();
        selectionner(it);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className="recherche-mention-combobox">
      <label className="fr-label" htmlFor={id}>{label}</label>
      <div className="combobox-input-wrapper">
        <input
          id={id}
          type="text"
          value={texte}
          placeholder={placeholder}
          autoComplete="off"
          disabled={disabled}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {texte && !disabled && (
          <button
            type="button"
            onClick={effacer}
            aria-label="Effacer la sélection"
            tabIndex={-1}
          >
            ×
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="combobox-suggestions" role="listbox">
          {suggestions.map((it, i) => (
            <li
              key={it.id}
              role="option"
              aria-selected={it.id === value}
              data-highlighted={i === highlight ? 'true' : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                selectionner(it);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span>{it.libelle}</span>
              {it.hint && (
                <span className="combobox-suggestion-hint"> {it.hint}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
