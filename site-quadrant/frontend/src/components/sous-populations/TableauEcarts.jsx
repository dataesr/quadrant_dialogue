import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAutoPlacement } from '../../utils/useAutoPlacement.js';
import { COULEUR_CRITERE_SOUS_POP } from '../../utils/colors.js';

// Section « Comparaison » (Phase 14.1/14.2) : tableau des sous-populations
// vs la référence (diplômés français), REGROUPÉ par impact. Chaque groupe
// ouvre sur une ligne titre puis une barre de répartition (composition de
// la promo sur ce critère), suivie des sous-populations.
//
// Les barres sont dérivées des effectifs présents dans `bloc`
// (nb_etudiants exposés même sous le seuil). Les couleurs reprennent
// celles des bulles du mini-quadrant (COULEUR_CRITERE_SOUS_POP) pour la
// cohérence visuelle entre onglets : modalité de référence en couleur
// saturée, modalité complémentaire en version claire.

const COLONNES_EMPLOI = [
  { cle: 'taux_emploi_sal_fr',  ecart: 'ecart_taux_emploi_sal_fr',  libelle: 'Taux emploi sal. FR' },
  { cle: 'taux_emploi_non_sal', ecart: 'ecart_taux_emploi_non_sal', libelle: 'Taux emploi non sal.' },
  { cle: 'taux_emploi_stable',  ecart: 'ecart_taux_emploi_stable',  libelle: 'Taux emploi stable' },
];

const NB_COLONNES = 2 + COLONNES_EMPLOI.length + 1;

// Groupes par impact : titre, critère (→ couleur), sous-populations.
const GROUPES = [
  { key: 'genre',       critere: 'genre',       titre: 'Impact du genre',           sousPops: ['femmes', 'hommes'] },
  { key: 'regime',      critere: 'regime',      titre: "Impact de l'apprentissage", sousPops: ['apprentis', 'femmes_apprenties', 'hommes_apprentis'] },
  { key: 'diplomation', critere: 'diplomation', titre: 'Impact de la diplomation',  sousPops: ['ensemble_diplomation'] },
  { key: 'nationalite', critere: 'nationalite', titre: 'Impact de la nationalité',  sousPops: ['tous_nationalite'] },
];

// Nuance de chaque modalité : « fonce » = couleur saturée (modalité de
// référence / standard de comparaison), « clair » = version translucide.
const NUANCE = {
  femmes: 'clair', hommes: 'fonce',
  apprentis: 'fonce', non_apprentis: 'clair',
  diplomes: 'fonce', non_diplomes: 'clair',
  francais: 'fonce', etrangers: 'clair',
};

function hexToRgba(hex, a) {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
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
    nuance: NUANCE[s.cle] || 'fonce',
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

export default function TableauEcarts({ bloc, dureeCourante, seuil = 20 }) {
  const [croisementsSimples, setCroisementsSimples] = useState(false);
  const [hoveredSeg, setHoveredSeg] = useState(null);

  // Tooltip de segment : coordonnées VIEWPORT (clientX/clientY) +
  // rendu en portail position:fixed → immune au scroll de l'onglet et
  // aux cascades de positionnement (fix du tooltip mal placé, Phase 14.2).
  const handleHoverSeg = useCallback((seg, couleur, event) => {
    setHoveredSeg({ seg, couleur, x: event.clientX, y: event.clientY });
  }, []);
  const handleLeaveSeg = useCallback(() => setHoveredSeg(null), []);

  if (!bloc) return null;
  const reference = bloc.reference;
  const parId = (id) => (bloc.sous_populations || []).find((s) => s.id === id);

  return (
    <section className="tableau-ecarts">
      <div className="tableau-ecarts-entete">
        <h3>Comparaison à la référence (diplômés français)</h3>
        <span className="tableau-ecarts-duree">Observation à {dureeCourante} mois après la sortie</span>
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
                  couleur={COULEUR_CRITERE_SOUS_POP[groupe.critere] || '#888'}
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

function ImpactGroupe({ titre, couleur, segments, sousPops, onHoverSeg, onLeaveSeg }) {
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
              const bg = masque ? undefined : (seg.nuance === 'fonce' ? couleur : hexToRgba(couleur, 0.5));
              const cls = 'repartition-segment'
                + (masque ? ' repartition-segment--masque' : (seg.nuance === 'clair' ? ' repartition-segment--clair' : ''));
              return (
                <span
                  key={seg.cle}
                  className={cls}
                  style={{ width: `${seg.part * 100}%`, background: bg }}
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
      style={{ position: 'fixed', left: `${hovered.x + 12}px`, top: `${hovered.y + 12}px` }}
    >
      <span className="tooltip-pastille" style={{ background: couleur }} />
      {seg.diffusable
        ? `${seg.libelle} : ${formatPctSimple(seg.part)} (N = ${seg.n.toLocaleString('fr-FR')})`
        : `${seg.libelle} : effectif insuffisant pour diffusion`}
    </div>,
    document.body
  );
}
