## 2026-10-12T00:51:07Z
You are the Worker implementing Milestone M4: UI & Core Integration.
Your assigned working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/worker_ui/

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY INSTRUCTIONS:
1. Read ORIGINAL_REQUEST.md at /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md.
2. Read PROJECT.md at /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_1/PROJECT.md.
3. Read AGENTS.md, WORKFLOW.md, and GEMINI.md in the project root. Adhere strictly to WORKFLOW.md §3.2.
4. Files you own exclusively:
   - ak5e/scripts/guard-rules.mjs
   - ak5e/scripts/guard-sheet.mjs
   - ak5e/scripts/ak5e.mjs
   - package.json
   Do NOT touch other files.

Detailed Implementation Requirements:
A. `ak5e/scripts/guard-rules.mjs`:
   - Add "duellist", "liberator", "lord" to IMPLEMENTED_GUARD_BRANCHES array.
B. `ak5e/scripts/ak5e.mjs`:
   - Import `isDuellist`, `registerDuellistHooks` from `./duellist-features.mjs`.
   - Import `isLiberator`, `registerLiberatorHooks` from `./liberator-features.mjs`.
   - Import `isLord`, `registerLordHooks` from `./lord-features.mjs`.
   - In the `ready` hook: register `registerDuellistHooks()`, `registerLiberatorHooks()`, `registerLordHooks()`.
   - Export predicates on `game.ak5e.guard`: `isDuellist`, `isLiberator`, `isLord`.
C. `ak5e/scripts/guard-sheet.mjs`:
   - Import `isDuellist`, `isLiberator`, `isLord`. Also import relevant helpers if needed.
   - In `openGuardControls(actor)`:
     - Render summary badges:
       - Duellist: Duel Points badge (e.g. `Points: ${points}/10`), opponent name if declared.
       - Liberator: Liberty badge (e.g. `Liberty: ${liberty}/6`).
       - Lord: Authority badge (`Authority: Active / Inactive`), Manifestation uses (`Manifestation: ${value}/${max}`).
     - Render dedicated subclass action groups with buttons (`data-guard-cmd="<cmd>"`):
       - Duellist: Opponent Declaration (`declareOpponent`), Turn Start Points (`duelTurnStart`), Riposte (`riposte`), Lightning Reflexes (`lightningReflexes`), Punish Opening (`punishOpening`), Engagements (`openEngagement`), Grand Challenge (`grandChallenge`), Coup de Grâce (`coupDeGrace`).
       - Liberator: Guide the Masses (`guideTheMasses`), Flash of Anger (`flashOfAnger`), The Right Moment (`theRightMoment`), Face Me (`faceMe`), Inaction Liberty (`libertyInaction`), Révolution (`revolution`).
       - Lord: Toggle Authority (`toggleAuthority`), Manifest Destiny (`manifestDestiny`), Manifest Will (`manifestWill`), Will Attunement (`willAttunement`), Make It So (`makeItSo`), A Leader Leads (`aLeaderLeads`), Force of Will (`forceOfWill`).
   - In `executeGuardDialog(actor, cmd)`:
     - Provide interactive DialogV2 prompts for:
       - `openEngagement` or engagement selection: choose between the 9 Engagements (Analysis, Balestra, Derobement, Displacement, En Garde, Feint, Fleche, Redoublement, Score) with costs displayed.
       - `guideTheMasses`: choose mode (Advocate, Empower, Uplift), target, display bonus calculation.
       - `flashOfAnger`: choose Liberty amount (1 to current), show dice formula, splash info at 13th+.
       - `manifestWill`: choose King's Domain mode ("castle" or "pursuit").
       - `makeItSo`: choose d20 roll type, display CHA+PB or CHA+2*PB bonus.
       - `forceOfWill`: choose element group, display save DC and dice formula.
       - `toggleAuthority`: choose gain/loss trigger.
D. `package.json`:
   - Update line 22 `"test:guard"` script to include `ak5e/test/duellist.test.mjs`, `ak5e/test/liberator.test.mjs`, and `ak5e/test/lord.test.mjs`.
E. Run and verify:
   - Run `npm run test:guard` and verify all suites pass cleanly with 0 failures (all 9 suites, 90+ tests).
   - Run `node ak5e/tools/validate-files.mjs` to ensure clean syntax across all files.
   - Run `node ak5e/tools/verify-generated-content.mjs`.
F. Write your report to /home/patch/AK5e-Foundry/.agents/teamwork/worker_ui/handoff.md and send a completion message with test results.
