import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARKSMAN_CLASS_ID, MARKSMAN_BRANCH_IDS, IMPLEMENTED_MARKSMAN_BRANCHES,
  marksmanProfile, isMarksman, marksmanLevel, marksmanBranch, martialDC,
  targetLockBonus, explosiveExpertiseDice, isTargetLocked, hasFightingStyle,
  FIGHTING_STYLES
} from "../scripts/marksman-rules.mjs";

test("Marksman branch and class IDs are registered", () => {
  assert.equal(MARKSMAN_CLASS_ID, "class-marksman");
  assert.equal(MARKSMAN_BRANCH_IDS["subclass-marksman-anti-air"], "antiAir");
  assert.equal(MARKSMAN_BRANCH_IDS["subclass-marksman-artilleryman"], "artilleryman");
  assert.equal(MARKSMAN_BRANCH_IDS["subclass-marksman-besieger"], "besieger");
  assert.equal(MARKSMAN_BRANCH_IDS["subclass-marksman-deadeye"], "deadeye");
  assert.equal(MARKSMAN_BRANCH_IDS["subclass-marksman-flinger"], "flinger");
  assert.equal(MARKSMAN_BRANCH_IDS["subclass-marksman-heavyshot"], "heavyshot");
  assert.equal(MARKSMAN_BRANCH_IDS["subclass-marksman-hunter"], "hunter");
  assert.equal(MARKSMAN_BRANCH_IDS["subclass-marksman-spreadshot"], "spreadshot");
  assert.deepEqual(IMPLEMENTED_MARKSMAN_BRANCHES, [
    "antiAir", "artilleryman", "besieger", "deadeye", "flinger",
    "heavyshot", "hunter", "spreadshot"
  ]);
});

test("marksmanProfile detects class, level, branch, and PB", () => {
  const actor = {
    items: [
      {
        type: "class",
        system: { levels: 5, identifier: "marksman" },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        name: "Artilleryman",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-artilleryman" } }
      }
    ]
  };

  assert.equal(isMarksman(actor), true);
  assert.equal(marksmanLevel(actor), 5);
  assert.equal(marksmanBranch(actor), "artilleryman");
  const profile = marksmanProfile(actor);
  assert.equal(profile.applicable, true);
  assert.equal(profile.level, 5);
  assert.equal(profile.pb, 3);
});

test("martialDC uses the chosen STR or DEX modifier and requires a choice", () => {
  const actor = {
    system: {
      attributes: { prof: 3 },
      abilities: {
        str: { mod: 2 },
        dex: { mod: 4 }
      }
    }
  };
  assert.equal(martialDC(actor, "dex"), 8 + 3 + 4); // 15
  assert.equal(martialDC(actor, "str"), 8 + 3 + 2); // 13
  assert.equal(martialDC(actor), null); // No ability is silently selected.
  actor.flags = { ak5e: { marksman: { martialDcAbility: "str" } } };
  assert.equal(martialDC(actor), 8 + 3 + 2); // Stored table choice.

  const strActor = {
    system: {
      attributes: { prof: 2 },
      abilities: {
        str: { mod: 3 },
        dex: { mod: 1 }
      }
    }
  };
  assert.equal(martialDC(strActor, "str"), 8 + 2 + 3); // 13
});

test("Target Lock bonus preserves the unresolved 11/12 unlock choice", () => {
  const makeActor = level => ({
    items: [
      {
        type: "class",
        system: { levels: level },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      }
    ]
  });

  assert.equal(targetLockBonus(makeActor(1)), 1);
  assert.equal(targetLockBonus(makeActor(5)), 1);
  assert.equal(targetLockBonus(makeActor(10)), 1);
  const level11 = makeActor(11);
  assert.equal(targetLockBonus(level11), 1);
  assert.equal(targetLockBonus(level11, 11), 2);
  assert.equal(targetLockBonus(level11, 12), 1);
  level11.flags = { ak5e: { marksman: { rulings: { enhancedTargetLockLevel: { value: 11 } } } } };
  assert.equal(targetLockBonus(level11), 2);
  assert.equal(targetLockBonus(makeActor(12)), 2);
  assert.equal(targetLockBonus(makeActor(20)), 2);
});

test("explosiveExpertiseDice scales at levels 1, 7, and 14", () => {
  const makeActor = level => ({
    items: [
      {
        type: "class",
        system: { levels: level },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      }
    ]
  });

  assert.equal(explosiveExpertiseDice(makeActor(1)), 1);
  assert.equal(explosiveExpertiseDice(makeActor(6)), 1);
  assert.equal(explosiveExpertiseDice(makeActor(7)), 2);
  assert.equal(explosiveExpertiseDice(makeActor(13)), 2);
  assert.equal(explosiveExpertiseDice(makeActor(14)), 3);
  assert.equal(explosiveExpertiseDice(makeActor(20)), 3);
});

