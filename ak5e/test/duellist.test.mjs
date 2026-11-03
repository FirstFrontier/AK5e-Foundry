import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import {
  isDuellist,
  isDuellingBladeWeapon,
  isWieldingHeavyMeleeWeapon,
  defineDuellistPools,
  registerDuellistHooks,
  duellistPreRollAttack,
  duellistPreRollDamage
} from "../scripts/duellist-features.mjs";
import { registerGuardFeatureHooks } from "../scripts/guard-features.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";
import { getPool } from "../scripts/resource-pools.mjs";

function setupWorld(combat = null) {
  const documents = world(combat);
  registerGuardFeatureHooks();
  registerDuellistHooks();
  return documents;
}

const use = (actor, command, data = {}, id = "duel-1") =>
  guardUses.command(actor, command, { confirmed: true, ...data }, id);

async function anyway(actor, command, data = {}, id = "duel-1") {
  try {
    return await use(actor, command, data, id);
  } catch (error) {
    if (error.name !== "AK5eWarnings") throw error;
    return use(actor, command, { ...data, overrides: error.warnings.map(w => w.id) }, id);
  }
}

test("Duellist identification", () => {
  setupWorld();
  const duellist = guardFixture({ level: 5, branch: "duellist" });
  assert.equal(isDuellist(duellist), true);

  const centurion = guardFixture({ level: 5, branch: "centurion" });
  assert.equal(isDuellist(centurion), false);

  const unconfigured = guardFixture({ level: 5, branch: null, enabled: false });
  assert.equal(isDuellist(unconfigured), false);
});

test("Duelling Blades: Greatswords and Polearms gain Finesse", () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "duellist" });
  actor.system.abilities.str.mod = 2;
  actor.system.abilities.dex.mod = 4;

  const greatsword = {
    name: "Greatsword",
    system: {
      equipped: true,
      actionType: "mwak",
      type: { value: "melee", baseItem: "greatsword" },
      properties: new Set(["two", "hvy"])
    }
  };
  const halberd = {
    name: "Halberd",
    system: {
      equipped: true,
      actionType: "mwak",
      type: { value: "melee", baseItem: "halberd" },
      properties: new Set(["two", "hvy", "reach"])
    }
  };
  const longsword = {
    name: "Longsword",
    system: {
      equipped: true,
      actionType: "mwak",
      type: { value: "melee", baseItem: "longsword" },
      properties: new Set(["ver"])
    }
  };

  assert.equal(isDuellingBladeWeapon(greatsword), true);
  assert.equal(isDuellingBladeWeapon(halberd), true);
  assert.equal(isDuellingBladeWeapon(longsword), false);

  // Attack roll hook with Greatsword: gains "fin" property and DEX bonus (+2 over STR)
  const attackConfig = {
    subject: { actor, item: greatsword, actionType: "mwak", ability: "str" },
    rolls: [{ parts: ["1d20", "2", "3"] }]
  };
  duellistPreRollAttack(attackConfig);
  assert.ok(greatsword.system.properties.has("fin"));
  // DEX (4) - STR (2) = +2 diff pushed to parts
  assert.equal(attackConfig.rolls[0].parts.includes("2"), true);

  // Damage roll hook with Greatsword: DEX bonus (+2 over STR) pushed to parts
  const damageConfig = {
    subject: { actor, item: greatsword, actionType: "mwak", ability: "str" },
    rolls: [{ parts: ["2d6", "2"] }]
  };
  duellistPreRollDamage(damageConfig);
  assert.equal(damageConfig.rolls[0].parts.includes("2"), true);

  // Attack roll hook with Longsword: no "fin" property added
  const nonBladeConfig = {
    subject: { actor, item: longsword, actionType: "mwak", ability: "str" },
    rolls: [{ parts: ["1d20", "2", "3"] }]
  };
  duellistPreRollAttack(nonBladeConfig);
  assert.equal(longsword.system.properties.has("fin"), false);
});

