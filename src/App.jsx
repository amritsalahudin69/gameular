import { Canvas } from '@react-three/fiber';
import { KeyboardControls } from '@react-three/drei';
import Scene from './Scene.jsx';
import { SKIN_PRESETS, useGameStore } from './Store';

const controlsMap = [
  { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
  { name: 'up', keys: ['ArrowUp', 'KeyW'] },
  { name: 'down', keys: ['ArrowDown', 'KeyS'] },
];

const formatTime = (seconds) => {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

function Hud() {
  const score = useGameStore((s) => s.score);
  const highScore = useGameStore((s) => s.highScore);
  const elapsedTime = useGameStore((s) => s.elapsedTime);
  const gameState = useGameStore((s) => s.gameState);
  const selectedSkin = useGameStore((s) => s.selectedSkin);
  const setSkin = useGameStore((s) => s.setSkin);
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
      <div style={{ position: 'absolute', top: 18, left: 18, fontSize: 15, lineHeight: 1.5 }}>
        <div>Score: {score}</div>
        <div>Best: {highScore}</div>
        <div>Time: {formatTime(elapsedTime)}</div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 18,
          right: 18,
          pointerEvents: 'auto',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, opacity: 0.9, marginRight: 6 }}>Level</label>
          <select
            value={useGameStore((s) => s.currentLevel)}
            onChange={(e) => useGameStore.getState().setLevel(Number(e.target.value))}
            style={{ padding: '6px 8px', borderRadius: 6 }}
          >
            {Array.from({ length: 11 }).map((_, i) => (
              <option key={i} value={i}>Level {i}</option>
            ))}
          </select>
        </div>

        {Object.entries(SKIN_PRESETS).map(([key, skin]) => (
          <button
            key={key}
            onClick={() => setSkin(key)}
            style={{
              border: selectedSkin === key ? `2px solid ${skin.accent}` : '1px solid #35514d',
              borderRadius: 999,
              background: selectedSkin === key ? '#10363d' : '#0d2227',
              color: '#dff8ff',
              padding: '7px 12px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {skin.label}
          </button>
        ))}
      </div>

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
