import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { CHAPTER_THREE_CLASSES as records } from "../scripts/chapter-three-content.mjs";
import { getOperatorSkillChoices, operatorChoiceUser } from "../scripts/operator-progression.mjs";

const gm = { id: "gm", isGM: true, active: true }, owner = { id: "owner", isGM: false, active: true },
  owner2 = { id: "owner2", isGM: false, active: true }, stranger = { id: "stranger", isGM: false, active: true },
  gm2 = { id: "gm2", isGM: true, active: true };
let nextId = 0;
const hooks = new Map(), errors = [];
globalThis.game = { user: gm, users: new Map([gm, owner, owner2, stranger, gm2].map(user => [user.id, user])), actors: new Map(), combats: new Map(),
  time: { worldTime: 0 }, i18n: { localize: key => key } };
game.users.activeGM = gm;
globalThis.CONFIG = { time: { roundTime: 6 } };
globalThis.ui = { notifications: { error: error => errors.push(error) } };
globalThis.Hooks = { on(name, callback) { hooks.set(name, [...hooks.get(name) ?? [], callback]); }, off() {} };
globalThis.foundry = { utils: { randomID: () => `request${++nextId}` }, applications: { sheets: { ActorSheetV2: class {} }, api: {} } };
const runtime = await import("../scripts/operator-skills.mjs");
const sheet = await import("../scripts/operator-sheet.mjs");
const source = id => records.find(entry => entry.id === id);

function addItem(actor, data) {
  const id = `item${++nextId}`;
  const item = { ...structuredClone(data), id, uuid: `${actor.uuid}.Item.${id}`, parent: actor,
    getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; } };
  actor.items.set(id, item); return item;
}
function addClass(actor, name = "Caster", level = 1) {
  const entry = records.find(entry => entry.kind === "class" && entry.name === name);
  return addItem(actor, { name, type: "class", system: { ...entry.systemData, levels: level }, flags: { ak5e: { chapterThreeId: entry.id } } });
}
function addBranch(actor, name) {
  const entry = records.find(entry => entry.kind === "subclass" && entry.name === name);
  return addItem(actor, { name, type: "subclass", system: entry.systemData, flags: { ak5e: { chapterThreeId: entry.id } } });
}
function actor(name = "Caster", level = 1, enabled = false) {
  const id = `actor${++nextId}`;
  const result = { id, uuid: `Actor.${id}`, name: id, type: "character", documentName: "Actor", items: new Map(),
    flags: { ak5e: { operatorSkills: { enabled, points: 7, maximum: 12, start: 4 } } }, writes: [], creates: [],
    get isOwner() { return this.testUserPermission(game.user); },
    testUserPermission(user) { return user.isGM || [owner.id, owner2.id].includes(user.id); },
    getFlag(namespace, key) { return this.flags[namespace]?.[key]; },
    async update(change) {
      if (this.failSave) return false;
      this.writes.push(structuredClone(change)); this.flags.ak5e.operatorSkills = structuredClone(change["flags.ak5e.operatorSkills"]); return this;
    },
    async createEmbeddedDocuments(_type, entries) {
      this.creates.push(entries);
      if (this.partialCreate) { addItem(this, entries[0]); this.partialCreate = false; throw new Error("Partial create"); }
      if (this.preventCreate) return [];
      return entries.map(entry => addItem(this, entry));
    }
  };
  game.actors.set(id, result); if (name) addClass(result, name, level); return result;
}
function request(actor, choices = getOperatorSkillChoices(actor), replacements = {}) {
  return { contextKey: choices.contextKey, selections: choices.pending.map(slot => ({ key: slot.key, sourceId: slot.options[0].id })), ...replacements };
}
function command(actor, command, data = {}, user = owner, id = `cmd${++nextId}`) {
  return runtime.executeOperatorCommand(actor, { id, command, data }, user);
}

test("all eight classes earn exactly Basic/Advanced/Elite at class levels 2/7/14", () => {
  for (const name of records.filter(entry => entry.kind === "class").map(entry => entry.name)) {
    for (const [level, tiers] of [[1, []], [2, ["Basic"]], [6, ["Basic"]], [7, ["Basic", "Advanced"]], [13, ["Basic", "Advanced"]], [14, ["Basic", "Advanced", "Elite"]]]) {
      const pc = actor(name, level); pc.system = { details: { level: 20 } };
      const view = getOperatorSkillChoices(pc);
      assert.deepEqual(view.pending.map(slot => slot.tier), tiers, `${name} ${level}`);
      for (const slot of view.pending) {
        assert.ok(slot.options.length);
        assert.ok(slot.options.every(entry => entry.parentClass === name && !entry.parentBranch && entry.operatorSkill.tier === slot.tier));
      }
      assert.equal(pc.writes.length, 0);
    }
  }
});

