/**
 * Supporter branch seam (Ch. 3 L6548-6692 and the Branch sections after L6858).
 * Each branch module (Artificer, Bard, Hexer and later branches) registers one definition here:
 *   { id, branch, plans, readings, cleanup, pools(), hooks(), sheetPanel(actor), api, progressionFeatures }
 * Only `id` and `branch` are required. `branch` is the lowercase key (for example "bard").
 * Registering a branch twice throws. Registration writes nothing to any World document.
 */
import * as supporterUsesModule from "./supporter-uses.mjs";
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { need } from "./operation-kernel.mjs";

export const SUPPORTER_BRANCH_MODULES = new Map();
const initializedBranches = new Set();

/** Hands a branch's plans, readings and cleanup to the Supporter use engine (U1 contract, guarded). */
function registerBranchPlans(definition) {
  if (typeof supporterUsesModule.registerSupporterPlans !== "function") return false;
  supporterUsesModule.registerSupporterPlans({
    plans: definition.plans ?? {},
    readings: definition.readings ?? {},
    ...(definition.cleanup ? { cleanup: definition.cleanup } : {})
  });
  return true;
}

function normalizeProgressionFeatures(features = {}) {
  const result = {};
  for (const [level, ids] of Object.entries(features ?? {})) {
    const numeric = Number(level);
    need(Number.isInteger(numeric) && numeric >= 1 && numeric <= 20, "Branch progressionFeatures keys must be levels 1 to 20.");
    need(Array.isArray(ids) && ids.every(id => typeof id === "string"), "Branch progressionFeatures values must be arrays of chapterThreeId strings.");
    result[numeric] = Object.freeze([...ids]);
  }
  return Object.freeze(result);
}

/**
 * Register a branch module. Throws on a malformed definition or a duplicate branch key.
 * Returns the frozen registered definition.
 */
export function registerSupporterBranchModule(definition) {
  need(definition && typeof definition === "object", "A Supporter branch module needs a definition object.");
  need(typeof definition.id === "string" && definition.id.length > 0, "A Supporter branch module needs an id.");
  need(typeof definition.branch === "string" && /^[a-z][a-z0-9-]*$/.test(definition.branch), "A Supporter branch module needs a lowercase branch key.");
  need(!SUPPORTER_BRANCH_MODULES.has(definition.branch), `Supporter branch ${definition.branch} is already registered.`);

  const registered = Object.freeze({
    ...definition,
    plans: Object.freeze({ ...(definition.plans ?? {}) }),
    readings: Object.freeze({ ...(definition.readings ?? {}) }),
    progressionFeatures: normalizeProgressionFeatures(definition.progressionFeatures)
  });
  SUPPORTER_BRANCH_MODULES.set(definition.branch, registered);
  registerBranchPlans(registered);
  return registered;
}

/**
 * Runs each registered branch's pools() and hooks() once. Safe to call repeatedly: a branch already
 * initialised is skipped, and a branch registered later is initialised on the next call.
 */
export function initSupporterBranches() {
  for (const [branch, definition] of SUPPORTER_BRANCH_MODULES) {
    if (initializedBranches.has(branch)) continue;
    definition.pools?.();
    definition.hooks?.();
    initializedBranches.add(branch);
  }
  return Object.freeze({ branches: [...initializedBranches] });
}

/** The `api` object of each registered branch, keyed by branch key (null when a branch declares none). */
export function supporterBranchApis() {
  return Object.freeze(Object.fromEntries([...SUPPORTER_BRANCH_MODULES].map(([branch, definition]) => [branch, definition.api ?? null])));
}

/**
 * chapterThreeIds of a branch's subclass features with a level at or below `level`, in source order.
 * A registered `progressionFeatures` map wins; otherwise the subclass-feature records for the branch are scanned.
 */
export function supporterBranchFeatureIds(branch, level) {
  const lvl = Number(level);
  const definition = SUPPORTER_BRANCH_MODULES.get(branch);
  const declared = definition?.progressionFeatures;
  if (declared && Object.keys(declared).length) {
    return Object.entries(declared)
      .filter(([featureLevel]) => Number(featureLevel) <= lvl)
      .sort(([a], [b]) => Number(a) - Number(b))
      .flatMap(([, ids]) => [...ids]);
  }
  return CHAPTER_THREE_CLASSES
    .filter(entry => entry.kind === "subclass-feature" && entry.parentClass === "Supporter"
      && String(entry.parentBranch ?? "").toLowerCase() === branch
      && Number.isInteger(entry.level) && entry.level <= lvl)
    .sort((a, b) => a.level - b.level)
    .map(entry => entry.id);
}
