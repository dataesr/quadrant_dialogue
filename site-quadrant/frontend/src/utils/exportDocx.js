// Export Word (.docx) d'une fiche issue du panneau de détails.
//
// Structure du document (cf. demande utilisateur phase 6) :
//   H1  Libellé de la bulle (mention ou établissement)
//        Identité secondaire en italique (secteur OU région · typologie)
//   H2  Contexte
//        Établissement de référence, Cursus, Millésime
//   H2  Indicateurs du quadrant
//        H3 Variable X — image de la card X
//        H3 Variable Y — image de la card Y
//   H2  Évolution historique des indicateurs
//        Image de la section complète (Réussite + simples + insertion)
//   pied  Source — Exporté le JJ/MM/AAAA
//
// Choix pragmatique : on capture des images de cards plutôt que de
// reconstruire chaque graphique en éléments docx natifs. Plus rapide
// à implémenter, fidèle au rendu écran, et la structure en
// H1/H2/H3 reste navigable dans le volet de plan Word.

import { LIBELLE_SOURCE, NOM_SOURCE } from './constants.js';

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
  } = docx;

  // Captures — tolérantes à l'absence d'un sous-élément (par ex. card
  // Y manquante si seule la X est calculée). On capture des cards
  // individuelles dans la section principale pour les fragmenter
  // sous H3, puis la section historique en bloc.
  const cards = panneauEl.querySelectorAll('.section-indicateurs-principaux .indicateur-card');
  const sectionAutresEl = panneauEl.querySelector('.section-autres-indicateurs');

  const imagesCards = [];
  for (const c of cards) {
    try {
      imagesCards.push(await capturerEnBuffer(c, toPng));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Capture card indicateur échouée :', err);
      imagesCards.push(null);
    }
  }

  let imageHistorique = null;
  if (sectionAutresEl) {
    try {
      imageHistorique = await capturerEnBuffer(sectionAutresEl, toPng);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Capture historique échouée :', err);
    }
  }

  const titre   = titreFiche(ficheData);
  const sousT   = sousTitreFiche(ficheData);
  const libVarX = formatLibelleIndicateur(contexte.variableX, contexte.dateInserX);
  const libVarY = formatLibelleIndicateur(contexte.variableY, contexte.dateInserY);

  const children = [];
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: titre, bold: true })],
  }));
  if (sousT) {
    children.push(new Paragraph({
      children: [new TextRun({ text: sousT, italics: true, color: '666666' })],
    }));
  }

  // --- Contexte ---
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: 'Contexte' })],
  }));
  pushPara(children, Paragraph, TextRun,
    'Établissement de référence : ',
    contexte?.etabInfo?.libelle || '—');
  pushPara(children, Paragraph, TextRun,
    'Cursus : ', contexte?.cursus || '—');
  pushPara(children, Paragraph, TextRun,
    'Millésime : ', String(contexte?.millesime || '—'));

  // --- Indicateurs du quadrant ---
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: 'Indicateurs du quadrant' })],
  }));
  const libelles = [libVarX, libVarY];
  imagesCards.forEach((buf, i) => {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: libelles[i] || `Indicateur ${i + 1}` })],
    }));
    if (buf) {
      children.push(new Paragraph({
        children: [imageRunPng(ImageRun, buf, 540, 320)],
      }));
    }
  });

  // --- Historique ---
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: 'Évolution historique des indicateurs' })],
  }));
  if (imageHistorique) {
    children.push(new Paragraph({
      children: [imageRunPng(ImageRun, imageHistorique, 600, 420)],
    }));
  } else {
    children.push(new Paragraph({
      children: [new TextRun({
        text: 'Aucun historique disponible.',
        italics: true, color: '888888',
      })],
    }));
  }

  // --- Pied ---
  children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: LIBELLE_SOURCE, color: '888888', size: 18 })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: `Exporté le ${formatDateHumaine(new Date())}`,
      color: '888888', size: 18,
    })],
  }));

  const doc = new Document({
    creator: NOM_SOURCE,
    description: `Fiche ${ficheData.type || ''} — ${titre}`,
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  declencherTelechargement(blob, construireNomFichierFiche(ficheData, contexte));
}

// ---------------------------------------------------------------------
// Capture html-to-image → Uint8Array PNG, prêt pour docx ImageRun.
// ---------------------------------------------------------------------
async function capturerEnBuffer(el, toPng) {
  const dataUrl = await toPng(el, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    cacheBust: true,
  });
  const base64 = dataUrl.split(',', 2)[1];
  const bin = atob(base64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

function imageRunPng(ImageRun, buffer, width, height) {
  // docx ≥ 8 exige le champ `type` pour discriminer le format ; pour
  // un PNG c'est 'png'. La transformation impose la taille en pixels
  // (et non en EMU) — docx convertit en interne.
  return new ImageRun({
    data: buffer,
    transformation: { width, height },
    type: 'png',
  });
}

function pushPara(children, Paragraph, TextRun, label, value) {
  children.push(new Paragraph({
    children: [
      new TextRun({ text: label, bold: true }),
      new TextRun({ text: value }),
    ],
  }));
}

// ---------------------------------------------------------------------
// Helpers de libellés (alignés sur DetailsPanel.jsx)
// ---------------------------------------------------------------------
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

function formatLibelleIndicateur(variable, dateInser) {
  if (!variable) return '';
  if (!dateInser) return variable;
  return `${variable} (${dateInser} mois)`;
}

// ---------------------------------------------------------------------
// Nom de fichier : fiche_<type>_<libellé>_<cursus>_<millesime>_<date>.docx
// ---------------------------------------------------------------------
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
