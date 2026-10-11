import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";

const gm = { id: "gm", isGM: true }, owner = { id: "owner", isGM: false }, secondOwner = { id: "owner2", isGM: false }, stranger = { id: "stranger", isGM: false }, secondGM = { id: "gm2", isGM: true };
let counter = 0;
const documents = new Map(), hooks = new Map();
globalThis.game = { user: gm, users: new Map([gm, owner, secondOwner, stranger, secondGM].map(user => [user.id, user])), actors: new Map(), scenes: new Map(), combats: new Map(), messages: new Map(), time: { worldTime: 0 }, i18n: { localize: key => key } };
game.users.activeGM = gm;
globalThis.CONFIG = { time: { roundTime: 6 } };
globalThis.foundry = { utils: { randomID: () => `event${++counter}` }, applications: { sheets: { ActorSheetV2: class {} } } };
globalThis.Hooks = { on(name, callback) { hooks.set(name, [...hooks.get(name) ?? [], callback]); }, off() {} };
globalThis.ui = { notifications: { error() {} } };
globalThis.fromUuid = async uuid => documents.get(uuid);
globalThis.fromUuidSync = uuid => documents.get(uuid);
const runtime = await import("../scripts/operator-skills.mjs");
const sheet = await import("../scripts/operator-sheet.mjs");

function actor({ type = "character", synthetic = false, enabled = true } = {}) {
  const id = `actor${++counter}`;
  const result = { id, uuid: synthetic ? `Scene.test.Token.${id}.Actor.${id}` : `Actor.${id}`, documentName: "Actor", name: id, type, isOwner: true, isToken: synthetic,
    flags: { ak5e: { operatorSkills: { enabled, points: 0 } } }, items: new Map(), writes: [], system: { attributes: { hp: { value: 20, temp: 0 } } },
    testUserPermission(user) { return user.isGM || [owner.id, secondOwner.id].includes(user.id); },
    getFlag(namespace, key) { return this.flags[namespace]?.[key]; },
    async update(change, options) { await Promise.resolve(); this.lastUpdateOptions = options; this.writes.push(structuredClone(change)); for (const [path, value] of Object.entries(change)) {
      if (path === "flags.ak5e.operatorSkills") this.flags.ak5e.operatorSkills = structuredClone(value);
    } return this; },
    async createEmbeddedDocuments(_type, entries) { return entries.map(entry => item(this, entry.flags.ak5e.operatorSkill)); },
    async updateEmbeddedDocuments(_type, entries) { for (const entry of entries) this.items.get(entry._id).flags.ak5e.operatorSkill = entry["flags.ak5e.operatorSkill"]; }
  };
  documents.set(result.uuid, result); if (!synthetic) game.actors.set(id, result);
  return result;
}
function item(actor, metadata = {}) {
  const id = `item${++counter}`;
  const entry = { id, uuid: `${actor.uuid}.Item.${id}`, name: id, type: "feat", parent: actor, actor,
    flags: { ak5e: { operatorSkill: { sourceId: id, cost: 40, start: 10, methods: ["automatic", "offensive", "defensive"], activation: "Action", duration: "Instant", ...metadata } } },
    getFlag(namespace, key) { return this.flags[namespace]?.[key]; }, cards: [], async displayCard(options) { this.cards.push(options); }, sheet: { render() {} } };
  actor.items.set(id, entry); documents.set(entry.uuid, entry); return entry;
}
function message(source, { type = "attack", targets = [], originatingMessage, origin, activityType = "attack", rolls = 1 } = {}) {
  const id = `message${++counter}`;
  const entry = { id, uuid: `ChatMessage.${id}`, documentName: "ChatMessage", author: gm, speakerActor: source, rolls: Array.from({ length: rolls }, () => ({})),
    flags: { dnd5e: { roll: { type }, activity: { type: activityType }, targets: targets.map(target => ({ uuid: target.uuid })), originatingMessage }, ak5e: origin ? { skillOrigin: origin } : {} },
    getFlag(namespace, key) { return this.flags[namespace]?.[key]; }, updateSource(data) { this.flags.ak5e.skillOrigin = data["flags.ak5e.skillOrigin"]; } };
  game.messages.set(id, entry); documents.set(entry.uuid, entry); return entry;
}
async function command(actor, name, data = {}, id = `request${++counter}`, user = gm) { return runtime.executeOperatorCommand(actor, { id, command: name, data }, user); }
function tokens(source, target) {
  const scene = { id: `scene${++counter}`, tokens: new Map() };
  scene.tokens.set("source", { actor: source, parent: scene, disposition: 1 });
  scene.tokens.set("target", { actor: target, parent: scene, disposition: -1 }); game.scenes.set(scene.id, scene); return scene;
}
function combat(source) {
  const result = { id: `combat${++counter}`, uuid: `Combat.${counter}`, started: true, round: 1, turn: 0, previous: { round: 0, turn: null }, combatant: { id: "a", actor: source }, turns: [{ id: "a", actor: source }, { id: "b" }] };
  game.combats.set(result.id, result); game.combat = result; return result;
}

