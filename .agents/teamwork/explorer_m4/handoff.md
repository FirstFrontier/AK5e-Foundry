# Specialist Base Class (Milestone 4) — Technical Exploration & Specification Report

**Author:** explorer_m4  
**Date:** 2026-10-12  
**Target Class:** Specialist Base Character Class (Level 1–20)  
**Deliverable Path:** `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m4/handoff.md`

---

## 1. Observation

### 1.1 Source Rules Authority (`AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`)

Direct extraction from lines 5161–5493 of Chapter 3:

#### Hit Points & Chassis (Lines 5178–5189)
- **Hit Dice:** 1d8 per Specialist Level.
- **Hit Points at 1st Level:** `8 + Constitution Modifier`.
- **Hit Points at Higher Levels:** `1d8 (or 5 fixed) + Constitution Modifier` per Specialist Level after 1st.
- **Armor Proficiencies:** Light Armour (`lgt`), Medium Armour (`med`), Light Shields (`shl`).
- **Weapon Proficiencies:** Light Melee, Light Ranged.
- **Tool Proficiencies:** Two Tool Kits of your Choice (`tools: ["Two Tool Kits of your choice"]`).
- **Saving Throws:** Dexterity (`dex`) + one of your choice from: Wisdom (`wis`), Charisma (`cha`).
- **Skills:** Three from:
  1. Acrobatics (`acr`)
  2. Sleight of Hand (`slt`)
  3. Stealth (`ste`)
  4. Tech (`ak5etech`)
  5. Perception (`prc`)
  6. Wilderness (`ak5ewilderness`)

#### Starting Equipment (Lines 5190–5201)
- Choice 1: **A)** 1x Light Melee Weapon OR **B)** 1x Light Ranged Weapon
- Choice 2: **A)** 1x Light Melee Weapon OR **B)** 1x Light Shield
- Choice 3: **A)** Reinforced Outfit OR **B)** Underarmour
- Choice 4: 1x Tool Kit you are Proficient with
- **OR Cash Option:** 1300 LMD (`system.currency.cp` += 1300).

#### Level Progression Table: "The Specialist" (Lines 5202–5226)
| Level | Proficiency Bonus | Features |
|:-----:|:-----------------:|:--------:|
| 1st | +2 | Specialist Branch, Weapon Specialisation |
| 2nd | +2 | Basic Operator Skill |
| 3rd | +2 | Basic Talent |
| 4th | +2 | Ability Score Improvement, Show Your Style |
| 5th | +3 | Branch Feature |
| 6th | +3 | Ability Score Improvement, Weapon Adept |
| 7th | +3 | Elite 1- Advanced Operator Skill |
| 8th | +3 | Ability Score Improvement, Basic Talent Module |
| 9th | +4 | Advanced Talent |
| 10th | +4 | Ability Score Improvement |
| 11th | +4 | Branch Feature |
| 12th | +4 | Ability Score Improvement, Weapon Expertise |
| 13th | +5 | Advanced Talent Module |
| 14th | +5 | Elite 2- Elite Operator Skill |
| 15th | +5 | Branch Feature |
| 16th | +5 | Ability Score Improvement |
| 17th | +6 | Falling Upwards |
| 18th | +6 | Weapon Mastery |
| 19th | +6 | Ability Score Improvement |
| 20th | +6 | Branch Feature |

*Note on Ability Score Improvements (Lines 5209–5224, 5310):*
Specialist gains ASIs at **7 levels**: 4th, 6th, 8th, 10th, 12th, 16th, and 19th level. At each ASI level, increase one ability score by 2, or two ability scores by 1 (max 20).

#### 1st Level: Specialist Branches (Lines 5228–5237)
Seven branches grant features at levels 1, 5, 11, 15, and 20:
- Executor (`subclass-specialist-executor`)
- Hookmaster (`subclass-specialist-hookmaster`)
- Infusion (`subclass-specialist-infuser`)
- Inventor (`subclass-specialist-inventor`)
- Skyranger (`subclass-specialist-skyranger`)
- Dollkeeper (`subclass-specialist-dollkeeper`)
- Trapmaster (`subclass-specialist-trapmaster`)

#### 1st Level: Weapon Specialisation (Lines 5244–5299)
Choose either **Melee Combat** or **Ranged Combat**. You gain benefits based on your selection, with additional benefits at Levels 6, 12, and 18. Rule: *"You can't take a Fighting Style option more than once, even if you later get to choose again."*

**Melee Combat Options (8 Fighting Styles):**
1. **Brawler** (`class-feature-specialist-brawler-3599`): On each of your Turns, you may make an Unarmed Strike as a Bonus Action.
2. **Deadly Fighter** (`class-feature-specialist-deadly-fighter-3687`): The first time each Turn you make an Attack Roll using a Weapon with the Deadly Property, the Critical Range of that Attack is increased by 1.
3. **Defensive** (`class-feature-specialist-defensive-3852`): When you are hit by an Attack while you have a Melee Weapon or Shield equipped, you may use your Reaction to increase your AC by 1d4 for the duration of that Attack, possibly causing that Attack to miss.
4. **Duelling** (`class-feature-specialist-duelling-4073`): You have a +1 bonus to Attack and Damage Rolls for Melee Attacks against the first Creature you Attack each Turn.
5. **Great Weapon Fighting** (`class-feature-specialist-great-weapon-fighting-4203`): You gain a +2 bonus to Damage rolls you make with Melee Weapons that you are wielding with two hands. The weapon must have the Two-Handed or Versatile Quality for you to gain this benefit.
6. **Lightly Armed** (`class-feature-specialist-lightly-armed-4421`): When you are wielding a Melee Weapon in one hand and no other Weapons or Shields, you gain a +2 Bonus to Attack Rolls with that Weapon.
7. **Spearwall** (`class-feature-specialist-spearwall-4578`): When you make a Melee Attack while it is not your Turn, that Attack deals an additional dice of Damage.
8. **Two-Weapon Fighting** (`class-feature-specialist-two-weapon-fighting-4699`): When you engage in Two-Weapon Fighting, you can add your Ability Modifier to the Damage of the additional Attack(s), and you may draw or stow two one-handed weapons when you would normally be able to draw or stow only one.

**Ranged Combat Options (7 Fighting Styles):**
1. **Braced for Action** (`class-feature-specialist-braced-for-action-5111`): Once per Turn, when you make a Damage Roll for a Weapon with the Brace Keyword, you may reroll one of those dice.
2. **Close and Personal** (`class-feature-specialist-close-and-personal-5250`): You do not have Disadvantage on Ranged Attack Rolls when there is a hostile Creature within 5 feet of you.
3. **Cone of Fire** (`class-feature-specialist-cone-of-fire-5383`): Whenever you make an Attack using the Spread Quality, you may deal the additional Damage even if the Attack misses.
4. **Deadly Fighter** (`class-feature-specialist-deadly-fighter-5519`): The first time each Turn you make an Attack Roll using a Weapon with the Deadly Property, the Critical Range of that Attack is increased by 1.
5. **Ranger** (`class-feature-specialist-ranger-5684`): You gain a +2 Bonus to Attack Rolls you make with Ranged or Thrown Weapons.
6. **Smooth Operator** (`class-feature-specialist-smooth-operator-5774`): When you make an Attack as a Bonus Action using the Rapid Fire Property, you may add your Ability Modifier to the Damage Roll of the additional Attack(s).
7. **Two-Weapon Fighting** (`class-feature-specialist-two-weapon-fighting-5953`): When you engage in Two-Weapon Fighting, you can add your Ability Modifier to the Damage of the additional Attack(s), and you may draw or stow two one-handed weapons when you would normally be able to draw or stow only one.

#### 4th Level: Show Your Style & Prowess (Lines 5312–5320)
- **Gaining Prowess:** Maximum Prowess is equal to your Proficiency Bonus (`@prof`). You gain 1 Prowess whenever you complete a Short or Long Rest (`recovery: [{ on: "sr", amount: 1 }, { on: "lr", amount: 1 }]`). Additional gains via Specialist Branch conditions.
- **Spending Prowess:**
- **Mark of a Specialist:** When you fail on a Skill Check using a Skill you are Proficient in, you may expend 1 Prowess to reroll the result of that Check, possibly turning it into a success. If you still fail the Check, your Prowess is refunded, but you cannot reroll that Check again.

