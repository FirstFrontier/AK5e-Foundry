/**
 * F2 adversarial challenge suite: Supporter branch fixes R1 (Hexer, Bard, Artificer).
 *
 * Behaviour-level tests that PROVE the head rulings F-R1 .. F-R9 (ak5e/DECISIONS.md, "Supporter Class and Artificer /
 * Bard / Hexer Branches"). Written against the spec in the challenger brief, not against the implementation. Each test
 * is expected to FAIL on the base commit 4492be2 where the defect exists and to PASS only when the fix is right.
 * Negative and regression guards (Cancel, non-owner, stale receipt, level boundaries) are marked "guard".
 *
 * Source citations ("C3:NNNN") are to AK5e 1.3.1 Chapter 3 (Supporter), in AK5e_1.3.1_Foundry_Source.
 *
 * Contract assumptions (named, because the brief does not fix them):
 *  - Font of Inspiration effect: flags.ak5e.temporaryTag.expiry is { trigger: "time", worldTime: start + 600 } (or the
 *    effect duration is { seconds: 600, startTime }). Expiry is read through the public expiry sweep
 *    expireFeatureTags(event) from feature-tags.mjs.
 *  - Rupturing burst card: the chat content carries "<h3>Rupturing Hex</h3>" and a data-ak5e-hexer-roll button.
 *  - Hex rider card: "<h3>Hex rider</h3>"; relay whisper content "Hexer rider record (relay)" with a whisper to the GM.
 *  - Button clicks are simulated by calling the exported renderHexerCardButtons(message, html) with fake buttons. The
 *    "already rolled" warning may arrive on ui.notifications.warn or ui.notifications.error (either is a user warning).
 *  - Cursemark UI prompts are DialogV2.wait/confirm calls; the level 10+ exclusion prompt is counted as an extra dialog.
 *  - artCast with no damage: the payload carries no damage field (the caster emits amount/level/itemId only); the card
 *    must not claim "You dealt Damage with an Art". The positive claim (a damaging cast) is a todo: the field name is
 *    not fixed by the brief.
 *  - Relayed fields and revert: supporterUses.relayedTargetChange(source, "apply" | "revert", {useId, targetUuid}, gm)
 *    is the GM-client half of the relay (play-uses.mjs). Receipts are seeded into flags.ak5e.supporterUses.undo.
 *  - Module instances: hook registrations are guarded per process, so each module is imported once per file and its
 *    hooks installed once. Fixture globals are rebuilt per test.
 *
 * Oracles (die sizes, PB, distances, durations) come from the source and the rulings, never from the implementation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem, createTestCombat
} from "./base-classes-fixture.mjs";
import * as Features from "../scripts/supporter-features.mjs";
import * as Uses from "../scripts/supporter-uses.mjs";
import { getPool } from "../scripts/resource-pools.mjs";
import { emitAk5eEvent } from "../scripts/trigger-events.mjs";
import { expireFeatureTags } from "../scripts/feature-tags.mjs";

/* ==========================================================================
   Oracles and module loading
   ========================================================================== */

// C3:6557-6578: Proficiency Bonus and Aid Die columns.
const pbOf = level => Math.floor((level - 1) / 4) + 2;
const dieOf = level => (level >= 14 ? 12 : level >= 7 ? 10 : 8);   // die size as a number of faces
const DEFAULT_MODS = Object.freeze({ str: 0, dex: 2, con: 2, int: 2, wis: 1, cha: 4 });

/** Load a module once per file. A missing module fails the test that needs it, not the whole file. */
const loaded = new Map();
async function mod(path) {
  if (!loaded.has(path)) {
    try { loaded.set(path, await import(path)); }
    catch (error) { loaded.set(path, { error }); }
  }
  const entry = loaded.get(path);
  assert.ok(!entry.error, `${path} is not loadable: ${entry.error?.message ?? "unknown"}`);
  return entry;
}

const registered = new Set();
/** Register a plan set with the Supporter engine once per process (a repeat registration is not an error). */
function registerOnce(key, plans, extra = {}) {
  if (registered.has(key)) return;
  registered.add(key);
  try { Uses.registerSupporterPlans({ plans, ...extra }); }
  catch (error) { if (!/already registered/i.test(String(error?.message ?? error))) throw error; }
}

async function hexer() {
  const H = await mod("../scripts/hexer-features.mjs");
  registerOnce("hexer", H.hexerPlans);
  H.registerHexerHooks();
  return H;
}
async function bardPerform() {
  const B = await mod("../scripts/bard-perform.mjs");
  registerOnce("bard-perform", B.bardPerformPlans);
  return B;
}
async function bardCompose() {
  const B = await mod("../scripts/bard-compose.mjs");
  registerOnce("bard-compose", B.bardComposePlans);
  return B;
}
async function artificer() {
  const A = await mod("../scripts/artificer-features.mjs");
  registerOnce("artificer", A.artificerPlans, { readings: A.artificerReadings });
  return A;
}

/* ==========================================================================
   Fixture, lifecycle and small helpers
   ========================================================================== */

let docs;
const notes = { warn: [], error: [] };

