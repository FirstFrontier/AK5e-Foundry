/**
 * Adversarial attack suite for Wave 2 package D (Witchcraft branch).
 * Spec: .codex-work/medic/SPEC-witchcraft.md (acceptance D1–D9).
 * Source authority: AK5e 1st Ed. v1.3.1, Chapter 3 C3:5090–5146 and referenced
 * Chapter 1/5 rules; U3 batch rulings 1–11 and owner/open readings in DECISIONS.md
 * (Five-branch batch rulings 2026-10-25 §§4–10; open readings 2026-11-01).
 *
 * Drafted from the spec/source/interfaces only, never from production bodies:
 * every expectation cites the spec section or ruling it depends on, and each
 * test documents the naive implementation it would kill. The candidate modules
 * (witchcraft-features.mjs / witchcraft-sheet.mjs) already exist, so red-first
 * proof is impossible here; kill-power is argued per test instead.
 *
 * Uses only the public contract surface: registerWitchcraftHooks(),
 * WITCHCRAFT_PLANS, medicUses preview/command/receipt/undo, and the shared
 * fixture helpers. Three tests are EXPECTED TO FAIL against the candidate and
 * are marked FINDING with the suspected code location:
 *   F-A (ATK-D9a): Harm↔Death exclusion is one-directional (death-side only).
 *   F-B (ATK-D2c): Harm excess above max is never lost on a Long Rest,
 *       contradicting ruling 5 and the module's own card text.
 *   F-C (ATK-D4d): Witchcurse placement previews no Life Support shortfall
 *       when the pool cannot cover the 10-LS cost, unlike the LS-heal path.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem, triggerShortRest, triggerLongRest, createTestCombat } from "./base-classes-fixture.mjs";
import { registerMedicArts } from "../scripts/medic-features.mjs";
import { medicUses } from "../scripts/medic-uses.mjs";

const featureImport = await import("../scripts/witchcraft-features.mjs").catch(error => ({ __loadError: error }));
const sheetImport = await import("../scripts/witchcraft-sheet.mjs").catch(error => ({ __loadError: error }));
const HEALING_POOL = "special-art-pool-healing-arts-4211";
const OTHER_POOL = "special-art-pool-other-0000";
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
  assert.equal(typeof featureImport.registerWitchcraftHooks, "function", "Witchcraft runtime missing registerWitchcraftHooks()");
  assert.equal(registered, true, "registerWitchcraftHooks() was not called in the fixture");
}
function lsOf(actor) { return actor.flags.ak5e.resourcePools?.lifeSupport?.value ?? 0; }
function usesOf(actor) { return medicUses.uses(actor) ?? []; }
function warningsOf(preview) { return preview.warnings ?? []; }
function warnText(preview) { return JSON.stringify(warningsOf(preview)); }
function hasWarn(preview, pattern) { return warningsOf(preview).some(entry => pattern.test(JSON.stringify(entry))); }
function witch({ level = 15, lifeSupport = 125, owner = true, id = `witchcraft-atk-${foundry.utils.randomID(5)}` } = {}) {
  const actor = createTestActor({ id, name: "Witchcraft Attack Fixture", type: "character", level,
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
function plainStranger(name = "Unowned Bystander") {
  const stranger = createTestActor({ name, type: "character", level: 1, prof: 2, owner: false,
    flags: { ak5e: {} } });
  game.actors.set(stranger.id, stranger);
  return stranger;
}

// ---------------------------------------------------------------- D1 attacks
// SPEC D1: Halfway House grants a chosen Standard pool within the Medic maximum
// level; same pool as Self-Defence warns; overlap takes the larger reduction.

test("ATK-D1a: overlap warning is pool-specific — a different pool does not warn", async () => {
  // Kills: warning on ANY second selection instead of only the granted pool.
  requireRegistration();
  const actor = witch({ level: 5 });
  await medicUses.command(actor, "halfwayHouse", { confirmed: true, pool: HEALING_POOL }, "atk-d1a-hw");
  const other = medicUses.preview(actor, "halfwayHouse", { pool: OTHER_POOL });
  assert.ok(!hasWarn(other, /overlap|already/i),
    `selecting a different pool must not warn as an overlap (got ${warnText(other)})`);
});

test("ATK-D1b: same operation id commanded twice records exactly one use", async () => {
  // Kills: double-apply on retry/replay (grant applied twice, receipt duplicated).
  requireRegistration();
  const actor = witch({ level: 5 });
  const before = usesOf(actor).length;
  await medicUses.command(actor, "halfwayHouse", { confirmed: true, pool: HEALING_POOL }, "atk-d1b-hw");
  await medicUses.command(actor, "halfwayHouse", { confirmed: true, pool: HEALING_POOL }, "atk-d1b-hw");
  assert.equal(usesOf(actor).length, before + 1, "re-commanding the same operation id must stay idempotent");
});

test("ATK-D1c: over-maximum Art level preview warns and writes nothing", async () => {
  // Kills: previews that mutate, and silent grants above the Medic maximum
  // level (D1 bounds the grant by the Medic maximum Art level).
  requireRegistration();
  const actor = witch({ level: 5 });
  const before = usesOf(actor).length;
  const preview = medicUses.preview(actor, "halfwayHouse", { pool: HEALING_POOL, artLevel: 9 });
  assert.ok(hasWarn(preview, /level|max/i), `over-max Art level must warn (got ${warnText(preview)})`);
  assert.equal(usesOf(actor).length, before, "previews alone must record no use");
  assert.equal(lsOf(actor), 125, "previews alone must move no Life Support");
});

// ---------------------------------------------------------------- D2 attacks
// SPEC D2 + ruling 5: offered confirmed Reaction, once/SR; gain is floor(own
// rolled Art damage total incl. modifiers / 2); may exceed max, excess lost LR.

test("ATK-D2a: zero damage total gains zero and never drains", async () => {
  // Kills: unsigned/clamped arithmetic that turns floor(0/2) into a gain, or a
  // zero-gain path that subtracts.
  requireRegistration();
  const actor = witch({ level: 5, lifeSupport: 10 });
  await medicUses.command(actor, "healingThroughHarm", { confirmed: true, damageTotal: 0 }, "atk-d2a-harm");
  assert.equal(lsOf(actor), 10, "floor(0/2) = 0 Life Support gained");
});

test("ATK-D2b: a Short Rest clears the once-per-rest Harm limit", async () => {
  // Kills: exhaustion state that is never reset (ruling 5: recovers on SR).
  requireRegistration();
  const actor = witch({ level: 5 });
  await medicUses.command(actor, "healingThroughHarm", { confirmed: true, damageTotal: 11 }, "atk-d2b-harm");
  assert.ok(hasWarn(medicUses.preview(actor, "healingThroughHarm", { damageTotal: 11 }), /rest|once|short|already/i),
    "second Harm preview before a Short Rest must warn");
  await triggerShortRest(actor);
  assert.ok(!hasWarn(medicUses.preview(actor, "healingThroughHarm", { damageTotal: 11 }), /rest|once|short|already/i),
    "after a Short Rest the once-per-rest warning must clear");
});

test("ATK-D2c: FINDING F-B — a Long Rest drops Harm excess above the maximum", async () => {
  // SPEC: ruling 5 "may exceed the maximum; the excess is lost on a Long Rest",
  // repeated on the module's own Harm card. Kills: rest handler that clears the
  // exhaustion flag but never clamps the pool (clearExhaustedRestState only
  // removes flags; the promise at the Harm summary has no writer).
  requireRegistration();
  const actor = witch({ level: 5, lifeSupport: 123 });
  await medicUses.command(actor, "healingThroughHarm", { confirmed: true, damageTotal: 11 }, "atk-d2c-harm");
  assert.equal(lsOf(actor), 128, "gain may exceed the maximum (precondition)");
  await triggerLongRest(actor);
  assert.ok(lsOf(actor) <= 125, `Long Rest must lose the excess above max 125 (got ${lsOf(actor)})`);
});

test("ATK-D2d: unconfirmed Harm writes nothing", async () => {
  // Kills: confirm bypass — applying the Reaction gain without explicit confirm.
  requireRegistration();
  const actor = witch({ level: 5, lifeSupport: 10 });
  await assert.rejects(
    medicUses.command(actor, "healingThroughHarm", { confirmed: false, damageTotal: 11 }, "atk-d2d-harm"),
    /confirm/i, "unconfirmed Harm must refuse before any write");
  assert.equal(lsOf(actor), 10, "refused uses change nothing");
  assert.equal(usesOf(actor).length, 0, "refused uses record nothing");
});

test("ATK-D2e: after a Short Rest a second Harm gains again", async () => {
  // Positive path of the rest reset: the recovered Reaction is usable, not just
  // warning-free (ruling 5).
  requireRegistration();
  const actor = witch({ level: 5, lifeSupport: 10 });
  await medicUses.command(actor, "healingThroughHarm", { confirmed: true, damageTotal: 11 }, "atk-d2e-h1");
  assert.equal(lsOf(actor), 15, "first Harm gains floor(11/2) = 5");
  await triggerShortRest(actor);
  await medicUses.command(actor, "healingThroughHarm", { confirmed: true, damageTotal: 9 }, "atk-d2e-h2");
  assert.equal(lsOf(actor), 19, "recovered Harm gains floor(9/2) = 4");
});

// ---------------------------------------------------------------- D3 attacks
// SPEC D3 + ruling 6: Witchdoctor 60-foot LS healing from level 4; base touch;
// range is a warning only.

test("ATK-D3a: range boundary — 60 feet is clean, 61 feet warns", async () => {
  // Kills: off-by-one (`>=` instead of `>`) that warns on the legal maximum.
  requireRegistration();
  const actor = witch({ level: 4, lifeSupport: 60 });
  const atEdge = medicUses.preview(actor, "witchcraftLifeSupport", { amount: 10, rangeFt: 60 });
  const pastEdge = medicUses.preview(actor, "witchcraftLifeSupport", { amount: 10, rangeFt: 61 });
  assert.ok(!hasWarn(atEdge, /range|foot|feet|60/i), `60 feet is in reach (got ${warnText(atEdge)})`);
  assert.ok(hasWarn(pastEdge, /range|foot|feet|60/i), `61 feet must warn (got ${warnText(pastEdge)})`);
});

test("ATK-D3b: below level 4 the reach falls back — 30 feet warns twice", async () => {
  // Kills: level-gated reach granted early (60 ft at level 3). Ruling 6: base
  // Life Support healing is Touch; Witchdoctor raises it at 4.
  requireRegistration();
  const actor = witch({ level: 3, lifeSupport: 60 });
  const preview = medicUses.preview(actor, "witchcraftLifeSupport", { amount: 10, rangeFt: 30 });
  assert.ok(hasWarn(preview, /level|4th|fourth|witchdoctor/i), `level 3 must warn the level gate (got ${warnText(preview)})`);
  assert.ok(hasWarn(preview, /range|foot|feet|touch|5/i), `level 3 reach is not 60 ft (got ${warnText(preview)})`);
});

test("ATK-D3c: overspend preview names the shortfall with amounts", async () => {
  // Kills: silent clamps — Common requires overspends to show the shortfall.
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 60 });
  const preview = medicUses.preview(actor, "witchcraftLifeSupport", { amount: 200, rangeFt: 30 });
  assert.ok(hasWarn(preview, /200.*60|60.*200|short|remain|clamp/i),
    `overspend must show the shortfall with amounts (got ${warnText(preview)})`);
});

// ---------------------------------------------------------------- D4 attacks
// SPEC D4 + ruling 7: Witchcurse at 7 — Bonus Action + 10 LS, visible target
// within 60 ft, one minute, one curse per Medic; replace + undo restore.

test("ATK-D4a: placement without a target rejects and writes nothing", async () => {
  // Kills: targetless curse placement (the command needs `need`, not just a
  // preview warning — there is no target to curse or spend for).
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 50 });
  assert.ok(hasWarn(medicUses.preview(actor, "witchcurse", { rangeFt: 40 }), /target|visible|choose/i),
    "missing target must warn in preview");
  await assert.rejects(
    medicUses.command(actor, "witchcurse", { confirmed: true, rangeFt: 40 }, "atk-d4a-curse"),
    /target|visible|choose/i, "targetless placement must refuse");
  assert.equal(lsOf(actor), 50, "refused placement spends nothing");
  assert.ok(!usesOf(actor).some(entry => entry.id === "atk-d4a-curse" && entry.status !== "undone"),
    "refused placement records no active use");
});

test("ATK-D4b: out-of-range placement warns yet still records and spends", async () => {
  // Kills both directions: blocking on range (warnings never block legitimate
  // owner play) and silently placing without the range warning.
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 50 });
  const preview = medicUses.preview(actor, "witchcurse", { targetUuid: "Actor.foe", rangeFt: 90 });
  assert.ok(hasWarn(preview, /range|foot|feet|60/i), `90 ft must warn (got ${warnText(preview)})`);
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: "Actor.foe", rangeFt: 90 }, "atk-d4b-curse");
  assert.equal(lsOf(actor), 40, "warned placement still spends exactly 10 Life Support");
  assert.ok(usesOf(actor).some(entry => entry.id === "atk-d4b-curse"), "warned placement is still recorded");
});

test("ATK-D4c: replacement points the index at the newest curse; undo restores the prior one", async () => {
  // Kills: index left on the replaced curse, or undo that refunds LS but drops
  // the original target (D4: undo restores prior curse AND LS).
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80 });
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: "Actor.foeA" }, "atk-d4c-1");
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: "Actor.foeB" }, "atk-d4c-2");
  assert.equal(actor.flags.ak5e?.witchcraft?.curse?.targetUuid, "Actor.foeB",
    "the plan-authored index must point at the replacing curse");
  await medicUses.undo(actor, "atk-d4c-2");
  assert.equal(actor.flags.ak5e?.witchcraft?.curse?.targetUuid, "Actor.foeA",
    "undo must restore the prior curse index, not clear it");
  assert.equal(lsOf(actor), 70, "undo refunds exactly the replacement's 10 Life Support");
});

test("ATK-D4d: FINDING F-C — placement preview warns when the pool cannot cover the 10-LS cost", async () => {
  // Common: all overspends clamp at 0 and show shortfall. The LS-heal path
  // previews `200 Life Support needed and 60 remain` and the receipt appends
  // `Life Support short by N`; the placement block previews nothing when
  // LS < 10 and its summary omits the shortfall. Kills: silent overspend.
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 5 });
  const preview = medicUses.preview(actor, "witchcurse", { targetUuid: "Actor.foe", rangeFt: 40 });
  assert.ok(hasWarn(preview, /life support|short|remain|clamp|insufficient|10/i),
    `placement that cannot cover its cost must preview a shortfall (got ${warnText(preview)})`);
});

test("ATK-D4e: below level 7 the placement preview warns the level gate", async () => {
  // Kills: 7th-level feature usable early without any warning.
  requireRegistration();
  const actor = witch({ level: 4, lifeSupport: 80 });
  assert.ok(hasWarn(medicUses.preview(actor, "witchcurse", { targetUuid: "Actor.foe", rangeFt: 40 }), /level|7|seventh/i),
    "level 4 placement must warn the 7th-level gate");
});

// ---------------------------------------------------------------- D5 attacks
// SPEC D5 + ruling 7: trigger accepts Arts damage from any source; first
// occurrence per combat:round:turn; combined parts of one application count
// once; outside combat each hit is offered with a warning; identifiers persist.

test("ATK-D5a: re-commanding a consumed trigger rejects — one event rolls once", async () => {
  // Kills: double 2d6 on the same occurrence (the attack the per-event dedup
  // exists to stop). Frozen pins the preview warning; this pins the write path.
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80 });
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: "Actor.foe" }, "atk-d5a-place");
  await medicUses.command(actor, "witchcurse", { confirmed: true, triggerEventId: "hitTaken:atk-d5a", damageTotal: 9, sourceKind: "art-cast" }, "atk-d5a-t1");
  await assert.rejects(
    medicUses.command(actor, "witchcurse", { confirmed: true, triggerEventId: "hitTaken:atk-d5a", damageTotal: 9, sourceKind: "art-cast" }, "atk-d5a-t2"),
    /duplicate|already|first|occurrence|round|turn/i, "consumed trigger must refuse a second write");
  const triggers = usesOf(actor).filter(entry => entry.data?.triggerEventId === "hitTaken:atk-d5a" && entry.status !== "undone");
  assert.equal(triggers.length, 1, "exactly one trigger write per occurrence");
});

test("ATK-D5b: distinct occurrences are each offered — dedup is per-event", async () => {
  // Kills: global dedup that suppresses a second legitimate occurrence (or, in
  // reverse, per-preview state that warns on a fresh event).
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80 });
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: "Actor.foe" }, "atk-d5b-place");
  for (const eventId of ["hitTaken:atk-d5b-1", "hitTaken:atk-d5b-2"]) {
    const preview = medicUses.preview(actor, "witchcurse",
      { triggerEventId: eventId, targetUuid: actor.uuid, rangeFt: 30, damageTotal: 9, sourceKind: "art-cast" });
    assert.ok(!hasWarn(preview, /duplicate|already|first occurrence/i),
      `fresh occurrence ${eventId} must not warn as a duplicate (got ${warnText(preview)})`);
  }
});

test("ATK-D5c: outside combat the trigger preview carries the warning", async () => {
  // Ruling 7: outside combat each hit is offered WITH a warning (no turn key).
  // Kills: silent offers with no turn context.
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80 });
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: "Actor.foe" }, "atk-d5c-place");
  const preview = medicUses.preview(actor, "witchcurse",
    { triggerEventId: "hitTaken:atk-d5c", targetUuid: actor.uuid, rangeFt: 30, damageTotal: 9, sourceKind: "art-cast" });
  assert.ok(hasWarn(preview, /outside|combat|turn/i),
    `out-of-combat offer must warn (got ${warnText(preview)})`);
});

// ---------------------------------------------------------------- D6 attacks
// SPEC D6 + ruling 7: Medic explicitly clicks 2d6 on a visible healing target
// within 60 ft; Psychic equals HP ACTUALLY restored (incl. zero); unowned
// changes use validated GM relay with idempotent retry and linked undo.

test("ATK-D6a: unconfirmed trigger writes nothing", async () => {
  // Kills: trigger path that skips the once-confirmed contract.
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80 });
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: "Actor.foe" }, "atk-d6a-place");
  const lsBefore = lsOf(actor);
  const usesBefore = usesOf(actor).length;
  await assert.rejects(
    medicUses.command(actor, "witchcurse", { confirmed: false, triggerEventId: "hitTaken:atk-d6a", targetUuid: actor.uuid, rangeFt: 30, damageTotal: 9 }, "atk-d6a-t"),
    /confirm/i, "unconfirmed trigger must refuse before any write");
  assert.equal(lsOf(actor), lsBefore, "refused trigger moves no Life Support");
  assert.equal(usesOf(actor).length, usesBefore, "refused trigger records nothing");
});

test("ATK-D6b: trigger previews roll nothing and record nothing", async () => {
  // "No automatic dice": offering the trigger must not resolve the 2d6.
  // Kills: preview with side effects (phantom rolls, phantom uses).
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80 });
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: "Actor.foe" }, "atk-d6b-place");
  const lsAfterPlace = lsOf(actor);
  const usesAfterPlace = usesOf(actor).length;
  medicUses.preview(actor, "witchcurse", { triggerEventId: "hitTaken:atk-d6b", targetUuid: actor.uuid, rangeFt: 30, damageTotal: 9, sourceKind: "art-cast" });
  medicUses.preview(actor, "witchcurse", { triggerEventId: "hitTaken:atk-d6b", targetUuid: actor.uuid, rangeFt: 30, damageTotal: 9, sourceKind: "art-cast" });
  assert.equal(usesOf(actor).length, usesAfterPlace, "trigger previews record no use");
  assert.equal(lsOf(actor), lsAfterPlace, "trigger previews move no Life Support");
});

test("ATK-D6c: healing a full-HP ally records zero actual and zero Psychic", async () => {
  // Ruling 7: Psychic equals HP actually restored — never infer it from the
  // nominal 2d6. Kills: implementations that psychic the rolled amount even
  // when caps absorb the whole heal.
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80 });
  const ally = witch({ level: 1, lifeSupport: 10 });
  ally.system.attributes.hp.value = 20;
  ally.system.attributes.hp.max = 20;
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: "Actor.foe" }, "atk-d6c-place");
  await medicUses.command(actor, "witchcurse", { confirmed: true, triggerEventId: "hitTaken:atk-d6c", targetUuid: ally.uuid, rangeFt: 40, damageTotal: 9 }, "atk-d6c-t");
  const receipt = medicUses.receipt(actor, "atk-d6c-t");
  assert.equal(receipt?.result?.actualRestored, 0, "capped heal restores zero actual HP");
  assert.equal(receipt?.result?.psychicDamage, 0, "zero actual HP restored means zero Psychic damage");
  assert.equal(ally.system.attributes.hp.value, 20, "ally HP is unchanged");
});

test("ATK-D6d: confirmed trigger resolves through the card-confirmed writer", async () => {
  // Integration contract: confirmArtOutcome is the supported card-confirmed
  // writer. Kills: direct-mutation trigger paths that bypass roll resolution
  // (no formula, no resolved roll on the receipt).
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80 });
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: "Actor.foe" }, "atk-d6d-place");
  await medicUses.command(actor, "witchcurse", { confirmed: true, triggerEventId: "hitTaken:atk-d6d", targetUuid: actor.uuid, rangeFt: 30, damageTotal: 9, sourceKind: "art-cast" }, "atk-d6d-t");
  const receipt = medicUses.receipt(actor, "atk-d6d-t");
  assert.match(`${receipt?.formula ?? ""}`, /2d6/, "explicit 2d6 must appear on the resolved receipt");
  assert.equal(receipt?.resolvesRoll, true, "trigger receipt must mark its roll resolved");
});

test("ATK-D6e: pending relay retry never applies the stranger's heal", async () => {
  // GM-gating intact: without a GM the unowned change stays Not-applied, and
  // retrying neither applies it nor duplicates the use. Kills: retry paths that
  // apply locally, or duplicate the pending use on each retry.
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80 });
  const stranger = plainStranger();
  const hpBefore = stranger.system.attributes.hp.value;
  await assert.rejects(
    medicUses.command(actor, "witchcraftLifeSupport", { confirmed: true, amount: 8, rangeFt: 30, targetUuid: stranger.uuid }, "atk-d6e-relay"),
    /not applied|no GM|relay/i, "unowned change without a GM must stay pending");
  await assert.rejects(
    medicUses.command(actor, "witchcraftLifeSupport", { confirmed: true, amount: 8, rangeFt: 30, targetUuid: stranger.uuid }, "atk-d6e-relay"),
    /already|duplicate|pending|not applied|no GM|relay/i, "retry must stay idempotent");
  assert.equal(usesOf(actor).filter(entry => entry.id === "atk-d6e-relay").length, 1, "exactly one pending use");
  assert.equal(stranger.system.attributes.hp.value, hpBefore, "stranger HP is untouched while relay is pending");
  await medicUses.undo(actor, "atk-d6e-relay");
  assert.ok(!usesOf(actor).some(entry => entry.id === "atk-d6e-relay" && entry.status !== "undone"),
    "linked undo retires the pending relay");
  assert.equal(stranger.system.attributes.hp.value, hpBefore, "undo of a pending relay still touches nothing");
});

// ---------------------------------------------------------------- D7 attacks
// SPEC D7 + ruling 8: Efficient grants 2× actual positive AP spent on a
// levelled Art in that cast's own pending update; zero-AP/cantrip gives 0;
// combine, never overwrite; LS Action/Bonus permission lasts that turn only.

test("ATK-D7a: levelled cast that spent zero AP grants zero", async () => {
  // Kills: `levelled` checked without `apSpent > 0` (2 × 0 must be 0, with the
  // no-gain notice, not a phantom grant or a permission-only half-write).
  requireRegistration();
  const actor = witch({ level: 11, lifeSupport: 40 });
  await medicUses.command(actor, "witchcraftLifeSupport", { confirmed: true, amount: 0, apSpent: 0, levelled: true }, "atk-d7a");
  assert.equal(lsOf(actor), 40, "zero-AP levelled cast grants zero Life Support");
  assert.equal(medicUses.receipt(actor, "atk-d7a")?.result?.efficientGain ?? 0, 0, "receipt records zero Efficient gain");
});

test("ATK-D7b: negative AP spent never drains Life Support", async () => {
  // Kills: unsigned arithmetic turning a hostile/odd negative into a drain
  // (2 × −3 must clamp to a zero gain, and apSpent normalizes to 0).
  requireRegistration();
  const actor = witch({ level: 11, lifeSupport: 40 });
  await medicUses.command(actor, "witchcraftLifeSupport", { confirmed: true, amount: 0, apSpent: -3, levelled: true }, "atk-d7b");
  assert.equal(lsOf(actor), 40, "negative AP input must not move Life Support");
  assert.equal(medicUses.receipt(actor, "atk-d7b")?.result?.efficientGain ?? 0, 0, "receipt records zero Efficient gain");
});

test("ATK-D7c: cantrip that spent AP still grants zero — only levelled Arts count", async () => {
  // Ruling 8: "Only levelled Arts count, so cantrips … give nothing." Kills:
  // gain keyed on apSpent alone without the levelled gate.
  requireRegistration();
  const actor = witch({ level: 11, lifeSupport: 40 });
  await medicUses.command(actor, "witchcraftLifeSupport", { confirmed: true, amount: 0, apSpent: 3, levelled: false }, "atk-d7c");
  assert.equal(lsOf(actor), 40, "cantrip grants zero Life Support however much AP is claimed");
  assert.equal(medicUses.receipt(actor, "atk-d7c")?.result?.efficientGain ?? 0, 0, "receipt records zero Efficient gain");
});

test("ATK-D7d: the LS Action/Bonus permission dies on turn change", async () => {
  // Ruling 8: permission applies "for that turn only". Kills: permission flags
  // that leak into later turns when combatTurnChange is missed or mis-keyed.
  requireRegistration();
  const actor = witch({ level: 11, lifeSupport: 40 });
  const combat = createTestCombat([actor], { started: true });
  combat.start();
  game.combat = combat;
  await medicUses.command(actor, "witchcraftLifeSupport", { confirmed: true, amount: 0, apSpent: 3, levelled: true }, "atk-d7d");
  assert.ok(actor.flags.ak5e?.witchcraft?.efficient?.turnKey, "permission flag is set with its turn key (precondition)");
  combat.nextTurn();
  await Hooks.callAll("combatTurnChange", combat, null, null);
  await new Promise(resolve => setTimeout(resolve, 20));
  const flagAfter = actor.flags.ak5e?.witchcraft?.efficient ?? null;
  game.combat = null;
  assert.equal(flagAfter, null, "turn change must clear the turn-scoped Efficient permission");
});

// ---------------------------------------------------------------- D8 attacks
// SPEC D8 + ruling 9: Boon needs ≥5 ACTUAL HP restored specifically by LS
// healing (temp HP never counts); owner-rolled 1d10 Force on every Attack of
// the recipient until end of their next turn; never a module-started roll.

test("ATK-D8a: nominal above threshold but actual below grants no rider", async () => {
  // The nominal-vs-actual discriminator: 8 requested but only 3 actually
  // restored. Kills: threshold checked against the nominal amount.
  requireRegistration();
  const actor = witch({ level: 11, lifeSupport: 80 });
  const ally = witch({ level: 1, lifeSupport: 10 });
  ally.system.attributes.hp.value = 17;
  ally.system.attributes.hp.max = 20;
  await medicUses.command(actor, "witchcraftLifeSupport", { confirmed: true, amount: 8, rangeFt: 30, targetUuid: ally.uuid, boon: true }, "atk-d8a");
  const receipt = medicUses.receipt(actor, "atk-d8a");
  assert.equal(receipt?.result?.actualRestored, 3, "only 3 actual HP restored (precondition)");
  assert.equal(receipt?.result?.boon?.eligible, false, "below-threshold actual healing is Boon-ineligible");
  assert.doesNotMatch(`${receipt?.formula ?? ""} ${JSON.stringify(receipt?.result ?? {})} ${receipt?.summary ?? ""}`, /1d10/,
    "sub-threshold Boon healing must not record a 1d10 rider");
});

test("ATK-D8b: exactly 5 actual HP meets the threshold (inclusive)", async () => {
  // Kills: strict `>` comparison that misses the boundary ("at least 5").
  requireRegistration();
  const actor = witch({ level: 11, lifeSupport: 80 });
  const ally = witch({ level: 1, lifeSupport: 10 });
  ally.system.attributes.hp.value = 15;
  ally.system.attributes.hp.max = 20;
  await medicUses.command(actor, "witchcraftLifeSupport", { confirmed: true, amount: 8, rangeFt: 30, targetUuid: ally.uuid, boon: true }, "atk-d8b");
  const receipt = medicUses.receipt(actor, "atk-d8b");
  assert.equal(receipt?.result?.actualRestored, 5, "exactly 5 actual HP restored (precondition)");
  assert.equal(receipt?.result?.boon?.eligible, true, "5 actual HP meets the threshold");
  assert.match(`${receipt?.formula ?? ""} ${JSON.stringify(receipt?.result ?? {})} ${receipt?.summary ?? ""}`, /1d10/,
    "threshold Boon healing must record its owner-rolled 1d10");
});

test("ATK-D8c: the Boon starts no damage roll — a real third party is untouched", async () => {
  // "It is not a module-started damage roll": the 1d10 rides the recipient's
  // own later Attacks. Kills: implementations that eagerly damage/roll.
  requireRegistration();
  const actor = witch({ level: 11, lifeSupport: 80 });
  const ally = witch({ level: 1, lifeSupport: 10 });
  ally.system.attributes.hp.value = 5;
  ally.system.attributes.hp.max = 20;
  const foe = createTestActor({ name: "Boon Bystander", type: "character", level: 3, prof: 2, owner: false, flags: { ak5e: {} } });
  game.actors.set(foe.id, foe);
  foe.system.attributes.hp.value = 30;
  await medicUses.command(actor, "witchcraftLifeSupport", { confirmed: true, amount: 8, rangeFt: 30, targetUuid: ally.uuid, boon: true }, "atk-d8c");
  assert.equal(ally.system.attributes.hp.value, 13, "ally is healed (precondition)");
  assert.equal(foe.system.attributes.hp.value, 30, "no third party takes damage from the Boon grant");
});

// ---------------------------------------------------------------- D9 attacks
// SPEC D9 + ruling 10: Life through Death at 15 — source-authorized maximum
// damage choice (modifiers incl., pre-mitigation), visible targets in 60 ft
// with allocation, optional unspent remainder, once/LR, mutually exclusive
// with Harm on the same roll.

test("ATK-D9a: FINDING F-A — Harm after Death on the same roll warns as exclusive", async () => {
  // SPEC D9 mutuality runs BOTH ways: the same rolled total cannot fund both
  // features. The Death plan warns when sameRollAs names a Harm use, but the
  // Harm plan ignores sameRollAs naming a Death use, so Death-then-Harm
  // double-dips silently. Kills: one-directional exclusion checks.
  requireRegistration();
  const actor = witch({ level: 15, lifeSupport: 80 });
  await medicUses.command(actor, "lifeThroughDeath", { confirmed: true, damageTotal: 20,
    targetUuids: ["Actor.foeA"], allocations: { "Actor.foeA": 20 } }, "atk-d9a-death");
  const preview = medicUses.preview(actor, "healingThroughHarm", { damageTotal: 20, sameRollAs: "atk-d9a-death" });
  assert.ok(hasWarn(preview, /exclusive|mutually|death/i),
    `Harm on a Death-claimed roll must warn as mutually exclusive (got ${warnText(preview)})`);
});

test("ATK-D9b: second Death warns once-per-rest; a Long Rest clears it", async () => {
  // Kills: once/LR state that never resets (or a reset on the wrong rest).
  requireRegistration();
  const actor = witch({ level: 15, lifeSupport: 80 });
  await medicUses.command(actor, "lifeThroughDeath", { confirmed: true, damageTotal: 20,
    targetUuids: ["Actor.foeA"], allocations: { "Actor.foeA": 20 } }, "atk-d9b-death");
  assert.ok(hasWarn(medicUses.preview(actor, "lifeThroughDeath", { damageTotal: 20, targetUuids: ["Actor.foeA"] }), /rest|once|long|already/i),
    "second Death preview before a Long Rest must warn");
  await triggerLongRest(actor);
  assert.ok(!hasWarn(medicUses.preview(actor, "lifeThroughDeath", { damageTotal: 20, targetUuids: ["Actor.foeA"] }), /rest|once|long|already/i),
    "after a Long Rest the once-per-rest warning must clear");
});

test("ATK-D9c: over-allocation warns with the totals", async () => {
  // Kills: allocations above the authorized maximum accepted silently (the
  // receipt would then divide more HP than the roll authorized).
  requireRegistration();
  const actor = witch({ level: 15, lifeSupport: 80 });
  const preview = medicUses.preview(actor, "lifeThroughDeath", { damageTotal: 20,
    targetUuids: ["Actor.foeA", "Actor.foeB"], allocations: { "Actor.foeA": 15, "Actor.foeB": 10 } });
  assert.ok(hasWarn(preview, /25|20|above|maximum|allocation/i),
    `25 allocated of 20 authorized must warn (got ${warnText(preview)})`);
});

test("ATK-D9d: duplicate Death command under one id records a single use", async () => {
  // Kills: cancellation/duplicate native hooks that spend or heal twice
  // (checkpoint: "cancellation/duplicate native hooks don't spend or heal").
  requireRegistration();
  const actor = witch({ level: 15, lifeSupport: 80 });
  const before = usesOf(actor).length;
  const data = { confirmed: true, damageTotal: 20, targetUuids: ["Actor.foeA"], allocations: { "Actor.foeA": 20 } };
  await medicUses.command(actor, "lifeThroughDeath", data, "atk-d9d-death");
  await medicUses.command(actor, "lifeThroughDeath", data, "atk-d9d-death");
  assert.equal(usesOf(actor).length, before + 1, "re-commanding the same Death id must stay idempotent");
});

test("ATK-D9e: below level 15 the Death preview warns the level gate", async () => {
  // Kills: capstone usable early without warning (wrong-branch/level input).
  requireRegistration();
  const actor = witch({ level: 11, lifeSupport: 80 });
  assert.ok(hasWarn(medicUses.preview(actor, "lifeThroughDeath", { damageTotal: 20, targetUuids: ["Actor.foeA"] }), /level|15/i),
    "level 11 Death preview must warn the 15th-level gate");
});

// ------------------------------------------------------- Common / cross-cut
// Unconfirmed writes nothing; overspends clamp at 0 with shortfall; no auto
// dice; unowned mutations use validated GM relay; persistence across reload;
// concurrent operations; confirm lifecycle; GM-gating intact.

test("ATK-Ca: concurrent distinct operations each record exactly once", async () => {
  // Kills: shared mutable plan state that drops or merges concurrent uses.
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80 });
  const before = usesOf(actor).length;
  const [first, second] = await Promise.all([
    medicUses.command(actor, "halfwayHouse", { confirmed: true, pool: HEALING_POOL }, "atk-ca-hw"),
    medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: "Actor.foe", rangeFt: 40 }, "atk-ca-curse")
  ]);
  void first;
  void second;
  assert.equal(usesOf(actor).length, before + 2, "both concurrent operations must be recorded");
  assert.equal(lsOf(actor), 70, "only the curse spends (10 LS); Halfway House spends none");
});

test("ATK-Cb: unconfirmed commands write nothing across the branch", async () => {
  // The once-confirmed contract, branch-wide. Kills: any command path that
  // treats `confirmed: false` as a preview-with-side-effects.
  requireRegistration();
  const actor = witch({ level: 15, lifeSupport: 80 });
  for (const [command, data, id] of [
    ["witchcurse", { targetUuid: "Actor.foe" }, "atk-cb-1"],
    ["lifeThroughDeath", { damageTotal: 20, targetUuids: ["Actor.foeA"] }, "atk-cb-2"],
    ["healingThroughHarm", { damageTotal: 11 }, "atk-cb-3"]
  ]) {
    await assert.rejects(medicUses.command(actor, command, { ...data, confirmed: false }, id),
      /confirm/i, `unconfirmed ${command} must refuse`);
  }
  assert.equal(lsOf(actor), 80, "refused uses change nothing");
  assert.equal(usesOf(actor).length, 0, "refused uses record nothing");
});

test("ATK-Cc: Harm exhaustion survives a reload — the derived index rebuilds", async () => {
  // Persistent idempotency: after rebuilding the actor from persisted flags,
  // the reloaded actor must still refuse/flag a second Harm (checkpoint:
  // "same-data restart with curse/receipts preserved" generalizes to
  // exhaustion state). Kills: engine-only memory that a reload wipes.
  requireRegistration();
  const actor = witch({ level: 5 });
  await medicUses.command(actor, "healingThroughHarm", { confirmed: true, damageTotal: 11 }, "atk-cc-harm");
  const reloaded = createTestActor({ name: actor.name, type: "character", level: 5, prof: 3,
    flags: { ak5e: structuredClone(actor.flags.ak5e) } });
  reloaded.items.set("medic-class", createTestItem({ id: "medic-class", type: "class", name: "Medic", system: { levels: 5 },
    flags: { ak5e: { chapterThreeId: "class-medic" } } }, reloaded));
  reloaded.items.set("witchcraft-branch", createTestItem({ id: "witchcraft-branch", type: "subclass", name: "Witchcraft",
    flags: { ak5e: { chapterThreeId: "subclass-medic-witchcraft" } } }, reloaded));
  assert.ok(hasWarn(medicUses.preview(reloaded, "healingThroughHarm", { damageTotal: 11 }), /rest|once|short|already/i),
    "reloaded actor must rebuild its Harm exhaustion index and warn");
});

test("ATK-Cd: sheet render is deterministic and side-effect free", async () => {
  // Opening branch controls writes nothing (sheet owns dialogs/confirm routing,
  // never state). Kills: render paths that accumulate uses, flags, or nondeterminism.
  assert.equal(typeof sheetImport.renderWitchcraftSection, "function", "sheet module must render (precondition)");
  const actor = witch({ level: 7 });
  const usesBefore = usesOf(actor).length;
  const flagsBefore = JSON.stringify(actor.flags);
  const first = sheetImport.renderWitchcraftSection(actor);
  const second = sheetImport.renderWitchcraftSection(actor);
  assert.equal(first, second, "render must be deterministic");
  assert.equal(usesOf(actor).length, usesBefore, "render records no uses");
  assert.equal(JSON.stringify(actor.flags), flagsBefore, "render writes no flags");
});

test("ATK-Ce: feature needs reject on non-Medic actors", async () => {
  // GM-gating/integrity boundary: branch commands require the Medic feature
  // gate. Kills: plans that run for actors who never had the feature.
  requireRegistration();
  const civilian = createTestActor({ name: "No Medic Here", type: "character", level: 7, prof: 3, owner: true,
    flags: { ak5e: {} } });
  game.actors.set(civilian.id, civilian);
  await assert.rejects(
    medicUses.command(civilian, "witchcurse", { confirmed: true, targetUuid: "Actor.foe" }, "atk-ce-curse"),
    /medic|witchcraft|feature|enabled/i, "non-Medic actor must be refused");
});