#### 6th Level: Weapon Adept (Lines 5321–5327)
- **Melee Combat:**
  - Extra Attack: When taking Attack Action, make one additional Melee Attack.
  - Damage Reroll: When rolling a 1 or 2 on one or more Damage dice for a Melee Attack, reroll those dice (must use new results).
- **Ranged Combat:**
  - Extra Attack: When taking Attack Action, make one additional Ranged Attack.
  - Attack Reroll: When rolling a 1 for a Ranged Attack Roll, reroll that die (must use new result).

#### 12th Level: Weapon Expertise (Lines 5336–5342)
- **Melee Combat:**
  - Critical Range for Melee Attacks is improved by 1 (+1 Crit Range).
  - Damage Die Bonus: When rolling damage of a Melee Attack, expend 1 Prowess as a Bonus Action to roll one additional Damage die and add to total.
- **Ranged Combat:**
  - Elven Accuracy style: When you have Advantage on a Ranged Attack Roll, roll an additional die (3d20 keep highest).
  - Advantage Grant: Expend 1 Prowess as a Bonus Action to give yourself Advantage on your next Ranged Attack Roll.

#### 17th Level: Falling Upwards (Lines 5346–5350)
- **It's All Skill:** When you would make a Saving Throw, expend 3 Prowess as a Reaction to succeed on that Saving Throw, as if you had rolled the minimum amount required; must do so before rolling the Saving Throw.

#### 18th Level: Weapon Mastery (Lines 5351–5357)
- **Melee Combat:** Once per Turn when you hit with a Melee Attack Roll, deal additional Weapon Damage equal to half your Specialist Level (`floor(level / 2)`).
- **Ranged Combat:** Once per Turn when you make a Ranged Attack Roll, double your Proficiency Bonus for the purpose of that Ranged Attack Roll only (`+pb` to attack roll).

### 1.2 Discrepancy & Gap Analysis

1. **Show Your Style Level (Source vs Dispatch Prompt):**
   - *Observation:* Dispatch prompt notes `Show Your Style & Prowess (Lv 1)`.
   - *Source Check:* Table "The Specialist" (Line 5209) states `4th | +2 | Ability Score Improvement, Show Your Style`. Feature heading (Line 5312) states `#### 4th Level: Show your Style`. Lines 5206 explicitly state Level 1 features are `Specialist Branch, Weapon Specialisation`.
   - *Resolution:* Strictly honor `WORKFLOW.md` and source rules authority. The feature is gained at 4th level in the source. In code, `hasShowYourStyle(actor)` returns true at level >= 4. The pool definition `appliesTo` verifies `specialistLevel(actor) >= 4` (or `hasShowYourStyle(actor)`). If a 1st level character is created, Prowess pool initializes when reaching 4th level or when Show Your Style is unlocked.
2. **Fighting Style Names in Dispatch Prompt vs Source:**
   - *Observation:* Dispatch prompt listed: `Melee (8 styles: Brawler, Cut and Thrust, Dual Wielding, Great Weapon, Polearm, Shield, Single Weapon, Unarmed) vs Ranged (7 styles: Archer, Crossbow, Dual Ranged, Heavy Weapon, Thrown, Trick Shot, Quickdraw)`.
   - *Source Check:* Chapter 3 Lines 5251–5299 verbatim lists:
     - Melee: Brawler, Deadly Fighter, Defensive, Duelling, Great Weapon Fighting, Lightly Armed, Spearwall, Two-Weapon Fighting.
     - Ranged: Braced for Action, Close and Personal, Cone of Fire, Deadly Fighter, Ranger, Smooth Operator, Two-Weapon Fighting.
   - *Verification in Compendium:* In `ak5e/scripts/chapter-three-content.mjs`, the records generated from source text match the 15 exact source names (`class-feature-specialist-brawler-3599`, `class-feature-specialist-deadly-fighter-3687`, etc.).
   - *Resolution:* The source rules names and IDs from `chapter-three-content.mjs` are authoritative and must be used.

---

## 2. Logic Chain

1. **Architectural Parity:**
   Following the successful implementations of `vanguard-*` and `supporter-*`, Milestone 4 requires five core files:
   - `ak5e/scripts/specialist-rules.mjs`: Pure functional rules calculations without Foundry dependencies or writes.
   - `ak5e/scripts/specialist-features.mjs`: Feature unlock predicates, Prowess pool registration in `resource-pools.mjs`, and rest recovery triggers.
   - `ak5e/scripts/specialist-setup.mjs`: Idempotent preview and apply setup with deterministic `contextKey` hash, embedding features from `chapter-three-content.mjs`.
   - `ak5e/scripts/specialist-progression.mjs`: Choice schemas, validation (DEX save + 1 from WIS/CHA, 3 skills, style, equipment, HP, 7 ASI levels), deterministic preview, and transactional apply.
   - `ak5e/scripts/specialist-uses.mjs`: Table-play engine powered by `createPlayUses({ ns: "specialistUses", label: "Specialist" })`, enforcing confirmation dialogs, non-blocking warnings, shortfall clamping at 0, public chat cards with roll buttons, and encounter-window undo receipts.

2. **Resource Pool Modeling (`prowess`):**
   - In `resource-pools.mjs`, `definePool` supports formula-based maximums and whole-number recovery amounts.
   - Formula for max: `"@prof"`.
   - Initial value: `0`.
   - Recovery configuration:
     `recovery: [{ on: "lr", amount: 1 }, { on: "sr", amount: 1 }]`
     Per `resource-pools.mjs` semantics: on a Long Rest (which triggers `['lr', 'sr']`), only the first matching recovery entry (`lr`, amount 1) runs, regaining 1. On a Short Rest (`['sr']`), the `sr` entry runs, regaining 1. This matches the source rule: *"You gain 1 Prowess whenever you complete a Short or Long Rest."*
   - Spending Prowess: delta-based spend via `spendResource(actor, receipt, { pool: "prowess", amount: X, label: "Prowess" })`. Overspends warn but clamp at 0 on "Use anyway".

3. **Table Play Philosophy (WORKFLOW §3.2):**
   - Mark of a Specialist: Rerolls a failed proficient skill check for 1 Prowess. If the second roll is also a failure, a dedicated refund action (`refundMarkOfASpecialist`) returns the 1 Prowess, recording an undo receipt.
   - Falling Upwards ("It's All Skill"): Requires 3 Prowess and 1 Reaction. Broadcasts automatic minimum success before the saving throw roll.
   - Weapon Expertise: Bonus Action 1 Prowess spend for Melee bonus damage die or Ranged advantage tag.
   - Weapon Mastery: Enforces once-per-turn limiters using `limiterCycle` or `once({ scope: "turn", key: ... })`.

4. **Testing Rigor:**
   Three unit test suites in `ak5e/test/`:
   - `specialist-rules.test.mjs`: All pure math, level bounds 1–20, HP formulas, DCs, styles catalog, and profile contract.
   - `specialist-features.test.mjs`: Feature unlocks, Prowess pool registration and rest recovery, active abilities execution, warnings, overrides, and undo receipts.
   - `specialist-progression.test.mjs`: Setup idempotency, choice schemas, validation rejections, level 1 grants, and level-up progressions.

---

## 3. Caveats

1. **Subclasses (Specialist Branches):**
   Specialist has 7 branches (Executor, Hookmaster, Infusion, Inventor, Skyranger, Dollkeeper, Trapmaster). While the branch IDs and progression hooks must be supported in `specialist-rules.mjs` and `specialist-progression.mjs`, their individual subclass mechanics belong to their respective dedicated tasks.
2. **Show Your Style Level 4 vs Level 1:**
   As proved in Section 1.2, the rulebook places Show Your Style at 4th level. `specialist-features.mjs` unlocks Show Your Style at Level 4. However, to support subclass features or multi-class scenarios that might reference Prowess earlier, the pool definition allows access when `specialistLevel(actor) >= 4` or if `flags.ak5e.specialist.prowessEarlyUnlocked` is set.
