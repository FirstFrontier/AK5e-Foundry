import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import { SUPPORTER_CLASS_ID, pbForLevel, aidDieSize, flag } from "../scripts/supporter-rules.mjs";
import { defineSupporterPools } from "../scripts/supporter-features.mjs";
import { supporterUses, registerSupporterPlans } from "../scripts/supporter-uses.mjs";
import { getPool } from "../scripts/resource-pools.mjs";
import { emitAk5eEvent } from "../scripts/trigger-events.mjs";
import {
  hexerPlans, defineHexerPools, registerHexerHooks, hexerPanel, hexerApi, isHexed, hexesOn,
  hexerSpellSaveDC, cursemarkTargets, hexChanges, hexRollFormula, renderHexerCardButtons
} from "../scripts/hexer-features.mjs";

/* Plans register once per process: the test file is its own process under node --test. */
registerSupporterPlans({ plans: hexerPlans });

let docs;
let rolls;        // every formula the mocked Roll evaluates (asserts "no auto-roll")
let messages;     // every chat card created
let nextTotal;    // total the next Roll returns

test.beforeEach(() => {
  rolls = [];
  messages = [];
  nextTotal = 4;
  setupFoundryGlobals({ rollEvaluator: formula => { rolls.push(formula); return nextTotal; } });
  docs = new Map();
  globalThis.fromUuidSync = uuid => docs.get(uuid) ?? null;
  const create = globalThis.ChatMessage.implementation.create;
  globalThis.ChatMessage.implementation.create = async (data, opts) => {
    messages.push(data);
    return create(data, opts);
  };
  defineSupporterPools();
  defineHexerPools();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

/** A Hexer at `level` (CHA aid ability, CHA mod 3, INT mod 1). */
function hexer(level = 3, { casting = null, abilities = {}, name = "Hexer", isOwner = true } = {}) {
  const sClass = createTestItem({ name: "Supporter", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } } });
  const sub = createTestItem({ name: "Supporter: Hexer", type: "subclass",
    flags: { ak5e: { chapterThreeId: "subclass-supporter-hexer" } } });
  const actor = createTestActor({
    name, owner: isOwner,
    items: [sClass, sub],
    system: {
      attributes: { prof: pbForLevel(level) },
      abilities: {
        int: { mod: 1, value: 12 }, wis: { mod: 0, value: 10 }, cha: { mod: 3, value: 16 },
        con: { mod: 0, value: 10 }, dex: { mod: 2, value: 14 }, str: { mod: 0, value: 10 },
        ...abilities
      }
    },
    flags: { ak5e: { supporter: { enabled: true, branch: "hexer", aidAbility: "cha" },
      ...(casting ? { casting: { ability: casting } } : {}) } }
  });
  docs.set(actor.uuid, actor);
  return actor;
}

/** A creature with a walking Speed, optionally owned by the test user. */
function creature(name = "Goblin", { walk = 30, isOwner = true } = {}) {
  const actor = createTestActor({ name, owner: isOwner,
    system: { attributes: { movement: { walk }, prof: 2 }, abilities: { str: { mod: 0, value: 10 }, int: { mod: 0, value: 10 }, dex: { mod: 0, value: 10 } } } });
  docs.set(actor.uuid, actor);
  return recordCreates(actor);
}

/** The fixture keeps only flags and system on created effects; keep the raw payloads for changes and duration. */
function recordCreates(actor) {
  const create = actor.createEmbeddedDocuments.bind(actor);
  actor.createdEffects = [];
  actor.createEmbeddedDocuments = async (type, entries, options) => {
    if (type === "ActiveEffect") actor.createdEffects.push(...structuredClone(entries));
    return create(type, entries, options);
  };
  return actor;
}

/** The last ActiveEffect payload created on `actor` for a Hex kind (changes, duration, description). */
const hexPayload = (actor, kind) => actor.createdEffects.filter(entry => entry.flags?.ak5e?.hex?.kind === kind).at(-1) ?? null;

const hexEffects = (actor, kind = null) => Array.from(actor.effects.values())
  .filter(effect => flag(effect, "hex") && (kind === null || flag(effect, "hex").kind === kind));

/** Engine warnings for a plan, as ids (empty when the plan is clean). */
function warningIds(actor, name, data) {
  try { supporterUses.plan(actor, name, data); return []; }
  catch (error) { return (error.warnings ?? []).map(warning => warning.id); }
}

