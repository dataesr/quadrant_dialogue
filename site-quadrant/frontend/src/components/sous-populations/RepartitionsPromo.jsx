import { useMemo } from 'react';

// Section 1 de la modale d'analyse fine (Phase 14) : composition de la
// promotion en 4 barres empilées 100 %. Statique (ne dépend pas de la
// durée d'observation).
//
// Données : l'objet `repartitions` renvoyé par
// /api/analyse-sous-populations (proportions 0..1 + liste `_sous_seuil`
// des segments « groupe.segment » sous le seuil de masquage).

// Définition des 4 barres : label, et segments ordonnés (clé dans
// repartitions[groupe], libellé humain, couleur).
const BARRES = [
  {
    groupe: 'genre',
    label: 'Genre (diplômés français)',
    segments: [
      { cle: 'femmes', libelle: 'Femmes', couleur: '#6A6AF4' },
      { cle: 'hommes', libelle: 'Hommes', couleur: '#B0B0F6' },
    ],
  },
  {
    groupe: 'nationalite',
    label: 'Nationalité (diplômés)',
    segments: [
      { cle: 'francais',  libelle: 'Français',  couleur: '#3558A7' },
      { cle: 'etrangers', libelle: 'Étrangers', couleur: '#9BB4DE' },
    ],
  },
  {
    groupe: 'regime',
    label: 'Régime (diplômés français)',
    segments: [
      { cle: 'apprentis',     libelle: 'Apprentis',     couleur: '#D85A30' },
      { cle: 'non_apprentis', libelle: 'Non-apprentis', couleur: '#F0C3AE' },
    ],
  },
  {
    groupe: 'devenir_promo',
    label: 'Devenir de la promotion',
    segments: [
      { cle: 'poursuivants_diplomes',     libelle: 'Poursuivants diplômés',     couleur: '#1D9E75' },
      { cle: 'poursuivants_non_diplomes', libelle: 'Poursuivants non-diplômés', couleur: '#9BD9C4' },
      { cle: 'sortants_diplomes',         libelle: 'Sortants diplômés',         couleur: '#2A7DB0' },
      { cle: 'sortants_non_diplomes',     libelle: 'Sortants non-diplômés',     couleur: '#A9CBE3' },
    ],
  },
];

function formatPct(part) {
  return `${Math.round((part ?? 0) * 100)} %`;
}

export default function RepartitionsPromo({ repartitions }) {
  const sousSeuil = useMemo(
    () => new Set(repartitions?._sous_seuil || []),
    [repartitions]
  );

  if (!repartitions) return null;

  return (
    <section className="repartitions-promo">
      <h3>Composition de la promotion</h3>
      <div className="repartitions-promo-barres">
        {BARRES.map((barre) => {
          const data = repartitions[barre.groupe] || {};
          return (
            <div key={barre.groupe} className="repartition-ligne">
              <span className="repartition-label">{barre.label}</span>
              <div
                className="repartition-barre"
                role="img"
                aria-label={
                  barre.label + ' : ' +
                  barre.segments
                    .map((s) => `${s.libelle} ${formatPct(data[s.cle])}`)
                    .join(', ')
                }
              >
                {barre.segments.map((s) => {
                  const part = data[s.cle] ?? 0;
                  if (part <= 0) return null;
                  const masque = sousSeuil.has(`${barre.groupe}.${s.cle}`);
                  const pct = formatPct(part);
                  const titre = masque
                    ? `${s.libelle} : ${pct} — effectif insuffisant`
                    : `${s.libelle} : ${pct}`;
                  return (
                    <span
                      key={s.cle}
                      className={'repartition-segment' + (masque ? ' repartition-segment--masque' : '')}
                      style={{
                        width: `${part * 100}%`,
                        background: masque ? undefined : s.couleur,
                      }}
                      title={titre}
                    >
                      {part > 0.12 && (
                        <span className="repartition-segment-texte">
                          {s.libelle} {pct}
                        </span>
                      )}
                      {part > 0.05 && part <= 0.12 && (
                        <span className="repartition-segment-texte">{pct}</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
