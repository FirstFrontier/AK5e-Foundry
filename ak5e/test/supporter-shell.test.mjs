import test from "node:test";
import assert from "node:assert/strict";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import {
  registerSupporterBranchModule, initSupporterBranches, supporterBranchApis,
  supporterBranchFeatureIds, SUPPORTER_BRANCH_MODULES
} from "../scripts/supporter-branches.mjs";
import {
  SUPPORTER_TALENT_IDS, SUPPORTER_TALENT_RULES, SUPPORTER_TALENT_PLANS, defineSupporterTalentPools,
  supporterTalentEffects, supporterTalentManualCard, supporterTalentCounts, registerSupporterTalentPlans
} from "../scripts/supporter-talents.mjs";
import { previewSupporterSetup } from "../scripts/supporter-setup.mjs";
import {
  previewSupporterProgression, applySupporterProgression, inspectSupporterFields
} from "../scripts/supporter-progression.mjs";
import { supporterActions, supporterAidDieView, supporterTalentActions, supporterPanelHtml } from "../scripts/supporter-sheet.mjs";
import { defineSupporterPools } from "../scripts/supporter-features.mjs";
import { recipientCandidates, aidAbilityWarningHtml } from "../scripts/supporter-sheet.mjs";
import { revertArtItems } from "../scripts/supporter-arts.mjs";
import { hasAidAbilityChoice } from "../scripts/supporter-rules.mjs";
import { getPool, getPoolDefinition } from "../scripts/resource-pools.mjs";
import { SUPPORTER_CLASS_ID } from "../scripts/supporter-rules.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

const bardFeatureIds = CHAPTER_THREE_CLASSES
  .filter(e => e.kind === "subclass-feature" && e.parentClass === "Supporter" && e.parentBranch === "Bard" && Number.isInteger(e.level))
  .map(e => e.id);

function createSupporterActor(level = 1, { items = [], flags = {} } = {}) {
  const sClass = createTestItem({
    name: "Supporter",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } }
  });
  return createTestActor({
    items: [sClass, ...items],
    flags: { ak5e: { supporter: { enabled: true, aidAbility: "cha" }, ...(flags.ak5e ?? {}) } },
    system: {
      attributes: { hp: { value: 8, max: 8, temp: 0 }, prof: Math.floor((level - 1) / 4) + 2 },
      abilities: {
        str: { value: 10, mod: 0 }, dex: { value: 14, mod: 2 }, con: { value: 14, mod: 2 },
        int: { value: 12, mod: 1 }, wis: { value: 12, mod: 1 }, cha: { value: 16, mod: 3 }
      },
      traits: { saves: { value: [] }, armorProf: { value: [] }, weaponProf: { value: [], custom: "" }, toolProf: { value: [] } },
      skills: { arc: { value: 0 }, ak5elore: { value: 0 }, ak5etech: { value: 0 }, ins: { value: 0 }, dec: { value: 0 }, per: { value: 0 } },
      currency: { cp: 0 }
    }
  });
}

const baseChoices = {
  saves: ["con", "wis"],
  skills: ["ak5etech", "ins", "dec"],
  aidAbility: "cha",
  startingEquipment: { mode: "cash" }
};

test("registerSupporterBranchModule: registers a frozen definition and rejects duplicates and malformed input", () => {
  const def = registerSupporterBranchModule({ id: "shell-test-alpha", branch: "shelltestalpha", api: { ping: () => "a" } });
  assert.equal(SUPPORTER_BRANCH_MODULES.get("shelltestalpha"), def);
  assert.ok(Object.isFrozen(def));
  assert.equal(supporterBranchApis().shelltestalpha.ping(), "a");

  assert.throws(() => registerSupporterBranchModule({ id: "shell-test-alpha-2", branch: "shelltestalpha" }), /already registered/);
  assert.throws(() => registerSupporterBranchModule({ branch: "shelltestnoid" }), /needs an id/);
  assert.throws(() => registerSupporterBranchModule({ id: "x", branch: "Bad Key" }), /lowercase branch key/);
  assert.throws(() => registerSupporterBranchModule(null), /definition object/);
});

