/**
 * U4 adversarial challenge suite: Supporter base class and Artificer subclass bug fixes.
 *
 * Written from the source text (AK5e 1.3.1 Ch.3: Supporter Features table C3:6557-6578, Provide Aid C3:6630-6640,
 * Advanced Aid C3:6652-6662, Progression Ch.3 Supporter tool and Branch lines C3:6602, Artificer C3:6862-6960,
 * Automaton upgrades C3:6962-6990; Ch.6 Automaton base Hit Points 25) and the head rulings in
 * ak5e/DECISIONS.md. The implementation diff was not read. "C3:NNNN" cites the source line.
 *
 * Expected to be RED against the current code (findings, see the report). Each red test names its finding.
 * Guard tests (no "red" tag in the title) must pass: they pin behaviour the fix must keep.
 *
 * Contract assumptions (each is listed in the report under "uncertain"):
 *  - Aid temp HP plan: data {targetUuid, targetName, amount}. The Aid Die maximum at level L is the source Aid Die
 *    size (d8 at L1-6, d10 at L7-13, d12 at L14-20; C3:6557-6578) plus PB (C3:6660). Over that is a warning or a refusal.
 *  - Relayed change record: flags.ak5e.supporterUses.undo[] receipts with targets[] entries {kind, uuid, set, before,
 *    ready}. The relay reads them through Uses.supporterUses.relayedTargetChange(source, command, data, user).
 *  - Automaton relay: artificerRelay.execute(actor, {id, command: "createAutomaton", data}, user) (kernel request shape).
 *  - Turn tracking for the Arbalest (C3:6967 "Once per Turn") is not defined by the source test; the assertion
 *    accepts any warning that says once per Turn, this Turn, or already.
 *  - Cap warning text: the source has no "crumbles" rule for the Automaton maximum (C3:6895, C3:6938); a warning
 *    may not attribute such a rule to the source.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import * as Features from "../scripts/supporter-features.mjs";
import * as Uses from "../scripts/supporter-uses.mjs";
import {
  supporterChoices, previewSupporterProgression, applySupporterProgression, SUPPORTER_PROGRESS_FLAG
} from "../scripts/supporter-progression.mjs";
import { SUPPORTER_CLASS_ID } from "../scripts/supporter-rules.mjs";

/* ==========================================================================
   Oracles, module loading and fixtures
   ========================================================================== */

// C3:6557-6578 Proficiency Bonus column (Supporter and Artificer share the progression).
const pbOf = level => Math.floor((level - 1) / 4) + 2;
// C3:6557-6578 Aid Die column: d8 at 1st-6th, d10 at 7th-13th, d12 at 14th-20th.
const aidDieMaxAt = level => (level >= 14 ? 12 : level >= 7 ? 10 : 8);
// C3:6660 Save Advanced Aid: Temporary Hit Points equal to the Aid Die roll + PB. Largest possible amount:
const aidTempHpMaxAt = level => aidDieMaxAt(level) + pbOf(level);
const DEFAULT_MODS = Object.freeze({ str: 0, dex: 2, con: 2, int: 3, wis: 1, cha: 4 });
const AUTOMATON_BASE_HP = 25; // Ch.6 Automaton base Hit Points (L6583-6600); C3:6887 adds the Technology Modifier.

const cache = new Map();
/** Load a module once. A missing or broken module fails only the tests that need it. */
async function loadModule(path) {
  if (!cache.has(path)) cache.set(path, import(path).then(mod => ({ mod }), error => ({ error })));
  const { mod, error } = await cache.get(path);
  assert.ok(mod, `${path} is not loadable: ${error?.message ?? "unknown"}`);
  return mod;
}

let VARIANTS = {};
let registered = false;
/** Load the Artificer modules and register their plans once per file. */
async function ready() {
  const A = await loadModule("../scripts/artificer-features.mjs");
  const U = await loadModule("../scripts/artificer-upgrades.mjs");
  if (!registered) {
    Uses.registerSupporterPlans({ plans: A.artificerPlans, readings: A.artificerReadings });
    Uses.registerSupporterPlans({ plans: U.artificerUpgradePlans });
    registered = true;
  }
  VARIANTS = A.AUTOMATON_VARIANTS;
  return { A, U };
}

// Local Actor creation stub (the shared fixture has no Actor.create). Mirrors create(data, {keepId}).
let restoreActor = null;
function installActorStub() {
  const previous = globalThis.Actor;
  const create = async (data = {}) => {
    const created = createTestActor({
      id: data._id, name: data.name ?? "Automaton", type: data.type ?? "npc", ownership: data.ownership,
      system: structuredClone(data.system ?? {}), flags: structuredClone(data.flags ?? {})
    });
    const profChange = (data.effects ?? []).flatMap(effect => effect.changes ?? []).find(change => change.key === "system.attributes.prof");
    if (profChange) created.system.attributes.prof = Number(profChange.value);
    return created;
  };
  globalThis.Actor = { create, implementation: { create } };
  return () => { globalThis.Actor = previous; };
}