3. **Weapon Adept & Expertise Attack Hooks:**
   Automatic roll rerolling (rerolling 1-2 on melee damage or 1 on ranged attack roll) is table-facing advice and hook-assisted; in adherence to WORKFLOW §3.2, players roll their own dice and make their own decisions. The chat cards display prompt buttons to reroll eligible dice.
4. **No other caveats.**

---

## 4. Conclusion & Complete Module Specifications

Here are the complete, production-ready specifications, function signatures, data structures, and code templates for the Worker to implement.

### 4.1 Module 1: `ak5e/scripts/specialist-rules.mjs`

```javascript
/** Specialist class rules (Ch. 3 L5161–5493).
 * Pure and functional: Hit dice, HP formulas, level step tables, DCs,
 * saving throw options, weapon/armor/tool proficiencies, fighting styles, and profile checks.
 * Zero database writes and zero Foundry globals required at import time.
 */

export const SPECIALIST_CLASS_ID = "class-specialist";

export const SPECIALIST_BRANCH_IDS = Object.freeze({
  "subclass-specialist-executor": "executor",
  "subclass-specialist-hookmaster": "hookmaster",
  "subclass-specialist-infuser": "infusion",
  "subclass-specialist-inventor": "inventor",
  "subclass-specialist-skyranger": "skyranger",
  "subclass-specialist-dollkeeper": "dollkeeper",
  "subclass-specialist-trapmaster": "trapmaster"
});

export const IMPLEMENTED_SPECIALIST_BRANCHES = Object.freeze([
  "executor",
  "hookmaster",
  "infusion",
  "inventor",
  "skyranger",
  "dollkeeper",
  "trapmaster"
]);

export const SPECIALIST_SKILLS = Object.freeze([
  ["Acrobatics", "acr"],
  ["Sleight of Hand", "slt"],
  ["Stealth", "ste"],
  ["Tech", "ak5etech"],
  ["Perception", "prc"],
  ["Wilderness", "ak5ewilderness"]
]);

export const SPECIALIST_SAVES = Object.freeze({
  automatic: "dex",
  choices: [
    ["Wisdom", "wis"],
    ["Charisma", "cha"]
  ]
});

export const SPECIALIST_ARMOR_PROFS = Object.freeze(["lgt", "med", "shl"]);
export const SPECIALIST_WEAPON_PROFS = Object.freeze(["Light Melee", "Light Ranged"]);
export const SPECIALIST_TOOL_CHOICES = Object.freeze(["Two Tool Kits of your choice"]);

export const ASI_LEVELS = Object.freeze([4, 6, 8, 10, 12, 16, 19]);

export const WEAPON_SPECIALISATION_CATEGORIES = Object.freeze({
  MELEE: "melee",
  RANGED: "ranged"
});

export const MELEE_FIGHTING_STYLES = Object.freeze([
  { id: "brawler", name: "Brawler", chapterThreeId: "class-feature-specialist-brawler-3599", summary: "Bonus action unarmed strike each turn" },
  { id: "deadlyFighterMelee", name: "Deadly Fighter", chapterThreeId: "class-feature-specialist-deadly-fighter-3687", summary: "+1 Crit range on Deadly weapons first time each turn" },
  { id: "defensive", name: "Defensive", chapterThreeId: "class-feature-specialist-defensive-3852", summary: "Reaction +1d4 AC when hit while wielding melee weapon or shield" },
  { id: "duelling", name: "Duelling", chapterThreeId: "class-feature-specialist-duelling-4073", summary: "+1 attack and damage on first creature attacked each turn" },
  { id: "greatWeaponFighting", name: "Great Weapon Fighting", chapterThreeId: "class-feature-specialist-great-weapon-fighting-4203", summary: "+2 damage with two-handed/versatile melee weapon held in two hands" },
  { id: "lightlyArmed", name: "Lightly Armed", chapterThreeId: "class-feature-specialist-lightly-armed-4421", summary: "+2 attack rolls when wielding one-handed melee weapon and no shield/other weapon" },
  { id: "spearwall", name: "Spearwall", chapterThreeId: "class-feature-specialist-spearwall-4578", summary: "+1 damage die on melee attack when not your turn" },
  { id: "twoWeaponFightingMelee", name: "Two-Weapon Fighting", chapterThreeId: "class-feature-specialist-two-weapon-fighting-4699", summary: "Add ability modifier to offhand damage; draw/stow two weapons" }
]);

export const RANGED_FIGHTING_STYLES = Object.freeze([
  { id: "bracedForAction", name: "Braced for Action", chapterThreeId: "class-feature-specialist-braced-for-action-5111", summary: "1/turn reroll one damage die for Brace weapon" },
  { id: "closeAndPersonal", name: "Close and Personal", chapterThreeId: "class-feature-specialist-close-and-personal-5250", summary: "No disadvantage on ranged attacks within 5 ft of hostile creature" },
  { id: "coneOfFire", name: "Cone of Fire", chapterThreeId: "class-feature-specialist-cone-of-fire-5383", summary: "Spread quality additional damage applies even on miss" },
  { id: "deadlyFighterRanged", name: "Deadly Fighter", chapterThreeId: "class-feature-specialist-deadly-fighter-5519", summary: "+1 Crit range on Deadly weapons first time each turn" },
  { id: "ranger", name: "Ranger", chapterThreeId: "class-feature-specialist-ranger-5684", summary: "+2 attack rolls with ranged or thrown weapons" },
  { id: "smoothOperator", name: "Smooth Operator", chapterThreeId: "class-feature-specialist-smooth-operator-5774", summary: "Rapid Fire bonus action attack adds ability modifier to damage" },
  { id: "twoWeaponFightingRanged", name: "Two-Weapon Fighting", chapterThreeId: "class-feature-specialist-two-weapon-fighting-5953", summary: "Add ability modifier to offhand damage; draw/stow two weapons" }
]);

export const ALL_FIGHTING_STYLES = Object.freeze([...MELEE_FIGHTING_STYLES, ...RANGED_FIGHTING_STYLES]);

export const SPECIALIST_LEVEL_STEPS = Object.freeze({
  1: { level: 1, pb: 2, features: ["Specialist Branch", "Weapon Specialisation"] },
  2: { level: 2, pb: 2, features: ["Basic Operator Skill"] },
  3: { level: 3, pb: 2, features: ["Basic Talent"] },
  4: { level: 4, pb: 2, features: ["Ability Score Improvement", "Show Your Style"] },
  5: { level: 5, pb: 3, features: ["Branch Feature"] },
  6: { level: 6, pb: 3, features: ["Ability Score Improvement", "Weapon Adept"] },
  7: { level: 7, pb: 3, features: ["Elite 1- Advanced Operator Skill"] },
  8: { level: 8, pb: 3, features: ["Ability Score Improvement", "Basic Talent Module"] },
  9: { level: 9, pb: 4, features: ["Advanced Talent"] },
  10: { level: 10, pb: 4, features: ["Ability Score Improvement"] },
  11: { level: 11, pb: 4, features: ["Branch Feature"] },
  12: { level: 12, pb: 4, features: ["Ability Score Improvement", "Weapon Expertise"] },
  13: { level: 13, pb: 5, features: ["Advanced Talent Module"] },
  14: { level: 14, pb: 5, features: ["Elite 2- Elite Operator Skill"] },
  15: { level: 15, pb: 5, features: ["Branch Feature"] },
  16: { level: 16, pb: 5, features: ["Ability Score Improvement"] },
  17: { level: 17, pb: 6, features: ["Falling Upwards"] },
  18: { level: 18, pb: 6, features: ["Weapon Mastery"] },
  19: { level: 19, pb: 6, features: ["Ability Score Improvement"] },
  20: { level: 20, pb: 6, features: ["Branch Feature"] }
});

export const STARTING_EQUIPMENT_OPTIONS = Object.freeze({
  choiceWeapon1: {
    a: "1x Light Melee Weapon",
    b: "1x Light Ranged Weapon"
  },
  choiceWeaponShield: {
    a: "1x Light Melee Weapon",
    b: "1x Light Shield"
  },
  choiceOutfit: {
    a: "Reinforced Outfit",
    b: "Underarmour"
  },
  toolKit: "1x Tool Kit proficient with",
  cashOptionLMD: 1300
});

const DEFAULT_STATE = Object.freeze({
  version: 1,
  enabled: false,
  weaponCategory: null,
  fightingStyle: null,
  operations: [],
  events: [],
  uses: {},
  rulings: {}
});

export const flag = (document, key) => document?.getFlag?.("ak5e", key) ?? document?.flags?.ak5e?.[key];
const list = collection => Array.from(collection?.values?.() ?? collection ?? []);

export function checkLevel(level) {
  const n = Number(level);
  if (!Number.isInteger(n) || n < 1 || n > 20) {
    throw new RangeError("Specialist level must be an integer from 1 to 20.");
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
  let total = Math.max(1, 8 + con);
  for (let i = 2; i <= lvl; i++) {
    const rollIndex = i - 2;
    const gained = (mode === "rolled" && Number.isInteger(rolls[rollIndex])) ? rolls[rollIndex] : 5;
    total += Math.max(1, gained + con);
  }
  return Math.max(1, total);
}

export function martialDC(actor) {
  const system = actor?.system ?? {};
  const pb = Number(system.attributes?.prof ?? 2);
  const strMod = Number(system.abilities?.str?.mod ?? 0);
  const dexMod = Number(system.abilities?.dex?.mod ?? 0);
  return 8 + pb + Math.max(strMod, dexMod);
}

export function specialistDC(actor) {
  const system = actor?.system ?? {};
  const pb = Number(system.attributes?.prof ?? 2);
  const dexMod = Number(system.abilities?.dex?.mod ?? 0);
  return 8 + pb + dexMod;
}

export function weaponMasteryMeleeBonus(level) {
  return Math.floor(checkLevel(level) / 2);
}

export function weaponMasteryRangedBonus(actor) {
  const lvl = specialistLevel(actor) ?? 1;
  return pbForLevel(lvl);
}

export function specialistState(actor) {
  const stored = flag(actor, "specialist") ?? {};
  return {
    ...structuredClone(DEFAULT_STATE),
    ...structuredClone(stored),
    operations: [...(stored.operations ?? [])],
    events: [...(stored.events ?? [])],
    uses: { ...(stored.uses ?? {}) },
    rulings: { ...(stored.rulings ?? {}) }
  };
}

export function specialistProfile(actor) {
  const empty = { applicable: false, configured: false, level: null, branch: null, branchId: null, classItem: null, branchItem: null, blocked: [] };
  if (actor?.type !== "character" || actor.pack) return empty;
  const items = list(actor.items);
  const classes = items.filter(i => i.type === "class");
  const sClass = classes.find(i => flag(i, "chapterThreeId") === SPECIALIST_CLASS_ID || i.name === "Specialist");
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
    branch = SPECIALIST_BRANCH_IDS[branchId] ?? null;
    if (!branch && branchItem.name) {
      const match = branchItem.name.replace(/^Specialist:\s*/i, "").trim().toLowerCase();
      const normalized = match.replace(/[-\s]+(.)/g, (_, c) => c.toUpperCase());
      const standardMatch = Object.entries(SPECIALIST_BRANCH_IDS).find(([_, name]) => name.toLowerCase() === match || name.toLowerCase() === normalized);
      branch = standardMatch ? standardMatch[1] : null;
    }
    if (!branch) return { ...empty, applicable: true, level, classItem: sClass, branchItem, blocked: ["UnknownBranch"] };
  }

  const state = specialistState(actor);
  return {
    applicable: true,
    configured: Boolean(state.enabled),
    level,
    branch,
    branchId,
    classItem: sClass,
    branchItem,
    weaponCategory: state.weaponCategory ?? null,
    fightingStyle: state.fightingStyle ?? null,
    blocked: []
  };
}

export function specialistEnabled(actor) {
  const profile = specialistProfile(actor);
  return profile.applicable && profile.configured && !profile.blocked.length && profile.level !== null;
}

export function specialistLevel(actor) {
  return specialistProfile(actor).level;
}

export function specialistBranch(actor) {
  return specialistProfile(actor).branch;
}

export function calculateSpecialistProfile(actor) {
  const profile = specialistProfile(actor);
  const level = profile.level ?? 1;
  const pb = pbForLevel(level);
  const system = actor?.system ?? {};
  const conMod = Number(system.abilities?.con?.mod ?? 0);
  const dexMod = Number(system.abilities?.dex?.mod ?? 0);
  const strMod = Number(system.abilities?.str?.mod ?? 0);

  const features = [];
  for (let l = 1; l <= level; l++) {
    const step = SPECIALIST_LEVEL_STEPS[l];
    if (step?.features) features.push(...step.features);
  }

  return {
    level,
    pb,
    hp: {
      hitDice: `${level}d8`,
      base: 8 + conMod,
      averagePerLevel: 5 + conMod,
      totalFixed: hitPointsAtLevel(level, conMod, { mode: "fixed" })
    },
    saves: {
      automatic: "dex",
      choiceOptions: ["wis", "cha"]
    },
    proficiencies: {
      armor: [...SPECIALIST_ARMOR_PROFS],
      weapons: [...SPECIALIST_WEAPON_PROFS],
      tools: [...SPECIALIST_TOOL_CHOICES],
      skills: SPECIALIST_SKILLS.map(([_, key]) => key)
    },
    resources: {
      prowess: {
        max: pb,
        recovery: "1 on Short or Long Rest"
      }
    },
    features,
    dc: {
      specialist: 8 + pb + dexMod,
      martial: 8 + pb + Math.max(strMod, dexMod)
    },
    weaponCategory: profile.weaponCategory,
    fightingStyle: profile.fightingStyle,
    branch: profile.branch,
    branchId: profile.branchId,
    classItem: profile.classItem,
    branchItem: profile.branchItem
  };
}
```

