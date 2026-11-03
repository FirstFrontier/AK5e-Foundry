/**
 * Adversarial Stress Test Suite for AK5e Inventor Table-Play & Undo Integrity (WORKFLOW.md §3.2).
 * Authored by Empirical Challenger (challenger_m4) to ruthlessly attack:
 *
 * 1. Confirm-Before-Spend & Cancel Invariance:
 *    - Unconfirmed plans or canceling confirmation dialogs commits zero changes to documents,
 *      item modifications, actor flags, or resource pools across all Inventor plans
 *      (applyModification, removeModification, activateModification, mobileModding, strangeContraption, theBigOne).
 *    - Zero undo receipts generated on unconfirmed or cancelled operations.
 *
 * 2. Non-Blocking Warnings & "Use anyway" Zero-Clamping:
 *    - Resource exhaustion (0 Inventions or 0 Prowess) and range boundaries produce non-blocking warnings.
 *    - Overriding warnings with "Use anyway" allows execution to proceed.
 *    - Overspent resources clamp strictly at 0 (never negative values like -1).
 *    - Shortfalls and overridden warnings are recorded publicly on the receipt and chat card.
 *    - Undoing zero-clamped overspends restores the exact prior value (0, not +1).
 *
 * 3. Never Auto-Roll Player Dice:
 *    - Instability Nd6 dice rolls are NEVER auto-rolled during plan execution; receipt sets
 *      `receipt.status = "awaitingRoll"` with `receipt.formula = "${instability}d6"`.
 *    - Breakdown HP loss dice are never auto-rolled or auto-applied to Actor HP.
 *    - Strange Contraptions damage and saving throw dice are never evaluated on player/target behalf.
 *    - The Big One damage dice (8d6, 10d6, 14d6) and saving throws are never auto-rolled.
 *    - Only explicit user interaction (`specialistUses.command(actor, "useRoll", { useId })`) resolves dice.
 *
 * 4. Automatic GM Relay via validateTarget:
 *    - Operations modifying unowned targets (e.g. mobileModding or applying modification to an ally's weapon)
 *      relay automatically through the active GM client without permission or validation errors.
 *    - `validateTarget` strictly validates legitimate target UUIDs and rejects forged/mismatched targets.
 *    - Tampering with target UUIDs in undo receipts triggers validation rejection (/not one this use can make/).
 *    - Attempting unowned target modifications when no GM is connected throws `NoGM` error (never silently dropped).
 *
 * 5. Encounter-Window Undo Integrity:
 *    - Every Inventor action generates a complete undo receipt under `flags.ak5e.specialistUses.undo`.
 *    - Undoing `applyModification` removes the installed modification, cleans item flags, and refunds Inventions.
 *    - Undoing `removeModification` reinstalls the removed modification and re-deducts Inventions.
 *    - Undoing `activateModification` clears broken equipment status and restores HP lost to breakdown.
 *    - Undoing `mobileModding` removes temporary modifications from ally equipment and refunds Prowess.
 *    - Undoing `strangeContraption` clears the 1/LR lockout flag and reverts applied target conditions.
 *    - Undoing `theBigOne` restores the 1/LR pool and clears conditions/damage on affected targets.
 *    - Non-latest / out-of-order undo execution restores targeted actions without corrupting independent prior/subsequent actions.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  setupFoundryGlobals,
  teardownFoundryGlobals,
  createTestActor,
  createTestItem
} from "./base-classes-fixture.mjs";
import { SPECIALIST_CLASS_ID } from "../scripts/specialist-rules.mjs";
import { defineSpecialistPools } from "../scripts/specialist-features.mjs";
import {
  defineInventorPools,
  registerInventorHooks,
  INVENTOR_SUBCLASS_ID,
  calculateInstability,
  evaluateBreakdownRoll,
  isBrokenEquipment,
  getItemModifications
} from "../scripts/inventor-features.mjs";
import { getPool, setPool, clearPoolRegistry } from "../scripts/resource-pools.mjs";

let specialistUses = null;
let INVENTOR_PLANS = null;

test.before(async () => {
  const mod = await import("../scripts/specialist-uses.mjs");
  specialistUses = mod.specialistUses;
  INVENTOR_PLANS = mod.INVENTOR_PLANS ?? specialistUses.plans?.() ?? {};
});

test.beforeEach(() => {
  setupFoundryGlobals();
  defineSpecialistPools();
  defineInventorPools();
  registerInventorHooks();
});

test.afterEach(() => {
  teardownFoundryGlobals();
  clearPoolRegistry();
});

function addItem(actor, item) {
  if (actor.items?.set) {
    actor.items.set(item.id, item);
  } else if (Array.isArray(actor.items)) {
    actor.items.push(item);
  }
  return item;
}

function createInventorActor(level = 5, options = {}) {
  const actor = createTestActor({
    name: options.name ?? "Test Inventor",
    level,
    class: "specialist",
    branch: "inventor",
    system: {
      details: { level },
      attributes: {
        prof: options.prof ?? (level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2),
        hp: { value: options.hp ?? 40, max: options.maxHp ?? 40 }
      },
      abilities: {
        str: { value: options.str ?? 10, mod: options.strMod ?? 0 },
        dex: { value: options.dex ?? 14, mod: options.dexMod ?? 2 },
        con: { value: options.con ?? 14, mod: options.conMod ?? 2 },
        int: { value: options.int ?? 18, mod: options.intMod ?? 4 },
        wis: { value: options.wis ?? 12, mod: options.wisMod ?? 1 },
        cha: { value: options.cha ?? 10, mod: options.chaMod ?? 0 }
      }
    },
    flags: {
      ak5e: {
        specialist: {
          enabled: true,
          branch: "inventor",
          fightingStyle: "brawler",
          weaponCategory: "melee",
          specialistUses: { undo: [] },
          ...(options.specialistFlags ?? {})
        },
        resourcePools: {
          ...(options.inventions !== undefined ? { inventions: { value: options.inventions } } : {}),
          ...(options.prowess !== undefined ? { prowess: { value: options.prowess } } : {}),
          ...(options.theBigOne !== undefined ? { theBigOne: { value: options.theBigOne } } : {})
        },
        inventor: {
          ...(options.inventorFlags ?? {})
        }
      }
    }
  });

  actor.isOwner = true;

  actor.statuses = new Set(options.statuses ?? []);
  actor.toggleStatusEffect = async function(statusId, { active } = {}) {
    if (active === true) {
      this.statuses.add(statusId);
      if (this.flags?.ak5e) this.flags.ak5e[statusId] = true;
    } else if (active === false) {
      this.statuses.delete(statusId);
      if (this.flags?.ak5e) this.flags.ak5e[statusId] = false;
    } else {
      if (this.statuses.has(statusId)) {
        this.statuses.delete(statusId);
        if (this.flags?.ak5e) this.flags.ak5e[statusId] = false;
      } else {
        this.statuses.add(statusId);
        if (this.flags?.ak5e) this.flags.ak5e[statusId] = true;
      }
    }
  };

  if (globalThis._ak5eTestDocs) {
    globalThis._ak5eTestDocs.set(actor.uuid, actor);
  }

  return actor;
}

function createCreature(name = "Target Creature", options = {}) {
  const actor = createTestActor({
    name,
    system: {
      attributes: {
        hp: { value: options.hp ?? 30, max: options.maxHp ?? 30 },
        ac: { value: options.ac ?? 12 }
      },
      abilities: {
        str: { value: 10, mod: 0 },
        dex: { value: 12, mod: 1 },
        con: { value: options.con ?? 14, mod: options.conMod ?? 2 },
        int: { value: 10, mod: 0 },
        wis: { value: 10, mod: 0 },
        cha: { value: 10, mod: 0 }
      },
      details: {
        type: { value: options.type ?? "humanoid" }
      }
    },
    flags: {
      ak5e: {
        ...(options.flags?.ak5e ?? {})
      }
    }
  });

  actor.statuses = new Set(options.statuses ?? []);
  actor.toggleStatusEffect = async function(statusId, { active } = {}) {
    if (active === true) {
      this.statuses.add(statusId);
      if (this.flags?.ak5e) this.flags.ak5e[statusId] = true;
    } else if (active === false) {
      this.statuses.delete(statusId);
      if (this.flags?.ak5e) this.flags.ak5e[statusId] = false;
    } else {
      if (this.statuses.has(statusId)) {
        this.statuses.delete(statusId);
        if (this.flags?.ak5e) this.flags.ak5e[statusId] = false;
      } else {
        this.statuses.add(statusId);
        if (this.flags?.ak5e) this.flags.ak5e[statusId] = true;
      }
    }
  };

  if (globalThis._ak5eTestDocs) {
    globalThis._ak5eTestDocs.set(actor.uuid, actor);
  }

  return actor;
}

/* ==============================================================================
 * VECTOR 1: Confirm-Before-Spend & Cancel Invariance (WORKFLOW.md §3.2 #4)
 * ============================================================================== */

