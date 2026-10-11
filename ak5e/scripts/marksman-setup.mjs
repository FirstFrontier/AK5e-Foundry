/**
 * Marksman feature setup: preview and apply class and branch features up to current Marksman level idempotently.
 */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import {
  MARKSMAN_CLASS_ID, marksmanProfile, marksmanLevel, marksmanBranch, marksmanEnabled
} from "./marksman-rules.mjs";
import { defineMarksmanPools } from "./marksman-features.mjs";
import { defineArtillerymanPools } from "./artilleryman-features.mjs";
import { defineBesiegerPools } from "./besieger-features.mjs";
import { defineAntiAirPools } from "./anti-air-features.mjs";
import { defineFlingerPools } from "./flinger-features.mjs";
import { defineHeavyshotPools } from "./heavyshot-features.mjs";
import { defineHunterPools } from "./hunter-features.mjs";
import { defineSpreadshotPools } from "./spreadshot-features.mjs";
import { sourceEntryData } from "./caster-setup.mjs";
import { need } from "./operation-kernel.mjs";

export const MARKSMAN_CORE_FEATURES = Object.freeze([
  { id: "class-feature-marksman-1st-level-marksman-branch-2188", level: 1, name: "1st Level: Marksman Branch" },
  { id: "class-feature-marksman-1st-level-fighting-style-4311", level: 1, name: "1st Level: Fighting Style" },
  { id: "class-feature-marksman-1st-level-high-ground-4140", level: 1, name: "1st Level: High Ground" },
  { id: "class-feature-marksman-1st-level-target-lock-5879", level: 1, name: "1st Level: Target Lock" },
  { id: "class-feature-marksman-2nd-level-basic-operator-skill-6278", level: 2, name: "2nd Level: Basic Operator Skill" },
  { id: "class-feature-marksman-3rd-level-basic-talent-6441", level: 3, name: "3rd Level: Basic Talent" },
  { id: "class-feature-marksman-4th-level-ability-score-improvement-6685", level: 4, name: "4th Level: Ability Score Improvement" },
  { id: "class-feature-marksman-5th-level-extra-attack-7003", level: 5, name: "5th Level: Extra Attack" },
  { id: "class-feature-marksman-7th-level-advanced-operator-skill-7125", level: 7, name: "7th Level: Advanced Operator Skill" },
  { id: "class-feature-marksman-9th-level-advanced-talent-7301", level: 9, name: "9th Level: Advanced Talent" },
  { id: "class-feature-marksman-12th-level-enhanced-target-lock-7562", level: 11, name: "Enhanced Target Lock" },
  { id: "class-feature-marksman-14th-level-elite-operator-skill-7865", level: 14, name: "14th Level: Elite Operator Skill" },
  { id: "class-feature-marksman-17th-level-unerring-8030", level: 17, name: "17th Level: Unerring" },
  { id: "class-feature-marksman-20th-level-steel-rain-8300", level: 20, name: "20th Level: Steel Rain" }
]);

export const ARTILLERYMAN_BRANCH_FEATURES = Object.freeze([
  { id: "class-feature-marksman-artilleryman-1st-level-tools-of-the-trade-313", level: 1, name: "1st Level: Tools of the Trade" },
  { id: "class-feature-marksman-artilleryman-1st-level-delayed-detonation-1025", level: 1, name: "1st Level: Delayed Detonation" },
  { id: "class-feature-marksman-artilleryman-4th-level-secondary-detonation-1692", level: 4, name: "4th Level: Secondary Detonation" },
  { id: "class-feature-marksman-artilleryman-10th-level-bigger-booms-2381", level: 10, name: "10th Level: Bigger Booms" },
  { id: "class-feature-marksman-artilleryman-15th-level-force-of-nature-2913", level: 15, name: "15th Level: Force of Nature" },
  { id: "class-feature-marksman-artilleryman-18th-level-explosive-dawn-3520", level: 18, name: "18th Level: Explosive Dawn" }
]);

export const BESIEGER_BRANCH_FEATURES = Object.freeze([
  { id: "class-feature-marksman-besieger-1st-level-siege-mode-361", level: 1, name: "1st Level: Siege Mode" },
  { id: "class-feature-marksman-besieger-1st-level-large-target-1172", level: 1, name: "1st Level: Large Target" },
  { id: "class-feature-marksman-besieger-4th-level-deliberate-efficient-1558", level: 4, name: "4th Level: Deliberate, Efficient" },
  { id: "class-feature-marksman-besieger-10th-level-siege-bolt-1932", level: 10, name: "10th Level: Siege Bolt" },
  { id: "class-feature-marksman-besieger-15th-level-goliath-s-bane-2666", level: 15, name: "15th Level: Goliath's Bane" },
  { id: "class-feature-marksman-besieger-18th-level-godpiercer-3164", level: 18, name: "18th Level: Godpiercer" }
]);

