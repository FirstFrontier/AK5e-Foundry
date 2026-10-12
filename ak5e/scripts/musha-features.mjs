/**
 * Musha subclass features (Ch. 3 L3252-3325):
 * Tenacity (Nothing to Lose: bonus melee attacks at <=50% and <=10% HP, Soloblade: 2d6/2d8/2d10 heal on hit, Stand Alone: outside heal -> THP),
 * Enduring Resolve (Wisdom save proficiency, Not Yet: escalating DC Wisdom save on drop to 0 HP),
 * Blood Price (4th Level: 2d8 unreducible self-damage for Center Oneself, Dig Deep, Iai, Ichimonji),
 * Warrior Spirit (10th Level: Go Forth reaction move, Retaliator Press the Attack 2 Aggression),
 * Found Alongside Death (13th Level: Greater Blood Price 4d8, Living on the Edge AC/saves bonus),
 * To Laugh at Death (17th Level: Not Yet DC resets at max HP, survives outright kill).
 * Follows WORKFLOW.md §3.2 and integrates with guardUses and resource-pools.mjs.
 */
import {
  GUARD_CLASS_ID, guardEnabled, guardLevel, guardBranch, martialDC
} from "./guard-rules.mjs";
import { guardUses } from "./guard-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { definePool, getPool, getPoolDefinition, refundPool } from "./resource-pools.mjs";
import { spendReaction, getReactions, refundReaction, onAk5eEvent } from "./trigger-events.mjs";
import { need, values, flag } from "./operation-kernel.mjs";

export const isMusha = actor => Boolean(guardEnabled(actor) && guardBranch(actor) === "musha");

/**
 * Returns number of bonus melee weapon attacks allowed by Nothing to Lose (Ch. 3 L3258).
 * <= 50% HP: 1 attack.
 * <= 10% HP: 2 attacks.
 * > 50% HP: 0 attacks.
 */
export function getNothingToLoseAttacks(actor) {
  if (!isMusha(actor)) return 0;
  const hp = actor?.system?.attributes?.hp;
  if (!hp || typeof hp.max !== "number" || hp.max <= 0) return 0;
  const current = Number(hp.value ?? 0);
  const max = Number(hp.max);
  if (current <= Math.floor(max * 0.10)) return 2;
  if (current <= Math.floor(max * 0.50)) return 1;
  return 0;
}

/**
 * Soloblade healing die size based on Guard level (Ch. 3 L3260).
 * 1st-6th: 2d6
 * 7th-13th: 2d8
 * 14th+: 2d10
 */
export function solobladeFormula(actor) {
  const level = guardLevel(actor) ?? 1;
  if (level >= 14) return "2d10";
  if (level >= 7) return "2d8";
  return "2d6";
}

/**
 * Living on the Edge AC and saving throw bonus (Ch. 3 L3310, 13th Level).
 * <= 50% HP: ceil(PB / 2)
 * <= 10% HP: PB
 * > 50% HP or level < 13: 0
 */
export function livingOnTheEdgeBonus(actor) {
  if (!isMusha(actor)) return 0;
  const level = guardLevel(actor) ?? 1;
  if (level < 13) return 0;
  const hp = actor?.system?.attributes?.hp;
  if (!hp || typeof hp.max !== "number" || hp.max <= 0) return 0;
  const current = Number(hp.value ?? 0);
  const max = Number(hp.max);
  const pb = Number(actor?.system?.attributes?.prof ?? 2);
  if (current <= Math.floor(max * 0.10)) return pb;
  if (current <= Math.floor(max * 0.50)) return Math.ceil(pb / 2);
  return 0;
}

/**
 * Not Yet save DC tracking (Ch. 3 L3271, L3316).
 * Base DC 10, increases by 5 per use.
 * Resets on Long Rest, or when HP == Max HP at level 17+.
 */
export function getNotYetDC(actor) {
  const stored = flag(actor, "musha")?.notYetDc;
  return typeof stored === "number" && stored >= 10 ? stored : 10;
}

export function defineMushaPools() {
  // Not Yet uses dynamic DC tracking rather than a fixed pool, but we can register state tracking
}

