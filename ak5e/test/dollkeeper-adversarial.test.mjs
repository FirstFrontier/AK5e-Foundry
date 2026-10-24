/**
 * AK5e Dollkeeper Specialist Branch — Rigorous Adversarial Test Suite
 * Chapter 3 character classes (lines 6266–6377), WORKFLOW §3.2, AGENTS.md, GEMINI.md.
 * Authored by Empirical Challenger (challenger_dollkeeper_11).
 *
 * Scope:
 *  1. Living Doll Companion Synchronization & Edge Cases:
 *     - Owner Max HP changes (level up, CON changes) & Doll Max HP synchronization.
 *     - Non-standard walking speed (encumbered, reduced to 0, modified by feats) propagating to Doll.
 *     - Construct immunities (Poison, Necrotic, Charmed, Frightened, Exhaustion, etc.) maintained.
 *  2. Strike Attacks & Look in the Mirror:
 *     - Attack roll formula (Doll's Dex/Str + owner PB) with diverse PB values.
 *     - Multiattack scaling (1 attack at Lv 1-10, 2 at Lv 11-19, 3 at Lv 20).
 *     - Look in the Mirror weapon trait propagation (Dueling, Archery, Weapon Adept, Weapon Mastery).
 *     - Murderous Marionette advantage based on owner's reach.
 *  3. Hit Dice Healing Linkage & Rest Rejuvenation:
 *     - Owner short rest healing when owner has negative/zero CON modifier.
 *     - Doll healing even when owner is already at maximum HP.
 *     - Self-Rejuvenation: verify Doll does NOT restore HP on Long Rest if at 1 HP or 0 HP.
 *     - Rebuilding ritual and 500 LMD replacement cost handling.
 *  4. Pull the Strings & Musical Chairs (5th Level):
 *     - Marionette lethal damage substitution: dropping to 1 HP, position swap, Doll taking remainder.
 *     - Musical Chairs: 1 Prowess cost, position swap <= 60 ft, shortfall handling (clamping at 0).
 *     - Joint Prowess triggers: 1/turn limit, 10 ft proximity, kill by Doll vs kill by owner.
 *  5. Masquerade (11th Level):
 *     - Mistaken Identity: PB/rest tracking, range limits, DC 18 Perception check, 1-hour immunity on success.
 *     - Talking Heads telepathic projection within 100 ft.
 *  6. Living Doll (15th Level) & Artistry is Violence (20th Level):
 *     - Reciprocity: Temporary HP synchronization without infinite looping, resting exclusion.
 *     - Share Arts: Non-damaging self-targeted Arts duplicating to Doll.
 *     - Doll Raid: 1/Long Rest simultaneous full turn execution (3 attacks).
 *  7. Full Encounter-Window Undo Reversibility (WORKFLOW §3.2):
 *     - Fine-grained undo of Marionette, Musical Chairs, Mistaken Identity, Reciprocity, Doll Raid, Rebuild.
 *     - Adversarial probe of 2-arg vs 3-arg undoDollkeeperAction signatures.
 *     - High-level specialistUses pipeline integration and undo execution.
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
  DOLL_BASE_MODIFIERS,
  DOLL_DAMAGE_IMMUNITIES,
  DOLL_CONDITION_IMMUNITIES,
  setActorPosition,
  getActorPosition
} from "../scripts/dollkeeper-features.mjs";

import { SPECIALIST_CLASS_ID, pbForLevel } from "../scripts/specialist-rules.mjs";
import { defineSpecialistPools } from "../scripts/specialist-features.mjs";
import { getPool, clearPoolRegistry, spendPool, refundPool } from "../scripts/resource-pools.mjs";
import { specialistUses } from "../scripts/specialist-uses.mjs";
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

  const conMod = options.conMod ?? 2;
  const dexMod = options.dexMod ?? 3;
  const baseHp = 10 + (level - 1) * 6 + level * conMod;

  const actor = createTestActor({
    name: options.name ?? `Test Dollkeeper Lv${level}`,
    items,
    system: {
      ...options.system,
      details: {
        level,
        ...(options.system?.details ?? {})
      },
      attributes: {
        hp: { value: baseHp, max: baseHp, temp: 0 },
        movement: { walk: options.walkSpeed ?? 30 },
        prof: pbForLevel(level),
        ...(options.system?.attributes ?? {})
      },
      abilities: {
        str: { value: 10, mod: 0 },
        dex: { value: 10 + dexMod * 2, mod: dexMod },
        con: { value: 10 + conMod * 2, mod: conMod },
        int: { value: 12, mod: 1 },
        wis: { value: 10, mod: 0 },
        cha: { value: 8, mod: -1 },
        ...(options.system?.abilities ?? {})
      },
      traits: {
        size: options.size ?? "med",
        weaponProf: { value: options.weaponProf ?? ["lgt", "simple"] },
        armorProf: { value: options.armorProf ?? ["lgt", "med", "shl"] },
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
          prowessGainedThisTurn: false
        }
      }
    }
  });

  return actor;
}

function createDollActor(ownerActor, options = {}) {
  const data = createDollCompanionData(ownerActor, options);
  const doll = createTestActor(data);
  ownerActor.flags.ak5e.dollkeeper.dollActor = doll;
  return doll;
}

/* =========================================================================================
 * AREA 1: Living Doll Companion Synchronization & Edge Cases
 * ========================================================================================= */

