/**
 * Defender › Fortress (Ch.3 L1387–1490), following WORKFLOW.md §3.2 through the Defender use engine (defender-uses.mjs):
 * Entrench (Speed 0, −20 ft from 9th), Barrage and Danger Close guidance; Munitions Dice (5; d4/d6/d8; Long Rest);
 * loading (Action, or Bonus Action + 1 Resilience; up to PB, no duplicates; lost on unequip or Incapacitated);
 * firing (point within 100 ft, 15-ft radius, Dexterity save vs Martial DC, weapon + Munition Damage rolled from the card,
 * riders on Creatures confirmed as failing); Stronghold (Fortification Shelter, Stop their Advance) and Creeping Barrage.
 * Munition effects are built from the definitions below on the applying client, never from a receipt.
 */
import { defenderLevel, defenderBranch, munitionDie, MUNITIONS_DICE, SHELTER_FEET } from "./defender-rules.mjs";
import { defenderEnabled, defenderTurn, ownTurn, primaryToken } from "./defender-features.mjs";
import { defenderUses } from "./defender-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { applyFeatureTag } from "./feature-tags.mjs";
import { definePool, getPool, getPoolDefinition } from "./resource-pools.mjs";
import { onAk5eEvent, getReactions, spendReaction } from "./trigger-events.mjs";
import { flag, values, need, esc, opaqueKey } from "./operation-kernel.mjs";
import { requireOverrides } from "./play-undo.mjs";

export const FORTRESS_FEATURES = Object.freeze({
  platform: "subclass-feature-defender-fortress-level-1-fire-support-platform-481",
  fireForEffect: "subclass-feature-defender-fortress-level-4-fire-for-effect-1457",
  stronghold: "subclass-feature-defender-fortress-level-12-stronghold-3723",
  creepingBarrage: "subclass-feature-defender-fortress-level-15-creeping-barrage-4344"
});
const SPEED_TYPES = ["walk", "fly", "swim", "climb", "burrow"];
/** Munition Options (Ch.3 L1458–1489): damage dice and type, and the rider applied to Creatures that failed the save. */
export const MUNITIONS = Object.freeze({
  concussive: { name: "Concussive Munition", dice: 1, type: "thunder", featureId: "subclass-feature-defender-fortress-concussive-munition-4867",
    rider: { label: "Concussive Munition", condition: "ak5e-dazed", expiryActor: "target", trigger: "nextTurnEnd",
      changes: SPEED_TYPES.map(type => ({ key: `system.attributes.movement.${type}`, mode: 1, value: "0.5" })),
      instructions: "Until the end of its next Turn, its Speed is halved and it has the Dazed Condition." } },
  corrosive: { name: "Corrosive Munition", dice: 1, type: "acid", featureId: "subclass-feature-defender-fortress-corrosive-munition-5094",
    rider: { label: "Corrosive Munition", condition: "ak5e-corroded", trigger: "manual",
      instructions: "Corroded until it uses an Action during its Turn to remove it; remove this effect then." } },
  flare: { name: "Flare Munition", dice: 1, type: "fire", featureId: "subclass-feature-defender-fortress-flare-munition-5316",
    rider: { label: "Flare Munition", expiryActor: "source", trigger: "nextTurnEnd",
      instructions: "Until the end of the Fortress's next Turn it cannot benefit from the Invisible Condition, and Attack Rolls against it are made at Advantage (apply Advantage when rolling)." } },
  explosive: { name: "Explosive Munition", dice: 2, type: null, types: ["acid", "fire", "thunder"], featureId: "subclass-feature-defender-fortress-explosive-munition-5590", rider: null },
  incendiary: { name: "Incendiary Munition", dice: 1, type: "fire", featureId: "subclass-feature-defender-fortress-incendiary-munition-5746",
    rider: { label: "Incendiary Munition", condition: "ak5e-burning", trigger: "manual", instructions: "Burning (Ch.1): remove it as the Condition describes." } },
  shrapnel: { name: "Shrapnel Munition", dice: 1, type: "slashing", featureId: "subclass-feature-defender-fortress-shrapnel-munition-5911",
    rider: { label: "Shrapnel Munition", condition: "ak5e-bleeding", trigger: "manual", instructions: "Bleeding (Ch.1): remove it as the Condition describes." } }
});
const INCAPACITATING = ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"];
/** Readings offered when the GM has not ruled (DECISIONS.md "Fortress branch"). */
export const FORTRESS_READINGS = Object.freeze({
  munitionWeaponDamage: { label: "\"The Damage of the weapon used\" when firing Munitions", options: [
    { value: "weaponDice", label: "The weapon's Damage dice only" },
    { value: "weaponPlusModifier", label: "The weapon's Damage dice plus its ability modifier (as for Splash)" }] }
});

