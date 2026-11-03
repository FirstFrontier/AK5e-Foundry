/** Medic Foundation attack pass R2 (adversary, 2026-11-02).
 * Independent post-repair attack on the BASE Medic foundation (A1–A9), drafted from
 * SPEC-medic-foundation.md, MEDIC_WORKFLOWS.md "Foundation contract (frozen 2026-11-01)",
 * DECISIONS.md U3 rulings and bugs/pending B-310 / B-311 / B-312. Tests are written from the
 * spec/source, not from candidate reasoning. Hunted classes: unchecked numeric input, wrong
 * defaults, stale reads at commit, missing/inexact undo entries, relay validators that check
 * shape but not target identity, token-form vs base-Actor writes, duplicate/replay handling,
 * expiry gaps, reaction-state handling, and Life Support accounting between receipts and pools.
 *
 * B-310/311/312 direct cases are frozen and green in medic-foundation-checkpoint1-regression
 * .test.mjs; this file probes NEW variants (stacked same-target relays with interleaved drift,
 * three-level undo chains, child-after-parent window lock, token-form uuids, target-substitution
 * tampering, durable-intent parent undo). No frozen file is modified.
 *
 * Red tests are deliberate FINDINGS (spec/source says one thing, the code does another),
 * labelled with severity; green tests pin fixed/defended behaviour against future retries.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import { previewMedicSetup, applyMedicSetup } from "../scripts/medic-setup.mjs";
import { previewMedicProgression, applyMedicProgression } from "../scripts/medic-progression.mjs";
import { registerMedicArts, HEALING_ARTS_POOL_ID } from "../scripts/medic-features.mjs";
import {
  artAvailability, applyArtCastOptions, registerArtCastOptions, registerArtGrant,
  artCastOptionsFor, collectArtCastOptionSelections, validateArtCastOptions,
  beginArtCastContext, undoArtReceipt, prepareArtUse, consumeArt, wrapActivityUse
} from "../scripts/arts-casting.mjs";
import {
  appendLinkedReceipt, appendArtReceipt, captureArtChanges, registerArtRelayHooks
} from "../scripts/arts-ledger.mjs";
import {
  spendReaction, refundReaction, getReactions, onAk5eEvent, offAk5eEvent,
  handleApplyDamage, capturePreApplyDamage, hostileToward, registerRider, matchRiders
} from "../scripts/trigger-events.mjs";
import {
  registerDamageResolver, applyArtDamageResolvers, confirmArtOutcome
} from "../scripts/art-correlation.mjs";

let globals;
test.beforeEach(() => { globals = setupFoundryGlobals({ isGM: false, settings: { "ak5e.artReceiptEpoch": 0 } }); });
test.afterEach(() => teardownFoundryGlobals());

const URGENCY = "urgency-of-treatment";
const FLAME = "standard-art-pool-flame-arts-3917";
let seq = 0;

function medic({ level = 9, points = 16, maximum = 16, maxArtLevel = 5, lifeSupport = 80, owner = true } = {}) {
  const actor = createTestActor({ name: `R2 Medic ${++seq}`, class: "class-medic", level,
    abilities: { int: { value: 14, mod: 2 }, wis: { value: 14, mod: 2 }, cha: { value: 10, mod: 0 } },
    hp: { value: 20, max: 20, temp: 0 }, owner });
  actor.type = "character";
  actor.flags.ak5e.casting = { enabled: true, ability: "wis", recovery: "long", castingUnit: "focus" };
  actor.flags.ak5e.artsPoints = { maximum, value: points, maximumArtLevel: maxArtLevel, ninthLevelCast: false };
  actor.flags.ak5e.medic = { enabled: true, spellcastingAbility: "wis" };
  actor.flags.ak5e.resourcePools = { lifeSupport: { value: lifeSupport, max: 200 } };
  actor.items.set("focus", createTestItem({ id: "focus", type: "weapon", name: "Arts Wand",
    system: { equipped: true }, flags: { ak5e: { tableData: { properties: "Casting Unit" } } } }, actor));
  return actor;
}
function art(actor, { id = "healing-art", level = 5, pool = HEALING_ARTS_POOL_ID } = {}) {
  const item = createTestItem({ id, type: "spell", name: `Art ${id}`, system: { level },
    flags: { ak5e: { art: { enabled: true, pool }, pool } } }, actor);
  actor.items.set(item.id, item);
  return item;
}
/** Commit exactly the way consumeArt wires it: option consumption joins the Actor update,
 * changes are captured from the final update, the receipt joins the ledger, one write lands. */
async function commitCast(actor, item, usage, receipt, extraActorUpdates = {}) {
  const updates = { actor: { ...extraActorUpdates } };
  const warnings = applyArtCastOptions({ actor, item }, usage, updates, receipt);
  receipt.warnings.push(...warnings.map(warning => warning.text));
  receipt.changes = captureArtChanges(actor, updates.actor);
  receipt.actorUuid = actor.uuid;
  updates.actor["flags.ak5e.artReceipts"] = appendArtReceipt(actor, receipt, receipt.changes);
  await actor.update({ ...updates.actor, "flags.ak5e.lastArtCast": receipt });
  return receipt;
}

/* ------------------------------------------------------------------ A2: Urgency numerics */

test("A2: garbage Life Support input (negative, non-numeric, empty, boolean) never discounts, never writes the pool, never blocks", async () => {
  await registerMedicArts();
  const actor = medic({ level: 5 });
  const item = art(actor, { id: "r2-garb", level: 1 });
  for (const junk of ["-30", "abc", {}, null, undefined, false, "", NaN, -0]) {
    const usage = { ak5eOptions: { [URGENCY]: { lifeSupport: junk } } };
    const choices = artAvailability(actor, item, usage);
    assert.equal(choices.quote.cost, 1, `${JSON.stringify(junk)} must not change the AP cost`);
    assert.equal(choices.quote.lifeSupportCost, undefined, `${JSON.stringify(junk)} must not quote a Life Support cost`);
    const checked = await validateArtCastOptions(actor, item, null, usage.ak5eOptions);
    assert.deepEqual(checked.errors, [], `${JSON.stringify(junk)} may warn but must never block`);
    const updates = { actor: {} };
    applyArtCastOptions({ actor, item }, usage, updates, { id: `r2-garb-${++seq}`, warnings: [] });
    assert.equal(updates.actor["flags.ak5e.resourcePools.lifeSupport.value"], undefined,
      `${JSON.stringify(junk)} must never write the Life Support pool`);
  }
  assert.equal(actor.flags.ak5e.resourcePools.lifeSupport.value, 80);
});