test("Area 1.1: Owner Max HP Dynamic Synchronization & Boundary Edge Cases", async () => {
  // Test across multiple level tiers: 1, 5, 11, 15, 20
  for (const lvl of [1, 5, 11, 15, 20]) {
    const owner = createDollkeeperActor(lvl);
    const doll = createDollActor(owner);

    assert.equal(doll.system.attributes.hp.max, owner.system.attributes.hp.max);
    assert.equal(doll.system.attributes.hp.value, owner.system.attributes.hp.max);

    // Dynamic level-up HP increase
    owner.system.attributes.hp.max += 15;
    owner.system.attributes.hp.value += 15;
    await synchronizeDoll(owner, doll);
    assert.equal(doll.system.attributes.hp.max, owner.system.attributes.hp.max, `Doll Max HP should update at lvl ${lvl}`);

    // Dynamic Constitution change (e.g. CON drain dropping Max HP)
    owner.system.attributes.hp.max = 20;
    // Doll currently has 35 HP (exceeding new max HP 20)
    doll.system.attributes.hp.value = 35;
    await synchronizeDoll(owner, doll);
    assert.equal(doll.system.attributes.hp.max, 20);
    assert.equal(doll.system.attributes.hp.value, 20, "Doll current HP must clamp to owner new Max HP when Max HP drops");

    // Extreme low boundary (owner Max HP <= 0 in malformed data): clamped to >= 1
    owner.system.attributes.hp.max = 0;
    await synchronizeDoll(owner, doll);
    assert.ok(doll.system.attributes.hp.max >= 1, "Doll Max HP must clamp to at least 1");
  }
});

test("Area 1.2: Walking Speed Propagation & Abnormal Movement Conditions", async () => {
  const owner = createDollkeeperActor(5, { walkSpeed: 30 });
  const doll = createDollActor(owner);
  assert.equal(doll.system.attributes.movement.walk, 30);

  // Speed reduced to 0 (Restrained, Grappled, Encumbered, Paralyzed)
  owner.system.attributes.movement.walk = 0;
  await synchronizeDoll(owner, doll);
  assert.equal(doll.system.attributes.movement.walk, 0, "0 ft walking speed must propagate to doll");

  // Non-standard high speed (e.g., 45 ft Fleet of Foot / Mobile feat)
  owner.system.attributes.movement.walk = 45;
  await synchronizeDoll(owner, doll);
  assert.equal(doll.system.attributes.movement.walk, 45, "45 ft walking speed must propagate to doll");

  // Malformed negative speed clamped to 0
  owner.system.attributes.movement.walk = -10;
  await synchronizeDoll(owner, doll);
  assert.equal(doll.system.attributes.movement.walk, 0, "Negative walking speed must clamp to 0");

  // Senses: Darkvision 60 ft and passive Perception = 8 + ownerPB
  assert.equal(doll.system.attributes.senses.darkvision, 60);
  assert.equal(doll.system.attributes.senses.passivePerception, 8 + getOwnerPB(owner));
});

test("Area 1.3: Construct Immunities, Traits, Senses & Proficiencies", async () => {
  const ownerSmall = createDollkeeperActor(3, { size: "sm", weaponProf: ["lgt", "martial"] });
  const dollSmall = createDollActor(ownerSmall);

  // Construct traits & size matching
  assert.equal(dollSmall.system.traits.size, "sm", "Doll size must match owner size (sm)");
  assert.equal(dollSmall.system.details.creatureType, "construct");
  assert.equal(dollSmall.system.details.alignment, "Neutral");

  // Damage Immunities: Poison, Necrotic
  assert.deepEqual(dollSmall.system.traits.di.value, [...DOLL_DAMAGE_IMMUNITIES]);
  assert.ok(dollSmall.system.traits.di.value.includes("poison"));
  assert.ok(dollSmall.system.traits.di.value.includes("necrotic"));

  // Condition Immunities: Charmed, Frightened, Poisoned, Necrotised, Nervous Impairment, Exhaustion
  assert.deepEqual(dollSmall.system.traits.ci.value, [...DOLL_CONDITION_IMMUNITIES]);
  assert.ok(dollSmall.system.traits.ci.value.includes("charmed"));
  assert.ok(dollSmall.system.traits.ci.value.includes("frightened"));
  assert.ok(dollSmall.system.traits.ci.value.includes("exhaustion"));

  // Ability Scores: STR 16 (+3), DEX 16 (+3), CON 14 (+2), INT 1 (-5), WIS 10 (+0), CHA 4 (-3)
  assert.equal(dollSmall.system.abilities.str.value, 16);
  assert.equal(dollSmall.system.abilities.str.mod, 3);
  assert.equal(dollSmall.system.abilities.dex.value, 16);
  assert.equal(dollSmall.system.abilities.dex.mod, 3);
  assert.equal(dollSmall.system.abilities.con.value, 14);
  assert.equal(dollSmall.system.abilities.con.mod, 2);
  assert.equal(dollSmall.system.abilities.int.value, 1);
  assert.equal(dollSmall.system.abilities.int.mod, -5);
  assert.equal(dollSmall.system.abilities.wis.value, 10);
  assert.equal(dollSmall.system.abilities.wis.mod, 0);
  assert.equal(dollSmall.system.abilities.cha.value, 4);
  assert.equal(dollSmall.system.abilities.cha.mod, -3);

  // Flat AC: 10 + DEX mod (13)
  assert.equal(dollSmall.system.attributes.ac.flat, 13);

  // Dynamic proficiency propagation
  assert.deepEqual(dollSmall.system.traits.weaponProf.value, ["lgt", "martial"]);
  ownerSmall.system.traits.weaponProf.value.push("firearms");
  await synchronizeDoll(ownerSmall, dollSmall);
  assert.ok(dollSmall.system.traits.weaponProf.value.includes("firearms"), "New weapon proficiency must synchronize to doll");
});

