import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useQuadrant } from '../hooks/useQuadrant.js';
import { exportQuadrantPng } from '../utils/exportPng.js';
import { exportQuadrantXlsx } from '../utils/exportXlsx.js';
import { messageErreur } from '../utils/errors.js';
import { trackEvent } from '../utils/matomo.js';

// Bouton d'export adaptatif au mode courant :
//   - affichage='graphique' → PNG (capture du .quadrant-wrapper avec
//     bandeau titre injecté, pied source + date, métadonnées tEXt).
//   - affichage='tableau'   → XLSX (2 feuilles : Données + Métadonnées,
//     structure identique à QuadrantTable.jsx, cellules stylées).
//
// Placement : en pied du panneau de filtres latéral, après
// AdvancedFilters. Désactivé tant qu'aucun établissement n'est
// sélectionné ou que la réponse API n'a pas livré de bulles
// exploitables.
//
// Fetch : on appelle useQuadrant ici aussi — c'est un fetch
// supplémentaire vis-à-vis de <Quadrant> ou <QuadrantTable> mais
// acceptable (payload léger, requête identique donc négligeable côté
// API). La factorisation au niveau AppContext est notée pour plus tard.

export default function BoutonExport() {
  const {
    etabContexte, etabInfo, cursus, vue, millesime,
    variableX, variableY, dateInserX, dateInserY,
    domaine, discipline, secteur, mention, typeMaster,
    representativite, ligneReference,
    affichage,
    rechercheMention,
    referentiels,
  } = useApp();

  const [exporting, setExporting] = useState(false);
  const [erreur, setErreur] = useState(null);

  // Auto-effacement du message d'erreur après 5 s — toast-like.
  // L'utilisateur peut retenter sans avoir à fermer manuellement.
  useEffect(() => {
    if (!erreur) return;
    const t = setTimeout(() => setErreur(null), 5000);
    return () => clearTimeout(t);
  }, [erreur]);

  const { data } = useQuadrant({
    cursus, vue, millesime,
    variableX, variableY, dateInserX, dateInserY,
    etabContexte,
    domaine, discipline, secteur, mention, typeMaster,
    representativite, ligneReference,
  });

  // Au moins une bulle exploitable : vue Mentions = au moins une bulle
  // tout court ; vue Positionnement = au moins une bulle accessible
  // (les bulles anonymes ne sont pas exportables côté tableau, mais
  // restent dans le PNG). On utilise la même condition pour les deux
  // modes — un PNG d'un quadrant vide n'est pas utile.
  const aDesDonnees =
    !!data && Array.isArray(data.bulles) && data.bulles.length > 0;

  const peutExporter = !!etabContexte && aDesDonnees && !exporting;

  const libelle = affichage === 'graphique'
    ? 'Télécharger le graphique (PNG)'
    : 'Télécharger les données (Excel)';

  const tooltip = !etabContexte
    ? 'Sélectionnez un établissement pour activer l\'export.'
    : !aDesDonnees
      ? 'Aucune donnée à exporter pour les filtres actuels.'
      : undefined;

  async function handleExport() {
    if (!peutExporter) return;
    setErreur(null);
    setExporting(true);
    try {
      // Résolution du surlignage : on n'expose une mention/un
      // établissement surligné dans l'export que si la recherche
      // courante matche EXACTEMENT le libellé d'une bulle affichée
      // (même règle que <Bulles>). Une recherche partielle reste
      // visuelle, sans trace dans l'export.
      const surligne = resoudreSurlignage(rechercheMention, data?.bulles);

      // Résolution du libellé de la mention : `mention` est un diplom
      // code interne ('2500180') ; pour les exports on veut le libellé
      // humain ('ECONOMIE'). Recherche dans la liste des mentions du
      // référentiel disciplinaire (= toutes les mentions du cursus,
      // déjà chargée par useReferentiels). Fallback sur le code si
      // jamais le référentiel n'est pas dispo.
      const mentionLibelle = resoudreMentionLibelle(
        mention,
        referentiels.disciplinaire.data?.mentions
      );

      const contexte = construireContexte({
        etabInfo, cursus, vue, millesime,
        variableX, variableY, dateInserX, dateInserY,
        domaine, discipline, secteur,
        mention: mentionLibelle,
        typeMaster,
        representativite, ligneReference,
        surligne,
      });

      // Tracking AVANT le lancement de l'export : on capte
      // l'intention même si l'export échoue ensuite. Pas de PII —
      // que des dimensions analytiques (étab/vue/cursus/millésime).
      const trackContexte = {
        etab: etabInfo?.libelle,
        vue,
        cursus,
        millesime,
      };

      if (affichage === 'graphique') {
        trackEvent('Export', 'export_png', null, trackContexte);
        const wrapperEl = document.querySelector('.quadrant-wrapper');
        if (!wrapperEl) throw new Error('Quadrant introuvable dans la page.');
        await exportQuadrantPng({ wrapperEl, contexte });
      } else {
        trackEvent('Export', 'export_xlsx', null, trackContexte);
        // En mode tableau le quadrant est rendu hors écran (cf.
        // App.jsx > .quadrant-offscreen) — la capture pour la feuille
        // « Graphique » du XLSX se fait sur ce wrapper offscreen.
        const wrapperEl = document.querySelector('.quadrant-wrapper');
        await exportQuadrantXlsx({ data, contexte, wrapperEl });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Erreur d\'export:', err);
      setErreur(messageErreur(err) || 'Échec de l\'export.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="bouton-export-zone">
      <button
        type="button"
        className="fr-btn fr-btn--icon-left fr-icon-download-line"
        onClick={handleExport}
        disabled={!peutExporter}
        title={tooltip}
      >
        {exporting ? 'Génération en cours…' : libelle}
      </button>
      {erreur && (
        <p className="fr-error-text" role="alert">{erreur}</p>
      )}
    </div>
  );
}

// Le `contexte` regroupe tout ce dont les helpers ont besoin pour
// composer titre, métadonnées et nom de fichier — sans avoir à
// connaître l'AppContext.
function construireContexte(params) {
  return {
    etabInfo: params.etabInfo,
    cursus:   params.cursus,
    vue:      params.vue,
    millesime: params.millesime,
    variableX: params.variableX,
    variableY: params.variableY,
    dateInserX: params.dateInserX,
    dateInserY: params.dateInserY,
    filtres: {
      domaine: params.domaine,
      discipline: params.discipline,
      secteur: params.secteur,
      mention: params.mention,
      typeMaster: params.typeMaster,
      representativite: params.representativite,
      ligneReference: params.ligneReference,
    },
    surligne: params.surligne || null,
    tokens: {
      // En mode dev, seul `contexte_id` est connu côté frontend (lu
      // dans VITE_CONTEXTE_ID_DEV). Les vrais tokens de session
      // (token_connexion, token_utilisateur) ne sont pas exposés au
      // JS — ils seront ajoutés ici si un canal frontend les rend
      // disponibles plus tard.
      contexteId: import.meta.env.VITE_CONTEXTE_ID_DEV || undefined,
      tokenConnexion: undefined,
      tokenUtilisateur: undefined,
    },
  };
}

// Résout un diplom (code interne, ex. '2500180') vers son libellé
// humain via la liste des mentions du référentiel disciplinaire.
// Retourne null si pas de code (filtre = « Toutes les mentions »),
// le libellé trouvé si match, ou le code brut en fallback (mieux que
// rien si le référentiel n'est pas encore chargé — cas peu probable
// à l'instant du clic Export, mais défensif).
function resoudreMentionLibelle(diplom, mentions) {
  if (!diplom) return null;
  const trouve = (mentions || []).find((m) => m.code === diplom);
  return trouve?.libelle || diplom;
}

// Même règle de matching que <Bulles>/libellesMatchent : libellé
// exact, casse et espaces ignorés. On retourne le libellé canonique
// de la bulle (pas la saisie utilisateur) pour rester fidèle à
// l'affichage à l'écran.
function resoudreSurlignage(recherche, bulles) {
  if (!recherche || !Array.isArray(bulles) || bulles.length === 0) return null;
  const cible = recherche.trim().toLowerCase();
  if (!cible) return null;
  const bulle = bulles.find(
    (b) => (b.libelle || '').trim().toLowerCase() === cible
  );
  if (!bulle) return null;
  return { libelle: bulle.libelle };
}
