import test from "node:test";
import assert from "node:assert/strict";
import { DEFENDER_TALENT_IDS, defenderTalentInternals, defenderTalentOperation,
  getDefenderTalentView, interlockingShieldsFor, openDefenderTalentControls, registerDefenderTalentHooks, submitDefenderTalentGrant } from "../scripts/defender-talents.mjs";

const hooks = {};
const docs = new Map();
const users = new Map();
const scenes = new Map();
const messages = new Map();

function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop(); let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = structuredClone(value);
}
function actor(id, { talent = null, sp = 0, maximum = 10, active = false, owner = true } = {}) {
  const doc = { id, uuid: `Actor.${id}`, documentName: "Actor", type: "character", name: id, pack: null,
    flags: { ak5e: { ...(talent ? { defenderTalentState: { version: 1, events: [talent.event], operations: [], receipts: {}, refreshmentTurns: {} } } : {}),
      operatorSkills: { enabled: true, maximum, points: sp, start: 0, active: active ? { activationId: "on" } : null, operations: [], receipts: [] },
      defender: { shelter: null } } }, system: { attributes: { prof: 3, hp: { value: 10, max: 10, temp: 0 } } }, items: new Map(), effects: new Map(), isOwner: owner,
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    testUserPermission(user) { return user.isGM || owner; },
    async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; } };
  if (talent) {
    const classItem = { id: `defender-class-${id}`, uuid: `Item.defender-class-${id}`, type: "class",
      flags: { ak5e: { chapterThreeId: "class-defender" } },
      system: { levels: talent.classLevel ?? (talent.tier === "advanced" ? talent.moduleActive ? 13 : 9 : talent.moduleActive ? 8 : 3) },
      getFlag(scope, key) { return this.flags?.[scope]?.[key]; } };
    doc.items.set(classItem.id, classItem); classItem.parent = doc;
    const item = { id: `item-${id}`, uuid: `Item.item-${id}`, type: "feat", name: talent.name ?? "Talent",
      flags: { ak5e: { defenderTalent: { sourceId: talent.sourceId, tier: talent.tier, moduleActive: talent.moduleActive === true, active: true } } },
      getFlag(scope, key) { return this.flags?.[scope]?.[key]; } };
    doc.items.set(item.id, item); item.parent = doc;
  }
  const skill = { id: `skill-${id}`, flags: { ak5e: { operatorSkill: { sourceId: "test", cost: maximum, start: 0,
    methods: ["offensive"], duration: "1 Round", activation: "Action", enabled: true } } },
  getFlag(scope, key) { return this.flags?.[scope]?.[key]; } };
  doc.items.set(skill.id, skill); skill.parent = doc;
  docs.set(doc.uuid, doc); game.actors?.set(doc.uuid, doc);
  return doc;
}
function token(id, ownerActor, x = 0, { hidden = false, visible = true, disposition = 1 } = {}) {
  const scene = scenes.get("Scene.test");
  const doc = { id, uuid: `Scene.test.Token.${id}`, documentName: "Token", name: id, actor: ownerActor, x, y: 0, width: 1, height: 1,
    elevation: 0, hidden, disposition, parent: scene, object: { visible }, getCenterPoint() { return { x: this.x + 50, y: 50 }; } };
  scene.tokens.set(id, doc); docs.set(doc.uuid, doc); return doc;
}
function positionSnapshot(scene) { return Object.fromEntries([...scene.tokens.values()].map(t => [t.uuid, { x: t.x + 50, y: t.y + 50, elevation: t.elevation }])); }
function boot() {
  docs.clear(); users.clear(); scenes.clear(); messages.clear();
  const gm = { id: "gm", isGM: true }, player = { id: "player", isGM: false };
  users.set(gm.id, gm); users.set(player.id, player); users.activeGM = gm;
  const scene = { id: "test", uuid: "Scene.test", grid: { size: 100, distance: 5, units: "ft", type: 1 }, tokens: new Map() };
  scenes.set(scene.uuid, scene); scenes.set(scene.id, scene);
  globalThis.game = { user: gm, users, scenes, actors: new Map(), combats: new Map(), messages, combat: null, time: { worldTime: 0 } };
  globalThis.CONFIG = { time: { roundTime: 6 } };
  globalThis.foundry = { utils: { randomID: () => "random-id" } };
  globalThis.fromUuidSync = uuid => docs.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => docs.get(uuid) ?? null;
  globalThis.Hooks = { on(name, fn) { (hooks[name] ??= []).push(fn); }, off() {} };
  globalThis.ui = { notifications: { error() {}, warn() {}, info() {} } };
  globalThis.ChatMessage = { implementation: { create: async data => {
    const id = `message-${messages.size}`, message = { id, uuid: `ChatMessage.${id}`, ...data, author: gm,
      getFlag(scope, key) { return this.flags?.[scope]?.[key]; }, async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } };
    docs.set(message.uuid, message); messages.set(id, message); return message;
  } } };
  globalThis.canvas = { scene };
  return { gm, player, scene };
}
function event(kind, sourceId, donor, scene, extras = {}) {
  return { id: `event-${kind}`, kind, status: "pending", donorUuid: donor.uuid, sourceId, tier: "advanced", moduleActive: false,
    sceneId: scene.id, sourceSkillActive: false, sourceSkillOrigin: false, skillOrigin: null,
    actorSkillSnapshot: {}, reviewReasons: [], ...extras };
}
function talentActor(sourceId, kind, { moduleActive = false, owner = true } = {}) {
  const tier = sourceId.includes("advanced") ? "advanced" : "basic";
  return actor(`donor-${kind}`, { owner, talent: { sourceId, tier, moduleActive,
    event: event(kind, sourceId, { uuid: `Actor.donor-${kind}` }, scenes.get("Scene.test"), { tier, moduleActive }) } });
}