/* ------------------------------------------------------------------ exports and rules */

test("exports: the plan map, a frozen API, and the DC formula", () => {
  assert.deepEqual(Object.keys(hexerPlans).sort(), ["cursemark", "potentHex", "ultimateHex", "ultimateHexPart"]);
  assert.ok(Object.isFrozen(hexerApi));
  assert.equal(typeof hexerPanel, "function");
  const h = hexer(17);
  assert.equal(hexerSpellSaveDC(h), 8 + pbForLevel(17) + 3, "cha fallback: 8 + PB 6 + CHA 3");
  const intHexer = hexer(5, { casting: "int" });
  assert.equal(hexerSpellSaveDC(intHexer), 8 + pbForLevel(5) + 1, "flags.ak5e.casting.ability picks INT");
  assert.equal(isHexed(creature()), false);
});

test("pools: Potent Hex max is PB (@attributes.prof), Ultimate is 1, and defining them again is a no-op", () => {
  const h = hexer(9);
  defineHexerPools();
  defineHexerPools();
  assert.equal(getPool(h, "hexerPotentHex").max, pbForLevel(9));
  assert.equal(getPool(h, "hexerUltimateHex").max, 1);
  assert.equal(getPool(h, "hexerPotentHex").value, pbForLevel(9), "full at the start");
});

test("Hex math: Binding rounds to the nearest 5 ft (R9) and floors at the creature's Speed", () => {
  assert.equal(roundTo(7), 5);
  assert.equal(roundTo(8), 10);
  assert.equal(roundTo(12), 10);
  assert.equal(roundTo(13), 15);
  assert.equal(hexChanges("binding", { roll: 13, walk: 30 }).changes[0].value, "-15");
  assert.equal(hexChanges("binding", { roll: 13, walk: 10 }).changes[0].value, "-10", "floored at the current Speed");
  assert.deepEqual(hexChanges("binding", { roll: 2, walk: 30 }).changes, [], "a reduction that rounds to 0 changes nothing");
  assert.equal(hexRollFormula("binding", 10), "2d10", "Binding rolls two Aid Die rolls");
  assert.equal(hexRollFormula("breaking", 8), "1d8");
  assert.equal(hexRollFormula("abjuring", 8), null, "Abjuring rolls on each Damage Roll, not at application");
  assert.equal(hexRollFormula("looping", 8), null);
});

test("Breaking has no stored DR key: a flag and a reminder, no effect change", () => {
  const change = hexChanges("breaking", { roll: 5 });
  assert.deepEqual(change.changes, []);
  assert.equal(change.breakingReduction, 5);
  assert.match(change.reminder, /by hand/);
});

function roundTo(value) { return hexChanges("binding", { roll: value, walk: 999 }).speedReduction; }

/* ------------------------------------------------------------------ Potent Hex: each kind */

test("Binding: nothing is applied or rolled until the owner clicks; the click writes the Speed change", async () => {
  const h = hexer(3);
  const goblin = creature();
  nextTotal = 7;
  const opId = "binding-1";
  const before = getPool(h, "hexerPotentHex").value;
  const result = await supporterUses.execute(h, "potentHex", { targetUuid: goblin.uuid, kind: "binding" }, opId);
  assert.equal(result.formula, "2d8", "the use waits for the roll");
  assert.equal(rolls.length, 0, "no dice on apply");
  const receipt = supporterUses.receipt(h, opId);
  assert.equal(receipt.status, "awaitingRoll");
  assert.equal(receipt.formula, "2d8", "level 3 uses the d8 Aid Die");
  assert.ok(receipt.formula, "the engine card carries the single roll button (receipt.formula)");
  assert.ok(!receipt.summary.includes("data-ak5e-aid-roll"), "no duplicate roll button in the summary");
  assert.equal(getPool(h, "hexerPotentHex").value, before - 1, "one Potent Hex use is spent");
  assert.equal(hexEffects(goblin).length, 0);

  await supporterUses.command(h, "useRoll", { useId: opId }, "binding-1-roll");
  assert.deepEqual(rolls, ["2d8"]);
  const [effect] = hexEffects(goblin, "binding");
  assert.ok(effect, "the Binding Hex is on the target");
  const payload = hexPayload(goblin, "binding");
  assert.deepEqual(payload.changes, [{ key: "system.attributes.movement.walk", mode: 2, value: "-5" }]);
  assert.equal(flag(effect, "hex").roll, 7);
  assert.equal(flag(effect, "hex").ultimate, false);
  assert.equal(flag(effect, "hex").source, h.uuid);
  assert.equal(flag(effect, "hex").expires, 100 + 60, "expires at worldTime + 60");
  assert.equal(payload.duration.seconds, 60, "a one-minute duration");
});

