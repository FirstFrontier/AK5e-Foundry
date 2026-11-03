/**
 * U2 adversarial challenge suite: Supporter base shell, progression, talents, sheet.
 *
 * Written by the challenger against the contract in the U2 brief. Behaviour-level only.
 * Modules that do not exist yet are loaded with dynamic import() inside each test, so a
 * missing module fails only the tests that need it. Namespace imports are used for
 * modules whose exports may not exist yet, so a missing named export cannot abort the file.
 *
 * Source (authority): AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt
 *   Supporter Features table         L6557-6578
 *   Hit Points / Proficiencies       L6594-6604
 *   1st Branch / Provide Aid         L6623-6639
 *   2nd / 3rd / 7th / 9th            L6643, L6646-6647, L6664, L6667-6668
 *   ASI levels                       L6650
 *   11th / 14th / 15th / 18th / 20th L6673, L6676, L6679-6692
 *   Basic Talents                    L6809-6823
 *   Advanced Talents                 L6833-6851
 * Head rulings: ak5e/DECISIONS.md "Supporter Class and Artificer / Bard / Hexer Branches" (rulings 1, 2, 11).
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as uses from "../scripts/supporter-uses.mjs";
import * as rules from "../scripts/supporter-rules.mjs";
import {
  previewSupporterProgression, applySupporterProgression, inspectSupporterFields
} from "../scripts/supporter-progression.mjs";
import { getPool } from "../scripts/resource-pools.mjs";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import { defineSupporterPools } from "../scripts/supporter-features.mjs";
import { defineSupporterTalentPools } from "../scripts/supporter-talents.mjs";

const { SUPPORTER_CLASS_ID, SUPPORTER_ARMOR_PROFS, SUPPORTER_WEAPON_PROFS, pbForLevel } = rules;

/* ------------------------------------------------------------------ fixtures */

const BRANCHES = [
  { key: "artificer", name: "Artificer", id: "subclass-supporter-artificer" },
  { key: "bard", name: "Bard", id: "subclass-supporter-bard" },
  { key: "hexer", name: "Hexer", id: "subclass-supporter-hexer" }
];

// Source L6557-6578 gives the level grid; branch features come at 1 (x2), 4, 10, 13, 17 (L6623).
// Expected cumulative count of leveled branch features at actor level L.
const EXPECTED_BRANCH_FEATURES = { 1: 2, 3: 2, 4: 3, 7: 3, 8: 3, 9: 3, 10: 4, 13: 5, 14: 5, 17: 6 };
// Basic Talent at 3rd and again at 8th (L6646-6647); Advanced Talent at 9th and 13th (L6667-6668).
const EXPECTED_BASIC_TALENT_SLOTS = { 1: 0, 3: 1, 4: 1, 7: 1, 8: 2, 9: 2, 10: 2, 13: 2, 14: 2, 17: 2 };
const EXPECTED_ADVANCED_TALENT_SLOTS = { 1: 0, 3: 0, 4: 0, 7: 0, 8: 0, 9: 1, 10: 1, 13: 2, 14: 2, 17: 2 };
const LEVELS = Object.keys(EXPECTED_BRANCH_FEATURES).map(Number);

// Basic Supporter Talents, L6809-6823 (names exactly as printed). 12 entries.
const SOURCE_BASIC_TALENTS = [
  "Alacrity", "Alert", "Back-to-Back", "Blessing of Safety", "Hunter (X)", "Lucky",
  "Preserving Sanctuary", "Robot Wars", "Sky Smite", "Strength Through Numbers", "Tough", "Unarmoured Agility"
];
// Advanced Supporter Talents, L6836-6851. 16 entries.
const SOURCE_ADVANCED_TALENTS = [
  "Accelerando", "Anti-Arts Training", "Art of Binding", "Decoy Blip", "Elemental Specialist", "Escape Artist",
  "Extra Attack", "Hammer and Anvil", "Ignition", "Jumpstart", "Lieutenant", "Mirror Move", "Painful Lesson",
  "Part-Time Inventor", "Reliable Talent", "Shatterer"
];

const ABILITY_MODS = { str: 0, dex: 2, con: 2, int: 2, wis: 1, cha: 4 };

function createSupporter({ level = 1, aidAbility = "wis", mods = {}, branch = null, branchKey = null, system = {} } = {}) {
  const items = [createTestItem({
    name: "Supporter",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } }
  })];
  if (branch) {
    items.push(createTestItem({
      name: `Supporter: ${branch.name}`,
      type: "subclass",
      flags: { ak5e: { chapterThreeId: branch.id } }
    }));
  }
  const abilities = {};
  for (const [key, mod] of Object.entries({ ...ABILITY_MODS, ...mods })) {
    abilities[key] = { value: 10 + 2 * mod, mod };
  }
  return createTestActor({
    items,
    system: {
      attributes: { prof: pbForLevel(level), hp: { value: 10, max: 10, temp: 0 } },
      abilities,
      traits: {
        saves: { value: [] },
        armorProf: { value: [] },
        weaponProf: { value: [] },
        toolProf: { value: [] }
      },
      skills: {
        arc: { value: 0 }, ak5elore: { value: 0 }, ak5etech: { value: 0 },
        ins: { value: 0 }, dec: { value: 0 }, per: { value: 0 }, ath: { value: 0 }
      },
      currency: { cp: 0 },
      ...system
    },
    flags: { ak5e: { supporter: { enabled: true, aidAbility, ...(branchKey ? { branch: branchKey } : {}) } } }
  });
}