test("A2: Infinity/huge and fractional requests clamp to what the Actor has; the pool and quote stay consistent", async () => {
  await registerMedicArts();
  const actor = medic({ level: 5, lifeSupport: 80 });
  const item = art(actor, { id: "r2-huge", level: 1 });
  const usage = { ak5eOptions: { [URGENCY]: { lifeSupport: 1e21 } } };
  const choices = artAvailability(actor, item, usage);
  assert.equal(choices.quote.lifeSupportCost, 10, "the discount caps at the Art's remaining cost even for an astronomically large request");
  const checked = await validateArtCastOptions(actor, item, null, usage.ak5eOptions);
  assert.match(checked.warnings.map(w => w.text).join(" "), /clamped|available/i, "an over-request is visibly clamped, never silently honoured");
  const receipt = { id: `r2-huge-${++seq}`, warnings: [] };
  await commitCast(actor, item, usage, receipt, { "flags.ak5e.artsPoints.value": choices.quote.remaining });
  assert.equal(actor.flags.ak5e.resourcePools.lifeSupport.value, 70, "exactly 10 LS left the pool");
  // Fractional requests floor to whole 10-unit groups; nothing is lost or double-spent.
  const usage2 = { ak5eOptions: { [URGENCY]: { lifeSupport: 29.99 } } };
  const receipt2 = { id: `r2-frac-${++seq}`, warnings: [] };
  const choices2 = artAvailability(actor, item, usage2);
  assert.equal(choices2.quote.lifeSupportCost, 10, "29.99 floors to the 20-unit request; only 1 AP of a 1-AP Art is discountable → 10 LS");
  const updates2 = { actor: {} };
  applyArtCastOptions({ actor, item }, usage2, updates2, receipt2);
  assert.equal(updates2.actor["flags.ak5e.resourcePools.lifeSupport.value"], 60, "the second commit re-reads the live 70 pool and spends its own 10");
  await undoArtReceipt(actor, receipt.id);
  assert.equal(actor.flags.ak5e.resourcePools.lifeSupport.value, 80,
    "undo refunds exactly the cast's 10 LS delta (70 → 80) via the numeric resource path");
});

test("A2/FINDING-1 (medium, rules fidelity): the Urgency discount caps at the BASE-level cost, so an upcast Healing Art cannot be fully discounted", async () => {
  // C3:4656: "expend Life Support in multiples of 10 to reduce the Arts Point cost of THAT CASTING
  // by 1 for every 10 expended, to a minimum of 0". Spec A2: "applied after grant reductions,
  // total floored at 0; excess LS beyond the remaining cost → warning". "That casting" is the
  // chosen cast level. healingBaseCost() (medic-features.mjs) quotes item.system.level (base 5),
  // not the selected cast level (7), so 70 LS on a 7 AP casting discounts only 5 AP: the player
  // pays 2 AP and spends 50 LS where the printed rule grants a full 7 AP discount for 70 LS.
  // Expected values below are the spec reading; the base-level cap is the defect.
  await registerMedicArts();
  const actor = medic({ level: 11, points: 30, maximum: 30, maxArtLevel: 9 });
  const item = art(actor, { id: "r2-upcast", level: 5 });
  const usage = { level: 7, mode: "ap", ak5eOptions: { [URGENCY]: { lifeSupport: 70 } } };
  const choices = artAvailability(actor, item, usage);
  assert.equal(choices.quote.level, 7);
  assert.equal(choices.quote.cost, 0, "70 LS on a 7 AP casting must be able to reduce it to the printed minimum of 0");
  assert.equal(choices.quote.lifeSupportCost, 70, "the casting's full remaining cost is discountable");
});

test("A2/U3-1: the Urgency discount applies AFTER grant reductions, and overlapping grants take the larger reduction, never the sum (U3-4)", async () => {
  await registerMedicArts();
  registerArtGrant((_actor, item) => item?.id === "r2-order" ? { reduction: 1, source: "r2-grant-one" } : {});
  registerArtGrant((_actor, item) => item?.id === "r2-order" ? { reduction: 2, source: "r2-grant-two" } : {});
  const actor = medic({ level: 11 });
  const item = art(actor, { id: "r2-order", level: 5 });
  const usage = { ak5eOptions: { [URGENCY]: { lifeSupport: 40 } } };
  const choices = artAvailability(actor, item, usage);
  // reduction = max(1,2) = 2 (NOT sum 3): remaining cost 3, so 40 LS can only pay 3 units = 30 LS.
  assert.equal(choices.quote.cost, 0);
  assert.equal(choices.quote.lifeSupportCost, 30,
    "summed reductions (5-3=2 → 20 LS) or a discount applied before reductions (→ 40 LS) both fail this");
  const checked = await validateArtCastOptions(actor, item, null, usage.ak5eOptions);
  assert.match(checked.warnings.map(w => w.text).join(" "), /wasted/i, "the 10 excess LS is a visible warning, not silent waste");
});

test("A2: a Life Support pool drained between dialog quote and commit clamps at commit; undo refunds exactly the actual spend", async () => {
  // Stale-read-at-commit probe: the player opened the dialog when the pool held 50; another
  // operation drains it to 20 before native consumption runs. urgencyConsume re-reads live state,
  // so the cast must clamp, never take the pool negative, and record the shortfall.
  await registerMedicArts();
  const actor = medic({ level: 5, lifeSupport: 20 });
  const item = art(actor, { id: "r2-drain", level: 3 });
  const usage = { ak5eOptions: { [URGENCY]: { lifeSupport: 50 } } };
  const receipt = { id: `r2-drain-${++seq}`, warnings: [] };
  await commitCast(actor, item, usage, receipt, { "flags.ak5e.artsPoints.value": 15 });
  assert.equal(actor.flags.ak5e.resourcePools.lifeSupport.value, 0, "the pool clamps at 0, never negative");
  await undoArtReceipt(actor, receipt.id);
  assert.equal(actor.flags.ak5e.resourcePools.lifeSupport.value, 20, "the receipt's numeric pool delta refunds exactly the actual 20 spend");
});

test("FINDING-6 (medium): the Urgency provider drops the engine's `receipt` argument, so the Life Support spend/request/shortfall is NEVER recorded on the cast receipt", async () => {
  // Spec A2: "LS spent in the cast's own Actor update … LS shortfall → clamps at 0 with SHORTFALL
  // RECORDED". urgencyConsume() has exactly that recording code (lifeSupportCost /
  // lifeSupportRequested / lifeSupportShortfall), but medicCastOptions wires
  // `consume: (selection, updates) => urgencyConsume(actor, item, selection, updates)` — the
  // engine passes consume(selection, updates, receipt) and the wrapper drops the third argument,
  // so every receipt-bookkeeping branch is dead. A drained-pool cast now looks on paper exactly
  // like a full-spend cast: receipt.options shows the REQUEST (50), nothing anywhere shows the
  // ACTUAL spend (20) or the 30 shortfall. This is a receipts-vs-pools accounting mismatch in
  // the lane's own single provider, and wave-2 cards/ledgers cannot display what never existed.
  await registerMedicArts();
  const actor = medic({ level: 5, lifeSupport: 20 });
  const item = art(actor, { id: "r2-record", level: 3 });
  const usage = { ak5eOptions: { [URGENCY]: { lifeSupport: 50 } } };
  const receipt = { id: `r2-record-${++seq}`, warnings: [] };
  await commitCast(actor, item, usage, receipt, { "flags.ak5e.artsPoints.value": 15 });
  assert.equal(actor.flags.ak5e.resourcePools.lifeSupport.value, 0, "the pool side works (20 LS really left the pool)");
  assert.equal(receipt.lifeSupportCost, 20, "the receipt must record what the pool actually gave");
  assert.equal(receipt.lifeSupportRequested, 50);
  assert.equal(receipt.lifeSupportShortfall, 30, "the shortfall is recorded, not hidden");
});

