/**
 * Defender › Protector (Ch.3 L1628–1673), following WORKFLOW.md §3.2 through the Defender use engine (defender-uses.mjs):
 * - Protector DC (8 + CON + PB); Centre of Attention (Wisdom save link, then Taunted on each Creature confirmed as failing);
 * - Anchor Point: Impenetrable (guided Damage Reduction, Reaction + 1 Resilience, refund), Improved Shelter (10-ft radius
 *   declared with Shelter; Advantage preselected on Strength and Dexterity saves of sheltered allies);
 * - Stone Wall: prompt when hit by a Melee Attack, Strength save link, then 1d8 + CON and Off Balance on a failed save;
 * - War of Attrition: Punishment on hits and failed saves, Unending Defence at the end of the Protector's Turn;
 * - Total Shutdown: Improved Taunt and Greater Improved Shelter as Resistance in native damage application.
 * Taunted, Off Balance, Punishment and Greater Improved Shelter are tracked effects built on the applying client from
 * PROTECTOR_MARKS, never from a receipt. Nothing rolls dice before the player clicks; saves are links the target's owner rolls.
 */
import { defenderLevel, defenderBranch, defenderState, protectorDC, equippedShields, IMPROVED_SHELTER_FEET } from "./defender-rules.mjs";
import { defenderEnabled, ownTurn, primaryToken, nearFeet, shelteringDefenders, shelterAppliesTo } from "./defender-features.mjs";
import { defenderUses } from "./defender-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { applyFeatureTag } from "./feature-tags.mjs";
import { registerDamageModifier } from "./defender-damage-mods.mjs";
import { definePool, getPool, getPoolDefinition } from "./resource-pools.mjs";
import { onAk5eEvent, getReactions, spendReaction } from "./trigger-events.mjs";
import { tokenPoint } from "./standard-bearer-rules.mjs";
import { flag, values, need, esc, opaqueKey } from "./operation-kernel.mjs";

export const PROTECTOR_FEATURES = Object.freeze({
  dc: "subclass-feature-defender-protector-protector-dc-230",
  centreOfAttention: "subclass-feature-defender-protector-1st-level-centre-of-attention-434",
  anchorPoint: "subclass-feature-defender-protector-4th-level-anchor-point-911",
  stoneWall: "subclass-feature-defender-protector-9th-level-stone-wall-1703",
  warOfAttrition: "subclass-feature-defender-protector-12th-level-war-of-attrition-2153",
  totalShutdown: "subclass-feature-defender-protector-15th-level-total-shutdown-2571"
});
/** Tracked effects (Ch.3 local rules; DECISIONS.md: no global Taunted / Off Balance condition is invented). */
export const PROTECTOR_MARKS = Object.freeze({
  taunted: { label: "Taunted", featureId: PROTECTOR_FEATURES.centreOfAttention, trigger: "nextTurnEnd", expiryActor: "target",
    instructions: name => `Taunted by ${name} until the end of its next Turn: it must Attack ${name} during its Turn, if it is able to.` },
  offBalance: { label: "Off Balance", featureId: PROTECTOR_FEATURES.stoneWall, trigger: "nextTurnEnd", expiryActor: "source",
    instructions: name => `Knocked Off Balance until the end of ${name}'s next Turn: Attacks against it are made at Advantage.` },
  punishment: { label: "Punishment", featureId: PROTECTOR_FEATURES.warOfAttrition, trigger: "nextTurnEnd", expiryActor: "source",
    instructions: name => `Disadvantage on the next Attack Roll it makes before the end of ${name}'s next Turn.` },
  gis: { label: "Greater Improved Shelter", featureId: PROTECTOR_FEATURES.totalShutdown, trigger: "turnStart", expiryActor: "source",
    instructions: name => `Resistant to the first instance of Damage it takes before the start of ${name}'s next Turn (used up automatically when Damage is applied from a chat card).` }
});
/** Readings offered when the GM has not ruled (DECISIONS.md "Juggernaut, Protector and Sentry branches"). */
export const PROTECTOR_READINGS = Object.freeze({
  impenetrableRounding: { label: "Impenetrable: \"half of your Physical Damage Reduction\" (the source gives no rounding)", options: [
    { value: "down", label: "Round down" }, { value: "up", label: "Round up (as Stormchaser states for its half DR)" }] }
});

