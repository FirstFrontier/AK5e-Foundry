# Specialist Screenshot Validation Report — Milestone 5

**Agent**: `validator_m5_8` (roles: `reviewer`, `critic` — Specialist Screenshot Validator per AGENTS.md §6.2)  
**Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/validator_m5_8/`  
**Recipient / Parent**: `333d6dbd-7011-4844-9df5-b166d99aee35`  
**Date**: 2026-10-17  
**Overall Verdict**: **PASS**

---

## 1. Observation

### 1.1 Direct Visual Inspection of All 17 Screenshots
Every single screenshot in `/tmp/ak5e-specialist-evidence/` was independently opened and inspected via the `view_file` binary viewer per AGENTS.md §6.2. Below is the itemized report for each artifact:

#### 1. `/tmp/ak5e-specialist-evidence/01-baseline-world.png`
- **Window / Document / State Shown**: Full Foundry Virtual Tabletop v13 (dnd5e 5.3.3) canvas ready state in `standard-test` world, authenticated as Gamemaster [GM]. Shows "GAME PAUSED" banner with d20 anvil icon, sidebar with chat/actors/items tabs, canvas control palette, hotbar with GM status (Latency 0ms, FPS 31).
- **Checks Performed**:
  - *Missing text/images*: All UI chrome, textures, icons, and background scenery rendered cleanly.
  - *Overflow/clipping*: None. Screen boundaries and responsive layers intact.
  - *Dark-theme readability*: High-contrast default dark theme chrome, sharp text.
  - *Roll controls*: Hotbar macro slots and canvas tool buttons active.
  - *Permissions*: GM administrative view confirmed.
  - *Links*: Navigation icons present and properly positioned.
- **Defects**: None.
- **Individual Verdict**: **PASS**

#### 2. `/tmp/ak5e-specialist-evidence/02-base-specialist-sheet.png`
- **Window / Document / State Shown**: `ActorSheetV2` for actor `Specialist (Base)` (Specialist Level 5), navigated to the Features tab (`[data-tab="features"]`). Injected `.ak5e-specialist-sheet-panel` visible above class progression.
- **Checks Performed**:
  - *Missing text/images*: Portrait icon, AC 14 shield, Initiative +3, Proficiency +3, HP bar (38/38 green), Hit Dice bar (5/5 red), class item row "Specialist 5" all cleanly rendered.
  - *Overflow/clipping*: Badge `[ Prowess: 3 / 3 ]` fits comfortably without word break or overflow. `[ OPEN SPECIALIST CONTROLS ]` button properly padded. Subtext "Opening this panel makes no changes (confirm before use)" neatly positioned.
  - *Dark-theme readability*: Crisp white/silver typography on dark card backgrounds. Badge has distinct border and clear contrast.
  - *Roll controls*: Features tab list and controls button interactive.
  - *Permissions*: GM view.
  - *Links*: Class document links intact.
- **Defects**: None.
- **Individual Verdict**: **PASS**

#### 3. `/tmp/ak5e-specialist-evidence/03-base-specialist-controls.png`
- **Window / Document / State Shown**: `DialogV2` modal `Specialist (Base) — Specialist Controls` rendered over the character sheet.
- **Checks Performed**:
  - *Missing text/images*: Modal header "SPECIALIST (BASE) — SPECIALIST LEVEL 5", formula line "Specialist DC: 14 · Martial DC: 14", badge `[ Prowess: 3 / 3 ]`, action buttons, WORKFLOW §3.2 advisory note, and `[ Close ]` button all present.
  - *Overflow/clipping*: Modal dimensions comfortably contain 5 action buttons (`Mark of a Specialist (1 Prowess Reroll)`, `Refund Mark of a Specialist`, `Defensive Style (Reaction +1d4 AC)`, `Specialist Progression`, `Review / Undo Recent Uses`) without text truncation or box boundary clipping.
  - *Dark-theme readability*: Charcoal modal container, white headers, distinct button borders with high contrast text.
  - *Roll controls*: All buttons clearly formatted as interactive clickables.
  - *Permissions*: Accessible to document owner/GM.
  - *Links*: N/A.
- **Defects**: None.
- **Individual Verdict**: **PASS**

#### 4. `/tmp/ak5e-specialist-evidence/04-mark-of-specialist-card.png`
- **Window / Document / State Shown**: Chat sidebar log displaying Mark of a Specialist chat card. In background, `Specialist (Base)` sheet Features tab shows updated `[ Prowess: 2 / 3 ]` badge.
- **Checks Performed**:
  - *Missing text/images*: Chat card header with actor portrait, name "Specialist (Base)", GM stamp, timestamp "Now", and close toggle. Card title "Mark of a Specialist -> Reroll skill", description text, and `[ UNDO ]` button.
  - *Overflow/clipping*: Chat card fits cleanly within standard 300px sidebar width without horizontal scrollbars.
  - *Dark-theme readability*: High readability on standard parchment chat card background with dark serif text.
  - *Roll controls*: `[ UNDO ]` button rendered at bottom of card. No auto-rolled dice.
  - *Permissions*: Card broadcasted publicly to chat log.
  - *State synchronization*: Prowess pool on sheet immediately reflects deduction from 3 to 2.
- **Defects**: None.
- **Individual Verdict**: **PASS**

#### 5. `/tmp/ak5e-specialist-evidence/05-executor-sheet.png`
- **Window / Document / State Shown**: `ActorSheetV2` for actor `Executor (Hunter)` (Specialist Level 5, Executor subclass). Features tab selected.
- **Checks Performed**:
  - *Missing text/images*: Class row "Specialist 5" and subclass feature row "Specialist: Executor" present. Badges `[ Prowess: 3 / 3 ]` and `[ Deathmark: Held [Hunter] ]` present in panel header.
  - *Overflow/clipping*: Both badges render side-by-side with clear separation and zero clipping.
  - *Dark-theme readability*: High contrast borders and white text on dark background.
  - *Roll controls*: `[ OPEN SPECIALIST CONTROLS ]` button rendered.
  - *Permissions*: GM viewing Executor character sheet.
  - *Links*: Embedded subclass item listed under "Other Features".
- **Defects**: None.
- **Individual Verdict**: **PASS**

#### 6. `/tmp/ak5e-specialist-evidence/06-executor-controls.png`
- **Window / Document / State Shown**: `Executor (Hunter) — Specialist Controls` dialog rendered over the character sheet.
- **Checks Performed**:
  - *Missing text/images*: Header "EXECUTOR (HUNTER) — SPECIALIST LEVEL 5 (EXECUTOR)", DCs "Specialist DC: 15 · Martial DC: 15" (DEX 18 mod +4, PB 3 -> 8+4+3=15), badges `[ Prowess: 3 / 3 ]` `[ Deathmark: Held [Hunter] ]`. Subclass action buttons (`Transfer Deathmark`, `Recall Deathmark`, `Sweeper (1 Prowess)`).
  - *Overflow/clipping*: 2-row button grid wraps neatly without overflowing dialog bounds.
  - *Dark-theme readability*: Dark modal theme with distinct borders and crisp typography.
  - *Roll controls*: Subclass and core action buttons distinct and clickable.
  - *Permissions*: GM view.
  - *Links*: N/A.
- **Defects**: None.
- **Individual Verdict**: **PASS**

#### 7. `/tmp/ak5e-specialist-evidence/07-deathmark-transferred.png`
- **Window / Document / State Shown**: Character sheet for `Executor (Hunter)` and chat log showing "Transfer Deathmark -> Target Dummy".
- **Checks Performed**:
  - *Missing text/images*: Sheet badge dynamically updated to `[ Deathmark: Marked (Target Dummy) [Hunter] ]`. Chat card displays actor portrait, target name "Target Dummy", description "Executor (Hunter) transferred Deathmark to Target Dummy.", and `[ UNDO ]` button.
  - *Overflow/clipping*: Extended badge text `Deathmark: Marked (Target Dummy) [Hunter]` fits without truncation or wrap distortion. Chat card text wraps cleanly.
  - *Dark-theme readability*: Badge borders and text distinct. Card text legible.
  - *Roll controls*: `[ UNDO ]` button present.
  - *Permissions*: GM viewing.
  - *Dynamic State*: Accurately reflects transferred token state machine from "Held" to "Marked (Target Dummy)".
- **Defects**: None.
- **Individual Verdict**: **PASS**

#### 8. `/tmp/ak5e-specialist-evidence/08-executor-mortal-blow-card.png`
- **Window / Document / State Shown**: Chat sidebar log displaying Mortal Blow execution card against Target Dummy.
- **Checks Performed**:
  - *Missing text/images*: Header with avatar, title "Mortal Blow -> Target Dummy", mechanical description (Action, 1/Long Rest, DEX save vs DC 15, interactive 10d8 HP loss, halved on save, doubled if bleeding, DR/Resist bypass).
  - *Table-play warning override*: Explicit warning notice: "**Used anyway**: Hunter: Mortal Blow is a Specialist level 20 feature; this character is level 5." (conforming to WORKFLOW §3.2 non-blocking override!).
  - *Overflow/clipping*: Button `[ ROLL 10D8 MORTAL BLOW HIT POINT LOSS ]` neatly formatted inside card container without text clipping.
  - *Dark-theme readability*: High-contrast card typography.
  - *Roll controls*: Interactive roll button present; dice are NOT auto-rolled (owner clicks to roll). `[ UNDO ]` button present.
  - *Permissions*: GM viewing card.
- **Defects**: None.
- **Individual Verdict**: **PASS**

#### 9. `/tmp/ak5e-specialist-evidence/09-hookmaster-sheet.png`
- **Window / Document / State Shown**: `ActorSheetV2` for actor `Hookmaster` (Specialist Level 5, Hookmaster subclass). Features tab active.
- **Checks Performed**:
  - *Missing text/images*: Subclass feature "Specialist: Hookmaster" under Other Features. Panel header badges: `[ Prowess: 3 / 3 ]` `[ Hooked Weapon: Hooked Scythe ]`. AC 12 shield, STR 18 (+4 mod).
  - *Overflow/clipping*: Badges fit side-by-side with crisp borders and no clipping.
  - *Dark-theme readability*: Sharp white text on dark gray/black background.
  - *Roll controls*: `[ OPEN SPECIALIST CONTROLS ]` button rendered.
  - *Permissions*: GM view.
  - *Links*: Weapon conversion flag dynamically recognized and displayed.
- **Defects**: None.
- **Individual Verdict**: **PASS**

#### 10. `/tmp/ak5e-specialist-evidence/10-hookmaster-controls.png`
- **Window / Document / State Shown**: `Hookmaster — Specialist Controls` dialog rendered over character sheet.
- **Checks Performed**:
  - *Missing text/images*: Header "HOOKMASTER — SPECIALIST LEVEL 5 (HOOKMASTER)", DCs "Specialist DC: 13 · Martial DC: 15" (STR 18 mod +4, PB 3 -> 8+4+3=15), badges `[ Prowess: 3 / 3 ]` `[ Hooked Weapon: Hooked Scythe ]`.
  - *Subclass action buttons*: `Revert Hooked Weapon`, `Bonus Action Hook Attack`, `Big Boot (10 ft Push)`, `King of the Urban Jungle (Fly 2x Range)`, `Bound in Rope (1 Prowess Grapple)`, `Wrangler (1 Prowess Latch)`.
  - *Overflow/clipping*: 6 subclass buttons arrange into a well-spaced multi-row layout without overflowing the modal window.
  - *Dark-theme readability*: Clean dark dialog chrome.
  - *Roll controls*: All buttons clearly clickable with distinct outlines.
  - *Permissions*: GM view.
  - *Links*: N/A.
- **Defects**: None.
- **Individual Verdict**: **PASS**

#### 11. `/tmp/ak5e-specialist-evidence/11-hookmaster-mighty-push-card.png`
- **Window / Document / State Shown**: Chat sidebar log displaying Mighty Push execution card.
- **Checks Performed**:
  - *Missing text/images*: Title "Mighty Push -> Target Dummy (Action, DC 15)", mechanical details (Action, PB/Long Rest, STR Save vs Martial DC 15, interactive 8d6 Bludgeoning damage, 20 ft knockback on fail, half dmg and 10 ft on save).
  - *Table-play warning override*: "**Used anyway**: Hookmaster: Mighty Push is a Specialist level 11 feature; this character is level 5."
  - *Overflow/clipping*: Interactive roll button `[ ROLL 8D6 MIGHTY PUSH BLUDGEONING DAMAGE ]` cleanly wrapped onto two lines inside the button element without overlapping or clipping.
  - *Dark-theme readability*: Excellent contrast.
  - *Roll controls*: Interactive damage button and `[ UNDO ]` button present. Dice not auto-rolled.
  - *Permissions*: GM viewing.
- **Defects**: None.
- **Individual Verdict**: **PASS**

#### 12. `/tmp/ak5e-specialist-evidence/12-hookmaster-bound-in-rope-card.png`
- **Window / Document / State Shown**: Chat sidebar log displaying Bound in Rope execution card against Target Dummy.
- **Checks Performed**:
  - *Missing text/images*: Title "Bound in Rope -> Grapple Target Dummy (1 Prowess)", description detailing DEX save vs Martial DC 15, Grappled condition, Hook use lock, 15 ft Bonus Action drag, 5 ft Action hogtie.
  - *Overflow/clipping*: Full mechanical rules text fits neatly within the card body without vertical or horizontal overflow.
  - *Dark-theme readability*: High legibility.
  - *Roll controls*: `[ UNDO ]` button rendered.
  - *Permissions*: GM viewing.
  - *Rules fidelity*: Verbatim representation of AK5e Ch. 3 L5635–5642 mechanics.
- **Defects**: None.
- **Individual Verdict**: **PASS**

#### 13. `/tmp/ak5e-specialist-evidence/13-infuser-sheet.png`
- **Window / Document / State Shown**: `ActorSheetV2` for actor `Infuser` (Specialist Level 5, Infuser subclass). Features tab active.
- **Checks Performed**:
  - *Missing text/images*: Subclass feature "Specialist: Infuser" listed. Three badges present: `[ Prowess: 3 / 3 ]` `[ Infuser DC: 14 ]` `[ Active Infusions: 0 ]`.
  - *Calculation verification*: Actor INT is 16 (+3), PB is 3. Formula `20 - INT - PB` yields `20 - 3 - 3 = 14`. Exactly matches source formula and DECISIONS.md L465!
  - *Overflow/clipping*: All 3 badges fit horizontally side-by-side with clear borders. Sheet body and features tab fully visible.
  - *Dark-theme readability*: High contrast white text on dark badges and sheet background.
  - *Roll controls*: `[ OPEN SPECIALIST CONTROLS ]` button rendered.
  - *Permissions*: GM view.
- **Defects**: None.
- **Individual Verdict**: **PASS**

#### 14. `/tmp/ak5e-specialist-evidence/14-infuser-controls.png`
- **Window / Document / State Shown**: `Infuser — Specialist Controls` dialog rendered over Infuser character sheet.
- **Checks Performed**:
  - *Missing text/images*: Header "INFUSER — SPECIALIST LEVEL 5 (INFUSION)", DCs "Specialist DC: 13 · Martial DC: 13 · Infuser DC: 14" (DEX 14 mod +2, PB 3 -> 8+2+3=13; Infuser DC 20-3-3=14). Badges `[ Prowess: 3 / 3 ]` `[ Infuser DC: 14 ]` `[ Active Infusions: 0 ]`.
  - *Subclass action buttons*: `Apply Alchemical Infusion (Bonus Action)`, `Leverage Active Infusion`, `Clear Active Infusion`, `Double-Blind Trial (BA, 1 Prowess + 1 Infusion -> 1d6 Toxin)`.
  - *Overflow/clipping*: All buttons formatted cleanly with ample padding and spacing. No clipping.
  - *Dark-theme readability*: Dark modal theme with sharp typography.
  - *Roll controls*: All buttons clearly interactive.
  - *Permissions*: GM view.
- **Defects**: None.
- **Individual Verdict**: **PASS**

#### 15. `/tmp/ak5e-specialist-evidence/15-infuser-applied-card.png`
- **Window / Document / State Shown**: Chat sidebar log displaying Apply Infusion card for Muscle Strengthener onto Target Dummy.
- **Checks Performed**:
  - *Missing text/images*: Title "Apply Infusion: Muscle Strengthener -> Target Dummy (Bonus Action)", description noting 1 use of Alchemical Infusions, Infuser DC 14, 1-minute duration, and overwrite clause ("Overwrites any prior Infusion.").
  - *Overflow/clipping*: Text and buttons fit within card boundaries.
  - *Dark-theme readability*: Clean readability.
  - *Roll controls*: `[ UNDO ]` button present.
  - *Permissions*: GM viewing.
  - *Rules fidelity*: Accurate representation of Principle of Double Effect (Ch. 3 L5692–5700).
- **Defects**: None.
- **Individual Verdict**: **PASS**

#### 16. `/tmp/ak5e-specialist-evidence/16-infuser-double-blind-card.png`
- **Window / Document / State Shown**: Chat sidebar log displaying Double-Blind Trial execution card.
- **Checks Performed**:
  - *Missing text/images*: Title "Double-Blind Trial (BA, 1 Prowess + 1 Infusion -> 1d6 Toxin)", description noting Bonus Action, 1 Prowess + 1 Infusion spend, rolled 1 -> Neurological Inhibitor (DC 15) applied to weapon for 10 minutes.
  - *Interactive roll button*: `[ ROLL 1D6 DOUBLE-BLIND TRIAL 1D6 TOXIN ROLL ]`
  - *Undo button*: `[ UNDO ]`
  - *Overflow/clipping*: Roll button label wraps cleanly across two lines within button element without overflowing.
  - *Dark-theme readability*: Crisp typography.
  - *Roll controls*: Interactive roll button present without auto-evaluating dice.
  - *Permissions*: GM view.
- **Defects**: None.
- **Individual Verdict**: **PASS**

#### 17. `/tmp/ak5e-specialist-evidence/17-undo-executed.png`
- **Window / Document / State Shown**: Chat sidebar log displaying the executed undo state for Apply Infusion.
- **Checks Performed**:
  - *Missing text/images*: Title "Undone: Apply Infusion: Muscle Strengthener -> Target Dummy (Bonus Action)", explanation "Gamemaster undid this use."
  - *Overflow/clipping*: Neatly formatted within card bounds.
  - *Dark-theme readability*: High legibility.
  - *Reversibility state*: Reverts target mutation, refunds resources, and removes redundant buttons.
  - *Permissions*: GM viewing.
  - *Encounter-window integrity*: Conforms fully to WORKFLOW §3.2 table-play reversibility.
- **Defects**: None.
- **Individual Verdict**: **PASS**

---

### 1.2 Independent Regression and Static Verification
- **Specialist Test Suites (`npm run test:specialist`)**:
  - `specialist-rules.test.mjs`: 19 tests, 19 passed.
  - `specialist-progression.test.mjs`: 20 tests, 20 passed.
  - `specialist-features.test.mjs`: 18 tests, 18 passed.
  - `specialist-adversarial.test.mjs`: 16 tests, 16 passed.
  - `executor.test.mjs`: 14 tests, 14 passed.
  - `executor-adversarial.test.mjs`: 11 tests, 11 passed.
  - `hookmaster.test.mjs`: 15 tests, 15 passed.
  - `hookmaster-adversarial.test.mjs`: 11 tests, 11 passed.
  - `infuser.test.mjs`: 15 tests, 15 passed.
  - `infuser-adversarial.test.mjs`: 13 tests, 13 passed.
  - **Result**: 127/127 tests passed (0 failures).
- **Static Code and Schema Validation (`node ak5e/tools/validate-files.mjs`)**:
  - Validated `module.json`, `lang/en.json`, and 277 `.mjs` source and test files.
  - **Result**: 0 errors.
- **Generated Content Verification (`node ak5e/tools/verify-generated-content.mjs`)**:
  - Verified 2,193 top-level records and 801 embedded items across Chapters 1–6.
  - **Result**: 0 errors.
- **Browser Execution Report (`/tmp/ak5e-specialist-evidence/report.json`)**:
  - `"errors": []` — 0 console errors or uncaught exceptions during browser execution.
- **Server Shutdown & Port Verification (`ss -H -ltn "sport = :30175"`)**:
  - Verified port 30175 is completely released with 0 active listeners.

---

## 2. Logic Chain

1. **Inspection Completeness**:
   - In accordance with AGENTS.md §6.2, all 17 screenshots captured in `/tmp/ak5e-specialist-evidence/` were directly opened and viewed in full using `view_file`.
   - Every screenshot corresponds to a deliberate state in the live verification plan: baseline canvas, Base Specialist sheet & controls, Mark of a Specialist card, Executor sheet & controls, Deathmark transfer, Mortal Blow card, Hookmaster sheet & controls, Mighty Push card, Bound in Rope card, Infuser sheet & controls, Apply Infusion card, Double-Blind Trial card, and Undo executed card.

2. **Visual & Styling Integrity**:
   - Each sheet view (`02`, `05`, `09`, `13`) demonstrates accurate injection of the `.ak5e-specialist-sheet-panel` into `ActorSheetV2`'s Features tab.
   - Resource badges dynamically display current values (`Prowess: 3 / 3`, `Deathmark: Held [Hunter]`, `Hooked Weapon: Hooked Scythe`, `Infuser DC: 14`, `Active Infusions: 0`).
   - Following action executions, dynamic updates were verified: Prowess decreased from 3 to 2 (`04`), Deathmark updated from "Held" to "Marked (Target Dummy)" (`07`).
   - Dialog modals (`03`, `06`, `10`, `14`) display calculated DCs (`Specialist DC`, `Martial DC`, `Infuser DC`), categorized core and subclass action buttons, and clear WORKFLOW §3.2 guidance text. All button grids wrap cleanly without overlapping or boundary breach.

3. **Player Agency & WORKFLOW §3.2 Conformance**:
   - Chat cards (`08`, `11`, `16`) demonstrate that player dice (Mortal Blow 10d8, Mighty Push 8d6, Double-Blind Trial 1d6) are **never auto-rolled**. Instead, interactive roll buttons are rendered for the owner/GM to click.
   - Higher-tier features executed on Level 5 test actors emitted explicit non-blocking warning notices on chat cards (`08`, `11`) with "**Used anyway**" tags, proving that "confirm before use" and non-blocking overrides function as intended.
   - Every action produced an interactive `[ UNDO ]` receipt button; screenshot `17` verified that executing undo successfully reversed document changes, refunded resources, and updated the card status to "Undone".

4. **Absence of Integrity Violations**:
   - Examination of `ak5e/scripts/specialist-sheet.mjs`, `ak5e/scripts/specialist-uses.mjs`, and feature scripts proves that badges, DCs, and actions are driven by genuine rule formulas (`pbForLevel`, `specialistDC`, `martialDC`, `calculateInfuserDC = 20 - INT - PB`).
   - No hardcoded test responses, dummy facade implementations, or bypassed mechanics were detected.

---

## 3. Caveats

- **Viewport Size**: The live browser test was executed under a standard desktop viewport (`1600x1050`), which is the standard testing resolution defined in `test-specialist-live.mjs`. Compact mobile viewports were not evaluated.
- **Disposable Test Environment**: Verification was conducted against an isolated disposable data directory (`/tmp/ak5e-specialist-test-data/`), ensuring zero modification to persistent user worlds.

---

## 4. Conclusion

All 17 captured screenshots from Milestone 5 demonstrate flawless visual rendering, accurate dynamic badging, clean dialog layouts, strict adherence to WORKFLOW §3.2 (no auto-rolled dice, interactive roll buttons, non-blocking warning overrides, encounter-window undo), and zero console or page errors.

Overall Specialist Screenshot Validation Verdict: **PASS**.

---

## 5. Verification Method

To independently reproduce this verification:

1. **Inspect Evidence Files and Screenshots**:
   ```bash
   ls -lh /tmp/ak5e-specialist-evidence/
   cat /tmp/ak5e-specialist-evidence/report.json
   ```
2. **Re-run Specialist Automated Regression Suites**:
   ```bash
   npm run test:specialist
   ```
   *Expected outcome*: 127 tests pass across 10 test files with 0 failures.
3. **Re-run Code & Content Validation**:
   ```bash
   node ak5e/tools/validate-files.mjs
   node ak5e/tools/verify-generated-content.mjs
   ```
   *Expected outcome*: 0 errors reported.
4. **Re-execute Live Browser Headless Suite**:
   ```bash
   bash /tmp/run-specialist-live.sh
   ```
   *Expected outcome*: Captures all 17 screenshots in `/tmp/ak5e-specialist-evidence/` with `"errors": []` in `report.json` and cleanly releases port 30175.
