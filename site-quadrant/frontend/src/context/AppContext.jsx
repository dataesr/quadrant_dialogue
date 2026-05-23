import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { ApiError, getEtablissementsVisibles } from '../services/api.js';
import { useReferentiels } from '../hooks/useReferentiels.js';

// État global de l'application. Sépare proprement :
//   1. État de sélection établissement (phase 2)
//   2. Onglets vue + cursus (phase 2)
//   3. Filtres (millésime, variables, dates, disciplinaires, options) — phase 3
//   4. Référentiels chargés en async via useReferentiels()
//
// Les composants consomment via le hook useApp(). Pas de useReducer : la
// surface est gérable avec des setters React simples + quelques wrappers
// (setCursus reset le cascade, setVariableX/Y reset le date_inser associé).

const AppContext = createContext(null);

// Valeurs par défaut des filtres avancés. Resetables via resetAdvancedFilters.
const DEFAULT_REPRESENTATIVITE = false;
const DEFAULT_LIGNE_REFERENCE  = 'mediane';

// Date d'insertion choisie par défaut quand on bascule sur une variable
// déclinable (12 mois — milieu de la fourchette canonique 6/12/18/24/30).
const DEFAULT_DATE_INSER = '12';

export function AppProvider({ children }) {
  // --- Phase 2 : établissement + onglets ---
  const [etabContexte, setEtabContexteState] = useState(null);
  const [etabInfo,     setEtabInfo]          = useState(null);
  const [etabList,     setEtabList]          = useState([]);
  const [mode,         setMode]              = useState(null);
  const [vue,          setVue]               = useState('mentions');
  const [cursus,       setCursusState]       = useState('Master');

  // --- Phase 3 : filtres essentiels ---
  const [millesime,  setMillesimeState] = useState(null);
  const [variableX,  setVariableXState] = useState(null);
  const [variableY,  setVariableYState] = useState(null);
  const [dateInserX, setDateInserX]     = useState('');
  const [dateInserY, setDateInserY]     = useState('');

  // --- Phase 3 : filtres avancés ---
  const [domaine,           setDomaine]           = useState(null);
  const [discipline,        setDiscipline]        = useState(null);
  const [secteur,           setSecteur]           = useState(null);
  const [mention,           setMention]           = useState(null);
  const [typeMaster,        setTypeMaster]        = useState(null);
  const [representativite,  setRepresentativite]  = useState(DEFAULT_REPRESENTATIVITE);
  const [ligneReference,    setLigneReference]    = useState(DEFAULT_LIGNE_REFERENCE);

  // --- Initialisation : /etablissements-visibles ---
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // --- Référentiels (millesimes, variables, disciplinaire) ---
  // Le hook gère son propre cache par formation / (formation, millesime).
  const referentiels = useReferentiels({ formation: cursus, millesime });

  // ---------------------------------------------------------------------------
  // Chargement initial : liste des établissements visibles → déduit le mode.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await getEtablissementsVisibles({
          formation: 'Master',
          millesime: '2022',
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

  // ---------------------------------------------------------------------------
  // Auto-default du millésime : premier (le plus récent) dès qu'on a la liste.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (millesime !== null) return;
    const list = referentiels.millesimes.data?.millesimes;
    if (Array.isArray(list) && list.length > 0) {
      setMillesimeState(list[0]);
    }
  }, [referentiels.millesimes.data, millesime]);

  // ---------------------------------------------------------------------------
  // Auto-default des variables X/Y : premier couple autorisé dès qu'on a les
  // variables. Initialise aussi date_inserX/Y selon declinable_delai.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (variableX !== null || variableY !== null) return;
    const data = referentiels.variables.data;
    if (!data) return;

    const couples = data.couples_autorises || [];
    if (couples.length === 0) return;
    const [defX, defY] = couples[0];

    const vars = data.variables || [];
    const declX = vars.find((v) => v.libelle === defX)?.declinable_delai ?? false;
    const declY = vars.find((v) => v.libelle === defY)?.declinable_delai ?? false;

    setVariableXState(defX);
    setVariableYState(defY);
    setDateInserX(declX ? DEFAULT_DATE_INSER : '');
    setDateInserY(declY ? DEFAULT_DATE_INSER : '');
  }, [referentiels.variables.data, variableX, variableY]);

  // ---------------------------------------------------------------------------
  // Setters publics
  // ---------------------------------------------------------------------------

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

  // Changement de cursus : tout ce qui dépend du cursus est invalidé.
  // - millésime + variables + dates → seront re-défaultés quand les
  //   nouveaux référentiels arriveront ;
  // - filtres disciplinaires + typeMaster → on les remet à zéro car les
  //   valeurs disponibles changent avec le cursus ;
  // - representativite + ligneReference → préservés (préférences UX
  //   indépendantes du cursus).
  const setCursus = useCallback((newCursus) => {
    setCursusState(newCursus);
    setMillesimeState(null);
    setVariableXState(null);
    setVariableYState(null);
    setDateInserX('');
    setDateInserY('');
    setDomaine(null);
    setDiscipline(null);
    setSecteur(null);
    setMention(null);
    setTypeMaster(null);
  }, []);

  // Setter variable X : ajuste automatiquement date_inserX selon le drapeau
  // declinable_delai de la nouvelle variable. Évite à l'appelant d'avoir
  // à connaître la déclinabilité.
  const setVariableX = useCallback(
    (newVar) => {
      setVariableXState(newVar);
      const vars = referentiels.variables.data?.variables || [];
      const declinable = vars.find((v) => v.libelle === newVar)?.declinable_delai ?? false;
      setDateInserX(declinable ? DEFAULT_DATE_INSER : '');
    },
    [referentiels.variables.data]
  );

  const setVariableY = useCallback(
    (newVar) => {
      setVariableYState(newVar);
      const vars = referentiels.variables.data?.variables || [];
      const declinable = vars.find((v) => v.libelle === newVar)?.declinable_delai ?? false;
      setDateInserY(declinable ? DEFAULT_DATE_INSER : '');
    },
    [referentiels.variables.data]
  );

  const setMillesime = useCallback((m) => setMillesimeState(m), []);

  // Remet à zéro tous les filtres avancés (laisse vue / cursus / variables /
  // millésime / établissement intacts). Utilisé par le bouton « Réinitialiser
  // les filtres » dans AdvancedFilters.
  const resetAdvancedFilters = useCallback(() => {
    setDomaine(null);
    setDiscipline(null);
    setSecteur(null);
    setMention(null);
    setTypeMaster(null);
    setRepresentativite(DEFAULT_REPRESENTATIVITE);
    setLigneReference(DEFAULT_LIGNE_REFERENCE);
  }, []);

  const value = {
    // Phase 2
    etabContexte, etabInfo, etabList, mode,
    vue, cursus,
    // Phase 3
    millesime,
    variableX, variableY,
    dateInserX, dateInserY,
    domaine, discipline, secteur, mention,
    typeMaster,
    representativite,
    ligneReference,
    // Référentiels chargés
    referentiels,
    // État global
    loading, error,
    // Actions
    setEtabContexte, setVue, setCursus,
    setMillesime,
    setVariableX, setVariableY,
    setDateInserX, setDateInserY,
    setDomaine, setDiscipline, setSecteur, setMention,
    setTypeMaster,
    setRepresentativite, setLigneReference,
    resetAdvancedFilters,
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
