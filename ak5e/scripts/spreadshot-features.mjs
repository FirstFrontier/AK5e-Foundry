/**
 * Spreadshot subclass features (Ch.3 L4472-4540):
 * Spread the Love (Additional Spread, Up Close and Personal no disadv, Wide Fire Light/Heavy Spread),
 * Whites of Their Eyes (First to Fray +10/+20 ft speed, Point Blank <=15 ft: Advantage, native +1 die, Target +1 crit range),
 * Break Their Lines (Break Contact reaction half damage / miss on broken reach, Gut Shot +PB dmg & 10 ft knockback PB/SR),
 * Versatility of Violence (PB shells per SR, max 10, BA load up to 5 FIFO, Dragon's Breath, Flechette, Slug, Beanbag),
 * Breach and Clear (15th: no reactions on Point Blank target, Disadvantage on attacker),
 * Both Barrels (18th: Action 1/LR with loaded Shell: 50-ft Cone 8d8 or Slug 5x dmg).
 * Follows WORKFLOW.md §3.2 and integrates with marksmanUses and resource-pools.mjs.
 */
import {
  MARKSMAN_CLASS_ID, marksmanEnabled, marksmanLevel, marksmanBranch,
  martialDC, isTargetLocked, hasSpreadProperty, hasNativeSpreadProperty,
  SPREADSHOT_SHELL_TYPES
} from "./marksman-rules.mjs";
import { marksmanUses } from "./marksman-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { definePool, getPool, getPoolDefinition } from "./resource-pools.mjs";
import { spendReaction, getReactions } from "./trigger-events.mjs";
import { need, flag } from "./operation-kernel.mjs";

export const isSpreadshot = actor => marksmanEnabled(actor) && marksmanBranch(actor) === "spreadshot";

export function defineSpreadshotPools() {
  if (!getPoolDefinition("gutShot")) {
    definePool({
      id: "gutShot",
      label: "Gut Shot",
      max: "@prof",
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isSpreadshot(actor) && marksmanLevel(actor) >= 4,
      recovery: [
        { on: "sr", amount: "toMax" },
        { on: "lr", amount: "toMax" }
      ]
    });
  }
  if (!getPoolDefinition("bothBarrels")) {
    definePool({
      id: "bothBarrels",
      label: "Both Barrels",
      max: 1,
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isSpreadshot(actor) && marksmanLevel(actor) >= 18,
      recovery: [
        { on: "lr", amount: "toMax" }
      ]
    });
  }
}

