/**
 * AK5e Inventor Specialist Subclass Features & Instability Engine (Ch. 3 L5847–6140).
 * Implements:
 *  - Equipment Modification: application, removal, validation, Inventions resource locking & refund.
 *  - Instability Engine: Base 3 + additional mods + Dangerous mods - Risk Assessment reductions (min 1).
 *  - Breakdown Roll: Nd6 roll evaluation, duplicate matching dice detection, HP loss clamping at 1 HP.
 *  - Dangerous Breakdown Rider: Damaged / broken equipment state (unusable weapons, suppressed armor).
 *  - Repairing broken equipment (Maintenance Kit restoration).
 *  - Complete 28 Modifications catalog with metadata, item type compatibility, and schemas.
 */

import {
  SPECIALIST_CLASS_ID,
  isSpecialist,
  specialistLevel,
  specialistProfile,
  isInventor,
  calculateInventorDC,
  registerInventorPools,
  defineInventorPools
} from "./specialist-rules.mjs";

export { defineInventorPools, registerInventorPools, calculateInventorDC };
import {
  definePool,
  getPoolDefinition,
  getPool,
  spendPool,
  refundPool
} from "./resource-pools.mjs";
import { need, flag } from "./operation-kernel.mjs";
import { hasWeaponProperty, weaponDamageParts, weaponProperties } from "./weapon-properties.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";

export const INVENTOR_SUBCLASS_ID = "subclass-specialist-inventor";
export const INVENTOR_BRANCH_KEY = "inventor";

let inventorHooksInstalled = false;

export function registerInventorHooks() {
  defineInventorPools();
  if (globalThis.game && !globalThis.game?.ak5e?.specialist?.inventor) {
    try {
      if (!Object.isFrozen(globalThis.game.ak5e ?? {}) && !Object.isFrozen(globalThis.game.ak5e?.specialist ?? {})) {
        globalThis.game.ak5e ??= {};
        globalThis.game.ak5e.specialist ??= {};
        globalThis.game.ak5e.specialist.inventor = {
          calculateInstability,
          evaluateBreakdownRoll,
          applyEquipmentModification,
          removeEquipmentModification,
          repairBrokenEquipment,
          calculateDC: calculateInventorDC,
          executeModificationActivation,
          executeActivation: executeModificationActivation,
          getModification,
          getModificationDamageFormula,
          getModificationSaveInfo,
          validateModificationCompatibility,
          applyConditionToActor,
          MODIFICATIONS_CATALOG,
          MODIFICATION_CATEGORIES,
          INVENTOR_CONDITIONS,
          CONTRAPTIONS_CATALOG,
          getContraption,
          getAvailableContraptions,
          resetContraptions,
          executeContraption,
          executeMobileModding,
          onCreatureReducedToZeroHP,
          resetInventorTurnTriggers,
          THE_BIG_ONE_MODES,
          executeTheBigOne,
          resetTheBigOne
        };
      }
    } catch {
      // Ignored if game.ak5e or game.ak5e.specialist is frozen by ak5e.mjs
    }
  }

  if (inventorHooksInstalled) return;
  inventorHooksInstalled = true;

  // 1. Long Rest: reset 1/LR contraptions and The Big One
  if (globalThis.Hooks?.on) {
    globalThis.Hooks.on("dnd5e.restCompleted", async (actor, data) => {
      if (data?.longRest && isInventor(actor)) {
        await resetContraptions(actor);
        await resetTheBigOne(actor);
      }
    });

    globalThis.Hooks.on("dnd5e.zeroHP", async (target, sourceActor) => {
      await onCreatureReducedToZeroHP(target, sourceActor);
    });
  }

  // 2. Turn Start: reset 1/turn prowess trigger and activated mods tracker
  try {
    onAk5eEvent("turnStart", async event => {
      const actor = event?.raw?.actor ?? (event?.actorUuid && globalThis.fromUuidSync ? globalThis.fromUuidSync(event.actorUuid) : null);
      if (actor) {
        await resetInventorTurnTriggers(actor);
      }
    });

    // 3. Kill event: check creature reduced to 0 HP
    onAk5eEvent("kill", async event => {
      const deadActor = event?.raw?.actor ?? (event?.actorUuid && globalThis.fromUuidSync ? globalThis.fromUuidSync(event.actorUuid) : null);
      const killerActor = event?.raw?.sourceActor ?? (event?.sourceActorUuid && globalThis.fromUuidSync ? globalThis.fromUuidSync(event.sourceActorUuid) : null);
      if (deadActor && killerActor) {
        await onCreatureReducedToZeroHP(deadActor, killerActor);
      }
    });

    // 4. Long Rest via trigger events
    onAk5eEvent("longRest", async event => {
      const actor = event?.raw?.actor ?? (event?.actorUuid && globalThis.fromUuidSync ? globalThis.fromUuidSync(event.actorUuid) : null);
      if (actor && isInventor(actor)) {
        await resetContraptions(actor);
        await resetTheBigOne(actor);
      }
    });
  } catch {}
}

/* ---------------------------------------------------------------- Subclass Feature Checks */

export function hasEquipmentModification(actor) {
  if (!actor) return false;
  return Boolean(isInventor(actor) && (specialistLevel(actor) >= 1));
}

export function hasStrangeContraption(actor) {
  if (!actor) return false;
  return Boolean(isInventor(actor) && (specialistLevel(actor) >= 5));
}

export function hasMobileModding(actor) {
  if (!actor) return false;
  return Boolean(isInventor(actor) && (specialistLevel(actor) >= 5));
}

export function hasRiskAssessment(actor) {
  if (!actor) return false;
  return Boolean(isInventor(actor) && (specialistLevel(actor) >= 11));
}

export function hasStrangerContraptions(actor) {
  if (!actor) return false;
  return Boolean(isInventor(actor) && (specialistLevel(actor) >= 15));
}

export function hasTheBigOne(actor) {
  if (!actor) return false;
  return Boolean(isInventor(actor) && (specialistLevel(actor) >= 20));
}

/* ---------------------------------------------------------------- Equipment Inspection */

export function isWeapon(item) {
  if (!item) return false;
  return item.type === "weapon" || Boolean(item.system?.weaponType);
}

export function isArmor(item) {
  if (!item) return false;
  if (item.type === "equipment") {
    const armorType = item.system?.type?.value ?? item.system?.armor?.type;
    return ["light", "medium", "heavy", "shield", "clothing"].includes(armorType) || item.system?.armor?.value !== undefined;
  }
  return false;
}

export function isModifiableEquipment(item) {
  return isWeapon(item) || isArmor(item);
}

export function isMagicalEquipment(item) {
  if (!item) return false;
  const sys = item.system ?? {};
  const props = sys.properties;
  const hasMgcProp = props instanceof Set ? props.has("mgc") :
                     Array.isArray(props) ? props.includes("mgc") :
                     typeof props === "object" ? Boolean(props?.mgc) : false;
  const rarity = String(sys.rarity ?? "").toLowerCase();
  const isNonMundaneRarity = rarity !== "" && rarity !== "common" && rarity !== "mundane";
  return Boolean(sys.magical || hasMgcProp || isNonMundaneRarity);
}

export function isBrokenEquipment(item) {
  if (!item) return false;
  return Boolean(
    item.getFlag?.("ak5e", "isBroken") ??
    item.flags?.ak5e?.isBroken ??
    item.getFlag?.("ak5e", "inventor")?.isBroken ??
    item.flags?.ak5e?.inventor?.isBroken ??
    false
  );
}

export async function repairBrokenEquipment(item, actor, options = {}) {
  need(item, "Item is required for repair.");
  const wasBroken = isBrokenEquipment(item);

  if (typeof item.setFlag === "function") {
    await item.setFlag("ak5e", "isBroken", false);
    if (item.getFlag?.("ak5e", "inventor.isBroken") !== undefined) {
      await item.setFlag("ak5e", "inventor.isBroken", false);
    }
  } else if (typeof item.update === "function") {
    await item.update({
      "flags.ak5e.isBroken": false,
      "flags.ak5e.inventor.isBroken": false
    });
  } else {
    item.flags ??= {};
    item.flags.ak5e ??= {};
    item.flags.ak5e.isBroken = false;
    if (item.flags.ak5e.inventor) {
      item.flags.ak5e.inventor.isBroken = false;
    }
  }

  return {
    success: true,
    item,
    wasBroken,
    repaired: true,
    kitUsed: options.maintenanceKit ?? "Maintenance Kit"
  };
}

/* ---------------------------------------------------------------- Modifications Catalog */

export const MODIFICATION_CATEGORIES = Object.freeze({
  MELEE: "melee",
  RANGED: "ranged",
  ARMOR: "armor"
});

