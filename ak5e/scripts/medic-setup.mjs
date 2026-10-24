/** Medic feature setup: preview and apply class and subclass features up to current Medic level idempotently. */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { MEDIC_CLASS_ID, medicProfile, medicLevel, medicEnabled } from "./medic-rules.mjs";
import { defineMedicPools } from "./medic-features.mjs";
import { sourceEntryData } from "./caster-setup.mjs";
import { need } from "./operation-kernel.mjs";

export const MEDIC_CORE_FEATURES = Object.freeze([
  { id: "class-feature-medic-1st-level-arts-casting-871", level: 1, name: "1st Level: Arts Casting" },
  { id: "class-feature-medic-1st-level-life-support-3076", level: 1, name: "1st Level: Life Support" },
  { id: "class-feature-medic-1st-level-medical-expertise-4006", level: 1, name: "1st Level: Medical Expertise" },
  { id: "class-feature-medic-1st-level-medic-branch-4174", level: 1, name: "1st Level: Medic Branch" },
  { id: "class-feature-medic-2nd-level-basic-operator-skill-5459", level: 2, name: "2nd Level: Basic Operator Skill" },
  { id: "class-feature-medic-3rd-level-basic-talent-5619", level: 3, name: "3rd Level: Basic Talent" },
  { id: "class-feature-medic-4th-level-ability-score-improvement-6064", level: 4, name: "4th Level: Ability Score Improvement" },
  { id: "class-feature-medic-5th-level-self-defence-protocol-6382", level: 5, name: "5th Level: Self-Defence Protocol" },
  { id: "class-feature-medic-7th-level-advanced-operator-skill-6917", level: 7, name: "7th Level: Advanced Operator Skill" },
  { id: "class-feature-medic-9th-level-advanced-talent-7090", level: 9, name: "9th Level: Advanced Talent" },
  { id: "class-feature-medic-12th-level-resuscitation-7349", level: 12, name: "12th Level: Resuscitation" },
  { id: "class-feature-medic-14th-level-elite-operator-skill-7593", level: 14, name: "14th Level: Elite Operator Skill" },
  { id: "class-feature-medic-18th-level-to-rob-the-ferryman-7755", level: 18, name: "18th Level: To Rob the Ferryman" },
  { id: "class-feature-medic-20th-level-chosen-of-asclepius-7904", level: 20, name: "20th Level: Chosen of Asclepius" }
]);

export const PHYSICIAN_FEATURES = Object.freeze([
  { id: "subclass-feature-medic-physician-1st-level-focused-treatment-287", level: 1, name: "1st Level: Focused Treatment" },
  { id: "subclass-feature-medic-physician-4th-level-intravenous-line-510", level: 4, name: "4th Level: Intravenous Line" },
  { id: "subclass-feature-medic-physician-7th-level-hypocritic-oath-1370", level: 7, name: "7th Level: Hypocritic Oath" },
  { id: "subclass-feature-medic-physician-11th-level-inpatient-care-1937", level: 11, name: "11th Level: Inpatient Care" },
  { id: "subclass-feature-medic-physician-15th-level-surgeon-general-2352", level: 15, name: "15th Level: Surgeon-General" }
]);

export const TRIAGE_FEATURES = Object.freeze([
  { id: "subclass-feature-medic-triage-1st-level-rapid-response-241", level: 1, name: "1st Level: Rapid Response / On the Scene" },
  { id: "subclass-feature-medic-triage-4th-level-urgent-care-centre-1178", level: 4, name: "4th Level: Urgent Care Centre" },
  { id: "subclass-feature-medic-triage-7th-level-emergency-medicine-1678", level: 7, name: "7th Level: Emergency Medicine / Stop the Flow" },
  { id: "subclass-feature-medic-triage-11th-level-touch-of-life-and-death-2148", level: 11, name: "11th Level: Touch of Life and Death" },
  { id: "subclass-feature-medic-triage-15th-level-mobile-hospital-2697", level: 15, name: "15th Level: Mobile Hospital" }
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
    data.flags.ak5e.medicFeature = true;
    return data;
  }
  const source = CHAPTER_THREE_CLASSES.find(e => e.id === entry.id);
  if (source) {
    const data = sourceEntryData(source);
    data.flags ??= {};
    data.flags.ak5e ??= {};
    data.flags.ak5e.chapterThreeId = entry.id;
    data.flags.ak5e.medicFeature = true;
    return data;
  }
  return {
    name: entry.name,
    type: "feat",
    img: "icons/skills/melee/weapons-crossed-swords-yellow.webp",
    system: { description: { value: `<p>AK5e Medic Feature: ${entry.name}</p>` } },
    flags: { ak5e: { chapterThreeId: entry.id, medicFeature: true } }
  };
}

export async function previewMedicSetup(actor) {
  const profile = medicProfile(actor);
  need(actor?.isOwner && profile.applicable, "Choose an owned character with the Medic class.");
  const level = profile.level ?? 1;
  const existing = list(actor.items);
  const creates = [], kept = [];

  const candidateFeatures = [...MEDIC_CORE_FEATURES];
  if (profile.branch === "physician") {
    candidateFeatures.push(...PHYSICIAN_FEATURES);
  } else if (profile.branch === "triage") {
    candidateFeatures.push(...TRIAGE_FEATURES);
  }

  for (const feat of candidateFeatures) {
    if (feat.level > level) continue;
    const owned = existing.find(i => flag(i, "chapterThreeId") === feat.id || i.name === feat.name);
    if (owned) {
      kept.push(feat.name);
    } else {
      creates.push(featureItemData(feat));
    }
  }

  const contextKey = JSON.stringify([actor.uuid, level, profile.branch, creates.map(c => c.name), kept]);
  return {
    level,
    branch: profile.branch,
    creates,
    kept,
    contextKey,
    actorUpdates: {
      "flags.ak5e.medic.enabled": true
    }
  };
}

export async function applyMedicSetup(actor, { confirmed, contextKey } = {}) {
  need(confirmed === true, "Confirm the previewed Medic setup first.");
  const plan = await previewMedicSetup(actor);
  need(plan.contextKey === contextKey, "The character changed since the preview; preview the Medic setup again.");

  defineMedicPools();

  await actor.update(plan.actorUpdates);
  if (plan.creates.length) {
    await actor.createEmbeddedDocuments("Item", plan.creates);
  }

  return {
    level: plan.level,
    branch: plan.branch,
    created: plan.creates.map(c => c.name),
    kept: plan.kept
  };
}
