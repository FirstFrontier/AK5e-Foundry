/**
 * Hunter subclass features (Ch.3 L4393-4457):
 * Empowered Shots (Charges pool 2/4/6, Action recharge, SR/LR, free first option vs Target),
 * Energy Retention (+10 ft Speed per Charge expended this Turn),
 * Enhanced Empowered Shots (Concussive, Dazing, Fragmentation, Seeking, Double Up),
 * Railgun (10th: 100-ft line, 2d6 Force per Charge, Dex save vs Martial DC, 1/LR),
 * Ultimate Empowered Shots (15th: upgrades all options),
 * Let the Light In (18th: Action 1/LR, refill Charges, 1-min stance: Target Lock each turn, BA charge refill).
 * Follows WORKFLOW.md §3.2 and integrates with marksmanUses and resource-pools.mjs.
 */
import {
  MARKSMAN_CLASS_ID, marksmanEnabled, marksmanLevel, marksmanBranch,
  martialDC, isTargetLocked, hunterMaxCharges, HUNTER_CHARGES_MAX
} from "./marksman-rules.mjs";
import { marksmanUses } from "./marksman-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { definePool, getPool, getPoolDefinition, refundPool } from "./resource-pools.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";
import { need, flag } from "./operation-kernel.mjs";

export const isHunter = actor => marksmanEnabled(actor) && marksmanBranch(actor) === "hunter";

export function defineHunterPools() {
  if (!getPoolDefinition("hunterCharges")) {
    definePool({
      id: "hunterCharges",
      label: "Hunter Charges",
      max: HUNTER_CHARGES_MAX,
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isHunter(actor),
      recovery: [
        { on: "sr", amount: "toMax" },
        { on: "lr", amount: "toMax" }
      ]
    });
  }
  if (!getPoolDefinition("railgun")) {
    definePool({
      id: "railgun",
      label: "Railgun",
      max: 1,
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isHunter(actor) && marksmanLevel(actor) >= 10,
      recovery: [
        { on: "lr", amount: "toMax" }
      ]
    });
  }
  if (!getPoolDefinition("letTheLightIn")) {
    definePool({
      id: "letTheLightIn",
      label: "Let the Light In",
      max: 1,
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isHunter(actor) && marksmanLevel(actor) >= 18,
      recovery: [
        { on: "lr", amount: "toMax" }
      ]
    });
  }
}