test("initSupporterBranches: runs each branch's pools() and hooks() once across repeated calls", () => {
  let poolCalls = 0, hookCalls = 0;
  registerSupporterBranchModule({
    id: "shell-test-beta",
    branch: "shelltestbeta",
    pools: () => { poolCalls += 1; },
    hooks: () => { hookCalls += 1; }
  });
  initSupporterBranches();
  initSupporterBranches();
  assert.equal(poolCalls, 1);
  assert.equal(hookCalls, 1);
});

test("supporterBranchFeatureIds: scans Bard subclass features by level, and a declared map takes precedence", () => {
  assert.equal(bardFeatureIds.length, 6);
  assert.equal(supporterBranchFeatureIds("bard", 1).length, 2);
  assert.equal(supporterBranchFeatureIds("bard", 4).length, 3);
  assert.equal(supporterBranchFeatureIds("bard", 20).length, 6);

  registerSupporterBranchModule({
    id: "shell-test-gamma",
    branch: "shelltestgamma",
    progressionFeatures: { 1: [bardFeatureIds[0]] }
  });
  assert.deepEqual(supporterBranchFeatureIds("shelltestgamma", 20), [bardFeatureIds[0]]);
});

test("talents: all 28 Supporter talents have a rule, split 12 Basic / 16 Advanced into AE, plan and manual modes", () => {
  const talentRecords = CHAPTER_THREE_CLASSES.filter(e => e.kind === "class-option" && e.parentClass === "Supporter" && e.classOption?.category === "talent");
  assert.equal(talentRecords.length, 28);
  assert.equal(talentRecords.filter(e => e.classOption.tier === "Basic").length, 12);
  assert.equal(talentRecords.filter(e => e.classOption.tier === "Advanced").length, 16);
  for (const record of talentRecords) assert.ok(SUPPORTER_TALENT_RULES[record.id], `missing rule for ${record.id}`);
  assert.deepEqual(supporterTalentCounts(), { ae: 3, plan: 7, manual: 18 });
});

test("talents: flat base numbers are Active Effects; conditional or cross-class talents are manual cards with source text", () => {
  const alacrity = supporterTalentEffects(SUPPORTER_TALENT_IDS.alacrity);
  assert.equal(alacrity.length, 1);
  assert.deepEqual(alacrity[0].changes.map(c => [c.key, c.value]), [["system.attributes.movement.walk", "10"]]);
  assert.equal(alacrity[0].transfer, true);
  assert.deepEqual(supporterTalentEffects(SUPPORTER_TALENT_IDS.lucky), []);

  const borrow = supporterTalentManualCard(SUPPORTER_TALENT_IDS.antiArtsTraining);
  assert.equal(borrow.ruling, "R11");
  assert.match(borrow.effect, /Anti-Arts Training/);
  assert.equal(supporterTalentManualCard(SUPPORTER_TALENT_IDS.hunter).ruling, null);
});

test("talent plans: Lucky spends a pool point, warns when empty, and clamps at zero", async () => {
  const luckyItem = createTestItem({ name: "Lucky", type: "feat", flags: { ak5e: { chapterThreeId: SUPPORTER_TALENT_IDS.lucky } } });
  const actor = createSupporterActor(3, { items: [luckyItem] });
  defineSupporterPools();
  defineSupporterTalentPools();
  assert.ok(getPoolDefinition("supporterLuckBase"));

  const plan = SUPPORTER_TALENT_PLANS.lucky(actor, {}, {});
  assert.equal(plan.warnings.length, 0);
  const receipt = { id: "r-lucky" };
  const update = plan.apply({}, receipt);
  assert.deepEqual(update, { "flags.ak5e.resourcePools.supporterLuckBase.value": 1 });
  assert.equal(receipt.resources[0].before, 2);
  assert.equal(receipt.resources[0].after, 1);

  actor.flags.ak5e.resourcePools = { supporterLuckBase: { value: 0 } };
  const empty = SUPPORTER_TALENT_PLANS.lucky(actor, {}, {});
  assert.ok(empty.warnings.some(w => w.id === "shortfall"));
  const clamped = { id: "r-empty" };
  empty.apply({}, clamped);
  assert.equal(clamped.resources[0].after, 0);
  assert.match(clamped.shortfalls[0], /short by 1/);
});

