import { create } from 'zustand';

// VFX Event Types
export const VFX_EVENTS = {
  FOOD_EAT: 'FOOD_EAT',
  MERGE_RESULT: 'MERGE_RESULT',
  ENEMY_ALERT: 'ENEMY_ALERT',
  ENEMY_ATTACK: 'ENEMY_ATTACK',
  PLAYER_DEATH: 'PLAYER_DEATH',
};

// Create unique ID for each VFX instance
let vfxIdCounter = 0;
const generateVFXId = () => {
  vfxIdCounter += 1;
  return `vfx-${vfxIdCounter}-${Date.now()}`;
};

/**
 * VFX Store
 *
 * Manages VFX event lifecycle:
 * spawn → play → complete → cleanup
 *
 * Active VFX are stored with unique IDs.
 * When an effect completes, it's automatically removed.
 */
export const useVFXStore = create((set) => ({
  // Map of active VFX: { vfxId → vfx event data }
  activeVFX: {},

  /**
   * Spawn a VFX effect
   * Returns the unique vfxId for tracking
   */
  spawnVFX: (eventType, data) =>
    set((state) => {
      const vfxId = generateVFXId();
      const vfx = {
        id: vfxId,
        type: eventType,
        timestamp: Date.now(),
        ...data,
        // state: 'spawn' → 'play' → 'complete' → removed
        state: 'spawn',
      };
      return {
        activeVFX: {
          ...state.activeVFX,
          [vfxId]: vfx,
        },
      };
    }),

  /**
   * Mark a VFX as playing (after spawn)
   */
  playVFX: (vfxId) =>
    set((state) => {
      if (!state.activeVFX[vfxId]) return state;
      return {
        activeVFX: {
          ...state.activeVFX,
          [vfxId]: {
            ...state.activeVFX[vfxId],
            state: 'play',
          },
        },
      };
    }),

  /**
   * Complete and cleanup a VFX effect
   * Removes it from activeVFX
   */
  completeVFX: (vfxId) =>
    set((state) => {
      const { [vfxId]: _, ...rest } = state.activeVFX;
      return { activeVFX: rest };
    }),

  /**
   * Clear all active VFX
   * Used on game reset/restart
   */
  clearVFX: () => set({ activeVFX: {} }),

  /**
   * Get count of active VFX (for diagnostics/testing)
   */
  getActiveVFXCount: () => {
    // Note: This returns a selector, actual implementation in component
    return 0;
  },
}));

/**
 * Helper: Dispatch FOOD_EAT event
 * @param {Object} data - { position: {x, z, gx, gz} }
 */
export const dispatchFoodEat = (data) => {
  const vfxId = useVFXStore.getState().spawnVFX(VFX_EVENTS.FOOD_EAT, {
    position: data.position,
  });
  return vfxId;
};

/**
 * Helper: Dispatch MERGE_RESULT event
 * @param {Object} data - { value, position: {x, z, gx, gz} }
 */
export const dispatchMergeResult = (data) => {
  const vfxId = useVFXStore.getState().spawnVFX(VFX_EVENTS.MERGE_RESULT, {
    value: data.value,
    position: data.position,
  });
  return vfxId;
};

/**
 * Helper: Dispatch ENEMY_ALERT event
 * @param {Object} data - { enemyId, enemyPosition: {x, z, gx, gz}, targetPosition: {x, z, gx, gz} }
 */
export const dispatchEnemyAlert = (data) => {
  const vfxId = useVFXStore.getState().spawnVFX(VFX_EVENTS.ENEMY_ALERT, {
    enemyId: data.enemyId,
    enemyPosition: data.enemyPosition,
    targetPosition: data.targetPosition,
  });
  return vfxId;
};

/**
 * Helper: Dispatch ENEMY_ATTACK event
 * @param {Object} data - { enemyId, enemyPosition: {x, z, gx, gz}, playerPosition: {x, z, gx, gz} }
 */
export const dispatchEnemyAttack = (data) => {
  const vfxId = useVFXStore.getState().spawnVFX(VFX_EVENTS.ENEMY_ATTACK, {
    enemyId: data.enemyId,
    enemyPosition: data.enemyPosition,
    playerPosition: data.playerPosition,
  });
  return vfxId;
};

/**
 * Helper: Dispatch PLAYER_DEATH event
 * @param {Object} data - { playerPosition: {x, z, gx, gz}, currentValue }
 */
export const dispatchPlayerDeath = (data) => {
  const vfxId = useVFXStore.getState().spawnVFX(VFX_EVENTS.PLAYER_DEATH, {
    playerPosition: data.playerPosition,
    currentValue: data.currentValue,
    reason: 'enemy_collision',
  });
  return vfxId;
};
