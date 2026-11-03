/**
 * Post-candidate attack pass, round 2 — Wave 2 package F (Ward runtime) on the
 * T1-retry from-scratch rewrite (ward-features.mjs + ward-sheet.mjs).
 *
 * Oracle: SPEC-ward.md (F1-F9 + Integration contract) only; expectations were
 * written from the spec and the C pure rules, never from the candidate bodies.
 * Delta focus (what the rewrite claims to fix / regress):
 *   HEADLINE  token-form uuids (Scene.Token.Actor) and placeable Tokens resolve
 *             to the base Actor, and confirmed writes land on the REAL Actor —
 *             the synthetic embedded view never receives the write.
 *   W2F-1     Warding Surge reads the LIVE Reaction budget: exhausted blocks
 *             (until overridden), available is clean; corrupted store repaired.
 *   W2F-2     Collective Ward recipient/donor relay values are pinned to the
 *             recorded settlement; stray values are rejected by the relay gate.
 *   W2F-3     Donor dedup under double-listing: one Creature, one Ward pool.
 *   F1-F9     re-proof edges on the rewrite: smaller/equal replacement, partial
 *             depletion + depletion clearing, per-turn first save, Treat the
 *             Cause source binding, fresh donor retry, undo+reload durability,
 *             regeneration timing/eligibility.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { medicUses } from "../scripts/medic-uses.mjs";
import { defineMedicPools, setLifeSupport } from "../scripts/medic-features.mjs";
import { clearPoolRegistry } from "../scripts/resource-pools.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import { treatTheCauseOutcome } from "../scripts/ward-rules.mjs";
import { opaqueKey } from "../scripts/operation-kernel.mjs";
import {
  getReactions, setReactionStore, flagReactionStore, REACTION_FLAG, emitAk5eEvent
} from "../scripts/trigger-events.mjs";

const featureImport = await import("../scripts/ward-features.mjs").catch(error => ({ __loadError: error }));
const sheetImport = await import("../scripts/ward-sheet.mjs").catch(error => ({ __loadError: error }));
let registered = false;

test.before(async () => {
  setupFoundryGlobals({ isGM: false, worldTime: 300, settings: { "ak5e.artReceiptEpoch": 0 } });
  defineMedicPools();
  if (typeof featureImport.registerWardHooks === "function") {
    await featureImport.registerWardHooks();
    registered = true;
  }
});
test.after(() => teardownFoundryGlobals());

function requireRuntime() {
  assert.equal(typeof featureImport.registerWardHooks, "function",
    `Ward runtime absent (${featureImport.__loadError?.code ?? "export unavailable"}: ${featureImport.__loadError?.message ?? ""})`);
  assert.ok(featureImport.WARD_PLANS, "WARD_PLANS is required");
  assert.equal(registered, true, "registerWardHooks() did not run");
  return featureImport;
}

/* ---------------------------------------------------------------- fixtures */

function medic({ level = 15, lifeSupport = 100, id = "R2Medic" } = {}) {
  clearPoolRegistry();
  defineMedicPools();
  setReactionStore(flagReactionStore); // canonical budget unless a test says otherwise
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
  setLifeSupport(actor, lifeSupport, "r2 fixture");
  actor.uuid = `Actor.${id}`;
  globalThis._ak5eTestDocs?.set(actor.uuid, actor);
  globalThis.game.actors.set(actor.id, actor);
  return actor;
}

function patient({ name = "R2Patient", hp = 20, maxHp = 40, temp = 0, tag = null } = {}) {
  const actor = createTestActor({
    name,
    system: { details: { type: { value: "humanoid" } }, attributes: { hp: { value: hp, max: maxHp, temp } } }
  });
  if (tag) actor.flags.ak5e.ward = structuredClone(tag);
  return actor;
}

/** A synthetic token-embedded Actor view: uuid Scene.<s>.Token.<t>.Actor.<id>,
 *  id equal to the real base Actor, registered ONLY for uuid lookup — a write
 *  here reports success while the real Actor never changes (spec: writes must
 *  land on the base Actor the engine records and undoes). */
function tokenView(base, tokenSuffix = "r2tok") {
  const view = {
    id: base.id, _id: base.id,
    documentName: "Actor",
    uuid: `Scene.r2scene.Token.${tokenSuffix}.Actor.${base.id}`,
    name: base.name,
    system: structuredClone(base.system),
    flags: structuredClone(base.flags),
    isOwner: true,
    writes: [],
    async update(changes) { this.writes.push(structuredClone(changes)); return this; }
  };
  globalThis._ak5eTestDocs.set(view.uuid, view);
  assert.ok(view.uuid.includes(".Token."));
  return view;
}

const tagOf = target => target.flags.ak5e?.ward ?? null;
const lsOf = actor => actor.flags.ak5e.resourcePools?.lifeSupport?.value ?? 0;
function applyTag(target, medicActor, amount) {
  target.system.attributes.hp.temp = amount;
  target.flags.ak5e.ward = { medicUuid: medicActor.uuid, grantedAt: "r2:grant", amount, observedTemp: amount };
}
async function flush(rounds = 3) {
  for (let i = 0; i < rounds; i++) await new Promise(resolve => setTimeout(resolve, 1));
}

