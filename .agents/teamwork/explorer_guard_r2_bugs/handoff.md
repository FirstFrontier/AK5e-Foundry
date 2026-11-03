# Guard R2 Defect Analysis & Remediation Handoff Report

## Executive Summary
This report provides a read-only architectural investigation and concrete remediation plan for all 40 Guard R2 defect reports across the four Guard subclasses:
- **Crusher (B-230 – B-239)**: 10 defects covering Heavy Melee Weapon category detection, sheet button inputs, Hit Die expenditure, Extreme Fortitude, Singular Strike, Overbear riders, passives, subclass identity, rulings, and prerequisite/timing warnings.
- **Instructor (B-250 – B-259)**: 10 defects covering Combat Tracker initiative rolls, Renowned Instructor undo/receipts, recipient targeting, Keep Fighting Temporary HP relay, Once More Unto The Breach mass instructions, timing/frequency warnings, unguarded inputs, sheet panel badges, Cooperative Combat rulings, and source card conditions.
- **Musha (B-280 – B-289)**: 10 defects covering Soloblade HP recovery, Blood Price unreducible HP loss, option effects and dialog accuracy, Stand Alone self-heal detection, Not Yet save button and survival HP, Reset DC warnings, Retaliator Go Forth prerequisite, client hook deduplication, and Living on the Edge passives.
- **Reaper (B-290 – B-299)**: 10 defects covering capped Ruin gain undo calculation, Curtainfall hit-timing spend, Reap rolls/saves, crit range hook wiring, Fear the Reaper mark tracking, 0 HP reset client gating and receipts, healing penalty self-heal exemptions and max HP clamping, input validation, card/DECISIONS wording alignment, and test suite gaps.

---

## 1. Observation

### 1.1 Baseline System State
- Current unit tests pass 118/118 across `npm run test:guard`.
- However, existing tests pass only because they test isolated functions with synthetic data, stubbed hooks, and hand-crafted option structures, completely bypassing real runtime paths, sheet dialogs, and game engine hooks.
- All 40 defect reports reside in `bugs/pending/` with status `Unverified` (discovered during audits via static code inspection and targeted Node probes).

### 1.2 Crusher Subclass Observations (B-230 – B-239)
1. **B-230**: `isHeavyMeleeWeapon(item)` at `ak5e/scripts/crusher-features.mjs:81-93` checks `props.has("hvy") || props.has("heavy")`. In AK5e v1.3.1 (Chapter 4 L83), "Heavy Melee Weapons" is a category (Greataxe, Greatsword, Heavy Hammer, Polearm) without a 5e `hvy` property. `chapter-four-content.mjs:522` gives Greatsword `properties: ["two"]` and `flags.ak5e.tableData.category = "heavyMelee"`. `actionType` is not in dnd5e 5.x items, so `!actionType` matches ranged weapons (e.g. Heavy Crossbow). In `crusherPreRollDamage` (`crusher-features.mjs:307`), `roll.formula` does not exist on dnd5e roll configs.
2. **B-231**: In `guard-sheet.mjs:124, 132-134`, buttons for `deathPassing`, `hordeBreaker`, `heroicBlow`, and `heroicKillingBlow` render on the sheet, but `executeGuardDialog` (`guard-sheet.mjs:1133`) has no cases for them, falling through to default `confirmPlayUse` with `{confirmed: true}` and empty data. The plans expect `damageTotal` (`crusher-features.mjs:212`), `excessDamage` (`L231`), `existingCrush` (`L256`), and `targetHp` (`L276`), producing 0 damage, exceptions, or incorrect calculations.
3. **B-232**: In `crusher-features.mjs:147-171`, Renewing Strike calculates `1d{hitDieSize} + CON` healing but never checks `system.attributes.hd.value`, never warns if 0 Hit Dice remain, and never spends a Hit Die in `apply`.
4. **B-233**: Extreme Fortitude (Chapter 3 L2639: "Whenever you roll a Hit Die, roll two dice and discard the lowest result") has no executable implementation in `crusher-features.mjs` or hooks.
5. **B-234**: `singularStrikeBonus` at `crusher-features.mjs:101-115` is exported and unit-tested, but never called by any plan, hook, or sheet control in `ak5e/scripts`.
6. **B-235**: In `crusher-features.mjs:189-207`, `overbear` checks only `primaryRider !== secondaryRider` without validating against the 4 allowed Foecrusher strikes (`staggering`, `dazing`, `renewing`, `smashing`). It does not check for an existing Foecrusher attack use, and if `renewing` is picked, no heal entry is generated.
7. **B-236**: Crusher 10th and 17th passives (Additional Reach L2693, Realmrending Blow L2705, Execution L2703) have no gameplay implementation: Reach is not granted to weapons, resistance bypass flag is never read by damage pipeline, and Execution only prints card text without targeting or executing.
8. **B-237**: `isCrusher(actor)` at `crusher-features.mjs:48-54` returns true if any item on the actor has `chapterThreeId` starting with `subclass-feature-guard-crusher`, even if `guardBranch(actor)` indicates another subclass.
9. **B-238**: Source ambiguities for Crusher remain unruled in `ak5e/DECISIONS.md`: whether Heroic Blow carries a Foecrusher rider, whether Singular Strike covers Extra Attack or Bonus Action attacks, and how Horde Breaker excess damage interacts with DR.
10. **B-239**: Crusher plans in `crusher-features.mjs` check only level, Foecrusher uses, and Aggression; they omit equipment warnings (heavy melee weapon wielded), timing warnings (own turn for Heroic Blow), and prerequisite warnings (Overbear after Foecrusher, Killing Blow after Heroic Blow).

