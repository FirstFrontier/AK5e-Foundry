import { CHAPTER_ONE_ENTRIES } from "./chapter-one-content.mjs";
import { CHAPTER_TWO_ORIGINS } from "./chapter-two-content.mjs";
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "./chapter-four-content.mjs";
import { CHAPTER_FIVE_ARTS } from "./chapter-five-content.mjs";
import { CHAPTER_SIX_CREATURES } from "./chapter-six-content.mjs";
import { AK5E_ROLL_TABLES } from "./roll-table-content.mjs";
import { classContentFlags, classContentUpdate } from "./class-content-installation.mjs";
import { AssetLibraryConfig, getAsset, listAssets, openAssetLibrary } from "./asset-library.mjs";
import { registerOriginConfig, registerOriginHooks, openOriginSetup, openActorOrigins } from "./origin-setup.mjs";
import { registerSheetThemeHooks, openSheetTheme, resolveSheetTheme, setSheetTheme, SHEET_THEMES } from "./sheet-themes.mjs";
import { registerArtsConfig, registerArtsHooks, openActorArts, configureActorArts, previewActorArts, configureArt, adjustActorArts, setActorArtsValue, recoverActorArts, undoLastArt, openArtUndoList, undoArtReceipt } from "./arts-casting.mjs";
import { applyFeatureTag, applyTagPreset, removeFeatureTag, resolveFeatureTag, setTagCounter, featureTags, openFeatureTagSetup } from "./feature-tags.mjs";
import { sourceTagPresets } from "./tag-presets.mjs";
import { registerWorldRuleSettings, configureWorldConditions, registerWorldRuleHooks, refreshConditionReferences, openWorldRuleControl,
  previewSkillReconciliation, applySkillReconciliation, previewDamage, rollDyingDamageSave,
  previewAlternateClass, queueAlternateClassSwitch, openAlternateClassSetup } from "./world-rules.mjs";
import { registerOperatorSkillHooks, openOperatorSkills, openOperatorSkillChoices, getOperatorSkillChoices, configureOperatorSkill, recordSkillPointEvent, recoverOperatorSkills,
  isOperatorActor, getIntegratedOperatorState, submitOperatorCommand, adjustOperatorSP, grantOperatorSP, activateIntegratedSkill, endIntegratedSkill, resolveOperatorSkillPhase, getOperatorSkillProvenance, adjustOperatorSkillCounter } from "./operator-skills.mjs";
import { registerSkillTargetBinding, registerSkillTemplateGeometry, updateOperatorSkills, previewOperatorSkillUpdate } from "./operator-targeting.mjs";
import * as ResourcePools from "./resource-pools.mjs";
import * as TriggerEvents from "./trigger-events.mjs";
import * as DamagePipeline from "./damage-pipeline.mjs";
import * as TipOfTheSpear from "./tip-of-the-spear.mjs";
import { openStandardBearer, registerStandardBearerHooks, submitStandardCommand, getStandardView, previewStandardUpdate, standardDamagePreview } from "./standard-bearer.mjs";
import { previewCasterSetup, applyCasterSetup, getCasterSetupChoices, configureCasterMapping } from "./caster-setup.mjs";
import { getCasterView, casterCommand, castCasterArt, createCasterDrone, syncCasterDrones, recordCasterRuling, registerCasterFeatureHooks, requestCasterDrone } from "./caster-features.mjs";
import { linkCasterDrone } from "./caster-drones.mjs";
import { openCasterControls, openCasterSetup, registerCasterSheetHooks } from "./caster-sheet.mjs";
import { getDefenderView, defenderCommand, registerDefenderHooks, shelteredAllies, shelterAppliesTo, spendResilience, refundResilience } from "./defender-features.mjs";
import { previewDefenderSetup, applyDefenderSetup } from "./defender-setup.mjs";
import { openDefenderControls, registerDefenderSheetHooks } from "./defender-sheet.mjs";
import { registerDreadnoughtHooks } from "./dreadnought-features.mjs";
import { registerArtshieldHooks } from "./artshield-features.mjs";
import { defenderUses, recordDefenderRuling } from "./defender-uses.mjs";
import { registerGuardianHooks, previewGuardianArts, applyGuardianArts } from "./guardian-features.mjs";
import { registerGuardianSheetHooks } from "./guardian-sheet.mjs";
import { registerFortressHooks } from "./fortress-features.mjs";
import { registerFortressSheetHooks } from "./fortress-sheet.mjs";
import { registerDefenderDamageHooks } from "./defender-damage-mods.mjs";
import { registerJuggernautHooks } from "./juggernaut-features.mjs";
import { registerJuggernautSheetHooks } from "./juggernaut-sheet.mjs";
import { registerProtectorHooks } from "./protector-features.mjs";
import { registerProtectorSheetHooks } from "./protector-sheet.mjs";
import { registerSentryHooks } from "./sentry-features.mjs";
import { registerSentrySheetHooks } from "./sentry-sheet.mjs";
import { defenderChoices, previewDefenderProgression, applyDefenderProgression, registerDefenderProgressionHooks } from "./defender-progression.mjs";
import { openDefenderSetup } from "./defender-progression-sheet.mjs";
import { getDefenderTalentView, submitDefenderTalentGrant, interlockingShieldsFor, openDefenderTalentControls, registerDefenderTalentHooks } from "./defender-talents.mjs";
import { registerPlayUndo } from "./play-undo.mjs";
import { previewGuardSetup, applyGuardSetup } from "./guard-setup.mjs";
import { inspectGuardFields, previewGuardProgression, applyGuardProgression } from "./guard-progression.mjs";
import { getGuardView, registerGuardHooks } from "./guard-features.mjs";
import { guardUses, recordGuardRuling } from "./guard-uses.mjs";
import { openGuardControls, registerGuardSheetHooks } from "./guard-sheet.mjs";
import { vanguardSheetApi, registerVanguardSheetHooks, vanguardUses, recordVanguardRuling, openVanguardProgression } from "./vanguard-sheet.mjs";
import { previewVanguardSetup, applyVanguardSetup } from "./vanguard-setup.mjs";
import { vanguardChoices, inspectVanguardFields, previewVanguardProgression, applyVanguardProgression } from "./vanguard-progression.mjs";
import { vanguardProfile, calculateVanguardProfile, martialDC as vanguardMartialDC } from "./vanguard-rules.mjs";
import { registerVanguardResolution, vanguardPreRollDamage } from "./vanguard-resolution.mjs";
import { isCenturion, registerCenturionHooks } from "./centurion-features.mjs";
import { isCrusher, registerCrusherHooks } from "./crusher-features.mjs";
import { isInstructor, registerInstructorHooks } from "./instructor-features.mjs";
import { isArtsblade, registerArtsbladeHooks, maxArtLevel, bladeArtFormula, ARTS_POOLS } from "./artsblade-features.mjs";
import { isBrawler, registerBrawlerHooks, bobAndWeaveAC, artOfTheFistDie } from "./brawler-features.mjs";
import { isDuellist, registerDuellistHooks } from "./duellist-features.mjs";
import { isLiberator, registerLiberatorHooks } from "./liberator-features.mjs";
import { isLord, registerLordHooks } from "./lord-features.mjs";
import { isMusha, registerMushaHooks, solobladeFormula, getNotYetDC, getNothingToLoseAttacks, livingOnTheEdgeBonus, mushaPreApplyDamageHook } from "./musha-features.mjs";
import { isReaper, registerReaperHooks, getRuin, getReaperTableEntry, getReapCritThreshold, getCurtainfallCritThreshold, calculateSwarmKills, reaperPreApplyDamageHook } from "./reaper-features.mjs";
import { isWeaponmaster, registerWeaponmasterHooks, MARTIAL_MASTERY_TABLE, getWeaponMasteryProperty, WEAPONMASTER_FIGHTING_STYLES, isWeaponmasterProficient, getWeaponmasterView } from "./weaponmaster-features.mjs";
import { previewMarksmanSetup, applyMarksmanSetup } from "./marksman-setup.mjs";
import { inspectMarksmanFields, previewMarksmanProgression, applyMarksmanProgression } from "./marksman-progression.mjs";
import { registerMarksmanHooks, targetLockPool, unerringPool, steelRainPool } from "./marksman-features.mjs";
import { marksmanUses, recordMarksmanRuling } from "./marksman-uses.mjs";
import { openMarksmanControls, registerMarksmanSheetHooks } from "./marksman-sheet.mjs";
import { openMarksmanProgression } from "./marksman-progression-sheet.mjs";
import { registerMarksmanResolution } from "./marksman-resolution.mjs";
import { isArtilleryman, registerArtillerymanHooks, artillerymanSplashDC } from "./artilleryman-features.mjs";
import { isBesieger, registerBesiegerHooks, inSiegeMode } from "./besieger-features.mjs";
import { isAntiAir, registerAntiAirHooks } from "./anti-air-features.mjs";
import { isDeadeye, registerDeadeyeHooks, inDeadshot } from "./deadeye-features.mjs";
import { isFlinger, registerFlingerHooks, boundWeaponsList } from "./flinger-features.mjs";
import { isHeavyshot, registerHeavyshotHooks } from "./heavyshot-features.mjs";
import { isHunter, registerHunterHooks, inLetTheLightIn } from "./hunter-features.mjs";
import { isSpreadshot, registerSpreadshotHooks, getLoadedShells, getShellInventory } from "./spreadshot-features.mjs";
import * as medicRules from "./medic-rules.mjs";
import { isMedic, isPhysician, isTriage, calculateMedicProfile } from "./medic-rules.mjs";
import { getMedicView, registerMedicHooks } from "./medic-features.mjs";
import { previewMedicSetup, applyMedicSetup } from "./medic-setup.mjs";
import { inspectMedicFields, previewMedicProgression, applyMedicProgression } from "./medic-progression.mjs";
import { medicUses, recordMedicRuling } from "./medic-uses.mjs";
import { openMedicControls, registerMedicSheetHooks } from "./medic-sheet.mjs";
import * as specialistRules from "./specialist-rules.mjs";
import { isSpecialist, isExecutor, isHookmaster, isInfuser, isInventor, isSkyranger, isDollkeeper, isTrapmaster, calculateInventorDC, calculateTrapDC, calculateSpecialistProfile, specialistProfile, specialistLevel, specialistBranch } from "./specialist-rules.mjs";
import { registerSpecialistHooks, hasWeaponSpecialisation, getWeaponSpecialisation, hasShowYourStyle, hasWeaponAdept, hasWeaponExpertise, hasFallingUpwards, hasWeaponMastery } from "./specialist-features.mjs";
import { previewSpecialistSetup, applySpecialistSetup } from "./specialist-setup.mjs";
import { inspectSpecialistFields, previewSpecialistProgression, applySpecialistProgression } from "./specialist-progression.mjs";
import { specialistUses, recordSpecialistRuling, getSpecialistRuling } from "./specialist-uses.mjs";
import { openSpecialistControls, registerSpecialistSheetHooks } from "./specialist-sheet.mjs";
import {
  registerExecutorHooks,
  getExecutorPath,
  setExecutorPath,
  getDeathmarkState,
  setDeathmark,
  recallDeathmark,
  clearDeathmark,
  calculateDeathmarkDamageBonus,
  hasInEveryShadow,
  hasSweeper,
  hasSmokescreen,
  hasPreysense,
  hasDangersense,
  hasInForTheKill,
  hasBladeShield,
  hasMortalBlow,
  hasUltimateSwordAndShield,
  applyInEveryShadow
} from "./executor-features.mjs";
import {
  registerHookmasterHooks,
  isHookedWeapon,
  isProficientWithHook,
  getHookedWeapon,
  calculateHookRange,
  getCreatureSize,
  getSizeValue,
  isNoMoreThanOneSizeLarger,
  isMoreThanOneSizeLarger,
  canConvertWeaponToHook,
  getWeaponDamageTypes,
  getHookmasterState,
  isHookLocked,
  convertHookedWeapon,
  revertHookedWeapon,
  hasBigBoot,
  hasKingOfUrbanJungle,
  hasBoundInRope,
  hasWrangler,
  hasMightyPush,
  hasSpidersEssence,
  hasLongerHook,
  hasSpidersThread,
  hasSwingToSafety,
  hasScorpionSting
} from "./hookmaster-features.mjs";
import {
  registerInfuserHooks,
  calculateInfuserDC,
  getActiveInfusion,
  calculateInfusionRange,
  hasPrincipleOfDoubleEffect,
  hasNewConcoctions,
  hasDoubleBlindTrial,
  hasStimpack,
  hasExcessiveDosing,
  hasToDefyScience,
  getToxinDC,
  INFUSIONS,
  DOUBLE_BLIND_TABLE
} from "./infuser-features.mjs";
import {
  registerInventorHooks,
  calculateInstability,
  evaluateBreakdownRoll,
  applyEquipmentModification,
  removeEquipmentModification,
  repairBrokenEquipment,
  isBrokenEquipment,
  hasEquipmentModification,
  hasStrangeContraption,
  hasMobileModding,
  hasRiskAssessment,
  hasStrangerContraptions,
  hasTheBigOne,
  MODIFICATIONS_CATALOG,
  defineInventorPools
} from "./inventor-features.mjs";
import {
  registerSkyrangerHooks,
  isWearingFlightSuit,
  canUseFlightSuitToFly,
  createFlightSuitItem,
  calculateFuelMax,
  getFuel,
  getFuelMax,
  spendFuel,
  refundFuel,
  getStrafeDamageFormula,
  getStrafeDamageDiceCount,
  calculateStrafeDamage,
  isFlying,
  getFlyingSpeed,
  isTargetAerial,
  executeTakeOff,
  endFlight,
  selectAirDoctrine,
  getActiveAirDoctrines,
  hasAirDoctrine,
  executeAAMissile,
  executeBombingRun,
  executeSwoopingDive,
  executeEvasiveManoeuvres,
  resolveEvasiveManoeuvresIncomingAttack,
  checkSkyrangerProwessGain,
  executeCrashAoE,
  executeAfterburnersAura,
  activateSkyscreamer,
  deactivateSkyscreamer,
  createCoreCannonItem,
  createCoreSaberItem,
  undoSkyrangerAction
} from "./skyranger-features.mjs";
import {
  registerDollkeeperHooks,
  getDollkeeperLevel,
  getOwnerPB,
  hasLivingDoll,
  hasPullTheStrings,
  hasMusicalChairs,
  hasMasquerade,
  hasLivingDoll15,
  hasArtistryIsViolence,
  getActorPosition,
  setActorPosition,
  calculateDistance,
  defineDollkeeperPools,
  isLivingDoll,
  createDollCompanionData,
  synchronizeDoll,
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
  undoDollkeeperAction
} from "./dollkeeper-features.mjs";
import {
  registerTrapmasterHooks,
  TRAPS_CATALOG,
  hasEnvironmentalWarfare,
  hasPanicInducer,
  hasHeresOneIMadeEarlier,
  hasBaitTheTrap,
  hasAgentOfChaos,
  hasHouseOfHorrors,
  calculateDetectionDC,
  calculateDisarmDC,
  getTrap,
  getTrapDamageFormula,
  getTrapDamageType,
  getTrapSaveInfo,
  checkTrapDetection,
  evaluateDisarmAttempt,
  hasSleightOfHandExpertise,
  applySleightOfHandGrant,
  defineTrapmasterPools,
  validateTrapPlacement,
  plantTrap,
  executeDevilsOwnLuck,
  applyIrritatingDistraction,
  hasIrritatingDistraction,
  evaluateTrapSaveRollOptions,
  checkJesterGraceTriggerImmunity,
  checkJesterGraceSaveAdvantage,
  executeWarningPoint,
  triggerDelayedTrap,
  recordTrapSaveFailure,
  checkTurnStartProwessGain,
  onCreatureReducedToZeroByTrap,
  executeComeAndGetMe,
  applyAgentOfChaos,
  checkAgentOfChaosBypass,
  evaluateAgentOfChaosDamage,
  executePartyFavours,
  undoTrapmasterOperation
} from "./trapmaster-features.mjs";


