/** Defender class and Branch rules (Ch.3 L896-1722). Pure and read-only:
 * nothing here writes Actor state, imports records or touches Foundry globals. */

export const DEFENDER_CLASS_ID = "class-defender";
export const DEFENDER_BRANCH_IDS = Object.freeze({
  "subclass-defender-artshield": "artshield",
  "subclass-defender-dreadnought": "dreadnought",
  "subclass-defender-fortress": "fortress",
  "subclass-defender-guardian": "guardian",
  "subclass-defender-juggernaut": "juggernaut",
  "subclass-defender-protector": "protector",
  "subclass-defender-sentry": "sentry"
});
/** Branches whose own features this module implements. The others keep class-level support only. */
export const IMPLEMENTED_BRANCHES = Object.freeze(["artshield", "dreadnought", "guardian", "fortress", "juggernaut", "protector", "sentry"]);

/** Guardian Arts Casting table (L1510-1531): [Maximum Art Level, Arts Points] for Defender levels 1-20. */
export const GUARDIAN_TABLE = Object.freeze([[1, 3], [1, 3], [1, 4], [1, 4], [2, 6], [2, 6], [2, 7], [2, 7], [3, 10], [3, 10],
  [3, 11], [3, 11], [4, 12], [4, 12], [4, 15], [4, 15], [5, 16], [5, 16], [5, 17], [5, 17]]);
export function guardianTable(level) {
  const [maximumArtLevel, maximum] = GUARDIAN_TABLE[checkLevel(level) - 1];
  return { maximumArtLevel, maximum };
}
/** Fortress Munitions Dice (L1411-1413): five dice, d4, d6 from Defender level 7, d8 from 14. */
export const MUNITIONS_DICE = 5;
export const munitionDie = level => stepValue({ 1: 4, 7: 6, 14: 8 }, checkLevel(level));

/** Juggernaut Superheavy (L1597): at most 1 Barrier layer, 2 from 7th level, 3 from 14th. */
export const barrierMax = level => stepValue({ 1: 1, 7: 2, 14: 3 }, checkLevel(level));
/** Protector DC (L1633): 8 + Constitution Modifier + Proficiency Bonus. */
export function protectorDC(conMod, proficiencyBonus) {
  const con = Number(conMod), pb = Number(proficiencyBonus);
  if (!Number.isFinite(con) || !Number.isFinite(pb)) throw new TypeError("Constitution Modifier and Proficiency Bonus must be numbers.");
  return 8 + con + pb;
}
/** Protector Improved Shelter (L1648) widens Shelter to 10 feet; Sentry Plant Pavise (L1692) shelters within 10 feet of the shield. */
export const IMPROVED_SHELTER_FEET = 10, PAVISE_FEET = 10;
/**
 * Plant Pavise (L1692): the Attack "originates from the opposite side of the shield from that Creature's perspective".
 * Logged reading: seen from the target T, the attacker A is beyond the shield S, that is (S − T) · (A − S) > 0.
 * Points are {x, y} in any one consistent unit. A target standing on the shield's point is not sheltered by it.
 */
export function paviseOpposite(target, shield, attacker) {
  const tx = Number(shield.x) - Number(target.x), ty = Number(shield.y) - Number(target.y);
  if (![tx, ty, attacker.x, attacker.y].every(Number.isFinite)) return false;
  if (tx === 0 && ty === 0) return false;
  return tx * (Number(attacker.x) - Number(shield.x)) + ty * (Number(attacker.y) - Number(shield.y)) > 0;
}
/**
 * Halve D&D5e damage descriptions in place (dnd5e.calculateDamage payload). `unresistedOnly` grants Resistance: parts the
 * Actor already resists or is immune to are not halved again (Resistance from two sources does not stack). Healing,
 * Temporary HP and maximum-HP parts are never changed. Each part truncates toward zero as D&D5e does; returns the
 * Damage removed, which the caller subtracts from `damages.amount`.
 */
export function halveDamage(damages, { unresistedOnly = false, label = "AK5e" } = {}) {
  let removed = 0;
  for (const part of damages) {
    if (["healing", "temphp", "maximum"].includes(part.type) || !(Number(part.value) > 0)) continue;
    const active = part.active ?? {};
    if (unresistedOnly && (active.type?.resistance || active.all?.resistance || active.type?.immunity || active.all?.immunity || active.multiplier === 0 || active.ak5eResisted)) continue;
    const before = Number(part.value), after = Math.trunc(before / 2);
    part.value = after; removed += before - after;
    part.active = { ...active, multiplier: (active.multiplier ?? 1) / 2, ak5e: [...(active.ak5e ?? []), label], ...(unresistedOnly ? { ak5eResisted: true } : {}) };
  }
  return removed;
}

/** Shields from Chapter 4 (L248-259), read from an Item's source table data: Light or Heavy, and the Bastion property.
 * Anchor Point's undefined "Bulwark Property" (L1644) is checked as Bastion (logged reading). */
