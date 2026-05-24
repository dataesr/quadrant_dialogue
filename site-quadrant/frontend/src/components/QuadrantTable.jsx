import { useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useQuadrant } from '../hooks/useQuadrant.js';

// Vue alternative au quadrant SVG : présente les mêmes données sous
// forme de tableaux regroupés par cadran (haut-droite / haut-gauche /
// bas-droite / bas-gauche), définis par rapport aux lignes de
// référence (médiane ou moyenne) renvoyées par l'API.
//
// Source : un fetch dédié via useQuadrant — le double fetch avec
// <Quadrant> (quand l'utilisateur a déjà chargé l'autre vue dans la
// session) est acceptable à ce stade : useQuadrant gère son propre
// cycle de vie + cancellation, le payload est petit, et factoriser
// au niveau AppContext pour partager le résultat est une optimisation
// pour plus tard.
//
// Mentions non représentées (vue=mentions uniquement) : l'API les
// expose déjà dans la réponse de /quadrant via le champ
// `mentions_non_representees` (cf. quadrant.php §8). Pas besoin
// d'endpoint supplémentaire — on consomme ce champ tel quel.

const ORDRE_CADRANS = ['haut_droite', 'haut_gauche', 'bas_droite', 'bas_gauche'];

const LIBELLES_CADRANS = {
  haut_droite: 'Haut-droite',
  haut_gauche: 'Haut-gauche',
  bas_droite:  'Bas-droite',
  bas_gauche:  'Bas-gauche',
};

// Adjectifs servant à former la sémantique du cadran (« X élevé × Y
// faible », etc.). Volontairement neutres — on ne préjuge pas du sens
// métier (un « taux de poursuite faible » n'est pas forcément « moins
// bon »).
const SEMANTIQUE = {
  haut_droite: { x: 'élevé',  y: 'élevé'  },
  haut_gauche: { x: 'faible', y: 'élevé'  },
  bas_droite:  { x: 'élevé',  y: 'faible' },
  bas_gauche:  { x: 'faible', y: 'faible' },
};

// Mapping des raisons API → libellé court affiché dans le tableau
// « Mentions non représentées ». L'API distingue 6 raisons fines, ici
// agrégées en 2 statuts métier (cf. cadrage : seuil de diffusion vs
// absence de donnée).
const STATUT_RAISON = {
  pas_de_matching:                 'Pas de donnée',
  pas_de_donnee_var1:              'Pas de donnée',
  pas_de_donnee_var2:              'Pas de donnée',
  denom_var1_et_var2_insuffisants: 'Non diffusable',
  denom_var1_insuffisant:          'Non diffusable',
  denom_var2_insuffisant:          'Non diffusable',
};

