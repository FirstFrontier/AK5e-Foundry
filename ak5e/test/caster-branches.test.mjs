import test from "node:test";
import assert from "node:assert/strict";
import { casterProfile, standardPools } from "../scripts/caster-rules.mjs";
import { getCasterSetupChoices, previewCasterSetup } from "../scripts/caster-setup.mjs";
import { casterCommand, casterRest, registerCasterFeatureHooks, getCasterView, PRIMAL_CONDITIONS } from "../scripts/caster-features.mjs";
import { applyCastModifiers, castDcBonus, casterConsumption, casterGrant, overwhelmGrowth, splashSaveHook, validateCasterContext } from "../scripts/caster-casting.mjs";
import { quoteArt } from "../scripts/arts-rules.mjs";
import { relayedTargetChange, previewUndo } from "../scripts/caster-primal-splash.mjs";
import { registerPlayUndo, currentEpoch, isLocked } from "../scripts/play-undo.mjs";

const BRANCHES = { primal: "subclass-caster-primal", splash: "subclass-caster-splash", core: "subclass-caster-core", mystic: "subclass-caster-mystic" };
const RESIDUAL_ID = "subclass-feature-caster-primal-1st-level-residual-suffering-289";
const BURST_ID = "subclass-feature-caster-primal-6th-level-elemental-burst-1773";
const TURN = "Combat.c:1:c1";
const storage = {};

function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = structuredClone(value);
}
const getFlag = function(scope, key) { return this.flags?.[scope]?.[key]; };
function effectDoc(parent, data, id) {
  return { ...structuredClone(data), id, parent, uuid: `${parent.uuid}.ActiveEffect.${id}`, getFlag,
    async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; },
    async delete() { parent.effects.delete(id); } };
}
function actorDoc(uuid, { owner = true, hp = { value: 30, max: 30, temp: 0 } } = {}) {
  const actor = { id: uuid.split(".").at(-1), uuid, documentName: "Actor", type: "npc", name: uuid.split(".").at(-1), isOwner: owner,
    flags: { ak5e: {} }, system: { attributes: { hp: structuredClone(hp) } }, items: new Map(), effects: new Map(), writes: [], getFlag,
    async update(changes) { this.writes.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; },
    async createEmbeddedDocuments(type, data) {
      assert.equal(type, "ActiveEffect");
      return data.map(entry => { const id = `e${this.effects.size + 1}_${Math.random().toString(36).slice(2, 6)}`; const doc = effectDoc(this, entry, id); this.effects.set(id, doc); return doc; });
    }, async deleteEmbeddedDocuments(_type, ids) { for (const id of ids) this.effects.delete(id); } };
  return actor;
}
function caster({ branch = "primal", level = 1, ap = 20, prof = 2, dc = 13 } = {}) {
  const actor = actorDoc("Actor.caster");
  Object.assign(actor, { type: "character", name: "Caster" });
  actor.flags.ak5e = { casting: { enabled: true, ability: "int", recovery: "long" }, artsPoints: { maximum: 35, value: ap, maximumArtLevel: 9 },
    caster: { version: 1, enabled: true, choices: {}, pools: [], operations: [], casts: [], spends: [], rulings: {}, uses: {}, turn: {}, drones: [] }, resourcePools: {} };
  actor.system = { abilities: { int: { value: 16, mod: 3 }, dex: { value: 10, mod: 0 } }, attributes: { prof, spell: { dc }, hp: { value: 20, max: 20, temp: 0 } }, currency: { cp: 0 } };
  actor.getActiveTokens = () => []; actor.getRollData = () => ({});
  const add = (id, type, flags, system = {}) => actor.items.set(id, { id, type, name: id, system, flags: { ak5e: flags }, parent: actor, uuid: `Actor.caster.Item.${id}`, getFlag });
  add("class", "class", { chapterThreeId: "class-caster" }, { levels: level });
  add("branch", "subclass", { chapterThreeId: BRANCHES[branch] });
  add("residualFeature", "feat", { chapterThreeId: RESIDUAL_ID }, { description: { value: "Residual Suffering" } });
  add("burstFeature", "feat", { chapterThreeId: BURST_ID }, { description: { value: "Elemental Burst" } });
  add("fireArt", "spell", { art: { enabled: true } }, { level: 1, activities: new Map([["a1", { id: "a1", damage: { parts: [{ types: new Set(["fire", "poison"]) }] } }]]) });
  add("cantrip", "spell", { art: { enabled: true } }, { level: 0, activities: new Map([["a1", { id: "a1", damage: { parts: [{ types: new Set(["cold"]) }] } }]]) });
  return actor;
}
function combat() {
  return { started: true, uuid: "Combat.c", id: "c", round: 1, turn: 0, combatant: { id: "c1", actor: { uuid: "Actor.caster" } },
    turns: [{ id: "c1", actor: { uuid: "Actor.caster" } }, { id: "c2", actor: { uuid: "Actor.target" } }] };
}
function world({ gm = false, withCombat = true } = {}) {
  const documents = new Map(), rolls = [], messages = [];
  globalThis.game = { user: { id: gm ? "gm" : "player", isGM: gm, targets: new Set() }, combat: withCombat ? combat() : null, time: { worldTime: 0 },
    settings: { get: (_m, key) => storage[key] ?? false }, actors: documents, scenes: new Map(), messages, users: new Map([["gm", { isGM: true }], ["player", { isGM: false }]]),
    i18n: { localize: key => key } };
  globalThis.fromUuidSync = uuid => documents.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => documents.get(uuid) ?? null;
  globalThis.foundry = { utils: { randomID: () => Math.random().toString(36).slice(2, 10) } };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), async create(data) { messages.push(data); return data; } } };
  globalThis.Roll = class { constructor(formula) { this.formula = formula; rolls.push(formula); this.total = 8 * Number(formula.split("d")[0]); } async evaluate() { return this; } async toMessage() {} };
  globalThis.Hooks = { on() {}, once() {} };
  globalThis.CONFIG = { DND5E: { activityTypes: {} }, statusEffects: Object.values(PRIMAL_CONDITIONS).map(id => ({ id, name: id, img: `${id}.svg` })) };
  registerCasterFeatureHooks();
  return { documents, rolls, messages };
}
function setup(options = {}, worldOptions = {}) {
  const env = world(worldOptions), actor = caster(options), target = actorDoc("Actor.target"), other = actorDoc("Actor.other");
  for (const doc of [actor, target, other]) env.documents.set(doc.uuid, doc);
  actor.flags.ak5e.caster.casts = [
    { id: "cast1", itemId: "fireArt", level: 1, completed: true, status: "complete", turn: TURN, context: {} },
    { id: "cast2", itemId: "fireArt", level: 1, completed: true, status: "complete", turn: TURN, context: {} },
    { id: "cantripCast", itemId: "cantrip", level: 0, completed: true, status: "complete", turn: TURN, context: {} }
  ];
  return { ...env, actor, target, other };
}
const ruling = (actor, key, value) => { actor.flags.ak5e.caster.rulings[key] = { value, source: "Reviewed by the GM against the printed source." }; };
const tags = target => [...target.effects.values()].filter(effect => effect.flags?.ak5e?.temporaryTag);
const residual = (actor, data, id) => casterCommand(actor, "residual", { castId: "cast1", targetUuid: "Actor.target", damageType: "fire", outcome: "hit", confirmed: true, ...data }, id);

