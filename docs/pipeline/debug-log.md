# Debug log

## TSA P17 — Collision integrity (2026-09-18)

- Mode: 1 — Micro Patch.
- Root cause: Enemy checked its proposed next cell and called Game Over before committing it. Reproduction recorded player row 14/col 20 and enemy row 13/col 20 at Game Over. Separate reproduction showed two enemies committing to row 17/col 20.
- Fix: Enemy.jsx checks collision using current committed logical cells after sync, with session/freeze guards. Occupied enemy-cell commits are rejected without changing AI direction selection.
- Validation: build PASS; 51 captured enemy-collision events all had equal committed player/enemy cells. Counts 0/1/5/9/20, spawn safety, unique cells/IDs, interpolation, ROAM/ATTACK 3 steps/cooldown 8, Model B freeze/resume, restart x5, Level 1 to 2, stale callbacks, controls, minimap, portrait/bottom overlay and walls PASS. Real RAF runtime: 60 seconds total; no runtime errors or callback/listener growth.
- Validation environment: first post-patch browser run loaded cached pre-patch source from Vite; restarting Vite with filesystem polling resolved this.
- Diagnostics ran only in temporary browser harnesses; no production instrumentation added. Visual separation at a valid same-cell collision remains expected during interpolation.
- Remaining collision issues: none reproduced. No texture/VFX or gameplay redesign.
- Status: PASS. Stop after this fix.

## TSA P22A — Enemy movement audit (2026-09-19)

- Mode: 1 — Micro Patch.
- Reproduced causes: tick 6 (ROAM to ATTACK) threw `ReferenceError: ox is not defined`; grid-only `current` also supplied undefined x/z to existing event dispatch. Occupancy was rejected only after direction selection, so two facing enemies retried blocked cells indefinitely despite side exits. A 0.31-second remainder plus a stalled frame allowed another step 20 ms later.
- Fix: Enemy.jsx defines grid/world offsets, supplies valid coordinates, filters occupied movement candidates before the unchanged direction-selection rules, and discards pre-stall accumulator debt for frames >= 0.32 seconds. Wall-junction opportunity trigger, attack 3 steps, cooldown 8 steps and nominal .32 interval preserved. Blocked occupancy does not advance movement-based AI counters. Invalid JSX text comment converted to a JSX comment without changing sprite scale.
- Runtime validation: build PASS; ROAM, ATTACK/return/cooldown, .32/.18 timing, fractional interpolation, bounded stall stepping, wall/dead-end/bounds, 36 player moves, minimap sync, Model B (~436 ms observed for configured 420 ms), freeze/resume, 5 death/restarts, stale callbacks, counts 0/1/5/9/20, stable IDs/no remount and portrait/landscape PASS.
- Continuous 60-second soak with 20 enemies: 2,976 valid cell moves, six death/restarts, exactly 20 enemy frame subscribers, no invalid cells or runtime errors. No movement timers added; input listener counts stable.
- Remaining issue outside authorized movement scope: VFXManager recreates all cleanup timers whenever activeVFX changes. A quiet batch of 20 existing events drained over ~3.5 seconds rather than ~600 ms. During the continuous soak, pending events increased 50 -> 140 -> 241 -> 301 -> 418 -> 491. The earlier 850 ms cleanup assertion therefore exposed a real pre-existing lifecycle defect.
- VFX files, Scene, Store, assets, camera, sprites/scale, textures, and dependencies are unchanged. No temporary diagnostics added to production.
- Status: movement PASS; overall FAIL because the required no-growth lifecycle check fails for existing VFX. User asked whether to authorize a timer-only VFX lifecycle fix; no authorization received at report time. Do not modify VFX under current P22A scope.


## TSA P26A — Player 2.5D prototype (2026-09-19)

