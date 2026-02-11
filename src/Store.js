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
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1],
  [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
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

const walkableCells = (() => {
  const rows = MAZE_MATRIX.length;
  const cols = MAZE_MATRIX[0].length;
  const ox = (cols - 1) / 2;
  const oz = (rows - 1) / 2;
  const cells = [];

  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (MAZE_MATRIX[z][x] === 0) {
        cells.push({ x: x - ox, y: FOOD_Y, z: z - oz });
      }
    }
  }

  return cells;
})();

const randomFoodPosition = () => walkableCells[Math.floor(Math.random() * walkableCells.length)];

const initialSnake = [
  { x: 0, y: 0.5, z: 0 },
  { x: 0, y: 0.5, z: -0.8 },
  { x: 0, y: 0.5, z: -1.6 },
];

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

  syncSnakeSegments: (segments) => set({ snakeSegments: segments }),

  eatFood: () =>
    set((state) => {
      if (state.gameState !== 'playing') return state;
      const last = state.snakeSegments[state.snakeSegments.length - 1] ?? { x: 0, y: 0.5, z: 0 };
      const nextScore = state.score + 1;
      const best = Math.max(state.highScore, nextScore);
      if (best !== state.highScore) writeStorage(HIGH_SCORE_KEY, best);

      return {
        score: nextScore,
        highScore: best,
        snakeSegments: [...state.snakeSegments, { ...last }],
        foodPosition: randomFoodPosition(),
      };
    }),

  setSkin: (skinKey) =>
    set((state) => {
      if (!SKIN_PRESETS[skinKey] || state.selectedSkin === skinKey) return state;
      writeStorage(SKIN_KEY, skinKey);
      return { selectedSkin: skinKey };
    }),
}));
