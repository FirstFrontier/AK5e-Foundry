import test from "node:test";
import assert from "node:assert/strict";
// Namespace imports: a renamed or missing export fails only the test that needs it,
// not the whole file, so each B-309 spec item reports its own red reason.
import * as extensions from "../scripts/vanguard-extensions.mjs";
import * as uses from "../scripts/vanguard-uses.mjs";
import * as trigger from "../scripts/trigger-events.mjs";
import * as features from "../scripts/agent-features.mjs";
import * as sheet from "../scripts/agent-sheet.mjs";
import * as progression from "../scripts/vanguard-progression.mjs";
import * as rules from "../scripts/vanguard-rules.mjs";
import * as origin from "../scripts/origin-setup.mjs";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem } from "./base-classes-fixture.mjs";

// B-309 challenger suite, written from the spec (bugs/pending/B-309-*.md, Ch.3 Agent text,
// DECISIONS.md Agent rulings, WORKFLOW §3.2). Fixtures mirror vanguard-agent-frozen.test.mjs.
// Spec items:
//  1. Consummate Professional grants Mechanism Kit proficiency under the registered key ak5emechanismkit.
//  2. Closing the Case damage = 1d8 per qualifying hit, 2d8 per hit at actual Vanguard level 14+ (vanguardLevel(actor)).
//  3. Agent Level is an undefined reading: public per-use choice unless a recorded GM ruling applies; ruling supersedes;
//     a player's temporary choice never persists as a ruling.
//  4. Expertise in an unproficient Skill warns, does not apply without override, applies with override (warn, never block).
//  5. Edge/negative: missing or invalid data does not raise uncaught runtime faults; undo restores state.

const MECHANISM_KEY = "ak5emechanismkit";
const BRANCH = "subclass-vanguard-agent";
const vanguardUses = uses.vanguardUses;

function agent(level = 10, { owner = true, extraItems = [] } = {}) {
  const klass = createTestItem({ name: "Vanguard", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: rules.VANGUARD_CLASS_ID } } });
  const branch = createTestItem({ name: "Agent", type: "subclass", system: { levels: 1 },
    flags: { ak5e: { chapterThreeId: BRANCH } } });
  return createTestActor({ name: "Agent", owner, items: [klass, branch, ...extraItems], system: {
    attributes: { prof: Math.floor((level - 1) / 4) + 2, movement: { walk: 30 }, hp: { value: 30, max: 30, temp: 0 } },
    skills: { ste: { value: 1 }, sle: { value: 1 }, acr: { value: 0 } }
  }, flags: { ak5e: { vanguard: { enabled: true } } } });
}

function weapon(actor, name, { ranged = false, thrown = false } = {}) {
  const item = createTestItem({ name, type: "weapon", system: {
    actionType: ranged ? "rwak" : "mwak", type: { value: ranged ? "simpleR" : "simpleM" },
    properties: new Set(thrown ? ["thr"] : []), range: { value: ranged ? 20 : 5, long: ranged ? 60 : 5 }
  } }, actor);
  actor.items.set(item.id, item);
  return item;
}

function runtime(actor, level = actor ? rules.vanguardLevel(actor) : 1) {
  assert.equal(typeof features.registerAgentFeatureHooks, "function", "Agent rules hooks export registerAgentFeatureHooks");
  assert.equal(typeof sheet.registerAgentVanguardExtension, "function", "Agent sheet export registerAgentVanguardExtension");
  features.registerAgentFeatureHooks();
  sheet.registerAgentVanguardExtension();
  const context = extensions.vanguardExtensionContext(actor, { branchId: BRANCH, level, purpose: "controls" });
  const controls = extensions.vanguardOwnerControls(context);
  const control = pattern => {
    const found = controls.find(item => pattern.test(`${item.label ?? ""} ${item.hint ?? ""}`));
    assert.ok(found, `Agent owner control exists for ${pattern}`);
    assert.equal(typeof found.command, "string", "control routes through the shared use engine");
    return found;
  };
  return { context, controls, control };
}

function agentState(actor) {
  assert.ok(actor.flags.ak5e.agent, "Agent feature state is persisted on the Actor");
  return actor.flags.ak5e.agent;
}

