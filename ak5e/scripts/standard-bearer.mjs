import { BATTLECRIES, STANDARD_ENTRIES, STANDARD_VERSION,
  hasStandardBranch, vanguardLevel, standardState, standardDC, grantFervour, spendFervour,
  standardWeaponData, featureHelperActivity, tokenPoint, distanceFeet, withinFeet } from "./standard-bearer-rules.mjs";
import { featureTags, tagActors, tagExpiry, tagHasExpired, removeFeatureTag } from "./feature-tags.mjs";
import { getIntegratedOperatorState, isOperatorActor, executeOperatorCommand } from "./operator-skills.mjs";
import { isConstruct } from "./world-rule-state.mjs";
import { containsPoint, feetToPixels } from "./operator-geometry.mjs";
import { openStandardBearer, registerStandardSheetHooks } from "./standard-bearer-sheet.mjs";
import { applyTempHP, resolveDamage } from "./damage-pipeline.mjs";
import { change, speedChanges, useTipVariant, useTipSP, adjustAttackConfig } from "./tip-of-the-spear.mjs";
import { createOperationKernel, keyedSerial, opaqueKey, flag, values, need, own, gmActive } from "./operation-kernel.mjs";
export { openStandardBearer };

const recipientSerial = keyedSerial();
const safely = promise => Promise.resolve(promise).catch(error => { console.error("AK5e | Standard Bearer", error); ui.notifications.error(error.message); });
export const standardKey = opaqueKey;
function sourceItem(actor, suffix) {
  const source = STANDARD_ENTRIES.find(e => e.sourceHeading.endsWith(suffix));
  const item = values(actor.items).find(i => flag(i, "chapterThreeId") === source?.id);
  need(item, `Attach the source feature ${suffix} to this Actor first.`);
  return item;
}
function currentCombat(actor) {
  return values(game.combats).find(c => c.started && c.turns?.some(t => t.actor?.uuid === actor.uuid));
}
function turnCycle(actor) {
  const combat = currentCombat(actor);
  need(combat && combat.turn !== null, "This feature requires the bearer in an active combat.");
  need(game.combat?.uuid === combat.uuid, "Select the bearer's active combat before using turn-based helpers.");
  const index = combat.turns.findIndex(t => t.actor?.uuid === actor.uuid);
  // Before the bearer's first turn, use the preceding cycle; reset at their turn start.
  return `${combat.uuid}:${combat.round - (combat.turn < index ? 1 : 0)}`;
}
function ownTurn(actor) {
  need(currentCombat(actor)?.combatant?.actor?.uuid === actor.uuid, "Use this during the bearer's Turn.");
}
async function bearerSource(actor, data, state) {
  const candidates = values(game.scenes).flatMap(scene => values(scene.tokens)).filter(t => t.actor?.uuid === actor.uuid);
  const token = data.sourceTokenUuid ? await fromUuid(data.sourceTokenUuid) : await fromUuid(state.sourceTokenUuid ?? "") ?? (candidates.length === 1 ? candidates[0] : null);
  need(token?.documentName === "Token" && token.actor?.uuid === actor.uuid, "Choose the bearer's source token.");
  return token;
}
function visibleTo(token, user) {
  if (user.isGM) return true;
  if (token.hidden || token.disposition === -2 || token.parent?.testUserPermission?.(user, "LIMITED") === false) return false;
  // On the requesting client, respect actual rendered vision/fog visibility.
  if (game.user.id === user.id) return token.object?.visible === true;
  // GM authorization never exposes hidden tokens; sight/hearing remain explicit
  // source confirmations. Scene documents alone are not used to build player lists.
  return true;
}
async function targetsFor(source, data, user) {
  const ids = [...new Set(data.targetTokenUuids ?? [])];
  return Promise.all(ids.map(async id => {
    const token = await fromUuid(id);
    need(token?.documentName === "Token" && token.parent.id === source.parent.id && token.actor && !flag(token, "standardProp"), "Choose a creature in the source scene.");
    need(visibleTo(token, user), "That target is not available to the initiating user.");
    return token;
  }));
}
async function auraOrigins(actor, state, source) {
  const result = [];
  if (state.mode === "wielded" && state.holderUuid === actor.uuid) result.push({ point: tokenPoint(source), radius: 10 });
  if (state.mode === "planted") {
    const token = await fromUuid(state.propTokenUuid ?? "");
    if (token?.parent.id === source.parent.id) result.push({ point: tokenPoint(token), radius: 25 });
  }
  if (state.projection && !tagHasExpired({ expiry: state.projection }, { kind: "combatTurn", combat: currentCombat(actor) }))
    result.push({ point: tokenPoint(source), radius: 10 });
  return result;
}
async function requireAura(actor, state, source, targets) {
  const origins = await auraOrigins(actor, state, source);
  need(origins.length, "The standard must project an Aura of Influence.");
  for (const token of targets) need(origins.some(o => withinFeet(source.parent, o.point, token, o.radius)), "A chosen creature is outside the Aura of Influence.");
}
function facts(data, keys) {
  for (const key of keys) need(data.facts?.[key] === true, `Confirm ${key} against the source rule.`);
}
function gates(actor, command) {
  const required = { kingHill: 4, herald: 4, projection: 10, duty: 13, expertise: 13, directed: 15,
    lastStand: 17, endStand: 17, extraTurn: 17, redirect: 17 }[command] ?? 1;
  need(vanguardLevel(actor) >= required, `This feature requires Vanguard Level ${required}.`);
}

