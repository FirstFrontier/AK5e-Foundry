# Handoff Report: AK5e Executor Specialist Subclass Rules Investigation

## 1. Observation

### 1.1 Source Rules Authority Quotations
Rules citations from `/home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (lines 5498–5578):

1. **Class Overview & Level 1 Path Choice (Lines 5498–5505):**
   > "### Executor" (L5498)  
   > "An Executor Specialist's primary concern is their mission, whatever it may be. Skulking in the shadows, waiting for their moment, before fading away once more. As a result, they are often not the most sociable people but if you need a target dead, or a target preserved, you can ask for no better." (L5499)  
   > "#### 1st Level: The Wolf and the Shepherd" (L5501)  
   > "Choose your path, and walk it until the end. You gain the following benefits:" (L5502)  
   > "**To Hunt, or Not To Hunt.** When you adopt this Branch, you must choose whether you will be a Hunter or a Bodyguard; your Branch Features grant you different benefits based on your choice." (L5504)

2. **Deathmark Mechanics (Lines 5506–5516):**
   > "**Deathmark.** You have a Deathmark that grants you benefits based on whether you or another Creature has it; you can transfer your Deathmark from yourself to a hostile Creature by making an Attack against them." (L5506)  
   > "Your Deathmark returns to you when a Creature with your Deathmark is reduced to 0 Hit Points, or at the end of your Turn if you have not Attacked or dealt Damage to a hostile Creature with your Deathmark. When your Deathmark returns to you, you gain 3 Skill Points, and you can immediately take the Disengage Action as a Reaction." (L5508)  
   > "While you have your Deathmark, you gain 3 Skill Points at the beginning of your Turn in combat. Additionally, you can take the Hide Action as a Bonus Action." (L5510)  
   > "While another Creature has your Deathmark, you deal 1d4 additional Damage to that Creature when you hit them with an Attack; this additional Damage is increased to 2d4 at Level 7, and 3d4 at Level 14. Furthermore, you gain an additional benefit against a Creature with your Deathmark based on your choice of Hunter or Bodyguard:" (L5512)  
   > "- **Hunter:** The Critical Range of your Attacks against Creatures with your Deathmark is increased by 1." (L5514)  
   > "- **Bodyguard:** When a hostile Creature with your Deathmark would make an Attack against a Creature while you are both within the Reach or Range of that Attack and also within 10 feet of an original target, you can cause that Attack to target you instead of that Creature (no Action required)." (L5515)

3. **Level 5 Features: In Every Shadow & Spring/Escape the Ambush (Lines 5517–5541):**
   > "#### 5th Level: In Every Shadow" (L5517)  
   > "**Additional Movement Speeds.** You gain a Climbing and Swimming Speed equal to your Walking Speed." (L5520)  
   > "**Stealth Expertise.** You gain Proficiency in the Stealth Skill. If you already have Proficiency, you instead gain Expertise." (L5522)  
   > "#### 5th Level: Spring the Ambush/Escape the Ambush" (L5529)  
   > "You gain one of the following ways to expend your Prowess based on your choice of Hunter or Bodyguard:" (L5530)  
   > "**Hunter (Sweeper).** While you are Hiding or Invisible, you can expend 1 Prowess as an Action. If you do so, until the end of the Turn your Reach is increased by 5 feet, and you may immediately make a Melee Attack against each Creature of your Choice within your Reach; you can only make one Attack against each Creature. If you hit a Creature with an Attack as part of this Action, that Creature immediately gains your Deathmark, even if it is on another Creature. At the end of the Action, your Deathmark returns to you." (L5532)  
   > "**Bodyguard (Smokescreen).** You can expend 1 Prowess as a Reaction to create a 10-foot-radius sphere of Arts-infused smoke centred at your feet. This smoke lasts until the end of your next Turn, and is considered to be Magical Darkness. Additionally, when you create this smoke, you can choose one allied Creature within it; they may use their Reaction to move up to their Speed." (L5534)  
   > "**Gaining Prowess as an Executor.** As an Executor, you gain 1 Prowess when a Creature with your Deathmark is reduced to 0 Hit Points. Once you have gained Prowess in this way, you may not do so again until the beginning of your next Turn." (L5536)  
   > "You also can gain Prowess in an additional way based on your choice of Hunter or Bodyguard:" (L5538)  
   > "- **Hunter:** When you deal 30 or more Damage with a single Attack, you gain 1 Prowess." (L5539)  
   > "- **Bodyguard:** At the end of an allied Creature's Turn where they were Attacked while within 10 feet of you, but have taken no Damage from hostile Creatures that Turn, you gain 1 Prowess." (L5540)

4. **Level 11 Features: Preysense & Dangersense (Lines 5549–5555):**
   > "#### 11th Level: Preysense/Dangersense" (L5549)  
   > "You gain one of the following benefits based on your choice of Hunter or Bodyguard:" (L5550)  
   > "**Hunter.** When you score a Critical Hit, you may roll 1 additional Damage die and add it to the extra Damage inflicted by that Critical Hit. Additionally, when you score a Critical Hit against a living Creature, you also inflict the Bleeding Condition." (L5552)  
   > "**Bodyguard.** When an allied Creature within 5 feet of you is subjected to an effect that allows them to make a Strength or Dexterity Saving Throw to take only half Damage, you can use your Reaction to choose a location within a distance equal to half of your Speed; both you and that Creature move to that location as close together as possible. If you moved to a location outside of that Area of Effect, both Creatures instead take no Damage if they succeed on the Saving Throw and only half Damage if they fail." (L5554)

5. **Level 15 Features: In for the Kill & Blade Shield (Lines 5556–5562):**
   > "#### 15th Level: In for the Kill/Blade Shield" (L5556)  
   > "You gain one of the following benefits based on your choice of Hunter or Bodyguard:" (L5557)  
   > "**Hunter.** When you transfer your Deathmark to a hostile Creature, that Creature is Vulnerable against all Damage dealt by your Attacks until the end of the Turn." (L5559)  
   > "**Bodyguard.** As a Reaction when a Creature with your Deathmark makes an Attack Roll against you while they are within your Reach, you can make a Weapon Attack against that Creature. If your Attack hits, subtract your Proficiency Bonus from the result of that Creature's Attack Roll, possibly causing it to miss." (L5561)

6. **Level 20 Features: Mortal Blow & Ultimate Sword and Shield (Lines 5563–5571):**
   > "#### 20th Level: Mortal Blow/Ultimate Sword and Shield" (L5563)  
   > "No matter your path, you have reached its end. Only death can keep you from your mission now." (L5564)  
   > "You gain one of the following benefits based on your choice of Hunter or Bodyguard:" (L5566)  
   > "**Hunter.** Once per Long Rest as an Action, choose a Creature you can see within a distance equal to your Speed; you flash towards them with a lethal strike. You teleport to an unoccupied space within 5 feet of that Creature, and they must make a Dexterity Saving Throw against your Martial DC. Roll 10d8. On a failed Save, that Creature loses Hit Points equal to the amount rolled. On a successful Save, they lose Hit Points equal to half the amount rolled. If the Creature has the Bleeding Condition, they lose twice as many Hit Points." (L5568)  
   > "**Bodyguard.** You are Resistant to all Damage dealt by a hostile Creature with your Deathmark. Additionally, using your Blade Shield Feature no longer expends your Reaction. Finally, when another Creature within 10 feet of you is targeted for an Attack by a hostile Creature, you can transfer your Deathmark, wherever it is, to the Attacking Creature as a Reaction." (L5570)

### 1.2 Cross-Chapter Rules Evidence
- **Bleeding Condition:** `AK5e_1.3.1_Foundry_Source/01_chapter_1_changing_the_game.txt` (lines 224–226):
  "A Bleeding Creature loses 2d6 Hit Points at the beginning of their Turn. This Condition is removed if the Creature recovers any missing Hit Points. It can also be removed by a Creature within 5ft succeeding on a DC12 Medicine Check as an Action. Only living Creatures can Bleed."
- **Martial DC:** `AK5e_1.3.1_Foundry_Source/01_chapter_1_changing_the_game.txt` (lines 211–212):
  "A Character’s Martial DC is equal to 8 + their Strength or Dexterity Bonus (their Choice) + their Proficiency Bonus." Matches `ak5e/scripts/specialist-rules.mjs` line 164 (`8 + pb + Math.max(strMod, dexMod)`).
- **Skill Points (SP) System:** `ak5e/scripts/ak5e.mjs` lines 670–676 (`adjustSkillPoints(actor, amount, options)`). SP grant must support reason/traceability.
- **Prowess Resource Pool:** `ak5e/scripts/resource-pools.mjs` and `ak5e/scripts/specialist-rules.mjs` lines 377–385:
  Prowess pool max is Proficiency Bonus (`@prof`), short rest restores 1, long rest restores 1.
- **DECISIONS.md Precedents:**
  - `ak5e/DECISIONS.md` lines 161–166 (Debilitate and Destroy HP loss):
    - `bypassDRResist`: Ignores Damage Reduction and Damage Resistance; absorbed by Temporary Hit Points.
    - `bypassAll`: Directly reduces current Hit Points, ignoring Temporary Hit Points as well.
  - `ak5e/DECISIONS.md` line 1980: Confirms "Deathmark" as distinct from Reaper's Mark.
- **Existing Specialist Implementation:**
  - `ak5e/scripts/specialist-rules.mjs`: `isExecutor(actor)` already defined (lines 293–303) checking `SPECIALIST_BRANCH_IDS["subclass-specialist-executor"] === "executor"`.
  - `ak5e/scripts/specialist-sheet.mjs`: Lines 55–61 already check `getDeathmarkStateText(actor)` expecting `flags.ak5e.executor.deathmark` (`holder: "self" | "target"`).

---

## 2. Logic Chain

### Step 1: Subclass Architecture & Path Choice Model
- **Observation:** Source L5501–5505 mandates that upon adopting the Executor Branch at 1st level, the character chooses between **Hunter** and **Bodyguard**.
- **Inference:**
  1. The path choice must be stored persistently under `actor.flags.ak5e.executor.path` with values `"hunter"` | `"bodyguard"`.
  2. Setup and progression (`specialist-setup.mjs` and `specialist-progression.mjs`) must expose this choice during Level 1 subclass configuration.
  3. All subsequent subclass features diverge conditionally based on `getExecutorPath(actor)`:
     - Level 1: Hunter crit range (+1) vs Bodyguard attack redirection (10 ft, no action).
     - Level 5: Sweeper (+5 ft reach cleave, mark cycle) vs Smokescreen (10 ft darkness + ally reaction move).
     - Level 5 Prowess trigger: Hunter >= 30 single attack dmg vs Bodyguard ally attacked taking 0 dmg.
     - Level 11: Preysense (+1 crit die & Bleeding) vs Dangersense (AoE reaction move half speed).
     - Level 15: In for the Kill (Vulnerability on mark transfer) vs Blade Shield (reaction attack -PB).
     - Level 20: Mortal Blow (10d8 HP loss action) vs Ultimate Sword and Shield (Resistance, free Blade Shield, reaction mark transfer).

### Step 2: Deathmark State Tracking & Transfer Mechanics
- **Observation:** Source L5506 states: "You have a Deathmark that grants you benefits based on whether you or another Creature has it; you can transfer your Deathmark from yourself to a hostile Creature by making an Attack against them."
- **Inference:**
  1. There is exactly one Deathmark per Executor Specialist.
  2. Deathmark state is a finite-state machine:
     - `holder === "self"` (Specialist holds Deathmark).
     - `holder === "target"` (Hostile creature holds Deathmark, tracking `targetUuid` and `targetName`).
  3. **Transfer on Attack:**
     - Source text: "by making an Attack against them" (L5506).
     - Two distinct table readings exist:
       - **Reading A (`onAttackRoll`):** Deathmark transfers when the attack roll is made, regardless of hit or miss. This aligns with standard 5e rules where "making an attack" begins when the attack is declared/rolled. It ensures the mark is immediately present on the target during the attack, allowing Hunter's +1 crit range and mark bonus damage (+1d4) to apply to that initial attack.
       - **Reading B (`onHitOnly`):** Deathmark only transfers if the attack actually hits the target. If the attack misses, the mark remains with the current holder. (Contrasted with Sweeper at L5532, which explicitly specifies "If you hit a Creature with an Attack as part of this Action, that Creature immediately gains your Deathmark").
     - **Recommendation:** Implement a configurable reading in `DECISIONS.md` (`deathmarkTransferTrigger`: `"onAttackRoll"` vs `"onHitOnly"`, defaulting to `"onAttackRoll"` per source text literal, with manual/override support in dialogs).
  4. **Return Triggers:**
     - Trigger A: Marked creature is reduced to 0 Hit Points.
     - Trigger B: End of Specialist's combat turn if the Specialist has NOT attacked or dealt damage to the marked creature during that turn.
     - Trigger C: At the end of the Sweeper action (L5532).
     - Trigger D: Combat end / manual reset.
  5. **Return Benefits:**
     - Immediately gain **+3 Skill Points (SP)** (`adjustSkillPoints(actor, 3, { reason: "Deathmark returned" })`).
     - Can immediately take the **Disengage Action as a Reaction** (consumes Specialist's reaction).
  6. **Passive Benefits While Held by Specialist (`holder === "self"`):**
     - Combat turn start: Gain **+3 Skill Points (SP)** at the beginning of each combat turn.
     - Bonus Action: Can take the **Hide Action as a Bonus Action**.
  7. **Damage Scaling While on Target (`holder === "target"`):**
     - When the Specialist hits the marked creature with an Attack, add extra damage:
       - Level 1–6: **+1d4**
       - Level 7–13: **+2d4**
       - Level 14–20: **+3d4**
  8. **Path Specific Mark Riders:**
     - Hunter: Critical Range of attacks against marked creature increased by 1 (e.g. 19–20 crit threshold).
     - Bodyguard: Hostile marked creature attacks another creature; if Specialist is within reach/range and within 10 ft of target, Specialist can redirect the attack to target themselves (**no action required**).

### Step 3: Level 5 Mobility, Cleave, Darkness, and Prowess Triggers
- **Observation:** Source L5517–5541 establishes In Every Shadow, Sweeper/Smokescreen, and Executor Prowess triggers.
- **Inference:**
  1. **In Every Shadow:**
     - Climbing speed = walking speed (`system.attributes.movement.climb = walkSpeed`).
     - Swimming speed = walking speed (`system.attributes.movement.swim = walkSpeed`).
     - Stealth proficiency: If `system.skills.ste.value === 0`, set to `1` (Proficiency); if already `>= 1`, set to `2` (Expertise).
  2. **Sweeper (Hunter):**
     - Prerequisite: Hiding or Invisible.
     - Cost: 1 Prowess, Action.
     - Mechanics:
       - Reach increased by +5 ft until end of turn.
       - Make one melee attack against each chosen creature within reach.
       - Each hit transfers the Deathmark to that creature immediately (even if currently on someone else).
       - At the end of the Action, Deathmark returns to the Specialist (triggering +3 SP and optional Reaction Disengage).
  3. **Smokescreen (Bodyguard):**
     - Cost: 1 Prowess, Reaction.
     - Mechanics:
       - 10-foot-radius sphere centered at feet.
       - Duration: until end of Specialist's next turn.
       - Property: Magical Darkness.
       - Chosen ally within it may use their Reaction to move up to their Speed.
  4. **Prowess Generation:**
     - Universal Executor Trigger: 1 Prowess when marked target drops to 0 HP (frequency limit: once until beginning of next turn).
     - Hunter Trigger: 1 Prowess when dealing >= 30 Damage with a single Attack.
     - Bodyguard Trigger: 1 Prowess at end of allied creature's turn if they were attacked within 10 ft of Specialist and took 0 damage that turn.

### Step 4: Level 11 Preysense & Dangersense
- **Observation:** Source L5549–5555 grants critical riders for Hunter and save-movement evasion for Bodyguard.
- **Inference:**
  1. **Preysense (Hunter):**
     - Triggers on Critical Hit.
     - Adds 1 extra damage die to critical damage.
     - If target is a **living Creature** (non-construct, non-undead), applies the **Bleeding Condition**.
     - Bleeding (Ch. 1 L224–226): 2d6 HP loss at turn start, ends on heal or DC 12 Medicine action.
  2. **Dangersense (Bodyguard):**
     - Triggers as Reaction when ally within 5 ft is subjected to STR/DEX save for half damage.
     - Move both up to `speed / 2` to a location as close together as possible.
     - If outside the AoE: Successful save = 0 damage; Failed save = half damage.

### Step 5: Level 15 In for the Kill & Blade Shield
- **Observation:** Source L5556–5562 grants damage amplification for Hunter and defensive parry-strikes for Bodyguard.
- **Inference:**
  1. **In for the Kill (Hunter):**
     - Triggers on transferring Deathmark to a hostile creature.
     - Target gains Vulnerability against all damage dealt by the Specialist's attacks until the end of the turn.
  2. **Blade Shield (Bodyguard):**
     - Triggers as Reaction when creature with Deathmark makes an attack roll against Specialist within reach.
     - Specialist makes an immediate weapon attack against that creature.
     - On hit: Subtract Proficiency Bonus (`@prof`) from creature's attack roll result, potentially turning a hit into a miss.

### Step 6: Level 20 Capstones: Mortal Blow vs Ultimate Sword and Shield
- **Observation:** Source L5563–5571 provides high-tier capstone abilities.
- **Inference:**
  1. **Mortal Blow (Hunter):**
     - 1 / Long Rest Action.
     - Teleport up to Speed to an unoccupied space within 5 ft of a seen creature.
     - Target makes DEX save vs Martial DC (`8 + PB + max(STR, DEX)`).
     - Interactive roll of **10d8** via chat card button (WORKFLOW §3.2).
     - HP Loss:
       - Failed save: loses HP equal to roll.
       - Successful save: loses HP equal to `floor(roll / 2)`.
       - If target has Bleeding: HP loss is doubled (`2 * roll` on fail, `roll` on pass).
     - HP Loss Semantics (`bypassDRResist` vs `bypassAll`):
       - Per `DECISIONS.md` precedent (Debilitate and Destroy), provide GM ruling / option:
         - `bypassDRResist`: Ignores DR and Resistance, but Temporary HP absorbs it.
         - `bypassAll`: Ignores Temporary HP as well, directly lowering current HP.
  2. **Ultimate Sword and Shield (Bodyguard):**
     - Passive: Resistance to all damage dealt by hostile creature with Deathmark.
     - Upgrade: Blade Shield no longer expends Reaction (unlimited uses per round against marked creature).
     - Reaction: When another creature within 10 ft is targeted for an attack, transfer Deathmark from wherever it is to the attacking creature as a Reaction.

---

## 3. Caveats

1. **`onAttackRoll` vs `onHitOnly` Mark Transfer:**
   - Source L5506 states "by making an Attack against them", while Sweeper L5532 states "If you hit a Creature with an Attack as part of this Action, that Creature immediately gains your Deathmark".
   - The distinction between declaration/roll and hit must be configurable via `ak5e/DECISIONS.md` and `ruling(actor, "deathmarkTransferTrigger")`. The default representation should be `onAttackRoll` with `onHitOnly` available as an explicit table choice.
2. **Mortal Blow Hit Point Loss vs Temporary HP:**
   - Source L5568 uses the phrasing "loses Hit Points equal to the amount rolled", not "takes damage". In AK5e rules, HP loss bypasses DR and Resistance. Whether it bypasses Temporary HP should follow the established `bypassDRResist` vs `bypassAll` pattern in `DECISIONS.md`.
3. **Class Level vs Character Level for Deathmark Damage Scaling:**
   - Deathmark damage scales at Level 7 (+2d4) and Level 14 (+3d4). In multiclassing contexts, this refers to **Specialist level** (`specialistLevel(actor)`), consistent with all other AK5e class features.
4. **Manual Spatial Boundaries (WORKFLOW §3.2):**
   - Smokescreen (10-ft darkness placement, ally reaction move) and Dangersense (moving both tokens up to half speed out of an AoE template) require spatial and tactical decisions. In accordance with WORKFLOW §3.2 and `TODO.md` line 940 ("Manual-OK: Smokescreen, Dangersense"), these abilities are represented via guided confirmation dialogs, chat card instructions, and token movement prompts, rather than brittle fully-automated canvas geometry solvers.
5. **Living vs Non-Living Targets for Bleeding:**
   - Preysense only inflicts Bleeding on living creatures (Constructs and Undead are immune per Ch. 1 L226). The implementation must inspect `target.system.details.type.value` (checking for `"construct"` or `"undead"`) and warn/skip Bleeding application accordingly.
6. **Interaction of Sweeper with Deathmark Return Benefits:**
   - When Sweeper ends, "your Deathmark returns to you" (L5532). This explicitly triggers the standard Deathmark return benefits (+3 SP, and optional Reaction Disengage).

---

## 4. Conclusion & Concrete Implementation Blueprint

### 4.1 Interface Architecture (`ak5e/scripts/executor-features.mjs`)

```javascript
/**
 * Executor Specialist Subclass features (Ch. 3 L5498–5578).
 * Pure functional logic, state inspection, and helper routines.
 */

