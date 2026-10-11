import test from "node:test";
import assert from "node:assert/strict";
import { adoptedSpellData, artsState, castingConfig, integer, quoteArt, recoveryValue, restArtsUpdates } from "../scripts/arts-rules.mjs";
import { previewActorArts, wrapActivityUse, prepareArtUse, consumeArt } from "../scripts/arts-casting.mjs";


const state = { enabled: true, value: 12, maximum: 12, maximumArtLevel: 9, ninthLevelCast: false };
function actor(points = {}, casting = {}) {
  return { documentName: "Actor", isOwner: true, items: [], getFlag: (_scope, key) => ({
    artsPoints: { ...state, ...points }, casting: { enabled: true, ability: "int", recovery: "long", ...casting }
  })[key] };
}

test("AP costs follow selected level, not the base Art level", () => {
  assert.equal(quoteArt(state, 1, 5).cost, 5);
  assert.equal(quoteArt(state, 0, 0).cost, 0);
  assert.throws(() => quoteArt(state, 0, 1), /Cantrips/);
  assert.throws(() => quoteArt(state, 3, 2), /Cast level/);
  assert.throws(() => quoteArt({ ...state, value: 2 }, 3, 3), /only 2/);
  assert.throws(() => quoteArt({ ...state, maximumArtLevel: 2 }, 3, 3), /maximum Art level/);
});

test("free ninth-level casts still obey the long-rest limit", () => {
  const grant = { free: { level: 9, maximum: 1, spent: 0 } };
  const free = quoteArt({ ...state, value: 0, maximumArtLevel: 0 }, 9, 9, grant, { mode: "free" });
  assert.equal(free.cost, 0);
  assert.equal(free.ninthLevelCast, true);
  assert.throws(() => quoteArt({ ...state, ninthLevelCast: true }, 9, 9, grant, { mode: "free" }), /already been cast/);
  assert.throws(() => quoteArt(state, 9, 9, { free: { ...grant.free, spent: 1 } }, { mode: "free" }), /No free casts/);
});

test("discounts, free-only grants and rituals require explicit configuration", () => {
  assert.equal(quoteArt(state, 1, 1, { reduction: 2, minimumCost: 1 }).cost, 1);
  assert.throws(() => quoteArt(state, 1, 1, { onlyFree: true }), /only be used/);
  assert.throws(() => quoteArt(state, 1, 1, {}, { mode: "ritual" }), /not configured/);
  assert.equal(quoteArt(state, 1, 1, { ritual: true }, { mode: "ritual" }).cost, 0);
  assert.throws(() => quoteArt(state, 1, 2, { ritual: true }, { mode: "ritual" }), /base level/);
  assert.throws(() => quoteArt(state, 1, 1, { blocked: "Needs branch implementation" }), /Needs branch/);
});

test("recovery preserves temporary excess until long rest", () => {
  const excess = { ...state, value: 16 };
  assert.equal(recoveryValue(excess, -1), 15);
  assert.equal(recoveryValue(excess, 2), 16);
  assert.equal(recoveryValue(excess, 2, { overflow: true }), 18);
  assert.deepEqual(restArtsUpdates(actor({ value: 16, ninthLevelCast: true }, { recovery: "manual" }), "long"), {
    "flags.ak5e.artsPoints.ninthLevelCast": false, "flags.ak5e.artsPoints.value": 12
  });
  assert.deepEqual(restArtsUpdates(actor(), "short"), {});
  assert.equal(restArtsUpdates(actor({}, { recovery: "short" }), "short")["flags.ak5e.artsPoints.value"], 12);
  assert.deepEqual(restArtsUpdates(actor({}, { enabled: false }), "long"), {});
});

test("adoption retains original fields and preview does not refill or clear ninth use", () => {
  const spell = { _id: "spell", type: "spell", system: { method: "spell", prepared: 0, properties: ["material", "vocal"], materials: { cost: 50 } } };
  const adopted = adoptedSpellData(spell);
  assert.deepEqual(adopted["system.properties"], ["vocal"]);
  assert.deepEqual(spell.system.properties, ["material", "vocal"]);
  const again = adoptedSpellData({ ...spell, flags: { ak5e: { art: adopted["flags.ak5e.art"] } } });
  assert.deepEqual(again["flags.ak5e.art"].original, adopted["flags.ak5e.art"].original);
  const sample = actor({ value: 2, ninthLevelCast: true });
  const preview = previewActorArts(sample, { maximum: 20 });
  assert.equal(preview.actor["flags.ak5e.artsPoints"].value, 2);
  assert.equal(preview.actor["flags.ak5e.artsPoints"].ninthLevelCast, true);
  assert.equal(artsState(sample).maximum, 12);
  assert.throws(() => previewActorArts({ ...sample, isOwner: false }), /own/);
});

test("configuration rejects invalid numeric and ability inputs", () => {
  for (const value of ["", null, true, NaN, Infinity, 1.5, -1]) assert.throws(() => integer(value, "value"));
  assert.throws(() => castingConfig({ ability: "str" }), /Intelligence/);
  assert.throws(() => castingConfig({ ability: "wis", recovery: "daily" }), /recovery/);
});

test("activity boundary cancels without spending, rejects duplicate consumption and unlocks after failure", async () => {
  const previous = { ui: globalThis.ui, foundry: globalThis.foundry };
  let sequence = 0;
  globalThis.ui = { notifications: { warn() {}, error() {} } };
  globalThis.foundry = { utils: { randomID: () => `cast${++sequence}` } };
  try {
    let points = { ...state };
    let writes = 0;
    const owner = actor();
    owner.uuid = "Actor.test";
    owner.getFlag = (_scope, key) => ({ artsPoints: points, casting: { enabled: true, ability: "int" } })[key];
    const item = { id: "art", name: "Test Art", type: "spell", system: { level: 1 }, actor: owner, getFlag: () => ({ noCastingUnit: true }) };
    class Dialog { static PARTS = {}; }
    class Activity {
      actor = owner;
      item = item;
      async use(usage, dialog, message) {
        dialog.applicationClass = Dialog;
        if (prepareArtUse(this, usage, dialog, message) === false) return;
        assert.equal(usage.consume.spellSlot, false);
        assert.equal(usage.spell, undefined);
        if (usage.cancel) return;
        usage.ak5eLevel = 3;
        const updates = { actor: {} };
        assert.notEqual(consumeArt(this, usage, message, updates), false);
        assert.equal(consumeArt(this, usage, message, { actor: {} }), false);
        if (usage.fail) throw new Error("Actor write failed");
        points = { ...points, value: updates.actor["flags.ak5e.artsPoints.value"] };
        writes++;
        return message.data.flags.ak5e.artCast;
      }
    }
    wrapActivityUse(Activity.prototype);
    const activity = new Activity();
    await activity.use({ cancel: true, spell: { slot: "spell9" } });
    assert.equal(writes, 0);
    assert.equal(points.value, 12);
    await assert.rejects(activity.use({ fail: true }), /Actor write failed/);
    assert.equal(points.value, 12);
    assert.equal((await activity.use()).cost, 3);
    assert.equal(points.value, 9);
    assert.equal(writes, 1);
    owner.isOwner = false;
    await assert.rejects(activity.use(), /own/);
    assert.equal(writes, 1);
  } finally {
    globalThis.ui = previous.ui;
    globalThis.foundry = previous.foundry;
  }
});
