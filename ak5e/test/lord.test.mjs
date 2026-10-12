import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import {
  isLord,
  hasForceOfWill,
  defineLordPools,
  registerLordHooks,
  hasAuthority,
  isManifestationActive,
  manifestationDamageType,
  kingsDomainMode,
  isOverruledEligible,
  forceOfWillCategory,
  makeItSoBonus,
  getLordMark,
  setLordMark,
  clearLordMark,
  lordPreRollAttack,
  lordPreRollDamage,
  LORD_PLANS,
  FORCE_OF_WILL_CATEGORIES
} from "../scripts/lord-features.mjs";
import { registerGuardFeatureHooks } from "../scripts/guard-features.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";
import { martialDC } from "../scripts/guard-rules.mjs";
import { getPool, getPoolDefinition } from "../scripts/resource-pools.mjs";

function setupWorld(combat = null) {
  const documents = world(combat);
  registerGuardFeatureHooks();
  registerLordHooks();
  return documents;
}

const use = (actor, command, data = {}, id = "lord-1") =>
  guardUses.command(actor, command, { confirmed: true, ...data }, id);

const undo = (actor, useId, id = "undo-1") =>
  guardUses.command(actor, "undoUse", { useId }, id);

async function anyway(actor, command, data = {}, id = "lord-1") {
  try {
    return await use(actor, command, data, id);
  } catch (error) {
    if (error.name !== "AK5eWarnings") throw error;
    return use(actor, command, { ...data, overrides: error.warnings.map(w => w.id) }, id);
  }
}

/* ---------------------------------------------------------------- Tests */

test("Lord identification and pool definitions", () => {
  setupWorld();
  const lord = guardFixture({ level: 5, branch: "lord" });
  assert.equal(isLord(lord), true);

  const centurion = guardFixture({ level: 5, branch: "centurion" });
  assert.equal(isLord(centurion), false);

  const duellist = guardFixture({ level: 5, branch: "duellist" });
  assert.equal(isLord(duellist), false);

  const nonGuard = guardFixture({ level: 5, branch: "lord", enabled: false });
  assert.equal(isLord(nonGuard), false);

  // Manifestation pool: max = @prof (3 at level 5), initial = max, LR recovery
  const manifPool = getPool(lord, "manifestation");
  assert.equal(manifPool.max, 3);
  assert.equal(manifPool.value, 3);

  // Force of Will pool at level 5: does not apply below level 13
  assert.equal(hasForceOfWill(lord), false);
  const fowDef = getPoolDefinition("forceOfWill");
  assert.equal(fowDef.appliesTo(lord), false);

  // Force of Will pool at level 13: max = @prof (5 at level 13)
  const lordHigh = guardFixture({ level: 13, branch: "lord" });
  lordHigh.system.attributes.prof = 5;
  assert.equal(hasForceOfWill(lordHigh), true);
  assert.equal(fowDef.appliesTo(lordHigh), true);
  const fowPoolHigh = getPool(lordHigh, "forceOfWill");
  assert.equal(fowPoolHigh.max, 5);
  assert.equal(fowPoolHigh.value, 5);
});

