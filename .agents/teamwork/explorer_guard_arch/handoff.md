# Architectural Investigation & Handoff Report: Guard Subclass Expansion (Duellist, Liberator, Lord)

**Author:** Codebase Explorer (Subagent `explorer_guard_arch`)  
**Target:** Guard Subclass Implementers & Orchestrator  
**Date:** 2026-10-12  
**Working Directory:** `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_guard_arch/`  

---

## 1. Observation

Direct investigation of the codebase and source rules revealed the following facts:

### 1.1 Architecture of `ak5e/scripts/guard-uses.mjs` and `ak5e/scripts/play-uses.mjs`
- **Engine Instantiation (`ak5e/scripts/guard-uses.mjs:11–19`):**
  ```javascript
  export const guardUses = createPlayUses({
    ns: "guardUses",
    label: "Guard",
    isMember: actor => guardEnabled(actor),
    ruling: (actor, key) => {
      const record = guardState(actor).rulings?.[key];
      return record?.source?.trim?.() && record.value !== undefined ? record.value : undefined;
    }
  });
  ```
- **Plan Registration Pattern (`ak5e/scripts/guard-uses.mjs:40–213`, `ak5e/scripts/centurion-features.mjs:67–250`):**
  - Subclasses register their plans directly with `guardUses.register({ plans: SUBCLASS_PLANS })`.
  - A plan is a pure generator function `planName(actor, state, data, operationId)` returning:
    ```javascript
    {
      warnings: [], // Array of { id, text }
      title: "Display Title",
      rolls: [],    // Optional pre-configured roll buttons
      formula: "",  // Optional formula to be rolled on card
      rollLabel: "",
      reading: "",  // Optional unresolved ruling key
      async apply(nextState, receipt, readingValue) {
        // Spends resources, sets flags, queues targets
        return updates; // Actor updates object
      },
      validateTarget(source, receipt, entry, target) // Optional for GM relay validation
    }
    ```
- **Receipts and Durable Persistence (`ak5e/scripts/play-uses.mjs:333–342`):**
  - Receipts are stored under `flags.ak5e.guardUses.undo`.
  - Each receipt includes `id` (stable operation ID), `command`, `title`, `userId`, `epoch: currentEpoch()`, `createdAt`, `status: "applying"|"complete"|"awaitingRoll"|"pending"|"undone"`, `data`, `overridden`, `targets: []`, `resources: []`, `flagChanges: []`.
  - Flag changes and resources are snapshotted (`prepareFlagChanges`) so that interrupted writes and encounter-window undos are 100% deterministic and recoverable.
- **Resource Spending and Clamping (`ak5e/scripts/play-uses.mjs:57–64`):**
  - `spendResource(actor, receipt, { pool, path, amount, label, max })` calls `getPool(actor, pool)` and updates `flags.ak5e.resourcePools.${pool}.value`.
  - Clamping rule: `after = Math.max(0, before - amount)`. Overspent resources never go negative.
  - Shortfall recording: If `amount > before`, appends `${label} short by ${amount - before}` to `receipt.shortfalls` and posts publicly on the chat card.
- **Unowned Target Relay (`ak5e/scripts/play-uses.mjs:189–230`):**
  - If a user targets an unowned Actor/Creature, `changeTarget()` detects `!canWrite(target)`.
  - If no GM is active, throws `NoGM("No GM is connected.")`, which sets receipt status to `"pending"` ("Not applied yet").
  - If GM is connected, invokes `relay.submit(source, command, { useId: receipt.id, targetUuid: entry.uuid, confirmation: true }, ...)`.
  - The elected GM receives the socket message in `Hooks.on("createChatMessage", (message, options, userId) => guardUses.handleRelay(...))` (`ak5e/scripts/ak5e.mjs:316`) and applies only the specific validated target change without prompting the GM.