function effectsOf(item) {
  return [...(item.effects?.values?.() ?? [])];
}

function classItemOf(actor) {
  return [...actor.items.values()].find(i => i.type === "class");
}

function itemsOf(actor) {
  return [...actor.items.values()];
}

function baseChoices(branch = BRANCHES[0], extra = {}) {
  return {
    branch: branch.id,
    saves: ["con", "wis"],
    skills: ["ak5etech", "ins", "dec"],
    aidAbility: "wis",
    startingEquipment: { mode: "cash" },
    ...extra
  };
}

async function setLevel(actor, level) {
  await classItemOf(actor).update({ "system.levels": level });
  actor.system.attributes.prof = pbForLevel(level);
}

async function applyLevel(actor, choices) {
  const preview = await previewSupporterProgression(actor, choices);
  assert.deepEqual(preview.pending, [], `preview should be complete, pending: ${preview.pending.join(", ")}`);
  await applySupporterProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices });
  return preview;
}

/** Build a Supporter at `level` and grant progression for `choices` in one applied step. */
async function progressTo(level, choices = {}, branch = BRANCHES[0]) {
  const actor = createSupporter({ level });
  await applyLevel(actor, baseChoices(branch, choices));
  return actor;
}

function branchFeatures(actor, branch) {
  return itemsOf(actor).filter(i =>
    i.flags?.ak5e?.classContentKind === "subclass-feature" && i.flags.ak5e.parentBranch === branch.name
  );
}

function leveledBranchFeatures(actor, branch) {
  return branchFeatures(actor, branch).filter(i => Number.isInteger(i.flags.ak5e.classLevel));
}

function talentItems(actor, tier) {
  return itemsOf(actor).filter(i => i.flags?.ak5e?.supporterTalent && (!tier || i.flags.ak5e.supporterTalent.tier === tier));
}

function duplicateGrantIds(actor) {
  const ids = itemsOf(actor)
    .map(i => i.flags?.ak5e?.supporterProgressionGrant?.sourceId)
    .filter(Boolean);
  return ids.filter((id, index) => ids.indexOf(id) !== index);
}

/** Option value for a named talent in an inspected talent field at a given level. */
function talentValue(level, fieldKey, name) {
  const actor = createSupporter({ level });
  const field = inspectSupporterFields(actor, {}).find(f => f.key === fieldKey);
  assert.ok(field, `inspectSupporterFields should expose "${fieldKey}" at level ${level}`);
  const option = field.options.find(o => o.label === name);
  assert.ok(option, `"${name}" should be offered in ${fieldKey} at level ${level}`);
  return option.value;
}

/** Collect every ActiveEffect change visible on the actor or its items. */
function allChanges(actor) {
  const effects = [
    ...(actor.effects?.values?.() ?? []),
    ...itemsOf(actor).flatMap(i => [...(i.effects?.values?.() ?? [])])
  ];
  return effects.flatMap(e => e.changes ?? e.system?.changes ?? []);
}

function text(html) {
  return String(html).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function buttonLabels(html) {
  return [...String(html).matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)].map(m => text(m[1]));
}

function snapshot(actor) {
  return JSON.stringify({
    items: itemsOf(actor).map(i => [i.name, i.type, i.flags]),
    system: actor.system,
    flags: actor.flags
  });
}

/** Stub Roll so any evaluate() call is counted and throws. Returns the counter object. */
function forbidRolls() {
  const saved = globalThis.Roll;
  const counter = { evaluated: 0, restore: () => { globalThis.Roll = saved; } };
  globalThis.Roll = class ForbiddenRoll {
    constructor(formula) { this.formula = formula; }
    async evaluate() {
      counter.evaluated++;
      throw new Error(`auto-roll attempted: ${this.formula}`);
    }
  };
  return counter;
}

function fakeDef(branch, overrides = {}) {
  return {
    id: `test-${branch}`,
    branch,
    plans: {},
    readings: {},
    cleanup: () => {},
    pools: () => [],
    hooks: () => [],
    sheetPanel: () => "",
    api: {},
    progressionFeatures: [],
    ...overrides
  };
}

