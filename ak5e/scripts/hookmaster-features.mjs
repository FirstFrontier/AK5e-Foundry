/**
 * Hookmaster Specialist Subclass features (Ch. 3 L5585–5679).
 * Pure and functional logic, state inspection, resource pools, and mechanical hooks.
 * Supports Hooked weapon conversion and reversion, Big Boot, King of the Urban Jungle,
 * Bound in Rope, Wrangler, Hookmaster Prowess triggers, Mighty Push,
 * Spider's Essence (Longer Hook, Spider's Thread, Swing to Safety), and Scorpion Sting.
 */
import {
  SPECIALIST_CLASS_ID,
  isHookmaster as checkIsHookmaster,
  specialistLevel,
  specialistEnabled,
  pbForLevel,
  martialDC,
  flag
} from "./specialist-rules.mjs";
import { definePool, getPool, getPoolDefinition, refundPool } from "./resource-pools.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";
import { need } from "./operation-kernel.mjs";

export const HOOKMASTER_SUBCLASS_ID = "subclass-specialist-hookmaster";

export const SIZE_ORDER = Object.freeze({
  tiny: 0,
  sm: 1,
  small: 1,
  med: 2,
  medium: 2,
  lg: 3,
  large: 3,
  huge: 4,
  grg: 5,
  gargantuan: 5
});

let hooksInstalled = null;
let ak5eEventsInstalled = false;

export function getGameActors() {
  const actors = globalThis.game?.actors;
  if (!actors) return [];
  if (Array.isArray(actors)) return actors;
  if (Array.isArray(actors.contents)) return actors.contents;
  if (typeof actors.values === "function") return Array.from(actors.values());
  if (typeof actors[Symbol.iterator] === "function") {
    const list = Array.from(actors);
    if (list.length > 0 && Array.isArray(list[0]) && list[0].length === 2 && typeof list[0][1] === "object") {
      return list.map(entry => entry[1]);
    }
    return list;
  }
  return [];
}

/* ---------------------------------------------------------------- Identification & Predicates */

export function isHookmaster(actor) {
  if (!actor) return false;
  return checkIsHookmaster(actor);
}

export function calculateHookRange(actor) {
  const lvl = specialistLevel(actor) ?? 1;
  return lvl >= 15 ? 50 : 30;
}

export function hasBigBoot(actor) {
  return Boolean(isHookmaster(actor) && (specialistLevel(actor) >= 5));
}

export function hasKingOfUrbanJungle(actor) {
  return Boolean(isHookmaster(actor) && (specialistLevel(actor) >= 5));
}

export function hasBoundInRope(actor) {
  return Boolean(isHookmaster(actor) && (specialistLevel(actor) >= 5));
}

export function hasWrangler(actor) {
  return Boolean(isHookmaster(actor) && (specialistLevel(actor) >= 5));
}

export function hasMightyPush(actor) {
  return Boolean(isHookmaster(actor) && (specialistLevel(actor) >= 11));
}

export function hasSpidersEssence(actor) {
  return Boolean(isHookmaster(actor) && (specialistLevel(actor) >= 15));
}

export function hasLongerHook(actor) {
  return Boolean(isHookmaster(actor) && (specialistLevel(actor) >= 15));
}

export function hasSpidersThread(actor) {
  return Boolean(isHookmaster(actor) && (specialistLevel(actor) >= 15));
}

export function hasSwingToSafety(actor) {
  return Boolean(isHookmaster(actor) && (specialistLevel(actor) >= 15));
}

export function hasScorpionSting(actor) {
  return Boolean(isHookmaster(actor) && (specialistLevel(actor) >= 20));
}

/* ---------------------------------------------------------------- Creature Size Comparison */

export function getCreatureSize(actor) {
  if (!actor) return "med";
  const s = actor.system?.traits?.size?.value ?? actor.system?.traits?.size ?? "med";
  return String(s).toLowerCase();
}

export function getSizeValue(actor) {
  const size = getCreatureSize(actor);
  return SIZE_ORDER[size] ?? 2;
}

export function isNoMoreThanOneSizeLarger(actor, target) {
  const aVal = getSizeValue(actor);
  const tVal = getSizeValue(target);
  return tVal <= aVal + 1;
}

