/**
 * Flinger subclass features (Ch.3 L4163-4295):
 * Manipulation Arts (Arts Points pool, self/target discount -1 AP min 0, Spellcasting Ability, Arts Pools),
 * Weapon Binding (1 at 1st, 2 at 5th, 3 at 14th; move 30 ft, melee attack with Spell Mod, free AoO, recall 100 ft),
 * Aftershock (4th level: hostile within 10 ft of weapon takes Thunder Damage = Spell Mod),
 * Kinetic Strike (10th level: 100 ft, Dex save vs Spell DC, 4d8 bludgeoning per bound weapon, 1/LR),
 * Pass-through Strike (15th level: moving through hostile space deals Piercing = Spell Mod),
 * Whirling Death (18th level: 50 ft sphere, Dex save vs Spell DC, 8d8 slashing, 1/LR).
 * Follows WORKFLOW.md §3.2 and integrates with marksmanUses and resource-pools.mjs.
 */
import {
  MARKSMAN_CLASS_ID, marksmanEnabled, marksmanLevel, marksmanBranch,
  flingerSpellcastingAbility, flingerSpellDC, flingerSpellMod,
  flingerArtsPoints, flingerMaxArtLevel, flingerMaxBoundWeapons, flingerArtCost,
  FLINGER_ARTS_POINTS
} from "./marksman-rules.mjs";
import { marksmanUses } from "./marksman-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { definePool, getPool, getPoolDefinition } from "./resource-pools.mjs";
import { need, flag } from "./operation-kernel.mjs";

export const isFlinger = actor => marksmanEnabled(actor) && marksmanBranch(actor) === "flinger";

export function boundWeaponsList(actor) {
  return flag(actor, "marksman")?.boundWeapons ?? [];
}

export function defineFlingerPools() {
  if (!getPoolDefinition("flingerArtsPoints")) {
    definePool({
      id: "flingerArtsPoints",
      label: "Flinger Arts Points",
      max: FLINGER_ARTS_POINTS,
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isFlinger(actor),
      recovery: [
        { on: "lr", amount: "toMax" }
      ]
    });
  }
  if (!getPoolDefinition("kineticStrike")) {
    definePool({
      id: "kineticStrike",
      label: "Kinetic Strike",
      max: 1,
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isFlinger(actor) && marksmanLevel(actor) >= 10,
      recovery: [
        { on: "lr", amount: "toMax" }
      ]
    });
  }
  if (!getPoolDefinition("whirlingDeath")) {
    definePool({
      id: "whirlingDeath",
      label: "Whirling Death",
      max: 1,
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isFlinger(actor) && marksmanLevel(actor) >= 18,
      recovery: [
        { on: "lr", amount: "toMax" }
      ]
    });
  }
}