export function shieldInfo(item) {
  const table = item?.flags?.ak5e?.tableData ?? item?.getFlag?.("ak5e", "tableData") ?? {};
  const category = String(table.category ?? "");
  const shield = item?.type === "equipment" && (item.system?.type?.value === "shield" || /Shields$/.test(category));
  if (!shield) return null;
  return { heavy: category === "Heavy Shields", bastion: /\bBastion\b/i.test(String(table.special ?? "")), equipped: item.system?.equipped === true };
}
export const equippedShields = items => list(items).map(item => ({ item, info: shieldInfo(item) })).filter(entry => entry.info?.equipped);

/** Resilience column of The Defender table (L943-965). */
export const RESILIENCE_STEPS = Object.freeze({ 1: 4, 7: 6, 14: 8, 20: 10 });
export const SHELTER_FEET = 5;
export const DAMAGE_DICE_SIDES = 6;

const DEFAULT_STATE = Object.freeze({
  version: 1, enabled: false, operations: [], events: [], uses: {}, rulings: {},
  shelter: null, advance: null, absorbed: null, barrier: null, leaping: null
});

export const flag = (document, key) => document?.getFlag?.("ak5e", key) ?? document?.flags?.ak5e?.[key];
const list = collection => Array.from(collection?.values?.() ?? collection ?? []);

function stepValue(steps, level) {
  const keys = Object.keys(steps).map(Number).sort((a, b) => a - b).filter(key => key <= level);
  return keys.length ? steps[keys.at(-1)] : 0;
}
function checkLevel(level) {
  const n = Number(level);
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new RangeError("Defender level must be an integer from 1 to 20.");
  return n;
}

export const resilienceMax = level => stepValue(RESILIENCE_STEPS, checkLevel(level));
/** Reactive (13th): two Reactions instead of one. */
export const reactionMax = level => checkLevel(level) >= 13 ? 2 : 1;
/** Dreadnought's Advance: 1 Skill Point, 2 at 7th Level, 3 at 14th (L1334). */
export const advanceSkillPoints = level => stepValue({ 1: 1, 7: 2, 14: 3 }, checkLevel(level));
/** Arts Absorption expel dice: 3d6, 6d6 at 7th, 9d6 at 14th; none before the 4th-level Feature (L1256-1258). */
export function absorptionDice(level) {
  const n = checkLevel(level);
  return n < 4 ? null : { number: stepValue({ 4: 3, 7: 6, 14: 9 }, n), faces: DAMAGE_DICE_SIDES, type: "force" };
}
/** Legendary Might: Strength +6 to a maximum of 26 (L1361), the same result as the managed ADD 6 / DOWNGRADE 26 effect. */
export function legendaryStrength(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) throw new TypeError("Strength must be a number.");
  return Math.min(n + 6, 26);
}
/** Crownsplitter (L1344): Strength modifier, doubled against an Elite or Leader target. */
export function crownsplitterBonus(strengthModifier, tier) {
  const mod = Number(strengthModifier);
  if (!Number.isFinite(mod)) throw new TypeError("Strength modifier must be a number.");
  if (!["normal", "elite", "leader"].includes(tier)) throw new RangeError("Choose the target's tier: normal, elite or leader.");
  return tier === "normal" ? mod : 2 * mod;
}
export const isEliteOrLeader = tier => tier === "elite" || tier === "leader";
/** Bestiary NPC tier. Anything without the flag is unknown; it is never inferred. */
export function creatureTier(actor) {
  const category = String(flag(actor, "category") ?? "").toLowerCase();
  return ["normal", "elite", "leader"].includes(category) ? category : null;
}
/** Indestructible (L1043): double any DR against that instance of Damage. */
export function indestructibleReduction(reduction) {
  const n = Number(reduction);
  if (!Number.isFinite(n) || n < 0) throw new RangeError("Damage Reduction must be zero or more.");
  return 2 * n;
}
/** Stormchaser (L1273): half of Physical DR against Arts Damage, rounding up. */
export function stormchaserReduction(physicalReduction) {
  const n = Number(physicalReduction);
  if (!Number.isFinite(n) || n < 0) throw new RangeError("Damage Reduction must be zero or more.");
  return Math.ceil(n / 2);
}
/** Interlocking Shields (Talent): half PB for sheltered allies, all Damage with the Module. The source
 * gives no rounding; the logged default rounds up, as its sibling Talents state. */
export function interlockingShieldsReduction(proficiencyBonus, moduleActive = false) {
  const pb = Number(proficiencyBonus);
  if (!Number.isFinite(pb) || pb < 0) throw new RangeError("Proficiency Bonus must be zero or more.");
  return { value: Math.ceil(pb / 2), scope: moduleActive ? "all" : "physical" };
}

/** Distance (feet) from the Leaping Defence trigger: half the Defender's Speed (L1029). */
export const leapingRange = speed => {
  const n = Number(speed);
  if (!Number.isFinite(n) || n < 0) throw new RangeError("Speed must be zero or more.");
  return n / 2;
};