test("only the five approved talent source IDs derive automatic Skill Point amounts", () => {
  boot();
  const states = [
    [DEFENDER_TALENT_IDS.powerPlant, 3, 6], [DEFENDER_TALENT_IDS.refreshment, 3, 6],
    [DEFENDER_TALENT_IDS.swordShield, 1, 2], [DEFENDER_TALENT_IDS.tacticalDefence, 1, 1]
  ];
  for (const [sourceId, base, module] of states) {
    const definition = { key: Object.entries(DEFENDER_TALENT_IDS).find(([, id]) => id === sourceId)[0] };
    assert.equal(defenderTalentInternals.amountFor({ definition, state: { sourceId, moduleActive: false } }), base);
    assert.equal(defenderTalentInternals.amountFor({ definition, state: { sourceId, moduleActive: true } }), module);
  }
  assert.equal(defenderTalentInternals.recipientCount({ definition: { key: "tacticalDefence" }, state: { moduleActive: true } }), 2);
  assert.equal(defenderTalentInternals.recipientCount({ definition: { key: "tacticalDefence" }, state: { moduleActive: false } }), 1);
  assert.equal(defenderTalentInternals.attackHit({ flags: { dnd5e: { targets: [{ uuid: "t", hit: false }] } } }, { uuid: "t" }), false);
  assert.equal(defenderTalentInternals.attackHit({ flags: { dnd5e: { targets: [{ uuid: "t" }] } }, rolls: [{ total: 17 }] }, { uuid: "t" }), null);
  docs.set("Item.art", { uuid: "Item.art", type: "spell", flags: { ak5e: { chapterFiveId: "art-test" } } });
  docs.set("Item.weapon", { uuid: "Item.weapon", type: "weapon", flags: {} });
  assert.equal(defenderTalentInternals.artsDamage({ flags: { dnd5e: { item: { uuid: "Item.art" } } }, rolls: [{ options: { type: "bludgeoning" } }] }), true);
  assert.equal(defenderTalentInternals.artsDamage({ flags: { dnd5e: { item: { uuid: "Item.weapon" } } }, rolls: [{ options: { type: "fire" } }] }), true);
  assert.equal(defenderTalentInternals.artsDamage({ flags: { dnd5e: { item: { uuid: "Item.weapon" } } }, rolls: [{ options: { type: "bludgeoning" } }] }), false);
  assert.equal(defenderTalentInternals.artsDamage({ flags: { dnd5e: {} }, rolls: [] }), null);
});