export const isFortress = actor => defenderEnabled(actor) && defenderBranch(actor) === "fortress";
const levelWarning = (warnings, actor, level, name) => {
  if (defenderLevel(actor) < level) warn(warnings, "level", `${name} is a Fortress level ${level} feature; this Defender is level ${defenderLevel(actor)}.`);
};
export const isLauncher = item => item?.type === "weapon" && (/(grenade|rocket)-launcher/.test(String(flag(item, "chapterFourId") ?? "")) || /\b(grenade|rocket) launcher\b/i.test(String(item.name ?? "")));
export const martialDC = actor => 8 + Math.max(Number(actor.system?.abilities?.str?.mod ?? 0), Number(actor.system?.abilities?.dex?.mod ?? 0)) + Number(actor.system?.attributes?.prof ?? 0);
const loadedIn = (state, weaponId) => [...(state.data.munitions?.[weaponId] ?? [])];
export function loadedMunitions(actor) { return { ...(defenderUses.state(actor).data.munitions ?? {}) }; }
/** Entrenched: an Entrench effect from this Defender's latest Entrench use is still on the Actor. */
export function entrenched(actor) {
  const use = defenderUses.state(actor).data.entrench;
  return Boolean(use && values(actor.effects).some(effect => flag(effect, defenderUses.effectFlag)?.opId === use.useId));
}
function entrenchTag(actor) {
  const moving = defenderLevel(actor) >= 9;
  return { label: "Entrenched", trigger: "turnStart", expiryActor: "source",
    // Speed 0 "cannot be increased": an OVERRIDE at high priority is applied after any increase. From 9th: −20 ft.
    changes: moving ? [{ key: "system.attributes.movement.walk", mode: 2, value: "-20", priority: 50 }]
      : SPEED_TYPES.map(type => ({ key: `system.attributes.movement.${type}`, mode: 5, value: "0", priority: 50 })),
    instructions: `${moving ? "Moving Fortress: walking Speed reduced by 20 feet; reduce other movement speeds manually" : "Speed 0 and cannot be increased"} until the beginning of your next Turn. Barrage: when you take the Attack Action, ignore Two-Handed and Brace for Grenade and Rocket Launchers. Danger Close: when you force other Creatures to make a Saving Throw, up to your Proficiency Bonus of them automatically pass and take no Damage on a halved success.` };
}

/* ---------------------------------------------------------------- target kinds */

