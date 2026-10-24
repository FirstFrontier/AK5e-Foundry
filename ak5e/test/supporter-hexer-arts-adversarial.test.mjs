/**
 * U3 adversarial challenge suite: Hexer Arts setup (Supporter branch).
 *
 * Behavior-level tests written from the source (AK5e 1.3.1 Ch.3, Hexer, L7223-7330; "C3:NNNN" cites the
 * source line) and head ruling 8 in ak5e/DECISIONS.md ("Supporter Class and Artificer / Bard / Hexer
 * Branches"). Written against the U3 contract in supporter-arts.mjs and hexer-arts.mjs. Those modules may not
 * exist yet, so every implementation module is loaded with a dynamic import inside the test that needs it: a
 * missing module fails only its own tests. Many tests are expected to FAIL until the implementation lands.
 *
 * Oracles (AP table, pool membership, PB, ability modifiers) come from the source text and from the
 * standardPools data in caster-rules.mjs. They are never read from the implementation under test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import { standardPools } from "../scripts/caster-rules.mjs";

/* ==========================================================================
   Oracles
   ========================================================================== */

// C3:7254-7279 Hexer Arts Casting table, [maximumArtLevel, artsPoints] for each Supporter level 1-20.
const SOURCE_TABLE = Object.freeze({
  1: [1, 3], 2: [1, 3], 3: [1, 4], 4: [1, 4],
  5: [2, 6], 6: [2, 6], 7: [2, 7], 8: [2, 7],
  9: [3, 10], 10: [3, 10], 11: [3, 11], 12: [3, 11],
  13: [4, 12], 14: [4, 12], 15: [4, 15], 16: [4, 15],
  17: [5, 16], 18: [5, 16], 19: [5, 17], 20: [5, 17]
});
// Supporter Proficiency Bonus column (same column the Aid Die tests use): +2 at 1-4, +3 at 5-8, +4 at 9-12, +5 at 13-16, +6 at 17-20.
const pbOf = level => Math.floor((level - 1) / 4) + 2;

const POOL_CORROSION = "standard-art-pool-corrosion-arts-407";
const POOL_CRUDE = "standard-art-pool-crude-arts-1064";
const POOL_FLAME = "standard-art-pool-flame-arts-3917";
const POOL_FROST = "standard-art-pool-frost-arts-5418";

// C3:7281 "any Cantrips from those Pools" and "Arts of 5th Level or less": every member of level 0-5 is expected.
function poolMembers(poolId) {
  const pool = standardPools.find(entry => entry.id === poolId);
  assert.ok(pool, `standard pool ${poolId} exists in caster-rules standardPools`);
  return pool.members;
}
const expectedFromPools = poolIds => poolIds.flatMap(id => poolMembers(id).filter(m => m.level <= 5));
const cantripsOf = poolIds => poolIds.flatMap(id => poolMembers(id).filter(m => m.level === 0));

/* ==========================================================================
   Harness
   ========================================================================== */

// Roll stub: any evaluation is a failure. Counted, and asserted to be zero in every test that uses it.
const rollEvaluations = { count: 0 };
class ForbiddenRoll {
  constructor(formula) { this.formula = formula; }
  async evaluate() { rollEvaluations.count++; throw new Error(`Roll.evaluate must never be called (formula ${this.formula})`); }
}

async function supporterArts() { return import("../scripts/supporter-arts.mjs"); }
async function hexerArts() { return import("../scripts/hexer-arts.mjs"); }
async function supporterUses() { return import("../scripts/supporter-uses.mjs"); }
async function supporterRules() { return import("../scripts/supporter-rules.mjs"); }

