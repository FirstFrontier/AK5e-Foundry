import test from "node:test";
import assert from "node:assert/strict";
import { casterProfile } from "../scripts/caster-rules.mjs";
import { casterCommand, registerCasterFeatureHooks, getCasterView } from "../scripts/caster-features.mjs";
import { applyCastModifiers, casterConsumption, splashSaveHook, validateCasterContext } from "../scripts/caster-casting.mjs";
import { previewUndo, relayedTargetChange } from "../scripts/caster-primal-splash.mjs";
import { recoverPool } from "../scripts/resource-pools.mjs";
import { resolveDamage } from "../scripts/damage-pipeline.mjs";

const TURN = "Combat.c:1:c1";
const SPARK_ID = "subclass-feature-caster-chain-3rd-level-subtle-spark-1138";
const getFlag = function(scope, key) { return this.flags?.[scope]?.[key]; };
function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = structuredClone(value);
}
function effectDoc(parent, data, id) {
  return { ...structuredClone(data), id, parent, uuid: `${parent.uuid}.ActiveEffect.${id}`, getFlag,
    async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; },
    async delete() { parent.effects.delete(id); } };
}
function actorDoc(uuid, { owner = true } = {}) {
  return { id: uuid.split(".").at(-1), uuid, documentName: "Actor", type: "npc", name: uuid.split(".").at(-1), isOwner: owner,
    flags: { ak5e: {} }, system: { attributes: { hp: { value: 30, max: 30, temp: 0 } } }, items: new Map(), effects: new Map(), writes: [], getFlag,
    async update(changes) { this.writes.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; },
    async createEmbeddedDocuments(type, data) {
      assert.equal(type, "ActiveEffect");
      return data.map(entry => { const id = `e${this.effects.size + 1}_${Math.random().toString(36).slice(2, 6)}`; const doc = effectDoc(this, entry, id); this.effects.set(id, doc); return doc; });
    }, async deleteEmbeddedDocuments(_type, ids) { for (const id of ids) this.effects.delete(id); } };
}
const scene = { id: "s", grid: { size: 100, distance: 5, units: "ft", type: 0 } };
function tokenDoc(name, actor, x, y = 0) {
  return { documentName: "Token", uuid: `Scene.s.Token.${name}`, id: name, name, actor, parent: scene, x, y, width: 1, height: 1, elevation: 0,
    getCenterPoint() { return { x: this.x + 50, y: this.y + 50 }; } };
}
function caster({ level = 3, prof = 2, dc = 13, sparkItem = true } = {}) {
  const actor = actorDoc("Actor.caster");
  Object.assign(actor, { type: "character", name: "Caster" });
  actor.flags.ak5e = { casting: { enabled: true, ability: "int", recovery: "long" }, artsPoints: { maximum: 35, value: 20, maximumArtLevel: 9 },
    caster: { version: 1, enabled: true, choices: {}, pools: [], operations: [], casts: [], spends: [], rulings: {}, uses: {}, turn: {}, drones: [] }, resourcePools: {} };
  actor.system = { abilities: { int: { value: 16, mod: 3 } }, attributes: { prof, spell: { dc }, hp: { value: 20, max: 20, temp: 0 } }, currency: { cp: 0 } };
  actor.getActiveTokens = () => []; actor.getRollData = () => ({});
  const add = (id, type, flags, system = {}) => actor.items.set(id, { id, type, name: id, system, flags: { ak5e: flags }, parent: actor, uuid: `Actor.caster.Item.${id}`, getFlag });
  add("class", "class", { chapterThreeId: "class-caster" }, { levels: level });
  add("branch", "subclass", { chapterThreeId: "subclass-caster-chain" });
  if (sparkItem) add("sparkFeature", "feat", { chapterThreeId: SPARK_ID }, { description: { value: "Subtle Spark" } });
  return actor;
}
function world({ gm = false, withCombat = true } = {}) {
  const documents = new Map(), rolls = [], messages = [];
  globalThis.game = { user: { id: gm ? "gm" : "player", isGM: gm, targets: new Set() }, time: { worldTime: 0 },
    combat: withCombat ? { started: true, uuid: "Combat.c", id: "c", round: 1, turn: 0, combatant: { id: "c1", actor: { uuid: "Actor.caster" } },
      turns: [{ id: "c1", actor: { uuid: "Actor.caster" } }, { id: "c2", actor: { uuid: "Actor.target" } }] } : null,
    settings: { get: () => false }, actors: documents, scenes: new Map(), messages, users: new Map([["gm", { isGM: true }], ["player", { isGM: false }]]),
    i18n: { localize: key => key } };
  globalThis.fromUuidSync = uuid => documents.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => documents.get(uuid) ?? null;
  globalThis.foundry = { utils: { randomID: () => Math.random().toString(36).slice(2, 10) } };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), async create(data) { messages.push(data); return data; } } };
  globalThis.Roll = class { constructor(formula) { rolls.push(formula); this.total = 1; } async evaluate() { return this; } async toMessage() {} };
  globalThis.Hooks = { on() {}, once() {} };
  globalThis.CONFIG = { DND5E: { activityTypes: {} }, statusEffects: [] };
  registerCasterFeatureHooks();
  return { documents, rolls, messages };
}
function setup(options = {}, worldOptions = {}) {
  const env = world(worldOptions), actor = caster(options), target = actorDoc("Actor.target"), second = actorDoc("Actor.second"), third = actorDoc("Actor.third"), near = actorDoc("Actor.near"), far = actorDoc("Actor.far");
  const tokens = { target: tokenDoc("T", target, 0), second: tokenDoc("S", second, 200), third: tokenDoc("U", third, 300), near: tokenDoc("N", near, 100), far: tokenDoc("F", far, 400) };
  for (const doc of [actor, target, second, third, near, far, ...Object.values(tokens)]) env.documents.set(doc.uuid, doc);
  actor.flags.ak5e.caster.casts = [
    { id: "cast1", itemId: "art", level: 1, completed: true, status: "complete", turn: TURN, targets: [tokens.target.uuid, tokens.second.uuid], context: {} },
    { id: "cast2", itemId: "art", level: 1, completed: true, status: "complete", turn: TURN, targets: [tokens.target.uuid], context: {} }
  ];
  return { ...env, actor, target, second, third, far, tokens };
}
const ruling = (actor, key, value) => { actor.flags.ak5e.caster.rulings[key] = { value, source: "Reviewed by the GM against the printed source." }; };
const sparkTags = target => [...target.effects.values()].filter(effect => effect.flags?.ak5e?.casterSpark);
const chainInput = (tokens, extra = {}) => ({ mode: "chain", originalTokenUuid: tokens.target.uuid, chainedTokenUuids: [tokens.second.uuid], singleTarget: true, ...extra });
const spark = (actor, data, id) => casterCommand(actor, "spark", { castId: "cast2", effect: "innervate", targetUuids: ["Actor.target"], singleTarget: true, confirmed: true, ...data }, id);
const pools = actor => actor.flags.ak5e.resourcePools;