const MODULE_ID = "ak5e";
const CONTENT_VERSION = "0.2.4";
const MAX_METTLE = 6;

const PHYSICAL_DAMAGE = new Set(["bludgeoning", "piercing", "slashing", "thunder"]);
const ARTS_DAMAGE = new Set(["acid", "cold", "fire", "force", "lightning", "necrotic", "poison", "psychic", "radiant"]);

const STATUS_EFFECTS = [
  ["dying", "Dying", "icons/svg/skull.svg"],
  ["bleeding", "Bleeding", "icons/svg/blood.svg"],
  ["burning", "Burning", "icons/svg/fire.svg"],
  ["corroded", "Corroded", "icons/svg/acid.svg"],
  ["dazed", "Dazed", "icons/svg/daze.svg"],
  ["frozen", "Frozen", "icons/svg/frozen.svg"],
  ["necrotised", "Necrotised", "icons/svg/skull.svg"],
  ["nervous-impairment", "Nervous Impairment", "icons/svg/terror.svg"],
  ["silenced", "Silenced", "icons/svg/silenced.svg"]
].map(([key, name, img]) => ({ id: `${MODULE_ID}-${key}`, key, name, img }));

Hooks.once("init", () => {
  if (game.system.id === "dnd5e") registerOriginConfig();
  if (game.system.id === "dnd5e") registerArtsConfig();
  registerWorldRuleSettings();
  game.settings.register(MODULE_ID, "casterArtMappings", { scope: "world", config: false, type: Object, default: {} });
  registerPlayUndo();
  registerSkillTargetBinding();
  registerSkillTemplateGeometry();
  game.settings.register(MODULE_ID, "chapterOneRules", {
    name: "AK5E.Settings.ChapterOneRules.Name",
    hint: "AK5E.Settings.ChapterOneRules.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  game.settings.register(MODULE_ID, "assetLibrary", {
    scope: "world",
    config: false,
    type: Object,
    default: { version: 1, entries: [] }
  });

  game.settings.registerMenu(MODULE_ID, "assetLibrary", {
    name: "AK5E.Settings.AssetLibrary.Name",
    hint: "AK5E.Settings.AssetLibrary.Hint",
    label: "AK5E.Settings.AssetLibrary.Label",
    icon: "fa-solid fa-images",
    type: AssetLibraryConfig,
    restricted: true
  });
});

// V13 initializes settings after init. Read them no earlier than setup.
Hooks.once("setup", () => {
  registerStatusEffects();
  configureWorldConditions();
});

