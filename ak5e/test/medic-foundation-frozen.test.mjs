/** FROZEN challenger tests — Lane A `medic-foundation` (2026-11-01).
 *
 * Acceptance criteria: .codex-work/medic/SPEC-medic-foundation.md A1–A9; binding contract:
 * ak5e/MEDIC_WORKFLOWS.md "Foundation contract (frozen 2026-11-01)" items 1–6.
 *
 * These tests are frozen: the implementer must make them pass without editing them.
 *
 * ---------------------------------------------------------------------------------------------
 * TEST SEAMS the head must confirm before freezing (the contract does not pin these names/shapes)
 * ---------------------------------------------------------------------------------------------
 * S1. Medic setup/progression = the existing `previewMedicSetup` / `applyMedicSetup` entry points.
 *     The setup undo receipt is either `result.receipt` or the newest `flags.ak5e.artReceipts`
 *     entry, undone with the existing `undoArtReceipt`.
 * S2. `arts-casting.mjs` exports the cast-options seams used by the dialog/confirm/consume path:
 *       artCastOptionsFor(actor, item, activity, context) -> { options: [{ id, label, fields }], warnings }
 *       validateArtCastOptions(actor, item, activity, selection, context) -> { warnings, errors }
 *       applyArtCastOptions(activity, usage, updates, receipt)
 *     Provider selections travel as `usage.ak5eOptions[id] = selection`.
 * S3. `arts-casting.mjs` exports `beginArtCastContext(actor, context, targetUuids)` (async) which
 *     spends the reaction through `spendReaction` and returns `{ warnings, reaction }`.
 * S4. `medic-features.mjs` exports `registerMedicArts()` (idempotent) which registers the Urgency
 *     quote/validate provider and the Self-Defence Protocol grant.
 * S5. Self-Defence Protocol setup mirrors Guardian: `previewSelfDefenceProtocol(actor, { poolId })` /
 *     `applySelfDefenceProtocol(actor, { poolId, confirmed, contextKey })`; the stored choice is
 *     readable from the apply result (`poolId`) and the created Arts are recognisable to `grantFor`.
 *     Urgency selection is `{ lifeSupport: <multiple of 10> }`.
 * S6. `appendLinkedReceipt` writes into `flags.ak5e.artReceipts` and links with `parentReceiptId`;
 *     a relayed-target child carries `relay: { targetUuid, changes, validateRevert }`.
 * S7. Damage correlation sources: `flags.ak5e.castId` on the roll's parent message; on apply, the
 *     cast receipt from the source actor's `flags.ak5e.lastArtCast`; dispositions from
 *     `actor.token.disposition` (CONST.TOKEN_DISPOSITIONS values).
 * S8. `art-correlation.mjs` also exports `confirmArtOutcome(outcome)` for the late-arrival path, and
 *     resolvers are called synchronously as `fn(context)` with `context.amount`/`context.outcome`.
 * ---------------------------------------------------------------------------------------------
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  setupFoundryGlobals,
  teardownFoundryGlobals,
  createTestActor,
  createTestItem
} from "./base-classes-fixture.mjs";

import { artsPointsForLevel, maxArtLevel } from "../scripts/medic-rules.mjs";
import { applyMedicSetup, previewMedicSetup } from "../scripts/medic-setup.mjs";
import {
  artAvailability, grantFor, hasArtsContent, isArtsActor, registerArtGrant, undoArtReceipt
} from "../scripts/arts-casting.mjs";
import { appendArtReceipt, captureArtChanges } from "../scripts/arts-ledger.mjs";
import {
  AK5E_EVENT_KINDS, capturePreApplyDamage, getReactions, handleApplyDamage,
  handleRollDamage, registerTriggerEventHooks, setReactionStore, flagReactionStore
} from "../scripts/trigger-events.mjs";
import { createOperationKernel } from "../scripts/operation-kernel.mjs";
import { isLocked } from "../scripts/play-undo.mjs";

const HEALING_POOL = "special-art-pool-healing-arts-4211";
const FLAME_POOL = "standard-art-pool-flame-arts-3917";
const CORROSION_POOL = "standard-art-pool-corrosion-arts-407";
const OLD_EVENT_KINDS = ["apSpent", "artCast", "attack", "hit", "crit", "damageRoll", "hitTaken", "save",
  "initiative", "turnStart", "turnEnd", "kill", "combatEnd"];

let GLOBALS = null;
test.beforeEach(() => { GLOBALS = setupFoundryGlobals({ settings: { "ak5e.artReceiptEpoch": 0 } }); });
test.afterEach(() => { teardownFoundryGlobals(); });

/** Load a module and assert the named exports exist (a missing export fails this test only, with a
 * readable message, instead of turning the whole file into a load error). */
async function bindings(relative, names) {
  let mod;
  try { mod = await import(new URL(relative, import.meta.url)); }
  catch (error) { assert.fail(`cannot load ${relative}: ${error.message}`); }
  const missing = names.filter(name => typeof mod[name] !== "function");
  assert.deepEqual(missing, [], `missing exports from ${relative}: ${missing.join(", ")}`);
  return mod;
}

const artsCastingSeams = () => bindings("../scripts/arts-casting.mjs",
  ["registerArtCastOptions", "artCastOptionsFor", "validateArtCastOptions", "applyArtCastOptions", "beginArtCastContext"]);
const medicFeatureSeams = () => bindings("../scripts/medic-features.mjs",
  ["registerMedicArts", "previewSelfDefenceProtocol", "applySelfDefenceProtocol"]);
const artCorrelationSeams = () => bindings("../scripts/art-correlation.mjs",
  ["registerDamageResolver", "confirmArtOutcome"]);
const ledgerSeams = () => bindings("../scripts/arts-ledger.mjs", ["appendLinkedReceipt"]);

const warnText = warnings => (warnings ?? []).map(entry => typeof entry === "string" ? entry : entry.text ?? "").join(" | ");

/* ------------------------------------------------------------------ fixtures */

function medic({ level = 9, branch = null, points = {}, casting = {}, medicFlags = {}, items = [] } = {}) {
  const actor = createTestActor({
    name: "Doctor Kal", class: "class-medic", level, branch,
    abilities: { str: { value: 10, mod: 0 }, dex: { value: 12, mod: 1 }, con: { value: 14, mod: 2 },
      int: { value: 16, mod: 3 }, wis: { value: 14, mod: 2 }, cha: { value: 8, mod: -1 } },
    hp: { value: 20, max: 20, temp: 0 }
  });
  actor.type = "character";
  actor.statuses = new Set();
  actor.flags.ak5e.casting = { enabled: true, ability: "wis", recovery: "long", castingUnit: "focus", ...casting };
  actor.flags.ak5e.artsPoints = { maximum: 16, value: 16, maximumArtLevel: 5, ninthLevelCast: false, ...points };
  actor.flags.ak5e.medic = { enabled: true, spellcastingAbility: "wis", ...medicFlags };
  const focus = createTestItem({ id: "focus", type: "weapon", name: "Arts Wand",
    system: { equipped: true }, flags: { ak5e: { tableData: { properties: "Casting Unit" } } } }, actor);
  actor.items.set(focus.id, focus);
  for (const data of items) { const item = createTestItem(data, actor); actor.items.set(item.id, item); }
  return actor;
}

