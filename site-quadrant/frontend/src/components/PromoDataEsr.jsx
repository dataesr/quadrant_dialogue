// Bloc de promotion #dataESR injecté dans les loaders pour valoriser
// les temps d'attente longs (vue Positionnement, /serie-temporelle).
// Apparaît en fade-in 1 s APRÈS le loader (qui apparaît lui-même à
// 350 ms via useDelayedLoading) — donc visible seulement sur les
// chargements > 1,35 s en pratique. Au-dessous, l'utilisateur a déjà
// les données et ne voit pas la promo.
//
// Contraste visuel #dataESR caractéristique de la marque : `#data` en
// gras (700), `ESR` en light (300) — c'est la « signature »
// graphique du service, distincte des en-têtes de service DSFR
// (`fr-header__service-title`) qui auraient un sens trop fort dans
// ce contexte d'attente.
//
// Lien cliquable sur tout le bloc (cible plus large que juste l'URL)
// avec `target="_blank"` + `rel="noopener noreferrer"` — l'iframe ne
// piège pas le nouvel onglet, il s'ouvre au niveau du navigateur.

const URL_DATA_ESR = 'https://data.esr.gouv.fr';

export default function PromoDataEsr() {
  return (
    <a
      href={URL_DATA_ESR}
      target="_blank"
      rel="noopener noreferrer"
      className="promo-data-esr"
      aria-label="#dataESR, la plateforme de données ouverte de l’ESR — data.esr.gouv.fr, ouvre dans une nouvelle fenêtre"
    >
      <span className="promo-data-esr-marque">
        <strong className="promo-data-esr-data">#data</strong>
        <span className="promo-data-esr-esr">ESR</span>
      </span>
      <span className="promo-data-esr-baseline">
        La plateforme de données ouverte de l’ESR
      </span>
      <span className="promo-data-esr-url">data.esr.gouv.fr</span>
    </a>
  );
}