test.beforeEach(() => {
  setupFoundryGlobals();
  globalThis.Roll = ForbiddenRoll;
  rollEvaluations.count = 0;
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

/** A Supporter with the Hexer branch (or another branch) at `level`. Abilities default to int +3, wis +1, cha +2. */
function supporter({ level = 1, branch = "hexer", abilities = {}, flags = {}, extraItems = [] } = {}) {
  const mods = { str: -1, dex: 0, con: 0, int: 3, wis: 1, cha: 2, ...abilities };
  const subclassId = { hexer: "subclass-supporter-hexer", bard: "subclass-supporter-bard", artificer: "subclass-supporter-artificer" }[branch];
  const items = [
    createTestItem({ name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-supporter" } } }),
    ...(subclassId ? [createTestItem({ name: branch[0].toUpperCase() + branch.slice(1), type: "subclass", flags: { ak5e: { chapterThreeId: subclassId } } })] : []),
    ...extraItems
  ];
  const abilityBlock = {};
  for (const [key, mod] of Object.entries(mods)) abilityBlock[key] = { mod, value: 10 + 2 * mod };
  const actor = createTestActor({
    name: `${branch} L${level}`, level, items, abilities: abilityBlock,
    hp: { value: 20, max: 20, temp: 0 },
    flags: { ak5e: { supporter: { enabled: true, branch }, ...flags } }
  });
  actor.system.attributes ??= {};
  actor.system.attributes.prof = pbOf(level);
  return actor;
}

const classItem = actor => [...actor.items.values()].find(item => item.type === "class");
const setLevel = (actor, level) => { classItem(actor).system.levels = level; actor.level = level; };
const flagOf = (actor, key) => actor.flags?.ak5e?.[key];
const allItems = actor => [...actor.items.values()];
const taggedSpells = actor => allItems(actor).filter(item => item.type === "spell" && item.flags?.ak5e?.supporterArts);
const spellNames = actor => allItems(actor).filter(item => item.type === "spell").map(item => item.name);

/** Hand-added Art: a spell Item with no supporterArts tag, as a player would add from the compendium. */
function handAdded(name = "Hand-Added Art", level = 1) {
  return createTestItem({ name, type: "spell", system: { level, prepared: 1, properties: [], materials: {} }, flags: {} });
}

/** Run fn and capture the outcome instead of letting a rejection escape. */
async function settle(fn) {
  try { return { threw: false, value: await fn() }; } catch (error) { return { threw: true, error }; }
}
const hasWarnings = value => Array.isArray(value?.warnings) ? value.warnings.length > 0 : Boolean(value?.warnings);

/** Snapshot of everything setup may write, used to prove "nothing changed". */
function snapshot(actor) {
  return JSON.stringify({
    flags: actor.flags?.ak5e ?? {},
    items: allItems(actor).map(item => ({ id: item.id, name: item.name, type: item.type, flags: item.flags, system: item.system }))
  });
}

/* ==========================================================================
   Tests: table and rows
   ========================================================================== */

test("Hexer Arts table: every level 1-20 row matches C3:7254-7279", async () => {
  const { SUPPORTER_ARTS_TABLES } = await supporterArts();
  assert.ok(SUPPORTER_ARTS_TABLES?.hexer, "SUPPORTER_ARTS_TABLES.hexer is exported");
  for (let level = 1; level <= 20; level++) {
    const [maxArtLevel, artsPoints] = SOURCE_TABLE[level];
    assert.deepEqual({ maxArtLevel: SUPPORTER_ARTS_TABLES.hexer[level].maxArtLevel, artsPoints: SUPPORTER_ARTS_TABLES.hexer[level].artsPoints },
      { maxArtLevel, artsPoints }, `Hexer level ${level}`);
  }
});

test("supporterArtsRow('hexer', level) agrees with the printed table at every boundary and in between", async () => {
  const { supporterArtsRow } = await supporterArts();
  for (const level of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
    const row = supporterArtsRow("hexer", level);
    const [maxArtLevel, artsPoints] = SOURCE_TABLE[level];
    assert.equal(row.maxArtLevel, maxArtLevel, `max Art level at ${level}`);
    assert.equal(row.artsPoints, artsPoints, `Arts Points at ${level}`);
  }
});

test("boundary 2/3: the 3rd level raises Arts Points from 3 to 4 but keeps max Art level 1 (C3:7254-7257)", async () => {
  const { supporterArtsRow } = await supporterArts();
  assert.deepEqual([supporterArtsRow("hexer", 2).artsPoints, supporterArtsRow("hexer", 3).artsPoints], [3, 4]);
  assert.equal(supporterArtsRow("hexer", 3).maxArtLevel, 1);
});

test("boundary 4/5: max Art level rises from 1 to 2 and AP from 4 to 6 at the 5th level (C3:7258-7261)", async () => {
  const { supporterArtsRow } = await supporterArts();
  assert.deepEqual([supporterArtsRow("hexer", 4).maxArtLevel, supporterArtsRow("hexer", 5).maxArtLevel], [1, 2]);
  assert.deepEqual([supporterArtsRow("hexer", 4).artsPoints, supporterArtsRow("hexer", 5).artsPoints], [4, 6]);
});

test("boundary 8/9: max Art level rises to 3 and AP to 10 at the 9th level (C3:7262-7267)", async () => {
  const { supporterArtsRow } = await supporterArts();
  assert.deepEqual([supporterArtsRow("hexer", 8).maxArtLevel, supporterArtsRow("hexer", 9).maxArtLevel], [2, 3]);
  assert.deepEqual([supporterArtsRow("hexer", 8).artsPoints, supporterArtsRow("hexer", 9).artsPoints], [7, 10]);
});

test("boundary 10/11: AP rises from 10 to 11 at the 11th level, max Art level stays 3 (C3:7266-7269)", async () => {
  const { supporterArtsRow } = await supporterArts();
  assert.deepEqual([supporterArtsRow("hexer", 10).artsPoints, supporterArtsRow("hexer", 11).artsPoints], [10, 11]);
  assert.equal(supporterArtsRow("hexer", 11).maxArtLevel, 3);
});

test("boundary 12/13: max Art level rises to 4 and AP to 12 at the 13th level (C3:7270-7273)", async () => {
  const { supporterArtsRow } = await supporterArts();
  assert.deepEqual([supporterArtsRow("hexer", 12).maxArtLevel, supporterArtsRow("hexer", 13).maxArtLevel], [3, 4]);
  assert.deepEqual([supporterArtsRow("hexer", 12).artsPoints, supporterArtsRow("hexer", 13).artsPoints], [11, 12]);
});

test("boundary 14/15: AP jumps from 12 to 15 at the 15th level, max Art level stays 4 (C3:7274-7275)", async () => {
  const { supporterArtsRow } = await supporterArts();
  assert.deepEqual([supporterArtsRow("hexer", 14).artsPoints, supporterArtsRow("hexer", 15).artsPoints], [12, 15]);
  assert.equal(supporterArtsRow("hexer", 15).maxArtLevel, 4);
});

test("boundary 16/17: max Art level rises to 5 and AP to 16 at the 17th level (C3:7276-7277)", async () => {
  const { supporterArtsRow } = await supporterArts();
  assert.deepEqual([supporterArtsRow("hexer", 16).maxArtLevel, supporterArtsRow("hexer", 17).maxArtLevel], [4, 5]);
  assert.deepEqual([supporterArtsRow("hexer", 16).artsPoints, supporterArtsRow("hexer", 17).artsPoints], [15, 16]);
});

test("boundary 18/19: AP rises from 16 to 17 at the 19th level, max Art level stays 5 (C3:7278-7279)", async () => {
  const { supporterArtsRow } = await supporterArts();
  assert.deepEqual([supporterArtsRow("hexer", 18).artsPoints, supporterArtsRow("hexer", 19).artsPoints], [16, 17]);
  assert.equal(supporterArtsRow("hexer", 19).maxArtLevel, 5);
});

test("level 20: max Art level 5 and 17 Arts Points (C3:7279)", async () => {
  const { supporterArtsRow } = await supporterArts();
  assert.deepEqual(supporterArtsRow("hexer", 20), { maxArtLevel: 5, artsPoints: 17 });
});

test("pool count: one Standard Pool below level 11, two from level 11 (C3:7281)", async () => {
  const { supporterArtsPoolCount } = await supporterArts();
  assert.equal(supporterArtsPoolCount("hexer", 1), 1);
  assert.equal(supporterArtsPoolCount("hexer", 10), 1, "boundary 10: still one pool");
  assert.equal(supporterArtsPoolCount("hexer", 11), 2, "boundary 11: second pool");
  assert.equal(supporterArtsPoolCount("hexer", 20), 2);
});

/* ==========================================================================
   Tests: Spell Save DC
   ========================================================================== */

test("supporterSpellSaveDC = 8 + PB + the modifier of flags.ak5e.casting.ability, read from the chosen ability (not hard-coded)", async () => {
  const { supporterSpellSaveDC } = await supporterArts();
  const wisOnly = supporter({ level: 5, flags: { casting: { ability: "wis" } } });
  assert.equal(supporterSpellSaveDC(wisOnly), 8 + pbOf(5) + 1, "wis mod +1, PB +3 at 5th level");
  const intHigh = supporter({ level: 9, abilities: { int: 4 }, flags: { casting: { ability: "int" } } });
  assert.equal(supporterSpellSaveDC(intHigh), 8 + pbOf(9) + 4, "int mod +4, PB +4 at 9th level");
});

test("supporterSpellSaveDC follows a changed casting ability, not the one used earlier", async () => {
  const { supporterSpellSaveDC } = await supporterArts();
  const actor = supporter({ level: 1, flags: { casting: { ability: "int" } } });
  assert.equal(supporterSpellSaveDC(actor), 8 + pbOf(1) + 3);
  actor.flags.ak5e.casting.ability = "cha";
  assert.equal(supporterSpellSaveDC(actor), 8 + pbOf(1) + 2, "the DC tracks the current casting ability");
});

/* ==========================================================================
   Tests: preview and apply
   ========================================================================== */

test("ability 'str' is rejected or warned, and nothing is written", async () => {
  const { previewSupporterArts, applySupporterArts } = await supporterArts();
  const actor = supporter({ level: 5 });
  const before = snapshot(actor);
  const preview = await settle(() => previewSupporterArts(actor, { branch: "hexer", ability: "str", poolIds: [POOL_CORROSION] }));
  assert.ok(preview.threw || hasWarnings(preview.value), "str must be rejected or produce a warning");
  await settle(() => applySupporterArts(actor, { branch: "hexer", ability: "str", poolIds: [POOL_CORROSION], confirmed: true, contextKey: "str-1" }));
  assert.notEqual(flagOf(actor, "casting")?.ability, "str", "str is never stored as the casting ability");
  assert.equal(snapshot(actor), before, "a str attempt writes nothing");
});

test("only int, wis or cha can be the ability: each is accepted and stored under flags.ak5e.casting.ability", async () => {
  const { applySupporterArts } = await supporterArts();
  for (const ability of ["int", "wis", "cha"]) {
    const actor = supporter({ level: 1 });
    await applySupporterArts(actor, { branch: "hexer", ability, poolIds: [POOL_CORROSION], confirmed: true, contextKey: `ab-${ability}` });
    assert.equal(flagOf(actor, "casting")?.ability, ability, `${ability} is accepted`);
  }
});

test("a missing ability is handled without a write: no casting ability, no Arts granted", async () => {
  const { previewSupporterArts, applySupporterArts } = await supporterArts();
  const actor = supporter({ level: 3 });
  const before = snapshot(actor);
  const preview = await settle(() => previewSupporterArts(actor, { branch: "hexer", poolIds: [POOL_CORROSION] }));
  assert.ok(preview.threw || hasWarnings(preview.value) || (preview.value?.pending ?? []).includes("ability"),
    "a missing ability is reported as pending, a warning, or an error");
  await settle(() => applySupporterArts(actor, { branch: "hexer", poolIds: [POOL_CORROSION], confirmed: true, contextKey: "no-ability" }));
  assert.equal(flagOf(actor, "casting")?.ability, undefined, "no ability is invented");
  assert.equal(taggedSpells(actor).length, 0, "no Arts are granted without an ability");
  assert.equal(snapshot(actor), before, "a missing ability writes nothing");
});

test("unknown pool id is rejected with a clear error, and nothing is written", async () => {
  const { applySupporterArts } = await supporterArts();
  const actor = supporter({ level: 1 });
  const before = snapshot(actor);
  await assert.rejects(applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: ["standard-art-pool-does-not-exist"], confirmed: true, contextKey: "bad-pool" }),
    error => /pool/i.test(String(error?.message ?? error)), "error names the pool");
  assert.equal(snapshot(actor), before, "an unknown pool writes nothing");
});

test("invalid pool id mixed with a valid one is rejected as a whole", async () => {
  const { applySupporterArts } = await supporterArts();
  const actor = supporter({ level: 1 });
  const before = snapshot(actor);
  await assert.rejects(applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CORROSION, "not-a-pool"], confirmed: true, contextKey: "mixed" }));
  assert.equal(snapshot(actor), before, "the valid pool is not applied when the other id is invalid");
});