test("FINDING-2 (medium): two cast-option providers each contributing a Life Support cost double-count the quote but the pool loses only ONE write — receipts vs pool mismatch", async () => {
  // Contract item 2 / A4: `quote` contributions (`lifeSupportCost`) change the quote, `consume`
  // adds actor changes inside the same cast Actor update. The engine SUMS lifeSupportCost across
  // providers for the quote, but urgencyConsume (and any provider following its pattern) computes
  // an ABSOLUTE pool value from the live Actor, which does not include another provider's staged
  // write: the last write silently wins. The dialog promises 20 LS total, the pool loses 10, and
  // neither receipt nor warning notices. Latent for every wave-2 feature that also spends LS
  // inside the same cast (which the summed quote explicitly invites). NOT merely hypothetical: the
  // already-merged Therapist lane (therapist-features.mjs:313) uses exactly this absolute
  // `budget - quote.lifeSupportCost` write pattern, so a Healing-pool cast using Urgency plus any
  // Therapist LS cost in one Actor update loses one of the two spends today.
  await registerMedicArts();
  const actor = medic({ level: 5, lifeSupport: 80, points: 10 });
  const item = art(actor, { id: "r2-ls2", level: 1 });
  registerArtCastOptions((candidateActor, candidate) => candidate?.id !== "r2-ls2" ? null : {
    id: "r2-ls2-feature",
    label: "R2 second LS spender",
    fields: [],
    validate: () => ({ warnings: [], errors: [] }),
    quote: () => ({ lifeSupportCost: 10 }),
    consume: (_selection, updates) => {
      updates.actor ??= {};
      const live = Number(candidateActor?.flags?.ak5e?.resourcePools?.lifeSupport?.value) || 0;
      updates.actor["flags.ak5e.resourcePools.lifeSupport.value"] = live - 10;
    }
  });
  const usage = { ak5eOptions: { [URGENCY]: { lifeSupport: 10 }, "r2-ls2-feature": {} } };
  const choices = artAvailability(actor, item, usage);
  assert.equal(choices.quote.lifeSupportCost, 20, "the engine aggregates both providers' LS costs into one quoted cost");
  const receipt = { id: `r2-ls2-${++seq}`, warnings: [] };
  await commitCast(actor, item, usage, receipt, { "flags.ak5e.artsPoints.value": choices.quote.remaining });
  assert.equal(actor.flags.ak5e.resourcePools.lifeSupport.value, 60,
    "the pool must lose exactly the 20 LS the quote charged; today one provider's staged write is overwritten (70)");
});

/* ------------------------------------------------------------------ A4: cast options */

test("A4: two providers claiming the same option id render ONE dialog card section, not a duplicate", async () => {
  registerArtCastOptions((_a, item) => item?.id !== "r2-dup-art" ? null : {
    id: "r2-dup", label: "first", fields: []
  });
  registerArtCastOptions((_a, item) => item?.id !== "r2-dup-art" ? null : {
    id: "r2-dup", label: "second", fields: []
  });
  const actor = medic({ level: 3 });
  const item = art(actor, { id: "r2-dup-art", level: 1, pool: FLAME });
  const model = await artCastOptionsFor(actor, item, null, {});
  const dupes = model.options.filter(option => option.id === "r2-dup");
  assert.equal(dupes.length, 1, "a shared option id renders once");
  assert.equal(dupes[0].label, "first", "the first registered provider wins; the second is ignored by identity order");
});

test("A4: a throwing provider warns and is isolated; healthy providers still quote, validate and consume", async () => {
  registerArtCastOptions((_a, candidate) => candidate?.id !== "r2-qt-art" ? null : {
    id: "r2-quote-thrower", label: "thrower", fields: [],
    quote: () => { throw new Error("r2 quote blew up"); },
    validate: () => ({ warnings: [], errors: [] }),
    consume: () => { throw new Error("r2 consume blew up"); }
  });
  registerArtCastOptions((_a, candidate) => candidate?.id !== "r2-qt-art" ? null : {
    id: "r2-quote-healthy", label: "healthy", fields: [],
    quote: () => ({ discounts: [{ amount: 1, source: "healthy" }] })
  });
  const actor = medic({ level: 3 });
  const item = art(actor, { id: "r2-qt-art", level: 2, pool: FLAME });
  const model = await artCastOptionsFor(actor, item, null, {});
  assert.ok(model.warnings.some(warning => /blew up/i.test(warning.text)), "the throwing provider is announced, not dropped silently");
  assert.ok(model.options.some(option => option.id === "r2-quote-healthy"), "the healthy provider is still offered");
  const usage = { ak5eOptions: { "r2-quote-thrower": {}, "r2-quote-healthy": {} } };
  const choices = artAvailability(actor, item, usage);
  assert.equal(choices.quote.cost, 1, "the healthy discount lands even though the other provider failed (2 AP − 1)");
  const receipt = { id: `r2-qt-${++seq}`, warnings: [] };
  const updates = { actor: {} };
  const warnings = applyArtCastOptions({ actor, item }, usage, updates, receipt);
  assert.ok(warnings.some(warning => /consume blew up/i.test(warning.text)), "the throwing consumer warns on commit and never breaks the cast");
});

test("A4/security: option-selection parsing rejects malformed paths; an `__proto__` option id must not touch Object.prototype", () => {
  const collected = collectArtCastOptionSelections({ entries: [
    ["ak5eOptions.bad.id.extra", "x"],           // 4 parts → ignored
    ["ak5eOptions.hack!id.field", "x"],          // invalid id → ignored
    ["other.thing.field", "x"],                  // wrong prefix → ignored
    ["ak5eOptions.r2_ok.n1", "30"],              // numeric string coerced
    ["ak5eOptions.r2_ok.n2", "on"],              // checkbox coercion
    ["ak5eOptions.r2_ok.n3", "  "],              // blank string kept, not coerced
    ["ak5eOptions.__proto__.pwned", "polluted"]  // id passes the [A-Za-z0-9_-]{1,64} gate
  ] });
  assert.equal(collected.r2_ok.n1, 30, "numeric strings coerce to numbers");
  assert.equal(collected.r2_ok.n2, true, "\"on\" coerces to checked");
  assert.equal(collected.r2_ok.n3, "  ", "blank strings do not become numbers");
  assert.ok(!Object.hasOwn(collected, "__proto__"), "no own __proto__ key on the result");
  try {
    assert.ok(!("pwned" in Object.prototype),
      "FINDING-3 (low, self-client only): a crafted ak5eOptions.__proto__.<field> form entry writes onto the global Object.prototype. The ledger's allowedPath() explicitly blocks __proto__/prototype/constructor segments; this seam does not. A malicious client pollutes only its own session, so severity is low, but the inconsistency is a genuine validation hole");
  } finally {
    delete Object.prototype.pwned; // never poison later tests in this process
  }
});

/* ------------------------------------------------------------------ A5: reaction state */