test("Authority state: acquisition triggers, loss triggers, and Position of Power", async () => {
  setupWorld();
  const lord = guardFixture({ level: 5, branch: "lord" });
  assert.equal(hasAuthority(lord), false);

  // Gain Authority via eliteLeaderKill
  await use(lord, "toggleAuthority", { active: true, reason: "eliteLeaderKill" }, "auth-1");
  assert.equal(hasAuthority(lord), true);
  const receipt1 = guardUses.receipt(lord, "auth-1");
  assert.equal(receipt1.result.hasAuthority, true);
  assert.equal(receipt1.result.reason, "eliteLeaderKill");

  // Position of Power: Turn start 1d8 Temporary HP
  await use(lord, "authorityTurnStartTHP", {}, "thp-1");
  const thpReceipt = guardUses.receipt(lord, "thp-1");
  assert.equal(thpReceipt.formula, "1d8");
  assert.equal(thpReceipt.result.hasAuthority, true);

  // Loss of Authority via 0 HP
  await use(lord, "toggleAuthority", { active: false, reason: "zeroHp" }, "auth-2");
  assert.equal(hasAuthority(lord), false);

  // Position of Power warns when lacking Authority
  await assert.rejects(
    use(lord, "authorityTurnStartTHP", {}, "thp-2"),
    error => {
      assert.equal(error.name, "AK5eWarnings");
      assert.ok(error.warnings.some(w => w.id === "authority"));
      return true;
    }
  );

  // Other gain triggers: multipleKills, oneShotKill
  await use(lord, "toggleAuthority", { active: true, reason: "multipleKills" }, "auth-3");
  assert.equal(hasAuthority(lord), true);
  await use(lord, "toggleAuthority", { active: false, reason: "saveAffliction" }, "auth-4");
  assert.equal(hasAuthority(lord), false);

  await use(lord, "toggleAuthority", { active: true, reason: "oneShotKill" }, "auth-5");
  assert.equal(hasAuthority(lord), true);
  await use(lord, "toggleAuthority", { active: false, reason: "prone" }, "auth-6");
  assert.equal(hasAuthority(lord), false);
});

test("Overruled: saving throw eligibility and plan execution", async () => {
  setupWorld();
  const lord = guardFixture({ level: 5, branch: "lord" });

  // Overruled applies only to INT, WIS, CHA
  assert.equal(isOverruledEligible("wis"), true);
  assert.equal(isOverruledEligible("int"), true);
  assert.equal(isOverruledEligible("cha"), true);
  assert.equal(isOverruledEligible("str"), false);
  assert.equal(isOverruledEligible("dex"), false);
  assert.equal(isOverruledEligible("con"), false);

  // Valid Overruled save
  await use(lord, "overruledSave", { ability: "wis", timing: "both" }, "ovr-1");
  const receipt = guardUses.receipt(lord, "ovr-1");
  assert.equal(receipt.result.ability, "wis");

  // Ineligible ability warns
  await assert.rejects(
    use(lord, "overruledSave", { ability: "str" }, "ovr-2"),
    error => {
      assert.equal(error.name, "AK5eWarnings");
      assert.ok(error.warnings.some(w => w.id === "ability"));
      return true;
    }
  );
});

test("Manifest Destiny: spends 3 Aggression to retain Authority with shortfall and undo", async () => {
  setupWorld();
  const lord = guardFixture({ level: 5, branch: "lord", aggression: 4 });
  await use(lord, "toggleAuthority", { active: true, reason: "manual" }, "auth-init");
  assert.equal(hasAuthority(lord), true);

  // Spend 3 Aggression to retain Authority
  await use(lord, "manifestDestiny", {}, "md-1");
  const aggPool = getPool(lord, "aggression");
  assert.equal(aggPool.value, 1); // 4 - 3 = 1
  assert.equal(hasAuthority(lord), true);

  // Undo restores spent Aggression
  await undo(lord, "md-1", "undo-md");
  assert.equal(getPool(lord, "aggression").value, 4);

  // Shortfall warning when Aggression < 3
  lord.flags.ak5e.resourcePools.aggression.value = 1;
  await assert.rejects(
    use(lord, "manifestDestiny", {}, "md-2"),
    error => {
      assert.equal(error.name, "AK5eWarnings");
      assert.ok(error.warnings.some(w => w.id === "aggression"));
      return true;
    }
  );

  // Override shortfall: clamps at 0 and retains Authority
  await anyway(lord, "manifestDestiny", {}, "md-over");
  assert.equal(getPool(lord, "aggression").value, 0);
  assert.equal(hasAuthority(lord), true);
  const overReceipt = guardUses.receipt(lord, "md-over");
  assert.ok(overReceipt.shortfalls?.some(s => s.includes("Aggression short")));
});

