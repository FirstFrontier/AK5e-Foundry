import test from "node:test";
import assert from "node:assert/strict";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import { STANDARD_ENTRIES, STANDARD_BRANCH_ID, standardState, standardWeaponData, reductionPreview } from "../scripts/standard-bearer-rules.mjs";
import { executeStandardCommand, getStandardView, handleStandardRequest, registerStandardBearerHooks, standardKey, submitStandardCommand, waitForStandardOperations } from "../scripts/standard-bearer.mjs";
import { expireFeatureTags, tagHasExpired } from "../scripts/feature-tags.mjs";
import { CHAPTER_THREE_CLASSES as classes } from "../scripts/chapter-three-content.mjs";
import { processOperatorEvent } from "../scripts/operator-skills.mjs";

const docs = new Map(), hooks = new Map(); let sequence = 0, forcedRolls = [];
const gm = { id: "gm", isGM: true }, owner = { id: "owner", isGM: false }, pickerOwner = { id: "picker", isGM: false }, stranger = { id: "stranger", isGM: false };
function put(object, path, value) { const parts = path.split("."); let next = object;
  for (const part of parts.slice(0, -1)) next = next[part] ??= {}; next[parts.at(-1)] = structuredClone(value); }
function document(data, parent, kind, collection) {
  const id = data._id ?? `d${++sequence}`.padEnd(16, "0");
  const doc = { ...structuredClone(data), id, documentName: kind, parent, isOwner: true, effects: new Map(),
    uuid: parent ? `${parent.uuid}.${kind}.${id}` : `${kind}.${id}`,
    getFlag(ns, key) { return this.flags?.[ns]?.[key]; },
    async update(changes) { if (this.blockUpdate) throw new Error("blocked write");
      for (const [key, value] of Object.entries(changes)) put(this, key, value); return this; },
    async delete() { collection?.delete(id); docs.delete(this.uuid); },
    toObject() { return structuredClone(data); } };
  docs.set(doc.uuid, doc); collection?.set(id, doc); return doc;
}
function actor(name, level = 17, ownedBy = owner.id, synthetic = false) {
  const a = document({ name, type: "character", flags: { ak5e: {} }, system: { abilities: { cha: { mod: 3 } }, attributes: { prof: 6,
    hp: { value: 20, max: 40, temp: 0 }, movement: { walk: 30, fly: 10, swim: 0, climb: 0, burrow: 0 } }, skills: { per: { value: 1 }, itm: { value: 0 } } } }, null, "Actor", synthetic ? null : game.actors);
  a.items = new Map(); a.effects = new Map(); a.isToken = synthetic;
  if (synthetic) { docs.delete(a.uuid); a.uuid = `Scene.test.Token.${a.id}.Actor.${a.id}`; docs.set(a.uuid, a); }
  a.testUserPermission = u => u.isGM || u.id === ownedBy;
  a.createEmbeddedDocuments = async (type, entries) => entries.map(e => document(e, a, type, type === "Item" ? a.items : a.effects));
  a.deleteEmbeddedDocuments = async (type, ids) => { for (const id of ids) await (type === "Item" ? a.items : a.effects).get(id)?.delete(); };
  a.getRollData = () => ({});
  a.calculateDamage = parts => ({ amount: parts.reduce((sum, p) => sum + p.value, 0) });
  if (level) {
    for (const entry of [CHAPTER_THREE_CLASSES.find(e => e.id === "class-vanguard"), CHAPTER_THREE_CLASSES.find(e => e.id === STANDARD_BRANCH_ID),
      ...STANDARD_ENTRIES, ...CHAPTER_THREE_CLASSES.filter(e => /tip-of-the-spear|directed-engagement/.test(e.id))]) {
      document({ name: entry.name, type: entry.itemType, flags: { ak5e: { chapterThreeId: entry.id, rawSource: entry.rawSource, sourceHeading: entry.sourceHeading } },
        system: { ...entry.systemData, ...(entry.itemType === "class" ? { levels: level, hd: { denomination: "d8", spent: 0 } } : {}) } }, a, "Item", a.items);
    }
  }
  return a;
}
function token(a, scene, x, hidden = false) {
  const t = document({ name: a.name, actorId: a.id, x, y: 100, width: 1, height: 1, hidden, disposition: 1, flags: {} }, scene, "Token", scene.tokens);
  t.actor = a; t.object = { visible: !hidden }; return t;
}
function setup(level = 17) {
  docs.clear(); hooks.clear(); forcedRolls = [];
  globalThis.game = { user: gm, users: new Map([gm, owner, pickerOwner, stranger].map(u => [u.id, u])), actors: new Map(), scenes: new Map(), combats: new Map(), time: { worldTime: 0 }, i18n: { localize: k => k } };
  game.users.activeGM = gm;
  globalThis.foundry = { utils: { randomID: () => `random${++sequence}` }, applications: { api: { DialogV2: {} }, sheets: { ActorSheetV2: class {} } } };
  globalThis.CONFIG = { statusEffects: [{ id: "frightened", changes: [] }], time: { roundTime: 6 } };
  globalThis.Hooks = { on(n, cb) { const a = hooks.get(n) ?? []; a.push(cb); hooks.set(n, a); return cb; }, off() {} };
  globalThis.ui = { notifications: { error() {}, warn() {} } };
  globalThis.fromUuid = async id => docs.get(id);
  globalThis.Roll = class { constructor(formula) { this.formula = formula; } async evaluate() { this.total = forcedRolls.shift() ?? 4; return this; } async toMessage() {} };
  globalThis.Actor = { implementation: { create: async data => document(data, null, "Actor", game.actors) } };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}) } };
  const scene = document({ name: "arena", grid: { type: 0, size: 100, distance: 5, units: "ft" } }, null, "Scene", game.scenes);
  scene.tokens = new Map(); scene.templates = new Map(); scene.testUserPermission = () => true;
  scene.createEmbeddedDocuments = async (type, entries) => entries.map(e => document(e, scene, type, type === "Token" ? scene.tokens : scene.templates));
  const bearer = actor("bearer", level), ally = actor("ally", 0), other = actor("picker", 0, pickerOwner.id), source = token(bearer, scene, 100), target = token(ally, scene, 200), picker = token(other, scene, 100);
  const combat = { uuid: "Combat.test", id: "test", started: true, round: 1, turn: 0, previous: { round: 0, turn: null }, turns: [{ id: "bearer", actor: bearer }, { id: "ally", actor: ally }] };
  combat.combatant = combat.turns[0]; game.combat = combat; game.combats.set(combat.id, combat);
  globalThis.canvas = { scene, ready: true };
  return { bearer, ally, other, source, target, picker, scene, combat };
}
const confirmed = { confirmation: true, facts: { qualifying: true, action: true, reaction: true, allied: true, hostile: true, visible: true, hears: true, grounded: true, willing: true, notKilledOutright: true, beforeGain: true } };
async function command(f, command, extra = {}, id = `request${++sequence}`, user = gm) {
  return executeStandardCommand(f.bearer, { id, command, data: { ...confirmed, sourceTokenUuid: f.source.uuid, targetTokenUuids: [f.target.uuid], ...extra } }, user);
}
async function wield(f) { await command(f, "setup"); await command(f, "wield"); }

