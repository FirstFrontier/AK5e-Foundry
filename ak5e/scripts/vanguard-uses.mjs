/**
 * Vanguard table-play use engine (WORKFLOW.md §3.2, play-uses.mjs).
 * Enforces:
 *  - Confirm before use;
 *  - Non-blocking warnings with "Use anyway" overrides;
 *  - Zero-clamping on resource shortfalls;
 *  - Automatic GM relay for unowned target modifications;
 *  - Interactive roll buttons on chat cards (no auto-rolled dice);
 *  - Encounter-window undo receipts in `flags.ak5e.vanguardUses`.
 */
import { createPlayUses, warn } from "./play-uses.mjs";
import {
  vanguardEnabled, vanguardLevel, vanguardState, checkLevel,
  approachingStormBonus, landstriderSpeedBonus, flag
} from "./vanguard-rules.mjs";
import {
  hasLandstrider, hasQuickOffTheMark, hasUncannyDodge,
  hasDirectedEngagement, isDirectedEngagementActive, hasLightspeed, hasApproachingStorm,
  calculateUncannyDodge, lightspeedSecondInitiative
} from "./vanguard-features.mjs";
import { TIP_INSTRUCTIONS } from "./standard-bearer-rules.mjs";
import { TIP_OUTCOMES, speedChanges, attackChanges } from "./tip-of-the-spear.mjs";
import { need, opaqueKey, values } from "./operation-kernel.mjs";
import { spendReaction, getReactions } from "./trigger-events.mjs";
import { requireOverrides, isPlayWarnings } from "./play-undo.mjs";
import { applyFeatureTag } from "./feature-tags.mjs";

export const vanguardUses = createPlayUses({
  ns: "vanguardUses",
  label: "Vanguard",
  isMember: actor => vanguardEnabled(actor),
  ruling: (actor, key) => {
    const record = vanguardState(actor).rulings?.[key];
    return record?.source?.trim?.() && record.value !== undefined ? record.value : undefined;
  }
});

/** GM-only: record a ruling for an unresolved reading. */
export async function recordVanguardRuling(actor, key, value, source) {
  need(game.user.isGM && actor?.isOwner, "Only the GM may record Vanguard rulings.");
  const reading = vanguardUses.readings()[key];
  need(reading?.options.some(option => option.value === value), "Choose a supported ruling value.");
  need(typeof source === "string" && source.trim().length >= 10, "Record the source and reason for this ruling (at least 10 characters).");
  await actor.update({ [`flags.ak5e.vanguard.rulings.${key}`]: { value, source: source.trim(), approvedBy: game.user.id } });
  return vanguardState(actor).rulings[key];
}

