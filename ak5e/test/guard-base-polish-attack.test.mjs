import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { guardFixture, world } from "./guard-fixture.mjs";
import { guardProfile } from "../scripts/guard-rules.mjs";
import { aggression, unrelenting, defineGuardPools } from "../scripts/guard-features.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";
import { previewGuardSetup, applyGuardSetup, undoGuardSetup, guardChanges } from "../scripts/guard-setup.mjs";
import { previewGuardProgression, applyGuardProgression, undoGuardProgression } from "../scripts/guard-progression.mjs";
import { executeGuardDialog, openGuardControls, openGuardProgression, guardWeaponDamageFormula } from "../scripts/guard-sheet.mjs";
import { setReactionStore } from "../scripts/trigger-events.mjs";
import { renderPlayUseCard } from "../scripts/play-uses-sheet.mjs";

let sequence = 0;
function setup(options = {}) {
  world(); defineGuardPools();
  const actor = guardFixture(options); actor.uuid = `Actor.attack${++sequence}`;
  const reactions = new Map();
  setReactionStore({ read: source => reactions.get(source.uuid), async write(source, state) { reactions.set(source.uuid, structuredClone(state)); } });
  return { actor, reactions };
}
const choices = extra => ({ fightingStyle: "duelling", saves: ["con"], skills: ["ath", "itm", "ak5elore"], tool: "Maintenance Kit",
  startingEquipment: { mode: "cash" }, ...extra });
async function progress(actor, selection = choices()) {
  const plan = await previewGuardProgression(actor, selection);
  return applyGuardProgression(actor, { ...selection, confirmed: true, contextKey: plan.contextKey });
}
async function grant(actor) {
  const preview = await previewGuardSetup(actor);
  return applyGuardSetup(actor, { confirmed: true, contextKey: preview.contextKey });
}
const use = (actor, command, data, id) => guardUses.command(actor, command, { confirmed: true, ...data }, id);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(predicate) {
  for (let i = 0; i < 100 && !predicate(); i++) await tick();
  assert.ok(predicate(), "async control completed");
}
function dialogs(answers = []) {
  const seen = [], roots = [];
  foundry.applications = { api: { DialogV2: {
    async wait(config) {
      seen.push(config);
      const { document } = parseHTML(`<html><body><form>${config.content}</form></body></html>`);
      const root = document.querySelector("form"); roots.push(root);
      config.render?.(null, { element: root, close() {} });
      const answer = answers.shift() ?? { action: "cancel" };
      const controls = Object.fromEntries([...root.querySelectorAll("[name]")].map(control => {
        if (control.tagName === "SELECT" && !control.hasAttribute("multiple") && !control.querySelector("option[selected]")) control.querySelector("option")?.setAttribute("selected", "");
        return [control.name ?? control.getAttribute("name"), { value: control.value ?? "", selectedOptions: [...control.querySelectorAll("option[selected]")].map(option => ({ value: option.value })) }];
      }));
      for (const [key, value] of Object.entries(answer.values ?? {})) controls[key] = { value, checked: value === true };
      const button = config.buttons.find(button => button.action === answer.action);
      return (await button?.callback?.({}, { form: { elements: controls } }, {})) ?? button?.action;
    },
    async confirm(config) { seen.push(config); return answers.shift()?.accepted === true; }
  } } };
  return { seen, roots };
}

test("Pursuit returns the first confirmed choice; cancelling a second form does not reuse it", async () => {
  const { actor } = setup({ level: 11, unrelenting: 2 });
  const harness = dialogs([{ action: "ok", values: { actionType: "bonusAction" } }, { action: "use" }]);
  assert.equal((await executeGuardDialog(actor, "pursuitUnrelenting")).actionType, "Bonus Action");
  assert.match(harness.seen[1].content, /Reaction/);
  const before = actor.writes.length;
  assert.equal(await executeGuardDialog(actor, "pursuitUnrelenting"), null);
  assert.equal(actor.writes.length, before);
});

test("actual progression markup wires its own entry and editor Cancel is read-only", async () => {
  const { actor } = setup();
  const harness = dialogs([{ action: "close" }, { action: "cancel" }]);
  await openGuardControls(actor);
  const entry = harness.roots[0].querySelector('[data-guard-act="__progression"]');
  assert.ok(entry, "the rendered button exists");
  entry.click();
  await until(() => harness.seen.length === 2);
  assert.match(harness.seen[1].content, /Fighting Style/);
  assert.ok(harness.seen[1].buttons.some(button => /Apply/.test(button.label)));
  await tick();
  assert.equal(actor.writes.length, 0);
});

