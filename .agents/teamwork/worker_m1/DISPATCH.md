# DISPATCH — worker_m1
Timestamp: 2026-10-20T02:18:45Z
Role: Inventor Core Implementer
Working Directory: /home/patch/AK5e-Foundry/.agents/teamwork/worker_m1

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Objective
Implement Milestone 1 of the AK5e Inventor Subclass:
1. Subclass identification & formulas in `ak5e/scripts/specialist-rules.mjs`:
   - `isInventor(actor)` predicate.
   - `calculateInventorDC(actor)`: `8 + intMod + pb`.
   - Register `inventions` pool (`max: "@prof * 2"`, `initial: "max"`, `recovery: [{ on: "lr", amount: "toMax" }]`, `appliesTo: isInventor`).
   - Register `theBigOne` pool (`max: 1` at level 20).
2. Create `ak5e/scripts/inventor-features.mjs`:
   - `calculateInstability(item, actor, options)`: Base 3 + (numMods - 1) + numDangerousMods - riskAssessmentReductions. Clamped at min 1.
   - `evaluateBreakdownRoll(rollResults, instability, activatedMod)`: checks for any duplicate dice in the roll array; computes HP loss `1d8 + max(0, instability - 3)d8`, clamped to not reduce HP below 1; flags equipment broken if `activatedMod?.isDangerous`.
   - `applyEquipmentModification(item, modificationId, options)`: validates item is weapon or armor, non-magical, no duplicate mods on item, locks 1 Invention, records mod in `flags.ak5e.inventor.modifications`.
   - `removeEquipmentModification(item, modificationId, options)`: removes mod, unlocks/refunds 1 Invention.
   - `repairBrokenEquipment(item, actor, options)`: clears broken state (`flags.ak5e.isBroken = false`).
   - `isBrokenEquipment(item)`.
   - Catalog schema for modifications and initial batch of modifications (e.g. Boom Module, Burning Edge, Laser Cutter [Dangerous]).
3. Progression & module wiring:
   - Wire `specialist-progression.mjs` for Inventor subclass features at levels 3, 5, 11, 15, 20.
   - Wire `ak5e/scripts/ak5e.mjs` to export `game.ak5e.specialist.inventor` and `game.ak5e.specialist.isInventor`.
4. Rulings in `ak5e/DECISIONS.md`:
   - Log rulings for Dangerous modifications (+1 extra Instability and breakdown rider), Melee Attachment attack modifier choice, and Instability roll timing (on deliberate activation only).
5. Author `ak5e/test/inventor.test.mjs`:
   - Complete unit test suite verifying Inventor DC, pool max, Instability math (base 3, stacking, clamp at 1), breakdown dice duplicates detection, HP loss clamping at 1 HP, Dangerous breakdown damage rider, modification application/removal and Inventions refund.
   - Ensure `node --test ak5e/test/inventor.test.mjs` and `node ak5e/tools/validate-files.mjs` pass cleanly with 0 errors.

Allowed write files:
- `ak5e/scripts/specialist-rules.mjs`
- `ak5e/scripts/inventor-features.mjs`
- `ak5e/scripts/specialist-progression.mjs`
- `ak5e/scripts/ak5e.mjs`
- `ak5e/test/inventor.test.mjs`
- `ak5e/DECISIONS.md`
- Files in `/home/patch/AK5e-Foundry/.agents/teamwork/worker_m1/`

Read:
- `/home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md` (lines 536 to 628)
- `/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_inventor_1/handoff.md`
- `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_inventor_1/handoff.md`
- `WORKFLOW.md` (§3.2)
- `GEMINI.md`

Maintain progress in `progress.md`. When complete, write report in `handoff.md` with test output and notify orchestrator.


## 2026-10-20T02:19:03Z
Received invocation:
You are worker_m1. Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/worker_m1/.
Read your dispatch instructions in /home/patch/AK5e-Foundry/.agents/teamwork/worker_m1/DISPATCH.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implement Milestone 1 of the Inventor subclass:
1. specialist-rules.mjs: isInventor(actor), calculateInventorDC(actor) = 8 + intMod + pb, register 'inventions' pool (max @prof * 2) and 'theBigOne' pool.
2. inventor-features.mjs: calculateInstability, evaluateBreakdownRoll (matching dice detection, HP loss formula, clamp at 1 HP, dangerous broken equipment rider), applyEquipmentModification, removeEquipmentModification, repairBrokenEquipment, isBrokenEquipment, and initial modification catalog schema with sample mods.
3. specialist-progression.mjs: Inventor subclass progression at levels 3, 5, 11, 15, 20.
4. ak5e.mjs: wire game.ak5e.specialist.inventor and game.ak5e.specialist.isInventor.
5. ak5e/DECISIONS.md: log rulings for Dangerous mod extra instability/breakdown rider, Melee Attachment attack modifier reading, and Instability roll timing.
6. ak5e/test/inventor.test.mjs: comprehensive unit test suite covering all Milestone 1 features.

Verify:
- node --test ak5e/test/inventor.test.mjs
- node ak5e/tools/validate-files.mjs

Maintain progress in progress.md. Write your full report in handoff.md with test outputs and notify the orchestrator.