test.beforeEach(() => {
  setupFoundryGlobals();
  defineSupporterPools();
  defineSupporterTalentPools();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

/* ==========================================================================
   1. Branch registry (supporter-branches.mjs)
   ========================================================================== */

test("registerSupporterBranchModule: a def with no branch throws a clear error", async () => {
  const { registerSupporterBranchModule } = await import("../scripts/supporter-branches.mjs");
  const { branch, ...withoutBranch } = fakeDef("unused");
  assert.throws(() => registerSupporterBranchModule(withoutBranch), /branch/i);
});

test("registerSupporterBranchModule: a null or non-object def throws", async () => {
  const { registerSupporterBranchModule } = await import("../scripts/supporter-branches.mjs");
  assert.throws(() => registerSupporterBranchModule(null));
  assert.throws(() => registerSupporterBranchModule(undefined));
});

test("registerSupporterBranchModule: registering the same branch twice throws", async () => {
  const { registerSupporterBranchModule, SUPPORTER_BRANCH_MODULES } = await import("../scripts/supporter-branches.mjs");
  registerSupporterBranchModule(fakeDef("adv-dup"));
  assert.ok(SUPPORTER_BRANCH_MODULES.has("adv-dup"), "first registration is stored under its branch key");
  assert.throws(() => registerSupporterBranchModule(fakeDef("adv-dup")), /adv-dup|duplicate|already/i);
});

test("registerSupporterBranchModule: forwards plans to registerSupporterPlans (export exists)", async () => {
  // Source of truth for the plan forwarding is the contract; behaviour of the forwarded plan is a todo below.
  assert.equal(typeof uses.registerSupporterPlans, "function", "supporter-uses.mjs must export registerSupporterPlans");
});

test.todo("registerSupporterBranchModule: a plan passed in def.plans is reachable through supporterUses after registration (shape of the plan lookup is not specified in the contract)");

test("initSupporterBranches: pools() and hooks() of each def run exactly once across repeated calls", async () => {
  const { registerSupporterBranchModule, initSupporterBranches } = await import("../scripts/supporter-branches.mjs");
  let poolCalls = 0;
  let hookCalls = 0;
  registerSupporterBranchModule(fakeDef("adv-init", {
    pools: () => { poolCalls++; return []; },
    hooks: () => { hookCalls++; return []; }
  }));
  await initSupporterBranches();
  await initSupporterBranches();
  assert.equal(poolCalls, 1, "pools() must run exactly once");
  assert.equal(hookCalls, 1, "hooks() must run exactly once");
});

test("supporter-branch-index: importable without side-effect errors", async () => {
  const index = await import("../scripts/supporter-branch-index.mjs");
  assert.ok(index, "module loads");
});

test.todo("supporter-branch-index registers the real Artificer, Bard and Hexer modules (land in later waves; tests must not register real keys)");

/* ==========================================================================
   2. Progression: proficiencies, saves, skills (L6599-6604)
   ========================================================================== */

test("progression: weapon proficiency is Light Melee, not simple weapons (L6601)", async () => {
  const actor = await progressTo(1);
  const weapon = actor.system.traits.weaponProf;
  const custom = String(weapon.custom ?? "").split(";").map(p => p.trim()).filter(Boolean);
  const value = [...(weapon.value ?? [])];
  const granted = [...custom, ...value];
  assert.ok(granted.some(p => /light melee/i.test(p)), `Light Melee expected in weaponProf.custom or value, got ${JSON.stringify({ custom, value })}`);
  assert.ok(!granted.includes("sim"), `simple weapons ("sim") must be in neither custom nor value, got ${JSON.stringify({ custom, value })}`);
});

test("progression: armour is exactly Light Armour and Light Shields (L6600)", async () => {
  const actor = await progressTo(1);
  const armour = actor.system.traits.armorProf.value;
  for (const prof of SUPPORTER_ARMOR_PROFS) assert.ok(armour.includes(prof), `${prof} expected`);
  assert.ok(!armour.includes("hvy"), "heavy armour must not be granted");
  assert.ok(!armour.includes("med"), "medium armour must not be granted");
});

test("progression: saving throws are exactly the two chosen from Con/Cha/Wis (L6603)", async () => {
  const actor = await progressTo(1, { saves: ["con", "cha"] });
  assert.deepEqual([...actor.system.traits.saves.value].sort(), ["cha", "con"]);
});

test("progression: a saving throw outside Con/Cha/Wis (Strength) is rejected at preview (L6603)", async () => {
  const actor = createSupporter({ level: 1 });
  const preview = await previewSupporterProgression(actor, baseChoices(BRANCHES[0], { saves: ["str", "wis"] }));
  assert.ok(preview.pending.includes("saves"), "saves must be pending when Strength is picked");
});

test("progression: skills are three trained skills from Arts/Lore/Tech/Insight/Deception/Persuasion; untouched skills stay at 0 (L6604)", async () => {
  const actor = await progressTo(1, { skills: ["arc", "ak5elore", "per"] });
  assert.equal(actor.system.skills.arc.value, 1);
  assert.equal(actor.system.skills.ak5elore.value, 1);
  assert.equal(actor.system.skills.per.value, 1);
  assert.equal(actor.system.skills.ak5etech.value, 0, "unchosen Tech must not be trained");
  assert.equal(actor.system.skills.ath.value, 0, "Athletics is not a Supporter skill");
});

test("progression: picking Athletics or four skills is rejected at preview (L6604)", async () => {
  const actor = createSupporter({ level: 1 });
  const athletics = await previewSupporterProgression(actor, baseChoices(BRANCHES[0], { skills: ["ath", "ins", "dec"] }));
  assert.ok(athletics.pending.includes("skills"), "Athletics must not be selectable");
  const four = await previewSupporterProgression(actor, baseChoices(BRANCHES[0], { skills: ["arc", "ins", "dec", "per"] }));
  assert.ok(four.pending.includes("skills"), "four skills must not be accepted");
});

/* ==========================================================================
   3. Branch features and talent slot counts per level (L6623, L6646-6668)
   ========================================================================== */

for (const branch of BRANCHES) {
  for (const level of LEVELS) {
    test(`branch features: ${branch.name} at level ${level} has exactly ${EXPECTED_BRANCH_FEATURES[level]} leveled features (L6623)`, async () => {
      const actor = await progressTo(level, {}, branch);
      const leveled = leveledBranchFeatures(actor, branch);
      assert.equal(leveled.length, EXPECTED_BRANCH_FEATURES[level]);
      for (const feature of leveled) {
        assert.ok(feature.flags.ak5e.classLevel <= level, `${feature.name} is level ${feature.flags.ak5e.classLevel}, above actor level ${level}`);
      }
      assert.deepEqual(duplicateGrantIds(actor), [], "no duplicate grants");
    });
  }
}

test("branch features: the Artificer, Bard and Hexer each gain features at 1, 4, 10, 13 and 17 with two at 1st (L6623)", async () => {
  for (const branch of BRANCHES) {
    const actor = await progressTo(20, {}, branch);
    const levels = leveledBranchFeatures(actor, branch).map(i => i.flags.ak5e.classLevel).sort((a, b) => a - b);
    assert.deepEqual(levels, [1, 1, 4, 10, 13, 17], `${branch.name} leveled feature levels`);
  }
});

test("talent slots: Basic and Advanced talent counts per level for every branch (L6646-6647, L6667-6668)", async () => {
  for (const branch of BRANCHES) {
    for (const level of LEVELS) {
      const choices = {};
      if (EXPECTED_BASIC_TALENT_SLOTS[level] >= 1) choices.talents = { basic: talentValue(level, "talents.basic", "Alert") };
      if (EXPECTED_BASIC_TALENT_SLOTS[level] >= 2) {
        choices.talents.basicModule = talentValue(level, "talents.basicModule", "Tough");
      }
      if (EXPECTED_ADVANCED_TALENT_SLOTS[level] >= 1) {
        choices.talents = { ...(choices.talents ?? {}), advanced: talentValue(level, "talents.advanced", "Reliable Talent") };
      }
      if (EXPECTED_ADVANCED_TALENT_SLOTS[level] >= 2) {
        choices.talents.advancedModule = talentValue(level, "talents.advancedModule", "Shatterer");
      }
      const actor = await progressTo(level, choices, branch);
      assert.equal(talentItems(actor, "basic").length, EXPECTED_BASIC_TALENT_SLOTS[level], `${branch.name} L${level} basic talents`);
      assert.equal(talentItems(actor, "advanced").length, EXPECTED_ADVANCED_TALENT_SLOTS[level], `${branch.name} L${level} advanced talents`);
    }
  }
});

test("talent fields: Basic Talent appears at 3rd, Basic Module at 8th, Advanced at 9th, Advanced Module at 13th (L6646-6668)", () => {
  const fieldsAt = level => inspectSupporterFields(createSupporter({ level }), {}).map(f => f.key);
  assert.ok(!fieldsAt(2).includes("talents.basic"), "no basic talent slot at 2nd");
  assert.ok(fieldsAt(3).includes("talents.basic"), "basic talent slot at 3rd");
  assert.ok(!fieldsAt(7).includes("talents.basicModule"), "no basic module choice at 7th");
  assert.ok(fieldsAt(8).includes("talents.basicModule"), "basic module choice at 8th");
  assert.ok(!fieldsAt(8).includes("talents.advanced"), "no advanced talent at 8th");
  assert.ok(fieldsAt(9).includes("talents.advanced"), "advanced talent at 9th");
  assert.ok(!fieldsAt(12).includes("talents.advancedModule"), "no advanced module at 12th");
  assert.ok(fieldsAt(13).includes("talents.advancedModule"), "advanced module at 13th");
});

test("ASI fields: one per ASI level (4, 6, 8, 10, 12, 16, 19) and none at 3rd (L6650)", () => {
  const asiCount = level => inspectSupporterFields(createSupporter({ level }), {}).filter(f => /^asi\./.test(f.key)).length;
  assert.equal(asiCount(3), 0);
  assert.equal(asiCount(4), 1);
  assert.equal(asiCount(6), 2);
  assert.equal(asiCount(8), 3);
  assert.equal(asiCount(10), 4);
  assert.equal(asiCount(12), 5);
  assert.equal(asiCount(16), 6);
  assert.equal(asiCount(19), 7);
  assert.equal(asiCount(20), 7);
});

/* ==========================================================================
   4. Operator Skill choice fields (L6643, L6664, L6676)
   ========================================================================== */

test("operator skills: inspectSupporterFields adds NO operator-skill fields (operator-progression.mjs owns the 2/7/14 picks)", () => {
  for (const level of [1, 2, 7, 14]) {
    const hits = inspectSupporterFields(createSupporter({ level }), {})
      .filter(f => /operator\s*skill/i.test(`${f.key} ${f.label}`));
    assert.equal(hits.length, 0, `no operator-skill field at level ${level} (would duplicate skill items), got ${JSON.stringify(hits.map(h => h.key))}`);
  }
});

test.todo("Operator Skill picks: the 'any other Basic/Advanced/Elite Skill table available to you' option (C3:6644, 6665, 6677) is not offered by the current picker");

/* ==========================================================================
   5. Module upgrades and duplicate talent warnings (L6646-6647, L6667-6668)
   ========================================================================== */

test("module upgrade at 8th writes flags.ak5e.supporterTalent.modules for the upgraded Basic Talent", async () => {
  const alert = talentValue(8, "talents.basic", "Alert");
  const actor = await progressTo(3, { talents: { basic: alert } });
  await setLevel(actor, 8);
  await applyLevel(actor, baseChoices(BRANCHES[0], { talents: { basic: alert, basicModule: "upgrade" } }));
  assert.equal(actor.flags.ak5e.supporterTalent?.modules?.[alert], true, "modules[talentId] must be true");
});

test("module upgrade at 13th writes flags.ak5e.supporterTalent.modules for the upgraded Advanced Talent", async () => {
  const reliable = talentValue(13, "talents.advanced", "Reliable Talent");
  const actor = await progressTo(9, { talents: { advanced: reliable } });
  await setLevel(actor, 13);
  await applyLevel(actor, baseChoices(BRANCHES[0], { talents: { advanced: reliable, advancedModule: "upgrade" } }));
  assert.equal(actor.flags.ak5e.supporterTalent?.modules?.[reliable], true, "modules[talentId] must be true");
});

test("duplicate talent: picking Alert again at 8th warns and creates no second Alert item", async () => {
  const alert = talentValue(8, "talents.basic", "Alert");
  const actor = await progressTo(3, { talents: { basic: alert } });
  await setLevel(actor, 8);
  const preview = await previewSupporterProgression(actor, baseChoices(BRANCHES[0], { talents: { basic: alert, basicModule: alert } }));
  assert.ok(preview.warnings.length > 0, "picking the same talent twice must warn");
  await applyLevel(actor, baseChoices(BRANCHES[0], { talents: { basic: alert, basicModule: alert } }));
  const alerts = talentItems(actor).filter(i => i.name === "Alert");
  assert.equal(alerts.length, 1, "exactly one Alert item");
});

test.todo("module upgrade at 8th with no Basic Talent chosen earlier: source says 'upgrade your Basic Talent' with no target; warn or block is not specified");

/* ==========================================================================
   6. Re-application, lowering level, idempotency and duplicates
   ========================================================================== */

for (const branch of BRANCHES) {
  test(`re-applying an applied level creates no duplicate ${branch.name} features or talents`, async () => {
    const choices = baseChoices(branch, { talents: { basic: talentValue(3, "talents.basic", "Alert") } });
    const actor = await progressTo(13, choices, branch);
    const before = leveledBranchFeatures(actor, branch).length;
    const talentsBefore = talentItems(actor).length;
    assert.equal(before, EXPECTED_BRANCH_FEATURES[13], "precondition: five leveled features at 13th");
    assert.equal(talentsBefore, 1, "precondition: one Basic Talent granted");
    await applyLevel(actor, baseChoices(branch, { talents: { basic: talentValue(3, "talents.basic", "Alert") } }));
    assert.equal(leveledBranchFeatures(actor, branch).length, before, "feature count unchanged");
    assert.equal(talentItems(actor).length, talentsBefore, "talent count unchanged");
    assert.deepEqual(duplicateGrantIds(actor), []);
  });

  test(`lowering the class level for ${branch.name} creates no duplicates when re-applied`, async () => {
    const choices = baseChoices(branch);
    const actor = await progressTo(13, choices, branch);
    const before = leveledBranchFeatures(actor, branch).length;
    assert.equal(before, EXPECTED_BRANCH_FEATURES[13], "precondition: five leveled features at 13th");
    await classItemOf(actor).update({ "system.levels": 4 });
    await applyLevel(actor, baseChoices(branch));
    assert.ok(leveledBranchFeatures(actor, branch).length <= before, "lowering must not add features");
    assert.deepEqual(duplicateGrantIds(actor), [], "no duplicate grants after lowering");
  });
}

test("applying twice with the same contextKey adds no items the second time", async () => {
  const actor = createSupporter({ level: 4 });
  const choices = baseChoices(BRANCHES[0]);
  const preview = await previewSupporterProgression(actor, choices);
  await applySupporterProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices });
  assert.ok(itemsOf(actor).some(i => i.type === "subclass"), "precondition: first apply created the branch item");
  const count = itemsOf(actor).length;
  try {
    const second = await applySupporterProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices });
    assert.ok(!second.created || second.created.length === 0, "second apply must create nothing");
  } catch (error) {
    // A stale-preview rejection is an acceptable outcome of re-applying the same key.
    assert.match(String(error.message), /preview|changed|choose|complete/i, `unexpected error: ${error.message}`);
  }
  assert.equal(itemsOf(actor).length, count, "no duplicate items");
  assert.deepEqual(duplicateGrantIds(actor), []);
});

