/** Vanguard feature setup: preview and apply class features up to current Vanguard level idempotently. */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { VANGUARD_CLASS_ID, vanguardProfile, vanguardLevel } from "./vanguard-rules.mjs";
import { sourceEntryData } from "./caster-setup.mjs";
import { need } from "./operation-kernel.mjs";

export const VANGUARD_CORE_FEATURES = Object.freeze([
  { id: "class-feature-vanguard-1st-level-vanguard-branch-1724", level: 1, name: "1st Level: Vanguard Branch" },
  { id: "class-feature-vanguard-1st-level-landstrider-2798", level: 1, name: "1st Level: Landstrider" },
  { id: "class-feature-vanguard-1st-level-tip-of-the-spear-3092", level: 1, name: "1st Level: Tip of the Spear" },
  { id: "class-feature-vanguard-2nd-level-basic-operator-skill-4136", level: 2, name: "2nd Level: Basic Operator Skill" },
  { id: "class-feature-vanguard-3rd-level-basic-vanguard-talent-4299", level: 3, name: "3rd Level: Basic Vanguard Talent" },
  { id: "class-feature-vanguard-3rd-level-quick-off-the-mark-4553", level: 3, name: "3rd Level: Quick off the Mark" },
  { id: "class-feature-vanguard-4th-level-ability-score-improvement-4681", level: 4, name: "4th Level: Ability Score Improvement" },
  { id: "class-feature-vanguard-5th-level-extra-attack-5168", level: 5, name: "5th Level: Extra Attack" },
  { id: "class-feature-vanguard-7th-level-advanced-operator-skill-5271", level: 7, name: "7th Level: Advanced Operator Skill" },
  { id: "class-feature-vanguard-9th-level-advanced-talent-5447", level: 9, name: "9th Level: Advanced Talent" },
  { id: "class-feature-vanguard-11th-level-uncanny-dodge-5709", level: 11, name: "11th Level: Uncanny Dodge" },
  { id: "class-feature-vanguard-14th-level-elite-operator-skill-5883", level: 14, name: "14th Level: Elite Operator Skill" },
  { id: "class-feature-vanguard-15th-level-directed-engagement-6048", level: 15, name: "15th Level: Directed Engagement" },
  { id: "class-feature-vanguard-18th-level-lightspeed-6281", level: 18, name: "18th Level: Lightspeed" },
  { id: "class-feature-vanguard-20th-level-approaching-storm-6548", level: 20, name: "20th Level: Approaching Storm" }
]);

function branchFeatures(branch, level) {
  if (!branch) return [];
  const name = branch.replace(/([A-Z])/g, " $1").trim().toLowerCase();
  const title = name[0].toUpperCase() + name.slice(1);
  return CHAPTER_THREE_CLASSES.filter(entry => entry.kind === "subclass-feature" &&
    entry.parentClass === "Vanguard" && String(entry.parentBranch).toLowerCase() === title.toLowerCase() &&
    (entry.level == null || entry.level <= level));
}

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
    data.flags.ak5e.vanguardFeature = true;
    return withNativeEffects(data, entry.id);
  }
  const source = CHAPTER_THREE_CLASSES.find(e => e.id === entry.id);
  if (source) {
    const data = sourceEntryData(source);
    data.flags ??= {};
    data.flags.ak5e ??= {};
    data.flags.ak5e.chapterThreeId = entry.id;
    data.flags.ak5e.vanguardFeature = true;
    return withNativeEffects(data, entry.id);
  }
  return {
    name: entry.name,
    type: "feat",
    img: "icons/skills/movement/feet-winged-boots-glowing-yellow.webp",
    system: { description: { value: `<p>AK5e Vanguard Feature: ${entry.name}</p>` } },
    flags: { ak5e: { chapterThreeId: entry.id, vanguardFeature: true } }
  };
}

function withNativeEffects(data, sourceId) {
  const additions = [];
  if (sourceId === "class-feature-vanguard-1st-level-landstrider-2798") additions.push({
    name: "Landstrider: Walking Speed +10 ft", transfer: true,
    changes: [{ key: "system.attributes.movement.walk", mode: 2, value: "10", priority: 20 }],
    flags: { ak5e: { vanguardManagedEffect: "landstrider-speed" } }
  });
  if (additions.length) {
    data.effects ??= [];
    for (const effect of additions) if (!data.effects.some(existing => flag(existing, "vanguardManagedEffect") === effect.flags.ak5e.vanguardManagedEffect)) data.effects.push(effect);
  }
  return data;
}

