import test from "node:test";
import assert from "node:assert/strict";
// Namespace imports and dynamic Charger loading: a missing or renamed export fails only the test that needs it,
// so each behaviour reports its own red reason instead of a module-loader failure.
import * as extensions from "../scripts/vanguard-extensions.mjs";
import * as uses from "../scripts/vanguard-uses.mjs";
import * as trigger from "../scripts/trigger-events.mjs";
import * as pools from "../scripts/resource-pools.mjs";
import * as undoGate from "../scripts/play-undo.mjs";
import * as rules from "../scripts/vanguard-rules.mjs";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem, createTestCombat,
  triggerShortRest, triggerLongRest } from "./base-classes-fixture.mjs";

// Challenger suite for the Vanguard Charger, written from the source (Ch.3 Charger text, WORKFLOW §3.2, the
// shared Tip grant registry and the play-uses engine). It asserts behaviour: flags, receipts, pools, warnings,
// native roll configs and owner-control availability. It never asserts source text or the current code's shape.
//
// Behaviour map (spec items 1-8):
//  1 attack bridge (Couch first-melee bonus, Unbalancing Charge Advantage, warn-not-block)
//  2 Momentous Strike dice on the native damage config (N x level die, once, spends all, zero Momentum, no auto-roll)
//  3 Deathblow ignoreResistance (level 10, 5+ Momentum)
//  4 Geirskogul (Strike link, DC = Martial DC + Momentum, Long Rest use, cascade undo, owner saves)
//  5 Mark -> Tip through the registry (one grant, single claim, invented source rejected, Mark expiry)
//  6 undo isolation and Renewing Momentum keying
//  7 Momentum bounds and level gates
//  8 robustness (missing combat/target, garbage data, double submission)

const vanguardUses = uses.vanguardUses;
const BRANCH = "subclass-vanguard-charger";
const MOMENTUM = "momentum";

async function chargerModules() {
  try {
    const [features, sheet] = await Promise.all([
      import("../scripts/charger-features.mjs"),
      import("../scripts/charger-sheet.mjs")
    ]);
    return { features, sheet };
  } catch (loadError) { return { loadError }; }
}

async function registered() {
  const loaded = await chargerModules();
  assert.ok(!loaded.loadError, `Charger modules must load (charger-features.mjs, charger-sheet.mjs): ${loaded.loadError?.message}`);
  const { features, sheet } = loaded;
  assert.equal(typeof features.registerChargerFeatureHooks, "function", "charger-features exports registerChargerFeatureHooks");
  features.registerChargerFeatureHooks();
  // Native roll hooks may sit behind a second registrar; call every exported register*Hooks function (idempotent).
  for (const [name, fn] of Object.entries(features)) if (/^register.*Hooks$/.test(name) && typeof fn === "function") fn();
  if (typeof sheet.registerChargerVanguardExtension === "function") sheet.registerChargerVanguardExtension();
  return features;
}

function charger(level = 1, { player = true, martialAbility = "str" } = {}) {
  const classItem = createTestItem({ name: "Vanguard", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: "class-vanguard" } } });
  const branchData = CHAPTER_THREE_CLASSES.find(entry => entry.id === BRANCH);
  assert.ok(branchData, "the source catalogue contains the Charger branch");
  const branch = createTestItem({ name: branchData.name, type: "subclass", system: branchData.systemData,
    flags: { ak5e: { chapterThreeId: BRANCH } } });
  const actor = createTestActor({ name: "Charger", items: [classItem, branch],
    system: { attributes: { prof: Math.floor((level - 1) / 4) + 2, hp: { value: 30, max: 30, temp: 0 }, movement: { walk: 30 } },
      abilities: { str: { value: 16, mod: 3 }, dex: { value: 14, mod: 2 }, con: { value: 14, mod: 2 } } },
    flags: { ak5e: { vanguard: { enabled: true, martialDCAbility: martialAbility } } } });
  actor.isOwner = true;
  game.user = { id: player ? "charger-player" : "gm", isGM: !player, targets: new Set() };
  game.users = { activeGM: { id: "gm" } };
  return actor;
}

function creature(name, hp = 20) {
  return createTestActor({ name, system: { attributes: { hp: { value: hp, max: hp, temp: 0 } } } });
}

function combatWith(...actors) {
  const combat = createTestCombat(actors, { started: true, round: 1, turn: 0 });
  game.combat = combat;
  return combat;
}

const momentum = actor => pools.getPool(actor, MOMENTUM).value;
const setMomentum = (actor, value) => pools.setPool(actor, MOMENTUM, value);
const receipt = (actor, id) => vanguardUses.receipt(actor, id);
const undoReceipt = (actor, useId, operationId) => vanguardUses.command(actor, "undoUse", { useId }, operationId);

// Confirmed command; warnings are overridden only in setup helpers, never in the assertions that check warnings.
async function run(actor, command, data = {}, operationId) {
  try { return await vanguardUses.command(actor, command, { confirmed: true, ...data }, operationId); }
  catch (error) {
    if (!undoGate.isPlayWarnings(error)) throw error;
    return vanguardUses.command(actor, command, { confirmed: true, ...data, overrides: error.warnings.map(w => w.id) }, operationId);
  }
}
const warningsOf = (actor, command, data = {}) => vanguardUses.preview(actor, command, { confirmed: true, ...data }).warnings;

async function newReceipts(actor, action) {
  const seen = new Set(vanguardUses.state(actor).undo.map(entry => entry.id));
  await action();
  return vanguardUses.state(actor).undo.filter(entry => !seen.has(entry.id));
}

async function emitOk(kind, payload) {
  const result = await trigger.emitAk5eEvent(kind, payload);
  assert.equal(result.errors, 0, `${kind} ${payload.eventId ?? ""}: no AK5e event handler may throw`);
  return result;
}

const hitPayload = (actor, target, attackId, combat, round = 1, turn = 0) => ({ eventId: `hit:${attackId}:${target.uuid}`,
  attackId, actorUuid: actor.uuid, itemUuid: "Item.charger-weapon", activityUuid: `Activity.${attackId}`, targetUuid: target.uuid,
  targetUuids: [target.uuid], targets: [{ uuid: target.uuid, name: target.name, ac: 12, hit: true }], combatUuid: combat.uuid, round, turn });
const damagePayload = (actor, target, eventId, combat, { amount = 5, hpBefore = 20, round = 1, turn = 0 } = {}) => ({
  eventId, sourceActorUuid: actor.uuid, actorUuid: target.uuid, amount, hpBefore, hpAfter: hpBefore - amount,
  combatUuid: combat.uuid, round, turn });
const killPayload = (actor, target, eventId, combat, { hpBefore = 5, round = 1, turn = 0 } = {}) => ({ eventId,
  sourceActorUuid: actor.uuid, actorUuid: target.uuid, hpBefore, hpAfter: 0, combatUuid: combat?.uuid ?? null, round, turn });
