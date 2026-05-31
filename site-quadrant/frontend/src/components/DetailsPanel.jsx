import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useQuadrant } from '../hooks/useQuadrant.js';
import { useQuadrantDetails } from '../hooks/useQuadrantDetails.js';
import MiniGrapheEvolution from './details/MiniGrapheEvolution.jsx';
import MiniGrapheEffectifs from './details/MiniGrapheEffectifs.jsx';
import GrapheMultiCourbes from './details/GrapheMultiCourbes.jsx';
import {
  extraireSerie,
  decouperGroupes,
  seriesReussite,
  seriesInsertion,
} from './details/historique.js';
import { getContexteIdDev, getQuadrantDetails } from '../services/api.js';
import { LIBELLE_SOURCE, MENTION_DIFFUSION } from '../utils/constants.js';
import { formatDelta } from '../utils/formatDelta.js';
import { exportFicheDocx } from '../utils/exportDocx.js';
import { messageErreur } from '../utils/errors.js';
import { trackEvent } from '../utils/matomo.js';
import IndicateurTooltip from './IndicateurTooltip.jsx';
import MessageErreur from './MessageErreur.jsx';
import Skeleton from './Skeleton.jsx';
import ModaleAnalyseSousPopulations from './sous-populations/ModaleAnalyseSousPopulations.jsx';