test("choosing no pool grants no Arts", async () => {
  const { applySupporterArts } = await supporterArts();
  const actor = supporter({ level: 1 });
  await settle(() => applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [], confirmed: true, contextKey: "no-pool" }));
  assert.equal(taggedSpells(actor).length, 0, "an empty pool choice grants nothing");
});

test("without confirmed, applying changes nothing", async () => {
  const { applySupporterArts } = await supporterArts();
  const actor = supporter({ level: 5 });
  const before = snapshot(actor);
  await settle(() => applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CORROSION], contextKey: "unconfirmed" }));
  assert.equal(snapshot(actor), before, "no confirmed flag, no change");
});

test("apply writes the AP maximum and max Art level from the table (level 9: 10 AP, max Art level 3)", async () => {
  const { applySupporterArts } = await supporterArts();
  const actor = supporter({ level: 9 });
  await applySupporterArts(actor, { branch: "hexer", ability: "wis", poolIds: [POOL_CORROSION], confirmed: true, contextKey: "ap-9" });
  assert.equal(flagOf(actor, "artsPoints").maximum, 10);
  assert.equal(flagOf(actor, "artsPoints").maximumArtLevel, 3);
});

test("apply at level 20 writes 17 AP and max Art level 5", async () => {
  const { applySupporterArts } = await supporterArts();
  const actor = supporter({ level: 20 });
  await applySupporterArts(actor, { branch: "hexer", ability: "cha", poolIds: [POOL_CORROSION], confirmed: true, contextKey: "ap-20" });
  assert.equal(flagOf(actor, "artsPoints").maximum, 17);
  assert.equal(flagOf(actor, "artsPoints").maximumArtLevel, 5);
});

