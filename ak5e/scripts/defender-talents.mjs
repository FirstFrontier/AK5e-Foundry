/** Source-scoped automation for the five Skill Point and Shelter Defender talents.
 * The other 37 Defender talents remain descriptive/manual. */
import { createOperationKernel, flag, values, need, opaqueKey, esc } from "./operation-kernel.mjs";
import { getIntegratedOperatorState, isOperatorActor, operatorHostility, messageSkillOrigin,
  originatingAttack, grantOperatorSP } from "./operator-skills.mjs";
import { damageCategory } from "./damage-pipeline.mjs";
import { nearFeet, primaryToken } from "./defender-features.mjs";
import { tokenPoint, distanceFeet } from "./standard-bearer-rules.mjs";

const STATE_FLAG = "defenderTalentState";
const REQUEST_FLAG = "defenderTalentRequest";
const RESPONSE_FLAG = "defenderTalentResponse";
const RECEIPT_FLAG = "defenderTalentGrantReceipts";
const talentSource = item => flag(item, "defenderTalent");
const randomId = () => globalThis.foundry?.utils?.randomID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
const gmActive = () => Boolean(game.user?.isGM && game.users?.activeGM?.id === game.user.id);
const isLiveActor = actor => actor?.documentName === "Actor" && !actor.pack && ["character", "npc"].includes(actor.type);
const own = (actor, user) => Boolean(user?.isGM || actor?.testUserPermission?.(user, "OWNER"));
const slug = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const DEFENDER_TALENT_IDS = Object.freeze({
  interlocking: "class-option-defender-talent-basic-interlocking-shields",
  powerPlant: "class-option-defender-talent-basic-power-plant",
  refreshment: "class-option-defender-talent-basic-refreshment",
  swordShield: "class-option-defender-talent-advanced-sword-and-shield",
  tacticalDefence: "class-option-defender-talent-advanced-tactical-defence"
});

const DEFINITIONS = Object.freeze({
  [DEFENDER_TALENT_IDS.interlocking]: { key: "interlocking", name: "Interlocking Shields", tier: "basic" },
  [DEFENDER_TALENT_IDS.powerPlant]: { key: "powerPlant", name: "Power Plant", tier: "basic" },
  [DEFENDER_TALENT_IDS.refreshment]: { key: "refreshment", name: "Refreshment", tier: "basic" },
  [DEFENDER_TALENT_IDS.swordShield]: { key: "swordShield", name: "Sword and Shield", tier: "advanced" },
  [DEFENDER_TALENT_IDS.tacticalDefence]: { key: "tacticalDefence", name: "Tactical Defence", tier: "advanced" }
});

function defenderLevel(actor) {
  const item = values(actor?.items).find(candidate => candidate.type === "class" && flag(candidate, "chapterThreeId") === "class-defender");
  const level = Number(item?.system?.levels);
  return Number.isInteger(level) && level >= 1 && level <= 20 ? level : null;
}
const listTalents = actor => {
  const level = defenderLevel(actor);
  if (level === null) return [];
  return values(actor?.items).map(item => ({ item, state: talentSource(item), definition: DEFINITIONS[talentSource(item)?.sourceId] }))
    .filter(row => row.definition && row.state?.active === true && row.state.tier === row.definition.tier
      && level >= (row.definition.tier === "basic" ? 3 : 9)
      && (row.state.moduleActive !== true || level >= (row.definition.tier === "basic" ? 8 : 13)));
};