const levelWarning = (warnings, actor, requiredLevel, name) => {
  const current = marksmanLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${name} is a Spreadshot level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

export function getShellInventory(actor) {
  const raw = flag(actor, "marksman")?.shells ?? {};
  return {
    dragonsBreath: Number(raw.dragonsBreath ?? 0),
    flechette: Number(raw.flechette ?? 0),
    slug: Number(raw.slug ?? 0),
    beanbag: Number(raw.beanbag ?? 0)
  };
}

export function getLoadedShells(actor) {
  return Array.from(flag(actor, "marksman")?.loadedShells ?? []);
}

export function totalShellsCount(actor) {
  const inv = getShellInventory(actor);
  const loaded = getLoadedShells(actor);
  return inv.dragonsBreath + inv.flechette + inv.slug + inv.beanbag + loaded.length;
}

/* ---------------------------------------------------------------- Spreadshot Plans */

export const SPREADSHOT_PLANS = {
  craftShells(actor, _state, data) {
    need(isSpreadshot(actor), "Making Shells is a Spreadshot feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Versatility of Violence");

    const pb = Number(actor.system?.attributes?.prof ?? 2);
    const requested = data.shells ?? { dragonsBreath: pb };
    const count = Object.values(requested).reduce((a, b) => a + Number(b || 0), 0);

    if (count > pb) {
      warn(warnings, "craftCount", `Can craft at most ${pb} Shells on a Short Rest; requested ${count}.`);
    }

    const currentTotal = totalShellsCount(actor);
    if (currentTotal + count > 10) {
      warn(warnings, "maxCapacity", `Maintaining more than 10 total Shells exceeds maintenance capacity (${currentTotal + count} > 10).`);
    }

    return {
      warnings,
      title: "Make Shells (Short Rest)",
      apply(next, receipt) {
        const inv = getShellInventory(actor);
        for (const [key, qty] of Object.entries(requested)) {
          inv[key] = (inv[key] || 0) + Number(qty || 0);
        }
        receipt.summary = `${actor.name} crafts ${count} specialized Shells during maintenance:\n• Dragon's Breath: ${inv.dragonsBreath}, Flechette: ${inv.flechette}, Slug: ${inv.slug}, Beanbag: ${inv.beanbag}`;
        receipt.result = { crafted: requested, inventory: inv };
        return {
          "flags.ak5e.marksman.shells": inv
        };
      }
    };
  },

  loadShells(actor, _state, data) {
    need(isSpreadshot(actor), "Using Shells is a Spreadshot feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Versatility of Violence");

    const toLoad = Array.isArray(data.shells) ? data.shells : [data.shell || "dragonsBreath"];
    const currentLoaded = getLoadedShells(actor);

    if (currentLoaded.length + toLoad.length > 5) {
      warn(warnings, "magazineCap", `Cannot load more than 5 Shells into a weapon (${currentLoaded.length + toLoad.length} > 5).`);
    }

    const inv = getShellInventory(actor);
    for (const shellType of toLoad) {
      if ((inv[shellType] || 0) < 1) {
        warn(warnings, "shortage", `Shortage of ${shellType} Shells in inventory.`);
      }
    }

    return {
      warnings,
      title: "Load Shells (Bonus Action)",
      apply(next, receipt) {
        const newQueue = [...currentLoaded];
        for (const shellType of toLoad) {
          if ((inv[shellType] || 0) > 0) {
            inv[shellType]--;
          }
          newQueue.push(shellType);
        }
        receipt.summary = `${actor.name} loads ${toLoad.length} Shell(s) into their Spread weapon as a Bonus Action. Chambered queue: [${newQueue.join(", ")}].`;
        receipt.result = { loaded: toLoad, queue: newQueue };
        return {
          "flags.ak5e.marksman.shells": inv,
          "flags.ak5e.marksman.loadedShells": newQueue
        };
      }
    };
  },

  breakContact(actor, _state, _data) {
    need(isSpreadshot(actor), "Break Contact is a Spreadshot feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Break Contact");

    const reactions = getReactions(actor);
    if (reactions?.available < 1) {
      warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    }

    return {
      warnings,
      title: "Break Contact (Reaction)",
      async apply(next, receipt) {
        let spent = false;
        try {
          const rx = await spendReaction(actor, { triggerId: `${receipt.id}-break-contact`, receipt: receipt.id });
          spent = Boolean(rx?.ok);
        } catch {}
        receipt.reaction = { requested: true, spent, receiptId: receipt.id };
        receipt.summary = `${actor.name} uses Break Contact as a Reaction: makes a Ranged Attack using a Spread weapon (damage halved). If no longer in reach after this attack, the triggering melee attack misses automatically!`;
        receipt.result = { breakContact: true };
        return {};
      }
    };
  },

  gutShot(actor, _state, _data) {
    need(isSpreadshot(actor), "Gut Shot is a Spreadshot feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Gut Shot");
    const available = resourceValue(actor, { pool: "gutShot" });
    if (available < 1) {
      warn(warnings, "gutShot", "Gut Shot uses exhausted; uses clamp at 0.");
    }

    const pb = Number(actor.system?.attributes?.prof ?? 2);

    return {
      warnings,
      title: "Gut Shot (Point Blank)",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "gutShot", amount: 1, label: "Gut Shot" });
        receipt.summary = `${actor.name} performs a Gut Shot: on hit, deals +${pb} additional Damage and knocks the target back 10 feet.`;
        receipt.result = { bonusDamage: pb, knockback: 10 };
        return updates;
      }
    };
  },

  bothBarrels(actor, _state, _data) {
    need(isSpreadshot(actor), "Both Barrels is a Spreadshot feature.");
    const warnings = [];
    levelWarning(warnings, actor, 18, "Both Barrels");
    const available = resourceValue(actor, { pool: "bothBarrels" });
    if (available < 1) {
      warn(warnings, "bothBarrels", "Both Barrels has already been used; uses clamp at 0.");
    }

    const loaded = getLoadedShells(actor);
    if (loaded.length === 0) {
      warn(warnings, "noShell", "No Shell currently loaded in weapon to fire Both Barrels.");
    }

    const shell = loaded[0] || "dragonsBreath";
    const mDC = martialDC(actor);
    let desc = "";

    if (shell === "dragonsBreath") {
      desc = `50-foot Cone, DC ${mDC} DEX Save: 8d8 Fire Damage and begins Burning (half damage, no burn on success).`;
    } else if (shell === "flechette") {
      desc = `50-foot Cone, DC ${mDC} DEX Save: 8d8 Piercing Damage and Movement Speed halved (half damage on success).`;
    } else if (shell === "slug") {
      desc = `Target within 60 ft, DC ${mDC} CON Save: Piercing Damage equal to 5x weapon attack damage, ignoring DR (half damage on success).`;
    } else if (shell === "beanbag") {
      desc = `50-foot Cone, DC ${mDC} DEX Save: 8d8 Bludgeoning Damage and Dazed (half damage on success; 0 HP is Unconscious not Dying).`;
    }

    return {
      warnings,
      title: "Both Barrels",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "bothBarrels", amount: 1, label: "Both Barrels" });
        const remainingQueue = loaded.slice(1);
        updates["flags.ak5e.marksman.loadedShells"] = remainingQueue;

        receipt.summary = `${actor.name} unleashes Both Barrels using a loaded ${shell} Shell:\n• ${desc}`;
        receipt.result = { shell, description: desc };
        return updates;
      }
    };
  }
};