const levelWarning = (warnings, actor, requiredLevel, name) => {
  const current = marksmanLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${name} is a Hunter level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

export function inLetTheLightIn(actor) {
  if (!isHunter(actor)) return false;
  return Boolean(flag(actor, "marksman")?.letTheLightInActive);
}

/* ---------------------------------------------------------------- Hunter Plans */

export const HUNTER_PLANS = {
  regainCharges(actor, _state, _data) {
    need(isHunter(actor), "Regaining Charges is a Hunter feature.");
    const max = hunterMaxCharges(actor);
    const pool = getPool(actor, "hunterCharges");
    const current = pool?.value ?? 0;
    const isBA = inLetTheLightIn(actor);

    return {
      warnings: [],
      title: isBA ? "Regain Charges (Bonus Action - Let the Light In)" : "Regain Charges (Action)",
      apply(next, receipt) {
        (receipt.resources ??= []).push({ pool: "hunterCharges", path: "flags.ak5e.resourcePools.hunterCharges.value", before: current, after: max, max, label: "Hunter Charges" });
        receipt.summary = `${actor.name} regains all expended Hunter Charges (${max}/${max}) as ${isBA ? "a Bonus Action" : "an Action"}.`;
        receipt.result = { charges: max };
        return {
          "flags.ak5e.resourcePools.hunterCharges.value": max
        };
      }
    };
  },

  empoweredShot(actor, _state, data) {
    need(isHunter(actor), "Empowered Shots is a Hunter feature.");
    const warnings = [];
    const level = marksmanLevel(actor);
    const isUltimate = level >= 15;
    const selectedOptions = Array.isArray(data.options) ? data.options : [data.option || "piercing"];

    if (level < 4 && selectedOptions.some(opt => opt !== "piercing")) {
      warn(warnings, "options", "Options other than Piercing Shot require Hunter 4th level.");
    }
    if (selectedOptions.length > 1 && level < 4) {
      warn(warnings, "doubleUp", "Applying multiple Empowered Shot options (Double Up) requires Hunter 4th level.");
    }

    const targetUuid = data.targetUuid;
    const isLockedTarget = Boolean(data.isTarget || (targetUuid && isTargetLocked(actor, targetUuid)));

    // Cost calculation: 1 charge per option, minus 1 free option if attacking locked Target
    let cost = selectedOptions.length;
    let freeUsed = false;
    if (isLockedTarget && cost > 0) {
      cost = Math.max(0, cost - 1);
      freeUsed = true;
    }

    const available = resourceValue(actor, { pool: "hunterCharges" });
    if (available < cost) {
      warn(warnings, "hunterCharges", `Hunter Charges short by ${cost - available}; uses clamp at 0.`);
    }

    const mDC = martialDC(actor);
    const effects = [];

    for (const opt of selectedOptions) {
      if (opt === "piercing") {
        effects.push(isUltimate ? "Piercing Shot: +2d8 Force Damage" : "Piercing Shot: +1d8 Piercing Damage");
      } else if (opt === "concussive") {
        effects.push(isUltimate
          ? `Concussive Shot: DC ${mDC} STR Save or pushed 10 ft away AND speed halved until end of next Turn`
          : `Concussive Shot: DC ${mDC} STR Save or pushed 10 ft away`);
      } else if (opt === "dazing") {
        effects.push(isUltimate
          ? `Dazing Shot: DC ${mDC} CON Save or Dazed AND Blinded until end of next Turn`
          : `Dazing Shot: DC ${mDC} CON Save or Dazed until end of next Turn`);
      } else if (opt === "fragmentation") {
        effects.push(isUltimate
          ? "Fragmentation Shot: Creatures within 10 ft take 1d12 Thunder Damage"
          : "Fragmentation Shot: Creatures behind target within 10 ft take 1d8 Thunder Damage");
      } else if (opt === "seeking") {
        effects.push(isUltimate ? "Seeking Shot: +2d4 to Attack Roll" : "Seeking Shot: +1d6 to Attack Roll");
      }
    }

    return {
      warnings,
      title: "Empowered Shot",
      apply(next, receipt) {
        const updates = cost > 0
          ? spendResource(actor, receipt, { pool: "hunterCharges", amount: cost, label: "Hunter Charges" })
          : {};

        const currentExpended = Number(flag(actor, "marksman")?.chargesExpendedThisTurn ?? 0);
        updates["flags.ak5e.marksman.chargesExpendedThisTurn"] = currentExpended + cost;

        // Save active shot modifiers for attack/damage roll hooks
        updates["flags.ak5e.marksman.activeEmpoweredShot"] = {
          options: selectedOptions,
          isUltimate,
          seekingBonus: selectedOptions.includes("seeking") ? (isUltimate ? "2d4" : "1d6") : null,
          piercingBonus: selectedOptions.includes("piercing") ? (isUltimate ? "2d8" : "1d8") : null,
          piercingType: isUltimate ? "force" : "piercing"
        };

        receipt.summary = `${actor.name} unleashes an Empowered Shot (${selectedOptions.join(", ")}; spent ${cost} Charge${cost === 1 ? "" : "s"}${freeUsed ? ", first option free vs Target" : ""}):\n• ${effects.join("\n• ")}`;
        receipt.result = { options: selectedOptions, cost, freeUsed, isUltimate };
        return updates;
      }
    };
  },

  railgun(actor, _state, data) {
    need(isHunter(actor), "Railgun is a Hunter feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Railgun");
    const available = resourceValue(actor, { pool: "railgun" });
    if (available < 1) {
      warn(warnings, "railgun", "Railgun has already been used; uses clamp at 0.");
    }

    const currentCharges = resourceValue(actor, { pool: "hunterCharges" });
    const chargesToSpend = Math.max(1, Math.min(Number(data.charges ?? currentCharges), currentCharges));
    if (currentCharges < chargesToSpend) {
      warn(warnings, "hunterCharges", `Insufficient Charges for Railgun; spending available.`);
    }

    const mDC = martialDC(actor);
    const diceCount = chargesToSpend * 2;
    const damageFormula = `${diceCount}d6`;

    return {
      warnings,
      title: "Railgun",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "railgun", amount: 1, label: "Railgun" });
        if (chargesToSpend > 0) {
          Object.assign(updates, spendResource(actor, receipt, { pool: "hunterCharges", amount: chargesToSpend, label: "Hunter Charges" }));
        }

        const currentExpended = Number(flag(actor, "marksman")?.chargesExpendedThisTurn ?? 0);
        updates["flags.ak5e.marksman.chargesExpendedThisTurn"] = currentExpended + chargesToSpend;

        receipt.summary = `${actor.name} fires a Railgun line (100 ft long, 5 ft wide; spent ${chargesToSpend} Charges): DC ${mDC} DEX Save for each Creature, taking ${damageFormula} Force Damage (half on success).`;
        receipt.result = { chargesSpent: chargesToSpend, damageFormula, dc: mDC };
        return updates;
      }
    };
  },

  letTheLightIn(actor, _state, _data) {
    need(isHunter(actor), "Let the Light In is a Hunter feature.");
    const warnings = [];
    levelWarning(warnings, actor, 18, "Let the Light In");
    const available = resourceValue(actor, { pool: "letTheLightIn" });
    if (available < 1) {
      warn(warnings, "letTheLightIn", "Let the Light In has already been used; uses clamp at 0.");
    }

    const maxCharges = hunterMaxCharges(actor);
    const currentCharges = resourceValue(actor, { pool: "hunterCharges" });

    return {
      warnings,
      title: "Let the Light In",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "letTheLightIn", amount: 1, label: "Let the Light In" });
        updates["flags.ak5e.marksman.letTheLightInActive"] = true;

        (receipt.resources ??= []).push({ pool: "hunterCharges", path: "flags.ak5e.resourcePools.hunterCharges.value", before: currentCharges, after: maxCharges, max: maxCharges, label: "Hunter Charges" });
        updates["flags.ak5e.resourcePools.hunterCharges.value"] = maxCharges;

        receipt.summary = `${actor.name} enters Let the Light In for 1 minute: all Charges restored, Target Lock regained at start of each Turn, and Charges can be regained as a Bonus Action.`;
        receipt.result = { active: true };
        return updates;
      }
    };
  }
};