test("talent plans: a Mirror Move use sets a damage formula for the owner's roll button, not an automatic roll", () => {
  const mirror = createTestItem({ name: "Mirror Move", type: "feat", flags: { ak5e: { chapterThreeId: SUPPORTER_TALENT_IDS.mirrorMove } } });
  const actor = createSupporterActor(5, { items: [mirror] });
  defineSupporterPools();
  defineSupporterTalentPools();
  const plan = SUPPORTER_TALENT_PLANS.mirrorMove(actor, {}, { distance: 40 });
  assert.ok(plan.warnings.some(w => w.id === "range"));
  const receipt = { id: "r-mirror" };
  plan.apply({}, receipt);
  assert.equal(receipt.formula, "2d8");
  assert.equal(receipt.reaction.requested, true);
});

test("Light Melee proficiency is recorded as custom weapon text, not the simple-weapon value", async () => {
  const actor = createSupporterActor(1);
  const preview = await previewSupporterProgression(actor, baseChoices);
  assert.equal(preview.writes["system.traits.weaponProf.custom"], "Light Melee");
  assert.equal(preview.writes["system.traits.weaponProf.value"], undefined);
});

test("Module upgrade at Level 8 writes flags.ak5e.supporterTalent.modules for the upgraded Basic Talent", async () => {
  const actor = createSupporterActor(8);
  const choices = {
    ...baseChoices,
    branch: "subclass-supporter-bard",
    talents: { basic: SUPPORTER_TALENT_IDS.alacrity, basicModule: "upgrade" }
  };
  const preview = await previewSupporterProgression(actor, choices);
  assert.equal(preview.writes[`flags.ak5e.supporterTalent.modules.${SUPPORTER_TALENT_IDS.alacrity}`], true);

  await applySupporterProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices });
  assert.equal(actor.flags.ak5e.supporterTalent.modules[SUPPORTER_TALENT_IDS.alacrity], true);
});

test("Duplicate talent: the Level 8 talent may not repeat the Level 3 talent; the duplicate is warned and not granted", async () => {
  const actor = createSupporterActor(8);
  const choices = {
    ...baseChoices,
    branch: "subclass-supporter-bard",
    talents: { basic: SUPPORTER_TALENT_IDS.alert, basicModule: SUPPORTER_TALENT_IDS.alert }
  };
  const preview = await previewSupporterProgression(actor, choices);
  assert.ok(preview.warnings.some(w => /must differ/.test(w)));
  const alertGrants = preview.createItems.filter(i => i.flags?.ak5e?.chapterThreeId === SUPPORTER_TALENT_IDS.alert);
  assert.equal(alertGrants.length, 1);

  const fields = inspectSupporterFields(actor, { talents: { basic: SUPPORTER_TALENT_IDS.alert } });
  const moduleField = fields.find(f => f.key === "talents.basicModule");
  assert.ok(!moduleField.options.some(o => o.value === SUPPORTER_TALENT_IDS.alert));
});

test("Branch features: a Bard at Level 4 receives the Level 1 and Level 4 subclass features once each", async () => {
  const actor = createSupporterActor(4);
  const choices = { ...baseChoices, branch: "subclass-supporter-bard" };
  const preview = await previewSupporterProgression(actor, choices);
  const bardFeatures = preview.createItems.filter(i => bardFeatureIds.includes(i.flags?.ak5e?.chapterThreeId));
  assert.equal(bardFeatures.length, 3);
  assert.equal(new Set(bardFeatures.map(i => i.flags.ak5e.chapterThreeId)).size, 3);
});