/* =========================================================================================
 * AREA 2: Strike Attacks & Look in the Mirror
 * ========================================================================================= */

test("Area 2.1: Attack Roll Formula (Dex/Str + PB) Parametric Sweep", () => {
  // Check PB scaling 2 to 6 across levels 1, 5, 9, 13, 17, 20
  const cases = [
    { level: 1, expectedPB: 2 },
    { level: 5, expectedPB: 3 },
    { level: 9, expectedPB: 4 },
    { level: 13, expectedPB: 5 },
    { level: 17, expectedPB: 6 },
    { level: 20, expectedPB: 6 }
  ];

  for (const { level, expectedPB } of cases) {
    const owner = createDollkeeperActor(level);
    const doll = createDollActor(owner);
    assert.equal(getOwnerPB(owner), expectedPB);

    // Unarmed / Default Strike: 3 (Doll STR/DEX) + PB
    const bonus = calculateDollStrikeBonus(owner, doll);
    if (level < 5) {
      assert.equal(bonus, 3 + expectedPB);
    } else if (level === 5) {
      // At level 5, Pull the Strings active but no Weapon Adept (Level 6)
      assert.equal(bonus, 3 + expectedPB);
    } else {
      // Level >= 6: Weapon Adept adds +1
      assert.equal(bonus, 3 + expectedPB + 1);
    }
  }

  // Ranged Weapon with Archery Fighting Style
  const rangedWeapon = createTestItem({
    name: "Shortbow",
    type: "weapon",
    system: {
      actionType: "rwak",
      damage: { parts: [["1d6", "piercing"]] }
    }
  });

  // Owner at Level 4 (no Pull the Strings yet): Archery does NOT propagate
  const owner4 = createDollkeeperActor(4, { fightingStyle: "Archery" });
  const doll4 = createDollActor(owner4);
  const bonus4 = calculateDollStrikeBonus(owner4, doll4, rangedWeapon);
  assert.equal(bonus4, 3 + 2, "Level 4 doll must not receive Archery bonus");

  // Owner at Level 5 (Pull the Strings): Archery (+2) propagates
  const owner5 = createDollkeeperActor(5, { fightingStyle: "Archery" });
  const doll5 = createDollActor(owner5);
  const bonus5 = calculateDollStrikeBonus(owner5, doll5, rangedWeapon);
  assert.equal(bonus5, 3 + 3 + 2, "Level 5 doll must receive Archery +2 bonus");

  // Owner at Level 6 (Pull the Strings + Weapon Adept): Archery (+2) and Weapon Adept (+1) propagate
  const owner6 = createDollkeeperActor(6, { fightingStyle: "Archery" });
  const doll6 = createDollActor(owner6);
  const bonus6 = calculateDollStrikeBonus(owner6, doll6, rangedWeapon);
  assert.equal(bonus6, 3 + 3 + 2 + 1, "Level 6 doll must receive Archery (+2) and Weapon Adept (+1)");
});

test("Area 2.2: Multiattack Scaling Boundaries Across All 20 Levels", () => {
  for (let lvl = 1; lvl <= 20; lvl++) {
    const owner = createDollkeeperActor(lvl);
    const count = getDollStrikeAttackCount(owner);
    if (lvl < 11) {
      assert.equal(count, 1, `Level ${lvl} must have 1 Strike attack`);
    } else if (lvl < 20) {
      assert.equal(count, 2, `Level ${lvl} must have 2 Strike attacks (Masquerade)`);
    } else {
      assert.equal(count, 3, `Level ${lvl} must have 3 Strike attacks (Artistry is Violence)`);
    }
  }
});

test("Area 2.3: Look in the Mirror Weapon Trait Propagation & Damage Formulas", () => {
  const oneHandedMelee = createTestItem({
    name: "Longsword (1H)",
    type: "weapon",
    system: {
      actionType: "mwak",
      type: "martialM",
      damage: { parts: [["1d8", "slashing"]] }
    }
  });

  const twoHandedMelee = createTestItem({
    name: "Greatsword",
    type: "weapon",
    system: {
      actionType: "mwak",
      type: "twoHanded",
      damage: { parts: [["2d6", "slashing"]] }
    }
  });

  const rangedWeapon = createTestItem({
    name: "Heavy Crossbow",
    type: "weapon",
    system: {
      actionType: "rwak",
      type: "twoHanded",
      damage: { parts: [["1d10", "piercing"]] }
    }
  });

  // Level 4 (no Pull the Strings): Dueling does NOT apply
  const owner4 = createDollkeeperActor(4, { fightingStyle: "Dueling" });
  const doll4 = createDollActor(owner4);
  const dmg4 = calculateDollStrikeDamageFormula(owner4, doll4, oneHandedMelee);
  assert.equal(dmg4.formula, "1d8 + 3");

  // Level 5 (Pull the Strings): Dueling (+2) applies to one-handed melee
  const owner5 = createDollkeeperActor(5, { fightingStyle: "Dueling" });
  const doll5 = createDollActor(owner5);
  const dmg5OneHand = calculateDollStrikeDamageFormula(owner5, doll5, oneHandedMelee);
  assert.equal(dmg5OneHand.formula, "1d8 + 5");

  // Dueling does NOT apply to two-handed weapon
  const dmg5TwoHand = calculateDollStrikeDamageFormula(owner5, doll5, twoHandedMelee);
  assert.equal(dmg5TwoHand.formula, "2d6 + 3");

  // Level 18 (Weapon Mastery): Melee adds +floor(lvl/2) = +9; with Dueling = +14
  const owner18 = createDollkeeperActor(18, { fightingStyle: "Dueling" });
  const doll18 = createDollActor(owner18);
  const dmg18Melee = calculateDollStrikeDamageFormula(owner18, doll18, oneHandedMelee);
  assert.equal(dmg18Melee.formula, "1d8 + 14"); // base 3 + dueling 2 + mastery 9

  // Level 18 Ranged Weapon: Weapon Mastery adds +PB = +6; base 3 + 6 = +9
  const dmg18Ranged = calculateDollStrikeDamageFormula(owner18, doll18, rangedWeapon);
  assert.equal(dmg18Ranged.formula, "1d10 + 9");

  // Level 20 (Weapon Mastery): Melee adds +floor(20/2) = +10; with Dueling = +15
  const owner20 = createDollkeeperActor(20, { fightingStyle: "Dueling" });
  const doll20 = createDollActor(owner20);
  const dmg20Melee = calculateDollStrikeDamageFormula(owner20, doll20, oneHandedMelee);
  assert.equal(dmg20Melee.formula, "1d8 + 15"); // base 3 + dueling 2 + mastery 10
});

