import { learnedSkills, operatorState, skillDefinition, spInteger, eventIdentity, chargeOperatorState,
  activateSkillState, recoverOperatorState, skillExpired } from "./operator-rules.mjs";
import { registerOperatorSheetHooks, openOperatorSkills, openOperatorSkillChoices } from "./operator-sheet.mjs";
import { getOperatorSkillChoices, progressionWithChoices } from "./operator-progression.mjs";
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
export { openOperatorSkills, openOperatorSkillChoices, getOperatorSkillChoices };

const list = collection => Array.from(collection?.values?.() ?? collection ?? []);
const flag = (document, key) => document?.getFlag?.("ak5e", key) ?? document?.flags?.ak5e?.[key];
const queues = new Map();
const damageSnapshots = new WeakMap();
const restRequests = new WeakMap();
const consumedOrigins = new Set();
let installed = false;
const safely = promise => Promise.resolve(promise).catch(error => { console.error("AK5e | Operator Skills", error); ui.notifications.error(error.message); });
export const spText = key => game.i18n.localize(`AK5E.Operator.${key}`);
const newId = () => foundry.utils.randomID();
const activeGM = () => game.users?.activeGM;
const operates = () => Boolean(game.user.isGM && activeGM() && activeGM().id === game.user.id);

export function operatorActors() {
  const actors = new Map(list(game.actors).map(actor => [actor.uuid, actor]));
  for (const scene of list(game.scenes)) for (const token of list(scene.tokens)) if (token.actor) actors.set(token.actor.uuid, token.actor);
  return [...actors.values()];
}

export function actorOperatorSkills(actor) { return learnedSkills(list(actor.items)); }
export function getIntegratedOperatorState(actor) { return operatorState(flag(actor, "operatorSkills") ?? {}, actorOperatorSkills(actor)); }
export function isOperatorActor(actor) { return flag(actor, "operatorSkills")?.enabled === true; }

export function isLiveProgressionActor(actor) {
  return actor?.documentName === "Actor" && !actor.pack && actor.type === "character"
    && (game.actors?.get(actor.id) === actor || actor.isToken && actor.token?.actor === actor);
}

export function operatorSkillItemData(entry) {
  if (!entry?.operatorSkill) throw new Error(spText("SkillRequired"));
  return { name: entry.name, type: "feat", img: "icons/svg/upgrade.svg",
    system: { ...structuredClone(entry.systemData), description: { value: entry.content, chat: "" } },
    flags: { ak5e: { operatorSkill: structuredClone(entry.operatorSkill), chapterThreeId: entry.id, classContentKind: "operator-skill",
      parentClass: entry.parentClass, parentBranch: entry.parentBranch, classLevel: entry.level,
      sourceHeading: entry.sourceHeading, sourceFile: "03_chapter_3_character_classes.txt", rawSource: entry.rawSource }, dnd5e: { sourceBook: "AK5E" } } };
}

function owned(actor, user = game.user) {
  if (actor?.documentName !== "Actor" || actor.pack || !["character", "npc"].includes(actor.type)) throw new Error(spText("ActorRequired"));
  if (!user?.isGM && !actor.testUserPermission?.(user, "OWNER")) throw new Error(spText("OwnerRequired"));
}

export function operatorContext(actor) {
  const combats = list(game.combats);
  const matches = combats.filter(combat => combat.started && combat.combatant?.actor?.uuid === actor?.uuid);
  return { worldTime: Number(game.time?.worldTime ?? 0), roundTime: CONFIG.time?.roundTime ?? 6, combats,
    combat: matches.length === 1 ? matches[0] : game.combat,
    ownTurn: matches.length === 1 };
}

function serial(actor, action) {
  const previous = queues.get(actor.uuid) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  queues.set(actor.uuid, next);
  return next.finally(() => { if (queues.get(actor.uuid) === next) queues.delete(actor.uuid); });
}

async function save(actor, state) {
  if (!operates()) throw new Error(spText("GMRequired"));
  // Derived counts/rates are never authoritative persisted inputs.
  const { counts, rates, ...stored } = state;
  // Unlinked token deltas must store even fields currently equal to the base Actor.
  // Otherwise a later base-Actor gain leaks into this token's independent pool.
  const committed = await actor.update({ "flags.ak5e.operatorSkills": stored }, actor.isToken ? { diff: false } : {});
  if (!committed) throw new Error(spText("CommitFailed"));
  return getIntegratedOperatorState(actor);
}