test("base progression editor previews changes and Cancel/close of final Apply write nothing", async () => {
  for (const action of ["cancel", "close"]) {
    const { actor } = setup();
    actor.flags.ak5e.guardProgression = { choices: choices() };
    const harness = dialogs([{ action: "apply" }, { action }]);
    assert.equal(await openGuardProgression(actor), null);
    assert.equal(harness.seen.length, 2);
    assert.match(harness.seen[1].content, /Actor changes/);
    assert.equal(actor.writes.length, 0);
  }
});

test("base progression editor Apply uses its accepted preview; duplicate application adds no cash", async () => {
  const { actor } = setup();
  actor.flags.ak5e.guardProgression = { choices: choices() };
  dialogs([{ action: "apply" }, { action: "apply" }]);
  assert.ok((await openGuardProgression(actor)).receiptId);
  assert.equal(actor.system.currency.cp, 1300);
  dialogs([{ action: "apply" }, { action: "apply" }]);
  await openGuardProgression(actor);
  assert.equal(actor.system.currency.cp, 1300);
});

test("setup and progression undo restore absence, preserve authored Items and unrelated later edits", async () => {
  const { actor } = setup({ enabled: false });
  const originalGuard = structuredClone(actor.flags.ak5e.guard);
  const result = await progress(actor, choices({ hp: { 1: { mode: "fixed", roll: 10 } } }));
  assert.ok(result.receipt.createdIds.length);
  await actor.update({ "flags.ak5e.guard.note": "retain", "flags.ak5e.unrelated": "retain" });
  const review = guardChanges.previewUndo(actor, result.receiptId);
  assert.equal(review.blocked, false);
  await undoGuardProgression(actor, result.receiptId, { confirmed: true });
  assert.equal(actor.items.size, 1);
  assert.equal(actor.items.get("class").name, "Guard");
  assert.equal(actor.system.attributes.hp.max, 45);
  assert.equal(actor.system.attributes.hp.value, 45);
  assert.equal(actor.system.currency, undefined);
  assert.equal(actor.flags.ak5e.guardProgression, undefined);
  assert.deepEqual(actor.flags.ak5e.guard, { ...originalGuard, note: "retain" });
  assert.equal(actor.flags.ak5e.unrelated, "retain");
  assert.equal((await undoGuardProgression(actor, result.receiptId, { confirmed: true })).already, true);
});

test("setup undo preserves edited created Items, explains conflicts, and removes only unchanged grants", async () => {
  const { actor } = setup({ enabled: false });
  const result = await grant(actor);
  const kept = actor.items.get(result.receipt.createdIds[0]); kept.name = "Authored revision";
  actor.flags.ak5e.guard.enabled = "later choice";
  const review = guardChanges.previewUndo(actor, result.receiptId);
  assert.match(review.lines.join(" "), /Preserve Item Authored revision/);
  assert.match(review.lines.join(" "), /changed after this Guard change/);
  await assert.rejects(() => undoGuardSetup(actor, result.receiptId), /Confirm/);
  await undoGuardSetup(actor, result.receiptId, { confirmed: true });
  assert.equal(actor.items.size, 2);
  assert.equal(kept.name, "Authored revision");
  assert.equal(actor.flags.ak5e.guard.enabled, "later choice");
});

test("GM and Player reach setup/progression undo from controls, review, Cancel and confirm", async () => {
  for (const gm of [false, true]) {
    const { actor } = setup({ enabled: false }); game.user.isGM = gm;
    const applied = await grant(actor);
    const cancelled = dialogs([{ action: "close" }, { action: "choose", values: { useId: applied.receiptId } }, { action: "cancel" }]);
    await openGuardControls(actor);
    const writes = actor.writes.length;
    cancelled.roots[0].querySelector('[data-guard-act="__changes"]').click();
    await until(() => cancelled.seen.length === 3);
    await tick();
    assert.equal(actor.writes.length, writes);
    const confirmed = dialogs([{ action: "close" }, { action: "choose", values: { useId: applied.receiptId } }, { action: "undo" }]);
    await openGuardControls(actor);
    confirmed.roots[0].querySelector('[data-guard-act="__changes"]').click();
    await until(() => guardChanges.receipt(actor, applied.receiptId).status === "undone");
    assert.equal(actor.items.size, 1);
    assert.match(game.messages.at(-1).content, /Undone:/);
  }
});