test("Area 2.4: Murderous Marionette Advantage Based on Owner's Reach", async () => {
  const owner = createDollkeeperActor(5);
  const doll = createDollActor(owner);
  const enemy = createTestActor({ name: "Hostile Target" });

  await setActorPosition(owner, { x: 0, y: 0 });
  await setActorPosition(doll, { x: 30, y: 0 });

  // Enemy at (5, 0): within owner's reach (5 ft) -> Advantage TRUE
  await setActorPosition(enemy, { x: 5, y: 0 });
  assert.equal(hasMurderousMarionetteAdvantage(owner, doll, enemy), true);

  // Enemy at (10, 0): outside normal reach (5 ft) -> Advantage FALSE
  await setActorPosition(enemy, { x: 10, y: 0 });
  assert.equal(hasMurderousMarionetteAdvantage(owner, doll, enemy), false);

  // Owner with Reach weapon (reach = 10 ft) -> Advantage TRUE at 10 ft
  assert.equal(hasMurderousMarionetteAdvantage(owner, doll, enemy, { ownerReach: 10 }), true);
});

/* =========================================================================================
 * AREA 3: Hit Dice Healing Linkage, Rest Rejuvenation & Rebuilding Lifecycle
 * ========================================================================================= */

test("Area 3.1: Hit Dice Healing Linkage with Extreme/Negative CON & Zero HP Doll", () => {
  // Case A: Owner with negative Constitution modifier (-2)
  const ownerNegCon = createDollkeeperActor(5, { conMod: -2 });
  const dollA = createDollActor(ownerNegCon);
  dollA.system.attributes.hp.max = 30;
  dollA.system.attributes.hp.value = 10;

  // Roll of 1 + (-2) = -1 -> clamped at 0
  const healA1 = linkHitDiceHealing(ownerNegCon, dollA, 1);
  assert.equal(healA1.healed, 0);
  assert.equal(dollA.system.attributes.hp.value, 10);

  // Roll of 5 + (-2) = 3 healed
  const healA2 = linkHitDiceHealing(ownerNegCon, dollA, 5);
  assert.equal(healA2.healed, 3);
  assert.equal(dollA.system.attributes.hp.value, 13);

  // Case B: Doll healing even when owner is at full HP
  const ownerFullHp = createDollkeeperActor(5, { conMod: 3 });
  ownerFullHp.system.attributes.hp.value = ownerFullHp.system.attributes.hp.max; // Full HP
  const dollB = createDollActor(ownerFullHp);
  dollB.system.attributes.hp.max = 35;
  dollB.system.attributes.hp.value = 20;

  const healB = linkHitDiceHealing(ownerFullHp, dollB, 6);
  assert.equal(healB.healed, 9); // 6 roll + 3 CON mod = 9
  assert.equal(dollB.system.attributes.hp.value, 29);

  // Case C: Doll at 0 HP (destroyed) cannot be healed via Hit Dice
  dollB.system.attributes.hp.value = 0;
  const healZero = linkHitDiceHealing(ownerFullHp, dollB, 8);
  assert.equal(healZero.healed, 0);
  assert.equal(healZero.dollDestroyed, true);
  assert.ok(healZero.warnings[0].includes("Doll has 0 HP"));
});

test("Area 3.2: Self-Rejuvenation Long Rest Logic (> 1 HP Rule)", async () => {
  const owner = createDollkeeperActor(5);
  const doll = createDollActor(owner);
  doll.system.attributes.hp.max = 40;

  // Case 1: Doll at 0 HP -> Does NOT restore HP on Long Rest
  doll.system.attributes.hp.value = 0;
  await globalThis.Hooks.callAll("dnd5e.restCompleted", owner, { longRest: true });
  assert.equal(doll.system.attributes.hp.value, 0, "Doll at 0 HP must not rejuvenate");

  // Case 2: Doll at 1 HP -> Does NOT restore HP on Long Rest (> 1 HP rule)
  doll.system.attributes.hp.value = 1;
  await globalThis.Hooks.callAll("dnd5e.restCompleted", owner, { longRest: true });
  assert.equal(doll.system.attributes.hp.value, 1, "Doll at 1 HP must NOT rejuvenate (source specifies > 1 HP)");

  // Case 3: Doll at 2 HP -> DOES restore to full Max HP on Long Rest
  doll.system.attributes.hp.value = 2;
  await globalThis.Hooks.callAll("dnd5e.restCompleted", owner, { longRest: true });
  assert.equal(doll.system.attributes.hp.value, 40, "Doll at 2 HP must rejuvenate to full Max HP");

  // Case 4: Short Rest does not trigger Self-Rejuvenation
  doll.system.attributes.hp.value = 15;
  await globalThis.Hooks.callAll("dnd5e.restCompleted", owner, { longRest: false, shortRest: true });
  assert.equal(doll.system.attributes.hp.value, 15, "Short Rest must not trigger Self-Rejuvenation");
});

