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
    return data;
  }
  const source = CHAPTER_THREE_CLASSES.find(e => e.id === entry.id);
  if (source) {
    const data = sourceEntryData(source);
    data.flags ??= {};
    data.flags.ak5e ??= {};
    data.flags.ak5e.chapterThreeId = entry.id;
    data.flags.ak5e.vanguardFeature = true;
    return data;
  }
  return {
    name: entry.name,
    type: "feat",
    img: "icons/skills/movement/feet-winged-boots-glowing-yellow.webp",
    system: { description: { value: `<p>AK5e Vanguard Feature: ${entry.name}</p>` } },
    flags: { ak5e: { chapterThreeId: entry.id, vanguardFeature: true } }
  };
}

export async function previewVanguardSetup(actor) {
  const profile = vanguardProfile(actor);
  need(actor?.isOwner && profile.applicable, "Choose an owned character with the Vanguard class.");
  const level = profile.level ?? 1;
  const existing = list(actor.items);
  const creates = [], kept = [];

  for (const feat of VANGUARD_CORE_FEATURES) {
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
      "flags.ak5e.vanguard.enabled": true
    }
  };
}

export async function applyVanguardSetup(actor, { confirmed, contextKey } = {}) {
  need(confirmed === true, "Confirm the previewed Vanguard setup first.");
  const plan = await previewVanguardSetup(actor);
  need(plan.contextKey === contextKey, "The character changed since the preview; preview the Vanguard setup again.");

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
