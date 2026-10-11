/**
 * Heavyshot subclass features (Ch.3 L4308-4388):
 * Weapon Tuning (Custom Job, Exploding Damage <= PB, Heaviest Shot Loading +1 die, Halved Range),
 * Devastator (+1 Crit Range in Normal Range, Pass-through Excess Damage on 0 HP),
 * Savage Shots (PB/LR Bonus Action damage dice rerolls vs Target),
 * Improved Tuning (10th: +1 die damage, +1 die critical),
 * Lethal Weapon (15th: Min die results also explode <= PB),
 * Heartseeker (18th: 1/LR max damage on all dice without rolling).
 * Follows WORKFLOW.md §3.2 and integrates with marksmanUses and resource-pools.mjs.
 */
import {
  MARKSMAN_CLASS_ID, marksmanEnabled, marksmanLevel, marksmanBranch,
  isTargetLocked, isCustomJobWeapon
} from "./marksman-rules.mjs";
import { marksmanUses } from "./marksman-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { definePool, getPool, getPoolDefinition } from "./resource-pools.mjs";
import { need, flag } from "./operation-kernel.mjs";

export const isHeavyshot = actor => marksmanEnabled(actor) && marksmanBranch(actor) === "heavyshot";

export function defineHeavyshotPools() {
  if (!getPoolDefinition("savageShots")) {
    definePool({
      id: "savageShots",
      label: "Savage Shots",
      max: "@prof",
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isHeavyshot(actor) && marksmanLevel(actor) >= 4,
      recovery: [
        { on: "lr", amount: "toMax" }
      ]
    });
  }
  if (!getPoolDefinition("heartseeker")) {
    definePool({
      id: "heartseeker",
      label: "Heartseeker",
      max: 1,
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isHeavyshot(actor) && marksmanLevel(actor) >= 18,
      recovery: [
        { on: "lr", amount: "toMax" }
      ]
    });
  }
}

const levelWarning = (warnings, actor, requiredLevel, name) => {
  const current = marksmanLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${name} is a Heavyshot level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

/* ---------------------------------------------------------------- Heavyshot Plans */

export const HEAVYSHOT_PLANS = {
  tuneWeapon(actor, _state, data) {
    need(isHeavyshot(actor), "Weapon Tuning is a Heavyshot feature.");
    const warnings = [];
    const weaponId = data.weaponId;
    const weapon = actor.items.get(weaponId);
    if (!weapon) {
      warn(warnings, "weapon", "No Heavy Ranged Weapon selected for Weapon Tuning.");
    } else {
      const props = weapon.system?.properties;
      const isHeavy = Boolean(
        props?.has?.("hvy") ||
        (Array.isArray(props) && props.includes("hvy")) ||
        flag(weapon, "heavy")
      );
      const typeVal = String(weapon.system?.type?.value ?? weapon.system?.weaponType ?? "");
      const isRanged = Boolean(
        typeVal.endsWith("R") ||
        typeVal.toLowerCase().includes("ranged") ||
        weapon.system?.type?.classification === "ranged" ||
        weapon.system?.actionType === "rwak" ||
        (Number(weapon.system?.range?.value ?? 0) > 0 && !props?.has?.("reach")) ||
        flag(weapon, "ranged")
      );
      if (!isHeavy || !isRanged) {
        warn(warnings, "properties", `${weapon.name} does not have both the Heavy and Ranged properties.`);
      }
    }

    return {
      warnings,
      title: "Weapon Tuning (Custom Job)",
      async apply(next, receipt) {
        const weaponName = weapon?.name ?? "Weapon";
        const updates = {};
        if (weapon) {
          const normalRange = Number(weapon.system?.range?.value ?? 0);
          const longRange = Number(weapon.system?.range?.long ?? 0);
          const halvedNormal = Math.max(5, Math.floor(normalRange / 2));
          const halvedLong = longRange ? Math.max(5, Math.floor(longRange / 2)) : null;

          await weapon.update({
            "flags.ak5e.customJob": true,
            "flags.ak5e.tunedOriginalRange": { normal: normalRange, long: longRange },
            "system.range.value": halvedNormal,
            ...(halvedLong ? { "system.range.long": halvedLong } : {})
          });
        }
        receipt.summary = `${actor.name} modifies ${weaponName} into a Custom Job: Exploding Damage (up to PB extra dice), Heaviest Shot (+1 die if Loading), and halved range. Only ${actor.name} is proficient.`;
        receipt.result = { weaponId, tuned: true };
        return updates;
      }
    };
  },

  savageShots(actor, _state, _data) {
    need(isHeavyshot(actor), "Savage Shots is a Heavyshot feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Savage Shots");
    const available = resourceValue(actor, { pool: "savageShots" });
    if (available < 1) {
      warn(warnings, "savageShots", "Savage Shots uses exhausted; uses clamp at 0.");
    }

    const combat = globalThis.game?.combat;
    const currentTurnKey = combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : "turn-active";

    return {
      warnings,
      title: "Savage Shots",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "savageShots", amount: 1, label: "Savage Shots" });
        updates["flags.ak5e.marksman.savageShotsActive"] = true;
        updates["flags.ak5e.marksman.savageShotsTurn"] = currentTurnKey;
        receipt.summary = `${actor.name} activates Savage Shots as a Bonus Action: may reroll any damage dice with Custom Job against Target within Normal Range until end of Turn.`;
        receipt.result = { active: true, turnKey: currentTurnKey };
        return updates;
      }
    };
  },

  heartseeker(actor, _state, _data) {
    need(isHeavyshot(actor), "Heartseeker is a Heavyshot feature.");
    const warnings = [];
    levelWarning(warnings, actor, 18, "Heartseeker");
    const available = resourceValue(actor, { pool: "heartseeker" });
    if (available < 1) {
      warn(warnings, "heartseeker", "Heartseeker has already been used; uses clamp at 0.");
    }

    return {
      warnings,
      title: "Heartseeker",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "heartseeker", amount: 1, label: "Heartseeker" });
        updates["flags.ak5e.marksman.heartseekerActive"] = true;
        receipt.summary = `${actor.name} invokes Heartseeker: does not roll damage; each damage die scores its maximum value!`;
        receipt.result = { maximized: true };
        return updates;
      }
    };
  },

  devastatorCleave(actor, _state, data) {
    need(isHeavyshot(actor), "Devastator is a Heavyshot feature.");
    const warnings = [];
    const targetUuid = data.targetUuid;
    const targetName = data.targetName ?? "Secondary Target";
    const excessDamage = Number(data.excessDamage ?? 0);
    const wasLockedTarget = Boolean(data.wasLockedTarget);

    if (!targetUuid) {
      warn(warnings, "target", "No secondary target specified for Devastator cleave.");
    }
    if (excessDamage <= 0) {
      warn(warnings, "excessDamage", "No excess damage reported to punch through.");
    }

    const bonusDieFormula = wasLockedTarget ? (data.damageDieFormula || "1d8") : null;

    return {
      warnings,
      title: "Devastator (Pass-through Cleave)",
      apply(next, receipt) {
        receipt.summary = `${actor.name}'s Custom Job punches through! ${targetName} takes ${excessDamage} excess Damage${wasLockedTarget ? ` + 1 additional die (${bonusDieFormula}) for dropping Target` : ""}.`;
        receipt.result = { targetUuid, excessDamage, wasLockedTarget, bonusDieFormula };
        return {};
      }
    };
  }
};

