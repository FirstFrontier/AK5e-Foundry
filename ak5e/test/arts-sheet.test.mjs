import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { renderArtsControls } from "../scripts/arts-sheet.mjs";
import { artAvailability, artsDialogClass, configureActorArts, previewActorArts, recoverActorArts,
  registerArtsHooks, setActorArtsValue, wrapActivityUse } from "../scripts/arts-casting.mjs";

const strings = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url))).AK5E.Arts;
const lookup = key => key.replace(/^AK5E\.Arts\./, "").split(".").reduce((value, part) => value?.[part], strings) ?? key;
const hooks = {};
class Sheet {
  constructor(actor, element) { this.document = actor; this.element = element; }
  changeTab(tab, group) { this.selected = { tab, group }; }
}
class Activity {
  async use() {}
  consume() {}
  _prepareUsageConfig() {}
}
globalThis.game = { user: { isGM: true }, i18n: {
  localize: lookup,
  format: (key, data) => lookup(key).replace(/\{(\w+)\}/g, (_, name) => data?.[name] ?? "")
} };
globalThis.foundry = { applications: { sheets: { ActorSheetV2: Sheet } }, utils: { randomID: () => "pending-cast" } };
globalThis.ui = { notifications: { error() {}, warn() {}, info() {} } };
globalThis.CONFIG = { DND5E: { abilities: { int: { label: "Intelligence" } }, activityTypes: { test: { documentClass: Activity } } } };
globalThis.Hooks = { on: (name, fn) => { hooks[name] = fn; } };
registerArtsHooks();

function fixture(type = "character", { enabled = true, owner = true, points = {}, casting = {} } = {}) {
  const { document, window } = parseHTML('<html><body><main><header class="sheet-header"><div class="right"></div></header><nav><a data-tab="spells" aria-label="Spells"></a></nav><section class="tab" data-tab="spells"><div class="spellcasting"><span class="prepared">0 / 4</span></div><div class="inventory-element"><div class="middle"><input placeholder="Search"></div><section class="items-section" data-method="ak5e"><div class="items-header"><div class="pips" data-prop="system.spells.spell1.value"></div></div><ol></ol></section></div></section></main></body></html>');
  globalThis.document = document;
  const actor = { documentName: "Actor", type, uuid: `Actor.${type}`, isOwner: owner, statuses: new Set(), writes: [],
    flags: { ak5e: { casting: { enabled, ability: "int", castingUnit: "focus", recovery: "long", ...casting }, artsPoints: {
      maximum: 12, value: 8, maximumArtLevel: 4, ninthLevelCast: false, ...points
    } } }, items: new Map() };
  actor.getFlag = (_namespace, key) => actor.flags.ak5e[key];
  actor.update = async update => {
    actor.writes.push(update);
    for (const [path, value] of Object.entries(update)) {
      const keys = path.split(".");
      const final = keys.pop();
      let target = actor;
      for (const key of keys) target = target[key] ??= {};
      target[final] = value;
    }
  };
  actor.updateEmbeddedDocuments = async (_type, updates) => { actor.itemUpdates = updates; };
  const focus = { id: "focus", name: "Arts Staff", type: "weapon", system: { equipped: true } };
  actor.items.set(focus.id, focus);
  const root = document.querySelector("main");
  return { actor, root, app: new Sheet(actor, root), document, window };
}

function addArt(f, { id = "art", level = 1, method = "ak5e", grant = {}, activities = true } = {}) {
  const item = { id, name: id, type: "spell", actor: f.actor, parent: f.actor,
    system: { level, method, ability: "int", properties: [], materials: {}, activities: new Map(activities ? [["cast", {}]] : []) },
    flags: { ak5e: { art: grant } }, getFlag: (_namespace, key) => key === "art" ? grant : undefined };
  f.actor.items.set(id, item);
  const row = f.document.createElement("li");
  row.dataset.itemId = id;
  row.innerHTML = '<div class="item-row"><div class="item-name" data-action="use"><span class="title">Art</span></div><div data-column-id="controls"><button data-action="prepare">Prepare</button><button data-action="toggleExpand">Read</button></div></div>';
  f.root.querySelector("ol").append(row);
  return { item, row };
}