test("Operator Skills are not duplicated: progression offers no Operator Skill fields or items (operator-progression.mjs owns them)", async () => {
  const actor = createSupporterActor(14);
  const keys = inspectSupporterFields(actor).map(f => f.key);
  assert.ok(!keys.some(key => key.startsWith("operatorSkills.")));
  const preview = await previewSupporterProgression(actor, {
    ...baseChoices, branch: "subclass-supporter-bard",
    operatorSkills: { basic: "operator-skill-supporter-basic-artseeker" }
  });
  assert.ok(!preview.createItems.some(i => String(i.flags?.ak5e?.chapterThreeId ?? "").startsWith("operator-skill-")));
});

test("Setup stores the Aid Die ability and branch on the Actor's flags", async () => {
  const actor = createSupporterActor(3);
  const preview = await previewSupporterSetup(actor, { aidAbility: "int", branch: "bard" });
  assert.equal(preview.actorUpdates["flags.ak5e.supporter.aidAbility"], "int");
  assert.equal(preview.actorUpdates["flags.ak5e.supporter.branch"], "bard");

  const defaults = await previewSupporterSetup(actor);
  assert.equal(defaults.actorUpdates["flags.ak5e.supporter.aidAbility"], "cha");
  assert.equal(defaults.actorUpdates["flags.ak5e.supporter.branch"], undefined);
});

test("Sheet helpers: actions are level-gated, the Aid Die view reports the pool, and talent buttons follow mode", () => {
  defineSupporterPools();
  const low = createSupporterActor(5);
  assert.deepEqual(supporterActions(low).map(a => a.cmd), ["provideAid", "useAidDie"]);
  const mid = createSupporterActor(11);
  assert.ok(supporterActions(mid).some(a => a.cmd === "lightenTheLoad"));
  assert.ok(!supporterActions(mid).some(a => a.cmd === "selfSupportiveDie"));
  const high = createSupporterActor(18);
  assert.ok(supporterActions(high).some(a => a.cmd === "selfSupportiveDie"));

  const view = supporterAidDieView(createSupporterActor(7));
  assert.equal(view.size, "d10");
  assert.equal(view.max, getPool(createSupporterActor(7), "aidDie").max);

  const manualItem = createTestItem({ name: "Anti-Arts Training", type: "feat", flags: { ak5e: { chapterThreeId: SUPPORTER_TALENT_IDS.antiArtsTraining } } });
  const planItem = createTestItem({ name: "Accelerando", type: "feat", flags: { ak5e: { chapterThreeId: SUPPORTER_TALENT_IDS.accelerando } } });
  const talentActor = createSupporterActor(9, { items: [manualItem, planItem] });
  const cmds = supporterTalentActions(talentActor).map(a => a.cmd);
  assert.ok(cmds.includes("accelerando"));
  assert.ok(cmds.includes(`manual:${SUPPORTER_TALENT_IDS.antiArtsTraining}`));
});

test("Talent definitions: defineSupporterTalentPools is idempotent and pool variants follow the Module flag", () => {
  defineSupporterTalentPools();
  defineSupporterTalentPools();
  const base = getPoolDefinition("supporterLuckBase");
  const module = getPoolDefinition("supporterLuckModule");
  assert.ok(base && module);
  const luck = createTestItem({ name: "Lucky", type: "feat", flags: { ak5e: { chapterThreeId: SUPPORTER_TALENT_IDS.lucky } } });
  const plain = createSupporterActor(6, { items: [luck] });
  assert.equal(base.appliesTo(plain), true);
  assert.equal(module.appliesTo(plain), false);
  const upgraded = createSupporterActor(6, {
    items: [luck],
    flags: { ak5e: { supporterTalent: { modules: { [SUPPORTER_TALENT_IDS.lucky]: true } } } }
  });
  assert.equal(base.appliesTo(upgraded), false);
  assert.equal(module.appliesTo(upgraded), true);
});

