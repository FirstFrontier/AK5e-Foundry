import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { CHAPTER_FIVE_ARTS } from "./chapter-five-content.mjs";

const CLASS_ID = "class-caster";
const BRANCH_IDS = Object.freeze({
  "subclass-caster-core": "core",
  "subclass-caster-mystic": "mystic",
  "subclass-caster-mech-accord": "mech-accord",
  "subclass-caster-primal": "primal",
  "subclass-caster-splash": "splash",
  "subclass-caster-chain": "chain"
});
const LEVELS = Object.freeze([3, 4, 6, 7, 10, 11, 12, 15, 16, 17, 20, 21, 22, 25, 26, 27, 30, 31, 32, 35]);
const ART_LEVELS = Object.freeze([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 9]);
const DEFAULT_STATE = Object.freeze({
  version: 1,
  enabled: false,
  choices: {},
  pools: [],
  operations: [],
  casts: [],
  spends: [],
  rulings: {},
  uses: {},
  turn: {},
  drones: []
});
const records = new Map(CHAPTER_THREE_CLASSES.map(entry => [entry.id, entry]));
const flag = (document, key) => document?.getFlag?.("ak5e", key) ?? document?.flags?.ak5e?.[key];
const list = collection => Array.from(collection?.values?.() ?? collection ?? []);
const poolRows = /^\|\s*(Cantrip|[1-9](?:st|nd|rd|th))\s*\|\s*(.*?)\s*(?:\|\s*)?$/gm;
const keyName = value => String(value ?? "").toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
const artsByName = new Map(CHAPTER_FIVE_ARTS.filter(entry => entry.kind === "art").map(entry => [keyName(entry.name), entry]));

function normalizeLevel(value) {
  if (value === "Cantrip") return 0;
  return Number.parseInt(String(value), 10);
}

function poolMembers(entry) {
  const matcher = new RegExp(poolRows.source, poolRows.flags);
  const members = [];
  for (const match of entry.rawSource.matchAll(matcher)) {
    const level = normalizeLevel(match[1]);
    const names = match[2].replace(/\*\*/g, "").trim();
    if (!names || names === "-") continue;
    for (const rawName of names.split(/,\s*/)) {
      const name = rawName.trim();
      if (!name) continue;
      const art = artsByName.get(keyName(name));
      members.push({ name, level, sourceId: art?.id ?? null });
    }
  }
  return members;
}

/**
 * Members of a Special Arts Pool (Ch.5), for other classes' grants (e.g. Guardian of Life's Healing Arts, Ch.3 L1535).
 * A trailing "*" (Disease Restoration note) is dropped from the name. Spell names without AK5e records have no sourceId.
 */
export function specialPoolMembers(poolId) {
  const entry = CHAPTER_FIVE_ARTS.find(candidate => candidate.id === poolId && candidate.kind === "special-art-pool");
  if (!entry) return [];
  return poolMembers(entry).map(member => {
    const name = member.name.replace(/\*+$/, "").trim(), art = artsByName.get(keyName(name));
    return { name, level: member.level, sourceId: art?.id ?? null };
  });
}

/** Stable source-ID catalogue. Spell names without AK5e records deliberately have no sourceId. */
export const standardPools = Object.freeze(CHAPTER_FIVE_ARTS
  .filter(entry => entry.kind === "standard-art-pool")
  .map(entry => Object.freeze({
    id: entry.id,
    sourceId: entry.id,
    name: entry.sourceHeading,
    sourceHeading: entry.sourceHeading,
    members: Object.freeze(poolMembers(entry).map(member => Object.freeze(member)))
  })));

export function casterLevel(actor) {
  const classes = list(actor?.items).filter(item => item.type === "class" && flag(item, "chapterThreeId") === CLASS_ID);
  if (classes.length !== 1) return null;
  const level = Number(classes[0].system?.levels);
  return Number.isInteger(level) && level >= 1 && level <= 20 ? level : null;
}

export function casterBranch(actor) {
  const branches = list(actor?.items).filter(item => item.type === "subclass");
  if (branches.length !== 1) return null;
  return BRANCH_IDS[flag(branches[0], "chapterThreeId")] ?? null;
}