/* =========================================================== HEADLINE FIX
   Token-form uuids and placeable Tokens resolve to the base Actor; confirmed
   writes land on the REAL Actor (never on the synthetic embedded view). */

test("R2-HEADLINE: a Scene.Token.Actor target uuid grants Ward on the real base Actor, not the token view", async () => {
  requireRuntime();
  const actor = medic({ level: 5, id: "R2Headline", lifeSupport: 40 });
  const base = patient({ name: "Real Ally" });
  const view = tokenView(base);
  assert.equal(base.system.attributes.hp.temp, 0);
  await medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: view.uuid,
    healingAmount: 7, actionType: "action" }, "r2-headline");
  // Without base-Actor normalization the write lands on `view` (update reports
  // success) and the real Actor keeps temp 0 — that is exactly the bug this
  // rewrite claims to fix; these assertions fail in that world.
  assert.equal(view.writes.length, 0, "the synthetic token-embedded view must never be written");
  assert.equal(view.system.attributes.hp.temp, 0, "the view keeps reporting success without changing anything");
  assert.equal(base.system.attributes.hp.temp, 7, "the REAL Actor received the Ward temp HP");
  assert.equal(tagOf(base)?.medicUuid, actor.uuid, "provenance on the REAL Actor names this Medic");
  const receipt = medicUses.receipt(actor, "r2-headline");
  assert.equal(receipt.result.targetUuid, base.uuid, "the receipt names the base Actor, so undo/relay target it");
  assert.equal(receipt.targets[0].uuid, base.uuid, "the recorded target change is on the base Actor");
  // undo must restore the real Actor (reload durability of the mapping):
  await medicUses.command(actor, "undoUse", { useId: "r2-headline" }, "r2-headline-undo");
  assert.equal(base.system.attributes.hp.temp, 0, "undo reaches the real Actor through the same mapping");
});

test("R2-HEADLINE: a Token document target resolves through its linked Actor to the base", async () => {
  requireRuntime();
  const actor = medic({ level: 5, id: "R2TokDoc", lifeSupport: 40 });
  const base = patient({ name: "Tokened Ally" });
  const view = tokenView(base, "r2tokdoc");
  const tokenDoc = { id: "r2tk", documentName: "Token", uuid: "Scene.r2scene.Token.r2tk", actor: view };
  globalThis._ak5eTestDocs.set(tokenDoc.uuid, tokenDoc);
  await medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: tokenDoc.uuid,
    healingAmount: 4, actionType: "action" }, "r2-tokdoc");
  assert.equal(view.writes.length, 0, "the embedded view never receives the write");
  assert.equal(base.system.attributes.hp.temp, 4, "the base Actor behind the Token document is written");
  assert.equal(medicUses.receipt(actor, "r2-tokdoc").result.targetUuid, base.uuid);
});

test("R2-HEADLINE sheet: a placeable Token in user.targets routes the grant to the base Actor", async () => {
  requireRuntime();
  assert.equal(typeof sheetImport.handleWardCommand, "function", "ward-sheet.mjs is required");
  const actor = medic({ level: 5, id: "R2SheetTok", lifeSupport: 40 });
  const base = patient({ name: "Placeable Ally" });
  const view = tokenView(base, "r2placeable");
  const placeable = { documentName: "Token", actor: view }; // user.targets holds placeables
  globalThis.game.user.targets = new Set([placeable]);
  globalThis.foundry.applications = { api: { DialogV2: {
    // askWardGrant form: heal 6, plain action, no extra dice, no keep/replace needed at temp 0.
    prompt: async () => ({ healingAmount: "6", actionType: "action", apSpent: "0" }),
    wait: async ({ buttons }) => buttons[0].callback(null, { form: { elements: {} } })
  } } };
  try {
    const outcome = await sheetImport.handleWardCommand(actor, "wardGrant", {});
    assert.notEqual(outcome, false, "the Ward sheet owns the wardGrant command");
  } finally {
    globalThis.game.user.targets = new Set();
    delete globalThis.foundry.applications;
  }
  // uses() is the slimmed panel view; the durable receipt lives in the Actor flag.
  const receipts = (actor.flags.ak5e?.medicUses?.undo ?? []).filter(entry => entry.command === "wardGrant");
  const receipt = receipts[receipts.length - 1];
  assert.ok(receipt, "the sheet routed a recorded use");
  assert.equal(receipt.status, "complete", "the sheet-routed use completed");
  assert.equal(view.writes.length, 0, "the placeable's embedded view was never written");
  assert.equal(base.system.attributes.hp.temp, 6, "the real Actor behind the placeable got the Ward");
  assert.equal(receipt.result.targetUuid, base.uuid, "the use pins the base Actor for undo/relay");
});

/* =========================================================== W2F-1
   Warding Surge: live Reaction budget (F7: Reaction + 10 LS). The claim of the
   rewrite is that the budget is read live: exhausted must BLOCK (warning,
   "use anyway" override only), available must be CLEAN (no warning, spend
   recorded). A hardcoded reactionAvailable (true or false) fails one half. */

