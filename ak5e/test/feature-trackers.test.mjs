import test from "node:test";
import assert from "node:assert/strict";
import { CHAPTER_TWO_ORIGINS as ORIGINS } from "../scripts/chapter-two-content.mjs";
import { buildOriginPlan, prepareOriginChanges, getOriginEntry, renderOriginControls } from "../scripts/origin-setup.mjs";
import { ORIGIN_USES, ORIGIN_RECORDS, featureTrackers, setFeatureCounter, saveFeatureRecord, configureFeatureCounter,
  recoverFeatureTrackers, renderFeatureTrackers, adjustCharacterResource } from "../scripts/feature-trackers.mjs";
import { featureTags, featureTagEntries, renderFeatureTags, applyFeatureTag, removeFeatureTag, saveAegirRelationship, tagExpiry, tagHasExpired,
  expireFeatureTags, registerFeatureTagHooks } from "../scripts/feature-tags.mjs";

let sequence = 0;
const docs = new Map();
const sourceId = heading => ORIGINS.find(e => e.kind === "species-feature" && e.sourceHeading === heading).id;
function set(object, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  let target = object;
  for (const key of keys) target = target[key] ??= {};
  target[last] = structuredClone(value);
}
function setup() {
  docs.clear();
  globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, actors: new Map(), scenes: [],
    time: { worldTime: 100 }, i18n: { localize: key => key } };
  globalThis.CONFIG = { DND5E: { restTypes: { short: { recoverPeriods: ["sr"] }, long: { recoverPeriods: ["sr", "lr"] } } },
    statusEffects: [{ id: "poisoned", name: "Poisoned" }] };
  globalThis.foundry = { utils: { randomID: () => `tag${++sequence}` }, applications: { sheets: { ActorSheetV2: class {} } } };
  globalThis.fromUuid = async uuid => docs.get(uuid);
  globalThis.ui = { notifications: { error() {}, info() {} } };
}
function actor(name = "Aegir", type = "character") {
  const result = { name, uuid: `Actor.${name}`, id: name, documentName: "Actor", type, isOwner: true,
    flags: {}, items: new Map(), effects: new Map(), system: { attributes: { prof: 3 }, details: { level: 7 }, skills: { prc: { value: 1 } } }, writes: [] };
  result._source = { system: structuredClone(result.system) };
  result.update = async data => { result.writes.push(data); for (const [k, v] of Object.entries(data)) set(result, k, v); };
  result.createEmbeddedDocuments = async (type, data) => data.map(value => {
    const document = { ...structuredClone(value), id: `doc${++sequence}`, parent: result, flags: structuredClone(value.flags ?? {}), sheet: { render() {} } };
    document.uuid = `${result.uuid}.${type}.${document.id}`;
    document.getFlag = (_scope, key) => document.flags.ak5e?.[key];
    document.toObject = () => ({ ...structuredClone(value), _id: document.id });
    (type === "Item" ? result.items : result.effects).set(document.id, document);
    docs.set(document.uuid, document);
    return document;
  });
  result.deleteEmbeddedDocuments = async (type, ids) => {
    for (const id of ids) (type === "Item" ? result.items : result.effects).delete(id);
  };
  result.updateEmbeddedDocuments = async (_type, data) => { for (const { _id, ...update } of data) await result.items.get(_id).update(update); };
  docs.set(result.uuid, result);
  game.actors.set(result.id, result);
  return result;
}
function item(actor, id, extra = {}) {
  const entry = ORIGINS.find(e => e.id === id);
  const result = { name: entry?.name ?? "AK5e feature", type: entry?.itemType ?? "feat", id: `item${++sequence}`, parent: actor,
    flags: { ak5e: { chapterTwoId: id } }, system: { uses: { max: "", spent: 0, recovery: [] }, description: { value: "Exact feature text" } }, writes: [], ...extra };
  result.uuid = `${actor.uuid}.Item.${result.id}`;
  result._source = { system: result.system };
  result.getFlag = (_scope, key) => result.flags.ak5e?.[key];
  result.update = async update => { result.writes.push(update); for (const [key, value] of Object.entries(update)) set(result, key, value); return result; };
  result.toObject = () => ({ _id: result.id, name: result.name, type: result.type, system: structuredClone(result.system), flags: structuredClone(result.flags) });
  result.sheet = { render() {} };
  actor.items.set(result.id, result);
  docs.set(result.uuid, result);
  return result;
}

