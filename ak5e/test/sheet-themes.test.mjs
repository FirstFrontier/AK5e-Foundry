import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { CHAPTER_TWO_ORIGINS } from "../scripts/chapter-two-content.mjs";
import { SHEET_THEMES, resolveSheetTheme, setSheetTheme, openSheetTheme, renderSheetTheme, registerSheetThemeHooks } from "../scripts/sheet-themes.mjs";

class Sheet {
  constructor(actor, element) { this.document = actor; this.element = element; }
  render() { this.renders = (this.renders ?? 0) + 1; }
}
globalThis.foundry = { applications: { sheets: { ActorSheetV2: Sheet } } };
globalThis.game = { user: { isGM: false }, i18n: { localize: key => key } };
const hooks = new Map();
globalThis.Hooks = { on: (name, fn) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) };

function fixture({ owner = true, type = "character" } = {}) {
  const { document } = parseHTML('<html><body><main class="dnd5e2 sheet actor character"><header class="sheet-header"></header><nav></nav><section class="tab-body"></section></main></body></html>');
  const root = document.querySelector("main");
  const actor = { documentName: "Actor", type, isOwner: owner, items: new Map(), flags: { ak5e: {} }, apps: {} };
  actor.getFlag = (_ns, key) => actor.flags.ak5e[key];
  actor.setFlag = async (_ns, key, value) => { actor.flags.ak5e[key] = value; };
  actor.unsetFlag = async (_ns, key) => { delete actor.flags.ak5e[key]; };
  const app = new Sheet(actor, root);
  actor.apps.sheet = app;
  return { actor, app, root };
}

function addNationality(actor, sourceId, name = "Renamed") {
  const item = { name, parent: actor, flags: { ak5e: { chapterTwoId: sourceId } },
    getFlag: (_ns, key) => key === "chapterTwoId" ? sourceId : undefined };
  actor.items.set(sourceId, item);
  return item;
}

test("all 20 source nationalities resolve by stable ID and have CSS variants", () => {
  const entries = CHAPTER_TWO_ORIGINS.filter(entry => entry.kind === "nationality");
  const css = readFileSync(new URL("../styles/sheet-themes.css", import.meta.url), "utf8");
  assert.equal(entries.length, 20);
  assert.equal(SHEET_THEMES.length, 20);
  for (const entry of entries) {
    const { actor } = fixture();
    addNationality(actor, entry.id);
    const theme = resolveSheetTheme(actor);
    assert.equal(theme?.name, entry.name);
    assert.ok(css.includes(`data-ak5e-sheet-theme="${theme.id}"`));
  }
});

test("automatic, conflicting, default, unknown, and explicit selections", async () => {
  const { actor } = fixture();
  assert.equal(resolveSheetTheme(actor), null);
  addNationality(actor, "nationality-gir");
  assert.equal(resolveSheetTheme(actor)?.name, "Ægir");
  addNationality(actor, "nationality-yan");
  assert.equal(resolveSheetTheme(actor), null);
  await setSheetTheme(actor, "siesta");
  assert.equal(resolveSheetTheme(actor)?.name, "Siesta");
  await setSheetTheme(actor, "default");
  assert.equal(resolveSheetTheme(actor), null);
  await setSheetTheme(actor, "auto");
  assert.equal(actor.getFlag("ak5e", "sheetTheme"), undefined);
  actor.flags.ak5e.sheetTheme = "obsolete";
  assert.equal(resolveSheetTheme(actor), null);
  await assert.rejects(setSheetTheme(actor, "obsolete"));
});

test("full and partial renders are scoped per sheet, and only owners or GMs get controls", async () => {
  registerSheetThemeHooks();
  const first = fixture();
  const second = fixture({ owner: false });
  addNationality(first.actor, "nationality-kjerag");
  addNationality(second.actor, "nationality-yan");
  renderSheetTheme(first.app, first.root);
  renderSheetTheme(second.app, second.root);
  assert.equal(first.root.dataset.ak5eSheetTheme, "kjerag");
  assert.equal(second.root.dataset.ak5eSheetTheme, "yan");
  renderSheetTheme(first.app, first.root.querySelector(".sheet-header"));
  assert.equal(first.root.dataset.ak5eSheetTheme, "kjerag");
  first.actor.items.clear();
  renderSheetTheme(first.app, first.root);
  assert.equal(first.root.dataset.ak5eSheetTheme, undefined);
  const controls = [];
  hooks.get("getHeaderControlsApplicationV2")[0](first.app, controls);
  assert.equal(controls.filter(control => control.action === "ak5eSheetTheme").length, 1);
  hooks.get("getHeaderControlsApplicationV2")[0](second.app, []);
  await assert.rejects(setSheetTheme(second.actor, "yan"));
  game.user.isGM = true;
  await setSheetTheme(second.actor, "default");
  assert.equal(second.actor.getFlag("ak5e", "sheetTheme"), "default");
});


test("chooser presents every nation with a preview and saves the selected override", async () => {
  const { actor } = fixture();
  const { document } = parseHTML("<html><body></body></html>");
  globalThis.document = document;
  let config;
  foundry.applications.api = { DialogV2: { wait: async options => { config = options; return "siesta"; } } };
  await openSheetTheme(actor);
  assert.match(config.window.title, /SheetTheme.Title/);
  assert.equal((config.content.match(/class="ak5e-theme-option"/g) ?? []).length, 22);
  assert.ok(parseHTML(config.content).document.querySelector('input[value="auto"]').hasAttribute("checked"));
  assert.match(config.content, /value="siesta"/);
  assert.match(config.content, /linear-gradient\(135deg, #267a80 62%, #ed9375 62%\)/);
  assert.equal(actor.getFlag("ak5e", "sheetTheme"), "siesta");
  foundry.applications.api.DialogV2.wait = async options => { config = options; return null; };
  await openSheetTheme(actor);
  assert.ok(parseHTML(config.content).document.querySelector('input[value="siesta"]').hasAttribute("checked"));
});