test("applying without confirmation (omitted or false) rejects and changes nothing", async () => {
  const actor = createSupporter({ level: 1 });
  const choices = baseChoices(BRANCHES[0]);
  const preview = await previewSupporterProgression(actor, choices);
  const before = snapshot(actor);
  await assert.rejects(applySupporterProgression(actor, { contextKey: preview.contextKey, choices }));
  await assert.rejects(applySupporterProgression(actor, { confirmed: false, contextKey: preview.contextKey, choices }));
  assert.equal(snapshot(actor), before, "cancelled apply must leave actor untouched");
});

test("previewing progression never writes actor data or items", async () => {
  const actor = createSupporter({ level: 9 });
  const before = snapshot(actor);
  await previewSupporterProgression(actor, baseChoices(BRANCHES[1], { talents: { basic: talentValue(9, "talents.basic", "Alert") } }));
  assert.equal(snapshot(actor), before);
});

test.todo("switching branch after level 1: the spec does not say whether the old branch's features are removed, blocked or kept; decide and then assert");

/* ==========================================================================
   7. Talents (supporter-talents.mjs, R11 manual cards)
   ========================================================================== */

test("talent catalogue: 12 Basic and 16 Advanced talents with names exactly as printed (L6809-6851)", () => {
  const basicNames = inspectSupporterFields(createSupporter({ level: 13 }), {}).find(f => f.key === "talents.basic").options.map(o => o.label);
  const advancedNames = inspectSupporterFields(createSupporter({ level: 13 }), {}).find(f => f.key === "talents.advanced").options.map(o => o.label);
  assert.deepEqual([...basicNames].sort(), [...SOURCE_BASIC_TALENTS].sort());
  assert.deepEqual([...advancedNames].sort(), [...SOURCE_ADVANCED_TALENTS].sort());
  assert.equal(basicNames.length + advancedNames.length, 28);
});