test.beforeEach(async () => {
  setupFoundryGlobals({ worldTime: 100 });
  docs = new Map();
  globalThis.fromUuidSync = uuid => docs.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => docs.get(uuid) ?? null;
  // Capture user-facing notifications (the "already rolled" warning goes here).
  notes.warn = []; notes.error = [];
  globalThis.ui.notifications.warn = msg => notes.warn.push(String(msg));
  globalThis.ui.notifications.error = msg => notes.error.push(String(msg));
  // World Actor creation (the GM relay writes through this). The created Actor is registered like a world document.
  globalThis.Actor = {
    implementation: {
      create: async data => {
        const actor = createTestActor({
          id: data._id, name: data.name, type: data.type, owner: true, ownership: data.ownership,
          system: data.system, flags: data.flags, items: data.items
        });
        actor.delete = async () => { docs.delete(actor.uuid); game.actors.delete(actor.id); };
        docs.set(actor.uuid, actor);
        return actor;
      }
    }
  };
  Features.defineSupporterPools();
  const H = await hexer().catch(() => null); H?.defineHexerPools?.();
  const B = await bardCompose().catch(() => null); try { B?.defineBardComposePools?.(); } catch { /* idempotency is tested elsewhere */ }
  const A = await artificer().catch(() => null); A?.defineArtificerPools?.();
  await bardPerform().catch(() => null);
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

const messageCount = () => game.messages.length;
const contentOf = message => String(message?.content ?? "");
const cardsWith = text => game.messages.filter(message => contentOf(message).includes(text));
const burstCards = () => cardsWith("<h3>Rupturing Hex</h3>");
const riderCards = () => cardsWith("<h3>Hex rider</h3>");
const relayWhispers = () => game.messages.filter(message => contentOf(message).includes("Hexer rider record (relay)") && Array.isArray(message.whisper) && message.whisper.length > 0);
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

/** Stub Roll: records every evaluated formula. `total` is the value a click produces. */
function rollSpy(total = 4) {
  const calls = [];
  globalThis.Roll = class SpyRoll {
    constructor(formula, data = {}) { this.formula = formula; this.data = data; this.total = null; }
    async evaluate() { calls.push(this.formula); this.total = total; return this; }
    async toMessage() { return undefined; }
    static async roll() { calls.push("Roll.roll"); throw new Error("Roll.roll must not run before the user clicks"); }
  };
  return calls;
}

/** Stub the Foundry dialogs. `answer(title, kind)` decides a result; every prompt is recorded. */
function dialogSpy(answer = () => true) {
  const prompts = [];
  const record = (kind, options) => {
    prompts.push({ kind, title: options?.window?.title ?? "", content: String(options?.content ?? "") });
    return answer(options?.window?.title ?? "", kind, options);
  };
  globalThis.foundry.applications = {
    api: {
      DialogV2: {
        wait: async options => record("wait", options),
        confirm: async options => record("confirm", options)
      }
    }
  };
  return prompts;
}

/** Warnings from a plan run: the plan's own list, or the AK5eWarnings error a blocked use throws. Other errors rethrow. */
async function warningsOf(run) {
  try {
    const plan = await run();
    return plan?.warnings ?? [];
  } catch (error) {
    if (error?.name === "AK5eWarnings" || Array.isArray(error?.warnings)) return error.warnings;
    throw error;
  }
}
const warningText = warnings => warnings.map(w => `${w.id ?? ""} ${w.text ?? ""}`).join(" | ");
const overridesFor = warnings => warnings.map(w => w.id);
const isWarningError = error => error?.name === "AK5eWarnings" || Array.isArray(error?.warnings);

/** The Supporter engine's confirmed run. */
const run = (actor, name, data, opId) => Uses.supporterUses.execute(actor, name, data, opId);
const receiptOf = (actor, id) => Uses.supporterUses.receipt(actor, id);

/** Set the one target a targeted command reads (game.user.targets.first()). */
function targetToken(actor, { x = 0, y = 0, sceneId = null } = {}) {
  const token = { name: actor.name, actor, x, y, center: { x, y }, scene: sceneId ? { id: sceneId } : null };
  game.user.targets = { first: () => token, size: 1, has: () => true, [Symbol.iterator]: function* () { yield token; } };
  return token;
}

/* ==========================================================================
   F-R1  Font of Inspiration: the Aid Die lasts 600 seconds (C3:6635)
   ========================================================================== */

/** A Bard at `level` with a Font of Inspiration die on hand (not Performing: the Font is a Performance feature). */
function fontBard(level = 4, { fontDie = true, owner = true } = {}) {
  const abilities = {};
  for (const [key, mod] of Object.entries({ ...DEFAULT_MODS, cha: 4 })) abilities[key] = { mod, value: 10 + 2 * mod };
  const items = [createTestItem({ name: "Supporter", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: "class-supporter" } } })];
  const actor = createTestActor({
    name: `Bard L${level}`, level, owner, items, abilities, hp: { value: 20, max: 20, temp: 0 },
    flags: { ak5e: {
      supporter: { enabled: true, branch: "bard", aidAbility: "cha" },
      casting: { enabled: true, ability: "cha" },
      artsPoints: { value: 6, maximum: 6, maximumArtLevel: 9 },
      bard: { performances: [], active: null, museTHP: 0, fontDie }
    } }
  });
  docs.set(actor.uuid, actor);
  return actor;
}

const fontTarget = (name = "Ally") => {
  const foe = createTestActor({ name, hp: { value: 30, max: 30, temp: 0 } });
  docs.set(foe.uuid, foe);
  return foe;
};

/** Expiry time (world seconds) of the Font Aid Die effect on a creature, from its tag or its duration. */
function fontExpiryTime(target) {
  const effect = Features.findAidDieEffect(target);
  if (!effect) return undefined;
  const tag = effect.flags?.ak5e?.temporaryTag;
  if (tag?.expiry?.worldTime !== undefined) return Number(tag.expiry.worldTime);
  if (effect.duration?.seconds) return Number(effect.duration.startTime ?? 0) + Number(effect.duration.seconds);
  return null;
}

async function giveFont(bard, target, opId) {
  await bardPerform();
  return run(bard, "fontProvideAid", { targetUuid: target.uuid, targetName: target.name, distance: 10 }, opId);
}

test("F-R1.1: the Font of Inspiration Aid Die is a 600-second time expiry (tag trigger 'time', C3:6635)", async () => {
  const bard = fontBard(4);
  const foe = fontTarget();
  await giveFont(bard, foe, "fr1-1");
  const effect = Features.findAidDieEffect(foe);
  assert.ok(effect, "the target gains the Font Aid Die effect");
  assert.equal(effect.flags.ak5e.temporaryTag.expiry.trigger, "time", "the expiry trigger is time, not turnStart");
  assert.equal(fontExpiryTime(foe), 100 + 600, "it ends 600 seconds after the world time it was given (100 + 600)");
});

test("F-R1.2: the Font Aid Die is still there at the Bard's next turn start (C3:6635, not a turn expiry)", async () => {
  const bard = fontBard(4);
  const foe = fontTarget();
  const combat = createTestCombat([bard, fontTarget("Ally Two")]);
  combat.start();
  game.combat = combat;
  await giveFont(bard, foe, "fr1-2");
  assert.ok(Features.findAidDieEffect(foe), "precondition: the Font Aid Die is on the target");
  combat.nextTurn();
  combat.nextTurn();                       // the Bard's next turn: round 2, turn 0
  await expireFeatureTags({ kind: "combatTurn", combat });
  assert.ok(Features.findAidDieEffect(foe), "the Font die is not removed at the Bard's next turn start");
});

test("F-R1.3: the Font Aid Die is still there at combat end (C3:6635, ten minutes not combat)", async () => {
  const bard = fontBard(4);
  const foe = fontTarget();
  const combat = createTestCombat([bard]);
  combat.start();
  game.combat = combat;
  await giveFont(bard, foe, "fr1-3");
  await expireFeatureTags({ kind: "combatEnd", combat });
  assert.ok(Features.findAidDieEffect(foe), "combat end does not remove the Font die");
});

test("F-R1.4: the Font Aid Die expires exactly at 600 seconds (boundary 599 kept, 600 removed)", async () => {
  const bard = fontBard(4);
  const foe = fontTarget();
  await giveFont(bard, foe, "fr1-4");
  await expireFeatureTags({ kind: "time", worldTime: 699 });
  assert.ok(Features.findAidDieEffect(foe), "at 599 seconds after it was given, it still applies");
  await expireFeatureTags({ kind: "time", worldTime: 700 });
  assert.equal(Features.findAidDieEffect(foe), null, "at 600 seconds it is gone");
});

