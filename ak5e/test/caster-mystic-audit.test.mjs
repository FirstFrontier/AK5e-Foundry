/**
 * WP caster-c5-mystic — spec-first audit tests (tester draft, phase 1: tests before code).
 *
 * Drafted 2026-11-03 by `adversary` ONLY from:
 * - AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt C3:672-720 (Mystic):
 *   Mystic Charge 683 (turn gain) / 685 (ritual) / 687 (cap 2, Long Rest clears) / 690 (burst,
 *   N+1 Action Cantrips, no Critical Hit); Potent Cantrip 694; Power Surge 699; Turbocharger
 *   704 (cap 3) + 706 (charge on Initiative roll); Feedback Loop 711.
 * - ak5e/CASTER_IMPLEMENTATION.md Mystic rows ("Mystic Charge", "Charge turn gain", "Charging
 *   ritual", "Burst", "Potent Cantrip", "Power Surge", "Turbocharger", "Feedback Loop").
 * - TODO/caster.md "Mystic — M" (open manual boundaries: ritual timing/completion confirmations,
 *   multi-attack Cantrip outcomes, charge-spend targeting).
 * - WORKFLOW.md §3.2 (trust the table: relay unowned changes through the GM client, warn never
 *   block, confirm before use, nothing auto-rolled, every change undoable in the encounter window).
 * - Sol spec findings (caster-audit planner): "Core/Mystic damage lacks GM relay
 *   (caster-features.mjs)" and "Base/Core/Mystic on older workflow" → pinned as behavior-red here.
 * No candidate code for this package (ak5e/scripts/caster-mystic.mjs, caster-mystic-ui.mjs) exists
 * in the lane yet; no production expectations were copied from it.
 *
 * Tags on every test:
 * - [E] Existing behaviour frozen as a regression guard for the extraction (green before AND after C5).
 * - [F] Fresh/required behaviour owned by C5 (red now by design; green only when the package delivers).
 * - [M] Manual boundary or required disclosure; tests pin the disclosure/warning shape, never invented automation.
 *
 * Criterion -> test map (citations in each title):
 *  C1 pool ........ 1a cap 2 -> 3 at 10 (C3:687,704), value clamp, branch-gated view (map "Mystic Charge" row)
 *                   1b Long Rest clears, Short Rest does not (C3:687)
 *  C2 turn gain ... 2a spent-AP-no-charge Turn grants exactly 1, event replay never twice (C3:683; map "Charge turn gain")
 *                   2b no gain without AP, with a Charge spent, or on a skipped Turn (C3:683)
 *  C3 ritual ...... 3a begin/finish/cancel lifecycle; up to 3 AP -> 1 Charge per AP, capped (C3:685; map "Charging ritual")
 *                   3b all rejections: no ritual, AP>3, minute/time unconfirmed, world time not advanced,
 *                      movement-interrupted, insufficient AP, pending ritual (C3:685)
 *                   3c ritual AP spend is not an Art cast: no Feedback Loop charge (C3:685 vs 711)
 *  C4 burst ....... 4a gates: no Charges, non-Cantrip, no Action casting time, stale preview, nested burst (C3:690; map "Burst")
 *                   4b all N Charges spent, N+1 separate cast receipts, critical suppression, same Cantrip (C3:690)
 *                   4c burst Turn: no turn-end gain; Power Surge feeds the burst Turn only (C3:683,690,699)
 *                   4d interrupted burst stays visible for GM review and reconcile (map "Burst"/"interruption remains visible")
 *  C5 potent ...... 5a half damage on miss/save, no additional effects, defense-confirmed, receipt replay (C3:694; map "Potent Cantrip")
 *                   5b rejections: hit outcome, levelled Art, branch/level gates (C3:694)
 *                   5c multi-attack stays behind the GM ruling (C3:694; TODO "multi-attack Cantrip outcomes") [M]
 *                   5d unowned Creature half damage arrives through the GM relay, not a block (C3:694 + WORKFLOW §3.2; Sol spec) [F-red]
 *                   5e potent write is undoable within the encounter window (WORKFLOW §3.2; map undo posture) [F-red]
 *  C6 surge ....... 6a +1 per Charge expended this Turn, Cantrips only, expires next Turn (C3:699; map "Power Surge")
 *                   6b level gate 6 and non-mystic read as 0 (C3:696-699)
 *  C7 turbocharger  7a charge on an actual Initiative roll; roll-object dedupe; reroll gains again;
 *                      fixed/edited initiative is not a roll (C3:706; map "Turbocharger")
 *                   7b cap 3 honoured; under level 10 no Quick Charge (C3:703-706)
 *  C8 loop ........ 8a AP-funded cast +1, Art of 6th level or higher +2; no spend/no gain; event dedupe; cap (C3:711)
 *                   8b under level 15 no Feedback Loop (C3:708-711)
 *  C9 package ..... 9a frozen surface: caster-mystic.mjs + caster-mystic-ui.mjs with the M0 signatures
 *                      (registerMystic / openMysticControls) while casterCommand & castCasterArt stay public [F-red]
 *                   9b mystic view discloses the relay + undo manual lines (WORKFLOW §3.2 disclosure parity) [F-red]
 *
 * Red-for-right-reason table (expected RED against the current shared monolith; the assertion
 * names the spec line or §3.2 clause the production code fails to honour; these are NOT harness errors):
 * - audit-5d: casterCommand("potent") on an unowned Creature throws "The GM must apply Damage to an
 *   unowned target." (caster-features.mjs damage branch). C3:694 ("that Creature still takes half of
 *   the Cantrip's Damage") plus WORKFLOW §3.2 ("relay unowned-target changes through the GM client")
 *   require the write to reach the Creature through the automatic GM relay, not a player-facing block.
 *   Sol spec finding: "Core/Mystic damage lacks GM relay". C2 (Core) shares this defect from its side.
 * - audit-5e: the potent write records no undo receipt, so undoUse rejects. WORKFLOW §3.2 requires
 *   every change to stay undoable within the encounter window (see the primal/splash/chain disclosure).
 * - audit-9b: getCasterView().manual carries the "Changes to Creatures you do not own are applied by
 *   the GM's client automatically... Undo..." line only for primal/splash/chain, not for mystic —
 *   disclosure of the same missing relay/undo behaviour as 5d/5e.
 * - audit-9a: ak5e/scripts/caster-mystic.mjs and caster-mystic-ui.mjs do not exist yet; the module-
 *   surface red names the M0 frozen signatures the C5 package must provide (registerMystic,
 *   openMysticControls) while preserving the public casterCommand/castCasterArt/mysticCharge surface.
 *
 * Assumptions (the manager may reject; none changes an expected AK5e outcome):
 * - "E/F/M" tags follow the legend above (F covers both new behaviour and fixes of the flagged §3.2 gaps).
 * - Frozen names assumed from M0 ("Signatures registerBase/Core/Mystic/Primal/Splash + open*Controls")
 *   and the C1 precedent (openBaseCastQuote): registerMystic / openMysticControls. 9a accepts any
 *   equivalent exported from caster-mystic-ui.mjs only if the module registers it via the C5 owner list.
 * - 5d asserts the OUTCOME (the unowned Creature actually loses half the rolled Cantrip damage through
 *   the GM-client path), not a particular relay function name; implementing it through the primal-splash
 *   use-engine (relayed receipt + relayedTargetChange) is the expected shape.
 * - The relay fix touches the shared damage command; C2 owns the same statement for Core signatures.
 *   Whoever integrates first delivers it; both packages may pin it.
 * - Ritual turn-end interaction is table-dependent (minute duration vs Turn boundary is a logged manual
 *   boundary in TODO/caster.md); tests only pin the printed confirmations and AP mechanics.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  casterCommand, registerCasterFeatureHooks, getCasterView, casterRest, casterTurnEvent,
  handleCasterEvent, casterInitiative, casterInitiativeMessage, mysticCharge, PRIMAL_CONDITIONS
} from "../scripts/caster-features.mjs";
import { validateCasterContext, casterConsumption, powerSurge, castDcBonus, casterAttackConfig } from "../scripts/caster-casting.mjs";

const TURN = "Combat.c:1:c1";
const storage = {};

// ---------- harness (conventions from caster-primal-audit / caster-chain-audit drafts) ----------
function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = structuredClone(value);
}
const getFlag = function (scope, key) { return this.flags?.[scope]?.[key]; };
function actorDoc(uuid, { owner = true, hp = { value: 30, max: 30, temp: 0 } } = {}) {
  return { id: uuid.split(".").at(-1), uuid, documentName: "Actor", type: "npc", name: uuid.split(".").at(-1), isOwner: owner,
    flags: { ak5e: {} }, system: { attributes: { hp: structuredClone(hp) } }, items: new Map(), effects: new Map(), writes: [], getFlag,
    async update(changes) { this.writes.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; },
    async createEmbeddedDocuments(type, data) {
      assert.equal(type, "ActiveEffect");
      return data.map(entry => { const id = `e${this.effects.size + 1}_${Math.random().toString(36).slice(2, 6)}`; const doc = { ...entry, id, parent: this, uuid: `${this.uuid}.ActiveEffect.${id}`, getFlag }; this.effects.set(id, doc); return doc; });
    }, async deleteEmbeddedDocuments(_type, ids) { for (const id of ids) this.effects.delete(id); } };
}
function world({ gm = false, withCombat = true } = {}) {
  const documents = new Map(), messages = [];
  globalThis.game = { user: { id: gm ? "gm" : "player", isGM: gm, targets: new Set() }, combat: withCombat ? {
      started: true, uuid: "Combat.c", id: "c", round: 1, turn: 0, combatant: { id: "c1", actor: { uuid: "Actor.caster" } },
      turns: [{ id: "c1", actor: { uuid: "Actor.caster" } }, { id: "c2", actor: { uuid: "Actor.target" } }] } : null,
    time: { worldTime: 0 }, settings: { get: (_m, key) => storage[key] ?? false }, actors: documents, scenes: new Map(), messages,
    users: new Map([["gm", { isGM: true }], ["player", { isGM: false }]]), i18n: { localize: key => key } };
  storage.encounterEpoch = 0;
  globalThis.fromUuidSync = uuid => documents.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => documents.get(uuid) ?? null;
  globalThis.foundry = { utils: { randomID: () => Math.random().toString(36).slice(2, 10) } };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), async create(data) { messages.push(data); return data; } } };
  globalThis.Roll = class { constructor(formula) { this.formula = formula; this.total = 8; } async evaluate() { return this; } async toMessage() {} };
  globalThis.Hooks = { on() {}, once() {} };
  globalThis.CONFIG = { DND5E: { activityTypes: {} }, statusEffects: Object.values(PRIMAL_CONDITIONS).map(id => ({ id, name: id, img: `${id}.svg` })) };
  registerCasterFeatureHooks();
  return { documents, messages };
}
function mysticCaster({ level = 1, ap = 20, charge = 0, branch = "mystic" } = {}) {
  const actor = actorDoc("Actor.caster");
  Object.assign(actor, { type: "character", name: "Caster" });
  actor.flags.ak5e = { casting: { enabled: true, ability: "int", recovery: "long" }, artsPoints: { maximum: 35, value: ap, maximumArtLevel: 9 },
    caster: { version: 1, enabled: true, choices: {}, pools: [], operations: [], casts: [], spends: [], rulings: {}, uses: {}, turn: {}, drones: [] },
    resourcePools: { mysticCharge: { value: charge } } };
  actor.system.abilities = { int: { value: 16, mod: 3 }, dex: { value: 10, mod: 0 } };
  actor.system.attributes = { ...actor.system.attributes, prof: level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2, spell: { dc: 13 + (level >= 6 ? 1 : 0) }, hp: { value: 30, max: 30, temp: 0 } };
  actor.system.currency = { cp: 0 };
  actor.getActiveTokens = () => []; actor.getRollData = () => ({});
  const add = (id, type, flags, system = {}) => actor.items.set(id, { id, type, name: id, system, flags: { ak5e: flags }, parent: actor, uuid: `Actor.caster.Item.${id}`, getFlag });
  add("class", "class", { chapterThreeId: "class-caster" }, { levels: level });
  add("branch", "subclass", { chapterThreeId: `subclass-caster-${branch}` });
  add("cantrip", "spell", { art: { enabled: true } }, { level: 0, activities: new Map([["a1", { id: "a1", activation: { type: "action" }, damage: { parts: [{ types: new Set(["cold"]) }] } }]]) });
  add("bonusCantrip", "spell", { art: { enabled: true } }, { level: 0, activities: new Map([["a1", { id: "a1", activation: { type: "bonus" }, damage: { parts: [{ types: new Set(["cold"]) }] } }]]) });
  add("levelArt", "spell", { art: { enabled: true } }, { level: 1, activities: new Map([["a1", { id: "a1", activation: { type: "action" } }]]) });
  add("sixthArt", "spell", { art: { enabled: true } }, { level: 6, activities: new Map([["a1", { id: "a1", activation: { type: "action" } }]]) });
  return actor;
}
function setup(options = {}, worldOptions = {}) {
  const env = world(worldOptions), actor = mysticCaster(options), target = actorDoc("Actor.target", { owner: false }), other = actorDoc("Actor.other", { owner: false });
  for (const doc of [actor, target, other]) env.documents.set(doc.uuid, doc);
  env.documents.set("caster", actor); // alias for initiative-message speaker resolution by actor id
  actor.flags.ak5e.caster.casts = [
    { id: "cantripHit", itemId: "cantrip", level: 0, completed: true, status: "complete", turn: TURN, context: {} },
    { id: "levelledHit", itemId: "levelArt", level: 1, completed: true, status: "complete", turn: TURN, context: {} }
  ];
  return { ...env, actor, target, other };
}
const state = actor => actor.flags.ak5e.caster;
const pools = actor => actor.flags.ak5e.resourcePools;
const apOf = actor => actor.flags.ak5e.artsPoints.value;
const ruling = (actor, key, value) => { state(actor).rulings[key] = { value, source: "Reviewed by the GM against the printed source." }; };
const applyChanges = (actor, paths) => { for (const [path, value] of Object.entries(paths)) setPath(actor, path, value); };
const consume = (actor, item, context, id) => {
  const updates = { actor: {} };
  casterConsumption({ actor, item, activation: { type: context.activationType ?? "action" } }, { ak5eCaster: context }, updates, { id, itemId: item.id, level: Number(item.system.level), cost: 0 });
  applyChanges(actor, updates.actor);
};
const potent = (actor, data, id) => casterCommand(actor, "potent", { castId: "cantripHit", targetUuid: "Actor.target", outcome: "miss", amount: 11, type: "cold", reduction: 0, resistance: false, vulnerability: false, immunity: false, confirmed: true, ...data }, id);

// ---------- C1 pool ----------

test("audit-1a [E] Mystic Charge caps at 2 and rises to 3 at level 10, stored values clamp, view is branch-gated (C3:687,704)", () => {
  world();
  assert.deepEqual(mysticCharge(mysticCaster({ level: 1 })), { value: 0, max: 2 });
  assert.equal(mysticCharge(mysticCaster({ level: 9, charge: 2 })).max, 2, "cap 2 up to level 9 (C3:687)");
  assert.equal(mysticCharge(mysticCaster({ level: 10, charge: 1 })).max, 3, "cap 3 from level 10 (C3:704)");
  assert.equal(mysticCharge(mysticCaster({ level: 1, charge: 7 })).value, 2, "a stored value above cap never reads above cap");
  const core = setup({ branch: "core" });
  assert.equal(getCasterView(core.actor).charge, null, "the charge read is Mystic-only in the view");
});

test("audit-1b [E] Long Rest loses all Mystic Charge; a Short Rest does not (C3:687)", async () => {
  const { actor } = setup({ level: 1, charge: 2 });
  await casterRest(actor, "short");
  assert.equal(pools(actor).mysticCharge.value, 2, "a Short Rest keeps stored charges");
  await casterRest(actor, "long");
  assert.equal(pools(actor).mysticCharge.value, 0, "Long Rest clears all Mystic Charge (C3:687)");
});

// ---------- C2 turn gain ----------

test("audit-2a [E] end of own Turn with AP spent and no Charge spent grants exactly 1; the same Turn event never grants twice (C3:683)", async () => {
  const { actor } = setup({ level: 3, charge: 0 });
  await handleCasterEvent({ kind: "apSpent", actorUuid: actor.uuid, operationId: "sp-2a", amount: 2, turn: TURN, reason: "Art cast" });
  await casterTurnEvent({ kind: "turnEnd", actorUuid: actor.uuid, combatUuid: "Combat.c", round: 1, combatantId: "c1" });
  assert.equal(pools(actor).mysticCharge.value, 1, "1 Mystic Charge at end of Turn (C3:683)");
  await casterTurnEvent({ kind: "turnEnd", actorUuid: actor.uuid, combatUuid: "Combat.c", round: 1, combatantId: "c1" });
  assert.equal(pools(actor).mysticCharge.value, 1, "event replay never grants twice");
});

test("audit-2b [E] no gain when no AP was spent, when a Charge was expended that Turn, or when the Turn was skipped (C3:683; map 'Skipped turns do not grant')", async () => {
  const bare = setup({ level: 3 });
  await casterTurnEvent({ kind: "turnEnd", actorUuid: bare.actor.uuid, combatUuid: "Combat.c", round: 1, combatantId: "c1" });
  assert.equal(pools(bare.actor).mysticCharge.value, 0, "no AP spent this Turn -> no Charge (C3:683)");

  const spent = setup({ level: 3 });
  await handleCasterEvent({ kind: "apSpent", actorUuid: spent.actor.uuid, operationId: "sp-2b", amount: 1, turn: TURN });
  state(spent.actor).turn.chargesSpent = 1;
  await casterTurnEvent({ kind: "turnEnd", actorUuid: spent.actor.uuid, combatUuid: "Combat.c", round: 1, combatantId: "c1" });
  assert.equal(pools(spent.actor).mysticCharge.value, 0, "Charges expended this Turn suppress the gain (C3:683)");

  const skipped = setup({ level: 3 });
  await handleCasterEvent({ kind: "apSpent", actorUuid: skipped.actor.uuid, operationId: "sp-2c", amount: 1, turn: TURN });
  await casterTurnEvent({ kind: "turnEnd", actorUuid: skipped.actor.uuid, combatUuid: "Combat.c", round: 1, combatantId: "c1", skipped: true });
  assert.equal(pools(skipped.actor).mysticCharge.value, 0, "a skipped Turn grants nothing");

  const other = setup({ level: 3 });
  await handleCasterEvent({ kind: "apSpent", actorUuid: other.actor.uuid, operationId: "sp-2d", amount: 1, turn: "Combat.c:1:c2" });
  await casterTurnEvent({ kind: "turnEnd", actorUuid: other.actor.uuid, combatUuid: "Combat.c", round: 1, combatantId: "c1" });
  assert.equal(pools(other.actor).mysticCharge.value, 0, "spending on another Creature's Turn is not 'this Turn' for the Caster's own end-of-Turn gain");
});

// ---------- C3 ritual ----------

test("audit-3a [E] the charging ritual spends up to 3 AP and grants 1 Charge per AP expended, capped; the same receipt replays without re-spending (C3:685)", async () => {
  const { actor } = setup({ level: 3, ap: 10, charge: 0 });
  await casterCommand(actor, "beginRitual", { confirmed: true }, "rit-begin");
  assert.ok(state(actor).ritual, "beginRitual records a pending ritual");
  await assert.rejects(casterCommand(actor, "beginRitual", { confirmed: true }, "rit-begin2"), /already pending/, "one ritual at a time");
  game.time.worldTime = 61;
  const done = await casterCommand(actor, "finishRitual", { ap: 2, stationary: true, concentration: true, minuteCompleted: true, confirmed: true }, "rit-1");
  assert.equal(done.charge, 2, "1 Charge per AP expended (C3:685)");
  assert.equal(apOf(actor), 8, "the ritual actually expended the Arts Points");
  assert.equal(state(actor).ritual, null, "completion closes the ritual");
  const retry = await casterCommand(actor, "finishRitual", { ap: 2, stationary: true, concentration: true, minuteCompleted: true, confirmed: true }, "rit-1");
  assert.equal(retry.charge, 2, "retry of the same receipt replays the recorded result");
  assert.equal(apOf(actor), 8, "retry never spends twice");
  assert.equal(pools(actor).mysticCharge.value, 2, "retry never grants twice");
  // Cap: 'up to your maximum Mystic Charge' (C3:685) — spend 3 AP from 1 stored Charge at cap 2.
  const near = setup({ level: 3, ap: 10, charge: 1 });
  await casterCommand(near.actor, "beginRitual", { confirmed: true }, "rit-b2");
  game.time.worldTime = 200;
  const capped = await casterCommand(near.actor, "finishRitual", { ap: 3, stationary: true, concentration: true, minuteCompleted: true, confirmed: true }, "rit-2");
  assert.equal(capped.charge, 2, "ritual gains stop at the maximum (C3:685: 'up to your maximum Mystic Charge')");
  assert.equal(apOf(near.actor), 7, "the AP was still fully expended");
});

test("audit-3b [E] ritual rejections: no pending ritual, more than 3 AP, missing confirmations, world time not advanced, movement-interrupted, insufficient AP (C3:685; TODO ritual confirmations)", async () => {
  const { actor } = setup({ level: 3, ap: 2, charge: 0 });
  game.time.worldTime = 120;
  await assert.rejects(casterCommand(actor, "finishRitual", { ap: 1, stationary: true, concentration: true, minuteCompleted: true, confirmed: true }, "x1"), /uninterrupted charging ritual/, "no ritual started (C3:685)");
  await casterCommand(actor, "beginRitual", { confirmed: true }, "x0");
  game.time.worldTime = actor.flags.ak5e.caster.ritual.start; // the minute has not passed in World time
  await assert.rejects(casterCommand(actor, "finishRitual", { ap: 1, stationary: true, concentration: true, minuteCompleted: true, confirmed: true }, "x2"), /Advance World time/, "the printed minute must actually pass (C3:685)");
  game.time.worldTime += 61;
  await assert.rejects(casterCommand(actor, "finishRitual", { ap: 4, stationary: true, concentration: true, minuteCompleted: true, confirmed: true }, "x3"), /Ritual AP.*0 to 3/, "up to 3 AP (C3:685)");
  await assert.rejects(casterCommand(actor, "finishRitual", { ap: 1, stationary: false, concentration: true, minuteCompleted: true, confirmed: true }, "x4"), /stationary|Confirm/, "stationary confirmation is required (C3:685)");
  await assert.rejects(casterCommand(actor, "finishRitual", { ap: 1, stationary: true, concentration: false, minuteCompleted: true, confirmed: true }, "x5"), /stationary|Confirm/, "the concentration-like confirmation is required (C3:685)");
  await assert.rejects(casterCommand(actor, "finishRitual", { ap: 3, stationary: true, concentration: true, minuteCompleted: true, confirmed: true }, "x6"), /Not enough AP/, "AP must exist to be expended");
  actor.flags.ak5e.caster.ritual.interrupted = true; // movement watcher flagged it
  await assert.rejects(casterCommand(actor, "finishRitual", { ap: 1, stationary: true, concentration: true, minuteCompleted: true, confirmed: true }, "x7"), /uninterrupted/, "a moved/interrupted ritual cannot complete (C3:685)");
  const cancel = await casterCommand(actor, "cancelRitual", { confirmed: true }, "x8");
  assert.equal(cancel.canceled, true, "cancel is always available and spends nothing");
  assert.equal(state(actor).ritual, null, "cancel clears the pending ritual");
  assert.equal(apOf(actor), 2, "cancel never spent AP");
});

test("audit-3c [F/E] ritual AP expenditure is not a cast: no Feedback Loop charge from it (C3:685 vs 711)", async () => {
  const { actor } = setup({ level: 15, ap: 10, charge: 0 });
  await casterCommand(actor, "beginRitual", { confirmed: true }, "rl-b");
  game.time.worldTime = 400;
  const done = await casterCommand(actor, "finishRitual", { ap: 1, stationary: true, concentration: true, minuteCompleted: true, confirmed: true }, "rl-f");
  assert.equal(done.charge, 1, "exactly 1 Charge from 1 AP — Feedback Loop must not add a second (C3:711 requires an Art cast)");
  assert.equal(pools(actor).mysticCharge.value, 1, "the stored pool shows the same single Charge");
});

// ---------- C4 burst ----------

test("audit-4a [E] burst gates: needs a Charge, a Cantrip with an Action casting time; a stale preview is sent back for review, and a pending burst blocks a new start (C3:690)", () => {
  const empty = setup({ level: 1, charge: 0 });
  assert.throws(() => validateCasterContext(empty.actor, empty.actor.items.get("cantrip"), { burstStart: true }), /At least one Mystic Charge/, "0 Charges -> no burst (C3:690)");
  const charges = setup({ level: 1, charge: 2 });
  assert.throws(() => validateCasterContext(charges.actor, charges.actor.items.get("levelArt"), { burstStart: true }), /known Cantrip/, "levelled Arts cannot be burst (C3:690)");
  assert.throws(() => validateCasterContext(charges.actor, charges.actor.items.get("bonusCantrip"), { burstStart: true }), /Action casting time/, "'Casting Time of Action' Cantrips only (C3:690)");
  assert.throws(() => validateCasterContext(charges.actor, charges.actor.items.get("cantrip"), { burstStart: true, burstCharges: 1 }), /changed after preview/, "preview staleness returns the burst for review, never silently re-spends [M]");
  const cantrip = charges.actor.items.get("cantrip");
  consume(charges.actor, cantrip, validateCasterContext(charges.actor, cantrip, { burstStart: true }), "burst-0");
  pools(charges.actor).mysticCharge.value = 2; // a fresh charge exists; the nested gate must still block a second burst
  assert.throws(() => validateCasterContext(charges.actor, cantrip, { burstStart: true }), /Finish or reconcile the current burst/, "no nested bursts (C3:690 'as part of this Action')");
});

test("audit-4b [E] all N Charges are spent for N+1 separate Action Cantrip casts; critical damage is suppressed; a finished burst accepts no further step (C3:690; map 'Burst')", () => {
  const { actor } = setup({ level: 6, charge: 2 });
  const cantrip = actor.items.get("cantrip");
  const firstContext = validateCasterContext(actor, cantrip, { burstStart: true });
  assert.equal(firstContext.burstCharges, 2, "burst expends ALL charges (C3:690)");
  assert.equal(firstContext.noCritical, true, "burst Cantrips cannot score a Critical Hit (C3:690)");
  consume(actor, cantrip, firstContext, "burst-0");
  assert.equal(pools(actor).mysticCharge.value, 0, "every Charge was spent on the burst");
  assert.deepEqual({ remaining: state(actor).burst.remaining, total: state(actor).burst.total }, { remaining: 2, total: 3 }, "N+1 casts this Action (C3:690)");
  for (const id of ["burst-1", "burst-2"]) {
    const step = validateCasterContext(actor, cantrip, { burstStep: true });
    assert.equal(step.noCritical, true, "repeat casts also cannot crit (C3:690)");
    consume(actor, cantrip, step, id);
  }
  assert.equal(state(actor).burst.remaining, 0, "exactly 2 repeat casts for 2 Charges");
  assert.equal(state(actor).casts.filter(c => c.id?.startsWith("burst-")).length, 3, "each cast is its own receipt (map 'Individual native casts/receipts')");
  assert.throws(() => validateCasterContext(actor, cantrip, { burstStep: true }), /no current burst cast remaining/, "no third repeat");
  assert.throws(() => validateCasterContext(actor, actor.items.get("levelArt"), { burstStep: true }), /Mystic burst uses a known Cantrip/, "steps stay on the same Cantrip (C3:690)");
});

test("audit-4c [E] the burst Turn spends its Charges so the end-of-Turn gain is suppressed, and Surge does not leak into the next Turn (C3:683,690,699)", async () => {
  const { actor } = setup({ level: 6, charge: 2 });
  const cantrip = actor.items.get("cantrip");
  consume(actor, cantrip, validateCasterContext(actor, cantrip, { burstStart: true }), "burst-0");
  assert.equal(state(actor).turn.chargesSpent, 2, "2 Charges expended during this Turn (C3:699 basis)");
  await casterTurnEvent({ kind: "turnEnd", actorUuid: actor.uuid, combatUuid: "Combat.c", round: 1, combatantId: "c1" });
  assert.equal(pools(actor).mysticCharge.value, 0, "charges were spent this Turn -> no end-of-Turn gain (C3:683)");
  assert.equal(state(actor).burst.interrupted, true, "unspent repeats become an interrupted burst at Turn end (map 'interruption remains visible')");
  await casterTurnEvent({ kind: "turnStart", actorUuid: actor.uuid, combatUuid: "Combat.c", round: 2, combatantId: "c1" });
  assert.equal(powerSurge(actor), 0, "Power Surge is spent only 'during the current Turn' (C3:699)");
});

test("audit-4d [E] an interrupted burst stays visible for GM review and reconcile clears it with a recorded recovery (map 'Burst / interruption remains visible')", async () => {
  const { actor } = setup({ level: 6, charge: 2 }, { gm: true });
  const cantrip = actor.items.get("cantrip");
  consume(actor, cantrip, validateCasterContext(actor, cantrip, { burstStart: true }), "burst-0");
  await casterTurnEvent({ kind: "turnEnd", actorUuid: actor.uuid, combatUuid: "Combat.c", round: 1, combatantId: "c1" });
  const pending = getCasterView(actor).pending.find(p => p.id === "burst_burst-0");
  assert.ok(pending, "the unfinished burst appears in the review queue");
  assert.match(pending.label, /GM review/, "it is labelled for GM review");
  const rec = await casterCommand(actor, "reconcile", { operationId: "burst_burst-0", reason: "GM reviewed the abandoned burst at the table.", confirmed: true }, "rec-1");
  assert.equal(rec.reconciled, "burst_burst-0", "reconcile closes the abandoned burst");
  assert.equal(state(actor).burst, null, "the burst state is cleared after reconcile");
  assert.ok(state(actor).burstRecovery, "the recovery is durably recorded for the audit trail");
});

// ---------- C5 potent ----------

test("audit-5a [E] Potent Cantrip halves the reviewed damage on a miss or a successful save, discloses noAdditionalEffects, and a receipt replay never damages twice (C3:694; map 'Potent Cantrip')", async () => {
  const { actor, target } = setup({ level: 3 }, { gm: true });
  const result = await potent(actor, {}, "pot-1");
  assert.equal(result.noAdditionalEffects, true, "'suffers no additional effects' (C3:694)");
  assert.equal(target.system.attributes.hp.value, 25, "half of 11 floor-rounded = 5 damage (C3:694)");
  const replay = await potent(actor, {}, "pot-1");
  assert.equal(replay.noAdditionalEffects, true, "replay returns the recorded result");
  assert.equal(target.system.attributes.hp.value, 25, "the same receipt can never damage twice");
  assert.equal(target.writes.filter(w => "system.attributes.hp.value" in w).length, 1, "exactly one HP write for the operation");
  // Successful save uses the same helper.
  await potent(actor, { outcome: "save", amount: 8, castId: "cantripHit" }, "pot-2");
  assert.equal(target.system.attributes.hp.value, 21, "a saving throw the Creature succeeded still takes half (4) (C3:694)");
});

test("audit-5b [E] Potent rejects a hit, a levelled Art, a non-Mystic branch and under level 3 (C3:692-694)", async () => {
  const { actor } = setup({ level: 3 }, { gm: true });
  await assert.rejects(potent(actor, { outcome: "hit" }, "p1"), /missed Cantrip attack or successful save/, "a hit is not a Potent trigger (C3:694)");
  await assert.rejects(potent(actor, { castId: "levelledHit" }, "p2"), /missed Cantrip attack or successful save/, "levelled Arts are not Cantrips (C3:694)");
  const low = setup({ level: 2 }, { gm: true });
  await assert.rejects(potent(low.actor, {}, "p3"), /mystic level 3/, "Potent arrives at 3rd level (C3:692)");
  const core = setup({ level: 3, branch: "core" }, { gm: true });
  await assert.rejects(potent(core.actor, {}, "p4"), /mystic level 3/, "Potent is Mystic-only");
});

test("audit-5c [M] a multi-attack Cantrip stays behind the explicit GM ruling; it is never auto-averaged or silently applied (C3:694; TODO 'multi-attack Cantrip outcomes')", async () => {
  const { actor, target } = setup({ level: 3 }, { gm: true });
  await assert.rejects(potent(actor, { multiAttack: true }, "m1"), /Review multi-attack|record a ruling for potentMultiAttack/, "multi-attack requires a ruling (map 'Multi-attack/unusual structures require GM ruling')");
  assert.equal(target.system.attributes.hp.value, 30, "the rejected use wrote nothing");
  ruling(actor, "potentMultiAttack", true);
  const ok = await potent(actor, { multiAttack: true }, "m2");
  assert.equal(ok.noAdditionalEffects, true, "with the ruling recorded, half damage applies per the printed text (C3:694)");
});

test("audit-5d [F] a Creature the player does not own receives Potent half damage through the automatic GM relay, not a player-facing block (C3:694 + WORKFLOW §3.2; Sol spec 'Mystic damage lacks GM relay')", async () => {
  const { actor, target } = setup({ level: 3, charge: 0 }, { gm: true }); // DISPUTE upheld (manager 2026-11-03): target stays owner:false (unowned by the player); gm:true provides the active GM client so the §3.2 relay can apply. gm:false must leave the use pending per the engine contract — asserting a landed write with no GM was a fixture bug.
  const error = await potent(actor, {}, "relay-1").catch(e => e);
  assert.ok(!(error instanceof Error),
    "unowned-Creature Potent damage must reach the Creature through the GM client (WORKFLOW §3.2: 'relay unowned-target changes through the GM client'; C3:694 grants the half damage regardless of ownership). Current caster-features.mjs damage branch blocks with: " + String(error?.message));
  assert.equal(target.system.attributes.hp.value, 25, "the relayed write lands exactly half of the reviewed damage (C3:694)");
});

test("audit-5e [F] the Potent write is undoable within the encounter window: its receipt restores the target cleanly and a replay after undo cannot double-apply (WORKFLOW §3.2; map undo posture)", async () => {
  const { actor, target } = setup({ level: 3 }, { gm: true });
  await potent(actor, {}, "undo-1");
  assert.equal(target.system.attributes.hp.value, 25, "precondition: damage applied");
  const undo = await casterCommand(actor, "undoUse", { useId: "undo-1" }).catch(e => e);
  assert.ok(!(undo instanceof Error),
    "every Caster feature change must be undoable within the encounter window (WORKFLOW §3.2); the Mystic potent write currently records no undo receipt: " + String(undo?.message));
  assert.equal(target.system.attributes.hp.value, 30, "undo restores the Creature exactly");
});

// ---------- C6 power surge ----------

test("audit-6a [E] Power Surge gives Cantrips +1 per Mystic Charge expended during the current Turn, on damage DCs and attack rolls alike (C3:699)", () => {
  const { actor } = setup({ level: 6, charge: 2 });
  const cantrip = actor.items.get("cantrip");
  const start = validateCasterContext(actor, cantrip, { burstStart: true });
  assert.equal(start.surge, 2, "the burst's own casts surge by the Charges it expends (C3:699)");
  consume(actor, cantrip, start, "surge-0");
  assert.equal(powerSurge(actor), 2, "2 Charges expended this Turn -> +2 (C3:699)");
  assert.equal(castDcBonus(actor, cantrip, { actor, item: cantrip }, powerSurge(actor)), 2, "the bonus reaches Cantrip Save DCs (C3:699)");
  assert.equal(castDcBonus(actor, actor.items.get("levelArt"), { actor, item: actor.items.get("levelArt") }, 2), 0, "levelled Arts get no Surge (C3:699 'for Cantrips')");
  const roll = { parts: [] };
  casterAttackConfig({ subject: { actor, item: cantrip }, rolls: [roll] });
  assert.ok(roll.parts.includes("2"), "the bonus reaches Cantrip Spell Attack Rolls (C3:699)");
});

test("audit-6b [E] Surge reads 0 below Mystic level 6 and outside the Turn it was spent (C3:696-699)", async () => {
  const low = setup({ level: 5, charge: 2 });
  const cantrip = low.actor.items.get("cantrip");
  consume(low.actor, cantrip, validateCasterContext(low.actor, cantrip, { burstStart: true }), "s5-0");
  assert.equal(powerSurge(low.actor), 0, "no Power Surge before 6th level (C3:696)");
  const mid = setup({ level: 6, charge: 2 });
  const midCantrip = mid.actor.items.get("cantrip");
  consume(mid.actor, midCantrip, validateCasterContext(mid.actor, midCantrip, { burstStart: true }), "s6-0");
  assert.equal(powerSurge(mid.actor), 2, "surge lives during the Turn the Charges were spent");
  await casterTurnEvent({ kind: "turnStart", actorUuid: mid.actor.uuid, combatUuid: "Combat.c", round: 2, combatantId: "c1" });
  assert.equal(powerSurge(mid.actor), 0, "and no bonus beyond that Turn (map 'No bonus beyond Turn')");
});

// ---------- C7 turbocharger ----------

test("audit-7a [E] Turbocharger grants 1 Charge whenever the Caster rolls Initiative; the same roll dedupes, a reroll gains again, and fixed/edited initiative is not a roll (C3:706; map 'Turbocharger')", async () => {
  const { actor } = setup({ level: 10, charge: 0 });
  const rollA = { dice: [{}] };
  await casterInitiative(actor, rollA, "init-1");
  await casterInitiative(actor, rollA, "init-1");
  assert.equal(pools(actor).mysticCharge.value, 1, "one charge per actual Initiative roll (C3:706)");
  await casterInitiative(actor, { dice: [{}] }, "init-2");
  assert.equal(pools(actor).mysticCharge.value, 2, "a reroll is a new roll and gains again (map 'rerolls allowed')");
  const message = { uuid: "m-fixed", getFlag: () => true, rolls: [{ dice: [] }], speaker: { actor: "caster" } };
  await casterInitiativeMessage(message, game.user.id);
  assert.equal(pools(actor).mysticCharge.value, 2, "a fixed/edit Initiative entry is not a roll (map 'Combatant edits and fixed initiative are not rolls')");
  await casterInitiativeMessage({ uuid: "m1", getFlag: (_s, k) => k === "initiativeRoll" ? true : undefined, rolls: [{ dice: [{}] }], speaker: { actor: "caster" } }, "someone-else");
  assert.equal(pools(actor).mysticCharge.value, 2, "another user's message is not ours to act on");
  await casterInitiativeMessage({ uuid: "m2", getFlag: (_s, k) => k === "initiativeRoll" ? true : undefined, rolls: [{ dice: [{}] }], speaker: { actor: "caster" } }, game.user.id);
  assert.equal(pools(actor).mysticCharge.value, 3, "our own Initiative roll from a chat message grants the Charge");
});

test("audit-7b [E] Quick Charge respects the 3-cap; below level 10 rolling Initiative grants nothing (C3:703-706)", async () => {
  const full = setup({ level: 10, charge: 3 });
  await casterInitiative(full.actor, { dice: [{}] }, "init-f1");
  await casterInitiative(full.actor, { dice: [{}] }, "init-f2");
  assert.equal(pools(full.actor).mysticCharge.value, 3, "gains clamp at the maximum (C3:704)");
  const early = setup({ level: 9, charge: 0 });
  await casterInitiative(early.actor, { dice: [{}] }, "init-e1");
  assert.equal(pools(early.actor).mysticCharge.value, 0, "Turbocharger is a 10th-level benefit (C3:701)");
});

// ---------- C8 feedback loop ----------

test("audit-8a [E] Feedback Loop: an AP-funded cast grants 1 Charge, a 6th-level-or-higher Art grants another; zero-cost casts never do; events dedupe and cap (C3:711; map 'Free/fully discounted casts do not qualify')", async () => {
  const { actor } = setup({ level: 15, charge: 0 });
  await handleCasterEvent({ kind: "artCast", actorUuid: actor.uuid, operationId: "fb-1", amount: 3, level: 5 });
  assert.equal(pools(actor).mysticCharge.value, 1, "casting with Arts Points -> +1 (C3:711)");
  await handleCasterEvent({ kind: "artCast", actorUuid: actor.uuid, operationId: "fb-1", amount: 3, level: 5 });
  assert.equal(pools(actor).mysticCharge.value, 1, "the same cast event never grants twice");
  await handleCasterEvent({ kind: "artCast", actorUuid: actor.uuid, operationId: "fb-2", amount: 9, level: 6 });
  assert.equal(pools(actor).mysticCharge.value, 3, "6th level or higher adds the second Charge (C3:711)");
  await handleCasterEvent({ kind: "artCast", actorUuid: actor.uuid, operationId: "fb-3", amount: 0, level: 9 });
  assert.equal(pools(actor).mysticCharge.value, 3, "a fully free cast spent no Arts Points and grants nothing (C3:711 'using Arts Points')");
  await handleCasterEvent({ kind: "artCast", actorUuid: actor.uuid, operationId: "fb-4", amount: 4, level: 7 });
  assert.equal(pools(actor).mysticCharge.value, 3, "gains cap at the maximum (C3:687,704)");
});

test("audit-8b [E] Feedback Loop unlocks only at 15th level (C3:708-711)", async () => {
  const { actor } = setup({ level: 14, charge: 0 });
  await handleCasterEvent({ kind: "artCast", actorUuid: actor.uuid, operationId: "fl-14", amount: 4, level: 6 });
  assert.equal(pools(actor).mysticCharge.value, 0, "no Feedback Loop below 15th (C3:708)");
});

// ---------- C9 package surface + disclosure ----------

test("audit-9a [F] C5 frozen surface: caster-mystic.mjs exports registerMystic() and caster-mystic-ui.mjs exports openMysticControls(), while the public monolith surface stays callable (M0 signatures; C3:672-720)", async () => {
  world();
  const modUrl = new URL("../scripts/caster-mystic.mjs", import.meta.url);
  const uiUrl = new URL("../scripts/caster-mystic-ui.mjs", import.meta.url);
  assert.ok(existsSync(modUrl), "C5 must extract the Mystic branch into ak5e/scripts/caster-mystic.mjs (M0 'Signatures registerBase/Core/Mystic/Primal/Splash'); the lane owns this file and it does not exist yet.");
  const mod = await import(modUrl);
  assert.equal(typeof mod.registerMystic, "function", "caster-mystic.mjs must export the registerMystic() wiring signature (M0)");
  assert.ok(["mysticCharge"].every(name => typeof mod[name] === "function"), "the charge read must be reachable from the extracted module or re-exported from caster-features.mjs");
  assert.ok(existsSync(uiUrl), "C5 must provide ak5e/scripts/caster-mystic-ui.mjs (lane-owned open*Controls module)");
  const ui = await import(uiUrl);
  assert.equal(typeof ui.openMysticControls, "function", "caster-mystic-ui.mjs must export openMysticControls (M0 'open*Controls' family; precedent: openBaseCastQuote in caster-base-ui.mjs)");
  // The public surface must survive the extraction (M0: 'preserve casterCommand/castCasterArt APIs').
  for (const [name, fn] of Object.entries({ casterCommand, getCasterView, casterRest, mysticCharge }))
    assert.equal(typeof fn, "function", `${name} must stay callable from caster-features.mjs after extraction`);
});

test("audit-9b [F] the Caster view discloses the relay + undo posture for the Mystic branch like every other §3.2 branch (WORKFLOW §3.2 disclosure parity)", () => {
  const { actor } = setup({ level: 3 });
  const manual = getCasterView(actor).manual.join(" ");
  assert.match(manual, /do not own/, "Mystic feature changes to Creatures the player does not own are applied by the GM's client automatically (WORKFLOW §3.2) — the view must say so once the relay exists");
  assert.match(manual, /Undo/i, "the encounter-window undo of Mystic writes must be disclosed in the manual lines");
});
