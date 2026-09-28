import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { CHAPTER_TWO_ORIGINS as ORIGINS } from "../scripts/chapter-two-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT as EQUIPMENT } from "../scripts/chapter-four-content.mjs";
import { CHAPTER_FIVE_ARTS as ARTS } from "../scripts/chapter-five-content.mjs";
import { TAG_PRESETS, sourceTagPresets, treatiseFeatures, tagRulesHtml } from "../scripts/tag-presets.mjs";
import { applyFeatureTag, applyTagPreset, removeFeatureTag, resolveFeatureTag, setTagCounter, featureTags,
  tagExpiry, tagHasExpired, expireFeatureTags, renderFeatureTags, registerFeatureTagHooks } from "../scripts/feature-tags.mjs";
import { openFeatureTagSetup } from "../scripts/feature-tags.mjs";

let serial = 0;
let documents, hooks;
const tick = () => new Promise(resolve => setImmediate(resolve));
function write(object, changes) {
  for (const [path, value] of Object.entries(changes)) {
    const keys = path.split("."); const last = keys.pop();
    let parent = object;
    for (const key of keys) parent = parent[key] ??= {};
    parent[last] = structuredClone(value);
  }
}
function setup() {
  documents = new Map(); hooks = {};
  globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, actors: new Map(), scenes: [],
    time: { worldTime: 100 }, i18n: { localize: key => key } };
  globalThis.CONFIG = { specialStatusEffects: { CONCENTRATING: "concentrating" }, DND5E: { damageTypes: { fire: {}, cold: {} } },
    statusEffects: ["paralyzed", "stunned", "incapacitated", "charmed", "prone", "ak5e-bleeding", "ak5e-frozen", "ak5e-dazed", "ak5e-necrotised", "ak5e-nervous-impairment", "ak5e-corroded", "ak5e-silenced"].map(id => ({ id })) };
  globalThis.foundry = { utils: { randomID: () => `tag${++serial}` }, applications: { sheets: { ActorSheetV2: class {} } } };
  globalThis.fromUuid = async uuid => documents.get(uuid);
  globalThis.Hooks = { on: (event, callback) => { hooks[event] = callback; } };
  globalThis.ui = { notifications: { error() {} } };
  globalThis.document = parseHTML("<html><body></body></html>").document;
}
function embedded(parent, documentName, data) {
  const doc = { ...structuredClone(data), id: `doc${++serial}`, parent, documentName, isOwner: true, effects: new Map(),
    flags: structuredClone(data.flags ?? {}), sheet: { render() {} }, writes: [] };
  doc.uuid = `${parent.uuid}.${documentName}.${doc.id}`;
  doc.getFlag = (_namespace, key) => doc.flags.ak5e?.[key];
  doc.update = async updates => { doc.writes.push(updates); write(doc, updates); return doc; };
  doc.toObject = () => ({ ...structuredClone(data), _id: doc.id });
  doc.createEmbeddedDocuments = async (type, values) => values.map(value => {
    const child = embedded(doc, type, value); doc.effects.set(child.id, child); return child;
  });
  doc.deleteEmbeddedDocuments = async (_type, ids) => { for (const id of ids) { documents.delete(doc.effects.get(id)?.uuid); doc.effects.delete(id); } };
  documents.set(doc.uuid, doc);
  return doc;
}
function actor(name) {
  const doc = { documentName: "Actor", id: name, name, uuid: `Actor.${name}`, isOwner: true, items: new Map(), effects: new Map(),
    system: { attributes: { prof: 3, hp: { value: 50, max: 100 }, movement: { walk: 30, fly: 40, swim: 0, units: "ft" } } } };
  doc.createEmbeddedDocuments = async (type, values) => values.map(value => {
    const child = embedded(doc, type, value); (type === "Item" ? doc.items : doc.effects).set(child.id, child); return child;
  });
  doc.deleteEmbeddedDocuments = async (type, ids) => { const collection = type === "Item" ? doc.items : doc.effects;
    for (const id of ids) { const child = collection.get(id); documents.delete(child?.uuid); for (const effect of child?.effects?.values() ?? []) documents.delete(effect.uuid); collection.delete(id); }
  };
  documents.set(doc.uuid, doc); game.actors.set(doc.id, doc); return doc;
}
function sourceItem(actor, chapter, heading, type) {
  const records = { 2: ORIGINS, 4: EQUIPMENT, 5: ARTS }[chapter];
  const record = records.find(record => record.sourceHeading === heading && record.itemType && (chapter !== 2 || record.kind === "species-feature"));
  assert.ok(record, heading);
  const doc = embedded(actor, "Item", { name: record.name, type: type ?? record.itemType,
    system: { ...structuredClone(record.systemData), description: { value: record.content } },
    flags: { ak5e: { [{ 2: "chapterTwoId", 4: "chapterFourId", 5: "chapterFiveId" }[chapter]]: record.id, sourceHeading: record.sourceHeading, rawSource: record.rawSource } } });
  actor.items.set(doc.id, doc); return doc;
}
function weapon(owner) {
  const doc = embedded(owner, "Item", { type: "weapon", name: "Sword", system: { damage: { base: { bonus: "" }, versatile: { bonus: "" } } } });
  owner.items.set(doc.id, doc); return doc;
}
function combat(actors, turn = 0) {
  game.combat = { uuid: "Combat.test", started: true, round: 1, turn, previous: { round: 1, turn },
    turns: actors.map((actor, i) => ({ id: `c${i}`, actor })) };
  game.combat.combatant = game.combat.turns[turn]; return game.combat;
}
const receipt = effect => effect.flags.ak5e.temporaryTag;