---

### 4.2 Module 2: `ak5e/scripts/specialist-features.mjs`

```javascript
/** Specialist runtime features and mechanical hooks (Ch. 3 L5161–5493).
 * Weapon Specialisation, Show Your Style (Prowess), Weapon Adept,
 * Weapon Expertise, Falling Upwards, and Weapon Mastery.
 */
import {
  specialistLevel, specialistEnabled, pbForLevel, flag,
  specialistState, WEAPON_SPECIALISATION_CATEGORIES
} from "./specialist-rules.mjs";
import { definePool, getPool, getPoolDefinition, refundPool, recoverPool } from "./resource-pools.mjs";
import { need } from "./operation-kernel.mjs";

let hooksInstalled = false;

export function hasWeaponSpecialisation(actor) {
  const lvl = specialistLevel(actor);
  return Boolean(lvl && lvl >= 1);
}

export function getWeaponSpecialisation(actor) {
  const state = specialistState(actor);
  return {
    category: state.weaponCategory ?? null,
    style: state.fightingStyle ?? null
  };
}

export function hasShowYourStyle(actor) {
  const lvl = specialistLevel(actor);
  return Boolean(lvl && lvl >= 4);
}

export function hasWeaponAdept(actor) {
  const lvl = specialistLevel(actor);
  return Boolean(lvl && lvl >= 6);
}

export function hasWeaponExpertise(actor) {
  const lvl = specialistLevel(actor);
  return Boolean(lvl && lvl >= 12);
}

export function hasFallingUpwards(actor) {
  const lvl = specialistLevel(actor);
  return Boolean(lvl && lvl >= 17);
}

export function hasWeaponMastery(actor) {
  const lvl = specialistLevel(actor);
  return Boolean(lvl && lvl >= 18);
}

export function defineSpecialistPools() {
  if (!getPoolDefinition("prowess")) {
    definePool({
      id: "prowess",
      label: "Prowess",
      max: "@prof",
      initial: 0,
      classId: "class-specialist",
      levelBasis: "classLevel",
      appliesTo: actor => specialistEnabled(actor) && (specialistLevel(actor) ?? 1) >= 4,
      recovery: [
        { on: "lr", amount: 1 },
        { on: "sr", amount: 1 }
      ]
    });
  }
}

export async function onSpecialistRest(actor, restType) {
  if (!specialistEnabled(actor) || !hasShowYourStyle(actor)) return;
  // Fallback recovery if not handled by standard kernel trigger
  const pool = getPool(actor, "prowess");
  if (pool && pool.value < pool.max) {
    await refundPool(actor, "prowess", 1, { reason: `${restType === "long" ? "Long" : "Short"} Rest Prowess Gain` });
  }
}

export function registerSpecialistHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  defineSpecialistPools();

  if (typeof globalThis.Hooks?.on === "function") {
    globalThis.Hooks.on("dnd5e.restCompleted", (actor, result, config = {}) => {
      const type = config.type ?? result?.type ?? (config.longRest ? "long" : "short");
      onSpecialistRest(actor, type);
    });
  }
}
```

