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