Hooks.once("ready", () => {
  if (game.system.id !== "dnd5e") {
    ui.notifications.error(game.i18n.localize("AK5E.Notifications.Dnd5eRequired"));
    return;
  }

  game.ak5e = Object.freeze({
    vanguard: Object.freeze({
      preview: previewVanguardSetup, apply: applyVanguardSetup,
      choices: vanguardChoices, inspect: vanguardProfile, profile: calculateVanguardProfile,
      open: vanguardSheetApi.open, openSetup: vanguardSheetApi.openSetup, openProgression: openVanguardProgression,
      command: vanguardUses.command, uses: vanguardUses.uses, previewUndo: vanguardUses.previewUndo,
      recordRuling: recordVanguardRuling, choicesForProgression: inspectVanguardFields,
      previewProgression: previewVanguardProgression, applyProgression: applyVanguardProgression, martialDC: vanguardMartialDC, vanguardPreRollDamage
    }),
    caster: Object.freeze({ preview: previewCasterSetup, apply: applyCasterSetup, choices: getCasterSetupChoices,
      inspect: getCasterView, open: openCasterControls, openSetup: openCasterSetup, command: casterCommand,
      cast: castCasterArt, createDrone: createCasterDrone, linkDrone: linkCasterDrone, requestDrone: requestCasterDrone, syncDrones: syncCasterDrones,
      recordRuling: recordCasterRuling, mapArt: configureCasterMapping }),
    defender: Object.freeze({ preview: previewDefenderSetup, apply: applyDefenderSetup, inspect: getDefenderView, open: openDefenderControls,
      command: defenderCommand, sheltered: shelteredAllies, shelterApplies: shelterAppliesTo, spendResilience, refundResilience,
      choices: defenderChoices, previewProgression: previewDefenderProgression, applyProgression: applyDefenderProgression, openSetup: openDefenderSetup,
      inspectTalents: getDefenderTalentView, grantTalent: submitDefenderTalentGrant, interlockingShieldsFor, openTalents: openDefenderTalentControls,
      // Guardian/Fortress/Juggernaut/Protector/Sentry uses (WORKFLOW.md §3.2): use(actor, command, data, operationId), undo via use(..., "undoUse", { useId }).
      use: defenderUses.command, uses: defenderUses.uses, previewUndo: defenderUses.previewUndo, recordRuling: recordDefenderRuling,
      previewGuardianArts, applyGuardianArts }),
    guard: Object.freeze({
      preview: previewGuardSetup,
      apply: applyGuardSetup,
      inspect: getGuardView,
      choices: inspectGuardFields,
      previewProgression: previewGuardProgression,
      applyProgression: applyGuardProgression,
      open: openGuardControls,
      use: guardUses.command,
      previewUse: guardUses.preview,
      uses: guardUses.uses,
      previewUndo: guardUses.previewUndo,
      recordRuling: recordGuardRuling,
      isCenturion,
      isCrusher,
      isInstructor,
      isArtsblade,
      isBrawler,
      isDuellist,
      isLiberator,
      isLord,
      isMusha,
      isReaper,
      isWeaponmaster,
      artsblade: Object.freeze({
        isArtsblade,
        maxArtLevel,
        bladeArtFormula,
        pools: ARTS_POOLS
      }),
      brawler: Object.freeze({
        isBrawler,
        bobAndWeaveAC,
        artOfTheFistDie
      }),
      musha: Object.freeze({
        isMusha,
        solobladeFormula,
        getNotYetDC,
        getNothingToLoseAttacks,
        livingOnTheEdgeBonus,
        mushaPreApplyDamageHook
      }),
      reaper: Object.freeze({
        isReaper,
        getRuin,
        getReaperTableEntry,
        getReapCritThreshold,
        getCurtainfallCritThreshold,
        calculateSwarmKills,
        reaperPreApplyDamageHook
      }),
      weaponmaster: Object.freeze({
        isWeaponmaster,
        MARTIAL_MASTERY_TABLE,
        getWeaponMasteryProperty,
        WEAPONMASTER_FIGHTING_STYLES,
        isWeaponmasterProficient,
        getWeaponmasterView
      })
    }),
    marksman: Object.freeze({
      preview: previewMarksmanSetup,
      apply: applyMarksmanSetup,
      choices: inspectMarksmanFields,
      previewProgression: previewMarksmanProgression,
      applyProgression: applyMarksmanProgression,
      open: openMarksmanControls,
      openProgression: openMarksmanProgression,
      use: marksmanUses.command,
      uses: marksmanUses.uses,
      previewUndo: marksmanUses.previewUndo,
      recordRuling: recordMarksmanRuling,
      isArtilleryman,
      artillerymanSplashDC,
      isBesieger,
      inSiegeMode,
      isAntiAir,
      isDeadeye,
      inDeadshot,
      isFlinger,
      boundWeaponsList,
      isHeavyshot,
      isHunter,
      inLetTheLightIn,
      isSpreadshot,
      getLoadedShells,
      getShellInventory
    }),
    medic: Object.freeze({
      preview: previewMedicSetup,
      apply: applyMedicSetup,
      inspect: getMedicView,
      calculateProfile: calculateMedicProfile,
      choices: inspectMedicFields,
      previewProgression: previewMedicProgression,
      applyProgression: applyMedicProgression,
      open: openMedicControls,
      use: medicUses.command,
      previewUse: medicUses.preview,
      uses: medicUses.uses,
      previewUndo: medicUses.previewUndo,
      recordRuling: recordMedicRuling,
      isMedic,
      isPhysician,
      isTriage,
      rules: medicRules
    }),
    specialist: Object.freeze({
      preview: previewSpecialistSetup,
      apply: applySpecialistSetup,
      inspect: specialistProfile,
      calculateProfile: calculateSpecialistProfile,
      choices: inspectSpecialistFields,
      previewProgression: previewSpecialistProgression,
      applyProgression: applySpecialistProgression,
      open: openSpecialistControls,
      use: specialistUses.command,
      previewUse: specialistUses.preview,
      uses: specialistUses.uses,
      previewUndo: specialistUses.previewUndo,
      recordRuling: recordSpecialistRuling,
      ruling: getSpecialistRuling,
      isSpecialist,
      isExecutor,
      isHookmaster,
      isInfuser,
      isInventor,
      isSkyranger,
      isDollkeeper,
      isTrapmaster,
      calculateTrapDC,
      rules: specialistRules,
      features: Object.freeze({
        hasWeaponSpecialisation,
        getWeaponSpecialisation,
        hasShowYourStyle,
        hasWeaponAdept,
        hasWeaponExpertise,
        hasFallingUpwards,
        hasWeaponMastery
      }),
      executor: Object.freeze({
        getPath: getExecutorPath,
        setPath: setExecutorPath,
        getDeathmark: getDeathmarkState,
        setDeathmark,
        recallDeathmark,
        clearDeathmark,
        calculateDamageBonus: calculateDeathmarkDamageBonus,
        hasInEveryShadow,
        hasSweeper,
        hasSmokescreen,
        hasPreysense,
        hasDangersense,
        hasInForTheKill,
        hasBladeShield,
        hasMortalBlow,
        hasUltimateSwordAndShield,
        applyInEveryShadow
      }),
      hookmaster: Object.freeze({
        isHookedWeapon,
        isProficientWithHook,
        getHookedWeapon,
        calculateHookRange,
        getCreatureSize,
        getSizeValue,
        isNoMoreThanOneSizeLarger,
        isMoreThanOneSizeLarger,
        canConvertWeaponToHook,
        getWeaponDamageTypes,
        getState: getHookmasterState,
        isHookLocked,
        convertHookedWeapon,
        revertHookedWeapon,
        hasBigBoot,
        hasKingOfUrbanJungle,
        hasBoundInRope,
        hasWrangler,
        hasMightyPush,
        hasSpidersEssence,
        hasLongerHook,
        hasSpidersThread,
        hasSwingToSafety,
        hasScorpionSting
      }),
      infuser: Object.freeze({
        calculateDC: calculateInfuserDC,
        getActiveInfusion,
        calculateRange: calculateInfusionRange,
        hasPrincipleOfDoubleEffect,
        hasNewConcoctions,
        hasDoubleBlindTrial,
        hasStimpack,
        hasExcessiveDosing,
        hasToDefyScience,
        getToxinDC,
        INFUSIONS,
        DOUBLE_BLIND_TABLE
      }),
      inventor: Object.freeze({
        calculateDC: calculateInventorDC,
        calculateInstability,
        evaluateBreakdownRoll,
        applyEquipmentModification,
        removeEquipmentModification,
        repairBrokenEquipment,
        isBrokenEquipment,
        hasEquipmentModification,
        hasStrangeContraption,
        hasMobileModding,
        hasRiskAssessment,
        hasStrangerContraptions,
        hasTheBigOne,
        MODIFICATIONS_CATALOG,
        defineInventorPools
      }),
      skyranger: Object.freeze({
        isSkyranger,
        isWearingFlightSuit,
        canUseFlightSuitToFly,
        createFlightSuitItem,
        calculateFuelMax,
        getFuel,
        getFuelMax,
        spendFuel,
        refundFuel,
        getStrafeDamageFormula,
        getStrafeDamageDiceCount,
        calculateStrafeDamage,
        isFlying,
        getFlyingSpeed,
        isTargetAerial,
        executeTakeOff,
        endFlight,
        selectAirDoctrine,
        getActiveAirDoctrines,
        hasAirDoctrine,
        executeAAMissile,
        executeBombingRun,
        executeSwoopingDive,
        executeEvasiveManoeuvres,
        resolveEvasiveManoeuvresIncomingAttack,
        checkSkyrangerProwessGain,
        executeCrashAoE,
        executeAfterburnersAura,
        activateSkyscreamer,
        deactivateSkyscreamer,
        createCoreCannonItem,
        createCoreSaberItem,
        undoSkyrangerAction
      }),
      dollkeeper: Object.freeze({
        isDollkeeper,
        getDollkeeperLevel,
        getOwnerPB,
        hasLivingDoll,
        hasPullTheStrings,
        hasMusicalChairs,
        hasMasquerade,
        hasLivingDoll15,
        hasArtistryIsViolence,
        getActorPosition,
        setActorPosition,
        calculateDistance,
        defineDollkeeperPools,
        isLivingDoll,
        createDollCompanionData,
        synchronizeDoll,
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
        undoDollkeeperAction
      }),
      trapmaster: Object.freeze({
        isTrapmaster,
        TRAPS_CATALOG,
        hasEnvironmentalWarfare,
        hasPanicInducer,
        hasHeresOneIMadeEarlier,
        hasBaitTheTrap,
        hasAgentOfChaos,
        hasHouseOfHorrors,
        calculateTrapDC,
        calculateDetectionDC,
        calculateDisarmDC,
        getTrap,
        getTrapDamageFormula,
        getTrapDamageType,
        getTrapSaveInfo,
        checkTrapDetection,
        evaluateDisarmAttempt,
        hasSleightOfHandExpertise,
        applySleightOfHandGrant,
        defineTrapmasterPools,
        validateTrapPlacement,
        plantTrap,
        executeDevilsOwnLuck,
        applyIrritatingDistraction,
        hasIrritatingDistraction,
        evaluateTrapSaveRollOptions,
        checkJesterGraceTriggerImmunity,
        checkJesterGraceSaveAdvantage,
        executeWarningPoint,
        triggerDelayedTrap,
        recordTrapSaveFailure,
        checkTurnStartProwessGain,
        onCreatureReducedToZeroByTrap,
        executeComeAndGetMe,
        applyAgentOfChaos,
        checkAgentOfChaosBypass,
        evaluateAgentOfChaosDamage,
        executePartyFavours,
        undoTrapmasterOperation
      })
    }),
    openStandardBearer, submitStandardCommand, getStandardView, previewStandardUpdate, standardDamagePreview,
    // SI-2/3/4/12 kernels: calculation and event APIs for branch implementations.
    resourcePools: ResourcePools, triggers: TriggerEvents, damagePipeline: DamagePipeline, tipOfTheSpear: TipOfTheSpear,
    openOriginSetup,
    openActorOrigins,
    sheetThemes: SHEET_THEMES,
    resolveSheetTheme,
    openSheetTheme,
    setSheetTheme,
    applyFeatureTag,
    applyTagPreset,
    sourceTagPresets,
    resolveFeatureTag,
    setTagCounter,
    removeFeatureTag,
    featureTags,
    openFeatureTagSetup,
    openActorArts,
    configureActorArts,
    previewActorArts,
    configureArt,
    adjustActorArts,
    setActorArtsValue,
    recoverActorArts,
    undoLastArt,
    openArtUndoList,
    undoArtReceipt,
    conditions: Object.freeze(Object.fromEntries(STATUS_EFFECTS.map(effect => [effect.key, effect]))),
    openWorldRuleControl, previewSkillReconciliation, applySkillReconciliation, previewDamage, rollDyingDamageSave,
    previewAlternateClass, queueAlternateClassSwitch, openAlternateClassSetup,
    assets: Object.freeze({ get: getAsset, list: listAssets, openLibrary: openAssetLibrary }),
    installChapterOneRules,
    installChapterTwoOrigins,
    installChapterThreeClasses,
    installChapterFourEquipment,
    installChapterFiveArts,
    installChapterSixCreatures,
    installRollTables,
    applyCondition,
    removeCondition,
    getDyingState,
    enterDying,
    leaveDying,
    recordDeathSave,
    grantMettle,
    resolveDyingTurnStart,
    recordHealingWhileDying,
    resolveDyingTurnEnd,
    spendMettle,
    resolveStabilise,
    getOperatorSkillState,
    configureOperatorSkills,
    adjustSkillPoints,
    activateOperatorSkill,
    resolveOperatorSkillPhase,
    adjustOperatorSkillCounter,
    getOperatorSkillProvenance,
    previewOperatorSkillUpdate,
    updateOperatorSkills,
    endOperatorSkill,
    openOperatorSkills,
    openOperatorSkillChoices,
    getOperatorSkillChoices,
    configureOperatorSkill,
    recordSkillPointEvent,
    recoverOperatorSkills,
    getArtsPointState,
    configureArtsPoints,
    spendArtsPoints,
    recoverArtsPoints,
    getOripathyState,
    setOripathyState,
    beginRestAction,
    completeRestAction,
    martialDC,
    damageCategory,
    damageAfterReduction
  });
  registerOriginHooks();
  registerSheetThemeHooks();
  registerArtsHooks();
  registerOperatorSkillHooks();
  registerStandardBearerHooks();
  registerCasterFeatureHooks();
  registerCasterSheetHooks();
  registerDefenderHooks();
  registerDefenderProgressionHooks();
  registerDefenderTalentHooks(grantOperatorSP);
  registerDreadnoughtHooks(grantOperatorSP);
  registerArtshieldHooks();
  registerGuardianHooks();
  registerFortressHooks();
  registerDefenderDamageHooks();
  registerJuggernautHooks();
  registerProtectorHooks();
  registerSentryHooks();
  Hooks.on("createChatMessage", (message, options, userId) => Promise.resolve(defenderUses.handleRelay(message, options, userId)).catch(error => console.error("AK5e | Defender relay", error)));
  registerDefenderSheetHooks();
  registerGuardianSheetHooks();
  registerFortressSheetHooks();
  registerJuggernautSheetHooks();
  registerProtectorSheetHooks();
  registerSentrySheetHooks();
  registerGuardHooks();
  registerCenturionHooks();
  registerCrusherHooks();
  registerInstructorHooks();
  registerArtsbladeHooks();
  registerBrawlerHooks();
  registerDuellistHooks();
  registerLiberatorHooks();
  registerLordHooks();
  registerMushaHooks();
  registerReaperHooks();
  registerWeaponmasterHooks();
  Hooks.on("createChatMessage", (message, options, userId) => Promise.resolve(guardUses.handleRelay(message, options, userId)).catch(error => console.error("AK5e | Guard relay", error)));
  registerGuardSheetHooks();
  registerMarksmanHooks();
  registerArtillerymanHooks();
  registerBesiegerHooks();
  registerAntiAirHooks();
  registerDeadeyeHooks();
  registerFlingerHooks();
  registerHeavyshotHooks();
  registerHunterHooks();
  registerSpreadshotHooks();
  Hooks.on("createChatMessage", (message, options, userId) => Promise.resolve(marksmanUses.handleRelay(message, options, userId)).catch(error => console.error("AK5e | Marksman relay", error)));
  registerMarksmanSheetHooks();
  registerMarksmanResolution();
  registerMedicHooks();
  Hooks.on("createChatMessage", (message, options, userId) => Promise.resolve(medicUses.handleRelay(message, options, userId)).catch(error => console.error("AK5e | Medic relay", error)));
  registerMedicSheetHooks();
  registerSpecialistHooks();
  registerExecutorHooks();
  registerHookmasterHooks();
  registerInfuserHooks();
  registerInventorHooks();
  registerSkyrangerHooks();
  registerDollkeeperHooks();
  registerTrapmasterHooks();
  Hooks.on("createChatMessage", (message, options, userId) => Promise.resolve(specialistUses.handleRelay(message, options, userId)).catch(error => console.error("AK5e | Specialist relay", error)));
  registerSpecialistSheetHooks();
  ResourcePools.registerResourcePoolHooks();
  TriggerEvents.registerTriggerEventHooks();
  registerWorldRuleHooks(game.ak5e);
  registerVanguardSheetHooks();
  registerVanguardResolution();
});

