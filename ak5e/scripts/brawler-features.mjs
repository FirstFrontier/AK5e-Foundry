/**
 * Brawler subclass features (Ch.3 L2423-2546):
 * Martial Artist & Basic Brawling Techniques (8 Press the Attack riders, spend Aggression),
 * Guns Out (Bob and Weave AC: 10 + STR + DEX, Dexterous Attacks, Art of the Fist 1d4->1d6->1d8 scaling),
 * Rain of Blows (4th level: Denting Blows Crush 3, Flurry extra attack in Attack Action),
 * No Ordinary Pugilist (10th level: Always Ready +1 Aggression/turn, 7 Advanced Brawling Techniques),
 * Kick them while they're Down (13th level: +PB damage vs detrimental status conditions),
 * Mountainbreaker (17th level, 1/LR: 10-attack chain with -2 cumulative penalty OR 5x damage single strike).
 * Follows WORKFLOW.md §3.2 and integrates with guardUses and resource-pools.mjs.
 */
import {
  GUARD_CLASS_ID, guardEnabled, guardLevel, guardBranch, martialDC
} from "./guard-rules.mjs";
import { guardUses } from "./guard-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { definePool, getPool, getPoolDefinition, refundPool } from "./resource-pools.mjs";
import { spendReaction, getReactions } from "./trigger-events.mjs";
import { need, values, flag } from "./operation-kernel.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";

export const isBrawler = actor => guardEnabled(actor) && guardBranch(actor) === "brawler";

export function artOfTheFistDie(level) {
  const lvl = Number(level) || 1;
  if (lvl >= 14) return "1d8";
  if (lvl >= 7) return "1d6";
  return "1d4";
}

export function isUnarmoredOrLight(actor) {
  const equipped = values(actor?.items).filter(i => i.type === "equipment" && i.system?.equipped);
  const armors = equipped.filter(i => {
    const val = i.system?.type?.value;
    return val === "armor" || i.system?.armor?.type;
  });
  if (!armors.length) return true;
  return armors.every(a => {
    const t = a.system?.type?.subType ?? a.system?.armor?.type ?? "";
    return !["medium", "heavy"].includes(t.toLowerCase());
  });
}

export function bobAndWeaveAC(actor) {
  const str = Number(actor?.system?.abilities?.str?.mod ?? 0);
  const dex = Number(actor?.system?.abilities?.dex?.mod ?? 0);
  return 10 + str + dex;
}

export const DETRIMENTAL_STATUSES = Object.freeze([
  "frightened", "stunned", "grappled", "prone", "burning", "bleeding", "corroded",
  "dazed", "restrained", "blinded", "paralyzed", "poisoned", "unconscious"
]);

