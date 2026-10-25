import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import { SUPPORTER_CLASS_ID, pbForLevel, aidDieSize, supporterLevel } from "../scripts/supporter-rules.mjs";
import {
  hasProvideAid, hasAdvancedAid, hasLightenTheLoad,
  hasEverReliable, hasSelfSupportive, hasWillIntoBeing,
  willIntoBeingBonus, defineSupporterPools, onSupporterRest,
  onSupporterTurnStart, hasSelfSupportDie, consumeSelfSupportDie
} from "../scripts/supporter-features.mjs";
import { supporterUses } from "../scripts/supporter-uses.mjs";
import { getPool, refundPool, spendPool } from "../scripts/resource-pools.mjs";
import { getReactions, spendReaction } from "../scripts/trigger-events.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
  defineSupporterPools();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

function createSupporter(level = 1, options = {}) {
  const sClass = createTestItem({
    name: "Supporter",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } }
  });
  const actor = createTestActor({
    items: [sClass],
    system: {
      attributes: { prof: pbForLevel(level) },
      abilities: {
        int: { mod: 2, value: 14 },
        wis: { mod: 1, value: 12 },
        cha: { mod: 4, value: 18 },
        con: { mod: 2, value: 14 },
        dex: { mod: 2, value: 14 },
        str: { mod: 0, value: 10 },
        ...(options.abilities ?? {})
      },
      ...options.system
    },
    flags: {
      ak5e: {
        supporter: { enabled: true, aidAbility: options.aidAbility ?? "cha" }
      }
    }
  });
  return actor;
}

/* ==========================================================================
   1. Provide Aid & Aid Die Pool Adversarial Challenges
   ========================================================================== */

test("ADV-AID-1: Provide Aid grants 10-minute effect with correct die size and metadata", async () => {
  const supporter = createSupporter(7); // Level 7 -> Aid Die d10
  const ally = createTestActor({ name: "Amiya" });

  const initialPool = getPool(supporter, "aidDie").value;
  const opId = "adv-aid-1-op";

  const result = await supporterUses.execute(supporter, "provideAid", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    distance: 30
  }, opId);

  assert.ok(result);
  assert.equal(result.dieSize, "d10", "Level 7 supporter grants d10 aid die");
  assert.equal(getPool(supporter, "aidDie").value, initialPool - 1, "Pool decremented by 1");

  const receipt = supporterUses.receipt(supporter, opId);
  assert.ok(receipt, "Receipt was recorded");
  assert.equal(receipt.targets?.length, 1);
  assert.equal(receipt.targets[0].uuid, ally.uuid);
  assert.equal(receipt.targets[0].tag.trigger, "time", "Aid Die expires on world time (C3:6635)");
  assert.equal(receipt.targets[0].tag.seconds, 600, "Duration is 10 minutes (600s)");
  assert.equal(receipt.targets[0].tag.data.dieSize, "d10");
  assert.equal(receipt.targets[0].tag.data.supporterLevel, 7);
  assert.equal(receipt.targets[0].tag.data.advancedAid, true, "Level 7 has Advanced Aid active");

  // Check effect embedded document on ally
  const effects = Array.from(ally.effects.values());
  assert.equal(effects.length, 1, "ActiveEffect created on target ally");
  assert.equal(effects[0].flags?.ak5e?.supporterUsesEffect?.opId, opId);
});

test("ADV-AID-2: Single Aid Die per creature rule and override behavior", async () => {
  const supporter = createSupporter(5);
  const ally = createTestActor({ name: "Texas" });

  // 1. Target already holding Aid Die throws warning
  assert.throws(() => {
    supporterUses.plan(supporter, "provideAid", {
      targetUuid: ally.uuid,
      targetName: ally.name,
      distance: 25,
      targetHasAidDie: true
    });
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "targetHasAidDie"));
    return true;
  });

  // 2. Overriding targetHasAidDie warning allows planning and execution
  const plan = supporterUses.plan(supporter, "provideAid", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    distance: 25,
    targetHasAidDie: true,
    overrides: ["targetHasAidDie"]
  });
  assert.ok(plan);
  assert.ok(plan.warnings.some(w => w.id === "targetHasAidDie"));

  const res = await supporterUses.execute(supporter, "provideAid", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    distance: 25,
    targetHasAidDie: true,
    overrides: ["targetHasAidDie"],
    overridden: ["targetHasAidDie"]
  }, "override-aid-die-op");

  assert.ok(res);
  const receipt = supporterUses.receipt(supporter, "override-aid-die-op");
  assert.ok(receipt.overridden?.some(text => text.includes("already has an Aid Die")));
});