test("every reviewed tracker identifies a source record; species grants receive native uses and stable feature IDs", () => {
  setup();
  for (const id of [...Object.keys(ORIGIN_USES), ...Object.keys(ORIGIN_RECORDS)]) assert.ok(ORIGINS.some(e => e.id === id), id);
  const pc = actor();
  const origin = item(pc, "species-sarkaz-clanless");
  const entry = ORIGINS.find(e => e.id === "species-sarkaz-clanless");
  const grants = prepareOriginChanges(buildOriginPlan(entry, pc), {}, pc, origin).grants;
  const survivor = grants.find(g => g.name.endsWith("Born Survivors"));
  assert.equal(survivor.system.uses.max, "1");
  assert.equal(survivor.system.uses.recovery[0].period, "lr");
  assert.equal(getOriginEntry(survivor), undefined, "granted species features are not additional origins");
  const witchcraft = grants.find(g => g.name === "Sarkaz: Witchcraft");
  assert.ok(witchcraft.system.uses.max.includes("@details.level"));
  assert.equal(witchcraft.flags.ak5e.chapterTwoId, sourceId("Witchcraft"));
});

test("old origin grants resolve by provenance and preserve spent native resources", async () => {
  setup();
  const pc = actor();
  const feature = item(pc, sourceId("Exult in Violence"));
  feature.flags.ak5e = { originGrant: { originId: "species-archosauria", index: 0 } };
  assert.equal(featureTrackers(pc)[0].maximum, 3);
  await setFeatureCounter(pc, feature.id, "uses", 1);
  assert.equal(feature.system.uses.spent, 2);
  assert.equal(feature.system.uses.max, "@prof");
  await setFeatureCounter(pc, feature.id, "uses", 0);
  assert.equal(feature.system.uses.spent, 3);
  assert.equal(feature.system.uses.max, "@prof", "editing uses must not replace formula maxima");
  assert.equal(pc.writes.length, 0);
  assert.deepEqual(featureTrackers({ ...pc, items: new Map() }), []);
  await assert.rejects(setFeatureCounter(pc, feature.id, "uses", 4), /0 to 3/);
  pc.isOwner = false;
  await assert.rejects(setFeatureCounter(pc, feature.id, "uses", 0), /own/);
});

test("Witchcraft tier remains two from level 7 onward; custom native maxima and zero Pride are retained", async () => {
  setup();
  const pc = actor();
  const witchcraft = item(pc, sourceId("Witchcraft"));
  pc.system.details.level = 6;
  assert.equal(featureTrackers(pc)[0].maximum, 1);
  for (const level of [7, 14, 20]) {
    pc.system.details.level = level;
    assert.equal(featureTrackers(pc)[0].maximum, 2);
  }
  const pride = item(pc, "background-samurai", { type: "feat" });
  await configureFeatureCounter(pc, pride.id, { label: "Pride", maximum: 0, value: 0, recovery: "lr" });
  assert.equal(featureTrackers(pc).find(t => t.item === pride).maximum, 0);
  witchcraft.system.uses = { max: "5", spent: 2, recovery: [{ period: "lr", type: "recoverAll" }] };
  assert.equal(featureTrackers(pc).find(t => t.item === witchcraft).value, 3);
});