test("A5/reactions: perTrigger gate, receipt replay and single refund compose correctly; a refused spend writes nothing", async () => {
  const actor = medic({ level: 3 });
  await actor.update({ "flags.ak5e.reactionBudget": { max: 1, spent: 0, extra: [], triggers: {}, receipts: {} } });
  const first = await spendReaction(actor, { triggerId: "r2-trigger", receipt: "r2-receipt-1" });
  assert.equal(first.ok, true);
  assert.equal(getReactions(actor).spent, 1);
  const perTrigger = await spendReaction(actor, { triggerId: "r2-trigger", receipt: "r2-receipt-2" });
  assert.equal(perTrigger.ok, false, "a second Reaction cannot answer the same trigger");
  assert.equal(perTrigger.reason, "perTrigger");
  assert.equal(getReactions(actor).spent, 1, "a refused spend writes nothing");
  assert.equal(actor.flags.ak5e.reactionBudget.receipts["r2-receipt-2"], undefined, "a refused spend records no receipt");
  const replay = await spendReaction(actor, { triggerId: "r2-other-trigger", receipt: "r2-receipt-1" });
  assert.deepEqual({ ok: replay.ok, replayed: replay.replayed, pool: replay.pool }, { ok: true, replayed: true, pool: "base" },
    "the same receipt replays without a second spend");
  assert.equal(getReactions(actor).spent, 1);
  const refund = await refundReaction(actor, { receipt: "r2-receipt-1", clearTrigger: true });
  assert.equal(refund.ok, true);
  assert.equal(getReactions(actor).spent, 0);
  const doubleRefund = await refundReaction(actor, { receipt: "r2-receipt-1" });
  assert.equal(doubleRefund.replayed, true, "a second refund of the same receipt refunds nothing");
  assert.equal(getReactions(actor).spent, 0);
});

test("A5: beginArtCastContext warns (never blocks) when no Reaction remains and mutates nothing on refusal; a resubmitted cast replays its spend", async () => {
  const actor = medic({ level: 3 });
  await actor.update({ "flags.ak5e.reactionBudget": { max: 1, spent: 1, extra: [], triggers: {}, receipts: {} } });
  const before = structuredClone(actor.flags.ak5e.reactionBudget);
  const started = await beginArtCastContext(actor, { castingTime: "reaction", triggerEventId: "r2-ctx-a", requiredTargetUuid: "Actor.missing" }, []);
  assert.equal(started.allowed, true, "the cast may still proceed without a Reaction (warning only)");
  assert.ok(started.warnings.some(warning => warning.id === "reaction" && /may still proceed/.test(warning.text)));
  assert.ok(started.warnings.some(warning => warning.id === "required-target"), "a missing required target is warned, never blocked");
  assert.deepEqual(actor.flags.ak5e.reactionBudget, before, "a warned-out cast must not mutate the budget");
  const healthy = medic({ level: 3 });
  await healthy.update({ "flags.ak5e.reactionBudget": { max: 1, spent: 0, extra: [], triggers: {}, receipts: {} } });
  const a = await beginArtCastContext(healthy, { castingTime: "reaction", reactionReceiptId: "r2-ctx-b" }, []);
  assert.equal(a.reaction?.ok, true);
  const b = await beginArtCastContext(healthy, { castingTime: "reaction", reactionReceiptId: "r2-ctx-b" }, []);
  assert.equal(b.reaction?.replayed, true, "resubmitting the same cast id replays instead of double-spending");
  assert.equal(getReactions(healthy).spent, 1);
});

test("A5/wrong-defaults: a corrupt stored reaction budget normalizes to the printed Reactive default, never an inflated one", () => {
  const actor = medic({ level: 3 });
  actor.flags.ak5e.reactionBudget = { max: "999", spent: -4, extra: "not-an-array", triggers: null, receipts: null };
  const state = getReactions(actor);
  assert.deepEqual({ max: state.max, spent: state.spent, available: state.available }, { max: 1, spent: 0, available: 1 },
    "garbage flag data falls back to max 1 / spent 0, never a stringified 999 or a negative refund balance");
});

/* ------------------------------------------------------------------ A6: linked receipts / undo */

function ledgerReceipt(id, actor, changes = []) {
  return { id, actorUuid: actor.uuid, status: "available", epoch: 0, windowId: "free:0", changes };
}
async function parented(id, parentId = `${id}-parent`) {
  const source = createTestActor({ id, name: id, owner: true });
  await source.update({ "flags.ak5e.artReceipts": [ledgerReceipt(parentId, source)] });
  return { source, parentId };
}
// Fake the player→GM chat bridge (same pattern as the frozen checkpoint suites).
function enableRelayChatDelivery() {
  const original = ChatMessage.implementation.create.bind(ChatMessage.implementation);
  ChatMessage.implementation.create = async data => {
    const message = await original(data);
    const update = message.update.bind(message);
    message.update = async changes => {
      const result = await update(changes);
      await Hooks.callAll("updateChatMessage", message, {}, game.user.id);
      return result;
    };
    queueMicrotask(async () => {
      const requester = game.user;
      game.user = game.users.activeGM;
      try { await Hooks.callAll("createChatMessage", message, {}, message.author.id); }
      finally { game.user = requester; }
    });
    return message;
  };
}

test("B-310 probe (variant): STACKED same-target relays undo in reverse causal order; an interleaved later edit preserves exactly the drifted child and stays retryable", async () => {
  // Two relayed children changed the same target HP 10→15→18. Parent undo must revert 18→15 first,
  // then 15→10. A third client edits 15→16 BETWEEN the two reverts: only the drifted child may
  // stay pending; the clean child must be marked undone exactly once, and a retry after the
  // target returns to the recorded post-state must finish without refunding the source twice.
  const { source, parentId } = await parented("r2-stack");
  await source.update({ "flags.ak5e.artsPoints": { maximum: 16, value: 8, maximumArtLevel: 5 } });
  source.flags.ak5e.artReceipts[0].changes = [{ path: "flags.ak5e.artsPoints.value", before: 10, after: 8 }];
  const target = createTestActor({ id: "r2-stack-target", owner: true, hp: { value: 18, max: 30, temp: 0 } });
  const c1 = { id: "r2-stack-c1", relay: { targetUuid: target.uuid, changes: { "system.attributes.hp.value": 15 }, restore: { "system.attributes.hp.value": 10 } } };
  const c2 = { id: "r2-stack-c2", relay: { targetUuid: target.uuid, changes: { "system.attributes.hp.value": 18 }, restore: { "system.attributes.hp.value": 15 } } };
  await appendLinkedReceipt(source, parentId, c1, []);
  await appendLinkedReceipt(source, parentId, c2, []);
  const originalUpdate = target.update.bind(target);
  let driftArmed = true;
  target.update = async (changes, options) => {
    const res = await originalUpdate(changes, options);
    if (driftArmed && changes["system.attributes.hp.value"] === 15) {
      driftArmed = false;
      await originalUpdate({ "system.attributes.hp.value": 16 }); // a later client edit lands here
    }
    return res;
  };
  const first = await undoArtReceipt(source, parentId);
  const ledger = () => source.flags.ak5e.artReceipts;
  assert.equal(target.system.attributes.hp.value, 16, "the drifted child must never overwrite the later edit");
  assert.equal(ledger().find(r => r.id === "r2-stack-c2").status, "undone", "the clean child completed");
  assert.equal(ledger().find(r => r.id === "r2-stack-c1").targetUndoPending, true, "the drifted child stays retryable");
  assert.equal(source.flags.ak5e.artsPoints.value, 10, "the source AP restores even while the target is pending");
  assert.ok(first.conflictCount >= 1, "the preserved drift is publicly reported");
  await originalUpdate({ "system.attributes.hp.value": 15 }); // drift cleared; recorded post-state returns
  await undoArtReceipt(source, parentId);
  assert.equal(target.system.attributes.hp.value, 10, "the retry finishes the earlier relay");
  assert.equal(source.flags.ak5e.artsPoints.value, 10, "a pending-retry undo must not refund the source twice");
  assert.deepEqual(ledger().filter(r => r.parentReceiptId === parentId).map(r => r.status).sort(), ["undone", "undone"]);
});