export function casterState(actor) {
  const stored = flag(actor, "caster");
  if (!stored || typeof stored !== "object") return structuredClone(DEFAULT_STATE);
  return {
    ...structuredClone(DEFAULT_STATE),
    ...structuredClone(stored),
    enabled: stored.enabled === true,
    choices: { ...structuredClone(DEFAULT_STATE.choices), ...structuredClone(stored.choices ?? {}) },
    pools: Array.isArray(stored.pools) ? [...stored.pools] : [],
    operations: Array.isArray(stored.operations) ? [...stored.operations] : [],
    casts: Array.isArray(stored.casts) ? [...stored.casts] : [],
    spends: Array.isArray(stored.spends) ? [...stored.spends] : [],
    rulings: { ...structuredClone(DEFAULT_STATE.rulings), ...structuredClone(stored.rulings ?? {}) },
    uses: { ...structuredClone(DEFAULT_STATE.uses), ...structuredClone(stored.uses ?? {}) },
    turn: { ...structuredClone(DEFAULT_STATE.turn), ...structuredClone(stored.turn ?? {}) },
    drones: Array.isArray(stored.drones) ? [...stored.drones] : []
  };
}

export function casterTable(level) {
  const n = Number(level);
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new RangeError("Caster level must be an integer from 1 to 20.");
  return { maximum: LEVELS[n - 1], maximumArtLevel: ART_LEVELS[n - 1] };
}

/** Return level-eligible feature catalogue rows for an explicitly configured Caster. */
export function casterFeatures(actor) {
  const profile = casterProfile(actor);
  if (!profile.applicable || !profile.configured || profile.blocked.length) return [];
  const level = profile.level;
  const branch = profile.branch;
  const branchName = Object.entries(BRANCH_IDS).find(([, value]) => value === branch)?.[0];
  const sourceBranch = branchName ? records.get(branchName)?.sourceHeading : null;
  return CHAPTER_THREE_CLASSES.filter(entry => entry.parentClass === "Caster" &&
    Number.isInteger(entry.level) && entry.level <= level &&
    (entry.kind === "class-feature" && entry.parentBranch == null ||
      entry.kind === "subclass-feature" && entry.parentBranch === sourceBranch));
}

/** Read-only applicability report; it never imports records or changes Actor state. */
export function casterProfile(actor) {
  const empty = { applicable: false, configured: false, level: null, branch: null, branchId: null, blocked: [], errors: [], contextKey: null };
  if (actor?.type !== "character" || actor?.pack) return empty;
  const items = list(actor.items);
  const classes = items.filter(item => item.type === "class");
  const casterItems = classes.filter(item => flag(item, "chapterThreeId") === CLASS_ID);
  if (!casterItems.length) return empty;
  const blocked = [];
  if (classes.length !== 1 || casterItems.length !== 1) blocked.push("MultipleClasses");
  const classItem = casterItems[0];
  const level = Number(classItem?.system?.levels);
  if (!Number.isInteger(level) || level < 1 || level > 20) blocked.push("InvalidClassLevel");
  const branchItems = items.filter(item => item.type === "subclass");
  const branchId = branchItems.length === 1 ? flag(branchItems[0], "chapterThreeId") : null;
  const branch = branchId ? BRANCH_IDS[branchId] ?? null : null;
  if (branchItems.length > 1) blocked.push("MultipleBranches");
  else if (branchItems.length === 1 && !branch) blocked.push("UnsupportedBranch");
  const state = casterState(actor);
  if (state.enabled && !branch && !branchItems.length) blocked.push("BranchNotChosen");
  return {
    applicable: true,
    configured: state.enabled,
    level: Number.isInteger(level) && level >= 1 && level <= 20 ? level : null,
    branch,
    branchId,
    blocked,
    errors: blocked.map(code => ({ code })),
    contextKey: JSON.stringify([CLASS_ID, classItem?.id ?? null, Number.isFinite(level) ? level : null, branchId, state.enabled])
  };
}