test("queued canvas refresh does not recreate removed Standard Bearer support", async () => {
  const f = setup(); await wield(f); registerStandardBearerHooks();
  for (const callback of hooks.get("canvasReady") ?? []) callback();
  delete f.bearer.flags.ak5e.standardBearer;
  const templates = f.scene.templates.size;
  let updateAttempts = 0;
  const original = f.bearer.update.bind(f.bearer);
  f.bearer.update = async changes => { updateAttempts++; return original(changes); };
  await waitForStandardOperations(f.bearer);
  assert.equal(updateAttempts, 0, "queued refresh must not attempt a stale write even when its hook catches errors");
  assert.equal(f.bearer.getFlag("ak5e", "standardBearer"), undefined);
  assert.equal(f.scene.templates.size, templates);
});
function addOperatorPool(a, methods = ["automatic"], cost = 50) {
  const entry = classes.find(candidate => candidate.operatorSkill);
  document({ name: entry.name, type: "feat", flags: { ak5e: { operatorSkill: { ...entry.operatorSkill, sourceId: entry.id,
    methods, cost, start: 0 } } }, system: {} }, a, "Item", a.items);
  a.flags.ak5e.operatorSkills = { enabled: true, points: 0, operations: [], pendingEvents: [], resolutions: [] };
}
async function activateLastStand(f) {
  await wield(f); await command(f, "plant", {}, "plant-for-laststand");
  await command(f, "lastStand", {}, "activate-laststand");
}