function healingArt({ id = "art-heal", name = "Greater Restoration", level = 5 } = {}) {
  return { id, type: "spell", name, system: { level },
    flags: { ak5e: { art: { enabled: true, pool: HEALING_POOL }, pool: HEALING_POOL } } };
}

function flameArt({ id = "art-flame", name = "Fireball", level = 3 } = {}) {
  return { id, type: "spell", name, system: { level },
    flags: { ak5e: { art: { enabled: true, pool: FLAME_POOL }, pool: FLAME_POOL } } };
}

const activityOf = (actor, item) => ({ uuid: `${actor.uuid}.Activity.cast`, actor, item, type: "cast" });

async function urgencyModel(actor, item) {
  const AC = await artsCastingSeams();
  const model = await AC.artCastOptionsFor(actor, item, activityOf(actor, item), {});
  const options = Array.isArray(model) ? model : model.options ?? [];
  return { AC, model, option: options.find(entry => /urgency/i.test(`${entry.id} ${entry.label}`)), options };
}

async function ledgerActor() {
  const actor = medic({ points: { value: 10, maximum: 16 } });
  actor.flags.ak5e.resourcePools = { lifeSupport: { value: 80, max: 80 } };
  return actor;
}

/* ================================================================== A1 */

test("A1: Medic setup writes Arts Points equal to artsPointsForLevel(L) and maxArtLevel(L)", async () => {
  const actor = medic({ level: 7 });
  actor.flags.ak5e.artsPoints = undefined;
  const plan = await previewMedicSetup(actor);
  const ap = plan.actorUpdates?.["flags.ak5e.artsPoints"];
  assert.ok(ap, "previewMedicSetup must plan flags.ak5e.artsPoints for a Medic");
  assert.equal(ap.maximum, artsPointsForLevel(7));
  assert.equal(ap.maximum, 12);
  assert.equal(ap.maximumArtLevel, maxArtLevel(7));
  assert.equal(ap.maximumArtLevel, 4);
  assert.equal(ap.value, artsPointsForLevel(7), "a fresh Medic starts at the full table value");
  const casting = plan.actorUpdates["flags.ak5e.casting"];
  assert.ok(casting, "previewMedicSetup must plan flags.ak5e.casting");
  assert.equal(casting.enabled, true);
  assert.equal(casting.ability, "wis");
});

test("A1: applying Medic setup makes the Medic an Arts actor (isArtsActor/hasArtsContent)", async () => {
  const actor = medic({ level: 5 });
  actor.flags.ak5e.artsPoints = undefined;
  actor.flags.ak5e.casting = undefined;
  assert.equal(isArtsActor(actor), false);
  const plan = await previewMedicSetup(actor);
  await applyMedicSetup(actor, { confirmed: true, contextKey: plan.contextKey });
  assert.ok(actor.flags.ak5e.artsPoints, "applying Medic setup must write flags.ak5e.artsPoints");
  assert.equal(actor.flags.ak5e.artsPoints.maximum, artsPointsForLevel(5));
  assert.equal(actor.flags.ak5e.artsPoints.maximum, 10);
  assert.equal(actor.flags.ak5e.artsPoints.maximumArtLevel, maxArtLevel(5));
  assert.equal(actor.flags.ak5e.artsPoints.maximumArtLevel, 3);
  assert.equal(actor.flags.ak5e.casting.enabled, true);
  assert.equal(isArtsActor(actor), true);
  assert.equal(hasArtsContent(actor), true);
});

test("A1: applying Medic setup twice is idempotent and preserves an existing AP value", async () => {
  const actor = medic({ level: 11, points: { value: 3, maximum: 2, maximumArtLevel: 1, ninthLevelCast: true } });
  const first = await previewMedicSetup(actor);
  await applyMedicSetup(actor, { confirmed: true, contextKey: first.contextKey });
  const once = structuredClone(actor.flags.ak5e.artsPoints);
  assert.equal(once.maximum, artsPointsForLevel(11));
  assert.equal(once.maximum, 20);
  assert.equal(once.value, 3, "the current AP value is preserved");
  assert.equal(once.ninthLevelCast, true);
  const second = await previewMedicSetup(actor);
  await applyMedicSetup(actor, { confirmed: true, contextKey: second.contextKey });
  assert.deepEqual(actor.flags.ak5e.artsPoints, once);
});

test("A1: the Medic setup undo receipt restores the prior Arts values", async () => {
  const actor = medic({ level: 5, points: { value: 3, maximum: 2, maximumArtLevel: 1, ninthLevelCast: false } });
  const plan = await previewMedicSetup(actor);
  const result = await applyMedicSetup(actor, { confirmed: true, contextKey: plan.contextKey });
  const receipts = actor.getFlag("ak5e", "artReceipts") ?? [];
  const id = result?.receipt?.id ?? receipts.at(-1)?.id;
  assert.ok(id, "Medic setup must record an undo receipt (result.receipt or flags.ak5e.artReceipts)");
  assert.equal(actor.flags.ak5e.artsPoints.maximum, 10);
  await undoArtReceipt(actor, id);
  assert.equal(actor.flags.ak5e.artsPoints.maximum, 2);
  assert.equal(actor.flags.ak5e.artsPoints.maximumArtLevel, 1);
  assert.equal(actor.flags.ak5e.artsPoints.value, 3);
});

test("A1: a non-Medic actor's flags are unchanged by Medic setup", async () => {
  const actor = createTestActor({ name: "Mercenary", level: 3 });
  actor.type = "character";
  const before = structuredClone(actor.flags);
  await assert.rejects(previewMedicSetup(actor), /Medic/);
  await assert.rejects(applyMedicSetup(actor, { confirmed: true, contextKey: "x" }), /Medic/);
  assert.deepEqual(actor.flags, before);
  assert.equal(isArtsActor(actor), false);
  assert.equal(actor.flags.ak5e.artsPoints, undefined);
});

/* ================================================================== A2 */

test("A2: Urgency of Treatment discounts 1 AP per 10 Life Support for a Healing Arts Pool Art", async () => {
  await medicFeatureSeams().then(mod => mod.registerMedicArts());
  const actor = medic({ level: 9, items: [healingArt({ level: 5 })] });
  const item = actor.items.get("art-heal");
  const { option, AC, model } = await urgencyModel(actor, item);
  assert.ok(option, `a Healing Art must offer Urgency of Treatment (options: ${JSON.stringify(model)})`);
  const selection = { lifeSupport: 30 };
  const choices = artAvailability(actor, item, { ak5eOptions: { [option.id]: selection } });
  assert.equal(choices.quote.cost, 2, "level 5 Art costs 5 AP, 30 Life Support reduces it by 3");
  assert.equal(choices.quote.lifeSupportCost, 30);
  const twenty = artAvailability(actor, item, { ak5eOptions: { [option.id]: { lifeSupport: 20 } } });
  assert.equal(twenty.quote.cost, 3);
  assert.equal(twenty.quote.lifeSupportCost, 20);
});

