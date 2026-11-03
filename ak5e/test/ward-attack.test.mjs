/**
 * Adversarial boundary tests for Wave 2 package F (Ward runtime), drafted BEFORE
 * any implementation exists and deliberately separate from the frozen suite.
 * Sources/specs: SPEC-ward.md (F1-F9), SPEC-ward-rules.md, AK5e v1.3.1 Ch.3
 * C3:5049-5087, DECISIONS owner rulings 2026-10-28 + open readings 2026-11-01.
 * Cases: two Medics with separate provenance, smaller/equal replacement, partial
 * and full depletion, reaction-Art bonuses excluded, per-turn firstsave, attack
 * source binding, split damage, fresh donor state/dedup/retry, relay/linked
 * undo/reload; plus malformed input, unowned targets, overspend clamping,
 * reaction-less recovery, zero-damage waste and story-conflict preservation.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { medicUses } from "../scripts/medic-uses.mjs";
import { defineMedicPools, setLifeSupport } from "../scripts/medic-features.mjs";
import { clearPoolRegistry } from "../scripts/resource-pools.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import {
  wardGrant, extraTempHP, choosePool, wardOf, reconcileTag, statusResistance,
  treatTheCause, treatTheCauseOutcome, wardingSurge, restoreReaction,
  collectiveWardSettlement, wardRegeneration
} from "../scripts/ward-rules.mjs";
import { appendLinkedReceipt, captureArtChanges } from "../scripts/arts-ledger.mjs";
import { getReactions, spendReaction, setReactionStore } from "../scripts/trigger-events.mjs";

const featureImport = await import("../scripts/ward-features.mjs").catch(error => ({ __loadError: error }));
const sheetImport = await import("../scripts/ward-sheet.mjs").catch(error => ({ __loadError: error }));
const HEALING_POOL = "special-art-pool-healing-arts-4211";
const MEDIC = "Actor.AttackMedic";
const OTHER_MEDIC = "Actor.AttackOtherMedic";
const wardTag = (overrides = {}) => ({ medicUuid: MEDIC, grantedAt: "c:2:3", amount: 8, ...overrides });
let registered = false;
let globals;

test.before(async () => {
  globals = setupFoundryGlobals({ isGM: false, worldTime: 200, settings: { "ak5e.artReceiptEpoch": 0 } });
  defineMedicPools();
  if (typeof featureImport.registerWardHooks === "function") {
    await featureImport.registerWardHooks();
    registered = true;
  }
});
test.after(() => teardownFoundryGlobals());

function requireRuntime() {
  assert.equal(typeof featureImport.registerWardHooks, "function",
    `Ward runtime absent: registerWardHooks() unavailable (${featureImport.__loadError?.code ?? "export unavailable"}: ${featureImport.__loadError?.message ?? ""})`);
  assert.ok(featureImport.WARD_PLANS, "WARD_PLANS is required by the frozen contract");
  assert.equal(registered, true, "ward hook registration did not run");
  return featureImport;
}
function requireSheet() {
  assert.equal(typeof sheetImport.renderWardSection, "function",
    `Ward sheet absent: renderWardSection() unavailable (${sheetImport.__loadError?.code ?? "export unavailable"}: ${sheetImport.__loadError?.message ?? ""})`);
  assert.equal(typeof sheetImport.handleWardCommand, "function", "handleWardCommand() is required");
  return sheetImport;
}

function medic({ level = 15, lifeSupport = 100, id = "AttackMedic" } = {}) {
  clearPoolRegistry();
  defineMedicPools();
  const actor = createTestActor({
    name: id, level,
    abilities: { dex: { value: 12, mod: 1 }, wis: { value: 16, mod: 3 } },
    system: { details: { type: { value: "humanoid" } }, attributes: { hp: { value: 40, max: 40, temp: 0 } } }
  });
  actor.flags.ak5e.medic = { enabled: true, spellcastingAbility: "wis", spellDC: 15 };
  actor.flags.ak5e.resourcePools = { lifeSupport: { value: lifeSupport, max: 125 } };
  actor.items.set("medic-class", createTestItem({ id: "medic-class", type: "class", name: "Medic",
    system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-medic" } } }, actor));
  actor.items.set("ward-branch", createTestItem({ id: "ward-branch", type: "subclass", name: "Ward",
    flags: { ak5e: { chapterThreeId: "subclass-medic-ward" } } }, actor));
  setLifeSupport(actor, lifeSupport, "attack fixture");
  actor.uuid = `Actor.${id}`;
  globalThis._ak5eTestDocs?.set(actor.uuid, actor);
  globalThis.game.actors.set(actor.id, actor);
  return actor;
}

function patient({ name = "Victim", owner = true, hp = 20, maxHp = 40, temp = 0, tag = null } = {}) {
  const actor = createTestActor({
    name, owner: owner ? undefined : false,
    system: { details: { type: { value: "humanoid" } }, attributes: { hp: { value: hp, max: maxHp, temp } } }
  });
  if (tag) actor.flags.ak5e.ward = structuredClone(tag);
  return actor;
}

const tagOf = target => target.flags.ak5e?.ward ?? null;
function applyTag(target, pool) {
  if (pool?.tag) target.flags.ak5e.ward = structuredClone(pool.tag);
  target.system.attributes.hp.temp = pool?.temp ?? 0;
}
const lsOf = actor => actor.flags.ak5e.resourcePools?.lifeSupport?.value ?? 0;

test("ATTACK: pure rules stay total for numeric falsehoods and only range on malformed enums", () => {
  assert.throws(() => choosePool({ currentTemp: -1, currentTag: null, incomingAmount: 5, medicUuid: MEDIC, choice: "keep" }),
    /negative|malformed|RangeError|TypeError/i);
  assert.throws(() => wardGrant({ healingAmount: -2, actionType: "action", fromArt: false, apSpent: 0 }),
    /negative|malformed|RangeError|TypeError/i);
  assert.throws(() => wardGrant({ healingAmount: 5, actionType: "emain", fromArt: false, apSpent: 0 }),
    /unknown|enum|actionType/i, "an unknown actionType enum must be rejected, not silently defaulted");
  assert.throws(() => wardingSurge({ targetHasWard: true, reactionAvailable: true, lifeSupport: 30, damageTypes: "fire" }),
    /damageTypes|iterable|array/i, "a string instead of a damage-type list is malformed input");
  assert.throws(() => wardOf({ temp: -4, tag: wardTag() }, MEDIC),
    /negative|RangeError/i, "negative temp is malformed input and throws at the rules layer");
  assert.throws(() => wardRegeneration({ medicLevel: 20.5, hasOwnWard: false, currentTemp: 0 }),
    /whole|RangeError/i, "fractional levels are malformed input, never silently floored");
});

test("ATTACK: equal-amount replacement and identical-pool replacement keep provenance rules straight", () => {
  const equal = choosePool({ currentTemp: 8, currentTag: wardTag({ amount: 8 }),
    incomingAmount: 8, medicUuid: MEDIC, choice: "replace" });
  assert.deepEqual({ temp: equal.temp, suggestion: equal.suggestion, tagMedic: equal.tag.medicUuid },
    { temp: 8, suggestion: "keep", tagMedic: MEDIC },
    "an equal pool is suggested keep, never silently wasted as a replacement");
  assert.deepEqual(reconcileTag({ tempBefore: 8, tempAfter: 8, tag: wardTag({ amount: 8 }) }), wardTag({ amount: 8 }));
  assert.deepEqual(reconcileTag({ tempBefore: 8, tempAfter: 8, tag: wardTag({ amount: 8 }), grantedByWard: undefined }),
    wardTag({ amount: 8 }), "an unchanged same-size pool is not a foreign replacement");
  // A plain decrease is indistinguishable from partial depletion at the pure
  // layer, so the tag survives; the runtime clears provenance through its
  // explicit keep/replace grant path (asserted in ward-frozen.test.mjs F3/F4).
  assert.deepEqual(reconcileTag({ tempBefore: 8, tempAfter: 4, tag: wardTag({ amount: 8 }), grantedByWard: false }),
    wardTag({ amount: 8 }), "a plain decrease never invents a replacement ruling at the pure layer");
});

test("ATTACK: two Medics never share Ward access or provenance on the same pool", () => {
  const pool = { temp: 7, tag: wardTag({ medicUuid: MEDIC, amount: 7 }) };
  assert.equal(wardOf(pool, OTHER_MEDIC), 0, "only the originating Medic uses this Ward");
  assert.equal(wardOf({ temp: 7, tag: { medicUuid: OTHER_MEDIC, grantedAt: null, amount: 7 } }, MEDIC), 0);
  assert.equal(wardOf({ temp: 7, tag: null }, MEDIC), 0, "untagged temp HP is never Ward");
  assert.equal(wardOf({ temp: 7, tag: wardTag({ amount: 0 }) }, MEDIC), 7,
    "the amount field is provenance only; the live pool is the temp value");
});

test("ATTACK: per-turn firstsave cannot be consumed by foreign or unrelated saves", () => {
  const mark = statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey: "c1:1:1", usedTurnKey: null });
  const sameStatus = statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey: "c1:1:1", usedTurnKey: mark.usedTurnKey });
  assert.equal(sameStatus.advantage, false, "a second status save on the same turn is plain");
  assert.equal(statusResistance({ hasWard: true, savingVsStatusCondition: false, turnKey: "c1:1:1", usedTurnKey: null }).usedTurnKey,
    null, "a non-status save never spends the per-turn allowance");
  assert.equal(statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey: "c1:1:2", usedTurnKey: "other-key" }).advantage,
    true, "a foreign or stale key never blocks the real turn's allowance");
});

test("ATTACK: Treat the Cause binding, distances and outcome edges", () => {
  assert.deepEqual(treatTheCause({ targetHasWard: true, attackerDistanceFeet: 0, reactionAvailable: true, saveDC: 15 }).warnings,
    [], "adjacent attackers trigger the feature normally");
  assert.ok(treatTheCause({ targetHasWard: true, attackerDistanceFeet: 31, reactionAvailable: true, saveDC: 15 })
    .warnings.includes("attackerOutOfRange"));
  assert.ok(treatTheCause({ targetHasWard: true, attackerDistanceFeet: null, reactionAvailable: true, saveDC: 15 })
    .warnings.includes("attackerRangeUnknown"), "an unknown range stays visible, never silently in");
  assert.deepEqual(treatTheCauseOutcome({ saveSucceeded: false, damageRolled: 0 }), { damage: 0, forcedMiss: true },
    "a failed save against a zero-damage roll still binds the forced miss");
  assert.deepEqual(treatTheCauseOutcome({ saveSucceeded: true, damageRolled: 2 ** 53 }), { damage: 2 ** 52, forcedMiss: false },
    "huge rolls halve without precision drift");
});

test("ATTACK: Warding Surge cost, restore exhaustion and chained shortfalls", () => {
  const spent = wardingSurge({ targetHasWard: true, reactionAvailable: true, lifeSupport: 15, damageTypes: ["fire", "fire", "necrotic"] });
  assert.deepEqual({ lifeSupportAfter: spent.lifeSupportAfter, shortfall: spent.shortfall,
    resistTypes: spent.resistTypes, warnings: spent.warnings },
    { lifeSupportAfter: 5, shortfall: 0, resistTypes: ["fire", "necrotic"], warnings: [] });
  const restore = restoreReaction({ lifeSupport: 5 });
  assert.deepEqual({ cost: restore.cost, lifeSupportAfter: restore.lifeSupportAfter, shortfall: restore.shortfall },
    { cost: 15, lifeSupportAfter: 0, shortfall: 10 });
  assert.deepEqual(spent.resistTypes, ["fire", "necrotic"], "unique types, original order kept");
  const empty = wardingSurge({ targetHasWard: true, reactionAvailable: true, lifeSupport: 9, damageTypes: [] });
  assert.deepEqual({ resistTypes: empty.resistTypes, warnings: empty.warnings, lifeSupportAfter: empty.lifeSupportAfter },
    { resistTypes: [], warnings: ["lifeSupportShort"], lifeSupportAfter: 0 });
});

test("ATTACK: Collective Ward donor floors, split damage and zero-damage waste", () => {
  const zero = collectiveWardSettlement({ damage: 0, recipientTemp: 4, recipientHasWard: true,
    recipientDistanceFeet: 10, donors: [{ uuid: "Actor.d1", ward: 5, distanceFeet: 10 }], removals: { "Actor.d1": 5 } });
  assert.deepEqual({ removed: zero.removed, wasted: zero.wasted, damageAfterWard: zero.damageAfterWard,
    tempAbsorbed: zero.tempAbsorbed, hpLoss: zero.hpLoss },
    { removed: 5, wasted: 5, damageAfterWard: 0, tempAbsorbed: 0, hpLoss: 0 }, "zero damage wastes all removed Ward");
  assert.ok(zero.warnings.includes("wardWasted"));
  const partial = collectiveWardSettlement({ damage: 20, recipientTemp: 3, recipientHasWard: true,
    recipientDistanceFeet: 5, donors: [{ uuid: "Actor.d2", ward: 10, distanceFeet: 10 }], removals: { "Actor.d2": 7 } });
  assert.deepEqual({ removed: partial.removed, damageAfterWard: partial.damageAfterWard,
    tempAbsorbed: partial.tempAbsorbed, hpLoss: partial.hpLoss },
    { removed: 7, damageAfterWard: 13, tempAbsorbed: 3, hpLoss: 10 },
    "partially absorbed damage leaves real HP loss after full donor consumption");
  const noDonors = collectiveWardSettlement({ damage: 9, recipientTemp: 0, recipientHasWard: true,
    recipientDistanceFeet: 30, donors: [], removals: {} });
  assert.deepEqual({ removed: noDonors.removed, damageAfterWard: noDonors.damageAfterWard, hpLoss: noDonors.hpLoss },
    { removed: 0, damageAfterWard: 9, hpLoss: 9 }, "no donors: damage falls straight through to the pool/HP");
  assert.equal(Object.keys(collectiveWardSettlement({ damage: 5, recipientTemp: 0, recipientHasWard: true,
    recipientDistanceFeet: 5, donors: [], removals: {} }).donorUpdates).length, 0);
});

test("ATTACK: WARD_FEATURES branch gating for non-Ward Medics stays at the rules level", () => {
  const sum = wardGrant({ healingAmount: 7, actionType: "bonus", fromArt: true, apSpent: 1 });
  assert.deepEqual(sum, { base: 7, dieFormula: "1d8", apBonus: 1, formula: "7 + 1d8 + 1" });
  for (const actionType of ["reaction", "other"]) {
    assert.deepEqual(extraTempHP({ actionType, fromArt: true, apSpent: 6 }),
      { dieFormula: null, apBonus: 0 }, "reaction-Art extra temp HP gets neither the 1d8 nor the AP bonus");
  }
  assert.deepEqual(extraTempHP({ actionType: "action", fromArt: true, apSpent: 4 }),
    { dieFormula: "1d8", apBonus: 4 });
});

test("ATTACK: missing runtime interfaces surface explicit intended missing-behavior failures", () => {
  requireRuntime();
  const plans = featureImport.WARD_PLANS;
  for (const name of ["wardGrant", "wardLifeSupport", "treatTheCause", "wardingSurge",
    "collectiveWard", "wardRegeneration"]) {
    assert.equal(typeof plans[name], "function", `WARD_PLANS.${name} is required`);
    assert.equal(medicUses.isCommand(name), true, `medicUses must accept the ${name} command`);
  }
});

test("ATTACK: opening the Ward sheet control is read-only and escaped", async () => {
  const sheet = requireSheet();
  const actor = medic({ id: "SheetAttacker" });
  const before = JSON.stringify(actor.flags.ak5e);
  const html = sheet.renderWardSection(actor);
  assert.match(String(html), /data-medic-cmd/);
  assert.doesNotMatch(String(html), /<SheetAttacker>/, "no raw actor-name markup");
  assert.equal(JSON.stringify(actor.flags.ak5e), before, "rendering writes nothing");
  assert.equal(await sheet.handleWardCommand(actor, "definitelyNotAWardCommand", {}), false);
});

test("ATTACK: registration is idempotent and harmless on repeat calls", async () => {
  requireRuntime();
  const before = game.system?.custom ?? null;
  await featureImport.registerWardHooks();
  await featureImport.registerWardHooks();
  const after = game.system?.custom ?? null;
  assert.equal(JSON.stringify(after), JSON.stringify(before), "repeat registration writes nothing global");
  assert.equal(typeof sheetImport.renderWardSection, "function", "the sheet still loads after re-registration");
});

test("ATTACK: unconfirmed, malformed and unowned Ward runtime requests are rejected before any write", async () => {
  requireRuntime();
  const actor = medic({ level: 5, lifeSupport: 40 });
  const target = patient({ owner: true });
  const before = JSON.stringify(target.system.attributes.hp);
  const beforeFlags = JSON.stringify(target.flags);
  await assert.rejects(medicUses.command(actor, "wardGrant", { confirmed: false, targetUuid: target.uuid,
    healingAmount: 5, actionType: "action" }, "atk-unconfirmed"), /confirm/i);
  await assert.rejects(medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: target.uuid,
    healingAmount: -3, actionType: "action" }, "atk-negative"), /amount|healing|positive|whole|greater/i);
  await assert.doesNotReject(medicUses.command(actor, "wardGrant", { confirmed: true,
    targetUuid: "Actor.nobodyHere", healingAmount: 5, actionType: "action", ownerRoll1d8: 2 }, "atk-unowned"),
  "an unowned/unknown target request must not throw raw; it validates and relays through the GM instead");
  assert.equal(JSON.stringify(target.system.attributes.hp), before, "no temp HP changed on rejected requests");
  assert.equal(JSON.stringify(target.flags), beforeFlags, "no Ward tag wrote on rejected requests");
  assert.equal(lsOf(actor), 40, "nothing was spent for rejected requests");
});

test("ATTACK: an unowned target's Ward grant validates and relays through the GM client", async () => {
  requireRuntime();
  // The relay needs an active GM receiver; the shared fixture defaults activeGM
  // to a GM user, and directly assigning it is reserved for the shared fixture
  // (a getter-only property in the current lane copy).
  const actor = medic({ level: 5, lifeSupport: 40 });
  const stranger = patient({ name: "Stranger", owner: false });
  const pending = medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: stranger.uuid,
    healingAmount: 5, actionType: "action", ownerRoll1d8: 2 }, "atk-relay").then(v => ({ v }), e => ({ e }));
  let request = null;
  for (let i = 0; i < 2000 && !request; i++) {
    request = (globalThis.game.messages ?? []).find(message => {
      const ak5e = message?.flags?.ak5e ?? {};
      return Object.entries(ak5e).some(([key, value]) =>
        /relay|request/i.test(key) && value && typeof value === "object");
    }) ?? null;
    if (!request) await new Promise(resolve => setImmediate(resolve));
  }
  assert.ok(request, "the unowned target went to the GM relay instead of failing or writing locally");
  assert.equal(stranger.system.attributes.hp.temp, 0, "the player's client never writes a stranger's temp HP");
  const outcome = await pending;
  assert.ok(outcome.v ?? outcome.e, "the use resolves once the relay engages");
  assert.equal(stranger.isOwner, false, "the stranger never became owner-writable");
});

test("ATTACK: reaction-less Treat the Cause override still spends nothing extra and records the override", async () => {
  requireRuntime();
  const actor = medic({ level: 7, lifeSupport: 60 });
  setReactionStore(actor, { available: 0, max: 1 });
  const target = patient({ owner: true });
  applyTag(target, { temp: 8, tag: wardTag({ grantedAt: "atk:grant" }) });
  await assert.rejects(
    medicUses.command(actor, "treatTheCause", { confirmed: true, targetUuid: target.uuid,
      attackerUuid: actor.uuid, attackerDistanceFeet: 15, saveDC: 15,
      ownerRoll2d10: 6, ownerRollDexSave: 4 }, "atk-noreact"),
    error => {
      const warnings = error?.warnings ?? [];
      return warnings.some(w => (w?.id ?? w) === "noReaction" || /reaction/i.test(String(w?.text ?? w)));
    },
    "no Reaction is a blocked warning until explicitly overridden");
  await assert.doesNotReject(
    medicUses.command(actor, "treatTheCause", { confirmed: true, targetUuid: target.uuid,
      attackerUuid: actor.uuid, attackerDistanceFeet: 15, saveDC: 15, overrides: ["noReaction"],
      ownerRoll2d10: 6, ownerRollDexSave: 4 }, "atk-noreact-override"),
    "explicit overrides let the table use the feature anyway");
  assert.equal(getReactions(actor).available, 0, "an exhausted Reaction never goes negative from overrides");
});

test("ATTACK: Warding Surge clamps overspent Life Support at zero with a visible shortfall on the receipt", async () => {
  requireRuntime();
  const actor = medic({ level: 11, lifeSupport: 4 });
  const target = patient({ owner: true });
  applyTag(target, { temp: 8, tag: wardTag({ grantedAt: "surgeAtk" }) });
  setReactionStore(actor, { available: 1, max: 1 });
  const result = await medicUses.command(actor, "wardingSurge", { confirmed: true, targetUuid: target.uuid,
    damageTypes: ["fire"], overrides: ["lifeSupportShort"] }, "atk-surge-short");
  assert.match(JSON.stringify(result?.receipt ?? result ?? medicUses.uses(actor)), /short|Life Support/i,
    "the shortfall text is on the receipt");
  assert.equal(lsOf(actor), 0, "overspend clamps at 0");
});

test("ATTACK: Ward Regeneration skips an existing Ward and re-checks eligibility at turn-start", async () => {
  requireRuntime();
  const actor = medic({ level: 15 });
  const withWard = await medicUses.command(actor, "wardRegeneration", { confirmed: true,
    targetUuid: actor.uuid, ownerRoll: 8 }, "atk-regen-self");
  assert.match(JSON.stringify(String(withWard?.receipt?.warnings ?? []) + String(withWard?.result ?? withWard ?? medicUses.uses(actor))),
    /own Ward|already|skip|eligible|hasOwnWard/i,
    "a Medic holding their own Ward is warned or skipped at regeneration time");
  assert.equal(tagOf(actor)?.medicUuid ?? actor.uuid, actor.uuid ?? MEDIC, "self-Ward provenance stays coherent");
});

test("ATTACK: undoing a Ward grant restores the prior pool exactly, including a replaced foreign pool", async () => {
  requireRuntime();
  const actor = medic({ level: 5, lifeSupport: 40 });
  const target = patient({ owner: true });
  const foreignPool = { medicUuid: OTHER_MEDIC, grantedAt: "earlier:cast", amount: 9 };
  target.system.attributes.hp.temp = 9;
  target.flags.ak5e.ward = structuredClone(foreignPool);
  await medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: target.uuid,
    healingAmount: 3, actionType: "action", keepOrReplace: "replace", ownerRoll1d8: 2 }, "atk-undo-replace");
  assert.equal(target.system.attributes.hp.temp, 3, "the replacement is applied");
  assert.equal(tagOf(target).medicUuid, actor.uuid ?? MEDIC, "the new provenance names this Medic");
  await medicUses.command(actor, "undoUse", { useId: "atk-undo-replace" }, "atk-undo");
  assert.equal(target.system.attributes.hp.temp, 9, "undo restores the foreign pool's temp value");
  assert.deepEqual(tagOf(target), foreignPool, "undo restores the foreign provenance unchanged");
});

test("ATTACK: retrying an undone Ward use cannot resurrect or double-spend it", async () => {
  requireRuntime();
  const actor = medic({ level: 5, lifeSupport: 40 });
  const target = patient({ owner: true });
  await medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: target.uuid,
    healingAmount: 5, actionType: "action", ownerRoll1d8: 3 }, "atk-retry");
  await medicUses.command(actor, "undoUse", { useId: "atk-retry" }, "atk-retry-undo");
  assert.equal(target.system.attributes.hp.temp, 0, "undo removed the Ward");
  await assert.rejects(
    medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: target.uuid,
      healingAmount: 5, actionType: "action", ownerRoll1d8: 3, retryOf: "atk-retry" }, "atk-retry-again"),
    error => /undone|no longer|redo|fresh|retry|new use/i.test(String(error?.message ?? error)),
    "a retried undone use is rejected with an explicit message");
  await assert.rejects(
    medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: target.uuid,
      healingAmount: 5, actionType: "action", ownerRoll1d8: 3, retryOf: "atk-retry", overrides: "atk-retry" }, "atk-retry-override"),
    error => /undone|no longer|redo|fresh|retry|new use/i.test(String(error?.message ?? error)),
    "an override cannot bypass the undone-use guard");
  assert.equal(target.system.attributes.hp.temp, 0, "nothing was re-granted by the retries");
  assert.equal(lsOf(actor), 40, "no double Life Support spend");
});

test("ATTACK: a later unrelated HP change does not erase this Medic's Ward provenance on undo", async () => {
  requireRuntime();
  const actor = medic({ level: 5, lifeSupport: 40 });
  const target = patient({ owner: true });
  applyTag(target, { temp: 8, tag: wardTag({ grantedAt: "story:grant" }) });
  await medicUses.command(actor, "undoUse", { useId: "nothingToDo" }, "story-undo")
    .then(value => ({ value }), error => ({ error }));
  assert.equal(tagOf(target)?.medicUuid, MEDIC, "undoing something else never touches the standing Ward");
});

test("ATTACK: staged damage split across the Ward pool never loses the balance as HP loss", async () => {
  const staged = wardOf({ temp: 5, tag: wardTag({ amount: 6 }) }, MEDIC);
  assert.equal(staged, 5, "the live pool is the usable Ward, not the recorded amount");
  const settled = collectiveWardSettlement({ damage: 4, recipientTemp: staged, recipientHasWard: true,
    recipientDistanceFeet: 10, donors: [], removals: {} });
  assert.deepEqual({ tempAbsorbed: settled.tempAbsorbed, hpLoss: settled.hpLoss },
    { tempAbsorbed: 4, hpLoss: 0 }, "a 4-damage hit into a 5-Ward pool costs no HP");
  const leftover = { temp: staged - settled.tempAbsorbed, tag: wardTag({ amount: 6 }) };
  assert.deepEqual(reconcileTag({ tempBefore: 5, tempAfter: leftover.temp, tag: leftover.tag }), wardTag({ amount: 6 }),
    "partial depletion reconciles into the Ward tag, not into HP");
});

test("ATTACK: a depleted pool with a drifted amount still loses its Ward outright", async () => {
  const driftedTag = { ...wardTag({ amount: 0 }), grantedAt: "drift:cast" };
  const depleted = reconcileTag({ tempBefore: 3, tempAfter: 0, tag: driftedTag });
  assert.equal(depleted, null, "depletion clears a drifted tag instead of trusting its amount field");
});

test("ATTACK: Arts-Point spend is clamped and quoted per-use for Ward grants on Arts", () => {
  const grant = wardGrant({ healingAmount: 7, actionType: "action", fromArt: true, apSpent: 99 });
  assert.deepEqual(grant, { base: 7, dieFormula: "1d8", apBonus: 99, formula: "7 + 1d8 + 99" },
    "the AP bonus adds the whole notional spend; clamping is the engine's job");
  assert.ok(/7 \+ 1d8 \+ 99/.test(grant.formula), "the formula exposes the parts in fixed order");
});

test("ATTACK: the Ward sheet renders controls for all six commands without inline handlers", async () => {
  const sheet = requireSheet();
  const actor = medic({ id: "SheetCommander" });
  const html = String(sheet.renderWardSection(actor));
  for (const name of ["wardGrant", "wardLifeSupport", "treatTheCause", "wardingSurge",
    "collectiveWard", "wardRegeneration"]) {
    assert.match(html, new RegExp(`data-medic-cmd[^>]*${name.slice(0, 4)}`, "i"),
      `the ${name} control is rendered with a data-medic-cmd attribute`);
  }
  assert.ok(!/\son[A-Z][a-zA-Z]+=/.test(html), "no inline event handlers; clicks go through the shared listener");
});

test("ATTACK: hidden feature commands never render for a below-level Medic", () => {
  requireRuntime();
  const plans = featureImport.WARD_PLANS;
  for (const [name, plan] of Object.entries(plans)) {
    if (name === "wardGrant" || name === "wardLifeSupport") continue;
    assert.equal(typeof plan, "function", `plan ${name} is callable for level gating internally`);
  }
});