function registerStatusEffects() {
  if (!game.settings.get(MODULE_ID, "chapterOneRules")) return;
  const effects = STATUS_EFFECTS.map(({ id, name, img }) => ({ id, name, img }));
  if (Array.isArray(CONFIG.statusEffects)) {
    for (const effect of effects) {
      if (!CONFIG.statusEffects.some(existing => existing.id === effect.id)) CONFIG.statusEffects.push(effect);
    }
    return;
  }

  for (const effect of effects) CONFIG.statusEffects[effect.id] ??= effect;
}

function assertActor(actor) {
  if (!actor?.documentName || actor.documentName !== "Actor") throw new Error("AK5e requires an Actor document.");
  return actor;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function localize(key, data = {}) {
  return game.i18n.format(`AK5E.Notifications.${key}`, data);
}

function statusEffect(key) {
  const effect = STATUS_EFFECTS.find(entry => entry.key === key || entry.id === key);
  if (!effect) throw new Error(`Unknown AK5e condition: ${key}`);
  return effect;
}

function managedEffect(actor, statusId) {
  return actor.effects.find(effect => effect.getFlag(MODULE_ID, "statusId") === statusId);
}

async function applyCondition(actor, key) {
  actor = assertActor(actor);
  const status = statusEffect(key);
  if (managedEffect(actor, status.id)) return;
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: status.name,
    img: status.img,
    disabled: false,
    transfer: false,
    statuses: [status.id],
    flags: { [MODULE_ID]: { statusId: status.id } }
  }]);
}

async function removeCondition(actor, key) {
  actor = assertActor(actor);
  const status = statusEffect(key);
  const effect = managedEffect(actor, status.id);
  if (effect) await effect.delete();
}

function getDyingState(actor) {
  actor = assertActor(actor);
  const stored = actor.getFlag(MODULE_ID, "dying") ?? {};
  return {
    active: Boolean(stored.active),
    mettle: clamp(stored.mettle, 0, MAX_METTLE),
    failures: clamp(stored.failures, 0, 3),
    stabilisesNextTurn: Boolean(stored.stabilisesNextTurn),
    healingThisTurn: Boolean(stored.healingThisTurn),
    healingBonusMettle: Math.max(0, Math.trunc(Number(stored.healingBonusMettle) || 0))
  };
}

async function setDyingState(actor, change) {
  const next = { ...getDyingState(actor), ...change };
  next.mettle = clamp(next.mettle, 0, MAX_METTLE);
  next.failures = clamp(next.failures, 0, 3);
  if (!next.active) {
    next.mettle = 0;
    next.stabilisesNextTurn = false;
    next.healingThisTurn = false;
    next.healingBonusMettle = 0;
  }
  await actor.setFlag(MODULE_ID, "dying", next);
  return next;
}

async function enterDying(actor) {
  actor = assertActor(actor);
  const current = getDyingState(actor);
  await applyCondition(actor, "dying");
  return setDyingState(actor, {
    active: true,
    mettle: 0,
    failures: current.failures,
    stabilisesNextTurn: false,
    healingThisTurn: false,
    healingBonusMettle: 0
  });
}

async function leaveDying(actor) {
  actor = assertActor(actor);
  await removeCondition(actor, "dying");
  return setDyingState(actor, { active: false });
}

async function requireDying(actor) {
  const state = getDyingState(actor);
  if (state.active) return state;
  ui.notifications.warn(localize("DyingRequired", { name: actor.name }));
  return null;
}

async function recordDeathSave(actor, successful) {
  actor = assertActor(actor);
  if (typeof successful !== "boolean") throw new Error("A Death Saving Throw result must be true or false.");
  const state = await requireDying(actor);
  if (!state) return null;
  const next = await setDyingState(actor, {
    mettle: state.mettle + (successful ? 2 : 1),
    failures: state.failures + (successful ? 0 : 1)
  });
  if (next.failures >= 3) ui.notifications.warn(localize("ThreeFailedDeathSaves", { name: actor.name }));
  return next;
}

async function grantMettle(actor, amount) {
  actor = assertActor(actor);
  const state = await requireDying(actor);
  if (!state) return null;
  const gain = Number(amount);
  if (!Number.isSafeInteger(gain) || gain < 0) throw new Error("Mettle gain must be a nonnegative integer.");
  return setDyingState(actor, { mettle: state.mettle + gain });
}

async function recordHealingWhileDying(actor, hitPointsRegained) {
  actor = assertActor(actor);
  const state = await requireDying(actor);
  if (!state) return null;
  const healed = Math.max(0, Number(hitPointsRegained) || 0);
  if (!healed) return state;
  return setDyingState(actor, {
    healingThisTurn: true,
    healingBonusMettle: state.healingBonusMettle + Math.floor(healed / 10)
  });
}

/** Resolve the end-of-turn Mettle gained from every healing instance recorded during this Turn. */
async function resolveDyingTurnEnd(actor) {
  actor = assertActor(actor);
  const state = await requireDying(actor);
  if (!state) return null;
  if (!state.healingThisTurn) return state;
  return setDyingState(actor, {
    mettle: state.mettle + 1 + state.healingBonusMettle,
    healingThisTurn: false,
    healingBonusMettle: 0
  });
}

/**
 * Call this at the beginning of a Dying Creature's turn. If Stabilise was
 * bought on the prior turn, it completes the rule; otherwise it records the
 * death-save result supplied by the GM or a macro.
 */
async function resolveDyingTurnStart(actor, deathSaveSucceeded) {
  actor = assertActor(actor);
  const state = await requireDying(actor);
  if (!state) return null;
  if (!state.stabilisesNextTurn) return recordDeathSave(actor, deathSaveSucceeded);

  const hitPoints = Number(actor.system.attributes?.hp?.value) || 0;
  if (hitPoints <= 0) await actor.update({ "system.attributes.hp.value": 1 });
  return leaveDying(actor);
}

async function spendMettle(actor, amount) {
  actor = assertActor(actor);
  const state = await requireDying(actor);
  if (!state) return false;
  const cost = Math.max(0, Number(amount) || 0);
  if (state.mettle < cost) {
    ui.notifications.warn(localize("NotEnoughMettle", { name: actor.name }));
    return false;
  }
  await setDyingState(actor, { mettle: state.mettle - cost });
  return true;
}