test("apply grants every Art of 5th level or less and the cantrips of the chosen pool, never a higher Art", async () => {
  const { previewSupporterArts, applySupporterArts } = await supporterArts();
  const actor = supporter({ level: 5 });
  const preview = await previewSupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_FLAME] });
  await applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_FLAME], confirmed: true, contextKey: "flame-5" });
  const expected = expectedFromPools([POOL_FLAME]);
  const created = taggedSpells(actor);
  const createdNames = new Set(created.map(item => item.name));
  const reported = JSON.stringify(preview ?? {});
  // Every expected Art is either created or visibly reported as not yet resolvable; none is silently dropped.
  for (const member of expected) {
    assert.ok(createdNames.has(member.name) || reported.includes(member.name),
      `${member.name} (level ${member.level}) is granted or reported missing, never dropped`);
  }
  // No Art above 5th level is created even though Flame Arts holds 6th-9th level Arts.
  const levelOf = new Map(poolMembers(POOL_FLAME).map(m => [m.name, m.level]));
  for (const item of created) {
    assert.ok(item.system.level <= 5, `${item.name} granted at level ${item.system.level}`);
    assert.ok(levelOf.get(item.name) === undefined || levelOf.get(item.name) <= 5, `${item.name} is a level ${levelOf.get(item.name)} Art of the pool`);
  }
  const higher = poolMembers(POOL_FLAME).filter(m => m.level > 5).map(m => m.name);
  assert.ok(higher.length > 0, "Flame Arts holds 6th+ level Arts in the pool data (precondition)");
  assert.ok(!higher.some(name => createdNames.has(name)), "no 6th+ level Art of Flame Arts is granted");
});

