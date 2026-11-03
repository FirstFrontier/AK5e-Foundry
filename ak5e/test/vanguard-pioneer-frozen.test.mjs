import test from "node:test";
import assert from "node:assert/strict";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import { vanguardExtensionContext, vanguardProgressionContributions, vanguardOwnerControls } from "../scripts/vanguard-extensions.mjs";
import { inspectVanguardFields, previewVanguardProgression, applyVanguardProgression } from "../scripts/vanguard-progression.mjs";
import { getOperatorSkillChoices } from "../scripts/operator-progression.mjs";
import { executeOperatorCommand } from "../scripts/operator-skills.mjs";
import { emitAk5eEvent } from "../scripts/trigger-events.mjs";
import { vanguardUses } from "../scripts/vanguard-uses.mjs";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem, createTestCombat } from "./base-classes-fixture.mjs";

const PIONEER_ID = "subclass-vanguard-pioneer";
const ELITE_CLASSES = new Set(["Guard", "Defender", "Marksman", "Specialist", "Vanguard"]);

let pioneerApi;
async function loadPioneer() {
  if (pioneerApi) return pioneerApi;
  try {
    pioneerApi = await import("../scripts/pioneer-features.mjs");
  } catch (error) {
    pioneerApi = { loadError: error };
  }
  return pioneerApi;
}

function requirePioneer(api) {
  assert.ok(!api.loadError,
    `Pioneer feature behavior is missing: pioneer-features.mjs did not load (${api.loadError?.code ?? api.loadError?.message})`);
  assert.equal(typeof api.registerPioneerFeatureHooks, "function", "Pioneer feature hook registration is part of the branch integration");
  assert.equal(typeof api.registerPioneerVanguardExtension, "function", "Pioneer progression and skill-slot registration is part of the branch integration");
  api.registerPioneerFeatureHooks();
  api.registerPioneerVanguardExtension();
}

function classRecord(id) {
  return CHAPTER_THREE_CLASSES.find(entry => entry.kind === (id === "class-vanguard" ? "class" : "subclass") && entry.id === id);
}

function pioneerActor(level = 1, options = {}) {
  const vanguard = classRecord("class-vanguard");
  const branchId = options.branch ?? PIONEER_ID;
  const branch = classRecord(branchId);
  assert.ok(vanguard && branch, "the source catalogue contains Vanguard and the selected branch record");
  const actor = createTestActor({ name: options.name ?? "Pioneer owner", owner: options.owner ?? true, level,
    ownership: options.ownership,
    system: {
      attributes: { prof: Math.floor((level - 1) / 4) + 2, hp: { value: options.hp ?? 20, max: options.hp ?? 20, temp: 0 } },
      traits: { saves: { value: [] }, armorProf: { value: options.armorProf ?? [] }, weaponProf: { value: options.weaponProf ?? [] }, toolProf: { value: [] } },
      skills: { acr: { value: 0 }, ath: { value: 0 }, ste: { value: 0 } },
      abilities: { str: { value: 12, mod: 1 }, dex: { value: 16, mod: 3 }, con: { value: 14, mod: 2 }, int: { value: 10, mod: 0 }, wis: { value: 10, mod: 0 }, cha: { value: 12, mod: 1 } },
      currency: { cp: 0 },
      ...options.system
    },
    flags: { ak5e: { vanguard: { enabled: true }, ...options.flags } }
  });
  actor.items.set("vanguard-class", createTestItem({ id: "vanguard-class", name: "Vanguard", type: "class",
    system: { ...vanguard.systemData, levels: level }, flags: { ak5e: { chapterThreeId: vanguard.id } } }, actor));
  actor.items.set("vanguard-branch", createTestItem({ id: "vanguard-branch", name: branch.name, type: "subclass",
    system: branch.systemData, flags: { ak5e: { chapterThreeId: branch.id } } }, actor));
  return actor;
}