const levelWarning = (warnings, actor, requiredLevel, name) => {
  const current = marksmanLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${name} is a Flinger level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

/* ---------------------------------------------------------------- Flinger Plans */

export const FLINGER_PLANS = {
  bindWeapon(actor, _state, data) {
    need(isFlinger(actor), "Weapon Binding is a Flinger feature.");
    const warnings = [];
    const maxWeapons = flingerMaxBoundWeapons(actor);
    const existing = boundWeaponsList(actor);

    if (existing.length >= maxWeapons) {
      warn(warnings, "boundCapacity", `${actor.name} can bind at most ${maxWeapons} weapon${maxWeapons > 1 ? "s" : ""} at level ${marksmanLevel(actor)}.`);
    }

    const weaponId = data.weaponId ?? `weapon-${Date.now()}`;
    const weaponName = data.weaponName ?? "Melee Weapon";

    return {
      warnings,
      title: "Bind Weapon",
      apply(next, receipt) {
        const updated = [...existing.filter(w => w.id !== weaponId), { id: weaponId, name: weaponName, boundAt: Date.now() }];
        receipt.summary = `${actor.name} binds ${weaponName} (${updated.length} of ${maxWeapons} bound). It floats at their side.`;
        receipt.result = { boundWeapons: updated, weaponName };
        return {
          "flags.ak5e.marksman.boundWeapons": updated
        };
      }
    };
  },

  unbindWeapon(actor, _state, data) {
    need(isFlinger(actor), "Weapon Binding is a Flinger feature.");
    const existing = boundWeaponsList(actor);
    const weaponId = data.weaponId;
    const removed = existing.find(w => w.id === weaponId);
    const updated = existing.filter(w => w.id !== weaponId);

    return {
      warnings: [],
      title: "Unbind Weapon",
      apply(next, receipt) {
        receipt.summary = `${actor.name} unbinds ${removed?.name ?? "weapon"}.`;
        receipt.result = { boundWeapons: updated };
        return {
          "flags.ak5e.marksman.boundWeapons": updated
        };
      }
    };
  },

  commandBoundWeapons(actor, _state, data) {
    need(isFlinger(actor), "Weapon Binding is a Flinger feature.");
    const warnings = [];
    if (flag(actor, "marksman")?.whirlingDeathActive) {
      warn(warnings, "whirlingDeath", "Cannot move or attack with Bound Weapons while Whirling Death is ongoing.");
    }

    const bound = boundWeaponsList(actor);
    if (!bound.length) {
      warn(warnings, "noWeapons", `${actor.name} has no weapons bound to command.`);
    }

    const level = marksmanLevel(actor);
    const mod = flingerSpellMod(actor);
    const ability = flingerSpellcastingAbility(actor).toUpperCase();
    const aftershock = level >= 4;
    const passThrough = level >= 15;

    return {
      warnings,
      title: "Command Bound Weapons",
      apply(next, receipt) {
        receipt.summary = `${actor.name} commands ${bound.length} Bound Weapon${bound.length > 1 ? "s" : ""} to move up to 30 ft and strike (using ${ability} Mod +${mod} for Melee Attack and Damage).`;
        if (aftershock) {
          receipt.summary += ` Aftershock: hostiles within 10 ft of arrival take ${mod} Thunder Damage.`;
        }
        if (passThrough) {
          receipt.summary += ` Pass-through Strike: hostiles moved through take ${mod} Piercing Damage.`;
        }

        receipt.result = {
          commandedCount: bound.length,
          spellMod: mod,
          aftershockDamage: aftershock ? mod : 0,
          passThroughDamage: passThrough ? mod : 0
        };
        return {};
      }
    };
  },

  recallBoundWeapons(actor, _state, _data) {
    need(isFlinger(actor), "Weapon Binding is a Flinger feature.");
    const bound = boundWeaponsList(actor);

    return {
      warnings: [],
      title: "Recall Bound Weapons",
      apply(next, receipt) {
        receipt.summary = `${actor.name} recalls all Bound Weapons within 100 ft to their side as an Action.`;
        receipt.result = { recalledCount: bound.length };
        return {};
      }
    };
  },

  spendArtsPoints(actor, _state, data) {
    need(isFlinger(actor), "Manipulation Arts is a Flinger feature.");
    const warnings = [];
    const baseCost = Number(data.baseCost ?? 1);
    const isSelfOrTarget = Boolean(data.isSelfOrTarget);
    const finalCost = flingerArtCost(actor, baseCost, { isSelfOrTarget });
    const available = resourceValue(actor, { pool: "flingerArtsPoints" });

    if (available < finalCost) {
      warn(warnings, "ap", `Insufficient Arts Points (needs ${finalCost}, has ${available}).`);
    }

    const artName = data.artName ?? "Art";

    return {
      warnings,
      title: `Cast Art: ${artName}`,
      apply(next, receipt) {
        let updates = {};
        if (finalCost > 0) {
          updates = spendResource(actor, receipt, { pool: "flingerArtsPoints", amount: finalCost, label: "Flinger Arts Points" });
        }
        receipt.summary = `${actor.name} casts ${artName} for ${finalCost} Arts Point${finalCost === 1 ? "" : "s"}${isSelfOrTarget ? " (1 AP discount applied for self/target)" : ""}.`;
        receipt.result = { artName, baseCost, finalCost, isSelfOrTarget };
        return updates;
      }
    };
  },

  kineticStrike(actor, _state, data) {
    need(isFlinger(actor), "Kinetic Strike is a Flinger feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Kinetic Strike");

    const available = resourceValue(actor, { pool: "kineticStrike" });
    if (available < 1) {
      warn(warnings, "kineticStrike", "Kinetic Strike has already been used; uses clamp at 0.");
    }

    const bound = boundWeaponsList(actor);
    const weaponCount = Math.max(1, bound.length);
    const dc = flingerSpellDC(actor);
    const damageFormula = `${weaponCount * 4}d8`;
    const targetName = data.targetName ?? "Target";

    return {
      warnings,
      title: "Kinetic Strike",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "kineticStrike", amount: 1, label: "Kinetic Strike" });
        receipt.summary = `${actor.name} unleashes Kinetic Strike on ${targetName} within 100 ft: DC ${dc} Dex save or ${damageFormula} Arts Bludgeoning Damage (half on save). All Bound Weapons are placed adjacent to target.`;
        receipt.result = { dc, damageFormula, weaponCount, damageType: "arts bludgeoning" };
        return updates;
      }
    };
  },

  whirlingDeath(actor, _state, _data) {
    need(isFlinger(actor), "Whirling Death is a Flinger feature.");
    const warnings = [];
    levelWarning(warnings, actor, 18, "Whirling Death");

    const available = resourceValue(actor, { pool: "whirlingDeath" });
    if (available < 1) {
      warn(warnings, "whirlingDeath", "Whirling Death has already been used; uses clamp at 0.");
    }

    const dc = flingerSpellDC(actor);

    return {
      warnings,
      title: "Whirling Death",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "whirlingDeath", amount: 1, label: "Whirling Death" });
        updates["flags.ak5e.marksman.whirlingDeathActive"] = true;
        receipt.summary = `${actor.name} spins Bound Weapons into a 50-ft radius Whirling Death maelstrom: DC ${dc} Dex save or 8d8 Slashing Damage (half on save). Bound Weapons cannot move or attack while active.`;
        receipt.result = { dc, damageFormula: "8d8", radiusFt: 50, damageType: "slashing" };
        return updates;
      }
    };
  },

  endWhirlingDeath(actor, _state, _data) {
    need(isFlinger(actor), "Whirling Death is a Flinger feature.");
    return {
      warnings: [],
      title: "End Whirling Death",
      apply(next, receipt) {
        receipt.summary = `${actor.name} ends Whirling Death maelstrom. Bound Weapons resume floating.`;
        return {
          "flags.ak5e.marksman.whirlingDeathActive": false
        };
      }
    };
  }
};

marksmanUses.register({ plans: FLINGER_PLANS });

let installed = false;
export function registerFlingerHooks() {
  if (installed) return;
  installed = true;

  defineFlingerPools();
}

defineFlingerPools();
