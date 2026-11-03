/**
 * Comprehensive automated test suite for AK5e Dollkeeper Specialist Subclass (Ch. 3 L6266–6377).
 * Tests all 12 functional areas + encounter-window undo reversibility:
 *  1. Subclass Identification & Feature Predicates
 *  2. Living Doll Companion Construct Data Generation & Synchronization
 *  3. Strike Action, Attack Roll Bonus, Damage Scaling & Murderous Marionette
 *  4. Command in Combat (Bonus Action <= 100 ft) & Action Types
 *  5. Hit Dice Healing Linkage & Doll Rebuild (Ritual / 500 LMD)
 *  6. Self-Rejuvenation Long Rest Logic (> 1 HP rule)
 *  7. Level 5: Pull the Strings (Doll's Dance, Look in the Mirror, Marionette 0 HP substitution)
 *  8. Level 5: Musical Chairs (1 Prowess position swap <= 60 ft & Joint Prowess 1/turn triggers)
 *  9. Level 11: Masquerade (Doll Multiattack 2 attacks, Mistaken Identity DC 18 & 1h immunity, Talking Heads)
 * 10. Level 15: Living Doll (Reciprocity temp HP sharing & Share Arts non-damaging buff sharing)
 * 11. Level 20: Artistry is Violence (Doll Multiattack 3 attacks & Doll Raid 1/LR simultaneous action)
 * 12. Full Encounter-Window Undo Reversibility (WORKFLOW §3.2)
 * 13. Resource Pools Registration & Lifecycle (mistakenIdentity, marionette, dollRaid)
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  isDollkeeper,
  getDollkeeperLevel,
  getOwnerPB,
  hasLivingDoll,
  hasPullTheStrings,
  hasMusicalChairs,
  hasMasquerade,
  hasLivingDoll15,
  hasArtistryIsViolence,
  createDollCompanionData,
  synchronizeDoll,
  isLivingDoll,
  getDollStrikeAttackCount,
  calculateDollStrikeBonus,
  calculateDollStrikeDamageFormula,
  hasMurderousMarionetteAdvantage,
  validateDollCommand,
  executeDollCommand,
  linkHitDiceHealing,
  rebuildDoll,
  canUseDollsDance,
  applyLookInTheMirror,
  validateMarionette,
  executeMarionette,
  validateMusicalChairs,
  executeMusicalChairs,
  checkDollkeeperProwessGain,
  validateMistakenIdentity,
  executeMistakenIdentity,
  executeTalkingHeads,
  executeReciprocity,
  canShareArts,
  executeShareArts,
  validateDollRaid,
  executeDollRaid,
  undoDollkeeperAction,
  defineDollkeeperPools,
  registerDollkeeperHooks,
  DOLLKEEPER_SUBCLASS_ID,
  DOLL_BASE_STATS,
  DOLL_DAMAGE_IMMUNITIES,
  DOLL_CONDITION_IMMUNITIES,
  setActorPosition,
  getActorPosition
} from "../scripts/dollkeeper-features.mjs";

import { SPECIALIST_CLASS_ID } from "../scripts/specialist-rules.mjs";
import { defineSpecialistPools } from "../scripts/specialist-features.mjs";
import { getPool, clearPoolRegistry, spendPool, refundPool, recoverPool } from "../scripts/resource-pools.mjs";
import {
  setupFoundryGlobals,
  teardownFoundryGlobals,
  createTestActor,
  createTestItem
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
  defineSpecialistPools();
  defineDollkeeperPools();
  registerDollkeeperHooks();
});

test.afterEach(() => {
  teardownFoundryGlobals();
  clearPoolRegistry();
});

function createDollkeeperActor(level = 1, options = {}) {
  const sClass = createTestItem({
    name: "Specialist",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } }
  });

  const subClass = createTestItem({
    name: "Dollkeeper",
    type: "subclass",
    flags: {
      ak5e: {
        chapterThreeId: DOLLKEEPER_SUBCLASS_ID
      }
    }
  });

  const items = [sClass, subClass, ...(options.items ?? [])];

  const actor = createTestActor({
    name: options.name ?? "Test Dollkeeper",
    items,
    system: {
      ...options.system,
      details: {
        level,
        ...(options.system?.details ?? {})
      },
      attributes: {
        hp: { value: 10 + (level - 1) * 6, max: 10 + (level - 1) * 6, temp: 0 },
        movement: { walk: 30 },
        prof: 2 + Math.floor((level - 1) / 4),
        ...(options.system?.attributes ?? {})
      },
      abilities: {
        str: { value: 10, mod: 0 },
        dex: { value: 16, mod: 3 },
        con: { value: 14, mod: 2 },
        int: { value: 12, mod: 1 },
        wis: { value: 10, mod: 0 },
        cha: { value: 8, mod: -1 },
        ...(options.system?.abilities ?? {})
      },
      traits: {
        size: "med",
        weaponProf: { value: ["lgt", "simple"] },
        armorProf: { value: ["lgt", "med", "shl"] },
        ...(options.system?.traits ?? {})
      }
    },
    flags: {
      ak5e: {
        specialist: {
          enabled: true,
          branch: "dollkeeper",
          weaponCategory: options.weaponCategory ?? "Melee",
          fightingStyle: options.fightingStyle ?? "Dueling",
          ...(options.flags?.ak5e?.specialist ?? {})
        },
        dollkeeper: {
          ...(options.flags?.ak5e?.dollkeeper ?? {})
        }
      }
    }
  });

  return actor;
}

function createDollActor(ownerActor, options = {}) {
  const data = createDollCompanionData(ownerActor, options);
  const doll = createTestActor(data);
  return doll;
}

/* ---------------------------------------------------------------- Test Areas */