export function isMoreThanOneSizeLarger(actor, target) {
  const aVal = getSizeValue(actor);
  const tVal = getSizeValue(target);
  return tVal > aVal + 1;
}

/* ---------------------------------------------------------------- Weapon Inspection & Properties */

export function hasWeaponProperty(item, prop) {
  const props = item?.system?.properties;
  if (!props) return false;
  if (props instanceof Set || typeof props.has === "function") return props.has(prop);
  if (Array.isArray(props)) return props.includes(prop);
  if (typeof props === "object") return Boolean(props[prop]);
  return false;
}

export function getWeaponDamageTypes(item) {
  const types = new Set();
  const sys = item?.system;
  if (!sys) return types;

  if (sys.damage?.base?.type) types.add(String(sys.damage.base.type).toLowerCase());
  if (Array.isArray(sys.damage?.base?.types)) {
    for (const t of sys.damage.base.types) types.add(String(t).toLowerCase());
  }
  if (Array.isArray(sys.damage?.parts)) {
    for (const part of sys.damage.parts) {
      if (Array.isArray(part) && part[1]) types.add(String(part[1]).toLowerCase());
      else if (typeof part === "string") {
        const m = part.match(/\[(\w+)\]/);
        if (m) types.add(m[1].toLowerCase());
      }
    }
  }
  return types;
}

export function canConvertWeaponToHook(item) {
  const reasons = [];
  if (!item || item.type !== "weapon") {
    reasons.push("Item must be a weapon.");
    return { valid: false, reasons };
  }

  const sys = item.system ?? {};
  const isMelee = (sys.actionType === "mwak" || sys.actionType === undefined) &&
                  !hasWeaponProperty(item, "amm") &&
                  !String(sys.type?.value ?? "").toLowerCase().includes("ranged");

  if (!isMelee) {
    reasons.push("Weapon must be a Melee Weapon.");
  }

  if (hasWeaponProperty(item, "two") || hasWeaponProperty(item, "twoHanded")) {
    reasons.push("Weapon must not have the Two-Handed Property.");
  }

  const dmgTypes = getWeaponDamageTypes(item);
  const hasSlashingOrPiercing = dmgTypes.has("slashing") || dmgTypes.has("piercing");
  if (dmgTypes.size > 0 && !hasSlashingOrPiercing) {
    reasons.push("Weapon must deal Slashing or Piercing Damage.");
  }

  return {
    valid: reasons.length === 0,
    reasons
  };
}

export function isHookedWeapon(item) {
  if (!item) return false;
  return Boolean(
    item.getFlag?.("ak5e", "isHooked") ||
    item.flags?.ak5e?.isHooked ||
    item.getFlag?.("ak5e", "hookmaster")?.isHooked ||
    item.flags?.ak5e?.hookmaster?.isHooked
  );
}

export function isProficientWithHook(actor, item) {
  if (!isHookedWeapon(item)) return true;
  return isHookmaster(actor);
}

export function listItems(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === "function") return Array.from(collection.values());
  if (typeof collection[Symbol.iterator] === "function") {
    const list = Array.from(collection);
    if (list.length > 0 && Array.isArray(list[0]) && list[0].length === 2 && typeof list[0][1] === "object") {
      return list.map(entry => entry[1]);
    }
    return list;
  }
  return [];
}

export function getHookedWeapon(actor) {
  if (!actor?.items) return null;
  const items = listItems(actor.items);
  const hookId = actor.getFlag?.("ak5e", "hookmaster")?.hookedWeaponId ??
                 actor.flags?.ak5e?.hookmaster?.hookedWeaponId;
  if (hookId) {
    const foundById = items.find(i => i.id === hookId || i.uuid === hookId);
    if (foundById) return foundById;
  }

  const found = items.find(i => isHookedWeapon(i));
  if (found) return found;

  return null;
}

/* ---------------------------------------------------------------- Hookmaster State Model */

