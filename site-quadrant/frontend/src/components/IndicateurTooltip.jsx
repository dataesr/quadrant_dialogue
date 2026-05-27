import { useEffect, useId, useRef, useState } from 'react';
import {
  chargerMethodologie,
  getDefinitionIndicateur,
} from '../data/methodologie.js';
import { useAutoPlacement } from '../utils/useAutoPlacement.js';

// Tooltip contextuel affichant la définition méthodologique d'un
// indicateur. Deux modes :
//   - `inline`  : enveloppe le libellé textuel et ajoute une icône
//                 d'info à sa droite. Idéal pour titres de cards X/Y
//                 ou en-têtes de tableau.
//   - `iconOnly`: ne rend QUE l'icône (sans le libellé) — utilisé
//                 quand le libellé est déjà porté par le markup
//                 environnant (ex. <label> d'un <select>).
//
// Cache asynchrone : `getDefinitionIndicateur` lit le cache (fetch
// initial déclenché dans `main.jsx`). Tant que le cache n'est pas
// rempli, le tooltip est absent (mode iconOnly → null, mode inline
// → libellé brut). On souscrit à `chargerMethodologie()` une fois au
// montage : dès la résolution, un setState force un re-render pour
// faire apparaître l'icône d'info.
//
// Robustesse : si la définition n'est jamais trouvée (cursus non
// couvert, libellé inconnu, fetch raté), l'icône reste absente —
// pas de plantage, pas de tooltip vide.

export default function IndicateurTooltip({
  libelle,
  cursus,
  mode = 'inline',
}) {
  const [open, setOpen] = useState(false);
  // Force un re-render quand le cache async devient disponible.
  const [, setTick] = useState(0);
  const wrapperRef = useRef(null);
  const tooltipId = useId();

  // Ajustement post-mesure pour ne pas déborder de l'iframe à droite
  // (ni à gauche, ni en bas). Le tooltip est ancré `top: 100%; left: 0`
  // sur son wrapper — pour les wrappers proches du bord droit de
  // l'iframe (icônes "?" du panneau de détails), il sortait du viewport.
  const tooltipRef = useAutoPlacement([open]);

  // S'assurer que le fetch est lancé et tagger un re-render à
  // résolution. `chargerMethodologie` est idempotent — pas de coût
  // si déjà chargé / en cours.
  useEffect(() => {
    let cancelled = false;
    chargerMethodologie().then(() => {
      if (!cancelled) setTick((t) => t + 1);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const definition = getDefinitionIndicateur(libelle, cursus);

  if (!definition) {
    return mode === 'iconOnly' ? null : <span>{libelle}</span>;
  }

  const Bouton = (
    <button
      type="button"
      className="bouton-info fr-icon-question-line"
      aria-label={`Définition de ${libelle}`}
      aria-describedby={open ? tooltipId : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => {
        e.preventDefault();
        setOpen((o) => !o);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    />
  );

  return (
    <span
      className="indicateur-avec-tooltip"
      ref={wrapperRef}
    >
      {mode === 'inline' && <span>{libelle}</span>}
      {Bouton}
      {open && (
        <span
          ref={tooltipRef}
          id={tooltipId}
          className="tooltip-definition"
          role="tooltip"
        >
          {definition}
        </span>
      )}
    </span>
  );
}