export function defineBrawlerPools() {
  if (!getPoolDefinition("mountainbreaker")) {
    definePool({
      id: "mountainbreaker",
      label: "Mountainbreaker",
      max: 1,
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isBrawler(actor) && guardLevel(actor) >= 17,
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
}

const levelWarning = (warnings, actor, requiredLevel, name) => {
  const current = guardLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${name} is a Brawler level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

const aggressionCheck = (warnings, actor, amount) => {
  const available = resourceValue(actor, { pool: "aggression" });
  if (available < amount) {
    warn(warnings, "aggression", `${amount} Aggression needed and ${available} remain; Aggression clamps at 0.`);
  }
};

/* ---------------------------------------------------------------- Brawler Plans */

const BRAWLER_PLANS = {
  // --- Basic Brawling Techniques (1st level) ---
  bodyCheck(actor, _state, _data) {
    need(isBrawler(actor), "Body Check is a Brawler feature.");
    const warnings = [];
    aggressionCheck(warnings, actor, 1);
    return {
      warnings,
      title: "Press the Attack: Body Check",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 1, label: "Aggression" });
        receipt.summary = `${actor.name} uses Body Check (1 Aggression): attempts to Shove target as part of Unarmed Strike hit. Shove distance is doubled on success.`;
        receipt.result = { aggressionSpent: 1, doubledShove: true };
        return updates;
      }
    };
  },

  crossCounter(actor, _state, _data) {
    need(isBrawler(actor), "Cross Counter is a Brawler feature.");
    const warnings = [];
    aggressionCheck(warnings, actor, 1);
    const reactions = getReactions(actor);
    if (reactions?.available < 1) warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    const pb = Number(actor.system?.attributes?.prof ?? 2);

    return {
      warnings,
      title: "Press the Attack: Cross Counter",
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 1, label: "Aggression" });
        const rx = await spendReaction(actor, { triggerId: `${receipt.id}-crossCounter`, receipt: receipt.id });
        receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id };
        receipt.summary = `${actor.name} uses Cross Counter (1 Aggression): increases AC by +${pb} against triggering Melee Attack. If it misses, may make an Unarmed Attack as part of this Reaction.`;
        receipt.result = { aggressionSpent: 1, acBonus: pb, counterAttack: true };
        return updates;
      }
    };
  },

  feint(actor, _state, data) {
    need(isBrawler(actor), "Feint is a Brawler feature.");
    const warnings = [];
    aggressionCheck(warnings, actor, 1);
    const targetUuid = data.targetUuid ?? null;

    return {
      warnings,
      title: "Press the Attack: Feint",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 1, label: "Aggression" });
        receipt.summary = `${actor.name} uses Feint (1 Aggression, Bonus Action): next Unarmed Strike against target before end of next Turn is made at Advantage.`;
        receipt.result = { aggressionSpent: 1, targetUuid, advantage: true };
        return updates;
      }
    };
  },

  followUp(actor, state, _data) {
    need(isBrawler(actor), "Follow Up is a Brawler feature.");
    const warnings = [];
    aggressionCheck(warnings, actor, 1);
    const combat = globalThis.game?.combat;
    const currentTurnKey = combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
    if (currentTurnKey && state.data?.followUpTurn === currentTurnKey) {
      warn(warnings, "frequency", "Follow Up can only be used once per Turn.");
    }

    return {
      warnings,
      title: "Press the Attack: Follow Up",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 1, label: "Aggression" });
        next.data ??= {};
        next.data.followUpTurn = currentTurnKey;
        receipt.summary = `${actor.name} uses Follow Up (1 Aggression): makes an immediate additional Unarmed Strike against the same target.`;
        receipt.result = { aggressionSpent: 1, extraStrike: true };
        return updates;
      }
    };
  },

  footwork(actor, _state, _data) {
    need(isBrawler(actor), "Footwork is a Brawler feature.");
    const warnings = [];
    aggressionCheck(warnings, actor, 1);
    const speed = Number(actor.system?.attributes?.movement?.walk ?? 30);
    const halfSpeed = Math.floor(speed / 2);

    return {
      warnings,
      title: "Press the Attack: Footwork",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 1, label: "Aggression" });
        receipt.summary = `${actor.name} uses Footwork (1 Aggression): moves up to ${halfSpeed} ft (half speed) without provoking Opportunity Attacks.`;
        receipt.result = { aggressionSpent: 1, moveDistance: halfSpeed };
        return updates;
      }
    };
  },

  guardUp(actor, _state, _data) {
    need(isBrawler(actor), "Guard Up is a Brawler feature.");
    const warnings = [];
    aggressionCheck(warnings, actor, 1);
    return {
      warnings,
      title: "Press the Attack: Guard Up",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 1, label: "Aggression" });
        receipt.summary = `${actor.name} uses Guard Up (1 Aggression, Bonus Action): takes the Dodge Action.`;
        receipt.result = { aggressionSpent: 1, dodge: true };
        return updates;
      }
    };
  },

  slipOff(actor, _state, _data) {
    need(isBrawler(actor), "Slip Off is a Brawler feature.");
    const warnings = [];
    aggressionCheck(warnings, actor, 2);
    const reactions = getReactions(actor);
    if (reactions?.available < 1) warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);

    return {
      warnings,
      title: "Press the Attack: Slip Off",
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 2, label: "Aggression" });
        const rx = await spendReaction(actor, { triggerId: `${receipt.id}-slipOff`, receipt: receipt.id });
        receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id };
        receipt.summary = `${actor.name} uses Slip Off (2 Aggression, Reaction): halves triggering Attack's Damage against them.`;
        receipt.result = { aggressionSpent: 2, halveDamage: true };
        return updates;
      }
    };
  },

  tagIn(actor, state, data) {
    need(isBrawler(actor), "Tag In is a Brawler feature.");
    const warnings = [];
    aggressionCheck(warnings, actor, 2);
    const combat = globalThis.game?.combat;
    const currentTurnKey = combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
    if (currentTurnKey && state.data?.tagInTurn === currentTurnKey) {
      warn(warnings, "frequency", "Tag In can only be used once per Turn.");
    }
    const allyUuid = data.allyUuid ?? null;

    return {
      warnings,
      title: "Press the Attack: Tag In",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 2, label: "Aggression" });
        next.data ??= {};
        next.data.tagInTurn = currentTurnKey;
        receipt.summary = `${actor.name} uses Tag In (2 Aggression): swaps positions with willing ally within Reach (spends movement, no AoO). Either Brawler or ally makes a single Melee Attack.`;
        receipt.result = { aggressionSpent: 2, allyUuid, positionSwap: true };
        return updates;
      }
    };
  },

  // --- Advanced Brawling Techniques (10th level) ---
  chokehold(actor, _state, data) {
    need(isBrawler(actor), "Chokehold is a Brawler feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Chokehold");
    aggressionCheck(warnings, actor, 2);

    const strScore = Number(actor.system?.abilities?.str?.value ?? 10);
    const dexScore = Number(actor.system?.abilities?.dex?.value ?? 10);
    const scoreChoice = data.ability === "dex" ? dexScore : strScore;

    return {
      warnings,
      title: "Advanced Technique: Chokehold",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 2, label: "Aggression" });
        receipt.summary = `${actor.name} uses Chokehold (2 Aggression, Action): grappled breathing creature loses ${scoreChoice} Hit Points (Ability Score).`;
        receipt.result = { aggressionSpent: 2, hpLoss: scoreChoice };
        return updates;
      }
    };
  },

  cqc(actor, _state, _data) {
    need(isBrawler(actor), "CQC is a Brawler feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "CQC");
    aggressionCheck(warnings, actor, 2);

    return {
      warnings,
      title: "Advanced Technique: CQC",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 2, label: "Aggression" });
        receipt.summary = `${actor.name} uses CQC (2 Aggression): attempts to Grapple target as part of Unarmed Strike hit (no Action required).`;
        receipt.result = { aggressionSpent: 2, grappleAttempt: true };
        return updates;
      }
    };
  },

  disarm(actor, _state, _data) {
    need(isBrawler(actor), "Disarm is a Brawler feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Disarm");
    aggressionCheck(warnings, actor, 3);
    const mDC = martialDC(actor);

    return {
      warnings,
      title: "Advanced Technique: Disarm",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 3, label: "Aggression" });
        receipt.summary = `${actor.name} uses Disarm (3 Aggression, Action): grappled creature makes STR save (DC ${mDC}) or is forced to drop an item of choice.`;
        receipt.result = { aggressionSpent: 3, martialDC: mDC };
        return updates;
      }
    };
  },

  humanShield(actor, _state, _data) {
    need(isBrawler(actor), "Human Shield is a Brawler feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Human Shield");
    aggressionCheck(warnings, actor, 2);
    const mDC = martialDC(actor);

    return {
      warnings,
      title: "Advanced Technique: Human Shield",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 2, label: "Aggression" });
        receipt.summary = `${actor.name} uses Human Shield (2 Aggression, Action): grappled creature makes STR save (DC ${mDC}) or becomes Restrained, granting Brawler Three-Quarters Cover from presented direction. Misses from that direction hit the Restrained creature.`;
        receipt.result = { aggressionSpent: 2, martialDC: mDC, cover: "threeQuarters" };
        return updates;
      }
    };
  },

  menace(actor, _state, _data) {
    need(isBrawler(actor), "Menace is a Brawler feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Menace");
    aggressionCheck(warnings, actor, 2);
    const mDC = martialDC(actor);

    return {
      warnings,
      title: "Advanced Technique: Menace",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 2, label: "Aggression" });
        receipt.summary = `${actor.name} uses Menace (2 Aggression, Action): creature within 30 ft makes WIS save (DC ${mDC}) or becomes Frightened until saving at end of turn.`;
        receipt.result = { aggressionSpent: 2, martialDC: mDC, frightened: true };
        return updates;
      }
    };
  },

  skullshaker(actor, _state, _data) {
    need(isBrawler(actor), "Skullshaker is a Brawler feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Skullshaker");
    aggressionCheck(warnings, actor, 2);

    return {
      warnings,
      title: "Advanced Technique: Skullshaker",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 2, label: "Aggression" });
        receipt.summary = `${actor.name} uses Skullshaker (2 Aggression, Action): makes an Unarmed Strike; if it hits, Damage is doubled and target is Dazed until end of next Turn.`;
        receipt.result = { aggressionSpent: 2, doubleDamage: true, dazed: true };
        return updates;
      }
    };
  },

  weighIn(actor, _state, _data) {
    need(isBrawler(actor), "Weigh In is a Brawler feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Weigh In");
    aggressionCheck(warnings, actor, 2);
    const mDC = martialDC(actor);

    return {
      warnings,
      title: "Advanced Technique: Weigh In",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 2, label: "Aggression" });
        receipt.summary = `${actor.name} uses Weigh In (2 Aggression): target hit with Melee Attack makes WIS save (DC ${mDC}) or has Disadvantage on Attack Rolls against creatures that aren't ${actor.name} until end of next Turn.`;
        receipt.result = { aggressionSpent: 2, martialDC: mDC };
        return updates;
      }
    };
  },

  // --- Mountainbreaker (17th level, 1/LR) ---
  mountainbreaker(actor, _state, data) {
    need(isBrawler(actor), "Mountainbreaker is a Brawler feature.");
    const warnings = [];
    levelWarning(warnings, actor, 17, "Mountainbreaker");
    const available = resourceValue(actor, { pool: "mountainbreaker" });
    if (available < 1) {
      warn(warnings, "mountainbreaker", `1 use of Mountainbreaker needed and ${available} remain.`);
    }

    const mode = data.mode === "knockout" ? "knockout" : "flurry";

    return {
      warnings,
      title: "Mountainbreaker",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "mountainbreaker", amount: 1, label: "Mountainbreaker" });
        let summary = "";
        if (mode === "flurry") {
          summary = `${actor.name} unleashes Mountainbreaker Rapid Flurry: makes an Unarmed Strike; if it hits, may make another, up to 10 attacks, each subsequent attack suffering a cumulative -2 penalty until a miss or 10 attacks completed.`;
        } else {
          summary = `${actor.name} unleashes Mountainbreaker Knockout Strike: makes a single Unarmed Strike; if it hits, Damage is multiplied by 5, and target is knocked 20 ft away and falls Prone (if no more than one size larger).`;
        }
        receipt.summary = summary;
        receipt.result = { mode, useSpent: 1 };
        return updates;
      }
    };
  }
};