test("Rules of Engagement: Opponent declaration and Points ledger", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "duellist" });

  // With a Heavy Melee weapon equipped: gains base +1 point
  actor.items.set("gs", {
    id: "gs",
    type: "weapon",
    name: "Greatsword",
    system: {
      equipped: true,
      actionType: "mwak",
      type: { value: "melee", baseItem: "greatsword" },
      properties: new Set(["two", "hvy"])
    }
  });
  assert.equal(isWieldingHeavyMeleeWeapon(actor), true);

  const res1 = await use(actor, "declareOpponent", { targetUuid: "Actor.foe1", targetName: "Rebel Leader" }, "dec-1");
  assert.equal(res1.pointsGained, 1);
  assert.equal(res1.totalPoints, 1);
  assert.equal(actor.flags.ak5e.guard.duellist.opponent.name, "Rebel Leader");
  assert.equal(getPool(actor, "duellistPoints").value, 1);

  // Declare with a non-heavy weapon: gains base 1 + 1 non-heavy = 2 points
  actor.items.delete("gs");
  actor.items.set("rapier", {
    id: "rapier",
    type: "weapon",
    name: "Rapier",
    system: {
      equipped: true,
      actionType: "mwak",
      type: { value: "melee", baseItem: "rapier" },
      properties: new Set(["fin"])
    }
  });
  assert.equal(isWieldingHeavyMeleeWeapon(actor), false);

  const res2 = await use(actor, "declareOpponent", { targetUuid: "Actor.foe2", targetName: "Bandit" }, "dec-2");
  assert.equal(res2.pointsGained, 2);
  // Level 5 (below 17): previous points reset on declaring new opponent
  assert.equal(res2.totalPoints, 2);
  assert.equal(getPool(actor, "duellistPoints").value, 2);

  // Turn start ledger condition (+1 damaged opponent, +1 not damaged by opponent)
  const res3 = await use(actor, "duelTurnStart", { damagedOpponent: true, opponentDamagedSelf: false }, "turn-1");
  assert.equal(res3.gained, 2);
  assert.equal(res3.totalPoints, 4);
  assert.equal(getPool(actor, "duellistPoints").value, 4);

  // Level 10 Duellist's Advance: declaration base is 2 (+1 non-heavy = 3)
  const actor10 = guardFixture({ level: 10, branch: "duellist" });
  const res10 = await use(actor10, "declareOpponent", { targetUuid: "Actor.boss", targetName: "Boss" }, "dec-10");
  assert.equal(res10.pointsGained, 3);
  assert.equal(res10.totalPoints, 3);
});

test("Parry: 1st Forestall per round costs 0 reaction and 1 fewer Aggression (min 0)", async () => {
  setupWorld();
  const duellist = guardFixture({ level: 5, branch: "duellist", aggression: 4 });

  // First Forestall in the round: Parry active
  // amount = 1 -> costs Math.max(0, 1 - 1) = 0 Aggression, 0 Reaction!
  const resParry = await use(duellist, "forestall", { amount: 1, round: 1 }, "for-1");
  assert.equal(resParry.isParry, true);
  assert.equal(resParry.aggressionSpent, 0);
  assert.equal(resParry.acBonus, 3); // PB = 3 for level 5
  assert.equal(getPool(duellist, "aggression").value, 4); // 0 spent
  const receipt1 = guardUses.receipt(duellist, "for-1");
  assert.equal(receipt1.reaction.requested, false);

  // Second Forestall in the same round: Parry NOT active (costs full 1 Aggression, 1 Reaction)
  const resSecond = await use(duellist, "forestall", { amount: 1, round: 1 }, "for-2");
  assert.equal(resSecond.isParry, false);
  assert.equal(resSecond.aggressionSpent, 1);
  assert.equal(getPool(duellist, "aggression").value, 3);
  const receipt2 = guardUses.receipt(duellist, "for-2");
  assert.equal(receipt2.reaction.requested, true);

  // Next round (round 2): Parry is available again!
  const resRound2 = await use(duellist, "forestall", { amount: 2, round: 2 }, "for-3");
  assert.equal(resRound2.isParry, true);
  // amount = 2 -> costs Math.max(0, 2 - 1) = 1 Aggression, 0 Reaction
  assert.equal(resRound2.aggressionSpent, 1);
  assert.equal(resRound2.acBonus, 6);
  assert.equal(getPool(duellist, "aggression").value, 2);
  const receipt3 = guardUses.receipt(duellist, "for-3");
  assert.equal(receipt3.reaction.requested, false);

  // Zero-reaction test: Parry succeeds even when duellist has 0 reactions remaining
  duellist.flags.ak5e.reactionBudget = { available: 0, spent: 1 };
  const resParryNoRx = await use(duellist, "forestall", { amount: 1, round: 3 }, "for-4");
  assert.equal(resParryNoRx.isParry, true);
  assert.equal(resParryNoRx.aggressionSpent, 0);

  // Subsequent forestall in round 3 fails/warns for no reaction
  await assert.rejects(use(duellist, "forestall", { amount: 1, round: 3 }, "for-5"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "reaction"));
    return true;
  });
});

