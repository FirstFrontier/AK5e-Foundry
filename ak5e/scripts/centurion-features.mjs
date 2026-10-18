/**
 * Centurion subclass features (Ch.3 L2549-2632):
 * Cyclone Strike, Shock Trooper (Intimidation, Long-Arm, Brutal Execution),
 * Mow Them Down (Fearmonger, Ferocious Fling), Guillotine, Shredder, and Storm of Blood.
 * Follows WORKFLOW.md §3.2 and integrates with guardUses and resource-pools.mjs.
 *
 * Table-play notes for this file:
 * - nothing is rolled by the module: damage is posted as `receipt.damageParts` for the owner's Roll button and the
 *   native damage controls, and saves are `[[/save]]` links that the target's owner clicks;
 * - Brutal Execution is two receipts (the use, then one "failed save" receipt per Creature) so only a reviewed
 *   outcome ever changes a target, and an unowned target is changed through the GM relay (`validateTarget`);
 * - Cyclone Strike's frequency is read from the recorded, non-undone receipts, so undo restores the tracker;
 * - a Reaction is spent by the engine after the receipt persists (`receipt.reaction`) and refunded by undo.
 */
import {
  GUARD_CLASS_ID, guardEnabled, guardLevel, guardBranch, centurionDC, martialDC
} from "./guard-rules.mjs";
import { guardUses } from "./guard-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { definePool, getPoolDefinition } from "./resource-pools.mjs";
import { spendReaction, getReactions, refundReaction } from "./trigger-events.mjs";
import { need, values, flag, esc, opaqueKey } from "./operation-kernel.mjs";
import { withinFeet, tokenPoint } from "./standard-bearer-rules.mjs";
import "./guard-features.mjs"; // defines the Aggression and Unrelenting pools these uses spend

/** The Shock Trooper feature Item (Intimidating, Long-Arm, Brutal Execution); source of the effects these uses create. */
export const SHOCK_TROOPER_ID = "subclass-feature-guard-centurion-1st-level-shock-trooper-1175";
const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
const SIZES = ["tiny", "sm", "med", "lg", "huge", "grg"];

export const isCenturion = actor => guardEnabled(actor) && guardBranch(actor) === "centurion";