test("A2: Urgency floors the AP cost at 0 and warns that excess Life Support is wasted", async () => {
  await medicFeatureSeams().then(mod => mod.registerMedicArts());
  const actor = medic({ level: 9, items: [healingArt({ id: "art-heal-1", name: "Cure Wounds", level: 1 })] });
  const item = actor.items.get("art-heal-1");
  const { option, AC } = await urgencyModel(actor, item);
  assert.ok(option, "Cure Wounds is a Healing Art");
  const selection = { [option.id]: { lifeSupport: 30 } };
  const choices = artAvailability(actor, item, { ak5eOptions: selection });
  assert.equal(choices.quote.cost, 0, "the cost is floored at 0, never negative");
  const validated = await AC.validateArtCastOptions(actor, item, activityOf(actor, item), selection, {});
  assert.match(warnText(validated.warnings), /wast|excess/i);
  assert.notEqual(validated.blocked, true, "an excess-Life-Support warning never blocks the cast");
});

test("A2: Urgency clamps a Life Support shortfall at 0, records the shortfall and keeps the discount honest", async () => {
  await medicFeatureSeams().then(mod => mod.registerMedicArts());
  const actor = medic({ level: 9, items: [healingArt({ level: 5 })], points: { value: 16 } });
  actor.flags.ak5e.resourcePools = { lifeSupport: { value: 20, max: 80 } };
  const item = actor.items.get("art-heal");
  const { option, AC } = await urgencyModel(actor, item);
  const selection = { [option.id]: { lifeSupport: 30 } };
  const choices = artAvailability(actor, item, { ak5eOptions: selection });
  assert.equal(choices.quote.lifeSupportCost, 20, "only the 20 available Life Support is spent");
  assert.equal(choices.quote.cost, 3, "1 AP per 10 Life Support actually spent");
  const validated = await AC.validateArtCastOptions(actor, item, activityOf(actor, item), selection, {});
  assert.match(warnText(validated.warnings), /short|clamp/i);
});

test("A2: a non-Healing-pool Art offers no Urgency discount", async () => {
  await medicFeatureSeams().then(mod => mod.registerMedicArts());
  const actor = medic({ level: 9, items: [flameArt({ level: 3 })] });
  const item = actor.items.get("art-flame");
  const { option, AC } = await urgencyModel(actor, item);
  if (option) {
    const selection = { [option.id]: { lifeSupport: 30 } };
    const choices = artAvailability(actor, item, { ak5eOptions: selection });
    assert.equal(choices.quote.cost, 3, "Fireball is not a Healing Art: no discount may be applied");
    assert.ok(choices.quote.lifeSupportCost === undefined || choices.quote.lifeSupportCost === 0);
    const validated = await AC.validateArtCastOptions(actor, item, activityOf(actor, item), selection, {});
    assert.doesNotMatch(warnText(validated.warnings), /wast|excess/i);
  } else {
    const choices = artAvailability(actor, item, {});
    assert.equal(choices.quote.cost, 3);
  }
});

test("A2: undoing the cast restores both Life Support and Arts Points", async () => {
  await medicFeatureSeams().then(mod => mod.registerMedicArts());
  const actor = await ledgerActor();
  const item = createTestItem(healingArt({ level: 5 }), actor);
  actor.items.set(item.id, item);
  const { option, AC } = await urgencyModel(actor, item);
  const selection = { ak5eOptions: { [option.id]: { lifeSupport: 30 } } };
  const choices = artAvailability(actor, item, selection);
  const receipt = { id: "cast-urgency", name: "Greater Restoration", level: 5, cost: choices.quote.cost,
    actorUuid: actor.uuid, itemId: item.id };
  const updates = { actor: { "flags.ak5e.artsPoints.value": actor.flags.ak5e.artsPoints.value - choices.quote.cost } };
  await AC.applyArtCastOptions(activityOf(actor, item), selection, updates, receipt);
  assert.equal(updates.actor["flags.ak5e.resourcePools.lifeSupport.value"], 50);
  const changes = captureArtChanges(actor, updates.actor);
  receipt.changes = changes;
  await actor.update({ ...updates.actor, "flags.ak5e.artReceipts": appendArtReceipt(actor, receipt, changes) });
  assert.equal(actor.flags.ak5e.artsPoints.value, 8);
  assert.equal(actor.flags.ak5e.resourcePools.lifeSupport.value, 50);
  await undoArtReceipt(actor, "cast-urgency");
  assert.equal(actor.flags.ak5e.artsPoints.value, 10, "AP is restored");
  assert.equal(actor.flags.ak5e.resourcePools.lifeSupport.value, 80, "Life Support is restored");
});

/* ================================================================== A3 */

test("A3: Self-Defence Protocol preview grants only the chosen pool, cantrips and Arts up to 5th", async () => {
  const { previewSelfDefenceProtocol } = await medicFeatureSeams();
  const { supporterArtsMembers } = await import("../scripts/supporter-arts.mjs");
  const { resolvePoolArtData } = await import("../scripts/caster-setup.mjs");
  const poolId = CORROSION_POOL;
  const members = supporterArtsMembers(poolId).filter(member => member.level <= 5);
  const resolvable = [], unmapped = [];
  for (const member of members) {
    ((await resolvePoolArtData(member.name, member.level, [poolId])) ? resolvable : unmapped).push(member.name);
  }
  assert.ok(resolvable.length >= 5, "fixture sanity: the chosen pool must resolve some Arts");
  const actor = medic({ level: 5 });
  const plan = await previewSelfDefenceProtocol(actor, { poolId });
  assert.equal(plan.poolId ?? plan.pool, poolId);
  const names = (plan.creates ?? []).map(data => data.name);
  assert.deepEqual([...names].sort(), [...resolvable].sort(), "only the chosen pool's resolvable Arts up to 5th are granted");
  for (const name of names) {
    const member = members.find(entry => entry.name === name);
    assert.ok(member, `${name} is not in the chosen pool`);
    assert.ok(member.level <= 5, `${name} is above 5th level`);
  }
  assert.ok(names.some(name => members.find(entry => entry.name === name)?.level === 0), "cantrips are included");
  assert.ok(!names.some(name => members.find(entry => entry.name === name)?.level > 5), "no Art above 5th level");
  const reported = JSON.stringify(plan.missing ?? []).toLowerCase();
  for (const name of unmapped) assert.ok(reported.includes(name.toLowerCase()), `${name} must be reported as unmapped, not dropped silently`);
});

