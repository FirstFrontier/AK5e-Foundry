import test from "node:test";
import assert from "node:assert/strict";
import { fixture, world, setup } from "./defender-fixture.mjs";
import { defenderCommand, registerDefenderHooks, defenderTurnEvent, defenderRest, resilience } from "../scripts/defender-features.mjs";
import { previewDefenderSetup, applyDefenderSetup, MANAGED_EFFECT_FLAG } from "../scripts/defender-setup.mjs";
import {
  registerArtshieldHooks, artshieldPlanner, expelActivity, expelGate, expelDone, artsSaveHook, concentrationBreakerEvent, rollConcentrationBreaker,
  syncEmpoweredStrikes, reactiveDefenceNotice, reachFeet, expireWards, STRIKES_BASE_ID, STRIKES_SKILL_ID, EXPEL_FEATURE_ID, WARD_FLAG
} from "../scripts/artshield-features.mjs";

const hooks = {};
const hookApi = {
  on(name, fn) { (hooks[name] ??= []).push(fn); },
  off(name, fn) { hooks[name] = (hooks[name] ?? []).filter(candidate => candidate !== fn); }
};
function boot({ combat = null, gm = false } = {}) {
  const documents = world(combat);
  globalThis.Hooks = hookApi;
  game.users = [{ id: "gm", isGM: true }, { id: "p1", isGM: false }, { id: "p2", isGM: false }];
  game.users.activeGM = gm ? game.users[0] : game.users[0];
  game.users.get = id => game.users.find(user => user.id === id);
  game.user = gm ? game.users[0] : game.users[1]; game.actors = new Map();
  const create = ChatMessage.implementation.create;
  ChatMessage.implementation.create = async data => {
    const message = await create(data);
    message.documentName = "ChatMessage"; message.id ??= `message-${game.messages.length}`; message.uuid ??= `ChatMessage.${message.id}`;
    message.author = { id: game.user.id }; message.speaker ??= data.speaker ?? {};
    documents.set(message.uuid, message);
    message.update = async changes => {
      for (const [path, value] of Object.entries(changes)) {
        const parts = path.split("."); let cursor = message;
        for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {};
        cursor[parts.at(-1)] = value;
      }
      for (const listener of hooks.updateChatMessage ?? []) listener(message, changes, {}, game.user.id);
      return message;
    };
    const request = message.flags?.ak5e?.defenderConcentrationBreakerRequest;
    if (request) {
      const caller = game.user; game.user = game.users.activeGM;
      try { for (const listener of hooks.createChatMessage ?? []) await listener(message, {}, caller.id); }
      finally { game.user = caller; }
    }
    return message;
  };
  registerDefenderHooks(); registerArtshieldHooks();
  return documents;
}
function artshield({ level = 12, res = 6 } = {}) {
  const actor = setup(fixture({ level, res, branch: "artshield" }));
  actor.type = "character"; actor.testUserPermission = user => user.id === "p1";
  return actor;
}
async function configured(actor) {
  const plan = previewDefenderSetup(actor);
  await applyDefenderSetup(actor, { confirmed: true, contextKey: plan.contextKey, operationId: "setup" });
  return actor;
}
const effectByName = (actor, name) => [...actor.effects.values()].find(e => e.name === name);
const turn = actor => ({ started: true, uuid: "Combat.c1", round: 1, turn: 0, combatant: { id: "m1", actor: { uuid: actor.uuid } } });
const artMessage = id => ({ id, flags: { dnd5e: { item: { type: "spell" } } } });
const saveConfig = messageId => ({ subject: null, event: { target: { closest: () => ({ dataset: { messageId } }) } }, rolls: [{ options: {} }] });

