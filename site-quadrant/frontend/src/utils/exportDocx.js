// Export Word (.docx) d'une fiche issue du panneau de détails.
//
// Architecture : éléments natifs Word (Paragraph, Heading, Table,
// Header, Footer) pour le texte ET les structures ; html-to-image
// n'est utilisé QUE pour capturer les SVG des graphiques (mini-
// graphes d'évolution, multi-courbes, sparklines). Le résultat est
// un document Word « propre » : texte sélectionnable, structure
// navigable dans le volet de plan, graphiques isolés sans boutons
// UI ni légendes parasites.
//
// Mise en page :
//   - Format A4 portrait, marges 2 cm sur les 4 côtés.
//   - En-tête de page « Fiche <libellé> · Millésime <année> »
//     (italique gris, aligné à droite, sur chaque page).
//   - Pied de page : source + date + diffusion fusionnés sur une
//     première ligne, « Page X sur Y » sur une seconde.
//   - Titres H1/H2/H3 en bleu Marianne (#000091, gras).
//   - Bordure inférieure fine sous chaque H2 (séparateur de section).
//   - Tableaux : lignes alternées blanc / gris très clair, bordures
//     #E5E5E5 pour rester compatible avec le striping.
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
//   [PageBreak]
//   [H2]   Méthodologie
//     Texte général + section dédiée au cursus courant.
//
// Traçabilité silencieuse : `customProperties` du Document expose
// contexte_id, tokens éventuels, date ISO et identifiants de la
// fiche. Rien n'est visible dans le corps du document — uniquement
// dans Fichier > Informations > Propriétés > Avancées.
//
// Captures isolées : on cible les `.graphe-zone` (div interne aux
// composants de graphique), ce qui exclut le titre HTML (`.graphe-titre`)
// et la légende textuelle externe. Le ratio natif de chaque image est
// préservé en lisant ses dimensions après capture.

import { LIBELLE_SOURCE, MENTION_DIFFUSION, NOM_SOURCE } from './constants.js';
import { chargerMethodologie } from '../data/methodologie.js';

// Largeur cible (en pixels Word) pour chaque type d'image.
// Réduction à ~70 % de la phase précédente (480/560) pour permettre la
// disposition côte à côte sur A4 marges 2 cm : largeur utile ~17 cm
// (~470 px à 72 dpi) → ~410 px par image laisse une gouttière entre
// les deux. Hauteur calculée à partir du ratio natif (cf.
// paragrapheImage).
const LARGEUR_MINI_GRAPHE  = 410;
const LARGEUR_MULTI_GRAPHE = 400;
const LARGEUR_SPARKLINE    = 100;
// Police par défaut du document — choix utilisateur (Calibri lisible,
// universellement installée sur Word/LibreOffice). Taille en demi-
// points : 22 = 11 pt.
const FONT_DOC      = 'Calibri';
const FONT_DOC_SIZE = 22;

// Bleu Marianne — couleur titre H1/H2/H3 et accents.
const COULEUR_MARIANNE = '000091';
// Gris discret pour le texte secondaire (sous-titre, footer, etc.).
const COULEUR_GRIS     = '666666';
// Bordure des séparateurs H2 et tableaux (assez clair pour ne pas
// concurrencer le zebra striping des lignes).
const COULEUR_BORDURE  = 'E5E5E5';
// Fond gris très clair pour les lignes paires des tableaux.
const FILL_ZEBRA       = 'F8F8F8';

// Format A4 portrait — dimensions en twips (1 cm = 567 twips).
const PAGE_A4 = {
  width:  11906, // 210 mm
  height: 16838, // 297 mm
  marginCm: 2,
};

