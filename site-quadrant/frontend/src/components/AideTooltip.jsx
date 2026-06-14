import { useEffect, useId, useRef, useState } from 'react';
import { useAutoPlacement } from '../utils/useAutoPlacement.js';

// Tooltip d'aide générique « ? » porté par un texte littéral (Phase 15.7).
//
// Même interaction et même habillage que IndicateurTooltip (bouton
// `.bouton-info` fr-icon-question-line, tooltip `.tooltip-definition`
// repositionné par useAutoPlacement pour ne pas déborder de l'iframe),
// mais alimenté par une chaîne passée en prop plutôt que par la
// méthodologie indexée par indicateur. Sert aux « ? » contextuels qui
// ne correspondent pas à un indicateur unique (ex. rubrique salaires).
//
// Rend uniquement l'icône (pas de libellé) : le titre est porté par le
// markup environnant. Hover / focus / clic ouvrent ; Échap, blur,
// clic extérieur ferment.

export default function AideTooltip({ texte, ariaLabel = 'Aide' }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const tooltipRef = useAutoPlacement([open]);
  const tooltipId = useId();

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (!texte) return null;

  return (
    <span className="indicateur-avec-tooltip indicateur-avec-tooltip--icon" ref={wrapperRef}>
      <button
        type="button"
        className="bouton-info fr-icon-question-line"
        aria-label={ariaLabel}
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
      {open && (
        <span
          ref={tooltipRef}
          id={tooltipId}
          className="tooltip-definition tooltip-definition--court"
          role="tooltip"
        >
          {texte}
        </span>
      )}
    </span>
  );
}
