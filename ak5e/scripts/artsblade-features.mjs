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
  GUARD_CLASS_ID, guardEnabled, guardLevel, guardBranch, martialDC, martialDCChoice
} from "./guard-rules.mjs";
import { guardUses } from "./guard-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { definePool, getPool, getPoolDefinition, refundPool } from "./resource-pools.mjs";
import { getReactions } from "./trigger-events.mjs";
import { need, values, flag, opaqueKey } from "./operation-kernel.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";
import { standardPools } from "./caster-rules.mjs";

export const isArtsblade = actor => guardEnabled(actor) && guardBranch(actor) === "artsblade";

const isMeleeAttackActivity = activity => activity?.actionType === "mwak" || activity?.attack?.type?.value === "melee";

/** A native Melee Weapon Item: it has a native melee Attack activity, or (older Items) a melee weapon type. */
export function isMeleeWeaponItem(item) {
  if (item?.type !== "weapon") return false;
  if (values(item.system?.activities).some(isMeleeAttackActivity)) return true;
  return ["simpleM", "martialM"].includes(item.system?.type?.value) || item.system?.actionType === "mwak";
}

/**
 * Resonance (L2272): "Melee Weapons being wielded by you are considered to have the Casting Unit Property." The wielded
 * (equipped) native melee weapons of an Artsblade, which is what Blade Art and every Spellsword Art are cast through.
 * Arts.mjs's own Casting Unit selection is separate: this property is only about those weapons.
 */
export function artsbladeCastingUnits(actor) {
  if (!isArtsblade(actor)) return [];
  return values(actor.items).filter(item => isMeleeWeaponItem(item) && item.system?.equipped === true);
}

/** True when this Item counts as a Casting Unit for the Actor through Resonance. */
export const hasCastingUnitProperty = (actor, item) => artsbladeCastingUnits(actor).some(unit => unit === item || unit.id === item?.id);

const castingUnitStep = actor => {
  const names = artsbladeCastingUnits(actor).map(item => item.name);
  return names.length
    ? `Casting Unit (Resonance): ${names.join(", ")} ${names.length === 1 ? "counts" : "count"} as a Casting Unit while wielded, so you may ignore the Somatic Components of this Art.`
    : "No melee weapon is equipped: Resonance makes wielded Melee Weapons Casting Units, so equip one before you make the Melee Weapon Attack this Art is cast through.";
};
export function getArtsbladePoolChoices(actor) {
  const choices = flag(actor, "guardProgression")?.choices ?? {};
  return [...new Set([...(choices.artPools ?? []), ...(choices.additionalArtPools ?? [])]
    .map(key => String(key).toLowerCase()).filter(key => Object.hasOwn(ARTS_POOLS, key)))];
}

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

/** Martial DC for one use (Ch.1 L211-212): this use's choice, else the Actor's stored Guard choice, else the higher of
 * STR/DEX with a warning that nothing was chosen. */
const chosenMartialDC = (actor, data, warnings, feature) => {
  const ability = ["str", "dex"].includes(data.martialDcAbility) ? data.martialDcAbility : martialDCChoice(actor);
  if (!ability) warn(warnings, "martialDCAbility", `${feature}: Chapter 1 lets you choose Strength or Dexterity for Martial DC. Nothing is chosen yet, so the higher of the two is used; choose an ability on the prompt or Use anyway.`);
  return martialDC(actor, ability ?? undefined);
};

const ARTSBLADE_READINGS = Object.freeze({
  earthResonanceDC: Object.freeze({
    label: "Level 10 Earth Improved Resonance save DC",
    options: Object.freeze([
      Object.freeze({ value: "spellDC", label: "Use the Actor's native Spell Save DC (or enter a manual DC if none is available)" }),
      Object.freeze({ value: "martialDC", label: "Use Martial DC for this use" })
    ])
  })
});