async function hit(actor, item, target, id) {
  const snapshot = { uuid: target.uuid, name: target.name, hit: true, ac: 10 };
  const common = { actorUuid: actor.uuid, itemUuid: item.uuid, attackId: id, targets: [snapshot], targetUuids: [target.uuid] };
  await trigger.emitAk5eEvent("attack", { ...common, eventId: `attack:${id}` });
  await trigger.emitAk5eEvent("hit", { ...common, eventId: `hit:${id}`, targetUuid: target.uuid });
}

const playerUser = () => ({ id: "agent-player", name: "Player", isGM: false, targets: new Set() });
const gmUser = () => ({ id: "agent-gm", name: "GM", isGM: true, targets: new Set() });

async function shadowstrike(actor, id) {
  await vanguardUses.command(actor, "agentShadowstrike", { invisibleAtActionStart: true, confirmed: true }, id);
}

// Closing the Case submitted data. `extra` may carry an editable agentLevel; the spec says it must not drive damage.
const caseData = (target, extra = {}) => ({ targetUuid: target.uuid, targetName: target.name, targetVisible: true,
  targetDistanceFeet: 10, confirmed: true, ...extra });

// Run `fn` with a Roll whose evaluated total is forced to `total`; records every constructed formula.
async function withRollTotal(total, fn) {
  const OriginalRoll = globalThis.Roll;
  const formulas = [];
  globalThis.Roll = class extends OriginalRoll {
    constructor(formula, ...args) { super(formula, ...args); formulas.push(formula); }
    async evaluate(...args) { const value = await super.evaluate(...args); value.total = total; return value; }
  };
  try { return { result: await fn(), formulas }; }
  finally { globalThis.Roll = OriginalRoll; }
}

// The Agent Level reading is found by its public label rather than a fixed key, so the key name stays the implementer's choice.
function agentLevelReading() {
  const entry = Object.entries(vanguardUses.readings()).find(([, reading]) => /agent level/i.test(String(reading?.label ?? "")));
  return entry ? { key: entry[0], reading: entry[1] } : null;
}

// Second Strike requires an armed state: a qualifying Thrown ranged hit on the target, then a melee attack against it.
async function armSecondStrike(actor, target, id) {
  const thrown = weapon(actor, `Thrown ${id}`, { ranged: true, thrown: true });
  const melee = weapon(actor, `Melee ${id}`);
  await hit(actor, thrown, target, `${id}-ranged`);
  await hit(actor, melee, target, `${id}-melee`);
}

// Per-use Agent Level choice in the shared reading-engine protocol: the `readings` map, with no numeric agentLevel.
// Head ruling: a valid numeric agentLevel is a separate, legitimate public per-use path (see numericAgentLevelChoice).
function secondStrikeChoice(target, readingValue, extra = {}) {
  const found = agentLevelReading();
  return { benefit: "secondStrike", targetUuid: target.uuid, confirmed: true,
    ...(found && readingValue !== undefined ? { readings: { [found.key]: readingValue } } : {}), ...extra };
}

// Numeric per-use path: a valid agentLevel submitted with no readings map and no ruling.
function numericAgentLevelChoice(target, level) {
  return { benefit: "secondStrike", targetUuid: target.uuid, confirmed: true, agentLevel: level };
}

// Vanguard state rulings, read without assuming the reading key. Empty means no ruling is persisted.
function persistedRulingCount(actor) {
  return Object.keys(rules.vanguardState(actor).rulings ?? {}).length;
}

function levelChoices(extra = {}) {
  return { branch: BRANCH, martialDCAbility: "dex", saves: ["str"], skills: ["acr", "ath", "ste"],
    tool: "Messenger Kit", startingEquipment: { mode: "existing" }, ...extra };
}

async function assertNoRuntimeFault(fn, message) {
  try { return { value: await fn() }; }
  catch (error) {
    assert.ok(!(error instanceof TypeError) && !(error instanceof ReferenceError),
      `${message}: uncaught runtime fault ${error?.name}: ${error?.message}`);
    return { error };
  }
}

test.beforeEach(() => setupFoundryGlobals());
test.afterEach(() => teardownFoundryGlobals());

// ---------------------------------------------------------------- Spec item 1

