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

  // --- Phase 4b : compléments quadrant ---
  // TEMPORAIRE — sera supprimé après validation visuelle d'un mode unique.
  const [scaleMode, setScaleMode] = useState('sqrt');
  // Highlight de mention par recherche (distinct du filtre `mention` qui,
  // lui, réduit la liste des bulles côté API en vue=etablissements).
  const [rechercheMention, setRechercheMention] = useState('');
  // Liste des libellés effectivement affichés (mentions OU établissements
  // selon la vue) — publiée par <Quadrant> dès que les data sont fetchées,
  // consommée par la barre de recherche pour alimenter ses suggestions.
  const [mentionsAffichees, setMentionsAffichees] = useState([]);
  // Bascule graphique <-> tableau. NE PAS reset au changement de cursus
  // (préférence d'affichage indépendante du cursus).
  const [affichage, setAffichage] = useState('graphique'); // 'graphique' | 'tableau'
  // Nombre de bulles avec details_accessibles=true dans le rendu courant —
  // publié par <Quadrant>, consommé par AffichageSelector / MentionSearch
  // pour conditionner leur visibilité en vue=etablissements.
  const [nbBullesAccessibles, setNbBullesAccessibles] = useState(0);

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
  // Auto-default du millésime. Priorité au défaut métier de l'API
  // (referentiels.variables.data.defauts.millesime, lu dans dim_defaut_cursus)
  // si présent ET cohérent avec la liste des millésimes disponibles.
  // Fallback : premier de la liste (le plus récent).
  //
  // Garde-fou anti-stale : au changement de cursus, setCursus reset
  // millesime à null et useReferentiels relance les fetch — mais entre les
  // deux, ce useEffect peut s'exécuter avec les `data` du closure encore
  // pointés sur l'ancien cursus. On exige donc que les deux réponses
  // (millesimes + variables) portent `formation === cursus` avant
  // d'appliquer quoi que ce soit. Sinon on attend le render suivant.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (millesime !== null) return;
    const millData = referentiels.millesimes.data;
    const varsData = referentiels.variables.data;
    if (!millData || !varsData) return;
    if (millData.formation !== cursus || varsData.formation !== cursus) return;

    const list = millData.millesimes;
    if (!Array.isArray(list) || list.length === 0) return;

    const defautMillesime = varsData.defauts?.millesime;
    if (defautMillesime && list.includes(defautMillesime)) {
      setMillesimeState(defautMillesime);
    } else {
      setMillesimeState(list[0]);
    }
  }, [referentiels.millesimes.data, referentiels.variables.data, millesime, cursus]);

  // ---------------------------------------------------------------------------
  // Auto-default des variables X/Y. Priorité au couple (indicateur_x,
  // indicateur_y) renvoyé par l'API (dim_defaut_cursus) si présent ET formant
  // un couple autorisé. Fallback : premier de couples_autorises.
  //
  // Dates d'insertion : pour chaque axe déclinable, on prend la date du défaut
  // API si non-null, sinon DEFAULT_DATE_INSER ('12'). Pour un axe non
  // déclinable, on force '' (l'API rejette une date sur indicateur non
  // déclinable).
  //
  // Note : ce traitement ne concerne QUE l'initialisation. Les setters
  // setVariableX/Y publics restent sur la logique simple DEFAULT_DATE_INSER —
  // un changement utilisateur ne ré-applique pas les défauts API.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (variableX !== null || variableY !== null) return;
    const data = referentiels.variables.data;
    if (!data) return;
    // Garde-fou anti-stale : ne pas appliquer les défauts d'un cursus précédent.
    // Sans ce check, après un setCursus le useEffect s'exécute une fois avec
    // les data du closure encore pointées sur l'ancien cursus → on poserait
    // des libellés introuvables dans le nouveau cursus (Y se retrouve vide).
    if (data.formation !== cursus) return;

    const couples = data.couples_autorises || [];
    if (couples.length === 0) return;

    const defauts = data.defauts;
    let defX = null;
    let defY = null;

    if (defauts?.indicateur_x && defauts?.indicateur_y) {
      const autorise = couples.some(
        ([x, y]) => x === defauts.indicateur_x && y === defauts.indicateur_y
      );
      if (autorise) {
        defX = defauts.indicateur_x;
        defY = defauts.indicateur_y;
      }
    }
    if (defX === null || defY === null) {
      [defX, defY] = couples[0];
    }

    const vars = data.variables || [];
    const declX = vars.find((v) => v.libelle === defX)?.declinable_delai ?? false;
    const declY = vars.find((v) => v.libelle === defY)?.declinable_delai ?? false;

    setVariableXState(defX);
    setVariableYState(defY);
    setDateInserX(declX ? (defauts?.date_inser_x ?? DEFAULT_DATE_INSER) : '');
    setDateInserY(declY ? (defauts?.date_inser_y ?? DEFAULT_DATE_INSER) : '');
  }, [referentiels.variables.data, variableX, variableY, cursus]);

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
    // Phase 4b
    scaleMode,
    rechercheMention,
    mentionsAffichees,
    affichage,
    nbBullesAccessibles,
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
    setScaleMode,
    setRechercheMention,
    setMentionsAffichees,
    setAffichage,
    setNbBullesAccessibles,
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
