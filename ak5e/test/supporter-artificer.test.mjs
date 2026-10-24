import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import { SUPPORTER_CLASS_ID, pbForLevel } from "../scripts/supporter-rules.mjs";
import { defineSupporterPools } from "../scripts/supporter-features.mjs";
import { supporterUses, registerSupporterPlans } from "../scripts/supporter-uses.mjs";
import { getPool } from "../scripts/resource-pools.mjs";
import {
  artificerPlans, artificerReadings, artificerPanel, artificerApi, artificerCommand,
  automatonsOf, coversOf, automatonCap, upgradeCapFor, registerArtificerHooks, defineArtificerPools
} from "../scripts/artificer-features.mjs";

/* Plans and readings register once per process (each test file runs in its own process under node --test). */
registerSupporterPlans({ plans: artificerPlans, readings: artificerReadings });

let docs;
let rolls;      // every formula the mocked Roll evaluates ("no auto-roll" assertions)
let messages;   // every chat card created
let nextTotal;  // total the next Roll returns

test.beforeEach(() => {
  rolls = [];
  messages = [];
  nextTotal = 3;
  setupFoundryGlobals({ rollEvaluator: formula => { rolls.push(formula); return nextTotal; } });
  docs = new Map();
  globalThis.fromUuidSync = uuid => docs.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => docs.get(uuid) ?? null;
  // World Actor creation (the GM relay writes through this). Keeps the requested _id, as Foundry does with keepId.
  globalThis.Actor = {
    implementation: {
      create: async data => {
        const actor = createTestActor({
          id: data._id, name: data.name, type: data.type, owner: true, ownership: data.ownership,
          system: data.system, flags: data.flags, items: data.items
        });
        actor.delete = async () => { docs.delete(actor.uuid); game.actors.delete(actor.id); };
        docs.set(actor.uuid, actor);
        return actor;
      }
    }
  };
  const create = globalThis.ChatMessage.implementation.create;
  globalThis.ChatMessage.implementation.create = async (data, opts) => {
    messages.push(data);
    return create(data, opts);
  };
  defineSupporterPools();
  defineArtificerPools();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

/** An Artificer Supporter at `level`: INT modifier `int`, Tech total 5, `cp` LMD. */
function artificer(level = 13, { int = 3, cp = 1300, owner = true, techValue = 0 } = {}) {
  const sClass = createTestItem({ name: "Supporter", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } } });
  const sub = createTestItem({ name: "Supporter: Artificer", type: "subclass",
    flags: { ak5e: { chapterThreeId: "subclass-supporter-artificer" } } });
  const actor = createTestActor({
    name: "Artificer", type: "character", owner, items: [sClass, sub],
    system: {
      attributes: { prof: pbForLevel(level) },
      abilities: {
        int: { mod: int, value: 10 + 2 * int }, wis: { mod: 0, value: 10 }, cha: { mod: 0, value: 10 },
        con: { mod: 0, value: 10 }, dex: { mod: 0, value: 10 }, str: { mod: 0, value: 10 }
      },
      skills: { ak5etech: { total: 5, value: techValue } },
      currency: { cp },
      traits: { weaponProf: { custom: "" }, toolProf: { custom: "" } }
    },
    flags: { ak5e: { supporter: { enabled: true, branch: "artificer", aidAbility: "int" } } }
  });
  docs.set(actor.uuid, actor);
  return actor;
}

/** Runs a confirmed use with a stable ID. */
const run = (actor, name, data = {}, id = `op-${name}-${Math.random().toString(36).slice(2, 8)}`) =>
  supporterUses.execute(actor, name, data, id);

/** Builds an Automaton through the engine, choosing the Technology reading explicitly. */
async function build(actor, variant = "platform", technologyModifier = "intMod", id = undefined) {
  const opId = id ?? `build-${Math.random().toString(36).slice(2, 10)}`;
  await supporterUses.execute(actor, "buildAutomaton", { variant, technologyModifier }, opId);
  return { opId, automaton: docs.get(automatonsOf(actor).at(-1)?.uuid ?? "") ?? automatonsOf(actor).at(-1) };
}

/** Marks an Automaton as destroyed the way the 0 HP hook does, without a real document update. */
function destroy(automaton) {
  automaton.system.attributes.hp.value = 0;
  automaton.flags.ak5e.automaton.destroyed = true;
}