test("cantrips of the chosen pool are included: each is created or reported, never dropped", async () => {
  const { previewSupporterArts, applySupporterArts } = await supporterArts();
  const actor = supporter({ level: 1 });
  const preview = await previewSupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CRUDE] });
  await applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CRUDE], confirmed: true, contextKey: "crude-cantrips" });
  const reported = JSON.stringify(preview ?? {});
  const createdNames = new Set(taggedSpells(actor).map(item => item.name));
  const cantrips = cantripsOf([POOL_CRUDE]);
  assert.ok(cantrips.length > 0, "Crude Arts has cantrips in the pool data");
  for (const cantrip of cantrips) {
    assert.ok(createdNames.has(cantrip.name) || reported.includes(cantrip.name), `cantrip ${cantrip.name} is granted or reported missing`);
  }
});

test("every granted Art is tagged flags.ak5e.supporterArts = {branch: 'hexer', pool} and is Prepared", async () => {
  const { applySupporterArts } = await supporterArts();
  const actor = supporter({ level: 3 });
  await applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_FROST], confirmed: true, contextKey: "tags" });
  const created = taggedSpells(actor);
  assert.ok(created.length > 0, "at least one Art is granted from Frost Arts");
  for (const item of created) {
    assert.deepEqual(item.flags.ak5e.supporterArts, { branch: "hexer", pool: POOL_FROST }, `${item.name} tag`);
    assert.equal(item.system.prepared, 2, `${item.name} is always Prepared (prepared: 2, as in the Guardian Arts setup)`);
  }
});