test("ADV-AID-3: Range boundary check (60 ft exact vs 61 ft out-of-range)", async () => {
  const supporter = createSupporter(3);
  const ally = createTestActor({ name: "Nearl" });

  // Exactly 60 ft: passes without warning
  const planExact = supporterUses.plan(supporter, "provideAid", {
    targetUuid: ally.uuid,
    distance: 60
  });
  assert.equal(planExact.warnings.some(w => w.id === "range"), false, "60 ft should not trigger range warning");

  // 61 ft: triggers range warning
  assert.throws(() => {
    supporterUses.plan(supporter, "provideAid", {
      targetUuid: ally.uuid,
      distance: 61
    });
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "range"));
    return true;
  });

  // Overriding range warning allows execution
  const res = await supporterUses.execute(supporter, "provideAid", {
    targetUuid: ally.uuid,
    distance: 61,
    overrides: ["range"],
    overridden: ["range"]
  }, "range-override-op");
  assert.ok(res);
});

test("ADV-AID-4: Pool exhaustion, shortfall warning, and zero-clamping override", async () => {
  const supporter = createSupporter(1, {
    abilities: { int: { mod: 1, value: 12 }, wis: { mod: 0, value: 10 }, cha: { mod: 1, value: 12 } }
  });
  const ally = createTestActor({ name: "Dobermann" });

  assert.equal(getPool(supporter, "aidDie").max, 1);
  assert.equal(getPool(supporter, "aidDie").value, 1);

  // Spend the only die
  await spendPool(supporter, "aidDie", 1);
  assert.equal(getPool(supporter, "aidDie").value, 0);

  // Shortfall warning thrown
  assert.throws(() => {
    supporterUses.plan(supporter, "provideAid", {
      targetUuid: ally.uuid,
      distance: 20
    });
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "shortfall"));
    return true;
  });

  // Overriding shortfall with "Use anyway" succeeds and clamps at 0
  const res = await supporterUses.execute(supporter, "provideAid", {
    targetUuid: ally.uuid,
    distance: 20,
    overrides: ["shortfall"],
    overridden: ["shortfall"]
  }, "shortfall-clamp-op");

  assert.ok(res);
  assert.equal(getPool(supporter, "aidDie").value, 0, "Pool clamped at zero (not negative)");

  const receipt = supporterUses.receipt(supporter, "shortfall-clamp-op");
  assert.ok(receipt.shortfalls?.length > 0, "Shortfall logged in receipt");
  assert.ok(receipt.shortfalls[0].includes("short by 1"));
  assert.equal(receipt.resources?.[0]?.pool, "aidDie");
  assert.equal(receipt.resources?.[0]?.after, 0);
});

/** Plants the Aid Die Active Effect that Provide Aid creates, so useAidDie has a die to expend (R-plans: expend the effect). */
async function holdAidDie(actor, extra = {}) {
  const level = supporterLevel(actor) ?? 1;
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: "Aid Die",
    flags: { ak5e: {
      supporterUsesEffect: { aidDie: true, opId: "test-hold", sourceUuid: "Actor.test-supporter" },
      featureTag: { data: { dieSize: aidDieSize(level), supporterLevel: level, supporterPB: pbForLevel(level), advancedAid: level >= 5, willIntoBeing: level >= 20, ...extra } }
    } }
  }]);
}

test("ADV-AID-5: Mental ability modifier minimum bounds (negative/zero mental mods)", () => {
  // Supporter with all negative mental mods: INT 8 (-1), WIS 6 (-2), CHA 8 (-1)
  const feebleSupporter = createSupporter(1, {
    abilities: {
      int: { mod: -1, value: 8 },
      wis: { mod: -2, value: 6 },
      cha: { mod: -1, value: 8 }
    }
  });

  const pool = getPool(feebleSupporter, "aidDie");
  assert.equal(pool.max, 0, "Aid Die maximum is 0 with negative modifiers (R1: no floor of 1)");
  assert.equal(pool.value, 0);
});

/* ==========================================================================
   2. Advanced Aid Riders (Lv 5) Adversarial Challenges
   ========================================================================== */