/** Flush async Hooks.callAll handlers. */
const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setTimeout(resolve, 0)); };

test.beforeEach(() => {
  setupFoundryGlobals();
  restoreActor = installActorStub();
  Features.defineSupporterPools();
});

test.afterEach(() => {
  restoreActor?.();
  restoreActor = null;
  teardownFoundryGlobals();
});

/** An Artificer (Supporter at `level`, branch "artificer") with optional Automaton uuids on its list. */
function makeArtificer({ level = 1, mods = {}, tech = 5, lmd = 0, name, automatons = [], branch = "artificer" } = {}) {
  const abilities = {};
  for (const [key, mod] of Object.entries({ ...DEFAULT_MODS, ...mods })) abilities[key] = { mod, value: 10 + 2 * mod };
  const items = [createTestItem({
    name: "Supporter", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } }
  })];
  return createTestActor({
    name: name ?? `Artificer L${level}`, level, items, abilities,
    hp: { value: 20, max: 20, temp: 0 },
    system: { currency: { cp: lmd }, skills: { ak5etech: { total: tech, value: 1 } } },
    flags: { ak5e: {
      artificer: { automatons: [...automatons], covers: [], professionalVariant: null },
      supporter: { enabled: true, branch }
    } }
  });
}

/** An Automaton actor. `creator` is the Artificer's uuid (or null). `upgradeUses` mirrors automatonInfo(). */
function makeAutomaton({ name = "Automaton", creator = null, variant = "platform", hp = AUTOMATON_BASE_HP,
  upgrades = [], destroyed = false, upgradeUses = {} } = {}) {
  return createTestActor({
    name, type: "npc",
    hp: { value: hp, max: AUTOMATON_BASE_HP, temp: 0 },
    flags: { ak5e: { automaton: { creator, variant, upgrades: [...upgrades], personality: null, destroyed, upgradeUses } } }
  });
}

/** Give an Artificer the Automaton uuid on its list (the list is its own record, as in the module). */
const enlist = (artificer, automaton) => { artificer.flags.ak5e.artificer.automatons.push(automaton.uuid); return automaton; };

/** Build a bare Artificer with an enlisted Automaton of its own. */
function artificerWithAutomaton(options = {}, autoOptions = {}) {
  const art = makeArtificer(options);
  const auto = enlist(art, makeAutomaton({ creator: art.uuid, ...autoOptions }));
  return { art, auto };
}

/** Plan data helpers. */
const buildData = (variant = "platform", extra = {}) => ({ variant, technologyModifier: "intMod", ...extra });

/** Run a plan and report what it did: a refusal (a thrown error, not a TypeError) or the warnings it raised. */
async function outcome(thunk) {
  try {
    const plan = await thunk();
    return { threw: null, warnings: plan?.warnings ?? [] };
  } catch (error) {
    return { threw: error, warnings: Array.isArray(error?.warnings) ? error.warnings : [] };
  }
}
const isProgrammingError = error => error instanceof TypeError || /is not a function|of undefined|of null|is not defined/.test(String(error?.message));
/** Flagged = refused for a reason the user can read, or warned. A TypeError is not a refusal. */
const flagged = result => (result.threw !== null && !isProgrammingError(result.threw)) || result.warnings.length > 0;
const warningText = ws => ws.map(w => `${w.id ?? ""} ${w.text ?? ""}`).join(" | ");

/** Stub Roll. Every evaluate() is recorded; Roll.roll is an error. */
function forbidRolls() {
  const calls = [];
  globalThis.Roll = class SpyRoll {
    constructor(formula, data = {}) { this.formula = formula; this.data = data; this.total = null; }
    async evaluate() { calls.push(this.formula); this.total = 4; return this; }
    async toMessage() { return undefined; }
    static async roll() { calls.push("Roll.roll"); throw new Error("Roll.roll must not run before the player clicks Roll"); }
  };
  return calls;
}

/** Execute a Supporter use (confirmed). Pass overrides through the caller's data when a warning is expected. */
const run = (actor, name, data, opId) => Uses.supporterUses.execute(actor, name, data, opId);
const receiptOf = (actor, id) => Uses.supporterUses.receipt(actor, id);
const hpOf = actor => Number(actor.system.attributes.hp.value);
const tempOf = actor => Number(actor.system.attributes.hp.temp ?? 0);
const relay = (source, command, data) => Uses.supporterUses.relayedTargetChange(source, command, data, game.user);