test("Chain is a supported Caster branch with Chain Art (PB per Long Rest) and Sparks 6/8/10/12", () => {
  const { actor } = setup({ level: 1 });
  assert.equal(casterProfile(actor).branch, "chain");
  assert.deepEqual(casterProfile(actor).blocked, []);
  assert.equal(getCasterView(actor).chain.chainArt.max, 2);
  assert.equal(getCasterView(actor).chain.sparks.max, 0, "Subtle Spark starts at level 3");
  for (const [level, sparks] of [[3, 6], [6, 6], [7, 8], [11, 10], [14, 12], [20, 12]]) {
    const { actor: leveled } = setup({ level });
    assert.equal(getCasterView(leveled).chain.sparks.max, sparks, `level ${level}`);
  }
});

test("Great Chain of Being regains one Chain Art use on a Short Rest at 15 only; a Long Rest restores all", async () => {
  const { actor } = setup({ level: 15, prof: 5 });
  actor.flags.ak5e.resourcePools.chainArt = { value: 1 };
  await recoverPool(actor, "sr", { poolIds: ["chainArt"] });
  assert.equal(pools(actor).chainArt.value, 2);
  await recoverPool(actor, ["lr", "sr"], { poolIds: ["chainArt"] });
  assert.equal(pools(actor).chainArt.value, 5);
  const { actor: lower } = setup({ level: 14, prof: 5 });
  lower.flags.ak5e.resourcePools.chainArt = { value: 1 };
  await recoverPool(lower, "sr", { poolIds: ["chainArt"] });
  assert.equal(pools(lower).chainArt.value, 1);
});