export function getHookmasterState(actor) {
  const f = actor?.getFlag?.("ak5e", "hookmaster") ?? actor?.flags?.ak5e?.hookmaster ?? {};
  return {
    freeConversionUsed: Boolean(f.freeConversionUsed),
    hookLocked: Boolean(f.hookLocked),
    grappledTarget: f.grappledTarget ?? null,
    wranglerTarget: f.wranglerTarget ?? null,
    urbanJungle: f.urbanJungle ?? null,
    meleeForcedMovementDoubled: Boolean(f.meleeForcedMovementDoubled),
    flyingMovementThisTurn: Number(f.flyingMovementThisTurn ?? 0),
    hookedWeaponId: f.hookedWeaponId ?? null,
    rangedHookAttacksThisTurn: Number(f.rangedHookAttacksThisTurn ?? 0),
    bonusActionHookAttackUsedThisTurn: Boolean(f.bonusActionHookAttackUsedThisTurn),
    lastRangedHookPullTarget: f.lastRangedHookPullTarget ?? null
  };
}

export function isHookLocked(actor) {
  return Boolean(getHookmasterState(actor).hookLocked);
}

/* ---------------------------------------------------------------- Hooked Weapon Conversion & Reversion */

export async function convertHookedWeapon(actor, item, { free = false } = {}) {
  need(isHookmaster(actor), "Only a Hookmaster may convert a weapon into a Hook.");
  need(item, "Weapon item is required for conversion.");
  const check = canConvertWeaponToHook(item);
  need(check.valid, `Cannot convert weapon: ${check.reasons.join(" ")}`);

  const rangeVal = calculateHookRange(actor);
  const origProps = item.system?.properties;
  const originalProperties = origProps instanceof Set ? Array.from(origProps) :
                             Array.isArray(origProps) ? [...origProps] :
                             origProps ? Object.keys(origProps).filter(k => origProps[k]) : [];
  const originalRange = structuredClone(item.system?.range ?? {});
  const originalItemState = {
    itemId: item.id ?? item.uuid,
    properties: originalProperties,
    range: originalRange,
    name: item.name
  };

  let newProperties;
  if (origProps instanceof Set) {
    newProperties = new Set(origProps);
    newProperties.add("two");
    newProperties.add("thr");
  } else if (Array.isArray(origProps)) {
    newProperties = Array.from(new Set([...origProps, "two", "thr"]));
  } else {
    newProperties = new Set([...originalProperties, "two", "thr"]);
  }

  const itemUpdates = {
    "system.properties": newProperties,
    "system.range.value": rangeVal,
    "system.range.long": null,
    "flags.ak5e.isHooked": true,
    "flags.ak5e.hookmaster.isHooked": true,
    "flags.ak5e.hookmaster.originalItemState": originalItemState
  };

  if (typeof item.update === "function") {
    await item.update(itemUpdates);
  } else {
    item.system.properties = newProperties;
    item.system.range = { value: rangeVal, long: null };
    ((item.flags ??= {}).ak5e ??= {}).isHooked = true;
    (item.flags.ak5e.hookmaster ??= {}).isHooked = true;
    item.flags.ak5e.hookmaster.originalItemState = originalItemState;
  }

  const actorUpdates = {
    "flags.ak5e.hookmaster.hookedWeaponId": item.id ?? item.uuid,
    "flags.ak5e.hookmaster.freeConversionUsed": free || Boolean(actor.flags?.ak5e?.hookmaster?.freeConversionUsed),
    "flags.ak5e.hookmaster.originalItemState": originalItemState
  };

  if (typeof actor.update === "function") {
    await actor.update(actorUpdates);
  } else {
    ((actor.flags ??= {}).ak5e ??= {}).hookmaster = {
      ...(actor.flags.ak5e.hookmaster ?? {}),
      hookedWeaponId: item.id ?? item.uuid,
      freeConversionUsed: free || Boolean(actor.flags.ak5e.hookmaster?.freeConversionUsed),
      originalItemState
    };
  }

  return { success: true, item, originalItemState };
}