/* ------------------------------------------------------------------ cap and exemptions */

test("the Automaton cap is 1 below level 13 and 2 at level 13 (rulings A1)", () => {
  assert.equal(automatonCap(artificer(12)), 1);
  assert.equal(automatonCap(artificer(13)), 2);
  assert.equal(upgradeCapFor(artificer(16)), 2);
  assert.equal(upgradeCapFor(artificer(17)), 3);
});

test("a second Automaton at level 12 warns with Use anyway, and nothing is blocked", async () => {
  const a = artificer(12);
  await build(a);
  const plan = artificerPlans.buildAutomaton(a, supporterUses.state(a), { variant: "airSupport", technologyModifier: "intMod" });
  assert.ok(plan.warnings.some(w => w.id === "cap"), "cap warning shown");
  await assert.rejects(() => supporterUses.execute(a, "buildAutomaton", { variant: "airSupport", technologyModifier: "intMod" }, "cap-no-override"),
    error => error.name === "AK5eWarnings" || /maximum|warn/i.test(error.message) || Array.isArray(error.warnings));
  await supporterUses.execute(a, "buildAutomaton", { variant: "airSupport", technologyModifier: "intMod", overrides: ["cap"] }, "cap-anyway");
  assert.equal(automatonsOf(a).length, 2, "use anyway creates the second Automaton");
});

test("two Automatons at level 13 raise no cap warning; a third warns", async () => {
  const a = artificer(13);
  await build(a);
  assert.equal(artificerPlans.buildAutomaton(a, supporterUses.state(a), { variant: "turret", technologyModifier: "intMod" }).warnings.some(w => w.id === "cap"), false);
  await supporterUses.execute(a, "buildAutomaton", { variant: "turret", technologyModifier: "intMod" }, "second");
  assert.equal(artificerPlans.buildAutomaton(a, supporterUses.state(a), { variant: "platform", technologyModifier: "intMod" }).warnings.some(w => w.id === "cap"), true);
});

test("explicitly exempt Automatons (Ch. 4 Turret, Protocol constructs) never count against the cap", async () => {
  const a = artificer(12);
  const { automaton } = await build(a);
  automaton.flags.ak5e.automaton.exempt = true;
  // The exempt one is the only live Automaton; a new build does not count it, so there is no cap warning.
  const plan = artificerPlans.buildAutomaton(a, supporterUses.state(a), { variant: "platform", technologyModifier: "intMod" });
  assert.equal(plan.warnings.some(w => w.id === "cap"), false);
  assert.equal(artificerApi.countsAgainstCap(automaton), false);
});

/* ------------------------------------------------------------------ HP and attack derivation */

test("Professional Engineer: HP is 25 + the Technology Modifier and attack is INT + PB", async () => {
  const a = artificer(13, { int: 3 });                  // PB 5
  const { automaton } = await build(a, "platform", "intMod");
  assert.equal(automaton.system.attributes.hp.max, 28, "25 + INT mod 3");
  assert.equal(automaton.flags.ak5e.automaton.attackBonus, 8, "INT 3 + PB 5");
  assert.equal(automaton.flags.ak5e.automaton.creator, a.uuid);
  assert.equal(automaton.flags.ak5e.automaton.variant, "platform");
  assert.deepEqual(automaton.flags.ak5e.automaton.upgrades, []);
  assert.equal(automaton.flags.ak5e.automaton.personality, null);
  assert.equal(automaton.flags.ak5e.automaton.destroyed, false);
});

test("the Technology reading techTotal uses the Tech skill total", async () => {
  const a = artificer(13, { int: 3 });
  const { automaton } = await build(a, "airSupport", "techTotal");
  assert.equal(automaton.system.attributes.hp.max, 30, "25 + Tech total 5");
});

test("without a ruling or a player choice, the Technology reading is asked, never silently picked", async () => {
  const a = artificer(13);
  await assert.rejects(() => supporterUses.execute(a, "buildAutomaton", { variant: "platform" }, "no-reading"),
    error => Array.isArray(error.options) && error.options.some(option => option.value === "techTotal"));
  assert.equal(automatonsOf(a).length, 0, "nothing created before the reading is chosen");
});

