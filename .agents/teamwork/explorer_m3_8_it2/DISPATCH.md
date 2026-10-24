## 2026-10-17T02:56:12Z

Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m3_8_it2/.
You are the Hookmaster Remediation Explorer for Milestone 3 Iteration 2. You are a read-only exploration agent. You MUST NOT edit source code or test files directly.

MANDATORY INSTRUCTION:
Milestone 3 Iteration 1 failed the Forensic Integrity Audit with an INTEGRITY VIOLATION verdict, alongside REQUEST_CHANGES from the Reviewer and Challenger. You are receiving the FULL AUDIT EVIDENCE REPORT and GATE STATUS. You must address the specific integrity violations and defects identified without omitting, summarizing, or filtering them.

Read first:
- /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (mandatory)
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/SCOPE.md
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/GATE_STATUS.md
- /home/patch/AK5e-Foundry/AGENTS.md, /home/patch/AK5e-Foundry/WORKFLOW.md, /home/patch/AK5e-Foundry/GEMINI.md
- Full Auditor Evidence Report: /home/patch/AK5e-Foundry/.agents/teamwork/auditor_m3_8_1/handoff.md
- Reviewer Report: /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m3_8_1/handoff.md
- Challenger Report: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m3_8_1/handoff.md
- Existing implementation & test files to investigate:
  - ak5e/scripts/hookmaster-features.mjs
  - ak5e/scripts/specialist-uses.mjs
  - ak5e/scripts/specialist-sheet.mjs
  - ak5e/test/hookmaster.test.mjs
  - ak5e/test/hookmaster-adversarial.test.mjs

Specific Defects to Investigate and Formulate Exact Drop-In Code Fixes For:
1. [Auditor Integrity Violation]:
   - In `ak5e/test/hookmaster.test.mjs` line 567, replace trivial `assert.ok(true, "Hook registration is idempotent")` with empirical checks on listener counts (`Hooks._hooks.get("dnd5e.preRollAttackV2")?.length` and `dnd5e.preRollDamageV2`) before and after repeated calls to `registerHookmasterHooks()`, mirroring `ak5e/test/executor.test.mjs:667–682`.
   - Update tests in `ak5e/test/hookmaster.test.mjs` to dispatch hooks via `Hooks.callAll("dnd5e.preRollAttackV2", ...)` and `Hooks.callAll("dnd5e.preRollDamageV2", ...)` instead of invoking `hookmasterPreRollAttack` / `hookmasterPreRollDamage` directly as bare functions.
2. [Reviewer & Challenger Defect 1: Mighty Push useRoll Crash]:
   - In `ak5e/scripts/specialist-uses.mjs:1238`, `mightyPush` pushes `{ uuid, name, kind: "damage" }` to `receipt.targets`. In `play-uses.mjs`, `KINDS["damage"]` is undefined, causing `useRoll` to crash with `TypeError: Cannot read properties of undefined (reading 'apply')`.
   - Fix: Align with the established `mortalBlow` pattern (`receipt.targetUuid = targetUuid`, `receipt.targetName = targetName`, `receipt.formula = "8d6"`) without pushing unhandled target kind entries so `useRoll` evaluates cleanly.
3. [Reviewer & Challenger Defect 2: Non-Roll Plans Stuck in awaitingRoll / "Roll undefined" Card Button]:
   - In `ak5e/scripts/specialist-uses.mjs` (`bigBoot`, `boundInRope`, `dragBoundTarget`, `hogtie`, `wrangler`, `scorpionSting`), target entries are pushed without `ready: true`, trapping receipts in `"awaitingRoll"` and rendering broken "Roll undefined" card buttons.
   - Fix: Ensure pushed target entries have `ready: true` (or align with `targetUuid`/`targetName`), allowing `receipt.status` to finish cleanly as `"complete"`.
4. [Challenger Defect 3: revertHookedWeapon Undo Reversibility on Item Document]:
   - In `ak5e/scripts/specialist-uses.mjs:1418–1444` (`hookmasterCleanup`), add handling for `receipt.command === "revertHookedWeapon"` to re-apply `two` and `thr` properties, Hook range (30/50 ft), and `flags.ak5e.isHooked = true` to the weapon item on undo.
5. [Reviewer Finding 1: Missing Bonus Action Hook Attack & 10 ft Pull on Ranged Hook Hit]:
   - Ch. 3 L5596: When hitting a creature <= +1 size larger with a Ranged Hook Attack, pull 10 ft towards Specialist. Implement via `onAk5eEvent("hit")` or attack card rider.
   - Ch. 3 L5597: Bonus Action Ranged Attack with Hook, with the restriction that no other ranged Hook attacks can be or have been made on that turn. Implement plan `bonusActionHookAttack` and wire into `specialist-sheet.mjs`.
6. [Reviewer Finding 2: Hook Lockout and Flight Attack Restrictions]:
   - Check `isHookLocked(actor)` (Bound in Rope) and `urbanJungle.active` (King of the Urban Jungle) in `hookmasterPreRollAttack` and active Hook plans, providing non-blocking warnings and card notices.
7. [Reviewer Finding 3: Race Condition on Big Boot Forced Movement Doubling]:
   - Ensure `urbanJungle.active` (or a `meleeForcedMovementDoubled` flag) persists so that Big Boot push distance is doubled to 20 ft immediately following the flying attack.
8. [Reviewer Finding 4: Wrangler DR Bypass]:
   - Ensure the `-5` attack penalty sets `options._ak5eWranglerIgnoreDR = true` and connects to `ignoreDamageReduction` / `ignoreDR` on damage calculation.

Deliverable:
Write a comprehensive handoff report to `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m3_8_it2/handoff.md` following the Handoff Protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method) with exact drop-in code fixes and verification commands.
When finished, notify the orchestrator with send_message.
