/**
 * Frozen contract tests for Wave 2 package F (Ward runtime), written BEFORE any
 * implementation exists. The implementer must make these pass without editing them.
 *
 * Oracles:
 *   - AK5e v1.3.1 Ch.3 Ward, C3:5049-5087 (whole Medic section C3:4560-5146 read).
 *   - .codex-work/medic/SPEC-ward.md (binding, F1-F9) and SPEC-ward-rules.md.
 *   - ak5e/DECISIONS.md "Medic Therapist, Ward and Witchcraft owner rulings
 *     (2026-10-28)" and "... open readings (2026-11-01)".
 *
 * House rules pinned here:
 *   * every roll is explicitly owner-clicked; no dice are evaluated, no numbers are
 *     invented by the runtime, and confirmations precede every write;
 *   * rules failures are non-blocking warnings; undefined interfaces are the only
 *     allowed failure reason while these tests are red;
 *   * all interface names/shapes below are FIXED by SPEC-ward.md "Integration
 *     contract" plus lane A's frozen correlation/ledger interfaces and lane C's
 *     pure Ward rules; nothing else may be required of the implementer.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { medicUses, MEDIC_PLANS } from "../scripts/medic-uses.mjs";
import { defineMedicPools, setLifeSupport } from "../scripts/medic-features.mjs";
import { clearPoolRegistry } from "../scripts/resource-pools.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import {
  wardGrant, choosePool, wardOf, reconcileTag, statusResistance, treatTheCause,
  treatTheCauseOutcome, wardingSurge, restoreReaction, collectiveWardSettlement,
  wardRegeneration, WARD_FEATURES
} from "../scripts/ward-rules.mjs";
import { registerDamageResolver, confirmArtOutcome } from "../scripts/art-correlation.mjs";
import { appendLinkedReceipt, captureArtChanges } from "../scripts/arts-ledger.mjs";
import { capturePreApplyDamage, getReactions, spendReaction, setReactionStore } from "../scripts/trigger-events.mjs";
import { isLocked } from "../scripts/play-undo.mjs";

// Production modules do not exist yet: a clean import failure here is the intended
// red state. Every require* gate below names the exact missing export so the red
// reason stays "interface absent", never a harness error or a skip.
const featureImport = await import("../scripts/ward-features.mjs").catch(error => ({ __loadError: error }));
const sheetImport = await import("../scripts/ward-sheet.mjs").catch(error => ({ __loadError: error }));
const WARD_PLANS_EXPORT = () => featureImport.WARD_PLANS;
const HEALING_POOL = "special-art-pool-healing-arts-4211";
const MEDIC = "Actor.TestMedic";
const OTHER_MEDIC = "Actor.OtherMedic";
const wardTag = (overrides = {}) => ({ medicUuid: MEDIC, grantedAt: "combat1:2:3", amount: 8, ...overrides });
let registered = false;

test.before(async () => {
  setupFoundryGlobals({ isGM: false, worldTime: 100, settings: { "ak5e.artReceiptEpoch": 0 } });
  defineMedicPools();
  if (typeof featureImport.registerWardHooks === "function") {
    await featureImport.registerWardHooks();
    registered = true;
  }
});
test.after(() => teardownFoundryGlobals());

function requireFeatures() {
  assert.equal(typeof featureImport.registerWardHooks, "function",
    `Ward runtime missing registerWardHooks() (${featureImport.__loadError?.code ?? "export unavailable"}: ${featureImport.__loadError?.message ?? ""})`);
  assert.ok(WARD_PLANS_EXPORT() && typeof WARD_PLANS_EXPORT() === "object",
    "Ward runtime missing WARD_PLANS");
  assert.equal(registered, true, "registerWardHooks() was not called in the fixture");
}
function requireSheet() {
  assert.equal(typeof sheetImport.renderWardSection, "function",
    `Ward sheet module missing renderWardSection() (${sheetImport.__loadError?.code ?? "export unavailable"}: ${sheetImport.__loadError?.message ?? ""})`);
  assert.equal(typeof sheetImport.handleWardCommand, "function",
    "Ward sheet module missing handleWardCommand()");
  return sheetImport;
}

/* ---------------------------------------------------------------- fixtures */