test("talent automation requires attached Defender level and prevents stale tier or Module flags", () => {
  boot();
  const low = talentActor(DEFENDER_TALENT_IDS.powerPlant, "powerPlant");
  [...low.items.values()].find(item => item.type === "class").system.levels = 2;
  assert.equal(getDefenderTalentView(low).talents.length, 0);
  const missingClass = talentActor(DEFENDER_TALENT_IDS.powerPlant, "missing-class");
  missingClass.items.delete(`defender-class-${missingClass.id}`);
  assert.equal(getDefenderTalentView(missingClass).talents.length, 0);
  const staleModule = talentActor(DEFENDER_TALENT_IDS.tacticalDefence, "stale-module", { moduleActive: true });
  [...staleModule.items.values()].find(item => item.type === "class").system.levels = 12;
  assert.equal(getDefenderTalentView(staleModule).talents.length, 0);
  const wrongTier = talentActor(DEFENDER_TALENT_IDS.powerPlant, "wrong-tier");
  [...wrongTier.items.values()].find(item => item.flags?.ak5e?.defenderTalent).flags.ak5e.defenderTalent.tier = "advanced";
  assert.equal(getDefenderTalentView(wrongTier).talents.length, 0);
});

test("client HP snapshots without active-GM native receipt stay review-only", async () => {
  const { gm } = boot();
  const donor = talentActor(DEFENDER_TALENT_IDS.powerPlant, "powerPlant");
  const attacker = actor("attacker");
  const message = { id: "client-message", uuid: "ChatMessage.client-message", documentName: "ChatMessage", author: gm,
    flags: { dnd5e: {} }, speakerActor: attacker };
  docs.set(message.uuid, message);
  await defenderTalentOperation(donor, "recordApplication", { observation: { id: "forged", targetUuid: donor.uuid,
    userId: gm.id, messageUuid: message.uuid, before: { hp: 10, temp: 0 }, after: { hp: 1, temp: 0 }, amount: 9, sceneId: "test" } }, "forged-evidence");
  const pending = getDefenderTalentView(donor).pending.find(event => event.kind === "powerPlant" && event.applicationId);
  assert.ok(pending);
  assert.equal(pending.evidenceVerified, false);
  assert.equal(pending.actualDamage, null);
  await assert.rejects(submitDefenderTalentGrant(donor, { eventId: pending.id,
    sourceId: DEFENDER_TALENT_IDS.powerPlant, recipientTokenUuids: [], operationId: "forged-grant" }), /authenticated native HP application receipt/);
  assert.equal(donor.flags.ak5e.operatorSkills.points, 0);
});