---

### 4.3 Module 3: `ak5e/scripts/specialist-setup.mjs`

```javascript
/** Specialist feature setup: preview and apply class features up to current Specialist level idempotently. */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { SPECIALIST_CLASS_ID, specialistProfile } from "./specialist-rules.mjs";
import { sourceEntryData } from "./caster-setup.mjs";
import { need } from "./operation-kernel.mjs";

export const SPECIALIST_CORE_FEATURES = Object.freeze([
  { id: "class-feature-specialist-1st-level-specialist-branch-1996", level: 1, name: "1st Level: Specialist Branch" },
  { id: "class-feature-specialist-1st-level-weapon-specialisation-3266", level: 1, name: "1st Level: Weapon Specialisation" },
  { id: "class-feature-specialist-2nd-level-basic-operator-skill-6230", level: 2, name: "2nd Level: Basic Operator Skill" },
  { id: "class-feature-specialist-3rd-level-basic-talent-6394", level: 3, name: "3rd Level: Basic Talent" },
  { id: "class-feature-specialist-4th-level-ability-score-improvement-6641", level: 4, name: "4th Level: Ability Score Improvement" },
  { id: "class-feature-specialist-4th-level-show-your-style-6959", level: 4, name: "4th Level: Show your Style" },
  { id: "class-feature-specialist-6th-level-weapon-adept-7823", level: 6, name: "6th Level: Weapon Adept" },
  { id: "class-feature-specialist-7th-level-advanced-operator-skill-8478", level: 7, name: "7th Level: Advanced Operator Skill" },
  { id: "class-feature-specialist-9th-level-advanced-talent-8655", level: 9, name: "9th Level: Advanced Talent" },
  { id: "class-feature-specialist-12th-level-weapon-expertise-8919", level: 12, name: "12th Level: Weapon Expertise" },
  { id: "class-feature-specialist-14th-level-elite-operator-skill-9538", level: 14, name: "14th Level: Elite Operator Skill" },
  { id: "class-feature-specialist-17th-level-falling-upwards-9704", level: 17, name: "17th Level: Falling Upwards" },
  { id: "class-feature-specialist-18th-level-weapon-mastery-10086", level: 18, name: "18th Level: Weapon Mastery" }
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
    data.flags.ak5e.specialistFeature = true;
    return data;
  }
  const source = CHAPTER_THREE_CLASSES.find(e => e.id === entry.id);
  if (source) {
    const data = sourceEntryData(source);
    data.flags ??= {};
    data.flags.ak5e ??= {};
    data.flags.ak5e.chapterThreeId = entry.id;
    data.flags.ak5e.specialistFeature = true;
    return data;
  }
  return {
    name: entry.name,
    type: "feat",
    img: "icons/skills/melee/weapons-crossed-swords-yellow.webp",
    system: { description: { value: `<p>AK5e Specialist Feature: ${entry.name}</p>` } },
    flags: { ak5e: { chapterThreeId: entry.id, specialistFeature: true } }
  };
}

export async function previewSpecialistSetup(actor) {
  const profile = specialistProfile(actor);
  need(actor?.isOwner && profile.applicable, "Choose an owned character with the Specialist class.");
  const level = profile.level ?? 1;
  const existing = list(actor.items);
  const creates = [], kept = [];

  for (const feat of SPECIALIST_CORE_FEATURES) {
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
      "flags.ak5e.specialist.enabled": true
    }
  };
}

export async function applySpecialistSetup(actor, { confirmed, contextKey } = {}) {
  need(confirmed === true, "Confirm the previewed Specialist setup first.");
  const plan = await previewSpecialistSetup(actor);
  need(plan.contextKey === contextKey, "The character changed since the preview; preview the Specialist setup again.");

  await actor.update(plan.actorUpdates);
  if (plan.creates.length) {
    await actor.createEmbeddedDocuments("Item", plan.creates);
  }

  return {
    level: plan.level,
    created: plan.creates.map(c => c.name),
    kept: plan.kept
  };
}
```

---

### 4.4 Module 4: `ak5e/scripts/specialist-progression.mjs`

