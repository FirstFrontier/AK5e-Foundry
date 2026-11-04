/**
 * CR2 — caster-r2-seam frozen regression (drafted from SPEC-caster-r2-seam.md ONLY, pre-candidate).
 *
 * Proves the seam's contracts: a validated per-use limitOverride is honored end-to-end for
 * LevelCap / NinthUsed (incl. combined + AP shortfall), strict defaults are preserved, malformed /
 * prototype / inherited override keys are TypeError, Cancel/X/Escape (incl. DialogV2 nullish-action
 * semantics) write nothing, approval is session-bound, the actual debit clamps with public labels,
 * and canonical one-commit/undo boundaries hold.
 *
 * AC map: S1→T01*, S2→T02*, S3→T03*, S4→T04*, S5→T05*, S6→T06*, S7→T07*, S8→T08*, S9→T09*,
 * S10→T10*, S11→T11*, S12→T12*. The rendered GM / owning-Player-without-active-GM / observer
 * checklist items of S2/S3/S6/S10/S12 are covered by the implementer's foundry-live-check evidence,
 * not by this node file.
 *
 * Fixtures keep the reviewed class cap and Actor flag consistent (level 3 → cap 2, level 20 → cap 9)
 * and cast at the current maximum wherever Growing Power must not bend the quoted price. CBR is NOT
 * a merged dependency: assertions use main's facade/public APIs only (castCasterArt → wrapped
 * activity → prepareArtUse / consumeArt → flat Actor update applied once). apSpent amount/completion
 * is checked on the combined CBR tree per spec; here we only assert "not more than once".
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ArtsRuleError, quoteArt } from "../scripts/arts-rules.mjs";
import { artAvailability, consumeArt, prepareArtUse, undoArtReceipt, wrapActivityUse } from "../scripts/arts-casting.mjs";
import { castCasterArt } from "../scripts/caster-casting.mjs";
import { isPlayWarnings } from "../scripts/play-undo.mjs";
import { onAk5eEvent, offAk5eEvent } from "../scripts/trigger-events.mjs";

const CAP_TEXT = level => `This casting exceeds maximum Art level ${level}.`;
const NINTH_TEXT = "A 9th-level Art has already been cast since the last Long Rest.";
const SHORTFALL_TEXT = (cost, shortfall) =>
  `Not enough Arts Points for this cast: ${cost} required, ${shortfall} short. Use anyway to spend every remaining Arts Point.`;
const OVERRIDE_MESSAGE = "Invalid per-use Art limit override.";

function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = structuredClone(value);
}

let harnessCount = 0;
let globalRolls = 0;
/** Installs Foundry-shaped globals and returns { state: { chat, notices, settingsWrites }, restore }. */
function harness() {
  const previous = { game: globalThis.game, ui: globalThis.ui, foundry: globalThis.foundry,
    ChatMessage: globalThis.ChatMessage, Hooks: globalThis.Hooks, Roll: globalThis.Roll,
    fromUuidSync: globalThis.fromUuidSync };
  const state = { chat: [], notices: { warn: [], error: [], info: [] }, settingsWrites: 0, castSeq: 0 };
  globalThis.game = {
    user: { id: `user-${++harnessCount}`, isGM: false, targets: new Set() },
    combat: null,
    settings: { get: () => false, set: async () => { state.settingsWrites++; } },
    i18n: { localize: key => key, format: key => key }
  };
  globalThis.ui = { notifications: {
    warn: message => state.notices.warn.push(String(message)),
    error: message => state.notices.error.push(String(message)),
    info: message => state.notices.info.push(String(message))
  } };
  globalThis.foundry = { utils: {
    randomID: () => `cr2-cast-${++harnessCount}-${++state.castSeq}`,
    mergeObject: (object = {}, changes = {}) => { const out = structuredClone(object);
      for (const [key, value] of Object.entries(changes)) if (value !== undefined) out[key] = structuredClone(value); return out; },
    duplicate: value => structuredClone(value),
    flattenObject: object => object
  } };
  globalThis.ChatMessage = { implementation: {
    create: async data => { state.chat.push(structuredClone(data)); return { id: `msg-${state.chat.length}`, ...data }; },
    getSpeaker: ({ actor }) => ({ actor: actor?.id ?? "" })
  } };
  globalThis.Hooks = { on() {}, off() {}, call() {}, trigger() {} };
  globalThis.Roll = class { constructor() { globalRolls++; } };
  globalThis.fromUuidSync = () => null;
  return { state, restore() { for (const [key, value] of Object.entries(previous)) globalThis[key] = value; } };
}

/** Caster fixture per caster-casting.test.mjs conventions: authoritative flags, real source cap, owned spell. */
function casterActor({ id = "caster", level = 3, ap = 2, cap = 2, ninth = false } = {}) {
  const actor = { id, uuid: `Actor.${id}`, documentName: "Actor", type: "character", isOwner: true,
    flags: { ak5e: {
      casting: { enabled: true, ability: "int", castingUnit: "wand", recovery: "long" },
      artsPoints: { maximum: Math.max(ap, 12), value: ap, maximumArtLevel: cap, ninthLevelCast: ninth },
      caster: { enabled: true, version: 1, choices: {}, pools: ["standard-art-pool-corrosion-arts-407"],
        operations: [], casts: [], spends: [], rulings: {}, uses: {}, turn: {}, drones: [] }
    } },
    system: { attributes: { spellcasting: "int", prof: 2, hp: { value: 10, max: 10 } }, abilities: { int: { value: 16, mod: 3 } } },
    items: new Map(), writes: [],
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(changes) { this.writes.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } };
  actor.items.set(`${id}-class`, { id: `${id}-class`, type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: "class-caster" } }, getFlag(s, k) { return this.flags?.[s]?.[k]; } });
  actor.items.set(`${id}-branch`, { id: `${id}-branch`, type: "subclass",
    flags: { ak5e: { chapterThreeId: "subclass-caster-core" } }, getFlag(s, k) { return this.flags?.[s]?.[k]; } });
  return actor;
}

/** Non-Caster actor (strict Arts state only), for gateway negatives. */
function plainActor({ id = "plain", ap = 12, cap = 2 } = {}) {
  const actor = { id, uuid: `Actor.${id}`, documentName: "Actor", type: "character", isOwner: true,
    flags: { ak5e: { casting: { enabled: true, ability: "int" },
      artsPoints: { maximum: 12, value: ap, maximumArtLevel: cap, ninthLevelCast: false } } },
    system: { attributes: { spellcasting: "int", prof: 2 } }, items: new Map(), writes: [],
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(changes) { this.writes.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } };
  return actor;
}

class PlainDialog {
  static PARTS = {};
  async _prepareScalingContext(context) { return context; }
  async _prepareFooterContext(context) { return context; }
  async _prepareSubmitData(_event, data) { return data; }
}