test("Primal and Splash are supported Caster branches", () => {
  world();
  for (const branch of ["primal", "splash"]) {
    const profile = casterProfile(caster({ branch }));
    assert.equal(profile.branch, branch);
    assert.deepEqual(profile.blocked, []);
  }
});

test("Residual Suffering applies the table Condition until the end of the Caster's next Turn and spends one use", async () => {
  const { actor, target } = setup();
  assert.deepEqual(getCasterView(actor).residual, { id: "residualSuffering", label: "Residual Suffering", value: 4, max: 4, over: 0, overMax: false });
  const result = await residual(actor, {}, "op1");
  assert.equal(result.condition, "Burning");
  const [effect] = tags(target);
  assert.deepEqual(effect.statuses, ["ak5e-burning"]);
  assert.equal(effect.flags.ak5e.temporaryTag.expiry.trigger, "nextTurnEnd");
  assert.equal(effect.flags.ak5e.temporaryTag.expiry.actorUuid, "Actor.caster");
  assert.equal(effect.flags.ak5e.temporaryTag.expiry.round, 2);
  assert.equal(actor.flags.ak5e.resourcePools.residualSuffering.value, 3);
  // Retrying the same receipt never applies or spends twice.
  await residual(actor, {}, "op1");
  assert.equal(tags(target).length, 1);
  assert.equal(actor.flags.ak5e.resourcePools.residualSuffering.value, 3);
  await assert.rejects(residual(actor, {}, "op2"), /already applied to this Creature from that Art/);
});

