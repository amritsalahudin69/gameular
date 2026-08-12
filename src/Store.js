import { create } from 'zustand';

const FOOD_Y = 0.4;
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

const generateMaze = (level = 2) => {
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

  // Ensure a small clear area around center so snake can spawn safely
  const cx = Math.floor(cols / 2);
  const cz = Math.floor(rows / 2);
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const rz = cz + dz;
      const rx = cx + dx;
      if (rz > 0 && rz < rows - 1 && rx > 0 && rx < cols - 1) maze[rz][rx] = 0;
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

const pickRandomFood = (matrix, snakeSegments = []) => {
  // Defensive checks
  if (!matrix || !matrix.length || !matrix[0]) return null;
  const rows = matrix.length;
  const cols = matrix[0].length;
  const ox = (cols - 1) / 2;
  const oz = (rows - 1) / 2;

  // convert snake segments (world) to occupied grid keys
  const snakeSet = new Set((snakeSegments || []).map((s) => {
    const gx = Math.round((s.gx ?? Math.round(s.x + ox)));
    const gz = Math.round((s.gz ?? Math.round(s.z + oz)));
    return `${gx},${gz}`;
  }));

  // Determine head position as BFS start (use first snake segment if present)
  const head = (snakeSegments && snakeSegments[0]) || null;
  const headGX = head ? Math.round((head.gx ?? Math.round(head.x + ox))) : Math.floor(cols / 2);
  const headGZ = head ? Math.round((head.gz ?? Math.round(head.z + oz))) : Math.floor(rows / 2);

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

  // From reachable cells exclude snake-occupied cells
  const candidates = reachable.filter((c) => !snakeSet.has(key(c.gx, c.gz)));

  if (!candidates.length) {
    // no valid cell reachable and unoccupied
    return null;
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const world = { x: pick.gx - ox, y: FOOD_Y, z: pick.gz - oz, gx: pick.gx, gz: pick.gz };
  return world;
};

// initial level and maze
const initialLevel = 2;
const initialMaze = generateMaze(initialLevel);

// helper to build initial snake segments from a startValue (head + bodies behind)
const buildInitialSnake = (startValue) => {
  const n = Math.max(1, Math.floor(Number(startValue) || 1));
  const segs = [];
  for (let i = 0; i < n; i += 1) {
    // head at index 0, bodies follow with increasing negative Z
    segs.push({ x: 0, y: 0.5, z: -i });
  }
  return segs;
};

// deterministic level config (Iteration 6) — imported file
import level1 from './snakeLevel1.json';
const DEFAULT_LEVEL_CONFIG = level1 || { id: 'snake-level-1', startValue: 1, foods: [3,2,1,4,2,3,1,2,4,1] };
const initialLevelConfig = DEFAULT_LEVEL_CONFIG;

// helper to convert world snake segments to grid keys
const snakeToGridSet = (segments, matrix) => {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const ox = (cols - 1) / 2;
  const oz = (rows - 1) / 2;
  return new Set((segments || []).map(s => `${Math.round(s.x + ox)},${Math.round(s.z + oz)}`));
};

export const useGameStore = create((set) => ({
  // authoritative numeric value represented by the head Numberblock; initial from level config
  currentValue: (initialLevelConfig && initialLevelConfig.startValue) || 1,
  snakeSegments: buildInitialSnake((initialLevelConfig && initialLevelConfig.startValue) || 1).map((s) => ({ ...s })),
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
  foodPosition: pickRandomFood(initialMaze, buildInitialSnake((initialLevelConfig && initialLevelConfig.startValue) || 1)),
  selectedSkin: initialSkin,

  setGameState: (gameState) => set({ gameState }),

  startGame: () =>
    set((state) => {
      const startValue = (state.levelConfig && state.levelConfig.startValue) || 1;
      const initial = buildInitialSnake(startValue).map((s) => ({ ...s }));
      return {
        gameState: 'playing',
        score: 0,
        elapsedTime: 0,
        snakeSegments: initial,
        currentValue: startValue,
        // reset deterministic sequence
        currentFoodIndex: 0,
        currentFoodValue: (state.levelConfig && state.levelConfig.foods && state.levelConfig.foods[0]) || null,
        foodPosition: pickRandomFood(state.mazeMatrix || initialMaze, initial),
      };
    }),


  gameOver: () =>
    set((state) => {
      const best = Math.max(state.highScore, state.score);
      if (best !== state.highScore) writeStorage(HIGH_SCORE_KEY, best);

      return {
        gameState: 'gameover',
        highScore: best,
      };
    }),

  setElapsedTime: (elapsedTime) =>
    set((state) => {
      if (state.gameState !== 'playing') return state;
      return { elapsedTime };
    }),

  syncSnakeSegments: (segments) =>
    set((state) => {
      // Preserve any extra tail segments that were added (growth) so they aren't overwritten
      const current = state.snakeSegments || [];
      if (segments.length < current.length) {
        const tail = current.slice(segments.length);
        return { snakeSegments: [...segments, ...tail] };
      }
      return { snakeSegments: segments };
    }),

  eatFood: (growthPosition) =>
    set((state) => {
      if (state.gameState !== 'playing') return state;
      const nextScore = state.score + 1;
      const best = Math.max(state.highScore, nextScore);
      if (best !== state.highScore) writeStorage(HIGH_SCORE_KEY, best);

      // eaten food value
      const eatenValue = typeof state.currentFoodValue === 'number' ? state.currentFoodValue : 0;

      // Use provided growth position (logical tail world position) or fallback to last segment
      const fallback = state.snakeSegments[state.snakeSegments.length - 1] ?? { x: 0, y: 0.5, z: 0 };
      const tailPos = growthPosition && typeof growthPosition.x === 'number' ? growthPosition : fallback;

      // grow snake by appending eatenValue copies of the tail position
      const grown = [...state.snakeSegments];
      for (let i = 0; i < eatenValue; i += 1) grown.push({ ...tailPos });

      // compute new currentValue as accumulated numeric head value
      const current = typeof state.currentValue === 'number' ? state.currentValue : ((state.levelConfig && state.levelConfig.startValue) || 1);
      const nextValue = current + eatenValue;

      // Advance deterministic food sequence
      const level = state.levelConfig || initialLevelConfig;
      const foods = (level && level.foods) || [];
      const nextIndex = (typeof state.currentFoodIndex === 'number' ? state.currentFoodIndex : 0) + 1;

      // If nextIndex is within bounds, set next active food and attempt to spawn position
      if (nextIndex < foods.length) {
        const nextFoodVal = foods[nextIndex];
        const newFoodPos = pickRandomFood(state.mazeMatrix, grown);
        return {
          score: nextScore,
          highScore: best,
          snakeSegments: grown,
          currentValue: nextValue,
          foodPosition: newFoodPos,
          currentFoodIndex: nextIndex,
          currentFoodValue: nextFoodVal,
        };
      }

      // No more configured foods — session complete. Do not spawn next food.
      return {
        score: nextScore,
        highScore: best,
        snakeSegments: grown,
        currentValue: nextValue,
        foodPosition: null,
        gameState: 'complete',
      };
    }),

  setLevel: (level) => set((state) => {
      const lvl = Math.max(0, Math.min(10, Number(level)));
      const m = generateMaze(lvl);
      const cfg = state.levelConfig || initialLevelConfig;
      const startValue = (cfg && cfg.startValue) || 1;
      const initial = buildInitialSnake(startValue).map((s) => ({ ...s }));
      return {
        currentLevel: lvl,
        mazeMatrix: m,
        snakeSegments: initial,
        currentValue: startValue,
        foodPosition: pickRandomFood(m, initial),
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

  regenerateMaze: () => set((state) => ({ mazeMatrix: generateMaze(state.currentLevel) })),
}));
