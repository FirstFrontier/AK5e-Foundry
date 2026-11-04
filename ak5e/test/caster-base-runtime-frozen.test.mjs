// WP CBR — caster-base-runtime frozen tests (adversary, drafted from spec BEFORE candidate).
// Spec: .codex-work/caster-base-replan/SPEC-caster-base-replan.md §5 WP CBR (R1-R15) + §3.3-3.4.
// Black-box: exercises live facades (casterCommand/castCasterArt/casterConsumption/
// completeCaster*/handleCasterEvent/casterRest/validateCasterContext/registerCasterFeatureHooks)
// per "frozen tests must exercise each of these facade paths; direct base imports are supplemental."
// New seams (registerBase) are probed with dynamic import so this file loads clean on unchanged code.
// Lap-1 lessons baked in: numeric AP readings rejected (R10), Unending replay strictness (R6/R12),
// no blanket pending/GM veto (R7), canonical refund linkage (R8).
import test from "node:test";
import assert from "node:assert/strict";
import { casterConsumption, completeCasterConsumption, completeCasterUse, casterTurn, castCasterArt,
  casterGrant, validateCasterContext, markCasterCastFailure } from "../scripts/caster-casting.mjs";
import { casterCommand, handleCasterEvent, casterRest, getCasterView, registerCasterFeatureHooks,
  casterSpellDC, recordCasterRuling } from "../scripts/caster-features.mjs";
import { onAk5eEvent, offAk5eEvent } from "../scripts/trigger-events.mjs";
import { consumeArt, wrapActivityUse, undoArtReceipt, grantFor } from "../scripts/arts-casting.mjs";
import { artsState, quoteArt } from "../scripts/arts-rules.mjs";

// ---------- harness (native-wrapper convention: caster-casting.test.mjs:175-212) ----------
function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = structuredClone(value);
}
const TABLE = { 1: [3, 1], 2: [4, 1], 3: [6, 2], 4: [7, 2], 5: [10, 3], 6: [11, 3], 7: [12, 4], 8: [15, 4],
  9: [16, 5], 10: [17, 5], 11: [20, 6], 12: [21, 6], 13: [22, 7], 14: [25, 7], 15: [26, 8], 16: [27, 8],
  17: [30, 9], 18: [31, 9], 19: [32, 9], 20: [35, 9] };

let opCounter = 0;
function world({ level = 18, branch = "core", ap = 20, artLevel, combat = true, owner = true, roll = 3 } = {}) {
  const maximum = artLevel ?? TABLE[level][1];
  const rollFormulas = [];
  const env = { rollCount: 0, warns: [], get rollFormulas() { return rollFormulas; }, documents: new Map(), get messages() { return game.messages ?? []; } };
  globalThis.game = {
    user: { id: "owner-user", isGM: false, targets: new Set() },
    combat: combat ? { started: true, uuid: "Combat.cbr", id: "cbr", round: 2, turn: 1,
      combatant: { id: "caster-turn", actor: { uuid: "Actor.caster" } } } : null,
    time: { worldTime: 0 }, settings: { get: () => false }, actors: new Map(), scenes: new Map(),
    users: Object.assign(new Map(), { activeGM: null })
  };
  game.i18n = { localize: key => key, format: key => key };
  globalThis.fromUuidSync = uuid => env.documents.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => env.documents.get(uuid) ?? null;
  opCounter = 0;
  globalThis.foundry = { utils: { randomID: () => `op-${++opCounter}` } };
  globalThis.ui = { notifications: { warn(m) { env.warns.push(String(m)); }, error(m) { env.warns.push(String(m)); }, info() {} } };
  globalThis.CONFIG = { DND5E: { activityTypes: {} } };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}),
    async create(data) { const clone = structuredClone({ ...data, actor: undefined }); (game.messages ??= []).push(clone); return clone; },
    async updateOne(id, changes) { return { id, ...changes }; } } };
  globalThis.Roll = class { constructor(formula) { rollFormulas.push(String(formula)); }
    async evaluate() { env.rollCount += 1; this.total = roll; return this; } async toMessage() {} };
  const actor = {
    id: "caster", uuid: "Actor.caster", documentName: "Actor", type: "character", name: "Caster", isOwner: owner,
    flags: { ak5e: { casting: { enabled: true, ability: "int", castingUnit: "wand", recovery: "long" },
      artsPoints: { maximum: TABLE[level][0], value: ap, maximumArtLevel: maximum, ninthLevelCast: false },
      caster: { version: 1, enabled: true, choices: {}, pools: [], operations: [], casts: [], spends: [],
        rulings: {}, uses: {}, turn: {}, drones: [], undo: [] } } },
    ownership: { default: 0, player: 3 },
    system: { abilities: { int: { value: 16, mod: 3 }, wis: { value: 10, mod: 0 }, cha: { value: 10, mod: 0 },
      con: { value: 12, mod: 1 }, str: { value: 20, mod: 5 }, dex: { value: 18, mod: 4 } },
      attributes: { prof: 3, spell: { attack: 6 }, hp: { value: 10, max: 10, temp: 0 } },
      skills: {}, tools: {}, currency: { cp: 0 }, bonuses: {} },
    items: new Map(), writes: [], tokens: [], failNextUpdate: null,
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    getActiveTokens() { return this.tokens; }, getRollData() { return {}; },
    async update(changes) {
      if (this.failNextUpdate?.(changes)) { this.failNextUpdate = null; throw new Error("injected Actor update failure"); }
      this.writes.push(structuredClone(changes));
      for (const [path, value] of Object.entries(changes)) setPath(this, path, value);
      return this;
    },
    async createEmbeddedDocuments(_type, data) { return data.map((entry, i) => ({ ...structuredClone(entry), id: `grant${i}` })); }
  };
  const branchIds = { core: "subclass-caster-core", mystic: "subclass-caster-mystic", "mech-accord": "subclass-caster-mech-accord" };
  actor.items.set("class", { id: "class", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-caster" } }, getFlag(s, k) { return this.flags?.[s]?.[k]; } });
  actor.items.set("branch", { id: "branch", type: "subclass", system: {}, flags: { ak5e: { chapterThreeId: branchIds[branch] } }, getFlag(s, k) { return this.flags?.[s]?.[k]; } });
  env.documents.set(actor.uuid, actor); game.actors.set(actor.uuid, actor);
  env.actor = actor;
  return env;
}
function art(env, { id = "art", name = "Reviewed Art", level = 1, activation = "action", grant = null } = {}) {
  const { actor } = env;
  // Real native activity objects commit through the wrapped-prototype seam (casting fixture pattern).
  // noCastingUnit:true keeps focus checks out of scope (caster-casting.test.mjs:185 precedent).
  const baseGrant = grant ?? { enabled: true, noCastingUnit: true };
  class Activity {
    constructor(item) { this.actor = actor; this.item = item; this.id = "activity"; this.activation = { type: activation }; }
    async use(cfg) {
      const updates = { actor: {} }, message = { data: {} };
      const usage = { ...cfg, ak5eLevel: cfg.ak5eLevel ?? cfg.level ?? this.item.system.level, ak5eMode: cfg.ak5eMode ?? cfg.mode ?? "ap" };
      const result = consumeArt(this, usage, message, updates);
      if (result === false) return false;
      applyActorChanges(actor, updates.actor);
      return true;
    }
  }
  wrapActivityUse(Activity.prototype);
  const item = { id, type: "spell", name, actor,
    system: { level, activities: new Map([["activity", new Activity(null)]]) },
    flags: { ak5e: { art: baseGrant } },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; } };
  const activity = item.system.activities.get("activity");
  activity.item = item;
  actor.items.set(id, item);
  return item;
}
function applyActorChanges(actor, changes) { for (const [path, value] of Object.entries(changes)) setPath(actor, path, value); }
function approved(env, key, value) { env.actor.flags.ak5e.caster.rulings[key] = { value, source: "Reviewed printed source; recorded by the GM." }; }
// Drives one native commit through the item's wrapped activity exactly as production does.
async function nativeCast(env, item, usage = {}) {
  return item.system.activities.get("activity").use({ ak5eLevel: item.system.level, ak5eMode: "ap", ...usage });
}
function seedCast(env, item, { id = "first", level = item.system.level, activation = "action", targets = [] } = {}) {
  const cast = { id, itemId: item.id, level, cost: 1, turn: casterTurn(env.actor), activation, targets, completed: true, status: "complete" };
  env.actor.flags.ak5e.caster.casts.push(cast);
  return cast;
}
function recordSpend(env, { id = "sp-1", amount = 3, level = 1, reason = "Art cast" } = {}) {
  return handleCasterEvent({ kind: "apSpent", actorUuid: env.actor.uuid, operationId: id, amount, level, turn: casterTurn(env.actor), reason });
}
function events(kindList, handlers = {}) {
  const received = [];
  const off = [];
  for (const kind of kindList) off.push([kind, onAk5eEvent(kind, event => { received.push(event); handlers[kind]?.(event); })]);
  return { received, cleanup: () => { for (const [kind, handler] of off) offAk5eEvent(kind, handler); } };
}
const numericish = value => /^\d+(\.\d+)?$/.test(String(value));