test("F-R1.5: guard: planning the Font Aid (Cancel) changes nothing on the target or the Bard", async () => {
  const bard = fontBard(4);
  const foe = fontTarget();
  const bardBefore = JSON.stringify(bard.flags.ak5e.bard);
  await warningsOf(() => Uses.supporterUses.plan(bard, "fontProvideAid", { targetUuid: foe.uuid, targetName: foe.name, distance: 10 }));
  assert.equal(Features.findAidDieEffect(foe), null, "a plan adds no effect");
  assert.equal(JSON.stringify(bard.flags.ak5e.bard), bardBefore, "the Font die is still on hand");
});

/* ==========================================================================
   F-R4a  Rupturing Hex: one burst card per kill and per Hexer, and a single roll
   ========================================================================== */

/** A Hexer at `level`. Owned by default; the owner is switchable after hexes are applied (the owner applies them). */
function makeHexer({ level = 4, owner = true, name = "Hexer", mods = {} } = {}) {
  const abilities = {};
  for (const [key, mod] of Object.entries({ ...DEFAULT_MODS, ...mods })) abilities[key] = { mod, value: 10 + 2 * mod };
  const items = [createTestItem({ name: "Supporter", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: "class-supporter" } } })];
  const actor = createTestActor({
    name: `${name} L${level}`, level, owner, items, abilities, hp: { value: 20, max: 20, temp: 0 },
    flags: { ak5e: { supporter: { enabled: true, branch: "hexer" } } }
  });
  docs.set(actor.uuid, actor);
  return actor;
}

const foeActor = (name = "Foe") => {
  const foe = createTestActor({ name, hp: { value: 30, max: 30, temp: 0 } });
  docs.set(foe.uuid, foe);
  return foe;
};

let opSeq = 0;
const potentData = (foe, kind, extra = {}) => ({ targetUuid: foe.uuid, targetName: foe.name, distance: 30, kind, ...extra });

/** Apply an Ultimate Hex from `hexer` on `foe`, accepting its overlap warnings (the Ultimate is one use per Long Rest). */
async function ultimateOn(hexer, foe, opId) {
  const warnings = await warningsOf(() => Uses.supporterUses.plan(hexer, "ultimateHex", potentData(foe, "looping")));
  return run(hexer, "ultimateHex", potentData(foe, "looping", { overrides: overridesFor(warnings) }), opId);
}

/** Pull the burst button attributes out of a card's HTML. */
function burstButton(message) {
  const match = /data-ak5e-hexer-roll="([^"]*)"\s+data-flavor="([^"]*)"\s+data-actor="([^"]*)"/.exec(contentOf(message));
  assert.ok(match, "the burst card carries a roll button");
  const once = /data-ak5e-hexer-once="([^"]*)"/.exec(contentOf(message));
  return { formula: match[1], flavor: match[2], actor: match[3], once: once ? once[1] : null };
}

/** A fake button that the card wiring can bind and click, the way the chat log does. */
function fakeButton(attrs) {
  const button = {
    dataset: { ak5eHexerRoll: attrs.formula, flavor: attrs.flavor, actor: attrs.actor,
      ...(attrs.once ? { ak5eHexerOnce: attrs.once } : {}) },
    disabled: false,
    handler: null,
    addEventListener(type, handler) { if (type === "click") this.handler = handler; },
    click() { return this.handler?.({ preventDefault() {}, stopPropagation() {} }); }
  };
  return button;
}

test("F-R4a.1: one kill of a creature with a single Ultimate Hex posts exactly one Rupturing burst card", async () => {
  const H = await hexer();
  const hexerA = makeHexer({ level: 17 });
  const foe = foeActor("Ruptured");
  await ultimateOn(hexerA, foe, "fr4a1-hex");
  const before = burstCards().length;
  await emitAk5eEvent("kill", { actorUuid: foe.uuid, eventId: "kill:fr4a1" });
  assert.equal(burstCards().length - before, 1, "one kill, one Rupturing card (today: one per Ultimate effect)");
  assert.ok(H, "the Hexer hooks are installed");
});

test("F-R4a.2: two different Hexers' Ultimate Hexes on one creature produce one burst card each", async () => {
  await hexer();
  const hexerA = makeHexer({ level: 17, name: "Hexer A" });
  const hexerB = makeHexer({ level: 17, name: "Hexer B" });
  const foe = foeActor("Shared");
  await ultimateOn(hexerA, foe, "fr4a2-a");
  await ultimateOn(hexerB, foe, "fr4a2-b");
  const before = burstCards().length;
  await emitAk5eEvent("kill", { actorUuid: foe.uuid, eventId: "kill:fr4a2" });
  const fresh = burstCards().slice(before);
  assert.equal(fresh.length, 2, "one card per Hexer");
  const speakers = fresh.map(message => message.speaker?.actor).sort();
  assert.deepEqual(speakers, [hexerA.id, hexerB.id].sort(), "each card is spoken by its own Hexer");
});

test("F-R4a.3: a repeat click of the burst roll button asks 'Already rolled' in a confirm dialog; Cancel rolls nothing, Confirm rolls", async () => {
  const { renderHexerCardButtons } = await hexer();
  const calls = rollSpy(6);
  const hexerA = makeHexer({ level: 17 });
  const foe = foeActor("Ruptured");
  await ultimateOn(hexerA, foe, "fr4a3-hex");
  await emitAk5eEvent("kill", { actorUuid: foe.uuid, eventId: "kill:fr4a3" });
  const card = burstCards().at(-1);
  const button = fakeButton(burstButton(card));
  renderHexerCardButtons(card, { querySelectorAll: () => [button] });

  // Click 1: the first roll, no dialog.
  const firstPrompts = dialogSpy(() => true);
  button.click(); await tick();
  assert.equal(calls.length, 1, "the first click rolls the burst once");
  assert.equal(firstPrompts.length, 0, "the first click shows no 'Already rolled' dialog");

  // Click 2: the repeat is a confirm dialog that says 'Already rolled'. Cancel changes nothing.
  const cancelPrompts = dialogSpy(() => false);
  const messagesBeforeCancel = messageCount();
  button.disabled = false;
  button.click(); await tick();
  assert.ok(cancelPrompts.some(p => p.kind === "confirm" && /already rolled/i.test(p.content + p.title)),
    `the repeat click asks a confirm dialog naming 'Already rolled' (got: ${JSON.stringify(cancelPrompts)})`);
  assert.equal(calls.length, 1, "Cancel: no roll is made");
  assert.equal(messageCount(), messagesBeforeCancel, "Cancel: no message is posted");

  // Click 3: the same repeat, confirmed. The roll happens.
  dialogSpy(() => true);
  button.disabled = false;
  button.click(); await tick();
  assert.equal(calls.length, 2, "Confirm: the repeat roll is made");
});