### 1.3 Instructor Subclass Observations (B-250 – B-259)
1. **B-250**: In `instructor-features.mjs:311`, `renownedInstructorInitiative` hooks only `dnd5e.rollInitiative`. In D&D5e 5.3.3, Combat Tracker rolls (`Combat5e#rollAll`, `rollNPC`, `rollInitiative`) do not fire that hook, bypassing recovery.
2. **B-251**: In `instructor-features.mjs:172-182`, `renownedInstructorInitiative` calls `setPool` directly with no `guardUses` receipt, no chat card, and no undo record.
3. **B-252**: The Instruction dialog at `guard-sheet.mjs:450-480` prompts only for instruction choice, never collecting `targetUuid` or `targetName`. `instructor-features.mjs:219` prints the literal string "target", and range (30 ft) and ally checks cannot run.
4. **B-253**: In `instructor-features.mjs:237`, Keep Fighting! sets `formula` and summary but leaves `receipt.targets` empty and defines no `validateTarget`, so Temporary HP is never applied or relayed to the ally, and `useRoll` generates a blank result card.
5. **B-254**: In `instructor-features.mjs:281-303`, Once More Unto The Breach only spends 1 use of `breach`. It prompts for no Instructions, rolls no dice, validates no targets, and spends instantly on click from the sheet (`guard-sheet.mjs:1133`).
6. **B-255**: `INSTRUCTOR_PLANS` in `instructor-features.mjs` do not warn on timing/frequency limits: Kingmaker once per turn with same instruction (L2877), Cooperative Combat once per round (L2874), and From Experience at start of turn in combat (L2872).
7. **B-256**: In `instructor-features.mjs:196`, `data.free` bypasses Instruction Die spend without public warning; missing instruction key silently falls back to `defendYourself` (`L191`); and `isInstructor` (`L57-63`) matches stray items on non-Instructors.
8. **B-257**: The Guard sheet header badges in `guard-sheet.mjs:55` omit Instruction Dice and Breach uses; confirm dialogs show no remaining pool counts or die size.
9. **B-258**: Unruled ambiguity: does Cooperative Combat share the recipient's roll or roll separately? `instructor-features.mjs:237` records a single formula, forcing a shared roll without a logged ruling.
10. **B-259**: Instruction card summaries in `instructor-features.mjs:127-150` drop source conditions: Hang in There! drops "before the end of their next Turn"; Snap Out of It! drops "at the beginning or end of their Turn"; Squad Leader is documented as enabled but is description-only.