/** All new SP writes use the elected GM's per-Actor queue. */
export async function executeOperatorCommand(actor, request, user = game.user) {
  if (!operates()) throw new Error(spText("GMRequired"));
  owned(actor, user);
  if (!request?.id || typeof request.id !== "string") throw new Error("An SP command requires a stable ID.");
  return serial(actor, async () => {
    if (!operates()) throw new Error(spText("GMRequired"));
    owned(actor, user);
    let state = getIntegratedOperatorState(actor);
    const previous = state.operations.find(operation => operation.id === request.id);
    if (previous) return { state, result: previous.result };
    const data = request.data ?? {};
    const context = operatorContext(actor);
    if (skillExpired(state.active, context)) state = { ...state, active: null };
    let result = true;
    switch (request.command) {
      case "enable": state = operatorState({ ...state, enabled: data.enabled !== false }, actorOperatorSkills(actor)); break;
      case "learn": {
        if (actor.type === "character" && !user.isGM) throw new Error(spText("UseSkillChoices"));
        const entry = CHAPTER_THREE_CLASSES.find(entry => entry.id === data.sourceId && entry.operatorSkill);
        if (!entry) throw new Error(spText("SkillRequired"));
        const existing = actorOperatorSkills(actor).find(skill => skill.sourceId === entry.id);
        result = existing?.itemId ?? (await actor.createEmbeddedDocuments("Item", [operatorSkillItemData(entry)]))[0].id;
        state = operatorState(state, actorOperatorSkills(actor));
        break;
      }
      case "checkChoices": {
        if (!isLiveProgressionActor(actor)) throw new Error(spText("ChoiceActorRequired"));
        const view = getOperatorSkillChoices(actor);
        if (!view.applicable) return { state, result: false };
        const progression = progressionWithChoices(state.progression, view);
        if (data.advancementComplete) progression.notificationId = request.id;
        if (JSON.stringify(progression) === JSON.stringify(state.progression)) return { state, result: false };
        state = { ...state, progression };
        break;
      }
      case "chooseSkills": {
        if (!isLiveProgressionActor(actor)) throw new Error(spText("ChoiceActorRequired"));
        let view = getOperatorSkillChoices(actor);
        if (!view.applicable || !view.contextKey) throw new Error(spText("ChoiceActorRequired"));
        if (data.contextKey !== view.contextKey) throw new Error(spText("StaleChoices"));
        if (view.blocked.length) throw new Error(spText(view.blocked[0]));
        const selections = data.selections;
        if (!Array.isArray(selections) || !selections.length || new Set(selections.map(choice => choice?.key)).size !== selections.length) throw new Error(spText("SelectAllSkills"));
        const toCreate = [];
        for (const choice of selections) {
          const slot = view.slots.find(slot => slot.key === choice?.key);
          if (!slot || slot.status === "locked" || slot.status === "chosen" && slot.selection.sourceId !== choice.sourceId
            || slot.status === "pending" && !slot.options.some(entry => entry.id === choice.sourceId)) throw new Error(spText("InvalidSkillChoice"));
          if (slot.status === "chosen") continue;
          const entry = slot.options.find(entry => entry.id === choice.sourceId);
          const itemData = operatorSkillItemData(entry);
          itemData.flags.ak5e.operatorSkillChoice = { key: slot.key, sourceId: entry.id };
          toCreate.push(itemData);
        }
        if (view.pending.some(slot => !selections.some(choice => choice.key === slot.key))) throw new Error(spText("SelectAllSkills"));
        if (toCreate.length) await actor.createEmbeddedDocuments("Item", toCreate, { ak5eSkillChoice: true });
        // Recover interrupted creation/Actor saves from embedded choice markers on retry.
        if (!operates()) throw new Error(spText("GMRequired"));
        owned(actor, user);
        view = getOperatorSkillChoices(actor);
        if (view.contextKey !== data.contextKey) throw new Error(spText("StaleChoices"));
        if (selections.some(choice => view.slots.find(slot => slot.key === choice.key)?.selection?.sourceId !== choice.sourceId)) throw new Error(spText("ChoiceCommitFailed"));
        state = operatorState({ ...state, progression: progressionWithChoices(state.progression, view) }, actorOperatorSkills(actor));
        result = selections.map(choice => ({ key: choice.key, ...view.slots.find(slot => slot.key === choice.key).selection }));
        break;
      }
      case "sync":
        if (!user.isGM) throw new Error(spText("GMRequired"));
        break;
      case "activate": {
        if (!state.enabled) throw new Error(spText("EnableFirst"));
        const skill = actorOperatorSkills(actor).find(skill => skill.itemId === data.itemId);
        if (!skill) throw new Error(spText("SkillRequired"));
        state = activateSkillState(state, skill, { ...context, id: request.id });
        break;
      }
      case "activateManual": {
        if (!user.isGM) throw new Error(spText("GMAdjustment"));
        if (!String(data.id ?? "").trim()) throw new Error(spText("SkillRequired"));
        state = activateSkillState(state, { ...data, name: data.name ?? data.id, duration: data.duration ?? "Manual" }, { ...context, id: request.id });
        break;
      }
      case "end": state = { ...state, active: null }; break;
      case "extend": {
        const rounds = spInteger(data.rounds ?? 1, "Additional rounds", 1);
        if (state.active?.expiry?.kind !== "rounds") throw new Error(spText("TimedRequired"));
        if (!String(data.reason ?? "").trim()) throw new Error(spText("ReasonRequired"));
        state = { ...state, active: { ...state.active, expiry: { ...state.active.expiry,
          rounds: state.active.expiry.rounds + rounds, expiresAt: state.active.expiry.expiresAt + rounds * context.roundTime } },
          lastAdjustment: { reason: data.reason, rounds } };
        break;
      }
      case "adjust": {
        if (!user.isGM) throw new Error(spText("GMAdjustment"));
        if (!String(data.reason ?? "").trim()) throw new Error(spText("ReasonRequired"));
        const amount = Number(data.amount);
        if (!Number.isSafeInteger(amount)) throw new Error("Change SP by a whole number.");
        if (amount > 0 && state.active && data.exception !== true) throw new Error(spText("ActiveNoGain"));
        const points = Math.min(state.maximum, Math.max(0, state.points + amount));
        state = { ...state, points, lastAdjustment: { reason: data.reason, amount: points - state.points, exception: data.exception === true } };
        break;
      }
      case "recover": state = recoverOperatorState(state, context); break;
      case "configureSkill": {
        if (!user.isGM) throw new Error(spText("GMAdjustment"));
        const item = actor.items.get(data.itemId);
        if (item?.type !== "feat") throw new Error(spText("SkillRequired"));
        const definition = skillDefinition({ ...flag(item, "operatorSkill"), ...data.options });
        if (!String(definition.source ?? item.getFlag?.("ak5e", "sourceHeading") ?? "").trim()) throw new Error(spText("ReasonRequired"));
        await actor.updateEmbeddedDocuments("Item", [{ _id: item.id, "flags.ak5e.operatorSkill": definition }]);
        state = operatorState(state, actorOperatorSkills(actor));
        break;
      }
      case "origin": {
        const skill = actorOperatorSkills(actor).find(skill => skill.itemId === data.itemId);
        if (!skill) throw new Error(spText("SkillRequired"));
        state = { ...state, pendingOrigin: { id: request.id, skillUuid: skill.uuid, name: skill.name } };
        break;
      }
      case "clearOrigin": state = { ...state, pendingOrigin: null }; break;
      case "dismiss": state = { ...state, pendingEvents: state.pendingEvents.filter(event => event.id !== data.eventId) }; break;
      case "event": {
        if (!state.enabled) throw new Error(spText("EnableFirst"));
        if (data.event?.type === "automatic") throw new Error("Turn-start charging is recorded by the combat integration.");
        const pending = state.pendingEvents.find(event => event.id === data.event?.id);
        const event = { ...(pending ?? data.event), ...data.event };
        const target = event.targetUuid ? await fromUuid(event.targetUuid) : null;
        if (["offensiveHealing", "offensiveTemp"].includes(event.type) && target?.documentName !== "Actor") throw new Error(spText("TargetRequired"));
        // Manual confirmations may establish missing facts, but cannot erase known Skill origins or turn restrictions.
        event.skillOrigin = pending?.skillOrigin || event.skillOrigin;
        event.activeAtEvent = pending?.activeAtEvent || event.activeAtEvent;
        if (pending) { event.type = pending.type; event.targetUuid = pending.targetUuid; }
        event.ownTurn = pending ? pending.ownTurn : context.ownTurn;
        event.self = target?.uuid === actor.uuid;
        event.provenanceUnknown = false;
        if (!event.id) throw new Error("Confirm an event with a stable ID.");
        if (pending?.attack === true) event.attack = true;
        if (event.attack && !event.attackId) event.attackId = `manual:${event.id}`;
        if (event.attackId && !event.attackId.startsWith("manual:")) {
          const attack = await fromUuid(event.attackId);
          if (attack?.documentName !== "ChatMessage" || attack.flags?.dnd5e?.roll?.type !== "attack") throw new Error(spText("AttackRequired"));
          const attackActor = messageActor(attack);
          if (event.type.startsWith("offensive") && attackActor?.uuid !== actor.uuid) throw new Error(spText("AttackRequired"));
          if (event.type === "defensiveAttack" && attack.flags.dnd5e.targets?.length && !attack.flags.dnd5e.targets.some(target => target.uuid === actor.uuid)) throw new Error(spText("AttackRequired"));
          event.skillOrigin ||= messageSkillOrigin(attack);
        }
        const charged = chargeOperatorState(state, event);
        if (charged.reason === "confirmation") throw new Error(spText("ConfirmFacts"));
        state = { ...charged.state, pendingEvents: charged.state.pendingEvents.filter(candidate => candidate.id !== event.id) };
        result = { gained: charged.gained, reason: charged.reason };
        break;
      }
      default: throw new Error("Unknown Operator Skill operation.");
    }
    state = { ...state, operations: [...state.operations, { id: request.id, result }] };
    owned(actor, user);
    const committed = await save(actor, state);
    if (request.command === "activate") {
      const item = actor.items.get(data.itemId);
      // Source feedback follows the commit; a chat failure does not undo a successful activation.
      try { await item.displayCard?.({ flags: { ak5e: { skillOrigin: { skillUuid: item.uuid, activationId: request.id }, spActivation: request.id } } }); }
      catch (error) { console.error("AK5e | Activated Skill source card could not be displayed", error); }
    }
    return { state: committed, result };
  });
}