test("Chain Art cast option: reach, count, single-target confirmation and uses are warnings the caster may override", () => {
  const { actor, tokens } = setup({ level: 5 });
  const item = { system: { activities: new Map() } };
  assert.equal(validateCasterContext(actor, item, { chain: chainInput(tokens) }).chain.chainedActorUuids[0], "Actor.second");
  // Three chained Creatures before level 15, one of them more than 15 feet from the original target, and no confirmation.
  const input = { chain: chainInput(tokens, { chainedTokenUuids: [tokens.second.uuid, tokens.third.uuid, tokens.far.uuid], singleTarget: false }) };
  assert.throws(() => validateCasterContext(actor, item, input), error => error.name === "AK5eWarnings"
    && error.warnings.some(w => w.id === "chainCount") && error.warnings.some(w => /F is more than 15 feet/.test(w.text))
    && error.warnings.some(w => w.id === "singleTarget") && !error.warnings.some(w => /S is more than/.test(w.text)));
  let ids = [];
  try { validateCasterContext(actor, item, input); } catch (error) { ids = error.warnings.map(w => w.id); }
  const context = validateCasterContext(actor, item, { ...input, overrides: ids });
  assert.equal(context.chain.overridden.length, 3);
  assert.equal(context.overridden.length, 3);
  // Level 15: three additional Creatures are within the approved interpretation of the source limit.
  const { actor: great, tokens: t15 } = setup({ level: 15, prof: 5 });
  assert.doesNotThrow(() => validateCasterContext(great, item, { chain: chainInput(t15, { chainedTokenUuids: [t15.near.uuid, t15.second.uuid, t15.third.uuid] }) }));
  assert.throws(() => validateCasterContext(great, item, { chain: chainInput(t15, { chainedTokenUuids: [t15.near.uuid, t15.second.uuid, t15.third.uuid, t15.far.uuid] }) }), error => error.warnings?.some(w => w.id === "chainCount"));
  // Impossible input and the wrong branch still stop.
  assert.throws(() => validateCasterContext(actor, item, { chain: chainInput(tokens, { chainedTokenUuids: [] }) }), /at least one Creature/);
  assert.throws(() => validateCasterContext(actor, item, { chain: chainInput(tokens, { chainedTokenUuids: [tokens.target.uuid] }) }), /distinct Creatures other than the original/);
  assert.throws(() => validateCasterContext(actor, item, { chain: { ...chainInput(tokens), mode: "ouroboros" } }), error => error.warnings?.some(w => w.id === "ouroborosLevel"));
});

test("a Chain Art cast spends one use in the cast's update and records an undoable receipt; an empty pool clamps at 0", async () => {
  const { actor, tokens } = setup({ level: 3 });
  const activity = { actor, item: { id: "art", system: { activities: new Map() } }, activation: { type: "action" } };
  const consume = (id, overrides) => {
    const updates = { actor: {} };
    casterConsumption(activity, { ak5eCaster: { chain: chainInput(tokens), ...(overrides ? { overrides } : {}) } }, updates, { id, level: 1, cost: 2 });
    return updates.actor;
  };
  let updates = consume("castA");
  await actor.update(updates);
  assert.equal(pools(actor).chainArt.value, 1);
  const receipt = actor.flags.ak5e.caster.undo.find(use => use.id === "castA-chain");
  assert.equal(receipt.title, "Chain Art");
  assert.match(receipt.summary, /chains from T to S/);
  assert.equal(actor.flags.ak5e.caster.casts.at(-1).context.chain.originalActorUuid, "Actor.target");
  await actor.update(consume("castB"));
  assert.equal(pools(actor).chainArt.value, 0);
  assert.throws(() => consume("castC"), error => error.warnings?.some(w => w.id === "chainUses"));
  await actor.update(consume("castC", ["chainUses"]));
  assert.equal(pools(actor).chainArt.value, 0, "never negative");
  assert.equal(actor.flags.ak5e.caster.undo.find(use => use.id === "castC-chain").shortfall, "Chain Art uses short by 1");
  // Undo restores exactly the use that receipt spent.
  assert.match(previewUndo(actor, "castA-chain").lines.join(" "), /Restores 1 Chain Art use/);
  await casterCommand(actor, "undoUse", { useId: "castA-chain" }, "undoA");
  assert.equal(pools(actor).chainArt.value, 1);
});