test("A3: Self-Defence Protocol grant reduces AP cost by 1, and by 2 from Medic level 11", async () => {
  const { previewSelfDefenceProtocol, applySelfDefenceProtocol, registerMedicArts } = await medicFeatureSeams();
  await registerMedicArts();
  for (const [level, reduction] of [[5, 1], [10, 1], [11, 2], [20, 2]]) {
    const actor = medic({ level });
    const plan = await previewSelfDefenceProtocol(actor, { poolId: CORROSION_POOL });
    await applySelfDefenceProtocol(actor, { poolId: CORROSION_POOL, confirmed: true, contextKey: plan.contextKey });
    const created = Array.from(actor.items.values()).filter(item => item.type === "spell");
    assert.ok(created.length > 0, `level ${level} must grant Arts`);
    const item = created.find(entry => entry.system.level === 3) ?? created[0];
    const grant = grantFor(item, actor);
    assert.equal(grant.reduction, reduction, `level ${level} reduction`);
    assert.match(String(grant.source ?? ""), /Self-Defence Protocol/i);
  }
});

test("A3: overlap with a second grant takes the larger reduction, never the sum", async () => {
  const { previewSelfDefenceProtocol, applySelfDefenceProtocol, registerMedicArts } = await medicFeatureSeams();
  await registerMedicArts();
  const actor = medic({ level: 11 });
  const plan = await previewSelfDefenceProtocol(actor, { poolId: CORROSION_POOL });
  await applySelfDefenceProtocol(actor, { poolId: CORROSION_POOL, confirmed: true, contextKey: plan.contextKey });
  const item = Array.from(actor.items.values()).find(entry => entry.type === "spell" && entry.system.level === 3)
    ?? Array.from(actor.items.values()).find(entry => entry.type === "spell");
  item.flags.ak5e.stubSecondGrant = true;
  // A stub second grant source (wave-2 Halfway House stand-in): 1 would sum to 3; max must keep 2.
  registerArtGrant((_actor, grantItem) => grantItem?.getFlag?.("ak5e", "stubSecondGrant") ? { reduction: 1, source: "Stub second grant" } : {});
  assert.equal(grantFor(item, actor).reduction, 2, "the larger reduction (2) wins");
  registerArtGrant((_actor, grantItem) => grantItem?.getFlag?.("ak5e", "stubSecondGrant") ? { reduction: 3, source: "Stub larger grant" } : {});
  assert.equal(grantFor(item, actor).reduction, 3, "a larger second reduction wins");
});

/* ================================================================== A4 */

function provider(id, itemFlag, overrides = {}) {
  return {
    id, label: `Test ${id}`,
    fields: [{ name: "amount", label: "Amount", type: "number", min: 0 }],
    validate: () => ({ warnings: [], errors: [] }),
    quote: () => ({}),
    consume: () => {},
    ...overrides,
    __gate(item) { return item?.getFlag?.("ak5e", `option:${itemFlag}`) === true; }
  };
}

test("A4: provider fields reach the cast dialog model and a null provider is ignored", async () => {
  const AC = await artsCastingSeams();
  const actor = medic();
  const item = createTestItem({ ...flameArt({ level: 3 }), flags: { ak5e: { art: { enabled: true }, "option:fields": true } } }, actor);
  actor.items.set(item.id, item);
  const listed = provider("test-fields", "fields");
  AC.registerArtCastOptions((a, i) => listed.__gate(i) ? listed : null);
  const model = await AC.artCastOptionsFor(actor, item, activityOf(actor, item), {});
  const options = Array.isArray(model) ? model : model.options ?? [];
  const entry = options.find(option => option.id === "test-fields");
  assert.ok(entry, "the provider's dialog model is missing");
  assert.equal(entry.label, "Test test-fields");
  assert.deepEqual(entry.fields, listed.fields);
  assert.equal(options.some(option => option === null || option === undefined), false, "a null provider is ignored");
});

test("A4: validate warnings appear in the confirm step and never block the cast", async () => {
  const AC = await artsCastingSeams();
  const actor = medic();
  const item = createTestItem({ ...flameArt({ level: 3 }), flags: { ak5e: { art: { enabled: true }, "option:validate": true } } }, actor);
  actor.items.set(item.id, item);
  const checking = provider("test-validate", "validate", {
    validate: selection => ({ warnings: [{ id: "too-much", text: `Careful: ${selection?.amount ?? 0} is a lot.` }], errors: [] })
  });
  AC.registerArtCastOptions((a, i) => checking.__gate(i) ? checking : null);
  const selection = { "test-validate": { amount: 7 } };
  const validated = await AC.validateArtCastOptions(actor, item, activityOf(actor, item), selection, {});
  assert.match(warnText(validated.warnings), /Careful: 7/);
  assert.ok(Array.isArray(validated.errors));
  // Never block: the consumption path still runs with the same selection.
  const updates = { actor: {} };
  const receipt = { id: "cast-validate" };
  await AC.applyArtCastOptions(activityOf(actor, item), { ak5eOptions: selection }, updates, receipt);
  assert.equal(receipt.options["test-validate"].amount, 7, "warnings do not discard the selection");
});

test("A4: provider quote discounts and lifeSupportCost change the quote", async () => {
  const AC = await artsCastingSeams();
  const actor = medic();
  const item = createTestItem({ ...flameArt({ level: 3 }), flags: { ak5e: { art: { enabled: true }, "option:quote": true } } }, actor);
  actor.items.set(item.id, item);
  const quoting = provider("test-quote", "quote", {
    quote: () => ({ discounts: [{ amount: 2, source: "Test discount" }], lifeSupportCost: 5 })
  });
  AC.registerArtCastOptions((a, i) => quoting.__gate(i) ? quoting : null);
  const choices = artAvailability(actor, item, { ak5eOptions: { "test-quote": { amount: 1 } } });
  assert.equal(choices.quote.cost, 1, "3 AP minus the provider's 2 AP discount");
  assert.equal(choices.quote.lifeSupportCost, 5);
});

test("A4: consume adds actor changes to the same cast update and stores receipt.options[id]", async () => {
  const AC = await artsCastingSeams();
  const actor = medic();
  const item = createTestItem({ ...flameArt({ level: 3 }), flags: { ak5e: { art: { enabled: true }, "option:consume": true } } }, actor);
  actor.items.set(item.id, item);
  let consumed = null;
  const consuming = provider("test-consume", "consume", {
    consume: (selection, updates, receipt) => {
      consumed = { selection, receiptId: receipt.id };
      updates.actor["flags.ak5e.resourcePools.lifeSupport.value"] = 41;
    }
  });
  AC.registerArtCastOptions((a, i) => consuming.__gate(i) ? consuming : null);
  const selection = { "test-consume": { amount: 4 } };
  const updates = { actor: { "flags.ak5e.artsPoints.value": 9 } };
  const receipt = { id: "cast-consume" };
  await AC.applyArtCastOptions(activityOf(actor, item), { ak5eOptions: selection }, updates, receipt);
  assert.equal(updates.actor["flags.ak5e.resourcePools.lifeSupport.value"], 41);
  assert.equal(updates.actor["flags.ak5e.artsPoints.value"], 9, "the AP change stays in the same update");
  assert.deepEqual(receipt.options["test-consume"], { amount: 4 });
  assert.equal(consumed.receiptId, "cast-consume");
});