test("R2-W2F1: surge with an available Reaction is clean and spends it through the live budget", async () => {
  requireRuntime();
  const actor = medic({ level: 11, id: "R2SurgeOk" });
  const target = patient({ name: "Surged Ally" });
  applyTag(target, actor, 8);
  // No overrides offered: a clean budget must produce zero blocking warnings.
  await medicUses.command(actor, "wardingSurge", { confirmed: true, targetUuid: target.uuid,
    damageTypes: ["fire"] }, "r2-surge-ok");
  const receipt = medicUses.receipt(actor, "r2-surge-ok");
  assert.equal(receipt.reaction?.spent, true, "the live Reaction was actually spent");
  assert.equal(getReactions(actor).available, 0, "the shared budget now reads exhausted");
  assert.equal(lsOf(actor), 90, "the 10 Life Support cost was spent");
  assert.ok((target.flags.ak5e?.wardResist?.types ?? []).includes("fire"), "the Resistance marker is live");
});

test("R2-W2F1: surge with an exhausted Reaction blocks until the table overrides; nothing is half-spent", async () => {
  requireRuntime();
  const actor = medic({ level: 11, id: "R2SurgeExh", lifeSupport: 60 });
  actor.flags.ak5e[REACTION_FLAG] = { max: 1, spent: 1 };
  const target = patient({ name: "Tired Ally" });
  applyTag(target, actor, 8);
  await assert.rejects(
    medicUses.command(actor, "wardingSurge", { confirmed: true, targetUuid: target.uuid,
      damageTypes: ["fire"] }, "r2-surge-exhausted"),
    error => {
      const ids = (error?.warnings ?? []).map(w => w?.id ?? w);
      return ids.includes("noReaction");
    },
    "an exhausted live budget must surface a noReaction block (hardcoded availability never does)");
  assert.equal(lsOf(actor), 60, "the blocked attempt spent nothing");
  assert.equal(medicUses.receipt(actor, "r2-surge-exhausted"), null, "the blocked attempt recorded nothing");
  await medicUses.command(actor, "wardingSurge", { confirmed: true, targetUuid: target.uuid,
    damageTypes: ["fire"], overrides: ["noReaction"] }, "r2-surge-override");
  const receipt = medicUses.receipt(actor, "r2-surge-override");
  assert.equal(receipt.reaction?.spent, false, "the override records that no Reaction was actually spent");
  assert.equal(getReactions(actor).available, 0, "an exhausted budget never goes negative");
  assert.equal(lsOf(actor), 50, "the overridden use pays its Life Support honestly");
});

test("R2-W2F1: surge reads the installed live store, repairing a corrupt one before warning", () => {
  requireRuntime();
  const plans = featureImport.WARD_PLANS;
  const exhausted = medic({ level: 11, id: "R2SurgeCorrupt" });
  exhausted.flags.ak5e[REACTION_FLAG] = { max: 1, spent: 1 };
  const target = patient({ name: "Corrupt Ally" });
  applyTag(target, exhausted, 8);
  try {
    setReactionStore({ read() { throw new Error("budget store unavailable"); }, write: async () => {} });
    const plan = plans.wardingSurge(exhausted, medicUses.state(exhausted),
      { targetUuid: target.uuid, damageTypes: ["fire"] });
    assert.ok((plan.warnings ?? []).some(w => (w?.id ?? w) === "noReaction"),
      "after repairing the store the plan warns from the LIVE exhausted canonical budget");
    assert.equal(getReactions(exhausted).available, 0, "the canonical store is reinstalled and readable");
  } finally { setReactionStore(flagReactionStore); }
  try {
    // A replaced store that reports availability must win over a stale exhausted
    // flag: the warning follows the live budget, never a cached copy.
    setReactionStore({ read: () => undefined, write: async () => {} });
    const plan = plans.wardingSurge(exhausted, medicUses.state(exhausted),
      { targetUuid: target.uuid, damageTypes: ["fire"] });
    assert.ok(!(plan.warnings ?? []).some(w => (w?.id ?? w) === "noReaction"),
      "a live budget that says available must not warn noReaction (hardcoded false would)");
  } finally { setReactionStore(flagReactionStore); }
});

/* =========================================================== W2F-2
   Collective Ward relay values are pinned (Integration contract: named
   operations validate source/target/path; F8: one application, donor values
   are actual pools). A forged receipt flag may only re-apply the values the
   use actually recorded; donor transfers / stray temps are rejected. */