test("background resources are not duplicated, and Officer never displays a second Tactician pool", () => {
  setup();
  const pc = actor();
  item(pc, "background-military-school-graduate");
  const grant = item(pc, "background-military-school-graduate", { type: "feat" });
  grant.flags.ak5e = { originGrant: { originId: "background-military-school-graduate", index: 0 } };
  assert.equal(featureTrackers(pc).length, 1);
  pc.items.set("tactician", { id: "tactician", type: "subclass", name: "Tactician" });
  assert.equal(featureTrackers(pc).length, 0);
});

test("Rot is accumulated, not restored on rest; Flock counters recover and Bad Luck clears only on long rest", async () => {
  setup();
  const pc = actor();
  const rot = item(pc, sourceId("In Death, Life; In Life, Death"));
  const flock = item(pc, sourceId("Birds of a Feather"));
  const luck = item(pc, sourceId("Bad Luck"));
  assert.equal(featureTrackers(pc).find(t => t.key === "rot").value, 0);
  await setFeatureCounter(pc, rot.id, "rot", 5);
  await setFeatureCounter(pc, flock.id, "prey", 0);
  await saveFeatureRecord(pc, luck.id, { rolls: "4\n4\n20" });
  await recoverFeatureTrackers(pc, {}, { type: "short" });
  assert.equal(flock.flags.ak5e.featureTracking.counters.prey, 1);
  assert.equal(rot.flags.ak5e.featureTracking.counters.rot, 5);
  assert.equal(luck.flags.ak5e.featureTracking.values.rolls, "4\n4\n20");
  await recoverFeatureTrackers(pc, {}, { type: "long" });
  assert.equal(luck.flags.ak5e.featureTracking.values.rolls, "");
  assert.equal(rot.flags.ak5e.featureTracking.counters.rot, 5);
});

test("choice records enforce Logic Engine and Flock capacity without changing native proficiencies", async () => {
  setup();
  const pc = actor();
  const logic = item(pc, sourceId("Logic Engine"));
  pc.system.details.level = 6;
  await assert.rejects(saveFeatureRecord(pc, logic.id, { items: "Sword\nArmour" }), /maximum 1/);
  pc.system.details.level = 7;
  await saveFeatureRecord(pc, logic.id, { items: "Sword\nArmour" });
  const flock = item(pc, sourceId("Birds of a Feather"));
  await assert.rejects(saveFeatureRecord(pc, flock.id, { flock: "A\nB\nC" }), /maximum 2/);
  const luck = item(pc, sourceId("Bad Luck"));
  await assert.rejects(saveFeatureRecord(pc, luck.id, { rolls: "0\n21" }), /1 to 20/);
  assert.equal(pc.writes.length, 0);
});

test("generic class counters edit one native pool, reject invalid data, and never opt in stock D&D5e features", async () => {
  setup();
  const pc = actor();
  const feature = item(pc, "unknown", { flags: { ak5e: { rawSource: "Source rule to be resolved manually." } } });
  await configureFeatureCounter(pc, feature.id, { label: "Fuel", maximum: 12, value: 8, recovery: "lr" });
  assert.equal(featureTrackers(pc)[0].value, 8);
  assert.equal(feature.system.uses.spent, 4);
  await assert.rejects(configureFeatureCounter(pc, feature.id, { label: "Fuel", maximum: 12, value: 13, recovery: "lr" }), /whole numbers/);
  feature.flags = {};
  await assert.rejects(configureFeatureCounter(pc, feature.id, { label: "Fuel", maximum: 12, value: 8, recovery: "lr" }), /AK5e feature/);
  assert.equal(featureTrackers(pc).length, 0);
});