test("every Residual Suffering damage type maps to its printed Condition; Poison has nothing to apply and other problems are warnings", async () => {
  assert.deepEqual(PRIMAL_CONDITIONS, { acid: "ak5e-corroded", bludgeoning: "frightened", cold: "ak5e-frozen", fire: "ak5e-burning", force: "blinded",
    lightning: "ak5e-nervous-impairment", necrotic: "ak5e-necrotised", piercing: "ak5e-bleeding", psychic: "charmed", radiant: "blinded", slashing: "ak5e-bleeding", thunder: "frightened" });
  const { actor, target, messages } = setup();
  await assert.rejects(residual(actor, { damageType: "poison" }, "p1"), /no Poison row/);
  await assert.rejects(residual(actor, { damageType: "cold" }, "p2"), error => error.name === "AK5eWarnings" && /do not list cold Damage/.test(error.message));
  await assert.rejects(residual(actor, { outcome: "succeededSave" }, "p3"), /Suffering Unmatched/);
  assert.equal(tags(target).length, 0, "a warning writes nothing");
  assert.equal(actor.flags.ak5e.resourcePools.residualSuffering, undefined);
  // WORKFLOW.md §3.2: the player may use it anyway; the override is public.
  await residual(actor, { damageType: "cold", overrides: ["damageType"] }, "p2");
  assert.deepEqual(tags(target)[0].statuses, ["ak5e-frozen"]);
  assert.match(messages.at(-1).content, /Used anyway:<\/strong> That Art&#39;s activities do not list cold Damage/);
});

test("Suffering Unmatched allows a successful save at 15; uses are exhausted at 2x PB and restored on Long Rest", async () => {
  const { actor } = setup({ level: 15, prof: 1 });
  await residual(actor, { outcome: "succeededSave" }, "s1");
  await residual(actor, { castId: "cast2" }, "s2");
  assert.equal(actor.flags.ak5e.resourcePools.residualSuffering.value, 0);
  actor.flags.ak5e.caster.casts.push({ id: "cast3", itemId: "fireArt", level: 1, completed: true, status: "complete", turn: TURN, context: {} });
  await assert.rejects(residual(actor, { castId: "cast3" }, "s3"), /No Residual Suffering uses remain/);
  // Overspend clamps at 0 and the card shows the shortfall.
  await residual(actor, { castId: "cast3", overrides: ["noUses"] }, "s3");
  assert.equal(actor.flags.ak5e.resourcePools.residualSuffering.value, 0);
  assert.match(game.messages.at(-1).content, /Residual Suffering uses short by 1/);
});

test("an unowned target without a connected GM is not applied yet; the recorded use is retried later; the same Condition refreshes", async () => {
  const { actor, target, messages } = setup();
  target.isOwner = false;
  await assert.rejects(residual(actor, {}, "u1"), /Not applied yet: no GM is connected/);
  assert.equal(tags(target).length, 0);
  const pending = actor.flags.ak5e.caster.undo.find(use => use.id === "u1");
  assert.equal(pending.status, "pending");
  assert.match(messages.at(-1).content, /Not applied yet/);
  game.user.isGM = true; target.isOwner = true; // A Foundry GM owns every Actor; the retry applies the same receipt.
  await residual(actor, {}, "u1");
  assert.equal(actor.flags.ak5e.caster.undo.find(use => use.id === "u1").status, "complete");
  assert.equal(actor.flags.ak5e.resourcePools.residualSuffering.value, 3, "the retry does not spend a second use");
  await residual(actor, { castId: "cast2" }, "u3");
  assert.equal(tags(target).length, 1);
  assert.equal(tags(target)[0].flags.ak5e.casterPrimal.opId, "u3");
});

test("Enduring Affliction adds the overlay from level 10; only Charmed gets native Speed 0 changes", async () => {
  const { actor, target } = setup({ level: 10 });
  actor.items.get("fireArt").system.activities.get("a1").damage.parts[0].types.add("psychic");
  await residual(actor, { damageType: "psychic" }, "c1");
  const [effect] = tags(target);
  assert.match(effect.flags.ak5e.temporaryTag.instructions, /Speed is reduced to 0/);
  assert.deepEqual(effect.changes.map(change => [change.key, change.mode, change.value]),
    ["walk", "fly", "swim", "climb", "burrow"].map(type => [`system.attributes.movement.${type}`, 5, "0"]));
  await residual(actor, { castId: "cast2" }, "c2");
  const burning = tags(target).find(entry => entry.statuses[0] === "ak5e-burning");
  assert.deepEqual(burning.changes, []);
  assert.match(burning.flags.ak5e.temporaryTag.instructions, /1d8 additional Fire Damage/);
  const low = setup({ level: 9 });
  await residual(low.actor, {}, "c3");
  assert.doesNotMatch(tags(low.target)[0].flags.ak5e.temporaryTag.instructions, /Enduring Affliction/);
});

test("outside combat the Condition uses manual expiry with instructions", async () => {
  const { actor, target } = setup({}, { withCombat: false });
  actor.flags.ak5e.caster.casts[0].turn = null;
  await residual(actor, {}, "m1");
  assert.equal(tags(target)[0].flags.ak5e.temporaryTag.expiry.trigger, "manual");
  assert.match(tags(target)[0].flags.ak5e.temporaryTag.instructions, /Outside combat/);
});

test("Debilitate and Destroy: the player's reading or a GM ruling, dice rolled only on the player's click, 1d8/2d8/3d8, once per Turn", async () => {
  for (const [level, dice] of [[3, 1], [7, 2], [14, 3]]) {
    const { actor, target, rolls, messages } = setup({ level });
    const data = { targetUuid: "Actor.target", damageDealt: true, negativeConfirmed: true, confirmed: true };
    await assert.rejects(casterCommand(actor, "debilitate", data, `d${level}a`), error => error.name === "AK5eReading" && error.options.length === 2);
    target.system.attributes.hp.temp = 3;
    const pending = await casterCommand(actor, "debilitate", { ...data, reading: "bypassDRResist" }, `d${level}b`);
    assert.deepEqual(pending, { awaitingRoll: true, formula: `${dice}d8`, dice });
    assert.equal(rolls.length, 0, "no die is rolled until the player clicks");
    assert.match(messages.at(-1).content, /Player's reading for this use \(no GM ruling\):<\/strong> Ignores DR and Resistance/);
    assert.equal(actor.flags.ak5e.caster.rulings.debilitateLoss, undefined, "the reading is never stored as a ruling");
    const result = await casterCommand(actor, "debilitateRoll", { useId: `d${level}b` }, `roll${level}`);
    assert.deepEqual(rolls, [`${dice}d8`]);
    assert.equal(result.hpLost, 8 * dice - 3);
    assert.equal(target.system.attributes.hp.temp, 0);
    await casterCommand(actor, "debilitateRoll", { useId: `d${level}b` }, `roll${level}x`);
    assert.equal(rolls.length, 1, "a second click reuses the recorded roll");
    await assert.rejects(casterCommand(actor, "debilitate", { ...data, reading: "bypassDRResist" }, `d${level}c`), /already affected this Creature this Turn/);
  }
  const low = setup({ level: 2 });
  ruling(low.actor, "debilitateLoss", "bypassAll");
  await assert.rejects(casterCommand(low.actor, "debilitate", { targetUuid: "Actor.target", damageDealt: true, negativeConfirmed: true, confirmed: true }, "d2"), /level 3 feature/);
  assert.equal((await casterCommand(low.actor, "debilitate", { targetUuid: "Actor.target", confirmed: true, overrides: ["level", "damageDealt", "negative"] }, "d2")).awaitingRoll, true,
    "a recorded ruling applies without a reading; warnings can be used anyway");
});

test("Elemental Burst is once per Short Rest, adds +5 DC at 15 and applies its Condition once per failed target", async () => {
  const { actor, target, messages } = setup({ level: 6 });
  const burst = await casterCommand(actor, "elementalBurst", { condition: "ak5e-frozen", confirmed: true }, "b1");
  assert.equal(burst.dc, 13);
  assert.match(messages.at(-1).content, /\[\[\/save ability=dex dc=13\]\]/);
  await assert.rejects(casterCommand(actor, "elementalBurst", { condition: "ak5e-frozen", confirmed: true }, "b2"), /since your last Short Rest/);
  await assert.rejects(casterCommand(actor, "burstCondition", { burstId: "b1", targetUuid: "Actor.target", confirmed: true }, "b3"), /failed its Dexterity Saving Throw/);
  await casterCommand(actor, "burstCondition", { burstId: "b1", targetUuid: "Actor.target", failedSave: true, confirmed: true }, "b4");
  assert.deepEqual(tags(target)[0].statuses, ["ak5e-frozen"]);
  await assert.rejects(casterCommand(actor, "burstCondition", { burstId: "b1", targetUuid: "Actor.target", failedSave: true, confirmed: true }, "b5"), /already suffers/);
  assert.equal(actor.flags.ak5e.resourcePools.residualSuffering, undefined, "Elemental Burst does not spend Residual Suffering");
  await casterRest(actor, "short");
  assert.equal(actor.flags.ak5e.caster.uses.elementalBurst, false);
  const high = setup({ level: 15 });
  // Receipts are per Caster: another Caster's card with the same operation ID must not suppress this one.
  high.messages.push({ content: "<h3>Elemental Burst</h3>", flags: { ak5e: { casterOperation: "b6", casterActor: "Actor.otherCaster" } } });
  assert.equal((await casterCommand(high.actor, "elementalBurst", { condition: "blinded", confirmed: true }, "b6")).dc, 18);
  assert.match(high.messages.at(-1).content, /dc=18\]\]/);
  assert.equal(high.messages.at(-1).flags.ak5e.casterActor, "Actor.caster");
});

