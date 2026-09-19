import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore } from './Store';
import { dispatchEnemyAlert, dispatchEnemyAttack, dispatchPlayerDeath } from './VFXStore';

const enemyTextureCache = new Map();
const enemyTextureLoads = new Map();
const textureLoader = new THREE.TextureLoader();
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
  const visualRef = useRef(null);
  const visualFromRef = useRef(new THREE.Vector3());
  const visualTargetRef = useRef(new THREE.Vector3());
  const visualElapsedRef = useRef(0);
  const tickRef = useRef(0);
  const readySessionRef = useRef(null);
  const prevGridRef = useRef({ gx: 0, gz: 0 });
  const curGridRef = useRef({ gx: 0, gz: 0 });
  const interpRef = useRef(1);
  const directionRef = useRef({ x: 0, z: 1 });
  const behaviorRef = useRef('ROAM');
  const attackStepsRef = useRef(0);
  const cooldownStepsRef = useRef(0);
  const opportunityStepsRef = useRef(0);
  const gameState = useGameStore((s) => s.gameState);
  const sessionId = useGameStore((s) => s.sessionId);
  const mergeFeedback = useGameStore((s) => s.mergeFeedback);
  const mazeMatrix = useGameStore((s) => s.mazeMatrix);
  const levelConfig = useGameStore((s) => s.levelConfig);
  const syncEnemyPosition = useGameStore((s) => s.syncEnemyPosition);
  const gameOver = useGameStore((s) => s.gameOver);
  const enemySprites = useMemo(() => (
    Array.isArray(levelConfig?.enemySprites)
      ? levelConfig.enemySprites.filter((path) => typeof path === 'string' && path.trim().length > 0)
      : []
  ), [levelConfig?.enemySprites]);
  // Spawn IDs keep their original index across movement and restart.
  const enemyIndex = Number(/^enemy-(\d+)$/.exec(enemy?.id ?? '')?.[1] ?? 0);
  const legacySprite = typeof levelConfig?.enemySprite === 'string' && levelConfig.enemySprite.trim()
    ? levelConfig.enemySprite.trim()
    : null;
  const enemySprite = enemySprites.length
    ? enemySprites[enemyIndex % enemySprites.length]
    : legacySprite;
  const [enemyTexture, setEnemyTexture] = useState(() => enemyTextureCache.get(enemySprite) ?? null);

  useEffect(() => {
    let mounted = true;
    if (!enemySprite) {
      setEnemyTexture(null);
      return () => { mounted = false; };
    }

    const cached = enemyTextureCache.get(enemySprite);
    if (cached !== undefined) {
      setEnemyTexture(cached);
      return () => { mounted = false; };
    }

    const pending = enemyTextureLoads.get(enemySprite);
    const onLoaded = (texture) => {
      if (mounted && texture?.isTexture) setEnemyTexture(texture);
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
        if (safeTexture) {
          safeTexture.magFilter = safeTexture.minFilter = THREE.NearestFilter;
          safeTexture.generateMipmaps = false;
          safeTexture.colorSpace = THREE.SRGBColorSpace;
        }
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

  const ox = (mazeMatrix[0].length - 1) / 2;
  const oz = (mazeMatrix.length - 1) / 2;
  const gridToWorld = (gx, gz) => new THREE.Vector3(gx - ox, 0.5, gz - oz);

  useEffect(() => {
    const position = enemy;
    if (!position) return;
    prevGridRef.current = { gx: position.gx, gz: position.gz };
    curGridRef.current = { gx: position.gx, gz: position.gz };
    interpRef.current = 1;
    readySessionRef.current = sessionId;
    tickRef.current = 0;
    directionRef.current = { x: 0, z: 1 };
    behaviorRef.current = 'ROAM';
    attackStepsRef.current = 0;
    cooldownStepsRef.current = 0;
    opportunityStepsRef.current = 0;
    const spawn = gridToWorld(position.gx, position.gz);
    visualRef.current?.position.copy(spawn);
    visualFromRef.current.copy(spawn);
    visualTargetRef.current.copy(spawn);
    visualElapsedRef.current = ENEMY_STEP_INTERVAL;
    bodyRef.current?.setTranslation(spawn, true);
    bodyRef.current?.setNextKinematicTranslation(spawn);
  }, [enemy?.id, sessionId, mazeMatrix]);

  useEffect(() => {
    if (gameState === 'playing' && !mergeFeedback) return;
    tickRef.current = 0;
    prevGridRef.current = { ...curGridRef.current };
    const position = gridToWorld(curGridRef.current.gx, curGridRef.current.gz);
    bodyRef.current?.setTranslation(position, true);
    bodyRef.current?.setNextKinematicTranslation(position);
  }, [gameState, mergeFeedback]);

  useFrame((_, delta) => {
    const rb = bodyRef.current;
    const state = useGameStore.getState();
    if (!rb || !enemy || state.sessionId !== sessionId || readySessionRef.current !== sessionId) return;
    if (state.gameState !== 'playing' || state.mergeFeedback) {
      tickRef.current = 0;
      return;
    }

    // Rendering is independent of the authoritative grid and Rapier's interpolation.
    visualElapsedRef.current = Math.min(ENEMY_STEP_INTERVAL, visualElapsedRef.current + delta);
    visualRef.current.position.lerpVectors(
      visualFromRef.current, visualTargetRef.current, visualElapsedRef.current / ENEMY_STEP_INTERVAL,
    );

    // A stalled frame gets at most one step and no leftover pre-stall debt.
    // Normal frames retain their remainder to preserve the 0.32-second cadence.
    if (delta >= ENEMY_STEP_INTERVAL) tickRef.current = 0;
    tickRef.current += Math.min(delta, ENEMY_STEP_INTERVAL);
    while (tickRef.current >= ENEMY_STEP_INTERVAL) {
      const live = useGameStore.getState();
      if (live.sessionId !== sessionId || live.gameState !== 'playing' || live.mergeFeedback) {
        tickRef.current = 0;
        return;
      }
      tickRef.current -= ENEMY_STEP_INTERVAL;

      const current = curGridRef.current;
      const isWalkable = (gx, gz) => (
        gz >= 0
        && gx >= 0
        && gz < mazeMatrix.length
        && gx < mazeMatrix[0].length
        && mazeMatrix[gz][gx] === 0
      );
      const walkableDirections = DIRECTIONS.filter((direction) => (
        isWalkable(current.gx + direction.x, current.gz + direction.z)
      ));
      if (!walkableDirections.length) {
        behaviorRef.current = 'ROAM';
        attackStepsRef.current = 0;
        cooldownStepsRef.current = ATTACK_COOLDOWN_STEPS;
        opportunityStepsRef.current = 0;
        continue;
      }

      // Occupied cells are blocked too: let the existing direction selection
      // use another available exit instead of retrying the same occupied cell.
      const validDirections = walkableDirections.filter((direction) => (
        !live.enemyPositions.some((other) => (
          other.id !== enemy.id
          && other.gx === current.gx + direction.x
          && other.gz === current.gz + direction.z
        ))
      ));
      // A temporary blockage consumes this tick, not an AI movement step.
      if (!validDirections.length) continue;

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
        // Preserve the existing wall-junction attack opportunity rule.
        const hasChoice = walkableDirections.length > 1;
        if (opportunityStepsRef.current >= ATTACK_OPPORTUNITY_STEPS && hasChoice) {
          behaviorRef.current = 'ATTACK';
          attackStepsRef.current = ATTACK_STEP_LIMIT;
          opportunityStepsRef.current = 0;
          // Dispatch ENEMY_ALERT VFX event
          dispatchEnemyAlert({
            enemyId: enemy.id,
            enemyPosition: {
              x: current.gx - ox,
              z: current.gz - oz,
              gx: current.gx,
              gz: current.gz,
            },
            targetPosition: {
              x: playerGX - ox,
              z: playerGZ - oz,
              gx: playerGX,
              gz: playerGZ,
            },
          });
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
        // Dispatch ENEMY_ATTACK VFX event for each attack step
        dispatchEnemyAttack({
          enemyId: enemy.id,
          enemyPosition: {
            x: current.gx - ox,
            z: current.gz - oz,
            gx: current.gx,
            gz: current.gz,
          },
          playerPosition: {
            x: playerGX - ox,
            z: playerGZ - oz,
            gx: playerGX,
            gz: playerGZ,
          },
        });
      } else {
        const candidates = canContinue ? [canContinue] : (nonReverse.length ? nonReverse : validDirections);
        nextDirection = candidates[Math.floor(Math.random() * candidates.length)];
      }
      directionRef.current = nextDirection;

      const nextGrid = {
        gx: current.gx + nextDirection.x,
        gz: current.gz + nextDirection.z,
      };
      // Keep logical enemy cells unique without changing the AI's direction choice.
      if (live.enemyPositions.some((other) => (
        other.id !== enemy.id && other.gx === nextGrid.gx && other.gz === nextGrid.gz
      ))) continue;

      prevGridRef.current = { ...current };
      curGridRef.current = nextGrid;
      interpRef.current = 0;
      visualFromRef.current.copy(visualRef.current.position);
      visualTargetRef.current.copy(gridToWorld(nextGrid.gx, nextGrid.gz));
      visualElapsedRef.current = 0;
      syncEnemyPosition(enemy.id, {
        ...gridToWorld(nextGrid.gx, nextGrid.gz),
        gx: nextGrid.gx,
        gz: nextGrid.gz,
      });

      // Collision uses committed cells, never the proposed step or visual position.
      const committed = useGameStore.getState();
      if (committed.sessionId !== sessionId || committed.gameState !== 'playing' || committed.mergeFeedback) return;
      const committedEnemy = committed.enemyPositions.find((position) => position.id === enemy.id);
      const committedPlayer = committed.playerPosition;
      const committedPlayerGX = committedPlayer.gx ?? committedPlayer.x + (mazeMatrix[0].length - 1) / 2;
      const committedPlayerGZ = committedPlayer.gz ?? committedPlayer.z + (mazeMatrix.length - 1) / 2;
      if (committedEnemy?.gx === committedPlayerGX && committedEnemy?.gz === committedPlayerGZ) {
        // Dispatch PLAYER_DEATH VFX event
        dispatchPlayerDeath({
          playerPosition: {
            x: committedPlayer.x,
            z: committedPlayer.z,
            gx: committedPlayerGX,
            gz: committedPlayerGZ,
          },
          currentValue: committed.currentValue,
        });
        gameOver();
        return;
      }

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
    <>
    <RigidBody
      ref={bodyRef}
      type="kinematicPosition"
      colliders={false}
      position={[0, 0.5, 0]}
      name="maze-enemy"
    />
    <group ref={visualRef} name={`enemy-visual-${enemy.id}`} position={[0, 0.5, 0]} frustumCulled={false}>
      {enemyTexture ? (
        <sprite position={[0, 0, 0]} scale={[2, 2, 1.5]} renderOrder={10} frustumCulled={false}> {/* ukuran sprite disesuaikan dengan ukuran Nenemies */}
          <spriteMaterial
            attach="material"
            map={enemyTexture}
            transparent
            alphaTest={0.1}
            depthTest={false}
            depthWrite={false}
          />
        </sprite>
      ) : (
        <mesh castShadow>
          <icosahedronGeometry args={[0.38, 1]} />
          <meshStandardMaterial color="#ef4444" emissive="#7f1d1d" emissiveIntensity={0.35} roughness={0.4} />
        </mesh>
      )}
    </group>
    </>
  );
}
