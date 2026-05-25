// Constantes applicatives partagées.

// Nom de la source de données, utilisé seul (sans préfixe) dans les
// métadonnées d'export Excel et les chunks PNG.
export const NOM_SOURCE = 'MESRE - SIES';

// Libellé de la source affiché en pied de chaque visualisation (écran)
// et inclus dans les exports (PNG, XLSX, Word). Inclut le nom de
// l'outil — la source NOM_SOURCE seule reste utilisée pour les
// métadonnées techniques où l'outil est déjà identifié par
// d'autres champs (workbook.creator, Document.creator, chunk
// PNG « Software »).
export const LIBELLE_SOURCE = `Source : ${NOM_SOURCE} - outil quadrant`;

// Mention de diffusion restreinte affichée sous la source sur tout
// élément de visualisation (écran + exports PNG, XLSX, Word). Rappel
// permanent que les chiffres ne sont pas publiables en l'état —
// crucial pour les usagers rectorat et national, qui voient des
// établissements tiers.
export const MENTION_DIFFUSION = 'Données à diffusion restreinte - ne pas diffuser';
