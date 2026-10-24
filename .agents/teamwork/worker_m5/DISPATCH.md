# DISPATCH — worker_m5

**Agent**: `worker_m5` (`teamwork_preview_worker`)  
**Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/worker_m5/`  
**Parent Orchestrator**: `orchestrator_10` (`cf5c8a2a-802f-473e-8274-6566de462e7c`)

---

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. An auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

---

## Assignment: Milestone 5 — Live In-Foundry Headless Browser Testing

### 1. Update `ak5e/tools/test-specialist-live.mjs`
Extend `ak5e/tools/test-specialist-live.mjs` to add comprehensive live browser verification for the Inventor subclass:
- **Actor Setup**:
  Create an `"Inventor"` Actor: Level 5 Specialist, Inventor subclass, Int 16 (+3), Con 14 (+2), Dex 14 (+2), PB 3, equipped with a Warhammer and Medium Armor. Inventions pool 6, Prowess pool 3.
- **Step 18**: Open Inventor sheet on Features tab. Verify and capture `18-inventor-sheet-features.png`:
  - `.ak5e-specialist-badge-inventions` displaying `Inventions: 6 / 6`
  - `.ak5e-specialist-badge-inventor-dc` displaying `Inventor DC: 14`
  - `.ak5e-specialist-badge-mod-count` displaying `Active Modifications: 0`
- **Step 19**: Open Specialist Controls dialog (`openSpecialistControls(inventor)`). Verify dialog title, Inventor action buttons group, and capture `19-inventor-controls-dialog.png`.
- **Step 20**: Execute `applyModification` (install `boom-module` on the Warhammer). Verify Inventions spent to 5, item modification array updated, and capture `20-inventor-mod-applied.png`.
- **Step 21**: Execute `activateModification` (`boom-module` on Warhammer). Post chat card with interactive `awaitingRoll` Instability breakdown button (`formula = "3d6"`). Verify button is visible and capture `21-inventor-activate-card.png`.
- **Step 22**: Click interactive roll button (`useRoll` on the card). Transition receipt to `complete`. Capture `22-inventor-breakdown-roll.png`.
- **Step 23**: Execute `strangeContraption` (e.g. `flashlight` or `unstable-contraption`). Post chat card. Capture `23-inventor-contraption-card.png`.
- **Step 24**: Execute `undoUse` on `applyModification`. Verify Inventions refunded to 6 and modification removed. Capture `24-inventor-undo-executed.png`.

Update screenshot count expectations from 17 to 24 in `test-specialist-live.mjs`.

### 2. Execute Headless Chromium Live Browser Test
Follow `GEMINI.md` §5 and `AGENTS.md` §2/§5.3:
- Copy disposable stopped `standard-test` fixture to `/tmp/ak5e-test-specialist-data` with Data/ and independent World/system copies.
- Check port availability (default 30175).
- Install module into test data:
  `npm run install:foundry -- --data-path /tmp/ak5e-test-specialist-data --foundry-path /home/patch/FoundryV13 --port 30175`
- Launch Foundry V13 headless background server with process trap and PID tracking (`AK5E_TEST_PID`).
- Wait for readiness.
- Execute:
  `node ak5e/tools/test-specialist-live.mjs`
  using `launchTestBrowser()`. Output directory: `/tmp/ak5e-specialist-evidence/`.
- Verify clean shutdown (kill server, verify port released).
- Verify `report.json` in `/tmp/ak5e-specialist-evidence/`:
  - `errors: []` (0 errors)
  - `screenshots`: all 24 screenshots captured.

### 3. Deliver Report
Write `/home/patch/AK5e-Foundry/.agents/teamwork/worker_m5/handoff.md` with:
- Exact list of all 24 captured screenshots with paths.
- Execution log and report summary (`errors: []`).
- Verification commands and outcomes.
Notify orchestrator via `send_message`.

## 2026-10-20T07:39:41Z
Assignment:
1. Update ak5e/tools/test-specialist-live.mjs with Inventor steps (actor setup, Step 18 features tab badges, Step 19 Specialist Controls dialog, Step 20 applyModification, Step 21 activateModification card with awaitingRoll button, Step 22 interactive breakdown roll, Step 23 strangeContraption card, Step 24 undo executed). Total screenshots: 24.
2. Follow GEMINI.md §5 to copy stopped disposable standard-test fixture to /tmp/ak5e-test-specialist-data, install ak5e module via npm run install:foundry, start Foundry V13 headless server with process traps and PID tracking, execute test-specialist-live.mjs on port 30175 with launchTestBrowser(), and cleanly stop the server.
3. Verify /tmp/ak5e-specialist-evidence/report.json has errors: [] and all 24 screenshots.
4. Write handoff.md and send message to orchestrator.