const levelWarning = (warnings, actor, requiredLevel, name) => {
  const current = guardLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${name} is a Musha level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

/* ---------------------------------------------------------------- Musha Plans */

export const MUSHA_PLANS = {
  /**
   * Soloblade (1st Level, Ch. 3 L3260):
   * When hitting a creature with a melee attack, recover 2d6 (2d8 at 7th, 2d10 at 14th) HP.
   * WORKFLOW §3.2: Never auto-roll healing dice!
   */
  mushaSoloblade(actor, state, data) {
    need(isMusha(actor), "Soloblade is a Musha feature.");
    const warnings = [];
    const formula = solobladeFormula(actor);
    const targetName = data.targetName ?? "Creature";

    return {
      warnings,
      title: "Soloblade",
      apply(next, receipt) {
        receipt.targetName = targetName;
        receipt.formula = formula;
        receipt.rollFlavor = "Soloblade Healing";
        receipt.rollLabel = "Healing";
        receipt.summary = `${actor.name} strikes ${targetName} and draws upon Soloblade to recover vitality (${formula}).`;
        receipt.result = { formula, targetName };
        return {};
      }
    };
  },

  /**
   * Not Yet (1st Level, Ch. 3 L3271, 17th Level L3316):
   * When reduced to 0 HP, make Wisdom saving throw vs escalating DC (10 + 5 per use).
   * On success, survive with 2*PB Hit Points.
   */
  mushaNotYet(actor, state, data) {
    need(isMusha(actor), "Not Yet is a Musha feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;
    if (data.outrightKill && level < 17) {
      warn(warnings, "outrightKill", "Not Yet does not protect against outright kill effects before 17th level (To Laugh at Death).");
    }
    const dc = getNotYetDC(actor);
    const pb = Number(actor.system?.attributes?.prof ?? 2);
    const surviveHp = 2 * pb;
    const nextDc = dc + 5;

    return {
      warnings,
      title: "Not Yet",
      apply(next, receipt) {
        receipt.previousDc = dc;
        receipt.newDc = nextDc;
        receipt.surviveHp = surviveHp;
        receipt.outrightKill = Boolean(data.outrightKill);
        const outrightNote = data.outrightKill ? " (Survives outright kill via To Laugh at Death!)" : "";
        receipt.summary = `Reduced to 0 HP, ${actor.name} refuses to fall! DC ${dc} Wisdom saving throw. On success: survive with ${surviveHp} HP (2 × PB). DC escalates to ${nextDc}.${outrightNote}`;
        receipt.result = { previousDc: dc, newDc: nextDc, surviveHp, outrightKill: Boolean(data.outrightKill) };
        return {
          "flags.ak5e.musha.notYetDc": nextDc
        };
      }
    };
  },

  /**
   * Reset Not Yet DC (Long Rest or 17th Level Max HP trigger).
   */
  mushaResetNotYet(actor, state, data) {
    need(isMusha(actor), "Not Yet is a Musha feature.");
    const currentDc = getNotYetDC(actor);
    return {
      warnings: [],
      title: "Reset Not Yet DC",
      apply(next, receipt) {
        receipt.previousDc = currentDc;
        receipt.summary = `${actor.name} resets their Not Yet DC back to 10.`;
        receipt.result = { reset: true, dc: 10 };
        return {
          "flags.ak5e.musha.notYetDc": 10
        };
      }
    };
  },

  /**
   * Blood Price (4th Level, Ch. 3 L3286, 13th Level L3308):
   * Spend 2d8 (or 4d8 with Greater Blood Price) unreducible HP.
   * Options:
   * - centerOneself: end Charmed/Dazed/Frightened/Paralyzed/Stunned.
   * - digDeep: gain SP equal to HP lost.
   * - iai: draw weapon, dash half speed without AoO, advantage strike + half HP lost damage.
   * - ichimonji: melee strike + HP lost damage + knock off balance (advantage until end of turn).
   */
  mushaBloodPrice(actor, state, data) {
    need(isMusha(actor), "Blood Price is a Musha feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Blood Price");

    const option = data.option ?? "centerOneself";
    need(["centerOneself", "digDeep", "iai", "ichimonji"].includes(option), "Choose a valid Blood Price option.");

    const isGreater = Boolean(data.greaterBloodPrice && (guardLevel(actor) ?? 1) >= 13);
    const formula = isGreater ? "4d8" : "2d8";
    const hpCostRoll = Number(data.hpLost ?? (isGreater ? 18 : 9)); // Default estimate if manual
    const currentHp = Number(actor.system?.attributes?.hp?.value ?? 0);

    if (currentHp < hpCostRoll) {
      warn(warnings, "hp", `Using Blood Price requires losing ${formula} HP; ${actor.name} currently has ${currentHp} HP.`);
    }

    const titles = {
      centerOneself: "Blood Price: Center Oneself",
      digDeep: "Blood Price: Dig Deep",
      iai: "Blood Price: Iai",
      ichimonji: "Blood Price: Ichimonji"
    };

    return {
      warnings,
      title: titles[option] ?? "Blood Price",
      apply(next, receipt) {
        receipt.option = option;
        receipt.formula = formula;
        receipt.isGreater = isGreater;
        receipt.summary = `${actor.name} pays the Blood Price (${formula} unreducible HP loss) for ${titles[option]}.`;
        receipt.result = { option, formula, hpLost: hpCostRoll, isGreater };
        return {};
      }
    };
  },

  /**
   * Warrior Spirit: Go Forth (10th Level, Ch. 3 L3301):
   * Reaction when creature attacks you to move up to Speed toward attacker.
   */
  mushaGoForth(actor, state, data) {
    need(isMusha(actor), "Go Forth is a Musha feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Go Forth");

    const reactions = getReactions(actor);
    if (reactions?.available < 1) {
      warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    }

    const attackerName = data.attackerName ?? "Attacking Creature";

    return {
      warnings,
      title: "Warrior Spirit: Go Forth",
      async apply(next, receipt) {
        receipt.attackerName = attackerName;
        const rx = await spendReaction(actor, { triggerId: `${receipt.id}-goforth`, receipt: receipt.id });
        receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id, triggerId: `${receipt.id}-goforth` };
        receipt.summary = `Warrior Spirit: Go Forth. Under attack by ${attackerName}, ${actor.name} uses their Reaction to move up to their Speed toward the attacker.`;
        receipt.result = { attackerName, reactionSpent: rx.ok };
        return {};
      }
    };
  },

  /**
   * Press the Attack: Retaliator (10th Level, Ch. 3 L3303):
   * Spends 2 Aggression after Go Forth to make a melee attack or Iai.
   */
  mushaRetaliator(actor, state, data) {
    need(isMusha(actor), "Retaliator is a Musha feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Retaliator");

    const aggressionCost = 2;
    const available = resourceValue(actor, { pool: "aggression" });
    if (available < aggressionCost) {
      warn(warnings, "aggression", `${aggressionCost} Aggression needed for Retaliator and ${available} remain; Aggression clamps at 0.`);
    }

    const mode = data.mode ?? "meleeAttack"; // "meleeAttack" or "iai"

    return {
      warnings,
      title: "Press the Attack: Retaliator",
      apply(next, receipt) {
        receipt.mode = mode;
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: aggressionCost, label: "Aggression" });
        receipt.summary = `Press the Attack: Retaliator (2 Aggression). Following Go Forth, ${actor.name} makes a ${mode === "iai" ? "Iai Strike" : "Melee Weapon Attack"} against the triggering attacker.`;
        receipt.result = { mode, aggressionSpent: aggressionCost };
        return updates;
      }
    };
  }
};