/** Receipts are committed in the same Actor update as the resulting SP. */
export async function processOperatorEvent(actor, event) {
  if (!operates() || !isOperatorActor(actor)) return;
  return serial(actor, async () => {
    let state = getIntegratedOperatorState(actor);
    if (skillExpired(state.active, operatorContext(actor))) state = { ...state, active: null };
    const charged = chargeOperatorState(state, event);
    if (charged.reason === "confirmation") {
      if (!state.pendingEvents.some(candidate => candidate.id === event.id)) await save(actor, { ...state, pendingEvents: [...state.pendingEvents, event] });
    } else if (charged.state !== state || flag(actor, "operatorSkills")?.active && !state.active) await save(actor, charged.state);
    return charged;
  });
}

export async function handleOperatorRequest(message, _options, userId) {
  if (!operates()) return;
  const request = flag(message, "spRequest");
  if (!request || flag(message, "spResponse")) return;
  // userId is supplied by Foundry's database notification, not request data or the speaker.
  const user = game.users.get(userId);
  try {
    if (!user || message.author?.id !== userId) throw new Error(spText("OwnerRequired"));
    const actor = await fromUuid(request.actorUuid);
    owned(actor, user);
    const outcome = request.command === "application"
      ? await processOperatorApplication(actor, request.data, user)
      : await executeOperatorCommand(actor, request, user);
    await message.update({ "flags.ak5e.spResponse": { ok: true, result: outcome?.result ?? true } });
  } catch (error) {
    await message.update({ "flags.ak5e.spResponse": { ok: false, error: error.message } });
  }
}