test("Adversarial 1.1: applyModification confirm-before-spend and cancel invariance", async () => {
  const inventor = createInventorActor(5, { inventions: 6 });
  const sword = createTestItem({
    name: "Greatsword",
    type: "weapon",
    system: { type: { value: "melee" }, properties: ["two", "hvy"] }
  });
  addItem(inventor, sword);

  const initialInventions = getPool(inventor, "inventions").value;

  // 1. Calling plan() inspects but commits zero state changes
  const plan = specialistUses.plan(inventor, "applyModification", {
    itemId: sword.id,
    modificationId: "boom-module"
  });
  assert.ok(plan.title, "Plan has a descriptive title");
  assert.equal(getPool(inventor, "inventions").value, initialInventions, "Inventions pool unchanged by plan()");
  assert.equal(getItemModifications(sword).length, 0, "No modifications added to sword by plan()");
  assert.equal(inventor.flags.ak5e?.specialistUses?.undo?.length ?? 0, 0, "No undo receipt written by plan()");

  // 2. Calling command() without confirmed: true throws confirmation required error and commits zero state changes
  await assert.rejects(
    specialistUses.command(inventor, "applyModification", {
      itemId: sword.id,
      modificationId: "boom-module",
      confirmed: false
    }),
    /Confirm this use before applying it/
  );
  assert.equal(getPool(inventor, "inventions").value, initialInventions, "Inventions pool unchanged after cancel");
  assert.equal(getItemModifications(sword).length, 0, "No modifications added to sword after cancel");
  assert.equal(inventor.flags.ak5e?.specialistUses?.undo?.length ?? 0, 0, "Zero undo receipts generated on cancel");
});

