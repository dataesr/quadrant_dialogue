// Export Excel (XLSX) de la vue tableau.
//
// Reproduit la structure visuelle de QuadrantTable.jsx :
//   - 1 section par cadran (haut-droite, haut-gauche, bas-droite, bas-gauche)
//   - lignes triées par distance euclidienne au point idéal (1, 1)
//   - section finale « Mentions non représentées » (vue Mentions uniquement)
//
// Bulles anonymes (vue Positionnement) : exclues — cohérent avec
// `b.details_accessibles` filtré par QuadrantTable.
//
// Génère 2 feuilles : « Données » et « Métadonnées ». Les libellés des
// regroupements de cadrans DOIVENT rester alignés avec ceux de
// QuadrantTable.jsx (constantes LIBELLES_CADRANS + SEMANTIQUE).

import { NOM_SOURCE } from './constants.js';
import { construireNomFichier } from './exportPng.js';

const ORDRE_CADRANS = ['haut_droite', 'haut_gauche', 'bas_droite', 'bas_gauche'];

const LIBELLES_CADRANS = {
  haut_droite: 'Haut-droite',
  haut_gauche: 'Haut-gauche',
  bas_droite:  'Bas-droite',
  bas_gauche:  'Bas-gauche',
};

const SEMANTIQUE = {
  haut_droite: { x: 'élevé',  y: 'élevé'  },
  haut_gauche: { x: 'faible', y: 'élevé'  },
  bas_droite:  { x: 'élevé',  y: 'faible' },
  bas_gauche:  { x: 'faible', y: 'faible' },
};

const STATUT_PAR_RAISON = {
  pas_de_matching:                 { x: 'pas_de_donnee',  y: 'pas_de_donnee'  },
  pas_de_donnee_var1:              { x: 'pas_de_donnee',  y: 'valeur'         },
  pas_de_donnee_var2:              { x: 'valeur',         y: 'pas_de_donnee'  },
  denom_var1_et_var2_insuffisants: { x: 'non_diffusable', y: 'non_diffusable' },
  denom_var1_insuffisant:          { x: 'non_diffusable', y: 'valeur'         },
  denom_var2_insuffisant:          { x: 'valeur',         y: 'non_diffusable' },
};

const LIBELLE_STATUT = {
  pas_de_donnee:  'Pas de donnée',
  non_diffusable: 'Non diffusable',
};

// Palette cellules — alignée sur global.css.
const FILL_HEADER       = 'FFF0F0F0';
const FILL_REGROUPEMENT = 'FFE0E0E0';
const FILL_FRAGILE      = 'FFFFF4E5';
const FILL_SELECTIONNE  = 'FFFEF1F1';
const COLOR_NEUTRE      = 'FF888888';
const BORDER_COLOR      = 'FFCCCCCC';

const BORDER_THIN = {
  top:    { style: 'thin', color: { argb: BORDER_COLOR } },
  bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
  left:   { style: 'thin', color: { argb: BORDER_COLOR } },
  right:  { style: 'thin', color: { argb: BORDER_COLOR } },
};

export async function exportQuadrantXlsx({ data, contexte, wrapperEl }) {
  if (!data) throw new Error('exportQuadrantXlsx: data manquant.');

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();

  workbook.creator = NOM_SOURCE;
  workbook.created = new Date();
  workbook.description =
    `Export Quadrant - ${contexte?.vue || ''} - ` +
    `${contexte?.etabInfo?.libelle || ''} - ${contexte?.millesime || ''}`;

  // Calcul des groupes et mentions non représentées — même logique que
  // QuadrantTable.jsx.
  const { groupes, mentionsNonRepresentees, populationX, populationY } =
    preparerDonnees(data);

  remplirFeuilleDonnees(workbook, {
    groupes,
    mentionsNonRepresentees,
    populationX,
    populationY,
    contexte,
  });
  // Feuille « Graphique » — capture de l'image du quadrant. Tolérante
  // à l'échec : si la capture échoue (wrapper absent, html-to-image
  // rejette…) on garde les autres feuilles et on continue. L'export
  // XLSX ne doit pas casser à cause d'un problème d'image.
  await remplirFeuilleGraphique(workbook, wrapperEl);
  remplirFeuilleMetadonnees(workbook, contexte);
  remplirFeuilleMeta(workbook, contexte);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  declencherTelechargement(blob, construireNomFichier(contexte, 'xlsx'));
}