export async function previewStandardUpdate(actor) {
  need(hasStandardBranch(actor), "Attach the Standard Bearer Branch first.");
  const additions = values(actor.items).flatMap(item => {
    const entry = STANDARD_ENTRIES.find(e => e.id === flag(item, "chapterThreeId"));
    const activity = entry && featureHelperActivity(entry).ak5eStandardHelp;
    return activity && !item.system.activities?.get?.(activity._id) && !item.system.activities?.[activity._id] ? [{ itemId: item.id, name: item.name, activity }] : [];
  });
  return { version: STANDARD_VERSION, additions, weaponMissing: !values(actor.items).some(i => flag(i, "standardWeapon") === actor.uuid) };
}
export async function getStandardView(actor, user = game.user) {
  const state = standardState(actor), level = vanguardLevel(actor);
  const candidates = values(game.scenes).flatMap(scene => values(scene.tokens)).filter(t => t.actor?.uuid === actor.uuid && visibleTo(t, user));
  const source = candidates.find(t => t.uuid === state.sourceTokenUuid) ?? candidates.find(t => t.parent.id === globalThis.canvas?.scene?.id) ?? candidates[0];
  const origins = source ? await auraOrigins(actor, state, source) : [];
  return { state, level, dc: standardDC(actor), entries: STANDARD_ENTRIES,
    sourceTokenUuid: source?.uuid, sourceTokens: candidates.map(t => ({ uuid: t.uuid, name: t.name })),
    targets: source ? values(source.parent.tokens).filter(t => t.actor && !flag(t, "standardProp") && visibleTo(t, user))
      .map(t => ({ uuid: t.uuid, actorUuid: t.actor.uuid, name: t.name, eligible: origins.some(o => withinFeet(source.parent, o.point, t, o.radius)), owned: own(t.actor, user),
        hitDice: t.actor.type === "npc" ? [{ denomination: `d${t.actor.system.attributes.hd?.denomination ?? 8}`, available: t.actor.system.attributes.hd?.value ?? 0 }] :
          values(t.actor.items).filter(i => i.type === "class").map(i => ({ denomination: i.system.hd?.denomination, available: i.system.hd?.value ?? (i.system.levels - Number(i.system.hd?.spent ?? 0)) })),
        benefits: values(t.actor.effects).filter(e => flag(e, "standardBenefit")?.bearerUuid === actor.uuid).map(e => ({ id: e.id, kind: flag(e, "standardBenefit").kind, label: e.name })) })) : [],
    pendingGains: getIntegratedOperatorState(actor).standardPendingGains ?? {},
    pending: state.operations.filter(o => o.status === "prepared") };
}

