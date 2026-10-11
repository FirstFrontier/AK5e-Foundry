import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";

const gm = { id: "gm", isGM: true };
let serial = 0;
const hooks = new Map(), documents = new Map();
globalThis.game = { user: gm, users: new Map([[gm.id, gm]]), actors: new Map(), scenes: new Map(), combats: new Map(), time: { worldTime: 0 }, i18n: { localize: key => key } };
game.users.activeGM = gm;
globalThis.CONFIG = { time: { roundTime: 6 } };
globalThis.foundry = { utils: { randomID: () => `operation-${++serial}` }, applications: {
  sheets: { ActorSheetV2: class {} },
  api: { DialogV2: { wait: async options => { globalThis.lastDialog = options; return null; }, confirm: async () => false } }
} };
globalThis.Hooks = { on(name, callback) { hooks.set(name, [...(hooks.get(name) ?? []), callback]); }, off() {} };
globalThis.ui = { notifications: { error() {}, warn() {} } };
globalThis.fromUuid = async id => documents.get(id);
globalThis.fromUuidSync = id => documents.get(id);
const { renderStandardBearerControls, renderStandardInteractionHUD, openStandardInteraction, openStandardBearer, runAction } = await import("../scripts/standard-bearer-sheet.mjs");

function fixture({ owner = true, mode = "planted", level = 17, pendingGains = {} } = {}) {
  const { document } = parseHTML('<html><body><main><section class="tab" data-tab="inventory"><div class="inventory-element"><ol><li data-item-id="standard-feature"></li></ol></div></section></main></body></html>');
  globalThis.document = document;
  const branch = CHAPTER_THREE_CLASSES.find(entry => entry.sourceHeading === "Standard Bearer" && entry.kind === "subclass");
  const feature = CHAPTER_THREE_CLASSES.find(entry => entry.sourceHeading === "1st Level: Battle Standard" && entry.parentBranch === "Standard Bearer");
  const branchItem = { id: "branch", name: "Standard Bearer", type: "subclass", parent: null, flags: { ak5e: { chapterThreeId: branch.id } },
    getFlag(ns, key) { return this.flags[ns]?.[key]; } };
  const featureItem = { id: "standard-feature", name: "Battle Standard", type: "feat", parent: null, flags: { ak5e: { chapterThreeId: feature.id } },
    getFlag(ns, key) { return this.flags[ns]?.[key]; } };
  const classItem = { id: "vanguard", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-vanguard" } },
    getFlag(ns, key) { return this.flags[ns]?.[key]; } };
  const actor = { id: `bearer-${++serial}`, uuid: `Actor.bearer-${serial}`, documentName: "Actor", name: "Banner", type: "character", isOwner: owner,
    items: new Map([[branchItem.id, branchItem], [featureItem.id, featureItem], [classItem.id, classItem]]), flags: { ak5e: { standardBearer: { version: 1, mode, fervour: 9, sourceTokenUuid: `Scene.scene.Token.bearer-${serial}`, propTokenUuid: "Scene.scene.Token.prop", cries: {}, operations: [] }, operatorSkills: { standardPendingGains: pendingGains } } },
    system: { abilities: { cha: { mod: 3 } }, attributes: { prof: 5 } }, writes: [], getFlag(ns, key) { return this.flags[ns]?.[key]; },
    testUserPermission(user) { return user.isGM || owner; }, async update(data) { this.writes.push(data); return this; } };
  branchItem.parent = featureItem.parent = classItem.parent = actor;
  const scene = { id: "scene", grid: { units: "ft", distance: 5, size: 100 }, tokens: new Map(), testUserPermission: () => true };
  const bearerToken = { id: `bearer-${serial}`, uuid: `Scene.scene.Token.bearer-${serial}`, documentName: "Token", name: "Banner", actor, parent: scene, x: 100, y: 100, width: 1, height: 1, disposition: 1, hidden: false,
    getCenterPoint() { return { x: this.x + 50, y: this.y + 50 }; } };
  const propActor = { uuid: "Actor.prop" };
  const prop = { id: "prop", uuid: "Scene.scene.Token.prop", documentName: "Token", name: "Flag", actor: propActor, parent: scene, x: 200, y: 100, width: 1, height: 1, disposition: 0, hidden: false,
    flags: { ak5e: { standardProp: { bearerUuid: actor.uuid } } }, getFlag(ns, key) { return this.flags[ns]?.[key]; }, getCenterPoint() { return { x: this.x + 50, y: this.y + 50 }; } };
  const pickerActor = { uuid: "Actor.picker", isOwner: true };
  const picker = { id: "picker", uuid: "Scene.scene.Token.picker", documentName: "Token", name: "Ally", actor: pickerActor, parent: scene, x: 250, y: 100, width: 1, height: 1, disposition: 1, hidden: false,
    getCenterPoint() { return { x: this.x + 50, y: this.y + 50 }; } };
  for (const token of [bearerToken, prop, picker]) scene.tokens.set(token.id, token);
  scene.id = "scene"; bearerToken.parent = prop.parent = picker.parent = scene;
  game.scenes = new Map([[scene.id, scene]]); game.actors = new Map([[actor.id, actor]]);
  documents.clear(); for (const doc of [actor, bearerToken, prop, picker]) documents.set(doc.uuid, doc);
  return { actor, branchItem, featureItem, scene, bearerToken, picker, document, root: document.querySelector("main") };
}

