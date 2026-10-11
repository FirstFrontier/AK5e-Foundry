/** Previewed, idempotent Defender setup. Preview is pure; apply requires explicit confirmation of the exact
 * preview (contextKey + plan), records a durable receipt first and never overwrites authored data. */
import { defenderProfile, defenderState, defenderLevel, reactionMax } from "./defender-rules.mjs";
import { flag, values, need } from "./operation-kernel.mjs";
import { serial, definePools, syncDefenderReactions, writeDefenderState } from "./defender-features.mjs";

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
  plan.contextKey = JSON.stringify([plan.profile.contextKey, plan.enable, plan.reactionMax,
    plan.createEffects.map(e => e.flags.ak5e[MANAGED_EFFECT_FLAG].sourceId), plan.updateEffects.map(u => u.effect.id), plan.addActivities.map(a => `${a.itemId}:${a.activity._id}`)]);
  return plan;
}

const APPLYING = new Set();
export async function applyDefenderSetup(actor, { confirmed, contextKey, operationId = globalThis.foundry?.utils?.randomID?.() } = {}) {
  need(actor?.isOwner && !actor.pack && actor.type === "character", "Choose an owned character.");
  need(confirmed === true, "Confirm the previewed Defender setup first.");
  need(typeof operationId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(operationId), "A stable operation ID is required.");
  need(!APPLYING.has(actor.uuid), "A Defender setup is already being applied.");
  APPLYING.add(actor.uuid);
  try {
    return await serial(actor, async () => {
      const state = defenderState(actor), previous = state.operations.find(o => o.id === operationId);
      if (previous?.status === "complete") return previous.result;
      const plan = previewDefenderSetup(actor);
      need(!plan.blocked.length, `Setup is blocked: ${plan.blocked.join(", ")}.`);
      need(plan.contextKey === contextKey, "The Actor changed since the preview; preview the setup again.");
      definePools();
      // Receipt first, so an interruption is visible and a retry resumes with the same choices.
      const op = previous ?? { id: operationId, command: "setup", data: { contextKey }, status: "prepared" };
      if (!previous) state.operations = [...state.operations.filter(o => o.status === "prepared" || o.id !== operationId).slice(-39), op];
      state.enabled = true;
      await writeDefenderState(actor, state);
      if (plan.createEffects.length) {
        // Retry-safe: skip an effect an interrupted earlier attempt already created.
        const have = new Set(values(actor.effects).map(e => flag(e, MANAGED_EFFECT_FLAG)?.sourceId));
        const create = plan.createEffects.filter(e => !have.has(e.flags.ak5e[MANAGED_EFFECT_FLAG].sourceId));
        if (create.length) await actor.createEmbeddedDocuments("ActiveEffect", create);
      }
      for (const { effect, changes } of plan.updateEffects) await effect.update(changes);
      for (const { itemId, activity } of plan.addActivities) {
        const item = actor.items.get(itemId);
        if (item && !(item.system?.activities?.get?.(activity._id) ?? item.system?.activities?.[activity._id])) await item.update({ [`system.activities.${activity._id}`]: activity });
      }
      await syncDefenderReactions(actor);
      const result = { enabled: true, reactionMax: plan.reactionMax, createdEffects: plan.createEffects.length, updatedEffects: plan.updateEffects.length,
        addedActivities: plan.addActivities.length, warnings: plan.warnings };
      const next = defenderState(actor), done = next.operations.find(o => o.id === operationId);
      if (done) { done.status = "complete"; done.result = result; }
      // A completed, fully reviewed setup supersedes an interrupted earlier setup receipt that would otherwise block commands.
      for (const stale of next.operations) if (stale.command === "setup" && stale.status === "prepared" && stale.id !== operationId) { stale.status = "reconciled"; stale.reason = `Superseded by setup ${operationId}.`; }
      await writeDefenderState(actor, next);
      return result;
    });
  } finally { APPLYING.delete(actor.uuid); }
}