export const isProtector = actor => defenderEnabled(actor) && defenderBranch(actor) === "protector";
export const protectorDCFor = actor => protectorDC(Number(actor.system?.abilities?.con?.mod ?? 0), Number(actor.system?.attributes?.prof ?? 0));
/** Anchor Point needs a Shield with the Bulwark Property; that property is undefined, so Bastion is checked (logged). */
export const bulwarkShield = actor => equippedShields(actor?.items).find(entry => entry.info.bastion)?.item ?? null;
const anyShield = actor => equippedShields(actor?.items)[0]?.item ?? null;
const levelWarning = (warnings, actor, level, name) => {
  if (defenderLevel(actor) < level) warn(warnings, "level", `${name} is a Protector level ${level} feature; this Defender is level ${defenderLevel(actor)}.`);
};
const effectMeta = effect => flag(effect, defenderUses.effectFlag) ?? {};
/** Active (enabled) Protector effects of one kind on an Actor, optionally from one Protector. A used-up effect is disabled,
 * so re-enabling it on the Actor's Effects tab restores it. */
export function activeMarks(actor, mark, sourceUuid = null) {
  return values(actor?.effects).filter(effect => !effect.disabled && effectMeta(effect).protectorMark === mark
    && (!sourceUuid || effectMeta(effect).sourceUuid === sourceUuid));
}
function actorAt(uuid, label = "the Creature") {
  const doc = globalThis.fromUuidSync?.(uuid), actor = doc?.documentName === "Token" ? doc.actor : doc;
  need(actor?.documentName === "Actor", `Choose ${label}.`);
  return actor;
}
function rangeWarning(warnings, protector, creature, feet, feature) {
  const own = primaryToken(protector), token = values(creature.getActiveTokens?.(true, true) ?? []).map(t => t.document ?? t).find(t => t.parent?.id === own?.parent?.id);
  if (!own?.parent?.grid || !token) warn(warnings, "range", `${creature.name}: the distance could not be measured (${feature}: ${feet} feet).`);
  else if (!nearFeet(own.parent, tokenPoint(own), token, feet)) warn(warnings, "range", `${creature.name} is more than ${feet} feet away (${feature}).`);
}
const saveLink = (ability, dc) => `[[/save ability=${ability} dc=${dc}]]`;
const signed = n => n < 0 ? `- ${-n}` : `+ ${n}`;
const marksEntry = (target, marks) => ({ uuid: target.uuid, name: target.name, kind: "protectorMarks", marks, ready: true });
const withPunishment = (actor, marks) => defenderLevel(actor) >= 12 ? [...marks, "punishment"] : marks;
/** Reaction spend shared by Impenetrable and Stone Wall: warnings first, then a recheck at commit. */
function reactionWarnings(warnings, actor, triggerId, receiptId, name) {
  const budget = getReactions(actor), already = Boolean(budget.receipts?.[receiptId]);
  const free = Math.max(0, budget.max - budget.spent) + budget.extra.filter(extra => !extra.restrictedTo.length).reduce((sum, extra) => sum + Math.max(0, extra.count - extra.spent), 0);
  if (!already && budget.triggers?.[triggerId]) warn(warnings, "triggerUsed", `A Reaction was already spent for this trigger; ${name} spends no additional Reaction.`);
  if (!already && free < 1) warn(warnings, "reaction", `No Reaction remains for ${name}; no Reaction will be spent.`);
}
async function takeReaction(actor, receipt, data, triggerId, receiptId, tag) {
  const result = await spendReaction(actor, { triggerId, receipt: receiptId, tags: [tag] });
  if (!result.ok) need(data.overrides?.includes("reaction") || data.overrides?.includes("triggerUsed"), "Your Reaction was spent elsewhere since the check; use it again to review.");
  receipt.reaction = { requested: true, spent: result.ok === true, receiptId, triggerId, ...(result.ok ? {} : { reason: result.reason }) };
}

/* ---------------------------------------------------------------- target kind: Protector effects */