test("B-309 item 1: Consummate Professional at Vanguard level 13 grants Mechanism Kit proficiency under ak5emechanismkit", async () => {
  sheet.registerAgentVanguardExtension();
  const actor = agent(13);
  const plan = await progression.previewVanguardProgression(actor, levelChoices({ hp: {} }));
  const granted = plan.writes[`system.tools.${MECHANISM_KEY}`];
  assert.ok(granted && Number(granted.value) >= 1,
    `plan writes system.tools.${MECHANISM_KEY} with value >= 1 (got ${JSON.stringify(granted)})`);
});

test("B-309 item 1: the Agent progression never creates the unregistered system.tools.mechanism key", async () => {
  sheet.registerAgentVanguardExtension();
  const actor = agent(13);
  const plan = await progression.previewVanguardProgression(actor, levelChoices({ hp: {} }));
  assert.equal(plan.writes["system.tools.mechanism"], undefined, "no write to the unregistered 'mechanism' tool key");
  const strayToolKeys = Object.keys(plan.writes).filter(key => /^system\.tools\.mechanism/.test(key));
  assert.deepEqual(strayToolKeys, [], "no mechanism-prefixed tool write of any kind");
});

test("B-309 item 1: the granted Mechanism Kit proficiency key is one that origin registration actually defines", async () => {
  sheet.registerAgentVanguardExtension();
  const previousDnd5e = globalThis.CONFIG?.DND5E;
  // The fixture CONFIG has no tool registry; supply the empty D&D5e containers the origin registration writes into.
  globalThis.CONFIG.DND5E = { ...(previousDnd5e ?? {}), tools: {}, toolProficiencies: {}, skills: {} };
  try {
    origin.registerOriginConfig();
    const registry = globalThis.CONFIG.DND5E.tools ?? {};
    assert.ok(registry[MECHANISM_KEY], `origin registration defines the ${MECHANISM_KEY} tool key`);
    assert.equal(registry[MECHANISM_KEY].label, "Mechanism Kit", "the registered key is labelled Mechanism Kit");
    const actor = agent(13);
    const plan = await progression.previewVanguardProgression(actor, levelChoices({ hp: {} }));
    const grantedKeys = Object.keys(plan.writes).filter(key => key.startsWith("system.tools.")).map(key => key.slice("system.tools.".length));
    assert.ok(grantedKeys.includes(MECHANISM_KEY), "the Agent progression grants a key that is in the registry");
    for (const key of grantedKeys) assert.ok(registry[key], `granted tool key ${key} is a registered tool`);
  } finally {
    globalThis.CONFIG.DND5E = previousDnd5e;
  }
});

test("B-309 item 1 boundary: Mechanism Kit proficiency is not granted at Vanguard level 12", async () => {
  sheet.registerAgentVanguardExtension();
  const actor = agent(12);
  const plan = await progression.previewVanguardProgression(actor, levelChoices({ hp: {} }));
  const granted = plan.writes[`system.tools.${MECHANISM_KEY}`];
  assert.ok(!granted || Number(granted.value) < 1, "level 12 has no Consummate Professional proficiency yet");
  assert.equal(plan.writes["system.tools.mechanism"], undefined, "no unregistered tool key at level 12 either");
});

// ---------------------------------------------------------------- Spec item 2

test("B-309 item 2: a level-10 Vanguard's Closing the Case is 1d8 per qualifying hit even when submitted data says Agent Level 20", async () => {
  const actor = agent(10);
  const { control } = runtime(actor, 10);
  const target = createTestActor({ name: "Level 10 case target" });
  game.user = playerUser();
  const knife = weapon(actor, "Thrown Knife", { ranged: true, thrown: true });
  await hit(actor, knife, target, "b309-l10-hit-1");
  await hit(actor, knife, target, "b309-l10-hit-2");
  await shadowstrike(actor, "b309-l10-shadow");
  await vanguardUses.command(actor, control(/Closing the Case/i).command, caseData(target, { agentLevel: 20 }), "b309-l10-case");
  const receipt = vanguardUses.receipt(actor, "b309-l10-case");
  assert.ok(receipt, "the Closing the Case use is recorded");
  assert.equal(receipt.formula, "2d8", "two qualifying hits at Vanguard level 10 are 2 x 1d8 (2d8), not scaled by the editable Agent Level 20");
});