test("A4: cancelling the dialog changes nothing", async () => {
  const AC = await artsCastingSeams();
  const actor = medic();
  const item = createTestItem({ ...flameArt({ level: 3 }), flags: { ak5e: { art: { enabled: true }, "option:cancel": true } } }, actor);
  actor.items.set(item.id, item);
  let consumed = 0;
  const cancelling = provider("test-cancel", "cancel", { consume: () => { consumed += 1; } });
  AC.registerArtCastOptions((a, i) => cancelling.__gate(i) ? cancelling : null);
  const updates = { actor: {} };
  const receipt = { id: "cast-cancel" };
  await AC.applyArtCastOptions(activityOf(actor, item), {}, updates, receipt);
  assert.deepEqual(updates.actor, {});
  assert.equal(receipt.options, undefined);
  assert.equal(consumed, 0);
  assert.equal(actor.flags.ak5e.artsPoints.value, 16);
});

test("A4: a throwing provider shows a warning and does not break other providers", async () => {
  const AC = await artsCastingSeams();
  const actor = medic();
  const item = createTestItem({ ...flameArt({ level: 3 }), flags: { ak5e: { art: { enabled: true }, "option:throw": true, "option:good": true } } }, actor);
  actor.items.set(item.id, item);
  const thrower = provider("test-throw", "throw", { quote: () => { throw new Error("provider exploded"); } });
  const good = provider("test-good", "good");
  AC.registerArtCastOptions((a, i) => thrower.__gate(i) ? thrower : null);
  AC.registerArtCastOptions((a, i) => good.__gate(i) ? good : null);
  const logged = [];
  const original = console.warn;
  console.warn = (...args) => { logged.push(args.join(" ")); };
  let model;
  try { model = await AC.artCastOptionsFor(actor, item, activityOf(actor, item), {}); }
  finally { console.warn = original; }
  const options = Array.isArray(model) ? model : model.options ?? [];
  const warnings = Array.isArray(model) ? [] : model.warnings ?? [];
  assert.ok(options.some(entry => entry.id === "test-good"), "other providers still work");
  assert.match(`${warnText(warnings)} | ${logged.join(" | ")}`, /exploded/i);
  // The whole quote must still be produced.
  const choices = artAvailability(actor, item, {});
  assert.equal(choices.quote.cost, 3);
});

test("A4: registering the same provider twice is a no-op", async () => {
  const AC = await artsCastingSeams();
  const actor = medic();
  const item = createTestItem({ ...flameArt({ level: 3 }), flags: { ak5e: { art: { enabled: true }, "option:twice": true } } }, actor);
  actor.items.set(item.id, item);
  let calls = 0;
  const twice = provider("test-twice", "twice", { validate: () => { calls += 1; return { warnings: [], errors: [] }; } });
  const source = (a, i) => twice.__gate(i) ? twice : null;
  AC.registerArtCastOptions(source);
  AC.registerArtCastOptions(source);
  const model = await AC.artCastOptionsFor(actor, item, activityOf(actor, item), {});
  const options = Array.isArray(model) ? model : model.options ?? [];
  assert.equal(options.filter(entry => entry.id === "test-twice").length, 1, "the provider appears once");
  const before = calls;
  await AC.validateArtCastOptions(actor, item, activityOf(actor, item), { "test-twice": {} }, {});
  assert.equal(calls - before, 1, "the doubly registered provider is consulted once per pass");
});

/* ================================================================== A5 */

test("A5: a reaction cast spends the caster's reaction", async () => {
  const AC = await artsCastingSeams();
  setReactionStore(flagReactionStore);
  const actor = medic();
  const result = await AC.beginArtCastContext(actor, { castingTime: "reaction", triggerEventId: "evt-1" }, []);
  assert.equal(getReactions(actor).spent, 1);
  assert.equal(result?.reaction?.ok, true);
  assert.doesNotMatch(warnText(result?.warnings), /reaction/i);
});

test("A5: no reaction left is a warning, and the cast is still allowed", async () => {
  const AC = await artsCastingSeams();
  setReactionStore(flagReactionStore);
  const actor = medic();
  actor.flags.ak5e.reactionBudget = { max: 1, spent: 1 };
  const result = await AC.beginArtCastContext(actor, { castingTime: "reaction", triggerEventId: "evt-2" }, []);
  assert.match(warnText(result?.warnings), /reaction/i);
  assert.notEqual(result?.allowed, false, "a missing reaction warns; it never blocks the cast");
});

test("A5: a required target that is not among the targets is a warning", async () => {
  const AC = await artsCastingSeams();
  const actor = medic();
  const missing = await AC.beginArtCastContext(actor, { requiredTargetUuid: "Actor.patient" }, ["Actor.other"]);
  assert.match(warnText(missing?.warnings), /patient|target/i);
  const present = await AC.beginArtCastContext(actor, { requiredTargetUuid: "Actor.patient" }, ["Actor.patient"]);
  assert.doesNotMatch(warnText(present?.warnings), /patient|target/i);
});

/* ================================================================== A6 */

async function linkedFixture() {
  const actor = await ledgerActor();
  const parentChanges = captureArtChanges(actor, { "flags.ak5e.artsPoints.value": 7 });
  const parent = appendArtReceipt(actor, { id: "cast-parent", name: "Cure Wounds", cost: 3, level: 1 }, parentChanges)[0];
  await actor.update({ "flags.ak5e.artsPoints.value": 7, "flags.ak5e.artReceipts": [parent] });
  return { actor, parent };
}

test("A6: appendLinkedReceipt records a child that points to its cast", async () => {
  const { appendLinkedReceipt } = await ledgerSeams();
  const { actor, parent } = await linkedFixture();
  const changes = [{ path: "flags.ak5e.resourcePools.lifeSupport.value", before: 80, after: 50 }];
  await actor.update({ "flags.ak5e.resourcePools.lifeSupport.value": 50 });
  const result = await appendLinkedReceipt(actor, parent.id, { id: "child-rider", name: "Rider: Life Support gain" }, changes);
  const ledger = actor.getFlag("ak5e", "artReceipts");
  const child = ledger.find(entry => entry.id === "child-rider");
  assert.ok(child, "the child receipt is missing from flags.ak5e.artReceipts");
  assert.equal(child.parentReceiptId ?? child.parentId, parent.id);
  assert.deepEqual(child.changes, changes);
  assert.ok(result === undefined || result?.id === "child-rider" || Array.isArray(result));
});

test("A6: undoing the parent reverses its children's changes too", async () => {
  const { appendLinkedReceipt } = await ledgerSeams();
  const { actor, parent } = await linkedFixture();
  const changes = [{ path: "flags.ak5e.resourcePools.lifeSupport.value", before: 80, after: 50 }];
  await actor.update({ "flags.ak5e.resourcePools.lifeSupport.value": 50 });
  await appendLinkedReceipt(actor, parent.id, { id: "child-rider", name: "Rider" }, changes);
  await undoArtReceipt(actor, parent.id);
  assert.equal(actor.flags.ak5e.artsPoints.value, 10, "the parent's AP change is restored");
  assert.equal(actor.flags.ak5e.resourcePools.lifeSupport.value, 80, "the child's Life Support change is restored");
  assert.equal(actor.getFlag("ak5e", "artReceipts").find(entry => entry.id === "child-rider").status, "undone");
});

