import { useApp } from '../context/AppContext.jsx';

// Bandeau des filtres actifs — pills cliquables (fr-tag DSFR avec
// classe --dismiss) qui permettent de retirer un filtre en un clic.
// Visible uniquement si AU MOINS un filtre est actif ; sinon le
// composant retourne null (pas d'espace réservé à vide).
//
// Périmètre : les vrais filtres de sélection, à l'exclusion des
// dimensions structurelles (millésime, axes X et Y) — ces dernières
// sont déjà reflétées par les onglets et la barre supérieure.
// Sont aussi exclus les modes d'axes (médiane / moyenne / référence)
// qui sont des options d'affichage, pas des filtres de périmètre.
//
// Sources des libellés :
//   - domaine, discipline : code stocké en state, libellé lu dans
//     `referentiels.disciplinaire.data` (chargé au démarrage).
//   - secteur : la valeur en state EST déjà le libellé (la colonne
//     SQL stocke directement le libellé long).
//   - mention : on affiche le diplom (code SIES). Un lookup vers le
//     libellé nécessiterait useMentionsEtab (fetch supplémentaire) —
//     volontairement omis ici pour ne pas surcharger la fiche, le
//     code reste reconnaissable depuis la liste où l'utilisateur l'a
//     sélectionné.
//   - typeMaster : la valeur en state est déjà le libellé.
//   - representativite / memeTypologie : valeurs booléennes,
//     libellé statique.

export default function FiltresActifs() {
  const {
    vue, cursus,
    domaine, setDomaine,
    discipline, setDiscipline,
    secteur, setSecteur,
    mention, setMention,
    typeMaster, setTypeMaster,
    representativite, setRepresentativite,
    memeTypologie, setMemeTypologie,
    referentiels,
  } = useApp();

  const disci = referentiels?.disciplinaire?.data;

  const libelleDepuisCode = (liste, code) => {
    if (!Array.isArray(liste)) return code;
    const item = liste.find((x) => x.code === code);
    return item?.libelle || code;
  };

  const pills = [];

  if (domaine) {
    pills.push({
      key:      'domaine',
      label:    `Domaine : ${libelleDepuisCode(disci?.domaines, domaine)}`,
      onRemove: () => setDomaine(null),
    });
  }
  if (discipline) {
    pills.push({
      key:      'discipline',
      label:    `Discipline : ${libelleDepuisCode(disci?.disciplines, discipline)}`,
      onRemove: () => setDiscipline(null),
    });
  }
  if (secteur) {
    pills.push({
      key:      'secteur',
      label:    `Secteur : ${secteur}`,
      onRemove: () => setSecteur(null),
    });
  }
  if (mention) {
    pills.push({
      key:      'mention',
      label:    `Mention : ${mention}`,
      onRemove: () => setMention(null),
    });
  }
  if (cursus === 'Master' && typeMaster) {
    pills.push({
      key:      'typeMaster',
      label:    typeMaster,
      onRemove: () => setTypeMaster(null),
    });
  }
  if (representativite) {
    pills.push({
      key:      'representativite',
      label:    'Représentatif uniquement',
      onRemove: () => setRepresentativite(false),
    });
  }
  if (vue === 'etablissements' && memeTypologie) {
    pills.push({
      key:      'memeTypologie',
      label:    'Même typologie uniquement',
      onRemove: () => setMemeTypologie(false),
    });
  }

  if (pills.length === 0) return null;

  // Singulier / pluriel selon le nombre de filtres actifs. « Filtre
  // actif » est plus juste à 1 que « Filtres actifs » qui sonne
  // toujours pluriel.
  const libelleLabel = pills.length === 1 ? 'Filtre actif' : 'Filtres actifs';

  return (
    <div className="filtres-actifs" aria-label={libelleLabel}>
      <span className="filtres-actifs-label">{libelleLabel}&nbsp;:</span>
      {/* Pas de <ul>/<li> ici — DSFR fr-tags-group ajoute des marges
          qui désalignent les tags. On rend les boutons directement
          comme flex-items du conteneur.
          NOTE — pas de classe `fr-tag--dismiss` : le JS DSFR
          intercepte le clic et retire le bouton du DOM côté vanilla,
          puis React tente removeChild sur un nœud absent → erreur
          « NotFoundError: The object can not be found here » et page
          blanche. On reconstitue le rendu × manuellement avec un
          <span> enfant — visuel équivalent, pas de manipulation DOM
          hors React. */}
      {pills.map((p) => (
        <button
          key={p.key}
          type="button"
          className="fr-tag fr-tag--sm filtres-actifs-pill"
          onClick={p.onRemove}
          aria-label={`Retirer le filtre : ${p.label}`}
        >
          {p.label}
          <span className="filtres-actifs-pill-close" aria-hidden="true">×</span>
        </button>
      ))}
    </div>
  );
}