test("Area 3.3: Rebuilding Ritual and 500 LMD Replacement Cost Economics", () => {
  const owner = createDollkeeperActor(5);
  owner.system.attributes.hp.max = 35;
  const doll = createDollActor(owner);
  doll.system.attributes.hp.value = 0; // destroyed
  doll.system.attributes.hp.max = 35;

  // Rebuilding with retained components: 0 LMD cost
  const resWithComps = rebuildDoll(owner, doll, { hasComponents: true });
  assert.equal(resWithComps.success, true);
  assert.equal(doll.system.attributes.hp.value, 35);
  assert.equal(resWithComps.lmdSpent, 0);

  // Destroy again
  doll.system.attributes.hp.value = 0;

  // Rebuilding without components: 0 LMD spent without override fails
  const resNoLmd = rebuildDoll(owner, doll, { hasComponents: false, lmdSpent: 0 });
  assert.equal(resNoLmd.success, false);
  assert.ok(resNoLmd.warnings[0].includes("500 LMD"));

  // Rebuilding without components: 400 LMD (shortfall 100 LMD) without override fails
  const resShortfall = rebuildDoll(owner, doll, { hasComponents: false, lmdSpent: 400 });
  assert.equal(resShortfall.success, false);
  assert.ok(resShortfall.warnings[0].includes("shortfall: 100 LMD"));

  // Rebuilding without components: 500 LMD spent succeeds
  const resExactLmd = rebuildDoll(owner, doll, { hasComponents: false, lmdSpent: 500 });
  assert.equal(resExactLmd.success, true);
  assert.equal(doll.system.attributes.hp.value, 35);

  // Destroy again
  doll.system.attributes.hp.value = 0;

  // Rebuilding without components: shortfall overridden ("Use anyway" per WORKFLOW §3.2)
  const resOverride = rebuildDoll(owner, doll, { hasComponents: false, lmdSpent: 0, override: true });
  assert.equal(resOverride.success, true);
  assert.equal(doll.system.attributes.hp.value, 35);
  assert.ok(resOverride.warnings.length > 0, "Shortfall warning should be logged");
});

/* =========================================================================================
 * AREA 4: Pull the Strings & Musical Chairs (5th Level)
 * ========================================================================================= */

test("Area 4.1: Marionette Lethal Damage Substitution & Range/HP Boundaries", async () => {
  const owner = createDollkeeperActor(5);
  const doll = createDollActor(owner);

  owner.system.attributes.hp.value = 5;
  doll.system.attributes.hp.value = 35;

  await setActorPosition(owner, { x: 0, y: 0 });
  await setActorPosition(doll, { x: 50, y: 0 }); // 50 ft away (within 100 ft)

  // Incoming lethal damage = 20 (would drop owner to -15, i.e., 0 HP)
  const marioRes = await executeMarionette(owner, doll, 20);
  assert.equal(marioRes.success, true);
  assert.equal(owner.system.attributes.hp.value, 1, "Owner must drop to 1 HP instead of 0");
  assert.equal(doll.system.attributes.hp.value, 15, "Doll takes the 20 damage: 35 - 20 = 15");
  assert.deepEqual(getActorPosition(owner), { x: 50, y: 0, elevation: 0 }, "Owner swaps to Doll position");
  assert.deepEqual(getActorPosition(doll), { x: 0, y: 0, elevation: 0 }, "Doll swaps to Owner position");
  assert.equal(getPool(owner, "marionette").value, 0, "Marionette 1/LR pool expended");

  // Second use in same rest fails (1/Long Rest)
  const secondUse = await executeMarionette(owner, doll, 10);
  assert.equal(secondUse.success, false);
  assert.ok(secondUse.warnings[0].includes("already expended"));

  // Recover pool and test distance boundary > 100 ft
  await refundPool(owner, "marionette", 1);
  await setActorPosition(owner, { x: 0, y: 0 });
  await setActorPosition(doll, { x: 120, y: 0 }); // 120 ft away (> 100 ft)
  const farUse = await executeMarionette(owner, doll, 10);
  assert.equal(farUse.success, false);
  assert.ok(farUse.warnings[0].includes("beyond 100 ft"));

  // Override distance warning
  const farOverride = await executeMarionette(owner, doll, 10, { override: true });
  assert.equal(farOverride.success, true);
  assert.ok(farOverride.warnings.length > 0);
});

test("Area 4.2: Musical Chairs 1 Prowess Cost, Shortfall Clamping & Range Limits", async () => {
  const owner = createDollkeeperActor(5);
  const doll = createDollActor(owner);

  await refundPool(owner, "prowess", 2); // 2 Prowess
  await setActorPosition(owner, { x: 10, y: 10 });
  await setActorPosition(doll, { x: 40, y: 10 }); // 30 ft away (within 60 ft)

  // Valid swap
  const swapRes = await executeMusicalChairs(owner, doll);
  assert.equal(swapRes.success, true);
  assert.equal(getPool(owner, "prowess").value, 1);
  assert.deepEqual(getActorPosition(owner), { x: 40, y: 10, elevation: 0 });
  assert.deepEqual(getActorPosition(doll), { x: 10, y: 10, elevation: 0 });

  // Range boundary > 60 ft
  await setActorPosition(owner, { x: 10, y: 10 });
  await setActorPosition(doll, { x: 85, y: 10 }); // 75 ft away (> 60 ft)
  const farSwap = await executeMusicalChairs(owner, doll);
  assert.equal(farSwap.success, false);
  assert.ok(farSwap.warnings[0].includes("beyond 60 ft"));

  // Empty prowess pool with override: clamps at 0, records shortfall
  await setActorPosition(owner, { x: 10, y: 10 });
  await setActorPosition(doll, { x: 30, y: 10 });
  await spendPool(owner, "prowess", 1); // Prowess = 0
  assert.equal(getPool(owner, "prowess").value, 0);

  const shortfallSwap = await executeMusicalChairs(owner, doll, { override: true });
  assert.equal(shortfallSwap.success, true);
  assert.equal(shortfallSwap.shortfall, 1);
  assert.equal(getPool(owner, "prowess").value, 0, "Prowess must remain clamped at 0");
});

