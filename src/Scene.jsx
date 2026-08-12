import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, useKeyboardControls } from '@react-three/drei';
import {
  CuboidCollider,
  InstancedRigidBodies,
  Physics,
  RigidBody,
} from '@react-three/rapier';
import * as THREE from 'three';
import { SKIN_PRESETS, useGameStore } from './Store';

// Simple texture cache and loader for Numberblocks PNGs.
// textureCache: key -> THREE.Texture | null (failed)
// pendingLoads: key -> array of callbacks to notify when load completes
const textureCache = new globalThis.Map();
const pendingLoads = new globalThis.Map();
const textureLoader = new THREE.TextureLoader();

const getNumberblockAssetPath = (value) => {
  const v = Number(value);
  if (!Number.isInteger(v) || v <= 0) return null;
  return `/assets/numberblocks/${v}.png`;
};

const loadNumberblockTexture = (value, onLoaded) => {
  const key = Number(value);
  if (!Number.isInteger(key) || key <= 0) {
    onLoaded(null);
    return;
  }

  const cached = textureCache.get(key);
  if (cached !== undefined) {
    // cached result (either texture or null for failure)
    onLoaded(cached);
    return;
  }

  // if there's an active load, queue the callback
  const pending = pendingLoads.get(key);
  if (pending) {
    pending.push(onLoaded);
    return;
  }

  // start loading and queue this callback
  pendingLoads.set(key, [onLoaded]);
  const url = getNumberblockAssetPath(key);
  textureLoader.load(
    url,
    (tex) => {
      textureCache.set(key, tex);
      const callbacks = pendingLoads.get(key) || [];
      pendingLoads.delete(key);
      callbacks.forEach((cb) => cb(tex));
    },
    undefined,
    () => {
      textureCache.set(key, null);
      const callbacks = pendingLoads.get(key) || [];
      pendingLoads.delete(key);
      callbacks.forEach((cb) => cb(null));
    },
  );
};

const MOVE_SPEED = 4.8;
const STEP_INTERVAL = 0.18; // logical movement tick
const CAMERA_BASE = new THREE.Vector3(0, 7.5, 8.5);

function Map() {
  const mazeMatrix = useGameStore((s) => s.mazeMatrix);
  const instances = useMemo(() => {
    const rows = mazeMatrix.length;
    const cols = mazeMatrix[0].length;
    const ox = (cols - 1) / 2;
    const oz = (rows - 1) / 2;
    const data = [];

    for (let z = 0; z < rows; z += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (mazeMatrix[z][x] === 1) {
          data.push({
            key: `wall-${x}-${z}`,
            position: [x - ox, 0.5, z - oz],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          });
        }
      }
    }

    return { data, rows, cols, ox, oz };
  }, [mazeMatrix]);

  const rows = mazeMatrix.length;
  const cols = mazeMatrix[0].length;
  return (
    <group>
      <mesh receiveShadow position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[cols, rows]} />
        <meshStandardMaterial color="#24312f" roughness={0.95} metalness={0.05} />
      </mesh>

      <InstancedRigidBodies instances={instances.data} type="fixed" colliders="cuboid">
        <instancedMesh castShadow receiveShadow args={[null, null, instances.data.length]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#5a7367" roughness={0.8} metalness={0.08} />
        </instancedMesh>
      </InstancedRigidBodies>
    </group>
  );
}

function Food() {
  const foodPosition = useGameStore((s) => s.foodPosition);
  const currentFoodValue = useGameStore((s) => s.currentFoodValue);

  // texture state per food value
  const texRef = useRef(null);
  const [texState, setTexState] = useState(null);

  useEffect(() => {
    let mounted = true;
    setTexState(null);
    if (!currentFoodValue) return () => { mounted = false; };
    loadNumberblockTexture(currentFoodValue, (tex) => {
      if (!mounted) return;
      texRef.current = tex;
      setTexState(tex);
    });
    return () => { mounted = false; };
  }, [currentFoodValue]);

  // If no valid food, render nothing
  if (!foodPosition) return null;

  return (
    <RigidBody
      type="fixed"
      sensor
      colliders={false}
      position={[foodPosition.x, foodPosition.y, foodPosition.z]}
    >
      <CuboidCollider args={[0.3, 0.3, 0.3]} sensor />

      {texState ? (
        <sprite position={[0, 0, 0]} scale={[0.9, 0.9, 1]}> 
          <spriteMaterial attach="material" map={texState} transparent />
        </sprite>
      ) : (
        <mesh castShadow>
          <icosahedronGeometry args={[0.3, 0]} />
          <meshStandardMaterial color="#ff8c42" roughness={0.35} metalness={0.15} />
        </mesh>
      )}
    </RigidBody>
  );
}