test("A6: a child can be undone on its own without touching the parent", async () => {
  const { appendLinkedReceipt } = await ledgerSeams();
  const { actor, parent } = await linkedFixture();
  const changes = [{ path: "flags.ak5e.resourcePools.lifeSupport.value", before: 80, after: 50 }];
  await actor.update({ "flags.ak5e.resourcePools.lifeSupport.value": 50 });
  await appendLinkedReceipt(actor, parent.id, { id: "child-alone", name: "Rider" }, changes);
  await undoArtReceipt(actor, "child-alone");
  assert.equal(actor.flags.ak5e.resourcePools.lifeSupport.value, 80);
  assert.equal(actor.flags.ak5e.artsPoints.value, 7, "the parent cast stays committed");
  assert.equal(actor.getFlag("ak5e", "artReceipts").find(entry => entry.id === parent.id).status, "available");
});

test("A6: a locked parent window locks its children (even a child created in the current window)", async () => {
  const { appendLinkedReceipt } = await ledgerSeams();
  const { actor, parent } = await linkedFixture();
  // Advance the encounter window first: the parent now belongs to an earlier window, the child to this one.
  game.settings.set("ak5e", "artReceiptEpoch", 1);
  const changes = [{ path: "flags.ak5e.resourcePools.lifeSupport.value", before: 80, after: 50 }];
  await actor.update({ "flags.ak5e.resourcePools.lifeSupport.value": 50 });
  await appendLinkedReceipt(actor, parent.id, { id: "child-locked", name: "Rider" }, changes);
  const child = actor.getFlag("ak5e", "artReceipts").find(entry => entry.id === "child-locked");
  assert.equal(isLocked(child), false, "the child itself is in the current window");
  assert.equal(isLocked(actor.getFlag("ak5e", "artReceipts").find(entry => entry.id === parent.id)), true);
  await assert.rejects(undoArtReceipt(actor, "child-locked"), /lock|window/i);
  assert.equal(actor.flags.ak5e.resourcePools.lifeSupport.value, 50, "nothing is reverted while locked");
});

test("A6: undo is recorded on the public card", async () => {
  const { actor, parent } = await linkedFixture();
  const message = {
    id: "msg-1", uuid: "ChatMessage.msg-1",
    data: { speaker: { actor: actor.id }, flags: { ak5e: { artCast: { id: parent.id, actorUuid: actor.uuid } } } },
    getFlag(scope, key) { return this.data?.flags?.[scope]?.[key]; },
    async update(changes) { this.updated = { ...(this.updated ?? {}), ...changes }; return this; }
  };
  await undoArtReceipt(actor, parent.id, { message });
  assert.equal(message.updated?.["flags.ak5e.artCast.status"], "undone");
  assert.equal(message.updated?.["flags.ak5e.artCast.undoneBy"], game.user.id);
});

test("A6: parent undo calls the relay revert path and is gated by validateRevert (assumed relay child shape)", async () => {
  const { appendLinkedReceipt } = await ledgerSeams();
  const { actor, parent } = await linkedFixture();
  const patient = createTestActor({ name: "Patient", hp: { value: 12, max: 20, temp: 0 } });
  const beforeHp = patient.system.attributes.hp.value;
  patient.system.attributes.hp.value = 20;
  let validated = 0, reverted = 0;
  patient.update = async changes => { reverted += 1; Object.assign(patient, { lastChanges: changes }); return patient; };
  await appendLinkedReceipt(actor, parent.id, {
    id: "child-relay",
    name: "Relayed healing",
    relay: {
      targetUuid: patient.uuid,
      changes: { "system.attributes.hp.value": 20 },
      restore: { "system.attributes.hp.value": beforeHp },
      validateRevert: (_source, _receipt, entry) => { validated += 1; return entry?.targetUuid === patient.uuid; }
    }
  }, []);
  await undoArtReceipt(actor, parent.id);
  assert.equal(validated, 1, "validateRevert must gate the relay revert");
  assert.equal(reverted, 1, "the relayed target change is reverted");
  assert.equal(patient.lastChanges?.["system.attributes.hp.value"], 12);
});

/* ================================================================== A7 */

function rollOf({ total = 7, type = "fire", castId = null, targets = [] } = {}) {
  return {
    total, formula: "1d8", options: { type }, isCritical: false, isFumble: false,
    parent: { flags: { ak5e: castId ? { castId } : {}, dnd5e: { targets } } }
  };
}

function artsSourceActor() {
  const actor = medic({ level: 9 });
  actor.token = { disposition: -1 };
  actor.flags.ak5e.lastArtCast = { id: "cast-1", level: 3, cost: 2, itemId: "art-heal" };
  return actor;
}

test("A7: damage roll messages from a cast carry castId and the correlated payload", async () => {
  const source = artsSourceActor();
  const target = createTestActor({ name: "Target", hp: { value: 20, max: 20, temp: 0 } });
  target.token = { disposition: 1 };
  const item = createTestItem({ ...flameArt({ level: 3 }) }, source);
  const roll = rollOf({ castId: "cast-1", targets: [{ uuid: target.uuid, name: "Target", ac: 12 }] });
  const seen = [];
  const { onAk5eEvent, offAk5eEvent } = await import("../scripts/trigger-events.mjs");
  const handler = event => seen.push(event);
  onAk5eEvent("damageRoll", handler);
  await handleRollDamage([roll], { subject: activityOf(source, item) });
  offAk5eEvent("damageRoll", handler);
  const event = seen[0];
  assert.ok(event, "no damageRoll event was emitted");
  assert.equal(event.castId, "cast-1");
  assert.equal(event.isArt, true);
  assert.equal(event.artLevel, 3);
  assert.equal(event.apSpent, 2);
  assert.equal(event.sourceActorUuid, source.uuid);
  assert.equal(event.hostile, true, "opposite dispositions are hostile");
  // Existing payload keys are unchanged.
  assert.equal(event.actorUuid, source.uuid);
  assert.equal(event.total, 7);
  assert.deepEqual(event.targetUuids, [target.uuid]);
  assert.equal(event.critical, false);
});

test("A7: hostile is false for same dispositions and null when the target is unknown", async () => {
  const source = artsSourceActor();
  const friend = createTestActor({ name: "Friend" });
  friend.token = { disposition: -1 };
  const item = createTestItem({ ...flameArt({ level: 3 }) }, source);
  const { onAk5eEvent, offAk5eEvent } = await import("../scripts/trigger-events.mjs");
  const seen = [];
  const handler = event => seen.push(event);
  onAk5eEvent("damageRoll", handler);
  await handleRollDamage([rollOf({ castId: "cast-1", targets: [{ uuid: friend.uuid, name: "Friend", ac: 10 }] })],
    { subject: activityOf(source, item) });
  await handleRollDamage([rollOf({ castId: "cast-1", targets: [{ uuid: "Actor.ghost", name: "Ghost", ac: 10 }] })],
    { subject: activityOf(source, item) });
  offAk5eEvent("damageRoll", handler);
  assert.equal(seen[0].hostile, false, "the same disposition is not hostile");
  assert.equal(seen[1].hostile, null, "an unknown target disposition yields null");
});