test("PC and NPC full/partial renders are idempotent, preserve native controls, and restore on disable", () => {
  for (const type of ["character", "npc"]) {
    const f = fixture(type);
    const { row } = addArt(f);
    renderArtsControls(f.app, f.root);
    renderArtsControls(f.app, f.root.querySelector('.tab[data-tab="spells"]'));
    assert.equal(f.root.querySelectorAll(".ak5e-arts-header").length, 1);
    assert.equal(f.root.querySelectorAll(".ak5e-arts-controls").length, 1);
    assert.equal(row.querySelectorAll(".ak5e-art-status").length, 1);
    assert.match(row.querySelector(".ak5e-art-status").textContent, /1 AP/);
    assert.ok(row.querySelector('[data-action="toggleExpand"]'));
    assert.ok(row.querySelector('[data-action="prepare"]').classList.contains("ak5e-arts-hide"));
    assert.equal(f.root.querySelector("nav a").getAttribute("aria-label"), "Arts");
    assert.equal(f.actor.writes.length, 0);
    const identity = f.document.createElement("div"); identity.className = "left";
    f.root.querySelector(".sheet-header").prepend(identity);
    renderArtsControls(f.app, f.root);
    assert.equal(f.root.querySelector(".ak5e-arts-header").parentElement,
      type === "character" ? identity : f.root.querySelector(".sheet-header .right"));
    f.actor.flags.ak5e.casting.enabled = false;
    renderArtsControls(f.app, f.root);
    assert.equal(f.root.querySelectorAll(".ak5e-arts-header, .ak5e-art-status").length, 0);
    assert.equal(f.root.querySelector("nav a").getAttribute("aria-label"), "Spells");
    assert.equal(row.querySelector('[data-action="prepare"]').classList.contains("ak5e-arts-hide"), false);
  }
});

test("registration prompts, unrelated apps, observers and limited sheets respect permissions", () => {
  const f = fixture("character", { enabled: false });
  renderArtsControls(f.app, f.root);
  assert.equal(f.root.querySelectorAll(".ak5e-arts-controls").length, 0);
  f.actor.items.set("class", { getFlag: (_namespace, key) => key === "chapterThreeId" ? "caster" : undefined });
  renderArtsControls(f.app, f.root);
  assert.match(f.root.querySelector(".ak5e-arts-controls").textContent, /Set up AK5e Arts/);
  f.actor.flags.ak5e.casting.enabled = true;
  f.actor.flags.ak5e.artsSetup = { status: "pending" };
  renderArtsControls(f.app, f.root);
  assert.match(f.root.querySelector(".ak5e-arts-controls").textContent, /interrupted.*Set up AK5e Arts/);
  f.actor.flags.ak5e.casting.enabled = true; f.actor.isOwner = false;
  renderArtsControls(f.app, f.root);
  assert.equal(f.root.querySelectorAll(".ak5e-arts-controls input, .ak5e-arts-controls button").length, 0);
  assert.match(f.root.querySelector(".ak5e-arts-controls").textContent, /8.*12/);
  game.user.isGM = false; f.actor.limited = true;
  renderArtsControls(f.app, f.root);
  assert.equal(f.root.querySelectorAll(".ak5e-arts-controls, .ak5e-arts-header").length, 0);
  game.user.isGM = true;
  renderArtsControls({ document: f.actor }, f.root);
  assert.equal(f.root.querySelectorAll(".ak5e-arts-controls").length, 0);
});

