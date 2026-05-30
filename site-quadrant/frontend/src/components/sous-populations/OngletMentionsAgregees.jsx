// Onglet « Mentions agrégées » (Phase 14.8) — visible uniquement en mode
// établissement avec ≥ 2 mentions. Liste informative (aucune interaction)
// des mentions effectivement agrégées dans l'analyse.
//
// Tri alphabétique avec accents corrects : localeCompare('fr', base) classe
// « ÉCONOMIE » entre « DROIT » et « ÉLECTRONIQUE » (et non en fin de liste).

export default function OngletMentionsAgregees({ mentions = [] }) {
  const triees = [...mentions].sort((a, b) =>
    (a.libelle_intitule || '').localeCompare(b.libelle_intitule || '', 'fr', { sensitivity: 'base' })
  );

  return (
    <section className="onglet-mentions-agregees">
      <h3>{triees.length} mentions agrégées</h3>
      <ul className="liste-mentions-agregees">
        {triees.map((m) => (
          <li key={m.diplom}>{m.libelle_intitule}</li>
        ))}
      </ul>
    </section>
  );
}