test("Tough: Hit Point maximum rises by 2 x character level at 3rd level (L6822)", async () => {
  const tough = talentValue(3, "talents.basic", "Tough");
  const actor = createSupporter({ level: 3 });
  const hpBefore = Number(actor.system.attributes.hp.max);
  await applyLevel(actor, baseChoices(BRANCHES[0], { talents: { basic: tough } }));
  const delta = Number(actor.system.attributes.hp.max) - hpBefore;
  const effectSix = allChanges(actor).some(c => /hp|hitpoint/i.test(String(c.key)) && Number(c.value) === 6);
  // Implementation writes "@details.level * 2" on system.attributes.hp.bonuses.overall; at 3rd level that is 6.
  const formulaTwoPerLevel = allChanges(actor).some(c =>
    /hp|hitpoint/i.test(String(c.key)) && /^\s*@details\.level\s*\*\s*2\s*$/.test(String(c.value)));
  assert.ok(delta === 6 || effectSix || formulaTwoPerLevel, `expected +6 max HP (delta ${delta}), an effect change of 6, or "@details.level * 2"`);
});

test("Alert: initiative bonus equals Proficiency Bonus (L6813), which is 2 at 3rd level", async () => {
  const alert = talentValue(3, "talents.basic", "Alert");
  const actor = await progressTo(3, { talents: { basic: alert } });
  const pb = pbForLevel(3);
  const initChanges = allChanges(actor).filter(c => /init/i.test(String(c.key)));
  assert.ok(initChanges.length > 0, "Alert must add an initiative change (Active Effect)");
  assert.ok(initChanges.some(c => Number(c.value) === pb || /prof/i.test(String(c.value))),
    `initiative bonus must equal PB ${pb}; got ${JSON.stringify(initChanges)}`);
});