test("F-R4a.6: a second kill of the same creature posts a new burst card whose first click does not warn 'already rolled'", async () => {
  const { renderHexerCardButtons } = await hexer();
  const calls = rollSpy(6);
  const hexerA = makeHexer({ level: 17 });
  const foe = foeActor("Ruptured Twice");
  await ultimateOn(hexerA, foe, "fr4a6-hex");
  await emitAk5eEvent("kill", { actorUuid: foe.uuid, eventId: "kill:fr4a6a" });
  const first = burstCards().at(-1);
  const b1 = fakeButton(burstButton(first));
  renderHexerCardButtons(first, { querySelectorAll: () => [b1] });
  b1.click(); await tick();
  await emitAk5eEvent("kill", { actorUuid: foe.uuid, eventId: "kill:fr4a6b" });
  const second = burstCards().at(-1);
  assert.notEqual(second, first, "a new card is posted for the second kill");
  const prompts = dialogSpy(() => false);
  const b2 = fakeButton(burstButton(second));
  renderHexerCardButtons(second, { querySelectorAll: () => [b2] });
  b2.click(); await tick();
  assert.equal(prompts.filter(p => /already rolled/i.test(p.content + p.title)).length, 0, "no 'already rolled' prompt for a new card");
  assert.equal(calls.length, 2, "the new card's first click rolls");
});

test("F-R4a.4: guard: a non-owner of the Hexer cannot roll the burst (no Roll evaluated)", async () => {
  await hexer();
  const calls = rollSpy(6);
  const hexerA = makeHexer({ level: 17 });
  const foe = foeActor("Ruptured");
  await ultimateOn(hexerA, foe, "fr4a4-hex");
  await emitAk5eEvent("kill", { actorUuid: foe.uuid, eventId: "kill:fr4a4" });
  const card = burstCards().at(-1);
  const attrs = burstButton(card);
  const { renderHexerCardButtons } = await hexer();
  hexerA.isOwner = false;
  const button = fakeButton(attrs);
  renderHexerCardButtons(card, { querySelectorAll: () => [button] });
  button.click(); await tick();
  assert.equal(calls.length, 0, "no roll for a non-owner");
});

test("F-R4a.5: guard: an Ultimate Hex is level-gated; 16 warns, 17 has no level warning (boundary 16/17, C3:7325)", async () => {
  await hexer();
  const foe = foeActor("Gate");
  const at16 = await warningsOf(() => Uses.supporterUses.plan(makeHexer({ level: 16 }), "ultimateHex", potentData(foe, "looping")));
  const at17 = await warningsOf(() => Uses.supporterUses.plan(makeHexer({ level: 17 }), "ultimateHex", potentData(foe, "looping")));
  assert.ok(at16.some(w => /level/i.test(`${w.id} ${w.text}`)), `level 16 warns: ${warningText(at16)}`);
  assert.equal(at17.some(w => /level/i.test(`${w.id} ${w.text}`)), false, "level 17 raises no level warning");
});

/* ==========================================================================
   F-R4b  Hex Force rider: one card per creature per Hexer (owner and non-owner)
   ========================================================================== */

/** A Hexer (owner) with three Hexes of different kinds on `foe`, all from this one Hexer. Level 9: Potent Hex PB 4. */
async function threeHexesOn(foe, { level = 9 } = {}) {
  const h = makeHexer({ level });
  for (const kind of ["abjuring", "binding", "looping"]) {
    await run(h, "potentHex", potentData(foe, kind), `fr4b-${kind}-${++opSeq}`);
  }
  return h;
}

const hitOn = (foe, n, actorName = "Attacker") => emitAk5eEvent("hit", {
  actorUuid: foeActor(`${actorName} ${n}`).uuid, targetUuid: foe.uuid, ac: 10, eventId: `hit:${foe.name}:${n}:${Math.random()}`
});

test("F-R4b.1: guard: one hit on a creature with three Hexes from one Hexer posts exactly ONE rider card (owner path; base already passes)", async () => {
  await hexer();
  const foe = foeActor("Owner Path");
  const h = await threeHexesOn(foe);
  assert.equal(h.isOwner, true, "precondition: the owner path");
  const before = riderCards().length;
  await hitOn(foe, 1);
  assert.equal(riderCards().length - before, 1, "one rider card for one hit (today: one per Hex)");
});

test("F-R4b.2: one hit with three Hexes from a non-owned Hexer: exactly ONE rider card and exactly ONE relay whisper", async () => {
  await hexer();
  const foe = foeActor("Relay Path");
  const h = await threeHexesOn(foe);
  h.isOwner = false;                                   // the hitter does not own this Hexer
  const cardsBefore = riderCards().length, whispersBefore = relayWhispers().length;
  await hitOn(foe, 1);
  assert.equal(riderCards().length - cardsBefore, 1, "one rider card");
  assert.equal(relayWhispers().length - whispersBefore, 1, "one relay whisper to the GM (today: one per Hex)");
  const gm = game.users.activeGM;
  assert.deepEqual(relayWhispers().at(-1).whisper, [gm.id], "the relay is whispered to the active GM");
});

test("F-R4b.3: guard: after the Hexer's turn starts, the next hit posts one more rider card (cycle reset)", async () => {
  await hexer();
  const foe = foeActor("Reset");
  const h = await threeHexesOn(foe);
  await hitOn(foe, 1);
  await emitAk5eEvent("turnStart", { actorUuid: h.uuid, eventId: "ts:fr4b3" });
  const before = riderCards().length;
  await hitOn(foe, 2);
  assert.equal(riderCards().length - before, 1, "a fresh cycle allows exactly one more card");
});

/* ==========================================================================
   F-R1 / H2  Font of Inspiration relay validation: the GM relay re-checks the recorded Font Aid Die
   ========================================================================== */

/**
 * A Font Aid Die granted legitimately, then a copy of its receipt re-pointed at a second, fresh creature and
 * mutated. Relayed apply on the copy must be refused unless the copy is the unmodified legitimate change.
 */
async function fontRelayCopy(mutate, id) {
  await bardPerform();
  const bard = fontBard(4);
  const legit = fontTarget("Legit");
  await giveFont(bard, legit, `fr-h2-legit-${id}`);
  const copy = structuredClone(receiptOf(bard, `fr-h2-legit-${id}`));
  const fresh = fontTarget("Fresh");
  copy.id = id;
  const entry = copy.targets[0];
  entry.uuid = fresh.uuid;
  if (mutate) mutate(copy, entry);
  seedReceipt(bard, copy);
  return { bard, fresh };
}

