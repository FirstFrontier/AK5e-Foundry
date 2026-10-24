# AK5e Foundry VTT — Test Track Infrastructure & Architecture

This document defines the automated test architecture, test tiers, fixture contracts, runner commands, and feature checklists for the four base character classes (**Vanguard**, **Supporter**, **Specialist**, and **Medic**) in the AK5e 1st Edition v1.3.1 content module on Foundry VTT Version 13 and the D&D5e system.

---

## 1. Test Architecture & Principles

The testing framework is built on Node.js's native test runner (`node --test` with `node:assert/strict`), operating against high-fidelity in-memory Foundry document and environment mocks.

### Core Principles
1. **Source Rules Authority:** All formulas, hit dice, proficiency matrices, pool steps, and feature mechanics adhere strictly to `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`.
2. **Table-Play Philosophy (WORKFLOW §3.2):**
   - **Confirm Before Use:** Every active feature activation displays a confirmation dialog before mutating actor state or spending resources. Canceling changes zero state.
   - **No Auto-Rolled Dice:** Player attack, damage, healing, and saving throw dice are never automatically rolled. Chat cards render interactive roll buttons clicked by the document owner or GM.
   - **Warnings & Zero-Clamping:** Non-blocking warnings (range, timing, resource shortfall) can be overridden with "Use anyway". Resource pools clamp at zero on manual override and broadcast shortfall text publicly on chat cards.
   - **Automatic GM Relay:** Modifications to unowned target documents (healing, temporary HP, active effects) relay automatically through the active GM socket without requiring manual human GM approval dialogs.
   - **Encounter-Window Undo:** Every operation records a granular undo receipt under `flags.ak5e.<ns>.undo`, enabling clean reversal within the active combat epoch.
3. **Strict Progression Idempotency:** Re-running character setup or progression multiple times preserves authored items, talent choices, and hit point totals without creating duplicate items or inflating stats.

---

## 2. Four-Tier Testing Methodology

To guarantee complete behavioral coverage and eliminate regressions, test suites for each class are structured into four rigorous testing tiers:

```
┌────────────────────────────────────────────────────────┐
│  Tier 4: Real-World Scenarios (End-to-End Table Play) │
├────────────────────────────────────────────────────────┤
│  Tier 3: Multi-Feature & System Combinations          │
├────────────────────────────────────────────────────────┤
│  Tier 2: Boundary & Edge Cases (>=5 per feature)       │
├────────────────────────────────────────────────────────┤
│  Tier 1: Feature Coverage (>=5 per feature)           │
└────────────────────────────────────────────────────────┘
```

### Tier 1: Feature Coverage (>= 5 Tests per Feature)
Validates standard functional execution, positive paths, and source rules formulas:
- **Baseline Calculations:** Hit dice, base HP (`HD + CON`), higher-level HP gains, proficiency bonus progression, ability modifiers.
- **Level Gates & Unlocks:** Features activate at their exact source levels (e.g. Extra Attack at Lv 5, Weapon Adept at Lv 6, Directed Engagement at Lv 15, Lightspeed at Lv 18).
- **Resource Pool Maximums:** Evaluates formula string or step table maxima (e.g. `@prof` for Specialist Prowess; INT/WIS/CHA mod for Supporter Aid Dice; 20–170 step table for Medic Life Support).
- **Standard Action Execution:** Successful spends, valid targets, chat card generation, and un-evaluated roll formula attachment.
- **Rest Recovery:** Short rest recovery and long rest full restoration according to source specifications.

### Tier 2: Boundary & Edge Cases (>= 5 Tests per Feature)
Stresses mechanical limits, negative paths, invalid inputs, and security gates:
- **Resource Depletion & Shortfalls:** Spends with 0 available resources; manual "Use anyway" overrides clamping exactly at 0; public chat card shortfall badges.
- **Range & Visibility Limits:** Targets beyond maximum range (e.g. >60 ft for Tip of the Spear or Provide Aid, >touch for Touch Heal); line-of-sight checks.
- **Invalid Targets & Creature Types:** Invalid targets (e.g. Constructs attempting to receive healing from features lacking construct exceptions).
- **Cancellation & State Purity:** Canceling a prompt or dialog aborts immediately and commits zero document writes or resource deductions.
- **Progression Idempotency:** Re-running `apply<Class>Setup` or `apply<Class>Progression` multiple times on the same actor produces identical state with zero duplicate embedded items.

