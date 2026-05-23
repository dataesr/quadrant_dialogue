import { useApp } from '../context/AppContext.jsx';

// Sélecteur d'établissement, basé sur les classes form DSFR :
//   - mode "etab" : libellé en lecture seule (pas de combobox)
//   - mode "rectorat_national" : `fr-select-group` avec option neutre
// La sous-info Région · Typologie utilise fr-hint-text quand etabInfo est connu.

export default function EtabSelector() {
  const { mode, etabList, etabContexte, etabInfo, setEtabContexte } = useApp();

  return (
    <div className="fr-mb-3w">
      {mode === 'etab' ? (
        <p className="fr-mb-1v">
          <span className="fr-text--bold">Établissement de référence :</span>{' '}
          {etabInfo?.libelle || '—'}
        </p>
      ) : (
        <div className="fr-select-group fr-mb-0">
          <label className="fr-label" htmlFor="quadrant-etab-select">
            Établissement de référence
          </label>
          <select
            id="quadrant-etab-select"
            className="fr-select"
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
        </div>
      )}

      {etabInfo && (
        <p className="fr-hint-text fr-mt-1v fr-mb-0">
          Région :{' '}
          {etabInfo.region?.libelle || etabInfo.region?.code || '—'}
          {' · '}
          Typologie : {etabInfo.typologie || '—'}
        </p>
      )}
    </div>
  );
}