function mapWorld(documents, actor, { allyCol = 1, enemyCol = 1 } = {}) {
  const scene = { id: "scene", grid: { size: 100, distance: 5, units: "ft", type: 0 }, tokens: new Map(), templates: new Map() };
  scene.createEmbeddedDocuments = async (type, data) => data.map(entry => { const doc = { ...entry, uuid: `Template.${scene.templates.size}`, parent: scene, async delete() { scene.templates.delete(this.uuid); documents.delete(this.uuid); } }; scene.templates.set(doc.uuid, doc); documents.set(doc.uuid, doc); return doc; });
  const token = (id, col, tokenActor) => ({ id, uuid: `Token.${id}`, name: id, x: col * 100 - 50, y: 0, width: 1, height: 1, elevation: 0, parent: scene, actor: tokenActor, getCenterPoint() { return { x: this.x + 50, y: 50 }; } });
  const effects = new Map();
  const ally = { uuid: "Actor.ally", id: "ally", documentName: "Actor", name: "ally", isOwner: true, flags: { ak5e: {} }, effects, items: new Map(),
    getFlag() { return undefined; }, async createEmbeddedDocuments(_t, data) { return data.map((e, i) => { const doc = { ...structuredClone(e), id: `aw${effects.size + i}`, getFlag(s, k) { return this.flags?.[s]?.[k]; }, async delete() { effects.delete(this.id); } }; effects.set(doc.id, doc); return doc; }); } };
  const enemy = { uuid: "Actor.enemy", id: "enemy", documentName: "Actor", name: "enemy", flags: { ak5e: {} }, effects: new Map(), items: new Map(), getFlag() { return undefined; }, getActiveTokens: () => [] };
  const defenderToken = token("defender", 0, actor), allyToken = token("allyT", allyCol, ally), enemyToken = token("enemyT", enemyCol, enemy);
  for (const t of [defenderToken, allyToken, enemyToken]) { scene.tokens.set(t.id, t); documents.set(t.uuid, t); }
  actor.getActiveTokens = () => [defenderToken]; enemy.getActiveTokens = () => [enemyToken];
  for (const a of [actor, ally, enemy]) documents.set(a.uuid, a);
  return { scene, ally, enemy, defenderToken, allyToken, enemyToken };
}

test("setup plans Empowered Strikes from level 4 as two switched effects, and the Expel activity", async () => {
  boot();
  let plan = previewDefenderSetup(artshield({ level: 3 }));
  assert.deepEqual(plan.createEffects.map(e => e.disabled), [true, true], "nothing is live before level 4");
  assert.equal(plan.addActivities.length, 0);
  const actor = artshield({ level: 4 });
  plan = previewDefenderSetup(actor);
  const [base, skill] = plan.createEffects;
  assert.deepEqual([base.changes[0].value, base.disabled, skill.changes[0].value, skill.disabled], ["1d6[force]", false, "2d6[force]", true]);
  actor.flags.ak5e.operatorSkills = { active: { id: "s" } };
  const active = previewDefenderSetup(actor).createEffects;
  assert.deepEqual([active[0].disabled, active[1].disabled], [true, false]);
  assert.ok(previewDefenderSetup(actor).missing.includes(EXPEL_FEATURE_ID));
});

test("an active Operator Skill swaps the effects and only the disabled flags change", async () => {
  boot();
  const actor = await configured(artshield({ level: 4 }));
  const base = effectByName(actor, "Empowered Strikes"), skill = effectByName(actor, "Empowered Strikes (Operator Skill active)");
  const baseline = JSON.stringify(base.changes);
  assert.deepEqual([base.disabled, skill.disabled], [false, true]);
  actor.flags.ak5e.operatorSkills = { active: { id: "s" } };
  await syncEmpoweredStrikes(actor);
  assert.deepEqual([base.disabled, skill.disabled], [true, false]);
  actor.flags.ak5e.operatorSkills = { active: null };
  await syncEmpoweredStrikes(actor);
  assert.deepEqual([base.disabled, skill.disabled], [false, true]);
  assert.equal(JSON.stringify(base.changes), baseline);
  assert.equal(previewDefenderSetup(actor).empty, true);
});

test("a removed Artshield Branch switches Empowered Strikes off instead of deleting it", async () => {
  boot();
  const actor = await configured(artshield({ level: 4 }));
  actor.items.delete("branch");
  const plan = previewDefenderSetup(actor);
  assert.deepEqual(plan.updateEffects.map(u => u.effect.name), ["Empowered Strikes"]);
  assert.equal(actor.effects.size, 2);
});

test("setup disables legacy Leaping Ward Active Effects that applied blanket damage-type Resistance", () => {
  boot();
  const actor = artshield({ level: 12 });
  actor.effects.set("legacy", { id: "legacy", name: "Leaping Ward", disabled: false,
    changes: [{ key: "system.traits.dr.value", mode: 2, value: "fire" }], flags: { ak5e: { [WARD_FLAG]: { operationId: "old" } } },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; } });
  const plan = previewDefenderSetup(actor);
  const update = plan.updateEffects.find(entry => entry.effect.id === "legacy");
  assert.equal(update.changes.disabled, true);
  assert.ok(plan.warnings.some(w => /triggering Art/.test(w)));
});

