/**
 * U1 challenger (adversarial, red expected): Guard base class + Artsblade subclass.
 *
 * Expectations come from the SOURCE TEXT, not from any implementation:
 *   - AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt: Guard L1740-2201 (Hit Points L1766-1767,
 *     Skills L1775, class table L1790-1812, Deadly Fighter L1843-1844, Press the Attack L1875-1893,
 *     Unrelenting L1895-1896, ASI L1905-1906, Unrelenting Upgraded L1928-1933, Unrelenting Aggression L1938-1941,
 *     Eternal Aggression L1946, Annihilation Protocol L1949) and Artsblade L2202-2417.
 *   - AK5e_1.3.1_Foundry_Source/01_chapter_1_changing_the_game.txt L211-212 (Martial DC).
 *   - WORKFLOW.md §3.2 (confirm before use, warn never block, dice only from the card's Roll button, undo, Cancel writes nothing).
 *
 * Dialog emulation follows play-uses-cancel.test.mjs: a nullish callback result resolves to the button's action name.
 * Dialogs with no scripted answer resolve null (the user closed them) and are recorded, never thrown.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { guardFixture, world } from "./guard-fixture.mjs";
import { martialDC } from "../scripts/guard-rules.mjs";
import { previewGuardProgression, applyGuardProgression } from "../scripts/guard-progression.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";
import { guardPreRollAttack, registerGuardFeatureHooks } from "../scripts/guard-features.mjs";
import { registerArtsbladeHooks, maxArtLevel } from "../scripts/artsblade-features.mjs";
import { emitAk5eEvent, getReactions, setReactionStore } from "../scripts/trigger-events.mjs";
import { getPool } from "../scripts/resource-pools.mjs";
import { opaqueKey } from "../scripts/operation-kernel.mjs";
import { openGuardControls } from "../scripts/guard-sheet.mjs";

/* ---------------------------------------------------------------- helpers */

function configuredWorld(combat = null) {
  const documents = world(combat);
  const reactionState = new Map();
  setReactionStore({
    read: actor => reactionState.get(actor.uuid),
    async write(actor, state) { reactionState.set(actor.uuid, structuredClone(state)); }
  });
  registerGuardFeatureHooks();
  registerArtsbladeHooks();
  return { game, documents };
}

/** A started combat in which the given actor is first in the turn order (Actor.other is second). */
function combatFor(actor, { id = "c-u1", round = 1, turn = 0 } = {}) {
  return {
    id, uuid: `Combat.${id}`, started: true, round, turn,
    combatant: { actor: { uuid: actor.uuid } },
    turns: [{ actor: { uuid: actor.uuid } }, { actor: { uuid: "Actor.other" } }]
  };
}

const use = (actor, command, data = {}, id) => guardUses.command(actor, command, { confirmed: true, ...data }, id);
const aggressionValue = actor => getPool(actor, "aggression").value;
const unrelentingValue = actor => getPool(actor, "unrelenting").value;

/** Resolves true when the call rejects with the Play warnings error that names the given warning id. */
async function rejectsWithWarning(promise, id) {
  await assert.rejects(promise, error => error.name === "AK5eWarnings" && error.warnings.some(w => w.id === id),
    `expected a non-blocking "${id}" warning`);
}

function addWeapon(actor, { id = "w-long", name = "Longsword", equipped = true, actionType = "mwak", activityId = "atk" } = {}) {
  const weapon = {
    id, uuid: `${actor.uuid}.Item.${id}`, type: "weapon", name,
    system: {
      equipped,
      activities: [{ id: activityId, type: "attack", actionType, attack: { type: { value: actionType === "mwak" ? "melee" : "ranged" } } }]
    },
    getFlag() { return undefined; }
  };
  actor.items.set(id, weapon);
  return weapon;
}

/** Roll stand-in: counts evaluations so tests can prove nothing was rolled before the owner clicked. */
function installRoll(total) {
  const calls = { evaluations: 0 };
  globalThis.Roll = class TestRoll {
    constructor(formula) { this.formula = formula; }
    async evaluate() { calls.evaluations += 1; this.total = total; return this; }
    async toMessage() { return this; }
  };
  return calls;
}

/** Lets pending promise continuations of the sheet's click handlers finish. */
async function flush() {
  for (let i = 0; i < 200; i += 1) await new Promise(resolve => setImmediate(resolve));
}

/**
 * DialogV2 emulation. `answers` are consumed in order: { title: RegExp, click: action | null (X close), elements }.
 * A `wait` with a `render` callback is the Guard panel: the render hook is handed a linkedom body so the test can click.
 */
function installDialogs(answers) {
  const dialogs = { titles: [], mismatches: [], unexpected: [], root: null, queue: answers.map(answer => ({ ...answer })) };
  const next = title => {
    dialogs.titles.push(title);
    const answer = dialogs.queue.shift();
    if (!answer) { dialogs.unexpected.push(title); return null; }
    if (!answer.title.test(title)) dialogs.mismatches.push(`expected ${answer.title} but got "${title}"`);
    return answer;
  };
  const run = async (buttons, options) => {
    const answer = next(options.window?.title ?? "");
    if (!answer || answer.click === null) return null;
    const button = buttons.find(candidate => candidate.action === answer.click);
    if (!button) { dialogs.mismatches.push(`no "${answer.click}" button in "${options.window?.title}"`); return null; }
    return (await button.callback?.(null, { form: { elements: answer.elements ?? {} } }, null)) ?? button.action;
  };
  globalThis.foundry.applications = { api: { DialogV2: {
    wait: async options => {
      if (typeof options.render === "function") {
        const { document } = parseHTML(`<html><body>${options.content}</body></html>`);
        dialogs.root = document.body;
        options.render(null, { element: document.body, close() {} });
        return null;
      }
      return run(options.buttons, options);
    },
    prompt: options => run([{ action: "ok", ...options.ok }], options),
    confirm: options => run([{ action: "yes", callback: () => true }, { action: "no", callback: () => false }], options)
  } } };
  return dialogs;
}