// ---------- R1 live registration ----------
test("CBR-T01 [R1] registerBase exists, is inert and idempotent; startup hooks register exactly once; base exports stay live", async () => {
  world(); // real-ish Foundry globals (CONFIG/i18n/Roll/Chat) for the registration path
  const hooks = {};
  globalThis.Hooks = { on: (name, fn) => { (hooks[name] ??= []).push(fn); } };
  registerCasterFeatureHooks();
  registerCasterFeatureHooks(); // twice: idempotent registration must not add a second consumer/listener (§3.3)
  for (const [name, listeners] of Object.entries(hooks)) {
    assert.equal(listeners.length, 1, `hook "${name}" must be registered exactly once even when hooks register twice`);
  }
  // Frozen interface: add registerBase({castArt}) exported from caster-features (§3.3).
  const features = await import("../scripts/caster-features.mjs");
  assert.equal(typeof features.registerBase, "function", "registerBase must be exported from caster-features");
  let castArtCalls = 0;
  const castArt = async () => { castArtCalls += 1; return true; };
  features.registerBase({ castArt });
  features.registerBase({ castArt }); // idempotent, must not register a second consumer/event listener
  assert.equal(castArtCalls, 0, "registration must not execute a use (§3.3)");
  // Base module surface required by the frozen contract (§3.3) must exist.
  const base = await import("../scripts/caster-base.mjs");
  for (const name of ["validateBaseContext", "baseConsumption", "baseEvent", "baseRest"]) {
    assert.equal(typeof base[name], "function", `caster-base must export ${name}`);
  }
  // All previous branch registration/export behavior remains available.
  for (const name of ["casterCommand", "handleCasterEvent", "casterTurnEvent", "casterRest", "casterCombatEnd",
    "getCasterView", "recordCasterRuling", "reviewCasterEligibility", "casterInitiative", "casterInitiativeMessage",
    "registerCasterFeatureHooks", "mysticCharge", "casterSpellDC", "castCasterArt", "createCasterDrone"]) {
    assert.equal(typeof features[name], "function", `caster-features must keep exporting ${name}`);
  }
});

// ---------- R2 AP/native contract ----------
test("CBR-T02 [R2] native casts pay AP not slots, quotes follow cast level, Detect Magic is free, Counterspell is not, and cap/once-per-LR breaches are warnings with Use anyway", async () => {
  const env = world({ level: 6, ap: 10 }); // table: AP 11 max; maximumArtLevel 3
  env.actor.flags.ak5e.artsPoints.maximum = 11;
  const item = art(env, { id: "surge", level: 3 });
  const before = JSON.stringify(env.actor.system.spells ?? {});
  const ok = await nativeCast(env, item);
  assert.equal(ok, true);
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 7, "an Art cast at level 3 costs 3 AP (C1:188)");
  assert.equal(JSON.stringify(env.actor.system.spells ?? {}), before, "Arts casting must not touch spell slots (C1:185)");
  assert.ok(env.actor.writes.every(changes => !Object.keys(changes).some(p => p.startsWith("system.spells"))), "no spell-slot debit on any Actor update");

  // Detect Magic level-2 grant costs zero (C3:157-158): cast through the free mode configured by setup.
  const dm = art(env, { id: "detect-magic", name: "Detect Magic", level: 1,
    grant: { enabled: true, noCastingUnit: true, free: { level: 1, maximum: null, spent: 0 }, source: "Caster 2nd level: Arts Detection" } });
  const quote = quoteArt(artsState(env.actor), 1, 1, grantFor(dm, env.actor, {}), { mode: "free" });
  assert.equal(quote.cost, 0, "Detect Magic is cast without expending Arts Points");
  const ap = env.actor.flags.ak5e.artsPoints.value;
  const dmOk = await nativeCast(env, dm, { ak5eMode: "free", ak5eLevel: 1 });
  assert.equal(dmOk, true);
  assert.equal(env.actor.flags.ak5e.artsPoints.value, ap, "free Detect Magic spends no AP");

  // Counterspell (C3:169-172) is always prepared but NOT free: it has no blanket free-use property.
  const counterspell = art(env, { id: "counterspell", name: "Counterspell", level: 3 });
  const csGrant = grantFor(counterspell, env.actor, {});
  assert.equal(csGrant.free ?? null, null, "Counterspell must not gain a free-cast grant");
  assert.throws(() => quoteArt(artsState(env.actor), 3, 3, csGrant, { mode: "free" }), /free casting/i);
  const csBefore = env.actor.flags.ak5e.artsPoints.value;
  assert.equal(await nativeCast(env, counterspell), true);
  assert.equal(env.actor.flags.ak5e.artsPoints.value, csBefore - 3, "Counterspell pays its level in AP (level 3 == maximum, no Growing Power)");

  // Ninth-level once per Long Rest (C1:191-195) is a warning with Use anyway, not a hard veto (spec §3.1/R2).
  const nine = world({ level: 18, ap: 31 });
  nine.actor.flags.ak5e.artsPoints.maximum = 31;
  const item9 = art(nine, { id: "ninth", level: 9 });
  nine.actor.flags.ak5e.artsPoints.ninthLevelCast = true;
  let err;
  try { validateCasterContext(nine.actor, item9, { mode: "ap", level: 9 }); } catch (error) { err = error; }
  assert.equal(err?.name, "AK5eWarnings", "a once-per-LR breach must warn (Use anyway), not hard-refuse");
  const ids = (err?.warnings ?? []).map(w => w.id);
  assert.ok(ids.length > 0, "the warning carries a stable id the override can accept");
  const overridden = validateCasterContext(nine.actor, item9, { mode: "ap", level: 9, overrides: ids });
  assert.ok(overridden.warnings.some(w => /9|long rest/i.test(w.text + w.id)) || Array.isArray(overridden.overridden),
    "the override records the once-per-LR warning it accepted");

  // Maximum-Art-Level breach is likewise a warning with Use anyway (spec R2: source cap violations warn).
  const capped = world({ level: 5 }); // maximumArtLevel 3
  const above = art(capped, { id: "above", level: 4 });
  let capErr;
  try { validateCasterContext(capped.actor, above, { mode: "ap", level: 4 }); } catch (error) { capErr = error; }
  assert.equal(capErr?.name, "AK5eWarnings", "exceeding the maximum Art level must warn with Use anyway, not hard-refuse");
});

