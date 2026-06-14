import { formatEuroSalaire, celluleSalaireValide } from '../../utils/salaires.js';

// Bloc « salaire » dans l'esprit des fiches de formation Parcoursup
// (Phase 15.6), mais sur la VRAIE médiane de la mention/sous-population
// (et non une moyenne nationale de type de formation) :
//
//   Salaire à 18 mois
//        2 240 €
//   Salaire médian net / mois
//   1 850 € ●━━━━━━━━━● 2 680 €
//      50 % gagnent moins  50 % gagnent plus
//   Sur 87 sortants en emploi salarié
//
// La barre Q1–Q3 est décorative (Q1 à gauche, Q3 à droite) : la médiane
// est la valeur mise en avant au-dessus, comme sur Parcoursup.
//
// Props :
//   - donnees   : { nb_salaires, q1, q2, q3 } | null
//   - titre     : ex « Salaire à 18 mois »
//   - sous_titre: ex « Sur 87 sortants en emploi salarié » (optionnel)
//   - taille    : 'compact' | 'standard' (défaut 'standard')
//   - messageVide : message affiché si donnees absent (défaut « Non disponible »)

export default function BlocSalaireParcoursup({
  donnees,
  titre,
  sous_titre,
  taille = 'standard',
  messageVide = 'Non disponible',
}) {
  const valide = celluleSalaireValide(donnees);
  const classe = `bloc-salaire bloc-salaire--${taille}`;

  return (
    <div className={classe}>
      {titre && <p className="bloc-salaire-titre">{titre}</p>}

      {!valide ? (
        <p className="bloc-salaire-vide">{messageVide}</p>
      ) : (
        <>
          <p className="bloc-salaire-mediane">{formatEuroSalaire(donnees.q2)}</p>
          <p className="bloc-salaire-mediane-label">Salaire médian net / mois</p>

          {(typeof donnees.q1 === 'number' || typeof donnees.q3 === 'number') && (
            <>
              <div className="bloc-salaire-quartiles" aria-hidden="true">
                <span className="bsq-borne bsq-borne--q1">
                  {typeof donnees.q1 === 'number' ? formatEuroSalaire(donnees.q1) : ''}
                </span>
                <span className="bsq-bar">
                  <span className="bsq-dot" />
                  <span className="bsq-line" />
                  <span className="bsq-dot" />
                </span>
                <span className="bsq-borne bsq-borne--q3">
                  {typeof donnees.q3 === 'number' ? formatEuroSalaire(donnees.q3) : ''}
                </span>
              </div>
              <div className="bloc-salaire-quartiles-legende" aria-hidden="true">
                <span>1er quartile · 25 % gagnent moins</span>
                <span>3e quartile · 25 % gagnent plus</span>
              </div>
            </>
          )}

          {sous_titre && <p className="bloc-salaire-soustitre">{sous_titre}</p>}
        </>
      )}
    </div>
  );
}
