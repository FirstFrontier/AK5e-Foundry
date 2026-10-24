/**
 * Supporter talents (Ch. 3 L6809-6851): 12 Basic and 16 Advanced talents.
 * Each talent is one of three automation modes, following the head rulings (R11):
 *   "ae"     flat, unconditional numbers become Active Effects on the talent Item;
 *   "plan"   talents with uses or reactions run supporterUses plans (pool-tracked, warn rather than block,
 *            and post damage roll buttons only; no damage, healing, attack, save or feature dice are rolled);
 *   "manual" conditional, cross-class (R11) or unclear text becomes a manual card that quotes the source.
 * No numbers are invented: every value is copied from the source row or derived from its stated formula.
 * Module Effects are automated only where the source text is flat and unconditional; otherwise they stay manual.
 */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { definePool, getPoolDefinition } from "./resource-pools.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { need } from "./operation-kernel.mjs";
import { getReactions } from "./trigger-events.mjs";
import { flag, supporterLevel, aidDieSize } from "./supporter-rules.mjs";
import { registerSupporterPlans } from "./supporter-uses.mjs";

export const SUPPORTER_TALENT_FLAG = "supporterTalent";
const ADD = globalThis.CONST?.ACTIVE_EFFECT_MODES?.ADD ?? 2;

const ID = (tier, slug) => `class-option-supporter-talent-${tier}-${slug}`;
export const SUPPORTER_TALENT_IDS = Object.freeze({
  alacrity: ID("basic", "alacrity"),
  alert: ID("basic", "alert"),
  backToBack: ID("basic", "back-to-back"),
  blessingOfSafety: ID("basic", "blessing-of-safety"),
  hunter: ID("basic", "hunter-x"),
  lucky: ID("basic", "lucky"),
  preservingSanctuary: ID("basic", "preserving-sanctuary"),
  robotWars: ID("basic", "robot-wars"),
  skySmite: ID("basic", "sky-smite"),
  strengthThroughNumbers: ID("basic", "strength-through-numbers"),
  tough: ID("basic", "tough"),
  unarmouredAgility: ID("basic", "unarmoured-agility"),
  accelerando: ID("advanced", "accelerando"),
  antiArtsTraining: ID("advanced", "anti-arts-training"),
  artOfBinding: ID("advanced", "art-of-binding"),
  decoyBlip: ID("advanced", "decoy-blip"),
  elementalSpecialist: ID("advanced", "elemental-specialist"),
  escapeArtist: ID("advanced", "escape-artist"),
  extraAttack: ID("advanced", "extra-attack"),
  hammerAndAnvil: ID("advanced", "hammer-and-anvil"),
  ignition: ID("advanced", "ignition"),
  jumpstart: ID("advanced", "jumpstart"),
  lieutenant: ID("advanced", "lieutenant"),
  mirrorMove: ID("advanced", "mirror-move"),
  painfulLesson: ID("advanced", "painful-lesson"),
  partTimeInventor: ID("advanced", "part-time-inventor"),
  reliableTalent: ID("advanced", "reliable-talent"),
  shatterer: ID("advanced", "shatterer")
});

const ids = SUPPORTER_TALENT_IDS;

