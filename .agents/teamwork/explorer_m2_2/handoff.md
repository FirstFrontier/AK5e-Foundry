# Milestone 2 Architectural & Test Design Handoff Report: Executor Subclass

## 1. Observation

### 1.1 Source Rules Authority (`AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`)
Directly quoted from Chapter 3 lines 5498–5578:
- **1st Level: The Wolf and the Shepherd (L5501–5516)**:
  - *To Hunt, or Not To Hunt (L5504)*: "When you adopt this Branch, you must choose whether you will be a Hunter or a Bodyguard; your Branch Features grant you different benefits based on your choice."
  - *Deathmark (L5506–5516)*:
    - "You have a Deathmark that grants you benefits based on whether you or another Creature has it; you can transfer your Deathmark from yourself to a hostile Creature by making an Attack against them."
    - "Your Deathmark returns to you when a Creature with your Deathmark is reduced to 0 Hit Points, or at the end of your Turn if you have not Attacked or dealt Damage to a hostile Creature with your Deathmark. When your Deathmark returns to you, you gain 3 Skill Points, and you can immediately take the Disengage Action as a Reaction."
    - "While you have your Deathmark, you gain 3 Skill Points at the beginning of your Turn in combat. Additionally, you can take the Hide Action as a Bonus Action."
    - "While another Creature has your Deathmark, you deal 1d4 additional Damage to that Creature when you hit them with an Attack; this additional Damage is increased to 2d4 at Level 7, and 3d4 at Level 14."
    - *Hunter benefit (L5514)*: "The Critical Range of your Attacks against Creatures with your Deathmark is increased by 1."
    - *Bodyguard benefit (L5515)*: "When a hostile Creature with your Deathmark would make an Attack against a Creature while you are both within the Reach or Range of that Attack and also within 10 feet of an original target, you can cause that Attack to target you instead of that Creature (no Action required)."
- **5th Level: In Every Shadow (L5517–5523)**:
  - *Additional Movement Speeds (L5520)*: "You gain a Climbing and Swimming Speed equal to your Walking Speed."
  - *Stealth Expertise (L5522)*: "You gain Proficiency in the Stealth Skill. If you already have Proficiency, you instead gain Expertise."
- **5th Level: Spring the Ambush / Escape the Ambush (L5529–5541)**:
  - *Hunter (Sweeper) (L5532)*: "While you are Hiding or Invisible, you can expend 1 Prowess as an Action. If you do so, until the end of the Turn your Reach is increased by 5 feet, and you may immediately make a Melee Attack against each Creature of your Choice within your Reach; you can only make one Attack against each Creature. If you hit a Creature with an Attack as part of this Action, that Creature immediately gains your Deathmark, even if it is on another Creature. At the end of the Action, your Deathmark returns to you."
  - *Bodyguard (Smokescreen) (L5534)*: "You can expend 1 Prowess as a Reaction to create a 10-foot-radius sphere of Arts-infused smoke centred at your feet. This smoke lasts until the end of your next Turn, and is considered to be Magical Darkness. Additionally, when you create this smoke, you can choose one allied Creature within it; they may use their Reaction to move up to their Speed."
  - *Gaining Prowess as an Executor (L5536–5541)*:
    - "As an Executor, you gain 1 Prowess when a Creature with your Deathmark is reduced to 0 Hit Points. Once you have gained Prowess in this way, you may not do so again until the beginning of your next Turn."
    - *Hunter (L5539)*: "When you deal 30 or more Damage with a single Attack, you gain 1 Prowess."
    - *Bodyguard (L5540)*: "At the end of an allied Creature's Turn where they were Attacked while within 10 feet of you, but have taken no Damage from hostile Creatures that Turn, you gain 1 Prowess."
- **11th Level: Preysense / Dangersense (L5549–5555)**:
  - *Hunter (L5552)*: "When you score a Critical Hit, you may roll 1 additional Damage die and add it to the extra Damage inflicted by that Critical Hit. Additionally, when you score a Critical Hit against a living Creature, you also inflict the Bleeding Condition."
  - *Bodyguard (L5554)*: "When an allied Creature within 5 feet of you is subjected to an effect that allows them to make a Strength or Dexterity Saving Throw to take only half Damage, you can use your Reaction to choose a location within a distance equal to half of your Speed; both you and that Creature move to that location as close together as possible. If you moved to a location outside of that Area of Effect, both Creatures instead take no Damage if they succeed on the Saving Throw and only half Damage if they fail."