/** All loaded Munition riders for one Creature that failed its save; each tag comes from MUNITIONS. */
const munitionEffects = {
  async apply(source, useId, entry, target) {
    for (const key of entry.munitions) {
      const munition = MUNITIONS[key];
      if (!munition?.rider) continue;
      if (values(target.effects).some(effect => flag(effect, defenderUses.effectFlag)?.opId === useId && flag(effect, defenderUses.effectFlag)?.munition === key)) continue;
      const item = values(source.items).find(candidate => flag(candidate, "chapterThreeId") === munition.featureId)
        ?? values(source.items).find(candidate => flag(candidate, "chapterThreeId") === FORTRESS_FEATURES.fireForEffect);
      need(item, "Add the Fortress feature Items (Defender progression setup) first.");
      const tag = { ...munition.rider, changes: structuredClone(munition.rider.changes ?? []) };
      const expiryActor = tag.expiryActor === "target" ? target : source;
      if (tag.trigger !== "manual" && !(game.combat?.started && values(game.combat.turns).some(c => c.actor?.uuid === expiryActor.uuid))) {
        tag.trigger = "manual"; tag.instructions = `${tag.instructions} Outside combat, remove it manually when it ends.`;
      }
      const effect = await applyFeatureTag(source, item, target, tag);
      try { await effect.update({ [`flags.ak5e.${defenderUses.effectFlag}`]: { opId: useId, sourceUuid: source.uuid, munition: key } }); }
      catch (error) { await effect.delete(); throw error; }
    }
    return true;
  },
  async revert(source, useId, _entry, target) {
    const effects = values(target.effects).filter(effect => flag(effect, defenderUses.effectFlag)?.opId === useId && flag(effect, defenderUses.effectFlag)?.sourceUuid === source.uuid);
    if (effects.length) await target.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
    return { removed: effects.length };
  },
  preview(_source, receipt, entry, target) {
    const count = values(target?.effects).filter(effect => flag(effect, defenderUses.effectFlag)?.opId === receipt.id).length;
    return count ? `${entry.name}: removes ${count} Munition effect${count === 1 ? "" : "s"}.` : `${entry.name}: the Munition effects are already gone.`;
  }
};
/** Fortification: Shelter taken without an Action while Entrenched; undo restores the previous Shelter state. */
const fortifiedShelter = {
  async apply(_source, useId, entry, target) {
    const current = flag(target, "defender")?.shelter ?? null;
    if (current?.operationId === useId) return true;
    await target.update({ "flags.ak5e.defender.shelter": { active: true, allies: [...entry.allies], defenderTokenUuid: entry.tokenUuid ?? null, declaredTurn: entry.turn ?? null,
      activation: "fortification", operationId: useId }, [`flags.ak5e.${defenderUses.appliedFlag}.${opaqueKey(useId)}`]: { prior: current } });
    return true;
  },
  async revert(_source, useId, _entry, target) {
    const record = flag(target, defenderUses.appliedFlag)?.[opaqueKey(useId)];
    const current = flag(target, "defender")?.shelter ?? null;
    await target.update({ ...(current?.operationId === useId ? { "flags.ak5e.defender.shelter": record?.prior ?? null } : {}), [`flags.ak5e.${defenderUses.appliedFlag}.${opaqueKey(useId)}`]: null });
    return { restored: current?.operationId === useId };
  },
  preview: (_source, receipt, entry, target) => flag(target, "defender")?.shelter?.operationId === receipt.id ? `${entry.name}: ends this Shelter and restores the previous one.` : `${entry.name}: a later Shelter replaced it; nothing to end.`
};

/* ---------------------------------------------------------------- use plans */

