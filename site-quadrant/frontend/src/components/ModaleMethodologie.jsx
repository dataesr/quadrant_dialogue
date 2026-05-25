import { useEffect, useRef } from 'react';
import {
  METHODOLOGIE_GENERALE,
  METHODOLOGIE_CURSUS,
} from '../data/methodologie.js';

// Modale d'affichage de la méthodologie complète.
//
// Pourquoi pas <dialog showModal()> : la modale doit fonctionner dans
// l'iframe Quadrant (≤ 1000 px de large) sans imposer de focus trap
// natif qui interfère avec le site hôte. On dessine donc un overlay
// custom (.modale-methodologie-overlay) qui ne sort pas du document
// iframe — clic en dehors et Échap pour fermer, focus déplacé sur le
// bouton de fermeture à l'ouverture.
//
// Pas de classes DSFR `fr-modal` : le composant DSFR est piloté par
// JS au moment du chargement (data-fr-js-modal), ce qui ne joue pas
// bien avec un arbre React monté/démonté à la demande. La même règle
// est suivie pour `fr-collapse` dans AdvancedFilters.

export default function ModaleMethodologie({ open, onClose }) {
  const fermerRef = useRef(null);

  // Focus initial sur le bouton de fermeture (point d'entrée
  // accessible) + Échap pour fermer.
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    // Focus différé : laisser le temps au navigateur de monter l'élément.
    const t = setTimeout(() => fermerRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modale-methodologie-overlay"
      role="presentation"
      onMouseDown={(e) => {
        // Clic en dehors du contenu : ferme.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modale-methodologie"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modale-methodologie-titre"
      >
        <header>
          <h2 id="modale-methodologie-titre">Méthodologie</h2>
          <button
            ref={fermerRef}
            type="button"
            className="bouton-fermer fr-icon-close-line"
            aria-label="Fermer la fenêtre de méthodologie"
            onClick={onClose}
          />
        </header>

        <div className="modale-methodologie-contenu">
          <section>
            <h3>Présentation générale</h3>
            {METHODOLOGIE_GENERALE.split('\n\n').map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>

          {Object.entries(METHODOLOGIE_CURSUS).map(([code, bloc]) => (
            <section key={code}>
              <h3>{bloc.libelle}</h3>
              {bloc.champ.split('\n').filter(Boolean).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {bloc.indicateurs.map((ind) => (
                <div key={ind.libelle}>
                  <h4>{ind.libelle}</h4>
                  <p>{ind.definition}</p>
                </div>
              ))}
              <h4>Champ de l&apos;insertion professionnelle</h4>
              <p>{bloc.champ_insertion}</p>
              <h4>{bloc.insertion.libelle}</h4>
              <p>{bloc.insertion.definition}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