/**
 * Real wrapped native activity mock per the frozen harness contract: calls the registered
 * prepare/dialog/consume stages and applies the resulting flat Actor update exactly once.
 * Never replaces castCasterArt / prepareArtUse / consumeArt themselves.
 */
class SeamActivity {
  static metadata = { usage: { actions: {} } };
  constructor(actor, item, { activation = "action" } = {}) {
    this.actor = actor; this.item = item; this.id = "cast"; this.activation = { type: activation };
    this.hook = null; this.calls = []; this.appliedCount = 0; this.secondConsume = undefined;
    this.doubleProbe = false;
    this.prepareReturnedFalse = false; this.consumeReturnedFalse = false;
  }
  async use(usage, dialog, message) {
    usage = usage ?? {};
    dialog = dialog ?? {};
    message = message ?? { data: {} };
    dialog.applicationClass ??= PlainDialog;
    this.calls.push({ usage, dialog, message });
    this.lastUsage = usage; this.lastDialog = dialog; this.lastMessage = message;
    if (prepareArtUse(this, usage, dialog, message) === false) { this.prepareReturnedFalse = true; return null; }
    if (usage.cancel) return null;
    this.capturedDialogClass = dialog.applicationClass;
    if (this.hook) this.hook(this, usage, message);
    if (usage.cancel) return null; // hook simulates a DialogV2 close/nullish action during configuration
    const updates = { actor: {} };
    const receipt = consumeArt(this, usage, message, updates);
    if (receipt === false) { this.consumeReturnedFalse = true; return null; }
    this.receipt = receipt; this.updates = updates;
    // Opt-in reentrancy probe: a second consume of the same session must not propose updates.
    if (this.doubleProbe) this.secondConsume = consumeArt(this, usage, message, { actor: {} });
    await this.actor.update(updates.actor); // the one native commit
    this.appliedCount++;
    return message.data.flags.ak5e.artCast;
  }
}
wrapActivityUse(SeamActivity.prototype);

function casterArt(actor, { id = "acid-surge", level = 3, name = "Acid Surge", activation = "action" } = {}) {
  const item = { id, name, type: "spell", actor, parent: actor, itemWrites: 0,
    system: { level, method: "ak5e", activities: new Map() },
    flags: { ak5e: { art: { enabled: true, noCastingUnit: true } } },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(changes) { this.itemWrites++; setPath(this, "flags.ak5e.changes", changes); } };
  const activity = new SeamActivity(actor, item, { activation });
  item.system.activities.set("cast", activity);
  actor.items.set(id, item);
  return { item, activity };
}

/** Caster warning-loop simulation per caster-sheet.mjs:640–665: retry with the union of discovered ids. */
async function castWithWarningLoop(actor, itemId, options = {}, maxRetries = 4) {
  const overrides = [...(options.overrides ?? [])];
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await castCasterArt(actor, itemId, { ...options, overrides: [...overrides] });
      return { ok: true, result, overrides: [...overrides] };
    } catch (error) {
      if (isPlayWarnings(error)) {
        const before = overrides.length;
        for (const warning of error.warnings) if (!overrides.includes(warning.id)) overrides.push(warning.id);
        if (overrides.length === before) return { ok: false, error, overrides: [...overrides] };
        continue;
      }
      return { ok: false, error, overrides: [...overrides] };
    }
  }
  return { ok: false, error: new Error("retry budget exhausted"), overrides };
}

const refusal = value => value?.name === "AK5eWarnings" || value?.key === "LevelCap" || value?.key === "NinthUsed" || !value;
const errorLabel = cast => String(cast.error?.key ?? cast.error?.name ?? cast.error);

const pureState = (points = {}) => ({ enabled: true, value: 12, maximum: 12, maximumArtLevel: 9, ninthLevelCast: false, ...points });
const ap = (state, base, selected, grant = {}, options = {}) => quoteArt(state, base, selected, grant, options);

// ---------------------------------------------------------------------------------------------
// S1 — strict pure default, scoped override, exact warnings, malformed rejection (CR2-T01)
// ---------------------------------------------------------------------------------------------

test("CR2-T01a strict quote default is unchanged without any override (S1)", () => {
  const overCap = pureState({ maximumArtLevel: 2 });
  assert.throws(() => ap(overCap, 3, 3), error => error instanceof ArtsRuleError && error.key === "LevelCap");
  const both = pureState({ maximumArtLevel: 2, ninthLevelCast: true });
  assert.throws(() => ap(both, 9, 9), error => error.key === "LevelCap", "LevelCap keeps precedence over NinthUsed");
  assert.throws(() => ap(pureState({ maximumArtLevel: 9, ninthLevelCast: true }), 9, 9), error => error.key === "NinthUsed");
  assert.equal(ap(overCap, 1, 1).cost, 1, "costs remain selected level plus existing modifiers");
  const short = ap(pureState({ value: 2 }), 3, 3);
  assert.equal(short.cost, 3); assert.equal(short.shortfall, 1); assert.equal(short.remaining, 0);
  assert.equal("limitWarnings" in ap(pureState(), 3, 3), false, "a default successful quote keeps the historical return shape");
});

test("CR2-T01b a valid matching LevelCap override suppresses only the cap failure and returns the exact warning (S1)", () => {
  const state = pureState({ maximumArtLevel: 2, value: 2 });
  const override = { level: 3, mode: "ap", keys: ["LevelCap"] };
  const quote = ap(state, 3, 3, {}, { mode: "ap", limitOverride: override });
  assert.equal(quote.cost, 3, "a suppressed limit never rewrites cost");
  assert.equal(quote.shortfall, 1, "shortfall is preserved");
  assert.deepEqual(quote.limitWarnings, [{ id: "maximumArtLevel", text: CAP_TEXT(2) }]);
});

test("CR2-T01c a valid matching NinthUsed override suppresses only the ninth failure and keeps the projection (S1)", () => {
  const quote = ap(pureState({ ninthLevelCast: true }), 9, 9, {}, { mode: "ap", limitOverride: { level: 9, mode: "ap", keys: ["NinthUsed"] } });
  assert.equal(quote.cost, 9, "an override is not a price change");
  assert.equal(quote.ninthLevelCast, true, "suppressing a limit never rewrites the ninthLevelCast projection");
  assert.deepEqual(quote.limitWarnings, [{ id: "ninthLevel", text: NINTH_TEXT }]);
});