- **Reversibility / Encounter Window Undo (`ak5e/scripts/play-uses.mjs:375–439`):**
  - `guardUses.command(actor, "undoUse", { useId })`:
    - Checks encounter window epoch: `!isLocked(receipt) || game.user.isGM`. Receipts from earlier combats are locked (combat start locks prior receipts; combat end locks combat receipts).
    - Reverts target changes (locally or via GM relay).
    - Refunds spent reactions (`refundReaction`).
    - Restores exact prior flag values (`restoreUpdate`).
    - Restores exact prior resource values:
      `updates[resource.path] = Math.max(0, Math.min(Math.max(pool?.max ?? resource.max ?? Infinity, resource.before), current + (resource.before - resource.after)));`
    - Creates public undo chat card stating who undid the use.

### 1.2 Architecture of `ak5e/scripts/guard-sheet.mjs`
- **Hook Registrations (`ak5e/scripts/guard-sheet.mjs:490–514`):**
  1. `getHeaderControlsApplicationV2`: Injects "Guard" header button on Actor sheets.
  2. `renderActorSheetV2`: Injects `.ak5e-guard-sheet-panel` into the `features` tab.
  3. `renderChatMessageHTML`: Binds roll, retry, and undo controls to chat cards (`renderPlayUseCard`).
- **Status & Pools Summary (`ak5e/scripts/guard-sheet.mjs:41–52`):**
  - Renders Martial DC, Centurion DC (if Centurion), and pool badges (`Aggression`, `Unrelenting`, SP if Artsblade, Bob & Weave AC if Brawler).
- **Subclass Action Groups (`ak5e/scripts/guard-sheet.mjs:85–196`):**
  - Renders dedicated button rows for each subclass based on predicate checks: `if (isCenturion(actor))`, `if (isCrusher(actor))`, `if (isInstructor(actor))`, `if (isArtsblade(actor))`, `if (isBrawler(actor))`.
  - Buttons have `data-guard-cmd="<command>"`.
- **Command Dispatch and User Prompts (`ak5e/scripts/guard-sheet.mjs:241–459`):**
  - `executeGuardDialog(actor, cmd)` prompts user choices using `foundry.applications.api.DialogV2.prompt(...)`.
  - Wraps execution in `confirmPlayUse(title, extra => guardUses.command(actor, cmd, { confirmed: true, ...extra }, operationId()))`.
  - If warnings are thrown (`PlayWarnings`), `confirmPlayUse` renders a dialog listing all warnings with a "Use anyway" button. If chosen, warnings are added to `extra.overrides` and re-submitted.

### 1.3 Subclass Identifiers in `ak5e/scripts/guard-rules.mjs`
- Lines 7–19 define `GUARD_BRANCH_IDS`:
  - `"subclass-guard-duellist": "duellist"`
  - `"subclass-guard-liberator": "liberator"`
  - `"subclass-guard-lord": "lord"`
  (All 3 are already declared in the ID map).
- Line 21 defines `IMPLEMENTED_GUARD_BRANCHES`:
  - `["artsblade", "brawler", "centurion", "crusher", "instructor"]`.
  - Duellist, Liberator, and Lord are NOT yet included in this array.

### 1.4 Existing Subclass Implementation Precedents
- `centurion-features.mjs`:
  - Defines pools `ferociousFling`, `guillotine`, `stormOfBlood`.
  - Registers plans: `cycloneStrike`, `brutalExecution`, `ferociousFling`, `guillotine`, `shredder`, `stormOfBlood`.
  - Registers hooks: `Hooks.on("dnd5e.preRollAttackV2", centurionPreRollAttack)` (Fearmonger).
- `brawler-features.mjs`:
  - Defines pool `mountainbreaker`.
  - Exports helper functions: `isBrawler`, `bobAndWeaveAC`, `artOfTheFistDie`.
  - Registers 16 distinct plans for Basic and Advanced Brawling Techniques.
  - Registers hooks for `dnd5e.preRollAttackV2` and `dnd5e.preRollDamageV2`.
- `instructor-features.mjs`:
  - Defines pool `instructionDice` and `onceMoreUntoTheBreach`.
  - Plans: `instruction`, `teachFromExperience`, `onceMoreUntoTheBreach`.
- `artsblade-features.mjs`:
  - Defines pools `spellswordPoints`, `cutThroughChaos`, `ultimateBladeArt`.
  - Plans: `bladeArt`, `castSpellswordArt`, `augmentedAssault`, `cutThroughChaos`, `ultimateBladeArt`.