export const MODIFICATIONS_CATALOG = Object.freeze({
  // Melee Weapon Modifications (10 total, 1 Dangerous)
  "boom-module": Object.freeze({
    id: "boom-module",
    name: "Boom Module",
    category: MODIFICATION_CATEGORIES.MELEE,
    itemType: "weapon",
    subType: "Bludgeoning",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-boom-module-9725",
    actionCost: "none",
    trigger: "onHit",
    damageType: "thunder",
    extraDamageDice: "1 die",
    saveAbility: "str",
    saveDcType: "inventor",
    conditions: ["prone"],
    knockbackFeet: 20,
    frequency: "oncePerTurn",
    summary: "Hit -> +1 die Thunder damage, STR save vs Inventor DC or 20 ft knockback & Prone."
  }),
  "burning-edge": Object.freeze({
    id: "burning-edge",
    name: "Burning Edge",
    category: MODIFICATION_CATEGORIES.MELEE,
    itemType: "weapon",
    subType: "Melee",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-burning-edge-10208",
    actionCost: "attackAction",
    trigger: "attackAction",
    damageConverted: "fire",
    duration: "endOfTurn",
    frequency: "oncePerTurn",
    summary: "Attack Action -> weapon attack damage converted to Fire until end of turn."
  }),
  "collapsible-weapon-melee": Object.freeze({
    id: "collapsible-weapon-melee",
    name: "Collapsible Weapon (Melee)",
    category: MODIFICATION_CATEGORIES.MELEE,
    itemType: "weapon",
    subType: "Melee",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-collapsible-weapon-10506",
    actionCost: "action",
    revertActionCost: "bonus",
    disguisedDamage: "1d4",
    disguisedDamageType: "bludgeoning",
    summary: "Action -> fold to disguise (improvised weapon); Bonus Action -> revert."
  }),
  "flexible-weapon": Object.freeze({
    id: "flexible-weapon",
    name: "Flexible Weapon",
    category: MODIFICATION_CATEGORIES.MELEE,
    itemType: "weapon",
    subType: "Melee",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-flexible-weapon-11074",
    actionCost: "bonus",
    trigger: "meleeAttack",
    ignoreShieldAC: true,
    repeatAttackBonusAction: true,
    repeatAttackRangeFeet: 10,
    frequency: "oncePerTurn",
    summary: "Ignore target shield AC bonus; Bonus Action -> repeat attack on creature within 10 ft."
  }),
  "laser-cutter": Object.freeze({
    id: "laser-cutter",
    name: "Laser Cutter [Dangerous]",
    category: MODIFICATION_CATEGORIES.MELEE,
    itemType: "weapon",
    subType: "Melee",
    isDangerous: true,
    chapterThreeId: "subclass-feature-specialist-inventor-laser-cutter-dangerous-11623",
    actionCost: "forgoAttack",
    trigger: "forgoAttack",
    area: Object.freeze({ type: "cone", sizeFeet: 15 }),
    saveAbility: "dex",
    saveDcType: "inventor",
    halfOnSave: true,
    damageType: "radiant",
    damageScaling: Object.freeze({ "1-6": "3d8", "7-13": "4d8", "14-20": "5d8" }),
    summary: "Forgo attack -> 15 ft cone DEX save for 3d8/4d8/5d8 Radiant (half on save). Dangerous mod."
  }),
  "returner": Object.freeze({
    id: "returner",
    name: "Returner",
    category: MODIFICATION_CATEGORIES.MELEE,
    itemType: "weapon",
    subType: "Melee",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-returner-12242",
    actionCost: "bonus",
    trigger: "attackAction",
    grantsProperty: "returning",
    recallAction: "bonus",
    recallCondition: "disarmedOrDropped",
    duration: "endOfTurn",
    summary: "Attack Action -> Returning property until end of turn; Bonus Action -> recall within normal range."
  }),
  "rotary-blade": Object.freeze({
    id: "rotary-blade",
    name: "Rotary Blade",
    category: MODIFICATION_CATEGORIES.MELEE,
    itemType: "weapon",
    subType: "Slashing/Piercing",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-rotary-blade-12836",
    actionCost: "none",
    trigger: "onHit",
    extraDamageDice: "1 die",
    damageType: "slashing",
    saveAbility: "dex",
    saveDcType: "inventor",
    conditions: ["bleeding"],
    frequency: "oncePerTurn",
    summary: "Hit -> +1 die Slashing damage + DEX save vs Inventor DC or Bleeding."
  }),
  "shock-engine": Object.freeze({
    id: "shock-engine",
    name: "Shock Engine",
    category: MODIFICATION_CATEGORIES.MELEE,
    itemType: "weapon",
    subType: "Melee",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-shock-engine-13350",
    actionCost: "none",
    trigger: "onHit",
    damageConverted: "lightning",
    saveAbility: "dex",
    saveDcType: "inventor",
    conditions: ["dazed"],
    conditionDuration: "endOfNextTurn",
    frequency: "oncePerTurn",
    summary: "Hit -> damage converted to Lightning + DEX save vs Inventor DC or Dazed until end of next turn."
  }),
  "telescopic-weapon": Object.freeze({
    id: "telescopic-weapon",
    name: "Telescopic Weapon",
    category: MODIFICATION_CATEGORIES.MELEE,
    itemType: "weapon",
    subType: "Melee",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-telescopic-weapon-13936",
    actionCost: "attackAction",
    trigger: "attackAction",
    grantsProperty: "reach",
    extendedReachFeet: 15,
    duration: "endOfTurn",
    frequency: "oncePerTurn",
    summary: "Attack Action -> Reach property (or 15 ft if already Reach) until end of turn."
  }),
  "trick-weapon": Object.freeze({
    id: "trick-weapon",
    name: "Trick Weapon",
    category: MODIFICATION_CATEGORIES.MELEE,
    itemType: "weapon",
    subType: "Melee",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-trick-weapon-14197",
    actionCost: "bonus",
    duration: "1min",
    targetOptions: ["light", "heavy"],
    inheritsProficiency: true,
    summary: "Bonus Action -> transform into chosen Light/Heavy melee weapon for 1 min."
  }),

  // Ranged Weapon Modifications (8 total, 1 Dangerous)
  "arts-cannon": Object.freeze({
    id: "arts-cannon",
    name: "Arts Cannon [Dangerous]",
    category: MODIFICATION_CATEGORIES.RANGED,
    itemType: "weapon",
    subType: "Two-Handed",
    isDangerous: true,
    chapterThreeId: "subclass-feature-specialist-inventor-arts-cannon-dangerous-14509",
    actionCost: "action",
    rangeFeet: 60,
    area: Object.freeze({ type: "sphere", radiusFeet: 10 }),
    saveAbility: "dex",
    saveDcType: "inventor",
    halfOnSave: true,
    damageType: "force",
    damageScaling: Object.freeze({ "1-6": "3d8", "7-13": "4d8", "14-20": "5d8" }),
    summary: "Action -> 60 ft range, 10 ft radius sphere DEX save for 3d8/4d8/5d8 Force (half on save). Dangerous mod."
  }),
  "collapsible-weapon-ranged": Object.freeze({
    id: "collapsible-weapon-ranged",
    name: "Collapsible Weapon (Ranged)",
    category: MODIFICATION_CATEGORIES.RANGED,
    itemType: "weapon",
    subType: "Ranged",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-collapsible-weapon-15104",
    actionCost: "action",
    revertActionCost: "bonus",
    disguisedDamage: "1d4",
    disguisedDamageType: "bludgeoning",
    summary: "Action -> fold to disguise (improvised weapon); Bonus Action -> revert."
  }),
  "explosive-shots": Object.freeze({
    id: "explosive-shots",
    name: "Explosive Shots",
    category: MODIFICATION_CATEGORIES.RANGED,
    itemType: "weapon",
    subType: "Light/Heavy Ranged",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-explosive-shots-15672",
    actionCost: "none",
    trigger: "onAttack",
    rollDamageOnMiss: true,
    area: Object.freeze({ type: "radius", radiusFeet: 10, target: "otherCreatures" }),
    saveAbility: "dex",
    saveDcType: "inventor",
    damageType: "thunder",
    damageFractionOnFailedSave: 0.5,
    summary: "On attack -> roll damage even on miss; other creatures within 10 ft DEX save for half damage as Thunder."
  }),
  "electrobolts": Object.freeze({
    id: "electrobolts",
    name: "Electrobolts",
    category: MODIFICATION_CATEGORIES.RANGED,
    itemType: "weapon",
    subType: "Non-Splash",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-electrobolts-16212",
    actionCost: "bonus",
    trigger: "onHit",
    damageConverted: "lightning",
    saveAbility: "con",
    saveDcType: "inventor",
    conditions: ["nervous-impairment"],
    conditionDuration: "startOfNextTurn",
    summary: "Hit Bonus Action -> Lightning damage + CON save or Nervous Impairment until start of next turn."
  }),
  "flame-gout": Object.freeze({
    id: "flame-gout",
    name: "Flame Gout",
    category: MODIFICATION_CATEGORIES.RANGED,
    itemType: "weapon",
    subType: "Two-Handed",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-flame-gout-16812",
    actionCost: "action",
    area: Object.freeze({ type: "cone", sizeFeet: 15 }),
    saveAbility: "dex",
    saveDcType: "inventor",
    halfOnSave: true,
    damageType: "fire",
    conditions: ["burning"],
    noConditionOnSave: true,
    damageScaling: Object.freeze({ "1-6": "1d8", "7-13": "2d8", "14-20": "3d8" }),
    summary: "Action -> 15 ft cone DEX save for 1d8/2d8/3d8 Fire + Burning (half on save)."
  }),
  "homing-shots": Object.freeze({
    id: "homing-shots",
    name: "Homing Shots",
    category: MODIFICATION_CATEGORIES.RANGED,
    itemType: "weapon",
    subType: "Light/Heavy Ranged",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-homing-shots-17441",
    actionCost: "reaction",
    trigger: "onMiss",
    rerollAttack: true,
    mustUseNewResult: true,
    maxRerolls: 1,
    summary: "Miss Reaction -> reroll attack (must use new result)."
  }),
  "melee-attachment": Object.freeze({
    id: "melee-attachment",
    name: "Melee Attachment",
    category: MODIFICATION_CATEGORIES.RANGED,
    itemType: "weapon",
    subType: "Ranged",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-melee-attachment-17983",
    actionCost: "bonus",
    trigger: "bonusOrOpportunity",
    allowsMeleeWithRanged: true,
    useDexModifier: true,
    baseDamage: "1d8",
    damageType: "piercing",
    duration: "endOfTurn",
    summary: "Bonus Action or Opportunity Attack -> melee attacks using DEX for 1d8 + modifier Piercing until end of turn."
  }),
  "safety-removal": Object.freeze({
    id: "safety-removal",
    name: "Safety Removal",
    category: MODIFICATION_CATEGORIES.RANGED,
    itemType: "weapon",
    subType: "Firearm",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-safety-removal-18546",
    actionCost: "attackAction",
    trigger: "attackAction",
    additionalAttacks: 1,
    disadvantageOnAll: true,
    summary: "Attack Action -> 1 additional attack, but all attacks in that action have Disadvantage."
  }),

  // Armour Modifications (10 total, 1 Dangerous)
  "adrenal-overloader": Object.freeze({
    id: "adrenal-overloader",
    name: "Adrenal Overloader [Dangerous]",
    category: MODIFICATION_CATEGORIES.ARMOR,
    itemType: "armor",
    subType: "Any Armour",
    isDangerous: true,
    chapterThreeId: "subclass-feature-specialist-inventor-adrenal-overloader-dangerous-18933",
    actionCost: "none",
    trigger: "duringTurn",
    additionalActions: 1,
    frequency: "shortRest",
    perTurnLimit: 1,
    summary: "During turn -> gain 1 additional Action this turn (1/Short Rest, 1/turn). Dangerous mod."
  }),
  "artsfield-generator": Object.freeze({
    id: "artsfield-generator",
    name: "Artsfield Generator",
    category: MODIFICATION_CATEGORIES.ARMOR,
    itemType: "armor",
    subType: "Medium/Heavy",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-artsfield-generator-19515",
    actionCost: "reaction",
    trigger: "allyHitWithin5ft",
    grantsResistance: true,
    summary: "Reaction when creature within 5 ft hit -> grant Resistance against 1 damage type from that attack."
  }),
  "camouflage-cloak": Object.freeze({
    id: "camouflage-cloak",
    name: "Camouflage Cloak",
    category: MODIFICATION_CATEGORIES.ARMOR,
    itemType: "armor",
    subType: "Light/Clothing",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-camouflage-cloak-20078",
    actionCost: "action",
    duration: "1min",
    stealthAdvantage: true,
    perceptionDisadvantageAgainstWearer: true,
    summary: "Action -> 1 min Advantage on Stealth checks, and Perception checks to see wearer made at Disadvantage."
  }),
  "exoskeleton": Object.freeze({
    id: "exoskeleton",
    name: "Exoskeleton",
    category: MODIFICATION_CATEGORIES.ARMOR,
    itemType: "armor",
    subType: "Any Armour",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-exoskeleton-20674",
    actionCost: "bonus",
    duration: "startOfNextTurn",
    sizeBonus: 1,
    doubleJump: true,
    athleticsAdvantage: true,
    unhinderedCarrying: true,
    summary: "Bonus Action -> 1 size larger for push/pull/carry, double jump, Advantage on Athletics, unhindered carrying <= size creature."
  }),
  "jetboots": Object.freeze({
    id: "jetboots",
    name: "Jetboots",
    category: MODIFICATION_CATEGORIES.ARMOR,
    itemType: "armor",
    subType: "Any Armour",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-jetboots-21273",
    actionCost: "bonus",
    grantsDash: true,
    straightLineOnly: true,
    summary: "Bonus Action -> immediately take Dash Action in a single straight line."
  }),
  "life-support": Object.freeze({
    id: "life-support",
    name: "Life Support",
    category: MODIFICATION_CATEGORIES.ARMOR,
    itemType: "armor",
    subType: "Any Armour",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-life-support-21820",
    actionCost: "bonus",
    hpThreshold: 0.5,
    rollsHitDie: true,
    addsConMod: true,
    healsWearer: true,
    summary: "Below half HP Bonus Action -> roll 1 Hit Die + CON mod and recover that many HP."
  }),
  "powered-gauntlet": Object.freeze({
    id: "powered-gauntlet",
    name: "Powered Gauntlet",
    category: MODIFICATION_CATEGORIES.ARMOR,
    itemType: "armor",
    subType: "Any Armour",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-powered-gauntlet-22394",
    actionCost: "none",
    trigger: "onUnarmedHit",
    extraDamageDice: "1 die",
    damageType: "lightning",
    summary: "Unarmed strike hit -> +1 die Lightning damage."
  }),
  "refocuser": Object.freeze({
    id: "refocuser",
    name: "Refocuser",
    category: MODIFICATION_CATEGORIES.ARMOR,
    itemType: "armor",
    subType: "Any Armour/Clothing",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-refocuser-22964",
    actionCost: "reaction",
    trigger: "onFailedConConcentrationSave",
    rerollSave: true,
    rerollWithAdvantage: true,
    summary: "Failed CON concentration save Reaction -> reroll save with Advantage."
  }),
  "shock-absorbers": Object.freeze({
    id: "shock-absorbers",
    name: "Shock Absorbers",
    category: MODIFICATION_CATEGORIES.ARMOR,
    itemType: "armor",
    subType: "Any Armour",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-shock-absorbers-23518",
    actionCost: "reaction",
    trigger: "onStrOrDexSave",
    addIntModToSave: true,
    summary: "STR or DEX save Reaction -> add Inventor's INT modifier to the roll."
  }),
  "wingsuit": Object.freeze({
    id: "wingsuit",
    name: "Wingsuit",
    category: MODIFICATION_CATEGORIES.ARMOR,
    itemType: "armor",
    subType: "Light/Clothing",
    isDangerous: false,
    chapterThreeId: "subclass-feature-specialist-inventor-wingsuit-24097",
    actionCost: "reaction",
    trigger: "falling10ftOrMore",
    flyingSpeedFeet: 30,
    cannotAscend: true,
    minimumDescendFeetPerTurn: 10,
    duration: "untilLanding",
    summary: "Falling Reaction -> Flying Speed 30 ft until landing (descend >= 10 ft/turn, cannot ascend)."
  })
});

export function getModification(id) {
  if (!id) return null;
  if (typeof id === "object" && id.id) return id;
  return MODIFICATIONS_CATALOG[id] ?? null;
}

/* ---------------------------------------------------------------- Equipment Modification State */

export function getItemModifications(item) {
  if (!item) return [];
  const raw = item.getFlag?.("ak5e", "inventor.modifications") ??
              item.getFlag?.("ak5e", "inventor")?.modifications ??
              item.flags?.ak5e?.["inventor.modifications"] ??
              item.flags?.ak5e?.inventor?.modifications ??
              item.getFlag?.("ak5e", "modifications") ??
              item.flags?.ak5e?.modifications ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map(entry => {
    if (typeof entry === "string") {
      const catalogEntry = getModification(entry);
      return catalogEntry ?? { id: entry, name: entry, isDangerous: false };
    }
    const catalogEntry = getModification(entry.id);
    return {
      ...(catalogEntry ?? {}),
      ...entry,
      isDangerous: Boolean(entry.isDangerous ?? catalogEntry?.isDangerous ?? false)
    };
  });
}

export function isSpecialisedWeapon(actor, item) {
  if (!actor || !item || !isWeapon(item)) return false;
  const profile = specialistProfile(actor);
  const specCat = profile?.weaponCategory ?? actor.flags?.ak5e?.specialist?.weaponCategory ?? null;
  if (!specCat) return false;

  const sys = item.system ?? {};
  const isRanged = (sys.actionType === "rwak") ||
                   Boolean(item.system?.weaponType?.toLowerCase().includes("ranged")) ||
                   Boolean(sys.type?.value?.toLowerCase().includes("ranged")) ||
                   isRangedWeapon(item);
  const isMelee = !isRanged;

  return (specCat === "melee" && isMelee) || (specCat === "ranged" && isRanged);
}

/* ---------------------------------------------------------------- Instability Engine */

/**
 * Calculates equipment Instability (Ch. 3 L5864, L5911–5916, L5954–5956):
 * Base 3 + (numMods - 1) + numDangerousMods - riskAssessmentReductions.
 * Minimum clamp: 1. Unmodified items return 0.
 */