test("every profile resolves from stable content provenance, never a stock display name", () => {
  setup(); const pc = actor("Source");
  for (const preset of TAG_PRESETS) {
    const source = sourceItem(pc, preset.chapter, preset.heading);
    assert.ok(sourceTagPresets(source).some(candidate => candidate.id === preset.id), preset.id);
  }
  assert.deepEqual(sourceTagPresets({ name: "Galvanise", type: "spell", flags: {} }), []);
  assert.deepEqual(sourceTagPresets({ name: "Galvanise", type: "spell", flags: { ak5e: { chapterFiveId: "unknown" } } }), []);
  assert.ok(sourceTagPresets({ name: "Liberi: Birds of a Feather", flags: { ak5e: { originGrant: { originId: "species-liberi", index: 0 } } } })
    .some(profile => profile.id === "flock"), "legacy grants resolve through their origin provenance");
  const inventoryRecord = EQUIPMENT.find(record => record.kind === "loot" && record.name === "Alcohol");
  assert.match(tagRulesHtml({ flags: { ak5e: { chapterFourId: inventoryRecord.id } } }), /Dexterity Checks/,
    "a gear inventory row links its complete rule description");
});

test("next-turn end excludes the active turn; reaction deadlines can use a third creature", () => {
  setup(); const pc = actor("Source"), target = actor("Target"), third = actor("Third");
  const encounter = combat([pc, target, third], 1);
  const current = { expiry: tagExpiry(pc, target, { trigger: "turnEnd" }) };
  const next = { expiry: tagExpiry(pc, target, { trigger: "nextTurnEnd" }) };
  encounter.turn = 2;
  assert.equal(tagHasExpired(current, { kind: "combatTurn", combat: encounter }), true);
  assert.equal(tagHasExpired(next, { kind: "combatTurn", combat: encounter }), false);
  encounter.previous = { round: 1, turn: 2 }; encounter.round = 2; encounter.turn = 1;
  assert.equal(tagHasExpired(next, { kind: "combatTurn", combat: encounter }), false);
  encounter.previous = { round: 2, turn: 1 }; encounter.turn = 2;
  assert.equal(tagHasExpired(next, { kind: "combatTurn", combat: encounter }), true);
  assert.throws(() => tagExpiry(pc, target, { trigger: "currentTurnEnd" }), /CurrentTurnRequired/);
  encounter.combatant = encounter.turns[2];
  assert.equal(tagExpiry(pc, target, { trigger: "currentTurnEnd", expiryActor: "active" }).actorUuid, third.uuid);
});