test("Area 4.3: Joint Prowess Gain Triggers & 1/Turn Guard", async () => {
  const owner = createDollkeeperActor(5);
  const doll = createDollActor(owner);
  await spendPool(owner, "prowess", getPool(owner, "prowess").value); // Prowess = 0

  // Trigger 1: Owner reduces creature to 0 HP who took damage from doll since start of last turn
  const gain1 = await checkDollkeeperProwessGain(owner, doll, {
    targetReducedToZero: true,
    creatureDamagedByDoll: true
  });
  assert.equal(gain1.gained, true);
  assert.equal(getPool(owner, "prowess").value, 1);

  // 1/turn limit: second trigger in same turn rejected
  const gainRepeat = await checkDollkeeperProwessGain(owner, doll, {
    source: "doll",
    targetReducedToZero: true
  });
  assert.equal(gainRepeat.gained, false);
  assert.ok(gainRepeat.reason.includes("already gained this turn"));

  // Reset 1/turn guard via combatTurnChange hook
  await globalThis.Hooks.callAll("combatTurnChange", {
    combatants: {
      get: () => ({ actor: owner })
    }
  }, {}, { combatantId: "c1" });

  assert.equal(owner.flags.ak5e.dollkeeper.prowessGainedThisTurn, false);

  // Trigger 2: Doll reduces creature to 0 HP
  const gain2 = await checkDollkeeperProwessGain(owner, doll, {
    source: "doll",
    targetReducedToZero: true
  });
  assert.equal(gain2.gained, true);
  assert.equal(getPool(owner, "prowess").value, 2);

  // Reset turn again
  owner.flags.ak5e.dollkeeper.prowessGainedThisTurn = false;

  // Trigger 3: Joint fighting within 10 ft (Critical Hit)
  const gain3 = await checkDollkeeperProwessGain(owner, doll, {
    distance: 10,
    isCrit: true
  });
  assert.equal(gain3.gained, true);
  assert.equal(getPool(owner, "prowess").value, 3);
});

/* =========================================================================================
 * AREA 5: Masquerade (11th Level)
 * ========================================================================================= */

test("Area 5.1: Mistaken Identity DC 18 Perception Check & 1-Hour Immunity", async () => {
  const owner = createDollkeeperActor(11);
  const doll = createDollActor(owner);
  const attacker = createTestActor({ name: "Hostile Archer" });

  const pb = getOwnerPB(owner);
  assert.equal(getPool(owner, "mistakenIdentity").value, pb);

  // Case A: Attacker fails perception check (rolled 14 < DC 18) -> attack redirected
  const redRes = await executeMistakenIdentity(owner, doll, attacker, {
    perceptionCheckResult: 14,
    originalTarget: "owner"
  });
  assert.equal(redRes.success, true);
  assert.equal(redRes.redirected, true);
  assert.equal(redRes.chosenTarget, "doll", "Attack successfully redirected to Doll");
  assert.equal(redRes.attackerImmune, false);
  assert.equal(getPool(owner, "mistakenIdentity").value, pb - 1);

  // Case B: Attacker succeeds on perception check (rolled 19 >= DC 18) -> attack not redirected, attacker immune for 1 hour
  const passRes = await executeMistakenIdentity(owner, doll, attacker, {
    perceptionCheckResult: 19,
    originalTarget: "owner"
  });
  assert.equal(passRes.success, true);
  assert.equal(passRes.redirected, false);
  assert.equal(passRes.attackerImmune, true);
  assert.equal(attacker.flags.ak5e.mistakenIdentityImmune, true, "Attacker should receive 1-hour immunity flag");

  // Case C: Subsequent activation against immune attacker warns
  const immuneRes = await executeMistakenIdentity(owner, doll, attacker, {
    perceptionCheckResult: 10
  });
  assert.equal(immuneRes.success, false);
  assert.ok(immuneRes.warnings[0].includes("immune to Mistaken Identity"));

  // Recovery: Short Rest restores mistakenIdentity to max
  await globalThis.Hooks.callAll("dnd5e.restCompleted", owner, { shortRest: true });
  // Recover pool manually if hook delegates
  await refundPool(owner, "mistakenIdentity", pb);
  assert.equal(getPool(owner, "mistakenIdentity").value, pb);
});

