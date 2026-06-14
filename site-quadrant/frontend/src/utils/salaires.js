// Helpers partagés pour l'affichage des salaires (Phase 15.6).
//
// Salaire mensuel net en équivalent temps plein (DSN, méthodologie SIES).
// Disponible uniquement à 12/18/24/30 mois (jamais à 6).

// Durées de salaire (l'axe X des graphiques « sur la durée » les liste
// toujours, indépendamment des données présentes — un trou = courbe
// interrompue, pas une durée retirée de l'axe).
export const DUREES_SALAIRE = [12, 18, 24, 30];

// Format monétaire français : « 2 760 € » (espace insécable avant €).
export function formatEuroSalaire(valeur) {
  if (valeur == null || Number.isNaN(valeur)) return '—';
  return `${Math.round(valeur).toLocaleString('fr-FR')} €`;
}

// Une cellule de salaire est exploitable si sa médiane (q2) est définie.
export function celluleSalaireValide(cell) {
  return !!cell && typeof cell.q2 === 'number';
}

// Convertit un objet { "12": {q1,q2,q3}|null, ... } en tableau de points
// trié par valeur d'abscisse : [{ x:12, q1, q2, q3 }, ...]. Les cellules
// absentes ou sans médiane deviennent des points à quartiles null (trou).
export function donneesVersPoints(donnees) {
  if (!donnees) return [];
  return Object.keys(donnees)
    .map((k) => {
      const cell = donnees[k];
      const valide = celluleSalaireValide(cell);
      return {
        x: Number(k),
        q1: valide ? cell.q1 : null,
        q2: valide ? cell.q2 : null,
        q3: valide ? cell.q3 : null,
      };
    })
    .sort((a, b) => a.x - b.x);
}

// Échelle Y commune à plusieurs séries de points : min des Q1, max des Q3,
// avec une marge de 10 % au-dessus/dessous. Renvoie null si aucune valeur.
export function echelleCommune(...listesPoints) {
  const valeurs = [];
  for (const points of listesPoints) {
    for (const p of points || []) {
      if (typeof p.q1 === 'number') valeurs.push(p.q1);
      if (typeof p.q3 === 'number') valeurs.push(p.q3);
    }
  }
  if (valeurs.length === 0) return null;
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const marge = (max - min) * 0.1 || max * 0.1 || 100;
  return { min: min - marge, max: max + marge };
}

// Au moins une cellule exploitable dans un objet donnees_par_duree.
export function aAuMoinsUnSalaire(donneesParDuree) {
  if (!donneesParDuree) return false;
  return Object.values(donneesParDuree).some(celluleSalaireValide);
}