test("branch options use the granting level, including catch-up Basic at level 14", () => {
  for (const [className, branch, extra] of [["Defender", "Sentry", "Marksman"], ["Medic", "Witchcraft", "Caster"]]) {
    const pc = actor(className, 14); addBranch(pc, `${className}: ${branch}`);
    const view = getOperatorSkillChoices(pc);
    assert.deepEqual([...new Set(view.pending[0].options.map(entry => entry.parentClass))], [className]);
    for (const slot of view.pending.slice(1)) assert.deepEqual(new Set(slot.options.map(entry => entry.parentClass)), new Set([className, extra]));
  }
  const pc = actor("Guard", 14); addBranch(pc, "Guard: Liberator");
  for (const slot of getOperatorSkillChoices(pc).pending) assert.deepEqual(new Set(slot.options.map(entry => entry.parentBranch)), new Set([null, "Liberator"]));
  const plain = actor("Guard", 14); addBranch(plain, "Guard: Artsblade");
  assert.ok(getOperatorSkillChoices(plain).pending.every(slot => slot.options.every(entry => !entry.parentBranch)));
});

test("legacy copies, including disabled Skills, satisfy one tier without writes; ambiguous/custom/ineligible copies block", () => {
  const pc = actor("Caster", 14), basic = getOperatorSkillChoices(pc).pending[0].options[0];
  const data = runtime.operatorSkillItemData(basic); data.flags.ak5e.operatorSkill.enabled = false;
  addItem(pc, data); addItem(pc, data);
  assert.deepEqual(getOperatorSkillChoices(pc).pending.map(slot => slot.tier), ["Advanced", "Elite"]);
  assert.equal(pc.writes.length, 0);
  addItem(pc, runtime.operatorSkillItemData(getOperatorSkillChoices(pc).slots[0].options[1]));
  assert.deepEqual(getOperatorSkillChoices(pc).blocked, ["AmbiguousSkills"]);
  const invalid = actor("Caster", 2);
  addItem(invalid, runtime.operatorSkillItemData(records.find(entry => entry.parentClass === "Guard" && entry.operatorSkill?.tier === "Basic")));
  assert.deepEqual(getOperatorSkillChoices(invalid).blocked, ["AmbiguousSkills"]);
  const custom = actor("Caster", 2);
  addItem(custom, { type: "feat", flags: { ak5e: { operatorSkill: { tier: "Basic", sourceId: "custom" } } } });
  assert.deepEqual(getOperatorSkillChoices(custom).blocked, ["AmbiguousSkills"]);
});

test("choice validation rejects early, wrong-tier, wrong-class, incomplete and stale requests before creating Items", async () => {
  const pc = actor("Caster", 14), view = getOperatorSkillChoices(pc), data = request(pc, view);
  await assert.rejects(command(pc, "chooseSkills", { ...data, selections: data.selections.slice(0, 1) }), /SelectAllSkills/);
  await assert.rejects(command(pc, "chooseSkills", { ...data, selections: [data.selections[0], data.selections[0]] }), /SelectAllSkills/);
  const wrong = structuredClone(data); wrong.selections[0].sourceId = view.pending[1].options[0].id;
  await assert.rejects(command(pc, "chooseSkills", wrong), /InvalidSkillChoice/);
  wrong.selections[0].sourceId = records.find(entry => entry.parentClass === "Guard" && entry.operatorSkill?.tier === "Basic").id;
  await assert.rejects(command(pc, "chooseSkills", wrong), /InvalidSkillChoice/);
  await assert.rejects(command(pc, "chooseSkills", { ...data, contextKey: "old" }), /StaleChoices/);
  const early = actor("Caster", 1), earlyView = getOperatorSkillChoices(early);
  await assert.rejects(command(early, "chooseSkills", { contextKey: earlyView.contextKey, selections: [{ key: earlyView.slots[0].key, sourceId: earlyView.slots[0].options[0].id }] }), /InvalidSkillChoice/);
  assert.equal(pc.creates.length, 0); assert.equal(early.creates.length, 0);
});

