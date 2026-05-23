import { useApp } from '../../context/AppContext.jsx';

// Sélecteur de millésime — alimenté par /referentiel/millesimes (déjà
// triés du plus récent au plus ancien côté API).

export default function MillesimeSelect({ disabled = false }) {
  const { millesime, setMillesime, referentiels } = useApp();
  const { loading, data, error } = referentiels.millesimes;
  const list = data?.millesimes || [];
  const groupDisabled = disabled || loading || list.length === 0;

  return (
    <div className={`fr-select-group${groupDisabled ? ' fr-select-group--disabled' : ''}`}>
      <label className="fr-label" htmlFor="quadrant-millesime">
        Millésime
        {loading && <span className="fr-hint-text">Chargement…</span>}
        {error && <span className="fr-hint-text">Erreur de chargement</span>}
      </label>
      <select
        id="quadrant-millesime"
        className="fr-select"
        value={millesime || ''}
        onChange={(e) => setMillesime(e.target.value)}
        disabled={groupDisabled}
      >
        {millesime === null && (
          <option value="" disabled>
            —
          </option>
        )}
        {list.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