const progressionChoices = (branch, level) => ({ branch, martialDCAbility: "dex", saves: ["str"],
  skills: ["acr", "ath", "ste"], tool: "Messenger Kit", startingEquipment: { mode: "existing" },
  hp: Object.fromEntries(Array.from({ length: level }, (_, index) => [index + 1, { mode: "fixed" }])) });

test.beforeEach(() => setupFoundryGlobals());
test.afterEach(() => teardownFoundryGlobals());

test("Heavy Duty grants Heavy Melee and Medium Armour proficiency and cumulative +2 HP without overwriting authored data", async () => {
  const api = await loadPioneer();
  requirePioneer(api);
  const actor = pioneerActor(1, { armorProf: ["custom-armor"] });
  const heavyWeapon = createTestItem({ name: "Test Heavy Melee", type: "weapon", system: { proficient: 0 },
    flags: { ak5e: { tableData: { category: "Heavy Melee Weapons" }, authoredNote: "preserve-me" } } }, actor);
  const custom = createTestItem({ name: "Authored table feature", type: "feat", system: { description: { value: "Keep exact text" } },
    flags: { ak5e: { authoredByTable: true, marker: "keep" } } }, actor);
  actor.items.set(heavyWeapon.id, heavyWeapon);
  actor.items.set(custom.id, custom);
  const choices = progressionChoices(PIONEER_ID, 1);
  let plan = await previewVanguardProgression(actor, choices);
  await applyVanguardProgression(actor, { confirmed: true, contextKey: plan.contextKey, choices });
  const comparison = pioneerActor(1, { hp: 20, branch: "subclass-vanguard-agent" });
  const comparisonChoices = progressionChoices("subclass-vanguard-agent", 1);
  plan = await previewVanguardProgression(comparison, comparisonChoices);
  await applyVanguardProgression(comparison, { confirmed: true, contextKey: plan.contextKey, choices: comparisonChoices });
  assert.equal(actor.system.attributes.hp.max, comparison.system.attributes.hp.max + 2,
    "granting Heavy Duty adds 2 maximum HP at level 1 over ordinary Vanguard progression");
  assert.ok(actor.system.traits.armorProf.value.includes("med"), "Pioneer gains Medium Armour proficiency");
  assert.ok(actor.system.traits.armorProf.value.includes("custom-armor"), "existing authored armour proficiency remains");
  assert.equal(heavyWeapon.system.proficient, 1, "source-categorized Heavy Melee weapons are proficient");
  assert.equal(custom.system.description.value, "Keep exact text");
  assert.deepEqual(custom.flags.ak5e, { authoredByTable: true, marker: "keep" });

  const replay = await previewVanguardProgression(actor, choices);
  await applyVanguardProgression(actor, { confirmed: true, contextKey: replay.contextKey, choices });
  assert.equal(actor.system.attributes.hp.max, comparison.system.attributes.hp.max + 2, "replaying the same progression never double-grants the HP bonus");

  const later = pioneerActor(3, { hp: 20 });
  const laterChoices = { ...progressionChoices(PIONEER_ID, 3), talents: { basic: "class-option-vanguard-talent-basic-alacrity" } };
  plan = await previewVanguardProgression(later, laterChoices);
  await applyVanguardProgression(later, { confirmed: true, contextKey: plan.contextKey, choices: laterChoices });
  const laterComparison = pioneerActor(3, { hp: 20, branch: "subclass-vanguard-agent" });
  const laterComparisonChoices = { ...progressionChoices("subclass-vanguard-agent", 3), talents: { basic: "class-option-vanguard-talent-basic-alacrity" } };
  plan = await previewVanguardProgression(laterComparison, laterComparisonChoices);
  await applyVanguardProgression(laterComparison, { confirmed: true, contextKey: plan.contextKey, choices: laterComparisonChoices });
  assert.equal(later.system.attributes.hp.max, laterComparison.system.attributes.hp.max + 6,
    "Heavy Duty adds 2 HP for the grant and for each later Vanguard level");
});