export async function revertHookedWeapon(actor, item) {
  need(actor, "Actor is required.");
  const targetItem = item ?? getHookedWeapon(actor);
  need(targetItem, "No Hooked weapon found to revert.");

  const state = targetItem.getFlag?.("ak5e", "hookmaster")?.originalItemState ??
                targetItem.flags?.ak5e?.hookmaster?.originalItemState ??
                actor.getFlag?.("ak5e", "hookmaster")?.originalItemState ??
                actor.flags?.ak5e?.hookmaster?.originalItemState;

  const restoredProps = state?.properties ? (targetItem.system?.properties instanceof Set ? new Set(state.properties) : [...state.properties]) :
                        (targetItem.system?.properties instanceof Set ? (targetItem.system.properties.delete("two"), targetItem.system.properties.delete("thr"), targetItem.system.properties) :
                        Array.isArray(targetItem.system?.properties) ? targetItem.system.properties.filter(p => p !== "two" && p !== "thr") : []);

  const restoredRange = state?.range ?? { value: 5, long: null, reach: 5 };

  const itemUpdates = {
    "system.properties": restoredProps,
    "system.range": restoredRange,
    "flags.ak5e.isHooked": null,
    "flags.ak5e.hookmaster.isHooked": null
  };

  if (typeof targetItem.update === "function") {
    await targetItem.update(itemUpdates);
  } else {
    targetItem.system.properties = restoredProps;
    targetItem.system.range = restoredRange;
    if (targetItem.flags?.ak5e) {
      delete targetItem.flags.ak5e.isHooked;
      if (targetItem.flags.ak5e.hookmaster) delete targetItem.flags.ak5e.hookmaster.isHooked;
    }
  }

  const actorUpdates = {
    "flags.ak5e.hookmaster.hookedWeaponId": null
  };

  if (typeof actor.update === "function") {
    await actor.update(actorUpdates);
  } else if (actor.flags?.ak5e?.hookmaster) {
    actor.flags.ak5e.hookmaster.hookedWeaponId = null;
  }

  return { success: true, item: targetItem };
}

/* ---------------------------------------------------------------- Resource Pools */