test("Target Lock expires after one minute and legacy locks grant no bonus", async () => {
  const { isTargetLockActive } = await import("../scripts/marksman-rules.mjs");
  const actor = {
    flags: {
      ak5e: {
        marksman: {
          targetLock: {
            active: true,
            targetUuid: "Scene.1.Token.target1",
            expiresAt: 160
          }
        }
      }
    }
  };
  assert.equal(isTargetLockActive(actor, 159), true);
  assert.equal(isTargetLocked(actor, "Scene.1.Token.target1", 159), true);
  assert.equal(isTargetLocked(actor, "Scene.1.Token.target1", 160), false);
  assert.equal(isTargetLocked(actor, "Scene.1.Token.other", 159), false);

  const inactiveActor = {
    flags: {
      ak5e: {
        marksman: {
          targetLock: {
            active: false,
            targetUuid: "Scene.1.Token.target1"
          }
        }
      }
    }
  };
  assert.equal(isTargetLocked(inactiveActor, "Scene.1.Token.target1"), false);

  const legacyActor = { flags: { ak5e: { marksman: { targetLock: { active: true, targetUuid: "Scene.1.Token.target1" } } } } };
  assert.equal(isTargetLocked(legacyActor, "Scene.1.Token.target1", 159), false);
});

test("hasFightingStyle detects style from flags or items", () => {
  const actorByFlag = {
    flags: {
      ak5e: {
        marksman: {
          fightingStyle: "ranger"
        }
      }
    }
  };
  assert.equal(hasFightingStyle(actorByFlag, "ranger"), true);
  assert.equal(hasFightingStyle(actorByFlag, "closeAndPersonal"), false);

  const actorByItem = {
    items: [
      {
        name: "Close and Personal",
        flags: { ak5e: { chapterThreeId: FIGHTING_STYLES.closeAndPersonal.id } }
      }
    ]
  };
  assert.equal(hasFightingStyle(actorByItem, "closeAndPersonal"), true);
});

test("deadeyeVitalStrikeDice scales at levels 4, 7, and 14", async () => {
  const { deadeyeVitalStrikeDice } = await import("../scripts/marksman-rules.mjs");
  const makeActor = level => ({
    items: [{ type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-marksman" } } }]
  });
  assert.equal(deadeyeVitalStrikeDice(makeActor(4)), "2d6");
  assert.equal(deadeyeVitalStrikeDice(makeActor(6)), "2d6");
  assert.equal(deadeyeVitalStrikeDice(makeActor(7)), "3d6");
  assert.equal(deadeyeVitalStrikeDice(makeActor(13)), "3d6");
  assert.equal(deadeyeVitalStrikeDice(makeActor(14)), "4d6");
  assert.equal(deadeyeVitalStrikeDice(makeActor(20)), "4d6");
});

test("flinger rules scale AP, Max Art Level, Bound Weapons, and Art cost discounts", async () => {
  const {
    flingerArtsPoints, flingerMaxArtLevel, flingerMaxBoundWeapons,
    flingerSpellDC, flingerArtCost
  } = await import("../scripts/marksman-rules.mjs");

  const makeActor = (level, abilityMod = 3) => ({
    items: [{ type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-marksman" } } }],
    system: {
      attributes: { prof: Math.floor((level - 1) / 4) + 2 },
      abilities: { int: { mod: abilityMod } }
    },
    flags: { ak5e: { marksman: { flingerAbility: "int" } } }
  });

  // Arts Points
  assert.equal(flingerArtsPoints(makeActor(1)), 3);
  assert.equal(flingerArtsPoints(makeActor(4)), 4);
  assert.equal(flingerArtsPoints(makeActor(7)), 6);
  assert.equal(flingerArtsPoints(makeActor(10)), 7);
  assert.equal(flingerArtsPoints(makeActor(13)), 10);
  assert.equal(flingerArtsPoints(makeActor(16)), 11);
  assert.equal(flingerArtsPoints(makeActor(19)), 12);

  // Max Art Level
  assert.equal(flingerMaxArtLevel(makeActor(1)), 1);
  assert.equal(flingerMaxArtLevel(makeActor(6)), 1);
  assert.equal(flingerMaxArtLevel(makeActor(7)), 2);
  assert.equal(flingerMaxArtLevel(makeActor(13)), 3);
  assert.equal(flingerMaxArtLevel(makeActor(19)), 4);

  // Max Bound Weapons
  assert.equal(flingerMaxBoundWeapons(makeActor(1)), 1);
  assert.equal(flingerMaxBoundWeapons(makeActor(4)), 1);
  assert.equal(flingerMaxBoundWeapons(makeActor(5)), 2);
  assert.equal(flingerMaxBoundWeapons(makeActor(14)), 3);

  // DC
  assert.equal(flingerSpellDC(makeActor(1, 3)), 8 + 2 + 3); // 13

  // Art Cost with discount
  assert.equal(flingerArtCost(makeActor(1), 3, { isSelfOrTarget: false }), 3);
  assert.equal(flingerArtCost(makeActor(1), 3, { isSelfOrTarget: true }), 2);
  assert.equal(flingerArtCost(makeActor(1), 1, { isSelfOrTarget: true }), 0);
  assert.equal(flingerArtCost(makeActor(1), 0, { isSelfOrTarget: true }), 0);
});