export const ANTI_AIR_BRANCH_FEATURES = Object.freeze([
  { id: "subclass-feature-marksman-anti-air-1st-level-weight-of-fire-385", level: 1, name: "1st Level: Weight of Fire" },
  { id: "subclass-feature-marksman-anti-air-1st-level-air-tracking-729", level: 1, name: "1st Level: Air Tracking" },
  { id: "subclass-feature-marksman-anti-air-4th-level-versatile-approach-1446", level: 4, name: "4th Level: Versatile Approach" },
  { id: "subclass-feature-marksman-anti-air-10th-level-unapproachable-3441", level: 10, name: "10th Level: Unapproachable" },
  { id: "subclass-feature-marksman-anti-air-15th-level-always-another-option-4043", level: 15, name: "15th Level: Always Another Option" },
  { id: "subclass-feature-marksman-anti-air-18th-level-the-last-option-5243", level: 18, name: "18th Level: The Last Option" }
]);

export const DEADEYE_BRANCH_FEATURES = Object.freeze([
  { id: "subclass-feature-marksman-deadeye-1st-level-deadshot-247", level: 1, name: "1st Level: Deadshot" },
  { id: "subclass-feature-marksman-deadeye-1st-level-target-shooting-721", level: 1, name: "1st Level: Target Shooting" },
  { id: "subclass-feature-marksman-deadeye-4th-level-vital-strike-1407", level: 4, name: "4th Level: Vital Strike" },
  { id: "subclass-feature-marksman-deadeye-10th-level-anti-sniper-training-1678", level: 10, name: "10th Level: Anti-Sniper Training" },
  { id: "subclass-feature-marksman-deadeye-15th-level-improved-deadshot-2393", level: 15, name: "15th Level: Improved Deadshot" },
  { id: "subclass-feature-marksman-deadeye-18th-level-ultimate-deadshot-2842", level: 18, name: "18th Level: Ultimate Deadshot" }
]);

export const FLINGER_BRANCH_FEATURES = Object.freeze([
  { id: "subclass-feature-marksman-flinger-equipment-and-fighting-style-exchange-244", level: 1, name: "Equipment and Fighting Style Exchange" },
  { id: "subclass-feature-marksman-flinger-1st-level-manipulation-arts-578", level: 1, name: "1st Level: Manipulation Arts" },
  { id: "subclass-feature-marksman-flinger-1st-level-weapon-binding-3296", level: 1, name: "1st Level: Weapon Binding" },
  { id: "subclass-feature-marksman-flinger-4th-level-aftershock-5682", level: 4, name: "4th Level: Aftershock" },
  { id: "subclass-feature-marksman-flinger-10th-level-kinetic-strike-6203", level: 10, name: "10th Level: Kinetic Strike" },
  { id: "subclass-feature-marksman-flinger-15th-level-pass-through-strike-6810", level: 15, name: "15th Level: Pass-through Strike" },
  { id: "subclass-feature-marksman-flinger-18th-level-whirling-death-7059", level: 18, name: "18th Level: Whirling Death" }
]);

export const HEAVYSHOT_BRANCH_FEATURES = Object.freeze([
  { id: "subclass-feature-marksman-heavyshot-1st-level-weapon-tuning-498", level: 1, name: "1st Level: Weapon Tuning" },
  { id: "subclass-feature-marksman-heavyshot-1st-level-devastator-1495", level: 1, name: "1st Level: Devastator" },
  { id: "subclass-feature-marksman-heavyshot-4th-level-savage-shots-2769", level: 4, name: "4th Level: Savage Shots" },
  { id: "subclass-feature-marksman-heavyshot-10th-level-improved-tuning-3166", level: 10, name: "10th Level: Improved Tuning" },
  { id: "subclass-feature-marksman-heavyshot-15th-level-lethal-weapon-3550", level: 15, name: "15th Level: Lethal Weapon" },
  { id: "subclass-feature-marksman-heavyshot-18th-level-heartseeker-3861", level: 18, name: "18th Level: Heartseeker" }
]);

export const HUNTER_BRANCH_FEATURES = Object.freeze([
  { id: "subclass-feature-marksman-hunter-1st-level-empowered-shots-416", level: 1, name: "1st Level: Empowered Shots" },
  { id: "subclass-feature-marksman-hunter-1st-level-energy-retention-1326", level: 1, name: "1st Level: Energy Retention" },
  { id: "subclass-feature-marksman-hunter-4th-level-enhanced-empowered-shots-1552", level: 4, name: "4th Level: Enhanced Empowered Shots" },
  { id: "subclass-feature-marksman-hunter-10th-level-railgun-2576", level: 10, name: "10th Level: Railgun" },
  { id: "subclass-feature-marksman-hunter-15th-level-ultimate-empowered-shots-3272", level: 15, name: "15th Level: Ultimate Empowered Shots" },
  { id: "subclass-feature-marksman-hunter-18th-level-let-the-light-in-3902", level: 18, name: "18th Level: Let the Light In" }
]);

