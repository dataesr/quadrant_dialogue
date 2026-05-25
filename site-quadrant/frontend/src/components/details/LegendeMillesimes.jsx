// Légende horizontale sous un profil d'insertion. Petite puce
// rectangulaire + libellé millésime, mis en gras pour le courant.
// HTML pur (pas SVG) — plus simple à styler / wrapper proprement quand
// l'espace est étroit.

export default function LegendeMillesimes({ millesimes, millesimeCourant, couleurs }) {
  if (!millesimes || millesimes.length === 0) return null;
  return (
    <div className="legende-millesimes">
      {millesimes.map((m) => (
        <span key={m} className={m === millesimeCourant ? 'millesime-courant' : undefined}>
          <span className="puce" style={{ background: couleurs.get(m) || '#888' }} />
          {m}{m === millesimeCourant ? ' (courant)' : ''}
        </span>
      ))}
    </div>
  );
}
