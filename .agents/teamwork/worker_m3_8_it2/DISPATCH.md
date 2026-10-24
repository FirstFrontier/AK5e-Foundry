## 2026-10-17T03:06:14Z
Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/worker_m3_8_it2/.
You are the Hookmaster Remediation Implementer for Milestone 3 Iteration 2.

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read first:
- /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (mandatory)
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/SCOPE.md
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/GATE_STATUS.md
- /home/patch/AK5e-Foundry/AGENTS.md, /home/patch/AK5e-Foundry/WORKFLOW.md, /home/patch/AK5e-Foundry/GEMINI.md
- Remediation Explorer Handoff: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m3_8_it2/handoff.md
- Auditor Evidence Report: /home/patch/AK5e-Foundry/.agents/teamwork/auditor_m3_8_1/handoff.md
- Reviewer Report: /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m3_8_1/handoff.md
- Challenger Report: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m3_8_1/handoff.md

File Ownership:
- `ak5e/scripts/hookmaster-features.mjs`
- `ak5e/scripts/specialist-uses.mjs`
- `ak5e/scripts/specialist-sheet.mjs`
- `ak5e/test/hookmaster.test.mjs`

Your Task:
Apply the exact drop-in code fixes specified in Section 4 of `explorer_m3_8_it2/handoff.md`:
1. In `ak5e/scripts/hookmaster-features.mjs`:
   - Location 1A: State model updates in `getHookmasterState` (add `meleeForcedMovementDoubled`, `lastRangedHookPullTarget`).
   - Location 1B: `hookmasterPreRollAttack`: check `isHookLocked` and `urbanJungle.active`, warn when attacking with Hook; track ranged hook attack counts; apply Wrangler advantage and -5 attack penalty with `config.ignoreDR = true` and `config.ignoreDamageReduction = true`.
   - Location 1C: `hookmasterPreRollDamage`: wire Wrangler DR bypass propagation (`roll.options.ignoreDamageReduction = true`, `config.ignoreDR = true`).
   - Location 1D: Event listeners (`hit`, `kill`, `turnStart`, `turnEnd`):
     - In `hit`: implement 10 ft pull on Ranged Hook attack hit against creatures <= +1 size larger (Ch. 3 L5596); set `meleeForcedMovementDoubled = true` when `urbanJungle.active` concludes on melee hit (Ch. 3 L5626).
     - In `turnStart`: reset `flyingMovementThisTurn`, `rangedHookAttacksThisTurn`, `bonusActionHookAttackUsedThisTurn`, and `meleeForcedMovementDoubled`.
     - In `turnEnd`: check flying > 45 ft prowess trigger; expire `urbanJungle.active` and `meleeForcedMovementDoubled`.
2. In `ak5e/scripts/specialist-uses.mjs`:
   - Location 2A (`bigBoot`): check `meleeForcedMovementDoubled`, doubling push distance to 20 ft if Urban Jungle was active; set `receipt.targetUuid`/`receipt.targetName` directly without pushing unhandled target kind entries; reset `meleeForcedMovementDoubled` after use.
   - Location 2B (`boundInRope`): set `receipt.targetUuid`/`receipt.targetName` directly, remove unhandled target entry push, record flag changes and Martial DC.
   - Location 2C (`dragBoundTarget`, `hogtie`): set `receipt.targetUuid`/`receipt.targetName` directly, remove unhandled target entry push.
   - Location 2D (`wrangler`): set `receipt.targetUuid`/`receipt.targetName` directly, remove unhandled target entry push.
   - Location 2E (`mightyPush`): remove `{ kind: "damage" }` push to `receipt.targets`; set `receipt.targetUuid`, `receipt.targetName`, `receipt.formula = "8d6"`, and `receipt.rollLabel = "Mighty Push Bludgeoning Damage"` so `useRoll` evaluates cleanly.
   - Location 2F (`scorpionSting`): remove unhandled target entry push; set `receipt.targetUuid`, `receipt.targetName`, `receipt.attackCount = 6`, `receipt.bonusDamage = bonusDmg`.
   - Location 2G: Add new `bonusActionHookAttack` plan to `HOOKMASTER_PLANS` enforcing no prior/subsequent ranged hook attacks on turn.
   - Location 2H: Target validators & `hookmasterCleanup`: update `validateTarget` functions, and add `revertHookedWeapon` undo handling in `hookmasterCleanup` to restore weapon's `two`, `thr`, range, and `isHooked = true` on the item document.
3. In `ak5e/scripts/specialist-sheet.mjs`:
   - Location 3A: Add Bonus Action Hook Attack button in `openSpecialistControls()` dialog when `hasHook` is true.
   - Location 3B: Route `bonusActionHookAttack` through `confirmPlayUse`.
4. In `ak5e/test/hookmaster.test.mjs`:
   - Location 4A: Replace bare function calls in Area 4, 6, 8, 12 with `Hooks.callAll("dnd5e.preRollAttackV2", ...)` and `Hooks.callAll("dnd5e.preRollDamageV2", ...)`.
   - Location 4B: In Area 14, replace `assert.ok(true)` with empirical listener count checks (`Hooks._hooks.get(...)?.length`).
   - Location 4C: Add Area 15 test covering Bonus Action Hook Attack, 10 ft Pull on ranged hook hit, Hook Lockout, Urban Jungle attack restrictions, Big Boot push doubling, and Wrangler DR bypass.

Verification Commands to Run:
- `node --test ak5e/test/hookmaster.test.mjs`
- `node --test ak5e/test/hookmaster-adversarial.test.mjs` (must pass 11/11 with 0 failures!)
- `node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs ak5e/test/executor-adversarial.test.mjs ak5e/test/hookmaster.test.mjs ak5e/test/hookmaster-adversarial.test.mjs`
- `node ak5e/tools/validate-files.mjs`
- `node ak5e/tools/verify-generated-content.mjs`

Deliverable:
Write a comprehensive handoff report to `/home/patch/AK5e-Foundry/.agents/teamwork/worker_m3_8_it2/handoff.md` following the Handoff Protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method).
When finished, notify the orchestrator with send_message.


## 2026-10-17T03:16:27Z
**Context**: Milestone 3 Iteration 2 Hookmaster Remediation
**Content**: Safety timer triggered (10 minutes elapsed). Checking on your implementation and test status.
**Action**: Please report your current progress and ETA for handoff.md.