export async function submitOperatorCommand(actor, command, data = {}, id = newId()) {
  owned(actor);
  const gm = activeGM();
  if (!gm) throw new Error(spText("GMRequired"));
  const request = { id, actorUuid: actor.uuid, command, data };
  if (operates()) return (await executeOperatorCommand(actor, request)).result;
  // A real document provides a server-attributed initiating user; no socket impersonation.
  const message = await ChatMessage.implementation.create({ content: spText("Request"), whisper: [gm.id, game.user.id],
    flags: { ak5e: { spRequest: request } } });
  return new Promise((resolve, reject) => {
    const finish = response => {
      if (!response) return;
      clearTimeout(timer);
      Hooks.off("updateChatMessage", listener);
      response.ok ? resolve(response.result) : reject(new Error(response.error));
    };
    const listener = document => { if (document.id === message.id) finish(flag(document, "spResponse")); };
    const timer = setTimeout(() => { Hooks.off("updateChatMessage", listener); reject(new Error(spText("RequestTimeout"))); }, 15000);
    Hooks.on("updateChatMessage", listener);
    finish(flag(message, "spResponse"));
  });
}

export async function configureOperatorSkill(item, options) {
  const actor = item.parent;
  await submitOperatorCommand(actor, "configureSkill", { itemId: item.id, options });
  return flag(item, "operatorSkill");
}
export async function recordSkillPointEvent(actor, event) { return submitOperatorCommand(actor, "event", { event }); }
export async function recoverOperatorSkills(actor, options = {}) { await submitOperatorCommand(actor, "recover", {}, options.id); return getIntegratedOperatorState(actor); }
export async function adjustOperatorSP(actor, amount, options = {}) { await submitOperatorCommand(actor, "adjust", { amount, ...options }); return getIntegratedOperatorState(actor); }
export async function activateIntegratedSkill(actor, itemId) { return submitOperatorCommand(actor, "activate", { itemId }); }
export async function endIntegratedSkill(actor) { await submitOperatorCommand(actor, "end"); return getIntegratedOperatorState(actor); }