export async function exportFicheDocx({ ficheData, contexte, panneauEl }) {
  if (!ficheData)  throw new Error('exportFicheDocx: ficheData manquant.');
  if (!panneauEl)  throw new Error('exportFicheDocx: panneauEl manquant.');

  const [
    { toPng },
    docx,
    methodologie,
  ] = await Promise.all([
    import('html-to-image'),
    import('docx'),
    chargerMethodologie(),
  ]);

  const {
    Document, Packer, Paragraph, HeadingLevel,
    TextRun, ImageRun, AlignmentType,
    Table, TableRow, TableCell, WidthType, BorderStyle,
    Header, Footer, PageNumber, PageBreak, PageOrientation, ShadingType,
  } = docx;

  // -------------------- Données dérivées --------------------
  const titre   = titreFiche(ficheData);
  const cursusValue   = contexte?.cursus    || '';
  const millesimeStr  = String(contexte?.millesime ?? '');
  // Sous-titre : « <cursus> · <identité secondaire> ». Préfixer
  // par le cursus rend la fiche autoporteuse — un lecteur qui ne
  // voit que l'en-tête sait à quel type de diplôme se rapporte
  // l'indicateur affiché.
  const sousT   = sousTitreFiche(ficheData, cursusValue);
  const dateFR  = formatDateHumaine(new Date());

  // -------------------- Capture des graphiques --------------------
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
  children.push(headingParagraph(HeadingLevel.HEADING_1, titre, {
    Paragraph, TextRun,
  }));
  if (sousT) {
    children.push(new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: sousT, italics: true, color: COULEUR_GRIS })],
    }));
  }

  // Contexte (table 2 colonnes).
  children.push(headingParagraph(HeadingLevel.HEADING_2, 'Contexte', {
    Paragraph, TextRun, BorderStyle,
  }));
  children.push(construireTableContexte({
    Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle, ShadingType,
    ficheData, contexte,
  }));

  // Indicateurs du quadrant — cards X et Y côte à côte dans un
  // tableau invisible 2 colonnes. Chaque cellule contient le bloc
  // complet (titre H3, valeur, détail, image mini-graphe). Si on n'a
  // qu'une seule card (cas non standard), elle prend la pleine
  // largeur via la même fonction (pairs gère l'élément seul).
  children.push(headingParagraph(
    HeadingLevel.HEADING_2,
    'Indicateurs du quadrant',
    { Paragraph, TextRun, BorderStyle, spacingBefore: 240 },
  ));
  if (cards.length > 0) {
    children.push(tableImagesCoteACote(
      cards.map((card) => contenuCellulaireCardIndicateur(card, {
        Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel,
      })),
      { Table, TableRow, TableCell, Paragraph, WidthType, BorderStyle },
    ));
  }

  // Évolution historique.
  children.push(headingParagraph(
    HeadingLevel.HEADING_2,
    'Évolution historique des indicateurs',
    { Paragraph, TextRun, BorderStyle, spacingBefore: 240 },
  ));

  if (multiCourbes.length === 0 && lignesSimples.length === 0) {
    children.push(new Paragraph({
      children: [new TextRun({
        text: 'Aucun autre indicateur disponible.',
        italics: true, color: '888888',
      })],
    }));
  }

  // Multi-courbes : côte à côte 2 par ligne, dernier seul sur sa
  // ligne si nombre impair. Le titre H3 vit dans la cellule pour
  // qu'il reste collé à son graphique.
  if (multiCourbes.length > 0) {
    children.push(tableImagesCoteACote(
      multiCourbes.map((g) => contenuCellulaireMultiCourbes(g, {
        Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel,
      })),
      { Table, TableRow, TableCell, Paragraph, WidthType, BorderStyle },
    ));
  }

  if (lignesSimples.length > 0) {
    children.push(headingParagraph(HeadingLevel.HEADING_3, 'Indicateurs simples', {
      Paragraph, TextRun,
    }));
    children.push(construireTableSimples({
      Table, TableRow, TableCell, Paragraph, TextRun,
      ImageRun, AlignmentType, WidthType, BorderStyle, ShadingType,
      lignesSimples,
    }));
  }

  // Annexe Méthodologie (saut de page + section générale + bloc cursus
  // courant). Pas de bloc « tous cursus » — le contexte du document est
  // un seul cursus, on évite la surcharge. Le contenu vient du cache
  // async chargé en début de fonction ; si le fetch a échoué, on
  // saute proprement l'annexe.
  ajouterAnnexeMethodologie(children, cursusValue, methodologie, {
    Paragraph, TextRun, HeadingLevel, BorderStyle, PageBreak,
  });

  // -------------------- En-tête de page --------------------
  const header = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: `Fiche ${titre}${millesimeStr ? ` · Millésime ${millesimeStr}` : ''}`,
            italics: true,
            color: COULEUR_GRIS,
            size: 16,
          }),
        ],
      }),
    ],
  });

  // -------------------- Pied de page --------------------
  // Ligne 1 : source · date · diffusion (fusionnés, aligné sur les
  // autres pieds — écran, PNG, XLSX).
  // Ligne 2 : « Page X sur Y » centré.
  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: LIBELLE_SOURCE, italics: true, color: COULEUR_GRIS, size: 16 }),
          new TextRun({ text: ' · ', color: COULEUR_GRIS, size: 16 }),
          new TextRun({ text: `Exporté le ${dateFR}`, italics: true, color: COULEUR_GRIS, size: 16 }),
          new TextRun({ text: ' · ', color: COULEUR_GRIS, size: 16 }),
          new TextRun({ text: MENTION_DIFFUSION, italics: true, color: COULEUR_GRIS, size: 16 }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: 'Page ', color: COULEUR_GRIS, size: 16 }),
          new TextRun({ children: [PageNumber.CURRENT], color: COULEUR_GRIS, size: 16 }),
          new TextRun({ text: ' sur ', color: COULEUR_GRIS, size: 16 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], color: COULEUR_GRIS, size: 16 }),
        ],
      }),
    ],
  });

  // -------------------- Traçabilité (Custom Properties) --------------------
  // Invisible dans le corps. Visible dans Fichier > Informations >
  // Propriétés > Avancées. La liste est filtrée pour ne garder que
  // les valeurs non vides — éviter les clés à valeur '' qui polluent
  // l'inspection du fichier.
  const customProperties = [
    { name: 'contexte_id',       value: contexte?.tokens?.contexteId },
    { name: 'token_connexion',   value: contexte?.tokens?.tokenConnexion },
    { name: 'token_utilisateur', value: contexte?.tokens?.tokenUtilisateur },
    { name: 'date_export_iso',   value: new Date().toISOString() },
    { name: 'vue',               value: contexte?.vue },
    { name: 'cursus',            value: cursusValue },
    { name: 'millesime',         value: millesimeStr },
    { name: 'type_fiche',        value: ficheData?.type },
    { name: 'libelle',           value: titre },
  ]
    .filter((p) => p.value != null && String(p.value).length > 0)
    .map((p) => ({ name: p.name, value: String(p.value) }));

  const doc = new Document({
    creator:      NOM_SOURCE,
    title:        `Fiche ${ficheData?.type === 'mention' ? 'mention' : 'établissement'} - ${titre}`,
    description:  `Export Quadrant - ${titre} - ${cursusValue} - millésime ${millesimeStr}`,
    lastModifiedBy: 'Application Quadrant',
    customProperties,
    // Police par défaut du document — appliquée à TOUS les TextRun qui
    // ne déclarent pas explicitement une autre police. Les couleurs,
    // tailles et italiques posés au cas par cas restent en place.
    styles: {
      default: {
        document: {
          run: {
            font: FONT_DOC,
            size: FONT_DOC_SIZE,
          },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: {
            width:  PAGE_A4.width,
            height: PAGE_A4.height,
            orientation: PageOrientation.PORTRAIT,
          },
          margin: {
            top:    cmToTwips(PAGE_A4.marginCm),
            right:  cmToTwips(PAGE_A4.marginCm),
            bottom: cmToTwips(PAGE_A4.marginCm),
            left:   cmToTwips(PAGE_A4.marginCm),
          },
        },
      },
      headers: { default: header },
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

// Crée un paragraphe heading avec la couleur Marianne et, pour H2,
// une bordure inférieure fine qui sert de séparateur visuel.
//
// `opts.spacingBefore` (twips) : espace au-dessus du heading.
function headingParagraph(level, texte, deps) {
  const { Paragraph, TextRun, BorderStyle, spacingBefore } = deps;
  const paragraphOpts = {
    heading: level,
    children: [new TextRun({ text: texte, color: COULEUR_MARIANNE, bold: true })],
  };
  if (spacingBefore) paragraphOpts.spacing = { before: spacingBefore };

  // Bordure sous chaque H2 — séparateur fin gris.
  // BorderStyle est requis (undefined sinon en cas d'oubli côté
  // appelant).
  if (level === 'Heading2' && BorderStyle) {
    paragraphOpts.border = {
      bottom: {
        color: 'CCCCCC',
        space: 4,
        style: BorderStyle.SINGLE,
        size: 6,
      },
    };
  }
  return new Paragraph(paragraphOpts);
}

function construireTableContexte(deps) {
  const {
    Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle, ShadingType,
    ficheData, contexte,
  } = deps;

  const lignes = [];

  if (ficheData?.type === 'mention') {
    lignes.push(['Type', 'Mention']);
  } else if (ficheData?.type === 'etablissement') {
    lignes.push(['Type', 'Établissement']);
  }

  lignes.push(['Établissement de référence', contexte?.etabInfo?.libelle || '—']);

  const region = contexte?.etabInfo?.region?.libelle
    || contexte?.etabInfo?.region?.code;
  if (region) lignes.push(['Région', region]);
  if (contexte?.etabInfo?.typologie) lignes.push(['Typologie', contexte.etabInfo.typologie]);

  lignes.push(['Cursus',    contexte?.cursus    || '—']);
  lignes.push(['Millésime', String(contexte?.millesime || '—')]);

  const rows = lignes.map((paire, idx) => ligneTableZebra(paire[0], paire[1], idx, {
    TableRow, TableCell, Paragraph, TextRun, WidthType, ShadingType,
  }));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: borduresTable(BorderStyle),
    rows,
  });
}

// Ligne de tableau avec ombrage alterné (zebra striping). `idx` est
// l'index dans la liste des lignes de données — pas dans le tableau
// final (l'en-tête est géré séparément si applicable).
function ligneTableZebra(label, valeur, idx, deps) {
  const { TableRow, TableCell, Paragraph, TextRun, WidthType, ShadingType } = deps;
  const shading = {
    fill: idx % 2 === 0 ? 'FFFFFF' : FILL_ZEBRA,
    type: ShadingType.CLEAR,
    color: 'auto',
  };
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 35, type: WidthType.PERCENTAGE },
        shading,
        children: [new Paragraph({
          children: [new TextRun({ text: label, bold: true })],
        })],
      }),
      new TableCell({
        width: { size: 65, type: WidthType.PERCENTAGE },
        shading,
        children: [new Paragraph({
          children: [new TextRun({ text: valeur })],
        })],
      }),
    ],
  });
}

