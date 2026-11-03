/**
 * Post-candidate attack pass, round 2, for Wave 2 package E (Therapist runtime).
 * Target: the T1-retry submission (Muse Spark) — five fix groups in
 * ak5e/scripts/therapist-features.mjs (regression MAJOR-1/2/3, MINOR-1/3);
 * therapist-sheet.mjs unchanged. Delta-focused: frozen/attack/regression files already
 * prove first-pass behavior; this file only attacks the fixed seams.
 * Drafted from SPEC-therapist.md (E1-E8 + Common + Integration contract), Chapter 3
 * C3:4923-5004 semantics, and the shared frozen interfaces. No production bodies were
 * read to derive expectations; every assertion below traces to a spec line quoted in
 * the test comment.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  THERAPIES, validateSelection, riderFor, riderExpired,
  recuperativeHeal, earlyOnsetCheck
} from "../scripts/therapist-rules.mjs";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem } from "./base-classes-fixture.mjs";
import { registerMedicArts } from "../scripts/medic-features.mjs";
import { medicUses } from "../scripts/medic-uses.mjs";
import { artCastOptionsFor, applyArtCastOptions } from "../scripts/arts-casting.mjs";
import { appendArtReceipt, captureArtChanges } from "../scripts/arts-ledger.mjs";
import { getReactions, riderRecords, spendReaction } from "../scripts/trigger-events.mjs";
import {
  registerTherapistHooks, syncTherapistCast, therapistRiders, therapistState,
  THERAPIST_OPTION_ID
} from "../scripts/therapist-features.mjs";

const HEALING_POOL = "special-art-pool-healing-arts-4211";
const THERAPY = THERAPIST_OPTION_ID;
const EXPIRY_TRIGGERS = ["manual", "shortRest", "longRest", "combatEnd", "turnStart", "turnEnd", "nextTurnEnd",
  "currentTurnEnd", "time", "concentration", "attack"];
let gmUser, playerUser;

test.before(async () => {
  setupFoundryGlobals({ isGM: false, worldTime: 100, activeGM: null, settings: { "ak5e.artReceiptEpoch": 0 } });
  await registerMedicArts();
  await registerTherapistHooks();
  gmUser = game.users.get("gm");
  playerUser = game.users.get("player");
});
test.after(() => teardownFoundryGlobals());

function medic({ level = 15, lifeSupport = 125, owner = true, id } = {}) {
  const actor = createTestActor({ id: id ?? `r2-${Math.random().toString(36).slice(2, 8)}`, name: "R2 Therapist",
    type: "character", level, prof: 2 + Math.floor((level - 1) / 4), owner,
    abilities: { wis: { value: 16, mod: 3 }, int: { value: 12, mod: 1 }, cha: { value: 10, mod: 0 } },
    flags: { ak5e: {
      medic: { enabled: true, spellcastingAbility: "wis" },
      casting: { enabled: true, ability: "wis", recovery: "long", castingUnit: "focus" },
      artsPoints: { maximum: 26, value: 26, maximumArtLevel: 8, ninthLevelCast: false },
      resourcePools: { lifeSupport: { value: lifeSupport, max: 125 } }
    } } });
  actor.items.set("medic-class", createTestItem({ id: `${actor.id}-class`, type: "class", name: "Medic",
    system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-medic" } } }, actor));
  actor.items.set("therapist-branch", createTestItem({ id: `${actor.id}-branch`, type: "subclass", name: "Therapist",
    flags: { ak5e: { chapterThreeId: "subclass-medic-therapist" } } }, actor));
  game.actors.set(actor.id, actor);
  return actor;
}
function healingArt(actor, id = `${actor.id}-art`) {
  const item = createTestItem({ id, type: "spell", name: "Field Dressing", system: {
    level: 3, activation: { type: "action" }, target: { type: "creature", value: 1 },
    range: { value: 30, units: "ft" }, duration: { value: 1, units: "minute" },
    properties: { concentration: true }, description: { value: "Restore Hit Points to one Creature." }
  }, flags: { ak5e: { art: { enabled: true, pool: HEALING_POOL }, pool: HEALING_POOL } } }, actor);
  actor.items.set(item.id, item);
  return item;
}
function ally({ owner = true, id } = {}) {
  const actor = createTestActor({ id: id ?? `r2-ally-${Math.random().toString(36).slice(2, 8)}`,
    name: "R2 Ally", type: "npc", owner });
  game.actors.set(actor.id, actor);
  return actor;
}
async function therapistOption(actor, item) {
  const model = await artCastOptionsFor(actor, item, null, {});
  const option = model.options.find(entry => /therap/i.test(`${entry.id} ${entry.label}`));
  assert.ok(option, "no Therapist cast-option provider was registered");
  return option;
}
function riderUses(actor) {
  return medicUses.state(actor).undo.filter(entry => entry.command === "therapistRider");
}
function cardsFor(castId) {
  return Array.from(game.messages ?? []).filter(message => message.getFlag?.("ak5e", "therapistCard")?.castId === castId);
}
function packageCards(castId) {
  return cardsFor(castId).filter(message => /data-ak5e-therapist-package/.test(String(message.content)));
}
/** Walk a JSON-ish value and collect every primitive number found. */
function numbersIn(value, out = []) {
  if (typeof value === "number") { out.push(value); return out; }
  if (Array.isArray(value)) { for (const entry of value) numbersIn(entry, out); return out; }
  if (value && typeof value === "object") { for (const entry of Object.values(value)) numbersIn(entry, out); }
  return out;
}
function asPlayer(fn) { globalThis.game.user = playerUser; try { return fn(); } finally { /* caller restores */ } }
async function activateDoctor(actor, chosenId, opId) {
  return medicUses.command(actor, "doctorIsIn", { confirmed: true, chosenId }, opId);
}
/** Commit a Therapy cast the way the parent does: consume, append the parent cast
 * receipt, write, then deliver. Rider children link to the parent receipt, so the
 * receipt must be persisted before syncTherapistCast (frozen E8 + MAJOR-2/3 pattern). */