/** A receipt as the source Actor records it (flags.ak5e.supporterUses.undo). Only the fields the relay reads. */
const forgedReceipt = (id, command, targets, extra = {}) => ({ id, command, status: "applied", targets, ...extra });

/** An Artificer whose own undo record holds the given receipts (the record the relay trusts). */
function artificerWithRecords(receipts, options = {}) {
  const art = makeArtificer(options);
  art.flags.ak5e.supporterUses = { undo: receipts, data: {} };
  return art;
}

/** A plain PC-like actor (not an Automaton, no creator). */
const victimPc = (name = "Victim PC", hp = 30) => createTestActor({ name, owner: false, hp: { value: hp, max: 30, temp: 0 } });

/* ==========================================================================
   1. GM relay trust (HIGH): a receipt lives in the source Actor's flags, which its owner can write
   ========================================================================== */

test("U4-REL-1 (guard): the GM relay applies a rebuild change recorded for an Automaton this Artificer built", async () => {
  await ready();
  const { art, auto } = artificerWithAutomaton({}, { hp: 10 });
  art.flags.ak5e.supporterUses = {
    undo: [forgedReceipt("rb-own", "rebuildAutomaton", [{
      kind: "artificerFields", uuid: auto.uuid, name: "Automaton rebuild", ready: true,
      set: { "system.attributes.hp.value": 25 }, before: { "system.attributes.hp.value": 10 }
    }])], data: {}
  };
  await relay(art, "apply", { useId: "rb-own", targetUuid: auto.uuid });
  assert.equal(hpOf(auto), 25, "the Automaton this Artificer built takes the recorded HP");
});

test("U4-REL-2 (guard): the GM relay reverts a recorded change on the Artificer's own Automaton (undo path)", async () => {
  await ready();
  const { art, auto } = artificerWithAutomaton({}, { hp: 25 });
  art.flags.ak5e.supporterUses = {
    undo: [forgedReceipt("rb-undo", "rebuildAutomaton", [{
      kind: "artificerFields", uuid: auto.uuid, name: "Automaton rebuild", ready: true,
      set: { "system.attributes.hp.value": 25 }, before: { "system.attributes.hp.value": 10 }
    }])], data: {}
  };
  await relay(art, "revert", { useId: "rb-undo", targetUuid: auto.uuid });
  assert.equal(hpOf(auto), 10, "the recorded prior value is restored");
});

test("U4-REL-3 (red, HIGH): a forged revert record cannot change an unrelated PC's HP through the relay", async () => {
  await ready();
  const victim = victimPc("Victim PC", 30);
  // The attacker's own undo record names the victim; the victim is not an Automaton of this Artificer.
  const attacker = artificerWithRecords([forgedReceipt("forge-rev", "rebuildAutomaton", [{
    kind: "artificerFields", uuid: victim.uuid, name: "Victim", ready: true,
    set: { "system.attributes.hp.value": 30 }, before: { "system.attributes.hp.value": 1 }
  }])]);
  assert.ok(receiptOf(attacker, "forge-rev"), "the forged record is in the attacker's own undo list");
  await relay(attacker, "revert", { useId: "forge-rev", targetUuid: victim.uuid }).catch(() => {});
  assert.equal(hpOf(victim), 30, "the relay refuses a revert on a target that the Artificer did not build (validateTarget is apply-only)");
});

test("U4-REL-4 (red, HIGH): a non-Automaton listed on the Artificer's own automatons list cannot be changed by a forged apply", async () => {
  await ready();
  const victim = victimPc("Victim PC", 30);
  // The attacker lists the victim's uuid on its own list. The victim has no automaton flag and no creator.
  const attacker = makeArtificer({ automatons: [victim.uuid] });
  attacker.flags.ak5e.supporterUses = { undo: [forgedReceipt("forge-apply", "rebuildAutomaton", [{
    kind: "artificerFields", uuid: victim.uuid, name: "Victim", ready: true,
    set: { "system.attributes.hp.value": 1 }, before: { "system.attributes.hp.value": 30 }
  }])], data: {} };
  await relay(attacker, "apply", { useId: "forge-apply", targetUuid: victim.uuid }).catch(() => {});
  assert.equal(hpOf(victim), 30, "fieldsValidate must require the Automaton flag or a creator link, not the list alone (C3:6895 Automaton is a construct of its creator)");
});

