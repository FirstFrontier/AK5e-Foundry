import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import {
  isLiberator,
  defineLiberatorPools,
  registerLiberatorHooks,
  guideTheMassesBonus,
  flashOfAngerFormula,
  hasRisingTide,
  risingTideChargingMethods,
  isRevolutionActive,
  hasTimeToAct,
  hasChampionOfTheWorthy,
  shieldOfBeliefTHP,
  liberatorPreRollDamage,
  gainResource
} from "../scripts/liberator-features.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";
import { martialDC } from "../scripts/guard-rules.mjs";
import { getPool } from "../scripts/resource-pools.mjs";

function setupWorld(combat = null) {
  const documents = world(combat);
  registerLiberatorHooks();
  return documents;
}

const use = (actor, command, data = {}, id = "lib-1") =>
  guardUses.command(actor, command, { confirmed: true, ...data }, id);

const undo = (actor, useId, id = "undo-1") =>
  guardUses.command(actor, "undoUse", { useId }, id);

async function anyway(actor, command, data = {}, id = "lib-1") {
  try {
    return await use(actor, command, data, id);
  } catch (error) {
    if (error.name !== "AK5eWarnings") throw error;
    return use(actor, command, { ...data, overrides: error.warnings.map(w => w.id) }, id);
  }
}

test("Liberator identification and pool definitions", () => {
  setupWorld();
  const liberator = guardFixture({ level: 5, branch: "liberator" });
  assert.equal(isLiberator(liberator), true);

  const centurion = guardFixture({ level: 5, branch: "centurion" });
  assert.equal(isLiberator(centurion), false);

  const nonGuard = guardFixture({ level: 5, branch: "liberator", enabled: false });
  assert.equal(isLiberator(nonGuard), false);

  // Check Liberty pool (max 6, initial 0)
  const libertyPool = getPool(liberator, "liberty");
  assert.equal(libertyPool.max, 6);
  assert.equal(libertyPool.value, 0);

  // Check Révolution pool at level 17
  const lib17 = guardFixture({ level: 17, branch: "liberator" });
  const revPool = getPool(lib17, "revolution");
  assert.equal(revPool.max, 1);
  assert.equal(revPool.value, 1);
});

test("Liberty combat inaction generates Liberty with combat and inaction validation", async () => {
  setupWorld(); // out of combat
  const actor = guardFixture({ level: 5, branch: "liberator" });

  // Out of combat: warns 'combat'
  await assert.rejects(use(actor, "libertyInaction", {}, "inaction-1"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "combat"));
    return true;
  });

  // "Use anyway" overrides and gains 1 Liberty
  const overRes = await anyway(actor, "libertyInaction", {}, "inaction-over");
  assert.equal(overRes.libertyGained, 1);
  assert.equal(getPool(actor, "liberty").value, 1);

  // In combat (combat started):
  const combatMock = { started: true, id: "combat1", round: 1, turn: 0 };
  setupWorld(combatMock);
  const combatActor = guardFixture({ level: 5, branch: "liberator" });

  // If acted/attacked: warns 'inaction'
  await assert.rejects(use(combatActor, "libertyInaction", { attacked: true }, "inaction-atk"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "inaction"));
    return true;
  });

  // Clean inaction in combat: gains 1 Liberty
  const cleanRes = await use(combatActor, "libertyInaction", {}, "inaction-clean");
  assert.equal(cleanRes.libertyGained, 1);
  assert.equal(getPool(combatActor, "liberty").value, 1);

  // Undo removes the Liberty granted
  await undo(combatActor, "inaction-clean");
  assert.equal(getPool(combatActor, "liberty").value, 0);
});

