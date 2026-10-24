import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor
} from "./base-classes-fixture.mjs";
import { SUPPORTER_CLASS_ID } from "../scripts/supporter-rules.mjs";
import {
  SUPPORTER_ARTS_TABLES, supporterArtsRow, supporterArtsPoolCount, supporterSpellSaveDC, supporterArtsMembers,
  previewSupporterArts, applySupporterArts, syncSupporterArts
} from "../scripts/supporter-arts.mjs";
import { hexerArtsPlans, hexerArtsApi, registerHexerArtsHooks, hexerArtsPanel } from "../scripts/hexer-arts.mjs";
import { supporterUses, registerSupporterPlans } from "../scripts/supporter-uses.mjs";
import { standardPools } from "../scripts/caster-rules.mjs";

// Registers the Hexer plan with the Supporter engine once for this file (the head composes it into the branch later).
registerSupporterPlans({ plans: hexerArtsPlans, readings: {} });

const EXPECTED_ROWS = [
  [1, 1, 3], [2, 1, 3], [3, 1, 4], [4, 1, 4],
  [5, 2, 6], [6, 2, 6], [7, 2, 7], [8, 2, 7],
  [9, 3, 10], [10, 3, 10], [11, 3, 11], [12, 3, 11],
  [13, 4, 12], [14, 4, 12], [15, 4, 15], [16, 4, 15],
  [17, 5, 16], [18, 5, 16], [19, 5, 17], [20, 5, 17]
];
const POOL_A = "standard-art-pool-flame-arts-3917";
const POOL_B = "standard-art-pool-frost-arts-5418";
const poolMembers = id => supporterArtsMembers(id);
// AK5e records and pool listings differ in capitalisation (e.g. "Protect from Cold" / "Protect From Cold"): compare by key.
const keyOf = name => String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

test.beforeEach(() => { setupFoundryGlobals(); });
test.afterEach(() => { teardownFoundryGlobals(); });

function createHexer({ level = 11, casting = null, abilities = {} } = {}) {
  const classItem = { name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } } };
  const actor = createTestActor({
    name: "Hexer Test", type: "character", items: [classItem],
    flags: { ak5e: { supporter: { enabled: true, branch: "hexer", aidAbility: "cha" }, ...(casting ? { casting } : {}) } },
    abilities: { int: { value: 12, mod: 1 }, wis: { value: 14, mod: 2 }, cha: { value: 16, mod: 3 }, ...abilities }
  });
  return actor;
}
const classOf = actor => [...actor.items.values()].find(item => item.type === "class");
const spellsOf = actor => [...actor.items.values()].filter(item => item.type === "spell");
const names = actor => spellsOf(actor).map(item => item.name).sort();

test("every Hexer Arts Casting row matches the source table (C3:7254-7279)", () => {
  for (const [level, maxArt, ap] of EXPECTED_ROWS) {
    assert.deepEqual(supporterArtsRow("hexer", level), { level, maxArtLevel: maxArt, artsPoints: ap }, `row ${level}`);
    assert.equal(SUPPORTER_ARTS_TABLES.hexer[level].artsPoints, ap);
  }
  assert.equal(Object.keys(SUPPORTER_ARTS_TABLES.hexer).length, 20);
  assert.throws(() => supporterArtsRow("hexer", 0), /1 to 20/);
  assert.throws(() => supporterArtsRow("hexer", 21), /1 to 20/);
  assert.throws(() => supporterArtsRow("hexer", 2.5), /1 to 20/);
  assert.throws(() => supporterArtsRow("bard", 3), /No Supporter Arts table/);
});

test("Ritualist and Summoner are not in the table: their printed tables carry extra columns", () => {
  assert.equal(SUPPORTER_ARTS_TABLES.ritualist, undefined);
  assert.equal(SUPPORTER_ARTS_TABLES.summoner, undefined);
});

test("the Hexer holds one Standard Arts Pool at level 10 and two from level 11", () => {
  assert.equal(supporterArtsPoolCount("hexer", 1), 1);
  assert.equal(supporterArtsPoolCount("hexer", 10), 1);
  assert.equal(supporterArtsPoolCount("hexer", 11), 2);
  assert.equal(supporterArtsPoolCount("hexer", 20), 2);
});