test("apply twice with the same contextKey creates no duplicates", async () => {
  const { applySupporterArts } = await supporterArts();
  const actor = supporter({ level: 5 });
  const data = { branch: "hexer", ability: "int", poolIds: [POOL_CORROSION], confirmed: true, contextKey: "same-key" };
  await applySupporterArts(actor, data);
  const first = spellNames(actor).slice().sort();
  assert.ok(first.length > 0, "the first apply grants Arts (precondition, so the duplicate check is not vacuous)");
  await applySupporterArts(actor, data);
  assert.deepEqual(spellNames(actor).slice().sort(), first, "the second apply adds nothing");
  assert.equal(new Set(first).size, first.length, "no name appears twice");
});

test("apply with a stale or different contextKey does not double the Arts already granted", async () => {
  const { applySupporterArts } = await supporterArts();
  const actor = supporter({ level: 5 });
  await applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CORROSION], confirmed: true, contextKey: "ctx-a" });
  const names = spellNames(actor).slice().sort();
  assert.ok(names.length > 0, "the first apply grants Arts (precondition)");
  await settle(() => applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CORROSION], confirmed: true, contextKey: "ctx-b" }));
  assert.deepEqual(spellNames(actor).slice().sort(), names, "a known Art is never duplicated, whatever the contextKey");
});

test("pool A then pool B: A's tagged Arts are removed, B's are present, and a hand-added untagged Art survives", async () => {
  const { applySupporterArts } = await supporterArts();
  const hand = handAdded("Hand-Added Art", 1);
  const actor = supporter({ level: 5, extraItems: [hand] });
  await applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CORROSION], confirmed: true, contextKey: "switch-a" });
  const aTagged = taggedSpells(actor).map(item => item.id);
  assert.ok(aTagged.length > 0, "pool A granted something to remove later");
  await applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CRUDE], confirmed: true, contextKey: "switch-b" });
  const remaining = taggedSpells(actor);
  assert.ok(remaining.every(item => item.flags.ak5e.supporterArts.pool === POOL_CRUDE), "only pool B tags remain");
  for (const id of aTagged) {
    assert.equal(remaining.some(item => item.id === id), false, `pool A item ${id} was removed`);
  }
  assert.ok(allItems(actor).some(item => item.id === hand.id), "the hand-added Art is not touched");
  assert.equal(flagOf(actor, "casting")?.ability, "int");
});

test("switching pools keeps a hand-added Art that has the same name as a pool A member", async () => {
  const { applySupporterArts } = await supporterArts();
  const sameName = poolMembers(POOL_CORROSION).find(m => m.level === 0);
  const hand = handAdded(sameName.name, 0);
  const actor = supporter({ level: 5, extraItems: [hand] });
  await applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CORROSION], confirmed: true, contextKey: "same-name-a" });
  await applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CRUDE], confirmed: true, contextKey: "same-name-b" });
  assert.ok(allItems(actor).some(item => item.id === hand.id && !item.flags?.ak5e?.supporterArts), "the player's own Art survives the pool switch");
});

test("changing the pool never removes a hand-added Art of any level", async () => {
  const { applySupporterArts } = await supporterArts();
  const hand5 = handAdded("Hand-Added Level 5 Art", 5);
  const actor = supporter({ level: 9, extraItems: [hand5] });
  await applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CORROSION], confirmed: true, contextKey: "keep-a" });
  await applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_FROST], confirmed: true, contextKey: "keep-b" });
  assert.ok(allItems(actor).some(item => item.id === hand5.id), "a hand-added level 5 Art is never removed");
});

test("at level 11+ with one pool only: apply succeeds and a warning is shown (not a block)", async () => {
  const { previewSupporterArts, applySupporterArts } = await supporterArts();
  const actor = supporter({ level: 11 });
  const preview = await settle(() => previewSupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CORROSION] }));
  assert.equal(preview.threw, false, "the preview does not block");
  assert.ok(hasWarnings(preview.value), "a second pool is suggested with a warning");
  const applied = await settle(() => applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CORROSION], confirmed: true, contextKey: "one-of-two" }));
  assert.equal(applied.threw, false, "the apply is not blocked");
  assert.equal(flagOf(actor, "artsPoints").maximum, 11);
  assert.ok(taggedSpells(actor).length > 0, "the first pool still grants its Arts");
});