test("CR2-T01d both authorized keys expose both applicable warnings in stable cap-then-ninth order (S1)", () => {
  const quote = ap(pureState({ maximumArtLevel: 2, ninthLevelCast: true, value: 2 }), 9, 9, {},
    { mode: "ap", limitOverride: { level: 9, mode: "ap", keys: ["LevelCap", "NinthUsed"] } });
  assert.deepEqual(quote.limitWarnings, [
    { id: "maximumArtLevel", text: CAP_TEXT(2) },
    { id: "ninthLevel", text: NINTH_TEXT }
  ]);
  assert.equal(quote.limitWarnings.some(warning => warning.id === "apShortfall"), false,
    "the pure quote does not invent the confirmation-protocol shortfall warning");
});

test("CR2-T01e each key suppresses independently: a subset override keeps the unsuppressed failure (S1)", () => {
  assert.throws(() => ap(pureState({ maximumArtLevel: 2, ninthLevelCast: true }), 9, 9, {},
    { mode: "ap", limitOverride: { level: 9, mode: "ap", keys: ["LevelCap"] } }),
  error => error instanceof ArtsRuleError && error.key === "NinthUsed",
  "only the named failure is suppressed; the unsuppressed error keeps its original key/data/text");
});

test("CR2-T01f a well-formed but nonmatching scope grants no bypass (S1)", () => {
  assert.throws(() => ap(pureState({ maximumArtLevel: 2 }), 3, 3, {},
    { mode: "ap", limitOverride: { level: 4, mode: "ap", keys: ["LevelCap"] } }),
  error => error.key === "LevelCap", "another level grants nothing (artsChoices loop protection)");
  assert.throws(() => ap(pureState({ maximumArtLevel: 2 }), 3, 3, {},
    { mode: "ap", limitOverride: { level: 3, mode: "free", keys: ["LevelCap"] } }),
  error => error.key === "LevelCap", "another mode grants nothing");
});

test("CR2-T01g matching override on a quote that fails nothing omits limitWarnings (S1)", () => {
  const quote = ap(pureState(), 0, 0, {}, { mode: "ap", limitOverride: { level: 0, mode: "ap", keys: ["LevelCap", "NinthUsed"] } });
  assert.equal(quote.cost, 0, "the zero-cost existing reading guard is untouched");
  assert.equal("limitWarnings" in quote, false, "empty limitWarnings is omitted for return-object compatibility");
});

test("CR2-T01h malformed, prototype, inherited, unknown and duplicated override inputs are TypeError and never approval (S1)", () => {
  const state = pureState({ maximumArtLevel: 2 });
  const bad = [
    ["boolean truthy", true],
    ["string", "LevelCap"],
    ["missing keys", { level: 3, mode: "ap" }],
    ["extra key", { level: 3, mode: "ap", keys: ["LevelCap"], cost: 0 }],
    ["non-array keys", { level: 3, mode: "ap", keys: "LevelCap" }],
    ["duplicate keys", { level: 3, mode: "ap", keys: ["LevelCap", "LevelCap"] }],
    ["unknown error key", { level: 3, mode: "ap", keys: ["levelcap"] }],
    ["prototype error key", { level: 3, mode: "ap", keys: ["LevelCap", "constructor"] }],
    ["inherited own-mixed", Object.create({ level: 3, mode: "ap", keys: ["LevelCap"] })],
    ["truthy boolean level", { level: true, mode: "ap", keys: ["LevelCap"] }],
    ["string level", { level: "3", mode: "ap", keys: ["LevelCap"] }],
    ["fractional level", { level: 3.5, mode: "ap", keys: ["LevelCap"] }],
    ["negative level", { level: -1, mode: "ap", keys: ["LevelCap"] }],
    ["level above domain", { level: 10, mode: "ap", keys: ["LevelCap"] }],
    ["unsafe integer", { level: Number.MAX_SAFE_INTEGER + 1, mode: "ap", keys: ["LevelCap"] }],
    ["unknown mode", { level: 3, mode: "slot", keys: ["LevelCap"] }],
    ["truthy object keys", { level: 3, mode: "ap", keys: [{ LevelCap: true }] }]
  ];
  for (const [label, limitOverride] of bad) {
    assert.throws(() => ap(state, 3, 3, {}, { mode: "ap", limitOverride }),
      error => error instanceof TypeError && error.message === OVERRIDE_MESSAGE,
      `malformed limitOverride (${label}) must be an internal TypeError, never approval`);
  }
  // A null-prototype plain object with the exact own keys IS structurally accepted (S1 positive control).
  const accepted = Object.assign(Object.create(null), { level: 3, mode: "ap", keys: ["LevelCap"] });
  const quote = ap(state, 3, 3, {}, { mode: "ap", limitOverride: accepted });
  assert.deepEqual(quote.limitWarnings, [{ id: "maximumArtLevel", text: CAP_TEXT(2) }]);
});

test("CR2-T01i the override path does not mutate its inputs: state, grant and limitOverride stay untouched (S1)", () => {
  const state = pureState({ maximumArtLevel: 2, ninthLevelCast: true });
  const grant = { reduction: 0 };
  const limitOverride = { level: 3, mode: "ap", keys: ["LevelCap", "NinthUsed"] };
  const options = { mode: "ap", limitOverride };
  const snapshot = { state: JSON.stringify(state), grant: JSON.stringify(grant), override: JSON.stringify(limitOverride), options: JSON.stringify(options) };
  const quote = ap(state, 3, 3, grant, options);
  assert.deepEqual(quote.limitWarnings, [{ id: "maximumArtLevel", text: CAP_TEXT(2) }],
    "NinthUsed does not fire for a level-3 cast; exactly one real warning is returned");
  assert.equal(JSON.stringify(state), snapshot.state, "the source state object is not mutated");
  assert.equal(JSON.stringify(grant), snapshot.grant, "the grant is not mutated");
  assert.equal(JSON.stringify(limitOverride), snapshot.override, "the limitOverride is not mutated or consumed");
  assert.equal(JSON.stringify(options), snapshot.options, "the options envelope keeps its own keys");
});

// ---------------------------------------------------------------------------------------------
// S2 — LevelCap reaches committed native use (CR2-T02)
// ---------------------------------------------------------------------------------------------

test("CR2-T02a unconfirmed above-cap Caster cast surfaces maximumArtLevel (plus shortfall) warnings instead of a raw quote veto (S2)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t02a", level: 3, ap: 2, cap: 2 });
    const { item } = casterArt(actor, { id: "art-t02a", level: 3 });
    const first = await castCasterArt(actor, item.id, { level: 3, mode: "ap" }).catch(error => error);
    assert.equal(first?.name, "AK5eWarnings",
      "a limit refusal must become a confirmable warning before native use (found: " + errorLabel({ error: first }) + ")");
    assert.deepEqual(first.warnings.map(warning => warning.id).sort(), ["apShortfall", "maximumArtLevel"],
      "the first thrown rule must not hide the AP shortfall");
    assert.equal(first.warnings.find(warning => warning.id === "maximumArtLevel").text, CAP_TEXT(2));
    assert.equal(actor.flags.ak5e.artsPoints.value, 2, "nothing was written");
    assert.equal(actor.writes.length, 0);
  } finally { h.restore(); }
});

