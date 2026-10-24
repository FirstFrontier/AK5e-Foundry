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
import { weaponDamageParts, hasWeaponProperty, weaponPropertyValue } from "./weapon-properties.mjs";
import { marksmanAttackTarget } from "./marksman-context.mjs";

export const isBesieger = actor => marksmanEnabled(actor) && marksmanBranch(actor) === "besieger";

const targetUuids = data => [...new Set((Array.isArray(data.targetUuids) ? data.targetUuids : [data.targetUuid ?? data.targetActorUuid]).filter(Boolean))];
const PHYSICAL_DAMAGE_TYPES = new Set(["bludgeoning", "piercing", "slashing", "thunder"]);
const martialDcFor = (actor, data, warnings, feature) => {
  const dc = data.manualDC == null ? martialDC(actor, data.martialDcAbility) : Number(data.manualDC);
  if (dc != null && (!Number.isInteger(dc) || dc < 1 || dc > 99)) throw new Error("Enter a valid whole-number Martial DC.");
  if (dc == null) warn(warnings, "martialDC", `${feature}: choose Strength or Dexterity for Martial DC, or enter a manual DC for this use.`);
  return dc;
};
const addStep = (receipt, step) => { (receipt.resolution ??= { version: 1, steps: [] }).steps.push(step); };
const godpiercerReading = Object.freeze({
  label: "How Godpiercer Hit Point loss interacts with Damage Reduction, Resistance, and Temporary Hit Points for this use",
  options: Object.freeze([
    Object.freeze({ value: "currentHP", label: "Bypass Damage Reduction, Resistance, and Temporary Hit Points" }),
    Object.freeze({ value: "temporaryHP", label: "Bypass Damage Reduction and Resistance; Temporary Hit Points absorb the loss first" }),
    Object.freeze({ value: "ordinaryMitigation", label: "Apply Damage Reduction and Resistance; Temporary Hit Points absorb the loss first" })
  ])
});