/** Automation table. `changes` are Active Effect changes for "ae" talents; `manual` gives the reason for a manual card. */
export const SUPPORTER_TALENT_RULES = Object.freeze({
  [ids.alacrity]: { mode: "ae", tier: "basic", changes: [{ key: "system.attributes.movement.walk", mode: ADD, value: "10" }], moduleMode: "manual", moduleReason: "The Module condition (taking the Dash Action) is a timing rule, not a flat number." },
  [ids.alert]: { mode: "ae", tier: "basic", changes: [{ key: "system.attributes.init.bonus", mode: ADD, value: "@attributes.prof" }], moduleMode: "manual", moduleReason: "Advantage on Initiative Rolls has no verified native key; GM applies it." },
  [ids.tough]: { mode: "ae", tier: "basic", changes: [{ key: "system.attributes.hp.bonuses.overall", mode: ADD, value: "@details.level * 2" }], moduleMode: "manual", moduleReason: "Recovering extra HP on each Hit Dice expenditure is a rider on a rest-time roll, not a flat number." },
  [ids.backToBack]: { mode: "manual", tier: "basic", reason: "Depends on an allied Creature with this Ability within 15 ft." },
  [ids.blessingOfSafety]: { mode: "manual", tier: "basic", reason: "Depends on the Hit Point state of each Creature within 10 ft." },
  [ids.hunter]: { mode: "manual", tier: "basic", reason: "Applies only against the chosen Creature Type; the type is not stored." },
  [ids.lucky]: { mode: "plan", tier: "basic", plan: "lucky" },
  [ids.preservingSanctuary]: { mode: "plan", tier: "basic", plan: "preservingSanctuary" },
  [ids.robotWars]: { mode: "manual", tier: "basic", reason: "Applies to allied Constructs within 30 ft; Construct tracking is outside this unit." },
  [ids.skySmite]: { mode: "manual", tier: "basic", reason: "Depends on whether the target is touching the ground." },
  [ids.strengthThroughNumbers]: { mode: "manual", tier: "basic", reason: "Grants a special Inspiration; the Inspiration rules are UNRESOLVED (ak5e/DECISIONS.md)." },
  [ids.unarmouredAgility]: { mode: "manual", tier: "basic", reason: "Applies only while wearing no Armour; the module does not track worn Armour." },
  [ids.accelerando]: { mode: "plan", tier: "advanced", plan: "accelerando" },
  [ids.antiArtsTraining]: { mode: "manual", tier: "advanced", ruling: "R11", reason: "Cross-class borrow of the Caster Anti-Arts Training feature." },
  [ids.artOfBinding]: { mode: "plan", tier: "advanced", plan: "artOfBinding" },
  [ids.decoyBlip]: { mode: "manual", tier: "advanced", reason: "Depends on each attacking Creature's roll and its distance from you." },
  [ids.elementalSpecialist]: { mode: "manual", tier: "advanced", reason: "Requires a chosen Arts Damage Type that is not stored." },
  [ids.escapeArtist]: { mode: "manual", tier: "advanced", reason: "Changes an Action into a Bonus Action; action economy is not automated." },
  [ids.extraAttack]: { mode: "manual", tier: "advanced", reason: "Attacks twice instead of once; the Attack Action count is not automated." },
  [ids.hammerAndAnvil]: { mode: "manual", tier: "advanced", reason: "Depends on an allied Creature within 5 ft of the target." },
  [ids.ignition]: { mode: "plan", tier: "advanced", plan: "ignition" },
  [ids.jumpstart]: { mode: "manual", tier: "advanced", reason: "Changes Start SP of Operator Skills; the Start SP values are not stored by this module." },
  [ids.lieutenant]: { mode: "manual", tier: "advanced", ruling: "R11", reason: "Cross-class borrow of Guard Instructions and Instruction Dice." },
  [ids.mirrorMove]: { mode: "plan", tier: "advanced", plan: "mirrorMove" },
  [ids.painfulLesson]: { mode: "plan", tier: "advanced", plan: "painfulLesson" },
  [ids.partTimeInventor]: { mode: "manual", tier: "advanced", ruling: "R11", reason: "Cross-class borrow of the Inventor Equipment Modification feature." },
  [ids.reliableTalent]: { mode: "manual", tier: "advanced", reason: "Treats low d20 results as 8; no verified native key for this threshold." },
  [ids.shatterer]: { mode: "manual", tier: "advanced", reason: "Depends on the Frozen Condition of the target." }
});

const RECOVERY_LR = Object.freeze([{ on: "lr", amount: "full" }]);
const RECOVERY_SR_LR = Object.freeze([{ on: "sr", amount: "full" }, { on: "lr", amount: "full" }]);

/**
 * Talent-use pools. Module-dependent maxima are split into separate pools so each pool's maximum and
 * recovery stay correct for the Actor: appliesTo selects exactly one variant per Actor.
 */
const POOL_DEFINITIONS = Object.freeze({
  supporterLuckBase: { label: "Luck Points", talent: ids.lucky, module: false, max: 2, recovery: RECOVERY_LR },
  supporterLuckModule: { label: "Luck Points", talent: ids.lucky, module: true, max: "@attributes.prof", recovery: RECOVERY_LR },
  supporterPreservingBase: { label: "Preserving Sanctuary uses", talent: ids.preservingSanctuary, module: false, max: "@attributes.prof", recovery: RECOVERY_LR },
  supporterPreservingModule: { label: "Preserving Sanctuary uses", talent: ids.preservingSanctuary, module: true, max: "@attributes.prof", recovery: RECOVERY_SR_LR },
  supporterAccelerando: { label: "Accelerando uses", talent: ids.accelerando, module: null, max: "@attributes.prof", recovery: RECOVERY_SR_LR },
  supporterIgnitionBase: { label: "Ignition uses", talent: ids.ignition, module: false, max: 1, recovery: RECOVERY_LR },
  supporterIgnitionModule: { label: "Ignition uses", talent: ids.ignition, module: true, max: 2, recovery: RECOVERY_LR },
  supporterMirrorMove: { label: "Mirror Move uses", talent: ids.mirrorMove, module: null, max: "@attributes.prof", recovery: RECOVERY_LR }
});