test("Area 1: Subclass Identification & Feature Predicates", () => {
  const dk1 = createDollkeeperActor(1);
  const dk5 = createDollkeeperActor(5);
  const dk11 = createDollkeeperActor(11);
  const dk15 = createDollkeeperActor(15);
  const dk20 = createDollkeeperActor(20);

  const nonSpecialist = createTestActor({ name: "Regular Guy" });

  assert.equal(isDollkeeper(dk1), true, "Identifies 1st level Dollkeeper");
  assert.equal(isDollkeeper(nonSpecialist), false, "Rejects non-Dollkeeper");

  // Level 1: Living Doll
  assert.equal(hasLivingDoll(dk1), true);
  assert.equal(hasPullTheStrings(dk1), false);
  assert.equal(hasMusicalChairs(dk1), false);
  assert.equal(hasMasquerade(dk1), false);
  assert.equal(hasLivingDoll15(dk1), false);
  assert.equal(hasArtistryIsViolence(dk1), false);

  // Level 5: Pull the Strings & Musical Chairs
  assert.equal(hasPullTheStrings(dk5), true);
  assert.equal(hasMusicalChairs(dk5), true);
  assert.equal(hasMasquerade(dk5), false);

  // Level 11: Masquerade
  assert.equal(hasMasquerade(dk11), true);
  assert.equal(hasLivingDoll15(dk11), false);

  // Level 15: Living Doll (15th)
  assert.equal(hasLivingDoll15(dk15), true);
  assert.equal(hasArtistryIsViolence(dk15), false);

  // Level 20: Artistry is Violence
  assert.equal(hasArtistryIsViolence(dk20), true);
});