function Player() {
  const bodyRef = useRef(null);
  const segmentRefs = useRef([]);
  const gridHistoryRef = useRef([]); // array of {gx,gz}
  const tickRef = useRef(0);
  const elapsedRef = useRef(0);
  const elapsedSyncRef = useRef(0);
  const dirRef = useRef({ x: 0, z: 1 }); // committed grid direction
  const pendingDirRef = useRef(null); // at most one pending direction between ticks
  const prevGridRef = useRef({ gx: 0, gz: 0 });
  const curGridRef = useRef({ gx: 0, gz: 0 });
  const interpRef = useRef(1);
  const newTailHoldRef = useRef(null); // { index, gx, gz } to stabilize new-tail visuals for one interval

  const segmentCount = useGameStore((s) => Math.max(0, s.snakeSegments.length - 1));
  const gameState = useGameStore((s) => s.gameState);
  const gameOver = useGameStore((s) => s.gameOver);
  const selectedSkin = useGameStore((s) => s.selectedSkin);
  const setElapsedTime = useGameStore((s) => s.setElapsedTime);
  const mazeMatrix = useGameStore((s) => s.mazeMatrix);
  const levelConfig = useGameStore((s) => s.levelConfig);
  const stepInterval = (levelConfig && levelConfig.stepIntervalSec) || STEP_INTERVAL;
  const [, getKeys] = useKeyboardControls();
  const { camera } = useThree();
  const skin = SKIN_PRESETS[selectedSkin] ?? SKIN_PRESETS.classic;

  const rows = mazeMatrix.length;
  const cols = mazeMatrix[0].length;
  const ox = (cols - 1) / 2;
  const oz = (rows - 1) / 2;

  const gridToWorld = (gx, gz) => new THREE.Vector3(gx - ox, 0.5, gz - oz);

  // Numberblock head texture (based on authoritative currentValue)
  const currentValue = useGameStore((s) => s.currentValue);
  const headTexRef = useRef(null);
  const [headTex, setHeadTex] = useState(null);

  useEffect(() => {
    let mounted = true;
    setHeadTex(null);
    loadNumberblockTexture(currentValue, (tex) => {
      if (!mounted) return;
      headTexRef.current = tex;
      setHeadTex(tex);
    });
    return () => { mounted = false; };
  }, [currentValue]);

  // Ensure camera is oriented toward arena on mount (idle and other states)
  useEffect(() => {
    camera.position.copy(CAMERA_BASE);
    camera.lookAt(0, 0.5, 0);
  }, [camera]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    // Reset runtime session-local refs to avoid leakage between runs
    tickRef.current = 0;
    elapsedRef.current = 0;
    elapsedSyncRef.current = 0;
    dirRef.current = { x: 0, z: 1 }; // initial committed direction
    pendingDirRef.current = null;
    newTailHoldRef.current = null;

    // Initialize grid positions from current stored snake segments (head first)
    const snake = useGameStore.getState().snakeSegments || [];
    const headWorld = snake[0] ?? { x: 0, y: 0.5, z: 0 };
    const headGX = Math.round(headWorld.x + ox);
    const headGZ = Math.round(headWorld.z + oz);

    // Build full initial history: head, body1, body2, ... in grid coords
    const initialHistory = snake.map((s) => ({ gx: Math.round(s.x + ox), gz: Math.round(s.z + oz) }));
    // Ensure at least head exists
    if (initialHistory.length === 0) initialHistory.push({ gx: headGX, gz: headGZ });

    prevGridRef.current = { ...initialHistory[0] };
    curGridRef.current = { ...initialHistory[0] };
    interpRef.current = 1;
    gridHistoryRef.current = initialHistory.slice();

    // Place visual segments exactly on their logical grid cells
    segmentRefs.current.forEach((segment, i) => {
      if (!segment) return;
      const hist = gridHistoryRef.current[i + 1] ?? { gx: headGX, gz: headGZ - (i + 1) };
      const p = gridToWorld(hist.gx, hist.gz);
      segment.position.set(p.x, p.y, p.z);
    });

    bodyRef.current?.setNextKinematicTranslation(gridToWorld(headGX, headGZ));
    camera.position.copy(CAMERA_BASE);
    camera.lookAt(0, 0.5, 0);
  }, [camera, gameState, mazeMatrix]);

  // keep segmentRefs trimmed to authoritative active count to avoid stale indexes
  useEffect(() => {
    segmentRefs.current.length = segmentCount;
  }, [segmentCount]);

  // keyboard fallback — enqueue at most one pending direction per logical tick
  useEffect(() => {
    const onKey = (e) => {
      if (gameState !== 'playing') return;
      const code = e.code;
      let dx = 0;
      let dz = 0;
      if (code === 'ArrowLeft' || code === 'KeyA') dx = -1;
      else if (code === 'ArrowRight' || code === 'KeyD') dx = 1;
      else if (code === 'ArrowUp' || code === 'KeyW') dz = -1;
      else if (code === 'ArrowDown' || code === 'KeyS') dz = 1;
      else return;

      // prevent page scrolling while playing for arrow keys
      if (code.startsWith('Arrow')) e.preventDefault();

      const committed = dirRef.current;
      // reject direct reversal against the committed direction
      if (dx === -committed.x && dz === -committed.z) return;
      // ignore if identical to committed
      if (dx === committed.x && dz === committed.z) return;
      // allow only one pending change before next logical tick
      if (pendingDirRef.current) return;

      pendingDirRef.current = { x: dx, z: dz };
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gameState]);

  useFrame((_, delta) => {
    const rb = bodyRef.current;
    if (!rb || gameState !== 'playing') return;

    // tiny diagnostic helper to report why a logical game over occurred
    const reportGameOver = (reason, details = {}) => {
      // Emit a deterministic console warning with structured details
      // eslint-disable-next-line no-console
      console.warn('[SNAKE_GAME_OVER]', { reason, ...details });
      gameOver();
    };

    // timing accumulator: keep remainder when a logical step occurs
    tickRef.current += delta;
    elapsedRef.current += delta;
    elapsedSyncRef.current += delta;

    if (elapsedSyncRef.current >= 0.2) {
      elapsedSyncRef.current = 0;
      setElapsedTime(elapsedRef.current);
    }

    // process one-or-more logical steps while preserving remainder
    while (tickRef.current >= stepInterval) {
      // consume the interval but keep remainder
      tickRef.current -= stepInterval;

      // clear any previous new-tail hold now that a new interval starts
      newTailHoldRef.current = null;

      // commit pending direction (if any) once per tick before movement calculation
      if (pendingDirRef.current) {
        dirRef.current = pendingDirRef.current;
        pendingDirRef.current = null;
      }

      const stepDir = dirRef.current;
      const candidateGX = curGridRef.current.gx + stepDir.x;
      const candidateGZ = curGridRef.current.gz + stepDir.z;

      // defensive maze dimensions
      const mazeRows = mazeMatrix?.length ?? 0;
      const mazeCols = mazeMatrix && mazeMatrix[0] ? mazeMatrix[0].length : 0;

      // helper: is inside maze bounds
      const isInsideMaze = (gx, gz) => gx >= 0 && gz >= 0 && gx < mazeCols && gz < mazeRows;

      // Validate candidate BEFORE mutating any runtime/grid state
      if (!isInsideMaze(candidateGX, candidateGZ)) {
        // Outside arena -> game over. Do not mutate any refs or history.
        reportGameOver('BOUNDARY', {
          currentGX: curGridRef.current.gx,
          currentGZ: curGridRef.current.gz,
          candidateGX,
          candidateGZ,
          mazeCols,
          mazeRows,
        });
        return;
      }

      // Safe to index mazeMatrix now because candidate is inside bounds
      if (mazeMatrix[candidateGZ][candidateGX] === 1) {
        // Wall cell -> game over. Do not mutate any refs or history.
        reportGameOver('WALL', {
          currentGX: curGridRef.current.gx,
          currentGZ: curGridRef.current.gz,
          candidateGX,
          candidateGZ,
          mazeValue: mazeMatrix[candidateGZ][candidateGX],
        });
        return;
      }

      // Self-collision check (grid-based) — exclude the current tail cell which will vacate this tick
      const snakeLen = (useGameStore.getState().snakeSegments || []).length;
      // collision cells are history[1] .. history[snakeLen - 2] inclusive
      const collisionEnd = snakeLen - 2;
      if (collisionEnd >= 1) {
        for (let i = 1; i <= collisionEnd; i += 1) {
          const h = gridHistoryRef.current[i];
          if (!h) continue;
          if (h.gx === candidateGX && h.gz === candidateGZ) {
            // collided with body (not tail) -> game over
            reportGameOver('SELF', {
              currentGX: curGridRef.current.gx,
              currentGZ: curGridRef.current.gz,
              candidateGX,
              candidateGZ,
              collisionHistoryIndex: i,
              snakeLength: snakeLen,
            });
            return;
          }
        }
      }

      // Candidate valid and not colliding: commit movement
      // advance grid
      prevGridRef.current = { ...curGridRef.current };
      curGridRef.current = { gx: candidateGX, gz: candidateGZ };

      // reset interpolation fraction for the new step; the visual fraction will be recomputed below from the accumulator
      interpRef.current = 0;

      // push to history (head first)
      gridHistoryRef.current.unshift({ gx: candidateGX, gz: candidateGZ });

      // trim history deterministically to needed length (segments + margin)
      const keep = segmentCount + 5;
      if (gridHistoryRef.current.length > keep) gridHistoryRef.current.length = keep;

      // prepare segments positions for store sync using grid-derived positions (authoritative)
      const syncCount = segmentCount + 1; // head + bodies
      const syncGrid = gridHistoryRef.current.slice(0, syncCount);
      const segmentsWorld = syncGrid.map((g) => {
        const v = gridToWorld(g.gx, g.gz);
        return { x: v.x, y: v.y, z: v.z };
      });

      // record old length BEFORE growth to compute growthGrid index
      const oldLength = (useGameStore.getState().snakeSegments || []).length;

      useGameStore.getState().syncSnakeSegments(segmentsWorld);

      // After authoritative store sync, check logical food consumption using grid equality
      const food = useGameStore.getState().foodPosition;
      if (food && typeof food.gx === 'number' && food.gx === candidateGX && food.gz === candidateGZ) {
        // determine growth grid (the previous tail cell) from history at index oldLength
        const growthGrid = gridHistoryRef.current[oldLength];
        let growthWorld = null;
        if (growthGrid) {
          const v = gridToWorld(growthGrid.gx, growthGrid.gz);
          growthWorld = { x: v.x, y: v.y, z: v.z };
        }

        // multi-value growth: append additional repeated copies of growthGrid to history
        const eatenValue = useGameStore.getState().currentFoodValue || 0;
        if (growthGrid && eatenValue > 0) {
          // gridHistory already contains the previous tail at index oldLength; append (eatenValue - 1) more copies
          const extra = Math.max(0, eatenValue - 1);
          for (let k = 0; k < extra; k += 1) {
            gridHistoryRef.current.push({ gx: growthGrid.gx, gz: growthGrid.gz });
          }
          // stabilize new-tail visuals at the first appended index
          newTailHoldRef.current = { index: oldLength, gx: growthGrid.gx, gz: growthGrid.gz };
        }

        // consume exactly once per logical tick, providing authoritative growth world position
        useGameStore.getState().eatFood(growthWorld);
      }
    }

    // After processing logical steps, compute authoritative interpolation fraction from the accumulator
    interpRef.current = Math.min(1, tickRef.current / stepInterval);

    // visual interpolation using authoritative interpRef
    const prev = gridToWorld(prevGridRef.current.gx, prevGridRef.current.gz);
    const cur = gridToWorld(curGridRef.current.gx, curGridRef.current.gz);
    const pos = prev.clone().lerp(cur, interpRef.current);
    rb.setNextKinematicTranslation(pos);

    // update segments visuals by following consecutive gridHistory cells
    const maxHistory = segmentCount + 5; // keep only enough history for segments + small margin
    if (gridHistoryRef.current.length > maxHistory) gridHistoryRef.current.length = maxHistory;

    segmentRefs.current.forEach((segment, i) => {
      if (!segment) return;
      // If this is a newly grown tail being held, keep it fixed at the growth cell for this interval
      if (newTailHoldRef.current && newTailHoldRef.current.index === i) {
        const p = gridToWorld(newTailHoldRef.current.gx, newTailHoldRef.current.gz);
        segment.position.set(p.x, p.y, p.z);
        return;
      }

      // new logical cell for this body segment is history[i+1]
      // previous logical cell is history[i+2]
      const newGrid = gridHistoryRef.current[i + 1] ?? curGridRef.current;
      const prevGrid = gridHistoryRef.current[i + 2] ?? newGrid;
      const prevWorld = gridToWorld(prevGrid.gx, prevGrid.gz);
      const newWorld = gridToWorld(newGrid.gx, newGrid.gz);
      // interpolate using the same interpRef as the head to avoid corner-cutting
      segment.position.lerpVectors(prevWorld, newWorld, interpRef.current);
    });

    // camera follow — follow the interpolated head position (pos)
    const headWorld = pos.clone();
    const camTarget = headWorld.clone().add(new THREE.Vector3(0, CAMERA_BASE.y, CAMERA_BASE.z));
    camera.position.lerp(camTarget, Math.min(1, delta * 4.5));
    camera.lookAt(headWorld.x, headWorld.y + 0.6, headWorld.z);
  });

  return (
    <group>
      <RigidBody
        ref={bodyRef}
        type="kinematicPosition"
        colliders={false}
        position={[0, 0.5, 0]}
        name="player-head"
      >
        <CuboidCollider args={[0.38, 0.38, 0.38]} />
          {/* Head: use Numberblock sprite as primary when available, otherwise fallback to cube */}
          {headTex ? (
            <sprite position={[0, 0, 0]} scale={[1.0, 1.0, 1]}> 
              <spriteMaterial attach="material" map={headTex} transparent />
            </sprite>
          ) : (
            <mesh castShadow>
              <boxGeometry args={[0.96, 0.96, 0.96]} />
              <meshStandardMaterial color={skin.headColor} roughness={0.45} metalness={0.2} />
            </mesh>
          )}
      </RigidBody>

      {Array.from({ length: Math.max(0, segmentCount) }).map((_, i) => (
        <mesh
          key={`segment-${i}`}
          ref={(el) => {
            segmentRefs.current[i] = el;
          }}
          position={[0, 0.5, -(i + 1) * 0.7]}
          castShadow
        >
          <sphereGeometry args={[0.3, 14, 14]} />
          <meshStandardMaterial color={skin.bodyColor} roughness={0.5} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

export default function Scene() {
  const mazeMatrix = useGameStore((s) => s.mazeMatrix);
  const rows = mazeMatrix.length;
  const cols = mazeMatrix[0].length;
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight
        castShadow
        intensity={1.2}
        position={[6, 12, 8]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      <Physics gravity={[0, -9.81, 0]}>
        <Map />
        <Player />
        <Food />
      </Physics>

      <Environment preset="city" />
      <ContactShadows position={[0, -0.001, 0]} opacity={0.4} scale={Math.max(cols, rows)} blur={2.3} far={16} />
    </>
  );
}