export function defineCenturionPools() {
  if (!getPoolDefinition("ferociousFling")) {
    definePool({
      id: "ferociousFling",
      label: "Ferocious Fling",
      max: 1,
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isCenturion(actor) && guardLevel(actor) >= 4,
      recovery: [{ on: "sr", amount: "toMax" }, { on: "lr", amount: "toMax" }]
    });
  }
  if (!getPoolDefinition("guillotine")) {
    definePool({
      id: "guillotine",
      label: "Guillotine",
      max: 1,
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isCenturion(actor) && guardLevel(actor) >= 10,
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
  if (!getPoolDefinition("stormOfBlood")) {
    definePool({
      id: "stormOfBlood",
      label: "Storm of Blood",
      max: 1,
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isCenturion(actor) && guardLevel(actor) >= 17,
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
}

const levelWarning = (warnings, actor, requiredLevel, name) => {
  const current = guardLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${name} is a Centurion level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

/* ---------------------------------------------------------------- helpers */

/**
 * "Intimidation Modifier" (Ch.3 L2554, L2573) is the final Intimidation skill bonus, `system.skills.itm.total`
 * (ability modifier plus Proficiency or Expertise from Intimidating). The fallback chain is the one centurionDC uses,
 * so the DC and the Psychic Damage always come from the same number.
 */
export function intimidationModifier(actor) {
  const system = actor?.system ?? {};
  return Number(system.skills?.itm?.total ?? (system.skills?.itm?.mod ?? (system.abilities?.cha?.mod ?? 0)));
}

/** An Actor from an Actor, Token or TokenDocument UUID, or null. */
function creatureAt(uuid) {
  const doc = uuid ? globalThis.fromUuidSync?.(uuid) : null;
  const actor = doc?.documentName === "Token" || doc?.documentName === "TokenDocument" ? doc.actor : doc;
  return actor?.documentName === "Actor" ? actor : null;
}

/**
 * `data.targets` as `[{ uuid, name }]` (or plain UUID strings), resolved to Actors and de-duplicated. A Creature that no
 * longer exists (just killed and deleted, say) is reported in `missing` for a warning; it never blocks the use.
 */
function chosenCreatures(list) {
  const seen = new Set(), found = [], missing = [];
  for (const entry of Array.isArray(list) ? list : []) {
    const creature = creatureAt(typeof entry === "string" ? entry : entry?.uuid);
    if (!creature) { missing.push(entry?.name ?? (typeof entry === "string" ? entry : entry?.uuid) ?? "a Creature"); continue; }
    if (seen.has(creature.uuid)) continue;
    seen.add(creature.uuid);
    found.push({ uuid: creature.uuid, name: creature.name });
  }
  return { found, missing };
}

const tokenFor = actor => values(actor?.getActiveTokens?.(true, true) ?? []).map(token => token.document ?? token).find(token => token?.parent);
/** Range is a warning only, and only when both Creatures have tokens on one scene. */
function rangeWarning(warnings, source, creature, feet, feature) {
  try {
    const own = tokenFor(source), other = tokenFor(creature), scene = own?.parent;
    if (!scene?.grid || !other || other.parent?.id !== scene.id) return;
    if (!withinFeet(scene, tokenPoint(own), other, feet)) warn(warnings, "range", `${creature.name} is more than ${feet} ft from ${source.name} (${feature}).`);
  } catch { /* an unmeasurable distance is not a warning */ }
}

/** The one Damage Type of the equipped weapon(s), or null when there is none or more than one. */
function wieldedDamageType(actor) {
  const types = new Set(values(actor?.items).filter(item => item.type === "weapon" && item.system?.equipped)
    .flatMap(item => Array.from(item.system?.damage?.base?.types ?? [])));
  return types.size === 1 ? [...types][0] : null;
}

const saveLink =(ability, dc) => `[[/save ability=${ability} dc=${dc}]]`;
const isFrightened = creature => Boolean(creature?.statuses?.has?.("frightened") || flag(creature, "frightened"));
/** A Frightened effect this Centurion's own uses (or AK5e tags) created: "Frightened of you". */
const frightenedEffect = effect => Boolean(effect?.statuses?.has?.("frightened") || (Array.isArray(effect?.statuses) && effect.statuses.includes("frightened")));
const frightenedOfYou = (actor, creature) => values(creature?.effects).some(effect => frightenedEffect(effect)
  && (flag(effect, "guardUsesEffect")?.sourceUuid === actor.uuid || flag(effect, "temporaryTag")?.sourceActorUuid === actor.uuid));
const featureItem = (actor, featureId) => values(actor?.items).find(item => flag(item, "chapterThreeId") === featureId);
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The turn the Centurion is using a Feature on, and when their next Turn begins (null outside a started combat). */
function turnPosition(actor) {
  const combat = globalThis.game?.combat;
  if (!combat?.started) return null;
  const turns = values(combat.turns);
  const turn = Number(combat.turn ?? 0), round = Number(combat.round ?? 0), current = combat.combatant ?? turns[turn];
  // The Creature may hold several initiative entries: the next one to begin after this moment ends the wait.
  const starts = turns.map((c, index) => c.actor?.uuid === actor.uuid ? { round: round + (index <= turn ? 1 : 0), turn: index } : null).filter(Boolean)
    .sort((a, b) => a.round - b.round || a.turn - b.turn);
  return { combatId: combat.id, round, turn, turnId: current?.id ?? `turn${turn}`, nextStart: starts[0] ?? null };
}

/**
 * Cyclone Strike frequency (L2558-2560). Read from the recorded, non-undone receipts, so an undo gives the use back.
 * Below 14th Level: not again "until the beginning of your next Turn". From 14th Level: once on each Turn.
 */
function cycloneRepeat(actor, state, level) {
  const position = turnPosition(actor);
  if (!position) return null;
  for (const receipt of state.undo ?? []) {
    const used = receipt.cyclone;
    if (receipt.command !== "cycloneStrike" || receipt.status === "undone" || used?.combatId !== position.combatId) continue;
    if (level >= 14) {
      if (used.round === position.round && used.turnId === position.turnId) return "Cyclone Strike was already used on this Turn (from 14th Level it can be used once on each Turn).";
    } else if (used.nextStart && (position.round < used.nextStart.round || (position.round === used.nextStart.round && position.turn < used.nextStart.turn))) {
      return "Cyclone Strike was already used; it is available again at the beginning of your next Turn.";
    }
  }
  return null;
}

/** Frightened (until the end of the Centurion's next Turn) from a failed Brutal Execution save, as a recorded effect entry. */
function frightenedEntry(actor, creature) {
  return { uuid: creature.uuid, name: creature.name, kind: "effect", featureId: SHOCK_TROOPER_ID,
    tag: { label: "Frightened (Brutal Execution)", condition: "frightened", trigger: "nextTurnEnd", expiryActor: "source",
      instructions: `Frightened of ${actor.name} until the end of ${actor.name}'s next Turn.` }, ready: true };
}
/** Long-Arm gained from Storm of Blood: shown on the Centurion; it does not edit weapon Reach (L2616-2617). */
function longArmEntry(actor) {
  return { uuid: actor.uuid, name: actor.name, kind: "effect", featureId: SHOCK_TROOPER_ID,
    tag: { label: "Long-Arm (Storm of Blood)", trigger: "nextTurnEnd", expiryActor: "source",
      instructions: "Melee Weapons you are wielding are considered to have the Reach Property (or +5 ft Reach if they already do) until the end of your next Turn, even when it is not your Turn. Apply it manually when measuring." }, ready: true };
}
const sameEntry = (entry, expected) => entry?.kind === expected.kind && entry.uuid === expected.uuid && entry.featureId === expected.featureId
  && sameJson(entry.tag, expected.tag) && entry.meta === undefined;

/* ---------------------------------------------------------------- Centurion Plans */

const CENTURION_PLANS = {
  cycloneStrike(actor, state, data) {
    need(isCenturion(actor), "Cyclone Strike is a Centurion feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;
    const maxTargets = level >= 7 ? 2 : 1;

    const repeat = cycloneRepeat(actor, state, level);
    if (repeat) warn(warnings, "frequency", repeat);

    const secondaryCount = Array.isArray(data.targetUuids) ? data.targetUuids.length : 1;
    // The sheet sends the selected tokens as `targets` (original plus cleaved): more than 1 + max can never be right.
    const selected = Array.isArray(data.targets) ? data.targets.length : 0;
    if (secondaryCount > maxTargets || selected > maxTargets + 1) {
      warn(warnings, "targetCount", `Cyclone Strike can cleave to at most ${maxTargets} secondary Creature(s) at level ${level}.`);
    }
    const position = turnPosition(actor);

    return {
      warnings,
      title: "Cyclone Strike (Cleave)",
      apply(next, receipt) {
        // The tracker is this receipt itself: undo marks it undone, which frees the use again.
        if (position) receipt.cyclone = { combatId: position.combatId, round: position.round, turn: position.turn, turnId: position.turnId, nextStart: position.nextStart };
        receipt.summary = `${actor.name} cleaves with a Melee Weapon Attack to ${secondaryCount} secondary Creature(s).`;
        receipt.result = { secondaryCount, maxTargets };
        return {};
      }
    };
  },

  /**
   * Press the Attack: Brutal Execution, the use. It spends the Aggression (and the Reaction when used as one) and posts
   * a Wisdom save link; nothing changes on a target until "Brutal Execution: failed save" records an outcome.
   */
  brutalExecution(actor, _state, data) {
    need(isCenturion(actor), "Brutal Execution is a Centurion feature.");
    const warnings = [];
    const available = resourceValue(actor, { pool: "aggression" });
    if (available < 2) {
      warn(warnings, "aggression", `2 Aggression needed and ${available} remain; Aggression clamps at 0.`);
    }
    const asReaction = data.asReaction === true;
    if (asReaction && getReactions(actor).available < 1) warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    if (data.killed !== true) warn(warnings, "kill", "You did not confirm that you just killed a Creature; Brutal Execution is used immediately after you kill one.");

    const { found: creatures, missing } = chosenCreatures(data.targets);
    if (missing.length) warn(warnings, "missingTarget", `${missing.join(", ")} could not be found and ${missing.length === 1 ? "is" : "are"} left out of the list.`);
    const killedUuid = typeof data.killedUuid === "string" && data.killedUuid ? data.killedUuid : null;
    if (!creatures.length) warn(warnings, "targets", "No Creatures are listed. Record each Creature that fails its Wisdom Saving Throw with \"Brutal Execution: failed save\".");
    for (const creature of creatures) {
      if (creature.uuid === actor.uuid) warn(warnings, "self", `${actor.name} cannot be a hostile Creature affected by their own Brutal Execution.`);
      else rangeWarning(warnings, actor, creatureAt(creature.uuid), 15, "Brutal Execution");
    }

    const dc = centurionDC(actor);
    const damage = Math.max(0, intimidationModifier(actor));

    return {
      warnings,
      title: "Press the Attack: Brutal Execution",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 2, label: "Aggression" });
        // The engine spends the Reaction once this receipt is saved, and undo gives it back.
        if (asReaction) receipt.reaction = { requested: true, triggerId: `${receipt.id}-brutalExecution`, tags: [], perTrigger: true, pool: "auto" };
        receipt.html = true;
        receipt.brutal = { dc, damage, asReaction, targets: creatures, killedUuid };
        const list = creatures.length ? ` (${creatures.map(c => esc(c.name)).join(", ")})` : "";
        receipt.summary = `${esc(actor.name)} executes a foe brutally${asReaction ? " (Reaction)" : ""}: hostile Creatures within 15 ft${list} make ${saveLink("wis", dc)} (Centurion DC ${dc}). On a failure a Creature takes ${damage} Psychic Damage (Intimidation Modifier) and is Frightened of ${esc(actor.name)} until the end of ${esc(actor.name)}'s next Turn; use "Brutal Execution: failed save" for each Creature that failed. If this Damage reduces a Creature to 0 Hit Points, it falls Unconscious rather than dying.`;
        receipt.result = { aggressionSpent: 2, dc, damage, frightened: true, targets: creatures.length };
        return updates;
      }
    };
  },

  /** Brutal Execution, one Creature that failed its Wisdom save: Frightened is applied; the Psychic Damage is rolled from the card. */
  brutalExecutionFailed(actor, state, data) {
    need(isCenturion(actor), "Brutal Execution is a Centurion feature.");
    const use = (state.undo ?? []).find(receipt => receipt.id === data.useId && receipt.command === "brutalExecution" && receipt.status !== "undone");
    need(use?.brutal, "Choose a recorded Brutal Execution use.");
    const creature = creatureAt(data.targetUuid);
    need(creature, "Choose the Creature that failed its Wisdom Saving Throw.");
    need(featureItem(actor, SHOCK_TROOPER_ID), "Run Guard setup to add the Shock Trooper feature Item first.");
    const warnings = [];
    if (data.failedSave !== true) warn(warnings, "failedSave", `You did not confirm that ${creature.name} failed its Wisdom Saving Throw.`);
    if (!use.brutal.targets.some(listed => listed.uuid === creature.uuid)) warn(warnings, "notListed", `${creature.name} was not listed when Brutal Execution was used.`);
    if ((state.undo ?? []).some(receipt => receipt.command === "brutalExecutionFailed" && receipt.status !== "undone"
      && receipt.brutalOutcome?.useId === use.id && receipt.brutalOutcome.targetUuid === creature.uuid)) warn(warnings, "repeat", `${creature.name} already has a recorded failed save for this Brutal Execution.`);
    if (creature.uuid === actor.uuid) warn(warnings, "self", `${actor.name} cannot be a hostile Creature affected by their own Brutal Execution.`);
    const damage = Number.isFinite(Number(use.brutal.damage)) ? Math.max(0, Number(use.brutal.damage)) : Math.max(0, intimidationModifier(actor));

    return {
      warnings,
      title: "Brutal Execution: failed save",
      apply(next, receipt) {
        receipt.brutalOutcome = { useId: use.id, targetUuid: creature.uuid };
        receipt.targets = [frightenedEntry(actor, creature)];
        receipt.damageParts = [{ formula: String(damage), type: "psychic" }];
        receipt.formula = String(damage);
        receipt.rollLabel = "Brutal Execution Psychic Damage";
        receipt.rollFlavor = `Brutal Execution: ${creature.name} takes Psychic Damage`;
        receipt.summary = `${creature.name} failed its Wisdom Saving Throw and is Frightened of ${actor.name} until the end of ${actor.name}'s next Turn. Roll ${damage} Psychic Damage from this card and apply it with the native damage controls; if it reduces the Creature to 0 Hit Points, it falls Unconscious rather than dying.`;
        receipt.result = { targetUuid: creature.uuid, damage, frightened: true };
        return {};
      },
    };
  },

  ferociousFling(actor, state, data) {
    need(isCenturion(actor), "Ferocious Fling is a Centurion feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Ferocious Fling");

    const available = resourceValue(actor, { pool: "ferociousFling" });
    const linked = data.brutalExecutionUseId
      ? (state.undo ?? []).find(receipt => receipt.id === data.brutalExecutionUseId && receipt.command === "brutalExecution" && receipt.status !== "undone") : null;
    if (data.brutalExecutionUseId && !linked) warn(warnings, "brutalUse", "No recorded Brutal Execution use matches, so this use of Ferocious Fling is not refunded.");
    if (linked) {
      // One Brutal Execution is used "on" one Creature: it refunds one Fling, and only for the Creature it followed.
      if (linked.brutal?.killedUuid && data.launchedUuid && linked.brutal.killedUuid !== data.launchedUuid)
        warn(warnings, "brutalCreature", "That Brutal Execution followed a different Creature than the one you are launching, so the refund may not apply.");
      if ((state.undo ?? []).some(receipt => receipt.command === "ferociousFling" && receipt.status !== "undone" && receipt.data?.brutalExecutionUseId === linked.id))
        warn(warnings, "brutalRepeat", "That Brutal Execution already refunded a use of Ferocious Fling.");
    }
    // "If you used Brutal Execution on the Creature you threw, your use of this Feature is refunded."
    const isBrutalRefund = Boolean(data.brutalExecution) || Boolean(linked);
    if (!isBrutalRefund && available < 1) {
      warn(warnings, "ferociousFling", `1 use of Ferocious Fling needed and ${available} remain.`);
    }

    // The launched Creature is the defeated one; its Constitution Modifier is the Damage.
    const launched = creatureAt(data.launchedUuid);
    const rawCon = Number(data.targetConMod ?? launched?.system?.abilities?.con?.mod ?? 0);
    need(Number.isInteger(rawCon), "Enter the launched Creature's Constitution Modifier.");
    const conMod = Math.max(0, rawCon);
    const targetUuid = data.targetUuid ?? null;
    const own = SIZES.indexOf(actor.system?.traits?.size), thrown = SIZES.indexOf(launched?.system?.traits?.size);
    if (own >= 0 && thrown > own) warn(warnings, "size", `${launched.name} is larger than ${actor.name}; Ferocious Fling needs a Creature of the same size or smaller.`);
    const struck = creatureAt(targetUuid);
    if (struck) rangeWarning(warnings, actor, struck, 30, "Ferocious Fling");
    const strMod = Number(actor.system?.abilities?.str?.mod ?? 0);

    return {
      warnings,
      title: "Ferocious Fling",
      apply(next, receipt) {
        let updates = {};
        if (!isBrutalRefund) {
          updates = spendResource(actor, receipt, { pool: "ferociousFling", amount: 1, label: "Ferocious Fling" });
        }
        // The Ranged Weapon Attack (Strength) is the player's own native roll; the module never starts it.
        receipt.damageParts = [{ formula: String(conMod), type: "bludgeoning" }];
        receipt.formula = String(conMod);
        receipt.rollLabel = "Fling Damage";
        receipt.rollFlavor = "Ferocious Fling: Bludgeoning Damage";
        receipt.summary = `${actor.name} flings a defeated Creature as a projectile at another Creature within 30 ft${isBrutalRefund ? " (use refunded by Brutal Execution)" : ""}. Make the Ranged Weapon Attack with your own attack roll, using Strength (${strMod < 0 ? "" : "+"}${strMod}); on a hit, roll the ${conMod} Bludgeoning Damage (the launched Creature's Constitution Modifier) from this card and apply it with the native damage controls.`;
        receipt.result = { targetUuid, conMod, brutalRefund: isBrutalRefund };
        return updates;
      }
    };
  },

  guillotine(actor, _state, data) {
    need(isCenturion(actor), "Guillotine is a Centurion feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Guillotine");

    const available = resourceValue(actor, { pool: "guillotine" });
    if (available < 1) {
      warn(warnings, "guillotine", `1 use of Guillotine needed and ${available} remain.`);
    }

    const pb = Number(actor.system?.attributes?.prof ?? 2);
    const diceCount = 2 * pb;
    const mDC = martialDC(actor);
    const cDC = centurionDC(actor);
    const isEliteOrLeader = Boolean(data.eliteOrLeader);
    // "the same Damage Type as the weapon you are wielding": the player names it, else a single equipped weapon's type is
    // read; Slashing is only a placeholder while the warning stands.
    const named = String(data.damageType ?? wieldedDamageType(actor) ?? "").toLowerCase();
    const typed = DAMAGE_TYPES.includes(named);
    if (!typed) warn(warnings, "damageType", "Choose the Damage Type of the weapon you are wielding; Slashing is used until you do.");
    const damageType = typed ? named : "slashing";

    return {
      warnings,
      title: "Guillotine",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "guillotine", amount: 1, label: "Guillotine" });
        receipt.html = true;
        receipt.formula = `${diceCount}d6`;
        receipt.damageParts = [{ formula: `${diceCount}d6`, type: damageType }];
        receipt.rollLabel = `Guillotine Damage (${diceCount}d6)`;
        receipt.rollFlavor = `Guillotine: ${diceCount}d6 ${damageType} Damage`;
        receipt.summary = `${esc(actor.name)} strikes a lethal blow at a Creature within Reach; it makes ${saveLink("dex", mDC)} (Martial DC ${mDC}). On a failure it takes ${diceCount}d6 ${esc(damageType)} Damage and begins Bleeding; on a success it takes half as much Damage and no other effects (use the half-damage control when applying the roll).${isEliteOrLeader ? ` The Creature is an Elite or Leader: other hostile Creatures within 30 ft of it make ${saveLink("wis", cDC)} (Centurion DC ${cDC}) or become Frightened of ${esc(actor.name)} until the end of ${esc(actor.name)}'s next Turn.` : ""} Apply Bleeding and Frightened from the Conditions list.`;
        receipt.result = { diceCount, martialDC: mDC, centurionDC: cDC, eliteOrLeader: isEliteOrLeader, damageType };
        return updates;
      }
    };
  },

  shredder(actor, _state, data) {
    need(isCenturion(actor), "Shredder is a Centurion feature.");
    const warnings = [];
    levelWarning(warnings, actor, 13, "Shredder");

    const strMod = Number(actor.system?.abilities?.str?.mod ?? 0);
    const sole = Array.isArray(data.targets) && data.targets.length === 1 ? (typeof data.targets[0] === "string" ? data.targets[0] : data.targets[0]?.uuid) : null;
    const targetUuid = data.targetUuid ?? sole ?? null; // the sheet sends the selected tokens as `targets`
    // Doubled against Creatures Frightened of you: the player confirms it, or the Creature carries a Frightened effect
    // created by this Centurion. A Frightened status from another source is only a warning.
    const struck = creatureAt(targetUuid);
    const frightenedTarget = Boolean(data.targetFrightened) || frightenedOfYou(actor, struck);
    if (!frightenedTarget && isFrightened(struck)) warn(warnings, "frightenedSource", `${struck.name} is Frightened, but not recorded as Frightened of ${actor.name}; the Damage is doubled only against Creatures Frightened of you. Confirm it if it is.`);
    const damage = Math.max(0, frightenedTarget ? 2 * strMod : strMod);

    return {
      warnings,
      title: "Shredder",
      apply(next, receipt) {
        receipt.damageParts = [{ formula: String(damage), type: "slashing" }];
        receipt.formula = String(damage);
        receipt.rollLabel = "Shredder Damage";
        receipt.rollFlavor = "Shredder: Slashing Damage";
        receipt.summary = `Secondary Creature takes ${damage} Slashing Damage (STR ${strMod}${frightenedTarget ? " doubled vs Frightened" : ""}). Roll it from this card and apply it with the native damage controls.`;
        receipt.result = { damage, targetUuid, isFrightened: frightenedTarget };
        return {};
      }
    };
  },

  stormOfBlood(actor, _state, _data) {
    need(isCenturion(actor), "Storm of Blood is a Centurion feature.");
    const warnings = [];
    levelWarning(warnings, actor, 17, "Storm of Blood");

    const available = resourceValue(actor, { pool: "stormOfBlood" });
    if (available < 1) {
      warn(warnings, "stormOfBlood", `1 use of Storm of Blood needed and ${available} remain.`);
    }

    const mDC = martialDC(actor);
    const trackLongArm = Boolean(featureItem(actor, SHOCK_TROOPER_ID));

    return {
      warnings,
      title: "Storm of Blood",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "stormOfBlood", amount: 1, label: "Storm of Blood" });
        receipt.html = true;
        receipt.formula = "10d8";
        receipt.damageParts = [{ formula: "10d8", type: "slashing" }];
        receipt.rollLabel = "Storm of Blood Damage (10d8)";
        receipt.rollFlavor = "Storm of Blood: 10d8 Slashing Damage";
        // Long-Arm until the end of the next Turn is a visible effect on the Centurion; it needs the Shock Trooper Item.
        if (trackLongArm) receipt.targets = [longArmEntry(actor)];
        receipt.summary = `${esc(actor.name)} whirls in a storm of blood; Creatures of their choice they can see within 15 ft make ${saveLink("dex", mDC)} (Martial DC ${mDC}). On a failure each takes 10d8 Slashing Damage and is Frightened of ${esc(actor.name)} until the end of ${esc(actor.name)}'s next Turn (while Frightened it must move directly away on its Turn if able); on a success it takes half as much Damage and is not Frightened. Apply the damage with the native damage controls and Frightened from the Conditions list. Long-Arm is gained until the end of ${esc(actor.name)}'s next Turn, even when it is not their Turn${trackLongArm ? " (shown as an effect on the Centurion; apply the Reach when measuring)" : " (track it manually)"}. Use "Storm of Blood: Attack of Opportunity hit" when an Attack of Opportunity hits to regain the Reaction.`;
        receipt.result = { martialDC: mDC, damageFormula: "10d8", longArm: trackLongArm };
        return updates;
      }
    };
  },

  /** Storm of Blood (17th): "hitting a Creature with an Attack of Opportunity refunds use of your Reaction". Reversible. */
  stormOfBloodRefund(actor, state, data) {
    need(isCenturion(actor), "Storm of Blood is a Centurion feature.");
    const warnings = [];
    levelWarning(warnings, actor, 17, "Storm of Blood");
    if (!(state.undo ?? []).some(receipt => receipt.command === "stormOfBlood" && receipt.status !== "undone"))
      warn(warnings, "noStorm", "No Storm of Blood use is recorded; the refund applies after you have used it.");
    if (data.hit !== true) warn(warnings, "hit", "You did not confirm that the Attack of Opportunity hit a Creature.");
    const budget = getReactions(actor);
    if (budget.spent + budget.extra.reduce((sum, extra) => sum + extra.spent, 0) < 1) warn(warnings, "noReaction", `${actor.name} has no spent Reaction to regain.`);

    return {
      warnings,
      title: "Storm of Blood: Attack of Opportunity hit",
      apply(next, receipt) {
        receipt.targets = [{ uuid: actor.uuid, name: actor.name, kind: "centurionReactionRefund", ready: true }];
        receipt.summary = `${actor.name} hit a Creature with an Attack of Opportunity and regains use of their Reaction (Storm of Blood).`;
        receipt.result = { refunded: true };
        return {};
      }
    };
  }
};

