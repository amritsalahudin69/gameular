import { create } from 'zustand';

const FOOD_Y = 0.4;
export const MERGE_FEEDBACK_MS = 420;
const HIGH_SCORE_KEY = 'maze_snake_high_score';
const SKIN_KEY = 'maze_snake_skin';

const readNumber = (key, fallback = 0) => {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
};

const readString = (key, fallback = '') => {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) || fallback;
};

const writeStorage = (key, value) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, String(value));
};

// Arena dimensions (must be odd to keep a centered origin)
const ARENA_COLS = 41;
const ARENA_ROWS = 29;
const MAX_ENEMIES = 20;

export const SKIN_PRESETS = {
  classic: {
    label: 'Classic',
    headShape: 'sphere',
    headColor: '#7dd3fc',
    bodyColor: '#22d3ee',
    accent: '#bae6fd',
  },
  blocky: {
    label: 'Blocky',
    headShape: 'box',
    headColor: '#f97316',
    bodyColor: '#fb923c',
    accent: '#ffedd5',
  },
  crystal: {
    label: 'Crystal',
    headShape: 'gem',
    headColor: '#c084fc',
    bodyColor: '#a78bfa',
    accent: '#ddd6fe',
  },
};

const skinKeys = Object.keys(SKIN_PRESETS);
const defaultSkin = readString(SKIN_KEY, skinKeys[0]);
const initialSkin = skinKeys.includes(defaultSkin) ? defaultSkin : skinKeys[0];

// Level configs control wall density (0..10)
const LEVEL_CONFIGS = {
  0: { wallDensity: 0.0, label: 'Open Field' },
  1: { wallDensity: 0.08, label: 'Very Easy' },
  2: { wallDensity: 0.12, label: 'Easy' },
  3: { wallDensity: 0.16, label: 'Light Maze' },
  4: { wallDensity: 0.20, label: 'Normal' },
  5: { wallDensity: 0.24, label: 'Medium' },
  6: { wallDensity: 0.28, label: 'Hard' },
  7: { wallDensity: 0.32, label: 'Very Hard' },
  8: { wallDensity: 0.36, label: 'Dense Maze' },
  9: { wallDensity: 0.40, label: 'Expert' },
  10: { wallDensity: 0.45, label: 'Insane' },
};

const generateMaze = (level = 2, startValue = 1) => {
  // Use explicit arena dimensions instead of legacy MAZE_MATRIX
  const rows = ARENA_ROWS;
  const cols = ARENA_COLS;
  const density = (LEVEL_CONFIGS[level] && LEVEL_CONFIGS[level].wallDensity) ?? 0.2;
  const maze = Array.from({ length: rows }, (_, z) =>
    Array.from({ length: cols }, (_, x) => (z === 0 || z === rows - 1 || x === 0 || x === cols - 1 ? 1 : 0)),
  );

  for (let z = 1; z < rows - 1; z += 1) {
    for (let x = 1; x < cols - 1; x += 1) {
      if (Math.random() < density) maze[z][x] = 1;
    }
  }

  // Ensure a deterministic clear corridor around center so snake can spawn safely and have a forward path
  const cx = Math.floor(cols / 2);
  const cz = Math.floor(rows / 2);
  const backDepth = Math.max(0, (Math.floor(Number(startValue) || 1) - 1));
  const zStart = Math.max(1, cz - backDepth);
  const zEnd = Math.min(rows - 2, cz + 5);
  for (let gz = zStart; gz <= zEnd; gz += 1) {
    for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
      if (gz > 0 && gz < rows - 1 && gx > 0 && gx < cols - 1) maze[gz][gx] = 0;
    }
  }

  // Connectivity check: simple BFS from center; if not enough reachable cells, remove some walls and retry a few times
  const bfsCount = (m) => {
    const visited = new Set();
    const startKey = `${cz},${cx}`;
    if (m[cz][cx] === 1) return 0;
    const q = [[cz, cx]];
    visited.add(startKey);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (q.length) {
      const [rz, rx] = q.shift();
      for (const [dz, dx] of dirs) {
        const nz = rz + dz;
        const nx = rx + dx;
        const key = `${nz},${nx}`;
        if (nz >= 1 && nz < rows - 1 && nx >= 1 && nx < cols - 1 && m[nz][nx] === 0 && !visited.has(key)) {
          visited.add(key);
          q.push([nz, nx]);
        }
      }
    }
    return visited.size;
  };

  const minReachable = Math.max(6, Math.floor((rows - 2) * (cols - 2) * (1 - density) * 0.35));
  let attempts = 0;
  while (bfsCount(maze) < minReachable && attempts < 8) {
    // remove a few random walls
    for (let i = 0; i < Math.max(1, Math.floor((rows * cols) * 0.02)); i += 1) {
      const rx = Math.floor(1 + Math.random() * (cols - 2));
      const rz = Math.floor(1 + Math.random() * (rows - 2));
      maze[rz][rx] = 0;
    }
    attempts += 1;
  }

  return maze;
};

