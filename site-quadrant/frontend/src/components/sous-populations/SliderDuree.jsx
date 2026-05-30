import { useEffect, useRef } from 'react';

// Curseur de durée d'observation, aligné sur le composant Curseur DSFR
// (`fr-range`), partagé par les onglets Comparaison / Quadrant / Parcours
// de la modale d'analyse fine (Phase 14.5.1).
//
// Pilotage : la valeur est CONTRÔLÉE par React (état `dureeCourante`
// partagé entre onglets). Le JS DSFR instancie le composant (ajout de
// `data-fr-js-range`) et gère le remplissage de la glissière + l'ergot +
// le texte de l'ergot/bornes (décorés du suffixe « mois » via
// `data-fr-suffix`). Comme le JS DSFR ne recalcule son rendu que sur les
// événements natifs `input`/`change`, on ré-émet un `input` natif à chaque
// changement de valeur PROGRAMMATIQUE (clic sur un cran, mise à jour par un
// autre onglet ou l'animation) pour resynchroniser le remplissage.
//
// Crans cliquables : `fr-range--step` n'affiche que des crans visuels (non
// cliquables nativement). On superpose donc des boutons invisibles sur la
// position de chaque durée pour conserver le saut direct (utile au tactile),
// sans masquer la possibilité de glisser entre les crans.

// Pas commun des durées (PGCD des écarts à la borne basse). Pour les durées
// usuelles 6/12/18/24/30 → 6. Garantit des crans DSFR alignés sur les durées.
function pasCommun(durees) {
  const pgcd = (a, b) => (b === 0 ? a : pgcd(b, a % b));
  const min = durees[0];
  let g = 0;
  for (const d of durees) g = pgcd(g, d - min);
  return g || 1;
}

export default function SliderDuree({
  durees,
  valeur,
  onChanger,
  idBase,
  sm = true,
}) {
  const inputRef = useRef(null);

  // Resync du rendu DSFR après un changement de valeur (l'attribut `value`
  // est déjà à jour côté React ; on notifie le JS DSFR). Idempotent : le
  // `input` natif re-déclenche onChange avec la même valeur → no-op.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [valeur]);

  if (!durees || durees.length < 2) return null;

  const min = durees[0];
  const max = durees[durees.length - 1];
  const step = pasCommun(durees);

  const choisir = (cible) => {
    const proche = durees.reduce(
      (a, b) => (Math.abs(b - cible) < Math.abs(a - cible) ? b : a),
      durees[0]
    );
    onChanger(proche);
  };

  return (
    <div className={'fr-range-group slider-duree' + (sm ? ' slider-duree--sm' : '')}>
      <label className="fr-label" id={`${idBase}-label`}>
        Observation à : {valeur} mois
      </label>
      <div
        className={'fr-range fr-range--step' + (sm ? ' fr-range--sm' : '')}
        data-fr-suffix=" mois"
      >
        <span className="fr-range__output" aria-hidden="true" />
        <input
          ref={inputRef}
          type="range"
          min={min}
          max={max}
          step={step}
          value={valeur ?? min}
          aria-labelledby={`${idBase}-label`}
          onChange={(e) => choisir(parseInt(e.target.value, 10))}
        />
        <span className="fr-range__min" aria-hidden="true" />
        <span className="fr-range__max" aria-hidden="true" />

        {/* Crans cliquables (saut direct) — invisibles, superposés sur la
            position de chaque durée. tabIndex -1 : l'input reste le point
            d'entrée clavier, ces boutons sont une aide tactile/souris. */}
        <div className="slider-duree-ticks">
          {durees.map((d) => {
            const pct = max > min ? (d - min) / (max - min) : 0;
            return (
              <button
                key={d}
                type="button"
                tabIndex={-1}
                className={'slider-duree-tick' + (d === valeur ? ' slider-duree-tick--actif' : '')}
                style={{ left: `calc(var(--thumb-size) * 0.5 + ${pct} * (100% - var(--thumb-size)))` }}
                onClick={() => choisir(d)}
                aria-label={`Observation à ${d} mois`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