test("B-311 probe (variant): a three-level parent→child→grandchild AP chain composes exactly once in reverse causal order", async () => {
  const { source, parentId } = await parented("r2-chain");
  await source.update({ "flags.ak5e.artsPoints": { maximum: 16, value: 6, maximumArtLevel: 5 } });
  const parent = ledgerReceipt(parentId, source, [{ path: "flags.ak5e.artsPoints.value", before: 12, after: 10 }]);
  await source.update({ "flags.ak5e.artReceipts": [parent] });
  await appendLinkedReceipt(source, parentId, { id: "r2-chain-c1" }, [{ path: "flags.ak5e.artsPoints.value", before: 10, after: 8 }]);
  await appendLinkedReceipt(source, "r2-chain-c1", { id: "r2-chain-c2" }, [{ path: "flags.ak5e.artsPoints.value", before: 8, after: 6 }]);
  const result = await undoArtReceipt(source, parentId);
  assert.equal(source.flags.ak5e.artsPoints.value, 12,
    "reverse-causal composition 6→8→10→12: flat max/overwrite strategies yield 8 or 10 (B-311's failure signature)");
  assert.deepEqual(source.flags.ak5e.artReceipts.map(r => [r.id, r.status]),
    [[parentId, "undone"], ["r2-chain-c1", "undone"], ["r2-chain-c2", "undone"]]);
  assert.equal(result.conflictCount, 0);
});

test("B-311 probe (variant): undoing the child first, then the parent, still lands on the pre-parent value exactly once", async () => {
  const { source, parentId } = await parented("r2-mid");
  await source.update({ "flags.ak5e.artsPoints": { maximum: 16, value: 8, maximumArtLevel: 5 } });
  const parent = ledgerReceipt(parentId, source, [{ path: "flags.ak5e.artsPoints.value", before: 12, after: 10 }]);
  await source.update({ "flags.ak5e.artReceipts": [parent] });
  await appendLinkedReceipt(source, parentId, { id: "r2-mid-c1" }, [{ path: "flags.ak5e.artsPoints.value", before: 10, after: 8 }]);
  await undoArtReceipt(source, "r2-mid-c1");
  assert.equal(source.flags.ak5e.artsPoints.value, 10);
  await undoArtReceipt(source, parentId);
  assert.equal(source.flags.ak5e.artsPoints.value, 12, "sequential child-then-parent undo composes, never double-refunds");
});

test("A6: a child in the CURRENT window still refuses undo while its parent is locked; the locked parent refuses too", async () => {
  const { source, parentId } = await parented("r2-lock");
  await game.settings.set("ak5e", "encounterEpoch", 1); // the parent (epoch 0) is now a previous window
  await appendLinkedReceipt(source, parentId, { id: "r2-lock-child" }, []);
  assert.equal(source.flags.ak5e.artReceipts.find(r => r.id === "r2-lock-child").epoch, 1, "the child itself is in the current window");
  await assert.rejects(undoArtReceipt(source, "r2-lock-child"), /parent/i, "a locked parent locks its children (contract item 4)");
  await assert.rejects(undoArtReceipt(source, parentId), /locked/i);
});

test("B-310 probe (token form): a relay recorded with a TOKEN uuid still restores the base Actor on parent undo", async () => {
  // relayTarget() must bridge Token→Actor on record AND on revert; a token-form uuid that only
  // resolved at record time would orphan the undo (target never found at revert).
  const { source, parentId } = await parented("r2-token");
  const target = createTestActor({ id: "r2-token-target", owner: true, hp: { value: 20, max: 30, temp: 0 } });
  const token = { documentName: "Token", uuid: "Token.r2-scene-target", actor: target };
  globals.docs.set(token.uuid, token);
  await appendLinkedReceipt(source, parentId, { id: "r2-token-child", relay: {
    targetUuid: token.uuid,
    changes: { "system.attributes.hp.value": 20 }, restore: { "system.attributes.hp.value": 12 }
  } }, []);
  assert.equal(source.flags.ak5e.artReceipts.find(r => r.id === "r2-token-child").relay.targetUuid, token.uuid,
    "the receipt keeps the caller's token-form identity instead of silently rewriting it");
  const result = await undoArtReceipt(source, "r2-token-child");
  assert.equal(target.system.attributes.hp.value, 12, "undo resolves the token to the base Actor and restores it");
  assert.equal(result.conflictCount, 0);
});

test("B-310 probe (identity): a tampered relay targetUuid fails closed — shape-valid restores must not blind-apply to a substituted Actor", async () => {
  const { source, parentId } = await parented("r2-identity");
  const target = createTestActor({ id: "r2-identity-a", owner: true, hp: { value: 20, max: 30, temp: 0 } });
  await appendLinkedReceipt(source, parentId, { id: "r2-identity-child", relay: {
    targetUuid: target.uuid, changes: { "system.attributes.hp.value": 20 }, restore: { "system.attributes.hp.value": 12 }
  } }, []);
  const victim = createTestActor({ id: "r2-identity-b", owner: true, hp: { value: 7, max: 30, temp: 0 } });
  const child = source.flags.ak5e.artReceipts.find(r => r.id === "r2-identity-child");
  child.relay.targetUuid = victim.uuid; // hand-edit: point the recorded revert at a different Actor
  const result = await undoArtReceipt(source, "r2-identity-child");
  assert.equal(victim.system.attributes.hp.value, 7,
    "the substituted target's HP (7) does not match the recorded post-state (20): it must be preserved, never blind-restored by a shape-valid validator");
  assert.equal(target.system.attributes.hp.value, 20, "the original target is no longer touched either");
  assert.ok(result.conflicts.length > 0, "the identity mismatch surfaces as a visible conflict, not silence");
  assert.equal(source.flags.ak5e.artReceipts.find(r => r.id === "r2-identity-child").status, "available",
    "a conflicted relay stays retryable rather than being falsely marked undone");
});

