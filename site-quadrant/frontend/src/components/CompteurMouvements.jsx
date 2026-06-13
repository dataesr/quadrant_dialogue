// Compteur de mouvements de bulles (Phase 15.3, déplacé dans la modale
// d'animation en 15.4).
//
// Affiché sous le quadrant ANIMÉ (la transition prend tout son sens en
// animation, là où l'utilisateur la voit se faire). Contextualise les
// mouvements entre le millésime affiché et le précédent de la série.
//
// Données : `mouvements` (par millésime) renvoyé par
// /api/quadrant/serie-temporelle. Quatre catégories au seuil de
// fiabilité (20), calculées côté backend :
//   - nouvelles      : absente au précédent → visible au courant
//   - disparues      : présente au précédent → absente au courant
//   - reapparues     : sous le seuil au précédent → visible au courant
//   - masquees_seuil : présente au courant mais sous le seuil
//
// Au premier millésime de la série (`comparaison_disponible=false`) :
// message « Première année observée ».
//
// Format texte (Phase 15.4) : une seule phrase, sans couleur ni
// encadrement — « Par rapport au millésime 2021 — 1 mention disparue,
// 8 mentions réapparues. » Le mot « mention(s) » est explicité et
// accordé en nombre, comme le qualificatif.

const CATEGORIES = [
  { cle: 'nouvelles',      sing: 'nouvelle',                plur: 'nouvelles' },
  { cle: 'disparues',      sing: 'disparue',                plur: 'disparues' },
  { cle: 'reapparues',     sing: 'réapparue',               plur: 'réapparues' },
  { cle: 'masquees_seuil', sing: 'sous le seuil de fiabilité', plur: 'sous le seuil de fiabilité' },
];

export default function CompteurMouvements({ mouvements }) {
  if (!mouvements) return null;

  const { comparaison_disponible, millesime_precedent } = mouvements;

  if (!comparaison_disponible) {
    return (
      <p className="compteur-mouvements compteur-mouvements--na">
        Première année observée — pas de comparaison avec un millésime précédent.
      </p>
    );
  }

  const segments = CATEGORIES
    .map((cat) => ({ ...cat, libs: (mouvements[cat.cle] || []).filter(Boolean) }))
    .filter((cat) => cat.libs.length > 0)
    .map((cat) => {
      const n = cat.libs.length;
      const motMention = n > 1 ? 'mentions' : 'mention';
      const qualif = n > 1 ? cat.plur : cat.sing;
      return { cle: cat.cle, texte: `${n} ${motMention} ${qualif}`, detail: cat.libs.join(', ') };
    });

  const intro = millesime_precedent != null
    ? `Par rapport au millésime ${millesime_precedent} —`
    : 'Par rapport au millésime précédent —';

  return (
    <p className="compteur-mouvements">
      {intro}{' '}
      {segments.length > 0 ? (
        segments.map((s, i) => (
          <span key={s.cle}>
            {/* Infobulle native : libellés des mentions concernées. */}
            <span className="compteur-mouvements-detail" title={s.detail}>
              {s.texte}
            </span>
            {i < segments.length - 1 ? ', ' : ''}
          </span>
        ))
      ) : (
        'aucun mouvement de mention'
      )}
      .
    </p>
  );
}