test("rendered Eternal Aggression Roll callback confirms, rolls once, and remains undoable after reload", async () => {
  const { actor } = setup({ level: 18, aggression: 2, unrelenting: 2 });
  let rolls = 0;
  globalThis.Roll = class {
    constructor(formula) { this.formula = formula; }
    async evaluate() { rolls++; this.total = 3; return this; }
    async toMessage() { return this; }
  };
  await use(actor, "unrelenting", {}, "dom-eternal");
  assert.equal(rolls, 0);
  const message = game.messages.at(-1), flags = structuredClone(actor.flags);
  actor.flags = structuredClone(flags); // A persisted receipt, not a retained closure.
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
  const { document } = parseHTML('<html><body><section><div class="message-content"></div></section></body></html>');
  const previousDocument = globalThis.document; globalThis.document = document;
  try {
    const root = document.querySelector("section");
    renderPlayUseCard(guardUses, message, root);
    const button = [...root.querySelectorAll("button")].find(button => button.textContent.startsWith("Roll"));
    assert.ok(button);
    dialogs([{ action: "use" }]); button.click();
    await until(() => guardUses.receipt(actor, "dom-eternal").status === "complete");
    assert.equal(rolls, 1); assert.equal(aggression(actor).value, 5);
    await guardUses.command(actor, "useRoll", { useId: "dom-eternal" }, "dom-repeat");
    assert.equal(rolls, 1);
    await guardUses.command(actor, "undoUse", { useId: "dom-eternal" }, "dom-undo");
    assert.equal(aggression(actor).value, 2); assert.equal(unrelenting(actor).value, 2);
  } finally { globalThis.document = previousDocument; }
});

test("setup stale preview and concurrent apply refuse before duplicate grants", async () => {
  const { actor } = setup();
  const preview = await previewGuardSetup(actor);
  await actor.update({ "system.attributes.hp.max": 46 });
  const count = actor.writes.length;
  await assert.rejects(() => applyGuardSetup(actor, { confirmed: true, contextKey: preview.contextKey }), /changed since/);
  assert.equal(actor.writes.length, count);
  const fresh = await previewGuardSetup(actor);
  const results = await Promise.allSettled([1, 2].map(() => applyGuardSetup(actor, { confirmed: true, contextKey: fresh.contextKey })));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(actor.items.size, 1 + fresh.creates.length);
});

test("partial setup records created IDs; retry grants only missing features and both operations undo", async () => {
  const { actor } = setup({ enabled: false });
  const create = actor.createEmbeddedDocuments;
  actor.createEmbeddedDocuments = async (type, data) => {
    await create(type, data.slice(0, 2)); throw new Error("partial creation");
  };
  await assert.rejects(() => grant(actor), /partial creation/);
  const partial = guardChanges.uses(actor)[0];
  assert.equal(partial.createdIds.length, 2);
  actor.createEmbeddedDocuments = create;
  const retry = await grant(actor);
  assert.equal(retry.created.length, 6); // Eight core features through level 5, minus the two already created.
  await undoGuardSetup(actor, retry.receiptId, { confirmed: true });
  await undoGuardSetup(actor, partial.id, { confirmed: true });
  assert.equal(actor.items.size, 1);
  assert.equal(actor.flags.ak5e.guard.enabled, false);
});

test("precommit failure writes no setup grants; Item failure leaves reversible Actor delta", async () => {
  const { actor } = setup({ enabled: false });
  const update = actor.update;
  actor.update = async () => { throw new Error("no persistence"); };
  await assert.rejects(() => grant(actor), /no persistence/);
  assert.equal(actor.items.size, 1);
  assert.equal(actor.flags.ak5e.guard.enabled, false);
  actor.update = update;
  actor.createEmbeddedDocuments = async () => { throw new Error("no Items"); };
  await assert.rejects(() => grant(actor), /no Items/);
  const receipt = guardChanges.uses(actor)[0];
  await undoGuardSetup(actor, receipt.id, { confirmed: true });
  assert.equal(actor.flags.ak5e.guard.enabled, false);
});

