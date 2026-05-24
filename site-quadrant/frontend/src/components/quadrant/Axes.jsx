import { MARGIN, PLOT_WIDTH, PLOT_HEIGHT, WIDTH, HEIGHT } from './geometry.js';

// Axes + grille + titres d'axes. Pas d'interaction, juste du SVG statique.
//
// Reçoit les scales en props pour pouvoir afficher des graduations
// adaptées au domaine courant lorsque le zoom est appliqué. Quand le
// zoom n'a pas eu lieu, le domaine reste [0, 100] et on retombe sur les
// graduations 0/25/50/75/100 classiques.
//
// Stratégie ticks : on demande à la scale ses propres ticks via la
// méthode .ticks(n). En zoom = 1, la scale [0, 100] répartit 5 ticks à
// 0/25/50/75/100 — exactement le comportement attendu. En zoom > 1, le
// domaine se réduit et d3 propose des découpages adaptés (par exemple
// 30/40/50/60/70).

export default function Axes({ xScale, yScale, libelleX, libelleY }) {
  const xTicks = xScale.ticks(5);
  const yTicks = yScale.ticks(5);

  return (
    <g className="quadrant-axes">
      {/* Cadre extérieur du plot */}
      <rect
        x={MARGIN.left}
        y={MARGIN.top}
        width={PLOT_WIDTH}
        height={PLOT_HEIGHT}
        fill="none"
        stroke="#888"
        strokeWidth={1}
      />

      {/* Grille intérieure (toutes les graduations, sauf celles qui
          tombent pile sur les bords pour éviter de doubler le cadre). */}
      {xTicks.map((t) => {
        const x = xScale(t);
        if (Math.abs(x - MARGIN.left) < 0.5) return null;
        if (Math.abs(x - (MARGIN.left + PLOT_WIDTH)) < 0.5) return null;
        return (
          <line
            key={`gx-${t}`}
            x1={x} x2={x}
            y1={MARGIN.top} y2={MARGIN.top + PLOT_HEIGHT}
            stroke="#ddd" strokeWidth={1}
          />
        );
      })}
      {yTicks.map((t) => {
        const y = yScale(t);
        if (Math.abs(y - MARGIN.top) < 0.5) return null;
        if (Math.abs(y - (MARGIN.top + PLOT_HEIGHT)) < 0.5) return null;
        return (
          <line
            key={`gy-${t}`}
            x1={MARGIN.left} x2={MARGIN.left + PLOT_WIDTH}
            y1={y} y2={y}
            stroke="#ddd" strokeWidth={1}
          />
        );
      })}

      {/* Graduations + libellés axe X (sous le cadre) */}
      {xTicks.map((t) => (
        <g key={`tx-${t}`}>
          <line
            x1={xScale(t)} x2={xScale(t)}
            y1={MARGIN.top + PLOT_HEIGHT}
            y2={MARGIN.top + PLOT_HEIGHT + 4}
            stroke="#888" strokeWidth={1}
          />
          <text
            x={xScale(t)}
            y={MARGIN.top + PLOT_HEIGHT + 16}
            textAnchor="middle"
            fontSize={11}
            fill="#444"
          >
            {formatTick(t)}%
          </text>
        </g>
      ))}

      {/* Graduations + libellés axe Y (à gauche du cadre) */}
      {yTicks.map((t) => (
        <g key={`ty-${t}`}>
          <line
            x1={MARGIN.left - 4} x2={MARGIN.left}
            y1={yScale(t)}       y2={yScale(t)}
            stroke="#888" strokeWidth={1}
          />
          <text
            x={MARGIN.left - 8}
            y={yScale(t)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={11}
            fill="#444"
          >
            {formatTick(t)}%
          </text>
        </g>
      ))}

      {/* Titre axe X — centré sous l'axe */}
      {libelleX && (
        <text
          x={MARGIN.left + PLOT_WIDTH / 2}
          y={HEIGHT - 10}
          textAnchor="middle"
          fontSize={13}
          fontWeight={500}
          fill="#222"
        >
          {libelleX}
        </text>
      )}

      {/* Titre axe Y — tourné -90°, centré sur la hauteur de l'axe */}
      {libelleY && (
        <text
          x={0}
          y={0}
          textAnchor="middle"
          fontSize={13}
          fontWeight={500}
          fill="#222"
          transform={`translate(14, ${MARGIN.top + PLOT_HEIGHT / 2}) rotate(-90)`}
        >
          {libelleY}
        </text>
      )}
    </g>
  );
}

// Affiche un entier quand le tick l'est, sinon une décimale (utile en
// zoom élevé où les ticks tombent sur des valeurs fractionnaires).
function formatTick(t) {
  return Number.isInteger(t) ? t : t.toFixed(1);
}