const ARTSBLADE_RESONANCE_FEATURE = "subclass-feature-guard-artsblade-1st-level-resonance-4121";
const resonanceRider = (pool, improved, outcome) => {
  if (outcome !== false) return null;
  const sourceInstructions = {
    frost: `Speed is halved until the end of your next Turn.${improved ? " Improved Resonance: you also have Disadvantage on Attack Rolls until then." : ""}`,
    flame: "You suffer Burning. Follow the source Burning condition's end procedure.",
    fluid: "You cannot take Reactions until the end of your next Turn. Track this restriction manually.",
    wind: "You begin Bleeding. Follow the source Bleeding condition's end procedure.",
    spatial: "You are knocked 20 feet directly away from the Artsblade; resolve collision and any collision damage manually.",
    earth: "You fall Prone."
  };
  const tag = { label: `Blade Art ${pool} Resonance`, expiryActor: "target", instructions: sourceInstructions[pool] };
  if (pool === "frost") {
    tag.trigger = "nextTurnEnd";
    tag.changes = ["walk", "fly", "swim", "climb", "burrow"].map(type => ({ key: `system.attributes.movement.${type}`, mode: 1, value: "0.5" }));
  } else if (pool === "fluid") tag.trigger = "nextTurnEnd";
  else if (pool === "flame") { tag.condition = "ak5e-burning"; tag.trigger = "manual"; }
  else if (pool === "wind") { tag.condition = "ak5e-bleeding"; tag.trigger = "manual"; }
  else if (pool === "earth") { tag.condition = "prone"; tag.trigger = "manual"; }
  else tag.trigger = "manual";
  return tag;
};

function validResonanceTarget(_source, receipt, entry, target) {
  const pool = receipt?.result?.pool ?? receipt?.data?.artPool ?? receipt?.data?.pool;
  const tag = resonanceRider(pool, receipt?.result?.isImproved === true, false);
  return Boolean(target && entry?.kind === "effect" && entry.uuid === target.uuid
    && entry.featureId === ARTSBLADE_RESONANCE_FEATURE && entry.meta?.pool === pool
    && (entry.meta?.outcome === "failedSave" || (pool === "wind" && receipt.result?.isImproved === true
      && receipt.result?.windDamageConfirmed?.actualDamage > 0 && entry.meta?.outcome === "damageApplied"))
    && entry.tag?.label === `Blade Art ${pool} Resonance`
    && entry.tag?.trigger === (pool === "flame" || pool === "wind" || pool === "earth" ? "manual" : "nextTurnEnd")
    && (pool !== "frost" || entry.tag?.changes?.length === 5)
    && JSON.stringify(entry.tag) === JSON.stringify(tag));
}

function nextTurnKey(actor) {
  const combat = globalThis.game?.combat;
  const turns = combat?.turns ?? [];
  const index = turns.findIndex(turn => turn.actor?.uuid === actor?.uuid);
  if (!combat?.started || index < 0 || !turns.length) return null;
  const current = Number(combat.turn ?? 0);
  const round = index <= current ? Number(combat.round ?? 0) + 1 : Number(combat.round ?? 0);
  return `${combat.id}:${round}:${index}`;
}

function currentTurnKey() {
  const combat = globalThis.game?.combat;
  return combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
}

function ordinalForTurnKey(key) {
  if (!key) return null;
  const [, round, turn] = String(key).split(":");
  const length = globalThis.game?.combat?.turns?.length ?? 0;
  return length ? Number(round) * length + Number(turn) : null;
}

function turnWindowActive(expiryKey) {
  const combat = globalThis.game?.combat;
  if (!combat?.started || !expiryKey || !String(expiryKey).startsWith(`${combat.id}:`)) return false;
  const current = `${combat.id}:${combat.round}:${combat.turn}`;
  return ordinalForTurnKey(current) <= ordinalForTurnKey(expiryKey);
}