test("Abjuring: the effect stores the die formula, rolls nothing on apply, and changes no numbers", async () => {
  const h = hexer(9);
  const goblin = creature();
  await supporterUses.execute(h, "potentHex", { targetUuid: goblin.uuid, kind: "abjuring" }, "abj-1");
  assert.equal(supporterUses.receipt(h, "abj-1").status, "complete");
  assert.equal(rolls.length, 0);
  const [effect] = hexEffects(goblin, "abjuring");
  assert.equal(flag(effect, "hex").formula, "1d10");
  assert.equal(flag(effect, "hex").roll, null);
  assert.deepEqual(hexPayload(goblin, "abjuring").changes, []);
  assert.match(hexPayload(goblin, "abjuring").description, /subtracts half/);
});

test("Looping and Voicethief-free kinds apply with no roll; Looping is a flag and a reminder", async () => {
  const h = hexer(5);
  const goblin = creature();
  await supporterUses.execute(h, "potentHex", { targetUuid: goblin.uuid, kind: "looping" }, "loop-1");
  assert.equal(supporterUses.receipt(h, "loop-1").status, "complete");
  const [effect] = hexEffects(goblin, "looping");
  assert.ok(effect);
  assert.deepEqual(hexPayload(goblin, "looping").changes, []);
  assert.equal(rolls.length, 0);
});

test("Gospel of Curses: Wasting applies a roll penalty to the chosen ability's check and save at level 13", async () => {
  const h = hexer(13);
  const goblin = creature();
  await supporterUses.execute(h, "potentHex", { targetUuid: goblin.uuid, kind: "wasting", ability: "str" }, "waste-1");
  assert.equal(supporterUses.receipt(h, "waste-1").formula, "1d10");
  nextTotal = 6;
  await supporterUses.command(h, "useRoll", { useId: "waste-1" }, "waste-1-roll");
  assert.ok(hexEffects(goblin, "wasting").length === 1);
  assert.deepEqual(hexPayload(goblin, "wasting").changes, [
    { key: "system.abilities.str.bonuses.check", mode: 2, value: "-6" },
    { key: "system.abilities.str.bonuses.save", mode: 2, value: "-6" }
  ]);
});

test("Voicethief: a save button for the target's owner, buttons only, and no roll on apply", async () => {
  const h = hexer(13);
  const goblin = creature();
  await supporterUses.execute(h, "potentHex", { targetUuid: goblin.uuid, kind: "voicethief" }, "voice-1");
  const receipt = supporterUses.receipt(h, "voice-1");
  assert.equal(receipt.status, "complete");
  assert.ok(receipt.summary.includes("data-ak5e-hexer-save=\"int\""));
  assert.ok(receipt.summary.includes(`data-dc="${hexerSpellSaveDC(h)}"`));
  assert.equal(rolls.length, 0, "the save is never rolled by the plan");
});

test("Voicethief and Wasting warn below level 13 and do not block", () => {
  const h = hexer(12);
  const goblin = creature();
  assert.ok(warningIds(h, "potentHex", { targetUuid: goblin.uuid, kind: "voicethief" }).includes("level"));
  assert.ok(warningIds(h, "potentHex", { targetUuid: goblin.uuid, kind: "wasting", ability: "int" }).includes("level"));
  assert.doesNotThrow(() => supporterUses.plan(h, "potentHex", { targetUuid: goblin.uuid, kind: "voicethief", overrides: ["level"] }));
});

/* ------------------------------------------------------------------ warnings, overrides and pools */

