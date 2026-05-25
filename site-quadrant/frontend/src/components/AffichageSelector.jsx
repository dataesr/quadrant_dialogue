import { useApp } from '../context/AppContext.jsx';
import { trackEvent } from '../utils/matomo.js';

// Toggle entre vue graphique (quadrant SVG) et vue tableau. Segmented
// control DSFR, identique au sélecteur Médiane/Moyenne.
//
// Visibilité :
//  - Vue Mentions : toujours visible (un étab avec 1 seule mention
//    doit pouvoir voir cette mention en tableau).
//  - Vue Positionnement (etablissements) : visible ssi
//    nbBullesAccessibles >= 2. En dessous, un tableau n'apporterait rien
//    (1 seule ligne ou que des « Non diffusable » pour un user au
//    niveau étab).

export default function AffichageSelector() {
  const {
    vue, affichage, setAffichage, nbBullesAccessibles,
    etabInfo, cursus, millesime,
  } = useApp();

  const visible = vue === 'mentions' || nbBullesAccessibles >= 2;
  if (!visible) return null;

  function handleChange(nouvelAffichage) {
    if (nouvelAffichage === affichage) return;
    setAffichage(nouvelAffichage);
    trackEvent('Navigation', 'change_affichage', nouvelAffichage, {
      etab: etabInfo?.libelle,
      vue,
      cursus,
      millesime,
    });
  }

  return (
    <fieldset className="fr-segmented fr-segmented--sm">
      <legend className="fr-segmented__legend">Affichage</legend>
      <div className="fr-segmented__elements">
        <div className="fr-segmented__element">
          <input
            type="radio"
            id="affichage-graphique"
            name="affichage"
            value="graphique"
            checked={affichage === 'graphique'}
            onChange={() => handleChange('graphique')}
          />
          <label className="fr-label" htmlFor="affichage-graphique">Graphique</label>
        </div>
        <div className="fr-segmented__element">
          <input
            type="radio"
            id="affichage-tableau"
            name="affichage"
            value="tableau"
            checked={affichage === 'tableau'}
            onChange={() => handleChange('tableau')}
          />
          <label className="fr-label" htmlFor="affichage-tableau">Tableau</label>
        </div>
      </div>
    </fieldset>
  );
}