const turnStartPayload = (actor, eventId, combat, round, turn = 0) => ({ eventId, actorUuid: actor.uuid,
  combatantId: `combatant-${eventId}`, skipped: false, combatUuid: combat.uuid, round, turn });

// Mark a creature through the Charger's own damage event, then reduce it to 0 HP with a kill event.
async function markedKill(actor, target, combat, tag, { round = 1, turn = 0 } = {}) {
  const damage = await newReceipts(actor, () => emitOk("hitTaken", damagePayload(actor, target, `dmg-${tag}`, combat, { round, turn })));
  const kill = await newReceipts(actor, () => emitOk("kill", killPayload(actor, target, `kill-${tag}`, combat, { round, turn })));
  return { killId: `kill-${tag}`, damage, kill };
}

// Qualifying hit for Unbalancing Charge: owner-confirmed 15 ft straight movement, then the attack, then the Mark.
async function markAfterCharge(actor, target, combat, tag) {
  const features = await registered();
  await features.recordChargerMovement(actor, { feet: 15, straight: true, hostile: true, targetUuid: target.uuid,
    confirmed: true, eventId: `move-${tag}` });
  await emitOk("hit", hitPayload(actor, target, `attack-${tag}`, combat));
  await emitOk("hitTaken", damagePayload(actor, target, `dmg-${tag}`, combat));
}

function tipKind() {
  const kinds = extensions.vanguardTipGrantSourceKinds().filter(kind => kind.startsWith("charger"));
  assert.ok(kinds.length > 0, "a charger-prefixed Tip grant kind is registered in the shared registry (registerVanguardTipGrantSource)");
  return kinds[0];
}
const tipGranted = (actor, id, index = 1, kind = tipKind()) => extensions.checkVanguardTipGrant(kind, actor, id, index).ok;
const tipData = (ally, kind, sourceEventId, grantIndex = 1) => ({ grantKind: kind, sourceEventId, grantIndex,
  targetUuid: ally.uuid, targetName: ally.name });

let activitySeq = 0;
function weaponActivity(actor, { actionType = "mwak", name = "Greatsword" } = {}) {
  const item = createTestItem({ name, type: "weapon", system: { actionType, properties: new Set() } }, actor);
  actor.items.set(item.id, item);
  const id = `act-${++activitySeq}`;
  const activity = { id, uuid: `Activity.${id}`, type: "attack", actionType, actor, item, name: "Attack",
    rollAttack() {}, rollDamage() {} };
  globalThis._ak5eTestDocs?.set(activity.uuid, activity);
  return activity;
}
const strikeMarker = (actor, strikeId, activity, target) => ({ actorUuid: actor.uuid, useId: strikeId, stage: "damage",
  activityUuid: activity.uuid, targetUuid: target.uuid });

function attackConfig(activity, { parts = ["1d20", "4"], targetUuid = null } = {}) {
  return { subject: activity, rolls: [{ parts: [...parts], options: {} }], ...(targetUuid ? { ak5eTargetUuid: targetUuid } : {}) };
}
// The marker is placed both on the config flags and on the message flags (where rollDamage's options carry it).
function damageRoll(activity, { parts = ["1d8", "3"], marker = null } = {}) {
  const flags = marker ? { ak5e: { chargerNative: marker } } : {};
  return { config: { subject: activity, rolls: [{ parts: [...parts], options: {} }], flags: structuredClone(flags) },
    message: { data: { flags: structuredClone(flags) } } };
}
const fireAttack = async config => { await globalThis.Hooks.callAll("dnd5e.preRollAttackV2", config, {}, { data: {} }); return config; };
const fireDamage = async ({ config, message }) => { await globalThis.Hooks.callAll("dnd5e.preRollDamageV2", config, {}, message); return config; };

// Parts added by a hook: a multiset difference so duplicates are counted.
function addedParts(before, after) {
  const counts = new Map();
  for (const part of before) counts.set(part, (counts.get(part) ?? 0) + 1);
  const added = [];
  for (const part of after) {
    const left = counts.get(part) ?? 0;
    if (left > 0) counts.set(part, left - 1); else added.push(part);
  }
  return added;
}
const addedDice = added => added.filter(part => /^\s*\d+d\d+\s*$/.test(String(part))).map(part => String(part).trim());
const addedBonus = added => added.every(part => /^\s*\+?\d+\s*$/.test(String(part)))
  ? added.reduce((sum, part) => sum + Number(String(part).trim()), 0) : NaN;
const ignoresResistance = config => config.flags?.ak5e?.ignoreResistance === true
  || config.rolls?.[0]?.options?.flags?.ak5e?.ignoreResistance === true || config.rolls?.[0]?.options?.ignoreResistance === true;
const hasAdvantage = config => config.advantage === true || config.rolls?.[0]?.options?.advantage === true;

function countRolls() {
  const counts = { constructed: 0, evaluated: 0 };
  const Original = globalThis.Roll;
  globalThis.Roll = class CountingRoll extends Original {
    constructor(...args) { super(...args); counts.constructed += 1; }
    async evaluate(...args) { counts.evaluated += 1; return super.evaluate(...args); }
  };
  return { counts, restore: () => { globalThis.Roll = Original; } };
}

function captureErrors() {
  const original = console.error;
  const lines = [];
  console.error = (...args) => { lines.push(args.map(arg => String(arg?.message ?? arg)).join(" ")); };
  return { lines, restore: () => { console.error = original; } };
}

const noRuntimeFault = (error, label) => assert.ok(!(error instanceof TypeError), `${label} must not raise a runtime TypeError: ${error?.message}`);

function ownerControls(actor) {
  const level = rules.vanguardLevel(actor);
  return extensions.vanguardOwnerControls(extensions.vanguardExtensionContext(actor, { branchId: "charger", level,
    profile: { branchId: "charger", level }, purpose: "controls" }));
}

const link = (strikeId, foe) => ({ strikeId, strikeUseId: strikeId, targetUuid: foe.uuid, targetName: foe.name });
const restWarned = (actor, strikeId, foe) => warningsOf(actor, "chargerGeirskogul", link(strikeId, foe)).some(w => /rest/i.test(w.text));

test.beforeEach(() => setupFoundryGlobals());
test.afterEach(() => teardownFoundryGlobals());

/* ---------------------------------------------------------------- 1. Native attack bridge */