test("CR2-T02b confirmed maximumArtLevel reaches native confirmation and commits at the requested level (S2)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t02b", level: 3, ap: 2, cap: 2 });
    const { item, activity } = casterArt(actor, { id: "art-t02b", level: 3 });
    const cast = await castWithWarningLoop(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(cast.ok, true, `expected completion after accepting all warnings, got ${errorLabel(cast)}`);
    assert.equal(cast.result.level, 3, "the cast commits at the requested level, not a fallback");
    assert.equal(actor.flags.ak5e.artsPoints.value, 0, "the debit clamps at zero");
    assert.equal(actor.flags.ak5e.artsPoints.maximumArtLevel, 2, "stored source limits are unchanged");
    assert.equal(actor.flags.ak5e.artsPoints.ninthLevelCast, false, "a non-ninth cast does not touch the ninth flag");
    assert.equal(activity.calls[0].usage.consume.spellSlot, false, "no native slot debit");
    const leaked = [actor.getFlag("ak5e", "lastArtCast"), JSON.stringify(h.state.chat)]
      .some(entry => String(entry).includes("AK5eConfirmedOverrideBlocked"));
    assert.equal(leaked, false, "no AK5eConfirmedOverrideBlocked remains after valid confirmation");
  } finally { h.restore(); }
});

// ---------------------------------------------------------------------------------------------
// S3 — NinthUsed reaches committed native use (CR2-T03)
// ---------------------------------------------------------------------------------------------

test("CR2-T03a selected ninth with ninthLevelCast true requires ninthLevel confirmation (S3)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t03a", level: 20, ap: 20, cap: 9, ninth: true });
    const { item } = casterArt(actor, { id: "art-t03a", level: 9 });
    const first = await castCasterArt(actor, item.id, { level: 9, mode: "ap" }).catch(error => error);
    assert.equal(first?.name, "AK5eWarnings",
      "a sufficient-AP ninth refusal must become a confirmable warning (found: " + errorLabel({ error: first }) + ")");
    assert.deepEqual(first.warnings.map(warning => warning.id), ["ninthLevel"]);
    assert.equal(first.warnings[0].text, NINTH_TEXT);
  } finally { h.restore(); }
});

test("CR2-T03b approved ninth cast commits at level 9 and leaves the ninth flag true (S3)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t03b", level: 20, ap: 20, cap: 9, ninth: true });
    const { item } = casterArt(actor, { id: "art-t03b", level: 9 });
    const cast = await castWithWarningLoop(actor, item.id, { level: 9, mode: "ap" });
    assert.equal(cast.ok, true, `approved ninth use must complete, got ${errorLabel(cast)}`);
    assert.equal(cast.result.level, 9);
    assert.equal(actor.flags.ak5e.artsPoints.value, 11, "the 9 AP price is paid normally, it is not zeroed by the override");
    assert.equal(actor.flags.ak5e.artsPoints.ninthLevelCast, true, "an already-true ninth flag stays true; it is never incremented or cleared by the seam");
  } finally { h.restore(); }
});

test("CR2-T03c without approval a ninth use writes nothing at all (S3)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t03c", level: 20, ap: 20, cap: 9, ninth: true });
    const { item, activity } = casterArt(actor, { id: "art-t03c", level: 9 });
    await castCasterArt(actor, item.id, { level: 9, mode: "ap" }).catch(() => {});
    assert.equal(activity.appliedCount, 0, "no native debit occurred");
    assert.equal(actor.flags.ak5e.artsPoints.value, 20);
    assert.equal(actor.flags.ak5e.artsPoints.ninthLevelCast, true);
    assert.equal(actor.getFlag("ak5e", "lastArtCast"), undefined, "no receipt");
    assert.equal(h.state.chat.length, 0, "no chat");
    assert.equal(globalRolls, 0, "no dice");
  } finally { h.restore(); }
});

// ---------------------------------------------------------------------------------------------
// S4 — combined warnings cannot disappear (CR2-T04)
// ---------------------------------------------------------------------------------------------

test("CR2-T04a cap + ninth + shortfall: the first inspection exposes all three ids; accepting only the cap still exposes the rest (S4)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t04a", level: 3, ap: 2, cap: 2, ninth: true });
    const { item } = casterArt(actor, { id: "art-t04a", level: 9 });
    const first = await castCasterArt(actor, item.id, { level: 9, mode: "ap" }).catch(error => error);
    assert.equal(first?.name, "AK5eWarnings",
      "combined failure must surface as confirmable warnings (found: " + errorLabel({ error: first }) + ")");
    assert.deepEqual(first.warnings.map(warning => warning.id).sort(), ["apShortfall", "maximumArtLevel", "ninthLevel"],
      "the normal retry loop must expose every missing warning; the first error cannot conceal the others");
    const partial = await castCasterArt(actor, item.id, { level: 9, mode: "ap", overrides: ["maximumArtLevel"] }).catch(error => error);
    assert.equal(partial?.name, "AK5eWarnings", "accepting one does not approve the other");
    assert.deepEqual(partial.warnings.map(warning => warning.id).sort(), ["apShortfall", "ninthLevel"]);
    assert.equal(actor.flags.ak5e.artsPoints.value, 2);
    assert.equal(actor.writes.length, 0);
  } finally { h.restore(); }
});

test("CR2-T04b retry with the union of all ids completes exactly once and saves no world ruling (S4)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t04b", level: 3, ap: 2, cap: 2, ninth: true });
    const { item, activity } = casterArt(actor, { id: "art-t04b", level: 9 });
    const rulingsBefore = JSON.stringify(actor.flags.ak5e.caster.rulings);
    const cast = await castWithWarningLoop(actor, item.id, { level: 9, mode: "ap" });
    assert.equal(cast.ok, true, `the union retry must complete, got ${errorLabel(cast)}`);
    assert.equal(activity.appliedCount, 1, "one native commit");
    assert.deepEqual([...new Set(cast.overrides)].sort(), ["apShortfall", "maximumArtLevel", "ninthLevel"]);
    assert.equal(actor.flags.ak5e.artsPoints.value, 0);
    assert.equal(JSON.stringify(actor.flags.ak5e.caster.rulings), rulingsBefore, "no global ruling is saved");
    assert.equal(h.state.settingsWrites, 0, "no world setting written");
    const texts = cast.result.warnings ?? [];
    for (const text of [CAP_TEXT(2), NINTH_TEXT, SHORTFALL_TEXT(9, 7)])
      assert.equal(texts.filter(entry => entry === text).length, 1, `confirmed label survives into result evidence exactly once: ${text}`);
  } finally { h.restore(); }
});