const bases = new WeakMap();
const isPlain = value => value !== null && typeof value === "object" && !Array.isArray(value);
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function diffPaths(prev, next, prefix, out) {
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) continue;
    if (isPlain(prev?.[key]) && isPlain(next[key])) diffPaths(prev[key], next[key], `${prefix}.${key}`, out);
    else if (!sameValue(prev?.[key], next[key])) out[`${prefix}.${key}`] = next[key];
  }
  for (const key of Object.keys(prev ?? {})) if (!(key in next)) out[`${prefix}.-=${key}`] = null;
}
/** Only the leaves this state object changed since it was read, as dotted update paths. Writing leaves instead of the whole
 * object means a stale copy cannot overwrite a change another client made to a key it never touched. */
export function stateChanges(state) {
  const base = bases.get(state), out = {};
  if (!base) return { "flags.ak5e.defender": state };
  diffPaths(base, state, "flags.ak5e.defender", out);
  return out;
}
/** Call after the changes were saved, so the next write contains only newer changes. */
export function rebaseState(state) { bases.set(state, structuredClone(state)); }

export function defenderState(actor) {
  const state = readDefenderState(actor);
  bases.set(state, structuredClone(state));
  return state;
}
function readDefenderState(actor) {
  const stored = flag(actor, "defender");
  if (!stored || typeof stored !== "object") return structuredClone(DEFAULT_STATE);
  const base = structuredClone(DEFAULT_STATE);
  return {
    ...base, ...structuredClone(stored), enabled: stored.enabled === true,
    operations: Array.isArray(stored.operations) ? [...stored.operations] : [],
    events: Array.isArray(stored.events) ? [...stored.events] : [],
    uses: { ...structuredClone(stored.uses ?? {}) }, rulings: { ...structuredClone(stored.rulings ?? {}) }
  };
}

export function defenderLevel(actor) {
  const classes = list(actor?.items).filter(item => item.type === "class" && flag(item, "chapterThreeId") === DEFENDER_CLASS_ID);
  if (classes.length !== 1) return null;
  const level = Number(classes[0].system?.levels);
  return Number.isInteger(level) && level >= 1 && level <= 20 ? level : null;
}
export function defenderBranch(actor) {
  const branches = list(actor?.items).filter(item => item.type === "subclass");
  if (branches.length !== 1) return null;
  return DEFENDER_BRANCH_IDS[flag(branches[0], "chapterThreeId")] ?? null;
}

/** Read-only applicability report. */
export function defenderProfile(actor) {
  const empty = { applicable: false, configured: false, level: null, branch: null, branchId: null, implemented: false, blocked: [], errors: [], contextKey: null };
  if (actor?.type !== "character" || actor?.pack) return empty;
  const items = list(actor.items);
  const classes = items.filter(item => item.type === "class");
  const defenders = classes.filter(item => flag(item, "chapterThreeId") === DEFENDER_CLASS_ID);
  if (!defenders.length) return empty;
  const blocked = [];
  if (classes.length !== 1 || defenders.length !== 1) blocked.push("MultipleClasses");
  const level = Number(defenders[0]?.system?.levels);
  if (!Number.isInteger(level) || level < 1 || level > 20) blocked.push("InvalidClassLevel");
  const branchItems = items.filter(item => item.type === "subclass");
  const branchId = branchItems.length === 1 ? flag(branchItems[0], "chapterThreeId") : null;
  const branch = branchId ? DEFENDER_BRANCH_IDS[branchId] ?? null : null;
  if (branchItems.length > 1) blocked.push("MultipleBranches");
  else if (branchItems.length === 1 && !branch) blocked.push("UnsupportedBranch");
  const state = defenderState(actor);
  return {
    applicable: true, configured: state.enabled,
    level: Number.isInteger(level) && level >= 1 && level <= 20 ? level : null,
    branch, branchId, implemented: IMPLEMENTED_BRANCHES.includes(branch), blocked,
    errors: blocked.map(code => ({ code })),
    contextKey: JSON.stringify([DEFENDER_CLASS_ID, defenders[0]?.id ?? null, Number.isFinite(level) ? level : null, branchId, state.enabled])
  };
}

/** Shelter (L992): Attacks against allied Creatures (not the Defender) within 5 feet are made at Disadvantage.
 * Evaluated at attack time (logged default); `within` is the live distance test supplied by the caller. */
export function shelterDisadvantage(shelter, { targetUuid, defenderTokenUuid, within }) {
  if (!shelter?.active || !targetUuid) return false;
  if (targetUuid === defenderTokenUuid) return false;
  if (!Array.isArray(shelter.allies) || !shelter.allies.includes(targetUuid)) return false;
  return within === true;
}
/** Declaring Shelter: an Action during your Turn, or a Bonus Action by expending 1 Resilience (L992-994). */
export function shelterCost(activation) {
  if (activation === "action") return { resilience: 0 };
  if (activation === "bonus") return { resilience: 1 };
  throw new RangeError("Shelter is taken as an Action, or as a Bonus Action for 1 Resilience.");
}