test("1a Couch adds its Momentum-at-use bonus to only the first melee attack of the next Turn, never twice to one roll", async () => {
  const actor = charger(1);
  await registered();
  const combat = combatWith(actor);
  const melee = weaponActivity(actor, { actionType: "mwak" });
  const ranged = weaponActivity(actor, { actionType: "rwak", name: "Shortbow" });
  await setMomentum(actor, 2);
  await run(actor, "chargerCouch", {}, "couch-1a");
  assert.equal(momentum(actor), 3, "Couch grants one Momentum");

  const early = attackConfig(melee), earlyBefore = [...early.rolls[0].parts];
  await fireAttack(early);
  assert.equal(addedBonus(addedParts(earlyBefore, early.rolls[0].parts)), 0, "no Couch bonus before the Charger's next Turn begins");

  await emitOk("turnStart", turnStartPayload(actor, "turn-1a", combat, 2));
  const rangedRoll = attackConfig(ranged), rangedBefore = [...rangedRoll.rolls[0].parts];
  await fireAttack(rangedRoll);
  assert.equal(addedBonus(addedParts(rangedBefore, rangedRoll.rolls[0].parts)), 0, "a ranged attack does not take the Couch bonus");

  const first = attackConfig(melee), firstBefore = [...first.rolls[0].parts];
  await fireAttack(first);
  const firstAdded = addedParts(firstBefore, first.rolls[0].parts);
  assert.equal(addedBonus(firstAdded), 2, `the first melee attack adds +2, the Momentum held when Couch was used (not 3); added ${JSON.stringify(firstAdded)}`);
  const firstAfter = [...first.rolls[0].parts];
  await fireAttack(first);
  assert.deepEqual(first.rolls[0].parts, firstAfter, "re-firing the hook on the same roll config never adds the bonus again");

  const second = attackConfig(melee), secondBefore = [...second.rolls[0].parts];
  await fireAttack(second);
  assert.equal(addedBonus(addedParts(secondBefore, second.rolls[0].parts)), 0, "a second melee attack in that Turn gets no Couch bonus");
});

test("1b Couch's bonus never reaches another creature's melee attack roll", async () => {
  const actor = charger(1);
  await registered();
  const combat = combatWith(actor);
  const bystander = creature("Bystander");
  const bystanderMelee = weaponActivity(bystander, { actionType: "mwak" });
  await setMomentum(actor, 2);
  await run(actor, "chargerCouch", {}, "couch-1b");
  await emitOk("turnStart", turnStartPayload(actor, "turn-1b", combat, 2));
  const config = attackConfig(bystanderMelee), before = [...config.rolls[0].parts];
  await fireAttack(config);
  assert.equal(addedBonus(addedParts(before, config.rolls[0].parts)), 0, "only the Charger's own first melee attack takes the bonus");
});

test("1c Unbalancing Charge: a Mark from a qualifying 15-foot straight hit gives every attack on the Marked creature Advantage", async () => {
  const actor = charger(4);
  await registered();
  const combat = combatWith(actor);
  const foe = creature("Marked foe"), ally = creature("Ally");
  await markAfterCharge(actor, foe, combat, "1c");
  for (const attacker of [ally, actor]) {
    const config = attackConfig(weaponActivity(attacker), { targetUuid: foe.uuid });
    await fireAttack(config);
    assert.equal(hasAdvantage(config), true, `${attacker.name} attacking the Marked creature has Advantage`);
  }
});

test("1d Unbalancing Charge grants Advantage only under its source conditions: qualifying movement, Charger level 4+, the Marked creature itself", async () => {
  const features = await registered();
  const ally = creature("Ally");
  const attackAgainst = async target => {
    const config = attackConfig(weaponActivity(ally), { targetUuid: target.uuid });
    await fireAttack(config);
    return hasAdvantage(config);
  };

  { // (a) a Mark from a hit with no recorded 15-foot straight movement
    const actor = charger(4), combat = combatWith(actor), foe = creature("No movement");
    await emitOk("hit", hitPayload(actor, foe, "attack-1d-a", combat));
    await emitOk("hitTaken", damagePayload(actor, foe, "dmg-1d-a", combat));
    assert.equal(await attackAgainst(foe), false, "a Mark without qualifying movement grants no Advantage");
  }
  { // (b) the same qualifying sequence at Charger level 3 (Onto the Next is a 4th-level Feature)
    const actor = charger(3), combat = combatWith(actor), foe = creature("Level three");
    await markAfterCharge(actor, foe, combat, "1d-b");
    assert.equal(await attackAgainst(foe), false, "Unbalancing Charge is not active below Charger level 4");
  }
  { // (c) a qualifying Mark does not extend Advantage to a different creature
    const actor = charger(4), combat = combatWith(actor), marked = creature("Marked"), other = creature("Other");
    await markAfterCharge(actor, marked, combat, "1d-c");
    assert.equal(await attackAgainst(other), false, "Advantage applies only against the Marked creature");
    assert.equal(await attackAgainst(marked), true, "the same qualifying Mark does grant Advantage against the Marked creature");
  }
  { // (d) 14 feet is below the threshold: recording it is refused or leaves no Advantage
    const actor = charger(4), combat = combatWith(actor), foe = creature("Short move");
    let refusal = null;
    try { await features.recordChargerMovement(actor, { feet: 14, straight: true, hostile: true, targetUuid: foe.uuid, confirmed: true, eventId: "move-1d-d" }); }
    catch (error) { refusal = error; noRuntimeFault(error, "a 14-foot movement record"); }
    await emitOk("hit", hitPayload(actor, foe, "attack-1d-d", combat));
    await emitOk("hitTaken", damagePayload(actor, foe, "dmg-1d-d", combat));
    assert.equal(await attackAgainst(foe), false, `14 feet grants no Advantage${refusal ? " (recording was refused)" : ""}`);
  }
});

test("1e unverifiable Geirskogul and Tip conditions warn and can be overridden; they are never a generic refusal", async () => {
  const actor = charger(17);
  await registered();
  const combat = combatWith(actor);
  const foe = creature("Target"), other = creature("Other"), ally = creature("Ally");
  await setMomentum(actor, 5);
  await run(actor, "chargerMomentousStrike", {}, "strike-1e");

  const geirData = link("strike-1e", foe);
  const geirWarnings = warningsOf(actor, "chargerGeirskogul", geirData);
  assert.ok(geirWarnings.length > 0, "unverifiable Geirskogul conditions surface as warnings");
  let bare = null;
  try { await vanguardUses.command(actor, "chargerGeirskogul", { confirmed: true, ...geirData }, "geir-1e-bare"); }
  catch (error) { bare = error; noRuntimeFault(error, "a warned Geirskogul"); }
  if (bare) assert.ok(undoGate.isPlayWarnings(bare), "an unverified Geirskogul condition raises a warning, not a generic refusal");
  const overridden = await vanguardUses.command(actor, "chargerGeirskogul",
    { confirmed: true, ...geirData, overrides: geirWarnings.map(w => w.id) }, "geir-1e-override");
  assert.ok(receipt(actor, "geir-1e-override"), "the owner can override the warning and the Geirskogul is recorded");

  // Tip of the Spear from a Mark: range, visibility and alliance cannot be verified without a board, so they warn.
  const kind = tipKind();
  await markedKill(actor, other, combat, "1e");
  const tip = tipData(ally, kind, "kill-1e");
  const tipWarnings = warningsOf(actor, "tipOfTheSpear", tip);
  assert.ok(tipWarnings.length > 0, "unverifiable Tip conditions surface as warnings");
  let tipBare = null;
  try { await vanguardUses.command(actor, "tipOfTheSpear", { confirmed: true, ...tip }, "tip-1e-bare"); }
  catch (error) { tipBare = error; noRuntimeFault(error, "a warned Tip"); }
  if (tipBare) assert.ok(undoGate.isPlayWarnings(tipBare), "an unverified Tip condition raises a warning, not a generic refusal");
  const tipOverridden = await vanguardUses.command(actor, "tipOfTheSpear",
    { confirmed: true, ...tip, overrides: tipWarnings.map(w => w.id) }, "tip-1e-override");
  assert.ok(receipt(actor, "tip-1e-override"), "the owner can override the Tip warnings and the grant is recorded");
});