test("the Expel activity is a Dexterity save for 3d6/6d6/9d6 Force in a 10-foot cube against the Martial DC", () => {
  const activity = expelActivity();
  assert.deepEqual([activity.save.ability, activity.damage.onSave, activity.damage.parts[0].types], [["dex"], "half", ["force"]]);
  assert.equal(activity.target.template.size, "10");
  const formula = activity.damage.parts[0].custom.formula;
  const dice = level => Function("floor", "min", `const L=${level}; return ${formula.replaceAll("@classes.defender.levels", "L").replace(/d6$/, "")}`)(Math.floor, Math.min);
  assert.deepEqual([4, 6, 7, 13, 14, 20].map(dice), [3, 3, 6, 6, 9, 9]);
  assert.match(activity.save.dc.formula, /8 \+ @prof/);
  assert.match(activity._id, /^[A-Za-z0-9]{16}$/, "dnd5e activity IDs are exactly 16 letters or digits");
});

test("Arts Absorption stores one charge from level 4 and the Expel activity needs it, an Action on the Turn, and consumes it", async () => {
  boot();
  const actor = await configured(artshield({ level: 4 }));
  await assert.rejects(defenderCommand(artshield({ level: 3 }), "absorb", { artsDamageConfirmed: true }, "x"), /level 4|configured/);
  await assert.rejects(defenderCommand(actor, "absorb", {}, "a0"), /took Arts Damage/);
  const activity = { actor, flags: { ak5e: { defenderExpel: true } } };
  assert.equal(expelGate(activity), false, "nothing stored yet");
  const stored = await defenderCommand(actor, "absorb", { artsDamageConfirmed: true, art: "Fireball" }, "a1");
  assert.match(stored.instruction, /3d6 Force/);
  await assert.rejects(defenderCommand(actor, "absorb", { artsDamageConfirmed: true }, "a2"), /already stored/);
  game.combat = { started: true, uuid: "C", round: 1, turn: 1, combatant: { id: "x", actor: { uuid: "Actor.other" } } };
  assert.equal(expelGate(activity), false, "only on your own Turn");
  game.combat = turn(actor);
  assert.equal(expelGate(activity), undefined, "allowed");
  assert.equal(expelGate({ actor, flags: {} }), undefined, "other activities are untouched");
  await expelDone(activity);
  assert.equal(actor.flags.ak5e.defender.absorbed, null);
  assert.equal(expelGate(activity), false);
  await defenderCommand(actor, "absorb", { artsDamageConfirmed: true }, "a3");
  await defenderRest(actor, "short"); assert.ok(actor.flags.ak5e.defender.absorbed);
  await defenderRest(actor, "long"); assert.equal(actor.flags.ak5e.defender.absorbed, null);
  assert.equal(effectByName(actor, "Empowered Strikes").disabled, false);
});

test("Expel scales: 6d6 at level 7 and 9d6 at level 14 in the confirmation text", async () => {
  boot();
  const seven = await configured(artshield({ level: 7 }));
  assert.match((await defenderCommand(seven, "absorb", { artsDamageConfirmed: true }, "a1")).instruction, /6d6 Force/);
  const fourteen = await configured(artshield({ level: 14 }));
  assert.match((await defenderCommand(fourteen, "absorb", { artsDamageConfirmed: true }, "a1")).instruction, /9d6 Force/);
});

test("Spellshield spends 2 Resilience only for a sheltered ally, with both confirmations", async () => {
  const documents = boot();
  const actor = await configured(artshield({ level: 5, res: 4 }));
  const { scene, allyToken } = mapWorld(documents, actor);
  const farActor = { uuid: "Actor.far", documentName: "Actor", name: "far ally", flags: { ak5e: {} } };
  const farToken = { id: "far", uuid: "Token.far", name: "far", x: 250, y: 0, width: 1, height: 1, elevation: 0, parent: scene,
    actor: farActor, getCenterPoint() { return { x: this.x + 50, y: 50 }; } };
  scene.tokens.set(farToken.id, farToken); documents.set(farToken.uuid, farToken); documents.set(farActor.uuid, farActor);
  const art = { id: "art", uuid: "ChatMessage.art", name: "Flame Art", flags: { dnd5e: { item: { type: "spell" } } } };
  game.messages = new Map([[art.id, art]]);
  const data = { allyTokenUuid: allyToken.uuid, artMessageUuid: art.uuid, savedConfirmed: true };
  await assert.rejects(defenderCommand(actor, "spellshield", data, "s1"), /benefitting from your Shelter/);
  await defenderCommand(actor, "shelter", { activation: "action", allies: [allyToken.uuid, farToken.uuid], alliesConfirmed: true }, "sh");
  await assert.rejects(defenderCommand(actor, "spellshield", data, "s2"), /Confirm sight/);
  await assert.rejects(defenderCommand(actor, "confirmSpellshieldArt", { artMessageUuid: art.uuid, visibleConfirmed: false }, "s3"), /Confirm that you can see/);
  await defenderCommand(actor, "confirmSpellshieldArt", { artMessageUuid: art.uuid, visibleConfirmed: true }, "s4");
  assert.equal(resilience(actor).value, 4);
  await defenderCommand(actor, "spellshield", data, "s5");
  assert.equal(resilience(actor).value, 2);
  await assert.rejects(defenderCommand(actor, "spellshield", { ...data, allyTokenUuid: farToken.uuid }, "far"), /within 5 feet/);
  await assert.rejects(defenderCommand(actor, "spellshield", data, "s6").then(() => defenderCommand(actor, "spellshield", data, "s7")).then(() => defenderCommand(actor, "spellshield", data, "s8")), /Not enough/);
});