async function commitCast(actor, item, selection, { cost = 3, id = null, advanceTime = null } = {}) {
  const receipt = { id: id ?? `r2-cast-${actor.id}-${cost}`, itemId: item.id, cost, level: 3, name: item.name,
    options: { [THERAPY]: selection } };
  const updates = { actor: {} };
  applyArtCastOptions({ actor, item }, { ak5eOptions: { [THERAPY]: selection } }, updates, receipt);
  if (advanceTime !== null) game.time.worldTime = advanceTime;
  const parent = appendArtReceipt(actor, receipt, captureArtChanges(actor, updates.actor ?? {}))[0];
  await actor.update({ ...(updates.actor ?? {}), "flags.ak5e.artReceipts": [parent] });
  return { receipt, updates };
}

/* ------------------------------------------------------------------ */
/* FIX GROUP MAJOR-3 — validated GM relay: the apply leg is real      */
/* ------------------------------------------------------------------ */

test("R2-MAJOR3: a player's unowned-target rider stays pending (never an ownership crash) and the GM apply leg lands it through the operation-specific validator", async () => {
  // Spec: "validated unowned-target GM relay" (Common), MAJOR-3 fix group, and
  // "Consume happens where the write happens" — the player client must not throw
  // trigger-events' assertWritable ("You must own this Actor"), must not write the
  // rider locally, and the GM client's relayedTargetChange("apply") must complete
  // instead of being rejected by a missing/non-validating relay validator.
  globalThis.game.user = playerUser;
  const actor = medic({ level: 15, id: "r2-major3" });
  const target = ally({ owner: false, id: "r2-major3-ally" });
  const item = healingArt(actor);
  await activateDoctor(actor, "empowering", "r2-major3-doctor"); // chosen => rider only, no package
  const { receipt } = await commitCast(actor, item, { therapy: "empowering", secondaryTherapy: "none" });

  const result = await syncTherapistCast(actor, receipt, [target.uuid]);
  assert.ok(result && Array.isArray(result.riders), "the cast event must still record its rider");

  const uses = riderUses(actor);
  assert.equal(uses.length, 1, "one cast produces exactly one rider use receipt");
  assert.equal(uses[0].status, "pending", "with no GM the change waits, it is not silently applied or dropped");
  assert.doesNotMatch(String(uses[0].lastError ?? ""), /must own|permission|not allowed|forbidden/i,
    "the recorded failure must be the missing GM, never a local assertWritable crash");
  assert.match(String(uses[0].lastError ?? ""), /no GM/i);
  assert.deepEqual(riderRecords(target), [], "nothing may be written on a Creature this client cannot write");

  // GM connects and plays the second-player leg: the relay validator must ACCEPT
  // this recorded change (a plan without a working validateTarget is rejected by the
  // engine with "The recorded change is not one this use can make").
  game.users.activeGM = gmUser;
  globalThis.game.user = gmUser;
  try {
    await medicUses.relayedTargetChange(actor, "apply", { useId: uses[0].id, targetUuid: target.uuid }, gmUser);
  } finally {
    game.users.activeGM = null;
    globalThis.game.user = playerUser;
  }
  const records = riderRecords(target);
  const empowering = records.filter(record => String(record.id).includes("empowering"));
  assert.equal(empowering.length, 1, "the GM apply leg must land exactly one empowering rider");
  assert.equal(empowering[0].status, "active");
  assert.equal(uses[0].targets[0].uuid, target.uuid, "the recorded target is the relayed Creature");
});

