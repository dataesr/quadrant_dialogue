// Export Word (.docx) d'une fiche issue du panneau de détails.
//
// Architecture : éléments natifs Word (Paragraph, Heading, Table,
// Footer) pour le texte ET les structures ; html-to-image n'est
// utilisé QUE pour capturer les SVG des graphiques (mini-graphes
// d'évolution, multi-courbes, sparklines). Le résultat est un
// document Word « propre » : texte sélectionnable, structure
// navigable dans le volet de plan, graphiques isolés sans boutons
// UI ni légendes parasites.
//
// Structure produite :
//   [H1]   Libellé de la bulle (mention ou établissement)
//   [italique gris]  Identité secondaire (secteur OU région · typo)
//   [H2]   Contexte
//   [Table 2 colonnes]  Établissement ref / (Région / Typologie) / Cursus / Millésime
//   [H2]   Indicateurs du quadrant
//     Pour chaque axe X/Y :
//       [H3] Libellé indicateur (avec date_inser si déclinable)
//       [centré 16pt gras] Valeur principale
//       [centré 9pt italique gris] Détail num / denom / population
//       [image] Mini-graphe SVG isolé
//   [H2]   Évolution historique des indicateurs
//     Pour chaque multi-courbe (Réussite + Insertion…) :
//       [H3] Titre du groupe
//       [image] Multi-courbe SVG isolé
//     Pour les indicateurs simples :
//       [Table 3 colonnes] Indicateur / Taux / Sparkline image
//   [Footer]  Source · Date  /  Mention de diffusion (italique gris)
//
// Captures isolées : on cible les `.graphe-zone` (div interne aux
// composants de graphique), ce qui exclut le titre HTML (`.graphe-titre`)
// et la légende textuelle externe. Le ratio natif de chaque image est
// préservé en lisant ses dimensions après capture.

import { LIBELLE_SOURCE, MENTION_DIFFUSION, NOM_SOURCE } from './constants.js';

// Largeur cible (en pixels Word) pour chaque type d'image.
const LARGEUR_MINI_GRAPHE  = 480;
const LARGEUR_MULTI_GRAPHE = 560;
const LARGEUR_SPARKLINE    = 100;