### 1.4 Musha Subclass Observations (B-280 – B-289)
1. **B-280**: `mushaSoloblade` at `musha-features.mjs:101-120` sets `receipt.formula` and returns `{}` with no heal target and no HP write; calling `useRoll` rolls the dice but never applies HP to the actor.
2. **B-281**: `mushaBloodPrice` at `musha-features.mjs:186-222` returns `{}` without deducting HP; it stores a hardcoded estimate (9 or 18) instead of the actual rolled damage; `receipt.formula` is discarded on roll.
3. **B-282**: Blood Price options at `musha-features.mjs:213-220` have no mechanical execution: Dig Deep grants no SP, Iai and Ichimonji output no damage bonuses, Center Oneself offers no condition choice, and Soloblade does not warn against use on Blood Price attacks. Sheet dialog (`guard-sheet.mjs:931-932`) misstates Iai and Ichimonji.
4. **B-283**: `mushaPreApplyDamageHook` at `musha-features.mjs#L299` checks `options?.ak5eSelfHeal || options?.source === actor.id || options?.origin === actor.uuid`. In D&D5e 5.3.3, `origin` is a ChatMessage, so self-healing fails to match and is converted to Temporary HP.
5. **B-284**: Ambiguity in Stand Alone (L3262): does it convert the full rolled healing or only the recoverable amount below max HP, and do multiple instances stack? Not logged in `DECISIONS.md`.
6. **B-285**: `mushaNotYet` at `musha-features.mjs:127-155` increments `notYetDc` but provides no Wisdom save button on the chat card and no mechanism to set survival HP to 2*PB on success.
7. **B-286**: `mushaResetNotYet` at `musha-features.mjs:160-174` resets DC to 10 with zero warnings, despite source restricting reset to Long Rest or level 17 full HP.
8. **B-287**: `mushaRetaliator` at `musha-features.mjs:258-282` does not verify that Go Forth was used, accepts any arbitrary string for `mode`, and sheet sends no mode (`guard-sheet.mjs:284`), making Iai unreachable.
9. **B-288**: Musha `updateActor` hook (`musha-features.mjs:345-356`) runs on all clients without `actor.isOwner` or GM gating, causing permission errors and duplicate writes; `registerMushaHooks` lacks an idempotency guard.
10. **B-289**: `livingOnTheEdgeBonus` (`musha-features.mjs:58-70`) is used only for display on sheet badge (`guard-sheet.mjs:59`); no AC or saving throw bonus is ever applied to rolls or documents.

### 1.5 Reaper Subclass Observations (B-290 – B-299)
1. **B-290**: Ruin gain at cap (`reaper-features.mjs:156`, `play-uses.mjs:60, 432`): gaining 1 Ruin at 10 sets stored flag to 11. Undoing the use restores `10 + (10 - 11) = 9`, causing net Ruin loss.
2. **B-291**: Curtainfall (`reaper-features.mjs:284`) expends all Ruin inside `apply()` at confirm time, before the attack roll or hit is known; a miss loses all Ruin.
3. **B-292**: Reap (`reaper-features.mjs:228-253`) produces a text-only card with no weapon damage roll, no target DEX save buttons, and no d20 crit check roll.
4. **B-293**: Reaper crit ranges (`reaper-features.mjs:74-92`) are display-only; no attack roll hook modifies the crit threshold for Curtainfall or Reap; crits and kills do not automatically add Ruin.
5. **B-294**: Fear the Reaper (`reaper-features.mjs:317-325`) stores a plain text string with no UUID, no 1-hour expiry, no rest clear, and no 1d6 Psychic roll triggered when gaining Ruin.
6. **B-295**: Ruin reset at 0 HP (`reaper-features.mjs:404-413`) runs on all clients via `updateActor` with no owner check, no `guardUses` receipt, and no chat notification.
7. **B-296**: Reaper healing penalty hook (`reaper-features.mjs:374-387`) hits self-healing and GM edits due to mismatched option shapes, and `updates["system.attributes.hp.value"]` is not clamped to `hp.max`.
8. **B-297**: Reaper plans in `reaper-features.mjs` accept invalid inputs: fractional amounts throw TypeError in `reaperGainRuin`; sphere area bypasses level 13 check; missing weapons are not warned; `reaperDecayRuin` at 0 records a false shortfall.
9. **B-298**: Text divergences: Lingering Violence is titled "Press the Attack" despite source L3342 "Push the Attack"; DECISIONS L1905-1918 lists mechanics not found in source; table effect strings drop source qualifiers; cumulative effects are not displayed.
10. **B-299**: `reaper.test.mjs` tests miss all registered hooks, test synthetic options only, assert Ruin 0 at confirm, and skip cap/undo and miss scenarios.

---

## 2. Logic Chain