### 1.5 Source Rules Authority for the Three Subclasses
- **Duellist (Ch. 3 L2739–2845):**
  - Duelling Blades: Greatswords and Polearms gain Finesse.
  - Rules of Engagement: Opponent declaration (Bonus Action; free at 17th). Duel Points (0–10 max). +1 (+2 at 10th) on declaration (+1 extra if not wielding Heavy Melee Weapon, lost if equipped later). +1 (+2 at 10th) at turn start if damaged opponent since last turn (+1 extra if opponent did not damage you).
  - Parry & Riposte: Parry (1st Forestall/round costs 0 Reaction, -1 Aggression). Riposte (1 Aggression, Reaction on melee miss -> AoO).
  - Principles of Defence (4th Level): Every Victory (+1 Aggression on opponent 0 HP/surrender). Lightning Reflexes (1 Aggression, Reaction -> DEX save). Punish Every Opening (Riposte without reaction on successful save).
  - 9 Engagements: Analysis (0 pts), Balestra (2 pts), Derobement (1 pt), Displacement (1 pt), En Garde (1 pt), Feint (1 pt), Fleche (2 pts), Redoublement (1 pt), Score (1 pt).
  - Grand Challenge (13th Level, 1/LR): Corps à Corps (AoO when opponent damages others), Displacement (Resistance to non-opponent damage), Coup de Grâce (hit at 10 points -> 8d8 Slashing or Piercing, unreduced by Resistance or DR).
  - Master Duellist (17th Level): Retain points on death/surrender or new opponent without Grand Challenge. Bonus Action removed for declaration.
- **Liberator (Ch. 3 L2937–3039):**
  - Liberty Pool: 0–6 max. Generated in combat (+1 at turn end if no Operator Skill activated/active, no Art cast, no Attack roll made; +1 on Guide the Masses as Action; +1 extra at 17th Time to Act).
  - Guide the Masses: Action (or Bonus Action at 7th if Action used on another ally; free 1/turn at 17th). Ally within 20 ft (40 ft at 10th). Choices: Advocate (extra healing `max(2*PB, 2*Liberty)`), Empower (DR `max(PB, Liberty)`), Uplift (extra damage `max(PB, Liberty)`).
  - Righteous Outburst:
    - Flash of Anger: 1 to current Liberty expended on melee hit -> +1d6 damage per Liberty (+1d10 at 10th). No crit multiplication. 1 Liberty refunded on kill. At 13th, becomes Force (or Skill type) and splashes to second creature within 10 ft (Caught in the Crossfire).
    - The Right Moment: Consumes all Liberty on Operator Skill activation. Saving throw damage +1d6 (+1d10 at 10th) per Liberty consumed; melee weapon attacks +1d6 (+1d10 at 10th) per 2 Liberty consumed.
  - Rising Tide (4th Level): Operator Skills considered Automatic, Offensive, and Defensive charging.
  - Praxis (10th Level): Far Reaching Guidance (40 ft), Improved Liberty (d10), Press the Attack: Face Me (2 Aggression, Bonus Action Compelled Duel with Martial DC).
  - Révolution (17th Level, 1/LR): Action, 20-ft burst DEX save vs Martial DC for 1d12 Force per Liberty expended. 10-minute benefits: Champion of the Worthy (free Guide the Masses 1/turn), Shield of Belief (turn-start THP = Guard level), Time to Act (+1 Liberty on gain/refund).