test("Area 2: Living Doll Companion Construct Data Generation & Synchronization", async () => {
  const owner = createDollkeeperActor(3);
  const dollData = createDollCompanionData(owner);

  assert.equal(dollData.system.details.creatureType, "construct");
  assert.equal(dollData.system.details.alignment, "Neutral");
  assert.equal(dollData.system.traits.size, "med");

  // Base stats STR 16, DEX 16, CON 14, INT 1, WIS 10, CHA 4
  assert.equal(dollData.system.abilities.str.value, 16);
  assert.equal(dollData.system.abilities.dex.value, 16);
  assert.equal(dollData.system.abilities.con.value, 14);
  assert.equal(dollData.system.abilities.int.value, 1);
  assert.equal(dollData.system.abilities.wis.value, 10);
  assert.equal(dollData.system.abilities.cha.value, 4);

  // Immunities
  for (const di of DOLL_DAMAGE_IMMUNITIES) {
    assert.ok(dollData.system.traits.di.value.includes(di), `Includes damage immunity ${di}`);
  }
  for (const ci of DOLL_CONDITION_IMMUNITIES) {
    assert.ok(dollData.system.traits.ci.value.includes(ci), `Includes condition immunity ${ci}`);
  }

  // Darkvision 60 ft & passive Perception 8 + PB
  assert.equal(dollData.system.attributes.senses.darkvision, 60);
  assert.equal(dollData.system.attributes.senses.passivePerception, 8 + getOwnerPB(owner));

  // Instantiation & Synchronization
  const doll = createDollActor(owner);
  assert.equal(isLivingDoll(doll), true);
  assert.equal(doll.system.attributes.hp.max, owner.system.attributes.hp.max);
  assert.equal(doll.system.attributes.movement.walk, owner.system.attributes.movement.walk);
  assert.equal(doll.system.attributes.prof, owner.system.attributes.prof);

  // Modifying owner Max HP & Speed -> Synchronization updates Doll
  owner.system.attributes.hp.max = 55;
  owner.system.attributes.movement.walk = 40;
  owner.system.attributes.prof = 4;

  const syncResult = await synchronizeDoll(owner, doll);
  assert.equal(syncResult.synchronized, true);
  assert.equal(doll.system.attributes.hp.max, 55);
  assert.equal(doll.system.attributes.movement.walk, 40);
  assert.equal(doll.system.attributes.prof, 4);
  assert.equal(doll.system.attributes.senses.passivePerception, 8 + 4);
});

test("Area 3: Strike Action, Attack Roll Bonus, Damage Scaling & Murderous Marionette", () => {
  const owner1 = createDollkeeperActor(1, { weaponCategory: "Melee", fightingStyle: "Dueling" });
  const doll1 = createDollActor(owner1);

  // Level 1: 1 attack, Strike bonus = DEX/STR mod (+3) + owner PB (+2) = 5
  assert.equal(getDollStrikeAttackCount(owner1), 1);
  assert.equal(calculateDollStrikeBonus(owner1, doll1), 5);

  // Level 1 base damage: 1d8 + 3 (Dueling not yet shared because Look in the Mirror requires level 5)
  const dmg1 = calculateDollStrikeDamageFormula(owner1, doll1);
  assert.equal(dmg1.formula, "1d8 + 3");
  assert.equal(dmg1.damageType, "bludgeoning");

  // Murderous Marionette: Advantage if target is within owner's reach
  const target = createTestActor({ name: "Goblin" });
  assert.equal(hasMurderousMarionetteAdvantage(owner1, doll1, target, { distance: 5, ownerReach: 5 }), true);
  assert.equal(hasMurderousMarionetteAdvantage(owner1, doll1, target, { distance: 15, ownerReach: 5 }), false);

  // Level 11: Masquerade Multiattack (2 attacks)
  const owner11 = createDollkeeperActor(11);
  assert.equal(getDollStrikeAttackCount(owner11), 2);

  // Level 20: Artistry is Violence Multiattack (3 attacks)
  const owner20 = createDollkeeperActor(20);
  assert.equal(getDollStrikeAttackCount(owner20), 3);
});