export function calculateInstability(item, actor, options = {}) {
  const mods = getItemModifications(item);
  const numMods = mods.length;
  if (numMods === 0 && !options.base) return 0;

  const base = Number(options.base ?? 3);
  const additionalMods = Math.max(0, numMods - 1);
  const numDangerous = mods.filter(m => m.isDangerous).length;

  let reductions = 0;
  if (options.riskAssessmentReductions !== undefined) {
    reductions = Number(options.riskAssessmentReductions);
  } else {
    // Determine Inventor actor who modified the item
    const installedMods = getItemModifications(item);
    const modWithInv = installedMods.find(m => m.inventorId || m.inventorUuid);
    const creatorId = item?.getFlag?.("ak5e", "inventor")?.creatorId ?? item?.flags?.ak5e?.inventor?.creatorId;
    const invId = options.inventorId ?? modWithInv?.inventorId ?? creatorId;
    const foundInvFromGame = invId && globalThis.game?.actors?.get ? globalThis.game.actors.get(invId) : null;

    const inventorActor = options.inventorActor ?? options.inventor ??
      (isInventor(actor) ? actor : null) ??
      foundInvFromGame ??
      (isInventor(item?.actor) ? item.actor : null) ??
      (isInventor(item?.parent) ? item.parent : null) ??
      actor ?? null;

    const wielderActor = options.wielderActor ?? options.wielder ?? actor ?? item?.actor ?? item?.parent ?? null;

    if (inventorActor) {
      const isInventorActor = isInventor(inventorActor);
      const hasRA = hasRiskAssessment(inventorActor) || Boolean(options.hasRiskAssessment);
      if (hasRA && isInventorActor) {
        // Speciality Modding: -1 Instability on modified weapons matching Weapon Specialisation Feature choice
        const matchesSpeciality = Boolean(options.specialityModding ?? isSpecialisedWeapon(inventorActor, item));
        if (matchesSpeciality) reductions += 1;

        // Trained Operator: -1 Instability on modified equipment wielded/worn by the Inventor
        const isOperator = Boolean(options.trainedOperator ?? options.isInventorWielder ?? (wielderActor === inventorActor || item?.actor === inventorActor || item?.parent === inventorActor));
        if (isOperator) reductions += 1;
      }
    }
  }

  const rawInstability = base + additionalMods + numDangerous - reductions;
  return Math.max(1, rawInstability);
}

/* ---------------------------------------------------------------- Breakdown Roll Evaluation */

/**
 * Evaluates an Nd6 breakdown roll on modification activation (Ch. 3 L5864, L5954–5956).
 * Checks for any duplicate dice in the roll array;
 * Computes HP loss 1d8 + max(0, instability - 3)d8, clamped to not reduce HP below 1;
 * Flags equipment broken if activatedMod is Dangerous.
 */
export function evaluateBreakdownRoll(rollResults, instability, activatedMod, options = {}) {
  let dice = [];
  if (Array.isArray(rollResults)) {
    dice = rollResults.map(r => (typeof r === "object" ? Number(r.result ?? r.value ?? r) : Number(r)));
  } else if (rollResults?.dice?.[0]?.results) {
    dice = rollResults.dice[0].results.map(r => Number(r.result));
  } else if (rollResults?.terms) {
    for (const term of rollResults.terms) {
      if (Array.isArray(term.results)) {
        for (const r of term.results) dice.push(Number(r.result));
      }
    }
  }

  const counts = new Map();
  const duplicateValues = [];
  let isBreakdown = false;

  for (const val of dice) {
    const c = (counts.get(val) ?? 0) + 1;
    counts.set(val, c);
    if (c >= 2 && !duplicateValues.includes(val)) {
      duplicateValues.push(val);
      isBreakdown = true;
    }
  }

  const inst = Number(instability ?? (dice.length > 0 ? dice.length : 3));
  const extraDice = Math.max(0, inst - 3);
  const totalD8Count = 1 + extraDice;
  const hpLossFormula = `${totalD8Count}d8`;

  let actualHPLoss = null;
  let rawDamage = null;

  if (isBreakdown && options.damage !== undefined) {
    rawDamage = Number(options.damage);
    if (options.currentHP !== undefined) {
      const curHP = Number(options.currentHP);
      const maxAllowedDeduction = Math.max(0, curHP - 1);
      actualHPLoss = Math.min(rawDamage, maxAllowedDeduction);
    } else {
      actualHPLoss = rawDamage;
    }
  }

  const modEntry = getModification(activatedMod?.id ?? activatedMod);
  const isDangerousMod = Boolean(activatedMod?.isDangerous ?? modEntry?.isDangerous ?? false);
  const isBroken = Boolean(isBreakdown && isDangerousMod);

  return {
    isBreakdown,
    matchingDice: duplicateValues,
    instability: inst,
    hpLossFormula,
    hpLossDiceCount: totalD8Count,
    rawDamage,
    actualHPLoss,
    isBroken,
    equipmentBroken: isBroken,
    activatedMod: modEntry ?? activatedMod ?? null
  };
}

/* ---------------------------------------------------------------- Equipment Modification Operations */

export async function applyEquipmentModification(item, modificationId, options = {}) {
  need(item, "Item is required for modification.");
  need(modificationId, "Modification ID is required.");

  if (!isModifiableEquipment(item)) {
    throw new Error("Item must be a weapon or piece of armor.");
  }
  if (isMagicalEquipment(item)) {
    throw new Error("Cannot apply modifications to magical equipment.");
  }

  const mod = getModification(modificationId);
  need(mod, `Unknown modification "${modificationId}".`);

  // Category and Subtype compatibility checks
  if (mod.category === MODIFICATION_CATEGORIES.MELEE) {
    if (!isWeapon(item)) {
      throw new Error(`Modification "${mod.name}" can only be applied to a Melee Weapon.`);
    }
    if (isRangedWeapon(item) && !item.flags?.ak5e?.allowMeleeMod) {
      throw new Error(`Modification "${mod.name}" can only be applied to a Melee Weapon.`);
    }
    if (options.strictSubtype) {
      if (mod.id === "boom-module" && !weaponDealsDamageType(item, "bludgeoning") && !options.force) {
        throw new Error(`Modification "${mod.name}" requires a weapon that deals Bludgeoning Damage.`);
      }
      if (mod.id === "rotary-blade" && !weaponDealsDamageType(item, "slashing") && !weaponDealsDamageType(item, "piercing") && !options.force) {
        throw new Error(`Modification "${mod.name}" requires a weapon that deals Slashing or Piercing Damage.`);
      }
    }
  }

  if (mod.category === MODIFICATION_CATEGORIES.RANGED) {
    if (!isWeapon(item)) {
      throw new Error(`Modification "${mod.name}" can only be applied to a Ranged Weapon.`);
    }
    if (isMeleeWeapon(item) && !isRangedWeapon(item) && !options.force) {
      throw new Error(`Modification "${mod.name}" can only be applied to a Ranged Weapon.`);
    }
    if (["arts-cannon", "flame-gout"].includes(mod.id)) {
      if (!isTwoHandedWeapon(item) && !options.force) {
        throw new Error(`Modification "${mod.name}" requires a Ranged Weapon with the Two-Handed Property.`);
      }
    }
    if (mod.id === "safety-removal") {
      if (!isFirearmWeapon(item) && !options.force) {
        throw new Error(`Modification "${mod.name}" requires a Ranged Weapon with the Firearm Property.`);
      }
    }
    if (mod.id === "electrobolts") {
      if ((hasWeaponProperty(item, "splash") || isFirearmWeapon(item)) && !options.force) {
        throw new Error(`Modification "${mod.name}" requires a Ranged Weapon without Splash or Firearm properties.`);
      }
    }
    if (["explosive-shots", "homing-shots"].includes(mod.id)) {
      const hasProps = (item.system?.properties instanceof Set ? item.system.properties.size > 0 :
                       Array.isArray(item.system?.properties) ? item.system.properties.length > 0 : false) ||
                       Boolean(item.system?.weaponType?.includes("simpleR") || item.system?.weaponType?.includes("martialR"));
      if (hasProps && !isLightWeapon(item) && !isHeavyWeapon(item) && !options.force) {
        throw new Error(`Modification "${mod.name}" requires a Light or Heavy Ranged Weapon.`);
      }
    }
  }

  if (mod.category === MODIFICATION_CATEGORIES.ARMOR) {
    if (!isArmor(item)) {
      throw new Error(`Modification "${mod.name}" can only be applied to Armor.`);
    }
    const armorType = getArmorType(item);
    if (mod.id === "artsfield-generator" && armorType && !["medium", "heavy"].includes(armorType) && !options.force) {
      throw new Error(`Modification "${mod.name}" requires Medium or Heavy Armor.`);
    }
    if (["camouflage-cloak", "wingsuit"].includes(mod.id) && armorType && !["light", "clothing"].includes(armorType) && !options.force) {
      throw new Error(`Modification "${mod.name}" requires Light Armor or Clothing.`);
    }
  }

  const existingMods = getItemModifications(item);
  if (existingMods.some(m => m.id === mod.id)) {
    if (!options.force) {
      throw new Error(`Cannot apply duplicate modification: equipment already has "${mod.name}".`);
    }
    return { item, modification: mod, alreadyInstalled: true };
  }

  const actor = options.actor ?? item.actor ?? item.parent ?? null;
  const isMobileModding = Boolean(options.isMobileModding);
  const inventorActor = options.inventorActor ?? options.inventor ?? (isInventor(actor) ? actor : null);

  // Inventions pool handling
  if (actor && !isMobileModding && !options.skipPoolSpend && getPoolDefinition("inventions")) {
    const currentPool = getPool(actor, "inventions");
    if (currentPool) {
      if (currentPool.value < 1 && !options.force) {
        throw new Error("Insufficient Inventions available to apply modification.");
      }
      if (currentPool.value >= 1) {
        await spendPool(actor, "inventions", 1);
      }
    }
  }

  const newEntry = {
    id: mod.id,
    name: mod.name,
    category: mod.category,
    isDangerous: Boolean(mod.isDangerous),
    appliedAt: options.appliedAt ?? Date.now(),
    isMobileModding,
    temporary: Boolean(isMobileModding || options.temporary),
    duration: isMobileModding ? "1min" : (options.duration ?? null),
    inventorId: inventorActor?.id ?? options.inventorId ?? null,
    inventorUuid: inventorActor?.uuid ?? options.inventorUuid ?? null,
    expiresAt: options.expiresAt ?? (isMobileModding ? ((options.appliedAt ?? Date.now()) + 60000) : null)
  };

  const updatedMods = [...existingMods, newEntry];

  if (typeof item.setFlag === "function") {
    await item.setFlag("ak5e", "inventor.modifications", updatedMods);
    if (inventorActor?.id) await item.setFlag("ak5e", "inventor.creatorId", inventorActor.id);
    if (inventorActor?.uuid) await item.setFlag("ak5e", "inventor.creatorUuid", inventorActor.uuid);
  } else if (typeof item.update === "function") {
    const updates = { "flags.ak5e.inventor.modifications": updatedMods };
    if (inventorActor?.id) updates["flags.ak5e.inventor.creatorId"] = inventorActor.id;
    if (inventorActor?.uuid) updates["flags.ak5e.inventor.creatorUuid"] = inventorActor.uuid;
    await item.update(updates);
  } else {
    item.flags ??= {};
    item.flags.ak5e ??= {};
    item.flags.ak5e.inventor ??= {};
    item.flags.ak5e.inventor.modifications = updatedMods;
    item.flags.ak5e["inventor.modifications"] = updatedMods;
    if (inventorActor?.id) item.flags.ak5e.inventor.creatorId = inventorActor.id;
    if (inventorActor?.uuid) item.flags.ak5e.inventor.creatorUuid = inventorActor.uuid;
  }

  const instability = calculateInstability(item, actor, options);

  return {
    success: true,
    item,
    modification: mod,
    modifications: updatedMods,
    instability
  };
}

export async function removeEquipmentModification(item, modificationId, options = {}) {
  need(item, "Item is required for modification removal.");
  need(modificationId, "Modification ID is required.");

  const modKey = typeof modificationId === "object" ? modificationId.id : modificationId;
  const existingMods = getItemModifications(item);
  const foundIndex = existingMods.findIndex(m => m.id === modKey);

  if (foundIndex === -1) {
    throw new Error(`Modification "${modKey}" is not installed on this equipment.`);
  }

  const removedMod = existingMods[foundIndex];
  const updatedMods = existingMods.filter((_, idx) => idx !== foundIndex);

  const actor = options.actor ?? item.actor ?? item.parent ?? null;
  const wasMobileMod = Boolean(removedMod.isMobileModding);

  // Inventions pool refund
  if (actor && !wasMobileMod && getPoolDefinition("inventions")) {
    await refundPool(actor, "inventions", 1);
  }

  if (typeof item.setFlag === "function") {
    await item.setFlag("ak5e", "inventor.modifications", updatedMods);
  } else if (typeof item.update === "function") {
    await item.update({
      "flags.ak5e.inventor.modifications": updatedMods
    });
  } else {
    item.flags ??= {};
    item.flags.ak5e ??= {};
    item.flags.ak5e.inventor ??= {};
    item.flags.ak5e.inventor.modifications = updatedMods;
  }

  const instability = calculateInstability(item, actor, options);

  return {
    success: true,
    item,
    removedModification: removedMod,
    removedModificationId: modKey,
    modifications: updatedMods,
    instability
  };
}