export default function QuadrantTable() {
  const {
    cursus, vue, millesime,
    variableX, variableY, dateInserX, dateInserY,
    etabContexte,
    domaine, discipline, secteur, mention, typeMaster,
    representativite, ligneReference,
  } = useApp();

  const { loading, data, error } = useQuadrant({
    cursus, vue, millesime,
    variableX, variableY, dateInserX, dateInserY,
    etabContexte,
    domaine, discipline, secteur, mention, typeMaster,
    representativite, ligneReference,
  });

  const libelleX = formatLibelle(variableX, dateInserX);
  const libelleY = formatLibelle(variableY, dateInserY);
  const entiteHeader = vue === 'mentions' ? 'Mention' : 'Établissement';

  // Bulles détaillables, groupées par cadran. La référence (médiane ou
  // moyenne) vient du backend pour rester cohérente avec le quadrant
  // graphique — pas de recalcul côté front.
  const groupes = useMemo(() => {
    if (!data || !data.reference) return {};
    const bulles = (data.bulles || []).filter((b) => b.details_accessibles);
    const ref = data.reference;
    const g = { haut_droite: [], haut_gauche: [], bas_droite: [], bas_gauche: [] };
    for (const b of bulles) {
      const cadran =
        b.x >= ref.x && b.y >= ref.y ? 'haut_droite' :
        b.x <  ref.x && b.y >= ref.y ? 'haut_gauche' :
        b.x >= ref.x && b.y <  ref.y ? 'bas_droite'  :
                                       'bas_gauche';
      g[cadran].push(b);
    }
    // Tri par libellé pour parcours stable et lisible.
    for (const k of ORDRE_CADRANS) {
      g[k].sort((a, b) => (a.libelle || '').localeCompare(b.libelle || '', 'fr'));
    }
    return g;
  }, [data]);

  const mentionsNonRepresentees = data?.mentions_non_representees || [];

  if (loading) {
    return (
      <div className="fr-alert fr-alert--info">
        <p>Chargement du tableau…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="fr-alert fr-alert--error" role="alert">
        <p>{error}</p>
      </div>
    );
  }
  if (!data) return null;

  const cadransNonVides = ORDRE_CADRANS.filter((k) => (groupes[k] || []).length > 0);
  const totalBulles = cadransNonVides.reduce((s, k) => s + groupes[k].length, 0);

  return (
    <div className="quadrant-tableaux">
      {totalBulles === 0 && (
        <div className="fr-alert fr-alert--info">
          <p>{data.info || 'Aucune donnée à afficher dans le tableau.'}</p>
        </div>
      )}

      {cadransNonVides.map((cadran) => (
        <section key={cadran} className="tableau-cadran">
          <h3>
            {LIBELLES_CADRANS[cadran]} — {libelleX} {SEMANTIQUE[cadran].x}
            {' × '}
            {libelleY} {SEMANTIQUE[cadran].y}
          </h3>
          <table className="fr-table">
            <thead>
              <tr>
                <th scope="col">{entiteHeader}</th>
                <th scope="col">{libelleX}</th>
                <th scope="col">{libelleY}</th>
              </tr>
            </thead>
            <tbody>
              {groupes[cadran].map((b) => (
                <tr key={b.id}>
                  <th scope="row">{b.libelle || '—'}</th>
                  <CellulePourcentage
                    taux={b.x}
                    denom={b.denom_x}
                    population={b.population_x}
                  />
                  <CellulePourcentage
                    taux={b.y}
                    denom={b.denom_y}
                    population={b.population_y}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {/* Mentions non représentées — vue=mentions uniquement. L'API
          renvoie ce champ dans la réponse de /quadrant, donc pas
          d'endpoint supplémentaire à appeler. */}
      {vue === 'mentions' && (
        <section className="tableau-cadran">
          <h3>Mentions non représentées</h3>
          {mentionsNonRepresentees.length === 0 ? (
            <p className="fr-text--sm" style={{ color: '#555' }}>
              Aucune mention non représentée pour cette combinaison de filtres.
            </p>
          ) : (
            <table className="fr-table">
              <thead>
                <tr>
                  <th scope="col">Mention</th>
                  <th scope="col">Statut</th>
                </tr>
              </thead>
              <tbody>
                {mentionsNonRepresentees.map((m) => (
                  <tr key={m.diplom}>
                    <th scope="row">{m.libelle || m.diplom}</th>
                    <td className="cellule-non-diffusable">
                      {STATUT_RAISON[m.raison] || m.raison}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

// Format d'une cellule de taux. Trois cas :
//   - denom absent ou < 5 : « Non diffusable » (italique gris). Cas
//     théoriquement filtré par l'API (Diffusion::forme) — défensif.
//   - 5 ≤ denom ≤ 19 : fond pastel pour signaler la donnée fragile.
//   - denom ≥ 20 : présentation neutre.
function CellulePourcentage({ taux, denom, population }) {
  if (typeof denom !== 'number' || denom < 5) {
    return <td className="cellule-non-diffusable">Non diffusable</td>;
  }
  const fragile = denom >= 5 && denom <= 19;
  const pourcent = (taux * 100).toFixed(1).replace('.', ',');
  const sur = population ? `sur ${denom} ${population}` : `sur ${denom}`;
  return (
    <td className={fragile ? 'cellule-fragile' : undefined}>
      {pourcent} % {sur}
    </td>
  );
}

function formatLibelle(variable, dateInser) {
  if (!variable) return '';
  if (!dateInser) return variable;
  return `${variable} (${dateInser} mois)`;
}
