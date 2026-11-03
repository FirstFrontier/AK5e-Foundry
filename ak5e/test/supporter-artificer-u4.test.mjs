/**
 * U4: Supporter base class and Artificer fixes. Implementer tests (the challenger's adversarial suite is separate).
 *
 * Covers: GM relay revert validation and value ranges, GM recompute of Automaton statistics, Advanced Aid Temporary HP
 * ceiling and allowance, the Advanced Aid crit rider judging an already-rolled attack, escaped names on chat cards,
 * progression (Tool/Vehicle, no re-apply, warnings for unchosen levels, rollback, serial lock), real token distance and the
 * B-302 Cancel handling of the details prompt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import * as Features from "../scripts/supporter-features.mjs";
import * as Uses from "../scripts/supporter-uses.mjs";
import * as Artificer from "../scripts/artificer-features.mjs";
import { SUPPORTER_CLASS_ID, pbForLevel } from "../scripts/supporter-rules.mjs";
import { tokenDistanceFeet } from "../scripts/supporter-measure.mjs";
import { supporterSerial } from "../scripts/supporter-lock.mjs";
import { previewSupporterSetup, applySupporterSetup } from "../scripts/supporter-setup.mjs";
import { previewSupporterProgression, applySupporterProgression } from "../scripts/supporter-progression.mjs";
import { handleSupporterCommand } from "../scripts/supporter-sheet.mjs";

let docs;
const { supporterUses } = Uses;

test.beforeEach(() => {
  setupFoundryGlobals({ worldTime: 100 });
  docs = new Map();
  globalThis.fromUuidSync = uuid => docs.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => docs.get(uuid) ?? null;
  Features.defineSupporterPools();
  Artificer.defineArtificerPools();
  try { Uses.registerSupporterPlans({ plans: Artificer.artificerPlans, readings: Artificer.artificerReadings }); }
  catch (error) { if (!/already registered/i.test(String(error?.message ?? error))) throw error; }
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

/* ---------------------------------------------------------------- fixtures */