test("R2-W2F2: plan-function pins accept recorded values and reject stray temps and kinds", async () => {
  requireRuntime();
  const plans = featureImport.WARD_PLANS;
  const actor = medic({ level: 15, id: "R2Pins" });
  const donor = patient({ name: "Pin Donor" });
  applyTag(donor, actor, 8);
  donor.system.attributes.hp.temp = 8;
  donor.flags.ak5e.ward = { medicUuid: actor.uuid, grantedAt: "r2:pin", amount: 8, observedTemp: 8 };
  const recipient = patient({ name: "Pin Recipient" });
  applyTag(recipient, actor, 2);
  await medicUses.command(actor, "collectiveWard", { confirmed: true, targetUuid: recipient.uuid,
    damage: 10, recipientDistanceFeet: 10,
    donors: [{ uuid: donor.uuid, distanceFeet: 10 }], removals: { [donor.uuid]: 5 } }, "r2-pin-use");
  const receipt = medicUses.receipt(actor, "r2-pin-use");
  const donorEntry = receipt.targets.find(entry => entry.key?.startsWith("donor-"));
  const recipientEntry = receipt.targets.find(entry => entry.key === "recipient");
  assert.deepEqual({ removed: receipt.result.removed, recipientTempAfter: receipt.result.recipientTempAfter },
    { removed: 5, recipientTempAfter: 0 });
  assert.equal(plans.collectiveWard.validateTarget(actor, receipt, donorEntry, donor), true,
    "the recorded donor value passes");
  assert.equal(plans.collectiveWard.validateTarget(actor, receipt, { ...donorEntry, temp: donorEntry.temp + 3 }, donor), false,
    "a donor temp of wardBefore (the under-spend / transfer value) is NOT this use");
  assert.equal(plans.collectiveWard.validateTarget(actor, receipt, recipientEntry, recipient), true);
  assert.equal(plans.collectiveWard.validateTarget(actor, receipt, { ...recipientEntry, temp: 5 }, recipient), false,
    "the recipient may not be written with the removed donor Ward (F8: never transferring)");
  assert.equal(plans.collectiveWard.validateTarget(actor, receipt, { ...recipientEntry, kind: "damage" }, recipient), false);
  assert.equal(plans.collectiveWard.validateTarget(actor, receipt, { ...recipientEntry, uuid: "Actor.stranger" }, recipient), false);
  // grant-side pin on the same rewrite:
  await medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: recipient.uuid,
    healingAmount: 3, actionType: "action" }, "r2-pin-grant");
  const grant = medicUses.receipt(actor, "r2-pin-grant");
  const grantEntry = grant.targets[0];
  assert.equal(plans.wardGrant.validateTarget(actor, grant, grantEntry, recipient), true);
  assert.equal(plans.wardGrant.validateTarget(actor, grant, { ...grantEntry, temp: 900 }, recipient), false,
    "a forged 900-temp grant is rejected by the plan-function pin");
});

test("R2-W2F2: the engine relay gate itself rejects a tampered Collective recipient value", async () => {
  requireRuntime();
  const actor = medic({ level: 15, id: "R2Relay" });
  const donor = patient({ name: "Relay Donor" });
  applyTag(donor, actor, 8);
  const recipient = patient({ name: "Relay Recipient" });
  applyTag(recipient, actor, 2);
  await medicUses.command(actor, "collectiveWard", { confirmed: true, targetUuid: recipient.uuid,
    damage: 10, recipientDistanceFeet: 10,
    donors: [{ uuid: donor.uuid, distanceFeet: 10 }], removals: { [donor.uuid]: 5 } }, "r2-relay-use");
  // relayedTargetChange re-reads the durable flag state (readState clones), so the
  // forgery must go where the GM relay actually reads: the stored receipt.
  const stored = actor.flags.ak5e.medicUses.undo.find(entry => entry.id === "r2-relay-use");
  const receipt = medicUses.receipt(actor, "r2-relay-use");
  const entry = stored.targets.find(change => change.key === "recipient");
  const honest = entry.temp;
  entry.temp = honest + receipt.result.removed; // forged "donor transfer" value
  await assert.rejects(
    medicUses.relayedTargetChange(actor, "apply",
      { useId: "r2-relay-use", targetUuid: recipient.uuid, targetKey: "recipient" }, globalThis.game.user),
    /recorded change is not one this use can make/i,
    "the GM relay re-checks the pinned plan-function value before applying");
  entry.temp = honest;
  await assert.doesNotReject(
    medicUses.relayedTargetChange(actor, "apply",
      { useId: "r2-relay-use", targetUuid: recipient.uuid, targetKey: "recipient" }, globalThis.game.user),
    "the recorded value itself passes the same gate (the rejection is value-driven, not blanket)");
  assert.equal(recipient.system.attributes.hp.temp, 0, "no double application: the pool stays at the settlement value");
  assert.equal(donor.system.attributes.hp.temp, 3, "the donor sits at its recorded wardAfter");
});

/* =========================================================== W2F-3
   F8: one donor is one Ward pool. Double-listing the same Creature must not
   spend it twice or warn out-of-range from a phantom duplicate; a removal for
   a key that names no listed donor is a caller bug, never a silent drop. */

test("R2-W2F3: a double-listed donor is consumed exactly once; the first listing wins", async () => {
  requireRuntime();
  const actor = medic({ level: 15, id: "R2Dedup" });
  const donor = patient({ name: "Dedup Donor" });
  applyTag(donor, actor, 8);
  const recipient = patient({ name: "Dedup Recipient" });
  applyTag(recipient, actor, 2);
  await medicUses.command(actor, "collectiveWard", { confirmed: true, targetUuid: recipient.uuid,
    damage: 10, recipientDistanceFeet: 10,
    donors: [{ uuid: donor.uuid, distanceFeet: 10 }, { uuid: donor.uuid, distanceFeet: 999 }],
    removals: { [donor.uuid]: 5 } }, "r2-dedup");
  const receipt = medicUses.receipt(actor, "r2-dedup");
  assert.equal(receipt.result.donorUpdates.length, 1, "one Creature, one donor operation");
  assert.equal(receipt.result.removed, 5, "the Ward was removed once, not twice");
  assert.equal(donor.system.attributes.hp.temp, 3, "the donor pool spent 5 exactly (not 10)");
  const donorEntries = receipt.targets.filter(entry => entry.key?.startsWith("donor-"));
  assert.equal(donorEntries.length, 1, "the receipt records a single donor target");
  assert.equal(receipt.result.hpLoss, 3, "settlement uses the deduplicated removal");
});