test("spell save DC is 8 + Proficiency Bonus + the chosen ability modifier, and null until an ability is chosen", () => {
  const actor = createHexer({ level: 11, casting: { ability: "cha", enabled: true } });
  const prof = Number(actor.system.attributes.prof);
  assert.equal(supporterSpellSaveDC(actor), 8 + prof + 3);
  actor.flags.ak5e.casting.ability = "wis";
  assert.equal(supporterSpellSaveDC(actor), 8 + prof + 2);
  actor.flags.ak5e.casting.ability = "int";
  assert.equal(supporterSpellSaveDC(actor), 8 + prof + 1);
  actor.flags.ak5e.casting = { enabled: true, ability: "" };
  assert.equal(supporterSpellSaveDC(actor), null);
  assert.equal(hexerArtsApi.spellSaveDC(actor), null);
});

test("preview is read-only and reports the ability and pool still to choose", async () => {
  const actor = createHexer({ level: 5 });
  const plan = await previewSupporterArts(actor, { branch: "hexer", poolIds: [POOL_A] });
  assert.deepEqual(plan.pending, ["ability"]);
  const none = await previewSupporterArts(actor, { branch: "hexer", ability: "cha" });
  assert.deepEqual(none.pending, ["pool"]);
  assert.equal(spellsOf(actor).length, 0);
  assert.equal(actor.flags.ak5e?.artsPoints, undefined);
});

test("apply at level 11 writes the AP maximum, the maximum Art level and only 5th-level-or-less Arts of the pool, all Prepared", async () => {
  const actor = createHexer({ level: 11 });
  const members = poolMembers(POOL_A);
  const result = await applySupporterArts(actor, { branch: "hexer", ability: "cha", poolIds: [POOL_A], confirmed: true });
  assert.equal(actor.flags.ak5e.artsPoints.maximum, 11);
  assert.equal(actor.flags.ak5e.artsPoints.maximumArtLevel, 3);
  assert.equal(actor.flags.ak5e.artsPoints.value, 11, "a new setup starts at the maximum");
  assert.equal(actor.flags.ak5e.casting.ability, "cha");
  assert.equal(actor.flags.ak5e.casting.enabled, true);
  assert.ok(result.warnings.some(warning => warning.id === "second-pool"), "the second pool is missing: a warning, not a block");
  const granted = spellsOf(actor);
  assert.ok(granted.length > 0);
  for (const item of granted) {
    const member = members.find(entry => keyOf(entry.name) === keyOf(item.name));
    assert.ok(member, `${item.name} belongs to the pool`);
    assert.ok(member.level <= 5, `${item.name} is 5th level or less`);
    assert.equal(item.system.prepared, 2, `${item.name} is Prepared`);
    assert.equal(item.flags.ak5e.supporterArts.pool, POOL_A);
    assert.equal(item.flags.ak5e.supporterArts.branch, "hexer");
  }
  const eligible = new Set(members.map(entry => keyOf(entry.name)));
  assert.equal(granted.length + result.missing.length, eligible.size, "every eligible Art is granted or reported missing; none invented");
  assert.ok(!granted.some(item => members.find(entry => keyOf(entry.name) === keyOf(item.name))?.level > 5));
});

test("a confirmed apply is never blocked by warnings: one pool at 11th Level applies and reports the missing second pool", async () => {
  const actor = createHexer({ level: 11 });
  const result = await applySupporterArts(actor, { branch: "hexer", ability: "cha", poolIds: [POOL_A], confirmed: true });
  assert.ok(result.warnings.some(warning => warning.id === "second-pool"));
  assert.equal(actor.flags.ak5e.artsPoints.maximum, 11);
  assert.ok(spellsOf(actor).length > 0);
});

test("a confirmed apply with the same pool chosen twice applies it once and warns", async () => {
  const actor = createHexer({ level: 11 });
  const result = await applySupporterArts(actor, { branch: "hexer", ability: "cha", poolIds: [POOL_A, POOL_A], confirmed: true });
  assert.ok(result.warnings.some(warning => warning.id === "duplicate-pool"));
  assert.equal(new Set(names(actor)).size, names(actor).length, "no duplicate Arts");
  assert.ok(spellsOf(actor).length > 0);
  assert.equal(actor.flags.ak5e.supporterArtsSetup.pools.length, 1, "the pool is recorded once");
});

test("re-applying the same setup creates nothing new", async () => {
  const actor = createHexer({ level: 11 });
  await applySupporterArts(actor, { branch: "hexer", ability: "cha", poolIds: [POOL_A], confirmed: true });
  const before = names(actor);
  const again = await applySupporterArts(actor, { branch: "hexer", ability: "cha", poolIds: [POOL_A], confirmed: true });
  assert.deepEqual(again.createdIds, []);
  assert.deepEqual(names(actor), before, "no duplicate Arts");
});

