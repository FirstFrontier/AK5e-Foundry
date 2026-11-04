/** Previewed, idempotent Defender setup. Preview is pure; apply requires explicit confirmation of the exact
 * preview (contextKey + plan), records a durable receipt first and never overwrites authored data. */
import { defenderProfile, defenderState, defenderLevel, reactionMax } from "./defender-rules.mjs";
import { flag, values, need } from "./operation-kernel.mjs";
import { serial, definePools } from "./defender-features.mjs";
import { runDefenderAdvancementLocked } from "./defender-advancement.mjs";

export const MANAGED_EFFECT_FLAG = "defenderManagedEffect";
/** Branch modules add their managed effects / activities here (see dreadnought-features, artshield-features). */
const planners = [];
export function registerSetupPlanner(planner) { if (!planners.includes(planner)) planners.push(planner); }

const normalize = changes => Array.from(changes ?? []).map(c => ({ key: c.key, mode: Number(c.mode), value: String(c.value), priority: Number(c.priority ?? 0) }));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Reconcile one managed Active Effect: create when missing, update only an unmodified managed baseline,
 * otherwise keep the authored effect and ask for review. `desired` = { sourceId, name, img, changes, disabled, respectManualDisable, duration, description }. */
export function reconcileManagedEffect(actor, desired, plan) {
  const existing = values(actor.effects).filter(e => flag(e, MANAGED_EFFECT_FLAG)?.sourceId === desired.sourceId);
  if (existing.length > 1) plan.warnings.push(`More than one managed effect exists for ${desired.name}; review duplicates manually.`);
  const effect = existing[0], changes = normalize(desired.changes);
  const provenance = { sourceId: desired.sourceId, managedChanges: changes, source: desired.source ?? null, active: !desired.disabled, reviewRequired: false };
  if (!effect) {
    plan.createEffects.push({ name: desired.name, img: desired.img ?? "icons/svg/aura.svg", disabled: desired.disabled === true, transfer: false,
      changes: desired.changes, description: desired.description ?? "", ...(desired.duration ? { duration: desired.duration } : {}),
      flags: { ak5e: { [MANAGED_EFFECT_FLAG]: provenance } } });
    return;
  }
  const managed = flag(effect, MANAGED_EFFECT_FLAG) ?? {}, current = normalize(effect.changes ?? effect._source?.changes);
  if (!Array.isArray(managed.managedChanges) || !same(current, normalize(managed.managedChanges))) {
    plan.warnings.push(`${desired.name} has changes beyond its managed baseline; they were preserved and need GM review.`);
    return;
  }
  const update = {};
  if (!same(current, changes)) update.changes = desired.changes;
  if (desired.disabled !== undefined && effect.disabled !== desired.disabled) {
    // A GM who switched an always-on effect off keeps it off; only an effect this module itself disabled (active: false) comes back.
    if (desired.respectManualDisable && desired.disabled === false && managed.active !== false) { /* leave the GM's choice */ }
    else { update.disabled = desired.disabled; update[`flags.ak5e.${MANAGED_EFFECT_FLAG}.active`] = !desired.disabled; }
  }
  if (!same(managed.managedChanges, changes)) update[`flags.ak5e.${MANAGED_EFFECT_FLAG}`] = provenance;
  if (Object.keys(update).length) plan.updateEffects.push({ effect, changes: update });
}
/** Add a native activity to a feature Item only when it is missing; an existing (possibly edited) activity wins. */
export function planActivity(actor, chapterThreeId, activity, plan) {
  const item = values(actor.items).find(i => flag(i, "chapterThreeId") === chapterThreeId);
  if (!item) { plan.missing.push(chapterThreeId); return; }
  const present = item.system?.activities?.get?.(activity._id) ?? item.system?.activities?.[activity._id];
  if (!present) plan.addActivities.push({ itemId: item.id, name: item.name, activity });
}