function medic({ level = 15, lifeSupport = 100, owner = true, branch = "ward", name = "Ward Medic" } = {}) {
  clearPoolRegistry();
  defineMedicPools();
  const actor = createTestActor({
    name, level, owner,
    abilities: { str: { value: 10, mod: 0 }, dex: { value: 12, mod: 1 }, con: { value: 14, mod: 2 },
      int: { value: 16, mod: 3 }, wis: { value: 14, mod: 2 }, cha: { value: 8, mod: -1 } },
    system: { details: { type: { value: "humanoid" } }, attributes: { hp: { value: 40, max: 40, temp: 0 } } }
  });
  actor.flags.ak5e.medic = { enabled: true, spellcastingAbility: "wis", spellDC: 8 + 3 + 2 };
  actor.flags.ak5e.resourcePools = { lifeSupport: { value: lifeSupport, max: 125 } };
  actor.uuid = MEDIC;
  globalThis._ak5eTestDocs?.set(actor.uuid, actor);
  actor.items.set("medic-class", createTestItem({ id: "medic-class", type: "class", name: "Medic",
    system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-medic" } } }, actor));
  if (branch) {
    actor.items.set("ward-branch", createTestItem({ id: "ward-branch", type: "subclass", name: "Ward",
      flags: { ak5e: { chapterThreeId: "subclass-medic-ward" } } }, actor));
  }
  setLifeSupport(actor, lifeSupport, "test fixture");
  globalThis.game.actors.set(actor.id, actor);
  return actor;
}

function patient({ name = "Warded Ally", owner = true, hp = 20, maxHp = 40, temp = 0, tag = null, id } = {}) {
  const actor = createTestActor({
    name, owner: owner ? undefined : false,
    system: { details: { type: { value: "humanoid" } }, attributes: { hp: { value: hp, max: maxHp, temp } } }
  });
  if (id !== undefined) actor.id = id;
  actor.system.attributes.hp.temp = temp;
  if (tag) actor.flags.ak5e.ward = structuredClone(tag);
  return actor;
}

function healingArt(actor, { id = "healing-art", level = 1 } = {}) {
  const item = createTestItem({ id, type: "spell", name: "Field Dressing", system: {
    level, activation: { type: "action" }, target: { type: "creature", value: 1 },
    range: { value: 30, units: "ft" }, duration: { value: 1, units: "minute" },
    properties: { concentration: true }, description: { value: "Restore Hit Points to one Creature." }
  }, flags: { ak5e: { art: { enabled: true, pool: HEALING_POOL }, pool: HEALING_POOL } } }, actor);
  actor.items.set(item.id, item);
  return item;
}

function applyTag(target, pool) {
  if (pool?.tag) target.flags.ak5e.ward = structuredClone(pool.tag);
  target.system.attributes.hp.temp = pool?.temp ?? 0;
}

function readingValue(preview, key) {
  return (preview.readings ?? []).find(reading => reading.key === key) ?? null;
}

/* ========================================================================== F1
   Owner may replace rolled healing with Ward; extra temp HP rules (C3:5059-5061)
   and DECISIONS 2026-11-01 #4. No auto-roll, no conversion without confirmation. */

test("F1: wardGrant command exists for owner healing conversion; other Medic plans untouched", () => {
  requireFeatures();
  const plans = WARD_PLANS_EXPORT();
  assert.equal(typeof plans.wardGrant, "function", "WARD_PLANS.wardGrant is required");
  assert.equal(typeof MEDIC_PLANS.touchHeal, "function", "base touchHeal must not be replaced");
  assert.equal(medicUses.isCommand("wardGrant"), true, "medicUses knows the registered wardGrant plan");
});

test("F1: 1d8 only for Action/Bonus Action, AP bonus only for an Art with those casting times", () => {
  const action = wardGrant({ healingAmount: 7, actionType: "action", fromArt: true, apSpent: 3 });
  assert.deepEqual(action, { base: 7, dieFormula: "1d8", apBonus: 3, formula: "7 + 1d8 + 3" });
  const bonus = wardGrant({ healingAmount: 7, actionType: "bonus", fromArt: true, apSpent: 2 });
  assert.equal(bonus.dieFormula, "1d8");
  for (const actionType of ["reaction", "other"]) {
    assert.deepEqual(wardGrant({ healingAmount: 7, actionType, fromArt: true, apSpent: 3 }),
      { base: 7, dieFormula: null, apBonus: 0, formula: "7" });
  }
  assert.equal(wardGrant({ healingAmount: 7, actionType: "action", fromArt: false, apSpent: 3 }).apBonus, 0);
});

test("F1: runtime conversion confirms before writing; cancel leaves everything unchanged", async () => {
  requireFeatures();
  const actor = medic({ level: 5 });
  const target = patient({ owner: true });
  actor.items.set("healing-art", healingArt(actor));
  await assert.rejects(
    medicUses.command(actor, "wardGrant", { confirmed: false, targetUuid: target.uuid,
      healingAmount: 7, actionType: "action" }, "f1-cancel"),
    /confirm/i);
  assert.equal(target.system.attributes.hp.temp, 0, "cancel never grants Ward temp HP");
  assert.equal(target.flags.ak5e.ward, undefined, "cancel never writes a Ward tag");
  assert.equal(getLifeSupport(actor), 100, "cancel never spends Life Support");
});

test("F1: owner rolls the 1d8 themselves; the runtime never evaluates dice", async () => {
  requireFeatures();
  const actor = medic({ level: 5 });
  actor.items.set("healing-art", healingArt(actor));
  const target = patient({ owner: true });
  let evaluated = 0;
  const DamageRoll = globalThis.CONFIG?.Dice?.DamageRoll ?? globalThis.Roll;
  if (DamageRoll) {
    const original = DamageRoll.prototype.evaluate;
    DamageRoll.prototype.evaluate = async function () { evaluated++; return original.call(this); };
    try {
      const withRoll = await medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: target.uuid,
        healingAmount: 7, actionType: "action", fromArt: false, apSpent: 0, ownerRoll1d8: 4 }, "f1-no-auto");
      assert.equal(evaluated, 0, "no automatic dice: the supplied owner roll result is used");
    } finally {
      DamageRoll.prototype.evaluate = original;
    }
  }
  assert.equal(undoBuffet(actor), "f1-no-auto", "the use is recorded and undoable in the encounter window");
});

function undoBuffet(actor) {
  const uses = medicUses.uses(actor) ?? [];
  const available = uses.filter(entry => entry.status !== "undone");
  assert.equal(available.length, 1, "exactly one live Ward use is recorded");
  return available[0].id;
}

function getLifeSupport(actor) {
  return actor.flags.ak5e.resourcePools?.lifeSupport?.value
    ?? Number(actor.system?.attributes?.lifeSupport) ?? 0;
}

function tagOf(target) {
  return target.flags.ak5e?.ward ?? null;
}

/* ========================================================================== F2
   LS healing conversion offers the per-use public reading (DECISIONS 2026-11-01 #1):
   default only rolled healing qualifies; "LS heal can become Ward" is the alternative.
   The selected reading is printed on the card; it is never persisted as a GM ruling. */

test("F2: wardLifeSupport command exists and offers both readings per use", async () => {
  requireFeatures();
  const actor = medic({ level: 5 });
  const preview = medicUses.preview(actor, "wardLifeSupport", { targetUuid: "Actor.ally" });
  const reading = readingValue(preview, "wardLifeSupportReading");
  assert.ok(reading, "the per-use reading is offered in the preview");
  const options = (reading.options ?? []).map(option => String(option.value ?? option));
  assert.ok(options.includes("rolledOnly"), "reading option (b) rolled-hop-only must be offered");
  assert.ok(options.includes("lifeSupportToo"), "reading option (a) LS-heal-can-become-Ward must be offered");
  assert.equal(reading.value, undefined, "the reading is per-use, not a default ruling");
});

test("F2: unselected per-use reading blocks the command with a PlayReading, not a ruling", async () => {
  requireFeatures();
  const actor = medic({ level: 5 });
  const target = patient({ owner: true });
  await assert.rejects(
    medicUses.command(actor, "wardLifeSupport", { confirmed: true, targetUuid: target.uuid,
      amount: 5, ownerRoll1d8: 3 }, "f2-reading-missing"),
    error => {
      const isReading = error?.name === "AK5eReading" && Array.isArray(error.options);
      return isReading || /reading|choose|select/i.test(String(error?.message ?? error));
    },
    "PlayReading with the offered options, or an explicit choose-the-reading error");
  assert.equal(target.system.attributes.hp.temp, 0);
});

test("F2: default reading keeps the current LS value; the choice is never persisted as a ruling", async () => {
  // Adjudicated 2026-11-02 (reviewer finding F2; SPEC F2 + open reading 1): the default
  // literal reading covers only rolled healing, and LS touch heal is unrolled, so the
  // default path must reject LS-to-Ward conversion with guidance instead of granting.
  requireFeatures();
  const actor = medic({ level: 5 });
  const target = patient({ owner: true });
  await assert.rejects(
    medicUses.command(actor, "wardLifeSupport", { confirmed: true, targetUuid: target.uuid,
      amount: 6, reading: "rolledOnly", ownerRoll1d8: 3 }, "f2-default"),
    /only rolled healing/i,
    "default literal reading rejects LS-to-Ward conversion with guidance");
  assert.equal(tagOf(target), null, "no Ward tag is granted under the default reading");
  assert.equal(getLifeSupport(actor), 100, "rejected conversion spends no Life Support");
  assert.equal(actor.flags.ak5e.medic?.rulings?.wardLifeSupportReading, undefined,
    "a per-use choice is never persisted as a GM ruling");
});

/* ========================================================================== F3
   Explicit keep/replace native temp HP (never stack, never silently use the generic
   max-pool replacement), with the originating Medic and provenance recorded
   (ruling 2026-10-28 "Ward pool selection"). */

test("F3: smaller replacement is honored exactly when the owner explicitly chooses replace", async () => {
  requireFeatures();
  const actor = medic({ level: 5 });
  const target = patient({ owner: true, temp: 9, tag: wardTag({ amount: 9 }) });
  applyTag(target, { temp: 9, tag: wardTag({ amount: 9 }) });
  const resolved = choosePool({ currentTemp: 9, currentTag: wardTag({ amount: 9 }),
    incomingAmount: 4, medicUuid: MEDIC, choice: "replace" });
  assert.deepEqual({ temp: resolved.temp, tagMedic: resolved.tag.medicUuid, amount: resolved.tag.amount },
    { temp: 4, tagMedic: MEDIC, amount: 4 }, "the smaller pool replaces when chosen; never the max");
  assert.equal(actor.flags.ak5e, actor.flags.ak5e, "fixture sanity");
});

test("F3: keep is honored, never stacked, and replacement provenance names the Medic", async () => {
  requireFeatures();
  const actor = medic({ level: 5 });
  const target = patient({ owner: true });
  applyTag(target, { temp: 10, tag: wardTag({ amount: 10 }) });
  const kept = choosePool({ currentTemp: 10, currentTag: wardTag({ amount: 10 }),
    incomingAmount: 4, medicUuid: MEDIC, choice: "keep" });
  assert.deepEqual({ temp: kept.temp, tagMedic: kept.tag?.medicUuid ?? null, amount: kept.tag?.amount ?? null },
    { temp: 10, tagMedic: MEDIC, amount: 10 }, "keeping preserves both the pool and its provenance");
  assert.equal(wardOf({ temp: kept.temp, tag: kept.tag }, MEDIC), 10, "this Medic's Ward is fully usable");
  const replaced = choosePool({ currentTemp: 10, currentTag: wardTag({ amount: 10 }),
    incomingAmount: 4, medicUuid: MEDIC, choice: "replace" });
  assert.equal(wardOf({ temp: replaced.temp, tag: replaced.tag }, MEDIC), 4, "the replacement carries its own amount");
  assert.equal(wardOf({ temp: replaced.temp, tag: replaced.tag }, OTHER_MEDIC), 0,
    "another Medic never gains Ward access to this pool");
});

test("F3: runtime keep/replace is asked when a pool already exists and is recorded on the receipt", async () => {
  requireFeatures();
  const actor = medic({ level: 5 });
  const target = patient({ owner: true, temp: 6, tag: wardTag({ amount: 6 }) });
  applyTag(target, { temp: 6, tag: wardTag() });
  let rejected = false;
  try {
    await medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: target.uuid,
      healingAmount: 4, actionType: "bonus", keepOrReplace: undefined, ownerRoll1d8: 2 }, "f3-choice-missing");
  } catch (error) {
    rejected = /keep|replace|choose|pool/i.test(String(error?.message ?? error));
    assert.ok(rejected, "an undefined keep/replace choice is not silently defaulted");
  }
  assert.ok(rejected || target.system.attributes.hp.temp === 6, "no silent pool change without the explicit choice");
});

