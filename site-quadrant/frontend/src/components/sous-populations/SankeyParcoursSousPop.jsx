import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { sankey, sankeyLeft, sankeyLinkHorizontal } from 'd3-sankey';
import { COULEUR_MODALITE_SOUS_POP } from '../../utils/colors.js';
import SliderDuree from './SliderDuree.jsx';

// Onglet « Parcours » de la modale d'analyse fine (Phase 14.5).
//
// Sankey comparatif du devenir de DEUX sous-populations d'une mention, en
// 3 colonnes :
//   col 0 : les 2 sous-populations comparées (selon le critère choisi) ;
//   col 1 : devenir immédiat — Poursuivants / Sortants (nœuds fusionnés) ;
//   col 2 : insertion des sortants — Sal. France / Non salarié / Autres.
//
// Les nœuds des colonnes 1 et 2 sont des TOTAUX (fusionnés), mais les flux
// gardent la couleur de leur sous-population d'origine : pour préserver
// cette couleur à la traversée du nœud « Sortants », on émet des liens
// PARALLÈLES Sortants→col2 (un par sous-population) plutôt qu'un lien
// agrégé — d3-sankey colore chaque lien indépendamment, sans rupture
// visuelle ni nœud invisible.
//
// Périmètre : diplômés français (cohérent avec la référence des autres
// onglets). Seuil : chaque sous-pop doit avoir nb_sortants >= seuil, sinon
// le critère est grisé côté sélecteur (flag API `disponible`).

// Dimensions internes du SVG (viewBox) ; le SVG suit la largeur du conteneur.
const W = 720;
const H = 430;
const PAD = { top: 24, right: 150, bottom: 24, left: 150 };

const GRIS_NOEUD = '#9a9a9a';

const ORDRE_CRITERES = ['genre', 'apprentissage', 'diplomation', 'nationalite'];
const LIBELLE_CRITERE = {
  genre: 'Genre',
  apprentissage: 'Apprentissage',
  diplomation: 'Diplomation',
  nationalite: 'Nationalité',
};

// Nœuds fusionnés des colonnes 1 et 2 (libellés + colonne logique).
const NOEUDS_FUSION = {
  poursuivants: { name: 'Poursuivants',          col: 1 },
  sortants:     { name: 'Sortants',              col: 1 },
  sal_fr:       { name: 'Emploi salarié France', col: 2 },
  non_sal:      { name: 'Emploi non salarié',    col: 2 },
  autres:       { name: 'Autres situations',     col: 2 },
};

// Libellé court d'une modalité pour l'étiquette du nœud de gauche (le
// libellé complet « Apprentis diplômés français » déborderait du SVG ;
// il reste affiché en entier dans la légende et les tooltips).
const LABEL_COURT_MODALITE = {
  femme: 'Femmes',
  homme: 'Hommes',
  apprentissage: 'Apprentis',
  non_apprentissage: 'Non-apprentis',
  diplome: 'Diplômés',
  non_diplome: 'Non-diplômés',
  francais: 'Français',
  etranger: 'Étrangers',
};

// Tournure du pourcentage d'un flux Sortants → insertion (col 2 → col 3) :
// « X % DES <sous-pop> sortant(e)s », accord en genre/nombre selon la
// modalité. Le flux col 1 → col 2 utilise « X % des <libellé sous-pop> »
// (libellé complet en minuscules, construit à la volée).
const PHRASE_SORTANTS = {
  femme: 'des femmes sortantes',
  homme: 'des hommes sortants',
  apprentissage: 'des apprentis sortants',
  non_apprentissage: 'des non-apprentis sortants',
  diplome: 'des diplômés français sortants',
  non_diplome: 'des non-diplômés français sortants',
  francais: 'des diplômés français sortants',
  etranger: 'des diplômés étrangers sortants',
};

// raison_indisponibilite (API) → libellé de modalité pour le tooltip.
const LABEL_MODALITE_RAISON = {
  femmes: 'les femmes',
  hommes: 'les hommes',
  apprentis: 'les apprentis',
  non_apprentis: 'les non-apprentis',
  diplomes: 'les diplômés',
  non_diplomes: 'les non-diplômés',
  francais: 'les Français',
  etrangers: 'les étrangers',
};

