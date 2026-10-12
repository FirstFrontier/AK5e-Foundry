# B-299 · Low · Unverified: Reaper tests miss the hooks and the risky paths

Area: Guard / Reaper / test adequacy ([reaper.test.mjs](../../ak5e/test/reaper.test.mjs))

**Found:** Guard audit unit 14 (Reaper), 2026-10-12.

**Evidence:** `world()` stubs `Hooks.on` ([guard-fixture.mjs](../../ak5e/test/guard-fixture.mjs#L138)), so the `updateActor` Ruin reset ([reaper-features.mjs](../../ak5e/scripts/reaper-features.mjs#L404)) and the `dnd5e.preApplyDamage` registration are never exercised. The healing test ([reaper.test.mjs](../../ak5e/test/reaper.test.mjs#L167)) feeds `amount -20` with `updates hp 40` against 20/50 HP (valid input), but never covers a heal clamped at max HP or real option shapes (`origin` ChatMessage, `ignore:true`). No test covers Ruin gain at 10 plus Undo (B-290), Curtainfall on a miss (B-291), Fear/Memento Undo and state, input validation, the sheet commands, or that no dice are auto-rolled. The Curtainfall test asserts Ruin 0 right after confirm, which locks in the B-291 behaviour. The Swarm helper is tested but unused by any plan.

**Reproduce:** Static reasoning: removing the two `Hooks.on` registrations in `registerReaperHooks` would leave `npm run test:guard` green (mutation not run).

**Verification limits:** Static review; baseline `npm run test:guard` 118/118 and `npm run check:files` pass.

**Fixed means:** Tests capture and invoke the registered hooks with realistic dnd5e arguments, cover cap/undo, miss, 0 HP reset gating, self vs other healing and validation, and assert the intended (source) outcomes after the related bugs are fixed.
