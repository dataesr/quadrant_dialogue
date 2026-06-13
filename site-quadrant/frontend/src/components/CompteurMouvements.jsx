// Compteur de mouvements de bulles (Phase 15.3) — vue Mentions.
//
// Affiché en permanence sous le quadrant principal (hors animation),
// il contextualise les mouvements entre le millésime courant et le
// précédent pour aider à distinguer les vraies évolutions du
// référentiel des artefacts de seuil de fiabilité.
//
// Données : `data.mouvements` renvoyé par /api/quadrant (vue Mentions
// avec établissement de contexte). Quatre catégories, calculées au
// seuil de fiabilité (20) côté backend :
//   - nouvelles      : absente au précédent → visible au courant
//   - disparues      : présente au précédent → absente au courant
//   - reapparues     : sous le seuil au précédent → visible au courant
//   - masquees_seuil : présente au courant mais sous le seuil (état
//                      courant, pas une transition)
//
// Au premier millésime observé (`comparaison_disponible=false`) :
// message « Première année observée ».

// Symbole + libellés (singulier / pluriel) par catégorie. `transition`
// distingue les comptes « par rapport au précédent » du décompte
// d'état courant (masquées) pour une formulation correcte.
const CATEGORIES = [
  { cle: 'nouvelles',      symbole: '+', sing: 'nouvelle',   plur: 'nouvelles',   classe: 'est-nouvelle',  transition: true },
  { cle: 'disparues',      symbole: '−', sing: 'disparue',   plur: 'disparues',   classe: 'est-disparue',  transition: true },
  { cle: 'reapparues',     symbole: '↑', sing: 'réapparue',  plur: 'réapparues',  classe: 'est-reapparue', transition: true },
  { cle: 'masquees_seuil', symbole: '⊘', sing: 'sous le seuil', plur: 'sous le seuil', classe: 'est-masquee', transition: false },
];

export default function CompteurMouvements({ mouvements, millesime }) {
  if (!mouvements) return null;

  const { comparaison_disponible, seuil } = mouvements;

  if (!comparaison_disponible) {
    return (
      <p className="compteur-mouvements compteur-mouvements--na">
        Première année observée — pas de comparaison avec un millésime précédent.
      </p>
    );
  }

  const precedent = millesime != null ? Number(millesime) - 1 : null;

  const badges = CATEGORIES
    .map((cat) => {
      const libs = mouvements[cat.cle] || [];
      return { ...cat, libs, n: libs.length };
    })
    .filter((cat) => cat.n > 0);

  const aucunMouvement = badges.length === 0;

  return (
    <p className="compteur-mouvements">
      <span className="compteur-mouvements-intro">
        {precedent != null
          ? `Par rapport à ${precedent} :`
          : 'Par rapport au millésime précédent :'}
      </span>
      {aucunMouvement ? (
        <span className="compteur-mouvements-vide">aucun mouvement de mention.</span>
      ) : (
        badges.map((cat) => {
          const motCle = cat.n > 1 ? cat.plur : cat.sing;
          // Le décompte d'état (masquées) porte une mention de seuil ;
          // les transitions n'en ont pas besoin.
          const suffixe = cat.transition ? '' : ` de fiabilité (effectif < ${seuil})`;
          // Détail au survol : libellés concernés (utile pour vérifier
          // une évolution donnée). Libellés vides ignorés.
          const detail = cat.libs.filter(Boolean).join(', ');
          return (
            <span
              key={cat.cle}
              className={`compteur-mouvements-badge ${cat.classe}`}
              title={detail || undefined}
            >
              <span className="compteur-mouvements-symbole" aria-hidden="true">
                {cat.symbole}
              </span>
              {cat.n} {motCle}{suffixe}
            </span>
          );
        })
      )}
    </p>
  );
}