test("U4-REL-5 (guard): a forged apply on an unrelated PC that the Artificer never built is refused and changes nothing", async () => {
  await ready();
  const victim = victimPc("Victim PC", 30);
  const attacker = artificerWithRecords([forgedReceipt("forge-unrelated", "rebuildAutomaton", [{
    kind: "artificerFields", uuid: victim.uuid, name: "Victim", ready: true,
    set: { "system.attributes.hp.value": 1 }, before: { "system.attributes.hp.value": 30 }
  }])]);
  await assert.rejects(() => relay(attacker, "apply", { useId: "forge-unrelated", targetUuid: victim.uuid }),
    /not one this use can make|not on the Artificer whitelist/);
  assert.equal(hpOf(victim), 30);
});

/* ==========================================================================
   2. Automaton statistics recomputed by the GM relay (MED)
   ========================================================================== */

test("U4-AUT-1 (red, MED): the GM relay recomputes the Automaton's HP, Creator PB and to-hit instead of trusting the client", async () => {
  const { A } = await ready();
  const art = makeArtificer({ level: 1, mods: { int: 3 }, tech: 5 });
  const created = [];
  const realCreate = globalThis.Actor.implementation.create;
  globalThis.Actor.implementation.create = async (data, opts) => { created.push(data); return realCreate(data, opts); };
  const request = {
    id: "u4-stats-1", command: "createAutomaton",
    data: { confirmation: true, variant: "platform", automatonId: "abcdefghij123456",
      stats: { hpMax: 999, pb: 20, attackBonus: 99 } }
  };
  const result = await A.artificerRelay.execute(art, request, game.user).then(() => ({ threw: null }), error => ({ threw: error }));
  globalThis.Actor.implementation.create = realCreate;
  if (result.threw) {
    assert.ok(!isProgrammingError(result.threw), `refusal, not a crash: ${result.threw?.message}`);
    return;
  }
  assert.equal(created.length, 1, "the GM client created the Automaton");
  const data = created[0];
  // C3:6887 (Professional Engineer): Technology Modifier added to base Hit Points 25 (Ch.6). INT 3 or Technology 5.
  assert.ok([AUTOMATON_BASE_HP + 3, AUTOMATON_BASE_HP + 5].includes(data.system.attributes.hp.max),
    `hp.max ${data.system.attributes.hp.max} must be 25 plus the Technology Modifier (INT 3 or Technology 5)`);
  assert.equal(String(data.effects[0].changes[0].value), String(pbOf(1)), "Creator proficiency is the Artificer PB at level 1 (C3:6557)");
  const attacks = data.items.filter(item => item.flags?.ak5e?.automatonAttack);
  assert.ok(attacks.length > 0, "the Automaton has attack items");
  // C3:6988 (Cutting Edge Blades): Attack bonus equals Proficiency Bonus + Intelligence Modifier.
  for (const item of attacks) {
    assert.equal(Number(item.system.activities.ak5eAttack000001.attack.bonus), pbOf(1) + 3, `${item.name} to-hit is PB + INT (C3:6988)`);
  }
});

test("U4-AUT-2 (guard): only the elected GM client creates an Automaton through the relay", async () => {
  const { A } = await ready();
  const art = makeArtificer({ level: 1 });
  const previousUser = game.user;
  game.user = { id: "player", name: "Player", isGM: false, targets: new Set() };
  try {
    await assert.rejects(() => A.artificerRelay.execute(art, {
      id: "u4-stats-2", command: "createAutomaton",
      data: { confirmation: true, variant: "platform", automatonId: "abcdefghij123457", stats: { hpMax: 28, pb: 2, attackBonus: 5 } }
    }, game.user), /GM/);
  } finally {
    game.user = previousUser;
  }
});

/* ==========================================================================
   3. Advanced Aid: temporary HP, critical-range rider (MED / LOW)
   ========================================================================== */

test("U4-AID-1 (red, MED): an oversized Save temp HP amount (999) at level 5 is flagged, not planned silently", async () => {
  await ready();
  const art = makeArtificer({ level: 5 });
  const ally = createTestActor({ name: "Ally", hp: { value: 10, max: 10, temp: 0 } });
  const result = await outcome(() => Uses.supporterUses.plan(art, "aidTempHP", { targetUuid: ally.uuid, targetName: "Ally", amount: 999 }));
  assert.ok(flagged(result), `999 temp HP is above the largest Aid Die plus PB at level 5 (${aidTempHpMaxAt(5)}, C3:6557, C3:6660): ${warningText(result.warnings)}`);
});

