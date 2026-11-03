/**
 * Executor Specialist Subclass features (Ch. 3 L5498–5578).
 * Pure and functional logic, state inspection, resource pools, and mechanical hooks.
 * Supports Hunter and Bodyguard paths, Deathmark tracking, In Every Shadow, Sweeper,
 * Smokescreen, Preysense, Dangersense, In for the Kill, Blade Shield, Mortal Blow,
 * Ultimate Sword and Shield, and Executor Prowess gain triggers.
 */
import {
  SPECIALIST_CLASS_ID, isExecutor as checkIsExecutor, specialistLevel,
  specialistEnabled, pbForLevel, martialDC, flag
} from "./specialist-rules.mjs";
import { definePool, getPool, getPoolDefinition, refundPool } from "./resource-pools.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";
import { need } from "./operation-kernel.mjs";

export const EXECUTOR_PATHS = Object.freeze({
  HUNTER: "hunter",
  BODYGUARD: "bodyguard"
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


/* ---------------------------------------------------------------- Identification & Path */

export function isExecutor(actor) {
  if (!actor) return false;
  return checkIsExecutor(actor);
}

export function getExecutorPath(actor) {
  if (!actor) return null;
  const flagPath = actor.getFlag?.("ak5e", "executor")?.path ?? actor.flags?.ak5e?.executor?.path;
  if (flagPath === EXECUTOR_PATHS.HUNTER || flagPath === EXECUTOR_PATHS.BODYGUARD) return flagPath;

  const progPath = actor.getFlag?.("ak5e", "specialistProgression")?.choices?.executorPath ??
                   actor.flags?.ak5e?.specialistProgression?.choices?.executorPath;
  if (progPath === EXECUTOR_PATHS.HUNTER || progPath === EXECUTOR_PATHS.BODYGUARD) return progPath;

  const items = Array.from(actor.items ?? []);
  for (const item of items) {
    if (item.type === "subclass" && item.name?.toLowerCase().includes("executor")) {
      const itemPath = item.getFlag?.("ak5e", "executorPath") ?? item.flags?.ak5e?.executorPath;
      if (itemPath === EXECUTOR_PATHS.HUNTER || itemPath === EXECUTOR_PATHS.BODYGUARD) return itemPath;
      if (item.name.toLowerCase().includes("hunter")) return EXECUTOR_PATHS.HUNTER;
      if (item.name.toLowerCase().includes("bodyguard")) return EXECUTOR_PATHS.BODYGUARD;
    }
  }
  return null;
}

export async function setExecutorPath(actor, path) {
  need(path === EXECUTOR_PATHS.HUNTER || path === EXECUTOR_PATHS.BODYGUARD, `Invalid Executor path: ${path}`);
  if (typeof actor.update === "function") {
    await actor.update({ "flags.ak5e.executor.path": path });
  } else if (actor.flags) {
    (actor.flags.ak5e ??= {}).executor = { ...(actor.flags.ak5e.executor ?? {}), path };
  }
  return path;
}

/* ---------------------------------------------------------------- Deathmark State Model */

export function getDeathmarkState(actor) {
  const dm = actor?.getFlag?.("ak5e", "executor")?.deathmark ??
             actor?.flags?.ak5e?.executor?.deathmark ??
             actor?.getFlag?.("ak5e", "specialist")?.deathmark ??
             actor?.flags?.ak5e?.deathmark;

  if (!dm) {
    return {
      held: true,
      holder: "self",
      targetUuid: null,
      targetName: null,
      transferredTurn: null,
      attackedOrDamagedThisTurn: false
    };
  }

  const holder = dm.holder ?? (dm.held ? "self" : dm.targetUuid ? "target" : "self");
  const held = holder === "self";

  return {
    held,
    holder,
    targetUuid: dm.targetUuid ?? null,
    targetName: dm.targetName ?? null,
    transferredTurn: dm.transferredTurn ?? null,
    attackedOrDamagedThisTurn: Boolean(dm.attackedOrDamagedThisTurn)
  };
}

export async function setDeathmark(actor, target, { combatTurnKey = null } = {}) {
  const targetUuid = target?.uuid ?? target?.id ?? null;
  const targetName = target?.name ?? "Marked Creature";
  need(targetUuid, "Cannot transfer Deathmark without a valid target.");

  const newState = {
    held: false,
    holder: "target",
    targetUuid,
    targetName,
    transferredTurn: combatTurnKey,
    attackedOrDamagedThisTurn: true
  };

  const updates = {
    "flags.ak5e.executor.deathmark": newState
  };

  if (hasInForTheKill(actor)) {
    updates["flags.ak5e.inForTheKillVulnerable"] = true;
  }

  if (typeof actor.update === "function") {
    await actor.update(updates);
  } else if (actor.flags) {
    (actor.flags.ak5e ??= {}).executor = { ...(actor.flags.ak5e.executor ?? {}), deathmark: newState };
  }

  return newState;
}

export async function recallDeathmark(actor, { reason = "Deathmark recalled" } = {}) {
  const prior = getDeathmarkState(actor);
  const newState = {
    held: true,
    holder: "self",
    targetUuid: null,
    targetName: null,
    transferredTurn: null,
    attackedOrDamagedThisTurn: false
  };

  const updates = {
    "flags.ak5e.executor.deathmark": newState
  };

  // Grant 3 Skill Points per source rules (Ch. 3 L5508)
  if (globalThis.game?.ak5e?.adjustSkillPoints) {
    await globalThis.game.ak5e.adjustSkillPoints(actor, 3, { reason });
  } else if (actor.flags) {
    const curSP = Number(actor.flags.ak5e?.operatorSkill?.points ?? 0);
    updates["flags.ak5e.operatorSkill.points"] = curSP + 3;
  }

  if (typeof actor.update === "function") {
    await actor.update(updates);
  } else if (actor.flags) {
    (actor.flags.ak5e ??= {}).executor = { ...(actor.flags.ak5e.executor ?? {}), deathmark: newState };
  }

  return {
    previous: prior,
    current: newState,
    spGained: 3,
    reactionDisengageAvailable: true
  };
}

export async function clearDeathmark(actor) {
  const cleared = {
    held: true,
    holder: "self",
    targetUuid: null,
    targetName: null,
    transferredTurn: null,
    attackedOrDamagedThisTurn: false
  };
  if (typeof actor.update === "function") {
    await actor.update({ "flags.ak5e.executor.deathmark": cleared });
  } else if (actor.flags) {
    (actor.flags.ak5e ??= {}).executor = { ...(actor.flags.ak5e.executor ?? {}), deathmark: cleared };
  }
  return cleared;
}

/* ---------------------------------------------------------------- Calculation Helpers */

export function calculateDeathmarkDamageBonus(level) {
  const lvl = Number(level) || 1;
  if (lvl >= 14) return "3d4";
  if (lvl >= 7) return "2d4";
  return "1d4";
}

export function deathmarkCritRangeBonus(actor, target) {
  if (!isExecutor(actor) || getExecutorPath(actor) !== EXECUTOR_PATHS.HUNTER) return 0;
  const dm = getDeathmarkState(actor);
  if (dm.holder === "target" && (target?.uuid === dm.targetUuid || target?.id === dm.targetUuid)) {
    return 1;
  }
  return 0;
}

export function canRedirectAttack(actor, target, distanceToTarget) {
  if (!isExecutor(actor) || getExecutorPath(actor) !== EXECUTOR_PATHS.BODYGUARD) return false;
  const dm = getDeathmarkState(actor);
  if (dm.holder !== "target") return false;
  return Number(distanceToTarget ?? 0) <= 10;
}

/* ---------------------------------------------------------------- Feature Predicates */

export function hasInEveryShadow(actor) {
  return Boolean(isExecutor(actor) && (specialistLevel(actor) >= 5));
}

export function hasSweeper(actor) {
  return Boolean(isExecutor(actor) && (specialistLevel(actor) >= 5) && (getExecutorPath(actor) === EXECUTOR_PATHS.HUNTER));
}

export function hasSmokescreen(actor) {
  return Boolean(isExecutor(actor) && (specialistLevel(actor) >= 5) && (getExecutorPath(actor) === EXECUTOR_PATHS.BODYGUARD));
}

export function hasPreysense(actor) {
  return Boolean(isExecutor(actor) && (specialistLevel(actor) >= 11) && (getExecutorPath(actor) === EXECUTOR_PATHS.HUNTER));
}

export function hasDangersense(actor) {
  return Boolean(isExecutor(actor) && (specialistLevel(actor) >= 11) && (getExecutorPath(actor) === EXECUTOR_PATHS.BODYGUARD));
}

export function hasInForTheKill(actor) {
  return Boolean(isExecutor(actor) && (specialistLevel(actor) >= 15) && (getExecutorPath(actor) === EXECUTOR_PATHS.HUNTER));
}

export function hasBladeShield(actor) {
  return Boolean(isExecutor(actor) && (specialistLevel(actor) >= 15) && (getExecutorPath(actor) === EXECUTOR_PATHS.BODYGUARD));
}

export function hasMortalBlow(actor) {
  return Boolean(isExecutor(actor) && (specialistLevel(actor) >= 20) && (getExecutorPath(actor) === EXECUTOR_PATHS.HUNTER));
}

export function hasUltimateSwordAndShield(actor) {
  return Boolean(isExecutor(actor) && (specialistLevel(actor) >= 20) && (getExecutorPath(actor) === EXECUTOR_PATHS.BODYGUARD));
}

export async function applyInEveryShadow(actor) {
  if (!hasInEveryShadow(actor)) return {};
  const walkSpeed = actor.system?.attributes?.movement?.walk ?? 30;
  const currentClimb = actor.system?.attributes?.movement?.climb ?? 0;
  const currentSwim = actor.system?.attributes?.movement?.swim ?? 0;
  const currentStealth = actor.system?.skills?.ste?.value ?? 0;
  const updates = {};
  if (currentClimb < walkSpeed) updates["system.attributes.movement.climb"] = walkSpeed;
  if (currentSwim < walkSpeed) updates["system.attributes.movement.swim"] = walkSpeed;
  const newStealth = currentStealth >= 1 ? 2 : 1;
  if (currentStealth < newStealth) updates["system.skills.ste.value"] = newStealth;
  if (Object.keys(updates).length > 0 && typeof actor.update === "function") {
    await actor.update(updates);
  }
  return updates;
}

/* ---------------------------------------------------------------- Resource Pools */

export function defineExecutorPools() {
  if (getPoolDefinition("mortalBlow")) return;
  definePool({
    id: "mortalBlow",
    label: "Mortal Blow",
    max: 1,
    initial: "max",
    classId: SPECIALIST_CLASS_ID,
    levelBasis: "classLevel",
    appliesTo: actor => isExecutor(actor) && getExecutorPath(actor) === EXECUTOR_PATHS.HUNTER && (specialistLevel(actor) >= 20),
    recovery: [{ on: "lr", amount: "toMax" }]
  });
}

/* ---------------------------------------------------------------- Hook Handlers */

export function executorPreRollAttack(config, _dialog, _message) {
  const actor = config?.subject?.actor ?? config?.actor;
  if (!actor || !isExecutor(actor) || getExecutorPath(actor) !== EXECUTOR_PATHS.HUNTER) return;

  const dm = getDeathmarkState(actor);
  if (dm.holder !== "target" || !dm.targetUuid) return;

  // Resolve targets from config or active user targets
  const targetUuids = [];
  if (config?.target?.uuid) targetUuids.push(config.target.uuid);
  if (config?.target?.id) targetUuids.push(config.target.id);
  if (globalThis.game?.user?.targets) {
    for (const t of globalThis.game.user.targets) {
      if (t.actor?.uuid) targetUuids.push(t.actor.uuid);
      if (t.uuid) targetUuids.push(t.uuid);
      if (t.id) targetUuids.push(t.id);
    }
  }

  const isTargetMarked = targetUuids.includes(dm.targetUuid) || (!targetUuids.length && config?.targetUuid === dm.targetUuid);
  if (isTargetMarked) {
    for (const roll of config.rolls ?? []) {
      roll.options ??= {};
      if (roll.options._ak5eDeathmarkCritApplied) continue;
      roll.options._ak5eDeathmarkCritApplied = true;
      roll.options.criticalSuccess = Math.min(Number(roll.options.criticalSuccess ?? 20) - 1, 19);
      roll.options.criticalThreshold = Math.min(Number(roll.options.criticalThreshold ?? 20) - 1, 19);
    }
  }
}

export function executorPreRollDamage(config, _dialog, _message) {
  const actor = config?.subject?.actor ?? config?.actor;
  if (!actor || !isExecutor(actor)) return;

  const dm = getDeathmarkState(actor);
  const targetUuids = [];
  if (config?.target?.uuid) targetUuids.push(config.target.uuid);
  if (config?.target?.id) targetUuids.push(config.target.id);
  if (globalThis.game?.user?.targets) {
    for (const t of globalThis.game.user.targets) {
      if (t.actor?.uuid) targetUuids.push(t.actor.uuid);
      if (t.uuid) targetUuids.push(t.uuid);
      if (t.id) targetUuids.push(t.id);
    }
  }
  const isTargetMarked = dm.holder === "target" && (targetUuids.includes(dm.targetUuid) || (!targetUuids.length && config?.targetUuid === dm.targetUuid));

  const roll = config.rolls?.[0];
  if (!roll) return;
  roll.parts ??= [];

  // Deathmark bonus damage (+1d4 / +2d4 / +3d4)
  if (isTargetMarked) {
    const bonus = calculateDeathmarkDamageBonus(specialistLevel(actor));
    if (!roll._ak5eDeathmarkDamageApplied && !roll.parts.includes(bonus)) {
      roll._ak5eDeathmarkDamageApplied = true;
      roll.parts.push(bonus);
    }
  }

  // Preysense: Level 11 Hunter adds 1 additional damage die on critical hit
  const isCrit = Boolean(roll.options?.critical || config.critical || roll.isCritical);
  if (hasPreysense(actor) && isCrit && !roll._ak5ePreysenseCritApplied) {
    roll._ak5ePreysenseCritApplied = true;
    const item = config?.subject?.item ?? config?.item;
    const baseFormula = item?.system?.damage?.base?.formula || "1d8";
    const dieMatch = baseFormula.match(/d(\d+)/);
    const faces = dieMatch ? dieMatch[1] : "8";
    roll.parts.push(`1d${faces}`);
  }
}

/* ---------------------------------------------------------------- Lifecycle & Event Hooks */

export function registerExecutorHooks() {
  defineExecutorPools();

  if (globalThis.Hooks?.on && hooksInstalled !== globalThis.Hooks) {
    hooksInstalled = globalThis.Hooks;
    Hooks.on("dnd5e.preRollAttackV2", executorPreRollAttack);
    Hooks.on("dnd5e.preRollDamageV2", executorPreRollDamage);
  }

  if (ak5eEventsInstalled) return;
  ak5eEventsInstalled = true;

  // 1. Attack & Hit events: mark transfer timing and prowess gain triggers
  onAk5eEvent("attack", async event => {
    const actor = event?.raw?.actor ?? (event?.actorUuid ? globalThis.fromUuidSync?.(event.actorUuid) : null);
    if (!actor || !isExecutor(actor)) return;

    const dm = getDeathmarkState(actor);
    const targetUuid = event.targetUuid ?? event.targetUuids?.[0] ?? event.targets?.[0]?.uuid;
    const targetName = event.targets?.[0]?.name ?? "Target";

    // Mark transfer on attack roll reading
    if (dm.holder === "self" && targetUuid) {
      const timing = globalThis.game?.ak5e?.specialist?.ruling?.(actor, "deathmarkTransferTiming") ?? "onAttackRoll";
      if (timing === "onAttackRoll") {
        await setDeathmark(actor, { uuid: targetUuid, name: targetName });
      }
    }

    // Flag that marked creature was attacked this turn
    if (dm.holder === "target" && dm.targetUuid === targetUuid) {
      if (typeof actor.update === "function") {
        await actor.update({ "flags.ak5e.executor.deathmark.attackedOrDamagedThisTurn": true });
      } else if (actor.flags?.ak5e?.executor?.deathmark) {
        actor.flags.ak5e.executor.deathmark.attackedOrDamagedThisTurn = true;
      }
    }
  });

  onAk5eEvent("hit", async event => {
    const actor = event?.raw?.actor ?? (event?.actorUuid ? globalThis.fromUuidSync?.(event.actorUuid) : null);
    if (!actor || !isExecutor(actor)) return;

    const dm = getDeathmarkState(actor);
    const targetUuid = event.targetUuid ?? event.targetUuids?.[0] ?? event.targets?.[0]?.uuid;
    const targetName = event.targets?.[0]?.name ?? "Target";

    const sweeper = actor.getFlag?.("ak5e", "executor")?.sweeper ?? actor.flags?.ak5e?.executor?.sweeper;
    const isSweeper = Boolean(sweeper?.active);

    // Mark transfer on hit reading, or during Sweeper where mark transfers on hit even if held by another creature (Ch. 3 L5532)
    if (targetUuid && (isSweeper || dm.holder === "self")) {
      const timing = globalThis.game?.ak5e?.specialist?.ruling?.(actor, "deathmarkTransferTiming") ?? "onAttackRoll";
      if (isSweeper || timing === "onHitOnly") {
        await setDeathmark(actor, { uuid: targetUuid, name: targetName });
      }
    }

    // Flag that marked creature was attacked or damaged this turn
    const currentDm = getDeathmarkState(actor);
    if (currentDm.holder === "target" && currentDm.targetUuid === targetUuid) {
      if (typeof actor.update === "function") {
        await actor.update({ "flags.ak5e.executor.deathmark.attackedOrDamagedThisTurn": true });
      } else if (actor.flags?.ak5e?.executor?.deathmark) {
        actor.flags.ak5e.executor.deathmark.attackedOrDamagedThisTurn = true;
      }
    }

    // Hunter Prowess trigger: >= 30 damage with a single attack
    if (hasSweeper(actor) || (specialistLevel(actor) >= 5 && getExecutorPath(actor) === EXECUTOR_PATHS.HUNTER)) {
      const damage = Number(event.damageTotal ?? event.totalDamage ?? event.amount ?? 0);
      if (damage >= 30) {
        await refundPool(actor, "prowess", 1, { reason: "Hunter single attack >= 30 damage" });
      }
    }
  });

  // 2. Critical Hits: Preysense applies Bleeding to living creatures
  onAk5eEvent("crit", async event => {
    const actor = event?.raw?.actor ?? (event?.actorUuid ? globalThis.fromUuidSync?.(event.actorUuid) : null);
    if (!actor || !hasPreysense(actor)) return;

    const targetUuid = event.targetUuid ?? event.targetUuids?.[0] ?? event.targets?.[0]?.uuid;
    if (!targetUuid) return;
    const target = globalThis.fromUuidSync?.(targetUuid);
    const targetActor = target?.actor ?? target;
    if (!targetActor) return;

    // Only living creatures can bleed (not constructs or undead, Ch. 1 L226)
    const creatureType = String(targetActor.system?.details?.type?.value ?? targetActor.system?.details?.type ?? "").toLowerCase();
    if (creatureType.includes("construct") || creatureType.includes("undead")) return;

    // Apply bleeding status effect
    if (typeof targetActor.toggleStatusEffect === "function") {
      await targetActor.toggleStatusEffect("ak5e-bleeding", { active: true });
    } else if (targetActor.system) {
      (targetActor.flags ??= {}).ak5e ??= {};
      targetActor.flags.ak5e.bleeding = true;
    }
  });

  // 3. Kill event: Deathmark target reduced to 0 HP
  onAk5eEvent("kill", async event => {
    const deadUuid = event.actorUuid;
    if (!deadUuid) return;

    // Locate active Executor(s) tracking this marked creature
    const candidates = getGameActors();
    if (event.raw?.actor && !candidates.includes(event.raw.actor)) candidates.push(event.raw.actor);

    for (const actor of candidates) {
      if (!isExecutor(actor)) continue;
      const dm = getDeathmarkState(actor);
      if (dm.holder === "target" && (dm.targetUuid === deadUuid || dm.targetUuid === event.tokenUuid)) {
        // Return mark to Executor
        await recallDeathmark(actor, { reason: "Deathmark target dropped to 0 HP" });

        // Universal Executor Prowess trigger (1/turn)
        const triggers = actor.getFlag?.("ak5e", "executor")?.prowessTriggers ?? actor.flags?.ak5e?.executor?.prowessTriggers ?? {};
        if (!triggers.zeroHpThisTurn) {
          await refundPool(actor, "prowess", 1, { reason: "Deathmark target reduced to 0 HP" });
          if (typeof actor.update === "function") {
            await actor.update({ "flags.ak5e.executor.prowessTriggers.zeroHpThisTurn": true });
          } else if (actor.flags?.ak5e?.executor) {
            actor.flags.ak5e.executor.prowessTriggers = { ...triggers, zeroHpThisTurn: true };
          }
        }
      }
    }
  });

  // 4. Turn Start: reset 1/turn flags and grant +3 SP if Deathmark held in combat
  onAk5eEvent("turnStart", async event => {
    const actor = event?.raw?.actor ?? (event?.actorUuid ? globalThis.fromUuidSync?.(event.actorUuid) : null);
    if (!actor || !isExecutor(actor)) return;

    const updates = {
      "flags.ak5e.executor.prowessTriggers.zeroHpThisTurn": false,
      "flags.ak5e.executor.deathmark.attackedOrDamagedThisTurn": false
    };

    const dm = getDeathmarkState(actor);
    if (dm.held && event.combatUuid) {
      if (globalThis.game?.ak5e?.adjustSkillPoints) {
        await globalThis.game.ak5e.adjustSkillPoints(actor, 3, { reason: "Deathmark held at turn start" });
      } else if (actor.flags) {
        const curSP = Number(actor.flags.ak5e?.operatorSkill?.points ?? 0);
        updates["flags.ak5e.operatorSkill.points"] = curSP + 3;
      }
    }

    if (typeof actor.update === "function") {
      await actor.update(updates);
    } else if (actor.flags?.ak5e?.executor) {
      actor.flags.ak5e.executor.prowessTriggers = { ...(actor.flags.ak5e.executor.prowessTriggers ?? {}), zeroHpThisTurn: false };
      actor.flags.ak5e.executor.deathmark = { ...(actor.flags.ak5e.executor.deathmark ?? {}), attackedOrDamagedThisTurn: false };
    }
  });

  // 5. Turn End: return mark if unattacked, conclude Sweeper, and Bodyguard ally prowess trigger
  onAk5eEvent("turnEnd", async event => {
    const actor = event?.raw?.actor ?? (event?.actorUuid ? globalThis.fromUuidSync?.(event.actorUuid) : null);

    if (actor && isExecutor(actor)) {
      const dm = getDeathmarkState(actor);

      // Return Deathmark if hostile creature was not attacked/damaged
      if (dm.holder === "target" && !dm.attackedOrDamagedThisTurn) {
        await recallDeathmark(actor, { reason: "Deathmark returned: target unattacked on turn" });
      }

      // Conclude Sweeper action if active
      const sweeper = actor.getFlag?.("ak5e", "executor")?.sweeper ?? actor.flags?.ak5e?.executor?.sweeper;
      if (sweeper?.active) {
        if (typeof actor.update === "function") {
          await actor.update({ "flags.ak5e.executor.sweeper.active": false });
        } else if (actor.flags?.ak5e?.executor?.sweeper) {
          actor.flags.ak5e.executor.sweeper.active = false;
        }
        await recallDeathmark(actor, { reason: "Deathmark returned at end of Sweeper" });
      }
    }

    // Bodyguard Prowess trigger: ally attacked within 10 ft taking 0 damage
    const actors = getGameActors();
    for (const bgActor of actors) {
      if (!isExecutor(bgActor) || getExecutorPath(bgActor) !== EXECUTOR_PATHS.BODYGUARD || specialistLevel(bgActor) < 5) continue;
      if (actor && actor.uuid !== bgActor.uuid) {
        const allyAttacked = Boolean(event.wasAttacked ?? event.attackedThisTurn);
        const allyDamage = Number(event.damageTakenThisTurn ?? 0);
        const distance = Number(event.distanceToBodyguard ?? 5);
        if (allyAttacked && allyDamage === 0 && distance <= 10) {
          await refundPool(bgActor, "prowess", 1, { reason: "Bodyguard ally within 10 ft took 0 damage" });
        }
      }
    }
  });
}