async function resolveStabilise(actor) {
  actor = assertActor(actor);
  if (!(await spendMettle(actor, 6))) return false;
  await setDyingState(actor, { stabilisesNextTurn: true });
  return true;
}

function getOperatorSkillState(actor) {
  actor = assertActor(actor);
  if (isOperatorActor(actor)) return getIntegratedOperatorState(actor);
  const stored = actor.getFlag(MODULE_ID, "operatorSkills") ?? {};
  const maximum = Math.max(0, Number(stored.maximum) || 0);
  return {
    points: clamp(stored.points, 0, maximum),
    maximum,
    start: clamp(stored.start, 0, maximum),
    active: stored.active ?? null
  };
}

async function setOperatorSkillState(actor, change) {
  const next = { ...actor.getFlag(MODULE_ID, "operatorSkills"), ...getOperatorSkillState(actor), ...change };
  next.maximum = Math.max(0, Number(next.maximum) || 0);
  next.points = clamp(next.points, 0, next.maximum);
  next.start = clamp(next.start, 0, next.maximum);
  await actor.setFlag(MODULE_ID, "operatorSkills", next);
  return next;
}

async function configureOperatorSkills(actor, options = {}) {
  actor = assertActor(actor);
  if ("enabled" in options) {
    await submitOperatorCommand(actor, "enable", { enabled: options.enabled });
    return getOperatorSkillState(actor);
  }
  if (isOperatorActor(actor)) throw new Error("Pool limits come from learned Skills. Configure the Skill Items instead.");
  const { maximum, start = 0, points = start } = options;
  return setOperatorSkillState(actor, { maximum, start, points, active: null });
}

async function adjustSkillPoints(actor, amount, options = {}) {
  actor = assertActor(actor);
  if (isOperatorActor(actor)) return adjustOperatorSP(actor, amount, options);
  const state = getOperatorSkillState(actor);
  if (state.active) return state;
  return setOperatorSkillState(actor, { points: state.points + (Number(amount) || 0) });
}

async function activateOperatorSkill(actor, options = {}) {
  actor = assertActor(actor);
  if (options.itemId) return activateIntegratedSkill(actor, options.itemId, options);
  if (isOperatorActor(actor)) return submitOperatorCommand(actor, "activateManual", options);
  const { id, name, cost } = options;
  const state = getOperatorSkillState(actor);
  if (state.active) {
    ui.notifications.warn(localize("SkillAlreadyActive", { name: actor.name }));
    return false;
  }
  const normalizedCost = Math.max(0, Number(cost) || 0);
  if (state.points < normalizedCost) {
    ui.notifications.warn(localize("NotEnoughSkillPoints", { name: actor.name }));
    return false;
  }
  await setOperatorSkillState(actor, { points: state.points - normalizedCost, active: { id, name: name ?? id } });
  return true;
}

async function endOperatorSkill(actor) {
  actor = assertActor(actor);
  if (isOperatorActor(actor)) return endIntegratedSkill(actor);
  return setOperatorSkillState(actor, { active: null });
}

function getArtsPointState(actor) {
  actor = assertActor(actor);
  const stored = actor.getFlag(MODULE_ID, "artsPoints") ?? {};
  const maximum = Math.max(0, Number(stored.maximum) || 0);
  return {
    value: clamp(stored.value, 0, maximum),
    maximum,
    maximumArtLevel: clamp(stored.maximumArtLevel, 0, 9),
    ninthLevelCast: Boolean(stored.ninthLevelCast)
  };
}

async function setArtsPointState(actor, change) {
  if (actor.getFlag(MODULE_ID, "casting")?.enabled) {
    throw new Error("This actor uses the Arts casting adapter. Use configureActorArts, adjustActorArts, or cast from its sheet instead of legacy AP helpers.");
  }
  const next = { ...getArtsPointState(actor), ...change };
  next.maximum = Math.max(0, Number(next.maximum) || 0);
  next.value = clamp(next.value, 0, next.maximum);
  next.maximumArtLevel = clamp(next.maximumArtLevel, 0, 9);
  await actor.setFlag(MODULE_ID, "artsPoints", next);
  return next;
}

async function configureArtsPoints(actor, { maximum, value = maximum, maximumArtLevel } = {}) {
  actor = assertActor(actor);
  return setArtsPointState(actor, { maximum, value, maximumArtLevel, ninthLevelCast: false });
}

async function spendArtsPoints(actor, artLevel) {
  actor = assertActor(actor);
  const state = getArtsPointState(actor);
  const level = Number(artLevel);
  if (!Number.isInteger(level) || level < 0 || level > 9) throw new Error("An Art Level must be an integer from 0 to 9.");
  if (level > state.maximumArtLevel) {
    ui.notifications.warn(localize("ArtLevelTooHigh", { name: actor.name }));
    return false;
  }
  if (level === 9 && state.ninthLevelCast) {
    ui.notifications.warn(localize("NinthLevelArtUsed", { name: actor.name }));
    return false;
  }
  if (state.value < level) {
    ui.notifications.warn(localize("NotEnoughArtsPoints", { name: actor.name }));
    return false;
  }
  await setArtsPointState(actor, { value: state.value - level, ninthLevelCast: state.ninthLevelCast || level === 9 });
  return true;
}

async function recoverArtsPoints(actor, amount, { longRest = false } = {}) {
  actor = assertActor(actor);
  const state = getArtsPointState(actor);
  const recovered = amount === "max" ? state.maximum : state.value + (Number(amount) || 0);
  return setArtsPointState(actor, { value: recovered, ninthLevelCast: longRest ? false : state.ninthLevelCast });
}

function getOripathyState(actor) {
  actor = assertActor(actor);
  const stored = actor.getFlag(MODULE_ID, "oripathy") ?? {};
  return { infected: Boolean(stored.infected), assimilation: Math.max(0, Number(stored.assimilation) || 0) };
}

async function setOripathyState(actor, change) {
  actor = assertActor(actor);
  const next = { ...getOripathyState(actor), ...change };
  next.infected = Boolean(next.infected);
  next.assimilation = Math.max(0, Number(next.assimilation) || 0);
  await actor.setFlag(MODULE_ID, "oripathy", next);
  return next;
}

async function beginRestAction(actor, { kind, name } = {}) {
  actor = assertActor(actor);
  if (!["short", "long"].includes(kind)) throw new Error("A Rest Action must be short or long.");
  const existing = actor.getFlag(MODULE_ID, "restAction");
  if (existing) {
    ui.notifications.warn(localize("RestActionInProgress", { name: actor.name }));
    return false;
  }
  await actor.setFlag(MODULE_ID, "restAction", { kind, name: name ?? "Rest Action" });
  return true;
}

async function completeRestAction(actor, restKind) {
  actor = assertActor(actor);
  if (!["short", "long"].includes(restKind)) throw new Error("A completed Rest must be short or long.");
  const action = actor.getFlag(MODULE_ID, "restAction");
  if (!action) return null;
  if (action.kind === "long" && restKind !== "long") return false;
  await actor.unsetFlag(MODULE_ID, "restAction");
  return action;
}

function martialDC(actor, ability = "str") {
  actor = assertActor(actor);
  if (!["str", "dex"].includes(ability)) throw new Error("Martial DC uses str or dex.");
  const modifier = Number(actor.system.abilities?.[ability]?.mod) || 0;
  const proficiency = Number(actor.system.attributes?.prof) || 0;
  return 8 + modifier + proficiency;
}

function damageCategory(damageType) {
  const normalized = String(damageType).toLowerCase();
  if (PHYSICAL_DAMAGE.has(normalized)) return "physical";
  if (ARTS_DAMAGE.has(normalized)) return "arts";
  return null;
}

function damageAfterReduction(amount, reduction = 0, { resistance = false, vulnerability = false } = {}) {
  const incoming = Math.max(0, Number(amount) || 0);
  if (!incoming) return 0;
  const afterReduction = Math.max(1, incoming - Math.max(0, Number(reduction) || 0));
  const multiplier = resistance === vulnerability ? 1 : resistance ? 0.5 : 2;
  return Math.max(1, Math.floor(afterReduction * multiplier));
}

async function installChapterOneRules() {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("AK5E.Notifications.GamemasterOnly"));
    return { created: 0, skipped: CHAPTER_ONE_ENTRIES.length };
  }

  let folder = game.folders.find(entry => entry.type === "JournalEntry" && entry.getFlag(MODULE_ID, "chapterOneFolder"));
  if (!folder) {
    folder = await Folder.create({
      name: "AK5e: Chapter 1 — Changing the Game",
      type: "JournalEntry",
      sorting: "a",
      color: "#8f1d1d",
      flags: { [MODULE_ID]: { chapterOneFolder: true } }
    });
  }

  let created = 0;
  let updated = 0;
  for (const entry of CHAPTER_ONE_ENTRIES) {
    const exists = game.journal.find(journal => journal.getFlag(MODULE_ID, "chapterOneSlug") === entry.slug);
    const data = {
      name: entry.name,
      folder: folder.id,
      ownership: { default: 2 },
      flags: {
        [MODULE_ID]: {
          chapterOneSlug: entry.slug,
          sourceHeading: entry.sourceHeading,
          sourceFile: "01_chapter_1_changing_the_game.txt",
          contentVersion: CONTENT_VERSION,
          rawSource: entry.rawSource
        }
      },
      pages: [{
        name: entry.name,
        type: "text",
        text: { content: entry.content, format: 1 }
      }]
    };
    if (!exists) {
      await JournalEntry.create(data);
      created += 1;
    } else if (exists.getFlag(MODULE_ID, "contentVersion") !== CONTENT_VERSION) {
      await updateJournalContent(exists, data);
      updated += 1;
    }
  }

  const changed = created + updated;
  const key = changed ? "ChapterOneInstalled" : "ChapterOneAlreadyInstalled";
  refreshConditionReferences();
  ui.notifications.info(game.i18n.format(`AK5E.Notifications.${key}`, { count: changed }));
  return { created, updated, skipped: CHAPTER_ONE_ENTRIES.length - changed };
}