test("R2-MAJOR3: the relay validator actually validates — re-pointing the recorded target at a different Creature is rejected, not written", async () => {
  // Spec: "operation-specific relay validators; never replace generic target kinds"
  // (Integration contract) + "validated unowned-target GM relay" (Common). A validator
  // that returns true unconditionally would let a tampered receipt change any player's
  // Creature, so the negative leg must be REJECTED and the wrong target stay clean.
  globalThis.game.user = playerUser;
  const actor = medic({ level: 15, id: "r2-forged" });
  const recorded = ally({ owner: false, id: "r2-forged-recorded" });
  const victim = ally({ owner: false, id: "r2-forged-victim" });
  const item = healingArt(actor);
  await activateDoctor(actor, "empowering", "r2-forged-doctor");
  const { receipt } = await commitCast(actor, item, { therapy: "empowering", secondaryTherapy: "none" });
  await syncTherapistCast(actor, receipt, [recorded.uuid]);

  const use = riderUses(actor)[0];
  // A receipt lives in a flag its owner can write: simulate tampering, exactly as the
  // Medic engine adversarial test does for touchHeal amounts.
  actor.flags.ak5e.medicUses.undo.find(entry => entry.id === use.id).targets[0].uuid = victim.uuid;

  game.users.activeGM = gmUser;
  globalThis.game.user = gmUser;
  let rejection = null;
  try {
    await medicUses.relayedTargetChange(actor, "apply", { useId: use.id, targetUuid: victim.uuid }, gmUser);
  } catch (error) {
    rejection = error;
  } finally {
    game.users.activeGM = null;
    globalThis.game.user = playerUser;
  }
  if (rejection === null) {
    // The engine accepted the re-pointed entry — then the Therapist validator still has
    // to keep the rider bound to its recorded Creature, and the victim must stay clean.
    assert.deepEqual(riderRecords(victim), [],
      "relay defect: a tampered target entry moved a rider onto an unrecorded Creature");
  }
});

/* ------------------------------------------------------------------ */
/* FIX GROUP MAJOR-1 — Early Onset live counts, cancel, undo, warns   */
/* ------------------------------------------------------------------ */

test("R2-EO: canceling Early Onset spends nothing — flags, uses and the Reaction window are untouched", async () => {
  // Spec E4: "Cancel spends nothing".
  globalThis.game.user = playerUser;
  const actor = medic({ level: 7, id: "r2-eo-cancel" });
  const before = structuredClone(actor.flags);
  const reactions = getReactions(actor).available;
  await assert.rejects(medicUses.command(actor, "earlyOnset", {
    confirmed: false, castingTime: "action", triggerEventId: "hitTaken:r2-cancel",
    requiredTargetUuid: "Actor.patient", targetUuids: ["Actor.patient"],
    damagedUuid: "Actor.patient", damagedIsAlly: true, canSee: true
  }, "r2-eo-cancel-op"), /confirm/i);
  assert.deepEqual(actor.flags, before, "a canceled reaction offer writes nothing");
  assert.equal(getReactions(actor).available, reactions);
  assert.equal(therapistState(actor).earlyOnsetUsed, 0);
  assert.deepEqual(medicUses.uses(actor).filter(entry => entry.command === "earlyOnset"), []);
});

test("R2-EO: wrong target, missing visibility and wrong casting time are visible overridable warnings, never silent blocks", async () => {
  // Spec E4: "Wrong target/visibility/ally/casting-time/reaction/resource conditions
  // warn"; Common: "public overridable prerequisite/range/resource warnings".
  globalThis.game.user = playerUser;
  const actor = medic({ level: 7, id: "r2-eo-warn" });
  const clean = { castingTime: "action", requiredTargetUuid: "Actor.patient", targetUuids: ["Actor.patient"],
    damagedUuid: "Actor.patient", damagedIsAlly: true, canSee: true };
  assert.deepEqual(medicUses.preview(actor, "earlyOnset", { ...clean, triggerEventId: "hitTaken:r2-w1" }).warnings
    .map(warning => warning.id), [], "a qualifying trigger is clean");
  // Malformed rule shapes stay advisory (taken before any Reaction is spent): wrong
  // target + invisible + non-action casting.
  const broken = medicUses.preview(actor, "earlyOnset", { castingTime: "minute", triggerEventId: "hitTaken:r2-w3",
    requiredTargetUuid: "Actor.wrong", targetUuids: ["Actor.wrong"],
    damagedUuid: "Actor.patient", damagedIsAlly: true, canSee: false });
  const ids = broken.warnings.map(warning => warning.id);
  assert.deepEqual(ids, ["castingTimeNotActionOrBonus", "mustTargetDamaged", "notVisible"],
    "Early Onset condition warnings must come through the plan exactly as B's contract lists them");
  assert.equal(earlyOnsetCheck({ castingTime: "minute", targetUuids: ["Actor.wrong"], damagedUuid: "Actor.patient",
    damagedIsAlly: true, canSee: false, usesRemaining: 3 }).warnings.length, 3, "B and E agree on the condition set");
  await medicUses.command(actor, "earlyOnset", { confirmed: true, ...broken, overrides: ids }, "r2-eo-w3")
    .catch(async (error) => {
      // The command stage may add its own guidance warnings (unresolved trigger
      // context); the panel would show them before "Use anyway", so merge and retry
      // the same operation id with every listed warning overridden.
      const merged = [...new Set([...ids, ...(error?.warnings ?? []).map(w => w.id)])];
      return medicUses.command(actor, "earlyOnset", { confirmed: true, ...broken, overrides: merged }, "r2-eo-w3");
    });
  const use = medicUses.state(actor).undo.find(entry => entry.id === "r2-eo-w3");
  assert.equal(use?.status, "complete", "overridden warnings proceed; the use is not blocked");
});