test("source weapon and reduction values preserve AK5e rules", () => {
  const w = standardWeaponData("Actor.a"); assert.equal(w.system.damage.base.denomination, 8); assert.deepEqual(w.system.properties, ["fin", "two"]);
  assert.equal(w.system.weight.value, 5); assert.equal(w.system.price.value, 200);
  assert.equal(reductionPreview(5, 9, { resistance: true }), 1); assert.equal(reductionPreview(0, 9), 0);
});
test("confirmation and invalid preflight do not leave an interrupted operation", async () => {
  const f = setup();
  await assert.rejects(command(f, "plant", { confirmation: false }), /Confirm/);
  assert.equal(f.bearer.getFlag("ak5e", "standardBearer"), undefined);
  await assert.rejects(command(f, "plant"), /wield/);
  assert.equal(standardState(f.bearer).operations.length, 0);
  await command(f, "setup"); assert.equal([...f.bearer.items.values()].filter(i => i.flags.ak5e.standardWeapon).length, 1);
});
test("setup preserves IDs and authored activities; planting/pickup has exact map radii and ownership", async () => {
  const f = setup(); const ids = [...f.bearer.items.keys()];
  const feature = [...f.bearer.items.values()].find(i => /battle-standard/.test(i.flags.ak5e.chapterThreeId ?? ""));
  feature.system.activities = { custom: { name: "Custom" } };
  await wield(f); await command(f, "setup"); assert.equal(f.bearer.items.size, ids.length + 1);
  assert.equal(feature.system.activities.custom.name, "Custom"); assert.ok(ids.every(id => f.bearer.items.has(id)));
  assert.equal([...f.scene.templates.values()][0].distance, 10);
  await command(f, "plant"); assert.equal([...f.scene.templates.values()][0].distance, 25);
  const prop = [...f.scene.tokens.values()].find(t => t.flags.ak5e?.standardProp); assert.ok(prop); assert.equal(prop.bar1.attribute, null);
  await assert.rejects(command(f, "pickup", { targetTokenUuids: [f.picker.uuid] }, "badPicker", stranger), /own/);
  await command(f, "pickup", { targetTokenUuids: [f.picker.uuid] }, "pickup", pickerOwner);
  assert.equal(standardState(f.bearer).holderUuid, f.other.uuid); assert.equal(f.scene.templates.size, 0);
  await assert.rejects(command(f, "wield"), /return/);
  await command(f, "handoff", { targetTokenUuids: [f.source.uuid] }, "return", pickerOwner);
  await command(f, "wield"); assert.equal(standardState(f.bearer).mode, "wielded");
});
test("boundaries and repeated planted triggers reset at bearer's next Turn", async () => {
  const f = setup(); await wield(f); await command(f, "plant");
  await command(f, "tip", { trigger: "planted" });
  await assert.rejects(command(f, "tip", { trigger: "planted" }), /already received/);
  f.combat.round = 2; await command(f, "tip", { trigger: "planted" });
  f.target.x = 700; await assert.rejects(command(f, "tip", { trigger: "planted" }), /outside/);
  f.target.x = 1301; await assert.rejects(command(f, "tip"), /60 feet/);
});
test("all six Tip outcomes, cumulative effects, directed off-turn choices, and retry", async () => {
  const f = setup(); await wield(f); f.combat.turn = 1; f.combat.combatant = f.combat.turns[1];
  await command(f, "directed"); assert.equal(standardState(f.bearer).directed.actorUuid, f.ally.uuid);
  for (let outcome = 1; outcome <= 6; outcome++) await command(f, "tip", { tipChoice: outcome }, `tip${outcome}`);
  assert.equal(f.ally.system.attributes.hp.temp, 4); assert.equal(f.ally.effects.size, 5);
  await command(f, "tip", { tipChoice: 2 }, "tip2"); assert.equal(f.ally.system.attributes.hp.temp, 4);
  await command(f, "tip", { tipChoice: 2 }, "tipAgain"); assert.equal(f.ally.system.attributes.hp.temp, 8);
  await command(f, "tip", { tipChoice: 4 }, "tipAttackAgain");
  assert.equal([...f.ally.effects.values()].filter(e => e.flags.ak5e.standardBenefit?.kind === "tip4").length, 2);
});
test("Fervour is uncapped and four separate triggers have cycle limits", async () => {
  const f = setup(); await wield(f); f.bearer.flags.ak5e.standardBearer.fervour = 100;
  for (const trigger of ["alliedCritical", "alliedKill", "hostileDefeated", "alliedSkill"]) await command(f, "fervour", { trigger });
  assert.equal(standardState(f.bearer).fervour, 104);
  await assert.rejects(command(f, "fervour", { trigger: "alliedCritical" }), /already used/);
  f.combat.round++; await command(f, "fervour", { trigger: "alliedCritical" });
  assert.equal(standardState(f.bearer).fervour, 105); await command(f, "clearFervour"); assert.equal(standardState(f.bearer).fervour, 0);
});
test("Battlecries spend exact costs; Chorus never reapplies after consumption", async () => {
  const f = setup(); await wield(f); f.bearer.flags.ak5e.standardBearer.fervour = 30;
  await command(f, "cry", { cry: "heroic" }, "heroicCry"); assert.equal(standardState(f.bearer).fervour, 25);
  await command(f, "chorus", { cryId: "heroicCry" }, "chorusA"); assert.equal(f.ally.system.attributes.hp.temp, 4);
  await command(f, "chorus", { cryId: "heroicCry" }, "chorusB"); assert.equal(f.ally.system.attributes.hp.temp, 4);
  await command(f, "cry", { cry: "defiant" }, "defiantCry");
  await command(f, "chorus", { cryId: "defiantCry" }, "defiantChorus");
  const effect = [...f.ally.effects.values()].find(e => e.flags.ak5e.standardBenefit?.kind === "resistance");
  await command(f, "useBenefit", { benefitId: effect.id });
  await command(f, "chorus", { cryId: "defiantCry" }, "defiantChorusReplay");
  assert.equal([...f.ally.effects.values()].filter(e => e.flags.ak5e.standardBenefit?.kind === "resistance").length, 0);
});
test("Power Projection native THP, speed/save differences, dual aura, and Last Stand lock", async () => {
  const f = setup(); await wield(f); f.ally.system.attributes.hp.temp = 20;
  await command(f, "projection", { point: { x: 150, y: 150 }, outcomes: { [f.target.uuid]: "friendly" } });
  assert.equal(f.ally.system.attributes.hp.temp, 20); assert.deepEqual([...f.scene.templates.values()].map(t => t.distance).sort((a,b)=>a-b), [10,25]);
  await command(f, "lastStand"); assert.equal(standardState(f.bearer).lastStandUsed, true);
  await assert.rejects(command(f, "pickup", { targetTokenUuids: [f.source.uuid] }), /movable/);
  await assert.rejects(command(f, "projection", { point: { x: 150, y: 150 }, outcomes: {} }), /cannot move/);
  await command(f, "endStand"); assert.equal(standardState(f.bearer).lastStand, null);
});
test("herald allows sight OR hearing; expertise and Duty are idempotent and target-specific", async () => {
  const f = setup(); await wield(f);
  await command(f, "herald", { facts: { action: true, visible: true } });
  await command(f, "expertise"); await command(f, "expertise"); assert.equal(f.bearer.system.skills.per.value, 2); assert.equal(f.bearer.system.skills.itm.value, 1);
  await command(f, "duty"); assert.equal(f.ally.system.attributes.hp.value, 1);
  await assert.rejects(command(f, "duty"), /already been used/);
});
test("level gates, actual author and ownership, hidden visibility and missing GM reject", async () => {
  const f = setup(1); await wield(f);
  await assert.rejects(command(f, "projection"), /Level 10/);
  await assert.rejects(command(f, "tip", {}, "unauthorized", stranger), /own/);
  f.target.hidden = true; await assert.rejects(command(f, "tip", {}, "hidden", owner), /not available/);
  const message = { author: gm, flags: { ak5e: { standardRequest: { id: "forged", actorUuid: f.bearer.uuid, command: "setup", data: confirmed } } }, async update(c) { this.response = c["flags.ak5e.standardResponse"]; } };
  await handleStandardRequest(message, {}, stranger.id); assert.equal(message.response.ok, false);
  game.users.activeGM = null; await assert.rejects(submitStandardCommand(f.bearer, "setup", confirmed), /active GM/);
});
test("interrupted HP writes retain rolls; retry with same ID applies once", async () => {
  const f = setup(); await wield(f); await command(f, "directed"); forcedRolls = [5];
  f.ally.blockUpdate = true; await assert.rejects(command(f, "tip", { tipChoice: 2 }, "retryTip"), /blocked/);
  f.ally.blockUpdate = false; await command(f, "tip", { tipChoice: 2 }, "retryTip"); assert.equal(f.ally.system.attributes.hp.temp, 5);
  await command(f, "tip", { tipChoice: 2 }, "retryTip"); assert.equal(f.ally.system.attributes.hp.temp, 5);
  await assert.rejects(command(f, "tip", { tipChoice: 3 }, "retryTip"), /different choices/);
});
test("scoped critical-range helper uses native roll configuration only for affected recipients", async () => {
  const f = setup(); await wield(f); await command(f, "directed"); await command(f, "tip", { tipChoice: 5 });
  registerStandardBearerHooks();
  const config = { subject: { actor: f.ally }, rolls: [{ options: { criticalSuccess: 19 } }] };
  for (const hook of hooks.get("dnd5e.preRollAttackV2")) hook(config);
  assert.equal(config.rolls[0].options.criticalSuccess, 18);
  const ordinary = { subject: { actor: f.other }, rolls: [{ options: { criticalSuccess: 20 } }] };
  for (const hook of hooks.get("dnd5e.preRollAttackV2")) hook(ordinary); assert.equal(ordinary.rolls[0].options.criticalSuccess, 20);
});