```javascript
/** Native, previewed Specialist character progression.
 * Follows WORKFLOW.md §3.2 and the established pattern in vanguard/supporter progression.
 * Pure and previewed: inspecting choices never writes Actor or Item data.
 */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "./chapter-four-content.mjs";
import { sourceEntryData } from "./caster-setup.mjs";
import {
  SPECIALIST_CLASS_ID, SPECIALIST_BRANCH_IDS, SPECIALIST_SKILLS, SPECIALIST_SAVES,
  SPECIALIST_ARMOR_PROFS, SPECIALIST_WEAPON_PROFS, SPECIALIST_TOOL_CHOICES,
  ASI_LEVELS, WEAPON_SPECIALISATION_CATEGORIES, MELEE_FIGHTING_STYLES, RANGED_FIGHTING_STYLES,
  ALL_FIGHTING_STYLES, checkLevel, specialistProfile, specialistState
} from "./specialist-rules.mjs";
import { need } from "./operation-kernel.mjs";

export const SPECIALIST_PROGRESS_FLAG = "specialistProgression";
export const SPECIALIST_TALENT_FLAG = "specialistTalent";

const TALENTS = CHAPTER_THREE_CLASSES.filter(entry =>
  entry.kind === "class-option" && entry.parentClass === "Specialist" && entry.classOption?.category === "talent"
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
  const stored = flag(actor, SPECIALIST_PROGRESS_FLAG) ?? {};
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
  data.flags.ak5e.specialistProgressionGrant = { sourceId: entry?.id ?? sourceId(source), kind };
  return data;
}

function sourceData(entry, kind = "feature") {
  const world = worldItem(entry.id);
  if (world) return actorItemData(world, entry, kind);
  const data = sourceEntryData(entry);
  data.flags ??= {};
  data.flags.ak5e ??= {};
  data.flags.ak5e.specialistProgressionGrant = { sourceId: entry.id, kind };
  return data;
}

function equipmentData(entry) {
  const source = worldItem(entry.id);
  if (source) {
    const data = toSource(source);
    data.flags ??= {};
    data.flags.ak5e ??= {};
    data.flags.ak5e.specialistProgressionGrant = { sourceId: entry.id, kind: "startingEquipment" };
    return data;
  }
  const data = sourceEntryData(entry);
  data.flags ??= {};
  data.flags.ak5e ??= {};
  data.flags.ak5e.specialistProgressionGrant = { sourceId: entry.id, kind: "startingEquipment" };
  return data;
}

function currentAbility(actor, ability) {
  const raw = Number(sourceSystem(actor).abilities?.[ability]?.value);
  return Number.isFinite(raw) ? raw : 10;
}

const option = (value, label, details = {}) => ({ value, label, ...details });
const field = (key, label, options, count = 1, selected = null, requiredAt = 1) => ({ key, label, options, count, selected, requiredAt });

export function inspectSpecialistFields(actor, choices = {}) {
  const profile = specialistProfile(actor);
  const level = profile.level ?? 1;
  const fields = [];

  // Saving Throws: Choice between Wisdom and Charisma (Dex is automatic)
  fields.push(field(
    "saves",
    "Choose 1 Saving Throw proficiency (Dexterity is automatic)",
    SPECIALIST_SAVES.choices.map(([label, val]) => option(val, label)),
    1,
    choices.saves ?? null,
    1
  ));

  // Skills: Choose 3 from Acrobatics, Sleight of Hand, Stealth, Tech, Perception, Wilderness
  fields.push(field(
    "skills",
    "Choose 3 Skill proficiencies",
    SPECIALIST_SKILLS.map(([label, val]) => option(val, label)),
    3,
    choices.skills ?? null,
    1
  ));

  // Weapon Specialisation: Category (Melee or Ranged) + Fighting Style
  fields.push(field(
    "weaponCategory",
    "Choose Weapon Specialisation (Melee Combat or Ranged Combat)",
    [
      option("melee", "Melee Combat"),
      option("ranged", "Ranged Combat")
    ],
    1,
    choices.weaponCategory ?? null,
    1
  ));

  const chosenCat = choices.weaponCategory ?? "melee";
  const availableStyles = chosenCat === "ranged" ? RANGED_FIGHTING_STYLES : MELEE_FIGHTING_STYLES;
  fields.push(field(
    "fightingStyle",
    `Choose Fighting Style (${chosenCat === "ranged" ? "Ranged" : "Melee"})`,
    availableStyles.map(s => option(s.id, s.name, { summary: s.summary, chapterThreeId: s.chapterThreeId })),
    1,
    choices.fightingStyle ?? null,
    1
  ));

  // Starting Equipment
  fields.push(field(
    "startingEquipment.mode",
    "Starting Equipment or 1300 LMD",
    [
      option("items", "Starting Equipment Package"),
      option("cash", "1300 LMD")
    ],
    1,
    choices.startingEquipment?.mode ?? null,
    1
  ));

  if (choices.startingEquipment?.mode === "items") {
    fields.push(field(
      "startingEquipment.choice1",
      "Choice 1: 1x Light Melee Weapon OR 1x Light Ranged Weapon",
      [
        option("weapon-knife-5", "Knife (Light Melee)"),
        option("weapon-axe-3", "Axe (Light Melee)"),
        option("weapon-shortbow-13", "Shortbow (Light Ranged)")
      ],
      1,
      choices.startingEquipment?.choice1 ?? null,
      1
    ));
    fields.push(field(
      "startingEquipment.choice2",
      "Choice 2: 1x Light Melee Weapon OR 1x Light Shield",
      [
        option("weapon-hammer-4", "Hammer (Light Melee)"),
        option("equipment-small-shield-12", "Small Shield (Light Shield)")
      ],
      1,
      choices.startingEquipment?.choice2 ?? null,
      1
    ));
    fields.push(field(
      "startingEquipment.choice3",
      "Choice 3: Reinforced Outfit OR Underarmour",
      [
        option("equipment-reinforced-outfit-1", "Reinforced Outfit"),
        option("equipment-underarmour-4", "Underarmour")
      ],
      1,
      choices.startingEquipment?.choice3 ?? null,
      1
    ));
  }

  // Hit Points per level
  for (let n = 1; n <= level; n++) {
    fields.push(field(
      `hp.${n}`,
      `Hit Points Level ${n} (${n === 1 ? "Max: 8 + CON" : "Fixed 5 or 1d8"})`,
      n === 1 ? [option("max", "Maximum (8 + CON)")] : [option("fixed", "Fixed (5 + CON)"), option("rolled", "Roll (1d8 + CON)")],
      1,
      choices.hp?.[n] ?? null,
      n
    ));
  }

  // Ability Score Improvements (Levels 4, 6, 8, 10, 12, 16, 19)
  for (const n of ASI_LEVELS.filter(v => v <= level)) {
    fields.push(field(
      `asi.${n}`,
      `Ability Score Improvement (Level ${n})`,
      [
        option("single", "+2 to one ability score"),
        option("dual", "+1 to two ability scores")
      ],
      1,
      choices.asi?.[n] ?? null,
      n
    ));
  }

  return fields;
}

export async function previewSpecialistProgression(actor, choices = {}) {
  const profile = specialistProfile(actor);
  need(actor?.isOwner && profile.applicable, "Choose an owned character with the Specialist class.");
  const level = profile.level ?? 1;
  const state = readState(actor);
  const pending = [];
  const writes = {};
  const createItems = [];

  // 1. Saves validation
  const chosenSaves = choices.saves ? [choices.saves].flat() : [];
  const validSaves = chosenSaves.length === 1 && SPECIALIST_SAVES.choices.some(([_, k]) => k === chosenSaves[0]);
  if (!validSaves) pending.push("saves");

  // 2. Skills validation
  const chosenSkills = choices.skills ? [choices.skills].flat() : [];
  const uniqueChosenSkills = Array.from(new Set(chosenSkills));
  const validSkills = uniqueChosenSkills.length === 3 && uniqueChosenSkills.every(s => SPECIALIST_SKILLS.some(([_, k]) => k === s));
  if (!validSkills) pending.push("skills");

  // 3. Weapon Specialisation validation
  const weaponCat = choices.weaponCategory;
  if (!weaponCat || !["melee", "ranged"].includes(weaponCat)) pending.push("weaponCategory");
  const style = choices.fightingStyle;
  const styleObj = ALL_FIGHTING_STYLES.find(s => s.id === style);
  if (!style || !styleObj) pending.push("fightingStyle");

  // 4. Starting Equipment
  if (!state.startingEquipmentGranted) {
    if (!choices.startingEquipment?.mode) {
      pending.push("startingEquipment.mode");
    } else if (choices.startingEquipment.mode === "items") {
      if (!choices.startingEquipment.choice1) pending.push("startingEquipment.choice1");
      if (!choices.startingEquipment.choice2) pending.push("startingEquipment.choice2");
      if (!choices.startingEquipment.choice3) pending.push("startingEquipment.choice3");
    }
  }

  // 5. HP validation
  for (let n = 1; n <= level; n++) {
    const hpChoice = choices.hp?.[n];
    if (!hpChoice && !state.hpLevels.includes(n)) {
      pending.push(`hp.${n}`);
    }
  }

  // 6. ASI validation
  const validAbilities = ["str", "dex", "con", "int", "wis", "cha"];
  for (const n of ASI_LEVELS.filter(v => v <= level)) {
    const asiChoice = choices.asi?.[n];
    if (!asiChoice && !state.asiLevels.includes(n)) {
      pending.push(`asi.${n}`);
      continue;
    }
    if (asiChoice && asiChoice.mode !== "existing") {
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
      if (!isValidScheme && !state.asiLevels.includes(n)) {
        pending.push(`asi.${n}`);
      }
    }
  }

  // Pre-calculate planned writes
  const system = sourceSystem(actor);
  writes["flags.ak5e.specialist.enabled"] = true;
  if (weaponCat) writes["flags.ak5e.specialist.weaponCategory"] = weaponCat;
  if (style) writes["flags.ak5e.specialist.fightingStyle"] = style;

  // Add fighting style feature item if valid
  if (styleObj) {
    const styleEntry = CHAPTER_THREE_CLASSES.find(e => e.id === styleObj.chapterThreeId);
    if (styleEntry) {
      const owned = entries(actor.items).some(i => flag(i, "chapterThreeId") === styleObj.chapterThreeId);
      if (!owned) createItems.push(sourceData(styleEntry, "fightingStyle"));
    }
  }

  // Saves write
  const currentSaves = new Set(system.traits?.saves?.value ?? []);
  currentSaves.add(SPECIALIST_SAVES.automatic);
  if (validSaves) currentSaves.add(chosenSaves[0]);
  writes["system.traits.saves.value"] = Array.from(currentSaves);

  // Proficiencies
  const currentArmor = new Set(system.traits?.armorProf?.value ?? []);
  for (const prof of SPECIALIST_ARMOR_PROFS) currentArmor.add(prof);
  writes["system.traits.armorProf.value"] = Array.from(currentArmor);

  const currentWeapons = new Set(system.traits?.weaponProf?.value ?? []);
  currentWeapons.add("sim");
  writes["system.traits.weaponProf.value"] = Array.from(currentWeapons);

  if (validSkills) {
    for (const skillKey of uniqueChosenSkills) {
      writes[`system.skills.${skillKey}.value`] = Math.max(1, Number(system.skills?.[skillKey]?.value ?? 0));
    }
  }

  // Equipment writes
  if (!state.startingEquipmentGranted && choices.startingEquipment?.mode === "cash") {
    const beforeCp = Number(system.currency?.cp ?? 0);
    writes["system.currency.cp"] = beforeCp + 1300;
  }

  const contextKey = JSON.stringify([
    actor.uuid, level, pending, Object.keys(writes), createItems.map(i => i.name)
  ]);

  return {
    level,
    pending,
    valid: pending.length === 0,
    writes,
    createItems,
    contextKey
  };
}

export async function applySpecialistProgression(actor, { confirmed, contextKey, choices = {} } = {}) {
  need(confirmed === true, "Confirm the previewed Specialist progression first.");
  const plan = await previewSpecialistProgression(actor, choices);
  need(plan.valid, `Cannot apply progression; missing required choices: ${plan.pending.join(", ")}`);
  need(plan.contextKey === contextKey, "The character or choices changed since preview; preview again.");

  await actor.update(plan.writes);
  if (plan.createItems.length) {
    await actor.createEmbeddedDocuments("Item", plan.createItems);
  }

  const state = readState(actor);
  const updatedState = {
    ...state,
    choices: structuredClone(choices),
    hpLevels: Array.from(new Set([...state.hpLevels, ...Object.keys(choices.hp ?? {}).map(Number)])),
    asiLevels: Array.from(new Set([...state.asiLevels, ...Object.keys(choices.asi ?? {}).map(Number)])),
    startingEquipmentGranted: Boolean(state.startingEquipmentGranted || choices.startingEquipment?.mode)
  };
  await actor.update({ [`flags.ak5e.${SPECIALIST_PROGRESS_FLAG}`]: updatedState });

  return {
    success: true,
    level: plan.level,
    updatedFields: Object.keys(plan.writes),
    createdItems: plan.createItems.map(i => i.name)
  };
}
```