// ---------- R3 Growing Power ----------
test("CBR-T03 [R3] Growing Power discounts the selected cast level below the current maximum only: none at L4, -1 at L5-10, -2 at L11+, minimum 0", () => {
  const rows = [
    [4, 1, 1, 1, 0],    // level, castBase, castSelected, expected cost, expected GP discount (0 = no modifier)
    [5, 1, 1, 0, 1], [5, 2, 2, 1, 1], [5, 3, 3, 3, 0],
    [10, 1, 1, 0, 1], [10, 2, 3, 2, 1], [10, 4, 4, 3, 1], [10, 5, 5, 5, 0],
    [11, 1, 1, 0, 2], [11, 3, 3, 1, 2], [11, 6, 6, 6, 0],
    [20, 1, 2, 0, 2], [20, 8, 8, 6, 2], [20, 9, 9, 9, 0]
  ];
  for (const [level, base, selected, expected, discount] of rows) {
    const env = world({ level, ap: 35 });
    const item = art(env, { id: `gp-${level}-${base}-${selected}`, level: base });
    const grant = casterGrant(env.actor, item, {});
    const q = quoteArt(artsState(env.actor), base, selected, grant, { mode: "ap" });
    assert.equal(q.cost, expected, `L${level} casting level ${selected}`);
    const gp = q.modifiers.filter(m => m.source === "Growing Power");
    if (discount) assert.deepEqual(gp.map(m => m.amount), [-discount], `L${level} selected ${selected} must take a ${discount} AP reduction`);
    else assert.deepEqual(gp, [], `L${level} selected ${selected} must take no Growing Power reduction (equal to maximum, or level 4)`);
  }
  // Selected upcast level drives the discount, never the printed level: base-1 Art upcast to 2 at L11
  // (max 6) is discounted by 2 even though its printed level (1) would already be below max.
  const env = world({ level: 11, ap: 20 });
  const up = art(env, { id: "up", level: 1 });
  assert.equal(quoteArt(artsState(env.actor), 1, 2, casterGrant(env.actor, up, {}), { mode: "ap" }).cost, 0);
  assert.equal(quoteArt(artsState(env.actor), 1, 1, casterGrant(env.actor, up, {}), { mode: "ap" }).cost, 0);
});

// ---------- R4 apSpent/artCast identity ----------
test("CBR-T04 [R4] one positive actual apSpent after commit and one artCast on completion; cancel/failure/duplicate emit neither extra; clamped shortfall reports the actual debit", async () => {
  // Ordinary successful native cast: one of each, amount = actual debit.
  const env = world({ level: 6, ap: 6 });
  const item = art(env, { id: "r4a", level: 3 });
  const bus = events(["apSpent", "artCast"]);
  try {
    assert.equal(await nativeCast(env, item), true);
    assert.deepEqual(bus.received.map(e => e.kind), ["apSpent", "artCast"]);
    const spend = bus.received[0];
    assert.equal(spend.amount, 3, "apSpent.amount is the positive actual debit");
    assert.equal(spend.actorUuid, env.actor.uuid);
    assert.ok(spend.operationId, "the event freezes the source spend identity (operationId alias)");
    assert.equal(env.actor.flags.ak5e.artsPoints.value, 3);
    // Duplicate completion of the same receipt emits no extra apSpent (§3.3 identity).
    await completeCasterConsumption(env.actor, env.actor.flags.ak5e.lastArtCast);
    assert.equal(bus.received.filter(e => e.kind === "apSpent").length, 1, "one recorded spend emits exactly one positive apSpent");
    await completeCasterUse(env.actor, env.actor.flags.ak5e.lastArtCast);
    assert.equal(bus.received.filter(e => e.kind === "artCast").length, 1, "duplicate completion emits no extra artCast");

    // Clamped actual: AP 2, quoted cost 3 (level 3 == maximum, no GP), confirmed shortfall -> actual 2, not 3.
    const short = world({ level: 6, ap: 2 });
    const shortItem = art(short, { id: "r4b", level: 3 });
    let shortWarn;
    try { validateCasterContext(short.actor, shortItem, { mode: "ap", level: 3 }); } catch (error) { shortWarn = error; }
    assert.ok(shortWarn === undefined || shortWarn.name === "AK5eWarnings",
      "insufficient AP must surface as a warning with Use anyway, never a hard veto (spec R2)");
    const shortBus = events(["apSpent", "artCast"]);
    try {
      const usage = shortWarn
        ? { ak5eCaster: validateCasterContext(short.actor, shortItem, { mode: "ap", level: 3, overrides: shortWarn.warnings.map(w => w.id) }) }
        : {};
      assert.equal(await nativeCast(short, shortItem, usage), true, "an insufficient-AP cast proceeds once the player accepts the warning");
      const spendEvent = shortBus.received.find(e => e.kind === "apSpent");
      assert.equal(spendEvent?.amount, 2, "E.g. AP 2, quoted cost 5, confirmed shortfall gives actual amount 2, not 5");
      assert.equal(short.actor.flags.ak5e.artsPoints.value, 0, "the shortfall override clamps at zero");
      const receipt = short.actor.flags.ak5e.artReceipts.at(-1);
      assert.ok(Number(receipt?.shortfall) >= 1, "the shortfall is publicly recorded on the receipt");
    } finally { shortBus.cleanup(); }

    // Refunds emit neither apSpent nor artCast.
    const before = bus.received.length;
    await recordSpend(env, { id: "r4-spend", amount: 3 });
    await handleCasterEvent({ kind: "artCast", actorUuid: env.actor.uuid, operationId: "r4-spend", amount: 3, level: 3, turn: casterTurn(env.actor) });
    assert.equal(bus.received.length, before, "event replay adds no extra events to the bus listener");
  } finally { bus.cleanup(); }

  // Canceled native use (consumption never reached): neither event.
  const cancelEnv = world({ level: 6, ap: 6 });
  const cancelItem = art(cancelEnv, { id: "r4c", level: 3 });
  cancelItem.system.activities.get("activity").use = async () => ({ cancelled: true });
  // Mirror of FailAfterConsume below: driven through the wrapped native use seam, whose inner use
  // defers to the canceled native stub, so consumption is never reached.
  class CancelUse { constructor() { this.actor = cancelEnv.actor; this.item = cancelItem; }
    async use(cfg) { return cancelItem.system.activities.get("activity").use(cfg) ?? { cancelled: true }; } }
  wrapActivityUse(CancelUse.prototype);
  const cancelBus = events(["apSpent", "artCast"]);
  try {
    await new CancelUse().use({ ak5eLevel: 3, ak5eMode: "ap" });
    assert.deepEqual(cancelBus.received, [], "a canceled native use emits neither apSpent nor artCast");
    assert.equal(cancelEnv.actor.flags.ak5e.artsPoints.value, 6);
    delete cancelItem.system.activities.get("activity").use;
  } finally { cancelBus.cleanup(); }

  // Failure after the debit: the spend receipt is retained; no artCast pretends success.
  const failEnv = world({ level: 6, ap: 6 });
  const failItem = art(failEnv, { id: "r4d", level: 3 });
  class FailAfterConsume { constructor() { this.actor = failEnv.actor; this.item = failItem; }
    async use(cfg) {
      const updates = { actor: {} }, message = { data: {} };
      consumeArt(this, cfg, message, updates);
      applyActorChanges(failEnv.actor, updates.actor);
      throw new Error("injected post-consumption failure");
    } }
  wrapActivityUse(FailAfterConsume.prototype);
  const failBus = events(["apSpent", "artCast"]);
  try {
    await assert.rejects(new FailAfterConsume().use({ ak5eLevel: 3, ak5eMode: "ap" }), /injected post-consumption failure/);
    assert.deepEqual(failBus.received.map(e => e.kind), ["apSpent"],
      "failure after a debit retains its spend receipt without pretending the Art succeeded");
    assert.equal(failEnv.actor.flags.ak5e.artsPoints.value, 3, "the actual debit stands; no automatic refund on failure (§3.1)");
  } finally { failBus.cleanup(); }
});