test("Power Projection applies hostile save outcomes and expires its speed penalty at the recipient's next turn", async () => {
  for (const [outcome, expectedDamage, slowed] of [["success", 12, false], ["failure", 24, true]]) {
    const f = setup(); await wield(f); forcedRolls = [24];
    f.ally.system.attributes.hp.value = 100; f.ally.system.attributes.hp.max = 100;
    const OriginalRoll = globalThis.Roll, formulas = [];
    globalThis.Roll = class extends OriginalRoll { constructor(formula, ...args) { formulas.push(formula); super(formula, ...args); } };
    try { await command(f, "projection", { point: { x: 150, y: 150 }, targetTokenUuids: [f.target.uuid], outcomes: { [f.target.uuid]: outcome } }, `projection-${outcome}`); }
    finally { globalThis.Roll = OriginalRoll; }
    assert.ok(formulas.includes("6d6"), "the hostile impact uses the source 6d6 formula");
    assert.equal(f.ally.system.attributes.hp.value, 100 - expectedDamage, `${outcome} save damage is ${expectedDamage}`);
    const speed = [...f.ally.effects.values()].find(e => e.flags.ak5e.standardBenefit?.kind === "projection");
    assert.equal(Boolean(speed), slowed);
    if (speed) {
      assert.match(speed.name, /Speed reduced by 15/);
      const expiry = speed.flags.ak5e.temporaryTag.expiry;
      f.combat.previous = { round: 1, turn: 1 }; f.combat.round = 2; f.combat.turn = 0;
      assert.equal(tagHasExpired({ expiry }, { kind: "combatTurn", combat: f.combat }), true,
        "the speed penalty expires after the recipient's next turn");
      await expireFeatureTags({ kind: "combatTurn", combat: f.combat });
      assert.equal(f.ally.effects.has(speed.id), false, "the expiry lifecycle removes the speed effect");
    }
  }
});