test("at level 11+ choosing the same pool twice produces a warning and no duplicate Arts", async () => {
  const { previewSupporterArts, applySupporterArts } = await supporterArts();
  const actor = supporter({ level: 11 });
  const preview = await settle(() => previewSupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CORROSION, POOL_CORROSION] }));
  assert.equal(preview.threw, false, "the duplicate choice is warned, not thrown");
  assert.ok(hasWarnings(preview.value), "the same pool twice produces a warning");
  await settle(() => applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CORROSION, POOL_CORROSION], confirmed: true, contextKey: "twice" }));
  const names = spellNames(actor);
  assert.equal(new Set(names).size, names.length, "no Art is granted twice");
});

test("at level 11+ two distinct pools grant both pools' Arts and cantrips, each tagged with its own pool", async () => {
  const { applySupporterArts } = await supporterArts();
  const actor = supporter({ level: 11 });
  await applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CORROSION, POOL_CRUDE], confirmed: true, contextKey: "two-pools" });
  assert.equal(flagOf(actor, "artsPoints").maximum, 11);
  assert.equal(flagOf(actor, "artsPoints").maximumArtLevel, 3);
  const pools = new Set(taggedSpells(actor).map(item => item.flags.ak5e.supporterArts.pool));
  assert.ok(pools.has(POOL_CORROSION) && pools.has(POOL_CRUDE), "both pools are tagged");
  for (const item of taggedSpells(actor)) assert.ok(item.system.level <= 5, `${item.name} is 5th level or less`);
});

test.todo("two pools below level 11: block or warn? Source (C3:7281) only grants the second at 11th; the Guardian/rule-of-warn-not-block precedent suggests a warning, but the head has not ruled");

test("the Arts are granted against a configured Arts state and never touch existing hand-added spells of the same level", async () => {
  const { applySupporterArts } = await supporterArts();
  const hand = handAdded("Player Cure", 1);
  const actor = supporter({ level: 3, extraItems: [hand] });
  await applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CORROSION], confirmed: true, contextKey: "coexist" });
  const handStill = allItems(actor).find(item => item.id === hand.id);
  assert.ok(handStill, "the hand-added spell remains");
  assert.equal(handStill.name, "Player Cure");
  assert.equal(handStill.flags?.ak5e?.supporterArts, undefined, "it is not re-tagged");
});

/* ==========================================================================
   Tests: sync, plans, panel and API
   ========================================================================== */

test("syncSupporterArts follows the class level for the AP maximum and max Art level", async () => {
  const { syncSupporterArts } = await supporterArts();
  const actor = supporter({ level: 5, flags: { casting: { ability: "int" }, artsPoints: { maximum: 6, value: 3, maximumArtLevel: 2 } } });
  setLevel(actor, 9);
  await syncSupporterArts(actor, "hexer");
  assert.equal(flagOf(actor, "artsPoints").maximum, 10);
  assert.equal(flagOf(actor, "artsPoints").maximumArtLevel, 3);
});

test("lowering the level via sync lowers the AP maximum and max Art level", async () => {
  const { syncSupporterArts } = await supporterArts();
  const actor = supporter({ level: 13, flags: { casting: { ability: "int" }, artsPoints: { maximum: 12, value: 2, maximumArtLevel: 4 } } });
  setLevel(actor, 4);
  await syncSupporterArts(actor, "hexer");
  assert.equal(flagOf(actor, "artsPoints").maximum, 4, "level 4 has 4 AP");
  assert.equal(flagOf(actor, "artsPoints").maximumArtLevel, 1, "level 4 has max Art level 1");
});

test("syncSupporterArts never auto-grants a second pool at level 11", async () => {
  const { applySupporterArts, syncSupporterArts } = await supporterArts();
  const actor = supporter({ level: 10 });
  await applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CORROSION], confirmed: true, contextKey: "pre-11" });
  const pools = () => new Set(taggedSpells(actor).map(item => item.flags.ak5e.supporterArts.pool));
  const before = pools();
  setLevel(actor, 11);
  await syncSupporterArts(actor, "hexer");
  assert.equal(flagOf(actor, "artsPoints").maximum, 11, "the level-up is synced");
  assert.deepEqual([...pools()].sort(), [...before].sort(), "no second pool is chosen for the player");
});

