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

              {meth.millesime && (
                <SectionMillesime millesime={meth.millesime} />
              )}

              {meth.indicateurs && Object.keys(meth.indicateurs).length > 0 && (
                <SectionIndicateurs indicateurs={meth.indicateurs} />
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

// Libellés pour les familles d'indicateurs (clé `famille` du JSON).
const LIBELLES_FAMILLE = {
  reussite:  'Réussite',
  insertion: 'Insertion',
};

// Mapping code court → libellé humain pour les cursus, utilisé dans
// les listes « Cursus concernés » et les titres de spécificités.
// Codes alignés avec les valeurs `cursus` et `specificites` du JSON
// (snake_case). Si une clé inconnue arrive, on retombe sur la clé
// brute par fallback.
const LIBELLES_CURSUS = {
  licence_generale: 'Licence générale',
  licence_pro:      'Licence professionnelle',
  but:              'BUT',
  master:           'Master',
};

// Section « Millésime » : définition longue + un sous-bloc par cursus
// avec son exemple. Itère sur les clés de `par_cursus` pour ne pas
// hardcoder les 4 cursus — un ajout futur (BUT4, etc.) y apparaîtra
// automatiquement.
function SectionMillesime({ millesime }) {
  const parCursus = millesime.par_cursus || {};
  return (
    <section>
      <h3>{millesime.libelle || 'Millésime'}</h3>
      {millesime.definition_longue && <p>{millesime.definition_longue}</p>}
      {Object.entries(parCursus).map(([code, bloc]) => (
        <div key={code}>
          <h4>{code}</h4>
          <p>{bloc.exemple}</p>
        </div>
      ))}
    </section>
  );
}

// Section « Indicateurs » : un bloc par indicateur défini au top-level
// (Phase 10 — 10 entrées, une par libellé API distinct). Affichage
// groupé par famille (Réussite / Insertion) pour limiter le scroll.
// Au sein d'une famille, on conserve l'ordre du JSON (≈ ordre canonique
// — variantes de réussite par durée croissante, puis poursuite/
// poursuivants, puis indicateurs d'insertion).
function SectionIndicateurs({ indicateurs }) {
  const entries = Object.entries(indicateurs);
  const familles = ['reussite', 'insertion'];
  const groupes = familles.map((fam) => ({
    code: fam,
    libelle: LIBELLES_FAMILLE[fam],
    items: entries.filter(([, ind]) => ind.famille === fam),
  }));
  const orphelins = entries.filter(([, ind]) => !familles.includes(ind.famille));

  return (
    <section>
      <h3>Indicateurs</h3>
      {groupes.map((g) => g.items.length === 0 ? null : (
        <div key={g.code} className="groupe-famille-indicateurs">
          <h4 className="titre-famille-indicateurs">
            Indicateurs de {g.libelle.toLowerCase()}
          </h4>
          {g.items.map(([code, ind]) => (
            <BlocIndicateur key={code} code={code} ind={ind} />
          ))}
        </div>
      ))}
      {orphelins.map(([code, ind]) => (
        <BlocIndicateur key={code} code={code} ind={ind} />
      ))}
    </section>
  );
}

function BlocIndicateur({ code, ind }) {
  const cursusListe = Array.isArray(ind.cursus)
    ? ind.cursus.map((c) => LIBELLES_CURSUS[c] || c).join(', ')
    : null;

  return (
    <div className="bloc-indicateur-methodo">
      <h5>{ind.libelle || code}</h5>
      <p className="meta-indicateur">
        {cursusListe && (
          <>
            <strong>Cursus :</strong> {cursusListe}
            {ind.population_reference && ' · '}
          </>
        )}
        {ind.population_reference && (
          <>
            <strong>Population de référence :</strong>{' '}
            {ind.population_reference}
          </>
        )}
      </p>
      {ind.definition_longue && <p>{ind.definition_longue}</p>}
      {ind.formule && (
        <p className="formule-indicateur">
          <strong>Formule :</strong> {ind.formule}
        </p>
      )}
      {ind.specificites && Object.keys(ind.specificites).length > 0 && (
        <div className="specificites-indicateur">
          {Object.entries(ind.specificites).map(([cursusCode, texte]) => (
            <div key={cursusCode} className="specificite-bloc">
              <p className="specificite-titre">
                <strong>
                  Spécificité — {LIBELLES_CURSUS[cursusCode] || cursusCode}
                </strong>
              </p>
              <p>{texte}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