// ---------------------------------------------------------------------------------------------
// S5 — real debit / no price bypass (CR2-T05)
// ---------------------------------------------------------------------------------------------

test("CR2-T05a ordinary shortfall clamps the actual debit without any override, unchanged (S5 guard)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t05a", level: 6, ap: 2, cap: 3 });
    const { item, activity } = casterArt(actor, { id: "art-t05a", level: 3 });
    const result = await castCasterArt(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(result.cost, 3, "the quote keeps the selected-level price");
    assert.equal(result.before, 2); assert.equal(result.after, 0); assert.equal(result.shortfall, 1);
    assert.equal(actor.flags.ak5e.artsPoints.value, 0, "clamped to zero, never negative");
    assert.equal(activity.calls[0].usage.consume.spellSlot, false, "no native slot debit");
    assert.equal(actor.flags.ak5e.artsPoints.ninthLevelCast, false);
    assert.equal(activity.item.itemWrites, 0, "the owned Item is untouched");
    assert.equal(activity.appliedCount, 1, "one flat Actor update");
  } finally { h.restore(); }
});

test("CR2-T05b overridden cap cast records actualCost = before - after, not the quote (S5)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t05b", level: 3, ap: 2, cap: 2 });
    const { item } = casterArt(actor, { id: "art-t05b", level: 3 });
    const cast = await castWithWarningLoop(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(cast.ok, true, `expected completion, got ${errorLabel(cast)}`);
    const receipt = cast.result;
    assert.equal(receipt.cost, 3, "quoted cost may exceed the actual debit");
    assert.equal(receipt.before, 2); assert.equal(receipt.after, 0);
    assert.equal(receipt.actualCost, 2, "actualCost = before - after");
    assert.equal(actor.flags.ak5e.artsPoints.value, 0);
    assert.equal(receipt.level, 3, "no native level reduction is substituted");
  } finally { h.restore(); }
});

test("CR2-T05c overridden ninth at low AP quotes 9 but debits the clamped 2 (S5)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t05c", level: 20, ap: 2, cap: 9, ninth: true });
    const { item, activity } = casterArt(actor, { id: "art-t05c", level: 9 });
    const cast = await castWithWarningLoop(actor, item.id, { level: 9, mode: "ap" });
    assert.equal(cast.ok, true, `expected completion, got ${errorLabel(cast)}`);
    assert.equal(cast.result.cost, 9, "the 9 AP price stands: an override is not a free or named price");
    assert.equal(cast.result.actualCost, 2, "shortfall 7 of the quote remains unmet after clamping");
    assert.equal(cast.result.shortfall, 7);
    assert.equal(activity.lastUsage.consume.spellSlot, false, "no slot substitution");
    assert.equal(actor.flags.ak5e.artsPoints.value, 0);
    assert.equal(actor.flags.ak5e.artsPoints.ninthLevelCast, true);
  } finally { h.restore(); }
});

// ---------------------------------------------------------------------------------------------
// S6 — honest native confirmation for the overridden use (CR2-T06)
// ---------------------------------------------------------------------------------------------

test("CR2-T06a an approved limit use keeps the reviewed tuple fixed in the native dialog and labels it Use anyway (S6)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t06a", level: 3, ap: 20, cap: 2 }); // sufficient AP
    const { item, activity } = casterArt(actor, { id: "art-t06a", level: 3 });
    const cast = await castWithWarningLoop(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(cast.ok, true, `approved cap use must reach the native dialog, got ${errorLabel(cast)}`);
    assert.equal(cast.result.level, 3, "session-aware availability retains the approved tuple, never a silent lower level");
    const Dialog = activity.capturedDialogClass;
    assert.ok(Dialog && Dialog !== PlainDialog, "prepareArtUse must attach the Arts usage dialog class for the session");
    const dialog = Object.assign(new Dialog(), { item, actor, config: { ...activity.lastUsage } });
    const context = await dialog._prepareScalingContext({});
    assert.equal(context.ak5eArts.chooseLevel, false, "the reviewed level is fixed for this use");
    assert.equal(context.ak5eArts.chooseMode, false, "the reviewed mode is fixed for this use");
    assert.match(JSON.stringify(context.ak5eArts.castContextWarnings ?? []), /maximum Art level 2/,
      "the approved source-limit warning stays readable in the dialog");
    const footer = await dialog._prepareFooterContext({ buttons: [{ action: "use", label: "Use" }] });
    assert.ok((footer.buttons ?? []).some(button => /use anyway/i.test(button.label ?? "")),
      "final action is labelled 'Use anyway' even when AP is sufficient");
    assert.equal(h.state.settingsWrites, 0);
  } finally { h.restore(); }
});

test("CR2-T06b out-of-session availability remains strict: hard LevelCap refusal or legal-level fallback only (S6/S12)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t06b", level: 3, ap: 20, cap: 2 });
    // A base-3 Art above the cap has no legal fallback: the catalogue refuses strictly, casting nothing.
    const { item } = casterArt(actor, { id: "art-t06b", level: 3 });
    const hard = artAvailability(actor, item, { mode: "ap", level: 3 });
    assert.equal(hard.castable, false, "the generic catalogue has no approved exception outside a session");
    assert.equal(hard.error?.key, "LevelCap", "strict source-cap error is preserved");
    // A base-1 Art may still fall back inside the cap, never beyond it.
    const lowArt = casterArt(actor, { id: "art-t06b-low", level: 1 });
    const soft = artAvailability(actor, lowArt.item, { mode: "ap", level: 3 });
    assert.ok(soft.level <= 2 && soft.level >= 1, "existing legal fallback preserved, no over-cap level leaks");
  } finally { h.restore(); }
});

// ---------------------------------------------------------------------------------------------
// S7 — all cancellations are zero-write (CR2-T07)
// ---------------------------------------------------------------------------------------------

test("CR2-T07a declining the warning loop writes nothing (S7)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t07a", level: 3, ap: 2, cap: 2 });
    const { item, activity } = casterArt(actor, { id: "art-t07a", level: 3 });
    await castCasterArt(actor, item.id, { level: 3, mode: "ap" }).catch(() => {});
    assert.equal(activity.appliedCount, 0);
    assert.equal(actor.writes.length, 0);
    assert.equal(actor.flags.ak5e.artsPoints.value, 2);
    assert.equal(h.state.chat.length, 0);
    assert.equal(globalRolls, 0);
  } finally { h.restore(); }
});

