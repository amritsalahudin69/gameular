import { useEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useVFXStore, VFX_EVENTS } from './VFXStore';
import { useGameStore } from './Store';

/**
 * VFXManager
 *
 * Central manager for VFX lifecycle and rendering.
 * Listens to VFX store and manages spawn → play → complete → cleanup.
 *
 * P21: Implements lightweight merge/food VFX.
 * - No particle engine
 * - No new dependencies
 * - Procedural geometries (reused)
 * - Quick cleanup (proven 30+ merges safe)
 */

// Shared geometries (reuse across all effects)
const ringGeometry = new THREE.TorusGeometry(0.5, 0.1, 8, 16);
const burstGeometry = new THREE.IcosahedronGeometry(0.05, 0);
const baseMaterial = new THREE.MeshStandardMaterial({
  emissive: 0xffff00,
  emissiveIntensity: 1.5,
  toneMapped: false,
});

const ENEMY_ALERT_MS = 360;
const ENEMY_ATTACK_MS = 160;
const enemyPulseGeometry = new THREE.RingGeometry(0.66, 0.74, 24);
const enemyAlertMaterial = new THREE.MeshBasicMaterial({
  color: 0x22ddff, transparent: true, opacity: 0.85,
  depthWrite: false, toneMapped: false,
});
const enemyAttackMaterial = new THREE.MeshBasicMaterial({
  color: 0xff4466, transparent: true, opacity: 0.85,
  depthWrite: false, toneMapped: false,
});

export default function VFXManager() {
  const activeVFX = useVFXStore((state) => state.activeVFX);
  // Reset synchronously at session boundaries, without touching merge timing.
  useEffect(() => {
    const clear = () => useVFXStore.getState().clearVFX();
    const unsubscribe = useGameStore.subscribe((state, previous) => {
      if (state.sessionId !== previous.sessionId || (
        state.gameState === 'gameover' && previous.gameState !== 'gameover'
      )) clear();
    });
    return () => {
      unsubscribe();
      clear();
    };
  }, []);

  // Render VFX effects
  return (
    <group name="vfx-manager">
      {Object.values(activeVFX).map((vfx) => (
        <VFXEffect key={vfx.id} vfx={vfx} />
      ))}
    </group>
  );
}

/**
 * VFXEffect
 * Individual VFX effect renderer.
 * P21: Implements food/merge effects
 */
function VFXEffect({ vfx }) {
  const playVFX = useVFXStore((state) => state.playVFX);
  const completeVFX = useVFXStore((state) => state.completeVFX);
  const { id, type } = vfx;

  // One lifetime per keyed instance, including events with no visual yet.
  // Changes to other active events never restart this timer.
  useEffect(() => {
    playVFX(id);
    const duration = type === VFX_EVENTS.FOOD_EAT ? 400
      : type === VFX_EVENTS.ENEMY_ALERT ? ENEMY_ALERT_MS
      : type === VFX_EVENTS.ENEMY_ATTACK ? ENEMY_ATTACK_MS : 600;
    const timer = setTimeout(() => completeVFX(id), duration);
    return () => clearTimeout(timer);
  }, [id, type, playVFX, completeVFX]);

  switch (vfx.type) {
    case VFX_EVENTS.FOOD_EAT:
      return <FoodEatEffect vfx={vfx} />;

    case VFX_EVENTS.MERGE_RESULT:
      return <MergeResultEffect vfx={vfx} />;

    case VFX_EVENTS.ENEMY_ALERT:
      return <EnemyPulseEffect vfx={vfx} alert />;

    case VFX_EVENTS.ENEMY_ATTACK:
      return <EnemyPulseEffect vfx={vfx} />;

    case VFX_EVENTS.PLAYER_DEATH:
      // P21+: Death explosion
      return null;

    default:
      return null;
  }
}