test("the Automaton has the Ch. 6 template name, Construct type and Ram attack item", async () => {
  const a = artificer(13);
  const { automaton } = await build(a, "platform");
  assert.equal(automaton.type, "npc");
  assert.equal(automaton.system.details.type.value, "construct");
  assert.ok(automaton.items.find(item => item.name === "Ram"), "Ram attack item");
});

/* ------------------------------------------------------------------ Fort Builder pool */

test("Fort Builder spends from the PB pool, warns on empty, clamps at 0 and records the cover", async () => {
  const a = artificer(13);                              // PB 5
  assert.equal(getPool(a, "artificerFortBuilder").max, 5);
  for (let i = 0; i < 5; i++) await run(a, "fortBuilder", {}, `fort-${i}`);
  assert.equal(getPool(a, "artificerFortBuilder").value, 0);
  assert.equal(coversOf(a).length, 5);
  assert.equal(coversOf(a)[0].upgrades.length, 0);
  const plan = artificerPlans.fortBuilder(a, supporterUses.state(a), {});
  assert.ok(plan.warnings.some(w => w.id === "shortfall"));
  await run(a, "fortBuilder", { overrides: ["shortfall"] }, "fort-over");
  assert.equal(getPool(a, "artificerFortBuilder").value, 0, "clamped at 0");
  assert.equal(coversOf(a).length, 6);
});

test("undoing a Fort Builder use restores the pool and removes the cover", async () => {
  const a = artificer(13);
  await run(a, "fortBuilder", {}, "fort-undo");
  assert.equal(getPool(a, "artificerFortBuilder").value, 4);
  await supporterUses.undo(a, "fort-undo");
  assert.equal(getPool(a, "artificerFortBuilder").value, 5);
  assert.equal(coversOf(a).length, 0);
});

/* ------------------------------------------------------------------ rebuild LMD shortfall */

test("rebuild for 500 LMD clamps at 0 and records the shortfall", async () => {
  const a = artificer(13, { cp: 300 });
  const { automaton } = await build(a);
  destroy(automaton);
  const plan = artificerPlans.rebuildAutomaton(a, supporterUses.state(a), { automatonUuid: automaton.uuid, method: "lmd" });
  assert.ok(plan.warnings.some(w => w.id === "shortfall"), "shortfall warned");
  await run(a, "rebuildAutomaton", { automatonUuid: automaton.uuid, method: "lmd", overrides: ["shortfall"] }, "rebuild-lmd");
  assert.equal(a.system.currency.cp, 0, "LMD clamped at 0");
  assert.equal(automaton.flags.ak5e.automaton.destroyed, false);
  assert.equal(automaton.system.attributes.hp.value, automaton.system.attributes.hp.max);
  const receipt = supporterUses.receipt(a, "rebuild-lmd");
  assert.ok((receipt.shortfalls ?? []).some(text => /LMD short by 200/.test(text)), "shortfall shown on the receipt");
});

test("undo of a 500 LMD rebuild restores the LMD and the destroyed state", async () => {
  const a = artificer(13, { cp: 1300 });
  const { automaton } = await build(a);
  destroy(automaton);
  await run(a, "rebuildAutomaton", { automatonUuid: automaton.uuid, method: "lmd" }, "rebuild-undo");
  assert.equal(a.system.currency.cp, 800);
  await supporterUses.undo(a, "rebuild-undo");
  assert.equal(a.system.currency.cp, 1300);
  assert.equal(automaton.flags.ak5e.automaton.destroyed, true);
});

/* ------------------------------------------------------------------ Concussive Maintenance */

test("Concussive Maintenance expends one Aid Die, posts a heal button and heals only on the click", async () => {
  const a = artificer(10);                              // PB 4, INT aid pool 3
  const { automaton } = await build(a);
  automaton.system.attributes.hp.value = 5;
  const aidBefore = getPool(a, "aidDie").value;
  await run(a, "concussiveMaintenance", { automatonUuid: automaton.uuid, distance: 5 }, "concussive");
  assert.equal(getPool(a, "aidDie").value, aidBefore - 1, "one Aid Die expended");
  assert.equal(automaton.system.attributes.hp.value, 5, "no heal before the click");
  assert.deepEqual(rolls, [], "nothing rolled automatically");
  const card = messages.at(-1).content;
  assert.match(card, /data-ak5e-artificer-roll/, "heal roll button on the card");
  nextTotal = 12;                                       // the mocked Roll returns this total for "1d10 * 4" (d10 x PB)
  await supporterUses.command(a, "useRoll", { useId: "concussive" }, "roll-concussive");
  assert.deepEqual(rolls, ["1d10 * 4"], "rolled once, on the click, as Aid Die x PB");
  assert.equal(automaton.system.attributes.hp.value, 17, "5 + 12 healed");
});