test("Splashing Cantrips halves the Damage, uses DC +2 and only the original target or a failed save takes it", async () => {
  const { actor, target, other, messages, documents } = setup({ branch: "splash", level: 3 });
  const third = actorDoc("Actor.third"); documents.set(third.uuid, third);
  await assert.rejects(casterCommand(actor, "splashCantrip", { castId: "cast1", primaryTargetUuid: "Actor.target", amount: 7, singleTarget: true, confirmed: true }, "x0"), /damaging Cantrip/);
  const result = await casterCommand(actor, "splashCantrip", { castId: "cantripCast", primaryTargetUuid: "Actor.target", amount: 7, singleTarget: true, confirmed: true }, "x1");
  assert.deepEqual(result, { halved: 3, dc: 15 });
  assert.match(messages.at(-1).content, /dc=15/);
  const damage = (uuid, splashRole, id) => casterCommand(actor, "damage", { castId: "cantripCast", splashOf: "cantripCast", splashRole, targetUuid: uuid, amount: 0, type: "cold",
    reduction: 0, resistance: false, vulnerability: false, immunity: false, confirmed: true }, id);
  await damage("Actor.target", "primary", "x2");
  assert.equal(target.system.attributes.hp.value, 27);
  await assert.rejects(damage("Actor.other", "primary", "x3"), /Only the original target/);
  await damage("Actor.other", "succeeded", "x4");
  assert.equal(other.system.attributes.hp.value, 30);
  await assert.rejects(damage("Actor.other", "failed", "x5"), /already took Splashing Cantrips Damage/, "one splash result per Creature");
  await damage("Actor.third", "failed", "x6");
  assert.equal(third.system.attributes.hp.value, 27);
});

test("Splash area Damage applies Safe Zone, Maximum Burst and their GM-ruled precedence", async () => {
  const apply = async (level, data, safeZone = []) => {
    const { actor, target } = setup({ branch: "splash", level });
    actor.flags.ak5e.caster.casts[0].context = { area: "sphere", safeZone };
    await casterCommand(actor, "damage", { castId: "cast1", targetUuid: "Actor.target", amount: 10, type: "fire", reduction: 0, resistance: false,
      vulnerability: false, immunity: false, confirmed: true, ...data }, "area");
    return 30 - target.system.attributes.hp.value;
  };
  assert.equal(await apply(1, { saveOutcome: "failed", onSuccess: "half" }), 10);
  assert.equal(await apply(1, { saveOutcome: "succeeded", onSuccess: "half" }), 5);
  assert.equal(await apply(1, { saveOutcome: "succeeded", onSuccess: "none" }), 0);
  assert.equal(await apply(6, { saveOutcome: "failed", onSuccess: "half" }, ["Actor.target"]), 0, "Safe Zone succeeds automatically");
  assert.equal(await apply(6, { saveOutcome: "noSave" }, ["Actor.target"]), 10, "Safe Zone does not affect an Art without a save");
  assert.equal(await apply(15, { saveOutcome: "succeeded", onSuccess: "half", resistance: true }), 5, "Maximum Burst keeps half the rolled Damage");
  assert.equal(await apply(15, { saveOutcome: "succeeded", onSuccess: "none" }), 5);
  assert.equal(await apply(15, { saveOutcome: "failed", onSuccess: "half", immunity: true }), 0, "Immunity is excepted");
  await assert.rejects(apply(15, { saveOutcome: "failed", onSuccess: "half" }, ["Actor.target"]), /safeZoneVsMaximumBurst/);
  await assert.rejects(apply(1, { onSuccess: "half" }), /Saving Throw result/);
});

test("Economics of Violence applies after Growing Power, never raises a cost and ignores levels above 5", () => {
  world();
  const state = { enabled: true, configured: true, value: 30, maximumArtLevel: 9, ninthLevelCast: false };
  const quote = (level, caster, options = {}) => quoteArt(state, level, level, { caster }, options);
  const splash = { level: 10, maximumArtLevel: 5, economics: true };
  assert.equal(quote(3, splash).cost, 1, "3 - Growing Power 1 - Economics 1");
  assert.deepEqual(quote(3, splash).modifiers.map(m => [m.source, m.amount]), [["Growing Power", -1], ["Economics of Violence", -1]]);
  assert.equal(quote(2, splash).cost, 1, "Economics stops at its minimum of 1");
  assert.equal(quote(1, splash).cost, 0, "a cost already at 0 is not raised");
  assert.equal(quote(5, splash).cost, 4, "maximum-level cast: no Growing Power");
  assert.equal(quote(3, splash, { area: null }).cost, 2, "the used activity is not an area");
  assert.equal(quote(6, { level: 12, maximumArtLevel: 6, economics: true }).cost, 6, "above 5th level");
  const extra = quote(3, splash, { extraAP: 3 });
  assert.equal(extra.cost, 4);
  assert.deepEqual(extra.modifiers.at(-1), { source: "Overwhelming Detonation", amount: 3 });
  assert.throws(() => quote(3, splash, { extraAP: 13 }), /Additional Arts Points/);
});