const godpiercerPolicy = reading => {
  const value = reading?.value ?? reading;
  if (value === "currentHP") return { bypassDR: true, bypassResistance: true, bypassTemp: true };
  if (value === "temporaryHP") return { bypassDR: true, bypassResistance: true, bypassTemp: false };
  return { bypassDR: false, bypassResistance: false, bypassTemp: false };
};

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
  const state = flag(actor, "marksman") ?? {};
  if (!state.siegeMode) return false;
  const combat = globalThis.game?.combat;
  if (!combat?.started) return state.siegeModeTurn === `manual:${Number(state.manualTurn ?? 0)}`;
  const turns = Array.from(combat.turns ?? []);
  const index = turns.findIndex(turn => turn.actor?.uuid === actor.uuid);
  if (index < 0) return false;
  const round = Number(combat.round) + (index < Number(combat.turn) ? 1 : 0);
  return state.siegeModeTurn === `${combat.id}:${round}:${index}`;
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
    const warnings = [];
    const combat = globalThis.game?.combat;
    if (combat?.started && combat.combatant?.actor?.uuid !== actor.uuid) warn(warnings, "turn", "Siege Mode is entered at the beginning of your Turn.");
    const turns = Array.from(combat?.turns ?? []);
    const index = turns.findIndex(turn => turn.actor?.uuid === actor.uuid);
    const currentTurnKey = combat?.started && index >= 0
      ? `${combat.id}:${Number(combat.round) + (index < Number(combat.turn) ? 1 : 0)}:${index}`
      : `manual:${Number(flag(actor, "marksman")?.manualTurn ?? 0)}`;
    const pb = Number(actor.system?.attributes?.prof ?? 2);
    const crushBonus = 2 * pb;

    return {
      warnings,
      title: "Siege Mode",
      apply(next, receipt) {
        receipt.summary = `${actor.name} enters Siege Mode until end of Turn: Speed reduced to 0, +1d8 Damage (or Godpiercer 8 HP loss), Crush(${crushBonus}), ignores Brace and Long Range disadvantage.`;
        receipt.result = { siegeMode: true, turnKey: currentTurnKey, crushBonus };
        (receipt.targets ??= []).push({ uuid: actor.uuid, name: actor.name, kind: "marksmanOutcome", ready: true,
          payload: { effects: [{ label: "Siege Mode", changes: ["walk", "fly", "swim", "climb", "burrow"].map(type => ({ key: `system.attributes.movement.${type}`, mode: 5, value: 0 })),
            expiry: { actorUuid: actor.uuid, event: "turnEnd", turnKey: currentTurnKey } }] } });
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
        (receipt.targets ??= []).push({ uuid: actor.uuid, name: actor.name, kind: "marksmanOutcome", ready: true,
          payload: { removeLabels: ["Siege Mode"] } });
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
    if (!targetUuids(_data).length) warn(warnings, "target", "Select the Creature hit by this Attack.");
    if (!_data.weaponUuid) warn(warnings, "weapon", "Choose the ranged weapon used for this single Attack.");
    if (!_data.activityId) warn(warnings, "activity", "Choose the weapon activity for the single Attack.");
    if (!_data.actionId) warn(warnings, "action", "Bind Deliberate, Efficient to the Attack Action it modifies.");
    const currentAction = String(_data.actionId ?? "unbound");
    if (flag(actor, "marksman")?.deliberateEfficientAction === currentAction) warn(warnings, "used", "Deliberate, Efficient was already used for this Attack Action.");
    const godpiercer = marksmanLevel(actor) >= 18;
    const weapon = actor.items?.get?.(_data.weaponId) ?? Array.from(actor.items?.values?.() ?? actor.items ?? []).find(item =>
      Boolean(_data.weaponUuid && item.uuid === _data.weaponUuid) || Boolean(_data.weaponId && item.id === _data.weaponId));
    const weaponParts = weaponDamageParts(weapon);
    const damagePart = weaponParts[0];
    const damageTypes = new Set([...weaponParts.map(part => part.type), ...Array.from(weapon?.system?.damage?.base?.types ?? [])]);
    const hasPhysicalPart = [...damageTypes].some(type => PHYSICAL_DAMAGE_TYPES.has(type));

    return {
      warnings,
      title: "Deliberate, Efficient",
      reading: godpiercer ? "godpiercerMitigation" : null,
      apply(next, receipt, reading) {
        const targets = targetUuids(_data);
        const attackId = "deliberate-efficient-attack";
        receipt.summary = `${actor.name} makes one Attack as part of the Attack Action. Before level 18, Siege Mode and this Feature add 2d8 total; at level 18, they instead cause 16 Hit Point loss on a hit. The Attack ignores Physical Damage Reduction and Resistance.`;
        receipt.result = { deliberateEfficient: true, godpiercer, hpLoss: godpiercer ? 16 : 0 };
        const bonusPart = !godpiercer && damagePart ? { formula: "1d8", type: damagePart.type } : null;
        const consumeUpdates = { "flags.ak5e.marksman.deliberateEfficientAction": currentAction };
        addStep(receipt, { id: attackId, kind: "attack", label: "Deliberate, Efficient: single Attack", targetUuids: targets,
          weaponUuid: _data.weaponUuid, activityId: _data.activityId, actionId: currentAction, singleAttack: true,
          consumeUpdates, ...(hasPhysicalPart ? { ignoreDR: true, ignoreResistance: true, physicalOnly: true } : {}) });
        if (godpiercer) for (const targetUuid of targets) addStep(receipt, { id: `godpiercer-${encodeURIComponent(targetUuid)}`,
          kind: "hpLoss", label: "Godpiercer (Siege Mode and Deliberate, Efficient)", targetUuids: [targetUuid], amount: 16,
          requiresHit: true, attackStepId: attackId, hpLossPolicy: godpiercerPolicy(reading) });
        else if (bonusPart) for (const targetUuid of targets) addStep(receipt, { id: `deliberate-bonus-${encodeURIComponent(targetUuid)}`,
          kind: "damage", label: "Deliberate, Efficient: additional damage", targetUuids: [targetUuid], damageParts: [bonusPart],
          requiresHit: true, attackStepId: attackId, ...(PHYSICAL_DAMAGE_TYPES.has(bonusPart.type)
            ? { ignoreDR: true, ignoreResistance: true, physicalOnly: true } : {}) });
        return {};
      }
    };
  },

  godpiercerHit(actor, _state, data) {
    need(isBesieger(actor), "Godpiercer is a Besieger feature.");
    const warnings = [];
    levelWarning(warnings, actor, 18, "Godpiercer");
    if (!inSiegeMode(actor)) warn(warnings, "siegeMode", "Godpiercer's Siege Mode loss requires Siege Mode to have applied to the originating Attack.");
    if (!data.hitConfirmed) warn(warnings, "hit", "Confirm the originating Weapon Attack hit this Creature.");
    const targets = targetUuids(data);
    if (!targets.length) warn(warnings, "target", "Select the Creature hit by the originating Attack.");
    const deliberate = data.deliberateEfficient === true;
    return { warnings, title: "Godpiercer", reading: "godpiercerMitigation", apply(_next, receipt, reading) {
      const policy = godpiercerPolicy(reading);
      receipt.originMessageUuid = data.originMessageUuid ?? null;
      receipt.result = { amount: deliberate ? 16 : 8, deliberateEfficient: deliberate, policy, targets };
      const readingName = { currentHP: "bypasses Damage Reduction, Resistance, and Temporary Hit Points", temporaryHP: "bypasses Damage Reduction and Resistance; Temporary Hit Points absorb it first", ordinaryMitigation: "applies Damage Reduction and Resistance; Temporary Hit Points absorb it first" }[reading?.value ?? reading];
      receipt.summary = `${actor.name}'s Godpiercer Hit Point loss applies after a qualifying hit: ${deliberate ? "16" : "8"} Hit Points${deliberate ? " (Siege Mode and Deliberate, Efficient)" : " (Siege Mode)"}. Reading for this use: ${readingName}.`;
      for (const targetUuid of targets) addStep(receipt, { id: `godpiercer-${encodeURIComponent(targetUuid)}`, kind: "hpLoss", label: "Godpiercer: Hit Point loss",
        targetUuids: [targetUuid], amount: deliberate ? 16 : 8, requiresHit: true, originMessageUuid: data.originMessageUuid ?? null, hpLossPolicy: policy });
      return {};
    } };
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
    const dc = martialDcFor(actor, data, warnings, "Siege Bolt");
    const targets = targetUuids(data);
    if (!targets.length) warn(warnings, "target", "Choose the Creature or Object hit by Siege Bolt.");

    return {
      warnings,
      title: "Siege Bolt",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "siegeBolt", amount: 1, label: "Siege Bolt" });
        receipt.summary = `${actor.name} fires Siege Bolt at ${targetName}. Roll 5d8 Piercing Damage immediately; both save results take this initial damage. On a failed Dexterity save (objects automatically fail), the target takes another 5d8 at the end of each of its next two turns, unless a save at the beginning of its turn succeeds. All damage ignores Piercing Damage Reduction and Resistance.`;
        receipt.result = { dc, damageFormula: "5d8", ignoresDR: true, targets };
        for (const targetUuid of targets) {
          const groupId = `siege-bolt-${encodeURIComponent(targetUuid)}`;
          addStep(receipt, { id: `${groupId}-initial`, groupId, kind: "damage", label: "Siege Bolt: immediate damage", targetUuids: [targetUuid],
            damageParts: [{ formula: "5d8", type: "piercing" }], save: { ability: "dex", dc, success: "full", objectsFail: true },
            ignoreDR: true, ignoreResistance: true, sourceActorUuid: actor.uuid, endOnSuccess: true,
            endsStepIds: [1, 2].flatMap(occurrence => [`${groupId}-repeat-save-${occurrence}`, `${groupId}-tick-${occurrence}`]) });
          for (const occurrence of [1, 2]) {
            const tickId = `${groupId}-tick-${occurrence}`;
            addStep(receipt, { id: `${groupId}-repeat-save-${occurrence}`, groupId, kind: "effect", label: `Siege Bolt: beginning-of-turn Dexterity save ${occurrence}`,
              targetUuids: [targetUuid], save: { ability: "dex", dc, success: "full", objectsFail: true },
              trigger: { event: "turnStart", actorUuid: targetUuid, occurrence }, endOnSuccess: true,
              endsStepIds: [1, 2].filter(next => next >= occurrence).flatMap(next => [`${groupId}-tick-${next}`, ...(next > occurrence ? [`${groupId}-repeat-save-${next}`] : [])]),
              sourceActorUuid: actor.uuid });
            addStep(receipt, { id: tickId, groupId, kind: "damage", label: `Siege Bolt: end-of-turn damage ${occurrence}`, targetUuids: [targetUuid],
              damageParts: [{ formula: "5d8", type: "piercing" }], ignoreDR: true, ignoreResistance: true,
              trigger: { event: "turnEnd", actorUuid: targetUuid, occurrence },
              requiresFailedSaveStepIds: [`${groupId}-initial`, ...Array.from({ length: occurrence }, (_, index) => `${groupId}-repeat-save-${index + 1}`)],
              sourceActorUuid: actor.uuid });
          }
        }
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
    const dc = martialDcFor(actor, data, warnings, "Goliath's Bane");
    const targets = targetUuids(data);
    if (!targets.length) warn(warnings, "target", "Select the Creature hit by the qualifying ranged weapon Attack.");
    const turnKey = data.turnKey ?? currentTurnKey(actor);
    if (flag(actor, "marksman")?.goliathsBaneTurn === turnKey) warn(warnings, "repeat", "Goliath's Bane can trigger only once on each of your Turns.");
    if (data.rangedWeaponAttack !== true) warn(warnings, "attackType", "Confirm this was a Ranged Weapon Attack hit while Siege Mode was active.");

    return {
      warnings,
      title: "Goliath's Bane",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "goliathsBane", amount: 1, label: "Goliath's Bane" });
        updates["flags.ak5e.marksman.goliathsBaneTurn"] = turnKey;
        receipt.summary = `${actor.name} uses Goliath's Bane after a ranged weapon hit in Siege Mode. ${targetName} makes a Constitution save${dc == null ? " against the chosen manual Martial DC" : ` against DC ${dc}`}; failure Stuns them until the end of their next Turn.`;
        receipt.result = { dc, condition: "stunned", targets };
        for (const targetUuid of targets) addStep(receipt, { id: `goliaths-bane-${encodeURIComponent(targetUuid)}`, kind: "effect",
          label: "Goliath's Bane", targetUuids: [targetUuid], save: { ability: "con", dc, success: "full" },
          effects: [{ label: "Stunned", statuses: ["stunned"], when: "failed", expiry: { actorUuid: targetUuid, event: "nextTurnEnd" } }],
          requiresHit: true, sourceActorUuid: actor.uuid });
        return updates;
      }
    };
  }
};