async function openSheet(actor, answers) {
  const dialogs = installDialogs(answers);
  await openGuardControls(actor);
  assert.ok(dialogs.root, "the Guard panel rendered");
  return dialogs;
}

async function clickGuardCommand(dialogs, cmd) {
  const el = dialogs.root.querySelector(`[data-guard-cmd="${cmd}"]`);
  assert.ok(el, `the Guard panel offers the ${cmd} command`);
  el.dispatchEvent(new dialogs.root.ownerDocument.defaultView.Event("click"));
  await flush();
}

/* ---------------------------------------------------------------- A. Martial DC (Ch.1 L211-212) */

test("Martial DC uses the chosen DEX modifier, not the higher STR modifier", () => {
  // Ch.1 L212: "A Character's Martial DC is equal to 8 + their Strength or Dexterity Bonus (their Choice) + their Proficiency Bonus."
  // Minimal contract martialDC(actor, ability). Fixture PB is 3; STR 16 (+3), DEX 12 (+1), so DEX must give 8 + 3 + 1 = 12, not the max 14.
  configuredWorld();
  const actor = guardFixture({ level: 5 });
  actor.system.abilities.str = { value: 16, mod: 3 };
  actor.system.abilities.dex = { value: 12, mod: 1 };
  assert.equal(martialDC(actor, "dex"), 12);
});

test("a Blade Art's Martial DC follows the ability chosen on each use", async () => {
  // Ch.1 L212 "(their Choice)"; the Guard panel asks per use (guard-sheet askMartialAbility). Same actor, two uses.
  configuredWorld();
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.system.abilities.str = { value: 16, mod: 3 };
  actor.system.abilities.dex = { value: 12, mod: 1 };
  const first = await use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe1", martialDcAbility: "str" }, "dc-str");
  const second = await use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe2", martialDcAbility: "dex" }, "dc-dex");
  assert.equal(first.martialDC, 14, "STR choice: 8 + PB 3 + STR 3");
  assert.equal(second.martialDC, 12, "DEX choice on the next use: 8 + PB 3 + DEX 1, not the higher STR value");
});

