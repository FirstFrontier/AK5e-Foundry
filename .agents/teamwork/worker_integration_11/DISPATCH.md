## 2026-10-24T03:46:06Z
You are worker_integration_11, an expert AK5e Foundry VTT developer and integration engineer.
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/worker_integration_11

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY SPECIFICATION:
You MUST read the authoritative user request at:
/home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
Also review:
- Implementation plan: /home/patch/.gemini/antigravity/brain/cfa2db8c-fdf5-4245-a920-2d2da2bf8d95/specialist_branches_plan.md
- Subclass handoff reports:
  - /home/patch/AK5e-Foundry/.agents/teamwork/worker_skyranger_11/handoff.md
  - /home/patch/AK5e-Foundry/.agents/teamwork/worker_dollkeeper_11/handoff.md
  - /home/patch/AK5e-Foundry/.agents/teamwork/worker_trapmaster_11/handoff.md
- Subclass feature modules:
  - ak5e/scripts/skyranger-features.mjs
  - ak5e/scripts/dollkeeper-features.mjs
  - ak5e/scripts/trapmaster-features.mjs
- Project contracts: WORKFLOW.md, AGENTS.md, GEMINI.md, ak5e/DECISIONS.md, TODO.md

EXCLUSIVE FILE OWNERSHIP:
You own exclusively:
- ak5e/scripts/specialist-rules.mjs
- ak5e/scripts/specialist-progression.mjs
- ak5e/scripts/specialist-uses.mjs
- ak5e/scripts/specialist-sheet.mjs
- ak5e/scripts/ak5e.mjs
- ak5e/DECISIONS.md
- TODO.md

TASK SCOPE (Milestone 4):
Integrate Skyranger, Dollkeeper, and Trapmaster Specialist branches into the core Specialist engine and UI:
1. `ak5e/scripts/specialist-rules.mjs`:
   - Re-export and wire predicates: `isSkyranger(actor)`, `isDollkeeper(actor)`, `isTrapmaster(actor)`.
   - Register resource pools: `fuel` (scaling 2..8 per Skyranger table, Long Rest recovery), `traps` (2 * PB, Long Rest recovery), `comeAndGetMe` (PB, Short/Long Rest), `mistakenIdentity` (PB, Short/Long Rest).
   - Wire DC calculators: `calculateTrapDC(actor)` (`8 + PB + max(Dex, Int) + (level >= 20 ? 5 : 0)`).
2. `ak5e/scripts/specialist-progression.mjs`:
   - Wire progression grants for Skyranger, Dollkeeper, and Trapmaster at levels 1, 5, 11, 15, and 20.
   - Skyranger: Flight Suit starting equipment grant, Fuel pool initialization, Air Doctrine choice, Jink at 5, Advanced Doctrine at 11, Afterburners at 15, Skyscreamer at 20.
   - Dollkeeper: Living Doll companion grant/linkage, Pull the Strings & Musical Chairs at 5, Masquerade at 11, Living Doll (Reciprocity) at 15, Artistry is Violence at 20.
   - Trapmaster: Traps pool & Sleight of Hand expertise at 1, Panic Inducer & Here's One I Made Earlier at 5, Bait the Trap at 11, Agent of Chaos at 15, House of Horrors at 20.
   - Ensure idempotent progression: re-running setup/progression does not duplicate items, repeat HP increments, or overwrite custom edits.
3. `ak5e/scripts/specialist-uses.mjs`:
   - Interactive table-play plans adhering strictly to WORKFLOW.md §3.2:
     - Confirmation before use.
     - Non-blocking warning overrides ("Use anyway").
     - Resource shortfalls clamp at 0 and broadcast on chat cards.
     - Automatic GM relay for unowned target operations (`validateTarget`).
     - Interactive roll buttons on chat cards (NEVER auto-roll damage, healing, attack, or save dice).
     - Full encounter-window undo receipts recorded under `flags.ak5e.specialistUses`.
   - Implement actions for:
     - Skyranger: `takeOff`, `selectDoctrine`, `aaMissile`, `bombingRun`, `swoopingDive`, `evasiveManoeuvres`, `afterburnersAura`, `activateSkyscreamer`.
     - Dollkeeper: `commandDoll`, `musicalChairs`, `marionette`, `mistakenIdentity`, `dollRaid`.
     - Trapmaster: `placeTrap`, `devilsOwnLuck`, `heresOneIMadeEarlier`, `warningPoint`, `comeAndGetMe`, `partyFavours`.
4. `ak5e/scripts/specialist-sheet.mjs`:
   - Add status badges on ActorSheetV2:
     - Skyranger: Fuel badge (`Fuel: X / Y`), Active Doctrine badge.
     - Dollkeeper: Doll badge (`Doll: Active / Destroyed`), Mistaken Identity uses badge.
     - Trapmaster: Traps badge (`Traps: X / Y`), Trap DC badge.
   - Add interactive action button controls in the Specialist Features tab for triggering subclass actions.
5. `ak5e/scripts/ak5e.mjs`:
   - Expose the new actions and feature functions under `game.ak5e.specialist`.
   - Register event hooks for Hit Dice healing (Dollkeeper), damage mitigation / preApplyDamage (Skyranger), save modification (Trapmaster).
6. Documentation:
   - Record formal rulings in `ak5e/DECISIONS.md`.
   - Update `TODO.md` for Skyranger, Dollkeeper, and Trapmaster items.

VERIFICATION:
- Run all Specialist test suites:
  `node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/skyranger.test.mjs ak5e/test/dollkeeper.test.mjs ak5e/test/trapmaster.test.mjs ak5e/test/executor.test.mjs ak5e/test/hookmaster.test.mjs ak5e/test/infuser.test.mjs ak5e/test/inventor.test.mjs`
- Run static validation: `node ak5e/tools/validate-files.mjs` and `node ak5e/tools/verify-generated-content.mjs`.
- Write handoff.md in your working directory (/home/patch/AK5e-Foundry/.agents/teamwork/worker_integration_11/handoff.md) summarizing changes and test evidence.
- Send a completion message back to parent orchestrator_11 (f3fb86fe-a1dd-4c3f-999f-c6fcb92faf07).

## 2026-10-24T03:59:10Z
[Message from orchestrator_11]:
**Context**: Milestone 4 Specialist Integration
**Content**: Checking in on progress — your last progress.md update was at 03:46:40Z. Please report your current progress across specialist-rules, specialist-progression, specialist-uses, specialist-sheet, and ak5e.mjs, and update your progress.md timestamp.
**Action**: Reply with your current status and any blocking issues or ETA.