const levelWarning = (warnings, actor, requiredLevel, featureName) => {
  const current = vanguardLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${featureName} is a Vanguard level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

/* ---------------------------------------------------------------- Core Vanguard Plans */

function applyTipOutcomeData(receipt, outcome, actor, targetUuid, targetName, pb, data = {}) {
  need(outcome >= 1 && outcome <= 6, "Tip outcome must be 1 to 6.");
  receipt.outcome = outcome;
  const instruction = TIP_INSTRUCTIONS[outcome - 1];

  if (outcome === 1) {
    receipt.summary = `${targetName} gains +${pb} damage on one Damage Roll of their choice until start of ${actor.name}'s next Turn.`;
    receipt.result = { damageBonus: pb, outcome: 1 };
    if (targetUuid) {
      receipt.targets = [{
        uuid: targetUuid,
        name: targetName,
        kind: "effect",
        featureId: "class-feature-vanguard-1st-level-tip-of-the-spear-3092",
        standardBenefit: { kind: "tip1", value: pb },
        tag: {
          label: `Tip of the Spear: +${pb} Damage`,
          trigger: "turnStart",
          expiryActor: "source",
          actions: ["used"],
          changes: [],
          instructions: instruction
        },
        ready: true
      }];
    }
  } else if (outcome === 2) {
    receipt.summary = `${targetName} gains additive Temporary Hit Points (1d6).`;
    receipt.result = { outcome: 2, additive: true };
    if (targetUuid) {
      const thpAmount = Number(data.amount ?? data.tempHPAmount ?? (receipt.roll ?? 3));
      receipt.targets = [{
        uuid: targetUuid,
        name: targetName,
        kind: "tempHP",
        mode: "additive",
        amount: thpAmount,
        ready: true
      }];
    }
  } else if (outcome === 3) {
    receipt.summary = `${targetName}'s Walking Speed is increased by 10 feet until start of ${actor.name}'s next Turn.`;
    receipt.result = { speedBonus: 10, outcome: 3 };
    if (targetUuid) {
      receipt.targets = [{
        uuid: targetUuid,
        name: targetName,
        kind: "effect",
        featureId: "class-feature-vanguard-1st-level-tip-of-the-spear-3092",
        tag: {
          label: "Tip of the Spear: Speed +10 ft",
          trigger: "turnStart",
          expiryActor: "source",
          changes: [{ key: "system.attributes.movement.walk", value: "10", mode: 2, priority: 20 }],
          instructions: instruction
        },
        ready: true
      }];
    }
  } else if (outcome === 4) {
    receipt.summary = `${targetName} gains +2 to Attack Rolls until start of ${actor.name}'s next Turn.`;
    receipt.result = { attackBonus: 2, outcome: 4 };
    if (targetUuid) {
      receipt.targets = [{
        uuid: targetUuid,
        name: targetName,
        kind: "effect",
        featureId: "class-feature-vanguard-1st-level-tip-of-the-spear-3092",
        tag: {
          label: "Tip of the Spear: +2 to Attack Rolls",
          trigger: "turnStart",
          expiryActor: "source",
          changes: attackChanges(2),
          instructions: instruction
        },
        ready: true
      }];
    }
  } else if (outcome === 5) {
    receipt.summary = `${targetName}'s Critical Range is increased by 1 until start of ${actor.name}'s next Turn.`;
    receipt.result = { critRangeBonus: 1, outcome: 5 };
    if (targetUuid) {
      receipt.targets = [{
        uuid: targetUuid,
        name: targetName,
        kind: "effect",
        featureId: "class-feature-vanguard-1st-level-tip-of-the-spear-3092",
        standardBenefit: { kind: "tip5", value: 1 },
        tag: {
          label: "Tip of the Spear: Critical Range +1",
          trigger: "turnStart",
          expiryActor: "source",
          changes: [],
          instructions: instruction
        },
        ready: true
      }];
    }
  } else if (outcome === 6) {
    receipt.summary = `${targetName} gains 1 additional Skill Point whenever they gain SP until start of ${actor.name}'s next Turn.`;
    receipt.result = { spBonus: 1, outcome: 6 };
    if (targetUuid) {
      receipt.targets = [{
        uuid: targetUuid,
        name: targetName,
        kind: "effect",
        featureId: "class-feature-vanguard-1st-level-tip-of-the-spear-3092",
        standardBenefit: { kind: "tip6", value: 1 },
        tag: {
          label: "Tip of the Spear: +1 Skill Point",
          trigger: "turnStart",
          expiryActor: "source",
          changes: [],
          instructions: instruction
        },
        ready: true
      }];
    }
  }
}

const CORE_PLANS = {
  tipOfTheSpear(actor, state, data) {
    need(vanguardEnabled(actor), "Tip of the Spear requires the Vanguard class.");
    const warnings = [];
    const level = vanguardLevel(actor) ?? 1;
    const pb = Math.floor((level - 1) / 4) + 2;

    const targetUuid = data.target?.uuid ?? data.targetActor?.uuid ?? data.targetUuid ?? null;
    const targetName = data.target?.name ?? data.targetActor?.name ?? data.targetName ?? "allied creature";

    // Range check: 60 ft (Tactician may have range Infinity)
    const distance = Number(data.distance ?? 0);
    const range = data.range !== undefined ? Number(data.range) : 60;
    if (Number.isFinite(range) && distance > range) {
      warn(warnings, "range", `${targetName} is beyond ${range} feet (Tip of the Spear range); no exception is invented.`);
    }

    const directed = Boolean(data.directed);
    const choice = data.choice !== undefined && data.choice !== null ? Number(data.choice) : null;
    const isDirected = Boolean(directed || choice !== null);
    const alreadyActive = isDirectedEngagementActive(actor);

    if (isDirected) {
      if (!alreadyActive) {
        levelWarning(warnings, actor, 15, "Directed Engagement");
        if (directed) {
          const reactions = getReactions(actor);
          if (reactions?.available < 1) {
            warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
          }
        }
      }
      need(choice === null || (Number.isInteger(choice) && choice >= 1 && choice <= 6), "Choose a Tip of the Spear outcome from 1 to 6 for Directed Engagement.");
    }

    const title = directed ? "Tip of the Spear (Directed Engagement)" : "Tip of the Spear";

    return {
      warnings,
      title,
      rolls: (!isDirected && choice === null)
        ? [{ id: "tipRoll", label: "Tip of the Spear (1d6)", formula: "1d6" }]
        : [],
      async apply(next, receipt) {
        receipt.targetUuid = targetUuid;
        receipt.targetName = targetName;
        receipt.directed = directed;
        receipt.choice = choice;
        receipt.data = data;

        if (directed && !alreadyActive) {
          const triggerId = `${receipt.id}-directedEngagement`;
          const rx = await spendReaction(actor, { triggerId, receipt: receipt.id });
          receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id, triggerId };
          if (rx.ok) {
            await actor.update({ "flags.ak5e.vanguard.directedEngagementActive": true });
          }
        }

        const resolvedOutcome = choice ?? (receipt.roll !== undefined ? Number(receipt.roll) : null);

        if (resolvedOutcome !== null) {
          applyTipOutcomeData(receipt, resolvedOutcome, actor, targetUuid, targetName, pb, data);
        } else {
          receipt.formula = "1d6";
          receipt.rollLabel = "Tip of the Spear (1d6)";
          receipt.rollFlavor = "Tip of the Spear";
          receipt.summary = `${actor.name} invokes Tip of the Spear targeting ${targetName}. Click Roll to determine the outcome.`;
          receipt.status = "awaitingRoll";
          receipt.result = { awaitingRoll: true, formula: "1d6" };
        }

        return {};
      }
    };
  },

  uncannyDodge(actor, state, data) {
    need(vanguardEnabled(actor), "Uncanny Dodge requires the Vanguard class.");
    const warnings = [];
    levelWarning(warnings, actor, 11, "Uncanny Dodge");

    const reactions = getReactions(actor);
    if (reactions?.available < 1) {
      warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    }

    const damage = Number(data.damage ?? 0);
    need(Number.isFinite(damage) && damage >= 0, "Damage must be a non-negative number.");
    const halved = calculateUncannyDodge(damage);
    const reduced = damage - halved;

    return {
      warnings,
      title: "Uncanny Dodge",
      async apply(next, receipt) {
        const triggerId = `${receipt.id}-uncannyDodge`;
        const rx = await spendReaction(actor, { triggerId, receipt: receipt.id });
        receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id, triggerId };
        receipt.summary = `${actor.name} uses their Reaction to halve incoming Attack damage against them from ${damage} to ${halved} (reduced by ${reduced}).`;
        receipt.result = { originalDamage: damage, halvedDamage: halved, damageReduced: reduced };
        return {};
      }
    };
  },

  nimble(actor, state, data) {
    need(vanguardEnabled(actor), "Nimble requires the Vanguard class.");
    const warnings = [];
    const targetUuid = data.target?.uuid ?? data.targetActor?.uuid ?? data.targetUuid ?? null;
    const targetName = data.target?.name ?? data.targetActor?.name ?? data.targetName ?? "creature";

    return {
      warnings,
      title: "Landstrider: Nimble",
      async apply(next, receipt) {
        const current = flag(actor, "vanguard.nimbleTargets") ?? [];
        if (targetUuid && !current.includes(targetUuid)) {
          const updated = [...current, targetUuid];
          receipt.summary = `${actor.name} hits ${targetName} and does not provoke Opportunity Attacks from them for the rest of the Turn.`;
          receipt.result = { targetUuid, targetName };
          return { "flags.ak5e.vanguard.nimbleTargets": updated };
        }
        receipt.summary = `${actor.name} is Nimble against ${targetName}.`;
        return {};
      }
    };
  },

  approachingStorm(actor, state, data) {
    need(vanguardEnabled(actor), "Approaching Storm requires the Vanguard class.");
    const warnings = [];
    levelWarning(warnings, actor, 20, "Approaching Storm");

    const combat = globalThis.game?.combat;
    const round = Number(data.round ?? (combat?.round ?? 1));
    if (combat?.started && round > 1) {
      warn(warnings, "round", "Approaching Storm only functions during the first Round of a combat.");
    }

    const level = vanguardLevel(actor) ?? 20;
    const bonus = approachingStormBonus(level);

    return {
      warnings,
      title: "Approaching Storm",
      apply(next, receipt) {
        receipt.summary = `${actor.name} adds +${bonus} to Damage dealt during Round 1 of combat.`;
        receipt.result = { damageBonus: bonus, round };
        return {};
      }
    };
  },

  lightspeed(actor, state, data) {
    need(vanguardEnabled(actor), "Lightspeed requires the Vanguard class.");
    const warnings = [];
    levelWarning(warnings, actor, 18, "Lightspeed");

    const combat = globalThis.game?.combat;
    const round = Number(data.round ?? (combat?.round ?? 1));
    if (combat?.started && round > 1) {
      warn(warnings, "round", "Lightspeed only grants a second turn during the first Round of a combat.");
    }

    const initiative = Number(data.initiative ?? 20);
    const secondTurnInit = lightspeedSecondInitiative(initiative);

    return {
      warnings,
      title: "Lightspeed",
      apply(next, receipt) {
        receipt.summary = `${actor.name} gains a second Turn during Round 1 at Initiative ${secondTurnInit} (Initiative ${initiative} - 10).`;
        receipt.result = { firstInitiative: initiative, secondInitiative: secondTurnInit, round };
        return {};
      }
    };
  }
};