test("native HP receipt uses the GM cache when updateActor omits originating-message options", async () => {
  const { gm, scene } = boot();
  const defender = talentActor(DEFENDER_TALENT_IDS.powerPlant, "powerPlant");
  const attacker = talentActor(DEFENDER_TALENT_IDS.refreshment, "refreshment");
  token("defender-token", defender, 100, { disposition: 1 });
  token("attacker-token", attacker, 0, { disposition: -1 });
  const art = { id: "art", uuid: "Item.art-native", type: "spell", actor: attacker, flags: { ak5e: { chapterFiveId: "test-art" } } };
  docs.set(art.uuid, art);
  const message = { id: "native-damage", uuid: "ChatMessage.native-damage", documentName: "ChatMessage", author: gm,
    speakerActor: attacker, rolls: [{ options: { type: "fire" } }],
    flags: { dnd5e: { item: { uuid: art.uuid, type: "spell" }, targets: [{ uuid: "Scene.test.Token.defender-token" }] } } };
  docs.set(message.uuid, message); messages.set(message.uuid, message);
  registerDefenderTalentHooks();
  const updateOptions = {};
  const updates = { "system.attributes.hp.value": 7, "system.attributes.hp.temp": 0 };
  const applicationOptions = { originatingMessage: message };
  for (const hook of hooks["dnd5e.preApplyDamage"] ?? []) hook(defender, 3, updates, applicationOptions);
  defender.system.attributes.hp.value = 7;
  for (const hook of hooks.updateActor ?? []) hook(defender, { "system.attributes.hp.value": 7 }, updateOptions, gm.id);
  for (const hook of hooks["dnd5e.applyDamage"] ?? []) hook(defender, 3, applicationOptions);
  await new Promise(resolve => setTimeout(resolve, 0));
  const recorded = defender.flags.ak5e.defenderTalentState.events.find(event => event.kind === "powerPlant" && event.applicationId);
  assert.ok(recorded);
  assert.equal(recorded.evidenceVerified, true);
  assert.equal(recorded.actualDamage, 3);
  assert.equal(recorded.art, true);
  assert.equal(recorded.hostile, true);
  assert.equal(defender.flags.ak5e.operatorSkills.points, 3);
  assert.equal(recorded.status, "granted");
});

test("recipient SP receipt recovery preserves Refreshment success after donor receipt write interruption", async () => {
  const { scene } = boot();
  const donor = talentActor(DEFENDER_TALENT_IDS.refreshment, "refreshment");
  const recipient = actor("healed-recipient", { sp: 0, owner: false });
  const recipientToken = token("healed-token", recipient, 100);
  const eventRecord = donor.flags.ak5e.defenderTalentState.events[0];
  Object.assign(eventRecord, { actualHpGain: 4, evidenceVerified: true, targetActorUuid: recipient.uuid,
    targetTokenUuid: recipientToken.uuid, sceneId: scene.id, turnKey: "combat:Combat.test:1:0",
    actorSkillSnapshot: { [recipient.uuid]: false }, reviewReasons: [] });
  const originalUpdate = donor.update.bind(donor);
  let receiptWrites = 0;
  donor.update = async changes => {
    if (Object.hasOwn(changes, "flags.ak5e.defenderTalentState.receipts") && ++receiptWrites === 2) {
      throw new Error("simulated failure writing completed donor receipt");
    }
    return originalUpdate(changes);
  };
  const options = { eventId: eventRecord.id, sourceId: eventRecord.sourceId,
    recipientTokenUuids: [recipientToken.uuid], operationId: "refreshment-retry" };
  await assert.rejects(submitDefenderTalentGrant(donor, options), /completed donor receipt/);
  assert.equal(recipient.flags.ak5e.operatorSkills.points, 3);
  await submitDefenderTalentGrant(donor, options);
  assert.equal(recipient.flags.ak5e.operatorSkills.points, 3);
  assert.equal(donor.flags.ak5e.defenderTalentState.events[0].status, "granted");
  assert.ok(Object.values(donor.flags.ak5e.defenderTalentState.receipts).some(receipt => receipt.status === "granted" && receipt.gained === 3));
  assert.ok(Object.keys(donor.flags.ak5e.defenderTalentState.refreshmentTurns).every(key => !key.includes(".")));
  const later = { ...structuredClone(donor.flags.ak5e.defenderTalentState.events[0]), id: "second-heal-same-turn", status: "pending", recipientActorUuids: undefined };
  donor.flags.ak5e.defenderTalentState.events.push(later);
  await assert.rejects(submitDefenderTalentGrant(donor, { ...options, eventId: later.id, operationId: "second-refreshment" }), /already been used this Turn/);
});

