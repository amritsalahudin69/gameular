import { create } from 'zustand';

const FOOD_Y = 0.4;

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
  gameState: 'idle',
  foodPosition: randomFoodPosition(),

  setGameState: (gameState) => set({ gameState }),

  startGame: () =>
    set({
      gameState: 'playing',
      score: 0,
      snakeSegments: initialSnake.map((s) => ({ ...s })),
      foodPosition: randomFoodPosition(),
    }),

  gameOver: () => set({ gameState: 'gameover' }),

  syncSnakeSegments: (segments) => set({ snakeSegments: segments }),

  eatFood: () =>
    set((state) => {
      if (state.gameState !== 'playing') return state;
      const last = state.snakeSegments[state.snakeSegments.length - 1] ?? { x: 0, y: 0.5, z: 0 };
      return {
        score: state.score + 1,
        snakeSegments: [...state.snakeSegments, { ...last }],
        foodPosition: randomFoodPosition(),
      };
    }),
}));
