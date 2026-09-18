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