### 2.1 Pattern Analysis Across Subclasses
From the 40 observations, five systemic failure patterns emerge:
1. **Disconnection Between Sheet Controls and Plan Expectations**:
   - Crusher sheet buttons (B-231) send `{confirmed: true}` without required data fields, causing plans to operate on default zeros or fail.
   - Instructor dialogs (B-252) never collect targets, breaking range and ally validation.
   - Retaliator (B-287) and Curtainfall (B-291) lack interaction states for mode selection and hit confirmation.
2. **Incomplete Table-Play Loop (Roll -> Apply -> Receipt -> Undo)**:
   - WORKFLOW §3.2 requires owner-clicked rolls, automatic relay of unowned target changes, and complete reversibility.
   - Soloblade (B-280) and Blood Price (B-281) roll dice but never apply HP changes or record target entries.
   - Reap (B-292) and Keep Fighting (B-253) leave cards as passive text without roll or save buttons.
   - Hit Die expenditure in Renewing Strike (B-232) is skipped entirely.
3. **D&D5e Hook Integration & Option Shape Mismatches**:
   - D&D5e 5.3.3 passes complex objects (`ChatMessage`, `isDelta`) to `preApplyDamage`; checking `options.source === actor.id` or `options.origin === actor.uuid` never matches (B-283, B-296).
   - Combat Tracker initiative rolls bypass `dnd5e.rollInitiative` (B-250).
   - `updateActor` hooks run on every client and must be owner-gated (B-288, B-295).
4. **Pool Clamping and Mathematical Inversion on Undo**:
   - Negative amounts in `spendResource` without upper-bound clamping allow pools to store > max (B-290). The undo formula `before - after` inverts, permanently deleting resources.
5. **Rules Fidelity & DECISIONS Alignment**:
   - Ambiguities in source text (B-238, B-258, B-284) were either unlogged or logged with invented mechanics (B-298) without per-use player choices.

---

## 3. Caveats
1. **Read-Only Scope**: This investigation was strictly read-only. No source files, test files, or bug reports were modified.
2. **Environment & Live Foundry**: Observations are grounded in static codebase analysis, installed D&D5e 5.3.3 source review, and audit probe results. Final validation requires running in a headless Foundry V13 instance via `launchTestBrowser()`.
3. **External Reviews**: While this analysis synthesizes audits conducted by Claude Sonnet 5.5 and verified against Chapter 3 source text, implementation by Gemini must be reviewed by Codex or Claude per GEMINI.md.

---

## 4. Conclusion & Concrete Remediation Plan

Below is the concrete remediation plan for each of the 40 defect reports.

### 4.1 Crusher Remediation (B-230 – B-239)
- **B-230**:
  - *Files*: `ak5e/scripts/crusher-features.mjs:81-93`, `ak5e/scripts/crusher-features.mjs:295-309`.
  - *Remediation*: Rewrite `isHeavyMeleeWeapon(item)` to check `flags.ak5e.tableData?.category === "heavyMelee"` or `item.name` matching Greataxe, Greatsword, Heavy Hammer, Polearm, confirming `type.value` is melee or item is melee weapon. In `crusherPreRollDamage`, extract base die from `item.system.damage.base.formula` or `roll.parts[0]`.
  - *Test*: Test with module Greatsword item and Polearm item; verify Heavy Crossbow returns false; verify extra die matches weapon base die (d6 for Greatsword, d10 for Polearm).
- **B-231**:
  - *Files*: `ak5e/scripts/guard-sheet.mjs:1133`, `ak5e/scripts/guard-sheet.mjs:415-449`.
  - *Remediation*: Add dialog handlers in `executeGuardDialog` for `deathPassing` (input missed damage), `hordeBreaker` (input excess damage), `heroicBlow` (read weapon Crush value), and `heroicKillingBlow` (input or read target HP from target token).
  - *Test*: Test sheet execution passes collected inputs into command plans; verify non-zero Thunder damage and correct Crush calculation.
- **B-232**:
  - *Files*: `ak5e/scripts/crusher-features.mjs:147-176`.
  - *Remediation*: In `foecrusher` plan when `rider === "renewing"`, check actor Hit Dice (`actor.system.attributes.hd.value`). Warn if 0 remain ("Use anyway" clamps at 0). In `apply`, spend 1 Hit Die, record in receipt for undo, and roll class hit die (d10 for Guard) + CON.
  - *Test*: Verify Hit Die spent from 4 to 3; verify warning at 0 Hit Dice; verify undo restores Hit Die to 4.