async function temporaryHP(target, amount, additive, id, actor) {
  return recipientSerial(target, async () => {
    const temp = Number(target.system.attributes.hp.temp ?? 0);
    await targetUpdate(target, id, { "system.attributes.hp.temp": applyTempHP(temp, amount, additive ? "additive" : "replace") }, actor);
  });
}
async function grantSP(target, amount, id, reason, exception = false, actor) {
  need(isOperatorActor(target), "Enable reviewed Operator SP integration on the recipient first; otherwise resolve the SP grant manually.");
  noteMutation(actor);
  await executeOperatorCommand(target, { id: standardKey(id), command: "adjust", data: { amount, reason, exception } });
}
async function hitDie(actor, target, op, id, data) { return recipientSerial(target, async () => {
  need(!isConstruct(target), "Constructs cannot regain HP from this Class Feature without an explicit source exception; resolve that exception manually.");
  const denomination = data.hitDice?.[target.uuid] ?? data.denomination;
  const classItem = values(target.items).find(i => i.type === "class" && i.system.hd?.denomination === denomination && (i.system.hd.value ?? (i.system.levels - i.system.hd.spent)) > 0);
  const npcHD = target.type === "npc" && target.system.attributes.hd;
  need(classItem || npcHD?.value > 0, "Choose an available recipient Hit Die.");
  const die = classItem ? denomination : `d${npcHD.denomination}`;
  const amount = Math.max(0, await dice(op, id, `1${die} + ${Number(actor.system.abilities.cha.mod)}`, actor));
  const hdReceipt = `flags.ak5e.standardHitDice.${standardKey(id)}`;
  if (classItem && !flag(classItem, "standardHitDice")?.[standardKey(id)]) {
    noteMutation(actor);
    await classItem.update({ "system.hd.spent": Number(classItem.system.hd.spent) + 1, [hdReceipt]: true });
  }
  const hp = target.system.attributes.hp;
  const update = { "system.attributes.hp.value": Math.min(Number(hp.effectiveMax ?? hp.max), Number(hp.value) + amount) };
  if (npcHD) update["system.attributes.hd.spent"] = Number(npcHD.spent) + 1;
  await targetUpdate(target, id, update, actor);
}); }
function beneficialTargets(data) { facts(data, ["allied"]); }
async function performCry(actor, source, targets, op, state, data) {
  const cry = BATTLECRIES[data.cry]; need(cry, "Choose a Battlecry."); facts(data, ["action"]);
  const item = sourceItem(actor, `${cry.name} (${cry.cost} Fervour)`);
  state = spendFervour(state, data.cry);
  const chorusTokens = await targetsFor(source, { targetTokenUuids: data.chorusTokenUuids ?? [] }, game.users.get(op.userId));
  if (chorusTokens.length) { facts(data, ["reaction", "allied"]); await requireAura(actor, state, source, chorusTokens); }
  let expiry = cry.trigger ? tagExpiry(actor, actor, { trigger: cry.trigger, expiryActor: "source" }) : null;
  if (data.cry === "havoc") {
    facts(data, ["hostile"]);
    const length = 30 + chorusTokens.length * 10, direction = Number(data.direction);
    need(Number.isFinite(direction), "Choose the cone direction.");
    for (const target of targets) {
      const origin = tokenPoint(source), offsets = target.getOccupiedGridSpaceOffsets?.();
      const points = source.parent.grid.type && offsets?.length ? offsets.map(o => source.parent.grid.getCenterPoint(o)) : [tokenPoint(target)];
      const shape = { type: "cone", ...origin, distance: feetToPixels(source.parent, length), direction,
        angle: 53.13, coneType: "flat" };
      need(points.some(point => containsPoint(shape, point)), "A chosen creature is outside the Cry Havoc cone.");
      need(["success", "failure", "manual"].includes(data.outcomes?.[target.uuid]), "Confirm the Wisdom save outcome, or choose manual resolution.");
      const amount = await dice(op, "cryHavoc", `${2 + chorusTokens.length}d4`, actor);
      if (data.outcomes[target.uuid] !== "manual") {
        await confirmedDamage(actor, target.actor, op, `${op.id}:${target.actor.uuid}:havoc`, amount, "psychic", data.outcomes[target.uuid] === "success", data.damageTotals?.[target.uuid], data.facts?.damageReviewed);
        if (data.outcomes[target.uuid] === "failure") await tagged(actor, item, target.actor, `${op.id}:${target.actor.uuid}:fear`,
          { label: "Cry Havoc: Frightened of bearer", condition: "frightened", actions: ["save"], instructions: cry.instructions }, { kind: "havoc", dc: standardDC(actor) });
      }
    }
  } else {
    beneficialTargets(data); await requireAura(actor, state, source, targets);
    for (const target of targets) {
      const id = `${op.id}:${target.actor.uuid}:effect`;
      if (data.cry === "rallying") await hitDie(actor, target.actor, op, id, data);
      else if (data.cry === "strident") await grantSP(target.actor, vanguardLevel(actor), id, "Strident Boast source-confirmed Class Feature", false, actor);
      else {
        const changes = data.cry === "heroic" ? [change("system.traits.ci.value", "frightened")] : [];
        await tagged(actor, item, target.actor, id, { label: cry.name, trigger: cry.trigger, expiryActor: "source", changes, instructions: cry.instructions },
          { kind: data.cry, cryId: op.id, value: Number(actor.system.abilities.cha.mod) });
      }
    }
  }
  state.cries[op.id] = { cry: data.cry, cryId: op.id, expiry, extensions: 0, cycle: turnCycle(actor),
    responseTurn: `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}` };
  // Chorus receipts are stored on recipients; no target UUIDs leak into source state.
  for (const target of chorusTokens) await doChorus(actor, source, target, op, state, { ...data, cryId: op.id }, item);
  return state;
}
async function doChorus(actor, source, target, op, state, data, providedItem) {
  const record = state.cries[data.cryId]; need(record, "Choose an existing Battlecry receipt.");
  const cry = BATTLECRIES[record.cry], id = `${data.cryId}:${target.actor.uuid}:chorus`;
  if (flag(target.actor, "standardApplications")?.[standardKey(id)] || flag(target.actor, "standardApplications")?.[standardKey(`${id}:benefit`)]) return;
  need(record.cry !== "havoc" || providedItem, "Cry Havoc Chorus choices must be confirmed before resolving its cone.");
  const item = providedItem ?? sourceItem(actor, `${cry.name} (${cry.cost} Fervour)`);
  facts(data, ["reaction", "allied"]); await requireAura(actor, state, source, [target]);
  // Reply to the declared cry, not to a historical expired card.
  need(record.responseTurn === `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}` && record.cycle === turnCycle(actor) && (!record.expiry || !tagHasExpired({ expiry: record.expiry }, { kind: "combatTurn", combat: currentCombat(actor) })), "The Chorus response window has passed; Chorus must respond to this declaration immediately.");
  if (record.cry === "heroic") await temporaryHP(target.actor, await dice(op, id, "1d8", actor), true, id, actor);
  else if (record.cry === "rallying") {
    need(flag(target.actor, "standardApplications")?.[standardKey(`${data.cryId}:${target.actor.uuid}:effect`)], "Rallying Chorus requires that recipient's preceding HP recovery.");
    await hitDie(actor, target.actor, op, id, data);
  } else if (record.cry === "strident") {
    const gain = getIntegratedOperatorState(target.actor).operations.find(o => o.id === standardKey(`${data.cryId}:${target.actor.uuid}:effect`));
    need(gain, "Strident Chorus requires that recipient's preceding SP gain.");
    await grantSP(target.actor, vanguardLevel(actor), id, "Strident Boast Chorus source-confirmed Class Feature", false, actor);
  } else if (record.cry === "defiant") await tagged(actor, item, target.actor, id,
    { label: "Defiant Roar Chorus: next Damage resistance", trigger: "time", seconds: 60, actions: ["used"], instructions: cry.instructions }, { kind: "resistance" });
  else if (record.cry === "belligerant") await tagged(actor, item, target.actor, id,
    { label: "Belligerant Chorus: next Bonus Action restriction", trigger: "nextTurnEnd", expiryActor: "target", instructions: cry.instructions }, { kind: "belligerantChorus" });
}
/** Native damage calculation retains defenses; no global damage hook is replaced. */
async function confirmedDamage(actor, target, op, id, amount, type, half = false, reviewedTotal, reviewed = false) { return recipientSerial(target, async () => {
  const key = standardKey(id);
  if (flag(target, "standardApplications")?.[key]) return;
  // Calculate against native defenses, then commit HP+receipt atomically. AK5e DR
  // remains the explicit preview/GM step because a correct combined DR is not inferable.
  const value = half ? Math.floor(amount / 2) : amount;
  const manual = reviewedTotal !== undefined && reviewedTotal !== "";
  if (manual) need(reviewed && Number.isFinite(Number(reviewedTotal)) && Number(reviewedTotal) >= 0, "Confirm a nonnegative final Damage total after AK5e DR and defenses.");
  const hasDR = ["bludgeoning", "piercing", "slashing", "thunder"].includes(type) && values(target.effects).some(e => !e.disabled && flag(e, "standardBenefit")?.kind === "defiant");
  need(!hasDR || manual, "Review AK5e DR before defenses and enter the final Damage total, or use manual resolution.");
  const result = manual ? { amount: Number(reviewedTotal) } : target.calculateDamage?.([{ value, type }], { invertHealing: false });
  need(result !== false, "Native damage calculation was canceled; nothing was applied.");
  const actual = Math.max(0, result?.amount ?? value), hp = target.system.attributes.hp;
  const applied = resolveDamage({ amount: actual, hp: { value: Math.max(0, Number(hp.value)), temp: Number(hp.temp ?? 0) } });
  const updates = { "system.attributes.hp.temp": applied.newTemp, "system.attributes.hp.value": applied.newHp };
  need(Hooks.call?.("dnd5e.preApplyDamage", target, applied.final, updates, { ak5eStandard: true }) !== false, "Native Damage application was canceled; nothing was applied.");
  await targetUpdate(target, id, updates, actor);
}); }