function currentTurnKey(actor) {
  const combat = globalThis.game?.combat;
  if (!combat?.started) return `manual:${Number(flag(actor, "marksman")?.manualTurn ?? 0)}`;
  const index = Array.from(combat.turns ?? []).findIndex(turn => turn.actor?.uuid === actor.uuid);
  if (index < 0) return `${combat.id}:${combat.round}:offturn`;
  const round = Number(combat.round) + (index < Number(combat.turn) ? 1 : 0);
  return `${combat.id}:${round}:${index}`;
}

BESIEGER_PLANS.siegeMode.validateTarget = (source, _receipt, entry, target) => {
  const payload = entry.payload, effect = payload?.effects?.[0];
  const expected = new Set(["walk", "fly", "swim", "climb", "burrow"]);
  return entry.kind === "marksmanOutcome" && target.uuid === source.uuid && Object.keys(payload ?? {}).length === 1
    && payload.effects?.length === 1 && Object.keys(effect ?? {}).sort().join(",") === "changes,expiry,label"
    && effect.label === "Siege Mode" && effect.changes?.length === expected.size
    && effect.changes.every(change => expected.has(change.key?.split(".").at(-1)) && change.key.startsWith("system.attributes.movement.") && change.mode === 5 && Number(change.value) === 0)
    && effect.expiry?.actorUuid === source.uuid && effect.expiry.event === "turnEnd";
};
BESIEGER_PLANS.endSiegeMode.validateTarget = (source, _receipt, entry, target) => entry.kind === "marksmanOutcome" && target.uuid === source.uuid
  && Object.keys(entry.payload ?? {}).length === 1 && entry.payload?.removeLabels?.length === 1 && entry.payload.removeLabels[0] === "Siege Mode";
