import { AppProvider, useApp } from './context/AppContext.jsx';
import EtabSelector from './components/EtabSelector.jsx';
import ViewTabs from './components/ViewTabs.jsx';
import CursusTabs from './components/CursusTabs.jsx';
import EmptyState from './components/EmptyState.jsx';
import './styles/components.css';

// App = Provider + coquille. AppShell consomme le contexte pour décider
// quoi afficher (chargement, erreur, ou contenu).
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
    <div className="app-container">
      <header className="app-header">
        <h1>Quadrant</h1>
      </header>

      {loading ? (
        <p className="app-status">Chargement…</p>
      ) : error ? (
        <p className="app-status app-status--error">{error}</p>
      ) : (
        <>
          <EtabSelector />
          <ViewTabs />
          <CursusTabs />
          <main className="app-main">
            <EmptyState variant={etabContexte ? 'placeholder' : 'no-selection'} />
          </main>
        </>
      )}
    </div>
  );
}