test("R2-W2F3: a removal naming no listed donor is rejected before any write", async () => {
  requireRuntime();
  const actor = medic({ level: 15, id: "R2Stray" });
  const donor = patient({ name: "Stray Donor" });
  applyTag(donor, actor, 8);
  const recipient = patient({ name: "Stray Recipient" });
  applyTag(recipient, actor, 2);
  const before = { donorTemp: donor.system.attributes.hp.temp, recipientTemp: recipient.system.attributes.hp.temp };
  await assert.rejects(
    medicUses.command(actor, "collectiveWard", { confirmed: true, targetUuid: recipient.uuid,
      damage: 10, recipientDistanceFeet: 10,
      donors: [{ uuid: donor.uuid, distanceFeet: 10 }],
      removals: { [opaqueKey(donor.uuid)]: 2, "Actor.ghostDonor": 4 } }, "r2-stray"),
    /does not name a listed/i);
  await assert.rejects(
    medicUses.command(actor, "collectiveWard", { confirmed: true, targetUuid: recipient.uuid,
      damage: 10, recipientDistanceFeet: 10,
      donors: [{ uuid: donor.uuid, distanceFeet: 10 }],
      removals: { [donor.uuid]: "plenty" } }, "r2-stray2"),
    /whole number/i, "removal values go through the numeric gate, never silent coercion");
  assert.equal(donor.system.attributes.hp.temp, before.donorTemp, "rejected collectives write nothing");
  assert.equal(recipient.system.attributes.hp.temp, before.recipientTemp);
});

/* =========================================================== F1-F9 edges */

test("R2-F3: explicit replace applies the SMALLER pool exactly (generic max-pool would keep the old one)", async () => {
  requireRuntime();
  const actor = medic({ level: 5, id: "R2Small" });
  const target = patient({ name: "Bigger Old Pool" });
  target.system.attributes.hp.temp = 9;
  target.flags.ak5e.ward = { medicUuid: "Actor.OtherMedic", grantedAt: "old", amount: 9, observedTemp: 9 };
  await medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: target.uuid,
    healingAmount: 3, actionType: "action", keepOrReplace: "replace" }, "r2-smaller");
  assert.equal(target.system.attributes.hp.temp, 3,
    "the chosen replacement is applied exactly: a max-pool (max(9,3)=9) would keep 9");
  assert.equal(tagOf(target).medicUuid, actor.uuid, "provenance now names this Medic");
  assert.equal(tagOf(target).amount, 3, "the recorded Ward amount is the live pool");
});

test("R2-F3: equal replacement with an explicit choice swaps provenance (not silently skipped)", async () => {
  requireRuntime();
  const actor = medic({ level: 5, id: "R2Equal" });
  const target = patient({ name: "Equal Pool" });
  target.system.attributes.hp.temp = 8;
  target.flags.ak5e.ward = { medicUuid: "Actor.OtherMedic", grantedAt: "old", amount: 8, observedTemp: 8 };
  await medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: target.uuid,
    healingAmount: 8, actionType: "action", keepOrReplace: "replace" }, "r2-equal");
  assert.equal(target.system.attributes.hp.temp, 8, "the pool value is the chosen Ward amount");
  assert.equal(tagOf(target).medicUuid, actor.uuid,
    "provenance is re-tagged to this Medic: max-pool semantics would keep the foreign tag");
  // keep on the same pool: nothing is stacked and the foreign pool stays foreign (F4)
  await medicUses.command(actor, "undoUse", { useId: "r2-equal" }, "r2-equal-undo");
  assert.equal(tagOf(target).medicUuid, "Actor.OtherMedic", "undo restores the foreign provenance");
});

test("R2-F4: the native-temp hook preserves provenance on partial depletion and clears it on depletion", async () => {
  requireRuntime();
  const actor = medic({ level: 5, id: "R2Deplete" });
  const target = patient({ name: "Depleting Ally" });
  applyTag(target, actor, 8);
  const handlers = globalThis.Hooks._hooks.get("updateActor") ?? [];
  assert.ok(handlers.length >= 1, "the Ward provenance hook is registered");
  for (const handler of handlers) handler(target, { "system.attributes.hp.temp": 5 });
  await flush();
  assert.equal(tagOf(target)?.medicUuid, actor.uuid, "partial depletion keeps this Medic's provenance");
  assert.equal(tagOf(target)?.observedTemp, 5, "the tag observes the shrunken live pool");
  // the guard: a grant that writes the tag with the pool must not be re-cleared
  for (const handler of handlers) handler(target, { "system.attributes.hp.temp": 0, "flags.ak5e.ward": { medicUuid: actor.uuid, grantedAt: "g", amount: 0, observedTemp: 0 } });
  await flush();
  assert.equal(tagOf(target)?.medicUuid, actor.uuid, "the same-write guard does not fire on our own grant");
  for (const handler of handlers) handler(target, { "system.attributes.hp.temp": 0 });
  await flush();
  assert.equal(tagOf(target), null, "depletion clears the provenance outright");
});