function normalizeState(actor) {
  const state = structuredClone(flag(actor, STATE_FLAG) ?? {});
  state.version = 1;
  state.events ??= [];
  state.operations ??= [];
  state.receipts ??= {};
  state.refreshmentTurns ??= {};
  return state;
}
function turnsNow(actor) {
  const combat = values(game.combats).find(c => c.started && c.combatants?.some(x => x.actor?.uuid === actor.uuid));
  if (!combat) return null;
  return `combat:${combat.uuid}:${combat.round}:${combat.turn}`;
}
function actorHasActiveSkill(actor) {
  try { return Boolean(getIntegratedOperatorState(actor).active); }
  catch { return false; }
}
function sourceIsSkillOrigin(message) { return Boolean(messageSkillOrigin(message)); }
function itemForMessage(message) {
  const itemUuid = message?.flags?.dnd5e?.item?.uuid;
  return itemUuid ? globalThis.fromUuidSync?.(itemUuid) ?? null : null;
}
function actorForMessage(message) {
  const activityUuid = message?.flags?.dnd5e?.activity?.uuid;
  const item = itemForMessage(message);
  return (activityUuid && globalThis.fromUuidSync?.(activityUuid)?.actor) || item?.actor || message?.speakerActor ||
    (message?.speaker?.actor ? game.actors?.get(message.speaker.actor) : null) || null;
}
function tokenActor(token) { return token?.actor ?? null; }
function tokenForActor(actor, scene = null) {
  if (actor?.token) return actor.token;
  const tokens = values(scene?.tokens ?? game.scenes?.contents?.flatMap?.(s => values(s.tokens)) ?? []);
  return tokens.find(token => token.actor?.uuid === actor?.uuid && (!scene || token.parent?.id === scene.id)) ?? null;
}
function resolveToken(uuid) {
  const doc = globalThis.fromUuidSync?.(uuid);
  return doc?.documentName === "Token" ? doc : null;
}
function messageTargetTokens(message) {
  const scene = game.scenes?.get(message?.speaker?.scene) ?? globalThis.canvas?.scene;
  return (message?.flags?.dnd5e?.targets ?? []).map(target => {
    const document = globalThis.fromUuidSync?.(target.uuid);
    if (document?.documentName === "Token") return document;
    if (document?.documentName !== "Actor") return null;
    // D&D5e 5.3.3 descriptors use Actor UUIDs. Multiple tokens of that Actor
    // cannot identify a unique position and require guided GM resolution.
    const matches = values(scene?.tokens).filter(token => token.actor?.uuid === document.uuid);
    return matches.length === 1 ? matches[0] : null;
  }).filter(Boolean);
}
function snapshotPoint(token) {
  const point = tokenPoint(token);
  return { x: point.x, y: point.y, elevation: point.elevation };
}
function eventRange(event, recipientToken, feet) {
  const evidence = eventEvidence(event);
  const read = (map, uuid) => map?.[opaqueKey(uuid ?? "")] ?? map?.[uuid];
  const scene = game.scenes?.get(event.sceneId), origin = read(evidence.positionSnapshot, event.donorTokenUuid),
    target = read(evidence.positionSnapshot, recipientToken.uuid);
  if (!scene || recipientToken.parent?.id !== scene.id) return { known: false, valid: false };
  if (!origin || !target) return { known: read(evidence.rangeReviews, recipientToken.uuid) === feet,
    valid: read(evidence.rangeReviews, recipientToken.uuid) === feet };
  return { known: true, valid: distanceFeet(scene, origin, target) <= feet + 1e-6 };
}
function sceneSkillState(scene) {
  return Object.fromEntries(values(scene?.tokens).filter(token => token.actor && !token.hidden && token.object?.visible === true)
    .map(token => [token.actor.uuid, actorHasActiveSkill(token.actor)]));
}
function publicEvent(event) {
  const { targetSnapshot, actorSkillSnapshot, positionSnapshot, ...visible } = event;
  return structuredClone(visible);
}
function eventEvidence(event) {
  if (!game.user?.isGM) return {};
  if (!event.evidenceMessageUuid) return event; // Existing, GM-reviewed receipts.
  return structuredClone(flag(globalThis.fromUuidSync?.(event.evidenceMessageUuid), "defenderTalentEvidence") ?? {});
}
async function pushEvent(state, event) {
  const old = state.events.find(candidate => candidate.id === event.id);
  if (old) return old;
  const encode = map => Object.fromEntries(Object.entries(map ?? {}).map(([uuid, value]) => [opaqueKey(uuid), value]));
  const evidence = { positionSnapshot: encode(event.positionSnapshot), actorSkillSnapshot: encode(event.actorSkillSnapshot) };
  const message = await ChatMessage.implementation.create({ content: "Defender Talent private trigger evidence",
    whisper: values(game.users).filter(user => user.isGM).map(user => user.id),
    flags: { ak5e: { defenderTalentEvidence: evidence } } });
  need(message?.uuid, "The GM-only Talent evidence could not be saved.");
  event.evidenceMessageUuid = message.uuid;
  delete event.positionSnapshot;
  delete event.actorSkillSnapshot;
  state.events.push(event);
  if (state.events.length > 120) state.events = state.events.slice(-120);
  return event;
}
function talentForId(actor, sourceId) {
  return listTalents(actor).find(row => row.state.sourceId === sourceId) ?? null;
}
function amountFor(row) {
  if (row.definition.key === "powerPlant" || row.definition.key === "refreshment") return row.state.moduleActive === true ? 6 : 3;
  if (row.definition.key === "swordShield") return row.state.moduleActive === true ? 2 : 1;
  if (row.definition.key === "tacticalDefence") return 1;
  throw new Error("This Defender Talent does not grant Skill Points.");
}
function recipientCount(row) { return row.definition.key === "tacticalDefence" && row.state.moduleActive === true ? 2 : 1; }
function artSource(message) {
  const item = itemForMessage(message);
  if (!message || !item && !message.flags?.dnd5e?.item) return null;
  return item?.type === "spell" || item?.flags?.ak5e?.art === true || message?.flags?.dnd5e?.item?.type === "spell";
}
function messageDamageTypes(message) {
  const flags = message?.flags?.dnd5e ?? {};
  const types = values(message?.rolls).map(roll => roll?.options?.type ?? roll?.options?.damageType)
    .filter(type => typeof type === "string" && type.trim()).map(type => type.toLowerCase());
  for (const value of [flags.damageType, flags.roll?.damageType]) if (typeof value === "string") types.push(value.toLowerCase());
  for (const value of values(flags.damageTypes ?? flags.roll?.damageTypes)) if (typeof value === "string") types.push(value.toLowerCase());
  return [...new Set(types)];
}
function artsDamage(message) {
  const source = artSource(message), types = messageDamageTypes(message);
  if (source === true) return true; // Ch.1: all Damage dealt by Arts is Arts Damage.
  if (types.length === 1) {
    const category = damageCategory(types[0]);
    if (category === "arts") return true;
    if (category === "physical" && source === false) return false;
  }
  return null;
}
function attackHit(message, token) {
  const descriptor = (message.flags?.dnd5e?.targets ?? []).find(target => target.uuid === token.uuid || target.uuid === token.actor?.uuid);
  if (!descriptor) return false;
  if (typeof descriptor.hit === "boolean") return descriptor.hit;
  const total = Number(message.rolls?.[0]?.total ?? message.flags?.dnd5e?.roll?.total);
  if (descriptor.ac == null) return null;
  if (message.rolls?.[0]?.isFumble === true) return false;
  if (message.rolls?.[0]?.isCritical === true) return true;
  const ac = Number(descriptor.ac);
  return Number.isFinite(total) && Number.isFinite(ac) ? total >= ac : null;
}
function validateEventState(actor, event, row) {
  need(row && row.state.active === true, "This selected Defender Talent is not active.");
  need(event && event.donorUuid === actor.uuid, "Choose an event recorded for this Defender.");
  need(event.sourceId === row.state.sourceId && row.definition.key === event.kind,
    "The recorded trigger does not belong to this selected Defender Talent.");
  need(event.tier === row.definition.tier && typeof event.moduleActive === "boolean",
    "The recorded Talent tier or Module state is invalid.");
  if (["powerPlant", "refreshment"].includes(event?.kind)) {
    need(event.evidenceVerified === true, "The active GM has no authenticated native HP application receipt; resolve this event manually.");
  }
  need(!event.skillOrigin, "Skill-origin events cannot generate this Skill Point gain.");
  need(!event.sourceSkillActive, "The donor had an Operator Skill active when this event occurred.");
  need(!event.sourceSkillOrigin, "This event originated from an Operator Skill.");
}
function targetSkillWasActive(event, target) {
  const snapshot = eventEvidence(event).actorSkillSnapshot;
  const key = Object.hasOwn(snapshot ?? {}, opaqueKey(target.uuid)) ? opaqueKey(target.uuid) : target.uuid;
  if (snapshot && Object.hasOwn(snapshot, key)) return snapshot[key] === true;
  return null;
}
function targetTokenForActorUuid(actorUuid, sceneId) {
  const scene = game.scenes?.get(sceneId);
  return values(scene?.tokens).find(token => token.actor?.uuid === actorUuid) ?? null;
}
function reviewReason(event) {
  return event.reviewReasons?.length ? event.reviewReasons.join("; ") : null;
}
const authoritativeHpReceipts = [];
let grantOperatorSPImpl = grantOperatorSP;
const authoritativeHpCache = new Map();
const pendingLocalApplications = [];
function actorHp(actor) {
  const hp = actor?.system?.attributes?.hp ?? {};
  return { hp: Number(hp.value), temp: Number(hp.temp ?? 0) };
}
function liveActors() {
  const actors = new Map(values(game.actors).map(actor => [actor.uuid, actor]));
  for (const scene of values(game.scenes)) for (const token of values(scene.tokens)) if (token.actor?.uuid) actors.set(token.actor.uuid, token.actor);
  for (const token of values(globalThis.canvas?.tokens?.placeables)) if (token.actor?.uuid) actors.set(token.actor.uuid, token.actor);
  return [...actors.values()];
}
function seedActorHp(actor) {
  const hp = actorHp(actor);
  if (actor?.uuid && Number.isFinite(hp.hp) && Number.isFinite(hp.temp) && !authoritativeHpCache.has(actor.uuid)) {
    authoritativeHpCache.set(actor.uuid, hp);
  }
}
function recordAuthoritativeHpUpdate(actor, changed, options, userId) {
  const hpChanged = changed?.system?.attributes?.hp || Object.keys(changed ?? {}).some(key => key.startsWith("system.attributes.hp."));
  const after = actorHp(actor), before = authoritativeHpCache.get(actor?.uuid) ?? null;
  if (actor?.uuid && Number.isFinite(after.hp) && Number.isFinite(after.temp)) authoritativeHpCache.set(actor.uuid, after);
  if (!gmActive() || !hpChanged || !before || ![before.hp, before.temp, after.hp, after.temp].every(Number.isFinite)) return;
  const messageUuid = options?.originatingMessage?.uuid ?? options?.dnd5e?.originatingMessage?.uuid ?? null;
  const user = game.users.get(userId);
  const message = messageUuid ? globalThis.fromUuidSync?.(messageUuid) : null;
  const verified = Boolean(user && (user.isGM || own(actor, user)));
  const localIndex = pendingLocalApplications.findIndex(pending => pending.actorUuid === actor.uuid
    && pending.userId === userId && pending.before.hp === before.hp && pending.before.temp === before.temp
    && pending.after.hp === after.hp && pending.after.temp === after.temp && Date.now() - pending.createdAt < 5000);
  const localEvidence = localIndex < 0 ? null : pendingLocalApplications.splice(localIndex, 1)[0];
  const id = `hp:${opaqueKey(`${actor.uuid}:${userId}:${before.hp}:${before.temp}:${after.hp}:${after.temp}:${randomId()}`)}`;
  const old = authoritativeHpReceipts.find(receipt => receipt.id === id);
  if (old) return;
  authoritativeHpReceipts.push({ id, targetUuid: actor.uuid, userId,
    messageUuid: localEvidence?.messageUuid ?? (message?.documentName === "ChatMessage" ? messageUuid : null),
    provenanceConfirmed: Boolean(localEvidence?.messageUuid), before, after,
    amount: before.hp + before.temp - after.hp - after.temp, sceneId: primaryToken(actor)?.parent?.id ?? globalThis.canvas?.scene?.id ?? null,
    verified, consumedBy: [], createdAt: Date.now() });
  if (authoritativeHpReceipts.length > 300) authoritativeHpReceipts.splice(0, authoritativeHpReceipts.length - 300);
}