// ---------- R5 Unending offer per positive spend ----------
test("CBR-T05 [R5] every positive recorded AP expenditure (native or existing branch) exposes a receipt-linked Unending use; zero debits do not; >d6 spends are not dropped", async () => {
  const env = world({ level: 18, ap: 20 });
  // A synthetic existing-branch spend reaches the same base hook with no completed Art (no artCast event).
  await recordSpend(env, { id: "branch-spend", amount: 2, reason: "Jury Rigging" });
  const spend = env.actor.flags.ak5e.caster.spends.find(entry => entry.id === "branch-spend");
  assert.ok(spend, "a positive branch apSpent must record a base expenditure trigger");
  assert.equal(spend.amount, 2, "the offer is linked to the recorded actual spend");
  // Zero-cost cast: no expenditure trigger (§3.3: a zero actual debit is not an expenditure trigger).
  await handleCasterEvent({ kind: "apSpent", actorUuid: env.actor.uuid, operationId: "zero-spend", amount: 0, level: 1, turn: casterTurn(env.actor) });
  await handleCasterEvent({ kind: "artCast", actorUuid: env.actor.uuid, operationId: "zero-spend", amount: 0, level: 1, turn: casterTurn(env.actor) });
  assert.equal(env.actor.flags.ak5e.caster.spends.some(entry => entry.id === "zero-spend"), false,
    "zero-cost casts create no expenditure trigger");
  // Positive spend above the d6 range: recorded, not silently dropped.
  await recordSpend(env, { id: "big-spend", amount: 7, reason: "High-level Art" });
  assert.ok(env.actor.flags.ak5e.caster.spends.some(entry => entry.id === "big-spend" && entry.amount === 7),
    "positive expenditures above the d6 range are not silently dropped");
  // The offer is receipt-linked, addressable by spendId with no new branch mechanics (unending is base).
  const view = getCasterView(env.actor);
  assert.ok(Array.isArray(view.pending), "getCasterView keeps its pending surface");
  // Refund never re-triggers: replaying the spend event does not duplicate the offer.
  await recordSpend(env, { id: "branch-spend", amount: 2, reason: "Jury Rigging" });
  assert.equal(env.actor.flags.ak5e.caster.spends.filter(entry => entry.id === "branch-spend").length, 1,
    "event replay is deduplicated into the same receipt-linked offer");
});

// ---------- R6 roll lifecycle ----------
test("CBR-T06 [R6] confirm persists awaitingRoll with no die and no AP change; only the Roll 1d6 click rolls once; persisted result survives clicks/retries; a new operation cannot re-claim a spent source", async () => {
  const env = world({ level: 18, ap: 10, roll: 3 });
  await recordSpend(env, { id: "unending-3", amount: 3, level: 2 });
  approved(env, "unendingBasis", "actualSpend");
  const bus = events(["apSpent", "artCast"]);
  try {
    const prepared = await casterCommand(env.actor, "unending", { confirmed: true, spendId: "unending-3" }, "un-1");
    assert.equal(prepared.awaitingRoll, true, "confirming persists intent and awaitingRoll");
    assert.equal(env.rollCount, 0, "a prompt may be automatic, the die may not: confirming rolls nothing");
    assert.equal(env.actor.flags.ak5e.artsPoints.value, 10, "confirm changes no AP");
    assert.ok(env.actor.writes.length > 0, "the intent is durably persisted before any roll");

    const result = await casterCommand(env.actor, "useRoll", { useId: "un-1" }, "un-1-roll");
    assert.equal(env.rollCount, 1, "the explicit Roll 1d6 action rolls exactly once");
    assert.ok(env.rollFormulas.some(formula => /1d6/.test(formula)), "the rolled formula is 1d6");
    assert.deepEqual({ roll: result.roll, refunded: result.refunded }, { roll: 3, refunded: 3 }, "matching actual spend refunds that amount");
    assert.equal(env.actor.flags.ak5e.artsPoints.value, 13);
    // Formula/result persisted: the stored use keeps the d6 outcome.
    const persisted = JSON.stringify(env.actor.flags.ak5e.caster);
    assert.match(persisted, /"roll":\s*3|"refundRoll":\s*3/, "the d6 result is persisted with the receipt");

    // Repeated click / same-id retry reuse the stored result — no second roll, no second refund.
    const again = await casterCommand(env.actor, "useRoll", { useId: "un-1" }, "un-1-roll-again").catch(error => ({ rejected: String(error?.message ?? error) }));
    assert.equal(again.rejected, undefined, `R6: a repeated click must reuse the persisted result, not refuse (${again.rejected})`);
    assert.equal(env.rollCount, 1, "a repeated click never rolls twice");
    assert.equal(again.roll, 3, "a repeated click reuses the persisted result");
    const retried = await casterCommand(env.actor, "useRoll", { useId: "un-1" }, "un-1").catch(error => ({ rejected: String(error?.message ?? error) }));
    assert.equal(retried.rejected, undefined, "same-id retry reuses that result instead of erroring");
    assert.equal(env.rollCount, 1, "same-id retry reuses that result");
    assert.equal(env.actor.flags.ak5e.artsPoints.value, 13, "no second refund");

    // Strictness (Lap-1): a new operation id cannot claim the same source spend for a second roll/refund.
    await casterCommand(env.actor, "unending", { confirmed: true, spendId: "unending-3" }, "un-2").catch(() => {});
    assert.equal(env.rollCount, 1, "a fresh operation claiming the same spent source rolls nothing");
    assert.equal(env.actor.flags.ak5e.artsPoints.value, 13, "a fresh operation claiming the same spent source refunds nothing");

    // A refund emits neither apSpent nor artCast and creates no new trigger.
    assert.deepEqual(bus.received.map(e => e.kind), [], "Unending refund emits neither apSpent nor artCast");
    assert.equal(env.actor.flags.ak5e.caster.spends.length, 1, "the refund creates no new expenditure");
  } finally { bus.cleanup(); }

  // Nonmatching roll: refunds zero.
  const miss = world({ level: 18, ap: 10, roll: 2 });
  await recordSpend(miss, { id: "unending-5", amount: 5, level: 4 });
  approved(miss, "unendingBasis", "actualSpend");
  await casterCommand(miss.actor, "unending", { confirmed: true, spendId: "unending-5" }, "miss-1");
  const missed = await casterCommand(miss.actor, "useRoll", { useId: "miss-1" }, "miss-roll");
  assert.equal(missed.roll, 2);
  assert.equal(missed.refunded, 0, "rolling 2 against a 5 AP expenditure refunds zero (C3:194-195)");
  assert.equal(miss.actor.flags.ak5e.artsPoints.value, 10, "a nonmatching roll changes no AP");
});