// ---------------------------------------------------------------------
// Préparation des données : groupes par cadran, mentions non représentées,
// libellés de population (pour l'en-tête des colonnes effectifs).
// ---------------------------------------------------------------------
function preparerDonnees(data) {
  const ref = data.reference;
  const bulles = (data.bulles || []).filter((b) => b.details_accessibles);

  const groupes = {
    haut_droite: [], haut_gauche: [],
    bas_droite:  [], bas_gauche:  [],
  };
  if (ref) {
    for (const b of bulles) {
      const cadran =
        b.x >= ref.x && b.y >= ref.y ? 'haut_droite' :
        b.x <  ref.x && b.y >= ref.y ? 'haut_gauche' :
        b.x >= ref.x && b.y <  ref.y ? 'bas_droite'  :
                                       'bas_gauche';
      groupes[cadran].push(b);
    }
    for (const k of ORDRE_CADRANS) {
      groupes[k].sort((a, b) => distanceAuPointIdeal(a) - distanceAuPointIdeal(b));
    }
  }

  const mentionsNonRepresentees = [...(data.mentions_non_representees || [])]
    .sort((a, b) => (a.libelle || '').localeCompare(b.libelle || '', 'fr'));

  // Population : on prend la première bulle qui en a (toutes les bulles
  // d'un même fetch ont la même cohorte de référence). Fallback string vide.
  const exemple = bulles.find((b) => b.population_x || b.population_y);
  const populationX = exemple?.population_x || '';
  const populationY = exemple?.population_y || '';

  return { groupes, mentionsNonRepresentees, populationX, populationY };
}

function distanceAuPointIdeal(b) {
  const dx = 1 - b.x;
  const dy = 1 - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ---------------------------------------------------------------------
// Feuille « Données »
// ---------------------------------------------------------------------
function remplirFeuilleDonnees(workbook, params) {
  const {
    groupes, mentionsNonRepresentees,
    populationX, populationY, contexte,
  } = params;

  const ws = workbook.addWorksheet('Données');

  // Largeurs : libellé large, taux compacts, dénoms larges (population complète).
  ws.columns = [
    { width: 50 },
    { width: 12 },
    { width: 22 },
    { width: 12 },
    { width: 22 },
  ];

  const entiteHeader = contexte?.vue === 'mentions' ? 'Mention' : 'Établissement';
  const libelleX = formatLibelleAxe(contexte?.variableX, contexte?.dateInserX);
  const libelleY = formatLibelleAxe(contexte?.variableY, contexte?.dateInserY);

  // --- En-tête principal (lignes 1 et 2) ---
  ws.addRow([entiteHeader, libelleX, '', libelleY, '']);
  ws.mergeCells('B1:C1');
  ws.mergeCells('D1:E1');

  ws.addRow(['', '%', populationX, '%', populationY]);

  for (const cell of ['A1', 'B1', 'D1']) styliserEntete(ws.getCell(cell));
  for (const cell of ['A2', 'B2', 'C2', 'D2', 'E2']) styliserEntete(ws.getCell(cell));

  ws.getRow(1).height = 22;
  ws.getRow(2).height = 18;

  // --- Cadrans ---
  const cadransNonVides = ORDRE_CADRANS.filter((k) => (groupes[k] || []).length > 0);
  const totalBulles = cadransNonVides.reduce((s, k) => s + groupes[k].length, 0);

  if (totalBulles === 0 && (contexte?.vue !== 'mentions' || mentionsNonRepresentees.length === 0)) {
    const row = ws.addRow(['Aucune donnée à afficher.']);
    ws.mergeCells(`A${row.number}:E${row.number}`);
    row.getCell(1).font = { italic: true, color: { argb: COLOR_NEUTRE } };
  }

  for (const cadran of cadransNonVides) {
    ajouterEnteteRegroupement(
      ws,
      `${LIBELLES_CADRANS[cadran]} — ${libelleX} ${SEMANTIQUE[cadran].x}` +
        ` × ${libelleY} ${SEMANTIQUE[cadran].y}`
    );
    for (const b of groupes[cadran]) ajouterLigneBulle(ws, b);
  }

  // --- Mentions non représentées (vue Mentions uniquement) ---
  if (contexte?.vue === 'mentions') {
    ajouterEnteteRegroupement(ws, 'Mentions non représentées');
    if (mentionsNonRepresentees.length === 0) {
      const row = ws.addRow([
        'Aucune mention non représentée pour cette combinaison de filtres.',
      ]);
      ws.mergeCells(`A${row.number}:E${row.number}`);
      row.getCell(1).font = { italic: true, color: { argb: COLOR_NEUTRE } };
    } else {
      for (const m of mentionsNonRepresentees) ajouterLigneMentionNonRep(ws, m);
    }
  }

  // Fige la double ligne d'entête pour faciliter la lecture des longs tableaux.
  ws.views = [{ state: 'frozen', ySplit: 2 }];
}

function ajouterEnteteRegroupement(ws, libelle) {
  const row = ws.addRow([libelle]);
  ws.mergeCells(`A${row.number}:E${row.number}`);
  const cell = row.getCell(1);
  cell.font = { bold: true };
  cell.fill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: FILL_REGROUPEMENT },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  cell.border = BORDER_THIN;
  row.height = 20;
}