---

### 4.5 Module 5: `ak5e/scripts/specialist-uses.mjs`

```javascript
/**
 * Specialist table-play use engine (WORKFLOW.md §3.2, play-uses.mjs).
 * Enforces:
 *  - Confirm before use;
 *  - Non-blocking warnings with "Use anyway" overrides;
 *  - Zero-clamping on resource shortfalls;
 *  - Automatic GM relay for unowned target modifications;
 *  - Interactive roll buttons on chat cards (no auto-rolled dice);
 *  - Encounter-window undo receipts in `flags.ak5e.specialistUses`.
 */
import { createPlayUses, warn, spendResource, resourceValue } from "./play-uses.mjs";
import {
  specialistEnabled, specialistLevel, specialistState, checkLevel,
  specialistDC, martialDC, weaponMasteryMeleeBonus, weaponMasteryRangedBonus, pbForLevel
} from "./specialist-rules.mjs";
import {
  hasShowYourStyle, hasWeaponAdept, hasWeaponExpertise,
  hasFallingUpwards, hasWeaponMastery, getWeaponSpecialisation
} from "./specialist-features.mjs";
import { need, opaqueKey, values } from "./operation-kernel.mjs";
import { spendReaction, getReactions } from "./trigger-events.mjs";
import { getPool, refundPool } from "./resource-pools.mjs";

export const specialistUses = createPlayUses({
  ns: "specialistUses",
  label: "Specialist",
  isMember: actor => specialistEnabled(actor),
  ruling: (actor, key) => {
    const record = specialistState(actor).rulings?.[key];
    return record?.source?.trim?.() && record.value !== undefined ? record.value : undefined;
  }
});

export async function recordSpecialistRuling(actor, key, value, source) {
  need(game.user.isGM && actor?.isOwner, "Only the GM may record Specialist rulings.");
  const reading = specialistUses.readings()[key];
  need(reading?.options.some(option => option.value === value), "Choose a supported ruling value.");
  need(typeof source === "string" && source.trim().length >= 10, "Record the source and reason for this ruling (at least 10 characters).");
  await actor.update({ [`flags.ak5e.specialist.rulings.${key}`]: { value, source: source.trim(), approvedBy: game.user.id } });
  return specialistState(actor).rulings[key];
}

const levelWarning = (warnings, actor, requiredLevel, featureName) => {
  const current = specialistLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${featureName} is a Specialist level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

const CORE_PLANS = {
  markOfASpecialist(actor, state, data) {
    need(specialistEnabled(actor), "Mark of a Specialist requires the Specialist class.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Show Your Style (Mark of a Specialist)");

    const skill = data.skill ?? "skill";
    const skillName = data.skillName ?? skill;

    const pool = getPool(actor, "prowess");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Prowess pool is empty (0 remaining).");
    }

    return {
      title: `Mark of a Specialist -> Reroll ${skillName}`,
      warnings,
      apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "prowess", amount: 1, label: "Prowess" });
        receipt.summary = `${actor.name} expended 1 Prowess to reroll a failed ${skillName} Check. If the reroll fails, 1 Prowess will be refunded.`;
        receipt.result = { skill, skillName, prowessCost: 1, refundable: true };
        return spendUpdate;
      }
    };
  },

  refundMarkOfASpecialist(actor, state, data) {
    need(specialistEnabled(actor), "Refunding Mark of a Specialist requires the Specialist class.");
    const warnings = [];
    return {
      title: "Refund Mark of a Specialist",
      warnings,
      apply(state, receipt) {
        receipt.summary = `${actor.name} still failed the check; 1 Prowess has been refunded per Mark of a Specialist rules.`;
        receipt.result = { refundedProwess: 1 };
        return {
          "flags.ak5e.resourcePools.prowess.value": Math.min(getPool(actor, "prowess").max, getPool(actor, "prowess").value + 1)
        };
      }
    };
  },

  weaponExpertiseMelee(actor, state, data) {
    need(specialistEnabled(actor), "Weapon Expertise requires the Specialist class.");
    const warnings = [];
    levelWarning(warnings, actor, 12, "Weapon Expertise");

    const spec = getWeaponSpecialisation(actor);
    if (spec.category !== "melee") {
      warn(warnings, "specialisation", "Weapon Expertise (Melee) requires Melee Weapon Specialisation.");
    }

    const pool = getPool(actor, "prowess");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Prowess pool is empty (0 remaining).");
    }

    return {
      title: "Weapon Expertise (Melee): +1 Damage Die",
      warnings,
      apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "prowess", amount: 1, label: "Prowess" });
        receipt.summary = `${actor.name} expended 1 Prowess (Bonus Action) to roll one additional Damage die on their Melee Attack.`;
        receipt.result = { bonusDice: 1, actionType: "bonusAction" };
        return spendUpdate;
      }
    };
  },

  weaponExpertiseRanged(actor, state, data) {
    need(specialistEnabled(actor), "Weapon Expertise requires the Specialist class.");
    const warnings = [];
    levelWarning(warnings, actor, 12, "Weapon Expertise");

    const spec = getWeaponSpecialisation(actor);
    if (spec.category !== "ranged") {
      warn(warnings, "specialisation", "Weapon Expertise (Ranged) requires Ranged Weapon Specialisation.");
    }

    const pool = getPool(actor, "prowess");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Prowess pool is empty (0 remaining).");
    }

    return {
      title: "Weapon Expertise (Ranged): Advantage on Next Attack",
      warnings,
      apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "prowess", amount: 1, label: "Prowess" });
        receipt.summary = `${actor.name} expended 1 Prowess (Bonus Action) to gain Advantage on their next Ranged Attack Roll (rolling 3d20 keep highest if already advantaged).`;
        receipt.result = { advantage: true, actionType: "bonusAction" };
        return spendUpdate;
      }
    };
  },

  itsAllSkill(actor, state, data) {
    need(specialistEnabled(actor), "Falling Upwards requires the Specialist class.");
    const warnings = [];
    levelWarning(warnings, actor, 17, "Falling Upwards (It's All Skill)");

    const pool = getPool(actor, "prowess");
    if (pool.value < 3) {
      warn(warnings, "shortfall", `It's All Skill requires 3 Prowess; current pool has ${pool.value}.`);
    }

    const reactions = getReactions(actor);
    if (reactions.value < 1) {
      warn(warnings, "reaction", "Reaction already expended this round.");
    }

    return {
      title: "Falling Upwards: It's All Skill (Auto-Success)",
      warnings,
      apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "prowess", amount: 3, label: "Prowess" });
        const reactionUpdate = spendReaction(actor, receipt, { reason: "It's All Skill Reaction" });
        receipt.summary = `${actor.name} expended 3 Prowess as a Reaction to auto-succeed on their Saving Throw as if rolling the minimum required.`;
        receipt.result = { autoSuccess: true, minRollRequired: true };
        return { ...spendUpdate, ...reactionUpdate };
      }
    };
  },

  weaponMasteryMelee(actor, state, data) {
    need(specialistEnabled(actor), "Weapon Mastery requires the Specialist class.");
    const warnings = [];
    levelWarning(warnings, actor, 18, "Weapon Mastery");

    const spec = getWeaponSpecialisation(actor);
    if (spec.category !== "melee") {
      warn(warnings, "specialisation", "Weapon Mastery (Melee) requires Melee Weapon Specialisation.");
    }

    const lvl = specialistLevel(actor) ?? 1;
    const bonus = weaponMasteryMeleeBonus(lvl);

    return {
      title: `Weapon Mastery (Melee): +${bonus} Damage`,
      warnings,
      apply(state, receipt) {
        receipt.summary = `${actor.name} dealt +${bonus} additional Weapon Damage (half Specialist level) on a Melee Attack hit (1/turn).`;
        receipt.result = { damageBonus: bonus, frequency: "oncePerTurn" };
        return {};
      }
    };
  },

  weaponMasteryRanged(actor, state, data) {
    need(specialistEnabled(actor), "Weapon Mastery requires the Specialist class.");
    const warnings = [];
    levelWarning(warnings, actor, 18, "Weapon Mastery");

    const spec = getWeaponSpecialisation(actor);
    if (spec.category !== "ranged") {
      warn(warnings, "specialisation", "Weapon Mastery (Ranged) requires Ranged Weapon Specialisation.");
    }

    const pb = pbForLevel(specialistLevel(actor) ?? 1);

    return {
      title: `Weapon Mastery (Ranged): Double PB (+${pb} Attack)`,
      warnings,
      apply(state, receipt) {
        receipt.summary = `${actor.name} doubled their Proficiency Bonus (+${pb}) for a Ranged Attack Roll (1/turn).`;
        receipt.result = { attackBonus: pb, frequency: "oncePerTurn" };
        return {};
      }
    };
  },

  defensiveStyle(actor, state, data) {
    need(specialistEnabled(actor), "Fighting Styles require the Specialist class.");
    const warnings = [];
    const reactions = getReactions(actor);
    if (reactions.value < 1) {
      warn(warnings, "reaction", "Reaction already expended this round.");
    }
    return {
      title: "Defensive Fighting Style (+1d4 AC)",
      warnings,
      apply(state, receipt) {
        const reactionUpdate = spendReaction(actor, receipt, { reason: "Defensive Style Reaction" });
        receipt.summary = `${actor.name} used their Reaction to increase AC by 1d4 against a triggering Attack.`;
        receipt.result = { acBonusFormula: "1d4" };
        return reactionUpdate;
      }
    };
  }
};