function areaItem(type = "sphere", size = "20", units = "ft", override = true) {
  const activity = { id: "a1", save: { dc: { value: 13 } }, activation: { type: "action", override }, target: { override, template: { type, size: Number(size), units } } };
  const item = { type: "spell", flags: { ak5e: {} }, getFlag, system: { level: 3, activation: { type: "action" }, target: { template: { type, size: String(size), units } }, activities: new Map([["a1", activity]]) },
    updates: [], prepared: 0, embedded: [], updateSource(changes) { this.updates.push(changes); this.embedded.push(this.actor?._embeddedPreparation === true); },
    prepareFinalAttributes() { this.prepared += 1; } };
  item.actor = {};
  activity.item = item;
  return { item, activity };
}

test("Overwhelming Detonation grows each listed shape; Cylinder and non-foot areas are rejected", () => {
  assert.equal(overwhelmGrowth(areaItem("sphere", 20).activity, 2).newSize, 30);
  assert.equal(overwhelmGrowth(areaItem("cone", 15).activity, 1).newSize, 25);
  assert.equal(overwhelmGrowth(areaItem("cube", 10).activity, 2).newSize, 30);
  assert.equal(overwhelmGrowth(areaItem("line", 100).activity, 1).newSize, 120);
  assert.throws(() => overwhelmGrowth(areaItem("cylinder", 10).activity, 1), /Cone, Cube, Line or Sphere/);
  assert.throws(() => overwhelmGrowth(areaItem("sphere", 10, "m").activity, 1), /feet/);
  assert.throws(() => overwhelmGrowth(areaItem("square", 10).activity, 1), /Cone, Cube, Line or Sphere/);
});

test("Controlled Detonation adds +2 to area save DCs on the working clone only", () => {
  world();
  const splash = caster({ branch: "splash" }), core = caster({ branch: "core" });
  const area = areaItem("cone", 15), single = areaItem("", 0);
  assert.equal(castDcBonus(splash, area.item, area.activity), 2);
  assert.equal(castDcBonus(splash, single.item, single.activity), 0);
  assert.equal(castDcBonus(core, area.item, area.activity), 0);
  applyCastModifiers(splash, area.item, area.activity, { overwhelm: 1 });
  assert.deepEqual(area.item.updates, [{ "system.activities.a1.save.dc.calculation": "", "system.activities.a1.save.dc.formula": "15", "system.activities.a1.target.template.size": "25" }]);
  // D&D5e re-reads an unprepared activity from the working clone after updateSource; the clone must be re-prepared.
  assert.equal(area.item.prepared, 1, "the working clone's final data is re-prepared after its source changes");
  assert.deepEqual(area.item.embedded, [true], "Item-targeting effects are re-applied as in D&D5e's own clone updates");
  assert.equal(area.item.actor._embeddedPreparation, undefined);
  // A spell activity without a target override reads the Item's template, so Overwhelming Detonation grows that.
  const inherited = areaItem("sphere", 20, "ft", false);
  applyCastModifiers(splash, inherited.item, inherited.activity, { overwhelm: 2 });
  assert.deepEqual(inherited.item.updates, [{ "system.activities.a1.save.dc.calculation": "", "system.activities.a1.save.dc.formula": "15", "system.target.template.size": "30" }]);
  assert.equal(casterGrant(caster({ branch: "splash", level: 10 }), area.item, {}).caster.economics, true);
  assert.equal(casterGrant(caster({ branch: "splash", level: 9 }), area.item, {}).caster.economics, false);
});

test("Sculpt Arts and Unavoidable cast options: wrong branch or a non-area Art stops; source limits are warnings the caster may override", () => {
  world();
  const { item, activity } = areaItem("sphere", 20);
  const level = n => caster({ branch: "splash", level: n });
  const warned = id => error => error.name === "AK5eWarnings" && error.warnings.some(warning => warning.id === id);
  assert.throws(() => validateCasterContext(caster({ branch: "core", level: 15 }), item, { overwhelm: 1 }), /Splash Caster/);
  assert.throws(() => validateCasterContext(level(6), areaItem("", 0).item, { safeZone: ["Actor.a"] }), /targets an area/);
  assert.throws(() => validateCasterContext(level(5), item, { overwhelm: 1 }), warned("overwhelmLevel"));
  assert.throws(() => validateCasterContext(level(6), item, { overwhelm: 5 }), warned("overwhelmCap"));
  assert.throws(() => validateCasterContext(level(6), item, { overwhelm: 13 }), /Overwhelming Detonation AP/, "more than the quote allows is impossible");
  assert.equal(validateCasterContext(level(6), item, { overwhelm: 4 }).overwhelm, 4);
  const overridden = validateCasterContext(level(6), item, { overwhelm: 5, overrides: ["overwhelmCap"] });
  assert.equal(overridden.overwhelm, 5);
  assert.deepEqual(overridden.overridden, ["Overwhelming Detonation allows up to 4 additional AP (twice your Proficiency Bonus)."]);
  assert.throws(() => validateCasterContext(level(14), item, { allConsuming: true }), warned("allConsumingLevel"));
  assert.throws(() => validateCasterContext(level(15), item, { safeZone: ["A", "B", "C"], level: 1 }), warned("safeZoneCount"));
  const actor = level(15), updates = { actor: {} };
  const receipt = { id: "r1", level: 1, cost: 1 };
  activity.actor = actor;
  assert.throws(() => casterConsumption(activity, { ak5eCaster: { safeZone: ["A", "B", "C"] } }, updates, receipt), /at most 2/);
  casterConsumption(activity, { ak5eCaster: { safeZone: ["A", "B", "C"], overrides: ["safeZoneCount"] } }, { actor: {} }, { ...receipt });
  casterConsumption(activity, { ak5eCaster: { safeZone: ["A", "B"], allConsuming: true } }, updates, receipt);
  assert.equal(updates.actor["flags.ak5e.caster.uses.allConsuming"], true);
  assert.equal(receipt.caster.context.area, "sphere");
  const state = actor.flags.ak5e.caster ??= {};
  state.uses = { ...state.uses, allConsuming: true };
  assert.throws(() => validateCasterContext(actor, item, { allConsuming: true }), /since the last Short Rest/);
  assert.equal(validateCasterContext(actor, item, { allConsuming: true, overrides: ["allConsumingUsed"] }).allConsuming, true);
});