test("a Blade Art with no Martial DC ability chosen raises a non-blocking warning", async () => {
  // Ch.1 L212 "(their Choice)": the Actor must choose; the module warns and never blocks (WORKFLOW §3.2).
  configuredWorld();
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  await rejectsWithWarning(use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe1" }, "dc-none"), "martialDCAbility");
});

test.todo("a per-character stored Martial DC ability is offered without re-asking (Ch.1 L212): no public API stores or reads a saved Martial DC ability choice; the sheet prompts per use");

/* ---------------------------------------------------------------- B. Deadly Fighter (L1843-1844) */

function deadlyAttack(actor, { deadly = true } = {}) {
  const roll = { parts: ["1d20"], options: {} };
  const item = { name: "Greatsword", system: { properties: new Set(deadly ? ["deadly"] : []) } };
  return { config: { subject: { actor, actionType: "mwak", item }, rolls: [roll] }, roll };
}

function deadlyGuard() {
  const actor = guardFixture({ level: 5 });
  actor.flags.ak5e.guard.fightingStyle = "deadlyFighter";
  return actor;
}

test("the first Deadly attack in a Turn raises its Critical Range by 1", () => {
  // Ch.3 L1844: "The first time each Turn you make an Attack Roll using a Weapon with the Deadly Property, the Critical Range of that Attack is increased by 1."
  const actor = deadlyGuard();
  configuredWorld(combatFor(actor));
  const first = deadlyAttack(actor);
  guardPreRollAttack(first.config);
  assert.equal(first.roll.options.criticalSuccess, 19);
});

test("a second Deadly attack in the same Turn does not get the Critical Range benefit again", () => {
  // Ch.3 L1844: "The first time each Turn" - only one Deadly attack per Turn gets the benefit.
  const actor = deadlyGuard();
  configuredWorld(combatFor(actor, { round: 1 }));
  guardPreRollAttack(deadlyAttack(actor).config);
  const second = deadlyAttack(actor);
  guardPreRollAttack(second.config);
  assert.equal(second.roll.options.criticalSuccess, undefined, "the second attack in the same Turn must not be widened");
});

test("the Deadly benefit returns on the first Deadly attack of the next Turn", () => {
  // Ch.3 L1844: "each Turn" - the once-per-Turn limit resets at the start of the next Turn.
  const actor = deadlyGuard();
  const combat = combatFor(actor, { round: 1 });
  configuredWorld(combat);
  guardPreRollAttack(deadlyAttack(actor).config);
  combat.round = 2;
  const nextTurn = deadlyAttack(actor);
  guardPreRollAttack(nextTurn.config);
  assert.equal(nextTurn.roll.options.criticalSuccess, 19);
});

test("a non-Deadly weapon never gets the Deadly Critical Range increase", () => {
  // Ch.3 L1844: only "a Weapon with the Deadly Property".
  const actor = deadlyGuard();
  configuredWorld(combatFor(actor));
  const plain = deadlyAttack(actor, { deadly: false });
  guardPreRollAttack(plain.config);
  assert.equal(plain.roll.options.criticalSuccess, undefined);
});

/* ---------------------------------------------------------------- C. Unrelenting and Eternal Aggression (L1895-1896, L1946) */

test("Unrelenting at 18th level spends 1 use and changes no Aggression until the card is rolled", async () => {
  // Ch.3 L1895-1896 (Unrelenting: one use, Long Rest recovery); L1946 (roll 1d4 when a use is expended).
  // WORKFLOW §3.2 "no auto-rolled dice": the Eternal roll waits for the card's Roll button.
  configuredWorld();
  const actor = guardFixture({ level: 18, aggression: 2, unrelenting: 1 });
  const rolls = installRoll(3);
  await use(actor, "unrelenting", {}, "eternal-spend");
  assert.equal(unrelentingValue(actor), 0);
  assert.equal(aggressionValue(actor), 2, "no Aggression is refunded before the owner clicks Roll");
  assert.equal(rolls.evaluations, 0, "nothing is rolled automatically");
});

test("the Unrelenting card at 18th level exposes a 1d4 Roll control", async () => {
  // Ch.3 L1946: "When you expend a use of your Unrelenting Feature, roll 1d4".
  configuredWorld();
  const actor = guardFixture({ level: 18, aggression: 2, unrelenting: 1 });
  installRoll(3);
  await use(actor, "unrelenting", {}, "eternal-card");
  const receipt = guardUses.receipt(actor, "eternal-card");
  const hasRollControl = receipt.formula === "1d4" || receipt.rolls?.some(roll => roll.formula === "1d4");
  assert.ok(hasRollControl, "the chat card carries the Eternal Aggression 1d4 Roll control");
});

test("clicking the card's Roll adds the rolled 1d4 to Aggression", async () => {
  // Ch.3 L1946: "you recover expended Aggression equal to the amount rolled."
  configuredWorld();
  const actor = guardFixture({ level: 18, aggression: 2, unrelenting: 1 });
  const rolls = installRoll(3);
  await use(actor, "unrelenting", {}, "eternal-click");
  await use(actor, "useRoll", { useId: "eternal-click" }, "eternal-click-roll");
  assert.equal(rolls.evaluations, 1, "only the explicit Roll click evaluates the 1d4");
  assert.equal(aggressionValue(actor), 5, "2 + the rolled 3");
});

test("the Eternal Aggression refund is clamped to the Aggression maximum", async () => {
  // Ch.3 L1946 "recover expended Aggression": Aggression cannot exceed its maximum (8 at 18th level, L1810 table / L1807-1810 steps).
  configuredWorld();
  const actor = guardFixture({ level: 18, aggression: 7, unrelenting: 1 });
  installRoll(4);
  await use(actor, "unrelenting", {}, "eternal-clamp");
  await use(actor, "useRoll", { useId: "eternal-clamp" }, "eternal-clamp-roll");
  assert.equal(aggressionValue(actor), 8, "7 + 4 clamps at the maximum 8, not 11");
});

test("undoing an Unrelenting use restores the spent Unrelenting use", async () => {
  // WORKFLOW §3.2 "every change undoable within the encounter window".
  configuredWorld();
  const actor = guardFixture({ level: 18, aggression: 2, unrelenting: 1 });
  await use(actor, "unrelenting", {}, "eternal-undo-spend");
  await use(actor, "undoUse", { useId: "eternal-undo-spend" }, "eternal-undo-spend-undo");
  assert.equal(unrelentingValue(actor), 1);
  assert.equal(aggressionValue(actor), 2);
});

test("undoing after the Eternal roll restores Aggression to its value before the roll", async () => {
  // WORKFLOW §3.2 undo; the refund is a change the undo receipt must reverse.
  configuredWorld();
  const actor = guardFixture({ level: 18, aggression: 2, unrelenting: 1 });
  installRoll(3);
  await use(actor, "unrelenting", {}, "eternal-undo-roll");
  await use(actor, "useRoll", { useId: "eternal-undo-roll" }, "eternal-undo-roll-click");
  await use(actor, "undoUse", { useId: "eternal-undo-roll" }, "eternal-undo-roll-undo");
  assert.equal(aggressionValue(actor), 2, "the pre-roll Aggression is restored");
  assert.equal(unrelentingValue(actor), 1, "the Unrelenting use is restored");
});

test("below 18th level the Unrelenting card has no Eternal Aggression roll", async () => {
  // Ch.3 L1946 is a 18th level feature (class table L1810).
  configuredWorld();
  const actor = guardFixture({ level: 17, aggression: 2, unrelenting: 1 });
  await use(actor, "unrelenting", {}, "eternal-below");
  const receipt = guardUses.receipt(actor, "eternal-below");
  assert.equal(receipt.formula, undefined);
  assert.ok(!receipt.rolls?.some(roll => roll.formula === "1d4"), "no 1d4 Eternal roll below 18th level");
});

/* ---------------------------------------------------------------- D. Annihilation Protocol (L1949) */

function initiativeEvent(actor) {
  // Same shape as trigger-events.mjs handleUpdateCombatant: payload fields plus a raw container of live documents.
  return {
    eventId: `initiative:${actor.uuid}:u1`, actorUuid: actor.uuid, tokenUuid: null, combatantId: "cmb-guard1",
    initiative: 17, userId: "player", combatUuid: null, round: 1, turn: 0,
    raw: { actor, combat: null, combatant: { id: "cmb-guard1", actor } }
  };
}

test("Annihilation Protocol: rolling Initiative with 0 Unrelenting regains one use at 20th level", async () => {
  // Ch.3 L1949: "When you roll Initiative and have no uses of Unrelenting remaining, you regain one use."
  // Emitted as trigger-events.mjs emitAk5eEvent("initiative", payload); handlers receive one frozen event argument.
  const { documents } = configuredWorld();
  const actor = guardFixture({ level: 20, unrelenting: 0 });
  documents.set(actor.uuid, actor);
  await emitAk5eEvent("initiative", initiativeEvent(actor));
  assert.equal(unrelentingValue(actor), 1);
});

test("Annihilation Protocol does not add a use while one Unrelenting use remains", async () => {
  // Ch.3 L1949: the gain applies only when "no uses of Unrelenting remaining".
  const { documents } = configuredWorld();
  const actor = guardFixture({ level: 20, unrelenting: 1 });
  documents.set(actor.uuid, actor);
  await emitAk5eEvent("initiative", initiativeEvent(actor));
  assert.equal(unrelentingValue(actor), 1, "the pool stays at 1, it does not grow to 2");
});

test("Annihilation Protocol is not granted before 20th level", async () => {
  // Ch.3 L1949 is a 20th level feature (class table L1812).
  const { documents } = configuredWorld();
  const actor = guardFixture({ level: 19, unrelenting: 0 });
  documents.set(actor.uuid, actor);
  await emitAk5eEvent("initiative", initiativeEvent(actor));
  assert.equal(unrelentingValue(actor), 0);
});

test("Annihilation Protocol ignores a turn start with 0 Unrelenting", async () => {
  // Ch.3 L1949 triggers on rolling Initiative, not at a Turn start.
  const { documents } = configuredWorld();
  const actor = guardFixture({ level: 20, unrelenting: 0 });
  documents.set(actor.uuid, actor);
  await emitAk5eEvent("turnStart", { eventId: "turnStart:u1", actorUuid: actor.uuid, raw: { actor } });
  assert.equal(unrelentingValue(actor), 0);
});

/* ---------------------------------------------------------------- E. Guard progression (L1766-1767, L1790-1812, L1905-1906) */

function progressionChoices(extra = {}) {
  return {
    branch: "subclass-guard-artsblade", artPools: ["frost"], fightingStyle: "duelling", saves: ["con"],
    skills: ["ath", "acr", "ak5elore"], tool: "Maintenance Kit", startingEquipment: { mode: "cash" },
    ...extra
  };
}

async function applyProgression(actor, choices) {
  const preview = await previewGuardProgression(actor, choices);
  return applyGuardProgression(actor, { confirmed: true, contextKey: preview.contextKey, ...choices });
}

/** True when the progression choices are refused (preview or apply throws) and the Actor's abilities and skills are untouched. */
async function refused(actor, choices) {
  const before = JSON.stringify([actor.system.abilities, actor.system.skills]);
  try { await applyProgression(actor, choices); }
  catch { return { refused: true, unchanged: JSON.stringify([actor.system.abilities, actor.system.skills]) === before }; }
  return { refused: false, unchanged: JSON.stringify([actor.system.abilities, actor.system.skills]) === before };
}

function guardLevel4() {
  configuredWorld();
  const actor = guardFixture({ level: 4 });
  const create = actor.createEmbeddedDocuments.bind(actor);
  actor.createEmbeddedDocuments = async (type, data) => {
    const documents = await create(type, data);
    documents.forEach((document, index) => { document.type = data[index].type ?? type; document.parent = actor; document.uuid = `${actor.uuid}.Item.${document.id}`; });
    return documents;
  };
  return actor;
}

const progressionState = actor => actor.flags.ak5e.guardProgression ?? {};

test("applying level 4 with no HP or ASI choices does not mark levels 2-4 HP or the level-4 ASI as granted", async () => {
  // Ch.3 L1766-1767: HP at higher levels is a choice of d10 (or 6) + CON; L1905-1906: the ASI is taken when you reach 4th level.
  // Choices not supplied must stay pending, not be consumed as "existing".
  const actor = guardLevel4();
  await applyProgression(actor, progressionChoices());
  const state = progressionState(actor);
  for (const level of [2, 3, 4]) assert.ok(!(state.hpLevels ?? []).includes(level), `level ${level} HP must stay pending`);
  assert.ok(!(state.asiLevels ?? []).includes(4), "the level 4 ASI must stay pending");
});

test("a later explicit HP roll and +2 STR at level 4 are applied", async () => {
  // Ch.3 L1905-1906: "increase one Ability Score of your choice by 2" at 4th level; L1767 HP at higher levels.
  const actor = guardLevel4();
  await applyProgression(actor, progressionChoices());
  const hpBefore = actor.system.attributes.hp.max;
  await applyProgression(actor, progressionChoices({
    hp: { 2: { mode: "fixed", roll: 6 } },
    asi: { 4: { increases: [{ ability: "str", amount: 2 }] } }
  }));
  assert.equal(actor.system.abilities.str.value, 20, "STR 18 + 2 at the level-4 ASI");
  assert.equal(actor.system.attributes.hp.max - hpBefore, 9, "fixed 6 + CON modifier 3 for level 2");
});

test("an ASI of +6 to one ability is refused", async () => {
  // Ch.3 L1905-1906: +2 to one Ability Score, or +1 to two; nothing larger.
  const actor = guardLevel4();
  const result = await refused(actor, progressionChoices({ asi: { 4: { increases: [{ ability: "str", amount: 6 }] } } }));
  assert.equal(result.refused, true);
  assert.equal(result.unchanged, true);
});

test("an ASI of +2 and +2 to two abilities is refused", async () => {
  // Ch.3 L1905-1906: "increase one Ability Score ... by 2, or you can increase two Ability Scores of your choice by 1".
  const actor = guardLevel4();
  const result = await refused(actor, progressionChoices({
    asi: { 4: { increases: [{ ability: "str", amount: 2 }, { ability: "dex", amount: 2 }] } }
  }));
  assert.equal(result.refused, true);
  assert.equal(result.unchanged, true);
});

test("an ASI of +1 and +1 to two abilities is accepted", async () => {
  // Ch.3 L1905-1906: "increase two Ability Scores of your choice by 1" is a legal option.
  const actor = guardLevel4();
  await applyProgression(actor, progressionChoices({
    asi: { 4: { increases: [{ ability: "str", amount: 1 }, { ability: "dex", amount: 1 }] } }
  }));
  assert.equal(actor.system.abilities.str.value, 19);
  assert.equal(actor.system.abilities.dex.value, 15);
});

test("an ASI naming an unknown ability is refused", async () => {
  // Ch.3 L1905-1906: only the six Ability Scores may be increased.
  const actor = guardLevel4();
  const result = await refused(actor, progressionChoices({ asi: { 4: { increases: [{ ability: "zzz", amount: 2 }] } } }));
  assert.equal(result.refused, true);
});

test("an HP roll of 1000 is refused or clamped, never added raw", async () => {
  // Ch.3 L1767: "1d10 (or 6) + your Constitution Modifier per Guard Level after 1st": the largest legal gain is 10 + CON 3 = 13.
  // Fresh Actor with no earlier apply, so a silently ignored choice cannot make the gain look legal.
  const actor = guardLevel4();
  const hpBefore = actor.system.attributes.hp.max;
  const result = await refused(actor, progressionChoices({ hp: { 2: { mode: "rolled", roll: 1000 } } }));
  const gain = actor.system.attributes.hp.max - hpBefore;
  assert.ok(result.refused || (gain >= 0 && gain <= 13), `a 1000 HP roll must be refused or clamped; gained ${gain}`);
});

test("a non-numeric HP roll is not silently consumed", async () => {
  // Ch.3 L1767: the HP choice must be a die roll or the fixed average; "abc" is neither.
  // Acceptable: refused, or the level is left pending. Not acceptable: level 2 recorded as granted with no HP.
  const actor = guardLevel4();
  const hpBefore = actor.system.attributes.hp.max;
  const result = await refused(actor, progressionChoices({ hp: { 2: { mode: "rolled", roll: "abc" } } }));
  const granted = (progressionState(actor).hpLevels ?? []).includes(2);
  assert.ok(result.refused || !granted, "level 2 HP must not be recorded as granted when the roll is invalid");
  assert.ok(Number.isFinite(actor.system.attributes.hp.max) && actor.system.attributes.hp.max >= hpBefore, "HP stays a finite number");
});

test("a duplicate skill choice is refused", async () => {
  // Ch.3 L1775 (Skills): "Three from: Acrobatics, Athletics, Lore, Insight, Intimidation, Wilderness" - three different skills.
  const actor = guardLevel4();
  const result = await refused(actor, progressionChoices({ skills: ["ath", "ath", "acr"] }));
  assert.equal(result.refused, true);
  assert.equal(result.unchanged, true);
});

test("a skill outside the Guard list is refused", async () => {
  // Ch.3 L1775: Perception is not in the Guard skill list.
  const actor = guardLevel4();
  const result = await refused(actor, progressionChoices({ skills: ["ath", "acr", "prc"] }));
  assert.equal(result.refused, true);
  assert.equal(result.unchanged, true);
});

test("re-applying the same level 4 choices is idempotent", async () => {
  // WORKFLOW §3.2 / TEST_INFRA §3: progression is idempotent.
  const actor = guardLevel4();
  const choices = progressionChoices({
    hp: { 2: { mode: "fixed", roll: 6 } },
    asi: { 4: { increases: [{ ability: "str", amount: 2 }] } }
  });
  await applyProgression(actor, choices);
  const after = { hp: actor.system.attributes.hp.max, str: actor.system.abilities.str.value };
  await applyProgression(actor, choices);
  assert.deepEqual({ hp: actor.system.attributes.hp.max, str: actor.system.abilities.str.value }, after);
});

/* ---------------------------------------------------------------- F. Confirmation and Cancel on the Guard sheet (WORKFLOW §3.2) */

test("closing the Martial ability prompt with X writes nothing and records no Blade Art", async () => {
  // WORKFLOW §3.2 "Cancel changes zero state". guard-sheet.mjs askMartialAbility returns null on X.
  configuredWorld();
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.guardProgression = { choices: { artPools: ["frost"] } };
  const dialogs = await openSheet(actor, []);
  dialogs.queue.push(
    { title: /^Blade Art$/, click: "ok", elements: { artPool: { value: "frost" } } },
    { title: /choose Martial DC ability/, click: null });
  const writesBefore = actor.writes.length;
  await clickGuardCommand(dialogs, "bladeArt");
  assert.equal(dialogs.mismatches.length, 0, dialogs.mismatches.join("; "));
  assert.equal(actor.writes.length, writesBefore, "no Actor write after X");
  assert.equal(guardUses.state(actor).undo.length, 0, "no Blade Art receipt after X");
});

test("Continue on the Martial ability prompt with nothing chosen does not resolve to \"ok\" and records no Blade Art", async () => {
  // DialogV2 resolves a nullish callback to the action name. An empty select must not become the ability "ok".
  configuredWorld();
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.guardProgression = { choices: { artPools: ["frost"] } };
  const dialogs = await openSheet(actor, []);
  dialogs.queue.push(
    { title: /^Blade Art$/, click: "ok", elements: { artPool: { value: "frost" } } },
    { title: /choose Martial DC ability/, click: "ok", elements: { ability: { value: "" } } },
    { title: /Blade Art/, click: "use" },
    { title: /check before use/, click: "anyway" });
  await clickGuardCommand(dialogs, "bladeArt");
  const recorded = guardUses.state(actor).undo;
  assert.equal(recorded.length, 0, `no Blade Art may be recorded without a chosen ability (titles: ${dialogs.titles.join(" | ")})`);
});

test("Unrelenting from the Guard panel shows one up-front confirm and runs once", async () => {
  // WORKFLOW §3.2 confirm before use; the command's Use button is the only confirmation.
  configuredWorld();
  const actor = guardFixture({ level: 5 });
  const dialogs = await openSheet(actor, [{ title: /unrelenting/i, click: "use" }]);
  await clickGuardCommand(dialogs, "unrelenting");
  assert.equal(dialogs.titles.length, 1, `exactly one dialog (titles: ${dialogs.titles.join(" | ")})`);
  assert.equal(dialogs.mismatches.length, 0, dialogs.mismatches.join("; "));
  assert.equal(guardUses.state(actor).undo.length, 1, "the use is recorded once");
  assert.equal(unrelentingValue(actor), 0, "one Unrelenting use spent once");
});

test("Cancel on the Unrelenting up-front confirm writes nothing", async () => {
  // WORKFLOW §3.2 "Cancel changes zero state" (play-uses-cancel.test.mjs pattern).
  configuredWorld();
  const actor = guardFixture({ level: 5 });
  const dialogs = await openSheet(actor, [{ title: /unrelenting/i, click: "cancel" }]);
  const writesBefore = actor.writes.length;
  await clickGuardCommand(dialogs, "unrelenting");
  assert.equal(actor.writes.length, writesBefore);
  assert.equal(guardUses.state(actor).undo.length, 0);
  assert.equal(unrelentingValue(actor), 1);
});

test("closing the Unrelenting up-front confirm with X writes nothing", async () => {
  // WORKFLOW §3.2: X is a Cancel.
  configuredWorld();
  const actor = guardFixture({ level: 5 });
  const dialogs = await openSheet(actor, [{ title: /unrelenting/i, click: null }]);
  const writesBefore = actor.writes.length;
  await clickGuardCommand(dialogs, "unrelenting");
  assert.equal(actor.writes.length, writesBefore);
  assert.equal(guardUses.state(actor).undo.length, 0);
});

test("a Blade Art from the Guard panel has exactly one use confirmation (the up-front Use)", async () => {
  // AMBIGUOUS, head arbitration: the Arts Pool and Martial DC prompts are input forms. This test reads them as inputs,
  // so the only confirmation is the up-front "Use". If the head reads the "Confirm" form button as a confirmation, this is a double confirm.
  configuredWorld();
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.guardProgression = { choices: { artPools: ["frost"] } };
  const dialogs = await openSheet(actor, [
    { title: /^Blade Art$/, click: "ok", elements: { artPool: { value: "frost" } } },
    { title: /choose Martial DC ability/, click: "ok", elements: { ability: { value: "str" } } },
    { title: /Blade Art \(Frost\)/, click: "use" }
  ]);
  await clickGuardCommand(dialogs, "bladeArt");
  assert.equal(dialogs.mismatches.length, 0, dialogs.mismatches.join("; "));
  assert.equal(dialogs.titles.filter(title => /Blade Art \(Frost\)/.test(title)).length, 1, "one up-front use confirmation");
  assert.equal(guardUses.state(actor).undo.length, 1, "the Blade Art runs once");
});

test("Cancel on a second Blade Art's frequency warning from the Guard panel records nothing", async () => {
  // WORKFLOW §3.2 warn never block; Cancel changes nothing. Source: Ch.3 L2249 "You can only cast a Spellsword Art once per Turn."
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.guardProgression = { choices: { artPools: ["frost"] } };
  configuredWorld(combatFor(actor));
  await use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe1", martialDcAbility: "str" }, "sheet-first");
  const dialogs = await openSheet(actor, [
    { title: /^Blade Art$/, click: "ok", elements: { artPool: { value: "frost" } } },
    { title: /choose Martial DC ability/, click: "ok", elements: { ability: { value: "str" } } },
    { title: /Blade Art \(Frost\)/, click: "cancel" }
  ]);
  await clickGuardCommand(dialogs, "bladeArt");
  assert.equal(dialogs.mismatches.length, 0, dialogs.mismatches.join("; "));
  assert.equal(guardUses.state(actor).undo.length, 1, "only the first Blade Art is recorded");
});

test("Use anyway on a second Blade Art's frequency warning from the Guard panel proceeds", async () => {
  // WORKFLOW §3.2 warn never block: "Use anyway" proceeds and the card lists the override.
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.guardProgression = { choices: { artPools: ["frost"] } };
  configuredWorld(combatFor(actor));
  await use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe1", martialDcAbility: "str" }, "sheet-first-anyway");
  const dialogs = await openSheet(actor, [
    { title: /^Blade Art$/, click: "ok", elements: { artPool: { value: "frost" } } },
    { title: /choose Martial DC ability/, click: "ok", elements: { ability: { value: "str" } } },
    { title: /Blade Art \(Frost\)/, click: "use" }
  ]);
  await clickGuardCommand(dialogs, "bladeArt");
  assert.equal(dialogs.mismatches.length, 0, dialogs.mismatches.join("; "));
  const recorded = guardUses.state(actor).undo;
  assert.equal(recorded.length, 2, "the second Blade Art proceeds after Use anyway");
  assert.ok(recorded[1].overridden.length > 0, "the overridden warning is recorded on the use");
});

/* ---------------------------------------------------------------- G. Artsblade (L2202-2417) */

const bladeArtOnTarget = (actor, targetUuid, id, extra = {}) => use(actor, "bladeArt",
  { pool: "frost", targetUuid, martialDcAbility: "str", overrides: ["frequency"], ...extra }, id);

test("a second Blade Art in the same Turn on a different target does not claim a save was already made", async () => {
  // Ch.3 L2274: "Once a Creature has made a Saving Throw against your Blade Art, they do not need to make that Saving Throw again until the beginning of your next Turn."
  // No owner save was recorded for foe2, so the card must not say one was.
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  configuredWorld(combatFor(actor));
  await use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe1", martialDcAbility: "str" }, "saves-first");
  const second = await bladeArtOnTarget(actor, "Actor.foe2", "saves-second");
  assert.equal(second.immuneToSave, false);
  assert.doesNotMatch(guardUses.receipt(actor, "saves-second").summary, SAVE_CLAIM);
});

test("a second Blade Art on the same target with no owner save recorded does not claim a save was already made", async () => {
  // Ch.3 L2274: the exemption needs a Saving Throw actually made against the Blade Art this Turn.
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  configuredWorld(combatFor(actor));
  await use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe1", martialDcAbility: "str" }, "nosave-first");
  const second = await bladeArtOnTarget(actor, "Actor.foe1", "nosave-second");
  assert.equal(second.immuneToSave, false);
  assert.doesNotMatch(guardUses.receipt(actor, "nosave-second").summary, SAVE_CLAIM);
});

test("an owner save recorded in an earlier Turn does not exempt the target in this Turn", async () => {
  // Ch.3 L2274: the exemption lasts until the beginning of the Artsblade's next Turn.
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.guardUses = { undo: [], data: { bladeArtSaves: { [opaqueKey("Actor.foe1")]: { targetUuid: "Actor.foe1", combatId: "c-u1", untilTurnKey: "c-u1:1:0" } } } };
  configuredWorld(combatFor(actor, { round: 1, turn: 0 }));
  const result = await bladeArtOnTarget(actor, "Actor.foe1", "earlier-save");
  assert.equal(result.immuneToSave, false);
});

test("an owner save recorded this Turn exempts the same target from repeating it", async () => {
  // Ch.3 L2274: once a Creature has made the Saving Throw this Turn, it does not repeat it before your next Turn.
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.guardUses = { undo: [], data: { bladeArtSaves: { [opaqueKey("Actor.foe1")]: { targetUuid: "Actor.foe1", combatId: "c-u1", untilTurnKey: "c-u1:2:0" } } } };
  configuredWorld(combatFor(actor, { round: 1, turn: 0 }));
  const result = await bladeArtOnTarget(actor, "Actor.foe1", "this-save");
  assert.equal(result.immuneToSave, true);
  assert.match(guardUses.receipt(actor, "this-save").summary, /already made/);
});

test("Ultimate Blade Art lifts the once-per-Turn limit through the end of the next Turn only", async () => {
  // Ch.3 L2407: "Until the end of your next Turn, the restriction on how many times per Round you can cast Spellsword Arts is removed."
  const actor = guardFixture({ level: 17, branch: "artsblade" });
  const combat = combatFor(actor, { round: 1, turn: 0 });
  configuredWorld(combat);
  await use(actor, "ultimateBladeArt", {}, "ult-activate");
  await use(actor, "castSpellswordArt", { artName: "Blade Art", martialDcAbility: "str" }, "ult-cast-1");
  await use(actor, "castSpellswordArt", { artName: "Blade Art", martialDcAbility: "str" }, "ult-cast-2");
  combat.round = 2;
  await use(actor, "castSpellswordArt", { artName: "Blade Art", martialDcAbility: "str" }, "ult-cast-next-turn");
  combat.round = 3;
  await use(actor, "castSpellswordArt", { artName: "Blade Art", martialDcAbility: "str" }, "ult-expired-1");
  await rejectsWithWarning(
    use(actor, "castSpellswordArt", { artName: "Blade Art", martialDcAbility: "str" }, "ult-expired-2"), "frequency");
});

test("Spellsword Arts are cast at the Artsblade's fixed maximum Art level", () => {
  // Ch.3 L2212 and the Artsblade table L2217-2243: Maximum Art Level by Guard level.
  const table = [[1, 1], [4, 1], [5, 2], [8, 2], [9, 3], [12, 3], [13, 4], [16, 4], [17, 5], [20, 5]];
  for (const [level, expected] of table) assert.equal(maxArtLevel(level), expected, `level ${level}`);
});

test("a requested casting level is ignored: the Spellsword Art is cast at the maximum level", async () => {
  // Ch.3 L2212: "When you cast a Spellsword Art, you must cast it at the maximum level you can cast that Art at."
  const actor = guardFixture({ level: 13, branch: "artsblade" });
  configuredWorld();
  const result = await use(actor, "castSpellswordArt", { artName: "Blade Art", castingLevel: 1, martialDcAbility: "str" }, "fixed-level-13");
  assert.equal(result.castingLevel, 4, "level 13 maximum Art level is 4");
});

test("a second Spellsword Art in one Turn warns, and Use anyway proceeds", async () => {
  // Ch.3 L2249: "You can only cast a Spellsword Art once per Turn." Warn, never block (WORKFLOW §3.2).
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  configuredWorld(combatFor(actor));
  await use(actor, "castSpellswordArt", { artName: "Blade Art", martialDcAbility: "str" }, "freq-first");
  await rejectsWithWarning(
    use(actor, "castSpellswordArt", { artName: "Blade Art", martialDcAbility: "str" }, "freq-second"), "frequency");
  assert.equal(guardUses.state(actor).undo.length, 1, "the warned attempt records nothing");
  await use(actor, "castSpellswordArt", { artName: "Blade Art", martialDcAbility: "str", overrides: ["frequency"] }, "freq-anyway");
  assert.equal(guardUses.state(actor).undo.length, 2);
});

test("Cut Through Chaos with a selected equipped melee weapon uses that weapon's native attack, spends 1 use and the Reaction", async () => {
  // Ch.3 L2327-2331: "make a Melee Attack as a Reaction"; "You can use this Feature a number of times equal to your Proficiency Bonus".
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.resourcePools.cutThroughChaos = { value: 3, max: 3 };
  const weapon = addWeapon(actor);
  configuredWorld(combatFor(actor));
  const reactionsBefore = getReactions(actor).available;
  const result = await use(actor, "cutThroughChaos", { mode: "spellAttack", weaponUuid: weapon.uuid, activityId: "atk" }, "ctc-native");
  const receipt = guardUses.receipt(actor, "ctc-native");
  assert.deepEqual(receipt.nativeAttack, { weaponUuid: weapon.uuid, activityId: "atk" });
  assert.equal(receipt.formula, undefined, "no generic formula is substituted for the weapon attack");
  assert.equal(getPool(actor, "cutThroughChaos").value, 2, "one use is spent");
  assert.equal(getReactions(actor).available, reactionsBefore - 1, "the Reaction is spent");
  assert.equal(result.mode, "spellAttack");
});

test("Cut Through Chaos without a selected weapon warns and never uses a STR + PB formula", async () => {
  // Ch.3 L2327-2331: the attack is the Actor's melee Attack. The module must not invent a STR + PB attack roll.
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.resourcePools.cutThroughChaos = { value: 3, max: 3 };
  configuredWorld(combatFor(actor));
  await rejectsWithWarning(use(actor, "cutThroughChaos", { mode: "spellAttack" }, "ctc-noweapon"), "weapon");
  await use(actor, "cutThroughChaos", { mode: "spellAttack", overrides: ["weapon"] }, "ctc-noweapon-anyway");
  const receipt = guardUses.receipt(actor, "ctc-noweapon-anyway");
  assert.equal(receipt.formula, undefined, "no formula such as 1d20 + STR + PB");
  assert.equal(receipt.nativeAttack, undefined);
});

test("Cut Through Chaos warns when the selected weapon is not equipped", async () => {
  // Ch.3 L2327-2331: the Reaction uses the Actor's wielded melee weapon.
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.resourcePools.cutThroughChaos = { value: 3, max: 3 };
  const weapon = addWeapon(actor, { equipped: false });
  configuredWorld(combatFor(actor));
  await rejectsWithWarning(
    use(actor, "cutThroughChaos", { mode: "spellAttack", weaponUuid: weapon.uuid, activityId: "atk" }, "ctc-unequipped"), "weaponEquipped");
});

test("Cut Through Chaos warns when the selected weapon's attack is not a melee attack", async () => {
  // Ch.3 L2327-2331: "make a Melee Attack".
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.resourcePools.cutThroughChaos = { value: 3, max: 3 };
  const weapon = addWeapon(actor, { actionType: "rwak" });
  configuredWorld(combatFor(actor));
  await rejectsWithWarning(
    use(actor, "cutThroughChaos", { mode: "spellAttack", weaponUuid: weapon.uuid, activityId: "atk" }, "ctc-ranged"), "meleeWeapon");
});

test("undoing Cut Through Chaos restores its use, the Reaction and the ledger", async () => {
  // WORKFLOW §3.2 "every change undoable within the encounter window".
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.resourcePools.cutThroughChaos = { value: 3, max: 3 };
  const weapon = addWeapon(actor);
  configuredWorld(combatFor(actor));
  const reactionsBefore = getReactions(actor).available;
  await use(actor, "cutThroughChaos", { mode: "spellAttack", weaponUuid: weapon.uuid, activityId: "atk" }, "ctc-undo");
  await use(actor, "undoUse", { useId: "ctc-undo" }, "ctc-undo-click");
  assert.equal(getPool(actor, "cutThroughChaos").value, 3, "the use is restored");
  assert.equal(getReactions(actor).available, reactionsBefore, "the Reaction is restored");
  assert.equal(guardUses.receipt(actor, "ctc-undo").status, "undone", "the ledger records the undo");
});