function ajouterLigneBulle(ws, b) {
  const row = ws.addRow([
    b.libelle || '',
    typeof b.x === 'number' ? b.x : null,
    typeof b.denom_x === 'number' ? b.denom_x : null,
    typeof b.y === 'number' ? b.y : null,
    typeof b.denom_y === 'number' ? b.denom_y : null,
  ]);

  // Format des taux en pourcent (la valeur API est déjà 0..1).
  row.getCell(2).numFmt = '0.0%';
  row.getCell(4).numFmt = '0.0%';

  // Alignement à droite pour les colonnes numériques.
  for (const idx of [2, 3, 4, 5]) {
    row.getCell(idx).alignment = { horizontal: 'right' };
  }

  // Bordures fines sur toutes les cellules de la ligne.
  for (let i = 1; i <= 5; i++) row.getCell(i).border = BORDER_THIN;

  // Ligne sélectionnée (étab de contexte) : fond pastel rouge.
  if (b.couleur_key === 'selectionne') {
    for (let i = 1; i <= 5; i++) {
      row.getCell(i).fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: FILL_SELECTIONNE },
      };
    }
  }

  // Cellules fragiles (5 ≤ denom ≤ 19) : pastel orange — prend le pas
  // visuellement sur le fond rouge de ligne sélectionnée (cohérent
  // avec les règles CSS écran).
  if (estFragile(b.denom_x)) appliquerFragile(row.getCell(2), row.getCell(3));
  if (estFragile(b.denom_y)) appliquerFragile(row.getCell(4), row.getCell(5));

  // Cellule non diffusable (denom absent ou < 5) : texte explicite en
  // italique gris à la place de la valeur. Cas théoriquement filtré par
  // l'API (la bulle ne devrait pas remonter), mais défensif.
  if (typeof b.denom_x !== 'number' || b.denom_x < 5) {
    formaterNonDiffusable(row.getCell(2), row.getCell(3));
  }
  if (typeof b.denom_y !== 'number' || b.denom_y < 5) {
    formaterNonDiffusable(row.getCell(4), row.getCell(5));
  }
}

function ajouterLigneMentionNonRep(ws, m) {
  // 3 cas par axe (cf. STATUT_PAR_RAISON) :
  //   - 'valeur'         : on rend la valeur comme une bulle ordinaire
  //   - 'non_diffusable' : 'Non diffusable' italique gris
  //   - 'pas_de_donnee'  : 'Pas de donnée' italique gris
  const statutX = STATUT_PAR_RAISON[m.raison]?.x;
  const statutY = STATUT_PAR_RAISON[m.raison]?.y;

  const row = ws.addRow([
    m.libelle || m.diplom || '',
    statutX === 'valeur' && typeof m.x === 'number' ? m.x : null,
    statutX === 'valeur' && typeof m.denom_x === 'number' ? m.denom_x : null,
    statutY === 'valeur' && typeof m.y === 'number' ? m.y : null,
    statutY === 'valeur' && typeof m.denom_y === 'number' ? m.denom_y : null,
  ]);

  row.getCell(2).numFmt = '0.0%';
  row.getCell(4).numFmt = '0.0%';
  for (const idx of [2, 3, 4, 5]) {
    row.getCell(idx).alignment = { horizontal: 'right' };
  }
  for (let i = 1; i <= 5; i++) row.getCell(i).border = BORDER_THIN;

  if (statutX === 'valeur' && estFragile(m.denom_x)) {
    appliquerFragile(row.getCell(2), row.getCell(3));
  }
  if (statutY === 'valeur' && estFragile(m.denom_y)) {
    appliquerFragile(row.getCell(4), row.getCell(5));
  }

  if (statutX !== 'valeur') {
    formaterStatut(row.getCell(2), row.getCell(3), LIBELLE_STATUT[statutX] || '—');
  }
  if (statutY !== 'valeur') {
    formaterStatut(row.getCell(4), row.getCell(5), LIBELLE_STATUT[statutY] || '—');
  }
}

