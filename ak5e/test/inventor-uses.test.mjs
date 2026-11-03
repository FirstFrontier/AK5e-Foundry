/**
 * Comprehensive automated test suite for AK5e Inventor Table-Play Philosophy (WORKFLOW.md §3.2).
 * Covers:
 *  1. Confirmation before spend (mandatory confirmed: true)
 *  2. Non-blocking warnings & "Use anyway" overrides (shortfall, level, broken equipment, life support, cooldowns)
 *  3. Zero-floor clamping on resource shortfalls with receipt reporting
 *  4. GM target relay validation (.validateTarget) for unowned target operations
 *  5. Interactive card roll buttons (receipt.formula = "${instability}d6", never auto-rolled)
 *  6. Full reversibility and encounter-window undo receipts (inventorCleanup)
 *  7. Sheet UI controls & badges (ActorSheetV2 features tab, DialogV2 controls, handleSpecialistCommand)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import {
  setupFoundryGlobals,
  teardownFoundryGlobals,
  createTestActor,
  createTestItem
} from "./base-classes-fixture.mjs";
import {
  isInventor,
  calculateInventorDC,
  defineInventorPools,
  specialistProfile,
  pbForLevel,
  SPECIALIST_CLASS_ID
} from "../scripts/specialist-rules.mjs";
import {
  registerInventorHooks,
  getItemModifications,
  calculateInstability,
  isBrokenEquipment,
  MODIFICATIONS_CATALOG,
  CONTRAPTIONS_CATALOG,
  INVENTOR_SUBCLASS_ID
} from "../scripts/inventor-features.mjs";
import {
  specialistUses,
  INVENTOR_PLANS,
  inventorCleanup
} from "../scripts/specialist-uses.mjs";
import {
  renderSpecialistControls,
  openSpecialistControls,
  handleSpecialistCommand
} from "../scripts/specialist-sheet.mjs";
import { getPool, clearPoolRegistry } from "../scripts/resource-pools.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
  defineInventorPools();
  registerInventorHooks();
  globalThis.foundry.applications = {
    sheets: { ActorSheetV2: class ActorSheetV2 {} },
    api: { DialogV2: { wait: async () => true, confirm: async () => true } }
  };
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

function createInventorActor(level = 1, options = {}) {
  const sClass = createTestItem({
    name: "Specialist",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } }
  });
  const subClass = createTestItem({
    name: "Inventor",
    type: "subclass",
    flags: { ak5e: { chapterThreeId: INVENTOR_SUBCLASS_ID } }
  });

  const pb = options.prof ?? pbForLevel(level);

  const actor = createTestActor({
    name: options.name ?? "Test Inventor",
    items: [sClass, subClass, ...(options.items ?? [])],
    system: {
      ...options.system,
      details: { level, ...(options.system?.details ?? {}) },
      attributes: {
        prof: pb,
        hp: { value: options.hp ?? 30, max: options.maxHp ?? 30 },
        movement: { walk: 30, climb: 0, swim: 0, fly: 0 },
        ...(options.system?.attributes ?? {})
      },
      abilities: {
        str: { value: options.str ?? 10, mod: options.strMod ?? 0 },
        dex: { value: options.dex ?? 14, mod: options.dexMod ?? 2 },
        con: { value: options.con ?? 12, mod: options.conMod ?? 1 },
        int: { value: options.int ?? 16, mod: options.intMod ?? 3 },
        wis: { value: options.wis ?? 10, mod: options.wisMod ?? 0 },
        cha: { value: options.cha ?? 10, mod: options.chaMod ?? 0 },
        ...(options.system?.abilities ?? {})
      }
    },
    flags: {
      ak5e: {
        specialist: {
          enabled: true,
          branch: "inventor",
          weaponCategory: options.weaponCategory ?? "melee",
          fightingStyle: options.fightingStyle ?? "brawler"
        },
        inventor: {
          usedContraptions: options.usedContraptions ?? [],
          theBigOneUsed: options.theBigOneUsed ?? false,
          ...(options.inventorFlags ?? {})
        },
        resourcePools: {
          prowess: {
            value: options.prowess ?? pb,
            max: pb
          },
          inventions: {
            value: options.inventions ?? (2 * pb),
            max: 2 * pb
          },
          ...(level >= 20 ? {
            theBigOne: {
              value: options.theBigOne ?? 1,
              max: 1
            }
          } : {})
        }
      }
    }
  });

  actor.isOwner = true;
  return actor;
}

function createWeapon(name = "Sword", options = {}) {
  return createTestItem({
    name,
    type: "weapon",
    system: {
      weaponType: options.weaponType ?? "simpleM",
      properties: new Set(options.properties ?? []),
      damage: {
        parts: [[options.formula ?? "1d8", options.damageType ?? "slashing"]]
      }
    }
  });
}

function createArmor(name = "Breastplate", options = {}) {
  return createTestItem({
    name,
    type: "equipment",
    system: {
      type: { value: options.armorType ?? "medium" },
      armor: { value: options.ac ?? 14, type: options.armorType ?? "medium" }
    }
  });
}

// ---------------------------------------------------------------- Tests

test("Area 1: Confirmation Before Spend (Table-Play Philosophy)", async () => {
  const inventor = createInventorActor(5, { inventions: 4, prowess: 3 });
  const weapon = createWeapon("Longsword");
  addItem(inventor, weapon);

  // 1. applyModification without confirmed throws
  await assert.rejects(
    async () => specialistUses.command(inventor, "applyModification", {
      confirmed: false,
      itemId: weapon.id,
      modificationId: "boom-module"
    }),
    /Confirm this use before applying it/,
    "Unconfirmed applyModification rejected"
  );
  assert.equal(getPool(inventor, "inventions").value, 4, "Inventions untouched on unconfirmed call");

  // 2. removeModification without confirmed throws
  await assert.rejects(
    async () => specialistUses.command(inventor, "removeModification", {
      confirmed: false,
      itemId: weapon.id,
      modificationId: "boom-module"
    }),
    /Confirm this use before applying it/,
    "Unconfirmed removeModification rejected"
  );

  // 3. activateModification without confirmed throws
  await assert.rejects(
    async () => specialistUses.command(inventor, "activateModification", {
      confirmed: false,
      itemId: weapon.id,
      modificationId: "boom-module"
    }),
    /Confirm this use before applying it/,
    "Unconfirmed activateModification rejected"
  );

  // 4. mobileModding without confirmed throws
  await assert.rejects(
    async () => specialistUses.command(inventor, "mobileModding", {
      confirmed: false,
      itemId: weapon.id,
      modificationId: "boom-module"
    }),
    /Confirm this use before applying it/,
    "Unconfirmed mobileModding rejected"
  );

  // 5. strangeContraption without confirmed throws
  await assert.rejects(
    async () => specialistUses.command(inventor, "strangeContraption", {
      confirmed: false,
      contraptionId: "flashlight"
    }),
    /Confirm this use before applying it/,
    "Unconfirmed strangeContraption rejected"
  );

  // 6. theBigOne without confirmed throws
  const lv20Inventor = createInventorActor(20);
  await assert.rejects(
    async () => specialistUses.command(lv20Inventor, "theBigOne", {
      confirmed: false,
      mode: "FLASH"
    }),
    /Confirm this use before applying it/,
    "Unconfirmed theBigOne rejected"
  );
});

test("Area 2: Non-blocking Warnings & 'Use Anyway' Overrides", async () => {
  const inventor = createInventorActor(1, { inventions: 0, prowess: 0 });
  const weapon = createWeapon("Warhammer", { damageType: "bludgeoning" });
  addItem(inventor, weapon);

  // 1. Shortfall Warning on applyModification
  await assert.rejects(
    async () => specialistUses.command(inventor, "applyModification", {
      confirmed: true,
      itemId: weapon.id,
      modificationId: "boom-module"
    }),
    (err) => err.name === "AK5eWarnings",
    "Empty Inventions pool emits shortfall warning"
  );

  // Overriding "shortfall" allows application
  const applyRes = await specialistUses.command(inventor, "applyModification", {
    confirmed: true,
    itemId: weapon.id,
    modificationId: "boom-module",
    overrides: ["shortfall"]
  });
  assert.ok(applyRes, "applyModification succeeds with shortfall override");
  assert.equal(getItemModifications(weapon).length, 1, "Modification applied despite 0 initial Inventions");

  // 2. Level Warning on Mobile Modding
  await assert.rejects(
    async () => specialistUses.command(inventor, "mobileModding", {
      confirmed: true,
      itemId: weapon.id,
      modificationId: "boom-module"
    }),
    (err) => err.name === "AK5eWarnings",
    "Level 1 Inventor gets level and shortfall warnings on mobileModding"
  );

  // Overriding both warnings allows execution
  const mobileRes = await specialistUses.command(inventor, "mobileModding", {
    confirmed: true,
    itemId: weapon.id,
    modificationId: "burning-edge",
    overrides: ["level", "shortfall"]
  });
  assert.ok(mobileRes, "mobileModding succeeds with level and shortfall overrides");

  // 3. Broken Equipment Warning on activateModification
  weapon.flags.ak5e ??= {};
  weapon.flags.ak5e.isBroken = true;
  await assert.rejects(
    async () => specialistUses.command(inventor, "activateModification", {
      confirmed: true,
      itemId: weapon.id,
      modificationId: "boom-module"
    }),
    (err) => err.name === "AK5eWarnings",
    "Broken equipment emits broken warning"
  );

  const actRes = await specialistUses.command(inventor, "activateModification", {
    confirmed: true,
    itemId: weapon.id,
    modificationId: "boom-module",
    overrides: ["broken"]
  });
  assert.ok(actRes, "activateModification succeeds with broken override");

  // 4. Life Support HP Warning (< 50% HP requirement)
  const armor = createArmor("Plate", { armorType: "heavy" });
  addItem(inventor, armor);
  armor.flags = { ak5e: { inventor: { modifications: [{ id: "life-support", name: "Life Support" }] } } };
  inventor.system.attributes.hp.value = 30; // 100% HP

  await assert.rejects(
    async () => specialistUses.command(inventor, "activateModification", {
      confirmed: true,
      itemId: armor.id,
      modificationId: "life-support"
    }),
    (err) => err.name === "AK5eWarnings",
    "Life Support emits HP threshold warning when above 50% HP"
  );

  const lsRes = await specialistUses.command(inventor, "activateModification", {
    confirmed: true,
    itemId: armor.id,
    modificationId: "life-support",
    overrides: ["lifeSupportHP"]
  });
  assert.ok(lsRes, "Life Support succeeds when overridden");
});

test("Area 3: Zero-Floor Clamping on Resource Shortfalls", async () => {
  const inventor = createInventorActor(5, { inventions: 0, prowess: 0 });
  const weapon = createWeapon("Club");
  addItem(inventor, weapon);

  // Execute applyModification with shortfall override
  await specialistUses.command(inventor, "applyModification", {
    confirmed: true,
    itemId: weapon.id,
    modificationId: "boom-module",
    overrides: ["shortfall"]
  });

  // Verify pool value clamped strictly at 0
  assert.equal(getPool(inventor, "inventions").value, 0, "Inventions pool clamped at 0");
  assert.ok(getPool(inventor, "inventions").value >= 0, "Pool never drops below 0");

  const receipt = inventor.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.ok(receipt.shortfalls.includes("Inventions short by 1"), "Shortfall recorded on receipt");
  assert.equal(receipt.resources[0].before, 0);
  assert.equal(receipt.resources[0].after, 0);

  // Execute mobileModding with shortfall override
  await specialistUses.command(inventor, "mobileModding", {
    confirmed: true,
    itemId: weapon.id,
    modificationId: "burning-edge",
    overrides: ["shortfall"]
  });

  assert.equal(getPool(inventor, "prowess").value, 0, "Prowess pool clamped at 0");
  const mobileReceipt = inventor.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.ok(mobileReceipt.shortfalls.includes("Prowess short by 1"), "Prowess shortfall recorded on receipt");
});

test("Area 4: GM Relay & validateTarget Validation", () => {
  const mockTarget = { uuid: "Actor.target123" };
  const matchingEntry = { uuid: "Actor.target123" };
  const wrongEntry = { uuid: "Actor.other456" };
  const matchingReceipt = { targetUuid: "Actor.target123" };
  const wrongReceipt = { targetUuid: "Actor.other456" };

  // applyModification
  assert.equal(INVENTOR_PLANS.applyModification.validateTarget({}, matchingReceipt, matchingEntry, mockTarget), true);
  assert.equal(INVENTOR_PLANS.applyModification.validateTarget({}, wrongReceipt, wrongEntry, mockTarget), false);

  // removeModification
  assert.equal(INVENTOR_PLANS.removeModification.validateTarget({}, matchingReceipt, matchingEntry, mockTarget), true);
  assert.equal(INVENTOR_PLANS.removeModification.validateTarget({}, wrongReceipt, wrongEntry, mockTarget), false);

  // activateModification
  assert.equal(INVENTOR_PLANS.activateModification.validateTarget({}, matchingReceipt, matchingEntry, mockTarget), true);
  assert.equal(INVENTOR_PLANS.activateModification.validateTarget({}, wrongReceipt, wrongEntry, mockTarget), false);

  // mobileModding
  assert.equal(INVENTOR_PLANS.mobileModding.validateTarget({}, matchingReceipt, matchingEntry, mockTarget), true);
  assert.equal(INVENTOR_PLANS.mobileModding.validateTarget({}, wrongReceipt, wrongEntry, mockTarget), false);

  // strangeContraption
  assert.equal(INVENTOR_PLANS.strangeContraption.validateTarget({}, matchingReceipt, matchingEntry, mockTarget), true);
  assert.equal(INVENTOR_PLANS.strangeContraption.validateTarget({}, wrongReceipt, wrongEntry, mockTarget), false);

  // theBigOne
  assert.equal(INVENTOR_PLANS.theBigOne.validateTarget({}, matchingReceipt, matchingEntry, mockTarget), true);
  assert.equal(INVENTOR_PLANS.theBigOne.validateTarget({}, wrongReceipt, wrongEntry, mockTarget), false);
});

test("Area 5: Interactive Card Buttons & Formula Generation (Never Auto-Rolled)", async () => {
  const inventor = createInventorActor(5, { inventions: 4 });
  const weapon = createWeapon("Mace");
  addItem(inventor, weapon);

  // 1. Apply two modifications to test Instability scaling
  await specialistUses.execute(inventor, "applyModification", {
    itemId: weapon.id,
    modificationId: "boom-module"
  });
  await specialistUses.execute(inventor, "applyModification", {
    itemId: weapon.id,
    modificationId: "burning-edge"
  });

  // Instability: Base 3 + (2 - 1) = 4
  const instability = calculateInstability(weapon, inventor);
  assert.equal(instability, 4, "Instability is 4 for 2 standard modifications");

  // 2. activateModification creates awaitingRoll receipt with formula "4d6"
  await specialistUses.execute(inventor, "activateModification", {
    itemId: weapon.id,
    modificationId: "boom-module"
  });

  const receipt = inventor.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(receipt.status, "awaitingRoll", "Receipt status is awaitingRoll (no auto-rolled dice)");
  assert.equal(receipt.formula, "4d6", "Receipt formula matches instability calculation");
  assert.equal(receipt.roll, undefined, "Roll result is undefined before player rolls");

  // 3. Player clicks roll button on chat card (useRoll command)
  const rollRes = await specialistUses.command(inventor, "useRoll", { useId: receipt.id });
  assert.ok(rollRes, "useRoll completed");

  const completedReceipt = inventor.flags.ak5e.specialistUses.undo.find(r => r.id === receipt.id);
  assert.equal(completedReceipt.status, "complete", "Receipt transitioned to complete after interactive roll");
  assert.equal(typeof completedReceipt.roll, "number", "Roll total stored on receipt");

  // 4. The Big One interactive formulas
  const lv20 = createInventorActor(20);
  await specialistUses.execute(lv20, "theBigOne", { mode: "FLASH" });
  const flashReceipt = lv20.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(flashReceipt.formula, "8d6");
  assert.equal(flashReceipt.damageType, "thunder");
  assert.equal(flashReceipt.condition, "burning");

  await specialistUses.execute(lv20, "theBigOne", {
    mode: "SHARD",
    overrides: ["alreadyUsed"]
  });
  const shardReceipt = lv20.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(shardReceipt.formula, "10d6");
  assert.equal(shardReceipt.damageType, "slashing");
  assert.equal(shardReceipt.condition, "bleeding");
  assert.equal(shardReceipt.ignoresCover, true);

  await specialistUses.execute(lv20, "theBigOne", {
    mode: "QUASAR",
    overrides: ["alreadyUsed"]
  });
  const quasarReceipt = lv20.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(quasarReceipt.formula, "14d6");
  assert.equal(quasarReceipt.damageType, "radiant");
});

test("Area 6: Encounter-Window Undo Receipts & Reversible Cleanup", async () => {
  const inventor = createInventorActor(5, { inventions: 4, prowess: 3 });
  const weapon = createWeapon("Warhammer", { damageType: "bludgeoning" });
  addItem(inventor, weapon);

  // 1. applyModification and undo
  await specialistUses.execute(inventor, "applyModification", {
    itemId: weapon.id,
    modificationId: "boom-module"
  });
  assert.equal(getPool(inventor, "inventions").value, 3, "Inventions spent to 3");
  assert.equal(getItemModifications(weapon).length, 1, "Mod installed");

  const applyUseId = inventor.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(inventor, applyUseId);
  assert.equal(getPool(inventor, "inventions").value, 4, "Inventions refunded to 4 on undo");
  assert.equal(getItemModifications(weapon).length, 0, "Mod removed from weapon on undo");

  // 2. removeModification and undo
  await specialistUses.execute(inventor, "applyModification", {
    itemId: weapon.id,
    modificationId: "boom-module"
  });
  assert.equal(getPool(inventor, "inventions").value, 3);

  await specialistUses.execute(inventor, "removeModification", {
    itemId: weapon.id,
    modificationId: "boom-module"
  });
  assert.equal(getPool(inventor, "inventions").value, 4, "Inventions refunded on removal");
  assert.equal(getItemModifications(weapon).length, 0, "Mod removed");

  const removeUseId = inventor.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(inventor, removeUseId);
  assert.equal(getPool(inventor, "inventions").value, 3, "Invention locked back on undo");
  assert.equal(getItemModifications(weapon).length, 1, "Mod restored to weapon on undo");
  assert.equal(getItemModifications(weapon)[0].id, "boom-module");

  // 3. activateModification dangerous breakdown and undo
  const laserCutterMod = MODIFICATIONS_CATALOG["laser-cutter"];
  assert.equal(laserCutterMod.isDangerous, true, "Laser cutter is dangerous");
  await specialistUses.execute(inventor, "applyModification", {
    itemId: weapon.id,
    modificationId: "laser-cutter"
  });

  await specialistUses.execute(inventor, "activateModification", {
    itemId: weapon.id,
    modificationId: "laser-cutter",
    breakdown: true
  });
  assert.equal(isBrokenEquipment(weapon), true, "Weapon broken on dangerous breakdown");

  const actUseId = inventor.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(inventor, actUseId);
  assert.equal(isBrokenEquipment(weapon), false, "Weapon un-broken on undo");

  // 4. mobileModding and undo
  const ally = createTestActor({ name: "Ally" });
  const allySword = createWeapon("Ally Sword");
  addItem(ally, allySword);

  await specialistUses.execute(inventor, "mobileModding", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    itemId: allySword.id,
    modificationId: "burning-edge"
  });
  assert.equal(getPool(inventor, "prowess").value, 2, "Prowess spent to 2");
  assert.equal(getItemModifications(allySword).length, 1, "Mobile mod installed on ally item");

  const mobileUseId = inventor.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(inventor, mobileUseId);
  assert.equal(getPool(inventor, "prowess").value, 3, "Prowess refunded on undo");
  assert.equal(getItemModifications(allySword).length, 0, "Mobile mod cleared on undo");

  // 5. strangeContraption and undo
  await specialistUses.execute(inventor, "strangeContraption", {
    contraptionId: "flashlight"
  });
  assert.ok(inventor.flags.ak5e.inventor.usedContraptions.includes("flashlight"), "Flashlight recorded as used");

  const contraptionUseId = inventor.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(inventor, contraptionUseId);
  assert.ok(!inventor.flags.ak5e.inventor.usedContraptions.includes("flashlight"), "Flashlight usage cleared on undo");

  // 6. theBigOne and undo
  const lv20 = createInventorActor(20, { theBigOne: 1 });
  await specialistUses.execute(lv20, "theBigOne", { mode: "FLASH" });
  assert.equal(lv20.flags.ak5e.inventor.theBigOneUsed, true, "The Big One used");
  assert.equal(getPool(lv20, "theBigOne").value, 0, "The Big One pool spent");

  const bigOneUseId = lv20.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(lv20, bigOneUseId);
  assert.equal(lv20.flags.ak5e.inventor.theBigOneUsed, false, "The Big One usage cleared on undo");
  assert.equal(getPool(lv20, "theBigOne").value, 1, "The Big One pool refunded on undo");
});

test("Area 7: Sheet UI Controls & Badge Rendering", async () => {
  const inventor = createInventorActor(5, { inventions: 6, prowess: 3 });
  const weapon = createWeapon("Greataxe");
  addItem(inventor, weapon);
  await specialistUses.execute(inventor, "applyModification", {
    itemId: weapon.id,
    modificationId: "boom-module"
  });

  // Mock ActorSheetV2 element
  const { document } = parseHTML('<html><body><main><section class="tab" data-tab="features"></section></main></body></html>');
  globalThis.document = document;

  const featuresTab = document.querySelector('.tab[data-tab="features"]');
  const app = {
    document: inventor,
    element: document.querySelector("main")
  };

  renderSpecialistControls(app, featuresTab);

  const panel = featuresTab.querySelector(".ak5e-specialist-sheet-panel");
  assert.ok(panel, "Specialist sheet panel rendered");

  // Check badges
  const invBadge = panel.querySelector(".ak5e-specialist-badge-inventions");
  assert.ok(invBadge, "Inventions badge exists");
  assert.equal(invBadge.textContent, "Inventions: 5 / 6", "Inventions badge displays current / max");

  const dcBadge = panel.querySelector(".ak5e-specialist-badge-inventor-dc");
  assert.ok(dcBadge, "Inventor DC badge exists");
  const expectedDC = calculateInventorDC(inventor);
  assert.equal(dcBadge.textContent, `Inventor DC: ${expectedDC}`, "Inventor DC badge displays correct DC");

  const modBadge = panel.querySelector(".ak5e-specialist-badge-mod-count");
  assert.ok(modBadge, "Mod count badge exists");
  assert.equal(modBadge.textContent, "Active Modifications: 1", "Mod count badge displays active mod count");

  // Test handleSpecialistCommand dispatching
  let lastDialogTitle = null;
  const dialogTitles = [];
  globalThis.foundry.applications.api.DialogV2 = {
    // Faithful to Foundry: the affirmative button (the first one that is not Cancel) is clicked and the dialog resolves
    // `(await callback()) ?? action`, so the up-front confirm yields its { readings } object and a warnings dialog true.
    wait: async options => {
      lastDialogTitle = options?.window?.title;
      dialogTitles.push(lastDialogTitle);
      const button = (options?.buttons ?? []).find(candidate => candidate.action !== "cancel");
      return (await button?.callback?.(null, { form: { elements: {} } }, null)) ?? button?.action;
    },
    confirm: async () => true
  };

  const applyRes = await handleSpecialistCommand(inventor, "applyModification");
  assert.ok(applyRes, "applyModification dispatches and completes through confirmPlayUse");

  const actRes = await handleSpecialistCommand(inventor, "activateModification");
  assert.ok(actRes, "activateModification dispatches and completes through confirmPlayUse");

  const removeRes = await handleSpecialistCommand(inventor, "removeModification");
  assert.ok(removeRes, "removeModification dispatches and completes through confirmPlayUse");

  const mobileRes = await handleSpecialistCommand(inventor, "mobileModding");
  assert.ok(mobileRes, "mobileModding dispatches and completes through confirmPlayUse");

  const contraptionRes = await handleSpecialistCommand(inventor, "strangeContraption");
  assert.ok(contraptionRes, "strangeContraption dispatches and completes through confirmPlayUse");

  // theBigOne emits level warning on lv5 character, triggering DialogV2 prompt
  const shownBefore = dialogTitles.length;
  const bigOneRes = await handleSpecialistCommand(inventor, "theBigOne");
  assert.ok(bigOneRes, "theBigOne dispatches and completes through confirmPlayUse");
  assert.deepEqual(dialogTitles.slice(shownBefore), ["The Big One", "The Big One: check before use"], "confirmed once, then the warnings; the up-front confirm does not return");
  assert.equal(lastDialogTitle, "The Big One: check before use", "DialogV2 confirms warning with 'check before use'");
});
