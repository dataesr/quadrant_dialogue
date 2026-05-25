import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useQuadrant } from '../hooks/useQuadrant.js';
import { useQuadrantDetails } from '../hooks/useQuadrantDetails.js';
import MiniGrapheEvolution from './details/MiniGrapheEvolution.jsx';
import MiniGrapheEffectifs from './details/MiniGrapheEffectifs.jsx';
import GrapheMultiCourbes from './details/GrapheMultiCourbes.jsx';
import Sparkline from './details/Sparkline.jsx';
import {
  extraireSerie,
  decouperGroupes,
  seriesReussite,
  seriesInsertion,
} from './details/historique.js';
import { LIBELLE_SOURCE, MENTION_DIFFUSION } from '../utils/constants.js';
import { exportFicheDocx } from '../utils/exportDocx.js';

// Panneau de détails d'une bulle.
//
// Structure :
//   1. En-tête (libellé, identité secondaire, croix de fermeture)
//   2. « Indicateurs du quadrant » : 2 cards X et Y avec MiniGrapheEvolution
//      (1 courbe = la variante exacte choisie pour le quadrant). Pas
//      de graphique multi-courbes dans les cards — la profondeur
//      multi-variantes est dans la section « Autres ».
//   3. « Autres indicateurs » découpée en trois sous-blocs ordonnés :
//        a. Réussite (regroupement de tous les indicateurs « Taux de
//           réussite en ... » → un seul GrapheMultiCourbes, une courbe
//           par durée).
//        b. Indicateurs simples (non-déclinables hors réussite et hors
//           axes X/Y) → table compacte, 1 ligne par indicateur.
//        c. Indicateurs d'insertion (déclinables hors réussite) → un
//           GrapheMultiCourbes par indicateur, une courbe par délai
//           (6/12/18/24/30 mois).
//      Robustesse : si un groupe se retrouve avec 0 ou 1 indicateur
//      (cas d'un retrait en BDD), on dégrade vers la table simple
//      plutôt que de produire un graphique multi-courbes dégénéré.
//
// Asymétrie API : /quadrant/details ne renvoie pas population_x/y.
// On les pioche dans /quadrant (useQuadrant) — affichées uniquement
// pour les axes X/Y dans la card. Les autres indicateurs n'affichent
// pas la population.

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
    etabInfo,
    mention,
    domaine, discipline, secteur, typeMaster,
    representativite, ligneReference,
  } = useApp();

  // Ref vers <aside> pour permettre à l'export Word de cibler le
  // panneau (capture des sous-éléments via html-to-image).
  const panneauRef = useRef(null);
  const [exportFiche, setExportFiche] = useState({ running: false, erreur: null });

  const details = useQuadrantDetails({
    vue,
    formation: cursus,
    millesime,
    targetId: detailsCible?.targetId,
    etabContexte,
    mention: detailsCible?.mention || (vue === 'etablissements' ? mention : undefined),
  });

  // /quadrant en parallèle pour les population_x/y de la bulle ciblée.
  const quadrant = useQuadrant({
    cursus, vue, millesime,
    variableX, variableY, dateInserX, dateInserY,
    etabContexte,
    domaine, discipline, secteur, mention, typeMaster,
    representativite, ligneReference,
  });

  useEffect(() => {
    if (!detailsCible) return;
    function onKey(e) {
      if (e.key === 'Escape') setDetailsCible(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailsCible, setDetailsCible]);

  const bulleAssociee = useMemo(() => {
    if (!detailsCible || !quadrant.data?.bulles) return null;
    return quadrant.data.bulles.find((b) => b.id === detailsCible.targetId) || null;
  }, [detailsCible, quadrant.data]);

  if (!detailsCible) return null;

  const data = details.data;
  const identite = data?.identite;

  // Pré-conditions pour l'export Word : le panneau doit être chargé,
  // au moins une donnée courante, et un ref DOM cible disponible.
  const ficheExportable =
    !!data && !!identite && !details.loading && !details.error;

  async function handleExportFiche() {
    if (!ficheExportable || !panneauRef.current) return;
    setExportFiche({ running: true, erreur: null });
    try {
      await exportFicheDocx({
        ficheData: data,
        contexte: {
          etabInfo,
          cursus, vue, millesime,
          variableX, variableY, dateInserX, dateInserY,
          populationX: bulleAssociee?.population_x,
          populationY: bulleAssociee?.population_y,
        },
        panneauEl: panneauRef.current,
      });
      setExportFiche({ running: false, erreur: null });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Export fiche Word :', err);
      setExportFiche({ running: false, erreur: err?.message || 'Échec de l\'export.' });
    }
  }

  return (
    <aside className="panneau-details" ref={panneauRef}>
      <header>
        <h2>{titreBulle(identite, data?.type)}</h2>
        {identite && (
          <p className="identite-secondaire">{sousTitreBulle(identite, data?.type)}</p>
        )}
        <button
          type="button"
          className="bouton-export-fiche"
          onClick={handleExportFiche}
          disabled={!ficheExportable || exportFiche.running}
          aria-label="Télécharger cette fiche au format Word"
          title="Télécharger cette fiche au format Word"
        >
          <span className="fr-icon-download-line" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="bouton-fermer"
          onClick={() => setDetailsCible(null)}
          aria-label="Fermer le panneau de détails"
        >
          ×
        </button>
      </header>

      {exportFiche.erreur && (
        <div className="fr-alert fr-alert--error fr-alert--sm" role="alert">
          <p>Export Word : {exportFiche.erreur}</p>
        </div>
      )}

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

          <p className="source-attribution">{LIBELLE_SOURCE}</p>
          <p className="mention-diffusion">{MENTION_DIFFUSION}</p>
        </>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------
// Card pour un axe X ou Y. Une seule variante affichée (la date_inser
// du quadrant) — pour la profondeur multi-variantes, voir la section
// « Évolution historique des indicateurs ».
//
// Bascule locale entre deux représentations de la même série :
//   - « Taux »     : MiniGrapheEvolution (axe Y = %)
//   - « Effectifs »: MiniGrapheEffectifs  (axe Y = effectifs absolus,
//                    2 courbes num + denom). Utile pour distinguer
//                    une variation de taux qui vient d'un changement
//                    de numérateur, de dénominateur, ou des deux.
// ---------------------------------------------------------------------
function CardIndicateur({
  indicateurName,
  dateInser,
  donneesCourantes,
  historique,
  population,
  millesimeCourant,
}) {
  const ligneCourante = trouverLigneCourante(donneesCourantes, indicateurName, dateInser);
  const libelle = formatLibelleIndicateur(indicateurName, dateInser);
  const serie = useMemo(
    () => extraireSerie(historique, indicateurName, dateInser),
    [historique, indicateurName, dateInser]
  );

  const [vueGraphe, setVueGraphe] = useState('taux');
  // useId : identifiants stables et uniques pour les radios DSFR — la
  // même card peut être montée 2× (X et Y) sur la même page.
  const fieldsetId = useId();

  return (
    <div className="indicateur-card">
      <p className="libelle-indicateur">{libelle}</p>
      <ValeurCourante ligne={ligneCourante} population={population} />

      <fieldset className="fr-segmented fr-segmented--sm card-vue-toggle">
        <legend className="fr-segmented__legend fr-sr-only">
          Type de représentation
        </legend>
        <div className="fr-segmented__elements">
          <div className="fr-segmented__element">
            <input
              type="radio"
              id={`${fieldsetId}-taux`}
              name={fieldsetId}
              checked={vueGraphe === 'taux'}
              onChange={() => setVueGraphe('taux')}
            />
            <label className="fr-label" htmlFor={`${fieldsetId}-taux`}>Taux</label>
          </div>
          <div className="fr-segmented__element">
            <input
              type="radio"
              id={`${fieldsetId}-effectifs`}
              name={fieldsetId}
              checked={vueGraphe === 'effectifs'}
              onChange={() => setVueGraphe('effectifs')}
            />
            <label className="fr-label" htmlFor={`${fieldsetId}-effectifs`}>Effectifs</label>
          </div>
        </div>
      </fieldset>

      {vueGraphe === 'taux' ? (
        <MiniGrapheEvolution
          serie={serie}
          millesimeCourant={millesimeCourant}
          indicateurName={indicateurName}
          showTitle={false}
        />
      ) : (
        <MiniGrapheEffectifs
          serie={serie}
          millesimeCourant={millesimeCourant}
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

// ---------------------------------------------------------------------
// Section « Autres indicateurs ».
// ---------------------------------------------------------------------
function SectionAutresIndicateurs({
  donneesCourantes,
  historique,
  indicateursDesAxes,
  millesimeCourant,
}) {
  const { reussite, insertion, simples } = decouperGroupes(
    donneesCourantes, historique, indicateursDesAxes
  );

  // Robustesse : si Réussite ne contient qu'UN indicateur (cas où une
  // variante aurait été supprimée), on évite le graphique multi-
  // courbes à 1 courbe et on traite cet indicateur comme une ligne
  // simple. Idem pour Insertion à 1 délai effectif (mais la logique
  // est portée par GrapheMultiCourbes → on garde le graphe si ≥ 2
  // points valides au total, donc 1 courbe avec ≥ 2 millésimes
  // affichera quand même).
  const reussiteGraphAffichable = reussite.length >= 2;
  const reussiteEnSimples = !reussiteGraphAffichable ? reussite : [];

  // Lignes simples à rendre : les "simples" du décompte initial, plus
  // un éventuel rabattement depuis Réussite.
  const lignesSimples = [];
  for (const nom of reussiteEnSimples.concat(simples)) {
    const ligne = (donneesCourantes || []).find(
      (r) => r.indicateur === nom && !r.date_inser
    );
    if (ligne) lignesSimples.push(ligne);
  }

  const rienAAfficher =
    !reussiteGraphAffichable && lignesSimples.length === 0 && insertion.length === 0;

  if (rienAAfficher) {
    return (
      <section className="section-autres-indicateurs">
        <h3>Évolution historique des indicateurs</h3>
        <p className="info-vide">Aucun autre indicateur disponible.</p>
      </section>
    );
  }

  return (
    <section className="section-autres-indicateurs">
      <h3>Évolution historique des indicateurs</h3>

      {reussiteGraphAffichable && (
        (() => {
          const { variantes, parVariante } = seriesReussite(reussite, historique);
          return (
            <GrapheMultiCourbes
              titre="Réussite"
              variantes={variantes}
              parVariante={parVariante}
              millesimeCourant={millesimeCourant}
            />
          );
        })()
      )}

      {lignesSimples.length > 0 && (
        <table className="table-autres-indicateurs">
          <tbody>
            {lignesSimples.map((r) => (
              <LigneSimple key={r.indicateur} ligne={r} historique={historique} />
            ))}
          </tbody>
        </table>
      )}

      {insertion.map((nom) => {
        const { variantes, parVariante } = seriesInsertion(nom, historique);
        if (variantes.length === 0) return null;
        return (
          <GrapheMultiCourbes
            key={nom}
            titre={nom}
            variantes={variantes}
            parVariante={parVariante}
            millesimeCourant={millesimeCourant}
          />
        );
      })}
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

// ---------------------------------------------------------------------
// Helpers de formatage / lookup
// ---------------------------------------------------------------------
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