test("Manifest Will: activation, pool consumption, weapon range & STR/CHA hooks, and undo", async () => {
  setupWorld();
  const lord = guardFixture({ level: 5, branch: "lord" });
  lord.system.abilities.str.mod = 4;
  lord.system.abilities.dex.mod = 2;
  lord.system.abilities.cha.mod = 3;

  assert.equal(isManifestationActive(lord), false);
  const beforePool = getPool(lord, "manifestation").value;
  assert.equal(beforePool, 3);

  // Activate Manifestation
  await use(lord, "manifestWill", { mode: "castle" }, "mw-1");
  assert.equal(isManifestationActive(lord), true);
  assert.equal(kingsDomainMode(lord), "castle");
  assert.equal(getPool(lord, "manifestation").value, 2);

  // Weapon hook: Melee weapon gains Range (30/-)
  const longsword = {
    name: "Longsword",
    type: "weapon",
    system: {
      actionType: "mwak",
      range: { value: 5, units: "ft" }
    }
  };
  const attackConfig = {
    actor: lord,
    subject: { item: longsword, actionType: "rwak" },
    attackType: "ranged",
    rolls: [{ parts: ["1d20"] }]
  };

  lordPreRollAttack(attackConfig);
  assert.equal(longsword.system.range.value, 30);
  // STR (4) > DEX (2), so diff (2) added to attack roll parts
  assert.ok(attackConfig.rolls[0].parts.includes("2"));

  // Damage hook: STR used instead of DEX, +CHA mod (3) added to damage
  const damageConfig = {
    actor: lord,
    subject: { item: longsword, actionType: "rwak" },
    attackType: "ranged",
    rolls: [{ parts: ["1d8"] }]
  };
  lordPreRollDamage(damageConfig);
  // Contains STR-DEX diff (2) and CHA mod (3)
  assert.ok(damageConfig.rolls[0].parts.includes("2"));
  assert.ok(damageConfig.rolls[0].parts.includes("3"));

  // Undo restores Manifestation pool and deactivates state
  await undo(lord, "mw-1", "undo-mw");
  assert.equal(getPool(lord, "manifestation").value, 3);
  assert.equal(isManifestationActive(lord), false);
});

test("Will Attunement: 10-minute ritual changes damage type and updates categories", async () => {
  setupWorld();
  const lord = guardFixture({ level: 5, branch: "lord" });

  assert.equal(manifestationDamageType(lord), "force");
  assert.equal(forceOfWillCategory("force").group, 1);

  // Attune to Lightning (Group 3)
  await use(lord, "willAttunement", { damageType: "lightning" }, "attune-1");
  assert.equal(manifestationDamageType(lord), "lightning");
  assert.equal(forceOfWillCategory("lightning").group, 3);
  assert.equal(forceOfWillCategory("lightning").saveType, "con");

  // Attune to Slashing (Group 2)
  await use(lord, "willAttunement", { damageType: "slashing" }, "attune-2");
  assert.equal(manifestationDamageType(lord), "slashing");
  assert.equal(forceOfWillCategory("slashing").group, 2);
  assert.equal(forceOfWillCategory("slashing").saveType, "dex");

  // Undo restores prior damage type
  await undo(lord, "attune-2", "undo-attune");
  assert.equal(manifestationDamageType(lord), "lightning");
});