// Panneau de détails d'une bulle.
//
// Structure :
//   1. En-tête (libellé, identité secondaire, croix de fermeture)
//   2. « Indicateurs du quadrant » : 2 cards X et Y avec mini-graphes
//      Taux + Effectifs (toggle ; les deux toujours rendus pour l'export
//      Word). Une seule variante par card — la profondeur multi-
//      variantes est en section 3.
//   3. « Évolution historique des indicateurs » : graphiques
//      multi-courbes uniquement.
//        - Réussite : un seul GrapheMultiCourbes regroupant les
//          indicateurs « Taux de réussite en ... » (une courbe par
//          durée) si ≥ 2 variantes.
//        - Insertion (déclinables hors réussite) : un GrapheMultiCourbes
//          par indicateur, une courbe par délai (6/12/18/24/30 mois).
//   4. « Autres indicateurs » : indicateurs simples non-déclinables
//      hors axes X/Y, rendus comme des cards complètes (libellé,
//      valeur, mini-graphes Taux/Effectifs). Si Réussite n'a qu'un
//      indicateur (dégénération), il est rabattu ici pour éviter un
//      multi-courbes à 1 courbe.
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
    representativite,
    frontendConfig,
    referentiels,
  } = useApp();

  // Bouton « Télécharger la fiche Word » activable par config API.
  // Si désactivé, on n'affiche pas le bouton du tout (cohérent avec
  // BoutonExport — pas de bouton inerte).
  const wordExportActif = !!frontendConfig?.exports?.docx_fiche_enabled;

  // Ref vers <aside> pour permettre à l'export Word de cibler le
  // panneau (capture des sous-éléments via html-to-image).
  const panneauRef = useRef(null);
  const [exportFiche, setExportFiche] = useState({ running: false, erreur: null });

  // Modale « Analyse de l'insertion par sous-population » (Phase 14).
  // État local au panneau, comme ModaleAnimation l'est à AdvancedFilters.
  const [modaleAnalyseOuverte, setModaleAnalyseOuverte] = useState(false);
  // Override des données du panneau pendant la capture Word (cf.
  // handleExportFiche). null en temps normal — un objet ficheData
  // pendant la fenêtre de capture, qu'on lit en priorité sur
  // details.data quelques lignes plus bas.
  const [panneauDataOverride, setPanneauDataOverride] = useState(null);

  // Auto-effacement du message d'erreur d'export Word après 5 s
  // (toast-like). L'utilisateur peut retenter sans avoir à fermer.
  useEffect(() => {
    if (!exportFiche.erreur) return;
    const t = setTimeout(
      () => setExportFiche((s) => ({ ...s, erreur: null })),
      5000,
    );
    return () => clearTimeout(t);
  }, [exportFiche.erreur]);

  const details = useQuadrantDetails({
    vue,
    formation: cursus,
    millesime,
    targetId: detailsCible?.targetId,
    etabContexte,
    mention: detailsCible?.mention || (vue === 'etablissements' ? mention : undefined),
    // Filtres disciplinaires : la disponibilité de l'analyse fine AGRÉGÉE
    // (vue Positionnement) dépend des mentions visibles (Phase 14.8).
    dom: domaine, discipli: discipline, secteur, master: typeMaster,
  });

  // /quadrant en parallèle pour les population_x/y de la bulle ciblée.
  const quadrant = useQuadrant({
    cursus, vue, millesime,
    variableX, variableY, dateInserX, dateInserY,
    etabContexte,
    domaine, discipline, secteur, mention, typeMaster,
    representativite,
  });

  useEffect(() => {
    if (!detailsCible) return;
    function onKey(e) {
      if (e.key === 'Escape') setDetailsCible(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailsCible, setDetailsCible]);

  // Referme la modale d'analyse fine si la bulle ciblée change (sinon
  // l'état `modaleAnalyseOuverte` persisterait d'une bulle à l'autre, le
  // panneau ne se démontant pas entre deux clics).
  useEffect(() => {
    setModaleAnalyseOuverte(false);
  }, [detailsCible?.targetId, vue, millesime]);

  const bulleAssociee = useMemo(() => {
    if (!detailsCible || !quadrant.data?.bulles) return null;
    return quadrant.data.bulles.find((b) => b.id === detailsCible.targetId) || null;
  }, [detailsCible, quadrant.data]);

  if (!detailsCible) return null;

  // `panneauDataOverride` permet de temporairement basculer le rendu
  // du panneau sur les données filtrées pour l'export (?for_export=1
  // côté /quadrant/details), pendant la durée de la capture
  // html-to-image du Word. Hors export, l'override est null →
  // l'utilisateur voit toujours les données écran (seuil 5). Après
  // capture, on remet à null → le panneau retrouve son état d'origine.
  // L'utilisateur peut voir un très bref flash si l'override prend
  // > 100 ms à se stabiliser, mais le toast « Génération en cours… »
  // (bouton Word désactivé) signale l'opération.
  const data = panneauDataOverride ?? details.data;
  const identite = data?.identite;

  // Pré-conditions pour l'export Word : le panneau doit être chargé,
  // au moins une donnée courante, et un ref DOM cible disponible.
  const ficheExportable =
    !!data && !!identite && !details.loading && !details.error;

  async function handleExportFiche() {
    if (!ficheExportable || !panneauRef.current) return;
    setExportFiche({ running: true, erreur: null });
    // Name = libellé de la bulle ciblée (mention ou établissement) —
    // mêmes règles que titreBulle().
    const libelleBulle = identite
      ? (data?.type === 'mention'
          ? (identite.libelle || identite.diplom || null)
          : (identite.uo_lib || identite.id_paysage || null))
      : null;
    trackEvent('Export', 'export_docx', libelleBulle, {
      etab: etabInfo?.libelle,
      vue,
      cursus,
      millesime,
    });

    // 1. Fetch dédié /quadrant/details avec for_export=1. L'API
    //    applique le seuil_diffusable (20 par défaut) : les valeurs
    //    fragiles 5-19 deviennent non_diffusable=true côté
    //    donnees_courantes et historique. Le panneau écran reste
    //    sur ses données initiales (seuil 5) tant que l'override
    //    n'est pas posé.
    let exportData;
    try {
      exportData = await getQuadrantDetails({
        vue,
        formation:   cursus,
        millesime,
        target_id:   detailsCible.targetId,
        etab_contexte: etabContexte,
        ...(detailsCible.mention ? { mention: detailsCible.mention } : (
          vue === 'etablissements' && mention ? { mention } : {}
        )),
        for_export: 1,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Export fiche Word — fetch for_export :', err);
      setExportFiche({
        running: false,
        erreur: messageErreur(err) || 'Échec de l\'export.',
      });
      return;
    }

    // 2. Override : on bascule le rendu du panneau sur la réponse
    // for_export=1. L'API renvoie déjà les entrées historiques
    // sous-seuil (denom < seuil_diffusable, 20 par défaut) avec
    // non_diffusable=true. extraireSerie() les collapse en « tout
    // null » côté frontend → polylines interrompues, aucun point
    // résiduel. Idem pour donnees_courantes (cards X/Y) : ValeurCourante
    // affiche « Non diffusable » textuellement à partir du flag
    // non_diffusable préservé sur les rows courantes.
    setPanneauDataOverride(exportData);

    // 3. Attendre que React commit le re-render ET que les SVG des
    //    graphes (MiniGrapheEvolution, MiniGrapheEffectifs,
    //    GrapheMultiCourbes) aient mis à jour leurs polylines et
    //    points avec les nouvelles données. 2 rAF + setTimeout 80 ms
    //    sont empiriquement nécessaires pour les multi-courbes
    //    historiques (rendus avec useMemo profonds) — sans ce délai
    //    additionnel, la capture html-to-image peut figer le SVG
    //    encore sur l'ancienne série (cas TOURISME — historique du
    //    Taux de poursuivants).
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    await new Promise((resolve) => setTimeout(resolve, 80));

    try {
      await exportFicheDocx({
        ficheData: exportData,
        contexte: {
          etabInfo,
          cursus, vue, millesime,
          variableX, variableY, dateInserX, dateInserY,
          populationX: bulleAssociee?.population_x,
          populationY: bulleAssociee?.population_y,
          // Filtre mention courant (libellé humain) — utilisé par
          // sousTitreFiche pour rappeler la mention dans l'en-tête
          // de la fiche Word, en cohérence avec l'écran.
          mentionFiltreLibelle:
            vue === 'etablissements' && mention
              ? resoudreMentionLibelle(mention, referentiels.disciplinaire.data?.mentions)
              : null,
          // Traçabilité silencieuse côté Custom Properties du .docx
          // (cf. exportDocx.js). Aligné sur ce que produit
          // BoutonExport.jsx : seul `contexteId` est connu en mode
          // dev (depuis l'URL ou VITE_CONTEXTE_ID_DEV, cf.
          // getContexteIdDev). Les vrais tokens de session ne sont
          // pas exposés au JS pour l'instant.
          tokens: {
            contexteId: getContexteIdDev() || undefined,
            tokenConnexion: undefined,
            tokenUtilisateur: undefined,
          },
        },
        panneauEl: panneauRef.current,
      });
      setExportFiche({ running: false, erreur: null });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Export fiche Word :', err);
      setExportFiche({
        running: false,
        erreur: messageErreur(err) || 'Échec de l\'export.',
      });
    } finally {
      // 4. Restaurer le rendu d'origine du panneau (données
      //    affichage écran avec seuil 5). L'utilisateur retrouve
      //    son état initial — quel que soit le résultat de la
      //    capture (succès ou exception).
      setPanneauDataOverride(null);
    }
  }

  // Analyse fine par sous-population : disponibilité + identité de la
  // mention ciblée. La mention est (etab_contexte, target_id) en vue
  // Mentions, (target_id, mention) en vue Positionnement avec filtre.
  const analyseSousPop = data?.analyse_sous_populations || null;
  const analyseDisponible = !!analyseSousPop?.disponible;
  const aspIdPaysage = vue === 'mentions' ? etabContexte : detailsCible.targetId;
  const aspDiplom = vue === 'mentions'
    ? detailsCible.targetId
    : (detailsCible.mention || mention);
  // Mode établissement (Phase 14.8) : vue Positionnement SANS filtre mention
  // → l'analyse agrège toutes les mentions filtrées du cursus de l'étab.
  // Sinon mode mention (vue Mentions, ou Positionnement avec mention filtrée).
  const aspMode = (vue === 'etablissements' && !aspDiplom) ? 'etablissement' : 'mention';
  // Libellé humain de la discipline filtrée (le code seul ne parle pas dans
  // le cartouche) — résolu depuis le référentiel disciplinaire.
  const aspDisciplineLib = discipline
    ? (referentiels.disciplinaire.data?.disciplines || [])
        .find((d) => d.code === discipline)?.libelle || discipline
    : null;
  const aspFiltres = {
    dom: domaine,
    discipli: discipline,
    discipli_lib: aspDisciplineLib,
    secteur,
    master: typeMaster,
  };
  const aspEtabLabel = vue === 'mentions'
    ? etabInfo?.libelle
    : (identite?.uo_lib || identite?.id_paysage || '');
  const aspMentionLabel = vue === 'mentions'
    ? (identite?.libelle || identite?.diplom || '')
    : resoudreMentionLibelle(aspDiplom, referentiels.disciplinaire.data?.mentions);
  const aspInitialDateInser = dateInserX || dateInserY || '';

  return (
    <>
    <aside className="panneau-details" ref={panneauRef}>
      <header>
        <div className="titre-zone">
          <h2>{titreBulle(identite, data?.type)}</h2>
          {identite && (
            <p className="identite-secondaire">
              {sousTitreBulle(
                identite,
                data?.type,
                cursus,
                // Rappel du filtre mention en vue Positionnement : on
                // l'expose juste après le cursus pour que le lecteur
                // sache que les indicateurs portent sur cette mention
                // précise (pas l'agrégat tous diplômes confondus).
                vue === 'etablissements' && mention
                  ? resoudreMentionLibelle(mention, referentiels.disciplinaire.data?.mentions)
                  : null,
              )}
            </p>
          )}
        </div>
        <div className="actions">
          {wordExportActif && (
            <button
              type="button"
              className="bouton-action fr-icon-file-download-line"
              onClick={handleExportFiche}
              disabled={!ficheExportable || exportFiche.running}
              aria-label="Télécharger cette fiche au format Word"
              title="Télécharger cette fiche au format Word"
            />
          )}
          <button
            type="button"
            className="bouton-action fr-icon-close-line"
            onClick={() => setDetailsCible(null)}
            aria-label="Fermer le panneau de détails"
            title="Fermer le panneau"
          />
        </div>
      </header>

      {exportFiche.erreur && (
        <div className="fr-alert fr-alert--error fr-alert--sm" role="alert">
          <p>Export Word : {exportFiche.erreur}</p>
        </div>
      )}

      {details.loading && <DetailsPanelSkeleton />}
      <MessageErreur error={details.error} compact />

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
              cursus={cursus}
            />
            <CardIndicateur
              indicateurName={variableY}
              dateInser={dateInserY}
              donneesCourantes={data.donnees_courantes}
              historique={data.historique}
              population={bulleAssociee?.population_y}
              millesimeCourant={millesime}
              cursus={cursus}
            />
          </section>

          <SectionAutresIndicateurs
            donneesCourantes={data.donnees_courantes}
            historique={data.historique}
            indicateursDesAxes={[variableX, variableY]}
            millesimeCourant={millesime}
            cursus={cursus}
          />

          <SectionIndicateursComplementaires
            donneesCourantes={data.donnees_courantes}
            historique={data.historique}
            indicateursDesAxes={[variableX, variableY]}
            millesimeCourant={millesime}
            cursus={cursus}
          />

          {analyseSousPop && (
            <button
              type="button"
              className="fr-btn fr-btn--secondary fr-btn--icon-left fr-icon-search-line bouton-analyse-sp"
              disabled={!analyseDisponible}
              title={!analyseDisponible
                ? "Effectifs insuffisants pour l'analyse fine"
                : undefined}
              onClick={() => setModaleAnalyseOuverte(true)}
            >
              Analyse de l&apos;insertion par sous-population
            </button>
          )}

          <p className="source-attribution">
            {LIBELLE_SOURCE} · {MENTION_DIFFUSION}
          </p>
        </>
      )}
    </aside>

    {modaleAnalyseOuverte && (
      <ModaleAnalyseSousPopulations
        open={modaleAnalyseOuverte}
        onClose={() => setModaleAnalyseOuverte(false)}
        mode={aspMode}
        idPaysage={aspIdPaysage}
        diplom={aspDiplom}
        filtres={aspFiltres}
        millesime={millesime}
        formation={cursus}
        etabLabel={aspEtabLabel}
        mentionLabel={aspMentionLabel}
        initialDateInser={aspInitialDateInser}
      />
    )}
    </>
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
  cursus,
}) {
  const ligneCourante = trouverLigneCourante(donneesCourantes, indicateurName, dateInser);
  // Ligne du millésime précédent — sert au calcul du delta affiché à
  // côté de la valeur courante (« 96,2 % (+0,3 pt) »). null si pas
  // d'historique pour ce millésime-1 (bulle créée récemment, cohorte
  // non observable l'année d'avant, etc.).
  const lignePrecedente = useMemo(
    () => trouverLignePrecedente(historique, indicateurName, dateInser, millesimeCourant),
    [historique, indicateurName, dateInser, millesimeCourant]
  );
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
      <p className="libelle-indicateur">
        <IndicateurTooltip libelle={libelle} cursus={cursus} mode="inline" />
      </p>
      <ValeurCourante
        ligne={ligneCourante}
        lignePrec={lignePrecedente}
        population={population}
      />

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

      {/* Les deux graphes sont rendus en permanence. Le toggle
          contrôle UNIQUEMENT lequel est visible : l'autre est
          déplacé hors viewport via .card-graphe--secondaire. Cela
          permet à l'export Word de capturer Taux ET Effectifs sans
          avoir à manipuler l'état React (cf. exportDocx.js,
          section « Cards X/Y »). Position absolute plutôt que
          display:none — html-to-image ne capture pas les éléments
          en display:none. */}
      <div
        className={
          'card-graphe' + (vueGraphe === 'taux' ? '' : ' card-graphe--secondaire')
        }
        data-vue="taux"
      >
        <MiniGrapheEvolution
          serie={serie}
          millesimeCourant={millesimeCourant}
          indicateurName={indicateurName}
          showTitle={false}
        />
      </div>
      <div
        className={
          'card-graphe' + (vueGraphe === 'effectifs' ? '' : ' card-graphe--secondaire')
        }
        data-vue="effectifs"
      >
        <MiniGrapheEffectifs
          serie={serie}
          millesimeCourant={millesimeCourant}
        />
      </div>
    </div>
  );
}

