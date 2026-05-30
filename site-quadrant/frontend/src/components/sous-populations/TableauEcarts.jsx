import { useState } from 'react';

// Section 2 de la modale d'analyse fine (Phase 14) : tableau de
// comparaison des sous-populations à la référence (diplômés français).
//
// Colonnes structurelles fixes (Sous-population, Effectif, Taux de
// poursuivants — indépendant de la durée). Colonnes d'insertion (emploi
// salarié FR / non salarié / stable) animées : elles se mettent à jour
// à chaque tick de durée via la prop `bloc` (donnees_par_duree[durée]).

const COLONNES_EMPLOI = [
  { cle: 'taux_emploi_sal_fr',  ecart: 'ecart_taux_emploi_sal_fr',  libelle: 'Taux emploi sal. FR' },
  { cle: 'taux_emploi_non_sal', ecart: 'ecart_taux_emploi_non_sal', libelle: 'Taux emploi non sal.' },
  { cle: 'taux_emploi_stable',  ecart: 'ecart_taux_emploi_stable',  libelle: 'Taux emploi stable' },
];

function formatPct(taux) {
  if (taux == null) return 'n.s.';
  return `${(taux * 100).toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`;
}

function formatEcart(ecart) {
  const pts = ecart * 100;
  const signe = pts > 0 ? '+' : pts < 0 ? '−' : '';
  const abs = Math.abs(pts).toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${signe}${abs} pts`;
}

// Classe de couleur de l'écart selon les seuils du cadrage.
function bucketEcart(ecart) {
  const pts = ecart * 100;
  if (pts >= 5)  return 'vert-fonce';
  if (pts >= 2)  return 'vert-clair';
  if (pts > -2)  return 'neutre';
  if (pts > -5)  return 'rouge-clair';
  return 'rouge-fonce';
}

// Cellule de taux : valeur + écart coloré (sauf référence). « n.s. » si
// la valeur est masquée (sous le seuil).
function CelluleTaux({ taux, ecart, estReference }) {
  if (taux == null) {
    return <td className="cellule-taux cellule-ns">n.s.</td>;
  }
  if (estReference) {
    return <td className="cellule-taux cellule-reference">{formatPct(taux)}</td>;
  }
  const bucket = ecart != null ? bucketEcart(ecart) : 'neutre';
  const afficheBarre = ecart != null && Math.abs(ecart * 100) >= 2;
  const largeur = ecart != null
    ? Math.min(Math.abs(ecart * 100), 20) / 20 * 100
    : 0;
  return (
    <td className="cellule-taux">
      <span className="cellule-taux-valeur">{formatPct(taux)}</span>
      {ecart != null && (
        <span className={`cellule-ecart cellule-ecart--${bucket}`}>
          {afficheBarre && (
            <span
              className="cellule-ecart-barre"
              style={{ width: `${largeur}%` }}
            />
          )}
          <span className="cellule-ecart-texte">{formatEcart(ecart)}</span>
        </span>
      )}
    </td>
  );
}

function CelluleEffectif({ nb, present }) {
  if (!present || nb == null) return <td className="cellule-effectif">—</td>;
  return <td className="cellule-effectif">{nb.toLocaleString('fr-FR')}</td>;
}

export default function TableauEcarts({ bloc, dureeCourante }) {
  const [croisementsSimples, setCroisementsSimples] = useState(false);

  if (!bloc) return null;
  const reference = bloc.reference;
  let sousPops = bloc.sous_populations || [];
  if (croisementsSimples) {
    sousPops = sousPops.filter((sp) => !sp.croisement);
  }

  return (
    <section className="tableau-ecarts">
      <div className="tableau-ecarts-entete">
        <h3>Comparaison à la référence (diplômés français)</h3>
        <span className="tableau-ecarts-duree">
          Observation à {dureeCourante} mois après la sortie
        </span>
      </div>

      <div className="fr-checkbox-group fr-checkbox-group--sm tableau-ecarts-toggle">
        <input
          type="checkbox"
          id="tableau-ecarts-simples"
          checked={croisementsSimples}
          onChange={(e) => setCroisementsSimples(e.target.checked)}
        />
        <label className="fr-label" htmlFor="tableau-ecarts-simples">
          Afficher uniquement les croisements simples
        </label>
      </div>

      <div className="tableau-ecarts-scroll">
        <table className="fr-table tableau-ecarts-table">
          <thead>
            <tr>
              <th scope="col">Sous-population</th>
              <th scope="col">Effectif</th>
              {COLONNES_EMPLOI.map((c) => (
                <th key={c.cle} scope="col">{c.libelle}</th>
              ))}
              <th scope="col">Taux de poursuivants</th>
            </tr>
          </thead>
          <tbody>
            {/* Référence — grisée, sans écart */}
            {reference && (
              <tr className="ligne-reference">
                <th scope="row">Diplômés français (référence)</th>
                <CelluleEffectif nb={reference.nb_etudiants} present />
                {COLONNES_EMPLOI.map((c) => (
                  <CelluleTaux key={c.cle} taux={reference[c.cle]} estReference />
                ))}
                <CelluleTaux taux={reference.taux_poursuivants} estReference />
              </tr>
            )}

            {sousPops.map((sp) => (
              <tr key={sp.id} className={sp.croisement ? 'ligne-croisement' : undefined}>
                <th scope="row">{sp.libelle}</th>
                <CelluleEffectif nb={sp.nb_etudiants} present={sp.present} />
                {COLONNES_EMPLOI.map((c) => (
                  <CelluleTaux
                    key={c.cle}
                    taux={sp[c.cle]}
                    ecart={sp[c.ecart]}
                  />
                ))}
                <CelluleTaux
                  taux={sp.taux_poursuivants}
                  ecart={sp.ecart_taux_poursuivants}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