test("a trigger cannot be granted through a different selected talent", async () => {
  boot();
  const donor = talentActor(DEFENDER_TALENT_IDS.refreshment, "wrong-trigger");
  const e = donor.flags.ak5e.defenderTalentState.events[0];
  e.kind = "tacticalDefence";
  await assert.rejects(submitDefenderTalentGrant(donor, { eventId: e.id,
    sourceId: DEFENDER_TALENT_IDS.refreshment, recipientTokenUuids: [], operationId: "wrong-talent" }), /does not belong/);
  assert.equal(donor.flags.ak5e.operatorSkills.points, 0);
});

test("only an owner may submit a grant, and cap results are recorded visibly", async () => {
  const { gm, player, scene } = boot();
  const donor = talentActor(DEFENDER_TALENT_IDS.swordShield, "swordShield", { owner: false }); token("source", donor, 0);
  const target = actor("capped", { sp: 10, maximum: 10, owner: false });
  const targetToken = token("recipient-token", target, 0);
  const e = donor.flags.ak5e.defenderTalentState.events[0];
  e.donorTokenUuid = "Scene.test.Token.source"; e.positionSnapshot = positionSnapshot(scene);
  e.visibleRecipientTokenUuids = [targetToken.uuid]; e.actorSkillSnapshot = { [target.uuid]: false };
  game.user = player;
  await assert.rejects(submitDefenderTalentGrant(donor, { eventId: e.id, sourceId: e.sourceId,
    recipientTokenUuids: [targetToken.uuid], operationId: "not-owner" }), /own the Defender/);
  game.user = gm;
  await submitDefenderTalentGrant(donor, { eventId: e.id, sourceId: e.sourceId,
    recipientTokenUuids: [targetToken.uuid], operationId: "capped" });
  const view = getDefenderTalentView(donor);
  assert.equal(donor.flags.ak5e.defenderTalentState.events[0].status, "capped");
  assert.ok(Object.values(view.receipts).some(receipt => receipt.status === "capped"));
  await assert.rejects(submitDefenderTalentGrant(donor, { eventId: e.id, sourceId: e.sourceId,
    recipientTokenUuids: [], operationId: "cap-replay-different-recipients" }), /not ready for a grant/);
});

test("Sword and Shield uses trigger-time Module state and grants once", async () => {
  const { scene } = boot();
  const donor = talentActor(DEFENDER_TALENT_IDS.swordShield, "swordShield");
  const target = actor("recipient", { sp: 2, owner: false });
  const sourceToken = token("source", donor, 0), targetToken = token("target", target, 200);
  donor.items.get(`item-${donor.id}`).parent = donor;
  const e = donor.flags.ak5e.defenderTalentState.events[0];
  Object.assign(e, { attackerUuid: donor.uuid, attackerTokenUuid: sourceToken.uuid, targetTokenUuid: "Scene.test.Token.victim",
    donorTokenUuid: sourceToken.uuid, positionSnapshot: positionSnapshot(scene), visibleRecipientTokenUuids: [targetToken.uuid],
    actorSkillSnapshot: { [target.uuid]: false } });
  // The talent gained its Module after this hit; this event remains a one-SP trigger.
  [...donor.items.values()].find(item => item.type === "class").system.levels = 13;
  donor.items.get(`item-${donor.id}`).flags.ak5e.defenderTalent.moduleActive = true;
  const operationId = "sword-once";
  await submitDefenderTalentGrant(donor, { eventId: e.id, sourceId: e.sourceId, recipientTokenUuids: [targetToken.uuid], operationId });
  assert.equal(target.flags.ak5e.operatorSkills.points, 3);
  assert.equal(donor.flags.ak5e.defenderTalentState.events[0].status, "granted");
  await submitDefenderTalentGrant(donor, { eventId: e.id, sourceId: e.sourceId, recipientTokenUuids: [targetToken.uuid], operationId });
  assert.equal(target.flags.ak5e.operatorSkills.points, 3, "same request cannot grant twice");
});