test("B-309 item 2: the rolled Closing the Case dice match the actual Vanguard level, not the submitted Agent Level", async () => {
  const actor = agent(10);
  const { control } = runtime(actor, 10);
  const target = createTestActor({ name: "Level 10 roll target" });
  game.user = playerUser();
  const knife = weapon(actor, "Thrown Knife", { ranged: true, thrown: true });
  await hit(actor, knife, target, "b309-l10-roll-hit-1");
  await hit(actor, knife, target, "b309-l10-roll-hit-2");
  await shadowstrike(actor, "b309-l10-roll-shadow");
  await vanguardUses.command(actor, control(/Closing the Case/i).command, caseData(target, { agentLevel: 20 }), "b309-l10-roll-case");
  const { formulas } = await withRollTotal(6, () => vanguardUses.command(actor, "useRoll", { useId: "b309-l10-roll-case" }, "b309-l10-roll"));
  assert.ok(formulas.includes("2d8"), `the native roll is built as 2d8 (constructed formulas: ${JSON.stringify(formulas)})`);
  assert.ok(!formulas.includes("4d8"), "the editable Agent Level 20 never doubles the dice");
});

test("B-309 item 2 boundary: Vanguard level 13 keeps 1d8 per hit even when submitted data says Agent Level 14", async () => {
  const actor = agent(13);
  const { control } = runtime(actor, 13);
  const target = createTestActor({ name: "Level 13 target" });
  game.user = playerUser();
  const knife = weapon(actor, "Thrown Knife", { ranged: true, thrown: true });
  await hit(actor, knife, target, "b309-l13-hit-1");
  await hit(actor, knife, target, "b309-l13-hit-2");
  await shadowstrike(actor, "b309-l13-shadow");
  await vanguardUses.command(actor, control(/Closing the Case/i).command, caseData(target, { agentLevel: 14 }), "b309-l13-case");
  assert.equal(vanguardUses.receipt(actor, "b309-l13-case").formula, "2d8", "level 13 is still below the level-14 doubling threshold");
});

test("B-309 item 2 boundary: Vanguard level 14 doubles to 2d8 per hit even when submitted data says Agent Level 1", async () => {
  const actor = agent(14);
  const { control } = runtime(actor, 14);
  const target = createTestActor({ name: "Level 14 target" });
  game.user = playerUser();
  const knife = weapon(actor, "Thrown Knife", { ranged: true, thrown: true });
  await hit(actor, knife, target, "b309-l14-hit-1");
  await hit(actor, knife, target, "b309-l14-hit-2");
  await shadowstrike(actor, "b309-l14-shadow");
  await vanguardUses.command(actor, control(/Closing the Case/i).command, caseData(target, { agentLevel: 1 }), "b309-l14-case");
  assert.equal(vanguardUses.receipt(actor, "b309-l14-case").formula, "4d8", "two hits at level 14 are 2 x 2d8 (4d8)");
});

test("B-309 item 2: the Closing the Case owner control derives its formula from the actual level even if the context claims 14", async () => {
  const actor = agent(10);
  const { control } = runtime(actor, 10);
  const target = createTestActor({ name: "Context mismatch target" });
  game.user = playerUser();
  const knife = weapon(actor, "Thrown Knife", { ranged: true, thrown: true });
  await hit(actor, knife, target, "b309-ctx-hit-1");
  await hit(actor, knife, target, "b309-ctx-hit-2");
  const spoofed = extensions.vanguardExtensionContext(actor, { branchId: BRANCH, level: 14, purpose: "controls",
    targetUuid: target.uuid, targetVisible: true, targetDistanceFeet: 10 });
  const snapshot = await control(/Closing the Case/i).prepare(spoofed);
  assert.equal(snapshot.damageFormula, "2d8", "a level-10 Vanguard's control snapshot is 2 x 1d8 regardless of the claimed context level");
});

// ---------------------------------------------------------------- Spec item 3

