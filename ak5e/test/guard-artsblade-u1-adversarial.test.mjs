/**
 * U1 challenger (adversarial, red expected): Guard base class + Artsblade subclass.
 *
 * Expectations come from the SOURCE TEXT and the U1 spec, never from the implementation:
 *   - AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt: Guard L1740-2201 (Hit Points L1766-1767,
 *     Skills L1775, class table L1790-1812, Deadly Fighter L1843-1844, Press the Attack L1875-1893,
 *     Unrelenting L1895-1896, ASI L1905-1906, Eternal Aggression L1946, Annihilation Protocol L1949),
 *     Artsblade L2202-2417 (Augmented Assault L2245, Casting Spellsword Arts L2249, Resonance L2272-2274,
 *     Cut Through Chaos L2327-2331, Ultimate Blade Art L2407).
 *   - AK5e_1.3.1_Foundry_Source/01_chapter_1_changing_the_game.txt L212 (Martial DC).
 *   - WORKFLOW.md §3.2 (confirm before use, warn never block, dice only from the card's Roll button, undo, Cancel changes nothing).
 *   - bugs/pending B-129..B-150 (audit reproductions, used only as extra probes; their status is not assumed).
 *
 * Dialog emulation follows play-uses-cancel.test.mjs: a nullish callback result resolves to the button's action name.
 * Scripted answers are consumed in order; a fallback list answers later dialogs without consuming them, so tests that
 * are not about the dialog count still reach their write. Dialogs with no answer resolve null (closed) and are recorded.
 *
 * Interpretation notes (for the head to confirm):
 *   - Spec 9 "warned/rejected": an invalid ASI or skill pick passes only if it is rejected (throws) or warned and
 *     writes nothing. An illegal value that is warned and then applied fails here.
 *   - Spec 12 "exactly one confirm per use": the single up-front preview (with cost) is the use confirmation. Input
 *     forms (Blade Art, Cast Spellsword Art, Cut Through Chaos, Augmented Assault) and the Martial DC prompt collect
 *     input only and must not be labelled "Confirm" or "Use".
 *   - Spec 7 "stored choice": the stored key is not fixed by the spec. The stored-choice test sets the Vanguard/Marksman
 *     convention key (flags.ak5e.guard.martialDCAbility) and is marked KEY-ASSUMED.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { guardFixture, world } from "./guard-fixture.mjs";
import { martialDC } from "../scripts/guard-rules.mjs";
import { previewGuardProgression, applyGuardProgression } from "../scripts/guard-progression.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";
import { guardPreRollAttack, guardPostRollAttack, registerGuardFeatureHooks, resetDeadlyFighterLedger } from "../scripts/guard-features.mjs";
import { registerArtsbladeHooks, artsbladePreRollAttack, maxArtLevel } from "../scripts/artsblade-features.mjs";
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
const SAVE_CLAIM = /already made/i;

/** Resolves when the call rejects with the Play warnings error that names the given warning id. */
async function rejectsWithWarning(promise, id, message = `expected a non-blocking "${id}" warning`) {
  await assert.rejects(promise, error => error.name === "AK5eWarnings" && error.warnings.some(w => w.id === id), message);
}

