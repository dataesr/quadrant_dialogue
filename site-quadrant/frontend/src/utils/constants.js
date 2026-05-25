// Constantes applicatives partagées.

// Nom court de la source de données. Utilisé seul (sans suffixe outil)
// dans les chunks PNG (Software est déjà préfixé par "Quadrant - ").
export const NOM_SOURCE = 'MESRE - SIES';

// Nom de la source enrichi du nom de l'outil. Centralise le format
// affiché dans les exports métadonnées (feuille XLSX Métadonnées,
// workbook.creator, Document.creator du Word) et sert de base au
// LIBELLE_SOURCE — un seul point à modifier si le nom de la source ou
// de l'outil change.
export const NOM_SOURCE_OUTIL = `${NOM_SOURCE} - outil quadrant`;

// Libellé complet affiché en pied de chaque visualisation (écran) et
// inclus dans les pieds des exports (PNG, XLSX, Word).
export const LIBELLE_SOURCE = `Source : ${NOM_SOURCE_OUTIL}`;

// Mention de diffusion restreinte affichée sous la source sur tout
// élément de visualisation (écran + exports PNG, XLSX, Word). Rappel
// permanent que les chiffres ne sont pas publiables en l'état —
// crucial pour les usagers rectorat et national, qui voient des
// établissements tiers.
export const MENTION_DIFFUSION = 'Données à diffusion restreinte - ne pas diffuser';