- **B-233**:
  - *Files*: `ak5e/scripts/crusher-features.mjs`, `ak5e/DECISIONS.md`.
  - *Remediation*: Register hook for `dnd5e.preRollHitDie` to roll 2 dice and take highest (`2d10kh1`) for Crushers, or update Renewing Strike formula to `2d10kh1 + CON` and document rest hit die manual procedure in `DECISIONS.md`.
  - *Test*: Test Hit Die roll formula outputs 2 dice discard lowest.
- **B-234**:
  - *Files*: `ak5e/scripts/crusher-features.mjs:101-115`, `ak5e/scripts/guard-sheet.mjs`.
  - *Remediation*: Wire `singularStrikeBonus` to a sheet action button and chat card helper allowing the player to select number of forgone attacks and post the bonus damage roll to chat, warning about the 1-attack limit.
  - *Test*: Test plan with 1, 2, 3 forgone attacks produces bonus formula matching source example L2655–2661.
- **B-235**:
  - *Files*: `ak5e/scripts/crusher-features.mjs:189-207`.
  - *Remediation*: In `overbear`, validate `primaryRider` and `secondaryRider` against `validRiders`. Warn if no Foecrusher receipt exists for this attack. If either rider is `renewing`, generate healing target and spend Hit Die.
  - *Test*: Test rejection of invalid rider names; test warning when Foecrusher not used; test Renewing rider generates heal.
- **B-236**:
  - *Files*: `ak5e/scripts/crusher-features.mjs:271-288`, `ak5e/DECISIONS.md`.
  - *Remediation*: In `heroicKillingBlow`, prompt for target token; if target HP < 50, relay 0 HP / death status via GM relay with undo receipt; add Reach note to Heavy Melee Weapons at 10th level; document manual procedures in `DECISIONS.md`.
  - *Test*: Test target HP < 50 applies execution; target HP >= 50 reports survival.
- **B-237**:
  - *Files*: `ak5e/scripts/crusher-features.mjs:48-54`.
  - *Remediation*: In `isCrusher`, check `const branch = guardBranch(actor); if (branch) return branch === "crusher";` before checking item list.
  - *Test*: Test Centurion actor holding stray Crusher item returns `isCrusher === false`.
- **B-238**:
  - *Files*: `ak5e/DECISIONS.md`, `ak5e/scripts/crusher-features.mjs`.
  - *Remediation*: Add formal rulings in `DECISIONS.md` for Heroic Blow riders, Singular Strike forgone attack scope, and Horde Breaker excess damage; offer per-use choice dialogs where GM ruling is absent.
  - *Test*: Verify confirm dialog presents readings and logs choice on card.
