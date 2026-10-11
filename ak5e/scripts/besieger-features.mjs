/**
 * Besieger subclass features (Ch.3 L4040-4100):
 * Siege Mode (Speed 0, 20-ft disadvantage, +1d8, Crush(2*PB), ignore Brace/Long Range),
 * Large Target (Advantage vs Large+ Target, +1 die damage vs Large+),
 * Deliberate, Efficient (1 attack, +1d8, ignore Physical DR/Resistance),
 * Siege Bolt (100 ft, 5d8 piercing DOT over 3 turns, ignore DR/Resistance),
 * Goliath's Bane (Con save on hit in Siege Mode or Stunned),
 * Godpiercer (replaces Siege Mode / Deliberate Efficient +1d8 bonuses with 8 HP loss per hit).
 * Follows WORKFLOW.md §3.2 and integrates with marksmanUses and resource-pools.mjs.
 */
import {
  MARKSMAN_CLASS_ID, marksmanEnabled, marksmanLevel, marksmanBranch,
  martialDC, isTargetLocked
} from "./marksman-rules.mjs";
import { marksmanUses } from "./marksman-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { definePool, getPool, getPoolDefinition } from "./resource-pools.mjs";
import { need, flag } from "./operation-kernel.mjs";

export const isBesieger = actor => marksmanEnabled(actor) && marksmanBranch(actor) === "besieger";

export function defineBesiegerPools() {
  if (!getPoolDefinition("siegeBolt")) {
    definePool({
      id: "siegeBolt",
      label: "Siege Bolt",
      max: 1,
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isBesieger(actor) && marksmanLevel(actor) >= 10,
      recovery: [
        { on: "lr", amount: "toMax" }
      ]
    });
  }
  if (!getPoolDefinition("goliathsBane")) {
    definePool({
      id: "goliathsBane",
      label: "Goliath's Bane",
      max: "@prof",
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isBesieger(actor) && marksmanLevel(actor) >= 15,
      recovery: [
        { on: "lr", amount: "toMax" }
      ]
    });
  }
}

const levelWarning = (warnings, actor, requiredLevel, name) => {
  const current = marksmanLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${name} is a Besieger level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

export function inSiegeMode(actor) {
  if (!isBesieger(actor)) return false;
  return Boolean(flag(actor, "marksman")?.siegeMode);
}

/** Check whether creature size is Large or larger (lg, huge, grg). */
export function isLargeOrLarger(targetActor) {
  if (!targetActor) return false;
  const size = targetActor.system?.traits?.size ?? "med";
  return ["lg", "huge", "grg"].includes(size);
}

/* ---------------------------------------------------------------- Besieger Plans */

export const BESIEGER_PLANS = {
  siegeMode(actor, _state, _data) {
    need(isBesieger(actor), "Siege Mode is a Besieger feature.");
    const combat = globalThis.game?.combat;
    const currentTurnKey = combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
    const pb = Number(actor.system?.attributes?.prof ?? 2);
    const crushBonus = 2 * pb;

    return {
      warnings: [],
      title: "Siege Mode",
      apply(next, receipt) {
        receipt.summary = `${actor.name} enters Siege Mode until end of Turn: Speed reduced to 0, +1d8 Damage (or Godpiercer 8 HP loss), Crush(+${crushBonus}), ignores Brace and Long Range disadvantage.`;
        receipt.result = { siegeMode: true, turnKey: currentTurnKey, crushBonus };
        return {
          "flags.ak5e.marksman.siegeMode": true,
          "flags.ak5e.marksman.siegeModeTurn": currentTurnKey
        };
      }
    };
  },

  endSiegeMode(actor, _state, _data) {
    need(isBesieger(actor), "Siege Mode is a Besieger feature.");
    return {
      warnings: [],
      title: "End Siege Mode",
      apply(next, receipt) {
        receipt.summary = `${actor.name} ends Siege Mode.`;
        return {
          "flags.ak5e.marksman.siegeMode": false
        };
      }
    };
  },

  deliberateEfficient(actor, _state, _data) {
    need(isBesieger(actor), "Deliberate, Efficient is a Besieger feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Deliberate, Efficient");
    if (!inSiegeMode(actor)) {
      warn(warnings, "siegeMode", "Deliberate, Efficient requires active Siege Mode.");
    }

    return {
      warnings,
      title: "Deliberate, Efficient",
      apply(next, receipt) {
        receipt.summary = `${actor.name} makes a single Attack this Action: +1d8 Damage (or Godpiercer 8 HP loss) and ignores Physical Resistances and DR.`;
        receipt.result = { deliberateEfficient: true };
        return {
          "flags.ak5e.marksman.deliberateEfficientActive": true
        };
      }
    };
  },

  siegeBolt(actor, _state, data) {
    need(isBesieger(actor), "Siege Bolt is a Besieger feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Siege Bolt");
    const available = resourceValue(actor, { pool: "siegeBolt" });
    if (available < 1) {
      warn(warnings, "siegeBolt", "Siege Bolt has already been used; uses clamp at 0.");
    }

    const targetName = data.targetName ?? "Target";
    const dc = martialDC(actor);

    return {
      warnings,
      title: "Siege Bolt",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "siegeBolt", amount: 1, label: "Siege Bolt" });
        receipt.summary = `${actor.name} fires a Siege Bolt at ${targetName} (DC ${dc} Dex save, 5d8 Piercing immediately; failure repeats for 2 turns; ignores Piercing DR/Resistance).`;
        receipt.result = { dc, damageFormula: "5d8", ignoresDR: true };
        return updates;
      }
    };
  },

  goliathsBane(actor, _state, data) {
    need(isBesieger(actor), "Goliath's Bane is a Besieger feature.");
    const warnings = [];
    levelWarning(warnings, actor, 15, "Goliath's Bane");
    if (!inSiegeMode(actor)) {
      warn(warnings, "siegeMode", "Goliath's Bane requires active Siege Mode.");
    }
    const available = resourceValue(actor, { pool: "goliathsBane" });
    if (available < 1) {
      warn(warnings, "goliathsBane", "Goliath's Bane uses exhausted; uses clamp at 0.");
    }

    const targetName = data.targetName ?? "Target";
    const dc = martialDC(actor);

    return {
      warnings,
      title: "Goliath's Bane",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "goliathsBane", amount: 1, label: "Goliath's Bane" });
        receipt.summary = `${actor.name} forces ${targetName} to make a DC ${dc} Constitution Save or be Stunned until end of their next Turn.`;
        receipt.result = { dc, condition: "stunned" };
        return updates;
      }
    };
  }
};