test("Alacrity: Speed increases by 10 feet (L6812)", async () => {
  const actor = await progressTo(3, { talents: { basic: talentValue(3, "talents.basic", "Alacrity") } });
  const speed = allChanges(actor).filter(c => /movement|speed/i.test(String(c.key)));
  assert.ok(speed.some(c => Number(c.value) === 10), `Speed +10 expected; got ${JSON.stringify(speed)}`);
});

test("Unarmoured Agility is a MANUAL talent: no speed Active Effect, because it depends on wearing no Armour (L6823)", async () => {
  const { actor, talent } = await grantedTalent("Unarmoured Agility");
  assert.equal(talent.flags.ak5e.supporterTalent?.mode, "manual");
  assert.equal(effectsOf(talent).length, 0, "no item Active Effect");
  assert.ok(!allChanges(actor).some(c => /movement|speed/i.test(String(c.key))), "no speed change is created");
});

test("Lucky: supporterLuckBase holds two Luck Points, and supporterLuckModule holds PB once the Module is active (L6817)", async () => {
  const actor = await progressTo(3, { talents: { basic: talentValue(3, "talents.basic", "Lucky") } });
  assert.equal(getPool(actor, "supporterLuckBase").max, 2, "base Luck Points is 2");

  await setLevel(actor, 8);
  await applyLevel(actor, baseChoices(BRANCHES[0], {
    talents: { basic: talentValue(3, "talents.basic", "Lucky"), basicModule: "upgrade" }
  }));
  assert.equal(getPool(actor, "supporterLuckModule").max, pbForLevel(8), "Module Luck Points equal PB (3 at 8th)");
});