test("Arts Resistance and Spellshield give Advantage only on saves from an Art's chat card", async () => {
  const documents = boot();
  const actor = await configured(artshield({ level: 5, res: 4 }));
  const { ally, allyToken, scene } = mapWorld(documents, actor);
  ally.getActiveTokens = () => [allyToken];
  game.messages = new Map([["art", artMessage("art")], ["weapon", { id: "weapon", flags: { dnd5e: { item: { type: "weapon" } } } }]]);
  game.messages.get = id => Map.prototype.get.call(game.messages, id);
  const roll = (subject, messageId) => { const c = saveConfig(messageId); c.subject = subject; artsSaveHook(c); return c.rolls[0].options.advantage; };
  assert.equal(roll(actor, "art"), true, "Arts Resistance");
  assert.equal(roll(actor, "weapon"), undefined, "not an Art");
  assert.equal(roll(actor, "missing"), undefined, "origin unknown: left to the table");
  assert.equal(roll(ally, "art"), undefined, "ally is not sheltered yet");
  await defenderCommand(actor, "shelter", { activation: "action", allies: [allyToken.uuid], alliesConfirmed: true, positionConfirmed: true }, "sh1");
  assert.equal(roll(ally, "art"), undefined, "sight of the Arts not confirmed");
  await defenderCommand(actor, "endShelter", {}, "end");
  await defenderCommand(actor, "shelter", { activation: "action", allies: [allyToken.uuid], alliesConfirmed: true, positionConfirmed: true }, "sh2");
  await defenderCommand(actor, "confirmSpellshieldArt", { artMessageUuid: "ChatMessage.art", visibleConfirmed: true }, "seen-art");
  assert.ok(Object.keys(actor.flags.ak5e.defender.shelter.spellshieldArts).every(key => !key.includes(".")), "receipt keys survive native dotted document updates");
  assert.equal(roll(ally, "art"), true, "Spellshield");
  assert.equal(roll(ally, "weapon"), undefined);
  game.messages.set("art2", artMessage("art2"));
  assert.equal(roll(ally, "art2"), undefined, "sight is confirmed for one Art message only");
  const plain = artshield({ level: 5 }); plain.items.delete("branch");
  assert.equal(roll(plain, "art"), undefined, "not an Artshield");
  assert.ok(scene);
});

