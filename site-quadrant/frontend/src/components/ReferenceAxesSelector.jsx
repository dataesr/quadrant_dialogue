import { useApp } from '../context/AppContext.jsx';
import { trackEvent } from '../utils/matomo.js';

// Sélecteur enrichi de référence des axes (Phase 15.1), sorti des
// « Plus d'options » et rendu visible sous le quadrant. Style « pilule »
// cohérent avec les contrôles d'animation.
//
//   Vue Mentions :
//     - Mesure   : Médiane | Moyenne (exclusif, l'un toujours actif).
//     - Périmètre: Établissement | National (multi-sélection — 0, 1 ou 2
//                  actifs ; 0 actif = aucune ligne de référence tracée).
//   Vue Positionnement :
//     - Mesure uniquement (Médiane | Moyenne). Le périmètre est national
//       par construction (pas de filtre étab) → pas de sélecteur de
//       périmètre. Pilote `referenceAxesPositionnement` (paramètre
//       `agregation` côté API → data.reference).
//
// Les couleurs des pilules de périmètre rappellent celles des lignes
// tracées sur le quadrant (étab = bleu Marianne, national = gris) — cf.
// LignesReference.jsx.

export default function ReferenceAxesSelector() {
  const {
    vue, etabContexte, etabInfo, cursus, millesime,
    mesureAxes, setMesureAxes,
    perimetresAxes, togglePerimetreAxes,
    referenceAxesPositionnement, setReferenceAxesPositionnement,
  } = useApp();

  const disabled = !etabContexte;

  function choisirMesure(valeur) {
    if (vue === 'mentions') {
      setMesureAxes(valeur);
    } else {
      setReferenceAxesPositionnement(valeur);
    }
    trackEvent('Référence axes', 'mesure', valeur, {
      etab: etabInfo?.libelle, vue, cursus, millesime,
    });
  }

  function basculerPerimetre(perimetre) {
    togglePerimetreAxes(perimetre);
    // L'état après bascule n'est pas encore lu ici (setState async) ; on
    // logge l'intention (ajout/retrait) à partir de l'état courant.
    const action = perimetresAxes.includes(perimetre) ? 'retrait' : 'ajout';
    trackEvent('Référence axes', `perimetre_${action}`, perimetre, {
      etab: etabInfo?.libelle, vue, cursus, millesime,
    });
  }

  // Mesure active selon la vue.
  const mesureActive = vue === 'mentions' ? mesureAxes : referenceAxesPositionnement;

  return (
    <div className="reference-axes-selecteur" aria-label="Référence des axes">
      <span className="ref-axes-titre">Référence des axes</span>

      <div className="ref-axes-groupe" role="group" aria-label="Mesure">
        <span className="ref-axes-label">Mesure</span>
        {[
          { value: 'mediane', label: 'Médiane' },
          { value: 'moyenne', label: 'Moyenne' },
        ].map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={
              'ref-axes-pilule' +
              (mesureActive === opt.value ? ' ref-axes-pilule--actif' : '')
            }
            aria-pressed={mesureActive === opt.value}
            disabled={disabled}
            onClick={() => choisirMesure(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Périmètre — vue Mentions uniquement (multi-sélection). En vue
          Positionnement la vue est nationale par construction, le
          périmètre n'a pas de sens. */}
      {vue === 'mentions' && (
        <div className="ref-axes-groupe" role="group" aria-label="Périmètre">
          <span className="ref-axes-label">Périmètre</span>
          {[
            { value: 'etab',     label: 'Établissement', classe: 'ref-axes-pilule--etab' },
            { value: 'national', label: 'National',      classe: 'ref-axes-pilule--national' },
          ].map((opt) => {
            const actif = perimetresAxes.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                className={
                  'ref-axes-pilule ' + opt.classe +
                  (actif ? ' ref-axes-pilule--actif' : '')
                }
                aria-pressed={actif}
                disabled={disabled}
                onClick={() => basculerPerimetre(opt.value)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