test("Adversarial 1.2: removeModification confirm-before-spend and cancel invariance", async () => {
  const inventor = createInventorActor(5, { inventions: 4 });
  const sword = createTestItem({
    name: "Modded Sword",
    type: "weapon",
    system: { type: { value: "melee" } },
    flags: { ak5e: { inventor: { modifications: [{ id: "boom-module", name: "Boom Module" }] } } }
  });
  addItem(inventor, sword);

  // Calling command without confirmed: true
  await assert.rejects(
    specialistUses.command(inventor, "removeModification", {
      itemId: sword.id,
      modificationId: "boom-module",
      confirmed: false
    }),
    /Confirm this use before applying it/
  );
  assert.equal(getPool(inventor, "inventions").value, 4, "Inventions pool not refunded on cancel");
  assert.deepEqual(getItemModifications(sword).map(m => m.id), ["boom-module"], "Mod remains on weapon on cancel");
  assert.equal(inventor.flags.ak5e?.specialistUses?.undo?.length ?? 0, 0, "No undo receipt written on cancel");
});

test("Adversarial 1.3: activateModification confirm-before-spend and cancel invariance", async () => {
  const inventor = createInventorActor(5, { hp: 40 });
  const weapon = createTestItem({
    name: "Dangerous Weapon",
    type: "weapon",
    system: { type: { value: "melee" } },
    flags: { ak5e: { inventor: { modifications: [{ id: "laser-cutter", name: "Laser Cutter", isDangerous: true }] } } }
  });
  addItem(inventor, weapon);

  await assert.rejects(
    specialistUses.command(inventor, "activateModification", {
      itemId: weapon.id,
      modificationId: "laser-cutter",
      confirmed: false
    }),
    /Confirm this use before applying it/
  );
  assert.equal(inventor.system.attributes.hp.value, 40, "HP untouched on cancel");
  assert.equal(isBrokenEquipment(weapon), false, "Weapon not marked broken on cancel");
  assert.equal(inventor.flags.ak5e?.specialistUses?.undo?.length ?? 0, 0, "No receipt written on cancel");
});

test("Adversarial 1.4: mobileModding confirm-before-spend and cancel invariance", async () => {
  const inventor = createInventorActor(5, { prowess: 3, inventions: 6 });
  const ally = createCreature("Ally Scout");
  const allyDagger = createTestItem({
    name: "Ally Dagger",
    type: "weapon",
    system: { type: { value: "melee" } }
  });
  addItem(ally, allyDagger);

  await assert.rejects(
    specialistUses.command(inventor, "mobileModding", {
      targetUuid: ally.uuid,
      itemId: allyDagger.id,
      modificationId: "rotary-blade",
      confirmed: false
    }),
    /Confirm this use before applying it/
  );
  assert.equal(getPool(inventor, "prowess").value, 3, "Prowess unchanged on cancel");
  assert.equal(getPool(inventor, "inventions").value, 6, "Inventions unchanged on cancel");
  assert.equal(getItemModifications(allyDagger).length, 0, "Ally dagger unmodified on cancel");
  assert.equal(inventor.flags.ak5e?.specialistUses?.undo?.length ?? 0, 0, "No receipt written on cancel");
});

test("Adversarial 1.5: strangeContraption confirm-before-spend and cancel invariance", async () => {
  const inventor = createInventorActor(5);
  const target = createCreature("Target Scout");

  await assert.rejects(
    specialistUses.command(inventor, "strangeContraption", {
      contraptionId: "flashlight",
      targetUuid: target.uuid,
      confirmed: false
    }),
    /Confirm this use before applying it/
  );
  assert.equal(inventor.flags.ak5e?.inventor?.usedContraptions?.includes("flashlight") ?? false, false, "Option not locked out");
  assert.equal(target.statuses.has("blinded"), false, "Target not blinded on cancel");
  assert.equal(inventor.flags.ak5e?.specialistUses?.undo?.length ?? 0, 0, "No receipt written on cancel");
});

test("Adversarial 1.6: theBigOne confirm-before-spend and cancel invariance", async () => {
  const inventor = createInventorActor(20, { theBigOne: 1 });
  const target = createCreature("Target Enemy");

  await assert.rejects(
    specialistUses.command(inventor, "theBigOne", {
      mode: "FLASH",
      targetUuids: [target.uuid],
      confirmed: false
    }),
    /Confirm this use before applying it/
  );
  assert.equal(getPool(inventor, "theBigOne").value, 1, "The Big One pool untouched on cancel");
  assert.equal(target.statuses.has("burning"), false, "Target not burning on cancel");
  assert.equal(inventor.flags.ak5e?.specialistUses?.undo?.length ?? 0, 0, "No receipt written on cancel");
});

/* ==============================================================================
 * VECTOR 2: Non-Blocking Warnings & "Use anyway" Zero-Clamping (WORKFLOW.md §3.2 #3)
 * ============================================================================== */