const kernel = createOperationKernel({
  label: "Defender Talent",
  stateFlag: STATE_FLAG,
  requestFlag: REQUEST_FLAG,
  responseFlag: RESPONSE_FLAG,
  receiptFlag: RECEIPT_FLAG,
  benefitFlag: "defenderTalentBenefit",
  rollFlag: "defenderTalentRoll",
  tagPreset: "defender-talent",
  getState: normalizeState,
  isMember: actor => listTalents(actor).length > 0,
  ownerExempt: ["recordAttack", "recordApplication", "grant", "review", "confirmTurn"],
  gate: (actor, command) => need(["recordAttack", "recordApplication", "grant", "review", "confirmTurn"].includes(command), `Unknown Defender Talent command: ${command}.`),
  perform: async (actor, command, data, operation, state, user) => {
    if (command === "recordAttack") {
      const message = await globalThis.fromUuid(data.messageUuid);
      need(message?.documentName === "ChatMessage" && message.author?.id === user.id && message.flags?.dnd5e?.roll?.type === "attack", "Choose an authenticated Attack Roll message.");
      const attacker = actorForMessage(message), talentRows = listTalents(actor);
      need(attacker && (user.isGM || own(attacker, user)), "The authenticated user must own the attacking Actor or be the GM.");
      need(message.rolls?.length === 1, "Combined Attack Roll messages require GM review and cannot be processed automatically.");
      const targets = messageTargetTokens(message), matching = talentRows.flatMap(row => {
        if (row.definition.key === "swordShield" && attacker.uuid === actor.uuid) return targets.map(token => ({ row, token, hit: attackHit(message, token), kind: "swordShield" }));
        if (row.definition.key === "tacticalDefence") return targets.filter(token => token.actor?.uuid === actor.uuid).map(token => ({ row, token, hit: null, kind: "tacticalDefence" }));
        return [];
      });
      for (const { row, token, hit, kind } of matching) {
        if (kind === "swordShield" && hit === false) continue;
        const id = `attack:${opaqueKey(`${message.uuid}:${row.state.sourceId}:${token.uuid}`)}`;
        const reviewReasons = [];
        if (hit === null && kind === "swordShield") reviewReasons.push("Attack hit outcome is unknown");
        if (sourceIsSkillOrigin(message)) reviewReasons.push("Attack originated from an Operator Skill");
        if (message.flags?.dnd5e?.targets?.length !== targets.length) reviewReasons.push("Attack target provenance is incomplete");
        if (!token.object || token.hidden) reviewReasons.push("Target visibility requires GM review");
        const turnKey = turnsNow(attacker);
        const donorToken = kind === "swordShield" ? tokenForActor(actor, token.parent) : token;
        const positionSnapshot = Object.fromEntries(values(token.parent.tokens).filter(candidate => !candidate.hidden && candidate.object?.visible === true)
          .map(candidate => [candidate.uuid, snapshotPoint(candidate)]));
        await pushEvent(state, { id, kind, status: reviewReasons.length ? "review" : "pending", donorUuid: actor.uuid,
          sourceId: row.state.sourceId, tier: row.state.tier, moduleActive: row.state.moduleActive === true,
          messageUuid: message.uuid, attackId: message.uuid, attackerUuid: attacker.uuid, attackerTokenUuid: tokenForActor(attacker, token.parent)?.uuid ?? null,
          donorTokenUuid: donorToken?.uuid ?? null, targetTokenUuid: token.uuid, sceneId: token.parent.id, positionSnapshot, hit,
          skillOrigin: messageSkillOrigin(message), sourceSkillOrigin: sourceIsSkillOrigin(message),
          sourceSkillActive: actorHasActiveSkill(actor), actorSkillSnapshot: sceneSkillState(token.parent),
          turnKey, visibilityConfirmed: false, reviewReasons, createdAt: Number(game.time?.worldTime ?? 0) });
      }
      operation.result = { recorded: matching.length };
      return state;
    }
    if (command === "recordApplication") {
      const observation = data.observation;
      need(observation && observation.userId === user.id && observation.targetUuid, "The HP application receipt is invalid.");
      const target = await globalThis.fromUuid(observation.targetUuid);
      need(target?.documentName === "Actor" && (user.isGM || own(target, user)), "The authenticated user must own the actual HP target or be the GM.");
      const matchingReceipts = authoritativeHpReceipts.filter(candidate => candidate.targetUuid === target.uuid && candidate.userId === observation.userId
        && !(candidate.consumedBy ?? []).includes(actor.uuid) && candidate.after.hp === actorHp(target).hp
        && candidate.after.temp === actorHp(target).temp
        && candidate.before.hp === Number(observation.before?.hp) && candidate.before.temp === Number(observation.before?.temp)
        && candidate.after.hp === Number(observation.after?.hp) && candidate.after.temp === Number(observation.after?.temp)
        && (!candidate.provenanceConfirmed || candidate.messageUuid === (observation.messageUuid ?? null)));
      const matchingReceipt = matchingReceipts.sort((left, right) => right.createdAt - left.createdAt)[0];
      const receipt = matchingReceipt?.verified ? matchingReceipt : null;
      const evidence = receipt ?? { id: `unverified:${opaqueKey(`${observation.id}:${target.uuid}`)}`, targetUuid: target.uuid,
        messageUuid: observation.messageUuid ?? null, before: null, after: null, amount: null, sceneId: observation.sceneId ?? null,
        verified: false, userId: user.id };
      const message = observation.messageUuid ? await globalThis.fromUuid(observation.messageUuid) : null;
      if (observation.messageUuid) need(message?.documentName === "ChatMessage", "The originating damage/healing message is unavailable.");
      if (receipt?.provenanceConfirmed) need(message?.uuid === receipt.messageUuid,
        "The active GM's native damage hook recorded a different originating message.");
      else if (message && receipt) receipt.messageUuid = message.uuid;
      const source = message && actorForMessage(message), talents = listTalents(actor),
        isHeal = evidence.verified && evidence.after.hp > evidence.before.hp,
        isDamage = evidence.verified && evidence.amount > 0 && (evidence.after.hp < evidence.before.hp || evidence.after.temp < evidence.before.temp);
      const messageAuthor = message?.author && game.users.get(message.author.id);
      const sourceAuthenticated = Boolean(source && messageAuthor && (messageAuthor.isGM || own(source, messageAuthor)));
      const attack = message ? originatingAttack(message) : null;
      const sourceTargets = [...messageTargetTokens(message), ...messageTargetTokens(attack)];
      // A GM-local native application binds this exact message to the actual HP target.
      // Standalone D&D5e damage/healing cards need not carry a target list.
      const targetProvenance = evidence.provenanceConfirmed === true || sourceTargets.some(token => token.actor?.uuid === target.uuid);
      for (const row of talents) {
        const key = row.definition.key;
        if (key === "refreshment" && source?.uuid === actor.uuid && (isHeal || !evidence.verified)) {
          const token = targetTokenForActorUuid(target.uuid, evidence.sceneId ?? observation.sceneId);
          const turnKey = turnsNow(actor);
          const id = `healing:${opaqueKey(`${evidence.id}:${row.state.sourceId}:${target.uuid}`)}`;
          const reviewReasons = [];
          if (!evidence.verified) reviewReasons.push("Active GM has no authenticated native HP application receipt");
          if (!sourceAuthenticated || !targetProvenance) reviewReasons.push("Healing source or target provenance requires GM review");
          if (evidence.verified && !evidence.provenanceConfirmed && sourceAuthenticated && targetProvenance) reviewReasons.push("HP application source provenance requires GM review");
          if (sourceIsSkillOrigin(message)) reviewReasons.push("Healing originated from an Operator Skill");
          if (actorHasActiveSkill(actor)) reviewReasons.push("The Defender had an Operator Skill active at the trigger");
          if (!turnKey) reviewReasons.push("Outside combat, a GM-confirmed Turn marker is required");
          if (!token) reviewReasons.push("Healed target has no token in the application scene");
          await pushEvent(state, { id, kind: "refreshment", status: reviewReasons.length ? "review" : "pending", donorUuid: actor.uuid,
            sourceId: row.state.sourceId, tier: row.state.tier, moduleActive: row.state.moduleActive === true,
            messageUuid: message?.uuid ?? null, applicationId: evidence.id, targetActorUuid: target.uuid, targetTokenUuid: token?.uuid ?? null,
            evidenceVerified: evidence.verified, actualHpGain: evidence.verified ? evidence.after.hp - evidence.before.hp : null,
            temporaryHpGain: evidence.verified ? Math.max(0, evidence.after.temp - evidence.before.temp) : null,
            skillOrigin: messageSkillOrigin(message), sourceSkillOrigin: sourceIsSkillOrigin(message), sourceSkillActive: actorHasActiveSkill(actor),
            actorSkillSnapshot: sceneSkillState(token?.parent), turnKey, sceneId: evidence.sceneId ?? observation.sceneId, visibilityConfirmed: false,
            provenanceConfirmed: evidence.provenanceConfirmed === true,
            provenanceReviewAllowed: Boolean(evidence.verified && sourceAuthenticated && !evidence.provenanceConfirmed),
            reviewReasons, createdAt: Number(game.time?.worldTime ?? 0) });
        }
        if (key === "powerPlant" && target.uuid === actor.uuid && (isDamage || !evidence.verified)) {
          const attacker = source, hostile = operatorHostility(attacker, actor), art = artsDamage(message);
          const id = `damage:${opaqueKey(`${evidence.id}:${row.state.sourceId}:${actor.uuid}`)}`;
          const reviewReasons = [];
          if (!evidence.verified) reviewReasons.push("Active GM has no authenticated native HP application receipt");
          if (!message || !source || !sourceAuthenticated || !targetProvenance) reviewReasons.push("Damage source or target provenance requires GM review");
          if (evidence.verified && !evidence.provenanceConfirmed && sourceAuthenticated && targetProvenance) reviewReasons.push("HP application source provenance requires GM review");
          if (art !== true) reviewReasons.push(art === false ? "The applied Damage was Physical" : "Arts Damage type requires GM review");
          if (hostile === null) reviewReasons.push("Hostility is unknown");
          if (hostile === false) continue;
          if (sourceIsSkillOrigin(message)) reviewReasons.push("Damage originated from an Operator Skill");
          if (actorHasActiveSkill(actor)) reviewReasons.push("The Defender had an Operator Skill active at the trigger");
          const event = { id, kind: "powerPlant", status: reviewReasons.length ? "review" : "pending", donorUuid: actor.uuid,
            sourceId: row.state.sourceId, tier: row.state.tier, moduleActive: row.state.moduleActive === true,
            applicationId: evidence.id, messageUuid: message?.uuid ?? null, sourceActorUuid: source?.uuid ?? null,
            targetActorUuid: actor.uuid, evidenceVerified: evidence.verified,
            actualDamage: evidence.verified ? Math.max(0, evidence.before.hp + evidence.before.temp - evidence.after.hp - evidence.after.temp) : null,
            art, hostile, skillOrigin: messageSkillOrigin(message), sourceSkillOrigin: sourceIsSkillOrigin(message), sourceSkillActive: actorHasActiveSkill(actor),
            actorSkillSnapshot: sceneSkillState(evidence.sceneId ? game.scenes?.get(evidence.sceneId) : null), sceneId: evidence.sceneId ?? observation.sceneId,
            provenanceConfirmed: evidence.provenanceConfirmed === true,
            provenanceReviewAllowed: Boolean(evidence.verified && sourceAuthenticated && !evidence.provenanceConfirmed),
            reviewReasons, createdAt: Number(game.time?.worldTime ?? 0) };
          await pushEvent(state, event);
          if (event.status === "pending" && isOperatorActor(actor) && !actorHasActiveSkill(actor)) {
            const grantResult = await applyGrant(actor, state, row, event, [actor], { automated: true, user });
            event.status = grantResult?.granted ? "granted" : grantResult?.reason ?? "capped";
            event.grantResult = grantResult;
          }
        }
      }
      if (receipt) receipt.consumedBy = [...new Set([...(receipt.consumedBy ?? []), actor.uuid])];
      operation.result = { recorded: state.events.filter(event => event.applicationId === evidence.id).length, evidenceVerified: evidence.verified };
      return state;
    }
    if (command === "confirmTurn") {
      need(user.isGM, "Only the GM can confirm an out-of-combat Turn marker.");
      need(typeof data.eventId === "string" && typeof data.turnMarker === "string" && data.turnMarker.trim().length >= 3, "Provide the observed event and a Turn marker.");
      const event = state.events.find(candidate => candidate.id === data.eventId && candidate.kind === "refreshment");
      need(event, "Choose a recorded Refreshment trigger.");
      event.turnKey = `manual:${data.turnMarker.trim()}`;
      event.reviewReasons = (event.reviewReasons ?? []).filter(reason => !reason.includes("GM-confirmed Turn marker"));
      event.status = event.reviewReasons.length ? "review" : "pending";
      return state;
    }
    if (command === "review") {
      need(user.isGM, "Only the GM can review missing Defender Talent trigger facts.");
      const event = state.events.find(candidate => candidate.id === data.eventId);
      need(event, "Choose a recorded event awaiting review.");
      if (typeof data.facts?.eligibilityRecipientTokenUuid === "string") {
        const token = resolveToken(data.facts.eligibilityRecipientTokenUuid);
        need(token?.actor && token.parent?.id === event.sceneId && !token.hidden, "Choose a Creature in the trigger scene.");
        const evidence = eventEvidence(event), range = event.kind === "swordShield" ? 15 : event.kind === "tacticalDefence" ? 10 : null;
        if (range) {
          const measured = eventRange(event, token, range);
          need(!measured.known || measured.valid, "A known out-of-range recipient cannot be overridden.");
          if (!measured.known) (evidence.rangeReviews ??= {})[opaqueKey(token.uuid)] = range;
        }
        need(targetSkillWasActive(event, token.actor) !== true, "A known active Skill at the trigger cannot be overridden.");
        (evidence.actorSkillSnapshot ??= {})[opaqueKey(token.actor.uuid)] = false;
        if (event.evidenceMessageUuid) {
          const message = globalThis.fromUuidSync?.(event.evidenceMessageUuid);
          need(message, "The GM's trigger evidence is unavailable; resolve this grant manually.");
          const result = await message.update({ "flags.ak5e.defenderTalentEvidence": evidence });
          need(result || JSON.stringify(flag(message, "defenderTalentEvidence")) === JSON.stringify(evidence), "The GM's recipient evidence could not be saved.");
        }
      }
      if (data.facts?.hostile === true) {
        need(event.kind === "powerPlant" && event.hostile === null, "A known non-hostile event cannot be overridden.");
        event.hostile = true;
      }
      if (data.facts?.art === true) {
        need(event.kind === "powerPlant" && event.art === null, "A known non-Art event cannot be overridden.");
        event.art = true;
      }
      if (data.facts?.provenance === true) {
        need(["powerPlant", "refreshment"].includes(event.kind) && event.provenanceReviewAllowed === true,
          "Only missing source target lists can be confirmed; known invalid provenance cannot be overridden.");
        event.provenanceConfirmed = true;
        event.provenanceReviewAllowed = false;
      }
      if (typeof data.facts?.visibleRecipientTokenUuid === "string") {
        need(event.kind === "swordShield", "Recipient visibility review applies only to Sword and Shield.");
        const token = resolveToken(data.facts.visibleRecipientTokenUuid);
        need(token?.actor && token.parent?.id === event.sceneId && !token.hidden, "Choose a non-hidden Creature token in the event scene.");
        const range = eventRange(event, token, 15);
        need(range.known && range.valid, "Sword and Shield recipient was outside 15 feet when the Attack hit; range cannot be overridden.");
        event.visibleRecipientTokenUuids ??= [];
        if (!event.visibleRecipientTokenUuids.includes(token.uuid)) event.visibleRecipientTokenUuids.push(token.uuid);
      }
      if (data.facts?.hit === true) {
        need(event.kind === "swordShield" && event.hit === null, "A known miss cannot be overridden.");
        event.hit = true;
      }
      event.reviewReasons = (event.reviewReasons ?? []).filter(reason => {
        if (reason.includes("Hostility") && event.hostile === true) return false;
        if (reason.includes("Arts Damage type") && event.art === true) return false;
        if (reason.includes("provenance") && event.provenanceConfirmed === true) return false;
        if (reason.includes("visibility") && event.visibleRecipientTokenUuids?.length) return false;
        if (reason.includes("hit outcome") && event.hit === true) return false;
        return true;
      });
      if (event.reviewReasons.length === 0) event.status = "pending";
      return state;
    }
    if (command === "grant") {
      need(own(actor, user), "You must own the Defender to choose a Talent recipient.");
      const event = state.events.find(candidate => candidate.id === data.eventId);
      const row = talentForId(actor, data.sourceId);
      validateEventState(actor, event, row);
      const triggerRow = { ...row, state: { ...row.state, moduleActive: event.moduleActive, tier: event.tier } };
      need(event.status === "pending", reviewReason(event) ?? "This trigger is not ready for a grant.");
      need(!reviewReason(event), "Resolve the event's GM review before granting Skill Points.");
      if (event.kind === "powerPlant") {
        need(user.isGM && event.art === true && event.hostile === true, "Only the GM may process a reviewed, validated Power Plant trigger.");
        need(isOperatorActor(actor), "Enable Operator Skill SP integration before processing Power Plant.");
        const result = await applyGrant(actor, state, triggerRow, event, [actor], { user });
        event.status = result.granted ? "granted" : "capped";
        event.grantResult = result;
        return state;
      }
      if (event.kind === "refreshment") {
        need(event.actualHpGain > 0, "Refreshment requires actual Hit Points restored; Temporary Hit Points do not qualify.");
        need(event.turnKey, "A GM-confirmed Turn marker is required outside combat.");
        const used = state.refreshmentTurns[opaqueKey(`${event.sourceId}:${event.turnKey}`)];
        need(!used || used === event.id, "Refreshment has already been used this Turn.");
      }
      const targetTokens = (data.recipientTokenUuids ?? []).map(resolveToken);
      need(Array.isArray(data.recipientTokenUuids) && targetTokens.length === data.recipientTokenUuids.length,
        "Choose valid recipient tokens.");
      const max = recipientCount(triggerRow);
      need(targetTokens.length >= 1 && targetTokens.length <= max, `Choose one${max === 2 ? " or two" : ""} distinct recipient${max === 2 ? "s" : ""}.`);
      need(new Set(targetTokens.map(token => token.actor?.uuid)).size === targetTokens.length && targetTokens.every(token => token.actor),
        "Choose distinct Creatures.");
      if (event.kind === "tacticalDefence") need(targetTokens.every(token => token.actor.uuid !== actor.uuid), "Tactical Defence excludes the Defender.");
      if (event.kind === "refreshment") need(targetTokens[0].actor.uuid === event.targetActorUuid, "Refreshment can only grant Skill Points to the Creature actually healed.");
      const range = event.kind === "swordShield" ? 15 : event.kind === "tacticalDefence" ? 10 : null;
      for (const token of targetTokens) {
        need(token.parent?.id === event.sceneId || event.sceneId == null && token.parent?.id === globalThis.canvas?.scene?.id, "Choose a recipient in the event scene.");
        if (range) {
          const measure = eventRange(event, token, range);
          need(measure.known && measure.valid, `The recipient must be within ${range} feet at the trigger; a known out-of-range target cannot be overridden.`);
        }
        const activeThen = targetSkillWasActive(event, token.actor);
        need(activeThen !== true, "This Creature had an Operator Skill active when the trigger occurred and cannot receive this grant.");
        need(activeThen === false, "Recipient Skill eligibility at the trigger cannot be verified; ask the GM to review the event evidence.");
        need(!actorHasActiveSkill(token.actor), "This Creature currently has an Operator Skill active and cannot receive Skill Points.");
        if (event.kind === "swordShield") need(event.visibleRecipientTokenUuids?.includes(token.uuid), "The GM must confirm this exact recipient was visible to the donor at the trigger.");
        need(isOperatorActor(token.actor), `${token.name} does not have Operator Skill SP integration enabled.`);
      }
      if (event.kind === "refreshment") {
        state.refreshmentTurns[opaqueKey(`${event.sourceId}:${event.turnKey}`)] = event.id;
        kernel.noteMutation(actor);
        await kernel.saveState(actor, state);
      }
      const result = await applyGrant(actor, state, triggerRow, event, targetTokens.map(token => token.actor), { user });
      event.status = result.granted ? "granted" : "capped";
      event.grantResult = result;
      return state;
    }
    throw new Error(`Unknown Defender Talent command: ${command}.`);
  }
});