function couleurPop(modalite) {
  return COULEUR_MODALITE_SOUS_POP[modalite] || '#888';
}

function messageRaison(raison, seuil) {
  if (!raison) return 'Données indisponibles pour cette mention';
  if (raison === 'sous_population_absente') {
    return 'Données indisponibles pour cette mention';
  }
  const m = raison.match(/^effectif_(.+)_sous_seuil$/);
  if (m) {
    const lbl = LABEL_MODALITE_RAISON[m[1]] || m[1];
    return `Effectif insuffisant pour ${lbl} (N < ${seuil})`;
  }
  return 'Données indisponibles pour cette mention';
}

function fmtN(n) {
  return (n ?? 0).toLocaleString('fr-FR');
}
function fmtPct(part) {
  return `${Math.round(part * 100)} %`;
}

// Ordre vertical figé des colonnes 0 (sous-pop, référence en haut) et 1
// (Poursuivants en haut, Sortants en bas). La colonne 2 (insertion) est
// laissée libre — voir construireGraphe (layout en 2 passes).
const ORDRE_COL1 = { poursuivants: 0, sortants: 1 };

// Construit le graphe d3-sankey à partir des 2 sous-populations du critère.
// Les liens portent { popIdx, couleur, libelleFlux, type, denom, phrasePct }
// pour les tooltips ; les nœuds portent { parts } (décomposition par sous-pop).
//
// Croisements col 2 → col 3 : pour retrouver l'esthétique sankey classique
// (les bandes Femmes/Hommes peuvent se croiser au lieu de rester en
// couloirs), on (1) ordonne les liens par sous-pop d'origine
// (`linkSort` par popIdx) — chaque sous-pop forme une bande contiguë qui
// s'évase ; (2) laisse d3-sankey choisir l'ordre vertical des nœuds
// d'insertion. Comme `nodeSort` est global (fige TOUTES les colonnes), on
// procède en 2 passes : passe 1 en relaxation libre pour récupérer l'ordre
// col 2 minimisant les croisements ; passe 2 en figeant col 0 / col 1 à la
// convention et en réinjectant cet ordre col 2. La couleur reste portée par
// chaque lien (préservée même quand une bande en traverse une autre).
function construireGraphe(pops) {
  const promoTotale = pops.reduce((s, p) => s + (p.nb_etudiants || 0), 0);

  // Décomposition de chaque nœud fusionné par sous-population (ordre pops).
  const parts = {
    poursuivants: pops.map((p) => p.nb_poursuivants || 0),
    sortants:     pops.map((p) => p.nb_sortants || 0),
    sal_fr:       pops.map((p) => p.nb_sortants_emploi_sal_fr || 0),
    non_sal:      pops.map((p) => p.nb_sortants_emploi_non_sal || 0),
    autres:       pops.map((p) => p.nb_sortants_autres || 0),
  };

  const links = [];
  pops.forEach((p, i) => {
    const couleur = couleurPop(p.modalite);
    const nbEtu = p.nb_etudiants || 0;
    const nbSor = p.nb_sortants || 0;
    const phraseDevenir   = `des ${p.libelle.toLowerCase()}`;
    const phraseInsertion = PHRASE_SORTANTS[p.modalite] || `des ${p.libelle.toLowerCase()} sortants`;
    // denom + phrasePct alimentent le % du tooltip :
    //   devenir   (col 0 → col 1) : value / nb_etudiants → « % des <sous-pop> »
    //   insertion (col 1 → col 2) : value / nb_sortants  → « % des <sous-pop> sortant·e·s »
    const ajout = (sourceId, targetId, value, cible, type, denom, phrasePct) => {
      if (value > 0) {
        links.push({
          source: sourceId,
          target: targetId,
          value,
          popIdx: i,
          couleur,
          libelleFlux: `${p.libelle} → ${cible}`,
          type,
          denom,
          phrasePct,
        });
      }
    };
    // col 0 → col 1
    ajout(`pop_${i}`, 'poursuivants', p.nb_poursuivants || 0, 'Poursuivants', 'devenir', nbEtu, phraseDevenir);
    ajout(`pop_${i}`, 'sortants',     p.nb_sortants || 0,     'Sortants',     'devenir', nbEtu, phraseDevenir);
    // col 1 → col 2 (liens parallèles, un par sous-pop, depuis « Sortants »)
    ajout('sortants', 'sal_fr',  p.nb_sortants_emploi_sal_fr || 0,  'Emploi salarié France', 'insertion', nbSor, phraseInsertion);
    ajout('sortants', 'non_sal', p.nb_sortants_emploi_non_sal || 0, 'Emploi non salarié',    'insertion', nbSor, phraseInsertion);
    ajout('sortants', 'autres',  p.nb_sortants_autres || 0,         'Autres situations',     'insertion', nbSor, phraseInsertion);
  });

  // Nœuds réellement référencés par au moins un lien (on n'affiche pas un
  // nœud col 2 vide quand les 2 sous-pop ont 0 sur cette modalité).
  const idsUtilises = new Set();
  links.forEach((l) => { idsUtilises.add(l.source); idsUtilises.add(l.target); });

  const nodes = [];
  pops.forEach((p, i) => {
    if (!idsUtilises.has(`pop_${i}`)) return;
    nodes.push({
      id: `pop_${i}`,
      name: p.libelle,
      labelAffiche: LABEL_COURT_MODALITE[p.modalite] || p.libelle,
      col: 0,
      popIdx: i,
      couleur: couleurPop(p.modalite),
      total: p.nb_etudiants || 0,
      parts: pops.map((_, j) => (j === i ? p.nb_etudiants || 0 : 0)),
      estPop: true,
    });
  });
  Object.entries(NOEUDS_FUSION).forEach(([id, meta]) => {
    if (!idsUtilises.has(id)) return;
    const ps = parts[id] || [0, 0];
    nodes.push({
      id,
      name: meta.name,
      col: meta.col,
      popIdx: null,
      couleur: GRIS_NOEUD,
      total: ps.reduce((s, v) => s + v, 0),
      parts: ps,
      estPop: false,
    });
  });

  // linkSort par sous-pop : bandes contiguës qui s'évasent (≠ regroupées
  // par cible). C'est ce qui autorise les croisements col 2 → col 3.
  const linkSort = (a, b) => a.popIdx - b.popIdx;
  const faireLayout = (nodeSort) => {
    const gen = sankey()
      .nodeId((d) => d.id)
      .nodeAlign(sankeyLeft)
      .nodeWidth(14)
      .nodePadding(20)
      .linkSort(linkSort)
      .extent([[PAD.left, PAD.top], [W - PAD.right, H - PAD.bottom]]);
    if (nodeSort) gen.nodeSort(nodeSort);
    return gen({
      nodes: nodes.map((d) => ({ ...d })),
      links: links.map((d) => ({ ...d })),
    });
  };

  // Passe 1 : relaxation libre → ordre col 2 minimisant les croisements.
  const g1 = faireLayout(undefined);
  const ordreCol2 = {};
  g1.nodes
    .filter((n) => n.col === 2)
    .sort((a, b) => a.y0 - b.y0)
    .forEach((n, idx) => { ordreCol2[n.id] = idx; });

  // Passe 2 : col 0 (référence en haut) + col 1 (Poursuivants en haut) figées,
  // col 2 reprend l'ordre libre de la passe 1.
  const cle = (n) =>
    n.col === 0 ? n.popIdx
      : n.col === 1 ? (ORDRE_COL1[n.id] ?? 0)
        : (ordreCol2[n.id] ?? 0);
  const g2 = faireLayout((a, b) => cle(a) - cle(b));

  return { promoTotale, pops, nodes: g2.nodes, links: g2.links };
}

