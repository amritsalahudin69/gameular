import { memo, useMemo } from 'react';
import { useGameStore } from './Store';
import './Minimap.css';

const gridPosition = (position, rows, cols) => {
  if (!position) return null;
  const x = position.gx ?? position.x + (cols - 1) / 2;
  const z = position.gz ?? position.z + (rows - 1) / 2;
  if (!Number.isInteger(x) || !Number.isInteger(z) || x < 0 || z < 0 || x >= cols || z >= rows) return null;
  return { x: x + 0.5, y: z + 0.5 };
};

export default memo(function Minimap() {
  const maze = useGameStore((s) => s.mazeMatrix);
  const playerPosition = useGameStore((s) => s.playerPosition);
  const foodPosition = useGameStore((s) => s.foodPosition);
  const enemies = useGameStore((s) => s.enemyPositions);
  const rows = maze?.length ?? 0;
  const cols = maze?.[0]?.length ?? 0;
  const walls = useMemo(() => (maze ?? []).flatMap((row, z) => (
    row.flatMap((cell, x) => cell === 1 ? [`M${x} ${z}h1v1h-1z`] : [])
  )).join(''), [maze]);
  if (!rows || !cols) return null;
  const player = gridPosition(playerPosition, rows, cols);
  const food = gridPosition(foodPosition, rows, cols);
  return (
    <aside className="minimap" aria-label="Arena minimap">
      <svg viewBox={`0 0 ${cols} ${rows}`} role="img" aria-label="Maze, player, food, and enemies">
        <title>{`Entire ${cols} by ${rows} arena`}</title>
        <rect width={cols} height={rows} fill="#0b181e" />
        <path data-minimap-walls d={walls} fill="#73918c" shapeRendering="crispEdges" />
        {food && <path data-minimap-marker="food" transform={`translate(${food.x} ${food.y})`}
          d="M0 -1.1L1.1 0 0 1.1 -1.1 0Z" fill="#fde047" stroke="#121b20" strokeWidth="0.25" />}
        {(enemies ?? []).map((enemy) => {
          const point = gridPosition(enemy, rows, cols);
          return point && <rect key={enemy.id} data-minimap-marker="enemy" data-enemy-id={enemy.id}
            x={point.x - 0.7} y={point.y - 0.7} width="1.4" height="1.4"
            fill="#fb7185" stroke="#121b20" strokeWidth="0.2" />;
        })}
        {player && <circle data-minimap-marker="player" cx={player.x} cy={player.y} r="0.9"
          fill="#22d3ee" stroke="#fff" strokeWidth="0.35" />}
      </svg>
      <div className="minimap-legend" aria-hidden="true">
        <span><i className="minimap-player" />You</span>
        <span><i className="minimap-food" />Food</span>
        <span><i className="minimap-enemy" />Enemy</span>
      </div>
    </aside>
  );
});