test("Area 4: Command in Combat (Bonus Action <= 100 ft) & Action Types", async () => {
  const owner = createDollkeeperActor(3);
  const doll = createDollActor(owner);

  // Valid Bonus Action commands: Strike, Dash, Disengage, Dodge, Help, Move
  for (const cmd of ["strike", "dash", "disengage", "dodge", "help", "move"]) {
    const validCheck = validateDollCommand(owner, doll, cmd, { distance: 30 });
    assert.equal(validCheck.valid, true, `Command ${cmd} should be valid`);
  }

  // Strike command execution produces attacks and formula
  const strikeRes = await executeDollCommand(owner, doll, "strike", { distance: 30 });
  assert.equal(strikeRes.success, true);
  assert.equal(strikeRes.attackCount, 1);
  assert.equal(strikeRes.attackBonus, 5);
  assert.equal(strikeRes.damageFormula, "1d8 + 3");

  // Beyond 100 ft range warning
  const outOfRange = validateDollCommand(owner, doll, "dash", { distance: 120 });
  assert.equal(outOfRange.valid, false);
  assert.ok(outOfRange.warnings[0].includes("beyond 100 ft"));

  // Non-blocking override allows command beyond 100 ft
  const overrideRes = await executeDollCommand(owner, doll, "dash", { distance: 120, override: true });
  assert.equal(overrideRes.success, true);
  assert.ok(overrideRes.warnings[0].includes("beyond 100 ft"));

  // Destroyed doll warning
  doll.system.attributes.hp.value = 0;
  const deadCheck = validateDollCommand(owner, doll, "strike", { distance: 10 });
  assert.equal(deadCheck.valid, false);
  assert.ok(deadCheck.warnings[0].includes("destroyed"));
});

test("Area 5: Hit Dice Healing Linkage & Doll Rebuild (Ritual / 500 LMD)", () => {
  const owner = createDollkeeperActor(3); // CON 14 (+2 mod)
  const doll = createDollActor(owner);
  doll.system.attributes.hp.value = 10;
  doll.system.attributes.hp.max = 22;

  // Owner rolls 5 on Hit Dice during short rest -> Doll regains 5 + 2 = 7 HP
  const healRes = linkHitDiceHealing(owner, doll, 5);
  assert.equal(healRes.healed, 7);
  assert.equal(healRes.priorHp, 10);
  assert.equal(healRes.newHp, 17);
  assert.equal(doll.system.attributes.hp.value, 17);

  // Clamped at Max HP
  const healClamp = linkHitDiceHealing(owner, doll, 10);
  assert.equal(healClamp.healed, 5); // 17 + 12 = 29, clamped at 22
  assert.equal(healClamp.newHp, 22);

  // If Doll has 0 HP (destroyed), Hit Dice healing fails
  doll.system.attributes.hp.value = 0;
  const deadHeal = linkHitDiceHealing(owner, doll, 6);
  assert.equal(deadHeal.healed, 0);
  assert.equal(deadHeal.dollDestroyed, true);

  // Rebuilding with retained components (Long Rest ritual)
  const ritualRebuild = rebuildDoll(owner, doll, { hasComponents: true });
  assert.equal(ritualRebuild.success, true);
  assert.equal(ritualRebuild.newHp, 22);
  assert.equal(ritualRebuild.lmdSpent, 0);

  // Rebuilding without components: requires 500 LMD
  doll.system.attributes.hp.value = 0;
  const shortRebuild = rebuildDoll(owner, doll, { hasComponents: false, lmdSpent: 300 });
  assert.equal(shortRebuild.success, false);
  assert.ok(shortRebuild.warnings[0].includes("500 LMD"));

  // With 500 LMD, rebuild succeeds
  const paidRebuild = rebuildDoll(owner, doll, { hasComponents: false, lmdSpent: 500 });
  assert.equal(paidRebuild.success, true);
  assert.equal(paidRebuild.newHp, 22);
  assert.equal(paidRebuild.lmdSpent, 500);
});