const protectorMarks = {
  async apply(source, useId, entry, target) {
    for (const mark of entry.marks) {
      const definition = PROTECTOR_MARKS[mark];
      need(definition, "Unknown Protector effect.");
      if (values(target.effects).some(effect => effectMeta(effect).opId === useId && effectMeta(effect).protectorMark === mark)) continue;
      const item = values(source.items).find(candidate => flag(candidate, "chapterThreeId") === definition.featureId);
      need(item, "Add the Protector feature Items (Defender progression setup) first.");
      const expiryActor = definition.expiryActor === "target" ? target : source;
      const inCombat = game.combat?.started && values(game.combat.turns).some(c => c.actor?.uuid === expiryActor.uuid);
      const tag = { label: definition.label, trigger: inCombat ? definition.trigger : "manual", expiryActor: definition.expiryActor,
        instructions: `${definition.instructions(source.name)}${inCombat ? "" : " Outside combat, remove it manually when it ends."}` };
      const effect = await applyFeatureTag(source, item, target, tag);
      try { await effect.update({ [`flags.ak5e.${defenderUses.effectFlag}`]: { opId: useId, sourceUuid: source.uuid, protectorMark: mark } }); }
      catch (error) { await effect.delete(); throw error; }
    }
    return true;
  },
  async revert(source, useId, _entry, target) {
    const effects = values(target.effects).filter(effect => effectMeta(effect).opId === useId && effectMeta(effect).sourceUuid === source.uuid);
    if (effects.length) await target.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
    return { removed: effects.length };
  },
  preview(_source, receipt, entry, target) {
    const count = values(target?.effects).filter(effect => effectMeta(effect).opId === receipt.id).length;
    return count ? `${entry.name}: removes ${entry.marks.map(mark => PROTECTOR_MARKS[mark].label).join(" and ")}.` : `${entry.name}: the effects are already gone.`;
  }
};

/* ---------------------------------------------------------------- use plans */