test("grant refuses known out-of-range, active-Skill and active-at-trigger recipients", async () => {
  const { scene } = boot();
  const donor = talentActor(DEFENDER_TALENT_IDS.swordShield, "swordShield"); token("source", donor, 0);
  const far = actor("far", { sp: 0 }); const farToken = token("far-token", far, 1000);
  const e = donor.flags.ak5e.defenderTalentState.events[0];
  e.donorTokenUuid = "Scene.test.Token.source"; e.positionSnapshot = positionSnapshot(scene); e.visibleRecipientTokenUuids = [farToken.uuid];
  await assert.rejects(submitDefenderTalentGrant(donor, { eventId: e.id, sourceId: e.sourceId, recipientTokenUuids: [farToken.uuid], operationId: "far" }), /within 15 feet/);
  farToken.x = 100;
  const active = actor("active", { sp: 0, active: true }); const activeToken = token("active-token", active, 0);
  const current = donor.flags.ak5e.defenderTalentState.events[0]; current.positionSnapshot = positionSnapshot(scene); current.actorSkillSnapshot[active.uuid] = true;
  assert.equal(defenderTalentInternals.eventRange(current, activeToken, 15).valid, true);
  await assert.rejects(submitDefenderTalentGrant(donor, { eventId: current.id, sourceId: current.sourceId, recipientTokenUuids: [activeToken.uuid], operationId: "active" }), /Operator Skill active/);
  active.flags.ak5e.operatorSkills.active = null;
  await assert.rejects(submitDefenderTalentGrant(donor, { eventId: e.id, sourceId: e.sourceId, recipientTokenUuids: [activeToken.uuid], operationId: "active-then" }), /active when the trigger occurred/);
});

test("Tactical Defence Module accepts two distinct recipients and resumes a partial grant exactly once", async () => {
  const { scene } = boot();
  const donor = talentActor(DEFENDER_TALENT_IDS.tacticalDefence, "tacticalDefence", { moduleActive: true });
  token("defender", donor, 0);
  const first = actor("first", { sp: 0 }), second = actor("second", { sp: 0 });
  const t1 = token("first-token", first, 100), t2 = token("second-token", second, 200);
  const e = donor.flags.ak5e.defenderTalentState.events[0]; e.donorTokenUuid = "Scene.test.Token.defender"; e.positionSnapshot = positionSnapshot(scene);
  e.actorSkillSnapshot = { [first.uuid]: false, [second.uuid]: false };
  const updateSecond = second.update.bind(second); let fail = true;
  second.update = async changes => { if (fail && changes["flags.ak5e.operatorSkills"]) { fail = false; throw new Error("simulated interrupted second recipient"); } return updateSecond(changes); };
  const options = { eventId: e.id, sourceId: e.sourceId, recipientTokenUuids: [t1.uuid, t2.uuid], operationId: "two-targets" };
  await assert.rejects(submitDefenderTalentGrant(donor, options), /simulated interrupted/);
  assert.equal(first.flags.ak5e.operatorSkills.points, 1);
  await assert.rejects(submitDefenderTalentGrant(donor, { ...options, recipientTokenUuids: [t2.uuid] }), /cannot be reused with different choices/);
  await submitDefenderTalentGrant(donor, options);
  assert.equal(first.flags.ak5e.operatorSkills.points, 1);
  assert.equal(second.flags.ak5e.operatorSkills.points, 1);
  assert.equal(donor.flags.ak5e.defenderTalentState.events[0].status, "granted");
});