test("All-Consuming gives Disadvantage only to saves rolled from that cast's card on the same Turn", () => {
  world();
  const card = turn => ({ flags: { ak5e: { artCast: { caster: { turn, context: { allConsuming: true } } } } }, getFlag });
  game.messages = new Map([["now", card(TURN)], ["old", card("Combat.c:0:c1")]]);
  const roll = id => { const options = {}; splashSaveHook({ subject: { documentName: "Actor", uuid: "Actor.target" }, rolls: [{ options }],
    event: { target: { closest: () => ({ dataset: { messageId: id } }) } } }); return options; };
  assert.equal(roll("now").disadvantage, true);
  assert.equal(roll("old").disadvantage, undefined);
});

// Setup: the GM confirms area eligibility for the exact pair of Implements of Destruction Arts.
function setupActor(level, branch) {
  const actor = actorDoc("Actor.setup");
  Object.assign(actor, { type: "character", created: [] });
  actor.system = { abilities: { int: { value: 14, mod: 2 }, wis: { value: 12, mod: 1 }, cha: { value: 10, mod: 0 }, con: { value: 12, mod: 1 } },
    attributes: { hp: { value: 8, max: 8 }, spellcasting: "int" }, currency: { cp: 0 }, skills: {}, tools: {}, traits: { weaponProf: { custom: "" }, armorProf: { custom: "" } } };
  const add = (id, type, flags, system = {}) => actor.items.set(id, { id, type, system, flags: { ak5e: flags }, parent: actor, getFlag });
  add("caster-class", "class", { chapterThreeId: "class-caster" }, { levels: level, hd: { denomination: "d6" } });
  add("caster-branch", "subclass", { chapterThreeId: BRANCHES[branch] });
  add("wand", "weapon", { tableData: { properties: "Casting Unit" } });
  return actor;
}
function setupWorld(gm) {
  const names = [...new Set([...standardPools.flatMap(pool => pool.members.filter(member => !member.sourceId).map(member => member.name)), "Detect Magic", "Counterspell", "Dispel Magic"])];
  storage.casterArtMappings = Object.fromEntries(names.map(name => [name.toLowerCase().replace(/[^a-z0-9]/g, ""), { requestedName: name, uuid: `Item.${name}`, source: "test reviewed mapping", mappedName: name }]));
  const level = name => standardPools.flatMap(pool => pool.members).find(member => member.name === name)?.level ?? { "Detect Magic": 1, Counterspell: 3, "Dispel Magic": 3 }[name];
  const docs = new Map(names.map(name => [`Item.${name}`, { id: name, uuid: `Item.${name}`, type: "spell", name, system: { level: level(name), method: "spell", prepared: 0, properties: [], materials: {} },
    toObject() { return structuredClone({ _id: this.id, type: this.type, name: this.name, system: this.system, flags: {} }); } }]));
  globalThis.game = { user: { id: gm ? "gm" : "player", isGM: gm }, users: new Map([["gm", { isGM: true }], ["player", { isGM: false }]]),
    settings: { get: (_m, key) => storage[key] ?? {}, async set(_m, key, value) { storage[key] = structuredClone(value); } } };
  globalThis.fromUuid = async uuid => docs.get(uuid) ?? null;
}
function setupChoices(actor, branch, level) {
  const choices = { branch: BRANCHES[branch], ability: "int", pools: standardPools.slice(0, level >= 11 ? 2 : 1).map(pool => pool.id), saves: ["int", "wis"], skills: ["Arts", "Tech", "Insight"],
    tool: "Engineering Kit", castingUnit: "wand", startingEquipment: { mode: "cash" }, talents: {}, hp: { 1: { mode: "fixed", roll: 6 } }, asi: {} };
  for (let n = 2; n <= level; n++) choices.hp[n] = { mode: "fixed", roll: 4 };
  for (const asi of [4, 6, 8, 10].filter(n => n <= level)) choices.asi[asi] = { increases: [{ ability: ["str", "dex", "con", "str"][[4, 6, 8, 10].indexOf(asi)], amount: 2 }] };
  const pending = getCasterSetupChoices(actor).pending;
  if (level >= 3) choices.talents.basic = pending.find(choice => choice.key === "talents.basic")?.options[0]?.value;
  if (level >= 8) choices.talents.basicAt8 = { mode: "upgrade", sourceId: choices.talents.basic };
  if (level >= 9) choices.talents.advanced = pending.find(choice => choice.key === "talents.advanced")?.options[0]?.value;
  return choices;
}

test("Primal setup creates its branch feature Items without an unsupported-branch block", async () => {
  setupWorld(true);
  const actor = setupActor(6, "primal");
  const preview = await previewCasterSetup(actor, { choices: setupChoices(actor, "primal", 6) });
  assert.deepEqual(preview.pending, []);
  assert.deepEqual(preview.blocked, []);
  const ids = preview.createItems.map(item => item.flags?.ak5e?.chapterThreeId).filter(Boolean);
  for (const id of [RESIDUAL_ID, "subclass-feature-caster-primal-3rd-level-debilitate-and-destroy-1411", BURST_ID]) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes("subclass-feature-caster-primal-10th-level-enduring-affliction-2517"));
});