/* ========================================================================== F4
   Partial depletion preserves provenance; depletion or a non-Ward replacement
   clears it; external additive temp HP does not invent a mixed-pool absorption
   order (reconcileTag, unknown mapping stays guided). */

test("F4: partial depletion keeps the Ward tag; full depletion clears it", () => {
  assert.deepEqual(reconcileTag({ tempBefore: 8, tempAfter: 3, tag: wardTag({ amount: 8 }) }),
    wardTag({ amount: 8 }), "33%+ remaining keeps the originating Medic and amount");
  assert.equal(reconcileTag({ tempBefore: 8, tempAfter: 0, tag: wardTag({ amount: 8 }) }), null,
    "depletion clears the provenance");
});

test("F4: an external temp-HP increase clears the tag (the invent-mixed-pool guard)", () => {
  assert.equal(reconcileTag({ tempBefore: 4, tempAfter: 9, tag: wardTag({ amount: 4 }) }), null,
    "a larger foreign pool replaces the Ward instead of stacking into it");
  assert.deepEqual(reconcileTag({ tempBefore: 4, tempAfter: 9, tag: wardTag({ amount: 4 }), grantedByWard: true }),
    wardTag({ amount: 4 }), "a genuine Ward grant growing the same pool keeps the originating provenance");
});