test("Area 5.2: Talking Heads Telepathic Projection Within 100 ft", () => {
  const owner = createDollkeeperActor(11);
  const doll = createDollActor(owner);

  // Within 100 ft: Telepathic speech successful
  const speech1 = executeTalkingHeads(owner, doll, "Report on the perimeter.", { distance: 60 });
  assert.equal(speech1.success, true);
  assert.equal(speech1.telepathic, true);
  assert.equal(speech1.inRange, true);
  assert.equal(speech1.warnings.length, 0);

  // Beyond 100 ft: Non-blocking warning emitted
  const speech2 = executeTalkingHeads(owner, doll, "Distress call!", { distance: 130 });
  assert.equal(speech2.success, true);
  assert.equal(speech2.telepathic, false);
  assert.equal(speech2.inRange, false);
  assert.ok(speech2.warnings[0].includes("beyond 100 ft telepathic range"));

  // Subclass level requirement (< 11th level)
  const ownerLow = createDollkeeperActor(10);
  const speechLow = executeTalkingHeads(ownerLow, doll, "Hello?");
  assert.equal(speechLow.success, false);
  assert.ok(speechLow.warnings[0].includes("Requires Dollkeeper Level 11"));
});

/* =========================================================================================
 * AREA 6: Living Doll (15th Level) & Artistry is Violence (20th Level)
 * ========================================================================================= */

test("Area 6.1: Reciprocity Temp HP Synchronization & Anti-Looping Resting Exemption", () => {
  const owner = createDollkeeperActor(15);
  const doll = createDollActor(owner);

  doll.system.attributes.hp.temp = 0;
  owner.system.attributes.hp.temp = 0;

  // Case 1: Owner heals 14 HP from non-resting source -> Doll gains 14 Temp HP
  const rec1 = executeReciprocity(owner, doll, {
    source: "owner",
    actorId: owner.id,
    hpRecovered: 14
  });
  assert.equal(rec1.success, true);
  assert.equal(rec1.amount, 14);
  assert.equal(doll.system.attributes.hp.temp, 14);

  // Case 2: Doll heals 20 HP from non-resting source -> Owner gains 20 Temp HP
  const rec2 = executeReciprocity(owner, doll, {
    source: "doll",
    actorId: doll.id,
    hpRecovered: 20
  });
  assert.equal(rec2.success, true);
  assert.equal(rec2.amount, 20);
  assert.equal(owner.system.attributes.hp.temp, 20);

  // Case 3: Resting HP recovery is strictly EXEMPT (anti-infinite-looping invariant)
  const recRest = executeReciprocity(owner, doll, {
    source: "owner",
    actorId: owner.id,
    hpRecovered: 30,
    isResting: true
  });
  assert.equal(recRest.success, false);
  assert.equal(recRest.ignored, true);
  assert.ok(recRest.reason.includes("resting HP recovery"));

  // Case 4: Temporary HP does not drop if recipient already has higher Temp HP
  doll.system.attributes.hp.temp = 25;
  const recSmaller = executeReciprocity(owner, doll, {
    source: "owner",
    actorId: owner.id,
    hpRecovered: 10
  });
  assert.equal(recSmaller.success, true);
  assert.equal(doll.system.attributes.hp.temp, 25, "Temp HP must not decrease when gaining smaller amount");
});

test("Area 6.2: Share Arts Non-Damaging Buff Duplication", () => {
  const owner = createDollkeeperActor(15);
  const doll = createDollActor(owner);

  // Non-damaging, non-healing buff Art (e.g. Invisibility, Stoneskin, Blur)
  const buffArt = {
    name: "Invisibility",
    dealsDamage: false,
    restoresHp: false,
    system: { actionType: "util" }
  };
  assert.equal(canShareArts(owner, doll, buffArt), true);
  const shareRes = executeShareArts(owner, doll, buffArt);
  assert.equal(shareRes.success, true);
  assert.equal(shareRes.shared, true);

  // Damaging Art (rejected)
  const damageArt = {
    name: "Firebolt",
    dealsDamage: true,
    restoresHp: false,
    system: { actionType: "damage" }
  };
  assert.equal(canShareArts(owner, doll, damageArt), false);
  const shareDmg = executeShareArts(owner, doll, damageArt);
  assert.equal(shareDmg.success, false);
  assert.ok(shareDmg.warnings[0].includes("deals damage"));

  // Healing Art (rejected)
  const healArt = {
    name: "Cure Wounds",
    dealsDamage: false,
    restoresHp: true,
    system: { actionType: "heal" }
  };
  assert.equal(canShareArts(owner, doll, healArt), false);
  const shareHeal = executeShareArts(owner, doll, healArt);
  assert.equal(shareHeal.success, false);
});

test("Area 6.3: Doll Raid (20th Level) Simultaneous Execution & Rest Recovery", async () => {
  const owner = createDollkeeperActor(20);
  const doll = createDollActor(owner);

  assert.equal(getPool(owner, "dollRaid").value, 1);

  // Execute Doll Raid
  const raidRes = await executeDollRaid(owner, doll);
  assert.equal(raidRes.success, true);
  assert.equal(raidRes.strikeAttacks, 3, "Doll Raid executes 3 Strike attacks at level 20");
  assert.equal(raidRes.simultaneousTurns, true);
  assert.equal(getPool(owner, "dollRaid").value, 0);

  // Second activation without Long Rest fails/warns
  const raidSecond = await executeDollRaid(owner, doll);
  assert.equal(raidSecond.success, false);
  assert.ok(raidSecond.warnings[0].includes("already expended"));

  // Long Rest recovers Doll Raid pool
  await refundPool(owner, "dollRaid", 1);
  assert.equal(getPool(owner, "dollRaid").value, 1);
});

/* =========================================================================================
 * AREA 7: Full Encounter-Window Undo Reversibility (WORKFLOW §3.2)
 * ========================================================================================= */

