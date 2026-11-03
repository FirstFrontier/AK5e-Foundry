## 2026-10-17T01:22:00Z
Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/worker_m2_8/.
You are the Implementer Worker for Milestone 2: Executor Subclass Implementation & Tests.

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read first:
- /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/SCOPE.md
- /home/patch/AK5e-Foundry/AGENTS.md, /home/patch/AK5e-Foundry/WORKFLOW.md, /home/patch/AK5e-Foundry/GEMINI.md
- Explorer 1 (Rules) Report: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_1/handoff.md
- Explorer 2 (Architecture & Tests) Report: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_2/handoff.md
- Source rules: /home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (lines 5498–5578)
- Existing files:
  - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-rules.mjs
  - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-features.mjs
  - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-uses.mjs
  - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-sheet.mjs
  - /home/patch/AK5e-Foundry/ak5e/scripts/ak5e.mjs
  - /home/patch/AK5e-Foundry/ak5e/test/base-classes-fixture.mjs

File Ownership & Scope:
- Exclusively create:
  - `ak5e/scripts/executor-features.mjs`
  - `ak5e/test/executor.test.mjs`
- Integrate into existing files:
  - `ak5e/scripts/specialist-uses.mjs` (ensure dynamic plan lookup so subclass plans work, register 8 Executor plans and readings)
  - `ak5e/scripts/specialist-sheet.mjs` (Deathmark badge, action buttons in controls dialog)
  - `ak5e/scripts/ak5e.mjs` (export in `game.ak5e.specialist` and call hook registration)

Implementation Requirements:
1. `ak5e/scripts/executor-features.mjs`:
   - State model under `flags.ak5e.executor`: tracks `path` ("hunter" | "bodyguard"), `deathmark` (`held`, `holder`, `targetUuid`, `targetName`, `transferredTurn`, `attackedOrDamagedThisTurn`), `sweeper`, `smokescreen`, `prowessTriggers`.
   - Exported predicates and functions: `isExecutor`, `getExecutorPath`, `getDeathmarkState`, `setDeathmark`, `recallDeathmark`, `clearDeathmark`, `calculateDeathmarkDamageBonus`, feature predicates (`hasInEveryShadow`, `hasSweeper`, `hasSmokescreen`, `hasPreysense`, `hasDangersense`, `hasInForTheKill`, `hasBladeShield`, `hasMortalBlow`, `hasUltimateSwordAndShield`).
   - Hooks: `dnd5e.preRollAttackV2` (Hunter +1 crit range vs marked target), `dnd5e.preRollDamageV2` (+1d4/+2d4/+3d4 damage, Preysense +1 crit die), `onAk5eEvent("attack"/"hit")` (mark transfer, Hunter >=30 dmg prowess), `onAk5eEvent("crit")` (inflict Bleeding on living target), `onAk5eEvent("kill")` (marked 0 HP return, +3 SP, reaction Disengage notice, +1 prowess), `onAk5eEvent("turnStart")` (held mark +3 SP), `onAk5eEvent("turnEnd")` (mark return if unattacked, Sweeper end, Bodyguard 10 ft ally 0 dmg prowess).
2. `ak5e/scripts/specialist-uses.mjs`:
   - Implement dynamic plan resolution (`ALL_PLANS` registry) so `specialistUses.plan()` finds subclass plans.
   - 8 Executor table-play plans adhering strictly to WORKFLOW §3.2: `transferDeathmark`, `recallDeathmark`, `sweeper`, `smokescreen`, `mortalBlow`, `bladeShield`, `attackRedirection`, and `dangersense`. Enforce confirmation, non-blocking warnings ("Use anyway"), resource clamping at 0, zero auto-rolled dice (interactive 10d8 Mortal Blow card button), GM relay with `validateTarget`, and reversible encounter-window undo receipts.
   - Register readings: `deathmarkTransferTiming` (`onAttackRoll` vs `onHitOnly`) and `mortalBlowReading` (`bypassDRResist` vs `bypassAll`).
3. `ak5e/scripts/specialist-sheet.mjs`:
   - Subclass badge: render `Deathmark: Held [Hunter/Bodyguard]` or `Deathmark: Marked (Target) [Hunter/Bodyguard]` in `.ak5e-specialist-badge.ak5e-specialist-badge-deathmark`.
   - Interactive dialog: contextual action buttons rendered in `openSpecialistControls()` with command routing through `confirmPlayUse`.
4. `ak5e/test/executor.test.mjs`:
   - Full 12-area automated test suite using `ak5e/test/base-classes-fixture.mjs` verifying path selection, Deathmark transfer/recall/SP/reactions, damage scaling, Hunter crit range, Bodyguard redirection, In Every Shadow, Sweeper/Smokescreen, prowess gain triggers, Preysense/Dangersense, In for the Kill/Blade Shield, Mortal Blow/Ultimate Sword and Shield, and undo receipts.

Verification Commands to Run:
- `node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs`
- `node ak5e/tools/validate-files.mjs`
- `node ak5e/tools/verify-generated-content.mjs`

Deliverable:
Write a comprehensive handoff report to `/home/patch/AK5e-Foundry/.agents/teamwork/worker_m2_8/handoff.md` following the Handoff Protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method).
When finished, notify the orchestrator with send_message.
