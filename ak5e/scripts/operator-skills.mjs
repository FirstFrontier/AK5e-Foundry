import { keyedSerial } from "./operation-kernel.mjs";
import { learnedSkills, operatorState, skillDefinition, spInteger, eventIdentity, chargeOperatorState,
  activateSkillState, recoverOperatorState, skillExpired } from "./operator-rules.mjs";
import { registerOperatorSheetHooks, openOperatorSkills, openOperatorSkillChoices } from "./operator-sheet.mjs";
import { getOperatorSkillChoices, progressionWithChoices } from "./operator-progression.mjs";
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { skillTargetProfile, validateSkillPrerequisites } from "./operator-target-profiles.mjs";
import { profileForSkill, nativePhaseActivities, prepareSkillActivation, prepareSkillPhase, validateSkillResolution, resolutionReceipt,
  skillTemplateData, publicResolution, displaySkillResolution, rollSkillPhase, populateSkillTargets, advanceSkillArea, syncSkillTemplates } from "./operator-targeting.mjs";
export { openOperatorSkills, openOperatorSkillChoices, getOperatorSkillChoices };

const list = collection => Array.from(collection?.values?.() ?? collection ?? []);
const flag = (document, key) => document?.getFlag?.("ak5e", key) ?? document?.flags?.ak5e?.[key];
const isSkillTemplate = (template, activationId, skillUuid) => flag(template, "skillActivation") === activationId && flag(template, "skillOrigin")?.skillUuid === skillUuid;
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
    system: { ...structuredClone(entry.systemData), activities: { ...structuredClone(entry.systemData.activities), ...nativePhaseActivities(skillTargetProfile(entry)) }, description: { value: entry.content, chat: "" } },
    flags: { ak5e: { operatorSkill: structuredClone(entry.operatorSkill), chapterThreeId: entry.id, classContentKind: "operator-skill",
      parentClass: entry.parentClass, parentBranch: entry.parentBranch, classLevel: entry.level,
      operatorTargetProfile: skillTargetProfile(entry), sourceHeading: entry.sourceHeading, sourceFile: "03_chapter_3_character_classes.txt", rawSource: entry.rawSource }, dnd5e: { sourceBook: "AK5E" } } };
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