const gridToWorld = (x, z) => {
  // Use arena constants for coordinate origin so world center remains at (0,0)
  const cols = ARENA_COLS;
  const rows = ARENA_ROWS;
  const ox = (cols - 1) / 2;
  const oz = (rows - 1) / 2;
  return { x: x - ox, y: FOOD_Y, z: z - oz, gx: x, gz: z };
};

const getWalkableFromMatrix = (matrix) => {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const ox = (cols - 1) / 2;
  const oz = (rows - 1) / 2;
  const cells = [];
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (matrix[z][x] === 0) cells.push({ x: x - ox, y: FOOD_Y, z: z - oz, gx: x, gz: z });
    }
  }
  return cells;
};

const positionKey = (position) => (position ? `${position.gx},${position.gz}` : null);

const normalizeEnemyCount = (value) => {
  if (value === undefined || value === null || value === '') return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0, Math.min(MAX_ENEMIES, Math.floor(parsed)));
};

const pickRandomFood = (matrix, playerPosition = null, blockedPositions = []) => {
  // Defensive checks
  if (!matrix || !matrix.length || !matrix[0]) return null;
  const rows = matrix.length;
  const cols = matrix[0].length;
  const ox = (cols - 1) / 2;
  const oz = (rows - 1) / 2;

  // Determine reachable cells from the player's authoritative position.
  const headGX = playerPosition
    ? Math.round((playerPosition.gx ?? playerPosition.x + ox))
    : Math.floor(cols / 2);
  const headGZ = playerPosition
    ? Math.round((playerPosition.gz ?? playerPosition.z + oz))
    : Math.floor(rows / 2);

  // BFS to collect reachable walkable cells (orthogonal neighbors only)
  const inBounds = (gx, gz) => gx >= 0 && gz >= 0 && gx < cols && gz < rows;
  const key = (gx, gz) => `${gx},${gz}`;
  const visited = new Set();
  const q = [];
  if (inBounds(headGX, headGZ) && matrix[headGZ][headGX] === 0) {
    q.push([headGX, headGZ]);
    visited.add(key(headGX, headGZ));
  }
  const reachable = [];
  while (q.length) {
    const [gx, gz] = q.shift();
    reachable.push({ gx, gz });
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = gx + dx;
      const nz = gz + dz;
      const k = key(nx, nz);
      if (!inBounds(nx, nz)) continue;
      if (visited.has(k)) continue;
      if (matrix[nz][nx] !== 0) continue;
      visited.add(k);
      q.push([nx, nz]);
    }
  }

  // The only occupied gameplay cell is the player's current cell.
  const playerKey = key(headGX, headGZ);
  const blockedKeys = new Set((Array.isArray(blockedPositions) ? blockedPositions : [blockedPositions])
    .filter(Boolean)
    .map(positionKey));
  const candidates = reachable.filter((c) => {
    const cellKey = key(c.gx, c.gz);
    return cellKey !== playerKey && !blockedKeys.has(cellKey);
  });

  if (!candidates.length) {
    // no valid cell reachable and unoccupied
    return null;
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const world = { x: pick.gx - ox, y: FOOD_Y, z: pick.gz - oz, gx: pick.gx, gz: pick.gz };
  return world;
};