- **Lord (Ch. 3 L3109–3248):**
  - Position of Power & Authority State: `flags.ak5e.lord.hasAuthority`.
    - Gains on: Elite/Leader kill damaged since last turn; 2+ kills in a turn; 1-shot full HP kill.
    - Loses on: 0 HP; turn ends while afflicted by save-to-end effect; Prone at end of turn; Initiative roll.
    - Press the Attack: Manifest Destiny (3 Aggression, prevent loss of Authority).
    - Authority benefits: 1d8 THP at turn start; unlocks enhanced riders on Manifestation, King's Domain, Make It So, and Divine Right.
    - Overruled: INT/WIS/CHA saves at both start and end of turn.
  - Manifest Will: `manifestation` pool (`@prof` uses, Long Rest recovery). 1 minute duration (no Action). Melee weapons gain Range 30/-, STR for ranged attack & damage, +CHA mod Force damage.
    - Will Attunement (10-minute ritual): changes damage type to an Operator Skill damage type.
    - Authority bonus: Marks targets hit with Ranged or Melee Mark until end of next turn; opposite attack expends mark for +1d6 damage (splashes 10 ft at 17th Divine Right).
  - King's Domain (4th Level): Chosen when Manifesting:
    - Castle Doctrine: 15-ft sphere. Hostile enters while in it -> Reaction move half speed and melee attack. If non-elite/leader hits -> reaction refunded! Authority reduces speed by half (or WIS save vs Martial DC for speed 0 at 17th).
    - Pursuit of Power: 1/turn on hit, move speed without AoO, 2x jump. Authority removes 1/turn limit. At 17th, moving within 5 ft deals passive CHA mod damage.
  - By Lordly Decree (10th Level):
    - Make It So: Spend 1 Manifestation use -> add CHA mod to d20 roll and considered Proficient. Authority: treated as having Expertise! At 17th: reroll once on failure.
    - Press the Attack: A Leader Leads (1+ Aggression on gaining Authority -> grant 1-minute Special Inspiration to allies).
  - Force of Will (13th Level, `@prof`/Long Rest uses, 1/turn):
    - Fire/Psychic/Force/Thunder: 10-ft burst 3d6 DEX save vs Martial DC (half on save).
    - Bludgeoning/Piercing/Slashing/Radiant: 50-ft line 5-ft wide, 8d6 DEX save vs Martial DC (half on save).
    - Acid/Cold/Lightning/Necrotic/Poison: melee hit, 6d6 CON save vs Martial DC (half on save).
  - Divine Right (17th Level): Upgrades all Authority features.

---

## 2. Logic Chain

1. **Premise 1:** The repository architecture strictly isolates subclass functionality into modular feature files (`centurion-features.mjs`, `crusher-features.mjs`, etc.) while sharing `guardUses` for execution, receipts, clamping, warnings, and encounter-window undos.
2. **Premise 2:** In accordance with WORKFLOW.md §3.2:
   - Play actions must not require GM approval.
   - Targeting unowned creatures must rely on the existing automatic GM relay (`operation-kernel.mjs`), never approval.
   - Resource shortages or invalid conditions must warn with "Use anyway", clamp at 0, and record shortfalls publicly on chat cards.
   - Dice rolls must never be auto-rolled; they must produce roll buttons on chat cards.
   - All state modifications must be recorded in `flags.ak5e.guardUses.undo` for encounter-window reversibility.
3. **Inference for Duellist (`ak5e/scripts/duellist-features.mjs`):**
   - Duel Points must be implemented as a resource pool `duellistPoints` (`definePool`) with max 10 and initial 0. This enables automatic clamping at 0, shortfall reporting, and `spendResource` undo integration.
   - The Opponent state must be maintained in `flags.ak5e.guard.duellist.opponent = { uuid, name, grandChallenge }`.
   - Finesse for Greatswords and Polearms must be implemented via `dnd5e.preRollAttackV2` and `dnd5e.preRollDamageV2` hooks, checking weapon type and `isDuellist(actor)`.
   - Parry: In `duellist-features.mjs`, provide an export or hook to adjust `CORE_PLANS.forestall` so that the first Forestall each round for a Duellist requires 0 Reaction and costs 1 less Aggression (min 0).
   - All 9 Engagements plus Riposte, Lightning Reflexes, Grand Challenge, and Coup de Grâce register as distinct plans in `guardUses`.
4. **Inference for Liberator (`ak5e/scripts/liberator-features.mjs`):**
   - Liberty must be implemented as a resource pool `liberty` (`definePool`) with max 6 and initial 0.
   - Guide the Masses must use `receipt.targets` with `kind: "effect"` containing the selected bonus (`advocate`, `empower`, `uplift`) for GM relay, and grant +1 Liberty (+2 at 17th) to the Liberator.
   - Flash of Anger expends variable Liberty (`data.liberty`), sets `receipt.formula = "${liberty}d6"` (or `d10` at level 10+), and triggers roll button on chat card. At level 13, Caught in the Crossfire attaches a secondary target change or splash note.
   - The Right Moment records consumed Liberty in `flags.ak5e.guard.liberator.rightMoment` and hooks attack/save damage.
   - Face Me casts Compelled Duel using Martial DC.
   - Révolution (17th) expends pool `revolution` (max 1), expends all Liberty, sets save formula `1d12 * liberty`, and flags 10-minute benefits.