test("B-309 item 3: the undefined Agent Level reading is registered with the shared reading engine and offered for Second Strike", async () => {
  const actor = agent(14);
  runtime(actor, 14);
  const target = createTestActor({ name: "Reading target" });
  game.user = playerUser();
  await armSecondStrike(actor, target, "b309-reading");
  const found = agentLevelReading();
  assert.ok(found, "an Agent Level reading is registered in vanguardUses.readings() (label mentions Agent Level)");
  assert.ok(found.reading.options.length >= 2, "the unresolved reading offers at least two public options");
  const preview = vanguardUses.preview(actor, "agentSurgical", { benefit: "secondStrike", targetUuid: target.uuid });
  const shown = preview.readings.find(entry => entry.key === found.key);
  assert.ok(shown, "Second Strike's preview lists the Agent Level reading");
  assert.equal(shown.value, undefined, "no ruling value is shown when none is recorded");
  assert.notEqual(shown.source, "ruling", "no ruling source is shown when none is recorded");
});

test("B-309 item 3: without a GM ruling or a per-use Agent Level choice, Second Strike applies nothing and records nothing", async () => {
  const actor = agent(14);
  runtime(actor, 14);
  const target = createTestActor({ name: "Silent target" });
  game.user = playerUser();
  await armSecondStrike(actor, target, "b309-silent");
  const before = structuredClone(agentState(actor).surgical.secondStrike);
  await assert.rejects(() => vanguardUses.command(actor, "agentSurgical",
    { benefit: "secondStrike", targetUuid: target.uuid, confirmed: true }, "b309-ss-silent"),
  /agent level|reading|choose|choice/i);
  assert.deepEqual(agentState(actor).surgical.secondStrike, before, "the armed Second Strike state is unchanged");
  assert.equal(vanguardUses.receipt(actor, "b309-ss-silent"), null, "no receipt is recorded for the refused use");
});

test("B-309 item 3: only a GM can record a ruling for the Agent Level reading, and the stored ruling is readable", async () => {
  const actor = agent(14);
  runtime(actor, 14);
  const found = agentLevelReading();
  assert.ok(found, "the Agent Level reading is registered before a ruling can be recorded");
  const value = found.reading.options[0].value;
  game.user = playerUser();
  await assert.rejects(() => uses.recordVanguardRuling(actor, found.key, value, "Table ruling: first reading applies."), /gm|game master/i);
  assert.equal(rules.vanguardState(actor).rulings?.[found.key], undefined, "a rejected non-GM ruling is not stored");
  game.user = gmUser();
  const record = await uses.recordVanguardRuling(actor, found.key, value, "Table ruling: first reading applies.");
  assert.equal(record?.value, value, "the GM ruling is returned with its value");
  assert.equal(rules.vanguardState(actor).rulings[found.key].value, value, "the GM ruling is persisted on the Vanguard state");
});

test("B-309 item 3: a recorded GM ruling supersedes a conflicting per-use Agent Level choice", async () => {
  const actor = agent(14);
  runtime(actor, 14);
  const target = createTestActor({ name: "Ruled target" });
  game.user = playerUser();
  const found = agentLevelReading();
  assert.ok(found, "the Agent Level reading is registered");
  const [ruled, playerPick] = found.reading.options.map(option => option.value);
  assert.ok(playerPick !== undefined && playerPick !== ruled, "two distinct readings exist to test supersession");
  game.user = gmUser();
  await uses.recordVanguardRuling(actor, found.key, ruled, "Table ruling: first reading applies.");
  game.user = playerUser();
  await armSecondStrike(actor, target, "b309-ruled");
  const preview = vanguardUses.preview(actor, "agentSurgical", { benefit: "secondStrike", targetUuid: target.uuid });
  const shown = preview.readings.find(entry => entry.key === found.key);
  assert.equal(shown?.value, ruled, "the preview shows the recorded ruling as the reading in force");
  assert.equal(shown?.source, "ruling", "the preview marks the reading as a GM ruling");
  const playerLabel = found.reading.options.find(option => option.value === playerPick).label;
  await vanguardUses.command(actor, "agentSurgical", secondStrikeChoice(target, playerPick), "b309-ss-ruled");
  const receipt = vanguardUses.receipt(actor, "b309-ss-ruled");
  assert.ok(receipt, "the ruled Second Strike is recorded");
  assert.notEqual(receipt.reading, playerLabel, "the conflicting per-use choice is not recorded as the reading in force");
});