test("target tags use reversible effects and delete only their own copied feature and status", async () => {
  setup();
  const pc = actor();
  const target = actor("Student", "npc");
  const feature = item(pc, sourceId("Ever the Student, Ever the Master"));
  const original = await target.createEmbeddedDocuments("ActiveEffect", [{ name: "Existing poison", statuses: ["poisoned"] }]);
  const tag = await applyFeatureTag(pc, feature, target, { label: "Gift", condition: "poisoned", copyFeature: true, trigger: "longRest" });
  assert.equal(target.effects.size, 2);
  assert.equal(target.items.size, 1);
  assert.equal(target.items.values().next().value.flags.ak5e.chapterTwoId, undefined);
  assert.equal(target.writes.length, 0, "base sheet data is never overwritten");
  await removeFeatureTag(target, tag.flags.ak5e.temporaryTag.id);
  assert.equal(target.effects.size, 1);
  assert.equal(target.effects.get(original[0].id).name, "Existing poison");
  assert.equal(target.items.size, 0);
  await removeFeatureTag(target, tag.flags.ak5e.temporaryTag.id);
  assert.equal(target.effects.size, 1, "repeat removal is safe");
});

test("permission checks happen before any target writes; failed feature-copy creation rolls its marker back", async () => {
  setup();
  const pc = actor();
  const target = actor("Target", "npc");
  const feature = item(pc, sourceId("Logic Engine"));
  target.isOwner = false;
  await assert.rejects(applyFeatureTag(pc, feature, target), /OwnerRequired/);
  assert.equal(target.effects.size, 0);
  target.isOwner = true;
  const create = target.createEmbeddedDocuments;
  target.createEmbeddedDocuments = async (type, data) => {
    if (type === "Item") throw new Error("Write failed");
    return create(type, data);
  };
  await assert.rejects(applyFeatureTag(pc, feature, target, { copyFeature: true }), /Write failed/);
  assert.equal(target.effects.size, 0);
});

test("Teacher applies skill proficiency to the other creature, replacement removes the old benefit, and ending restores base skills", async () => {
  setup();
  const pc = actor();
  const target = actor("First", "npc");
  const second = actor("Second", "npc");
  const feature = item(pc, sourceId("Ever the Student, Ever the Master"));
  await saveFeatureRecord(pc, feature.id, { role: "Teacher", skill: "Perception", targetUuid: target.uuid });
  const effect = featureTags(target)[0];
  assert.deepEqual(effect.changes, [{ key: "system.skills.prc.value", mode: 4, value: "1", priority: 20 }]);
  assert.equal(target.system.skills.prc.value, 1, "the permanent proficiency field is untouched");
  await saveFeatureRecord(pc, feature.id, { role: "Teacher", skill: "Perception", targetUuid: second.uuid });
  assert.equal(featureTags(target).length, 0);
  assert.equal(featureTags(second).length, 1);
  await saveFeatureRecord(pc, feature.id, { role: "", creature: "", skill: "" });
  assert.equal(featureTags(second).length, 0);
  assert.equal(feature.flags.ak5e.featureTracking.relationship, null);
});

test("Student grants expertise when already proficient and rejects an unqualified teacher", async () => {
  setup();
  const pc = actor();
  const target = actor("Teacher");
  const feature = item(pc, sourceId("Ever the Student, Ever the Master"));
  await saveAegirRelationship(pc, feature, { role: "Student", creature: target.name, skill: "Perception" }, target.uuid);
  assert.equal(featureTags(pc)[0].changes[0].value, "2");
  assert.equal(featureTags(target).length, 0);
  target._source.system.skills.prc.value = 0;
  await assert.rejects(saveAegirRelationship(pc, feature, { role: "Student", creature: target.name, skill: "Perception" }, target.uuid), /ProficiencyRequired/);
  assert.equal(featureTags(pc).length, 1, "invalid replacement preserves the previous benefit");
});

test("a failed source receipt write removes the proposed relationship but preserves the old one", async () => {
  setup();
  const pc = actor();
  const first = actor("First");
  const second = actor("Second");
  const feature = item(pc, sourceId("Ever the Student, Ever the Master"));
  await saveAegirRelationship(pc, feature, { role: "Teacher", skill: "Perception", creature: first.name }, first.uuid);
  feature.update = async () => { throw new Error("Receipt failed"); };
  await assert.rejects(saveAegirRelationship(pc, feature, { role: "Teacher", skill: "Perception", creature: second.name }, second.uuid), /Receipt failed/);
  assert.equal(featureTags(first).length, 1);
  assert.equal(featureTags(second).length, 0);
});