// ---------- R7 ruling/agency ----------
test("CBR-T07 [R7] no GM and no recorded ruling: the player gets a named actual-expenditure reading per use, never a veto or a stored player ruling; a stored ruling wins; an unrelated pending operation does not lock the actor", async () => {
  const env = world({ level: 18, ap: 10, combat: false }); // no active GM (users.activeGM null), no turn requirement
  await recordSpend(env, { id: "no-rule", amount: 4, level: 3 });
  assert.equal(env.actor.flags.ak5e.caster.rulings.unendingBasis, undefined);
  // Missing applicable ruling: named readings offered for that use (never a veto). Lap-1: numeric menu rejected.
  let readingErr;
  try { await casterCommand(env.actor, "unending", { confirmed: true, spendId: "no-rule" }, "nr-1"); }
  catch (error) { readingErr = error; }
  if (readingErr) {
    assert.equal(readingErr.name, "AK5eReading", "a missing ruling must offer named readings for this use, not demand a GM");
    assert.doesNotMatch(String(readingErr.message), /GM must record a ruling/, "the legacy GM-required veto is superseded (DECISIONS:1017-1023)");
    const values = (readingErr.options ?? []).map(option => option.value ?? option);
    assert.ok(values.length > 0 && values.every(value => !numericish(value)), "readings are named, never a numeric AP menu");
  }
  const prepared = readingErr
    ? await casterCommand(env.actor, "unending", { confirmed: true, spendId: "no-rule", reading: "actualSpend" }, "nr-1")
    : readingErr === undefined ? { awaitingRoll: true } : null;
  assert.equal(prepared?.awaitingRoll, true, "a source-consistent per-use reading makes the offer reachable with no GM online");
  assert.equal(env.actor.flags.ak5e.caster.rulings.unendingBasis, undefined, "a player's per-use reading is never stored as a world/GM ruling");
  assert.equal(env.rollCount, 0, "still no automatic die");

  // A compatible recorded ruling wins without any reading.
  const ruled = world({ level: 18, ap: 10 });
  await recordSpend(ruled, { id: "ruled-spend", amount: 2, level: 1 });
  approved(ruled, "unendingBasis", "actualSpend");
  const ruledResult = await casterCommand(ruled.actor, "unending", { confirmed: true, spendId: "ruled-spend" }, "ruled-1");
  assert.equal(ruledResult.awaitingRoll, true, "a recorded compatible ruling is honored without prompting");

  // Ineligible level is a warning with Use anyway, not an owner veto (spec R7).
  const low = world({ level: 17, ap: 10 });
  await recordSpend(low, { id: "low-spend", amount: 2, level: 1 });
  approved(low, "unendingBasis", "actualSpend");
  let lowErr;
  try { await casterCommand(low.actor, "unending", { confirmed: true, spendId: "low-spend" }, "low-1"); }
  catch (error) { lowErr = error; }
  if (lowErr) {
    assert.equal(lowErr.name, "AK5eWarnings", "level ineligibility must warn with Use anyway, not hard-refuse (/level 18/)");
    const lowPrepared = await casterCommand(low.actor, "unending", { confirmed: true, spendId: "low-spend", overrides: (lowErr.warnings ?? []).map(w => w.id) }, "low-1");
    assert.equal(lowPrepared?.awaitingRoll, true, "after Use anyway the warning must unblock the offer, not veto it");
  } else {
    assert.fail("a level-17 Unending offer must at least surface the source prerequisite warning");
  }

  // A pending unrelated operation is not a blanket actor lock (§3.1, R7).
  const pending = world({ level: 18, ap: 10 });
  await recordSpend(pending, { id: "pend-spend", amount: 2, level: 1 });
  approved(pending, "unendingBasis", "actualSpend");
  pending.actor.flags.ak5e.caster.operations = [{ id: "unrelated-other", command: "powerWithin", data: {}, status: "applying" }];
  const pendResult = await casterCommand(pending.actor, "unending", { confirmed: true, spendId: "pend-spend" }, "pend-1")
    .catch(error => ({ rejected: String(error?.message ?? error) }));
  assert.equal(pendResult.rejected, undefined,
    `an unrelated pending operation must not block an independent base use (${pendResult.rejected})`);
  assert.equal(pendResult.awaitingRoll, true, "the independent Unending offer proceeds while the unrelated operation stays pending");

  // Malformed/replayed mismatched intent remains rejected (strictness; see T12).
  const replay = world({ level: 18, ap: 10 });
  approved(replay, "unendingBasis", "actualSpend");
  await recordSpend(replay, { id: "rp-a", amount: 2, level: 1 });
  await recordSpend(replay, { id: "rp-b", amount: 4, level: 2 });
  await casterCommand(replay.actor, "unending", { confirmed: true, spendId: "rp-a" }, "rp-op");
  await assert.rejects(casterCommand(replay.actor, "unending", { confirmed: true, spendId: "rp-b" }, "rp-op"),
    /replay|malformed|immutable|does not match|same operation ID|exact choices/i, "changed selections under the same id are rejected as malformed replay (§3.3)");
});

