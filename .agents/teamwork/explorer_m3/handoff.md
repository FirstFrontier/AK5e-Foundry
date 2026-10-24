# Technical Exploration & Specification Report: Milestone 3 (Supporter Base Class)

## 1. Observation

### 1.1 Source Rules Authority (`AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`)
Direct inspection of Lines 6548–6692 reveals the explicit rules for Supporter:
- **Heading & Flavor (Lines 6548–6554)**: Class name `Supporter`, facilitators and fixers.
- **Features Table (Lines 6555–6579)**:
  ```markdown
  | Level | Proficiency Bonus | Features | Aid Die | 
  |:-----:|:-----------------:|:--------:|:-------:|
  |  1st  |  +2  | Elite 0- Supporter Branch, Provide Aid | d8
  |  2nd  |  +2  | Basic Skill | d8
  |  3rd  |  +2  | Basic Talent | d8
  |  4th  |  +2  | Ability Score Improvement, Branch Feature | d8
  |  5th  |  +3  | Advanced Aid | d8
  |  6th  |  +3  | Ability Score Improvement | d8
  |  7th  |  +3  | Elite 1- Advanced Skill | d10
  |  8th  |  +3  | Ability Score Improvement, Basic Talent Module  | d10
  |  9th  |  +4  | Advanced Talent | d10
  | 10th  |  +4  | Ability Score Improvement, Branch Feature | d10
  | 11th  |  +4  | Lighten the Load | d10
  | 12th  |  +4  | Ability Score Improvement | d10
  | 13th  |  +5  | Branch Feature, Advanced Talent Module | d10
  | 14th  |  +5  | Elite 2- Elite Skill| d12
  | 15th  |  +5  | Ever Reliable | d12
  | 16th  |  +5  | Ability Score Improvement  | d12
  | 17th  |  +6  | Branch Feature | d12
  | 18th  |  +6  | Self-Supportive | d12
  | 19th  |  +6  | Ability Score Improvement |  d12
  | 20th  |  +6  | Will Into Being | d12
  ```
- **Hit Points (Lines 6594–6597)**:
  - Hit Dice: 1d6 per Supporter Level.
  - 1st Level: 6 + Constitution modifier.
  - Higher Levels: 1d6 (or 4) + Constitution modifier per level after 1st.
- **Proficiencies (Lines 6599–6604)**:
  - Armor: Light Armour, Light Shields.
  - Weapons: Light Melee.
  - Tools: A Tool Kit/Vehicle Proficiency of your Choice.
  - Saving Throws: "Choose two from the following: Constitution, Charisma, Wisdom".
  - Skills: "Three from the following: Arts, Lore, Tech, Insight, Deception, Persuasion".
- **Equipment (Lines 6606–6616)**:
  - Option A: 1x Light Melee Weapon; 1x Light Melee Weapon OR 1x Light Shield; Protective Clothing; Two Tool Kits you are Proficient with.
  - Option B: 1300 LMD.
- **Supporter Branches (Lines 6622–6629)**:
  - 5 Branches: Artificer, Bard, Hexer, Ritualist, Summoner.
  - Branch progression levels: 1, 4, 10, 13, 17.
- **Provide Aid (Lines 6630–6639)**:
  - Bonus Action to Provide Aid to another Creature within 60 feet who can see or hear you.
  - Consumes one Aid Die and grants it to that creature.
  - "A Creature can only have one Aid Die at a time."
  - Duration: 10 minutes.
  - Roll usage: "when that Creature makes an Attack Roll, Skill Check, Saving Throw (except Death Saving Throws), Damage Roll, or Healing Roll, they may expend and roll that Aid Dice, adding the number rolled to the total."
  - Number of Uses: "equal to either your Intelligence, Wisdom, or Charisma Modifier (choose when you gain this Feature). You regain all expended uses when you finish a Long Rest."
  - Aid Die Size: "Your Aid Die is a d8. This changes when you reach certain Supporter Levels, as shown in the Aid Die column of the Supporter Features table." (d8 at Lv 1–6, d10 at Lv 7–13, d12 at Lv 14–20).
- **Advanced Aid (Lines 6652–6663)**:
  - When a Creature expends your Aid Die, they gain an additional effect based on benefitting roll:
    - Attack Roll: "The Critical Range of that Attack is increased by 1."
    - Skill Check: "The Creature rolls your Aid Die an additional time, and choose which result they wish to use."
    - Saving Throw: "The Creature can gain Temporary Hit Points equal to the amount rolled on your Aid Die + your Proficiency Bonus."
    - Damage Roll: "When a Creature rolls this Aid Die to increase the Damage they deal, they can choose a different Creature within 10 feet of a Creature they are going to Damage; that additional Creature takes Force Damage equal to the amount rolled on the Aid Die."
    - Healing Roll: "Creatures that recover Hit Points from this Roll can also gain Temporary Hit Points equal to the amount rolled on your Aid Die."
- **Lighten the Load (Lines 6673–6675)**:
  - 11th Level Reaction.
  - Trigger: When a Creature other than yourself within 60 feet of you rolls one of your Aid Die.
  - Action: Use Reaction to choose a different Creature that can hear you, except yourself, within 60 feet and grant them one of your Aid Die without expending any of your Aid Die.
  - Restriction: "You cannot use this Feature on these supplementary Aid Dice."
- **Ever Reliable (Lines 6679–6685)**:
  - 15th Level:
    - Aid Die Regeneration: If your Turn begins and you have no Aid Dice remaining, regain 1 Aid Die.
    - Short Rest Refill: Whenever you finish a Short Rest, recover Aid Dice equal to half of your maximum Aid Dice, rounding up (`Math.ceil(max / 2)`).
- **Self-Supportive (Lines 6686–6688)**:
  - 18th Level: At the beginning of your Turn, gain a special Aid Die; granted automatically to self, cannot be granted to another creature or used by features; expendable as if self were target of Provide Aid.
- **Will Into Being (Lines 6689–6693)**:
  - 20th Level: When a Creature rolls one of your Aid Die, you may add your Proficiency Bonus to the result of that roll.

### 1.2 Module & Database Records (`ak5e/scripts/chapter-three-content.mjs`)
- Class Record: `class-supporter` ("Supporter", `kind: "class"`).
- Core Features in `CHAPTER_THREE_CLASSES`:
  - `class-feature-supporter-1st-level-supporter-branch-925` (Level 1)
  - `class-feature-supporter-1st-level-provide-aid-2284` (Level 1)
  - `class-feature-supporter-2nd-level-basic-operator-skill-3307` (Level 2)
  - `class-feature-supporter-3rd-level-basic-talent-3471` (Level 3)
  - `class-feature-supporter-4th-level-ability-score-improvement-3717` (Level 4)
  - `class-feature-supporter-5th-level-advanced-aid-4035` (Level 5)
  - `class-feature-supporter-7th-level-advanced-operator-skill-5141` (Level 7)
  - `class-feature-supporter-9th-level-advanced-talent-5318` (Level 9)
  - `class-feature-supporter-11th-level-lighten-the-load-5608` (Level 11)
  - `class-feature-supporter-14th-level-elite-operator-skill-6012` (Level 14)
  - `class-feature-supporter-15th-level-ever-reliable-6178` (Level 15)
  - `class-feature-supporter-18th-level-self-supportive-6563` (Level 18)
  - `class-feature-supporter-20th-level-will-into-being-6864` (Level 20)
- Subclass Records:
  - `subclass-supporter-artificer` ("Supporter: Artificer")
  - `subclass-supporter-bard` ("Supporter: Bard")
  - `subclass-supporter-hexer` ("Supporter: Hexer")
  - `subclass-supporter-ritualist` ("Supporter: Ritualist")
  - `subclass-supporter-summoner` ("Supporter: Summoner")
- Talent Records: 28 Supporter talents (`kind: "class-option"`, `parentClass: "Supporter"`), categorized by `classOption.tier === "Basic"` and `"Advanced"`.

### 1.3 Existing Vanguard Baseline & Infrastructure
- `ak5e/scripts/vanguard-rules.mjs`: Pure functional calculations; profile contract adheres to `PROJECT.md`.
- `ak5e/scripts/vanguard-features.mjs`: Feature queries and runtime state manipulation.
- `ak5e/scripts/vanguard-setup.mjs`: Idempotent setup with deterministic `contextKey` hash.
- `ak5e/scripts/vanguard-progression.mjs`: Choice validation, field inspection, HP bounds [1, 8], ASI schemes, idempotent re-run.
- `ak5e/scripts/vanguard-uses.mjs`: `createPlayUses({ ns: "vanguardUses" })` providing warnings, overrides ("Use anyway"), 0-clamping, GM relay, undo receipts.
- `ak5e/test/base-classes-fixture.mjs`: In-memory Foundry mock harness with `createTestActor`, `createTestItem`, `setupFoundryGlobals`, `teardownFoundryGlobals`, `triggerShortRest`, `triggerLongRest`, and `createTestCombat`.
- `package.json`: Contains `"test:supporter": "node --test ak5e/test/supporter-*.test.mjs"`.

