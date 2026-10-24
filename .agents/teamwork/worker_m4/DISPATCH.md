# DISPATCH — worker_m4
Timestamp: 2026-10-20T03:52:50Z
Role: Table-Play & Sheet Implementer
Working Directory: /home/patch/AK5e-Foundry/.agents/teamwork/worker_m4

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Objective
Implement Milestone 4: Table-Play Philosophy (WORKFLOW.md §3.2), GM Relay, ActorSheetV2 controls, and Full Specialist Regression.

## Requirements
1. `ak5e/scripts/specialist-uses.mjs`:
   - Register Inventor plans in `ALL_PLANS`:
     - `applyModification`: prompt item & mod selection, confirm before spend, non-blocking warning ("Use anyway") for low Inventions, clamp at 0 with shortfall reporting, unowned target GM relay via `.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid`, record undo receipt.
     - `removeModification`: prompt item & mod, refund 1 Invention, record undo receipt.
     - `activateModification`: prompt mod on item, evaluate requirements/warnings ("Use anyway"), interactive card roll button (`receipt.formula = "${instability}d6"`, never auto-roll), breakdown HP loss interactive button, dangerous breakdown equipment disabled, record undo receipt.
     - `mobileModding`: 1 Prowess spend, 0 Inventions, 1 min temp, undo receipt.
     - `strangeContraption`: 30 ft throw, interactive save buttons, 1/LR per option, undo receipt.
     - `theBigOne`: 1/LR, choice dialog for FLASH/SHARD/QUASAR, interactive save & damage buttons, undo receipt.
   - Register `inventorCleanup` in `specialistCleanup` to cleanly reverse modifications and item flags on encounter-window undo.
2. `ak5e/scripts/specialist-sheet.mjs`:
   - Inject Inventor badges into `ActorSheetV2` features tab:
     - Inventions pool badge: `Inventions: ${val} / ${max}`
     - Inventor DC badge: `Inventor DC: ${dc}`
     - Active modifications count badge.
   - Inject Inventor action controls in `openSpecialistControls` DialogV2 modal (actions for Apply Mod, Activate Mod, Mobile Modding, Contraption, The Big One, and Undo).
3. Author `ak5e/test/inventor-uses.test.mjs`:
   - Test confirmation before spend, warning overrides ("Use anyway"), zero clamping, GM relay validation, interactive cards (`receipt.formula`), and encounter-window undo receipts.
4. Update `TODO.md` with Inventor completion status.
5. Update `package.json` `"test:specialist"` script to include `ak5e/test/inventor*.test.mjs`.

Run verification:
- `npm run test:specialist`
- `node ak5e/tools/validate-files.mjs`
- `node ak5e/tools/verify-generated-content.mjs`

Maintain progress in `progress.md`. When complete, write report in `handoff.md` and notify orchestrator.


## 2026-10-20T03:53:51Z
From: cf5c8a2a-802f-473e-8274-6566de462e7c
Content:
You are worker_m4. Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/worker_m4/.
Read your dispatch instructions in /home/patch/AK5e-Foundry/.agents/teamwork/worker_m4/DISPATCH.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implement Milestone 4:
1. specialist-uses.mjs: register Inventor plans (applyModification, removeModification, activateModification, mobileModding, strangeContraption, theBigOne) with confirmation dialogs, non-blocking warnings ("Use anyway"), zero-clamping, GM relay (validateTarget), interactive card buttons, and inventorCleanup for undo receipts.
2. specialist-sheet.mjs: inject ActorSheetV2 badges (Inventions pool, Inventor DC, active mod count) and DialogV2 action buttons.
3. Author ak5e/test/inventor-uses.test.mjs.
4. Update TODO.md with Inventor completion.
5. Update package.json "test:specialist" script to include all inventor test files.

Verify:
- npm run test:specialist
- node ak5e/tools/validate-files.mjs
- node ak5e/tools/verify-generated-content.mjs

Maintain progress in progress.md. Write report in handoff.md and notify orchestrator when complete.
