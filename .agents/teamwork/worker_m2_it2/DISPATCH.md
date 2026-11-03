## 2026-10-12T17:55:00Z
You are worker_m2_it2, the implementation worker for Milestone 2 Iteration 2 (Vanguard Base Class Defect Remediation).
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/worker_m2_it2/

MANDATORY FIRST STEP:
Read the following authoritative files in full:
1. /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
2. /home/patch/AK5e-Foundry/AGENTS.md
3. /home/patch/AK5e-Foundry/WORKFLOW.md
4. /home/patch/AK5e-Foundry/GEMINI.md
5. /home/patch/AK5e-Foundry/PROJECT.md
6. Explorer remediation plan:
   /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_it2/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE FILE OWNERSHIP:
You own and may edit ONLY the following files:
- /home/patch/AK5e-Foundry/ak5e/scripts/vanguard-progression.mjs
- /home/patch/AK5e-Foundry/ak5e/scripts/vanguard-uses.mjs
- /home/patch/AK5e-Foundry/ak5e/scripts/vanguard-features.mjs
- /home/patch/AK5e-Foundry/ak5e/test/vanguard-progression.test.mjs
- /home/patch/AK5e-Foundry/ak5e/test/vanguard-adversarial.test.mjs (if test fixtures/assertions need alignment)

YOUR MISSION:
Apply all remediation code blocks specified in `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_it2/handoff.md`:
1. In `ak5e/scripts/vanguard-progression.mjs`:
   - Calibrate starting currency to 1,300 CP (`writes["system.currency.cp"] = beforeCp + 1300`).
   - Track starting equipment grant in `state.startingEquipmentGranted` and set `state.choices.startingEquipment = { mode: "existing" }` so subsequent level-ups / re-runs do not duplicate gear or cash.
   - Enforce saving throw choice validation: exactly 1 save, must be in `VANGUARD_SAVES.choices` (`["str", "cha"]`).
   - Enforce skill choice validation: exactly 3 unique skills, all in `VANGUARD_SKILLS`.
   - Enforce rolled HP bounds: clamp/validate integer in `[1, 8]`.
   - Enforce ASI bounds: validate valid distribution (+2 to one or +1 to two distinct abilities), clamp values.
2. In `ak5e/test/vanguard-progression.test.mjs`:
   - Update lines 173 and 207 to assert `1300` CP.
3. In `ak5e/scripts/vanguard-uses.mjs`:
   - Import missing `flag` from `./vanguard-rules.mjs` and `isDirectedEngagementActive` from `./vanguard-features.mjs`.
   - Add `triggerId: "uncannyDodge"` and `triggerId: "directedEngagement"` to `receipt.reaction`.
   - Gating Directed Engagement: require level >= 15 or active Directed Engagement to choose Tip outcome without rolling.
   - Set `standardBenefit` metadata on Tip outcomes 5 and 6 so `tipCritReduction` and `useTipSP` work.
   - Set recipient target tracking on Tip outcome 1.
   - Respect per-turn duration of Directed Engagement (`isDirectedEngagementActive(actor)`).
   - In `CORE_COMMANDS.useRoll`, handle Tip of the Spear 1d6 roll resolution, applying the rolled outcome data to the target and completing the receipt.
4. In `ak5e/scripts/vanguard-features.mjs`:
   - In `approachingStormDamageBonus`, check `if (combat?.round === 1)` strictly.

VERIFICATION COMMANDS (Run and document output):
1. `npm run test:vanguard`
2. `node ak5e/tools/stress-vanguard-progression.mjs`
3. `node --test ak5e/test/vanguard-adversarial.test.mjs`
4. `node ak5e/tools/validate-files.mjs`
5. `npm run test:base-classes`

DELIVERABLE:
Write your completion report to `/home/patch/AK5e-Foundry/.agents/teamwork/worker_m2_it2/handoff.md`.
Document all changes, commands run, test pass/fail results, and verification status.
When finished, send a message to orchestrator.