/* ---------------------------------------------------------------- 2. Momentous Strike dice */

test("2a Momentous Strike expends every Momentum point and undo restores the exact amount", async () => {
  const actor = charger(14);
  await registered();
  combatWith(actor);
  await setMomentum(actor, 6);
  await run(actor, "chargerMomentousStrike", {}, "strike-2a");
  assert.equal(momentum(actor), 0, "the Strike spends all six points");
  assert.match(JSON.stringify(receipt(actor, "strike-2a")), /\b6\b/, "the receipt records six points spent");
  await undoReceipt(actor, "strike-2a", "undo-2a");
  assert.equal(momentum(actor), 6, "undo restores all six points");
});

test("2b the native damage roll gains exactly N dice of the level-correct die (d6 below 7, d8 at 7-13, d10 at 14+), once per roll", async t => {
  await registered();
  for (const [level, spend, die] of [[6, 4, 6], [7, 3, 8], [13, 6, 8], [14, 6, 10]]) {
    await t.test(`level ${level}: ${spend} Momentum adds ${spend}d${die} once`, async () => {
    const actor = charger(level);
    combatWith(actor);
    const foe = creature("Foe"), weapon = weaponActivity(actor, { actionType: "mwak" });
    await setMomentum(actor, spend);
    await run(actor, "chargerMomentousStrike", {}, `strike-2b-${level}`);
    const roll = damageRoll(weapon, { parts: ["1d8", "3"], marker: strikeMarker(actor, `strike-2b-${level}`, weapon, foe) });
    const before = [...roll.config.rolls[0].parts];
    await fireDamage(roll);
    assert.deepEqual(addedDice(addedParts(before, roll.config.rolls[0].parts)), [`${spend}d${die}`],
      `level ${level}: ${spend} Momentum adds ${spend}d${die} to the native damage roll and nothing else`);
    const once = [...roll.config.rolls[0].parts];
    await fireDamage(roll);
    assert.deepEqual(roll.config.rolls[0].parts, once, `level ${level}: re-firing never adds the Strike dice to the same roll again`);
    });
  }
});

test("2c Momentous Strike dice reach only their own marked damage roll, never an ordinary weapon damage roll", async () => {
  const actor = charger(14);
  await registered();
  combatWith(actor);
  const foe = creature("Foe"), weapon = weaponActivity(actor, { actionType: "mwak" });
  await setMomentum(actor, 6);
  await run(actor, "chargerMomentousStrike", {}, "strike-2c");
  const ordinary = damageRoll(weapon, { parts: ["1d8", "3"] });
  const ordinaryBefore = [...ordinary.config.rolls[0].parts];
  await fireDamage(ordinary);
  assert.deepEqual(addedDice(addedParts(ordinaryBefore, ordinary.config.rolls[0].parts)), [], "an unmarked damage roll gets no Strike dice");
  const marked = damageRoll(weapon, { parts: ["1d8", "3"], marker: strikeMarker(actor, "strike-2c", weapon, foe) });
  const markedBefore = [...marked.config.rolls[0].parts];
  await fireDamage(marked);
  assert.deepEqual(addedDice(addedParts(markedBefore, marked.config.rolls[0].parts)), ["6d10"], "the marked roll gets six d10");
});

test("2d a Momentous Strike with zero Momentum adds no dice and is warned, never refused outright", async () => {
  const actor = charger(7);
  await registered();
  combatWith(actor);
  const foe = creature("Foe"), weapon = weaponActivity(actor, { actionType: "mwak" });
  await setMomentum(actor, 0);
  let error = null;
  try { await vanguardUses.command(actor, "chargerMomentousStrike", { confirmed: true }, "strike-2d"); }
  catch (caught) { error = caught; noRuntimeFault(caught, "a zero-Momentum Strike"); }
  if (error) {
    assert.ok(undoGate.isPlayWarnings(error), "a zero-Momentum Strike is warned, not refused");
    await vanguardUses.command(actor, "chargerMomentousStrike", { confirmed: true, overrides: error.warnings.map(w => w.id) }, "strike-2d");
  }
  assert.ok(receipt(actor, "strike-2d"), "the Strike is recorded once the owner proceeds");
  const roll = damageRoll(weapon, { parts: ["1d8", "3"], marker: strikeMarker(actor, "strike-2d", weapon, foe) });
  const before = [...roll.config.rolls[0].parts];
  await fireDamage(roll);
  assert.deepEqual(addedDice(addedParts(before, roll.config.rolls[0].parts)), [], "zero Momentum adds no Strike dice");
});

test("2e no Charger command or native hook evaluates a Roll; Strike and Geirskogul dice wait for the owner's card", async () => {
  const actor = charger(17);
  await registered();
  combatWith(actor);
  const foe = creature("Foe"), weapon = weaponActivity(actor, { actionType: "mwak" });
  const counter = countRolls();
  try {
    await run(actor, "chargerCouch", {}, "couch-2e");
    await setMomentum(actor, 5);
    await run(actor, "chargerMomentousStrike", {}, "strike-2e");
    await fireAttack(attackConfig(weapon, { targetUuid: foe.uuid }));
    await fireDamage(damageRoll(weapon, { marker: strikeMarker(actor, "strike-2e", weapon, foe) }));
    await run(actor, "chargerGeirskogul", link("strike-2e", foe), "geir-2e");
  } finally { counter.restore(); }
  assert.equal(counter.counts.evaluated, 0, "no Charger path evaluates a Roll on its own");
  assert.equal(counter.counts.constructed, 0, "no Charger path constructs a Roll on its own");
});

/* ---------------------------------------------------------------- 3. Deathblow */