async function perform(actor, command, data, op, state, user) {
  if (["setup", "update"].includes(command)) {
    const preview = await previewStandardUpdate(actor);
    for (const addition of preview.additions) await actor.items.get(addition.itemId).update({ [`system.activities.${addition.activity._id}`]: addition.activity,
      "flags.ak5e.standardHelperVersion": STANDARD_VERSION });
    if (preview.weaponMissing) await actor.createEmbeddedDocuments("Item", [standardWeaponData(actor.uuid)]);
    state.holderUuid ??= actor.uuid; return state;
  }
  const source = await bearerSource(actor, data, state); state.sourceTokenUuid = source.uuid;
  const targets = await targetsFor(source, data, user);
  const one = () => { need(targets.length === 1, "Choose exactly one creature."); return targets[0]; };
  const adjacent = async () => {
    need(state.mode === "planted", "The standard must be planted.");
    const prop = await fromUuid(state.propTokenUuid ?? ""); need(prop?.parent.id === source.parent.id, "The planted standard is not in this scene.");
    need(withinFeet(source.parent, tokenPoint(prop), source, 5), "The bearer must be within 5 feet of the standard.");
    return prop;
  };
  switch (command) {
    case "wield":
      need(state.mode !== "planted" && (!state.holderUuid || state.holderUuid === actor.uuid), "Retrieve or return the standard before wielding it.");
      facts(data, ["qualifying"]); need(values(actor.items).some(i => flag(i, "standardWeapon") === actor.uuid), "Set up the Battle Standard weapon first.");
      state.mode = "wielded"; state.holderUuid = actor.uuid; break;
    case "stow": need(state.mode === "wielded", "The standard is not wielded."); state.mode = "carried"; break;
    case "plant":
      facts(data, ["action"]); need(state.mode === "wielded", "You must wield the standard to plant it (Bonus Action).");
      need(!state.lastStand, "The standard cannot move during Last Stand.");
      state.mode = "planted"; state.location = { sceneId: source.parent.id, ...tokenPoint(source) }; break;
    case "pickup": {
      facts(data, ["action"]); need(state.mode === "planted" && !state.lastStand, "The standard must be planted and movable.");
      const picker = one(), prop = await fromUuid(state.propTokenUuid ?? "");
      need(prop?.parent.id === picker.parent.id && withinFeet(source.parent, tokenPoint(prop), picker, 5), "The picking-up creature must be within 5 feet.");
      need(own(picker.actor, user), "You must own the picking-up creature.");
      state.mode = "carried"; state.holderUuid = picker.actor.uuid; state.holderTokenUuid = picker.uuid; state.location = null; break;
    }
    case "handoff": {
      facts(data, ["willing"]); need(state.mode !== "planted" && !state.lastStand, "Retrieve the movable standard first.");
      const holder = await fromUuid(state.holderTokenUuid ?? source.uuid), recipient = one();
      need(holder?.actor?.uuid === state.holderUuid && own(holder.actor, user), "Only the current holder may hand off the standard.");
      need(withinFeet(source.parent, tokenPoint(holder), recipient, 5), "Choose a recipient within 5 feet of the holder.");
      state.mode = "carried"; state.holderUuid = recipient.actor.uuid; state.holderTokenUuid = recipient.uuid; break;
    }
    case "fervour":
      facts(data, ["qualifying"]); need(targets.length, "Choose the creature involved in this source trigger.");
      await requireAura(actor, state, source, targets);
      if (data.trigger !== "hostileDefeated") facts(data, ["allied"]); else facts(data, ["hostile"]);
      state = grantFervour(state, data.trigger, turnCycle(actor)); break;
    case "clearFervour": facts(data, ["qualifying"]); state.fervour = 0; break;
    case "directed":
      facts(data, ["reaction", "qualifying"]); turnCycle(actor);
      need(values(actor.items).some(i => /directed-engagement/.test(flag(i, "chapterThreeId") ?? "")), "Attach Directed Engagement first.");
      state.directed = tagExpiry(actor, actor, { trigger: "currentTurnEnd", expiryActor: "active" }); break;
    case "tip": {
      const target = one(); facts(data, ["allied", "visible", "qualifying"]);
      need(withinFeet(source.parent, tokenPoint(source), target, 60), "Tip of the Spear requires a visible ally within 60 feet; no planted exception is invented.");
      const cycle = turnCycle(actor);
      if (data.trigger === "planted") {
        need(state.mode === "planted", "Plant the standard before using its entry/start trigger.");
        await requireAura(actor, state, source, [target]);
        need(state.tips[standardKey(target.actor.uuid)] !== cycle, "This creature already received the planted trigger before your next Turn.");
        state.tips[standardKey(target.actor.uuid)] = cycle;
      }
      const item = values(actor.items).find(i => /tip-of-the-spear/.test(flag(i, "chapterThreeId") ?? "")); need(item, "Attach Tip of the Spear first.");
      const directed = Boolean(state.directed && !tagHasExpired({ expiry: state.directed }, { kind: "combatTurn", combat: currentCombat(actor) }));
      await useTipVariant({ actor, item, target, op, directed, choice: data.tipChoice, repeatOnSameTarget: Boolean(state.lastStand), helpers: { dice, tagged, temporaryHP } });
      break;
    }
    case "cry": need(targets.length || data.cry === "havoc", "Choose eligible affected creatures."); state = await performCry(actor, source, targets, op, state, data); break;
    case "chorus": await doChorus(actor, source, one(), op, state, data); break;
    case "extend": {
      facts(data, ["action"]); await adjacent();
      const record = state.cries[data.cryId]; need(BATTLECRIES[record?.cry]?.extend && record.extensions < 4, "This Battlecry cannot be extended past five Rounds.");
      need(!tagHasExpired({ expiry: record.expiry }, { kind: "combatTurn", combat: currentCombat(actor) }), "An expired Battlecry cannot be extended.");
      const cycle = turnCycle(actor); need(record.lastExtension !== cycle, "Only one additional Round may be confirmed per Turn.");
      record.extensions++; record.lastExtension = cycle; record.expiry.round++;
      for (const target of tagActors()) for (const effect of featureTags(target).filter(e => flag(e, "standardBenefit")?.cryId === data.cryId))
        await effect.update({ "flags.ak5e.temporaryTag.expiry": record.expiry });
      break;
    }
    case "kingHill": {
      const target = one(); facts(data, ["allied", "visible", "action"]); need(state.mode === "planted", "King of the Hill requires a planted standard.");
      need(Object.entries(target.actor.system.attributes.movement).some(([k, v]) => ["walk", "fly", "swim", "climb", "burrow"].includes(k) && Number(v) > 0), "Recipient Speed must be greater than zero.");
      need(["walk", "all"].includes(data.choice), "Choose a King of the Hill movement option.");
      const changes = data.choice === "walk" ? [change("system.attributes.movement.walk", Number(actor.system.attributes.movement.walk), 5)] : speedChanges(target.actor, 10);
      await tagged(actor, sourceItem(actor, "4th Level: Symbol of Authority"), target.actor, op.id,
        { label: "King of the Hill", changes, trigger: "currentTurnEnd", expiryActor: "target", instructions: "Bonus Action; end this Turn within the Aura of Influence." }, { kind: "kingHill" }); break;
    }
    case "herald":
      facts(data, ["action"]); need(data.facts?.hears || data.facts?.visible, "Recipients must be able to see or hear the bearer."); need(targets.length > 0 && targets.length <= 2 && targets.every(t => t.actor.uuid !== actor.uuid), "Choose up to two different creatures other than yourself.");
      await requireAura(actor, state, source, targets);
      for (const target of targets) await tagged(actor, sourceItem(actor, "4th Level: Symbol of Authority"), target.actor, `${op.id}:${target.actor.uuid}`,
        { label: "Voice of the Herald", trigger: "nextTurnEnd", actions: ["used"], instructions: "Once before the end of your next Turn, roll 1d8 and add it to one Damage Roll; confirm Used after applying it." }, { kind: "herald" });
      break;
    case "projection": {
      facts(data, ["grounded", "visible", "action"]); need(!state.lastStand, "The standard cannot move during Last Stand.");
      need(!state.projectionUsed, "Power Projection recovers on Short Rest.");
      if (state.mode !== "wielded") await adjacent();
      const point = data.point; need(Number.isFinite(point?.x) && Number.isFinite(point?.y) && distanceFeet(source.parent, tokenPoint(source), point) <= 60 + 1e-6, "Choose a grounded visible location within 60 feet.");
      for (const target of targets) {
        need(withinFeet(source.parent, point, target, 15), "A chosen creature is outside the 15-foot impact area.");
        const outcome = data.outcomes?.[target.uuid]; need(["friendly", "success", "failure", "manual"].includes(outcome), "Confirm allegiance and Dexterity save outcome for each creature.");
        const id = `${op.id}:${target.actor.uuid}:projection`;
        if (outcome === "friendly") await temporaryHP(target.actor, await dice(op, id, `1d12 + ${Number(actor.system.abilities.cha.mod)}`, actor), false, id, actor);
        else if (outcome !== "manual") {
          await confirmedDamage(actor, target.actor, op, id, await dice(op, "projectionDamage", "6d6", actor), "thunder", outcome === "success", data.damageTotals?.[target.uuid], data.facts?.damageReviewed);
          if (outcome === "failure") await tagged(actor, sourceItem(actor, "10th Level: Power Projection"), target.actor, `${id}:speed`,
            { label: "Power Projection: Speed reduced by 15 feet", changes: speedChanges(target.actor, -15), trigger: "nextTurnEnd" }, { kind: "projection" });
        }
      }
      state.mode = "planted"; state.location = { sceneId: source.parent.id, ...point }; state.projectionUsed = true;
      state.projection = tagExpiry(actor, actor, { trigger: "nextTurnEnd", expiryActor: "source" }); break;
    }
    case "duty": {
      const target = one(); facts(data, ["allied", "reaction", "notKilledOutright", "qualifying"]); await requireAura(actor, state, source, [target]);
      need(!state.duty[standardKey(target.actor.uuid)], "Duty Not Yet Done has already been used on this creature since your Long Rest.");
      await recipientSerial(target.actor, () => targetUpdate(target.actor, op.id, { "system.attributes.hp.value": 1 }, actor)); state.duty[standardKey(target.actor.uuid)] = true; break;
    }
    case "expertise": {
      const saved = flag(actor, "standardExpertise");
      if (!saved) {
        const original = Object.fromEntries(["per", "itm"].map(key => [key, Number(actor.system.skills[key]?.value ?? 0)]));
        await targetUpdate(actor, op.id, { "flags.ak5e.standardExpertise": original,
          ...Object.fromEntries(Object.entries(original).map(([k, value]) => [`system.skills.${k}.value`, value >= 1 ? 2 : 1])) }, actor);
      } break;
    }
    case "lastStand":
      facts(data, ["action"]); ownTurn(actor); await adjacent(); need(!state.lastStandUsed, "Last Stand recovers on Long Rest.");
      await tagged(actor, sourceItem(actor, "17th Level: The Last Stand"), actor, op.id,
        { label: "The Last Stand", trigger: "time", seconds: 60, changes: speedChanges(actor, 0, 5), instructions: "Standard cannot move. Extra turns use confirmed guided combat handling; SP diversion is confirmed before the grant." }, { kind: "lastStand" });
      state.lastStand = { operationId: op.id, expiresAt: Number(game.time.worldTime) + 60 }; state.lastStandUsed = true; break;
    case "endStand":
      facts(data, ["action"]); await endStand(actor, state); break;
    case "extraTurn": {
      facts(data, ["willing", "action"]); ownTurn(actor); need(state.lastStand, "Activate Last Stand first."); await requireAura(actor, state, source, [one()]);
      await tagged(actor, sourceItem(actor, "17th Level: The Last Stand"), one().actor, op.id,
        { label: "Last Stand: take one full Turn now", trigger: "manual", actions: ["used"], instructions: "Pause the bearer's Turn, manually resolve this willing creature's full Turn (including start/end triggers), then resume the bearer. Confirm Used after that Turn. Do not silently reorder initiative." }, { kind: "extraTurn" }); break;
    }
    case "redirect": {
      facts(data, ["qualifying"]); need(state.lastStand, "Activate Last Stand first."); await requireAura(actor, state, source, [one()]);
      // Before-gain only. Never subtract already-spent SP or trigger a second gain.
      const pending = getIntegratedOperatorState(actor).standardPendingGains?.[data.eventId];
      need(pending, "Choose a recorded pending SP event. Already-applied or unobserved grants require manual GM reconciliation.");
      await grantSP(one().actor, pending.amount, op.id, "Last Stand: redirected confirmed pending SP gain", false, actor);
      await executeOperatorCommand(actor, { id: standardKey(`${op.id}:resolve`), command: "resolveStandardGain", data: { eventId: data.eventId, redirected: true } }); break;
    }
    case "acceptGain": {
      facts(data, ["qualifying"]); noteMutation(actor);
      await executeOperatorCommand(actor, { id: standardKey(`${op.id}:resolve`), command: "resolveStandardGain", data: { eventId: data.eventId, redirected: false } }); break;
    }
    case "tipSP": {
      const target = one(); facts(data, ["qualifying"]);
      await useTipSP({ target: target.actor, amount: data.amount, op, grantSP, actor }); break;
    }
    case "useBenefit": {
      const target = one(), effect = target.actor.effects.get(data.benefitId), meta = flag(effect, "standardBenefit");
      need(meta?.bearerUuid === actor.uuid && !effect.disabled, "Choose an active benefit from this bearer."); facts(data, ["qualifying"]);
      if (meta.kind === "herald") await dice(op, `herald:${target.actor.uuid}`, "1d8", actor);
      else need(["tip1", "resistance", "extraTurn", "belligerantChorus"].includes(meta.kind), "This benefit is not consumed by this helper.");
      await removeFeatureTag(target.actor, flag(effect, "temporaryTag").id); break;
    }
    case "frightenedSave": {
      const target = one(), effect = target.actor.effects.get(data.benefitId);
      need(flag(effect, "standardBenefit")?.kind === "havoc" && flag(effect, "standardBenefit")?.bearerUuid === actor.uuid, "Choose this bearer's Cry Havoc effect.");
      facts(data, ["qualifying"]); need(data.outcomes?.[target.uuid] === "success", "Confirm the successful repeat Wisdom save.");
      await removeFeatureTag(target.actor, flag(effect, "temporaryTag").id); break;
    }
    default: throw new Error("Unknown Standard Bearer operation.");
  }
  return state;
}