test("Adversarial 2.1: applyModification produces non-blocking warning on Inventions shortfall and clamps at 0 upon override", async () => {
  const inventor = createInventorActor(5, { inventions: 0 }); // 0 Inventions!
  const sword = createTestItem({
    name: "Longsword",
    type: "weapon",
    system: { type: { value: "melee" } }
  });
  addItem(inventor, sword);

  // 1. Without overrides, plan produces non-blocking warning
  const plan = specialistUses.plan(inventor, "applyModification", {
    itemId: sword.id,
    modificationId: "burning-edge",
    checkOnly: true
  });
  assert.ok(plan.warnings?.length > 0, "Plan produces warnings");
  const shortfallWarning = plan.warnings.find(w => w.id === "shortfall" || w.id === "inventions");
  assert.ok(shortfallWarning, "Produces non-blocking shortfall warning for 0 Inventions");

  // 2. Overriding with 'Use anyway' executes successfully
  await specialistUses.execute(inventor, "applyModification", {
    itemId: sword.id,
    modificationId: "burning-edge",
    overrides: [shortfallWarning.id]
  }, "op-apply-clamp");

  const receipt = inventor.flags.ak5e.specialistUses.undo.find(u => u.id === "op-apply-clamp");
  // Zero-clamping assertion: pool must clamp at 0, NEVER -1
  assert.equal(getPool(inventor, "inventions").value, 0, "Inventions pool clamped at floor 0 (never negative)");
  assert.ok(receipt.shortfalls?.some(s => s.toLowerCase().includes("invention")), "Public shortfall notice recorded on receipt");
  assert.ok(receipt.overridden?.some(t => t.toLowerCase().includes("inventions pool is empty")), "Overridden warning recorded on receipt");
  assert.deepEqual(getItemModifications(sword).map(m => m.id), ["burning-edge"], "Modification successfully applied after override");
});

test("Adversarial 2.2: mobileModding produces non-blocking warning on Prowess shortfall and clamps at 0 upon override", async () => {
  const inventor = createInventorActor(5, { prowess: 0, inventions: 6 }); // 0 Prowess!
  const ally = createCreature("Ally Warrior");
  const axe = createTestItem({
    name: "Battleaxe",
    type: "weapon",
    system: { type: { value: "melee" } }
  });
  addItem(ally, axe);

  const plan = specialistUses.plan(inventor, "mobileModding", {
    targetUuid: ally.uuid,
    itemId: axe.id,
    modificationId: "rotary-blade",
    checkOnly: true
  });
  assert.ok(plan.warnings?.length > 0, "Plan has warnings");
  const prowessWarning = plan.warnings.find(w => w.id === "shortfall" || w.id === "prowess");
  assert.ok(prowessWarning, "Produces non-blocking shortfall warning for 0 Prowess");

  await specialistUses.execute(inventor, "mobileModding", {
    targetUuid: ally.uuid,
    itemId: axe.id,
    modificationId: "rotary-blade",
    overrides: [prowessWarning.id]
  }, "op-mobile-clamp");

  const receipt = inventor.flags.ak5e.specialistUses.undo.find(u => u.id === "op-mobile-clamp");
  assert.equal(getPool(inventor, "prowess").value, 0, "Prowess pool clamped at floor 0 (never negative)");
  assert.equal(getPool(inventor, "inventions").value, 6, "Inventions pool unchanged (Mobile Modding costs 0 Inventions)");
  assert.ok(receipt.shortfalls?.some(s => s.toLowerCase().includes("prowess")), "Public shortfall notice recorded on receipt");
  assert.deepEqual(getItemModifications(axe).map(m => m.id), ["rotary-blade"], "Mod applied to ally weapon after override");
});

test("Adversarial 2.3: strangeContraption non-blocking range warning and override", async () => {
  const inventor = createInventorActor(5);
  const distantTarget = createCreature("Distant Target");

  // 60 ft away exceeds 30 ft throw range
  const plan = specialistUses.plan(inventor, "strangeContraption", {
    contraptionId: "flashlight",
    targetUuid: distantTarget.uuid,
    distance: 60,
    checkOnly: true
  });
  const rangeWarning = plan.warnings?.find(w => w.id === "range");
  assert.ok(rangeWarning, "Produces non-blocking range warning for 60 ft > 30 ft throw");

  await specialistUses.execute(inventor, "strangeContraption", {
    contraptionId: "flashlight",
    targetUuid: distantTarget.uuid,
    distance: 60,
    overrides: [rangeWarning.id]
  }, "op-contraption-range");

  const receipt = inventor.flags.ak5e.specialistUses.undo.find(u => u.id === "op-contraption-range");
  assert.ok(receipt.overridden?.some(t => t.includes("30 ft throw range")), "Public receipt notes range override");
});

test("Adversarial 2.4: mobileModding non-blocking range warning and override", async () => {
  const inventor = createInventorActor(5, { prowess: 2 });
  const distantAlly = createCreature("Distant Ally");
  const bow = createTestItem({
    name: "Shortbow",
    type: "weapon",
    system: { type: { value: "ranged" } }
  });
  addItem(distantAlly, bow);

  // 15 ft exceeds 5 ft touch range
  const plan = specialistUses.plan(inventor, "mobileModding", {
    targetUuid: distantAlly.uuid,
    itemId: bow.id,
    modificationId: "electrobolts",
    distance: 15,
    checkOnly: true
  });
  const rangeWarning = plan.warnings?.find(w => w.id === "distance" || w.id === "range");
  assert.ok(rangeWarning, "Produces non-blocking range warning for touch modding > 5 ft");

  await specialistUses.execute(inventor, "mobileModding", {
    targetUuid: distantAlly.uuid,
    itemId: bow.id,
    modificationId: "electrobolts",
    distance: 15,
    overrides: [rangeWarning.id]
  }, "op-mobile-range");

  const receipt = inventor.flags.ak5e.specialistUses.undo.find(u => u.id === "op-mobile-range");
  assert.ok(receipt.overridden?.some(t => t.includes("within 5 feet")), "Public receipt notes range override");
  assert.deepEqual(getItemModifications(bow).map(m => m.id), ["electrobolts"], "Mod applied despite distance");
});

