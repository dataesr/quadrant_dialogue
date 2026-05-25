import { useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useMentionsEtab } from '../hooks/useMentionsEtab.js';
import Combobox from './selectors/Combobox.jsx';

// Filtre Mention de la vue Positionnement. Comportement :
//   - Liste restreinte aux mentions effectivement offertes par
//     l'établissement de référence (cf. useMentionsEtab, qui s'appuie
//     sur /quadrant?vue=mentions). Au lieu des ~170 mentions du
//     cursus listées brutalement, ~50 mentions pertinentes pour un
//     étab de taille moyenne.
//   - Combobox autocomplete avec filtrage par sous-chaîne (insensible
//     à la casse). Navigation clavier, click-outside ferment le panneau.
//   - Entrée « (Toutes les mentions) » en tête de liste — sa sélection
//     efface le filtre (setMention(null)).
//
// Visible en vue Positionnement uniquement (Graphique ET Tableau) :
// le filtre Mention est pris en compte par les deux modes
// d'affichage, donc le combobox doit rester disponible quand on
// bascule en Tableau.

const SENTINEL_TOUS = '';

const TOP_ITEM_TOUTES = {
  id: SENTINEL_TOUS,
  libelle: '(Toutes les mentions)',
};

export default function MentionFilterCombobox() {
  const {
    cursus,
    vue,
    millesime,
    etabContexte,
    variableX, variableY,
    dateInserX, dateInserY,
    mention,
    setMention,
  } = useApp();

  const { mentions, loading } = useMentionsEtab({
    cursus,
    millesime,
    etabContexte,
    variableX, variableY,
    dateInserX, dateInserY,
  });

  // Items pour le combobox : { id: diplom, libelle }. L'ordre est
  // déjà alphabétique côté hook ; le combobox retrie en interne, le
  // résultat est cohérent.
  const items = useMemo(
    () => mentions.map((m) => ({ id: m.diplom, libelle: m.libelle })),
    [mentions]
  );

  if (vue !== 'etablissements') return null;

  const groupDisabled = !etabContexte || loading || items.length === 0;

  return (
    <div className={`fr-select-group${groupDisabled ? ' fr-select-group--disabled' : ''}`}>
      <Combobox
        id="quadrant-mention-filtre"
        label={loading ? 'Mention (chargement…)' : 'Mention'}
        placeholder="Toutes les mentions"
        items={items}
        value={mention || ''}
        onSelect={(id) => setMention(id === SENTINEL_TOUS ? null : id)}
        disabled={groupDisabled}
        topItem={TOP_ITEM_TOUTES}
      />
    </div>
  );
}