export const SPREADSHOT_BRANCH_FEATURES = Object.freeze([
  { id: "subclass-feature-marksman-spreadshot-1st-level-spread-the-love-257", level: 1, name: "1st Level: Spread the Love" },
  { id: "subclass-feature-marksman-spreadshot-1st-level-whites-of-their-eyes-829", level: 1, name: "1st Level: Whites of Their Eyes" },
  { id: "subclass-feature-marksman-spreadshot-4th-level-break-their-lines-1566", level: 4, name: "4th Level: Break Their Lines" },
  { id: "subclass-feature-marksman-spreadshot-10th-level-versatility-of-violence-2440", level: 10, name: "10th Level: Versatility of Violence" },
  { id: "subclass-feature-marksman-spreadshot-15th-level-breach-and-clear-4307", level: 15, name: "15th Level: Breach and Clear" },
  { id: "subclass-feature-marksman-spreadshot-18th-level-both-barrels-4771", level: 18, name: "18th Level: Both Barrels" }
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
    data.flags.ak5e.marksmanFeature = true;
    return data;
  }
  const source = CHAPTER_THREE_CLASSES.find(e => e.id === entry.id);
  if (source) {
    const data = sourceEntryData(source);
    data.flags ??= {};
    data.flags.ak5e ??= {};
    data.flags.ak5e.chapterThreeId = entry.id;
    data.flags.ak5e.marksmanFeature = true;
    return data;
  }
  return {
    name: entry.name,
    type: "feat",
    img: "icons/skills/ranged/target-bullseye-crosshair-red.webp",
    system: { description: { value: `<p>AK5e Marksman Feature: ${entry.name}</p>` } },
    flags: { ak5e: { chapterThreeId: entry.id, marksmanFeature: true } }
  };
}

export async function previewMarksmanSetup(actor) {
  const profile = marksmanProfile(actor);
  need(actor?.isOwner && profile.applicable, "Choose an owned character with the Marksman class.");
  const level = profile.level ?? 1;
  const branch = profile.branch;
  const existing = list(actor.items);
  const creates = [], kept = [];

  // Core class features
  for (const feat of MARKSMAN_CORE_FEATURES) {
    if (feat.level > level) continue;
    const owned = existing.find(i => flag(i, "chapterThreeId") === feat.id || i.name === feat.name);
    if (owned) kept.push(feat.name);
    else creates.push(featureItemData(feat));
  }

  // Branch features
  const branchFeatures = branch === "artilleryman"
    ? ARTILLERYMAN_BRANCH_FEATURES
    : branch === "besieger"
      ? BESIEGER_BRANCH_FEATURES
      : branch === "antiAir"
        ? ANTI_AIR_BRANCH_FEATURES
        : branch === "deadeye"
          ? DEADEYE_BRANCH_FEATURES
          : branch === "flinger"
            ? FLINGER_BRANCH_FEATURES
            : branch === "heavyshot"
              ? HEAVYSHOT_BRANCH_FEATURES
              : branch === "hunter"
                ? HUNTER_BRANCH_FEATURES
                : branch === "spreadshot"
                  ? SPREADSHOT_BRANCH_FEATURES
                  : [];

  for (const feat of branchFeatures) {
    if (feat.level > level) continue;
    const owned = existing.find(i => flag(i, "chapterThreeId") === feat.id || i.name === feat.name);
    if (owned) kept.push(feat.name);
    else creates.push(featureItemData(feat));
  }

  const contextKey = JSON.stringify([actor.uuid, level, branch, creates.map(c => c.name), kept]);
  return {
    level,
    branch,
    creates,
    kept,
    contextKey,
    actorUpdates: {
      "flags.ak5e.marksman.enabled": true
    }
  };
}

export async function applyMarksmanSetup(actor, { confirmed, contextKey } = {}) {
  need(confirmed === true, "Confirm the previewed Marksman setup first.");
  const plan = await previewMarksmanSetup(actor);
  need(!contextKey || plan.contextKey === contextKey, "The character changed since the preview; preview the Marksman setup again.");

  defineMarksmanPools();
  if (plan.branch === "artilleryman") defineArtillerymanPools();
  if (plan.branch === "besieger") defineBesiegerPools();
  if (plan.branch === "antiAir") defineAntiAirPools();
  if (plan.branch === "flinger") defineFlingerPools();
  if (plan.branch === "heavyshot") defineHeavyshotPools();
  if (plan.branch === "hunter") defineHunterPools();
  if (plan.branch === "spreadshot") defineSpreadshotPools();

  await actor.update(plan.actorUpdates);
  if (plan.creates.length) {
    if (actor.createEmbeddedDocuments) {
      await actor.createEmbeddedDocuments("Item", plan.creates);
    } else {
      actor.items = [...list(actor.items), ...plan.creates];
    }
  }

  return {
    createdCount: plan.creates.length,
    keptCount: plan.kept.length,
    level: plan.level,
    branch: plan.branch
  };
}

