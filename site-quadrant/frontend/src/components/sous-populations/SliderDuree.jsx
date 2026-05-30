import { useEffect, useRef } from 'react';

// Curseur générique aligné sur le composant Curseur DSFR (`fr-range`),
// utilisé pour :
//   - la durée d'observation de la modale d'analyse fine (valeurs
//     6/12/18/24/30, libellé « Observation à », suffixe « mois ») ;
//   - le millésime de la modale d'animation temporelle (valeurs 2019…2024,
//     libellé « Millésime », sans suffixe).
//
// Pilotage : la valeur est CONTRÔLÉE par React. Le JS DSFR instancie le
// composant (`data-fr-js-range`) et gère le remplissage de la glissière,
// l'ergot et le texte de l'ergot/bornes (décorés du suffixe via
// `data-fr-suffix`). Comme le JS DSFR ne recalcule son rendu que sur les
// événements natifs `input`/`change`, on ré-émet un `input` natif à chaque
// changement de valeur PROGRAMMATIQUE (clic sur un cran, autre onglet,
// animation) pour resynchroniser le remplissage. Le mécanisme de suivi de
// valeur de React (value tracker) empêche cet `input` synthétique de
// déclencher `onChange` quand la valeur n'a pas changé → l'animation auto
// n'est PAS interrompue, alors qu'un glissement/clic réel (valeur
// différente) déclenche bien `onChange` (→ pause si le parent le gère).
//
// Crans cliquables : `fr-range--step` n'affiche que des crans visuels (non
// cliquables nativement). On superpose donc des boutons invisibles sur la
// position de chaque valeur pour conserver le saut direct (utile au
// tactile), sans masquer la possibilité de glisser entre les crans.

// Pas commun (PGCD des écarts à la borne basse). Pour 6/12/18/24/30 → 6 ;
// pour des millésimes contigus 2019…2024 → 1. Garantit des crans DSFR
// alignés sur les valeurs disponibles.
function pasCommun(valeurs) {
  const pgcd = (a, b) => (b === 0 ? a : pgcd(b, a % b));
  const min = valeurs[0];
  let g = 0;
  for (const v of valeurs) g = pgcd(g, v - min);
  return g || 1;
}

export default function SliderDuree({
  valeurs,
  valeur,
  onChanger,
  idBase,
  libelle = 'Observation à',
  suffixe = ' mois',
  sm = true,
  disabled = false,
}) {
  const inputRef = useRef(null);

  // Resync du rendu DSFR après un changement de valeur (l'attribut `value`
  // est déjà à jour côté React ; on notifie le JS DSFR).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [valeur]);

  if (!valeurs || valeurs.length < 2) return null;

  const min = valeurs[0];
  const max = valeurs[valeurs.length - 1];
  const step = pasCommun(valeurs);
  const format = (v) => `${v}${suffixe}`;

  const choisir = (cible) => {
    const proche = valeurs.reduce(
      (a, b) => (Math.abs(b - cible) < Math.abs(a - cible) ? b : a),
      valeurs[0]
    );
    onChanger(proche);
  };

  return (
    <div className={'fr-range-group slider-duree' + (sm ? ' slider-duree--sm' : '')}>
      <label className="fr-label" id={`${idBase}-label`}>
        {libelle} : {format(valeur)}
      </label>
      <div
        className={'fr-range fr-range--step' + (sm ? ' fr-range--sm' : '')}
        data-fr-suffix={suffixe}
      >
        <span className="fr-range__output" aria-hidden="true" />
        <input
          ref={inputRef}
          type="range"
          min={min}
          max={max}
          step={step}
          value={valeur ?? min}
          disabled={disabled}
          aria-labelledby={`${idBase}-label`}
          onChange={(e) => choisir(parseInt(e.target.value, 10))}
        />
        <span className="fr-range__min" aria-hidden="true" />
        <span className="fr-range__max" aria-hidden="true" />

        {/* Crans cliquables (saut direct) — invisibles, superposés sur la
            position de chaque valeur. tabIndex -1 : l'input reste le point
            d'entrée clavier, ces boutons sont une aide tactile/souris. */}
        <div className="slider-duree-ticks">
          {valeurs.map((v) => {
            const pct = max > min ? (v - min) / (max - min) : 0;
            return (
              <button
                key={v}
                type="button"
                tabIndex={-1}
                disabled={disabled}
                className={'slider-duree-tick' + (v === valeur ? ' slider-duree-tick--actif' : '')}
                style={{ left: `calc(var(--thumb-size) * 0.5 + ${pct} * (100% - var(--thumb-size)))` }}
                onClick={() => choisir(v)}
                aria-label={`${libelle} ${format(v)}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