const serial = keyedSerial();

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
    if (previous) return { state, result: ["activate", "resolvePhase"].includes(request.command) && previous.result?.activationId
      ? { ...previous.result, replayed: true } : previous.result };
    const data = request.data ?? {};
    const context = operatorContext(actor);
    if (skillExpired(state.active, context)) state = queueEndingPhase(actor, state);
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
        validateSkillPrerequisites(actor, skill);
        const item = actor.items.get(skill.itemId);
        const resolution = await validateSkillResolution(actor, item, data, user);
        // Validate SP before creating any persistent geometry.
        const activated = activateSkillState(state, skill, { ...context, id: request.id });
        if (resolution) {
          const receipts = state.resolutions ?? [];
          const receipt = resolutionReceipt(resolution, data, request.id, item, user);
          const privateSelection = await ChatMessage.implementation.create({ content: "Operator Skill activation receipt", whisper: list(game.users).filter(user => user.isGM).map(user => user.id),
            flags: { ak5e: { privateSkillSelection: { activationId: request.id, selectedTargetUuids: data.targetTokenUuids ?? [], narrativeTokenUuids: data.narrativeTokenUuids ?? [] } } } });
          receipt.privateMessageUuid = privateSelection.uuid;
          // A prepared receipt survives a disconnect between template creation and the SP commit.
          await save(actor, { ...state, resolutions: [...receipts.filter(old => old.activationId !== request.id), receipt] });
          const scene = resolution.scene;
          const templateData = scene ? skillTemplateData(resolution, request.id, user.id) : [];
          const existing = scene ? list(scene.templates).filter(template => isSkillTemplate(template, request.id, item.uuid)) : [];
          let created = existing;
          try {
            if (scene && !existing.length && templateData.length) created = await scene.createEmbeddedDocuments("MeasuredTemplate", templateData) ?? [];
            if (created.length !== templateData.length) throw new Error("The complete Skill area could not be created; no SP was spent.");
            receipt.templateIds = created.map(template => template.id); receipt.status = "committed";
            state = { ...activated, resolutions: [...receipts.filter(old => old.activationId !== request.id), receipt] };
            result = publicResolution(resolution, data, request.id, user);
          } catch (error) {
            const provisional = scene ? list(scene.templates).filter(template => isSkillTemplate(template, request.id, item.uuid)) : [];
            if (provisional.length) await scene.deleteEmbeddedDocuments("MeasuredTemplate", provisional.map(template => template.id));
            throw error;
          }
        } else state = activated;
        break;
      }
      case "activateManual": {
        if (!user.isGM) throw new Error(spText("GMAdjustment"));
        if (!String(data.id ?? "").trim()) throw new Error(spText("SkillRequired"));
        state = activateSkillState(state, { ...data, name: data.name ?? data.id, duration: data.duration ?? "Manual" }, { ...context, id: request.id });
        break;
      }
      case "end": state = queueEndingPhase(actor, state); break;
      case "resolvePhase": {
        if (!state.enabled) throw new Error(spText("EnableFirst"));
        const receipt = state.resolutions?.find(receipt => receipt.activationId === data.activationId && receipt.status === "committed");
        if (!receipt) throw new Error("No committed activation exists for this phase.");
        const item = actor.items.get(receipt.itemId);
        if (!item) throw new Error(spText("SkillRequired"));
        let resolution = await validateSkillResolution(actor, item, data, user, data.phaseId, receipt);
        if (!resolution) throw new Error("This Skill requires manual resolution.");
        const phase = resolution.phase;
        if (receipt.ended && phase.when !== "ending") throw new Error("This Skill's duration has ended. Use its original chat card for any retrospective manual roll.");
        if (phase.when === "optional" && profileForSkill(item)?.sourceEffect && flag(item, "operatorSkill")?.duration !== "Instant"
          && state.active?.activationId !== receipt.activationId && !phase.allowedArea) throw new Error("This Skill's active duration has ended.");
        if (["triggered", "target-start", "target-end", "source-start", "source-end"].includes(phase.when)
          && flag(item, "operatorSkill")?.duration !== "Instant" && !phase.persist && state.active?.activationId !== receipt.activationId) throw new Error("This Skill's active duration has ended.");
        const prompt = (state.phasePrompts ?? []).find(prompt => prompt.key === data.eventKey && prompt.activationId === data.activationId && prompt.phaseId === data.phaseId);
        if (!["activation", "optional"].includes(phase.when) && !prompt && data.manualConfirmation !== true) throw new Error("Resolve this phase from its event prompt or explicitly confirm its trigger.");
        if (data.manualConfirmation && !user.isGM) throw new Error("Only a GM can confirm an unobserved mandatory trigger.");
        if (prompt?.tokenUuid && !phase.areaMovement) resolution.targets = resolution.targets.filter(token => token.uuid === prompt.tokenUuid);
        if (phase.ownTurn && context.combat?.started && !context.ownTurn) throw new Error("This phase can only be used on your own Turn.");
        const phaseKey = phase.oncePerTurn && phase.when === "optional" && context.combat?.started
          ? `${receipt.activationId}:${phase.id}:${context.combat.uuid}:${context.combat.round}:${context.combat.turn}` : prompt?.key ?? request.id;
        if (receipt.phases[phaseKey]) { result = { ...receipt.phases[phaseKey], replayed: true }; break; }
        if (phase.areaMovement) resolution = advanceSkillArea(resolution, receipt);
        result = publicResolution(resolution, data, receipt.activationId, user);
        state = { ...state, phasePrompts: (state.phasePrompts ?? []).filter(candidate => candidate.key !== prompt?.key),
          resolutions: state.resolutions.map(candidate => candidate.activationId === receipt.activationId
            ? { ...candidate, ...(phase.areaMovement || phase.when === "optional" && phase.mode === "area" && data.shapes ? { shapes: resolution.shapes } : {}), phases: { ...candidate.phases, [phaseKey]: result } } : candidate) };
        break;
      }
      case "adjustSkillCounter": {
        if (!user.isGM) throw new Error(spText("GMAdjustment"));
        const receipt = state.resolutions?.find(receipt => receipt.activationId === data.activationId);
        if (!receipt || profileForSkill(actor.items.get(receipt.itemId))?.sourceName !== "Blood Boil") throw new Error("Choose a recorded Blood Boil activation.");
        if (!String(data.reason ?? "").trim() || !Number.isSafeInteger(data.amount)) throw new Error("Provide a whole-number counter correction and its source reason.");
        const value = receipt.bloodBoilDamage + data.amount;
        if (value < 0) throw new Error("Tracked damage cannot be negative.");
        state = { ...state, resolutions: state.resolutions.map(candidate => candidate.activationId === receipt.activationId
          ? { ...candidate, bloodBoilDamage: value, counterAdjustment: { amount: data.amount, reason: data.reason } } : candidate) };
        result = value; break;
      }
      case "extend": {
        const rounds = spInteger(data.rounds ?? 1, "Additional rounds", 1);
        if (state.active?.expiry?.kind !== "rounds") throw new Error(spText("TimedRequired"));
        if (!String(data.reason ?? "").trim()) throw new Error(spText("ReasonRequired"));
        const effect = flag(actor.items.get(state.active.itemId), "operatorSkill")?.effect ?? "";
        const maximum = Number(effect.match(/up to a maximum of (\d+) Rounds/i)?.[1]);
        if (maximum && state.active.expiry.rounds + rounds > maximum) throw new Error(`The source limits this Skill to ${maximum} Rounds.`);
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
      case "resolveStandardGain": {
        if (!user.isGM) throw new Error(spText("GMAdjustment"));
        const pending = state.standardPendingGains?.[data.eventId];
        if (!pending) throw new Error("Choose a recorded pending Last Stand SP gain.");
        if (!data.redirected && state.active) throw new Error(spText("ActiveNoGain"));
        const gains = { ...state.standardPendingGains }; delete gains[data.eventId];
        state = { ...state, standardPendingGains: gains,
          points: data.redirected ? state.points : Math.min(state.maximum, state.points + pending.amount) };
        result = { amount: pending.amount, redirected: data.redirected === true }; break;
      }
      case "recover": {
        if (skillExpired(state.active, { ...context, longRest: true })) state = queueEndingPhase(actor, state);
        state = recoverOperatorState(state, context); break;
      }
      case "completeResolution": {
        const receipt = state.resolutions?.find(receipt => receipt.activationId === data.activationId);
        if (!receipt) throw new Error("Unknown activation.");
        if (state.active?.activationId === receipt.activationId) throw new Error("End the active Skill before finishing retained effects.");
        if ((state.phasePrompts ?? []).some(prompt => prompt.activationId === receipt.activationId && prompt.phaseId === "ending")) throw new Error("Resolve the mandatory ending phase before finishing this Skill.");
        if (!data.confirmation) throw new Error("Confirm that the source's retained effect has ended.");
        const scene = game.scenes.get(receipt.sceneId);
        const templates = scene ? list(scene.templates).filter(template => isSkillTemplate(template, receipt.activationId, receipt.skillUuid)) : [];
        if (templates.length) await scene.deleteEmbeddedDocuments("MeasuredTemplate", templates.map(template => template.id));
        state = { ...state, resolutions: state.resolutions.map(candidate => candidate.activationId === receipt.activationId ? { ...candidate, status: "completed" } : candidate),
          phasePrompts: (state.phasePrompts ?? []).filter(prompt => prompt.activationId !== receipt.activationId) };
        break;
      }
      case "configureSkill": {
        if (!user.isGM) throw new Error(spText("GMAdjustment"));
        const item = actor.items.get(data.itemId);
        if (item?.type !== "feat") throw new Error(spText("SkillRequired"));
        const definition = skillDefinition({ ...flag(item, "operatorSkill"), ...data.options });
        if (!String(definition.source ?? item.getFlag?.("ak5e", "sourceHeading") ?? "").trim()) throw new Error(spText("ReasonRequired"));
        const update = { _id: item.id, "flags.ak5e.operatorSkill": definition };
        if (data.options?.activation && item.system?.activities?.get?.("ak5eSkillUse0001")?.type === "utility") {
          update["system.activities.ak5eSkillUse0001.activation.type"] = { Action: "action", "Bonus Action": "bonus", Reaction: "reaction", "No Action Required": "" }[definition.activation];
        }
        await actor.updateEmbeddedDocuments("Item", [update]);
        state = operatorState(state, actorOperatorSkills(actor));
        break;
      }
      case "origin": {
        const skill = actorOperatorSkills(actor).find(skill => skill.itemId === data.itemId);
        if (!skill) throw new Error(spText("SkillRequired"));
        const receipt = state.resolutions?.filter(receipt => receipt.itemId === skill.itemId && receipt.status === "committed"
          && (!data.activationId || receipt.activationId === data.activationId)).at(-1);
        if (data.activationId && !receipt) throw new Error("Unknown activation for this Skill action.");
        state = { ...state, pendingOrigin: { id: request.id, skillUuid: skill.uuid, name: skill.name, activationId: receipt?.activationId ?? state.lastSkill?.activationId, phaseId: data.phaseId ?? "manual" } };
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
    let committed;
    try { committed = await save(actor, state); }
    catch (error) {
      if (request.command === "activate") {
        const receipt = state.resolutions?.find(receipt => receipt.activationId === request.id);
        const scene = game.scenes?.get?.(receipt?.sceneId);
        if (scene && receipt?.templateIds?.length) await scene.deleteEmbeddedDocuments("MeasuredTemplate", receipt.templateIds);
      }
      throw error;
    }
    await cleanupEndedSkillTemplates(actor, committed);
    if (request.command === "activate") {
      const item = actor.items.get(data.itemId);
      // Source feedback follows the commit; a chat failure does not undo a successful activation.
      try { await item.displayCard?.({ flags: { ak5e: { skillOrigin: { skillUuid: item.uuid, activationId: request.id }, spActivation: request.id } } }); }
      catch (error) { console.error("AK5e | Activated Skill source card could not be displayed", error); }
    }
    if (["activate", "resolvePhase"].includes(request.command) && result?.activationId && !result.replayed) {
      try {
        const receipt = committed.resolutions.find(receipt => receipt.activationId === result.activationId);
        const resolution = await validateSkillResolution(actor, actor.items.get(receipt.itemId), data, user, result.phaseId, request.command === "activate" ? null : receipt);
        await syncSkillTemplates(receipt, resolution);
        await displaySkillResolution(actor, receipt, resolution);
      } catch (error) { console.error("AK5e | Resolution feedback failed after commit", error); }
    }
    return { state: committed, result };
  });
}

