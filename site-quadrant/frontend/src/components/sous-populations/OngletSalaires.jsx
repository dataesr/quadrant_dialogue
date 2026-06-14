import BlocSalaireParcoursup from './BlocSalaireParcoursup.jsx';
import GraphiqueEvolutionSalaires from './GraphiqueEvolutionSalaires.jsx';
import AideTooltip from '../AideTooltip.jsx';
import { aAuMoinsUnSalaire } from '../../utils/salaires.js';
import { AIDE_SALAIRES } from '../../utils/methodologieSalaires.js';

// Onglet « Salaires » de la modale d'analyse fine (Phase 15.6).
//
// Grille de 6 blocs (référence + 5 sous-populations principales). Chaque
// bloc : bloc Parcoursup (médiane + Q1–Q3) à la durée courante + graphique
// d'évolution sur la durée d'observation (12/18/24/30 mois). Pas de
// graphique sur les millésimes (un seul millésime dans la modale). Échelle
// Y adaptée individuellement à chaque bloc.
//
// La durée affichée est pilotée par le slider/animation commun (dureeCourante).
// Cas durée = 6 : pas de salaire à 6 mois (méthodologie SIES) → le bloc
// Parcoursup affiche « Non disponible à 6 mois », le graphique reste sur
// 12/18/24/30.
//
// Sous-population sans aucune donnée : bloc conservé (libellé + message)
// pour préserver la grille visuelle.

// Ordre + libellés courts de la grille (alignés sur les ids backend).
const BLOCS = [
  { id: 'reference',            titre: 'Référence',                       sous: 'Diplômés français' },
  { id: 'femmes',               titre: 'Femmes',                          sous: 'Diplômées françaises' },
  { id: 'hommes',               titre: 'Hommes',                          sous: 'Diplômés français' },
  { id: 'apprentis',            titre: 'Apprentis',                       sous: 'Diplômés français' },
  { id: 'tous_nationalite',     titre: 'Diplômés français et étrangers',  sous: 'Effet nationalité' },
  { id: 'ensemble_diplomation', titre: 'Diplômés et non diplômés français', sous: 'Effet diplomation' },
];

export default function OngletSalaires({ salairesParSousPop, dureeCourante, millesime }) {
  if (!salairesParSousPop) return null;

  const duree6 = Number(dureeCourante) === 6;

  return (
    <div className="onglet-salaires">
      <p className="onglet-salaires-intro">
        Salaire mensuel net médian (équivalent temps plein) des sortants en emploi
        salarié, par sous-population — millésime {millesime}.
        {' '}
        <AideTooltip texte={AIDE_SALAIRES} ariaLabel="À propos des salaires" />
      </p>

      <div className="onglet-salaires-grille">
        {BLOCS.map(({ id, titre, sous }) => {
          const sp = salairesParSousPop[id];
          const dpd = sp?.donnees_par_duree || null;
          const aData = aAuMoinsUnSalaire(dpd);

          return (
            <div key={id} className="bloc-salaire-sp">
              <p className="bloc-salaire-sp-titre">{titre}</p>
              <p className="bloc-salaire-sp-sous">{sous}</p>

              {!aData ? (
                <p className="bloc-salaire-sp-vide">
                  Données non disponibles (effectifs insuffisants)
                </p>
              ) : (
                <>
                  <BlocSalaireParcoursup
                    donnees={duree6 ? null : dpd[String(dureeCourante)]}
                    titre={`À ${dureeCourante} mois`}
                    sous_titre={
                      !duree6 && dpd[String(dureeCourante)]?.nb_salaires != null
                        ? `Sur ${dpd[String(dureeCourante)].nb_salaires.toLocaleString('fr-FR')} sortants`
                        : null
                    }
                    taille="standard"
                    messageVide={duree6 ? 'Non disponible à 6 mois' : `Non disponible à ${dureeCourante} mois`}
                  />
                  <GraphiqueEvolutionSalaires
                    donnees={dpd}
                    abscisses="durees"
                    marqueur_x={dureeCourante}
                    hauteur={110}
                    variant="standard"
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