test("Guide the Masses: Advocate, Empower, Uplift calculations and range gating", async () => {
  const documents = setupWorld();
  const actor = guardFixture({ level: 5, branch: "liberator" });
  actor.system.attributes.prof = 3;

  // Add essence feat item to source so ActiveEffects can attach
  const featItem = {
    id: "essence",
    uuid: `${actor.uuid}.Item.essence`,
    parent: actor,
    name: "Essence of the Liberator",
    type: "feat",
    flags: { ak5e: { chapterThreeId: "subclass-feature-guard-liberator-1st-level-essence-of-the-liberator-1175" } }
  };
  actor.items.set("essence", featItem);

  const ally = {
    uuid: "Actor.ally1",
    id: "ally1",
    name: "Ally Operator",
    documentName: "Actor",
    isOwner: true,
    effects: new Map(),
    items: new Map(),
    system: { attributes: { hp: { value: 30, max: 30 } } },
    getFlag() {},
    async update() { return this; },
    createEmbeddedDocuments: async () => [{ id: "eff-gtm", update: async () => {} }]
  };
  documents.set(ally.uuid, ally);

  // 1. Advocate mode: max(2*PB, 2*Liberty). PB=3, Liberty=0 -> 6 bonus
  assert.equal(guideTheMassesBonus(actor, "advocate"), 6);

  // Set Liberty to 4 -> max(6, 8) = 8 bonus
  actor.flags.ak5e.resourcePools.liberty = { value: 4 };
  assert.equal(guideTheMassesBonus(actor, "advocate"), 8);

  // 2. Empower mode: max(PB, Liberty). PB=3, Liberty=1 -> 3. Liberty=5 -> 5
  actor.flags.ak5e.resourcePools.liberty = { value: 1 };
  assert.equal(guideTheMassesBonus(actor, "empower"), 3);
  actor.flags.ak5e.resourcePools.liberty = { value: 5 };
  assert.equal(guideTheMassesBonus(actor, "empower"), 5);

  // 3. Uplift mode: max(PB, Liberty). PB=3, Liberty=2 -> 3. Liberty=6 -> 6
  actor.flags.ak5e.resourcePools.liberty = { value: 2 };
  assert.equal(guideTheMassesBonus(actor, "uplift"), 3);
  actor.flags.ak5e.resourcePools.liberty = { value: 6 };
  assert.equal(guideTheMassesBonus(actor, "uplift"), 6);

  // Reset Liberty to 0
  actor.flags.ak5e.resourcePools.liberty = { value: 0 };

  // 4. Range gating: Level 5 max range is 20 ft. Distance 25 ft warns 'range'.
  await assert.rejects(use(actor, "guideTheMasses", { mode: "advocate", targetUuid: ally.uuid, distance: 25 }, "gtm-range"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "range"));
    return true;
  });

  // Successful Guide the Masses (Advocate, distance 15 ft)
  const resAdv = await use(actor, "guideTheMasses", { mode: "advocate", targetUuid: ally.uuid, distance: 15 }, "gtm-ok");
  assert.equal(resAdv.mode, "advocate");
  assert.equal(resAdv.bonus, 6);
  assert.equal(resAdv.libertyGained, 1);
  assert.equal(getPool(actor, "liberty").value, 1);

  // Receipt inspection: target queued
  const receipt = guardUses.receipt(actor, "gtm-ok");
  assert.equal(receipt.targets.length, 1);
  assert.equal(receipt.targets[0].uuid, ally.uuid);
  assert.equal(receipt.targets[0].kind, "effect");

  // Undo reverses the +1 Liberty
  await undo(actor, "gtm-ok");
  assert.equal(getPool(actor, "liberty").value, 0);

  // 5. Level 10 Far Reaching Guidance (40 ft range)
  const actor10 = guardFixture({ level: 10, branch: "liberator" });
  actor10.items.set("essence", { ...featItem, parent: actor10, uuid: `${actor10.uuid}.Item.essence` });
  const res10 = await use(actor10, "guideTheMasses", { mode: "empower", targetUuid: ally.uuid, distance: 35 }, "gtm-40");
  assert.equal(res10.maxRange, 40);

  // Distance 45 ft at level 10 warns 'range'
  await assert.rejects(use(actor10, "guideTheMasses", { mode: "empower", targetUuid: ally.uuid, distance: 45 }, "gtm-45"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "range"));
    return true;
  });
});