const PLANS = {
  centreOfAttention(actor, _state, data) {
    const bonus = data.bonusAction === true, warnings = [], dc = protectorDCFor(actor);
    const creatures = (Array.isArray(data.targets) ? [...new Set(data.targets)] : []).map(uuid => actorAt(uuid));
    if (game.combat?.started && !ownTurn(actor)) warn(warnings, "turn", "Centre of Attention is used as an Action or Bonus Action, and it is not your Turn.");
    if (resourceValue(actor, { pool: "centreOfAttention" }) < 1) warn(warnings, "uses", `No uses of Centre of Attention remain (uses equal your Constitution Modifier, ${Number(actor.system?.abilities?.con?.mod ?? 0)}); the count stays at 0.`);
    if (bonus && resourceValue(actor, { pool: "resilience" }) < 2) warn(warnings, "resilience", `As a Bonus Action it costs 2 Resilience and ${resourceValue(actor, { pool: "resilience" })} remain; Resilience stays at 0.`);
    for (const creature of creatures) rangeWarning(warnings, actor, creature, 10, "Centre of Attention");
    return { warnings, title: "Centre of Attention", apply(next, receipt) {
      const updates = { ...spendResource(actor, receipt, { pool: "centreOfAttention", amount: 1, label: "Centre of Attention use" }),
        ...(bonus ? spendResource(actor, receipt, { pool: "resilience", amount: 2, label: "Resilience" }) : {}) };
      next.data.centre = [...(next.data.centre ?? []), { op: receipt.id, targets: creatures.map(c => c.uuid), dc }].slice(-20);
      receipt.html = true;
      receipt.summary = `${bonus ? "Bonus Action (2 Resilience)" : "Action"}: Creatures of ${esc(actor.name)}'s choice within 10 feet${creatures.length ? ` (${creatures.map(c => esc(c.name)).join(", ")})` : ""} make ${saveLink("wis", dc)} (Protector DC). On a failure a Creature is Taunted by ${esc(actor.name)} until the end of its next Turn and must Attack ${esc(actor.name)} during its Turn, if it is able to. Apply Taunt from the Defender panel to each Creature that failed.`;
      receipt.result = { dc };
      return updates;
    } };
  },
  taunt(actor, _state, data) {
    const target = actorAt(data.targetUuid, "the Creature that failed its save"), warnings = [];
    if (data.failedSave !== true) warn(warnings, "failedSave", `You did not confirm that ${target.name} failed its Wisdom Saving Throw.`);
    if (activeMarks(target, "taunted", actor.uuid).length) warn(warnings, "repeat", `${target.name} is already Taunted by ${actor.name}.`);
    const marks = withPunishment(actor, ["taunted"]);
    return { warnings, title: "Taunt", apply(_next, receipt) {
      receipt.targets = [marksEntry(target, marks)];
      receipt.summary = `${target.name} is Taunted by ${actor.name} until the end of its next Turn${marks.includes("punishment") ? " and suffers Punishment (Disadvantage on its next Attack Roll before the end of your next Turn)" : ""}.`;
      receipt.result = { marks };
      return {};
    } };
  },
  impenetrable(actor, state, data, useId) {
    const warnings = [], target = actorAt(data.targetUuid || actor.uuid, "the Creature taking the Damage"), physical = Number(data.physicalReduction);
    need(Number.isFinite(physical) && physical >= 0, "Enter your Damage Reduction against Physical Damage.");
    const triggerId = String(data.triggerId ?? "").trim() || `impenetrable:${useId}`, receiptId = `impenetrable_${useId}`;
    levelWarning(warnings, actor, 4, "Anchor Point");
    if (!bulwarkShield(actor)) warn(warnings, "bulwark", "Anchor Point needs a Shield with the Bulwark Property (checked as Bastion: Defender Shield or Heavy Defender Shield); none is equipped.");
    if (target.uuid !== actor.uuid) {
      const shelter = defenderState(actor).shelter, tokens = values(target.getActiveTokens?.(true, true) ?? []).map(t => (t.document ?? t).uuid);
      if (!shelter?.active || !tokens.some(uuid => shelter.allies.includes(uuid))) warn(warnings, "shelter", `${target.name} is not recorded as benefitting from your Shelter.`);
    }
    if ((state.data.impenetrable ?? []).some(entry => entry.triggerId === triggerId && entry.targetUuid === target.uuid))
      warn(warnings, "cumulative", "Impenetrable was already used against this Damage; the effect is not cumulative.");
    reactionWarnings(warnings, actor, triggerId, receiptId, "Impenetrable");
    if (resourceValue(actor, { pool: "resilience" }) < 1) warn(warnings, "resilience", "Impenetrable costs 1 Resilience and none remain; Resilience stays at 0.");
    return { warnings, title: "Impenetrable", reading: "impenetrableRounding", async apply(next, receipt, reading) {
      await takeReaction(actor, receipt, data, triggerId, receiptId, "impenetrable");
      const updates = spendResource(actor, receipt, { pool: "resilience", amount: 1, label: "Resilience" });
      const reduction = reading === "up" ? Math.ceil(physical / 2) : Math.floor(physical / 2);
      next.data.impenetrable = [...(next.data.impenetrable ?? []), { op: receipt.id, triggerId, targetUuid: target.uuid }].slice(-40);
      receipt.summary = `Reaction: ${target.name} has ${reduction} Damage Reduction against that Damage (half of ${actor.name}'s ${physical} Physical Damage Reduction). Apply it before Resistance (minimum 1 Damage). ${actor.name} may expend 1 more Resilience to regain the Reaction.`;
      receipt.result = { reduction };
      return updates;
    } };
  },
  /** "Expend 1 further Resilience (no Action required) to refund use of your Reaction" (Impenetrable, L1646). */
  impenetrableRefund(actor, state, data) {
    const warnings = [], use = defenderUses.receipt(actor, data.useId);
    need(use?.command === "impenetrable" && use.status !== "undone", "Choose an Impenetrable use.");
    if (!use.reaction?.spent) warn(warnings, "noReaction", "That Impenetrable spent no Reaction; nothing to refund.");
    else if (!getReactions(actor).receipts?.[use.reaction.receiptId]) warn(warnings, "refreshed", "That Reaction has already come back at the start of your Turn.");
    if ((state.data.refunds ?? []).some(entry => entry.useId === use.id)) warn(warnings, "repeat", "That Reaction was already refunded.");
    if (resourceValue(actor, { pool: "resilience" }) < 1) warn(warnings, "resilience", "The refund costs 1 Resilience and none remain; Resilience stays at 0.");
    return { warnings, title: "Impenetrable: regain Reaction", apply(next, receipt) {
      const updates = spendResource(actor, receipt, { pool: "resilience", amount: 1, label: "Resilience" });
      next.data.refunds = [...(next.data.refunds ?? []), { op: receipt.id, useId: use.id }].slice(-40);
      if (use.reaction?.spent) receipt.targets = [{ uuid: actor.uuid, name: actor.name, kind: "reactionRefund", ready: true, receiptId: use.reaction.receiptId, triggerId: use.reaction.triggerId }];
      receipt.summary = `${actor.name} expends 1 Resilience to regain the Reaction spent on Impenetrable${use.reaction?.spent ? "" : " (no Reaction was outstanding)"}.`;
      receipt.result = { refunded: Boolean(use.reaction?.spent) };
      return updates;
    } };
  },
  stoneWall(actor, _state, data, useId) {
    const warnings = [], attacker = actorAt(data.attackerUuid, "the Creature that hit you"), dc = protectorDCFor(actor);
    const triggerId = String(data.triggerId ?? "").trim() || `stoneWall:${useId}`, receiptId = `stonewall_${useId}`;
    levelWarning(warnings, actor, 9, "Stone Wall");
    if (data.hitConfirmed !== true) warn(warnings, "hit", `You did not confirm that ${attacker.name} hit you with a Melee Attack.`);
    if (!anyShield(actor)) warn(warnings, "shield", "Stone Wall needs you to be wielding a shield; none is equipped.");
    reactionWarnings(warnings, actor, triggerId, receiptId, "Stone Wall");
    return { warnings, title: "Stone Wall", async apply(next, receipt) {
      await takeReaction(actor, receipt, data, triggerId, receiptId, "stoneWall");
      next.data.stoneWall = [...(next.data.stoneWall ?? []), { op: receipt.id, attackerUuid: attacker.uuid, dc }].slice(-40);
      receipt.html = true;
      receipt.summary = `Reaction: ${esc(actor.name)} tries to knock ${esc(attacker.name)} off Balance. ${esc(attacker.name)} makes ${saveLink("str", dc)} (Protector DC). On a failure, use "Stone Wall: failed save" for 1d8 ${signed(Number(actor.system?.abilities?.con?.mod ?? 0))} Bludgeoning Damage and Off Balance until the end of ${esc(actor.name)}'s next Turn.`;
      receipt.result = { dc };
      return {};
    } };
  },
  stoneWallFailed(actor, state, data) {
    const warnings = [], target = actorAt(data.targetUuid, "the Creature that failed"), con = Number(actor.system?.abilities?.con?.mod ?? 0);
    const wall = (state.data.stoneWall ?? []).find(entry => entry.op === data.stoneWallUseId) ?? null;
    levelWarning(warnings, actor, 9, "Stone Wall");
    if (!wall) warn(warnings, "noReaction", "No Stone Wall Reaction is recorded for this Creature.");
    else if (wall.attackerUuid !== target.uuid) warn(warnings, "otherCreature", `The recorded Stone Wall was against ${globalThis.fromUuidSync?.(wall.attackerUuid)?.name ?? "another Creature"}.`);
    if (data.failedSave !== true) warn(warnings, "failedSave", `You did not confirm that ${target.name} failed its Strength Saving Throw.`);
    if (wall && (state.data.walled ?? []).some(entry => entry.wall === wall.op)) warn(warnings, "repeat", "That Stone Wall was already resolved.");
    const marks = withPunishment(actor, ["offBalance"]);
    return { warnings, title: "Stone Wall: failed save", apply(next, receipt) {
      if (wall) next.data.walled = [...(next.data.walled ?? []), { op: receipt.id, wall: wall.op }].slice(-40);
      receipt.damageParts = [{ formula: `1d8 ${signed(con)}`, type: "bludgeoning" }];
      receipt.formula = receipt.damageParts[0].formula; receipt.rollLabel = "Bludgeoning Damage"; receipt.rollFlavor = `Stone Wall: ${target.name} takes Bludgeoning Damage`;
      receipt.targets = [marksEntry(target, marks)];
      receipt.summary = `${target.name} is knocked Off Balance until the end of ${actor.name}'s next Turn (Attacks against it are made at Advantage)${marks.includes("punishment") ? " and suffers Punishment" : ""}. Roll 1d8 ${signed(con)} Bludgeoning Damage from this card and apply it with the native damage controls.`;
      receipt.result = { marks };
      return {};
    } };
  },
  /** War of Attrition: automatic on a hit; from the panel when a Creature fails a Saving Throw against you. */
  punishment(actor, _state, data) {
    const target = actorAt(data.targetUuid), warnings = [];
    levelWarning(warnings, actor, 12, "War of Attrition");
    if (data.reason !== "hit" && data.failedSave !== true) warn(warnings, "failedSave", `You did not confirm that ${target.name} hit or failed a Saving Throw against you.`);
    return { warnings, title: "Punishment", apply(_next, receipt) {
      receipt.targets = [marksEntry(target, ["punishment"])];
      receipt.summary = `Punishment: ${target.name} has Disadvantage on the next Attack Roll it makes before the end of ${actor.name}'s next Turn (${data.reason === "hit" ? `${actor.name} hit it` : "it failed a Saving Throw"}).`;
      receipt.result = { marks: ["punishment"] };
      return {};
    } };
  },
  /** Automatic: "If your Turn ends and you have no Resilience remaining, you recover 1 Resilience." */
  unendingDefence(actor) {
    const pool = getPool(actor, "resilience");
    return { warnings: [], title: "Unending Defence", apply(_next, receipt) {
      const after = pool.value === 0 ? 1 : pool.value;
      receipt.resources = [{ pool: "resilience", path: "flags.ak5e.resourcePools.resilience.value", before: pool.value, after, max: pool.max, label: "Resilience" }];
      receipt.summary = after > pool.value ? `${actor.name}'s Turn ended with no Resilience: they recover 1 Resilience.` : `${actor.name} still has Resilience; nothing recovered.`;
      receipt.result = { before: pool.value, after };
      return { "flags.ak5e.resourcePools.resilience.value": after };
    } };
  },
  /** Automatic when a level-15 Protector declares Shelter: each sheltered ally gains Greater Improved Shelter. */
  greaterImprovedShelter(actor, _state, data) {
    const creatures = (data.allies ?? []).map(uuid => globalThis.fromUuidSync?.(uuid)).map(doc => doc?.documentName === "Token" ? doc.actor : doc).filter(doc => doc?.documentName === "Actor");
    return { warnings: [], title: "Greater Improved Shelter", apply(_next, receipt) {
      receipt.targets = creatures.map(creature => marksEntry(creature, ["gis"]));
      receipt.summary = `Until the start of ${actor.name}'s next Turn, ${creatures.map(c => c.name).join(", ") || "no Creature"} ${creatures.length === 1 ? "is" : "are"} Resistant to the first instance of Damage they take (applied automatically from damage cards).`;
      receipt.result = { allies: creatures.length };
      return {};
    } };
  }
};
/* GM-side relay checks: only Protector effects this use can create, rebuilt from PROTECTOR_MARKS on the applying client. */
// Levels are warnings that "Use anyway" overrides (WORKFLOW.md §3.2), so the relay checks only which effects each use may create.
const marksOnly = allowed => (_source, _receipt, entry) => entry.kind === "protectorMarks" && Array.isArray(entry.marks) && entry.marks.length > 0
  && entry.marks.every(mark => allowed.includes(mark));