test("F-R1.6: H2 positive control: the unmodified legitimate Font receipt applies through the relay", async () => {
  const { bard, fresh } = await fontRelayCopy(null, "fr-h2-ok");
  await relayApply(bard, "fr-h2-ok", fresh.uuid);
  assert.ok(Features.findAidDieEffect(fresh), "the legitimate Font die is applied to the target");
});

test("F-R1.7: H2: a relayed Font tag with an extra 'changes' key is rejected and creates no effect", async () => {
  const { bard, fresh } = await fontRelayCopy((c, e) => { e.tag.changes = [{ key: "system.attributes.movement.walk", mode: 2, value: "30" }]; }, "fr-h2-changes");
  await assert.rejects(() => relayApply(bard, "fr-h2-changes", fresh.uuid), "the extra changes are refused");
  assert.equal(Features.findAidDieEffect(fresh), null, "no effect is created");
});

test("F-R1.8: H2: a relayed Font tag with a 'condition' key is rejected and creates no effect", async () => {
  const { bard, fresh } = await fontRelayCopy((c, e) => { e.tag.condition = "blinded"; }, "fr-h2-condition");
  await assert.rejects(() => relayApply(bard, "fr-h2-condition", fresh.uuid), "the condition is refused");
  assert.equal(Features.findAidDieEffect(fresh), null, "no effect is created");
});

test("F-R1.9: H2: a relayed Font tag with 'standardBenefit' set is rejected and creates no effect", async () => {
  const { bard, fresh } = await fontRelayCopy((c, e) => { e.tag.standardBenefit = { name: "Extra", uuid: "Item.x" }; }, "fr-h2-benefit");
  await assert.rejects(() => relayApply(bard, "fr-h2-benefit", fresh.uuid), "the standard benefit is refused");
  assert.equal(Features.findAidDieEffect(fresh), null, "no effect is created");
});

test("F-R1.10: H2: a relayed Font die size that is not the Supporter's real die is rejected and creates no effect", async () => {
  // A Bard at level 4 has a d8 Font die. The production code stores dieSize as a string ("d8", "d10", "d12").
  // The copy claims "d12" in both the receipt and the tag, in that same representation, so the old receipt-to-tag
  // equality check passes and only the Supporter's real die can refuse it.
  const { bard, fresh } = await fontRelayCopy((c, e) => {
    c.result = { ...c.result, dieSize: "d12" };
    e.tag.data = { ...e.tag.data, dieSize: "d12" };
  }, "fr-h2-die");
  assert.equal(dieOf(4), 8, "oracle: a level 4 Font die has 8 faces (C3:6557-6578)");
  const legit = receiptOf(bard, "fr-h2-legit-fr-h2-die");
  assert.equal(typeof legit.targets[0].tag.data.dieSize, "string", "production stores dieSize as a string");
  assert.equal(legit.targets[0].tag.data.dieSize, `d${dieOf(4)}`, "the real level 4 die is stored as d8");
  await assert.rejects(() => relayApply(bard, "fr-h2-die", fresh.uuid), "a wrong die size is refused");
  assert.equal(Features.findAidDieEffect(fresh), null, "no effect is created");
});

test("F-R1.11: H2: a relayed Font tag whose supporterUuid is another Supporter is rejected and creates no effect", async () => {
  const { bard, fresh } = await fontRelayCopy((c, e) => { e.tag.data = { ...e.tag.data, supporterUuid: "Actor.someoneElse" }; }, "fr-h2-supp");
  await assert.rejects(() => relayApply(bard, "fr-h2-supp", fresh.uuid), "a mismatched supporter is refused");
  assert.equal(Features.findAidDieEffect(fresh), null, "no effect is created");
});

/* ==========================================================================
   F-R5  Emergency Improv Aid Die: no recorded check is a warning, not a block
   ========================================================================== */

/** A Bard at level 13 that can perform Emergency Improv: Aid Dice pool 6 (INT 6), an instrument, a Long Rest window. */
function improvBard() {
  const mods = { str: -1, dex: 0, con: 0, int: 6, wis: 1, cha: 2 };
  const abilities = {};
  for (const [key, mod] of Object.entries(mods)) abilities[key] = { mod, value: 10 + 2 * mod };
  const actor = createTestActor({
    name: "Improv Bard", level: 13, abilities, hp: { value: 20, max: 20, temp: 0 },
    items: [createTestItem({ name: "Supporter", type: "class", system: { levels: 13 }, flags: { ak5e: { chapterThreeId: "class-supporter" } } })],
    flags: { ak5e: {
      supporter: { enabled: true, branch: "bard", aidAbility: "int" },
      bard: { performances: [], active: null, museTHP: 0 },
      bardRest: { open: true, type: "long", at: "2026-10-24T00:00:00.000Z" },
      bardSetup: { done: true, instruments: ["Lute"], performance: "proficient" }
    } }
  });
  actor.system.attributes ??= {};
  actor.system.attributes.prof = pbOf(13);
  actor.system.skills ??= {};
  actor.system.skills.prf = { total: 5 };
  docs.set(actor.uuid, actor);
  return actor;
}

const COMPOSE = { mode: "compose", arts: ["Bane", "Aid", "Bolster"] };
const aidPoolOf = actor => getPool(actor, "aidDie").value;

async function rollUse(actor, useId, total) {
  rollSpy(total);
  globalThis.Roll = class TotalRoll {
    constructor(formula) { this.formula = formula; this.total = null; }
    async evaluate() { this.total = total; return this; }
    async toMessage() { return undefined; }
    static async roll() { throw new Error("Roll.roll must not run"); }
  };
  return Uses.supporterUses.command(actor, "useRoll", { useId }, `roll-${useId}`);
}

test("F-R5.1: Emergency Improv Aid Die with no recorded Performance check: the plan warns and is not refused", async () => {
  await bardCompose();
  const actor = improvBard();
  const warnings = await warningsOf(() => Uses.supporterUses.plan(actor, "emergencyImprovAid", { ...COMPOSE }));
  assert.ok(warnings.length > 0, "an unrecorded check is a warning");
  assert.equal(warnings.some(w => /check|roll/i.test(`${w.id} ${w.text}`)), true, `the warning names the missing check: ${warningText(warnings)}`);
});

test("F-R5.2: confirming the no-check warning applies the use (one Aid Die spent)", async () => {
  await bardCompose();
  const actor = improvBard();
  const before = aidPoolOf(actor);
  const warnings = await warningsOf(() => Uses.supporterUses.plan(actor, "emergencyImprovAid", { ...COMPOSE }));
  await run(actor, "emergencyImprovAid", { ...COMPOSE, overrides: overridesFor(warnings) }, "fr5-2");
  assert.ok(receiptOf(actor, "fr5-2"), "the use is recorded");
  assert.equal(aidPoolOf(actor), before - 1, "confirming spends the Aid Die");
});