test("Heavy Duty equipment exchange offers one starting Light Melee Weapon or Light Shield for one Heavy Melee Weapon", async () => {
  const api = await loadPioneer();
  requirePioneer(api);
  const actor = pioneerActor();
  const fields = inspectVanguardFields(actor, { branch: PIONEER_ID });
  const visible = JSON.stringify(fields);
  assert.match(visible, /Heavy Melee/i, "Pioneer progression exposes the Heavy Duty exchange choice");
  assert.match(visible, /Light Melee Weapon|Light Shield/i, "the exchange source is limited to one allowed starting choice");
  assert.doesNotMatch(visible, /Medium Armour.*exchange|currency.*exchange/i,
    "the printed exchange does not substitute armour or LMD for the required weapon");
});

test("Auramancy exposes the seven starting and three level-10 aura options and grows from 15 to 30 feet at level 13", async () => {
  const api = await loadPioneer();
  requirePioneer(api);
  const actor = pioneerActor(13);
  const context = vanguardExtensionContext(actor, { branchId: PIONEER_ID, level: 13, purpose: "controls" });
  const controls = vanguardOwnerControls(context);
  const aura = controls.find(control => /auramancy/i.test(`${control.label ?? ""} ${control.hint ?? ""} ${control.id ?? ""}`));
  assert.ok(aura, "Pioneer owners have an Auramancy control");
  assert.equal(typeof aura.open, "function", "the Auramancy control opens its player-facing selection workflow");
  const view = JSON.stringify(controls);
  for (const effect of ["Clarity", "Liberation", "Protection", "Punishment", "Purity", "Infirmity", "Violence", "Pressure", "Shadows", "Vigilance"])
    assert.match(view, new RegExp(`Aura of ${effect}`, "i"), `the level-13 choices include Aura of ${effect}`);

  const contribution = vanguardProgressionContributions(vanguardExtensionContext(actor, { branchId: PIONEER_ID, level: 13, purpose: "progression" }));
  const progression = JSON.stringify(contribution);
  assert.match(progression, /15/ , "Auramancy begins at 15 feet");
  assert.match(progression, /30/ , "Maximum Aura sets the radius to 30 feet at level 13");
});

test("an owner can confirm and toggle Auramancy out of turn without a GM, dice roll, or unreviewed side effect", async () => {
  const api = await loadPioneer();
  requirePioneer(api);
  const owner = { id: "pioneer-player", isGM: false };
  game.user = owner;
  game.users = new Map([[owner.id, owner]]);
  const bearer = pioneerActor(1, { owner: true, ownership: { default: 0, [owner.id]: 3 } });
  const other = createTestActor({ name: "Other combatant" });
  game.combat = createTestCombat([other, bearer], { started: true, round: 2, turn: 0 });
  const plan = await vanguardUses.preview(bearer, "pioneerAuramancy", { action: "toggle", enabled: true });
  assert.ok(plan, "the owner can prepare Auramancy on their own Actor without a GM approval request");
  assert.ok(Array.isArray(plan.warnings), "out-of-turn action economy appears as a warning list");
  assert.ok(plan.warnings.length > 0, "the non-active owner is warned that this use is out of turn");
  const warningIds = plan.warnings.map(warning => warning.id);
  assert.ok(warningIds.every(Boolean), "each overridable timing warning has an ID for Use anyway");
  const before = structuredClone(bearer.toObject());
  const rolls = [];
  const OriginalRoll = globalThis.Roll;
  globalThis.Roll = class extends OriginalRoll {
    constructor(formula, ...args) { rolls.push(String(formula)); super(formula, ...args); }
    async evaluate(...args) { rolls.push("evaluated"); return super.evaluate(...args); }
  };
  try {
    await assert.rejects(
      vanguardUses.command(bearer, "pioneerAuramancy", { action: "toggle", enabled: true, confirmed: false }, "pioneer-aura-cancel"),
      /Confirm this use/
    );
    assert.deepEqual(bearer.toObject(), before, "cancel changes no Actor or Item state");
    assert.deepEqual(rolls, [], "cancel starts no Aura feature dice");
    await vanguardUses.command(bearer, "pioneerAuramancy", { action: "toggle", enabled: true, overrides: warningIds, confirmed: true }, "pioneer-aura-use");
    assert.notDeepEqual(bearer.toObject(), before, "confirmed Use anyway commits the owner's Aura toggle");
    assert.equal(rolls.length, 0, "confirming an Aura toggle rolls no feature dice");
    assert.ok(game.messages.some(message => /out of turn/i.test(`${message.content ?? ""} ${JSON.stringify(message.flags ?? {})}`)),
      "the public chat card shows the overridden timing warning");
    const undo = await vanguardUses.undo(bearer, "pioneer-aura-use");
    assert.ok(undo, "the Aura toggle can be undone within the current encounter window");
    assert.equal(vanguardUses.receipt(bearer, "pioneer-aura-use").status, "undone");
  } finally {
    globalThis.Roll = OriginalRoll;
  }
});