test("U4-AID-2 (red, MED): temp HP one above the largest Aid Die plus PB at level 5 (d8 + PB 3 = 11) is flagged", async () => {
  await ready();
  const art = makeArtificer({ level: 5 });
  const ally = createTestActor({ name: "Ally", hp: { value: 10, max: 10, temp: 0 } });
  const over = await outcome(() => Uses.supporterUses.plan(art, "aidTempHP", { targetUuid: ally.uuid, targetName: "Ally", amount: aidTempHpMaxAt(5) + 1 }));
  assert.ok(flagged(over), `${aidTempHpMaxAt(5) + 1} exceeds d8 + PB 3 (C3:6557, C3:6660)`);
});

test("U4-AID-3 (red, MED): at level 14 the Aid Die is d12, so 18 temp HP (d12 + PB 5 = 17 max) is flagged", async () => {
  await ready();
  const art = makeArtificer({ level: 14 });
  const ally = createTestActor({ name: "Ally", hp: { value: 10, max: 10, temp: 0 } });
  const over = await outcome(() => Uses.supporterUses.plan(art, "aidTempHP", { targetUuid: ally.uuid, targetName: "Ally", amount: aidTempHpMaxAt(14) + 1 }));
  assert.ok(flagged(over), `${aidTempHpMaxAt(14) + 1} exceeds d12 + PB 5 (C3:6572-6578, C3:6660)`);
});

test("U4-AID-4 (guard): the largest legal Save temp HP (Aid Die max + PB) is planned without a warning", async () => {
  await ready();
  const ally = createTestActor({ name: "Ally", hp: { value: 10, max: 10, temp: 0 } });
  for (const level of [5, 14]) {
    const art = makeArtificer({ level });
    const ok = await outcome(() => Uses.supporterUses.plan(art, "aidTempHP", { targetUuid: ally.uuid, targetName: "Ally", amount: aidTempHpMaxAt(level) }));
    assert.equal(ok.threw, null, `level ${level}: ${aidTempHpMaxAt(level)} is the largest legal amount`);
    assert.deepEqual(ok.warnings, [], `level ${level}: no warning at the largest legal amount`);
  }
});

test("U4-AID-5 (guard): non-positive, non-integer and NaN temp HP amounts are refused with a readable error", async () => {
  await ready();
  const art = makeArtificer({ level: 5 });
  const ally = createTestActor({ name: "Ally", hp: { value: 10, max: 10, temp: 0 } });
  for (const amount of [0, -3, 2.5, Number.NaN]) {
    const result = await outcome(() => Uses.supporterUses.plan(art, "aidTempHP", { targetUuid: ally.uuid, targetName: "Ally", amount }));
    assert.ok(result.threw && !isProgrammingError(result.threw), `amount ${amount} is refused readably: ${result.threw?.message}`);
  }
});

test("U4-AID-6 (guard): undoing a recorded Save temp HP restores the target's prior temp HP", async () => {
  await ready();
  const art = makeArtificer({ level: 5 });
  const ally = createTestActor({ name: "Ally", hp: { value: 10, max: 10, temp: 0 } });
  await run(art, "aidTempHP", { targetUuid: ally.uuid, targetName: "Ally", amount: 5 }, "thp-undo");
  assert.equal(tempOf(ally), 5);
  await Uses.supporterUses.undo(art, "thp-undo");
  assert.equal(tempOf(ally), 0, "the recorded change is reverted");
});

test("U4-AID-7 (red, LOW): the Advanced Aid critical-range rider is worded for the Attack it is used on, not the next attack", async () => {
  await ready();
  const art = makeArtificer({ level: 5 });
  const ally = createTestActor({ name: "Ally", hp: { value: 10, max: 10, temp: 0 } });
  await run(art, "provideAid", { targetUuid: ally.uuid, targetName: "Ally", distance: 10 }, "crit-parent");
  await run(art, "aidCritRider", { useId: "crit-parent" }, "crit-rider");
  const receipt = receiptOf(art, "crit-rider");
  assert.ok(receipt, "the rider is recorded");
  const text = `${receipt.summary ?? ""} ${receipt.title ?? ""}`;
  assert.match(text, /critical range/i);
  // C3:6658: "The Critical Range of that Attack is increased by 1." The Aid is spent on a roll, not on the next Attack.
  assert.doesNotMatch(text, /next attack/i, "the rider applies to that Attack (C3:6658), not to the next attack");
});

/* ==========================================================================
   4. Supporter progression: atomicity, serial lock, tool choice, defaults (MED-LOW)
   ========================================================================== */

