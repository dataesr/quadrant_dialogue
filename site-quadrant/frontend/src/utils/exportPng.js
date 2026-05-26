// Export PNG du quadrant graphique.
//
// Capture le nœud .quadrant-wrapper avec html-to-image (rétina via
// pixelRatio:2). Avant la capture, on injecte au-dessus du SVG un
// bandeau « export-titre » résumant le contexte (établissement,
// cursus, vue, axes, millésime, filtres actifs), et on remplace
// l'attribution de source par un pied « export-pied » qui ajoute la
// date d'export. Après capture, ces éléments sont retirés et l'écran
// est inchangé.
//
// Pendant la capture, body porte la classe `.exporting` qui masque
// les éléments interactifs (boutons de zoom, tooltip, panneau de
// détails, source écran) — symétrique à @media print.
//
// Traçabilité : chunks tEXt PNG (cf. spec PNG 11.3.4.3) avec
// contexte_id et date d'export. Les tokens de session sont aussi
// inclus s'ils sont disponibles côté frontend.

import { LIBELLE_SOURCE, MENTION_DIFFUSION, NOM_SOURCE } from './constants.js';

// Libellés des modes de référence des axes (cf. AppContext
// `referenceAxes`). Affichés dans le bandeau « Filtres » du PNG
// quand l'utilisateur n'est pas sur le défaut (médiane étab).
const LIBELLES_REFERENCE_AXES = {
  mediane_etab:      'Médiane établissement',
  moyenne_etab:      'Moyenne établissement',
  moyenne_nationale: 'Moyenne nationale',
};

export async function exportQuadrantPng({ wrapperEl, contexte }) {
  if (!wrapperEl) throw new Error('exportQuadrantPng: wrapperEl manquant.');

  const { toBlob } = await import('html-to-image');

  // Bandeau titre injecté en tête du wrapper.
  const titreEl = construireBandeauTitre(contexte);
  wrapperEl.prepend(titreEl);

  // Pied avec source + date, injecté en queue. La source-attribution
  // écran est masquée par .exporting pour éviter le doublon.
  const piedEl = construirePiedExport();
  wrapperEl.append(piedEl);

  document.body.classList.add('exporting');

  let blob;
  try {
    // Un rAF pour laisser le layout se stabiliser après les insertions.
    await new Promise((r) => requestAnimationFrame(() => r()));
    blob = await toBlob(wrapperEl, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true,
    });
  } finally {
    document.body.classList.remove('exporting');
    titreEl.remove();
    piedEl.remove();
  }

  if (!blob) throw new Error('Échec de la capture PNG.');

  // Injection des chunks tEXt — best effort. Si la lib échoue (PNG
  // tronqué, etc.), on télécharge le blob brut sans bloquer l'export.
  let blobFinal = blob;
  try {
    blobFinal = await injecterMetadonneesPng(blob, contexte);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Métadonnées PNG non injectées :', err);
  }

  const nomFichier = construireNomFichier(contexte, 'png');
  declencherTelechargement(blobFinal, nomFichier);
}

// ---------------------------------------------------------------------
// Construction du bandeau titre. DOM minimal, styles via .export-titre
// dans global.css.
//
// Les libellés d'axes ne sont volontairement pas répétés dans le
// bandeau : le SVG du quadrant les porte déjà sous chaque axe.
// ---------------------------------------------------------------------
function construireBandeauTitre(contexte) {
  const {
    etabInfo, cursus, vue, millesime,
    surligne,
    filtres,
  } = contexte;

  const header = document.createElement('header');
  header.className = 'export-titre';

  // Titre principal : nom de l'établissement.
  const h1 = document.createElement('h1');
  h1.textContent = etabInfo?.libelle || 'Établissement inconnu';
  header.appendChild(h1);

  // Sous-titre : région · typologie.
  const sous = [
    etabInfo?.region?.libelle || etabInfo?.region?.code,
    etabInfo?.typologie,
  ].filter(Boolean).join(' · ');
  if (sous) {
    const p = document.createElement('p');
    p.className = 'sous-titre';
    p.textContent = sous;
    header.appendChild(p);
  }

  // Ligne contexte : cursus · vue · millésime.
  const ctx = [
    cursus,
    vue === 'mentions' ? 'Mentions' : 'Positionnement',
    millesime ? `Millésime ${millesime}` : null,
  ].filter(Boolean).join(' · ');
  if (ctx) {
    const p = document.createElement('p');
    p.className = 'sous-titre';
    p.textContent = ctx;
    header.appendChild(p);
  }

  // Surlignage : affiché seulement si une bulle correspond exactement
  // à la recherche (libellé exact). Cf. BoutonExport.jsx qui résout
  // ce champ depuis rechercheMention + data.bulles avant l'appel.
  if (surligne?.libelle) {
    const p = document.createElement('p');
    p.className = 'sous-titre';
    const prefixe = vue === 'mentions'
      ? 'Mention surlignée'
      : 'Établissement surligné';
    p.textContent = `${prefixe} : ${surligne.libelle}`;
    header.appendChild(p);
  }

  // Filtres actifs (non-défaut). Sur une ligne, tronquée si nécessaire.
  const filtresLib = formaterFiltresActifs(filtres);
  if (filtresLib) {
    const p = document.createElement('p');
    p.className = 'filtres-actifs';
    p.textContent = `Filtres : ${filtresLib}`;
    header.appendChild(p);
  }

  return header;
}