async function installChapterTwoOrigins() {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("AK5E.Notifications.GamemasterOnly"));
    return { created: 0, skipped: CHAPTER_TWO_ORIGINS.length };
  }

  const references = CHAPTER_TWO_ORIGINS.filter(entry => entry.kind === "reference");
  const summons = CHAPTER_TWO_ORIGINS.filter(entry => entry.kind === "origin-summon");
  const itemEntries = CHAPTER_TWO_ORIGINS.filter(entry => entry.itemType);
  const journalFolder = await ensureJournalFolder("AK5e: Chapter 2 — Character Origins Reference", "chapterTwoReferences");
  let created = 0;
  let updated = 0;
  for (const entry of references) {
    const existing = game.journal.find(journal => journal.getFlag(MODULE_ID, "chapterTwoId") === entry.id);
    const data = chapterReferenceData(entry, journalFolder, "chapterTwoId", "02_chapter_2_character_origins.txt");
    if (!existing) {
      await JournalEntry.create(data);
      created += 1;
    } else if (existing.getFlag(MODULE_ID, "contentVersion") !== CONTENT_VERSION) {
      await updateJournalContent(existing, data);
      updated += 1;
    }
  }

  const actorRoot = await ensureActorFolder("AK5e: Chapter 2 — Origin Summons", "chapterTwoSummons");
  for (const entry of summons) {
    const existing = game.actors.find(actor => actor.getFlag(MODULE_ID, "chapterTwoId") === entry.id);
    const data = summonActorData(entry, actorRoot, "chapterTwoId", "02_chapter_2_character_origins.txt");
    if (!existing) {
      await Actor.create(data);
      created += 1;
    } else if (existing.getFlag(MODULE_ID, "contentVersion") !== CONTENT_VERSION) {
      await existing.update(data);
      updated += 1;
    }
  }

  const root = await ensureItemFolder("AK5e: Chapter 2 — Character Origins", "chapterTwoRoot");
  const folders = new Map();
  for (const [kind, name] of Object.entries({
    species: "Species",
    "species-feature": "Species Features",
    nationality: "Nationalities",
    background: "Backgrounds"
  })) {
    folders.set(kind, await ensureItemFolder(name, `chapterTwo-${kind}`, root));
  }

  for (const origin of itemEntries) {
    const exists = game.items.find(item => item.getFlag(MODULE_ID, "chapterTwoId") === origin.id);
    const data = {
      name: origin.name,
      type: origin.itemType,
      img: "icons/svg/book.svg",
      folder: folders.get(origin.kind).id,
      system: {
        ...origin.systemData,
        description: { value: origin.content, chat: "" }
      },
      flags: {
        [MODULE_ID]: {
          chapterTwoId: origin.id,
          originKind: origin.kind,
          parentOrigin: origin.parent,
          speciesSize: origin.speciesSize,
          sourceHeading: origin.sourceHeading,
          sourceFile: "02_chapter_2_character_origins.txt",
          contentVersion: CONTENT_VERSION,
          rawSource: origin.rawSource
        },
        dnd5e: { sourceBook: "AK5E" }
      }
    };
    if (!exists) {
      await Item.create(data);
      created += 1;
    } else {
      const staleAdvancementIds = origin.kind === "background"
        ? itemAdvancementIds(exists)
        : [];
      if (exists.getFlag(MODULE_ID, "contentVersion") === CONTENT_VERSION && !staleAdvancementIds.length) continue;

      const updateData = { ...data, system: { ...data.system } };
      if (staleAdvancementIds.length) {
        // Mapping fields merge on update, so an empty advancement object does
        // not remove existing entries. Use Foundry's explicit deletion keys.
        delete updateData.system.advancement;
        for (const id of staleAdvancementIds) updateData[`system.advancement.-=${id}`] = null;
      }
      await exists.update(updateData);
      updated += 1;
    }
  }

  const changed = created + updated;
  const key = changed ? "ChapterTwoInstalled" : "ChapterTwoAlreadyInstalled";
  ui.notifications.info(game.i18n.format(`AK5E.Notifications.${key}`, { count: changed }));
  return { created, updated, skipped: CHAPTER_TWO_ORIGINS.length - changed };
}

function itemAdvancementIds(item) {
  const advancement = item.system?.advancement;
  if (!advancement) return [];
  if (typeof advancement.keys === "function") return Array.from(advancement.keys());
  return Object.keys(advancement);
}

async function ensureItemFolder(name, flag, parent = null) {
  let folder = game.folders.find(entry => entry.type === "Item" && entry.getFlag(MODULE_ID, "originFolder") === flag);
  if (folder) return folder;
  folder = await Folder.create({
    name,
    type: "Item",
    folder: parent?.id ?? null,
    sorting: "a",
    color: "#8f1d1d",
    flags: { [MODULE_ID]: { originFolder: flag } }
  });
  return folder;
}

async function installChapterThreeClasses() {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("AK5E.Notifications.GamemasterOnly"));
    return { created: 0, skipped: CHAPTER_THREE_CLASSES.length };
  }

  const references = CHAPTER_THREE_CLASSES.filter(entry => entry.kind === "reference");
  const summons = CHAPTER_THREE_CLASSES.filter(entry => entry.kind === "class-summon");
  const itemEntries = CHAPTER_THREE_CLASSES.filter(entry => entry.itemType);
  let updated = 0;
  let summonCreated = 0;
  let referenceCreated = 0;
  const journalFolder = await ensureJournalFolder("AK5e: Chapter 3 — Character Classes Reference", "chapterThreeReferences");
  for (const entry of references) {
    const existing = game.journal.find(journal => journal.getFlag(MODULE_ID, "chapterThreeId") === entry.id);
    const data = chapterReferenceData(entry, journalFolder, "chapterThreeId", "03_chapter_3_character_classes.txt");
    if (!existing) {
      await JournalEntry.create(data);
      referenceCreated += 1;
    } else if (existing.getFlag(MODULE_ID, "contentVersion") !== CONTENT_VERSION) {
      await updateJournalContent(existing, data);
      updated += 1;
    }
  }
  const actorRoot = await ensureActorFolder("AK5e: Chapter 3 — Class Summons", "chapterThreeSummons");
  for (const entry of summons) {
    const existing = game.actors.find(actor => actor.getFlag(MODULE_ID, "chapterThreeId") === entry.id);
    const data = summonActorData(entry, actorRoot, "chapterThreeId", "03_chapter_3_character_classes.txt");
    if (!existing) {
      await Actor.create(data);
      summonCreated += 1;
    }
    else if (existing.getFlag(MODULE_ID, "contentVersion") !== CONTENT_VERSION) {
      await existing.update(data);
      updated += 1;
    }
  }

  const root = await ensureItemFolder("AK5e: Chapter 3 — Character Classes", "chapterThreeRoot");
  const folders = new Map();
  for (const [kind, name] of Object.entries({
    class: "Classes",
    subclass: "Branches",
    "class-feature": "Class Features & Options",
    "subclass-feature": "Branch Features & Options",
    "operator-skill": "Operator Skills"
  })) {
    folders.set(kind, await ensureItemFolder(name, `chapterThree-${kind}`, root));
  }
  const optionFolders = new Map();
  for (const [category, name] of Object.entries({
    talent: "Talents", technique: "Brawling Techniques", engagement: "Engagements",
    instruction: "Instructions", ritual: "Rituals", therapy: "Therapies",
    tactic: "Tactics", modification: "Inventor Modifications", upgrade: "Heavy Duty Upgrades"
  })) {
    optionFolders.set(category, await ensureItemFolder(name, `chapterThree-option-${category}`, root));
  }
  const itemFolder = entry => entry.classOption
    ? optionFolders.get(entry.classOption.category) : folders.get(entry.kind);

  const existing = new Set(game.items
    .filter(item => item.getFlag(MODULE_ID, "chapterThreeId"))
    .map(item => item.getFlag(MODULE_ID, "chapterThreeId")));
  const missing = itemEntries.filter(entry => !existing.has(entry.id));
  for (const batch of chunks(missing, 50)) {
    await Item.implementation.createDocuments(batch.map(entry => ({
      name: entry.name,
      type: entry.itemType,
      img: "icons/svg/book.svg",
      folder: itemFolder(entry).id,
      system: {
        ...entry.systemData,
        description: { value: entry.content, chat: "" }
      },
      flags: {
        [MODULE_ID]: classContentFlags(entry, CONTENT_VERSION),
        dnd5e: { sourceBook: "AK5E" }
      }
    })));
  }

  const stale = itemEntries.filter(entry => {
    const item = game.items.find(candidate => candidate.getFlag(MODULE_ID, "chapterThreeId") === entry.id);
    return item && entry.contentVersion && item.getFlag(MODULE_ID, "contentVersion") !== entry.contentVersion;
  });
  const conflicts = [];
  for (const entry of stale) {
    const item = game.items.find(candidate => candidate.getFlag(MODULE_ID, "chapterThreeId") === entry.id);
    const changes = await classContentUpdate(item, entry);
    if (!changes) {
      conflicts.push(item.name);
      continue;
    }
    await item.update(changes);
    updated += 1;
  }
  if (conflicts.length) ui.notifications.warn(game.i18n.format("AK5E.Notifications.ClassContentConflicts", {
    count: conflicts.length, names: conflicts.join(", ")
  }), { permanent: true });

  const created = missing.length + summonCreated + referenceCreated;
  const changed = created + updated;
  const key = changed ? "ChapterThreeInstalled" : "ChapterThreeAlreadyInstalled";
  ui.notifications.info(game.i18n.format(`AK5E.Notifications.${key}`, { count: changed }));
  return { created, updated, skipped: CHAPTER_THREE_CLASSES.length - changed };
}

let rollTableInstallation;

/** Explicit GM action; repeated and overlapping calls preserve existing tables. */
async function installRollTables() {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("AK5E.Notifications.GamemasterOnly"));
    return { created: 0, updated: 0, skipped: AK5E_ROLL_TABLES.length };
  }
  if (rollTableInstallation) return rollTableInstallation;
  rollTableInstallation = createMissingRollTables();
  try { return await rollTableInstallation; }
  finally { rollTableInstallation = undefined; }
}