test("owner sheet controls tolerate full and partial renders without duplicates or writes", () => {
  const f = fixture();
  const app = { document: f.actor, element: f.root };
  renderStandardBearerControls(app, f.root);
  renderStandardBearerControls(app, f.root.querySelector('.tab[data-tab="inventory"]'));
  assert.equal(f.root.querySelectorAll(".ak5e-standard-controls").length, 1);
  assert.equal(f.root.querySelectorAll(".ak5e-standard-row-button").length, 1);
  assert.equal(f.root.querySelector("[data-item-id=standard-feature]").querySelectorAll("button").length, 1);
  assert.equal(f.actor.writes.length, 0);
});

test("observer sheet gets no controls; owned pickup HUD panel reveals only pickup or handoff", async () => {
  const f = fixture({ owner: false });
  renderStandardBearerControls({ document: f.actor, element: f.root }, f.root);
  assert.equal(f.root.querySelectorAll(".ak5e-standard-controls, .ak5e-standard-row-button").length, 0);
  await openStandardInteraction(f.actor, f.picker, "pickup");
  assert.match(lastDialog.content, /Pick up/);
  assert.doesNotMatch(lastDialog.content, /Fervour|Standard Bearer DC|Power Projection|Battle Cry/);
  assert.equal(f.actor.writes.length, 0);
});

test("token HUD offers a nearby planted Standard to its owned picker once", () => {
  const f = fixture({ owner: false });
  const { document } = parseHTML('<html><body><div class="token-hud"><div class="col right"></div></div></body></html>');
  globalThis.document = document;
  const app = { object: f.picker, element: document.querySelector(".token-hud") };
  renderStandardInteractionHUD(app, app.element);
  renderStandardInteractionHUD(app, app.element.querySelector(".col.right"));
  assert.equal(app.element.querySelectorAll(".ak5e-standard-hud-button").length, 1);
  assert.match(app.element.textContent, /Pick up/);
  f.picker.actor.isOwner = false;
  renderStandardInteractionHUD(app, app.element);
  assert.equal(app.element.querySelectorAll(".ak5e-standard-hud-button").length, 0);
});

test("cancelled player confirmation submits no request and leaves actor untouched", async () => {
  const f = fixture();
  assert.equal(await runAction(f.actor, "expertise"), false);
  assert.match(lastDialog.content, /name="confirmation"/);
  assert.doesNotMatch(lastDialog.content, /name="confirmation" checked/);
  assert.equal(f.actor.writes.length, 0);
});

test("level-one Vanguards can access the additional Tip SP helper", async () => {
  const f = fixture({ level: 1, pendingGains: { "event-a": { amount: 3, source: "offensiveDamage", reason: "Last Stand pending choice" } } });
  await openStandardBearer(f.actor);
  assert.match(lastDialog.content, /data-standard-action="tipSP"/);
  assert.match(lastDialog.content, /data-standard-action="acceptGain"/);
  assert.doesNotMatch(lastDialog.content, /data-standard-action="projection"/);
  assert.doesNotMatch(lastDialog.content, /data-standard-action="redirect"/);
});

test("owned recipient sees a bearer-only reminder and reviewed damage forms remain opt-in", async () => {
  const f = fixture();
  const recipient = { id: "recipient", uuid: "Actor.recipient", documentName: "Actor", name: "Recipient", type: "character", isOwner: true,
    items: new Map(), effects: new Map([["tip", { id: "tip", name: "Tip of the Spear", disabled: false, description: { value: "Add PB to one damage roll." },
      flags: { ak5e: { standardBenefit: { bearerUuid: f.actor.uuid, kind: "tip1" } } }, getFlag(ns, key) { return this.flags[ns]?.[key]; } }]]) };
  const { document } = parseHTML('<html><body><main><section class="tab" data-tab="features"></section></main></body></html>');
  globalThis.document = document;
  renderStandardBearerControls({ document: recipient, element: document.querySelector("main") }, document.querySelector("main"));
  assert.match(document.querySelector(".ak5e-standard-recipient-controls").textContent, /Open bearer controls/);
  assert.match(document.querySelector(".ak5e-standard-recipient-controls").textContent, /Add PB to one damage roll/);
  assert.equal(recipient.isOwner, true);

  await runAction(f.actor, "cry");
  assert.match(lastDialog.content, /Optional manually reviewed final Psychic Damage/);
  assert.match(lastDialog.content, /name="fact-damageReviewed"/);
  assert.doesNotMatch(lastDialog.content, /name="fact-damageReviewed" checked/);
  assert.match(lastDialog.content, /data-preview-havoc/);
});