/** Pool id for a talent's current variant (base or Module). */
export function talentPoolId(actor, poolFamily) {
  const variant = moduleActive(actor, POOL_DEFINITIONS[`${poolFamily}Base`]?.talent ?? "") ? "Module" : "Base";
  return `${poolFamily}${variant}`;
}

/** Defines every talent pool once. Safe to call repeatedly. */
export function defineSupporterTalentPools() {
  for (const [id, entry] of Object.entries(POOL_DEFINITIONS)) {
    if (getPoolDefinition(id)) continue;
    definePool({
      id,
      label: entry.label,
      max: entry.max,
      initial: "max",
      recovery: entry.recovery,
      appliesTo: actor => ownsTalent(actor, entry.talent) && (entry.module === null || moduleActive(actor, entry.talent) === entry.module)
    });
  }
}

const items = actor => Array.from(actor?.items?.values?.() ?? actor?.items ?? []);
export function ownedTalent(actor, talentId) {
  return items(actor).find(item => flag(item, "chapterThreeId") === talentId) ?? null;
}
export const ownsTalent = (actor, talentId) => Boolean(ownedTalent(actor, talentId));
export function moduleActive(actor, talentId) {
  return flag(actor, SUPPORTER_TALENT_FLAG)?.modules?.[talentId] === true;
}

/** Active Effect data for a talent's base "ae" changes. Empty for every other mode. */
export function supporterTalentEffects(talentId) {
  const rule = SUPPORTER_TALENT_RULES[talentId];
  if (!rule || rule.mode !== "ae") return [];
  const entry = CHAPTER_THREE_CLASSES.find(item => item.id === talentId);
  return [{
    name: entry?.name ?? talentId,
    icon: "icons/magic/control/buff-flight-wings-runes-purple.webp",
    transfer: true,
    disabled: false,
    changes: rule.changes.map(change => ({ ...change, priority: 20 })),
    flags: { ak5e: { supporterTalentEffect: { talentId, module: false } } }
  }];
}

/** Source text for a talent, quoted from the chapter record (never paraphrased). */
export function talentSourceText(talentId) {
  const entry = CHAPTER_THREE_CLASSES.find(item => item.id === talentId);
  return {
    name: entry?.name ?? talentId,
    effect: entry?.classOption?.effect ?? "",
    moduleEffect: entry?.classOption?.moduleEffect ?? ""
  };
}

/** The manual card for a manual-mode talent: source text, the reason it is manual, and any R11 ruling tag. */
export function supporterTalentManualCard(talentId) {
  const rule = SUPPORTER_TALENT_RULES[talentId];
  need(rule, "Unknown Supporter talent.");
  const text = talentSourceText(talentId);
  return {
    talentId,
    name: text.name,
    mode: rule.mode,
    ruling: rule.ruling ?? null,
    reason: rule.reason ?? rule.moduleReason ?? "Automation is not applied; follow the source text.",
    effect: text.effect,
    moduleEffect: text.moduleEffect
  };
}

const levelGate = (warnings, actor, required, name) => {
  const current = supporterLevel(actor) ?? 1;
  if (current < required) warn(warnings, "level", `${name} is a Supporter level ${required} feature; this character is level ${current}.`);
};

const requireTalent = (actor, talentId, name) => need(ownsTalent(actor, talentId), `${name} requires the ${name} talent.`);

function reactionWarning(actor, warnings) {
  const reactions = getReactions(actor);
  if (!reactions?.available) warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
}

function requestReaction(receipt, label) {
  receipt.reaction = { requested: true, triggerId: `${label}-${receipt.id}`, receiptId: `${label}-${receipt.id}` };
}

function rangeWarning(warnings, distance, feet, name) {
  if (Number(distance ?? 0) > feet) warn(warnings, "range", `${name} is beyond ${feet} feet.`);
}

/**
 * Plans for the talents with uses or reactions. Each has the convention (actor, state, data) => { title, warnings, apply }.
 * Uses are pool-tracked via spendResource (clamped at 0 with the shortfall shown); damage is a formula on the
 * receipt so the card shows a roll button for the owner.
 */