function weaponOf(actor, weaponId) {
  const weapon = actor.items.get?.(weaponId) ?? values(actor.items).find(item => item.id === weaponId);
  need(weapon?.type === "weapon", "Choose the launcher.");
  return weapon;
}
function weaponDamage(actor, weapon, withModifier) {
  const base = weapon.system?.damage?.base ?? {}, number = Number(base.number), faces = Number(base.denomination);
  need(Number.isInteger(number) && number > 0 && Number.isInteger(faces) && faces > 0, `${weapon.name} has no reviewed Damage dice.`);
  const type = [...(base.types ?? [])][0] ?? "thunder";
  const ability = weapon.system?.ability || "dex", modifier = withModifier ? Number(actor.system?.abilities?.[ability]?.mod ?? 0) : 0;
  const bonus = (Number(weapon.system?.magicalBonus) || 0) + modifier;
  return { formula: `${number}d${faces}${bonus ? ` + ${bonus}` : ""}`, type };
}
const PLANS = {
  entrench(actor, state) {
    need(isFortress(actor), "Entrench is a Fortress Defender feature.");
    need(values(actor.items).some(item => flag(item, "chapterThreeId") === FORTRESS_FEATURES.platform), "Add the Fire Support Platform feature Item (Defender progression setup) first.");
    const warnings = [], turn = defenderTurn();
    if (game.combat?.started && !ownTurn(actor)) warn(warnings, "turn", "Entrench is declared at the beginning of your Turn, and it is not your Turn.");
    if (entrenched(actor)) warn(warnings, "active", "You are already Entrenched.");
    const tag = entrenchTag(actor);
    return { warnings, title: "Entrench", apply(next, receipt) {
      next.data.entrench = { useId: receipt.id, turn };
      receipt.targets = [{ uuid: actor.uuid, name: actor.name, kind: "effect", featureId: FORTRESS_FEATURES.platform, ready: true, tag }];
      receipt.summary = `${actor.name} Entrenches until the beginning of their next Turn. ${tag.instructions}`;
      receipt.result = { entrenched: true };
      return {};
    } };
  },
  loadMunition(actor, state, data) {
    need(isFortress(actor), "Loading Munitions is a Fortress Defender feature.");
    const munition = MUNITIONS[data.munition]; need(munition, "Choose a Munition.");
    const weapon = weaponOf(actor, data.weaponId), loaded = loadedIn(state, weapon.id), prof = Number(actor.system?.attributes?.prof ?? 0), warnings = [];
    const bonus = data.bonusAction === true;
    levelWarning(warnings, actor, 4, "Fire for Effect");
    if (!isLauncher(weapon)) warn(warnings, "launcher", `${weapon.name} is not a Grenade Launcher or Rocket Launcher.`);
    if (weapon.system?.equipped !== true) warn(warnings, "equipped", `${weapon.name} is not equipped.`);
    if (loaded.includes(data.munition)) warn(warnings, "duplicate", `${munition.name} is already loaded into ${weapon.name}; the same Munition cannot be loaded twice.`);
    if (loaded.length >= prof) warn(warnings, "count", `${weapon.name} already holds ${loaded.length} Munitions (your Proficiency Bonus is ${prof}).`);
    if (resourceValue(actor, { pool: "munitionsDice" }) < 1) warn(warnings, "dice", "No Munitions Dice remain until a Long Rest; the count stays at 0.");
    if (bonus && resourceValue(actor, { pool: "resilience" }) < 1) warn(warnings, "resilience", "Loading as a Bonus Action costs 1 Resilience and none remain; Resilience stays at 0.");
    return { warnings, title: `Load ${munition.name}`, apply(next, receipt) {
      const updates = { ...spendResource(actor, receipt, { pool: "munitionsDice", amount: 1, label: "Munitions Die" }),
        ...(bonus ? spendResource(actor, receipt, { pool: "resilience", amount: 1, label: "Resilience" }) : {}) };
      next.data.munitions = { ...(next.data.munitions ?? {}), [weapon.id]: [...new Set([...loaded, data.munition])] };
      next.data.loads = [...(next.data.loads ?? []), { op: receipt.id, weaponId: weapon.id, munition: data.munition }];
      receipt.summary = `${munition.name} loaded into ${weapon.name} (${bonus ? "Bonus Action, 1 Resilience" : "Action"}).`;
      receipt.result = { loaded: next.data.munitions[weapon.id] };
      return updates;
    } };
  },
  fireMunitions(actor, state, data, useId) {
    need(isFortress(actor), "Firing Munitions is a Fortress Defender feature.");
    const weapon = weaponOf(actor, data.weaponId), loaded = loadedIn(state, weapon.id), reaction = data.mode === "stopTheirAdvance", warnings = [];
    need(loaded.length, `${weapon.name} has no loaded Munitions to fire.`);
    const prof = Number(actor.system?.attributes?.prof ?? 0), exempt = Array.isArray(data.dangerClose) ? [...new Set(data.dangerClose)] : [];
    levelWarning(warnings, actor, reaction ? 12 : 4, reaction ? "Stop their Advance" : "Fire for Effect");
    if (weapon.system?.equipped !== true) warn(warnings, "equipped", `${weapon.name} is not equipped.`);
    if (data.pointConfirmed !== true) warn(warnings, "point", "You did not confirm a point within 100 feet (unseen points need no roof over you or the point).");
    const trigger = String(data.triggerId ?? "").trim();
    const triggerId = trigger || `fortress-stop-advance:${defenderTurn() ?? "outside-combat"}`;
    if (reaction && data.triggerConfirmed !== true) warn(warnings, "trigger", "Stop their Advance requires a Creature you can see moving within 100 feet of you; confirm that trigger.");
    if (reaction && !trigger) warn(warnings, "triggerId", "Name the movement trigger so this Reaction can be accounted for and retried safely.");
    const reactionReceiptId = `fortress_${useId}`;
    const reactionState = reaction ? getReactions(actor) : null;
    const reactionAlreadySpent = Boolean(reactionState?.receipts?.[reactionReceiptId]);
    const eligibleReactions = reactionState ? Math.max(0, reactionState.max - reactionState.spent)
      + reactionState.extra.filter(extra => !extra.restrictedTo.length || extra.restrictedTo.includes("stopTheirAdvance"))
        .reduce((sum, extra) => sum + Math.max(0, extra.count - extra.spent), 0) : 0;
    if (reaction && reactionState.triggers?.[triggerId] && !reactionAlreadySpent)
      warn(warnings, "triggerUsed", "A Reaction has already been spent for this movement trigger. Use anyway records that no additional Reaction is available for this trigger.");
    if (reaction && eligibleReactions < 1 && !reactionAlreadySpent) warn(warnings, "reaction", "No eligible Reaction remains for Stop their Advance; no Reaction will be spent.");
    if (reaction && resourceValue(actor, { pool: "resilience" }) < 1) warn(warnings, "resilience", "Stop their Advance costs 1 Resilience and none remain; Resilience stays at 0.");
    if (exempt.length && !entrenched(actor)) warn(warnings, "dangerClose", "Danger Close applies only while you are Entrenched.");
    if (exempt.length > prof) warn(warnings, "dangerCount", `Danger Close protects up to ${prof} Creatures (your Proficiency Bonus).`);
    const explosive = loaded.includes("explosive");
    if (explosive) need(MUNITIONS.explosive.types.includes(data.explosiveType), "Choose Acid, Fire or Thunder for the Explosive Munition.");
    const dc = martialDC(actor), die = munitionDie(defenderLevel(actor));
    return { warnings, title: reaction ? "Stop their Advance" : "Fire Munitions", reading: "munitionWeaponDamage", async apply(next, receipt, reading) {
      // Validate every damage part before the separate durable Reaction write.
      const base = weaponDamage(actor, weapon, reading === "weaponPlusModifier");
      const parts = [base, ...loaded.map(key => {
        need(MUNITIONS[key], "The launcher contains an unknown Munition; reconcile its loaded state first.");
        return { formula: `${MUNITIONS[key].dice}d${die}`, type: key === "explosive" ? data.explosiveType : MUNITIONS[key].type };
      })];
      let reactionSpend = null;
      if (reaction) {
        reactionSpend = await spendReaction(actor, { triggerId, receipt: reactionReceiptId, tags: ["stopTheirAdvance"] });
        if (!reactionSpend.ok) {
          const warning = reactionSpend.reason === "perTrigger"
            ? { id: "triggerUsed", text: "A Reaction has already been spent for this movement trigger; no additional Reaction will be spent." }
            : { id: "reaction", text: "No eligible Reaction remains for Stop their Advance; no Reaction will be spent." };
          // Recheck races at commit without silently treating a resource failure as an override.
          requireOverrides([warning], data.overrides);
          if (!receipt.overridden.includes(warning.text)) receipt.overridden.push(warning.text);
        }
        receipt.reaction = { requested: true, spent: reactionSpend.ok === true, receiptId: reactionReceiptId, triggerId,
          ...(reactionSpend.ok ? {} : { reason: reactionSpend.reason }) };
      }
      const updates = reaction ? spendResource(actor, receipt, { pool: "resilience", amount: 1, label: "Resilience" }) : {};
      next.data.munitions = { ...(next.data.munitions ?? {}), [weapon.id]: [] };
      next.data.fired = [...(next.data.fired ?? []), { id: receipt.id, weaponId: weapon.id, munitions: loaded, dc, exempt }];
      receipt.damageParts = parts; receipt.formula = parts.map(part => part.formula).join(" + "); receipt.rollLabel = "Damage";
      receipt.rollFlavor = `${weapon.name}: Munitions Damage (failed save: full; success: half${exempt.length ? "; Danger Close Creatures: none" : ""})`;
      const names = exempt.map(uuid => globalThis.fromUuidSync?.(uuid)?.name ?? "Creature");
      receipt.summary = `${reaction ? `Reaction: ${receipt.reaction.spent ? "spent" : "unavailable"}; fired at a point as close to the moving Creature as possible. ` : ""}All Creatures within 15 feet of the point make [[/save ability=dex dc=${dc}]] (Martial DC). Failed: ${esc(receipt.formula)} Damage (${parts.map(part => esc(part.type)).join(", ")}) and the Munition effects (${loaded.map(key => esc(MUNITIONS[key].name)).join(", ")}). Success: half Damage, no effects.${names.length ? ` Danger Close: ${names.map(esc).join(", ")} automatically succeed and take no Damage.` : ""} Roll the Damage from this card and apply it with the native damage controls; apply the effects to each Creature that failed from the Defender panel.`;
      receipt.html = true;
      receipt.result = { fireId: receipt.id, dc, munitions: loaded, formula: receipt.formula };
      return updates;
    } };
  },
  munitionEffects(actor, state, data) {
    need(isFortress(actor), "Munition effects come from a Fortress Defender.");
    const fired = (state.data.fired ?? []).find(entry => entry.id === data.fireId);
    need(fired, "Choose a recorded Munitions volley.");
    const target = globalThis.fromUuidSync?.(data.targetUuid), actorDoc = target?.documentName === "Token" ? target.actor : target;
    need(actorDoc?.documentName === "Actor", "Choose the Creature that failed its save.");
    const warnings = [], riders = fired.munitions.filter(key => MUNITIONS[key]?.rider);
    need(riders.length, "Those Munitions have no additional effects.");
    if (data.failedSave !== true) warn(warnings, "failedSave", `You did not confirm that ${actorDoc.name} failed its Dexterity Saving Throw.`);
    if (fired.exempt.includes(actorDoc.uuid)) warn(warnings, "dangerClose", `${actorDoc.name} was protected by Danger Close and automatically succeeded.`);
    if ((fired.applied ?? []).some(entry => entry.uuid === actorDoc.uuid)) warn(warnings, "repeat", `${actorDoc.name} already suffers these Munition effects.`);
    return { warnings, title: "Munition effects", apply(next, receipt) {
      const current = next.data.fired.find(entry => entry.id === fired.id); current.applied = [...(current.applied ?? []), { uuid: actorDoc.uuid, op: receipt.id }];
      receipt.targets = [{ uuid: actorDoc.uuid, name: actorDoc.name, kind: "munitionEffects", munitions: riders, ready: true }];
      receipt.summary = `${actorDoc.name}: ${riders.map(key => MUNITIONS[key].rider.instructions).join(" ")}`;
      receipt.result = { munitions: riders };
      return {};
    } };
  },
  fortification(actor, state, data) {
    need(isFortress(actor), "Fortification is a Fortress Defender feature.");
    const allies = Array.isArray(data.allies) ? data.allies : [];
    need(allies.length && new Set(allies).size === allies.length, "Choose the allied Creatures (distinct tokens) that Shelter protects.");
    const own = primaryToken(actor), warnings = [], turn = defenderTurn();
    need(!allies.includes(own?.uuid), "Shelter does not protect the Defender.");
    levelWarning(warnings, actor, 12, "Stronghold");
    if (!entrenched(actor)) warn(warnings, "entrenched", "Fortification takes the Shelter Action without an Action only while you are Entrenched.");
    if (turn && state.data.fortification === turn) warn(warnings, "turn", "Fortification has already been used this Turn.");
    if (data.alliesConfirmed !== true) warn(warnings, "allies", "You did not confirm that every chosen Creature is your ally.");
    return { warnings, title: "Fortification (Shelter)", apply(next, receipt) {
      next.data.fortification = turn ?? `outside_${receipt.id}`;
      receipt.targets = [{ uuid: actor.uuid, name: actor.name, kind: "fortifiedShelter", allies: [...allies], tokenUuid: own?.uuid ?? null, turn, ready: true }];
      receipt.summary = `Shelter without an Action: until the beginning of your next Turn, Attacks against these allied Creatures within ${SHELTER_FEET} feet of you are made at Disadvantage.`;
      receipt.result = { allies: allies.length };
      return {};
    } };
  },
  /** Automatic (initiative, unequip, Incapacitated): recorded as uses so they show on a card and can be undone. */
  creepingBarrage(actor) {
    need(isFortress(actor) && defenderLevel(actor) >= 15, "Creeping Barrage is a Fortress level 15 feature.");
    const pool = getPool(actor, "munitionsDice");
    return { warnings: [], title: "Creeping Barrage", apply(_next, receipt) {
      const after = Math.max(pool.value, 2);
      receipt.resources = [{ pool: "munitionsDice", path: "flags.ak5e.resourcePools.munitionsDice.value", before: pool.value, after, max: pool.max, label: "Munitions Dice" }];
      receipt.summary = after > pool.value ? `Initiative: ${actor.name} regains Munitions Dice up to two (${pool.value} → ${after}).` : `Initiative: ${actor.name} already has two or more Munitions Dice.`;
      receipt.result = { before: pool.value, after };
      return { "flags.ak5e.resourcePools.munitionsDice.value": after };
    } };
  },
  munitionsLost(actor, state, data) {
    need(isFortress(actor), "Munitions belong to a Fortress Defender.");
    const lost = data.weaponId ? { [data.weaponId]: loadedIn(state, data.weaponId) } : { ...(state.data.munitions ?? {}) };
    return { warnings: [], title: "Munitions lost", apply(next, receipt) {
      next.data.munitions = { ...(next.data.munitions ?? {}) };
      for (const weaponId of Object.keys(lost)) next.data.munitions[weaponId] = [];
      next.data.lost = [...(next.data.lost ?? []), { op: receipt.id, lost }];
      receipt.summary = `${actor.name}'s loaded Munitions are lost (${data.reason === "unequipped" ? "the launcher was unequipped" : "Incapacitated"}).`;
      receipt.result = { lost };
      return {};
    } };
  }
};
/* GM-side relay checks: only defined Munition riders on another player's Creature; Entrench and Fortification act on yourself. */
PLANS.entrench.validateTarget = (source, _receipt, entry, target) => entry.kind === "effect" && target.uuid === source.uuid && entry.featureId === FORTRESS_FEATURES.platform;
PLANS.munitionEffects.validateTarget = (_source, _receipt, entry) => entry.kind === "munitionEffects" && Array.isArray(entry.munitions) && entry.munitions.every(key => MUNITIONS[key]?.rider);
PLANS.fortification.validateTarget = (source, _receipt, entry, target) => entry.kind === "fortifiedShelter" && target.uuid === source.uuid;
function cleanup(state, receipt) {
  // Undo a load: the Munition leaves the launcher if it is still loaded. Undo a volley or a loss: the Munitions return.
  const load = (state.data.loads ?? []).find(entry => entry.op === receipt.id);
  if (load) state.data.munitions = { ...(state.data.munitions ?? {}), [load.weaponId]: loadedIn(state, load.weaponId).filter(key => key !== load.munition) };
  const fired = (state.data.fired ?? []).find(entry => entry.id === receipt.id);
  if (fired) state.data.munitions = { ...(state.data.munitions ?? {}), [fired.weaponId]: [...new Set([...loadedIn(state, fired.weaponId), ...fired.munitions])] };
  const lost = (state.data.lost ?? []).find(entry => entry.op === receipt.id);
  if (lost) for (const [weaponId, keys] of Object.entries(lost.lost)) state.data.munitions = { ...(state.data.munitions ?? {}), [weaponId]: [...new Set([...loadedIn(state, weaponId), ...keys])] };
  for (const list of [state.data.fired ?? []]) for (const entry of list) entry.applied = (entry.applied ?? []).filter(applied => applied.op !== receipt.id);
  state.data.fired = (state.data.fired ?? []).filter(entry => entry.id !== receipt.id);
  state.data.loads = (state.data.loads ?? []).filter(entry => entry.op !== receipt.id);
  state.data.lost = (state.data.lost ?? []).filter(entry => entry.op !== receipt.id);
  if (state.data.entrench?.useId === receipt.id) state.data.entrench = null;
}