// Path Constants
export const EXECUTOR_PATHS = Object.freeze({
  HUNTER: "hunter",
  BODYGUARD: "bodyguard"
});

// State Helpers
export function getExecutorPath(actor) {
  return actor.getFlag?.("ak5e", "executor")?.path ?? actor.flags?.ak5e?.executor?.path ?? null;
}

export function getDeathmarkState(actor) {
  const dm = actor.getFlag?.("ak5e", "executor")?.deathmark ?? actor.flags?.ak5e?.executor?.deathmark ?? { holder: "self", targetUuid: null };
  return {
    holder: dm.holder ?? "self", // "self" | "target"
    targetUuid: dm.targetUuid ?? null,
    targetName: dm.targetName ?? null,
    markedAt: dm.markedAt ?? null,
    lastAttackedTurn: dm.lastAttackedTurn ?? null
  };
}

// Damage & Crit Scaling Helpers
export function deathmarkBonusDice(level) {
  const lvl = Number(level) || 1;
  if (lvl >= 14) return "3d4";
  if (lvl >= 7) return "2d4";
  return "1d4";
}

export function deathmarkCritRangeBonus(actor, target) {
  if (getExecutorPath(actor) !== EXECUTOR_PATHS.HUNTER) return 0;
  const dm = getDeathmarkState(actor);
  if (dm.holder === "target" && (target?.uuid === dm.targetUuid || target?.id === dm.targetUuid)) {
    return 1;
  }
  return 0;
}