async function applyGrant(donor, state, row, event, targets, { user = game.user } = {}) {
  need(gmActive(), "An active GM is required to grant Skill Points.");
  validateEventState(donor, event, row);
  const recipientActorUuids = targets.map(target => target.uuid);
  if (event.recipientActorUuids) {
    need(JSON.stringify(event.recipientActorUuids) === JSON.stringify(recipientActorUuids),
      "A retry must use the original recipient list for this trigger.");
  } else {
    kernel.noteMutation(donor);
    event.recipientActorUuids = recipientActorUuids;
    await kernel.saveState(donor, state);
  }
  const amount = amountFor(row), outcomes = [];
  for (const target of targets) {
    need(isOperatorActor(target), `${target.name} does not have Operator Skill SP integration enabled.`);
    need(!actorHasActiveSkill(target), `${target.name} has an Operator Skill active and cannot gain Skill Points.`);
    const grantId = `defender-talent-${opaqueKey(`${event.id}:${row.state.sourceId}:${target.uuid}`)}`;
    const receiptKey = opaqueKey(`${event.id}:${row.state.sourceId}:${target.uuid}`);
    let receipts = { ...(flag(donor, STATE_FLAG)?.receipts ?? state.receipts ?? {}) };
    let receipt = receipts[receiptKey];
    if (receipt?.status === "granted" || receipt?.status === "capped") {
      outcomes.push({ actorUuid: target.uuid, amount: receipt.amount, gained: receipt.gained,
        capped: receipt.status === "capped", operationId: grantId, replayed: true });
      continue;
    }
    const beforeState = getIntegratedOperatorState(target), before = beforeState.points;
    if (!receipt) {
      receipt = { eventId: event.id, sourceId: row.state.sourceId, recipientUuid: target.uuid,
        operationId: grantId, amount, beforePoints: before, expectedGained: Math.max(0, Math.min(amount, beforeState.maximum - before)), status: "prepared" };
      receipts[receiptKey] = receipt;
      state.receipts = receipts;
      kernel.noteMutation(donor);
      const prepared = await donor.update({ [`flags.ak5e.${STATE_FLAG}.receipts`]: receipts });
      need(prepared || JSON.stringify(flag(donor, STATE_FLAG)?.receipts?.[receiptKey]) === JSON.stringify(receipt),
        "The prepared recipient receipt could not be saved; retry this operation before granting SP.");
    }
    const operationWasCommitted = getIntegratedOperatorState(target).operations.some(operation => operation.id === `feature-${grantId}`);
    // Mark the donor operation recoverable before either the recipient or donor documents change.
    kernel.noteMutation(donor);
    const result = await grantOperatorSPImpl(target, { amount, id: grantId, reason: `${row.definition.name}: ${event.kind} (${grantId})` });
    const after = getIntegratedOperatorState(target).points;
    const replayed = operationWasCommitted || result?.result?.replayed === true;
    const gained = replayed ? Number(receipt.expectedGained ?? 0) : Math.max(0, after - before);
    const completed = { ...receipt, amount, gained, status: gained > 0 ? "granted" : "capped" };
    receipts = { ...(flag(donor, STATE_FLAG)?.receipts ?? state.receipts ?? {}), [receiptKey]: completed };
    state.receipts = receipts;
    const saved = await donor.update({ [`flags.ak5e.${STATE_FLAG}.receipts`]: receipts });
    need(saved || JSON.stringify(flag(donor, STATE_FLAG)?.receipts?.[receiptKey]) === JSON.stringify(completed),
      "The completed recipient receipt could not be saved; retry the same operation.");
    outcomes.push({ actorUuid: target.uuid, amount, gained, capped: gained === 0, operationId: grantId, result });
  }
  return { granted: outcomes.some(outcome => outcome.gained > 0), outcomes };
}