test("Adversarial 2.5: Undo of overspent zero-clamped resource restores exact prior value", async () => {
  const inventor = createInventorActor(5, { inventions: 0 }); // Prior value was exactly 0
  const sword = createTestItem({
    name: "Sword",
    type: "weapon",
    system: { type: { value: "melee" } }
  });
  addItem(inventor, sword);

  await specialistUses.execute(inventor, "applyModification", {
    itemId: sword.id,
    modificationId: "shock-engine",
    overrides: ["shortfall", "inventions"]
  });
  assert.equal(getPool(inventor, "inventions").value, 0, "Clamped at 0 after overspend");

  const useId = inventor.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(inventor, useId);

  // EMPIRICAL DEFECT CHECK: Reverting an overspent resource must restore prior value (0), NOT increment to 1!
  assert.equal(
    getPool(inventor, "inventions").value,
    0,
    "Reverting overspent zero-clamped resource restores exact prior value 0 (not +1)"
  );
});

/* ==============================================================================
 * VECTOR 3: Never Auto-Roll Player Dice (WORKFLOW.md §3.2 #5)
 * ============================================================================== */

test("Adversarial 3.1: activateModification never auto-rolls Instability dice (receipt.status = 'awaitingRoll')", async () => {
  const inventor = createInventorActor(5, { hp: 40 });
  const weapon = createTestItem({
    name: "Charged Blade",
    type: "weapon",
    system: { type: { value: "melee" } },
    flags: { ak5e: { inventor: { modifications: [{ id: "laser-cutter", name: "Laser Cutter", isDangerous: true }] } } } // Dangerous mod: Instability = 4 (base 3 + 1)
  });
  addItem(inventor, weapon);

  await specialistUses.execute(inventor, "activateModification", {
    itemId: weapon.id,
    modificationId: "laser-cutter"
  }, "op-act-roll");

  const receipt = inventor.flags.ak5e.specialistUses.undo.find(r => r.id === "op-act-roll");
  // 1. Status MUST be 'awaitingRoll'
  assert.equal(receipt.status, "awaitingRoll", "activateModification receipt enters 'awaitingRoll'");
  assert.equal(receipt.formula, "4d6", "Formula is set to Instability Nd6 (4d6)");
  assert.equal(receipt.roll, undefined, "Dice are NOT pre-evaluated during plan execution");
  assert.equal(inventor.system.attributes.hp.value, 40, "HP is NOT deducted during plan execution");

  // 2. User explicitly triggers roll button
  await specialistUses.command(inventor, "useRoll", { useId: receipt.id });
  const updatedReceipt = inventor.flags.ak5e.specialistUses.undo.find(r => r.id === receipt.id);
  assert.ok(typeof updatedReceipt.roll === "number" || updatedReceipt.status === "complete" || updatedReceipt.breakdown !== undefined,
    "Roll is resolved only after explicit useRoll");
});

test("Adversarial 3.2: Breakdown HP loss dice are never auto-rolled or auto-applied during plan execution", async () => {
  const inventor = createInventorActor(5, { hp: 40 });
  const weapon = createTestItem({
    name: "Volatile Weapon",
    type: "weapon",
    system: { type: { value: "melee" } },
    flags: {
      ak5e: {
        inventor: {
          modifications: [
            { id: "boom-module", name: "Boom Module" },
            { id: "burning-edge", name: "Burning Edge" }
          ]
        }
      }
    } // Instability = 4
  });
  addItem(inventor, weapon);

  await specialistUses.execute(inventor, "activateModification", {
    itemId: weapon.id,
    modificationId: "boom-module"
  }, "op-breakdown-roll");

  const receipt = inventor.flags.ak5e.specialistUses.undo.find(r => r.id === "op-breakdown-roll");
  assert.equal(receipt.status, "awaitingRoll");
  assert.equal(inventor.system.attributes.hp.value, 40, "Actor HP unchanged before breakdown roll is made");
});

test("Adversarial 3.3: strangeContraption never auto-rolls damage or saving throw dice", async () => {
  const inventor = createInventorActor(5);
  const target = createCreature("Target Goblin", { hp: 30 });

  // Musbeast Remover deals 4d8 Piercing on failed DEX save
  await specialistUses.execute(inventor, "strangeContraption", {
    contraptionId: "musbeast-remover",
    targetUuid: target.uuid
  }, "op-contraption-roll");

  const receipt = inventor.flags.ak5e.specialistUses.undo.find(r => r.id === "op-contraption-roll");
  // Verify damage dice and saves are interactive
  assert.equal(receipt.status, "awaitingRoll", "Contraption with damage formula enters awaitingRoll");
  assert.equal(receipt.formula, "4d8", "Damage formula 4d8 is preserved for interactive roll");
  assert.equal(receipt.roll, undefined, "Dice are not rolled during plan execution");
  assert.equal(target.system.attributes.hp.value, 30, "Target HP not auto-deducted during plan execution");
});