test("Concussive Maintenance warns below level 10 and beyond the 5 ft Reach", async () => {
  const low = artificer(9);
  const { automaton: lowAuto } = await build(low);
  const lowPlan = artificerPlans.concussiveMaintenance(low, supporterUses.state(low), { automatonUuid: lowAuto.uuid, distance: 5 });
  assert.ok(lowPlan.warnings.some(w => w.id === "level"));
  const a = artificer(10);
  const { automaton } = await build(a);
  const far = artificerPlans.concussiveMaintenance(a, supporterUses.state(a), { automatonUuid: automaton.uuid, distance: 30 });
  assert.ok(far.warnings.some(w => w.id === "range"));
});

/* ------------------------------------------------------------------ As One */

test("As One warns on a repeat within the Turn cycle and resets at the next Turn", async () => {
  const a = artificer(5);
  const { automaton } = await build(a);
  await run(a, "asOne", { automatonUuid: automaton.uuid, action: "ram", attackAction: true }, "asone-1");
  const again = artificerPlans.asOne(a, supporterUses.state(a), { automatonUuid: automaton.uuid, action: "ram", attackAction: true });
  assert.ok(again.warnings.some(w => w.id === "repeat"), "repeat warned");
  await assert.rejects(() => supporterUses.execute(a, "asOne", { automatonUuid: automaton.uuid, action: "ram", attackAction: true }, "asone-2"));
  await supporterUses.execute(a, "asOne", { automatonUuid: automaton.uuid, action: "ram", attackAction: true, overrides: ["repeat"] }, "asone-2");
  // The artificer's next Turn clears the record (the turnStart hook writes the reset).
  await a.update({ "flags.ak5e.artificer.turn": null });
  assert.equal(artificerPlans.asOne(a, supporterUses.state(a), { automatonUuid: automaton.uuid, action: "ram", attackAction: true }).warnings.some(w => w.id === "repeat"), false);
});

test("As One cards show attack and damage buttons only", async () => {
  const a = artificer(5);
  const { automaton } = await build(a);
  await run(a, "asOne", { automatonUuid: automaton.uuid, action: "ram", attackAction: true }, "asone-card");
  const content = messages.at(-1).content;
  assert.match(content, /data-ak5e-automaton-roll="attack"/);
  assert.match(content, /data-ak5e-automaton-roll="damage"/);
  assert.deepEqual(rolls, []);
});

/* ------------------------------------------------------------------ Control */

test("commandAutomaton posts buttons and never rolls", async () => {
  const a = artificer(13);
  const { automaton } = await build(a);
  await run(a, "commandAutomaton", { automatonUuid: automaton.uuid, move: false, action: "ram", distance: 40 }, "cmd-1");
  assert.deepEqual(rolls, [], "no auto-roll");
  const content = messages.at(-1).content;
  assert.match(content, /data-ak5e-automaton-roll="attack"/);
  assert.match(content, /data-formula="1d20 \+ 8"/, "attack formula uses INT + PB");
});

test("the Bonus Action warning shows on a second command in one Turn", async () => {
  const a = artificer(13);
  const { automaton } = await build(a);
  await run(a, "commandAutomaton", { automatonUuid: automaton.uuid, move: true, distance: 20 }, "cmd-a");
  const second = artificerPlans.commandAutomaton(a, supporterUses.state(a), { automatonUuid: automaton.uuid, move: true, distance: 20 });
  assert.ok(second.warnings.some(w => w.id === "bonusAction"));
});

test("commanding beyond 100 ft warns", async () => {
  const a = artificer(13);
  const { automaton } = await build(a);
  const plan = artificerPlans.commandAutomaton(a, supporterUses.state(a), { automatonUuid: automaton.uuid, move: true, distance: 120 });
  assert.ok(plan.warnings.some(w => w.id === "range"));
});