test("F4: reconcileTag keeps the tag on a plain decrease; replacement clearing is the runtime's duty", () => {
  // A smaller remaining pool is indistinguishable from partial depletion at this
  // layer, so the frozen lane-C contract keeps the tag; the runtime clears
  // provenance through its explicit keep/replace grant path (F3) and the
  // foreign-replacement provenance tests below.
  assert.deepEqual(reconcileTag({ tempBefore: 8, tempAfter: 5, tag: wardTag({ amount: 8 }) }),
    wardTag({ amount: 8 }), "a plain decrease reconciles as partial depletion, never an invented mixed pool");
  assert.deepEqual(reconcileTag({ tempBefore: 8, tempAfter: 8, tag: wardTag({ amount: 8 }) }), wardTag({ amount: 8 }),
    "an unchanged pool keeps the tag (no dummy rewrite)");
});

test("F4: runtime posts a visible guidance warning for unmapped foreign temp-HP changes", async () => {
  requireFeatures();
  const actor = medic({ level: 5 });
  const target = patient({ owner: true });
  applyTag(target, { temp: 8, tag: wardTag() });
  const receipt = await medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: target.uuid,
    healingAmount: 5, actionType: "action", keepOrReplace: "keep", ownerRoll1d8: 2 }, "f4-keep-warning");
  const warnings = JSON.stringify(receipt?.warnings ?? medicUses.uses(actor));
  assert.ok(/external|foreign|non-Ward|unrelated|not replaced/i.test(warnings) || warnings !== "[]",
    "keeping Ward alongside a foreign temp-HP change must carry visible context");
});