const pickEnemySpawns = (matrix, count, playerPosition, foodPosition) => {
  const ox = (matrix[0].length - 1) / 2;
  const oz = (matrix.length - 1) / 2;
  const playerGX = Math.round(playerPosition.gx ?? playerPosition.x + ox);
  const playerGZ = Math.round(playerPosition.gz ?? playerPosition.z + oz);
  const cells = getWalkableFromMatrix(matrix).filter((cell) => {
    const samePlayer = cell.gx === playerGX && cell.gz === playerGZ;
    const sameFood = foodPosition && cell.gx === foodPosition.gx && cell.gz === foodPosition.gz;
    return !samePlayer && !sameFood;
  });
  if (!cells.length || count <= 0) return [];

  const distant = cells.filter((cell) => (
    Math.abs(cell.gx - playerGX) + Math.abs(cell.gz - playerGZ) >= 6
  ));
  const available = [...(distant.length ? distant : cells)];
  const selected = [];
  while (selected.length < count && available.length) {
    const pool = selected.length < distant.length ? available.filter((cell) => (
      Math.abs(cell.gx - playerGX) + Math.abs(cell.gz - playerGZ) >= 6
    )) : available;
    const source = pool.length ? pool : available;
    const pickIndex = Math.floor(Math.random() * source.length);
    const pick = source[pickIndex];
    selected.push({
      id: `enemy-${selected.length}`,
      x: pick.x,
      y: pick.y,
      z: pick.z,
      gx: pick.gx,
      gz: pick.gz,
    });
    const availableIndex = available.indexOf(pick);
    available.splice(availableIndex, 1);
  }
  return selected;
};

// initial level
const initialLevel = 2;

const INITIAL_PLAYER_POSITION = { x: 0, y: 0.5, z: 0 };

// deterministic level config (Iteration 6) — imported file
import level1 from './snakeLevel1.json';
const DEFAULT_LEVEL_CONFIG = level1 || { id: 'snake-level-1', startValue: 1, foods: [3,2,1,4,2,3,1,2,4,1] };
const initialLevelConfig = DEFAULT_LEVEL_CONFIG;

// initial maze depends on initial level config startValue
const initialMaze = generateMaze(initialLevel, (initialLevelConfig && initialLevelConfig.startValue) || 1);
const initialEnemyCount = normalizeEnemyCount(initialLevelConfig && initialLevelConfig.enemyCount);
const initialFoodPosition = pickRandomFood(initialMaze, INITIAL_PLAYER_POSITION);
const initialEnemyPositions = pickEnemySpawns(initialMaze, initialEnemyCount, INITIAL_PLAYER_POSITION, initialFoodPosition);