test("B-309 item 3: a player's per-use Agent Level choice is public for that use only and never persists as a ruling", async () => {
  const actor = agent(14);
  runtime(actor, 14);
  const target = createTestActor({ name: "Temporary choice target" });
  game.user = playerUser();
  const found = agentLevelReading();
  assert.ok(found, "the Agent Level reading is registered");
  const [pick] = found.reading.options.map(option => option.value);
  const pickLabel = found.reading.options.find(option => option.value === pick).label;
  await armSecondStrike(actor, target, "b309-temp-1");
  await vanguardUses.command(actor, "agentSurgical", secondStrikeChoice(target, pick), "b309-ss-temp-1");
  const receipt = vanguardUses.receipt(actor, "b309-ss-temp-1");
  assert.equal(receipt.reading, pickLabel, "the player's reading is shown publicly on that use's receipt");
  assert.equal(receipt.readingSource, "player", "the receipt marks the reading as the player's per-use choice");
  assert.equal(rules.vanguardState(actor).rulings?.[found.key], undefined, "the player's choice is not stored as a Vanguard ruling");
  assert.equal(actor.flags.ak5e.vanguard?.rulings?.[found.key], undefined, "the player's choice is not stored in the flag either");
  assert.equal(persistedRulingCount(actor), 0, "no ruling of any key is persisted by a player's per-use choice");
  await armSecondStrike(actor, target, "b309-temp-2");
  await assert.rejects(() => vanguardUses.command(actor, "agentSurgical",
    { benefit: "secondStrike", targetUuid: target.uuid, confirmed: true }, "b309-ss-temp-2"), /agent level|reading|choose|choice/i);
  const next = vanguardUses.preview(actor, "agentSurgical", { benefit: "secondStrike", targetUuid: target.uuid });
  assert.notEqual(next.readings.find(entry => entry.key === found.key)?.source, "ruling",
    "the next use does not silently reuse the earlier player choice as a ruling");
  assert.equal(persistedRulingCount(actor), 0, "the later use still persists no ruling");
});

test("B-309 item 3: a valid numeric Agent Level with no ruling applies that level publicly for that use and persists no ruling", async () => {
  const actor = agent(14);
  runtime(actor, 14);
  const target = createTestActor({ name: "Numeric choice target" });
  game.user = playerUser();
  await armSecondStrike(actor, target, "b309-numeric");
  await vanguardUses.command(actor, "agentSurgical", numericAgentLevelChoice(target, 4), "b309-ss-numeric");
  const receipt = vanguardUses.receipt(actor, "b309-ss-numeric");
  assert.ok(receipt, "the numeric Second Strike use is recorded");
  assert.match(receipt.summary ?? "", /\b4\b/, "the applied Agent Level 4 appears in the receipt summary");
  assert.equal(receipt.readingSource, "player", "a numeric per-use choice is marked as the player's, not a ruling");
  assert.equal(typeof receipt.reading, "string", "the numeric per-use choice has a public reading string");
  assert.ok(receipt.reading.trim().length > 0, "the public reading string is non-empty");
  assert.match(receipt.reading, /\b4\b/, "the public reading string mentions the chosen level");
  assert.equal(persistedRulingCount(actor), 0, "a numeric per-use choice is never persisted as a ruling");
});

// ---------------------------------------------------------------- Spec item 4

test("B-309 item 4: Expertise in a proficient Skill previews with no Skill warning and applies", async () => {
  const actor = agent(1);
  const { control } = runtime(actor, 1);
  const expertise = control(/Expertise/i);
  const preview = vanguardUses.preview(actor, expertise.command, { skillId: "ste" });
  assert.deepEqual(preview.warnings, [], "a proficient Skill raises no warning");
  await vanguardUses.command(actor, expertise.command, { skillId: "ste", confirmed: true }, "b309-exp-ste");
  assert.equal(actor.system.skills.ste.value, 2, "Expertise in the proficient Skill applies");
});