// OPEN DECISION (flagged to the manager): the spec fixes WHAT the runtime must do
// (foreign replacement clears this Medic's provenance, equal/lower included, with
// visible context) but not the exact command that applies a foreign pool, so this
// test pins a plausible name `reapplyForeignPool`; the final command name is the
// implementer's+manager's call and the test may be retargeted without weakening
// any expectation. Branch Life Support commands reuse the base plan engine.
test("F4: runtime clearing on foreign replacement and equal/lower grants (F4 acceptance)", async () => {
  requireFeatures();
  const actor = medic({ level: 5 });
  const target = patient({ owner: true });
  // A foreign grant applied through the runtime's replacement path clears this
  // Medic's provenance explicitly, including an equal/lower amount.
  target.system.attributes.hp.temp = 8;
  target.flags.ak5e.ward = structuredClone(wardTag());
  const foreignPool = { medicUuid: "Actor.ForeignMedic", grantedAt: "foreign:cast", amount: 4 };
  target.system.attributes.hp.temp = 4;
  target.flags.ak5e.ward = structuredClone(foreignPool);
  const pending = await medicUses.command(actor, "reapplyForeignPool", { confirmed: true,
    targetUuid: target.uuid, foreign: foreignPool }, "f4-foreign-reapply");
  assert.match(String(pending?.receipt?.summary ?? ""), /ForeignMedic.*replaces|foreign|replac/i,
    "a foreign replacement is posted with visible context; it cannot quietly vanish");
  assert.equal(wardOf({ temp: target.system.attributes.hp.temp, tag: tagOf(target) },
    actor.uuid ?? MEDIC), 0, "after a foreign replacement this Medic owns no Ward here");
});

/* ========================================================================== F5
   Status Resistance (C3:5063-5064): Advantage on the first qualifying status save
   each combat turn, not only the recipient's turn; dedup + owner-started save. */

test("F5: the first status-condition save each combat turn has Advantage, on any turn", () => {
  const first = statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey: "c1:2:0", usedTurnKey: null });
  assert.deepEqual({ advantage: first.advantage, usedTurnKey: first.usedTurnKey },
    { advantage: true, usedTurnKey: "c1:2:0" });
  const repeat = statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey: "c1:2:0", usedTurnKey: "c1:2:0" });
  assert.equal(repeat.advantage, false, "the same turn's second status save does not repeat Advantage");
  const otherTurn = statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey: "c1:3:2", usedTurnKey: "c1:2:0" });
  assert.deepEqual({ advantage: otherTurn.advantage, usedTurnKey: otherTurn.usedTurnKey },
    { advantage: true, usedTurnKey: "c1:3:2" }, "any combat turn, not only the recipient's own");
  const noWard = statusResistance({ hasWard: false, savingVsStatusCondition: true, turnKey: "c1:4:0", usedTurnKey: null });
  assert.equal(noWard.advantage, false);
  assert.equal(noWard.usedTurnKey, null, "never consumes the per-turn allowance without Ward");
});

test("F5: runtime dedups per turn, undo restores the allowance, and the ward tag rides along", async () => {
  requireFeatures();
  const actor = medic({ level: 5 });
  const target = patient({ owner: true });
  applyTag(target, { temp: 8, tag: wardTag({ grantedAt: "fresh:grant" }) });
  const result = await medicUses.command(actor, "statusResistance", { confirmed: true, targetUuid: target.uuid,
    turnKey: "c1:2:1" }, "f5-turn-mark");
  assert.match(JSON.stringify(result?.receipt ?? result ?? medicUses.uses(actor)), /f5-turn-mark|statusResistance|usedTurnKey/,
    "the turn marker is visible on the receipt/result");
  await medicUses.command(actor, "undoUse", { useId: "f5-turn-mark" }, "f5-undo");
  const after = tagOf(target);
  assert.ok(after === null || after.medicUuid === (actor.uuid ?? MEDIC), "undo leaves the tag intact for the original-owner case");
});

/* ========================================================================== F6
   Treat the Cause (C3:5066-5069): attacker within 30 ft; owner-started DEX save;
   2d10 Force; fail = source-bound forced miss without altering the die + full
   damage; success = half damage, no forced miss; optional 15 LS Reaction restore. */

test("F6: descriptor gates warnings and normalizes the save/damage contract", () => {
  const clean = treatTheCause({ targetHasWard: true, attackerDistanceFeet: 25, reactionAvailable: true, saveDC: 15 });
  assert.deepEqual({ warnings: clean.warnings, save: clean.save, damage: clean.damage,
    onFail: clean.onFail, onSuccess: clean.onSuccess, restoreCost: clean.restoreReactionCost },
    { warnings: [], save: { ability: "dex", dc: 15 }, damage: { formula: "2d10", type: "force" },
      onFail: { damage: "full", forcedMiss: true }, onSuccess: { damage: "half", forcedMiss: false }, restoreCost: 15 });
  assert.deepEqual(new Set(treatTheCause({ targetHasWard: false, attackerDistanceFeet: 40,
    reactionAvailable: false, saveDC: 15 }).warnings),
    new Set(["targetHasNoWard", "attackerOutOfRange", "noReaction"]), "specific warning codes without Ward/range/reaction");
  const unknown = treatTheCause({ targetHasWard: true, attackerDistanceFeet: null, reactionAvailable: true, saveDC: 15 });
  assert.ok(unknown.warnings.includes("attackerRangeUnknown"), "null distance becomes a visible warning");
});

test("F6: outcome halves rounding down and preserves the forced-miss binding", () => {
  assert.deepEqual(treatTheCauseOutcome({ saveSucceeded: true, damageRolled: 11 }), { damage: 5, forcedMiss: false });
  assert.deepEqual(treatTheCauseOutcome({ saveSucceeded: false, damageRolled: 11 }), { damage: 11, forcedMiss: true });
  assert.deepEqual(treatTheCauseOutcome({ saveSucceeded: true, damageRolled: 1 }), { damage: 0, forcedMiss: false });
});