/**
 * Stand Alone (Ch. 3 L3262):
 * When another Creature would restore Hit Points to you,
 * you instead gain Temporary Hit Points equal to the Hit Points you would have recovered.
 */
export function mushaPreApplyDamageHook(actor, amount, updates, options) {
  if (!isMusha(actor)) return true;

  const currentHp = Number(actor.system?.attributes?.hp?.value ?? 0);
  const newHp = typeof updates?.["system.attributes.hp.value"] === "number" ? updates["system.attributes.hp.value"] : null;
  const isHealing = (typeof amount === "number" && amount < 0) || (newHp !== null && newHp > currentHp) || options?.type === "healing";
  if (!isHealing) return true;

  // Self-healing exemption (Soloblade or self-origin)
  const isSelf = options?.ak5eSelfHeal || options?.source === actor.id || options?.origin === actor.uuid || options?.subject?.actor?.uuid === actor.uuid;
  if (isSelf) return true;

  const healAmount = typeof amount === "number" && amount < 0
    ? Math.abs(amount)
    : (newHp !== null && newHp > currentHp ? (newHp - currentHp) : 0);

  if (healAmount > 0) {
    if (updates && "system.attributes.hp.value" in updates) {
      updates["system.attributes.hp.value"] = currentHp;
    }
    const currentTemp = Number(actor.system?.attributes?.hp?.temp ?? 0);
    const finalTemp = Math.max(currentTemp, healAmount);
    if (updates) {
      updates["system.attributes.hp.temp"] = finalTemp;
    } else {
      actor.update?.({ "system.attributes.hp.temp": finalTemp });
    }
    if (globalThis.ChatMessage?.implementation?.create) {
      ChatMessage.implementation.create({
        speaker: ChatMessage.implementation.getSpeaker({ actor }),
        content: `<p><strong>AK5e Musha: Stand Alone.</strong> Outside healing of ${healAmount} HP was converted into Temporary HP (${finalTemp} Temp HP total).</p>`,
        flags: { ak5e: { mushaStandAlone: true } }
      }).catch(() => {});
    }
  }
  return true;
}

export function registerMushaHooks() {
  defineMushaPools();

  // Stand Alone (Ch. 3 L3262): outside healing converted to Temporary HP
  Hooks.on("dnd5e.preApplyDamage", (actor, amount, updates, options) => {
    return mushaPreApplyDamageHook(actor, amount, updates, options);
  });

  // Long rest: reset Not Yet DC to 10
  Hooks.on("dnd5e.restCompleted", (actor, data) => {
    if (!isMusha(actor)) return;
    if (data?.longRest) {
      actor.update({ "flags.ak5e.musha.notYetDc": 10 });
    }
  });

  // Level 17 To Laugh at Death: reset Not Yet DC whenever HP == Max HP
  Hooks.on("updateActor", (actor, diff) => {
    if (!isMusha(actor)) return;
    const level = guardLevel(actor) ?? 1;
    if (level < 17) return;
    const hp = actor.system?.attributes?.hp;
    if (hp && typeof hp.value === "number" && typeof hp.max === "number" && hp.value >= hp.max) {
      const currentDc = flag(actor, "musha")?.notYetDc;
      if (currentDc && currentDc > 10) {
        actor.update({ "flags.ak5e.musha.notYetDc": 10 });
      }
    }
  });

  // Register plans with guardUses
  guardUses.register({ plans: MUSHA_PLANS });
}

guardUses.register({ plans: MUSHA_PLANS });
