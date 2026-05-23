import { useApp } from '../context/AppContext.jsx';

const VIEW_TABS = [
  { key: 'mentions',       label: "Mentions de l'établissement" },
  { key: 'etablissements', label: 'Positionnement' },
];

// Onglets principaux (vue Mentions / vue Établissements).
// Tant qu'aucun établissement n'est sélectionné, les onglets sont disabled —
// le défaut visuel ("Mentions" active) reste affiché pour montrer où on
// arrivera après sélection.

export default function ViewTabs() {
  const { vue, setVue, etabContexte } = useApp();
  const disabled = !etabContexte;

  return (
    <nav className="view-tabs" aria-label="Vue">
      {VIEW_TABS.map((t) => {
        const active = vue === t.key;
        return (
          <button
            key={t.key}
            type="button"
            className={`view-tab${active ? ' view-tab--active' : ''}`}
            onClick={() => setVue(t.key)}
            disabled={disabled}
            aria-pressed={active}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