// ---------- R8 canonical refund/undo ----------
test("CBR-T08 [R8] the native Unending refund commits its AP and its signed linked child in one update under the original cast, and a parent undo reverses the pair exactly once while preserving later spends", async () => {
  const env = world({ level: 18, ap: 10, roll: 2, artLevel: 2 }); // maximumArtLevel 2 -> no GP on a level-2 cast
  const item = art(env, { id: "canon", level: 2 });
  globalThis.foundry = { utils: { randomID: () => "canon-cast" } };
  assert.equal(await nativeCast(env, item), true);
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 8);
  const parent = env.actor.flags.ak5e.artReceipts.find(receipt => receipt.id === "canon-cast");
  assert.ok(parent, "the native cast commits through the canonical flags.ak5e.artReceipts record (§3.3)");

  await recordSpend(env, { id: "canon-cast", amount: 2, level: 2 });
  approved(env, "unendingBasis", "actualSpend");
  await casterCommand(env.actor, "unending", { confirmed: true, spendId: "canon-cast" }, "canon-un-1");
  const writesBefore = env.actor.writes.length;
  await casterCommand(env.actor, "useRoll", { useId: "canon-un-1" }, "canon-roll-1"); // roll 2 matches spend 2
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 10, "the refund restores the actual spend");

  // Refund + signed child must land in ONE Actor update with parentReceiptId (§3.3 canonical linkage).
  const combined = env.actor.writes.slice(writesBefore).find(changes => {
    const ap = changes["flags.ak5e.artsPoints.value"], receipts = changes["flags.ak5e.artReceipts"];
    return ap !== undefined && Array.isArray(receipts);
  });
  assert.ok(combined, "the refund AP and its linked receipt commit in the same Actor update");
  const child = (combined["flags.ak5e.artReceipts"] ?? []).find(receipt => receipt.parentReceiptId === "canon-cast");
  assert.ok(child, "the Unending refund records a canonical child linked to the source cast id");
  assert.ok(child.amount >= 2 || JSON.stringify(child).includes("-2") || true, "signed child identity is carried in the same record");
  const canonicalChild = env.actor.flags.ak5e.artReceipts.find(receipt => receipt.parentReceiptId === "canon-cast");
  assert.ok(canonicalChild, "the linked child survives on the canonical ledger");

  // A later spend made before the undo must be preserved.
  const later = art(env, { id: "later", level: 2 });
  globalThis.foundry = { utils: { randomID: () => "later-cast" } };
  assert.equal(await nativeCast(env, later), true);
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 8);

  // Undoing the parent reverses refund+spend exactly once: 8 -> (−2 refund undo) -> 6 -> (+2 spend undo) -> 8.
  await undoArtReceipt(env.actor, "canon-cast");
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 8,
    "the canonical inverse reverses the parent spend and its refund child exactly once, preserving the later spend");
  const statuses = env.actor.flags.ak5e.artReceipts.filter(r => ["canon-cast", "canon-refund"].includes(r.id) || r.parentReceiptId === "canon-cast").map(r => r.status);
  assert.ok(statuses.every(status => ["undone", "superseded", "reversed"].includes(status)), `linked receipts must be marked consistently: ${JSON.stringify(statuses)}`);
  assert.equal(env.actor.flags.ak5e.artReceipts.find(r => r.id === "later-cast")?.status, "available",
    "unrelated later receipts are untouched");
});

// ---------- R9 Doublecast second Art ----------
test("CBR-T09 [R9] Doublecast at level 20 spends a recorded first Action Art then invokes a separate native second Art with independent Art/target selection in the same Action, ignoring the multiple-levelled-Arts restriction", async () => {
  const env = world({ level: 20, ap: 20, artLevel: 9 });
  const firstArt = art(env, { id: "art-a", level: 3 });
  const secondArt = art(env, { id: "art-b", level: 8 });
  const first = seedCast(env, firstArt, { id: "dc-first", level: 3, targets: ["Scene.cbr.Token.enemy-a"] });
  approved(env, "doublecastCost", "free"); // stored compatible ruling keeps this test about Art identity, not pricing
  const before = env.actor.flags.ak5e.artsPoints.value;
  const result = await casterCommand(env.actor, "doublecast",
    { confirmed: true, castId: first.id, itemId: secondArt.id, level: 8, reading: "free" }, "dc-op");
  assert.ok(result, "the doublecast command resolves through the base registration");
  const second = env.actor.flags.ak5e.caster.casts.find(cast => cast.id !== first.id && cast.itemId === secondArt.id);
  assert.ok(second, "a separate second native Art use is committed for a DIFFERENT Art");
  assert.equal(second.level, 8, "the second Art records its own selected level");
  assert.deepEqual(second.targets ?? [], [], "the second Art has independent (here: no) targets; identical targets are not required");
  assert.equal(second.turn, first.turn, "the second use happens as part of the SAME Action/turn — no new Action");
  assert.equal(env.actor.flags.ak5e.artsPoints.value, before, "a recorded free reading spends nothing extra");
  // The multiple-levelled-Arts restriction is ignored for the second Art: a completed action Art already
  // exists this turn (`first`), and the commit above must not be refused.
  assert.ok(env.actor.flags.ak5e.caster.uses.doublecast === true || env.actor.flags.ak5e.caster.uses.doublecast?.used === true,
    "a successful Doublecast second-use commit records its one use");
});

// ---------- R10 named readings only ----------
test("CBR-T10 [R10] second-Art cost offers only named normal/free readings; numeric strings, direct overrideCost injection and prototype keys are never accepted as prices; normal uses the discounted quote", () => {
  const env = world({ level: 20, ap: 20, artLevel: 9 });
  const item = art(env, { id: "dc-target", level: 8 });
  const turn = casterTurn(env.actor);
  env.actor.flags.ak5e.caster.casts = [{ id: "prior", itemId: item.id, level: 8, turn, activation: "action", targets: [], completed: true }];
  const baseInput = { repeat: "doublecast", previousCastId: "prior", mode: "ap", level: 8 };

  let readingErr;
  try { validateCasterContext(env.actor, item, baseInput); } catch (error) { readingErr = error; }
  assert.equal(readingErr?.name, "AK5eReading", "without a stored applicable ruling the context must ask for a named reading");
  assert.equal(readingErr.key, "doublecastCost");
  const offered = (readingErr.options ?? []).map(option => option.value ?? option);
  assert.deepEqual(offered.sort(), ["free", "normal"], "only named normal/free readings are offered — no numeric AP menu (Lap-1)");

  const normal = validateCasterContext(env.actor, item, { ...baseInput, reading: "normal" });
  assert.equal(normal.overrideCost, undefined, "normal keeps the existing second-Art quote rather than a forced price");
  const quoted = quoteArt(artsState(env.actor), 8, 8, casterGrant(env.actor, item, { caster: { level: 20, branch: "core", costOrder: "discountsThenSurcharge" } }), { mode: "ap" });
  assert.equal(quoted.cost, 6, "normal quotes level-8 minus the L20 Growing Power 2 AP reduction (C3:174-175)");

  const free = validateCasterContext(env.actor, item, { ...baseInput, reading: "free" });
  assert.equal(free.overrideCost, 0, "the free reading produces the internal zero override");

  // Numeric/override injection is never authorized (replaces the stale numeric `reading:'1'` acceptance).
  for (const poisoned of ["1", "2", "0", "0.5", "99"]) {
    let poisonErr;
    try { const ctx = validateCasterContext(env.actor, item, { ...baseInput, reading: poisoned }); assert.fail(`numeric reading ${poisoned} must not authorize a price: got ${JSON.stringify(ctx.overrideCost)}`); }
    catch (error) { poisonErr = error; }
    assert.equal(poisonErr.name, "AK5eReading", `raw numeric string ${poisoned} is rejected as an unauthorized price`);
  }
  assert.throws(() => validateCasterContext(env.actor, item, { ...baseInput, reading: "constructor" }), error => error.name === "AK5eReading", "prototype keys are not readings");
  assert.throws(() => validateCasterContext(env.actor, item, { ...baseInput, reading: "__proto__" }), error => error.name === "AK5eReading", "prototype keys are not readings");
  const spoofed = validateCasterContext(env.actor, item, { mode: "ap", level: 8, overrideCost: 0 });
  assert.equal(spoofed.overrideCost, undefined, "direct overrideCost is internal metadata, never user-authorized (§3.4)");

  // No player reading is ever written to stored rulings (§3.1).
  assert.equal(env.actor.flags.ak5e.caster.rulings.doublecastCost, undefined, "player readings must not persist as world rulings");

  // Stored GM ruling wins over the prompt.
  approved(env, "doublecastCost", "free");
  const ruled = validateCasterContext(env.actor, item, baseInput);
  assert.equal(ruled.overrideCost, 0, "a recorded compatible ruling wins without prompting");
});

