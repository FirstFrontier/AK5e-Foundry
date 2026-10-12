# B-251 · Medium · Unverified: Renowned Instructor changes the pool with no card, receipt or undo

Area: Instructor / Superior Instruction (13th)

**Found:** Guard audit unit 10 (Instructor), 2026-10-12. Node probe.

**Evidence:** [instructor-features.mjs](../../ak5e/scripts/instructor-features.mjs#L172) calls `setPool` ([L178](../../ak5e/scripts/instructor-features.mjs#L178)) directly from the hook. WORKFLOW §3.2.6 requires every module-initiated Actor change to record an undo receipt under `flags.ak5e`, restorable by the owner or a GM within the encounter window, with the undo noted on a public card. The handler is also async and unguarded, so a `setPool` rejection becomes an unhandled promise rejection.

**Reproduce:** Probe: Instructor L13, pool 0/5; `renownedInstructorInitiative(actor)` returned `{regained:3,total:3}`, pool became 3, `guardUses.state(actor).undo.length === 0`, no ChatMessage was created for it.

**Verification limits:** Node only (guard fixture); no Foundry run.

**Fixed means:** The restoration records a guardUses-style receipt (prior and new value) and posts a public card; undo restores the prior count until the encounter window locks; the hook handler catches and reports errors. Tests: receipt present, undo restores 0, a repeat of the same initiative roll is idempotent.