function artificer({ level = 13, name = "Artificer" } = {}) {
  const sClass = createTestItem({ name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } } });
  const sub = createTestItem({ name: "Supporter: Artificer", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-artificer" } } });
  const actor = createTestActor({
    name, type: "character", owner: true, items: [sClass, sub],
    system: {
      attributes: { prof: pbForLevel(level), hp: { value: 30, max: 30, temp: 0 } },
      abilities: { int: { mod: 3, value: 16 }, wis: { mod: 0, value: 10 }, cha: { mod: 0, value: 10 }, con: { mod: 0, value: 10 }, dex: { mod: 0, value: 10 }, str: { mod: 0, value: 10 } },
      skills: { ak5etech: { total: 5, value: 1 } },
      traits: { weaponProf: { custom: "" }, toolProf: { custom: "" } }
    },
    flags: { ak5e: { supporter: { enabled: true, branch: "artificer", aidAbility: "int" } } }
  });
  docs.set(actor.uuid, actor);
  return actor;
}

function plainActor(name = "Bystander", hp = 30) {
  const actor = createTestActor({ name, type: "npc", owner: true, hp: { value: hp, max: hp, temp: 0 } });
  docs.set(actor.uuid, actor);
  return actor;
}

function automaton(creatorUuid, { hp = 25, destroyed = false, name = "Automaton" } = {}) {
  const actor = createTestActor({ name, type: "npc", owner: true, hp: { value: hp, max: 25, temp: 0 },
    flags: { ak5e: { automaton: { creator: creatorUuid, variant: "platform", destroyed, exempt: false } } } });
  docs.set(actor.uuid, actor);
  return actor;
}

function seedReceipt(source, receipt) {
  const state = source.flags.ak5e.supporterUses ?? { undo: [], data: {} };
  state.undo = [...(state.undo ?? []), { status: "complete", summary: "", ...receipt }];
  source.flags.ak5e.supporterUses = state;
}

const relay = (source, command, useId, targetUuid) => supporterUses.relayedTargetChange(source, command, { useId, targetUuid }, game.user);

const fieldsEntry = (target, set, before) => ({ kind: "artificerFields", uuid: target.uuid, name: target.name, ready: true, set, before });

/* ----------------------------------------------- relay revert validation (HIGH) */

test("a forged receipt cannot make the GM relay revert hit points on an Actor that is not an Automaton", async () => {
  const source = artificer();
  const foe = plainActor("Hostile", 30);
  seedReceipt(source, { id: "forged-1", command: "rebuildAutomaton",
    targets: [fieldsEntry(foe, { "system.attributes.hp.value": 25 }, { "system.attributes.hp.value": 1 })] });
  await assert.rejects(() => relay(source, "revert", "forged-1", foe.uuid), /not one this use can reverse/);
  assert.equal(foe.system.attributes.hp.value, 30, "nothing was written");
});

test("a forged revert of another Artificer's setup fields (target is a different Actor) is refused", async () => {
  const source = artificer();
  const other = artificer({ name: "Other" });
  seedReceipt(source, { id: "forged-2", command: "artificerSetup",
    targets: [fieldsEntry(other, { "system.traits.weaponProf.custom": "Heavy Melee Weapons" }, { "system.traits.weaponProf.custom": "pwned" })] });
  await assert.rejects(() => relay(source, "revert", "forged-2", other.uuid), /not one this use can reverse/);
  assert.equal(other.system.traits.weaponProf.custom, "");
});

test("a forged revert that restores hit points above the Automaton's maximum is refused", async () => {
  const source = artificer();
  const auto = automaton(source.uuid, { hp: 5 });
  seedReceipt(source, { id: "forged-3", command: "rebuildAutomaton",
    targets: [fieldsEntry(auto, { "system.attributes.hp.value": 25 }, { "system.attributes.hp.value": 9999 })] });
  await assert.rejects(() => relay(source, "revert", "forged-3", auto.uuid), /not one this use can reverse/);
  assert.equal(auto.system.attributes.hp.value, 5);
});

test("a genuine rebuild reverts through the relay on the Automaton it recorded", async () => {
  const source = artificer();
  const auto = automaton(source.uuid, { hp: 25, destroyed: false });
  seedReceipt(source, { id: "genuine-1", command: "rebuildAutomaton",
    targets: [fieldsEntry(auto, { "flags.ak5e.automaton.destroyed": false, "system.attributes.hp.value": 25 }, { "flags.ak5e.automaton.destroyed": true, "system.attributes.hp.value": 0 })] });
  await relay(source, "revert", "genuine-1", auto.uuid);
  assert.equal(auto.system.attributes.hp.value, 0, "the recorded before state is restored");
});

test("the fields validator refuses Automaton paths on the Artificer itself and on an unflagged Actor", () => {
  const source = artificer();
  const plain = plainActor();
  const set = { "system.attributes.hp.value": 25 }, before = { "system.attributes.hp.value": 0 };
  const validate = Artificer.artificerPlans.rebuildAutomaton.validateTarget;
  assert.equal(validate(source, {}, fieldsEntry(source, set, before), source), false, "the Artificer itself");
  assert.equal(validate(source, {}, fieldsEntry(plain, set, before), plain), false, "an unflagged Actor");
  const own = automaton(source.uuid);
  assert.equal(validate(source, {}, fieldsEntry(own, set, before), own), true, "its own Automaton");
});

test("out-of-range and mistyped field values are refused", () => {
  const source = artificer();
  const validate = Artificer.artificerPlans.artificerSetup.validateTarget;
  const entry = (path, value, was) => fieldsEntry(source, { [path]: value }, { [path]: was });
  assert.equal(validate(source, {}, entry("system.skills.ak5etech.value", 1, 0), source), true);
  assert.equal(validate(source, {}, entry("system.skills.ak5etech.value", 99, 0), source), false, "skill value out of range");
  assert.equal(validate(source, {}, entry("system.traits.weaponProf.custom", "x".repeat(501), ""), source), false, "text too long");
  assert.equal(validate(source, {}, entry("system.traits.weaponProf.custom", 7, ""), source), false, "text must be a string");
});

/* ------------------------------------------------ Automaton stats recomputed (MED) */

test("Automaton statistics come from the Artificer's sheet, not from the client", () => {
  const source = artificer({ level: 5 });
  const stats = Artificer.automatonStatsFor(source, "intMod");
  assert.equal(stats.hpMax, Artificer.AUTOMATON_BASE_HP + 3, "25 + the INT modifier reading");
  assert.equal(stats.pb, pbForLevel(5));
  assert.equal(stats.attackBonus, 3 + pbForLevel(5), "INT + PB");
  assert.throws(() => Artificer.automatonStatsFor(source, "free"), /Technology Modifier/, "an unknown reading is refused");
  assert.throws(() => Artificer.automatonStatsFor(source, undefined), /Technology Modifier/);
});

test("the built Automaton data uses the recomputed numbers whatever a client claims", () => {
  const source = artificer({ level: 5 });
  const honest = Artificer.automatonStatsFor(source, "intMod");
  const data = Artificer.automatonActorData(source, { variant: "platform", automatonId: "A".repeat(16), stats: honest });
  assert.equal(data.system.attributes.hp.max, honest.hpMax);
  assert.throws(() => Artificer.automatonActorData(source, { variant: "platform", automatonId: "A".repeat(16), stats: { hpMax: "lots", pb: 2, attackBonus: 1 } }), /incomplete/);
});

/* ----------------------------------------------- Advanced Aid Temporary HP (MED) */

async function rolledAidUse(actor, { rollType, roll, pb = 3, id = "aid-1", createdAt = 1000 }) {
  seedReceipt(actor, { id, command: "useAidDie", createdAt, roll, result: { rollType, pb } });
  return id;
}

test("the Advanced Aid Temporary HP allowance is the roll, plus PB for a Saving Throw (C3 Advanced Aid)", () => {
  assert.equal(Uses.aidTempHPAllowance({ roll: 5, result: { rollType: "save", pb: 3 } }), 8);
  assert.equal(Uses.aidTempHPAllowance({ roll: 5, result: { rollType: "healing", pb: 3 } }), 5);
  assert.equal(Uses.aidTempHPAllowance({ roll: 5, result: { rollType: "attack", pb: 3 } }), null, "no Temporary HP for an attack roll");
  assert.equal(Uses.aidTempHPAllowance({ result: { rollType: "save" } }), null, "not rolled yet");
});

test("a Temporary HP grant above the absolute ceiling is refused by the plan", async () => {
  const actor = artificer({ level: 5 });
  await assert.rejects(() => supporterUses.execute(actor, "aidTempHP", { targetUuid: actor.uuid, targetName: actor.name, amount: 19 }, "ceil-1"), /never grants more than/);
});

test("Temporary HP above what the Aid Die rolled warns on the grant (and applies with Use anyway)", async () => {
  const actor = artificer({ level: 5 });
  const useId = await rolledAidUse(actor, { rollType: "healing", roll: 4 });
  let big = null;
  try { big = await supporterUses.plan(actor, "aidTempHP", { targetUuid: actor.uuid, targetName: actor.name, amount: 9, useId }); }
  catch (error) { big = error; }
  assert.ok(big.warnings?.some(w => w.id === "exceedsRoll"), "warns that 9 is more than the roll of 4");
  const ok = await supporterUses.plan(actor, "aidTempHP", { targetUuid: actor.uuid, targetName: actor.name, amount: 4, useId });
  assert.equal(ok.warnings.length, 0, "the exact roll does not warn");
  await supporterUses.execute(actor, "aidTempHP", { targetUuid: actor.uuid, targetName: actor.name, amount: 9, useId, overrides: ["exceedsRoll"] }, "tmp-anyway");
  assert.equal(actor.system.attributes.hp.temp, 9, "Use anyway still applies (warn, never block)");
});

const tempHpReceipt = (stranger, id, amount, parentUseId) => ({ id, command: "aidTempHP", parentUseId, result: { amount },
  targets: [{ uuid: stranger.uuid, name: stranger.name, kind: "tempHP", amount, mode: "replace", ready: true }] });

test("the relay applies Temporary HP the giver's own Aid Die roll allows, and refuses more or an unlinked grant", async () => {
  const giver = artificer({ level: 5 });
  const stranger = plainActor("Stranger");
  await rolledAidUse(giver, { rollType: "healing", roll: 4, id: "aid-2" });
  seedReceipt(giver, tempHpReceipt(stranger, "tmp-ok", 4, "aid-2"));
  seedReceipt(giver, tempHpReceipt(stranger, "tmp-big", 12, "aid-2"));
  seedReceipt(giver, tempHpReceipt(stranger, "tmp-free", 3, undefined));
  await assert.rejects(() => relay(giver, "apply", "tmp-big", stranger.uuid), /not one this use can make/, "more than the roll");
  await assert.rejects(() => relay(giver, "apply", "tmp-free", stranger.uuid), /not one this use can make/, "no Aid Die behind it");
  assert.equal(stranger.system.attributes.hp.temp, 0, "nothing written by the refused grants");
  await relay(giver, "apply", "tmp-ok", stranger.uuid);
  assert.equal(stranger.system.attributes.hp.temp, 4, "the allowed grant applies");
});

/* ------------------------------------------------- crit rider on a rolled attack */

test("attackRollSince finds the actor's latest attack made after the Aid Die use and reads its d20", () => {
  const actor = artificer({ level: 5 });
  const message = (time, natural, speaker = actor.id, type = "attack") => ({
    timestamp: time, speaker: { actor: speaker }, flags: { dnd5e: { roll: { type } } },
    rolls: [{ options: { criticalSuccess: 20 }, isCritical: natural === 20, dice: [{ faces: 20, results: [{ result: natural, active: true }] }] }]
  });
  const messages = [message(500, 20), message(1500, 19), message(2000, 7, "someoneElse"), message(2500, 4, actor.id, "damage")];
  const found = Uses.attackRollSince(actor, 1000, messages);
  assert.equal(found.natural, 19, "the attack after the Aid Die use, ignoring other speakers and non-attack rolls");
  assert.equal(found.threshold, 20);
  assert.equal(found.critical, false);
  assert.equal(Uses.attackRollSince(actor, 3000, messages), null, "no attack after the use");
  assert.equal(Uses.attackRollSince(actor, undefined, messages), null, "no timestamp, no guess");
});

test("the crit rider states the verdict for an attack already rolled and arms nothing for the next attack", async () => {
  const actor = artificer({ level: 5 });
  seedReceipt(actor, { id: "aid-crit", command: "useAidDie", createdAt: 1000, result: { rollType: "attack" } });
  game.messages.push({ timestamp: Date.now() + 1000, speaker: { actor: actor.id }, flags: { dnd5e: { roll: { type: "attack" } } },
    rolls: [{ options: { criticalSuccess: 20 }, isCritical: false, dice: [{ faces: 20, results: [{ result: 19, active: true }] }] }] });
  const receipt = await supporterUses.execute(actor, "aidCritRider", { useId: "aid-crit" }, "crit-rolled");
  const stored = supporterUses.receipt(actor, "crit-rolled");
  assert.equal(stored.result.appliedTo, "rolledAttack");
  assert.match(stored.summary, /now a critical hit \(natural 19/);
  assert.equal((stored.targets ?? []).length, 0, "no rider is armed for the next attack");
  assert.ok(receipt);
});

test("the crit rider still waits for the next attack when none has been rolled yet", async () => {
  const actor = artificer({ level: 5 });
  seedReceipt(actor, { id: "aid-crit-2", command: "useAidDie", createdAt: 1000, result: { rollType: "attack" } });
  await supporterUses.execute(actor, "aidCritRider", { useId: "aid-crit-2" }, "crit-next");
  const stored = supporterUses.receipt(actor, "crit-next");
  assert.equal(stored.result.appliedTo, "nextAttack");
  assert.equal(stored.targets[0].kind, "aidRider");
});

/* ----------------------------------------------------------- escaped names */

test("Concussive Maintenance and As One cards escape actor and Automaton names", async () => {
  const source = artificer({ level: 13, name: "<img src=x onerror=alert(1)>" });
  const auto = automaton(source.uuid, { name: "<script>bad()</script>" });
  source.flags.ak5e.artificer = { automatons: [auto.uuid] };
  const plan = Artificer.artificerPlans.concussiveMaintenance(source, supporterUses.state(source), { automatonUuid: auto.uuid });
  const receipt = { id: "esc-1" };
  await plan.apply({}, receipt, null);
  assert.equal(receipt.html, true, "the summary is inserted as HTML");
  assert.equal(receipt.summary.includes("<script>"), false, "no raw script tag in the summary");
  assert.equal(receipt.summary.includes("<img"), false, "no raw img tag in the summary");
  assert.ok(receipt.summary.includes("&lt;script&gt;"), "the Automaton name is shown escaped");
});

/* ------------------------------------------------------------ progression */

function createSupporter(level = 1) {
  const sClass = createTestItem({ name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } } });
  const actor = createTestActor({
    items: [sClass],
    system: {
      attributes: { hp: { value: 8, max: 8, temp: 0 }, prof: pbForLevel(level) },
      abilities: { str: { value: 10, mod: 0 }, dex: { value: 14, mod: 2 }, con: { value: 14, mod: 2 }, int: { value: 12, mod: 1 }, wis: { value: 12, mod: 1 }, cha: { value: 16, mod: 3 } },
      traits: { saves: { value: [] }, armorProf: { value: [] }, weaponProf: { value: [] }, toolProf: { value: [] } },
      skills: { arc: { value: 0 }, ak5elore: { value: 0 }, ak5etech: { value: 0 }, ins: { value: 0 }, dec: { value: 0 }, per: { value: 0 } },
      currency: { cp: 0 }
    }
  });
  docs.set(actor.uuid, actor);
  return actor;
}

