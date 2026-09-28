import test from "node:test";
import assert from "node:assert/strict";
import { CHAPTER_TWO_ORIGINS as ORIGINS } from "../scripts/chapter-two-content.mjs";
import { buildOriginPlan, prepareOriginChanges, validateOriginChoices, applyOriginSetup, openOriginSetup, registerOriginHooks, registerOriginConfig, TACTICS, TOOLS } from "../scripts/origin-setup.mjs";

globalThis.game = { user: { id: "player" } };
globalThis.ui = { notifications: { info() {}, error() {}, warn() {} } };
function set(object, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  let target = object;
  for (const key of keys) target = target[key] ??= {};
  target[last] = structuredClone(value);
}
function fixture(name) {
  const entry = ORIGINS.find(e => e.name === name && e.kind === "background");
  const actor = { documentName: "Actor", type: "character", uuid: "Actor.test", isOwner: true, flags: {}, items: new Map(), system: { skills: {}, tools: {}, traits: {} }, writes: [], created: [] };
  actor._source = { system: actor.system };
  actor.update = async data => { actor.writes.push(data); for (const [k, v] of Object.entries(data)) set(actor, k, v); };
  actor.createEmbeddedDocuments = async (_type, data) => { actor.created.push(...data); return data; };
  const item = { id: "origin", name: entry.name, parent: actor, flags: { ak5e: { chapterTwoId: entry.id } } };
  actor.items.set(item.id, item);
  return { actor, item, entry };
}
function defaults(plan) {
  const result = { notes: "GM-reviewed point allocation: Technology 3." };
  const usedTools = new Set(plan.tools);
  for (const c of plan.choices) {
    result[c.key] = c.options.filter(v => !["primaryTool", "tools"].includes(c.key) || !usedTools.has(v)).slice(0, c.count);
    if (["primaryTool", "tools"].includes(c.key)) for (const v of result[c.key]) usedTools.add(v);
  }
  return result;
}

test("all 33 backgrounds and 20 nationalities produce valid, nonempty setup plans", () => {
  const { actor, item } = fixture("Pioneer");
  const covered = ORIGINS.filter(e => ["background", "nationality"].includes(e.kind));
  assert.equal(covered.length, 53);
  for (const entry of covered) {
    const plan = buildOriginPlan(entry, actor);
    const change = prepareOriginChanges(plan, defaults(plan), actor, item);
    assert.ok(change.summary.length, entry.name);
    for (const c of plan.choices) assert.ok(c.options.length >= c.count, `${entry.name}: ${c.key}`);
  }
});

test("Military School Graduate requires two BASIC tactics, adds Officer + Acumen, never grants a kit", () => {
  const { actor, item, entry } = fixture("Military School Graduate");
  const plan = buildOriginPlan(entry, actor);
  assert.equal(TACTICS.length, 6);
  const values = { tools: ["Medical Kit"], tactics: TACTICS.slice(0, 2).map(t => t.name) };
  assert.throws(() => validateOriginChoices(plan, { ...values, tactics: values.tactics.slice(0, 1) }, actor), /exactly 2/);
  assert.throws(() => validateOriginChoices(plan, { ...values, tactics: [values.tactics[0], "Tactician: Focus Fire (4 Acumen)"] }, actor), /exactly 2/);
  const result = prepareOriginChanges(plan, values, actor, item);
  assert.equal(result.update["system.tools.ak5emessengerkit.value"], 1);
  assert.equal(result.update["system.tools.ak5emedicalkit.value"], 1);
  assert.equal(result.grants.length, 3);
  assert.deepEqual(result.grants[0].system.uses, { spent: 0, max: "3", recovery: [{ period: "lr", type: "recoverAll" }] });
  assert.ok(result.grants.every(g => g.type === "feat"));
});

test("Pioneer grants Frontier Knowledge; duplicate choices and expertise errors are rejected", () => {
  const { actor, item, entry } = fixture("Pioneer");
  const result = prepareOriginChanges(buildOriginPlan(entry, actor), { tools: ["Medical Kit"] }, actor, item);
  assert.equal(result.grants[0].name, "Frontier Knowledge");
  assert.ok(!Object.keys(result.update).some(k => /abilities/.test(k)));
  const p = buildOriginPlan(fixture("Professional").entry, actor);
  assert.throws(() => validateOriginChoices(p, { tools: ["Medical Kit", "Medical Kit"], skills: ["Arts", "Athletics"], expertise: ["Arts"] }, actor), /exactly 2/);
  assert.throws(() => validateOriginChoices(p, { tools: ["Medical Kit", "Cooking Kit"], skills: ["Arts", "Athletics"], expertise: ["Stealth"] }, actor), /Expertise/);
});