test("undo interrupted after Item deletion retries without duplicate refunds", async () => {
  const { actor } = setup({ enabled: false });
  const result = await progress(actor);
  const update = actor.update.bind(actor); let writes = 0;
  actor.update = async data => { if (++writes === 2) throw new Error("undo acknowledgement failure"); return update(data); };
  await assert.rejects(() => undoGuardProgression(actor, result.receiptId, { confirmed: true }), /acknowledgement/);
  assert.equal(actor.items.size, 1);
  actor.update = update;
  await undoGuardProgression(actor, result.receiptId, { confirmed: true });
  assert.equal(actor.system.currency, undefined);
  assert.equal(actor.flags.ak5e.guardProgression, undefined);
});

test("setup/progression receipts remain visibly encounter-locked and enforce owner permission", async () => {
  const { actor } = setup();
  const result = await grant(actor);
  actor.isOwner = false;
  await assert.rejects(() => undoGuardSetup(actor, result.receiptId, { confirmed: true }), /owned/);
  actor.isOwner = true;
  game.settings.get = () => 1;
  assert.equal(guardChanges.uses(actor)[0].locked, true);
  assert.equal(guardChanges.previewUndo(actor, result.receiptId).blocked, true);
  await assert.rejects(() => undoGuardSetup(actor, result.receiptId, { confirmed: true }), /Locked/);
});