test("Cry Havoc uses its Wisdom outcome, expands for Chorus, and only frightens on a failed save", async () => {
  const f = setup(); await wield(f); f.bearer.flags.ak5e.standardBearer.fervour = 10;
  const far = actor("far hostile", 0); const farToken = token(far, f.scene, 800);
  await assert.rejects(command(f, "cry", { cry: "havoc", direction: 0, targetTokenUuids: [farToken.uuid], outcomes: { [farToken.uuid]: "failure" } }, "havoc-too-short"), /outside/);
  forcedRolls = [10]; const OriginalRoll = globalThis.Roll, formulas = [];
  globalThis.Roll = class extends OriginalRoll { constructor(formula, ...args) { formulas.push(formula); super(formula, ...args); } };
  try { await command(f, "cry", { cry: "havoc", direction: 0, targetTokenUuids: [farToken.uuid], chorusTokenUuids: [f.target.uuid], outcomes: { [farToken.uuid]: "failure" } }, "havoc-expanded"); }
  finally { globalThis.Roll = OriginalRoll; }
  assert.ok(formulas.includes("3d4"), "one Chorus reaction adds 1d4 to the source 2d4");
  assert.equal(far.system.attributes.hp.value, 10);
  assert.ok([...far.effects.values()].some(e => e.flags.ak5e.standardBenefit?.kind === "havoc" && e.flags.ak5e.standardBenefit.dc === 17));
  await command(f, "frightenedSave", { targetTokenUuids: [farToken.uuid], benefitId: [...far.effects.keys()][0], outcomes: { [farToken.uuid]: "success" } }, "havoc-repeat-save");
  assert.equal(far.effects.size, 0);

  const success = setup(); await wield(success); success.bearer.flags.ak5e.standardBearer.fervour = 5; forcedRolls = [10];
  const RollForSuccess = globalThis.Roll, successFormulas = [];
  globalThis.Roll = class extends RollForSuccess { constructor(formula, ...args) { successFormulas.push(formula); super(formula, ...args); } };
  try { await command(success, "cry", { cry: "havoc", direction: 0, outcomes: { [success.target.uuid]: "success" } }, "havoc-success"); }
  finally { globalThis.Roll = RollForSuccess; }
  assert.ok(successFormulas.includes("2d4"), "without Chorus, Cry Havoc rolls the source 2d4");
  assert.equal(success.ally.system.attributes.hp.value, 15);
  assert.equal(success.ally.effects.size, 0, "a successful Wisdom save must not apply Frightened");
});

test("Belligerant Chorus records the reaction benefit and its next-turn Bonus Action restriction", async () => {
  const f = setup(); await wield(f); f.bearer.flags.ak5e.standardBearer.fervour = 3;
  await command(f, "cry", { cry: "belligerant", targetTokenUuids: [f.target.uuid], chorusTokenUuids: [f.target.uuid] }, "belligerant");
  const effect = [...f.ally.effects.values()].find(e => e.flags.ak5e.standardBenefit?.kind === "belligerantChorus");
  assert.ok(effect, "Chorus reaction should be represented on the recipient");
  assert.match(effect.system?.description?.value ?? effect.flags.ak5e.temporaryTag?.instructions ?? "", /cannot be taken using this benefit as a Bonus Action next Turn/i);
  await command(f, "useBenefit", { benefitId: effect.id }, "belligerant-used");
  assert.equal(f.ally.effects.has(effect.id), false);
});

test("Rallying Cry spends the chosen recipient's Hit Dice and adds the bearer's Charisma, while Chorus cannot heal Constructs", async () => {
  const f = setup(); await wield(f); f.bearer.flags.ak5e.standardBearer.fervour = 3;
  f.ally.system.abilities = { con: { mod: 8 } }; f.ally.system.attributes.hp.value = 1;
  const cls = document({ name: "Recipient Class", type: "class", system: { levels: 2, hd: { denomination: "d8", spent: 0, value: 2 } }, flags: { ak5e: {} } }, f.ally, "Item", f.ally.items);
  const OriginalRoll = globalThis.Roll, formulas = [];
  globalThis.Roll = class extends OriginalRoll { constructor(formula, ...args) { formulas.push(formula); super(formula, ...args); } };
  forcedRolls = [7, 8];
  try { await command(f, "cry", { cry: "rallying", targetTokenUuids: [f.target.uuid], chorusTokenUuids: [f.target.uuid], hitDice: { [f.ally.uuid]: "d8" } }, "rally"); }
  finally { globalThis.Roll = OriginalRoll; }
  assert.equal(f.ally.system.attributes.hp.value, 16, "1 + (4 + bearer CHA 3) + (5 + bearer CHA 3), capped at max HP");
  assert.deepEqual(formulas, ["1d8 + 3", "1d8 + 3"], "both rolls add the bearer's CHA, not the recipient's CON");
  assert.equal(cls.system.hd.spent, 2, "both ordinary and Chorus healing spend a recipient Hit Die");

  const construct = setup(); await wield(construct); construct.bearer.flags.ak5e.standardBearer.fervour = 3;
  construct.ally.system.details ??= {}; construct.ally.system.details.type = { value: "Construct" };
  const constructClass = document({ name: "Construct Class", type: "class", system: { levels: 1, hd: { denomination: "d8", spent: 0, value: 1 } }, flags: { ak5e: {} } }, construct.ally, "Item", construct.ally.items);
  await assert.rejects(command(construct, "cry", { cry: "rallying", targetTokenUuids: [construct.target.uuid], chorusTokenUuids: [construct.target.uuid], hitDice: { [construct.ally.uuid]: "d8" } }, "rally-construct"), /Constructs cannot regain HP/);
  assert.equal(construct.ally.system.attributes.hp.value, 20);
  assert.equal(constructClass.system.hd.spent, 0);
});