vanguardUses.register({
  plans: CORE_PLANS,
  targetKinds: {
    effect: {
      async apply(source, useId, entry, target) {
        const existing = values(target.effects).find(effect => flag(effect, vanguardUses.effectFlag)?.opId === useId && flag(effect, vanguardUses.effectFlag)?.sourceUuid === source.uuid);
        if (existing) return true;
        const item = values(source.items).find(candidate => flag(candidate, "chapterThreeId") === entry.featureId);
        need(item, "Run setup to add this feature Item first.");
        const tag = { ...entry.tag }, expiryActor = tag.expiryActor === "target" ? target : source;
        const inCombat = game.combat?.started && values(game.combat.turns).some(c => c.actor?.uuid === expiryActor.uuid);
        if (["turnStart", "turnEnd", "nextTurnEnd", "currentTurnEnd", "combatEnd"].includes(tag.trigger) && !inCombat) {
          tag.trigger = "manual";
          tag.instructions = `${tag.instructions ?? ""} Outside combat, remove it manually when it ends.`.trim();
        }
        const effect = await applyFeatureTag(source, item, target, tag);
        const updates = { [`flags.ak5e.${vanguardUses.effectFlag}`]: { opId: useId, sourceUuid: source.uuid, ...(entry.meta ?? {}) } };
        if (entry.standardBenefit) {
          updates["flags.ak5e.standardBenefit"] = entry.standardBenefit;
        }
        try { await effect.update(updates); }
        catch (error) { await effect.delete(); throw error; }
        return true;
      },
      async revert(source, useId, _entry, target) {
        const effects = values(target.effects).filter(effect => flag(effect, vanguardUses.effectFlag)?.opId === useId && flag(effect, vanguardUses.effectFlag)?.sourceUuid === source.uuid);
        if (effects.length) await target.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
        return { removed: effects.length };
      },
      preview(_source, receipt, entry, target) {
        const present = values(target?.effects).some(effect => flag(effect, vanguardUses.effectFlag)?.opId === receipt.id);
        return present ? `${entry.name}: removes ${entry.tag?.label ?? "the effect"}.` : `${entry.name}: ${entry.tag?.label ?? "the effect"} is already gone; nothing to remove.`;
      }
    }
  }
});

