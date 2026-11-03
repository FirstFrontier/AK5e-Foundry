/**
 * FROZEN TESTS — WP vanguard-base (adversary-authored, immutable after freezing).
 * Spec: .codex-work/guard-vanguard-base-polish/SPEC-vanguard-base.md (AC 1–12, §4 red table).
 * Source authority: C3 L7904–8085 (03_chapter_3_character_classes.txt), C1 L211–212.
 * Scope: owned files vanguard-rules/progression/setup/features/resolution. Tip contract
 * slice only (F10/F11 unit contract — native Longsword evidence belongs to the checkpoint,
 * B-308 pending). Restart evidence for F12 is unit-level rehydration; scratch-server
 * restart remains checkpoint work.
 *
 * Expected pre-change results per spec §4:
 *   RED:    F01 profile-multiclass-own-keys, F02 progression-hp-asi-idempotency,
 *           F03 martial-choice-finite, F04 landstrider-nimble-scope,
 *           F06 extra-attack-dodge-validation, F08 lightspeed-active-round-one
 *   GREEN:  F05 quick-native-consumption, F07 directed-turn-expiry,
 *           F09 storm-components-replay, F10 tip-source-pb-contract,
 *           F11 tip-native-marker-receipt, F12 rehydration-idempotency
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  VANGUARD_CLASS_ID, checkLevel, hitPointsAtLevel, martialDC,
  vanguardProfile, vanguardEnabled, vanguardLevel
} from "../scripts/vanguard-rules.mjs";
import {
  recordNimbleTarget, isNimbleAgainst, clearNimbleTargets,
  executeUncannyDodge, hasUncannyDodge,
  activateDirectedEngagement, isDirectedEngagementActive, clearDirectedEngagement,
  lightspeedSecondInitiative, isLightspeedApplicable,
  approachingStormDamageBonus,
  executeTipOfTheSpear, TIP_OUTCOMES, validateTipTarget
} from "../scripts/vanguard-features.mjs";import {
  vanguardPreRollDamage, vanguardPostRollDamage,
  vanguardPreConfigureInitiative, vanguardPostRollInitiative
} from "../scripts/vanguard-resolution.mjs";
import { getReactions } from "../scripts/trigger-events.mjs";
import { tipEffectId } from "../scripts/tip-of-the-spear.mjs";
import { previewVanguardProgression, applyVanguardProgression } from "../scripts/vanguard-progression.mjs";
import { previewVanguardSetup, applyVanguardSetup } from "../scripts/vanguard-setup.mjs";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem } from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
});
test.afterEach(() => {
  teardownFoundryGlobals();
});

/* ------------------------------------------------------------ helpers */

function vanguardClassItem(level) {
  return createTestItem({
    name: "Vanguard",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: VANGUARD_CLASS_ID } }
  });
}

/** Vanguard actor; vanguardFlag merges into flags.ak5e.vanguard (enabled etc.). */
function vanguardActor(level, { vanguardFlag = {}, system = {}, name = "Test Vanguard" } = {}) {
  return createTestActor({
    name,
    items: [vanguardClassItem(level)],
    system: {
      attributes: { prof: Math.floor((level - 1) / 4) + 2, hp: { value: 30, max: 30, temp: 0 } },
      abilities: { str: { mod: 1 }, dex: { mod: 3 }, con: { mod: 2 } },
      ...system
    },
    flags: { ak5e: { vanguard: { enabled: true, ...vanguardFlag } } }
  });
}

function branchItem(sourceId, { classIdentifier = "vanguard" } = {}) {
  return createTestItem({
    name: `Vanguard: ${sourceId}`,
    type: "subclass",
    system: { classIdentifier },
    flags: { ak5e: { chapterThreeId: sourceId } }
  });
}

function combatMock({ uuid = "Combat.frozen1", started = true, round = 1, combatantId = "ct0" } = {}) {
  const combat = {
    uuid, started, round,
    combatants: new Map([["ct0", { id: "ct0" }], ["ct1", { id: "ct1" }]]),
    combatant: { id: combatantId }
  };
  globalThis.game.combat = combat;
  return combat;
}

let useSeq = 0;
const freshUseId = prefix => `${prefix}-frozen-${Date.now()}-${++useSeq}`;

/* ============================================================ AC 1 — F01 */

test("F01-red profile-multiclass-own-keys: inherited dictionary keys cannot yield a valid branch", () => {
  // Spec AC1 / red table: "`constructor` becomes a branch function".
  // Unknown/conflicting branches must never produce a valid profile.
  for (const poisonId of ["constructor", "toString", "__proto__"]) {
    const actor = createTestActor({
      items: [vanguardClassItem(5), branchItem(poisonId)],
      flags: { ak5e: { vanguard: { enabled: true } } }
    });
    const prof = vanguardProfile(actor);
    assert.notEqual(typeof prof.branch, "function",
      `branch id "${poisonId}" must not resolve through inherited Object keys`);
    assert.equal(prof.branch, null, `branch id "${poisonId}" must be unknown, not "${String(prof.branch)}"`);
    assert.ok(prof.blocked.includes("UnknownBranch"), `branch id "${poisonId}" must block with UnknownBranch`);
    assert.equal(vanguardEnabled(actor), false, `actor with branch id "${poisonId}" cannot be enabled`);
  }
});