test("opt-in retains manual Actors, adding a Skill never refills, and source duplicates do not stack", async () => {
  const source = actor({ enabled: false }); source.flags.ak5e.operatorSkills = { maximum: 12, start: 4, points: 7, active: { name: "Existing" } };
  const first = item(source); item(source, { sourceId: first.id });
  await runtime.observeOperatorAttack(message(source)); assert.equal(source.writes.length, 0);
  await command(source, "enable", { enabled: true });
  assert.equal(source.flags.ak5e.operatorSkills.points, 7); assert.equal(source.flags.ak5e.operatorSkills.active.name, "Existing");
  assert.equal(runtime.getIntegratedOperatorState(source).rates.offensive, 1);
  await command(source, "end"); await command(source, "sync"); assert.equal(source.flags.ak5e.operatorSkills.points, 7);
  const catalogue = CHAPTER_THREE_CLASSES.find(entry => entry.operatorSkill);
  const learned = await command(source, "learn", { sourceId: catalogue.id });
  assert.ok(source.items.get(learned.result)); assert.equal(source.flags.ak5e.operatorSkills.points, 7);
});

test("per-Actor queue serializes simultaneous charging and activation, and persists double-click receipts", async () => {
  const source = actor(); const skill = item(source, { cost: 10 }); source.flags.ak5e.operatorSkills.points = 8;
  const gain = runtime.processOperatorEvent(source, { type: "automatic", id: "turn", ownTurn: true });
  const activation = command(source, "activate", { itemId: skill.id }, "click");
  await Promise.all([gain, activation]); assert.equal(source.flags.ak5e.operatorSkills.points, 0);
  assert.equal(source.flags.ak5e.operatorSkills.receipts.length, 1);
  await command(source, "activate", { itemId: skill.id }, "click"); assert.equal(source.flags.ak5e.operatorSkills.points, 0);
  assert.equal(skill.cards.length, 1); assert.equal(skill.cards[0].flags.ak5e.skillOrigin.activationId, "click");
  await assert.rejects(command(source, "activate", { itemId: skill.id }, "second-click"), /Not enough/);
  const receiptWrite = source.writes.find(write => write["flags.ak5e.operatorSkills"].receipts?.length);
  assert.equal(receiptWrite["flags.ak5e.operatorSkills"].points, 10);
});

test("one elected GM verifies actual request authors and owners, and rejects invalid document references", async () => {
  const source = actor(); item(source);
  const makeRequest = (author, data = {}) => ({ author, flags: { ak5e: { spRequest: { actorUuid: source.uuid, id: `command${++counter}`, command: "event",
    data: { event: { id: `event${counter}`, type: "defensiveAttack", hostile: true, ...data } } } } }, async update(change) { this.response = change["flags.ak5e.spResponse"]; } });
  const forged = makeRequest(gm); await runtime.handleOperatorRequest(forged, {}, stranger.id); assert.equal(forged.response.ok, false);
  const unauthorized = makeRequest(stranger); await runtime.handleOperatorRequest(unauthorized, {}, stranger.id); assert.equal(unauthorized.response.ok, false);
  const first = makeRequest(owner); await runtime.handleOperatorRequest(first, {}, owner.id); assert.equal(first.response.ok, true);
  const second = makeRequest(secondOwner); await runtime.handleOperatorRequest(second, {}, secondOwner.id); assert.equal(second.response.ok, true);
  assert.equal(source.flags.ak5e.operatorSkills.points, 4);
  game.user = secondGM;
  await assert.rejects(command(source, "end"), /GMRequired/);
  await runtime.observeOperatorAttack(message(source, { targets: [source] })); assert.equal(source.flags.ak5e.operatorSkills.points, 4);
  game.user = gm;
  await assert.rejects(command(source, "event", { event: { id: "bad", type: "offensiveHealing", targetUuid: "Item.fake", positive: true } }), /TargetRequired/);
  await assert.rejects(command(source, "event", { event: { id: "bad-attack", type: "offensiveDamage", attack: true, attackId: source.uuid, hostile: true, positive: true } }), /AttackRequired/);
  game.users.activeGM = null;
  await assert.rejects(runtime.submitOperatorCommand(source, "end"), /GMRequired/); game.users.activeGM = gm;
  assert.equal(source.flags.ak5e.operatorSkills.points, 4);
});