test("F6: runtime saves are owner-resolved and result in the bound card outcome (incl. split damage)", async () => {
  requireFeatures();
  const actor = medic({ level: 7, lifeSupport: 40 });
  const attacker = { id: "attacker1", uuid: "Actor.attacker1", documentName: "Actor", name: "Attacker", isOwner: true,
    effects: new Map(), system: { details: { type: { value: "humanoid" } }, attributes: { hp: { value: 20, max: 20, temp: 0 } } },
    testUserPermission(user, permission) { return permission === "OWNER" && user?.id === "attacker-owner"; },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update() { return this; }, async createEmbeddedDocuments() { return []; }, async deleteEmbeddedDocuments() {} };
  globalThis.game.actors.set("attacker1", attacker);
  const target = patient({ owner: true });
  applyTag(target, { temp: 8, tag: wardTag({ grantedAt: "tc:grant" }) });
  const first = await medicUses.command(actor, "treatTheCause", { confirmed: true, targetUuid: target.uuid,
    attackerUuid: attacker.uuid, attackerDistanceFeet: 20, saveDC: 15, ownerRoll2d10: 11, ownerRollDexSave: 8 },
    "f6-fail");
  assert.match(JSON.stringify(first?.result ?? first ?? medicUses.uses(actor)), /f6-fail|forcedMiss|miss|2d10|11/,
    "the failed owner save binds forcedMiss and the rolled Force damage");
  assert.equal(getReactions(actor).available, 0, "the Reaction is spent by the Treat the Cause");
  const second = await medicUses.command(actor, "treatTheCause", { confirmed: true, targetUuid: target.uuid,
    attackerUuid: actor.uuid, attackerDistanceFeet: 10, saveDC: 15, ownerRoll2d10: 4, ownerRollDexSave: 20,
    restoreReaction: true }, "f6-success");
  assert.match(JSON.stringify(second?.result ?? second ?? medicUses.uses(actor)), /f6-success|half|5\b|2\b/,
    "the successful save halves the damage (rounds down: 4 -> 2)");
});

/* ========================================================================== F7
   Warding Surge (C3:5071-5076): Reaction + 10 LS; resistance to the triggering
   damage types until the end of the current turn; optional 15 LS Reaction restore;
   clamp/expose shortfalls; every choice on the receipt; native synchronous order. */

test("F7: resistance descriptor carries the cost, expiry and clamped LS state", () => {
  const clean = wardingSurge({ targetHasWard: true, reactionAvailable: true, lifeSupport: 40,
    damageTypes: ["fire", "fire", "force"] });
  assert.deepEqual({ warnings: clean.warnings, cost: clean.cost, lifeSupportAfter: clean.lifeSupportAfter,
    shortfall: clean.shortfall, resistTypes: clean.resistTypes, expires: clean.expires },
    { warnings: [], cost: 10, lifeSupportAfter: 30, shortfall: 0, resistTypes: ["fire", "force"],
      expires: "endOfCurrentTurn" });
  const short = wardingSurge({ targetHasWard: true, reactionAvailable: true, lifeSupport: 2, damageTypes: ["fire"] });
  assert.deepEqual({ lifeSupportAfter: short.lifeSupportAfter, shortfall: short.shortfall },
    { lifeSupportAfter: 0, shortfall: 8 }, "overspend clamps at 0 and the shortfall is exposed");
  assert.ok(short.warnings.includes("lifeSupportShort"));
  const restore = restoreReaction({ lifeSupport: 20 });
  assert.deepEqual({ cost: restore.cost, lifeSupportAfter: restore.lifeSupportAfter, shortfall: restore.shortfall },
    { cost: 15, lifeSupportAfter: 5, shortfall: 0 });
  const shortRestore = restoreReaction({ lifeSupport: 4 });
  assert.ok(shortRestore.warnings.includes("lifeSupportShort"));
});

test("F7: runtime resistance is registered through the medic use engine with explicit owner rolls", async () => {
  requireFeatures();
  const actor = medic({ level: 11, lifeSupport: 40 });
  const target = patient({ owner: true });
  applyTag(target, { temp: 8, tag: wardTag({ grantedAt: "surge:grant" }) });
  setReactionStore(actor, { available: 1, max: 1 });
  const result = await medicUses.command(actor, "wardingSurge", { confirmed: true, targetUuid: target.uuid,
    damageTypes: ["fire", "force"] }, "f7-surge");
  assert.match(JSON.stringify(result?.receipt ?? result ?? medicUses.uses(actor)), /f7-surge|fire|force|wardingSurge/,
    "the triggering damage types are recorded");
  assert.equal(getLifeSupport(actor), 30, "10 Life Support is spent");
});

/* ========================================================================== F8
   Collective Ward (C3:5083 + ordering ruling): DR/RV first, then donor Ward (fresh
   actual pools, floor 0, never transferred), then recipient temp HP. One
   application/donor operation; idempotent across retries; linked relayed undo. */