/** Receipts are committed in the same Actor update as the resulting SP. */
export async function processOperatorEvent(actor, event) {
  if (!operates() || !isOperatorActor(actor)) return;
  return serial(actor, async () => {
    let state = getIntegratedOperatorState(actor);
    if (skillExpired(state.active, operatorContext(actor))) state = queueEndingPhase(actor, state);
    const charged = chargeOperatorState(state, event);
    const stand = flag(actor, "standardBearer")?.lastStand;
    // Only a currently active, explicitly enabled Standard Bearer helper may
    // defer a legal charge. The event receipt and pending choice commit together.
    if (stand && stand.expiresAt > Number(game.time.worldTime) && ["charged", "capped"].includes(charged.reason)) {
      const method = event.type.startsWith("offensive") ? "offensive" : event.type.startsWith("defensive") ? "defensive" : "automatic";
      const amount = state.rates[method];
      if (amount > 0) {
        const receipt = charged.state.receipts.at(-1);
        const deferred = { ...charged.state, points: state.points,
          standardPendingGains: { ...state.standardPendingGains, [event.id]: { amount, source: event.type, reason: "Last Stand pending choice" } },
          receipts: charged.state.receipts.map(r => r === receipt ? { ...r, after: state.points, gained: 0, reason: "standardPending" } : r) };
        await save(actor, deferred);
        return { state: deferred, gained: 0, reason: "standardPending" };
      }
    }
    if (charged.reason === "confirmation") {
      if (!state.pendingEvents.some(candidate => candidate.id === event.id)) await save(actor, { ...state, pendingEvents: [...state.pendingEvents, event] });
    } else if (charged.state !== state || flag(actor, "operatorSkills")?.active && !state.active) {
      const committed = await save(actor, charged.state); await cleanupEndedSkillTemplates(actor, committed);
    }
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
/** GM-run grant used by class features that award Skill Points (Dreadnought's Advance). The ID makes it idempotent;
 * the SP engine's maximum and no-gain-while-a-Skill-is-active limits still apply. */
export async function grantOperatorSP(actor, { amount, id, reason, exception = false }) {
  if (!isOperatorActor(actor)) throw new Error("Operator Skill SP integration is not enabled for this Actor.");
  if (!id || typeof id !== "string") throw new Error("An SP grant requires a stable ID.");
  return executeOperatorCommand(actor, { id: `feature-${id}`, command: "adjust", data: { amount, reason, exception } });
}
export async function adjustOperatorSP(actor, amount, options = {}) { await submitOperatorCommand(actor, "adjust", { amount, ...options }); return getIntegratedOperatorState(actor); }
export async function adjustOperatorSkillCounter(actor, options = {}) { return submitOperatorCommand(actor, "adjustSkillCounter", options, options.id); }
export async function activateIntegratedSkill(actor, itemId, options = {}) {
  if (!isOperatorActor(actor)) throw new Error(spText("EnableFirst"));
  const item = actor.items.get(itemId);
  if (!item) throw new Error(spText("SkillRequired"));
  const data = await prepareSkillActivation(actor, item, options);
  if (!data) return false;
  const result = await submitOperatorCommand(actor, "activate", data, options.activationId);
  if (result?.targetTokenUuids) {
    if (["targets", "area", "target-area", "paired-area"].includes(profileForSkill(item)?.phases[0].mode)) {
      populateSkillTargets((await Promise.all(result.targetTokenUuids.map(uuid => fromUuid(uuid)))).filter(Boolean));
    }
    const receipt = getIntegratedOperatorState(actor).resolutions?.find(receipt => receipt.activationId === result.activationId);
    if (receipt && options.roll !== false && !result.replayed) await offerSkillPhaseRoll(actor, receipt, "activation", result.targetTokenUuids);
  }
  return result;
}
export async function resolveOperatorSkillPhase(actor, options = {}) {
  const receipt = getIntegratedOperatorState(actor).resolutions?.find(receipt => receipt.activationId === options.activationId);
  const phase = receipt && profileForSkill(actor.items.get(receipt.itemId))?.phases.find(phase => phase.id === options.phaseId);
  if (receipt && phase) {
    options = await prepareSkillPhase(actor, actor.items.get(receipt.itemId), receipt, options);
    if (!options) return false;
  }
  const data = { ...options, confirmation: true,
    ...((phase?.when === "optional" || phase?.repeatable) && phase.mode === "targets" && !options.targetTokenUuids ? { targetTokenUuids: list(game.user.targets).map(token => token.document.uuid) } : {}),
    visibleTokenUuids: list(globalThis.canvas?.tokens?.placeables).filter(token => token.visible).map(token => token.document.uuid) };
  const result = await submitOperatorCommand(actor, "resolvePhase", data, options.id);
  if (["targets", "area", "target-area", "paired-area"].includes(phase?.mode)) {
    populateSkillTargets((await Promise.all(result.targetTokenUuids.map(uuid => fromUuid(uuid)))).filter(Boolean));
  }
  if (options.phaseId === "manual") await submitOperatorCommand(actor, "origin", { itemId: receipt.itemId, activationId: receipt.activationId, phaseId: options.phaseId });
  if (receipt && options.roll !== false && !result.replayed) await offerSkillPhaseRoll(actor, receipt, options.phaseId, result.targetTokenUuids, options);
  return result;
}
async function offerSkillPhaseRoll(actor, receipt, phaseId, targets, options = {}) {
  const phase = profileForSkill(actor.items.get(receipt.itemId))?.phases.find(phase => phase.id === phaseId);
  if (!phase || phaseId === "activation" && phase.when !== "activation") return;
  if (phaseId === "activation" && phase.noInitialRoll) return;
  if (phaseId === "activation" && profileForSkill(actor.items.get(receipt.itemId))?.status === "manual") return;
  if (!phase.save && !phase.damage && !phase.healing && !phase.weapon) return;
  await foundry.applications.api.DialogV2.wait({ window: { title: "Resolve Operator Skill" }, rejectClose: false,
    content: `<p>Native rolls are optional. Confirm damage, healing, effects, narrative restrictions, and conditional formulas against the source.</p>
      <label>Save DC <select name="dcType"><option value="martial">Martial</option><option value="spell">Spell</option></select></label>
      <label>Martial ability <select name="ability"><option value="str">Strength</option><option value="dex">Dexterity</option></select></label>
      ${phase.weapon ? `<label>Source-legal weapon <select name="weapon">${list(actor.items).filter(item => item.type === "weapon").map(item => `<option value="${item.id}">${foundry.utils.escapeHTML(item.name)}</option>`).join("")}</select></label>` : ""}
      ${game.user.isGM && phase.dc === "manual" ? '<label>GM-established DC <input name="dc" type="number" min="1"></label>' : ""}`,
    buttons: [{ action: "roll", label: "Roll", callback: (_event, button) => rollSkillPhase(actor, receipt, phaseId, targets,
      { ...options, dcType: button.form.elements.dcType.value, martialAbility: button.form.elements.ability.value,
        weaponItemId: button.form.elements.weapon?.value,
        dc: button.form.elements.dc?.value ? Number(button.form.elements.dc.value) : undefined }) }, { action: "later", label: "Resolve later", callback: () => false }] });
}
function queueEndingPhase(actor, state) {
  const active = state.active;
  if (!active) return state;
  const receipt = state.resolutions?.find(receipt => receipt.activationId === active.activationId);
  const profile = receipt && profileForSkill(actor.items.get(receipt.itemId));
  const prompts = [...(state.phasePrompts ?? [])];
  for (const phase of profile?.phases.filter(phase => phase.when === "ending" && phase.id !== "activation") ?? []) {
    const key = `${receipt.activationId}:${phase.id}:ending`;
    if (!prompts.some(prompt => prompt.key === key) && !receipt.phases[key]) prompts.push({ key, activationId: receipt.activationId, phaseId: phase.id });
  }
  return { ...state, active: null, phasePrompts: prompts, resolutions: (state.resolutions ?? []).map(candidate => candidate.activationId === active.activationId ? { ...candidate, ended: true } : candidate) };
}
async function cleanupEndedSkillTemplates(actor, state) {
  if (!operates()) return;
  for (const receipt of state.resolutions ?? []) {
    if (!receipt.ended) continue;
    const ending = profileForSkill(actor.items.get(receipt.itemId))?.phases.filter(phase => phase.when === "ending" && phase.id !== "activation") ?? [];
    if (ending.some(phase => !Object.values(receipt.phases).some(result => result.phaseId === phase.id))) continue;
    const scene = game.scenes?.get(receipt.sceneId);
    const templates = scene ? list(scene.templates).filter(template => isSkillTemplate(template, receipt.activationId, receipt.skillUuid)) : [];
    if (templates.length) {
      try { await scene.deleteEmbeddedDocuments("MeasuredTemplate", templates.map(template => template.id)); }
      catch (error) { console.warn("AK5e | Ended Skill template cleanup will retry on reload", error); }
    }
  }
}
export async function endIntegratedSkill(actor) { await submitOperatorCommand(actor, "end"); return getIntegratedOperatorState(actor); }
export function getOperatorSkillProvenance(actor, activationId, phaseId = "manual") {
  owned(actor);
  const receipt = getIntegratedOperatorState(actor).resolutions?.find(receipt => receipt.activationId === activationId);
  if (!receipt || !String(phaseId).trim()) throw new Error("Choose a recorded Skill activation and phase.");
  return { skillUuid: receipt.skillUuid, activationId, phaseId };
}

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
  const hpGain = Math.max(0, observation.after.value - observation.before.value);
  const tempGain = Math.max(0, observation.after.temp - observation.before.temp);
  const skillOrigin = messageSkillOrigin(message);
  if (skillOrigin?.activationId) await serial(target, async () => {
    const applications = flag(target, "skillApplications") ?? [];
    if (applications.some(application => application.id === observation.id)) return;
    if (!operates()) throw new Error(spText("GMRequired"));
    await target.update({ "flags.ak5e.skillApplications": [...applications, { id: observation.id, messageUuid: observation.messageUuid,
      skillOrigin, amount: observation.amount, before: observation.before, after: observation.after }] });
  });
  const common = { id: observation.id, originMessage: observation.messageUuid, targetUuid: target.uuid, sourceUuid: source?.uuid,
    skillOrigin, attack, attackId: attackMessage?.uuid, hostile: operatorHostility(source, target), label: message?.flavor ?? target.name };
  if (observation.amount > 0) {
    if (observation.activeTarget) await serial(target, async () => {
      const state = getIntegratedOperatorState(target), activationId = state.active?.activationId;
      const receipt = state.resolutions?.find(receipt => receipt.activationId === activationId);
      if (!receipt || profileForSkill(target.items.get(receipt.itemId))?.sourceName !== "Blood Boil" || receipt.damageReceipts?.includes(observation.id)) return;
      await save(target, { ...state, resolutions: state.resolutions.map(candidate => candidate === receipt
        ? { ...candidate, bloodBoilDamage: candidate.bloodBoilDamage + observation.amount, damageReceipts: [...(candidate.damageReceipts ?? []), observation.id] } : candidate) });
    });
    if (source) await processOperatorEvent(source, { ...common, type: "offensiveDamage", positive: observation.amount > 0,
      ownTurn: observation.context?.ownTurn === true, activeAtEvent: observation.activeSource });
    // Attack damage never substitutes for the attack trigger; redirects can be confirmed separately.
    await processOperatorEvent(target, { ...common, type: "defensiveDamage", positive: observation.amount > 0, activeAtEvent: observation.activeTarget });
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
  await promptOperatorPhases(combat);
  const actor = combat.combatant?.actor;
  if (!actor || !isOperatorActor(actor)) return;
  await processOperatorEvent(actor, { type: "automatic", id: `${combat.uuid}:${combat.round}:${combat.combatant.id}`, ownTurn: true });
}

/** Mandatory events create persistent, deduplicated review prompts; they never apply damage. */
export async function promptOperatorPhases(combat, movedToken = null, movementId = null) {
  if (!operates()) return;
  for (const actor of operatorActors().filter(isOperatorActor)) await serial(actor, async () => {
    let state = { ...getIntegratedOperatorState(actor), resolutions: structuredClone(getIntegratedOperatorState(actor).resolutions ?? []) };
    const prompts = [...(state.phasePrompts ?? [])];
    let changed = false;
    for (const receipt of state.resolutions ?? []) {
      if (receipt.status !== "committed") continue;
      const item = actor.items.get(receipt.itemId), profile = profileForSkill(item);
      if (!profile) continue;
      if (movedToken && state.active?.activationId === receipt.activationId && profile.phases[0].moving && receipt.sceneId === movedToken.parent.id) {
        const resolution = await validateSkillResolution(actor, item, { confirmation: true }, game.user, "activation", receipt);
        await syncSkillTemplates(receipt, resolution);
      }
      for (const phase of profile.phases) {
        if (["triggered", "target-start", "target-end", "source-start", "source-end"].includes(phase.when)
          && flag(item, "operatorSkill")?.duration !== "Instant" && !phase.persist && state.active?.activationId !== receipt.activationId) continue;
        const previous = combat?.previous;
        const ended = combat?.turns?.find(combatant => combatant.id === previous?.combatantId) ?? combat?.turns?.[previous?.turn];
        const isSource = !movedToken && combat?.combatant?.actor?.uuid === actor.uuid;
        const delayed = (phase.when === "source-start" || phase.events?.includes("source-start")) && isSource && (combat.round !== receipt.startRound || combat.turn !== receipt.startTurn);
        const targetStart = !movedToken && (phase.when === "target-start" || phase.events?.includes("target-start"));
        const targetEnd = !movedToken && (phase.when === "target-end" || phase.events?.includes("target-end")) && ended?.token;
        const sourceEnd = !movedToken && phase.when === "source-end" && ended?.actor?.uuid === actor.uuid;
        const entry = movedToken && phase.events?.some(event => ["entry", "movement"].includes(event));
        if (!delayed && !(targetStart && combat?.combatant?.token) && !entry && !targetEnd && !sourceEnd) continue;
        if (phase.when === "triggered" && state.active?.activationId !== receipt.activationId && !phase.persist) continue;
        if (sourceEnd && state.active?.activationId !== receipt.activationId) continue;
        const resolution = await validateSkillResolution(actor, item, { confirmation: true }, game.user, phase.id, receipt);
        if (!resolution) continue;
        const token = movedToken ?? (targetEnd || sourceEnd ? ended.token : combat?.combatant?.token);
        if (entry && phase.entryOwnTurn && combat?.combatant?.token?.uuid !== movedToken.uuid) continue;
        if (entry && phase.moving && movedToken.uuid === receipt.sourceTokenUuid) {
          for (const entered of resolution.targets.filter(token => !(receipt.insideTokenUuids ?? receipt.targetTokenUuids).includes(token.uuid))) {
            if (entered.hidden) continue;
            const key = `${receipt.activationId}:${phase.id}:aura:${entered.uuid}:${movementId ?? `${game.time.worldTime}:${movedToken.x}:${movedToken.y}`}`;
            if (!prompts.some(prompt => prompt.key === key) && !receipt.phases[key]) {
              prompts.push({ key, activationId: receipt.activationId, phaseId: phase.id, tokenUuid: entered.uuid,
                review: "The area moved across this creature; confirm that the source's entry trigger applies." }); changed = true;
            }
          }
        }
        if (!delayed && !sourceEnd && !resolution.targets.some(target => target.uuid === token?.uuid)) continue;
        // Entry means outside -> inside, rather than every update within an area.
        const inside = receipt.insideTokenUuids ?? receipt.targetTokenUuids;
        if (entry && !phase.events?.includes("movement") && inside.includes(token.uuid)) continue;
        const turn = combat?.started ? `${combat.id}:${targetEnd || sourceEnd ? previous.round : combat.round}:${targetEnd || sourceEnd ? previous.turn : combat.turn}` : `time:${game.time.worldTime}`;
        const eventTime = entry && !phase.oncePerTurn ? `entry:${movementId ?? `${token.x}:${token.y}:${token._stats?.modifiedTime ?? game.time.worldTime}`}` : turn;
        const key = `${receipt.activationId}:${phase.id}:${delayed && !phase.repeatable && !phase.events?.includes("source-start") ? "delayed" : `${token.uuid}:${eventTime}`}`;
        if (!delayed && token.hidden) {
          if (!list(game.messages).some(message => flag(message, "privatePhasePrompt") === key)) {
            await ChatMessage.implementation.create({ content: `Hidden token phase requires GM review: ${item.name} (${phase.id}).`,
              whisper: list(game.users).filter(user => user.isGM).map(user => user.id), flags: { ak5e: { privatePhasePrompt: key,
                skillResolution: { actorUuid: actor.uuid, activationId: receipt.activationId, phaseId: phase.id, targetTokenUuids: [token.uuid] } } } });
          }
          continue;
        }
        if (!prompts.some(prompt => prompt.key === key) && !receipt.phases[key]) {
          prompts.push({ key, activationId: receipt.activationId, phaseId: phase.id, ...(!delayed ? { tokenUuid: token.uuid } : {}) }); changed = true;
        }
      }
      if (movedToken && receipt.sceneId === movedToken.parent.id) {
        const phase = profile.phases.find(phase => phase.events?.some(event => ["entry", "movement"].includes(event)));
        if (phase) {
          const resolution = await validateSkillResolution(actor, item, { confirmation: true }, game.user, phase.id, receipt);
          const inside = resolution.targets.filter(token => !token.hidden).map(token => token.uuid);
          if (JSON.stringify(inside) !== JSON.stringify(receipt.insideTokenUuids ?? receipt.targetTokenUuids)) {
            receipt.insideTokenUuids = inside; changed = true;
          }
        }
      }
    }
    if (changed) await save(actor, { ...state, phasePrompts: prompts });
  });
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
  Hooks.on("preUpdateToken", (_token, changed, options) => { if (["x", "y"].some(key => key in changed)) options.ak5eOperatorMovementId ??= newId(); });
  Hooks.on("updateToken", (token, changed, options) => { if (["x", "y"].some(key => key in changed)) safely(promptOperatorPhases(game.combat, token, options.ak5eOperatorMovementId)); });
  Hooks.on("preCreateActiveEffect", (effect, data, options) => {
    const origin = messageSkillOrigin(options?.originatingMessage);
    if (origin) effect.updateSource({ "flags.ak5e.skillOrigin": origin });
  });
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
    if (activity.id?.startsWith("ak5ePhase")) {
      const receipt = getIntegratedOperatorState(activity.actor).resolutions?.filter(receipt => receipt.itemId === activity.item.id && receipt.status === "committed").at(-1);
      const profile = profileForSkill(activity.item);
      const phase = profile?.phases[Number(activity.id.slice(9))];
      if (receipt && phase) safely(resolveOperatorSkillPhase(activity.actor, { activationId: receipt.activationId, phaseId: phase.id }));
      else ui.notifications.warn("Activate this Skill before resolving a phase.");
      return false;
    }
    safely(activateIntegratedSkill(activity.actor, activity.item.id).then(() => activity.item.sheet?.render(true)));
    return false;
  });
  for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, item => {
    if (operates() && isOperatorActor(item.parent) && flag(item, "operatorSkill")) safely(executeOperatorCommand(item.parent, { id: newId(), command: "sync" }));
  });
  registerOperatorSheetHooks();
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const resolution = flag(message, "skillResolution");
    if (!game.user.isGM || !resolution || html.querySelector(".ak5e-phase-roll")) return;
    const button = document.createElement("button"); button.type = "button"; button.className = "ak5e-phase-roll"; button.textContent = "Native phase rolls (GM)";
    button.addEventListener("click", () => safely((async () => {
      const actor = await fromUuid(resolution.actorUuid), receipt = getIntegratedOperatorState(actor).resolutions?.find(receipt => receipt.activationId === resolution.activationId);
      if (receipt) await offerSkillPhaseRoll(actor, receipt, resolution.phaseId, resolution.targetTokenUuids);
    })())); html.querySelector(".message-content")?.append(button);
  });
  safely(expireOperatorSkills());
  if (operates()) safely((async () => {
    for (const actor of operatorActors().filter(isOperatorActor)) await serial(actor, async () => {
      const state = getIntegratedOperatorState(actor);
      for (const receipt of state.resolutions ?? []) if (receipt.status === "prepared" && !state.operations.some(operation => operation.id === receipt.activationId)) {
        const scene = game.scenes?.get(receipt.sceneId);
        const provisional = scene ? list(scene.templates).filter(template => isSkillTemplate(template, receipt.activationId, receipt.skillUuid)) : [];
        if (provisional.length) await scene.deleteEmbeddedDocuments("MeasuredTemplate", provisional.map(template => template.id));
      }
      await cleanupEndedSkillTemplates(actor, state);
      for (const receipt of state.resolutions ?? []) if (receipt.status === "committed" && !receipt.ended) {
        try {
          const item = actor.items.get(receipt.itemId);
          if (profileForSkill(item)?.phases[0].mode) await syncSkillTemplates(receipt,
            await validateSkillResolution(actor, item, { confirmation: true }, game.user, "activation", receipt));
        } catch (error) { console.warn("AK5e | Retained Skill template requires GM review", receipt.activationId, error.message); }
      }
    });
  })());
}
