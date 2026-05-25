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
//
// Disposition empilée verticalement (cards X puis Y empilées, chacune
// avec Taux puis Effectifs empilés ; multi-courbes empilés). Largeur
// cible 580 px : laisse une gouttière confortable sur A4 portrait
// marges 2 cm (largeur utile ~643 px à 96 dpi). Lisibilité prime sur
// la compacité — les versions précédentes côte à côte tassaient les
// légendes.
const LARGEUR_MINI_GRAPHE  = 580;
const LARGEUR_MULTI_GRAPHE = 580;
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
  //
  // Cards X / Y : on capture les DEUX variantes (Taux et Effectifs),
  // toutes les deux toujours rendues dans le DOM (cf. CardIndicateur
  // → card-graphe / card-graphe--secondaire). On cible `.graphe-
  // indicateur` plutôt que `.graphe-zone` pour embarquer la légende
  // « Numérateur / Dénominateur » qui vit hors de .graphe-zone côté
  // Effectifs. Filtre toPng exclut .graphe-titre (les cards rendent
  // déjà showTitle=false, mais le filtre rend la fonction utilisable
  // partout sans surprise).
  const cardsEls = panneauEl.querySelectorAll(
    '.section-indicateurs-principaux .indicateur-card'
  );
  const cards = [];
  for (const cardEl of cardsEls) {
    const libelle = cardEl.querySelector('.libelle-indicateur')?.textContent || '';
    const valeur  = cardEl.querySelector('.valeur-principale')?.textContent || '';
    const detail  = cardEl.querySelector('.detail-numerateur')?.textContent || '';
    const tauxEl      = cardEl.querySelector('[data-vue="taux"] .graphe-indicateur');
    const effectifsEl = cardEl.querySelector('[data-vue="effectifs"] .graphe-indicateur');
    const imageTaux       = tauxEl      ? await capturerImage(tauxEl,      toPng, { excludeClass: 'graphe-titre' }) : null;
    const imageEffectifs  = effectifsEl ? await capturerImage(effectifsEl, toPng, { excludeClass: 'graphe-titre' }) : null;
    cards.push({ libelle, valeur, detail, imageTaux, imageEffectifs });
  }

  const sectionAutresEl = panneauEl.querySelector('.section-autres-indicateurs');
  const multiCourbes = [];
  if (sectionAutresEl) {
    const grafs = sectionAutresEl.querySelectorAll(':scope > .graphe-indicateur');
    for (const gEl of grafs) {
      const titreG = gEl.querySelector('.graphe-titre')?.textContent || '';
      // On capture `.graphe-indicateur` complet (et non plus
      // seulement .graphe-zone) pour inclure la légende de variantes
      // — sinon les courbes colorées sont illisibles dans le Word.
      // Filtre toPng exclut .graphe-titre : le H3 Word est déjà
      // ajouté à côté de l'image, on évite le doublon de titre.
      const image  = await capturerImage(gEl, toPng, { excludeClass: 'graphe-titre' });
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

  // Indicateurs du quadrant — cards X puis Y empilées verticalement.
  // Chaque card affiche : H3 du libellé, valeur principale, détail,
  // puis un sub-tableau 2 colonnes (Taux | Effectifs) sans bordures
  // avec une légende centrée sous chaque image. Les deux variantes
  // sont capturées depuis le DOM grâce au montage permanent (cf.
  // CardIndicateur dans DetailsPanel — toggle = positionnement
  // off-screen, pas démontage).
  children.push(headingParagraph(
    HeadingLevel.HEADING_2,
    'Indicateurs du quadrant',
    { Paragraph, TextRun, BorderStyle, spacingBefore: 240 },
  ));
  for (const card of cards) {
    children.push(...blocCardIndicateur(card, {
      Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel,
    }));
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

  // Multi-courbes empilés verticalement : chaque graphique prend
  // toute la largeur utile (~580 px). Disposition côte à côte
  // abandonnée pour gagner en lisibilité des légendes de variantes
  // (« 6 mois », « 12 mois »…).
  for (const g of multiCourbes) {
    if (g.titre) {
      children.push(headingParagraph(HeadingLevel.HEADING_3, g.titre, {
        Paragraph, TextRun,
      }));
    }
    if (g.image) {
      children.push(paragrapheImage(g.image, LARGEUR_MULTI_GRAPHE, {
        Paragraph, ImageRun, AlignmentType,
      }));
    }
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

// Bloc complet pour une card d'indicateur (axe X ou Y) :
// H3 du libellé, valeur principale centrée, détail centré, puis les
// deux images (Taux puis Effectifs) empilées verticalement, chacune
// surmontée — par dessous — d'une légende centrée. Pas de
// sub-tableau côte à côte : la largeur réservée (~580 px) permet
// d'afficher chaque graphique en pleine largeur de la page A4, plus
// lisible que deux images tassées sur une même ligne.
//
// Retourne un array de "fils Word" (Paragraph) à pousser dans la
// liste `children` du document.
function blocCardIndicateur(card, deps) {
  const {
    Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel,
  } = deps;

  const out = [];

  if (card.libelle) {
    out.push(headingParagraph(HeadingLevel.HEADING_3, card.libelle, {
      Paragraph, TextRun,
    }));
  }
  if (card.valeur) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: card.valeur, bold: true, size: 32 })],
    }));
  }
  if (card.detail) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({
        text: card.detail, italics: true, color: COULEUR_GRIS, size: 18,
      })],
    }));
  }

  if (card.imageTaux) {
    out.push(paragrapheImage(card.imageTaux, LARGEUR_MINI_GRAPHE, {
      Paragraph, ImageRun, AlignmentType,
    }));
    out.push(legendeImage('Évolution du taux', { Paragraph, TextRun, AlignmentType }));
  }
  if (card.imageEffectifs) {
    out.push(paragrapheImage(card.imageEffectifs, LARGEUR_MINI_GRAPHE, {
      Paragraph, ImageRun, AlignmentType,
    }));
    out.push(legendeImage('Évolution des effectifs', { Paragraph, TextRun, AlignmentType }));
  }

  // Espace après la card pour aérer entre X et Y / avant la section
  // suivante.
  out.push(new Paragraph({}));

  return out;
}

// Légende centrée italique gris à poser SOUS une image (libellé du
// type « Évolution du taux »).
function legendeImage(texte, deps) {
  const { Paragraph, TextRun, AlignmentType } = deps;
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({
      text: texte, italics: true, color: COULEUR_GRIS, size: 18,
    })],
  });
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
//
// Options :
//   excludeClass : string — si présent, les nœuds porteurs de cette
//                  classe sont exclus de la capture (typiquement
//                  .graphe-titre, dont le contenu est déjà rendu
//                  comme heading Word à côté de l'image).
async function capturerImage(el, toPng, { excludeClass } = {}) {
  try {
    const dataUrl = await toPng(el, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true,
      filter: excludeClass
        ? (node) => !node?.classList?.contains?.(excludeClass)
        : undefined,
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
