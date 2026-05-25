import { useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useQuadrant } from '../hooks/useQuadrant.js';
import { useQuadrantDetails } from '../hooks/useQuadrantDetails.js';
import MiniGrapheEvolution from './details/MiniGrapheEvolution.jsx';
import ProfilInsertion from './details/ProfilInsertion.jsx';
import Sparkline from './details/Sparkline.jsx';
import {
  extraireSerie,
  estIndicateurDeclinable,
  extraireProfilInsertion,
} from './details/historique.js';

// Panneau de détails d'une bulle. S'ouvre quand `detailsCible` est non
// null dans AppContext, se ferme via la croix, la touche Échap ou un
// changement structurel de filtres (géré dans AppContext).
//
// Trois sections :
//   1. En-tête : libellé + identité secondaire + bouton de fermeture
//   2. « Indicateurs du quadrant » : les 2 indicateurs X et Y du
//      quadrant courant, en grand (taux + num/denom/population +
//      mini-graphique d'évolution)
//   3. « Autres indicateurs » : tableau condensé pour les autres
//      tuples (indicateur, date_inser) du cursus, avec sparkline.
//
// Asymétrie API : /quadrant/details ne renvoie pas population_x/y.
// On les pioche dans les bulles de /quadrant (state useQuadrant) pour
// les 2 indicateurs du quadrant courant. Pour les autres indicateurs,
// pas d'année de population — juste le taux + sparkline.