test("Guide the Masses: 7th level Bonus Action and 17th level Champion of the Worthy free action", async () => {
  const documents = setupWorld({ started: true, id: "combat1", round: 1, turn: 0 });
  const actor5 = guardFixture({ level: 5, branch: "liberator" });

  const featItem = {
    id: "essence",
    uuid: "Item.essence",
    parent: null,
    name: "Essence of the Liberator",
    type: "feat",
    flags: { ak5e: { chapterThreeId: "subclass-feature-guard-liberator-1st-level-essence-of-the-liberator-1175" } }
  };

  const ally1 = { uuid: "Actor.ally1", id: "ally1", name: "Ally 1", documentName: "Actor", isOwner: true, effects: new Map(), items: new Map(), system: {}, getFlag() {}, async update() { return this; }, createEmbeddedDocuments: async () => [{ id: "eff1", update: async () => {} }] };
  const ally2 = { uuid: "Actor.ally2", id: "ally2", name: "Ally 2", documentName: "Actor", isOwner: true, effects: new Map(), items: new Map(), system: {}, getFlag() {}, async update() { return this; }, createEmbeddedDocuments: async () => [{ id: "eff2", update: async () => {} }] };
  documents.set(ally1.uuid, ally1);
  documents.set(ally2.uuid, ally2);

  // Level 5 attempting Bonus Action warns 'level'
  await assert.rejects(use(actor5, "guideTheMasses", { bonusAction: true, targetUuid: ally1.uuid }, "gtm-ba-5"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "level"));
    return true;
  });

  // Level 7 attempting Bonus Action without prior Action use warns 'action'
  const actor7 = guardFixture({ level: 7, branch: "liberator" });
  actor7.items.set("essence", { ...featItem, parent: actor7 });
  await assert.rejects(use(actor7, "guideTheMasses", { bonusAction: true, targetUuid: ally1.uuid }, "gtm-ba-noact"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "action"));
    return true;
  });

  // Level 7 uses Action on ally1
  await use(actor7, "guideTheMasses", { mode: "advocate", targetUuid: ally1.uuid }, "gtm-act-1");

  // Bonus Action on same target (ally1) warns 'target'
  await assert.rejects(use(actor7, "guideTheMasses", { bonusAction: true, targetUuid: ally1.uuid }, "gtm-ba-sametgt"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "target"));
    return true;
  });

  // Bonus Action on different target (ally2) succeeds
  const resBA = await use(actor7, "guideTheMasses", { bonusAction: true, mode: "empower", targetUuid: ally2.uuid }, "gtm-ba-ok");
  assert.equal(resBA.mode, "empower");
  assert.equal(resBA.libertyGained, 0); // Bonus Action does not generate Liberty

  // Level 17 Champion of the Worthy free action
  const actor17 = guardFixture({ level: 17, branch: "liberator" });
  actor17.items.set("essence", { ...featItem, parent: actor17 });
  // Activate Révolution 10-minute benefits
  actor17.flags.ak5e.guard.liberator = { revolution: { active: true } };
  assert.equal(hasChampionOfTheWorthy(actor17), true);

  const resFree = await use(actor17, "guideTheMasses", { free: true, mode: "uplift", targetUuid: ally1.uuid }, "gtm-free-1");
  assert.equal(resFree.mode, "uplift");
  // Time to Act adds +1 -> 2 Liberty gained
  assert.equal(resFree.libertyGained, 2);

  // Calling free action twice on same turn warns 'frequency'
  await assert.rejects(use(actor17, "guideTheMasses", { free: true, mode: "uplift", targetUuid: ally2.uuid }, "gtm-free-2"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "frequency"));
    return true;
  });
});