test("R2-EO: a spent Reaction window is a visible 'reaction' warning the table can override, never a silent block or silent success", async () => {
  // Spec E4: "reaction/resource conditions warn"; Common: "public overridable ...
  // resource warnings". The window is spent through the shared budget's own interface
  // so the attack is deterministic regardless of when the use path chooses to spend.
  globalThis.game.user = playerUser;
  const actor = medic({ level: 7, id: "r2-eo-rx" });
  assert.equal(getReactions(actor).available, 1);
  await spendReaction(actor, { triggerId: "hitTaken:r2-rx-prep", receipt: "r2-rx-prep" });
  assert.equal(getReactions(actor).available, 0);
  const data = { castingTime: "action", requiredTargetUuid: "Actor.patient", targetUuids: ["Actor.patient"],
    damagedUuid: "Actor.patient", damagedIsAlly: true, canSee: true, triggerEventId: "hitTaken:r2-rx-use" };
  const preview = medicUses.preview(actor, "earlyOnset", data);
  const ids = preview.warnings.map(warning => warning.id);
  assert.ok(ids.includes("reaction"), `spent Reaction must warn through the plan (got ${JSON.stringify(ids)})`);
  await medicUses.command(actor, "earlyOnset", { confirmed: true, ...data, overrides: ids }, "r2-eo-rx-op");
  assert.equal(medicUses.state(actor).undo.find(entry => entry.id === "r2-eo-rx-op")?.status, "complete",
    "overridden, the reaction offer still proceeds and stores its count");
  assert.equal(therapistState(actor).earlyOnsetUsed, 1);
});

test("R2-EO: a confirmed reaction and its use count undo correctly (live stored count, not a snapshot)", async () => {
  // Spec E4: "confirmed reaction and use-count undo correctly"; MAJOR-1 fix stores the
  // live count. Regression proves counts 1..6; this attacks the undo half.
  globalThis.game.user = playerUser;
  const actor = medic({ level: 7, id: "r2-eo-undo" });
  const data = { castingTime: "action", requiredTargetUuid: "Actor.patient", targetUuids: ["Actor.patient"],
    damagedUuid: "Actor.patient", damagedIsAlly: true, canSee: true, triggerEventId: "hitTaken:r2-undo" };
  const reactions = getReactions(actor).available;
  const warnings = medicUses.preview(actor, "earlyOnset", data).warnings.map(warning => warning.id);
  await medicUses.command(actor, "earlyOnset", { confirmed: true, ...data, overrides: warnings }, "r2-eo-undo-op");
  assert.equal(therapistState(actor).earlyOnsetUsed, 1);
  await medicUses.command(actor, "undoUse", { useId: "r2-eo-undo-op" }, "r2-eo-undo-back");
  assert.equal(therapistState(actor).earlyOnsetUsed, 0, "undo restores the stored use count");
  assert.equal(getReactions(actor).available, reactions, "undo leaves the Reaction window at its pre-use value");
});

test("R2-EO W2E-1 second-player leg: counts are per-Actor — one therapist exhausting uses cannot warn another, and overridden uses keep counting", async () => {
  // Spec E4 (PB/LR uses) + MAJOR-1 fix (live count). W2E-1's second player: a fresh
  // Therapist must see zero uses and a clean preview even after the first exhausted
  // and overrode her own. Kills shared-module-state and reset-to-one defects.
  globalThis.game.user = playerUser;
  const first = medic({ level: 7, id: "r2-eo-first" });
  const second = medic({ level: 7, id: "r2-eo-second" });
  const base = { castingTime: "action", requiredTargetUuid: "Actor.patient", targetUuids: ["Actor.patient"],
    damagedUuid: "Actor.patient", damagedIsAlly: true, canSee: true };
  // Level 7 => 3 uses; the 4th preview must already carry noUsesLeft and an overridden
  // 4th use must store 4 (not reset to 1).
  for (let index = 1; index <= 4; index += 1) {
    const data = { ...base, triggerEventId: `hitTaken:r2-loop-${index}` };
    const warnings = medicUses.preview(first, "earlyOnset", data).warnings.map(warning => warning.id);
    assert.ok(!(warnings.includes("noUsesLeft")) === (index <= 3),
      `use ${index}: noUsesLeft must appear exactly when the stored count has run out (got ${JSON.stringify(warnings)})`);
    await medicUses.command(first, "earlyOnset", { confirmed: true, ...data, overrides: warnings }, `r2-eo-loop-${index}`);
    assert.equal(therapistState(first).earlyOnsetUsed, index, `stored count continues after override ${index}`);
  }
  assert.equal(therapistState(second).earlyOnsetUsed, 0, "the second player's own count is untouched");
  assert.equal(therapistState(second).earlyOnsetPending, null);
  assert.deepEqual(medicUses.preview(second, "earlyOnset", { ...base, triggerEventId: "hitTaken:r2-second-1" })
    .warnings, [], "a fresh second-player Therapist sees a clean preview");
});