test("Chain Art lists the chained Creatures as targets on the cast's working clone", () => {
  const { actor, tokens } = setup({ level: 3 });
  const changes = [];
  const item = { system: { level: 1, activities: new Map() }, updateSource(data) { changes.push(data); }, prepareFinalAttributes() {} };
  const activity = { id: "a1", target: { override: true, affects: { count: "1" } } };
  const chain = validateCasterContext(actor, item, { chain: chainInput(tokens, { chainedTokenUuids: [tokens.second.uuid] }) }).chain;
  applyCastModifiers(actor, item, activity, { chain });
  assert.deepEqual(changes, [{ "system.activities.a1.target.affects.count": "2" }]);
});

test("Ouroboros gives the original target Disadvantage on saves from that cast's card this Turn only", () => {
  world();
  const context = { chain: { mode: "ouroboros", originalActorUuid: "Actor.target" } };
  const card = turn => ({ flags: { ak5e: { artCast: { caster: { turn, context } } } }, getFlag });
  game.messages = new Map([["now", card(TURN)], ["old", card("Combat.c:0:c1")]]);
  const roll = (id, uuid = "Actor.target") => { const options = {}; splashSaveHook({ subject: { documentName: "Actor", uuid }, rolls: [{ options }],
    event: { target: { closest: () => ({ dataset: { messageId: id } }) } } }); return options; };
  assert.equal(roll("now").disadvantage, true);
  assert.equal(roll("now", "Actor.other").disadvantage, undefined);
  assert.equal(roll("old").disadvantage, undefined);
});

test("Subtle Spark applies a native effect until the start of the Caster's next Turn and spends one Spark; nothing is rolled", async () => {
  const { actor, target, rolls, messages } = setup({ level: 3 });
  const result = await spark(actor, {}, "s1");
  assert.equal(result.spent, 1);
  assert.equal(pools(actor).subtleSparks.value, 5);
  const [effect] = sparkTags(target);
  assert.deepEqual(effect.changes.find(change => change.key === "system.bonuses.mwak.attack"), { key: "system.bonuses.mwak.attack", mode: 2, value: "+1" });
  assert.equal(effect.flags.ak5e.temporaryTag.expiry.trigger, "turnStart");
  assert.equal(effect.flags.ak5e.temporaryTag.expiry.actorUuid, "Actor.caster");
  assert.match(messages.at(-1).content, /Subtle Spark: Innervate/);
  await spark(actor, {}, "s1");
  assert.equal(sparkTags(target).length, 1, "a retry never applies or spends twice");
  assert.equal(pools(actor).subtleSparks.value, 5);
  await assert.rejects(spark(actor, {}, "s2"), error => error.warnings?.some(w => w.id === "repeat"));
  assert.deepEqual(rolls, []);
});

test("all six Subtle Sparks post save buttons without rolling and apply the printed effect after confirmed failed saves", async () => {
  const cases = [
    { effect: "accelerate", key: "system.attributes.movement.walk", value: "10", save: false },
    { effect: "bolster", dr: 2, save: false },
    { effect: "decelerate", key: "system.attributes.movement.walk", value: "-10", save: true },
    { effect: "enervate", key: "system.bonuses.mwak.attack", value: "-1", save: true },
    { effect: "innervate", key: "system.bonuses.mwak.attack", value: "+1", save: false },
    { effect: "shred", dr: -2, save: true }
  ];
  for (const [index, expected] of cases.entries()) {
    const { actor, target, rolls, messages } = setup({ level: 3 });
    const useId = `all-sparks-${index}`;
    const result = await spark(actor, { effect: expected.effect }, useId);
    assert.equal(result.spent, 1, `${expected.effect} costs one Spark`);
    assert.equal(rolls.length, 0, `${expected.effect} must not roll its save or effect dice`);
    assert.equal(sparkTags(target).length, expected.save ? 0 : 1, `${expected.effect} applies immediately only when no save is required`);
    assert.equal(actor.flags.ak5e.caster.chain.sparks.at(-1).save, expected.save);
    assert.equal(sparkTags(actor).length, 0);
    const content = messages.at(-1).content;
    if (expected.save) {
      assert.match(content, /\[\[\/save ability=con dc=13\]\]/, `${expected.effect} provides the target's Constitution save control`);
      await casterCommand(actor, "sparkCondition", { sparkId: useId, targetUuid: target.uuid, failedSave: true, confirmed: true }, `${useId}-failed-save`);
    }
    const effect = sparkTags(target).find(entry => entry.flags.ak5e.casterSpark.effect === expected.effect);
    assert.ok(effect, `${expected.effect} effect is applied to the affected target`);
    assert.equal(effect.flags.ak5e.temporaryTag.expiry.trigger, "turnStart", `${expected.effect} expires at the Caster's next Turn`);
    if (expected.key) assert.ok(effect.changes.some(change => change.key === expected.key && change.value === expected.value), `${expected.effect} applies ${expected.key}=${expected.value}`);
    if (expected.dr !== undefined) assert.equal(effect.flags.ak5e.drAdjustment, expected.dr, `${expected.effect} DR adjustment`);
    assert.equal(rolls.length, 0, `${expected.effect} remains player-rolled after application`);
  }
});