test("Area 6: Self-Rejuvenation Long Rest Logic (> 1 HP rule)", async () => {
  const owner = createDollkeeperActor(3);
  const doll = createDollActor(owner);
  doll.system.attributes.hp.max = 22;

  // Case 1: Doll has 10 HP (> 1 HP) -> Self-Rejuvenation restores full missing HP on Long Rest
  doll.system.attributes.hp.value = 10;
  owner.flags.ak5e.dollkeeper.dollActor = doll;

  if (globalThis.Hooks?.callAll) {
    await globalThis.Hooks.callAll("dnd5e.restCompleted", owner, { longRest: true });
  }
  assert.equal(doll.system.attributes.hp.value, 22, "Doll with 10 HP regains all missing HP");

  // Case 2: Doll has exactly 1 HP -> Self-Rejuvenation source rule states:
  // "If this Creature has more than one Hit Point when it completes a Long Rest, it regains all missing Hit Points."
  doll.system.attributes.hp.value = 1;
  if (globalThis.Hooks?.callAll) {
    await globalThis.Hooks.callAll("dnd5e.restCompleted", owner, { longRest: true });
  }
  assert.equal(doll.system.attributes.hp.value, 1, "Doll with exactly 1 HP does NOT rejuvenate");

  // Case 3: Doll has 0 HP (destroyed) -> does NOT rejuvenate
  doll.system.attributes.hp.value = 0;
  if (globalThis.Hooks?.callAll) {
    await globalThis.Hooks.callAll("dnd5e.restCompleted", owner, { longRest: true });
  }
  assert.equal(doll.system.attributes.hp.value, 0, "Destroyed Doll does NOT rejuvenate");
});

test("Area 7: Level 5: Pull the Strings (Doll's Dance, Look in the Mirror, Marionette)", async () => {
  const owner = createDollkeeperActor(6, {
    weaponCategory: "Melee",
    fightingStyle: "Dueling"
  });
  const doll = createDollActor(owner);

  // Doll's Dance: instant Operator Skills can originate from Doll's space
  assert.equal(canUseDollsDance(owner, doll, { duration: "instant" }), true);
  assert.equal(canUseDollsDance(owner, doll, { duration: "1 minute" }), false);

  // Look in the Mirror: shares Weapon Specialisation (Dueling +2 damage) and Weapon Adept (+1 attack)
  const mirror = applyLookInTheMirror(owner, doll);
  assert.equal(mirror.active, true);
  assert.equal(mirror.specialisation.style, "Dueling");
  assert.equal(mirror.adept, true);

  // Doll's Strike damage now includes Dueling (+2): base 1d8 + 3 -> 1d8 + 5
  const dmg = calculateDollStrikeDamageFormula(owner, doll);
  assert.equal(dmg.formula, "1d8 + 5");

  // Doll's Strike attack bonus includes Adept (+1): +3 (mod) + 3 (PB) + 1 (Adept) = 7
  assert.equal(calculateDollStrikeBonus(owner, doll), 7);

  // Marionette: 1/Long Rest reaction when owner would drop to 0 HP
  owner.system.attributes.hp.value = 5;
  doll.system.attributes.hp.value = 25;
  await setActorPosition(owner, { x: 0, y: 0 });
  await setActorPosition(doll, { x: 30, y: 0 });

  // Lethal damage of 20 would drop owner to 0
  const marionetteCheck = validateMarionette(owner, doll, 20, { distance: 30 });
  assert.equal(marionetteCheck.valid, true);

  const marioRes = await executeMarionette(owner, doll, 20, { distance: 30 });
  assert.equal(marioRes.success, true);
  assert.equal(marioRes.ownerNewHp, 1, "Owner drops to 1 HP instead of 0");
  assert.equal(marioRes.dollNewHp, 5, "Doll takes the 20 damage (25 - 20 = 5)");
  assert.equal(marioRes.dollDestroyed, false);

  // Positions swapped
  assert.deepEqual(getActorPosition(owner), { x: 30, y: 0, elevation: 0 });
  assert.deepEqual(getActorPosition(doll), { x: 0, y: 0, elevation: 0 });

  // 1/LR limit: second marionette attempt warns of exhaustion
  const marioCheck2 = validateMarionette(owner, doll, 10, { distance: 30 });
  assert.equal(marioCheck2.valid, false);
  assert.ok(marioCheck2.warnings[0].includes("already expended"));
});