function estFragile(denom) {
  return typeof denom === 'number' && denom >= 5 && denom <= 19;
}

function appliquerFragile(cellTaux, cellDenom) {
  const fill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: FILL_FRAGILE },
  };
  cellTaux.fill = fill;
  cellDenom.fill = fill;
}

function formaterNonDiffusable(cellTaux, cellDenom) {
  cellTaux.value = 'Non diffusable';
  cellTaux.numFmt = '@';
  cellTaux.alignment = { horizontal: 'right' };
  cellTaux.font = { italic: true, color: { argb: COLOR_NEUTRE } };
  cellDenom.value = null;
}

function formaterStatut(cellTaux, cellDenom, libelle) {
  cellTaux.value = libelle;
  cellTaux.numFmt = '@';
  cellTaux.alignment = { horizontal: 'right' };
  cellTaux.font = { italic: true, color: { argb: COLOR_NEUTRE } };
  cellDenom.value = null;
}

function styliserEntete(cell) {
  cell.font = { bold: true };
  cell.fill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: FILL_HEADER },
  };
  cell.alignment = {
    vertical: 'middle', horizontal: 'center', wrapText: true,
  };
  cell.border = BORDER_THIN;
}

// ---------------------------------------------------------------------
// Feuille « Graphique » : image PNG du quadrant captée depuis le DOM.
// En mode tableau le wrapper est rendu hors écran (cf. App.jsx +
// `.quadrant-offscreen` dans global.css) ; en mode graphique il est
// directement visible. html-to-image opère sur l'élément peu importe.
//
// Image insérée à l'origine de la feuille, dimensionnée pour rester
// lisible sans débordement : 960×680 px (ratio ≈ celui du quadrant).
// Si la capture échoue (lib absente, wrapper manquant, contenu non
// stylé), on log et on continue — l'absence d'image ne doit pas casser
// l'export tabulaire qui reste le contenu principal.
// ---------------------------------------------------------------------
async function remplirFeuilleGraphique(workbook, wrapperEl) {
  if (!wrapperEl) return;

  let buffer;
  try {
    const { toPng } = await import('html-to-image');
    const dataUrl = await toPng(wrapperEl, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true,
    });
    // dataUrl est de la forme "data:image/png;base64,XXXX". On
    // n'utilise pas fetch(dataUrl).blob() pour éviter une étape réseau
    // (même locale) — décodage base64 direct.
    const base64 = dataUrl.split(',', 2)[1];
    const bin = atob(base64);
    buffer = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buffer[i] = bin.charCodeAt(i);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Capture du quadrant pour XLSX échouée :', err);
    return;
  }

  const ws = workbook.addWorksheet('Graphique');
  const imageId = workbook.addImage({
    buffer,
    extension: 'png',
  });
  // Placement TL = colonne 0 / ligne 0 ; extent en pixels pour une
  // image autoportée (les colonnes Excel restent par défaut).
  ws.addImage(imageId, {
    tl: { col: 0, row: 0 },
    ext: { width: 960, height: 680 },
  });
}