test("mixed actors retain ordinary preparation/slots; castable filter leaves native search and references", () => {
  const f = fixture("npc", { points: { value: 0 } });
  const art = addArt(f);
  const ordinary = addArt(f, { id: "ordinary", method: "spell", grant: { enabled: false } });
  f.actor.items.set("reference", { id: "reference", name: "Spellcasting", type: "feat", getFlag: () => true });
  f.actor.items.set("manualReference", { id: "manualReference", name: "Burning Ray (Art)", type: "feat", getFlag: () => undefined });
  renderArtsControls(f.app, f.root);
  const slots = f.root.querySelector(".pips");
  assert.equal(slots.classList.contains("ak5e-arts-hide"), false);
  assert.equal(ordinary.row.querySelector('[data-action="prepare"]').classList.contains("ak5e-arts-hide"), false);
  assert.match(art.row.textContent, /only 0 AP/);
  assert.ok(f.root.querySelector('input[placeholder="Search"]'));
  assert.equal(f.root.querySelector(".ak5e-arts-references").hasAttribute("open"), false);
  assert.match(f.root.querySelector(".ak5e-arts-references").textContent, /Burning Ray \(Art\)/);
  const filter = f.root.querySelector(".ak5e-castable-filter input");
  assert.equal(filter.checked, false);
  filter.checked = true; filter.dispatchEvent(new f.window.Event("change"));
  assert.equal(art.row.classList.contains("ak5e-arts-filtered"), true);
  assert.equal(ordinary.row.classList.contains("ak5e-arts-filtered"), false);
  renderArtsControls(f.app, f.root);
  assert.equal(f.root.querySelector(".ak5e-castable-filter input").checked, true);
});

test("availability defaults, discounts, caps, blockers and free-grant exhaustion agree", () => {
  const f = fixture();
  const { item } = addArt(f, { grant: { free: { level: 4, maximum: null }, reduction: 1 } });
  assert.equal(artAvailability(f.actor, item).mode, "free");
  item.getFlag = () => ({ free: { level: 4, maximum: 2 }, reduction: 1 });
  assert.equal(artAvailability(f.actor, item).mode, "ap");
  assert.equal(artAvailability(f.actor, item).quote.cost, 0);
  const selected = artAvailability(f.actor, item, { mode: "ap", level: 4 });
  assert.equal(selected.quote.cost, 3);
  f.actor.flags.ak5e.artsPoints.maximumArtLevel = 1;
  assert.equal(artAvailability(f.actor, item, { mode: "ap", level: 4 }).level, 1);
  item.getFlag = () => ({ onlyFree: true, free: { level: 4, maximum: 2 } });
  assert.equal(artAvailability(f.actor, item).mode, "free");
  f.actor.flags.ak5e.artFreeUses = { art: 2 };
  assert.equal(artAvailability(f.actor, item).castable, false);
  f.actor.statuses.add("ak5e-silenced");
  assert.equal(artAvailability(f.actor, item).error.key, "Silenced");
  f.actor.statuses.clear(); f.actor.items.get("focus").system.equipped = false;
  assert.equal(artAvailability(f.actor, item).error.key, "FocusMissing");
});

test("inline edits reject excess/invalid values, preserve overflow, and remain token-local", async () => {
  const a = fixture("npc", { points: { maximum: 12, value: 16 } }).actor;
  const b = fixture("npc").actor;
  a.uuid = "Scene.test.Token.a.Actor.test"; b.uuid = "Scene.test.Token.b.Actor.test";
  await setActorArtsValue(a, 15);
  assert.equal(a.flags.ak5e.artsPoints.value, 15);
  assert.equal(b.flags.ak5e.artsPoints.value, 8);
  for (const value of [16, -1, 1.5, ""]) await assert.rejects(setActorArtsValue(a, value));
  a.isOwner = false;
  await assert.rejects(setActorArtsValue(a, 2), /own/);
});

test("saving configuration does not adopt Items, refill AP, or reset grants and ninth use", async () => {
  const f = fixture("character", { points: { ninthLevelCast: true } });
  addArt(f, { method: "spell" });
  f.actor.flags.ak5e.artFreeUses = { art: 1 };
  const preview = previewActorArts(f.actor, { adopt: false, maximum: 20 });
  assert.equal(preview.items.length, 0);
  await configureActorArts(f.actor, { adopt: false, maximum: 20 });
  assert.equal(f.actor.itemUpdates, undefined);
  assert.equal(f.actor.flags.ak5e.artsPoints.value, 8);
  assert.equal(f.actor.flags.ak5e.artsPoints.ninthLevelCast, true);
  assert.equal(f.actor.flags.ak5e.artFreeUses.art, 1);
});