test("cancelling (no confirmation) changes nothing", async () => {
  const actor = createHexer({ level: 11 });
  await assert.rejects(applySupporterArts(actor, { branch: "hexer", ability: "cha", poolIds: [POOL_A], confirmed: false }), /Confirm/);
  assert.equal(spellsOf(actor).length, 0);
  assert.equal(actor.flags.ak5e?.artsPoints, undefined);
  assert.equal(actor.flags.ak5e?.casting, undefined);
});

test("changing the pool removes only the Arts this setup granted and keeps the others", async () => {
  const actor = createHexer({ level: 11 });
  await applySupporterArts(actor, { branch: "hexer", ability: "cha", poolIds: [POOL_A], confirmed: true });
  await actor.createEmbeddedDocuments("Item", [{ name: "Homebrew Bolt", type: "spell", system: { level: 1, prepared: 1 }, flags: {} }]);
  const memberA = new Set(poolMembers(POOL_A).map(entry => keyOf(entry.name)));
  const memberB = new Set(poolMembers(POOL_B).map(entry => keyOf(entry.name)));
  const grantedA = names(actor).filter(name => name !== "Homebrew Bolt");
  const plan = await previewSupporterArts(actor, { branch: "hexer", ability: "cha", poolIds: [POOL_B] });
  assert.ok(plan.warnings.some(warning => warning.id === "remove"));
  const result = await applySupporterArts(actor, { branch: "hexer", ability: "cha", poolIds: [POOL_B], confirmed: true });
  const left = names(actor);
  assert.ok(left.includes("Homebrew Bolt"), "a hand-added Art is never removed");
  for (const name of grantedA) {
    if (memberB.has(keyOf(name))) assert.ok(left.includes(name), `${name} is in both pools and stays`);
    else assert.ok(!left.includes(name), `${name} came from the old pool and is removed`);
  }
  assert.ok(result.removed.length > 0, "a pool change removes the old pool's Arts");
  assert.ok(result.removed.every(name => memberA.has(keyOf(name)) && !memberB.has(keyOf(name))));
  for (const item of spellsOf(actor).filter(entry => entry.flags?.ak5e?.supporterArts)) assert.equal(item.flags.ak5e.supporterArts.pool, POOL_B);
});

test("a level change re-syncs the AP maximum and maximum Art level; a second pool is prompted at 11th Level, never granted", async () => {
  const actor = createHexer({ level: 5 });
  await applySupporterArts(actor, { branch: "hexer", ability: "cha", poolIds: [POOL_A], confirmed: true });
  assert.equal(actor.flags.ak5e.artsPoints.maximum, 6);
  const posted = [];
  const original = ChatMessage.implementation.create;
  ChatMessage.implementation.create = async data => { posted.push(data); return data; };
  try {
    classOf(actor).system.levels = 11;
    const up = await syncSupporterArts(actor, "hexer");
    assert.equal(up.maximum, 11);
    assert.equal(actor.flags.ak5e.artsPoints.maximum, 11);
    assert.equal(actor.flags.ak5e.artsPoints.maximumArtLevel, 3);
    assert.equal(up.prompted, true);
    assert.equal(posted.length, 1, "one whispered prompt");
    assert.ok(spellsOf(actor).some(item => item.flags.ak5e.supporterArts), "the setup's Arts are still in place");
    const again = await syncSupporterArts(actor, "hexer");
    assert.equal(again.prompted, false, "no repeat prompt");
    assert.equal(posted.length, 1);
    classOf(actor).system.levels = 9;
    const down = await syncSupporterArts(actor, "hexer");
    assert.equal(actor.flags.ak5e.artsPoints.maximum, 10);
    assert.equal(actor.flags.ak5e.artsPoints.maximumArtLevel, 3);
    assert.equal(down.prompted, false);
  } finally { ChatMessage.implementation.create = original; }
});

test("sync does nothing before a setup exists", async () => {
  const actor = createHexer({ level: 5 });
  const result = await syncSupporterArts(actor, "hexer");
  assert.equal(result.changed, false);
  assert.equal(actor.flags.ak5e?.artsPoints, undefined);
});