- **15th Level: In for the Kill / Blade Shield (L5556–5562)**:
  - *Hunter (L5559)*: "When you transfer your Deathmark to a hostile Creature, that Creature is Vulnerable against all Damage dealt by your Attacks until the end of the Turn."
  - *Bodyguard (L5561)*: "As a Reaction when a Creature with your Deathmark makes an Attack Roll against you while they are within your Reach, you can make a Weapon Attack against that Creature. If your Attack hits, subtract your Proficiency Bonus from the result of that Creature's Attack Roll, possibly causing it to miss."
- **20th Level: Mortal Blow / Ultimate Sword and Shield (L5563–5571)**:
  - *Hunter (L5568)*: "Once per Long Rest as an Action, choose a Creature you can see within a distance equal to your Speed; you flash towards them with a lethal strike. You teleport to an unoccupied space within 5 feet of that Creature, and they must make a Dexterity Saving Throw against your Martial DC. Roll 10d8. On a failed Save, that Creature loses Hit Points equal to the amount rolled. On a successful Save, they lose Hit Points equal to half the amount rolled. If the Creature has the Bleeding Condition, they lose twice as many Hit Points."
  - *Bodyguard (L5570)*: "You are Resistant to all Damage dealt by a hostile Creature with your Deathmark. Additionally, using your Blade Shield Feature no longer expends your Reaction. Finally, when another Creature within 10 feet of you is targeted for an Attack by a hostile Creature, you can transfer your Deathmark, wherever it is, to the Attacking Creature as a Reaction."

### 1.2 Existing Specialist Architecture in the Codebase
- **`ak5e/scripts/specialist-rules.mjs`**:
  - Line 9: `SPECIALIST_BRANCH_IDS["subclass-specialist-executor"] = "executor"`
  - Line 293: `isExecutor(actor)` checks `specialistBranch(actor) === "executor"` or subclass item flags/names.
  - Line 159: `martialDC(actor)` returns `8 + pb + Math.max(strMod, dexMod)`.
  - Line 167: `specialistDC(actor)` returns `8 + pb + dexMod`.
  - Line 142: `pbForLevel(level)`.
  - Line 273: `specialistLevel(actor)`.
- **`ak5e/scripts/specialist-features.mjs`**:
  - Registers the `prowess` resource pool (`max: @prof`, recovery: 1 on SR/LR).
  - Handles `onSpecialistRest` and `registerSpecialistHooks`.
- **`ak5e/scripts/specialist-uses.mjs`**:
  - Created via `createPlayUses({ ns: "specialistUses", label: "Specialist" })`.
  - Lines 254–256: `specialistUses.register({ plans: CORE_PLANS })`.
  - Lines 273–282: `specialistUses.plan(actor, name, data)` calls `CORE_PLANS[name]`.
    *Critical Observation*: To allow subclass modules to register plans that can be retrieved via `specialistUses.plan(actor, name)`, `specialistUses.plan` must look into the registered plans registry or a shared map (`ALL_PLANS`), rather than exclusively into the statically defined `CORE_PLANS`.
- **`ak5e/scripts/specialist-sheet.mjs`**:
  - Injects `.ak5e-specialist-sheet-panel` into `.tab[data-tab="features"]` and header buttons.
  - Line 55: `getDeathmarkStateText(actor)` currently reads `actor.flags?.ak5e?.executor?.deathmark`.
  - Lines 146–154: Contains placeholder for Executor actions in `openSpecialistControls(actor)`.
- **`ak5e/scripts/ak5e.mjs`**:
  - Lines 278–305: Exposes `game.ak5e.specialist`.
  - Line 435: Calls `registerSpecialistHooks()`.
  - Line 436: Registers chat message relay for `specialistUses.handleRelay`.
  - Line 437: Calls `registerSpecialistSheetHooks()`.
- **`ak5e/scripts/trigger-events.mjs`**:
  - Dispatches `onAk5eEvent(kind, handler)` for `"attack"`, `"hit"`, `"crit"`, `"hitTaken"`, `"kill"`, `"turnStart"`, `"turnEnd"`, `"initiative"`, `"combatEnd"`.
  - Line 249: Emits `"kill"` when target drops from >0 HP to <=0 HP.
  - Line 281: Emits `"turnStart"` and `"turnEnd"`.
- **Unit Test Suite**:
  - Command: `node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-adversarial.test.mjs`
  - Result: 48 tests passing (exit code 0).

---

## 2. Logic Chain

From the above observations, the complete design for Milestone 2 is organized into four interconnected modules:

```
┌─────────────────────────────────────────────────────────────┐
│             ak5e/scripts/executor-features.mjs              │
│  - Actor State Model: flags.ak5e.executor                   │
│  - Helper predicates & state mutators                       │
│  - dnd5e & onAk5eEvent Hook Registrations                   │
└──────────────────────────────┬──────────────────────────────┘
                               │ registers EXECUTOR_PLANS
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              ak5e/scripts/specialist-uses.mjs               │
│  - Dynamic plan lookup (CORE_PLANS + Subclass plans)        │
│  - 8 Executor Table-Play Plans adhering to WORKFLOW §3.2    │
│  - Unresolved readings (deathmark transfer & mortal blow)   │
└──────────────────────────────┬──────────────────────────────┘
                               │ exposes UI controls
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             ak5e/scripts/specialist-sheet.mjs               │
│  - Subclass Badge: Deathmark: Held/Marked (Path)            │
│  - Interactive action controls & confirmPlayUse routing     │
└──────────────────────────────┬──────────────────────────────┘
                               │ verified by
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 ak5e/test/executor.test.mjs                 │
│  - Comprehensive 12-area test suite with in-memory fixtures │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 State Model on Actor (`flags.ak5e.executor`)

Stored under `flags.ak5e.executor` with structured fields:
```json
{
  "path": "hunter", // "hunter" | "bodyguard" | null
  "deathmark": {
    "held": true, // true if currently held by self
    "holder": "self", // "self" | "target" | null
    "targetUuid": null, // actor UUID of marked creature when holder === "target"
    "targetName": null, // string display name of marked creature
    "transferredTurn": null, // combat turn key "combatId:round:turn" when transferred
    "attackedOrDamagedThisTurn": false // tracked during combat turn for return condition
  },
  "sweeper": {
    "active": false, // true while Sweeper action is active
    "reachBonus": 5, // reach bonus in feet
    "attackedUuids": [] // list of UUIDs attacked during current Sweeper action
  },
  "smokescreen": {
    "active": false,
    "expiresRound": null,
    "expiresTurn": null
  },
  "prowessTriggers": {
    "zeroHpThisTurn": false // true if marked 0 HP prowess was awarded this turn (max 1/turn)
  }
}
```

### 2.2 Exported Functions and Predicates (`ak5e/scripts/executor-features.mjs`)
1. **Predicates**:
   - `isExecutor(actor)`: re-exports `isExecutor` from `specialist-rules.mjs`.
   - `getExecutorPath(actor)`: returns `"hunter" | "bodyguard" | null`. Inspects `flag(actor, "executor")?.path`, fallback to `flag(actor, "specialistProgression")?.choices?.executorPath`, and subclass item flags/name.
   - `setExecutorPath(actor, path)`: updates `flags.ak5e.executor.path = path`.
   - `hasInEveryShadow(actor)`: `specialistLevel(actor) >= 5`.
   - `hasSweeper(actor)`: `specialistLevel(actor) >= 5 && getExecutorPath(actor) === "hunter"`.
   - `hasSmokescreen(actor)`: `specialistLevel(actor) >= 5 && getExecutorPath(actor) === "bodyguard"`.
   - `hasPreysense(actor)`: `specialistLevel(actor) >= 11 && getExecutorPath(actor) === "hunter"`.
   - `hasDangersense(actor)`: `specialistLevel(actor) >= 11 && getExecutorPath(actor) === "bodyguard"`.
   - `hasInForTheKill(actor)`: `specialistLevel(actor) >= 15 && getExecutorPath(actor) === "hunter"`.
   - `hasBladeShield(actor)`: `specialistLevel(actor) >= 15 && getExecutorPath(actor) === "bodyguard"`.
   - `hasMortalBlow(actor)`: `specialistLevel(actor) >= 20 && getExecutorPath(actor) === "hunter"`.
   - `hasUltimateSwordAndShield(actor)`: `specialistLevel(actor) >= 20 && getExecutorPath(actor) === "bodyguard"`.

2. **Deathmark State Manipulators**:
   - `getDeathmarkState(actor)`: returns `{ held: boolean, holder: "self" | "target" | null, targetUuid: string | null, targetName: string | null, transferredTurn: string | null, attackedOrDamagedThisTurn: boolean }`. If no state is initialized on an Executor, defaults to `held: true, holder: "self"`.
   - `setDeathmark(actor, target, { combatTurnKey = null } = {})`: sets `flags.ak5e.executor.deathmark = { held: false, holder: "target", targetUuid: target.uuid, targetName: target.name, transferredTurn: combatTurnKey, attackedOrDamagedThisTurn: true }`. If Hunter Level >= 15 (`hasInForTheKill`), also tags target with Vulnerability to Specialist's attacks until turn end.
   - `recallDeathmark(actor)`: resets `flags.ak5e.executor.deathmark = { held: true, holder: "self", targetUuid: null, targetName: null, transferredTurn: null, attackedOrDamagedThisTurn: false }`. Grants 3 Skill Points (SP) and grants Disengage Reaction opportunity.
   - `clearDeathmark(actor)`: resets Deathmark to default held state.

3. **Formula Helpers**:
   - `calculateDeathmarkDamageBonus(level)`: returns `"1d4"` (Lv 1–6), `"2d4"` (Lv 7–13), `"3d4"` (Lv 14–20).

4. **Resource Pools**:
   - `defineExecutorPools()`: defines `mortalBlow` pool:
     ```js
     definePool({
       id: "mortalBlow",
       label: "Mortal Blow",
       max: 1,
       initial: "max",
       classId: SPECIALIST_CLASS_ID,
       levelBasis: "classLevel",
       appliesTo: actor => isExecutor(actor) && getExecutorPath(actor) === "hunter" && specialistLevel(actor) >= 20,
       recovery: [{ on: "lr", amount: "toMax" }]
     });
     ```

### 2.3 Hook Registrations (`registerExecutorHooks()`)
1. **`dnd5e.preRollAttackV2(config, dialog, message)`**:
   - If `isExecutor(actor)` and `getExecutorPath(actor) === "hunter"`:
     Inspect targets (`game.user?.targets`). If target matches `getDeathmarkState(actor).targetUuid`, increase Critical Hit Range by 1 (`roll.options.criticalThreshold = (roll.options.criticalThreshold ?? 20) - 1`).
   - If `sweeper.active`: ensure reach check allows +5 ft.
2. **`dnd5e.preRollDamageV2(config, dialog, message)`**:
   - If `isExecutor(actor)`:
     Inspect target against `getDeathmarkState(actor).targetUuid`. If matching, add Deathmark damage bonus formula (`calculateDeathmarkDamageBonus(specialistLevel(actor))`).
   - If `hasPreysense(actor)` and attack is critical: add 1 additional weapon damage die to the critical bonus roll (`roll.options.criticalBonusDice = (roll.options.criticalBonusDice ?? 0) + 1`).
   - If target has `inForTheKill` vulnerability: apply damage modifier.
3. **`onAk5eEvent("attack")` / `onAk5eEvent("hit")`**:
   - If `isExecutor(actor)`:
     - If Deathmark is currently held (`holder === "self"`), evaluate transfer timing reading (`onAttackRoll` on `"attack"` vs `onHitOnly` on `"hit"`). If met, transfer Deathmark to the hostile target.
     - If attacking the marked target, mark `attackedOrDamagedThisTurn = true`.
     - Hunter Prowess trigger (Lv 5): If single attack damage >= 30, award 1 Prowess via `recoverPool(actor, 1, "prowess")`.
4. **`onAk5eEvent("crit")`**:
   - If `isExecutor(actor)` and `hasPreysense(actor)`:
     Check target. If living (details.type is not construct/undead), apply `ak5e-bleeding` status condition to target.
5. **`onAk5eEvent("kill")` (0 HP drop)**:
   - Check if victim matches `getDeathmarkState(actor).targetUuid`.
   - If matching:
     - Return Deathmark to Executor (`recallDeathmark(actor)`).
     - Grant 3 Skill Points (SP) (via `game.ak5e?.adjustSkillPoints` or state update).
     - Provide Disengage Reaction notice.
     - Prowess gain trigger (1/turn): if `!prowessTriggers.zeroHpThisTurn`, award 1 Prowess and set `prowessTriggers.zeroHpThisTurn = true`.
6. **`onAk5eEvent("turnStart")`**:
   - If `isExecutor(actor)`:
     - Reset `prowessTriggers.zeroHpThisTurn = false`.
     - Reset `deathmark.attackedOrDamagedThisTurn = false`.
     - In combat: If Deathmark is held (`holder === "self"`), grant 3 Skill Points (SP) at turn start.
7. **`onAk5eEvent("turnEnd")`**:
   - If `isExecutor(actor)`:
     - If Deathmark is on a target (`holder === "target"`) and `!attackedOrDamagedThisTurn`:
       Return Deathmark to Executor (`recallDeathmark(actor)`), granting 3 SP and Disengage Reaction notice.
     - If Sweeper was active, end Sweeper and return Deathmark to Executor.
     - Bodyguard Prowess trigger (Lv 5): At the end of an allied creature's turn, if they were attacked while within 10 ft of Bodyguard but took 0 damage that turn, award 1 Prowess.

### 2.4 Integration into `ak5e/scripts/specialist-uses.mjs`

To resolve the limitation where `specialistUses.plan()` previously only checked `CORE_PLANS`, `specialist-uses.mjs` will maintain an `ALL_PLANS` registry:
```javascript
const ALL_PLANS = { ...CORE_PLANS };
const rawRegister = specialistUses.register.bind(specialistUses);
specialistUses.register = function(options = {}) {
  if (options.plans) Object.assign(ALL_PLANS, options.plans);
  return rawRegister(options);
};
specialistUses.plan = function(actor, name, data = {}) {
  const planFn = ALL_PLANS[name];
  need(planFn, `Unknown Specialist plan ${name}.`);
  const state = specialistUses.state(actor);
  const plan = planFn(actor, state, data);
  if (plan.warnings?.length) {
    requireOverrides(plan.warnings, data.overrides ?? data.overridden);
  }
  return plan;
};
```

#### The 8 Executor Table-Play Plans:
1. **`transferDeathmark(actor, state, data)`**:
   - *Prerequisites*: `isExecutor(actor)`.
   - *Data*: `{ targetUuid, targetName }`.
   - *Warnings*: Missing targetUuid; target is self.
   - *Apply*: Updates `flags.ak5e.executor.deathmark` to `{ held: false, holder: "target", targetUuid, targetName, transferredTurn: currentTurnKey }`. If Hunter Lv >= 15, applies `inForTheKill` vulnerability tag to target via `receipt.targets.push()`.
   - *ValidateTarget*: `validateTarget(source, receipt, entry, target)` returns `entry.uuid === target.uuid`.
   - *Summary*: `${actor.name} transfers Deathmark to ${targetName}.`
2. **`recallDeathmark(actor, state, data)`**:
   - *Prerequisites*: `isExecutor(actor)`.
   - *Warnings*: Warns if Deathmark is already held (`"alreadyHeld"`).
   - *Apply*: Updates `flags.ak5e.executor.deathmark` to `{ held: true, holder: "self", targetUuid: null, targetName: null }`. Grants 3 SP.
   - *Summary*: `${actor.name} recalls Deathmark to themselves, gaining 3 SP and a Reaction Disengage opportunity.`
3. **`sweeper(actor, state, data)`**:
   - *Prerequisites*: `isExecutor(actor)` and `getExecutorPath(actor) === "hunter"`.
   - *Warnings*: Level < 5; must be Hiding or Invisible; Prowess shortfall if pool < 1.
   - *Apply*: Spends 1 Prowess (clamped at 0). Sets `flags.ak5e.executor.sweeper = { active: true, reachBonus: 5 }`.
   - *Summary*: `${actor.name} expends 1 Prowess for Sweeper: Reach +5 ft, make Melee Attack against each chosen creature within Reach; hits transfer Deathmark; Deathmark returns at action end.`
4. **`smokescreen(actor, state, data)`**:
   - *Prerequisites*: `isExecutor(actor)` and `getExecutorPath(actor) === "bodyguard"`.
   - *Warnings*: Level < 5; Prowess shortfall if pool < 1; Reaction available.
   - *Apply*: Spends 1 Prowess (clamped at 0). Spends 1 Reaction (`receipt.reaction = { requested: true, triggerId: ... }`).
   - *Summary*: `${actor.name} expends 1 Prowess and 1 Reaction to create 10-ft radius magical darkness smoke centered at feet (lasting until end of next turn). ${data.allyName ? `${data.allyName} may use Reaction to move up to their Speed.` : ""}`
5. **`mortalBlow(actor, state, data)`**:
   - *Prerequisites*: `isExecutor(actor)` and `getExecutorPath(actor) === "hunter"`.
   - *Warnings*: Level < 20; 1/LR usage (`resourceValue(actor, { pool: "mortalBlow" }) < 1`); target within Speed.
   - *Reading*: `mortalBlowReading` (`bypassDRResist` vs `bypassAll`).
   - *Apply*: Spends 1 use of `mortalBlow`. Teleports within 5 ft of target. Target makes DEX Save vs `martialDC(actor)`.
   - *Rolls Card*: `formula: "10d8"`, `rollLabel: "Mortal Blow HP Loss"`. On failed save: loses rolled amount; on success: loses half. Doubled if target has `bleeding`.
   - *ValidateTarget*: Validates target for GM relay.
   - *Summary*: `${actor.name} strikes with Mortal Blow against ${data.targetName} (DEX save DC ${martialDC(actor)}).`
6. **`bladeShield(actor, state, data)`**:
   - *Prerequisites*: `isExecutor(actor)` and `getExecutorPath(actor) === "bodyguard"`.
   - *Warnings*: Level < 15; Reaction available (if Level < 20; free at Lv 20); marked creature within reach.
   - *Apply*: If Level < 20, spends Reaction. At Level 20, costs 0 Reaction. Interactive weapon attack roll. On hit, subtracts PB (`pbForLevel(specialistLevel(actor))`) from creature's Attack Roll.
   - *Summary*: `${actor.name} activates Blade Shield${level >= 20 ? " (free Reaction via Ultimate Sword and Shield)" : ""}. On hit, subtracts ${pbForLevel(specialistLevel(actor))} from enemy attack roll.`
7. **`attackRedirection(actor, state, data)`**:
   - *Prerequisites*: `isExecutor(actor)` and `getExecutorPath(actor) === "bodyguard"`.
   - *Warnings*: Hostile creature must have Deathmark; Bodyguard and ally both within reach/range and within 10 ft of each other.
   - *Apply*: No action required. Causes incoming attack to target Bodyguard instead of ally.
   - *Summary*: `${actor.name} redirects an attack from marked creature onto themselves.`
8. **`dangersense(actor, state, data)`**:
   - *Prerequisites*: `isExecutor(actor)` and `getExecutorPath(actor) === "bodyguard"`.
   - *Warnings*: Level < 11; Reaction available; ally within 5 ft subjected to STR/DEX save for half damage.
   - *Apply*: Spends 1 Reaction. Moves Bodyguard and ally together up to half Speed. If moved outside AoE, take 0 damage on success and half on failure.
   - *Summary*: `${actor.name} uses Dangersense (Reaction) to escort ${data.allyName ?? "ally"} up to half Speed out of save AoE.`

#### Readings Registered in `specialist-uses.mjs`:
```javascript
const EXECUTOR_READINGS = {
  deathmarkTransferTiming: {
    label: "Deathmark Transfer Timing",
    options: [
      { value: "onAttackRoll", label: "Transfers immediately when an Attack Roll is made against the target" },
      { value: "onHitOnly", label: "Transfers only when an Attack hits the target" }
    ]
  },
  mortalBlowReading: {
    label: "Mortal Blow HP Loss Application",
    options: [
      { value: "bypassDRResist", label: "Bypasses Damage Reduction and Resistance (standard Hit Point loss)" },
      { value: "bypassAll", label: "Bypasses all damage mitigations and directly subtracts from current Hit Points" }
    ]
  }
};
specialistUses.register({ readings: EXECUTOR_READINGS });
```

### 2.5 Integration into `ak5e/scripts/specialist-sheet.mjs`

1. **Subclass Badge**:
   - Updated `getDeathmarkStateText(actor)`:
     ```javascript
     function getDeathmarkStateText(actor) {
       const state = getDeathmarkState(actor);
       const path = getExecutorPath(actor);
       const pathLabel = path ? (path.charAt(0).toUpperCase() + path.slice(1)) : "Unchosen";
       if (!state.held && state.holder === "target") {
         return `Deathmark: ${state.targetName ? `Marked (${state.targetName})` : "Marked"} [${pathLabel}]`;
       }
       return `Deathmark: Held [${pathLabel}]`;
     }
     ```
   - Injected into `.ak5e-specialist-badges` container with classes `.ak5e-specialist-badge.ak5e-specialist-badge-deathmark`.

2. **Action Controls Dialog (`openSpecialistControls(actor)`)**:
   - Replace placeholder at lines 146–154 with path-sensitive and level-gated controls:
     ```html
     <div class="ak5e-specialist-action-group">
       <h5>Executor Actions (${pathLabel})</h5>
       <div class="ak5e-button-row">
         <button type="button" data-specialist-cmd="transferDeathmark">Transfer Deathmark</button>
         <button type="button" data-specialist-cmd="recallDeathmark">Recall Deathmark</button>
         ${path === "hunter" && level >= 5 ? `<button type="button" data-specialist-cmd="sweeper">Sweeper (1 Prowess)</button>` : ""}
         ${path === "hunter" && level >= 20 ? `<button type="button" data-specialist-cmd="mortalBlow">Mortal Blow (1/LR, 10d8)</button>` : ""}
         ${path === "bodyguard" ? `<button type="button" data-specialist-cmd="attackRedirection">Attack Redirection (10 ft)</button>` : ""}
         ${path === "bodyguard" && level >= 5 ? `<button type="button" data-specialist-cmd="smokescreen">Smokescreen (1 Prowess Reaction)</button>` : ""}
         ${path === "bodyguard" && level >= 11 ? `<button type="button" data-specialist-cmd="dangersense">Dangersense (Reaction)</button>` : ""}
         ${path === "bodyguard" && level >= 15 ? `<button type="button" data-specialist-cmd="bladeShield">Blade Shield (${level >= 20 ? "Free" : "Reaction"})</button>` : ""}
       </div>
     </div>
     ```

3. **Command Handling (`handleSpecialistCommand(actor, cmd)`)**:
   - Routes each new Executor command through `confirmPlayUse`:
     - `transferDeathmark`: gathers target from `game.user?.targets`, prompts confirmation, runs `specialistUses.command(actor, "transferDeathmark", ...)`.
     - `recallDeathmark`: prompts confirmation, runs `specialistUses.command(actor, "recallDeathmark", ...)`.
     - `sweeper`: prompts confirmation, runs `specialistUses.command(actor, "sweeper", ...)`.
     - `smokescreen`: prompts confirmation, runs `specialistUses.command(actor, "smokescreen", ...)`.
     - `mortalBlow`: prompts confirmation, runs `specialistUses.command(actor, "mortalBlow", ...)`.
     - `bladeShield`: prompts confirmation, runs `specialistUses.command(actor, "bladeShield", ...)`.
     - `attackRedirection`: prompts confirmation, runs `specialistUses.command(actor, "attackRedirection", ...)`.
     - `dangersense`: prompts confirmation, runs `specialistUses.command(actor, "dangersense", ...)`.

### 2.6 Test Architecture for `ak5e/test/executor.test.mjs`

Using the proven in-memory testing infrastructure in `ak5e/test/base-classes-fixture.mjs`:
- Setup:
  ```javascript
  import test from "node:test";
  import assert from "node:assert/strict";
  import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem, createTestCombat } from "./base-classes-fixture.mjs";
  import { isExecutor, getExecutorPath, getDeathmarkState, setDeathmark, recallDeathmark, calculateDeathmarkDamageBonus, registerExecutorHooks } from "../scripts/executor-features.mjs";
  import { specialistUses } from "../scripts/specialist-uses.mjs";
  ```
- Detailed Test Areas (Matrix of 12 Test Groups):
  1. **Executor Identification & Path Choice**:
     - `isExecutor(actor)` returns true with subclass item or branch flag.
     - `getExecutorPath(actor)` resolves `"hunter"` and `"bodyguard"` correctly.
     - Initial Deathmark state: `held === true`, `holder === "self"`.
  2. **Deathmark Transfer & Recall**:
     - `transferDeathmark` command moves Deathmark to target (`held === false`, `holder === "target"`).
     - `recallDeathmark` command returns Deathmark to self, awards 3 SP, and creates undo receipt.
  3. **Combat SP & Disengage Reaction**:
     - Turn start with held Deathmark awards 3 SP.
     - Recall/return of Deathmark awards 3 SP and logs Reaction Disengage reminder.
  4. **Damage Bonus Scaling**:
     - `calculateDeathmarkDamageBonus(level)`: +1d4 at Lv 1–6, +2d4 at Lv 7–13, +3d4 at Lv 14–20.
     - Verify `dnd5e.preRollDamageV2` adds bonus formula when hitting marked target.
  5. **Hunter Crit Range (+1) & Bodyguard Attack Redirection**:
     - Hunter attack vs marked creature lowers `criticalThreshold` by 1.
     - Bodyguard `attackRedirection` redirects attack to self within 10 ft without expending actions.
  6. **Level 5: In Every Shadow**:
     - Climbing and swimming speeds equal walking speed.
     - Stealth proficiency grants expertise.
  7. **Level 5: Sweeper (Hunter)**:
     - 1 Prowess spend, +5 ft reach, multi-creature attack cycle.
     - Marks hit creatures and returns Deathmark to self at action end.
     - Shortfall warning and 0-clamp override verification.
  8. **Level 5: Smokescreen (Bodyguard)**:
     - 1 Prowess spend, 1 Reaction spend, 10 ft magical darkness smoke.
     - Ally reaction move authorization.
  9. **Prowess Gain Triggers**:
     - Marked creature drops to 0 HP: +1 Prowess (once per turn limit enforced).
     - Hunter single attack damage >= 30: +1 Prowess awarded.
     - Bodyguard ally within 10 ft attacked taking 0 damage: +1 Prowess awarded.
  10. **Level 11: Preysense (Hunter) & Dangersense (Bodyguard)**:
      - Preysense: +1 damage die on critical hit; inflicts `bleeding` condition on living targets.
      - Dangersense: Reaction move up to half speed with ally out of save AoE; 0 dmg on save pass, half on fail.
  11. **Level 15: In for the Kill (Hunter) & Blade Shield (Bodyguard)**:
      - In for the Kill: Target gains Vulnerability to Specialist's attacks until turn end on mark transfer.
      - Blade Shield: Reaction weapon attack vs marked attacker; on hit subtracts PB from attack roll.
  12. **Level 20: Mortal Blow (Hunter) & Ultimate Sword and Shield (Bodyguard)**:
      - Mortal Blow: 1/LR Action, 10d8 interactive roll card, DEX save vs Martial DC, doubled on Bleeding, bypasses DR/Resistance.
      - Ultimate Sword and Shield: Resistance to all damage from marked creature, free Blade Shield (costs 0 reaction), reaction transfer on ally attack within 10 ft.
  13. **Full Undo Reversibility (WORKFLOW §3.2)**:
      - Undo for `transferDeathmark`, `recallDeathmark`, `sweeper`, `smokescreen`, `mortalBlow`, and `bladeShield` cleanly reverts all resources, reactions, and flags to prior state.

---

## 3. Caveats

1. **Unresolved Reading 1: Deathmark Transfer Timing (`deathmarkTransferTiming`)**:
   - The source text states: "you can transfer your Deathmark from yourself to a hostile Creature by making an Attack against them."
   - In 5e rules, "making an attack" occurs upon declaring an attack roll, whereas table convention often plays it as "on hit". Both options (`onAttackRoll` and `onHitOnly`) are supported in `specialistUses.readings()`, defaulting to `onAttackRoll`.
2. **Unresolved Reading 2: Mortal Blow HP Loss Application (`mortalBlowReading`)**:
   - The source text states: "that Creature loses Hit Points equal to the amount rolled".
   - In 5e mechanics, losing Hit Points is not damage, bypassing Damage Reduction and Resistance. Whether temporary HP can absorb it is ambiguous. Both options (`bypassDRResist` and `bypassAll`) are supported in `specialistUses.readings()`, defaulting to `bypassDRResist`.
3. **Skill Point (SP) Integration**:
   - Operator Skills use an in-memory SP tracker via `game.ak5e?.adjustSkillPoints` or Actor flags. In headless/mock unit tests where `game.ak5e` is simulated, the SP grant is recorded on the use receipt and updates `flags.ak5e.operatorSkill.points`.
4. **Scope Separation**:
   - As a read-only exploration agent, no production or test files have been modified. All architecture and test specifications in this report are complete and ready for implementation by the implementer agent.

---

## 4. Conclusion

The architectural design for Milestone 2 (Executor Subclass) is fully specified and grounded in the source book (Chapter 3 L5498–5578) and existing codebase patterns (`specialist-rules.mjs`, `specialist-features.mjs`, `specialist-uses.mjs`, `centurion-features.mjs`, `play-uses.mjs`):
1. `ak5e/scripts/executor-features.mjs` will house the Actor state model under `flags.ak5e.executor`, all predicate and formula helpers, and hooks for attack rolls, damage calculations, crits, kills, turn start/end, and reactions.
2. `ak5e/scripts/specialist-uses.mjs` will register 8 table-play plans (`transferDeathmark`, `recallDeathmark`, `sweeper`, `smokescreen`, `mortalBlow`, `bladeShield`, `attackRedirection`, `dangersense`) adhering strictly to WORKFLOW §3.2 with confirmations, shortfall overrides, interactive roll buttons (10d8 Mortal Blow), GM relay with `validateTarget`, and reversible encounter-window undo receipts.
3. `ak5e/scripts/specialist-sheet.mjs` will display dynamic subclass badges (`Deathmark: Held/Marked (Path)`) and expose path-sensitive interactive controls in `openSpecialistControls`.
4. `ak5e/test/executor.test.mjs` will provide full automated unit and adversarial coverage across all 12 functional areas with 100% assertion rigor.

---

## 5. Verification Method

To independently verify the implementation once coded:

1. **Target Subclass Unit Tests**:
   ```bash
   node --test ak5e/test/executor.test.mjs
   ```
2. **Specialist Class Regression Suite**:
   ```bash
   node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs
   ```
3. **Repository Static Validation**:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
4. **Invalidation Conditions**:
   - Any test failure in `executor.test.mjs` or regression in existing 48 specialist tests.
   - Any auto-rolled dice in active abilities (must use interactive chat card roll buttons).
   - Any blocking prerequisite warnings that cannot be bypassed with "Use anyway".
   - Any failure of encounter-window undo receipts to restore prior resource or reaction states.
   - Any unhandled exceptions or console errors during hook execution.
