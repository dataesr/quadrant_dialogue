// Constantes applicatives partagées.

// Nom de la source de données, utilisé seul (sans préfixe) dans les
// métadonnées d'export Excel et les chunks PNG.
export const NOM_SOURCE = 'MESRE - SIES';

// Libellé de la source de données, affiché en pied de chaque
// visualisation et inclus dans les exports (PNG et XLSX). Centralisé
// pour faciliter une modification éventuelle si l'un ou l'autre des
// sigles change (par exemple changement de nom de ministère ou de
// service).
export const LIBELLE_SOURCE = `Source : ${NOM_SOURCE}`;

// Mention de diffusion restreinte affichée sous la source sur tout
// élément de visualisation (écran + exports PNG, XLSX, Word). Rappel
// permanent que les chiffres ne sont pas publiables en l'état —
// crucial pour les usagers rectorat et national, qui voient des
// établissements tiers.
export const MENTION_DIFFUSION = 'Données à diffusion restreinte - ne pas diffuser';