/* ---------------------------------------------------------------- Equipment Queries & Subtypes */

export function isMeleeWeapon(item) {
  if (!isWeapon(item)) return false;
  const sys = item.system ?? {};
  if (sys.actionType === "rwak") return false;
  const wt = String(item.system?.weaponType ?? sys.type?.value ?? "").toLowerCase();
  if (wt.includes("ranged") || wt.endsWith("r")) return false;
  return true;
}

export function isRangedWeapon(item) {
  if (!isWeapon(item)) return false;
  const sys = item.system ?? {};
  if (sys.actionType === "rwak") return true;
  const wt = String(item.system?.weaponType ?? sys.type?.value ?? "").toLowerCase();
  return wt.includes("ranged") || wt.endsWith("r");
}

export function getArmorType(item) {
  if (!isArmor(item)) return null;
  const sys = item.system ?? {};
  const armorType = sys.type?.value ?? sys.armor?.type;
  return String(armorType ?? "").toLowerCase();
}

export function weaponDealsDamageType(item, damageType) {
  if (!isWeapon(item)) return false;
  const dt = String(damageType).toLowerCase();
  const sys = item.system ?? {};
  if (Array.isArray(sys.damage?.parts)) {
    for (const part of sys.damage.parts) {
      if (Array.isArray(part) && String(part[1]).toLowerCase() === dt) return true;
    }
  }
  if (sys.damage?.base?.types) {
    const types = Array.from(sys.damage.base.types).map(t => String(t).toLowerCase());
    if (types.includes(dt)) return true;
  }
  try {
    const parts = weaponDamageParts(item);
    if (parts.some(p => p.type?.toLowerCase() === dt)) return true;
  } catch {}
  const sourceTableDamage = item.flags?.ak5e?.tableData?.damage;
  if (typeof sourceTableDamage === "string" && sourceTableDamage.toLowerCase().includes(dt)) return true;
  if (item.flags?.ak5e?.damageType?.toLowerCase() === dt) return true;
  return false;
}

export function isTwoHandedWeapon(item) {
  if (!isWeapon(item)) return false;
  return hasWeaponProperty(item, "twohanded") ||
         hasWeaponProperty(item, "two") ||
         hasWeaponProperty(item, "2h") ||
         Boolean(item.system?.properties?.has?.("two")) ||
         Boolean(item.system?.properties?.has?.("2h")) ||
         (Array.isArray(item.system?.properties) && (item.system.properties.includes("two") || item.system.properties.includes("2h"))) ||
         Boolean(item.system?.properties?.two) ||
         Boolean(item.flags?.ak5e?.twoHanded);
}

export function isLightWeapon(item) {
  if (!isWeapon(item)) return false;
  return hasWeaponProperty(item, "light") ||
         hasWeaponProperty(item, "lgt") ||
         Boolean(item.system?.properties?.has?.("lgt")) ||
         Boolean(item.system?.properties?.has?.("light")) ||
         (Array.isArray(item.system?.properties) && (item.system.properties.includes("lgt") || item.system.properties.includes("light"))) ||
         Boolean(item.system?.properties?.lgt) ||
         Boolean(item.flags?.ak5e?.light);
}

export function isHeavyWeapon(item) {
  if (!isWeapon(item)) return false;
  return hasWeaponProperty(item, "heavy") ||
         hasWeaponProperty(item, "hvy") ||
         Boolean(item.system?.properties?.has?.("hvy")) ||
         Boolean(item.system?.properties?.has?.("heavy")) ||
         (Array.isArray(item.system?.properties) && (item.system.properties.includes("hvy") || item.system.properties.includes("heavy"))) ||
         Boolean(item.system?.properties?.hvy) ||
         Boolean(item.flags?.ak5e?.heavy);
}

export function isFirearmWeapon(item) {
  if (!isWeapon(item)) return false;
  return hasWeaponProperty(item, "firearm") ||
         hasWeaponProperty(item, "fir") ||
         Boolean(item.system?.properties?.has?.("fir")) ||
         Boolean(item.system?.properties?.has?.("firearm")) ||
         Boolean(item.system?.weaponType?.toLowerCase?.().includes("firearm")) ||
         Boolean(item.flags?.ak5e?.firearm);
}

/* ---------------------------------------------------------------- Conditions Handling */

export const INVENTOR_CONDITIONS = Object.freeze({
  BLINDED: "blinded",
  BLEEDING: "bleeding",
  DAZED: "dazed",
  NERVOUS_IMPAIRMENT: "nervous-impairment",
  BURNING: "burning",
  PRONE: "prone"
});

export async function applyConditionToActor(targetActor, condition, active = true) {
  if (!targetActor) return null;
  const condRaw = String(condition).toLowerCase();
  const condKey = condRaw.startsWith("ak5e-") ? condRaw.slice(5) : condRaw;

  const isAk5eCustom = ["bleeding", "burning", "corroded", "dazed", "frozen", "necrotised", "nervous-impairment", "silenced"].includes(condKey);
  const statusId = isAk5eCustom ? `ak5e-${condKey}` : condKey;

  const immunities = targetActor.system?.traits?.ci?.value ?? targetActor.system?.attributes?.conditionImmunities;
  if (immunities) {
    const immArray = immunities instanceof Set ? Array.from(immunities) : (Array.isArray(immunities) ? immunities : []);
    const immLower = immArray.map(i => String(i).toLowerCase());
    if (immLower.includes(condKey) || immLower.includes(statusId)) {
      return { applied: false, immune: true, condition: condKey };
    }
  }

  // Living check for bleeding (constructs and undead don't bleed per Ch. 1 L226)
  if (condKey === "bleeding") {
    const typeStr = String(targetActor.system?.details?.type?.value ?? targetActor.system?.details?.type ?? "").toLowerCase();
    if (typeStr.includes("construct") || typeStr.includes("undead")) {
      return { applied: false, immune: true, reason: "Constructs and undead cannot bleed.", condition: condKey };
    }
  }

  if (typeof targetActor.toggleStatusEffect === "function") {
    try {
      await targetActor.toggleStatusEffect(statusId, { active });
    } catch {
      try {
        await targetActor.toggleStatusEffect(condKey, { active });
      } catch {}
    }
  }

  if (targetActor.statuses instanceof Set) {
    if (active) {
      targetActor.statuses.add(statusId);
      targetActor.statuses.add(condKey);
    } else {
      targetActor.statuses.delete(statusId);
      targetActor.statuses.delete(condKey);
    }
  }

  if (targetActor.flags) {
    targetActor.flags.ak5e ??= {};
    targetActor.flags.ak5e.conditions ??= {};
    targetActor.flags.ak5e.conditions[condKey] = Boolean(active);
  }

  return { applied: true, active: Boolean(active), condition: condKey, statusId };
}

/* ---------------------------------------------------------------- Modification Formulas & Saves */

export function getModificationDamageFormula(modificationId, level = 1) {
  const modId = typeof modificationId === "object" ? modificationId.id : modificationId;
  const lvl = Math.max(1, Number(level) || 1);
  if (modId === "laser-cutter" || modId === "arts-cannon") {
    const dice = lvl >= 14 ? 5 : lvl >= 7 ? 4 : 3;
    return `${dice}d8`;
  }
  if (modId === "flame-gout") {
    const dice = lvl >= 14 ? 3 : lvl >= 7 ? 2 : 1;
    return `${dice}d8`;
  }
  if (modId === "collapsible-weapon-melee" || modId === "collapsible-weapon-ranged") {
    return "1d4";
  }
  return null;
}

export function getModificationSaveInfo(modificationId, actor = null, options = {}) {
  const modId = typeof modificationId === "object" ? modificationId.id : modificationId;
  const dc = options.dc ?? (actor ? calculateInventorDC(actor) : null);
  switch (modId) {
    case "boom-module":
      return { ability: "str", dc, condition: "prone", knockback: 20 };
    case "laser-cutter":
      return { ability: "dex", dc, halfOnSave: true };
    case "rotary-blade":
      return { ability: "dex", dc, condition: "bleeding" };
    case "shock-engine":
      return { ability: "dex", dc, condition: "dazed", duration: "endOfNextTurn" };
    case "arts-cannon":
      return { ability: "dex", dc, halfOnSave: true, range: 60, radius: 10 };
    case "explosive-shots":
      return { ability: "dex", dc, halfOnSave: true, area: 10 };
    case "electrobolts":
      return { ability: "con", dc, condition: "nervous-impairment", duration: "startOfNextTurn" };
    case "flame-gout":
      return { ability: "dex", dc, halfOnSave: true, condition: "burning", area: 15 };
    default:
      return null;
  }
}

export function validateModificationCompatibility(item, modificationId) {
  if (!item) return { compatible: false, reason: "No item provided." };
  if (!isModifiableEquipment(item)) {
    return { compatible: false, reason: "Item must be a weapon or piece of armor." };
  }
  if (isMagicalEquipment(item)) {
    return { compatible: false, reason: "Cannot apply modifications to magical equipment." };
  }
  const mod = getModification(modificationId);
  if (!mod) return { compatible: false, reason: `Unknown modification "${modificationId}".` };

  if (mod.category === MODIFICATION_CATEGORIES.MELEE) {
    if (!isWeapon(item)) return { compatible: false, reason: `Modification "${mod.name}" can only be applied to a Weapon.` };
    if (isRangedWeapon(item)) return { compatible: false, reason: `Modification "${mod.name}" can only be applied to a Melee Weapon.` };
    if (mod.id === "boom-module") {
      const hasDamage = item.system?.damage?.parts?.length || item.system?.damage?.base?.types;
      if (hasDamage && !weaponDealsDamageType(item, "bludgeoning") && !item.flags?.ak5e?.allowAnyDamageType) {
        return { compatible: false, reason: `Modification "${mod.name}" requires a weapon that deals Bludgeoning Damage.` };
      }
    }
    if (mod.id === "rotary-blade") {
      const hasDamage = item.system?.damage?.parts?.length || item.system?.damage?.base?.types;
      if (hasDamage && !weaponDealsDamageType(item, "slashing") && !weaponDealsDamageType(item, "piercing") && !item.flags?.ak5e?.allowAnyDamageType) {
        return { compatible: false, reason: `Modification "${mod.name}" requires a weapon that deals Slashing or Piercing Damage.` };
      }
    }
  }

  if (mod.category === MODIFICATION_CATEGORIES.RANGED) {
    if (!isWeapon(item)) return { compatible: false, reason: `Modification "${mod.name}" can only be applied to a Weapon.` };
    if (isMeleeWeapon(item) && !isRangedWeapon(item)) return { compatible: false, reason: `Modification "${mod.name}" can only be applied to a Ranged Weapon.` };
    if ((mod.id === "arts-cannon" || mod.id === "flame-gout") && !isTwoHandedWeapon(item)) {
      return { compatible: false, reason: `Modification "${mod.name}" requires a Ranged Weapon with the Two-Handed Property.` };
    }
    if (mod.id === "electrobolts" && (hasWeaponProperty(item, "splash") || hasWeaponProperty(item, "firearm"))) {
      return { compatible: false, reason: `Modification "${mod.name}" requires a Ranged Weapon that does not have Splash or Firearm properties.` };
    }
    if (mod.id === "safety-removal" && !hasWeaponProperty(item, "firearm")) {
      return { compatible: false, reason: `Modification "${mod.name}" requires a Ranged Weapon with the Firearm Property.` };
    }
    if ((mod.id === "explosive-shots" || mod.id === "homing-shots") && (!isLightWeapon(item) && !isHeavyWeapon(item))) {
      return { compatible: false, reason: `Modification "${mod.name}" requires a Light or Heavy Ranged Weapon.` };
    }
  }

  if (mod.category === MODIFICATION_CATEGORIES.ARMOR) {
    if (!isArmor(item)) return { compatible: false, reason: `Modification "${mod.name}" can only be applied to Armor.` };
    const armorType = getArmorType(item);
    if (mod.id === "artsfield-generator" && !["medium", "heavy"].includes(armorType)) {
      return { compatible: false, reason: `Modification "${mod.name}" requires Medium or Heavy Armor.` };
    }
    if (["camouflage-cloak", "wingsuit"].includes(mod.id) && !["light", "clothing"].includes(armorType)) {
      return { compatible: false, reason: `Modification "${mod.name}" requires Light Armor or Clothing.` };
    }
  }

  return { compatible: true, modification: mod };
}

/* ---------------------------------------------------------------- Modification Activation Execution */