PLANS.taunt.validateTarget = marksOnly(["taunted", "punishment"]);
PLANS.stoneWallFailed.validateTarget = marksOnly(["offBalance", "punishment"]);
PLANS.punishment.validateTarget = marksOnly(["punishment"]);
PLANS.greaterImprovedShelter.validateTarget = (source, receipt, entry, target) => marksOnly(["gis"])(source, receipt, entry)
  && (receipt.data?.allies ?? []).some(uuid => { const doc = globalThis.fromUuidSync?.(uuid); return (doc?.actor ?? doc)?.uuid === target.uuid; });
PLANS.impenetrableRefund.validateTarget = () => false;
function cleanup(state, receipt) {
  for (const key of ["centre", "impenetrable", "refunds", "stoneWall", "walled"]) state.data[key] = (state.data[key] ?? []).filter(entry => entry.op !== receipt.id);
}

/* ---------------------------------------------------------------- native rolls and damage */

const targetTokens = () => values(globalThis.game?.user?.targets).map(t => t.document ?? t).filter(t => t?.actor);
/** dnd5e.preRollAttackV2: Advantage against Off Balance targets; Disadvantage while under Punishment; Taunt reminder. */
export function protectorAttackHook(config) {
  const options = config?.rolls?.[0]?.options;
  if (!options) return;
  const attacker = config.subject?.actor, targets = targetTokens(), notes = [];
  const offBalance = targets.filter(token => activeMarks(token.actor, "offBalance").length);
  if (offBalance.length) { options.advantage = true; notes.push(`Advantage: ${offBalance.map(t => t.name).join(", ")} ${offBalance.length === 1 ? "is" : "are"} Off Balance`); }
  if (attacker && activeMarks(attacker, "punishment").length) { options.disadvantage = true; notes.push(`Disadvantage: ${attacker.name} is under Punishment`); }
  if (notes.length) globalThis.ui?.notifications?.info?.(`${notes.join("; ")}.`);
  const taunters = attacker ? activeMarks(attacker, "taunted").map(effect => effectMeta(effect).sourceUuid) : [];
  if (taunters.length && targets.length && !targets.some(token => taunters.includes(token.actor.uuid)))
    globalThis.ui?.notifications?.warn?.(`${attacker.name} is Taunted by ${taunters.map(uuid => globalThis.fromUuidSync?.(uuid)?.name ?? "a Protector").join(" and ")} and must Attack them during its Turn, if it is able to.`);
}
/** Punishment covers only the next Attack Roll: after it is rolled the effect is used up (disabled, not deleted). */
async function consumePunishment(event) {
  const attacker = event?.raw?.actor ?? globalThis.fromUuidSync?.(event?.actorUuid);
  if (!attacker?.isOwner) return;
  for (const effect of activeMarks(attacker, "punishment"))
    await effect.update({ disabled: true, [`flags.ak5e.${defenderUses.effectFlag}.usedBy`]: event.attackId ?? true });
}
/** dnd5e.preRollSavingThrowV2: Improved Shelter gives Advantage on Strength and Dexterity saves against effects the Protector can see (L1648). */
export function improvedShelterSaveHook(config) {
  const actor = config?.subject?.documentName === "Actor" ? config.subject : config?.subject?.actor;
  const ability = config?.ability ?? config?.rolls?.[0]?.options?.ability;
  const options = config?.rolls?.[0]?.options;
  if (!actor || !options || !["str", "dex"].includes(ability)) return;
  const token = values(actor.getActiveTokens?.(true, true) ?? []).map(t => t.document ?? t)[0];
  if (!token?.parent) return;
  const protector = shelteringDefenders(token.parent).find(defender => isProtector(defender) && defenderLevel(defender) >= 4
    && Number(defenderState(defender).shelter?.radius) >= IMPROVED_SHELTER_FEET && shelterAppliesTo(defender, token.uuid));
  if (!protector) return;
  options.advantage = true;
  globalThis.ui?.notifications?.info?.(`Improved Shelter (${protector.name}): Advantage on this Saving Throw against an effect ${protector.name} can see. Change it in the roll dialog if ${protector.name} cannot see it.`);
}

