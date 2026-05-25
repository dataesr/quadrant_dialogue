import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useQuadrant } from '../hooks/useQuadrant.js';
import { exportQuadrantPng } from '../utils/exportPng.js';
import { exportQuadrantXlsx } from '../utils/exportXlsx.js';

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
  } = useApp();

  const [exporting, setExporting] = useState(false);
  const [erreur, setErreur] = useState(null);

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
      const contexte = construireContexte({
        etabInfo, cursus, vue, millesime,
        variableX, variableY, dateInserX, dateInserY,
        domaine, discipline, secteur, mention, typeMaster,
        representativite, ligneReference,
      });

      if (affichage === 'graphique') {
        const wrapperEl = document.querySelector('.quadrant-wrapper');
        if (!wrapperEl) throw new Error('Quadrant introuvable dans la page.');
        await exportQuadrantPng({ wrapperEl, contexte });
      } else {
        await exportQuadrantXlsx({ data, contexte });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Erreur d\'export:', err);
      setErreur(err?.message || 'Échec de l\'export.');
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