function ValeurCourante({ ligne, lignePrec, population }) {
  const taux = ligne?.taux;
  const num   = ligne?.numerateur;
  const denom = ligne?.denominateur;
  const nonDiff = ligne?.non_diffusable === true;
  // Delta vs millésime précédent. tauxPrec en %, on normalise en
  // ratio (0..1) avant formatDelta — le helper s'attend à des taux
  // bornés cohérents avec l'usage dans Quadrant.jsx.
  const tauxPrec = lignePrec?.taux;

  if (taux !== null && taux !== undefined) {
    return (
      <>
        <p className="valeur-principale">
          {formatPourcent(taux)}
          {typeof tauxPrec === 'number' && (
            <span className="valeur-principale-delta">
              {' '}{formatDelta(taux / 100, tauxPrec / 100)}
            </span>
          )}
        </p>
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
// Section « Évolution historique des indicateurs » : multi-courbes
// Réussite et Insertion uniquement. Les indicateurs simples
// (rabattus depuis Réussite ou non-déclinables) sont rendus dans
// SectionIndicateursComplementaires sous forme de cards complètes.
// ---------------------------------------------------------------------
function SectionAutresIndicateurs({
  donneesCourantes,
  historique,
  indicateursDesAxes,
  millesimeCourant,
}) {
  const { reussite, insertion } = decouperGroupes(
    donneesCourantes, historique, indicateursDesAxes
  );

  // Réussite avec ≥ 2 indicateurs → multi-courbes. Sinon le ou les
  // indicateur(s) restant(s) sont récupérés en cards complémentaires
  // par SectionIndicateursComplementaires (cf. logique alignée).
  const reussiteGraphAffichable = reussite.length >= 2;

  const rienAAfficher = !reussiteGraphAffichable && insertion.length === 0;
  if (rienAAfficher) return null;

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

// ---------------------------------------------------------------------
// Section « Autres indicateurs » : indicateurs simples non-déclinables
// rendus comme des cards d'indicateur complètes (libellé + valeur
// principale + mini-graphes Taux/Effectifs avec toggle). Remplace
// l'ancien tableau zébré + sparklines : la card offre une lecture plus
// riche (échelle Y, années en X, points marqués) et reste cohérente
// avec les cards X et Y du quadrant. Si la Réussite n'a qu'un seul
// indicateur (dégénération multi-courbes à 1 courbe), il est rabattu
// ici aussi.
// ---------------------------------------------------------------------
function SectionIndicateursComplementaires({
  donneesCourantes,
  historique,
  indicateursDesAxes,
  millesimeCourant,
  cursus,
}) {
  const { reussite, simples } = decouperGroupes(
    donneesCourantes, historique, indicateursDesAxes
  );

  // Même règle que SectionAutresIndicateurs : ≥ 2 réussites → graphe
  // multi-courbes ; sinon, on les rapatrie en cards simples.
  const reussiteEnSimples = reussite.length >= 2 ? [] : reussite;
  const nomsSimples = reussiteEnSimples.concat(simples);

  if (nomsSimples.length === 0) return null;

  return (
    <section className="section-indicateurs-complementaires">
      <h3>Autres indicateurs</h3>
      {nomsSimples.map((nom) => (
        <CardIndicateur
          key={nom}
          indicateurName={nom}
          dateInser=""
          donneesCourantes={donneesCourantes}
          historique={historique}
          millesimeCourant={millesimeCourant}
          cursus={cursus}
        />
      ))}
    </section>
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

// Sous-titre = cursus + identité contextuelle. Préfixer par le
// cursus rend la fiche autoporteuse — un lecteur qui ne voit que
// l'en-tête sait à quel type de diplôme se rapporte la bulle
// (utile pour l'export Word qui réutilise cette structure et pour
// l'écran quand l'utilisateur consulte plusieurs panneaux à la
// suite). Aligné avec le sous-titre de l'export Word
// (cf. exportDocx.js > sousTitreFiche).
//
// Quand `mentionFiltreLibelle` est fourni (vue Positionnement avec
// filtre mention actif), on l'accole au cursus séparé par un SIMPLE
// ESPACE (pas le séparateur ·) — ex. « Master DROIT ». Les autres
// éléments (région, typologie) restent séparés par · classique.
function sousTitreBulle(identite, type, cursus, mentionFiltreLibelle) {
  const parts = [];
  if (cursus) {
    const cursusLabel = mentionFiltreLibelle
      ? `${cursus} ${mentionFiltreLibelle}`
      : cursus;
    parts.push(cursusLabel);
  } else if (mentionFiltreLibelle) {
    parts.push(mentionFiltreLibelle);
  }
  if (type === 'mention') {
    if (identite.secteur) parts.push(identite.secteur);
  } else {
    const region = identite.region?.libelle || identite.region?.code || '';
    if (region) parts.push(region);
    if (identite.typologie) parts.push(identite.typologie);
  }
  return parts.join(' · ');
}

// Résout un diplom code en libellé humain via le référentiel
// disciplinaire. Identique en sémantique à celui de BoutonExport — un
// fallback sur le code si le référentiel n'est pas chargé garantit
// qu'aucune fiche ne reste sans rappel.
function resoudreMentionLibelle(diplom, mentions) {
  if (!diplom) return null;
  const trouve = (mentions || []).find((m) => m.code === diplom);
  return trouve?.libelle || diplom;
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

// Cherche dans l'historique la ligne du millésime PRÉCÉDENT pour
// l'indicateur/date_inser donné. Sert au calcul du delta affiché sur
// les cards X/Y des deux axes du quadrant. Renvoie null si le
// millésime-1 n'existe pas dans l'historique, ou si l'indicateur n'a
// pas de row pour ce millésime (cohorte non observable normalisée à
// num/denom/taux null par l'API).
function trouverLignePrecedente(historique, indicateur, dateInser, millesimeCourant) {
  if (!historique || millesimeCourant == null) return null;
  const cible = Number(millesimeCourant) - 1;
  const entry = historique.find((h) => Number(h.millesime) === cible);
  if (!entry) return null;
  return (entry.donnees || []).find(
    (r) => r.indicateur === indicateur && (r.date_inser || '') === (dateInser || '')
  ) || null;
}

function formatPourcent(taux) {
  return `${taux.toFixed(1).replace('.', ',')} %`;
}

// ---------------------------------------------------------------------
// Skeleton de chargement — utilisé pendant l'appel /quadrant/details
// après un clic sur une bulle. Réserve la place de l'identité
// secondaire, des deux cards X/Y et de la section « Évolution » pour
// éviter le saut de mise en page à l'arrivée des données.
// ---------------------------------------------------------------------
function DetailsPanelSkeleton() {
  return (
    <div className="skeleton-panneau-details" aria-busy="true">
      <Skeleton height="0.85rem" width="65%" />
      <div className="skeleton-card">
        <Skeleton height="0.85rem" width="55%" />
        <Skeleton height="1.4rem" width="35%" />
        <Skeleton height="0.7rem" width="50%" />
        <Skeleton height="100px" radius="6px" />
      </div>
      <div className="skeleton-card">
        <Skeleton height="0.85rem" width="55%" />
        <Skeleton height="1.4rem" width="35%" />
        <Skeleton height="0.7rem" width="50%" />
        <Skeleton height="100px" radius="6px" />
      </div>
      <Skeleton height="0.78rem" width="50%" />
      <Skeleton height="150px" radius="6px" />
    </div>
  );
}