/** Improved Taunt: Resistance to Damage dealt by Creatures Taunted by this Protector. */
const improvedTaunt = { id: "improvedTaunt", order: 10,
  calculate(actor, _damages, { origin }) {
    if (!isProtector(actor) || defenderLevel(actor) < 15 || !activeMarks(origin, "taunted", actor.uuid).length) return null;
    return { effect: "resist", label: "Improved Taunt" };
  } };
/** Greater Improved Shelter: Resistance to the first instance of Damage; the applying client then uses the effect up. */
const greaterImprovedShelter = { id: "greaterImprovedShelter", order: 11,
  calculate(actor) {
    const effect = activeMarks(actor, "gis")[0];
    // "The first instance of Damage they take": used up even when that instance was already resisted.
    return effect ? { effect: "resist", label: "Greater Improved Shelter", always: true, record: { effectId: effect.id } } : null;
  },
  async applied(actor, entry) {
    const effect = actor.effects?.get?.(entry.record?.effectId) ?? values(actor.effects).find(candidate => candidate.id === entry.record?.effectId);
    if (effect && !effect.disabled)
      await effect.update({ disabled: true, [`flags.ak5e.${defenderUses.effectFlag}.usedBy`]: Date.now() });
  } };

/* ---------------------------------------------------------------- automatic triggers and prompts */