test("R2-F5: the per-turn Advantage is not consumed by non-status saves, applies on any turn, and blocks a second status save", async () => {
  requireRuntime();
  const actor = medic({ level: 4, id: "R2Status", lifeSupport: 30 });
  const target = patient({ name: "Saving Ally" });
  applyTag(target, actor, 6);
  const plain = await medicUses.command(actor, "statusResistance", { confirmed: true, targetUuid: target.uuid,
    turnKey: "r2c:1:1", savingAgainstStatus: false }, "r2-f5-nonstatus");
  assert.equal(plain.advantage, false, "a non-status save never gets the Ward Advantage");
  assert.equal(actor.flags.ak5e.medicUses?.data?.wardStatusSave?.[target.uuid], undefined,
    "a non-status save does not spend the per-turn allowance");
  const first = await medicUses.command(actor, "statusResistance", { confirmed: true, targetUuid: target.uuid,
    turnKey: "r2c:1:1", savingAgainstStatus: true }, "r2-f5-first");
  assert.equal(first.advantage, true, "the first qualifying status save of the turn has Advantage");
  await assert.rejects(
    medicUses.command(actor, "statusResistance", { confirmed: true, targetUuid: target.uuid,
      turnKey: "r2c:1:1", savingAgainstStatus: true }, "r2-f5-second"),
    error => (error?.warnings ?? []).some(w => (w?.id ?? w) === "used"),
    "the same turn's second status save is visibly spent, not silently advantaged");
  const second = await medicUses.command(actor, "statusResistance", { confirmed: true, targetUuid: target.uuid,
    turnKey: "r2c:1:1", savingAgainstStatus: true, overrides: ["used"] }, "r2-f5-second-o");
  assert.equal(second.advantage, false);
  // F5: "each combat turn", not only the recipient's own turn — a new key refills
  const nextTurn = await medicUses.command(actor, "statusResistance", { confirmed: true, targetUuid: target.uuid,
    turnKey: "r2c:1:2", savingAgainstStatus: true }, "r2-f5-next");
  assert.equal(nextTurn.advantage, true, "a new Turn key restores the first-save Advantage");
});

test("R2-F6: a failed Treat the Cause save binds a full-damage forced miss that only reaches its own attack", async () => {
  requireRuntime();
  assert.equal(typeof featureImport.wardDamageResolver, "function", "the synchronous resolver is exported");
  const actor = medic({ level: 7, id: "R2Treat" });
  const attacker = patient({ name: "R2 Attacker", hp: 30, maxHp: 30 });
  const target = patient({ name: "Warded Target" });
  applyTag(target, actor, 8);
  const outcome = await medicUses.command(actor, "treatTheCause", { confirmed: true, targetUuid: target.uuid,
    attackerUuid: attacker.uuid, attackerDistanceFeet: 10, saveDC: 15,
    ownerRoll2d10: 11, ownerRollDexSave: 8, attackMessageUuid: "ChatMessage.r2-f6" }, "r2-f6-miss");
  assert.equal(outcome.forcedMiss, true, "failed save: source-bound forced miss");
  assert.equal(outcome.damage, 11, "failed save costs the FULL 2d10, unhalved");
  // The correlation is COMMITTED in the persisted receipt (synced across clients),
  // never fabricated: the resolver reads the recorded wardCorrelation by message UUID.
  const resolved = featureImport.wardDamageResolver({ actor: target, amount: 17, messageUuid: "ChatMessage.r2-f6" });
  assert.equal(resolved.reduce, 17, "the correlated attack's damage is fully reduced without touching the die");
  assert.ok(!Object.hasOwn(resolved, "attackRoll"), "the forced miss never alters the attack roll itself");
  assert.equal(featureImport.wardDamageResolver({ actor: target, amount: 17, messageUuid: "ChatMessage.unrelated" }), null,
    "an unrelated attack on the same Creature carries no Ward outcome and is not reduced");
  // success path oracle: half damage (floor), no forced miss
  assert.deepEqual(treatTheCauseOutcome({ saveSucceeded: true, damageRolled: 9 }), { damage: 4, forcedMiss: false });
  const saved = await medicUses.command(actor, "treatTheCause", { confirmed: true, targetUuid: target.uuid,
    attackerUuid: attacker.uuid, attackerDistanceFeet: 10, saveDC: 15,
    ownerRoll2d10: 4, ownerRollDexSave: 20, restoreReaction: true, attackMessageUuid: "ChatMessage.r2-f6-save" }, "r2-f6-save");
  assert.equal(featureImport.wardDamageResolver({ actor: target, amount: 17, messageUuid: "ChatMessage.r2-f6-save" }), null,
    "a successful save records no forced miss for its attack");
  assert.equal(saved.forcedMiss, false, "a successful save forces no miss");
  assert.equal(saved.damage, treatTheCauseOutcome({ saveSucceeded: true, damageRolled: 4 }).damage,
    "success costs exactly half the owner's 2d10");
  assert.equal(saved.halved, true);
});