const damageSnapshots = new WeakMap();
let installed = false;
const safe = promise => Promise.resolve(promise).catch(error => { console.error("AK5e | Defender Talents", error); globalThis.ui?.notifications?.error?.(error.message); });
function captureApplication(actor, amount, updates, options) {
  const snapshots = damageSnapshots.get(options) ?? new Map();
  const hp = actor.system?.attributes?.hp;
  snapshots.set(actor.uuid, { id: randomId(), targetUuid: actor.uuid, messageUuid: options?.originatingMessage?.uuid ?? null,
    amount: Number(amount), before: { hp: Number(hp?.value ?? 0), temp: Number(hp?.temp ?? 0) },
    after: { hp: Number(updates?.["system.attributes.hp.value"] ?? hp?.value ?? 0),
      temp: Number(updates?.["system.attributes.hp.temp"] ?? hp?.temp ?? 0) },
    capturedAt: Date.now(),
    sceneId: actor.token?.parent?.id ?? primaryToken(actor)?.parent?.id ?? globalThis.canvas?.scene?.id ?? null,
    userId: game.user.id });
  if (gmActive()) {
    pendingLocalApplications.push({ actorUuid: actor.uuid, messageUuid: options?.originatingMessage?.uuid ?? null,
      userId: game.user.id, before: { hp: Number(hp?.value ?? 0), temp: Number(hp?.temp ?? 0) },
      after: { hp: Number(updates?.["system.attributes.hp.value"] ?? hp?.value ?? 0),
        temp: Number(updates?.["system.attributes.hp.temp"] ?? hp?.temp ?? 0) }, createdAt: Date.now() });
    if (pendingLocalApplications.length > 100) pendingLocalApplications.splice(0, pendingLocalApplications.length - 100);
  }
  damageSnapshots.set(options, snapshots);
}
async function observeApplication(actor, _amount, options) {
  const snapshots = damageSnapshots.get(options), observation = snapshots?.get(actor.uuid);
  snapshots?.delete(actor.uuid);
  if (!observation || actor.system?.attributes?.hp?.value !== observation.after.hp || Number(actor.system?.attributes?.hp?.temp ?? 0) !== observation.after.temp) return;
  const donor = observation.messageUuid ? actorForMessage(await globalThis.fromUuid(observation.messageUuid)) : null;
  const candidates = new Set();
  for (const row of listTalents(donor)) if (["refreshment"].includes(row.definition.key)) candidates.add(donor);
  for (const row of listTalents(actor)) if (row.definition.key === "powerPlant") candidates.add(actor);
  for (const source of candidates) {
      const request = { id: `apply-${opaqueKey(`${observation.id}:${source.uuid}`)}`, command: "recordApplication", data: { observation, confirmation: true } };
    if (gmActive()) {
      const user = game.users.get(observation.userId);
      if (user && (user.isGM || own(actor, user))) await kernel.execute(source, request, user);
    } else {
      const gm = game.users?.activeGM;
      if (gm && (game.user.isGM || own(actor, game.user))) {
        await ChatMessage.implementation.create({ content: "Defender Talent HP application evidence", whisper: [gm.id, game.user.id],
          flags: { ak5e: { [REQUEST_FLAG]: { actorUuid: source.uuid, ...request } } } });
      }
    }
  }
}
async function observeAttack(message, _options, userId) {
  if (!gmActive() || message.flags?.dnd5e?.roll?.type !== "attack") return;
  const user = game.users.get(userId);
  if (!user || message.author?.id !== userId) return;
  const attacker = actorForMessage(message), targets = messageTargetTokens(message), sources = new Set();
  if (attacker) for (const row of listTalents(attacker)) if (row.definition.key === "swordShield") sources.add(attacker);
  for (const token of targets) for (const row of listTalents(token.actor)) if (row.definition.key === "tacticalDefence") sources.add(token.actor);
  for (const source of sources) {
    try { await kernel.execute(source, { id: `attack-${opaqueKey(`${message.uuid}:${source.uuid}`)}`, command: "recordAttack", data: { messageUuid: message.uuid, confirmation: true } }, user); }
    catch (error) { console.warn("AK5e | Defender Talent attack evidence requires review", error.message); }
  }
}
function handleRequest(message, options, userId) { return kernel.handle(message, options, userId); }