---

## 2. Logic Chain

1. **Class Chassis & Formula Derivation**:
   - Hit Dice is 1d6 per Supporter Level (Observation §1.1). Base HP at level 1 is `6 + CON`, and HP gained per level after 1st is `Math.max(1, (mode === "rolled" ? roll : 4) + CON)`.
   - Saving Throws require selecting exactly two from Constitution, Charisma, Wisdom (Observation §1.1). Unlike Vanguard (which has automatic Dexterity), Supporter has NO automatic save; both must be user-selected choices.
   - Skill choices are exactly three from Arts (`arc`), Lore (`ak5elore`), Tech (`ak5etech`), Insight (`ins`), Deception (`dec`), Persuasion (`per`).
   - Starting Equipment allows choosing either item grants (Light Melee Weapon, Light Melee/Shield, Protective Clothing, 2x Tool Kits) or 1300 LMD currency (Observation §1.1).

2. **Aid Die Pool & Scaling Architecture**:
   - Die size scales from d8 (Levels 1–6) to d10 (Levels 7–13) to d12 (Levels 14–20) based on the explicit source table (Observation §1.1, Table L6557–6579 and Text L6639).
   - Maximum Aid Dice: `max` is based on the chosen mental ability modifier (`int`, `wis`, or `cha`), with a fallback/default to the highest mental ability mod on the actor (`Math.max(1, Math.max(intMod, Math.max(wisMod, chaMod)))`).
   - In `resource-pools.mjs`, the max formula string `"max(1, max(@abilities.int.mod, max(@abilities.wis.mod, @abilities.cha.mod)))"` parses cleanly through `compileFormula` and matches the `VARIABLE` regex.
   - Recovery: Base Long Rest full recovery (`{ on: "lr", amount: "full" }`).
   - At Level 15 (Ever Reliable), Short Rest recovery restores `Math.ceil(max / 2)` Aid Dice, and Turn Start restores 1 Aid Die if the pool is at 0.
   - At Level 18 (Self-Supportive), Turn Start grants 1 personal Aid Die (cannot be given away or spent by features).

3. **Table Play Engine Integration (`WORKFLOW.md §3.2`)**:
   - `supporterUses` must be instantiated via `createPlayUses({ ns: "supporterUses", label: "Supporter" })`.
   - `provideAid` plan validates 60-ft range, visibility/hearing, target not already possessing an Aid Die, spends 1 Aid Die (with warning & override if at 0), attaches the `aidDieTag` to target, and relays unowned target changes through the active GM socket.
   - `useAidDie` plan accepts roll category (`attack`, `skill`, `save`, `damage`, `healing`). Interactive roll button on card allows rolling without auto-evaluating dice. Resolves Level 5 Advanced Aid riders and Level 20 Will Into Being bonus (+PB).
   - `lightenTheLoad` plan triggers on ally rolling Aid Die within 60 ft, spends Reaction, and grants a free supplementary Aid Die to a second ally within 60 ft.
   - All operations write reversible undo receipts under `flags.ak5e.supporterUses.undo`.

4. **Progression Idempotency**:
   - Following `vanguard-setup.mjs` and `vanguard-progression.mjs`, all preview calculations must generate a deterministic `contextKey` hash:
     `JSON.stringify([actor.uuid, level, ...])`.
   - Applying setup or progression without confirmation or with a mismatched `contextKey` throws `Error`.
   - Re-running setup or progression on an existing actor does not duplicate items or re-apply HP/ASIs.

---

## 3. Caveats

1. **Aid Die Size Progression (Source Table vs Dispatch Note)**:
   - In the dispatch note, die size was mentioned as "d8 at Lv 1, d10 at Lv 9, d12 at Lv 17".
   - However, the source rules table (Ch. 3 L6557–6579) explicitly specifies:
     - Level 1: `d8`
     - Level 7: `d10` (coinciding with Elite 1- Advanced Skill)
     - Level 14: `d12` (coinciding with Elite 2- Elite Skill)
   - Line 6639 confirms: "Your Aid Die is a d8. This changes when you reach certain Supporter Levels, as shown in the Aid Die column of the Supporter Features table."
   - *Resolution*: Follow the authoritative source table: `d8` (1–6), `d10` (7–13), `d12` (14–20).
2. **Skill List Reconciled**:
   - Dispatch note listed standard 5e skills (Acrobatics, Animal Handling, etc.).
   - Source text (Ch. 3 L6604) explicitly specifies: `Arts, Lore, Tech, Insight, Deception, Persuasion`.
   - *Resolution*: Map to AK5e/D&D5e keys: `Arts` -> `"arc"`, `Lore` -> `"ak5elore"`, `Tech` -> `"ak5etech"`, `Insight` -> `"ins"`, `Deception` -> `"dec"`, `Persuasion` -> `"per"`.