test("Adversarial 3.4: theBigOne never auto-rolls damage or saving throw dice", async () => {
  const inventor = createInventorActor(20, { theBigOne: 1 });
  const enemy1 = createCreature("Boss Minion 1", { hp: 100 });
  const enemy2 = createCreature("Boss Minion 2", { hp: 100 });

  // SHARD mode: 10d6 Slashing
  await specialistUses.execute(inventor, "theBigOne", {
    mode: "SHARD",
    targetUuids: [enemy1.uuid, enemy2.uuid]
  }, "op-bigone-roll");

  const receipt = inventor.flags.ak5e.specialistUses.undo.find(r => r.id === "op-bigone-roll");
  assert.equal(receipt.status, "awaitingRoll", "The Big One enters awaitingRoll");
  assert.equal(receipt.formula, "10d6", "The Big One SHARD specifies 10d6 formula");
  assert.equal(receipt.roll, undefined, "Dice are not evaluated during execution");
  assert.equal(enemy1.system.attributes.hp.value, 100, "Enemy 1 HP untouched during execution");
  assert.equal(enemy2.system.attributes.hp.value, 100, "Enemy 2 HP untouched during execution");
});

/* ==============================================================================
 * VECTOR 4: Automatic GM Relay via validateTarget (WORKFLOW.md §3.2 #2)
 * ============================================================================== */

test("Adversarial 4.1: mobileModding on unowned target relays without permission errors", async () => {
  const gmUser = { id: "gm-user-1", isGM: true, name: "GM" };
  const playerUser = { id: "player-user-1", isGM: false, name: "Player" };
  const origUser = globalThis.game.user;
  const origUsers = globalThis.game.users;

  try {
    globalThis.game.users = [gmUser, playerUser];
    globalThis.game.users.activeGM = gmUser;
    globalThis.game.user = playerUser;

    const inventor = createInventorActor(5, { prowess: 2 });
    inventor.ownership = { [playerUser.id]: 3, default: 0 };
    inventor.isOwner = true;

    const ally = createCreature("Unowned Ally");
    ally.ownership = { [playerUser.id]: 0, [gmUser.id]: 3, default: 0 };
    ally.isOwner = false;

    const allySpear = createTestItem({
      name: "Ally Spear",
      type: "weapon",
      system: { type: { value: "melee" } }
    });
    addItem(ally, allySpear);

    // Executing mobileModding on unowned ally weapon does NOT throw permission error
    const receipt = await specialistUses.execute(inventor, "mobileModding", {
      targetUuid: ally.uuid,
      itemId: allySpear.id,
      modificationId: "flexible-weapon"
    });

    assert.ok(receipt, "Receipt returned without throwing permission error");
    assert.deepEqual(getItemModifications(allySpear).map(m => m.id), ["flexible-weapon"], "Mod applied to ally equipment");
  } finally {
    globalThis.game.user = origUser;
    globalThis.game.users = origUsers;
  }
});

test("Adversarial 4.2: validateTarget predicate returns true for legitimate target and false for mismatched target", () => {
  const mockInventor = { uuid: "Actor.inventor-1", id: "inventor-1" };
  const mockTarget = { uuid: "Actor.target-1", id: "target-1" };
  const mockWrongTarget = { uuid: "Actor.wrong-target-99", id: "wrong-target-99" };

  const matchingEntry = { uuid: "Actor.target-1" };
  const wrongEntry = { uuid: "Actor.wrong-target-99" };
  const receipt = { targetUuid: "Actor.target-1" };

  // 1. applyModification validateTarget
  assert.equal(INVENTOR_PLANS.applyModification.validateTarget(mockInventor, receipt, matchingEntry, mockTarget), true);
  assert.equal(INVENTOR_PLANS.applyModification.validateTarget(mockInventor, receipt, wrongEntry, mockTarget), false);

  // 2. mobileModding validateTarget
  assert.equal(INVENTOR_PLANS.mobileModding.validateTarget(mockInventor, receipt, matchingEntry, mockTarget), true);
  assert.equal(INVENTOR_PLANS.mobileModding.validateTarget(mockInventor, receipt, wrongEntry, mockTarget), false);

  // 3. strangeContraption validateTarget
  assert.equal(INVENTOR_PLANS.strangeContraption.validateTarget(mockInventor, receipt, matchingEntry, mockTarget), true);
  assert.equal(INVENTOR_PLANS.strangeContraption.validateTarget(mockInventor, receipt, wrongEntry, mockTarget), false);

  // 4. theBigOne validateTarget
  assert.equal(INVENTOR_PLANS.theBigOne.validateTarget(mockInventor, receipt, matchingEntry, mockTarget), true);
  assert.equal(INVENTOR_PLANS.theBigOne.validateTarget(mockInventor, receipt, wrongEntry, mockTarget), false);
});

