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
