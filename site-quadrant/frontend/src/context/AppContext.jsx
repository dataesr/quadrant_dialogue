import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { getEtablissementsVisibles } from '../services/api.js';
import { useReferentiels } from '../hooks/useReferentiels.js';
import { useFrontendConfig } from '../hooks/useFrontendConfig.js';
import { messageErreur } from '../utils/errors.js';

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

// Référence des axes en vue Mentions (Phase 15.1) : sélecteur enrichi
// « mesure × périmètre » au lieu d'un mode unique.
//   - mesureAxes      : 'mediane' (défaut) | 'moyenne' (exclusif).
//   - perimetresAxes  : sous-ensemble de ['etab', 'national'] (multi-
//                       sélection : 0, 1 ou 2 actifs). Vide = aucune
//                       ligne de référence affichée.
// Le couple (mesure, périmètre) mappe sur les clés du bloc `axes` de
// /quadrant : etab → `${mesure}_etab`, national → `${mesure}_nationale`
// (les 4 clés mediane_etab / moyenne_etab / mediane_nationale /
// moyenne_nationale existent côté API). Cf. backend quadrant.php §7 bis.
//
// Un `referenceAxes` (string unique, mode « principal ») est DÉRIVÉ de
// ces deux états pour les consommateurs qui n'affichent qu'une seule
// référence (classification des cadrans du tableau, exports PNG/XLSX,
// libellés). Périmètre principal = étab si présent, sinon national,
// sinon étab par défaut (le tableau a toujours besoin d'un repère).
const DEFAULT_MESURE_AXES     = 'mediane';
const DEFAULT_PERIMETRES_AXES = ['etab'];
const PERIMETRE_SUFFIXE_AXES  = { etab: 'etab', national: 'nationale' };

// Mode de référence des axes en vue Positionnement (2 valeurs).
// 'mediane' (défaut) : médiane des taux sur l'ensemble des bulles
//                      (toutes France après filtres disciplinaires).
// 'moyenne'          : équivalent moyenne (selon agregation côté API).
// Pas de suffixe « nationale » dans le libellé UI — la vue est déjà
// nationale par construction (pas de filtre étab), donc implicite.
// Distinct de `referenceAxes` (3 modes Mentions) pour éviter toute
// confusion sémantique. Propagé au backend via le paramètre
// `agregation` de /api/quadrant — qui détermine data.reference.
const DEFAULT_REFERENCE_AXES_POSITIONNEMENT = 'mediane';

// Date d'insertion choisie par défaut quand on bascule sur une variable
// déclinable (12 mois — milieu de la fourchette canonique 6/12/18/24/30).
const DEFAULT_DATE_INSER = '12';