3. **Saving Throw Selection**:
   - Supporter does not have an automatic save (unlike Vanguard's automatic Dexterity). The player chooses **exactly two** from Constitution (`con`), Charisma (`cha`), and Wisdom (`wis`).

---

## 4. Conclusion & Complete Module Specifications

### 4.1 Module 1: `ak5e/scripts/supporter-rules.mjs`
Pure functional calculations with zero database writes and zero Foundry globals at import time:

```javascript
/** Supporter class rules (Ch. 3 L6548–6692).
 * Pure and functional: Hit dice, HP formulas, level step tables, DCs,
 * saving throw options, weapon/armor/tool proficiencies, and profile checks.
 * Zero database writes and zero Foundry globals required at import time.
 */

export const SUPPORTER_CLASS_ID = "class-supporter";

export const SUPPORTER_BRANCH_IDS = Object.freeze({
  "subclass-supporter-artificer": "artificer",
  "subclass-supporter-bard": "bard",
  "subclass-supporter-hexer": "hexer",
  "subclass-supporter-ritualist": "ritualist",
  "subclass-supporter-summoner": "summoner"
});

export const IMPLEMENTED_SUPPORTER_BRANCHES = Object.freeze([
  "artificer",
  "bard",
  "hexer",
  "ritualist",
  "summoner"
]);

export const SUPPORTER_SKILLS = Object.freeze([
  ["Arts", "arc"],
  ["Lore", "ak5elore"],
  ["Tech", "ak5etech"],
  ["Insight", "ins"],
  ["Deception", "dec"],
  ["Persuasion", "per"]
]);

export const SUPPORTER_SAVES = Object.freeze({
  choices: [
    ["Constitution", "con"],
    ["Charisma", "cha"],
    ["Wisdom", "wis"]
  ]
});

export const SUPPORTER_ARMOR_PROFS = Object.freeze(["lgt", "shl"]);
export const SUPPORTER_WEAPON_PROFS = Object.freeze(["Light Melee"]);
export const SUPPORTER_TOOL_CHOICES = Object.freeze(["Tool Kit", "Vehicle"]);

export const ASI_LEVELS = Object.freeze([4, 6, 8, 10, 12, 16, 19]);

export const SUPPORTER_LEVEL_STEPS = Object.freeze({
  1: { level: 1, pb: 2, aidDie: "d8", features: ["Elite 0- Supporter Branch", "Provide Aid"] },
  2: { level: 2, pb: 2, aidDie: "d8", features: ["Basic Skill"] },
  3: { level: 3, pb: 2, aidDie: "d8", features: ["Basic Talent"] },
  4: { level: 4, pb: 2, aidDie: "d8", features: ["Ability Score Improvement", "Branch Feature"] },
  5: { level: 5, pb: 3, aidDie: "d8", features: ["Advanced Aid"] },
  6: { level: 6, pb: 3, aidDie: "d8", features: ["Ability Score Improvement"] },
  7: { level: 7, pb: 3, aidDie: "d10", features: ["Elite 1- Advanced Skill"] },
  8: { level: 8, pb: 3, aidDie: "d10", features: ["Ability Score Improvement", "Basic Talent Module"] },
  9: { level: 9, pb: 4, aidDie: "d10", features: ["Advanced Talent"] },
  10: { level: 10, pb: 4, aidDie: "d10", features: ["Ability Score Improvement", "Branch Feature"] },
  11: { level: 11, pb: 4, aidDie: "d10", features: ["Lighten the Load"] },
  12: { level: 12, pb: 4, aidDie: "d10", features: ["Ability Score Improvement"] },
  13: { level: 13, pb: 5, aidDie: "d10", features: ["Branch Feature", "Advanced Talent Module"] },
  14: { level: 14, pb: 5, aidDie: "d12", features: ["Elite 2- Elite Skill"] },
  15: { level: 15, pb: 5, aidDie: "d12", features: ["Ever Reliable"] },
  16: { level: 16, pb: 5, aidDie: "d12", features: ["Ability Score Improvement"] },
  17: { level: 17, pb: 6, aidDie: "d12", features: ["Branch Feature"] },
  18: { level: 18, pb: 6, aidDie: "d12", features: ["Self-Supportive"] },
  19: { level: 19, pb: 6, aidDie: "d12", features: ["Ability Score Improvement"] },
  20: { level: 20, pb: 6, aidDie: "d12", features: ["Will Into Being"] }
});

export const STARTING_EQUIPMENT_OPTIONS = Object.freeze({
  fixedWeapon: "1x Light Melee Weapon",
  choiceWeaponShield: {
    a: "1x Light Melee Weapon",
    b: "1x Light Shield"
  },
  outfit: "Protective Clothing",
  tools: "Two Tool Kits you are Proficient with",
  cashOptionLMD: 1300
});

const DEFAULT_STATE = Object.freeze({
  version: 1,
  enabled: false,
  operations: [],
  events: [],
  uses: {},
  rulings: {},
  aidAbility: "cha"
});

export const flag = (document, key) => document?.getFlag?.("ak5e", key) ?? document?.flags?.ak5e?.[key];
const list = collection => Array.from(collection?.values?.() ?? collection ?? []);

export function checkLevel(level) {
  const n = Number(level);
  if (!Number.isInteger(n) || n < 1 || n > 20) {
    throw new RangeError("Supporter level must be an integer from 1 to 20.");
  }
  return n;
}

export function pbForLevel(level) {
  const lvl = checkLevel(level);
  return Math.floor((lvl - 1) / 4) + 2;
}

export function hitPointsAtLevel(level, conMod = 0, { mode = "fixed", rolls = [] } = {}) {
  const lvl = checkLevel(level);
  const con = Number(conMod) || 0;
  let total = Math.max(1, 6 + con);
  for (let i = 2; i <= lvl; i++) {
    const rollIndex = i - 2;
    const gained = (mode === "rolled" && Number.isInteger(rolls[rollIndex])) ? rolls[rollIndex] : 4;
    total += Math.max(1, gained + con);
  }
  return Math.max(1, total);
}

export function aidDieSize(level) {
  const lvl = checkLevel(level);
  if (lvl >= 14) return "d12";
  if (lvl >= 7) return "d10";
  return "d8";
}

export function supporterDC(actor) {
  const system = actor?.system ?? {};
  const pb = Number(system.attributes?.prof ?? 2);
  const intMod = Number(system.abilities?.int?.mod ?? 0);
  const wisMod = Number(system.abilities?.wis?.mod ?? 0);
  const chaMod = Number(system.abilities?.cha?.mod ?? 0);
  const chosen = flag(actor, "supporter")?.aidAbility;
  const mod = chosen === "int" ? intMod : (chosen === "wis" ? wisMod : (chosen === "cha" ? chaMod : Math.max(intMod, Math.max(wisMod, chaMod))));
  return 8 + pb + mod;
}

export function supporterState(actor) {
  const stored = flag(actor, "supporter") ?? {};
  return {
    ...structuredClone(DEFAULT_STATE),
    ...structuredClone(stored),
    operations: [...(stored.operations ?? [])],
    events: [...(stored.events ?? [])],
    uses: { ...(stored.uses ?? {}) },
    rulings: { ...(stored.rulings ?? {}) }
  };
}

export function supporterProfile(actor) {
  const empty = { applicable: false, configured: false, level: null, branch: null, branchId: null, classItem: null, branchItem: null, blocked: [] };
  if (actor?.type !== "character" || actor.pack) return empty;
  const items = list(actor.items);
  const classes = items.filter(i => i.type === "class");
  const sClass = classes.find(i => flag(i, "chapterThreeId") === SUPPORTER_CLASS_ID || i.name === "Supporter");
  if (!sClass) return empty;
  if (classes.length > 1) return { ...empty, applicable: true, blocked: ["MultipleClasses"] };

  const rawLevel = Number(sClass.system?.levels);
  const level = Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 20 ? rawLevel : null;
  if (level === null) return { ...empty, applicable: true, blocked: ["InvalidClassLevel"] };

  const branches = items.filter(i => i.type === "subclass");
  const branchItem = branches[0] ?? null;
  let branch = null, branchId = null;
  if (branchItem) {
    branchId = flag(branchItem, "chapterThreeId") ?? null;
    branch = SUPPORTER_BRANCH_IDS[branchId] ?? null;
    if (!branch && branchItem.name) {
      const match = branchItem.name.replace(/^Supporter:\s*/i, "").trim().toLowerCase();
      const normalized = match.replace(/[-\s]+(.)/g, (_, c) => c.toUpperCase());
      const standardMatch = Object.entries(SUPPORTER_BRANCH_IDS).find(([_, name]) => name.toLowerCase() === match || name.toLowerCase() === normalized);
      branch = standardMatch ? standardMatch[1] : null;
    }
    if (!branch) return { ...empty, applicable: true, level, classItem: sClass, branchItem, blocked: ["UnknownBranch"] };
  }

  const state = supporterState(actor);
  return {
    applicable: true,
    configured: Boolean(state.enabled),
    level,
    branch,
    branchId,
    classItem: sClass,
    branchItem,
    blocked: []
  };
}

export function supporterEnabled(actor) {
  const profile = supporterProfile(actor);
  return profile.applicable && profile.configured && !profile.blocked.length && profile.level !== null;
}

export function supporterLevel(actor) {
  return supporterProfile(actor).level;
}

export function supporterBranch(actor) {
  return supporterProfile(actor).branch;
}

export function calculateSupporterProfile(actor) {
  const profile = supporterProfile(actor);
  const level = profile.level ?? 1;
  const pb = pbForLevel(level);
  const system = actor?.system ?? {};
  const conMod = Number(system.abilities?.con?.mod ?? 0);
  const intMod = Number(system.abilities?.int?.mod ?? 0);
  const wisMod = Number(system.abilities?.wis?.mod ?? 0);
  const chaMod = Number(system.abilities?.cha?.mod ?? 0);

  const features = [];
  for (let l = 1; l <= level; l++) {
    const step = SUPPORTER_LEVEL_STEPS[l];
    if (step?.features) features.push(...step.features);
  }

  return {
    level,
    pb,
    hp: {
      hitDice: `${level}d6`,
      base: 6 + conMod,
      averagePerLevel: 4 + conMod,
      totalFixed: hitPointsAtLevel(level, conMod, { mode: "fixed" })
    },
    saves: {
      choiceOptions: ["con", "cha", "wis"]
    },
    proficiencies: {
      armor: [...SUPPORTER_ARMOR_PROFS],
      weapons: [...SUPPORTER_WEAPON_PROFS],
      tools: [...SUPPORTER_TOOL_CHOICES],
      skills: SUPPORTER_SKILLS.map(([_, key]) => key)
    },
    resources: {
      aidDie: {
        size: aidDieSize(level),
        maxFormula: "max(1, max(@abilities.int.mod, max(@abilities.wis.mod, @abilities.cha.mod)))"
      }
    },
    features,
    dc: {
      supporter: supporterDC(actor)
    },
    branch: profile.branch,
    branchId: profile.branchId,
    classItem: profile.classItem,
    branchItem: profile.branchItem
  };
}
```

---

### 4.2 Module 2: `ak5e/scripts/supporter-features.mjs`
Pool registration, rest recovery, feature queries, and hooks:

```javascript
/** Supporter runtime features and mechanical hooks (Ch. 3 L6548–6692).
 * Provide Aid, Advanced Aid riders, Lighten the Load, Ever Reliable,
 * Self-Supportive, and Will Into Being.
 */
import {
  supporterLevel, supporterEnabled, checkLevel, pbForLevel, flag,
  aidDieSize, supporterState
} from "./supporter-rules.mjs";
import { definePool, getPool, getPoolDefinition, refundPool, recoverPool } from "./resource-pools.mjs";
import { need, opaqueKey } from "./operation-kernel.mjs";
import { spendReaction, getReactions } from "./trigger-events.mjs";

let hooksInstalled = false;

export function hasProvideAid(actor) {
  const lvl = supporterLevel(actor);
  return Boolean(lvl && lvl >= 1);
}

export function hasAdvancedAid(actor) {
  const lvl = supporterLevel(actor);
  return Boolean(lvl && lvl >= 5);
}

export function hasLightenTheLoad(actor) {
  const lvl = supporterLevel(actor);
  return Boolean(lvl && lvl >= 11);
}

export function hasEverReliable(actor) {
  const lvl = supporterLevel(actor);
  return Boolean(lvl && lvl >= 15);
}

export function hasSelfSupportive(actor) {
  const lvl = supporterLevel(actor);
  return Boolean(lvl && lvl >= 18);
}

export function hasWillIntoBeing(actor) {
  const lvl = supporterLevel(actor);
  return Boolean(lvl && lvl >= 20);
}

export function willIntoBeingBonus(actor) {
  if (!hasWillIntoBeing(actor)) return 0;
  const lvl = supporterLevel(actor);
  return pbForLevel(lvl);
}

export function defineSupporterPools() {
  if (!getPoolDefinition("aidDie")) {
    definePool({
      id: "aidDie",
      label: "Aid Dice",
      max: "max(1, max(@abilities.int.mod, max(@abilities.wis.mod, @abilities.cha.mod)))",
      initial: "max",
      classId: "class-supporter",
      levelBasis: "classLevel",
      appliesTo: supporterEnabled,
      recovery: [{ on: "lr", amount: "full" }]
    });
  }
}

export async function onSupporterRest(actor, restType) {
  if (!supporterEnabled(actor)) return;
  if (restType === "short" && hasEverReliable(actor)) {
    const pool = getPool(actor, "aidDie");
    const halfMax = Math.ceil(pool.max / 2);
    if (halfMax > 0) {
      await refundPool(actor, "aidDie", halfMax, { reason: "Ever Reliable Short Rest" });
    }
  }
}

export async function onSupporterTurnStart(actor) {
  if (!supporterEnabled(actor)) return;
  // Ever Reliable: If turn begins and you have no Aid Dice remaining, regain 1 Aid Die.
  if (hasEverReliable(actor)) {
    const pool = getPool(actor, "aidDie");
    if (pool.value === 0) {
      await refundPool(actor, "aidDie", 1, { reason: "Ever Reliable Turn Start" });
    }
  }
  // Self-Supportive: Gain personal Aid Die at turn start
  if (hasSelfSupportive(actor)) {
    await actor.update({ "flags.ak5e.supporter.selfSupportDie": true });
  }
}

export function registerSupporterHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  defineSupporterPools();

  Hooks.on("dnd5e.restCompleted", (actor, result, config = {}) => {
    const type = config.type ?? result?.type ?? (config.longRest ? "long" : "short");
    onSupporterRest(actor, type);
  });
}
```

---

### 4.3 Module 3: `ak5e/scripts/supporter-setup.mjs`
Idempotent feature setup mapping embedded items from `chapter-three-content.mjs`:

```javascript
/** Supporter feature setup: preview and apply class features up to current Supporter level idempotently. */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { SUPPORTER_CLASS_ID, supporterProfile, supporterLevel } from "./supporter-rules.mjs";
import { sourceEntryData } from "./caster-setup.mjs";
import { need } from "./operation-kernel.mjs";
import { defineSupporterPools } from "./supporter-features.mjs";

export const SUPPORTER_CORE_FEATURES = Object.freeze([
  { id: "class-feature-supporter-1st-level-supporter-branch-925", level: 1, name: "1st Level: Supporter Branch" },
  { id: "class-feature-supporter-1st-level-provide-aid-2284", level: 1, name: "1st Level: Provide Aid" },
  { id: "class-feature-supporter-2nd-level-basic-operator-skill-3307", level: 2, name: "2nd Level: Basic Operator Skill" },
  { id: "class-feature-supporter-3rd-level-basic-talent-3471", level: 3, name: "3rd Level: Basic Talent" },
  { id: "class-feature-supporter-4th-level-ability-score-improvement-3717", level: 4, name: "4th Level: Ability Score Improvement" },
  { id: "class-feature-supporter-5th-level-advanced-aid-4035", level: 5, name: "5th Level: Advanced Aid" },
  { id: "class-feature-supporter-7th-level-advanced-operator-skill-5141", level: 7, name: "7th Level: Advanced Operator Skill" },
  { id: "class-feature-supporter-9th-level-advanced-talent-5318", level: 9, name: "9th Level: Advanced Talent" },
  { id: "class-feature-supporter-11th-level-lighten-the-load-5608", level: 11, name: "11th Level: Lighten the Load" },
  { id: "class-feature-supporter-14th-level-elite-operator-skill-6012", level: 14, name: "14th Level: Elite Operator Skill" },
  { id: "class-feature-supporter-15th-level-ever-reliable-6178", level: 15, name: "15th Level: Ever Reliable" },
  { id: "class-feature-supporter-18th-level-self-supportive-6563", level: 18, name: "18th Level: Self-Supportive" },
  { id: "class-feature-supporter-20th-level-will-into-being-6864", level: 20, name: "20th Level: Will Into Being" }
]);

const list = collection => Array.from(collection?.values?.() ?? collection ?? []);
const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];

function worldItem(sourceId) {
  return list(globalThis.game?.items).find(i => flag(i, "chapterThreeId") === sourceId) ?? null;
}

function featureItemData(entry) {
  const world = worldItem(entry.id);
  if (world) {
    const data = world.toObject ? world.toObject() : structuredClone(world);
    delete data._id;
    delete data.id;
    data.flags ??= {};
    data.flags.ak5e ??= {};
    data.flags.ak5e.chapterThreeId = entry.id;
    data.flags.ak5e.supporterFeature = true;
    return data;
  }
  const source = CHAPTER_THREE_CLASSES.find(e => e.id === entry.id);
  if (source) {
    const data = sourceEntryData(source);
    data.flags ??= {};
    data.flags.ak5e ??= {};
    data.flags.ak5e.chapterThreeId = entry.id;
    data.flags.ak5e.supporterFeature = true;
    return data;
  }
  return {
    name: entry.name,
    type: "feat",
    img: "icons/magic/control/buff-flight-wings-runes-purple.webp",
    system: { description: { value: `<p>AK5e Supporter Feature: ${entry.name}</p>` } },
    flags: { ak5e: { chapterThreeId: entry.id, supporterFeature: true } }
  };
}

export async function previewSupporterSetup(actor) {
  const profile = supporterProfile(actor);
  need(actor?.isOwner && profile.applicable, "Choose an owned character with the Supporter class.");
  const level = profile.level ?? 1;
  const existing = list(actor.items);
  const creates = [], kept = [];

  for (const feat of SUPPORTER_CORE_FEATURES) {
    if (feat.level > level) continue;
    const owned = existing.find(i => flag(i, "chapterThreeId") === feat.id || i.name === feat.name);
    if (owned) {
      kept.push(feat.name);
    } else {
      creates.push(featureItemData(feat));
    }
  }

  const contextKey = JSON.stringify([actor.uuid, level, creates.map(c => c.name), kept]);
  return {
    level,
    creates,
    kept,
    contextKey,
    actorUpdates: {
      "flags.ak5e.supporter.enabled": true
    }
  };
}

export async function applySupporterSetup(actor, { confirmed, contextKey } = {}) {
  need(confirmed === true, "Confirm the previewed Supporter setup first.");
  const plan = await previewSupporterSetup(actor);
  need(plan.contextKey === contextKey, "The character changed since the preview; preview the Supporter setup again.");

  defineSupporterPools();
  await actor.update(plan.actorUpdates);
  if (plan.creates.length) {
    await actor.createEmbeddedDocuments("Item", plan.creates);
  }

  return {
    success: true,
    level: plan.level,
    createdCount: plan.creates.length,
    keptCount: plan.kept.length
  };
}
```

---

### 4.4 Module 4: `ak5e/scripts/supporter-progression.mjs`
Choice inspection, preview, and application with strict validation (exactly 2 saves from CON/CHA/WIS, exactly 3 unique skills from Arts/Lore/Tech/Insight/Deception/Persuasion, starting equipment idempotency):

```javascript
/** Native, previewed Supporter character progression.
 * Follows WORKFLOW.md §3.2 and the established pattern in vanguard-progression.mjs.
 * Pure and previewed: opening or inspecting choices never writes Actor or Item data.
 */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "./chapter-four-content.mjs";
import { sourceEntryData } from "./caster-setup.mjs";
import {
  SUPPORTER_CLASS_ID, SUPPORTER_BRANCH_IDS, SUPPORTER_SKILLS, SUPPORTER_SAVES,
  SUPPORTER_ARMOR_PROFS, SUPPORTER_WEAPON_PROFS, SUPPORTER_TOOL_CHOICES,
  ASI_LEVELS, checkLevel, supporterProfile, supporterState
} from "./supporter-rules.mjs";
import { need } from "./operation-kernel.mjs";

export const SUPPORTER_PROGRESS_FLAG = "supporterProgression";
export const SUPPORTER_TALENT_FLAG = "supporterTalent";

const TALENTS = CHAPTER_THREE_CLASSES.filter(entry =>
  entry.kind === "class-option" && entry.parentClass === "Supporter" && entry.classOption?.category === "talent"
);
const EQUIPMENT = CHAPTER_FOUR_EQUIPMENT;

const DEFAULT_STATE = Object.freeze({
  version: 1,
  choices: {},
  hpLevels: [],
  asiLevels: [],
  startingEquipmentGranted: false,
  operations: [],
  receipts: {},
  plans: {}
});

const entries = collection => Array.from(collection?.values?.() ?? collection ?? []);
const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];
const sourceSystem = actor => actor?._source?.system ?? actor?.system ?? {};

function readState(actor) {
  const stored = flag(actor, SUPPORTER_PROGRESS_FLAG) ?? {};
  return {
    ...structuredClone(DEFAULT_STATE),
    ...structuredClone(stored),
    choices: structuredClone(stored.choices ?? {}),
    hpLevels: [...(stored.hpLevels ?? [])],
    asiLevels: [...(stored.asiLevels ?? [])],
    startingEquipmentGranted: Boolean(stored.startingEquipmentGranted),
    operations: [...(stored.operations ?? [])],
    receipts: { ...(stored.receipts ?? {}) },
    plans: { ...(stored.plans ?? {}) }
  };
}

function classItems(actor) {
  return entries(actor?.items).filter(item => item.type === "class");
}

function supporterClass(actor) {
  return classItems(actor).find(item => flag(item, "chapterThreeId") === SUPPORTER_CLASS_ID || item.name === "Supporter") ?? null;
}

function branchItem(actor) {
  return entries(actor?.items).find(item => item.type === "subclass") ?? null;
}

function levelOf(item) {
  const level = Number(item?.system?.levels);
  return Number.isInteger(level) && level >= 1 && level <= 20 ? level : null;
}

function sourceId(item) {
  return flag(item, "chapterThreeId") ?? flag(item, "chapterFourId");
}

function worldItem(sourceIdValue) {
  return entries(globalThis.game?.items).find(item => sourceId(item) === sourceIdValue) ?? null;
}

function toSource(item) {
  const data = item?.toObject ? item.toObject() : structuredClone(item ?? {});
  delete data._id;
  delete data.id;
  delete data.folder;
  delete data.sort;
  return data;
}

function actorItemData(source, entry, kind = "feature") {
  const data = toSource(source);
  data.flags ??= {};
  data.flags.ak5e ??= {};
  if (entry) {
    data.flags.ak5e = {
      ...data.flags.ak5e,
      chapterThreeId: entry.id,
      classContentKind: entry.kind,
      parentClass: entry.parentClass,
      parentBranch: entry.parentBranch,
      classLevel: entry.level,
      sourceHeading: entry.sourceHeading,
      sourceFile: entry.sourceFile ?? "03_chapter_3_character_classes.txt",
      sourceLine: entry.sourceLine ?? null
    };
  }
  data.flags.ak5e.supporterProgressionGrant = { sourceId: entry?.id ?? sourceId(source), kind };
  return data;
}

function sourceData(entry, kind = "feature") {
  const world = worldItem(entry.id);
  if (world) return actorItemData(world, entry, kind);
  const data = sourceEntryData(entry);
  data.flags ??= {};
  data.flags.ak5e ??= {};
  data.flags.ak5e.supporterProgressionGrant = { sourceId: entry.id, kind };
  return data;
}

function equipmentData(entry) {
  const source = worldItem(entry.id);
  if (source) {
    const data = toSource(source);
    data.flags ??= {};
    data.flags.ak5e ??= {};
    data.flags.ak5e.supporterProgressionGrant = { sourceId: entry.id, kind: "startingEquipment" };
    return data;
  }
  const data = sourceEntryData(entry);
  data.flags ??= {};
  data.flags.ak5e ??= {};
  data.flags.ak5e.supporterProgressionGrant = { sourceId: entry.id, kind: "startingEquipment" };
  return data;
}

function currentAbility(actor, ability) {
  const raw = Number(sourceSystem(actor).abilities?.[ability]?.value);
  return Number.isFinite(raw) ? raw : 10;
}

const option = (value, label, details = {}) => ({ value, label, ...details });
const field = (key, label, options, count = 1, selected = null, requiredAt = 1) => ({ key, label, options, count, selected, requiredAt });

export function supporterChoices(actor, supplied = {}) {
  const state = readState(actor), saved = state.choices ?? {};
  const result = { ...structuredClone(saved), ...structuredClone(supplied ?? {}) };
  result.skills = [...(Array.isArray(supplied.skills) ? supplied.skills : saved.skills ?? [])];
  const saves = supplied.saves ?? saved.saves ?? [];
  result.saves = Array.isArray(saves) ? [...saves] : [saves];
  result.asi = { ...(saved.asi ?? {}), ...(supplied.asi ?? {}) };
  result.hp = { ...(saved.hp ?? {}), ...(supplied.hp ?? {}) };
  result.startingEquipment = { ...(saved.startingEquipment ?? {}), ...(supplied.startingEquipment ?? {}) };
  if (state.startingEquipmentGranted && !supplied.startingEquipment?.mode) {
    result.startingEquipment.mode = "existing";
  }
  result.talents = { ...(saved.talents ?? {}), ...(supplied.talents ?? {}) };
  result.branch = supplied.branch ?? saved.branch ?? null;
  result.aidAbility = supplied.aidAbility ?? saved.aidAbility ?? "cha";
  result.tools = [...(Array.isArray(supplied.tools) ? supplied.tools : saved.tools ?? [])];

  const level = levelOf(supporterClass(actor));
  if (level) {
    result.asi ??= {};
    result.hp ??= {};
    for (const n of ASI_LEVELS.filter(v => v <= level)) {
      if (state.asiLevels?.includes(n) && !supplied.asi?.[n]) {
        result.asi[n] = { mode: "existing" };
      } else {
        result.asi[n] ??= { mode: "existing" };
      }
    }
    for (let n = 1; n <= level; n++) {
      if (state.hpLevels?.includes(n) && !supplied.hp?.[n]) {
        result.hp[n] = { mode: "existing" };
      } else {
        result.hp[n] ??= { mode: "existing" };
      }
    }
  }
  return result;
}

function asiOptions(actor) {
  const abilities = ["str", "dex", "con", "int", "wis", "cha"], result = [];
  for (const ability of abilities) {
    if (currentAbility(actor, ability) + 2 <= 20) {
      result.push(option({ increases: [{ ability, amount: 2 }] }, `+2 ${ability.toUpperCase()}`));
    }
  }
  for (let i = 0; i < abilities.length; i++) {
    for (let j = i + 1; j < abilities.length; j++) {
      const [a, b] = [abilities[i], abilities[j]];
      if (currentAbility(actor, a) < 20 && currentAbility(actor, b) < 20) {
        result.push(option({ increases: [{ ability: a, amount: 1 }, { ability: b, amount: 1 }] }, `+1 ${a.toUpperCase()} and +1 ${b.toUpperCase()}`));
      }
    }
  }
  return result;
}

function hpOptions(level) {
  if (level === 1) {
    return [
      option({ mode: "existing" }, "Already included in current Hit Point maximum"),
      option({ mode: "fixed", roll: 6 }, "Fixed 6 at 1st level")
    ];
  }
  const fixedRoll = 4;
  const rolledOptions = Array.from({ length: 6 }, (_, i) => {
    const roll = i + 1;
    return option({ mode: "rolled", roll }, `Rolled d6: ${roll}`);
  });
  return [
    option({ mode: "existing" }, "Already included in current Hit Point maximum"),
    option({ mode: "fixed", roll: fixedRoll }, `Fixed average (${fixedRoll})`),
    ...rolledOptions
  ];
}

function talentOptions(tier) {
  return TALENTS.filter(entry => entry.classOption.tier.toLowerCase() === tier.toLowerCase())
    .map(entry => option(entry.id, entry.name, {
      sourceId: entry.id,
      effect: entry.classOption.effect,
      moduleEffect: entry.classOption.moduleEffect
    }));
}

function equipmentOptions(predicate) {
  return EQUIPMENT.filter(predicate).map(entry => option(entry.id, entry.name, { sourceId: entry.id }));
}

export function inspectSupporterFields(actor, choices = {}) {
  const level = levelOf(supporterClass(actor)) ?? 1;
  const attached = branchItem(actor);
  const currentChoices = supporterChoices(actor, choices);
  const fields = [];

  if (!attached) {
    const branchOptions = Object.entries(SUPPORTER_BRANCH_IDS).map(([id, name]) => option(id, name.charAt(0).toUpperCase() + name.slice(1)));
    fields.push(field("branch", "Choose your Supporter Branch", branchOptions, 1, currentChoices.branch ?? null));
  }

  // Choose two saving throws from Con, Cha, Wis
  fields.push(field("saves", "Choose two Saving Throw proficiencies", SUPPORTER_SAVES.choices.map(([name, key]) => option(key, name)), 2, currentChoices.saves ?? []));

  // Choose three skills from Arts, Lore, Tech, Insight, Deception, Persuasion
  fields.push(field("skills", "Choose three Supporter skills", SUPPORTER_SKILLS.map(([name, key]) => option(key, name)), 3, currentChoices.skills ?? []));

  // Aid Die Ability: Int, Wis, or Cha
  fields.push(field("aidAbility", "Choose ability modifier for Aid Dice uses", [
    option("int", "Intelligence"),
    option("wis", "Wisdom"),
    option("cha", "Charisma")
  ], 1, currentChoices.aidAbility ?? "cha"));

  // Starting Equipment
  fields.push(field("startingEquipment.mode", "Choose starting equipment or 1300 LMD", [
    option("items", "Starting equipment"),
    option("cash", "1300 LMD")
  ], 1, currentChoices.startingEquipment?.mode ?? null));

  if (currentChoices.startingEquipment?.mode === "items") {
    const lightMelee = equipmentOptions(entry => entry.kind === "weapon" && entry.tableData?.category === "Light Melee Weapons");
    const lightShields = equipmentOptions(entry => entry.kind === "equipment" && entry.tableData?.category === "Light Shields");
    const toolKits = equipmentOptions(entry => entry.kind === "tool");

    fields.push(field("startingEquipment.weapon1", "1x Light Melee Weapon", lightMelee, 1, currentChoices.startingEquipment?.weapon1 ?? null));
    fields.push(field("startingEquipment.weapon2", "1x Light Melee Weapon OR 1x Light Shield", [...lightMelee, ...lightShields], 1, currentChoices.startingEquipment?.weapon2 ?? null));
    fields.push(field("startingEquipment.tool1", "Tool Kit 1", toolKits, 1, currentChoices.startingEquipment?.tool1 ?? null));
    fields.push(field("startingEquipment.tool2", "Tool Kit 2", toolKits, 1, currentChoices.startingEquipment?.tool2 ?? null));
  }

  // Hit Points
  for (let n = 1; n <= level; n++) {
    fields.push(field(`hp.${n}`, `Level ${n} Hit Points`, hpOptions(n), 1, currentChoices.hp?.[n] ?? { mode: "existing" }));
  }

  // ASIs
  for (const n of ASI_LEVELS.filter(v => v <= level)) {
    fields.push(field(`asi.${n}`, `Level ${n} Ability Score Improvement`, asiOptions(actor), 1, currentChoices.asi?.[n] ?? { mode: "existing" }));
  }

  // Talents
  if (level >= 3) {
    fields.push(field("talents.basic", "Level 3: Basic Talent", talentOptions("basic"), 1, currentChoices.talents?.basic ?? null));
  }
  if (level >= 8) {
    fields.push(field("talents.basicModule", "Level 8: Basic Talent Module Upgrade or New Basic Talent", [
      option("upgrade", "Upgrade chosen Basic Talent (gain Module Effect)"),
      ...talentOptions("basic")
    ], 1, currentChoices.talents?.basicModule ?? null));
  }
  if (level >= 9) {
    fields.push(field("talents.advanced", "Level 9: Advanced Talent", talentOptions("advanced"), 1, currentChoices.talents?.advanced ?? null));
  }
  if (level >= 13) {
    fields.push(field("talents.advancedModule", "Level 13: Advanced Talent Module Upgrade or New Advanced Talent", [
      option("upgrade", "Upgrade chosen Advanced Talent (gain Module Effect)"),
      ...talentOptions("advanced")
    ], 1, currentChoices.talents?.advancedModule ?? null));
  }

  return fields;
}

function actorSnapshotKey(actor, choices, profile) {
  return JSON.stringify([
    actor.uuid,
    profile.level,
    profile.branch,
    choices.branch,
    choices.saves,
    choices.skills,
    choices.aidAbility,
    choices.startingEquipment,
    choices.hp,
    choices.asi,
    choices.talents
  ]);
}

export async function previewSupporterProgression(actor, suppliedChoices = {}) {
  const profile = supporterProfile(actor);
  need(actor?.isOwner && profile.applicable, "Choose an owned character with the Supporter class.");
  const level = profile.level;
  const choices = supporterChoices(actor, suppliedChoices);
  const pending = [], warnings = [], writes = {}, createItems = [], updateItems = [];

  const attachedBranch = branchItem(actor);
  const selectedBranchId = choices.branch ?? (attachedBranch ? flag(attachedBranch, "chapterThreeId") : null);

  const state = readState(actor);
  const alreadyGrantedEquipment = Boolean(state.startingEquipmentGranted || choices.startingEquipment?.mode === "existing");

  // Validate branch
  if (!attachedBranch && !choices.branch) pending.push("branch");

  // Validate saves: exactly two from ["con", "cha", "wis"]
  const allowedSaves = new Set(SUPPORTER_SAVES.choices.map(([_, key]) => key));
  const chosenSaves = Array.isArray(choices.saves) ? choices.saves : (choices.saves ? [choices.saves] : []);
  const uniqueChosenSaves = new Set(chosenSaves);
  const validSaves = chosenSaves.length === 2 &&
    uniqueChosenSaves.size === 2 &&
    chosenSaves.every(s => allowedSaves.has(s));

  if (!validSaves) {
    pending.push("saves");
  }

  // Validate skills: exactly 3 unique skills from SUPPORTER_SKILLS
  const allowedSkills = new Set(SUPPORTER_SKILLS.map(([_, key]) => key));
  const chosenSkillsList = Array.isArray(choices.skills) ? choices.skills : [];
  const uniqueChosenSkills = new Set(chosenSkillsList);
  const validSkills = chosenSkillsList.length === 3 &&
    uniqueChosenSkills.size === 3 &&
    chosenSkillsList.every(s => allowedSkills.has(s));

  if (!validSkills) {
    pending.push("skills");
  }

  // Validate starting equipment
  if (!alreadyGrantedEquipment) {
    if (!choices.startingEquipment?.mode) pending.push("startingEquipment.mode");
    else if (choices.startingEquipment.mode === "items") {
      if (!choices.startingEquipment.weapon1) pending.push("startingEquipment.weapon1");
      if (!choices.startingEquipment.weapon2) pending.push("startingEquipment.weapon2");
      if (!choices.startingEquipment.tool1) pending.push("startingEquipment.tool1");
      if (!choices.startingEquipment.tool2) pending.push("startingEquipment.tool2");
    }
  }

  // Branch item
  if (!attachedBranch && selectedBranchId) {
    const branchEntry = CHAPTER_THREE_CLASSES.find(e => e.id === selectedBranchId);
    if (branchEntry) {
      createItems.push(sourceData(branchEntry, "subclass"));
    }
  }

  // Starting equipment items / cash
  if (!alreadyGrantedEquipment) {
    if (choices.startingEquipment?.mode === "items") {
      const eqKeys = ["weapon1", "weapon2", "tool1", "tool2"];
      for (const key of eqKeys) {
        const eqId = choices.startingEquipment[key];
        if (eqId) {
          const eqEntry = EQUIPMENT.find(e => e.id === eqId);
          if (eqEntry) createItems.push(equipmentData(eqEntry));
        }
      }
      // Protective Clothing
      const prot = EQUIPMENT.find(e => e.id === "equipment-protective-clothing-0");
      if (prot) createItems.push(equipmentData(prot));
    } else if (choices.startingEquipment?.mode === "cash") {
      const beforeCp = Number(sourceSystem(actor).currency?.cp ?? 0);
      writes["system.currency.cp"] = beforeCp + 1300;
    }
  }

  // Proficiencies updates
  const system = sourceSystem(actor);
  // Saves: Exactly the two chosen saves
  const currentSaves = new Set(system.traits?.saves?.value ?? []);
  if (validSaves) {
    for (const s of uniqueChosenSaves) currentSaves.add(s);
  }
  writes["system.traits.saves.value"] = Array.from(currentSaves);

  // Armor: Light Armor, Light Shield
  const currentArmor = new Set(system.traits?.armorProf?.value ?? []);
  for (const prof of SUPPORTER_ARMOR_PROFS) currentArmor.add(prof);
  writes["system.traits.armorProf.value"] = Array.from(currentArmor);

  // Weapons: Light Melee
  const currentWeapons = new Set(system.traits?.weaponProf?.value ?? []);
  currentWeapons.add("sim");
  writes["system.traits.weaponProf.value"] = Array.from(currentWeapons);

  // Skills
  if (validSkills) {
    for (const skillKey of uniqueChosenSkills) {
      writes[`system.skills.${skillKey}.value`] = Math.max(1, Number(system.skills?.[skillKey]?.value ?? 0));
    }
  }

  // Hit Points calculations
  const conMod = Number(system.abilities?.con?.mod ?? 0);
  let hpIncrease = 0;
  for (let n = 1; n <= level; n++) {
    const hpChoice = choices.hp?.[n];
    if (!hpChoice || hpChoice.mode === "existing") continue;
    if (n === 1) {
      hpIncrease += Math.max(1, 6 + conMod);
    } else {
      const rawRoll = Number(hpChoice.roll);
      const rolled = Number.isFinite(rawRoll) ? Math.min(6, Math.max(1, Math.round(rawRoll))) : 4;
      hpIncrease += Math.max(1, rolled + conMod);
    }
  }
  if (hpIncrease > 0) {
    const currentMax = Number(system.attributes?.hp?.max ?? 0);
    writes["system.attributes.hp.max"] = currentMax + hpIncrease;
  }

  // Ability Score Improvements
  const validAbilities = ["str", "dex", "con", "int", "wis", "cha"];
  const abilityIncreases = {};
  for (const n of ASI_LEVELS.filter(v => v <= level)) {
    const asiChoice = choices.asi?.[n];
    if (!asiChoice) {
      pending.push(`asi.${n}`);
      continue;
    }
    if (asiChoice.mode === "existing") continue;
    const increases = Array.isArray(asiChoice.increases) ? asiChoice.increases : [];
    const isValidScheme = (
      (increases.length === 1 && increases[0].amount === 2 && validAbilities.includes(increases[0].ability)) ||
      (increases.length === 2 &&
       increases[0].amount === 1 &&
       increases[1].amount === 1 &&
       increases[0].ability !== increases[1].ability &&
       validAbilities.includes(increases[0].ability) &&
       validAbilities.includes(increases[1].ability))
    );
    if (!isValidScheme) {
      pending.push(`asi.${n}`);
      continue;
    }
    for (const inc of increases) {
      abilityIncreases[inc.ability] = (abilityIncreases[inc.ability] ?? 0) + Math.min(2, Math.max(1, inc.amount));
    }
  }
  for (const [abl, inc] of Object.entries(abilityIncreases)) {
    const current = currentAbility(actor, abl);
    writes[`system.abilities.${abl}.value`] = Math.min(20, current + inc);
  }

  // Talents
  const existingTalents = entries(actor.items).filter(i => flag(i, "classContentKind") === "class-option");
  const existingIds = new Set(existingTalents.map(i => flag(i, "chapterThreeId")));

  const grantTalent = (talentId, tier) => {
    if (!talentId || talentId === "upgrade" || existingIds.has(talentId)) return;
    const talentEntry = TALENTS.find(t => t.id === talentId);
    if (talentEntry) {
      const data = sourceData(talentEntry, "talent");
      data.flags.ak5e[SUPPORTER_TALENT_FLAG] = { sourceId: talentId, tier };
      createItems.push(data);
      existingIds.add(talentId);
    }
  };

  if (choices.talents?.basic) grantTalent(choices.talents.basic, "basic");
  if (choices.talents?.basicModule && choices.talents.basicModule !== "upgrade") grantTalent(choices.talents.basicModule, "basic");
  if (choices.talents?.advanced) grantTalent(choices.talents.advanced, "advanced");
  if (choices.talents?.advancedModule && choices.talents.advancedModule !== "upgrade") grantTalent(choices.talents.advancedModule, "advanced");

  // Save chosen aidAbility under flags.ak5e.supporter
  if (["int", "wis", "cha"].includes(choices.aidAbility)) {
    writes["flags.ak5e.supporter.aidAbility"] = choices.aidAbility;
  }

  const contextKey = actorSnapshotKey(actor, choices, profile);

  return {
    level,
    choices,
    pending,
    warnings,
    writes,
    createItems,
    updateItems,
    contextKey
  };
}

export async function applySupporterProgression(actor, { confirmed, contextKey, choices = {} } = {}) {
  need(confirmed === true, "Confirm the previewed Supporter progression first.");
  const plan = await previewSupporterProgression(actor, choices);
  need(plan.contextKey === contextKey, "The character changed since the preview; preview Supporter progression again.");
  need(plan.pending.length === 0, `Complete all required choices before applying progression: ${plan.pending.join(", ")}`);

  const state = readState(actor);
  state.choices = structuredClone(plan.choices);

  const hpLevelsGranted = Object.entries(plan.choices.hp ?? {})
    .filter(([_, opt]) => opt && opt.mode !== "existing")
    .map(([lvl]) => Number(lvl));
  const asiLevelsGranted = Object.entries(plan.choices.asi ?? {})
    .filter(([_, opt]) => opt && opt.mode !== "existing" && opt.increases?.length)
    .map(([lvl]) => Number(lvl));

  state.hpLevels = [...new Set([...(state.hpLevels ?? []), ...hpLevelsGranted])];
  state.asiLevels = [...new Set([...(state.asiLevels ?? []), ...asiLevelsGranted])];

  for (const n of hpLevelsGranted) state.choices.hp[n] = { mode: "existing" };
  for (const n of asiLevelsGranted) state.choices.asi[n] = { mode: "existing" };
  if (!state.startingEquipmentGranted && (plan.choices.startingEquipment?.mode === "items" || plan.choices.startingEquipment?.mode === "cash")) {
    state.startingEquipmentGranted = true;
  }
  if (state.startingEquipmentGranted) {
    state.choices.startingEquipment = { mode: "existing" };
  }

  const updates = {
    ...plan.writes,
    [`flags.ak5e.${SUPPORTER_PROGRESS_FLAG}`]: state
  };
  await actor.update(updates);

  if (plan.createItems.length) {
    await actor.createEmbeddedDocuments("Item", plan.createItems);
  }

  return {
    success: true,
    level: plan.level,
    updatedFields: Object.keys(plan.writes),
    created: plan.createItems.map(c => c.name)
  };
}
```

---

### 4.5 Module 5: `ak5e/scripts/supporter-uses.mjs`
Table-play active capabilities using `createPlayUses`:

```javascript
/**
 * Supporter table-play use engine (WORKFLOW.md §3.2, play-uses.mjs).
 * Enforces:
 *  - Confirm before use;
 *  - Non-blocking warnings with "Use anyway" overrides;
 *  - Zero-clamping on resource shortfalls;
 *  - Automatic GM relay for unowned target modifications;
 *  - Interactive roll buttons on chat cards (no auto-rolled dice);
 *  - Encounter-window undo receipts in `flags.ak5e.supporterUses`.
 */
import { createPlayUses, warn, spendResource, resourceValue } from "./play-uses.mjs";
import {
  supporterEnabled, supporterLevel, supporterState, checkLevel,
  aidDieSize, flag, pbForLevel
} from "./supporter-rules.mjs";
import {
  hasProvideAid, hasAdvancedAid, hasLightenTheLoad,
  hasEverReliable, hasSelfSupportive, hasWillIntoBeing,
  willIntoBeingBonus
} from "./supporter-features.mjs";
import { need, opaqueKey, values } from "./operation-kernel.mjs";
import { spendReaction, getReactions } from "./trigger-events.mjs";
import { requireOverrides, isPlayWarnings } from "./play-undo.mjs";
import { getPool } from "./resource-pools.mjs";

export const supporterUses = createPlayUses({
  ns: "supporterUses",
  label: "Supporter",
  isMember: actor => supporterEnabled(actor),
  ruling: (actor, key) => {
    const record = supporterState(actor).rulings?.[key];
    return record?.source?.trim?.() && record.value !== undefined ? record.value : undefined;
  }
});

const levelWarning = (warnings, actor, requiredLevel, featureName) => {
  const current = supporterLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${featureName} is a Supporter level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

const CORE_PLANS = {
  provideAid(actor, state, data) {
    need(supporterEnabled(actor), "Provide Aid requires the Supporter class.");
    const warnings = [];
    const level = supporterLevel(actor) ?? 1;
    const pb = pbForLevel(level);
    const die = aidDieSize(level);

    const target = data.target ?? data.targetActor ?? null;
    const targetUuid = target?.uuid ?? data.targetUuid ?? null;
    const targetName = target?.name ?? data.targetName ?? "target creature";

    // Range warning (60 ft)
    const distance = Number(data.distance ?? 0);
    if (distance > 60) {
      warn(warnings, "range", `${targetName} is beyond 60 feet (Provide Aid range).`);
    }

    // Target cannot already have an Aid Die
    const existingDie = target ? flag(target, "aidDie") : null;
    if (existingDie) {
      warn(warnings, "targetHasAidDie", `${targetName} already has an Aid Die; a creature can only have one Aid Die at a time.`);
    }

    // Resource check: Aid Die pool
    const pool = getPool(actor, "aidDie");
    if (pool.value < 1) {
      warn(warnings, "shortfall", `Aid Dice pool is empty (0 remaining).`);
    }

    return {
      title: `Provide Aid (${die}) -> ${targetName}`,
      warnings,
      apply(next, receipt) {
        // Spend 1 Aid Die with clamping
        const spendUpdate = spendResource(actor, receipt, { pool: "aidDie", amount: 1, label: "Aid Die" });
        Object.assign(next, spendUpdate);

        receipt.summary = `${actor.name} granted a ${die} Aid Die to ${targetName} for 10 minutes.`;
        receipt.result = { dieSize: die, targetUuid, targetName, durationSeconds: 600 };

        if (targetUuid) {
          receipt.targets = [{
            uuid: targetUuid,
            name: targetName,
            kind: "effect",
            featureId: "class-feature-supporter-1st-level-provide-aid-2284",
            tag: {
              label: `Aid Die (${die})`,
              trigger: "turnStart",
              expiryActor: "source",
              duration: 600,
              data: {
                supporterUuid: actor.uuid,
                dieSize: die,
                supporterLevel: level,
                supporterPB: pb,
                advancedAid: level >= 5,
                willIntoBeing: level >= 20
              }
            },
            ready: true
          }];
        }
      }
    };
  },

  useAidDie(actor, state, data) {
    const warnings = [];
    const rollType = String(data.rollType ?? "check").toLowerCase();
    const validRollTypes = ["attack", "skill", "save", "damage", "healing"];
    if (!validRollTypes.includes(rollType)) {
      warn(warnings, "invalidRollType", `Invalid roll type: ${rollType}. Must be one of attack, skill, save, damage, healing.`);
    }
    if (data.isDeathSave) {
      warn(warnings, "deathSave", "Aid Die cannot be used on Death Saving Throws.");
    }

    const dieSize = data.dieSize ?? "d8";
    const supporterLevel = Number(data.supporterLevel ?? 1);
    const pb = Number(data.supporterPB ?? 2);
    const hasAdv = supporterLevel >= 5;
    const hasWill = supporterLevel >= 20;

    return {
      title: `Expend Aid Die (${dieSize}) for ${rollType.toUpperCase()}`,
      warnings,
      apply(next, receipt) {
        receipt.summary = `Expended Aid Die (${dieSize}) on ${rollType}.`;
        receipt.result = {
          dieSize,
          rollType,
          willBonus: hasWill ? pb : 0,
          advancedEffect: hasAdv ? rollType : null
        };
      }
    };
  },

  lightenTheLoad(actor, state, data) {
    need(supporterEnabled(actor), "Lighten the Load requires the Supporter class.");
    const warnings = [];
    levelWarning(warnings, actor, 11, "Lighten the Load");

    const reactions = getReactions(actor);
    if (!reactions?.available) {
      warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    }

    const triggerUuid = data.triggerUuid ?? null;
    const newTarget = data.newTarget ?? data.target ?? null;
    const newTargetUuid = newTarget?.uuid ?? data.targetUuid ?? null;
    const newTargetName = newTarget?.name ?? data.targetName ?? "second creature";

    if (newTargetUuid === actor.uuid) {
      warn(warnings, "selfTarget", "Lighten the Load cannot target yourself.");
    }
    if (newTargetUuid === triggerUuid) {
      warn(warnings, "sameTarget", "Lighten the Load must choose a different creature.");
    }

    const distance = Number(data.distance ?? 0);
    if (distance > 60) {
      warn(warnings, "range", `${newTargetName} is beyond 60 feet.`);
    }

    if (data.isSupplementary) {
      warn(warnings, "chaining", "Cannot use Lighten the Load on supplementary Aid Dice.");
    }

    const level = supporterLevel(actor) ?? 11;
    const die = aidDieSize(level);

    return {
      title: `Lighten the Load -> ${newTargetName}`,
      warnings,
      apply(next, receipt) {
        receipt.summary = `${actor.name} used Reaction to grant a free ${die} Aid Die to ${newTargetName} via Lighten the Load.`;
        receipt.result = { supplementary: true, dieSize: die, targetUuid: newTargetUuid };

        if (newTargetUuid) {
          receipt.targets = [{
            uuid: newTargetUuid,
            name: newTargetName,
            kind: "effect",
            featureId: "class-feature-supporter-11th-level-lighten-the-load-5608",
            tag: {
              label: `Supplementary Aid Die (${die})`,
              trigger: "turnStart",
              duration: 600,
              data: {
                supporterUuid: actor.uuid,
                dieSize: die,
                supporterLevel: level,
                supporterPB: pbForLevel(level),
                supplementary: true
              }
            },
            ready: true
          }];
        }
      }
    };
  }
};

for (const [name, plan] of Object.entries(CORE_PLANS)) {
  supporterUses.registerPlan(name, plan);
}
```

---

## 5. Test Suite Design & Verification Method

### 5.1 Test Suites to Author
1. `ak5e/test/supporter-rules.test.mjs`:
   - `checkLevel`: rejects non-integers, numbers outside [1, 20].
   - `pbForLevel`: checks +2 (Lv 1–4), +3 (Lv 5–8), +4 (Lv 9–12), +5 (Lv 13–16), +6 (Lv 17–20).
   - `hitPointsAtLevel`: 6 + CON at 1st; fixed mode (+4 + CON per level) and rolled mode (+roll + CON) with Math.max(1, gained).
   - `aidDieSize`: d8 at 1–6, d10 at 7–13, d12 at 14–20.
   - `supporterDC`: evaluates 8 + PB + mental modifier.
   - `supporterProfile` and `calculateSupporterProfile`: interface contract adherence, saves options, proficiencies.

2. `ak5e/test/supporter-features.test.mjs`:
   - Feature flags unlock at exact levels (Provide Aid Lv 1, Advanced Aid Lv 5, Lighten the Load Lv 11, Ever Reliable Lv 15, Self-Supportive Lv 18, Will Into Being Lv 20).
   - Resource pool `aidDie`: max formula matches mental mod; spend, refund, overMax clamping.
   - Ever Reliable: Short Rest recovery of `Math.ceil(max / 2)`; turn start regeneration of 1 die when at 0.
   - Self-Supportive: turn start grant of personal die.
   - Will Into Being: adds PB to roll.

3. `ak5e/test/supporter-progression.test.mjs`:
   - `previewSupporterSetup` and `applySupporterSetup`: generates features up to level, deterministic `contextKey`, idempotency on re-run.
   - `inspectSupporterFields`: returns choices for saves (CON, CHA, WIS), skills, aid ability, gear, ASIs, talents.
   - Save validation: rejects single save, rejects non-supporter saves (e.g. STR/DEX), accepts 2 unique from CON/CHA/WIS.
   - Skill validation: rejects invalid counts or duplicate skills, accepts 3 unique from Arts/Lore/Tech/Insight/Deception/Persuasion.
   - HP choices: range bounds [1, 6], fixed mode (4).
   - Starting gear: items vs 1300 LMD currency, idempotent re-run without duplicate grants.
   - Level-up from 1 to 4 and 1 to 20 without losing custom fields.

### 5.2 Verification Commands
Run the Supporter unit test suite:
```bash
npm run test:supporter
```
Run static verification tools:
```bash
node ak5e/tools/validate-files.mjs
node ak5e/tools/verify-generated-content.mjs
```
Run the full test suite across all base classes:
```bash
npm run test:base-classes
```
Run the full project test suite:
```bash
npm test
```

### 5.3 Invalidation Conditions
- Any deviation from source Hit Dice (1d6), HP formula (6+CON / 4+CON), or skill mapping (`arc`, `ak5elore`, `ak5etech`, `ins`, `dec`, `per`).
- Auto-rolling dice in Provide Aid or Advanced Aid cards instead of rendering interactive buttons.
- Duplicate feature items or corrupted HP on repeat calls to setup or progression.
- Lack of GM socket relay for applying Aid Die tags to unowned targets.