export function canRedirectAttack(actor, originalTarget, distanceToTarget) {
  if (getExecutorPath(actor) !== EXECUTOR_PATHS.BODYGUARD) return false;
  const dm = getDeathmarkState(actor);
  if (dm.holder !== "target") return false;
  return Number(distanceToTarget) <= 10;
}
```

### 4.2 Table-Play Plans (`ak5e/scripts/specialist-uses.mjs`)

The following plans must be added to the Specialist use engine:

1. **`transferDeathmark(actor, state, data)`**:
   - Transfers Deathmark to targeted creature (`targetUuid`, `targetName`).
   - If Level >= 15 and Hunter: sets `vulnerableUntilTurnEnd: true` on target (In for the Kill).
   - Generates undo receipt snapshotting previous Deathmark state.
2. **`returnDeathmark(actor, state, data)`**:
   - Returns Deathmark to Specialist (`holder: "self"`).
   - Awards +3 Skill Points (`game.ak5e.adjustSkillPoints(actor, 3)`).
   - Prompts for immediate Reaction Disengage.
3. **`sweeper(actor, state, data)`**:
   - Prerequisite: Hunter, Level >= 5, Hiding or Invisible.
   - Spends 1 Prowess (Action).
   - Increases reach by 5 ft.
   - Cleaves multiple targets, transfers mark on hit, returns mark at action end (+3 SP).
4. **`smokescreen(actor, state, data)`**:
   - Prerequisite: Bodyguard, Level >= 5.
   - Spends 1 Prowess (Reaction).
   - Generates 10-ft magical darkness card and prompt for ally reaction move.
5. **`bladeShield(actor, state, data)`**:
   - Prerequisite: Bodyguard, Level >= 15.
   - Reaction (free at Level 20).
   - Weapon attack against marked attacker; on hit, subtracts PB from attacker's roll.
6. **`mortalBlow(actor, state, data)`**:
   - Prerequisite: Hunter, Level >= 20.
   - 1 / Long Rest Action.
   - Teleport within Speed to 5 ft of creature.
   - DEX save vs Martial DC.
   - Posts chat card with interactive `10d8` roll button.
   - Resolves HP loss: full/half, doubled if Bleeding, evaluating `bypassDRResist` vs `bypassAll` reading.
7. **`dangersense(actor, state, data)`**:
   - Prerequisite: Bodyguard, Level >= 11.
   - Spends Reaction when ally within 5 ft makes STR/DEX save for half damage.
   - Prompts movement of both tokens up to half speed and provides save damage mitigation instructions.
8. **`redirectMarkedAttack(actor, state, data)`**:
   - Prerequisite: Bodyguard, Level >= 1.
   - No action cost; redirects marked creature's attack from ally within 10 ft to Specialist.
9. **`ultimateTransferDeathmark(actor, state, data)`**:
   - Prerequisite: Bodyguard, Level >= 20.
   - Spends Reaction when creature within 10 ft is attacked to transfer Deathmark to the attacker.

### 4.3 Prowess Gain Triggers Engine

- Trigger 1: Target with Deathmark reduced to 0 HP -> calls `gainProwess(actor, 1, "Deathmark target reduced to 0 HP")` (1/turn).
- Trigger 2 (Hunter): Single attack deals >= 30 damage -> calls `gainProwess(actor, 1, "Hunter single attack >= 30 damage")`.
- Trigger 3 (Bodyguard): Ally within 10 ft attacked taking 0 damage that turn -> calls `gainProwess(actor, 1, "Bodyguard ally took 0 damage")`.

---

## 5. Verification Method

### 5.1 Independent Static Verification
Run static file and content verification:
```bash
node ak5e/tools/validate-files.mjs
node ak5e/tools/verify-generated-content.mjs
```

### 5.2 Unit Test Execution
Execute the full specialist unit test suite once authored (`ak5e/test/executor.test.mjs`):
```bash
node --test ak5e/test/specialist-rules.test.mjs \
  ak5e/test/specialist-progression.test.mjs \
  ak5e/test/specialist-features.test.mjs \
  ak5e/test/specialist-adversarial.test.mjs \
  ak5e/test/executor.test.mjs