test("Defensive attack messages charge misses once; damage respects immunity, temporary HP, and Attack identity", async () => {
  const source = actor(), target = actor({ type: "npc" }); item(source); item(target); tokens(source, target); combat(source);
  const attack = message(source, { targets: [target] }); await runtime.observeOperatorAttack(attack);
  await runtime.observeOperatorAttack(attack); assert.equal(target.flags.ak5e.operatorSkills.points, 2);
  const damageMessage = message(source, { type: "damage", originatingMessage: attack.id });
  const apply = async (id, before, after, amount = 5) => runtime.processOperatorApplication(target, { id, before, after, amount, messageUuid: damageMessage.uuid, context: { ownTurn: true } });
  await apply("immune", { value: 20, temp: 0 }, { value: 20, temp: 0 }, 0); assert.equal(source.flags.ak5e.operatorSkills.points, 0);
  await apply("temp", { value: 20, temp: 10 }, { value: 20, temp: 5 }); assert.equal(source.flags.ak5e.operatorSkills.points, 1);
  await apply("part", { value: 20, temp: 0 }, { value: 15, temp: 0 }); assert.equal(source.flags.ak5e.operatorSkills.points, 1);
  assert.equal(target.flags.ak5e.operatorSkills.points, 2);
  const secondAttack = message(source, { targets: [target] }); await runtime.observeOperatorAttack(secondAttack);
  const secondDamage = message(source, { type: "damage", originatingMessage: secondAttack.id });
  await runtime.processOperatorApplication(target, { id: "new", before: { value: 15, temp: 0 }, after: { value: 10, temp: 0 }, amount: 5, messageUuid: secondDamage.uuid, context: { ownTurn: true } });
  assert.equal(source.flags.ak5e.operatorSkills.points, 2); assert.equal(target.flags.ak5e.operatorSkills.points, 4);
});

test("positive post-defense damage at zero HP charges, while immunity and full-health healing do not", async () => {
  const source = actor(), target = actor({ type: "npc" }); item(source); item(target); tokens(source, target); combat(source);
  const damage = message(source, { type: "damage", activityType: "save" });
  const observation = { id: "zero-hp", amount: 5, before: { value: 0, temp: 0 }, after: { value: 0, temp: 0 }, messageUuid: damage.uuid, context: { ownTurn: true } };
  await runtime.processOperatorApplication(target, observation);
  assert.equal(source.flags.ak5e.operatorSkills.points, 1); assert.equal(target.flags.ak5e.operatorSkills.points, 2);
  await runtime.processOperatorApplication(target, observation); assert.equal(source.flags.ak5e.operatorSkills.points, 1);
  await runtime.processOperatorApplication(target, { ...observation, id: "immunity", amount: 0 }); assert.equal(source.flags.ak5e.operatorSkills.points, 1);
  const heal = message(source, { type: "damage", activityType: "heal" });
  await runtime.processOperatorApplication(target, { ...observation, id: "full-heal", amount: -10, before: { value: 20, temp: 0 }, after: { value: 20, temp: 0 }, messageUuid: heal.uuid });
  assert.equal(source.flags.ak5e.operatorSkills.points, 1);
});

test("failed spell prerequisites spend no SP and persist no operation", async () => {
  const source = actor(), skill = item(source, { effect: "A Strength Saving Throw against your Spell Save DC." });
  source.flags.ak5e.operatorSkills.points = 40;
  const before = structuredClone(source.flags.ak5e.operatorSkills);
  await assert.rejects(command(source, "activate", { itemId: skill.id }), /Spell Save DC/);
  assert.deepEqual(source.flags.ak5e.operatorSkills, before);
});