export default function DetailsPanel() {
  const {
    detailsCible,
    setDetailsCible,
    vue,
    cursus,
    millesime,
    variableX, variableY,
    dateInserX, dateInserY,
    etabContexte,
    mention,
    domaine, discipline, secteur, typeMaster,
    representativite, ligneReference,
  } = useApp();

  // Charge le détail. Le hook fait l'idle si la cible est null.
  const details = useQuadrantDetails({
    vue,
    formation: cursus,
    millesime,
    targetId: detailsCible?.targetId,
    etabContexte,
    mention: detailsCible?.mention || (vue === 'etablissements' ? mention : undefined),
  });

  // On lit /quadrant en parallèle (état partagé via useQuadrant — pas
  // de nouvelle requête si le composant Quadrant est déjà monté avec
  // les mêmes paramètres ; useQuadrant ne fait pas de cache mais on
  // bénéficie du même état de la page). Sert uniquement à récupérer
  // population_x / population_y de la bulle ciblée.
  const quadrant = useQuadrant({
    cursus, vue, millesime,
    variableX, variableY, dateInserX, dateInserY,
    etabContexte,
    domaine, discipline, secteur, mention, typeMaster,
    representativite, ligneReference,
  });

  // Échap ferme.
  useEffect(() => {
    if (!detailsCible) return;
    function onKey(e) {
      if (e.key === 'Escape') setDetailsCible(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailsCible, setDetailsCible]);

  // Recherche de la bulle correspondante dans /quadrant pour récupérer
  // population_x / population_y. Lookup tolérant : si la bulle n'est
  // pas trouvée (ex. anonymisée — mais on ne devrait pas pouvoir
  // ouvrir le panneau dans ce cas), on travaille sans population.
  const bulleAssociee = useMemo(() => {
    if (!detailsCible || !quadrant.data?.bulles) return null;
    return quadrant.data.bulles.find((b) => b.id === detailsCible.targetId) || null;
  }, [detailsCible, quadrant.data]);

  if (!detailsCible) return null;

  const data = details.data;
  const identite = data?.identite;

  return (
    <aside className="panneau-details">
      <header>
        <h2>{titreBulle(identite, data?.type)}</h2>
        {identite && (
          <p className="identite-secondaire">{sousTitreBulle(identite, data?.type)}</p>
        )}
        <button
          type="button"
          className="bouton-fermer"
          onClick={() => setDetailsCible(null)}
          aria-label="Fermer le panneau de détails"
        >
          ×
        </button>
      </header>

      {details.loading && <p className="info">Chargement…</p>}
      {details.error && (
        <div className="fr-alert fr-alert--error fr-alert--sm" role="alert">
          <p>{details.error}</p>
        </div>
      )}

      {!details.loading && !details.error && data && (
        <>
          <section className="section-indicateurs-principaux">
            <h3>Indicateurs du quadrant</h3>
            <CardIndicateur
              indicateurName={variableX}
              dateInser={dateInserX}
              donneesCourantes={data.donnees_courantes}
              historique={data.historique}
              population={bulleAssociee?.population_x}
              millesimeCourant={millesime}
            />
            <CardIndicateur
              indicateurName={variableY}
              dateInser={dateInserY}
              donneesCourantes={data.donnees_courantes}
              historique={data.historique}
              population={bulleAssociee?.population_y}
              millesimeCourant={millesime}
            />
          </section>

          <SectionAutresIndicateurs
            donneesCourantes={data.donnees_courantes}
            historique={data.historique}
            indicateursDesAxes={[variableX, variableY]}
            millesimeCourant={millesime}
          />

          <p className="source-attribution">Source : MESRE - SIES</p>
        </>
      )}
    </aside>
  );
}

// -- Sous-composants internes au panneau -------------------------------

// Card des indicateurs d'axe X/Y. Affiche :
//  - le libellé de l'indicateur (avec délai si déclinable)
//  - la valeur courante (taux + numérateur/denom/population, ou
//    « Non diffusable » / « Pas de donnée »)
//  - un graphique :
//      - indicateur DÉCLINABLE → ProfilInsertion (axe X=délai,
//        une courbe par millésime). Le libellé sert de titre au-dessus
//        du SVG ; on cache le titre interne pour éviter le doublon.
//      - indicateur NON déclinable → MiniGrapheEvolution (axe X=
//        millésime, une courbe). Titre caché aussi (le libellé en
//        haut suffit).
function CardIndicateur({
  indicateurName,
  dateInser,
  donneesCourantes,
  historique,
  population,
  millesimeCourant,
}) {
  const ligneCourante = trouverLigneCourante(donneesCourantes, indicateurName, dateInser);
  const declinable = estIndicateurDeclinable(indicateurName, historique);
  const libelle = formatLibelleIndicateur(indicateurName, dateInser);

  return (
    <div className="indicateur-card">
      <p className="libelle-indicateur">{libelle}</p>
      <ValeurCourante ligne={ligneCourante} population={population} />
      {declinable ? (
        <ProfilInsertion
          indicateurName={indicateurName}
          profil={extraireProfilInsertion(indicateurName, historique)}
          millesimeCourant={millesimeCourant}
          showTitle={false}
        />
      ) : (
        <MiniGrapheEvolution
          serie={extraireSerie(historique, indicateurName, dateInser)}
          millesimeCourant={millesimeCourant}
          indicateurName={indicateurName}
          showTitle={false}
        />
      )}
    </div>
  );
}

function ValeurCourante({ ligne, population }) {
  const taux = ligne?.taux;
  const num   = ligne?.numerateur;
  const denom = ligne?.denominateur;
  const nonDiff = ligne?.non_diffusable === true;

  if (taux !== null && taux !== undefined) {
    return (
      <>
        <p className="valeur-principale">{formatPourcent(taux)}</p>
        <p className="detail-numerateur">
          {num} sur {denom}{population ? ` ${population}` : ''}
        </p>
      </>
    );
  }
  if (nonDiff) {
    return <p className="valeur-principale valeur-non-diffusable">Non diffusable</p>;
  }
  if (denom == null) {
    return <p className="valeur-principale valeur-non-diffusable">Pas de donnée</p>;
  }
  return null;
}

// Section « Autres indicateurs ».
// - Les non-déclinables apparaissent dans une table compacte : libellé,
//   taux courant, sparkline.
// - Les déclinables apparaissent en-dessous, chacun avec un profil
//   d'insertion complet (titre + SVG + légende des millésimes).
// On exclut intégralement les indicateurs déjà présents en X/Y du
// quadrant : pour les déclinables, l'exclusion porte sur le nom (un
// indicateur déclinable couvre déjà ses 5 délais dans la card du
// quadrant) ; pour les non-déclinables, sur le tuple (indicateur, '').
function SectionAutresIndicateurs({
  donneesCourantes,
  historique,
  indicateursDesAxes,
  millesimeCourant,
}) {
  const axesSet = new Set(indicateursDesAxes.filter(Boolean));

  // Regroupe par indicateur en gardant l'ordre canonique d'apparition
  // dans donnees_courantes (qui suit dim_indicateur_cursus côté API).
  const ordre = [];
  const seen = new Set();
  for (const r of donneesCourantes || []) {
    if (!seen.has(r.indicateur)) {
      seen.add(r.indicateur);
      ordre.push(r.indicateur);
    }
  }

  const lignesSimples = [];
  const declinables   = [];

  for (const nom of ordre) {
    if (axesSet.has(nom)) continue; // déjà affiché plus haut
    const declinable = estIndicateurDeclinable(nom, historique);
    if (declinable) {
      declinables.push(nom);
    } else {
      // Indicateur non déclinable : un seul tuple (nom, '').
      const ligne = (donneesCourantes || []).find(
        (r) => r.indicateur === nom && !r.date_inser
      );
      if (ligne) lignesSimples.push(ligne);
    }
  }

  if (lignesSimples.length === 0 && declinables.length === 0) {
    return (
      <section className="section-autres-indicateurs">
        <h3>Autres indicateurs</h3>
        <p className="info-vide">Aucun autre indicateur disponible.</p>
      </section>
    );
  }

  return (
    <section className="section-autres-indicateurs">
      <h3>Autres indicateurs</h3>

      {lignesSimples.length > 0 && (
        <table className="table-autres-indicateurs">
          <tbody>
            {lignesSimples.map((r) => (
              <LigneSimple key={r.indicateur} ligne={r} historique={historique} />
            ))}
          </tbody>
        </table>
      )}

      {declinables.map((nom) => (
        <ProfilInsertion
          key={nom}
          indicateurName={nom}
          profil={extraireProfilInsertion(nom, historique)}
          millesimeCourant={millesimeCourant}
        />
      ))}
    </section>
  );
}

function LigneSimple({ ligne, historique }) {
  const serie = extraireSerie(historique, ligne.indicateur, '');
  return (
    <tr>
      <td className="cellule-libelle">{ligne.indicateur}</td>
      <td className="cellule-taux">
        {ligne.taux !== null && ligne.taux !== undefined ? (
          formatPourcent(ligne.taux)
        ) : ligne.non_diffusable ? (
          <span className="non-diffusable">N/D</span>
        ) : (
          <span className="absent">—</span>
        )}
      </td>
      <td className="cellule-sparkline">
        <Sparkline serie={serie} />
      </td>
    </tr>
  );
}

// -- Helpers de formatage ----------------------------------------------

function titreBulle(identite, type) {
  if (!identite) return '';
  if (type === 'mention') return identite.libelle || identite.diplom || '';
  return identite.uo_lib || identite.id_paysage || '';
}

function sousTitreBulle(identite, type) {
  if (type === 'mention') {
    return identite.secteur || '';
  }
  const region = identite.region?.libelle || identite.region?.code || '';
  const typo   = identite.typologie || '';
  return [region, typo].filter(Boolean).join(' · ');
}

function formatLibelleIndicateur(variable, dateInser) {
  if (!variable) return '';
  if (!dateInser) return variable;
  return `${variable} (${dateInser} mois)`;
}

function trouverLigneCourante(donneesCourantes, indicateur, dateInser) {
  if (!donneesCourantes) return null;
  return donneesCourantes.find(
    (r) => r.indicateur === indicateur && (r.date_inser || '') === (dateInser || '')
  ) || null;
}

function formatPourcent(taux) {
  return `${taux.toFixed(1).replace('.', ',')} %`;
}
