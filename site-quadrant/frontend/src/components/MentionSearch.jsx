import { useApp } from '../context/AppContext.jsx';

// Barre de recherche de mention, à placer au-dessus du bouton « Plus
// de filtres ». L'input est contrôlé via AppContext.rechercheMention :
//   - le Quadrant l'observe pour passer en mode « mise en valeur »
//     (la bulle ciblée est entourée et grossie, les autres atténuées),
//   - la datalist est alimentée par `mentionsAffichees`, publiée par
//     le Quadrant à chaque fetch.
//
// Comportement « match exact (insensible à la casse) » géré côté
// Bulles.jsx — ici on se contente de transmettre la chaîne saisie.

const DATALIST_ID = 'quadrant-mentions-affichees';

export default function MentionSearch() {
  const {
    etabContexte,
    rechercheMention,
    setRechercheMention,
    mentionsAffichees,
  } = useApp();

  const disabled = !etabContexte;

  return (
    <div className="recherche-mention">
      <label htmlFor="quadrant-recherche-mention">
        Rechercher une mention
      </label>
      <input
        id="quadrant-recherche-mention"
        type="search"
        placeholder="Rechercher une mention…"
        value={rechercheMention}
        onChange={(e) => setRechercheMention(e.target.value)}
        list={DATALIST_ID}
        disabled={disabled}
        autoComplete="off"
      />
      <datalist id={DATALIST_ID}>
        {mentionsAffichees.map((libelle) => (
          <option key={libelle} value={libelle} />
        ))}
      </datalist>
    </div>
  );
}