test("Flash of Anger: d6 vs d10 scaling, no crit multiplication, kill refund, and 13th splash", async () => {
  const documents = setupWorld();
  const actor5 = guardFixture({ level: 5, branch: "liberator" });
  actor5.flags.ak5e.resourcePools.liberty = { value: 3 };

  // 1. Level 5: spends 2 Liberty -> 2d6 damage formula
  assert.equal(flashOfAngerFormula(actor5, 2), "2d6");
  const res5 = await use(actor5, "flashOfAnger", { liberty: 2 }, "foa-1");
  assert.equal(res5.damageFormula, "2d6");
  assert.equal(res5.dieSize, 6);
  assert.equal(res5.libertySpent, 2);
  assert.equal(getPool(actor5, "liberty").value, 1);

  const receipt = guardUses.receipt(actor5, "foa-1");
  assert.equal(receipt.formula, "2d6");
  assert.ok(receipt.summary.includes("cannot crit"));

  // Undo restores spent Liberty
  await undo(actor5, "foa-1");
  assert.equal(getPool(actor5, "liberty").value, 3);

  // 2. Shortfall warning: requesting 4 Liberty when 3 remain warns 'liberty'
  await assert.rejects(use(actor5, "flashOfAnger", { liberty: 4 }, "foa-short"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "liberty"));
    return true;
  });

  // "Use anyway" clamps at 0 and reports shortfall
  const overRes = await anyway(actor5, "flashOfAnger", { liberty: 4 }, "foa-over");
  assert.equal(getPool(actor5, "liberty").value, 0);
  const overReceipt = guardUses.receipt(actor5, "foa-over");
  assert.ok(overReceipt.shortfalls.some(s => s.includes("Liberty short by 1")));

  // 3. Kill refund: spends 2 Liberty with kill: true -> refunds 1 Liberty
  actor5.flags.ak5e.resourcePools.liberty = { value: 3 };
  const resKill = await use(actor5, "flashOfAnger", { liberty: 2, kill: true }, "foa-kill");
  assert.equal(resKill.libertySpent, 2);
  assert.equal(resKill.libertyRefunded, 1);
  assert.equal(resKill.netSpent, 1);
  assert.equal(getPool(actor5, "liberty").value, 2); // 3 - 2 + 1 = 2

  // Undo restores cleanly
  await undo(actor5, "foa-kill");
  assert.equal(getPool(actor5, "liberty").value, 3);

  // 4. Level 10 Praxis Improved Liberty: die size is d10
  const actor10 = guardFixture({ level: 10, branch: "liberator" });
  actor10.flags.ak5e.resourcePools.liberty = { value: 3 };
  assert.equal(flashOfAngerFormula(actor10, 3), "3d10");
  const res10 = await use(actor10, "flashOfAnger", { liberty: 3 }, "foa-10");
  assert.equal(res10.damageFormula, "3d10");
  assert.equal(res10.dieSize, 10);

  // 5. Level 13 Smouldering Anger / Caught in the Crossfire
  const actor13 = guardFixture({ level: 13, branch: "liberator" });
  actor13.flags.ak5e.resourcePools.liberty = { value: 3 };

  const featItem13 = {
    id: "essence",
    uuid: `${actor13.uuid}.Item.essence`,
    parent: actor13,
    name: "Essence of the Liberator",
    type: "feat",
    flags: { ak5e: { chapterThreeId: "subclass-feature-guard-liberator-1st-level-essence-of-the-liberator-1175" } }
  };
  actor13.items.set("essence", featItem13);

  const foeSecondary = {
    uuid: "Actor.foeSec",
    id: "foeSec",
    name: "Goblin Archer",
    documentName: "Actor",
    isOwner: true,
    effects: new Map(),
    items: new Map(),
    system: {},
    getFlag() {},
    async update() { return this; },
    createEmbeddedDocuments: async () => [{ id: "eff-sec", update: async () => {} }]
  };
  documents.set(foeSecondary.uuid, foeSecondary);

  // Secondary splash within 10 ft
  const res13 = await use(actor13, "flashOfAnger", {
    liberty: 2,
    damageType: "force",
    secondaryTargetUuid: foeSecondary.uuid,
    secondaryDistance: 8
  }, "foa-13");
  assert.equal(res13.damageType, "force");
  assert.equal(res13.secondaryTargetUuid, foeSecondary.uuid);

  const receipt13 = guardUses.receipt(actor13, "foa-13");
  assert.ok(receipt13.summary.includes("Caught in the Crossfire"));
  assert.ok(receipt13.targets.some(t => t.uuid === foeSecondary.uuid));

  // Secondary splash beyond 10 ft warns 'secondaryRange'
  await assert.rejects(use(actor13, "flashOfAnger", {
    liberty: 1,
    secondaryTargetUuid: foeSecondary.uuid,
    secondaryDistance: 15
  }, "foa-far"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "secondaryRange"));
    return true;
  });
});

