import { AppProvider, useApp } from './context/AppContext.jsx';
import EtabSelector from './components/EtabSelector.jsx';
import ViewTabs from './components/ViewTabs.jsx';
import CursusTabs from './components/CursusTabs.jsx';
import FilterBar from './components/FilterBar.jsx';
import AdvancedFilters from './components/AdvancedFilters.jsx';
import EmptyState from './components/EmptyState.jsx';
import Quadrant from './components/Quadrant.jsx';
import QuadrantTable from './components/QuadrantTable.jsx';
import MentionSearch from './components/MentionSearch.jsx';
import AffichageSelector from './components/AffichageSelector.jsx';

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
  const { loading, error, etabContexte, affichage, vue } = useApp();

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
              <AdvancedFilters />
            </aside>
            <main className="zone-quadrant">
              {etabContexte ? (
                affichage === 'graphique' ? <Quadrant /> : <QuadrantTable />
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
