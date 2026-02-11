import { Canvas } from '@react-three/fiber';
import { KeyboardControls } from '@react-three/drei';
import Scene from './Scene';
import { useGameStore } from './Store';

const controlsMap = [
  { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
  { name: 'up', keys: ['ArrowUp', 'KeyW'] },
  { name: 'down', keys: ['ArrowDown', 'KeyS'] },
];

function Hud() {
  const score = useGameStore((s) => s.score);
  const gameState = useGameStore((s) => s.gameState);
  const startGame = useGameStore((s) => s.startGame);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        color: '#ecfeff',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      <div style={{ position: 'absolute', top: 18, left: 18, fontSize: 16 }}>Score: {score}</div>

      {(gameState === 'idle' || gameState === 'gameover') && (
        <div
          style={{
            pointerEvents: 'auto',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
          }}
        >
          <button
            onClick={startGame}
            style={{
              border: 0,
              borderRadius: 10,
              background: '#22d3ee',
              color: '#042f2e',
              padding: '12px 20px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {gameState === 'gameover' ? 'Restart' : 'Start Game'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <KeyboardControls map={controlsMap}>
      <Canvas
        shadows
        gl={{ alpha: false, antialias: false, powerPreference: 'high-performance' }}
        camera={{ fov: 55, near: 0.1, far: 100, position: [0, 7.5, 8.5] }}
        dpr={[1, 1.5]}
      >
        <color attach="background" args={['#0b1316']} />
        <Scene />
      </Canvas>
      <Hud />
    </KeyboardControls>
  );
}