test("Setup and progression keep the Supporter class identifier and create no branch items at Level 1 without a branch", async () => {
  const actor = createSupporterActor(1);
  const preview = await previewSupporterProgression(actor, { ...baseChoices, startingEquipment: { mode: "cash" } });
  assert.ok(!preview.createItems.some(i => i.type === "subclass"));
  assert.equal(preview.writes["flags.ak5e.supporter.branch"], undefined);
});

test("talent plans register through the U1 contract guard: the call is safe whether or not the contract exists", () => {
  const registered = registerSupporterTalentPlans();
  assert.equal(typeof registered, "boolean");
  assert.equal(Object.keys(SUPPORTER_TALENT_PLANS).length, 7);
});

test("supporterPanelHtml: empty string for a non-character and for a non-Supporter", () => {
  const plain = createTestActor({ type: "character", items: [] });
  assert.equal(supporterPanelHtml(plain), "");
  const npc = createSupporterActor(5);
  npc.type = "npc";
  assert.equal(supporterPanelHtml(npc), "");
});

test("supporterPanelHtml: Aid Die value, max and die size; owner sees action and talent buttons with stable commands", () => {
  defineSupporterPools();
  const lucky = createTestItem({ name: "Lucky", type: "feat", flags: { ak5e: { chapterThreeId: SUPPORTER_TALENT_IDS.lucky } } });
  const html = supporterPanelHtml(createSupporterActor(11, { items: [lucky] }));
  assert.match(html, /Aid Dice: \d+ \/ \d+ · d10/);
  assert.match(html, /Lighten the Load/);
  assert.doesNotMatch(html, /Self-Supportive/);
  assert.match(html, /data-supporter-cmd="provideAid"/);
  assert.match(html, /data-supporter-cmd="lucky"/);
  assert.match(html, /data-supporter-cmd="undo"/);
  assert.match(html, /data-supporter-cmd="__open"/);
  assert.match(html, /Branch: None/);
});

test("supporterPanelHtml: R1 warning row appears at a 0 Aid Dice maximum", () => {
  defineSupporterPools();
  const actor = createSupporterActor(5);
  actor.system.abilities.cha.mod = -1;
  assert.match(supporterPanelHtml(actor), /0 Aid Dice — GM resolves/);
  assert.doesNotMatch(supporterPanelHtml(createSupporterActor(5)), /GM resolves/);
});