async function createMissingRollTables() {
  let folder = game.folders.find(entry => entry.type === "RollTable" && entry.getFlag(MODULE_ID, "rollTableFolder"));
  if (!folder) folder = await Folder.implementation.create({
    name: "AK5e: Random Tables", type: "RollTable", sorting: "a", color: "#8f1d1d",
    flags: { [MODULE_ID]: { rollTableFolder: true } }
  });
  const existing = new Set(game.tables.map(table => table.getFlag(MODULE_ID, "rollTableId")));
  const missing = AK5E_ROLL_TABLES.filter(entry => !existing.has(entry.id));
  if (missing.length) await RollTable.implementation.createDocuments(missing.map(entry => ({
    name: entry.name, description: entry.content, img: "icons/svg/d20-grey.svg", folder: folder.id,
    formula: entry.formula, replacement: entry.replacement, displayRoll: entry.displayRoll,
    results: entry.results, ownership: { default: 2 },
    flags: { [MODULE_ID]: {
      rollTableId: entry.id, contentVersion: entry.contentVersion, sourceFile: entry.sourceFile,
      sourceHeading: entry.sourceHeading, sourceLine: entry.sourceLine,
      rawSource: entry.rawSource, ...(entry.rawSources ? { rawSources: entry.rawSources } : {})
    } }
  })), { keepEmbeddedIds: true });
  ui.notifications.info(game.i18n.format("AK5E.Notifications.RollTablesInstalled", { count: missing.length }));
  return { created: missing.length, updated: 0, skipped: AK5E_ROLL_TABLES.length - missing.length };
}

function* chunks(values, size) {
  for (let index = 0; index < values.length; index += size) yield values.slice(index, index + size);
}

async function installChapterFourEquipment() {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("AK5E.Notifications.GamemasterOnly"));
    return { created: 0, skipped: CHAPTER_FOUR_EQUIPMENT.length };
  }

  const references = CHAPTER_FOUR_EQUIPMENT.filter(entry => entry.kind === "reference");
  const itemEntries = CHAPTER_FOUR_EQUIPMENT.filter(entry => entry.kind !== "reference");
  const journalFolder = await ensureJournalFolder("AK5e: Chapter 4 — Equipment Reference", "chapterFourReferences");
  let created = 0;
  let updated = 0;
  for (const entry of references) {
    const exists = game.journal.find(journal => journal.getFlag(MODULE_ID, "chapterFourId") === entry.id);
    const data = chapterReferenceData(entry, journalFolder, "chapterFourId", "04_chapter_4_equipment.txt");
    data.flags[MODULE_ID].equipmentKind = entry.kind;
    if (!exists) {
      await JournalEntry.create(data);
      created += 1;
    } else if (exists.getFlag(MODULE_ID, "contentVersion") !== CONTENT_VERSION) {
      await updateJournalContent(exists, data);
      updated += 1;
    }
  }

  const root = await ensureItemFolder("AK5e: Chapter 4 — Equipment", "chapterFourRoot");
  const folders = new Map();
  for (const [kind, name] of Object.entries({
    weapon: "Weapons",
    equipment: "Armour & Equipment",
    tool: "Toolkits",
    loot: "Adventuring Gear",
    "magic-item": "Magic Items",
    "weapon-property": "Weapon Properties",
    "armour-property": "Armour Properties",
    "tool-rule": "Toolkit Rules",
    "gear-rule": "Gear Rules"
  })) {
    folders.set(kind, await ensureItemFolder(name, `chapterFour-${kind}`, root));
  }

  folders.set("magic-weapon", folders.get("magic-item"));
  const magicReferences = await ensureItemFolder("Magic Item References", "chapterFour-magic-references", root);
  const itemFolder = entry => entry.referenceOnly ? magicReferences : folders.get(entry.kind);
  const itemVersion = entry => entry.contentVersion ?? CONTENT_VERSION;

  const existing = new Set(game.items
    .filter(item => item.getFlag(MODULE_ID, "chapterFourId"))
    .map(item => item.getFlag(MODULE_ID, "chapterFourId")));
  const missing = itemEntries.filter(entry => !existing.has(entry.id));
  for (const batch of chunks(missing, 50)) {
    await Item.implementation.createDocuments(batch.map(entry => ({
      name: entry.name,
      type: entry.itemType,
      img: "icons/svg/book.svg",
      folder: itemFolder(entry).id,
      system: { ...entry.systemData, description: { value: entry.content, chat: "" } },
      flags: {
        [MODULE_ID]: {
          chapterFourId: entry.id,
          equipmentKind: entry.kind,
          sourceHeading: entry.sourceHeading,
          sourceFile: "04_chapter_4_equipment.txt",
          contentVersion: itemVersion(entry),
          tableData: entry.tableData,
          rawSource: entry.rawSource,
          ...(entry.rawSources ? { rawSources: entry.rawSources } : {}),
          ...(entry.enhancement ? { enhancement: entry.enhancement } : {}),
          ...(entry.referenceOnly ? { enhancementReference: true } : {})
        },
        dnd5e: { sourceBook: "AK5E" }
      }
    })));
  }

  const stale = itemEntries.filter(entry => {
    const item = game.items.find(candidate => candidate.getFlag(MODULE_ID, "chapterFourId") === entry.id);
    return item && item.getFlag(MODULE_ID, "contentVersion") !== itemVersion(entry);
  });
  for (const entry of stale) {
    const item = game.items.find(candidate => candidate.getFlag(MODULE_ID, "chapterFourId") === entry.id);
    if (entry.referenceOnly) {
      // Keep existing links, custom names, descriptions, and unrelated fields intact.
      const description = item.system.description?.value ?? "";
      await item.update({
        ...(item.name === entry.previousName ? { name: entry.name } : {}),
        folder: itemFolder(entry).id,
        ...(!description.includes("data-ak5e-enhancement-reference") ? {
          "system.description.value": description + entry.referenceNotice
        } : {}),
        [`flags.${MODULE_ID}.contentVersion`]: itemVersion(entry),
        [`flags.${MODULE_ID}.enhancementReference`]: true
      });
      continue;
    }
    await item.update({
      name: entry.name,
      folder: itemFolder(entry).id,
      system: { ...entry.systemData, description: { value: entry.content, chat: "" } },
      [`flags.${MODULE_ID}.contentVersion`]: itemVersion(entry),
      [`flags.${MODULE_ID}.tableData`]: entry.tableData,
      [`flags.${MODULE_ID}.rawSource`]: entry.rawSource,
      ...(entry.rawSources ? { [`flags.${MODULE_ID}.rawSources`]: entry.rawSources } : {}),
      ...(entry.enhancement ? { [`flags.${MODULE_ID}.enhancement`]: entry.enhancement } : {})
    });
  }
  updated += stale.length;

  created += missing.length;
  const changed = created + updated;
  const key = changed ? "ChapterFourInstalled" : "ChapterFourAlreadyInstalled";
  ui.notifications.info(game.i18n.format(`AK5E.Notifications.${key}`, { count: changed }));
  return { created, updated, skipped: CHAPTER_FOUR_EQUIPMENT.length - changed };
}

async function ensureJournalFolder(name, flag) {
  let folder = game.folders.find(entry => entry.type === "JournalEntry" && entry.getFlag(MODULE_ID, "journalFolder") === flag);
  if (folder) return folder;
  folder = await Folder.create({
    name,
    type: "JournalEntry",
    sorting: "a",
    color: "#8f1d1d",
    flags: { [MODULE_ID]: { journalFolder: flag } }
  });
  return folder;
}

async function ensureActorFolder(name, flag, parent = null) {
  let folder = game.folders.find(entry => entry.type === "Actor" && entry.getFlag(MODULE_ID, "actorFolder") === flag);
  if (folder) return folder;
  folder = await Folder.create({
    name,
    type: "Actor",
    folder: parent?.id ?? null,
    sorting: "a",
    color: "#8f1d1d",
    flags: { [MODULE_ID]: { actorFolder: flag } }
  });
  return folder;
}

function chapterReferenceData(entry, folder, idFlag, sourceFile) {
  return {
    name: entry.name,
    folder: folder.id,
    ownership: { default: 2 },
    flags: {
      [MODULE_ID]: {
        [idFlag]: entry.id,
        contentVersion: CONTENT_VERSION,
        sourceHeading: entry.sourceHeading,
        sourceFile,
        rawSource: entry.rawSource
      }
    },
    pages: [{ name: entry.name, type: "text", text: { content: entry.content, format: 1 } }]
  };
}

async function updateJournalContent(journal, data) {
  await journal.update({ name: data.name, folder: data.folder, flags: data.flags, ownership: data.ownership });
  const pageData = data.pages[0];
  const page = journal.pages.find(candidate => candidate.type === "text") ?? journal.pages.contents?.find(candidate => candidate.type === "text");
  if (page) await page.update({ name: pageData.name, text: pageData.text });
  else await journal.createEmbeddedDocuments("JournalEntryPage", [pageData]);
}

function summonActorData(entry, folder, idFlag, sourceFile) {
  const statblock = entry.statblock;
  const abilityKeys = ["str", "dex", "con", "int", "wis", "cha"];
  const abilities = Object.fromEntries(statblock.abilityScores
    .map((score, index) => [abilityKeys[index], score])
    .filter(([, score]) => score !== null)
    .map(([key, score]) => [key, { value: score }]));
  const maximum = statblock.hitPoints.maximum;
  const armorClass = statblock.armorClass.value;
  return {
    name: entry.name,
    type: "npc",
    img: "icons/svg/mystery-man.svg",
    folder: folder.id,
    system: {
      abilities,
      attributes: {
        ...(armorClass === null ? {} : { ac: { flat: armorClass, calc: "flat" } }),
        movement: statblock.movement,
        senses: sourceSenses(statblock.senses.text),
        ...(maximum === null ? {} : { hp: { value: maximum, max: maximum, formula: statblock.hitPoints.formula } })
      },
      details: {
        biography: { value: entry.content, public: entry.content },
        alignment: statblock.alignment,
        type: { value: statblock.type, custom: statblock.typeCustom, subtype: statblock.subtype, swarm: "" },
        cr: statblock.challenge.value
      },
      traits: {
        ...(statblock.size === null ? {} : { size: statblock.size }),
        dr: customTrait(statblock.defenses.damageResistances, { bypasses: true }),
        di: customTrait(statblock.defenses.damageImmunities, { bypasses: true }),
        dv: customTrait(statblock.defenses.damageVulnerabilities, { bypasses: true }),
        ci: customTrait(statblock.defenses.conditionImmunities),
        languages: customTrait(statblock.languages)
      },
      source: { custom: "AK5e 1st Edition v1.3.1" }
    },
    flags: {
      [MODULE_ID]: {
        [idFlag]: entry.id,
        contentVersion: CONTENT_VERSION,
        contentKind: entry.kind,
        parentOrigin: entry.parent ?? null,
        parentClass: entry.parentClass ?? null,
        parentBranch: entry.parentBranch ?? null,
        sourceHeading: entry.sourceHeading,
        sourceFile,
        sourceStatblock: statblock,
        rawSource: entry.rawSource
      },
      dnd5e: { sourceBook: "AK5E" }
    }
  };
}