/* ---------------------------------------------------------------- automatic triggers */

const automatic = (actor, command, data, id) => defenderUses.command(actor, command, { ...data, confirmed: true }, id)
  .catch(error => console.error(`AK5e | Fortress ${command}`, error));
async function onInitiative(event) {
  const actor = globalThis.fromUuidSync?.(event.actorUuid);
  if (!actor?.isOwner || !isFortress(actor) || defenderLevel(actor) < 15 || getPool(actor, "munitionsDice").value >= 2) return;
  await automatic(actor, "creepingBarrage", {}, `cb-${opaqueKey(event.eventId)}`.slice(0, 60));
}
function onUnequip(item, changed, _options, userId) {
  if (userId !== game.user.id || !isLauncher(item) || changed?.system?.equipped !== false) return;
  const actor = item.parent;
  if (actor?.isOwner && isFortress(actor) && loadedIn(defenderUses.state(actor), item.id).length)
    automatic(actor, "munitionsLost", { weaponId: item.id, reason: "unequipped" }, `ml-${item.id}-${Date.now().toString(36)}`.slice(0, 60));
}
function onIncapacitated(effect, _options, userId) {
  const actor = effect.parent;
  if (userId !== game.user.id || actor?.documentName !== "Actor" || !actor.isOwner || !isFortress(actor)) return;
  if (!values(effect.statuses).some(status => INCAPACITATING.includes(status))) return;
  if (Object.values(defenderUses.state(actor).data.munitions ?? {}).some(list => list.length))
    automatic(actor, "munitionsLost", { reason: "incapacitated" }, `ml-inc-${Date.now().toString(36)}`.slice(0, 60));
}

export function registerFortress() {
  if (!getPoolDefinition("munitionsDice")) definePool({ id: "munitionsDice", label: "Munitions Dice", max: { 1: 0, 4: MUNITIONS_DICE }, initial: "max", classId: "class-defender",
    levelBasis: "classLevel", appliesTo: isFortress, recovery: [{ on: "lr", amount: "full" }] });
  defenderUses.register({ plans: PLANS, readings: FORTRESS_READINGS, targetKinds: { munitionEffects, fortifiedShelter }, cleanup });
}
export function registerFortressHooks() {
  registerFortress();
  onAk5eEvent("initiative", event => onInitiative(event).catch(error => console.error("AK5e | Creeping Barrage", error)));
  Hooks.on("updateItem", onUnequip);
  Hooks.on("createActiveEffect", onIncapacitated);
}
