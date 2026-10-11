import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDeadeye, inDeadshot, isEliteOrLeader,
  DEADEYE_PLANS, deadeyePreRollAttack, deadeyePreRollDamage
} from "../scripts/deadeye-features.mjs";

test("Deadeye identification and elite/leader checks", () => {
  const actor = {
    uuid: "Actor.deadeye1",
    system: { attributes: { prof: 3 } },
    items: [
      {
        type: "class",
        system: { levels: 4 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        name: "Deadeye",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-deadeye" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true, deadshotActive: true }
      }
    }
  };

  assert.equal(isDeadeye(actor), true);
  assert.equal(inDeadshot(actor), true);

  const eliteActor = { flags: { ak5e: { tier: "elite" } } };
  const leaderActor = { name: "Crownslayer [Leader]" };
  const normalActor = { name: "Reunion Grunt" };

  assert.equal(isEliteOrLeader(eliteActor), true);
  assert.equal(isEliteOrLeader(leaderActor), true);
  assert.equal(isEliteOrLeader(normalActor), false);
});

test("Deadshot plan enters state and applies level 10 Anti-Sniper Training", () => {
  const actorLvl4 = {
    uuid: "Actor.deadeye2",
    name: "Ambriel",
    system: { attributes: { prof: 2 } },
    items: [
      {
        type: "class",
        system: { levels: 4 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-deadeye" } }
      }
    ],
    flags: { ak5e: { marksman: { enabled: true } } }
  };

  const plan4 = DEADEYE_PLANS.deadshot(actorLvl4, {}, {});
  assert.equal(plan4.warnings.length, 0);
  const receipt4 = { id: "rcpt-ds-4" };
  const updates4 = plan4.apply({}, receipt4);
  assert.equal(updates4["flags.ak5e.marksman.deadshotActive"], true);
  assert.equal(receipt4.result.headDown, false);

  const actorLvl10 = {
    uuid: "Actor.deadeye3",
    name: "Ambriel",
    system: { attributes: { prof: 4 } },
    items: [
      {
        type: "class",
        system: { levels: 10 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-deadeye" } }
      }
    ],
    flags: { ak5e: { marksman: { enabled: true } } }
  };

  const plan10 = DEADEYE_PLANS.deadshot(actorLvl10, {}, {});
  const receipt10 = { id: "rcpt-ds-10" };
  const updates10 = plan10.apply({}, receipt10);
  assert.equal(updates10["flags.ak5e.marksman.deadshotActive"], true);
  assert.equal(updates10["flags.ak5e.marksman.headDownActive"], true);
  assert.equal(receipt10.result.headDown, true);
});

test("Target of Opportunity and Vital Strike plans", () => {
  const actor = {
    uuid: "Actor.deadeye4",
    name: "Firewatch",
    system: { attributes: { prof: 3 } },
    items: [
      {
        type: "class",
        system: { levels: 7 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-deadeye" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true, deadshotActive: true }
      }
    }
  };

  // Target of Opportunity
  const topPlan = DEADEYE_PLANS.targetOfOpportunity(actor, {}, { targetName: "Mudrock Colossus" });
  assert.equal(topPlan.warnings.length, 0);
  const topReceipt = { id: "rcpt-top" };
  const topUpdates = topPlan.apply({}, topReceipt);
  assert.equal(topUpdates["flags.ak5e.marksman.opportunityTarget"].name, "Mudrock Colossus");
  assert.equal(topUpdates["flags.ak5e.marksman.opportunityTarget"].active, true);

  // Vital Strike
  const vsPlan = DEADEYE_PLANS.vitalStrike(actor, {}, {});
  assert.equal(vsPlan.warnings.length, 0);
  const vsReceipt = { id: "rcpt-vs" };
  const vsUpdates = vsPlan.apply({}, vsReceipt);
  assert.equal(vsUpdates["flags.ak5e.marksman.vitalStrikeActive"], true);
  assert.equal(vsReceipt.result.bonusFormula, "3d6"); // 7th level is 3d6
});

test("Deathblow plan executes targets below threshold and triggers Killchain", () => {
  const actor = {
    uuid: "Actor.deadeye5",
    name: "Andreana",
    system: { attributes: { prof: 6 } },
    items: [
      {
        type: "class",
        system: { levels: 18 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-deadeye" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true, deadshotActive: true }
      }
    }
  };

  // Standard target: threshold is level (18)
  const dbSurvives = DEADEYE_PLANS.deathblow(actor, {}, { currentHp: 20, isEliteOrLeader: false });
  const rcptSurvives = { id: "rcpt-db-survives" };
  dbSurvives.apply({}, rcptSurvives);
  assert.equal(rcptSurvives.result.executed, false);

  const dbExecutes = DEADEYE_PLANS.deathblow(actor, {}, { currentHp: 15, isEliteOrLeader: false });
  const rcptExecutes = { id: "rcpt-db-exec" };
  const execUpdates = dbExecutes.apply({}, rcptExecutes);
  assert.equal(rcptExecutes.result.executed, true);
  assert.equal(rcptExecutes.result.newHp, 0);
  // Killchain triggered at level 18
  assert.equal(execUpdates["flags.ak5e.marksman.killchainFreeDeadshot"], true);

  // Elite target: threshold is 2 * level (36)
  const dbElite = DEADEYE_PLANS.deathblow(actor, {}, { currentHp: 30, isEliteOrLeader: true });
  const rcptElite = { id: "rcpt-db-elite" };
  dbElite.apply({}, rcptElite);
  assert.equal(rcptElite.result.executed, true);
  assert.equal(rcptElite.result.threshold, 36);
});

test("Hooks apply Deadshot doubled PB, Lethal crit reduction, and Vital Strike damage", () => {
  const actor = {
    system: {
      attributes: { prof: 3 },
      abilities: { dex: { mod: 4 } }
    },
    items: [
      {
        type: "class",
        system: { levels: 7 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-deadeye" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: {
          enabled: true,
          deadshotActive: true,
          vitalStrikeActive: true,
          targetLock: { active: true, targetUuid: "Target.Locked.1" }
        }
      }
    }
  };

  const targetToken = {
    document: { uuid: "Target.Locked.1" },
    actor: {
      uuid: "Target.Locked.1",
      flags: { ak5e: { tier: "elite" } }
    }
  };
  globalThis.game = {
    user: {
      targets: { first: () => targetToken }
    }
  };

  // Attack Roll Hook
  const attackConfig = {
    subject: { actor, actionType: "rwak", ability: "dex" },
    rolls: [{ parts: ["1d20", "4"], options: {} }]
  };
  deadeyePreRollAttack(attackConfig, {}, {});

  // Doubled PB added
  assert.ok(attackConfig.rolls[0].parts.includes("3"));
  // Lethal: Elite crit range increased by 2 -> criticalSuccess becomes 18
  assert.equal(attackConfig.rolls[0].options.criticalSuccess, 18);

  // Damage Roll Hook
  const damageConfig = {
    subject: { actor, actionType: "rwak" },
    rolls: [{ parts: ["1d10", "4"], options: {} }]
  };
  deadeyePreRollDamage(damageConfig, {}, {});

  // Vital Strike 3d6 added (level 7)
  assert.ok(damageConfig.rolls[0].parts.includes("3d6"));
  // Damage floor 3
  assert.equal(damageConfig.rolls[0].options.damageFloor, 3);
});