test("Concentration Breaker receipts follow actual damage, use its native DC, and require an explicit marked roll", async () => {
  const documents = boot({ combat: { started: true, uuid: "Combat.c1", round: 1, turn: 0, combatant: { id: "a" } } });
  const actor = await configured(artshield({ level: 9 })); documents.set(actor.uuid, actor);
  const concentrationArt = { uuid: "Item.concArt", type: "spell", name: "Sustaining Art", requiresConcentration: true, system: { properties: new Set(["concentration"]) } };
  documents.set(concentrationArt.uuid, concentrationArt);
  const target = { uuid: "Actor.target", id: "target", isOwner: true, documentName: "Actor", name: "Target", flags: { ak5e: {} },
    concentration: { items: new Set([concentrationArt]), effects: new Map([["conc", { uuid: "ActiveEffect.conc", origin: concentrationArt.uuid }]]) },
    getFlag(s, k) { return this.flags[s]?.[k]; }, async setFlag(s, k, v) { this.flags[s][k] = v; },
    async update(changes) { for (const [path, value] of Object.entries(changes)) { const parts = path.split("."); let cursor = this; for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {}; cursor[parts.at(-1)] = value; } return this; },
    testUserPermission(user, permission) { return permission === "OWNER" && (user.isGM || (["p1", "p2"].includes(user.id) && this.ownerEnabled !== false)); },
    async rollConcentration(config, _dialog, message) {
      this.rollConfig = config; this.rollCalls = (this.rollCalls ?? 0) + 1;
      const rolls = this.gatedRoll ? await this.gatedRoll : this.cancel ? null : [{ total: 17, options: config.rolls[0].options }];
      if (rolls?.length) await ChatMessage.implementation.create({ content: "Concentration Save", speaker: { actor: this.id }, rolls,
        flags: { dnd5e: { messageType: "roll", roll: { type: "save", ability: this.unrelatedRoll ? "wis" : "con" } },
          ak5e: this.unrelatedRoll ? {} : message?.data?.flags?.ak5e ?? {} } });
      return rolls;
    } };
  documents.set(target.uuid, target);
  const weaponMessage = { id: "weapon-damage", uuid: "ChatMessage.weapon-damage", name: "Heavy Strike", flags: { dnd5e: { item: { type: "weapon" } } } };
  await concentrationBreakerEvent({ actorUuid: target.uuid, sourceActorUuid: actor.uuid, amount: 32, eventId: "damage-1", raw: { message: weaponMessage } });
  let receipt = target.flags.ak5e.defenderConcentrationBreakers[0];
  assert.equal(receipt.damageName, "Heavy Strike", "weapon damage also qualifies");
  assert.equal(receipt.saveDc, 16);
  assert.equal(receipt.needsConfirmation, false);
  await rollConcentrationBreaker(target, receipt.id);
  assert.equal(target.rollConfig.target, 16);
  assert.equal(target.rollConfig.rolls[0].options.disadvantage, true);
  assert.equal(target.rollConfig.rolls[0].options.ak5eConcentrationBreaker, receipt.id);
  assert.equal(target.flags.ak5e.defenderConcentrationBreakers[0].status, "rolled");
  await assert.rejects(rollConcentrationBreaker(target, receipt.id), /pending/);

  await concentrationBreakerEvent({ actorUuid: target.uuid, sourceActorUuid: actor.uuid, amount: 8, eventId: "damage-2", raw: { message: weaponMessage } });
  receipt = target.flags.ak5e.defenderConcentrationBreakers.find(r => r.id === "damage-2");
  target.cancel = true;
  const result = await rollConcentrationBreaker(target, receipt.id);
  assert.deepEqual(result, { cancelled: true, consumed: false });
  assert.equal(target.flags.ak5e.defenderConcentrationBreakers.find(r => r.id === receipt.id).status, "pending", "cancel does not consume the receipt");
  target.cancel = false;
  target.unrelatedRoll = true;
  await assert.rejects(rollConcentrationBreaker(target, receipt.id), /did not create an authenticated Concentration Save/);
  assert.equal(target.flags.ak5e.defenderConcentrationBreakers.find(r => r.id === receipt.id).status, "pending", "an unrelated native save does not consume the receipt");
  target.unrelatedRoll = false;
  // A matching message created before the claim cannot satisfy the later save.
  const staleMarked = await ChatMessage.implementation.create({ content: "old concentration save", speaker: { actor: target.id }, rolls: [{ total: 18 }],
    flags: { dnd5e: { messageType: "roll", roll: { type: "save", ability: "con" } }, ak5e: { defenderConcentrationBreakerReceipt: receipt.id } } });
  assert.ok(staleMarked);
  let finishRoll;
  target.gatedRoll = new Promise(resolve => { finishRoll = resolve; });
  const callsBefore = target.rollCalls ?? 0;
  const inProgress = rollConcentrationBreaker(target, receipt.id);
  await new Promise(resolve => setImmediate(resolve));
  const activeClaimId = target.flags.ak5e.defenderConcentrationBreakers.find(r => r.id === receipt.id).claim.id;
  const forged = await ChatMessage.implementation.create({ content: "forged", speaker: { actor: "other-actor" }, rolls: [{ total: 17 }],
    flags: { dnd5e: { roll: { type: "save", ability: "con" } }, ak5e: { defenderConcentrationBreakerReceipt: receipt.id } } });
  const submitRaw = async (caller, request) => {
    game.user = game.users.find(user => user.id === caller);
    return ChatMessage.implementation.create({ content: "Concentration Breaker request", whisper: ["gm", caller], flags: { ak5e: { defenderConcentrationBreakerRequest: request } } });
  };
  const forgedFinish = await submitRaw("p1", { actorUuid: target.uuid, id: "forged-finish", command: "finish",
    data: { confirmation: true, receiptId: receipt.id, claimId: activeClaimId, messageUuid: forged.uuid } });
  assert.equal(forgedFinish.flags.ak5e.defenderConcentrationBreakerResponse.ok, false, "GM rejects a marked roll from another Actor");
  assert.match(forgedFinish.flags.ak5e.defenderConcentrationBreakerResponse.error, /evaluated native Concentration Save/);
  const staleFinish = await submitRaw("p1", { actorUuid: target.uuid, id: "stale-finish", command: "finish",
    data: { confirmation: true, receiptId: receipt.id, claimId: activeClaimId, messageUuid: staleMarked.uuid } });
  assert.equal(staleFinish.flags.ak5e.defenderConcentrationBreakerResponse.ok, false, "GM rejects an otherwise valid marked save created before the claim");
  const secondClientClaim = await submitRaw("p2", { actorUuid: target.uuid, id: "second-client-claim", command: "claim",
    data: { confirmation: true, receiptId: receipt.id, claimId: "client-two-claim", confirmArtConcentration: false } });
  assert.equal(secondClientClaim.flags.ak5e.defenderConcentrationBreakerResponse.ok, false, "a second client cannot claim a receipt during the first native dialog");
  assert.match(secondClientClaim.flags.ak5e.defenderConcentrationBreakerResponse.error, /already rolling/);
  game.user = game.users.find(user => user.id === "p1");
  await assert.rejects(rollConcentrationBreaker(target, receipt.id), /already in progress/);
  assert.equal(target.rollCalls, callsBefore + 1, "double-click opens exactly one native roll");
  finishRoll([{ total: 14, options: target.rollConfig.rolls[0].options }]);
  assert.equal((await inProgress).consumed, true);
  assert.equal(target.flags.ak5e.defenderConcentrationBreakers.find(r => r.id === receipt.id).status, "rolled");
  target.gatedRoll = null;

  await concentrationBreakerEvent({ actorUuid: target.uuid, sourceActorUuid: actor.uuid, amount: 5, eventId: "damage-recast" });
  const recastReceipt = target.flags.ak5e.defenderConcentrationBreakers.find(r => r.id === "damage-recast");
  target.concentration.effects = new Map([["recast", { uuid: "ActiveEffect.recast", origin: concentrationArt.uuid }]]);
  await assert.rejects(rollConcentrationBreaker(target, recastReceipt.id), /concentration ended/);
  assert.equal(target.flags.ak5e.defenderConcentrationBreakers.find(r => r.id === recastReceipt.id).status, "expired",
    "a later concentration from the same Item does not validate an old receipt");
  target.concentration.items.clear(); target.concentration.effects.clear();
});