test("F01-regression profile gates: noncharacter, compendium, malformed level, conflicts, multiclass", () => {
  // Noncharacters and compendium actors never acquire a profile.
  assert.equal(vanguardProfile({ type: "npc" }).applicable, false);
  const compendium = createTestActor({ items: [vanguardClassItem(5)], pack: "ak5e.classes" });
  assert.equal(vanguardProfile(compendium).applicable, false);

  // Malformed levels are blocked, never coerced.
  for (const levels of ["3.5", 0, 25, -2, "eleven", null]) {
    const actor = createTestActor({ items: [vanguardClassItem(0)] });
    const classItem = [...actor.items.values()][0];
    classItem.system.levels = levels;
    const prof = vanguardProfile(actor);
    assert.equal(prof.applicable, true);
    assert.equal(prof.level, null);
    assert.deepEqual(prof.blocked, ["InvalidClassLevel"], `levels ${JSON.stringify(levels)}`);
    assert.equal(vanguardEnabled(actor), false);
  }

  // Conflicting branches block.
  const conflicted = createTestActor({
    items: [vanguardClassItem(5), branchItem("subclass-vanguard-agent"), branchItem("subclass-vanguard-charger")]
  });
  assert.deepEqual(vanguardProfile(conflicted).blocked, ["ConflictingVanguardBranches"]);
  assert.equal(vanguardEnabled(conflicted), false);

  // Multiclass retains Vanguard gating on Vanguard levels only; shared PB lives on the Actor.
  const multi = createTestActor({
    items: [vanguardClassItem(5), branchItem("subclass-vanguard-agent")],
    flags: { ak5e: { vanguard: { enabled: true } } }
  });
  multi.items.set("other_class", createTestItem({
    id: "other_class", name: "Cleric", type: "class", system: { levels: 9 }, flags: { ak5e: {} }
  }, multi));
  multi.system.attributes.prof = 4; // shared Actor PB, not Vanguard-derived
  const prof = vanguardProfile(multi);
  assert.equal(prof.level, 5);
  assert.equal(vanguardLevel(multi), 5);
  assert.deepEqual(prof.blocked, []);
  assert.equal(vanguardEnabled(multi), true);
});

/* ============================================================ AC 2 — F02 */

test("F02-red progression-hp-asi-idempotency: pure HP rejects malformed roll/mode inputs", () => {
  // Spec AC2 "Reject malformed HP modes/results" / red table:
  // "pure HP accepts roll 9/unknown mode".
  assert.throws(() => hitPointsAtLevel(2, 0, { mode: "rolled", rolls: [9] }),
    /./, "d8 result 9 is impossible and must be rejected, not added");
  assert.throws(() => hitPointsAtLevel(2, 0, { mode: "rolled", rolls: [0] }),
    /./, "d8 result 0 is impossible and must be rejected");
  assert.throws(() => hitPointsAtLevel(2, 0, { mode: "rolled", rolls: [3.5] }),
    /./, "fractional roll must be rejected, not silently averaged");
  assert.throws(() => hitPointsAtLevel(2, 0, { mode: "rolled", rolls: ["7"] }),
    /./, "numeric-string roll must be rejected");
  assert.throws(() => hitPointsAtLevel(2, 0, { mode: "rolled" }),
    /./, "rolled mode without a recorded die result must be rejected");
  assert.throws(() => hitPointsAtLevel(2, 0, { mode: "wild" }),
    /./, "unknown HP mode must be rejected, not silently treated as fixed");
});

test("F02-regression progression: valid formulas, preview writes nothing, re-apply idempotent", async () => {
  // Valid fixed/rolled arithmetic (C3 L7918–7920).
  assert.equal(hitPointsAtLevel(1, 3), 11);
  assert.equal(hitPointsAtLevel(5, 0), 28);
  assert.equal(hitPointsAtLevel(5, 2, { mode: "rolled", rolls: [7, 8, 4, 6] }), 10 + 9 + 10 + 6 + 8);
  assert.equal(hitPointsAtLevel(3, -10), 3); // per-level minimum clamp

  const actor = vanguardActor(1, {
    name: "F02",
    system: { abilities: { str: { mod: 1 }, dex: { mod: 3 }, con: { mod: 2 } }, attributes: { prof: 2, hp: { value: 10, max: 10 } } }
  });
  const choices = {
    branch: "subclass-vanguard-agent",
    martialDCAbility: "dex",
    saves: ["cha"],
    skills: ["acr", "prc", "ste"],
    tool: "Messenger Kit",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed" } }
  };
  // Preview writes nothing.
  const writesBefore = actor.writes.length;
  const plan = await previewVanguardProgression(actor, choices);
  assert.equal(actor.writes.length, writesBefore, "preview must not write the Actor");
  assert.equal(plan.pending.length, 0);

  // Malformed HP choice is rejected at preview level too (owned plan validation).
  const badPlan = await previewVanguardProgression(actor, { ...choices, hp: { 1: { mode: "rolled", roll: 9 } } });
  assert.ok(badPlan.pending.includes("hp.1") || badPlan.pending.some(p => String(p).startsWith("hp.")),
    "preview must reject an impossible d8 result");

  // Apply once, then re-preview + re-apply with the ORIGINAL explicit choices: no duplication.
  const applied = await applyVanguardProgression(actor, { confirmed: true, contextKey: plan.contextKey, choices });
  assert.equal(applied.success, true);
  assert.equal(actor.system.currency.cp, 1300);
  const hpAfter = actor.system.attributes.hp.max;
  const second = await previewVanguardProgression(actor, choices);
  assert.equal(second.pending.length, 0);
  assert.equal(second.writes["system.attributes.hp.max"], undefined, "original HP choice cannot re-grant HP");
  assert.equal(second.writes["system.currency.cp"], undefined, "original cash choice cannot re-grant 1300 LMD");
  await applyVanguardProgression(actor, { confirmed: true, contextKey: second.contextKey, choices });
  assert.equal(actor.system.attributes.hp.max, hpAfter);
  assert.equal(actor.system.currency.cp, 1300);

  // Stale context rejection (AC2: confirmation uses a current context).
  await assert.rejects(() => applyVanguardProgression(actor, { confirmed: true, contextKey: "stale-key", choices }));
  await assert.rejects(() => applyVanguardProgression(actor, { confirmed: false, contextKey: second.contextKey, choices }));
});

