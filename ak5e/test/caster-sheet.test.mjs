import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";

let id = 0;
const hooks = new Map();
let lastDialog;
globalThis.game = { user: { id: "owner", isGM: false }, i18n: { localize: key => key }, items: new Map(), packs: new Map(), scenes: new Map(), combats: new Map(), time: { worldTime: 0 } };
globalThis.foundry = { utils: { randomID: () => `caster-test-${++id}` }, applications: {
  sheets: { ActorSheetV2: class ActorSheetV2 {} },
  api: { DialogV2: { wait: async options => { lastDialog = options; return null; }, confirm: async () => false } }
} };
globalThis.Hooks = { on(name, callback) { hooks.set(name, [...(hooks.get(name) ?? []), callback]); }, once() {}, off() {} };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.fromUuid = async () => null;
globalThis.fromUuidSync = () => null;

const { renderCasterControls, openCasterControls, openCasterSetup } = await import("../scripts/caster-sheet.mjs");
const { ActorSheetV2 } = foundry.applications.sheets;

function fixture({ owner = true, branch = "core", level = 6, limited = false } = {}) {
  const { document } = parseHTML('<html><body><main><section class="tab" data-tab="features"></section><section class="tab" data-tab="spells"></section></main></body></html>');
  globalThis.document = document;
  const classItem = { id: "caster", type: "class", name: "Caster", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-caster" } }, getFlag(ns, key) { return this.flags[ns]?.[key]; } };
  const branchItem = branch ? { id: "branch", type: "subclass", name: branch, flags: { ak5e: { chapterThreeId: `subclass-caster-${branch === "mech-accord" ? "mech-accord" : branch}` } }, getFlag(ns, key) { return this.flags[ns]?.[key]; } } : null;
  const actor = { id: `actor-${++id}`, uuid: `Actor.actor-${id}`, documentName: "Actor", type: "character", name: "Caster Test", isOwner: owner, limited,
    items: new Map([[classItem.id, classItem], ...(branchItem ? [[branchItem.id, branchItem]] : [])]), flags: { ak5e: { caster: { version: 1, enabled: Boolean(branchItem), choices: { ability: "int", pools: ["flame-arts"] } } } }, system: { abilities: { int: { value: 14, mod: 2 } }, attributes: { prof: 3 } }, writes: [],
    getFlag(ns, key) { return this.flags[ns]?.[key]; }, testUserPermission(user) { return user.isGM || owner; }, async update(changes) { this.writes.push(changes); return this; } };
  classItem.parent = actor; if (branchItem) branchItem.parent = actor;
  const app = Object.assign(new ActorSheetV2(), { document: actor, element: document.querySelector("main") });
  return { actor, app, document, root: app.element };
}

test("Caster sheet panels survive full and partial renders without duplicate controls or writes", () => {
  const f = fixture();
  renderCasterControls(f.app, f.root);
  renderCasterControls(f.app, f.root.querySelector('.tab[data-tab="features"]'));
  renderCasterControls(f.app, f.root.querySelector('.tab[data-tab="spells"]'));
  assert.equal(f.root.querySelectorAll(".ak5e-caster-sheet-panel").length, 2);
  assert.equal(f.root.querySelectorAll('.ak5e-caster-sheet-panel button').length, 2);
  assert.equal(f.root.querySelectorAll('.ak5e-caster-sheet-panel input, .ak5e-caster-sheet-panel select').length, 0);
  assert.equal(f.actor.writes.length, 0);
});

test("unowned and limited observers receive no Caster controls or private panel content", () => {
  const observer = fixture({ owner: false });
  renderCasterControls(observer.app, observer.root);
  assert.equal(observer.root.querySelectorAll(".ak5e-caster-sheet-panel").length, 0);
  assert.equal(observer.actor.writes.length, 0);

  const limited = fixture({ owner: false, limited: true });
  renderCasterControls(limited.app, limited.root);
  assert.equal(limited.root.querySelectorAll(".ak5e-caster-sheet-panel").length, 0);
  assert.equal(limited.actor.writes.length, 0);
});

test("Core and Mystic controls expose only their own branch actions in the native sheet menu", async () => {
  const core = fixture({ branch: "core", level: 15 });
  await openCasterControls(core.actor);
  assert.match(lastDialog.content, /data-caster-ui="rabbit"/);
  assert.match(lastDialog.content, /data-caster-ui="signature"/);
  assert.doesNotMatch(lastDialog.content, /data-caster-ui="beginRitual"/);

  const mystic = fixture({ branch: "mystic" });
  await openCasterControls(mystic.actor);
  assert.match(lastDialog.content, /data-caster-ui="beginRitual"/);
  assert.match(lastDialog.content, /data-caster-ui="burst"/);
  assert.doesNotMatch(lastDialog.content, /data-caster-ui="rabbit"/);
});

test("an applying setup receipt has a direct resume workflow instead of generic reconciliation", async () => {
  const f = fixture({ branch: "core", level: 8 });
  f.actor.flags.ak5e.caster.operations = [{ id: "setup-receipt-1", status: "applying", progression: { scalarPlan: {} }, choices: { ability: "int", branch: "subclass-caster-core", pools: ["flame-arts", "ice-arts"] } }];
  await openCasterControls(f.actor);
  assert.match(lastDialog.content, /data-caster-ui="resumeSetup"/);
  assert.match(lastDialog.content, /setup-receipt-1/);
  assert.doesNotMatch(lastDialog.content, /data-caster-ui="reconcile"/);
});

test("GM controls offer recovery for interrupted bursts and committed event failures", async () => {
  const f=fixture({branch:"mystic",level:6});game.user.isGM=true;
  f.actor.flags.ak5e.caster.operations=[{id:"event-receipt",status:"eventFailed",command:"finishRitual"}];
  f.actor.flags.ak5e.caster.burst={remaining:2,total:3,interrupted:true,castIds:["burst-receipt"]};
  await openCasterControls(f.actor);
  assert.match(lastDialog.content,/data-caster-ui="reconcile"[^>]*data-operation-id="event-receipt"/);
  assert.match(lastDialog.content,/data-caster-ui="reconcile"[^>]*data-operation-id="burst_burst-receipt"/);
});

test("Caster setup retains branch choice locally, reveals Core's two-pool requirement, and cancellation writes nothing", async () => {
  const f = fixture({ branch: null, level: 1 });
  const originalWait = foundry.applications.api.DialogV2.wait;
  let stage = 0;
  foundry.applications.api.DialogV2.wait = async options => {
    lastDialog = options;
    stage += 1;
    if (stage === 1) {
      assert.match(options.content, /Choose a Caster Branch/);
      const branch = "subclass-caster-core";
      const form = {
        querySelectorAll(selector) {
          if (selector === '[name="branch"]:checked') return [{ name: "branch", value: branch }];
          return [];
        },
        elements: { sourceConfirmed: { checked: true }, namedItem(name) { return name === "branch" ? { value: branch } : null; } }
      };
      const button = { form };
      return options.buttons.find(item => item.action === "continue").callback(null, button);
    }
    assert.match(options.content, /choose 2/i);
    assert.match(options.content, /Standard Arts Pool/i);
    return null;
  };
  try {
    const result = await openCasterSetup(f.actor);
    assert.equal(result, null);
    assert.equal(stage, 2);
    assert.equal(f.actor.writes.length, 0);
  } finally {
    foundry.applications.api.DialogV2.wait = originalWait;
  }
});