5. **Inference for Lord (`ak5e/scripts/lord-features.mjs`):**
   - Authority must be stored in `flags.ak5e.guard.lord.hasAuthority: boolean`.
   - Manifestation pool must be defined with max `@prof`, initial "max", Long Rest recovery (`definePool({ id: "manifestation", max: "@prof", ... })`).
   - Manifest Will activates a 1-minute state in `flags.ak5e.guard.lord.manifestation`. Weapon range (30/-), STR scaling for ranged, and +CHA mod Force damage hook into `dnd5e.preRollAttackV2` and `dnd5e.preRollDamageV2`.
   - King's Domain modes (Castle Doctrine and Pursuit of Power) attach to the Manifestation state.
   - Force of Will pool must be defined with max `@prof`, initial "max", Long Rest recovery. The plan inspects the attuned damage type and generates the appropriate save DC and damage formula (3d6 burst, 8d6 line, or 6d6 melee).
   - Make It So and A Leader Leads register as plans spending Manifestation uses and Aggression respectively.
6. **Inference for Integration (`guard-rules.mjs`, `guard-sheet.mjs`, `ak5e.mjs`):**
   - `guard-rules.mjs`: Append `"duellist"`, `"liberator"`, `"lord"` to `IMPLEMENTED_GUARD_BRANCHES`.
   - `guard-sheet.mjs`:
     - Import predicates `isDuellist`, `isLiberator`, `isLord`.
     - Update `openGuardControls(actor)` summary pills to show Duel Points, Liberty, Authority, and Manifestation.
     - Add action group sections for Duellist, Liberator, and Lord buttons.
     - Update `executeGuardDialog(actor, cmd)` to render selection dialogs for Engagements, Guide the Masses, Flash of Anger, King's Domain, Make It So, and Force of Will.
   - `ak5e.mjs`: Register hooks in `ready` lifecycle and export predicates on `game.ak5e.guard`.

---

## 3. Caveats

1. **Subclass Level Progression & Compendium Setup:** Subclass class-features from Chapter 3 already exist in `CHAPTER_THREE_CLASSES` and `ak5e.classes` compendium pack. `guard-setup.mjs` handles granting core Guard class features, while subclass feature items (such as `subclass-guard-duellist`) are embedded documents on the character.
2. **Combat Tracking vs Manual Play:** While combat generation (e.g. Liberty at turn end, Duel points at turn start) can be assisted by combat hooks (`onAk5eEvent("turnStart")`, `onAk5eEvent("turnEnd")`), players must always have manual action/button access to adjust points or declare triggers per WORKFLOW.md §3.2 (no turn-order gating).
3. **No Code Edits Performed:** In strict accordance with explorer instructions, no production files were modified. All architectural proposals below are documented for the implementer agent.

---

## 4. Conclusion & Actionable Implementation Blueprint

The Guard subclass expansion should be implemented across three dedicated feature files and updated central files according to the following exact blueprints:

### 4.1 New Feature File 1: `ak5e/scripts/duellist-features.mjs`
- **Exports:**
  - `isDuellist(actor)`: `guardEnabled(actor) && guardBranch(actor) === "duellist"`
  - `defineDuellistPools()`:
    - `duellistPoints`: max 10, initial 0, applies to `isDuellist`
    - `grandChallenge`: max 1, initial 1, recovery Long Rest, applies to level >= 13
  - `registerDuellistHooks()`:
    - Defines pools.
    - Hooks `dnd5e.preRollAttackV2` and `dnd5e.preRollDamageV2` for Duelling Blades (Greatswords and Polearms gain Finesse).
  - `DUELLIST_PLANS` registered via `guardUses.register({ plans: DUELLIST_PLANS })`:
    - `declareOpponent`: Sets `opponent` flag. Spends 0 resources, awards 1 Duel Point (or 2 if level >= 10, plus 1 if not Heavy Melee).
    - `riposte`: 1 Aggression, Reaction on melee miss -> AoO summary.
    - `lightningReflexes`: 1 Aggression, Reaction on save -> DEX save summary.
    - `punishOpening`: Free Riposte without reaction on successful save.
    - Engagements (9 plans):
      - `engagementAnalysis` (0 pts)
      - `engagementBalestra` (2 pts)
      - `engagementDerobement` (1 pt)
      - `engagementDisplacement` (1 pt)
      - `engagementEnGarde` (1 pt, refunds reaction)
      - `engagementFeint` (1 pt)
      - `engagementFleche` (2 pts, deals +Guard level damage)
      - `engagementRedoublement` (1 pt, reaction reroll on miss)
      - `engagementScore` (1 pt, inflicts Bleeding)
    - `grandChallenge`: Spends 1 use of `grandChallenge` pool, activates 1-minute challenge state.
    - `coupDeGrace`: 8d8 Slashing or Piercing damage formula, unreduced by Resistance or DR; ends Grand Challenge.

### 4.2 New Feature File 2: `ak5e/scripts/liberator-features.mjs`
- **Exports:**
  - `isLiberator(actor)`: `guardEnabled(actor) && guardBranch(actor) === "liberator"`
  - `defineLiberatorPools()`:
    - `liberty`: max 6, initial 0, applies to `isLiberator`
    - `revolution`: max 1, initial 1, recovery Long Rest, applies to level >= 17
  - `registerLiberatorHooks()`:
    - Defines pools.
    - Hooks `dnd5e.preRollDamageV2` for The Right Moment active bonus.
  - `LIBERATOR_PLANS` registered via `guardUses.register({ plans: LIBERATOR_PLANS })`:
    - `guideTheMasses`:
      - Options: `mode` ("advocate", "empower", "uplift"), `targetUuid`.
      - Computes bonus: `Advocate = max(2*PB, 2*Liberty)`, `Empower = max(PB, Liberty)`, `Uplift = max(PB, Liberty)`.
      - Queues target change for GM relay under `receipt.targets`.
      - Awards +1 Liberty (+2 at 17th) to Liberator.
    - `flashOfAnger`:
      - Spends `data.liberty` (1 to current).
      - Dice: `${data.liberty}d6` (or `d10` if level >= 10).
      - Sets `receipt.formula` for manual card roll (no auto-rolling).
      - At level 13+, flags Force damage (or attuned skill type) and records secondary splash target within 10 ft.
    - `theRightMoment`: Consumes all current Liberty, activates Skill bonus state for duration.
    - `faceMe`: 2 Aggression, Bonus Action Compelled Duel using Martial DC.
    - `revolution`: Spends 1 `revolution` use, expends all Liberty, sets burst DEX save vs Martial DC, formula `${liberty}d12` Force damage, flags 10-minute benefits (Champion of the Worthy, Shield of Belief, Time to Act).

### 4.3 New Feature File 3: `ak5e/scripts/lord-features.mjs`
- **Exports:**
  - `isLord(actor)`: `guardEnabled(actor) && guardBranch(actor) === "lord"`
  - `defineLordPools()`:
    - `manifestation`: max `@prof` (fixed formula), initial "max", recovery Long Rest, applies to `isLord`
    - `forceOfWill`: max `@prof`, initial "max", recovery Long Rest, applies to level >= 13
  - `registerLordHooks()`:
    - Defines pools.
    - Hooks `dnd5e.preRollAttackV2`: If Manifestation active, melee weapons gain Range 30/-, STR used for ranged attacks.
    - Hooks `dnd5e.preRollDamageV2`: Weapon attacks add +CHA mod Force (or attuned) damage; adds mark bonus if opposite mark consumed.
  - `LORD_PLANS` registered via `guardUses.register({ plans: LORD_PLANS })`:
    - `toggleAuthority`: Sets `flags.ak5e.lord.hasAuthority` (gain/loss).
    - `manifestDestiny`: 3 Aggression to prevent Authority loss.
    - `manifestWill`: Spends 1 `manifestation` use, activates 1-minute state with chosen King's Domain mode ("castle" or "pursuit").
    - `willAttunement`: Changes attuned damage type for Manifestation.
    - `makeItSo`: Spends 1 `manifestation` use, provides CHA modifier / Proficiency / Expertise bonus on d20 roll.
    - `aLeaderLeads`: 1+ Aggression spent on Authority gain, grants Special Inspiration to allies.
    - `forceOfWill`: Spends 1 `forceOfWill` use. Formula and save configured by damage type (3d6 burst, 8d6 line, 6d6 melee).
    - `divineRight`: Upgrades Authority benefits at 17th level.