### Tier 3: Multi-Feature & System Combinations
Validates emergent interactions across multiple subsystems within a class and across rest/combat cycles:
- **Feature Rider Synergies:**
  - Vanguard: Landstrider Nimble condition + Tip of the Spear additive THP across multiple turns.
  - Supporter: Provide Aid + Advanced Aid riders (attack crit range, skill advantage, damage splash, save THP) + Lighten the Load reaction chaining.
  - Specialist: Weapon Specialisation (Melee vs Ranged) + Weapon Adept + Prowess expenditure on failed skill checks.
  - Medic: Touch Heal 1:1 conversion + Preserver die rerolls + Urgency of Treatment AP reduction.
- **Combat & Rest Transitions:** Multi-turn combat lifecycles (`turnStart`, `turnEnd`, `initiative`, `combatEnd`) interacting with rest recovery triggers (`sr`, `lr`).
- **Concurrent Operations & Serial Queue:** Multiple rapid actions on a single actor serialized by `keyedSerial` without lost updates or race conditions.

### Tier 4: Real-World Table-Play Scenarios
Simulates complete encounter workflows as played at virtual tables:
- **Round 1 Alpha Strike & Setup:** Initiative rolls with bonuses (e.g. Vanguard Quick off the Mark), opening moves, bonus action aids, and active stances.
- **Target HP & Resource Synchronization:** Player triggers healing or buffs on an ally token; socket relay executes target update on GM client; target sheet reflects updated HP; chat card renders undo button.
- **Dice Evaluation Flow:** Chat card generated in `awaitingRoll` state; player clicks interactive "Roll" button; card updates with evaluated result without auto-rolling.
- **Encounter-Window Undo:** Player or GM clicks "Undo" button on chat card; confirmation dialog displays restored values; target HP, actor resources, reactions, and flags revert cleanly to pre-action state.

---

## 3. Mocking Infrastructure (`ak5e/test/base-classes-fixture.mjs`)

The testing harness provides lightweight, high-fidelity in-memory Foundry VTT mocks designed for fast, isolated, deterministic execution:

### Exported Functions & Classes
| Export | Description |
|---|---|
| `setupFoundryGlobals(options)` | Instantiates `globalThis.game`, `foundry`, `Hooks`, `ChatMessage`, `ui`, `CONFIG`, and `Roll`. Returns execution context. |
| `teardownFoundryGlobals()` | Restores original global state cleanly to prevent test pollution. |
| `createTestActor(data)` | Creates an in-memory Actor mock with `flags.ak5e`, `system.abilities`, `system.attributes`, `items`, and `effects`. |
| `createTestItem(data, parent)` | Creates an in-memory Item document mock with update, flag, and delete helpers. |
| `TestCollection` | Extends `Map` with Collection array helpers: `find()`, `filter()`, `map()`, `some()`, `every()`. |
| `setPropertyByPath(object, path, value)` | Dotted-path merger supporting `-=` key deletion and `==` force-replace keys. |
| `getPropertyByPath(object, path)` | Dotted-path property resolver. |
| `triggerShortRest(actor, options)` | Simulates `dnd5e.restCompleted` hook call for short rest (`recoverPeriods: ["sr"]`). |
| `triggerLongRest(actor, options)` | Simulates `dnd5e.restCompleted` hook call for long rest (`recoverPeriods: ["lr", "sr"]`). |
| `createTestCombat(actors, options)` | Simulates Foundry Combat document for combat hooks (`turnStart`, `turnEnd`, `combatEnd`). |
| `world(combat)` | Compatibility alias returning test document registry Map. |
| `fixture(options)` | Compatibility alias returning `createTestActor(options)`. |

### Document Mock Contracts
- **Actor Methods:**
  - `update(changes, options)`: Records writes in `actor.writes` and applies dotted path changes.
  - `createEmbeddedDocuments(type, entries)`: Instantiates embedded items/effects, assigns unique IDs, registers in `actor.items` / `actor.effects`, and tracks in `actor.created`.
  - `deleteEmbeddedDocuments(type, ids)`: Deletes embedded items from collections and unregisters UUIDs.
  - `getFlag(scope, key)`, `setFlag(scope, key, val)`, `unsetFlag(scope, key)`.
  - `testUserPermission(user, permission)`: Checks user ownership or GM status.
  - `getRollData()`: Returns abilities, attributes, prof, and flags.