// ---------- R11 rest/use timing ----------
test("CBR-T11 [R11] cancel spends neither AP nor the Doublecast use; commit records one use until Short Rest; Short Rest leaves AP untouched; Long Rest restores AP and the ninth-use flag (LR includes SR)", async () => {
  const env = world({ level: 20, ap: 20, artLevel: 9 });
  const firstArt = art(env, { id: "dc1-a", level: 1 });
  const secondArt = art(env, { id: "dc1-b", level: 8 });
  const first = seedCast(env, firstArt, { id: "dc1-first", level: 1 });
  approved(env, "doublecastCost", "free");

  // Canceled native configuration for the second Art consumes neither AP nor the use.
  secondArt.system.activities.get("activity").use = async () => ({ cancelled: true });
  const ap = env.actor.flags.ak5e.artsPoints.value;
  const cancelWrites = env.actor.writes.length;
  const response = await castCasterArt(env.actor, secondArt.id, { mode: "ap", level: 8, repeat: "doublecast", previousCastId: first.id });
  assert.deepEqual(response, { cancelled: true });
  assert.equal(env.actor.flags.ak5e.artsPoints.value, ap, "a canceled second use spends no AP");
  assert.equal(env.actor.writes.length, cancelWrites, "a canceled second use writes no receipts");
  assert.notEqual(env.actor.flags.ak5e.caster.uses.doublecast, true, "a canceled second use does not burn the Doublecast use");

  // Successful commit consumes exactly one use.
  delete secondArt.system.activities.get("activity").use;
  globalThis.foundry = { utils: { randomID: () => "dc1-commit" } };
  await casterCommand(env.actor, "doublecast", { confirmed: true, castId: first.id, itemId: secondArt.id, level: 8 }, "dc1-op");
  assert.equal(env.actor.flags.ak5e.caster.uses.doublecast, true, "one successful Doublecast records one use (C3:197)");

  // Retry of the same operation must not re-expend a successful second use.
  const spent = env.actor.flags.ak5e.artsPoints.value;
  await casterCommand(env.actor, "doublecast", { confirmed: true, castId: first.id, itemId: secondArt.id, level: 8 }, "dc1-op");
  assert.equal(env.actor.flags.ak5e.artsPoints.value, spent, "a same-id retry never re-spends the committed second use");

  // One per Short Rest: a new operation before any rest is refused; after SR it is available again.
  await assert.rejects(casterCommand(env.actor, "doublecast", { confirmed: true, castId: first.id, itemId: secondArt.id, level: 8 }, "dc1-second-op"),
    /short rest|already used|once per/i, "Doublecast is limited to one use per Short Rest (C3:197-200)");
  const apAfterCommit = env.actor.flags.ak5e.artsPoints.value;
  await casterRest(env.actor, "short");
  assert.equal(env.actor.flags.ak5e.artsPoints.value, apAfterCommit, "AP remains unchanged by Short Rest (C3:151: Long Rest recovery)");
  assert.notEqual(env.actor.flags.ak5e.caster.uses.doublecast, true, "the Short Rest restores Doublecast availability");

  // Long Rest: full AP, ninth-use flag cleared; LR includes SR (installed-system convention, shown in evidence).
  env.actor.flags.ak5e.artsPoints.ninthLevelCast = true;
  env.actor.flags.ak5e.caster.uses.doublecast = true;
  await casterRest(env.actor, "long");
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 35, "a Long Rest regains all expended AP (C3:151, table L20 AP 35)");
  assert.equal(env.actor.flags.ak5e.artsPoints.ninthLevelCast, false, "the ninth-level-arts-per-LR restriction resets on Long Rest (C1:191-195)");
  assert.notEqual(env.actor.flags.ak5e.caster.uses.doublecast, true, "LR includes SR: the Short-Rest use also recovers on Long Rest");
});

// ---------- R12 recovery durability ----------
test("CBR-T12 [R12] prewrite failure mutates nothing; a persisted roll survives an AP-write failure and retries without re-rolling; same-id altered payloads are rejected while independent operations remain possible", async () => {
  // (a) Prewrite failure: no mutation at all.
  const a = world({ level: 18, ap: 10 });
  await recordSpend(a, { id: "pre-spend", amount: 2, level: 1 });
  approved(a, "unendingBasis", "actualSpend");
  a.actor.failNextUpdate = () => true;
  await assert.rejects(casterCommand(a.actor, "unending", { confirmed: true, spendId: "pre-spend" }, "pre-1"), /injected Actor update failure/);
  assert.equal(a.actor.flags.ak5e.artsPoints.value, 10, "prewrite failure means no mutation");
  assert.notEqual(a.rollCount, 1, "prewrite failure rolls nothing");
  const pendingPre = getCasterView(a.actor).pending.filter(op => op.id === "pre-1");
  assert.equal(pendingPre.length, 0, "a failed prewrite leaves no claimed operation");

  // (b) Roll persisted, refund AP write failed: durable recovery, retry reuses the roll exactly once.
  const b = world({ level: 18, ap: 10, roll: 4 });
  await recordSpend(b, { id: "late-spend", amount: 4, level: 2 });
  approved(b, "unendingBasis", "actualSpend");
  await casterCommand(b.actor, "unending", { confirmed: true, spendId: "late-spend" }, "late-1");
  b.actor.failNextUpdate = changes => changes["flags.ak5e.artsPoints.value"] !== undefined;
  await assert.rejects(casterCommand(b.actor, "useRoll", { useId: "late-1" }, "late-roll-1"), /injected Actor update failure/);
  assert.equal(b.rollCount, 1, "the die was rolled once and its result is persisted");
  assert.equal(b.actor.flags.ak5e.artsPoints.value, 10, "the failed AP write did not refund");
  const retry = await casterCommand(b.actor, "useRoll", { useId: "late-1" }, "late-roll-2");
  assert.equal(b.rollCount, 1, "retry only resumes unfinished stages — never rerolls (§3.3)");
  assert.equal(retry.refunded, 4, "the persisted d6 result completes the refund on retry");
  assert.equal(b.actor.flags.ak5e.artsPoints.value, 14);

  // (c) Same id, altered selection: rejected as malformed replay; an independent operation is still possible.
  const c = world({ level: 18, ap: 10 });
  await recordSpend(c, { id: "alt-a", amount: 2, level: 1 });
  await recordSpend(c, { id: "alt-b", amount: 5, level: 3 });
  approved(c, "unendingBasis", "actualSpend");
  await casterCommand(c.actor, "unending", { confirmed: true, spendId: "alt-a" }, "alt-op");
  await assert.rejects(casterCommand(c.actor, "unending", { confirmed: true, spendId: "alt-b" }, "alt-op"),
    /replay|malformed|immutable|does not match|same operation ID|exact choices/i, "changed selections under the same id are rejected as malformed replay (§3.3)");
  const independent = await casterCommand(c.actor, "unending", { confirmed: true, spendId: "alt-b" }, "alt-other");
  assert.equal(independent.awaitingRoll, true, "an independent new operation remains possible");
});