test("Splash Implements of Destruction requires two Arts and a GM area review of that exact pair", async () => {
  setupWorld(false);
  const actor = setupActor(10, "splash");
  const choices = setupChoices(actor, "splash", 10);
  const field = getCasterSetupChoices(actor).pending.find(entry => entry.key === "splashArts");
  assert.equal(field.count, 2);
  const known = new Set(standardPools[0].members.map(member => member.name));
  const picks = field.options.filter(option => !known.has(option.value)).slice(0, 2).map(option => option.value);
  const knownPick = [...known][0];
  assert.ok((await previewCasterSetup(actor, { choices: { ...choices, splashArts: [picks[0], knownPick], splashArtsReview: "reviewed" } })).pending.some(entry => entry.key === "splashArts"),
    "an Art already learned through a chosen pool is not an Implements of Destruction choice");
  Object.assign(choices, { splashArts: picks, splashArtsReview: "reviewed" });
  let preview = await previewCasterSetup(actor, { choices });
  assert.ok(preview.pending.some(entry => /A GM must confirm/.test(entry.label)));
  setupWorld(true);
  preview = await previewCasterSetup(actor, { choices });
  assert.deepEqual(preview.pending, []);
  assert.equal(preview.state.choices.splashArtsReviewedBy.userId, "gm");
  const granted = preview.createItems.filter(item => item.flags?.ak5e?.casterArtGrants?.some(grant => grant.feature === "implementsOfDestruction"));
  assert.deepEqual(granted.map(item => item.name).sort(), [...picks].sort());
  // The player may reapply the GM-reviewed pair, but not a changed pair.
  setupWorld(false);
  actor.flags.ak5e.caster = { enabled: false, choices: preview.state.choices };
  assert.deepEqual((await previewCasterSetup(actor, { choices: { ...choices, splashArtsReviewedBy: preview.state.choices.splashArtsReviewedBy } })).pending, []);
  const changed = field.options.filter(option => !known.has(option.value)).slice(1, 3).map(option => option.value);
  assert.ok((await previewCasterSetup(actor, { choices: { ...choices, splashArts: changed, splashArtsReviewedBy: preview.state.choices.splashArtsReviewedBy } })).pending.some(entry => /A GM must confirm/.test(entry.label)));
});

test("a missing Condition registration or feature Item is refused before a receipt can lock the Caster", async () => {
  const { actor, target } = setup({ level: 3 });
  CONFIG.statusEffects = CONFIG.statusEffects.filter(effect => effect.id !== "ak5e-burning");
  await assert.rejects(residual(actor, {}, "m1"), /Burning Condition is not registered/);
  assert.ok(!actor.flags.ak5e.caster.operations.some(op => op.status === "prepared"), "no prepared receipt is left behind");
  actor.items.delete("residualFeature");
  CONFIG.statusEffects.push({ id: "ak5e-burning", name: "Burning" });
  await assert.rejects(residual(actor, {}, "m2"), /Run Caster setup/);
  ruling(actor, "debilitateLoss", "bypassDRResist");
  await casterCommand(actor, "debilitate", { targetUuid: target.uuid, damageDealt: true, negativeConfirmed: true, confirmed: true }, "m3");
});

test("Elemental Burst can be retried with its receipt after its chat card failed", async () => {
  const { actor, messages } = setup({ level: 6 });
  const create = ChatMessage.implementation.create;
  ChatMessage.implementation.create = async () => { throw new Error("chat offline"); };
  await assert.rejects(casterCommand(actor, "elementalBurst", { condition: "ak5e-frozen", confirmed: true }, "eb1"), /chat offline/);
  ChatMessage.implementation.create = create;
  assert.equal((await casterCommand(actor, "elementalBurst", { condition: "ak5e-frozen", confirmed: true }, "eb1")).dc, 13);
  assert.equal(messages.filter(message => /Elemental Burst/.test(message.content)).length, 1);
  await assert.rejects(casterCommand(actor, "elementalBurst", { condition: "ak5e-frozen", confirmed: true }, "eb2"), /since your last Short Rest/);
});

test("Splash Damage is applied once per cast and Creature unless a separate area Damage instance is confirmed", async () => {
  const { actor, target } = setup({ branch: "splash", level: 3 });
  actor.flags.ak5e.caster.casts[0].context = { area: "sphere" };
  const area = (id, extra = {}) => casterCommand(actor, "damage", { castId: "cast1", targetUuid: "Actor.target", amount: 10, type: "fire", reduction: 0, resistance: false,
    vulnerability: false, immunity: false, saveOutcome: "failed", onSuccess: "half", confirmed: true, ...extra }, id);
  await area("d1");
  await area("d1");
  assert.equal(target.system.attributes.hp.value, 20, "retrying the same receipt does not apply the Damage again");
  await assert.rejects(area("d2"), /separate instance/);
  assert.equal(target.system.attributes.hp.value, 20);
  await area("d3", { overrides: ["repeat"] });
  assert.equal(target.system.attributes.hp.value, 10);
  await casterCommand(actor, "splashCantrip", { castId: "cantripCast", primaryTargetUuid: "Actor.target", amount: 6, singleTarget: true, confirmed: true }, "sc1");
  const splash = (id, extra = {}) => casterCommand(actor, "damage", { castId: "cantripCast", splashOf: "cantripCast", splashRole: "primary", targetUuid: "Actor.target", amount: 0, type: "cold",
    reduction: 0, resistance: false, vulnerability: false, immunity: false, confirmed: true, ...extra }, id);
  await splash("sc2");
  await assert.rejects(splash("sc3"), /already took Splashing Cantrips Damage/);
  assert.equal(target.system.attributes.hp.value, 7);
  await splash("sc4", { overrides: ["repeat"] });
  assert.equal(target.system.attributes.hp.value, 4, "the user may confirm applying it again");
});