test("only committed Operator Skill SP drives 20-SP aura grants; remainder, retries and undo stay exact", async () => {
  const api = await loadPioneer();
  requirePioneer(api);
  const player = { id: "pioneer-player", isGM: false };
  game.user = player;
  game.users = new Map([[player.id, player]]);
  game.users.activeGM = null;
  const actor = pioneerActor(4, { ownership: { default: 0, [player.id]: 3 }, flags: { operatorSkills: {
    enabled: true, points: 50, start: 0, active: null, operatorEvents: [], receipts: []
  } } });
  const firstSkill = createTestItem({ name: "Pioneer test skill 15", type: "feat", flags: { ak5e: {
    operatorSkill: { sourceId: "pioneer-test-15", cost: 15, start: 0, methods: ["automatic"], activation: "Action", duration: "Instant" }
  } } }, actor);
  const secondSkill = createTestItem({ name: "Pioneer test skill 10", type: "feat", flags: { ak5e: {
    operatorSkill: { sourceId: "pioneer-test-10", cost: 10, start: 0, methods: ["automatic"], activation: "Action", duration: "Instant" }
  } } }, actor);
  const maxSkill = createTestItem({ name: "Pioneer test max skill 50", type: "feat", flags: { ak5e: {
    operatorSkill: { sourceId: "pioneer-test-max-50", cost: 50, start: 0, methods: ["automatic"], activation: "Action", duration: "Instant" }
  } } }, actor);
  actor.items.set(firstSkill.id, firstSkill);
  actor.items.set(secondSkill.id, secondSkill);
  actor.items.set(maxSkill.id, maxSkill);

  await executeOperatorCommand(actor, { id: "pioneer-activate-15", command: "activate", data: { itemId: firstSkill.id } }, player);
  const first = actor.getFlag("ak5e", "operatorSkills").operatorEvents.find(event => event.activationId === "pioneer-activate-15" && event.kind === "activation");
  assert.ok(first?.committed);
  assert.equal(first.spSpent, 15, "event source is the actual committed SP expenditure");
  assert.equal(actor.getFlag("ak5e", "operatorSkills").points, 35);

  await executeOperatorCommand(actor, { id: "pioneer-activate-10", command: "activate", data: { itemId: secondSkill.id } }, player);
  const second = actor.getFlag("ak5e", "operatorSkills").operatorEvents.find(event => event.activationId === "pioneer-activate-10" && event.kind === "activation");
  assert.equal(second?.spSpent, 10);
  const stateAfterThreshold = JSON.stringify(actor.flags.ak5e);
  assert.match(stateAfterThreshold, /Aura of /, "actual cumulative expenditure grants an additional aura choice");
  assert.match(stateAfterThreshold, /Tip of the Spear|tipOfTheSpear/i, "the same threshold offers its Tip use");
  assert.equal(actor.getFlag("ak5e", "operatorSkills").points, 25, "Auramancy spends no additional 20 SP");

  await executeOperatorCommand(actor, { id: "pioneer-activate-10", command: "activate", data: { itemId: secondSkill.id } }, player);
  assert.equal(JSON.stringify(actor.flags.ak5e), stateAfterThreshold, "replaying a committed activation cannot grant a second threshold");
  await vanguardUses.command(actor, "undoOperatorActivation", { activationId: second.activationId, confirmed: true }, "pioneer-undo-10");
  await vanguardUses.undo(actor, "pioneer-undo-10");
  assert.equal(actor.getFlag("ak5e", "operatorSkills").points, 35, "undo restores the exact SP previously spent by the 10-SP activation");
});