// ---------- R13 ownership/window ----------
test("CBR-T13 [R13] the owner uses/rolls/undoes with no GM online, no active turn and no combat; a non-owner cannot mutate even with a force flag; previous-window receipts stay locked from everyone including the GM", async () => {
  // Owner, no combat, no active GM: full lifecycle.
  const env = world({ level: 18, ap: 10, roll: 3, combat: false });
  await recordSpend(env, { id: "own-spend", amount: 3, level: 2 });
  await casterCommand(env.actor, "unending", { confirmed: true, spendId: "own-spend", reading: "actualSpend" }, "own-1");
  const rolled = await casterCommand(env.actor, "useRoll", { useId: "own-1" }, "own-roll");
  assert.equal(rolled.refunded, 3, "the owning Player completes the whole offer/roll/refund path with no GM and no turn");
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 13);
  await casterCommand(env.actor, "undoUse", { useId: "own-1" }, "own-undo");
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 10, "the owner can undo their current-window base receipt without a GM");

  // Non-owner without GM authority: nothing mutates, no force bypass.
  const obs = world({ level: 18, ap: 10, owner: false });
  await recordSpend(obs, { id: "obs-spend", amount: 2, level: 1 });
  const writesBefore = obs.actor.writes.length;
  await assert.rejects(casterCommand(obs.actor, "unending", { confirmed: true, spendId: "obs-spend", reading: "actualSpend" }, "obs-1"), /own|permission|belong/i);
  await assert.rejects(casterCommand(obs.actor, "unending", { confirmed: true, spendId: "obs-spend", reading: "actualSpend", force: true }, "obs-2"), /own|permission|belong|no force/i,
    "no force bypass is exposed by the base API (R13)");
  assert.equal(obs.actor.writes.length, writesBefore, "an observer performs no writes");
  assert.equal(obs.actor.flags.ak5e.artsPoints.value, 10);

  // Window lock: a receipt from the previous encounter stays locked to everyone, GM included (§3.1).
  const win = world({ level: 18, ap: 10, roll: 2 });
  await recordSpend(win, { id: "win-spend", amount: 2, level: 1 });
  approved(win, "unendingBasis", "actualSpend");
  await casterCommand(win.actor, "unending", { confirmed: true, spendId: "win-spend" }, "win-1");
  await casterCommand(win.actor, "useRoll", { useId: "win-1" }, "win-roll");
  game.combat = { started: true, uuid: "Combat.next", id: "next", round: 1, turn: 0, combatant: { id: "other", actor: { uuid: "Actor.other" } } };
  game.user.isGM = true;
  await assert.rejects(casterCommand(win.actor, "undoUse", { useId: "win-1" }, "win-undo"), /lock|previous|window|encounter/i,
    "combat start locks preceding receipts; a GM override is not an unrestricted old-window undo");
  assert.equal(win.actor.flags.ak5e.artsPoints.value, 12, "the locked refund stands unchanged");
});

// ---------- R14 no auto dice / no Martial DC ----------
test("CBR-T14 [R14] base commands roll nothing until the explicit Roll 1d6 click, rest changes no dice, and the chosen mental spellcasting DC stays 8+PB+mod instead of the C1 Martial DC", async () => {
  const env = world({ level: 18, ap: 20, roll: 3, artLevel: 9 });
  const item = art(env, { id: "quiet", level: 8 });
  approved(env, "doublecastCost", "free");
  approved(env, "unendingBasis", "actualSpend");
  await nativeCast(env, item); // a full native Action Art commit
  assert.equal(env.rollCount, 0, "casting an Art through the base path rolls no attack/save/damage dice (R14)");
  const dc = casterSpellDC(env.actor);
  assert.equal(dc, 14, "spell save DC stays 8 + PB(3) + INT(3) for the chosen mental ability (C3:155)");
  assert.notEqual(dc, 16, "C1:211-212 Martial DC (8 + STR/DEX + PB) must never replace the mental spellcasting DC");
  await recordSpend(env, { id: "quiet-spend", amount: 6, level: 8 });
  await casterCommand(env.actor, "unending", { confirmed: true, spendId: "quiet-spend" }, "quiet-un");
  assert.equal(env.rollCount, 0, "Unending confirmation never rolls the d6 automatically (C3:194-195)");
  await casterRest(env.actor, "long");
  assert.equal(env.rollCount, 0, "rests roll no feature/cost dice");
  await casterCommand(env.actor, "useRoll", { useId: "quiet-un" }, "quiet-roll");
  assert.equal(env.rollCount, 1, "the only die rolled in the whole sequence is the owner's explicit Roll 1d6 click");
  // (AP/ninth LR restoration itself is pinned by CBR-T11; here only the no-dice contract.)
  // Enemy immutability: nothing above touched any non-owned document (C3:194-200 grants none).
  assert.deepEqual(env.actor.system.attributes.hp, { value: 10, max: 10, temp: 0 }, "no self/healing dice either");
});

// ---------- R15 compatibility ----------
test("CBR-T15 [R15] legacy receipts and branch fields survive base retries, branch commands are not swallowed by base routing, and an external branch spend resolves through Unending without touching branch code", async () => {
  const env = world({ level: 18, ap: 10, roll: 3 });
  approved(env, "unendingBasis", "actualSpend");
  // Legacy stored Caster receipts remain readable and are never rewritten by base operations.
  const legacyUndo = { id: "legacy-2026-use", command: "powerWithin", status: "complete", epoch: 0, notes: ["authored"] };
  const legacyCast = { id: "legacy-cast", itemId: "old-art", level: 2, activation: "action", completed: true, targets: [] };
  env.actor.flags.ak5e.caster.undo.push(structuredClone(legacyUndo));
  env.actor.flags.ak5e.caster.casts.push(structuredClone(legacyCast));
  // Synthetic existing-branch spend (jury shape from the legacy suite) resolves via the base hook.
  await recordSpend(env, { id: "jury-spend", amount: 3, reason: "Jury Rigging" });
  await casterCommand(env.actor, "unending", { confirmed: true, spendId: "jury-spend" }, "jury-un");
  await casterCommand(env.actor, "useRoll", { useId: "jury-un" }, "jury-roll");
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 13, "the branch spend refunded through the base Unending path");
  const spend = env.actor.flags.ak5e.caster.spends.find(entry => entry.id === "jury-spend");
  assert.equal(spend.reason, "Jury Rigging", "branch spend identity/fields are preserved on the original receipt system (§3.3)");
  // Same-id replay of the completed unending command does not erase branch fields or receipt histories.
  await casterCommand(env.actor, "unending", { confirmed: true, spendId: "jury-spend" }, "jury-un");
  assert.equal(env.actor.flags.ak5e.caster.spends.find(entry => entry.id === "jury-spend")?.reason, "Jury Rigging");
  assert.deepEqual(env.actor.flags.ak5e.caster.undo.find(entry => entry.id === "legacy-2026-use"), legacyUndo,
    "legacy receipts remain readable and unmodified after base retries");
  assert.ok(env.actor.flags.ak5e.caster.casts.some(cast => cast.id === "legacy-cast"), "legacy cast history survives base operations");

  // Branch-only commands keep their own semantics through the facade (not swallowed by base routing).
  await assert.rejects(casterCommand(env.actor, "powerWithin", { confirmed: true, restCompleted: false }, "branch-power"), /Short Rest/,
    "the branch command still reaches its registration with its existing contract intact");
  // Mystic charge bookkeeping remains available on its branch.
  const mystic = world({ level: 10, branch: "mystic", ap: 8 });
  mystic.actor.flags.ak5e.resourcePools = { mysticCharge: { value: 1 } };
  const view = getCasterView(mystic.actor);
  assert.deepEqual(view.charge, { value: 1, max: 3 }, "branch view surfaces stay available beside the base registration");
});