---

## 4. Test Runner Commands & Pass/Fail Semantics

### Focused Unit Test Runners
```bash
# Vanguard test suite (rules, features, progression, tip-of-the-spear, standard-bearer)
npm run test:vanguard

# Supporter test suite (rules, features, progression, provide-aid, aid-dice)
npm run test:supporter

# Specialist test suite (rules, features, progression, prowess, combat-styles)
npm run test:specialist

# Medic test suite (rules, features, progression, life-support, touch-heal)
npm run test:medic

# Combined base classes test runner
npm run test:base-classes
```

### Static Analysis & Rules Verification
```bash
# Validate manifest, language JSON leaves, and syntax across all .mjs files
node ak5e/tools/validate-files.mjs

# Verify compendium records and 100% source coverage against Chapter 1-6 texts
node ak5e/tools/verify-generated-content.mjs

# Ensure generated files match committed state byte-for-byte
node ak5e/tools/check-generated-content.mjs
```

### Headless In-Foundry Live Browser Validation
```bash
# Full Playwright Chromium browser test against disposable Foundry V13 instance on port 30175
/tmp/run-base-classes-live.sh
# or direct script invocation
node ak5e/tools/test-base-classes-live.mjs
```

### Pass/Fail Semantics
- **Exit Code:** Must be `0`. Any non-zero exit code indicates failure.
- **Zero Failures:** 100% of test assertions must pass with 0 failures, 0 skipped/todo tests, and 0 uncaught promise rejections.
- **Log Purity:** No unexpected console errors, unhandled rejections, or memory leaks during test execution.

---

## 5. Base Classes Feature Checklists

### 5.1 Vanguard Checklist
- [ ] **Chassis:** 1d8 Hit Die, 8 + CON base HP, 1d8/5 + CON per level, Light Armor, Light Shields, Light Melee Weapons, Messenger Kit.
- [ ] **Saves & Skills:** DEX save proficiency + choice of STR or CHA; 3 skills from Acrobatics, Athletics, Perception, Persuasion, Stealth, Wilderness.
- [ ] **Landstrider (Lv 1):** +10 ft Walking Speed, attack hit grants Nimble (prevents AoO from hit target).
- [ ] **Tip of the Spear (Lv 1):** 1d6 roll table applied to visible ally within 60 ft; cumulative; #2 additive THP.
- [ ] **Quick off the Mark (Lv 2):** Add Proficiency Bonus to Initiative rolls.
- [ ] **Extra Attack (Lv 5):** 2 attacks on Attack action.
- [ ] **Uncanny Dodge (Lv 11):** Reaction to halve damage from seen attacker.
- [ ] **Directed Engagement (Lv 15):** Reaction to choose Tip of the Spear outcome instead of rolling.
- [ ] **Lightspeed (Lv 18):** Second turn in Round 1 of combat at Initiative - 10.
- [ ] **Approaching Storm (Lv 20):** +floor(Level / 2) damage on damage rolls in Round 1.
- [ ] **Progression Engine:** Idempotent level 1–20 feature setup with deterministic `contextKey` hashing.
- [ ] **Table-Play Uses:** Confirmation dialogs, warnings, zero-clamped shortfall cards, GM relay, and undo receipts.

### 5.2 Supporter Checklist
- [ ] **Chassis:** 1d6 Hit Die, 6 + CON base HP, 1d6/4 + CON per level, Light Armor, Light Shields, Light Melee Weapons, 1 Tool Kit/Vehicle.
- [ ] **Saves & Skills:** 2 saving throws from CON, CHA, WIS; 3 skills from Arts, Lore, Tech, Insight, Deception, Persuasion.
- [ ] **Aid Die Pool (Lv 1):** `aidDie` pool: max = chosen ability mod (INT, WIS, or CHA); Long Rest recovery.
- [ ] **Provide Aid (Lv 1):** Bonus Action grant Aid Die (d8 -> d10 at Lv 7 -> d12 at Lv 14) to ally within 60 ft for 10 minutes.
- [ ] **Advanced Aid (Lv 5):** Riders when Aid Die rolled: Attack (Crit +1), Skill (roll twice, pick higher), Save (THP = roll + PB), Damage (10-ft splash Force damage), Healing (matching THP).
- [ ] **Lighten the Load (Lv 11):** Reaction on ally rolling Aid Die: grant free Aid Die to another ally without expending pool.
- [ ] **Ever Reliable (Lv 15):** Turn start regain 1 Aid Die if pool is empty; Short Rest recover ceil(max / 2).
- [ ] **Self-Supportive (Lv 18):** Turn start grant personal Aid Die.
- [ ] **Will Into Being (Lv 20):** Add Proficiency Bonus to any Aid Die rolled.
- [ ] **Progression Engine:** Idempotent level 1–20 feature setup with deterministic `contextKey` hashing.
- [ ] **Table-Play Uses:** Confirmation dialogs, warnings, zero-clamped shortfall cards, GM relay, and undo receipts.

