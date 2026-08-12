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

// Simple texture cache and loader for Numberblocks PNGs. Keys: positive integer value -> THREE.Texture | null (failed) | undefined (loading)
const textureCache = new globalThis.Map();
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
  const existing = textureCache.get(key);
  if (existing === null) {
    // previously failed
    onLoaded(null);
    return;
  }
  if (existing && existing.isTexture) {
    onLoaded(existing);
    return;
  }
  if (existing === undefined) {
    // mark as loading to avoid duplicate requests
    textureCache.set(key, null);
    const url = getNumberblockAssetPath(key);
    textureLoader.load(
      url,
      (tex) => {
      // store texture as-is; avoid forcing encoding that may not be exported in this three build
        textureCache.set(key, tex);
        onLoaded(tex);
      },
      undefined,
      () => {
        // error
        textureCache.set(key, null);
        onLoaded(null);
      },
    );
    return;
  }
  // if existing is null and not undefined, treat as failed
  onLoaded(null);
};

const MOVE_SPEED = 4.8;
const STEP_INTERVAL = 0.18; // logical movement tick
const CELL_SCALE = 2; // visual scale multiplier for plane/shadows
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
        <planeGeometry args={[cols * CELL_SCALE, rows * CELL_SCALE]} />
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

  // If no valid food, render nothing
  if (!foodPosition) return null;

  // texture state per food value
  const texRef = useRef(null);
  const [texState, setTexState] = useState(null);

  useEffect(() => {
    let mounted = true;
    setTexState(null);
    if (!currentFoodValue) return;
    loadNumberblockTexture(currentFoodValue, (tex) => {
      if (!mounted) return;
      texRef.current = tex;
      setTexState(tex);
    });
    return () => {
      mounted = false;
    };
  }, [currentFoodValue]);

  return (
    <RigidBody
      type="fixed"
      sensor
      colliders={false}
      position={[foodPosition.x, foodPosition.y, foodPosition.z]}
    >
      <CuboidCollider args={[0.3, 0.3, 0.3]} sensor />
      <mesh castShadow>
        <icosahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color="#ff8c42" roughness={0.35} metalness={0.15} />
      </mesh>

      {texState ? (
        <sprite position={[0, 0.45, 0]} scale={[0.9, 0.9, 1]}> 
          <spriteMaterial attach="material" map={texState} transparent />
        </sprite>
      ) : null}
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

  const segmentCount = useGameStore((s) => s.snakeSegments.length - 1);
  const gameState = useGameStore((s) => s.gameState);
  const gameOver = useGameStore((s) => s.gameOver);
  const selectedSkin = useGameStore((s) => s.selectedSkin);
  const syncSnakeSegments = useGameStore((s) => s.syncSnakeSegments);
  const setElapsedTime = useGameStore((s) => s.setElapsedTime);
  const mazeMatrix = useGameStore((s) => s.mazeMatrix);
  const [, getKeys] = useKeyboardControls();
  const { camera } = useThree();
  const skin = SKIN_PRESETS[selectedSkin] ?? SKIN_PRESETS.classic;

  const rows = mazeMatrix.length;
  const cols = mazeMatrix[0].length;
  const ox = (cols - 1) / 2;
  const oz = (rows - 1) / 2;

  const gridToWorld = (gx, gz) => new THREE.Vector3(gx - ox, 0.5, gz - oz);

  // Numberblock head texture (based on levelConfig.startValue)
  const levelConfig = useGameStore((s) => s.levelConfig);
  const startValue = (levelConfig && levelConfig.startValue) || 1;
  const headTexRef = useRef(null);
  const [headTex, setHeadTex] = useState(null);

  useEffect(() => {
    let mounted = true;
    setHeadTex(null);
    loadNumberblockTexture(startValue, (tex) => {
      if (!mounted) return;
      headTexRef.current = tex;
      setHeadTex(tex);
    });
    return () => { mounted = false; };
  }, [startValue]);

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

    // visual interpolation
    interpRef.current = Math.min(1, interpRef.current + delta / STEP_INTERVAL);
    const prev = gridToWorld(prevGridRef.current.gx, prevGridRef.current.gz);
    const cur = gridToWorld(curGridRef.current.gx, curGridRef.current.gz);
    const pos = prev.clone().lerp(cur, interpRef.current);
    rb.setNextKinematicTranslation(pos);

    // update segments visuals by following consecutive gridHistory cells
    const maxHistory = segmentRefs.current.length + 5; // keep only enough history for segments + small margin
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

    // camera follow
    const headWorld = cur.clone();
    const camTarget = headWorld.add(new THREE.Vector3(0, CAMERA_BASE.y, CAMERA_BASE.z));
    camera.position.lerp(camTarget, Math.min(1, delta * 4.5));
    camera.lookAt(headWorld.x, headWorld.y + 0.6, headWorld.z);

    // timing
    tickRef.current += delta;
    elapsedRef.current += delta;
    elapsedSyncRef.current += delta;

    if (elapsedSyncRef.current >= 0.2) {
      elapsedSyncRef.current = 0;
      setElapsedTime(elapsedRef.current);
    }

    // logical step
    if (tickRef.current >= STEP_INTERVAL) {
      // clear any previous new-tail hold now that a new interval starts
      newTailHoldRef.current = null;

      tickRef.current = 0;

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
        gameOver();
        return;
      }

      // Safe to index mazeMatrix now because candidate is inside bounds
      if (mazeMatrix[candidateGZ][candidateGX] === 1) {
        // Wall cell -> game over. Do not mutate any refs or history.
        gameOver();
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
              gameOver();
              return;
            }
          }
        }

        // Candidate valid and not colliding: commit movement
        // advance grid
        prevGridRef.current = { ...curGridRef.current };
        curGridRef.current = { gx: candidateGX, gz: candidateGZ };
        interpRef.current = 0;

        // push to history (head first)
        gridHistoryRef.current.unshift({ gx: candidateGX, gz: candidateGZ });

      // trim history deterministically to needed length (segments + margin)
      const keep = segmentRefs.current.length + 5;
      if (gridHistoryRef.current.length > keep) gridHistoryRef.current.length = keep;

      // prepare segments positions for store sync using grid-derived positions (authoritative)
      const syncCount = segmentRefs.current.length + 1; // head + bodies
      const syncGrid = gridHistoryRef.current.slice(0, syncCount);
      const segmentsWorld = syncGrid.map((g) => {
        const v = gridToWorld(g.gx, g.gz);
        return { x: v.x, y: v.y, z: v.z };
      });

        // record old length BEFORE growth to compute growthGrid index
        const oldLength = (useGameStore.getState().snakeSegments || []).length;

        syncSnakeSegments(segmentsWorld);

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
          // stabilize new-tail visual until next tick
          if (growthGrid) newTailHoldRef.current = { index: oldLength, gx: growthGrid.gx, gz: growthGrid.gz };

          // consume exactly once per logical tick, providing authoritative growth world position
          useGameStore.getState().eatFood(growthWorld);
        }
    }
  });

  return (
    <group>
      <RigidBody
        ref={bodyRef}
        type="kinematicPosition"
        colliders={false}
        position={[0, 0.5, 0]}
        name="player-head"
        onCollisionEnter={() => {
          gameOver();
        }}
      >
        <CuboidCollider args={[0.38, 0.38, 0.38]} />
        {/* Head base cube */}
        <mesh castShadow>
          <boxGeometry args={[0.96, 0.96, 0.96]} />
          <meshStandardMaterial color={skin.headColor} roughness={0.45} metalness={0.2} />
        </mesh>

        {/* Numberblock overlay as a camera-facing sprite when available */}
        {headTex ? (
          <sprite position={[0, 0.55, 0]} scale={[1.25, 1.25, 1]}> 
            <spriteMaterial attach="material" map={headTex} transparent />
          </sprite>
        ) : null}
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
      <ContactShadows position={[0, -0.001, 0]} opacity={0.4} scale={Math.max(cols, rows) * CELL_SCALE} blur={2.3} far={16} />
    </>
  );
}