test("exact concentration receipt expires all recipients of that cast and preserves another cast", async () => {
  setup(); const pc = actor("Source"), first = actor("First"), second = actor("Second");
  const spell = sourceItem(pc, 5, "Galvanise");
  await assert.rejects(applyTagPreset(pc, spell, first, "galvanise"), /ConcentrationRequired/);
  const [concentration] = await pc.createEmbeddedDocuments("ActiveEffect", [{ origin: spell.uuid, statuses: ["concentrating"] }]);
  const one = await applyTagPreset(pc, spell, first, "galvanise");
  await applyTagPreset(pc, spell, second, "galvanise");
  assert.ok(one.changes.some(change => change.key === "system.bonuses.mwak.damage"));
  assert.equal(first.system.attributes.movement.walk, 30, "base data remains intact");
  const [other] = await pc.createEmbeddedDocuments("ActiveEffect", [{ origin: "other", statuses: ["concentrating"] }]);
  await expireFeatureTags({ kind: "concentration", effectUuid: other.uuid });
  assert.equal(featureTags(first).length, 1);
  await expireFeatureTags({ kind: "concentration", effectUuid: concentration.uuid });
  assert.equal(featureTags(first).length, 0); assert.equal(featureTags(second).length, 0);
});

test("one-shot removal is scoped to the tag; healing cannot clear Lacerate", async () => {
  setup(); const pc = actor("Source"), target = actor("Target");
  const lacerate = await applyTagPreset(pc, sourceItem(pc, 5, "Lacerate"), target, "lacerate");
  const despair = await applyTagPreset(pc, sourceItem(pc, 5, "Power Word Despair"), target, "despair");
  await assert.rejects(resolveFeatureTag(target, receipt(lacerate).id, "healed"), /InvalidTrigger/);
  await resolveFeatureTag(target, receipt(despair).id, "used");
  assert.equal(featureTags(target).length, 1);
  await expireFeatureTags({ kind: "time", worldTime: 160 });
  assert.equal(featureTags(target).length, 0);
});

test("weapon coatings are embedded enchantments; replacement is per weapon across creators", async () => {
  setup(); const first = actor("First"), second = actor("Second"), target = actor("Target");
  const blade = weapon(target), otherBlade = weapon(target);
  const cytotoxin = sourceItem(first, 4, "Cytotoxin", "loot");
  const neurotoxin = sourceItem(second, 4, "Neurotoxin", "loot");
  const old = await applyTagPreset(first, cytotoxin, blade, "cytotoxin-coating");
  assert.equal(old.type, "enchantment"); assert.equal(old.parent, blade);
  assert.equal(featureTags(target).length, 1);
  await applyTagPreset(first, cytotoxin, otherBlade, "cytotoxin-coating");
  const replacement = await applyTagPreset(second, neurotoxin, blade, "neurotoxin-coating");
  assert.equal(featureTags(target).length, 2);
  assert.equal([...blade.effects.values()][0], replacement);
  assert.equal(otherBlade.effects.size, 1);
  await expireFeatureTags({ kind: "time", worldTime: 700 });
  assert.equal(featureTags(target).length, 0);
  assert.equal(target.items.size, 2);
});

test("Rust stacks on the weapon and repair removes only selected Rust receipts", async () => {
  setup(); const pc = actor("Source"), target = actor("Target"), blade = weapon(target);
  const spell = sourceItem(pc, 5, "Rust");
  const first = await applyTagPreset(pc, spell, blade, "rust");
  await applyTagPreset(pc, spell, blade, "rust");
  assert.deepEqual(first.changes.map(change => change.key), ["system.damage.base.bonus", "system.damage.versatile.bonus"]);
  assert.equal(blade.system.damage.base.bonus, "");
  await expireFeatureTags({ kind: "rest", actorUuid: target.uuid, type: "long" });
  assert.equal(blade.effects.size, 2, "Rust is not repaired by a rest");
  await resolveFeatureTag(target, receipt(first).id, "repaired");
  assert.equal(blade.effects.size, 1);
});