function borduresTable(BorderStyle) {
  const fine = { style: BorderStyle.SINGLE, size: 4, color: COULEUR_BORDURE };
  return {
    top: fine, bottom: fine, left: fine, right: fine,
    insideHorizontal: fine, insideVertical: fine,
  };
}

function construireTableSimples(deps) {
  const {
    Table, TableRow, TableCell, Paragraph, TextRun,
    ImageRun, AlignmentType, WidthType, BorderStyle, ShadingType,
    lignesSimples,
  } = deps;

  // En-tête : fond gris léger, gras.
  const enteteShading = {
    fill: 'F0F0F0',
    type: ShadingType.CLEAR,
    color: 'auto',
  };
  const headerCells = ['Indicateur', 'Taux', 'Évolution'].map((t, i) =>
    new TableCell({
      width: { size: [60, 15, 25][i], type: WidthType.PERCENTAGE },
      shading: enteteShading,
      children: [new Paragraph({
        children: [new TextRun({ text: t, bold: true })],
      })],
    })
  );

  const rows = [new TableRow({ tableHeader: true, children: headerCells })];

  lignesSimples.forEach((l, idx) => {
    const shading = {
      fill: idx % 2 === 0 ? 'FFFFFF' : FILL_ZEBRA,
      type: ShadingType.CLEAR,
      color: 'auto',
    };
    rows.push(new TableRow({
      children: [
        new TableCell({
          shading,
          children: [new Paragraph({
            children: [new TextRun({ text: l.libelle || '' })],
          })],
        }),
        new TableCell({
          shading,
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: l.taux || '—' })],
          })],
        }),
        new TableCell({
          shading,
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
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: borduresTable(BorderStyle),
    rows,
  });
}