test("CR2-T07b cancel at the native confirmation writes nothing and a later fresh approved cast works (S7)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t07b", level: 3, ap: 2, cap: 2 });
    const { item, activity } = casterArt(actor, { id: "art-t07b", level: 3 });
    const options = { level: 3, mode: "ap", overrides: ["maximumArtLevel", "apShortfall"] };
    // explicit Cancel, a 'cancel' action string, and a nullish (X/Escape) DialogV2 result — all zero-write
    for (const cancelValue of [true, "cancel", null]) {
      activity.hook = (_a, usage) => {
        if (cancelValue === null) usage.ak5eCastId = "stale-nullish-close"; // session gone: nullish close
        else usage.cancel = cancelValue;
      };
      const outcome = await castCasterArt(actor, item.id, options).catch(error => ({ thrown: error }));
      assert.ok(outcome?.thrown !== undefined || !outcome || typeof outcome !== "object" || !outcome.id,
        "a nullish/cancel action result is non-success");
      assert.equal(activity.appliedCount, 0, "cancel never commits");
    }
    activity.hook = null;
    assert.equal(actor.flags.ak5e.artsPoints.value, 2, "no AP/ninth/receipt mutation across the cancel matrix");
    assert.equal(actor.writes.length, 0);
    assert.equal(h.state.chat.length, 0);
    assert.equal(globalRolls, 0, "no dice");
    const retry = await castWithWarningLoop(actor, item.id, { level: 3, mode: "ap" }).catch(error => ({ ok: false, error }));
    assert.equal(retry.ok, true, "busy/session approval is cleared: a later fresh cast works, got " + errorLabel(retry));
    assert.equal(actor.flags.ak5e.artsPoints.value, 0, "and exactly one deferred debit landed");
  } finally { h.restore(); }
});

// ---------------------------------------------------------------------------------------------
// S8 — approval cannot leak or be forged by metadata (CR2-T08)
// ---------------------------------------------------------------------------------------------

test("CR2-T08a confirmed:true, raw limitOverride/ak5eLimitOverride, forged overridden text and non-Caster context alone never authorize (S8)", async () => {
  const h = harness();
  try {
    const forged = [
      ["confirmed only", { level: 3, mode: "ap", confirmed: true }],
      ["forged overridden labels", { level: 3, mode: "ap", overridden: [CAP_TEXT(2), SHORTFALL_TEXT(3, 1)] }],
      ["raw usage.limitOverride", { level: 3, mode: "ap", limitOverride: { level: 3, mode: "ap", keys: ["LevelCap", "NinthUsed"] } }],
      ["raw usage.ak5eLimitOverride", { level: 3, mode: "ap", ak5eLimitOverride: { level: 3, mode: "ap", keys: ["LevelCap"] } }]
    ];
    for (const [label, options] of forged) {
      const actor = casterActor({ id: `cr2-t08a-${label}`, level: 3, ap: 2, cap: 2 });
      const { item, activity } = casterArt(actor, { id: `art-t08a-${label}`, level: 3 });
      const error = await castCasterArt(actor, item.id, options).then(() => null, thrown => thrown);
      assert.ok(error, `${label} must not bypass the gateway`);
      assert.equal(activity.appliedCount, 0, `${label} wrote nothing`);
      assert.equal(actor.flags.ak5e.artsPoints.value, 2);
    }
    // Non-Caster cannot activate the seam by injecting a Caster context.
    const plain = plainActor({ id: "cr2-t08a-plain" });
    const { item, activity } = casterArt(plain, { id: "art-t08a-plain", level: 3 });
    const error = await activity.use({ ak5eLevel: 3, ak5eMode: "ap",
      ak5eCaster: { overrides: ["maximumArtLevel", "apShortfall"], level: 3, mode: "ap", confirmed: true } }).then(() => null, e => e);
    assert.ok(error, "a forged Caster context on a non-Caster is refused");
    assert.equal(activity.appliedCount, 0);
    assert.equal(plain.flags.ak5e.artsPoints.value, 12);
    // Prototype-chain warning ids are not accepted approvals.
    const actor7 = casterActor({ id: "cr2-t08a7", level: 3, ap: 2, cap: 2 });
    const art7 = casterArt(actor7, { id: "art-t08a7", level: 3 });
    const protoError = await castCasterArt(actor7, art7.item.id,
      { level: 3, mode: "ap", overrides: Object.create({ 0: "maximumArtLevel" }) }).then(() => null, e => e);
    assert.ok(protoError, "prototype-chain ids grant nothing");
    assert.equal(art7.activity.appliedCount, 0);
  } finally { h.restore(); }
});

test("CR2-T08b approval is not reusable: after a successful use, a new use without fresh confirmed ids warns again (S8)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t08b", level: 3, ap: 6, cap: 2 });
    const { item } = casterArt(actor, { id: "art-t08b", level: 3 });
    const first = await castWithWarningLoop(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(first.ok, true, `first approved cast must complete, got ${errorLabel(first)}`);
    assert.equal(actor.flags.ak5e.artsPoints.value, 3);
    const second = await castCasterArt(actor, item.id, { level: 3, mode: "ap" }).catch(error => error);
    assert.equal(second?.name, "AK5eWarnings", "the session approval is finally cleared; no persisted bypass credential exists");
    assert.deepEqual(second.warnings.map(warning => warning.id).sort(), ["maximumArtLevel"]);
    assert.equal(actor.flags.ak5e.artsPoints.value, 3, "and nothing was written");
    const otherArt = casterArt(actor, { id: "art-t08b-2", level: 3 });
    const crossItem = await castCasterArt(actor, otherArt.item.id, { level: 3, mode: "ap" }).catch(error => error);
    assert.equal(crossItem?.name, "AK5eWarnings", "another Item needs its own review");
  } finally { h.restore(); }
});

