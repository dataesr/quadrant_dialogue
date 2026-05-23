import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { ApiError, getEtablissementsVisibles } from '../services/api.js';

// État global de l'application. Volontairement minimal en phase 2 :
// - sélection établissement (avec auto-sélection si rôle "etablissement")
// - onglet vue + onglet cursus
// - millésime hardcodé pour l'instant (sélecteur en phase 3)
//
// Les composants consomment via le hook useApp(). Pas de useReducer : la
// surface d'état est petite et les actions s'expriment bien en setters
// React simples.

const AppContext = createContext(null);

// Phase 2 : valeur figée. En phase 3 on ajoutera un sélecteur alimenté
// par les millésimes disponibles côté API.
const MILLESIME_PAR_DEFAUT = '2022';

export function AppProvider({ children }) {
  const [etabContexte, setEtabContexteState] = useState(null);
  const [etabInfo, setEtabInfo]             = useState(null);
  const [etabList, setEtabList]             = useState([]);
  const [mode, setMode]                     = useState(null);
  const [vue, setVue]                       = useState('mentions');
  const [cursus, setCursus]                 = useState('Master');
  const [millesime]                         = useState(MILLESIME_PAR_DEFAUT);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);

  // Chargement initial de la liste des établissements visibles.
  // Le rôle se déduit du nombre d'entrées :
  //   0 → erreur métier (aucun étab dans le périmètre du contexte)
  //   1 → rôle "etab" : auto-sélection silencieuse
  //   >1 → rôle "rectorat_national" : l'utilisateur doit choisir
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await getEtablissementsVisibles({
          formation: 'Master',
          millesime: MILLESIME_PAR_DEFAUT,
        });
        if (cancelled) return;

        const list = Array.isArray(result?.etablissements)
          ? result.etablissements
          : [];
        setEtabList(list);

        if (list.length === 0) {
          setError(
            'Aucun établissement visible pour ce contexte. ' +
              "Vérifier le contexte_id configuré (côté .env) ou contacter l'administrateur."
          );
        } else if (list.length === 1) {
          setMode('etab');
          setEtabContexteState(list[0].id);
          setEtabInfo(list[0]);
        } else {
          setMode('rectorat_national');
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setError(`Erreur API (${err.code || err.status}) : ${err.message}`);
        } else {
          setError(err?.message || String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Sélection d'un établissement : on stocke l'id et on retrouve les infos
  // dans la liste déjà chargée — pas de nouvel appel API.
  const setEtabContexte = useCallback(
    (id) => {
      if (!id) {
        setEtabContexteState(null);
        setEtabInfo(null);
        return;
      }
      const found = etabList.find((e) => e.id === id) || null;
      setEtabContexteState(id);
      setEtabInfo(found);
    },
    [etabList]
  );

  const value = {
    etabContexte,
    etabInfo,
    etabList,
    mode,
    vue,
    cursus,
    millesime,
    loading,
    error,
    setEtabContexte,
    setVue,
    setCursus,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp() doit être appelé dans un <AppProvider>.');
  }
  return ctx;
}