test("Concentration Breaker only accepts actual positive damage from an eligible Artshield and gates target ownership", async () => {
  const documents = boot();
  const actor = await configured(artshield({ level: 9 })); documents.set(actor.uuid, actor);
  const low = await configured(artshield({ level: 8 })); low.uuid = "Actor.low"; low.id = "low"; documents.set(low.uuid, low);
  const target = { uuid: "Actor.target", documentName: "Actor", isOwner: true, flags: { ak5e: {} }, getFlag(s, k) { return this.flags[s]?.[k]; }, async setFlag(s, k, v) { this.flags[s][k] = v; } };
  documents.set(target.uuid, target);
  await concentrationBreakerEvent({ actorUuid: target.uuid, sourceActorUuid: actor.uuid, amount: 0, eventId: "zero" });
  await concentrationBreakerEvent({ actorUuid: target.uuid, sourceActorUuid: low.uuid, amount: 3, eventId: "low" });
  await concentrationBreakerEvent({ actorUuid: target.uuid, sourceActorUuid: "Actor.unknown", amount: 3, eventId: "unknown" });
  assert.equal(target.flags.ak5e.defenderConcentrationBreakers, undefined);
  await concentrationBreakerEvent({ actorUuid: target.uuid, sourceActorUuid: actor.uuid, amount: 3, eventId: "unknown-concentration" });
  const receipt = target.flags.ak5e.defenderConcentrationBreakers[0];
  assert.equal(receipt.needsConfirmation, true);
  target.ownerEnabled = false;
  await assert.rejects(rollConcentrationBreaker(target, receipt.id, null, { confirmArtConcentration: true }), /owner or the GM/);
});

test("Reactive Defence notifies owners of an Artshield with the caster in Reach, and the Reaction is once per trigger", async () => {
  const documents = boot();
  const actor = await configured(artshield({ level: 9, res: 6 }));
  const { enemy, scene } = mapWorld(documents, actor, { enemyCol: 1 });
  const activity = { isSpell: true, actor: enemy, uuid: "Activity.1", item: { type: "spell" } };
  await reactiveDefenceNotice(activity, {}, { message: { id: "m1" } });
  assert.equal(game.messages.length, 1);
  assert.match(game.messages[0].content, /Reactive Defence/);
  await reactiveDefenceNotice(activity, {}, { message: { id: "m1" } });
  assert.equal(game.messages.length, 1, "no duplicate notice");
  enemy.getActiveTokens()[0].x = 950;
  await reactiveDefenceNotice({ ...activity, uuid: "Activity.2" }, {}, { message: { id: "m2" } });
  assert.equal(game.messages.length, 1, "outside Reach");
  await reactiveDefenceNotice({ ...activity, isSpell: false, item: { type: "weapon" } }, {}, { message: { id: "m3" } });
  assert.equal(game.messages.length, 1, "not an Art");
  const data = { triggerId: "cast1", hostileConfirmed: true, reachConfirmed: true };
  await assert.rejects(defenderCommand(actor, "reactiveDefence", { ...data, hostileConfirmed: false }, "r0"), /Confirm/);
  await defenderCommand(actor, "reactiveDefence", data, "r1");
  await assert.rejects(defenderCommand(actor, "reactiveDefence", data, "r2"), /No Reaction available/);
  assert.equal(reachFeet(actor), 5);
  assert.ok(scene);
});