export default function SankeyParcoursSousPop({
  data,
  dureeCourante,
  durees_disponibles = [],
  onChangerDuree,
  seuilDiffusion = 20,
}) {
  // Choix utilisateur explicite (null tant qu'aucun clic). Le critère
  // réellement affiché est `critereEffectif` ci-dessous, qui retombe sur le
  // premier disponible si ce choix est absent ou devenu indisponible.
  const [critereActif, setCritereActif] = useState(null);
  const [hovered, setHovered] = useState(null);

  // Critère effectif retenu pour l'affichage : le choix utilisateur s'il
  // reste disponible, sinon le premier critère disponible. Dérivé en
  // rendu (et pas seulement via l'effet) pour éviter un flash d'un cadre
  // vide quand un changement de durée rend le critère courant indisponible.
  const critereEffectif =
    critereActif && data?.[critereActif]?.disponible
      ? critereActif
      : (ORDRE_CRITERES.find((c) => data?.[c]?.disponible) || null);

  const blocCritere = critereEffectif ? data?.[critereEffectif] : null;
  const pops = blocCritere?.disponible ? blocCritere.sous_populations : null;

  const graphe = useMemo(
    () => (pops && pops.length === 2 ? construireGraphe(pops) : null),
    [pops]
  );

  // Slider de durée (mécanique identique à l'onglet Comparaison) : snap sur
  // la durée disponible la plus proche, état partagé via onChangerDuree.
  const choisirDuree = useCallback((cible) => {
    if (!onChangerDuree || durees_disponibles.length === 0) return;
    const proche = durees_disponibles.reduce(
      (a, b) => (Math.abs(b - cible) < Math.abs(a - cible) ? b : a),
      durees_disponibles[0]
    );
    onChangerDuree(proche);
  }, [onChangerDuree, durees_disponibles]);

  const handleHoverLink = useCallback((lien, event) => {
    setHovered({ kind: 'link', lien, x: event.clientX, y: event.clientY });
  }, []);
  const handleHoverNode = useCallback((noeud, promoTotale, popsLoc, event) => {
    setHovered({ kind: 'node', noeud, promoTotale, pops: popsLoc, x: event.clientX, y: event.clientY });
  }, []);
  const handleLeave = useCallback(() => setHovered(null), []);

  const aucunDispo = !!data && !ORDRE_CRITERES.some((c) => data?.[c]?.disponible);

  return (
    <section className="sankey-parcours">
      <div className="sankey-controles">
        <div className="sankey-criteres" role="group" aria-label="Critère de comparaison">
          <span className="sankey-criteres-label">Comparer selon :</span>
          {ORDRE_CRITERES.map((c) => {
            const dispo = !!data?.[c]?.disponible;
            const actif = c === critereEffectif;
            const titre = dispo
              ? undefined
              : messageRaison(data?.[c]?.raison_indisponibilite, seuilDiffusion);
            return (
              <button
                key={c}
                type="button"
                className={'sankey-critere-btn' + (actif ? ' sankey-critere-btn--actif' : '')}
                disabled={!dispo}
                title={titre}
                aria-pressed={actif}
                onClick={() => dispo && setCritereActif(c)}
              >
                {LIBELLE_CRITERE[c]}
              </button>
            );
          })}
        </div>

        {durees_disponibles.length > 1 && (
          <div className="sankey-duree">
            <SliderDuree
              durees={durees_disponibles}
              valeur={dureeCourante}
              onChanger={choisirDuree}
              idBase="sankey-duree"
            />
          </div>
        )}
      </div>

      {aucunDispo && (
        <div className="fr-alert fr-alert--info sankey-message">
          <p>
            Aucune comparaison de sous-population disponible pour cette mention
            avec les effectifs requis (≥ {seuilDiffusion} sortants par
            sous-population).
          </p>
        </div>
      )}

      {!aucunDispo && graphe && (
        <>
          <svg
            className="sankey-svg"
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`Parcours comparé — observation à ${dureeCourante} mois`}
          >
            {/* Liens (flux) */}
            <g className="sankey-liens">
              {graphe.links.map((l, i) => (
                <path
                  key={i}
                  d={sankeyLinkHorizontal()(l)}
                  fill="none"
                  stroke={l.couleur}
                  strokeOpacity={hovered?.kind === 'link' && hovered.lien === l ? 0.75 : 0.42}
                  strokeWidth={Math.max(1, l.width)}
                  onMouseMove={(e) => handleHoverLink(l, e)}
                  onMouseEnter={(e) => handleHoverLink(l, e)}
                  onMouseLeave={handleLeave}
                  style={{ cursor: 'pointer' }}
                />
              ))}
            </g>

            {/* Nœuds */}
            <g className="sankey-noeuds">
              {graphe.nodes.map((n) => {
                const h = Math.max(1, n.y1 - n.y0);
                const ancreFin = n.col === 0; // pop : libellé à gauche du nœud
                return (
                  <g key={n.id}>
                    <rect
                      x={n.x0}
                      y={n.y0}
                      width={n.x1 - n.x0}
                      height={h}
                      fill={n.couleur}
                      fillOpacity={n.estPop ? 0.85 : 0.55}
                      stroke={n.couleur}
                      strokeOpacity={0.9}
                      onMouseMove={(e) => handleHoverNode(n, graphe.promoTotale, graphe.pops, e)}
                      onMouseEnter={(e) => handleHoverNode(n, graphe.promoTotale, graphe.pops, e)}
                      onMouseLeave={handleLeave}
                      style={{ cursor: 'pointer' }}
                    />
                    <text
                      className="sankey-noeud-label"
                      x={ancreFin ? n.x0 - 8 : n.x1 + 8}
                      y={(n.y0 + n.y1) / 2}
                      textAnchor={ancreFin ? 'end' : 'start'}
                      dominantBaseline="middle"
                    >
                      <tspan>{n.estPop ? n.labelAffiche : n.name}</tspan>
                      <tspan className="sankey-noeud-n" dx="6">{fmtN(n.total)}</tspan>
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Légende discrète : les 2 sous-populations comparées */}
          <div className="sankey-legende">
            {graphe.pops.map((p) => (
              <span key={p.modalite} className="sankey-legende-item">
                <span className="puce" style={{ background: couleurPop(p.modalite) }} />
                {p.libelle} (N = {fmtN(p.nb_etudiants)})
              </span>
            ))}
          </div>
        </>
      )}

      {hovered && <TooltipSankey hovered={hovered} />}
    </section>
  );
}

// Tooltip en portail (document.body, position:fixed, z-index 10000) —
// même mécanique que le tooltip de segment du tableau (Phase 14.3),
// immune au scroll du panneau d'onglet.
function TooltipSankey({ hovered }) {
  let contenu;
  if (hovered.kind === 'link') {
    const l = hovered.lien;
    // % = effectif du flux / dénominateur de la sous-pop SOURCE
    //   devenir   → nb_etudiants (taux dans la sous-pop)
    //   insertion → nb_sortants  (taux parmi les sortant·e·s)
    const pct = l.denom > 0 ? l.value / l.denom : 0;
    contenu = (
      <>
        <div className="libelle">{l.libelleFlux}</div>
        <div>{fmtN(l.value)} personnes ({fmtPct(pct)} {l.phrasePct})</div>
      </>
    );
  } else {
    const n = hovered.noeud;
    const { promoTotale, pops } = hovered;
    const pctPromo = promoTotale > 0 ? n.total / promoTotale : 0;
    contenu = (
      <>
        <div className="libelle">{n.name}</div>
        <div>{fmtN(n.total)} personnes ({fmtPct(pctPromo)} de la promotion comparée)</div>
        {!n.estPop && (
          <div className="sankey-tooltip-detail">
            {pops.map((p, i) => {
              const v = n.parts[i] || 0;
              const part = n.total > 0 ? v / n.total : 0;
              return (
                <div key={p.modalite}>
                  <span className="tooltip-pastille" style={{ background: couleurPop(p.modalite) }} />
                  {fmtN(v)} {p.libelle.toLowerCase()} ({fmtPct(part)})
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }
  return createPortal(
    <div
      className="quadrant-tooltip"
      style={{
        position: 'fixed',
        left: `${hovered.x + 12}px`,
        top: `${hovered.y + 12}px`,
        zIndex: 10000,
      }}
    >
      {contenu}
    </div>,
    document.body
  );
}