### 4.4 Central Integration Points
1. **`ak5e/scripts/guard-rules.mjs`:**
   - Update `IMPLEMENTED_GUARD_BRANCHES`:
     ```javascript
     export const IMPLEMENTED_GUARD_BRANCHES = Object.freeze([
       "artsblade", "brawler", "centurion", "crusher", "instructor",
       "duellist", "liberator", "lord"
     ]);
     ```
2. **`ak5e/scripts/guard-uses.mjs`:**
   - Adjust `CORE_PLANS.forestall` to support Duellist's Parry:
     ```javascript
     const isDuellist = guardBranch(actor) === "duellist";
     // If first Forestall this round, costs 0 Reaction and 1 fewer Aggression (min 0).
     ```
3. **`ak5e/scripts/guard-sheet.mjs`:**
   - Import `isDuellist`, `isLiberator`, `isLord`.
   - Update summary badges in `openGuardControls()`:
     - Duellist Points pill.
     - Liberty pill.
     - Authority status & Manifestation uses pill.
   - Add button rows for Duellist, Liberator, and Lord.
   - Add dialog handlers in `executeGuardDialog(actor, cmd)` for choice prompts (Engagements, Guide the Masses, Flash of Anger, King's Domain, Make It So, Force of Will).
4. **`ak5e/scripts/ak5e.mjs`:**
   - Import and export `isDuellist`, `isLiberator`, `isLord` under `game.ak5e.guard`.
   - Call `registerDuellistHooks()`, `registerLiberatorHooks()`, `registerLordHooks()` in `ready` hook.
5. **`package.json`:**
   - Update `"test:guard"`:
     ```json
     "test:guard": "node --test ak5e/test/guard-*.test.mjs ak5e/test/centurion.test.mjs ak5e/test/crusher.test.mjs ak5e/test/instructor.test.mjs ak5e/test/artsblade.test.mjs ak5e/test/brawler.test.mjs ak5e/test/duellist.test.mjs ak5e/test/liberator.test.mjs ak5e/test/lord.test.mjs"
     ```
6. **`ak5e/tools/test-guard-live.mjs`:**
   - Add Duellist ("Nearl (Duellist)"), Liberator ("Młynar (Liberator)"), and Lord ("SilverAsh (Lord)") test actors.
   - Render sheets, open Guard Controls dialog, execute an action, verify undo, and capture screenshots for visual review.

---

## 5. Verification Method

To verify the investigation and subsequent implementation:

1. **Static Analysis & File Validation:**
   ```bash
   node ak5e/tools/validate-files.mjs
   node ak5e/tools/verify-generated-content.mjs
   ```
   Ensures clean syntax, valid JSON schemas, and zero regressions against Chapter 1–6 content records.

2. **Unit Test Execution:**
   ```bash
   npm run test:guard
   ```
   Must pass all suites cleanly with 0 failures (currently 58 passed; will increase to ~85+ with Duellist, Liberator, and Lord suites).

3. **In-Foundry Live Browser Test (Playwright Chromium):**
   ```bash
   AK5E_PORT=30175 node ak5e/tools/test-guard-live.mjs
   ```
   Or via orchestration runner script:
   ```bash
   /tmp/run-guard-live.sh
   ```
   Verifies clean execution with `errors: []` and generated screenshots in output directory.

4. **Visual Inspection Delegation:**
   All captured screenshots from `test-guard-live.mjs` must be delegated to `foundry-validator` per AGENTS.md §6.2 for PASS/FAIL/UNCERTAIN review.