test("the plan hexerArtsPlans.configureHexerArts needs isHexer and refuses a non-Hexer branch without crashing", async () => {
  const { hexerArtsPlans } = await hexerArts();
  const bard = supporter({ level: 5, branch: "bard" });
  const before = snapshot(bard);
  const outcome = await settle(async () => {
    const plan = hexerArtsPlans.configureHexerArts(bard, {}, { ability: "int", poolIds: [POOL_CORROSION] });
    return plan;
  });
  if (!outcome.threw) assert.equal(typeof outcome.value?.apply, "undefined", "a refused plan offers no apply");
  else assert.ok(!(outcome.error instanceof TypeError) && !(outcome.error instanceof ReferenceError),
    `refusal is a controlled error, not a ${outcome.error?.name}`);
  assert.equal(snapshot(bard), before, "a refused plan writes nothing");
});

test("the plan for a Hexer returns {title, warnings, apply}", async () => {
  const { hexerArtsPlans } = await hexerArts();
  const actor = supporter({ level: 5 });
  const plan = hexerArtsPlans.configureHexerArts(actor, {}, { ability: "int", poolIds: [POOL_CORROSION] });
  assert.equal(typeof plan.title, "string");
  assert.ok(Array.isArray(plan.warnings));
  assert.equal(typeof plan.apply, "function");
});

test("registerHexerArtsHooks is idempotent: a second call registers nothing new", async () => {
  const { registerHexerArtsHooks } = await hexerArts();
  let registrations = 0;
  globalThis.Hooks = { on: () => { registrations++; }, off() {}, once: () => { registrations++; }, callAll() {}, call() {} };
  registerHexerArtsHooks();
  const first = registrations;
  assert.ok(first > 0, "the first call registers at least one hook (precondition, so the idempotence check is not vacuous)");
  registerHexerArtsHooks();
  assert.equal(registrations, first, "the second call adds no hook");
});

test("hexerArtsPanel(actor) returns HTML with a configureHexerArts command button for a Hexer", async () => {
  const { hexerArtsPanel } = await hexerArts();
  const html = hexerArtsPanel(supporter({ level: 5 }));
  assert.equal(typeof html, "string");
  assert.match(html, /data-supporter-cmd="configureHexerArts"/);
});

test("hexerArtsApi exposes preview, apply, sync, row and spellSaveDC", async () => {
  const { hexerArtsApi } = await hexerArts();
  for (const name of ["preview", "apply", "sync", "row", "spellSaveDC"]) {
    assert.equal(typeof hexerArtsApi[name], "function", `hexerArtsApi.${name}`);
  }
  assert.deepEqual(hexerArtsApi.row(20), { maxArtLevel: 5, artsPoints: 17 });
});

test("undo of configureHexerArts restores the prior flags and removes the Arts it created", async () => {
  const { supporterUses: uses } = await supporterUses();
  const { registerHexerArtsHooks } = await hexerArts();
  registerHexerArtsHooks();
  const prior = { casting: { ability: "cha" }, artsPoints: { maximum: 4, value: 2, maximumArtLevel: 1 } };
  const actor = supporter({ level: 5, flags: structuredClone(prior) });
  const opId = "u3-undo-hexer";
  await uses.execute(actor, "configureHexerArts", { ability: "int", poolIds: [POOL_CORROSION], confirmed: true, contextKey: "undo-1" }, opId);
  assert.ok(taggedSpells(actor).length > 0, "the configure created Arts");
  await uses.undo(actor, opId);
  assert.deepEqual(flagOf(actor, "casting"), prior.casting, "casting is restored");
  assert.deepEqual(flagOf(actor, "artsPoints"), prior.artsPoints, "AP flags are restored");
  assert.equal(taggedSpells(actor).length, 0, "the created Arts are removed");
});

test("Roll.evaluate is never called across configure, sync, re-apply, and switch", async () => {
  const { applySupporterArts, syncSupporterArts } = await supporterArts();
  const actor = supporter({ level: 9 });
  await applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CORROSION], confirmed: true, contextKey: "roll-1" });
  setLevel(actor, 10);
  await syncSupporterArts(actor, "hexer");
  await applySupporterArts(actor, { branch: "hexer", ability: "int", poolIds: [POOL_CRUDE], confirmed: true, contextKey: "roll-2" });
  assert.equal(rollEvaluations.count, 0, "no Roll was evaluated");
});