test("consuming an item retains its applied profile, while explicitly sustained custom grants clean up", async () => {
  setup(); const pc = actor("Source"), target = actor("Target"); registerFeatureTagHooks(); await tick();
  const alcohol = sourceItem(pc, 4, "Alcohol", "loot");
  const effect = await applyTagPreset(pc, alcohol, target, "alcohol");
  const custom = await applyFeatureTag(pc, alcohol, target, { label: "Sustained grant" });
  await pc.deleteEmbeddedDocuments("Item", [alcohol.id]); hooks.deleteItem(alcohol); await tick();
  assert.ok(featureTags(target).includes(effect)); assert.ok(!featureTags(target).includes(custom));
  await removeFeatureTag(target, receipt(effect).id); assert.equal(featureTags(target).length, 0);
});

test("Missile Barrier upcasting gives bounded motes which persist until time expiry", async () => {
  setup(); const pc = actor("Source"), spell = sourceItem(pc, 5, "Missile Barrier");
  const effect = await applyTagPreset(pc, spell, pc, "motes", { castLevel: 5 });
  assert.equal(receipt(effect).counters.motes.max, 12);
  await setTagCounter(pc, receipt(effect).id, "motes", 7);
  await assert.rejects(setTagCounter(pc, receipt(effect).id, "motes", 13), /InvalidCounter/);
  await assert.rejects(setTagCounter(pc, receipt(effect).id, "motes", 0.5), /InvalidCounter/);
  assert.equal(receipt(effect).counters.motes.value, 7);
  await expireFeatureTags({ kind: "rest", actorUuid: pc.uuid, type: "long" });
  assert.equal(receipt(effect).counters.motes.value, 7);
  pc.isOwner = false; await assert.rejects(setTagCounter(pc, receipt(effect).id, "motes", 6), /OwnerRequired/);
  pc.isOwner = true; await expireFeatureTags({ kind: "time", worldTime: 700 }); assert.equal(featureTags(pc).length, 0);
});

test("Flock membership enforces capacity and one Flock globally; member uses recover independently", async () => {
  setup(); const pc = actor("Source"), other = actor("Other"), a = actor("A"), b = actor("B"), c = actor("C");
  const flock = sourceItem(pc, 2, "Birds of a Feather"), second = sourceItem(other, 2, "Birds of a Feather");
  const gift = await applyTagPreset(pc, flock, a, "flock");
  await applyTagPreset(pc, flock, b, "flock");
  await assert.rejects(applyTagPreset(pc, flock, c, "flock"), /FlockCapacity/);
  await setTagCounter(a, receipt(gift).id, "prey", 0);
  await setTagCounter(a, receipt(gift).id, "nest", 0);
  await expireFeatureTags({ kind: "rest", actorUuid: b.uuid, type: "short" });
  assert.equal(receipt(gift).counters.prey.value, 0);
  await expireFeatureTags({ kind: "rest", actorUuid: a.uuid, type: "short" });
  assert.equal(receipt(gift).counters.prey.value, 1); assert.equal(receipt(gift).counters.nest.value, 1);
  await applyTagPreset(other, second, a, "flock");
  assert.equal(featureTags(a).length, 1); assert.equal(receipt(featureTags(a)[0]).sourceActorUuid, other.uuid);
  await applyTagPreset(pc, flock, c, "flock");
});

test("Treatises exclude rare species and Ancient Versatility, preserve exact text, and replace old copies", async () => {
  setup(); const pc = actor("Source"), treatise = sourceItem(pc, 2, "Xue Wu Zhi Jing");
  const choices = treatiseFeatures();
  assert.ok(!choices.some(record => record.parent === "Lung" || record.parent === "Elf"));
  assert.ok(!choices.some(record => record.sourceHeading === "Ancient Versatility"));
  const chosen = choices.find(record => record.sourceHeading === "Logic Engine");
  assert.ok(chosen);
  await assert.rejects(applyTagPreset(pc, treatise, pc, "treatise", { featureId: chosen.id }), /confirm/);
  await applyTagPreset(pc, treatise, pc, "treatise", { featureId: chosen.id, writtenConfirmed: true, eligibleConfirmed: true });
  const copy = [...pc.items.values()].find(item => item.flags.ak5e.temporaryTag);
  assert.equal(copy.system.description.value, chosen.content); assert.equal(copy.flags.ak5e.borrowedFeatureId, chosen.id);
  const next = choices.find(record => record.sourceHeading === "Godslayers") ?? choices[0];
  await applyTagPreset(pc, treatise, pc, "treatise", { featureId: next.id, writtenConfirmed: true, eligibleConfirmed: true });
  assert.equal([...pc.items.values()].filter(item => item.flags.ak5e.temporaryTag).length, 1);
  assert.ok(!pc.items.has(copy.id));
});