test("the play-uses plan warns about the missing second pool, applies after Use anyway, and undo restores the prior state", async () => {
  const actor = createHexer({ level: 11 });
  await assert.rejects(
    supporterUses.command(actor, "configureHexerArts", { confirmed: true, ability: "cha", poolIds: [POOL_A] }, "hexarts-op1"),
    error => error.name === "AK5eWarnings" && error.warnings.some(warning => warning.id === "second-pool")
  );
  assert.equal(spellsOf(actor).length, 0, "a warning writes nothing");
  const result = await supporterUses.command(actor, "configureHexerArts", { confirmed: true, ability: "cha", poolIds: [POOL_A], overrides: ["second-pool"] }, "hexarts-op2");
  assert.ok(result.granted.length > 0);
  assert.equal(actor.flags.ak5e.artsPoints.maximum, 11);
  assert.ok(spellsOf(actor).length > 0);
  await supporterUses.command(actor, "undoUse", { useId: "hexarts-op2" }, "hexarts-undo");
  assert.equal(spellsOf(actor).length, 0, "undo removes the granted Arts");
  assert.equal(actor.flags.ak5e.artsPoints, undefined, "undo restores the prior AP flags");
});

test("the panel shows the ability, pool, AP, maximum Art level and the Configure button", async () => {
  const actor = createHexer({ level: 11 });
  await applySupporterArts(actor, { branch: "hexer", ability: "cha", poolIds: [POOL_A], confirmed: true });
  const html = hexerArtsPanel(actor);
  assert.match(html, /data-supporter-cmd="configureHexerArts"/);
  assert.match(html, /Charisma/);
  assert.match(html, /Flame Arts/);
  assert.match(html, /11 \/ 11/);
});

test("registerHexerArtsHooks is idempotent and syncs the Hexer on a level change made by its owner", async () => {
  const registered = [];
  const original = globalThis.Hooks;
  globalThis.Hooks = { on: (name, fn) => registered.push([name, fn]), off() {}, call() {}, callAll() {} };
  try {
    registerHexerArtsHooks();
    registerHexerArtsHooks();
    const updates = registered.filter(([name]) => name === "updateItem");
    assert.equal(updates.length, 1, "registered once");
    const actor = createHexer({ level: 5 });
    await applySupporterArts(actor, { branch: "hexer", ability: "cha", poolIds: [POOL_A], confirmed: true });
    const item = classOf(actor);
    item.actor = actor; // Foundry sets item.actor on embedded Items; the fixture only sets parent
    item.system.levels = 7;
    updates[0][1](item, { system: { levels: 7 } }, {}, game.user.id);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(actor.flags.ak5e.artsPoints.maximum, 7, "AP maximum for level 7 is 7");
    assert.equal(actor.flags.ak5e.artsPoints.maximumArtLevel, 2);
  } finally { globalThis.Hooks = original; }
});

test("the frozen API carries preview, apply, sync, row and spellSaveDC for the Hexer only", async () => {
  assert.ok(Object.isFrozen(hexerArtsApi));
  assert.deepEqual(Object.keys(hexerArtsApi).sort(), ["apply", "preview", "row", "spellSaveDC", "sync"]);
  const actor = createHexer({ level: 3 });
  assert.deepEqual(hexerArtsApi.row(3), { level: 3, maxArtLevel: 1, artsPoints: 4 });
  const plan = await hexerArtsApi.preview(actor, { ability: "wis", poolIds: [POOL_A] });
  assert.equal(plan.level, 3);
  const bard = createTestActor({ name: "Bard", type: "character", items: [{ name: "Supporter", type: "class", system: { levels: 3 }, flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } } }] });
  await assert.rejects(hexerArtsApi.apply(bard, { ability: "wis", poolIds: [POOL_A], confirmed: true }), /Hexer feature/);
});

test("the Hexer plan refuses a non-Hexer and needs an ability and a pool before a use is recorded", () => {
  const notHexer = createTestActor({ name: "Plain", type: "character", items: [{ name: "Supporter", type: "class", system: { levels: 3 }, flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } } }] });
  assert.throws(() => hexerArtsPlans.configureHexerArts(notHexer, {}, { ability: "cha", poolIds: [POOL_A] }), /Hexer Supporter feature/);
  const actor = createHexer({ level: 3 });
  assert.throws(() => hexerArtsPlans.configureHexerArts(actor, {}, { poolIds: [POOL_A] }), /spellcasting ability/);
  assert.throws(() => hexerArtsPlans.configureHexerArts(actor, {}, { ability: "cha" }), /Standard Arts Pool/);
  assert.throws(() => hexerArtsPlans.configureHexerArts(actor, {}, { ability: "cha", poolIds: [POOL_A, POOL_A] }), /different/);
  assert.equal(standardPools.some(pool => pool.id === POOL_A), true);
});