function sourceSenses(text = "") {
  const ranges = {};
  for (const [label, key] of [["darkvision", "darkvision"], ["blindsight", "blindsight"], ["tremorsense", "tremorsense"], ["truesight", "truesight"]]) {
    const value = text.match(new RegExp(`${label}\\s+(\\d+)`, "i"))?.[1];
    if (value) ranges[key] = Number(value);
  }
  return { ranges, units: "ft", special: text };
}

async function installChapterFiveArts() {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("AK5E.Notifications.GamemasterOnly"));
    return { created: 0, skipped: CHAPTER_FIVE_ARTS.length };
  }

  const references = CHAPTER_FIVE_ARTS.filter(entry => entry.kind === "reference");
  const itemEntries = CHAPTER_FIVE_ARTS.filter(entry => entry.kind !== "reference");
  const journalFolder = await ensureJournalFolder("AK5e: Chapter 5 — Arts Reference", "chapterFiveReferences");
  let created = 0;
  let updated = 0;
  for (const entry of references) {
    const exists = game.journal.find(journal => journal.getFlag(MODULE_ID, "chapterFiveId") === entry.id);
    const data = chapterReferenceData(entry, journalFolder, "chapterFiveId", "05_chapter_5_arts.txt");
    data.flags[MODULE_ID].artsKind = entry.kind;
    if (!exists) {
      await JournalEntry.create(data);
      created += 1;
    } else if (exists.getFlag(MODULE_ID, "contentVersion") !== CONTENT_VERSION) {
      await updateJournalContent(exists, data);
      updated += 1;
    }
  }

  const root = await ensureItemFolder("AK5e: Chapter 5 — Arts", "chapterFiveRoot");
  const folders = new Map();
  for (const [kind, name] of Object.entries({
    art: "Arts",
    "standard-art-pool": "Standard Arts Pools",
    "special-art-pool": "Special Arts Pools"
  })) {
    folders.set(kind, await ensureItemFolder(name, `chapterFive-${kind}`, root));
  }

  const existing = new Set(game.items
    .filter(item => item.getFlag(MODULE_ID, "chapterFiveId"))
    .map(item => item.getFlag(MODULE_ID, "chapterFiveId")));
  const missing = itemEntries.filter(entry => !existing.has(entry.id));
  for (const batch of chunks(missing, 50)) {
    await Item.createDocuments(batch.map(entry => ({
      name: entry.name,
      type: entry.itemType,
      img: "icons/svg/book.svg",
      folder: folders.get(entry.kind).id,
      system: {
        description: { value: entry.content, chat: "" },
        ...(entry.kind === "art" ? {
          level: entry.level ?? 0,
          school: dnd5eSchool(entry.school),
          ...entry.spellData,
          method: "spell",
          prepared: 2
        } : {})
      },
      flags: {
        [MODULE_ID]: {
          chapterFiveId: entry.id,
          artsKind: entry.kind,
          sourceHeading: entry.sourceHeading,
          sourceFile: "05_chapter_5_arts.txt",
          contentVersion: CONTENT_VERSION,
          artLevel: entry.level,
          artSchool: entry.school,
          castingMetadata: entry.castingMetadata,
          rawSource: entry.rawSource
        },
        dnd5e: { sourceBook: "AK5E" }
      }
    })));
  }

  const stale = itemEntries.filter(entry => {
    const item = game.items.find(candidate => candidate.getFlag(MODULE_ID, "chapterFiveId") === entry.id);
    return item && item.getFlag(MODULE_ID, "contentVersion") !== CONTENT_VERSION;
  });
  for (const entry of stale) {
    const item = game.items.find(candidate => candidate.getFlag(MODULE_ID, "chapterFiveId") === entry.id);
    await item.update({
      name: entry.name,
      folder: folders.get(entry.kind).id,
      system: {
        description: { value: entry.content, chat: "" },
        ...(entry.kind === "art" ? {
          level: entry.level ?? 0,
          school: dnd5eSchool(entry.school),
          ...entry.spellData,
          method: "spell",
          prepared: 2
        } : {})
      },
      [`flags.${MODULE_ID}.contentVersion`]: CONTENT_VERSION,
      [`flags.${MODULE_ID}.castingMetadata`]: entry.castingMetadata,
      [`flags.${MODULE_ID}.rawSource`]: entry.rawSource
    });
  }
  updated += stale.length;

  created += missing.length;
  const changed = created + updated;
  const key = changed ? "ChapterFiveInstalled" : "ChapterFiveAlreadyInstalled";
  ui.notifications.info(game.i18n.format(`AK5E.Notifications.${key}`, { count: changed }));
  return { created, updated, skipped: CHAPTER_FIVE_ARTS.length - changed };
}

async function installChapterSixCreatures() {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("AK5E.Notifications.GamemasterOnly"));
    return { created: 0, skipped: CHAPTER_SIX_CREATURES.length };
  }

  const references = CHAPTER_SIX_CREATURES.filter(entry => entry.kind === "reference");
  const creatures = CHAPTER_SIX_CREATURES.filter(entry => entry.kind === "creature");
  const journalFolder = await ensureJournalFolder("AK5e: Chapter 6 — Dwellers of Terra Reference", "chapterSixReferences");
  let created = 0;
  let updated = 0;
  for (const entry of references) {
    const exists = game.journal.find(journal => journal.getFlag(MODULE_ID, "chapterSixId") === entry.id);
    const data = chapterReferenceData(entry, journalFolder, "chapterSixId", "06_chapter_6_dwellers_of_terra.txt");
    data.flags[MODULE_ID].dwellerKind = entry.kind;
    if (!exists) {
      await JournalEntry.create(data);
      created += 1;
    } else if (exists.getFlag(MODULE_ID, "contentVersion") !== CONTENT_VERSION) {
      await updateJournalContent(exists, data);
      updated += 1;
    }
  }

  const root = await ensureActorFolder("AK5e: Chapter 6 — Dwellers of Terra", "chapterSixRoot");
  const folders = new Map();
  for (const faction of [...new Set(creatures.map(entry => entry.faction))]) {
    folders.set(faction, await ensureActorFolder(faction, `chapterSix-${slugify(faction)}`, root));
  }

  const existing = new Set(game.actors
    .filter(actor => actor.getFlag(MODULE_ID, "chapterSixId"))
    .map(actor => actor.getFlag(MODULE_ID, "chapterSixId")));
  const missing = creatures.filter(entry => !existing.has(entry.id));
  for (const batch of chunks(missing, 25)) {
    await Actor.createDocuments(batch.map(entry => chapterSixActorData(entry, folders.get(entry.faction))));
  }

  const stale = creatures.filter(entry => {
    const actor = game.actors.find(candidate => candidate.getFlag(MODULE_ID, "chapterSixId") === entry.id);
    return actor && actor.getFlag(MODULE_ID, "contentVersion") !== CONTENT_VERSION;
  });
  for (const entry of stale) {
    const actor = game.actors.find(candidate => candidate.getFlag(MODULE_ID, "chapterSixId") === entry.id);
    const data = chapterSixActorData(entry, folders.get(entry.faction));
    const items = data.items;
    delete data.items;
    await actor.update(data);
    const managed = actor.items.filter(item => item.getFlag(MODULE_ID, "npcFeature"));
    if (managed.length) await actor.deleteEmbeddedDocuments("Item", managed.map(item => item.id));
    if (items.length) await actor.createEmbeddedDocuments("Item", items);
  }
  updated += stale.length;

  created += missing.length;
  const changed = created + updated;
  const key = changed ? "ChapterSixInstalled" : "ChapterSixAlreadyInstalled";
  ui.notifications.info(game.i18n.format(`AK5E.Notifications.${key}`, { count: changed }));
  return { created, updated, skipped: CHAPTER_SIX_CREATURES.length - changed };
}

function chapterSixActorData(entry, folder) {
  const statblock = entry.statblock;
  const [str, dex, con, int, wis, cha] = statblock.abilityScores;
  const hitPoints = statblock.hitPoints.maximum === null ? {} : {
    hp: {
      value: statblock.hitPoints.maximum,
      max: statblock.hitPoints.maximum,
      formula: statblock.hitPoints.formula
    }
  };
  return {
    name: entry.name,
    type: "npc",
    img: "icons/svg/mystery-man.svg",
    folder: folder.id,
    system: {
      abilities: {
        str: { value: str }, dex: { value: dex }, con: { value: con },
        int: { value: int }, wis: { value: wis }, cha: { value: cha }
      },
      attributes: {
        ac: { flat: statblock.armorClass.value, calc: "flat" },
        movement: statblock.movement,
        senses: sourceSenses(statblock.senses.text),
        ...hitPoints
      },
      details: {
        biography: { value: entry.content, public: entry.content },
        alignment: statblock.alignment,
        type: { value: statblock.type, custom: statblock.typeCustom, subtype: statblock.subtype, swarm: "" },
        cr: statblock.challenge.value
      },
      traits: {
        size: statblock.size,
        dr: customTrait(statblock.defenses.damageResistances, { bypasses: true }),
        di: customTrait(statblock.defenses.damageImmunities, { bypasses: true }),
        dv: customTrait(statblock.defenses.damageVulnerabilities, { bypasses: true }),
        ci: customTrait(statblock.defenses.conditionImmunities),
        languages: customTrait(statblock.languages)
      },
      source: { custom: "AK5e 1st Edition v1.3.1" }
    },
    items: entry.features.map((feature, index) => ({
      name: feature.name,
      type: "feat",
      img: "icons/svg/sword.svg",
      system: { description: { value: feature.content, chat: "" } },
      flags: { [MODULE_ID]: { npcFeature: true, section: feature.section, sourceIndex: index } }
    })),
    flags: {
      [MODULE_ID]: {
        chapterSixId: entry.id,
        contentVersion: CONTENT_VERSION,
        dwellerKind: entry.kind,
        faction: entry.faction,
        category: entry.category,
        sourceHeading: entry.sourceHeading,
        sourceFile: "06_chapter_6_dwellers_of_terra.txt",
        sourceStatblock: entry.statblock,
        continuationCount: entry.continuationCount,
        rawSource: entry.rawSource
      },
      dnd5e: { sourceBook: "AK5E" }
    }
  };
}

function customTrait(custom = "", { bypasses = false } = {}) {
  return { value: [], ...(bypasses ? { bypasses: [] } : {}), custom };
}

function slugify(value) {
  return String(value).toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function dnd5eSchool(school) {
  const schools = {
    abjuration: "abj",
    conjuration: "con",
    divination: "div",
    enchantment: "enc",
    evocation: "evo",
    illusion: "ill",
    necromancy: "nec",
    transmutation: "trs"
  };
  return schools[school] ?? "";
}