test("King's Domain (4th Level): Castle Doctrine and Pursuit of Power", async () => {
  setupWorld();
  const lord = guardFixture({ level: 5, branch: "lord" });
  await use(lord, "toggleAuthority", { active: true, reason: "manual" }, "auth-kd");

  // Level warning below 4
  const lordL1 = guardFixture({ level: 1, branch: "lord" });
  await assert.rejects(
    use(lordL1, "castleDoctrine", {}, "cd-warn"),
    error => {
      assert.equal(error.name, "AK5eWarnings");
      assert.ok(error.warnings.some(w => w.id === "level"));
      return true;
    }
  );

  // Castle Doctrine: Hit non-elite refunds Reaction
  await use(lord, "castleDoctrine", { nonEliteHit: true }, "cd-1");
  const cdReceipt1 = guardUses.receipt(lord, "cd-1");
  assert.equal(cdReceipt1.reaction.refunded, true);
  assert.equal(cdReceipt1.result.refunded, true);
  assert.equal(cdReceipt1.result.speedReduced, true);

  // Castle Doctrine: Hit elite does not refund Reaction
  await use(lord, "castleDoctrine", { nonEliteHit: false }, "cd-2");
  const cdReceipt2 = guardUses.receipt(lord, "cd-2");
  assert.equal(cdReceipt2.reaction.refunded, false);
  assert.equal(cdReceipt2.result.refunded, false);

  // Pursuit of Power: With Authority, unlimited per turn
  await use(lord, "pursuitOfPower", {}, "pop-1");
  const popReceipt1 = guardUses.receipt(lord, "pop-1");
  assert.equal(popReceipt1.result.unlimited, true);

  // Pursuit of Power without Authority: warns on second use in same turn
  await use(lord, "toggleAuthority", { active: false }, "auth-off");
  const combat = { id: "c1", round: 1, turn: 0, started: true };
  globalThis.game.combat = combat;
  await use(lord, "pursuitOfPower", {}, "pop-2");
  await assert.rejects(
    use(lord, "pursuitOfPower", {}, "pop-3"),
    error => {
      assert.equal(error.name, "AK5eWarnings");
      assert.ok(error.warnings.some(w => w.id === "frequency"));
      return true;
    }
  );
});

test("Authority Marks: application, opposite attack consumption (+1d6 damage), and Divine Right splash", async () => {
  setupWorld();
  const lord = guardFixture({ level: 5, branch: "lord" });
  await use(lord, "toggleAuthority", { active: true }, "auth-mark");
  await use(lord, "manifestWill", {}, "mw-mark");

  const target = guardFixture({ level: 5, branch: null });
  target.id = "target1";
  target.uuid = "Actor.target1";

  // Apply Melee Mark
  await use(lord, "applyLordMark", { targetUuid: target.uuid, markType: "melee" }, "mark-1");
  assert.equal(getLordMark(lord, target.uuid), "melee");

  // Consume with same mark (melee attack) warns
  await assert.rejects(
    use(lord, "consumeLordMark", { targetUuid: target.uuid, attackType: "melee" }, "mark-fail"),
    error => {
      assert.equal(error.name, "AK5eWarnings");
      assert.ok(error.warnings.some(w => w.id === "sameMark"));
      return true;
    }
  );

  // Damage hook with opposite attack (ranged): adds +1d6 mark damage
  const weapon = {
    name: "Javelin",
    type: "weapon",
    system: { actionType: "rwak" }
  };
  const damageConfig = {
    actor: lord,
    subject: { item: weapon, actionType: "rwak" },
    attackType: "ranged",
    target: target,
    rolls: [{ parts: ["1d6"] }]
  };
  lordPreRollDamage(damageConfig);
  assert.ok(damageConfig.rolls[0].parts.includes("1d6"));

  // Consume with opposite attack (ranged)
  await use(lord, "consumeLordMark", { targetUuid: target.uuid, attackType: "ranged" }, "mark-consume");
  assert.equal(getLordMark(lord, target.uuid), null);
  const consumeReceipt = guardUses.receipt(lord, "mark-consume");
  assert.equal(consumeReceipt.result.consumedMark, "melee");
  assert.equal(consumeReceipt.result.attackType, "ranged");
  assert.equal(consumeReceipt.result.splash, false);

  // At 17th level (Divine Right): splash is true
  const lord17 = guardFixture({ level: 17, branch: "lord" });
  lord17.system.attributes.prof = 6;
  await use(lord17, "toggleAuthority", { active: true }, "auth-17");
  await use(lord17, "applyLordMark", { targetUuid: target.uuid, markType: "ranged" }, "mark-17-app");
  await use(lord17, "consumeLordMark", { targetUuid: target.uuid, attackType: "melee" }, "mark-17-con");
  const splashReceipt = guardUses.receipt(lord17, "mark-17-con");
  assert.equal(splashReceipt.result.splash, true);
});

