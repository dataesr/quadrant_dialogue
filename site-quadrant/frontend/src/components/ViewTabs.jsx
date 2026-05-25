import { useApp } from '../context/AppContext.jsx';
import { trackEvent } from '../utils/matomo.js';

// Contrôle segmenté DSFR pour la vue (Mentions / Positionnement).
// Le composant `fr-segmented` est un fieldset de radios — quand on met le
// fieldset à `disabled`, tous les radios deviennent disabled et le DSFR
// applique automatiquement le style grisé sur le label sélectionné.

const VIEW_OPTIONS = [
  { key: 'mentions',       label: "Mentions de l'établissement" },
  { key: 'etablissements', label: 'Positionnement'              },
];

export default function ViewTabs() {
  const { vue, setVue, etabContexte, etabInfo, cursus, millesime } = useApp();
  const disabled = !etabContexte;

  function handleChange(nouvelleVue) {
    if (nouvelleVue === vue) return;
    setVue(nouvelleVue);
    trackEvent('Navigation', 'change_vue', null, {
      etab: etabInfo?.libelle,
      vue: nouvelleVue,
      cursus,
      millesime,
    });
  }

  return (
    <fieldset className="fr-segmented fr-mb-2w" disabled={disabled}>
      <legend className="fr-segmented__legend">Vue</legend>
      <div className="fr-segmented__elements">
        {VIEW_OPTIONS.map((opt) => {
          const id = `quadrant-vue-${opt.key}`;
          return (
            <div className="fr-segmented__element" key={opt.key}>
              <input
                type="radio"
                name="quadrant-vue"
                id={id}
                value={opt.key}
                checked={vue === opt.key}
                onChange={() => handleChange(opt.key)}
              />
              <label className="fr-label" htmlFor={id}>
                {opt.label}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