function paragrapheImage(image, largeurCible, deps) {
  const { Paragraph, ImageRun, AlignmentType } = deps;
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
// Composition « images côte à côte »
// =====================================================================
//
// Layout 2 colonnes sans bordures pour rapprocher visuellement deux
// blocs corrélés (card X / card Y, ou deux multi-courbes
// consécutives). Si le nombre d'items est impair, le dernier reste
// seul sur sa ligne dans la cellule de gauche, cellule de droite vide.
//
// Chaque cellule reçoit un tableau de Paragraph déjà construit par
// les helpers `contenuCellulaireCardIndicateur` ou
// `contenuCellulaireMultiCourbes`.

function bordersInvisibles(BorderStyle) {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return {
    top: none, bottom: none, left: none, right: none,
    insideHorizontal: none, insideVertical: none,
  };
}

function tableImagesCoteACote(cellulesContenu, deps) {
  const { Table, TableRow, TableCell, Paragraph, WidthType, BorderStyle } = deps;
  const noBorders = bordersInvisibles(BorderStyle);

  const rows = [];
  for (let i = 0; i < cellulesContenu.length; i += 2) {
    const gauche = cellulesContenu[i];
    const droite = cellulesContenu[i + 1];
    rows.push(new TableRow({
      children: [
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: noBorders,
          children: gauche,
        }),
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: noBorders,
          // Cellule vide pour le dernier item d'un nombre impair —
          // un Paragraph vide est nécessaire (TableCell ne peut pas
          // avoir un children array vide).
          children: droite || [new Paragraph({})],
        }),
      ],
    }));
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows,
  });
}