test("A7: hitTaken carries castId, isArt, artLevel, apSpent, sourceActorUuid and hostile", async () => {
  const source = artsSourceActor();
  const target = createTestActor({ name: "Target", hp: { value: 20, max: 20, temp: 0 } });
  target.token = { disposition: 1 };
  const item = createTestItem({ ...flameArt({ level: 3 }) }, source);
  const message = { id: "m1", uuid: "ChatMessage.m1", flags: { ak5e: { castId: "cast-1" } },
    speaker: { actor: source.id } };
  ChatMessage.implementation.getSpeakerActor = () => source;
  const options = { originatingMessage: message };
  const seen = [];
  const { onAk5eEvent, offAk5eEvent } = await import("../scripts/trigger-events.mjs");
  const handler = event => seen.push(event);
  onAk5eEvent("hitTaken", handler);
  capturePreApplyDamage(target, 6, {}, options);
  target.system.attributes.hp.value = 14;
  await handleApplyDamage(target, 6, options);
  offAk5eEvent("hitTaken", handler);
  const event = seen[0];
  assert.ok(event, "no hitTaken event was emitted");
  assert.equal(event.castId, "cast-1");
  assert.equal(event.isArt, true);
  assert.equal(event.artLevel, 3);
  assert.equal(event.apSpent, 2);
  assert.equal(event.sourceActorUuid, source.uuid);
  assert.equal(event.hostile, true);
  assert.equal(event.amount, 6);
  assert.equal(event.hpBefore, 20);
  assert.equal(event.hpAfter, 14);
  assert.equal(event.messageUuid, "ChatMessage.m1");
});

test("A7: hpRestored reports HP actually restored after clamping and excludes temporary HP", async () => {
  const source = artsSourceActor();
  const target = createTestActor({ name: "Patient", hp: { value: 8, max: 10, temp: 5 } });
  const message = { id: "m2", uuid: "ChatMessage.m2", flags: { ak5e: { castId: "cast-1" } }, speaker: { actor: source.id } };
  ChatMessage.implementation.getSpeakerActor = () => source;
  const options = { originatingMessage: message };
  const seen = [];
  const { onAk5eEvent, offAk5eEvent } = await import("../scripts/trigger-events.mjs");
  const handler = event => seen.push(event);
  onAk5eEvent("hpRestored", handler);
  capturePreApplyDamage(target, -5, {}, options);
  target.system.attributes.hp.value = 10;   // clamped at the maximum
  await handleApplyDamage(target, -5, options);
  offAk5eEvent("hpRestored", handler);
  const event = seen[0];
  assert.ok(event, "no hpRestored event was emitted");
  assert.equal(event.actorUuid, target.uuid);
  assert.equal(event.sourceActorUuid, source.uuid);
  assert.equal(event.castId, "cast-1");
  assert.equal(event.amount, 2, "8 -> 10 restores 2 HP; temporary HP is ignored");
  assert.equal(target.system.attributes.hp.temp, 5);
});

test("A7: AK5E_EVENT_KINDS gains only hpRestored", () => {
  for (const kind of OLD_EVENT_KINDS) assert.ok(AK5E_EVENT_KINDS.includes(kind), `lost event kind ${kind}`);
  const added = AK5E_EVENT_KINDS.filter(kind => !OLD_EVENT_KINDS.includes(kind));
  assert.deepEqual(added, ["hpRestored"]);
});

/* ================================================================== A8 */

async function damageHarness({ actor = null } = {}) {
  const globals = GLOBALS;
  const target = actor ?? createTestActor({ name: "Ward Target", hp: { value: 20, max: 20, temp: 3 } });
  const { registerTriggerEventHooks: register } = await import("../scripts/trigger-events.mjs");
  const AC = await artCorrelationSeams();
  if (typeof AC.registerArtCorrelation === "function") AC.registerArtCorrelation();
  register();
  const adapters = globals.hooks.get("dnd5e.preApplyDamage") ?? [];
  assert.ok(adapters.length > 0, "no dnd5e.preApplyDamage adapter is registered");
  return { globals, target, AC, adapters };
}

test("A8: a resolver's reduce is applied after DR/resist and before temporary HP, floor 0", async () => {
  const { target, AC, adapters } = await damageHarness();
  const seen = [];
  AC.registerDamageResolver(context => {
    if (context?.options?.testTag !== "a8") return {};
    seen.push(context);
    return { reduce: 3, note: "Collective Ward" };
  });
  const updates = { "system.attributes.hp.value": 20, "system.attributes.hp.temp": 3 };
  const options = { testTag: "a8", originatingMessage: { id: "m8", uuid: "ChatMessage.m8", flags: { ak5e: { castId: "cast-1" } } } };
  for (const adapter of adapters) await adapter(target, 10, updates, options);
  assert.equal(seen.length, 1, "the resolver must run synchronously in preApplyDamage");
  assert.equal(seen[0].amount, 10);
  assert.equal(updates["system.attributes.hp.temp"], 0, "3 temporary HP absorb part of the 7 reduced damage");
  assert.equal(updates["system.attributes.hp.value"], 16, "10 - 3 Ward = 7; 3 temp; 4 HP lost");
});

test("A8: a reduction larger than the damage floors at 0", async () => {
  const { target, AC, adapters } = await damageHarness();
  AC.registerDamageResolver(context => context?.options?.testTag === "a8-floor" ? { reduce: 50, note: "Ward" } : {});
  const updates = { "system.attributes.hp.value": 20, "system.attributes.hp.temp": 3 };
  for (const adapter of adapters) await adapter(target, 10, updates, { testTag: "a8-floor" });
  assert.equal(updates["system.attributes.hp.value"], 20);
  assert.equal(updates["system.attributes.hp.temp"], 3);
});

test("A8: a resolver that returns a Promise or throws is ignored with a console warning", async () => {
  const { target, AC, adapters } = await damageHarness();
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => { warnings.push(args.join(" ")); };
  try {
    AC.registerDamageResolver(context => context?.options?.testTag === "a8-bad" ? Promise.resolve({ reduce: 5 }) : {});
    AC.registerDamageResolver(context => {
      if (context?.options?.testTag !== "a8-bad") return {};
      throw new Error("resolver exploded");
    });
    AC.registerDamageResolver(context => context?.options?.testTag === "a8-bad" ? { reduce: 2, note: "Good" } : {});
    const updates = { "system.attributes.hp.value": 20, "system.attributes.hp.temp": 3 };
    for (const adapter of adapters) await adapter(target, 10, updates, { testTag: "a8-bad" });
    assert.equal(updates["system.attributes.hp.value"], 15, "the good resolver still applies (10 - 2 = 8; 3 temp; 5 HP)");
    assert.equal(updates["system.attributes.hp.temp"], 0);
    assert.match(warnings.join("\n"), /promise|async/i);
    assert.match(warnings.join("\n"), /exploded/i);
  } finally { console.warn = original; }
});