test("simultaneous owners and repeat IDs grant once, preserve manual SP and refuse later replacement", async () => {
  const pc = actor("Caster", 14), data = request(pc);
  const [first, second] = await Promise.all([command(pc, "chooseSkills", data, owner, "first"), command(pc, "chooseSkills", data, owner2, "second")]);
  assert.deepEqual(first.result, second.result); assert.equal(pc.creates.length, 1);
  await command(pc, "chooseSkills", data, owner, "first"); assert.equal(pc.creates.length, 1);
  assert.equal(pc.flags.ak5e.operatorSkills.points, 7); assert.equal(pc.flags.ak5e.operatorSkills.enabled, false);
  assert.equal(Object.keys(pc.flags.ak5e.operatorSkills.progression.choices).length, 3);
  const different = structuredClone(data); different.selections[0].sourceId = getOperatorSkillChoices(pc).slots[0].options[1].id;
  await assert.rejects(command(pc, "chooseSkills", different), /InvalidSkillChoice/);
  const active = actor("Caster", 14, true), basic = getOperatorSkillChoices(active).pending[0].options[0];
  addItem(active, runtime.operatorSkillItemData(basic));
  await command(active, "chooseSkills", request(active));
  assert.equal(active.flags.ak5e.operatorSkills.points, 7); assert.equal(active.flags.ak5e.operatorSkills.enabled, true);
});

test("saved choices survive level reduction, class replacement and Item deletion, and GM restoration repairs missing references", async () => {
  const pc = actor("Guard", 14); addBranch(pc, "Guard: Liberator");
  const data = request(pc); await command(pc, "chooseSkills", data);
  const cls = [...pc.items.values()].find(item => item.type === "class"); cls.system.levels = 1;
  for (const item of [...pc.items.values()]) if (item.type === "subclass" || item.type === "feat") pc.items.delete(item.id);
  let view = getOperatorSkillChoices(pc);
  assert.equal(view.pending.length, 0); assert.ok(view.slots.every(slot => slot.status === "chosen"));
  assert.deepEqual(view.blocked, ["MissingChosenSkill"]);
  pc.items.delete(cls.id); addClass(pc, "Guard", 14);
  assert.equal(getOperatorSkillChoices(pc).pending.length, 0);
  for (const choice of data.selections) addItem(pc, runtime.operatorSkillItemData(source(choice.sourceId)));
  view = getOperatorSkillChoices(pc); assert.equal(view.blocked.length, 0);
  await command(pc, "checkChoices");
  assert.ok(view.slots.every(slot => pc.items.has(pc.flags.ak5e.operatorSkills.progression.choices[slot.key].itemId)));
});

test("interrupted or prevented creation and Actor save failures recover with markers without duplicate grants or changed SP", async () => {
  for (const failure of ["failSave", "partialCreate", "preventCreate"]) {
    const pc = actor("Caster", 14), data = request(pc); pc[failure] = true;
    await assert.rejects(command(pc, "chooseSkills", data, owner, `failure-${failure}`));
    assert.equal(pc.flags.ak5e.operatorSkills.points, 7);
    if (failure === "failSave") assert.equal(getOperatorSkillChoices(pc).slots.filter(slot => slot.recovery).length, 3);
    pc[failure] = false;
    await command(pc, "chooseSkills", data, owner, `failure-${failure}`);
    assert.equal([...pc.items.values()].filter(item => item.type === "feat").length, 3);
    assert.equal(getOperatorSkillChoices(pc).pending.length, 0);
    assert.equal(getOperatorSkillChoices(pc).slots.filter(slot => slot.recovery).length, 0);
    assert.equal(pc.flags.ak5e.operatorSkills.points, 7);
  }
});