test("only successful native HP applications charge; actual healing and off-turn restrictions are retained", async () => {
  const source = actor(), target = actor(); item(source); item(target); tokens(source, target); const fight = combat(source);
  const heal = message(source, { type: "damage", activityType: "heal" });
  const options = { originatingMessage: heal };
  runtime.captureOperatorDamage(target, -5, { "system.attributes.hp.value": 25, "system.attributes.hp.temp": 0 }, options);
  await runtime.observeOperatorDamage(target, -5, options); assert.equal(source.flags.ak5e.operatorSkills.points, 0);
  runtime.captureOperatorDamage(target, -5, { "system.attributes.hp.value": 25, "system.attributes.hp.temp": 0 }, options);
  target.system.attributes.hp.value = 25; await runtime.observeOperatorDamage(target, -5, options); assert.equal(source.flags.ak5e.operatorSkills.points, 1);
  await runtime.processOperatorApplication(source, { id: "self-heal", amount: -5, before: { value: 10, temp: 0 }, after: { value: 15, temp: 0 }, messageUuid: heal.uuid, context: { ownTurn: true } });
  assert.equal(source.flags.ak5e.operatorSkills.points, 1);
  fight.combatant = { id: "b", actor: target };
  runtime.captureOperatorDamage(target, -5, { "system.attributes.hp.value": 30, "system.attributes.hp.temp": 0 }, options);
  target.system.attributes.hp.value = 30; await runtime.observeOperatorDamage(target, -5, options); assert.equal(source.flags.ak5e.operatorSkills.points, 1);
});

test("uncertain events wait for confirmation; confirmed facts cannot erase Skill provenance", async () => {
  const source = actor(), target = actor(); item(source); item(target); combat(source);
  const attack = message(source, { targets: [target], rolls: 2 }); await runtime.observeOperatorAttack(attack);
  assert.equal(target.flags.ak5e.operatorSkills.points, 0); assert.equal(target.flags.ak5e.operatorSkills.pendingEvents.length, 1);
  await command(target, "event", { event: { ...target.flags.ak5e.operatorSkills.pendingEvents[0], hostile: true } });
  assert.equal(target.flags.ak5e.operatorSkills.points, 2); assert.equal(target.flags.ak5e.operatorSkills.pendingEvents.length, 0);
  source.flags.ak5e.operatorSkills.pendingEvents = [{ id: "known-skill", type: "offensiveDamage", positive: true, hostile: true, attack: true, skillOrigin: { skillUuid: "old" }, ownTurn: true }];
  await command(source, "event", { event: { id: "known-skill", type: "offensiveDamage", skillOrigin: false } });
  assert.equal(source.flags.ak5e.operatorSkills.points, 0);
});

test("Skill origin is stamped on usage/roll messages and retained after an Instant Skill ends", async () => {
  const source = actor(), target = actor(); const skill = item(source); item(target); tokens(source, target); combat(source);
  source.flags.ak5e.operatorSkills.points = 40;
  await command(source, "activate", { itemId: skill.id }); assert.equal(source.flags.ak5e.operatorSkills.active, null);
  await command(source, "origin", { itemId: skill.id });
  const usage = message(source, { type: "use" }); runtime.markOperatorOrigin(usage); await runtime.observeOperatorAttack(usage);
  assert.equal(source.flags.ak5e.operatorSkills.pendingOrigin, null);
  const attack = message(source, { targets: [target], originatingMessage: usage.id }); runtime.markOperatorOrigin(attack);
  await runtime.observeOperatorAttack(attack); assert.equal(target.flags.ak5e.operatorSkills.points, 0);
  assert.equal(runtime.messageSkillOrigin(attack).skillUuid, skill.uuid);
});

test("forward combat charging expires Skills first, ignores rewinds/replays, and supports synthetic NPCs", async () => {
  const source = actor({ synthetic: true, type: "npc" }); const skill = item(source, { cost: 10, duration: "1 Round" }); const fight = combat(source);
  source.flags.ak5e.operatorSkills.points = 10; await command(source, "activate", { itemId: skill.id });
  await runtime.advanceOperatorCombat(fight, { round: 1, turn: 0 }); assert.equal(source.flags.ak5e.operatorSkills.points, 0);
  fight.previous = { round: 1, turn: 1 }; fight.round = 2;
  await runtime.advanceOperatorCombat(fight, { round: 2, turn: 0 }); assert.equal(source.flags.ak5e.operatorSkills.active, null); assert.equal(source.flags.ak5e.operatorSkills.points, 2);
  await runtime.advanceOperatorCombat(fight, { round: 2, turn: 0 }); assert.equal(source.flags.ak5e.operatorSkills.points, 2);
  fight.previous = { round: 2, turn: 0 }; fight.round = 1;
  await runtime.advanceOperatorCombat(fight, { round: 1 }); assert.equal(source.flags.ak5e.operatorSkills.points, 2);
  fight.round = 2; fight.previous = { round: 1, turn: 1 };
  await runtime.advanceOperatorCombat(fight, { round: 2 }); assert.equal(source.flags.ak5e.operatorSkills.points, 2);
  assert.deepEqual(source.lastUpdateOptions, { diff: false });
});