export function registerDefenderTalentHooks(_grantOperatorSP = grantOperatorSP) {
  if (typeof _grantOperatorSP === "function") grantOperatorSPImpl = _grantOperatorSP;
  if (installed) return;
  installed = true;
  for (const actor of liveActors()) seedActorHp(actor);
  Hooks.on("createActor", actor => seedActorHp(actor));
  Hooks.on("createToken", token => seedActorHp(token.actor));
  Hooks.on("updateToken", token => seedActorHp(token.actor));
  Hooks.on("createChatMessage", (message, options, userId) => {
    safe(handleRequest(message, options, userId));
    safe(observeAttack(message, options, userId));
  });
  Hooks.on("dnd5e.preApplyDamage", captureApplication);
  Hooks.on("updateActor", (actor, changed, options, userId) => { recordAuthoritativeHpUpdate(actor, changed, options, userId); });
  Hooks.on("dnd5e.applyDamage", (actor, amount, options) => safe(observeApplication(actor, amount, options)));
}

/** Inspection data for sheets; does not write documents or reveal private chat content. */
export function getDefenderTalentView(actor) {
  const state = normalizeState(actor);
  return { talents: listTalents(actor).map(({ item, state: selection, definition }) => ({ itemId: item.id,
    sourceId: selection.sourceId, name: definition.name, tier: selection.tier, moduleActive: selection.moduleActive === true })),
    pending: state.events.filter(event => ["pending", "review"].includes(event.status)).map(publicEvent),
    receipts: structuredClone(state.receipts), manual: [
      "Only Power Plant, Refreshment, Sword and Shield, Tactical Defence and Interlocking Shields are automated here. Other Defender Talents are descriptive and use their printed manual procedure.",
      "Interlocking Shields displays guided Damage Reduction; apply Damage through the table procedure.",
      "Refreshment requires Hit Points actually restored; Temporary Hit Points do not qualify. Outside combat it needs a GM-confirmed Turn marker. Unknown visibility or trigger facts stay pending GM review."
    ] };
}