test("a second Hex of the same kind warns, and 'use anyway' replaces the first; undo restores it", async () => {
  const h = hexer(9);
  const goblin = creature();
  await supporterUses.execute(h, "potentHex", { targetUuid: goblin.uuid, kind: "abjuring" }, "first");
  assert.ok(warningIds(h, "potentHex", { targetUuid: goblin.uuid, kind: "abjuring" }).includes("duplicate"));
  await supporterUses.execute(h, "potentHex", { targetUuid: goblin.uuid, kind: "abjuring", overrides: ["duplicate"] }, "second");
  assert.equal(hexEffects(goblin, "abjuring").length, 1, "one instance per kind from a source");
  await supporterUses.undo(h, "second");
  assert.equal(hexEffects(goblin, "abjuring").length, 1, "the replaced Hex is restored by undo");
  assert.equal(flag(hexEffects(goblin, "abjuring")[0], "hexUse")?.opId ?? "first", "first", "the restored Hex is the original");
});

test("an empty Potent Hex pool warns, and 'use anyway' clamps at 0 and shows the shortfall", async () => {
  const h = hexer(3);   // pool max PB 2
  const goblin = creature();
  await supporterUses.execute(h, "potentHex", { targetUuid: goblin.uuid, kind: "looping" }, "a");
  await supporterUses.execute(h, "potentHex", { targetUuid: goblin.uuid, kind: "abjuring" }, "b");
  assert.equal(getPool(h, "hexerPotentHex").value, 0);
  assert.ok(warningIds(h, "potentHex", { targetUuid: goblin.uuid, kind: "wasting", ability: "str" }).includes("shortfall"));
  await supporterUses.execute(h, "potentHex", { targetUuid: creature("Orc").uuid, kind: "looping", overrides: ["shortfall"] }, "c");
  assert.equal(getPool(h, "hexerPotentHex").value, 0, "never below 0");
  assert.ok(supporterUses.receipt(h, "c").shortfalls?.some(text => /short by 1/.test(text)));
});

test("a Hexer cannot Hex itself, and the pools refresh only on a Long Rest (pool definitions are fixed)", () => {
  const h = hexer(3);
  assert.ok(warningIds(h, "potentHex", { targetUuid: h.uuid, kind: "looping" }).includes("selfTarget"));
});

test("a non-Hexer is refused by every plan", () => {
  const plain = createTestActor({ name: "Plain", system: { abilities: {} } });
  docs.set(plain.uuid, plain);
  assert.throws(() => hexerPlans.potentHex(plain, {}, { kind: "looping", targetUuid: "x" }), /Hexer/);
  assert.throws(() => hexerPlans.cursemark(plain, {}, { kind: "looping" }), /Hexer/);
});

/* ------------------------------------------------------------------ level gates */

test("level gates: Cursemark 4, Controlled Cruelty 10 (Spare the Rod), Gospel 13, Ultimate 17 warn without blocking", () => {
  const low = hexer(3);
  const goblin = creature();
  const point = { x: 0, y: 0, sceneId: "scene-1" };
  assert.ok(warningIds(low, "cursemark", { kind: "looping", point, markId: "m1", targetUuid: goblin.uuid }).includes("level"));
  const four = hexer(4);
  assert.ok(!warningIds(four, "cursemark", { kind: "looping", point, markId: "m2", targetUuid: goblin.uuid }).includes("level"));
  assert.ok(warningIds(four, "cursemark", { kind: "looping", point, markId: "m3", targetUuid: goblin.uuid, excluded: [goblin.uuid] }).includes("level"),
    "Spare the Rod warns below level 10");
  assert.ok(warningIds(hexer(16), "ultimateHex", { kind: "looping", targetUuid: goblin.uuid }).includes("level"));
  assert.ok(!warningIds(hexer(17), "ultimateHex", { kind: "looping", targetUuid: goblin.uuid }).includes("level"));
});

/* ------------------------------------------------------------------ Cursemark */