/* ============================================================ AC 3 — F03 */

test("F03-red martial-choice-finite: non-finite modifiers/PB must be rejected", () => {
  // Spec AC3 "reject non-finite numerical inputs" / red table:
  // "infinite modifier yields infinite DC".
  const infMod = vanguardActor(1, { system: { abilities: { str: { mod: Infinity }, dex: { mod: 3 }, con: { mod: 0 } }, attributes: { prof: 2 } } });
  assert.throws(() => martialDC(infMod, "str"), /./, "+Infinity Strength modifier must be rejected, not produce Infinity DC");
  const nanMod = vanguardActor(1, { system: { abilities: { str: { mod: NaN }, dex: { mod: 3 }, con: { mod: 0 } }, attributes: { prof: 2 } } });
  assert.throws(() => martialDC(nanMod, "str"), /./, "NaN modifier must be rejected, not produce NaN DC");
  const junkMod = vanguardActor(1, { system: { abilities: { str: { mod: "abc" }, dex: { mod: 3 }, con: { mod: 0 } }, attributes: { prof: 2 } } });
  assert.throws(() => martialDC(junkMod, "str"), /./, "non-numeric modifier must be rejected");
  const infPB = vanguardActor(1, { system: { abilities: { str: { mod: 1 }, dex: { mod: 3 }, con: { mod: 0 } }, attributes: { prof: Infinity } } });
  assert.throws(() => martialDC(infPB, "dex"), /./, "non-finite shared PB must be rejected");
});

test("F03-regression martial-choice-finite: explicit selection required, shared PB used", () => {
  const actor = vanguardActor(1, { system: { abilities: { str: { mod: 1 }, dex: { mod: 5 }, con: { mod: 0 } }, attributes: { prof: 3 } } });
  assert.equal(martialDC(actor), null, "never silently choose the higher modifier");
  assert.equal(martialDC(actor, "str"), 8 + 3 + 1);
  assert.equal(martialDC(actor, "dex"), 8 + 3 + 5);
  assert.equal(martialDC(actor, "cha"), null, "only STR or DEX is legal");
  actor.flags.ak5e.vanguard.martialDCAbility = "dex";
  assert.equal(martialDC(actor), 8 + 3 + 5, "persisted choice is honoured");
});

/* ============================================================ AC 4 — F04 */

test("F04-red landstrider-nimble-scope: missing/invalid target must not be recorded", async () => {
  // Spec AC4 "Track distinct valid hit-creature IDs only" / red table:
  // "missing target records \"undefined\"".
  const actor = vanguardActor(5);
  await assert.rejects(() => recordNimbleTarget(actor, undefined), /./,
    "a missing target must throw, not record the literal string \"undefined\"");
  const state1 = actor.flags.ak5e.vanguard.nimbleTargets ?? [];
  assert.ok(!state1.includes("undefined"), "the junk id \"undefined\" must never be persisted");

  await assert.rejects(() => recordNimbleTarget(actor, null), /./, "null target must throw");
  assert.ok(!(actor.flags.ak5e.vanguard.nimbleTargets ?? []).includes("null"), "the junk id \"null\" must never be persisted");

  await assert.rejects(() => recordNimbleTarget(actor, {}), /./,
    "an object with no uuid must throw, not record \"[object Object]\"");
  assert.ok(!(actor.flags.ak5e.vanguard.nimbleTargets ?? []).includes("[object Object]"));
});

test("F04-regression landstrider-nimble-scope: distinct valid IDs, turn-scoped protection", async () => {
  const actor = vanguardActor(5);
  const enemyA = createTestActor({ name: "Enemy A", type: "npc" });
  const enemyB = createTestActor({ name: "Enemy B", type: "npc" });

  await recordNimbleTarget(actor, enemyA);
  await recordNimbleTarget(actor, enemyA); // duplicate request records once
  assert.deepEqual(actor.flags.ak5e.vanguard.nimbleTargets, [enemyA.uuid]);
  assert.equal(isNimbleAgainst(actor, enemyA), true);
  assert.equal(isNimbleAgainst(actor, enemyB), false);

  // Protection ends with the RECORDED turn, not another combatant's turn.
  const combat = combatMock({ started: true, round: 1, combatantId: "ct0" });
  await actor.update({ "flags.ak5e.vanguard.nimbleTurn": { combatId: combat.uuid, round: 1, combatantId: "ct0" } });
  assert.equal(isNimbleAgainst(actor, enemyA), true, "still protected during the recorded turn");
  combat.combatant = { id: "ct1" };
  assert.equal(isNimbleAgainst(actor, enemyA), false, "another combatant's turn ends the protection window");
  combat.combatant = { id: "ct0" };
  combat.round = 2;
  assert.equal(isNimbleAgainst(actor, enemyA), false, "a later round ends the protection window");

  await clearNimbleTargets(actor);
  combat.round = 1;
  combat.combatant = { id: "ct0" };
  combat.started = false;
  assert.equal(isNimbleAgainst(actor, enemyA), false);
});