export async function executeModificationActivation(item, modificationId, actor = null, options = {}) {
  need(item, "Item is required for modification activation.");
  need(modificationId, "Modification ID is required.");

  const modKey = typeof modificationId === "object" ? modificationId.id : modificationId;
  const mod = getModification(modKey);
  need(mod, `Unknown modification "${modKey}".`);

  const activatingActor = actor ?? item.actor ?? item.parent ?? options.actor ?? null;

  // 1. Verification: installed on item
  const installedMods = getItemModifications(item);
  const isInstalled = installedMods.some(m => m.id === mod.id);
  if (options.requireInstalled && !isInstalled && !options.force) {
    throw new Error(`Modification "${mod.name}" is not installed on this equipment.`);
  }

  // 2. Verification: broken equipment blocks usage
  if (isBrokenEquipment(item) && !options.force && !options.ignoreBroken) {
    throw new Error(`Cannot activate modification on broken equipment: "${item.name ?? "Equipment"}" is broken and must be repaired.`);
  }

  // 3. Activation Requirements checks
  if (mod.id === "life-support") {
    const curHP = options.currentHP ?? activatingActor?.system?.attributes?.hp?.value;
    const maxHP = options.maxHP ?? activatingActor?.system?.attributes?.hp?.max;
    if (curHP !== undefined && maxHP !== undefined && curHP >= Math.ceil(maxHP / 2) && !options.force) {
      throw new Error(`Cannot activate "Life Support": wearer must be below half maximum Hit Points (current HP: ${curHP}, max: ${maxHP}).`);
    }
  }

  if (mod.id === "adrenal-overloader") {
    const srUsed = activatingActor?.flags?.ak5e?.inventor?.adrenalOverloaderUsedSR;
    const turnUsed = activatingActor?.flags?.ak5e?.inventor?.adrenalOverloaderUsedTurn;
    if ((srUsed || turnUsed) && !options.force) {
      throw new Error(`Cannot activate "Adrenal Overloader": already activated (1/Short Rest, 1/turn limit).`);
    }
  }

  // 4. Instability & Breakdown Evaluation
  const instability = calculateInstability(item, activatingActor, options);
  let breakdownResult = null;

  const diceProvided = options.rollResults ?? options.breakdownDice ?? options.dice;
  if (!options.skipBreakdown && (diceProvided || options.autoRollBreakdown)) {
    const dice = diceProvided ?? [1, 2, 3];
    breakdownResult = evaluateBreakdownRoll(dice, instability, mod, {
      currentHP: options.currentHP ?? activatingActor?.system?.attributes?.hp?.value,
      damage: options.breakdownDamage ?? options.damage,
      item,
      ...options
    });

    if (breakdownResult?.isBreakdown) {
      if (activatingActor?.system?.attributes?.hp && Number.isFinite(breakdownResult.actualHPLoss) && breakdownResult.actualHPLoss > 0) {
        const curHP = Number(activatingActor.system.attributes.hp.value ?? 0);
        const newHP = Math.max(1, curHP - breakdownResult.actualHPLoss);
        if (typeof activatingActor.update === "function") {
          await activatingActor.update({ "system.attributes.hp.value": newHP });
        } else {
          activatingActor.system.attributes.hp.value = newHP;
        }
      }

      if (mod.isDangerous) {
        if (typeof item.setFlag === "function") {
          await item.setFlag("ak5e", "isBroken", true);
          await item.setFlag("ak5e", "inventor.isBroken", true);
        } else if (typeof item.update === "function") {
          await item.update({
            "flags.ak5e.isBroken": true,
            "flags.ak5e.inventor.isBroken": true
          });
        } else {
          item.flags ??= {};
          item.flags.ak5e ??= {};
          item.flags.ak5e.isBroken = true;
          item.flags.ak5e.inventor ??= {};
          item.flags.ak5e.inventor.isBroken = true;
        }
      }
    }
  }

  // 4b. Track that activatingActor activated this modification this turn
  const installedMod = installedMods.find(m => m.id === mod.id);
  const inventorId = options.inventorId ?? options.inventor?.id ??
                     installedMod?.inventorId ??
                     item.getFlag?.("ak5e", "inventor")?.creatorId ??
                     item.flags?.ak5e?.inventor?.creatorId ??
                     (isInventor(activatingActor) ? activatingActor.id : null);
  const inventorUuid = options.inventorUuid ?? options.inventor?.uuid ??
                       installedMod?.inventorUuid ??
                       item.getFlag?.("ak5e", "inventor")?.creatorUuid ??
                       item.flags?.ak5e?.inventor?.creatorUuid ??
                       (isInventor(activatingActor) ? activatingActor.uuid : null);

  if (activatingActor) {
    activatingActor.flags ??= {};
    activatingActor.flags.ak5e ??= {};
    activatingActor.flags.ak5e.inventor ??= {};
    activatingActor.flags.ak5e.inventor.activatedModsThisTurn ??= [];
    activatingActor.flags.ak5e.inventor.activatedModsThisTurn.push({
      modId: mod.id,
      inventorId,
      inventorUuid,
      itemUuid: item.uuid ?? item.id ?? null,
      timestamp: Date.now()
    });
  }

  // 5. Inventor DC calculation
  const targetDC = Number(options.saveDC ?? calculateInventorDC(activatingActor, options));
  const dc = targetDC;

  // 6. Save & Target Processing
  const saveInfo = getModificationSaveInfo(mod.id, activatingActor, { dc: targetDC, ...options });

  let generalSavePassed = false;
  if (options.saveResult !== undefined || options.saveRoll !== undefined) {
    const rollVal = Number(options.saveResult ?? options.saveRoll);
    generalSavePassed = rollVal >= targetDC;
  } else if (options.saveSuccess !== undefined) {
    generalSavePassed = Boolean(options.saveSuccess);
  }

  const rawTargets = options.targets ? (Array.isArray(options.targets) ? options.targets : [options.targets]) :
                     (options.target ? [options.target] : []);
  const targetResults = [];
  const appliedConditions = [];
  const activeConditions = [];

  for (const tgt of rawTargets) {
    if (!tgt) continue;
    const tgtId = tgt.id ?? tgt.uuid ?? String(Math.random());
    let savePassed = generalSavePassed;

    if (options.targetSaves && options.targetSaves[tgtId] !== undefined) {
      const entry = options.targetSaves[tgtId];
      savePassed = typeof entry === "object" ? Boolean(entry.success ?? entry.passed) : Boolean(entry);
    } else if (options.saveResults && options.saveResults[tgtId] !== undefined) {
      const entry = options.saveResults[tgtId];
      savePassed = typeof entry === "object" ? Boolean(entry.success ?? entry.passed) : Boolean(entry);
    } else if (options.targetSaveRoll !== undefined && saveInfo?.ability) {
      const modVal = tgt.system?.abilities?.[saveInfo.ability]?.save ?? tgt.system?.abilities?.[saveInfo.ability]?.mod ?? 0;
      const total = Number(options.targetSaveRoll) + modVal;
      savePassed = total >= (saveInfo?.dc ?? targetDC);
    } else if (options.autoPassSaves) {
      savePassed = true;
    } else if (options.autoFailSaves) {
      savePassed = false;
    }

    const tgtResult = {
      target: tgt,
      targetId: tgtId,
      savePassed,
      saveRequired: Boolean(saveInfo?.ability),
      dc: saveInfo?.dc ?? targetDC,
      conditionApplied: null,
      damageTaken: 0
    };

    if (options.damage !== undefined && saveInfo?.halfOnSave) {
      const rawDmg = Number(options.damage);
      tgtResult.damageTaken = savePassed ? Math.floor(rawDmg / 2) : rawDmg;
    }

    if (saveInfo?.condition && !savePassed) {
      const res = await applyConditionToActor(tgt, saveInfo.condition, true);
      tgtResult.conditionApplied = saveInfo.condition;
      appliedConditions.push({ target: tgt, condition: saveInfo.condition, result: res });
      if (!activeConditions.includes(saveInfo.condition)) activeConditions.push(saveInfo.condition);
    }

    if (options.inflictBlinded || options.condition === "blinded") {
      const res = await applyConditionToActor(tgt, "blinded", true);
      tgtResult.blindedApplied = true;
      appliedConditions.push({ target: tgt, condition: "blinded", result: res });
      if (!activeConditions.includes("blinded")) activeConditions.push("blinded");
    }

    targetResults.push(tgtResult);
  }

  // If no targets passed, determine condition and knockback from direct options
  if (rawTargets.length === 0) {
    if (saveInfo?.condition && !generalSavePassed) {
      if (!activeConditions.includes(saveInfo.condition)) activeConditions.push(saveInfo.condition);
    }
  }

  let knockback = 0;
  if (mod.id === "boom-module") {
    knockback = generalSavePassed ? 0 : 20;
    if (!generalSavePassed && !activeConditions.includes("prone")) {
      activeConditions.push("prone");
    }
  }

  // 7. Damage Formula Scaling
  const actorLevel = options.level ?? (activatingActor ? (specialistLevel(activatingActor) || activatingActor.system?.details?.level) : 1) ?? 1;
  const damageFormula = getModificationDamageFormula(mod.id, actorLevel);

  // 8. State Mutations
  const stateChanges = {};

  if (["collapsible-weapon-melee", "collapsible-weapon-ranged"].includes(mod.id)) {
    const isCurrentlyFolded = Boolean(
      item.getFlag?.("ak5e", "inventor")?.isFolded ??
      item.flags?.ak5e?.inventor?.isFolded ??
      false
    );
    const newFolded = options.fold ?? (options.revert ? false : !isCurrentlyFolded);
    if (typeof item.setFlag === "function") {
      await item.setFlag("ak5e", "inventor.isFolded", newFolded);
    } else {
      item.flags ??= {};
      item.flags.ak5e ??= {};
      item.flags.ak5e.inventor ??= {};
      item.flags.ak5e.inventor.isFolded = newFolded;
    }
    stateChanges.isFolded = newFolded;
    stateChanges.improvised = newFolded;
    stateChanges.damageFormula = newFolded ? "1d4" : null;
  }

  if (mod.id === "trick-weapon") {
    const targetType = options.targetWeaponType ??
                       item.getFlag?.("ak5e", "inventor")?.trickWeaponTarget ??
                       item.flags?.ak5e?.inventor?.trickWeaponTarget ??
                       "greatsword";
    if (typeof item.setFlag === "function") {
      await item.setFlag("ak5e", "inventor.transformedWeapon", targetType);
      await item.setFlag("ak5e", "inventor.isTransformed", true);
    } else {
      item.flags ??= {};
      item.flags.ak5e ??= {};
      item.flags.ak5e.inventor ??= {};
      item.flags.ak5e.inventor.transformedWeapon = targetType;
      item.flags.ak5e.inventor.isTransformed = true;
    }
    stateChanges.isTransformed = true;
    stateChanges.transformedWeapon = targetType;
    stateChanges.duration = "1min";
    stateChanges.proficient = true;
  }

  if (mod.id === "adrenal-overloader" && activatingActor) {
    if (typeof activatingActor.setFlag === "function") {
      await activatingActor.setFlag("ak5e", "inventor.adrenalOverloaderUsedSR", true);
      await activatingActor.setFlag("ak5e", "inventor.adrenalOverloaderUsedTurn", true);
    } else {
      activatingActor.flags ??= {};
      activatingActor.flags.ak5e ??= {};
      activatingActor.flags.ak5e.inventor ??= {};
      activatingActor.flags.ak5e.inventor.adrenalOverloaderUsedSR = true;
      activatingActor.flags.ak5e.inventor.adrenalOverloaderUsedTurn = true;
    }
    stateChanges.additionalActions = 1;
  }

  if (mod.id === "melee-attachment") {
    const dexMod = activatingActor?.system?.abilities?.dex?.mod ?? 0;
    const pb = activatingActor?.system?.attributes?.prof ?? 2;
    const usePB = options.reading === "addPB" || options.usePB;
    stateChanges.meleeAttacksAllowed = true;
    stateChanges.useDexModifier = true;
    stateChanges.damageFormula = usePB ? `1d8 + ${dexMod} + ${pb}` : `1d8 + ${dexMod}`;
    stateChanges.damageType = "piercing";
    stateChanges.duration = "endOfTurn";
  }

  if (mod.id === "telescopic-weapon") {
    const alreadyReach = hasWeaponProperty(item, "reach") || hasWeaponProperty(item, "rch") ||
                         Boolean(item.system?.properties?.has?.("reach")) ||
                         Boolean(item.system?.properties?.has?.("rch")) ||
                         (Array.isArray(item.system?.properties) && (item.system.properties.includes("reach") || item.system.properties.includes("rch"))) ||
                         Boolean(item.system?.properties?.rch);
    stateChanges.reach = alreadyReach ? 15 : 10;
    stateChanges.extendedReach = true;
    stateChanges.duration = "endOfTurn";
  }

  if (mod.id === "returner") {
    stateChanges.returning = true;
    stateChanges.recallAvailable = true;
    stateChanges.duration = "endOfTurn";
  }

  if (mod.id === "burning-edge") {
    stateChanges.damageConverted = "fire";
    stateChanges.duration = "endOfTurn";
  }

  if (mod.id === "safety-removal") {
    stateChanges.additionalAttacks = 1;
    stateChanges.disadvantageAllAttacks = true;
    stateChanges.duration = "attackAction";
  }

  if (mod.id === "exoskeleton") {
    stateChanges.sizeBonus = 1;
    stateChanges.doubleJump = true;
    stateChanges.athleticsAdvantage = true;
    stateChanges.unhinderedCarrying = true;
    stateChanges.duration = "startOfNextTurn";
  }

  if (mod.id === "camouflage-cloak") {
    stateChanges.stealthAdvantage = true;
    stateChanges.perceptionDisadvantage = true;
    stateChanges.duration = "1min";
  }

  if (mod.id === "jetboots") {
    stateChanges.dashAction = true;
    stateChanges.straightLineOnly = true;
  }

  if (mod.id === "wingsuit") {
    stateChanges.flyingSpeed = 30;
    stateChanges.cannotAscend = true;
    stateChanges.minimumDescendFeetPerTurn = 10;
    stateChanges.duration = "untilLanding";
  }

  if (mod.id === "refocuser") {
    stateChanges.rerollConcentrationSaveWithAdvantage = true;
  }

  if (mod.id === "shock-absorbers") {
    const intMod = Number(activatingActor?.system?.abilities?.int?.mod ?? 0);
    stateChanges.saveBonus = intMod;
  }

  if (mod.id === "artsfield-generator") {
    stateChanges.grantResistance = true;
    stateChanges.damageType = options.damageType ?? "chosen";
  }

  if (mod.id === "explosive-shots") {
    const atkDmg = Number(options.attackDamage ?? options.damage ?? 0);
    stateChanges.rollDamageEvenOnMiss = true;
    stateChanges.splashDamage = Math.floor(atkDmg / 2);
    stateChanges.splashRadius = 10;
    stateChanges.damageType = "thunder";
  }

  if (mod.id === "homing-shots") {
    stateChanges.rerollMissedAttack = true;
    stateChanges.mustUseNewResult = true;
    stateChanges.cannotRerollAgain = true;
  }

  if (mod.id === "flexible-weapon") {
    stateChanges.ignoreShieldAC = true;
    stateChanges.repeatAttackBonusAction = true;
    stateChanges.repeatAttackRangeFeet = 10;
  }

  if (mod.id === "boom-module") {
    stateChanges.extraDamageDice = "1 die";
    stateChanges.extraDamageType = "thunder";
    stateChanges.knockbackFeet = 20;
    stateChanges.proneOnFailedSave = true;
  }

  if (mod.id === "rotary-blade") {
    stateChanges.extraDamageDice = "1 die";
    stateChanges.extraDamageType = "slashing";
    stateChanges.bleedingOnFailedSave = true;
  }

  if (mod.id === "shock-engine") {
    stateChanges.damageConverted = "lightning";
    stateChanges.dazedOnFailedSave = true;
    stateChanges.dazedDuration = "endOfNextTurn";
  }

  if (mod.id === "electrobolts") {
    stateChanges.damageConverted = "lightning";
    stateChanges.nervousImpairmentOnFailedSave = true;
    stateChanges.nervousImpairmentDuration = "startOfNextTurn";
  }

  if (mod.id === "powered-gauntlet") {
    stateChanges.extraDamageDice = "1 die";
    stateChanges.extraDamageType = "lightning";
  }

  if (mod.id === "laser-cutter") {
    stateChanges.area = { type: "cone", sizeFeet: 15 };
    stateChanges.damageFormula = damageFormula;
    stateChanges.damageType = "radiant";
    stateChanges.halfOnSave = true;
  }

  if (mod.id === "arts-cannon") {
    stateChanges.area = { type: "sphere", radiusFeet: 10, rangeFeet: 60 };
    stateChanges.damageFormula = damageFormula;
    stateChanges.damageType = "force";
    stateChanges.halfOnSave = true;
  }

  if (mod.id === "flame-gout") {
    stateChanges.area = { type: "cone", sizeFeet: 15 };
    stateChanges.damageFormula = damageFormula;
    stateChanges.damageType = "fire";
    stateChanges.halfOnSave = true;
    stateChanges.burningOnFailedSave = true;
  }

  let healedHP = null;
  if (mod.id === "life-support" && activatingActor) {
    const conMod = Number(activatingActor.system?.abilities?.con?.mod ?? 0);
    const hitDieRoll = Number(options.hitDieRoll ?? options.roll ?? 5);
    healedHP = Math.max(1, hitDieRoll + conMod);
    if (activatingActor.system?.attributes?.hp) {
      const curHP = Number(activatingActor.system.attributes.hp.value ?? 0);
      const maxHP = Number(activatingActor.system.attributes.hp.max ?? 0);
      const newHP = maxHP > 0 ? Math.min(maxHP, curHP + healedHP) : curHP + healedHP;
      if (typeof activatingActor.update === "function") {
        await activatingActor.update({ "system.attributes.hp.value": newHP });
      } else {
        activatingActor.system.attributes.hp.value = newHP;
      }
    }
    stateChanges.healedHP = healedHP;
  }

  const summary = `${mod.name} activated on ${item.name ?? "equipment"}. Instability: ${instability}.` +
    (breakdownResult?.isBreakdown ? ` Breakdown triggered! (${breakdownResult.hpLossFormula} HP loss)` : "") +
    (breakdownResult?.equipmentBroken ? ` [DANGEROUS: Equipment Damaged & Broken!]` : "");

  return {
    success: true,
    modification: mod,
    modificationId: mod.id,
    isDangerous: Boolean(mod.isDangerous),
    actor: activatingActor,
    item,
    instability,
    breakdown: breakdownResult,
    isBreakdown: Boolean(breakdownResult?.isBreakdown),
    equipmentBroken: Boolean(breakdownResult?.equipmentBroken || isBrokenEquipment(item)),
    inventorDC: dc,
    dc,
    saveDC: targetDC,
    saveInfo,
    saved: generalSavePassed,
    savePassed: generalSavePassed,
    damageFormula,
    damageType: mod.damageType,
    targetResults,
    appliedConditions,
    conditions: activeConditions,
    knockback,
    prone: activeConditions.includes("prone"),
    bleeding: activeConditions.includes("bleeding"),
    dazed: activeConditions.includes("dazed"),
    nervousImpairment: activeConditions.includes("nervous-impairment"),
    burning: activeConditions.includes("burning"),
    blinded: activeConditions.includes("blinded"),
    healed: healedHP,
    stateChanges,
    summary
  };
}

