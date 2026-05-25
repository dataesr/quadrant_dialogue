// Placeholder visuel pulsé pour les zones en cours de chargement.
// Évite le « saut de mise en page » entre l'état vide et l'arrivée
// du contenu — réserve les dimensions, signale visuellement
// l'attente, sans bloquer l'interaction sur le reste de la page.
//
// Props :
//   - width  : CSS length (px, %, rem...). Défaut : 100 %.
//   - height : CSS length. Défaut : 1rem.
//   - radius : border-radius CSS. Défaut : 4 px.
//   - className : classes supplémentaires (par ex. pour spacing).
//   - style     : overrides ad-hoc.
//
// Style + animation : voir .skeleton dans global.css.

export default function Skeleton({
  width = '100%',
  height = '1rem',
  radius = '4px',
  className,
  style,
}) {
  const finalClassName = className ? `skeleton ${className}` : 'skeleton';
  const finalStyle = {
    width,
    height,
    borderRadius: radius,
    ...style,
  };
  return (
    <div
      className={finalClassName}
      style={finalStyle}
      aria-hidden="true"
    />
  );
}
