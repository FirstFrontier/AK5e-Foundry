import test from "node:test";
import assert from "node:assert/strict";
import { createOperationKernel, keyedSerial, opaqueKey } from "../scripts/operation-kernel.mjs";

// A deliberately non-Standard-Bearer branch: every flag, label and rule below is the
// consumer's own, proving the kernel carries no hidden Standard Bearer assumptions.
const gm = { id: "gm", isGM: true }, owner = { id: "owner", isGM: false }, stranger = { id: "stranger", isGM: false };
let sequence = 0, rolls = [], performed = [], hooks = new Map(), messages = [];
const put = (object, path, value) => { const parts = path.split("."); let next = object;
  for (const part of parts.slice(0, -1)) next = next[part] ??= {}; next[parts.at(-1)] = structuredClone(value); };
function actor(name = "sergeant", ownedBy = owner.id) {
  const a = { id: `a${++sequence}`, documentName: "Actor", name, flags: { ak5e: {} }, isToken: false, member: true,
    getFlag(ns, key) { return this.flags?.[ns]?.[key]; },
    async update(changes) { if (this.blockUpdate) throw new Error("blocked write"); for (const [k, v] of Object.entries(changes)) put(this, k, v); return this; },
    testUserPermission: user => user.isGM || user.id === ownedBy, getRollData: () => ({}) };
  a.uuid = `Actor.${a.id}`; globalThis.docs.set(a.uuid, a); return a;
}
function setup() {
  globalThis.docs = new Map(); rolls = []; performed = []; hooks = new Map(); messages = [];
  globalThis.game = { user: gm, users: new Map([gm, owner, stranger].map(u => [u.id, u])) }; game.users.activeGM = gm;
  globalThis.foundry = { utils: { randomID: () => `random${++sequence}` } };
  globalThis.fromUuid = async id => docs.get(id);
  globalThis.Roll = class { constructor(f) { this.formula = f; } async evaluate() { this.total = rolls.shift() ?? 4; return this; } async toMessage() {} };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async data => { const m = { id: `m${++sequence}`, author: game.user, ...data, flags: structuredClone(data.flags),
    getFlag(ns, key) { return this.flags?.[ns]?.[key]; }, async update(changes) { for (const [k, v] of Object.entries(changes)) put(this, k, v); return this; } }; messages.push(m); return m; } } };
  globalThis.Hooks = { on(n, cb) { hooks.set(n, [...(hooks.get(n) ?? []), cb]); return cb; }, off() {} };
}
const state = a => ({ operations: [], marks: 0, ...structuredClone(a.flags.ak5e.drillState ?? {}) });
function branch(overrides = {}) {
  const kernel = createOperationKernel({ label: "Drill Sergeant", stateFlag: "drillState", requestFlag: "drillRequest", responseFlag: "drillResponse",
    receiptFlag: "drillReceipts", benefitFlag: "drillBenefit", rollFlag: "drillRoll", tagPreset: "drill",
    getState: state, isMember: a => a.member, ownerExempt: ["salute"],
    gate: (a, command) => { if (command === "forbidden") throw new Error("Gate says no."); },
    async perform(a, command, data, op, s) {
      performed.push({ command, id: op.id });
      if (command === "mark") s.marks += 1;
      if (command === "roll") { s.rolled = await kernel.rollOnce(op, "die", "1d6", a); if (data.fail) throw new Error("after roll"); }
      if (command === "fail") throw new Error("before mutation");
      if (command === "hit") await kernel.targetUpdate(data.target, op.id, { "system.hp": 1 }, a);
      if (command === "wait") await data.gate;
      return s;
    }, ...overrides });
  return kernel;
}
const request = (command, data = {}, id = `req${++sequence}`) => ({ id, command, data: { confirmation: true, ...data } });