async function endStand(actor, state) {
  for (const effect of featureTags(actor).filter(e => flag(e, "standardBenefit")?.kind === "lastStand")) await removeFeatureTag(actor, flag(effect, "temporaryTag").id);
  state.lastStand = null;
}
/** Persistent prop Actor is a technical holder, never an AK5e monster. */
export async function syncStandardMap(actor, state = standardState(actor)) {
  need(gmActive(), "An active GM must synchronize the flag.");
  const source = state.sourceTokenUuid && await fromUuid(state.sourceTokenUuid);
  if (!source) return;
  noteMutation(actor);
  const scene = source.parent;
  const previous = values(game.scenes).flatMap(s => values(s.tokens)).filter(t => flag(t, "standardProp")?.bearerUuid === actor.uuid);
  let prop;
  if (state.mode === "planted" && state.location?.sceneId === scene.id) {
    let base = values(game.actors).find(a => flag(a, "standardPropActor") === actor.uuid);
    if (!base) base = await Actor.implementation.create({ name: `${actor.name}: Battle Standard (prop)`, type: "npc", img: "icons/svg/tower-flag.svg",
      ownership: { default: 0 }, flags: { ak5e: { standardPropActor: actor.uuid } },
      system: { details: { biography: { value: "Noncombat Battle Standard prop. No creature statistics, HP, initiative or movement blocking apply." } } } });
    const position = { x: state.location.x - scene.grid.size / 2, y: state.location.y - scene.grid.size / 2, elevation: Number(state.location.elevation ?? 0) };
    prop = previous.find(t => t.parent.id === scene.id);
    if (!prop) [prop] = await scene.createEmbeddedDocuments("Token", [{ name: "Battle Standard", actorId: base.id, actorLink: true, width: 1, height: 1, ...position,
      texture: { src: "icons/svg/tower-flag.svg" }, displayBars: 0, bar1: { attribute: null }, bar2: { attribute: null },
      sight: { enabled: false }, flags: { ak5e: { standardProp: { bearerUuid: actor.uuid } } } }]);
    else await prop.update(position, { ak5eStandardSync: true });
    state.propTokenUuid = prop.uuid;
  } else state.propTokenUuid = null;
  for (const old of previous) if (old !== prop) await old.delete({ ak5eStandardSync: true });
  const origins = await auraOrigins(actor, state, source);
  const oldTemplates = values(game.scenes).flatMap(s => values(s.templates)).filter(t => flag(t, "standardAura")?.bearerUuid === actor.uuid);
  for (let index = 0; index < origins.length; index++) {
    const origin = origins[index], old = oldTemplates.find(t => t.parent.id === scene.id && flag(t, "standardAura").index === index);
    const units = String(scene.grid.units ?? "ft").toLowerCase();
    const distance = /^(m|meters?|metres?)$/.test(units) ? origin.radius / 3.280839895 : origin.radius;
    const data = { t: "circle", x: origin.point.x, y: origin.point.y, distance, direction: 0, fillColor: "#d4af37", borderColor: "#ffe9a2",
      user: game.user.id, flags: { ak5e: { standardAura: { bearerUuid: actor.uuid, index, radius: origin.radius } } } };
    if (old) await old.update(data); else await scene.createEmbeddedDocuments("MeasuredTemplate", [data]);
  }
  for (const old of oldTemplates) if (old.parent.id !== scene.id || flag(old, "standardAura").index >= origins.length) await old.delete();
}