### 5.3 Specialist Checklist
- [ ] **Chassis:** 1d8 Hit Die, 8 + CON base HP, 1d8/5 + CON per level, Light/Medium Armor, Light Shields, Light Melee/Ranged, 2 Tools.
- [ ] **Saves & Skills:** DEX save proficiency + choice of WIS or CHA; 3 skills from Acrobatics, Sleight of Hand, Stealth, Tech, Perception, Wilderness.
- [ ] **Weapon Specialisation (Lv 1):** Choice of Melee Combat (8 styles) or Ranged Combat (7 styles).
- [ ] **Show Your Style & Prowess (Lv 2):** `prowess` pool (max = PB, +1 on SR/LR); Mark of a Specialist check reroll with refund on repeated failure.
- [ ] **Weapon Adept (Lv 6):** Extra attack + damage reroll 1-2 (Melee) or attack reroll 1 (Ranged).
- [ ] **Weapon Expertise (Lv 12):** Crit +1 / bonus damage die (Melee) vs 3d20 keep highest / advantage (Ranged).
- [ ] **Falling Upwards / It's All Skill (Lv 17):** Reaction before saving throw roll: spend 3 Prowess to auto-succeed.
- [ ] **Weapon Mastery (Lv 18):** Once/turn hit +floor(Level / 2) damage (Melee) vs once/turn double PB attack (Ranged).
- [ ] **Progression Engine:** Idempotent level 1–20 feature setup with deterministic `contextKey` hashing.
- [ ] **Table-Play Uses:** Confirmation dialogs, warnings, zero-clamped shortfall cards, GM relay, and undo receipts.

### 5.4 Medic Checklist
- [ ] **Chassis:** 1d6 Hit Die, 6 + CON base HP, 1d6/4 + CON per level, Light Shields ONLY, Light Melee Weapons, 1 Tool Kit/Vehicle.
- [ ] **Saves & Skills:** 2 saving throws from CON, INT, WIS; Medicine (automatic) + 2 skills from Lore, Arts, Tech, Insight, Perception, Persuasion.
- [ ] **Medical Expertise (Lv 1):** Double proficiency bonus for Medicine skill checks.
- [ ] **Arts Casting (Lv 1):** Healing Arts Special Pool always prepared; AP progression (3 to 35); Max Art Level (1 to 9); INT or WIS casting ability.
- [ ] **Life Support Pool (Lv 1):** `lifeSupport` pool: step table 20 to 170, `overMax: true` permitted, Long Rest recovery.
- [ ] **Touch Heal (Lv 1):** Action spend X Life Support to restore X missing HP (1:1 conversion); Construct warning.
- [ ] **Preserver (Lv 1):** Spend 5 Life Support on healing/THP roll to reroll any number of dice.
- [ ] **Urgency of Treatment (Lv 1):** Spend multiples of 10 Life Support to reduce Healing Art AP cost by 1 per 10 spent.
- [ ] **Self-Defence Protocol (Lv 5):** Learn standard Arts pool <= 5th level; AP cost reduced by 1 (Lv 5) or 2 (Lv 11).
- [ ] **Resuscitation (Lv 12):** 1/Long Rest free Revivify cast.
- [ ] **To Rob the Ferryman (Lv 18):** Revivify restores 3 * Medic Level HP.
- [ ] **Chosen of Asclepius (Lv 20):** Optional maximum value on all healing dice.
- [ ] **Progression Engine:** Idempotent level 1–20 feature setup with deterministic `contextKey` hashing.
- [ ] **Table-Play Uses:** Confirmation dialogs, warnings, zero-clamped shortfall cards, GM relay, and undo receipts.