test("3a Deathblow flags the native damage roll ignoreResistance at level 10 with 5 or 6 Momentum spent", async t => {
  await registered();
  for (const spend of [5, 6]) {
    await t.test(`${spend} Momentum at level 10 flags ignoreResistance`, async () => {
    const actor = charger(10);
    combatWith(actor);
    const foe = creature("Foe"), weapon = weaponActivity(actor, { actionType: "mwak" });
    await setMomentum(actor, spend);
    await run(actor, "chargerMomentousStrike", {}, `strike-3a-${spend}`);
    const roll = damageRoll(weapon, { parts: ["1d8", "3"], marker: strikeMarker(actor, `strike-3a-${spend}`, weapon, foe) });
    const before = [...roll.config.rolls[0].parts];
    await fireDamage(roll);
    assert.equal(ignoresResistance(roll.config), true, `${spend} Momentum at level 10 flags the damage roll ignoreResistance`);
    assert.deepEqual(addedDice(addedParts(before, roll.config.rolls[0].parts)), [`${spend}d8`], "the Deathblow Strike still adds its d8 dice");
    });
  }
});

test("3b Deathblow is not flagged below 5 Momentum at level 10, and the Strike is never blocked by it", async () => {
  const actor = charger(10);
  await registered();
  combatWith(actor);
  const foe = creature("Foe"), weapon = weaponActivity(actor, { actionType: "mwak" });
  await setMomentum(actor, 4);
  const previewWarnings = warningsOf(actor, "chargerMomentousStrike", {});
  assert.ok(Array.isArray(previewWarnings), "the preview of a sub-5 Strike still returns its warnings instead of throwing");
  await run(actor, "chargerMomentousStrike", {}, "strike-3b");
  const roll = damageRoll(weapon, { parts: ["1d8", "3"], marker: strikeMarker(actor, "strike-3b", weapon, foe) });
  await fireDamage(roll);
  assert.equal(ignoresResistance(roll.config), false, "four Momentum does not ignore Resistances");
});

test("3c Deathblow is not flagged at level 9 even with 6 Momentum, and the Strike still uses d8 dice", async () => {
  const actor = charger(9);
  await registered();
  combatWith(actor);
  const foe = creature("Foe"), weapon = weaponActivity(actor, { actionType: "mwak" });
  await setMomentum(actor, 6);
  await run(actor, "chargerMomentousStrike", {}, "strike-3c");
  const roll = damageRoll(weapon, { parts: ["1d8", "3"], marker: strikeMarker(actor, "strike-3c", weapon, foe) });
  const before = [...roll.config.rolls[0].parts];
  await fireDamage(roll);
  assert.equal(ignoresResistance(roll.config), false, "Deathblow begins at level 10, so level 9 does not ignore Resistances");
  assert.deepEqual(addedDice(addedParts(before, roll.config.rolls[0].parts)), ["6d8"], "level 9 uses d8 dice");
});

/* ---------------------------------------------------------------- 4. Geirskogul */

test("4a Geirskogul links to its Strike by parentUseId and warns (never blocks) only when the Strike spent fewer than 5 Momentum", async () => {
  const actor = charger(17);
  await registered();
  combatWith(actor);
  const foe = creature("Foe");
  await setMomentum(actor, 4);
  await run(actor, "chargerMomentousStrike", {}, "strike-4a-4");
  const shortWarnings = warningsOf(actor, "chargerGeirskogul", link("strike-4a-4", foe));
  await setMomentum(actor, 5);
  await run(actor, "chargerMomentousStrike", {}, "strike-4a-5");
  const fullWarnings = warningsOf(actor, "chargerGeirskogul", link("strike-4a-5", foe));
  const fullTexts = fullWarnings.map(w => w.text);
  assert.ok(shortWarnings.some(w => !fullTexts.includes(w.text)), "a Strike below 5 Momentum adds a warning that a 5+ Strike does not carry");

  await run(actor, "chargerGeirskogul", link("strike-4a-4", foe), "geir-4a-short");
  assert.equal(receipt(actor, "geir-4a-short").parentUseId, "strike-4a-4", "the Geirskogul is linked to its Strike by parentUseId");
});

test("4b Geirskogul's Martial DC is the Martial DC plus the Momentum its Strike consumed", async () => {
  const actor = charger(17, { martialAbility: "str" });
  await registered();
  combatWith(actor);
  const foe = creature("Foe");
  await setMomentum(actor, 5);
  await run(actor, "chargerMomentousStrike", {}, "strike-4b");
  await run(actor, "chargerGeirskogul", link("strike-4b", foe), "geir-4b");
  const expected = rules.martialDC(actor, "str") + 5;
  assert.ok(new RegExp(`\\b${expected}\\b`).test(JSON.stringify(receipt(actor, "geir-4b"))),
    `the Geirskogul receipt records DC ${expected} (Martial DC ${rules.martialDC(actor, "str")} + 5 Momentum)`);
});

test("4c Geirskogul is used once per Long Rest: a short rest does not reset it, a Long Rest does", async () => {
  const actor = charger(17);
  await registered();
  combatWith(actor);
  const foe = creature("Foe");
  await setMomentum(actor, 5);
  await run(actor, "chargerMomentousStrike", {}, "strike-4c-1");
  await run(actor, "chargerGeirskogul", link("strike-4c-1", foe), "geir-4c-1");
  await setMomentum(actor, 5);
  await run(actor, "chargerMomentousStrike", {}, "strike-4c-2");
  assert.equal(restWarned(actor, "strike-4c-2", foe), true, "a second Geirskogul before a Long Rest is warned");
  await triggerShortRest(actor);
  assert.equal(restWarned(actor, "strike-4c-2", foe), true, "a short rest does not restore the Long Rest use");
  await triggerLongRest(actor);
  assert.equal(restWarned(actor, "strike-4c-2", foe), false, "a Long Rest restores the use");
});

test("4d undoing the linked Strike cascades to Geirskogul and restores its Long Rest use", async () => {
  const actor = charger(17);
  await registered();
  combatWith(actor);
  const foe = creature("Foe");
  await setMomentum(actor, 5);
  await run(actor, "chargerMomentousStrike", {}, "strike-4d");
  await run(actor, "chargerGeirskogul", link("strike-4d", foe), "geir-4d");
  await undoReceipt(actor, "strike-4d", "undo-4d");
  assert.equal(receipt(actor, "geir-4d").status, "undone", "the linked Geirskogul is undone with its Strike");
  assert.equal(momentum(actor), 5, "the Strike's Momentum is restored");
  assert.equal(restWarned(actor, "strike-4d", foe), false, "the Long Rest use is restored with the undo");
});