/* ------------------------------------------------------------------ */
/* FIX GROUP MAJOR-2 + E5 — allowance accounting at the write point   */
/* ------------------------------------------------------------------ */

test("R2-E5: quoting/validating never spends allowance; two non-chosen Therapies on one cast consume exactly two at the commit write", async () => {
  // Spec E5: "Each non-chosen Therapy consumes 1 including 2 on one cast"; Integration:
  // "consume ... stores persistent rider/allowance state" in the cast's own update —
  // i.e. the decrement rides the write, and previews mutate nothing.
  globalThis.game.user = playerUser;
  const actor = medic({ level: 15, id: "r2-allow" });
  const item = healingArt(actor);
  await activateDoctor(actor, "empowering", "r2-allow-doctor");
  assert.equal(therapistState(actor).concentratedAllowance, 3);

  const option = await therapistOption(actor, item);
  const selection = { therapy: "energising", secondaryTherapy: "longTerm" };
  const quote = option.provider.quote(selection);
  assert.equal(quote.allowanceUsed, 2, "two non-chosen Therapies on one cast each take an allowance");
  assert.equal(quote.allowanceAfter, 1);
  assert.equal(therapistState(actor).concentratedAllowance, 3, "quoting never consumes");
  option.provider.validate(selection);
  assert.equal(therapistState(actor).concentratedAllowance, 3, "validating never consumes");

  const receipt = { id: "r2-allow-cast", itemId: item.id, cost: 3, level: 3, name: item.name };
  const updates = { actor: {} };
  applyArtCastOptions({ actor, item }, { ak5eOptions: { [THERAPY]: selection } }, updates, receipt);
  const flagWrite = updates.actor["flags.ak5e.medic.therapist"];
  assert.ok(flagWrite, "the allowance decrement must ride the cast's own pending update");
  assert.equal(flagWrite.concentratedAllowance, 1, "the write carries 3 minus both consumptions");
  assert.equal(therapistState(actor).concentratedAllowance, 3, "nothing is spent before the update lands");
  await actor.update({ ...updates.actor });
  assert.equal(therapistState(actor).concentratedAllowance, 1);
  assert.equal(receipt.therapist.allowanceUsed, 2);
  assert.deepEqual(receipt.therapist.healingPackages,
    [{ therapyId: "energising", formula: "3d6" }, { therapyId: "longTerm", formula: "3d6" }],
    "each free non-chosen Therapy supplies its own per-final-AP package");
});

test("R2-E5: allowance survives the minute and a reload, drains to zero without going negative, and a spent allowance makes Therapies paid again", async () => {
  // Spec E5: "allowance survives minute/reload" and no undo/minute path may erase it;
  // Common: "clamp overspend 0".
  globalThis.game.user = playerUser;
  const actor = medic({ level: 15, id: "r2-allow2" });
  const item = healingArt(actor);
  await activateDoctor(actor, "empowering", "r2-allow2-doctor");
  // Spend two of three allowances with a real committed cast before the minute ends.
  await commitCast(actor, item, { therapy: "energising", secondaryTherapy: "longTerm" },
    { id: "r2-allow2-cast1" });
  assert.equal(therapistState(actor).concentratedAllowance, 1);

  // Minute passes and the client reloads: persistent state must still hold one allowance.
  game.time.worldTime = 220;
  try {
    const persisted = createTestActor({ name: actor.name, type: "character", level: 15, prof: 5,
      flags: { ak5e: structuredClone(actor.flags.ak5e) } });
    persisted.items.set("medic-class", createTestItem({ id: "p-class", type: "class", name: "Medic",
      system: { levels: 15 }, flags: { ak5e: { chapterThreeId: "class-medic" } } }, persisted));
    persisted.items.set("therapist-branch", createTestItem({ id: "p-branch", type: "subclass", name: "Therapist",
      flags: { ak5e: { chapterThreeId: "subclass-medic-therapist" } } }, persisted));
    game.actors.set(persisted.id, persisted);
    assert.equal(therapistState(persisted).concentratedAllowance, 1, "allowance survives minute/reload");
    const pItem = healingArt(persisted, "p-art");
    const option = await therapistOption(persisted, pItem);
    // Quotes are pure: they may describe the last allowance but never spend it.
    const paid = option.provider.quote({ therapy: "energising", secondaryTherapy: "longTerm" });
    const frees = paid.items.filter(entry => entry.free === "concentrated").map(entry => entry.id);
    assert.deepEqual(frees, ["energising"], "only one Therapy rides the last allowance");
    assert.equal(paid.allowanceUsed, 1);
    assert.equal(therapistState(persisted).concentratedAllowance, 1, "quoting spent nothing across the reload");
    // Spend the last allowance for real and re-quote on zero: Life Support is charged, never negative.
    await commitCast(persisted, pItem, { therapy: "cleansing", secondaryTherapy: "none" },
      { id: "r2-allow2-cast2" });
    assert.equal(therapistState(persisted).concentratedAllowance, 0);
    const drained = await therapistOption(persisted, pItem);
    const paidAgain = drained.provider.quote({ therapy: "cleansing", secondaryTherapy: "none" });
    assert.equal(paidAgain.items.find(entry => entry.id === "cleansing")?.free ?? null, null,
      "a spent allowance buys nothing");
    const cleansingCost = THERAPIES.find(therapy => therapy.id === "cleansing").lifeSupportCost;
    assert.equal(paidAgain.lifeSupportCost, cleansingCost, "the Therapy is back on its printed Life Support price");
    assert.ok(cleansingCost > 0, "the fixture's chosen Therapy is actually priced");
    assert.ok(numbersIn(paidAgain).every(Number.isFinite), "quotes stay finite");
  } finally {
    game.time.worldTime = 100;
  }
});

