import { useApp } from '../context/AppContext.jsx';
import { trackEvent } from '../utils/matomo.js';

// Sélecteur enrichi de référence des axes (Phase 15.1, compacté 15.2).
// Rendu sur UNE seule ligne, au-dessus de la zone de filtres/quadrant :
//
//   Référence des axes : [Médiane] [Moyenne]   [Établissement] [National]
//
//   - Mesure    : Médiane | Moyenne (exclusif, l'une toujours active).
//   - Périmètre : Établissement | National (multi — au moins un actif,
//     bascule auto si on désactive le dernier, cf. AppContext).
//   Vue Positionnement : Mesure seule (périmètre national implicite →
//   pilote `referenceAxesPositionnement` / paramètre `agregation`).
//
// Pas de labels « Mesure » / « Périmètre » : le titre suffit. Les groupes
// gardent un aria-label pour la sémantique. Les pilules de périmètre
// actives reprennent la couleur de leur ligne (étab = bleu, national =
// gris) — cf. utils/referenceAxes.js / LignesReference.jsx.

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
    // L'état après bascule n'est pas encore lu ici (setState async) ; on
    // logge l'intention à partir de l'état courant.
    const action = perimetresAxes.includes(perimetre) ? 'retrait' : 'ajout';
    togglePerimetreAxes(perimetre);
    trackEvent('Référence axes', `perimetre_${action}`, perimetre, {
      etab: etabInfo?.libelle, vue, cursus, millesime,
    });
  }

  const mesureActive = vue === 'mentions' ? mesureAxes : referenceAxesPositionnement;

  return (
    <div className="ref-axes-container" aria-label="Référence des axes">
      <span className="ref-axes-titre">Référence des axes&nbsp;:</span>

      <div className="ref-axes-groupe ref-axes-mesure" role="group" aria-label="Mesure">
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
          Positionnement la vue est nationale par construction. */}
      {vue === 'mentions' && (
        <div className="ref-axes-groupe ref-axes-perimetre" role="group" aria-label="Périmètre">
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
