## 2026-10-17T01:15:30Z
Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_2/.
You are a read-only exploration agent (Role: Executor Architecture Explorer). You MUST NOT edit source code or test files.
Read first:
- /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/SCOPE.md
- /home/patch/AK5e-Foundry/AGENTS.md, /home/patch/AK5e-Foundry/WORKFLOW.md, /home/patch/AK5e-Foundry/GEMINI.md
- Existing specialist files:
  - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-rules.mjs
  - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-features.mjs
  - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-setup.mjs
  - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-progression.mjs
  - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-uses.mjs
  - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-sheet.mjs
- Existing test suites:
  - /home/patch/AK5e-Foundry/ak5e/test/specialist-rules.test.mjs
  - /home/patch/AK5e-Foundry/ak5e/test/specialist-features.test.mjs
  - /home/patch/AK5e-Foundry/ak5e/test/specialist-progression.test.mjs
  - /home/patch/AK5e-Foundry/ak5e/test/specialist-adversarial.test.mjs
- Reference subclass implementations:
  - /home/patch/AK5e-Foundry/ak5e/scripts/centurion-features.mjs
  - /home/patch/AK5e-Foundry/ak5e/scripts/play-uses.mjs

Your Task:
Investigate the codebase architecture to design the implementation for Milestone 2:
1. Architectural structure for `ak5e/scripts/executor-features.mjs`:
   - State model on the actor (`flags.ak5e.executor`): path ("hunter" | "bodyguard"), deathmark state (`held`: true/false, `targetUuid`: string|null, `targetName`: string|null, etc.), sweeper active, smokescreen active, etc.
   - Exported functions and predicates (`isExecutor`, `getExecutorPath`, `getDeathmarkState`, `setDeathmark`, `clearDeathmark`, etc.).
   - Hook registrations (attack rolls, turn start/end, damage calculation, crit threshold, 0 HP drop, reactions).
2. Integration into `ak5e/scripts/specialist-uses.mjs`:
   - Table-play plans needed for Executor active abilities:
     - Transfer Deathmark / Recall Deathmark
     - Sweeper (1 Prowess)
     - Smokescreen (1 Prowess)
     - Mortal Blow (1/LR Action, 10d8 interactive roll button)
     - Blade Shield / Redirection
   - Enforce WORKFLOW §3.2 table-play philosophy: confirmations, non-blocking warnings ("Use anyway"), clamp overspent resources at 0, zero auto-rolled dice (interactive card roll buttons), automatic GM relay for unowned target modifications via `validateTarget`, and reversible encounter-window undo receipts.
3. Integration into `ak5e/scripts/specialist-sheet.mjs`:
   - Subclass badges: display Deathmark state (e.g. `Deathmark: Held` or `Deathmark: Target Name`) and Path (`Hunter` / `Bodyguard`).
   - Action controls dialog: expose Executor actions when `isExecutor(actor)`.
4. Test Strategy for `ak5e/test/executor.test.mjs`:
   - Test fixture setup (mocking Actor, Items, Token, Combat).
   - Test cases covering Path choice, Deathmark transfer/recall/return/SP, damage bonus (+1d4/+2d4/+3d4), In Every Shadow, Sweeper, Smokescreen, Prowess gain triggers, Preysense/Dangersense, In for the Kill, Mortal Blow / Ultimate Sword and Shield, and undo receipts.

Deliverable:
Write a comprehensive architectural and test design handoff report to `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_2/handoff.md` following the Handoff Protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method).
When finished, notify the orchestrator with send_message.
