import { useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import Combobox from './selectors/Combobox.jsx';

// Sélecteur d'établissement de référence en haut de page.
//
//   - mode "etab" (un seul étab visible) : libellé en lecture seule.
//   - mode "rectorat_national" (plusieurs étabs) : combobox avec
//     autocomplétion. Indispensable au-delà d'une dizaine d'étabs ;
//     remplace un <fr-select> qui devenait peu pratique à scanner
//     pour un rectorat avec 20-30 établissements.
//
// La sous-info Région · Typologie reste affichée sous le sélecteur
// quand un étab est connu (fr-hint-text DSFR).

export default function EtabSelector() {
  const { mode, etabList, etabContexte, etabInfo, setEtabContexte } = useApp();

  // Préparation des items pour la combobox. La `hint` (région +
  // typologie en petit gris à droite) aide à désambiguer deux étabs au
  // libellé proche.
  const items = useMemo(
    () => (etabList || []).map((e) => ({
      id: e.id,
      libelle: e.libelle,
      hint: formatHint(e),
    })),
    [etabList]
  );

  return (
    <div className="fr-mb-3w">
      {mode === 'etab' ? (
        <p className="fr-mb-1v">
          <span className="fr-text--bold">Établissement de référence :</span>{' '}
          {etabInfo?.libelle || '—'}
        </p>
      ) : (
        <Combobox
          id="quadrant-etab-select"
          label="Établissement de référence"
          placeholder="— sélectionner un établissement —"
          items={items}
          value={etabContexte || ''}
          onSelect={(id) => setEtabContexte(id || null)}
        />
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

// Construit le complément discret affiché à droite du libellé dans le
// menu déroulant : « · Région · Typologie ». Tolérant aux champs
// absents — on n'affiche que ce qu'on a.
function formatHint(etab) {
  const region = etab.region?.libelle || etab.region?.code;
  const typo   = etab.typologie;
  const parts = [];
  if (region) parts.push(region);
  if (typo)   parts.push(typo);
  return parts.length ? `· ${parts.join(' · ')}` : '';
}