export async function exportFicheDocx({ ficheData, contexte, panneauEl }) {
  if (!ficheData)  throw new Error('exportFicheDocx: ficheData manquant.');
  if (!panneauEl)  throw new Error('exportFicheDocx: panneauEl manquant.');

  const [
    { toPng },
    docx,
  ] = await Promise.all([
    import('html-to-image'),
    import('docx'),
  ]);

  const {
    Document, Packer, Paragraph, HeadingLevel,
    TextRun, ImageRun, AlignmentType,
    Table, TableRow, TableCell, WidthType, BorderStyle, Footer,
  } = docx;

  // -------------------- Données dérivées --------------------
  const titre   = titreFiche(ficheData);
  const sousT   = sousTitreFiche(ficheData);
  const dateFR  = formatDateHumaine(new Date());

  // -------------------- Capture des graphiques --------------------
  // Cards X/Y : on lit les valeurs depuis le DOM rendu (déjà mis en
  // forme à l'écran) puis on capture la graphe-zone. Cela évite de
  // re-formatter et garde une fidélité parfaite avec ce que voit
  // l'utilisateur au moment de l'export.
  const cardsEls = panneauEl.querySelectorAll(
    '.section-indicateurs-principaux .indicateur-card'
  );
  const cards = [];
  for (const cardEl of cardsEls) {
    const libelle = cardEl.querySelector('.libelle-indicateur')?.textContent || '';
    const valeur  = cardEl.querySelector('.valeur-principale')?.textContent || '';
    const detail  = cardEl.querySelector('.detail-numerateur')?.textContent || '';
    const zone    = cardEl.querySelector('.graphe-zone');
    const image   = zone ? await capturerImage(zone, toPng) : null;
    cards.push({ libelle, valeur, detail, image });
  }

  // Multi-courbes du bloc « Évolution historique » : direct enfants
  // .graphe-indicateur de la section. Ordre DOM = Réussite (si
  // affichable) puis chaque Insertion.
  const sectionAutresEl = panneauEl.querySelector('.section-autres-indicateurs');
  const multiCourbes = [];
  if (sectionAutresEl) {
    const grafs = sectionAutresEl.querySelectorAll(':scope > .graphe-indicateur');
    for (const gEl of grafs) {
      const titreG = gEl.querySelector('.graphe-titre')?.textContent || '';
      const zone   = gEl.querySelector('.graphe-zone');
      const image  = zone ? await capturerImage(zone, toPng) : null;
      multiCourbes.push({ titre: titreG, image });
    }
  }

  // Indicateurs simples : 1 ligne par tr du tableau historique. On
  // capture chaque sparkline SVG individuellement.
  const lignesSimples = [];
  if (sectionAutresEl) {
    const trs = sectionAutresEl.querySelectorAll('.table-autres-indicateurs tr');
    for (const tr of trs) {
      const libelle = tr.querySelector('.cellule-libelle')?.textContent || '';
      const taux    = tr.querySelector('.cellule-taux')?.textContent    || '';
      const sparkSvg = tr.querySelector('.cellule-sparkline svg');
      const sparkline = sparkSvg ? await capturerImage(sparkSvg, toPng) : null;
      lignesSimples.push({ libelle, taux, sparkline });
    }
  }

  // -------------------- Construction du document --------------------
  const children = [];

  // Titre et sous-titre.
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: titre })],
  }));
  if (sousT) {
    children.push(new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: sousT, italics: true, color: '666666' })],
    }));
  }

  // Contexte (table 2 colonnes).
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: 'Contexte' })],
  }));
  children.push(construireTableContexte({
    Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle,
    ficheData, contexte,
  }));

  // Indicateurs du quadrant.
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240 },
    children: [new TextRun({ text: 'Indicateurs du quadrant' })],
  }));
  for (const card of cards) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: card.libelle || 'Indicateur' })],
    }));
    if (card.valeur) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: card.valeur, bold: true, size: 32 })],
      }));
    }
    if (card.detail) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({
          text: card.detail, italics: true, color: '666666', size: 18,
        })],
      }));
    }
    if (card.image) {
      children.push(paragrapheImage(card.image, LARGEUR_MINI_GRAPHE, {
        Paragraph, ImageRun, AlignmentType,
      }));
    }
  }

  // Évolution historique.
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240 },
    children: [new TextRun({ text: 'Évolution historique des indicateurs' })],
  }));

  if (multiCourbes.length === 0 && lignesSimples.length === 0) {
    children.push(new Paragraph({
      children: [new TextRun({
        text: 'Aucun autre indicateur disponible.',
        italics: true, color: '888888',
      })],
    }));
  }

  for (const g of multiCourbes) {
    if (g.titre) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: g.titre })],
      }));
    }
    if (g.image) {
      children.push(paragrapheImage(g.image, LARGEUR_MULTI_GRAPHE, {
        Paragraph, ImageRun, AlignmentType,
      }));
    }
  }

  if (lignesSimples.length > 0) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: 'Indicateurs simples' })],
    }));
    children.push(construireTableSimples({
      Table, TableRow, TableCell, Paragraph, TextRun,
      ImageRun, AlignmentType, WidthType, BorderStyle,
      lignesSimples,
    }));
  }

  // -------------------- Pied de page --------------------
  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: LIBELLE_SOURCE,
            italics: true, color: '666666', size: 16,
          }),
          new TextRun({
            text: '   ·   Exporté le ' + dateFR,
            italics: true, color: '666666', size: 16,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({
          text: MENTION_DIFFUSION,
          italics: true, color: '666666', size: 16,
        })],
      }),
    ],
  });

  const doc = new Document({
    creator: NOM_SOURCE,
    description: `Fiche ${ficheData.type || ''} — ${titre}`,
    sections: [{
      footers: { default: footer },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  declencherTelechargement(blob, construireNomFichierFiche(ficheData, contexte));
}

// =====================================================================
// Helpers de structure docx
// =====================================================================

function construireTableContexte(deps) {
  const {
    Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle,
    ficheData, contexte,
  } = deps;

  const rows = [];
  ajouterRow(rows, 'Établissement de référence', contexte?.etabInfo?.libelle || '—');
  // Région + Typologie : pertinents principalement en vue Positionnement
  // (la bulle est un établissement). On les conserve aussi en vue
  // Mentions par symétrie informationnelle — c'est l'étab de référence.
  const region = contexte?.etabInfo?.region?.libelle
    || contexte?.etabInfo?.region?.code;
  if (region)                       ajouterRow(rows, 'Région',     region);
  if (contexte?.etabInfo?.typologie) ajouterRow(rows, 'Typologie', contexte.etabInfo.typologie);
  ajouterRow(rows, 'Cursus',    contexte?.cursus || '—');
  ajouterRow(rows, 'Millésime', String(contexte?.millesime || '—'));

  // ficheData type pour exposer le type d'entité (mention / étab) en
  // tête de tableau — utile quand le doc est consulté isolément.
  if (ficheData?.type === 'mention') {
    rows.unshift(rowBrut('Type', 'Mention', deps));
  } else if (ficheData?.type === 'etablissement') {
    rows.unshift(rowBrut('Type', 'Établissement', deps));
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: borduresTableContexte(BorderStyle),
    rows,
  });

  function ajouterRow(rowsArr, label, valeur) {
    rowsArr.push(rowBrut(label, valeur, deps));
  }
}

function rowBrut(label, valeur, deps) {
  const { TableRow, TableCell, Paragraph, TextRun, WidthType } = deps;
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 35, type: WidthType.PERCENTAGE },
        children: [new Paragraph({
          children: [new TextRun({ text: label, bold: true })],
        })],
      }),
      new TableCell({
        width: { size: 65, type: WidthType.PERCENTAGE },
        children: [new Paragraph({
          children: [new TextRun({ text: valeur })],
        })],
      }),
    ],
  });
}