function bladeArtManualSteps(poolKey, improved, formula, targetUuid, immuneToSave) {
  const base = {
    corrosion: "On Acid damage, apply matching Acid damage at the end of the target's next Turn.",
    earth: "Double your Reach through the end of this Turn, including for this Cantrip.",
    frost: "On damage, target makes a CON save vs Martial DC or Speed is halved until end of its next Turn.",
    flame: "On damage, target makes a DEX save vs Martial DC or gains Burning.",
    crude: "Your Melee Attacks gain +1 to Attack and Damage (+3 at level 10) until the end of your next Turn.",
    electric: "On hit, choose another visible creature within 15 feet; it takes half the original Lightning damage.",
    fluid: "On damage, target makes a CON save vs Martial DC or cannot take Reactions until end of its next Turn.",
    psychic: "On damage, target loses 1d6 HP. Roll separately; do not infer this from the damage roll.",
    light: "When cast, choose creatures within 10 feet; each takes Radiant damage equal to PB.",
    wind: improved ? "After the Cantrip actually deals damage, confirm the damage taken on this card to apply Bleeding without a save. A damage roll alone does not apply the condition." : "On damage, target makes a CON save vs Martial DC or begins Bleeding.",
    spatial: "On damage, target makes a STR save vs Martial DC or is knocked 20 feet directly away."
  }[poolKey];
  const upgraded = {
    corrosion: "Level 10: target suffers Corroded until end of its next Turn.",
    earth: "Level 10: a damaged creature, or one hit by your Melee Attack while your Reach is increased, makes a STR save against your Spell Save DC or falls Prone.",
    frost: "Level 10: a creature that fails the save also has Disadvantage on Attack Rolls until end of its next Turn.",
    flame: "Level 10: your Melee Weapon Attacks deal +1d10 Fire damage until end of your next Turn.",
    crude: "Level 10: the Force bonus is +3.",
    electric: "Level 10: choose up to two different additional visible creatures within 15 feet.",
    fluid: "Level 10: on a failed save, target can take only an Action or Bonus Action during its next Turn, not both.",
    psychic: "Level 10: the HP loss is 2d6; roll separately.",
    light: "Level 10: the radius is 20 feet.",
    wind: "Level 10: apply Bleeding without a save.",
    spatial: "Level 10: collision deals 3d10 Thunder damage to both the target and the object/creature it hits."
  }[poolKey];
  return [`Cast this Cantrip as part of a Melee Weapon Attack. Resolve that attack first; on a hit, add ${formula} ${ARTS_POOLS[poolKey].damageType} Arts damage through native damage controls.`, base,
    ...(improved ? [upgraded] : []),
    ...(targetUuid ? [immuneToSave ? "The target already made this Cantrip's save before your next-turn boundary; it does not save again." : "If the triggering attack damages this target and a save is required, resolve it through the target owner's native save button. The exemption is recorded only from that verified owner roll."] : [])];
}

function spellswordResolutionSteps(art, artName, level, dc, unleash, trueSpellsword) {
  const activity = values(art?.system?.activities)[0];
  const type = activity?.activation?.type ?? art?.system?.activation?.type ?? art?.system?.actionType ?? "unverified Art action";
  const area = activity?.target?.template?.type ?? art?.system?.target?.template?.type ?? art?.system?.target?.type;
  return [
    `Make the triggering Melee Weapon Attack, then resolve ${artName} at the fixed maximum Artsblade Art level ${level}; do not spend Arts Points. Action/casting-time metadata: ${type}.`,
    `Spell Save DC is Martial DC ${dc}. On a spell attack Art use that attack roll for both effects. For a save Art, the attacked creature still saves even if the melee attack misses.`,
    "Self-targeting Arts still target you. Non-damaging creature-target Arts may target creatures within 10 feet of you (including you). Other Arts targeting areas affect only the attacked creature; lingering area effects occupy its space; creations in unoccupied spaces may be placed within 10 feet of it.",
    ...(["cone", "cube", "sphere", "line"].includes(area) && unleash ? ["Unleash: use the normal area; cubes/spheres are centered on the attacked creature, cones/lines originate from you and include it. You are immune to damage from this Art."] : []),
    ...(trueSpellsword ? ["True Spellsword: until your next Turn, your Melee Attacks deal Arts Damage."] : []),
    "Resolve Art dice, attack/save rolls, damage, healing, and resulting effects manually through native controls; this receipt spends only the Spellsword Point."
  ];
}

function cutThroughChaosSteps(mode, clearPath, data = {}) {
  if (mode === "spellAttack") return [`Make a Melee Attack with your chosen weapon and compare its native roll total to the incoming Spell Attack total${data.incomingTotal == null ? " (consult the incoming attack card)" : ` ${data.incomingTotal}`}; only a strictly greater melee result makes that Spell Attack miss.`];
  if (mode === "savingThrow") return [`Make a Melee Attack with your chosen weapon and compare its native roll total to the Art's Save DC${data.incomingDC == null ? " (consult the effect)" : ` ${data.incomingDC}`}. Only a strictly greater melee result counts as a successful save. ${clearPath ? "Clear Path: success takes no damage; failure takes half damage." : ""} The Art's effect still applies on failure.`];
  return ["Choose a known Spellsword Art with Reaction casting time and an eligible trigger. Cast it without a Spellsword Point. Resolve its attack, save, damage, healing, and effect manually; this use does not roll or cast the Art for you."];
}

/* ---------------------------------------------------------------- Artsblade Plans */