/* ============================================================ AC 5 — F05 (expected green) */

test("F05 quick-native-consumption: armed PB added once, cancel keeps armed, match consumes", async () => {
  const actor = vanguardActor(3);
  const useId = freshUseId("quick");
  await actor.update({
    "flags.ak5e.vanguard.quickOffTheMarkArmed": { bonus: 2, useId },
    [`flags.ak5e.vanguardUses`]: { undo: [{ id: useId, command: "quickOffTheMark", flagChanges: [{ path: "flags.ak5e.vanguard.quickOffTheMarkArmed" }] }] }
  });

  // Armed native initiative gets shared PB appended once.
  const config = { parts: ["1d20", "3"] };
  vanguardPreConfigureInitiative(actor, config);
  assert.deepEqual(config.parts, ["1d20", "3", "2"], "level-3 optional adds the shared Actor PB");
  assert.equal(config._ak5eQuickOffTheMark, true);

  // Repeated hook does not double-inject.
  vanguardPreConfigureInitiative(actor, config);
  assert.equal(config.parts.length, 3, "the PB must be added exactly once per roll");

  // No automatic roll: nothing rolled or posted.
  assert.equal(globalThis.game.messages.length, 0, "resolution adapters must not roll dice");

  // Mismatching marker: cancellation path leaves the use armed.
  actor._cachedInitiativeRoll = { options: { _ak5eQuickOffTheMark: { actorUuid: actor.uuid, useId: "not-the-use", bonus: 2 } } };
  await vanguardPostRollInitiative(actor);
  assert.ok(actor.flags.ak5e.vanguard.quickOffTheMarkArmed, "a non-matching roll must not consume the armed use");
  delete actor._cachedInitiativeRoll;

  // Not armed: untouched config.
  const bare = { parts: ["1d20"] };
  await actor.update({ "flags.ak5e.vanguard.quickOffTheMarkArmed": null });
  vanguardPreConfigureInitiative(actor, bare);
  assert.deepEqual(bare.parts, ["1d20"]);

  // Successful matching roll records consumption and clears the arm.
  await actor.update({ "flags.ak5e.vanguard.quickOffTheMarkArmed": { bonus: 2, useId } });
  const roll = { parts: ["1d20", "3"] };
  vanguardPreConfigureInitiative(actor, roll);
  actor._cachedInitiativeRoll = { options: roll.options };
  await vanguardPostRollInitiative(actor);
  assert.equal(actor.flags.ak5e.vanguard.quickOffTheMarkArmed, null, "matching initiative roll consumes the armed use");
  const receipt = actor.flags.ak5e.vanguardUses.undo.find(e => e.id === useId);
  assert.deepEqual(receipt.quickOffTheMarkApplied, { bonus: 2 });
  assert.equal(receipt.flagChanges[0].after, null);

  // Repeat post-roll must not double-apply.
  await actor.update({ "flags.ak5e.vanguard.quickOffTheMarkArmed": { bonus: 2, useId } });
  await vanguardPostRollInitiative(actor);
  assert.equal(actor.flags.ak5e.vanguard.quickOffTheMarkArmed.bonus, 2,
    "already-consumed receipt cannot re-mark a fresh arm as applied");
});

/* ============================================================ AC 6 — F06 */

test("F06-red extra-attack-dodge-validation: invalid damage must fail before Reaction expenditure", async () => {
  // Spec AC6 "Invalid damage must fail before expenditure or writes" / red table:
  // "invalid damage spends Reaction first".
  for (const bad of ["abc", -5, Infinity, NaN, undefined, null]) {
    const actor = vanguardActor(11);
    assert.equal(getReactions(actor).available, 1);
    await assert.rejects(() => executeUncannyDodge(actor, { damage: bad, attacker: null }), /./,
      `invalid damage ${String(bad)} must be rejected`);
    assert.equal(getReactions(actor).available, 1,
      `invalid damage ${String(bad)} must not spend the Reaction (C3 L8041: the spend only happens when the reduction applies)`);
  }
});

test("F06-regression extra-attack-dodge-validation: gates, halving, single spend, no double application", async () => {
  // Extra Attack: level 5 exposes exactly one additional attack; nothing auto-attacks.
  assert.equal(vanguardEnabled(vanguardActor(4)), true);
  const lv11 = vanguardActor(11);
  assert.equal(hasUncannyDodge(lv11), true);
  assert.equal(hasUncannyDodge(vanguardActor(10)), false);

  // Level gate rejects before any expenditure.
  const lv10 = vanguardActor(10);
  await assert.rejects(() => executeUncannyDodge(lv10, { damage: 20 }));
  assert.equal(getReactions(lv10).available, 1);

  // Valid: floor halving (C3 L8041), one Reaction, full+halved never both apply.
  const attacker = createTestActor({ name: "Attacker", type: "npc" });
  const result = await executeUncannyDodge(lv11, { damage: 25, attacker, receiptId: "r-od-1" });
  assert.equal(result.halvedDamage, 12);
  assert.equal(result.damageReduced, 13);
  assert.equal(result.halvedDamage + result.damageReduced, 25, "reduction accounts for exactly the incoming damage");
  assert.equal(result.reactionSpent, true);
  assert.equal(getReactions(lv11).available, 0);
  await assert.rejects(() => executeUncannyDodge(lv11, { damage: 20, receiptId: "r-od-2" }), /./,
    "a second dodge without a Reaction is refused");
});

