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
