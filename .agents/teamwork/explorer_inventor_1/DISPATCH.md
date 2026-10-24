# DISPATCH — explorer_inventor_1
Timestamp: 2026-10-20T02:10:55Z
Role: Codebase Architecture Explorer
Working Directory: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_inventor_1

## Objective
Investigate the existing Specialist base class and subclass implementations (Executor, Hookmaster, Infuser) to map architectural patterns, file conventions, test structures, and integration points for the Inventor subclass.

## Codebase Areas to Inspect
1. `/home/patch/AK5e-Foundry/ak5e/scripts/specialist-rules.mjs` (pool registration, DC formulas, subclass identification)
2. `/home/patch/AK5e-Foundry/ak5e/scripts/specialist-progression.mjs` (subclass progression choices, level grants)
3. `/home/patch/AK5e-Foundry/ak5e/scripts/specialist-features.mjs` (feature definitions)
4. `/home/patch/AK5e-Foundry/ak5e/scripts/specialist-setup.mjs` (idempotent setup grants)
5. `/home/patch/AK5e-Foundry/ak5e/scripts/specialist-uses.mjs` (plan definitions, confirmation dialogs, warning overrides, undo receipts, GM relay)
6. `/home/patch/AK5e-Foundry/ak5e/scripts/specialist-sheet.mjs` (sheet badge injection, control buttons)
7. Existing subclass feature modules:
   - `/home/patch/AK5e-Foundry/ak5e/scripts/infuser-features.mjs`
   - `/home/patch/AK5e-Foundry/ak5e/scripts/hookmaster-features.mjs`
   - `/home/patch/AK5e-Foundry/ak5e/scripts/executor-features.mjs`
8. Module entry point: `/home/patch/AK5e-Foundry/ak5e/scripts/ak5e.mjs` (how specialist subclasses and API are registered)
9. Tests & Test runners:
   - `/home/patch/AK5e-Foundry/ak5e/test/infuser.test.mjs`, `specialist-rules.test.mjs`, etc.
   - `/home/patch/AK5e-Foundry/package.json` (`test:specialist` script)
   - `/home/patch/AK5e-Foundry/ak5e/tools/test-specialist-live.mjs`

## Scope & Deliverables
Document in `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_inventor_1/handoff.md`:
1. Subclass registration pattern:
   - How `isInventor(actor)` should be defined.
   - How subclass progression, feature items, and talent grants are structured.
2. Resource pool registration pattern:
   - How `inventions` pool should be registered in `resource-pools.mjs` or `specialist-rules.mjs`.
   - Formula for max (`@prof * 2`), recovery type, and initial value.
3. Feature & Plan architecture:
   - Pattern for `ak5e/scripts/inventor-features.mjs` vs `ak5e/scripts/specialist-uses.mjs`.
   - How equipment items store active modifications (e.g. `flags.ak5e.modifications` on the Item document).
   - How Instability is dynamically calculated and evaluated during play.
   - How breakdown rolls (d6 matching dice) are represented on chat cards with interactive buttons per WORKFLOW §3.2 (never auto-roll).
   - How unowned target mutations relay via `validateTarget` through GM client.
   - How undo receipts are structured under `flags.ak5e.specialistUses.undo`.
4. Sheet UI pattern:
   - How `ActorSheetV2` features tab injects badges and controls in `specialist-sheet.mjs`.
5. Testing & Live Browser harness integration:
   - Existing unit and adversarial test structure.
   - How `test-specialist-live.mjs` sets up actors, executes actions, and asserts zero browser errors.
   - Commands to run tests and validation tools.

Maintain `progress.md` with timestamps during your work. Write your full report to `handoff.md` and send a message when complete.


## 2026-10-20T02:11:29Z
Received dispatch from orchestrator:
You are explorer_inventor_1. Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/explorer_inventor_1/.
Read your dispatch instructions in /home/patch/AK5e-Foundry/.agents/teamwork/explorer_inventor_1/DISPATCH.md.
Inspect the existing Specialist base class and subclass implementations:
- /home/patch/AK5e-Foundry/ak5e/scripts/specialist-rules.mjs
- /home/patch/AK5e-Foundry/ak5e/scripts/specialist-progression.mjs
- /home/patch/AK5e-Foundry/ak5e/scripts/specialist-features.mjs
- /home/patch/AK5e-Foundry/ak5e/scripts/specialist-setup.mjs
- /home/patch/AK5e-Foundry/ak5e/scripts/specialist-uses.mjs
- /home/patch/AK5e-Foundry/ak5e/scripts/specialist-sheet.mjs
- /home/patch/AK5e-Foundry/ak5e/scripts/infuser-features.mjs
- /home/patch/AK5e-Foundry/ak5e/scripts/hookmaster-features.mjs
- /home/patch/AK5e-Foundry/ak5e/scripts/executor-features.mjs
- /home/patch/AK5e-Foundry/ak5e/scripts/ak5e.mjs
- /home/patch/AK5e-Foundry/ak5e/test/infuser.test.mjs
- /home/patch/AK5e-Foundry/package.json
- /home/patch/AK5e-Foundry/ak5e/tools/test-specialist-live.mjs

Extract existing patterns for subclass definition, pool registration, modification attachment to items, plan execution, non-blocking warning overrides, interactive card buttons, undo receipts, sheet badges, and live browser test structure.
Maintain your progress in progress.md. Write your comprehensive report in handoff.md and send a message back to the orchestrator when complete.