test("Interlocking Shields reads current Shelter recipients and returns the strongest non-stacking scope", () => {
  const { scene } = boot();
  const target = actor("sheltered", { sp: 0 }); const targetToken = token("sheltered-token", target, 100);
  const base = talentActor(DEFENDER_TALENT_IDS.interlocking, "interlocking-base"); const baseToken = token("base-defender", base, 0);
  const module = talentActor(DEFENDER_TALENT_IDS.interlocking, "interlocking-module", { moduleActive: true }); const moduleToken = token("module-defender", module, 0);
  base.flags.ak5e.defender.shelter = { active: true, allies: [targetToken.uuid], defenderTokenUuid: baseToken.uuid };
  module.flags.ak5e.defender.shelter = { active: true, allies: [targetToken.uuid], defenderTokenUuid: moduleToken.uuid };
  base.flags.ak5e.defender.shelter.allies.push(baseToken.uuid);
  const view = interlockingShieldsFor(targetToken.uuid);
  assert.equal(view.physical, 2);
  assert.equal(view.all, 2);
  assert.equal(view.sources.length, 2);
  module.flags.ak5e.defender.shelter.active = false;
  assert.deepEqual(interlockingShieldsFor(targetToken.uuid), { targetTokenUuid: targetToken.uuid, physical: 2, all: 0,
    sources: [{ actorUuid: base.uuid, actorName: base.name, sourceId: DEFENDER_TALENT_IDS.interlocking, dr: 2, damageScope: "physical", guided: true }] });
});

test("view exposes pending review and manual boundaries without document writes", () => {
  boot();
  const donor = talentActor(DEFENDER_TALENT_IDS.refreshment, "refreshment");
  const before = structuredClone(donor.flags.ak5e.defenderTalentState);
  const view = getDefenderTalentView(donor);
  assert.equal(view.pending.length, 1);
  assert.ok(view.manual.some(text => text.includes("Temporary Hit Points")));
  assert.deepEqual(donor.flags.ak5e.defenderTalentState, before);
});

test("trigger geometry and Skill state persist only in GM-whispered evidence", async () => {
  const { gm, scene } = boot();
  const donor = talentActor(DEFENDER_TALENT_IDS.swordShield, "swordShield"), target = actor("enemy");
  token("donor", donor, 0); const targetToken = token("enemy", target, 100);
  const message = { uuid: "ChatMessage.attack", documentName: "ChatMessage", author: gm, speakerActor: donor,
    rolls: [{ total: 20 }], flags: { dnd5e: { roll: { type: "attack" }, targets: [{ uuid: target.uuid, ac: 10 }] } } };
  docs.set(message.uuid, message);
  await defenderTalentOperation(donor, "recordAttack", { messageUuid: message.uuid }, "private-attack");
  const recorded = donor.flags.ak5e.defenderTalentState.events.find(e => e.messageUuid === message.uuid);
  assert.ok(recorded.evidenceMessageUuid);
  assert.equal(recorded.positionSnapshot, undefined);
  assert.equal(recorded.actorSkillSnapshot, undefined);
  const evidence = docs.get(recorded.evidenceMessageUuid);
  assert.deepEqual(evidence.whisper, [gm.id]);
  assert.equal(Object.keys(evidence.flags.ak5e.defenderTalentEvidence.positionSnapshot).length, 2);
  assert.ok(Object.keys(evidence.flags.ak5e.defenderTalentEvidence.positionSnapshot).every(key => !key.includes(".")));
  assert.equal(defenderTalentInternals.eventRange(recorded, targetToken, 15).valid, true);
  recorded.status = "granted";
  recorded.recipientActorUuids = [target.uuid];
  await defenderTalentOperation(donor, "recordAttack", { messageUuid: message.uuid }, "same-attack-different-operation");
  const replay = donor.flags.ak5e.defenderTalentState.events.find(e => e.messageUuid === message.uuid);
  assert.equal(replay.status, "granted");
  assert.deepEqual(replay.recipientActorUuids, [target.uuid]);
});