const FLAT_TALENTS = ["Alacrity", "Alert", "Tough"];
const NON_FLAT_PLAN_TALENTS = ["Accelerando", "Art of Binding", "Ignition", "Mirror Move", "Painful Lesson"];
const MANUAL_TALENTS = ["Anti-Arts Training", "Lieutenant", "Part-Time Inventor", "Unarmoured Agility"];
const R11_TALENTS = ["Anti-Arts Training", "Lieutenant", "Part-Time Inventor"];

function talentLevel(name) {
  return SOURCE_ADVANCED_TALENTS.includes(name) ? 9 : 3;
}

async function grantedTalent(name) {
  const level = talentLevel(name);
  const slot = level === 9 ? "advanced" : "basic";
  const actor = await progressTo(level, { talents: { [slot]: talentValue(level, `talents.${slot}`, name) } });
  const talent = talentItems(actor).find(i => i.name === name);
  assert.ok(talent, `${name} item created`);
  return { actor, talent };
}

for (const name of FLAT_TALENTS) {
  test(`flat talent ${name}: mode "ae" and Active Effect changes (DECISIONS rule 11)`, async () => {
    const { actor, talent } = await grantedTalent(name);
    assert.equal(talent.flags.ak5e.supporterTalent?.mode, "ae", `${name} marker mode`);
    assert.ok(allChanges(actor).length > 0 || effectsOf(talent).length > 0, `${name} must carry an Active Effect`);
  });
}

for (const name of NON_FLAT_PLAN_TALENTS) {
  test(`use or reaction talent ${name}: mode "plan" and no flat Active Effect (DECISIONS rule 11)`, async () => {
    const { talent } = await grantedTalent(name);
    assert.equal(talent.flags.ak5e.supporterTalent?.mode, "plan", `${name} marker mode`);
    assert.equal(effectsOf(talent).length, 0, `${name} must not be an Active Effect`);
  });
}

for (const name of MANUAL_TALENTS) {
  test(`manual talent ${name}: mode "manual" and no Active Effect (DECISIONS rule 11)`, async () => {
    const { talent } = await grantedTalent(name);
    assert.equal(talent.flags.ak5e.supporterTalent?.mode, "manual", `${name} marker mode`);
    assert.equal(effectsOf(talent).length, 0, `${name} must not be an Active Effect`);
  });
}

for (const name of R11_TALENTS) {
  test(`R11 manual card ${name}: ruling "R11" is recorded on the item`, async () => {
    const { talent } = await grantedTalent(name);
    assert.equal(talent.flags.ak5e.supporterTalent?.ruling, "R11", `${name} ruling`);
  });
}

// Every numeric value in a talent's Active Effect changes must come from its source row or be PB or 2 x level (Tough).
for (const entry of CHAPTER_THREE_CLASSES.filter(e => e.kind === "class-option" && e.parentClass === "Supporter" && e.classOption?.category === "talent" && !e.parentBranch)) {
  const level = entry.classOption.tier === "Advanced" ? 9 : 3;
  const slot = level === 9 ? "advanced" : "basic";
  test(`no invented numbers: ${entry.name} Active Effect values come from source L6809-6851 (or PB / 2 x level)`, async () => {
    const actor = await progressTo(level, { talents: { [slot]: talentValue(level, `talents.${slot}`, entry.name) } });
    assert.ok(talentItems(actor).some(i => i.name === entry.name), `precondition: ${entry.name} item created`);
    const sourceNumbers = new Set(`${entry.classOption.effect} ${entry.classOption.moduleEffect}`.match(/\d+/g)?.map(Number) ?? []);
    const allowed = new Set([...sourceNumbers, pbForLevel(level), 2 * level]);
    for (const change of allChanges(actor)) {
      const numeric = Number(change.value);
      if (!Number.isFinite(numeric) || String(change.value).trim() === "") continue;
      assert.ok(allowed.has(numeric), `${entry.name} change ${change.key}=${change.value} is not in its source text`);
    }
  });
}

/* ==========================================================================
   8. Sheet: renderSupporterControls, branch slot, buttons, warnings (supporter-sheet.mjs)
   ========================================================================== */

test("sheet: a non-Supporter actor renders without throwing and shows no Aid Dice panel", async () => {
  const { supporterPanelHtml } = await import("../scripts/supporter-sheet.mjs");
  const plain = createTestActor({ name: "Civilian", items: [] });
  const html = supporterPanelHtml(plain);
  assert.equal(typeof html, "string");
  assert.doesNotMatch(text(html), /Aid Di/i);
});

test("sheet: level 7 Supporter shows the Aid Die value/max and the d10 die size", async () => {
  const { supporterPanelHtml } = await import("../scripts/supporter-sheet.mjs");
  const actor = createSupporter({ level: 7, aidAbility: "cha" });
  const shown = text(supporterPanelHtml(actor));
  assert.match(shown, /Aid Di/i);
  assert.match(shown, /d10/);
  assert.match(shown, /Aid Di[^]{0,120}?\b4\b/, "Charisma modifier 4 is the max");
});

test("sheet: level 14 Supporter shows a d12 Aid Die", async () => {
  const { supporterPanelHtml } = await import("../scripts/supporter-sheet.mjs");
  assert.match(text(supporterPanelHtml(createSupporter({ level: 14 }))), /d12/);
});