test("a single command below level 13 cannot move and act; at 13 it can, and all Automatons are commanded", async () => {
  const low = artificer(12);
  const { automaton: lowAuto } = await build(low);
  const lowPlan = artificerPlans.commandAutomaton(low, supporterUses.state(low), { automatonUuid: lowAuto.uuid, move: true, action: "ram" });
  assert.ok(lowPlan.warnings.some(w => w.id === "level"));
  const high = artificer(13);
  await build(high);
  await build(high, "airSupport");
  const all = artificerPlans.commandAutomaton(high, supporterUses.state(high), { all: true, move: true });
  assert.equal(all.warnings.some(w => w.id === "level"), false);
});

/* ------------------------------------------------------------------ setup and Advanced Personality Matrix */

test("artificerSetup grants Heavy Melee, Vehicles (Drones) and Expert Touch once", async () => {
  const a = artificer(1);
  await run(a, "artificerSetup", {}, "setup-1");
  assert.match(a.system.traits.weaponProf.custom, /Heavy Melee Weapons/);
  assert.match(a.system.traits.toolProf.custom, /Vehicles \(Drones\)/);
  assert.equal(a.system.skills.ak5etech.value, 1, "Tech proficiency");
  assert.equal(a.flags.ak5e.artificer.calculatedStrikes, true);
  await run(a, "artificerSetup", {}, "setup-2");
  assert.equal(a.system.skills.ak5etech.value, 1, "Expert Touch is not applied twice");
  assert.equal(a.system.traits.weaponProf.custom.split("Heavy Melee Weapons").length, 2, "no duplicate weapon text");
});

test("the Advanced Personality Matrix sets INT/WIS/CHA to 10 and two saves, then undo restores them", async () => {
  const a = artificer(13);
  const { automaton } = await build(a);
  await run(a, "advancedPersonalityMatrix", { saves: ["con", "wis"] }, "apm");
  assert.equal(automaton.system.abilities.int.value, 10);
  assert.equal(automaton.system.abilities.wis.value, 10);
  assert.equal(automaton.system.abilities.cha.value, 10);
  assert.equal(automaton.system.abilities.con.proficient, 1);
  assert.equal(automaton.system.abilities.wis.proficient, 1);
  await supporterUses.undo(a, "apm");
  assert.equal(automaton.system.abilities.int.value, 4);
  assert.equal(automaton.system.abilities.con.proficient, 0);
});

test("the Advanced Personality Matrix needs two different saves", () => {
  const a = artificer(13);
  assert.throws(() => artificerPlans.advancedPersonalityMatrix(a, supporterUses.state(a), { saves: ["con", "con"] }), /two different/);
});

/* ------------------------------------------------------------------ undo and relay */

test("undo of buildAutomaton deletes the Automaton and removes its state entry", async () => {
  const a = artificer(13);
  const { opId, automaton } = await build(a, "platform", "intMod", "build-undo");
  assert.ok(docs.has(automaton.uuid));
  await supporterUses.undo(a, "build-undo");
  assert.equal(docs.has(automaton.uuid), false, "actor removed");
  assert.deepEqual(a.flags.ak5e.artificer?.automatons ?? [], [], "state entry removed");
  assert.equal(opId, "build-undo");
});

test("with no GM connected, building an Automaton warns and creates nothing", async () => {
  setupFoundryGlobals({ rollEvaluator: () => 3, activeGM: null, user: { id: "player", name: "Player", isGM: false, targets: new Set() } });
  docs = new Map();
  globalThis.fromUuidSync = uuid => docs.get(uuid) ?? null;
  const a = artificer(13);
  const plan = artificerPlans.buildAutomaton(a, supporterUses.state(a), { variant: "platform", technologyModifier: "intMod" });
  assert.ok(plan.warnings.some(w => w.id === "noGM"), "visible warning");
  await assert.rejects(() => supporterUses.execute(a, "buildAutomaton", { variant: "platform", technologyModifier: "intMod", overrides: ["noGM"] }, "no-gm"),
    /GM/);
  assert.equal(automatonsOf(a).length, 0);
});

/* ------------------------------------------------------------------ panel and command routing */

test("the panel shows the Artificer DC, the cap, and its buttons", async () => {
  const a = artificer(13, { int: 3 });                 // PB 5
  await build(a);
  const html = artificerPanel(a);
  assert.match(html, /Artificer DC 16/, "8 + INT 3 + PB 5");
  assert.match(html, /Automatons 1 \/ 2/);
  assert.match(html, /data-supporter-cmd="buildAutomaton"/);
  assert.equal(artificerApi.artificerDC(a), 16);
});