test("Area 8: Level 5: Musical Chairs & Joint Prowess Triggers", async () => {
  const owner = createDollkeeperActor(5);
  const doll = createDollActor(owner);
  await setActorPosition(owner, { x: 0, y: 0 });
  await setActorPosition(doll, { x: 40, y: 0 });

  // Seed 2 Prowess
  await refundPool(owner, "prowess", 2);
  assert.equal(getPool(owner, "prowess").value, 2);

  // Musical Chairs: spend 1 Prowess to swap positions <= 60 ft
  const swapCheck = validateMusicalChairs(owner, doll, { distance: 40 });
  assert.equal(swapCheck.valid, true);

  const swapRes = await executeMusicalChairs(owner, doll, { distance: 40 });
  assert.equal(swapRes.success, true);
  assert.equal(swapRes.prowessSpent, 1);
  assert.equal(getPool(owner, "prowess").value, 1);
  assert.deepEqual(getActorPosition(owner), { x: 40, y: 0, elevation: 0 });
  assert.deepEqual(getActorPosition(doll), { x: 0, y: 0, elevation: 0 });

  // Range warning for > 60 ft
  const outOfRange = validateMusicalChairs(owner, doll, { distance: 75 });
  assert.equal(outOfRange.valid, false);
  assert.ok(outOfRange.warnings[0].includes("beyond 60 ft"));

  // Joint Prowess Gain Triggers (1/turn)
  // Trigger 1: Owner reduces creature to 0 HP that took damage from doll since start of last turn
  const gain1 = await checkDollkeeperProwessGain(owner, doll, {
    targetReducedToZero: true,
    creatureDamagedByDoll: true
  });
  assert.equal(gain1.gained, true);
  assert.equal(getPool(owner, "prowess").value, 2);

  // 1/turn enforcement: second trigger on same turn is rejected
  const gain2 = await checkDollkeeperProwessGain(owner, doll, {
    source: "doll",
    targetReducedToZero: true
  });
  assert.equal(gain2.gained, false);
  assert.ok(gain2.reason.includes("already gained this turn"));

  // Reset turn limit and test proximity crit trigger (within 10 ft)
  owner.flags.ak5e.dollkeeper.prowessGainedThisTurn = false;
  const gainCrit = await checkDollkeeperProwessGain(owner, doll, {
    distance: 5,
    isCrit: true
  });
  assert.equal(gainCrit.gained, true);
});

test("Area 9: Level 11: Masquerade (Mistaken Identity & Talking Heads)", async () => {
  const owner = createDollkeeperActor(11); // PB = 4
  const doll = createDollActor(owner);
  const attacker = createTestActor({ name: "Hostile Raider" });

  // Mistaken Identity pool initialized to @prof (4 uses)
  const pool = getPool(owner, "mistakenIdentity");
  assert.equal(pool.value, 4);

  // Validation: reaction when attacked within range
  const validCheck = validateMistakenIdentity(owner, doll, attacker, { distance: 5 });
  assert.equal(validCheck.valid, true);

  // Case A: Attacker fails DC 18 Perception check (rolls 14) -> attack redirected to Doll
  const failRes = await executeMistakenIdentity(owner, doll, attacker, {
    distance: 5,
    originalTarget: "owner",
    perceptionCheckResult: 14
  });
  assert.equal(failRes.success, true);
  assert.equal(failRes.redirected, true);
  assert.equal(failRes.chosenTarget, "doll");
  assert.equal(failRes.attackerImmune, false);
  assert.equal(getPool(owner, "mistakenIdentity").value, 3);

  // Case B: Attacker succeeds DC 18 Perception check (rolls 19) -> attacker immune for 1 hour
  const passRes = await executeMistakenIdentity(owner, doll, attacker, {
    distance: 5,
    originalTarget: "owner",
    perceptionCheckResult: 19
  });
  assert.equal(passRes.success, true);
  assert.equal(passRes.redirected, false);
  assert.equal(passRes.attackerImmune, true);
  assert.equal(attacker.flags.ak5e.mistakenIdentityImmune, true);

  // Subsequent attack by immune attacker is warned
  const immuneCheck = validateMistakenIdentity(owner, doll, attacker, { distance: 5 });
  assert.equal(immuneCheck.valid, false);
  assert.ok(immuneCheck.warnings[0].includes("immune to Mistaken Identity"));

  // Talking Heads: telepathic speech within 100 ft
  const talkRes = executeTalkingHeads(owner, doll, "Surrender or be dismantled!", { distance: 40 });
  assert.equal(talkRes.success, true);
  assert.equal(talkRes.telepathic, true);
  assert.equal(talkRes.message, "Surrender or be dismantled!");
});

