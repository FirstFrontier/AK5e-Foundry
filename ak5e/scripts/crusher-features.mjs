/**
 * Guard Subclass: Crusher (Chapter 3: L2633–L2738)
 *
 * 1st Level:
 * - Towering Might:
 *   - Extreme Fortitude: When rolling a Hit Die, roll two dice and discard lowest.
 *   - Maximum Bulk: Hit Point maximum increases by 3 + 3 per level thereafter (3 * level).
 * - Crushing Blows:
 *   - Death's Passing: Heavy Melee Weapon attack miss deals half damage as Thunder Damage.
 *   - Heavy Metal: Heavy Melee Weapon damage increased by 1 die.
 *   - Singular Strike: Attack Action limited to 1 attack; additional attacks increase damage by
 *     weapon's base damage + STR modifier + weapon magical bonus per additional attack.
 *
 * 4th Level:
 * - Foecrusher:
 *   - Uses: @prof per Short Rest.
 *   - Riders: Staggering Strike (Speed halved until next turn end),
 *             Dazing Strike (Dazed condition until next turn end),
 *             Renewing Strike (Hit Die + CON mod HP recovered),
 *             Smashing Strike (Pushed 15 ft, advance up to half speed without OA).
 *   - Press the Attack: Overbear (2 Aggression):
 *     Adds 1d10 damage and second distinct Foecrusher effect without extra Foecrusher spend.
 *
 * 10th Level:
 * - Divided when Conquered:
 *   - Additional Reach: Heavy Melee Weapons gain Reach property.
 *   - Horde Breaker: Excess damage on 0 HP repeats against creature within Reach & 10 ft without rolling damage.
 *
 * 13th Level:
 * - Heroic Blow:
 *   - Spend 1 Foecrusher use: reroll damage dice, gain Crush (2 * PB).
 *
 * 17th Level:
 * - Heroic Killing Blow:
 *   - Execution: Target reduced to <50 HP by Heroic Blow dies instantly.
 *   - Realmrending Blow: Heroic Blows ignore Resistance to Physical Damage.
 */

import { GUARD_CLASS_ID, guardEnabled, guardLevel, guardBranch } from "./guard-rules.mjs";
import { guardUses } from "./guard-uses.mjs";
import { defineGuardPools } from "./guard-features.mjs";
import { definePool, getPoolDefinition } from "./resource-pools.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { need } from "./operation-kernel.mjs";

const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];

export function isCrusher(actor) {
  if (!guardEnabled(actor)) return false;
  if (guardBranch(actor) === "crusher") return true;
  return Array.from(actor.items?.values?.() ?? []).some(item =>
    flag(item, "chapterThreeId")?.startsWith("subclass-feature-guard-crusher")
  );
}

export function defineCrusherPools() {
  defineGuardPools();
  if (!getPoolDefinition("foecrusher")) {
    definePool({
      id: "foecrusher",
      label: "Foecrusher",
      max: "@prof",
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isCrusher(actor) && (guardLevel(actor) ?? 1) >= 4,
      recovery: [{ on: "sr", amount: "toMax" }, { on: "lr", amount: "toMax" }]
    });
  }
}

