/** Guard class rules (Ch.3 L1740-2201), Centurion (L2549-2632), Crusher (L2633-2738),
 * and Instructor (L2846-2936). Pure and read-only: nothing here writes Actor state,
 * imports records or touches Foundry globals. */

export const GUARD_CLASS_ID = "class-guard";

export const GUARD_BRANCH_IDS = Object.freeze({
  "subclass-guard-artsblade": "artsblade",
  "subclass-guard-brawler": "brawler",
  "subclass-guard-centurion": "centurion",
  "subclass-guard-crusher": "crusher",
  "subclass-guard-duellist": "duellist",
  "subclass-guard-instructor": "instructor",
  "subclass-guard-liberator": "liberator",
  "subclass-guard-lord": "lord",
  "subclass-guard-musha": "musha",
  "subclass-guard-reaper": "reaper",
  "subclass-guard-weaponmaster": "weaponmaster"
});

export const IMPLEMENTED_GUARD_BRANCHES = Object.freeze(["centurion", "crusher", "instructor"]);

/** Aggression column: 4 at 1st level, 6 at 7th, 8 at 14th (L1877-1879). */
export const AGGRESSION_STEPS = Object.freeze({ 1: 4, 7: 6, 14: 8 });

/** Unrelenting uses: 1 at 3rd level, 2 at 11th (L1898, L1931). Long Rest recovery. */
export const UNRELENTING_STEPS = Object.freeze({ 1: 0, 3: 1, 11: 2 });

/** Instruction Dice: 4 at 1st level, 5 at 7th, 6 at 14th (L2859-2861). */
export const INSTRUCTION_DICE_STEPS = Object.freeze({ 1: 4, 7: 5, 14: 6 });

/** Fighting Styles available to the Guard Class (L1837-1865). */
export const FIGHTING_STYLES = Object.freeze({
  brawler: {
    id: "class-feature-guard-brawler-4250",
    name: "Brawler",
    description: "On each of your Turns, you may make an Unarmed Strike as a Bonus Action."
  },
  deadlyFighter: {
    id: "class-feature-guard-deadly-fighter-4339",
    name: "Deadly Fighter",
    description: "The first time each Turn you make an Attack Roll using a Weapon with the Deadly Property, the Critical Range of that Attack is increased by 1."
  },
  defensive: {
    id: "class-feature-guard-defensive-4504",
    name: "Defensive",
    description: "When you are hit by an Attack while you have a Melee Weapon or Shield equipped, you may use your Reaction to increase your AC by 1d4 for the duration of that Attack, possibly causing that Attack to miss."
  },
  duelling: {
    id: "class-feature-guard-duelling-4725",
    name: "Duelling",
    description: "You have a +1 bonus to Attack and Damage Rolls for Melee Attacks against the first Creature you Attack each Turn."
  },
  greatWeaponFighting: {
    id: "class-feature-guard-great-weapon-fighting-4856",
    name: "Great Weapon Fighting",
    description: "You gain a +2 bonus to Damage rolls you make with Melee Weapons that you are wielding with two hands. The weapon must have the Two-Handed or Versatile Quality for you to gain this benefit."
  },
  lightlyArmed: {
    id: "class-feature-guard-lightly-armed-5074",
    name: "Lightly Armed",
    description: "When you are wielding a Melee Weapon in one hand and no other Weapons or Shields, you gain a +2 Bonus to Attack Rolls with that Weapon."
  },
  ranger: {
    id: "class-feature-guard-ranger-5231",
    name: "Ranger",
    description: "You gain a +2 Bonus to Attack Rolls you make with Ranged or Thrown Weapons."
  },
  spearwall: {
    id: "class-feature-guard-spearwall-5321",
    name: "Spearwall",
    description: "When you make a Melee Attack while it is not your Turn, that Attack deals an additional dice of Damage."
  },
  twoWeaponFighting: {
    id: "class-feature-guard-two-weapon-fighting-5443",
    name: "Two-Weapon Fighting",
    description: "When you engage in Two-Weapon Fighting, you can add your Ability Modifier to the Damage of the additional Attack(s), and you may draw or stow two one-handed weapons when you would normally be able to draw or stow only one."
  }
});

const DEFAULT_STATE = Object.freeze({
  version: 1,
  enabled: false,
  operations: [],
  events: [],
  uses: {},
  rulings: {},
  fightingStyle: null
});