/** Resolves when the call rejects with any non-blocking Play warning. */
async function rejectsWithAnyWarning(promise, message) {
  await assert.rejects(promise, error => error.name === "AK5eWarnings" && error.warnings.length > 0, message);
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

/** An Artsblade with its selected Arts Pools and, by default, one wielded (equipped) melee weapon: its Casting Unit (L2272). */
function artsblade({ level = 5, pools = ["frost"], weapon = true, equipped = true } = {}) {
  const actor = guardFixture({ level, branch: "artsblade" });
  actor.flags.ak5e.guardProgression = { choices: { artPools: pools } };
  if (weapon) addWeapon(actor, { equipped });
  return actor;
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
 * DialogV2 emulation. `answers` are consumed in order: { title: RegExp, click: action | action[] | null (X close), elements }.
 * `fallback` answers the matching later dialogs without being consumed. A `wait` with a `render` callback is the Guard panel.
 * Every shown dialog's title and body are recorded in `titles` and `bodies`.
 */
function installDialogs(answers, fallback = []) {
  const dialogs = { titles: [], bodies: [], labels: [], mismatches: [], unexpected: [], errors: [], root: null, queue: answers.map(answer => ({ ...answer })) };
  globalThis.ui = { ...globalThis.ui, notifications: { ...globalThis.ui?.notifications, error: message => dialogs.errors.push(String(message)) } };
  const pick = title => {
    const scripted = dialogs.queue.shift();
    if (scripted) {
      if (!scripted.title.test(title)) dialogs.mismatches.push(`expected ${scripted.title} but got "${title}"`);
      return scripted;
    }
    const fallbackAnswer = fallback.find(answer => answer.title.test(title));
    if (fallbackAnswer) return fallbackAnswer;
    dialogs.unexpected.push(title);
    return null;
  };
  const run = async (buttons, options) => {
    const title = options.window?.title ?? "";
    dialogs.titles.push(title);
    dialogs.bodies.push(String(options.content ?? ""));
    dialogs.labels.push(buttons.map(button => button.label ?? button.action));
    const answer = pick(title);
    if (!answer || answer.click === null || answer.click === undefined) return null;
    const clicks = Array.isArray(answer.click) ? answer.click : [answer.click];
    const action = clicks.find(candidate => buttons.some(button => button.action === candidate));
    if (!action) { dialogs.mismatches.push(`no ${JSON.stringify(clicks)} button in "${title}"`); return null; }
    const button = buttons.find(candidate => candidate.action === action);
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

async function openSheet(actor, answers, fallback = []) {
  const dialogs = installDialogs(answers, fallback);
  await openGuardControls(actor);
  assert.ok(dialogs.root, "the Guard panel rendered");
  return dialogs;
}

/** Input forms and the Martial DC prompt: they collect input only and are never a use confirmation. */
const INPUT_FORMS = /^(Blade Art|Cast Spellsword Art \(1 SP\)|Cut Through Chaos \(Reaction\)|Augmented Assault \(2 Aggression\)|.*: choose Martial DC ability)$/;
/** Shown dialogs that are use confirmations: not an input form and not a warnings list. */
function useConfirmations(dialogs) {
  return dialogs.titles.map((title, index) => ({ title, index })).filter(({ title }) => !INPUT_FORMS.test(title) && !/check before use/.test(title));
}
/** Every input form and the Martial DC prompt must not be labelled as a use confirm ("Confirm" or "Use"). */
function assertInputsAreNotConfirms(dialogs) {
  dialogs.titles.forEach((title, index) => {
    if (!INPUT_FORMS.test(title)) return;
    const labels = dialogs.labels[index] ?? [];
    assert.ok(!labels.includes("Confirm") && !labels.includes("Use"), `input "${title}" must not be labelled as a use confirm (labels: ${labels.join(", ")})`);
  });
}

/** A Cancel test only proves something if its prompt was really shown and no error was swallowed by the sheet. */
function assertPromptShown(dialogs, pattern, label) {
  assert.ok(dialogs.titles.some(title => pattern.test(title)), `${label} must be shown (titles: ${dialogs.titles.join(" | ") || "none"})`);
  assert.deepEqual(dialogs.errors, [], "the sheet must not swallow an error");
}

async function clickGuardCommand(dialogs, cmd) {
  const el = dialogs.root.querySelector(`[data-guard-cmd="${cmd}"]`);
  assert.ok(el, `the Guard panel offers the ${cmd} command`);
  el.dispatchEvent(new dialogs.root.ownerDocument.defaultView.Event("click"));
  await flush();
}

const POOL_IDS = ["aggression", "unrelenting", "spellswordPoints", "cutThroughChaos", "ultimateBladeArt"];
function poolSnapshot(actor) {
  return Object.fromEntries(POOL_IDS.map(id => {
    try { return [id, getPool(actor, id).value]; } catch { return [id, "undefined"]; }
  }));
}
/** Everything a Cancel must leave alone: Actor flags, Items, pool values. */
function stateSnapshot(actor) {
  return JSON.stringify({ flags: actor.flags, items: [...actor.items.keys()], pools: poolSnapshot(actor) });
}

/* ---------------------------------------------------------------- A. Martial DC (Ch.1 L212; spec 7) */

test("A1 [spec 7 | Ch.1 L212] Martial DC with the chosen DEX ability uses DEX, not the higher STR modifier", () => {
  // STR 16 (+3), DEX 12 (+1), PB 3: DEX choice gives 8 + 3 + 1 = 12; the module's current max gives 14.
  configuredWorld();
  const actor = guardFixture({ level: 5 });
  actor.system.abilities.str = { value: 16, mod: 3 };
  actor.system.abilities.dex = { value: 12, mod: 1 };
  assert.equal(martialDC(actor, "dex"), 12);
});

test("A2 [spec 7 | Ch.1 L212] Martial DC with the chosen STR ability uses STR", () => {
  configuredWorld();
  const actor = guardFixture({ level: 5 });
  actor.system.abilities.str = { value: 16, mod: 3 };
  actor.system.abilities.dex = { value: 12, mod: 1 };
  assert.equal(martialDC(actor, "str"), 14, "8 + PB 3 + STR 3");
});

test("A3 [spec 7] Before any choice, the higher of STR or DEX is the default Martial DC", () => {
  configuredWorld();
  const actor = guardFixture({ level: 5 });
  actor.system.abilities.str = { value: 16, mod: 3 };
  actor.system.abilities.dex = { value: 12, mod: 1 };
  assert.equal(martialDC(actor), 14, "no choice stored: default is the higher modifier (8 + 3 + 3)");
});

test("A4 [spec 7 | KEY-ASSUMED flags.ak5e.guard.martialDCAbility] A stored DEX choice makes the Martial DC use DEX", () => {
  configuredWorld();
  const actor = guardFixture({ level: 5 });
  actor.system.abilities.str = { value: 16, mod: 3 };
  actor.system.abilities.dex = { value: 12, mod: 1 };
  actor.flags.ak5e.guard.martialDCAbility = "dex";
  assert.equal(martialDC(actor), 12, "the stored choice DEX is used, not the higher STR");
});

test("A5 [spec 7 | per-use override] A per-use STR choice beats a stored DEX choice for that use", async () => {
  configuredWorld();
  const actor = artsblade({ level: 5 });
  actor.system.abilities.str = { value: 16, mod: 3 };
  actor.system.abilities.dex = { value: 12, mod: 1 };
  actor.flags.ak5e.guard.martialDCAbility = "dex";
  const result = await use(actor, "bladeArt", { pool: "frost", targetUuid: null, martialDcAbility: "str" }, "dc-override");
  assert.equal(result.martialDC, 14, "the per-use STR choice wins: 8 + 3 + 3");
});

test("A6 [spec 7 | Ch.1 L212] Each Blade Art uses the Martial DC ability chosen on that use", async () => {
  configuredWorld();
  const actor = artsblade({ level: 5 });
  actor.system.abilities.str = { value: 16, mod: 3 };
  actor.system.abilities.dex = { value: 12, mod: 1 };
  const first = await use(actor, "bladeArt", { pool: "frost", targetUuid: null, martialDcAbility: "str" }, "dc-str");
  const second = await use(actor, "bladeArt", { pool: "frost", targetUuid: null, martialDcAbility: "dex" }, "dc-dex");
  assert.equal(first.martialDC, 14, "STR choice: 8 + PB 3 + STR 3");
  assert.equal(second.martialDC, 12, "DEX choice on the next use: 8 + PB 3 + DEX 1, not the higher STR value");
});

test("A7 [spec 7 | Ch.1 L212] A Blade Art with no Martial DC ability chosen raises a non-blocking warning", async () => {
  configuredWorld();
  const actor = artsblade({ level: 5 });
  await rejectsWithWarning(use(actor, "bladeArt", { pool: "frost", targetUuid: null }, "dc-none"), "martialDCAbility");
});

test("A8 [spec 10 | Ch.1 L212] Panel: choosing DEX in the Martial DC prompt records DEX and a DC of 12 for that use", async () => {
  configuredWorld();
  const actor = artsblade({ level: 5 });
  actor.system.abilities.str = { value: 16, mod: 3 };
  actor.system.abilities.dex = { value: 12, mod: 1 };
  const dialogs = await openSheet(actor, [
    { title: /^Blade Art$/, click: "ok", elements: { artPool: { value: "frost" } } },
    { title: /choose Martial DC ability/, click: "ok", elements: { ability: { value: "dex" } } }
  ], [{ title: /^Blade Art \(/, click: ["use", "anyway"] }]);
  await clickGuardCommand(dialogs, "bladeArt");
  assert.equal(dialogs.mismatches.length, 0, dialogs.mismatches.join("; "));
  const receipt = guardUses.state(actor).undo.at(-1);
  assert.ok(receipt, "the Blade Art was recorded");
  assert.equal(receipt.data.martialDcAbility, "dex", "the prompt's DEX choice is the ability for this use");
  assert.equal(receipt.result.martialDC, 12);
});

test.todo("[spec 7 | Ch.1 L212] a stored Martial DC ability is offered without re-asking: the sheet prompts per use until a stored-choice UI exists");

/* ---------------------------------------------------------------- B. Deadly Fighter (Ch.3 L1843-1844; spec 8) */

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

test("B1 [spec 8 | Ch.3 L1844] The first Deadly attack in a Turn raises its Critical Range by 1", () => {
  resetDeadlyFighterLedger();
  const actor = deadlyGuard();
  configuredWorld(combatFor(actor));
  const first = deadlyAttack(actor);
  guardPreRollAttack(first.config);
  assert.equal(first.roll.options.criticalSuccess, 19);
});

test("B2 [spec 8 | Ch.3 L1844 'the first time each Turn'] A second Deadly attack in the same Turn is not widened", () => {
  // Real hook order: preRoll widens the attack, postRoll marks the Turn's benefit used because the roll was made.
  resetDeadlyFighterLedger();
  const actor = deadlyGuard();
  configuredWorld(combatFor(actor, { round: 1 }));
  const first = deadlyAttack(actor);
  guardPreRollAttack(first.config);
  guardPostRollAttack([first.roll], { subject: first.config.subject });
  const second = deadlyAttack(actor);
  guardPreRollAttack(second.config);
  assert.equal(second.roll.options.criticalSuccess, undefined, "the second attack in the same Turn must not be widened");
});

test("B2b [spec 8 | Ch.3 L1844 | postRoll ledger] A Deadly attack whose roll was cancelled (preRoll with no postRoll) leaves the Turn's benefit for the next attack", () => {
  resetDeadlyFighterLedger();
  const actor = deadlyGuard();
  configuredWorld(combatFor(actor, { round: 1 }));
  const cancelled = deadlyAttack(actor);
  guardPreRollAttack(cancelled.config);   // no postRoll: the roll dialog was cancelled
  const next = deadlyAttack(actor);
  guardPreRollAttack(next.config);
  assert.equal(next.roll.options.criticalSuccess, 19, "the cancelled attack did not use the Turn's benefit");
});

test("B3 [spec 8 | Ch.3 L1844] A non-Deadly attack first does not use up the Turn's Deadly benefit", () => {
  // \"The first time each Turn you make an Attack Roll using a Weapon with the Deadly Property\": only Deadly attacks count.
  resetDeadlyFighterLedger();
  const actor = deadlyGuard();
  configuredWorld(combatFor(actor, { round: 1 }));
  guardPreRollAttack(deadlyAttack(actor, { deadly: false }).config);
  const deadly = deadlyAttack(actor);
  guardPreRollAttack(deadly.config);
  assert.equal(deadly.roll.options.criticalSuccess, 19);
});

test("B4 [spec 8 | Ch.3 L1844 'each Turn'] The Deadly benefit returns on the first Deadly attack of the next Turn", () => {
  resetDeadlyFighterLedger();
  const actor = deadlyGuard();
  const combat = combatFor(actor, { round: 1 });
  configuredWorld(combat);
  const first = deadlyAttack(actor);
  guardPreRollAttack(first.config);
  guardPostRollAttack([first.roll], { subject: first.config.subject });
  combat.round = 2;
  const nextTurn = deadlyAttack(actor);
  guardPreRollAttack(nextTurn.config);
  assert.equal(nextTurn.roll.options.criticalSuccess, 19);
});

test("B5 [Ch.3 L1844] A non-Deadly weapon never gets the Deadly Critical Range increase", () => {
  resetDeadlyFighterLedger();
  const actor = deadlyGuard();
  configuredWorld(combatFor(actor));
  const plain = deadlyAttack(actor, { deadly: false });
  guardPreRollAttack(plain.config);
  assert.equal(plain.roll.options.criticalSuccess, undefined);
});

/* ---------------------------------------------------------------- C. Casting Unit (Ch.3 L2272) and Resonance (spec 3) */

test("C1 [spec 3 | Ch.3 L2272; Ch.4 Casting Unit] Blade Art with no weapon at all resolves with no warning, and its card does not waive Somatic Components", async () => {
  // Source (Ch.4 Casting Unit): wielding a Weapon with the Property lets you ignore Somatic Components. Nothing requires a Casting Unit.
  configuredWorld();
  const actor = artsblade({ level: 5, weapon: false });
  await assert.doesNotReject(use(actor, "bladeArt", { pool: "frost", targetUuid: null, martialDcAbility: "str" }, "cu-none"),
    "no Casting Unit warning may be raised");
  const step = guardUses.receipt(actor, "cu-none").manualSteps[0];
  assert.match(step, /No melee weapon is equipped/, "the card states that no wielded melee weapon is a Casting Unit");
  assert.doesNotMatch(step, /ignore the Somatic/, "the Somatic Components are not waived");
});

test("C2 [spec 3 | Ch.3 L2272] Blade Art with a wielded melee weapon raises no Casting Unit warning", async () => {
  configuredWorld();
  const actor = artsblade({ level: 5 });
  const result = await use(actor, "bladeArt", { pool: "frost", targetUuid: null, martialDcAbility: "str" }, "cu-wielded");
  assert.equal(result.formula, "2d6", "level 5 Blade Art cantrip is 2d6");
});

test("C3 [spec 3 | Ch.3 L2272; Ch.4 Casting Unit] An unequipped melee weapon resolves with no warning and does not waive Somatic Components", async () => {
  configuredWorld();
  const actor = artsblade({ level: 5, equipped: false });
  await assert.doesNotReject(use(actor, "bladeArt", { pool: "frost", targetUuid: null, martialDcAbility: "str" }, "cu-unequipped"),
    "no Casting Unit warning may be raised");
  const step = guardUses.receipt(actor, "cu-unequipped").manualSteps[0];
  assert.match(step, /No melee weapon is equipped/);
  assert.doesNotMatch(step, /ignore the Somatic/, "an unequipped weapon is not a Casting Unit");
});

test("C4 [spec 3 | Ch.3 L2272; Ch.4 Casting Unit] A wielded ranged weapon resolves with no warning and does not waive Somatic Components", async () => {
  configuredWorld();
  const actor = artsblade({ level: 5, weapon: false });
  addWeapon(actor, { id: "w-bow", name: "Longbow", actionType: "rwak", activityId: "shoot", equipped: true });
  await assert.doesNotReject(use(actor, "bladeArt", { pool: "frost", targetUuid: null, martialDcAbility: "str" }, "cu-ranged"),
    "no Casting Unit warning may be raised");
  const step = guardUses.receipt(actor, "cu-ranged").manualSteps[0];
  assert.match(step, /No melee weapon is equipped/, "a ranged weapon is not a melee Casting Unit");
  assert.doesNotMatch(step, /ignore the Somatic/);
});

test("C5 [spec 3 | Ch.3 L2249; Ch.4 Casting Unit] A Blade Art cast as a Spellsword Art with no wielded melee weapon resolves with no warning and does not waive Somatic Components", async () => {
  configuredWorld(combatFor(artsblade({ level: 5 })));
  const actor = artsblade({ level: 5, weapon: false });
  await assert.doesNotReject(use(actor, "castSpellswordArt", { artName: "Blade Art", martialDcAbility: "str" }, "cu-spell-none"),
    "no Casting Unit warning may be raised");
  const step = guardUses.receipt(actor, "cu-spell-none").manualSteps[0];
  assert.match(step, /No melee weapon is equipped/);
  assert.doesNotMatch(step, /ignore the Somatic/);
});

test("C6 [spec 3 | Ch.3 L2249, L2272] A Blade Art cast as a Spellsword Art with a wielded melee weapon does not warn", async () => {
  configuredWorld(combatFor(artsblade({ level: 5 })));
  const actor = artsblade({ level: 5 });
  const result = await use(actor, "castSpellswordArt", { artName: "Blade Art", martialDcAbility: "str" }, "cu-spell-wielded");
  assert.equal(result.castingLevel, 2, "level 5 maximum Art level is 2");
});

test("C7 [spec 3 | Ch.3 L2272, L2212] Artsblade source feature Items (Sword and Sorcery, Resonance) are granted at level 1", async () => {
  configuredWorld();
  const actor = guardFixture({ level: 1 });
  const create = actor.createEmbeddedDocuments.bind(actor);
  actor.createEmbeddedDocuments = async (type, data) => {
    const documents = await create(type, data);
    documents.forEach((document, index) => { document.type = data[index].type ?? type; document.parent = actor; document.uuid = `${actor.uuid}.Item.${document.id}`; });
    return documents;
  };
  const choices = {
    branch: "subclass-guard-artsblade", artPools: ["frost"], fightingStyle: "duelling", saves: ["con"],
    skills: ["ath", "acr", "ak5elore"], tool: "Maintenance Kit", startingEquipment: { mode: "cash" }
  };
  const preview = await previewGuardProgression(actor, choices);
  await applyGuardProgression(actor, { confirmed: true, contextKey: preview.contextKey, ...choices });
  const ids = [...actor.items.values()].map(item => item.flags?.ak5e?.chapterThreeId);
  assert.ok(ids.includes("subclass-feature-guard-artsblade-1st-level-sword-and-sorcery-205"), "Sword and Sorcery Item");
  assert.ok(ids.includes("subclass-feature-guard-artsblade-1st-level-resonance-4121"), "Resonance Item");
});

test("C8 [Ch.3 L2274 Improved Force | B-139] Crude Resonance's +1 applies to melee attack rolls only", async () => {
  // L2274-2275 Force (Crude): "Your Melee Attacks have a +1 bonus to their Attack and Damage Rolls ... until the end of your next Turn."
  configuredWorld(combatFor(artsblade({ level: 5 })));
  const actor = artsblade({ level: 5, pools: ["crude"] });
  await use(actor, "bladeArt", { pool: "crude", targetUuid: null, martialDcAbility: "str" }, "crude-melee");
  const melee = { subject: { actor, actionType: "mwak" }, rolls: [{ parts: ["1d20"], options: {} }] };
  artsbladePreRollAttack({ subject: melee.subject, rolls: melee.rolls });
  assert.ok(melee.rolls[0].parts.includes("1"), "the melee attack roll gains +1");
  const ranged = { subject: { actor, actionType: "rwak" }, rolls: [{ parts: ["1d20"], options: {} }] };
  artsbladePreRollAttack({ subject: ranged.subject, rolls: ranged.rolls });
  assert.deepEqual(ranged.rolls[0].parts, ["1d20"], "a ranged attack roll gains nothing");
});

test("C9 [Ch.3 L2274 Force (Crude) | B-139] Crude's +1 lasts through the end of the next Turn, including the other combatant's Turn", async () => {
  const combat = combatFor(artsblade({ level: 5 }));
  configuredWorld(combat);
  const actor = artsblade({ level: 5, pools: ["crude"] });
  await use(actor, "bladeArt", { pool: "crude", targetUuid: null, martialDcAbility: "str" }, "crude-turn");
  combat.turn = 1;
  const melee = { subject: { actor, actionType: "mwak" }, rolls: [{ parts: ["1d20"], options: {} }] };
  artsbladePreRollAttack({ subject: melee.subject, rolls: melee.rolls });
  assert.ok(melee.rolls[0].parts.includes("1"), "still active during the other combatant's Turn in the same Round");
});

/* ---------------------------------------------------------------- D. Unrelenting and Eternal Aggression (L1895-1896, L1946; spec 5) */

test("D1 [spec 5 | Ch.3 L1895-1896, L1946] Unrelenting at 18th level spends 1 use; nothing is rolled or refunded before the card's Roll", async () => {
  configuredWorld();
  const actor = guardFixture({ level: 18, aggression: 2, unrelenting: 1 });
  const rolls = installRoll(3);
  await use(actor, "unrelenting", {}, "eternal-spend");
  assert.equal(unrelentingValue(actor), 0);
  assert.equal(aggressionValue(actor), 2, "no Aggression is refunded before the owner clicks Roll");
  assert.equal(rolls.evaluations, 0, "nothing is rolled automatically");
});

test("D2 [spec 5 | Ch.3 L1946 | WORKFLOW §3.2] The Unrelenting card at 18th level exposes a 1d4 Roll", async () => {
  configuredWorld();
  const actor = guardFixture({ level: 18, aggression: 2, unrelenting: 1 });
  installRoll(3);
  await use(actor, "unrelenting", {}, "eternal-card");
  const entry = guardUses.uses(actor).find(use => use.id === "eternal-card");
  assert.equal(entry?.formula, "1d4", "the card carries the Eternal Aggression 1d4 roll for its Roll button");
});

test("D3 [spec 5 | Ch.3 L1946] Clicking the card's Roll evaluates the 1d4 once and adds it to Aggression", async () => {
  configuredWorld();
  const actor = guardFixture({ level: 18, aggression: 2, unrelenting: 1 });
  const rolls = installRoll(3);
  await use(actor, "unrelenting", {}, "eternal-click");
  await use(actor, "useRoll", { useId: "eternal-click" }, "eternal-click-roll");
  assert.equal(rolls.evaluations, 1, "only the explicit Roll click evaluates the 1d4");
  assert.equal(aggressionValue(actor), 5, "2 + the rolled 3");
});

test("D4 [spec 5 | Ch.3 L1946] The Eternal Aggression refund cannot exceed the Aggression maximum (8 at 18th level)", async () => {
  configuredWorld();
  const actor = guardFixture({ level: 18, aggression: 7, unrelenting: 1 });
  installRoll(4);
  await use(actor, "unrelenting", {}, "eternal-clamp");
  await use(actor, "useRoll", { useId: "eternal-clamp" }, "eternal-clamp-roll");
  assert.equal(aggressionValue(actor), 8, "7 + 4 clamps at the maximum 8, not 11");
});

test("D5 [WORKFLOW §3.2 undo] Undoing an Unrelenting use restores the spent use and the Aggression", async () => {
  configuredWorld();
  const actor = guardFixture({ level: 18, aggression: 2, unrelenting: 1 });
  await use(actor, "unrelenting", {}, "eternal-undo-spend");
  await use(actor, "undoUse", { useId: "eternal-undo-spend" }, "eternal-undo-spend-undo");
  assert.equal(unrelentingValue(actor), 1);
  assert.equal(aggressionValue(actor), 2);
});

test("D6 [WORKFLOW §3.2 undo | spec 5] Undoing after the Eternal roll restores the pre-roll Aggression and the use", async () => {
  configuredWorld();
  const actor = guardFixture({ level: 18, aggression: 2, unrelenting: 1 });
  installRoll(3);
  await use(actor, "unrelenting", {}, "eternal-undo-roll");
  await use(actor, "useRoll", { useId: "eternal-undo-roll" }, "eternal-undo-roll-click");
  await use(actor, "undoUse", { useId: "eternal-undo-roll" }, "eternal-undo-roll-undo");
  assert.equal(aggressionValue(actor), 2, "the pre-roll Aggression is restored");
  assert.equal(unrelentingValue(actor), 1, "the Unrelenting use is restored");
});

test("D7 [Ch.3 L1946, class table L1810] Below 18th level the Unrelenting card has no Eternal Aggression roll", async () => {
  configuredWorld();
  const actor = guardFixture({ level: 17, aggression: 2, unrelenting: 1 });
  await use(actor, "unrelenting", {}, "eternal-below");
  const entry = guardUses.uses(actor).find(use => use.id === "eternal-below");
  assert.equal(entry?.formula, null, "no 1d4 Eternal roll below 18th level");
});

/* ---------------------------------------------------------------- E. Annihilation Protocol (Ch.3 L1949; spec 6) */

function initiativeEvent(actor, { raw = { actor, combat: null, combatant: { id: "cmb-guard1", actor } } } = {}) {
  // Same shape as trigger-events.mjs handleUpdateCombatant: payload fields plus a raw container of live documents.
  return {
    eventId: `initiative:${actor.uuid}:u1`, actorUuid: actor.uuid, tokenUuid: null, combatantId: "cmb-guard1",
    initiative: 17, userId: "player", combatUuid: null, round: 1, turn: 0, raw
  };
}

test("E1 [spec 6 | Ch.3 L1949] Rolling Initiative with 0 Unrelenting at 20th level regains one use; a second roll with 1 left adds none", async () => {
  // Positive control and negative in one test: a silently inert handler cannot pass the negative on its own.
  const { documents } = configuredWorld();
  const actor = guardFixture({ level: 20, unrelenting: 0 });
  documents.set(actor.uuid, actor);
  await emitAk5eEvent("initiative", initiativeEvent(actor));
  assert.equal(unrelentingValue(actor), 1, "0 remaining: one use regained");
  await emitAk5eEvent("initiative", initiativeEvent(actor));
  assert.equal(unrelentingValue(actor), 1, "1 remaining: the pool stays at 1");
});

test("E2 [spec 6 | Ch.3 L1949 class table L1812] Annihilation Protocol is not granted before 20th level", async () => {
  // Positive control at 20th level in the same test (a dead handler would pass the 19th-level negative alone).
  const { documents } = configuredWorld();
  const actor = guardFixture({ level: 20, unrelenting: 0 });
  documents.set(actor.uuid, actor);
  await emitAk5eEvent("initiative", initiativeEvent(actor));
  assert.equal(unrelentingValue(actor), 1, "20th level: the handler fires");
  actor.items.get("class").system.levels = 19;
  actor.flags.ak5e.resourcePools.unrelenting.value = 0;
  await emitAk5eEvent("initiative", initiativeEvent(actor));
  assert.equal(unrelentingValue(actor), 0, "19th level: no regained use");
});

test("E3 [spec 6 | Ch.3 L1949] Annihilation Protocol triggers on rolling Initiative, not on a Turn start", async () => {
  const { documents } = configuredWorld();
  const actor = guardFixture({ level: 20, unrelenting: 0 });
  documents.set(actor.uuid, actor);
  await emitAk5eEvent("turnStart", { eventId: "turnStart:u1", actorUuid: actor.uuid, raw: { actor } });
  assert.equal(unrelentingValue(actor), 0, "a Turn start does not regain a use");
  await emitAk5eEvent("initiative", initiativeEvent(actor));
  assert.equal(unrelentingValue(actor), 1, "the Initiative roll does (positive control)");
});

test("E4 [spec 6 | actor derived from event] The handler finds the Actor from actorUuid when raw.actor is absent", async () => {
  const { documents } = configuredWorld();
  const actor = guardFixture({ level: 20, unrelenting: 0 });
  documents.set(actor.uuid, actor);
  await emitAk5eEvent("initiative", initiativeEvent(actor, { raw: {} }));
  assert.equal(unrelentingValue(actor), 1, "actorUuid resolves the Actor from the event");
});

/* ---------------------------------------------------------------- F. Guard progression (L1766-1767, L1790-1812, L1905-1906, L1775; spec 4, 9) */

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
const progressionSnapshot = actor => JSON.stringify({
  abilities: actor.system.abilities, skills: actor.system.skills, hp: actor.system.attributes.hp.max,
  items: [...actor.items.keys()], state: progressionState(actor)
});

/**
 * Preview then apply a choice set. Returns what happened: `rejected` (threw), `warnings` (from the preview) and
 * `changed` (any Actor write). Spec 9 passes an invalid choice only when it is rejected, or warned with no change.
 */
async function attempt(actor, choices) {
  const before = progressionSnapshot(actor);
  let rejected = false, warnings = [];
  try {
    const preview = await previewGuardProgression(actor, choices);
    warnings = preview.warnings ?? [];
    await applyGuardProgression(actor, { confirmed: true, contextKey: preview.contextKey, ...choices });
  } catch { rejected = true; }
  return { rejected, warnings, changed: progressionSnapshot(actor) !== before };
}

test("F1 [spec 4 | Ch.3 L1766-1767, L1905-1906] Applying with no HP or ASI choices does not mark levels 1-4 HP or the level 4 ASI as granted", async () => {
  // Defaulted "existing" choices must stay pending; marking them granted hides a later real roll or ASI.
  const actor = guardLevel4();
  await applyProgression(actor, progressionChoices());
  const state = progressionState(actor);
  for (const level of [1, 2, 3, 4]) assert.ok(!(state.hpLevels ?? []).includes(level), `level ${level} HP must stay pending`);
  assert.ok(!(state.asiLevels ?? []).includes(4), "the level 4 ASI must stay pending");
});

test("F2 [spec 4 | Ch.3 L1767, L1905-1906] A later explicit HP roll and +2 STR at level 4 are applied after an earlier apply", async () => {
  const actor = guardLevel4();
  await applyProgression(actor, progressionChoices());
  const hpBefore = actor.system.attributes.hp.max;
  await applyProgression(actor, progressionChoices({
    hp: { 2: { mode: "fixed", roll: 6 } },
    asi: { 4: { increases: [{ ability: "str", amount: 2 }] } }
  }));
  assert.equal(actor.system.abilities.str.value, 20, "STR 18 + 2 at the level 4 ASI");
  assert.equal(actor.system.attributes.hp.max - hpBefore, 9, "fixed 6 + CON modifier 3 for level 2");
});

test("F3 [spec 4 | WORKFLOW §3.2 / TEST_INFRA §3 idempotency] The same level 4 choices grant once; a second apply adds nothing", async () => {
  // The first apply must actually grant the choices, so a silently inert apply cannot pass the idempotency check.
  const actor = guardLevel4();
  const choices = progressionChoices({
    hp: { 2: { mode: "fixed", roll: 6 } },
    asi: { 4: { increases: [{ ability: "str", amount: 2 }] } }
  });
  const hpBefore = actor.system.attributes.hp.max;
  await applyProgression(actor, choices);
  assert.equal(actor.system.abilities.str.value, 20, "first apply: STR 18 + 2");
  assert.equal(actor.system.attributes.hp.max - hpBefore, 9, "first apply: +9 HP");
  const after = { hp: actor.system.attributes.hp.max, str: actor.system.abilities.str.value };
  await applyProgression(actor, choices);
  assert.deepEqual({ hp: actor.system.attributes.hp.max, str: actor.system.abilities.str.value }, after);
});

test("F4 [spec 9 | Ch.3 L1905-1906] An ASI of +6 to one ability is rejected or warned, and never written", async () => {
  const actor = guardLevel4();
  const result = await attempt(actor, progressionChoices({ asi: { 4: { increases: [{ ability: "str", amount: 6 }] } } }));
  assert.ok(result.rejected || result.warnings.length > 0, "an illegal ASI total must be rejected or warned");
  assert.equal(result.changed, false, "nothing is written for an illegal ASI");
});

test("F5 [spec 9 | Ch.3 L1905-1906] +2 to one ability plus +2 to another is rejected or warned, and never written", async () => {
  // "increase one Ability Score ... by 2, or you can increase two Ability Scores of your choice by 1".
  const actor = guardLevel4();
  const result = await attempt(actor, progressionChoices({
    asi: { 4: { increases: [{ ability: "str", amount: 2 }, { ability: "dex", amount: 2 }] } }
  }));
  assert.ok(result.rejected || result.warnings.length > 0, "an illegal ASI total must be rejected or warned");
  assert.equal(result.changed, false, "nothing is written for an illegal ASI");
});

test("F6 [Ch.3 L1905-1906] +1 and +1 to two abilities is a legal ASI and is applied", async () => {
  const actor = guardLevel4();
  await applyProgression(actor, progressionChoices({
    asi: { 4: { increases: [{ ability: "str", amount: 1 }, { ability: "dex", amount: 1 }] } }
  }));
  assert.equal(actor.system.abilities.str.value, 19);
  assert.equal(actor.system.abilities.dex.value, 15);
});

test("F7 [spec 9 | Ch.3 L1905-1906] An ASI naming an unknown ability is rejected or warned, and never written", async () => {
  const actor = guardLevel4();
  const result = await attempt(actor, progressionChoices({ asi: { 4: { increases: [{ ability: "zzz", amount: 2 }] } } }));
  assert.ok(result.rejected || result.warnings.length > 0, "an unknown ability must be rejected or warned");
  assert.equal(result.changed, false, "nothing is written for an unknown ability");
});

test("F8 [spec 9 | Ch.3 L1767] An HP roll of 1000 is rejected or warned, and the gain never exceeds the largest legal 10 + CON 3", async () => {
  const actor = guardLevel4();
  const hpBefore = actor.system.attributes.hp.max;
  const result = await attempt(actor, progressionChoices({ hp: { 2: { mode: "rolled", roll: 1000 } } }));
  const gain = actor.system.attributes.hp.max - hpBefore;
  assert.ok(gain <= 13, `a 1000 HP roll must never be added raw; gained ${gain}`);
  assert.ok(result.rejected || result.warnings.length > 0, "an out-of-range HP roll must be rejected or warned");
});

test("F9 [spec 9 | Ch.3 L1767] A non-numeric HP roll is rejected or warned and never recorded as granted", async () => {
  const actor = guardLevel4();
  const hpBefore = actor.system.attributes.hp.max;
  const result = await attempt(actor, progressionChoices({ hp: { 2: { mode: "rolled", roll: "abc" } } }));
  const granted = (progressionState(actor).hpLevels ?? []).includes(2);
  assert.ok(Number.isFinite(actor.system.attributes.hp.max) && actor.system.attributes.hp.max >= hpBefore, "HP stays a finite number");
  assert.ok(result.rejected || result.warnings.length > 0, "a non-numeric HP roll must be rejected or warned");
  assert.ok(result.rejected || !granted, "level 2 HP must not be recorded as granted for an invalid roll");
});

test("F10 [spec 9 | Ch.3 L1775] A duplicate skill choice is rejected or warned, and never written", async () => {
  // Ch.3 L1775: "Three from: Acrobatics, Athletics, Lore, Insight, Intimidation, Wilderness" - three different skills.
  const actor = guardLevel4();
  const result = await attempt(actor, progressionChoices({ skills: ["ath", "ath", "acr"] }));
  assert.ok(result.rejected || result.warnings.length > 0, "a duplicate skill must be rejected or warned");
  assert.equal(result.changed, false, "nothing is written for a duplicate skill");
});

test("F11 [spec 9 | Ch.3 L1775] A skill outside the Guard list (Perception) is rejected or warned, and never written", async () => {
  const actor = guardLevel4();
  const result = await attempt(actor, progressionChoices({ skills: ["ath", "acr", "prc"] }));
  assert.ok(result.rejected || result.warnings.length > 0, "a skill outside the Guard list must be rejected or warned");
  assert.equal(result.changed, false, "nothing is written for an invalid skill");
});

/* ---------------------------------------------------------------- G. Guard panel: Cancel, confirmation and previews (spec 10, 11, 12; B-302) */

test("G1 [spec 11 | WORKFLOW §3.2] Closing the Martial DC prompt with X writes nothing and records no Blade Art", async () => {
  configuredWorld();
  const actor = artsblade({ level: 5 });
  const dialogs = await openSheet(actor, [
    { title: /^Blade Art$/, click: "ok", elements: { artPool: { value: "frost" } } },
    { title: /choose Martial DC ability/, click: null }
  ]);
  const before = stateSnapshot(actor);
  const writesBefore = actor.writes.length;
  await clickGuardCommand(dialogs, "bladeArt");
  assert.equal(dialogs.mismatches.length, 0, dialogs.mismatches.join("; "));
  assertPromptShown(dialogs, /choose Martial DC ability/, "the Martial DC prompt");
  assert.equal(actor.writes.length, writesBefore, "no Actor write after X");
  assert.equal(stateSnapshot(actor), before, "no flag, Item or pool changed after X");
  assert.equal(guardUses.state(actor).undo.length, 0, "no Blade Art receipt after X");
});

test("G2 [spec 10] Continue on the Martial DC prompt with nothing chosen is not the ability \"ok\" and records no Blade Art", async () => {
  // DialogV2 resolves a nullish callback to the action name. An empty select must not become the ability "ok".
  configuredWorld();
  const actor = artsblade({ level: 5 });
  const dialogs = await openSheet(actor, [
    { title: /^Blade Art$/, click: "ok", elements: { artPool: { value: "frost" } } },
    { title: /choose Martial DC ability/, click: "ok", elements: { ability: { value: "" } } },
    { title: /Blade Art/, click: "use" }
  ], [{ title: /check before use/, click: "anyway" }]);
  await clickGuardCommand(dialogs, "bladeArt");
  const recorded = guardUses.state(actor).undo;
  assert.equal(recorded.length, 0, `no Blade Art may be recorded without a chosen ability (titles: ${dialogs.titles.join(" | ")})`);
});

test("G3 [spec 12 | WORKFLOW §3.2] Unrelenting from the panel shows exactly one up-front confirm and runs once", async () => {
  configuredWorld();
  const actor = guardFixture({ level: 5 });
  const dialogs = await openSheet(actor, [{ title: /unrelenting/i, click: "use" }]);
  await clickGuardCommand(dialogs, "unrelenting");
  assert.equal(dialogs.titles.length, 1, `exactly one dialog (titles: ${dialogs.titles.join(" | ")})`);
  assert.equal(dialogs.mismatches.length, 0, dialogs.mismatches.join("; "));
  assert.equal(guardUses.state(actor).undo.length, 1, "the use is recorded once");
  assert.equal(unrelentingValue(actor), 0, "one Unrelenting use spent once");
});

test("G4 [spec 12] The Unrelenting up-front confirm is a real preview (stated cost), not a generic body", async () => {
  configuredWorld();
  const actor = guardFixture({ level: 5 });
  const dialogs = await openSheet(actor, [{ title: /unrelenting/i, click: "cancel" }]);
  await clickGuardCommand(dialogs, "unrelenting");
  const body = dialogs.bodies.find((_content, index) => /unrelenting/i.test(dialogs.titles[index])) ?? "";
  assert.match(body, /<strong>Cost:<\/strong>\s*1 Unrelenting/, "the confirm names the cost from the plan");
  assert.doesNotMatch(body, /Review this feature's stated cost/, "a generic placeholder body is not a preview");
});

test("G5 [spec 11 | WORKFLOW §3.2] Cancel on the Unrelenting up-front confirm writes nothing", async () => {
  configuredWorld();
  const actor = guardFixture({ level: 5 });
  const dialogs = await openSheet(actor, [{ title: /unrelenting/i, click: "cancel" }]);
  const before = stateSnapshot(actor);
  const writesBefore = actor.writes.length;
  await clickGuardCommand(dialogs, "unrelenting");
  assertPromptShown(dialogs, /unrelenting/i, "the Unrelenting confirm");
  assert.equal(actor.writes.length, writesBefore);
  assert.equal(stateSnapshot(actor), before);
  assert.equal(guardUses.state(actor).undo.length, 0);
});

test("G6 [spec 11] Closing the Unrelenting up-front confirm with X writes nothing", async () => {
  configuredWorld();
  const actor = guardFixture({ level: 5 });
  const dialogs = await openSheet(actor, [{ title: /unrelenting/i, click: null }]);
  const before = stateSnapshot(actor);
  await clickGuardCommand(dialogs, "unrelenting");
  assertPromptShown(dialogs, /unrelenting/i, "the Unrelenting confirm");
  assert.equal(stateSnapshot(actor), before);
  assert.equal(guardUses.state(actor).undo.length, 0);
});

const CANCEL_CASES = [
  { cmd: "forestall", level: 5, answers: [{ title: /Press the Attack: forestall/, click: null }] },
  { cmd: "smite", level: 5, answers: [{ title: /Press the Attack: smite/, click: null }] },
  { cmd: "strikeTrue", level: 5, answers: [{ title: /Press the Attack: strikeTrue/, click: null }] },
  { cmd: "unrelenting", level: 5, answers: [{ title: /unrelenting/i, click: null }] },
  { cmd: "bladeArt", level: 5, artsblade: true, answers: [{ title: /^Blade Art$/, click: null }] },
  { cmd: "bladeArt", level: 5, artsblade: true, answers: [
    { title: /^Blade Art$/, click: "ok", elements: { artPool: { value: "frost" } } },
    { title: /choose Martial DC ability/, click: null }] },
  { cmd: "castSpellswordArt", level: 5, artsblade: true, answers: [{ title: /Cast Spellsword Art \(1 SP\)/, click: null }] },
  { cmd: "cutThroughChaos", level: 5, artsblade: true, answers: [{ title: /Cut Through Chaos \(Reaction\)/, click: null }] },
  { cmd: "augmentedAssault", level: 13, artsblade: true, answers: [{ title: /Augmented Assault \(2 Aggression\)/, click: null }] }
];

for (const [index, testCase] of CANCEL_CASES.entries()) {
  const label = testCase.answers.length > 1 ? "the Martial DC prompt" : "its first prompt";
  test(`G7.${index + 1} [spec 11 | B-302 | WORKFLOW §3.2] Closing ${testCase.cmd} at ${label} with X writes no flags, Items, resources or receipts`, async () => {
    configuredWorld();
    const actor = testCase.artsblade ? artsblade({ level: testCase.level }) : guardFixture({ level: testCase.level });
    const dialogs = await openSheet(actor, testCase.answers);
    const before = stateSnapshot(actor);
    const writesBefore = actor.writes.length;
    await clickGuardCommand(dialogs, testCase.cmd);
    assert.equal(dialogs.mismatches.length, 0, dialogs.mismatches.join("; "));
    assert.ok(dialogs.titles.length > 0, "the command's first prompt was shown");
    assert.deepEqual(dialogs.errors, [], "the sheet must not swallow an error");
    assert.equal(actor.writes.length, writesBefore, "no Actor write");
    assert.equal(stateSnapshot(actor), before, "no flag, Item or pool changed");
    assert.equal(guardUses.state(actor).undo.length, 0, "no receipt");
  });
}

test("G8 [spec 12 | WORKFLOW §3.2 | B-129/B-130 probes] Augmented Assault at 13th level: Cancel on Unleash writes nothing and spends no Aggression", async () => {
  configuredWorld();
  const actor = artsblade({ level: 13, weapon: false });
  const dialogs = await openSheet(actor, [{ title: /Augmented Assault \(2 Aggression\)/, click: null }]);
  const before = stateSnapshot(actor);
  await clickGuardCommand(dialogs, "augmentedAssault");
  assertPromptShown(dialogs, /Augmented Assault/, "the Unleash prompt");
  assert.equal(aggressionValue(actor), 4, "no Aggression spent");
  assert.equal(stateSnapshot(actor), before);
  assert.equal(guardUses.state(actor).undo.length, 0);
});

test("G9 [spec 12 | exactly one use confirm] Blade Art from the panel: the Arts Pool form and the Martial DC prompt are inputs; one preview confirms the use", async () => {
  configuredWorld();
  const actor = artsblade({ level: 5 });
  const dialogs = await openSheet(actor, [
    { title: /^Blade Art$/, click: "ok", elements: { artPool: { value: "frost" } } },
    { title: /choose Martial DC ability/, click: "ok", elements: { ability: { value: "str" } } }
  ], [{ title: /^Blade Art \(Frost\)/, click: ["use", "anyway"] }, { title: /check before use/, click: "anyway" }]);
  await clickGuardCommand(dialogs, "bladeArt");
  assert.equal(dialogs.mismatches.length, 0, dialogs.mismatches.join("; "));
  assert.deepEqual(dialogs.errors, [], "the sheet must not swallow an error");
  const previews = useConfirmations(dialogs);
  assert.equal(previews.length, 1, `exactly one use confirmation (titles: ${dialogs.titles.join(" | ")})`);
  assert.match(previews[0].title, /^Blade Art \(Frost\)/, "the single confirmation is the use's preview");
  assertInputsAreNotConfirms(dialogs);
  assert.equal(guardUses.state(actor).undo.length, 1, "the Blade Art runs once");
});

test("G10 [spec 12 | exactly one use confirm; spec 1] Cut Through Chaos from the panel: the Review use form is an input; one preview with its cost confirms the use", async () => {
  configuredWorld();
  const actor = artsblade({ level: 5 });
  actor.flags.ak5e.resourcePools.cutThroughChaos = { value: 3, max: 3 };
  const weapon = [...actor.items.values()].find(item => item.type === "weapon");
  const dialogs = await openSheet(actor, [{
    title: /^Cut Through Chaos \(Reaction\)$/, click: "ok",
    elements: { mode: { value: "spellAttack" }, weaponUuid: { value: weapon.uuid }, incomingTotal: { value: "14" }, incomingDC: { value: "" } }
  }], [{ title: /^Cut Through Chaos$/, click: ["use", "anyway"] }, { title: /check before use/, click: "anyway" }]);
  await clickGuardCommand(dialogs, "cutThroughChaos");
  assert.equal(dialogs.mismatches.length, 0, dialogs.mismatches.join("; "));
  assert.deepEqual(dialogs.errors, [], "the sheet must not swallow an error");
  const previews = useConfirmations(dialogs);
  assert.equal(previews.length, 1, `exactly one use confirmation (titles: ${dialogs.titles.join(" | ")})`);
  assert.match(dialogs.bodies[previews[0].index], /<strong>Cost:<\/strong>\s*1 Cut Through Chaos/, "the preview names its cost");
  assertInputsAreNotConfirms(dialogs);
  assert.equal(guardUses.state(actor).undo.length, 1, "the use is recorded once");
});

test("G16 [spec 1 | Ch.3 L2327-2331] The Guard panel's Cut Through Chaos form lets the owner select the melee weapon used for the Reaction", async () => {
  // Spec 1 requires a selected native melee weapon; the form must offer one (a select named for the weapon).
  configuredWorld();
  const actor = artsblade({ level: 5, weapon: true });
  actor.flags.ak5e.resourcePools.cutThroughChaos = { value: 3, max: 3 };
  const dialogs = await openSheet(actor, [{ title: /Cut Through Chaos \(Reaction\)/, click: null }]);
  await clickGuardCommand(dialogs, "cutThroughChaos");
  const index = dialogs.titles.findIndex(title => /Cut Through Chaos \(Reaction\)/.test(title));
  assert.ok(index >= 0, "the Cut Through Chaos form was shown");
  assert.match(dialogs.bodies[index], /<select name="(weapon|weaponUuid)"/, "the form offers a weapon selection");
});

test("G11 [spec 12 | exactly one use confirm] Augmented Assault at 13th level: the Unleash form is an input; one preview with its cost confirms the use", async () => {
  configuredWorld();
  const actor = artsblade({ level: 13, weapon: false });
  const dialogs = await openSheet(actor, [{ title: /^Augmented Assault \(2 Aggression\)$/, click: "ok", elements: { unleash: { checked: false } } }],
    [{ title: /^(Press the Attack: )?Augmented Assault$/, click: ["use", "anyway"] }, { title: /check before use/, click: "anyway" }]);
  await clickGuardCommand(dialogs, "augmentedAssault");
  assert.equal(dialogs.mismatches.length, 0, dialogs.mismatches.join("; "));
  assert.deepEqual(dialogs.errors, [], "the sheet must not swallow an error");
  const previews = useConfirmations(dialogs);
  assert.equal(previews.length, 1, `exactly one use confirmation (titles: ${dialogs.titles.join(" | ")})`);
  assert.match(dialogs.bodies[previews[0].index], /<strong>Cost:<\/strong>\s*2 Aggression/, "the preview names its cost");
  assertInputsAreNotConfirms(dialogs);
  assert.equal(guardUses.state(actor).undo.length, 1);
});

test("G12 [spec 12 | exactly one use confirm] Cast Spellsword Art from the panel: the Cast form and the Martial DC prompt are inputs; one preview with its cost confirms the use", async () => {
  configuredWorld();
  const actor = artsblade({ level: 5 });
  actor.items.set("art-frost-nova", { id: "art-frost-nova", type: "spell", name: "Frost Nova", system: { level: 1 }, flags: { ak5e: { artsPool: "frost" } }, getFlag() { return undefined; } });
  const dialogs = await openSheet(actor, [
    { title: /^Cast Spellsword Art \(1 SP\)$/, click: "ok", elements: { artName: { value: "Frost Nova" }, artPool: { value: "frost" }, unleash: { checked: false } } },
    { title: /choose Martial DC ability/, click: "ok", elements: { ability: { value: "str" } } }
  ], [{ title: /^Cast Spellsword Art: /, click: ["use", "anyway"] }, { title: /check before use/, click: "anyway" }]);
  await clickGuardCommand(dialogs, "castSpellswordArt");
  assert.equal(dialogs.mismatches.length, 0, dialogs.mismatches.join("; "));
  assert.deepEqual(dialogs.errors, [], "the sheet must not swallow an error");
  const previews = useConfirmations(dialogs);
  assert.equal(previews.length, 1, `exactly one use confirmation (titles: ${dialogs.titles.join(" | ")})`);
  assert.match(dialogs.bodies[previews[0].index], /<strong>Cost:<\/strong>\s*1 Spellsword Points/, "the preview names its cost");
  assertInputsAreNotConfirms(dialogs);
  assert.equal(guardUses.state(actor).undo.length, 1, "the Spellsword Art runs once");
});

/* Cancel on the single preview (the use confirmation) changes nothing. */
const PREVIEW_CANCEL = [
  { cmd: "bladeArt", level: 5, weapon: true, answers: [
    { title: /^Blade Art$/, click: "ok", elements: { artPool: { value: "frost" } } },
    { title: /choose Martial DC ability/, click: "ok", elements: { ability: { value: "str" } } },
    { title: /^Blade Art \(Frost\)/, click: "cancel" }] },
  { cmd: "cutThroughChaos", level: 5, weapon: true, ctc: true, answers: [
    { title: /^Cut Through Chaos \(Reaction\)$/, click: "ok", elements: { mode: { value: "spellAttack" }, weaponUuid: { value: "Actor.guard1.Item.w-long" }, incomingTotal: { value: "14" }, incomingDC: { value: "" } } },
    { title: /^Cut Through Chaos$/, click: "cancel" }] },
  { cmd: "augmentedAssault", level: 13, weapon: false, answers: [
    { title: /^Augmented Assault \(2 Aggression\)$/, click: "ok", elements: { unleash: { checked: false } } },
    { title: /^(Press the Attack: )?Augmented Assault$/, click: "cancel" }] },
  { cmd: "castSpellswordArt", level: 5, weapon: true, knownArt: true, answers: [
    { title: /^Cast Spellsword Art \(1 SP\)$/, click: "ok", elements: { artName: { value: "Frost Nova" }, artPool: { value: "frost" }, unleash: { checked: false } } },
    { title: /choose Martial DC ability/, click: "ok", elements: { ability: { value: "str" } } },
    { title: /^Cast Spellsword Art: /, click: "cancel" }] }
];

for (const [index, testCase] of PREVIEW_CANCEL.entries()) {
  test(`G17.${index + 1} [spec 12 | WORKFLOW 3.2] Cancel on the ${testCase.cmd} preview writes no flags, Items, resources or receipts`, async () => {
    configuredWorld();
    const actor = artsblade({ level: testCase.level, weapon: testCase.weapon });
    if (testCase.ctc) actor.flags.ak5e.resourcePools.cutThroughChaos = { value: 3, max: 3 };
    if (testCase.knownArt) actor.items.set("art-frost-nova", { id: "art-frost-nova", type: "spell", name: "Frost Nova", system: { level: 1 }, flags: { ak5e: { artsPool: "frost" } }, getFlag() { return undefined; } });
    const dialogs = await openSheet(actor, testCase.answers);
    const before = stateSnapshot(actor);
    const writesBefore = actor.writes.length;
    await clickGuardCommand(dialogs, testCase.cmd);
    assert.equal(dialogs.mismatches.length, 0, dialogs.mismatches.join("; "));
    assert.deepEqual(dialogs.errors, [], "the sheet must not swallow an error");
    assert.equal(useConfirmations(dialogs).length, 1, `the preview was shown as the use confirmation (titles: ${dialogs.titles.join(" | ")})`);
    assert.equal(actor.writes.length, writesBefore, "no Actor write after Cancel");
    assert.equal(stateSnapshot(actor), before, "no flag, Item or pool changed after Cancel");
    assert.equal(guardUses.state(actor).undo.length, 0, "no receipt after Cancel");
  });
}

test("G13 [spec 11 | Ch.3 L2249 | WORKFLOW §3.2] A second Blade Art from the panel: Cancel on its warning records nothing further", async () => {
  configuredWorld(combatFor(artsblade({ level: 5 })));
  const actor = artsblade({ level: 5 });
  await use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe1", martialDcAbility: "str" }, "sheet-first");
  const dialogs = await openSheet(actor, [
    { title: /^Blade Art$/, click: "ok", elements: { artPool: { value: "frost" } } },
    { title: /choose Martial DC ability/, click: "ok", elements: { ability: { value: "str" } } },
    { title: /Blade Art \(Frost\)/, click: "cancel" }
  ]);
  await clickGuardCommand(dialogs, "bladeArt");
  assert.equal(dialogs.mismatches.length, 0, dialogs.mismatches.join("; "));
  assertPromptShown(dialogs, /Blade Art \(Frost\)/, "the second Blade Art's frequency warning");
  assert.equal(guardUses.state(actor).undo.length, 1, "only the first Blade Art is recorded");
});

test("G14 [spec 11 | WORKFLOW §3.2 warn never block] Use anyway on a second Blade Art's frequency warning proceeds and the override is public", async () => {
  configuredWorld(combatFor(artsblade({ level: 5 })));
  const actor = artsblade({ level: 5 });
  await use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe1", martialDcAbility: "str" }, "sheet-first-anyway");
  const dialogs = await openSheet(actor, [
    { title: /^Blade Art$/, click: "ok", elements: { artPool: { value: "frost" } } },
    { title: /choose Martial DC ability/, click: "ok", elements: { ability: { value: "str" } } },
    { title: /Blade Art \(Frost\)/, click: ["use", "anyway"] }
  ]);
  await clickGuardCommand(dialogs, "bladeArt");
  assert.equal(dialogs.mismatches.length, 0, dialogs.mismatches.join("; "));
  const recorded = guardUses.state(actor).undo;
  assert.equal(recorded.length, 2, "the second Blade Art proceeds after Use anyway");
  assert.ok(recorded[1].overridden.length > 0, "the overridden warning is recorded on the use");
});

test("G15 [spec 12 | B-136] The panel's Arts Pool choice drives the Blade Art's damage type (Frost is cold, not the Flame default)", async () => {
  configuredWorld();
  const actor = artsblade({ level: 5 });
  const dialogs = await openSheet(actor, [
    { title: /^Blade Art$/, click: "ok", elements: { artPool: { value: "frost" } } },
    { title: /choose Martial DC ability/, click: "ok", elements: { ability: { value: "str" } } }
  ], [{ title: /^Blade Art \(/, click: ["use", "anyway"] }]);
  await clickGuardCommand(dialogs, "bladeArt");
  const receipt = guardUses.state(actor).undo.at(-1);
  assert.ok(receipt, "the Blade Art was recorded");
  assert.equal(receipt.result.damageType, "cold");
});

/* ---------------------------------------------------------------- H. Blade Art save exemption (Ch.3 L2274; spec 2) */

const bladeArtOnTarget = (actor, targetUuid, id, extra = {}) => use(actor, "bladeArt",
  { pool: "frost", targetUuid, martialDcAbility: "str", overrides: ["frequency"], ...extra }, id);

test("H1 [spec 2 | Ch.3 L2274] A second Blade Art in the same Turn on a different target, with no save recorded, does not claim a save was already made", async () => {
  // Ch.3 L2274: "Once a Creature has made a Saving Throw against your Blade Art, they do not need to make that Saving Throw again until the beginning of your next Turn."
  configuredWorld(combatFor(artsblade({ level: 5 })));
  const actor = artsblade({ level: 5 });
  await use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe1", martialDcAbility: "str" }, "saves-first");
  const second = await bladeArtOnTarget(actor, "Actor.foe2", "saves-second");
  assert.equal(second.immuneToSave, false);
  assert.doesNotMatch(guardUses.receipt(actor, "saves-second").summary, SAVE_CLAIM);
  assert.equal(guardUses.receipt(actor, "saves-second").saves.length, 1, "foe2 makes its own save against this Blade Art");
});

test("H2 [spec 2 | B-140] A second Blade Art on the same target with no owner save recorded does not claim a save was already made", async () => {
  // B-140 reproduction: supply a targetUuid and cast twice without resolving any save.
  configuredWorld(combatFor(artsblade({ level: 5 })));
  const actor = artsblade({ level: 5 });
  await use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe1", martialDcAbility: "str" }, "nosave-first");
  const second = await bladeArtOnTarget(actor, "Actor.foe1", "nosave-second");
  assert.equal(second.immuneToSave, false);
  assert.doesNotMatch(guardUses.receipt(actor, "nosave-second").summary, SAVE_CLAIM);
  assert.equal(guardUses.receipt(actor, "nosave-second").saves.length, 1, "the target must save again");
});

test("H3 [spec 2 | Ch.3 L2274] A save recorded for another target does not exempt this target in the same Turn", async () => {
  const combat = combatFor(artsblade({ level: 5 }));
  configuredWorld(combat);
  const actor = artsblade({ level: 5 });
  actor.flags.ak5e.guardUses = { undo: [], data: { bladeArtSaves: { [opaqueKey("Actor.foe1")]: { targetUuid: "Actor.foe1", combatId: "c-u1", untilTurnKey: "c-u1:2:0" } } } };
  const result = await bladeArtOnTarget(actor, "Actor.foe2", "other-target-save");
  assert.equal(result.immuneToSave, false);
  assert.doesNotMatch(guardUses.receipt(actor, "other-target-save").summary, SAVE_CLAIM);
});

test("H4 [Ch.3 L2274] An earlier-Turn owner save does not exempt the target in this Turn", async () => {
  const actor = artsblade({ level: 5 });
  actor.flags.ak5e.guardUses = { undo: [], data: { bladeArtSaves: { [opaqueKey("Actor.foe1")]: { targetUuid: "Actor.foe1", combatId: "c-u1", untilTurnKey: "c-u1:1:0" } } } };
  configuredWorld(combatFor(actor, { round: 1, turn: 0 }));
  const result = await bladeArtOnTarget(actor, "Actor.foe1", "earlier-save");
  assert.equal(result.immuneToSave, false);
});

test("H5 [Ch.3 L2274] An owner save recorded this Turn exempts the same target: no new save, and the card says so", async () => {
  const actor = artsblade({ level: 5 });
  actor.flags.ak5e.guardUses = { undo: [], data: { bladeArtSaves: { [opaqueKey("Actor.foe1")]: { targetUuid: "Actor.foe1", combatId: "c-u1", untilTurnKey: "c-u1:2:0" } } } };
  configuredWorld(combatFor(actor, { round: 1, turn: 0 }));
  const result = await bladeArtOnTarget(actor, "Actor.foe1", "this-save");
  assert.equal(result.immuneToSave, true);
  assert.equal(guardUses.receipt(actor, "this-save").saves.length, 0, "no repeated save is requested");
  assert.match(guardUses.receipt(actor, "this-save").summary, SAVE_CLAIM);
});

test("H6 [Ch.3 L2274 | B-140] The exemption lasts until the Artsblade's next Turn, through the other combatant's Turn", async () => {
  const combat = combatFor(artsblade({ level: 5 }), { round: 1, turn: 0 });
  configuredWorld(combat);
  const actor = artsblade({ level: 5 });
  actor.flags.ak5e.guardUses = { undo: [], data: { bladeArtSaves: { [opaqueKey("Actor.foe1")]: { targetUuid: "Actor.foe1", combatId: "c-u1", untilTurnKey: "c-u1:2:0" } } } };
  combat.turn = 1;
  const result = await bladeArtOnTarget(actor, "Actor.foe1", "other-combatant-turn");
  assert.equal(result.immuneToSave, true, "still exempt during the other combatant's Turn in Round 1");
});

/* ---------------------------------------------------------------- I. Frequency, Augmented Assault, Ultimate, Spellsword casting (L2212, L2245, L2249, L2407) */

test("I1 [Ch.3 L2407] Ultimate Blade Art lifts the once-per-Turn limit through the end of the next Turn only", async () => {
  const actor = artsblade({ level: 17 });
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

test("I2 [Ch.3 L2407 | B-133 probe] Undoing Ultimate Blade Art restores the once-per-Turn limit", async () => {
  const actor = artsblade({ level: 17 });
  configuredWorld(combatFor(actor, { round: 1, turn: 0 }));
  await use(actor, "ultimateBladeArt", {}, "ult-undo-activate");
  await use(actor, "undoUse", { useId: "ult-undo-activate" }, "ult-undo-click");
  await use(actor, "castSpellswordArt", { artName: "Blade Art", martialDcAbility: "str" }, "ult-undo-cast-1");
  await rejectsWithWarning(
    use(actor, "castSpellswordArt", { artName: "Blade Art", martialDcAbility: "str" }, "ult-undo-cast-2"), "frequency",
    "after the undo, the second Spellsword Art this Turn must warn");
});

test("I3 [Ch.3 L2245] Augmented Assault allows two Blade Arts this Turn; a third warns", async () => {
  const actor = artsblade({ level: 5 });
  configuredWorld(combatFor(actor));
  await use(actor, "augmentedAssault", {}, "aa-activate");
  await use(actor, "bladeArt", { pool: "frost", targetUuid: null, martialDcAbility: "str" }, "aa-cast-1");
  await use(actor, "bladeArt", { pool: "frost", targetUuid: null, martialDcAbility: "str" }, "aa-cast-2");
  await rejectsWithWarning(
    use(actor, "bladeArt", { pool: "frost", targetUuid: null, martialDcAbility: "str" }, "aa-cast-3"), "frequency");
});

test("I4 [Ch.3 L2245] Augmented Assault cannot be used after a Spellsword Art this Turn: warns", async () => {
  const actor = artsblade({ level: 5 });
  configuredWorld(combatFor(actor));
  await use(actor, "castSpellswordArt", { artName: "Blade Art", martialDcAbility: "str" }, "aa-late-cast");
  await rejectsWithWarning(use(actor, "augmentedAssault", {}, "aa-late"), "castLimit");
});

test("I5 [Ch.3 L2212 and Artsblade table L2217-2243] Maximum Art level by Guard level", () => {
  const table = [[1, 1], [4, 1], [5, 2], [8, 2], [9, 3], [12, 3], [13, 4], [16, 4], [17, 5], [20, 5]];
  for (const [level, expected] of table) assert.equal(maxArtLevel(level), expected, `level ${level}`);
});

test("I6 [Ch.3 L2212] A requested casting level is ignored: the Spellsword Art is cast at the maximum level", async () => {
  const actor = artsblade({ level: 13 });
  configuredWorld();
  const result = await use(actor, "castSpellswordArt", { artName: "Blade Art", castingLevel: 1, martialDcAbility: "str" }, "fixed-level-13");
  assert.equal(result.castingLevel, 4, "level 13 maximum Art level is 4");
});

test("I7 [Ch.3 L2249] A second Spellsword Art in one Turn warns; Use anyway proceeds and is recorded", async () => {
  const actor = artsblade({ level: 5 });
  configuredWorld(combatFor(actor));
  await use(actor, "castSpellswordArt", { artName: "Blade Art", martialDcAbility: "str" }, "freq-first");
  await rejectsWithWarning(
    use(actor, "castSpellswordArt", { artName: "Blade Art", martialDcAbility: "str" }, "freq-second"), "frequency");
  assert.equal(guardUses.state(actor).undo.length, 1, "the warned attempt records nothing");
  await use(actor, "castSpellswordArt", { artName: "Blade Art", martialDcAbility: "str", overrides: ["frequency"] }, "freq-anyway");
  assert.equal(guardUses.state(actor).undo.length, 2);
});

/* ---------------------------------------------------------------- J. Cut Through Chaos (Ch.3 L2327-2331; spec 1) */

const ctcActor = ({ weapon = true, equipped = true, actionType = "mwak" } = {}) => {
  const actor = artsblade({ level: 5, weapon: false });
  actor.flags.ak5e.resourcePools.cutThroughChaos = { value: 3, max: 3 };
  const item = weapon ? addWeapon(actor, { equipped, actionType, activityId: "atk" }) : null;
  return { actor, item };
};

test("J1 [spec 1 | Ch.3 L2327-2331] Cut Through Chaos with a selected equipped melee weapon uses its native attack, spends 1 use and the Reaction", async () => {
  configuredWorld(combatFor(artsblade({ level: 5 })));
  const { actor, item: weapon } = ctcActor();
  const reactionsBefore = getReactions(actor).available;
  const result = await use(actor, "cutThroughChaos", { mode: "spellAttack", weaponUuid: weapon.uuid, activityId: "atk" }, "ctc-native");
  const receipt = guardUses.receipt(actor, "ctc-native");
  assert.deepEqual(receipt.nativeAttack, { weaponUuid: weapon.uuid, activityId: "atk" });
  assert.equal(receipt.formula, undefined, "no generic formula is substituted for the weapon attack");
  assert.equal(getPool(actor, "cutThroughChaos").value, 2, "one use is spent");
  assert.equal(getReactions(actor).available, reactionsBefore - 1, "the Reaction is spent");
  assert.equal(result.mode, "spellAttack");
});

test("J2 [spec 1 | Ch.3 L2327-2331] Cut Through Chaos with no selected weapon warns; Use anyway never substitutes a STR + PB formula", async () => {
  configuredWorld(combatFor(artsblade({ level: 5 })));
  const { actor } = ctcActor({ weapon: false });
  await rejectsWithWarning(use(actor, "cutThroughChaos", { mode: "spellAttack" }, "ctc-noweapon"), "weapon");
  await use(actor, "cutThroughChaos", { mode: "spellAttack", overrides: ["weapon"] }, "ctc-noweapon-anyway");
  const receipt = guardUses.receipt(actor, "ctc-noweapon-anyway");
  assert.equal(receipt.formula, undefined, "no formula such as 1d20 + STR + PB");
  assert.equal(receipt.nativeAttack, undefined);
});

test("J3 [spec 1 | Ch.3 L2327-2331] Cut Through Chaos warns when the selected weapon is not equipped", async () => {
  configuredWorld(combatFor(artsblade({ level: 5 })));
  const { actor, item: weapon } = ctcActor({ equipped: false });
  await rejectsWithWarning(
    use(actor, "cutThroughChaos", { mode: "spellAttack", weaponUuid: weapon.uuid, activityId: "atk" }, "ctc-unequipped"), "weaponEquipped");
});

test("J4 [spec 1 | Ch.3 L2327-2331 \"make a Melee Attack\"] Cut Through Chaos warns when the selected weapon's attack is ranged", async () => {
  configuredWorld(combatFor(artsblade({ level: 5 })));
  const { actor, item: weapon } = ctcActor({ actionType: "rwak" });
  await rejectsWithWarning(
    use(actor, "cutThroughChaos", { mode: "spellAttack", weaponUuid: weapon.uuid, activityId: "atk" }, "ctc-ranged"), "meleeWeapon");
});

test("J5 [WORKFLOW §3.2 undo] Undoing Cut Through Chaos restores its use, the Reaction and the ledger", async () => {
  configuredWorld(combatFor(artsblade({ level: 5 })));
  const { actor, item: weapon } = ctcActor();
  const reactionsBefore = getReactions(actor).available;
  await use(actor, "cutThroughChaos", { mode: "spellAttack", weaponUuid: weapon.uuid, activityId: "atk" }, "ctc-undo");
  await use(actor, "undoUse", { useId: "ctc-undo" }, "ctc-undo-click");
  assert.equal(getPool(actor, "cutThroughChaos").value, 3, "the use is restored");
  assert.equal(getReactions(actor).available, reactionsBefore, "the Reaction is restored");
  assert.equal(guardUses.receipt(actor, "ctc-undo").status, "undone", "the ledger records the undo");
});

test("J6 [WORKFLOW §3.2 | B-135 probe] A failed receipt write spends no Reaction and leaves no receipt", async () => {
  configuredWorld(combatFor(artsblade({ level: 5 })));
  const { actor, item: weapon } = ctcActor();
  const reactionsBefore = getReactions(actor).available;
  const update = actor.update.bind(actor);
  let failed = false;
  actor.update = async changes => {
    if (!failed && Object.hasOwn(changes, "flags.ak5e.guardUses")) { failed = true; throw new Error("write failed"); }
    return update(changes);
  };
  await assert.rejects(use(actor, "cutThroughChaos", { mode: "spellAttack", weaponUuid: weapon.uuid, activityId: "atk" }, "ctc-write-fail"),
    /write failed/);
  assert.equal(getReactions(actor).available, reactionsBefore, "no Reaction is spent before the receipt persists");
  assert.equal(guardUses.state(actor).undo.length, 0, "no receipt was persisted");
});

/* ---------------------------------------------------------------- K. General table-play rules (WORKFLOW §3.2) */

test("K1 [WORKFLOW §3.2 no auto-rolled dice] A Blade Art evaluates no dice when it is used", async () => {
  configuredWorld();
  const actor = artsblade({ level: 5 });
  const rolls = installRoll(4);
  await use(actor, "bladeArt", { pool: "frost", targetUuid: null, martialDcAbility: "str" }, "k1-blade");
  assert.equal(rolls.evaluations, 0, "damage is rolled only from the card's Roll button");
});

test("K2 [WORKFLOW §3.2 no auto-rolled dice] Cut Through Chaos evaluates no dice when it is used", async () => {
  configuredWorld(combatFor(artsblade({ level: 5 })));
  const { actor, item: weapon } = ctcActor();
  const rolls = installRoll(12);
  await use(actor, "cutThroughChaos", { mode: "spellAttack", weaponUuid: weapon.uuid, activityId: "atk", incomingTotal: 14 }, "k2-ctc");
  assert.equal(rolls.evaluations, 0, "the melee attack is the owner's native roll");
});

test("K3 [WORKFLOW §3.2 undo] Undoing a Spellsword Art restores the Spellsword Point it spent", async () => {
  configuredWorld(combatFor(artsblade({ level: 5 })));
  const actor = artsblade({ level: 5 });
  actor.items.set("art-frost-nova", { id: "art-frost-nova", type: "spell", name: "Frost Nova", system: { level: 1 }, flags: { ak5e: { artsPool: "frost" } }, getFlag() { return undefined; } });
  const before = getPool(actor, "spellswordPoints").value;
  await use(actor, "castSpellswordArt", { artName: "Frost Nova", martialDcAbility: "str", overrides: ["knownArt"] }, "k3-cast");
  assert.equal(getPool(actor, "spellswordPoints").value, before - 1, "one Spellsword Point is spent");
  await use(actor, "undoUse", { useId: "k3-cast" }, "k3-undo");
  assert.equal(getPool(actor, "spellswordPoints").value, before, "the Spellsword Point is restored");
});

test("K4 [WORKFLOW §3.2 relay] A Blade Art on a Creature the user does not own writes nothing to that Creature at use time", async () => {
  // Effect riders on a target are applied through the GM relay only after the owner's save; the use itself never writes a Creature.
  const { documents } = configuredWorld(combatFor(artsblade({ level: 5 })));
  const actor = artsblade({ level: 5 });
  const foe = { uuid: "Actor.foe1", documentName: "Actor", isOwner: false, system: { attributes: { hp: { value: 10, max: 10, temp: 0 } } }, flags: { ak5e: {} }, writes: [], effects: new Map(), items: new Map(), testUserPermission: () => false, async update(changes) { this.writes.push(changes); return this; } };
  documents.set(foe.uuid, foe);
  await use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe1", martialDcAbility: "str" }, "k4-foe");
  assert.equal(foe.writes.length, 0, "no direct write to a Creature the user does not own");
});

test("K5 [WORKFLOW §3.2 | B-136] Frost Blade Art reports cold damage and its CON save; the Flame default is not substituted", async () => {
  configuredWorld();
  const actor = artsblade({ level: 5, pools: ["frost"] });
  const result = await use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe1", martialDcAbility: "str" }, "k5-frost");
  assert.equal(result.damageType, "cold");
  assert.equal(guardUses.receipt(actor, "k5-frost").saves[0]?.ability, "con");
});