export async function submitDefenderTalentGrant(actor, options = {}) {
  need(isLiveActor(actor), "Choose a live character or NPC Actor.");
  need(own(actor, game.user), "You must own the Defender to choose a Talent recipient.");
  need(typeof options.eventId === "string" && typeof options.sourceId === "string", "Choose a recorded Defender Talent trigger.");
  return kernel.submit(actor, "grant", { eventId: options.eventId, sourceId: options.sourceId,
    recipientTokenUuids: [...(options.recipientTokenUuids ?? [])], confirmation: true }, options.operationId ?? randomId());
}

/** Recheck active Shelter plus current 5-ft proximity and show the strongest non-stacking DR per scope. */
export function interlockingShieldsFor(targetTokenUuid) {
  const target = resolveToken(targetTokenUuid);
  if (!target?.actor || !target.parent) return { targetTokenUuid, physical: 0, all: 0, sources: [] };
  const sources = [];
  for (const sceneToken of values(target.parent.tokens)) {
    const defender = sceneToken.actor;
    if (defender?.uuid === target.actor.uuid) continue;
    const row = defender && talentForId(defender, DEFENDER_TALENT_IDS.interlocking);
    if (!row) continue;
    const shelter = flag(defender, "defender")?.shelter;
    if (!shelter?.active || !Array.isArray(shelter.allies) || !shelter.allies.includes(target.uuid)) continue;
    const origin = resolveToken(shelter.defenderTokenUuid) ?? sceneToken;
    if (origin.parent?.id !== target.parent.id || !nearFeet(target.parent, tokenPoint(origin), target, 5)) continue;
    const pb = Number(defender.system?.attributes?.prof);
    if (!Number.isFinite(pb) || pb <= 0) continue;
    const dr = Math.ceil(pb / 2);
    sources.push({ actorUuid: defender.uuid, actorName: defender.name, sourceId: row.state.sourceId, dr,
      damageScope: row.state.moduleActive === true ? "all" : "physical", guided: true });
  }
  return { targetTokenUuid, physical: Math.max(0, ...sources.map(source => source.dr)),
    all: Math.max(0, ...sources.filter(source => source.damageScope === "all").map(source => source.dr)), sources };
}