test("undo restores the Residual Suffering use, removes the Condition and the ledger entry, for any receipt in the window", async () => {
  const { actor, target, messages } = setup();
  await residual(actor, {}, "r1");
  await residual(actor, { castId: "cast2", damageType: "fire" }, "r2");
  assert.equal(actor.flags.ak5e.resourcePools.residualSuffering.value, 2);
  // Undo the earlier, not the latest, receipt.
  assert.match(previewUndo(actor, "r1").lines.join(" "), /Restores 1 Residual Suffering use/);
  await casterCommand(actor, "undoUse", { useId: "r1" }, "undo1");
  assert.equal(actor.flags.ak5e.resourcePools.residualSuffering.value, 3);
  assert.ok(!tags(target).some(effect => effect.flags.ak5e.casterPrimal.opId === "r1"));
  assert.ok(!actor.flags.ak5e.caster.primal.residual.some(entry => entry.op === "r1"));
  assert.equal(actor.flags.ak5e.caster.undo.find(use => use.id === "r1").status, "undone");
  assert.match(messages.at(-1).content, /Undone: Residual Suffering/);
  // The same Creature may now take Residual Suffering from that Art again without a warning.
  await residual(actor, {}, "r3");
  assert.deepEqual((await casterCommand(actor, "undoUse", { useId: "r1" }, "undo1b")), { undone: "r1", already: true });
});

test("undo adds back the Hit Points a use removed and warns when they changed since", async () => {
  const { actor, target } = setup({ branch: "splash", level: 3 });
  actor.flags.ak5e.caster.casts[0].context = { area: "sphere" };
  target.system.attributes.hp.temp = 4;
  await casterCommand(actor, "damage", { castId: "cast1", targetUuid: "Actor.target", amount: 10, type: "fire", reduction: 0, resistance: false,
    vulnerability: false, immunity: false, saveOutcome: "failed", onSuccess: "half", confirmed: true }, "hp1");
  assert.deepEqual([target.system.attributes.hp.value, target.system.attributes.hp.temp], [24, 0]);
  target.system.attributes.hp.value = 20; // Later Damage from another source.
  assert.match(previewUndo(actor, "hp1").lines.join(" "), /changed after this use \(now 20, then 24\)/);
  await casterCommand(actor, "undoUse", { useId: "hp1" }, "undo-hp1");
  assert.deepEqual([target.system.attributes.hp.value, target.system.attributes.hp.temp], [26, 4], "the lost amount is added back, not the earlier total");
});

test("an encounter-window change locks a use for players; a GM may still undo it", async () => {
  const { actor } = setup();
  storage.encounterEpoch = 0;
  await residual(actor, {}, "w1");
  assert.equal(isLocked(actor.flags.ak5e.caster.undo[0]), false);
  storage.encounterEpoch = 1;
  assert.equal(previewUndo(actor, "w1").blocked, true);
  await assert.rejects(casterCommand(actor, "undoUse", { useId: "w1" }, "undo-w1"), /locked/);
  game.user.isGM = true;
  await casterCommand(actor, "undoUse", { useId: "w1" }, "undo-w1");
  assert.equal(actor.flags.ak5e.caster.undo[0].status, "undone");
  storage.encounterEpoch = 0;
});

test("Elemental Burst undo marks it unused again and clears the burst", async () => {
  const { actor } = setup({ level: 6 });
  await casterCommand(actor, "elementalBurst", { condition: "ak5e-frozen", confirmed: true }, "eb-u1");
  await casterCommand(actor, "undoUse", { useId: "eb-u1" }, "undo-eb");
  assert.equal(actor.flags.ak5e.caster.uses.elementalBurst, false);
  assert.equal(actor.flags.ak5e.caster.primal.burst, null);
  await casterCommand(actor, "elementalBurst", { condition: "ak5e-frozen", confirmed: true }, "eb-u2");
});

test("the GM-side relay applies only a change recorded in the Caster's own use receipt", async () => {
  const { actor, target } = setup();
  target.isOwner = false;
  await assert.rejects(residual(actor, {}, "rl1"), /no GM is connected/);
  game.user.isGM = true; target.isOwner = true; // The GM's client: a Foundry GM owns every Actor.
  await assert.rejects(relayedTargetChange(actor, "apply", { useId: "rl1", targetUuid: "Actor.other" }), /not part of the recorded use/);
  await assert.rejects(relayedTargetChange(actor, "apply", { useId: "nope", targetUuid: "Actor.target" }), /No recorded Caster use/);
  await assert.rejects(relayedTargetChange(actor, "rewrite", { useId: "rl1", targetUuid: "Actor.target" }), /Unknown relayed/);
  await relayedTargetChange(actor, "apply", { useId: "rl1", targetUuid: "Actor.target" });
  assert.deepEqual(tags(target)[0].statuses, ["ak5e-burning"]);
  await relayedTargetChange(actor, "apply", { useId: "rl1", targetUuid: "Actor.target" });
  assert.equal(tags(target).length, 1, "a replayed relay does not apply twice");
  await relayedTargetChange(actor, "revert", { useId: "rl1", targetUuid: "Actor.target" });
  assert.equal(tags(target).length, 0);
});

test("the elected GM advances the encounter epoch when a combat starts and when a started combat ends", async () => {
  world({ gm: true });
  const handlers = {};
  globalThis.Hooks = { on(name, fn) { (handlers[name] ??= []).push(fn); }, once() {} };
  game.users.activeGM = game.user;
  game.settings.register = () => {};
  game.settings.set = async (_module, key, value) => { storage[key] = value; };
  storage.encounterEpoch = 0;
  registerPlayUndo();
  const combat = { round: 1, flags: {}, getFlag, async setFlag(_scope, key, value) { this.flags.ak5e = { ...this.flags.ak5e, [key]: value }; } };
  for (const fn of handlers.combatStart) await fn(combat);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(currentEpoch(), 1);
  for (const fn of handlers.updateCombat) await fn(combat, { round: 2 });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(currentEpoch(), 1, "a later round does not start a new window");
  for (const fn of handlers.deleteCombat) fn(combat);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(currentEpoch(), 2);
  for (const fn of handlers.deleteCombat) fn({ round: 0, flags: {}, getFlag });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(currentEpoch(), 2, "deleting a combat that never started leaves the window open");
  storage.encounterEpoch = 0;
});