test("replacement preflight and creation failures preserve the old tag; cleanup failure leaves a blocking receipt", async () => {
  setup(); const pc = actor("Source"), first = actor("First"), second = actor("Second");
  const probe = sourceItem(pc, 2, "Cognitovore");
  const old = await applyTagPreset(pc, probe, first, "probe");
  first.isOwner = false; await assert.rejects(applyTagPreset(pc, probe, second, "probe"), /OwnerRequired/);
  assert.equal(featureTags(second).length, 0); first.isOwner = true;
  const create = second.createEmbeddedDocuments;
  second.createEmbeddedDocuments = async () => { throw new Error("Creation failed"); };
  await assert.rejects(applyTagPreset(pc, probe, second, "probe"), /Creation failed/);
  assert.ok(featureTags(first).includes(old)); second.createEmbeddedDocuments = create;
  const remove = first.deleteEmbeddedDocuments;
  first.deleteEmbeddedDocuments = async () => { throw new Error("Cleanup failed"); };
  await assert.rejects(applyTagPreset(pc, probe, second, "probe"), /Cleanup failed/);
  assert.equal(featureTags(first).length, 1); assert.equal(featureTags(second).length, 1);
  assert.equal(receipt(featureTags(second)[0]).pendingReplacement.length, 1);
  await assert.rejects(applyTagPreset(pc, probe, second, "probe"), /ReviewPrevious/);
  first.deleteEmbeddedDocuments = remove;
  await removeFeatureTag(first, receipt(old).id);
  await applyTagPreset(pc, probe, second, "probe");
  assert.equal(featureTags(second).length, 1, "manual cleanup unlocks future replacement without discarding the new receipt");
});

test("ending a Treatise removes benefits derived from its borrowed feature even when they would otherwise persist", async () => {
  setup(); const pc = actor("Source"), target = actor("Target"); registerFeatureTagHooks(); await tick();
  const treatise = sourceItem(pc, 2, "Xue Wu Zhi Jing");
  const chosen = treatiseFeatures().find(record => record.sourceHeading === "Logic Engine");
  const root = await applyTagPreset(pc, treatise, pc, "treatise", { featureId: chosen.id, writtenConfirmed: true, eligibleConfirmed: true });
  const copy = [...pc.items.values()].find(item => item.flags.ak5e.temporaryTag);
  const derived = await applyFeatureTag(pc, copy, target, { sourceDeletion: "retain" });
  assert.equal(receipt(derived).parentTagId, receipt(root).id);
  await removeFeatureTag(pc, receipt(root).id);
  hooks.deleteItem(copy); await tick();
  assert.equal(featureTags(target).length, 0);
});

test("reload and disabling concentration reconcile only tags linked to that native effect", async () => {
  setup(); const pc = actor("Source"), target = actor("Target");
  const spell = sourceItem(pc, 5, "Galvanise");
  const [concentration] = await pc.createEmbeddedDocuments("ActiveEffect", [{ origin: spell.uuid, statuses: ["concentrating"] }]);
  await applyTagPreset(pc, spell, target, "galvanise");
  const other = await applyFeatureTag(pc, spell, target, { sourceDeletion: "retain" });
  concentration.disabled = true;
  registerFeatureTagHooks(); await tick();
  assert.deepEqual(featureTags(target), [other]);
  concentration.disabled = false;
  await applyTagPreset(pc, spell, target, "galvanise");
  concentration.disabled = true;
  hooks.updateActiveEffect(concentration, { disabled: true }); await tick();
  assert.deepEqual(featureTags(target), [other]);
});