/** A Supporter at `level` with the progression fixture's shape (copied from supporter-progression.test.mjs). */
function progressionActor(level = 1) {
  const sClass = createTestItem({
    name: "Supporter", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } }
  });
  return createTestActor({
    items: [sClass],
    system: {
      attributes: { hp: { value: 8, max: 8, temp: 0 }, prof: pbOf(level) },
      abilities: {
        str: { value: 10, mod: 0 }, dex: { value: 14, mod: 2 }, con: { value: 14, mod: 2 },
        int: { value: 12, mod: 1 }, wis: { value: 12, mod: 1 }, cha: { value: 16, mod: 3 }
      },
      traits: { saves: { value: [] }, armorProf: { value: [] }, weaponProf: { value: [] }, toolProf: { value: [] } },
      skills: { arc: { value: 0 }, ak5elore: { value: 0 }, ak5etech: { value: 0 }, ins: { value: 0 }, dec: { value: 0 }, per: { value: 0 } },
      currency: { cp: 0 }
    }
  });
}

const LEVEL_ONE = Object.freeze({
  branch: "subclass-supporter-artificer", saves: ["con", "wis"], skills: ["ak5etech", "ins", "dec"],
  aidAbility: "wis", startingEquipment: { mode: "cash" }, hp: { 1: { mode: "fixed", roll: 6 } }
});

test("U4-PRG-1 (red, MED): two concurrent applies of one preview (a double click) do not both succeed", async () => {
  await ready();
  const actor = progressionActor(1);
  const preview = await previewSupporterProgression(actor, { ...LEVEL_ONE, tool: "Engineering Kit" });
  const attempts = await Promise.allSettled([1, 2].map(() => applySupporterProgression(actor, {
    confirmed: true, contextKey: preview.contextKey, choices: { ...LEVEL_ONE, tool: "Engineering Kit" }
  })));
  const fulfilled = attempts.filter(attempt => attempt.status === "fulfilled").length;
  assert.ok(fulfilled >= 1, "at least one apply succeeds (guard against a vacuous pass)");
  assert.ok(fulfilled <= 1, `${fulfilled} applies of the same preview both succeeded; they must be serialised so the second is refused`);
});

test("U4-PRG-2 (red, MED): a failed Supporter item creation leaves no progression state and no starting cash behind", async () => {
  await ready();
  const actor = progressionActor(1);
  const preview = await previewSupporterProgression(actor, LEVEL_ONE);
  let createCalls = 0;
  actor.createEmbeddedDocuments = async () => { createCalls++; throw new Error("simulated item creation failure"); };
  await assert.rejects(() => applySupporterProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices: LEVEL_ONE }),
    /simulated item creation failure/);
  assert.equal(createCalls, 1, "the item creation step was reached (guard against a vacuous pass)");
  assert.equal(actor.flags?.ak5e?.[SUPPORTER_PROGRESS_FLAG], undefined, "the progression state is not saved when the Items fail to create");
  assert.equal(Number(actor.system.currency.cp), 0, "the starting cash is not granted when the Items fail to create");
});

test("U4-PRG-3 (red, LOW): the chosen Supporter tool is written to the actor's tool proficiencies (C3:6602)", async () => {
  await ready();
  const actor = progressionActor(1);
  const choices = { ...LEVEL_ONE, tool: "Engineering Kit" };
  const preview = await previewSupporterProgression(actor, choices);
  await applySupporterProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices });
  // C3:6602 Supporter: "Tools: A Tool Kit/Vehicle Proficiency of your Choice."
  assert.match(JSON.stringify(actor.system.traits.toolProf), /Engineering Kit/, "the chosen tool is recorded as a proficiency");
});

test("U4-PRG-4 (red, LOW): an unapplied level does not default to 'existing' (it must stay pending for the player)", async () => {
  await ready();
  const actor = progressionActor(4);
  const choices = supporterChoices(actor, {});
  for (const level of [2, 3, 4]) {
    assert.notEqual(choices.hp?.[level]?.mode, "existing", `hp level ${level} has not been applied; it must not default to existing`);
  }
  assert.notEqual(choices.asi?.[4]?.mode, "existing", "the level 4 Ability Score Improvement has not been applied");
});

test("U4-PRG-5 (guard): re-running an applied progression with a fresh preview grants no new Items or cash", async () => {
  await ready();
  const actor = progressionActor(1);
  const first = await previewSupporterProgression(actor, LEVEL_ONE);
  await applySupporterProgression(actor, { confirmed: true, contextKey: first.contextKey, choices: LEVEL_ONE });
  const cashAfterFirst = Number(actor.system.currency.cp);
  const second = await previewSupporterProgression(actor, LEVEL_ONE);
  const replay = await applySupporterProgression(actor, { confirmed: true, contextKey: second.contextKey, choices: LEVEL_ONE });
  assert.deepEqual(replay.created, [], "no Items are created on the second run");
  assert.equal(Number(actor.system.currency.cp), cashAfterFirst, "the starting cash is not granted twice");
});