test("B-312 probe (variant): with the GM online but the source finalization write failing after the relay applied, the PARENT undo alone recovers the target from the GM record — no retry needed", async () => {
  // The frozen checkpoint file proves the retry path; this probes the other half of the "Fixed
  // means": "target success plus failed finalization remains ORDINARILY UNDOABLE".
  registerArtRelayHooks();
  const { source, parentId } = await parented("r2-b312");
  await source.update({ "flags.ak5e.artsPoints": { maximum: 16, value: 8, maximumArtLevel: 5 } });
  source.flags.ak5e.artReceipts[0].changes = [{ path: "flags.ak5e.artsPoints.value", before: 10, after: 8 }];
  const target = createTestActor({ id: "r2-b312-target", owner: false, hp: { value: 10, max: 20, temp: 0 } });
  enableRelayChatDelivery();
  game.user = game.users.get("player");
  const update = source.update.bind(source);
  let failed = false;
  source.update = async changes => {
    if (!failed && target.system.attributes.hp.value === 15 && Object.hasOwn(changes, "flags.ak5e.artReceipts")) {
      failed = true;
      throw new Error("fixture: source finalization failed");
    }
    return update(changes);
  };
  const input = { id: "r2-b312-child", relay: { targetUuid: target.uuid, operation: { id: "hp-heal", data: { amount: 5 } } } };
  await assert.rejects(appendLinkedReceipt(source, parentId, input, []), /finalization failed/i);
  assert.equal(target.system.attributes.hp.value, 15, "the injected fault lands AFTER the GM applied the heal");
  const intent = source.flags.ak5e.artReceipts.find(r => r.id === input.id);
  assert.ok(intent && intent.status === "available" && intent.relay?.recoveryPending,
    "a durable, user-accessible recovery receipt remains on the source before any target crossing");
  await undoArtReceipt(source, parentId); // plain parent undo — the intended ordinary recovery
  assert.equal(target.system.attributes.hp.value, 10, "parent undo resolves the target from the GM's authoritative record");
  assert.equal(source.flags.ak5e.artsPoints.value, 10, "the source spend restores exactly once");
  assert.equal(source.flags.ak5e.artReceipts.find(r => r.id === input.id).status, "undone");
  // A replay after completion must never re-apply the healed target change.
  await appendLinkedReceipt(source, parentId, input, []).catch(() => {});
  assert.equal(target.system.attributes.hp.value, 10, "stable-ID replay never reapplies or recaptures a later before-state");
});

test("FINDING-4 (low): a NEW linked action reusing an already-UNDONE receipt id is silently swallowed", async () => {
  // Contract item 4: appendLinkedReceipt records a child receipt. Rejecting a REPLAY of a live
  // action under the same id is correct and loudly guarded. But when the previous action with
  // that id is already undone, the same-id call is a DIFFERENT action: the code returns the old
  // undone receipt without recording, applying, or warning — a caller that already applied an
  // owned-target change ends up with an untracked, un-undoable, unannounced edit.
  const { source, parentId } = await parented("r2-reuse");
  const targetA = createTestActor({ id: "r2-reuse-a", owner: true, hp: { value: 20, max: 30, temp: 0 } });
  await appendLinkedReceipt(source, parentId, { id: "r2-reuse-child", relay: {
    targetUuid: targetA.uuid, changes: { "system.attributes.hp.value": 20 }, restore: { "system.attributes.hp.value": 12 }
  } }, []);
  await undoArtReceipt(source, "r2-reuse-child");
  const targetB = createTestActor({ id: "r2-reuse-b", owner: true, hp: { value: 20, max: 30, temp: 0 } });
  await targetB.update({ "system.attributes.hp.value": 9 }); // the caller applies FIRST, then records
  const swallowed = await appendLinkedReceipt(source, parentId, { id: "r2-reuse-child", relay: {
    targetUuid: targetB.uuid, changes: { "system.attributes.hp.value": 9 }, restore: { "system.attributes.hp.value": 20 }
  } }, []).then(() => true, () => false);
  if (swallowed) {
    const stored = source.flags.ak5e.artReceipts.find(r => r.id === "r2-reuse-child");
    assert.equal(stored.relay.targetUuid, targetB.uuid,
      "FINDING-4: appendLinkedReceipt resolved successfully but returned the OLD undone receipt (target A); the new target-B change 20→9 is now permanent and invisible to undo. Refusing loudly (like every other retry guard does) or recording the new child are both acceptable; silent reuse is not");
  }
});

/* ------------------------------------------------------------------ A4/undo-entry capture */

test("FINDING-5 (medium): a provider consume that DELETES a flag (Foundry `-=` update) joins the cast Actor update but is captured by no undo entry", async () => {
  // Contract item 2: consume "adds its actor changes to the cast's own Actor update (so undoing
  // the cast reverses them)". captureArtChanges() skips any key containing ".-=" — so a provider
  // that removes a flag inside the committed update leaves the receipt with NO entry for the
  // deletion. Undoing the cast cannot reverse it, breaking WORKFLOW §3.2's "every change
  // undoable within the encounter window". (The engine's own undo code EMITS `-=` restores, so
  // the capability clearly belongs in capture as well.)
  const actor = medic({ level: 3 });
  await actor.update({ "flags.ak5e.medic": { enabled: true, spellcastingAbility: "wis", r2marker: "keep-me" } });
  const item = art(actor, { id: "r2-del-art", level: 1, pool: FLAME });
  registerArtCastOptions((_a, candidate) => candidate?.id !== "r2-del-art" ? null : {
    id: "r2-deleter", label: "deletes a flag", fields: [],
    consume: (_sel, updates) => { updates.actor ??= {}; updates.actor["flags.ak5e.medic.-=r2marker"] = null; }
  });
  const usage = { ak5eOptions: { "r2-deleter": {} } };
  const receipt = { id: `r2-del-${++seq}`, warnings: [] };
  await commitCast(actor, item, usage, receipt, { "flags.ak5e.artsPoints.value": 9 });
  assert.equal(actor.flags.ak5e.medic.r2marker, undefined, "the delete applied inside the committed update (the write itself works)");
  await undoArtReceipt(actor, receipt.id);
  assert.equal(actor.flags.ak5e.medic.r2marker, "keep-me",
    "undoing the cast must reverse EVERY change its own Actor update made, including deletions");
});

/* ------------------------------------------------------------------ A7/A8 correlation */

test("A7/hostile: token dispositions decide hostility; neutral (0) on either side is NOT hostile, unknown is null", () => {
  const source = createTestActor({ id: "r2-h-src" });
  const friendly = createTestActor({ id: "r2-h-ally" });
  const foe = createTestActor({ id: "r2-h-foe" });
  const neutral = createTestActor({ id: "r2-h-neut" });
  const ghost = createTestActor({ id: "r2-h-ghost" }); // never gets a token/disposition → unknown
  source.token = { disposition: 1 };
  friendly.token = { disposition: 1 };
  foe.token = { disposition: -1 };
  neutral.token = { disposition: 0 };
  assert.equal(hostileToward(source, [foe.uuid]), true, "opposite non-zero dispositions are hostile");
  assert.equal(hostileToward(source, [friendly.uuid]), false, "the same disposition is not hostile");
  assert.equal(hostileToward(source, [neutral.uuid]), false, "a NEUTRAL target is not hostile (contract lane note: previously unpinned)");
  source.token = { disposition: 0 };
  assert.equal(hostileToward(source, [foe.uuid]), false, "a NEUTRAL source is not hostile");
  source.token = { disposition: 1 };
  assert.equal(hostileToward(ghost, [foe.uuid]), null, "an unknown source disposition is null, not false");
  assert.equal(hostileToward(source, [ghost.uuid]), null, "an unknown target disposition is null");
  assert.equal(hostileToward(source, []), null, "no targets at all is unknown, not 'friendly'");
});

