import { useApp } from '../context/AppContext.jsx';

// Le `key` est le libellé long (valeur attendue par l'API en `formation`),
// le `short` est l'affichage compact côté UI. Le state porte toujours le
// libellé long pour pouvoir être passé tel quel aux appels API.
const CURSUS = [
  { key: 'Licence générale',                        short: 'Licence générale' },
  { key: 'Licence professionnelle',                 short: 'Licence pro'      },
  { key: 'Bachelor universitaire de technologie',   short: 'BUT'              },
  { key: 'Master',                                  short: 'Master'           },
];

export default function CursusTabs() {
  const { cursus, setCursus, etabContexte } = useApp();
  const disabled = !etabContexte;

  return (
    <nav className="cursus-tabs" aria-label="Cursus">
      {CURSUS.map((c) => {
        const active = cursus === c.key;
        return (
          <button
            key={c.key}
            type="button"
            className={`cursus-tab${active ? ' cursus-tab--active' : ''}`}
            onClick={() => setCursus(c.key)}
            disabled={disabled}
            aria-pressed={active}
          >
            {c.short}
          </button>
        );
      })}
    </nav>
  );
}