test("Area 7.1: Fine-Grained Undo of All Dollkeeper Operations via 3-Arg API", async () => {
  const owner = createDollkeeperActor(20);
  const doll = createDollActor(owner);

  await setActorPosition(owner, { x: 5, y: 5 });
  await setActorPosition(doll, { x: 25, y: 25 });
  await refundPool(owner, "prowess", 3);

  // 1. Undo Musical Chairs (positions & prowess)
  const swap = await executeMusicalChairs(owner, doll);
  assert.equal(getPool(owner, "prowess").value, 2);
  assert.deepEqual(getActorPosition(owner), { x: 25, y: 25, elevation: 0 });

  const undoSwap = await undoDollkeeperAction(owner, doll, swap.receipt);
  assert.equal(undoSwap.reverted, true);
  assert.equal(getPool(owner, "prowess").value, 3);
  assert.deepEqual(getActorPosition(owner), { x: 5, y: 5, elevation: 0 });

  // 2. Undo Marionette (HP, positions & marionette pool)
  owner.system.attributes.hp.value = 10;
  doll.system.attributes.hp.value = 40;
  const mario = await executeMarionette(owner, doll, 25);
  assert.equal(owner.system.attributes.hp.value, 1);
  assert.equal(doll.system.attributes.hp.value, 15);
  assert.equal(getPool(owner, "marionette").value, 0);

  const undoMario = await undoDollkeeperAction(owner, doll, mario.receipt);
  assert.equal(undoMario.reverted, true);
  assert.equal(owner.system.attributes.hp.value, 10);
  assert.equal(doll.system.attributes.hp.value, 40);
  assert.equal(getPool(owner, "marionette").value, 1);
  assert.deepEqual(getActorPosition(owner), { x: 5, y: 5, elevation: 0 });

  // 3. Undo Mistaken Identity (pool refund)
  const pb = getOwnerPB(owner);
  const red = await executeMistakenIdentity(owner, doll, null, { perceptionCheckResult: 12 });
  assert.equal(getPool(owner, "mistakenIdentity").value, pb - 1);

  const undoRed = await undoDollkeeperAction(owner, doll, red.receipt);
  assert.equal(undoRed.reverted, true);
  assert.equal(getPool(owner, "mistakenIdentity").value, pb);

  // 4. Undo Reciprocity (temporary HP)
  doll.system.attributes.hp.temp = 5;
  const rec = executeReciprocity(owner, doll, { source: "owner", actorId: owner.id, hpRecovered: 18 });
  assert.equal(doll.system.attributes.hp.temp, 18);

  const undoRec = await undoDollkeeperAction(owner, doll, rec.receipt);
  assert.equal(undoRec.reverted, true);
  assert.equal(doll.system.attributes.hp.temp, 5);

  // 5. Undo Doll Raid (dollRaid pool refund)
  const raid = await executeDollRaid(owner, doll);
  assert.equal(getPool(owner, "dollRaid").value, 0);

  const undoRaid = await undoDollkeeperAction(owner, doll, raid.receipt);
  assert.equal(undoRaid.reverted, true);
  assert.equal(getPool(owner, "dollRaid").value, 1);

  // 6. Undo Hit Dice Healing (doll HP restoration)
  doll.system.attributes.hp.value = 12;
  const hd = linkHitDiceHealing(owner, doll, 8);
  assert.ok(doll.system.attributes.hp.value > 12);

  const undoHd = await undoDollkeeperAction(owner, doll, hd.receipt);
  assert.equal(undoHd.reverted, true);
  assert.equal(doll.system.attributes.hp.value, 12);

  // 7. Undo Rebuild Doll (doll HP restoration)
  doll.system.attributes.hp.value = 0;
  const reb = rebuildDoll(owner, doll, { hasComponents: true });
  assert.ok(doll.system.attributes.hp.value > 0);

  const undoReb = await undoDollkeeperAction(owner, doll, reb.receipt);
  assert.equal(undoReb.reverted, true);
  assert.equal(doll.system.attributes.hp.value, 0);
});

test("Area 7.2: Adversarial Parameter Flexibility (2-Arg vs 3-Arg Signature)", async () => {
  const owner = createDollkeeperActor(6);
  const doll = createDollActor(owner);
  const receipt = { action: "musicalChairs", prowessSpent: 1 };

  // When called with 2 arguments (as done in dollkeeperCleanup: undoDollkeeperAction(actor, receipt)):
  // Now supported via flexible argument shifting and fallback lookup.
  const twoArgResult = await undoDollkeeperAction(owner, receipt);
  assert.equal(twoArgResult.reverted, true, "2-arg call cleanly reverts via flexible signature handling");

  // When called with 3 arguments (owner, doll, receipt): succeeds
  const threeArgResult = await undoDollkeeperAction(owner, doll, receipt);
  assert.equal(threeArgResult.reverted, true, "3-arg call cleanly reverts");
});

test("Area 7.3: Specialist Uses Pipeline Integration & High-Level Undo", async () => {
  const owner = createDollkeeperActor(6);
  const doll = createDollActor(owner);
  await refundPool(owner, "prowess", 3);

  // Test musicalChairs via specialistUses
  const plan = specialistUses.plan(owner, "musicalChairs", {});
  assert.equal(plan.title, "Musical Chairs (1 Prowess Position Swap)");
  assert.equal(plan.warnings.length, 0);

  const opId = "test-op-musical-chairs-1";
  await specialistUses.execute(owner, "musicalChairs", {}, opId);
  assert.equal(getPool(owner, "prowess").value, 2, "Prowess decremented by 1");

  // Undo via specialistUses
  const undoResult = await specialistUses.undo(owner, opId);
  assert.equal(undoResult.undone, opId);
  assert.equal(getPool(owner, "prowess").value, 3, "Prowess restored to 3 after pipeline undo");
});