test("Officer does not create a second Acumen pool for an existing Tactician", () => {
  const { actor, item, entry } = fixture("Military School Graduate");
  actor.items.set("branch", { type: "subclass", name: "Tactician" });
  const plan = buildOriginPlan(entry, actor);
  const result = prepareOriginChanges(plan, defaults(plan), actor, item);
  assert.equal(result.grants[0].system.uses, undefined);
  assert.ok(result.summary.some(s => s.includes("existing Tactician Acumen maximum by 3")));
});

test("equipment choices exclude Firearms and special weapons; variant backgrounds resolve", () => {
  const { actor, item } = fixture("Soldier");
  const soldier = buildOriginPlan(fixture("Soldier").entry, actor);
  const weapons = soldier.choices.find(c => c.key === "equipment").options;
  assert.ok(weapons.includes("Sword") && weapons.includes("Nailgun"));
  assert.ok(!weapons.includes("Handgun") && !weapons.includes("Rocket Launcher") && !weapons.includes("Heavy Defender Shield"));
  assert.ok(weapons.every(name => !/\+\d/.test(name)), "enhanced weapons must not be starting-equipment choices");
  const veteran = buildOriginPlan(fixture("Ursus Army Veteran").entry, actor);
  const armour = prepareOriginChanges(veteran, { equipment: ["Combat Gear"] }, actor, item);
  assert.equal(armour.grants[1].type, "equipment");
  assert.equal(armour.update["system.traits.armorProf.custom"], "Combat Gear");
  const inquisitor = prepareOriginChanges(buildOriginPlan(fixture("Inquisitor").entry, actor), { tools: ["Medical Kit"] }, actor, item);
  assert.equal(inquisitor.grants[2].name, "Lantern of the Iberian Inquisition");
});

test("existing expertise and custom languages are preserved", () => {
  const { actor, item, entry } = fixture("Upper Class");
  actor.system.tools.ak5emedicalkit = { value: 2, ability: "wis" };
  actor.system.traits.languages = { custom: "Family dialect" };
  const result = prepareOriginChanges(buildOriginPlan(entry, actor), { tools: ["Medical Kit"], languages: ["Victorian"] }, actor, item);
  assert.equal(result.update["system.tools.ak5emedicalkit.value"], 2);
  assert.equal(result.update["system.tools.ak5emedicalkit.ability"], undefined);
  assert.equal(result.update["system.traits.languages.custom"], "Family dialect; Victorian");
});

test("application is owner-scoped and idempotent even after re-dropping an origin", async () => {
  const { actor, item, entry } = fixture("Pioneer");
  actor.isOwner = false;
  await assert.rejects(applyOriginSetup(actor, item, { tools: ["Medical Kit"] }), /own/);
  assert.equal(actor.writes.length, 0);
  actor.isOwner = true;
  await applyOriginSetup(actor, item, { tools: ["Medical Kit"] });
  assert.equal(actor.flags.ak5e.originSetups[entry.id].status, "complete");
  const copy = { ...item, id: "redrop" };
  actor.items.set(copy.id, copy);
  await assert.rejects(applyOriginSetup(actor, copy, { tools: ["Medical Kit"] }), /already/);
  assert.equal(actor.created.length, 1);
});

test("failed persistence leaves a recovery journal and cannot double-grant", async () => {
  const { actor, item, entry } = fixture("Pioneer");
  actor.createEmbeddedDocuments = async () => { throw new Error("test failure"); };
  await assert.rejects(applyOriginSetup(actor, item, { tools: ["Medical Kit"] }), /test failure/);
  assert.equal(actor.flags.ak5e.originSetups[entry.id].status, "applying");
  await assert.rejects(applyOriginSetup(actor, item, { tools: ["Medical Kit"] }), /already/);
});

test("opening and cancelling actually renders choices and does not apply benefits", async () => {
  const { actor, item } = fixture("Military School Graduate");
  const pages = [];
  globalThis.foundry = { applications: { api: { DialogV2: { wait: async options => { pages.push(options); return null; } } } } };
  await openOriginSetup(actor, item);
  assert.equal(pages.length, 1);
  assert.match(pages[0].content, /Choose two Basic Tactics/);
  assert.match(pages[0].content, /Medical Kit/);
  assert.equal(actor.writes.length, 0);
  assert.equal(actor.created.length, 0);
});