const level1Choices = (extra = {}) => ({
  branch: "subclass-supporter-artificer", saves: ["con", "wis"], skills: ["ak5etech", "ins", "dec"], aidAbility: "wis",
  startingEquipment: { mode: "cash" }, hp: { 1: { mode: "fixed", roll: 6 } }, ...extra
});

test("progression writes the chosen Tool Kit or Vehicle proficiency", async () => {
  const actor = createSupporter(1);
  const choices = level1Choices({ tool: "Vehicle" });
  const preview = await previewSupporterProgression(actor, choices);
  assert.match(String(preview.writes["system.traits.toolProf.custom"]), /Vehicle/);
  await applySupporterProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices });
  assert.match(String(actor.system.traits.toolProf.custom), /Vehicle/);
});

test("a level already applied is not applied again when its Hit Points are picked a second time", async () => {
  const actor = createSupporter(1);
  const choices = level1Choices();
  const preview = await previewSupporterProgression(actor, choices);
  await applySupporterProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices });
  const max = actor.system.attributes.hp.max;
  const again = await previewSupporterProgression(actor, { hp: { 1: { mode: "fixed", roll: 6 } } });
  assert.equal(again.writes["system.attributes.hp.max"], undefined, "no second Hit Point increase");
  assert.ok(again.warnings.some(w => /already applied/.test(String(w.text ?? w))), "the re-pick is explained");
  assert.equal(actor.system.attributes.hp.max, max);
});