test("permissions, designated GM authority, clone exclusions and manual GM/NPC learning are enforced", async () => {
  const pc = actor("Caster", 2), data = request(pc);
  await assert.rejects(command(pc, "chooseSkills", data, stranger), /OwnerRequired/);
  await assert.rejects(command(pc, "learn", { sourceId: data.selections[0].sourceId }, owner), /UseSkillChoices/);
  game.user = gm2; await assert.rejects(command(pc, "chooseSkills", data), /GMRequired/); game.user = gm;
  const clone = { ...pc }; await assert.rejects(command(clone, "chooseSkills", data), /ChoiceActorRequired/);
  for (const type of ["npc", "character"]) {
    const manual = actor(null); manual.type = type;
    await command(manual, "learn", { sourceId: data.selections[0].sourceId }, type === "npc" ? owner : gm);
    assert.equal([...manual.items.values()].filter(item => item.type === "feat").length, 1);
    assert.equal(getOperatorSkillChoices(manual).applicable, false);
  }
  game.users.activeGM = null;
  await assert.rejects(runtime.submitOperatorCommand(pc, "chooseSkills", data), /GMRequired/);
  game.users.activeGM = gm;
  const message = { author: stranger, flags: { ak5e: { spRequest: { actorUuid: pc.uuid, command: "chooseSkills", data, id: "forged" } } },
    getFlag(ns, key) { return this.flags[ns]?.[key]; }, async update(change) { this.response = change["flags.ak5e.spResponse"]; } };
  globalThis.fromUuid = async () => pc;
  await runtime.handleOperatorRequest(message, {}, owner.id); assert.equal(message.response.ok, false);
});

test("automatic prompt owner election prefers assigned players and falls back deterministically", () => {
  const pc = actor("Caster", 2);
  assert.equal(operatorChoiceUser(pc, game.users).id, owner.id);
  owner2.character = pc; assert.equal(operatorChoiceUser(pc, game.users).id, owner2.id);
  owner2.active = false; assert.equal(operatorChoiceUser(pc, game.users).id, owner.id);
  owner.active = false; assert.equal(operatorChoiceUser(pc, game.users).id, gm.id);
  owner.active = true; owner2.active = true; delete owner2.character;
});

function mockDialogs(plays) {
  const observed = [];
  foundry.applications.api.DialogV2 = { async wait(config) {
    const play = plays.shift(); assert.ok(play, "Unexpected automatic dialog");
    const { document, window } = parseHTML(`<html><body><dialog>${config.content}<footer>${config.buttons.map(button => `<button data-action="${button.action}">${button.label}</button>`).join("")}</footer></dialog></body></html>`);
    const closeListeners = [];
    const app = { element: document.querySelector("dialog"), addEventListener(name, listener) { if (name === "close") closeListeners.push(listener); } };
    config.render?.(null, app);
    assert.equal(app.element.querySelector('[data-action="learnSkills"]')?.disabled, play.initialDisabled ?? true);
    for (const control of app.element.querySelectorAll(".ak5e-skill-choices select")) {
      if (play.select) {
        for (const option of control.querySelectorAll("option")) option.removeAttribute("selected");
        control.querySelectorAll("option")[1].setAttribute("selected", "");
        control.dispatchEvent(new window.Event("change"));
      }
    }
    play.inspect?.(app.element);
    observed.push(app.element);
    const button = config.buttons.find(button => button.action === (play.action ?? "later"));
    const elements = Object.fromEntries([...app.element.querySelectorAll("select,input")].map(control => [control.name, control]));
    const result = button?.callback?.(null, { form: { elements } });
    for (const close of closeListeners) close();
    return result;
  } };
  return observed;
}

test("choice popup previews exact rules, requires explicit selections, cancels without writes, suppresses repeats and reopens manually", async () => {
  const pc = actor("Caster", 14);
  const before = structuredClone(pc.flags);
  const observed = mockDialogs([{ select: true, inspect(element) {
    assert.equal(element.querySelectorAll(".ak5e-choice-preview").length, 3);
    assert.equal(element.querySelector('[data-action="learnSkills"]').disabled, false);
    for (const slot of getOperatorSkillChoices(pc).pending) assert.equal(element.querySelector(`[data-tier="${slot.tier}"]`).innerHTML, slot.options[0].content);
  } }, {}, {}, {}]);
  const pending = sheet.openOperatorSkillChoices(pc, { automatic: true });
  assert.equal(sheet.openOperatorSkillChoices(pc), pending, "Two concurrent opens share one dialog");
  assert.equal(await pending, false); assert.deepEqual(pc.flags, before); assert.equal(pc.writes.length, 0);
  await sheet.openOperatorSkillChoices(pc, { automatic: true }); assert.equal(observed.length, 1);
  await sheet.openOperatorSkillChoices(pc); assert.equal(observed.length, 2);
  pc.items.values().next().value.system.levels = 15;
  await sheet.openOperatorSkillChoices(pc, { automatic: true }); assert.equal(observed.length, 2);
  const lower = actor("Caster", 6);
  await sheet.openOperatorSkillChoices(lower, { automatic: true }); assert.equal(observed.length, 3);
  lower.items.values().next().value.system.levels = 7;
  await sheet.openOperatorSkillChoices(lower, { automatic: true }); assert.equal(observed.length, 4);
});