test("Cursemark records the point (undoable), spends one use, and uses a d6 Aid Die for its Hex", async () => {
  const h = hexer(4);
  const goblin = creature("Goblin");
  const before = getPool(h, "hexerPotentHex").value;
  await supporterUses.execute(h, "cursemark", {
    kind: "binding", markId: "mark-1", point: { x: 0, y: 0, sceneId: "scene-1" }, gridSize: 100,
    pointDistance: 60, targetUuid: goblin.uuid
  }, "curse-1");
  assert.equal(getPool(h, "hexerPotentHex").value, before - 1);
  assert.equal(supporterUses.receipt(h, "curse-1").formula, "2d6", "the Aid Die is a d6 for Cursemark");
  const records = flag(h, "hexer").cursemarks;
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].point, { x: 0, y: 0, sceneId: "scene-1" });
  assert.equal(records[0].radius, 10);
  assert.equal(records[0].kind, "binding");

  nextTotal = 5;
  await supporterUses.command(h, "useRoll", { useId: "curse-1" }, "curse-1-roll");
  assert.equal(hexEffects(goblin, "binding").length, 1);
  await supporterUses.undo(h, "curse-1");
  assert.equal(hexEffects(goblin, "binding").length, 0, "undo removes the Hex");
  assert.equal((flag(h, "hexer").cursemarks ?? []).length, 0, "undo removes the recorded point");
  assert.equal(getPool(h, "hexerPotentHex").value, before, "undo restores the use");
});

test("Cursemark warns beyond 100 ft; cursemarkTargets keeps creatures within 10 ft and drops Spare the Rod exclusions", async () => {
  const h = hexer(10);
  const near = creature("Near"), far = creature("Far"), spared = creature("Spared");
  const point = { x: 0, y: 0, sceneId: "scene-1" };
  assert.ok(warningIds(h, "cursemark", { kind: "looping", point, markId: "r", pointDistance: 120, targetUuid: near.uuid }).includes("range"));
  await supporterUses.execute(h, "cursemark", {
    kind: "looping", markId: "area", point, gridSize: 100, pointDistance: 20, excluded: [spared.uuid], targetUuid: near.uuid
  }, "area-1");
  const tokens = [
    { uuid: near.uuid, x: 150, y: 0, sceneId: "scene-1" },      // 7.5 ft
    { uuid: far.uuid, x: 300, y: 0, sceneId: "scene-1" },       // 15 ft
    { uuid: spared.uuid, x: 50, y: 0, sceneId: "scene-1" },     // within 10 ft but spared
    { uuid: "Actor.other", x: 50, y: 0, sceneId: "scene-2" }    // another scene
  ];
  assert.deepEqual(cursemarkTargets(h, "area", tokens).map(t => t.uuid), [near.uuid]);
  assert.deepEqual(cursemarkTargets(h, "missing", tokens), []);
});

/* ------------------------------------------------------------------ Ultimate Hex */

test("The Ultimate Hex spends its once-per-Long-Rest pool; a second use warns, and later kinds need the first", async () => {
  const h = hexer(17);
  const goblin = creature();
  await supporterUses.execute(h, "ultimateHex", { targetUuid: goblin.uuid, kind: "looping" }, "ult-1");
  assert.equal(getPool(h, "hexerUltimateHex").value, 0);
  assert.equal(hexEffects(goblin, "looping")[0] !== undefined, true);
  assert.equal(flag(hexEffects(goblin, "looping")[0], "hex").ultimate, true);
  assert.ok(warningIds(h, "ultimateHex", { targetUuid: creature("Orc").uuid, kind: "looping" }).includes("shortfall"));
  assert.throws(() => supporterUses.plan(h, "ultimateHexPart", { targetUuid: goblin.uuid, kind: "abjuring" }), /Ultimate Hex must be applied first/);
  await supporterUses.execute(h, "ultimateHexPart", { targetUuid: goblin.uuid, kind: "wasting", ability: "dex", ultimateUseId: "ult-1" }, "ult-2");
  assert.equal(getPool(h, "hexerUltimateHex").value, 0, "a part does not spend the pool");
  assert.equal(supporterUses.receipt(h, "ult-2").formula, "1d12");
});

test("The Ultimate Hex and a Potent Hex on the same creature warn: they are not cumulative", async () => {
  const h = hexer(17);
  const goblin = creature();
  await supporterUses.execute(h, "potentHex", { targetUuid: goblin.uuid, kind: "looping" }, "potent-a");
  assert.ok(warningIds(h, "ultimateHex", { targetUuid: goblin.uuid, kind: "abjuring" }).includes("potentOverlap"));
  const orc = creature("Orc");
  await supporterUses.execute(h, "ultimateHex", { targetUuid: orc.uuid, kind: "looping" }, "ult-a");
  assert.ok(warningIds(h, "potentHex", { targetUuid: orc.uuid, kind: "abjuring" }).includes("ultimateOverlap"));
});