test("Moment of Power derives Tactical Burst count from activation SP and Skill Haste tracks the activating Turn and active Skill", async () => {
  const api = await loadPioneer();
  requirePioneer(api);
  const actor = pioneerActor(4, { flags: { operatorSkills: { enabled: true, points: 35, maximum: 50, start: 0, active: null, operatorEvents: [], receipts: [] } } });
  const skill = createTestItem({ name: "25 SP Pioneer Skill", type: "feat", flags: { ak5e: {
    operatorSkill: { sourceId: "pioneer-test-25", cost: 25, start: 0, methods: ["automatic"], activation: "Action", duration: "Instant" }
  } } }, actor);
  actor.items.set(skill.id, skill);
  await executeOperatorCommand(actor, { id: "pioneer-activate-25", command: "activate", data: { itemId: skill.id } }, game.user);
  const actual = actor.getFlag("ak5e", "operatorSkills").operatorEvents.find(event => event.activationId === "pioneer-activate-25" && event.kind === "activation");
  assert.equal(actual?.spSpent, 25);
  const controls = vanguardOwnerControls(vanguardExtensionContext(actor, { branchId: PIONEER_ID, level: 4, purpose: "controls" }));
  const power = controls.find(control => /moment of power|tactical burst|skill haste/i.test(`${control.label ?? ""} ${control.hint ?? ""}`));
  assert.ok(power, "Moment of Power is surfaced to the owner");
  const evidence = JSON.stringify([controls, actor.getFlag("ak5e", "vanguard"), game.messages]);
  assert.match(evidence, /3.*Tip|Tip.*3/i, "25 actual SP permits one Tip plus two additional Tips");
  assert.match(evidence, /Skill Haste/i, "Skill Haste is presented as an attack benefit, not an automatic attack roll");
});