export function previewDefenderSetup(actor) {
  const profile = defenderProfile(actor), state = defenderState(actor);
  const plan = { version: 1, applicable: profile.applicable, profile, blocked: [...profile.blocked], warnings: [], missing: [],
    enable: profile.applicable && !state.enabled, reactionMax: null, createEffects: [], updateEffects: [], addActivities: [] };
  if (!profile.applicable) { plan.blocked.push("NotDefender"); return finish(plan); }
  if (profile.blocked.length || profile.level === null) return finish(plan);
  const level = defenderLevel(actor), max = reactionMax(level);
  if ((flag(actor, "reactionBudget")?.max ?? 1) !== max) plan.reactionMax = max;
  if (!profile.implemented && profile.branch) plan.warnings.push(`The ${profile.branch} Branch has no automation yet; only Defender class features are set up.`);
  if (!profile.branch) plan.warnings.push("No Defender Branch is attached; attach one to receive Branch support.");
  for (const planner of planners) planner(actor, profile, plan);
  return finish(plan);
}
function finish(plan) {
  plan.empty = !plan.enable && plan.reactionMax === null && !plan.createEffects.length && !plan.updateEffects.length && !plan.addActivities.length;
  // §3.3/§3.2: confirmation binds to the COMPLETE planned delta, not just the document ids. A branch planner
  // that keeps the same managed effect ID but changes what the plan will write (e.g. Artshield Operator Skill
  // state) must invalidate an older preview instead of being confirmed stale.
  plan.contextKey = setupKey(plan);
  return plan;
}

/** Canonical, immutable description of everything setup intends to write (transient warnings excluded).
 * Every planned create field is bound here, `flags` included: `setupSteps` persists them, so a change to managed
 * effect provenance must invalidate the preview instead of replaying under a confirmation for other content. */
function setupDelta(plan) {
  return {
    enable: plan.enable,
    reactionMax: plan.reactionMax,
    create: plan.createEffects.map(plannedCreate),
    update: plan.updateEffects.map(entry => ({ id: entry.effect.id, changes: entry.changes })),
    activity: plan.addActivities.map(entry => ({ itemId: entry.itemId, activity: entry.activity }))
  };
}
/** The create intent exactly as `setupSteps` persists it, minus the ids assigned at step time. */
function plannedCreate(effect) {
  const { _id, ...rest } = effect ?? {};
  return rest;
}

/** Preview key and immutable-input fingerprint both bind the profile context (class/item/level/branch/enabled) and
 * the complete planned delta, so neither a profile-context change nor a changed managed write can reuse a receipt. */
function setupKey(plan) {
  return stableJson([plan.profile.contextKey, setupDelta(plan)]);
}

const APPLYING = new Set();
const STEP_MARKER = "defenderAdvancementStep";

/** The journal operation recorded under this id, read straight from the flag (no second state store). */
function advancementOperation(actor, id) {
  const stored = flag(actor, "defenderAdvancement");
  const operations = Array.isArray(stored?.operations) ? stored.operations : [];
  return operations.find(op => op && op.id === id) ?? null;
}