const kernel = createOperationKernel({
  label: "Standard Bearer", stateFlag: "standardBearer", requestFlag: "standardRequest", responseFlag: "standardResponse",
  receiptFlag: "standardApplications", benefitFlag: "standardBenefit", rollFlag: "standardRoll", tagPreset: "standard-bearer",
  getState: standardState, isMember: hasStandardBranch, ownerExempt: ["pickup", "handoff"], gate: gates,
  beforeRun: async (actor, state) => { if (state.lastStand && state.lastStand.expiresAt <= Number(game.time.worldTime)) await endStand(actor, state); },
  perform, afterPerform: syncStandardMap
});
const { noteMutation, saveState, targetUpdate, tagged, serial } = kernel;
const dice = (op, key, formula, actor) => kernel.rollOnce(op, key, formula, actor);
export const executeStandardCommand = kernel.execute;
export const handleStandardRequest = kernel.handle;
export const submitStandardCommand = kernel.submit;

/** Internal tooling barrier for fixture teardown; no state is changed. */
export const waitForStandardOperations = actor => serial(actor, async () => {});

export function standardDamagePreview(target, options) {
  const dr = values(target.effects).filter(e => !e.disabled && flag(e, "standardBenefit")?.kind === "defiant")
    .reduce((sum, e) => sum + Math.max(0, Number(flag(e, "standardBenefit").value)), 0);
  need(Number(options.amount) >= 0, "Enter nonnegative Damage.");
  const physical = ["bludgeoning", "piercing", "slashing", "thunder"].includes(options.damageType);
  const resolved = resolveDamage({ amount: Number(options.amount), type: options.damageType, reduction: physical ? dr : 0,
    resistance: Boolean(options.resistance), vulnerability: Boolean(options.vulnerability) });
  return { reduction: physical ? dr : 0, result: resolved.final, steps: resolved.steps,
    instructions: "Review other DR and stacking with the GM. Apply DR before Resistance/Vulnerability; Damage cannot be reduced below 1. This preview does not apply Damage." };
}