test("Strident Boast rejects an unintegrated recipient and Chorus requires the recipient's own first gain", async () => {
  const f = setup(); await wield(f); f.bearer.flags.ak5e.standardBearer.fervour = 10;
  await assert.rejects(command(f, "cry", { cry: "strident", targetTokenUuids: [f.target.uuid] }, "strident-unintegrated"), /Enable reviewed Operator SP integration/);
  assert.equal(standardState(f.bearer).fervour, 10, "failed recipient preflight must not spend Fervour");
  const learned = classes.find(entry => entry.operatorSkill);
  document({ name: learned.name, type: "feat", flags: { ak5e: { operatorSkill: { ...learned.operatorSkill, sourceId: learned.id, cost: 50 } } }, system: {} }, f.ally, "Item", f.ally.items);
  f.ally.flags.ak5e.operatorSkills = { enabled: true, points: 0, operations: [], pendingEvents: [], resolutions: [] };
  await command(f, "cry", { cry: "strident", targetTokenUuids: [f.target.uuid] }, "strident-first");
  assert.equal(f.ally.flags.ak5e.operatorSkills.points, 17);
  await command(f, "chorus", { cryId: "strident-first", targetTokenUuids: [f.target.uuid] }, "strident-chorus");
  assert.equal(f.ally.flags.ak5e.operatorSkills.points, 34);
  await command(f, "chorus", { cryId: "strident-first", targetTokenUuids: [f.target.uuid] }, "strident-chorus-replay");
  assert.equal(f.ally.flags.ak5e.operatorSkills.points, 34, "a Chorus receipt cannot grant SP twice");
});

test("separate bearer operations serialize additive Temporary HP on one recipient", async () => {
  const f = setup(); await wield(f); const second = actor("second bearer"); const secondToken = token(second, f.scene, 100); await command(f, "setup");
  await executeStandardCommand(second, { id: "setup-second", command: "setup", data: { confirmation: true } }, gm);
  await executeStandardCommand(second, { id: "wield-second", command: "wield", data: { ...confirmed, sourceTokenUuid: secondToken.uuid } }, gm);
  f.combat.turns.push({ id: "second", actor: second });
  const invalid = actor("invalid bearer"); const invalidToken = token(invalid, f.scene, 100);
  await executeStandardCommand(invalid, { id: "setup-invalid", command: "setup", data: { confirmation: true } }, gm);
  await executeStandardCommand(invalid, { id: "wield-invalid", command: "wield", data: { ...confirmed, sourceTokenUuid: invalidToken.uuid } }, gm);
  const invalidRequest = executeStandardCommand(invalid, { id: "invalid-preflight", command: "tip", data: { ...confirmed,
    sourceTokenUuid: invalidToken.uuid, targetTokenUuids: [f.target.uuid], tipChoice: 2 } }, gm);
  const validRequest = executeStandardCommand(second, { id: "valid-during-invalid", command: "tip", data: { ...confirmed,
    sourceTokenUuid: secondToken.uuid, targetTokenUuids: [f.target.uuid], tipChoice: 2 } }, gm);
  const [invalidResult, validResult] = await Promise.allSettled([invalidRequest, validRequest]);
  assert.equal(invalidResult.status, "rejected", "the actor outside active combat fails preflight");
  assert.equal(validResult.status, "fulfilled", "a valid operation for another bearer can complete concurrently");
  f.ally.system.attributes.hp.temp = 0;
  f.bearer.flags.ak5e.standardBearer.directed = { trigger: "time", at: 999999, expiryActor: "active" };
  second.flags.ak5e.standardBearer.directed = structuredClone(f.bearer.flags.ak5e.standardBearer.directed);
  f.target.x = 100;
  const req = (a, source, id) => executeStandardCommand(a, { id, command: "tip", data: { ...confirmed, sourceTokenUuid: source.uuid,
    targetTokenUuids: [f.target.uuid], tipChoice: 2 } }, gm);
  forcedRolls = [3, 4];
  await Promise.all([req(f.bearer, f.source, "concurrent-a"), req(second, secondToken, "concurrent-b")]);
  assert.equal(f.ally.system.attributes.hp.temp, 7, "both confirmed additive gains must survive the interleaving");
});