test("F-R5.3: guard: the no-check warning blocks until accepted; a blocked use spends nothing", async () => {
  await bardCompose();
  const actor = improvBard();
  const before = aidPoolOf(actor);
  let error = null;
  try { await run(actor, "emergencyImprovAid", { ...COMPOSE }, "fr5-3"); }
  catch (caught) { error = caught; }
  assert.ok(isWarningError(error), `the unaccepted warning is raised as a warning, got: ${error?.name} ${error?.message}`);
  assert.equal(aidPoolOf(actor), before, "nothing is spent");
});

test("F-R5.4: guard: a failed recorded Performance check only warns, and the accepted use applies", async () => {
  await bardCompose();
  const actor = improvBard();
  await run(actor, "emergencyImprov", {}, "fr5-4-check");
  await rollUse(actor, "fr5-4-check", 4);                 // total 4 < DC 17
  const before = aidPoolOf(actor);
  const warnings = await warningsOf(() => Uses.supporterUses.plan(actor, "emergencyImprovAid", { ...COMPOSE, checkUseId: "fr5-4-check" }));
  assert.ok(warnings.some(w => w.id === "checkFailed"), `a failed check warns: ${warningText(warnings)}`);
  await run(actor, "emergencyImprovAid", { ...COMPOSE, checkUseId: "fr5-4-check", overrides: overridesFor(warnings) }, "fr5-4-aid");
  assert.equal(aidPoolOf(actor), before - 1, "accepted, the use applies");
});

test("F-R5.5: guard: planning the Emergency Improv Aid Die (Cancel) spends nothing", async () => {
  await bardCompose();
  const actor = improvBard();
  const before = aidPoolOf(actor);
  // A plan may warn, or refuse; either way a plan is never applied.
  await Promise.resolve().then(() => Uses.supporterUses.plan(actor, "emergencyImprovAid", { ...COMPOSE })).catch(() => null);
  assert.equal(aidPoolOf(actor), before);
  assert.equal(receiptOf(actor, "fr5-5"), null);
});

/* ==========================================================================
   F-R6  Spare the Rod: exclusions prompt from level 10 (C3:7307-7312)
   ========================================================================== */

/** A Hexer for the Cursemark UI command, with a targeted creature and a canvas token for the area. */
async function cursemarkUi(level) {
  const H = await hexer();
  const actor = makeHexer({ level });
  const goblin = foeActor("Goblin");
  targetToken(goblin, { x: 0, y: 0 });
  globalThis.canvas = { grid: { size: 100, distance: 5 }, scene: { id: "Scene.r6", grid: { size: 100, distance: 5 } },
    tokens: { placeables: [{ name: goblin.name, actor, center: { x: 0, y: 0 }, x: 0, y: 0, scene: { id: "Scene.r6" } }] } };
  return { H, actor, goblin };
}

test("F-R6.1: at level 10 the Cursemark command prompts for creatures to exclude; at level 9 it prompts only for the Hex", async () => {
  const { H: _H, actor: low } = await cursemarkUi(9);
  const lowPrompts = dialogSpy(title => (/Cursemark/.test(title) ? { kind: "looping", ability: "cha" } : true));
  const { hexerCommand } = await hexer();
  await hexerCommand(low, "cursemark").catch(() => null);
  const lowCount = lowPrompts.length;

  const { actor: high } = await cursemarkUi(10);
  const highPrompts = dialogSpy(title => (/Cursemark/.test(title) ? { kind: "looping", ability: "cha" } : true));
  await hexerCommand(high, "cursemark").catch(() => null);
  assert.equal(lowCount, 1, "level 9: only the Hex choice is shown");
  assert.ok(highPrompts.length >= 2, `level 10: an exclusion prompt follows the Hex choice (got ${highPrompts.length})`);
});

test.todo("F-R6.2: an excluded creature gets no Cursemark effect when the exclusion is chosen through the UI (prompt shape not fixed by the brief)");

test("F-R6.3: guard: the level 9/10 boundary for Spare the Rod in the recorded Cursemark (C3:7307-7312)", async () => {
  await hexer();
  const spared = foeActor("Spared");
  const { hexerApi: _api } = await hexer();
  const low = await warningsOf(() => Uses.supporterUses.plan(makeHexer({ level: 9 }), "cursemark",
    { point: { x: 0, y: 0 }, kind: "looping", distance: 30, excluded: [spared.uuid] }));
  const high = await warningsOf(() => Uses.supporterUses.plan(makeHexer({ level: 10 }), "cursemark",
    { point: { x: 0, y: 0 }, kind: "looping", distance: 30, excluded: [spared.uuid] }));
  assert.ok(low.some(w => /level/i.test(`${w.id} ${w.text}`)), `level 9 warns: ${warningText(low)}`);
  assert.equal(high.some(w => /level/i.test(`${w.id} ${w.text}`)), false, "level 10 has no level warning");
});

/* ==========================================================================
   F-R7  Artificer GM relay hardening
   ========================================================================== */