export const SUPPORTER_TALENT_PLANS = Object.freeze({
  lucky(actor, state, data = {}) {
    requireTalent(actor, SUPPORTER_TALENT_IDS.lucky, "Lucky");
    defineSupporterTalentPools();
    const poolId = talentPoolId(actor, "supporterLuck");
    const warnings = [];
    if (resourceValue(actor, { pool: poolId }) < 1) warn(warnings, "shortfall", "No Luck Point remains.");
    const mode = data.mode === "disadvantage" ? "disadvantage" : "advantage";
    const text = mode === "disadvantage"
      ? "Grant an enemy Disadvantage on an Attack Roll against you."
      : "Grant yourself Advantage on a d20 roll.";
    return {
      title: "Lucky: spend a Luck Point",
      warnings,
      apply(_state, receipt) {
        const update = spendResource(actor, receipt, { pool: poolId, amount: 1, label: "Luck Point" });
        receipt.summary = `${actor.name} spent a Luck Point. ${text}`;
        receipt.result = { mode };
        return update;
      }
    };
  },

  preservingSanctuary(actor, state, data = {}) {
    requireTalent(actor, SUPPORTER_TALENT_IDS.preservingSanctuary, "Preserving Sanctuary");
    defineSupporterTalentPools();
    const poolId = talentPoolId(actor, "supporterPreserving");
    const warnings = [];
    const pb = Number(actor.system?.attributes?.prof ?? 2);
    reactionWarning(actor, warnings);
    rangeWarning(warnings, data.distance, 30, data.targetName ?? "The protected Creature");
    if (data.targetHalfHpOrMore === false) warn(warnings, "hitPoints", "The protected Creature has half or less of its maximum Hit Points.");
    if (resourceValue(actor, { pool: poolId }) < 1) warn(warnings, "shortfall", "No Preserving Sanctuary use remains.");
    return {
      title: `Preserving Sanctuary -> ${data.targetName ?? "creature"}`,
      warnings,
      apply(_state, receipt) {
        const update = spendResource(actor, receipt, { pool: poolId, amount: 1, label: "Preserving Sanctuary use" });
        requestReaction(receipt, "preserving");
        receipt.summary = `${actor.name} grants ${data.targetName ?? "a creature"} Damage Reduction ${pb} against the next Damage it takes; lost after that Damage.`;
        receipt.result = { damageReduction: pb, targetName: data.targetName ?? null };
        return update;
      }
    };
  },

  accelerando(actor, state, data = {}) {
    requireTalent(actor, SUPPORTER_TALENT_IDS.accelerando, "Accelerando");
    defineSupporterTalentPools();
    const warnings = [];
    reactionWarning(actor, warnings);
    rangeWarning(warnings, data.distance, 30, data.targetName ?? "The allied Creature");
    if (resourceValue(actor, { pool: "supporterAccelerando" }) < 1) warn(warnings, "shortfall", "No Accelerando use remains.");
    const withAdvantage = moduleActive(actor, SUPPORTER_TALENT_IDS.accelerando);
    return {
      title: `Accelerando -> ${data.targetName ?? "ally"}`,
      warnings,
      apply(_state, receipt) {
        const update = spendResource(actor, receipt, { pool: "supporterAccelerando", amount: 1, label: "Accelerando use" });
        requestReaction(receipt, "accelerando");
        receipt.summary = `${data.targetName ?? "An allied Creature"} may reroll its Attack Roll${withAdvantage ? " with Advantage" : ""}.`;
        receipt.result = { advantage: withAdvantage, targetName: data.targetName ?? null };
        return update;
      }
    };
  },

  artOfBinding(actor, state, data = {}) {
    requireTalent(actor, SUPPORTER_TALENT_IDS.artOfBinding, "Art of Binding");
    const warnings = [];
    const module = moduleActive(actor, SUPPORTER_TALENT_IDS.artOfBinding);
    if (data.speedReduced !== true) warn(warnings, "speed", "Art of Binding needs a Creature whose Speed you have reduced.");
    if (!module) reactionWarning(actor, warnings);
    const die = `1${aidDieSize(supporterLevel(actor) ?? 1)}`;
    return {
      title: `Art of Binding -> ${data.targetName ?? "creature"}`,
      warnings,
      apply(_state, receipt) {
        if (!module) requestReaction(receipt, "binding");
        receipt.formula = die;
        receipt.rollLabel = "Art of Binding (additional damage)";
        receipt.summary = `${data.targetName ?? "The bound Creature"} takes additional damage equal to one roll of your Aid Die. Once it has taken this damage, it cannot take it again until your next Turn.`;
        receipt.result = { formula: die, module };
        return {};
      }
    };
  },

  ignition(actor, state, data = {}) {
    requireTalent(actor, SUPPORTER_TALENT_IDS.ignition, "Ignition");
    defineSupporterTalentPools();
    const poolId = talentPoolId(actor, "supporterIgnition");
    const warnings = [];
    const apSpent = Number(data.apSpent ?? 0);
    if (!(apSpent >= 1)) warn(warnings, "arts", "Ignition is used when you cast an Art using Arts Points.");
    reactionWarning(actor, warnings);
    if (resourceValue(actor, { pool: poolId }) < 1) warn(warnings, "shortfall", "No Ignition use remains until your next Long Rest.");
    return {
      title: `Ignition (${apSpent} AP expended)`,
      warnings,
      apply(_state, receipt) {
        const update = spendResource(actor, receipt, { pool: poolId, amount: 1, label: "Ignition use" });
        requestReaction(receipt, "ignition");
        receipt.summary = `Until the start of your next Turn, allied Creatures within 15 ft deal an additional ${apSpent} Force Damage with Attacks and Arts.`;
        receipt.result = { force: apSpent };
        return update;
      }
    };
  },

  mirrorMove(actor, state, data = {}) {
    requireTalent(actor, SUPPORTER_TALENT_IDS.mirrorMove, "Mirror Move");
    defineSupporterTalentPools();
    const warnings = [];
    const module = moduleActive(actor, SUPPORTER_TALENT_IDS.mirrorMove);
    reactionWarning(actor, warnings);
    rangeWarning(warnings, data.distance, 30, data.attackerName ?? "The attacking Creature");
    if (data.artDamage === false) warn(warnings, "damageType", "Mirror Move answers Arts Damage only.");
    if (resourceValue(actor, { pool: "supporterMirrorMove" }) < 1) warn(warnings, "shortfall", "No Mirror Move use remains.");
    const formula = module ? "4d8" : "2d8";
    return {
      title: `Mirror Move -> ${data.attackerName ?? "attacker"}`,
      warnings,
      apply(_state, receipt) {
        const update = spendResource(actor, receipt, { pool: "supporterMirrorMove", amount: 1, label: "Mirror Move use" });
        requestReaction(receipt, "mirror");
        receipt.formula = formula;
        receipt.rollLabel = "Mirror Move (Force Damage)";
        receipt.summary = `${actor.name} deals Force Damage to ${data.attackerName ?? "the attacker"} for Arts Damage dealt to them.`;
        receipt.result = { formula, module };
        return update;
      }
    };
  },

  painfulLesson(actor, state, data = {}) {
    requireTalent(actor, SUPPORTER_TALENT_IDS.painfulLesson, "Painful Lesson");
    const warnings = [];
    const module = moduleActive(actor, SUPPORTER_TALENT_IDS.painfulLesson);
    reactionWarning(actor, warnings);
    rangeWarning(warnings, data.distance, 30, data.attackerName ?? "The attacking Creature");
    if (data.hasDetrimentalCondition === false) warn(warnings, "condition", "Painful Lesson needs a Creature with a detrimental Status Condition.");
    const formula = module ? "4d6" : "2d6";
    return {
      title: `Painful Lesson -> ${data.attackerName ?? "attacker"}`,
      warnings,
      apply(_state, receipt) {
        requestReaction(receipt, "lesson");
        receipt.formula = formula;
        receipt.rollLabel = "Painful Lesson (Force Damage)";
        receipt.summary = `${data.attackerName ?? "The attacking Creature"} takes Force Damage for attacking you.`;
        receipt.result = { formula, module };
        return {};
      }
    };
  }
});

let talentPlansRegistered = false;
/** Registers the talent plans with the Supporter use engine. Idempotent: a second call is a no-op. */
export function registerSupporterTalentPlans() {
  if (talentPlansRegistered) return true;
  registerSupporterPlans({ plans: SUPPORTER_TALENT_PLANS, readings: {} });
  talentPlansRegistered = true;
  return true;
}

/** Count of each automation mode across the 28 talents (used by tests and the sheet summary). */
export function supporterTalentCounts() {
  const counts = { ae: 0, plan: 0, manual: 0 };
  for (const rule of Object.values(SUPPORTER_TALENT_RULES)) counts[rule.mode] += 1;
  return counts;
}