async function refreshStandard(actor, event = {}) {
  if (!gmActive()) return;
  return serial(actor, async () => {
    // A queued refresh must not recreate support that was removed while waiting.
    if (!flag(actor, "standardBearer")) return;
    const state = standardState(actor);
    if (state.projection && tagHasExpired({ expiry: state.projection }, event)) state.projection = null;
    if (state.directed && tagHasExpired({ expiry: state.directed }, event)) state.directed = null;
    if (state.lastStand && Number(game.time.worldTime) >= state.lastStand.expiresAt) await endStand(actor, state);
    if (event.kind === "rest" && ["short", "long"].includes(event.type)) {
      state.projectionUsed = false;
      if (event.type === "long") { state.lastStandUsed = false; state.duty = {}; }
    }
    await syncStandardMap(actor, state); await saveState(actor, state);
  });
}
export function registerStandardBearerHooks() {
  registerStandardSheetHooks();
  Hooks.on("createChatMessage", handleStandardRequest);
  Hooks.on("updateToken", (token, changed) => {
    if (!gmActive() || !["x", "y", "elevation"].some(k => k in changed)) return;
    for (const actor of tagActors().filter(a => flag(a, "standardBearer"))) {
      const state = standardState(actor);
      if (state.sourceTokenUuid === token.uuid || state.propTokenUuid === token.uuid) safely(refreshStandard(actor));
    }
  });
  Hooks.on("preUpdateToken", (token, changes, options) => {
    const prop = flag(token, "standardProp"); if (!prop || options.ak5eStandardSync) return;
    // The physical location is managed by plant/projection/pickup, including Last Stand.
    if (["x", "y", "elevation", "actorId"].some(k => k in changes)) { ui.notifications.warn("Use the Standard Bearer controls to move or retrieve the flag."); return false; }
  });
  Hooks.on("preCreateCombatant", combatant => { if (flag(combatant.token, "standardProp")) return false; });
  Hooks.on("updateCombat", (combat, changes) => {
    if (!("turn" in changes || "round" in changes)) return;
    const kind = combat.started ? "combatTurn" : "combatEnd";
    for (const actor of tagActors().filter(a => flag(a, "standardBearer"))) safely(refreshStandard(actor, { kind, combat }));
  });
  Hooks.on("deleteCombat", combat => { for (const actor of tagActors().filter(a => flag(a, "standardBearer"))) safely(refreshStandard(actor, { kind: "combatEnd", combat })); });
  Hooks.on("updateWorldTime", worldTime => { for (const actor of tagActors().filter(a => flag(a, "standardBearer"))) safely(refreshStandard(actor, { kind: "time", worldTime })); });
  Hooks.on("dnd5e.restCompleted", (actor, _result, config = {}) => { if (flag(actor, "standardBearer")) safely(refreshStandard(actor, { kind: "rest", type: config.type, actorUuid: actor.uuid })); });
  // Scoped roll configuration: a Tip effect changes only its recipient's attack.
  Hooks.on("dnd5e.preRollAttackV2", config => { adjustAttackConfig(config); });
  Hooks.on("canvasReady", () => { if (gmActive()) for (const actor of tagActors().filter(a => flag(a, "standardBearer"))) safely(refreshStandard(actor)); });
}
