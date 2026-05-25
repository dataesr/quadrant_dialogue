import { useEffect, useRef, useState } from 'react';
import { chargerMethodologie, getMethodologie } from '../data/methodologie.js';

// Modale d'affichage de la méthodologie complète.
//
// Contenu lu depuis le cache asynchrone (`public/methodologie.json`).
// Trois états possibles :
//   - chargement     : cache vide ET fetch en cours → message
//                      « Chargement… ».
//   - prêt et peuplé : rendu normal des sections (présentation + cursus).
//   - prêt et vide   : fetch raté (cf. fallback `{ generale: '', cursus: {} }`)
//                      → message d'erreur informatif. L'app ne plante pas.
//
// Pourquoi pas <dialog showModal()> : la modale doit fonctionner dans
// l'iframe Quadrant (≤ 1000 px de large) sans imposer de focus trap
// natif qui interfère avec le site hôte. On dessine un overlay
// custom qui ne sort pas du document iframe — clic en dehors et
// Échap pour fermer, focus déplacé sur le bouton de fermeture à
// l'ouverture.

export default function ModaleMethodologie({ open, onClose }) {
  const fermerRef = useRef(null);
  // Tick local pour forcer un re-render quand le cache async est prêt.
  // `getMethodologie()` est synchrone — sans ce tick, un cache rempli
  // après le premier rendu ne déclencherait pas de mise à jour.
  const [, setTick] = useState(0);

  // Focus initial sur la croix + déclenchement du fetch méthodologie
  // (idempotent). Échap pour fermer.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    chargerMethodologie().then(() => {
      if (!cancelled) setTick((t) => t + 1);
    });

    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => fermerRef.current?.focus(), 0);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  const meth = getMethodologie();
  const enChargement = meth == null;
  const vide = meth != null
    && !meth.generale
    && (!meth.cursus || Object.keys(meth.cursus).length === 0);

  return (
    <div
      className="modale-methodologie-overlay"
      role="presentation"
      onMouseDown={(e) => {
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
          {enChargement && <p>Chargement…</p>}

          {!enChargement && vide && (
            <p>
              Le contenu méthodologique n&apos;a pas pu être chargé.
              Si le problème persiste, contactez l&apos;équipe Quadrant.
            </p>
          )}

          {!enChargement && !vide && (
            <>
              {meth.generale && (
                <section>
                  <h3>Présentation générale</h3>
                  {meth.generale.split('\n\n').map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </section>
              )}

              {Object.entries(meth.cursus || {}).map(([code, bloc]) => (
                <section key={code}>
                  <h3>{bloc.libelle}</h3>
                  {(bloc.champ || '').split('\n').filter(Boolean).map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                  {(bloc.indicateurs || []).map((ind) => (
                    <div key={ind.libelle}>
                      <h4>{ind.libelle}</h4>
                      <p>{ind.definition}</p>
                    </div>
                  ))}
                  {bloc.champ_insertion && (
                    <>
                      <h4>Champ de l&apos;insertion professionnelle</h4>
                      <p>{bloc.champ_insertion}</p>
                    </>
                  )}
                  {bloc.insertion && (
                    <>
                      <h4>{bloc.insertion.libelle}</h4>
                      <p>{bloc.insertion.definition}</p>
                    </>
                  )}
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