test("upgraded effects: Innervate becomes +1d4, Bolster 4 DR, and Accelerate takes the player's per-use reading", async () => {
  const { actor, target } = setup({ level: 10, prof: 4 });
  await spark(actor, { upgraded: true }, "u1");
  assert.equal(sparkTags(target)[0].changes[0].value, "+1d4");
  await spark(actor, { castId: "cast1", effect: "bolster", upgraded: true, targetUuids: ["Actor.target"] }, "u2");
  assert.equal(sparkTags(target).find(effect => effect.flags.ak5e.casterSpark.effect === "bolster").flags.ak5e.drAdjustment, 4);
  const { actor: fast, target: runner, messages } = setup({ level: 10, prof: 4 });
  await assert.rejects(spark(fast, { effect: "accelerate", upgraded: true }, "a1"), error => error.name === "AK5eReading" && error.key === "sparkUpgradeBase");
  await spark(fast, { effect: "accelerate", upgraded: true, upgradeBase: "replacesBase" }, "a1");
  assert.deepEqual(sparkTags(runner)[0].changes, [{ key: "system.abilities.dex.bonuses.save", mode: 2, value: "+1d4" }]);
  assert.match(messages.at(-1).content, /replaces the Speed change/);
  // Below level 10 the upgrade is a warning, not a block; an upgraded Accelerate first asks for its reading, then warns.
  const { actor: early } = setup({ level: 5 });
  await assert.rejects(spark(early, { upgraded: true }, "e1"), error => error.warnings?.some(w => w.id === "upgradeLevel"));
  await assert.rejects(spark(early, { effect: "accelerate", upgraded: true }, "e2"), error => error.name === "AK5eReading");
  await assert.rejects(spark(early, { effect: "accelerate", upgraded: true, readings: { sparkUpgradeBase: "addsToBase" } }, "e2"), error => error.warnings?.some(w => w.id === "upgradeLevel"));
  await spark(early, { effect: "accelerate", upgraded: true, readings: { sparkUpgradeBase: "addsToBase" }, overrides: ["upgradeLevel"] }, "e2");
});

test("Spark cost for several Creatures uses the GM ruling or the player's reading for that use", async () => {
  const { actor } = setup({ level: 3 });
  const data = { castId: "cast1", targetUuids: ["Actor.target", "Actor.second"] };
  await assert.rejects(spark(actor, data, "m1"), error => error.name === "AK5eReading" && error.key === "sparkCost");
  const result = await spark(actor, { ...data, reading: "perCreature" }, "m1");
  assert.equal(result.spent, 2);
  assert.equal(pools(actor).subtleSparks.value, 4);
  ruling(actor, "sparkCost", "perCast");
  const { actor: ruled } = setup({ level: 3 });
  ruling(ruled, "sparkCost", "perCast");
  assert.equal((await spark(ruled, data, "m2")).spent, 1);
});

test("save effects post a Constitution save button and apply only to Creatures confirmed as failing", async () => {
  const { actor, target, messages } = setup({ level: 3 });
  const result = await spark(actor, { effect: "decelerate" }, "d1");
  assert.equal(result.dc, 13);
  assert.equal(sparkTags(target).length, 0);
  assert.match(messages.at(-1).content, /\[\[\/save ability=con dc=13\]\]/);
  const fail = data => casterCommand(actor, "sparkCondition", { sparkId: "d1", targetUuid: "Actor.target", failedSave: true, confirmed: true, ...data }, `f${Math.random().toString(36).slice(2, 6)}`);
  await assert.rejects(fail({ failedSave: false }), error => error.warnings?.some(w => w.id === "failedSave"));
  await fail({});
  assert.deepEqual(sparkTags(target)[0].changes, [{ key: "system.attributes.movement.walk", mode: 2, value: "-10" }]);
  await assert.rejects(fail({}), error => error.warnings?.some(w => w.id === "repeat"));
});