test("Riposte: Reaction on melee miss spends 1 Aggression", async () => {
  setupWorld();
  const duellist = guardFixture({ level: 5, branch: "duellist", aggression: 4 });

  const res = await use(duellist, "riposte", {}, "rip-1");
  assert.equal(res.aggressionSpent, 1);
  assert.equal(res.reactionSpent, true);
  assert.equal(getPool(duellist, "aggression").value, 3);

  // Warning when 0 Aggression remains
  duellist.flags.ak5e.resourcePools.aggression.value = 0;
  await assert.rejects(use(duellist, "riposte", {}, "rip-warn"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "aggression"));
    return true;
  });

  // Overriding with Use anyway clamps at 0 and reports shortfall
  const overrideRes = await anyway(duellist, "riposte", {}, "rip-over");
  assert.equal(overrideRes.aggressionSpent, 1);
  assert.equal(getPool(duellist, "aggression").value, 0);
  const receipt = guardUses.receipt(duellist, "rip-over");
  assert.ok(receipt.shortfalls.some(s => s.includes("Aggression short by 1")));
});

test("Principles of Defence (4th Level): Lightning Reflexes, Punish Opening, Every Victory", async () => {
  setupWorld();
  // Level requirement enforcement: Level 3 character warns
  const lowActor = guardFixture({ level: 3, branch: "duellist", aggression: 4 });
  await assert.rejects(use(lowActor, "lightningReflexes", {}, "lr-low"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "level"));
    return true;
  });
  await assert.rejects(use(lowActor, "punishOpening", {}, "po-low"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "level"));
    return true;
  });

  // Level 4+ character
  const actor = guardFixture({ level: 4, branch: "duellist", aggression: 4 });

  // Lightning Reflexes: 1 Aggression, Reaction -> DEX save
  const lrRes = await use(actor, "lightningReflexes", {}, "lr-ok");
  assert.equal(lrRes.aggressionSpent, 1);
  assert.equal(lrRes.save, "dex");
  assert.equal(getPool(actor, "aggression").value, 3);

  // Punish Every Opening: 1 Aggression, NO Reaction expended
  const poRes = await use(actor, "punishOpening", {}, "po-ok");
  assert.equal(poRes.aggressionSpent, 1);
  assert.equal(poRes.reactionSpent, false);
  assert.equal(getPool(actor, "aggression").value, 2);
  const poReceipt = guardUses.receipt(actor, "po-ok");
  assert.equal(poReceipt.reaction.requested, false);

  // Every Victory: regains 1 Aggression, resets points below 17th level
  actor.flags.ak5e.resourcePools.duellistPoints = { value: 5, max: 10 };
  const evRes = await use(actor, "everyVictory", {}, "ev-ok");
  assert.equal(evRes.aggressionRegained, 1);
  assert.equal(getPool(actor, "aggression").value, 3);
  assert.equal(getPool(actor, "duellistPoints").value, 0); // Reset
});