test("ADV-ADV-1: Pre-level 5 Supporter does not trigger Advanced Aid riders", async () => {
  const supporter = createSupporter(4);

  await holdAidDie(supporter);

  const res = await supporterUses.execute(supporter, "useAidDie", {
    rollType: "attack",
    dieSize: "d8",
    supporterLevel: 4
  }, "pre-adv-attack");

  assert.equal(res.advancedEffect, null, "Level 4 has no advanced effect");
  assert.equal(res.willBonus, 0);
});

test("ADV-ADV-2: All five Advanced Aid riders resolve correctly at Level 5+", async () => {
  const supporter = createSupporter(10);

  // 1. Attack roll -> crit range +1
  await holdAidDie(supporter);
  const rAttack = await supporterUses.execute(supporter, "useAidDie", {
    rollType: "attack",
    dieSize: "d10",
    supporterLevel: 10
  }, "adv-attack-op");
  assert.equal(rAttack.advancedEffect, "attack");

  // 2. Skill check -> roll second die and choose
  await holdAidDie(supporter);
  const rSkill = await supporterUses.execute(supporter, "useAidDie", {
    rollType: "skill",
    dieSize: "d10",
    supporterLevel: 10
  }, "adv-skill-op");
  assert.equal(rSkill.advancedEffect, "skill");

  // 3. Saving throw -> temp HP = roll + PB
  await holdAidDie(supporter);
  const rSave = await supporterUses.execute(supporter, "useAidDie", {
    rollType: "save",
    dieSize: "d10",
    supporterLevel: 10
  }, "adv-save-op");
  assert.equal(rSave.advancedEffect, "save");

  // 4. Damage roll -> 10 ft splash Force damage = roll
  await holdAidDie(supporter);
  const rDamage = await supporterUses.execute(supporter, "useAidDie", {
    rollType: "damage",
    dieSize: "d10",
    supporterLevel: 10
  }, "adv-damage-op");
  assert.equal(rDamage.advancedEffect, "damage");

  // 5. Healing roll -> temp HP = roll
  await holdAidDie(supporter);
  const rHeal = await supporterUses.execute(supporter, "useAidDie", {
    rollType: "healing",
    dieSize: "d10",
    supporterLevel: 10
  }, "adv-healing-op");
  assert.equal(rHeal.advancedEffect, "healing");
});

test("ADV-ADV-3: Invalid roll type and Death Saving Throw rejections", () => {
  const supporter = createSupporter(5);

  // Invalid roll type
  assert.throws(() => {
    supporterUses.plan(supporter, "useAidDie", { rollType: "initiative" });
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "invalidRollType"));
    return true;
  });

  // Death saving throw
  assert.throws(() => {
    supporterUses.plan(supporter, "useAidDie", { rollType: "save", isDeathSave: true });
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "deathSave"));
    return true;
  });
});

/* ==========================================================================
   3. Lighten the Load (Lv 11) Adversarial Challenges
   ========================================================================== */

test("ADV-LTL-1: Level requirement check (Lv 10 throws level warning)", () => {
  const supporter = createSupporter(10);
  const ally1 = createTestActor({ name: "Ally1" });
  const ally2 = createTestActor({ name: "Ally2" });

  assert.throws(() => {
    supporterUses.plan(supporter, "lightenTheLoad", {
      targetUuid: ally2.uuid,
      triggerUuid: ally1.uuid
    });
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "level"));
    return true;
  });
});

test("ADV-LTL-2: Reaction depletion, override, and self/same target boundaries", async () => {
  const supporter = createSupporter(11);
  const ally1 = createTestActor({ name: "Ally1" });
  const ally2 = createTestActor({ name: "Ally2" });

  // Self targeting raises selfTarget warning
  assert.throws(() => {
    supporterUses.plan(supporter, "lightenTheLoad", {
      targetUuid: supporter.uuid,
      triggerUuid: ally1.uuid
    });
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "selfTarget"));
    return true;
  });

  // Same target as triggering ally raises sameTarget warning
  assert.throws(() => {
    supporterUses.plan(supporter, "lightenTheLoad", {
      targetUuid: ally1.uuid,
      triggerUuid: ally1.uuid
    });
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "sameTarget"));
    return true;
  });

  // Distance > 60 ft raises range warning
  assert.throws(() => {
    supporterUses.plan(supporter, "lightenTheLoad", {
      targetUuid: ally2.uuid,
      triggerUuid: ally1.uuid,
      distance: 65
    });
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "range"));
    return true;
  });

  // Supplementary die chaining raises chaining warning
  assert.throws(() => {
    supporterUses.plan(supporter, "lightenTheLoad", {
      targetUuid: ally2.uuid,
      triggerUuid: ally1.uuid,
      isSupplementary: true
    });
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "chaining"));
    return true;
  });

  // Deplete reaction
  await spendReaction(supporter, { triggerId: "reaction-test" });
  assert.equal(getReactions(supporter).available, 0);

  // Reaction warning thrown
  assert.throws(() => {
    supporterUses.plan(supporter, "lightenTheLoad", {
      targetUuid: ally2.uuid,
      triggerUuid: ally1.uuid,
      distance: 30
    });
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "reaction"));
    return true;
  });

  // Overriding reaction warning executes successfully
  const res = await supporterUses.execute(supporter, "lightenTheLoad", {
    targetUuid: ally2.uuid,
    targetName: ally2.name,
    triggerUuid: ally1.uuid,
    distance: 30,
    overrides: ["reaction"],
    overridden: ["reaction"]
  }, "ltl-rx-override-op");

  assert.ok(res);
  assert.equal(res.supplementary, true);
});