```

### 5.3 Concrete Test Assertions Required for Executor Suite
1. **Path Choice:** Level 1 setup/progression records `"hunter"` vs `"bodyguard"`.
2. **Deathmark State Machine:**
   - Initial state is `holder === "self"`.
   - Transfer on attack updates state to `holder === "target"` and records target UUID.
   - Return on 0 HP or end of turn without attacking sets `holder === "self"`.
   - Return awards exactly +3 SP and offers Reaction Disengage.
   - Turn start while held awards +3 SP and enables Bonus Action Hide.
   - Damage scaling tests: +1d4 at Lv 1–6, +2d4 at Lv 7–13, +3d4 at Lv 14–20.
   - Hunter +1 crit range against marked target.
   - Bodyguard attack redirection within 10 ft without action.
3. **Level 5 Mechanics:**
   - In Every Shadow sets climb/swim equal to walk speed, and upgrades Stealth proficiency to expertise.
   - Sweeper spends 1 Prowess, enforces Hiding/Invisible, +5 ft reach, mark cycle, returns mark at action end.
   - Smokescreen spends 1 Prowess and 1 reaction, creates 10-ft darkness card, ally reaction move.
   - Prowess gain triggers: 1/turn on marked 0 HP, Hunter >= 30 damage, Bodyguard 10 ft 0-dmg ally attack.
4. **Level 11 Mechanics:**
   - Preysense: extra crit die, living target gains Bleeding condition, construct/undead target immune.
   - Dangersense: Reaction spend, half-speed move, save damage mitigation (0 on pass, half on fail).
5. **Level 15 Mechanics:**
   - In for the Kill: mark transfer applies Vulnerability to Specialist attacks until end of turn.
   - Blade Shield: Reaction spend, weapon attack hit subtracts PB from attacker roll.
6. **Level 20 Mechanics:**
   - Mortal Blow: 1/LR Action, Martial DC save, 10d8 roll, double HP loss if Bleeding, tests `bypassDRResist` and `bypassAll`.
   - Ultimate Sword and Shield: Resistance to marked creature, Blade Shield costs 0 reactions, reaction mark transfer on ally attack within 10 ft.
7. **Reversibility & Undo Integrity:**
   - Every active use records an undo receipt in `flags.ak5e.specialistUses.undo` that cleanly restores previous state.

### 5.4 Invalidation Conditions
The findings of this report are invalidated if:
1. `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` text for Executor (L5498–5578) is modified upstream.
2. D&D5e or AK5e core resource pool architecture deprecates the standard `prowess` registration.
3. `adjustSkillPoints` API in `ak5e.mjs` is altered.