test("supporterPanelHtml: level gates for Lighten the Load and Self-Supportive; branch name and registered slot", () => {
  defineSupporterPools();
  assert.doesNotMatch(supporterPanelHtml(createSupporterActor(5)), /Lighten the Load/);
  assert.match(supporterPanelHtml(createSupporterActor(18)), /Self-Supportive Die/);

  registerSupporterBranchModule({
    id: "shell-test-bard-panel",
    branch: "bard",
    sheetPanel: () => '<p class="shell-bard-slot">BARD SLOT</p>'
  });
  const subclass = createTestItem({ name: "Supporter: Bard", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-bard" } } });
  const html = supporterPanelHtml(createSupporterActor(4, { items: [subclass] }));
  assert.match(html, /Branch: Bard/);
  assert.match(html, /class="shell-bard-slot"/);
});

test("talent grants record flags.ak5e.supporterTalent mode, and the R11 ruling only on borrows", async () => {
  const actor = createSupporterActor(9);
  const choices = {
    ...baseChoices,
    branch: "subclass-supporter-bard",
    talents: { basic: SUPPORTER_TALENT_IDS.alert, advanced: SUPPORTER_TALENT_IDS.antiArtsTraining }
  };
  const preview = await previewSupporterProgression(actor, choices);
  const grant = id => preview.createItems.find(i => i.flags?.ak5e?.chapterThreeId === id);

  const alert = grant(SUPPORTER_TALENT_IDS.alert);
  assert.equal(alert.flags.ak5e.supporterTalent.mode, "ae");
  assert.equal(alert.flags.ak5e.supporterTalent.sourceId, SUPPORTER_TALENT_IDS.alert);
  assert.equal(alert.flags.ak5e.supporterTalent.tier, "basic");
  assert.equal(alert.flags.ak5e.supporterTalent.ruling, undefined);
  assert.equal(alert.effects.length, 1);

  const borrow = grant(SUPPORTER_TALENT_IDS.antiArtsTraining);
  assert.equal(borrow.flags.ak5e.supporterTalent.mode, "manual");
  assert.equal(borrow.flags.ak5e.supporterTalent.ruling, "R11");

  const plan = await previewSupporterProgression(createSupporterActor(3), { ...baseChoices, talents: { basic: SUPPORTER_TALENT_IDS.lucky } });
  assert.equal(plan.createItems.find(i => i.flags?.ak5e?.chapterThreeId === SUPPORTER_TALENT_IDS.lucky).flags.ak5e.supporterTalent.mode, "plan");
});

/* ---- r1-base rulings F-R4, F-R5 (warning), F-R8 (keepId, branch collision) ---- */

test("F-R4: recipients include every visible actor and targeted unlinked token actors, never the giver or compendium Actors", () => {
  const giver = { uuid: "Actor.giver", name: "Giver" };
  const npc = { uuid: "Actor.npc", name: "NPC", type: "npc" };
  const automaton = { uuid: "Actor.auto", name: "Automaton", type: "npc" };
  const hidden = { uuid: "Actor.hidden", name: "Hidden", type: "character" };
  const packed = { uuid: "Compendium.x.Actor.y", name: "Packed", pack: "x" };
  const unlinked = { uuid: "Scene.s.Token.t.Actor.u", name: "Unlinked", type: "npc" };
  const list = recipientCandidates(giver, {
    actors: [giver, npc, automaton, hidden, packed],
    targetActors: [unlinked, npc],
    canSee: candidate => candidate !== hidden
  });
  assert.deepEqual(list.map(c => c.uuid), ["Actor.npc", "Actor.auto", "Scene.s.Token.t.Actor.u"]);
});

test("F-R5: the aid warning names the ability in use when no choice is stored, and offers the choice", () => {
  const noFlag = { name: "Sup", system: { abilities: { int: { mod: 1 }, wis: { mod: 2 }, cha: { mod: 3 } } }, flags: {} };
  const html = aidAbilityWarningHtml(noFlag, true);
  assert.match(html, /Aid ability not chosen — using CHA/);
  assert.match(html, /data-supporter-cmd="__aidAbility"/);
  const withFlag = { ...noFlag, flags: { ak5e: { supporter: { aidAbility: "int" } } } };
  assert.equal(hasAidAbilityChoice(withFlag), true);
  assert.equal(hasAidAbilityChoice(noFlag), false);
  assert.match(aidAbilityWarningHtml({ ...noFlag, system: { abilities: { int: { mod: 4 }, wis: { mod: 0 }, cha: { mod: 1 } } } }, false), /using INT/);
});

test("F-R8: revertArtItems restores removed Arts with keepId, so the ids are the same", async () => {
  const calls = [];
  const actor = {
    items: new Map(),
    async createEmbeddedDocuments(type, data, options) { calls.push({ type, data, options }); return data; },
    async deleteEmbeddedDocuments() { return []; }
  };
  await revertArtItems(actor, { removed: [{ _id: "artId123", name: "Old Art", type: "feat" }], createdIds: [] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options?.keepId, true);
  assert.equal(calls[0].data[0]._id, "artId123");
});

test("F-R8: a branch whose plan name collides leaves nothing registered", () => {
  assert.throws(() => registerSupporterBranchModule({ id: "collide-test", branch: "collidetest", plans: { provideAid() {} } }));
  assert.equal(SUPPORTER_BRANCH_MODULES.has("collidetest"), false, "no half-registered branch entry");
});