test("CR2-T08c an owning player with no active GM completes the same confirmed route; observers never do (S8/S12)", async () => {
  const h = harness();
  try {
    globalThis.game.user.isGM = false; // and no game.users / activeGM exists at all
    const actor = casterActor({ id: "cr2-t08c", level: 3, ap: 4, cap: 2 });
    const { item } = casterArt(actor, { id: "art-t08c", level: 3 });
    const cast = await castWithWarningLoop(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(cast.ok, true, `no GM prompt may be required, got ${errorLabel(cast)}`);
    assert.equal(h.state.notices.error.length, 0, "no GM-relay side channel errors");
    const observer = await castCasterArt(actor, item.id, { level: 3, mode: "ap", overrides: ["maximumArtLevel"] }).catch(error => error);
    assert.equal(actor.isOwner, true); // ownership untouched for the direct observer attempt below
    actor.isOwner = false;
    const denied = await castCasterArt(actor, item.id, { level: 3, mode: "ap", overrides: ["maximumArtLevel"] }).catch(error => error);
    assert.match(String(denied?.message ?? denied), /own/i, "an Observer/non-owner still cannot mutate another Actor");
    actor.isOwner = true;
    assert.equal(actor.flags.ak5e.artsPoints.value, 1, "value stayed at the committed 4-3=1");
    void observer;
  } finally { h.restore(); }
});

// ---------------------------------------------------------------------------------------------
// S9 — stale native payload is not a different cast (CR2-T09)
// ---------------------------------------------------------------------------------------------

test("CR2-T09a changed tuple or changed source-limit facts after approval refuse before any update (S9)", async () => {
  const h = harness();
  try {
    const cases = [
      { label: "tuple changed", actor: { id: "cr2-t09a1", level: 3, ap: 20, cap: 2 }, art: { level: 3 }, options: { level: 3 },
        hook: a => { a.lastUsage.ak5eLevel = 4; } },
      { label: "actor maximum changed", actor: { id: "cr2-t09a2", level: 3, ap: 20, cap: 2 }, art: { level: 3 }, options: { level: 3 },
        hook: (_a, _u, _m, actor) => { actor.flags.ak5e.artsPoints.maximumArtLevel = 9; } },
      { label: "fresh shortfall appeared", actor: { id: "cr2-t09a3", level: 3, ap: 20, cap: 2 }, art: { level: 3 }, options: { level: 3 }, apAfter: 0,
        hook: (_a, _u, _m, actor) => { actor.flags.ak5e.artsPoints.value = 0; } },
      { label: "ninth fact changed", actor: { id: "cr2-t09a4", level: 20, ap: 20, cap: 9, ninth: true }, art: { level: 9 }, options: { level: 9 },
        hook: (_a, _u, _m, actor) => { actor.flags.ak5e.artsPoints.ninthLevelCast = false; } }
    ];
    for (const spec of cases) {
      const actor = casterActor(spec.actor);
      const { item, activity } = casterArt(actor, { id: `art-${spec.actor.id}`, level: spec.art.level });
      activity.hook = (a, usage, message) => spec.hook(a, usage, message, actor);
      const cast = await castWithWarningLoop(actor, item.id, { ...spec.options, mode: "ap" });
      if (cast.ok) assert.ok(false, `${spec.label}: a stale payload must visibly refuse, not commit`);
      assert.ok(refusal(cast.error), `${spec.label}: refusal is a normal review path, got ${errorLabel(cast)}`);
      assert.equal(activity.appliedCount, 0, `${spec.label}: no proposed updates were written`);
      assert.equal(actor.flags.ak5e.artsPoints.value, spec.apAfter ?? 20, `${spec.label}: AP equals the injected change only, with no extra debit`);
    }
  } finally { h.restore(); }
});

test("CR2-T09b reopening and accepting the CURRENT warnings permits a new valid use (S9)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t09b", level: 3, ap: 20, cap: 2 });
    const { item, activity } = casterArt(actor, { id: "art-t09b", level: 3 });
    activity.hook = a => { a.lastUsage.ak5eLevel = 4; }; // stale during first attempt
    const stale = await castWithWarningLoop(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(stale.ok, false, "the stale attempt refuses");
    activity.hook = null;
    const fresh = await castWithWarningLoop(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(fresh.ok, true, `fresh review of current warnings must complete, got ${errorLabel(fresh)}`);
    assert.equal(fresh.result.level, 3, "it casts the re-reviewed level");
  } finally { h.restore(); }
});

// ---------------------------------------------------------------------------------------------
// S10 — public and persistent outcome (CR2-T10)
// ---------------------------------------------------------------------------------------------

test("CR2-T10a approved labels reach the public card, receipt and Caster context exactly once after both revalidations (S10)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t10a", level: 3, ap: 2, cap: 2, ninth: true });
    const { item } = casterArt(actor, { id: "art-t10a", level: 9, name: "Gloom Lance" });
    const cast = await castWithWarningLoop(actor, item.id, { level: 9, mode: "ap" });
    assert.equal(cast.ok, true, `approved combined use must complete, got ${errorLabel(cast)}`);
    const allTexts = [CAP_TEXT(2), NINTH_TEXT, SHORTFALL_TEXT(9, 7)];
    const receipt = cast.result;
    for (const text of allTexts)
      assert.equal((receipt.warnings ?? []).filter(entry => entry === text).length, 1, `receipt.warnings holds ${text} exactly once`);
    const context = actor.getFlag("ak5e", "lastArtCast")?.caster?.context;
    for (const text of allTexts)
      assert.equal((context?.overridden ?? []).filter(entry => entry === text).length, 1,
        "the public result path retains the recomputed overridden labels after prepare/consumption rewrote the Caster context");
    const card = h.state.chat.find(message => /used anyway/i.test(message.content ?? ""));
    assert.ok(card, "the existing public 'used anyway' result card is published");
    for (const text of allTexts)
      assert.equal((card.content.match(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length, 1,
        "the public card lists every confirmed label exactly once");
    assert.equal(h.state.chat.length, 1, "no duplicate card");
    const ledger = (actor.flags.ak5e.artReceipts ?? []).find(entry => entry.id === receipt.id);
    assert.ok(ledger, "the canonical receipt is retained for reload");
  } finally { h.restore(); }
});

test("CR2-T10b hostile display text in Art names and labels is escaped in the public card (S10)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t10b", level: 3, ap: 2, cap: 2 });
    const { item } = casterArt(actor, { id: "art-t10b", level: 3, name: '<img src=x onerror="steal()">' });
    const cast = await castWithWarningLoop(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(cast.ok, true, `expected completion, got ${errorLabel(cast)}`);
    const card = h.state.chat.find(message => /used anyway/i.test(message.content ?? ""));
    assert.ok(card, "public card exists");
    assert.equal(card.content.includes("<img"), false, "the name is escaped, never injected raw");
    assert.match(card.content, /&lt;img/);
  } finally { h.restore(); }
});

// ---------------------------------------------------------------------------------------------
// S11 — existing one-commit and undo boundaries hold (CR2-T11)
// ---------------------------------------------------------------------------------------------

test("CR2-T11a duplicate consumption never debits twice on a legal cast (S11 guard)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t11a", level: 6, ap: 6, cap: 3 });
    const { item, activity } = casterArt(actor, { id: "art-t11a", level: 3 });
    activity.doubleProbe = true;
    const result = await castCasterArt(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(result.cost, 3);
    assert.equal(activity.secondConsume, false, "a second consume of the same session proposes nothing");
    assert.equal(actor.flags.ak5e.artsPoints.value, 3, "single debit only");
    assert.equal(activity.appliedCount, 1);
  } finally { h.restore(); }
});

test("CR2-T11b an overridden cast also refuses a second consume and commits once (S11)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t11b", level: 3, ap: 2, cap: 2 });
    const { item, activity } = casterArt(actor, { id: "art-t11b", level: 3 });
    activity.doubleProbe = true;
    const cast = await castWithWarningLoop(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(cast.ok, true, `expected completion, got ${errorLabel(cast)}`);
    assert.equal(activity.secondConsume, false, "no second consumption on the overridden route");
    assert.equal(activity.appliedCount, 1);
    assert.equal(actor.flags.ak5e.artsPoints.value, 0);
  } finally { h.restore(); }
});