test("Area 10: Level 15: Living Doll (Reciprocity & Share Arts)", () => {
  const owner = createDollkeeperActor(15);
  const doll = createDollActor(owner);

  // Reciprocity: Owner heals 15 HP (non-resting) -> Doll gains 15 Temp HP
  const recHeal = executeReciprocity(owner, doll, {
    source: "owner",
    hpRecovered: 15,
    isResting: false
  });
  assert.equal(recHeal.success, true);
  assert.equal(doll.system.attributes.hp.temp, 15);

  // Reciprocity: Doll gains 10 Temp HP -> Owner gains 10 Temp HP
  const recTemp = executeReciprocity(owner, doll, {
    source: "doll",
    tempHpGained: 10
  });
  assert.equal(recTemp.success, true);
  assert.equal(owner.system.attributes.hp.temp, 10);

  // Resting HP recovery does NOT trigger Reciprocity
  const recRest = executeReciprocity(owner, doll, {
    source: "owner",
    hpRecovered: 20,
    isResting: true
  });
  assert.equal(recRest.success, false);
  assert.equal(recRest.ignored, true);

  // Share Arts: Non-damaging, non-healing buff affects both simultaneously
  const buffArt = { name: "Invisibility", dealsDamage: false, restoresHp: false };
  assert.equal(canShareArts(owner, doll, buffArt), true);

  const sharedRes = executeShareArts(owner, doll, buffArt);
  assert.equal(sharedRes.success, true);
  assert.equal(sharedRes.shared, true);
  assert.deepEqual(sharedRes.targets, [owner.name, doll.name]);

  // Damaging art is rejected by Share Arts
  const attackArt = { name: "Firebolt", dealsDamage: true, restoresHp: false };
  assert.equal(canShareArts(owner, doll, attackArt), false);
});

test("Area 11: Level 20: Artistry is Violence & Doll Raid", async () => {
  const owner = createDollkeeperActor(20);
  const doll = createDollActor(owner);

  // Multiattack = 3 attacks at level 20
  assert.equal(getDollStrikeAttackCount(owner), 3);

  // Doll Raid pool initialized to 1 use
  const pool = getPool(owner, "dollRaid");
  assert.equal(pool.value, 1);

  // Execute Doll Raid: 1/LR simultaneous action / Strike action with 3 attacks
  const raidRes = await executeDollRaid(owner, doll);
  assert.equal(raidRes.success, true);
  assert.equal(raidRes.strikeAttacks, 3);
  assert.equal(raidRes.simultaneousTurns, true);
  assert.equal(raidRes.usesSpent, 1);
  assert.equal(getPool(owner, "dollRaid").value, 0);

  // Second attempt without rest warns
  const raidRes2 = await executeDollRaid(owner, doll);
  assert.equal(raidRes2.success, false);
  assert.ok(raidRes2.warnings[0].includes("already expended"));
});