test("ADV-LTL-3: Grants free supplementary die even when Supporter pool is empty", async () => {
  const supporter = createSupporter(11);
  const ally1 = createTestActor({ name: "Ally1" });
  const ally2 = createTestActor({ name: "Ally2" });

  // Empty Supporter pool
  await spendPool(supporter, "aidDie", getPool(supporter, "aidDie").value);
  assert.equal(getPool(supporter, "aidDie").value, 0);

  // Lighten the Load does NOT require or spend pool dice
  const plan = supporterUses.plan(supporter, "lightenTheLoad", {
    targetUuid: ally2.uuid,
    triggerUuid: ally1.uuid,
    distance: 40
  });
  assert.equal(plan.warnings.some(w => w.id === "shortfall"), false, "No shortfall on free supplementary die");

  const res = await supporterUses.execute(supporter, "lightenTheLoad", {
    targetUuid: ally2.uuid,
    targetName: ally2.name,
    triggerUuid: ally1.uuid,
    distance: 40
  }, "ltl-free-op");

  assert.ok(res);
  assert.equal(getPool(supporter, "aidDie").value, 0, "Pool remains 0 without errors");
  assert.equal(res.dieSize, "d10", "Level 11 uses d10");
});

/* ==========================================================================
   4. Ever Reliable (Lv 15) Adversarial Challenges
   ========================================================================== */

test("ADV-ER-1: Short Rest recovery rounds up and clamps at pool max", async () => {
  // Pool max = 5 (odd max)
  const supporter5 = createSupporter(15, {
    abilities: { cha: { mod: 5, value: 20 } }
  });
  assert.equal(getPool(supporter5, "aidDie").max, 5);

  // Empty pool -> Short Rest recovers ceil(5 / 2) = 3
  await spendPool(supporter5, "aidDie", 5);
  assert.equal(getPool(supporter5, "aidDie").value, 0);
  await onSupporterRest(supporter5, "short");
  assert.equal(getPool(supporter5, "aidDie").value, 3);

  // Pool at 4/5 -> Short Rest recovers 3, clamped at 5
  await refundPool(supporter5, "aidDie", 1);
  assert.equal(getPool(supporter5, "aidDie").value, 4);
  await onSupporterRest(supporter5, "short");
  assert.equal(getPool(supporter5, "aidDie").value, 5, "Clamped at maximum of 5");

  // Supporter level 14 should NOT recover on Short Rest
  const supporter14 = createSupporter(14, {
    abilities: { cha: { mod: 4, value: 18 } }
  });
  await spendPool(supporter14, "aidDie", 4);
  assert.equal(getPool(supporter14, "aidDie").value, 0);
  await onSupporterRest(supporter14, "short");
  assert.equal(getPool(supporter14, "aidDie").value, 0, "Level 14 does not gain Ever Reliable");
});

test("ADV-ER-2: Turn start 0-recovery triggers only when empty", async () => {
  const supporter = createSupporter(15);
  const max = getPool(supporter, "aidDie").max;

  // Empty pool -> triggers 1 die recovery
  await spendPool(supporter, "aidDie", max);
  assert.equal(getPool(supporter, "aidDie").value, 0);

  await onSupporterTurnStart(supporter);
  assert.equal(getPool(supporter, "aidDie").value, 1, "Regained 1 die at 0");

  // Now at 1 die -> turn start does not add another die
  await onSupporterTurnStart(supporter);
  assert.equal(getPool(supporter, "aidDie").value, 1, "Does not regenerate if > 0");

  // Level 14 actor at 0 dice -> does not regenerate
  const supporter14 = createSupporter(14);
  await spendPool(supporter14, "aidDie", getPool(supporter14, "aidDie").value);
  await onSupporterTurnStart(supporter14);
  assert.equal(getPool(supporter14, "aidDie").value, 0, "Level 14 does not regenerate");
});

