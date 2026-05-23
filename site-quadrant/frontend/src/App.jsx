import { useState } from 'react';
import {
  ApiError,
  getHealth,
  getReferentielDisciplinaire,
} from './services/api.js';

// Phase 1 : page de test minimaliste pour valider la chaîne complète
// frontend → (proxy ou URL directe) → API → BDD.

export default function App() {
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [referentielSummary, setReferentielSummary] = useState(null);
  const [referentielError, setReferentielError] = useState(null);
  const [referentielLoading, setReferentielLoading] = useState(false);

  async function testHealth() {
    setHealthLoading(true);
    setHealthError(null);
    setHealth(null);
    try {
      const result = await getHealth();
      setHealth(result);
    } catch (err) {
      setHealthError(formatError(err));
    } finally {
      setHealthLoading(false);
    }
  }

  async function testReferentiel() {
    setReferentielLoading(true);
    setReferentielError(null);
    setReferentielSummary(null);
    try {
      // Paramètres pris au défaut pour un premier test fonctionnel ;
      // la combinaison Master / 2023 / vue=mentions est généralement présente.
      const result = await getReferentielDisciplinaire({
        formation: 'Master',
        millesime: '2023',
      });
      setReferentielSummary({
        domaines: result.domaines?.length ?? 0,
        disciplines: result.disciplines?.length ?? 0,
        secteurs: result.secteurs?.length ?? 0,
        mentions: result.mentions?.length ?? 0,
      });
    } catch (err) {
      setReferentielError(formatError(err));
    } finally {
      setReferentielLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: '40px auto', padding: '0 20px' }}>
      <h1 style={{ marginBottom: 4 }}>Quadrant — Frontend (setup)</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        Phase 1 : structure projet, couche service, tests de connexion API.
      </p>

      <Section title="Test /health">
        <button onClick={testHealth} disabled={healthLoading}>
          {healthLoading ? 'Appel en cours…' : "Tester l'API"}
        </button>
        {health && (
          <pre style={{ marginTop: 12 }}>{JSON.stringify(health, null, 2)}</pre>
        )}
        {healthError && (
          <ErrorBlock>{healthError}</ErrorBlock>
        )}
      </Section>

      <Section title="Test /referentiel/disciplinaire (Master · 2023)">
        <button onClick={testReferentiel} disabled={referentielLoading}>
          {referentielLoading
            ? 'Appel en cours…'
            : 'Tester /referentiel/disciplinaire'}
        </button>
        {referentielSummary && (
          <ul style={{ marginTop: 12 }}>
            <li>{referentielSummary.domaines} domaines</li>
            <li>{referentielSummary.disciplines} disciplines</li>
            <li>{referentielSummary.secteurs} secteurs</li>
            <li>{referentielSummary.mentions} mentions</li>
          </ul>
        )}
        {referentielError && (
          <ErrorBlock>{referentielError}</ErrorBlock>
        )}
      </Section>

      <footer style={{ marginTop: 40, color: '#888', fontSize: 12 }}>
        Pour que les boutons fonctionnent, renseigner <code>VITE_API_BASE_URL</code>{' '}
        (et éventuellement <code>VITE_API_PROXY_TARGET</code>) dans{' '}
        <code>.env</code>. Voir <code>.env.example</code> et{' '}
        <code>README.md</code>.
      </footer>
    </main>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, marginBottom: 10 }}>{title}</h2>
      {children}
    </section>
  );
}

function ErrorBlock({ children }) {
  return (
    <pre
      style={{
        marginTop: 12,
        borderColor: '#cc6666',
        background: '#fdf2f2',
        color: '#7a2222',
      }}
    >
      {children}
    </pre>
  );
}

function formatError(err) {
  if (err instanceof ApiError) {
    const parts = [`HTTP ${err.status}`];
    if (err.code) parts.push(`code=${err.code}`);
    return `${parts.join(' · ')}\n${err.message}`;
  }
  return err?.message || String(err);
}