marksmanUses.register({ plans: BESIEGER_PLANS });

/* ---------------------------------------------------------------- Hooks */

export function besiegerPreRollAttack(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isBesieger(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll) return;

  const targetToken = globalThis.game?.user?.targets?.first?.() ?? null;
  const targetActor = targetToken?.actor ?? null;
  const targetUuid = targetToken?.document?.uuid ?? targetActor?.uuid ?? null;
  const attackerToken = actor.getActiveTokens?.()?.[0] ?? null;

  // Siege Mode attack roll modifications
  if (inSiegeMode(actor)) {
    // Within 20 ft: Disadvantage on Ranged Weapon Attacks
    if (activity.actionType === "rwak" && attackerToken && targetToken) {
      const aCenter = attackerToken.center ?? { x: attackerToken.x, y: attackerToken.y };
      const tCenter = targetToken.center ?? { x: targetToken.x, y: targetToken.y };
      const gridSize = globalThis.canvas?.grid?.size ?? 100;
      const gridDist = globalThis.canvas?.grid?.distance ?? 5;
      const distFt = (Math.hypot(aCenter.x - tCenter.x, aCenter.y - tCenter.y) / gridSize) * gridDist;
      if (distFt <= 20) {
        roll.options ??= {};
        roll.options.disadvantage = true;
      }
    }
  }

  // Large Target: Between the Scales (Advantage vs Target Lock if Large or larger)
  if (targetUuid && isTargetLocked(actor, targetUuid) && isLargeOrLarger(targetActor)) {
    roll.options ??= {};
    roll.options.advantage = true;
  }
}

export function besiegerPreRollDamage(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isBesieger(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll?.parts) return;

  const targetToken = globalThis.game?.user?.targets?.first?.() ?? null;
  const targetActor = targetToken?.actor ?? null;
  const level = marksmanLevel(actor);
  const isGodpiercer = level >= 18;

  // Large Target: Hide Piercer (+1 additional die of Damage vs Large or larger)
  if (isLargeOrLarger(targetActor)) {
    const weapon = activity.item;
    const formula = weapon?.system?.damage?.base?.formula || activity.damage?.parts?.[0]?.formula || "1d8";
    const dieMatch = formula.match(/d(\d+)/);
    const faces = dieMatch ? dieMatch[1] : "8";
    roll.parts.push(`1d${faces}`);
  }

  // Siege Mode and Deliberate, Efficient damage modifications
  if (inSiegeMode(actor)) {
    if (!isGodpiercer) {
      // Prior to 18th level: +1d8 from Siege Mode
      roll.parts.push("1d8");

      // Deliberate, Efficient: +1d8
      if (flag(actor, "marksman")?.deliberateEfficientActive) {
        roll.parts.push("1d8");
      }
    } else {
      // 18th level Godpiercer: no additional damage dice! Instead causes 8 HP loss per hit!
      // Log note on roll options
      roll.options ??= {};
      roll.options.godpiercerHpLoss = (flag(actor, "marksman")?.deliberateEfficientActive) ? 16 : 8;
    }
  }
}

let installed = false;
export function registerBesiegerHooks() {
  if (installed) return;
  installed = true;

  defineBesiegerPools();

  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollAttackV2", besiegerPreRollAttack);
    Hooks.on("dnd5e.preRollDamageV2", besiegerPreRollDamage);
  }
}

defineBesiegerPools();