test("B-309 item 4: Expertise in an unproficient Skill is warned and does not apply without the override", async () => {
  const actor = agent(1);
  const { control } = runtime(actor, 1);
  const expertise = control(/Expertise/i);
  const preview = vanguardUses.preview(actor, expertise.command, { skillId: "acr" });
  assert.ok(preview.warnings.some(warning => warning.id === "skill"), "the unproficient Skill carries the 'skill' warning id before confirmation");
  const refusal = await vanguardUses.command(actor, expertise.command, { skillId: "acr", confirmed: true }, "b309-exp-acr-plain").then(() => null, error => error);
  assert.ok(refusal, "without the override the unproficient Expertise is refused");
  assert.equal(refusal.name, "AK5eWarnings", "the refusal is the shared warning gate, not a hard error");
  assert.ok(refusal.warnings?.some(warning => warning.id === "skill"), "the refusal lists the 'skill' warning as the open item");
  assert.equal(actor.system.skills.acr.value, 0, "without the override the Skill is unchanged");
  assert.equal(vanguardUses.receipt(actor, "b309-exp-acr-plain"), null, "no receipt for the refused unproficient choice");
});

test("B-309 item 4: Expertise in an unproficient Skill applies once its warning is overridden, and undo restores it", async () => {
  const actor = agent(1);
  const { control } = runtime(actor, 1);
  const expertise = control(/Expertise/i);
  const preview = vanguardUses.preview(actor, expertise.command, { skillId: "acr" });
  const overrides = preview.warnings.map(warning => warning.id).filter(Boolean);
  assert.ok(overrides.length >= 1, "the warning carries an id the owner can override");
  await vanguardUses.command(actor, expertise.command, { skillId: "acr", overrides, confirmed: true }, "b309-exp-acr-override");
  assert.equal(actor.system.skills.acr.value, 2, "with the warning overridden the Expertise applies (trust the table)");
  assert.ok(vanguardUses.receipt(actor, "b309-exp-acr-override").overridden?.length, "the override is recorded on the receipt");
  await vanguardUses.command(actor, "undoUse", { useId: "b309-exp-acr-override", confirmed: true }, "b309-exp-acr-undo");
  assert.equal(actor.system.skills.acr.value, 0, "undo restores the unproficient Skill's prior value");
  assert.equal(vanguardUses.receipt(actor, "b309-exp-acr-override").status, "undone");
});

// ---------------------------------------------------------------- Spec item 5

test("B-309 item 5: undoing a rolled Closing the Case restores an owned target's temporary and regular HP", async () => {
  const actor = agent(10);
  const { control } = runtime(actor, 10);
  const target = createTestActor({ name: "Owned undo target", hp: { value: 20, max: 20, temp: 3 } });
  game.user = playerUser();
  const knife = weapon(actor, "Thrown Knife", { ranged: true, thrown: true });
  await hit(actor, knife, target, "b309-undo-hit");
  await shadowstrike(actor, "b309-undo-shadow");
  await vanguardUses.command(actor, control(/Closing the Case/i).command, caseData(target, { agentLevel: 10 }), "b309-undo-case");
  await withRollTotal(8, () => vanguardUses.command(actor, "useRoll", { useId: "b309-undo-case" }, "b309-undo-roll"));
  assert.equal(target.system.attributes.hp.temp, 0, "the roll consumes temporary HP first");
  assert.equal(target.system.attributes.hp.value, 15, "the remaining 5 damage reduces HP");
  await vanguardUses.command(actor, "undoUse", { useId: "b309-undo-case", confirmed: true }, "b309-undo-case-undo");
  assert.equal(target.system.attributes.hp.temp, 3, "undo restores the exact prior temporary HP");
  assert.equal(target.system.attributes.hp.value, 20, "undo restores the exact prior HP");
  assert.equal(vanguardUses.receipt(actor, "b309-undo-case").status, "undone");
});