test("artificerCommand returns undefined for commands it does not own", async () => {
  assert.equal(await artificerCommand(artificer(5), "not-an-artificer-control"), undefined);
});

test("the branch hooks install once", () => {
  assert.doesNotThrow(() => registerArtificerHooks());
  assert.doesNotThrow(() => registerArtificerHooks());
});

/* ------------------------------------------------------------------ CAP-6 and warn-not-block creator checks */

test("CAP-6: a destroyed Automaton does not count against the cap, even when not exempt", async () => {
  const a = artificer(12);
  const { automaton } = await build(a);
  assert.equal(artificerApi.countsAgainstCap(automaton), true, "live, not exempt: counts");
  destroy(automaton);
  assert.equal(artificerApi.countsAgainstCap(automaton), false, "destroyed: does not count");
  const plan = artificerPlans.buildAutomaton(a, supporterUses.state(a), { variant: "platform", technologyModifier: "intMod" });
  assert.equal(plan.warnings.some(w => w.id === "cap"), false, "a new build is not capped by the destroyed one");
});

/** An Automaton some other Artificer created (or one with no creator), placed in the document registry. */
function foreignAutomaton({ creator = "Actor.someoneElse", name = "Stray Automaton" } = {}) {
  const flags = { ak5e: { automaton: { creator, variant: "platform", upgrades: [], personality: null, destroyed: false, exempt: false, attackBonus: 4 } } };
  const automaton = createTestActor({ name, owner: true, flags, system: { attributes: { hp: { value: 25, max: 25 } }, abilities: {
    int: { mod: 4, value: 4 }, wis: { mod: 4, value: 4 }, cha: { mod: 1, value: 1 }, con: { mod: 2, value: 14 }, str: { mod: 1, value: 12 }, dex: { mod: 0, value: 10 } } } });
  docs.set(automaton.uuid, automaton);
  return automaton;
}

test("CTL-6 / CM-6 path: a foreign Automaton warns with id 'creator' on every command plan, and Use anyway proceeds", async () => {
  const a = artificer(13);
  const foreign = foreignAutomaton();
  const data = [
    ["asOne", { automatonUuid: foreign.uuid, action: "ram", attackAction: true }],
    ["commandAutomaton", { automatonUuid: foreign.uuid, move: true, distance: 10 }],
    ["concussiveMaintenance", { automatonUuid: foreign.uuid, distance: 5 }],
    ["rebuildAutomaton", { automatonUuid: foreign.uuid, method: "longRest" }],
    ["advancedPersonalityMatrix", { automatonUuid: foreign.uuid, saves: ["con", "wis"] }]
  ];
  for (const [name, input] of data) {
    const plan = artificerPlans[name](a, supporterUses.state(a), input);
    assert.ok(plan.warnings.some(w => w.id === "creator"), `${name} warns about the creator`);
  }
  // Use anyway proceeds: the use is not blocked.
  await supporterUses.execute(a, "commandAutomaton", { automatonUuid: foreign.uuid, move: true, distance: 10, overrides: ["creator"] }, "foreign-cmd");
  assert.deepEqual(rolls, [], "still no auto-roll");
});

test("a foreign Automaton with no recorded creator also warns, with the creator id", () => {
  const a = artificer(13);
  const orphan = foreignAutomaton({ creator: null, name: "Orphan" });
  const plan = artificerPlans.asOne(a, supporterUses.state(a), { automatonUuid: orphan.uuid, action: "ram", attackAction: true });
  assert.ok(plan.warnings.some(w => w.id === "creator" && /no recorded creator/.test(w.text)));
});

test("missing, unknown, or non-Automaton UUIDs are still hard errors", () => {
  const a = artificer(13);
  assert.throws(() => artificerPlans.asOne(a, supporterUses.state(a), { action: "ram", attackAction: true }), /Choose an Automaton/);
  assert.throws(() => artificerPlans.asOne(a, supporterUses.state(a), { automatonUuid: "Actor.nope", action: "ram", attackAction: true }), /no longer exists/);
  const plain = createTestActor({ name: "Goblin", owner: true, system: {} });
  docs.set(plain.uuid, plain);
  assert.throws(() => artificerPlans.concussiveMaintenance(a, supporterUses.state(a), { automatonUuid: plain.uuid }), /not an Automaton/);
});