test("expiry matches rest owner, game time, source/target turn boundaries, combat end, and skipped rounds", () => {
  setup();
  const pc = actor();
  const target = actor("Target");
  const combat = { started: true, uuid: "Combat.test", round: 1, turn: 0, previous: { round: 1, turn: 0 }, turns: [{ id: "a", actor: pc }, { id: "b", actor: target }] };
  game.combat = combat;
  const start = { expiry: tagExpiry(pc, target, { trigger: "turnStart" }) };
  const end = { expiry: tagExpiry(pc, target, { trigger: "turnEnd" }) };
  assert.equal(tagHasExpired(start, { kind: "combatTurn", combat }), false);
  combat.turn = 1;
  assert.equal(tagHasExpired(start, { kind: "combatTurn", combat }), true);
  assert.equal(tagHasExpired(end, { kind: "combatTurn", combat }), false);
  combat.previous = { round: 1, turn: 1 }; combat.round = 2; combat.turn = 0;
  assert.equal(tagHasExpired(end, { kind: "combatTurn", combat }), true);
  assert.equal(tagHasExpired(start, { kind: "combatEnd", combat }), true);
  combat.round = 1; combat.previous = { round: 2, turn: 0 };
  assert.equal(tagHasExpired(end, { kind: "combatTurn", combat }), false, "rewinds do not expire tags");
  combat.round = 4; combat.previous = { round: 1, turn: 0 };
  assert.equal(tagHasExpired(end, { kind: "combatTurn", combat }), true);
  const rest = { expiry: tagExpiry(pc, target, { trigger: "longRest", expiryActor: "source" }) };
  assert.equal(tagHasExpired(rest, { kind: "rest", actorUuid: target.uuid, type: "long" }), false);
  assert.equal(tagHasExpired(rest, { kind: "rest", actorUuid: pc.uuid, type: "short" }), false);
  assert.equal(tagHasExpired(rest, { kind: "rest", actorUuid: pc.uuid, type: "long" }), true);
  const time = { expiry: tagExpiry(pc, target, { trigger: "time", seconds: 60 }) };
  assert.equal(tagHasExpired(time, { kind: "time", worldTime: 159 }), false);
  assert.equal(tagHasExpired(time, { kind: "time", worldTime: 160 }), true);
  assert.equal(tagHasExpired({ expiry: { trigger: "manual" } }, { kind: "rest", actorUuid: pc.uuid, type: "long" }), false);
  assert.throws(() => tagExpiry(pc, target, { trigger: "time", seconds: 0 }), /InvalidDuration/);
});

test("automatic cleanup is performed by only the elected GM; permanent relationship has no downed/death expiry", async () => {
  setup();
  const pc = actor();
  const target = actor("Target");
  const feature = item(pc, sourceId("Logic Engine"));
  await applyFeatureTag(pc, feature, target, { trigger: "time", seconds: 60 });
  game.user.id = "other";
  await expireFeatureTags({ kind: "time", worldTime: 200 });
  assert.equal(featureTags(target).length, 1);
  game.user.id = "gm";
  await expireFeatureTags({ kind: "time", worldTime: 200 });
  assert.equal(featureTags(target).length, 0);
  const tag = await applyFeatureTag(pc, feature, target, { relationship: true });
  assert.equal(tagHasExpired(tag.flags.ak5e.temporaryTag, { kind: "downed", actorUuid: pc.uuid }), false);
  assert.equal(tagHasExpired(tag.flags.ak5e.temporaryTag, { kind: "death", actorUuid: pc.uuid }), false);
});

