## 2026-10-17T12:12:55Z
Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/worker_m5_8/.
You are the Implementation Worker for Milestone 5: Full Regression, Live Headless Browser & Visual Verification.

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read first:
- /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (mandatory)
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/SCOPE.md
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/GATE_STATUS.md
- /home/patch/AK5e-Foundry/AGENTS.md, /home/patch/AK5e-Foundry/WORKFLOW.md, /home/patch/AK5e-Foundry/GEMINI.md
- Existing live test scripts for reference:
  - ak5e/tools/test-medic-live.mjs
  - ak5e/tools/test-guard-live.mjs
  - ak5e/tools/test-browser.mjs
- Existing Specialist implementations:
  - ak5e/scripts/specialist-rules.mjs
  - ak5e/scripts/specialist-progression.mjs
  - ak5e/scripts/specialist-features.mjs
  - ak5e/scripts/specialist-setup.mjs
  - ak5e/scripts/executor-features.mjs
  - ak5e/scripts/hookmaster-features.mjs
  - ak5e/scripts/infuser-features.mjs
  - ak5e/scripts/specialist-uses.mjs
  - ak5e/scripts/specialist-sheet.mjs
  - ak5e/scripts/ak5e.mjs

Tasks & File Ownership:
1. Exclusively create `ak5e/tools/test-specialist-live.mjs`:
   - Connect via `launchTestBrowser(chromium)` from `./test-browser.mjs` per WORKFLOW §5.3.
   - Port: read from `process.env.AK5E_TEST_PORT ?? "30175"`.
   - Output directory: `process.env.AK5E_TEST_OUTPUT ?? "/tmp/ak5e-specialist-evidence"`.
   - Connect to `http://127.0.0.1:${port}/join` as Gamemaster.
   - Ensure `ak5e` module is active and `game.ak5e.specialist` is available.
   - Setup test actors:
     - `Specialist (Base)`: Level 5 character with Specialist class, Prowess pool 3, starting equipment.
     - `Executor (Hunter)`: Level 5 character with Specialist class, Executor subclass (Hunter path), Deathmark state, Sweeper, Smokescreen.
     - `Hookmaster`: Level 5 character with Specialist class, Hookmaster subclass, equipped Hooked Weapon, Big Boot, King of the Urban Jungle, Bound in Rope.
     - `Infuser`: Level 5 character with Specialist class, Infuser subclass, Pharmacology Kit, Alchemical Infusions pool (6/6), Double-Blind Trial, 8 Infusions.
     - `Target Dummy`: Friendly/neutral character actor to receive Deathmark, Hook pull, Alchemical Infusions, and test GM relay.
   - Exercise live interactions and capture at least 15 screenshots saved into output directory:
     01. `01-baseline-world.png`: Baseline canvas ready.
     02. `02-base-specialist-sheet.png`: Base Specialist sheet opened showing `.ak5e-specialist-badge` with Prowess pool.
     03. `03-base-specialist-controls.png`: Specialist Controls dialog opened from sheet button.
     04. `04-mark-of-specialist-card.png`: Mark of a Specialist active ability executed, chat card with interactive buttons.
     05. `05-executor-sheet.png`: Executor sheet opened showing `Deathmark: Held [Hunter]` badge.
     06. `06-executor-controls.png`: Executor Controls dialog displaying Deathmark & path actions.
     07. `07-deathmark-transferred.png`: Transfer Deathmark executed onto Target Dummy (badge updates to `Deathmark: Marked (Target Dummy) [Hunter]`).
     08. `08-executor-mortal-blow-card.png`: Mortal Blow chat card rendered with interactive 10d8 roll button.
     09. `09-hookmaster-sheet.png`: Hookmaster sheet opened showing Hooked Weapon badge.
     10. `10-hookmaster-controls.png`: Hookmaster Controls dialog displaying Hooked Weapon & movement actions.
     11. `11-hookmaster-mighty-push-card.png`: Mighty Push chat card rendered with interactive 8d6 damage roll button and knockback notice.
     12. `12-hookmaster-bound-in-rope-card.png`: Bound in Rope executed on Target Dummy, grappling target and locking Hook.
     13. `13-infuser-sheet.png`: Infuser sheet opened showing Infusion badges and Infuser DC `20 - INT - PB`.
     14. `14-infuser-controls.png`: Infuser Controls dialog displaying 8 Alchemical Infusions and Double-Blind Trial.
     15. `15-infuser-applied-card.png`: Apply Infusion (Muscle Strengthener) executed on Target Dummy.
     16. `16-infuser-double-blind-card.png`: Double-Blind Trial executed with interactive 1d6 Toxin roll button.
     17. `17-undo-executed.png`: Undo executed on Apply Infusion, refunding infusion and restoring target.
   - Track `report.errors` and `report.screenshots`. Verify `report.errors.length === 0`.
   - Write `report.json` and `browser-report.json` to output directory.
   - Clean up browser and contexts in `finally`.

2. Execute the live browser test:
   - Prepare a disposable `/tmp` user data copy (`/tmp/ak5e-specialist-test-data`).
     Copy `systems/dnd5e` from `/home/patch/.local/share/FoundryVTT/Data/systems/dnd5e` and copy a pristine world to `Data/worlds/standard-test` (with `"id": "standard-test"` in `world.json`).
   - Run module installer: `node ak5e/tools/install-for-testing.mjs --data-path /tmp/ak5e-specialist-test-data --foundry-path /home/patch/FoundryV13 --port 30175`.
   - Write `/tmp/run-specialist-live.sh` implementing POSIX process tracking, signal traps (`EXIT`, `INT`, `TERM`), port readiness polling, executing `node ak5e/tools/test-specialist-live.mjs`, and confirming port 30175 is released via `ss -H -ltn \"sport = :30175\"`.
   - Run `/tmp/run-specialist-live.sh`. Verify clean exit (code 0) and port release.

3. Run Full Automated Test Regression & Validation:
   - `node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs ak5e/test/executor-adversarial.test.mjs ak5e/test/hookmaster.test.mjs ak5e/test/hookmaster-adversarial.test.mjs ak5e/test/infuser.test.mjs ak5e/test/infuser-adversarial.test.mjs` (must pass 127/127 tests!)
   - `npm test`
   - `node ak5e/tools/validate-files.mjs`
   - `node ak5e/tools/verify-generated-content.mjs`

4. Update Documentation:
   - In `TODO.md`: Update Specialist class section (L920–960): mark Specialist base class and Executor, Hookmaster, and Infuser subclasses complete with verified test evidence and live browser execution details.
   - In `ak5e/DECISIONS.md`: Append the Infuser Subclass decisions (Infuser DC formula `20 - INT - PB` vs `8 + INT + PB`, Principle of Double Effect, 8 Alchemical Infusions, Leverage CON save workflow, Double-Blind Trial, Stimpack, Excessive Dosing, and To Defy Science).

Deliverable:
Write a comprehensive handoff report to `/home/patch/AK5e-Foundry/.agents/teamwork/worker_m5_8/handoff.md` following the Handoff Protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method). Include all command outputs, verbatim test results, paths to all 17 screenshots, and documentation diffs.
When finished, notify the orchestrator with send_message.