const automatic = (actor, command, data, id) => defenderUses.command(actor, command, { ...data, confirmed: true }, id)
  .catch(error => console.error(`AK5e | Protector ${command}`, error));
const owners = actor => values(game.users).filter(user => user.isGM || actor.testUserPermission?.(user, "OWNER")).map(user => user.id);
/** A level-9 Protector hit by a Melee Attack is offered Stone Wall (on the attacking roller's client). */
async function stoneWallPrompt(event) {
  const activity = event?.raw?.subject;
  if (activity?.attack?.type?.value !== "melee" || !event.actorUuid) return;
  for (const target of event.targets ?? []) {
    if (target.hit !== true) continue;
    const doc = globalThis.fromUuidSync?.(target.uuid), protector = doc?.documentName === "Token" ? doc.actor : doc;
    if (!protector || !isProtector(protector) || defenderLevel(protector) < 9 || protector.uuid === event.actorUuid) continue;
    const attacker = globalThis.fromUuidSync?.(event.actorUuid);
    await ChatMessage.implementation.create({ whisper: owners(protector), speaker: ChatMessage.implementation.getSpeaker({ actor: protector }),
      content: `<h3>Stone Wall</h3><p>${esc(attacker?.name ?? "A Creature")} hit ${esc(protector.name)} with a Melee Attack. Use your Reaction to try to knock it off Balance?</p>`,
      flags: { ak5e: { protectorPrompt: { kind: "stoneWall", actorUuid: protector.uuid, attackerUuid: event.actorUuid, attackId: event.attackId } } } });
  }
}
/** War of Attrition: a hit by a level-12 Protector applies Punishment (roller's client, an undoable automatic use). */
async function punishOnHit(event) {
  const actor = globalThis.fromUuidSync?.(event?.actorUuid);
  if (!actor?.isOwner || !isProtector(actor) || defenderLevel(actor) < 12) return;
  const doc = globalThis.fromUuidSync?.(event.targetUuid), target = doc?.documentName === "Token" ? doc.actor : doc;
  if (!target || target.uuid === actor.uuid) return;   // a later hit renews Punishment with a new duration
  await automatic(actor, "punishment", { targetUuid: target.uuid, reason: "hit", attackId: event.attackId }, `pun-${opaqueKey(event.eventId)}`.slice(0, 60));
}
async function unendingDefence(event) {
  const actor = globalThis.fromUuidSync?.(event?.actorUuid);
  if (!actor?.isOwner || event.skipped || !isProtector(actor) || defenderLevel(actor) < 12 || getPool(actor, "resilience").value > 0) return;
  await automatic(actor, "unendingDefence", {}, `ud-${opaqueKey(event.eventId)}`.slice(0, 60));
}
/** Shelter declared by a level-15 Protector (on the declaring client): Greater Improved Shelter for its allies. */
function onShelter(actor, changed, _options, userId) {
  if (userId !== game.user.id || !foundry.utils.hasProperty?.(changed, "flags.ak5e.defender.shelter")) return;
  const shelter = defenderState(actor).shelter;
  if (!shelter?.active || !shelter.allies?.length || !isProtector(actor) || defenderLevel(actor) < 15) return;
  if (defenderUses.state(actor).undo.some(receipt => receipt.command === "greaterImprovedShelter" && receipt.data?.shelterOperationId === shelter.operationId)) return;
  automatic(actor, "greaterImprovedShelter", { shelterOperationId: shelter.operationId, allies: [...shelter.allies] }, `gis-${opaqueKey(String(shelter.operationId))}`.slice(0, 60));
}