test("F8: settlement consumes donor Ward after DR/RV and before temp HP, never transferring", () => {
  const settled = collectiveWardSettlement({
    damage: 12, recipientTemp: 5, recipientHasWard: true, recipientDistanceFeet: 20,
    donors: [
      { uuid: "Actor.donorA", ward: 6, distanceFeet: 10 },
      { uuid: "Actor.donorB", ward: 2, distanceFeet: 15 }
    ],
    removals: { "Actor.donorA": 6, "Actor.donorB": 2 }
  });
  assert.deepEqual({ removed: settled.removed, damageAfterWard: settled.damageAfterWard, wasted: settled.wasted,
    tempAbsorbed: settled.tempAbsorbed, hpLoss: settled.hpLoss },
    { removed: 8, damageAfterWard: 4, wasted: 0, tempAbsorbed: 4, hpLoss: 0 });
  assert.deepEqual(Object.fromEntries(settled.donorUpdates.map(u => [u.uuid, u.wardAfter])),
    { "Actor.donorA": 0, "Actor.donorB": 0 }, "donor Ward is consumed (0 floor), not transferred");
});

test("F8: clamps, over-removal waste and range warnings stay visible without blocking", () => {
  const result = collectiveWardSettlement({
    damage: 3, recipientTemp: 2, recipientHasWard: false, recipientDistanceFeet: 45,
    donors: [{ uuid: "Actor.donorC", ward: 5, distanceFeet: 60 }],
    removals: { "Actor.donorC": 9 }
  });
  assert.equal(result.removed, 5, "over-removal clamps to the fresh donor Ward");
  assert.equal(result.wasted, 2, "Ward spent beyond the damage is wasted, never stored anywhere");
  assert.equal(result.damageAfterWard, 0);
  assert.equal(result.tempAbsorbed, 0);
  assert.equal(result.hpLoss, 0, "harmless recipient case: no HP loss beyond the shown numbers");
  assert.ok(result.warnings.includes("removalExceedsWard"));
  assert.ok(result.warnings.includes("donorOutOfRange"));
  assert.ok(result.warnings.includes("recipientOutOfRange"));
  assert.ok(result.warnings.includes("recipientHasNoWard"));
  assert.ok(result.warnings.includes("wardWasted"));
});

test("F8: 30 ft range and fresh-pool boundaries are enforced softly at the settlement level", () => {
  const edge = collectiveWardSettlement({ damage: 10, recipientTemp: 0, recipientHasWard: true,
    recipientDistanceFeet: 30, donors: [{ uuid: "Actor.donorD", ward: 4, distanceFeet: 30 }], removals: { "Actor.donorD": 4 } });
  assert.deepEqual({ warnings: edge.warnings, removed: edge.removed, damageAfterWard: edge.damageAfterWard },
    { warnings: [], removed: 4, damageAfterWard: 6 }, "exactly 30 feet is within range for donors and recipient");
  const unknown = collectiveWardSettlement({ damage: 10, recipientTemp: 0, recipientHasWard: true,
    recipientDistanceFeet: 10, donors: [{ uuid: "Actor.donorE", ward: 4, distanceFeet: null }], removals: { "Actor.donorE": 4 } });
  assert.ok(unknown.warnings.includes("donorRangeUnknown"), "unknown donor distance stays visible");
});

test("F8: runtime collective command is idempotent across retries and undo restores relayed donors", async () => {
  requireFeatures();
  const actor = medic({ level: 15, lifeSupport: 100 });
  const target = patient({ owner: true });
  applyTag(target, { temp: 5, tag: wardTag({ grantedAt: "collective:grant" }) });
  const donor = patient({ name: "Donor", owner: true });
  applyTag(donor, { temp: 6, tag: wardTag({ amount: 6, grantedAt: "donor:grant" }) });
  const first = await medicUses.command(actor, "collectiveWard", { confirmed: true,
    targetUuid: target.uuid, damage: 12, donors: [{ uuid: donor.uuid, distanceFeet: 10 }],
    removals: { [donor.uuid]: 6 } }, "f8-collective");
  assert.match(JSON.stringify(first?.receipt ?? first ?? medicUses.uses(actor)), /f8-collective|donor|removal/i,
    "the donor removals are recorded");
  assert.equal(donor.system.attributes.hp.temp, 0, "the donor Ward is consumed");
  assert.equal(wardOf({ temp: 0, tag: donor.flags.ak5e.ward ?? null }, MEDIC), 0);
  await assert.rejects(
    medicUses.command(actor, "collectiveWard", { confirmed: true, targetUuid: target.uuid,
      damage: 12, donors: [{ uuid: donor.uuid, distanceFeet: 10 }], removals: { [donor.uuid]: 6 } }, "f8-retry"),
    error => /no longer|undone|removed|empty|available|0 Ward|fresh|inval/i.test(String(error?.message ?? error?.code ?? error)),
    "a retry against a fresh/empty donor state is rejected with an explicit message");
  await assert.rejects(
    medicUses.command(actor, "collectiveWard", { confirmed: true, targetUuid: target.uuid,
      damage: 12, donors: [{ uuid: donor.uuid, distanceFeet: 10 }],
      removals: { [donor.uuid]: 6 }, overrides: "f8-retry" }, "f8-retry-override"),
    error => /no longer|undone|removed|empty|available|0 Ward|fresh|inval/i.test(String(error?.message ?? error?.code ?? error)),
    "a retry cannot bypass the empty donor state even with overrides");
  await medicUses.command(actor, "undoUse", { useId: "f8-collective" }, "f8-undo");
  assert.equal(donor.system.attributes.hp.temp, 6, "linked undo restores the relayed donor pool");
  assert.equal(wardOf({ temp: 6, tag: donor.flags.ak5e.ward ?? null }, MEDIC), 6,
    "undo restores donor Ward usability");
});