const ARTSBLADE_PLANS = {
  bladeArt(actor, state, data) {
    need(isArtsblade(actor), "Blade Art is an Artsblade feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;
    const formula = bladeArtFormula(level);
    const selectedPools = getArtsbladePoolChoices(actor);
    const requestedPool = String(data.pool ?? data.artPool ?? selectedPools[0] ?? "").toLowerCase();
    const poolKey = ARTS_POOLS[requestedPool] ? requestedPool : (selectedPools[0] ?? "flame");
    const poolInfo = ARTS_POOLS[poolKey];
    if (!ARTS_POOLS[requestedPool]) warn(warnings, "pool", `Unknown Standard Arts Pool "${requestedPool || "(none)"}"; confirm the selected pool before use.`);
    if (selectedPools.length && !selectedPools.includes(requestedPool)) {
      warn(warnings, "pool", `${poolInfo.name} is not one of this Artsblade's selected Standard Arts Pools.`);
    }
    const mDC = chosenMartialDC(actor, data, warnings, "Blade Art");
    const isImproved = level >= 10;

    // Target single-save immunity window check
    const targetUuid = data.targetUuid ?? null;
    const combat = globalThis.game?.combat;
    const turnKey = combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
    const isUltimate = turnWindowActive(state.data?.ultimateBladeArtUntilTurn);
    const isAugmented = Boolean(turnKey && state.data?.augmentedAssaultTurn === turnKey);
    const castCount = state.data?.spellswordArtCastTurn === turnKey ? Number(state.data?.spellswordArtCastCount ?? 0) : 0;
    if (!isUltimate && turnKey && ((!isAugmented && castCount >= 1) || (isAugmented && castCount >= 2))) warn(warnings, "frequency", isAugmented ? "Augmented Assault allows only two Blade Art casts this Turn." : "You can cast only one Spellsword Art per Turn.");
    const saveMap = state.data?.bladeArtSaves;
    const lastSaved = saveMap?.[opaqueKey(targetUuid ?? "")]
      ?? saveMap?.[targetUuid]
      ?? String(targetUuid ?? "").split(".").reduce((value, key) => value?.[key], saveMap);
    const savedKey = lastSaved && lastSaved.combatId === combat?.id ? lastSaved.untilTurnKey : null;
    const immuneToSave = Boolean(targetUuid && savedKey && turnKey && ordinalForTurnKey(turnKey) < ordinalForTurnKey(savedKey));
    const saveAbility = { frost: "con", flame: "dex", fluid: "con", wind: isImproved ? null : "con", spatial: "str" }[poolKey];
    const hasEarthSave = poolKey === "earth" && isImproved;
    const nativeSpellDc = Number(actor.system?.attributes?.spell?.dc ?? actor.system?.attributes?.spelldc);
    const earthDcReading = data.readings?.earthResonanceDC ?? data.reading;
    const chosenEarthDc = earthDcReading === "spellDC" ? (Number(data.spellSaveDC) || (Number.isInteger(nativeSpellDc) ? nativeSpellDc : null)) : mDC;
    if (hasEarthSave && earthDcReading === "spellDC" && !chosenEarthDc) warn(warnings, "earthSpellDC", "The source calls for your Spell Save DC, but D&D5e has no native DC on this Actor. Enter it for this use; Use anyway records the unresolved DC.");
    const effectiveSaveDc = hasEarthSave ? (chosenEarthDc ?? mDC) : mDC;
    const reading = hasEarthSave ? "earthResonanceDC" : null;

    return {
      warnings,
      title: `Blade Art (${poolInfo.name})`,
      ...(reading ? { reading } : {}),
      costs: [],
      targets: targetUuid ? [{ uuid: targetUuid, name: data.targetName ?? targetUuid }] : [],
      // The confirm dialog lists targets only: say there that this one already made the save and does not repeat it.
      ...(immuneToSave ? { previewTargets: [{ uuid: targetUuid, name: `${data.targetName ?? targetUuid} (already made this Cantrip's saving throw; exempt from repeating it until the start of your next Turn)` }] } : {}),
      saves: targetUuid && (saveAbility || hasEarthSave) && !immuneToSave ? [{ id: "blade-resonance", saveId: "blade-resonance", afterRoll: true, uuid: targetUuid, name: data.targetName ?? targetUuid, ability: saveAbility ?? "str", dc: effectiveSaveDc, condition: "only after the triggering attack hits and deals damage" }] : [],
      damageParts: [{ formula, type: poolInfo.damageType }],
      formula,
      rollLabel: `Blade Art Damage (${formula} ${poolInfo.damageType.toUpperCase()})`,
      apply(next, receipt) {
        receipt.formula = formula;
        receipt.rollLabel = `Blade Art Arts damage (${poolInfo.damageType})`;
        if (turnKey) {
          next.data ??= {};
          next.data.spellswordArtCastTurn = turnKey;
          next.data.spellswordArtCastCount = castCount + 1;
        }
        // Temporary tracking for buffs from Resonance
        if (poolKey === "crude") {
          next.data ??= {};
          next.data.forceResonanceUntilTurn = nextTurnKey(actor);
          next.data.forceResonanceBonus = isImproved ? 3 : 1;
        }
        if (poolKey === "flame" && isImproved) {
          next.data ??= {};
          next.data.flameResonanceUntilTurn = nextTurnKey(actor);
        }

        receipt.damageParts = [{ formula, type: poolInfo.damageType }];
        receipt.formula = formula;
        receipt.rollLabel = `Blade Art (${poolInfo.damageType})`;
        receipt.summary = `${actor.name} casts Blade Art (${poolInfo.name} / ${poolInfo.damageType}). Deals ${formula} Arts Damage.${immuneToSave ? " Target already made the applicable saving throw this Turn; exempt from repeating it." : (saveAbility || hasEarthSave) && targetUuid ? ` If the triggering attack damages the target, it makes a ${(saveAbility ?? "str").toUpperCase()} save against DC ${effectiveSaveDc}; its owner resolves through the card.` : ` Target DC is ${mDC} (Martial DC).`}${isImproved ? " (Improved Resonance applied)" : ""}`;
        receipt.manualSteps = [castingUnitStep(actor), ...bladeArtManualSteps(poolKey, isImproved, formula, targetUuid, immuneToSave)];
        if (!nextTurnKey(actor) && (poolKey === "crude" || (poolKey === "flame" && isImproved))) {
          receipt.manualSteps.push(`Outside combat this ${poolKey === "crude" ? "Attack and Damage bonus" : "extra Fire Damage"} is not tracked automatically: add it to your Melee Attacks yourself and end it at the end of your next Turn.`);
        }
        if (poolKey === "wind" && isImproved && targetUuid) receipt.actions = [{
          id: "wind-bleeding", label: "Confirm actual Blade Art damage taken and apply Bleeding", targetUuid,
          requiresActualDamage: true
        }];
        receipt.summary += ` ${receipt.manualSteps.join(" ")}`;
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
      },
      resolveSave(_source, receipt, next, outcome) {
        next.data ??= {};
        next.data.bladeArtSaves ??= {};
        const expiryKey = nextTurnKey(actor);
        if (expiryKey) next.data.bladeArtSaves[opaqueKey(outcome.targetUuid)] = { targetUuid: outcome.targetUuid, combatId: globalThis.game.combat.id, untilTurnKey: expiryKey };
        receipt.result ??= {};
        receipt.result.saveResolved = { targetUuid: outcome.targetUuid, success: outcome.success, total: outcome.total, messageUuid: outcome.messageUuid };
        const tag = resonanceRider(poolKey, isImproved, outcome.success);
        if (outcome.targetUuid === targetUuid && !outcome.success && tag) {
          receipt.targets ??= [];
          receipt.targets.push({ uuid: targetUuid, saveId: "blade-resonance", name: data.targetName ?? targetUuid, kind: "effect",
            featureId: ARTSBLADE_RESONANCE_FEATURE, tag, ready: true,
            meta: { pool: poolKey, outcome: "failedSave" } });
          receipt.result.riderApplied = poolKey;
          receipt.manualSteps = [...(receipt.manualSteps ?? []), tag.instructions];
        }
        if (!expiryKey) receipt.undoNotes = [...(receipt.undoNotes ?? []), "Out of combat, the save exemption needs manual expiry at the beginning of your next Turn."];
      }
      ,
      resolveRoll(_source, receipt) {
        receipt.result ??= {};
        receipt.result.damageRollTotal = receipt.roll;
      },
      resolveAction(_source, receipt, _next, action) {
        need(poolKey === "wind" && isImproved && targetUuid && action.id === "wind-bleeding", "Choose this use's Improved Wind Resonance action.");
        need(action.damageApplied === true && Number.isFinite(action.actualDamage) && action.actualDamage > 0,
          "Confirm the positive damage actually taken from this Cantrip after immunity and reduction; a damage roll is not applied damage.");
        need(!action.targetUuid || action.targetUuid === targetUuid, "Choose the recorded Blade Art target.");
        if (receipt.result?.windDamageConfirmed) return;
        receipt.result.windDamageConfirmed = { targetUuid, actualDamage: action.actualDamage };
        receipt.targets.push({ uuid: targetUuid, name: data.targetName ?? targetUuid, kind: "effect",
          featureId: ARTSBLADE_RESONANCE_FEATURE, tag: resonanceRider("wind", true, false), ready: true,
          meta: { pool: "wind", outcome: "damageApplied" } });
        receipt.result.riderApplied = "wind";
        receipt.summary += ` The owner confirmed ${action.actualDamage} damage actually taken by the target; Improved Wind Resonance applies Bleeding without a save.`;
      },
      validateTarget: validResonanceTarget
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
    const hasUnleash = level >= 13 && data.unleash === true;

    return {
      warnings,
      title: "Press the Attack: Augmented Assault",
      costs: [{ label: "Aggression", amount: 2, pool: "aggression" }],
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 2, label: "Aggression" });
        next.data ??= {};
        next.data.augmentedAssaultTurn = currentTurnKey;
        next.data.augmentedAssaultUnleash = hasUnleash;
        receipt.summary = `${actor.name} activates Augmented Assault (2 Aggression): may cast two Spellsword Arts this Turn, both must be Blade Art.${hasUnleash ? " High Fantasy (Unleash): a qualifying cone, cube, sphere or line affects its normal area; cubes/spheres center on the target, cones/lines originate from you and include it, and you are immune to damage from the Art." : ""}`;
        receipt.result = { aggressionSpent: 2, augmentedAssault: true, unleash: hasUnleash };
        receipt.manualSteps = ["On this Turn, cast at most two Spellsword Arts; both must be Blade Art.", ...(hasUnleash ? ["For an Art with a cone, cube, sphere or line, use its normal area. Cubes/spheres are centered on the target; cones/lines originate from you and include it. You are immune to damage from this Art."] : [])];
        receipt.summary += ` ${receipt.manualSteps.join(" ")}`;
        return updates;
      }
    };
  },

  castSpellswordArt(actor, state, data) {
    need(isArtsblade(actor), "Casting Spellsword Arts is an Artsblade feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;
    const maxLevel = maxArtLevel(level);
    const artName = String(data.artName ?? "Spellsword Art").trim();

    const isBladeArt = artName.toLowerCase() === "blade art" || data.isBladeArt === true;
    const availableSP = resourceValue(actor, { pool: "spellswordPoints" });
    if (!isBladeArt && availableSP < 1) {
      warn(warnings, "spellswordPoints", `1 Spellsword Point needed and ${availableSP} remain; clamps at 0.`);
    }

    // Check once per turn restriction unless Augmented Assault or Ultimate Blade Art
    const combat = globalThis.game?.combat;
    const currentTurnKey = combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
    const isUltimate = turnWindowActive(state.data?.ultimateBladeArtUntilTurn);
    const isAugmented = Boolean(currentTurnKey && state.data?.augmentedAssaultTurn === currentTurnKey);
    const castCount = state.data?.spellswordArtCastTurn === currentTurnKey ? Number(state.data?.spellswordArtCastCount ?? 0) : 0;
    const spCost = isBladeArt ? 0 : 1;
    const artPool = String(data.artPool ?? "").toLowerCase();
    const selectedPools = getArtsbladePoolChoices(actor);
    const knownArts = values(actor.items).filter(item => item.type === "spell");
    const selectedArt = knownArts.find(item => item.name.toLowerCase() === artName.toLowerCase());
    if (!isBladeArt && !selectedArt) warn(warnings, "knownArt", `${artName} is not an owned Art Item. Verify it is learned from a selected Arts Pool and no higher than 5th level.`);
    if (selectedArt && Number(selectedArt.system?.level ?? 0) > maxLevel) warn(warnings, "artLevel", `${artName} exceeds the maximum level ${maxLevel} Artsblade can cast; the use is set to level ${maxLevel}.`);
    if (artPool && selectedPools.length && !selectedPools.includes(artPool)) warn(warnings, "pool", `${artPool} is not one of this Artsblade's selected Standard Arts Pools.`);
    if (!isBladeArt && selectedArt && artPool) {
      const sourceId = selectedArt.flags?.ak5e?.chapterFiveId ?? selectedArt.getFlag?.("ak5e", "chapterFiveId");
      const membership = selectedArt.flags?.ak5e?.guardArtsPools ?? selectedArt.flags?.ak5e?.casterArtGrants?.flatMap(grant => grant.poolIds ?? []) ??
        (sourceId ? standardPools.filter(pool => pool.members.some(member => member.sourceId === sourceId)).map(pool => pool.id) :
          standardPools.filter(pool => pool.members.some(member => member.name.toLowerCase() === artName.toLowerCase()
            && Number(member.level) === Number(selectedArt.system?.level))).map(pool => pool.id));
      const selectedPoolId = standardPools.find(pool => pool.id.includes(`-${artPool}-arts-`))?.id;
      if (!membership.includes(selectedPoolId)) warn(warnings, "artPoolMembership", `${artName} is not recorded as an Art from the selected ${artPool} Pool; verify its source before continuing.`);
    }

    if (isAugmented && !isBladeArt) warn(warnings, "augmentedAssault", "Augmented Assault permits its additional casts only when both are Blade Art.");
    if (!isUltimate && currentTurnKey && ((!isAugmented && castCount >= 1) || (isAugmented && castCount >= 2))) warn(warnings, "frequency", isAugmented ? "Augmented Assault permits no more than two Blade Art casts this Turn." : "You can cast only one Spellsword Art per Turn.");

    const castingLevel = maxLevel;
    const mDC = chosenMartialDC(actor, data, warnings, "Spellsword Art");
    const isTrueSpellsword = level >= 17;
    const unleash = data.unleash === true || state.data?.augmentedAssaultUnleash === true;
    if (unleash && (!isAugmented || level < 13)) warn(warnings, "unleash", "High Fantasy Unleash is available only at level 13+ while Augmented Assault is active.");

    return {
      warnings,
      title: `Cast Spellsword Art: ${artName}`,
      costs: spCost ? [{ label: "Spellsword Points", amount: spCost, pool: "spellswordPoints" }] : [],
      targets: data.targetUuid ? [{ uuid: data.targetUuid, name: data.targetName ?? data.targetUuid }] : [],
      apply(next, receipt) {
        const updates = spCost ? spendResource(actor, receipt, { pool: "spellswordPoints", amount: spCost, label: "Spellsword Points" }) : {};
        next.data ??= {};
        next.data.spellswordArtCastTurn = currentTurnKey;
        next.data.spellswordArtCastCount = castCount + 1;
        if (isTrueSpellsword) next.data.trueSpellswordUntilTurn = nextTurnKey(actor);

        receipt.summary = `${actor.name} ${spCost ? "expends 1 Spellsword Point" : "casts Blade Art without a Spellsword Point"} to infuse ${artName} at maximum Artsblade level ${castingLevel} into a Melee Weapon Attack. Spell Save DC is ${mDC} (Martial DC).${isTrueSpellsword ? " True Spellsword: Melee Attacks deal Arts Damage until beginning of your next Turn." : ""}`;
        receipt.manualSteps = [castingUnitStep(actor), ...spellswordResolutionSteps(selectedArt, artName, castingLevel, mDC, unleash && isAugmented && level >= 13, isTrueSpellsword)];
        receipt.summary += ` ${receipt.manualSteps.join(" ")}`;
        receipt.result = {
          artName,
          castingLevel,
          martialDC: mDC,
          trueSpellsword: isTrueSpellsword,
          spSpent: spCost
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

    const weapon = values(actor.items).find(item => item.type === "weapon" && item.uuid === data.weaponUuid);
    const activities = values(weapon?.system?.activities);
    const activity = activities.find(entry => entry.id === data.activityId)
      ?? activities.find(entry => entry.type === "attack" && (entry.actionType === "mwak" || entry.attack?.type?.value === "melee"));
    if (mode !== "reactionArt") {
      if (!weapon) warn(warnings, "weapon", "Select the equipped melee weapon used for this Reaction. Its native Attack control preserves its own ability, proficiency, magic and other modifiers; no generic attack roll will be substituted.");
      else {
        if (!weapon.system?.equipped) warn(warnings, "weaponEquipped", `${weapon.name} is not equipped.`);
        if (!activity || !(activity.actionType === "mwak" || activity.attack?.type?.value === "melee")) warn(warnings, "meleeWeapon", `${weapon.name} has no selected native melee Attack activity; resolve the melee Attack manually.`);
      }
    }
    const nativeAttack = weapon && activity ? { weaponUuid: weapon.uuid, activityId: activity.id } : null;
    return {
      warnings,
      title: "Cut Through Chaos",
      costs: [{ label: "Cut Through Chaos", amount: 1, pool: "cutThroughChaos" }],
      targets: data.targetUuid ? [{ uuid: data.targetUuid, name: data.targetName ?? data.targetUuid }] : [],
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "cutThroughChaos", amount: 1, label: "Cut Through Chaos" });
        receipt.reaction = { requested: true, triggerId: `${receipt.id}-cutThroughChaos`, receiptId: receipt.id };
        if (mode !== "reactionArt" && nativeAttack) receipt.nativeAttack = nativeAttack;

        let modeSummary = "";
        if (mode === "spellAttack") {
          modeSummary = "Compare your melee Attack Roll with the incoming Spell Attack Roll; only a strictly greater result makes it miss.";
        } else if (mode === "savingThrow") {
          modeSummary = `Compare your melee Attack Roll to the Art's Save DC; only a strictly greater result succeeds.${hasClearPath ? " Clear Path: take 0 damage on success and half damage on failure." : ""}`;
        } else {
          modeSummary = "Casts known Reaction Spellsword Art without expending a Spellsword Point.";
        }

        receipt.summary = `${actor.name} uses Cut Through Chaos as a Reaction (${mode}). ${modeSummary}`;
        receipt.manualSteps = cutThroughChaosSteps(mode, hasClearPath, data);
        receipt.summary += ` ${receipt.manualSteps.join(" ")}`;
        receipt.result = { mode, clearPath: hasClearPath, useSpent: 1 };
        return updates;
      },
      resolveRoll(_actor, receipt) {
        receipt.result ??= {};
        receipt.result.attackTotal = receipt.roll;
        const comparison = mode === "spellAttack" ? Number(data.incomingTotal) : Number(data.incomingDC);
        if (Number.isFinite(comparison)) {
          receipt.result.incomingTotal = comparison;
          receipt.result.success = Number(receipt.roll) > comparison;
          receipt.summary += ` Melee roll ${receipt.roll} ${receipt.result.success ? "exceeded" : "did not exceed"} the ${mode === "spellAttack" ? "incoming Spell Attack total" : "Art Save DC"} ${comparison}.`;
        } else {
          receipt.result.success = null;
          receipt.summary += " Compare the rolled total with the incoming Spell Attack or Art Save DC from the triggering effect; no comparison total was entered for this use.";
        }
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
      costs: [{ label: "Ultimate Blade Art", amount: 1, pool: "ultimateBladeArt" }],
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "ultimateBladeArt", amount: 1, label: "Ultimate Blade Art" });
        next.data ??= {};
        next.data.ultimateBladeArtUntilTurn = nextTurnKey(actor);
        receipt.summary = `${actor.name} activates Ultimate Blade Art: restriction on casting Spellsword Arts is removed through the end of their next Turn.`;
        receipt.manualSteps = ["Until the end of your next Turn, the normal once-per-Turn limit on Spellsword Arts is removed. Spend 1 Spellsword Point per Art and resolve each Art normally."];
        receipt.result = { ultimateBladeArtActive: true, useSpent: 1 };
        return updates;
      }
    };
  }
};

guardUses.register({ plans: ARTSBLADE_PLANS, readings: ARTSBLADE_READINGS });

/* ---------------------------------------------------------------- Hooks & Event Handlers */

export function artsbladePreRollAttack(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isArtsblade(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll) return;

  const state = flag(actor, "guardUses") ?? {};
  if (activity.actionType !== "mwak") return;

  // Crude (Force) Resonance: +1 or +3 bonus to melee attack rolls
  if (turnWindowActive(state.data?.forceResonanceUntilTurn)) {
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
  if (activity.actionType !== "mwak") return;

  // Crude (Force) Resonance: bonus to damage rolls
  if (turnWindowActive(state.data?.forceResonanceUntilTurn)) {
    const bonus = String(state.data.forceResonanceBonus ?? 1);
    roll.parts.push(bonus);
  }

  // Flame (Fire) Improved Resonance: a separate native Fire Damage Roll on melee attacks.
  if (turnWindowActive(state.data?.flameResonanceUntilTurn)) {
    config.rolls.push({
      parts: ["1d10"],
      data: roll.data,
      options: { ...structuredClone(roll.options ?? {}), type: "fire", types: ["fire"] }
    });
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
