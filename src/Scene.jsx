import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, useTexture } from '@react-three/drei';
import {
  CuboidCollider,
  InstancedRigidBodies,
  Physics,
  RigidBody,
} from '@react-three/rapier';
import * as THREE from 'three';
import { SKIN_PRESETS, useGameStore } from './Store';
import { dispatchFoodEat } from './VFXStore';
import Enemy from './Enemy.jsx';
import VFXManager from './VFXManager.jsx';

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

const STEP_INTERVAL = 0.18; // logical movement tick
const CAMERA_BASE = new THREE.Vector3(0, 7.5, 8.5);

function Map() {
  const mazeMatrix = useGameStore((s) => s.mazeMatrix);
  const floorTexture = useTexture('/sprite/lantai.png');
  const borderTexture = useTexture('/sprite/wall-border.png');
  const obstacleTexture = useTexture('/sprite/wall-rintangan.png');

  const { boundaryInstances, obstacleInstances } = useMemo(() => {
    const rows = mazeMatrix.length;
    const cols = mazeMatrix[0].length;
    const ox = (cols - 1) / 2;
    const oz = (rows - 1) / 2;
    const boundaryData = [];
    const obstacleData = [];

    for (let z = 0; z < rows; z += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (mazeMatrix[z][x] === 1) {
          const isBoundary = z === 0 || z === rows - 1 || x === 0 || x === cols - 1;
          const wall = {
            key: `wall-${x}-${z}`,
            position: [x - ox, 0.5, z - oz],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          };
          if (isBoundary) {
            boundaryData.push(wall);
          } else {
            obstacleData.push(wall);
          }
        }
      }
    }

    const sphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), Math.hypot(cols, 1, rows) / 2);
    return {
      boundaryInstances: {
        data: boundaryData,
        rows,
        cols,
        key: THREE.MathUtils.generateUUID(),
        boundingSphere: sphere,
      },
      obstacleInstances: {
        data: obstacleData,
        key: THREE.MathUtils.generateUUID(),
        boundingSphere: sphere,
      },
    };
  }, [mazeMatrix]);

  const rows = mazeMatrix.length;
  const cols = mazeMatrix[0].length;

  useLayoutEffect(() => {
    // Floor texture
    const tileWidth = 4;
    const tileHeight = tileWidth * floorTexture.image.height / floorTexture.image.width;
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(cols / tileWidth, rows / tileHeight);
    floorTexture.magFilter = THREE.NearestFilter;
    floorTexture.minFilter = THREE.NearestFilter;
    floorTexture.generateMipmaps = false;
    floorTexture.colorSpace = THREE.SRGBColorSpace;
    floorTexture.needsUpdate = true;
  }, [floorTexture, cols, rows]);

  useLayoutEffect(() => {
    // Wall textures: one tile per wall unit
    [borderTexture, obstacleTexture].forEach((texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1, 1);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
    });
  }, [borderTexture, obstacleTexture]);

  return (
    <group>
      <mesh receiveShadow position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[cols, rows]} />
        <meshStandardMaterial map={floorTexture} color="#ffffff" transparent alphaTest={0.01} roughness={0.95} metalness={0.05} />
      </mesh>

      {boundaryInstances.data.length > 0 && (
        <InstancedRigidBodies key={boundaryInstances.key} instances={boundaryInstances.data} type="fixed" colliders="cuboid">
          <instancedMesh castShadow receiveShadow boundingSphere={boundaryInstances.boundingSphere} args={[null, null, boundaryInstances.data.length]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial map={borderTexture} color="#ffffff" roughness={0.8} metalness={0.08} />
          </instancedMesh>
        </InstancedRigidBodies>
      )}

      {obstacleInstances.data.length > 0 && (
        <InstancedRigidBodies key={obstacleInstances.key} instances={obstacleInstances.data} type="fixed" colliders="cuboid">
          <instancedMesh castShadow receiveShadow boundingSphere={obstacleInstances.boundingSphere} args={[null, null, obstacleInstances.data.length]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial map={obstacleTexture} color="#ffffff" roughness={0.8} metalness={0.08} />
          </instancedMesh>
        </InstancedRigidBodies>
      )}
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
        <sprite position={[0, 0, 0]} scale={[2, 2, 2.6]}>  //ukuran sprite disesuaikan dengan ukuran Numberblock
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
  const visualRef = useRef(null);
  const visualFromRef = useRef(new THREE.Vector3());
  const visualTargetRef = useRef(new THREE.Vector3());
  const visualElapsedRef = useRef(0);
  const tickRef = useRef(0);
  const readySessionRef = useRef(null);
  const elapsedRef = useRef(0);
  const elapsedSyncRef = useRef(0);
  const dirRef = useRef({ x: 0, z: 1 }); // committed grid direction
  const pendingDirRef = useRef(null); // at most one pending direction between ticks
  const prevGridRef = useRef({ gx: 0, gz: 0 });
  const curGridRef = useRef({ gx: 0, gz: 0 });
  const interpRef = useRef(1);
  const gameState = useGameStore((s) => s.gameState);
  const mergeFeedback = useGameStore((s) => s.mergeFeedback);
  const sessionId = useGameStore((s) => s.sessionId);
  const gameOver = useGameStore((s) => s.gameOver);
  const selectedSkin = useGameStore((s) => s.selectedSkin);
  const setElapsedTime = useGameStore((s) => s.setElapsedTime);
  const mazeMatrix = useGameStore((s) => s.mazeMatrix);
  const levelConfig = useGameStore((s) => s.levelConfig);
  const stepInterval = (levelConfig && levelConfig.stepIntervalSec) || STEP_INTERVAL;
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
    // Reset runtime session-local refs to avoid leakage between runs
    readySessionRef.current = sessionId;
    tickRef.current = 0;
    elapsedRef.current = 0;
    elapsedSyncRef.current = 0;
    dirRef.current = { x: 0, z: 1 }; // initial committed direction
    pendingDirRef.current = null;

    const headWorld = useGameStore.getState().playerPosition ?? { x: 0, y: 0.5, z: 0 };
    const headGX = Math.round(headWorld.x + ox);
    const headGZ = Math.round(headWorld.z + oz);

    prevGridRef.current = { gx: headGX, gz: headGZ };
    curGridRef.current = { gx: headGX, gz: headGZ };
    interpRef.current = 1;

    const spawn = gridToWorld(headGX, headGZ);
    visualRef.current?.position.copy(spawn);
    visualFromRef.current.copy(spawn);
    visualTargetRef.current.copy(spawn);
    visualElapsedRef.current = stepInterval;
    bodyRef.current?.setTranslation(spawn, true);
    bodyRef.current?.setNextKinematicTranslation(spawn);
    camera.position.copy(CAMERA_BASE);
    camera.lookAt(0, 0.5, 0);
  }, [camera, sessionId, mazeMatrix]);

  useEffect(() => {
    if (gameState === 'playing' && !mergeFeedback) return;
    tickRef.current = 0;
    pendingDirRef.current = null;
    prevGridRef.current = { ...curGridRef.current };
    const position = gridToWorld(curGridRef.current.gx, curGridRef.current.gz);
    bodyRef.current?.setTranslation(position, true);
    bodyRef.current?.setNextKinematicTranslation(position);
  }, [gameState, mergeFeedback]);

  // keyboard fallback — enqueue at most one pending direction per logical tick
  useEffect(() => {
    const queueDirection = (direction) => {
      const state = useGameStore.getState();
      if (state.sessionId !== sessionId || state.gameState !== 'playing' || state.mergeFeedback || !direction) return;

      const { x: dx, z: dz } = direction;
      if (!Number.isInteger(dx) || !Number.isInteger(dz) || Math.abs(dx) + Math.abs(dz) !== 1) return;
      const committed = dirRef.current;
      // Reject direct reversal against the committed direction.
      if (dx === -committed.x && dz === -committed.z) return;
      // Ignore repeated requests for the current direction.
      if (dx === committed.x && dz === committed.z) return;
      // Keep one pending change per logical tick across all input sources.
      if (pendingDirRef.current) return;

      pendingDirRef.current = { x: dx, z: dz };
    };

    const onKey = (e) => {
      if (e.repeat) return;
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
      queueDirection({ x: dx, z: dz });
    };

    const onDirection = (e) => {
      queueDirection(e.detail);
    };

    let swipeStart = null;
    const onTouchStart = (e) => {
      if (gameState !== 'playing' || mergeFeedback || e.touches.length !== 1) return;
      const target = e.target;
      if (target instanceof Element && target.closest('[data-dpad]')) return;
      const touch = e.touches[0];
      swipeStart = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
    };

    const onTouchEnd = (e) => {
      if (!swipeStart) return;
      const touch = Array.from(e.changedTouches).find(({ identifier }) => identifier === swipeStart.id);
      const start = swipeStart;
      swipeStart = null;
      if (!touch) return;

      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 30) return;

      if (Math.abs(dx) > Math.abs(dy)) {
        queueDirection({ x: dx > 0 ? 1 : -1, z: 0 });
      } else {
        queueDirection({ x: 0, z: dy > 0 ? 1 : -1 });
      }
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('game-direction', onDirection);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('game-direction', onDirection);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [gameState, mergeFeedback, sessionId]);

  useFrame((_, delta) => {
    const rb = bodyRef.current;
    const state = useGameStore.getState();
    if (!rb || state.sessionId !== sessionId || readySessionRef.current !== sessionId) return;
    if (state.gameState !== 'playing' || state.mergeFeedback) {
      tickRef.current = 0;
      pendingDirRef.current = null;
      return;
    }

    // Rendering is independent of the authoritative grid and Rapier's interpolation.
    visualElapsedRef.current = Math.min(stepInterval, visualElapsedRef.current + delta);
    visualRef.current.position.lerpVectors(
      visualFromRef.current, visualTargetRef.current, visualElapsedRef.current / stepInterval,
    );

    const headWorld = visualRef.current.position;
    const camTarget = headWorld.clone().add(new THREE.Vector3(0, CAMERA_BASE.y, CAMERA_BASE.z));
    camera.position.lerp(camTarget, Math.min(1, delta * 4.5));
    camera.lookAt(headWorld.x, headWorld.y + 0.6, headWorld.z);

    // tiny diagnostic helper to report why a logical game over occurred
    const reportGameOver = (reason, details = {}) => {
      // Emit a deterministic console warning with structured details
      // eslint-disable-next-line no-console
      console.warn('[GAME_OVER]', { reason, ...details });
      gameOver();
    };

    // timing accumulator: keep remainder when a logical step occurs
    // Discard stalled-frame debt instead of bursting through several cells.
    tickRef.current += Math.min(delta, stepInterval);
    elapsedRef.current += delta;
    elapsedSyncRef.current += delta;

    if (elapsedSyncRef.current >= 0.2) {
      elapsedSyncRef.current = 0;
      setElapsedTime(elapsedRef.current);
    }

    // process one-or-more logical steps while preserving remainder
    while (tickRef.current >= stepInterval) {
      const live = useGameStore.getState();
      if (live.sessionId !== sessionId || live.gameState !== 'playing' || live.mergeFeedback) {
        tickRef.current = 0;
        pendingDirRef.current = null;
        return;
      }
      // consume the interval but keep remainder
      tickRef.current -= stepInterval;

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
        // Outside arena -> game over. Do not mutate authoritative position.
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
      if (mazeMatrix[candidateGZ][candidateGX] !== 0) {
        // Wall cell -> game over. Do not mutate authoritative position.
        reportGameOver('WALL', {
          currentGX: curGridRef.current.gx,
          currentGZ: curGridRef.current.gz,
          candidateGX,
          candidateGZ,
          mazeValue: mazeMatrix[candidateGZ][candidateGX],
        });
        return;
      }

      // Candidate is valid: commit the authoritative single-cell movement.
      prevGridRef.current = { ...curGridRef.current };
      curGridRef.current = { gx: candidateGX, gz: candidateGZ };
      interpRef.current = 0;
      const playerWorld = gridToWorld(candidateGX, candidateGZ);
      visualFromRef.current.copy(visualRef.current.position);
      visualTargetRef.current.copy(playerWorld);
      visualElapsedRef.current = 0;
      useGameStore.getState().syncPlayerPosition(playerWorld);

      const enemies = useGameStore.getState().enemyPositions || [];
      if (enemies.some((enemy) => enemy.gx === candidateGX && enemy.gz === candidateGZ)) {
        gameOver();
        return;
      }

      // After authoritative store sync, check logical food consumption using grid equality
      const food = useGameStore.getState().foodPosition;
      if (food && typeof food.gx === 'number' && food.gx === candidateGX && food.gz === candidateGZ) {
        // Dispatch FOOD_EAT VFX event
        dispatchFoodEat({
          position: {
            x: playerWorld.x,
            z: playerWorld.z,
            gx: candidateGX,
            gz: candidateGZ,
          },
        });
        useGameStore.getState().beginFoodMerge();
        tickRef.current = 0;
        pendingDirRef.current = null;
        prevGridRef.current = { ...curGridRef.current };
        rb.setTranslation(playerWorld, true);
        rb.setNextKinematicTranslation(playerWorld);
        return;
      }
    }

    // After processing logical steps, compute authoritative interpolation fraction from the accumulator
    interpRef.current = Math.min(1, tickRef.current / stepInterval);

    // visual interpolation using authoritative interpRef
    const prev = gridToWorld(prevGridRef.current.gx, prevGridRef.current.gz);
    const cur = gridToWorld(curGridRef.current.gx, curGridRef.current.gz);
    const pos = prev.clone().lerp(cur, interpRef.current);
    rb.setNextKinematicTranslation(pos);

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
      </RigidBody>
      <group ref={visualRef} name="player-visual" position={[0, 0.5, 0]}>
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
      </group>

    </group>
  );
}

export default function Scene() {
  const mazeMatrix = useGameStore((s) => s.mazeMatrix);
  const enemyPositions = useGameStore((s) => s.enemyPositions ?? []);
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
        {enemyPositions.map((enemy) => (
          <Enemy key={enemy.id} enemy={enemy} />
        ))}
        <Food />
        <VFXManager />
      </Physics>

      <Environment preset="city" />
      <ContactShadows position={[0, -0.001, 0]} opacity={0.4} scale={Math.max(cols, rows)} blur={2.3} far={16} />
    </>
  );
}
