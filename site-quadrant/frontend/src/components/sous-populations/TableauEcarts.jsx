import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAutoPlacement } from '../../utils/useAutoPlacement.js';
import { COULEUR_SEGMENT_SOUS_POP } from '../../utils/colors.js';

// Section « Comparaison » (Phase 14.1/14.2) : tableau des sous-populations
// vs la référence (diplômés français), REGROUPÉ par impact. Chaque groupe
// ouvre sur une ligne titre puis une barre de répartition (composition de
// la promo sur ce critère), suivie des sous-populations.
//
// Les barres sont dérivées des effectifs présents dans `bloc`
// (nb_etudiants exposés même sous le seuil). Chaque segment prend la
// couleur de SA modalité (COULEUR_SEGMENT_SOUS_POP) — identique à la
// couleur de la bulle correspondante dans le mini-quadrant (Phase 14.4),
// pour la cohérence visuelle entre les deux onglets.

const COLONNES_EMPLOI = [
  { cle: 'taux_emploi_sal_fr',  ecart: 'ecart_taux_emploi_sal_fr',  libelle: 'Taux emploi sal. FR' },
  { cle: 'taux_emploi_non_sal', ecart: 'ecart_taux_emploi_non_sal', libelle: 'Taux emploi non sal.' },
  { cle: 'taux_emploi_stable',  ecart: 'ecart_taux_emploi_stable',  libelle: 'Taux emploi stable' },
];

const NB_COLONNES = 2 + COLONNES_EMPLOI.length + 1;

// Intitulés de colonnes, réutilisés pour le rappel d'en-tête au début de
// chaque rubrique d'impact (Phase 14.3 — remplace le thead sticky, peu
// robuste en iframe).
const ENTETE_COLONNES = [
  'Sous-population', 'Effectif',
  ...COLONNES_EMPLOI.map((c) => c.libelle),
  'Taux de poursuivants',
];

// Groupes par impact : titre, critère (→ couleur), sous-populations.
const GROUPES = [
  { key: 'genre',       critere: 'genre',       titre: 'Impact du genre',           sousPops: ['femmes', 'hommes'] },
  { key: 'regime',      critere: 'regime',      titre: "Impact de l'apprentissage", sousPops: ['apprentis', 'femmes_apprenties', 'hommes_apprentis'] },
  { key: 'diplomation', critere: 'diplomation', titre: 'Impact de la diplomation',  sousPops: ['ensemble_diplomation'] },
  { key: 'nationalite', critere: 'nationalite', titre: 'Impact de la nationalité',  sousPops: ['tous_nationalite'] },
];

// Couleur d'un segment de barre par MODALITÉ (Phase 14.4) — identique à
// la couleur de la bulle correspondante dans le mini-quadrant.
function couleurSegment(cle) {
  return COULEUR_SEGMENT_SOUS_POP[cle] || '#888';
}

// Texte clair ou sombre selon la luminance du fond (les nuances claires
// type #E8987A demandent un texte sombre pour rester lisibles).
function texteContraste(hex) {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#222' : '#fff';
}