test("4e Geirskogul rolls no dice and records an owner-rolled Strength save against the Momentum-adjusted DC", async () => {
  const actor = charger(17, { martialAbility: "str" });
  await registered();
  combatWith(actor);
  const foe = creature("Foe");
  await setMomentum(actor, 5);
  await run(actor, "chargerMomentousStrike", {}, "strike-4e");
  const counter = countRolls();
  try { await run(actor, "chargerGeirskogul", link("strike-4e", foe), "geir-4e"); }
  finally { counter.restore(); }
  assert.equal(counter.counts.evaluated, 0, "confirming Geirskogul rolls neither the target save nor collision damage");
  const rec = receipt(actor, "geir-4e");
  const save = (rec.saves ?? []).find(entry => entry.ability === "str");
  assert.ok(save, "a Strength saving throw is recorded for the target's owner to roll");
  assert.equal(save.dc, rules.martialDC(actor, "str") + 5, "the save uses the Martial DC increased by the 5 Momentum consumed");
  assert.notEqual(rec.status, "complete", "the save remains awaiting the owner's roll");
});

/* ---------------------------------------------------------------- 5. Mark -> Tip */

test("5a a Marked creature reduced to 0 HP yields exactly one Tip grant through a charger-prefixed registry kind", async () => {
  const actor = charger(1);
  await registered();
  const combat = combatWith(actor);
  const foe = creature("Marked");
  const kind = tipKind();
  await markedKill(actor, foe, combat, "5a");
  assert.equal(tipGranted(actor, "kill-5a", 1, kind), true, "the Marked kill offers one Tip grant");
  assert.equal(tipGranted(actor, "kill-5a", 2, kind), false, "the same Mark offers no second grant");
  await emitOk("kill", killPayload(actor, foe, "kill-5a-replay", combat));
  assert.equal(tipGranted(actor, "kill-5a-replay", 1, kind), false, "a replayed kill of the same creature creates no new grant");
});

test("5b a Tip grant from the Mark is claimed once: a second claim is rejected and undo releases it", async () => {
  const actor = charger(1);
  await registered();
  const combat = combatWith(actor);
  const foe = creature("Marked"), ally = creature("Ally");
  const kind = tipKind();
  await markedKill(actor, foe, combat, "5b");
  const data = tipData(ally, kind, "kill-5b");
  await run(actor, "tipOfTheSpear", data, "tip-5b-1");
  assert.ok(receipt(actor, "tip-5b-1"), "the first claim is recorded");
  await assert.rejects(() => run(actor, "tipOfTheSpear", data, "tip-5b-2"), error => { noRuntimeFault(error, "a double claim"); return true; },
    "a second claim of the same grant is rejected");
  assert.equal(receipt(actor, "tip-5b-2") ?? null, null, "the rejected double-spend leaves no receipt");
  await undoReceipt(actor, "tip-5b-1", "undo-tip-5b");
  await run(actor, "tipOfTheSpear", data, "tip-5b-3");
  assert.ok(receipt(actor, "tip-5b-3"), "undoing the first claim releases the grant for a fresh claim");
});

test("5c an invented sourceEventId is rejected by the grant registry and changes no state", async () => {
  const actor = charger(1);
  await registered();
  const combat = combatWith(actor);
  const foe = creature("Marked"), ally = creature("Ally");
  const kind = tipKind();
  await markedKill(actor, foe, combat, "5c");
  const invented = tipData(ally, kind, "kill-invented-5c");
  assert.equal(tipGranted(actor, "kill-invented-5c", 1, kind), false, "the registry does not validate an invented source event");
  const before = JSON.stringify(vanguardUses.state(actor).undo);
  await assert.rejects(() => run(actor, "tipOfTheSpear", invented, "tip-5c"), error => { noRuntimeFault(error, "an invented source"); return true; },
    "a Tip claimed from an invented source is rejected");
  assert.equal(receipt(actor, "tip-5c") ?? null, null, "no receipt is written for the rejected claim");
  assert.equal(JSON.stringify(vanguardUses.state(actor).undo), before, "the rejected claim changes no undo state");
});

test("5d the Mark lasts through another creature's Turn and expires at the Charger's own next Turn", async () => {
  const actor = charger(1), other = createTestActor({ name: "Other" });
  await registered();
  const combat = combatWith(actor, other);
  const kind = tipKind(), survivor = creature("Survivor"), expired = creature("Expired");
  await emitOk("hitTaken", damagePayload(actor, survivor, "dmg-5d-a", combat, { round: 1, turn: 0 }));
  await emitOk("hitTaken", damagePayload(actor, expired, "dmg-5d-b", combat, { round: 1, turn: 0 }));
  await emitOk("turnStart", turnStartPayload(other, "other-start-5d", combat, 1, 1));
  await emitOk("kill", killPayload(actor, survivor, "kill-5d-a", combat, { round: 1, turn: 1 }));
  assert.equal(tipGranted(actor, "kill-5d-a", 1, kind), true, "another creature's Turn does not end the Mark");
  await emitOk("turnStart", turnStartPayload(actor, "self-start-5d", combat, 2, 0));
  await emitOk("kill", killPayload(actor, expired, "kill-5d-b", combat, { round: 2, turn: 0 }));
  assert.equal(tipGranted(actor, "kill-5d-b", 1, kind), false, "the Mark ends at the beginning of the Charger's next Turn");
});

test("5e a creature the Charger never Marked, or one damaged by someone else, grants no Tip on reaching 0 HP", async () => {
  const actor = charger(1), bystander = createTestActor({ name: "Bystander" });
  await registered();
  const combat = combatWith(actor, bystander);
  const kind = tipKind(), unmarked = creature("Unmarked"), others = creature("Others");
  await emitOk("kill", killPayload(actor, unmarked, "kill-5e-a", combat));
  assert.equal(tipGranted(actor, "kill-5e-a", 1, kind), false, "a kill without a Mark grants no Tip");
  await emitOk("hitTaken", { ...damagePayload(bystander, others, "dmg-5e-b", combat), sourceActorUuid: bystander.uuid });
  await emitOk("kill", killPayload(actor, others, "kill-5e-b", combat));
  assert.equal(tipGranted(actor, "kill-5e-b", 1, kind), false, "a Mark from another creature's damage is not the Charger's Mark");
});

/* ---------------------------------------------------------------- 6. Undo isolation and Renewing Momentum */