test("Stormchaser: half of Physical DR rounded up, level 12 only", async () => {
  boot();
  const actor = await configured(artshield({ level: 12 }));
  assert.equal((await defenderCommand(actor, "stormchaser", { physicalReduction: 5 }, "d1")).reduction, 3);
  assert.equal((await defenderCommand(actor, "stormchaser", { physicalReduction: 0 }, "d2")).reduction, 0);
  await assert.rejects(defenderCommand(actor, "stormchaser", { physicalReduction: -1 }, "d3"), /Physical/);
  await assert.rejects(defenderCommand(await configured(artshield({ level: 11 })), "stormchaser", { physicalReduction: 4 }, "d4"), /level 12/);
});

test("Leaping Ward records only the triggering Art, refunds its actual Reaction once, and expires at Turn end", async () => {
  const documents = boot();
  const actor = await configured(artshield({ level: 12, res: 6 }));
  const { ally } = mapWorld(documents, actor);
  const data = { triggerId: "save1", allyActorUuid: ally.uuid, damageTypes: ["fire", "fire", "cold"], saveConfirmed: true, rangeConfirmed: true, moveConfirmed: true };
  game.combat = null;
  await assert.rejects(defenderCommand(actor, "leapingWard", data, "w0"), /start the combat/);
  game.combat = { started: true, uuid: "Combat.c1", round: 1, turn: 1, combatant: { id: "enemy", actor: { uuid: "Actor.enemy" } } };
  await assert.rejects(defenderCommand(actor, "leapingWard", { ...data, damageTypes: [] }, "w1"), /damage types/);
  const result = await defenderCommand(actor, "leapingWard", data, "w2");
  assert.equal(result.effects, 0);
  assert.equal([...actor.effects.values()].filter(e => e.changes?.some(c => c.key === "system.traits.dr.value")).length, 0);
  assert.equal([...ally.effects.values()].length, 0, "no blanket damage-type Resistance Active Effect is created");
  assert.match(result.instruction, /triggering Art/);
  const refunded = await defenderCommand(actor, "leapingWardRefund", { wardOperationId: "w2" }, "wr1");
  assert.equal(refunded.refunded, true);
  assert.equal(resilience(actor).value, 5);
  await assert.rejects(defenderCommand(actor, "leapingWardRefund", { wardOperationId: "w2" }, "wr2"), /already regained/);
  // Ends with that Turn.
  game.user.isGM = true; game.actors.set(actor.id, actor);
  await expireWards({ combatUuid: "Combat.c1", round: 1, combatantId: "other" });
  assert.equal(actor.flags.ak5e.defender.ward.operationId, "w2", "a different Turn's end does not expire the receipt");
  await expireWards({ combatUuid: "Combat.c1", round: 1, combatantId: "enemy" });
  assert.equal([...ally.effects.values()].length, 0);
  assert.equal(actor.flags.ak5e.defender.ward, null);
  game.combat.combatant = { id: "next", actor: { uuid: "Actor.other" } };
  await assert.rejects(defenderCommand(actor, "leapingWardRefund", { wardOperationId: "w2" }, "wr3"), /current Leaping Ward/);
});