test("Cycle of Violence adds the three level-10 auras and refunds Vanguard-level SP only after a qualifying Skill ends", async () => {
  const api = await loadPioneer();
  requirePioneer(api);
  const player = { id: "pioneer-cycle-owner", isGM: false };
  game.user = player;
  game.users = new Map([[player.id, player]]);
  game.users.activeGM = null;
  const actor = pioneerActor(10, { ownership: { default: 0, [player.id]: 3 }, flags: { operatorSkills: {
    enabled: true, points: 60, maximum: 80, start: 0, active: null, operatorEvents: [], receipts: []
  } } });
  const controls = vanguardOwnerControls(vanguardExtensionContext(actor, { branchId: PIONEER_ID, level: 10, purpose: "controls" }));
  const visible = JSON.stringify(controls);
  for (const aura of ["Pressure", "Shadows", "Vigilance"]) assert.match(visible, new RegExp(`Aura of ${aura}`, "i"));
  const skill = createTestItem({ name: "Cycle test Skill", type: "feat", flags: { ak5e: {
    operatorSkill: { sourceId: "cycle-test-skill", cost: 20, start: 0, methods: ["automatic"], activation: "Action", duration: "10 Rounds" }
  } } }, actor);
  const capSkill = createTestItem({ name: "Cycle cap Skill", type: "feat", flags: { ak5e: {
    operatorSkill: { sourceId: "cycle-cap-skill", cost: 60, start: 0, methods: ["automatic"], activation: "Action", duration: "Instant" }
  } } }, actor);
  actor.items.set(skill.id, skill);
  actor.items.set(capSkill.id, capSkill);
  const target = createTestActor({ name: "Cycle damage target", type: "npc", system: { attributes: { hp: { value: 5, max: 5, temp: 0 } } } });
  const updateTarget = target.update.bind(target);
  target.update = async (changes, options = {}) => {
    await Hooks.callAll("preUpdateActor", target, changes, options, game.user.id);
    const result = await updateTarget(changes, options);
    await Hooks.callAll("updateActor", target, changes, options, game.user.id);
    return result;
  };

  await executeOperatorCommand(actor, { id: "cycle-no-kill-activate", command: "activate", data: { itemId: skill.id } }, player);
  assert.equal(actor.getFlag("ak5e", "operatorSkills").operatorEvents.find(event => event.activationId === "cycle-no-kill-activate" && event.kind === "activation")?.spSpent, 20,
    "the test starts with a real committed Operator Skill activation");
  await executeOperatorCommand(actor, { id: "cycle-no-kill-end", command: "end" }, player);
  assert.equal(actor.getFlag("ak5e", "operatorSkills").points, 40, "a Skill that ends without reducing a Creature to 0 HP refunds no SP");

  await executeOperatorCommand(actor, { id: "cycle-kill-activate", command: "activate", data: { itemId: skill.id } }, player);
  const other = createTestActor({ name: "Other kill source", type: "character" });
  await target.update({ "system.attributes.hp.value": 0 });
  await emitAk5eEvent("kill", { actorUuid: target.uuid, hpAfter: 0, eventId: "cycle-kill-unattributed" });
  await emitAk5eEvent("kill", { actorUuid: target.uuid, sourceActorUuid: other.uuid, hpAfter: 0, eventId: "cycle-kill-other-source" });
  assert.equal(actor.getFlag("ak5e", "operatorSkills").points, 20,
    "unattributed kills and kills caused by another Actor do not qualify for Cycle of Violence");
  await emitAk5eEvent("kill", { actorUuid: target.uuid, sourceActorUuid: actor.uuid, hpAfter: 0, eventId: "cycle-kill-pioneer-source" });
  await executeOperatorCommand(actor, { id: "cycle-kill-end", command: "end" }, player);
  assert.equal(actor.getFlag("ak5e", "operatorSkills").points, 30,
    "the level-10 Vanguard regains 10 SP when a Creature reaches 0 HP during the Skill");
});

test("Breakthrough is a separate level-17 Elite slot across the five allowed classes and exchanges on Long Rest", async () => {
  const api = await loadPioneer();
  requirePioneer(api);
  const actor = pioneerActor(17, { flags: { operatorSkills: { enabled: true, points: 7, maximum: 12, start: 4, active: null } } });
  const view = getOperatorSkillChoices(actor);
  const slot = view.slots.find(entry => /breakthrough/i.test(`${entry.key} ${entry.label ?? ""}`));
  assert.ok(slot, "Pioneer receives a separate additional Elite Operator Skill slot");
  assert.equal(slot.tier, "Elite");
  const allowed = CHAPTER_THREE_CLASSES.filter(entry => entry.operatorSkill?.tier === "Elite" && ELITE_CLASSES.has(entry.parentClass));
  const options = slot.options.map(entry => entry.id);
  for (const parentClass of ELITE_CLASSES) {
    const classOptions = allowed.filter(entry => entry.parentClass === parentClass);
    assert.ok(classOptions.length > 0, `the source catalog includes eligible ${parentClass} Elite Skills`);
    assert.ok(classOptions.some(entry => options.includes(entry.id)), `Breakthrough includes ${parentClass} Elite Skills`);
  }
  assert.ok(options.every(id => allowed.some(entry => entry.id === id)), "no non-Elite or ineligible class Skill is offered");
  const visible = JSON.stringify(slot);
  assert.match(visible, /charging method/i, "the slot documents that its Skill's normal Charging Method is ignored");
  assert.match(visible, /long rest/i, "the slot offers replacement after completing a Long Rest");
});

