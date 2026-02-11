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
import { MAZE_MATRIX, useGameStore } from './Store';

const MOVE_SPEED = 4.8;
const TRAIL_GAP = 8;
const CAMERA_OFFSET = new THREE.Vector3(0, 7.5, 8.5);

function Map() {
  const instances = useMemo(() => {
    const rows = MAZE_MATRIX.length;
    const cols = MAZE_MATRIX[0].length;
    const ox = (cols - 1) / 2;
    const oz = (rows - 1) / 2;
    const data = [];

    for (let z = 0; z < rows; z += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (MAZE_MATRIX[z][x] === 1) {
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
  }, []);

  return (
    <group>
      <mesh receiveShadow position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 24]} />
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
  const historyRef = useRef([]);
  const tickRef = useRef(0);
  const dirRef = useRef(new THREE.Vector3(0, 0, 1));
  const targetRef = useRef(new THREE.Vector3(0, 0.5, 0));

  const segmentCount = useGameStore((s) => s.snakeSegments.length - 1);
  const gameState = useGameStore((s) => s.gameState);
  const gameOver = useGameStore((s) => s.gameOver);
  const syncSnakeSegments = useGameStore((s) => s.syncSnakeSegments);
  const [, getKeys] = useKeyboardControls();
  const { camera } = useThree();

  useEffect(() => {
    if (gameState !== 'playing') return;

    targetRef.current.set(0, 0.5, 0);
    dirRef.current.set(0, 0, 1);
    tickRef.current = 0;
    historyRef.current.length = 0;
    segmentRefs.current.forEach((segment, i) => {
      if (!segment) return;
      segment.position.set(0, 0.5, -(i + 1) * 0.7);
    });
    bodyRef.current?.setNextKinematicTranslation({ x: 0, y: 0.5, z: 0 });
    camera.position.set(0, 7.5, 8.5);
    camera.lookAt(0, 0.5, 0);
  }, [camera, gameState]);

  useFrame((_, delta) => {
    const rb = bodyRef.current;
    if (!rb || gameState !== 'playing') return;

    const keys = getKeys();
    const inputX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const inputZ = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);

    if (inputX !== 0 || inputZ !== 0) {
      dirRef.current.set(inputX, 0, inputZ).normalize();
    }

    const step = dirRef.current.clone().multiplyScalar(MOVE_SPEED * delta);
    targetRef.current.add(step);

    rb.setNextKinematicTranslation(targetRef.current);

    const headPos = rb.translation();
    const head = new THREE.Vector3(headPos.x, headPos.y, headPos.z);

    historyRef.current.unshift(head.clone());
    const maxHistory = (segmentRefs.current.length + 3) * TRAIL_GAP;
    if (historyRef.current.length > maxHistory) historyRef.current.length = maxHistory;

    segmentRefs.current.forEach((segment, i) => {
      if (!segment) return;
      const target = historyRef.current[Math.min((i + 1) * TRAIL_GAP, historyRef.current.length - 1)] ?? head;
      segment.position.lerp(target, Math.min(1, delta * 16));
    });

    const camTarget = head.clone().add(CAMERA_OFFSET);
    camera.position.lerp(camTarget, Math.min(1, delta * 4.5));
    camera.lookAt(head.x, head.y + 0.6, head.z);

    tickRef.current += delta;
    if (tickRef.current > 1 / 12) {
      tickRef.current = 0;
      const segments = [
        { x: head.x, y: head.y, z: head.z },
        ...segmentRefs.current.map((seg) => ({
          x: seg?.position.x ?? head.x,
          y: seg?.position.y ?? head.y,
          z: seg?.position.z ?? head.z,
        })),
      ];
      syncSnakeSegments(segments);
    }

    if (Math.abs(head.x) > 14 || Math.abs(head.z) > 11) {
      gameOver();
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
          <sphereGeometry args={[0.4, 16, 16]} />
          <meshStandardMaterial color="#7dd3fc" roughness={0.45} metalness={0.2} />
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
          <meshStandardMaterial color="#22d3ee" roughness={0.5} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

export default function Scene() {
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
      <ContactShadows position={[0, -0.001, 0]} opacity={0.4} scale={32} blur={2.3} far={16} />
    </>
  );
}