/** An Artificer Supporter at level 13 with Heavy Melee, Tech and Vehicles fields unset. */
function artificerActor() {
  const sClass = createTestItem({ name: "Supporter", type: "class", system: { levels: 13 }, flags: { ak5e: { chapterThreeId: "class-supporter" } } });
  const sub = createTestItem({ name: "Supporter: Artificer", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-artificer" } } });
  const actor = createTestActor({
    name: "Artificer", type: "character", owner: true, items: [sClass, sub],
    system: {
      attributes: { prof: pbOf(13), hp: { value: 30, max: 30, temp: 0 } },
      abilities: { int: { mod: 3, value: 16 }, wis: { mod: 0, value: 10 }, cha: { mod: 0, value: 10 },
        con: { mod: 0, value: 10 }, dex: { mod: 0, value: 10 }, str: { mod: 0, value: 10 } },
      skills: { ak5etech: { total: 5, value: 0 } },
      currency: { cp: 1300 },
      traits: { weaponProf: { custom: "" }, toolProf: { custom: "" } }
    },
    flags: { ak5e: { supporter: { enabled: true, branch: "artificer", aidAbility: "int" } } }
  });
  docs.set(actor.uuid, actor);
  return actor;
}

/** Seed a receipt in the source's own undo list (the flag a relayed change is checked against). */
function seedReceipt(source, receipt) {
  const state = source.flags.ak5e.supporterUses ?? { undo: [], data: {} };
  state.undo = [...(state.undo ?? []), { status: "complete", summary: "", ...receipt }];
  source.flags.ak5e.supporterUses = state;
}

const relayApply = (source, useId, targetUuid) => Uses.supporterUses.relayedTargetChange(source, "apply", { useId, targetUuid }, game.user);
const relayRevert = (source, useId, targetUuid) => Uses.supporterUses.relayedTargetChange(source, "revert", { useId, targetUuid }, game.user);

test("F-R7.1: the GM relay refuses a fields entry that writes hit points on a non-Automaton actor, and writes nothing", async () => {
  await artificer();
  const source = artificerActor();
  const foe = foeActor("Hostile Target");
  seedReceipt(source, { id: "fr7-1", command: "artificerSetup", targets: [{
    kind: "artificerFields", uuid: foe.uuid, name: foe.name, ready: true,
    set: { "system.attributes.hp.value": 1 }, before: { "system.attributes.hp.value": 30 } }] });
  await assert.rejects(() => relayApply(source, "fr7-1", foe.uuid), "the relay refuses the hit point write");
  assert.equal(foe.system.attributes.hp.value, 30, "nothing is written to the creature");
});

test("F-R7.2: the GM relay refuses a fields entry that writes Ownership on any actor, and writes nothing", async () => {
  await artificer();
  const source = artificerActor();
  const foe = foeActor("Ownership Target");
  const ownershipBefore = JSON.stringify(foe.ownership ?? {});
  seedReceipt(source, { id: "fr7-2", command: "artificerSetup", targets: [{
    kind: "artificerFields", uuid: foe.uuid, name: foe.name, ready: true,
    set: { ownership: { default: 3 } }, before: { ownership: foe.ownership ?? {} } }] });
  await assert.rejects(() => relayApply(source, "fr7-2", foe.uuid), "the relay refuses the ownership write");
  assert.equal(JSON.stringify(foe.ownership ?? {}), ownershipBefore, "ownership is unchanged");
});

test("F-R7.3: a legitimate Artificer setup field (Heavy Melee proficiency) is applied through the relay (base: refused, the validator is not reachable from the registered plan)", async () => {
  await artificer();
  const source = artificerActor();
  seedReceipt(source, { id: "fr7-3", command: "artificerSetup", targets: [{
    kind: "artificerFields", uuid: source.uuid, name: source.name, ready: true,
    set: { "system.traits.weaponProf.custom": "Heavy Melee Weapons" }, before: { "system.traits.weaponProf.custom": "" } }] });
  await relayApply(source, "fr7-3", source.uuid);
  assert.equal(source.system.traits.weaponProf.custom, "Heavy Melee Weapons", "the recorded setup change applies");
});

test("F-R7.4: the GM relay refuses to revert (delete) an Actor that is not this source's Automaton", async () => {
  await artificer();
  const source = artificerActor();
  const stray = createTestActor({ name: "Stray Automaton", owner: true,
    flags: { ak5e: { automaton: { creator: "Actor.someoneElse", variant: "platform", destroyed: false, exempt: false } } } });
  docs.set(stray.uuid, stray);
  seedReceipt(source, { id: "fr7-4", command: "buildAutomaton", targets: [{
    kind: "artificerAutomaton", uuid: stray.uuid, name: stray.name, ready: true }] });
  await assert.rejects(() => relayRevert(source, "fr7-4", stray.uuid), "the revert is refused");
  assert.equal(docs.has(stray.uuid), true, "the foreign Automaton still exists");
});

test("F-R7.5: revert tampering: a relayed fields receipt whose 'before' writes a path outside the whitelist is rejected on revert, and nothing is written", async () => {
  await artificer();
  const source = artificerActor();
  const foe = foeActor("Revert Target");
  seedReceipt(source, { id: "fr7-5", command: "artificerSetup", targets: [{
    kind: "artificerFields", uuid: foe.uuid, name: foe.name, ready: true,
    set: { "system.traits.weaponProf.custom": "Heavy Melee Weapons" },
    before: { "system.attributes.hp.value": 99 } }] });
  await assert.rejects(() => relayRevert(source, "fr7-5", foe.uuid), "a revert outside the whitelist is refused");
  assert.equal(foe.system.attributes.hp.value, 30, "the hit points are not restored to the tampered value");
});

test("F-R7.6: head ruling H4: a target in this Artificer's own automatons list is accepted even when not flagged as created by this source", async () => {
  await artificer();
  const source = artificerActor();
  const auto = createTestActor({ name: "Listed Automaton", owner: true,
    system: { attributes: { hp: { value: 0, max: 25, temp: 0 } } },
    flags: { ak5e: { automaton: { creator: "Actor.someoneElse", variant: "platform", destroyed: true, exempt: false } } } });
  docs.set(auto.uuid, auto);
  source.flags.ak5e.artificer = { ...(source.flags.ak5e.artificer ?? {}), automatons: [auto.uuid] };
  seedReceipt(source, { id: "fr7-6", command: "rebuildAutomaton", targets: [{
    kind: "artificerFields", uuid: auto.uuid, name: auto.name, ready: true,
    set: { "flags.ak5e.automaton.destroyed": false, "system.attributes.hp.value": 25 },
    before: { "flags.ak5e.automaton.destroyed": true, "system.attributes.hp.value": 0 } }] });
  await relayApply(source, "fr7-6", auto.uuid);
  assert.equal(auto.system.attributes.hp.value, 25, "the listed Automaton is rebuilt through the relay");
});

test("F-R7.7: guard: a target that is neither in the Artificer's list nor created by it is still refused for a fields write", async () => {
  await artificer();
  const source = artificerActor();
  const stray = createTestActor({ name: "Unlisted Automaton", owner: true,
    system: { attributes: { hp: { value: 0, max: 25, temp: 0 } } },
    flags: { ak5e: { automaton: { creator: "Actor.someoneElse", variant: "platform", destroyed: true, exempt: false } } } });
  docs.set(stray.uuid, stray);
  seedReceipt(source, { id: "fr7-7", command: "rebuildAutomaton", targets: [{
    kind: "artificerFields", uuid: stray.uuid, name: stray.name, ready: true,
    set: { "system.attributes.hp.value": 25 }, before: { "system.attributes.hp.value": 0 } }] });
  await assert.rejects(() => relayApply(source, "fr7-7", stray.uuid), "an unlisted foreign Automaton is refused");
  assert.equal(stray.system.attributes.hp.value, 0, "nothing is written");
});

/* ==========================================================================
   F-R8  Automaton orphan: a failed build leaves nothing behind; retries never duplicate
   ========================================================================== */

const automatonDocs = () => Array.from(docs.values()).filter(doc => doc.flags?.ak5e?.automaton);

/** Make the Artificer's next write of its automatons list fail (a failure after the world Actor is created). */
function failNextAutomatonWrite(actor) {
  const original = actor.update.bind(actor);
  let armed = true;
  actor.update = async (changes, options = {}) => {
    if (armed && Object.keys(changes ?? {}).some(key => key.includes("artificer.automatons"))) {
      armed = false;
      throw new Error("injected failure after the Automaton was created");
    }
    return original(changes, options);
  };
  return actor;
}

test("F-R8.1: a Build Automaton that fails after the world Actor is created leaves no orphan (or the receipt lets undo delete it)", async () => {
  await artificer();
  const source = failNextAutomatonWrite(artificerActor());
  const data = { variant: "platform", technologyModifier: "intMod" };
  await run(source, "buildAutomaton", data, "fr8-1").catch(() => null);
  if (receiptOf(source, "fr8-1")) await Uses.supporterUses.undo(source, "fr8-1").catch(() => null);
  assert.equal(automatonDocs().length, 0, "no Automaton remains after the failed build (or undo removed it)");
});

test("F-R8.2: retrying the same opId never creates a second Automaton", async () => {
  await artificer();
  const source = failNextAutomatonWrite(artificerActor());
  const data = { variant: "platform", technologyModifier: "intMod" };
  await run(source, "buildAutomaton", data, "fr8-2").catch(() => null);
  await run(source, "buildAutomaton", data, "fr8-2").catch(() => null);
  await run(source, "buildAutomaton", data, "fr8-2").catch(() => null);
  assert.ok(automatonDocs().length <= 1, `at most one Automaton for one opId, got ${automatonDocs().length}`);
});

test("F-R8.5: a failed build after the Actor exists leaves a receipt whose Automaton entry is marked attempted, so undo deletes it", async () => {
  await artificer();
  const source = failNextAutomatonWrite(artificerActor());
  const data = { variant: "platform", technologyModifier: "intMod" };
  await run(source, "buildAutomaton", data, "fr8-5").catch(() => null);
  const orphans = automatonDocs();
  const receipt = receiptOf(source, "fr8-5");
  const entry = receipt?.targets?.find(t => t.kind === "artificerAutomaton");
  assert.ok(entry, "the pending receipt records the Automaton entry");
  assert.ok(orphans.some(doc => doc.uuid === entry.uuid), "the recorded entry names the created Automaton");
  await Uses.supporterUses.undo(source, "fr8-5");
  assert.equal(automatonDocs().length, 0, "undoing the receipt deletes the Automaton");
});

test("F-R8.3: guard: planning the Build Automaton (Cancel) creates no Actor", async () => {
  await artificer();
  const source = artificerActor();
  await warningsOf(() => Uses.supporterUses.plan(source, "buildAutomaton", { variant: "platform", technologyModifier: "intMod" }));
  assert.equal(automatonDocs().length, 0);
});

test("F-R8.4: guard: a successful build followed by a retry of the same opId keeps exactly one Automaton", async () => {
  await artificer();
  const source = artificerActor();
  const data = { variant: "platform", technologyModifier: "intMod" };
  await run(source, "buildAutomaton", data, "fr8-4");
  await run(source, "buildAutomaton", data, "fr8-4").catch(() => null);
  assert.equal(automatonDocs().length, 1, "one Automaton");
});

/* ==========================================================================
   F-R9  Smaller fixes: Cursemark grid distance, pruning, Art cast wording
   ========================================================================== */

test("F-R9.1: Cursemark area uses the scene grid distance (10 ft grid: 1 cell in, 2 cells out, C3:7302)", async () => {
  const H = await hexer();
  const actor = makeHexer({ level: 10 });
  // A 10 ft grid: 100 px per cell and 10 px per foot. The mark is recorded on this scene.
  globalThis.canvas = { grid: { size: 100, distance: 10 }, scene: { id: "Scene.r9", grid: { size: 100, distance: 10 } } };
  await run(actor, "cursemark", { point: { x: 0, y: 0 }, kind: "looping", distance: 30, gridSize: 100 }, "fr9-1");
  const markId = actor.flags.ak5e.hexer.cursemarks.at(-1).id;
  const inside = foeActor("One Cell");   // centre 100 px = 10 ft
  const outside = foeActor("Two Cells"); // centre 200 px = 20 ft
  const tokens = [
    { uuid: "Scene.r9.Token.in", name: inside.name, actor: inside, x: 50, y: -50, center: { x: 100, y: 0 } },
    { uuid: "Scene.r9.Token.out", name: outside.name, actor: outside, x: 150, y: -50, center: { x: 200, y: 0 } }
  ];
  const hit = (H.cursemarkTargets(actor, markId, tokens) ?? []).map(t => t.actor?.uuid ?? t.uuid);
  assert.ok(hit.includes(inside.uuid), "a creature one cell (10 ft) away is inside the 10 ft radius");
  assert.equal(hit.includes(outside.uuid), false, "a creature two cells (20 ft) away is outside the 10 ft radius");
});

test("F-R9.2: recording a new Cursemark prunes the expired ones (their 60 s has passed)", async () => {
  await hexer();
  const actor = makeHexer({ level: 10 });
  await run(actor, "cursemark", { point: { x: 0, y: 0 }, kind: "looping", distance: 30 }, "fr9-2a");
  game.time.worldTime = 200;                              // the first mark expired at 160
  await run(actor, "cursemark", { point: { x: 0, y: 0 }, kind: "looping", distance: 30 }, "fr9-2b");
  const marks = actor.flags.ak5e.hexer.cursemarks ?? [];
  assert.equal(marks.length, 1, `only the live mark remains, got ${marks.length}`);
  assert.equal(marks[0].expires > 200, true, "the remaining mark is the live one");
});

test("F-R9.3: guard: a Cursemark that has not expired is kept when a new one is recorded", async () => {
  await hexer();
  const actor = makeHexer({ level: 10 });
  await run(actor, "cursemark", { point: { x: 0, y: 0 }, kind: "looping", distance: 30 }, "fr9-3a");
  game.time.worldTime = 120;                              // the first mark still runs until 160
  await run(actor, "cursemark", { point: { x: 0, y: 0 }, kind: "looping", distance: 30 }, "fr9-3b");
  assert.equal((actor.flags.ak5e.hexer.cursemarks ?? []).length, 2, "both live marks are kept");
});

test("F-R9.4: an Art cast that dealt no damage does not claim 'You dealt Damage with an Art'", async () => {
  await hexer();
  const actor = makeHexer({ level: 5 });
  const before = messageCount();
  // The artCast payload from the caster carries no damage: the amount, level and item only.
  await emitAk5eEvent("artCast", { actorUuid: actor.uuid, operationId: "fr9-4", amount: 1, level: 1, itemId: "item-x", origin: null, turn: 1 });
  const cards = game.messages.slice(before).map(contentOf);
  for (const text of cards) assert.doesNotMatch(text, /dealt Damage/i, "no damage claim for a cast that dealt none");
});

test.todo("F-R9.4b: an Art cast that did deal damage offers Potent Hex and says 'You dealt Damage with an Art' (damage payload field not fixed by the brief)");