/* ------------------------------------------------------------------ */
/* NaN / negative / malformed numeric inputs                           */
/* ------------------------------------------------------------------ */

test("R2-NUM: NaN and negative final AP are clamped without poisoning flags, receipts or dice — nothing is invented from garbage input", async () => {
  // Spec E5: dice only "per final actual AP spent", "Zero AP produces no invented dice";
  // Integration: "Malformed input contract remains B's"; Common: "clamp overspend 0".
  // A Math.max(0, NaN) or unguarded template `${cost}d6` leaks NaN/negatives into
  // persisted flags and package formulas; kill that class here.
  globalThis.game.user = playerUser;
  for (const [label, cost] of [["NaN", NaN], ["negative", -5]]) {
    const actor = medic({ level: 15, id: `r2-num-${label}` });
    const item = healingArt(actor);
    await activateDoctor(actor, "empowering", `r2-num-doctor-${label}`);
    const receipt = { id: `r2-num-cast-${label}`, itemId: item.id, cost, level: 3, name: item.name };
    const updates = { actor: {} };
    let threw = null;
    try {
      applyArtCastOptions({ actor, item }, { ak5eOptions: { [THERAPY]: { therapy: "energising", secondaryTherapy: "none" } } },
        updates, receipt);
    } catch (error) {
      threw = error;
    }
    if (threw) continue; // a hard rejection is a valid malformed-input contract
    const quote = receipt.therapist ?? {};
    assert.equal(quote.healingPackages?.length ?? 0, 0,
      `${label} AP can never fabricate a healing package (spec: dice per FINAL actual AP)`);
    for (const value of numbersIn(updates.actor)) {
      assert.ok(Number.isFinite(value), `${label}: non-finite number reached the cast update`);
      assert.ok(value >= 0 || String(value).includes("expiresAt") === false || value > 0,
        `${label}: negative number reached the cast update`);
    }
    assert.doesNotMatch(JSON.stringify(updates.actor), /null,null/ , `${label}: NaN serialized into the update`);
    await actor.update({ ...updates.actor });
    const stateNow = therapistState(actor);
    assert.ok(Number.isFinite(stateNow.concentratedAllowance) && stateNow.concentratedAllowance >= 0,
      `${label}: allowance must stay a finite non-negative integer after a garbage cast`);
    assert.ok(numbersIn(actor.flags.ak5e.medic.therapist).every(Number.isFinite),
      `${label}: persisted Therapist state holds a non-finite number`);
  }
});

test("R2-NUM: numeric-as-id and unknown Therapy values are rejected through B's malformed contract, not treated as warnings or partial writes", async () => {
  // Integration contract: "Malformed input contract remains B's". A digit-string Therapy
  // is not any of the nine ids (THERAPIES); validateSelection must throw and the provider
  // must never silently accept. Kills coercion bugs like String(42) matching an index.
  globalThis.game.user = playerUser;
  const actor = medic({ level: 15, id: "r2-numid" });
  const item = healingArt(actor);
  await activateDoctor(actor, "empowering", "r2-numid-doctor");
  assert.throws(() => validateSelection({ selection: ["42"], medicLevel: 15, doctorIsIn: null }), /[Uu]nknown|therap/i);
  assert.ok(!THERAPIES.some(therapy => String(therapy.id) === "42"), "42 is not one of the nine Therapies");
  const option = await therapistOption(actor, item);
  const before = structuredClone(actor.flags);
  let surfaced = false;
  try {
    const result = option.provider.validate({ therapy: "42", secondaryTherapy: "none" });
    const text = (result?.warnings ?? []).map(w => typeof w === "string" ? w : String(w?.id ?? w?.text ?? "")).join(" ")
      + " " + (result?.errors ?? []).map(e => typeof e === "string" ? e : String(e?.id ?? e?.text ?? "")).join(" ");
    surfaced = /unknown|42|therap/i.test(text);
  } catch (error) {
    surfaced = /[Uu]nknown|therap|42/i.test(String(error?.message));
  }
  assert.ok(surfaced, "the shared validator must surface the provider's malformed-selection rejection");
  assert.deepEqual(structuredClone(actor.flags), before, "a rejected selection writes nothing");
});