test("6a undoing one Momentum gain leaves a later gain intact, with no value-changed conflict", async () => {
  const actor = charger(1);
  await registered();
  const combat = combatWith(actor);
  const a = await newReceipts(actor, () => emitOk("initiative", { eventId: "init-6a-a", actorUuid: actor.uuid, combatUuid: combat.uuid, round: 1, turn: 0 }));
  const b = await newReceipts(actor, () => emitOk("initiative", { eventId: "init-6a-b", actorUuid: actor.uuid, combatUuid: combat.uuid, round: 1, turn: 0 }));
  assert.equal(momentum(actor), 2, "two initiative gains give two Momentum");
  assert.equal(a.length, 1, "gain A leaves exactly one undo receipt");
  assert.equal(b.length, 1, "gain B leaves exactly one undo receipt");
  const aId = a[0].id, bId = b[0].id;
  await undoReceipt(actor, aId, "undo-6a-a");
  assert.equal(receipt(actor, aId).status, "undone", "gain A is undone");
  assert.notEqual(receipt(actor, bId).status, "undone", "gain B stays in force");
  assert.equal(momentum(actor), 1, "undoing A removes exactly its point");
  assert.doesNotMatch(JSON.stringify(receipt(actor, aId).undoNotes ?? []), /changed/i,
    "B's later write causes no value-changed conflict on A's undo");
});

test("6b undoing a Marked kill cascades to its Tip grant and the Renewing Momentum it caused", async () => {
  const actor = charger(13);
  await registered();
  const combat = combatWith(actor);
  const foe = creature("Marked");
  const kind = tipKind();
  await setMomentum(actor, 0);
  const { kill } = await markedKill(actor, foe, combat, "6b");
  assert.equal(momentum(actor), 1, "the Marked kill grants Renewing Momentum at level 13");
  assert.equal(tipGranted(actor, "kill-6b", 1, kind), true, "the kill offers its Tip grant");
  assert.ok(kill.length >= 1, "the kill leaves an undo receipt");
  await undoReceipt(actor, kill[kill.length - 1].id, "undo-6b");
  assert.equal(momentum(actor), 0, "undoing the kill removes the Renewing Momentum it caused");
  assert.equal(tipGranted(actor, "kill-6b", 1, kind), false, "undoing the kill removes the Tip grant it offered");
});

test("6c undoing the damage that created a Mark cascades to the Mark and to any Tip grant it produced", async () => {
  const actor = charger(1);
  await registered();
  const combat = combatWith(actor);
  const foe = creature("Marked");
  const kind = tipKind();
  const { damage } = await markedKill(actor, foe, combat, "6c");
  assert.equal(tipGranted(actor, "kill-6c", 1, kind), true, "the Marked kill offers a Tip grant before the damage is undone");
  assert.ok(damage.length >= 1, "the damage leaves an undo receipt");
  await undoReceipt(actor, damage[damage.length - 1].id, "undo-6c");
  assert.equal(tipGranted(actor, "kill-6c", 1, kind), false, "undoing the damage removes the Mark and the Tip grant it produced");
});

test("6d Renewing Momentum is granted once per Turn, keyed by combat, round and turn", async () => {
  const actor = charger(13);
  await registered();
  const combatX = createTestCombat([actor], { started: true, round: 1, turn: 0 });
  const combatY = createTestCombat([actor], { started: true, round: 2, turn: 3 });
  game.combat = combatX;
  const kill = (combat, round, turn, tag) => emitOk("kill", killPayload(actor, creature(tag), `kill-6d-${tag}`, combat, { round, turn }));
  await kill(combatX, 1, 2, "a");
  assert.equal(momentum(actor), 1, "the first kill in a Turn grants one Momentum");
  await kill(combatX, 1, 2, "b");
  assert.equal(momentum(actor), 1, "a second kill in the same Turn grants nothing more");
  await kill(combatX, 1, 3, "c");
  assert.equal(momentum(actor), 2, "a kill in the next turn of the same round grants again");
  await kill(combatX, 2, 3, "d");
  assert.equal(momentum(actor), 3, "a kill in the next round grants again");
  await kill(combatY, 2, 3, "e");
  assert.equal(momentum(actor), 4, "a kill in another combat with the same round and turn grants again");
});

/* ---------------------------------------------------------------- 7. Momentum bounds and level gates */

test("7a Momentum stays between 0 and 6 across gains, Couch, Strike and undo sequences", async () => {
  const actor = charger(1);
  await registered();
  const combat = combatWith(actor);
  const bounded = () => {
    const value = momentum(actor);
    assert.ok(Number.isInteger(value) && value >= 0 && value <= 6, `Momentum ${value} must stay within 0..6`);
    return value;
  };
  const gains = [];
  for (let index = 0; index < 8; index++) {
    const created = await newReceipts(actor, () => emitOk("initiative", { eventId: `init-7a-${index}`, actorUuid: actor.uuid,
      combatUuid: combat.uuid, round: 1, turn: 0 }));
    gains.push(created[created.length - 1]?.id ?? null);
    bounded();
  }
  assert.equal(momentum(actor), 6, "initiative gains clamp at the source maximum of six");
  assert.ok(gains.every(Boolean), "each clamped initiative gain still leaves an undo receipt");
  await run(actor, "chargerCouch", {}, "couch-7a");
  assert.equal(momentum(actor), 6, "Couch at six Momentum cannot exceed six");
  await undoReceipt(actor, "couch-7a", "undo-couch-7a");
  assert.equal(momentum(actor), 6, "undoing the clamped Couch restores six");
  await run(actor, "chargerMomentousStrike", {}, "strike-7a");
  assert.equal(momentum(actor), 0, "the Strike spends all six");
  await undoReceipt(actor, "strike-7a", "undo-strike-7a");
  assert.equal(momentum(actor), 6, "undoing the Strike restores six");
  await undoReceipt(actor, gains[0], "undo-gain-7a");
  bounded();
  await undoReceipt(actor, gains[gains.length - 1], "undo-gain-last-7a");
  bounded();
});

test("7b combatEnd clears all Momentum for the Charger", async () => {
  const actor = charger(4);
  await registered();
  const combat = combatWith(actor);
  await setMomentum(actor, 4);
  await emitOk("combatEnd", { eventId: `combatEnd:${combat.uuid}`, combatUuid: combat.uuid, actorUuids: [actor.uuid] });
  assert.equal(momentum(actor), 0, "leaving Combat clears all Momentum");
});

test("7c level gate 3 vs 4: Push on Through is offered from Charger level 4 only", async () => {
  await registered();
  const below = charger(3), at = charger(4);
  const hasPush = actor => ownerControls(actor).some(control => control.id === "charger:push-on-through");
  assert.equal(hasPush(below), false, "Push on Through is not offered at level 3");
  assert.equal(hasPush(at), true, "Push on Through is offered at level 4");
});

test("7d level gate 12 vs 13: Renewing Momentum is granted from level 13 only", async () => {
  await registered();
  for (const [level, expected] of [[12, 0], [13, 1]]) {
    const actor = charger(level);
    const combat = combatWith(actor);
    await setMomentum(actor, 0);
    await emitOk("kill", killPayload(actor, creature(`F${level}`), `kill-7d-${level}`, combat));
    assert.equal(momentum(actor), expected, `a kill at level ${level} grants ${expected} Renewing Momentum`);
  }
});