test("manual UI learning commits all pending tiers through the GM queue", async () => {
  const pc = actor("Caster", 14);
  mockDialogs([{ select: true, action: "learnSkills" }]);
  assert.equal(await sheet.openOperatorSkillChoices(pc), true);
  assert.equal(getOperatorSkillChoices(pc).pending.length, 0); assert.equal(pc.creates.length, 1);
  assert.equal(pc.flags.ak5e.operatorSkills.points, 7);
});

test("failed final save reopens the UI with fixed recovery selections and retries without duplicate Items", async () => {
  const pc = actor("Guard", 2); addBranch(pc, "Guard: Liberator");
  pc.failSave = true;
  const dialogs = mockDialogs([{ select: true, action: "learnSkills" }, { initialDisabled: false, action: "learnSkills", inspect(element) {
    assert.equal(element.querySelector("select").disabled, true);
    assert.equal(element.querySelector('[data-action="learnSkills"]').disabled, false);
    pc.failSave = false;
  } }]);
  assert.equal(await sheet.openOperatorSkillChoices(pc), true);
  assert.equal(dialogs.length, 2); assert.equal(pc.creates.length, 1);
  assert.equal(getOperatorSkillChoices(pc).slots[0].recovery, false);
});

test("unmanaged classes, unknown Branches and multiclass Actors do not produce guessed choices", () => {
  const unmanaged = actor(null); addItem(unmanaged, { type: "class", name: "Caster", system: { levels: 14 } });
  assert.equal(getOperatorSkillChoices(unmanaged).applicable, false);
  const unknown = actor("Caster", 2); addItem(unknown, { type: "subclass", name: "Core" });
  assert.deepEqual(getOperatorSkillChoices(unknown).blocked, ["UnknownBranch"]);
  const multiple = actor("Caster", 14); addClass(multiple, "Guard", 1);
  assert.deepEqual(getOperatorSkillChoices(multiple).blocked, ["MultipleClasses"]);
  const invalid = actor("Caster", 1); invalid.items.values().next().value.system.levels = 1.5;
  assert.deepEqual(getOperatorSkillChoices(invalid).blocked, ["InvalidClassLevel"]);
});

test("B-011: the Choose Skills dialog never opens over a Vanguard (or any class) that has nothing to choose", async () => {
  // Vanguard is a managed class with its own Operator Skills (35 in the catalogue), so it is "applicable",
  // but at level 1 every tier is still locked: no pending, blocked or recovery slot, hence no dialog.
  const vanguard = actor("Vanguard", 1); addBranch(vanguard, "Vanguard: Standard Bearer");
  const view = getOperatorSkillChoices(vanguard);
  assert.equal(view.applicable, true); assert.equal(view.className, "Vanguard"); assert.equal(view.branchName, "Standard Bearer");
  assert.deepEqual(view.slots.map(slot => slot.status), ["locked", "locked", "locked"]);
  assert.deepEqual([view.pending, view.blocked], [[], []]); assert.equal(view.promptKey, null);
  assert.equal(view.slots.some(slot => slot.recovery), false);
  // A class the module does not manage, a non-character, and an Actor with no class are not applicable at all.
  const unmanaged = actor(null); addItem(unmanaged, { type: "class", name: "Wizard", system: { levels: 14 } });
  const npc = actor("Vanguard", 14); npc.type = "npc";
  const classless = actor(null);
  for (const other of [unmanaged, npc, classless]) {
    const result = getOperatorSkillChoices(other);
    assert.equal(result.applicable, false); assert.deepEqual([result.slots, result.pending, result.blocked], [[], [], []]);
  }
  // Neither the automatic (sheet render / progression) nor the manual path may open a dialog for those Actors.
  const observed = mockDialogs([]);                                   // any dialog.wait call fails "Unexpected automatic dialog"
  for (const other of [vanguard, unmanaged, classless]) {
    assert.equal(await sheet.openOperatorSkillChoices(other, { automatic: true }), false);
    assert.equal(await sheet.openOperatorSkillChoices(other), false);
  }
  assert.equal(observed.length, 0);
  // Genuine trigger: from level 2 an unchosen Basic tier is pending, with only Vanguard Basic options.
  vanguard.items.values().next().value.system.levels = 2;
  const unlocked = getOperatorSkillChoices(vanguard);
  assert.deepEqual(unlocked.pending.map(slot => slot.tier), ["Basic"]);
  assert.ok(unlocked.pending[0].options.length > 0);
  assert.ok(unlocked.pending[0].options.every(entry => entry.parentClass === "Vanguard" && entry.operatorSkill.tier === "Basic"));
  // Once the Basic tier is learned the dialog has nothing left to offer.
  addItem(vanguard, runtime.operatorSkillItemData(unlocked.pending[0].options[0]));
  const learned = getOperatorSkillChoices(vanguard);
  assert.deepEqual([learned.pending, learned.blocked], [[], []]); assert.equal(learned.promptKey, null);
  assert.equal(await sheet.openOperatorSkillChoices(vanguard, { automatic: true }), false);
  assert.equal(observed.length, 0);
});