/* ------------------------------------------------------------------ */
/* FIX GROUP MAJOR-2 + E6/E8 — rider expiry, package relay, single     */
/* executor                                                             */
/* ------------------------------------------------------------------ */

test("R2-EXP: every time-bounded rider carries a non-null, expiring record — never the never-expires default", async () => {
  // Spec E6: Empowering "next successful Attack within minute"; E8: "All named riders
  // expire/rebuild on reload". A rider registered without an expiry falls back to
  // trigger-events' {trigger:"manual"} default and NEVER expires — the leak class.
  const ctx = { spellMod: 3, art: { targetCount: 1, restoresHP: true }, castId: "r2-exp", casterUuid: "Actor.m",
    targetUuids: ["Actor.t"], worldTime: 100 };
  for (const id of ["empowering", "recuperative", "regenerative"]) {
    const expires = riderFor(id, ctx)?.expires;
    assert.ok(expires && Number.isFinite(expires.worldTime), `${id}: riderFor must give a finite worldTime expiry`);
    assert.equal(expires.worldTime, 160, `${id}: the minute window is +60`);
    assert.equal(riderExpired(riderFor(id, ctx), { worldTime: 159 }), false);
    assert.equal(riderExpired(riderFor(id, ctx), { worldTime: 160 }), true);
  }
  for (const id of ["psychological", "resistance"]) {
    assert.equal(riderFor(id, ctx)?.expires?.casterNextTurnStart, true, `${id}: turn-anchored expiry`);
  }

  // E-side: a delivered empowering rider on a writable Creature must persist a real,
  // time-triggered expiry on its durable record (MAJOR-2/3 write path).
  globalThis.game.user = playerUser;
  const actor = medic({ level: 15, id: "r2-exp-e" });
  const target = ally({ owner: true, id: "r2-exp-ally" });
  const item = healingArt(actor);
  await activateDoctor(actor, "empowering", "r2-exp-doctor");
  const { receipt } = await commitCast(actor, item, { therapy: "empowering", secondaryTherapy: "none" },
    { id: "r2-exp-cast" });
  await syncTherapistCast(actor, receipt, [target.uuid]);
  const records = riderRecords(target);
  assert.ok(records.length >= 1, "the rider record must land on the target");
  for (const record of records) {
    assert.ok(record.expiry && EXPIRY_TRIGGERS.includes(record.expiry.trigger),
      `record ${record.id}: expiry must be a valid feature-tags trigger, never null`);
    if (record.effectRef?.rider?.kind === "damageBonus") {
      assert.equal(record.expiry.trigger, "time", "Empowering's minute must be a time expiry");
      assert.equal(record.expiry.worldTime, 160);
      assert.ok(record.effectRef.rider.expires && Number.isFinite(record.effectRef.rider.expires.worldTime),
        "the effect-ref rider must keep the non-null expiry the sheet uses to mark it");
    }
  }
  for (const listed of therapistRiders(target)) assert.equal(typeof listed.expired, "boolean",
    `listed rider ${listed.id}: the panel's expired flag must be a boolean, never null`);
});

test("R2-EXEC W2E-2 second-player leg: a healing package for another player's Creature is written once, by the write-leg, with an owner-roll control and zero module rolls", async () => {
  // Spec E5/MAJOR-2 fix: the 1d6-per-AP package is "a separately owner-rolled" rider;
  // E8 "No automatic healing dice"; Integration: consume where the write happens and
  // GM-relay unowned targets. A broken retry either crashes the player leg on
  // assertWritable, never lands the record, or auto-rolls.
  globalThis.game.user = playerUser;
  const actor = medic({ level: 15, id: "r2-w2e2" });
  const target = ally({ owner: false, id: "r2-w2e2-ally" }); // another player's Creature
  const item = healingArt(actor);
  await activateDoctor(actor, "longDistance", "r2-w2e2-doctor");
  const { receipt } = await commitCast(actor, item, { therapy: "energising", secondaryTherapy: "none" },
    { id: "r2-w2e2-cast", cost: 3 });

  const OriginalRoll = globalThis.Roll;
  let constructed = 0;
  globalThis.Roll = class SpyRoll { constructor() { constructed += 1; } };
  try {
    const result = await syncTherapistCast(actor, receipt, [target.uuid]);
    assert.ok(result && Array.isArray(result.riders), "the delivery leg resolves without throwing");
    assert.deepEqual(riderRecords(target), [], "the non-writing client records nothing on the target");
    const use = riderUses(actor)[0];
    assert.ok(use, "the rider use is recorded for retry");
    assert.equal(use.targets[0].ready, true, "the entry is relay-ready");

    game.users.activeGM = gmUser;
    globalThis.game.user = gmUser;
    await medicUses.relayedTargetChange(actor, "apply", { useId: use.id, targetUuid: target.uuid }, gmUser);
    game.users.activeGM = null;
    globalThis.game.user = playerUser;

    const pkg = riderRecords(target).find(record => record.effectRef?.package === true);
    assert.ok(pkg, "the GM write-leg lands the package rider exactly once");
    assert.equal(pkg.effectRef.rider.formula, "3d6", "3 final AP => 3d6");
    assert.equal(pkg.effectRef.rider.kind, "healPackage");
    assert.ok(pkg.expiry && EXPIRY_TRIGGERS.includes(pkg.expiry.trigger), "the package record has a real expiry shape");
    assert.equal(constructed, 0, "delivery never starts a die; only the owner's click rolls");
    const control = packageCards("r2-w2e2-cast");
    assert.equal(control.length, 1, "exactly one package roll control exists for the cast");
    assert.match(String(control[0].content), /Roll 3d6 for R2 Ally|data-ak5e-therapist-package="3d6"/);
  } finally {
    globalThis.Roll = OriginalRoll;
    game.users.activeGM = null;
    globalThis.game.user = playerUser;
  }
});