test("a level with no Hit Point choice is kept and the preview says so", async () => {
  const actor = createSupporter(2);
  const preview = await previewSupporterProgression(actor, { hp: { 1: { mode: "fixed", roll: 6 } } });
  assert.ok(preview.warnings.some(w => /Level 2 Hit Points were not chosen/.test(String(w.text ?? w))));
  assert.equal(preview.warnings.some(w => /Level 1 Hit Points were not chosen/.test(String(w.text ?? w))), false, "level 1 was chosen");
});

test("when the Actor update fails, the Items the progression created are removed again", async () => {
  const actor = createSupporter(1);
  const choices = level1Choices();
  const preview = await previewSupporterProgression(actor, choices);
  const before = Array.from(actor.items.values?.() ?? actor.items).length;
  const original = actor.update.bind(actor);
  actor.update = async () => { throw new Error("database write refused"); };
  await assert.rejects(() => applySupporterProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices }), /database write refused/);
  actor.update = original;
  const after = Array.from(actor.items.values?.() ?? actor.items).length;
  assert.equal(after, before, "no orphaned Items remain");
  assert.equal(actor.flags.ak5e?.supporterProgress, undefined, "no progression record claims the levels");
});

test("two overlapping setups create each feature once", async () => {
  const actor = createSupporter(3);
  const preview = await previewSupporterSetup(actor);
  const results = await Promise.allSettled([
    applySupporterSetup(actor, { confirmed: true, contextKey: preview.contextKey }),
    applySupporterSetup(actor, { confirmed: true, contextKey: preview.contextKey })
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1, "the second sees the first's items and is refused");
  const names = Array.from(actor.items.values?.() ?? actor.items).map(i => i.name).filter(name => name !== "Supporter");
  assert.equal(new Set(names).size, names.length, "no feature was created twice");
});

test("the serial lock runs one task at a time per Actor and keeps going after a failure", async () => {
  const actor = createSupporter(1);
  const order = [];
  const first = supporterSerial(actor, async () => { order.push("a-start"); await new Promise(r => setTimeout(r, 10)); order.push("a-end"); throw new Error("a failed"); });
  const second = supporterSerial(actor, async () => { order.push("b"); return "b"; });
  await assert.rejects(() => first, /a failed/);
  assert.equal(await second, "b");
  assert.deepEqual(order, ["a-start", "a-end", "b"]);
});

/* ------------------------------------------------------------ real distance */

test("tokenDistanceFeet measures between two placed Actors and never returns 0 for a missing token", () => {
  const grid = { distance: 5, size: 100, measurePath: ([from, to]) => ({ distance: Math.hypot(to.x - from.x, to.y - from.y) * 5 / 100 }) };
  const token = (uuid, x, y) => ({ actor: { uuid }, document: { x, y, width: 1, height: 1 }, getCenterPoint: () => ({ x, y }) });
  const tokens = [token("Actor.a", 0, 0), token("Actor.b", 300, 400)];
  assert.equal(tokenDistanceFeet("Actor.a", "Actor.b", { tokens, grid }), 25, "300/400 offset is 500 px = 25 ft");
  assert.equal(tokenDistanceFeet("Actor.a", "Actor.missing", { tokens, grid }), undefined, "an unplaced token is unknown, not 0");
  assert.equal(tokenDistanceFeet("Actor.a", "Actor.a", { tokens, grid }), undefined);
});

/* ------------------------------------------------------- B-302 Cancel handling */

test("B-302: a details prompt that reads nothing resolves to Cancel, not to the button action", async () => {
  const actor = artificer({ level: 5 });
  foundry.applications = { api: { DialogV2: {
    // Foundry resolves a callback that returns null or undefined to the action name, "ok".
    prompt: async options => (await options.ok.callback(null, { form: { elements: {} } })) ?? "ok",
    wait: async () => "confirm",
    confirm: async () => true
  } } };
  const before = JSON.stringify(actor.flags.ak5e.supporterUses ?? null);
  const result = await handleSupporterCommand(actor, "useAidDie");
  assert.equal(result, null, "no roll type was chosen, so nothing is used");
  assert.equal(JSON.stringify(actor.flags.ak5e.supporterUses ?? null), before, "no use was recorded");
});