export function AppProvider({ children }) {
  // --- Phase 2 : établissement + onglets ---
  const [etabContexte, setEtabContexteState] = useState(null);
  const [etabInfo,     setEtabInfo]          = useState(null);
  const [etabList,     setEtabList]          = useState([]);
  const [mode,         setMode]              = useState(null);
  const [vue,          setVueState]          = useState('mentions');
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
  // Filtre « Même typologie uniquement » — vue Positionnement
  // uniquement. Quand actif, restreint les bulles affichées aux étabs
  // partageant la typologie de l'établissement de contexte. La
  // typologie est lue côté backend (à partir d'etab_contexte) — pas
  // de duplication d'info côté state.
  const [memeTypologie, setMemeTypologie] = useState(false);
  // Référence des axes vue Mentions — sélecteur enrichi (cf. defaults ci-dessus).
  const [mesureAxes,     setMesureAxes]     = useState(DEFAULT_MESURE_AXES);
  const [perimetresAxes, setPerimetresAxes] = useState(DEFAULT_PERIMETRES_AXES);
  const [referenceAxesPositionnement, setReferenceAxesPositionnement] =
    useState(DEFAULT_REFERENCE_AXES_POSITIONNEMENT);

  // Toggle d'un périmètre (étab / national) en multi-sélection. Ajoute
  // s'il est absent, retire s'il est présent — 0, 1 ou 2 peuvent être
  // actifs (0 = mode « sans référence », aucune ligne tracée).
  const togglePerimetreAxes = useCallback((perimetre) => {
    setPerimetresAxes((prev) =>
      prev.includes(perimetre)
        ? prev.filter((p) => p !== perimetre)
        : [...prev, perimetre]
    );
  }, []);

  // `referenceAxes` dérivé : mode « principal » (string unique) pour les
  // consommateurs mono-référence (tableau, exports, libellés). Périmètre
  // principal = étab si présent, sinon national, sinon étab par défaut.
  const perimetrePrincipalAxes = perimetresAxes.includes('etab')
    ? 'etab'
    : perimetresAxes.includes('national')
      ? 'national'
      : 'etab';
  const referenceAxes = `${mesureAxes}_${PERIMETRE_SUFFIXE_AXES[perimetrePrincipalAxes]}`;

  // --- Phase 4b : compléments quadrant ---
  // Mode d'échelle des bulles arrêté à 'sqrt' (racine carrée du
  // dénominateur). Conservé en state pour ne pas bouleverser les
  // signatures de Bulles.jsx / rayonBulle() ; le sélecteur d'UI a
  // été retiré (phase 7 — un seul mode validé).
  const [scaleMode] = useState('sqrt');
  // Affichage optionnel des histogrammes de distribution sur les
  // bords haut (axe X) et droit (axe Y) du quadrant. Toggle exposé
  // dans le panneau « Plus d'options » (cf. AdvancedFilters), désactivé
  // par défaut. Les histogrammes comptent uniquement les bulles
  // effectivement affichées (cohérent en export — qui filtre seuil 20).
  const [afficherDistributions, setAfficherDistributions] = useState(false);
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
  // Bulle « cible » du panneau de détails (phase 5). null = panneau fermé.
  //   { type: 'mention'|'etablissement', targetId: string, mention?: string }
  // Reset auto au moindre changement structurel des filtres : la cible
  // n'a plus de sens si on passe à un autre cursus, vue, millésime ou
  // étab de référence.
  const [detailsCible, setDetailsCibleState] = useState(null);

  // --- Initialisation : /etablissements-visibles ---
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // --- Référentiels (millesimes, variables, disciplinaire) ---
  // Le hook gère son propre cache par formation / (formation, millesime).
  const referentiels = useReferentiels({ formation: cursus, millesime, idPaysage: etabContexte });

  // Configuration UI exposée par l'API (activation des boutons
  // d'export). Fetch unique au montage, fallback permissif si KO —
  // ne casse jamais l'app.
  const frontendConfig = useFrontendConfig();

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
        setError(messageErreur(err));
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
      setDetailsCibleState(null); // cible probablement invalide après changement d'étab
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

  // Setter détailsCible exposé tel quel (pas de logique métier supplémentaire).
  const setDetailsCible = useCallback((cible) => {
    setDetailsCibleState(cible);
  }, []);

  // Changement de cursus : tout ce qui dépend du cursus est invalidé.
  // - millésime + variables + dates → seront re-défaultés quand les
  //   nouveaux référentiels arriveront ;
  // - filtres disciplinaires + typeMaster → on les remet à zéro car les
  //   valeurs disponibles changent avec le cursus ;
  // - representativite + referenceAxes + referenceAxesPositionnement
  //   → préservés (préférences UX indépendantes du cursus).
  // - detailsCible → fermé : cible probablement invalide dans le nouveau cursus.
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
    setDetailsCibleState(null);
  }, []);

  // Wrappers de setVue et setMillesime qui ferment le panneau de détails
  // — la cible n'a plus forcément de sens après changement (ex. une
  // mention de l'étab n'a pas d'équivalent en vue Positionnement).
  const setVue = useCallback((v) => {
    setVueState(v);
    setDetailsCibleState(null);
  }, []);
  const setMillesime = useCallback((m) => {
    setMillesimeState(m);
    setDetailsCibleState(null);
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

  // ---------------------------------------------------------------------------
  // Setters disciplinaires en cascade — auto-clear downstream
  // ---------------------------------------------------------------------------
  // Quand l'utilisateur change un filtre amont (Domaine ou Discipline),
  // les filtres aval (Discipline / Secteur) sont vidés s'ils ne sont
  // plus compatibles. Cohérent avec le grisage des options
  // incompatibles côté ReferentielSelect (`isItemDisabled`). Sans cet
  // auto-clear, un utilisateur qui passe de Domaine=STS+Discipline=Chimie
  // à Domaine=DEG enverrait à l'API une combinaison invalide et
  // verrait 0 bulle sans comprendre pourquoi.
  //
  // Pas d'auto-set upstream : choisir un Secteur ne fixe PAS
  // automatiquement le Domaine / Discipline parents — cela ferait
  // apparaître des pills que l'utilisateur n'a pas explicitement
  // ajoutées, sentiment de magie indésirable.
  const setDomaineCascade = useCallback((newDom) => {
    setDomaine(newDom);
    if (!newDom) return;
    const data = referentiels.disciplinaire?.data;
    if (!data) return;
    if (discipline) {
      const item = (data.disciplines || []).find((d) => d.code === discipline);
      if (item && item.dom_code !== newDom) setDiscipline(null);
    }
    if (secteur) {
      const item = (data.secteurs || []).find((s) => s.code === secteur);
      if (item && item.dom_code !== newDom) setSecteur(null);
    }
  }, [discipline, secteur, referentiels.disciplinaire?.data]);

  const setDisciplineCascade = useCallback((newDis) => {
    setDiscipline(newDis);
    if (!newDis) return;
    const data = referentiels.disciplinaire?.data;
    if (!data) return;
    if (secteur) {
      const item = (data.secteurs || []).find((s) => s.code === secteur);
      if (item && item.discipli_code !== newDis) setSecteur(null);
    }
  }, [secteur, referentiels.disciplinaire?.data]);

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
    setMemeTypologie(false);
    setMesureAxes(DEFAULT_MESURE_AXES);
    setPerimetresAxes(DEFAULT_PERIMETRES_AXES);
    setReferenceAxesPositionnement(DEFAULT_REFERENCE_AXES_POSITIONNEMENT);
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
    memeTypologie,
    // Référence des axes vue Mentions (Phase 15.1) : état enrichi +
    // `referenceAxes` dérivé (mode principal, compat tableau/exports).
    mesureAxes,
    perimetresAxes,
    referenceAxes,
    referenceAxesPositionnement,
    // Phase 4b
    scaleMode,
    rechercheMention,
    mentionsAffichees,
    affichage,
    nbBullesAccessibles,
    detailsCible,
    afficherDistributions,
    // Référentiels chargés
    referentiels,
    frontendConfig,
    // État global
    loading, error,
    // Actions
    setEtabContexte, setVue, setCursus,
    setMillesime,
    setVariableX, setVariableY,
    setDateInserX, setDateInserY,
    // Setters disciplinaires exposés en version cascade (auto-clear
     // downstream). Les setters bruts (setDomaine, setDiscipline) restent
     // utilisés en interne par resetAdvancedFilters et setCursus.
    setDomaine: setDomaineCascade,
    setDiscipline: setDisciplineCascade,
    setSecteur,
    setMention,
    setTypeMaster,
    setRepresentativite,
    setMemeTypologie,
    setMesureAxes,
    setPerimetresAxes,
    togglePerimetreAxes,
    setReferenceAxesPositionnement,
    resetAdvancedFilters,
    setRechercheMention,
    setMentionsAffichees,
    setAffichage,
    setNbBullesAccessibles,
    setDetailsCible,
    setAfficherDistributions,
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