test("hooks open only for the initiating owner, never world imports or generated features", () => {
  const hooks = {};
  globalThis.Hooks = { on: (name, fn) => { hooks[name] = fn; } };
  registerOriginHooks();
  const { actor, item } = fixture("Pioneer");
  const calls = [];
  globalThis.foundry = { applications: { api: { DialogV2: { wait: async options => { calls.push(options); return null; } } } } };
  hooks.createItem(item, {}, "other-player");
  hooks.createItem({ ...item, parent: null }, {}, "player");
  hooks.createItem(item, { ak5eOriginSetup: true }, "player");
  assert.equal(calls.length, 0);
  hooks.createItem(item, {}, "player");
  assert.equal(calls.length, 1);
  assert.equal(actor.writes.length, 0);
});

test("character header control reopens a completed origin record", async () => {
  const hooks = {};
  globalThis.Hooks = { on: (name, fn) => { hooks[name] = fn; } };
  registerOriginHooks();
  const { actor, item } = fixture("Pioneer");
  await applyOriginSetup(actor, item, { tools: ["Medical Kit"] });
  const pages = [];
  globalThis.foundry = { applications: { api: { DialogV2: { wait: async options => {
    pages.push(options);
    return pages.length === 1 ? item.id : null;
  } } } } };
  globalThis.foundry.applications.sheets = { ActorSheetV2: class {} };
  const app = Object.assign(new foundry.applications.sheets.ActorSheetV2(), { document: actor });
  const controls = [];
  hooks.getHeaderControlsApplicationV2(app, controls);
  assert.equal(controls.length, 1);
  assert.equal(controls[0].action, "ak5eOrigins");
  assert.equal(controls[0].label, "AK5e Origins");
  await controls[0].onClick();
  assert.equal(pages.length, 2);
  assert.match(pages[1].content, /These benefits were already applied/);
  assert.match(pages[1].content, /Frontier Knowledge/);
});

test("header control is owner-only and is not duplicated", () => {
  const hooks = {};
  globalThis.Hooks = { on: (name, fn) => { hooks[name] = fn; } };
  registerOriginHooks();
  const { actor } = fixture("Pioneer");
  globalThis.foundry.applications.sheets = { ActorSheetV2: class {} };
  const app = Object.assign(new foundry.applications.sheets.ActorSheetV2(), { actor });
  const controls = [];
  hooks.getHeaderControlsApplicationV2(app, controls);
  hooks.getHeaderControlsApplicationV2(app, controls);
  assert.equal(controls.filter(control => control.action === "ak5eOrigins").length, 1);
  actor.isOwner = false;
  const unowned = [];
  hooks.getHeaderControlsApplicationV2(Object.assign(new foundry.applications.sheets.ActorSheetV2(), { document: actor }), unowned);
  assert.equal(unowned.length, 0);
  actor.isOwner = true;
  hooks.getHeaderControlsApplicationV2({ document: actor }, unowned);
  assert.equal(unowned.length, 0, "other Actor document applications must not get sheet controls");
  actor.items.clear();
  hooks.getHeaderControlsApplicationV2(app, unowned);
  assert.equal(unowned.length, 0, "characters without attached origins must not get an Origins control");
});

test("native config has labels for all kit/instrument/vehicle proficiencies", () => {
  const stockTool = { ability: "dex", id: "stockToolId" };
  globalThis.CONFIG = { DND5E: { tools: { thief: stockTool }, toolProficiencies: { art: "Artisan's Tools" }, skills: {} } };
  registerOriginConfig();
  assert.equal(Object.keys(CONFIG.DND5E.tools).length, TOOLS.length + 1);
  assert.equal(CONFIG.DND5E.tools.ak5emessengerkit.label, "Messenger Kit");
  assert.equal(CONFIG.DND5E.skills.ak5etech.ability, "int");
  // The sheet's keyLabel resolver needs this separate label table; tools.label
  // alone falls through to a compendium lookup with an undefined ID.
  for (const [key, tool] of Object.entries(CONFIG.DND5E.tools)) {
    if (key.startsWith("ak5e")) assert.equal(CONFIG.DND5E.toolProficiencies[key], tool.label);
  }
  registerOriginConfig();
  assert.equal(CONFIG.DND5E.tools.thief, stockTool);
  assert.equal(CONFIG.DND5E.toolProficiencies.art, "Artisan's Tools");
  assert.equal(Object.keys(CONFIG.DND5E.toolProficiencies).length, TOOLS.length + 1);
});