test("NPC Arts recovery respects manual/short/long grants and clears only Arts resources", async () => {
  const f = fixture("npc", { points: { value: 16, ninthLevelCast: true }, casting: { recovery: "manual" } });
  addArt(f, { id: "long", grant: { free: { recovery: "long" } } });
  addArt(f, { id: "short", grant: { free: { recovery: "short" } } });
  addArt(f, { id: "manual", grant: { free: { recovery: "manual" } } });
  f.actor.flags.ak5e.artFreeUses = { long: 1, short: 1, manual: 1 };
  await recoverActorArts(f.actor, "short");
  assert.equal(f.actor.flags.ak5e.artsPoints.value, 16);
  assert.deepEqual(f.actor.flags.ak5e.artFreeUses, { long: 1, short: 0, manual: 1 });
  await recoverActorArts(f.actor, "long");
  assert.equal(f.actor.flags.ak5e.artsPoints.value, 12);
  assert.equal(f.actor.flags.ak5e.artsPoints.ninthLevelCast, false);
  assert.deepEqual(f.actor.flags.ak5e.artFreeUses, { long: 0, short: 0, manual: 1 });
  assert.equal(f.actor.writes.flatMap(update => Object.keys(update)).every(key => key.startsWith("flags.ak5e.")), true);
  await assert.rejects(recoverActorArts(f.actor, "day"));
});

test("usage dialog normalizes levels on mode changes and disables invalid confirmation", async () => {
  const f = fixture();
  const { item } = addArt(f, { grant: { free: { level: 1, maximum: null } } });
  class Base {
    static PARTS = {};
    async _prepareSubmitData(_event, data) { return data; }
    async _prepareFooterContext() { return { buttons: [{ action: "use" }] }; }
  }
  const Dialog = artsDialogClass(Base);
  const dialog = Object.assign(new Dialog(), { item, actor: f.actor, config: {} });
  const context = await dialog._prepareScalingContext({});
  assert.equal(context.ak5eArts.chooseLevel, false);
  assert.equal(context.ak5eArts.remaining, 8);
  assert.equal(dialog.config.ak5eMode, "free");
  const data = await dialog._prepareSubmitData(null, { ak5eMode: "ap", ak5eLevel: "4" });
  assert.equal(data.scaling, 3);
  dialog.config = data;
  f.actor.statuses.add("ak5e-silenced");
  assert.equal((await dialog._prepareFooterContext({})).buttons[0].disabled, true);
  assert.match((await dialog._prepareScalingContext({})).ak5eArts.reason, /Silenced/);
  f.actor.statuses.clear(); f.actor.flags.ak5e.artsPoints.value = 0;
  const stale = await dialog._prepareSubmitData({ type: "click" }, { ak5eMode: "ap", ak5eLevel: "4" });
  assert.equal(stale.ak5eLevel, 4);
  assert.equal(stale.scaling, 3);
  assert.equal(f.actor.writes.length, 0);
});

test("pending casting locks inline edits and NPC recovery; rejection releases the lock", async () => {
  const f = fixture();
  const { item } = addArt(f);
  let release;
  class Pending {
    actor = f.actor; item = item;
    async use() { await new Promise(resolve => { release = resolve; }); throw new Error("failed write"); }
  }
  wrapActivityUse(Pending.prototype);
  const operation = new Pending().use();
  await assert.rejects(setActorArtsValue(f.actor, 4), /Finish/);
  await assert.rejects(recoverActorArts(f.actor, "long"), /Finish/);
  release(); await assert.rejects(operation, /failed write/);
  await setActorArtsValue(f.actor, 4);
  assert.equal(f.actor.flags.ak5e.artsPoints.value, 4);
});