const rawCommand = vanguardUses.command.bind(vanguardUses);

vanguardUses.command = async function(actor, name, data = {}, operationId) {
  if (name === "useRoll") {
    const state = vanguardUses.state(actor);
    const receipt = state.undo.find(entry => entry.id === data.useId);
    if (receipt && receipt.command === "tipOfTheSpear" && receipt.outcome === undefined) {
      if (receipt.roll === undefined && receipt.formula) {
        const roll = await new Roll(receipt.formula, actor.getRollData?.() ?? {}).evaluate();
        receipt.roll = roll.total;
        await roll.toMessage({
          speaker: ChatMessage.implementation.getSpeaker({ actor }),
          flavor: receipt.rollFlavor ?? receipt.title,
          flags: { ak5e: { [`${vanguardUses.ns}Op`]: `${receipt.id}-dice`, [`${vanguardUses.ns}Actor`]: actor.uuid } }
        });
      }
      const outcome = Number(receipt.roll);
      const targetUuid = receipt.targetUuid;
      const targetName = receipt.targetName;
      const level = vanguardLevel(actor) ?? 1;
      const pb = Math.floor((level - 1) / 4) + 2;
      applyTipOutcomeData(receipt, outcome, actor, targetUuid, targetName, pb, receipt.data ?? {});
      await actor.update({ [`flags.ak5e.${vanguardUses.ns}.undo`]: state.undo });
    }
    return await rawCommand(actor, "useRoll", data, operationId);
  }
  return await rawCommand(actor, name, data, operationId);
};

vanguardUses.execute = async function(actor, name, data = {}, opId) {
  return await vanguardUses.command(actor, name, { confirmed: true, ...data }, opId);
};

vanguardUses.undo = async function(actor, useId) {
  return await vanguardUses.command(actor, "undoUse", { useId });
};

vanguardUses.plan = function(actor, name, data = {}) {
  const planFn = CORE_PLANS[name];
  need(planFn, `Unknown Vanguard plan ${name}.`);
  const state = vanguardUses.state(actor);
  const plan = planFn(actor, state, data);
  if (plan.warnings?.length) {
    requireOverrides(plan.warnings, data.overrides ?? data.overridden);
  }
  return plan;
};