/* ---------------------------------------------------------------- Actor & Global Helpers */

export function getGameActors() {
  const actors = globalThis.game?.actors;
  if (!actors) return [];
  if (Array.isArray(actors)) return actors;
  if (Array.isArray(actors.contents)) return actors.contents;
  if (typeof actors.values === "function") return Array.from(actors.values());
  if (typeof actors[Symbol.iterator] === "function") {
    const list = Array.from(actors);
    if (list.length > 0 && Array.isArray(list[0]) && list[0].length === 2 && typeof list[0][1] === "object") {
      return list.map(entry => entry[1]);
    }
    return list;
  }
  return [];
}

function evaluateSave(target, ability, dc, options = {}) {
  const tid = target?.id ?? target?.uuid;
  if (options.targetRolls && tid && options.targetRolls[tid] !== undefined) {
    const entry = options.targetRolls[tid];
    if (typeof entry === "object") {
      if (entry.savePassed !== undefined) return Boolean(entry.savePassed);
      if (entry.success !== undefined) return Boolean(entry.success);
      if (entry.passed !== undefined) return Boolean(entry.passed);
      if (entry.d20 !== undefined) {
        const modVal = target?.system?.abilities?.[ability]?.save ?? target?.system?.abilities?.[ability]?.mod ?? 0;
        return (Number(entry.d20) + modVal) >= dc;
      }
    }
    return Boolean(entry);
  }
  if (options.targetSaves && tid && options.targetSaves[tid] !== undefined) {
    const entry = options.targetSaves[tid];
    return typeof entry === "object" ? Boolean(entry.success ?? entry.passed) : Boolean(entry);
  }
  if (options.saveResults && tid && options.saveResults[tid] !== undefined) {
    const entry = options.saveResults[tid];
    return typeof entry === "object" ? Boolean(entry.success ?? entry.passed) : Boolean(entry);
  }
  if (options.savePassed !== undefined) return Boolean(options.savePassed);
  if (options.saveSuccess !== undefined) return Boolean(options.saveSuccess);
  if (options.autoPassSaves) return true;
  if (options.autoFailSaves) return false;
  if (options.targetSaveRoll !== undefined) {
    const modVal = target?.system?.abilities?.[ability]?.save ?? target?.system?.abilities?.[ability]?.mod ?? 0;
    return (Number(options.targetSaveRoll) + modVal) >= dc;
  }
  if (options.saveResult !== undefined || options.saveRoll !== undefined) {
    return Number(options.saveResult ?? options.saveRoll) >= dc;
  }
  return false;
}

/* ---------------------------------------------------------------- Strange & Stranger Contraptions (Lv 5 & 15) */

export const CONTRAPTIONS_CATALOG = Object.freeze({
  "flashlight": Object.freeze({
    id: "flashlight",
    aliases: Object.freeze(["12-million-lumen-flashlight", "12 Million Lumen Flashlight"]),
    name: "12 Million Lumen Flashlight",
    actionCost: "action",
    rangeFeet: 30,
    area: Object.freeze({ type: "radius", radiusFeet: 15 }),
    saveAbility: "dex",
    saveDcType: "inventor",
    conditionOnFail: "blinded",
    conditionDuration: "endOfNextTurn",
    strangerSaveCondition: "dazed",
    strangerSaveConditionDuration: "endOfNextTurn",
    summary: "Throw 30 ft -> 15 ft radius DEX save vs Inventor DC or Blinded until end of next turn. Stranger Lv 15: pass -> Dazed until end of next turn."
  }),
  "fun-toy": Object.freeze({
    id: "fun-toy",
    aliases: Object.freeze(["Fun Toy", "mobile-camera", "Mobile Camera"]),
    name: "Fun Toy",
    actionCost: "action",
    rangeFeet: 30,
    durationMinutes: 10,
    constructData: Object.freeze({
      name: "Mobile Camera",
      type: "construct",
      size: "tiny",
      ac: 18,
      hp: 10,
      maxHp: 10,
      speed: 20,
      walkSpeed: 20,
      darkvision: 60,
      duration: "10min",
      durationMinutes: 10
    }),
    strangerInvisible: true,
    summary: "Throw 30 ft -> Tiny Construct Mobile Camera (18 AC, 10 HP, 20 ft move, 60 ft Darkvision, 10 min). Stranger Lv 15: Mobile Camera has Invisible condition."
  }),
  "musbeast-remover": Object.freeze({
    id: "musbeast-remover",
    aliases: Object.freeze(["Musbeast Remover"]),
    name: "Musbeast Remover",
    actionCost: "action",
    rangeFeet: 30,
    area: Object.freeze({ type: "sphere", radiusFeet: 10 }),
    durationRounds: 2,
    saveAbility: "dex",
    saveDcType: "inventor",
    halfOnSave: true,
    damageFormula: "4d8",
    damageType: "piercing",
    requiresNoFullCover: true,
    triggersOnEnter: true,
    strangerConditionOnFail: "bleeding",
    summary: "Throw 30 ft -> 10 ft radius Sphere for 2 rounds. DEX save or 4d8 Piercing (half on save). Full cover immune. Stranger Lv 15: fail also suffers Bleeding."
  }),
  "needlefly-fumigator": Object.freeze({
    id: "needlefly-fumigator",
    aliases: Object.freeze(["Needlefly Fumigator"]),
    name: "Needlefly Fumigator",
    actionCost: "action",
    rangeFeet: 30,
    area: Object.freeze({ type: "sphere", radiusFeet: 20 }),
    duration: "1min",
    spreadsAroundCorners: true,
    saveAbility: "con",
    saveDcType: "inventor",
    halfOnSave: true,
    damageFormula: "2d8",
    damageType: "poison",
    conditionOnFail: "poisoned",
    conditionDuration: "startOfNextTurn",
    triggersOnEnterOrStartTurn: true,
    strangerAllyImmunity: true,
    summary: "Throw 30 ft -> 20 ft radius Sphere for 1 min (spreads around corners). CON save or 2d8 Poison + Poisoned (half on save). Stranger Lv 15: nominated creatures immune until end of next turn."
  }),
  "over-tuned-speaker": Object.freeze({
    id: "over-tuned-speaker",
    aliases: Object.freeze(["Over-tuned Speaker", "overtuned-speaker"]),
    name: "Over-tuned Speaker",
    actionCost: "action",
    rangeFeet: 30,
    audibleRangeFeet: 100,
    duration: "1min",
    strangerControls: Object.freeze({ directional: true, volume: true }),
    summary: "Throw 30 ft -> sound of choice heard up to 100 ft away for 1 min. Stranger Lv 15: directional & volume control."
  }),
  "portable-firestarter": Object.freeze({
    id: "portable-firestarter",
    aliases: Object.freeze(["Portable Firestarter"]),
    name: "Portable Firestarter",
    actionCost: "action",
    rangeFeet: 30,
    area: Object.freeze({ type: "radius", radiusFeet: 10 }),
    saveAbility: "dex",
    saveDcType: "inventor",
    halfOnSave: true,
    damageFormula: "2d8",
    damageType: "fire",
    conditionOnFail: "burning",
    objectsIgnited: true,
    strangerBonusBurningDamage: "intBonus",
    summary: "Throw 30 ft -> 10 ft radius DEX save or 2d8 Fire + Burning (half on save, no burn). Unworn/carried objects burn. Stranger Lv 15: +INT modifier to ongoing burning damage."
  }),
  "universal-keycard": Object.freeze({
    id: "universal-keycard",
    aliases: Object.freeze(["Universal Keycard"]),
    name: "Universal Keycard",
    actionCost: "action",
    rangeFeet: 30,
    targetObjectRadiusFeet: 5,
    unlocksElectronic: true,
    leavesTrace: true,
    strangerLeavesTrace: false,
    summary: "Throw 30 ft -> 5 ft electronic lock/restriction removed, leaves trace. Stranger Lv 15: traceless."
  }),
  "unstable-contraption": Object.freeze({
    id: "unstable-contraption",
    aliases: Object.freeze(["Unstable Contraption"]),
    name: "Unstable Contraption",
    actionCost: "action",
    rangeFeet: 30,
    area: Object.freeze({ type: "radius", radiusFeet: 10 }),
    saveAbility: "dex",
    saveDcType: "inventor",
    halfOnSave: true,
    damageFormula: "5d8",
    strangerDamageFormula: "8d8",
    damageType: "thunder",
    summary: "Throw 30 ft -> 10 ft radius DEX save or 5d8 Thunder (half on save). Stranger Lv 15: 8d8 Thunder."
  })
});