test("malformed base amounts, modes, target identifiers, formulas and prototype branches never write", async () => {
  const { actor } = setup({ level: 18 });
  for (const amount of [null, true, false, "", " ", Infinity, -1, 1.5, {}, []]) {
    await assert.rejects(() => use(actor, "forestall", { amount }, "bad-amount"), /Aggression to expend/);
  }
  for (const actionType of ["", null, "constructor", "sleep", {}]) {
    await assert.rejects(() => use(actor, "pursuitUnrelenting", { actionType }, "bad-mode"), /Action/);
  }
  for (const formula of [undefined, "", "1d0", "0d6", "1001d6", "1d1001", "1d8 + @mod", "1d8;evil()", true]) {
    await assert.rejects(() => use(actor, "unrelentingAggression", { formula }, "bad-damage"), /weapon's damage dice/);
  }
  await assert.rejects(() => use(actor, "smite", { amount: 1, targetUuid: "" }, "bad-target"), /target identifier/);
  assert.equal(actor.writes.length, 0);
  actor.items.set("branch", { type: "subclass", name: "Unknown", flags: { ak5e: { chapterThreeId: "constructor" } } });
  assert.deepEqual(guardProfile(actor).blocked, ["UnknownBranch"]);
  actor.items.delete("branch"); actor.items.get("class").system.levels = true;
  assert.deepEqual(guardProfile(actor).blocked, ["InvalidClassLevel"]);
});

test("progression rejects malformed shapes, unknown equipment and malformed talent IDs before writes; unlisted talent IDs are warned and not granted", async () => {
  const { actor } = setup();
  for (const extra of [
    { skills: "ath" }, { hp: [] }, { asi: null }, { startingEquipment: { mode: "constructor" } },
    { startingEquipment: { mode: "items", weapon1: "constructor" } }, { talents: { basic: "" } }, { talents: { nope: "class-option-guard-talent-basic-alert" } },
    { hp: { 2: { mode: "fixed", roll: 10 } } }, { hp: { 1: { mode: "rolled", roll: 10 } } }
  ]) await assert.rejects(() => previewGuardProgression(actor, choices(extra)), /Invalid Guard progression choice/);
  actor.system.currency = { cp: "not a balance" };
  await assert.rejects(() => progress(actor), /LMD balance/);
  actor.system.currency = { cp: 0 }; actor.system.attributes.hp.max = NaN;
  await assert.rejects(() => progress(actor, choices({ hp: { 1: { mode: "fixed", roll: 10 } } })), /Hit Point maximum/);
  assert.equal(actor.writes.length, 0);

  // A legacy/unlisted but well-formed ID is warned about, creates no talent, and still applies.
  const legacy = setup();
  const plan = await previewGuardProgression(legacy.actor, choices({ talents: { basic: "class-option-guard-alert-87" } }));
  assert.ok(plan.warnings.some(warning => /unlisted Guard talent/.test(warning)));
  assert.equal(plan.createItems.filter(item => item.type === "talent").length, 0);
});

test("progression preview binds Martial DC and branch selections, not only actor values", async () => {
  const { actor } = setup();
  const original = choices({ branch: "subclass-guard-centurion", martialDCAbility: "str" });
  const preview = await previewGuardProgression(actor, original);
  for (const changed of [{ ...original, martialDCAbility: "dex" }, { ...original, branch: "subclass-guard-musha" }]) {
    await assert.rejects(() => applyGuardProgression(actor, { ...changed, confirmed: true, contextKey: preview.contextKey }), /changed since/);
  }
  assert.equal(actor.writes.length, 0);
});

test("already-granted cash cannot be followed by starting equipment without undo", async () => {
  const { actor } = setup();
  await progress(actor);
  const writes = actor.writes.length;
  await assert.rejects(() => previewGuardProgression(actor, choices({ startingEquipment: {
    mode: "items", weapon1: "weapon-axe-2", weapon2: "weapon-axe-2", armour: "equipment-reinforced-outfit-1"
  } })), /already granted/);
  assert.equal(actor.writes.length, writes);
});

test("optional Pursuit API mode retains Action while the sheet obtains an explicit choice", async () => {
  const { actor } = setup({ level: 11, unrelenting: 2 });
  assert.equal((await use(actor, "pursuitUnrelenting", {}, "optional-mode")).actionType, "Action");
});

test("numeric string Aggression inputs are converted and pool multipliers remain numeric", async () => {
  const { actor } = setup({ level: 5, aggression: 4 });
  assert.equal((await use(actor, "smite", { amount: "2" }, "string-amount")).damageBonus, 6);
  assert.equal(aggression(actor).value, 2);
});

test("wielded weapon formula and manual formula forms never append ability modifiers or silently default", async () => {
  const { actor } = setup({ level: 15, aggression: 4 });
  assert.equal(guardWeaponDamageFormula({ system: { damage: { base: { number: 2, denomination: 6 } } } }), "2d6");
  assert.equal(guardWeaponDamageFormula(null), "");
  dialogs([{ action: "ok", values: { formula: "2d6", weaponUuid: "" } }, { action: "use" }]);
  await executeGuardDialog(actor, "unrelentingAggression");
  assert.equal(guardUses.uses(actor)[0].formula, "2d6");
  dialogs([{ action: "ok", values: { formula: "", weaponUuid: "Actor.unknown.Item.weapon" } }]);
  const writes = actor.writes.length;
  await assert.rejects(() => executeGuardDialog(actor, "unrelentingAggression"), /equipped melee weapon/);
  assert.equal(actor.writes.length, writes);
});

test("every base Reaction survives a later resource-write failure, same-ID retry and undo", async () => {
  for (const [command, data, options, pool] of [
    ["forestall", { amount: 2 }, { level: 5, aggression: 4 }, "aggression"],
    ["unrelenting", {}, { level: 5, unrelenting: 1 }, "unrelenting"],
    ["pursuitUnrelenting", { actionType: "action" }, { level: 11, unrelenting: 2 }, "unrelenting"],
    ["unrelentingAggression", { formula: "1d10" }, { level: 15, aggression: 4 }, "aggression"]
  ]) {
    const { actor, reactions } = setup(options), get = pool === "aggression" ? aggression : unrelenting;
    const before = get(actor).value, update = actor.update.bind(actor); let count = 0;
    actor.update = async changes => { if (++count === 2) throw new Error("resource persistence interrupted"); return update(changes); };
    await assert.rejects(() => use(actor, command, data, "durable-base"), /interrupted/);
    assert.equal(reactions.get(actor.uuid)?.spent ?? 0, 0);
    actor.update = update;
    await use(actor, command, data, "durable-base");
    await use(actor, command, data, "durable-base");
    assert.equal(reactions.get(actor.uuid).spent, 1);
    await guardUses.command(actor, "undoUse", { useId: "durable-base" }, "durable-undo");
    assert.equal(get(actor).value, before);
    assert.equal(reactions.get(actor.uuid).spent, 0);
  }
});

test("unacknowledged creation is discoverable and safely preserved rather than deleting an uncertain Item", async () => {
  const { actor } = setup();
  const update = actor.update.bind(actor); let count = 0;
  actor.update = async data => { if (++count === 2) throw new Error("creation acknowledgement interrupted"); return update(data); };
  await assert.rejects(() => grant(actor), /acknowledgement/);
  actor.update = update;
  const receipt = guardChanges.uses(actor)[0];
  assert.match(guardChanges.previewUndo(actor, receipt.id).lines.join(" "), /not acknowledged/);
  const size = actor.items.size;
  await undoGuardSetup(actor, receipt.id, { confirmed: true });
  assert.equal(actor.items.size, size);
});