test("Tactical Defence's player picker does not reveal a player-unseen Creature", async () => {
  const { player, scene } = boot();
  const donor = talentActor(DEFENDER_TALENT_IDS.tacticalDefence, "tacticalDefence");
  const donorToken = token("defender", donor, 0), unseen = token("Secret NPC", actor("secret"), 100, { visible: false });
  const e = donor.flags.ak5e.defenderTalentState.events[0];
  e.donorTokenUuid = donorToken.uuid; e.positionSnapshot = positionSnapshot(scene);
  game.user = player;
  let content;
  globalThis.Dialog = class { constructor(options) { content = options.content; } render() {} };
  try { await openDefenderTalentControls(donor); } finally { delete globalThis.Dialog; }
  assert.ok(!content.includes(unseen.name));
  assert.ok(!content.includes(unseen.uuid));
});

test("only the GM can confirm missing recipient facts, without overriding known bad range or active Skills", async () => {
  const { scene, player, gm } = boot();
  const donor = talentActor(DEFENDER_TALENT_IDS.tacticalDefence, "tacticalDefence"), recipient = actor("reviewed-recipient");
  const donorToken = token("donor", donor, 0), recipientToken = token("recipient", recipient, 100);
  const e = donor.flags.ak5e.defenderTalentState.events[0]; e.donorTokenUuid = donorToken.uuid;
  const data = { eventId: e.id, facts: { eligibilityRecipientTokenUuid: recipientToken.uuid } };
  game.user = player;
  await assert.rejects(defenderTalentOperation(donor, "review", data, "player-review"), /Only the GM/);
  game.user = gm;
  await defenderTalentOperation(donor, "review", data, "gm-review");
  await submitDefenderTalentGrant(donor, { eventId: e.id, sourceId: e.sourceId, recipientTokenUuids: [recipientToken.uuid], operationId: "reviewed-grant" });
  assert.equal(recipient.flags.ak5e.operatorSkills.points, 1);
  const second = talentActor(DEFENDER_TALENT_IDS.tacticalDefence, "known-bad");
  token("second-donor", second, 0); recipientToken.x = 1000;
  const bad = second.flags.ak5e.defenderTalentState.events[0]; bad.kind = "tacticalDefence"; bad.donorTokenUuid = "Scene.test.Token.second-donor";
  bad.positionSnapshot = positionSnapshot(scene); bad.actorSkillSnapshot[recipient.uuid] = false;
  await assert.rejects(defenderTalentOperation(second, "review", { eventId: bad.id, facts: data.facts }, "bad-range-review"), /known out-of-range/);
});

test("a prevented prepared receipt never grants SP, and its exact retry succeeds once", async () => {
  const { scene } = boot();
  const donor = talentActor(DEFENDER_TALENT_IDS.tacticalDefence, "tacticalDefence"), recipient = actor("prevented-recipient");
  const donorToken = token("donor", donor, 0), recipientToken = token("recipient", recipient, 100);
  const e = donor.flags.ak5e.defenderTalentState.events[0]; e.donorTokenUuid = donorToken.uuid;
  e.positionSnapshot = positionSnapshot(scene); e.actorSkillSnapshot[recipient.uuid] = false;
  const update = donor.update.bind(donor); let prevented = false;
  donor.update = async changes => {
    if (!prevented && changes["flags.ak5e.defenderTalentState.receipts"]) { prevented = true; return false; }
    return update(changes);
  };
  const options = { eventId: e.id, sourceId: e.sourceId, recipientTokenUuids: [recipientToken.uuid], operationId: "prevented-receipt" };
  await assert.rejects(submitDefenderTalentGrant(donor, options), /prepared recipient receipt could not be saved/);
  assert.equal(recipient.flags.ak5e.operatorSkills.points, 0);
  assert.deepEqual(donor.flags.ak5e.defenderTalentState.events[0].recipientActorUuids, [recipient.uuid]);
  await submitDefenderTalentGrant(donor, options); await submitDefenderTalentGrant(donor, options);
  assert.equal(recipient.flags.ak5e.operatorSkills.points, 1);
});