export function getContraption(id) {
  if (!id) return null;
  if (typeof id === "object" && id.id) return CONTRAPTIONS_CATALOG[id.id] ?? id;
  const raw = String(id).toLowerCase().trim();
  if (CONTRAPTIONS_CATALOG[raw]) return CONTRAPTIONS_CATALOG[raw];
  for (const c of Object.values(CONTRAPTIONS_CATALOG)) {
    if (c.id === raw || c.name.toLowerCase() === raw) return c;
    if (c.aliases?.some(a => a.toLowerCase() === raw)) return c;
  }
  const slug = raw.replace(/\s+/g, "-");
  if (CONTRAPTIONS_CATALOG[slug]) return CONTRAPTIONS_CATALOG[slug];
  for (const c of Object.values(CONTRAPTIONS_CATALOG)) {
    if (c.id === slug || c.aliases?.some(a => a.toLowerCase().replace(/\s+/g, "-") === slug)) return c;
  }
  return null;
}

export function getAvailableContraptions(actor, options = {}) {
  if (!actor) return [];
  if (!hasStrangeContraption(actor) && !options.force) return [];

  const used = actor.getFlag?.("ak5e", "inventor")?.usedContraptions ??
               actor.flags?.ak5e?.inventor?.usedContraptions ?? [];
  const isStranger = Boolean(
    hasStrangerContraptions(actor) ||
    options.isStranger ||
    (specialistLevel(actor) >= 15)
  );

  const allContraptions = Object.values(CONTRAPTIONS_CATALOG);
  if (options.includeUsed || options.all) {
    return allContraptions.map(c => ({
      ...c,
      isStranger,
      used: used.includes(c.id),
      available: !used.includes(c.id)
    }));
  }

  return allContraptions
    .filter(c => !used.includes(c.id))
    .map(c => ({ ...c, isStranger, available: true, used: false }));
}

export async function resetContraptions(actor) {
  if (!actor) return;
  if (typeof actor.setFlag === "function") {
    await actor.setFlag("ak5e", "inventor.usedContraptions", []);
  } else if (typeof actor.update === "function") {
    await actor.update({ "flags.ak5e.inventor.usedContraptions": [] });
  } else {
    actor.flags ??= {};
    actor.flags.ak5e ??= {};
    actor.flags.ak5e.inventor ??= {};
    actor.flags.ak5e.inventor.usedContraptions = [];
  }
}

export async function executeContraption(contraptionId, actor, options = {}) {
  need(contraptionId, "Contraption ID is required.");
  need(actor, "Actor is required for executeContraption.");

  if (!hasStrangeContraption(actor) && !options.force) {
    throw new Error("Actor does not have Strange Contraption feature (requires 5th level Inventor).");
  }

  const contraption = getContraption(contraptionId);
  need(contraption, `Unknown Strange Contraption "${contraptionId}".`);

  // 1/Long Rest check per contraption option
  const used = actor.getFlag?.("ak5e", "inventor")?.usedContraptions ??
               actor.flags?.ak5e?.inventor?.usedContraptions ?? [];
  let warning = null;
  const alreadyUsed = used.includes(contraption.id);
  if (alreadyUsed && !options.force && !options.skipUsage) {
    warning = "alreadyUsed";
    if (options.strictLockout) {
      throw new Error(`Strange Contraption "${contraption.name}" has already been used since the last Long Rest.`);
    }
  }

  // Record 1/Long Rest usage
  if (!options.skipUsage && !alreadyUsed) {
    const updatedUsed = [...used, contraption.id];
    if (typeof actor.setFlag === "function") {
      await actor.setFlag("ak5e", "inventor.usedContraptions", updatedUsed);
    } else if (typeof actor.update === "function") {
      await actor.update({ "flags.ak5e.inventor.usedContraptions": updatedUsed });
    } else {
      actor.flags ??= {};
      actor.flags.ak5e ??= {};
      actor.flags.ak5e.inventor ??= {};
      actor.flags.ak5e.inventor.usedContraptions = updatedUsed;
    }
  }

  const isStranger = Boolean(
    hasStrangerContraptions(actor) ||
    options.isStranger ||
    (specialistLevel(actor) >= 15)
  );

  const dc = Number(options.saveDC ?? calculateInventorDC(actor, options));
  const intMod = Number(actor.system?.abilities?.int?.mod ?? 0);

  // Range warning / check: 30 ft throw
  if (options.distance !== undefined && Number(options.distance) > 30 && !options.force && options.strictRange) {
    throw new Error(`Target location (${options.distance} ft) exceeds 30 ft throw range.`);
  }

  const rawTargets = options.targets ? (Array.isArray(options.targets) ? options.targets : [options.targets]) :
                     (options.target ? [options.target] : []);

  const targetResults = [];
  const appliedConditions = [];
  let constructData = null;
  let damageFormula = contraption.damageFormula ?? null;

  if (contraption.id === "flashlight") {
    for (const tgt of rawTargets) {
      if (!tgt) continue;
      const tgtId = tgt.id ?? tgt.uuid ?? String(Math.random());
      const savePassed = evaluateSave(tgt, "dex", dc, options);
      let cond = null;

      if (!savePassed) {
        cond = "blinded";
        const res = await applyConditionToActor(tgt, "blinded", true);
        appliedConditions.push({ target: tgt, condition: "blinded", result: res });
      } else if (isStranger) {
        cond = "dazed";
        const res = await applyConditionToActor(tgt, "dazed", true);
        appliedConditions.push({ target: tgt, condition: "dazed", result: res });
      }

      targetResults.push({
        target: tgt,
        targetId: tgtId,
        savePassed,
        blinded: cond === "blinded",
        dazed: cond === "dazed",
        conditionApplied: cond,
        conditions: cond ? [cond] : [],
        conditionDuration: "endOfNextTurn"
      });
    }
  } else if (contraption.id === "fun-toy") {
    constructData = {
      name: "Mobile Camera",
      type: "construct",
      size: "tiny",
      ac: 18,
      hp: 10,
      maxHp: 10,
      speed: 20,
      walkSpeed: 20,
      darkvision: 60,
      duration: "10min",
      durationMinutes: 10,
      invisible: isStranger,
      conditions: isStranger ? ["invisible"] : [],
      statuses: isStranger ? ["invisible"] : []
    };
  } else if (contraption.id === "musbeast-remover") {
    damageFormula = "4d8";
    for (const tgt of rawTargets) {
      if (!tgt) continue;
      const tgtId = tgt.id ?? tgt.uuid ?? String(Math.random());
      const hasFullCover = Boolean(tgt.hasFullCover ?? tgt.fullCover ?? (options.fullCoverTargets?.includes(tgt) || options.fullCoverTargets?.includes(tgtId)));
      if (hasFullCover) {
        targetResults.push({
          target: tgt,
          targetId: tgtId,
          fullCover: true,
          damage: 0,
          damageTaken: 0,
          conditionApplied: null,
          conditions: []
        });
        continue;
      }

      const savePassed = evaluateSave(tgt, "dex", dc, options);
      const rawDmg = Number(options.damage ?? options.damageRoll ?? 0);
      const damageTaken = savePassed ? Math.floor(rawDmg / 2) : rawDmg;
      let cond = null;

      if (!savePassed && isStranger) {
        cond = "bleeding";
        const res = await applyConditionToActor(tgt, "bleeding", true);
        appliedConditions.push({ target: tgt, condition: "bleeding", result: res });
      }

      targetResults.push({
        target: tgt,
        targetId: tgtId,
        savePassed,
        damage: damageTaken,
        damageTaken,
        damageType: "piercing",
        bleeding: cond === "bleeding",
        conditionApplied: cond,
        conditions: cond ? [cond] : []
      });
    }
  } else if (contraption.id === "needlefly-fumigator") {
    damageFormula = "2d8";
    const immuneList = options.immuneTargets ?? options.immuneCreatures ?? options.allies ?? options.nominatedAllies ?? [];
    const immuneSet = new Set(Array.isArray(immuneList) ? immuneList.map(a => a?.id ?? a?.uuid ?? a?.name ?? a) : []);

    for (const tgt of rawTargets) {
      if (!tgt) continue;
      const tgtId = tgt.id ?? tgt.uuid ?? String(Math.random());
      const isImmune = isStranger && (immuneSet.has(tgtId) || immuneSet.has(tgt) || immuneSet.has(tgt?.name));
      if (isImmune) {
        targetResults.push({
          target: tgt,
          targetId: tgtId,
          name: tgt.name,
          immune: true,
          damage: 0,
          damageTaken: 0,
          poisoned: false,
          conditionApplied: null,
          conditions: []
        });
        continue;
      }

      const savePassed = evaluateSave(tgt, "con", dc, options);
      const rawDmg = Number(options.damage ?? options.damageRoll ?? 0);
      const damageTaken = savePassed ? Math.floor(rawDmg / 2) : rawDmg;
      let cond = null;

      if (!savePassed) {
        cond = "poisoned";
        const res = await applyConditionToActor(tgt, "poisoned", true);
        appliedConditions.push({ target: tgt, condition: "poisoned", result: res });
      }

      targetResults.push({
        target: tgt,
        targetId: tgtId,
        name: tgt.name,
        immune: false,
        savePassed,
        damage: damageTaken,
        damageTaken,
        damageType: "poison",
        poisoned: !savePassed,
        conditionApplied: cond,
        conditions: cond ? [cond] : [],
        conditionDuration: "startOfNextTurn"
      });
    }
  } else if (contraption.id === "over-tuned-speaker") {
    // Sound production
  } else if (contraption.id === "portable-firestarter") {
    damageFormula = "2d8";
    for (const tgt of rawTargets) {
      if (!tgt) continue;
      const tgtId = tgt.id ?? tgt.uuid ?? String(Math.random());
      const savePassed = evaluateSave(tgt, "dex", dc, options);
      const rawDmg = Number(options.damage ?? options.damageRoll ?? 0);
      const damageTaken = savePassed ? Math.floor(rawDmg / 2) : rawDmg;
      let cond = null;

      if (!savePassed) {
        cond = "burning";
        const res = await applyConditionToActor(tgt, "burning", true);
        appliedConditions.push({ target: tgt, condition: "burning", result: res });
      }

      targetResults.push({
        target: tgt,
        targetId: tgtId,
        savePassed,
        damage: damageTaken,
        damageTaken,
        damageType: "fire",
        burning: cond === "burning",
        conditionApplied: cond,
        conditions: cond ? [cond] : [],
        ongoingBurnBonus: (cond && isStranger) ? intMod : 0,
        burningBonusDamage: (cond && isStranger) ? intMod : 0
      });
    }
  } else if (contraption.id === "universal-keycard") {
    // Electronic lock removal
  } else if (contraption.id === "unstable-contraption") {
    damageFormula = isStranger ? "8d8" : "5d8";
    for (const tgt of rawTargets) {
      if (!tgt) continue;
      const tgtId = tgt.id ?? tgt.uuid ?? String(Math.random());
      const savePassed = evaluateSave(tgt, "dex", dc, options);
      const rawDmg = Number(options.damage ?? options.damageRoll ?? 0);
      const damageTaken = savePassed ? Math.floor(rawDmg / 2) : rawDmg;

      targetResults.push({
        target: tgt,
        targetId: tgtId,
        savePassed,
        damage: damageTaken,
        damageTaken,
        damageType: "thunder"
      });
    }
  }

  const allConditions = appliedConditions.map(c => c.condition);
  const blinded = allConditions.includes("blinded");
  const dazed = allConditions.includes("dazed");
  const bleeding = allConditions.includes("bleeding");
  const burning = allConditions.includes("burning");
  const poisoned = allConditions.includes("poisoned");

  const summary = `Strange Contraption [${contraption.name}] executed by ${actor.name ?? "Inventor"}. DC: ${dc}. Stranger: ${isStranger}.`;

  return {
    success: true,
    warning,
    warnings: warning ? [warning] : [],
    contraption,
    contraptionId: contraption.id,
    actor,
    isStranger,
    dc,
    saveDC: dc,
    damageFormula,
    damageType: contraption.damageType ?? null,
    targetResults,
    targets: targetResults,
    appliedConditions,
    conditions: allConditions,
    blinded,
    dazed,
    bleeding,
    burning,
    poisoned,
    construct: constructData,
    leavesTrace: contraption.id === "universal-keycard" ? !isStranger : undefined,
    objectsIgnited: contraption.id === "portable-firestarter" ? true : undefined,
    ongoingBurnBonus: (contraption.id === "portable-firestarter" && isStranger) ? intMod : 0,
    burningBonusDamage: (contraption.id === "portable-firestarter" && isStranger) ? intMod : 0,
    soundControls: contraption.id === "over-tuned-speaker" ? {
      directional: isStranger ? (options.direction ?? "directional") : "omnidirectional",
      volume: isStranger ? (options.volume ?? "variable") : "fixed"
    } : undefined,
    summary
  };
}

/* ---------------------------------------------------------------- Mobile Modding (Lv 5) */