BESIEGER_PLANS.deliberateEfficient.validateTarget = (_source, _receipt, entry) => entry.kind === "marksmanOutcome" && false;
BESIEGER_PLANS.goliathsBane.validateTarget = () => false;

export const BESIEGER_READINGS = Object.freeze({ godpiercerTempHP: godpiercerReading, godpiercerMitigation: godpiercerReading });
BESIEGER_PLANS.besiegerHit = BESIEGER_PLANS.godpiercerHit;

marksmanUses.register({ plans: BESIEGER_PLANS, readings: BESIEGER_READINGS });

/* ---------------------------------------------------------------- Hooks */

export function besiegerPreRollAttack(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isBesieger(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll) return;

  const { token: targetToken, actor: targetActor, uuid: targetUuid } = marksmanAttackTarget(config);
  const attackerToken = actor.getActiveTokens?.()?.[0] ?? null;

  // Siege Mode attack roll modifications
  if (inSiegeMode(actor)) {
    roll.options ??= {};
    const ranged = activity.actionType === "rwak";
    roll.options.ak5eMarksman = { actorUuid: actor.uuid, weaponUuid: activity.item?.uuid, siegeMode: true,
      turnKey: flag(actor, "marksman")?.siegeModeTurn, godpiercerHpLoss: marksmanLevel(actor) >= 18 ? config.ak5eDeliberateEfficient ? 16 : 8 : 0,
      crush: ranged ? weaponPropertyValue(activity.item, "crush") + 2 * Number(actor.system?.attributes?.prof ?? 2) : 0,
      ignoreBrace: true, ignoreLongRangePenalty: true };
    if (config.range === "long" || roll.options.range === "long" || config.longRange === true) roll.options.disadvantage = false;
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

  // Between the Scales applies to Weapon Attacks against the locked Large+ Target.
  if (["mwak", "rwak"].includes(activity.actionType) && targetUuid && isTargetLocked(actor, targetUuid) && isLargeOrLarger(targetActor)) {
    roll.options ??= {};
    roll.options.advantage = true;
  }
}

export function besiegerPreRollDamage(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isBesieger(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll?.parts) return;
  const weapon = activity.item;
  const isWeaponAttack = weapon?.type === "weapon" && ["mwak", "rwak"].includes(activity.actionType);

  const { actor: targetActor } = marksmanAttackTarget(config);
  const level = marksmanLevel(actor);
  const isGodpiercer = level >= 18;

  // Large Target: Hide Piercer (+1 additional die of Damage vs Large or larger)
  if (isWeaponAttack && isLargeOrLarger(targetActor)) {
    const formula = weaponDamageParts(weapon)[0]?.formula || activity.damage?.parts?.[0]?.formula ||
      roll.parts.find(part => typeof part === "string" && /\bd\d+\b/i.test(part));
    const dieMatch = typeof formula === "string" ? formula.match(/d(\d+)/i) : null;
    if (dieMatch) roll.parts.push(`1d${dieMatch[1]}`);
    else {
      roll.options ??= {};
      roll.options.ak5eMarksmanWarnings ??= [];
      roll.options.ak5eMarksmanWarnings.push("Hide Piercer applies one additional weapon damage die, but no weapon damage die was available to copy; resolve this die manually.");
    }
  }

  // Siege Mode and Deliberate, Efficient damage modifications
  if (/^[mr][ws]ak$/.test(activity.actionType ?? "") && (roll.options?.ak5eMarksman?.siegeMode ?? inSiegeMode(actor))) {
    const crush = activity.actionType === "rwak" ? weaponPropertyValue(weapon, "crush") + 2 * Number(actor.system?.attributes?.prof ?? 2) : 0;
    roll.options ??= {};
    roll.options.ak5eMarksman = { ...(roll.options.ak5eMarksman ?? {}), actorUuid: actor.uuid, weaponUuid: weapon.uuid,
      turnKey: flag(actor, "marksman")?.siegeModeTurn, actionId: activity.id ?? activity._id ?? null,
      siegeMode: true, crush, minimumDamageAfterDR: crush, ignoreBrace: hasWeaponProperty(weapon, "brace"), ignoreLongRangePenalty: true };
    if (!isGodpiercer) {
      // Prior to 18th level: +1d8 from Siege Mode
      roll.parts.push("1d8");

      // Deliberate, Efficient: +1d8
    } else {
      // The per-hit HP loss is applied by the post-hit resolution workflow. This snapshot lets
      // that workflow verify which ordinary weapon damage roll qualified.
      roll.options.ak5eMarksman.godpiercerHpLoss ??= 8;
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