test("B-309 item 5: undoing Second Strike restores the armed pending target and clears its applied record", async () => {
  const actor = agent(14);
  runtime(actor, 14);
  const target = createTestActor({ name: "Undo strike target" });
  game.user = playerUser();
  await armSecondStrike(actor, target, "b309-undo-ss");
  const armed = structuredClone(agentState(actor).surgical.secondStrike);
  assert.equal(armed.pendingTargetUuid, target.uuid, "precondition: Second Strike is armed for the target");
  const found = agentLevelReading();
  const pick = found?.reading.options[0].value;
  await vanguardUses.command(actor, "agentSurgical", secondStrikeChoice(target, pick), "b309-ss-undo");
  assert.equal(agentState(actor).surgical.secondStrike.pendingTargetUuid, null, "precondition: the use consumed the armed state");
  await vanguardUses.command(actor, "undoUse", { useId: "b309-ss-undo", confirmed: true }, "b309-ss-undo-undo");
  const restored = agentState(actor).surgical.secondStrike;
  assert.equal(restored.pendingTargetUuid, target.uuid, "undo re-arms Second Strike for the same target");
  assert.equal(restored.awaitingLevelChoice, true, "undo restores the awaiting-level state");
  assert.ok(!restored.lastApplied, "undo clears the applied Second Strike record");
  assert.equal(vanguardUses.receipt(actor, "b309-ss-undo").status, "undone");
});

test("B-309 item 5: Agent prepare and preview paths tolerate missing or invalid data without uncaught runtime faults", async () => {
  // (a) Expertise with no skill registry at all.
  const bare = agent(1);
  delete bare.system.skills;
  const bareRuntime = runtime(bare, 1);
  const expertise = bareRuntime.control(/Expertise/i);
  const prepared = await assertNoRuntimeFault(() => expertise.prepare(bareRuntime.context), "Expertise prepare with no skills");
  assert.ok(prepared.value, "Expertise still produces an owner choice without a skill registry");
  assert.deepEqual(prepared.value.expertiseChoice?.options ?? [], [], "no skills are offered when none exist");

  // (b) Closing the Case preview against a target the actor cannot resolve.
  const actor = agent(10);
  const { control } = runtime(actor, 10);
  const previewCase = await assertNoRuntimeFault(() => vanguardUses.preview(actor, control(/Closing the Case/i).command,
    { targetUuid: "Actor.b309-missing-target", targetVisible: true, targetDistanceFeet: 10, agentLevel: 10 }), "Closing the Case preview with an unknown target");
  assert.ok(previewCase.value, "the unknown-target preview still returns a reviewable preview");

  // (c) Closing the Case with a garbage Agent Level: a controlled refusal or a valid formula, never a runtime fault.
  const target = createTestActor({ name: "Invalid data target" });
  game.user = playerUser();
  const knife = weapon(actor, "Thrown Knife", { ranged: true, thrown: true });
  await hit(actor, knife, target, "b309-invalid-hit");
  await shadowstrike(actor, "b309-invalid-shadow");
  const attempt = await assertNoRuntimeFault(() => vanguardUses.command(actor, control(/Closing the Case/i).command,
    caseData(target, { agentLevel: "banana" }), "b309-invalid-case"), "Closing the Case with a garbage Agent Level");
  if (attempt.error) assert.equal(vanguardUses.receipt(actor, "b309-invalid-case"), null, "a refused garbage-level use records nothing");
  else assert.match(vanguardUses.receipt(actor, "b309-invalid-case").formula, /^\d+d8$/, "an accepted garbage-level use still has a valid dice formula");

  // (d) A hit event whose item cannot be resolved does not error inside the Agent handlers or corrupt hit state.
  const hitsBefore = structuredClone(agentState(actor).hits);
  const orphan = await trigger.emitAk5eEvent("hit", { eventId: "b309-orphan-hit", attackId: "b309-orphan",
    actorUuid: actor.uuid, itemUuid: "Item.b309-missing-weapon", targetUuid: target.uuid });
  assert.equal(orphan.errors, 0, "an unresolvable item does not raise a handler error");
  assert.deepEqual(agentState(actor).hits, hitsBefore, "an unresolvable item does not alter qualifying hit counts");

  // (e) Second Strike with nothing armed is warned, not applied.
  const idle = agent(14);
  runtime(idle, 14);
  const idleTarget = createTestActor({ name: "Unarmed target" });
  await assert.rejects(() => vanguardUses.command(idle, "agentSurgical",
    { benefit: "secondStrike", targetUuid: idleTarget.uuid, confirmed: true, agentLevel: 4 }, "b309-unarmed"),
  /next melee|requires|strike|warn|anyway/i);
  assert.equal(vanguardUses.receipt(idle, "b309-unarmed"), null, "no receipt for an unarmed Second Strike");
});
