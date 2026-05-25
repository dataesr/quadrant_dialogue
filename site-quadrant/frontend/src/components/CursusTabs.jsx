import { useApp } from '../context/AppContext.jsx';
import { trackEvent } from '../utils/matomo.js';

// Contrôle segmenté DSFR pour le cursus, à taille normale (uniforme avec
// ViewTabs côté UI). Le `key` est le libellé long attendu par l'API en
// `formation` ; le `short` est l'affichage compact côté UI.

const CURSUS_OPTIONS = [
  { key: 'Licence générale',                       short: 'Licence générale' },
  { key: 'Licence professionnelle',                short: 'Licence pro'      },
  { key: 'Bachelor universitaire de technologie',  short: 'BUT'              },
  { key: 'Master',                                 short: 'Master'           },
];

export default function CursusTabs() {
  const { cursus, setCursus, etabContexte, etabInfo, vue, millesime } = useApp();
  const disabled = !etabContexte;

  function handleChange(nouveauCursus) {
    if (nouveauCursus === cursus) return;
    setCursus(nouveauCursus);
    trackEvent('Navigation', 'change_cursus', null, {
      etab: etabInfo?.libelle,
      vue,
      cursus: nouveauCursus,
      millesime,
    });
  }

  return (
    <fieldset className="fr-segmented fr-mb-2w" disabled={disabled}>
      <legend className="fr-segmented__legend">Cursus</legend>
      <div className="fr-segmented__elements">
        {CURSUS_OPTIONS.map((opt) => {
          const id = `quadrant-cursus-${opt.short.replace(/\s+/g, '-').toLowerCase()}`;
          return (
            <div className="fr-segmented__element" key={opt.key}>
              <input
                type="radio"
                name="quadrant-cursus"
                id={id}
                value={opt.key}
                checked={cursus === opt.key}
                onChange={() => handleChange(opt.key)}
              />
              <label className="fr-label" htmlFor={id}>
                {opt.short}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
