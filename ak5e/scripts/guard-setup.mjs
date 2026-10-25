/** Guard feature setup: preview and apply class features up to current Guard level idempotently. */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { GUARD_CLASS_ID, guardProfile, guardLevel, guardEnabled } from "./guard-rules.mjs";
import { defineGuardPools } from "./guard-features.mjs";
import { sourceEntryData } from "./caster-setup.mjs";
import { need } from "./operation-kernel.mjs";

export const GUARD_CORE_FEATURES = Object.freeze([
  { id: "class-feature-guard-1st-level-guard-branch-2128", level: 1, name: "1st Level: Guard Branch" },
  { id: "class-feature-guard-1st-level-fighting-style-4025", level: 1, name: "1st Level: Fighting Style" },
  { id: "class-feature-guard-1st-level-press-the-attack-5745", level: 1, name: "1st Level: Press the Attack" },
  { id: "class-feature-guard-2nd-level-basic-operator-skill-7322", level: 2, name: "2nd Level: Basic Operator Skill" },
  { id: "class-feature-guard-3rd-level-unrelenting-7482", level: 3, name: "3rd Level: Unrelenting" },
  { id: "class-feature-guard-3rd-level-basic-talent-7783", level: 3, name: "3rd Level: Basic Talent" },
  { id: "class-feature-guard-4th-level-ability-score-improvement-8033", level: 4, name: "4th Level: Ability Score Improvement" },
  { id: "class-feature-guard-5th-level-extra-attack-8534", level: 5, name: "5th Level: Extra Attack" },
  { id: "class-feature-guard-7th-level-advanced-operator-skill-8655", level: 7, name: "7th Level: Advanced Operator Skill" },
  { id: "class-feature-guard-9th-level-advanced-talent-8838", level: 9, name: "9th Level: Advanced Talent" },
  { id: "class-feature-guard-11th-level-unrelenting-upgraded-9096", level: 11, name: "11th Level: Unrelenting Upgraded" },
  { id: "class-feature-guard-14th-level-elite-operator-skill-9491", level: 14, name: "14th Level: Elite Operator Skill" },
  { id: "class-feature-guard-15th-level-unrelenting-aggression-9653", level: 15, name: "15th Level: Unrelenting Aggression" },
  { id: "class-feature-guard-18th-level-eternal-aggression-10050", level: 18, name: "18th Level: Eternal Aggression" },
  { id: "class-feature-guard-20th-level-annihilation-protocol-10373", level: 20, name: "20th Level: Annihilation Protocol" }
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
    data.flags.ak5e.guardFeature = true;
    return data;
  }
  const source = CHAPTER_THREE_CLASSES.find(e => e.id === entry.id);
  if (source) {
    const data = sourceEntryData(source);
    data.flags ??= {};
    data.flags.ak5e ??= {};
    data.flags.ak5e.chapterThreeId = entry.id;
    data.flags.ak5e.guardFeature = true;
    return data;
  }
  return {
    name: entry.name,
    type: "feat",
    img: "icons/skills/melee/weapons-crossed-swords-yellow.webp",
    system: { description: { value: `<p>AK5e Guard Feature: ${entry.name}</p>` } },
    flags: { ak5e: { chapterThreeId: entry.id, guardFeature: true } }
  };
}

export async function previewGuardSetup(actor) {
  const profile = guardProfile(actor);
  need(actor?.isOwner && profile.applicable, "Choose an owned character with the Guard class.");
  const level = profile.level ?? 1;
  const existing = list(actor.items);
  const creates = [], kept = [];

  for (const feat of GUARD_CORE_FEATURES) {
    if (feat.level > level) continue;
    const owned = existing.find(i => flag(i, "chapterThreeId") === feat.id || i.name === feat.name);
    if (owned) {
      kept.push(feat.name);
    } else {
      creates.push(featureItemData(feat));
    }
  }

  if (profile.branch === "artsblade") {
    const features = CHAPTER_THREE_CLASSES.filter(entry => entry.kind === "subclass-feature" && entry.parentBranch === "Artsblade"
      && ((entry.level != null && entry.level <= level) || entry.id === "subclass-feature-guard-artsblade-blade-art-6708"
        || entry.id === "subclass-feature-guard-artsblade-artsblade-table-1152"
        || entry.id === "subclass-feature-guard-artsblade-resolving-spellsword-arts-2822"));
    for (const entry of features) {
      const owned = existing.find(item => flag(item, "chapterThreeId") === entry.id);
      if (owned) kept.push(entry.name);
      else creates.push(featureItemData({ ...entry, name: entry.name, level: entry.level ?? 1 }));
    }
  }

  const contextKey = JSON.stringify([actor.uuid, level, creates.map(c => c.name), kept]);
  return {
    level,
    creates,
    kept,
    contextKey,
    actorUpdates: {
      "flags.ak5e.guard.enabled": true
    }
  };
}

export async function applyGuardSetup(actor, { confirmed, contextKey } = {}) {
  need(confirmed === true, "Confirm the previewed Guard setup first.");
  const plan = await previewGuardSetup(actor);
  need(plan.contextKey === contextKey, "The character changed since the preview; preview the Guard setup again.");

  defineGuardPools();

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
