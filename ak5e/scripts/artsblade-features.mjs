/**
 * Artsblade subclass features (Ch.3 L2202-2417):
 * Sword and Sorcery (Spellsword Points, Max Art Level, Infused Melee Attacks, Augmented Assault),
 * Resonance (Arts-Touched, Blade Art cantrip 1d6-4d6 scaling, Casting Unit weapons, 11 damage types),
 * Cut Through Chaos (4th level, PB/LR: Spell Attack Deflection, Save Deflection, Free Reaction Art),
 * Sharpened Mind, Sharpened Weapon (10th level, 2 extra pools, Improved Resonance),
 * High Fantasy (13th level: Clear Path, Unleash normal AoE),
 * Power Overwhelming (17th level: Ceaseless, True Spellsword, Ultimate Blade Art 1/LR).
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

export const isArtsblade = actor => guardEnabled(actor) && guardBranch(actor) === "artsblade";

export const ARTSBLADE_SP_STEPS = Object.freeze({ 1: 1, 7: 2, 14: 3 });

export function maxArtLevel(level) {
  const lvl = Number(level) || 1;
  if (lvl >= 17) return 5;
  if (lvl >= 13) return 4;
  if (lvl >= 9) return 3;
  if (lvl >= 5) return 2;
  return 1;
}

export function bladeArtFormula(level) {
  const lvl = Number(level) || 1;
  if (lvl >= 17) return "4d6";
  if (lvl >= 11) return "3d6";
  if (lvl >= 5) return "2d6";
  return "1d6";
}

export const ARTS_POOLS = Object.freeze({
  corrosion: { id: "corrosion", name: "Corrosion", damageType: "acid" },
  crude: { id: "crude", name: "Crude", damageType: "force" },
  earth: { id: "earth", name: "Earth", damageType: "bludgeoning" },
  electric: { id: "electric", name: "Electric", damageType: "lightning" },
  flame: { id: "flame", name: "Flame", damageType: "fire" },
  fluid: { id: "fluid", name: "Fluid", damageType: "piercing" },
  frost: { id: "frost", name: "Frost", damageType: "cold" },
  light: { id: "light", name: "Light", damageType: "radiant" },
  psychic: { id: "psychic", name: "Psychic", damageType: "psychic" },
  spatial: { id: "spatial", name: "Spatial", damageType: "thunder" },
  wind: { id: "wind", name: "Wind", damageType: "slashing" }
});

export function defineArtsbladePools() {
  if (!getPoolDefinition("spellswordPoints")) {
    definePool({
      id: "spellswordPoints",
      label: "Spellsword Points",
      max: { ...ARTSBLADE_SP_STEPS },
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isArtsblade(actor),
      recovery: [{ on: "sr", amount: "toMax" }, { on: "lr", amount: "toMax" }]
    });
  }
  if (!getPoolDefinition("cutThroughChaos")) {
    definePool({
      id: "cutThroughChaos",
      label: "Cut Through Chaos",
      max: "@prof",
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isArtsblade(actor) && guardLevel(actor) >= 4,
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
  if (!getPoolDefinition("ultimateBladeArt")) {
    definePool({
      id: "ultimateBladeArt",
      label: "Ultimate Blade Art",
      max: 1,
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isArtsblade(actor) && guardLevel(actor) >= 17,
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
}

const levelWarning = (warnings, actor, requiredLevel, name) => {
  const current = guardLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${name} is an Artsblade level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

/* ---------------------------------------------------------------- Artsblade Plans */