/** Small controls entry point for sheet adapters. The view remains available to observers. */
export async function openDefenderTalentControls(actor) {
  need(isLiveActor(actor), "Choose a live Defender Actor.");
  const view = getDefenderTalentView(actor);
  if (!globalThis.Dialog) return view;
  const controlEvents = normalizeState(actor).events.filter(event => ["pending", "review"].includes(event.status));
  const canChoose = own(actor, game.user), groups = controlEvents.map(event => {
    const scene = event.sceneId ? game.scenes?.get(event.sceneId) : null;
    const tokens = values(scene?.tokens).filter(token => token.actor && !token.hidden
      && (game.user.isGM || token.object?.visible === true));
    const eligible = tokens.filter(token => {
      if (event.kind === "refreshment") return token.actor.uuid === event.targetActorUuid;
      if (event.kind === "tacticalDefence" && token.actor.uuid === actor.uuid) return false;
      if (targetSkillWasActive(event, token.actor) === true || actorHasActiveSkill(token.actor)) return false;
      if (!isOperatorActor(token.actor)) return false;
      const range = event.kind === "swordShield" ? 15 : event.kind === "tacticalDefence" ? 10 : null;
      return range === null || (game.user.isGM ? !eventRange(event, token, range).known || eventRange(event, token, range).valid
        : Boolean(resolveToken(event.donorTokenUuid)) && nearFeet(scene, tokenPoint(resolveToken(event.donorTokenUuid)), token, range));
    });
    const recipients = event.kind === "powerPlant" ? "<p>Power Plant processes a validated grant automatically; unverified HP evidence remains manual.</p>"
      : `<fieldset><legend>Choose recipient${event.kind === "tacticalDefence" && event.moduleActive ? "s" : ""}</legend>${eligible.map(token =>
        `<label><input type="checkbox" data-recipient="${esc(token.uuid)}" data-event="${esc(event.id)}"${canChoose ? "" : " disabled"}>${esc(token.name)}</label>`).join("") || "<p>No eligible Operator Skill recipient is available.</p>"}</fieldset>`;
    const review = game.user.isGM ? `<p class="ak5e-defender-talent-review">${(event.reviewReasons ?? []).map(reason => `<span>${esc(reason)}</span>`).join("<br>")}</p>${
      event.kind === "powerPlant" && event.hostile === null ? `<label><input type="checkbox" data-fact="hostile" data-event="${esc(event.id)}">Confirm hostile Creature</label>` : ""}${
      event.kind === "powerPlant" && event.art === null ? `<label><input type="checkbox" data-fact="art" data-event="${esc(event.id)}">Confirm Arts Damage type</label>` : ""}${
      ["powerPlant", "refreshment"].includes(event.kind) && event.provenanceReviewAllowed ? `<label><input type="checkbox" data-fact="provenance" data-event="${esc(event.id)}">Confirm this authenticated message is the HP application source</label>` : ""}${
      event.kind === "swordShield" && event.hit === null ? `<label><input type="checkbox" data-fact="hit" data-event="${esc(event.id)}">Confirm the Attack hit</label>` : ""}
      <label><input type="checkbox" data-fact="eligibility" data-event="${esc(event.id)}">Confirm missing range and inactive Skill evidence for selected recipients at the trigger</label>` : "";
    const turn = game.user.isGM && event.kind === "refreshment" && !event.turnKey
      ? `<label>Observed Turn marker <input type="text" data-turn="${esc(event.id)}"></label>` : "";
    return `<article data-event="${esc(event.id)}"><h4>${esc(event.kind)} (${esc(event.status)})</h4>${review}${turn}${recipients}</article>`;
  }).join("");
  const content = `<section class="ak5e-defender-talents"><h3>Defender Talent triggers</h3>${groups || "<p>No pending triggers.</p>"}<aside>${view.manual.map(text => `<p>${esc(text)}</p>`).join("")}</aside></section>`;
  return new Dialog({ title: `${actor.name}: Defender Talents`, content,
    buttons: { confirm: { label: canChoose || game.user.isGM ? "Review / Grant" : "Close", callback: async html => {
      const root = html?.[0] ?? html;
      for (const event of view.pending) {
        if (game.user.isGM && root.querySelector(`[data-event="${CSS.escape(event.id)}"][data-fact="eligibility"]:checked`)) {
          for (const input of root.querySelectorAll(`[data-event="${CSS.escape(event.id)}"][data-recipient]:checked`))
            await defenderTalentOperation(actor, "review", { eventId: event.id, facts: { eligibilityRecipientTokenUuid: input.dataset.recipient } }, `elig-${opaqueKey(`${event.id}:${input.dataset.recipient}`)}`);
        }
        if (game.user.isGM && event.kind === "refreshment" && !event.turnKey) {
          const marker = root.querySelector(`[data-turn="${CSS.escape(event.id)}"]`)?.value?.trim();
          if (marker) await defenderTalentOperation(actor, "confirmTurn", { eventId: event.id, turnMarker: marker }, `turn-${opaqueKey(`${event.id}:${marker}`)}`);
        }
        if (game.user.isGM && event.kind === "swordShield") {
          const selected = [...root.querySelectorAll(`[data-event="${CSS.escape(event.id)}"][data-recipient]:checked`)].map(input => input.dataset.recipient);
          for (const recipientTokenUuid of selected) if (!event.visibleRecipientTokenUuids?.includes(recipientTokenUuid)) {
            await defenderTalentOperation(actor, "review", { eventId: event.id, facts: { visibleRecipientTokenUuid: recipientTokenUuid } }, `vis-${opaqueKey(`${event.id}:${recipientTokenUuid}`)}`);
          }
        }
        if (game.user.isGM) {
          const facts = {};
          for (const fact of ["hostile", "art", "hit", "provenance"]) {
            if (root.querySelector(`[data-event="${CSS.escape(event.id)}"][data-fact="${fact}"]:checked`)) facts[fact] = true;
          }
          if (Object.keys(facts).length) await defenderTalentOperation(actor, "review", { eventId: event.id, facts }, `review-${opaqueKey(`${event.id}:${JSON.stringify(facts)}`)}`);
        }
        const refreshedEvent = normalizeState(actor).events.find(candidate => candidate.id === event.id);
        if (game.user.isGM && refreshedEvent?.kind === "powerPlant" && refreshedEvent.status === "pending" && refreshedEvent.evidenceVerified) {
          await defenderTalentOperation(actor, "grant", { eventId: event.id, sourceId: event.sourceId, recipientTokenUuids: [] }, `grant-${opaqueKey(event.id)}`);
          continue;
        }
        if (!canChoose || !["pending", "review"].includes(event.status)) continue;
        const selected = [...root.querySelectorAll(`[data-event="${CSS.escape(event.id)}"][data-recipient]:checked`)].map(input => input.dataset.recipient);
        if (event.kind !== "powerPlant" && selected.length && refreshedEvent?.status === "pending") {
          await submitDefenderTalentGrant(actor, { eventId: event.id, sourceId: event.sourceId, recipientTokenUuids: selected,
            operationId: `grant-${opaqueKey(`${event.id}:${selected.join(",")}`)}` });
        }
      }
    } }, close: { label: canChoose || game.user.isGM ? "Close" : "Dismiss" } }, default: "confirm" }).render(true);
}

/** For live tests and GM review adapters; commands still pass the same authenticated kernel. */
export const defenderTalentOperation = async (actor, command, data, id = randomId()) => {
  if (["review", "confirmTurn"].includes(command)) need(game.user.isGM, "Only the GM can confirm missing Talent facts or Turn boundaries.");
  return kernel.submit(actor, command, { ...data, confirmation: true }, id);
};

export const defenderTalentInternals = Object.freeze({ amountFor, recipientCount, normalizeState, attackHit, actorForMessage,
  sceneSkillState, eventRange, defenderLevel, artsDamage, messageDamageTypes });