test("an empty Spark pool, a non-target Creature and a missing confirmation are warnings; overrides clamp at 0 and are public", async () => {
  const { actor, messages } = setup({ level: 3 });
  actor.flags.ak5e.resourcePools.subtleSparks = { value: 0 };
  const data = { castId: "cast2", targetUuids: ["Actor.far"], singleTarget: false };
  await assert.rejects(spark(actor, data, "w1"), error => ["sparks", "singleTarget"].every(id => error.warnings.some(w => w.id === id)) && error.warnings.some(w => /far was not recorded/.test(w.text)));
  let overrides = [];
  try { await spark(actor, data, "w1"); } catch (error) { overrides = error.warnings.map(w => w.id); }
  await spark(actor, { ...data, overrides }, "w1");
  assert.equal(pools(actor).subtleSparks.value, 0);
  assert.match(messages.at(-1).content, /Used anyway/);
  assert.match(messages.at(-1).content, /Sparks short by 1/);
});

test("an unowned target is changed through the GM relay; undo removes the effect and restores the Spark", async () => {
  const { actor, target } = setup({ level: 3 });
  target.isOwner = false;
  await assert.rejects(spark(actor, {}, "r1"), /Not applied yet: no GM is connected/);
  assert.equal(actor.flags.ak5e.caster.undo.find(use => use.id === "r1").status, "pending");
  // The GM-client half (a Foundry GM owns every Actor) accepts only the change recorded in the Caster's receipt.
  game.user.isGM = true; target.isOwner = true;
  await relayedTargetChange(actor, "apply", { useId: "r1", targetUuid: "Actor.target" });
  assert.equal(sparkTags(target).length, 1);
  await assert.rejects(relayedTargetChange(actor, "apply", { useId: "r1", targetUuid: "Actor.second" }), /not part of the recorded use/);
  game.user.isGM = false;
  await spark(actor, {}, "r1");
  assert.equal(actor.flags.ak5e.caster.undo.find(use => use.id === "r1").status, "complete");
  assert.match(previewUndo(actor, "r1").lines.join(" "), /Restores 1 Spark use.*removes Innervate/);
  await casterCommand(actor, "undoUse", { useId: "r1" }, "undo1");
  assert.equal(sparkTags(target).length, 0);
  assert.equal(pools(actor).subtleSparks.value, 6);
  assert.equal(actor.flags.ak5e.caster.chain.sparks.length, 0, "the Spark ledger entry is removed");
});

test("outside combat a Spark effect has manual expiry and instructions", async () => {
  const { actor, target } = setup({ level: 3 }, { withCombat: false });
  await spark(actor, {}, "o1");
  const [effect] = sparkTags(target);
  assert.equal(effect.flags.ak5e.temporaryTag.expiry.trigger, "manual");
  assert.match(effect.flags.ak5e.temporaryTag.instructions, /remove it manually/);
});

test("a missing Subtle Spark feature Item is refused before a receipt can lock the Caster", async () => {
  const { actor } = setup({ level: 3 });
  actor.items.delete("sparkFeature");
  await assert.rejects(spark(actor, {}, "x1"), /Run Caster setup/);
  assert.equal((actor.flags.ak5e.caster.undo ?? []).length, 0);
});

test("Bolster and Shred Defences adjust the resolved DR, never below 0", () => {
  assert.equal(resolveDamage({ amount: 10, reduction: 3, adjustment: 2, hp: { value: 30 } }).final, 5);
  assert.equal(resolveDamage({ amount: 10, reduction: 3, adjustment: -4, hp: { value: 30 } }).final, 10);
  assert.equal(resolveDamage({ amount: 10, reduction: 6, adjustment: -2, corroded: true, hp: { value: 30 } }).final, 8, "adjusted before Corroded halves it");
  assert.throws(() => resolveDamage({ amount: 10, reduction: 3, adjustment: 1.5 }), /whole number/);
});