/* ============================================================ AC 7 — F07 (expected green) */

test("F07 directed-turn-expiry: one Reaction enables through that turn, repeat choice reuses, scoped expiry", async () => {
  const lv14 = vanguardActor(14);
  await assert.rejects(() => activateDirectedEngagement(lv14, { receiptId: "r-de-gate" }));
  assert.equal(getReactions(lv14).available, 1, "rejected activation spends nothing");

  const actor = vanguardActor(15);
  const first = await activateDirectedEngagement(actor, { receiptId: "r-de-1" });
  assert.equal(first.success, true);
  assert.equal(first.reactionSpent, true);
  assert.equal(getReactions(actor).available, 0);

  // Subsequent same-turn TIP choices do not spend again: activation already owns the
  // one Reaction (C3 L8047); a directed choice with an exhausted budget still works.
  await assert.rejects(() => activateDirectedEngagement(actor, { receiptId: "r-de-2" }), /Reaction/,
    "a second activation without budget is refused");
  assert.equal(getReactions(actor).available, 0, "refused activation consumed nothing further");
  assert.equal(actor.flags.ak5e.vanguard.directedEngagementActive, true, "refusal leaves the enablement intact");
  const directedTip = await executeTipOfTheSpear({
    actor, target: { actor: createTestActor({ name: "Ally", prof: 2 }) },
    directed: true, choice: 3, op: { id: "op-f07" },
    helpers: { dice: async () => 1, tagged: async () => ({ id: "e" }), temporaryHP: async () => ({}) }
  });
  assert.equal(directedTip.outcome, 3, "chosen outcome resolves while enabled");
  assert.equal(getReactions(actor).available, 0, "a same-turn choice does not spend another Reaction");

  // Turn/combat expiry is scoped to the recorded combat + round + combatant.
  const combat = combatMock({ uuid: "Combat.de", started: true, round: 1, combatantId: "ct0" });
  await actor.update({
    "flags.ak5e.vanguard.directedEngagementActive": true,
    "flags.ak5e.vanguard.directedEngagementTurn": { combatId: combat.uuid, round: 1, combatantId: "ct0" }
  });
  assert.equal(isDirectedEngagementActive(actor), true);
  combat.round = 2;
  assert.equal(isDirectedEngagementActive(actor), false, "expiry at end of that Turn (C3 L8047)");
  combat.round = 1;
  combat.combatant = { id: "ct1" };
  assert.equal(isDirectedEngagementActive(actor), false, "another combatant's turn ends the window");
  combat.combatant = { id: "ct0" };
  combat.started = false;
  assert.equal(isDirectedEngagementActive(actor), false, "unstarted/ended combat does not keep it active");

  await clearDirectedEngagement(actor);
  assert.equal(actor.flags.ak5e.vanguard.directedEngagementActive, false);
  globalThis.game.combat = null;
  assert.equal(isDirectedEngagementActive(actor), false);
});

/* ============================================================ AC 8 — F08 */

test("F08-red lightspeed-active-round-one: unstarted round-1 combat must not qualify", () => {
  // Spec AC8 "eligibility requires an active first round" / red table:
  // "unstarted round-1 combat qualifies".
  const actor = vanguardActor(18);
  assert.equal(isLightspeedApplicable(actor, { uuid: "C1", round: 1, started: false, combatant: { id: "x" } }), false,
    "a not-yet-started encounter with round 1 is not an active first round");
  assert.equal(isLightspeedApplicable(actor, { uuid: "C2", round: 1, started: undefined, combatant: { id: "x" } }), false,
    "missing combat state must not qualify Lightspeed");
});

test("F08-regression lightspeed-active-round-one: gates and minus-10 including negative results", () => {
  assert.equal(isLightspeedApplicable(vanguardActor(17), { round: 1, started: true }), false, "level gate: 18");
  assert.equal(isLightspeedApplicable(vanguardActor(18), { round: 1, started: true }), true);
  assert.equal(isLightspeedApplicable(vanguardActor(18), { round: 2, started: true }), false, "first round only (C3 L8052)");
  assert.equal(isLightspeedApplicable(vanguardActor(18), null), false);
  assert.equal(lightspeedSecondInitiative(5), -5, "Initiative Score -10 may go negative (C3 L8052)");
  assert.equal(lightspeedSecondInitiative(0), -10);
  assert.equal(lightspeedSecondInitiative("12"), 2, "numeric string coerces via Number contract");
  assert.throws(() => lightspeedSecondInitiative("fast"));
  assert.throws(() => lightspeedSecondInitiative(Infinity));
});

/* ============================================================ AC 9 — F09 (expected green) */

