import { useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useQuadrant } from '../hooks/useQuadrant.js';
import { useQuadrantDetails } from '../hooks/useQuadrantDetails.js';
import MiniGrapheEvolution from './details/MiniGrapheEvolution.jsx';
import Sparkline from './details/Sparkline.jsx';
import { extraireSerie } from './details/historique.js';

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
              libelle={formatLibelleIndicateur(variableX, dateInserX)}
              ligneCourante={trouverLigneCourante(data.donnees_courantes, variableX, dateInserX)}
              population={bulleAssociee?.population_x}
              serie={extraireSerie(data.historique, variableX, dateInserX)}
              millesimeCourant={millesime}
            />
            <CardIndicateur
              libelle={formatLibelleIndicateur(variableY, dateInserY)}
              ligneCourante={trouverLigneCourante(data.donnees_courantes, variableY, dateInserY)}
              population={bulleAssociee?.population_y}
              serie={extraireSerie(data.historique, variableY, dateInserY)}
              millesimeCourant={millesime}
            />
          </section>

          <section className="section-autres-indicateurs">
            <h3>Autres indicateurs</h3>
            <TableAutres
              donneesCourantes={data.donnees_courantes}
              historique={data.historique}
              exclus={[
                { indicateur: variableX, date_inser: dateInserX || '' },
                { indicateur: variableY, date_inser: dateInserY || '' },
              ]}
            />
          </section>

          <p className="source-attribution">Source : MESRE - SIES</p>
        </>
      )}
    </aside>
  );
}

// -- Sous-composants internes au panneau -------------------------------

function CardIndicateur({ libelle, ligneCourante, population, serie, millesimeCourant }) {
  const taux  = ligneCourante?.taux;
  const num   = ligneCourante?.numerateur;
  const denom = ligneCourante?.denominateur;
  const nonDiff = ligneCourante?.non_diffusable === true;

  return (
    <div className="indicateur-card">
      <p className="libelle-indicateur">{libelle}</p>
      {taux !== null && taux !== undefined ? (
        <>
          <p className="valeur-principale">
            {formatPourcent(taux)}
          </p>
          <p className="detail-numerateur">
            {num} sur {denom}
            {population ? ` ${population}` : ''}
          </p>
        </>
      ) : nonDiff ? (
        <p className="valeur-principale valeur-non-diffusable">Non diffusable</p>
      ) : denom == null ? (
        <p className="valeur-principale valeur-non-diffusable">Pas de donnée</p>
      ) : null}

      <MiniGrapheEvolution serie={serie} millesimeCourant={millesimeCourant} />
    </div>
  );
}

function TableAutres({ donneesCourantes, historique, exclus }) {
  const lignes = (donneesCourantes || []).filter(
    (r) => !exclus.some(
      (e) => e.indicateur === r.indicateur && (e.date_inser || '') === (r.date_inser || '')
    )
  );

  if (!lignes.length) {
    return <p className="info-vide">Aucun autre indicateur disponible.</p>;
  }

  return (
    <table className="table-autres-indicateurs">
      <tbody>
        {lignes.map((r) => {
          const cle = `${r.indicateur}|${r.date_inser || ''}`;
          const serie = extraireSerie(historique, r.indicateur, r.date_inser);
          const libelle = r.date_inser
            ? `${r.indicateur} (${r.date_inser} mois)`
            : r.indicateur;

          return (
            <tr key={cle}>
              <td className="cellule-libelle">{libelle}</td>
              <td className="cellule-taux">
                {r.taux !== null && r.taux !== undefined ? (
                  formatPourcent(r.taux)
                ) : r.non_diffusable ? (
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
        })}
      </tbody>
    </table>
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
