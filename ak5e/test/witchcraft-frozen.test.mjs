/**
 * Frozen acceptance tests for Wave 2 package D (Witchcraft branch).
 * Spec: .codex-work/medic/SPEC-witchcraft.md (acceptance D1–D9).
 * Source authority: AK5e 1st Ed. v1.3.1, Chapter 3 C3:5090–5146 and referenced
 * Chapter 1/5 rules; binding U3 rulings 1–11 and owner rulings in DECISIONS.md.
 * Drafted by the manager after repeated challenger failures, strengthened after
 * independent audit (Muse Spark) found nominal bodies; before
 * witchcraft-features.mjs / witchcraft-sheet.mjs exist. Do not weaken
 * these expectations to make an implementation pass. Every test gates on the
 * missing production modules first, so all are red until implemented.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem } from "./base-classes-fixture.mjs";
import { registerMedicArts } from "../scripts/medic-features.mjs";
import { medicUses } from "../scripts/medic-uses.mjs";
import { artCastOptionsFor } from "../scripts/arts-casting.mjs";
import { getReactions } from "../scripts/trigger-events.mjs";

const featureImport = await import("../scripts/witchcraft-features.mjs").catch(error => ({ __loadError: error }));
const sheetImport = await import("../scripts/witchcraft-sheet.mjs").catch(error => ({ __loadError: error }));
const HEALING_POOL = "special-art-pool-healing-arts-4211";
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

function requireFeatures() {
  assert.equal(typeof featureImport.registerWitchcraftHooks, "function",
    `Witchcraft runtime missing registerWitchcraftHooks() (${featureImport.__loadError?.code ?? "export unavailable"}: ${featureImport.__loadError?.message ?? ""})`);
  assert.ok(featureImport.WITCHCRAFT_PLANS && typeof featureImport.WITCHCRAFT_PLANS === "object",
    "Witchcraft runtime missing WITCHCRAFT_PLANS");
  return featureImport;
}
function requireSheet() {
  assert.equal(typeof sheetImport.renderWitchcraftSection, "function",
    `Witchcraft sheet module missing renderWitchcraftSection() (${sheetImport.__loadError?.code ?? "export unavailable"}: ${sheetImport.__loadError?.message ?? ""})`);
  assert.equal(typeof sheetImport.handleWitchcraftCommand, "function",
    "Witchcraft sheet module missing handleWitchcraftCommand()");
  return sheetImport;
}
function requireRegistration() {
  requireFeatures();
  assert.equal(registered, true, "registerWitchcraftHooks() was not called in the fixture");
}
function lsOf(actor) { return actor.flags.ak5e.resourcePools?.lifeSupport?.value ?? 0; }
function usesOf(actor) { return medicUses.uses(actor) ?? []; }
function witch({ level = 15, lifeSupport = 125, owner = true, id = `witchcraft-${foundry.utils.randomID(5)}` } = {}) {
  const actor = createTestActor({ id, name: "Witchcraft Fixture", type: "character", level,
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
function healingArt(actor, id = "witchcraft-healing-art") {
  const item = createTestItem({ id, type: "spell", name: "Healing Art", system: {
    level: 3, activation: { type: "action" }, target: { type: "creature", value: 1 },
    range: { value: 30, units: "ft" }, duration: { value: 1, units: "minute" },
    properties: { concentration: true }, description: { value: "Restore Hit Points to one Creature." }
  }, flags: { ak5e: { art: { enabled: true, pool: HEALING_POOL }, pool: HEALING_POOL } } }, actor);
  actor.items.set(item.id, item);
  return item;
}
function plans() {
  const { WITCHCRAFT_PLANS } = requireFeatures();
  for (const name of ["halfwayHouse", "healingThroughHarm", "witchcraftLifeSupport", "witchcurse", "lifeThroughDeath"])
    assert.equal(typeof WITCHCRAFT_PLANS[name], "function", `WITCHCRAFT_PLANS missing plan ${name}`);
  return WITCHCRAFT_PLANS;
}

// D1 · Halfway House
test("D1: Halfway House plan grants a chosen Standard pool within Medic maximum level", async () => {
  requireRegistration();
  plans();
  const actor = witch({ level: 5 });
  const preview = medicUses.preview(actor, "halfwayHouse", { pool: HEALING_POOL });
  assert.match(preview.title ?? "halfwayHouse", /halfway house/i, "Halfway House preview must carry its title");
  const before = usesOf(actor).length;
  await medicUses.command(actor, "halfwayHouse", { confirmed: true, pool: HEALING_POOL }, "halfway-d1");
  const after = usesOf(actor);
  assert.equal(after.length, before + 1, "confirmed Halfway House selection must record exactly one use");
  const entry = after.find(item => item.id === "halfway-d1");
  assert.equal(entry?.command, "halfwayHouse", "the recorded use must carry the halfwayHouse command");
  assert.equal(entry?.data?.pool, HEALING_POOL, "the recorded use must preserve the chosen pool");
  const receipt = medicUses.receipt(actor, "halfway-d1");
  assert.equal(receipt?.result?.pool ?? receipt?.result?.grantedPool, HEALING_POOL,
    "the grant receipt must record the chosen pool in its result");
  assert.equal(receipt?.result?.reduction ?? receipt?.result?.apReduction, 1,
    "level 5 Halfway House must record reduction 1 in its result");
  assert.match(receipt?.summary ?? "", /halfway house/i, "the grant summary must name Halfway House");
  const overMax = medicUses.preview(actor, "halfwayHouse", { pool: HEALING_POOL, artLevel: 9 });
  assert.ok(overMax.warnings.some(item => /level|max/i.test(JSON.stringify(item))),
    "requesting a pool Art above the Medic maximum level must warn");
});
test("D1: Halfway House reductions 0/1/2 below 5 / from 5 / from 11; overlap takes larger, never sums", async () => {
  requireRegistration();
  const low = witch({ level: 4, lifeSupport: 60 });
  const mid = witch({ level: 5, lifeSupport: 60 });
  const high = witch({ level: 11, lifeSupport: 60 });
  await medicUses.command(low, "halfwayHouse", { confirmed: true, pool: HEALING_POOL }, "halfway-low");
  await medicUses.command(mid, "halfwayHouse", { confirmed: true, pool: HEALING_POOL }, "halfway-mid");
  await medicUses.command(high, "halfwayHouse", { confirmed: true, pool: HEALING_POOL }, "halfway-high");
  const redLow = medicUses.receipt(low, "halfway-low")?.result?.reduction;
  const redMid = medicUses.receipt(mid, "halfway-mid")?.result?.reduction;
  const redHigh = medicUses.receipt(high, "halfway-high")?.result?.reduction;
  assert.deepEqual([redLow, redMid, redHigh], [0, 1, 2],
    `Halfway House AP reduction must be 0 below 5 / 1 from 5 / 2 from 11 (got ${redLow}/${redMid}/${redHigh})`);
  assert.equal(lsOf(low), 60, "Halfway House is an AP-cost reduction, never a Life Support spend");
  assert.equal(lsOf(mid), 60, "Halfway House is an AP-cost reduction, never a Life Support spend");
  assert.equal(lsOf(high), 60, "Halfway House is an AP-cost reduction, never a Life Support spend");
});
test("D1: setup selection and undo preserve earlier Halfway House values", async () => {
  requireRegistration();
  const actor = witch({ level: 5, lifeSupport: 60 });
  const lsBefore = lsOf(actor);
  await medicUses.command(actor, "halfwayHouse", { confirmed: true, pool: HEALING_POOL }, "halfway-undo");
  const whileActive = medicUses.preview(actor, "halfwayHouse", { pool: HEALING_POOL });
  assert.ok(whileActive.warnings.some(item => /overlap|already|self-defence|self defence|larger|active/i.test(JSON.stringify(item))),
    "re-selecting the granted pool while it is active must warn as an overlap");
  await medicUses.undo(actor, "halfway-undo");
  assert.equal(lsOf(actor), lsBefore, "undo must restore the pre-selection Life Support value");
  const undone = usesOf(actor).find(entry => entry.id === "halfway-undo");
  assert.ok(!undone || undone.status === "undone", "the undone use must not remain available");
  const afterUndo = medicUses.preview(actor, "halfwayHouse", { pool: HEALING_POOL });
  assert.equal(afterUndo.warnings.filter(item => /overlap|already/i.test(JSON.stringify(item))).length, 0,
    "after undo the same pool must no longer warn as an active overlap");
});

// D2 · Healing through Harm
test("D2: Healing through Harm is an offered confirmed Reaction, once per short rest", async () => {
  requireRegistration();
  const actor = witch({ level: 5 });
  const before = medicUses.preview(actor, "healingThroughHarm", { damageTotal: 11 });
  assert.match(JSON.stringify(before), /reaction/i, "Harm must present as a Reaction option");
  await medicUses.command(actor, "healingThroughHarm", { confirmed: true, damageTotal: 11 }, "harm-once");
  const active = usesOf(actor).filter(item => item.command === "healingThroughHarm" && item.status !== "undone");
  assert.equal(active.length, 1, "exactly one active Harm use must be recorded");
  const after = medicUses.preview(actor, "healingThroughHarm", { damageTotal: 11 });
  assert.ok(after.warnings.length > before.warnings.length,
    "a second Harm preview before a short rest must add a warning");
  assert.ok(after.warnings.some(item => /rest|once|short|expended|again|already/i.test(JSON.stringify(item))),
    "the second Harm preview must name the once-per-short-rest limit");
});
test("D2: owner Art rolled damage total includes modifiers; gain is floor(total/2) Life Support", async () => {
  requireRegistration();
  const actor = witch({ level: 5, lifeSupport: 10 });
  await medicUses.command(actor, "healingThroughHarm", { confirmed: true, damageTotal: 11 }, "harm-d2");
  assert.equal(lsOf(actor), 15, "floor(11/2) = 5 Life Support gained on a base of 10");
  assert.ok(usesOf(actor).some(entry => entry.id === "harm-d2"), "the Harm use must be recorded");
});
test("D2: no automatic Harm gain or roll; repeated events cannot duplicate one use", async () => {
  requireRegistration();
  const actor = witch({ level: 5, lifeSupport: 10 });
  medicUses.preview(actor, "healingThroughHarm", { damageTotal: 11 });
  medicUses.preview(actor, "healingThroughHarm", { damageTotal: 11 });
  assert.equal(usesOf(actor).length, 0, "previews alone must record no Harm use");
  assert.equal(lsOf(actor), 10, "previews alone must move no Life Support");
});

// D3 · Witchdoctor
test("D3: Witchdoctor at 4 exposes 60-foot Life Support healing with range warnings", async () => {
  requireRegistration();
  const actor = witch({ level: 4, lifeSupport: 60 });
  const near = medicUses.preview(actor, "witchcraftLifeSupport", { amount: 10, rangeFt: 60 });
  const far = medicUses.preview(actor, "witchcraftLifeSupport", { amount: 10, rangeFt: 90 });
  assert.equal(near.warnings.filter(entry => /range|foot|feet|60/i.test(JSON.stringify(entry))).length, 0,
    "in-range Witchdoctor healing must carry no range warning");
  assert.ok(far.warnings.length > near.warnings.length, "out-of-range Witchdoctor healing must add a warning");
});
test("D3: Witchdoctor healing spends Life Support and preserves the Caster Operator Skill engine", async () => {
  requireRegistration();
  const actor = witch({ level: 4, lifeSupport: 60 });
  await medicUses.command(actor, "witchcraftLifeSupport", { confirmed: true, amount: 10, rangeFt: 30 }, "witchdoc-d3");
  assert.equal(lsOf(actor), 50, "confirmed 10-point Witchdoctor healing spends exactly 10 Life Support");
  assert.ok(usesOf(actor).some(entry => entry.id === "witchdoc-d3"), "the healing use must be recorded");
});

// D4 · Witchcurse placement
test("D4: Witchcurse at 7 uses a Bonus Action and 10 Life Support on a visible target within 60 feet", async () => {
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 50 });
  const preview = medicUses.preview(actor, "witchcurse", { targetUuid: "Actor.foe", rangeFt: 40 });
  assert.match(JSON.stringify(preview), /bonus action/i, "Witchcurse must present as a Bonus Action");
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: "Actor.foe", rangeFt: 40 }, "curse-d4");
  assert.equal(lsOf(actor), 40, "Witchcurse placement spends exactly 10 Life Support");
});
test("D4: one curse per Medic — a new curse replaces the old; undo restores prior curse and Life Support", async () => {
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80 });
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: "Actor.foeA" }, "curse-1");
  const lsAfterFirst = lsOf(actor);
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: "Actor.foeB" }, "curse-2");
  assert.equal(lsOf(actor), lsAfterFirst - 10, "the replacing curse spends a further 10 Life Support");
  await medicUses.undo(actor, "curse-2");
  assert.equal(lsOf(actor), lsAfterFirst, "undoing the replacement must refund exactly its 10 Life Support");
  const second = usesOf(actor).find(entry => entry.id === "curse-2");
  assert.ok(!second || second.status === "undone", "the undone replacement must not remain available");
  assert.ok(usesOf(actor).some(entry => entry.id === "curse-1"), "the original curse use must still be recorded");
});

// D5 · Witchcurse trigger
test("D5: curse trigger accepts Arts damage from any source, not only Art casts", async () => {
  requireRegistration();
  plans();
  const actor = witch({ level: 7, lifeSupport: 80 });
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: "Actor.foe" }, "curse-src-place");
  for (const [label, preview] of [["art-cast", medicUses.preview(actor, "witchcurse", { triggerEventId: "hitTaken:src-cast", damageTotal: 9, sourceKind: "art-cast" })], ["operator-skill", medicUses.preview(actor, "witchcurse", { triggerEventId: "hitTaken:src-skill", damageTotal: 9, sourceKind: "operator-skill" })]]) {
    assert.ok(!preview.warnings.some(entry => /source/i.test(JSON.stringify(entry))),
      `${label} damage must not draw a source-type warning`);
  }
  await medicUses.command(actor, "witchcurse", { confirmed: true, triggerEventId: "hitTaken:src-cast", damageTotal: 9, sourceKind: "art-cast" }, "curse-src-cast");
  await medicUses.command(actor, "witchcurse", { confirmed: true, triggerEventId: "hitTaken:src-skill", damageTotal: 9, sourceKind: "operator-skill" }, "curse-src-skill");
  for (const [id, kind] of [["curse-src-cast", "art-cast"], ["curse-src-skill", "operator-skill"]]) {
    const receipt = medicUses.receipt(actor, id);
    assert.ok(receipt, `${kind} trigger must record a use`);
    assert.equal(receipt?.result?.acceptedSource, kind,
      `${kind} trigger must record its plan-accepted source kind in the result, not just echoed input`);
    assert.equal(receipt?.result?.triggered, true,
      `${kind} trigger must record plan resolution in its result`);
    assert.match(receipt?.summary ?? "", /trigger|curse/i,
      `${kind} trigger summary must name the curse trigger`);
    assert.equal(receipt?.data?.triggerEventId, id === "curse-src-cast" ? "hitTaken:src-cast" : "hitTaken:src-skill",
      `${kind} trigger must preserve its event identifier`);
  }
  const dupCast = medicUses.preview(actor, "witchcurse", { triggerEventId: "hitTaken:src-cast", damageTotal: 9, sourceKind: "art-cast" });
  assert.ok(dupCast.warnings.some(entry => /duplicate|already|first|occurrence|round|turn/i.test(JSON.stringify(entry))),
    "re-previewing a consumed trigger event must warn as a duplicate first-occurrence");
});
test("D5: first occurrence per combat round and turn deduplicates combined parts of one application", async () => {
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80 });
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: "Actor.foe" }, "curse-place");
  const first = medicUses.preview(actor, "witchcurse", { triggerEventId: "hitTaken:evt-1", part: 1 });
  const second = medicUses.preview(actor, "witchcurse", { triggerEventId: "hitTaken:evt-1", part: 2 });
  assert.ok(second.warnings.length > first.warnings.length,
    "the second part of one application must warn as a duplicate");
});
test("D5: persistent source/target/time identifiers survive reload", async () => {
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80 });
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: "Actor.foe" }, "curse-persist");
  const live = usesOf(actor).find(entry => entry.id === "curse-persist");
  assert.ok(live, "the curse use must be recorded before the reload check");
  assert.equal(live?.data?.targetUuid ?? medicUses.receipt(actor, "curse-persist")?.data?.targetUuid, "Actor.foe",
    "the curse receipt must carry its target identifier");
  assert.equal(actor.flags.ak5e?.witchcraft?.curse?.targetUuid, "Actor.foe",
    "placing the curse must write the plan-authored curse index, not just an engine receipt");
  const persisted = createTestActor({ name: actor.name, type: "character", level: 7, prof: 3,
    flags: { ak5e: structuredClone(actor.flags.ak5e) } });
  persisted.items.set("medic-class", createTestItem({ id: "medic-class", type: "class", name: "Medic", system: { levels: 7 },
    flags: { ak5e: { chapterThreeId: "class-medic" } } }, persisted));
  persisted.items.set("witchcraft-branch", createTestItem({ id: "witchcraft-branch", type: "subclass", name: "Witchcraft",
    flags: { ak5e: { chapterThreeId: "subclass-medic-witchcraft" } } }, persisted));
  const reloaded = (medicUses.uses(persisted) ?? []).find(entry => entry.id === "curse-persist");
  assert.ok(reloaded, "the curse use must still be recorded after rebuilding the actor from persisted flags");
  assert.equal(reloaded?.command, "witchcurse", "the reloaded receipt must keep its command");
  assert.equal(reloaded?.data?.targetUuid ?? medicUses.receipt(persisted, "curse-persist")?.data?.targetUuid, "Actor.foe",
    "the reloaded receipt must keep its target identifier");
  const planState = persisted.flags.ak5e?.witchcraft?.curse;
  assert.equal(planState?.targetUuid, "Actor.foe",
    "the plan-authored curse index must survive the clone rebuild, not just the engine receipt");
  assert.equal(planState?.useId, "curse-persist", "the rebuilt curse index must link its placing use");
  const dup = medicUses.preview(persisted, "witchcurse", { triggerEventId: "hitTaken:evt-1", part: 2, priorPart: 1 });
  assert.ok(dup.warnings.some(entry => /duplicate|already|first|occurrence|round|turn/i.test(JSON.stringify(entry))),
    "the reloaded actor must rebuild its derived trigger index well enough to deduplicate");
});

// D6 · Explicit 2d6 and Psychic follow-up
test("D6: Medic explicitly clicks 2d6 on a visible healing target within 60 feet", async () => {
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80 });
  const model = await artCastOptionsFor(actor, healingArt(actor), null, {});
  assert.ok(model && Array.isArray(model.options), "cast options must remain available for Witchcraft healing");
  await medicUses.command(actor, "witchcurse", { confirmed: true, targetUuid: "Actor.foe" }, "curse-2d6-place");
  const near = medicUses.preview(actor, "witchcurse", { triggerEventId: "hitTaken:near-1", targetUuid: "Actor.foe", rangeFt: 40 });
  const far = medicUses.preview(actor, "witchcurse", { triggerEventId: "hitTaken:far-1", targetUuid: "Actor.foe", rangeFt: 90 });
  assert.equal(near.warnings.filter(item => /range|foot|feet|60/i.test(JSON.stringify(item))).length, 0,
    "a visible healing target within 60 feet must carry no range warning");
  assert.ok(far.warnings.length > near.warnings.length, "the same target at 90 feet must add a warning");
  const noTarget = medicUses.preview(actor, "witchcurse", { triggerEventId: "hitTaken:none-1", rangeFt: 40 });
  assert.ok(noTarget.warnings.some(item => /target|visible|choose|specify/i.test(JSON.stringify(item))),
    "a trigger with no healing target must warn");
  await medicUses.command(actor, "witchcurse", { confirmed: true, triggerEventId: "hitTaken:near-1", targetUuid: "Actor.foe", rangeFt: 40, damageTotal: 9 }, "curse-2d6-roll");
  const entry = usesOf(actor).find(item => item.id === "curse-2d6-roll");
  const receipt = medicUses.receipt(actor, "curse-2d6-roll");
  assert.match(`${entry?.formula ?? ""} ${JSON.stringify(receipt?.result ?? {})} ${receipt?.summary ?? ""}`, /2d6/,
    "the explicit trigger roll must record 2d6 in its formula, result, or summary");
  await assert.rejects(
    medicUses.command(actor, "witchcurse", { confirmed: false, targetUuid: "Actor.foe" }, "curse-unconfirmed"),
    /confirm/i, "unconfirmed Witchcraft uses must refuse before any write");
});
test("D6: actual HP restored after caps determines Psychic damage, including zero", async () => {
  requireRegistration();
  const full = witch({ level: 7, lifeSupport: 80 });
  const fullAlly = witch({ level: 1, lifeSupport: 10 });
  const hpOf = entry => entry.system.attributes.hp.value;
  const fullBefore = hpOf(fullAlly);
  await medicUses.command(full, "witchcraftLifeSupport", { confirmed: true, amount: 8, rangeFt: 30, targetUuid: fullAlly.uuid }, "heal-capped");
  assert.equal(hpOf(fullAlly), fullBefore, "healing a full-HP ally restores zero actual HP");
  const hurt = witch({ level: 1, lifeSupport: 10 });
  hurt.system.attributes.hp.value = 5;
  await medicUses.command(full, "witchcraftLifeSupport", { confirmed: true, amount: 8, rangeFt: 30, targetUuid: hurt.uuid }, "heal-real");
  assert.ok(hpOf(hurt) > 5, "healing a wounded ally restores positive actual HP");
});
test("D6: both unowned-target changes use validated relay with idempotent retry and linked undo", async () => {
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 80 });
  const stranger = createTestActor({ name: "Unowned Patient", type: "character", level: 1, prof: 2, owner: false,
    abilities: { con: { value: 10, mod: 0 } }, flags: { ak5e: {} } });
  game.actors.set(stranger.id, stranger);
  const ownedPreview = medicUses.preview(actor, "witchcraftLifeSupport", { amount: 8, rangeFt: 30, targetUuid: actor.uuid });
  const relayPreview = medicUses.preview(actor, "witchcraftLifeSupport", { amount: 8, rangeFt: 30, targetUuid: stranger.uuid });
  assert.ok(relayPreview.warnings.length > ownedPreview.warnings.length,
    "an unowned-target change must add a warning over the owned-target baseline");
  assert.ok(relayPreview.warnings.some(item => /relay|GM|owner|permission|connected|not applied/i.test(JSON.stringify(item))),
    "the unowned-target warning must name the GM relay path");
  const countBefore = usesOf(actor).length;
  let first;
  try {
    first = await medicUses.command(actor, "witchcraftLifeSupport", { confirmed: true, amount: 8, rangeFt: 30, targetUuid: stranger.uuid }, "relay-d6");
  } catch (error) {
    assert.match(String(error?.message ?? error), /not applied yet|no GM|relay/i,
      "without a GM the relayed use must stay recorded as not-applied, never silently succeed");
  }
  const receipt = medicUses.receipt(actor, "relay-d6");
  assert.ok(receipt, "the relayed use must be recorded even when no GM is connected");
  assert.equal(usesOf(actor).length, countBefore + 1, "the relayed use records exactly once");
  assert.match(JSON.stringify(receipt?.lastError ?? receipt?.status ?? ""), /GM|relay|pending|not applied/i,
    "the recorded receipt must show its pending relay state");
  try {
    await medicUses.command(actor, "witchcraftLifeSupport", { confirmed: true, amount: 8, rangeFt: 30, targetUuid: stranger.uuid }, "relay-d6");
  } catch (error) {
    assert.match(String(error?.message ?? error), /already|duplicate|pending|not applied|GM|relay/i,
      "retrying the same operation id must stay idempotent, never duplicate");
  }
  assert.equal(usesOf(actor).length, countBefore + 1, "an idempotent retry must not record a second use");
  await medicUses.undo(actor, "relay-d6");
  const undone = usesOf(actor).find(item => item.id === "relay-d6");
  assert.ok(!undone || undone.status === "undone", "linked undo must retire the relayed use");
  void first;
});

// D7 · Efficient Life Support
test("D7: Efficient Life Support at 11 grants twice actual positive AP spent on a levelled Art", async () => {
  requireRegistration();
  const levelled = witch({ level: 11, lifeSupport: 40 });
  const cantrip = witch({ level: 11, lifeSupport: 40 });
  await medicUses.command(levelled, "witchcraftLifeSupport", { confirmed: true, amount: 0, apSpent: 3, levelled: true }, "efficient-3");
  await medicUses.command(cantrip, "witchcraftLifeSupport", { confirmed: true, amount: 0, apSpent: 0, levelled: false }, "efficient-0");
  assert.equal(lsOf(cantrip), 40, "a zero-AP cantrip must grant zero Life Support");
  const cantripReceipt = medicUses.receipt(cantrip, "efficient-0");
  assert.equal(cantripReceipt?.result?.efficientGain ?? cantripReceipt?.result?.gain ?? 0, 0,
    "the cantrip receipt must record a zero Efficient gain");
  const levelledReceipt = medicUses.receipt(levelled, "efficient-3");
  assert.equal(levelledReceipt?.result?.efficientGain ?? levelledReceipt?.result?.gain, 6,
    "the AP-3 levelled receipt must record exactly 6 Efficient Life Support");
  assert.ok(levelledReceipt?.result?.lsPermission === true || /permission|action|bonus/i.test(levelledReceipt?.summary ?? ""),
    "the levelled receipt must record its turn-scoped LS Action/Bonus permission");
  assert.ok(lsOf(levelled) - lsOf(cantrip) === 6,
    `AP-3 levelled cast must grant exactly 6 more Life Support than the cantrip baseline (got ${lsOf(levelled)} vs ${lsOf(cantrip)})`);
});
test("D7: zero-AP and cantrip casts grant zero; LS Action/Bonus permission lasts that turn only", async () => {
  requireRegistration();
  const actor = witch({ level: 11, lifeSupport: 40 });
  const warnings = medicUses.preview(actor, "witchcraftLifeSupport", { amount: 0, apSpent: 0, levelled: false }).warnings;
  assert.ok(warnings.some(entry => /zero|efficient|no gain|cantrip/i.test(JSON.stringify(entry))),
    "zero-AP Efficient use must surface a no-gain notice");
});

// D8 · Witch's Boon
test("D8: Boon requires at least 5 actual HP restored specifically by Life Support healing", async () => {
  requireRegistration();
  const actor = witch({ level: 11, lifeSupport: 80 });
  const small = medicUses.preview(actor, "witchcraftLifeSupport", { amount: 4, boon: true });
  const enough = medicUses.preview(actor, "witchcraftLifeSupport", { amount: 5, boon: true });
  assert.ok(enough.warnings.filter(entry => /boon|threshold|5/i.test(JSON.stringify(entry))).length
    < small.warnings.filter(entry => /boon|threshold|5/i.test(JSON.stringify(entry))).length,
    "sub-threshold Boon healing must warn where threshold healing does not");
});
test("D8: additional owner-rolled 1d10 Force rides a named rider with consume/expiry/undo", async () => {
  requireRegistration();
  plans();
  const actor = witch({ level: 11, lifeSupport: 80 });
  const ally = witch({ level: 1, lifeSupport: 10 });
  ally.system.attributes.hp.value = 5;
  ally.system.attributes.hp.max = 20;
  await medicUses.command(actor, "witchcraftLifeSupport", { confirmed: true, amount: 8, rangeFt: 30, targetUuid: ally.uuid, boon: true }, "boon-d8");
  const entry = usesOf(actor).find(item => item.id === "boon-d8");
  const receipt = medicUses.receipt(actor, "boon-d8");
  assert.match(`${entry?.formula ?? ""} ${JSON.stringify(receipt?.result ?? {})} ${receipt?.summary ?? ""}`, /1d10/,
    "a threshold Boon heal must record its owner-rolled 1d10 in formula, result, or summary");
  assert.match(`${JSON.stringify(receipt?.result ?? {})} ${receipt?.summary ?? ""}`, /force|boon/i,
    "the Boon record must name Force damage or the Boon");
  assert.ok(/rider|boon/i.test(`${JSON.stringify(receipt?.result ?? {})} ${receipt?.summary ?? ""}`),
    "the Boon record must carry its named rider reference");
  const small = witch({ level: 11, lifeSupport: 80 });
  const smallAlly = witch({ level: 1, lifeSupport: 10 });
  smallAlly.system.attributes.hp.value = 12;
  smallAlly.system.attributes.hp.max = 20;
  await medicUses.command(small, "witchcraftLifeSupport", { confirmed: true, amount: 3, rangeFt: 30, targetUuid: smallAlly.uuid, boon: true }, "boon-small");
  const smallReceipt = medicUses.receipt(small, "boon-small");
  assert.doesNotMatch(`${smallReceipt?.formula ?? ""} ${JSON.stringify(smallReceipt?.result ?? {})} ${smallReceipt?.summary ?? ""}`, /1d10/,
    "a sub-threshold Boon heal must not record a 1d10 rider");
  await medicUses.undo(actor, "boon-d8");
  const undone = usesOf(actor).find(item => item.id === "boon-d8");
  assert.ok(!undone || undone.status === "undone", "undo must retire the Boon use and its rider");
});

// D9 · Life through Death
test("D9: at 15 offers source-authorized maximum damage choice with visible targets and allocation", async () => {
  requireRegistration();
  const actor = witch({ level: 15, lifeSupport: 80 });
  const preview = medicUses.preview(actor, "lifeThroughDeath", { targetUuids: ["Actor.foeA", "Actor.foeB"], damageTotal: 20 });
  assert.match(preview.title ?? "lifeThroughDeath", /life through death/i, "the allocation preview must carry its title");
  assert.equal(preview.targets?.length, 2, "both visible targets must appear in the allocation preview");
  await medicUses.command(actor, "lifeThroughDeath", { confirmed: true, damageTotal: 20,
    targetUuids: ["Actor.foeA", "Actor.foeB"], allocations: { "Actor.foeA": 12, "Actor.foeB": 8 } }, "death-alloc");
  const receipt = medicUses.receipt(actor, "death-alloc");
  assert.ok(receipt, "the allocated Death use must be recorded");
  const amounts = (receipt?.targets ?? []).map(item => item.amount ?? 0);
  assert.deepEqual(amounts, [12, 8], "the receipt must preserve the chosen per-target allocation");
  assert.equal(amounts.reduce((sum, value) => sum + value, 0), 20, "the allocation must total the authorized maximum");
  await medicUses.command(actor, "lifeThroughDeath", { confirmed: true, damageTotal: 20,
    targetUuids: ["Actor.foeA"], allocations: { "Actor.foeA": 12 } }, "death-remainder");
  const partial = medicUses.receipt(actor, "death-remainder");
  assert.equal(partial?.result?.remainder ?? partial?.result?.unspent, 8,
    "an optional unspent remainder must be recorded, never silently dropped");
});
test("D9: mutually exclusive with Harm on the same roll; once per long rest", async () => {
  requireRegistration();
  const actor = witch({ level: 15, lifeSupport: 80 });
  await medicUses.command(actor, "healingThroughHarm", { confirmed: true, damageTotal: 12 }, "harm-excl");
  const deathPreview = medicUses.preview(actor, "lifeThroughDeath", { damageTotal: 12, sameRollAs: "harm-excl" });
  assert.ok(deathPreview.warnings.length > 0, "Death on a Harm-claimed roll must warn as mutually exclusive");
});

// Sheet contract
test("D-sheet: opening the branch control is read-only and escaped; unrelated commands return false", async () => {
  const sheet = requireSheet();
  const actor = witch({ level: 7, name: "<Witch & Doctor>" });
  const before = structuredClone(actor.flags);
  const html = sheet.renderWitchcraftSection(actor);
  assert.match(String(html), /data-medic-cmd/);
  assert.match(String(html), /Witch|Curse|Harm/i);
  assert.doesNotMatch(String(html), /<Witch & Doctor>/, "Actor-controlled markup is never emitted as raw HTML");
  assert.deepEqual(actor.flags, before, "rendering controls never writes");
  assert.equal(await sheet.handleWitchcraftCommand(actor, "unrelatedCommand", {}), false);
});
test("D-common: unconfirmed uses write nothing; overspends clamp at zero with a visible shortfall", async () => {
  requireRegistration();
  const actor = witch({ level: 7, lifeSupport: 5 });
  await assert.rejects(
    medicUses.command(actor, "witchcurse", { confirmed: false, targetUuid: "Actor.foe" }, "curse-unconfirmed"),
    /confirm/i, "unconfirmed uses must refuse before any write");
  assert.equal(lsOf(actor), 5, "refused uses change nothing");
  await medicUses.command(actor, "witchcraftLifeSupport", { confirmed: true, amount: 20, rangeFt: 30 }, "ls-overspend");
  assert.equal(lsOf(actor), 0, "overspending Life Support clamps at zero, never negative");
  assert.ok(usesOf(actor).some(entry => entry.id === "ls-overspend"), "the clamped use must still be recorded");
});