test("committed changes coalesce, native advancement waits for completion, clones and other owners never get duplicate automatic prompts", async () => {
  sheet.registerOperatorSheetHooks();
  const pc = actor("Caster", 1), cls = pc.items.values().next().value;
  const invoke = (name, ...args) => { for (const callback of hooks.get(name) ?? []) callback(...args); };
  const originalUpdate = pc.update;
  pc.update = async function(change) { const result = await originalUpdate.call(this, change); invoke("updateActor", this, change, {}); return result; };
  const observed = mockDialogs([{}]);
  invoke("dnd5e.preAdvancementManagerRender", { actor: pc }); cls.system.levels = 2;
  await assert.rejects(sheet.openOperatorSkillChoices(pc), /FinishAdvancement/);
  invoke("updateItem", cls, { system: { levels: 2 } }, { isAdvancement: true }, gm.id);
  assert.equal(await sheet.openOperatorSkillChoices(pc, { automatic: true }), false);
  invoke("dnd5e.advancementManagerComplete", { actor: pc });
  await new Promise(resolve => setTimeout(resolve, 160));
  assert.equal(observed.length, 0, "Assigned player gets the prompt, not the GM");
  game.user = owner;
  invoke("updateActor", pc, { flags: { ak5e: { operatorSkills: { progression: pc.flags.ak5e.operatorSkills.progression } } } }, {});
  await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(observed.length, 1);
  game.user = owner2;
  invoke("updateActor", pc, { flags: { ak5e: { operatorSkills: { progression: {} } } } }, {});
  await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(observed.length, 1);
  game.user = gm;
  const before = pc.writes.length;
  cls.system.levels = 3;
  invoke("updateItem", cls, { system: { levels: 3 } }, {}, gm.id);
  invoke("updateItem", cls, { system: { levels: 3 } }, {}, gm.id);
  invoke("updateItem", { ...cls, parent: { ...pc } }, { system: { levels: 3 } }, {}, gm.id);
  await new Promise(resolve => setTimeout(resolve, 160)); assert.equal(pc.writes.length, before + 1);
});

test("native advancement preserves current choice receipts, SP and Skill Items acquired after its clone snapshot", async () => {
  const pc = actor("Caster", 14), earlier = structuredClone(pc.flags);
  await command(pc, "chooseSkills", request(pc));
  const picked = [...pc.items.values()].filter(item => item.getFlag("ak5e", "operatorSkillChoice"));
  const cls = pc.items.values().next().value;
  const updates = { flags: earlier }, toDelete = [cls.id, ...picked.map(item => item.id)],
    toUpdate = [{ _id: picked[0].id, flags: { ak5e: {} } }];
  // Only the current AK5e namespace and its managed grants are protected.
  updates.flags.otherModule = { value: "native clone" };
  for (const callback of hooks.get("dnd5e.preAdvancementManagerComplete")) callback({ actor: pc }, updates, [], toUpdate, toDelete);
  assert.deepEqual(updates.flags.ak5e.operatorSkills, pc.flags.ak5e.operatorSkills);
  assert.deepEqual(toDelete, [cls.id]);
  assert.deepEqual(toUpdate[0].flags.ak5e.operatorSkillChoice, picked[0].getFlag("ak5e", "operatorSkillChoice"));
  assert.deepEqual(updates.flags.otherModule, { value: "native clone" });
});
