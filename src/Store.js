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

export const MAZE_MATRIX = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,0,1,1,1,0,1,1,1,0,0,1,1,1,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,0,1,1,1,1,1,1,1,1,1,1,1,0,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,1,1,0,1,1,1,0,1,1,1,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

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
  const rows = MAZE_MATRIX.length;
  const cols = MAZE_MATRIX[0].length;
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
  const rows = MAZE_MATRIX.length;
  const cols = MAZE_MATRIX[0].length;
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
  const walk = getWalkableFromMatrix(matrix);
  const snakeSet = new Set(
    (snakeSegments || []).map((s) => {
      const rows = matrix.length;
      const cols = matrix[0].length;
      const ox = (cols - 1) / 2;
      const oz = (rows - 1) / 2;
      const gx = Math.round(s.x + ox);
      const gz = Math.round(s.z + oz);
      return `${gx},${gz}`;
    }),
  );
  const free = walk.filter((c) => !snakeSet.has(`${c.gx},${c.gz}`));
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  return walk[Math.floor(Math.random() * walk.length)];
};

// initial level and maze
const initialLevel = 2;
const initialMaze = generateMaze(initialLevel);

const initialSnake = [
  { x: 0, y: 0.5, z: 0 },
  { x: 0, y: 0.5, z: -0.8 },
  { x: 0, y: 0.5, z: -1.6 },
];

// helper to convert world snake segments to grid keys
const snakeToGridSet = (segments, matrix) => {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const ox = (cols - 1) / 2;
  const oz = (rows - 1) / 2;
  return new Set((segments || []).map(s => `${Math.round(s.x + ox)},${Math.round(s.z + oz)}`));
};

export const useGameStore = create((set) => ({
  snakeSegments: initialSnake.map((s) => ({ ...s })),
  score: 0,
  elapsedTime: 0,
  highScore: readNumber(HIGH_SCORE_KEY, 0),
  gameState: 'idle',
  foodPosition: randomFoodPosition(),
  selectedSkin: initialSkin,

  setGameState: (gameState) => set({ gameState }),

  startGame: () =>
    set({
      gameState: 'playing',
      score: 0,
      elapsedTime: 0,
      snakeSegments: initialSnake.map((s) => ({ ...s })),
      foodPosition: randomFoodPosition(),
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

  eatFood: () =>
    set((state) => {
      if (state.gameState !== 'playing') return state;
      const last = state.snakeSegments[state.snakeSegments.length - 1] ?? { x: 0, y: 0.5, z: 0 };
      const nextScore = state.score + 1;
      const best = Math.max(state.highScore, nextScore);
      if (best !== state.highScore) writeStorage(HIGH_SCORE_KEY, best);

      // grow snake by duplicating last segment
      const grown = [...state.snakeSegments, { ...last }];
      const newFood = pickRandomFood(state.mazeMatrix, grown);

      return {
        score: nextScore,
        highScore: best,
        snakeSegments: grown,
        foodPosition: newFood,
      };
    }),

  setLevel: (level) => set((state) => {
      const lvl = Math.max(0, Math.min(10, Number(level)));
      const m = generateMaze(lvl);
      return {
        currentLevel: lvl,
        mazeMatrix: m,
        snakeSegments: initialSnake.map((s) => ({ ...s })),
        foodPosition: pickRandomFood(m, initialSnake.map(s => ({ x: s.x, z: s.z }))),
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