/*
 * GM-relay checks. The engine reads `PLANS[command].validateTarget` (a property of the plan function, not of the plan it
 * returns) before applying a change on a Creature the user does not own. Each accepts only the exact effect entry that
 * plan creates, so an edited receipt cannot make the GM's client change anything else.
 */
CENTURION_PLANS.brutalExecutionFailed.validateTarget = (source, recorded, entry, target) => {
  const brutal = guardUses.receipt(source, recorded.brutalOutcome?.useId);
  return isCenturion(source) && recorded.command === "brutalExecutionFailed" && brutal?.command === "brutalExecution" && brutal.status !== "undone"
    && recorded.brutalOutcome?.targetUuid === target?.uuid && recorded.targets?.length === 1
    && sameEntry(entry, frightenedEntry(source, target));
};
CENTURION_PLANS.stormOfBlood.validateTarget = (source, recorded, entry, target) =>
  isCenturion(source) && recorded.command === "stormOfBlood" && target?.uuid === source.uuid && sameEntry(entry, longArmEntry(source));

/**
 * The Reaction a Storm of Blood Attack of Opportunity refunds. Applied only on the Centurion's own client; undo spends it
 * again (a new spend, so the refund cannot be undone into a free Reaction) when one is left.
 */
const centurionReactionRefund = {
  local: true,
  async apply(_source, useId, _entry, target) {
    const key = opaqueKey(useId), done = flag(target, guardUses.appliedFlag)?.[key];
    if (done) return done;
    // The Reaction an Attack of Opportunity spent: the base one, else the first extra Reaction that is spent.
    const budget = getReactions(target), extra = budget.extra.find(candidate => candidate.spent > 0);
    const result = await refundReaction(target, { pool: budget.spent > 0 || !extra ? "base" : extra.id });
    const record = { refunded: result?.ok === true && !result.replayed };
    await target.update({ [`flags.ak5e.${guardUses.appliedFlag}.${key}`]: record });
    return record;
  },
  async revert(_source, useId, _entry, target) {
    const key = opaqueKey(useId), record = flag(target, guardUses.appliedFlag)?.[key];
    let respent = null;
    if (record?.refunded) respent = await spendReaction(target, { triggerId: `${useId}:refund-undone`, perTrigger: false, receipt: `${useId}_undo` });
    await target.update({ [`flags.ak5e.${guardUses.appliedFlag}.${key}`]: null });
    return { respent: respent?.ok === true };
  },
  preview(_source, receipt, _entry, target) {
    const record = flag(target, guardUses.appliedFlag)?.[opaqueKey(receipt.id)];
    return record?.refunded ? "Spends the refunded Reaction again (if one is available)." : "No Reaction was refunded; nothing to spend again.";
  }
};