export async function previewVanguardSetup(actor) {
  const profile = vanguardProfile(actor);
  need(actor?.isOwner && profile.applicable && !profile.blocked.length, "Choose an owned character with one valid Vanguard branch.");
  const level = profile.level ?? 1;
  const existing = list(actor.items);
  const creates = [], kept = [], effectUpdates = [], effectDeletes = [];

  for (const feat of VANGUARD_CORE_FEATURES) {
    if (feat.level > level) continue;
    const owned = existing.find(i => flag(i, "chapterThreeId") === feat.id);
    if (owned) {
      kept.push(feat.name);
      if (feat.id === "class-feature-vanguard-3rd-level-quick-off-the-mark-4553") {
        const obsolete = list(owned.effects).filter(effect => flag(effect, "vanguardManagedEffect") === "quick-off-mark-initiative").map(effect => effect.id);
        if (obsolete.length) effectDeletes.push({ itemId: owned.id, effectIds: obsolete });
      }
      const authoredData = withNativeEffects({ effects: list(owned.effects).map(effect => effect.toObject?.() ?? structuredClone(effect)) }, feat.id);
      const present = new Set(list(owned.effects).map(effect => flag(effect, "vanguardManagedEffect")).filter(Boolean));
      const missingEffects = authoredData.effects.filter(effect => effect.flags?.ak5e?.vanguardManagedEffect && !present.has(effect.flags.ak5e.vanguardManagedEffect));
      if (missingEffects.length) effectUpdates.push({ itemId: owned.id, effects: missingEffects });
    } else {
      creates.push(featureItemData(feat));
    }
  }

  const branch = profile.branch;
  for (const entry of branchFeatures(branch, level)) {
    const owned = existing.find(item => flag(item, "chapterThreeId") === entry.id);
    if (owned) kept.push(entry.name);
    else creates.push(featureItemData({ id: entry.id, name: entry.name }));
  }

  const contextKey = JSON.stringify([actor.uuid, level, branch, creates.map(c => c.flags?.ak5e?.chapterThreeId), kept, effectUpdates, effectDeletes]);
  return {
    level,
    creates,
    effectUpdates,
    effectDeletes,
    kept,
    contextKey,
    actorUpdates: {
      "flags.ak5e.vanguard.enabled": true
    }
  };
}

export async function applyVanguardSetup(actor, { confirmed, contextKey } = {}) {
  need(confirmed === true, "Confirm the previewed Vanguard setup first.");
  const plan = await previewVanguardSetup(actor);
  need(plan.contextKey === contextKey, "The character changed since the preview; preview the Vanguard setup again.");

  if (plan.creates.length) {
    const present = new Set(list(actor.items).map(item => flag(item, "chapterThreeId")).filter(Boolean));
    const missing = plan.creates.filter(item => !present.has(item.flags?.ak5e?.chapterThreeId));
    if (missing.length) await actor.createEmbeddedDocuments("Item", missing);
  }
  for (const update of plan.effectUpdates) {
    const item = actor.items.get(update.itemId);
    if (!item) continue;
    const pending = update.effects.filter(effect => !list(item.effects).some(current => flag(current, "vanguardManagedEffect") === effect.flags?.ak5e?.vanguardManagedEffect));
    if (pending.length) await item.createEmbeddedDocuments("ActiveEffect", pending);
  }
  for (const deletion of plan.effectDeletes) {
    const item = actor.items.get(deletion.itemId);
    if (!item) continue;
    const existing = deletion.effectIds.filter(id => item.effects.has(id));
    if (existing.length) await item.deleteEmbeddedDocuments("ActiveEffect", existing);
  }
  await actor.update(plan.actorUpdates);

  return {
    level: plan.level,
    created: plan.creates.map(c => c.name),
    kept: plan.kept,
    removedEffects: plan.effectDeletes.reduce((count, entry) => count + entry.effectIds.length, 0)
  };
}
