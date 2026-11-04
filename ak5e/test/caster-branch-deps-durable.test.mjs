import test from "node:test";
import assert from "node:assert/strict";
const core = await import(process.env.AK5E_DURABILITY_CORE ?? "file:///tmp/ak5e-lanes/caster-branch-deps/ak5e/scripts/caster-core.mjs");
import { coreDialogContent } from "/tmp/ak5e-lanes/caster-branch-deps/ak5e/scripts/caster-core-ui.mjs";
const clone = value => JSON.parse(JSON.stringify(value));
function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop(); let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = clone(value);
}
function setup(values = [2], replacement = [2]) {
  const db = { actor: null, messages: {} }; let rolls = 0;
  globalThis.game = { user: { id: "owner", isGM: false }, settings: { get: () => 0 }, messages: new Map(), users: new Map(), time: { worldTime: 0 } };
  globalThis.ui = { notifications: { warn() {}, error() {} } };
  globalThis.foundry = { utils: { randomID: () => "durable" } };
  const script = [...replacement];
  class DamageRoll {
    constructor(data) {
      this.dice = data.dice.map(term => ({ faces: term.faces, results: clone(term.results),
        async roll() { rolls++; const fresh = { result: script.shift() ?? 5, active: true }; this.results.push(fresh); return fresh; } }));
      this._total = data.total;
    }
    get total() { return this._total; }
    _evaluateTotal() { return this.dice.flatMap(term => term.results).filter(r => r.active !== false && !r.discarded).reduce((sum, r) => sum + r.result, 0); }
    toJSON() { return { dice: this.dice.map(term => ({ faces: term.faces,
      results: term.results.map(({ result, active, discarded, rerolled }) => ({ result, active, ...(discarded === undefined ? {} : { discarded }), ...(rerolled === undefined ? {} : { rerolled }) })) })), total: this.total }; }
  }
  const initial = { flags: { ak5e: { casting: { enabled: true }, artsPoints: { maximum: 30, value: 10, maximumArtLevel: 9 },
    caster: { enabled: true, version: 1, choices: {}, pools: [], operations: [], casts: [{ id: "cast", itemId: "art", completed: true }],
      signature: { itemId: "art", damaging: true }, rulings: { signatureRerollOnce: { value: true, source: "stored rule" } }, uses: {}, turn: {} } } } };
  function actorFrom(data) {
    return { ...clone(data), id: "caster", uuid: "Actor.caster", documentName: "Actor", type: "character", isOwner: true,
      items: new Map([["class", { type: "class", system: { levels: 15 }, flags: { ak5e: { chapterThreeId: "class-caster" } } }],
        ["branch", { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-caster-core" } } }]]),
      getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
      async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); db.actor = clone({ flags: this.flags }); return this; } };
  }
  function messageFrom(data) {
    const message = { ...clone(data), _source: clone(data), rolls: data.rolls.map(r => new DamageRoll(r)), writes: [],
      async update(changes) {
        if (this.failNextUpdate) { this.failNextUpdate = false; throw new Error("message write prevented"); }
        this.writes.push(clone(changes));
        for (const [path, value] of Object.entries(changes)) setPath(this._source, path, value);
        db.messages[this.id] = clone(this._source);
        this.flags = clone(this._source.flags);
        this.rolls = this._source.rolls.map(r => new DamageRoll(r));
        return this;
      } };
    game.messages.set(message.id, message); return message;
  }
  const addMessage = (id, dice = values) => {
    const data = { id, speaker: { actor: "caster" }, flags: { ak5e: { casterCast: { castId: "cast" } } },
      rolls: [{ dice: [{ faces: 6, results: dice.map(result => ({ result, active: true })) }], total: dice.reduce((a,b) => a+b, 0) }] };
    db.messages[id] = clone(data); return messageFrom(data);
  };
  db.actor = clone(initial);
  let actor = actorFrom(db.actor), message = addMessage("damage");
  return { db, addMessage, get actor() { return actor; }, get message() { return message; }, get rolls() { return rolls; },
    reload(id = "damage") { actor = actorFrom(clone(db.actor)); message = messageFrom(clone(db.messages[id])); return message; },
    failActorOnce() { const update = actor.update; let failed = false; actor.update = async function(changes) { if (!failed) { failed = true; throw new Error("actor write prevented"); } return update.call(this, changes); }; },
    use(id, indices = [0], extra = {}) { return core.rerollSignatureDice(actor, { confirmed: true, castId: "cast", indices, messageId: message.id, rolls: message.rolls, ...extra }, id); } };
}
test("D1 a replacement, physical identities and the new total commit in actual message storage", async () => {
  const env = setup([2], [5]); await env.use("d1");
  assert.equal(env.db.messages.damage.rolls[0].total, 5);
  assert.deepEqual(env.db.messages.damage.rolls[0].dice[0].results.map(r => [r.result, r.active]), [[2,false],[5,true]]);
  assert.ok(env.db.messages.damage.flags.ak5e.signatureDice, "identity metadata is in the same message commit as roll JSON");
  assert.ok(env.message.writes.some(write => write.rolls && write["flags.ak5e.signatureDice"]));
});
test("D2 reload then reroll refuses a second physical roll even when replacement remains eligible", async () => {
  const env = setup([2], [2,6]); await env.use("d2-a"); env.reload();
  const result = await env.use("d2-b");
  assert.equal(env.rolls, 1); assert.equal(result.replacements[0].value, 2);
});
test("D3 rewritten T3-C1 reloads real stored message JSON before selecting the other physical die", async () => {
  const env = setup([2,3], [6,4]); await env.use("d3-a"); env.reload();
  const result = await env.use("d3-b", [0]);
  assert.equal(env.rolls, 2); assert.equal(result.replacements[0].value, 4);
  assert.equal(env.db.messages.damage.rolls[0].total, 10);
});
test("D4 rewritten T3-C2 separate stored DamageRoll messages on one cast cannot share replacements", async () => {
  const env = setup([2], [2,4]); await env.use("d4-a");
  env.addMessage("other", [2]); env.reload("other");
  const result = await env.use("d4-b");
  assert.equal(env.rolls, 2); assert.equal(result.replacements[0].value, 4);
  assert.equal(env.db.messages.damage.rolls[0].total, 2);
});
test("D5 a second client with stale original rolls resolves the stored physical die", async () => {
  const env = setup([2], [2,6]); const foreign = clone(env.db.messages.damage.rolls);
  await env.use("d5-a"); env.reload();
  const result = await env.use("d5-b", [0], { rolls: foreign });
  assert.equal(env.rolls, 1); assert.equal(result.replacements[0].value, 2);
});
test("D6 card and Savant dialog read replaced dice and total after a stored-record reload", async () => {
  const env = setup([6,2], [5]); await env.use("d6", [1]); env.reload();
  assert.equal(env.message.rolls[0].total, 11);
  const html = coreDialogContent("signatureDice", { casts: [{ id: "cast" }], rolls: env.message.rolls });
  assert.match(html, /Position 1.*=.*5/s); assert.doesNotMatch(html, /<strong>2<\/strong>/);
});
test("D7 undo changes the normal cache but never erases the recorded replacement fact", async () => {
  const env = setup([2], [2,6]); await env.use("d7-a");
  await core.undoCoreUse(env.actor, "d7-a"); env.reload();
  const result = await env.use("d7-b");
  assert.equal(env.rolls, 1); assert.equal(result.replacements[0].value, 2);
});
test("D8 actor cache loss does not rearm a die whose replacement is stored on its message", async () => {
  const env = setup([2], [2,6]); await env.use("d8-a");
  delete env.db.actor.flags.ak5e.caster.signatureRerolls;
  delete env.db.actor.flags.ak5e.caster.signatureDamageRolls;
  env.reload(); await env.use("d8-b"); assert.equal(env.rolls, 1);
});

test("D9 malformed or foreign message selection is zero-write and never evaluates dice", async () => {
  for (const extra of [{ messageId: 5 }, { messageId: "" }, { messageId: "foreign" }, { indices: [0.5] }, { indices: [0,0] }, { indices: [1e20] }]) {
    const env = setup();
    await assert.rejects(env.use("d9", [0], extra));
    assert.equal(env.rolls, 0); assert.equal(env.message.writes.length, 0);
  }
});
test("D10 a failed Actor receipt write recovers from the committed message after reload", async () => {
  const env = setup([2], [2,6]); env.failActorOnce();
  await assert.rejects(env.use("d10-a"), /actor write prevented/);
  env.reload(); const result = await env.use("d10-a");
  assert.equal(env.rolls, 1); assert.equal(result.replacements[0].value, 2);
});
test("D11 a failed message write retains the fact for repair after reload without a second roll", async () => {
  const env = setup([2], [2,6]); env.message.failNextUpdate = true;
  await assert.rejects(env.use("d11-a"), /message write prevented/);
  env.reload(); const result = await env.use("d11-a");
  assert.equal(env.rolls, 1); assert.equal(result.replacements[0].value, 2);
  assert.equal(env.db.messages.damage.rolls[0].dice[0].results.length, 2);
});
test("D12 a stale foreign Roll without messageId locates and updates the original stored damage card", async () => {
  const env = setup([2,3], [6,4]); const foreign = clone(env.db.messages.damage.rolls);
  await env.use("d12-a"); env.reload();
  await env.use("d12-b", [1], { messageId: undefined, rolls: foreign });
  assert.equal(env.rolls, 2); assert.equal(env.db.messages.damage.rolls[0].total, 10);
});

test("D13 a later message write failure does not let the older message metadata erase a replacement", async () => {
  const env = setup([2,3], [6,4,5]); await env.use("d13-a");
  env.message.failNextUpdate = true;
  await assert.rejects(env.use("d13-b", [0]), /message write prevented/);
  env.reload(); const result = await env.use("d13-b", [0]);
  assert.equal(env.rolls, 2); assert.equal(result.replacements[0].value, 4);
  assert.equal(env.db.messages.damage.rolls[0].total, 10);
});

test("D14 message and fallback Actor write failures refuse after reload without rerolling", async () => {
  const env = setup([2], [4,6]);
  env.message.failNextUpdate = true;
  const update = env.actor.update;
  env.actor.update = async function(changes) {
    if (!env.message.failNextUpdate) throw new Error("fallback actor write prevented");
    return update.call(this, changes);
  };
  await assert.rejects(env.use("d14-a"), /fallback actor write prevented/);
  assert.equal(env.rolls, 1, "the first request evaluated one physical die");
  env.reload();
  let refusal;
  try { await env.use("d14-a"); } catch (error) { refusal = error; }
  assert.equal(env.rolls, 1, `physical rolls after retry: ${env.rolls}`);
  assert.match(String(refusal?.message), /reconcile.*GM/i, "an unrecoverable pending die requires explicit GM reconciliation");
});

test("D15 intent must persist before rolling and clears with the committed replacement", async () => {
  const env = setup([2], [4]); env.failActorOnce();
  await assert.rejects(env.use("d15-a"), /actor write prevented/);
  assert.equal(env.rolls, 0, "a failed intent write must never evaluate a die");
  assert.equal(env.message.writes.length, 0);
  env.reload();
  const update = env.actor.update;
  let intentPersisted = false;
  env.actor.update = async function(changes) {
    const result = await update.call(this, changes);
    if (Object.hasOwn(changes, "flags.ak5e.caster.signatureDamageRolls")) {
      assert.equal(env.rolls, 0, "the intent reaches real storage before any roll");
      assert.deepEqual(env.db.actor.flags.ak5e.caster.signatureDamageRolls.cast.sources[0].pending[0], { faces: 6 });
      intentPersisted = true;
    }
    return result;
  };
  await env.use("d15-a");
  assert.equal(intentPersisted, true);
  assert.equal(env.rolls, 1);
  assert.deepEqual(env.db.actor.flags.ak5e.caster.signatureDamageRolls.cast.sources[0].pending, {});
  assert.deepEqual(env.db.messages.damage.flags.ak5e.signatureDice.sources[0].pending, {});
});

test("D16 a roll without an evaluator leaves no pending intent after real storage reload", async () => {
  const env = setup([2], [4]);
  const ghost = { dice: [{ faces: 6, results: [{ result: 3, active: true }] }], total: 3 };
  const before = clone(env.db);
  await assert.rejects(env.use("d16-a", [0], { messageId: undefined, rolls: [ghost] }), /Choose the actual damage roll/);
  assert.equal(env.rolls, 0, "validation must not evaluate any die");
  assert.equal(env.message.writes.length, 0);
  assert.deepEqual(env.db, before, "validation must not persist an intent or any other write");
  const originalActor = env.actor, originalMessage = env.message;
  env.reload();
  assert.notEqual(env.actor, originalActor);
  assert.notEqual(env.message, originalMessage);
  assert.equal(env.actor.flags.ak5e.caster.signatureDamageRolls, undefined, "real stored Actor JSON has no pending reservation");
  assert.deepEqual(env.actor.flags, before.actor.flags);
  await assert.rejects(env.use("d16-a", [0], { messageId: undefined, rolls: [ghost] }), /Choose the actual damage roll/);
  assert.equal(env.rolls, 0, "a retry after reload still fails validation without rolling");
  assert.deepEqual(env.db, before);
  env.reload();
  const result = await env.use("d16-a");
  assert.equal(env.rolls, 1, "a valid retry is not stranded by the rejected ghost request");
  assert.equal(result.replacements[0].value, 4);
  assert.deepEqual(env.db.actor.flags.ak5e.caster.signatureDamageRolls.cast.sources[0].pending, {});
});

test("D17 a committed message replays the same operation after the final Actor commit fails", async () => {
  const env = setup([2,3], [4]);
  let writes = 0;
  const update = env.actor.update;
  env.actor.update = async function(changes) {
    writes += 1;
    if (writes === 2) throw new Error("final Actor commit prevented");
    return update.call(this, changes);
  };
  await assert.rejects(env.use("d17-a", [0]), /final Actor commit prevented/);
  assert.equal(writes, 2, "the intent committed but the final operation receipt did not");
  assert.equal(env.rolls, 1);
  const committed = clone(env.db.messages.damage);
  assert.deepEqual(committed.rolls[0].dice[0].results.map(r => [r.result, r.active]), [[2,false],[3,true],[4,true]]);
  assert.equal(committed.rolls[0].total, 7);
  assert.deepEqual(env.db.actor.flags.ak5e.caster.operations, []);
  const originalActor = env.actor, originalMessage = env.message;
  env.reload();
  assert.notEqual(env.actor, originalActor);
  assert.notEqual(env.message, originalMessage);
  await assert.rejects(env.use("d17-a", [1]), /same operation ID and exact choices/);
  assert.equal(env.rolls, 1, "changed-intent reuse is refused before evaluating any die");
  assert.deepEqual(env.db.messages.damage, committed);
  const result = await env.use("d17-a", [0]);
  assert.equal(env.rolls, 1, "same-ID retry must not resolve position 0 against the changed card and roll the 3");
  assert.deepEqual(result.replacements, [{ index: 0, faces: 6, value: 4 }]);
  assert.deepEqual(result.totals, [7]);
  assert.equal(result.operationId, "d17-a");
  assert.deepEqual(env.db.messages.damage, committed, "replay leaves the persisted replacement and card total unchanged");
  assert.equal(env.message.writes.length, 0, "replay needs no second message write");
  assert.deepEqual(env.db.actor.flags.ak5e.caster.operations[0].result, result, "retry repairs the normal Actor receipt");
  env.reload();
  assert.deepEqual(await env.use("d17-a", [0]), result);
  assert.equal(env.rolls, 1);
});

test("D18 sheet Savant retry carries the original ID and repairs the undo receipt without resolving positions again", async () => {
  const env = setup([2,3], [4,5]);
  const { openCasterControls } = await import("../scripts/caster-sheet.mjs");
  let writes = 0, ids = 0, submitCount = 0, recoveryCount = 0, menuClick, committed;
  const update = env.actor.update;
  env.actor.update = async function(changes) {
    writes += 1;
    if (writes === 2) throw new Error("final Actor commit prevented");
    return update.call(this, changes);
  };
  foundry.utils.randomID = () => `d18-${++ids}`;
  foundry.applications = { api: { DialogV2: { wait: async options => {
    if (options.content.includes('data-caster-ui="signatureDice"')) {
      options.render(null, { element: { querySelectorAll: () => [{ dataset: { casterUi: "signatureDice" },
        addEventListener(_event, callback) { menuClick = callback; } }] } });
      return null;
    }
    if (options.window.title.startsWith("Savant Signature reroll")) {
      assert.equal(ids, 1, "the ID already exists before the Core dialog is opened");
      submitCount += 1;
      assert.match(options.content, /Position 0.*=.*2/s);
      return options.buttons.find(button => button.action === "confirm").callback(null, {
        form: { elements: { castId: { value: "cast" }, indices: { value: "0" }, confirmed: { checked: true } } }
      });
    }
    recoveryCount += 1;
    assert.equal(env.rolls, 1);
    committed = clone(env.db.messages.damage);
    assert.equal(committed.rolls[0].total, 7);
    assert.equal(env.db.actor.flags.ak5e.caster.undo, undefined, "the final receipt write failed");
    assert.match(options.content, /d18-1/);
    const retry = options.buttons.find(button => button.label === "Retry same operation");
    assert.ok(retry, "the sheet offers the same-operation recovery path");
    assert.equal(retry.callback(null, { form: { elements: { retryConfirmed: { checked: false } } } }), false);
    return retry.callback(null, { form: { elements: { retryConfirmed: { checked: true } } } });
  } } } };
  await openCasterControls(env.actor);
  assert.equal(typeof menuClick, "function", "the real Caster menu wires the Savant control");
  menuClick({ preventDefault() {}, stopPropagation() {} });
  for (let tick = 0; tick < 20 && !env.db.actor.flags.ak5e.caster.undo?.length; tick += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(recoveryCount, 1, "a failed final Actor write offers retry without reopening the dice chooser");
  assert.equal(submitCount, 1, "the original choices are submitted once, then retained for retry");
  assert.equal(ids, 1, "the sheet mints exactly one operation ID, before the Core dialog");
  assert.equal(env.rolls, 1, "retry never rerolls the other die now occupying position 0");
  assert.equal(env.db.messages.damage.rolls[0].total, 7);
  assert.deepEqual(env.db.messages.damage, committed, "retry leaves the durable card facts untouched");
  assert.deepEqual(env.db.actor.flags.ak5e.caster.undo.map(receipt => receipt.id), ["d18-1"]);
  assert.equal(env.db.actor.flags.ak5e.caster.operations[0].id, "d18-1");
  env.reload();
  assert.equal(env.rolls, 1);
  assert.equal(env.message.rolls[0].total, 7);
  assert.equal(env.actor.flags.ak5e.caster.undo[0].id, "d18-1", "the repaired receipt survives stored-record reload");
});