test("F09 storm-components-replay: bonus table, recorded reading, once-per-roll, cancel/replay safety", async () => {
  assert.equal(approachingStormDamageBonus(vanguardActor(19), { started: true, round: 1 }), 0, "level gate: 20");
  const actor = vanguardActor(20);
  const combat = combatMock({ uuid: "Combat.storm", started: true, round: 1 });
  assert.equal(approachingStormDamageBonus(actor, combat), 10, "floor(20/2) (C3 L8057)");
  assert.equal(approachingStormDamageBonus(actor, { ...combat, round: 2 }), 0, "first round only");
  assert.equal(approachingStormDamageBonus(actor, { ...combat, started: false }), 0, "active combat required");
  assert.equal(approachingStormDamageBonus(actor, null), 0);

  // Armed 'once' with componentIndex: exactly one component receives the bonus.
  const useOnce = freshUseId("storm");
  await actor.update({
    "flags.ak5e.vanguard.approachingStormArmed": { bonus: 10, useId: useOnce, combatId: combat.uuid, round: 1, reading: "once", componentIndex: 0 },
    "flags.ak5e.vanguardUses": { undo: [{ id: useOnce, command: "approachingStorm", flagChanges: [{ path: "flags.ak5e.vanguard.approachingStormArmed" }] }] }
  });
  const config = { subject: { actor }, rolls: [{ parts: ["1d8"] }, { parts: ["2"] }] };
  vanguardPreRollDamage(config, {}, {});
  assert.deepEqual(config.rolls[0].parts, ["1d8", "10"]);
  assert.deepEqual(config.rolls[1].parts, ["2"], "'once' reading must touch only the recorded component");
  vanguardPreRollDamage(config, {}, {});
  assert.equal(config.rolls[0].parts.length, 2, "no duplicate injection into the same roll config");

  // Consumption after a successful damage roll.
  await vanguardPostRollDamage(config.rolls, { subject: { actor } });
  assert.equal(actor.flags.ak5e.vanguard.approachingStormArmed, null, "matching roll consumes the armed use");
  const onceReceipt = actor.flags.ak5e.vanguardUses.undo.find(e => e.id === useOnce);
  assert.equal(onceReceipt.approachingStormApplied.bonus, 10);
  await actor.update({ "flags.ak5e.vanguard.approachingStormArmed": { bonus: 10, useId: useOnce, combatId: combat.uuid, round: 1, reading: "once", componentIndex: 0 } });
  await vanguardPostRollDamage(config.rolls, { subject: { actor } });
  assert.ok(actor.flags.ak5e.vanguard.approachingStormArmed, "a replayed receipt must not re-mark a fresh arm as consumed");

  // perRoll reading touches every component.
  const usePer = freshUseId("storm");
  await actor.update({
    "flags.ak5e.vanguard.approachingStormArmed": { bonus: 10, useId: usePer, combatId: combat.uuid, round: 1, reading: "perRoll", componentIndex: 0 },
    "flags.ak5e.vanguardUses": { undo: [{ id: usePer, command: "approachingStorm", flagChanges: [{ path: "flags.ak5e.vanguard.approachingStormArmed" }] }] }
  });
  const config2 = { subject: { actor }, rolls: [{ parts: ["1d8"] }, { parts: ["2"] }] };
  vanguardPreRollDamage(config2, {}, {});
  assert.deepEqual(config2.rolls[0].parts, ["1d8", "10"]);
  assert.deepEqual(config2.rolls[1].parts, ["2", "10"]);

  // Unrecognised reading: roll left unchanged, use stays armed (recorded-reading discipline).
  const useJunk = freshUseId("storm");
  await actor.update({ "flags.ak5e.vanguard.approachingStormArmed": { bonus: 10, useId: useJunk, combatId: combat.uuid, round: 1, reading: "both" } });
  const config3 = { subject: { actor }, rolls: [{ parts: ["1d8"] }] };
  vanguardPreRollDamage(config3, {}, {});
  assert.deepEqual(config3.rolls[0].parts, ["1d8"]);
  assert.ok(actor.flags.ak5e.vanguard.approachingStormArmed, "unconsumed arm survives a skipped injection");

  // Stale combat/round arming: unchanged and warned (not silently applied).
  const useStale = freshUseId("storm");
  await actor.update({ "flags.ak5e.vanguard.approachingStormArmed": { bonus: 10, useId: useStale, combatId: "Combat.other", round: 1, reading: "once", componentIndex: 0 } });
  const config4 = { subject: { actor }, rolls: [{ parts: ["1d8"] }] };
  vanguardPreRollDamage(config4, {}, {});
  assert.deepEqual(config4.rolls[0].parts, ["1d8"]);

  // Cancellation (no arm): untouched.
  await actor.update({ "flags.ak5e.vanguard.approachingStormArmed": null });
  const config5 = { subject: { actor }, rolls: [{ parts: ["1d8"] }] };
  vanguardPreRollDamage(config5, {}, {});
  assert.deepEqual(config5.rolls[0].parts, ["1d8"]);
});

/* ============================================================ AC 10 — F10 (shared-contract regression) */