const levelWarning = (warnings, actor, requiredLevel, featureName) => {
  const current = guardLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${featureName} is a Crusher level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

/* ---------------------------------------------------------------- Calculations & Helpers */

export function isHeavyMeleeWeapon(item) {
  if (!item || item.type !== "weapon") return false;
  const props = item.system?.properties;
  const isHeavy = props instanceof Set
    ? (props.has("hvy") || props.has("heavy"))
    : Array.isArray(props)
      ? (props.includes("hvy") || props.includes("heavy"))
      : Boolean(item.system?.properties?.hvy);
  const actionType = item.system?.actionType;
  const weaponType = String(item.system?.type?.value ?? item.system?.weaponType ?? "");
  const isMelee = actionType === "mwak" || weaponType.toLowerCase().includes("melee");
  return Boolean(isHeavy && (isMelee || !actionType));
}

export function parseBaseDie(formula = "") {
  const match = String(formula).match(/(\d+)?d(\d+)/i);
  if (!match) return "1d6";
  return `1d${match[2]}`;
}

export function singularStrikeBonus({ attacksCount = 1, weaponDice = "2d6", strMod = 0, weaponBonus = 0 } = {}) {
  const additional = Math.max(0, attacksCount - 1);
  if (additional === 0) return { additionalAttacks: 0, bonusFormula: "0", totalMultiplier: 1 };
  const parts = [];
  for (let i = 0; i < additional; i++) {
    parts.push(weaponDice);
    const flat = strMod + weaponBonus;
    if (flat !== 0) parts.push(String(flat));
  }
  return {
    additionalAttacks: additional,
    bonusFormula: parts.join(" + "),
    totalMultiplier: attacksCount
  };
}

export function deathPassingDamage(totalDamage = 0) {
  return Math.floor(Math.max(0, Number(totalDamage)) / 2);
}

export function heroicBlowCrushValue(actor, existingCrush = 0) {
  const pb = Number(actor?.system?.attributes?.prof ?? 2);
  return Number(existingCrush) + 2 * pb;
}

export function checkCrusherExecution(targetHp, isHeroicBlow = true) {
  return Boolean(isHeroicBlow && Number(targetHp) < 50);
}

/* ---------------------------------------------------------------- Crusher Plans */

export const CRUSHER_PLANS = {
  foecrusher(actor, _state, data) {
    need(isCrusher(actor), "Foecrusher is a Crusher feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Foecrusher");

    const available = resourceValue(actor, { pool: "foecrusher" });
    if (available < 1) {
      warn(warnings, "foecrusher", `1 use of Foecrusher needed and ${available} remain.`);
    }

    const rider = String(data.rider ?? "staggering").toLowerCase();
    const validRiders = ["staggering", "dazing", "renewing", "smashing"];
    need(validRiders.includes(rider), `Choose a valid Foecrusher strike: ${validRiders.join(", ")}.`);

    const conMod = Number(actor.system?.abilities?.con?.mod ?? 0);
    const hitDieSize = actor.system?.attributes?.hd?.denom ?? 10;
    const renewFormula = `1d${hitDieSize} + ${conMod}`;

    return {
      warnings,
      title: `Foecrusher: ${rider.charAt(0).toUpperCase() + rider.slice(1)} Strike`,
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "foecrusher", amount: 1, label: "Foecrusher" });
        receipt.result = { rider };

        if (rider === "renewing") {
          receipt.formula = renewFormula;
          receipt.rollLabel = `Renewing Strike Healing (${renewFormula})`;
          receipt.summary = `${actor.name} strikes with Foecrusher (Renewing Strike), rolling a Hit Die + CON mod to recover Hit Points.`;
          receipt.targets = [{ uuid: actor.uuid, name: actor.name, kind: "heal", ready: false, healingSource: "classFeature" }];
        } else if (rider === "staggering") {
          receipt.summary = `${actor.name} strikes with Foecrusher (Staggering Strike); target's Speed is halved until end of its next Turn.`;
        } else if (rider === "dazing") {
          receipt.summary = `${actor.name} strikes with Foecrusher (Dazing Strike); target suffers Dazed condition until end of its next Turn.`;
        } else if (rider === "smashing") {
          receipt.summary = `${actor.name} strikes with Foecrusher (Smashing Strike); target is pushed 15 ft and ${actor.name} may advance up to half Speed without provoking Opportunity Attacks.`;
        }

        return updates;
      },
      validateTarget(actor, receipt, entry, target) {
        return target?.uuid === actor.uuid && entry?.kind === "heal";
      }
    };
  },

  overbear(actor, _state, data) {
    need(isCrusher(actor), "Press the Attack: Overbear is a Crusher feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Press the Attack: Overbear");

    const availableAggression = resourceValue(actor, { pool: "aggression" });
    if (availableAggression < 2) {
      warn(warnings, "aggression", `2 Aggression needed and ${availableAggression} remain.`);
    }

    const primaryRider = String(data.primaryRider ?? "staggering").toLowerCase();
    const secondaryRider = String(data.secondaryRider ?? "dazing").toLowerCase();
    need(primaryRider !== secondaryRider, "Secondary Foecrusher effect must be distinct from the primary effect.");

    return {
      warnings,
      title: "Press the Attack: Overbear",
      rolls: [
        { id: "overbearDamage", label: "Overbear Bonus Damage", formula: "1d10" }
      ],
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 2, label: "Aggression" });
        receipt.formula = "1d10";
        receipt.rollLabel = "Overbear Damage (+1d10)";
        receipt.summary = `${actor.name} uses Press the Attack: Overbear on a Foecrusher (+1d10 damage), applying both ${primaryRider} and ${secondaryRider} strikes without additional Foecrusher spend.`;
        receipt.result = { aggressionSpent: 2, bonusDice: "1d10", primaryRider, secondaryRider };
        return updates;
      }
    };
  },

  deathPassing(actor, _state, data) {
    need(isCrusher(actor), "Death's Passing is a Crusher feature.");
    const damageTotal = Number(data.damageTotal ?? 0);
    const halfThunder = deathPassingDamage(damageTotal);

    return {
      warnings: [],
      title: "Death's Passing",
      apply(next, receipt) {
        receipt.summary = `${actor.name} misses with a Heavy Melee Weapon Attack; target still takes ${halfThunder} Thunder Damage (half of ${damageTotal}).`;
        receipt.result = { originalDamage: damageTotal, thunderDamage: halfThunder, targetUuid: data.targetUuid ?? null };
        return {};
      }
    };
  },

  hordeBreaker(actor, _state, data) {
    need(isCrusher(actor), "Horde Breaker is a Crusher feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Horde Breaker");

    const excessDamage = Math.max(0, Number(data.excessDamage ?? 0));
    need(excessDamage > 0, "Horde Breaker requires excess damage from the reducing attack.");

    return {
      warnings,
      title: "Horde Breaker",
      apply(next, receipt) {
        receipt.summary = `${actor.name} chains a melee attack to an adjacent foe within Reach, dealing ${excessDamage} excess Damage without rolling.`;
        receipt.result = { damage: excessDamage, targetUuid: data.targetUuid ?? null };
        return {};
      }
    };
  },

  heroicBlow(actor, _state, data) {
    need(isCrusher(actor), "Heroic Blow is a Crusher feature.");
    const warnings = [];
    levelWarning(warnings, actor, 13, "Heroic Blow");

    const available = resourceValue(actor, { pool: "foecrusher" });
    if (available < 1) {
      warn(warnings, "foecrusher", `1 use of Foecrusher needed and ${available} remain.`);
    }

    const pb = Number(actor.system?.attributes?.prof ?? 2);
    const existingCrush = Number(data.existingCrush ?? 0);
    const crushValue = heroicBlowCrushValue(actor, existingCrush);

    return {
      warnings,
      title: "Heroic Blow",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "foecrusher", amount: 1, label: "Foecrusher" });
        receipt.summary = `${actor.name} makes a Heroic Blow: may reroll any damage dice (using either result) and gains Crush (${crushValue}).`;
        receipt.result = { foecrusherSpent: 1, crushValue, allowReroll: true };
        return updates;
      }
    };
  },

  heroicKillingBlow(actor, _state, data) {
    need(isCrusher(actor), "Heroic Killing Blow is a Crusher feature.");
    const warnings = [];
    levelWarning(warnings, actor, 17, "Heroic Killing Blow");

    const targetHp = Number(data.targetHp ?? 100);
    const executed = checkCrusherExecution(targetHp, true);

    return {
      warnings,
      title: "Heroic Killing Blow",
      apply(next, receipt) {
        receipt.summary = `${actor.name}'s Heroic Blow ignores Resistance to Physical Damage.${executed ? ` Target reduced to ${targetHp} HP (<50 HP) dies instantly from Execution!` : ""}`;
        receipt.result = { targetHp, executed, ignoresPhysicalResistance: true };
        return {};
      }
    };
  }
};

guardUses.register({ plans: CRUSHER_PLANS });

/* ---------------------------------------------------------------- Heavy Metal Roll Hook */

export function crusherPreRollDamage(config, _dialog, _message) {
  const activity = config?.subject;
  const actor = activity?.actor;
  if (!actor || !isCrusher(actor)) return;

  const item = activity?.item;
  if (!isHeavyMeleeWeapon(item)) return;

  // Heavy Metal adds 1 die to the damage of Heavy Melee weapons
  const roll = config.rolls?.[0];
  if (!roll) return;

  const baseDie = parseBaseDie(roll.formula ?? item.system?.damage?.base?.formula ?? "1d10");
  roll.parts = Array.isArray(roll.parts) ? [...roll.parts, baseDie] : [baseDie];
}

export function registerCrusherHooks() {
  defineCrusherPools();
  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollDamageV2", crusherPreRollDamage);
  }
}

defineCrusherPools();
