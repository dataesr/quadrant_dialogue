import { AppProvider, useApp } from './context/AppContext.jsx';
import EtabSelector from './components/EtabSelector.jsx';
import ViewTabs from './components/ViewTabs.jsx';
import CursusTabs from './components/CursusTabs.jsx';
import FilterBar from './components/FilterBar.jsx';
import MentionFilterCombobox from './components/MentionFilterCombobox.jsx';
import AdvancedFilters from './components/AdvancedFilters.jsx';
import EmptyState from './components/EmptyState.jsx';
import Quadrant from './components/Quadrant.jsx';
import QuadrantTable from './components/QuadrantTable.jsx';
import ReferenceAxesSelector from './components/ReferenceAxesSelector.jsx';
import MentionSearch from './components/MentionSearch.jsx';
import AffichageSelector from './components/AffichageSelector.jsx';
import DetailsPanel from './components/DetailsPanel.jsx';
import BoutonExport from './components/BoutonExport.jsx';
import FiltresActifs from './components/FiltresActifs.jsx';

// Coquille minimale : layout 1000px max (contrainte iframe), composants
// DSFR pour tout le reste. Trois états d'affichage gérés par AppShell :
// chargement, erreur, contenu. La zone-quadrant affiche le composant
// <Quadrant> dès qu'un établissement est sélectionné ; sinon un
// EmptyState invite à choisir un établissement.

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

function AppShell() {
  const { loading, error, etabContexte, affichage, vue, detailsCible } = useApp();

  return (
    <div className="quadrant-app">
      {/* Pas de <h1> ici : le titre figure déjà dans la page hôte qui embarque
          l'iframe — éviter le doublon et préserver les 850px verticaux. */}

      {loading ? (
        <p className="fr-text--lead">Chargement…</p>
      ) : error ? (
        <div className="fr-alert fr-alert--error" role="alert">
          <p>{error}</p>
        </div>
      ) : (
        <>
          <EtabSelector />

          <div className="ligne-onglets">
            <ViewTabs />
            <CursusTabs />
          </div>

          <div className="quadrant-grille">
            <aside className="panneau-filtres">
              {/* AffichageSelector placé en tête : la bascule
                  Graphique/Tableau conditionne la visibilité de
                  certains contrôles en-dessous (cf. MentionSearch,
                  filtre Mention dans AdvancedFilters). */}
              <AffichageSelector />
              <FilterBar />
              {/* MentionSearch n'est utile qu'en vue Mentions :
                  - vue Positionnement → le sélecteur d'étab du haut
                    de page joue déjà ce rôle (et avec autocomplétion
                    depuis cette session). */}
              {vue === 'mentions' && <MentionSearch />}
              {/* Filtre Mention en vue Positionnement, juste
                  au-dessus du toggle « Plus d'options » : il reste
                  toujours visible, indépendamment du mode d'affichage
                  (Graphique/Tableau) et de l'état du panneau avancé.
                  Le composant gère sa propre garde (vue=etablissements
                  uniquement) — pas de wrapping conditionnel ici. */}
              <MentionFilterCombobox />
              <AdvancedFilters />
              {/* Bouton d'export : adaptatif graphique→PNG / tableau→Excel,
                  monté en pied de panneau (cf. BoutonExport.jsx). */}
              <BoutonExport />
            </aside>
            <main
              className={
                'zone-quadrant' +
                (etabContexte && detailsCible ? ' zone-quadrant--avec-details' : '')
              }
            >
              {etabContexte ? (
                <>
                  {/* Sélecteur de référence des axes (Phase 15.3) : placé
                      au-dessus du quadrant DANS la zone de droite (pas
                      au-dessus du panneau de filtres). En mode « avec
                      détails » la zone passe en grille 2 colonnes — le
                      sélecteur span 1/-1 (cf. .ref-axes-container) pour
                      rester pleine largeur et stable à l'ouverture de la
                      barre latérale (aucun effet secondaire au clic
                      sur une bulle). Placé avant FiltresActifs pour ne
                      pas bouger quand les pills de filtres apparaissent. */}
                  <ReferenceAxesSelector />
                  {/* Bandeau des filtres actifs (pills cliquables avec ×
                      pour retirer un filtre individuellement). Visible
                      uniquement si au moins un filtre est actif —
                      sinon le composant ne rend rien et ne réserve pas
                      d'espace. Placé au-dessus du quadrant pour
                      résumer le périmètre courant en un coup d'œil. */}
                  <FiltresActifs />
                  {/* Un seul <Quadrant /> monté en permanence : en
                      mode tableau on l'envoie offscreen via CSS
                      plutôt que de monter une seconde instance.
                      Raison historique : avoir deux mounts (top
                      level + offscreen) provoquait à chaque bascule
                      Graphique↔Tableau un remount du Quadrant
                      offscreen → useQuadrant repartait sur data=null
                      → publication transitoire de
                      nbBullesAccessibles=0 → la safety useEffect de
                      Quadrant.jsx forçait setAffichage('graphique'),
                      bug visible en vue Positionnement.
                      Avec un seul mount, useQuadrant garde son data
                      entre les bascules et la safety useEffect ne se
                      déclenche que sur de vraies conditions étab. */}
                  <div
                    className={
                      affichage === 'tableau'
                        ? 'quadrant-offscreen'
                        : undefined
                    }
                    aria-hidden={affichage === 'tableau' ? 'true' : undefined}
                  >
                    <Quadrant />
                  </div>
                  {/* Instance off-screen avec forExport=true : sert de
                      source aux captures html-to-image pour les exports
                      PNG (et l'image embarquée du XLSX), qui doivent
                      respecter le seuil de diffusion configuré
                      (seuil_diffusable=20 par défaut). Toujours montée
                      tant qu'un étab est sélectionné — la fetch
                      supplémentaire est légère et garantit que l'image
                      est prête au moment du clic Export.
                      Cf. .quadrant-export-offscreen dans global.css. */}
                  <div className="quadrant-export-offscreen" aria-hidden="true">
                    <Quadrant forExport={true} />
                  </div>
                  {affichage === 'tableau' && <QuadrantTable />}
                  <DetailsPanel />
                </>
              ) : (
                <EmptyState variant="no-selection" />
              )}
            </main>
          </div>
        </>
      )}
    </div>
  );
}