test("Eye of the Storm: Reaction, once per Long Rest, up to 20 ft, template, ends at the end of the next Turn", async () => {
  const documents = boot();
  const actor = await configured(artshield({ level: 15, res: 6 }));
  const { scene, allyToken } = mapWorld(documents, actor, { allyCol: 2 });
  game.combat = { started: true, uuid: "Combat.c1", round: 1, turn: 1, combatant: { id: "enemy", actor: { uuid: "Actor.enemy" } } };
  const data = { triggerId: "cast1", radius: 20, reactionConfirmed: true };
  await assert.rejects(defenderCommand(actor, "eyeOfTheStorm", { ...data, radius: 25 }, "e0"), /up to 20/);
  await assert.rejects(defenderCommand(actor, "eyeOfTheStorm", { ...data, reactionConfirmed: false }, "e1"), /Confirm/);
  const result = await defenderCommand(actor, "eyeOfTheStorm", data, "e2");
  assert.equal(result.inside, 3, "the Artshield and the creatures within 20 ft");
  assert.equal([...scene.templates.values()].length, 1);
  assert.deepEqual([...scene.templates.values()][0].flags.ak5e.eyeOfTheStorm.actorUuid, actor.uuid);
  assert.equal(actor.flags.ak5e.resourcePools.eyeOfTheStorm.value, 0);
  await assert.rejects(defenderCommand(actor, "eyeOfTheStorm", { ...data, triggerId: "cast2" }, "e3"), /spent/);
  documents.set(actor.uuid, actor);
  const end = (round, id = "m1") => ({ kind: "turnEnd", actorUuid: actor.uuid, combatUuid: "Combat.c1", round, combatantId: id });
  game.combat = turn(actor); // the Artshield's own Turn: the barrier armed during another Turn lasts "until the end of your next Turn"
  await defenderTurnEvent(end(1));
  assert.equal(actor.flags.ak5e.defender.barrier.active, false);
  assert.equal([...scene.templates.values()].length, 0, "the template is removed");
  await defenderRest(actor, "long");
  assert.ok(allyToken);
});

test("Eye of the Storm armed on the Artshield's own Turn lasts through its next Turn, and a Long Rest restores it", async () => {
  const documents = boot();
  const actor = await configured(artshield({ level: 15, res: 6 }));
  const { scene } = mapWorld(documents, actor);
  documents.set(actor.uuid, actor);
  game.combat = turn(actor);
  await defenderCommand(actor, "eyeOfTheStorm", { triggerId: "own", radius: 10, reactionConfirmed: true }, "e1");
  await defenderTurnEvent({ kind: "turnEnd", actorUuid: actor.uuid, combatUuid: "Combat.c1", round: 1, combatantId: "m1" });
  assert.equal(actor.flags.ak5e.defender.barrier.active, true, "the same Turn's end does not end it");
  game.combat = { ...turn(actor), round: 2 };
  await defenderTurnEvent({ kind: "turnEnd", actorUuid: actor.uuid, combatUuid: "Combat.c1", round: 2, combatantId: "m1" });
  assert.equal(actor.flags.ak5e.defender.barrier.active, false);
  await defenderRest(actor, "long");
  actor.flags.ak5e.resourcePools.eyeOfTheStorm = { value: 1 };
  assert.equal([...scene.templates.values()].length, 0);
});

test("Eye sweep lists Art-origin effects inside; only the GM can end them", async () => {
  const documents = boot();
  const actor = await configured(artshield({ level: 15, res: 6 }));
  const { ally } = mapWorld(documents, actor);
  game.combat = turn(actor); documents.set(actor.uuid, actor);
  await defenderCommand(actor, "eyeOfTheStorm", { triggerId: "t", radius: 20, reactionConfirmed: true }, "e1");
  const spell = { type: "spell", uuid: "Item.spell" }; documents.set(spell.uuid, spell);
  ally.effects.set("fx", { id: "fx", name: "Slow", origin: "Item.spell", async delete() { ally.effects.delete("fx"); } });
  ally.effects.set("fy", { id: "fy", name: "Rage", origin: null, async delete() { ally.effects.delete("fy"); } });
  const listed = await defenderCommand(actor, "eyeSweep", {}, "s1");
  assert.deepEqual(listed.found, ["allyT: Slow"]);
  await assert.rejects(defenderCommand(actor, "eyeSweep", { remove: true }, "s2"), /Only the GM/);
  game.user.isGM = true;
  const removed = await defenderCommand(actor, "eyeSweep", { remove: true }, "s3");
  assert.equal(removed.removed, 1);
  assert.deepEqual([...ally.effects.keys()], ["fy"], "non-Art effects are untouched");
  const noBarrier = await configured(artshield({ level: 15 }));
  await assert.rejects(defenderCommand(noBarrier, "eyeSweep", {}, "s4"), /No barrier/);
});

test("a Long Rest removes the Eye of the Storm template from the map", async () => {
  const documents = boot();
  const actor = await configured(artshield({ level: 15, res: 6 }));
  const { scene } = mapWorld(documents, actor);
  documents.set(actor.uuid, actor);
  game.combat = turn(actor);
  await defenderCommand(actor, "eyeOfTheStorm", { triggerId: "t", radius: 10, reactionConfirmed: true }, "e1");
  assert.equal([...scene.templates.values()].length, 1);
  await defenderRest(actor, "short");
  assert.equal([...scene.templates.values()].length, 1, "a Short Rest does not end it");
  await defenderRest(actor, "long");
  assert.equal([...scene.templates.values()].length, 0);
  assert.equal(actor.flags.ak5e.defender.barrier.active, false);
});
