import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { searchEtablissements } from '../services/api.js';
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

  // Items de la liste COMPLÈTE (affichés au focus sans saisie) — triés
  // alphabétiquement. La `hint` (région + typologie en gris à droite) aide
  // à désambiguer deux étabs au libellé proche.
  const itemsComplets = useMemo(
    () => (etabList || [])
      .map((e) => ({ id: e.id, libelle: e.libelle, hint: formatHint(e) }))
      .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr')),
    [etabList]
  );

  // Libellé de l'établissement courant — résolu depuis la liste complète
  // (stable même pendant une recherche serveur).
  const selLibelle = useMemo(
    () => (etabList || []).find((e) => e.id === etabContexte)?.libelle || '',
    [etabList, etabContexte]
  );

  // Recherche serveur intelligente (Phase 14.10), debouncée. `resultats`
  // null → on affiche la liste complète (focus sans saisie, ou saisie =
  // libellé courant). Sinon → résultats scorés par l'API.
  const [query, setQuery] = useState('');
  const [resultats, setResultats] = useState(null);

  useEffect(() => {
    const q = query.trim();
    if (q === '' || q === selLibelle) {
      setResultats(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchEtablissements({ q, limit: 10 })
        .then((res) => {
          if (cancelled) return;
          setResultats((res.resultats || []).map((r) => ({
            id: r.id_paysage,
            libelle: r.uo_lib,
            hint: formatHintResultat(r),
          })));
        })
        .catch(() => { if (!cancelled) setResultats([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, selLibelle]);

  const items = resultats === null ? itemsComplets : resultats;

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
          valueLabel={selLibelle}
          serverFiltered
          onSelect={(id) => setEtabContexte(id || null)}
          onTextChange={setQuery}
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

// Même rendu, à partir d'un résultat de /etablissements/search
// (champs plats reg_nom + typologie).
function formatHintResultat(r) {
  const parts = [];
  if (r.reg_nom)   parts.push(r.reg_nom);
  if (r.typologie) parts.push(r.typologie);
  return parts.length ? `· ${parts.join(' · ')}` : '';
}