/* ==========================================================================
   5. Heavy Duty Upgrades and the Automaton maximum (LOW)
   ========================================================================== */

test("U4-UPG-1 (red, LOW): a second Arbalest use in the same Turn is flagged (C3:6967 Once per Turn)", async () => {
  await ready();
  const art = makeArtificer({ level: 5 });
  const auto = enlist(art, makeAutomaton({ creator: art.uuid, variant: "turret", upgrades: ["arbalest"] }));
  await run(art, "useUpgrade", { upgradeId: "arbalest", automatonUuid: auto.uuid }, "arb-1");
  const second = await outcome(() => Uses.supporterUses.plan(art, "useUpgrade", { upgradeId: "arbalest", automatonUuid: auto.uuid }));
  assert.ok(second.warnings.some(w => /once per turn|this turn|already/i.test(`${w.id} ${w.text}`)),
    `the Arbalest is Once per Turn (C3:6967): ${warningText(second.warnings) || second.threw?.message}`);
});

test("U4-UPG-2 (red, LOW): the Arts Detonator, when the Automaton is at 0 HP, is not blocked by its spent use (C3:6975)", async () => {
  await ready();
  const art = makeArtificer({ level: 5 });
  const auto = enlist(art, makeAutomaton({
    creator: art.uuid, variant: "platform", hp: 0, upgrades: ["artsDetonator"], upgradeUses: { artsDetonator: { used: 1 } }
  }));
  const result = await outcome(() => Uses.supporterUses.plan(art, "useUpgrade", { upgradeId: "artsDetonator", automatonUuid: auto.uuid }));
  // C3:6975: "if the Automaton is reduced to 0 Hit Points, it may use this Reaction even if it has expended its use of it."
  assert.ok(!result.warnings.some(w => w.id === "overuse"), `no overuse warning at 0 HP: ${warningText(result.warnings)}`);
});

test("U4-UPG-3 (guard): the Arts Detonator with its use spent at full HP still warns that it is overused", async () => {
  await ready();
  const art = makeArtificer({ level: 5 });
  const auto = enlist(art, makeAutomaton({
    creator: art.uuid, variant: "platform", hp: AUTOMATON_BASE_HP, upgrades: ["artsDetonator"], upgradeUses: { artsDetonator: { used: 1 } }
  }));
  const result = await outcome(() => Uses.supporterUses.plan(art, "useUpgrade", { upgradeId: "artsDetonator", automatonUuid: auto.uuid }));
  assert.ok(result.warnings.some(w => w.id === "overuse"), "the spent use is still reported above 0 HP");
});

test("U4-CAP-1 (red, LOW): the Automaton maximum warning does not attribute a 'crumbles' rule to the source", async () => {
  await ready();
  const art = makeArtificer({ level: 1 });
  enlist(art, makeAutomaton({ creator: art.uuid, variant: "platform" }));
  const result = await outcome(() => Uses.supporterUses.plan(art, "buildAutomaton", buildData("platform")));
  assert.ok(result.warnings.some(w => w.id === "cap" || /maximum|limit/i.test(w.text ?? "")), `the cap is warned (guard): ${warningText(result.warnings) || result.threw?.message}`);
  // C3:6895 and C3:6938 state the limit only. No line of the source says an Automaton "crumbles".
  assert.doesNotMatch(warningText(result.warnings), /crumble/i, "no invented rule is attributed to the source");
});

/* ==========================================================================
   6. HTML rendering of player-chosen names (LOW): receipts with html = true are not escaped
   ========================================================================== */

test("U4-ESC-1 (red, LOW): an As One card does not render an Automaton's name as live HTML", async () => {
  const { A } = await ready();
  const art = makeArtificer({ level: 1 });
  const auto = enlist(art, makeAutomaton({ name: "<img src=x onerror=alert(3)>", creator: art.uuid, variant: "platform" }));
  const action = VARIANTS[auto.flags.ak5e.automaton.variant].actions[0];
  assert.ok(A.artificerPlans.asOne, "As One is registered (guard)");
  await run(art, "asOne", { automatonUuid: auto.uuid, action, attackAction: true }, "as-1");
  const receipt = receiptOf(art, "as-1");
  assert.equal(receipt?.html, true, "the As One card is rendered as HTML (guard for the escape question)");
  assert.doesNotMatch(String(receipt.summary), /<img src=x/i, "the Automaton name is escaped in the card");
});

/* ==========================================================================
   7. Plan purity, rolls, warn-not-block, and the Automaton destroy hook (guards)
   ========================================================================== */