export async function executeMobileModding(targetActor, targetItem, modificationId, actor, options = {}) {
  need(targetActor, "Target actor is required for Mobile Modding.");
  need(targetItem, "Target item is required for Mobile Modding.");
  need(modificationId, "Modification ID is required.");

  const inventorActor = actor ?? options.actor ?? options.inventor ?? null;
  if (!inventorActor && !options.force) {
    throw new Error("Inventor actor is required for Mobile Modding.");
  }

  if (inventorActor && !hasMobileModding(inventorActor) && !options.force) {
    throw new Error("Actor does not have Mobile Modding feature (requires 5th level Inventor).");
  }

  if (options.willing === false && !options.force) {
    throw new Error("Target creature must be willing for Mobile Modding.");
  }

  const distanceVal = options.distance ?? options.distanceFeet;
  if (distanceVal !== undefined && Number(distanceVal) > 5 && !options.force) {
    throw new Error("Target creature must be within 5 feet for Mobile Modding.");
  }

  // Cost: 1 Prowess
  let prowessSpent = 0;
  if (inventorActor && !options.skipCost && getPoolDefinition("prowess")) {
    const prowessPool = getPool(inventorActor, "prowess");
    if (prowessPool) {
      if (prowessPool.value < 1 && !options.force) {
        throw new Error("Insufficient Prowess available to use Mobile Modding (costs 1 Prowess).");
      }
      await spendPool(inventorActor, "prowess", 1);
      prowessSpent = 1;
    }
  }

  // Apply modification with 0 Inventions cost, expiring in 1 minute
  const modResult = await applyEquipmentModification(targetItem, modificationId, {
    ...options,
    actor: inventorActor,
    inventorActor,
    isMobileModding: true,
    appliedAt: options.appliedAt ?? Date.now(),
    expiresAt: (options.appliedAt ?? Date.now()) + 60000
  });

  return {
    success: true,
    targetActor,
    targetItem,
    inventor: inventorActor,
    modification: modResult.modification,
    modificationId: modResult.modification.id,
    instability: modResult.instability,
    prowessSpent,
    costInventions: 0,
    duration: "1min",
    temporary: true,
    expiresAt: (options.appliedAt ?? Date.now()) + 60000,
    isMobileModding: true,
    summary: `Mobile Modding applied "${modResult.modification.name}" to ${targetItem.name ?? "equipment"} of ${targetActor.name ?? "target"} for 1 minute (1 Prowess spent, 0 Inventions cost).`
  };
}

/* ---------------------------------------------------------------- Inventor Prowess Gain Trigger (Lv 5) */

export async function onCreatureReducedToZeroHP(target, sourceActor, options = {}) {
  need(target, "Target is required for onCreatureReducedToZeroHP.");
  need(sourceActor, "Source actor is required for onCreatureReducedToZeroHP.");

  let qualified = false;
  if (options.activatedModThisTurn === true) {
    qualified = true;
  } else if (options.activatedModThisTurn === false || options.hasInventorMod === false) {
    qualified = false;
  } else {
    const activeMods = sourceActor.flags?.ak5e?.inventor?.activatedModsThisTurn ??
                       sourceActor.flags?.ak5e?.activatedModsThisTurn ?? [];
    if (activeMods.length > 0) {
      qualified = true;
    }
  }

  if (!qualified) {
    return {
      success: false,
      triggered: false,
      prowessGained: 0,
      totalProwessGained: 0,
      target,
      sourceActor,
      reason: "Source creature did not activate an Inventor's modification this turn."
    };
  }

  const candidateInventors = [];
  if (options.inventorActor) {
    candidateInventors.push(options.inventorActor);
  } else if (options.inventor) {
    candidateInventors.push(options.inventor);
  } else {
    const activeMods = sourceActor.flags?.ak5e?.inventor?.activatedModsThisTurn ??
                       sourceActor.flags?.ak5e?.activatedModsThisTurn ?? [];
    if (isInventor(sourceActor)) {
      candidateInventors.push(sourceActor);
    }
    for (const entry of activeMods) {
      if (entry.inventorId) {
        if (sourceActor.id === entry.inventorId && !candidateInventors.includes(sourceActor)) {
          candidateInventors.push(sourceActor);
        } else if (globalThis.game?.actors?.get) {
          const inv = globalThis.game.actors.get(entry.inventorId);
          if (inv && isInventor(inv) && !candidateInventors.includes(inv)) {
            candidateInventors.push(inv);
          }
        }
      }
    }
    if (options.gameActors && Array.isArray(options.gameActors)) {
      for (const a of options.gameActors) {
        if (isInventor(a) && !candidateInventors.includes(a)) {
          candidateInventors.push(a);
        }
      }
    }
  }

  const results = [];
  for (const inventor of candidateInventors) {
    if (!isInventor(inventor) && !options.force) continue;
    if (!hasMobileModding(inventor) && !options.force) continue;

    if (options.turn !== undefined) {
      const lastTurn = inventor.flags?.ak5e?.inventor?.lastProwessTurn;
      if (lastTurn !== undefined && lastTurn !== options.turn) {
        inventor.flags.ak5e.inventor.prowessGainedZeroHpThisTurn = false;
      }
      inventor.flags ??= {};
      inventor.flags.ak5e ??= {};
      inventor.flags.ak5e.inventor ??= {};
      inventor.flags.ak5e.inventor.lastProwessTurn = options.turn;
    }

    const gained = Boolean(
      inventor.getFlag?.("ak5e", "inventor")?.prowessGainedZeroHpThisTurn ??
      inventor.flags?.ak5e?.inventor?.prowessGainedZeroHpThisTurn
    );

    if (gained && !options.force) {
      results.push({
        inventor,
        prowessGained: 0,
        alreadyGainedThisTurn: true,
        reason: "Already gained Prowess via 0 HP trigger this turn (max 1/turn limit)."
      });
      continue;
    }

    let actualGained = 0;
    if (getPoolDefinition("prowess")) {
      const pool = getPool(inventor, "prowess");
      if (pool && pool.value < pool.max) {
        await refundPool(inventor, "prowess", 1, {
          reason: "Creature activating modification reduced enemy to 0 HP"
        });
        actualGained = 1;
      } else {
        actualGained = 0;
      }
    }

    if (typeof inventor.setFlag === "function") {
      await inventor.setFlag("ak5e", "inventor.prowessGainedZeroHpThisTurn", true);
    } else if (typeof inventor.update === "function") {
      await inventor.update({ "flags.ak5e.inventor.prowessGainedZeroHpThisTurn": true });
    } else {
      inventor.flags ??= {};
      inventor.flags.ak5e ??= {};
      inventor.flags.ak5e.inventor ??= {};
      inventor.flags.ak5e.inventor.prowessGainedZeroHpThisTurn = true;
    }

    results.push({
      inventor,
      prowessGained: actualGained,
      alreadyGainedThisTurn: false,
      reason: actualGained > 0
        ? "Gained 1 Prowess: creature activating modification reduced enemy to 0 HP."
        : "Prowess already at pool maximum."
    });
  }

  const totalGained = results.reduce((sum, r) => sum + r.prowessGained, 0);
  return {
    success: true,
    triggered: totalGained > 0,
    prowessGained: totalGained,
    totalProwessGained: totalGained,
    results,
    target,
    sourceActor
  };
}

export async function resetInventorTurnTriggers(actor) {
  if (!actor) return;
  if (typeof actor.setFlag === "function") {
    await actor.setFlag("ak5e", "inventor.prowessGainedZeroHpThisTurn", false);
    await actor.setFlag("ak5e", "inventor.activatedModsThisTurn", []);
  } else if (typeof actor.update === "function") {
    await actor.update({
      "flags.ak5e.inventor.prowessGainedZeroHpThisTurn": false,
      "flags.ak5e.inventor.activatedModsThisTurn": []
    });
  } else if (actor.flags?.ak5e?.inventor) {
    actor.flags.ak5e.inventor.prowessGainedZeroHpThisTurn = false;
    actor.flags.ak5e.inventor.activatedModsThisTurn = [];
  }
}

/* ---------------------------------------------------------------- The Big One (Lv 20) */

export const THE_BIG_ONE_MODES = Object.freeze({
  FLASH: "FLASH",
  SHARD: "SHARD",
  QUASAR: "QUASAR"
});

export async function executeTheBigOne(mode, actor, options = {}) {
  need(mode, "Mode is required for The Big One.");
  need(actor, "Actor is required for The Big One.");

  if (!hasTheBigOne(actor) && !options.force) {
    throw new Error("Actor does not have The Big One feature (requires 20th level Inventor).");
  }

  const normalizedMode = String(mode).toUpperCase();
  if (!["FLASH", "SHARD", "QUASAR"].includes(normalizedMode)) {
    throw new Error(`Invalid mode "${mode}" for The Big One. Valid modes are: FLASH, SHARD, QUASAR.`);
  }

  let warning = null;
  // Check 1/Long Rest usage
  if (!options.force && !options.skipUsage) {
    if (getPoolDefinition("theBigOne")) {
      const pool = getPool(actor, "theBigOne");
      if (pool && pool.value < 1) {
        warning = "alreadyUsed";
        if (options.strictLockout) {
          throw new Error("The Big One has already been used since the last Long Rest.");
        }
      } else {
        await spendPool(actor, "theBigOne", 1);
      }
    } else {
      const alreadyUsed = Boolean(
        actor.getFlag?.("ak5e", "inventor")?.theBigOneUsed ??
        actor.flags?.ak5e?.inventor?.theBigOneUsed
      );
      if (alreadyUsed) {
        warning = "alreadyUsed";
        if (options.strictLockout) {
          throw new Error("The Big One has already been used since the last Long Rest.");
        }
      }
    }
  }

  if (!warning) {
    if (typeof actor.setFlag === "function") {
      await actor.setFlag("ak5e", "inventor.theBigOneUsed", true);
    } else if (typeof actor.update === "function") {
      await actor.update({ "flags.ak5e.inventor.theBigOneUsed": true });
    } else {
      actor.flags ??= {};
      actor.flags.ak5e ??= {};
      actor.flags.ak5e.inventor ??= {};
      actor.flags.ak5e.inventor.theBigOneUsed = true;
    }
  }

  const dc = Number(options.saveDC ?? calculateInventorDC(actor, options));
  let damageFormula = "";
  let damageType = "";
  let condition = null;
  let ignoresCover = false;
  let areaDesc = "";

  if (normalizedMode === "FLASH") {
    damageFormula = "8d6";
    damageType = "thunder";
    condition = "burning";
    areaDesc = "Up to 4 locations within 100 ft, 10 ft radius";
  } else if (normalizedMode === "SHARD") {
    damageFormula = "10d6";
    damageType = "slashing";
    condition = "bleeding";
    ignoresCover = true;
    areaDesc = "50 ft cone";
  } else if (normalizedMode === "QUASAR") {
    damageFormula = "14d6";
    damageType = "radiant";
    condition = null;
    areaDesc = "100x10 ft line";
  }

  // De-duplicate targets so creatures in overlapping areas only make the save once
  const rawTargets = options.targets ? (Array.isArray(options.targets) ? options.targets : [options.targets]) :
                     (options.target ? [options.target] : []);
  const uniqueTargets = [];
  const seenIds = new Set();
  for (const t of rawTargets) {
    if (!t) continue;
    const tid = t.id ?? t.uuid ?? t;
    if (!seenIds.has(tid)) {
      seenIds.add(tid);
      uniqueTargets.push(t);
    }
  }

  const targetResults = [];
  const appliedConditions = [];

  for (const tgt of uniqueTargets) {
    const tgtId = tgt.id ?? tgt.uuid ?? String(Math.random());
    const savePassed = evaluateSave(tgt, "dex", dc, options);
    const damageRoll = Number(options.damage ?? options.damageRoll ?? 0);
    const damageTaken = savePassed ? Math.floor(damageRoll / 2) : damageRoll;

    let conditionApplied = null;
    if (!savePassed && condition) {
      const res = await applyConditionToActor(tgt, condition, true);
      conditionApplied = condition;
      appliedConditions.push({ target: tgt, condition, result: res });
    }

    targetResults.push({
      target: tgt,
      targetId: tgtId,
      name: tgt.name,
      savePassed,
      saveAbility: "dex",
      dc,
      damageRoll,
      damageTaken,
      damage: damageTaken,
      damageType,
      conditionApplied,
      conditions: conditionApplied ? [conditionApplied] : [],
      burning: conditionApplied === "burning",
      bleeding: conditionApplied === "bleeding",
      coverIgnored: ignoresCover,
      ignoresCover,
      savesMade: 1,
      damageMultiplier: 1
    });
  }

  const summary = `The Big One [${normalizedMode}] executed by ${actor.name ?? "Inventor"}. DC: ${dc}. Formula: ${damageFormula} ${damageType}. Affected ${uniqueTargets.length} unique creature(s).`;

  return {
    success: true,
    warning,
    warnings: warning ? [warning] : [],
    mode: normalizedMode,
    actor,
    dc,
    saveDC: dc,
    damageFormula,
    damageType,
    condition,
    burning: condition === "burning" || appliedConditions.some(c => c.condition === "burning"),
    bleeding: condition === "bleeding" || appliedConditions.some(c => c.condition === "bleeding"),
    ignoresCover,
    coverIgnored: ignoresCover,
    savesMade: 1,
    damageMultiplier: 1,
    areaDesc,
    targets: targetResults,
    targetResults,
    appliedConditions,
    summary
  };
}

export async function resetTheBigOne(actor) {
  if (!actor) return;
  if (getPoolDefinition("theBigOne")) {
    const pool = getPool(actor, "theBigOne");
    if (pool) {
      await refundPool(actor, "theBigOne", 1);
    }
  }
  if (typeof actor.setFlag === "function") {
    await actor.setFlag("ak5e", "inventor.theBigOneUsed", false);
  } else if (typeof actor.update === "function") {
    await actor.update({ "flags.ak5e.inventor.theBigOneUsed": false });
  } else if (actor.flags?.ak5e?.inventor) {
    actor.flags.ak5e.inventor.theBigOneUsed = false;
  }
}