test("F10 tip-source-pb-contract: table, source PB metadata, cumulative identity, source-turn deadline, no membership requirement", () => {
  // Source table retained (C3 L8000–8007).
  assert.equal(TIP_OUTCOMES.length, 6);
  assert.deepEqual(TIP_OUTCOMES.map(o => o.id), ["tip1", "tip2", "tip3", "tip4", "tip5", "tip6"]);
  assert.deepEqual(TIP_OUTCOMES.map(o => o.n), [1, 2, 3, 4, 5, 6]);

  // Outcome 1: source (bearer) PB metadata — never recipient's.
  const bearer = vanguardActor(9);        // PB 4
  const recipient = createTestActor({ name: "Ally", prof: 2 });
  assert.equal(TIP_OUTCOMES[0].value(bearer), 4, "tip1 carries the source's PB (C3 L8001)");
  assert.equal(TIP_OUTCOMES[0].value(recipient), 2, "value() always reads the passed bearer, not the recipient");
  assert.equal(TIP_OUTCOMES[1].temporaryHP.formula, "1d6");
  assert.equal(TIP_OUTCOMES[1].temporaryHP.additive, true);
  assert.deepEqual(TIP_OUTCOMES[2].changes(recipient).map(c => `${c.key}:${c.value}:${c.mode}`),
    ["system.attributes.movement.walk:10:2"],
    "outcome 3 grants +10 feet to each walking movement the recipient has");
  assert.equal(TIP_OUTCOMES[3].changes(recipient).length, 4, "outcome 4: +2 Attack Rolls on all attack types");
  assert.ok(TIP_OUTCOMES[3].changes(recipient).every(c => c.value === "2" && c.mode === 2));

  // Cumulative benefit identity + source-turn deadline (effects until the source's next turn).
  const op = { id: "op-f10" };
  const id0 = tipEffectId(op, { actor: recipient }, 0);
  const id1 = tipEffectId(op, { actor: recipient }, 1);
  assert.notEqual(id0, id1, "uses are distinct cumulative benefits");
  assert.equal(TIP_OUTCOMES[0].expiryActor, "source");
  assert.equal(TIP_OUTCOMES[0].trigger, "turnStart");

  // validateTipTarget: range contract only; receiving the benefit needs NO Vanguard membership.
  const tipHelpers = { withinFeet: () => true, tokenPoint: () => ({ x: 0, y: 0 }) };
  const outOfRangeHelpers = { withinFeet: () => false, tokenPoint: () => ({ x: 0, y: 0 }) };
  assert.equal(validateTipTarget({ source: bearer, target: recipient, helpers: tipHelpers }), true);
  assert.throws(() => validateTipTarget({ source: bearer, target: recipient, helpers: outOfRangeHelpers }));
  assert.throws(() => validateTipTarget({ source: bearer, target: recipient, range: 0, helpers: tipHelpers }));
  assert.throws(() => validateTipTarget({ source: bearer, target: recipient, range: -5, helpers: tipHelpers }));
  assert.equal(validateTipTarget({ source: bearer, target: recipient, range: Infinity, helpers: {} }), true,
    "Tactician-style unlimited range is an explicit pass");
  // NOTE: shared confirmation/relay/undo authority stays with vanguard-shared; native
  // runtime evidence for this slice is pending (checkpoint item, not claimed here).
});

/* ============================================================ AC 11 — F11 (unit contract only) */

test("F11 tip-native-marker-receipt: gates, directed choice contract, giver PB, no auto-roll", async () => {
  // Unit contract slice. AC11's native Longsword +PB-once/receipt/undo evidence is
  // mandatory at the Foundry checkpoint (B-308 pending) and is NOT claimed by this test.
  const outsider = createTestActor({ name: "Not A Vanguard" });
  await assert.rejects(() => executeTipOfTheSpear({ actor: outsider, target: { actor: outsider }, helpers: {} }));

  const lv14 = vanguardActor(14);
  await assert.rejects(() => executeTipOfTheSpear({ actor: lv14, target: { actor: outsider }, directed: true, choice: 1, helpers: {} }),
    /Directed Engagement/, "directed choice requires level 15");
  await assert.rejects(() => executeTipOfTheSpear({ actor: lv14, target: { actor: outsider }, directed: true, choice: null, helpers: {} }),
    /./, "a directed tip must name outcome 1-6");

  const bearer = vanguardActor(15); // PB 5 — also passes the Directed Engagement gate
  const recipient = createTestActor({ name: "Ally", prof: 2 });
  const calls = { dice: [], tagged: [], temp: [] };
  const helpers = {
    dice: async (op, key, formula) => { calls.dice.push({ op: op.id, key, formula }); return 4; },
    tagged: async (actor, item, targetActor, id, options, metadata) => { calls.tagged.push({ actor, id, targetActor, metadata, item }); return { id, tagged: true }; },
    temporaryHP: async (...args) => { calls.temp.push(args); return { tempHp: true }; }
  };

  // Directed outcome 1: no d6 rolled; effect tagged once on the recipient with bearer-PB metadata.
  const result = await executeTipOfTheSpear({ actor: bearer, target: { actor: recipient }, directed: true, choice: 1, op: { id: "op-f11" }, helpers });
  assert.equal(calls.dice.length, 0, "a directed choice must not roll");
  assert.equal(result.outcome, 1);
  assert.equal(result.id, `op-f11:${recipient.uuid}:tip:0`);
  assert.equal(calls.tagged.length, 1, "the benefit is granted exactly once per use");
  assert.equal(calls.tagged[0].actor, bearer, "tagging runs from the giver");
  assert.equal(calls.tagged[0].targetActor, recipient);
  assert.equal(calls.tagged[0].metadata.kind, "tip1");
  assert.equal(calls.tagged[0].metadata.value, 5, "receipt metadata carries the giver's PB (5), not the recipient's (2)");
  assert.equal(calls.temp.length, 0);

  // Directed outcome 2: additive temp HP path, no effect tagging.
  const res2 = await executeTipOfTheSpear({ actor: bearer, target: { actor: recipient }, directed: true, choice: 2, op: { id: "op-f11b" }, helpers });
  assert.equal(res2.outcome, 2);
  assert.equal(res2.effect, null);
  assert.equal(calls.temp.length, 1);
  assert.equal(calls.temp[0][1], 4, "the rolled d6 amount flows to the additive temporaryHP helper");
  assert.equal(calls.temp[0][2], true, "Tip 2 temporary HP is additive (C3 L8003)");

  // Out-of-range directed choice is rejected.
  await assert.rejects(() => executeTipOfTheSpear({ actor: bearer, target: { actor: recipient }, directed: true, choice: 7, op: { id: "op-f11c" }, helpers }));

  // Plain tip: exactly one explicit 1d6.
  calls.dice.length = 0;
  const plain = await executeTipOfTheSpear({ actor: bearer, target: { actor: recipient }, op: { id: "op-f11d" }, helpers });
  assert.equal(calls.dice.length, 1, "one explicit outcome roll");
  assert.equal(calls.dice[0].formula, "1d6");
  assert.equal(plain.outcome, 4, "helper-provided roll resolves the outcome");
});