test("By Lordly Decree (10th Level): Make It So (PB / Expertise / Reroll) and A Leader Leads", async () => {
  setupWorld();
  const lord = guardFixture({ level: 10, branch: "lord" });
  lord.system.attributes.prof = 4;
  lord.system.abilities.cha.mod = 3;

  // Make It So without Authority (not proficient): +CHA (3) + PB (4) = +7
  const baseBonus = makeItSoBonus(lord, { isProficient: false, normalMod: 0, hasAuth: false });
  assert.equal(baseBonus.chaMod, 3);
  assert.equal(baseBonus.pb, 4);
  assert.equal(baseBonus.effectivePB, 4);
  assert.equal(baseBonus.expertise, false);
  assert.equal(baseBonus.netBonus, 7);

  // Make It So with Authority: Expertise (+2*PB = 8) -> +CHA (3) + 8 = +11
  await use(lord, "toggleAuthority", { active: true }, "auth-mis");
  const authBonus = makeItSoBonus(lord, { isProficient: false, normalMod: 0, hasAuth: true });
  assert.equal(authBonus.effectivePB, 8);
  assert.equal(authBonus.expertise, true);
  assert.equal(authBonus.netBonus, 11);

  // Execute Make It So command (spends 1 Manifestation use)
  const manifBefore = getPool(lord, "manifestation").value;
  await use(lord, "makeItSo", { rollType: "save", ability: "dex", isProficient: true }, "mis-1");
  assert.equal(getPool(lord, "manifestation").value, manifBefore - 1);
  const misReceipt = guardUses.receipt(lord, "mis-1");
  assert.equal(misReceipt.result.bonusInfo.expertise, true);
  assert.equal(misReceipt.result.rerollAllowed, false);

  // Undo restores Manifestation use
  await undo(lord, "mis-1", "undo-mis");
  assert.equal(getPool(lord, "manifestation").value, manifBefore);

  // At 17th level: Make It So allows reroll on failure
  const lord17 = guardFixture({ level: 17, branch: "lord" });
  lord17.system.attributes.prof = 6;
  await use(lord17, "makeItSo", { rollType: "attack" }, "mis-17");
  const misReceipt17 = guardUses.receipt(lord17, "mis-17");
  assert.equal(misReceipt17.result.rerollAllowed, true);

  // A Leader Leads: spends Aggression to grant Special Inspiration to allies
  const ally1 = guardFixture({ level: 5, branch: null });
  ally1.uuid = "Actor.ally1";
  const aggBefore = getPool(lord, "aggression").value;
  await use(lord, "aLeaderLeads", { aggression: 2, targetUuids: [ally1.uuid] }, "all-1");
  assert.equal(getPool(lord, "aggression").value, aggBefore - 2);
  const allReceipt = guardUses.receipt(lord, "all-1");
  assert.equal(allReceipt.result.aggressionSpent, 2);
  assert.equal(allReceipt.targets[0].uuid, ally1.uuid);

  // Undo restores spent Aggression
  await undo(lord, "all-1", "undo-all");
  assert.equal(getPool(lord, "aggression").value, aggBefore);
});