test("CR2-T11c precommit failure writes nothing; the failed path still allows a fresh confirmed cast (S11)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t11c", level: 6, ap: 2, cap: 3 });
    const { item } = casterArt(actor, { id: "art-t11c", level: 3 });
    const originalUpdate = actor.update.bind(actor);
    actor.update = async () => { throw new Error("Actor write failed"); };
    await castCasterArt(actor, item.id, { level: 3, mode: "ap" }).catch(error => {
      assert.match(String(error?.message ?? error), /Actor write failed/);
    });
    actor.update = originalUpdate;
    assert.equal(actor.flags.ak5e.artsPoints.value, 2, "nothing landed from the failed commit");
    assert.equal(actor.writes.length, 0);
    const fresh = await castWithWarningLoop(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(fresh.ok, true, "the seam releases after failure; a fresh review completes");
    assert.equal(actor.flags.ak5e.artsPoints.value, 0);
  } finally { h.restore(); }
});

test("CR2-T11d undo of an overridden clamped cast restores the exact prior AP and ninth state, preserving later unrelated edits, with no second receipt/inverse (S11)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t11d", level: 3, ap: 2, cap: 2, ninth: true });
    const { item } = casterArt(actor, { id: "art-t11d", level: 9 });
    const events = [];
    const handler = event => events.push(event);
    onAk5eEvent("apSpent", handler);
    try {
      const cast = await castWithWarningLoop(actor, item.id, { level: 9, mode: "ap" });
      assert.equal(cast.ok, true, `expected completion, got ${errorLabel(cast)}`);
      const receiptId = actor.getFlag("ak5e", "lastArtCast").id;
      const receiptsAfterCast = (actor.flags.ak5e.artReceipts ?? []).length;
      assert.equal(receiptsAfterCast, 1, "one canonical receipt");
      actor.flags.ak5e.caster.rulings = { unrelated: true }; // later unrelated edit
      await undoArtReceipt(actor, receiptId);
      assert.equal(actor.flags.ak5e.artsPoints.value, 2, "the attributable actual prior AP (2, the clamped before-value) is restored exactly");
      assert.equal(actor.flags.ak5e.artsPoints.ninthLevelCast, true, "the prior ninth state is restored, not silently cleared");
      assert.deepEqual(actor.flags.ak5e.caster.rulings, { unrelated: true }, "unrelated later edits are preserved");
      assert.equal((actor.flags.ak5e.artReceipts ?? []).length, receiptsAfterCast, "no second receipt/inverse is created by the override");
      assert.equal(actor.flags.ak5e.artReceipts[0].status, "undone");
      assert.ok(events.length <= 1, "the spend event never double-fires (once-only actual amount is checked on the combined CBR tree)");
    } finally { offAk5eEvent("apSpent", handler); }
  } finally { h.restore(); }
});

// ---------------------------------------------------------------------------------------------
// S12 — owner/no-GM plus compatibility (CR2-T12)
// ---------------------------------------------------------------------------------------------

test("CR2-T12a the confirmed cap and ninth cases run identically for the GM role (S12)", async () => {
  const h = harness();
  try {
    globalThis.game.user.isGM = true;
    const actor = casterActor({ id: "cr2-t12a", level: 3, ap: 2, cap: 2 });
    const capArt = casterArt(actor, { id: "art-t12a-cap", level: 3 });
    const capCast = await castWithWarningLoop(actor, capArt.item.id, { level: 3, mode: "ap" });
    assert.equal(capCast.ok, true, `GM cap route must complete, got ${errorLabel(capCast)}`);
    assert.equal(capArt.activity.appliedCount, 1);
    const actorNinth = casterActor({ id: "cr2-t12a-ninth", level: 20, ap: 20, cap: 9, ninth: true });
    const ninthArt = casterArt(actorNinth, { id: "art-t12a-ninth", level: 9 });
    const ninthCast = await castWithWarningLoop(actorNinth, ninthArt.item.id, { level: 9, mode: "ap" });
    assert.equal(ninthCast.ok, true, `GM ninth route must complete, got ${errorLabel(ninthCast)}`);
    assert.equal(ninthArt.activity.appliedCount, 1);
    assert.equal(actorNinth.flags.ak5e.artsPoints.ninthLevelCast, true, "no GM privilege changes the state outcome");
  } finally { h.restore(); }
});

test("CR2-T12b legacy compatibility: unowned casts, ordinary native casts and configured readings are unchanged (S12 guard)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t12b", level: 6, ap: 12, cap: 3 });
    const { item } = casterArt(actor, { id: "art-t12b", level: 3 });
    actor.isOwner = false;
    await assert.rejects(castCasterArt(actor, item.id, { level: 3, mode: "ap" }), /own/i);
    actor.isOwner = true;
    const result = await castCasterArt(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(result.cost, 3);
    assert.equal(actor.flags.ak5e.artsPoints.value, 9, "ordinary native casts keep their existing behavior");
    assert.equal(h.state.chat.length, 0, "an ordinary cast publishes no 'used anyway' card");
    // Unconfigured ritual readings remain readings, untouched by the seam.
    assert.throws(() => ap(pureState(), 1, 1, {}, { mode: "ritual", limitOverride: { level: 1, mode: "ritual", keys: ["LevelCap"] } }),
      error => !(error instanceof ArtsRuleError) || error.key !== "LevelCap",
      "a limit override cannot convert a missing ritual configuration into a cast");
    assert.throws(() => ap(pureState({ maximumArtLevel: 0 }), 1, 1, { onlyFree: true }), /only be used/);
    assert.throws(() => ap(pureState(), 0, 1), /Cantrips/);
  } finally { h.restore(); }
});

test("CR2-T12c the in-memory authorization object is never serialized into flags/chat/rulings (S12)", async () => {
  const h = harness();
  try {
    const actor = casterActor({ id: "cr2-t12c", level: 3, ap: 2, cap: 2 });
    const { item } = casterArt(actor, { id: "art-t12c", level: 3 });
    const cast = await castWithWarningLoop(actor, item.id, { level: 3, mode: "ap" });
    assert.equal(cast.ok, true, `expected completion, got ${errorLabel(cast)}`);
    const dumped = JSON.stringify(actor.flags);
    assert.equal(dumped.includes("limitApproval"), false, "session.limitApproval is internal, never persisted");
    assert.equal(dumped.includes("limitOverride"), false, "no bypass flag or override object is written into Actor flags");
    assert.equal(JSON.stringify(h.state.chat).includes("limitOverride"), false, "no override credential in chat");
    assert.equal(h.state.settingsWrites, 0, "no world ruling");
  } finally { h.restore(); }
});