function construirePiedExport() {
  const pied = document.createElement('div');
  pied.className = 'export-pied';

  // Source + diffusion fusionnés sur le côté gauche, date sur le côté
  // droit. Format aligné sur l'écran (cf. .source-attribution) et sur
  // le footer Word.
  const gauche = document.createElement('span');
  gauche.textContent = `${LIBELLE_SOURCE} · ${MENTION_DIFFUSION}`;
  pied.appendChild(gauche);

  const droite = document.createElement('span');
  droite.textContent = `Exporté le ${formatDateHumaine(new Date())}`;
  pied.appendChild(droite);

  return pied;
}

function formaterFiltresActifs(filtres) {
  if (!filtres) return '';
  const parts = [];
  if (filtres.domaine)    parts.push(`Domaine = ${filtres.domaine}`);
  if (filtres.discipline) parts.push(`Discipline = ${filtres.discipline}`);
  if (filtres.secteur)    parts.push(`Secteur = ${filtres.secteur}`);
  if (filtres.mention)    parts.push(`Mention = ${filtres.mention}`);
  if (filtres.typeMaster) parts.push(`Type Master = ${filtres.typeMaster}`);
  if (filtres.representativite) parts.push('Représentatif (denom ≥ 20)');
  if (filtres.referenceAxes && filtres.referenceAxes !== 'mediane_etab') {
    parts.push(`Réf. axes = ${LIBELLES_REFERENCE_AXES[filtres.referenceAxes] || filtres.referenceAxes}`);
  }
  return parts.join(' · ');
}

// ---------------------------------------------------------------------
// Métadonnées PNG (chunks tEXt). Insérés entre IHDR et IDAT — la spec
// PNG autorise tEXt n'importe où après IHDR et avant IEND, mais on
// reste prudent en l'insérant juste après IHDR pour ne pas casser des
// lecteurs stricts.
// ---------------------------------------------------------------------
async function injecterMetadonneesPng(blob, contexte) {
  const [
    extractChunks,
    encodeChunks,
    textChunk,
  ] = await Promise.all([
    import('png-chunks-extract').then((m) => m.default),
    import('png-chunks-encode').then((m) => m.default),
    import('png-chunk-text').then((m) => m.default),
  ]);

  const buffer = new Uint8Array(await blob.arrayBuffer());
  const chunks = extractChunks(buffer);

  const meta = construireMetadonneesPng(contexte);
  // Insertion après IHDR (chunk 0) pour rester safe vis-à-vis des
  // décodeurs stricts. textChunk.encode produit un chunk tEXt valide
  // (keyword Latin-1 ≤ 79 chars, séparateur null, texte Latin-1).
  let insertAt = 1;
  for (const [keyword, value] of meta) {
    chunks.splice(insertAt++, 0, textChunk.encode(keyword, value));
  }

  const encoded = encodeChunks(chunks);
  return new Blob([encoded], { type: 'image/png' });
}

function construireMetadonneesPng(contexte) {
  const out = [];
  out.push(['Software', `Quadrant - ${NOM_SOURCE}`]);
  out.push(['Source', LIBELLE_SOURCE]);
  out.push(['Creation Time', new Date().toISOString()]);
  if (contexte?.tokens?.contexteId) {
    out.push(['contexte_id', String(contexte.tokens.contexteId)]);
  }
  if (contexte?.tokens?.tokenConnexion) {
    out.push(['token_connexion', String(contexte.tokens.tokenConnexion)]);
  }
  if (contexte?.tokens?.tokenUtilisateur) {
    out.push(['token_utilisateur', String(contexte.tokens.tokenUtilisateur)]);
  }
  if (contexte?.etabInfo?.libelle) {
    out.push(['Etablissement', contexte.etabInfo.libelle]);
  }
  if (contexte?.cursus)    out.push(['Cursus', contexte.cursus]);
  if (contexte?.vue)       out.push(['Vue', contexte.vue]);
  if (contexte?.millesime) out.push(['Millesime', String(contexte.millesime)]);
  return out;
}

// ---------------------------------------------------------------------
// Téléchargement et nommage
// ---------------------------------------------------------------------
export function construireNomFichier(contexte, ext) {
  const segments = [
    'quadrant',
    normaliser(contexte?.etabInfo?.libelle || 'inconnu'),
    normaliser(contexte?.vue || ''),
    normaliser(contexte?.cursus || ''),
    normaliser(String(contexte?.millesime || '')),
    formatDateCompact(new Date()),
  ].filter(Boolean);
  return `${segments.join('_')}.${ext}`;
}

function normaliser(s) {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // diacritiques
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
  // Libérer l'URL après que le navigateur a eu le temps de déclencher
  // le téléchargement. 1 s est largement suffisant.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