function borduresTableContexte(BorderStyle) {
  const fine = { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' };
  return {
    top: fine, bottom: fine, left: fine, right: fine,
    insideHorizontal: fine, insideVertical: fine,
  };
}

function construireTableSimples(deps) {
  const {
    Table, TableRow, TableCell, Paragraph, TextRun,
    ImageRun, AlignmentType, WidthType, BorderStyle,
    lignesSimples,
  } = deps;

  // En-tête.
  const headerCells = ['Indicateur', 'Taux', 'Évolution'].map((t, i) =>
    new TableCell({
      width: { size: [60, 15, 25][i], type: WidthType.PERCENTAGE },
      children: [new Paragraph({
        children: [new TextRun({ text: t, bold: true })],
      })],
    })
  );

  const rows = [new TableRow({ tableHeader: true, children: headerCells })];

  for (const l of lignesSimples) {
    rows.push(new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: l.libelle || '' })],
          })],
        }),
        new TableCell({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: l.taux || '—' })],
          })],
        }),
        new TableCell({
          children: [
            l.sparkline
              ? paragrapheImage(l.sparkline, LARGEUR_SPARKLINE, {
                  Paragraph, ImageRun, AlignmentType,
                })
              : new Paragraph({
                  children: [new TextRun({ text: '', color: '999999' })],
                }),
          ],
        }),
      ],
    }));
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: borduresTableContexte(BorderStyle),
    rows,
  });
}

function paragrapheImage(image, largeurCible, deps) {
  const { Paragraph, ImageRun, AlignmentType } = deps;
  // Préserve le ratio natif : largeur cible imposée, hauteur déduite.
  const ratio = image.height && image.width
    ? image.height / image.width
    : 0.5;
  const width  = largeurCible;
  const height = Math.max(1, Math.round(width * ratio));
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        data: image.buffer,
        transformation: { width, height },
        type: 'png',
      }),
    ],
  });
}

// =====================================================================
// Capture html-to-image isolée → { buffer, width, height } PNG
// =====================================================================
async function capturerImage(el, toPng) {
  try {
    const dataUrl = await toPng(el, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true,
    });
    const base64 = dataUrl.split(',', 2)[1];
    const bin = atob(base64);
    const buffer = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buffer[i] = bin.charCodeAt(i);

    const dims = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
    return { buffer, width: dims.width, height: dims.height };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Capture isolée échouée :', err);
    return null;
  }
}

// =====================================================================
// Helpers de libellés (alignés sur DetailsPanel.jsx)
// =====================================================================
function titreFiche(ficheData) {
  const id = ficheData?.identite || {};
  if (ficheData?.type === 'mention') return id.libelle || id.diplom || '';
  return id.uo_lib || id.id_paysage || '';
}

function sousTitreFiche(ficheData) {
  const id = ficheData?.identite || {};
  if (ficheData?.type === 'mention') return id.secteur || '';
  const region = id.region?.libelle || id.region?.code || '';
  const typo   = id.typologie || '';
  return [region, typo].filter(Boolean).join(' · ');
}

// =====================================================================
// Nom de fichier : fiche_<type>_<libellé>_<cursus>_<millesime>_<date>.docx
// =====================================================================
function construireNomFichierFiche(ficheData, contexte) {
  const typePrefixe = ficheData?.type === 'mention' ? 'mention' : 'etablissement';
  const segments = [
    'fiche',
    typePrefixe,
    normaliser(titreFiche(ficheData) || 'inconnu'),
    normaliser(contexte?.cursus || ''),
    normaliser(String(contexte?.millesime || '')),
    formatDateCompact(new Date()),
  ].filter(Boolean);
  return `${segments.join('_')}.docx`;
}

function normaliser(s) {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function formatDateCompact(d) {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function formatDateHumaine(d) {
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
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