test("R2-F7: the Resistance marker is live now and dead at the next recorded Turn key", () => {
  requireRuntime();
  const actor = medic({ level: 11, id: "R2Expiry" });
  const target = patient({ name: "Resistant Ally" });
  target.flags.ak5e.wardResist = { types: ["fire"], until: null, medicUuid: actor.uuid, useId: "manual" };
  const live = featureImport.wardDamageResolver({ actor: target, amount: 8, outcome: undefined });
  assert.deepEqual(live?.resistTypes, ["fire"], "an open-ended marker halves live in the resolver");
  target.flags.ak5e.wardResist = { types: ["fire"], until: "combat:9:9", medicUuid: actor.uuid, useId: "old" };
  assert.equal(featureImport.wardDamageResolver({ actor: target, amount: 8, outcome: undefined }), null,
    "a marker bound to a different Turn key has lapsed and no longer resists");
});

test("R2-F8: a drained donor state blocks a new removal, a fresh pool allows a new use, retries never re-spend", async () => {
  requireRuntime();
  const actor = medic({ level: 15, id: "R2Fresh" });
  const donor = patient({ name: "Fresh Donor" });
  applyTag(donor, actor, 8);
  const recipient = patient({ name: "Fresh Recipient" });
  recipient.system.attributes.hp.temp = 0;
  recipient.flags.ak5e.ward = { medicUuid: actor.uuid, grantedAt: "r2:fresh", amount: 0, observedTemp: 0 };
  // damage 10 with the full 8-Ward donor: no waste warning, but nothing for a 0-temp recipient to absorb
  await medicUses.command(actor, "collectiveWard", { confirmed: true, targetUuid: recipient.uuid,
    damage: 10, recipientDistanceFeet: 10,
    donors: [{ uuid: donor.uuid, distanceFeet: 10 }], removals: { [donor.uuid]: 8 } }, "r2-f8-drain");
  assert.equal(donor.system.attributes.hp.temp, 0, "the donor's Ward pool is drained");
  assert.equal(tagOf(donor), null, "depletion cleared the donor provenance");
  // replaying the same operation id must not re-spend anything (idempotent receipt)
  const replay = await medicUses.command(actor, "collectiveWard", { confirmed: true, targetUuid: recipient.uuid,
    damage: 10, recipientDistanceFeet: 10,
    donors: [{ uuid: donor.uuid, distanceFeet: 10 }], removals: { [donor.uuid]: 8 } }, "r2-f8-drain");
  const receipt2 = replay;
  const undoCount = actor.flags.ak5e.medicUses.undo.length;
  assert.equal(receipt2.removed, 8, "the replay returns the recorded receipt");
  assert.equal(donor.system.attributes.hp.temp, 0, "no second spend from the replay");
  assert.equal(actor.flags.ak5e.medicUses.undo.length, undoCount, "the replay recorded no second use");
  // a NEW use against the drained donor is rejected with a fresh-state message
  await assert.rejects(
    medicUses.command(actor, "collectiveWard", { confirmed: true, targetUuid: recipient.uuid,
      damage: 10, recipientDistanceFeet: 10,
      donors: [{ uuid: donor.uuid, distanceFeet: 10 }], removals: { [donor.uuid]: 3 } }, "r2-f8-drained-new"),
    /no longer has this Medic|fresh pool|start a new/i);
  const drainedCount = actor.flags.ak5e.medicUses.undo.length;
  // the donor is re-Warded by a new grant: the retry now sees a fresh, actual pool
  applyTag(donor, actor, 6);
  await medicUses.command(actor, "collectiveWard", { confirmed: true, targetUuid: recipient.uuid,
    damage: 10, recipientDistanceFeet: 10,
    donors: [{ uuid: donor.uuid, distanceFeet: 10 }], removals: { [donor.uuid]: 4 } }, "r2-f8-fresh");
  assert.equal(donor.system.attributes.hp.temp, 2, "the fresh use consumes from the actual new pool only");
  // undo the fresh use: the relayed donor is restored to its recorded prior value
  await medicUses.command(actor, "undoUse", { useId: "r2-f8-fresh" }, "r2-f8-undo");
  assert.equal(donor.system.attributes.hp.temp, 6, "undo restores the donor's Ward exactly");
  assert.equal(tagOf(donor)?.medicUuid, actor.uuid, "the restored donor keeps this Medic's provenance");
});