const ARTSBLADE_PLANS = {
  bladeArt(actor, state, data) {
    need(isArtsblade(actor), "Blade Art is an Artsblade feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;
    const formula = bladeArtFormula(level);
    const poolKey = String(data.pool ?? "flame").toLowerCase();
    const poolInfo = ARTS_POOLS[poolKey] ?? ARTS_POOLS.flame;
    const mDC = martialDC(actor);
    const isImproved = level >= 10;

    // Target single-save immunity window check
    const targetUuid = data.targetUuid ?? null;
    const combat = globalThis.game?.combat;
    const turnKey = combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
    const lastSaved = state.data?.bladeArtSaves?.[targetUuid];
    const immuneToSave = Boolean(targetUuid && lastSaved && lastSaved === turnKey);

    return {
      warnings,
      title: `Blade Art (${poolInfo.name})`,
      damageParts: [{ formula, type: poolInfo.damageType }],
      formula,
      rollLabel: `Blade Art Damage (${formula} ${poolInfo.damageType.toUpperCase()})`,
      apply(next, receipt) {
        next.data ??= {};
        next.data.bladeArtSaves ??= {};
        if (targetUuid && turnKey) next.data.bladeArtSaves[targetUuid] = turnKey;

        // Temporary tracking for buffs from Resonance
        if (poolKey === "crude") {
          next.data.forceResonanceUntilTurn = turnKey;
          next.data.forceResonanceBonus = isImproved ? 3 : 1;
        }
        if (poolKey === "flame" && isImproved) {
          next.data.flameResonanceUntilTurn = turnKey;
        }

        receipt.damageParts = [{ formula, type: poolInfo.damageType }];
        receipt.formula = formula;
        receipt.rollLabel = `Blade Art (${poolInfo.damageType})`;
        receipt.summary = `${actor.name} casts Blade Art (${poolInfo.name} / ${poolInfo.damageType}). Deals ${formula} Arts Damage.${immuneToSave ? " Target already made saving throw against Blade Art this turn; exempt from repeated save." : ` Target DC is ${mDC} (Martial DC).`}${isImproved ? " (Improved Resonance applied)" : ""}`;
        receipt.result = {
          pool: poolKey,
          damageType: poolInfo.damageType,
          formula,
          martialDC: mDC,
          isImproved,
          targetUuid,
          immuneToSave
        };
        return {};
      }
    };
  },

  augmentedAssault(actor, state, data) {
    need(isArtsblade(actor), "Augmented Assault is an Artsblade feature.");
    const warnings = [];
    const available = resourceValue(actor, { pool: "aggression" });
    if (available < 2) {
      warn(warnings, "aggression", `2 Aggression needed and ${available} remain; Aggression clamps at 0.`);
    }

    const combat = globalThis.game?.combat;
    const currentTurnKey = combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
    if (currentTurnKey && state.data?.spellswordArtCastTurn === currentTurnKey) {
      warn(warnings, "castLimit", "A Spellsword Art has already been cast this Turn.");
    }

    const level = guardLevel(actor) ?? 1;
    const hasUnleash = level >= 13;

    return {
      warnings,
      title: "Press the Attack: Augmented Assault",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 2, label: "Aggression" });
        next.data ??= {};
        next.data.augmentedAssaultTurn = currentTurnKey;
        receipt.summary = `${actor.name} activates Augmented Assault (2 Aggression): may cast two Spellsword Arts this Turn, both must be Blade Art.${hasUnleash ? " High Fantasy (Unleash): area Arts affect normal area and caster is immune to own damage." : ""}`;
        receipt.result = { aggressionSpent: 2, augmentedAssault: true, unleash: hasUnleash };
        return updates;
      }
    };
  },

  castSpellswordArt(actor, state, data) {
    need(isArtsblade(actor), "Casting Spellsword Arts is an Artsblade feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;
    const maxLevel = maxArtLevel(level);

    const availableSP = resourceValue(actor, { pool: "spellswordPoints" });
    if (availableSP < 1) {
      warn(warnings, "spellswordPoints", `1 Spellsword Point needed and ${availableSP} remain; clamps at 0.`);
    }

    // Check once per turn restriction unless Augmented Assault or Ultimate Blade Art
    const combat = globalThis.game?.combat;
    const currentTurnKey = combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
    const isUltimate = Boolean(state.data?.ultimateBladeArtActive);
    const isAugmented = state.data?.augmentedAssaultTurn === currentTurnKey;

    if (!isUltimate && currentTurnKey && state.data?.spellswordArtCastTurn === currentTurnKey) {
      if (!isAugmented) {
        warn(warnings, "frequency", "You can only cast a Spellsword Art once per Turn.");
      }
    }

    const artName = String(data.artName ?? "Spellsword Art").trim();
    const castingLevel = Math.min(Number(data.castingLevel ?? maxLevel), maxLevel);
    const mDC = martialDC(actor);
    const isTrueSpellsword = level >= 17;

    return {
      warnings,
      title: `Cast Spellsword Art: ${artName}`,
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "spellswordPoints", amount: 1, label: "Spellsword Points" });
        next.data ??= {};
        next.data.spellswordArtCastTurn = currentTurnKey;
        if (isTrueSpellsword) next.data.trueSpellswordUntilTurn = currentTurnKey;

        receipt.summary = `${actor.name} expends 1 Spellsword Point to infuse ${artName} (Level ${castingLevel}) into a Melee Weapon Attack. Spell Save DC is ${mDC} (Martial DC).${isTrueSpellsword ? " True Spellsword: Melee Attacks deal Arts Damage until start of next Turn." : ""}`;
        receipt.result = {
          artName,
          castingLevel,
          martialDC: mDC,
          trueSpellsword: isTrueSpellsword,
          spSpent: 1
        };
        return updates;
      }
    };
  },

  cutThroughChaos(actor, _state, data) {
    need(isArtsblade(actor), "Cut Through Chaos is an Artsblade feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Cut Through Chaos");

    const available = resourceValue(actor, { pool: "cutThroughChaos" });
    if (available < 1) {
      warn(warnings, "cutThroughChaos", `1 use of Cut Through Chaos needed and ${available} remain.`);
    }

    const reactions = getReactions(actor);
    if (reactions?.available < 1) {
      warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    }

    const mode = String(data.mode ?? "spellAttack").trim(); // "spellAttack", "savingThrow", "reactionArt"
    const level = guardLevel(actor) ?? 1;
    const hasClearPath = level >= 13;

    return {
      warnings,
      title: "Cut Through Chaos",
      rolls: [
        { id: "cutAttack", label: "Cut Through Chaos Melee Attack Roll", formula: "1d20 + @abilities.str.mod + @attributes.prof" }
      ],
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "cutThroughChaos", amount: 1, label: "Cut Through Chaos" });
        const rx = await spendReaction(actor, { triggerId: `${receipt.id}-cutThroughChaos`, receipt: receipt.id });
        receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id };

        let modeSummary = "";
        if (mode === "spellAttack") {
          modeSummary = "Rolls Melee Attack; if higher than incoming Spell Attack Roll, spell misses.";
        } else if (mode === "savingThrow") {
          modeSummary = `Rolls Melee Attack; if higher than Spell Save DC, considered successful save.${hasClearPath ? " Clear Path: take 0 damage on success, half on failure." : ""}`;
        } else {
          modeSummary = "Casts known Reaction Spellsword Art without expending a Spellsword Point.";
        }

        receipt.summary = `${actor.name} uses Cut Through Chaos as a Reaction (${mode}). ${modeSummary}`;
        receipt.result = { mode, clearPath: hasClearPath, useSpent: 1 };
        return updates;
      }
    };
  },

  ultimateBladeArt(actor, state, _data) {
    need(isArtsblade(actor), "Ultimate Blade Art is an Artsblade feature.");
    const warnings = [];
    levelWarning(warnings, actor, 17, "Ultimate Blade Art");

    const available = resourceValue(actor, { pool: "ultimateBladeArt" });
    if (available < 1) {
      warn(warnings, "ultimateBladeArt", `1 use of Ultimate Blade Art needed and ${available} remain.`);
    }

    return {
      warnings,
      title: "Ultimate Blade Art",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "ultimateBladeArt", amount: 1, label: "Ultimate Blade Art" });
        next.data ??= {};
        next.data.ultimateBladeArtActive = true;
        receipt.summary = `${actor.name} activates Ultimate Blade Art: restriction on casting Spellsword Arts per Round/Turn is removed until the end of their next Turn.`;
        receipt.result = { ultimateBladeArtActive: true, useSpent: 1 };
        return updates;
      }
    };
  }
};

