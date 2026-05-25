import { useEffect, useId, useRef, useState } from 'react';
import { getDefinitionIndicateur } from '../data/methodologie.js';

// Tooltip contextuel affichant la définition méthodologique d'un
// indicateur. Trois modes de pose :
//   - `inline`  : enveloppe le libellé textuel et ajoute une icône
//                 d'info à sa droite. Idéal pour titres de cards X/Y
//                 ou en-têtes de tableau.
//   - `iconOnly`: ne rend QUE l'icône (sans le libellé) — utilisé
//                 quand le libellé est déjà porté par le markup
//                 environnant (ex. <label> d'un <select>).
//
// L'icône suit la convention DSFR (`fr-icon-question-line`).
// Le tooltip s'affiche au survol (mouseenter/leave) et reste
// toggle-able au clic — utile au clavier (focus → Enter).
// Fermeture sur Échap et au blur. Aucun positionnement à la souris :
// le tooltip se place sous l'icône en CSS (position: absolute).
//
// Robustesse : si aucune définition n'est trouvée pour ce couple
// (libellé, cursus), on rend le libellé brut (mode inline) ou
// rien du tout (mode iconOnly) — pas d'icône inutile.

export default function IndicateurTooltip({
  libelle,
  cursus,
  mode = 'inline',
}) {
  const definition = getDefinitionIndicateur(libelle, cursus);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const tooltipId = useId();

  // Fermer au clic en dehors (Echap est géré par onKeyDown du bouton).
  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

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
        <span id={tooltipId} className="tooltip-definition" role="tooltip">
          {definition}
        </span>
      )}
    </span>
  );
}