marksmanUses.register({ plans: HEAVYSHOT_PLANS });

/* ---------------------------------------------------------------- Hooks */

export function heavyshotPreRollAttack(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isHeavyshot(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll) return;

  const weapon = activity.item;
  if (!isCustomJobWeapon(weapon)) return;

  // Devastator (1st level): +1 Critical Range against creature within Normal Range
  const normalRange = Number(weapon?.system?.range?.value ?? 0);
  const targetToken = globalThis.game?.user?.targets?.first?.() ?? null;
  const attackerToken = actor.getActiveTokens?.()?.[0] ?? null;

  let inNormalRange = true;
  if (attackerToken && targetToken && normalRange > 0) {
    const aCenter = attackerToken.center ?? { x: attackerToken.x, y: attackerToken.y };
    const tCenter = targetToken.center ?? { x: targetToken.x, y: targetToken.y };
    const gridSize = globalThis.canvas?.grid?.size ?? 100;
    const gridDistance = globalThis.canvas?.grid?.distance ?? 5;
    const distFt = (Math.hypot(aCenter.x - tCenter.x, aCenter.y - tCenter.y) / gridSize) * gridDistance;
    inNormalRange = distFt <= normalRange;
  }

  if (inNormalRange) {
    roll.options ??= {};
    roll.options.criticalSuccess = Math.min(Number(roll.options.criticalSuccess ?? 20) - 1, 19);
  }
}

export function heavyshotPreRollDamage(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isHeavyshot(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll?.parts) return;

  const weapon = activity.item;
  if (!isCustomJobWeapon(weapon)) return;

  const level = marksmanLevel(actor);
  const isCrit = Boolean(roll.options?.critical);

  // Extract base die size
  const baseFormula = weapon?.system?.damage?.base?.formula || activity.damage?.parts?.[0]?.formula || "1d10";
  const dieMatch = baseFormula.match(/d(\d+)/);
  const faces = dieMatch ? dieMatch[1] : "10";

  // 1. Heaviest Shot: +1 die if Loading
  const isLoading = Boolean(weapon?.system?.properties?.has?.("lod") || flag(weapon, "loading"));
  if (isLoading) {
    roll.parts.push(`1d${faces}`);
  }

  // 2. Improved Tuning (10th level): +1 die of weapon damage
  if (level >= 10) {
    roll.parts.push(`1d${faces}`);
  }

  // 3. Improved Tuning: Custom Criticals (10th level): +1 die on critical hit
  if (level >= 10 && isCrit) {
    roll.parts.push(`1d${faces}`);
  }

  // 4. Heartseeker check: if active, maximize
  const heartseekerActive = flag(actor, "marksman")?.heartseekerActive;
  if (heartseekerActive) {
    roll.options ??= {};
    roll.options.maximize = true;
    if (typeof actor.update === "function") {
      actor.update({ "flags.ak5e.marksman.heartseekerActive": false }).catch(() => {});
    }
  }
}

let installed = false;
export function registerHeavyshotHooks() {
  if (installed) return;
  installed = true;

  defineHeavyshotPools();

  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollAttackV2", heavyshotPreRollAttack);
    Hooks.on("dnd5e.preRollDamageV2", heavyshotPreRollDamage);
  }
}

defineHeavyshotPools();