test("The Right Moment consumes all Liberty and enhances damage via hooks", async () => {
  setupWorld();
  const actor5 = guardFixture({ level: 5, branch: "liberator" });
  actor5.flags.ak5e.resourcePools.liberty = { value: 5 };

  // Consumes all 5 Liberty at level 5: save skills +5d6, melee weapon +2d6
  const res5 = await use(actor5, "theRightMoment", {}, "trm-1");
  assert.equal(res5.consumed, 5);
  assert.equal(res5.saveFormula, "5d6");
  assert.equal(res5.meleeFormula, "2d6");
  assert.equal(getPool(actor5, "liberty").value, 0);

  // Hook test: Melee weapon attack roll gets +2d6
  const meleeRollConfig = {
    subject: { actor: actor5, actionType: "mwak" },
    rolls: [{ parts: ["1d8", "4"] }]
  };
  liberatorPreRollDamage(meleeRollConfig);
  assert.deepEqual(meleeRollConfig.rolls[0].parts, ["1d8", "4", "2d6"]);

  // Hook test: Saving throw Operator Skill roll gets +5d6
  const saveRollConfig = {
    subject: { actor: actor5, actionType: "save", item: { flags: { ak5e: { operatorSkill: true } } } },
    rolls: [{ parts: ["3d10"] }]
  };
  liberatorPreRollDamage(saveRollConfig);
  assert.deepEqual(saveRollConfig.rolls[0].parts, ["3d10", "5d6"]);

  // Clear The Right Moment
  await use(actor5, "clearRightMoment", {}, "trm-clear");
  const clearedRoll = { subject: { actor: actor5, actionType: "mwak" }, rolls: [{ parts: ["1d8"] }] };
  liberatorPreRollDamage(clearedRoll);
  assert.deepEqual(clearedRoll.rolls[0].parts, ["1d8"]);

  // Undo restores the 5 consumed Liberty
  await undo(actor5, "trm-1");
  assert.equal(getPool(actor5, "liberty").value, 5);

  // Level 10 Praxis Improved Liberty: die size is d10
  const actor10 = guardFixture({ level: 10, branch: "liberator" });
  actor10.flags.ak5e.resourcePools.liberty = { value: 4 };
  const res10 = await use(actor10, "theRightMoment", {}, "trm-10");
  assert.equal(res10.consumed, 4);
  assert.equal(res10.saveFormula, "4d10");
  assert.equal(res10.meleeFormula, "2d10");
});

test("Rising Tide grants Automatic, Offensive, and Defensive charging methods at level 4", () => {
  setupWorld();
  const actor3 = guardFixture({ level: 3, branch: "liberator" });
  assert.equal(hasRisingTide(actor3), false);
  assert.deepEqual(risingTideChargingMethods(actor3), []);

  const actor4 = guardFixture({ level: 4, branch: "liberator" });
  assert.equal(hasRisingTide(actor4), true);
  assert.deepEqual(risingTideChargingMethods(actor4), ["automatic", "offensive", "defensive"]);
});

test("Praxis: Face Me spends 2 Aggression, casts Compelled Duel with Martial DC", async () => {
  setupWorld();
  const actor5 = guardFixture({ level: 5, branch: "liberator" });
  // Below level 10 warns 'level'
  await assert.rejects(use(actor5, "faceMe", {}, "fm-5"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "level"));
    return true;
  });

  const actor10 = guardFixture({ level: 10, branch: "liberator", aggression: 4 });
  // STR mod = 4, PB = 4 -> Martial DC = 8 + 4 + 4 = 16
  actor10.system.attributes.prof = 4;
  assert.equal(martialDC(actor10), 16);

  const res10 = await use(actor10, "faceMe", { targetUuid: "Actor.target1" }, "fm-10");
  assert.equal(res10.aggressionSpent, 2);
  assert.equal(res10.martialDC, 16);
  assert.equal(res10.targetUuid, "Actor.target1");
  assert.equal(actor10.flags.ak5e.resourcePools.aggression.value, 2);

  const receipt = guardUses.receipt(actor10, "fm-10");
  assert.ok(receipt.summary.includes("Martial DC 16"));
  assert.ok(receipt.summary.includes("Compelled Duel"));

  // Undo restores 2 Aggression
  await undo(actor10, "fm-10");
  assert.equal(actor10.flags.ak5e.resourcePools.aggression.value, 4);
});

