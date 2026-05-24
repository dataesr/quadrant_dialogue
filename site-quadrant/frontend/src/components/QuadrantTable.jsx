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

// Pour chaque raison API, donne le statut à afficher dans la cellule
// X et la cellule Y de la ligne « mention non représentée ». L'API
// expose en plus, pour chaque axe dont la donnée est diffusable, les
// champs `x`/`y`, `denom_x`/`denom_y`, `population_x`/`population_y`
// — la cellule rend alors la valeur (via CellulePourcentage) plutôt
// qu'un statut texte.
//
// Conventions :
//   - 'pas_de_donnee' : ligne absente en base pour cet axe.
//   - 'non_diffusable' : ligne présente mais denom < SEUIL_DIFFUSION.
//   - 'valeur'         : l'axe a une donnée diffusable — on s'appuie
//                         sur la présence des champs `x`/`denom_x`,
//                         pas sur la raison.
const STATUT_PAR_RAISON = {
  pas_de_matching:                 { x: 'pas_de_donnee',  y: 'pas_de_donnee'  },
  pas_de_donnee_var1:              { x: 'pas_de_donnee',  y: 'valeur'         },
  pas_de_donnee_var2:              { x: 'valeur',         y: 'pas_de_donnee'  },
  denom_var1_et_var2_insuffisants: { x: 'non_diffusable', y: 'non_diffusable' },
  denom_var1_insuffisant:          { x: 'non_diffusable', y: 'valeur'         },
  denom_var2_insuffisant:          { x: 'valeur',         y: 'non_diffusable' },
};

const LIBELLE_STATUT = {
  pas_de_donnee:  'Pas de donnée',
  non_diffusable: 'Non diffusable',
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
    // Tri par distance euclidienne au point idéal (1, 1) croissante :
    // la mention la mieux placée sur les DEUX axes remonte en tête.
    // Dans le cadran haut-droite, ça met en avant la combinaison
    // réussite × insertion la plus forte. Dans les autres cadrans le
    // tri reste cohérent — plus proche du haut-droite = mieux — sans
    // préjuger d'une hiérarchie métier entre cadrans (un « taux de
    // poursuite faible » n'est pas forcément « moins bon »).
    for (const k of ORDRE_CADRANS) {
      g[k].sort((a, b) => distanceAuPointIdeal(a) - distanceAuPointIdeal(b));
    }
    return g;
  }, [data]);

  // Mentions non représentées triées par libellé (stable, lisible).
  const mentionsNonRepresentees = useMemo(() => {
    const list = data?.mentions_non_representees || [];
    return [...list].sort(
      (a, b) => (a.libelle || '').localeCompare(b.libelle || '', 'fr')
    );
  }, [data]);

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
          <div className="fr-table fr-table--bordered">
            <table>
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
          </div>
        </section>
      ))}

      {/* Mentions non représentées — vue=mentions uniquement. L'API
          expose ce champ dans /quadrant ; chaque entrée porte la raison
          + éventuellement la valeur diffusable d'un des axes (cf.
          calculerMentionsNonRepresentees dans quadrant.php). */}
      {vue === 'mentions' && (
        <section className="tableau-cadran">
          <h3>Mentions non représentées</h3>
          {mentionsNonRepresentees.length === 0 ? (
            <p className="fr-text--sm" style={{ color: '#555' }}>
              Aucune mention non représentée pour cette combinaison de filtres.
            </p>
          ) : (
            <div className="fr-table fr-table--bordered">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Mention</th>
                    <th scope="col">{libelleX}</th>
                    <th scope="col">{libelleY}</th>
                  </tr>
                </thead>
                <tbody>
                  {mentionsNonRepresentees.map((m) => (
                    <tr key={m.diplom}>
                      <th scope="row">{m.libelle || m.diplom}</th>
                      <CelluleMentionNonRep mention={m} axe="x" />
                      <CelluleMentionNonRep mention={m} axe="y" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// Format d'une cellule de taux. Trois cas :
//   - denom absent ou < 5 : « Non diffusable » (italique gris, une
//     seule ligne). Cas théoriquement filtré par l'API
//     (Diffusion::forme) — défensif.
//   - 5 ≤ denom ≤ 19 : 2 lignes (taux + effectif) sur fond pastel pour
//     signaler la donnée fragile.
//   - denom ≥ 20 : 2 lignes (taux + effectif) sans fond particulier.
//
// La présentation à 2 lignes met le taux en évidence (gros + gras) et
// renvoie l'effectif en discret (gris, plus petit), pour faciliter le
// scan colonne par colonne sans pour autant masquer la base de calcul.
function CellulePourcentage({ taux, denom, population }) {
  if (typeof denom !== 'number' || denom < 5) {
    return <td className="cellule-non-diffusable">Non diffusable</td>;
  }
  const fragile = denom >= 5 && denom <= 19;
  const className = 'cellule-valeur' + (fragile ? ' cellule-fragile' : '');
  const pourcent = (taux * 100).toFixed(1).replace('.', ',');
  return (
    <td className={className}>
      <div className="valeur-percent">{pourcent} %</div>
      <div className="valeur-population">
        sur {denom}{population ? ` ${population}` : ''}
      </div>
    </td>
  );
}

// Rend une cellule X ou Y pour une mention non représentée. Trois cas
// possibles selon la raison API et la présence des champs de valeur :
//   - 'valeur'         : l'axe a une donnée diffusable (denom >= 5) →
//                         on rend avec CellulePourcentage, comme pour
//                         les bulles du tableau principal.
//   - 'non_diffusable' : denom < 5 → italique gris.
//   - 'pas_de_donnee'  : pas de ligne en base pour cet axe → idem.
function CelluleMentionNonRep({ mention, axe }) {
  const statut = STATUT_PAR_RAISON[mention.raison]?.[axe];

  if (statut === 'valeur') {
    return (
      <CellulePourcentage
        taux={mention[axe]}
        denom={mention[`denom_${axe}`]}
        population={mention[`population_${axe}`]}
      />
    );
  }
  return (
    <td className="cellule-non-diffusable">
      {LIBELLE_STATUT[statut] || '—'}
    </td>
  );
}

// Distance euclidienne au coin (1, 1) du quadrant — point « 100 % × 100 % ».
// Sert au tri intra-cadran : plus une bulle est proche de l'idéal, plus elle
// remonte en tête.
function distanceAuPointIdeal(b) {
  const dx = 1 - b.x;
  const dy = 1 - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function formatLibelle(variable, dateInser) {
  if (!variable) return '';
  if (!dateInser) return variable;
  return `${variable} (${dateInser} mois)`;
}