/* ==========================================================================
   5. Self-Supportive (Lv 18) Adversarial Challenges
   ========================================================================== */

test("ADV-SS-1: Turn start grants and consumes personal die at Level 18+", async () => {
  const supporter = createSupporter(18);
  assert.equal(hasSelfSupportDie(supporter), false);

  await onSupporterTurnStart(supporter);
  assert.equal(hasSelfSupportDie(supporter), true, "Level 18 gains personal die at turn start");

  await consumeSelfSupportDie(supporter);
  assert.equal(hasSelfSupportDie(supporter), false, "Consumed personal die resets flag");

  // Level 17 Supporter does not gain personal die
  const supporter17 = createSupporter(17);
  await onSupporterTurnStart(supporter17);
  assert.equal(hasSelfSupportDie(supporter17), false, "Level 17 does not gain personal die");
});

/* ==========================================================================
   6. Will Into Being (Lv 20) Adversarial Challenges
   ========================================================================== */

test("ADV-WIB-1: Will Into Being bonus (+PB) at Level 20 vs Level 19", async () => {
  const supporter20 = createSupporter(20);
  assert.equal(hasWillIntoBeing(supporter20), true);
  assert.equal(willIntoBeingBonus(supporter20), 6, "Level 20 PB is +6");

  const supporter19 = createSupporter(19);
  assert.equal(hasWillIntoBeing(supporter19), false);
  assert.equal(willIntoBeingBonus(supporter19), 0);

  await holdAidDie(supporter20);

  const res20 = await supporterUses.execute(supporter20, "useAidDie", {
    rollType: "attack",
    dieSize: "d12",
    supporterLevel: 20,
    willIntoBeing: true
  }, "wib-20-op");
  assert.equal(res20.willBonus, 6, "useAidDie applies willBonus 6 when opted in (R5)");

  await holdAidDie(supporter19);

  const res19 = await supporterUses.execute(supporter19, "useAidDie", {
    rollType: "attack",
    dieSize: "d12",
    supporterLevel: 19
  }, "wib-19-op");
  assert.equal(res19.willBonus, 0, "useAidDie applies willBonus 0 for Lv 19");
});

/* ==========================================================================
   7. Undo Reversibility Adversarial Challenges
   ========================================================================== */

test("ADV-UNDO-1: Full multi-step operations and undo reversibility across table play", async () => {
  const supporter = createSupporter(15);
  const ally = createTestActor({ name: "Specter" });
  const ally2 = createTestActor({ name: "Skadi" });

  const initialPool = getPool(supporter, "aidDie").value;

  // 1. Provide Aid
  const op1 = "test-undo-aid-1";
  await supporterUses.execute(supporter, "provideAid", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    distance: 25
  }, op1);

  assert.equal(getPool(supporter, "aidDie").value, initialPool - 1);
  assert.equal(Array.from(ally.effects.values()).length, 1);

  // Undo Provide Aid
  const undo1 = await supporterUses.undo(supporter, op1);
  assert.equal(undo1.undone, op1);
  assert.equal(getPool(supporter, "aidDie").value, initialPool, "Pool restored on undo");
  assert.equal(Array.from(ally.effects.values()).length, 0, "ActiveEffect removed on undo");

  // 2. Lighten the Load
  const op2 = "test-undo-ltl-2";
  await supporterUses.execute(supporter, "lightenTheLoad", {
    targetUuid: ally2.uuid,
    targetName: ally2.name,
    triggerUuid: ally.uuid,
    distance: 30
  }, op2);

  assert.equal(Array.from(ally2.effects.values()).length, 1);

  // Undo Lighten the Load
  const undo2 = await supporterUses.undo(supporter, op2);
  assert.equal(undo2.undone, op2);
  assert.equal(Array.from(ally2.effects.values()).length, 0, "ActiveEffect removed on undo");

  // 3. useAidDie
  const op3 = "test-undo-use-3";
  await holdAidDie(supporter);
  await supporterUses.execute(supporter, "useAidDie", {
    rollType: "attack",
    dieSize: "d12"
  }, op3);

  const undo3 = await supporterUses.undo(supporter, op3);
  assert.equal(undo3.undone, op3);
});