guardUses.register({ plans: CENTURION_PLANS, targetKinds: { centurionReactionRefund } });

/* ---------------------------------------------------------------- Fearmonger & Long-Arm Hooks */

const targetedCreatures = () => Array.from(globalThis.game?.user?.targets ?? []).map(token => token.actor ?? token.document?.actor).filter(Boolean);

/**
 * Fearmonger (4th, L2581): "Advantage on Attack Rolls against Frightened Creatures, and Frightened Creatures have
 * Disadvantage on Attack Rolls against you." Outgoing Advantage is only for a Centurion of 4th level or higher, and only
 * when every targeted Creature is Frightened; incoming Disadvantage is only for a Frightened attacker whose targets are
 * all such Centurions. Anything else keeps its normal roll.
 */
export function centurionPreRollAttack(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor) return;
  const roll = config.rolls?.[0];
  if (!roll) return;

  const targets = targetedCreatures();
  if (!targets.length) return;
  const fearmonger = creature => isCenturion(creature) && (guardLevel(creature) ?? 1) >= 4;

  if (fearmonger(actor) && targets.every(isFrightened)) {
    roll.options ??= {};
    roll.options.advantage = true;
  }
  if (isFrightened(actor) && targets.every(fearmonger)) {
    roll.options ??= {};
    roll.options.disadvantage = true;
  }
}

export function registerCenturionHooks() {
  defineCenturionPools();
  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollAttackV2", centurionPreRollAttack);
  }
}

defineCenturionPools();