test("R2-F8/F9: undone uses stay dead across a same-data reload (durable idempotency)", async () => {
  requireRuntime();
  const actor = medic({ level: 5, id: "R2Reload" });
  const base = patient({ name: "Reload Ally" });
  const view = tokenView(base, "r2reload");
  await medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: view.uuid,
    healingAmount: 5, actionType: "action" }, "r2-reload-grant");
  await medicUses.command(actor, "undoUse", { useId: "r2-reload-grant" }, "r2-reload-undo");
  // same-data restart: the receipt state survives a serialization round-trip
  actor.flags.ak5e.medicUses = JSON.parse(JSON.stringify(structuredClone(actor.flags.ak5e.medicUses)));
  const receipt = medicUses.receipt(actor, "r2-reload-grant");
  assert.equal(receipt.status, "undone", "the undone status survives the reload");
  await assert.rejects(
    medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: view.uuid,
      healingAmount: 5, actionType: "action", retryOf: "r2-reload-grant" }, "r2-reload-retry"),
    /no longer available|undone|record a new use/i);
  assert.equal(base.system.attributes.hp.temp, 0, "the reload-resurrected retry wrote nothing to the real Actor");
});

test("R2-F9: regeneration needs an explicit keep/replace, offers ceil(level/2), and is only offered at the Medic's OWN turn start", async () => {
  requireRuntime();
  const actor = medic({ level: 15, id: "R2Regen" });
  actor.system.attributes.hp.temp = 4;
  actor.flags.ak5e.ward = { medicUuid: "Actor.OtherMedic", grantedAt: "other", amount: 4, observedTemp: 4 };
  // other temp HP: the visible warning demands the owner's explicit choice…
  await assert.rejects(
    medicUses.command(actor, "wardRegeneration", { confirmed: true, targetUuid: actor.uuid }, "r2-regen-choice"),
    /keep|replace/i);
  await assert.rejects(
    medicUses.command(actor, "wardRegeneration", { confirmed: true, targetUuid: actor.uuid,
      overrides: ["otherTemp"] }, "r2-regen-override-nochoice"),
    /Choose whether to keep|explicit choice|keep.*replace/i,
    "overriding the warning is not a substitute for stating keep or replace");
  assert.equal(actor.system.attributes.hp.temp, 4, "the refused offer wrote nothing");
  const kept = await medicUses.command(actor, "wardRegeneration", { confirmed: true,
    targetUuid: actor.uuid, keepOrReplace: "keep", overrides: ["otherTemp"] }, "r2-regen-keep");
  assert.equal(kept.amount, 8, "ceil(15/2) = 8 offered");
  assert.equal(kept.kept, true);
  assert.equal(actor.system.attributes.hp.temp, 4, "keep never stacks or replaces");
  const replaced = await medicUses.command(actor, "wardRegeneration", { confirmed: true,
    targetUuid: actor.uuid, keepOrReplace: "replace", overrides: ["otherTemp"] }, "r2-regen-replace");
  assert.equal(replaced.temp, 8, "replace applies the regeneration pool exactly");
  assert.equal(tagOf(actor).medicUuid, actor.uuid, "the replaced pool is this Medic's Ward");
  // turn-start offering: card only, never an auto-grant, only for the actor whose turn starts
  const fresh = medic({ level: 15, id: "R2RegenTurn" });
  const other = medic({ level: 15, id: "R2RegenOther" });
  applyTag(other, other, 6); // own ward → not eligible
  const cardsBefore = (globalThis.game.messages ?? []).filter(m => m.flags?.ak5e?.wardRegenerationOffer).length;
  await emitAk5eEvent("turnStart", { actorUuid: other.uuid, raw: { actor: other } });
  await emitAk5eEvent("turnStart", { actorUuid: fresh.uuid, raw: { actor: fresh } });
  const under15 = medic({ level: 14, id: "R2RegenUnder" });
  await emitAk5eEvent("turnStart", { actorUuid: under15.uuid, raw: { actor: under15 } });
  const cards = (globalThis.game.messages ?? []).filter(m => m.flags?.ak5e?.wardRegenerationOffer);
  assert.equal(cards.length, cardsBefore + 1, "exactly one regeneration card: the own-ward Medic gets none");
  assert.equal(cards[cards.length - 1].flags.ak5e.wardRegenerationOffer.actorUuid, fresh.uuid);
  assert.match(String(cards[cards.length - 1].content), /data-medic-cmd="wardRegeneration"/,
    "the offer is an explicit owner-clicked control");
  assert.equal(fresh.system.attributes.hp.temp, 0, "turn start never auto-applies the regeneration");
});

test("R2-COMMON: every numeric gate still rejects booleans and blank strings (no silent coercion)", async () => {
  requireRuntime();
  const actor = medic({ level: 5, id: "R2Gates" });
  const target = patient({ name: "Gate Ally" });
  await assert.rejects(medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: target.uuid,
    healingAmount: true, actionType: "action" }, "r2-gate-bool"), /whole|amount/i,
    "Number(true)===1 must not convert a boolean into healing");
  await assert.rejects(medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: target.uuid,
    healingAmount: "", actionType: "action" }, "r2-gate-blank"), /whole|amount/i,
    "Number('')===0 must not silently zero a blank dialog value either");
  await assert.rejects(medicUses.command(actor, "wardGrant", { confirmed: true, targetUuid: target.uuid,
    healingAmount: 5, actionType: "action", extraTempHP: true }, "r2-gate-die"), /1d8|roll|owner/i,
    "asking for the Additional Temporary Hit Points die without the owner's roll is refused, never auto-rolled");
  assert.equal(target.system.attributes.hp.temp, 0, "nothing was written by any rejected gate");
});