/** Deterministic serialisation of the immutable setup choices; transient confirmations are excluded (§3.3). */
function stableJson(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().filter(key => value[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}
function setupFingerprint(plan) {
  return setupKey(plan);
}

/** Read one dotted leaf off a live document (collections are looked up through `get`). */
function readLeaf(document, path) {
  let target = document;
  for (const part of String(path).split(".")) {
    if (target === null || target === undefined) return undefined;
    if (target instanceof Map) target = target.get(part);
    else if (Object.hasOwn(target, part)) target = target[part];
    else if (typeof target.get === "function" && !Array.isArray(target)) target = target.get(part);
    else return undefined;
  }
  return target;
}

/** The complete write-ahead step list: every id is preassigned here and never regenerated on retry. */
function setupSteps(actor, plan, operationId) {
  const steps = [];
  if (plan.enable) {
    steps.push({ id: "enable", type: "actorPatch",
      before: { "flags.ak5e.defender.enabled": false }, after: { "flags.ak5e.defender.enabled": true } });
  }
  if (plan.reactionMax !== null) {
    // An absent leaf means the module default (1); the journal records that documented default so undo
    // restores a readable value and CAS can compare an absent leaf with it.
    const stored = flag(actor, "reactionBudget"), before = Number.isInteger(stored?.max) ? stored.max : 1;
    // A leaf patch: spent Reactions, triggers and receipts are never reset by reaching Reactive (C3:1033-1034).
    steps.push({ id: "reaction-max", type: "actorPatch",
      before: { "flags.ak5e.reactionBudget.max": before }, after: { "flags.ak5e.reactionBudget.max": plan.reactionMax } });
  }
  const allocated = new Set();
  for (const [index, desired] of plan.createEffects.entries()) {
    // Preallocate one stable ID per created document. A provider that repeats (or sanitises away) an ID must
    // never collapse two creates onto one step: disambiguate deterministically instead of trusting randomness.
    const base = String(globalThis.foundry?.utils?.randomID?.() ?? "ak5eEffect").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 70) || "ak5eEffect";
    let documentId = base, suffix = 0;
    while (allocated.has(documentId)) documentId = `${base}-${++suffix}`;
    allocated.add(documentId);
    const stepId = `create-${index + 1}-${documentId}`;
    steps.push({ id: stepId, type: "embeddedCreate", documentType: "ActiveEffect", documentId, before: null,
      after: { ...structuredClone(desired), _id: documentId,
        flags: { ak5e: { ...(desired.flags?.ak5e ?? {}), [STEP_MARKER]: { operationId, stepId } } } } });
  }
  for (const { effect, changes } of plan.updateEffects) {
    const before = {};
    for (const key of Object.keys(changes)) {
      const value = readLeaf(effect, key);
      if (value !== undefined) before[key] = structuredClone(value);
    }
    steps.push({ id: `update-${effect.id}`, type: "embeddedPatch", documentType: "ActiveEffect", documentId: effect.id, before, after: structuredClone(changes) });
  }
  for (const { itemId, activity } of plan.addActivities) {
    steps.push({ id: `activity-${itemId}-${activity._id}`, type: "embeddedPatch", documentType: "Item", documentId: itemId,
      before: {}, after: { [`system.activities.${activity._id}`]: structuredClone(activity) } });
  }
  return steps;
}

const setupResult = plan => ({ enabled: true, reactionMax: plan.reactionMax, createdEffects: plan.createEffects.length,
  updatedEffects: plan.updateEffects.length, addedActivities: plan.addActivities.length, warnings: [...plan.warnings] });

export async function applyDefenderSetup(actor, { confirmed, contextKey, operationId = globalThis.foundry?.utils?.randomID?.() } = {}) {
  need(actor?.isOwner && !actor.pack && actor.type === "character", "Choose an owned character.");
  need(confirmed === true, "Confirm the previewed Defender setup first.");
  need(typeof operationId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(operationId), "A stable operation ID is required.");
  need(!APPLYING.has(actor.uuid), "A Defender setup is already being applied.");
  APPLYING.add(actor.uuid);
  try {
    return await serial(actor, async () => {
      const previous = advancementOperation(actor, operationId);
      const plan = previewDefenderSetup(actor), fingerprint = setupFingerprint(plan);
      // §3.3: changed immutable input rejects BEFORE any completed-receipt replay shortcut. The fingerprint
      // binds the profile context and every planned write field, so neither a profile-context change nor a
      // changed managed effect/activity can be absorbed by an existing receipt under the same id. The replay
      // key is the ORIGINAL receipt's acknowledged key only: a freshly generated key for changed context is
      // not proof of the original confirmation, so it must reject with the changed-input error even when the
      // pending plan is empty and no write would occur.
      const sameInput = previous ? previous.fingerprint === fingerprint : false;
      const samePreview = previous ? contextKey === previous.contextKey : false;
      if (previous) {
        need(previous.kind === "setup", `Operation ${operationId} belongs to ${previous.kind}, not setup.`);
        if (!sameInput) {
          // Nothing left to apply under the acknowledged preview: a replay can only return the recorded result.
          if (previous.status === "complete" && plan.empty && samePreview) return structuredClone(previous.result);
          if (previous.status === "applying") throw new Error(`Operation ${operationId} was interrupted; resume it with retryDefenderAdvancement.`);
          throw new Error(`Operation ${operationId} was already used with different setup choices; use a new operation ID.`);
        }
        need(samePreview, "The Actor changed since the preview; preview the setup again.");
        if (previous.status === "complete") return structuredClone(previous.result);
        need(previous.status === "applying", `Operation ${operationId} was undone; use a new operation ID.`);
      }
      need(!plan.blocked.length, `Setup is blocked: ${plan.blocked.join(", ")}.`);
      need(plan.contextKey === contextKey, "The Actor changed since the preview; preview the setup again.");
      if (plan.empty) {
        return { enabled: defenderState(actor).enabled === true, reactionMax: null, createdEffects: 0, updatedEffects: 0,
          addedActivities: 0, warnings: [...plan.warnings] };
      }
      definePools();
      // The journal persists this whole intent (ids + before-data) before the first document changes.
      return runDefenderAdvancementLocked(actor, { kind: "setup", id: operationId, contextKey, fingerprint,
        steps: setupSteps(actor, plan, operationId), result: setupResult(plan) });
    });
  } finally { APPLYING.delete(actor.uuid); }
}
