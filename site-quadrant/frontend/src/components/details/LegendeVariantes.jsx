// Légende horizontale sous un graphique multi-courbes. Une entrée par
// variante (= une courbe), avec sa couleur catégorielle et son libellé
// court (« 6 mois », « 2 ans », « 2 ou 3 ans »…).
//
// HTML plat (pas SVG) — plus simple à wrapper proprement et à styler
// quand l'espace est étroit ou que le panneau scrolle.

export default function LegendeVariantes({ variantes, couleurs }) {
  if (!variantes || variantes.length === 0) return null;
  return (
    <div className="legende-variantes">
      {variantes.map((v) => (
        <span key={v.key}>
          <span className="puce" style={{ background: couleurs.get(v.key) || '#888' }} />
          {v.libelle}
        </span>
      ))}
    </div>
  );
}