test("All 9 Engagements: point costs, effects, and once-per-turn limit", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "duellist" });
  actor.flags.ak5e.resourcePools.duellistPoints = { value: 10, max: 10 };

  // 1. Analysis (0 points)
  const aRes = await use(actor, "engagementAnalysis", { turnKey: "c1:1:1" }, "eng-ana");
  assert.equal(aRes.pointsSpent, 0);
  assert.equal(getPool(actor, "duellistPoints").value, 10);
  assert.ok(actor.flags.ak5e.guard.duellist.analysis.active);

  // Once-per-turn frequency warning for same engagement
  await assert.rejects(use(actor, "engagementAnalysis", { turnKey: "c1:1:1" }, "eng-ana-rep"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "frequency"));
    return true;
  });

  // 2. Balestra (2 points)
  const bRes = await use(actor, "engagementBalestra", { turnKey: "c1:1:1" }, "eng-bal");
  assert.equal(bRes.pointsSpent, 2);
  assert.equal(bRes.reachBonus, 10);
  assert.equal(bRes.bypassesDR, true);
  assert.equal(getPool(actor, "duellistPoints").value, 8);

  // 3. Derobement (1 point)
  const dRes = await use(actor, "engagementDerobement", { turnKey: "c1:1:1" }, "eng-der");
  assert.equal(dRes.pointsSpent, 1);
  assert.equal(dRes.halvedDamage, true);
  assert.equal(dRes.disadvantageOnAttacks, true);
  assert.equal(getPool(actor, "duellistPoints").value, 7);

  // 4. Displacement (1 point)
  const dispRes = await use(actor, "engagementDisplacement", { turnKey: "c1:1:1" }, "eng-disp");
  assert.equal(dispRes.pointsSpent, 1);
  assert.equal(dispRes.retreatFeet, 10);
  assert.equal(getPool(actor, "duellistPoints").value, 6);

  // 5. En Garde (1 point, refunds reaction)
  const egRes = await use(actor, "engagementEnGarde", { turnKey: "c1:1:1" }, "eng-eg");
  assert.equal(egRes.pointsSpent, 1);
  assert.equal(egRes.reactionRefunded, true);
  assert.equal(getPool(actor, "duellistPoints").value, 5);

  // 6. Feint (1 point, advantage)
  const fRes = await use(actor, "engagementFeint", { turnKey: "c1:1:1" }, "eng-feint");
  assert.equal(fRes.pointsSpent, 1);
  assert.equal(fRes.grantAdvantage, true);
  assert.equal(getPool(actor, "duellistPoints").value, 4);

  // 7. Fleche (2 points, +Guard level damage)
  const flRes = await use(actor, "engagementFleche", { turnKey: "c1:1:1" }, "eng-fleche");
  assert.equal(flRes.pointsSpent, 2);
  assert.equal(flRes.damageBonus, 5); // Guard level 5
  assert.equal(getPool(actor, "duellistPoints").value, 2);

  // 8. Redoublement (1 point, reaction reroll)
  const rRes = await use(actor, "engagementRedoublement", { turnKey: "c1:1:1" }, "eng-redoub");
  assert.equal(rRes.pointsSpent, 1);
  assert.equal(rRes.reactionSpent, true);
  assert.equal(rRes.halvedDamage, true);
  assert.equal(getPool(actor, "duellistPoints").value, 1);

  // 9. Score (1 point, inflicts Bleeding)
  const sRes = await use(actor, "engagementScore", { turnKey: "c1:1:1" }, "eng-score");
  assert.equal(sRes.pointsSpent, 1);
  assert.equal(sRes.inflictsBleeding, true);
  assert.equal(getPool(actor, "duellistPoints").value, 0);

  // Warning when points insufficient: Balestra needs 2, 0 remain
  await assert.rejects(use(actor, "engagementBalestra", { turnKey: "c1:1:2" }, "eng-bal-warn"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "duellistPoints"));
    return true;
  });

  // Overriding clamps at 0 and records shortfall
  const clampedRes = await anyway(actor, "engagementBalestra", { turnKey: "c1:1:2" }, "eng-bal-clamp");
  assert.equal(clampedRes.pointsSpent, 2);
  assert.equal(getPool(actor, "duellistPoints").value, 0);
  const clampReceipt = guardUses.receipt(actor, "eng-bal-clamp");
  assert.ok(clampReceipt.shortfalls.some(s => s.includes("Duel Points short by 2")));
});