test("failed and prevented commits leave SP and receipts unchanged and report failure", async () => {
  const source = actor(); item(source); const before = structuredClone(source.flags.ak5e.operatorSkills);
  source.update = async () => { throw new Error("Database unavailable"); };
  await assert.rejects(command(source, "event", { event: { id: "failed", type: "defensiveAttack", hostile: true } }), /Database unavailable/);
  assert.deepEqual(source.flags.ak5e.operatorSkills, before);
  source.update = async () => undefined;
  await assert.rejects(command(source, "event", { event: { id: "prevented", type: "defensiveAttack", hostile: true } }), /CommitFailed/);
  assert.deepEqual(source.flags.ak5e.operatorSkills, before);
});

test("partial area creation and failed SP commits recover without spending twice or leaving provisional templates", async () => {
  const source = actor(), record = CHAPTER_THREE_CLASSES.find(entry => entry.operatorSkill && entry.name === "Grand Cross");
  const skill = item(source, record.operatorSkill);
  source.flags.ak5e.operatorSkills.points = record.operatorSkill.cost;
  const scene = { id: `scene${++counter}`, documentName: "Scene", grid: { type: 1, units: "ft", size: 100, distance: 5 }, walls: [], tokens: [], templates: [],
    async createEmbeddedDocuments(_type, data) {
      const created = data.map(entry => ({ ...entry, id: `template${++counter}`, getFlag(namespace, key) { return this.flags[namespace]?.[key]; } }));
      this.templates.push(...created);
      if (this.failCreation) { this.failCreation = false; throw new Error("Partial template write"); }
      return created;
    }, async deleteEmbeddedDocuments(_type, ids) { this.templates = this.templates.filter(template => !ids.includes(template.id)); this.templates.get = id => this.templates.find(template => template.id === id); } };
  scene.templates.get = id => scene.templates.find(template => template.id === id);
  const token = { id: "source", uuid: `Scene.${scene.id}.Token.source`, documentName: "Token", actor: source, parent: scene,
    x: 0, y: 0, width: 1, height: 1, getOccupiedGridSpaceOffsets: () => [] };
  scene.tokens = [token]; game.scenes.set(scene.id, scene); documents.set(token.uuid, token);
  scene.templates.push({ id: "other-caster-template", flags: { ak5e: { skillActivation: "recover-area", skillOrigin: { skillUuid: "Actor.other.Item.other" } } } });
  const previousChatMessage = globalThis.ChatMessage;
  globalThis.ChatMessage = { implementation: { async create() { return { uuid: `ChatMessage.private${++counter}` }; } } };
  const data = { itemId: skill.id, sourceTokenUuid: token.uuid, confirmation: true, shapes: [{ type: "cross", x: 0, y: 0, direction: 0 }] };
  try {
    scene.failCreation = true;
    await assert.rejects(command(source, "activate", data, "recover-area"), /Partial template write/);
    assert.equal(source.flags.ak5e.operatorSkills.points, record.operatorSkill.cost);
    assert.deepEqual(scene.templates.map(template => template.id), ["other-caster-template"]);
    const update = source.update;
    source.update = async function(change, options) {
      if (change["flags.ak5e.operatorSkills"].operations?.some(operation => operation.id === "recover-area")) {
        this.update = update; throw new Error("SP commit unavailable");
      }
      return update.call(this, change, options);
    };
    await assert.rejects(command(source, "activate", data, "recover-area"), /SP commit unavailable/);
    assert.equal(source.flags.ak5e.operatorSkills.points, record.operatorSkill.cost);
    assert.deepEqual(scene.templates.map(template => template.id), ["other-caster-template"]);
    await command(source, "activate", data, "recover-area");
    const retry = await command(source, "activate", data, "recover-area");
    assert.equal(source.flags.ak5e.operatorSkills.points, 0);
    assert.equal(scene.templates.length, 3);
    assert.equal(retry.result.replayed, true);
  } finally { globalThis.ChatMessage = previousChatMessage; }
});

