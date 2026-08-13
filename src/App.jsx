import { useRef } from 'react';
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
  const currentValue = useGameStore((s) => s.currentValue);

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
          flexWrap: 'wrap',
          maxWidth: '48vw',
          justifyContent: 'flex-end',
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

      {(gameState === 'idle' || gameState === 'gameover' || gameState === 'complete') && (
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
          {gameState === 'complete' ? (
            <div>
              <div style={{ marginBottom: 12, fontSize: 22, fontWeight: 800 }}>Level Complete</div>
              <div style={{ marginBottom: 8 }}>Final Numberblock: {currentValue}</div>
              <div style={{ marginBottom: 16 }}>Score: {score}</div>
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
                Play Again
              </button>
            </div>
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const gameState = useGameStore((s) => s.gameState);

  const DPad = () => {
    if (gameState !== 'playing') return null;
    const btnCommon = {
      width: 56,
      height: 56,
      borderRadius: 12,
      background: 'rgba(16, 54, 61, 0.78)',
      color: '#e6fffd',
      border: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      touchAction: 'none',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      msUserSelect: 'none',
      cursor: 'pointer',
      fontSize: 18,
      lineHeight: '18px',
    };

    const dispatchDir = (x, z, e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      window.dispatchEvent(new CustomEvent('snake-direction', { detail: { x, z } }));
    };

    return (
      <div
        style={{
          position: 'fixed',
          bottom: 18,
          left: 18,
          width: 170,
          height: 170,
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ position: 'relative', width: 170, height: 170 }}>
          <div style={{ position: 'absolute', left: 57, top: 6 }}>
            <div
              role="button"
              tabIndex={0}
              onPointerDown={(e) => dispatchDir(0, -1, e)}
              onPointerUp={(e) => e.stopPropagation()}
              style={{ ...btnCommon }}
            >
              ▲
            </div>
          </div>

          <div style={{ position: 'absolute', left: 6, top: 57 }}>
            <div
              role="button"
              tabIndex={0}
              onPointerDown={(e) => dispatchDir(-1, 0, e)}
              onPointerUp={(e) => e.stopPropagation()}
              style={{ ...btnCommon }}
            >
              ◀
            </div>
          </div>

          <div style={{ position: 'absolute', left: 57, top: 57 }}>
            <div
              role="button"
              tabIndex={0}
              onPointerDown={(e) => dispatchDir(0, 1, e)}
              onPointerUp={(e) => e.stopPropagation()}
              style={{ ...btnCommon }}
            >
              ▼
            </div>
          </div>

          <div style={{ position: 'absolute', left: 108, top: 57 }}>
            <div
              role="button"
              tabIndex={0}
              onPointerDown={(e) => dispatchDir(1, 0, e)}
              onPointerUp={(e) => e.stopPropagation()}
              style={{ ...btnCommon }}
            >
              ▶
            </div>
          </div>
        </div>
      </div>
    );
  };

  // swipe handling attached to the canvas container to detect mobile swipes
  const swipeRef = useRef({ active: false, startX: 0, startY: 0, pointerId: null });
  const SWIPE_THRESHOLD = 30; // pixels

  const onCanvasPointerDown = (e) => {
    // Ignore if starting on interactive controls (buttons/selects/inputs or elements with role=button)
    const tgt = e.target;
    if (!tgt) return;
    const tag = (tgt.tagName || '').toUpperCase();
    if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'INPUT' || tgt.getAttribute && tgt.getAttribute('role') === 'button') return;

    // only primary button for mouse
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    swipeRef.current.active = true;
    swipeRef.current.startX = e.clientX;
    swipeRef.current.startY = e.clientY;
    swipeRef.current.pointerId = e.pointerId;

    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  };

  const onCanvasPointerUp = (e) => {
    if (!swipeRef.current.active) return;
    if (e.pointerId !== swipeRef.current.pointerId) return;

    const dx = e.clientX - swipeRef.current.startX;
    const dy = e.clientY - swipeRef.current.startY;

    // reset state early to avoid duplicate handling
    swipeRef.current.active = false;
    swipeRef.current.pointerId = null;

    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}

    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return; // tap

    // dominant axis
    if (Math.abs(dx) > Math.abs(dy)) {
      // horizontal
      if (dx > 0) window.dispatchEvent(new CustomEvent('snake-direction', { detail: { x: 1, z: 0 } }));
      else window.dispatchEvent(new CustomEvent('snake-direction', { detail: { x: -1, z: 0 } }));
    } else {
      // vertical
      if (dy > 0) window.dispatchEvent(new CustomEvent('snake-direction', { detail: { x: 0, z: 1 } }));
      else window.dispatchEvent(new CustomEvent('snake-direction', { detail: { x: 0, z: -1 } }));
    }
  };

  const onCanvasPointerCancel = (e) => {
    swipeRef.current.active = false;
    swipeRef.current.pointerId = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
  };

  return (
    <KeyboardControls map={controlsMap}>
      <div
        onPointerDown={onCanvasPointerDown}
        onPointerUp={onCanvasPointerUp}
        onPointerCancel={onCanvasPointerCancel}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100dvh',
          overflow: 'hidden',
          touchAction: 'none',
          WebkitOverflowScrolling: 'auto',
        }}
      >
        <Canvas
          style={{ width: '100%', height: '100%' }}
          shadows
          gl={{ alpha: false, antialias: false, powerPreference: 'high-performance' }}
          camera={{ fov: 55, near: 0.1, far: 100, position: [0, 7.5, 8.5] }}
          dpr={[1, 1.5]}
        >
          <color attach="background" args={['#0b1316']} />
          <Scene />
        </Canvas>
      </div>
      <Hud />
      <DPad />
    </KeyboardControls>
  );
}