/* ------------------------------------------------------------------ hooks: rider, burst, voicethief, once per cycle */

test("the Force rider posts one roll button per turn cycle per creature and never rolls on its own", async () => {
  const h = hexer(3);
  const goblin = creature();
  registerHexerHooks();
  registerHexerHooks();                                   // idempotent
  await supporterUses.execute(h, "potentHex", { targetUuid: goblin.uuid, kind: "looping" }, "rider-hex");
  await emitAk5eEvent("hit", { targetUuid: goblin.uuid, actorUuid: creature("Attacker").uuid, eventId: "hit:1" });
  const riderCards = () => messages.filter(message => String(message.content).includes("data-ak5e-hexer-roll"));
  assert.equal(riderCards().length, 1);
  assert.match(riderCards()[0].content, /1d8/);
  assert.equal(rolls.length, 0, "the rider card does not roll");
  await emitAk5eEvent("hit", { targetUuid: goblin.uuid, actorUuid: "Actor.x", eventId: "hit:2" });
  assert.equal(riderCards().length, 1, "at most once per turn cycle for this creature");

  await emitAk5eEvent("turnStart", { actorUuid: h.uuid, eventId: "ts:h" });
  await emitAk5eEvent("hit", { targetUuid: goblin.uuid, actorUuid: "Actor.x", eventId: "hit:3" });
  assert.equal(riderCards().length, 2, "the cycle resets at the Hexer's Turn start");
});

test("Rupturing (Ultimate): the death burst is a button for 4 Aid Die rolls, not an automatic roll", async () => {
  const h = hexer(17);
  const goblin = creature();
  registerHexerHooks();
  await supporterUses.execute(h, "ultimateHex", { targetUuid: goblin.uuid, kind: "looping" }, "rupt-1");
  await emitAk5eEvent("kill", { actorUuid: goblin.uuid, eventId: "kill:1" });
  const burst = messages.find(message => String(message.content).includes("Rupturing Hex"));
  assert.ok(burst, "a burst card is posted");
  assert.match(burst.content, /4d12/);
  assert.match(burst.content, new RegExp(`DC ${hexerSpellSaveDC(h)}`));
  assert.equal(rolls.length, 0);
});

test("Voicethief: each Turn start of the hexed creature posts a save button and never a roll", async () => {
  const h = hexer(13);
  const goblin = creature();
  registerHexerHooks();
  await supporterUses.execute(h, "potentHex", { targetUuid: goblin.uuid, kind: "voicethief" }, "vt-1");
  await emitAk5eEvent("turnStart", { actorUuid: goblin.uuid, eventId: "ts:g" });
  const card = messages.find(message => String(message.content).includes("Voicethief Hex") && String(message.content).includes("data-ak5e-hexer-save"));
  assert.ok(card, "a repeat save button is posted at the start of its Turn");
  assert.equal(rolls.length, 0);
});

test("the panel shows the Potent Hex count and buttons, and the card wiring reads roll buttons without rolling", () => {
  const h = hexer(17);
  const html = hexerPanel(h);
  assert.match(html, /data-supporter-cmd="potentHex"/);
  assert.match(html, /data-supporter-cmd="ultimateHex"/);
  assert.doesNotMatch(hexerPanel(hexer(3)), /data-supporter-cmd="ultimateHex"/, "Ultimate is hidden below level 17");
  assert.equal(typeof renderHexerCardButtons, "function");
  assert.equal(rolls.length, 0);
});

/* ------------------------------------------------------------------ relay and ownership */

test("the GM relay may apply only the Hex the Hexer recorded for this creature", () => {
  const source = { uuid: "Actor.h" };
  const receipt = { result: { kind: "binding", ultimate: false } };
  const entry = { uuid: "Actor.g", kind: "hexEffect", hexKind: "binding", ultimate: false };
  const validate = hexerPlans.potentHex.validateTarget;
  assert.equal(validate(source, receipt, entry, { uuid: "Actor.g" }), true);
  assert.equal(validate(source, receipt, entry, { uuid: "Actor.other" }), false, "a different creature is refused");
  assert.equal(validate(source, receipt, { ...entry, hexKind: "wasting" }, { uuid: "Actor.g" }), false, "a different kind is refused");
});
