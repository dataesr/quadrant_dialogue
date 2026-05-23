import { AppProvider, useApp } from './context/AppContext.jsx';
import EtabSelector from './components/EtabSelector.jsx';
import ViewTabs from './components/ViewTabs.jsx';
import CursusTabs from './components/CursusTabs.jsx';
import EmptyState from './components/EmptyState.jsx';

// Coquille minimale : layout 1000px max (contrainte iframe), composants DSFR
// pour tout le reste. Trois états d'affichage gérés par AppShell :
// chargement, erreur, contenu.

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

function AppShell() {
  const { loading, error, etabContexte } = useApp();

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
          <ViewTabs />
          <CursusTabs />
          <main className="fr-mt-3w">
            <EmptyState
              variant={etabContexte ? 'placeholder' : 'no-selection'}
            />
          </main>
        </>
      )}
    </div>
  );
}