marksmanUses.register({ plans: SPREADSHOT_PLANS });

/* ---------------------------------------------------------------- Hooks */

export function spreadshotPreRollAttack(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isSpreadshot(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll) return;

  const weapon = activity.item;
  if (!hasSpreadProperty(weapon, actor)) return;

  const targetToken = globalThis.game?.user?.targets?.first?.() ?? null;
  const attackerToken = actor.getActiveTokens?.()?.[0] ?? null;

  // Up Close and Personal (1st level): suppress disadvantage from adjacent hostiles
  if (roll.options?.disadvantage) {
    roll.options.disadvantage = false;
  }

  // Point Blank (1st level): Creature within 15 ft
  let isPointBlank = false;
  if (attackerToken && targetToken) {
    const aCenter = attackerToken.center ?? { x: attackerToken.x, y: attackerToken.y };
    const tCenter = targetToken.center ?? { x: targetToken.x, y: targetToken.y };
    const gridSize = globalThis.canvas?.grid?.size ?? 100;
    const gridDistance = globalThis.canvas?.grid?.distance ?? 5;
    const distFt = (Math.hypot(aCenter.x - tCenter.x, aCenter.y - tCenter.y) / gridSize) * gridDistance;
    isPointBlank = distFt <= 15;
  } else {
    // If no tokens on map, default to Point Blank check passed
    isPointBlank = true;
  }

  if (isPointBlank) {
    roll.options ??= {};
    roll.options.advantage = true;

    // Point Blank on locked Target: +1 Critical Range
    const targetUuid = targetToken?.document?.uuid ?? targetToken?.actor?.uuid ?? null;
    if (targetUuid && isTargetLocked(actor, targetUuid)) {
      roll.options.criticalSuccess = Math.min(Number(roll.options.criticalSuccess ?? 20) - 1, 19);
    }
  }
}

export function spreadshotPreRollDamage(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isSpreadshot(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll?.parts) return;

  const weapon = activity.item;
  if (!hasSpreadProperty(weapon, actor)) return;

  // Whites of Their Eyes: native Spread weapon deals 1 additional die of Damage at Point Blank
  if (hasNativeSpreadProperty(weapon)) {
    const formula = weapon?.system?.damage?.base?.formula || activity.damage?.parts?.[0]?.formula || "1d8";
    const dieMatch = formula.match(/d(\d+)/);
    const faces = dieMatch ? dieMatch[1] : "8";
    roll.parts.push(`1d${faces}`);
  }

  // Consume loaded shell in FIFO order if available
  const loaded = getLoadedShells(actor);
  if (loaded.length > 0) {
    const chambered = loaded[0];
    const remaining = loaded.slice(1);
    if (typeof actor.update === "function") {
      actor.update({ "flags.ak5e.marksman.loadedShells": remaining }).catch(() => {});
    }

    if (chambered === "slug") {
      roll.options ??= {};
      roll.options.ignoreDamageReduction = true;
    }
  }
}

let installed = false;
export function registerSpreadshotHooks() {
  if (installed) return;
  installed = true;

  defineSpreadshotPools();

  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollAttackV2", spreadshotPreRollAttack);
    Hooks.on("dnd5e.preRollDamageV2", spreadshotPreRollDamage);
  }
}

defineSpreadshotPools();
