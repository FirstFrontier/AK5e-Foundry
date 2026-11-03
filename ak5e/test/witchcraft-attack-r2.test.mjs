/**
 * Delta adversarial attack suite r2 — Wave 2 package D (Witchcraft), T1-retry
 * candidate (Muse Spark; mostly prior candidate + visibility warnings, Boon
 * gate, non-standard receipt note, race-limit comment).
 * Spec: .codex-work/medic/SPEC-witchcraft.md (acceptance D1–D9 + Common).
 * Source authority: AK5e 1st Ed. v1.3.1 Ch.3 C3:5090–5146, Ch.1/5 refs,
 * U3 rulings 1–11. Drafted from the spec/interfaces only, never from
 * production bodies. Complements (does not duplicate) the frozen suites
 * witchcraft-frozen.test.mjs / witchcraft-attack.test.mjs (65/65).
 *
 * Delta focus (T1-retry claims):
 *   F1  marker gate: bare dnd5e spell/feat damage must not authorise anything
 *       nor post a Witchcurse/Harm/Death offer (spec D5 + Ch.5 art identity).
 *   F2  Life through Death allocation hard-capped at the source-authorized
 *       maximum even via the direct plan API, bypassing sheet validation.
 *   F3  Harm<->Death mutual exclusivity runs BOTH ways, via the flag, the
 *       receipt ledger, and cast-ID canonical spelling; an undone use must
 *       NOT keep the exclusion.
 *   F4  Halfway House grant hook gives no AP reduction for a non-Standard
 *       pool id even when the state was written directly (U3-4, spec D1).
 *   F5  null/unknown range and visibility warn (not silently pass) for real
 *       tokenless targets, and warnings never block owner play.
 *   F7  actual-restored HP governs Psychic/Boon follow-ups; while a GM relay
 *       is pending the actual is pending — never inferred from the nominal.
 *   F3b Witch's Boon undo restores a replaced same-matcher rider.
 *   Targetless spend: loud preview warning + zero-restored receipt summary.
 *
 * Red-first note: the candidate exists, so the suite is green-on-candidate
 * except for ONE test that is EXPECTED TO FAIL and is marked FINDING:
 *   F-D (ATK2-F3e): the new two-way sameRollAs check ignores roll identity —
 *   the Harm branch warns whenever any death-state flag exists and the Death
 *   branch warns whenever any harm-state flag exists, so after one Death use
 *   every later native Harm offer (the sheet always sets sameRollAs) shows a
 *   false 'mutually exclusive' warning, and vice versa. Spec D9 ties the
 *   exclusion to the SAME ROLL only. Severity: medium (warning accuracy /
 *   table confusion; no write-path damage). Suggested fix in the test body.
 * Where a positive control can be run in-process (offer posts, capped sums,
 * restored riders) the control itself demonstrates the red the fix removed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem } from "./base-classes-fixture.mjs";
import { registerMedicArts } from "../scripts/medic-features.mjs";
import { medicUses } from "../scripts/medic-uses.mjs";
import { grantFor } from "../scripts/arts-casting.mjs";
import { getReactions, emitAk5eEvent, registerRider, riderRecords } from "../scripts/trigger-events.mjs";

const featureImport = await import("../scripts/witchcraft-features.mjs").catch(error => ({ __loadError: error }));
const HEALING_POOL = "special-art-pool-healing-arts-4211";      // Special pool, never Standard.
const CORROSION_POOL = "standard-art-pool-corrosion-arts-407";  // Standard pool (Chapter 5).
const BOON_RIDER = "witchcraftWitchsBoon";
let registered = false;

test.before(async () => {
  setupFoundryGlobals({ isGM: false, worldTime: 100, activeGM: null, settings: { "ak5e.artReceiptEpoch": 0 } });
  await registerMedicArts();
  if (typeof featureImport.registerWitchcraftHooks === "function") {
    await featureImport.registerWitchcraftHooks();
    registered = true;
  }
});
test.after(() => teardownFoundryGlobals());

function requireRegistration() {
  assert.equal(typeof featureImport.registerWitchcraftHooks, "function",
    `Witchcraft runtime missing registerWitchcraftHooks() (${featureImport.__loadError?.message ?? "export unavailable"})`);
  assert.equal(registered, true, "registerWitchcraftHooks() was not called in the fixture");
}
function plans() {
  requireRegistration();
  assert.ok(featureImport.WITCHCRAFT_PLANS, "WITCHCRAFT_PLANS missing");
  return featureImport.WITCHCRAFT_PLANS;
}
function lsOf(actor) { return actor.flags.ak5e.resourcePools?.lifeSupport?.value ?? 0; }
function usesOf(actor) { return medicUses.uses(actor) ?? []; }
function warnText(preview) { return JSON.stringify(preview.warnings ?? []); }
function hasWarn(preview, pattern) { return (preview.warnings ?? []).some(entry => pattern.test(JSON.stringify(entry))); }
function witch({ level = 15, lifeSupport = 125, owner = true, name = "Witchcraft R2 Fixture" } = {}) {
  const actor = createTestActor({ id: `witchcraft-r2-${foundry.utils.randomID(5)}`, name, type: "character", level,
    prof: 2 + Math.floor((level - 1) / 4), owner,
    abilities: { wis: { value: 16, mod: 3 } },
    flags: { ak5e: {
      medic: { enabled: true, spellcastingAbility: "wis" },
      casting: { enabled: true, ability: "wis", recovery: "long", castingUnit: "focus" },
      artsPoints: { maximum: 26, value: 26, maximumArtLevel: 8, ninthLevelCast: false },
      resourcePools: { lifeSupport: { value: lifeSupport, max: 125 } }
    } }
  });
  actor.items.set("medic-class", createTestItem({ id: "medic-class", type: "class", name: "Medic", system: { levels: level },
    flags: { ak5e: { chapterThreeId: "class-medic" } } }, actor));
  actor.items.set("witchcraft-branch", createTestItem({ id: "witchcraft-branch", type: "subclass", name: "Witchcraft",
    flags: { ak5e: { chapterThreeId: "subclass-medic-witchcraft" } } }, actor));
  game.actors.set(actor.id, actor);
  return actor;
}
function person({ name = "R2 Person", owner = true, hp = 20, max = 20, ak5eFlags = {} } = {}) {
  const actor = createTestActor({ id: `r2p-${foundry.utils.randomID(6)}`, name, type: "character", level: 1, prof: 2,
    owner, hp: { value: hp, max }, flags: { ak5e: ak5eFlags } });
  game.actors.set(actor.id, actor);
  return actor;
}
function artItem(actor, { name = "R2 Art", marked = true, pool = CORROSION_POOL } = {}) {
  const item = createTestItem({ id: `r2item-${foundry.utils.randomID(6)}`, type: "spell", name,
    system: { level: 3, activation: { type: "action" }, properties: {} },
    flags: marked ? { ak5e: { art: { enabled: true, pool }, pool } } : {} }, actor);
  actor.items.set(item.id, item);
  return item;
}
function bareD20Item(type = "spell", name = "Magic Missile") {
  // A bare dnd5e document: legal dnd5e shape, NO AK5e art/operatorSkill markers.
  return createTestItem({ id: `r2bare-${foundry.utils.randomID(6)}`, type, name,
    system: { level: type === "spell" ? 1 : 0, activation: { type: "action" } }, flags: {} });
}
function offerKeys() {
  return game.messages.map(m => m.getFlag?.("ak5e", "witchcraftOffer") ?? m.flags?.ak5e?.witchcraftOffer ?? "").filter(Boolean);
}

// ---------------------------------------------------------------- F1 · marker gate
// SPEC D5: Witchcurse triggers on Arts damage (any source). "Arts" is an AK5e
// identity — a bare dnd5e spell or feat is not Arts damage (Ch.5, README).
// Naive implementation killed: classify by item.type === "spell" — then every
// stock dnd5e Magic Missile on a cursed creature opens a 2d6 Witchcurse offer.

test("ATK2-F1a: unmarked dnd5e spell/feat damage posts NO Witchcurse offer; AK5e-marked Arts damage does", async () => {
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80 });
  const victim = person({ name: "R2 Cursed Man" });
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: victim.uuid }, "r2-f1-place");
  const bareSpell = bareD20Item("spell");
  const bareFeat = bareD20Item("feat", "Tough");

  for (const [label, item] of [["spell", bareSpell], ["feat", bareFeat]]) {
    const { errors } = await emitAk5eEvent("hitTaken", {
      actorUuid: victim.uuid, actorName: victim.name, total: 7,
      eventId: `hitTaken:r2-f1-bare-${label}`, itemUuid: item.uuid
    });
    assert.equal(errors, 0, `hitTaken ${label} handler must not throw`);
    assert.equal(offerKeys().filter(key => key.includes(`r2-f1-bare-${label}`)).length, 0,
      `bare dnd5e ${label} damage must not offer Witchcurse (marker gate)`);
  }
  // Legacy message-embedded item, also unmarked: must not leak through either.
  await emitAk5eEvent("hitTaken", {
    actorUuid: victim.uuid, actorName: victim.name, total: 7,
    eventId: "hitTaken:r2-f1-bare-legacy", messageUuid: "ChatMessage.r2-f1-legacy"
  });
  assert.equal(offerKeys().filter(key => key.includes("r2-f1-bare-legacy")).length, 0,
    "a hitTaken with no resolvable AK5e-marked source must not offer Witchcurse");

  // Positive control (red-proof): the identical event shape with an AK5e art
    // marker DOES post the offer — so the negatives above are the gate, not a
  // broken harness.
  const marked = artItem(actor, { name: "R2 Corrosion Art" });
  await emitAk5eEvent("hitTaken", {
    actorUuid: victim.uuid, actorName: victim.name, total: 7,
    eventId: "hitTaken:r2-f1-marked", itemUuid: marked.uuid
  });
  assert.ok(offerKeys().some(key => key.includes("hitTaken:r2-f1-marked")),
    `marked Arts damage must offer the Witchcurse trigger (got offers: ${JSON.stringify(offerKeys())})`);
});

test("ATK2-F1b: unmarked damageRoll authorizes nothing — no Harm/Death offers, and a use bound to its id refuses", async () => {
  requireRegistration();
  const actor = witch({ level: 15, lifeSupport: 100 });
  const bare = bareD20Item("spell", "Fire Bolt");
  await emitAk5eEvent("damageRoll", {
    actorUuid: actor.uuid, eventId: "damage:r2-f1b-bare", itemUuid: bare.uuid,
    total: 12, rolls: [{ types: ["damage"] }]
  });
  assert.equal(offerKeys().filter(key => key.includes("damage:r2-f1b-bare")).length, 0,
    "an unmarked dnd5e damage roll must not offer Healing through Harm or Life through Death");
  const lsBefore = lsOf(actor);
  await assert.rejects(
    medicUses.command(actor, "healingThroughHarm", { confirmed: true, damageTotal: 12, sourceRollId: "damage:r2-f1b-bare" }, "r2-f1b-harm"),
    /not known|reopen/i, "Harm bound to an unauthorized roll id must refuse");
  await assert.rejects(
    medicUses.command(actor, "lifeThroughDeath", { confirmed: true, damageTotal: 12, sourceRollId: "damage:r2-f1b-bare", targetUuids: ["Actor.foeA"], allocations: { "Actor.foeA": 12 } }, "r2-f1b-death"),
    /not known|reopen/i, "Death bound to an unauthorized roll id must refuse");
  assert.equal(lsOf(actor), lsBefore, "refused unbound uses move no Life Support");
  assert.equal(medicUses.receipt(actor, "r2-f1b-harm")?.result?.gain ?? 0, 0,
    "a refused unbound Harm must record no gain even if the engine persists the failure");

  // Positive control: the same shape with a marked art DOES authorize and offer.
  const marked = artItem(actor, { name: "R2 Authorized Art" });
  await emitAk5eEvent("damageRoll", {
    actorUuid: actor.uuid, eventId: "damage:r2-f1b-marked", itemUuid: marked.uuid,
    total: 12, rolls: [{ types: ["damage"] }]
  });
  assert.ok(offerKeys().some(key => key === `death:damage:r2-f1b-marked`),
    `a marked Art damage roll must offer Life through Death (got ${JSON.stringify(offerKeys())})`);
  if ((getReactions(actor)?.available ?? 0) >= 1) {
    assert.ok(offerKeys().some(key => key === `harm:damage:r2-f1b-marked`),
      "a marked Art damage roll with an available Reaction must offer Healing through Harm");
  }
});

// ---------------------------------------------------------------- F2 · allocation cap
// SPEC D9: the divided HP total comes from the source-authorized maximum.
// A sheet-side clamp is not enough: the command/plan API must cap even when
// a caller passes allocations that sum above the authorized maximum.

test("ATK2-F2a: direct plan-API apply caps over-allocation at the authorized maximum (bypasses engine and sheet)", async () => {
  const { lifeThroughDeath } = plans();
  const actor = witch({ level: 15, lifeSupport: 80 });
  const plan = lifeThroughDeath(actor, null, {
    confirmed: true, damageTotal: 20,
    targetUuids: ["Actor.foeA", "Actor.foeB"],
    allocations: { "Actor.foeA": 15, "Actor.foeB": 10 }   // 25 requested against max 20
  });
  const receipt = { id: "r2-f2a-direct", targets: [], result: null, summary: "" };
  await plan.apply({}, receipt);
  const amounts = (receipt.targets ?? []).filter(entry => (entry.kind === "heal" || entry.kind === "witchcraftAllocation"))
    .map(entry => Number(entry.amount) || 0);
  const sum = amounts.reduce((total, value) => total + value, 0);
  assert.ok(sum <= 20, `direct-API allocation sum must be capped at the authorized 20, got ${sum} (${JSON.stringify(amounts)})`);
  assert.equal(receipt.result?.remainder ?? receipt.result?.unspent, 0, "a full capped allocation must report zero remainder");
  assert.equal(amounts.at(-1), 5, "the last target must receive only the remaining authorized HP (20-15), never its requested 10");
});

test("ATK2-F2b: over-allocated Death via the command API never heals more HP than the roll authorized", async () => {
  requireRegistration();
  const actor = witch({ level: 15, lifeSupport: 80 });
  const allyA = person({ name: "R2 Wounded A", hp: 5, max: 20 });   // room for 15
  const allyB = person({ name: "R2 Wounded B", hp: 2, max: 20 });   // room for 18; asked 10
  await medicUses.command(actor, "lifeThroughDeath", {
    confirmed: true, damageTotal: 20,
    targetUuids: [allyA.uuid, allyB.uuid],
    allocations: { [allyA.uuid]: 15, [allyB.uuid]: 10 }             // 25 against max 20
  }, "r2-f2b-death");
  const gainedA = allyA.system.attributes.hp.value - 5;
  const gainedB = allyB.system.attributes.hp.value - 2;
  assert.ok(gainedA + gainedB <= 20,
    `combined healed HP must never exceed the authorized 20 (got ${gainedA} + ${gainedB} = ${gainedA + gainedB})`);
  assert.equal(gainedA, 15, "the first target receives its 15 within the maximum");
  assert.equal(gainedB, 5, "the second target is capped to the remaining 5 of 20, not its requested 10");
  const receipt = medicUses.receipt(actor, "r2-f2b-death");
  assert.equal(receipt?.result?.remainder ?? receipt?.result?.unspent, 0, "capped allocation reports zero remainder");
});

// ---------------------------------------------------------------- F3 · mutual exclusivity, both ways
// SPEC D9 + ruling 10: one rolled total funds Harm OR Death, never both.
// The check must survive: cast-ID vs damage-event-ID spelling, the state flag
// being lost (reload), and must release the roll when the Death use is undone.

async function boundDeath(label) {
  const actor = witch({ level: 15, lifeSupport: 80, name: `R2 Excl ${label}` });
  const item = artItem(actor, { name: "R2 Bound Art" });
  await emitAk5eEvent("damageRoll", {
    actorUuid: actor.uuid, eventId: `damage:r2-f3-${label}`, castId: `cast:r2-f3-${label}`,
    itemUuid: item.uuid, total: 12, isArt: true
  });
  await medicUses.command(actor, "lifeThroughDeath", {
    confirmed: true, sourceRollId: `damage:r2-f3-${label}`, damageTotal: 12,
    targetUuids: ["Actor.foeA"], allocations: { "Actor.foeA": 12 }
  }, `r2-f3-${label}-death`);
  return { actor, item };
}

test("ATK2-F3a: Harm following Death on the same roll warns — via cast-ID and damage-event-ID spellings", async () => {
  requireRegistration();
  const { actor } = await boundDeath("a");
  for (const spelling of ["cast", "event"]) {
    const rollId = spelling === "cast" ? "cast:r2-f3-a" : "damage:r2-f3-a";
    const preview = medicUses.preview(actor, "healingThroughHarm", { damageTotal: 12, sameRollAs: rollId });
    assert.ok(hasWarn(preview, /mutually exclusive|exclusive/i),
      `Harm with sameRollAs via ${spelling} id must warn on the Death-claimed roll (got ${warnText(preview)})`);
  }
  // Control: an unrelated sameRollAs must NOT warn — kills "warn on any sameRollAs".
  // NOTE: this assertion is tracked as FINDING F-D in ATK2-F3e below; the candidate
  // flags `deathState(actor) || used` without checking the flag's roll identity.
});

test("ATK2-F3b: Harm still warns from the receipt ledger when the Death flag was lost (reload/persistence attack)", async () => {
  requireRegistration();
  const { actor } = await boundDeath("b");
  assert.ok(actor.flags.ak5e?.witchcraft?.lifeThroughDeath, "precondition: Death flag was written");
  delete actor.flags.ak5e.witchcraft.lifeThroughDeath;      // simulate a lost/unsynced flag
  const preview = medicUses.preview(actor, "healingThroughHarm", { damageTotal: 12, sameRollAs: "damage:r2-f3-b" });
  assert.ok(!actor.flags.ak5e?.witchcraft?.lifeThroughDeath, "precondition: Death flag gone");
  assert.ok(hasWarn(preview, /mutually exclusive|exclusive/i),
    `ledger-only Death claim must still warn (got ${warnText(preview)})`);
  // The exclusion is warning-level per Common ("warnings not blocks; the table
  // rules"); this test pins that the ledger path reaches the SAME warning the
  // flagged path produces, without the flag.
  const flagged = medicUses.preview(actor, "healingThroughHarm", { damageTotal: 12 });
  assert.ok(!hasWarn(flagged, /mutually exclusive/i),
    "control: without sameRollAs naming the claim, the ledger alone does not fire the warning");
});

test("ATK2-F3c: undoing the Death use releases the roll — Harm no longer warns (undone entries are not claims)", async () => {
  requireRegistration();
  const { actor } = await boundDeath("c");
  await medicUses.undo(actor, "r2-f3-c-death");
  const live = usesOf(actor).find(entry => entry.id === "r2-f3-c-death");
  assert.ok(!live || live.status === "undone", "precondition: the Death use is undone");
  const preview = medicUses.preview(actor, "healingThroughHarm", { damageTotal: 12, sameRollAs: "damage:r2-f3-c" });
  assert.ok(!hasWarn(preview, /mutually exclusive/i),
    `an undone Death claim must not keep the roll locked (got ${warnText(preview)})`);
});

test("ATK2-F3d: the other direction too — Death warns on a Harm-claimed roll from the ledger when the Harm flag was lost", async () => {
  requireRegistration();
  const actor = witch({ level: 15, lifeSupport: 80, name: "R2 Excl d" });
  await medicUses.command(actor, "healingThroughHarm", { confirmed: true, damageTotal: 12 }, "r2-f3d-harm");
  assert.ok(actor.flags.ak5e?.witchcraft?.harm, "precondition: Harm flag was written");
  delete actor.flags.ak5e.witchcraft.harm;                 // simulate flag loss after the use
  const preview = medicUses.preview(actor, "lifeThroughDeath", {
    damageTotal: 12, targetUuids: ["Actor.foeA"], allocations: { "Actor.foeA": 12 }, sameRollAs: "r2-f3d-harm"
  });
  assert.ok(!actor.flags.ak5e?.witchcraft?.harm, "precondition: Harm flag gone");
  assert.ok(hasWarn(preview, /mutually exclusive|exclusive/i),
    `Death after a ledger-recorded Harm use must warn (got ${warnText(preview)})`);
});

test("ATK2-F3e: FINDING F-D — exclusivity must be per-roll: an unclaimed sameRollAs must not warn (both directions)", async () => {
  // Kills: the T1-retry two-way fix (F-A) compares the wrong thing — the Harm
  // branch warns whenever the death-state flag EXISTS, and the Death branch
  // warns whenever the harm-state flag EXISTS, ignoring the named roll's
  // identity. Consequence: after any Death use (until the Long Rest) every
  // later native Harm offer (the sheet always sets sameRollAs to the new
  // damage event) shows a false 'mutually exclusive' warning, and vice versa.
  // Expected GREEN per spec D9 ('mutually exclusive with Harm on the SAME
  // ROLL'); RED against this candidate. Suggested fix (identity-tied, still
  // conservative for unknown rolls):
  //   Harm side: ((deathClaim?.sourceRollId ?? sameSource) === sameSource) || used
  //   Death side: ((harmClaim?.sourceRollId ?? sameSource) === sameSource) || used
  //   where sameSource is the canonicalised data.sameRollAs.
  requireRegistration();
  const { actor } = await boundDeath("e");
  const clean = medicUses.preview(actor, "healingThroughHarm", { damageTotal: 12, sameRollAs: "damage:r2-e-unrelated" });
  assert.ok(!hasWarn(clean, /mutually exclusive/i),
    `FINDING F-D (Harm side): a fresh unclaimed roll must not draw the exclusivity warning after an unrelated Death use (got ${warnText(clean)})`);

  // Symmetric Death side: bind and claim Harm on its own roll, then preview
  // Death on a DIFFERENT roll id — must not warn.
  const other = witch({ level: 15, lifeSupport: 80, name: "R2 Excl e2" });
  const item2 = artItem(other, { name: "R2 Second Art" });
  await emitAk5eEvent("damageRoll", { actorUuid: other.uuid, eventId: "damage:r2-e2-harm", itemUuid: item2.uuid, total: 8, isArt: true });
  await medicUses.command(other, "healingThroughHarm", { confirmed: true, damageTotal: 8, sourceRollId: "damage:r2-e2-harm" }, "r2-e2-harm");
  assert.ok(other.flags.ak5e?.witchcraft?.harm, "precondition: Harm flag exists on its own roll");
  const deathClean = medicUses.preview(other, "lifeThroughDeath", {
    damageTotal: 10, targetUuids: ["Actor.foeZ"], allocations: { "Actor.foeZ": 10 }, sameRollAs: "damage:r2-e2-unrelated"
  });
  assert.ok(!hasWarn(deathClean, /mutually exclusive/i),
    `FINDING F-D (Death side): Death on an unclaimed roll must not warn because some unrelated Harm exists (got ${warnText(deathClean)})`);
});

// ---------------------------------------------------------------- F4 · grant hook standard-pool gate
// SPEC D1 + U3-4: Halfway House chooses a STANDARD Arts pool; the reduction is
// AP-only and larger-never-sums. The sheet only offers Standard pools; the
// grant hook must also refuse to discount a non-Standard pool id even when the
// halfwayHouse state was written directly (stale/legacy/manual data).

test("ATK2-F4a: Halfway House reduction applies for a Standard pool (control) but never for a non-Standard pool id", async () => {
  requireRegistration();
  // Control — Standard pool through the real command path: reduction lands.
  const standard = witch({ level: 11, lifeSupport: 60, name: "R2 Halfway Standard" });
  await medicUses.command(standard, "halfwayHouse", { confirmed: true, pool: CORROSION_POOL }, "r2-f4-std");
  const created = Array.from(standard.items.values()).filter(item => item.type === "spell");
  assert.ok(created.length > 0, "control: Halfway House on a Standard pool must grant Arts");
  const grant = grantFor(created[0], standard);
  assert.equal(grant.reduction, 2, `level-11 Standard-pool Halfway House reduction must be 2 (got ${grant.reduction})`);
  assert.match(String(grant.source ?? ""), /halfway house/i, "the grant source must name Halfway House");

  // Attack — non-Standard pool id reaches the state (warn-not-block apply).
  const special = witch({ level: 11, lifeSupport: 60, name: "R2 Halfway Special" });
  await medicUses.command(special, "halfwayHouse", { confirmed: true, pool: HEALING_POOL }, "r2-f4-special");
  assert.equal(special.flags.ak5e?.witchcraft?.halfwayHouse?.poolId, HEALING_POOL,
    "precondition: the non-Standard pool id is recorded in the state (warned, not blocked)");
  assert.equal(Array.from(special.items.values()).filter(item => item.type === "spell").length, 0,
    "a non-Standard pool must grant no Arts");
  const art = artItem(special, { name: "R2 Healing-Arts Art", pool: HEALING_POOL });
  const leaked = grantFor(art, special);
  assert.equal(Number(leaked.reduction) || 0, 0,
    `the grant hook must give no AP reduction for a non-Standard pool id (got ${JSON.stringify(leaked)})`);
  assert.doesNotMatch(String(leaked.source ?? ""), /halfway house/i,
    "a non-Standard discount must not be attributed to Halfway House");
});

// ---------------------------------------------------------------- F5 · unknown range/visibility
// SPEC D3/D4/D9 + Common (warnings not blocks): when the client CANNOT tell
// (no scene tokens), range and visibility are unknown — that must warn, the
// same as an explicit negative, and must never block owner play.

test("ATK2-F5a: tokenless LS heal target warns unknown visibility and hand-entered range, yet still heals", async () => {
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 60, name: "R2 Witchdoctor" });
  const ally = person({ name: "R2 Patient", hp: 5, max: 20 });
  const preview = medicUses.preview(actor, "witchcraftLifeSupport", { amount: 8, targetUuid: ally.uuid, rangeFt: 30 });
  assert.ok(hasWarn(preview, /cannot determine|no scene token/i),
    `visibility unknown must warn (got ${warnText(preview)})`);
  assert.ok(hasWarn(preview, /entered by hand|verify it at the table/i),
    `a hand-typed range with no scene measurement must warn (got ${warnText(preview)})`);
  await medicUses.command(actor, "witchcraftLifeSupport", { confirmed: true, amount: 8, targetUuid: ally.uuid, rangeFt: 30 }, "r2-f5a-heal");
  assert.equal(ally.system.attributes.hp.value, 13, "the warned heal must still apply (warning, not block)");
});

test("ATK2-F5b: Death allocation preview warns unknown range AND unknown visibility for real tokenless targets", async () => {
  requireRegistration();
  const actor = witch({ level: 15, lifeSupport: 80, name: "R2 Death Gater" });
  const ally = person({ name: "R2 Allocation Target", hp: 0, max: 20 });
  const preview = medicUses.preview(actor, "lifeThroughDeath", {
    damageTotal: 10, targetUuids: [ally.uuid], allocations: { [ally.uuid]: 10 }
  });
  assert.ok(hasWarn(preview, /cannot determine|no scene token/i),
    `unknown visibility must warn on the allocation preview (got ${warnText(preview)})`);
  assert.ok(hasWarn(preview, /cannot measure|no scene token/i),
    `unknown range must warn on the allocation preview (got ${warnText(preview)})`);
});

test("ATK2-F5c: Witchcurse placement and trigger warn unknown visibility for tokenless real targets", async () => {
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80, name: "R2 Curser" });
  const victim = person({ name: "R2 Curse Mark" });
  const ally = person({ name: "R2 Cure Mark", hp: 5, max: 20 });
  const placement = medicUses.preview(actor, "witchcurse", { targetUuid: victim.uuid, rangeFt: 30 });
  assert.ok(hasWarn(placement, /cannot determine|no scene token/i),
    `placement on a tokenless target must warn unknown visibility (got ${warnText(placement)})`);
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: victim.uuid }, "r2-f5c-place");
  const trigger = medicUses.preview(actor, "witchcurse", {
    triggerEventId: "hitTaken:r2-f5c", targetUuid: ally.uuid, rangeFt: 30, damageTotal: 9, sourceKind: "art-cast"
  });
  assert.ok(hasWarn(trigger, /cannot determine|no scene token/i),
    `a trigger healing a tokenless target must warn unknown visibility (got ${warnText(trigger)})`);
});

// ---------------------------------------------------------------- F7 · targetless spend
// SPEC D6 + Common: the spend and the actual are different facts. A targetless
// spend is legal (warned loudly) but must record ZERO restored, never a
// nominal amount, and the Boon follow-up must not light up.

test("ATK2-F7a: targetless Life Support spend warns loudly and its receipt records zero restored, never the nominal", async () => {
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 60, name: "R2 Targetless" });
  const preview = medicUses.preview(actor, "witchcraftLifeSupport", { amount: 8 });
  assert.ok(hasWarn(preview, /no healing target|zero hp/i),
    `a targetless spend must warn that zero HP will be restored (got ${warnText(preview)})`);
  const boonPreview = medicUses.preview(actor, "witchcraftLifeSupport", { amount: 8, boon: true });
  assert.ok(hasWarn(boonPreview, /boon.*(needs|target|creature)|choose a target/i),
    `Boon without a target must warn its own way (got ${warnText(boonPreview)})`);

  const before = lsOf(actor);
  await medicUses.command(actor, "witchcraftLifeSupport", { confirmed: true, amount: 8 }, "r2-f7a-spend");
  assert.equal(lsOf(actor), before - 8, "the spend stands even with no target");
  const receipt = medicUses.receipt(actor, "r2-f7a-spend");
  assert.match(receipt?.summary ?? "", /zero HP restored|restores? 0 actual/i,
    `the summary must say zero actual HP were restored (got ${JSON.stringify(receipt?.summary)})`);
  const actual = receipt?.result?.actualRestored;
  assert.ok(actual === null || actual === 0,
    `the recorded actual must never be the nominal 8 (got ${JSON.stringify(actual)})`);
  assert.equal(receipt?.result?.targetUuid ?? null, null, "no phantom target may be recorded");
  assert.equal(receipt?.result?.boon?.eligible ?? false, false, "a targetless spend cannot feed the Boon");
});

// ---------------------------------------------------------------- F7 · pending relay actuals
// SPEC D6/D8 + Common (unowned mutations validated through GM relay): while a
// relay is pending, the ACTUAL restored HP is unknowable. Nothing may be
// inferred from the nominal: Boon eligibility, Psychic damage, rider writes.

test("ATK2-F7b: Boon on an unowned target stays pending — no eligibility is fabricated and no rider is written locally", async () => {
  requireRegistration();
  const actor = witch({ level: 11, lifeSupport: 80, name: "R2 Boon Relay" });
  const stranger = person({ name: "R2 Unowned Patient", owner: false, hp: 5, max: 20 });
  try {
    await medicUses.command(actor, "witchcraftLifeSupport",
      { confirmed: true, amount: 8, targetUuid: stranger.uuid, boon: true }, "r2-f7b-boon");
  } catch (error) {
    assert.match(String(error?.message ?? error), /not applied|no GM|relay/i,
      `the pending relay must surface as a recorded non-application (got ${error})`);
  }
  const receipt = medicUses.receipt(actor, "r2-f7b-boon");
  assert.ok(receipt, "the relayed use must still be recorded");
  assert.equal(receipt?.result?.pendingRelay, true, "the receipt must mark the actual as pending the relay");
  assert.equal(receipt?.result?.actualRestored, null, "no actual HP may be claimed while the relay is pending");
  assert.equal(receipt?.result?.boon?.eligible, false, "Boon eligibility cannot be decided on a pending actual");
  assert.equal(receipt?.result?.boon?.pending, true, "the Boon must be recorded as pending, not failed or granted");
  assert.match(String(receipt?.result?.boon?.reason ?? ""), /relay/i, "the Boon reason must name the pending relay");
  assert.equal(stranger.system.attributes.hp.value, 5, "the unowned target's HP is untouched while pending");
  assert.equal(riderRecords(stranger).filter(record => record.matcher === BOON_RIDER).length, 0,
    "no Boon rider may be written to an unowned target without the GM relay");
  await medicUses.undo(actor, "r2-f7b-boon");
});

test("ATK2-F7c: Witchcurse Psychic damage follows the APPLIED actual (capped 4 of 9), not the nominal roll", async () => {
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80, name: "R2 Psychic Actual" });
  const victim = person({ name: "R2 Psychic Victim", hp: 20, max: 20 });
  const ally = person({ name: "R2 Nearly Full Ally", hp: 16, max: 20 });
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: victim.uuid }, "r2-f7c-place");
  await medicUses.command(actor, "witchcurse", {
    confirmed: true, triggerEventId: "hitTaken:r2-f7c", targetUuid: ally.uuid, rangeFt: 30,
    damageTotal: 9, sourceKind: "art-cast"
  }, "r2-f7c-trigger");
  const receipt = medicUses.receipt(actor, "r2-f7c-trigger");
  assert.equal(receipt?.result?.actualRestored, 4, "only 4 of the nominal 9 HP are actually restored (cap at max)");
  assert.equal(receipt?.result?.psychicDamage, 4,
    `Psychic damage equals the ACTUAL restored HP (4), never the nominal 2d6 (got ${JSON.stringify(receipt?.result?.psychicDamage)})`);
  const damageEntry = (receipt?.targets ?? []).find(entry => entry.kind === "damage");
  assert.equal(Number(damageEntry?.amount), 4, "the recorded damage target change carries the actual, capped amount");
  assert.match(String(receipt?.summary ?? ""), /\b4\b/, "the summary must state the actual Psychic amount");
  assert.equal(ally.system.attributes.hp.value, 20, "the ally gained exactly the 4 actual HP");
  assert.equal(victim.system.attributes.hp.value, 16,
    `the cursed creature took exactly the actual-restored Psychic damage (4), not the nominal 9 (hp ${victim.system.attributes.hp.value})`);
});

test("ATK2-F7d: a pending-relay Witchcurse trigger cannot fabricate Psychic damage", async () => {
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80, name: "R2 Psychic Pending" });
  const victim = person({ name: "R2 Pending Victim" });
  const stranger = person({ name: "R2 Pending Patient", owner: false, hp: 5, max: 20 });
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: victim.uuid }, "r2-f7d-place");
  try {
    await medicUses.command(actor, "witchcurse", {
      confirmed: true, triggerEventId: "hitTaken:r2-f7d", targetUuid: stranger.uuid, rangeFt: 30,
      damageTotal: 9, sourceKind: "art-cast"
    }, "r2-f7d-trigger");
  } catch (error) {
    assert.match(String(error?.message ?? error), /not applied|no GM|relay/i, "pending relay surfaces as non-applied");
  }
  const receipt = medicUses.receipt(actor, "r2-f7d-trigger");
  assert.ok(receipt, "the trigger attempt is still recorded");
  assert.equal(receipt?.result?.pendingRelay, true, "the actual is pending the relay");
  assert.equal(receipt?.result?.psychicDamage ?? null, null,
    `Psychic damage must be unknown while the actual is pending, never the nominal 9 (got ${JSON.stringify(receipt?.result?.psychicDamage)})`);
  assert.equal(stranger.system.attributes.hp.value, 5, "the pending relay heals nothing locally");
  await medicUses.undo(actor, "r2-f7d-trigger");
});

// ---------------------------------------------------------------- F3b · Boon replaced-rider undo
// SPEC D8: one Boon rider per recipient; consume/expiry/undo must be correct.
// Replacing an existing same-matcher rider and then undoing must restore the
// REPLACED rider, not merely delete both.

test("ATK2-F7e: Witch's Boon undo restores the same-matcher rider it replaced", async () => {
  requireRegistration();
  const actor = witch({ level: 11, lifeSupport: 80, name: "R2 Boon Replacer" });
  const ally = person({ name: "R2 Boon Bearer", hp: 5, max: 20 });
  await registerRider({
    id: "r2-prior-boon", actor: ally, trigger: "attack", match: BOON_RIDER,
    consume: "untilExpiry", expiry: { trigger: "manual", instructions: "end of the recipient's next turn" },
    label: "Prior Witch's Boon"
  });
  assert.ok(riderRecords(ally).some(record => record.id === "r2-prior-boon"), "precondition: prior rider is registered");

  await medicUses.command(actor, "witchcraftLifeSupport",
    { confirmed: true, amount: 8, targetUuid: ally.uuid, boon: true }, "r2-f7e-boon");
  const receipt = medicUses.receipt(actor, "r2-f7e-boon");
  assert.equal(receipt?.result?.boon?.eligible, true, "precondition: 8 actual HP restored meets the Boon threshold");
  const afterGrant = riderRecords(ally);
  const newRider = afterGrant.find(record => record.id !== "r2-prior-boon" && record.matcher === BOON_RIDER);
  assert.ok(newRider, `the new Boon rider must be registered (got ${JSON.stringify(afterGrant.map(r => r.id))})`);
  assert.ok(!afterGrant.some(record => record.id === "r2-prior-boon"),
    "the replaced rider must be removed while the new Boon rides");

  await medicUses.undo(actor, "r2-f7e-boon");
  const afterUndo = riderRecords(ally);
  assert.ok(!afterUndo.some(record => record.id === newRider.id),
    "undo must remove the Boon rider it applied");
  assert.ok(afterUndo.some(record => record.id === "r2-prior-boon" && record.status === "active"),
    `undo must restore the replaced rider (got ${JSON.stringify(afterUndo.map(r => [r.id, r.status]))})`);
});