guardUses.register({ plans: BRAWLER_PLANS });

/* ---------------------------------------------------------------- Hooks & Event Handlers */

export function brawlerPreRollAttack(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isBrawler(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll) return;

  const isUnarmed = activity.actionType === "mwak" && (activity.item?.system?.properties?.has?.("unarmed") || activity.item?.name?.toLowerCase().includes("unarmed"));

  // Dexterous Attacks: DEX modifier instead of STR for attack rolls if DEX > STR
  if (isUnarmed && isUnarmoredOrLight(actor)) {
    const strMod = Number(actor.system?.abilities?.str?.mod ?? 0);
    const dexMod = Number(actor.system?.abilities?.dex?.mod ?? 0);
    if (dexMod > strMod) {
      const diff = dexMod - strMod;
      roll.parts.push(String(diff));
    }
  }
}

export function brawlerPreRollDamage(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isBrawler(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll?.parts) return;

  const level = guardLevel(actor) ?? 1;
  const isUnarmed = activity.actionType === "mwak" && (activity.item?.system?.properties?.has?.("unarmed") || activity.item?.name?.toLowerCase().includes("unarmed"));

  // Dexterous Attacks: DEX modifier instead of STR for damage rolls if DEX > STR
  if (isUnarmed && isUnarmoredOrLight(actor)) {
    const strMod = Number(actor.system?.abilities?.str?.mod ?? 0);
    const dexMod = Number(actor.system?.abilities?.dex?.mod ?? 0);
    if (dexMod > strMod) {
      const diff = dexMod - strMod;
      roll.parts.push(String(diff));
    }
  }

  // Kick them while they're Down (13th level): +PB Bludgeoning damage against creatures with detrimental status conditions
  if (level >= 13 && isUnarmed) {
    const targets = Array.from(globalThis.game?.user?.targets ?? []);
    const anyDetrimental = targets.some(t => {
      const targetActor = t.actor;
      if (!targetActor) return false;
      return DETRIMENTAL_STATUSES.some(s => targetActor.statuses?.has?.(s) || Boolean(flag(targetActor, s)));
    });
    if (anyDetrimental) {
      const pb = String(actor.system?.attributes?.prof ?? 2);
      roll.parts.push(pb);
    }
  }
}

let installed = false;

export function registerBrawlerHooks() {
  if (installed) return;
  installed = true;

  defineBrawlerPools();

  // Always Ready (10th level): at start of turn in combat, regain 1 Aggression if below max
  onAk5eEvent("turnStart", async event => {
    const actor = event?.raw?.actor ?? (event?.actorUuid ? globalThis.fromUuidSync?.(event.actorUuid) : (event?.actor ?? event));
    if (!actor || !isBrawler(actor)) return;
    const level = guardLevel(actor) ?? 1;
    if (level >= 10 && globalThis.game?.combat?.started) {
      const agg = getPool(actor, "aggression");
      if (agg && agg.value < agg.max) {
        await refundPool(actor, "aggression", 1, { reason: "Always Ready" });
      }
    }
  });

  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollAttackV2", brawlerPreRollAttack);
    Hooks.on("dnd5e.preRollDamageV2", brawlerPreRollDamage);
  }
}

defineBrawlerPools();