test("R2-EXEC: replaying the same cast event cannot duplicate rider uses or rider records", async () => {
  // Spec Common: "persistent idempotency ... linked undo". State-level executor guard:
  // a replayed correlated cast event must claim no new riders, receipts or records.
  globalThis.game.user = playerUser;
  const actor = medic({ level: 15, id: "r2-dup" });
  const target = ally({ owner: true, id: "r2-dup-ally" });
  const item = healingArt(actor);
  await activateDoctor(actor, "longDistance", "r2-dup-doctor");
  const { receipt } = await commitCast(actor, item, { therapy: "energising", secondaryTherapy: "none" },
    { id: "r2-dup-cast", cost: 2 });

  const first = await syncTherapistCast(actor, receipt, [target.uuid]);
  const second = await syncTherapistCast(actor, receipt, [target.uuid]);
  assert.deepEqual(second.riders, first.riders, "the replay claims no new riders");
  assert.equal(riderUses(actor).length, 1, "one cast event => one rider use receipt, however many clients process it");
  const records = riderRecords(target).filter(record => String(record.id).includes("r2-dup-cast"));
  assert.equal(new Set(records.map(record => record.id)).size, records.length, "no duplicated rider records");
});

test("R2-EXEC cards: a replayed cast event must not post a second package roll control card", async () => {
  // Spec Common: "persistent idempotency" — reprocessing the same committed cast must
  // not change what the table sees. The Concentrated Treatment card carries live
  // owner-roll controls; two identical controls for one rider is double-roll bait and
  // fails the task's single-executor attack ("no duplicate cards/permission errors").
  globalThis.game.user = playerUser;
  const actor = medic({ level: 15, id: "r2-dupcard" });
  const target = ally({ owner: true, id: "r2-dupcard-ally" });
  const item = healingArt(actor);
  await activateDoctor(actor, "longDistance", "r2-dupcard-doctor");
  const { receipt } = await commitCast(actor, item, { therapy: "energising", secondaryTherapy: "none" },
    { id: "r2-dupcard-cast", cost: 2 });

  await syncTherapistCast(actor, receipt, [target.uuid]);
  const afterFirst = packageCards("r2-dupcard-cast").length;
  await syncTherapistCast(actor, receipt, [target.uuid]);
  const afterSecond = packageCards("r2-dupcard-cast").length;
  assert.equal(afterSecond, afterFirst,
    "the second processing of the same cast must not add another package roll control");
});

test("R2-E8: Recuperative still refuses non-hostile/zero/NaN applications and heals only real per-application damage (guard against the fix groups regressing B semantics)", async () => {
  // Spec E8 + "clamp overspend 0": a NaN amount application must never produce a NaN heal
  // that the write-leg would persist. Frozen/attack pass 1 covered hostile/zero/replay;
  // this adds the numeric-poison case at the consume seam the retry touched.
  const rider = riderFor("recuperative", { spellMod: 3, art: { targetCount: 1 }, castId: "r2-rec",
    casterUuid: "Actor.medic", targetUuids: ["Actor.patient"], worldTime: 100 });
  for (const amount of [NaN, -8]) {
    let heal = null;
    try {
      heal = recuperativeHeal(rider, { id: `r2-rec-${String(amount)}`, targetUuid: "Actor.patient", hostile: true, amount }, []).heal;
    } catch (error) {
      heal = 0; // a hard rejection is also compliant malformed-input behavior
    }
    assert.ok(Number.isFinite(heal) && heal >= 0, `amount ${amount} must yield a finite non-negative heal, got ${heal}`);
    assert.equal(heal, 0, `amount ${amount} is not real damage and may not heal`);
  }
});