function tokensFor(actor) {
  if (actor?.token) return [actor.token];
  return list(game.scenes).flatMap(scene => list(scene.tokens)).filter(token => token.actor?.uuid === actor?.uuid);
}
export function operatorHostility(source, target) {
  if (!source || !target || source.uuid === target.uuid) return false;
  const first = tokensFor(source), second = tokensFor(target);
  const pairs = first.flatMap(a => second.filter(b => a.parent?.id === b.parent?.id).map(b => [a.disposition, b.disposition]));
  if (!pairs.length || pairs.some(pair => !pair.every(value => value === 1 || value === -1))) return null;
  const values = pairs.map(([a, b]) => a !== b);
  return values.every(value => value === values[0]) ? values[0] : null;
}

export function messageSkillOrigin(message) {
  const visited = new Set();
  for (let current = message; current && !visited.has(current.id); current = game.messages.get(current.getFlag?.("dnd5e", "originatingMessage") ?? current.flags?.dnd5e?.originatingMessage)) {
    visited.add(current.id);
    const origin = flag(current, "skillOrigin");
    if (origin) return origin;
    const itemUuid = current.flags?.dnd5e?.item?.uuid;
    const item = itemUuid ? fromUuidSync(itemUuid) : null;
    if (flag(item, "operatorSkill")) return { skillUuid: itemUuid };
  }
  return null;
}

export function originatingAttack(message) {
  const visited = new Set();
  for (let current = message; current && !visited.has(current.id); current = game.messages.get(current.flags?.dnd5e?.originatingMessage)) {
    visited.add(current.id);
    if (current.flags?.dnd5e?.roll?.type === "attack") return current;
  }
  return null;
}

function messageActor(message) {
  const activity = message?.flags?.dnd5e?.activity?.uuid;
  const item = message?.flags?.dnd5e?.item?.uuid;
  return (activity && fromUuidSync(activity)?.actor) || (item && fromUuidSync(item)?.actor) || message?.speakerActor;
}

export function markOperatorOrigin(message) {
  if (!message.flags?.dnd5e?.activity && !message.flags?.dnd5e?.roll) return;
  let origin = messageSkillOrigin(message);
  const actor = messageActor(message);
  const pending = flag(actor, "operatorSkills")?.pendingOrigin;
  if (!origin && pending && !consumedOrigins.has(pending.id)) { origin = pending; consumedOrigins.add(pending.id); }
  if (origin) message.updateSource({ "flags.ak5e.skillOrigin": origin });
}