test("Révolution (17th): 1/LR Action, 20-ft burst save vs Martial DC, 1d12 per Liberty, flags 10-minute benefits", async () => {
  setupWorld();
  const actor10 = guardFixture({ level: 10, branch: "liberator" });
  // Below level 17 warns 'level'
  await assert.rejects(use(actor10, "revolution", {}, "rev-10"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "level"));
    return true;
  });

  const actor17 = guardFixture({ level: 17, branch: "liberator" });
  actor17.system.attributes.prof = 6;
  // STR mod = 4, PB = 6 -> Martial DC = 8 + 6 + 4 = 18
  assert.equal(martialDC(actor17), 18);

  actor17.flags.ak5e.resourcePools.liberty = { value: 5 };
  assert.equal(getPool(actor17, "revolution").value, 1);

  // Execute Révolution
  const resRev = await use(actor17, "revolution", {}, "rev-17");
  assert.equal(resRev.libertyExpended, 5);
  assert.equal(resRev.martialDC, 18);
  assert.equal(resRev.damageFormula, "5d12");
  assert.equal(getPool(actor17, "revolution").value, 0);
  assert.equal(getPool(actor17, "liberty").value, 0);

  // 10-minute benefits active
  assert.equal(isRevolutionActive(actor17), true);
  assert.equal(hasTimeToAct(actor17), true);
  assert.equal(hasChampionOfTheWorthy(actor17), true);
  assert.equal(shieldOfBeliefTHP(actor17), 17);

  // Turn start Shield of Belief grants 17 THP
  const resShield = await use(actor17, "shieldOfBelief", {}, "sob-1");
  assert.equal(resShield.thpGranted, 17);
  assert.equal(actor17.system.attributes.hp.temp, 17);

  // Time to Act: gaining Liberty awards +2 instead of +1
  const resGain = await use(actor17, "libertyInaction", { inCombat: true }, "time-to-act-gain");
  assert.equal(resGain.libertyGained, 2);
  assert.equal(getPool(actor17, "liberty").value, 2);

  // Attempting Révolution again without rest warns 'revolution'
  await assert.rejects(use(actor17, "revolution", {}, "rev-again"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "revolution"));
    return true;
  });

  // End Révolution benefits
  await use(actor17, "endRevolution", {}, "rev-end");
  assert.equal(isRevolutionActive(actor17), false);
  assert.equal(hasTimeToAct(actor17), false);

  // Undo time-to-act-gain
  await undo(actor17, "time-to-act-gain");
  assert.equal(getPool(actor17, "liberty").value, 0);

  // Undo Révolution restores pool use and spent Liberty
  await undo(actor17, "rev-17");
  assert.equal(getPool(actor17, "revolution").value, 1);
  assert.equal(getPool(actor17, "liberty").value, 5);
});

test("Table-play adherence: manual roll cards, shortfalls, and receipts", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "liberator" });
  actor.flags.ak5e.resourcePools.liberty = { value: 3 };

  // 1. Flash of Anger roll formula is set for manual rolling (no auto-roll)
  await use(actor, "flashOfAnger", { liberty: 2 }, "card-test");
  const receipt = guardUses.receipt(actor, "card-test");
  assert.equal(receipt.formula, "2d6");
  assert.equal(receipt.status, "awaitingRoll");

  // 2. Receipt persistence in undo stack
  const undoStack = actor.flags.ak5e.guardUses.undo;
  assert.ok(Array.isArray(undoStack));
  const found = undoStack.find(r => r.id === "card-test");
  assert.ok(found);
  assert.equal(found.command, "flashOfAnger");
});