test("native manual effect removal cleans feature copies and linked records", async () => {
  setup();
  const hooks = {};
  globalThis.Hooks = { on: (key, fn) => { hooks[key] = fn; } };
  registerFeatureTagHooks();
  const pc = actor();
  const target = actor("Target");
  const feature = item(pc, sourceId("Logic Engine"));
  const effect = await applyFeatureTag(pc, feature, target, { copyFeature: true });
  target.effects.delete(effect.id);
  hooks.deleteActiveEffect(effect);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(target.items.size, 0);
});

test("a copied feature remains discoverable and removable if its marker was deleted before cleanup", async () => {
  setup();
  const pc = actor();
  const target = actor("Target", "npc");
  const feature = item(pc, sourceId("Logic Engine"));
  const effect = await applyFeatureTag(pc, feature, target, { copyFeature: true, trigger: "time", seconds: 60 });
  target.effects.delete(effect.id);
  const [receipt] = featureTagEntries(target);
  assert.equal(receipt.effect, null);
  assert.equal(receipt.tag.expiry.worldTime, 160);
  assert.equal(receipt.tag.sourceActorUuid, pc.uuid);
  await removeFeatureTag(target, receipt.tag.id);
  assert.equal(target.items.size, 0);
  assert.deepEqual(featureTagEntries(target), []);
});

test("source owners can clear a stale relationship after a recipient removes its tag and access changes", async () => {
  setup();
  const pc = actor();
  const target = actor("Target");
  const feature = item(pc, sourceId("Ever the Student, Ever the Master"));
  await saveAegirRelationship(pc, feature, { role: "Teacher", creature: target.name, skill: "Perception" }, target.uuid);
  const tagId = featureTags(target)[0].flags.ak5e.temporaryTag.id;
  pc.isOwner = false;
  await removeFeatureTag(target, tagId);
  assert.ok(feature.flags.ak5e.featureTracking.relationship, "recipient lacks source permission");
  pc.isOwner = true;
  target.isOwner = false;
  await saveFeatureRecord(pc, feature.id, { role: "", creature: "", skill: "" });
  assert.equal(feature.flags.ak5e.featureTracking.relationship, null);
});