/* ============================================================ AC 12 — F12 (unit rehydration) */

test("F12 rehydration-idempotency: reload rebuild preserves features, choices, armed state; no duplication", async () => {
  // Unit-level rehydration. Scratch-server restart evidence is a checkpoint obligation,
  // NOT claimed by this test.
  const actor = vanguardActor(5, { name: "F12" });
  const preview = await previewVanguardSetup(actor);
  assert.ok(preview.creates.length > 0);
  await applyVanguardSetup(actor, { confirmed: true, contextKey: preview.contextKey });

  // Mid-encounter state worth preserving.
  const armedUse = freshUseId("quick");
  await actor.update({
    "flags.ak5e.vanguard.quickOffTheMarkArmed": { bonus: 2, useId: armedUse },
    "flags.ak5e.vanguard.nimbleTargets": ["Actor.someEnemy"],
    [`flags.ak5e.vanguardUses`]: { undo: [{ id: armedUse, command: "quickOffTheMark" }] }
  });

  // Simulate reload: rebuild a document from the serialized snapshot only.
  const snapshot = actor.toObject();
  const reloaded = createTestActor(snapshot);

  assert.equal(vanguardEnabled(reloaded), true, "enabled/configured state survives reload");
  assert.equal(vanguardLevel(reloaded), 5);
  assert.deepEqual(reloaded.flags.ak5e.vanguard.nimbleTargets, ["Actor.someEnemy"]);
  assert.equal(reloaded.flags.ak5e.vanguard.quickOffTheMarkArmed.useId, armedUse, "armed state survives without consumption");
  assert.equal(reloaded.flags.ak5e.vanguardUses.undo.length, 1, "receipts survive without duplication");

  // Re-setup after reload must keep every feature and create nothing new.
  const again = await previewVanguardSetup(reloaded);
  assert.deepEqual(again.creates, [], "rehydrated actor must not re-create any core feature");
  const keptCount = again.kept.length;
  assert.ok(keptCount >= 6, `expected the core features to be kept, got ${keptCount}`);
  const appliedAgain = await applyVanguardSetup(reloaded, { confirmed: true, contextKey: again.contextKey });
  assert.equal(appliedAgain.created.length, 0);

  // Landstrider managed effect exists exactly once on the live document; authored
  // effect data preserved. (The fixture's Item.toObject does not serialize ActiveEffect
  // `changes`, so post-reload assertions cover managed-effect IDENTITY only —
  // a mock-fidelity limitation, not a production claim.)
  const liveLandstrider = [...actor.items.values()].find(i => i.flags?.ak5e?.chapterThreeId === "class-feature-vanguard-1st-level-landstrider-2798");
  const liveManaged = [...liveLandstrider.effects.values()].filter(e => e.flags?.ak5e?.vanguardManagedEffect === "landstrider-speed");
  assert.equal(liveManaged.length, 1, "one managed walking-speed effect on the live document");
  assert.equal(Number(liveManaged[0].changes[0].value), 10);
  assert.equal(liveManaged[0].transfer, true, "managed effect is transferred/authored intact");

  const landstrider = [...reloaded.items.values()].find(i => i.flags?.ak5e?.chapterThreeId === "class-feature-vanguard-1st-level-landstrider-2798");
  assert.ok(landstrider, "Landstrider feature survives reload");
  const managed = [...landstrider.effects.values()].filter(e => e.flags?.ak5e?.vanguardManagedEffect === "landstrider-speed");
  assert.equal(managed.length, 1, "managed-effect identity survives reload exactly once");
  assert.deepEqual(again.effectUpdates, [], "rehydration preview must not queue duplicate managed effects");
  const featureItemCount = [...reloaded.items.values()].filter(i => i.flags?.ak5e?.vanguardFeature).length;
  assert.equal(featureItemCount, appliedAgain.kept.length, "no orphan duplicate feature items");
});