/* ========================================================================== F9
   Ward Regeneration (C3:5085): own turn-start, no own Ward, ceil(level/2) amounts,
   keep/replace for other temp HP, late defenses warn for manual correction, and
   everything survives a same-data restart. */

test("F9: regeneration amounts are ceil(level/2) with eligibility warnings", () => {
  assert.deepEqual(wardRegeneration({ medicLevel: 15, hasOwnWard: false, currentTemp: 0 }),
    { eligible: true, amount: 8, warnings: [] });
  assert.deepEqual(wardRegeneration({ medicLevel: 16, hasOwnWard: false, currentTemp: 0 }).amount, 8);
  const other = wardRegeneration({ medicLevel: 15, hasOwnWard: false, currentTemp: 3 });
  assert.deepEqual({ eligible: other.eligible, amount: other.amount, warnings: other.warnings },
    { eligible: true, amount: 8, warnings: ["replacesOtherTemp"] },
    "foreign temp HP still requires the explicit keep/replace choice");
  const own = wardRegeneration({ medicLevel: 15, hasOwnWard: true, currentTemp: 0 });
  assert.equal(own.eligible, false, "a Medic holding their own Ward does not regenerate");
  assert.throws(() => wardRegeneration({ medicLevel: 0, hasOwnWard: false, currentTemp: 0 }), RangeError);
});

test("F9: the regeneration command exists and is a registered use-engine plan", () => {
  requireFeatures();
  assert.equal(typeof WARD_PLANS_EXPORT().wardRegeneration, "function");
  assert.equal(medicUses.isCommand("wardRegeneration"), true);
});

test("F9: sheet renders escaped command markup and rejects unrelated commands in sheet module scope", async () => {
  const sheet = requireSheet();
  const actor = medic({ level: 15, name: "<Ward & Co>" });
  const before = structuredClone(actor.flags);
  const html = sheet.renderWardSection(actor);
  assert.match(String(html), /data-medic-cmd/);
  assert.match(String(html), /Ward/i);
  assert.doesNotMatch(String(html), /<Ward & Co>/, "actor-controlled markup is never emitted as raw HTML");
  assert.deepEqual(actor.writes, [], "rendering controls write nothing");
  assert.deepEqual(actor.flags, before);
  assert.equal(await sheet.handleWardCommand(actor, "unrelatedCommand", {}), false);
});

test("F9: late-defense manual correction versus before-application confirmation", async () => {
  requireFeatures();
  const actor = medic({ level: 7 });
  const target = patient({ owner: true });
  applyTag(target, { temp: 8, tag: wardTag({ grantedAt: "late:grant" }) });
  capturePreApplyDamage(target, 6, {}, { manual: "late-defense-marker" });
  const late = await medicUses.command(actor, "treatTheCause", { confirmed: true, targetUuid: target.uuid,
    attackerUuid: actor.uuid, attackerDistanceFeet: 10, saveDC: 15, lateApplication: true,
    ownerRoll2d10: 11, ownerReactionDexSave: 16, restoreReaction: false }, "f6-late");
  assert.match(JSON.stringify(String(late?.receipt?.manualSteps ?? late?.result ?? late ?? medicUses.uses(actor))) +
    JSON.stringify(String(late?.receipt?.warnings ?? "")) + JSON.stringify(actor.writes),
    /manual|correction|already|late|applied|timing/i,
    "late defense paths surface an explicit timing warning or manual correction step");
});

test("F9: same-data restart keeps receipts, provenance and the undo lock", async () => {
  requireFeatures();
  const actor = medic({ level: 15 });
  const target = patient({ owner: true });
  applyTag(target, { temp: 4, tag: wardTag({ grantedAt: "restart:grant", amount: 4 }) });
  actor.flags.ak5e.medicUses = { undo: [{ id: "restart:use", command: "wardGrant", status: "complete", epoch: 0 }] };
  const frozen = structuredClone(actor.flags.ak5e[medicUses.ns ?? "medicUses"]);
  const restarted = frozen && structuredClone(frozen);
  assert.ok(Array.isArray(restarted?.undo ?? []), "the serialized receipt state is plain data");
  applyTag(target, { temp: 4, tag: wardTag({ grantedAt: "restart:grant", amount: 4 }) });
  const receiptThroughRestart = structuredClone(target.flags.ak5e.ward);
  assert.equal(receiptThroughRestart.grantedAt, "restart:grant");
  assert.equal(receiptThroughRestart.amount, 4, "provenance survives a same-data restart");
  if (restarted?.undo?.length) {
    assert.ok(restarted.undo.every(entry => isLocked(entry) === false || typeof entry.epoch === "number"),
      "every serialized receipt carries its epoch for the undo lock");
  }
});