// A small DOM fixture exercises insertion, scoping, safe text, and rerenders.
class Node {
  constructor(tag = "div", classes = "") { this.tag = tag; this.className = classes; this.children = []; this.listeners = {}; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  prepend(child) { child.parent = this; this.children.unshift(child); }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  setAttribute() {}
  matches(selector) {
    if (selector === '.tab[data-tab="details"]') return this.tab === "details";
    if (selector === '.tab[data-tab="effects"]') return this.tab === "effects";
    if (selector === ':scope > .right') return this.className === "right";
    if (selector === '.sheet-header .ak5e-origins-button') return this.className === "ak5e-origins-button" && this.parent?.className === "sheet-header";
    return selector.startsWith(".") && this.className.split(" ").includes(selector.slice(1));
  }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}
function sheet(pc) {
  globalThis.document = { createElement: tag => new Node(tag) };
  const root = new Node();
  const header = new Node("div", "sheet-header"); header.append(new Node("button", "ak5e-origins-button"));
  const details = new Node("section", "tab"); details.tab = "details";
  const right = new Node("div", "right");
  right.append(new Node("div", "pills-lg")); details.append(right); root.append(header, details);
  return { root, details, right, app: Object.assign(new foundry.applications.sheets.ActorSheetV2(), { document: pc }) };
}
test("Origin appears beside native race/background, safely displays nationality, rerenders once, and never inserts into the header", () => {
  setup();
  const pc = actor();
  item(pc, "species-aegir"); item(pc, "nationality-gir", { name: "<Ægir>" });
  const { root, details, app } = sheet(pc);
  renderOriginControls(app, root);
  assert.equal(root.querySelectorAll(".ak5e-origins-section").length, 1);
  assert.equal(root.querySelector(".sheet-header").children.length, 0);
  const names = root.querySelector(".ak5e-origins-section").children.flatMap(row => row.children.filter(c => c.tag === "button").map(c => c.textContent));
  assert.ok(names.includes("<Ægir>"));
  renderOriginControls(app, details);
  assert.equal(root.querySelectorAll(".ak5e-origins-section").length, 1);
  pc.isOwner = false;
  renderOriginControls(app, details);
  assert.equal(root.querySelectorAll(".ak5e-origins-button").length, 0);
  pc.items.clear(); renderOriginControls(app, details);
  assert.equal(root.querySelectorAll(".ak5e-origins-section").length, 0);
});

test("trackers show on partial Details renders, have owner controls, preserve values, and skip unrelated applications", () => {
  setup();
  const pc = actor();
  const feature = item(pc, sourceId("Exult in Violence"));
  feature.system.uses = { max: "3", spent: 2, recovery: [{ period: "lr" }] };
  const { details, app } = sheet(pc);
  renderFeatureTrackers(app, details);
  renderFeatureTrackers(app, details);
  assert.equal(details.querySelectorAll(".ak5e-feature-trackers").length, 1);
  assert.equal(feature.writes.length, 0);
  assert.ok(details.querySelector(".ak5e-feature-tracker").children.some(c => c.textContent === "1 / 3"));
  pc.isOwner = false; renderFeatureTrackers(app, details);
  assert.equal(details.querySelector(".ak5e-feature-tracker").children.filter(c => c.tag === "button").length, 1, "observers can read rules but cannot edit resources");
  const blank = sheet(pc);
  renderFeatureTrackers({ document: pc }, blank.details);
  assert.equal(blank.details.querySelector(".ak5e-feature-trackers"), null);
  pc.items.clear(); renderFeatureTrackers(app, details);
  assert.equal(details.querySelector(".ak5e-feature-trackers"), null);
});

test("configured Mettle and SP controls respect ownership and existing helper rules", async () => {
  setup();
  const pc = actor();
  pc.flags.ak5e = { dying: { active: true, mettle: 5 }, operatorSkills: { maximum: 10, points: 4, active: null } };
  await adjustCharacterResource(pc, "dying", 2);
  assert.equal(pc.flags.ak5e.dying.mettle, 6);
  pc.flags.ak5e.dying.mettle = 8;
  await adjustCharacterResource(pc, "dying", -1);
  assert.equal(pc.flags.ak5e.dying.mettle, 7, "spending preserves manually recorded exceptional excess");
  let called = false;
  game.ak5e = { adjustSkillPoints: async (a, delta) => { called = a === pc && delta === 1; } };
  await adjustCharacterResource(pc, "operatorSkills", 1);
  assert.equal(called, true);
  pc.isOwner = false;
  await assert.rejects(adjustCharacterResource(pc, "dying", -1), /own/);
});

test("NPC owners can remove orphan copies from Effects; observers have no editing controls", async () => {
  setup();
  const pc = actor();
  const target = actor("Target", "npc");
  const feature = item(pc, sourceId("Logic Engine"));
  const effect = await applyFeatureTag(pc, feature, target, { copyFeature: true });
  const { details, app } = sheet(target);
  details.tab = "effects";
  renderFeatureTags(app, details);
  renderFeatureTags(app, details);
  assert.equal(details.querySelectorAll(".ak5e-feature-tags").length, 1);
  assert.equal(details.querySelector(".ak5e-feature-tracker").children.filter(c => c.tag === "button").length, 2);
  target.isOwner = false;
  renderFeatureTags(app, details);
  assert.equal(details.querySelector(".ak5e-feature-tracker").children.filter(c => c.tag === "button").length, 0);
  target.isOwner = true;
  target.effects.delete(effect.id);
  renderFeatureTags(app, details);
  const [remove] = details.querySelector(".ak5e-feature-tracker").children.filter(c => c.tag === "button");
  assert.equal(remove.textContent, "AK5E.Tags.Remove");
  remove.listeners.click({ preventDefault() {}, stopPropagation() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(target.items.size, 0);
  renderFeatureTags(app, details);
  assert.equal(details.querySelector(".ak5e-feature-tags"), null);
});