// ---------------------------------------------------------------------
// Feuille « Métadonnées » : clé-valeur en 2 colonnes.
// La traçabilité (contexte_id, tokens…) est isolée dans une feuille
// cachée — cf. remplirFeuilleTracabilite plus bas.
// ---------------------------------------------------------------------
function remplirFeuilleMetadonnees(workbook, contexte) {
  const ws = workbook.addWorksheet('Métadonnées');
  ws.columns = [{ width: 28 }, { width: 70 }];

  const vueLib = contexte?.vue === 'mentions' ? 'Mentions' : 'Positionnement';
  const filtres = contexte?.filtres || {};

  // Toutes les valeurs « marqueurs d'absence » (Aucun / Tous /
  // Non applicable / vide) sont omises de la feuille : un filtre
  // disciplinaire vide n'apporte pas d'information à l'utilisateur,
  // autant économiser la ligne pour ne garder que ce qui est
  // signifiant.
  const lignes = [
    ['Titre',                  `Export quadrant — ${vueLib}`],
    ['Établissement réf.',     contexte?.etabInfo?.libelle || ''],
    ['Région',                 contexte?.etabInfo?.region?.libelle
                                 || contexte?.etabInfo?.region?.code || ''],
    ['Typologie',              contexte?.etabInfo?.typologie || ''],
    ['Cursus',                 contexte?.cursus || ''],
    ['Millésime',              contexte?.millesime || ''],
    ['Axe horizontal',         formatLibelleAxe(contexte?.variableX, contexte?.dateInserX)],
    ['Axe vertical',           formatLibelleAxe(contexte?.variableY, contexte?.dateInserY)],
    ['Ligne de référence',     filtres.ligneReference === 'moyenne' ? 'Moyenne' : 'Médiane'],
    ['Représentativité',       filtres.representativite
                                 ? 'Représentatif uniquement (denom ≥ 20)'
                                 : 'Toutes (denom ≥ 5)'],
    ['Filtres disciplinaires', formatFiltresDisciplinaires(filtres)],
    ['Filtre Mention',         filtres.mention || ''],
    ['Type de Master',         filtres.typeMaster || ''],
    ['Date d\'export',         formatDateTimeIso(new Date())],
    ['Source de données',      NOM_SOURCE],
  ];

  for (const [k, v] of lignes) {
    if (estValeurAbsente(v)) continue;
    ajouterLigneMeta(ws, k, v);
  }
}

// Une « valeur absente » est null/undefined, chaîne vide, ou un
// libellé conventionnel d'absence (Aucun, Tous, Non applicable).
// Évite de polluer la feuille avec des lignes informatives à zéro.
function estValeurAbsente(valeur) {
  if (valeur == null) return true;
  const s = String(valeur).trim();
  if (s === '') return true;
  return s === 'Aucun' || s === 'Tous' || s === 'Non applicable';
}

// ---------------------------------------------------------------------
// Feuille « Méta » : masquée par défaut (réaffichable par clic-droit
// sur les onglets > Afficher). Contient le contexte_id, les tokens de
// session disponibles et la date d'export ISO 8601 — pour permettre
// une enquête sur l'origine d'un fichier sans pour autant imposer
// cette information à l'usage courant. Une seconde couche est portée
// par les propriétés document Excel (workbook.creator,
// workbook.description) qui restent invisibles à l'œil nu.
//
// Nom court et neutre choisi pour rester discret dans la liste
// d'onglets une fois réaffichée.
// ---------------------------------------------------------------------
function remplirFeuilleMeta(workbook, contexte) {
  const ws = workbook.addWorksheet('Méta', { state: 'hidden' });
  ws.columns = [{ width: 28 }, { width: 70 }];

  const tokens = contexte?.tokens || {};
  const lignes = [
    ['Date d\'export (ISO 8601)', new Date().toISOString()],
  ];
  if (tokens.contexteId)       lignes.push(['Contexte ID',       tokens.contexteId]);
  if (tokens.tokenConnexion)   lignes.push(['Token connexion',   tokens.tokenConnexion]);
  if (tokens.tokenUtilisateur) lignes.push(['Token utilisateur', tokens.tokenUtilisateur]);

  for (const [k, v] of lignes) ajouterLigneMeta(ws, k, v);
}

function ajouterLigneMeta(ws, cle, valeur) {
  const row = ws.addRow([cle, valeur]);
  if (cle) row.getCell(1).font = { bold: true };
  row.getCell(1).alignment = { vertical: 'top' };
  row.getCell(2).alignment = { vertical: 'top', wrapText: true };
}

function formatFiltresDisciplinaires(f) {
  const parts = [];
  if (f.domaine)    parts.push(`Domaine = ${f.domaine}`);
  if (f.discipline) parts.push(`Discipline = ${f.discipline}`);
  if (f.secteur)    parts.push(`Secteur = ${f.secteur}`);
  return parts.join(' · ');
}

function formatLibelleAxe(variable, dateInser) {
  if (!variable) return '';
  if (!dateInser) return variable;
  return `${variable} (${dateInser} mois)`;
}

function formatDateTimeIso(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function declencherTelechargement(blob, nomFichier) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