test("Grand Challenge (13th Level) and Coup de Grâce", async () => {
  setupWorld();
  // Level requirement check
  const actor10 = guardFixture({ level: 10, branch: "duellist" });
  await assert.rejects(use(actor10, "grandChallenge", {}, "gc-low"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "level"));
    return true;
  });
  await assert.rejects(use(actor10, "coupDeGrace", {}, "cdg-low"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "level"));
    return true;
  });

  const actor13 = guardFixture({ level: 13, branch: "duellist" });

  // Declare Grand Challenge: spends 1 use of pool
  const gcRes = await use(actor13, "grandChallenge", { targetUuid: "Actor.nemesis", targetName: "Nemesis" }, "gc-1");
  assert.equal(gcRes.active, true);
  assert.equal(getPool(actor13, "grandChallenge").value, 0);
  assert.equal(actor13.flags.ak5e.guard.duellist.grandChallenge.active, true);

  // Subsequent use warns pool exhausted
  await assert.rejects(use(actor13, "grandChallenge", {}, "gc-rep"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "grandChallenge"));
    return true;
  });

  // Coup de Grâce requires 10 Duel Points
  actor13.flags.ak5e.resourcePools.duellistPoints = { value: 7, max: 10 };
  await assert.rejects(use(actor13, "coupDeGrace", {}, "cdg-warn"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "duellistPoints"));
    return true;
  });

  // At 10 Duel Points: configures 8d8 damage card roll and ends Grand Challenge
  actor13.flags.ak5e.resourcePools.duellistPoints.value = 10;
  const cdgRes = await use(actor13, "coupDeGrace", {}, "cdg-ok");
  assert.equal(cdgRes.damageFormula, "8d8");
  assert.equal(cdgRes.grandChallengeEnded, true);
  assert.equal(actor13.flags.ak5e.guard.duellist.grandChallenge.active, false);

  const receipt = guardUses.receipt(actor13, "cdg-ok");
  assert.equal(receipt.formula, "8d8");
});

test("Master Duellist (17th Level): Retains points and free declaration", async () => {
  setupWorld();
  const master = guardFixture({ level: 17, branch: "duellist" });
  master.flags.ak5e.resourcePools.duellistPoints = { value: 6, max: 10 };

  // Free declaration: actionCost is "Free Action"
  // Retains existing points: 6 + 3 (level 17 non-heavy) = 9
  const resDec = await use(master, "declareOpponent", { targetUuid: "Actor.foe3", targetName: "New Foe" }, "dec-17");
  assert.equal(resDec.actionCost, "Free Action");
  assert.equal(resDec.totalPoints, 9);
  assert.equal(getPool(master, "duellistPoints").value, 9);

  // Every Victory retains points on defeat
  const resVic = await use(master, "everyVictory", {}, "ev-17");
  assert.equal(resVic.pointsRetained, true);
  assert.equal(getPool(master, "duellistPoints").value, 9); // Still 9! Not reset to 0
});

test("Encounter-window undo and receipt restoration", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "duellist", aggression: 4 });
  actor.flags.ak5e.resourcePools.duellistPoints = { value: 5, max: 10 };

  // Use Balestra (spends 2 points -> 3 remaining)
  await use(actor, "engagementBalestra", { turnKey: "c1:1:1" }, "undo-test");
  assert.equal(getPool(actor, "duellistPoints").value, 3);

  const receipt = guardUses.receipt(actor, "undo-test");
  assert.ok(receipt);
  assert.equal(receipt.status, "complete");

  // Undo the use: restores points to 5
  await guardUses.command(actor, "undoUse", { useId: "undo-test" }, "undo-op");
  assert.equal(getPool(actor, "duellistPoints").value, 5);
  const undoneReceipt = guardUses.receipt(actor, "undo-test");
  assert.equal(undoneReceipt.status, "undone");
});