export async function observeOperatorAttack(message) {
  if (!operates()) return;
  const source = messageActor(message);
  const pending = flag(source, "operatorSkills")?.pendingOrigin;
  if (pending && flag(message, "skillOrigin")?.id === pending.id) await serial(source, async () => save(source, { ...getIntegratedOperatorState(source), pendingOrigin: null }));
  if (message.flags?.dnd5e?.roll?.type !== "attack") return;
  // A combined multi-roll message does not reliably map rolls to distinct attacks/targets.
  const uncertain = message.rolls?.length !== 1 || !source;
  for (const descriptor of message.flags.dnd5e.targets ?? []) {
    const target = await fromUuid(descriptor.uuid);
    if (target?.documentName !== "Actor") continue;
    await processOperatorEvent(target, { type: "defensiveAttack", id: message.uuid, attackId: message.uuid,
      hostile: operatorHostility(source, target), skillOrigin: messageSkillOrigin(message), provenanceUnknown: uncertain,
      sourceUuid: source?.uuid, targetUuid: target.uuid, originMessage: message.uuid, label: message.flavor ?? source?.name });
  }
}

export function captureOperatorDamage(actor, amount, updates, options) {
  const snapshots = damageSnapshots.get(options) ?? new Map();
  const hp = actor.system.attributes.hp;
  snapshots.set(actor.uuid, { id: newId(), messageUuid: options.originatingMessage?.uuid,
    amount, before: { value: hp.value, temp: hp.temp ?? 0 }, after: { value: updates["system.attributes.hp.value"], temp: updates["system.attributes.hp.temp"] ?? 0 },
    context: { ownTurn: operatorContext(messageActor(options.originatingMessage)).ownTurn },
    activeSource: Boolean(flag(messageActor(options.originatingMessage), "operatorSkills")?.active), activeTarget: Boolean(flag(actor, "operatorSkills")?.active) });
  damageSnapshots.set(options, snapshots);
}

export async function observeOperatorDamage(actor, _amount, options) {
  const snapshots = damageSnapshots.get(options);
  const observation = snapshots?.get(actor.uuid);
  snapshots?.delete(actor.uuid);
  if (!observation) return;
  // The post-application hook runs only on the initiating client, after a successful update.
  const hp = actor.system.attributes.hp;
  if (hp.value !== observation.after.value || (hp.temp ?? 0) !== observation.after.temp) return;
  if (operates()) return processOperatorApplication(actor, observation, game.user);
  const gm = activeGM();
  if (!gm || !actor.isOwner) return;
  await ChatMessage.implementation.create({ content: spText("Application"), whisper: [gm.id, game.user.id],
    flags: { ak5e: { spRequest: { id: observation.id, actorUuid: actor.uuid, command: "application", data: observation } } } });
}

