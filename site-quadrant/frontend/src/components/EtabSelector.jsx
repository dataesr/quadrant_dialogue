import { useApp } from '../context/AppContext.jsx';

// Affiche l'établissement de référence.
//   - mode "etab" : libellé en lecture seule (pas de choix)
//   - mode "rectorat_national" : combobox avec option neutre par défaut
// Quand un étab est connu, on affiche dessous Région · Typologie en gris clair.

export default function EtabSelector() {
  const { mode, etabList, etabContexte, etabInfo, setEtabContexte } = useApp();

  return (
    <div className="etab-selector">
      {mode === 'etab' ? (
        <div className="etab-readonly">
          <span className="etab-label">Établissement de référence :</span>
          <strong>{etabInfo?.libelle || '—'}</strong>
        </div>
      ) : (
        <label className="etab-combobox">
          <span className="etab-label">Établissement de référence :</span>
          <select
            value={etabContexte || ''}
            onChange={(e) => setEtabContexte(e.target.value)}
          >
            <option value="">— sélectionner un établissement —</option>
            {etabList.map((etab) => (
              <option key={etab.id} value={etab.id}>
                {etab.libelle}
              </option>
            ))}
          </select>
        </label>
      )}

      {etabInfo && (
        <div className="etab-subinfo">
          Région :{' '}
          {etabInfo.region?.libelle || etabInfo.region?.code || '—'}
          {' · '}
          Typologie : {etabInfo.typologie || '—'}
        </div>
      )}
    </div>
  );
}