test("custom class/NPC tags combine OR triggers and shared replacement groups without rewriting base data", async () => {
  setup(); const pc = actor("Source"), target = actor("Target");
  const feature = embedded(pc, "Item", { type: "feat", name: "Reviewed NPC feature", flags: { ak5e: { npcFeature: true } } }); pc.items.set(feature.id, feature);
  const effect = await applyFeatureTag(pc, feature, target, { label: "Infusion", replacement: { family: "infusions", scope: "target" },
    expiries: [{ trigger: "time", seconds: 60 }, { trigger: "shortRest" }], actions: ["save"], changes: [{ key: "system.attributes.ac.bonus", mode: 2, value: "2" }] });
  assert.equal(tagHasExpired(receipt(effect), { kind: "time", worldTime: 160 }), true);
  assert.equal(tagHasExpired(receipt(effect), { kind: "rest", actorUuid: pc.uuid, type: "short" }), false);
  assert.equal(tagHasExpired(receipt(effect), { kind: "rest", actorUuid: target.uuid, type: "short" }), true);
  assert.equal(target.system.attributes.ac, undefined);
});

test("spell-only and equipment-only owners get the Effects entry point; observers cannot mutate", async () => {
  setup(); const pc = actor("Source"); sourceItem(pc, 5, "Missile Barrier");
  const root = document.createElement("div"); root.innerHTML = '<section class="tab" data-tab="effects"></section>';
  const app = Object.assign(new foundry.applications.sheets.ActorSheetV2(), { document: pc });
  renderFeatureTags(app, root); renderFeatureTags(app, root.querySelector(".tab"));
  assert.equal(root.querySelectorAll(".ak5e-feature-tags").length, 1);
  assert.equal(root.querySelectorAll(".ak5e-feature-tags > button").length, 1);
  pc.isOwner = false; renderFeatureTags(app, root);
  assert.equal(root.querySelectorAll(".ak5e-feature-tags").length, 0);
});

test("the two-step tag dialog cancels without writes and passes selected profile parameters and recipient", async () => {
  setup(); const pc = actor("Source"), target = actor("Target"); sourceItem(pc, 5, "Missile Barrier");
  const originalFormData = globalThis.FormData;
  let cancel = true, step = 0;
  globalThis.FormData = class {
    constructor(form) {
      this.values = [...form.querySelectorAll("input, select, textarea")].flatMap(control => {
        if (control.type === "checkbox" && !control.hasAttribute("checked")) return [];
        if (control.hasAttribute("multiple")) return [...control.querySelectorAll("option[selected]")].map(option => [control.name, option.value]);
        return [[control.name, control.value ?? ""]];
      });
    }
    [Symbol.iterator]() { return this.values[Symbol.iterator](); }
    getAll(name) { return this.values.filter(([key]) => key === name).map(([, value]) => value); }
  };
  foundry.applications.api = { DialogV2: { wait: async options => {
    const form = document.createElement("form"); form.innerHTML = options.content;
    for (const select of form.querySelectorAll("select:not([multiple])")) if (!select.querySelector("option[selected]"))
      select.querySelector("option")?.setAttribute("selected", "");
    Object.defineProperty(form, "elements", { value: Object.fromEntries([...form.querySelectorAll("[name]")].map(control => [control.name, control])) });
    const app = Object.assign(new EventTarget(), { element: form }); options.render?.({}, app);
    step++;
    if (step === 2 && !cancel) {
      assert.match(form.querySelector(".ak5e-tag-preview").textContent, /mote/i);
      for (const option of form.querySelectorAll('[name="target"] option')) option.toggleAttribute("selected", option.value === target.uuid);
      form.querySelector('[name="castLevel"]').value = "5";
    }
    try { return cancel ? null : await options.buttons[0].callback({}, { form }); }
    finally { app.dispatchEvent(new Event("close")); }
  } } };
  try {
    await openFeatureTagSetup(pc);
    assert.equal(step, 1); assert.equal(featureTags(pc).length + featureTags(target).length, 0);
    cancel = false; step = 0;
    await openFeatureTagSetup(pc);
    assert.equal(step, 2);
    assert.equal(receipt(featureTags(target)[0]).counters.motes.max, 12);
    assert.equal(featureTags(pc).length, 0);
  } finally { globalThis.FormData = originalFormData; }
});
