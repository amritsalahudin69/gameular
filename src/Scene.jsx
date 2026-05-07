import { useEffect, useMemo, useRef } from 'react';
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

const MOVE_SPEED = 4.8;
const TRAIL_GAP = 8;
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
  const eatFood = useGameStore((s) => s.eatFood);

  return (
    <RigidBody
      type="fixed"
      sensor
      colliders={false}
      position={[foodPosition.x, foodPosition.y, foodPosition.z]}
      onIntersectionEnter={(payload) => {
        if (payload.other.rigidBodyObject?.name === 'player-head') {
          eatFood();
        }
      }}
    >
      <CuboidCollider args={[0.3, 0.3, 0.3]} sensor />
      <mesh castShadow>
        <icosahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color="#ff8c42" roughness={0.35} metalness={0.15} />
      </mesh>
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
  const dirRef = useRef({ x: 0, z: 1 }); // grid directions
  const prevGridRef = useRef({ gx: 0, gz: 0 });
  const curGridRef = useRef({ gx: 0, gz: 0 });
  const interpRef = useRef(1);

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

  useEffect(() => {
    if (gameState !== 'playing') return;
    // Initialize grid positions from current stored snake head (if present)
    const headWorld = useGameStore.getState().snakeSegments?.[0] ?? { x: 0, y: 0.5, z: 0 };
    const headGX = Math.round(headWorld.x + ox);
    const headGZ = Math.round(headWorld.z + oz);
    prevGridRef.current = { gx: headGX, gz: headGZ };
    curGridRef.current = { gx: headGX, gz: headGZ };
    interpRef.current = 1;
    gridHistoryRef.current = [{ gx: headGX, gz: headGZ }];

    segmentRefs.current.forEach((segment, i) => {
      if (!segment) return;
      const p = gridToWorld(headGX, headGZ - (i + 1));
      segment.position.set(p.x, p.y, p.z);
    });

    bodyRef.current?.setNextKinematicTranslation(gridToWorld(headGX, headGZ));
    camera.position.copy(CAMERA_BASE);
    camera.lookAt(0, 0.5, 0);
  }, [camera, gameState, mazeMatrix]);

  // keyboard fallback
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
      const cur = dirRef.current;
      if (dx === -cur.x && dz === -cur.z) return;
      dirRef.current = { x: dx, z: dz };
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

    // update segments visuals by following gridHistory
    const maxHistory = (segmentRefs.current.length + 3) * TRAIL_GAP;
    if (gridHistoryRef.current.length > maxHistory) gridHistoryRef.current.length = maxHistory;

    segmentRefs.current.forEach((segment, i) => {
      if (!segment) return;
      const histIndex = Math.min((i + 1) * TRAIL_GAP, gridHistoryRef.current.length - 1);
      const targetGrid = gridHistoryRef.current[histIndex] ?? curGridRef.current;
      const targetWorld = gridToWorld(targetGrid.gx, targetGrid.gz);
      segment.position.lerp(targetWorld, Math.min(1, delta * 16));
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
      tickRef.current = 0;

      const stepDir = dirRef.current;
      const nextGX = curGridRef.current.gx + stepDir.x;
      const nextGZ = curGridRef.current.gz + stepDir.z;

      // bounds
      if (nextGX < 0 || nextGX >= cols || nextGZ < 0 || nextGZ >= rows) {
        gameOver();
        return;
      }

      // wall
      if (mazeMatrix[nextGZ][nextGX] === 1) {
        gameOver();
        return;
      }

      // advance grid
      prevGridRef.current = { ...curGridRef.current };
      curGridRef.current = { gx: nextGX, gz: nextGZ };
      interpRef.current = 0;

      // push to history (head first)
      gridHistoryRef.current.unshift({ gx: nextGX, gz: nextGZ });

      // prepare segments positions for store sync (world positions)
      const segmentsWorld = [
        gridToWorld(nextGX, nextGZ),
        ...segmentRefs.current.map((seg) => ({ x: seg?.position.x ?? cur.x, y: seg?.position.y ?? cur.y, z: seg?.position.z ?? cur.z })),
      ];

      syncSnakeSegments(segmentsWorld.map((v) => ({ x: v.x, y: v.y, z: v.z })));
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
        <mesh castShadow>
          {skin.headShape === 'box' ? (
            <boxGeometry args={[0.72, 0.72, 0.72]} />
          ) : skin.headShape === 'gem' ? (
            <dodecahedronGeometry args={[0.46, 0]} />
          ) : (
            <sphereGeometry args={[0.4, 16, 16]} />
          )}
          <meshStandardMaterial color={skin.headColor} roughness={0.45} metalness={0.2} />
        </mesh>
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