marksmanUses.register({ plans: HUNTER_PLANS });

/* ---------------------------------------------------------------- Hooks */

export function hunterPreRollAttack(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isHunter(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll) return;

  const shot = flag(actor, "marksman")?.activeEmpoweredShot;
  if (shot?.seekingBonus) {
    roll.parts ??= [];
    roll.parts.push(shot.seekingBonus);
  }
}

export function hunterPreRollDamage(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isHunter(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll?.parts) return;

  const shot = flag(actor, "marksman")?.activeEmpoweredShot;
  if (shot?.piercingBonus) {
    roll.parts.push(shot.piercingBonus);
    // Clear active shot once applied
    actor.update({ "flags.ak5e.marksman.activeEmpoweredShot": null }).catch(() => {});
  }
}

let installed = false;
export function registerHunterHooks() {
  if (installed) return;
  installed = true;

  defineHunterPools();

  // Let the Light In: regain Target Lock at turn start if active
  onAk5eEvent("turnStart", async actor => {
    if (!isHunter(actor)) return;
    if (inLetTheLightIn(actor)) {
      const lock = getPool(actor, "targetLock");
      if (lock && lock.value < lock.max) {
        await refundPool(actor, "targetLock", 1, { reason: "Let the Light In Turn Start" });
      }
    }
  });

  // Energy Retention: reset expended charges on turn end
  onAk5eEvent("turnEnd", async actor => {
    if (!isHunter(actor)) return;
    if (flag(actor, "marksman")?.chargesExpendedThisTurn) {
      await actor.update({ "flags.ak5e.marksman.chargesExpendedThisTurn": 0 });
    }
  });

  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollAttackV2", hunterPreRollAttack);
    Hooks.on("dnd5e.preRollDamageV2", hunterPreRollDamage);
  }
}

defineHunterPools();