test("unchanged saves compare nested objects and arrays by value without a database write", async () => {
  setup(); const k = branch(), a = actor();
  a.flags.ak5e.drillState = { marks: 2, operations: [{ id: "one", rolls: { die: [1, 4] } }], nested: { a: 1, b: null } };
  a.update = async () => assert.fail("unchanged state should not be written");
  await k.saveState(a, { nested: { b: null, a: 1 }, operations: [{ rolls: { die: [1, 4] }, id: "one" }], marks: 2 });
  game.user = owner;
  await assert.rejects(k.saveState(a, structuredClone(a.flags.ak5e.drillState)), /active GM must commit/);
});
test("initial and changed states are saved, including reordered arrays and null values", async () => {
  setup(); const k = branch(), a = actor(), writes = [];
  const update = a.update.bind(a); a.update = async (changes, options) => { writes.push({ changes, options }); return update(changes); };
  await k.saveState(a, { operations: [], marks: 0, list: [1, 2], nested: { value: null } });
  await k.saveState(a, { operations: [], marks: 1, list: [2, 1], nested: { value: 3 } });
  assert.equal(writes.length, 2); assert.deepEqual(writes[0].options, {});
  assert.deepEqual(a.flags.ak5e.drillState, { operations: [], marks: 1, list: [2, 1], nested: { value: 3 } });
});
test("undefined update results succeed only when the requested state persisted", async () => {
  setup(); const k = branch(), a = actor();
  a.update = async changes => { for (const [key, value] of Object.entries(changes)) put(a, key, value); };
  await k.saveState(a, { operations: [], marks: 1 });
  a.update = async () => undefined;
  await assert.rejects(k.saveState(a, { operations: [], marks: 2 }), /state could not be saved/);
  assert.equal(a.flags.ak5e.drillState.marks, 1);
});
test("a rejected save still propagates its write error", async () => {
  setup(); const k = branch(), a = actor(); a.blockUpdate = true;
  await assert.rejects(k.saveState(a, { operations: [], marks: 1 }), /blocked write/);
  assert.equal(a.flags.ak5e.drillState, undefined);
});
test("token saves retain diff:false and skip unchanged copies", async () => {
  setup(); const k = branch(), a = actor(), writes = []; a.isToken = true;
  const update = a.update.bind(a); a.update = async (changes, options) => { writes.push(options); return update(changes); };
  const desired = { operations: [{ id: "token", rolls: {} }], marks: 1 };
  await k.saveState(a, desired); await k.saveState(a, structuredClone(desired));
  assert.deepEqual(writes, [{ diff: false }]);
});

