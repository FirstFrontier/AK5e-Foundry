/**
 * CR2 — caster-r2-seam POST-CANDIDATE attack pass (adversary).
 *
 * Attacks the frozen candidate seam: forged/raw limitOverride shapes, prototype/inherited permission
 * keys, cross-actor/item/session replay, unconfirmed-limit native commit attempts, price/ruling
 * smuggling via override, Cancel-path writes, double-debit/double-receipt, undo boundary violations,
 * and catalogue widening. Independent of the frozen file; same harness conventions.
 *
 * Findings are encoded as spec-invariant assertions (parent adjudicates severity); everything else
 * is written to pin the gateway hard.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ArtsRuleError, artLimitOverride, quoteArt, ART_LIMIT_OVERRIDE_MESSAGE } from "../scripts/arts-rules.mjs";
import { artAvailability, consumeArt, prepareArtUse, registerArtQuoteOptions, undoArtReceipt, wrapActivityUse } from "../scripts/arts-casting.mjs";
import { castCasterArt } from "../scripts/caster-casting.mjs";
import { isPlayWarnings } from "../scripts/play-undo.mjs";

const CAP_TEXT = level => `This casting exceeds maximum Art level ${level}.`;
const NINTH_TEXT = "A 9th-level Art has already been cast since the last Long Rest.";
const pureState = (points = {}) => ({ enabled: true, value: 12, maximum: 12, maximumArtLevel: 9, ninthLevelCast: false, ...points });

function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = structuredClone(value);
}

let harnessCount = 0;
let globalRolls = 0;
function harness() {
  const previous = { game: globalThis.game, ui: globalThis.ui, foundry: globalThis.foundry,
    ChatMessage: globalThis.ChatMessage, Hooks: globalThis.Hooks, Roll: globalThis.Roll, fromUuidSync: globalThis.fromUuidSync };
  const state = { chat: [], warns: [], errors: [], settingsWrites: 0, castSeq: 0 };
  globalThis.game = { user: { id: `atk-${++harnessCount}`, isGM: false, targets: new Set() }, combat: null,
    settings: { get: () => false, set: async () => { state.settingsWrites++; } },
    i18n: { localize: key => key, format: key => key } };
  globalThis.ui = { notifications: {
    warn: m => state.warns.push(String(m)), error: m => state.errors.push(String(m)), info: () => {} } };
  globalThis.foundry = { utils: {
    randomID: () => `atk-cast-${harnessCount}-${++state.castSeq}`,
    mergeObject: (a = {}, b = {}) => { const out = structuredClone(a); for (const [k, v] of Object.entries(b)) if (v !== undefined) out[k] = structuredClone(v); return out; },
    duplicate: v => structuredClone(v), flattenObject: o => o } };
  globalThis.ChatMessage = { implementation: {
    create: async data => { state.chat.push(structuredClone(data)); return { id: `m${state.chat.length}`, ...data }; },
    getSpeaker: ({ actor }) => ({ actor: actor?.id ?? "" }) } };
  globalThis.Hooks = { on() {}, off() {}, call() {}, trigger() {} };
  globalThis.Roll = class { constructor() { globalRolls++; } };
  globalThis.fromUuidSync = () => null;
  return { state, restore() { for (const [key, value] of Object.entries(previous)) globalThis[key] = value; } };
}

function casterActor({ id, level = 3, ap = 2, cap = 2, ninth = false } = {}) {
  const actor = { id, uuid: `Actor.${id}`, documentName: "Actor", type: "character", isOwner: true,
    flags: { ak5e: {
      casting: { enabled: true, ability: "int", castingUnit: "wand", recovery: "long" },
      artsPoints: { maximum: Math.max(ap, 20), value: ap, maximumArtLevel: cap, ninthLevelCast: ninth },
      caster: { enabled: true, version: 1, choices: {}, pools: ["standard-art-pool-corrosion-arts-407"],
        operations: [], casts: [], spends: [], rulings: {}, uses: {}, turn: {}, drones: [] } } },
    system: { attributes: { spellcasting: "int", prof: 2, hp: { value: 10, max: 10 } }, abilities: { int: { value: 16, mod: 3 } } },
    items: new Map(), writes: [],
    getFlag(s, k) { return this.flags?.[s]?.[k]; },
    async update(changes) { this.writes.push(structuredClone(changes)); for (const [p, v] of Object.entries(changes)) setPath(this, p, v); } };
  actor.items.set(`${id}-cls`, { id: `${id}-cls`, type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: "class-caster" } }, getFlag(s, k) { return this.flags?.[s]?.[k]; } });
  actor.items.set(`${id}-br`, { id: `${id}-br`, type: "subclass",
    flags: { ak5e: { chapterThreeId: "subclass-caster-core" } }, getFlag(s, k) { return this.flags?.[s]?.[k]; } });
  return actor;
}

function plainActor({ id, ap = 12, cap = 2 } = {}) {
  const actor = { id, uuid: `Actor.${id}`, documentName: "Actor", type: "character", isOwner: true,
    flags: { ak5e: { casting: { enabled: true, ability: "int" },
      artsPoints: { maximum: 12, value: ap, maximumArtLevel: cap, ninthLevelCast: false } } },
    system: { attributes: { spellcasting: "int", prof: 2 } }, items: new Map(), writes: [],
    getFlag(s, k) { return this.flags?.[s]?.[k]; },
    async update(changes) { this.writes.push(structuredClone(changes)); for (const [p, v] of Object.entries(changes)) setPath(this, p, v); } };
  return actor;
}

class PlainDialog { static PARTS = {}; }

class SeamActivity {
  static metadata = { usage: { actions: {} } };
  constructor(actor, item) {
    this.actor = actor; this.item = item; this.id = "cast"; this.activation = { type: "action" };
    this.hook = null; this.appliedCount = 0; this.doubleProbe = false; this.failAfterApply = false;
    this.secondConsume = undefined;
  }
  async use(usage, dialog, message) {
    usage = usage ?? {}; dialog = dialog ?? {}; message = message ?? { data: {} };
    dialog.applicationClass ??= PlainDialog;
    this.lastUsage = usage;
    if (prepareArtUse(this, usage, dialog, message) === false) return null;
    if (usage.cancel) return null;
    if (this.hook) this.hook(this, usage, message);
    if (usage.cancel) return null;
    const updates = { actor: {} };
    const receipt = consumeArt(this, usage, message, updates);
    if (receipt === false) { this.consumeRefused = true; this.lastUpdates = updates; return null; }
    this.updates = updates;
    if (this.doubleProbe) this.secondConsume = consumeArt(this, usage, message, { actor: {} });
    await this.actor.update(updates.actor);
    this.appliedCount++;
    if (this.failAfterApply) { this.failAfterApply = false; throw new Error("postcommit chat injection failed"); }
    return message.data.flags.ak5e.artCast;
  }
}
wrapActivityUse(SeamActivity.prototype);

function casterArt(actor, { id, level = 3, name = "Attack Art" } = {}) {
  const item = { id, name, type: "spell", actor, parent: actor, itemWrites: 0,
    system: { level, method: "ak5e", activities: new Map() },
    flags: { ak5e: { art: { enabled: true, noCastingUnit: true } } },
    getFlag(s, k) { return this.flags?.[s]?.[k]; },
    async update(c) { this.itemWrites++; setPath(this, "flags.ak5e.changes", c); } };
  const activity = new SeamActivity(actor, item);
  item.system.activities.set("cast", activity);
  actor.items.set(id, item);
  return { item, activity };
}

async function castLoop(actor, itemId, options = {}, maxRetries = 4) {
  const overrides = [...(options.overrides ?? [])];
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await castCasterArt(actor, itemId, { ...options, overrides: [...overrides] });
      return { ok: true, result, overrides: [...overrides] };
    } catch (error) {
      if (isPlayWarnings(error)) {
        const before = overrides.length;
        for (const w of error.warnings) if (!overrides.includes(w.id)) overrides.push(w.id);
        if (overrides.length === before) return { ok: false, error, overrides: [...overrides] };
        continue;
      }
      return { ok: false, error, overrides: [...overrides] };
    }
  }
  return { ok: false, error: new Error("retry budget") };
}

// ---------------------------------------------------------------------------------------------
// ATKR2-01/02 — internal override-shape attacks (pure artLimitOverride / quoteArt boundary)
// ---------------------------------------------------------------------------------------------

test("ATKR2-01 artLimitOverride: only exact own-data shapes pass; everything else is TypeError or null, never approval", () => {
  const valid = { level: 3, mode: "ap", keys: ["LevelCap"] };
  assert.ok(artLimitOverride({ limitOverride: valid }, 3, "ap")?.has?.("LevelCap"), "matching shape returns the key set");
  assert.equal(artLimitOverride({ limitOverride: { level: 4, mode: "ap", keys: ["LevelCap"] } }, 3, "ap"), null, "nonmatching level → null scope");
  assert.equal(artLimitOverride({ limitOverride: { level: 3, mode: "free", keys: ["LevelCap"] } }, 3, "ap"), null, "nonmatching mode → null scope");
  const nullProto = Object.assign(Object.create(null), { level: 3, mode: "ap", keys: ["LevelCap", "NinthUsed"] });
  assert.equal([...artLimitOverride({ limitOverride: nullProto }, 3, "ap")].sort().join(), "LevelCap,NinthUsed");
  const bad = [
    ["absent-limitOverride-is-null-not-throw", undefined],
    ["explicit null", null], ["true", true], ["string", "ap"], ["number", 3],
    ["array", [3, "ap", ["LevelCap"]]], ["Map", new Map([["level", 3]])], ["Set", new Set(["LevelCap"])],
    ["function", () => ({ level: 3 })],
    ["empty object", {}],
    ["extra field", { level: 3, mode: "ap", keys: ["LevelCap"], cost: 0 }],
    ["missing keys field", { level: 3, mode: "ap" }],
    ["keys not array", { level: 3, mode: "ap", keys: "LevelCap" }],
    ["keys empty", { level: 3, mode: "ap", keys: [] }],
    ["keys duplicate", { level: 3, mode: "ap", keys: ["LevelCap", "LevelCap"] }],
    ["keys unknown id", { level: 3, mode: "ap", keys: ["NinthUsed2"] }],
    ["keys error-shape confusion", { level: 3, mode: "ap", keys: ["maximumArtLevel"] }],
    ["keys object entry", { level: 3, mode: "ap", keys: [{ id: "LevelCap" }] }],
    ["keys null entry", { level: 3, mode: "ap", keys: [null] }],
    ["level 10 out of domain", { level: 10, mode: "ap", keys: ["LevelCap"] }],
    ["level -0.5", { level: -0.5, mode: "ap", keys: ["LevelCap"] }],
    ["level string", { level: "3", mode: "ap", keys: ["LevelCap"] }],
    ["level NaN", { level: NaN, mode: "ap", keys: ["LevelCap"] }],
    ["level Infinity", { level: Infinity, mode: "ap", keys: ["LevelCap"] }],
    ["level unsafe", { level: 2 ** 53, mode: "ap", keys: ["LevelCap"] }],
    ["mode unknown", { level: 3, mode: "slot", keys: ["LevelCap"] }],
    ["mode missing", { keys: ["LevelCap"], level: 3 }]
  ];
  for (const [label, limitOverride] of bad) {
    if (limitOverride === undefined) { assert.equal(artLimitOverride({}, 3, "ap"), null, label); continue; }
    assert.throws(() => artLimitOverride({ limitOverride }, 3, "ap"),
      error => error instanceof TypeError && error.message === ART_LIMIT_OVERRIDE_MESSAGE, `malformed (${label}) must be TypeError`);
  }
  // prototype-inherited shape: Object.create over a VALID object has no own keys → TypeError, never approval
  assert.throws(() => artLimitOverride({ limitOverride: Object.create(valid) }, 3, "ap"), TypeError);
  // inherited keys array element via prototype chain on the keys array
  const keysProto = Object.create(["LevelCap"]); keysProto.length = 1;
  assert.throws(() => artLimitOverride({ limitOverride: { level: 3, mode: "ap", keys: keysProto } }, 3, "ap"), TypeError);
  // symbol key smuggled alongside valid fields → ownKeys mismatch → TypeError
  const withSymbol = { level: 3, mode: "ap", keys: ["LevelCap"] }; Object.defineProperty(withSymbol, Symbol("cost"), { value: 0 });
  assert.throws(() => artLimitOverride({ limitOverride: withSymbol }, 3, "ap"), TypeError);
});

test("ATKR2-02 quote-level scope isolation: a level-3 override cannot authorize the catalogue loop's other levels", () => {
  const state = pureState({ maximumArtLevel: 2 });
  const override = { level: 3, mode: "ap", keys: ["LevelCap", "NinthUsed"] };
  assert.equal(quoteArt(state, 3, 3, {}, { mode: "ap", limitOverride: override }).limitWarnings?.length, 1, "its own level is suppressed");
  for (const level of [4, 5, 9]) {
    assert.throws(() => quoteArt(state, 3, level, {}, { mode: "ap", limitOverride: override }),
      error => error instanceof ArtsRuleError && error.key === "LevelCap", `level ${level} gets no bypass`);
  }
});

// ---------------------------------------------------------------------------------------------
// ATKR2-03/04 — provider/caller override smuggling and raw usage fields
// ---------------------------------------------------------------------------------------------

test("ATKR2-03 a registered quote provider cannot smuggle a limitOverride into any stage", async () => {
  const h = harness();
  let armed = false;
  registerArtQuoteOptions((actor, item, usage) => armed ? { limitOverride: { level: usage.ak5eLevel ?? 9, mode: usage.ak5eMode ?? "ap", keys: ["LevelCap", "NinthUsed"] } } : {});
  try {
    armed = true;
    const actor = casterActor({ id: "atk-03a", ap: 2, cap: 2 });
    const { item, activity } = casterArt(actor, { id: "art-03a", level: 3 });
    const error = await castCasterArt(actor, item.id, { level: 3, mode: "ap" }).catch(e => e);
    assert.equal(error?.name, "AK5eWarnings", "provider override is discarded: unconfirmed still routes through the warning gate");
    assert.equal(activity.appliedCount, 0);
    const cast = await castLoop(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(cast.ok, true, "confirmed route still works with the malicious provider registered");
    assert.equal(actor.flags.ak5e.artsPoints.value, 0, "single clamped debit");
  } finally { armed = false; h.restore(); }
});

test("ATKR2-04 raw usage.limitOverride / ak5eLimitOverride is never authority: every variant commits nothing", async () => {
  const h = harness();
  try {
    const scope = { level: 3, mode: "ap", keys: ["LevelCap", "NinthUsed"] };
    const actor = casterActor({ id: "atk-04", ap: 2, cap: 2 });
    const a1 = casterArt(actor, { id: "art-04a", level: 3 });
    const r1 = await a1.activity.use({ ak5eLevel: 3, ak5eMode: "ap", limitOverride: scope }).catch(e => e);
    assert.ok(!r1?.id, "direct native + raw override never yields a receipt");
    assert.equal(a1.activity.appliedCount, 0);
    assert.equal(actor.flags.ak5e.artsPoints.value, 2);
    const a2 = casterArt(actor, { id: "art-04b", level: 3 });
    const e2 = await a2.activity.use({ ak5eLevel: 3, ak5eMode: "ap", ak5eCaster: {}, ak5eLimitOverride: scope }).catch(e => e);
    assert.equal(e2?.name, "AK5eWarnings", "empty Caster context: forged override ignored, warning gate stands");
    assert.equal(a2.activity.appliedCount, 0);
    const plain = plainActor({ id: "atk-04p" });
    const pa = casterArt(plain, { id: "art-04p", level: 3 });
    const r3 = await pa.activity.use({ ak5eLevel: 3, ak5eMode: "ap", limitOverride: scope }).catch(e => e);
    assert.ok(!r3?.id, "raw override grants nothing on a non-Caster");
    assert.equal(pa.activity.appliedCount, 0);
    assert.equal(plain.flags.ak5e.artsPoints.value, 12);
    assert.equal(plain.getFlag("ak5e", "lastArtCast"), undefined, "no receipt");
  } finally { h.restore(); }
});

test("ATKR2-04b FINDING probe: unconfirmed direct-native over-cap use must refuse with the strict quote error, as before (spec \u00a73.3: strict quote behavior stays as before)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "atk-04b", ap: 2, cap: 2 });
    const { activity } = casterArt(actor, { id: "art-04b", level: 3 });
    const outcome = await activity.use({ ak5eLevel: 3, ak5eMode: "ap" }).then(value => ({ value }), reason => ({ reason }));
    assert.ok(outcome.reason && (outcome.reason.key === "LevelCap" || outcome.reason.name === "AK5eWarnings"),
      `direct native must keep a throwing strict refusal (main threw LevelCap here); got value=${String(outcome.value)}`);
    assert.equal(activity.appliedCount, 0, "zero-write either way");
    assert.equal(actor.flags.ak5e.artsPoints.value, 2);
  } finally { h.restore(); }
});

// ---------------------------------------------------------------------------------------------
// ATKR2-05/06 — catalogue widening via the display-review fallback (FINDING probe)
// ---------------------------------------------------------------------------------------------

test("ATKR2-05a display review bound to a foreign actor/item/base or malformed fields stays strict (no forged authority)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "atk-05a", ap: 20, cap: 2 });
    const { item } = casterArt(actor, { id: "art-05a", level: 3 });
    const warnings = [{ id: "maximumArtLevel", text: CAP_TEXT(2) }];
    const cases = [
      ["foreign actor", { actorUuid: "Actor.victim", itemId: "art-05a", baseLevel: 3, level: 3, mode: "ap", warnings }],
      ["foreign item", { actorUuid: actor.uuid, itemId: "other-item", baseLevel: 3, level: 3, mode: "ap", warnings }],
      ["base drift", { actorUuid: actor.uuid, itemId: "art-05a", baseLevel: 1, level: 3, mode: "ap", warnings }],
      ["unknown mode", { actorUuid: actor.uuid, itemId: "art-05a", baseLevel: 3, level: 3, mode: "slot", warnings }],
      ["warnings not array", { actorUuid: actor.uuid, itemId: "art-05a", baseLevel: 3, level: 3, mode: "ap", warnings: "maximumArtLevel" }],
      ["prototype-chain review", Object.create({ actorUuid: actor.uuid, itemId: "art-05a", baseLevel: 3, level: 3, mode: "ap", warnings })]
    ];
    for (const [label, review] of cases) {
      const avail = artAvailability(actor, item, { mode: "ap", level: 3, ak5eLimitReview: review });
      assert.equal(avail.castable, false, `${label}: bound mismatch must never present a castable over-cap tuple`);
      assert.equal(avail.error?.key, "LevelCap", `${label}: strict LevelCap presentation retained`);
    }
  } finally { h.restore(); }
});

test("ATKR2-05b FINDING: artAvailability with a forged but well-formed ak5eLimitReview must not present a castable over-cap tuple out of session (spec §3.3-5)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "atk-05b", ap: 20, cap: 2 });
    const { item } = casterArt(actor, { id: "art-05b", level: 3 });
    const forged = { actorUuid: actor.uuid, itemId: "art-05b", baseLevel: 3, level: 3, mode: "ap",
      warnings: [{ id: "maximumArtLevel", text: CAP_TEXT(2) }] };
    const avail = artAvailability(actor, item, { mode: "ap", level: 3, ak5eLimitReview: forged });
    assert.notEqual(avail.castable, true,
      "catalogue widening: out-of-session availability must remain strict; a display field is never session authority");
    assert.equal(avail.error?.key ?? avail.error, "LevelCap", "strict LevelCap presentation retained");
  } finally { h.restore(); }
});

test("ATKR2-06 FINDING probe: the session's leftover review field must not keep the catalogue widened after the session ends", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "atk-06", ap: 6, cap: 2 });
    const { item, activity } = casterArt(actor, { id: "art-06", level: 3 });
    let liveUsage = null;
    activity.hook = (a, usage) => { liveUsage = usage; };
    const cast = await castLoop(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(cast.ok, true, `baseline route, got ${cast.error?.key ?? cast.error?.name}`);
    assert.equal(liveUsage !== null, true, "seam attaches its display review to the live native usage");
    // Session is over (finally cleared). The same usage object must not keep an approved-looking catalogue.
    const after = artAvailability(actor, item, liveUsage);
    assert.notEqual(after.castable, true, "dead-session residue must not widen availability");
  } finally { h.restore(); }
});

// ---------------------------------------------------------------------------------------------
// ATKR2-07/08 — unconfirmed-limit commit attempts at the warning gate and context gate
// ---------------------------------------------------------------------------------------------

test("ATKR2-07 error-key/truthy 'overrides' confusions never confirm a warning", async () => {
  const h = harness();
  try {
    const forms = [
      ["error keys not warning ids", ["LevelCap", "NinthUsed"]],
      ["string overrides", "maximumArtLevel"],
      ["object overrides", { maximumArtLevel: true }],
      ["number overrides", 1],
      ["ids with null entry", [null, "maximumArtLevel"]],
      ["truthy object ids", [{ id: "maximumArtLevel" }]]
    ];
    for (const [label, overrides] of forms) {
      const actor = casterActor({ id: `atk-07-${label}`, ap: 2, cap: 2 });
      const { item, activity } = casterArt(actor, { id: "art-07", level: 3 });
      const error = await castCasterArt(actor, item.id, { level: 3, mode: "ap", overrides }).catch(e => e);
      assert.equal(error?.name, "AK5eWarnings", `${label}: must remain an open warning, got ${error?.key ?? error?.name ?? error}`);
      assert.equal(activity.appliedCount, 0, `${label}: zero-write`);
      assert.equal(actor.flags.ak5e.artsPoints.value, 2, `${label}: AP untouched`);
    }
  } finally { h.restore(); }
});

test("ATKR2-08 non-Caster Caster-context shapes: refused, zero-write", async () => {
  const h = harness();
  try {
    for (const supplied of [{}, null, [], "ctx", { overrides: ["maximumArtLevel"], confirmed: true }]) {
      const plain = plainActor({ id: "atk-08", ap: 12, cap: 2 });
      const { activity } = casterArt(plain, { id: `art-08-${JSON.stringify(supplied)}`, level: 3 });
      const outcome = await activity.use({ ak5eLevel: 3, ak5eMode: "ap", ak5eCaster: supplied }).then(r => r, e => e);
      const committed = activity.appliedCount > 0;
      assert.equal(committed, false, `non-Caster context ${JSON.stringify(supplied)} must never commit`);
      assert.equal(plain.flags.ak5e.artsPoints.value, 12, "AP untouched");
      void outcome;
    }
  } finally { h.restore(); }
});

// ---------------------------------------------------------------------------------------------
// ATKR2-09 — cross-actor/item/session replay against a LIVE approved session
// ---------------------------------------------------------------------------------------------

test("ATKR2-09 in-flight approval replay to another item, another actor, or a dead castId is refused without disturbing the real cast", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "atk-09", ap: 6, cap: 2 });
    const { item, activity } = casterArt(actor, { id: "art-09a", level: 3 });
    const other = casterArt(actor, { id: "art-09b", level: 3 });
    const victim = casterActor({ id: "atk-09v", ap: 20, cap: 2 });
    const victimArt = casterArt(victim, { id: "art-09v", level: 3 });
    const replay = [];
    activity.hook = (a, usage) => {
      const liveId = usage.ak5eCastId;
      // same actor, different item
      replay.push(["item", consumeArt(other.activity, { ...usage, ak5eLevel: 3, ak5eMode: "ap" }, { data: {} }, { actor: {} })]);
      // different actor, same-shaped context
      replay.push(["actor", consumeArt(victimArt.activity, { ...usage, ak5eLevel: 3, ak5eMode: "ap" }, { data: {} }, { actor: {} })]);
      // dead/forged castId
      replay.push(["dead", consumeArt(a, { ...usage, ak5eCastId: "forged-dead-id", ak5eLevel: 3, ak5eMode: "ap" }, { data: {} }, { actor: {} })]);
      // availability replay through the live id during the session (display is allowed) — must not touch the victim
      artAvailability(victim, victimArt.item, { ...usage, ak5eLevel: 3 });
    };
    const cast = await castLoop(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(cast.ok, true, `legit cast must still complete exactly once, got ${cast.error?.key ?? cast.error?.name}`);
    assert.deepEqual(replay.map(r => r[1]), [false, false, false], "every replay consume proposed nothing");
    assert.equal(activity.appliedCount, 1, "the real session committed once");
    assert.equal(actor.flags.ak5e.artsPoints.value, 3, "single 3 AP debit only");
    assert.equal(other.activity.appliedCount, 0);
    assert.equal(victimArt.activity.appliedCount, 0);
    assert.equal(victim.flags.ak5e.artsPoints.value, 20, "victim AP untouched");
    assert.equal(victim.getFlag("ak5e", "lastArtCast"), undefined, "victim got no receipt");
    assert.equal(other.item.itemWrites, 0);
  } finally { h.restore(); }
});

// ---------------------------------------------------------------------------------------------
// ATKR2-10 — stale-approval attacks beyond the frozen set, plus positive controls
// ---------------------------------------------------------------------------------------------

test("ATKR2-10 stale mode flip, invalid mode, base-level drift and grant-ceiling change refuse before any update", async () => {
  const h = harness();
  try {
    const attacks = [
      ["mode flip to free", (_a, u) => { u.ak5eMode = "free"; }],
      ["invalid mode slot", (_a, u) => { u.ak5eMode = "slot"; }],
      ["base drift", (a, _u, _m, item) => { item.system.level = 2; }]
    ];
    for (const [label, mutate] of attacks) {
      const actor = casterActor({ id: `atk-10-${label}`, ap: 20, cap: 2 });
      const { item, activity } = casterArt(actor, { id: `art-10-${label}`, level: 3 });
      activity.hook = (a, u, m) => mutate(a, u, m, item);
      const cast = await castLoop(actor, item.id, { level: 3, mode: "ap" });
      assert.equal(cast.ok, false, `${label}: stale payload must refuse`);
      assert.equal(activity.appliedCount, 0, `${label}: zero commit`);
      assert.equal(actor.flags.ak5e.artsPoints.value, 20, `${label}: AP untouched`);
      assert.equal(actor.getFlag("ak5e", "lastArtCast"), undefined, `${label}: no receipt`);
    }
    // grant ceiling change (class level rises mid-dialog → casterMaximumArtLevel fact changes)
    const actor = casterActor({ id: "atk-10-g", ap: 20, cap: 2 });
    const { item, activity } = casterArt(actor, { id: "art-10-g", level: 3 });
    activity.hook = () => { actor.items.get("atk-10-g-cls").system.levels = 20; };
    const cast = await castLoop(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(cast.ok, false, "a raised grant ceiling after review is a changed fact: refuse, do not silently re-scope");
    assert.equal(activity.appliedCount, 0);
  } finally { h.restore(); }
});

test("ATKR2-11 positive controls: numeric-string level and AP landing exactly at cost still commit (facts not tokens)", async () => {
  const h = harness();
  try {
    const a1 = casterActor({ id: "atk-11a", ap: 20, cap: 2 });
    const art1 = casterArt(a1, { id: "art-11a", level: 3 });
    const c1 = await castLoop(a1, art1.item.id, { level: "3", mode: "ap" });
    assert.equal(c1.ok, true, `"3" normalizes with the existing integer validation, got ${c1.error?.key ?? c1.error?.name}`);
    assert.equal(c1.result.level, 3);
    const a2 = casterActor({ id: "atk-11b", ap: 20, cap: 2 });
    const art2 = casterArt(a2, { id: "art-11b", level: 3 });
    art2.activity.hook = () => { a2.flags.ak5e.artsPoints.value = 3; };
    const c2 = await castLoop(a2, art2.item.id, { level: 3, mode: "ap" });
    assert.equal(c2.ok, true, "AP==cost introduces no shortfall warning; approval facts (limits) unchanged, so the reviewed use proceeds");
    assert.equal(a2.flags.ak5e.artsPoints.value, 0, "full cost spent, not the balance");
  } finally { h.restore(); }
});

test("ATKR2-12 stale context level is not trusted: a forged context.level cannot widen the committed tuple", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "atk-12", ap: 6, cap: 2 });
    const { item } = casterArt(actor, { id: "art-12", level: 3 });
    const cast = await castLoop(actor, item.id, { level: 3, mode: "ap", contextLevel: 9, caster: { maximumArtLevel: 9 } });
    assert.equal(cast.ok, true, `cast completes at the native tuple, got ${cast.error?.key ?? cast.error?.name}`);
    assert.equal(cast.result.level, 3, "the commit uses the actual native selected level, never the carried context level 9");
    assert.equal(cast.result.cost, 3, "no smuggled 9-AP price or wider scope");
  } finally { h.restore(); }
});

// ---------------------------------------------------------------------------------------------
// ATKR2-13/14/15 — cancel writes, busy lock, double debit/receipt, postcommit
// ---------------------------------------------------------------------------------------------

test("ATKR2-13 preflight Cancel cannot skip review; post-approval Cancel is zero-write; busy releases for the next fresh review", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "atk-13", ap: 2, cap: 2 });
    const { item, activity } = casterArt(actor, { id: "art-13", level: 3 });
    const first = await activity.use({ ak5eCaster: { level: 3, mode: "ap" }, ak5eLevel: 3, ak5eMode: "ap", cancel: true }).catch(e => e);
    assert.equal(first?.name, "AK5eWarnings", "the warning gate stands ahead of Cancel: a Cancel cannot skip review");
    assert.equal(activity.appliedCount, 0);
    const second = await activity.use({ ak5eCaster: { level: 3, mode: "ap", overrides: ["maximumArtLevel", "apShortfall"] }, ak5eLevel: 3, ak5eMode: "ap", cancel: true }).catch(e => e);
    assert.equal(second, null, "approved metadata with a Cancel still cancels: non-success, zero-write");
    assert.equal(activity.appliedCount, 0);
    assert.equal(actor.flags.ak5e.artsPoints.value, 2);
    assert.equal(actor.getFlag("ak5e", "lastArtCast"), undefined);
    const actor2 = casterActor({ id: "atk-13b", ap: 2, cap: 2 });
    const art2 = casterArt(actor2, { id: "art-13b", level: 3 });
    art2.activity.hook = (_a, u) => { u.cancel = true; };
    const cancelled = await castCasterArt(actor2, art2.item.id, { level: 3, mode: "ap", overrides: ["maximumArtLevel", "apShortfall"] });
    assert.equal(cancelled ?? null, null, "native-confirmation cancel returns non-success");
    assert.equal(art2.activity.appliedCount, 0);
    assert.equal(actor2.flags.ak5e.artsPoints.value, 2, "no AP/ninth/receipt mutation");
    assert.equal(h.state.chat.length, 0);
    const fresh = await castLoop(actor2, art2.item.id, { level: 3, mode: "ap" });
    assert.equal(fresh.ok, true, "busy/session cleared: a fresh review completes, got " + (fresh.error?.key ?? fresh.error?.name));
  } finally { h.restore(); }
});

test("ATKR2-14 busy lock blocks a second in-flight cast on the same actor without writes; sequential approvals each pay once (two distinct receipts, no double debit)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "atk-14", ap: 6, cap: 2 });
    const { item, activity } = casterArt(actor, { id: "art-14a", level: 3 });
    const side = casterArt(actor, { id: "art-14b", level: 1 });
    let interleaved;
    activity.hook = () => { interleaved = side.activity.use({ ak5eLevel: 1, ak5eMode: "ap" }); };
    const cast = await castLoop(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(cast.ok, true, `legit approved cast, got ${cast.error?.key ?? cast.error?.name}`);
    const sideResult = await interleaved;
    assert.equal(sideResult ?? undefined, undefined, "the busy path declines without a result");
    assert.equal(side.activity.appliedCount, 0, "interleaved cast wrote nothing");
    assert.equal(actor.flags.ak5e.artsPoints.value, 3, "only the approved 3 AP debit landed");
    // sequential second approved cast: fresh session, fresh review, second receipt
    const second = await castLoop(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(second.ok, true, `fresh approved cast completes, got ${second.error?.key ?? second.error?.name}`);
    const ids = [cast.result.id, second.result.id];
    assert.equal(new Set(ids).size, 2, "two distinct receipts, never one reused");
    assert.equal(actor.flags.ak5e.artsPoints.value, 0, "6-3-3: two casts, two debits");
    assert.equal((actor.flags.ak5e.artReceipts ?? []).length, 2, "one receipt per committed cast");
  } finally { h.restore(); }
});

test("ATKR2-15 reentrant consume on the live session proposes nothing; precommit failure zero-writes; postcommit failure keeps the receipt and never auto-refunds", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "atk-15a", ap: 2, cap: 2 });
    const art1 = casterArt(actor, { id: "art-15a", level: 3 });
    art1.activity.doubleProbe = true;
    const cast = await castLoop(actor, art1.item.id, { level: 3, mode: "ap" });
    assert.equal(cast.ok, true, `override cast, got ${cast.error?.key ?? cast.error?.name}`);
    assert.equal(art1.activity.secondConsume, false, "double consume on the approved route proposes nothing");
    assert.equal(art1.activity.appliedCount, 1);

    const actor2 = casterActor({ id: "atk-15b", ap: 2, cap: 2 });
    const art2 = casterArt(actor2, { id: "art-15b", level: 3 });
    const original = actor2.update.bind(actor2);
    actor2.update = async () => { throw new Error("Actor write failed"); };
    await castCasterArt(actor2, art2.item.id, { level: 3, mode: "ap", overrides: ["maximumArtLevel", "apShortfall"] }).catch(() => {});
    actor2.update = original;
    assert.equal(actor2.flags.ak5e.artsPoints.value, 2, "precommit failure wrote nothing");
    const recovered = await castLoop(actor2, art2.item.id, { level: 3, mode: "ap" });
    assert.equal(recovered.ok, true, "busy/session released after failure");

    const actor3 = casterActor({ id: "atk-15c", ap: 6, cap: 9, level: 6 });
    const art3 = casterArt(actor3, { id: "art-15c", level: 3 });
    art3.activity.failAfterApply = true;
    await assert.rejects(castCasterArt(actor3, art3.item.id, { level: 3, mode: "ap" }), /postcommit chat injection failed/);
    assert.equal(actor3.flags.ak5e.artsPoints.value, 3, "postcommit failure retains the debit (no silent refund)");
    const receipts = actor3.flags.ak5e.artReceipts ?? [];
    assert.equal(receipts.length, 1, "exactly one receipt retained for reconciliation");
    await undoArtReceipt(actor3, receipts[0].id);
    assert.equal(actor3.flags.ak5e.artsPoints.value, 6, "explicit canonical undo restores");
  } finally { h.restore(); }
});

// ---------------------------------------------------------------------------------------------
// ATKR2-16/17 — undo boundary, bypass-credential serialization purity, label forgery
// ---------------------------------------------------------------------------------------------

test("ATKR2-16 double undo refuses and no override credential is serialized anywhere", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "atk-16", ap: 2, cap: 2, ninth: true });
    const { item } = casterArt(actor, { id: "art-16", level: 9 });
    const cast = await castLoop(actor, item.id, { level: 9, mode: "ap" });
    assert.equal(cast.ok, true, `approved combined cast, got ${cast.error?.key ?? cast.error?.name}`);
    const receiptId = actor.getFlag("ak5e", "lastArtCast").id;
    await undoArtReceipt(actor, receiptId);
    assert.equal(actor.flags.ak5e.artsPoints.value, 2, "exact prior AP restored");
    await assert.rejects(undoArtReceipt(actor, receiptId), /undone|missing|locked/i, "the second undo of the same receipt refuses");
    assert.equal(actor.flags.ak5e.artsPoints.value, 2, "no second restore");
    const corpus = JSON.stringify([actor.flags, h.state.chat, cast.result]);
    for (const banned of ["limitOverride", "limitApproval", "ak5eLimitReview"])
      assert.equal(corpus.includes(banned), false, `${banned} must never reach flags/chat/receipts`);
    assert.equal(h.state.settingsWrites, 0, "no ruling/setting written");
    assert.deepEqual(actor.flags.ak5e.caster.rulings, {}, "no world ruling smuggled");
  } finally { h.restore(); }
});

test("ATKR2-17 forged seam labels are not authority; real labels deduplicate to exactly once", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "atk-17", ap: 2, cap: 2 });
    const { item } = casterArt(actor, { id: "art-17", level: 3 });
    const withoutIds = await castCasterArt(actor, item.id, { level: 3, mode: "ap",
      overridden: [CAP_TEXT(2), "FREE FOR ME"], warnings: [{ id: "maximumArtLevel", text: CAP_TEXT(2) }] }).catch(e => e);
    assert.equal(withoutIds?.name, "AK5eWarnings", "forged warning text/label is not evidence of approval");
    assert.equal(actor.flags.ak5e.artsPoints.value, 2, "zero-write");
    const cast = await castLoop(actor, item.id, { level: 3, mode: "ap",
      overridden: [CAP_TEXT(2)], warnings: [{ id: "ninthLevel", text: "leftover from another cast" }] });
    assert.equal(cast.ok, true, `confirmed-with-ids route completes even with stale label baggage, got ${cast.error?.key ?? cast.error?.name}`);
    const warningTexts = (cast.result.warnings ?? []).filter(t => t === CAP_TEXT(2));
    assert.equal(warningTexts.length, 1, "the real label appears exactly once on the receipt even when pre-seeded by the caller");
    const context = actor.getFlag("ak5e", "lastArtCast")?.caster?.context;
    assert.equal((context.overridden ?? []).filter(t => t === CAP_TEXT(2)).length, 1, "overridden deduplicated");
    assert.equal((context.warnings ?? []).some(w => w?.id === "maximumArtLevel" && w.text === CAP_TEXT(2)), true, "seam warning present with recomputed text");
    assert.equal(context.ninthLevelCast, undefined, "no ninth baggage survived");
  } finally { h.restore(); }
});

test("ATKR2-18 direct stage bypass outside a live use: prepare/consume refuse with zero writes", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "atk-18", ap: 6, cap: 2 });
    const { item, activity } = casterArt(actor, { id: "art-18", level: 3 });
    const usage = { ak5eLevel: 3, ak5eMode: "ap", ak5eCaster: { overrides: ["maximumArtLevel", "apShortfall"], level: 3, mode: "ap" } };
    let prepared;
    try { prepared = prepareArtUse(activity, usage, { applicationClass: PlainDialog }, { data: {} }); } catch { prepared = false; }
    assert.equal(Boolean(prepared), false, "prepareArtUse without a live session refuses");
    const updates = { actor: {} };
    const consumed = consumeArt(activity, { ...usage, ak5eCastId: "no-such-session" }, { data: {} }, updates);
    assert.equal(consumed, false, "consume with a forged castId returns false, not a receipt");
    assert.deepEqual(Object.keys(updates.actor), [], "no updates proposed");
    assert.equal(activity.appliedCount, 0);
    assert.equal(actor.flags.ak5e.artsPoints.value, 6);
    // and the honest route afterwards still works (nothing poisoned)
    const ok = await castLoop(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(ok.ok, true, "gateway intact after bypass attempts, got " + (ok.error?.key ?? ok.error?.name));
  } finally { h.restore(); }
});