test("A7/hpRestored: reports HP actually restored after clamping, excludes temporary HP, and stays silent on a zero-restore heal", async () => {
  const source = createTestActor({ id: "r2-hp-src" });
  const target = createTestActor({ id: "r2-hp-tgt", hp: { value: 6, max: 10, temp: 3 } });
  const message = { id: "r2-hp-msg", uuid: "ChatMessage.r2-hp-msg", speaker: { actor: source.id },
    flags: { ak5e: { castId: "cast-r2" } } };
  const seen = [];
  const handler = event => seen.push(event);
  onAk5eEvent("hpRestored", handler);
  try {
    const options = { originatingMessage: message };
    capturePreApplyDamage(target, -6, {}, options);
    target.system.attributes.hp.value = 10; // 6 + 6 rolled, clamped at max 10; temp pool untouched
    await handleApplyDamage(target, -6, options);
    assert.equal(seen.length, 1);
    assert.deepEqual({ amount: seen[0].amount, hpBefore: seen[0].hpBefore, hpAfter: seen[0].hpAfter,
      castId: seen[0].castId, actorUuid: seen[0].actorUuid },
    { amount: 4, hpBefore: 6, hpAfter: 10, castId: "cast-r2", actorUuid: target.uuid },
    "amount is the HP actually restored (4), never the rolled 6; temp HP is excluded");
    // A fully-healed target restores nothing: no event, no noise.
    const options2 = { originatingMessage: message };
    capturePreApplyDamage(target, -6, {}, options2);
    await handleApplyDamage(target, -6, options2);
    assert.equal(seen.length, 1, "a zero-restore heal fires no hpRestored");
  } finally { offAk5eEvent("hpRestored", handler); }
});

test("A8: a Promise-returning or throwing damage resolver is ignored with a warning; the next resolver still applies", async () => {
  const target = createTestActor({ id: "r2-res-tgt", hp: { value: 50, max: 50, temp: 0 } });
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.join(" ")); };
  try {
    registerDamageResolver(context => context?.options?.r2tag === "async" ? Promise.resolve({ reduce: 40 }) : {});
    registerDamageResolver(context => { if (context?.options?.r2tag === "mixed") throw new Error("r2 resolver blew up"); return {}; });
    registerDamageResolver(context => context?.options?.r2tag === "mixed" ? { reduce: 3 } : {});
    const updatesAsync = { "system.attributes.hp.value": 40, "system.attributes.hp.temp": 0 };
    applyArtDamageResolvers(target, 10, updatesAsync, { r2tag: "async", originatingMessage: { uuid: "ChatMessage.r2-async" } });
    assert.deepEqual(updatesAsync, { "system.attributes.hp.value": 40, "system.attributes.hp.temp": 0 },
      "an async resolver is ignored and never awaited (resolvers must stay synchronous)");
    assert.match(warnings.join("\n"), /Promise|asynchronous/i, "the ignored Promise resolver is announced");
    const updatesMixed = { "system.attributes.hp.value": 40, "system.attributes.hp.temp": 0 };
    applyArtDamageResolvers(target, 10, updatesMixed, { r2tag: "mixed", originatingMessage: { uuid: "ChatMessage.r2-mixed" } });
    assert.equal(updatesMixed["system.attributes.hp.value"], 43,
      "the throwing resolver is skipped with a warning; the next flat reduction (10 − 3) still lands");
  } finally { console.warn = originalWarn; }
});

test("A8/floor: a reduction larger than the damage floors at 0 — temp HP is not nibbled and HP is not pushed above current", async () => {
  const target = createTestActor({ id: "r2-of-tgt", hp: { value: 50, max: 50, temp: 5 } });
  registerDamageResolver(context => context?.options?.r2tag === "overkill" ? { reduce: 20 } : {});
  const updates = { "system.attributes.hp.value": 30, "system.attributes.hp.temp": 4 };
  applyArtDamageResolvers(target, 10, updates, { r2tag: "overkill", originatingMessage: { uuid: "ChatMessage.r2-overkill" } });
  assert.deepEqual(updates, { "system.attributes.hp.value": 50, "system.attributes.hp.temp": 5 },
    "reduce ≥ damage: pending damage drops to the floor of 0; the pending temp/HP values revert to current, never below");
});

test("A8: an outcome confirmed AFTER application reports the timing warning / manual-correction path and never reverses applied damage", async () => {
  const target = createTestActor({ id: "r2-late-tgt", hp: { value: 40, max: 40, temp: 0 } });
  const message = { uuid: "ChatMessage.r2-late", id: "r2-late", rolls: [{ total: 10, options: { type: "fire" } }] };
  const updates = { "system.attributes.hp.value": 30, "system.attributes.hp.temp": 0 };
  applyArtDamageResolvers(target, 10, updates, { r2tag: "late", originatingMessage: message }); // marks message|target applied
  const late = await confirmArtOutcome({ messageUuid: message.uuid, targetUuid: target.uuid, outcome: { reduce: 5 } });
  assert.deepEqual({ late: late.late, manual: late.manualCorrection }, { late: true, manual: true },
    "a post-application confirmation is reported late, not silently reversed");
  assert.equal(updates["system.attributes.hp.value"], 30, "the late outcome changed nothing");
  const early = await confirmArtOutcome({ messageUuid: "ChatMessage.r2-not-yet", targetUuid: target.uuid, outcome: {} });
  assert.equal(early.late, false, "a pre-application confirmation records normally");
});

/* ------------------------------------------------------------------ A1: setup / progression */

test("A1: Medic setup applied twice creates ONE receipt; undo restores a pristine no-Arts flag state", async () => {
  const actor = createTestActor({ name: "R2 Setup", class: "class-medic", level: 1, owner: true });
  actor.type = "character";
  actor.flags.ak5e.medic = { enabled: true, spellcastingAbility: "wis" };
  const plan1 = await previewMedicSetup(actor);
  const applied = await applyMedicSetup(actor, { confirmed: true, contextKey: plan1.contextKey });
  assert.ok(applied.receipt, "the first apply recorded a receipt");
  assert.equal(actor.flags.ak5e.casting?.enabled, true);
  assert.ok(actor.flags.ak5e.artsPoints?.maximum > 0, "the native Arts flags are written (contract item 1)");
  const plan2 = await previewMedicSetup(actor);
  const again = await applyMedicSetup(actor, { confirmed: true, contextKey: plan2.contextKey });
  assert.equal(again.receipt, null, "an idempotent re-apply must not create or overwrite a receipt");
  assert.equal(actor.flags.ak5e.artReceipts.length, 1, "the ledger still holds exactly the setup that changed state");
  await undoArtReceipt(actor, applied.receipt.id);
  assert.equal(actor.flags.ak5e.casting, undefined, "undo deletes the setup's freshly-created casting flag");
  assert.equal(actor.flags.ak5e.artsPoints, undefined, "undo deletes the setup's freshly-created artsPoints flag");
  assert.equal(actor.flags.ak5e.medic.enabled, true, "unrelated state survives the undo");
  assert.equal(actor.items.filter(item => item.type === "feat").length, 0, "granted feature Items are removed by undo");
});