export function defineHookmasterPools() {
  if (!getPoolDefinition("mightyPush")) {
    definePool({
      id: "mightyPush",
      label: "Mighty Push",
      max: "@prof",
      initial: "max",
      classId: SPECIALIST_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isHookmaster(actor) && (specialistLevel(actor) >= 11),
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }

  if (!getPoolDefinition("scorpionSting")) {
    definePool({
      id: "scorpionSting",
      label: "Scorpion Sting",
      max: 1,
      initial: "max",
      classId: SPECIALIST_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isHookmaster(actor) && (specialistLevel(actor) >= 20),
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
}

/* ---------------------------------------------------------------- Hook Handlers */

export function hookmasterPreRollAttack(config, _dialog, _message) {
  const actor = config?.subject?.actor ?? config?.actor;
  if (!actor || !isHookmaster(actor)) return;

  const item = config?.subject?.item ?? config?.item;
  const isHook = isHookedWeapon(item);
  const state = getHookmasterState(actor);

  for (const roll of config?.rolls ?? []) {
    roll.options ??= {};
    if (roll.options._ak5eHookmasterAttackApplied) continue;
    roll.options._ak5eHookmasterAttackApplied = true;

    // Hook Lockout & Urban Jungle restrictions (Ch. 3 L5622, L5640, L5597)
    if (isHook) {
      if (isHookLocked(actor)) {
        roll.options._ak5eHookLocked = true;
        globalThis.ui?.notifications?.warn?.(`${actor.name}'s Hook is locked while grappling a creature with Bound in Rope; attacks with the Hook are prohibited.`);
      }
      if (state.urbanJungle?.active) {
        roll.options._ak5eUrbanJungleAttackRestricted = true;
        globalThis.ui?.notifications?.warn?.(`${actor.name} cannot attack with their Hook while King of the Urban Jungle is active.`);
      }
      if (state.bonusActionHookAttackUsedThisTurn && (config.actionType === "rwak" || item?.system?.actionType === "rwak")) {
        roll.options._ak5eBonusActionHookAttackRestriction = true;
        globalThis.ui?.notifications?.warn?.(`Cannot make a Ranged Attack with your Hook: a Bonus Action Hook Attack was already used this turn.`);
      }
    }

    // STR modifier on Ranged Hook attacks (Ch. 3 L5595) & count tracking
    if (isHook && (config.actionType === "rwak" || item?.system?.actionType === "rwak")) {
      const strMod = actor.system?.abilities?.str?.mod ?? 0;
      const dexMod = actor.system?.abilities?.dex?.mod ?? 0;
      if (strMod > dexMod) {
        const diff = strMod - dexMod;
        roll.parts ??= [];
        roll.parts.push(`${diff}`);
      }
      const curAttacks = Number(actor.flags?.ak5e?.hookmaster?.rangedHookAttacksThisTurn ?? 0);
      if (typeof actor.update === "function") {
        actor.update({ "flags.ak5e.hookmaster.rangedHookAttacksThisTurn": curAttacks + 1 });
      } else if (actor.flags?.ak5e?.hookmaster) {
        actor.flags.ak5e.hookmaster.rangedHookAttacksThisTurn = curAttacks + 1;
      }
    }

    // Wrangler: Advantage on attacks against latched creature and optional -5 penalty for DR bypass (Ch. 3 L5644)
    const wrangler = state.wranglerTarget;
    if (wrangler?.uuid) {
      const targetUuids = [];
      if (config?.target?.uuid) targetUuids.push(config.target.uuid);
      if (config?.target?.id) targetUuids.push(config.target.id);
      if (config?.targetUuid) targetUuids.push(config.targetUuid);
      if (globalThis.game?.user?.targets) {
        for (const t of globalThis.game.user.targets) {
          if (t.actor?.uuid) targetUuids.push(t.actor.uuid);
          if (t.uuid) targetUuids.push(t.uuid);
          if (t.id) targetUuids.push(t.id);
        }
      }

      const isWranglerTarget = targetUuids.includes(wrangler.uuid) || targetUuids.includes(wrangler.id);
      if (isWranglerTarget) {
        roll.options.advantage = true;
        config.advantage = true;

        if (wrangler.ignoreDR || config.ignoreDR || roll.options?._ak5eWranglerIgnoreDR) {
          roll.parts ??= [];
          roll.parts.push("-5");
          roll.options._ak5eWranglerIgnoreDR = true;
          config.ignoreDR = true;
          config.ignoreDamageReduction = true;
        }
      }
    }
  }
}

export function hookmasterPreRollDamage(config, _dialog, _message) {
  const actor = config?.subject?.actor ?? config?.actor;
  if (!actor || !isHookmaster(actor)) return;

  const item = config?.subject?.item ?? config?.item;
  const isHook = isHookedWeapon(item);

  const roll = config?.rolls?.[0];
  if (!roll) return;
  roll.options ??= {};
  if (roll.options._ak5eHookmasterDamageApplied) return;
  roll.options._ak5eHookmasterDamageApplied = true;
  roll.parts ??= [];

  // STR modifier on Ranged Hook damage (Ch. 3 L5595)
  if (isHook && (config.actionType === "rwak" || item?.system?.actionType === "rwak")) {
    const strMod = actor.system?.abilities?.str?.mod ?? 0;
    const dexMod = actor.system?.abilities?.dex?.mod ?? 0;
    if (strMod > dexMod) {
      const diff = strMod - dexMod;
      roll.parts.push(`${diff}`);
    }
  }

  // King of the Urban Jungle: immediate melee attack deals +PB damage (Ch. 3 L5626)
  const state = getHookmasterState(actor);
  if (state.urbanJungle?.active) {
    const pb = pbForLevel(specialistLevel(actor));
    if (!roll._ak5eUrbanJungleApplied) {
      roll._ak5eUrbanJungleApplied = true;
      roll.parts.push(`${pb}`);
    }
  }

  // Wrangler DR bypass propagation to damage roll (Ch. 3 L5644)
  const wrangler = state.wranglerTarget;
  if (wrangler?.uuid) {
    const targetUuids = [];
    if (config?.target?.uuid) targetUuids.push(config.target.uuid);
    if (config?.target?.id) targetUuids.push(config.target.id);
    if (config?.targetUuid) targetUuids.push(config.targetUuid);
    if (globalThis.game?.user?.targets) {
      for (const t of globalThis.game.user.targets) {
        if (t.actor?.uuid) targetUuids.push(t.actor.uuid);
        if (t.uuid) targetUuids.push(t.uuid);
        if (t.id) targetUuids.push(t.id);
      }
    }
    const isWranglerTarget = targetUuids.includes(wrangler.uuid) || targetUuids.includes(wrangler.id);
    if (isWranglerTarget && (wrangler.ignoreDR || config.ignoreDR || roll.options?._ak5eWranglerIgnoreDR)) {
      roll.options.ignoreDamageReduction = true;
      roll.options.ignoreDR = true;
      config.options ??= {};
      config.options.ignoreDamageReduction = true;
      config.options.ignoreDR = true;
      config.ignoreDamageReduction = true;
      config.ignoreDR = true;
    }
  }

  // Scorpion Sting: +half Specialist level additional weapon damage (Ch. 3 L5669)
  if (config.isScorpionSting || roll.options._ak5eScorpionSting) {
    const bonus = Math.floor(specialistLevel(actor) / 2);
    if (!roll._ak5eScorpionStingApplied && bonus > 0) {
      roll._ak5eScorpionStingApplied = true;
      roll.parts.push(`${bonus}`);
    }
  }
}

/* ---------------------------------------------------------------- Lifecycle & Event Hooks */

export function registerHookmasterHooks() {
  defineHookmasterPools();

  if (globalThis.Hooks?.on && hooksInstalled !== globalThis.Hooks) {
    hooksInstalled = globalThis.Hooks;
    Hooks.on("dnd5e.preRollAttackV2", hookmasterPreRollAttack);
    Hooks.on("dnd5e.preRollDamageV2", hookmasterPreRollDamage);
  }

  if (ak5eEventsInstalled) return;
  ak5eEventsInstalled = true;

  // 1. Hit events: environmental damage prowess trigger, 10 ft pull on Ranged Hook hit, and immediate melee attacks
  onAk5eEvent("hit", async event => {
    const actor = event?.raw?.actor ?? (event?.actorUuid ? globalThis.fromUuidSync?.(event.actorUuid) : null);
    if (!actor || !isHookmaster(actor)) return;

    // Environmental / falling / collision damage prowess trigger (Ch. 3 L5648)
    const isEnvDamage = Boolean(
      event.environmental ||
      event.damageType === "falling" ||
      event.source === "environment" ||
      event.collision ||
      event.isFallingDamage
    );

    if (isEnvDamage) {
      await refundPool(actor, "prowess", 1, { reason: "Hookmaster environmental/falling/collision damage" });
    }

    // 10 ft pull on Ranged Hook attack hit (Ch. 3 L5596)
    const weapon = event.raw?.item ?? event.raw?.weapon ?? event.item ?? event.weapon;
    const isRangedHook = (event.actionType === "rwak" || event.isRanged) && (event.isHook || isHookedWeapon(weapon));
    if (isRangedHook) {
      const targetUuid = event.targetUuid ?? event.targetUuids?.[0] ?? event.targets?.[0]?.uuid;
      const targetActor = event.raw?.target ?? event.target ?? (targetUuid ? globalThis.fromUuidSync?.(targetUuid) : null);
      if (targetActor) {
        if (isNoMoreThanOneSizeLarger(actor, targetActor)) {
          globalThis.ui?.notifications?.info?.(`${targetActor.name ?? "Target"} is hit by a Ranged Hook Attack and can be pulled 10 feet towards ${actor.name}.`);
          const pullData = {
            uuid: targetUuid,
            name: targetActor.name ?? "Target",
            pullDistance: 10
          };
          if (typeof actor.update === "function") {
            await actor.update({ "flags.ak5e.hookmaster.lastRangedHookPullTarget": pullData });
          } else if (actor.flags?.ak5e?.hookmaster) {
            actor.flags.ak5e.hookmaster.lastRangedHookPullTarget = pullData;
          }
        }
      }
    }

    // Conclude King of the Urban Jungle immediate melee attack state, setting meleeForcedMovementDoubled flag (Ch. 3 L5626)
    const state = getHookmasterState(actor);
    if (state.urbanJungle?.active && (event.actionType === "mwak" || event.isMelee)) {
      const updates = {
        "flags.ak5e.hookmaster.urbanJungle.active": false,
        "flags.ak5e.hookmaster.meleeForcedMovementDoubled": true
      };
      if (typeof actor.update === "function") {
        await actor.update(updates);
      } else if (actor.flags?.ak5e?.hookmaster) {
        if (actor.flags.ak5e.hookmaster.urbanJungle) actor.flags.ak5e.hookmaster.urbanJungle.active = false;
        actor.flags.ak5e.hookmaster.meleeForcedMovementDoubled = true;
      }
    }
  });

  // 2. Kill event: release grapple or wrangler if target dies
  onAk5eEvent("kill", async event => {
    const deadUuid = event.actorUuid ?? event.tokenUuid;
    if (!deadUuid) return;

    const candidates = getGameActors();
    if (event.raw?.actor && !candidates.includes(event.raw.actor)) candidates.push(event.raw.actor);

    for (const actor of candidates) {
      if (!isHookmaster(actor)) continue;
      const state = getHookmasterState(actor);
      const updates = {};

      if (state.grappledTarget?.uuid === deadUuid || state.grappledTarget?.id === deadUuid) {
        updates["flags.ak5e.hookmaster.grappledTarget"] = null;
        updates["flags.ak5e.hookmaster.hookLocked"] = false;
      }

      if (state.wranglerTarget?.uuid === deadUuid || state.wranglerTarget?.id === deadUuid) {
        updates["flags.ak5e.hookmaster.wranglerTarget"] = null;
      }

      if (Object.keys(updates).length > 0) {
        if (typeof actor.update === "function") {
          await actor.update(updates);
        } else if (actor.flags?.ak5e?.hookmaster) {
          if (updates["flags.ak5e.hookmaster.grappledTarget"] !== undefined) actor.flags.ak5e.hookmaster.grappledTarget = null;
          if (updates["flags.ak5e.hookmaster.hookLocked"] !== undefined) actor.flags.ak5e.hookmaster.hookLocked = false;
          if (updates["flags.ak5e.hookmaster.wranglerTarget"] !== undefined) actor.flags.ak5e.hookmaster.wranglerTarget = null;
        }
      }
    }
  });

  // 3. Turn Start: reset turn counters
  onAk5eEvent("turnStart", async event => {
    const actor = event?.raw?.actor ?? (event?.actorUuid ? globalThis.fromUuidSync?.(event.actorUuid) : null);
    if (!actor || !isHookmaster(actor)) return;

    const updates = {
      "flags.ak5e.hookmaster.flyingMovementThisTurn": 0,
      "flags.ak5e.hookmaster.rangedHookAttacksThisTurn": 0,
      "flags.ak5e.hookmaster.bonusActionHookAttackUsedThisTurn": false,
      "flags.ak5e.hookmaster.meleeForcedMovementDoubled": false
    };

    if (typeof actor.update === "function") {
      await actor.update(updates);
    } else if (actor.flags?.ak5e?.hookmaster) {
      actor.flags.ak5e.hookmaster.flyingMovementThisTurn = 0;
      actor.flags.ak5e.hookmaster.rangedHookAttacksThisTurn = 0;
      actor.flags.ak5e.hookmaster.bonusActionHookAttackUsedThisTurn = false;
      actor.flags.ak5e.hookmaster.meleeForcedMovementDoubled = false;
    }
  });

  // 4. Turn End: flying movement prowess trigger & expire Urban Jungle
  onAk5eEvent("turnEnd", async event => {
    const actor = event?.raw?.actor ?? (event?.actorUuid ? globalThis.fromUuidSync?.(event.actorUuid) : null);
    if (!actor || !isHookmaster(actor)) return;

    const state = getHookmasterState(actor);

    // Flying > 45 ft prowess trigger (Ch. 3 L5648)
    const flyingMoved = Number(state.flyingMovementThisTurn ?? 0);
    if (flyingMoved > 45) {
      await refundPool(actor, "prowess", 1, { reason: "Hookmaster flying movement > 45 ft on turn" });
    }

    // Expire Urban Jungle and reset melee forced movement doubling
    if (state.urbanJungle?.active || state.meleeForcedMovementDoubled) {
      const updates = {};
      if (state.urbanJungle?.active) updates["flags.ak5e.hookmaster.urbanJungle.active"] = false;
      if (state.meleeForcedMovementDoubled) updates["flags.ak5e.hookmaster.meleeForcedMovementDoubled"] = false;

      if (typeof actor.update === "function") {
        await actor.update(updates);
      } else if (actor.flags?.ak5e?.hookmaster) {
        if (actor.flags.ak5e.hookmaster.urbanJungle) actor.flags.ak5e.hookmaster.urbanJungle.active = false;
        actor.flags.ak5e.hookmaster.meleeForcedMovementDoubled = false;
      }
    }
  });
}