export const flag = (document, key) => document?.getFlag?.("ak5e", key) ?? document?.flags?.ak5e?.[key];
const list = collection => Array.from(collection?.values?.() ?? collection ?? []);

function stepValue(steps, level) {
  const keys = Object.keys(steps).map(Number).sort((a, b) => a - b).filter(key => key <= level);
  return keys.length ? steps[keys.at(-1)] : 0;
}

export function checkLevel(level) {
  const n = Number(level);
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new RangeError("Guard level must be an integer from 1 to 20.");
  return n;
}

export const aggressionMax = level => stepValue(AGGRESSION_STEPS, checkLevel(level));
export const unrelentingMax = level => stepValue(UNRELENTING_STEPS, checkLevel(level));
export const instructionDiceMax = level => stepValue(INSTRUCTION_DICE_STEPS, checkLevel(level));

/** Instruction Die size (L2859 vs L2882): d6 from 1st, d10 from 13th (Superior Instruction). */
export const instructionDieFaces = level => checkLevel(level) >= 13 ? 10 : 6;

/** Martial DC (Ch.1 L211): 8 + PB + higher of STR or DEX modifier. */
export function martialDC(actor) {
  const system = actor?.system ?? {};
  const pb = Number(system.attributes?.prof ?? 2);
  const str = Number(system.abilities?.str?.mod ?? 0);
  const dex = Number(system.abilities?.dex?.mod ?? 0);
  return 8 + pb + Math.max(str, dex);
}

/** Centurion DC (Ch.3 L2554-2555): 8 + Intimidation Modifier. */
export function centurionDC(actor) {
  const system = actor?.system ?? {};
  const intimidation = Number(system.skills?.itm?.total ?? (system.skills?.itm?.mod ?? (system.abilities?.cha?.mod ?? 0)));
  return 8 + intimidation;
}

export function guardState(actor) {
  const stored = flag(actor, "guard") ?? {};
  return {
    ...structuredClone(DEFAULT_STATE),
    ...structuredClone(stored),
    operations: [...(stored.operations ?? [])],
    events: [...(stored.events ?? [])],
    uses: { ...(stored.uses ?? {}) },
    rulings: { ...(stored.rulings ?? {}) }
  };
}

/** Pure inspection of Guard class and branch identity on an Actor. */
export function guardProfile(actor) {
  const empty = { applicable: false, configured: false, level: null, branch: null, branchId: null, classItem: null, branchItem: null, blocked: [] };
  if (actor?.type !== "character" || actor.pack) return empty;
  const items = list(actor.items);
  const classes = items.filter(i => i.type === "class");
  const guardClass = classes.find(i => flag(i, "chapterThreeId") === GUARD_CLASS_ID || i.name === "Guard");
  if (!guardClass) return empty;
  if (classes.length > 1) return { ...empty, applicable: true, blocked: ["MultipleClasses"] };

  const rawLevel = Number(guardClass.system?.levels);
  const level = Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 20 ? rawLevel : null;
  if (level === null) return { ...empty, applicable: true, blocked: ["InvalidClassLevel"] };

  const branches = items.filter(i => i.type === "subclass");
  const branchItem = branches[0] ?? null;
  let branch = null, branchId = null;
  if (branchItem) {
    branchId = flag(branchItem, "chapterThreeId") ?? null;
    branch = GUARD_BRANCH_IDS[branchId] ?? null;
    if (!branch && branchItem.name) {
      const match = branchItem.name.replace(/^Guard:\s*/i, "").trim().toLowerCase();
      branch = Object.values(GUARD_BRANCH_IDS).includes(match) ? match : null;
    }
    if (!branch) return { ...empty, applicable: true, level, classItem: guardClass, branchItem, blocked: ["UnknownBranch"] };
  }

  const state = guardState(actor);
  return {
    applicable: true,
    configured: Boolean(state.enabled),
    level,
    branch,
    branchId,
    classItem: guardClass,
    branchItem,
    blocked: []
  };
}

export function guardEnabled(actor) {
  const profile = guardProfile(actor);
  return profile.applicable && profile.configured && !profile.blocked.length && profile.level !== null;
}

export function guardLevel(actor) {
  return guardProfile(actor).level;
}

export function guardBranch(actor) {
  return guardProfile(actor).branch;
}
