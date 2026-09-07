import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore } from './Store';

const enemyTextureCache = new Map();
const enemyTextureLoads = new Map();
const textureLoader = new THREE.TextureLoader();
const DEFAULT_ENEMY_SPRITE = '/assets/enemies/ghost.png';
const ENEMY_STEP_INTERVAL = 0.32;
const ATTACK_STEP_LIMIT = 3;
const ATTACK_COOLDOWN_STEPS = 8;
const ATTACK_OPPORTUNITY_STEPS = 6;
const DIRECTIONS = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
];

const sameDirection = (a, b) => a.x === b.x && a.z === b.z;
const reverseDirection = (direction) => ({ x: -direction.x, z: -direction.z });

export default function Enemy({ enemy }) {
  const bodyRef = useRef(null);
  const tickRef = useRef(0);
  const prevGridRef = useRef({ gx: 0, gz: 0 });
  const curGridRef = useRef({ gx: 0, gz: 0 });
  const interpRef = useRef(1);
  const directionRef = useRef({ x: 0, z: 1 });
  const behaviorRef = useRef('ROAM');
  const attackStepsRef = useRef(0);
  const cooldownStepsRef = useRef(0);
  const opportunityStepsRef = useRef(0);
  const gameState = useGameStore((s) => s.gameState);
  const mergeFeedback = useGameStore((s) => s.mergeFeedback);
  const mazeMatrix = useGameStore((s) => s.mazeMatrix);
  const levelConfig = useGameStore((s) => s.levelConfig);
  const syncEnemyPosition = useGameStore((s) => s.syncEnemyPosition);
  const gameOver = useGameStore((s) => s.gameOver);
  const [enemyTexture, setEnemyTexture] = useState(null);
  const enemySprite = typeof levelConfig?.enemySprite === 'string' && levelConfig.enemySprite.trim()
    ? levelConfig.enemySprite.trim()
    : DEFAULT_ENEMY_SPRITE;

  useEffect(() => {
    let mounted = true;
    setEnemyTexture(null);

    const cached = enemyTextureCache.get(enemySprite);
    if (cached !== undefined) {
      setEnemyTexture(cached);
      return () => { mounted = false; };
    }

    const pending = enemyTextureLoads.get(enemySprite);
    const onLoaded = (texture) => {
      if (mounted) setEnemyTexture(texture && texture.isTexture ? texture : null);
    };
    if (pending) {
      pending.push(onLoaded);
      return () => { mounted = false; };
    }

    enemyTextureLoads.set(enemySprite, [onLoaded]);
    textureLoader.load(
      enemySprite,
      (texture) => {
        const safeTexture = texture && texture.isTexture ? texture : null;
        enemyTextureCache.set(enemySprite, safeTexture);
        const callbacks = enemyTextureLoads.get(enemySprite) || [];
        enemyTextureLoads.delete(enemySprite);
        callbacks.forEach((callback) => callback(safeTexture));
      },
      undefined,
      () => {
        enemyTextureCache.set(enemySprite, null);
        const callbacks = enemyTextureLoads.get(enemySprite) || [];
        enemyTextureLoads.delete(enemySprite);
        callbacks.forEach((callback) => callback(null));
      },
    );

    return () => { mounted = false; };
  }, [enemySprite]);

  const gridToWorld = (gx, gz) => new THREE.Vector3(
    gx - (mazeMatrix[0].length - 1) / 2,
    0.5,
    gz - (mazeMatrix.length - 1) / 2,
  );

  useEffect(() => {
    const position = enemy;
    if (!position) return;
    prevGridRef.current = { gx: position.gx, gz: position.gz };
    curGridRef.current = { gx: position.gx, gz: position.gz };
    interpRef.current = 1;
    tickRef.current = 0;
    directionRef.current = { x: 0, z: 1 };
    behaviorRef.current = 'ROAM';
    attackStepsRef.current = 0;
    cooldownStepsRef.current = 0;
    opportunityStepsRef.current = 0;
    bodyRef.current?.setNextKinematicTranslation(gridToWorld(position.gx, position.gz));
  }, [enemy?.id, gameState, mazeMatrix]);

  useFrame((_, delta) => {
    const rb = bodyRef.current;
    if (!rb || !enemy || gameState !== 'playing' || mergeFeedback) return;

    tickRef.current += delta;
    while (tickRef.current >= ENEMY_STEP_INTERVAL) {
      tickRef.current -= ENEMY_STEP_INTERVAL;

      const current = curGridRef.current;
      const isWalkable = (gx, gz) => (
        gz >= 0
        && gx >= 0
        && gz < mazeMatrix.length
        && gx < mazeMatrix[0].length
        && mazeMatrix[gz][gx] === 0
      );
      const validDirections = DIRECTIONS.filter((direction) => (
        isWalkable(current.gx + direction.x, current.gz + direction.z)
      ));
      if (!validDirections.length) {
        behaviorRef.current = 'ROAM';
        attackStepsRef.current = 0;
        cooldownStepsRef.current = ATTACK_COOLDOWN_STEPS;
        opportunityStepsRef.current = 0;
        continue;
      }

      const player = useGameStore.getState().playerPosition;
      const playerGX = player
        ? Math.round(player.gx ?? player.x + (mazeMatrix[0].length - 1) / 2)
        : null;
      const playerGZ = player
        ? Math.round(player.gz ?? player.z + (mazeMatrix.length - 1) / 2)
        : null;

      if (cooldownStepsRef.current > 0) cooldownStepsRef.current -= 1;

      if (
        behaviorRef.current === 'ROAM'
        && cooldownStepsRef.current === 0
        && playerGX !== null
        && playerGZ !== null
      ) {
        opportunityStepsRef.current += 1;
        const hasChoice = validDirections.length > 1;
        if (opportunityStepsRef.current >= ATTACK_OPPORTUNITY_STEPS && hasChoice) {
          behaviorRef.current = 'ATTACK';
          attackStepsRef.current = ATTACK_STEP_LIMIT;
          opportunityStepsRef.current = 0;
        }
      }

      const reverse = reverseDirection(directionRef.current);
      const nonReverse = validDirections.filter((direction) => !sameDirection(direction, reverse));
      const canContinue = validDirections.find((direction) => sameDirection(direction, directionRef.current));
      let nextDirection;

      if (behaviorRef.current === 'ATTACK' && playerGX !== null && playerGZ !== null) {
        const distance = (direction) => (
          Math.abs(current.gx + direction.x - playerGX)
          + Math.abs(current.gz + direction.z - playerGZ)
        );
        nextDirection = validDirections
          .slice()
          .sort((a, b) => distance(a) - distance(b))[0];
      } else {
        const candidates = canContinue ? [canContinue] : (nonReverse.length ? nonReverse : validDirections);
        nextDirection = candidates[Math.floor(Math.random() * candidates.length)];
      }
      directionRef.current = nextDirection;

      const nextGrid = {
        gx: current.gx + nextDirection.x,
        gz: current.gz + nextDirection.z,
      };
      if (playerGX === nextGrid.gx && playerGZ === nextGrid.gz) {
        gameOver();
        return;
      }

      prevGridRef.current = { ...current };
      curGridRef.current = nextGrid;
      interpRef.current = 0;
      syncEnemyPosition(enemy.id, {
        ...gridToWorld(nextGrid.gx, nextGrid.gz),
        gx: nextGrid.gx,
        gz: nextGrid.gz,
      });

      if (behaviorRef.current === 'ATTACK') {
        attackStepsRef.current -= 1;
        if (attackStepsRef.current <= 0) {
          behaviorRef.current = 'ROAM';
          cooldownStepsRef.current = ATTACK_COOLDOWN_STEPS;
          opportunityStepsRef.current = 0;
        }
      }
    }

    interpRef.current = Math.min(1, tickRef.current / ENEMY_STEP_INTERVAL);
    const prev = gridToWorld(prevGridRef.current.gx, prevGridRef.current.gz);
    const current = gridToWorld(curGridRef.current.gx, curGridRef.current.gz);
    rb.setNextKinematicTranslation(prev.lerp(current, interpRef.current));
  });

  if (!enemy) return null;

  return (
    <RigidBody
      ref={bodyRef}
      type="kinematicPosition"
      colliders={false}
      position={[0, 0.5, 0]}
      name="maze-enemy"
    >
      {enemyTexture ? (
        <sprite position={[0, 0, 0]} scale={[0.9, 0.9, 1]}>
          <spriteMaterial
            attach="material"
            map={enemyTexture}
            transparent
            depthWrite={false}
          />
        </sprite>
      ) : (
        <mesh castShadow>
          <icosahedronGeometry args={[0.38, 1]} />
          <meshStandardMaterial color="#ef4444" emissive="#7f1d1d" emissiveIntensity={0.35} roughness={0.4} />
        </mesh>
      )}
    </RigidBody>
  );
}