test("7e level gate 16 vs 17: Geirskogul is offered at 17 and a level-16 Charger never gets it without a level warning", async () => {
  await registered();
  const at16 = charger(16), at17 = charger(17), foe = creature("Foe");
  assert.equal(ownerControls(at16).some(control => control.id === "charger:geirskogul"), false, "Geirskogul is not offered at level 16");
  assert.equal(ownerControls(at17).some(control => control.id === "charger:geirskogul"), true, "Geirskogul is offered at level 17");
  let refused = false, warnings = [];
  try { warnings = warningsOf(at16, "chargerGeirskogul", { targetUuid: foe.uuid, targetName: foe.name }); }
  catch (error) { refused = true; noRuntimeFault(error, "a level-16 Geirskogul preview"); }
  if (!refused) assert.ok(warnings.some(w => /level|17/i.test(w.text)), "a level-16 Geirskogul preview carries a level-17 warning");
});

/* ---------------------------------------------------------------- 8. Robustness */

test("8a events without a combat raise no handler failure, and Renewing Momentum is granted at most once without a turn key", async () => {
  const actor = charger(13);
  await registered();
  game.combat = null;
  await setMomentum(actor, 0);
  const logs = captureErrors();
  const results = [];
  try {
    results.push(await trigger.emitAk5eEvent("kill", killPayload(actor, creature("A"), "nocombat-a", null, { round: null, turn: null })));
    results.push(await trigger.emitAk5eEvent("kill", killPayload(actor, creature("B"), "nocombat-b", null, { round: null, turn: null })));
  } finally { logs.restore(); }
  for (const result of results) assert.equal(result.errors, 0, "a combat-less kill raises no handler failure");
  assert.ok(logs.lines.every(line => !/handler failed/i.test(line)), "no handler failure is logged for combat-less events");
  assert.ok(momentum(actor) <= 1, "without a combat turn key, Renewing Momentum cannot be granted more than once");
});

test("8b a Geirskogul with no target warns or refuses; it never raises a runtime fault or completes silently", async () => {
  const actor = charger(17);
  await registered();
  combatWith(actor);
  await setMomentum(actor, 5);
  await run(actor, "chargerMomentousStrike", {}, "strike-8b");
  let error = null, result = null;
  try { result = await vanguardUses.command(actor, "chargerGeirskogul", { confirmed: true, strikeId: "strike-8b", strikeUseId: "strike-8b" }, "geir-8b"); }
  catch (caught) { error = caught; }
  noRuntimeFault(error, "a Geirskogul without a target");
  assert.ok(error instanceof Error && !result, "a missing target cannot complete silently");
});

test("8c garbage Charger movement payloads are rejected without a runtime fault and change no state", async () => {
  const actor = charger(4);
  const features = await registered();
  const combat = combatWith(actor);
  const foe = creature("Foe");
  await setMomentum(actor, 1);
  const before = JSON.stringify(actor.flags?.ak5e ?? {});
  const garbage = [{ feet: Number.NaN }, { feet: "abc" }, { feet: -5 }, { feet: 15, straight: "yes" }, { feet: undefined },
    { feet: 15, confirmed: false }];
  for (const patch of garbage) {
    const data = { feet: 15, straight: true, hostile: true, targetUuid: foe.uuid, confirmed: true, eventId: "garbage-8c", ...patch };
    let error = null;
    try { await features.recordChargerMovement(actor, data); } catch (caught) { error = caught; }
    noRuntimeFault(error, `movement ${JSON.stringify(patch)}`);
    assert.ok(error instanceof Error, `movement ${JSON.stringify(patch)} must be rejected`);
  }
  assert.equal(JSON.stringify(actor.flags?.ak5e ?? {}), before, "rejected movement payloads change no flags");
  assert.equal(momentum(actor), 1, "rejected movement payloads change no Momentum");
  assert.ok(combat, "the combat fixture stays in place");
});

test("8d a double-submitted Couch, Strike or Tip receipt is applied once", async () => {
  const actor = charger(1);
  await registered();
  const combat = combatWith(actor);
  await setMomentum(actor, 2);
  await run(actor, "chargerCouch", {}, "couch-8d");
  await run(actor, "chargerCouch", {}, "couch-8d");
  assert.equal(momentum(actor), 3, "a double-submitted Couch grants one Momentum");

  await setMomentum(actor, 2);
  await run(actor, "chargerMomentousStrike", {}, "strike-8d");
  await run(actor, "chargerMomentousStrike", {}, "strike-8d");
  assert.equal(momentum(actor), 0, "a double-submitted Strike spends the Momentum once");
  assert.equal(vanguardUses.state(actor).undo.filter(entry => entry.id === "strike-8d").length, 1, "one Strike receipt exists");
});

test("8f a double-submitted Tip claim is one receipt", async () => {
  const actor = charger(1);
  await registered();
  const combat = combatWith(actor);
  const foe = creature("Marked"), ally = creature("Ally"), kind = tipKind();
  await markedKill(actor, foe, combat, "8f");
  await run(actor, "tipOfTheSpear", tipData(ally, kind, "kill-8f"), "tip-8f");
  await run(actor, "tipOfTheSpear", tipData(ally, kind, "kill-8f"), "tip-8f");
  assert.equal(vanguardUses.state(actor).undo.filter(entry => entry.id === "tip-8f").length, 1, "a double-submitted Tip claim is one receipt");
});

test("8e malformed event payloads raise no handler failure and never corrupt Momentum", async () => {
  const actor = charger(13);
  await registered();
  combatWith(actor);
  await setMomentum(actor, 2);
  const payloads = [
    ["kill", { eventId: "g-kill-1", sourceActorUuid: null, actorUuid: undefined }],
    ["kill", { eventId: "g-kill-2", sourceActorUuid: actor.uuid, actorUuid: 42, combatUuid: {}, round: "x", turn: null }],
    ["hit", { eventId: "g-hit-1", actorUuid: actor.uuid, targets: "nope", targetUuid: 5 }],
    ["hitTaken", { eventId: "g-dmg-1", sourceActorUuid: "Actor.missing", actorUuid: null }],
    ["initiative", { eventId: "g-init-1", actorUuid: "Actor.missing" }],
    ["combatEnd", { eventId: "g-end-1" }]
  ];
  const logs = captureErrors();
  try {
    for (const [kind, payload] of payloads) {
      const result = await trigger.emitAk5eEvent(kind, payload);
      assert.equal(result.errors, 0, `${kind} ${payload.eventId} raises no handler failure`);
    }
  } finally { logs.restore(); }
  assert.ok(logs.lines.every(line => !/handler failed/i.test(line)), "no malformed payload is logged as a handler failure");
  const value = momentum(actor);
  assert.ok(Number.isInteger(value) && value >= 0 && value <= 6, `Momentum ${value} stays a valid integer within 0..6`);
});