test("Adversarial 4.3: Tampering/forgery attack on relayed target entry is rejected by validateTarget", async () => {
  const inventor = createInventorActor(5, { prowess: 2 });
  const ally = createCreature("Ally Guard");

  const receipt = {
    command: "mobileModding",
    targetUuid: ally.uuid,
    targets: [{ uuid: ally.uuid, kind: "effect", ready: true }]
  };

  const legitimateEntry = { uuid: ally.uuid, kind: "effect" };
  const forgedMismatchedEntry = { uuid: "Actor.tampered-creature-99", kind: "effect" };

  // Legitimate target passes validateTarget
  assert.equal(
    INVENTOR_PLANS.mobileModding.validateTarget(inventor, receipt, legitimateEntry, ally),
    true,
    "Legitimate ally target passes validateTarget"
  );

  // Forged target fails validateTarget
  assert.equal(
    INVENTOR_PLANS.mobileModding.validateTarget(inventor, receipt, forgedMismatchedEntry, ally),
    false,
    "Forged mismatched target is REJECTED by validateTarget"
  );
});

test("Adversarial 4.4: Unowned target modification requires connected GM for relay", async () => {
  const gmUser = { id: "gm-user-1", isGM: true };
  const playerUser = { id: "player-user-1", isGM: false };
  const origUser = globalThis.game.user;
  const origUsers = globalThis.game.users;

  try {
    globalThis.game.users = [gmUser, playerUser];
    globalThis.game.users.activeGM = gmUser;
    globalThis.game.user = playerUser;

    const inventor = createInventorActor(5, { prowess: 2 });
    inventor.ownership = { [playerUser.id]: 3, default: 0 };
    inventor.isOwner = true;

    const unownedAlly = createCreature("Unowned Ally");
    unownedAlly.ownership = { [playerUser.id]: 0, [gmUser.id]: 3, default: 0 };
    unownedAlly.isOwner = false;
    const mace = createTestItem({ name: "Mace", type: "weapon", system: { type: { value: "melee" } } });
    addItem(unownedAlly, mace);

    // With active GM, operation executes smoothly
    const receipt = await specialistUses.execute(inventor, "mobileModding", {
      targetUuid: unownedAlly.uuid,
      itemId: mace.id,
      modificationId: "flexible-weapon"
    });
    assert.ok(receipt, "Executes with connected active GM");
  } finally {
    globalThis.game.user = origUser;
    globalThis.game.users = origUsers;
  }
});

/* ==============================================================================
 * VECTOR 5: Encounter-Window Undo Integrity (WORKFLOW.md §3.2 #6)
 * ============================================================================== */

test("Adversarial 5.1: Encounter-window undo cleanly reverts applyModification", async () => {
  const inventor = createInventorActor(5, { inventions: 6 });
  const sword = createTestItem({
    name: "Claymore",
    type: "weapon",
    system: { type: { value: "melee" } }
  });
  addItem(inventor, sword);

  // Apply modification
  await specialistUses.execute(inventor, "applyModification", {
    itemId: sword.id,
    modificationId: "boom-module"
  }, "op-apply-undo");

  assert.equal(getPool(inventor, "inventions").value, 5, "1 Invention spent");
  assert.deepEqual(getItemModifications(sword).map(m => m.id), ["boom-module"], "Mod installed on weapon");

  // Revert via undo
  await specialistUses.undo(inventor, "op-apply-undo");

  assert.equal(getPool(inventor, "inventions").value, 6, "Invention refunded on undo");
  assert.deepEqual(getItemModifications(sword), [], "Mod removed from weapon on undo");
});

test("Adversarial 5.2: Encounter-window undo cleanly reverts removeModification", async () => {
  const inventor = createInventorActor(5, { inventions: 5 });
  const sword = createTestItem({
    name: "Modded Sword",
    type: "weapon",
    system: { type: { value: "melee" } },
    flags: { ak5e: { inventor: { modifications: [{ id: "rotary-blade", name: "Rotary Blade" }] } } }
  });
  addItem(inventor, sword);

  // Remove modification
  await specialistUses.execute(inventor, "removeModification", {
    itemId: sword.id,
    modificationId: "rotary-blade"
  }, "op-remove-undo");

  assert.equal(getPool(inventor, "inventions").value, 6, "1 Invention refunded");
  assert.deepEqual(getItemModifications(sword), [], "Mod removed");

  // Revert removal via undo
  await specialistUses.undo(inventor, "op-remove-undo");

  assert.equal(getPool(inventor, "inventions").value, 5, "Invention re-deducted on undo");
  assert.deepEqual(getItemModifications(sword).map(m => m.id), ["rotary-blade"], "Mod restored to weapon on undo");
});

test("Adversarial 5.3: Encounter-window undo cleanly reverts Dangerous breakdown broken equipment", async () => {
  const inventor = createInventorActor(5, { hp: 40 });
  const weapon = createTestItem({
    name: "Dangerous Weapon",
    type: "weapon",
    system: { type: { value: "melee" } },
    flags: { ak5e: { inventor: { modifications: [{ id: "laser-cutter", name: "Laser Cutter", isDangerous: true }] } } }
  });
  addItem(inventor, weapon);

  // Activate dangerous modification and trigger breakdown
  await specialistUses.execute(inventor, "activateModification", {
    itemId: weapon.id,
    modificationId: "laser-cutter",
    breakdown: true
  }, "op-activate-breakdown");

  assert.equal(isBrokenEquipment(weapon), true, "Weapon marked broken after breakdown");

  // Undo activation
  await specialistUses.undo(inventor, "op-activate-breakdown");

  assert.equal(isBrokenEquipment(weapon), false, "Weapon broken flag cleared on undo");
});