// Contenu d'une cellule pour une card d'indicateur (axe X ou Y) :
// libellé en gras (substitut H3 — un vrai HEADING_3 dans une cellule
// génère un comportement de style erratique selon les versions de
// Word), valeur principale centrée gras, détail centré italique,
// image mini-graphe.
function contenuCellulaireCardIndicateur(card, deps) {
  const { Paragraph, TextRun, ImageRun, AlignmentType } = deps;
  const paragraphs = [];

  if (card.libelle) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({
        text: card.libelle, color: COULEUR_MARIANNE, bold: true, size: 22,
      })],
    }));
  }
  if (card.valeur) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: card.valeur, bold: true, size: 28 })],
    }));
  }
  if (card.detail) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({
        text: card.detail, italics: true, color: COULEUR_GRIS, size: 18,
      })],
    }));
  }
  if (card.image) {
    paragraphs.push(paragrapheImage(card.image, LARGEUR_MINI_GRAPHE, {
      Paragraph, ImageRun, AlignmentType,
    }));
  }
  return paragraphs;
}

// Contenu d'une cellule pour un multi-courbes : titre du groupe + image.
function contenuCellulaireMultiCourbes(graphe, deps) {
  const { Paragraph, TextRun, ImageRun, AlignmentType } = deps;
  const paragraphs = [];

  if (graphe.titre) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({
        text: graphe.titre, color: COULEUR_MARIANNE, bold: true, size: 22,
      })],
    }));
  }
  if (graphe.image) {
    paragraphs.push(paragrapheImage(graphe.image, LARGEUR_MULTI_GRAPHE, {
      Paragraph, ImageRun, AlignmentType,
    }));
  }
  return paragraphs;
}