- Mode: 1 — Micro Patch. Only Player renderer was prototyped; baseline scale [2, 2, 1], cache, interpolation, camera, lights and ContactShadows retained. Shared unit plane, MeshStandardMaterial, visual-only camera quaternion copy and castShadow were tested.
- Build PASS. Chromium runtime at 360x640 and 1280x720: mesh structure, 36 moves per viewport, camera orientation, keyboard/D-pad/swipe, food 1+2, native /assets/gif/3.gif, ~433 ms observed configured 420 ms freeze, result texture and two Game Over/restarts PASS. Geometry/material/object IDs remained stable in these tests.
- FAIL-SAFE triggered: Player became a black silhouette in both viewports. Actual material color was 000000 and roughness 0. Cold loading transitions from fallback mesh/standard material to PNG mesh/standard material reuse the same host material. R3F diffProps resets removed color/roughness props to 0 for this constructor (arity 1). Browser-only white material A/B restored the PNG without modifying textures, lights or shadows.
- Shadow contribution also failed with the default plane shadow side. Browser-only DoubleSide shadow test produced 73,970 changed shadow-map bytes, confirming sidedness as the cause. No production shadow/lighting changes applied.
- Initial browser test used stale Vite source; dev-server restart with file polling loaded the actual prototype.
- Per explicit P26A fail-safe: stopped implementation, reverted Scene.jsx exactly to its pre-P26A contents. No Enemy or other source changes. The required 60-second prototype soak was NOT RUN after failure; prototype is NOT approved.
- Status: FAIL. Sprite baseline restored. Temporary tests/screenshots stayed in /tmp. No new assets or dependencies.


## TSA P22D — VFX lifecycle cleanup (2026-09-19)

- Mode: 1 — Micro Patch; dependency cone VFXStore.js and VFXManager.jsx.
- Reproduction before patch: arrivals every 100 ms kept the first 600 ms ENEMY_ATTACK alive beyond 1 second; active events grew 2 -> 11. Restart retained all 11. getActiveVFXCount incorrectly returned 0. The activeVFX-dependent manager effect cancelled and rescheduled every completion timer whenever any event changed; no game-session reset subscription existed.
- Fix: each stable keyed VFXEffect owns its lifetime effect, independent of activeVFX changes. FOOD_EAT remains 400 ms; MERGE_RESULT/ENEMY_ALERT/ENEMY_ATTACK/PLAYER_DEATH remain 600 ms. Every type is removed, including types whose visual currently returns null. Cleanup cancels its timer. Manager clears VFX synchronously on session change/Game Over and unsubscribes/clears on unmount. Store play/complete/clear are idempotent; spawn returns its generated ID; count getter reports actual active entries. No event history introduced.
- Build PASS. Chromium single tests for all five types: 0 -> 1 -> 0, one completed callback each. Rapid 10 events: 0 -> 10 -> 0; continuous arrivals no longer extend the first event. StrictMode's extra development setup is cancelled; at most one live timer per mounted event.
- Portrait 360x640, real RAF 60 seconds per count (normal collision/restart to keep playing). Samples at 0/10/20/30/40/50/60 seconds:
  - 9 enemies: 0 / 6 / 0 / 36 / 0 / 0 / 0; peak 37; 212 player moves; 8 death/restarts.
  - 20 enemies: 0 / 0 / 0 / 0 / 80 / 0 / 20; peak 80; 217 player moves; 11 death/restarts.
  - Both drained to 0 active events and 0 timers. Across the complete instrumented suite: 2,896 timer setups = 1,069 fired + 1,827 cancelled (including StrictMode/reset cleanup), no outstanding timer. Listener counts stable, no runtime errors.
- Separate five actual collision/Game Over/restart cycles PASS: immediate clear, no old event retention, old completion cannot remove a fresh event. Full R3F unmount clears events/timers.
- Regression PASS: 36 directional moves, keyboard/swipe/D-pad, logical grid, player/enemies, food 1+2, currentValue 3, native /assets/gif/3.gif, configured 420 ms freeze (~432 ms observed), respawn, minimap, portrait and 1280x720 landscape, floor/wall textures.
- P21 visual implementation is byte-identical from FoodEatEffect onward. Browser checks confirm orange ring + six particles, yellow ring + existing result indicator, result-3 color mapping, animation changes with stable geometry IDs. Captures confirm both effects visible; no new black artifact/flicker reproduced. No geometry/material/texture creation added per frame.
- Validation harness corrections: restarted Vite after HMR to avoid importing a separate timestamped store; counted StrictMode cancelled setup separately; respected the existing ring scale curve (initial scale can decrease). Production patch did not change for these harness corrections. Temporary instrumentation/screenshots remain outside repository in /tmp.
- Protected source/manifests match pre-P22D hashes except the two VFX files. No gameplay/AI/movement/collision/Model B/GIF/sprite/camera/minimap/level config/asset/dependency changes.
- Remaining lifecycle issue: none reproduced. Status: PASS. Stop; no new Enemy/Death VFX or lighting/shadow work.