- **B-239**:
  - *Files*: `ak5e/scripts/crusher-features.mjs:133-288`.
  - *Remediation*: Add warnings using `warn()`: unwielded heavy melee weapon (Death's Passing, Horde Breaker), not on own turn (Heroic Blow), Overbear without Foecrusher, and Killing Blow without Heroic Blow.
  - *Test*: Test warnings trigger when conditions fail and can be overridden with "Use anyway".

### 4.2 Instructor Remediation (B-250 – B-259)
- **B-250**:
  - *Files*: `ak5e/scripts/instructor-features.mjs:308-316`.
  - *Remediation*: Hook `updateCombatant` or use `resource-pools.mjs` initiative recovery trigger so that rolling initiative from Combat Tracker, sheet, or Roll All/NPCs triggers `renownedInstructorInitiative`.
  - *Test*: Test rolling initiative via Combatant update restores dice to ceil(max/2).
- **B-251**:
  - *Files*: `ak5e/scripts/instructor-features.mjs:172-183`.
  - *Remediation*: In `renownedInstructorInitiative`, wrap pool write in a `guardUses` receipt under `flags.ak5e`, post a chat card notifying the table, and support undo.
  - *Test*: Test receipt is created, chat card is posted, and undo restores prior dice count.
- **B-252**:
  - *Files*: `ak5e/scripts/guard-sheet.mjs:450-485`, `ak5e/scripts/instructor-features.mjs:219`.
  - *Remediation*: Update Issue Instruction dialog to prompt for target ally (and Kingmaker second ally); store in `receipt.targets`; warn if target > 30 ft away or not an ally.
  - *Test*: Test receipt records selected ally UUID and name; card displays ally name.
- **B-253**:
  - *Files*: `ak5e/scripts/instructor-features.mjs:221-251`.
  - *Remediation*: In `instruction` plan when `key === "keepFighting"`, populate `receipt.targets` with `{ uuid: target.uuid, name: target.name, kind: "tempHP", ready: false }`, define `validateTarget`, and relay to GM client on roll button click.
  - *Test*: Test rolling Keep Fighting applies Temp HP to ally and undo restores prior Temp HP.
- **B-254**:
  - *Files*: `ak5e/scripts/guard-sheet.mjs:1133`, `ak5e/scripts/instructor-features.mjs:281-303`.
  - *Remediation*: Add dialog for Once More Unto The Breach prompting for allies within 60 ft and assigning Instructions; render roll buttons for each helped ally on the chat card; validate targets in plan.
  - *Test*: Test Breach validates targets, spends 1 breach use, and generates instruction roll buttons for allies.
- **B-255**:
  - *Files*: `ak5e/scripts/instructor-features.mjs:187-280`.
  - *Remediation*: Track per-turn Kingmaker use and last issued instruction in `flags.ak5e.instructor`; track Cooperative Combat use per round; warn if Kingmaker used twice in a turn or with different instruction, or if Cooperative Combat used twice before next turn.
  - *Test*: Test second Kingmaker in same turn raises warning; test second Cooperative Combat raises warning.
- **B-256**:
  - *Files*: `ak5e/scripts/instructor-features.mjs:57-64, 187-217`.
  - *Remediation*: Require `data.instruction` to be a valid key in `INSTRUCTIONS` (remove silent `defendYourself` fallback); restrict `free` flag to internal Kingmaker/Breach callers; fix `isInstructor` to check `guardBranch(actor)` first.
  - *Test*: Test invalid instruction throws; test stray item on Crusher returns `isInstructor === false`.
- **B-257**:
  - *Files*: `ak5e/scripts/guard-sheet.mjs:55-75`.
  - *Remediation*: Add header badges for "Instruction Dice: N / Max (dX)" and "Breach: N / 1"; show cost and remaining dice in confirm dialog.
  - *Test*: Verify badge HTML contains instruction dice count and die face.
- **B-258**:
  - *Files*: `ak5e/DECISIONS.md`, `ak5e/scripts/instructor-features.mjs`.
  - *Remediation*: Log ruling on Cooperative Combat roll sharing in `DECISIONS.md`; offer per-use choice (shared roll vs separate roll) in confirm dialog.
  - *Test*: Verify confirm dialog presents shared vs separate roll option.
- **B-259**:
  - *Files*: `ak5e/scripts/instructor-features.mjs:127-150`, `ak5e/DECISIONS.md`.
  - *Remediation*: Update `INSTRUCTIONS.hangInThere.summary` to include "before the end of their next Turn" and `INSTRUCTIONS.snapOutOfIt.summary` to include "at the beginning or end of their Turn"; document Squad Leader as manual feature description in `DECISIONS.md`.
  - *Test*: Verify summary strings contain verbatim source condition text.

### 4.3 Musha Remediation (B-280 – B-289)
- **B-280**:
  - *Files*: `ak5e/scripts/musha-features.mjs:101-120`.
  - *Remediation*: In `mushaSoloblade`, add self heal target to `receipt.targets` (`kind: "heal"`), define `validateTarget`, and on roll button click, apply healed HP to actor (clamped to max HP) with undo support.
  - *Test*: Test rolling Soloblade restores actor HP and undo restores prior HP.
- **B-281**:
  - *Files*: `ak5e/scripts/musha-features.mjs:186-222`.
  - *Remediation*: In `mushaBloodPrice`, configure self damage using `HP_LOSS_PRESETS.BLOOD_PRICE` from `damage-pipeline.mjs`; on roll click, deduct actual rolled HP from `actor.system.attributes.hp.value` (bypassing DR/resistance and Temp HP); store actual rolled damage; support undo.
  - *Test*: Test actor HP decreases by rolled 2d8/4d8; Temp HP remains untouched; undo restores HP.
- **B-282**:
  - *Files*: `ak5e/scripts/musha-features.mjs:203-222`, `ak5e/scripts/guard-sheet.mjs:931-932`.
  - *Remediation*: Implement option actions: Dig Deep grants SP equal to rolled HP lost; Iai and Ichimonji display bonus damage cards for owner to apply to attack; Center Oneself offers condition removal dialog; fix dialog text in `guard-sheet.mjs`.
  - *Test*: Test Dig Deep grants SP; test Center Oneself clears chosen condition.
- **B-283**:
  - *Files*: `ak5e/scripts/musha-features.mjs:290-326`.
  - *Remediation*: In `mushaPreApplyDamageHook`, inspect `options.originatingMessage?.speaker?.actor` and `options.origin` to detect self-healing; allow self-healing to restore real HP and convert only outside healing to Temp HP.
  - *Test*: Test self-healing with real dnd5e option structure heals HP; outside healing converts to Temp HP.
- **B-284**:
  - *Files*: `ak5e/DECISIONS.md`, `ak5e/scripts/musha-features.mjs`.
  - *Remediation*: Log rulings on Stand Alone recoverable amount vs rolled amount and Temp HP stacking in `DECISIONS.md`; provide per-use choice if unruled.
  - *Test*: Verify chosen reading is applied and noted on chat card.
- **B-285**:
  - *Files*: `ak5e/scripts/musha-features.mjs:127-155`.
  - *Remediation*: In `mushaNotYet`, post a chat card with an interactive Wisdom saving throw button against the recorded DC; provide a button to set survival HP to 2*PB on success.
  - *Test*: Test card renders save button; test successful save applies 2*PB survival HP.
- **B-286**:
  - *Files*: `ak5e/scripts/musha-features.mjs:160-175`.
  - *Remediation*: In `mushaResetNotYet`, add warning if actor has not completed a Long Rest (or is level 17 at max HP), offering "Use anyway".
  - *Test*: Test warning triggers without rest and override is broadcast publicly.
- **B-287**:
  - *Files*: `ak5e/scripts/musha-features.mjs:258-282`, `ak5e/scripts/guard-sheet.mjs:284`.
  - *Remediation*: In `mushaRetaliator`, check for un-undone Go Forth receipt in encounter window; warn if absent; validate `mode` strictly (`"meleeAttack"` or `"iai"`); link Iai to Blood Price HP spend.
  - *Test*: Test warning triggers without Go Forth; test invalid mode throws error; test Iai mode spends HP.
- **B-288**:
  - *Files*: `ak5e/scripts/musha-features.mjs:328-356`.
  - *Remediation*: Gate `updateActor` hook to run only if `actor.isOwner` or on active GM client; add `_registered` boolean guard to `registerMushaHooks`.
  - *Test*: Test non-owner client does not trigger update; test multiple registrations do not duplicate hook.
- **B-289**:
  - *Files*: `ak5e/scripts/musha-features.mjs:58-70`, `ak5e/scripts/guard-sheet.mjs:59`.
  - *Remediation*: Apply dynamic Active Effect for AC and saving throw bonus based on HP threshold, or update sheet badge text to explicitly state manual condition per WORKFLOW §4.4.6.
  - *Test*: Test badge displays correct bonus for HP <= 50% and <= 10%.

### 4.4 Reaper Remediation (B-290 – B-299)
- **B-290**:
  - *Files*: `ak5e/scripts/reaper-features.mjs:156-164`, `ak5e/scripts/play-uses.mjs:60`.
  - *Remediation*: In `reaperGainRuin`, clamp `after` value to 10 (`const newRuin = Math.min(10, current + amount)`) before passing to receipt; update receipt delta so undo restores exact prior Ruin without loss.
  - *Test*: Test gaining Ruin at 10 and undoing restores exactly 10.
- **B-291**:
  - *Files*: `ak5e/scripts/reaper-features.mjs:277-293`.
  - *Remediation*: Defer Ruin expenditure in Curtainfall until the player rolls damage on a hit; a miss or cancelled roll expends 0 Ruin.
  - *Test*: Test confirming Curtainfall primes roll; test damage roll expends Ruin; test miss leaves Ruin intact.
- **B-292**:
  - *Files*: `ak5e/scripts/reaper-features.mjs:228-253`.
  - *Remediation*: In `reaperReap`, configure interactive chat card buttons: weapon damage roll, d20 crit check roll (level 4+), and target DEX save buttons against Martial DC.
  - *Test*: Test card renders damage, crit check, and save buttons.
- **B-293**:
  - *Files*: `ak5e/scripts/reaper-features.mjs:74-92, 400-422`.
  - *Remediation*: Register `dnd5e.preRollAttackV2` hook to adjust critical hit threshold for Reap and Curtainfall based on current Ruin; carry crit riders (Vulnerability, DR bypass) to chat card.
  - *Test*: Test attack roll with Curtainfall crits at adjusted threshold (e.g. 14+ at Ruin 6).
- **B-294**:
  - *Files*: `ak5e/scripts/reaper-features.mjs:317-326, 137-165`.
  - *Remediation*: In `reaperFearTheReaper`, store target UUID and 1-hour expiration timestamp; clear on Long Rest; in `reaperGainRuin`, prompt for 1d6 Psychic roll against marked target (with Frightened immunity warning and GM relay).
  - *Test*: Test mark expires after 1 hour or Long Rest; test Ruin gain triggers 1d6 Psychic roll prompt.
- **B-295**:
  - *Files*: `ak5e/scripts/reaper-features.mjs:404-413`.
  - *Remediation*: In `updateActor` Ruin reset hook, check `actor.isOwner`; record `guardUses` receipt under `flags.ak5e`; post chat notification; allow undo from sheet.
  - *Test*: Test reset creates undo receipt; test non-owner client does not write.
- **B-296**:
  - *Files*: `ak5e/scripts/reaper-features.mjs:365-398`.
  - *Remediation*: In `reaperPreApplyDamageHook`, check `options.originatingMessage?.speaker?.actor` to exempt self-healing; exempt GM edits (`options.ignore`); clamp new HP to `actor.system.attributes.hp.max`.
  - *Test*: Test self-healing is not penalized; test outside healing is penalized and clamped to max HP.
- **B-297**:
  - *Files*: `ak5e/scripts/reaper-features.mjs:137-356`.
  - *Remediation*: Add input validation in `reaperGainRuin` (positive integer check), gate sphere area behind level 13, warn if no melee weapon wielded, warn if no active mark for Memento Mori, and suppress shortfall on zero decay.
  - *Test*: Test invalid amount throws validation error; test missing weapon raises warning.
- **B-298**:
  - *Files*: `ak5e/scripts/reaper-features.mjs:22-34, 209`, `ak5e/DECISIONS.md`.
  - *Remediation*: Restore original "Push the Attack: Lingering Violence" naming (or log definitive ruling in `DECISIONS.md`); remove invented mechanics from `DECISIONS.md`; align `REAPER_TABLE` effect text verbatim with source L3350–3372; display cumulative effects on sheet.
  - *Test*: Verify effect strings match source text verbatim.
- **B-299**:
  - *Files*: `ak5e/test/reaper.test.mjs`.
  - *Remediation*: Author comprehensive test cases covering hooks with real arguments, Ruin gain at cap + undo, Curtainfall hit vs miss flow, Fear the Reaper expiry and psychic damage, and input validation.
  - *Test*: All expanded tests pass cleanly.

---

## 5. Verification Method

### 5.1 Independent Test Commands
Any downstream implementer or reviewer can independently verify the defect reproduction and subsequent fixes using the following commands:

```bash
# 1. Run all Guard unit test suites (baseline currently 118 pass)
npm run test:guard

# 2. Run specific subclass test suites
node --test ak5e/test/crusher.test.mjs
node --test ak5e/test/instructor.test.mjs
node --test ak5e/test/musha.test.mjs
node --test ak5e/test/reaper.test.mjs

# 3. Static verification (files, manifests, json)
node ak5e/tools/validate-files.mjs

# 4. Source content verification
node ak5e/tools/verify-generated-content.mjs

# 5. Full test suite
npm test
```

### 5.2 Live Headless Foundry Verification
Per GEMINI.md §5 and WORKFLOW §5.3, live browser verification must be performed using `launchTestBrowser()` from `ak5e/tools/test-browser.mjs` against a clean `standard-test` world copy on port 30175:
```bash
# Live test harness execution
/tmp/run-guard-live.sh
```
Verify `report.errors: []` in `report.json`, and delegate visual inspection of all rendered screenshots (Crusher, Instructor, Musha, Reaper sheets, dialogs, chat cards, undo receipts) to a dedicated reviewer subagent per AGENTS.md §6.2.

### 5.3 Invalidation Conditions
This analysis and remediation plan would be invalidated if:
1. Source rules in `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` L2633–3433 are modified or superseded.
2. D&D5e system API or data structure changes alter `preApplyDamage`, `preRollDamageV2`, or `rollInitiative` signatures.
3. The table-play philosophy (WORKFLOW §3.2) is altered to permit GM approval gates or auto-rolling of damage/healing dice.