test("A1/progression: forged HP and ASI numerics clamp to legal values, and re-applying never double-grants HP or starting cash (B-132 class)", async () => {
  const actor = createTestActor({ name: "R2 Progress", class: "class-medic", level: 2, owner: true });
  actor.type = "character";
  actor.system.attributes.hp.max = 25;
  actor.system.currency = { cp: 0 };
  const choices = {
    saves: ["con", "wis"], skills: ["per", "prc"],
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed", roll: 99 }, 2: { mode: "rolled", roll: 99 } },
    asi: { 4: { increases: [{ ability: "con", amount: 55 }] } }
  };
  const plan = await previewMedicProgression(actor, choices);
  assert.deepEqual(plan.pending, [], "valid saves/skills; no ASI level is due at character level 2");
  const applied = await applyMedicProgression(actor, { confirmed: true, contextKey: plan.contextKey, choices });
  assert.ok(applied.receipt, "the native Arts flag write is receipted (contract item 1)");
  assert.equal(actor.system.attributes.hp.max, 25 + 6 + 6,
    "level-1 fixed is 6 (smuggled roll 99 ignored); a rolled 99 clamps to the d6 maximum 6; it must never grant 99 HP");
  assert.equal(actor.system.currency.cp, 1300, "the cash option pays exactly 1300 LMD once");
  assert.equal(actor.system.abilities.con.value, 10, "an ASI amount 55 is refused outright (pending), never applied");
  const plan2 = await previewMedicProgression(actor, choices);
  await applyMedicProgression(actor, { confirmed: true, contextKey: plan2.contextKey, choices });
  assert.equal(actor.system.attributes.hp.max, 37, "re-applying never repeats HP rolls already recorded");
  assert.equal(actor.system.currency.cp, 1300, "re-applying never pays starting cash twice");
  assert.equal(actor.flags.ak5e.artReceipts.length, 1, "the second apply changes nothing and records nothing new");
});

test("A1: a non-Medic actor is untouched; registerMedicArts stays a no-op after its first call", async () => {
  const again = await registerMedicArts();
  assert.equal(again, false, "registration is idempotent across calls");
  const nobody = createTestActor({ name: "Not A Medic", type: "character", owner: true });
  await assert.rejects(previewMedicSetup(nobody), /Medic|owned|applicable/i);
  assert.equal(nobody.flags.ak5e.casting, undefined);
  assert.equal(nobody.flags.ak5e.artsPoints, undefined);
});

/* ------------------------------------------------------------------ expiry gaps */

test("expiry gaps: an expiry without its anchor fields refuses to arm an immortal rider; a time-expired rider never matches a live event", async () => {
  const actor = medic({ level: 3 });
  await assert.rejects(registerRider({ id: "r2-immortal", actor, trigger: "hitTaken", consume: "untilExpiry",
    expiry: { trigger: "combatEnd" } }), /combatUuid/i,
    "a combatEnd rider with no combatUuid would silently never expire (tagHasExpired returns false for missing anchors)");
  await assert.rejects(registerRider({ id: "r2-immortal2", actor, trigger: "hitTaken", consume: "untilExpiry",
    expiry: { trigger: "time" } }), /worldTime/i, "a time rider needs its anchor");
  await registerRider({ id: "r2-stale", actor, trigger: "hitTaken", consume: "untilExpiry",
    expiry: { trigger: "time", worldTime: 50 } }); // game.time.worldTime is 100
  await registerRider({ id: "r2-live", actor, trigger: "hitTaken", consume: "untilExpiry",
    expiry: { trigger: "manual" } });
  const matched = matchRiders({ kind: "hitTaken", actorUuid: actor.uuid }, actor);
  assert.deepEqual(matched.map(r => r.id), ["r2-live"],
    "the expired rider is filtered at match time while the manual rider stays — neither immortal nor silently dropped");
});


/* ------------------------------------------------------------------ NEW-D: commit-time re-validation runs at cast level */

class R2NativeActivity {
  constructor(actor, item, activation = "action") {
    this.actor = actor; this.item = item; this.type = "cast"; this.activation = { type: activation };
    this.shouldCancel = false;
  }
  async use(usage = {}, dialog = {}, message = {}) {
    const workingUsage = { ...usage }, workingDialog = { ...dialog };
    const workingMessage = { data: structuredClone(message.data ?? {}), update: async () => {} };
    for (const hook of Hooks._hooks.get("dnd5e.preUseActivity") ?? []) {
      if (hook(this, workingUsage, workingDialog, workingMessage) === false) return null;
    }
    if (this.shouldCancel) return null;
    const updates = { actor: {} };
    for (const hook of Hooks._hooks.get("dnd5e.activityConsumption") ?? []) hook(this, workingUsage, workingMessage, updates);
    if (!Object.keys(updates.actor).length) return null;
    await this.actor.update(updates.actor);
    return { message: workingMessage };
  }
  async consume() {}
  async _prepareUsageConfig() {}
}

test("NEW-D: a native upcast commit re-validates providers at the cast level, printing no base-level waste warning", async () => {
  // The commit path (consumeArt) re-validated providers without the dialog's `{ usage }` context,
  // so Urgency's waste warning computed at the Art's base level: an L5 art upcast to L7 with 70 LS
  // (receipt 0 cost, 0 shortfall, dialog clean) printed "20 Life Support would be wasted; this Art
  // costs only 3 AP" on the card. This drives the full native commit; dropping `{ usage }` from
  // the re-validation call turns it red again.
  await registerMedicArts();
  const actor = medic({ level: 11, points: 30, maximum: 30, maxArtLevel: 9 });
  const item = art(actor, { id: "r2-native-level", level: 5 });
  wrapActivityUse(R2NativeActivity.prototype);
  Hooks.on("dnd5e.preUseActivity", prepareArtUse);
  Hooks.on("dnd5e.activityConsumption", consumeArt);
  const native = new R2NativeActivity(actor, item, "action");
  const result = await native.use({ ak5eLevel: 7, ak5eOptions: { [URGENCY]: { lifeSupport: 70 } } },
    { applicationClass: class R2NativeDialog {} });
  assert.ok(result?.message, "the native upcast commit happened");
  const receipt = actor.flags.ak5e.lastArtCast;
  assert.equal(receipt.level, 7, "the receipt records the cast level, not base");
  assert.equal(receipt.cost, 0, "70 LS fully discounts the 7 AP casting");
  assert.equal(actor.flags.ak5e.resourcePools.lifeSupport.value, 10, "the pool lost exactly the 70 quoted");
  assert.ok(!receipt.warnings.some(warning => /wasted/i.test(typeof warning === "string" ? warning : warning?.text ?? "")),
    `commit-time re-validation must not print a base-level waste warning: ${JSON.stringify(receipt.warnings)}`);
});