guardUses.register({ plans: ARTSBLADE_PLANS });

/* ---------------------------------------------------------------- Hooks & Event Handlers */

export function artsbladePreRollAttack(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isArtsblade(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll) return;

  const state = flag(actor, "guardUses") ?? {};
  const combat = globalThis.game?.combat;
  const turnKey = combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;

  // Crude (Force) Resonance: +1 or +3 bonus to melee attack rolls
  if (state.data?.forceResonanceUntilTurn && state.data.forceResonanceUntilTurn === turnKey) {
    const bonus = String(state.data.forceResonanceBonus ?? 1);
    roll.parts.push(bonus);
  }
}

export function artsbladePreRollDamage(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isArtsblade(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll?.parts) return;

  const state = flag(actor, "guardUses") ?? {};
  const combat = globalThis.game?.combat;
  const turnKey = combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;

  // Crude (Force) Resonance: bonus to damage rolls
  if (state.data?.forceResonanceUntilTurn && state.data.forceResonanceUntilTurn === turnKey) {
    const bonus = String(state.data.forceResonanceBonus ?? 1);
    roll.parts.push(bonus);
  }

  // Flame (Fire) Improved Resonance: +1d10 Fire damage on melee attacks
  if (state.data?.flameResonanceUntilTurn && state.data.flameResonanceUntilTurn === turnKey) {
    roll.parts.push("1d10");
  }
}

let installed = false;

export function registerArtsbladeHooks() {
  if (installed) return;
  installed = true;

  defineArtsbladePools();

  // Ceaseless (17th level): on Initiative, gain 1 SP if below max
  onAk5eEvent("initiative", async event => {
    const actor = event?.raw?.actor ?? (event?.actorUuid ? globalThis.fromUuidSync?.(event.actorUuid) : (event?.actor ?? event));
    if (!actor || !isArtsblade(actor)) return;
    const level = guardLevel(actor) ?? 1;
    if (level >= 17) {
      const sp = getPool(actor, "spellswordPoints");
      if (sp && sp.value < sp.max) {
        await refundPool(actor, "spellswordPoints", 1, { reason: "Ceaseless" });
      }
    }
  });

  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollAttackV2", artsbladePreRollAttack);
    Hooks.on("dnd5e.preRollDamageV2", artsbladePreRollDamage);
  }
}

defineArtsbladePools();