function formatPct(taux) {
  if (taux == null) return 'n.s.';
  return `${(taux * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}
function formatPctSimple(part) {
  return `${(part * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}
function formatEcart(ecart) {
  const pts = ecart * 100;
  const signe = pts > 0 ? '+' : pts < 0 ? '−' : '';
  const abs = Math.abs(pts).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${signe}${abs} pts`;
}
function bucketEcart(ecart) {
  const pts = ecart * 100;
  if (pts >= 5)  return 'vert-fonce';
  if (pts >= 2)  return 'vert-clair';
  if (pts > -2)  return 'neutre';
  if (pts > -5)  return 'rouge-clair';
  return 'rouge-fonce';
}

// Construit les segments d'une barre de répartition pour un groupe.
function construireBarre(groupeKey, bloc, seuil) {
  const ref = bloc.reference;
  const get = (id) => (bloc.sous_populations || []).find((s) => s.id === id);
  const nb = (sp) => (sp && sp.nb_etudiants != null ? sp.nb_etudiants : 0);

  let base = 0;
  let segs = [];
  if (groupeKey === 'genre') {
    const nf = nb(get('femmes'));
    const nh = nb(get('hommes'));
    base = nf + nh;
    segs = [{ cle: 'femmes', libelle: 'Femmes', n: nf }, { cle: 'hommes', libelle: 'Hommes', n: nh }];
  } else if (groupeKey === 'regime') {
    const na = nb(get('apprentis'));
    base = nb(ref);
    segs = [{ cle: 'apprentis', libelle: 'Apprentis', n: na }, { cle: 'non_apprentis', libelle: 'Non-apprentis', n: Math.max(0, base - na) }];
  } else if (groupeKey === 'diplomation') {
    const nDip = nb(ref);
    base = nb(get('ensemble_diplomation'));
    segs = [{ cle: 'diplomes', libelle: 'Diplômés', n: nDip }, { cle: 'non_diplomes', libelle: 'Non-diplômés', n: Math.max(0, base - nDip) }];
  } else if (groupeKey === 'nationalite') {
    const nFr = nb(ref);
    base = nb(get('tous_nationalite'));
    segs = [{ cle: 'francais', libelle: 'Français', n: nFr }, { cle: 'etrangers', libelle: 'Étrangers', n: Math.max(0, base - nFr) }];
  }

  return segs.map((s) => ({
    ...s,
    part: base > 0 ? s.n / base : 0,
    diffusable: s.n >= seuil,
  }));
}

function CelluleTaux({ taux, ecart, estReference }) {
  if (taux == null) return <td className="cellule-taux cellule-ns">n.s.</td>;
  if (estReference) return <td className="cellule-taux cellule-reference">{formatPct(taux)}</td>;
  const bucket = ecart != null ? bucketEcart(ecart) : 'neutre';
  const afficheBarre = ecart != null && Math.abs(ecart * 100) >= 2;
  const largeur = ecart != null ? Math.min(Math.abs(ecart * 100), 20) / 20 * 100 : 0;
  return (
    <td className="cellule-taux">
      <span className="cellule-taux-valeur">{formatPct(taux)}</span>
      {ecart != null && (
        <span className={`cellule-ecart cellule-ecart--${bucket}`}>
          {afficheBarre && <span className="cellule-ecart-barre" style={{ width: `${largeur}%` }} />}
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

function LigneSousPop({ sp }) {
  return (
    <tr className={sp.croisement ? 'ligne-croisement' : undefined}>
      <th scope="row">{sp.libelle}</th>
      <CelluleEffectif nb={sp.nb_etudiants} present={sp.present} />
      {COLONNES_EMPLOI.map((c) => (
        <CelluleTaux key={c.cle} taux={sp[c.cle]} ecart={sp[c.ecart]} />
      ))}
      <CelluleTaux taux={sp.taux_poursuivants} ecart={sp.ecart_taux_poursuivants} />
    </tr>
  );
}

export default function TableauEcarts({
  bloc,
  dureeCourante,
  durees = [],
  onChangerDuree,
  seuil = 20,
}) {
  const [croisementsSimples, setCroisementsSimples] = useState(false);
  const [hoveredSeg, setHoveredSeg] = useState(null);

  // Tooltip de segment : coordonnées VIEWPORT (clientX/clientY) +
  // rendu en portail position:fixed → immune au scroll de l'onglet et
  // aux cascades de positionnement (fix du tooltip mal placé, Phase 14.2).
  const handleHoverSeg = useCallback((seg, couleur, event) => {
    setHoveredSeg({ seg, couleur, x: event.clientX, y: event.clientY });
  }, []);
  const handleLeaveSeg = useCallback(() => setHoveredSeg(null), []);

  // Slider de durée (Phase 14.3) : snap sur la durée disponible la plus
  // proche. État partagé avec le mini-quadrant via onChangerDuree.
  const choisirDuree = useCallback((cible) => {
    if (!onChangerDuree || durees.length === 0) return;
    const proche = durees.reduce(
      (a, b) => (Math.abs(b - cible) < Math.abs(a - cible) ? b : a),
      durees[0]
    );
    onChangerDuree(proche);
  }, [onChangerDuree, durees]);

  if (!bloc) return null;
  const reference = bloc.reference;
  const parId = (id) => (bloc.sous_populations || []).find((s) => s.id === id);

  return (
    <section className="tableau-ecarts">
      <div className="tableau-ecarts-entete">
        <h3>Comparaison à la référence (diplômés français)</h3>
      </div>

      <div className="tableau-ecarts-barre-controles">
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

        <div className="tableau-ecarts-duree-select">
          <span className="tableau-ecarts-duree-label">
            Observation à : {dureeCourante} mois
          </span>
          {durees.length > 1 && (
            <>
              <input
                type="range"
                className="modale-asp-slider tableau-ecarts-duree-range"
                min={durees[0]}
                max={durees[durees.length - 1]}
                step={1}
                value={dureeCourante ?? durees[0]}
                onChange={(e) => choisirDuree(parseInt(e.target.value, 10))}
                aria-label="Durée d'observation"
              />
              <div className="modale-asp-ticks">
                {durees.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={'tick' + (d === dureeCourante ? ' actif' : '')}
                    onClick={() => choisirDuree(d)}
                  >{d}</button>
                ))}
              </div>
            </>
          )}
        </div>
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

            {GROUPES.map((groupe) => {
              const segments = construireBarre(groupe.key, bloc, seuil);
              let sousPops = groupe.sousPops.map(parId).filter(Boolean);
              if (croisementsSimples) sousPops = sousPops.filter((sp) => !sp.croisement);
              return (
                <ImpactGroupe
                  key={groupe.key}
                  titre={groupe.titre}
                  segments={segments}
                  sousPops={sousPops}
                  onHoverSeg={handleHoverSeg}
                  onLeaveSeg={handleLeaveSeg}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {hoveredSeg && <TooltipSegment hovered={hoveredSeg} />}
    </section>
  );
}

// Rappel de l'en-tête de colonnes, posé au début de chaque rubrique
// d'impact. aria-hidden : le vrai <thead> en haut suffit aux lecteurs
// d'écran (navigation par <th scope="col">) ; ces rappels sont une aide
// visuelle redondante.
function LigneRappelEntete() {
  return (
    <tr className="ligne-rappel-entete" aria-hidden="true">
      {ENTETE_COLONNES.map((lbl, i) => (
        <td key={i}>{lbl}</td>
      ))}
    </tr>
  );
}

function ImpactGroupe({ titre, segments, sousPops, onHoverSeg, onLeaveSeg }) {
  return (
    <>
      <tr className="ligne-impact">
        <th scope="colgroup" colSpan={NB_COLONNES}>{titre}</th>
      </tr>
      <tr className="ligne-barre-repartition">
        <td colSpan={NB_COLONNES}>
          <div className="repartition-barre repartition-barre--table">
            {segments.map((seg) => {
              if (seg.part <= 0 && seg.n <= 0) return null;
              const masque = !seg.diffusable;
              const pct = Math.round(seg.part * 100);
              const couleur = couleurSegment(seg.cle);
              const bg = masque ? undefined : couleur;
              const textColor = masque ? undefined : texteContraste(couleur);
              const cls = 'repartition-segment' + (masque ? ' repartition-segment--masque' : '');
              return (
                <span
                  key={seg.cle}
                  className={cls}
                  style={{ width: `${seg.part * 100}%`, background: bg, color: textColor }}
                  onMouseMove={(e) => onHoverSeg(seg, couleur, e)}
                  onMouseEnter={(e) => onHoverSeg(seg, couleur, e)}
                  onMouseLeave={onLeaveSeg}
                >
                  {seg.part > 0.15 && (
                    <span className="repartition-segment-texte">{seg.libelle} {pct} %</span>
                  )}
                </span>
              );
            })}
          </div>
        </td>
      </tr>
      <LigneRappelEntete />
      {sousPops.map((sp) => (
        <LigneSousPop key={sp.id} sp={sp} />
      ))}
    </>
  );
}

// Tooltip de segment — rendu en portail (document.body) avec
// position:fixed et coordonnées viewport : pas d'ancrage à un parent
// positionné, donc plus de décalage lié au scroll de l'onglet.
function TooltipSegment({ hovered }) {
  const ref = useAutoPlacement([hovered]);
  const { seg, couleur } = hovered;
  return createPortal(
    <div
      ref={ref}
      className="quadrant-tooltip"
      style={{
        position: 'fixed',
        left: `${hovered.x + 12}px`,
        top: `${hovered.y + 12}px`,
        // Portail dans document.body → doit repasser AU-DESSUS de
        // l'overlay de la modale (z-index 200). 10000 par sécurité.
        zIndex: 10000,
      }}
    >
      <span className="tooltip-pastille" style={{ background: couleur }} />
      {seg.diffusable
        ? `${seg.libelle} : ${formatPctSimple(seg.part)} (N = ${seg.n.toLocaleString('fr-FR')})`
        : `${seg.libelle} : effectif insuffisant pour diffusion`}
    </div>,
    document.body
  );
}