test("sheet: Aid Dice max of zero or below shows '0 Aid Dice — GM resolves' (ruling 1, C3:6637)", async () => {
  const { supporterPanelHtml } = await import("../scripts/supporter-sheet.mjs");
  const actor = createSupporter({ level: 5, aidAbility: "cha", mods: { cha: -1 } });
  assert.match(text(supporterPanelHtml(actor)), /0 Aid Dice\s*(—|–|-)\s*GM resolves/);
});

test("aid die pool: max is the chosen ability modifier, not the best of INT/WIS/CHA (C3:6637)", async () => {
  // WIS is chosen (mod 1); CHA is 4 and INT is 2. The max must be 1.
  const actor = createSupporter({ level: 5, aidAbility: "wis" });
  assert.equal(getPool(actor, "aidDie").max, 1);
});

test("aid die pool: a zero or negative chosen modifier gives max 0, with no floor of one (ruling 1)", async () => {
  const actor = createSupporter({ level: 5, aidAbility: "wis", mods: { wis: -1 } });
  assert.equal(getPool(actor, "aidDie").max, 0);
});

test("sheet: level 1 Supporter shows no Lighten the Load or Self-Supportive buttons", async () => {
  const { supporterPanelHtml } = await import("../scripts/supporter-sheet.mjs");
  const labels = buttonLabels(supporterPanelHtml(createSupporter({ level: 1 })));
  assert.ok(!labels.some(l => /Lighten/i.test(l)), `unexpected Lighten button in ${JSON.stringify(labels)}`);
  assert.ok(!labels.some(l => /Self-Supportive/i.test(l)), `unexpected Self-Supportive button in ${JSON.stringify(labels)}`);
});

test("sheet: Lighten the Load button appears from 11th level and not at 10th (L6673)", async () => {
  const { supporterPanelHtml } = await import("../scripts/supporter-sheet.mjs");
  const at10 = buttonLabels(supporterPanelHtml(createSupporter({ level: 10 })));
  const at11 = buttonLabels(supporterPanelHtml(createSupporter({ level: 11 })));
  assert.ok(!at10.some(l => /Lighten/i.test(l)), "no Lighten at 10th");
  assert.ok(at11.some(l => /Lighten/i.test(l)), "Lighten at 11th");
});

test("sheet: Self-Supportive button appears from 18th level and not at 17th (L6686)", async () => {
  const { supporterPanelHtml } = await import("../scripts/supporter-sheet.mjs");
  const at17 = buttonLabels(supporterPanelHtml(createSupporter({ level: 17 })));
  const at18 = buttonLabels(supporterPanelHtml(createSupporter({ level: 18 })));
  assert.ok(!at17.some(l => /Self-Supportive/i.test(l)), "no Self-Supportive at 17th");
  assert.ok(at18.some(l => /Self-Supportive/i.test(l)), "Self-Supportive at 18th");
});

for (let n = 1; n <= 3; n++) {
  test(`sheet: branch slot for fake branch testslot${n} contains that def's sheetPanel output`, async () => {
    const key = `testslot${n}`;
    const marker = `SLOT-MARK-${key}`;
    const { registerSupporterBranchModule } = await import("../scripts/supporter-branches.mjs");
    const { supporterPanelHtml } = await import("../scripts/supporter-sheet.mjs");
    const def = registerSupporterBranchModule(fakeDef(key, { sheetPanel: () => `<div class="slot">${marker}</div>` }));
    assert.ok(def, "fake def registered");
    const actor = createSupporter({ level: 4, branchKey: key });
    assert.ok(String(supporterPanelHtml(actor)).includes(marker), "panel contains the fake sheetPanel output");
  });
}

test("sheet: rendering and planning never call Roll.evaluate (no auto-roll)", async () => {
  const { supporterPanelHtml } = await import("../scripts/supporter-sheet.mjs");
  const actor = createSupporter({ level: 18, branch: BRANCHES[0] });
  const roll = forbidRolls();
  try {
    supporterPanelHtml(actor);
    supporterPanelHtml(createSupporter({ level: 1 }));
    await previewSupporterProgression(actor, baseChoices(BRANCHES[0], { talents: { basic: talentValue(3, "talents.basic", "Alert") } }));
    assert.equal(roll.evaluated, 0, "no dice may be evaluated during render or plan");
  } finally {
    roll.restore();
  }
});

test("sheet hooks: registerSupporterSheetHooks is callable and does not throw", async () => {
  const sheet = await import("../scripts/supporter-sheet.mjs");
  assert.equal(typeof sheet.openSupporterControls, "function");
  assert.equal(typeof sheet.handleSupporterCommand, "function");
  assert.doesNotThrow(() => sheet.registerSupporterSheetHooks());
});

/* ==========================================================================
   9. Ruling and removal checks
   ========================================================================== */

test("ruling 2: the base class prints no DC, so supporterDC is removed from supporter-rules", () => {
  assert.equal(typeof rules.supporterDC, "undefined", "supporterDC must not exist");
});

test("Supporter weapon proficiency constant is Light Melee only (L6601)", () => {
  assert.deepEqual([...SUPPORTER_WEAPON_PROFS], ["Light Melee"]);
});