// A ground ring at the dispatched step origin; no gameplay/store writes.
function EnemyPulseEffect({ vfx, alert = false }) {
  const meshRef = useRef(null);
  const startRef = useRef(Date.now());
  const duration = alert ? ENEMY_ALERT_MS : ENEMY_ATTACK_MS;

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const progress = Math.min((Date.now() - startRef.current) / duration, 1);
    mesh.visible = progress < 1;
    mesh.scale.setScalar(alert
      ? 0.65 + Math.sin(progress * Math.PI) * 0.45
      : 0.35 + progress * 0.65);
  });

  const position = vfx.enemyPosition;
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return null;

  return (
    <mesh
      ref={meshRef}
      name={`enemy-${alert ? 'alert' : 'attack'}-${vfx.id}`}
      position={[position.x, 0.04, position.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={alert ? 0.65 : 0.35}
      renderOrder={1}
    >
      <primitive object={enemyPulseGeometry} attach="geometry" />
      <primitive object={alert ? enemyAlertMaterial : enemyAttackMaterial} attach="material" />
    </mesh>
  );
}

/**
 * FoodEatEffect
 * Brief burst of particles at food position
 */
function FoodEatEffect({ vfx }) {
  const groupRef = useRef();
  const spawnTimeRef = useRef(Date.now());
  const burstInstancesRef = useRef([]);

  // Create burst particles
  useMemo(() => {
    burstInstancesRef.current = Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2;
      const speed = 2 + Math.random() * 1;
      return {
        x: Math.cos(angle) * speed,
        z: Math.sin(angle) * speed,
        life: 1,
        opacity: 1,
      };
    });
  }, []);

  useFrame(() => {
    if (!groupRef.current) return;
    const elapsed = (Date.now() - spawnTimeRef.current) / 1000;
    const progress = Math.min(elapsed / 0.4, 1);

    // Animate burst
    groupRef.current.children.forEach((child, idx) => {
      const burst = burstInstancesRef.current[idx];
      if (burst) {
        child.position.x += burst.x * 0.016; // frame-independent
        child.position.z += burst.z * 0.016;
        child.material.opacity = Math.max(0, 1 - progress * 2);
      }
    });
  });

  return (
    <group ref={groupRef} position={[vfx.position.x, 0.5, vfx.position.z]}>
      {/* Impact ring */}
      <mesh scale={[0.5, 0.5, 0.5]}>
        <torusGeometry args={[0.5, 0.1, 8, 16]} />
        <meshStandardMaterial
          emissive={0xffaa00}
          emissiveIntensity={1.2}
          toneMapped={false}
          transparent
        />
      </mesh>

      {/* Burst particles */}
      {burstInstancesRef.current.map((_, i) => (
        <mesh key={i} scale={[0.1, 0.1, 0.1]}>
          <icosahedronGeometry args={[0.05, 0]} />
          <meshStandardMaterial
            emissive={0xffaa00}
            emissiveIntensity={1.2}
            toneMapped={false}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * MergeResultEffect
 * Expanding ring + result value pop animation
 */
function MergeResultEffect({ vfx }) {
  const groupRef = useRef();
  const spawnTimeRef = useRef(Date.now());
  const textMeshRef = useRef();

  useFrame(() => {
    if (!groupRef.current) return;
    const elapsed = (Date.now() - spawnTimeRef.current) / 1000;
    const progress = Math.min(elapsed / 0.6, 1);

    // Expanding ring
    const ringChild = groupRef.current.children[0];
    if (ringChild) {
      const scale = 0.3 + progress * 2.5;
      ringChild.scale.set(scale, scale, scale);
      ringChild.material.opacity = Math.max(0, 1 - progress * 2);
    }

    // Result text scale/fade
    if (textMeshRef.current) {
      const textChild = groupRef.current.children[1];
      if (textChild) {
        const textScale = 0.5 + progress * 1.5;
        textChild.scale.set(textScale, textScale, textScale);
        textChild.material.opacity = Math.max(0, 1 - progress * 1.8);
      }
    }
  });

  // Create result value text as sprite
  const resultValueText = String(vfx.value || '?');

  return (
    <group ref={groupRef} position={[vfx.position.x, 0.5, vfx.position.z]}>
      {/* Expanding ring */}
      <mesh ref={textMeshRef}>
        <torusGeometry args={[0.6, 0.12, 8, 16]} />
        <meshStandardMaterial
          emissive={0xffff00}
          emissiveIntensity={1.5}
          toneMapped={false}
          transparent
        />
      </mesh>

      {/* Result value indicator (simple colored sphere) */}
      <sprite position={[0, 0.3, 0]} scale={[0.4, 0.4, 1]}>
        <spriteMaterial
          color={getResultColor(vfx.value)}
          transparent
          emissive={getResultColor(vfx.value)}
          emissiveIntensity={0.8}
        />
      </sprite>
    </group>
  );
}

/**
 * Get color based on merge result value
 * Provides visual feedback based on the resulting number
 */
function getResultColor(value) {
  const v = value || 1;
  // Cycle through colors based on value
  const hue = (v % 6) / 6; // 0-1 hue
  const color = new THREE.Color();
  color.setHSL(hue, 0.8, 0.6);
  return color;
}