test("A8: an outcome confirmed after application shows the timing warning and never reverses damage", async () => {
  const { target, AC, adapters } = await damageHarness();
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => { warnings.push(args.join(" ")); };
  try {
    AC.registerDamageResolver(context => context?.options?.testTag === "a8-late" ? { reduce: 4, note: "Late Ward" } : {});
    const updates = { "system.attributes.hp.value": 20, "system.attributes.hp.temp": 0 };
    const options = { testTag: "a8-late", originatingMessage: { id: "m9", uuid: "ChatMessage.m9", flags: { ak5e: { castId: "cast-1" } } } };
    for (const adapter of adapters) await adapter(target, 10, updates, options);
    target.system.attributes.hp.value = 10;
    const late = await AC.confirmArtOutcome({ messageUuid: "ChatMessage.m9", targetUuid: target.uuid, amount: 10, types: ["slashing"] });
    assert.equal(late?.late, true, "a late outcome must be reported as late");
    assert.match(warnings.join("\n"), /timing|after the damage|manual/i);
    assert.equal(target.system.attributes.hp.value, 10, "damage is never silently reversed");
  } finally { console.warn = original; }
});

/* ================================================================== A9 */

test("A9: no module-owned source file starts dice", () => {
  const files = ["arts-casting.mjs", "arts-ledger.mjs", "arts-sheet.mjs", "trigger-events.mjs",
    "art-correlation.mjs", "medic-setup.mjs", "medic-progression.mjs", "medic-features.mjs"];
  const offenders = [];
  for (const name of files) {
    let source;
    try { source = readFileSync(new URL(`../scripts/${name}`, import.meta.url), "utf8"); }
    catch (error) { offenders.push(`${name}: missing (${error.code})`); continue; }
    const matches = source.match(/new\s+Roll\s*\(|\.evaluate\s*\(|Math\.random\s*\(/g);
    if (matches) offenders.push(`${name}: ${[...new Set(matches)].join(", ")}`);
  }
  assert.deepEqual(offenders, [], `module-started dice found: ${offenders.join("; ")}`);
});

test("A9: provider consumption and damage resolvers construct no Roll", async () => {
  const AC = await artsCastingSeams();
  const actor = medic();
  const item = createTestItem({ ...flameArt({ level: 3 }), flags: { ak5e: { art: { enabled: true }, "option:nodice": true } } }, actor);
  actor.items.set(item.id, item);
  AC.registerArtCastOptions((a, i) => i?.getFlag?.("ak5e", "option:nodice") ? provider("test-nodice", "nodice",
    { consume: () => ({}) }) : null);
  let rolls = 0;
  const Original = globalThis.Roll;
  globalThis.Roll = class ForbiddenRoll { constructor() { rolls += 1; throw new Error("dice started by the module"); } };
  try {
    const updates = { actor: {} };
    await AC.applyArtCastOptions(activityOf(actor, item), { ak5eOptions: { "test-nodice": { amount: 1 } } }, updates, { id: "cast-nodice" });
    const AC2 = await artCorrelationSeams();
    AC2.registerDamageResolver(context => context?.options?.testTag === "a9-nodice" ? { reduce: 1, note: "Ward" } : {});
    const target = createTestActor({ name: "Target", hp: { value: 20, max: 20, temp: 0 } });
    const globals = GLOBALS;
    registerTriggerEventHooks();
    for (const adapter of globals.hooks.get("dnd5e.preApplyDamage") ?? []) {
      await adapter(target, 5, { "system.attributes.hp.value": 20, "system.attributes.hp.temp": 0 }, { testTag: "a9-nodice" });
    }
    assert.equal(rolls, 0);
  } finally { globalThis.Roll = Original; }
});

test("A9: a player-owned cast is not GM-gated", async () => {
  GLOBALS = setupFoundryGlobals({ isGM: false, settings: { "ak5e.artReceiptEpoch": 0 } });
  const AC = await artsCastingSeams();
  const actor = medic();
  const item = createTestItem({ ...flameArt({ level: 3 }), flags: { ak5e: { art: { enabled: true }, "option:player": true } } }, actor);
  actor.items.set(item.id, item);
  assert.equal(game.user.isGM, false);
  assert.equal(actor.isOwner, true);
  const model = await AC.artCastOptionsFor(actor, item, activityOf(actor, item), {});
  assert.ok(model);
  const updates = { actor: {} };
  await AC.applyArtCastOptions(activityOf(actor, item), {}, updates, { id: "cast-player" });
});

test("A9: unowned target changes go through the GM relay and never write directly", async () => {
  const globals = setupFoundryGlobals({ isGM: false, settings: { "ak5e.artReceiptEpoch": 0 } });
  Object.defineProperty(globals.users, "activeGM", { get() { return null; }, configurable: true });
  const { appendLinkedReceipt } = await ledgerSeams();
  const source = medic();
  const parent = appendArtReceipt(source, { id: "cast-relay", name: "Cure Wounds", cost: 1, level: 1 },
    captureArtChanges(source, { "flags.ak5e.artsPoints.value": 15 }))[0];
  await source.update({ "flags.ak5e.artsPoints.value": 15, "flags.ak5e.artReceipts": [parent] });
  const patient = createTestActor({ name: "Unowned Patient", owner: false, hp: { value: 10, max: 20, temp: 0 } });
  let writes = 0;
  patient.update = async () => { writes += 1; return patient; };
  await assert.rejects(appendLinkedReceipt(source, parent.id, {
    id: "child-relay", name: "Relayed healing",
    relay: { targetUuid: patient.uuid, changes: { "system.attributes.hp.value": 20 },
      validateRevert: () => true }
  }, []), /GM|relay|request/i);
  assert.equal(writes, 0, "an unowned target is never written directly");
  assert.equal(game.messages.length, 0, "without an elected GM the relay refuses; it does not fake an application");
});

test("A9: the existing operation kernel refuses a player commit without an elected GM", async () => {
  const globals = setupFoundryGlobals({ isGM: false, settings: { "ak5e.artReceiptEpoch": 0 } });
  Object.defineProperty(globals.users, "activeGM", { get() { return null; }, configurable: true });
  const state = { operations: [] };
  const kernel = createOperationKernel({
    label: "Test relay", stateFlag: "testRelay", requestFlag: "testRelayRequest", responseFlag: "testRelayResponse",
    receiptFlag: "testRelayReceipt", benefitFlag: "testRelayBenefit", rollFlag: "testRelayRoll", tagPreset: "custom",
    getState: () => ({ ...state }), isMember: () => true, perform: async () => state
  });
  const actor = medic();
  await assert.rejects(kernel.execute(actor, { id: "relay-test-1", command: "apply", data: { confirmation: true } }),
    /active GM|GM is required/i);
  assert.equal(actor.flags.ak5e.artsPoints.value, 16, "a refused relay writes nothing");
});