export const useGameStore = create((set) => ({
  // authoritative numeric value represented by the head Numberblock; initial from level config
  currentValue: (initialLevelConfig && initialLevelConfig.startValue) || 1,
  playerPosition: { ...INITIAL_PLAYER_POSITION },
  score: 0,
  elapsedTime: 0,
  highScore: readNumber(HIGH_SCORE_KEY, 0),
  gameState: 'idle',
  currentLevel: initialLevel,
  mazeMatrix: initialMaze,
  // level/session deterministic config
  levelConfig: initialLevelConfig,
  currentFoodIndex: 0,
  currentFoodValue: (initialLevelConfig && initialLevelConfig.foods && initialLevelConfig.foods[0]) || null,
  foodPosition: initialFoodPosition,
  enemyPositions: initialEnemyPositions,
  enemyActive: true,
  mergeFeedback: null,
  selectedSkin: initialSkin,

  setGameState: (gameState) => set({ gameState }),

  startGame: () =>
    set((state) => {
      const startValue = (state.levelConfig && state.levelConfig.startValue) || 1;
      return {
        gameState: 'playing',
        score: 0,
        elapsedTime: 0,
        playerPosition: { ...INITIAL_PLAYER_POSITION },
        currentValue: startValue,
        // reset deterministic sequence
        currentFoodIndex: 0,
        currentFoodValue: (state.levelConfig && state.levelConfig.foods && state.levelConfig.foods[0]) || null,
        ...(() => {
          const matrix = state.mazeMatrix || initialMaze;
          const count = normalizeEnemyCount(state.levelConfig && state.levelConfig.enemyCount);
          const nextFood = pickRandomFood(matrix, INITIAL_PLAYER_POSITION);
          return {
            foodPosition: nextFood,
            enemyPositions: pickEnemySpawns(matrix, count, INITIAL_PLAYER_POSITION, nextFood),
            enemyActive: true,
          };
        })(),
        mergeFeedback: null,
      };
    }),


  gameOver: () =>
    set((state) => {
      if (state.gameState === 'gameover') return state;
      const best = Math.max(state.highScore, state.score);
      if (best !== state.highScore) writeStorage(HIGH_SCORE_KEY, best);

      return {
        gameState: 'gameover',
        highScore: best,
        enemyActive: false,
        mergeFeedback: null,
      };
    }),

  setElapsedTime: (elapsedTime) =>
    set((state) => {
      if (state.gameState !== 'playing') return state;
      return { elapsedTime };
    }),

  syncPlayerPosition: (playerPosition) => set({ playerPosition }),
  syncEnemyPosition: (id, enemyPosition) => set((state) => ({
    enemyPositions: state.enemyPositions.map((enemy) => (
      enemy.id === id ? enemyPosition : enemy
    )),
  })),

  beginFoodMerge: () =>
    set((state) => {
      if (state.gameState !== 'playing' || state.mergeFeedback) return state;
      const nextScore = state.score + 1;
      const best = Math.max(state.highScore, nextScore);
      if (best !== state.highScore) writeStorage(HIGH_SCORE_KEY, best);

      // eaten food value
      const eatenValue = typeof state.currentFoodValue === 'number' ? state.currentFoodValue : 0;

      // compute new currentValue as accumulated numeric head value
      const current = typeof state.currentValue === 'number' ? state.currentValue : ((state.levelConfig && state.levelConfig.startValue) || 1);
      const result = current + eatenValue;

      // Advance deterministic food sequence
      const level = state.levelConfig || initialLevelConfig;
      const foods = (level && level.foods) || [];
      const nextIndex = (typeof state.currentFoodIndex === 'number' ? state.currentFoodIndex : 0) + 1;

      return {
        score: nextScore,
        highScore: best,
        foodPosition: null,
        mergeFeedback: {
          result,
          nextIndex,
          nextFoodValue: nextIndex < foods.length ? foods[nextIndex] : null,
        },
      };
    }),

  finishFoodMerge: () =>
    set((state) => {
      const feedback = state.mergeFeedback;
      if (!feedback) return state;

      if (feedback.nextIndex < ((state.levelConfig && state.levelConfig.foods) || []).length) {
        return {
          currentValue: feedback.result,
          foodPosition: pickRandomFood(state.mazeMatrix, state.playerPosition, state.enemyPositions),
          currentFoodIndex: feedback.nextIndex,
          currentFoodValue: feedback.nextFoodValue,
          mergeFeedback: null,
          gameState: 'playing',
          enemyActive: true,
        };
      }

      // No more configured foods — session complete after feedback finishes.
      return {
        currentValue: feedback.result,
        foodPosition: null,
        gameState: 'complete',
        enemyActive: false,
        mergeFeedback: null,
      };
    }),

  setLevel: (level) => set((state) => {
      const lvl = Math.max(0, Math.min(10, Number(level)));
      const cfg = state.levelConfig || initialLevelConfig;
      const startValue = (cfg && cfg.startValue) || 1;
      const m = generateMaze(lvl, startValue);
      const nextFood = pickRandomFood(m, INITIAL_PLAYER_POSITION);
      const count = normalizeEnemyCount(cfg && cfg.enemyCount);
      return {
        currentLevel: lvl,
        mazeMatrix: m,
        playerPosition: { ...INITIAL_PLAYER_POSITION },
        currentValue: startValue,
        foodPosition: nextFood,
        enemyPositions: pickEnemySpawns(m, count, INITIAL_PLAYER_POSITION, nextFood),
        enemyActive: true,
        mergeFeedback: null,
        gameState: 'idle',
        score: 0,
        elapsedTime: 0,
      };
    }),

  setSkin: (skinKey) =>
    set((state) => {
      if (!SKIN_PRESETS[skinKey] || state.selectedSkin === skinKey) return state;
      writeStorage(SKIN_KEY, skinKey);
      return { selectedSkin: skinKey };
    }),

  regenerateMaze: () => set((state) => {
    const cfg = state.levelConfig || initialLevelConfig;
    const startValue = (cfg && cfg.startValue) || 1;
    const m = generateMaze(state.currentLevel, startValue);
    const nextFood = pickRandomFood(m, INITIAL_PLAYER_POSITION);
    const count = normalizeEnemyCount(cfg && cfg.enemyCount);
    return {
      mazeMatrix: m,
      playerPosition: { ...INITIAL_PLAYER_POSITION },
      currentValue: startValue,
      currentFoodIndex: 0,
      currentFoodValue: (cfg && cfg.foods && cfg.foods[0]) || null,
      foodPosition: nextFood,
      enemyPositions: pickEnemySpawns(m, count, INITIAL_PLAYER_POSITION, nextFood),
      enemyActive: true,
      mergeFeedback: null,
      gameState: 'idle',
      score: 0,
      elapsedTime: 0,
    };
  }),
}));