test("manual endings, extensions, Start SP recovery and GM exceptions preserve unrelated state", async () => {
  const source = actor(); const skill = item(source, { cost: 10, duration: "2 Rounds" }); source.flags.ak5e.other = "keep";
  source.flags.ak5e.operatorSkills.points = 10; await command(source, "activate", { itemId: skill.id });
  await command(source, "extend", { rounds: 2, reason: "Skill effect" }); assert.equal(source.flags.ak5e.operatorSkills.active.expiry.rounds, 4);
  await assert.rejects(command(source, "adjust", { amount: 2, reason: "ordinary" }), /ActiveNoGain/);
  await command(source, "adjust", { amount: 2, reason: "explicit exception", exception: true }); assert.equal(source.flags.ak5e.operatorSkills.points, 2);
  await command(source, "end"); await command(source, "recover"); assert.equal(source.flags.ak5e.operatorSkills.points, 10);
  await command(source, "configureSkill", { itemId: skill.id, options: { methods: [], source: "Liberator" } }); assert.equal(runtime.getIntegratedOperatorState(source).rates.automatic, 0);
  assert.equal(source.flags.ak5e.other, "keep");
});

test("Blood Boil manual counter corrections require GM authority, retain SP and deduplicate retries", async () => {
  const source = actor(), record = CHAPTER_THREE_CLASSES.find(entry => entry.name === "Blood Boil" && entry.operatorSkill), skill = item(source, record.operatorSkill);
  source.flags.ak5e.operatorSkills = { enabled: true, points: 5, resolutions: [{ activationId: "blood-counter", itemId: skill.id, status: "completed", bloodBoilDamage: 7, phases: {} }] };
  const options = { activationId: "blood-counter", amount: 3, reason: "Source-confirmed direct HP damage" };
  await assert.rejects(command(source, "adjustSkillCounter", options, "counter-player", owner), /GMAdjustment/);
  await command(source, "adjustSkillCounter", options, "counter-correction");
  await command(source, "adjustSkillCounter", options, "counter-correction");
  assert.equal(source.flags.ak5e.operatorSkills.points, 5);
  assert.equal(source.flags.ak5e.operatorSkills.resolutions[0].bloodBoilDamage, 10);
  await assert.rejects(command(source, "adjustSkillCounter", { ...options, amount: -11 }), /negative/);
});

test("tracker render is read-only, includes owner controls, and supports the NPC header", () => {
  const { document } = parseHTML('<html><body><div id="pc"><div class="tab" data-tab="details"><div class="right"></div></div></div><div id="npc"><div class="sheet-header"><div class="right"></div></div></div></body></html>');
  globalThis.document = document;
  for (const type of ["character", "npc"]) {
    const source = actor({ type }); item(source);
    const app = new foundry.applications.sheets.ActorSheetV2(); app.document = source;
    const root = document.getElementById(type === "character" ? "pc" : "npc");
    sheet.renderOperatorSkills(app, root); sheet.renderOperatorSkills(app, root);
    assert.equal(source.writes.length, 0); assert.equal(root.querySelectorAll(".ak5e-operator-skills").length, 1);
    assert.ok(root.textContent.includes("1")); assert.ok(root.querySelectorAll("button").length > 4);
  }
});

test("completed Long Rest notifications deduplicate, and unenabled native Skill use remains unchanged", async () => {
  runtime.registerOperatorSkillHooks();
  const source = actor(), skill = item(source, { cost: 10, duration: "Until Long Rest" });
  source.flags.ak5e.operatorSkills.points = 20;
  await command(source, "activate", { itemId: skill.id });
  const complete = hooks.get("dnd5e.restCompleted")[0], result = { type: "long" };
  complete(source, result, { type: "long" }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(source.flags.ak5e.operatorSkills.active, null);
  await command(source, "activate", { itemId: skill.id });
  complete(source, result, { type: "long" }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(source.flags.ak5e.operatorSkills.points, 0); assert.ok(source.flags.ak5e.operatorSkills.active);
  complete(source, { type: "long" }, { type: "long" }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(source.flags.ak5e.operatorSkills.points, 10); assert.equal(source.flags.ak5e.operatorSkills.active, null);
  const manual = actor({ enabled: false }), manualSkill = item(manual);
  assert.equal(hooks.get("dnd5e.preUseActivity")[0]({ actor: manual, item: manualSkill }), undefined);
  assert.equal(manual.writes.length, 0);
});