export function registerProtector() {
  if (!getPoolDefinition("centreOfAttention")) definePool({ id: "centreOfAttention", label: "Centre of Attention", max: "max(0, @abilities.con.mod)", initial: "max", classId: "class-defender",
    appliesTo: isProtector, recovery: [{ on: "lr", amount: "full" }] });
  defenderUses.register({ plans: PLANS, readings: PROTECTOR_READINGS, targetKinds: { protectorMarks }, cleanup });
  registerDamageModifier(improvedTaunt);
  registerDamageModifier(greaterImprovedShelter);
}
export function registerProtectorHooks() {
  registerProtector();
  Hooks.on("dnd5e.preRollAttackV2", protectorAttackHook);
  Hooks.on("dnd5e.preRollSavingThrowV2", improvedShelterSaveHook);
  Hooks.on("updateActor", onShelter);
  onAk5eEvent("attack", event => { stoneWallPrompt(event).catch(error => console.error("AK5e | Stone Wall prompt", error)); consumePunishment(event).catch(error => console.error("AK5e | Punishment", error)); });
  onAk5eEvent("hit", event => punishOnHit(event).catch(error => console.error("AK5e | Punishment", error)));
  onAk5eEvent("turnEnd", event => unendingDefence(event).catch(error => console.error("AK5e | Unending Defence", error)));
}