export async function processOperatorApplication(target, observation, user = game.user) {
  if (!operates()) return;
  owned(target, user);
  if (!observation?.id || !Number.isFinite(observation.amount)
    || ![observation.before?.value, observation.before?.temp, observation.after?.value, observation.after?.temp].every(Number.isFinite)) throw new Error("Invalid HP application receipt.");
  const message = observation.messageUuid ? await fromUuid(observation.messageUuid) : null;
  if (observation.messageUuid && message?.documentName !== "ChatMessage") throw new Error("Invalid originating damage message.");
  const source = messageActor(message);
  const attackMessage = originatingAttack(message);
  const activity = message?.flags?.dnd5e?.activity;
  const attack = attackMessage ? true : activity ? activity.type === "attack" : null;
  const hpLoss = Math.max(0, observation.before.value - observation.after.value) + Math.max(0, observation.before.temp - observation.after.temp);
  const hpGain = Math.max(0, observation.after.value - observation.before.value);
  const tempGain = Math.max(0, observation.after.temp - observation.before.temp);
  const skillOrigin = messageSkillOrigin(message);
  const common = { id: observation.id, originMessage: observation.messageUuid, targetUuid: target.uuid, sourceUuid: source?.uuid,
    skillOrigin, attack, attackId: attackMessage?.uuid, hostile: operatorHostility(source, target), label: message?.flavor ?? target.name };
  if (observation.amount > 0) {
    if (source) await processOperatorEvent(source, { ...common, type: "offensiveDamage", positive: hpLoss > 0,
      ownTurn: observation.context?.ownTurn === true, activeAtEvent: observation.activeSource });
    // Attack damage never substitutes for the attack trigger; redirects can be confirmed separately.
    await processOperatorEvent(target, { ...common, type: "defensiveDamage", positive: hpLoss > 0, activeAtEvent: observation.activeTarget });
  }
  if (source && observation.amount < 0) await processOperatorEvent(source, { ...common, type: "offensiveHealing", positive: hpGain > 0,
    ownTurn: observation.context?.ownTurn === true, self: source.uuid === target.uuid, activeAtEvent: observation.activeSource });
  if (source && tempGain > 0) await processOperatorEvent(source, { ...common, type: "offensiveTemp", positive: true,
    art: message.flags?.dnd5e?.item?.type === "spell", ownTurn: observation.context?.ownTurn === true,
    self: source.uuid === target.uuid, activeAtEvent: observation.activeSource });
  return { result: true };
}

export async function advanceOperatorCombat(combat, changed) {
  if (!operates() || !("round" in changed || "turn" in changed) || !combat.started || combat.turn == null) return;
  const previous = combat.previous;
  if (previous && (combat.round < previous.round || combat.round === previous.round && combat.turn <= previous.turn)) return;
  // Expiration is evaluated for all Actors first, including reaction Skills started on another turn.
  await expireOperatorSkills();
  const actor = combat.combatant?.actor;
  if (!actor || !isOperatorActor(actor)) return;
  await processOperatorEvent(actor, { type: "automatic", id: `${combat.uuid}:${combat.round}:${combat.combatant.id}`, ownTurn: true });
}

export async function expireOperatorSkills() {
  if (!operates()) return;
  for (const actor of operatorActors()) {
    if (isOperatorActor(actor) && skillExpired(getIntegratedOperatorState(actor).active, operatorContext(actor))) {
      await executeOperatorCommand(actor, { id: newId(), command: "sync" });
    }
  }
}

export function registerOperatorSkillHooks() {
  if (installed) return;
  installed = true;
  Hooks.on("preCreateChatMessage", markOperatorOrigin);
  Hooks.on("createChatMessage", (message, options, userId) => {
    safely(handleOperatorRequest(message, options, userId));
    safely(observeOperatorAttack(message));
  });
  Hooks.on("dnd5e.preApplyDamage", captureOperatorDamage);
  Hooks.on("dnd5e.applyDamage", (actor, amount, options) => { safely(observeOperatorDamage(actor, amount, options)); });
  Hooks.on("updateCombat", (combat, changed) => { safely(advanceOperatorCombat(combat, changed)); });
  Hooks.on("updateWorldTime", () => { safely(expireOperatorSkills()); });
  Hooks.on("deleteCombat", () => { safely(expireOperatorSkills()); });
  Hooks.on("dnd5e.restCompleted", (actor, result, config = {}) => {
    if (config.type !== "long" || !actor.isOwner || !isOperatorActor(actor)) return;
    // Native rest cards survive reload; chatless rests retain one ID for repeated notifications.
    let id = result?.message?.uuid ? `longRest:${actor.uuid}:${result.message.uuid}` : restRequests.get(result);
    if (!id) { id = newId(); if (result && typeof result === "object") restRequests.set(result, id); }
    safely(recoverOperatorSkills(actor, { id }));
  });
  Hooks.on("dnd5e.preUseActivity", activity => {
    if (!flag(activity.item, "operatorSkill") || !isOperatorActor(activity.actor)) return;
    safely(activateIntegratedSkill(activity.actor, activity.item.id).then(() => activity.item.sheet?.render(true)));
    return false;
  });
  for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, item => {
    if (operates() && isOperatorActor(item.parent) && flag(item, "operatorSkill")) safely(executeOperatorCommand(item.parent, { id: newId(), command: "sync" }));
  });
  registerOperatorSheetHooks();
  safely(expireOperatorSkills());
}