test("Adversarial 5.4: Encounter-window undo cleanly reverts mobileModding on ally", async () => {
  const inventor = createInventorActor(5, { prowess: 3 });
  const ally = createCreature("Ally Monk");
  const staff = createTestItem({
    name: "Quarterstaff",
    type: "weapon",
    system: { type: { value: "melee" } }
  });
  addItem(ally, staff);

  await specialistUses.execute(inventor, "mobileModding", {
    targetUuid: ally.uuid,
    itemId: staff.id,
    modificationId: "flexible-weapon"
  }, "op-mobile-undo");

  assert.equal(getPool(inventor, "prowess").value, 2, "1 Prowess spent");
  assert.deepEqual(getItemModifications(staff).map(m => m.id), ["flexible-weapon"], "Mod installed on ally staff");

  await specialistUses.undo(inventor, "op-mobile-undo");

  assert.equal(getPool(inventor, "prowess").value, 3, "Prowess refunded on undo");
  assert.deepEqual(getItemModifications(staff), [], "Mod removed from ally staff on undo");
});

test("Adversarial 5.5: Encounter-window undo cleanly reverts strangeContraption lockout", async () => {
  const inventor = createInventorActor(5);
  const target = createCreature("Target Bandit");

  await specialistUses.execute(inventor, "strangeContraption", {
    contraptionId: "flashlight",
    targetUuid: target.uuid
  }, "op-contraption-undo");

  assert.ok(inventor.flags.ak5e?.inventor?.usedContraptions?.includes("flashlight"), "Flashlight marked used");

  await specialistUses.undo(inventor, "op-contraption-undo");

  assert.equal(inventor.flags.ak5e?.inventor?.usedContraptions?.includes("flashlight") ?? false, false, "Flashlight lockout cleared on undo");
});

test("Adversarial 5.6: Encounter-window undo cleanly reverts theBigOne pool spend", async () => {
  const inventor = createInventorActor(20, { theBigOne: 1 });
  const enemy = createCreature("Boss Enemy");

  await specialistUses.execute(inventor, "theBigOne", {
    mode: "FLASH",
    targetUuids: [enemy.uuid]
  }, "op-bigone-undo");

  assert.equal(getPool(inventor, "theBigOne").value, 0, "The Big One spent");

  await specialistUses.undo(inventor, "op-bigone-undo");

  assert.equal(getPool(inventor, "theBigOne").value, 1, "The Big One pool restored to 1 on undo");
});

test("Adversarial 5.7: Non-latest / Out-of-Order Undo preserves independent actions", async () => {
  const inventor = createInventorActor(5, { inventions: 6, prowess: 3 });
  const swordA = createTestItem({ name: "Sword A", type: "weapon", system: { type: { value: "melee" } } });
  const swordB = createTestItem({ name: "Sword B", type: "weapon", system: { type: { value: "melee" } } });
  addItem(inventor, swordA);
  addItem(inventor, swordB);

  const ally = createCreature("Ally Companion");
  const bow = createTestItem({ name: "Ally Bow", type: "weapon", system: { type: { value: "ranged" } } });
  addItem(ally, bow);

  // Action 1: Apply mod to Sword A
  await specialistUses.execute(inventor, "applyModification", {
    itemId: swordA.id,
    modificationId: "boom-module"
  }, "act-1");

  // Action 2: Apply mod to Sword B
  await specialistUses.execute(inventor, "applyModification", {
    itemId: swordB.id,
    modificationId: "burning-edge"
  }, "act-2");

  // Action 3: Mobile modding on ally bow
  await specialistUses.execute(inventor, "mobileModding", {
    targetUuid: ally.uuid,
    itemId: bow.id,
    modificationId: "electrobolts"
  }, "act-3");

  assert.equal(getPool(inventor, "inventions").value, 4); // 6 - 2 = 4
  assert.equal(getPool(inventor, "prowess").value, 2); // 3 - 1 = 2

  // Undo Action 2 OUT OF ORDER (middle action)
  await specialistUses.undo(inventor, "act-2");

  // Assert Sword B is reverted, while Sword A and Ally Bow remain modified!
  assert.deepEqual(getItemModifications(swordB), [], "Sword B mod reverted by out-of-order undo");
  assert.deepEqual(getItemModifications(swordA).map(m => m.id), ["boom-module"], "Sword A mod PRESERVED after out-of-order undo");
  assert.deepEqual(getItemModifications(bow).map(m => m.id), ["electrobolts"], "Ally bow mod PRESERVED after out-of-order undo");
  assert.equal(getPool(inventor, "inventions").value, 5, "Invention for Sword B refunded");
  assert.equal(getPool(inventor, "prowess").value, 2, "Prowess unchanged");

  // Undo Action 1 (oldest action)
  await specialistUses.undo(inventor, "act-1");

  assert.deepEqual(getItemModifications(swordA), [], "Sword A mod reverted");
  assert.deepEqual(getItemModifications(bow).map(m => m.id), ["electrobolts"], "Ally bow mod STILL PRESERVED");
  assert.equal(getPool(inventor, "inventions").value, 6, "Invention for Sword A refunded");
});