test("U4-PLN-1 (guard): planning writes nothing (Cancel changes nothing): no actor writes, flags or messages", async () => {
  await ready();
  const art = makeArtificer({ level: 5 });
  const ally = createTestActor({ name: "Ally", hp: { value: 10, max: 10, temp: 0 } });
  const writesBefore = art.writes.length, flagsBefore = JSON.stringify(art.flags), messagesBefore = game.messages.length;
  await outcome(() => Uses.supporterUses.plan(art, "aidTempHP", { targetUuid: ally.uuid, targetName: "Ally", amount: 5 }));
  await outcome(() => Uses.supporterUses.plan(art, "buildAutomaton", buildData("platform")));
  assert.equal(art.writes.length, writesBefore, "planning does not update the Artificer");
  assert.equal(JSON.stringify(art.flags), flagsBefore, "planning does not change flags");
  assert.equal(game.messages.length, messagesBefore, "planning does not post a card");
});

test("U4-PLN-2 (guard): no roll runs during plans or the Save temp HP apply; the die is rolled only on the click", async () => {
  await ready();
  const calls = forbidRolls();
  const art = makeArtificer({ level: 5 });
  const ally = createTestActor({ name: "Ally", hp: { value: 10, max: 10, temp: 0 } });
  await outcome(() => Uses.supporterUses.plan(art, "aidTempHP", { targetUuid: ally.uuid, targetName: "Ally", amount: 5 }));
  await outcome(() => Uses.supporterUses.plan(art, "buildAutomaton", buildData("platform")));
  await run(art, "aidTempHP", { targetUuid: ally.uuid, targetName: "Ally", amount: 5 }, "roll-free");
  assert.deepEqual(calls, [], "no Roll is evaluated without a click");
});

test("U4-RNG-1 (guard): a Provide Aid beyond 60 ft warns, and the warning is overridable rather than a block (C3:6633)", async () => {
  await ready();
  const art = makeArtificer({ level: 1 });
  const ally = createTestActor({ name: "Ally" });
  const warned = await outcome(() => Uses.supporterUses.plan(art, "provideAid", { targetUuid: ally.uuid, targetName: "Ally", distance: 90 }));
  assert.ok(warned.warnings.some(w => /60|range|distance|feet|ft/i.test(`${w.id} ${w.text}`)), `a range warning is raised: ${warningText(warned.warnings)}`);
  const overridden = await outcome(() => Uses.supporterUses.plan(art, "provideAid", {
    targetUuid: ally.uuid, targetName: "Ally", distance: 90, overrides: warned.warnings.map(w => w.id)
  }));
  assert.equal(overridden.threw, null, "the table can override the warning and the plan proceeds");
});

test("U4-DST-1 (guard): an Automaton reduced to 0 HP by its own client is marked destroyed (C3:6895)", async () => {
  const { A } = await ready();
  A.registerArtificerHooks();
  const { art, auto } = artificerWithAutomaton({ level: 1 }, { hp: 0 });
  assert.ok(art, "Artificer exists");
  Hooks.callAll("updateActor", auto, { system: { attributes: { hp: { value: 0 } } } }, {}, game.user.id);
  await flush();
  assert.equal(auto.flags.ak5e.automaton.destroyed, true, "0 HP destroys the Automaton (C3:6895)");
});

test("U4-DST-2 (guard): the destroy hook only acts on the client that made the change (no write from another client)", async () => {
  const { A } = await ready();
  A.registerArtificerHooks();
  const { auto } = artificerWithAutomaton({ level: 1 }, { hp: 0 });
  const writesBefore = auto.writes.length;
  Hooks.callAll("updateActor", auto, { system: { attributes: { hp: { value: 0 } } } }, {}, "some-other-user");
  await flush();
  assert.equal(auto.writes.length, writesBefore, "another client's update does not write the destroy flag");
});

/* ==========================================================================
   8. Known gaps (no test written: the contract or the harness is not in place)
   ========================================================================== */

test.todo("U4-GAP-1: Armoured Core (C3:6945): two Heavy Duty Upgrades at creation or Fort Builder, and a cap of 3 at 17th level; the creation contract is not confirmed");
test.todo("U4-GAP-2: Equipment and Proficiency Exchange (C3:6899): a Tool Kit or Vehicle Proficiency for the Engineering Kit; no implementation found");
test.todo("U4-GAP-3: supporter-sheet.mjs sends distance 0 for Provide Aid and Lighten the Load (L214-240); needs a sheet-level DialogV2 harness");
test.todo("U4-GAP-4: the Supporter sheet confirm step (confirmPlayUse) is covered only at the engine layer");