// =====================================================================
// Annexe Méthodologie
// =====================================================================
//
// Saut de page → présentation générale (paragraphes) → section du
// cursus courant uniquement (champ + indicateurs + insertion). Si le
// cursus n'est pas couvert (cas hypothétique BUT) ou si le cache
// méthodologie n'a pas chargé (fallback `{ generale: '', cursus: {} }`),
// on saute proprement les sections concernées.
function ajouterAnnexeMethodologie(children, cursusValue, methodologie, deps) {
  const { Paragraph, TextRun, HeadingLevel, BorderStyle, PageBreak } = deps;

  // Pas de méthodologie chargée : on ne rajoute rien (évite une
  // section vide en fin de document).
  if (!methodologie) return;
  const aDuContenu = !!methodologie.generale
    || (methodologie.cursus && methodologie.cursus[cursusValue]);
  if (!aDuContenu) return;

  // Saut de page pour isoler la méthodologie.
  children.push(new Paragraph({ children: [new PageBreak()] }));

  children.push(headingParagraph(HeadingLevel.HEADING_2, 'Méthodologie', {
    Paragraph, TextRun, BorderStyle,
  }));

  if (methodologie.generale) {
    for (const para of methodologie.generale.split('\n\n')) {
      children.push(new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: para })],
      }));
    }
  }

  const blocCursus = methodologie.cursus?.[cursusValue];
  if (!blocCursus) return;

  children.push(headingParagraph(HeadingLevel.HEADING_3, blocCursus.libelle, {
    Paragraph, TextRun,
  }));
  for (const para of (blocCursus.champ || '').split('\n')) {
    if (!para) continue;
    children.push(new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: para })],
    }));
  }

  for (const ind of blocCursus.indicateurs || []) {
    children.push(headingParagraph(HeadingLevel.HEADING_3, ind.libelle, {
      Paragraph, TextRun,
    }));
    children.push(new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: ind.definition })],
    }));
  }

  if (blocCursus.champ_insertion) {
    children.push(headingParagraph(
      HeadingLevel.HEADING_3,
      `Champ de l'insertion professionnelle`,
      { Paragraph, TextRun },
    ));
    children.push(new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: blocCursus.champ_insertion })],
    }));
  }

  if (blocCursus.insertion) {
    children.push(headingParagraph(HeadingLevel.HEADING_3, blocCursus.insertion.libelle, {
      Paragraph, TextRun,
    }));
    children.push(new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: blocCursus.insertion.definition })],
    }));
  }
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
// Conversion + libellés
// =====================================================================
function cmToTwips(cm) {
  return Math.round(cm * 567);
}

function titreFiche(ficheData) {
  const id = ficheData?.identite || {};
  if (ficheData?.type === 'mention') return id.libelle || id.diplom || '';
  return id.uo_lib || id.id_paysage || '';
}

function sousTitreFiche(ficheData, cursus) {
  const id = ficheData?.identite || {};
  const parts = [];
  if (cursus) parts.push(cursus);
  if (ficheData?.type === 'mention') {
    if (id.secteur) parts.push(id.secteur);
  } else {
    const region = id.region?.libelle || id.region?.code || '';
    if (region) parts.push(region);
    if (id.typologie) parts.push(id.typologie);
  }
  return parts.join(' · ');
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