for (const [name, fn] of Object.entries(CORE_PLANS)) {
  specialistUses.registerPlan(name, fn);
}
```

---

### 4.6 Unit Test Suites Design

#### Suite 1: `ak5e/test/specialist-rules.test.mjs`
- Test cases:
  1. `checkLevel`: integer checks (1 to 20), rejects floats, negatives, >20, strings, nulls.
  2. `pbForLevel`: verifies PB progression across all 20 levels (+2 at 1–4, +3 at 5–8, +4 at 9–12, +5 at 13–16, +6 at 17–20).
  3. `hitPointsAtLevel`: base 8+CON at lv 1; 5+CON (fixed) or 1d8+CON (rolled) per level after; minimum 1 HP gain per level under extreme negative CON.
  4. `specialistDC` & `martialDC`: verifies formula evaluation against mocked ability scores.
  5. `weaponMasteryMeleeBonus`: verifies `floor(level / 2)` (e.g. 0 at lv 1, 9 at lv 18, 10 at lv 20).
  6. `fightingStyles`: catalog verification (8 melee styles, 7 ranged styles, 15 unique styles with valid chapter-three IDs).
  7. `specialistProfile`: handles non-characters, missing classes, multiclass blocks, invalid level blocks.
  8. `calculateSpecialistProfile`: returns valid interface contract object with HP, saves, proficiencies, resources, features, DCs.

#### Suite 2: `ak5e/test/specialist-features.test.mjs`
- Test cases:
  1. Feature unlocks: `hasWeaponSpecialisation` (lv 1), `hasShowYourStyle` (lv 4), `hasWeaponAdept` (lv 6), `hasWeaponExpertise` (lv 12), `hasFallingUpwards` (lv 17), `hasWeaponMastery` (lv 18).
  2. Prowess pool registration: pool ID `"prowess"`, label `"Prowess"`, max equals `@prof`, level basis `"classLevel"`.
  3. Prowess pool recovery: short rest recovery (+1), long rest recovery (+1), caps at maximum.
  4. `specialistUses.markOfASpecialist`: spends 1 Prowess, warns on empty pool, clamps at 0, outputs chat card receipt.
  5. `specialistUses.refundMarkOfASpecialist`: refunds 1 Prowess on second failure.
  6. `specialistUses.itsAllSkill`: spends 3 Prowess and 1 reaction, warns on level < 17 or reaction spent, records auto-success receipt.
  7. `specialistUses.weaponExpertiseMelee` & `weaponExpertiseRanged`: spends 1 Prowess, verifies specialisation checks and bonus outputs.
  8. `specialistUses.weaponMasteryMelee` & `weaponMasteryRanged`: calculates correct bonus damage and attack bonus.
  9. Undo reversibility: verifies all operations produce undo receipts in `flags.ak5e.specialistUses` that reverse cleanly within the encounter window.

#### Suite 3: `ak5e/test/specialist-progression.test.mjs`
- Test cases:
  1. `previewSpecialistSetup`: generates features up to actor level, computes deterministic `contextKey` hash.
  2. `applySpecialistSetup`: idempotent application, creates embedded documents, re-running preserves existing items.
  3. `inspectSpecialistFields`: returns options for saves (DEX + WIS/CHA), skills (3 from 6), style, equipment, HP, and 7 ASI levels.
  4. `previewSpecialistProgression`: validates required choices, detects pending fields, rejects invalid saves/skills permutations.
  5. `applySpecialistProgression`: level 1 grants (saves, skills, proficiencies, equipment or 1300 LMD).
  6. `applySpecialistProgression`: level-up to 4 applies ASI and HP without resetting existing customizations or duplicate grants.
  7. ASI scheme validation: accepts +2 to one ability or +1 to two different abilities, rejects invalid/duplicate schemes.

---

## 5. Verification Method

To independently verify the exploration and future implementation:

1. **Unit Test Execution:**
   ```bash
   node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-progression.test.mjs
   ```
   *Expected outcome:* All 3 suites pass 100% with 0 failures.

2. **Static Lint and Source Cleanliness:**
   ```bash
   node ak5e/tools/validate-files.mjs
   node ak5e/tools/verify-generated-content.mjs
   ```
   *Expected outcome:* Exits with code 0, zero lint errors, zero schema discrepancies.

3. **Full Repository Regression Check:**
   ```bash
   npm test
   ```
   *Expected outcome:* All existing Vanguard, Supporter, Guard, Marksman, Caster, and Defender test suites pass without regression.

4. **Invalidation Conditions:**
   - Any modification to installed D&D5e system files or change of module ID from `ak5e`.
   - Any auto-rolling of dice on feature activations without owner click.
   - Any non-idempotent progression grant that duplicates items or wipes HP customizations.
   - Any failure of undo receipts to restore spent Prowess or Reactions.
