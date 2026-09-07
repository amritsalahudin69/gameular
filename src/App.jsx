import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { KeyboardControls } from '@react-three/drei';
import Scene from './Scene.jsx';
import { MERGE_FEEDBACK_MS, SKIN_PRESETS, useGameStore } from './Store';

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

const dispatchDirection = (x, z) => {
  window.dispatchEvent(new CustomEvent('game-direction', { detail: { x, z } }));
};

function Hud() {
  const score = useGameStore((s) => s.score);
  const currentValue = useGameStore((s) => s.currentValue);
  const highScore = useGameStore((s) => s.highScore);
  const elapsedTime = useGameStore((s) => s.elapsedTime);
  const gameState = useGameStore((s) => s.gameState);
  const selectedSkin = useGameStore((s) => s.selectedSkin);
  const setSkin = useGameStore((s) => s.setSkin);
  const startGame = useGameStore((s) => s.startGame);
  const mergeFeedback = useGameStore((s) => s.mergeFeedback);
  const finishFoodMerge = useGameStore((s) => s.finishFoodMerge);
  const [gifFailed, setGifFailed] = useState(false);

  useEffect(() => {
    if (!mergeFeedback) {
      setGifFailed(false);
      return undefined;
    }

    const timer = window.setTimeout(finishFoodMerge, MERGE_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [finishFoodMerge, mergeFeedback]);

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
        <div>Value: {currentValue}</div>
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

      {mergeFeedback && (
        <div
          aria-live="polite"
          aria-label={`Merging into ${mergeFeedback.result}`}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(62vw, 260px)',
            aspectRatio: '1',
            display: 'grid',
            placeItems: 'center',
            borderRadius: 18,
            background: 'rgba(4, 18, 24, 0.86)',
            border: '2px solid #22d3ee',
            boxShadow: '0 0 28px rgba(34, 211, 238, 0.42)',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          {!gifFailed ? (
            <img
              src={`/assets/effects/${mergeFeedback.result}.gif`}
              alt={`Merge result ${mergeFeedback.result}`}
              onError={() => setGifFailed(true)}
              style={{ width: '82%', height: '82%', objectFit: 'contain' }}
            />
          ) : (
            <div style={{ textAlign: 'center', color: '#ecfeff' }}>
              <div style={{ fontSize: 14, opacity: 0.8 }}>MERGE</div>
              <div style={{ fontSize: 56, fontWeight: 800 }}>{mergeFeedback.result}</div>
            </div>
          )}
        </div>
      )}

      <div
        data-dpad
        aria-label="Directional controls"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 'calc(18px + env(safe-area-inset-bottom))',
          transform: 'translateX(-50%)',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 48px)',
          gridTemplateRows: 'repeat(3, 48px)',
          gap: 5,
          pointerEvents: 'auto',
          touchAction: 'none',
        }}
      >
        {[
          { label: 'Up', x: 0, z: -1, col: 2, row: 1 },
          { label: 'Left', x: -1, z: 0, col: 1, row: 2 },
          { label: 'Right', x: 1, z: 0, col: 3, row: 2 },
          { label: 'Down', x: 0, z: 1, col: 2, row: 3 },
        ].map(({ label, x, z, col, row }) => (
          <button
            key={label}
            type="button"
            aria-label={`Move ${label}`}
            onPointerDown={(e) => {
              e.preventDefault();
              dispatchDirection(x, z);
            }}
            style={{
              gridColumn: col,
              gridRow: row,
              border: '1px solid #35514d',
              borderRadius: 10,
              background: 'rgba(13, 34, 39, 0.9)',
              color: '#dff8ff',
              fontSize: 22,
              fontWeight: 700,
              cursor: 'pointer',
              touchAction: 'none',
            }}
          >
            {label === 'Up' ? '↑' : label === 'Down' ? '↓' : label === 'Left' ? '←' : '→'}
          </button>
        ))}
      </div>
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