test("operations commit under the consumer's own flag names and nothing else", async () => {
  setup(); const k = branch(), a = actor();
  assert.deepEqual(await k.execute(a, request("mark", {}, "one"), owner), { ok: true, operationId: "one" });
  assert.equal(a.flags.ak5e.drillState.marks, 1); assert.equal(a.flags.ak5e.drillState.operations[0].status, "committed");
  assert.deepEqual(Object.keys(a.flags.ak5e), ["drillState"]);
});
test("confirmation, membership, ownership, gating and a live GM are required before anything is written", async () => {
  setup(); const k = branch(), a = actor();
  await assert.rejects(k.execute(a, { id: "x", command: "mark", data: { confirmation: false } }, owner), /Confirm/);
  await assert.rejects(k.execute(a, request("mark", {}, "bad id!"), owner), /stable operation ID/);
  await assert.rejects(k.execute(a, request("mark"), stranger), /own the Drill Sergeant/);
  await assert.rejects(k.execute(a, request("forbidden"), owner), /Gate says no/);
  a.member = false; await assert.rejects(k.execute(a, request("mark"), owner), /live Drill Sergeant Actor/); a.member = true;
  await k.execute(a, request("salute"), stranger);           // ownerExempt command
  game.users.activeGM = null; game.user = owner;
  await assert.rejects(k.execute(a, request("mark"), owner), /active GM is required/);
  game.user = gm; game.users.activeGM = gm;
  assert.deepEqual(performed.map(p => p.command), ["salute"]); assert.equal(a.flags.ak5e.drillState.operations.length, 1);
});
test("operation IDs are bound to their choices and author; committed replays do not run again", async () => {
  setup(); const k = branch(), a = actor();
  await k.execute(a, request("mark", { n: 1 }, "same"), owner);
  assert.deepEqual(await k.execute(a, request("mark", { n: 1 }, "same"), owner), { ok: true, replayed: true });
  assert.equal(a.flags.ak5e.drillState.marks, 1);
  await assert.rejects(k.execute(a, request("mark", { n: 2 }, "same"), owner), /cannot be reused/);
  await assert.rejects(k.execute(a, request("mark", { n: 1 }, "same"), gm), /cannot be reused/);
});
test("a failure before any mutation leaves no prepared operation", async () => {
  setup(); const k = branch(), a = actor();
  await assert.rejects(k.execute(a, request("fail", {}, "f1"), owner), /before mutation/);
  assert.equal(state(a).operations.length, 0);
  await k.execute(a, request("mark"), owner);                 // not blocked
});
test("a failure after a roll keeps a prepared operation, reuses the stored roll on retry, and blocks other operations until resolved", async () => {
  setup(); const k = branch(), a = actor(); rolls = [6, 1];
  await assert.rejects(k.execute(a, request("roll", { fail: true }, "r1"), owner), /after roll/);
  assert.equal(state(a).operations[0].status, "prepared");
  await assert.rejects(k.execute(a, request("mark"), owner), /interrupted operation/);
  await assert.rejects(k.execute(a, request("roll", { fail: true }, "r1"), owner), /after roll/);   // same ID: allowed, reuses roll
  assert.equal(rolls.length, 1, "the second die was never rolled");
  assert.equal(Object.values(state(a).operations[0].rolls)[0], 6);
});
test("reconcile is GM-only, needs a reason and confirmation facts, and unblocks the branch", async () => {
  setup(); const k = branch(), a = actor();
  await assert.rejects(k.execute(a, request("roll", { fail: true }, "r1"), owner));
  const good = { operationId: "r1", reason: "Checked every recipient by hand.", facts: { qualifying: true } };
  await assert.rejects(k.execute(a, request("reconcile", good), owner), /Only the GM may reconcile interrupted Drill Sergeant state/);
  await assert.rejects(k.execute(a, request("reconcile", { ...good, reason: "short" }), gm), /manually reconciled/);
  await assert.rejects(k.execute(a, request("reconcile", { ...good, facts: {} }), gm), /manually reconciled/);
  await k.execute(a, request("reconcile", good), gm);
  assert.equal(state(a).operations.find(o => o.id === "r1").status, "reconciled");
  await k.execute(a, request("mark"), owner);
});
test("target writes are receipt-guarded so a retried operation applies once", async () => {
  setup(); const k = branch(), a = actor(), target = actor("recruit");
  const writes = []; const update = target.update.bind(target); target.update = async c => { writes.push(c); return update(c); };
  await k.execute(a, request("hit", { target }, "h1"), owner);
  await k.targetUpdate(target, "h1", { "system.hp": 99 }, a);             // simulated replay of the same application
  assert.equal(writes.length, 1); assert.equal(target.system.hp, 1);
  assert.equal(target.flags.ak5e.drillReceipts[opaqueKey("h1")], true);
});
test("an interrupted write is retained for retry rather than rolled back", async () => {
  setup(); const k = branch(), a = actor(), target = actor("recruit"); target.blockUpdate = true;
  await assert.rejects(k.execute(a, request("hit", { target }, "h2"), owner), /blocked write/);
  assert.equal(state(a).operations[0].status, "prepared" /* write was attempted: receipt unknown */);
});
test("operations on one Actor run strictly in order; different Actors do not wait on each other", async () => {
  setup(); const k = branch(), a = actor(), b = actor("other"); let release; const gate = new Promise(r => { release = r; });
  const first = k.execute(a, request("wait", { gate }, "w1"), owner), second = k.execute(a, request("mark", {}, "w2"), owner);
  const elsewhere = await k.execute(b, request("mark", {}, "w3"), owner);
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(performed.map(p => p.id), ["w1", "w3"], "w2 waits behind w1; w3 runs on another Actor");
  release(); await Promise.all([first, second]);
  assert.deepEqual(performed.map(p => p.id), ["w1", "w3", "w2"]); assert.equal(elsewhere.ok, true);
});
test("keyedSerial keeps going after a failed task", async () => {
  const run = keyedSerial(), a = { uuid: "Actor.x" };
  await assert.rejects(run(a, async () => { throw new Error("boom"); }), /boom/);
  assert.equal(await run(a, async () => "next"), "next");
});
test("beforeRun can adjust state before a request is validated and run", async () => {
  setup(); const k = branch({ beforeRun: (a, s) => { s.marks = 10; } }), a = actor();
  await k.execute(a, request("mark"), owner); assert.equal(a.flags.ak5e.drillState.marks, 11);
});
test("request transport: players ask through a whispered message; forged authors and answered messages are ignored", async () => {
  setup(); const k = branch(), a = actor(); game.user = owner;
  const pending = k.submit(a, "mark", { confirmation: true }, "net1");
  await new Promise(r => setTimeout(r, 0));
  const message = messages[0]; assert.equal(message.content, "Drill Sergeant confirmed request"); assert.deepEqual(message.whisper, ["gm", "owner"]);
  assert.equal(message.flags.ak5e.drillRequest.id, "net1");
  game.user = gm;
  await k.handle({ ...message, author: stranger, getFlag: message.getFlag, update: message.update.bind(message) }, {}, "owner");
  assert.equal(message.flags.ak5e.drillResponse.ok, false); assert.match(message.flags.ak5e.drillResponse.error, /author is invalid/);
  const answered = { ...message, getFlag: (ns, key) => key === "drillResponse" ? { ok: true } : message.getFlag(ns, key), update: async () => assert.fail("answered message must be ignored") };
  await k.handle(answered, {}, "owner");
  delete message.flags.ak5e.drillResponse;
  await k.handle(message, {}, "owner");
  assert.deepEqual(message.flags.ak5e.drillResponse, { ok: true, result: { ok: true, operationId: "net1" } });
  game.user = owner; for (const listener of hooks.get("updateChatMessage") ?? []) listener(message);
  assert.deepEqual(await pending, { ok: true, operationId: "net1" });
});
test("only the elected GM client handles requests; submit refuses when no GM is active", async () => {
  setup(); const k = branch(), a = actor(); game.user = owner;
  await assert.rejects(Promise.resolve().then(() => { game.users.activeGM = null; return k.submit(a, "mark", {}); }), /active GM is required; nothing was applied/);
  game.users.activeGM = gm;
  const touched = []; await k.handle({ getFlag: () => ({}), update: async () => touched.push(1) }, {}, "owner");
  assert.equal(touched.length, 0, "a non-GM client never answers requests");
});
