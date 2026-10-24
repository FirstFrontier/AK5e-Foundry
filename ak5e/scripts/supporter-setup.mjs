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
    created: plan.creates.map(c => c.name),
    createdCount: plan.creates.length,
    kept: plan.kept,
    keptCount: plan.kept.length
  };
}