test("Area 12: Full Encounter-Window Undo Reversibility (WORKFLOW §3.2)", async () => {
  const owner = createDollkeeperActor(6);
  const doll = createDollActor(owner);
  await setActorPosition(owner, { x: 10, y: 10 });
  await setActorPosition(doll, { x: 50, y: 50 });
  await refundPool(owner, "prowess", 2);

  // 1. Undo Musical Chairs (restores positions & refunds Prowess)
  const swapRes = await executeMusicalChairs(owner, doll, { distance: 40 });
  assert.equal(getPool(owner, "prowess").value, 1);
  assert.deepEqual(getActorPosition(owner), { x: 50, y: 50, elevation: 0 });

  const undoSwap = await undoDollkeeperAction(owner, doll, swapRes.receipt);
  assert.equal(undoSwap.reverted, true);
  assert.equal(getPool(owner, "prowess").value, 2, "Prowess refunded");
  assert.deepEqual(getActorPosition(owner), { x: 10, y: 10, elevation: 0 }, "Position restored");

  // 2. Undo Marionette (restores HP, positions & refunds Marionette use)
  owner.system.attributes.hp.value = 8;
  doll.system.attributes.hp.value = 30;
  const marioRes = await executeMarionette(owner, doll, 15, { distance: 40 });
  assert.equal(owner.system.attributes.hp.value, 1);
  assert.equal(doll.system.attributes.hp.value, 15);
  assert.equal(getPool(owner, "marionette").value, 0);

  const undoMario = await undoDollkeeperAction(owner, doll, marioRes.receipt);
  assert.equal(undoMario.reverted, true);
  assert.equal(owner.system.attributes.hp.value, 8, "Owner HP restored");
  assert.equal(doll.system.attributes.hp.value, 30, "Doll HP restored");
  assert.equal(getPool(owner, "marionette").value, 1, "Marionette use refunded");

  // 3. Undo Hit Dice Healing (restores Doll HP)
  doll.system.attributes.hp.value = 10;
  const healRes = linkHitDiceHealing(owner, doll, 6);
  assert.equal(doll.system.attributes.hp.value, 18);

  const undoHeal = await undoDollkeeperAction(owner, doll, healRes.receipt);
  assert.equal(undoHeal.reverted, true);
  assert.equal(doll.system.attributes.hp.value, 10, "Doll HP reverted after undoing heal");
});

test("Area 13: Resource Pools Registration & Lifecycle", async () => {
  const owner = createDollkeeperActor(20);
  const doll = createDollActor(owner);

  // Pools: prowess, mistakenIdentity, marionette, dollRaid
  assert.ok(getPool(owner, "prowess"), "Prowess pool registered");
  assert.ok(getPool(owner, "mistakenIdentity"), "Mistaken Identity pool registered");
  assert.ok(getPool(owner, "marionette"), "Marionette pool registered");
  assert.ok(getPool(owner, "dollRaid"), "Doll Raid pool registered");

  // Spend uses
  await spendPool(owner, "mistakenIdentity", 2);
  await spendPool(owner, "marionette", 1);
  await spendPool(owner, "dollRaid", 1);

  assert.equal(getPool(owner, "marionette").value, 0);
  assert.equal(getPool(owner, "dollRaid").value, 0);

  // Short Rest: recovers mistakenIdentity to max, but NOT marionette or dollRaid
  await recoverPool(owner, "sr");
  assert.equal(getPool(owner, "mistakenIdentity").value, getOwnerPB(owner));
  assert.equal(getPool(owner, "marionette").value, 0);
  assert.equal(getPool(owner, "dollRaid").value, 0);

  // Long Rest: recovers all pools to max
  await recoverPool(owner, "lr");
  assert.equal(getPool(owner, "marionette").value, 1);
  assert.equal(getPool(owner, "dollRaid").value, 1);
  assert.equal(getPool(owner, "mistakenIdentity").value, getOwnerPB(owner));
});