test("canceled native damage calculation, client fog visibility, and delayed Chorus are rejected", async () => {
  const f = setup(); await wield(f); f.bearer.flags.ak5e.standardBearer.fervour = 5;
  f.ally.calculateDamage = () => false;
  await assert.rejects(command(f, "cry", { cry: "havoc", direction: 0, outcomes: { [f.target.uuid]: "failure" } }, "cancel-damage"), /Native damage calculation was canceled/);
  assert.equal(f.ally.system.attributes.hp.value, 20);

  f.target.object.visible = false;
  game.user = owner;
  const view = await getStandardView(f.bearer, owner);
  assert.equal(view.targets.some(t => t.uuid === f.target.uuid), false, "player target lists must respect client fog visibility");
  f.target.object.visible = true; game.user = gm;

  const late = setup(); await wield(late); late.bearer.flags.ak5e.standardBearer.fervour = 10;
  await command(late, "cry", { cry: "heroic", targetTokenUuids: [late.target.uuid] }, "delayed-chorus");
  late.combat.round = 2; late.combat.turn = 1;
  await assert.rejects(command(late, "chorus", { cryId: "delayed-chorus" }, "chorus-late"), /response window has passed/);
});

test("extensible Battlecries stop at five Rounds and last through exactly one rest cycle", async () => {
  const f = setup(); await wield(f); f.bearer.flags.ak5e.standardBearer.fervour = 20;
  await command(f, "cry", { cry: "defiant", targetTokenUuids: [f.target.uuid] }, "defiant-extensions");
  const cryId = "defiant-extensions";
  const firstExpiryRound = standardState(f.bearer).cries[cryId].expiry.round;
  await command(f, "plant", {}, "plant-before-extend");
  for (let round = 1; round <= 4; round++) {
    f.combat.round++;
    await command(f, "extend", { cryId }, `defiant-extension-${round}`);
  }
  assert.equal(standardState(f.bearer).cries[cryId].extensions, 4);
  assert.equal(standardState(f.bearer).cries[cryId].expiry.round, firstExpiryRound + 4, "each of four extensions adds one Round");
  await assert.rejects(command(f, "extend", { cryId }, "defiant-extension-5"), /cannot be extended past five/);

  await command(f, "projection", { point: { x: 150, y: 150 }, targetTokenUuids: [], outcomes: {} }, "projection-rest");
  await command(f, "lastStand", {}, "laststand-rest");
  f.ally.system.attributes.hp.value = 10;
  await command(f, "duty", {}, "duty-before-rest");
  assert.equal(standardState(f.bearer).duty[standardKey(f.ally.uuid)], true);
  registerStandardBearerHooks();
  for (const hook of hooks.get("dnd5e.restCompleted") ?? []) hook(f.bearer, {}, { type: "short" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(standardState(f.bearer).projectionUsed, false);
  assert.equal(standardState(f.bearer).lastStandUsed, true);
  assert.equal(standardState(f.bearer).duty[standardKey(f.ally.uuid)], true, "Short Rest does not recover Duty Not Yet Done");
  for (const hook of hooks.get("dnd5e.restCompleted") ?? []) hook(f.bearer, {}, { type: "long" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(standardState(f.bearer).lastStandUsed, false);
  assert.deepEqual(standardState(f.bearer).duty, {}, "Long Rest recovers Duty Not Yet Done for each recipient");
  assert.equal(standardState(f.bearer).fervour, 10, "resting does not clear Fervour; hostile combat ending does");
});

test("synthetic bearer state stays independent and committed operation receipts survive replay", async () => {
  const f = setup(); const synthetic = actor("synthetic", 17, owner.id, true); const syntheticToken = token(synthetic, f.scene, 100);
  await executeStandardCommand(synthetic, { id: "synthetic-setup", command: "setup", data: { confirmation: true, sourceTokenUuid: syntheticToken.uuid } }, gm);
  await executeStandardCommand(synthetic, { id: "synthetic-wield", command: "wield", data: { ...confirmed, sourceTokenUuid: syntheticToken.uuid } }, gm);
  await executeStandardCommand(synthetic, { id: "synthetic-plant", command: "plant", data: { ...confirmed, sourceTokenUuid: syntheticToken.uuid } }, gm);
  assert.equal(standardState(f.bearer).mode, "carried");
  assert.equal(standardState(synthetic).mode, "planted");

  await wield(f); await command(f, "tip", { tipChoice: 2 }, "persisted-tip");
  const temp = f.ally.system.attributes.hp.temp;
  const reloaded = { ...f.bearer, flags: structuredClone(f.bearer.flags) };
  const replay = await executeStandardCommand(reloaded, { id: "persisted-tip", command: "tip", data: { ...confirmed,
    sourceTokenUuid: f.source.uuid, targetTokenUuids: [f.target.uuid], tipChoice: 2 } }, gm);
  assert.equal(replay.replayed, true);
  assert.equal(f.ally.system.attributes.hp.temp, temp, "persisted receipt replay must not reapply the HP change");
});

test("Last Stand defers automatic SP with a source receipt; replay creates one pending gain and acceptance uses only its recorded amount", async () => {
  const f = setup(); addOperatorPool(f.bearer); await activateLastStand(f);
  const event = { type: "automatic", id: "auto-event-1", ownTurn: true };
  const result = await processOperatorEvent(f.bearer, event);
  assert.equal(result.reason, "standardPending");
  assert.equal(f.bearer.flags.ak5e.operatorSkills.points, 0, "the deferred automatic charge must not change SP yet");
  assert.deepEqual(f.bearer.flags.ak5e.operatorSkills.standardPendingGains[event.id], {
    amount: 2, source: "automatic", reason: "Last Stand pending choice"
  });
  assert.equal(f.bearer.flags.ak5e.operatorSkills.receipts.at(-1).gained, 0);
  const replay = await processOperatorEvent(f.bearer, event);
  assert.equal(replay.reason, "duplicate");
  assert.equal(Object.keys(f.bearer.flags.ak5e.operatorSkills.standardPendingGains).length, 1, "event replay cannot create another pending grant");

  await command(f, "acceptGain", { eventId: event.id, amount: 999 }, "accept-recorded-gain");
  assert.equal(f.bearer.flags.ak5e.operatorSkills.points, 2, "acceptance ignores caller-supplied amounts");
  assert.equal(f.bearer.flags.ak5e.operatorSkills.standardPendingGains[event.id], undefined);
  await assert.rejects(command(f, "acceptGain", { eventId: event.id }, "accept-replay"), /recorded pending Last Stand SP gain/);
  assert.equal(f.bearer.flags.ak5e.operatorSkills.points, 2, "accepting an event twice cannot award SP twice");
});

test("Last Stand rejects accepting a pending gain while an Operator Skill is active and preserves the event for retry", async () => {
  const f = setup(); addOperatorPool(f.bearer); await activateLastStand(f);
  const event = { type: "automatic", id: "auto-event-active", ownTurn: true };
  await processOperatorEvent(f.bearer, event);
  f.bearer.flags.ak5e.operatorSkills.active = { activationId: "active-skill" };
  const data = { ...confirmed, sourceTokenUuid: f.source.uuid, targetTokenUuids: [f.target.uuid], eventId: event.id };
  await assert.rejects(executeStandardCommand(f.bearer, { id: "accept-while-active", command: "acceptGain", data }, gm), /ActiveNoGain/);
  assert.equal(f.bearer.flags.ak5e.operatorSkills.points, 0);
  assert.equal(f.bearer.flags.ak5e.operatorSkills.standardPendingGains[event.id].amount, 2, "rejection preserves the pending gain");
  f.bearer.flags.ak5e.operatorSkills.active = null;
  await executeStandardCommand(f.bearer, { id: "accept-while-active", command: "acceptGain", data }, gm);
  assert.equal(f.bearer.flags.ak5e.operatorSkills.points, 2, "the same confirmed operation can be retried after the Skill ends");
  assert.equal(f.bearer.flags.ak5e.operatorSkills.standardPendingGains[event.id], undefined);
});

test("Last Stand redirects the recorded pending amount to an eligible ally and consumes that event once", async () => {
  const f = setup(); addOperatorPool(f.bearer); addOperatorPool(f.ally); await activateLastStand(f);
  const event = { type: "automatic", id: "auto-event-redirect", ownTurn: true };
  await processOperatorEvent(f.bearer, event);
  await command(f, "redirect", { eventId: event.id, amount: 999 }, "redirect-recorded-gain");
  assert.equal(f.bearer.flags.ak5e.operatorSkills.points, 0, "redirect does not first apply the pending gain to the bearer");
  assert.equal(f.ally.flags.ak5e.operatorSkills.points, 2, "the recipient receives the source-recorded amount");
  assert.equal(f.bearer.flags.ak5e.operatorSkills.standardPendingGains[event.id], undefined, "redirect consumes the pending event");
  await assert.rejects(command(f, "redirect", { eventId: event.id, targetTokenUuids: [f.target.uuid] }, "redirect-replay"), /recorded pending SP event/);
  assert.equal(f.ally.flags.ak5e.operatorSkills.points, 2, "a consumed pending event cannot be redirected twice");
});

test("planted 25-foot aura uses 3D distance at the boundary", async () => {
  const f = setup(); await wield(f); await command(f, "plant");
  f.target.x = 600; f.target.elevation = 0;
  let view = await getStandardView(f.bearer, gm);
  assert.equal(view.targets.find(target => target.uuid === f.target.uuid).eligible, true, "a creature exactly 25 feet from the planted standard is in the aura");
  f.target.elevation = 1;
  view = await getStandardView(f.bearer, gm);
  assert.equal(view.targets.find(target => target.uuid === f.target.uuid).eligible, false, "a 1-foot elevation difference places the creature outside the 25-foot sphere");
});