test("Force of Will (13th Level): element groups, save DC, and 1/turn limitation", async () => {
  setupWorld();
  const lord = guardFixture({ level: 13, branch: "lord" });
  lord.system.attributes.prof = 5;
  lord.system.abilities.str.mod = 4;
  lord.system.abilities.dex.mod = 2;

  const expectedDC = martialDC(lord); // 8 + 5 + 4 = 17
  assert.equal(expectedDC, 17);

  // Group 1: Force -> 10-ft burst, 3d6 DEX save
  await use(lord, "willAttunement", { damageType: "force" }, "attune-fow1");
  await use(lord, "forceOfWill", {}, "fow-1");
  const receipt1 = guardUses.receipt(lord, "fow-1");
  assert.equal(receipt1.formula, "3d6");
  assert.equal(receipt1.dc, 17);
  assert.equal(receipt1.saveType, "dex");
  assert.equal(receipt1.result.category.group, 1);
  assert.equal(getPool(lord, "forceOfWill").value, 4); // 5 - 1 = 4

  // Undo restores Force of Will use
  await undo(lord, "fow-1", "undo-fow");
  assert.equal(getPool(lord, "forceOfWill").value, 5);

  // Group 2: Radiant -> 50-ft line, 8d6 DEX save
  await use(lord, "willAttunement", { damageType: "radiant" }, "attune-fow2");
  await use(lord, "forceOfWill", {}, "fow-2");
  const receipt2 = guardUses.receipt(lord, "fow-2");
  assert.equal(receipt2.formula, "8d6");
  assert.equal(receipt2.dc, 17);
  assert.equal(receipt2.saveType, "dex");
  assert.equal(receipt2.result.category.group, 2);

  // Group 3: Acid -> Melee hit rider, 6d6 CON save
  await use(lord, "willAttunement", { damageType: "acid" }, "attune-fow3");
  const combat = { id: "c1", round: 2, turn: 0, started: true };
  globalThis.game.combat = combat;
  await use(lord, "forceOfWill", {}, "fow-3");
  const receipt3 = guardUses.receipt(lord, "fow-3");
  assert.equal(receipt3.formula, "6d6");
  assert.equal(receipt3.dc, 17);
  assert.equal(receipt3.saveType, "con");
  assert.equal(receipt3.result.category.group, 3);

  // 1/turn limitation warns on second use in same turn
  await assert.rejects(
    use(lord, "forceOfWill", {}, "fow-repeat"),
    error => {
      assert.equal(error.name, "AK5eWarnings");
      assert.ok(error.warnings.some(w => w.id === "frequency"));
      return true;
    }
  );
});

test("Divine Right (17th Level): feature activation and level gating", async () => {
  setupWorld();
  const lord10 = guardFixture({ level: 10, branch: "lord" });

  // Rejects below level 17
  await assert.rejects(
    use(lord10, "divineRight", {}, "dr-fail"),
    error => {
      assert.equal(error.name, "AK5eWarnings");
      assert.ok(error.warnings.some(w => w.id === "level"));
      return true;
    }
  );

  // Succeeds at level 17
  const lord17 = guardFixture({ level: 17, branch: "lord" });
  await use(lord17, "divineRight", {}, "dr-success");
  const receipt = guardUses.receipt(lord17, "dr-success");
  assert.equal(receipt.result.active, true);
  assert.equal(lord17.flags.ak5e.lord.divineRight, true);
});

test("Table-Play Philosophy: warning shortfalls, clamping at 0, and encounter-window undo", async () => {
  setupWorld();
  const lord = guardFixture({ level: 13, branch: "lord", aggression: 1 });
  lord.system.attributes.prof = 5;

  // Deplete Manifestation to 0
  lord.flags.ak5e.resourcePools.manifestation = { value: 0 };

  // Manifest Will warns on 0 uses
  await assert.rejects(
    use(lord, "manifestWill", {}, "mw-short"),
    error => {
      assert.equal(error.name, "AK5eWarnings");
      assert.ok(error.warnings.some(w => w.id === "manifestation"));
      return true;
    }
  );

  // "Use anyway" override clamps at 0 and succeeds
  await anyway(lord, "manifestWill", {}, "mw-clamped");
  assert.equal(getPool(lord, "manifestation").value, 0);
  const receipt = guardUses.receipt(lord, "mw-clamped");
  assert.ok(receipt.shortfalls?.some(s => s.includes("Manifestation short")));

  // Undo restores prior value
  await undo(lord, "mw-clamped", "undo-clamped");
  assert.equal(getPool(lord, "manifestation").value, 0);
});
