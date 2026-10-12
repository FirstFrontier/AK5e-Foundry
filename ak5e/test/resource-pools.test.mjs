import test from "node:test";
import assert from "node:assert/strict";
import { definePool, clearPoolRegistry, getPool, spendPool, refundPool, setPool, recoverPool, getPoolDefinition, listPoolDefinitions,
  evaluateFormula, compileFormula, once, limiterCycle, restTriggers, registerResourcePoolHooks,
  onUpdateCombat, onUpdateCombatant, onDeleteCombat, onRestCompleted, poolVariables } from "../scripts/resource-pools.mjs";

// ---------------------------------------------------------------- mocks
const gm = { id: "gm", isGM: true }, player = { id: "player", isGM: false };
let sequence = 0, hooks, errors, consoleErrors, consoleWarnings, originalConsoleError = console.error, originalConsoleWarn = console.warn;

/** Foundry's update merges nested objects by dotted path and replaces arrays. */
const plain = v => v && typeof v === "object" && !Array.isArray(v);
function merge(object, path, value) {
  const keys = path.split("."), last = keys.pop();
  let target = object;
  for (const key of keys) target = target[key] ??= {};
  if (plain(value) && Object.hasOwn(target, last) && plain(target[last])) for (const [k, v] of Object.entries(value)) merge(target[last], k, v);
  else target[last] = structuredClone(value);
}

function actor({ level = 7, prof = 3, cha = 2, classLevels = {}, token = false, owner = true, delay = 0 } = {}) {
  const id = `a${++sequence}`;
  const a = { id, uuid: `Actor.${id}`, documentName: "Actor", isToken: token, isOwner: owner, flags: { ak5e: {} }, writes: [],
    system: { attributes: { prof }, details: { level }, abilities: { cha: { mod: cha, value: 10 + cha * 2 }, str: { mod: 3, value: 16 } } },
    items: Object.entries(classLevels).map(([classId, levels]) => ({ type: "class", system: { levels }, flags: { ak5e: { chapterThreeId: classId } } })),
    getFlag(ns, key) { return this.flags?.[ns]?.[key]; },
    async update(data, options) {
      if (delay) await new Promise(r => setTimeout(r, delay));
      if (this.blockUpdate) throw new Error("blocked write");
      this.writes.push({ data: structuredClone(data), options });
      for (const [k, v] of Object.entries(data)) merge(this, k, v);
      return this;
    } };
  return a;
}
const stateOf = (a, id) => a.flags.ak5e.resourcePools?.[id];

function combatOf(actors) {
  const turns = actors.map((a, i) => ({ id: `c${i}`, actor: a }));
  const c = { id: `cmb${++sequence}`, round: 0, turn: null, turns, started: false,
    combatants: new Map(turns.map(t => [t.id, t])),
    previous: { round: 0, turn: null, combatantId: null }, current: { round: 0, turn: null, combatantId: null },
    /** Mirrors Combat#_onUpdate: previous is the prior current, then the hook payload. */
    go(round, turn) {
      this.previous = { ...this.current };
      this.round = round; this.turn = turn; this.started = round > 0;
      this.current = { round, turn, combatantId: turns[turn]?.id ?? null };
      return { round, turn };
    } };
  c.uuid = `Combat.${c.id}`;
  for (const t of turns) t.parent = c;
  return c;
}

function setup({ user = gm, activeGM = gm } = {}) {
  clearPoolRegistry(); hooks = new Map(); errors = []; consoleErrors = [];
  console.error = (...args) => consoleErrors.push(args);
  consoleWarnings = []; console.warn = (...args) => consoleWarnings.push(args);
  globalThis.game = { user, users: { activeGM }, combats: [], time: { worldTime: 100 } };
  globalThis.CONFIG = { DND5E: { restTypes: { short: { recoverPeriods: ["sr"] }, long: { recoverPeriods: ["lr", "sr"] } } } };
  globalThis.ui = { notifications: { error: message => errors.push(message) } };
  globalThis.Hooks = { on(name, cb) { hooks.set(name, [...(hooks.get(name) ?? []), cb]); return cb; } };
}
test.afterEach(() => { console.error = originalConsoleError; console.warn = originalConsoleWarn; });
/** Deterministic flush: lets every already-queued promise continuation and I/O callback run. No timers. */
const flush = () => new Promise(resolve => setImmediate(resolve));
/** Handlers return the promise of their (serialised) work, so awaiting what they return is the synchronisation; a handler that returns nothing has no pending work. */
const fire = async (name, ...args) => { const results = (hooks.get(name) ?? []).map(cb => cb(...args)); await Promise.all(results); return results; };

// Real class shapes from the source (TODO line cites are to /home/patch/AK5e-Foundry/TODO.md).
const LIFE_SUPPORT = { 1: 20, 2: 35, 4: 50, 6: 65, 8: 80, 10: 95, 12: 110, 14: 125, 16: 140, 18: 155, 20: 170 };
const SPARKS = [3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12];
function defineAll() {
  const here = a => a.flags.ak5e.has === true;
  definePool({ id: "resilience", label: "Resilience", classId: "class-vanguard", max: { 1: 4, 7: 6, 14: 8, 20: 10 }, recovery: [{ on: "lr" }] });
  definePool({ id: "aggression", label: "Aggression", classId: "class-vanguard", max: { 1: 4, 7: 6, 14: 8 }, recovery: [{ on: "sr" }, { on: "lr" }] });
  definePool({ id: "sparks", label: "Sparks of Creation", classId: "class-summoner", max: SPARKS, recovery: [{ on: "lr" }] });
  definePool({ id: "momentum", label: "Momentum", max: 6, initial: 0, appliesTo: a => a.flags.ak5e.charger === true,
    recovery: [{ on: "initiative", amount: 1 }, { on: "combatEnd", amount: "toInitial" }] });
  definePool({ id: "liberty", label: "Liberty", max: 6, initial: 0, appliesTo: a => a.flags.ak5e.liberator === true,
    recovery: [{ on: "turnEnd", amount: 1, when: (a, ctx) => ctx.combatant?.actor === a }, { on: "combatEnd", amount: "toInitial" }] });
  definePool({ id: "mysticCharge", label: "Mystic Charge", classId: "class-mystic", max: { 1: 2, 10: 3 }, initial: 0, appliesTo: a => a.flags.ak5e.mystic === true,
    recovery: [{ on: "initiative", amount: 1 }, { on: "lr", amount: "toInitial" }] });
  definePool({ id: "doublecast", label: "Doublecast", max: 1, appliesTo: a => a.flags.ak5e.caster === true, recovery: [{ on: "sr" }] });
  definePool({ id: "lifeSupport", label: "Life Support", classId: "class-medic", max: LIFE_SUPPORT, overMax: true, appliesTo: a => a.flags.ak5e.medic === true,
    recovery: [{ on: "lr", amount: "toMax" }] });
  definePool({ id: "exult", label: "Exult in Violence", max: "@prof", appliesTo: a => a.flags.ak5e.exult === true, recovery: [{ on: "lr" }] });
  definePool({ id: "doubleProf", label: "Twice PB", max: "2*@prof" });
  definePool({ id: "chaPool", label: "Charisma pool", max: "max(1, @abilities.cha.mod)" });
  definePool({ id: "tier", label: "Tier", max: "1 + min(1, floor(@details.level / 7))" });
  return here;
}

// ---------------------------------------------------------------- formula evaluator
test("evaluator accepts + - * / parentheses, unary minus, min, max, floor, ceil and @variables", () => {
  const vars = { prof: 3, level: 7, abilities: { cha: { mod: -1 } }, details: { level: 7 } };
  const table = [["2+3*4", 14], ["(2+3)*4", 20], ["10/4", 2.5], ["-3+5", 2], ["--3", 3], ["2*-3", -6], ["@prof", 3], ["2*@prof", 6],
    ["max(1, @prof+1)", 4], ["max(1, @abilities.cha.mod)", 1], ["min(@prof, 2, 9)", 2], ["floor(7/2)", 3], ["ceil(7/2)", 4],
    ["1 + min(1, floor(@details.level / 7))", 2], ["  @level  ", 7], ["+5", 5], ["max(1,2,3) - min(4,5)", -1]];
  for (const [formula, expected] of table) assert.equal(evaluateFormula(formula, vars), expected, formula);
});
test("evaluator rejects malformed, unknown and hostile input with a clear Error (never NaN, never eval)", () => {
  const vars = { prof: 3 };
  globalThis.__pwned = false;
  const bad = [["", /non-empty/], ["   ", /non-empty/], ["1 +", /ends unexpectedly/], ["(1", /expected '\)'/], ["1)", /unexpected '\)'/], ["2 3", /unexpected '3'/],
    ["*2", /unexpected '\*'/], ["floor()", /unexpected '\)'/], ["floor(1,2)", /takes 1 argument/], ["min()", /unexpected/], ["foo(1)", /Unknown function "foo"/],
    ["@missing", /Unknown variable @missing/], ["@prof.x", /Unknown variable @prof\.x/], ["@__proto__", /Unknown variable/], ["@constructor", /Unknown variable/],
    ["@toString", /Unknown variable/], ["@constructor.constructor", /Unknown variable/], ["1/0", /Division by zero/], ["1 % 2", /Unexpected character '%'/],
    ["process.exit()", /Unknown function "process"|Unexpected character/], ["globalThis.__pwned = true", /Unknown|Unexpected/],
    ["this.constructor.constructor('return 1')()", /Unknown|Unexpected/], ["(()=>{})()", /Unexpected|unexpected/], ["`${1}`", /Unexpected/],
    ["1; 2", /Unexpected character ';'/], ["2 ** 3", /unexpected '\*'/], ["x", /Unknown function "x"/], ["x(", /Unknown function/], ["1e3", /unexpected|Unexpected/],
    ["0x10", /unexpected|Unexpected/], ["'a'", /Unexpected/], ["{}", /Unexpected/], ["x".repeat(201), /exceed 200/], ["(".repeat(60) + "1" + ")".repeat(60), /nested too deeply/],
    [null, /non-empty/], [12, /non-empty/]];
  for (const [formula, pattern] of bad) assert.throws(() => evaluateFormula(formula, vars), pattern, String(formula));
  assert.equal(globalThis.__pwned, false);
  delete globalThis.__pwned;
});
test("evaluator rejects non-numeric variables and never returns NaN or Infinity", () => {
  assert.throws(() => evaluateFormula("@prof", { prof: "3" }), /not a number/);
  assert.throws(() => evaluateFormula("@prof", { prof: NaN }), /not a number/);
  assert.throws(() => evaluateFormula("@a", { a: { b: 1 } }), /not a number/);
  assert.throws(() => evaluateFormula("@prof", {}), /Unknown variable @prof/);
  assert.equal(compileFormula("@prof + @level").variables.join(), "prof,level");
});

// ---------------------------------------------------------------- maxima: real class shapes
test("maxima from real source shapes (TODO.md L276 Resilience, L331 Aggression, L596 Sparks, L250 Mystic, L503/L4622 Life Support)", () => {
  setup(); defineAll();
  const maxAt = (id, classId, level) => getPool(actor({ classLevels: { [classId]: level } }), id).max;
  // Resilience L276 / source table 03:943-963: 4 (1-6), 6 (7-13), 8 (14-19), 10 (20)
  const resilience = { 1: 4, 6: 4, 7: 6, 13: 6, 14: 8, 19: 8, 20: 10 };
  for (const [level, expected] of Object.entries(resilience)) assert.equal(maxAt("resilience", "class-vanguard", Number(level)), expected, `resilience ${level}`);
  // Aggression L331 / source 03:1877-1879: 4, +2 at 7th, +2 at 14th
  for (const [level, expected] of Object.entries({ 1: 4, 6: 4, 7: 6, 13: 6, 14: 8, 20: 8 })) assert.equal(maxAt("aggression", "class-vanguard", Number(level)), expected, `aggression ${level}`);
  // Sparks of Creation L596 / source 03:7579-7600 (array, index = level - 1)
  SPARKS.forEach((expected, i) => assert.equal(maxAt("sparks", "class-summoner", i + 1), expected, `sparks ${i + 1}`));
  assert.equal(maxAt("sparks", "class-summoner", 0), 0, "below level 1");
  assert.equal(maxAt("sparks", "class-summoner", 25), 12, "beyond the table clamps to the last row");
  // Mystic Charge L250: max 2, 3 from 10th level (source 03:687, 704)
  for (const [level, expected] of Object.entries({ 1: 2, 9: 2, 10: 3, 20: 3 })) assert.equal(maxAt("mysticCharge", "class-mystic", Number(level)), expected, `mystic ${level}`);
  // Medic Life Support L503 / source 03:4622-4645 (step rows)
  for (const [level, expected] of Object.entries({ 1: 20, 2: 35, 3: 35, 4: 50, 9: 80, 11: 95, 19: 155, 20: 170 })) assert.equal(maxAt("lifeSupport", "class-medic", Number(level)), expected, `life support ${level}`);
});
test("formula maxima use prof, level, classLevel and ability mods (feature-trackers.mjs:13, :19 shapes)", () => {
  setup(); defineAll();
  const a = actor({ prof: 3, level: 6, cha: 4 });
  assert.equal(getPool(a, "exult").max, 3);
  assert.equal(getPool(a, "doubleProf").max, 6);
  assert.equal(getPool(a, "chaPool").max, 4);
  assert.equal(getPool(actor({ cha: -2 }), "chaPool").max, 1, "max(1, negative mod)");
  assert.equal(getPool(actor({ level: 6 }), "tier").max, 1);
  assert.equal(getPool(actor({ level: 7 }), "tier").max, 2);
  definePool({ id: "classFormula", classId: "class-x", max: "floor(@classLevel / 2) + @prof" });
  assert.equal(getPool(actor({ prof: 3, classLevels: { "class-x": 9 } }), "classFormula").max, 7);
  assert.equal(getPool(actor({ prof: 3 }), "classFormula").max, 3, "no class items -> classLevel 0");
});
test("definitions reject bad maxima, unknown variables, bad ids, duplicates and fractional results", () => {
  setup();
  for (const [bad, pattern] of [[{ id: "a", max: -1 }, /whole number/], [{ id: "a", max: 1.5 }, /whole number/], [{ id: "a", max: "@bogus" }, /Unknown variable @bogus/],
    [{ id: "a", max: "@abilities.cha.hack" }, /Unknown variable/], [{ id: "a", max: "1 +" }, /ends unexpectedly/], [{ id: "a", max: [] }, /empty/], [{ id: "a", max: { x: 1 } }, /positive whole/],
    [{ id: "a", max: { 0: 1 } }, /positive whole/], [{ id: "a", max: {} }, /empty/], [{ id: "a" }, /needs a max/], [{ id: "_limits", max: 1 }, /pool id/], [{ id: "a.b", max: 1 }, /pool id/],
    [{ id: "a", max: 1, recovery: [{ on: "monthly" }] }, /recovery trigger/], [{ id: "a", max: 1, recovery: [{ on: "sr", amount: -1 }] }, /recovery amount/],
    [{ id: "a", max: 1, recovery: [{ on: "sr", amount: 1.5 }] }, /recovery amount/], [{ id: "a", max: 1, initial: -1 }, /initial/]])
    assert.throws(() => definePool(bad), pattern, JSON.stringify(bad));
  definePool({ id: "dup", max: 1 });
  assert.throws(() => definePool({ id: "dup", max: 2 }), /already defined/);
  assert.equal(definePool({ id: "dup", max: 2 }, { replace: true }).max.value, 2);
  definePool({ id: "half", max: "@prof/2" });
  assert.throws(() => getPool(actor({ prof: 3 }), "half"), /not a whole number/);
  assert.equal(getPool(actor({ prof: 4 }), "half").max, 2);
  definePool({ id: "level", max: "@level", levelBasis: "classLevel", classId: "c" });
  assert.equal(getPoolDefinition("dup").id, "dup"); assert.ok(listPoolDefinitions().length >= 3);
  assert.throws(() => getPool(actor(), "nope"), /Unknown resource pool/);
  definePool({ id: "noLevelData", max: { 1: 2 } });
  const bare = actor(); delete bare.system.details.level;
  assert.throws(() => getPool(bare, "noLevelData"), /level is unknown/);
  assert.deepEqual(Object.keys(poolVariables(bare)).sort(), ["abilities", "attributes", "prof"]);
});

// ---------------------------------------------------------------- spend / refund / set
test("reading is pure: getPool never writes and a stale value above a reduced max is clamped on read", () => {
  setup(); defineAll();
  const a = actor({ classLevels: { "class-vanguard": 20 } });
  assert.deepEqual(getPool(a, "resilience"), { id: "resilience", label: "Resilience", value: 10, max: 10, over: 0, overMax: false, corrupt: false });
  a.flags.ak5e.resourcePools = { resilience: { value: 10 } };
  a.items[0].system.levels = 1;
  assert.equal(getPool(a, "resilience").value, 4, "level dropped: raw 10 reads as max 4");
  assert.equal(a.writes.length, 0);
});
test("spend and refund are delta based, clamp to [0,max], and report what was actually applied", async () => {
  setup(); defineAll();
  const a = actor({ classLevels: { "class-vanguard": 7 } });                      // Resilience max 6
  assert.deepEqual(await spendPool(a, "resilience", 2, { reason: "Indestructible" }), { id: "resilience", op: "spend", before: 6, after: 4, applied: -2, max: 6, over: 0 });
  assert.equal(stateOf(a, "resilience").value, 4);
  assert.equal(stateOf(a, "resilience").last.reason, "Indestructible");
  const refund = await refundPool(a, "resilience", 5);
  assert.equal(refund.after, 6); assert.equal(refund.applied, 2, "refund of 5 clamps at max 6");
  assert.equal((await spendPool(a, "resilience", 6)).after, 0);
  assert.equal((await refundPool(a, "resilience", 0)).applied, 0);
  assert.equal((await setPool(a, "resilience", 99)).after, 6, "set clamps to max");
  assert.equal((await setPool(a, "resilience", 0)).after, 0);
});
test("rejected operations write NOTHING (overspend, fractional, negative, NaN, string, unknown pool, bad actor)", async () => {
  setup(); defineAll();
  const a = actor({ classLevels: { "class-vanguard": 1 } });                      // max 4
  await spendPool(a, "resilience", 1);
  const writes = a.writes.length, snapshot = structuredClone(a.flags);
  for (const [fn, args, pattern] of [[spendPool, [a, "resilience", 4], /Not enough Resilience: 4 needed, 3 available/], [spendPool, [a, "resilience", 1.5], /whole number/],
    [spendPool, [a, "resilience", -1], /whole number/], [spendPool, [a, "resilience", NaN], /whole number/], [spendPool, [a, "resilience", "2"], /whole number/],
    [spendPool, [a, "resilience", Infinity], /whole number/], [refundPool, [a, "resilience", -1], /whole number/], [refundPool, [a, "resilience", 0.5], /whole number/],
    [setPool, [a, "resilience", -3], /whole number/], [spendPool, [a, "ghost", 1], /Unknown resource pool/], [spendPool, [null, "resilience", 1], /live Actor/],
    [spendPool, [{ ...a, pack: "x", update() {} }, "resilience", 1], /live Actor/]])
    await assert.rejects(fn(...args), pattern);
  assert.equal(a.writes.length, writes); assert.deepEqual(a.flags, snapshot);
  a.blockUpdate = true;
  await assert.rejects(spendPool(a, "resilience", 1), /blocked write/);
  assert.equal(getPool(a, "resilience").value, 3, "a failed write leaves state untouched");
});
test("overMax pools exceed max on refund, and spending consumes the excess first (L503 Healing through Harm)", async () => {
  setup(); defineAll();
  const a = actor({ classLevels: { "class-medic": 2 } });                          // Life Support 35
  assert.deepEqual(await refundPool(a, "lifeSupport", 10), { id: "lifeSupport", op: "refund", before: 35, after: 45, applied: 10, max: 35, over: 10 });
  assert.deepEqual(getPool(a, "lifeSupport"), { id: "lifeSupport", label: "Life Support", value: 45, max: 35, over: 10, overMax: true, corrupt: false });
  const spent = await spendPool(a, "lifeSupport", 15);
  assert.equal(spent.after, 30); assert.equal(spent.over, 0);
  await refundPool(a, "lifeSupport", 100);
  assert.equal(getPool(a, "lifeSupport").value, 130);
  await assert.rejects(spendPool(a, "lifeSupport", 131), /Not enough/);
  assert.equal((await setPool(a, "lifeSupport", 200)).after, 200, "overMax set may exceed max");
});
test("concurrent spends on one Actor are serialised: no lost update", async () => {
  setup(); defineAll();
  const a = actor({ classLevels: { "class-vanguard": 20 }, delay: 3 });           // 10
  const results = await Promise.allSettled([spendPool(a, "resilience", 2), spendPool(a, "resilience", 3), spendPool(a, "resilience", 4), spendPool(a, "resilience", 4)]);
  assert.equal(getPool(a, "resilience").value, 10 - 2 - 3 - 4, "the fourth spend (4 of 1 left) is rejected, the others all land");
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
});
test("token actors are written with {diff:false}; world actors with no special option", async () => {
  setup(); defineAll();
  const token = actor({ token: true, classLevels: { "class-vanguard": 1 } }), world = actor({ classLevels: { "class-vanguard": 1 } });
  await spendPool(token, "resilience", 1); await spendPool(world, "resilience", 1);
  assert.deepEqual(token.writes[0].options, { diff: false });
  assert.deepEqual(world.writes[0].options, {});
  assert.deepEqual(Object.keys(token.writes[0].data), ["flags.ak5e.resourcePools.resilience"]);
  await recoverPool(token, "lr", { poolIds: ["resilience"] });
  assert.deepEqual(token.writes[1].options, { diff: false });
});
test("pool state touches only flags.ak5e.resourcePools (never featureTracking or system.uses)", async () => {
  setup(); defineAll();
  const a = actor({ classLevels: { "class-vanguard": 1 } });
  a.flags.ak5e.featureTracking = { untouched: true };
  await spendPool(a, "resilience", 1); await recoverPool(a, "lr", { poolIds: ["resilience"] }); await once({ scope: "round", key: "k" }).mark(a);
  for (const { data } of a.writes) for (const key of Object.keys(data)) assert.match(key, /^flags\.ak5e\.resourcePools\./);
  assert.deepEqual(a.flags.ak5e.featureTracking, { untouched: true });
});

// ---------------------------------------------------------------- recovery triggers
test("each trigger recovers per its amount mode: sr, lr, initiative, turnStart, turnEnd, combatEnd", async () => {
  setup();
  definePool({ id: "p", max: 6, initial: 0, appliesTo: () => true, recovery: [
    { on: "sr", amount: 2 }, { on: "lr", amount: "full" }, { on: "initiative", amount: 1 }, { on: "turnStart", amount: 3 }, { on: "turnEnd", amount: "toMax" }, { on: "combatEnd", amount: "toInitial" }] });
  const a = actor();
  assert.equal((await recoverPool(a, "initiative"))[0].after, 1);
  assert.equal((await recoverPool(a, "sr"))[0].after, 3);
  assert.equal((await recoverPool(a, "turnStart"))[0].after, 6, "3 more, clamped at max 6");
  assert.equal((await recoverPool(a, "combatEnd"))[0].after, 0, "toInitial (0) lowers");
  assert.equal((await recoverPool(a, "turnEnd"))[0].after, 6, "toMax sets to max");
  await spendPool(a, "p", 5);
  assert.equal((await recoverPool(a, "lr"))[0].after, 6, "full");
  assert.deepEqual(await recoverPool(a, "sr", { poolIds: [] }), []);
  await assert.rejects(recoverPool(a, "weekly"), /trigger must be one of/);
});
test("'full' never lowers an over-max pool but 'toMax' drops the excess (L503: lost on Long Rest)", async () => {
  setup(); defineAll();
  definePool({ id: "keepsExcess", max: 4, overMax: true, appliesTo: () => true, recovery: [{ on: "sr" }] });
  const a = actor({ classLevels: { "class-medic": 2 } }); a.flags.ak5e.medic = true;
  await refundPool(a, "lifeSupport", 10); await refundPool(a, "keepsExcess", 3);
  assert.equal(getPool(a, "keepsExcess").value, 7);
  await recoverPool(a, "sr"); assert.equal(getPool(a, "keepsExcess").value, 7);
  assert.equal(getPool(a, "lifeSupport").value, 45, "Healing through Harm has no SR recovery");
  await recoverPool(a, "lr"); assert.equal(getPool(a, "lifeSupport").value, 35);
});
test("recovery targets only pools the Actor has; a pool nobody owns is never written", async () => {
  setup(); defineAll();
  const bystander = actor({ classLevels: { "class-vanguard": 7 } });
  assert.deepEqual(await recoverPool(bystander, "initiative"), []);
  assert.deepEqual(await recoverPool(bystander, "combatEnd"), []);
  assert.equal(bystander.writes.length, 0);
  const charger = actor(); charger.flags.ak5e.charger = true;
  await recoverPool(charger, "initiative"); assert.equal(getPool(charger, "momentum").value, 1);
  assert.equal(getPool(bystander, "momentum").value, 0);
});
test("Momentum L618: +1 on initiative, capped at 6, cleared at combat end", async () => {
  setup(); defineAll();
  const a = actor(); a.flags.ak5e.charger = true;
  for (let i = 0; i < 9; i++) await recoverPool(a, "initiative");
  assert.equal(getPool(a, "momentum").value, 6, "max 6");
  await recoverPool(a, "combatEnd"); assert.equal(getPool(a, "momentum").value, 0);
});
test("Mystic L250: initiative gain, cap 2 (3 from level 10), lost on Long Rest", async () => {
  setup(); defineAll();
  const a = actor({ classLevels: { "class-mystic": 5 } }); a.flags.ak5e.mystic = true;
  await recoverPool(a, "initiative"); await recoverPool(a, "initiative"); await recoverPool(a, "initiative");
  assert.equal(getPool(a, "mysticCharge").value, 2);
  a.items[0].system.levels = 10; await recoverPool(a, "initiative"); assert.equal(getPool(a, "mysticCharge").value, 3);
  await recoverPool(a, "sr"); assert.equal(getPool(a, "mysticCharge").value, 3, "a Short Rest does not clear it");
  await recoverPool(a, "lr"); assert.equal(getPool(a, "mysticCharge").value, 0);
});
test("Doublecast L205: one use, recovered on a Short Rest; Aggression L331 on SR and LR", async () => {
  setup(); defineAll();
  const a = actor({ classLevels: { "class-vanguard": 14 } }); a.flags.ak5e.caster = true;
  assert.equal(getPool(a, "doublecast").value, 1);
  await spendPool(a, "doublecast", 1); await assert.rejects(spendPool(a, "doublecast", 1), /Not enough/);
  await recoverPool(a, "lr"); assert.equal(getPool(a, "doublecast").value, 0, "a bare 'lr' trigger does not refill a pool that is defined with Short Rest recovery only (the rest split is the caller's job)");
  await recoverPool(a, "sr"); assert.equal(getPool(a, "doublecast").value, 1);
});
test("Doublecast L205: a real long rest (['lr','sr'] via dnd5e.restCompleted) refills the SR-only pool", async () => {
  setup(); defineAll(); registerResourcePoolHooks();
  const a = actor({ classLevels: { "class-vanguard": 14 } }); a.flags.ak5e.caster = true;
  await spendPool(a, "doublecast", 1); assert.equal(getPool(a, "doublecast").value, 0);
  await fire("dnd5e.restCompleted", a, { type: "long" }, { type: "long" });
  assert.equal(getPool(a, "doublecast").value, 1, "a long rest is lr + sr, so the sr entry applies");
  assert.deepEqual(restTriggers({ type: "long" }), ["lr", "sr"]);
  assert.equal(stateOf(a, "doublecast").last.trigger, "sr");
});
test("'when' predicates gate a recovery entry (Liberty L378 end-of-turn generation condition)", async () => {
  setup(); defineAll();
  const a = actor(), other = actor(); a.flags.ak5e.liberator = true;
  await recoverPool(a, "turnEnd", { context: { combatant: { actor: other } } });
  assert.equal(getPool(a, "liberty").value, 0, "not the bearer's own turn");
  for (let i = 0; i < 9; i++) await recoverPool(a, "turnEnd", { context: { combatant: { actor: a } } });
  assert.equal(getPool(a, "liberty").value, 6, "cap 6");
});
test("a pool whose max throws reports an error entry and does not block the Actor's other pools", async () => {
  setup();
  definePool({ id: "broken", max: "@prof", appliesTo: () => true, recovery: [{ on: "lr" }] });
  definePool({ id: "fine", max: 3, appliesTo: () => true, recovery: [{ on: "lr" }] });
  const a = actor(); delete a.system.attributes.prof;
  await spendPool(a, "fine", 2);
  const results = await recoverPool(a, "lr");
  assert.match(results.find(r => r.id === "broken").error, /Unknown variable @prof/);
  assert.equal(getPool(a, "fine").value, 3);
});

// ---------------------------------------------------------------- idempotence of events
test("a repeated eventKey never recovers twice, even after a spend in between", async () => {
  setup(); defineAll();
  const a = actor(); a.flags.ak5e.charger = true;
  await recoverPool(a, "initiative", { eventKey: "init:1" });
  await recoverPool(a, "initiative", { eventKey: "init:1" });
  assert.equal(getPool(a, "momentum").value, 1);
  await spendPool(a, "momentum", 1);
  const again = await recoverPool(a, "initiative", { eventKey: "init:1" });
  assert.equal(getPool(a, "momentum").value, 0); assert.equal(again[0].skipped, "receipt");
  await recoverPool(a, "initiative", { eventKey: "init:2" }); assert.equal(getPool(a, "momentum").value, 1);
  for (let i = 0; i < 40; i++) await recoverPool(a, "initiative", { eventKey: `many:${i}` });
  const kept = stateOf(a, "momentum").receipts;
  assert.equal(kept.filter(r => r.startsWith("many:")).length, 24, "receipts are bounded per event kind (24 newest of 'many')");
  assert.deepEqual(kept.filter(r => r.startsWith("init:")), ["init:1", "init:2"], "a different kind is not evicted by the busy one");
  assert.equal(kept.length, 26);
});
test("a double-fired updateCombat (same combat state) applies turn recovery once", async () => {
  setup(); defineAll(); registerResourcePoolHooks();
  const a = actor(), b = actor(); a.flags.ak5e.liberator = true;
  const combat = combatOf([a, b]); combat.go(1, 0);
  const changed = combat.go(1, 1);                                                // a's turn ends, b's begins
  await fire("updateCombat", combat, changed, {}, "gm");
  await fire("updateCombat", combat, changed, {}, "gm");
  assert.equal(getPool(a, "liberty").value, 1, "Liberty +1 once at the end of a's turn");
  await spendPool(a, "liberty", 1);
  await fire("updateCombat", combat, changed, {}, "gm");
  assert.equal(getPool(a, "liberty").value, 0, "replay after a spend does not regrant");
});
test("an index shift of the same combatant in the same round is not a new turn", async () => {
  setup();
  definePool({ id: "ends", max: 9, initial: 0, appliesTo: () => true, recovery: [{ on: "turnEnd", amount: 1 }] });
  definePool({ id: "starts", max: 9, initial: 0, appliesTo: () => true, recovery: [{ on: "turnStart", amount: 1 }] });
  registerResourcePoolHooks();
  const a = actor(), b = actor(), combat = combatOf([a, b]);
  await fire("updateCombat", combat, combat.go(1, 0), {});
  const startsBefore = getPool(a, "starts").value;
  combat.previous = { round: 1, turn: 0, combatantId: "c0" }; combat.current = { round: 1, turn: 1, combatantId: "c0" }; combat.turn = 1;   // a combatant was inserted ahead of a
  await fire("updateCombat", combat, { turn: 1 }, {});
  assert.deepEqual([getPool(a, "ends").value, getPool(a, "starts").value], [0, startsBefore]);
});
test("deleting a combat that never started does not run combat-end recovery", async () => {
  setup();
  definePool({ id: "mom", max: 6, initial: 0, appliesTo: () => true, recovery: [{ on: "combatEnd", amount: "toInitial" }] });
  registerResourcePoolHooks();
  const a = actor(); await setPool(a, "mom", 3);
  const combat = combatOf([a]);                                                   // started === false
  await fire("deleteCombat", combat, {}, "gm");
  assert.equal(getPool(a, "mom").value, 3);
  combat.go(1, 0); await fire("deleteCombat", combat, {}, "gm");
  assert.equal(getPool(a, "mom").value, 0);
});
test("updateCombat: turnEnd for the previous combatant, turnStart for the new one, round wraps, skipped when turnEvents:false or unrelated change", async () => {
  setup();
  definePool({ id: "ends", max: 9, initial: 0, appliesTo: () => true, recovery: [{ on: "turnEnd", amount: 1 }] });
  definePool({ id: "starts", max: 9, initial: 0, appliesTo: () => true, recovery: [{ on: "turnStart", amount: 1 }] });
  registerResourcePoolHooks();
  const a = actor(), b = actor(), combat = combatOf([a, b]);
  await fire("updateCombat", combat, combat.go(1, 0), {});                        // combat start: no previous turn to end
  assert.deepEqual([getPool(a, "ends").value, getPool(a, "starts").value, getPool(b, "starts").value], [0, 1, 0]);
  await fire("updateCombat", combat, combat.go(1, 1), {});
  assert.deepEqual([getPool(a, "ends").value, getPool(b, "starts").value, getPool(b, "ends").value], [1, 1, 0]);
  await fire("updateCombat", combat, combat.go(2, 0), {});                        // round wrap: b ends, a starts again
  assert.deepEqual([getPool(b, "ends").value, getPool(a, "starts").value], [1, 2]);
  const before = a.writes.length + b.writes.length;
  await fire("updateCombat", combat, combat.go(2, 1), { turnEvents: false });
  await fire("updateCombat", combat, { scene: "x" }, {});
  await fire("updateCombat", { ...combat, started: false }, { round: 1 }, {});
  assert.equal(a.writes.length + b.writes.length, before);
});
test("updateCombatant: initiative set recovers once per combatant per combat; a cleared or unrelated change does not", async () => {
  setup(); defineAll(); registerResourcePoolHooks();
  const a = actor(); a.flags.ak5e.charger = true;
  const combat = combatOf([a]), combatant = combat.turns[0];
  await fire("updateCombatant", combatant, { initiative: null }, {});
  await fire("updateCombatant", combatant, { defeated: true }, {});
  await fire("updateCombatant", combatant, { initiative: "12" }, {});
  assert.equal(a.writes.length, 0);
  await fire("updateCombatant", combatant, { initiative: 14 }, {});
  await fire("updateCombatant", combatant, { initiative: 14 }, {});
  await fire("updateCombatant", combatant, { initiative: 9 }, {});                // reroll within the same combat
  assert.equal(getPool(a, "momentum").value, 1);
  const next = combatOf([a]);                                                      // a new combat grants again
  await fire("updateCombatant", next.turns[0], { initiative: 3 }, {});
  assert.equal(getPool(a, "momentum").value, 2);
});
test("deleteCombat: combatEnd clears every combatant's pool exactly once", async () => {
  setup(); defineAll(); registerResourcePoolHooks();
  const a = actor(), b = actor(), c = actor(); a.flags.ak5e.charger = true; b.flags.ak5e.charger = true;
  await refundPool(a, "momentum", 4); await refundPool(b, "momentum", 6);
  const combat = combatOf([a, b, c]); combat.go(1, 0);                           // a started combat is being deleted
  await fire("deleteCombat", combat, {}, "gm");
  assert.equal(getPool(a, "momentum").value, 0); assert.equal(getPool(b, "momentum").value, 0); assert.equal(c.writes.length, 0);
  await refundPool(a, "momentum", 2);
  await fire("deleteCombat", combat, {}, "gm");
  assert.equal(getPool(a, "momentum").value, 2, "replayed delete event is ignored");
});
test("dnd5e.restCompleted: short = sr, long = lr + sr; same result object once; non-owner writes nothing", async () => {
  setup(); defineAll(); registerResourcePoolHooks();
  const a = actor({ classLevels: { "class-vanguard": 7 } }); a.flags.ak5e.caster = true; a.flags.ak5e.mystic = true;
  await spendPool(a, "aggression", 6); await spendPool(a, "resilience", 6); await spendPool(a, "doublecast", 1);
  const shortRest = { type: "short" };
  await fire("dnd5e.restCompleted", a, shortRest, { type: "short" });
  await fire("dnd5e.restCompleted", a, shortRest, { type: "short" });
  assert.deepEqual([getPool(a, "aggression").value, getPool(a, "doublecast").value, getPool(a, "resilience").value], [6, 1, 0]);
  await spendPool(a, "doublecast", 1);
  await fire("dnd5e.restCompleted", a, shortRest, { type: "short" });
  assert.equal(getPool(a, "doublecast").value, 0, "a replay of the same rest result does not recover again");
  await fire("dnd5e.restCompleted", a, { type: "short" }, { type: "short" });
  assert.equal(getPool(a, "doublecast").value, 1, "a genuinely new rest does");
  await fire("dnd5e.restCompleted", a, { type: "long" }, { type: "long" });
  assert.equal(getPool(a, "resilience").value, 6);
  const stranger = actor({ owner: false, classLevels: { "class-vanguard": 7 } }); await spendPool(stranger, "resilience", 6);
  const before = stranger.writes.length;
  await fire("dnd5e.restCompleted", stranger, { type: "long" }, { type: "long" });
  assert.equal(stranger.writes.length, before); assert.equal(getPool(stranger, "resilience").value, 0);
  assert.deepEqual(restTriggers({ type: "long" }), ["lr", "sr"]); assert.deepEqual(restTriggers({ type: "short" }), ["sr"]);
  assert.deepEqual(restTriggers({ type: "short", recoverLongRestUses: true }), ["lr", "sr"]); assert.deepEqual(restTriggers({ type: "other" }), []);
});
test("a player who owns the Actor recovers on their own rest (restCompleted fires only on the resting client)", async () => {
  setup({ user: player });
  definePool({ id: "r", max: 3, recovery: [{ on: "lr" }] }); registerResourcePoolHooks();
  const a = actor(); await spendPool(a, "r", 3);
  await fire("dnd5e.restCompleted", a, { type: "long" }, { type: "long" });
  assert.equal(getPool(a, "r").value, 3);
});

// ---------------------------------------------------------------- GM gate and failure containment
test("only the elected active GM writes from combat hooks: players and non-elected GMs write nothing", async () => {
  for (const [label, user, activeGM] of [["player", player, gm], ["GM who is not the active GM", { id: "gm2", isGM: true }, gm], ["no GM at all", gm, null]]) {
    setup({ user, activeGM }); defineAll(); registerResourcePoolHooks();
    const a = actor(), b = actor(); a.flags.ak5e.liberator = true; a.flags.ak5e.charger = true;
    await refundPool(a, "momentum", 3); const writes = a.writes.length;
    const combat = combatOf([a, b]); combat.go(1, 0);
    await fire("updateCombat", combat, combat.go(1, 1), {});
    await fire("updateCombatant", combat.turns[0], { initiative: 12 }, {});
    await fire("deleteCombat", combat, {});
    assert.equal(a.writes.length, writes, label); assert.equal(b.writes.length, 0, label);
  }
});
test("handlers are additive and contained: never return false, never throw, log failures", async () => {
  setup(); defineAll(); registerResourcePoolHooks();
  const a = actor(); a.flags.ak5e.charger = true; a.blockUpdate = true;
  const combat = combatOf([a]);
  const outcomes = await Promise.all([onUpdateCombatant(combat.turns[0], { initiative: 5 }), onDeleteCombat(combat),
    onUpdateCombat(combat, combat.go(1, 0), {}), onRestCompleted(a, { type: "long" }, { type: "long" })]);
  await flush();
  assert.ok(outcomes.every(o => o !== false));
  assert.ok(consoleErrors.length >= 1 && errors.some(m => /blocked write/.test(m)), "failure is logged and surfaced");
  assert.doesNotThrow(() => onUpdateCombat(null, null)); assert.doesNotThrow(() => onUpdateCombatant(null, null));
  assert.doesNotThrow(() => onDeleteCombat(undefined)); assert.doesNotThrow(() => onRestCompleted(null));
  assert.equal(onUpdateCombat({ started: true, get previous() { throw new Error("boom"); } }, { turn: 1 }, {}), undefined);
  assert.ok(consoleErrors.some(args => /boom/.test(String(args[1]?.message ?? args[0]))), "synchronous handler errors are caught and logged");
  const sameRest = { type: "long" };
  await onRestCompleted(a, sameRest, sameRest); await flush();
  assert.equal(onRestCompleted(a, sameRest, sameRest), undefined, "same rest result object is ignored");
});
test("registration is idempotent: exactly one handler per hook, never at import time", () => {
  setup();
  assert.equal(hooks.size, 0, "importing the module registered nothing");
  assert.equal(registerResourcePoolHooks(), true);
  assert.equal(registerResourcePoolHooks(), false); assert.equal(registerResourcePoolHooks(), false);
  assert.deepEqual([...hooks.keys()].sort(), ["deleteCombat", "dnd5e.restCompleted", "updateCombat", "updateCombatant"]);
  for (const handlers of hooks.values()) assert.equal(handlers.length, 1);
  assert.equal(hooks.get("updateCombat")[0], onUpdateCombat);
});

// ---------------------------------------------------------------- limiter
test("limiterCycle is pure: turn cycle resets at the Actor's own turn (standard-bearer.mjs:45 semantics)", () => {
  const a = { uuid: "A" }, b = { uuid: "B" };
  const at = (round, turn) => ({ uuid: "C", round, turn, started: true, turns: [{ actor: a }, { actor: b }] });
  assert.equal(limiterCycle(at(1, 0), a, "turn"), "C:1");
  assert.equal(limiterCycle(at(1, 1), a, "turn"), "C:1", "still a's cycle during b's turn");
  assert.equal(limiterCycle(at(2, 0), a, "turn"), "C:2");
  assert.equal(limiterCycle(at(1, 0), b, "turn"), "C:0", "before b's first turn: previous cycle");
  assert.equal(limiterCycle(at(1, 1), b, "turn"), "C:1");
  assert.equal(limiterCycle(at(3, 1), a, "round"), "C:r3");
  assert.equal(limiterCycle(at(3, 1), a, "creaturePerTurn"), limiterCycle(at(3, 1), a, "turn"));
  assert.throws(() => limiterCycle(at(1, 0), a, "year"), /scope must be/);
});
test("limiterCycle no-combat fallback (proposed): world-time bucket of 6 s, else the constant 'outOfCombat'", () => {
  const a = { uuid: "A" }, stranger = { uuid: "Z" };
  assert.equal(limiterCycle(null, a, "turn", { worldTime: 100 }), "time:16");
  assert.equal(limiterCycle(null, a, "turn", { worldTime: 105.9 }), "time:17");
  assert.equal(limiterCycle(undefined, a, "round", { worldTime: 106 }), "time:17");
  assert.equal(limiterCycle(null, a, "turn"), "outOfCombat");
  assert.equal(limiterCycle({ uuid: "C", round: 0, turn: null, started: false, turns: [] }, a, "turn"), "outOfCombat", "unstarted combat");
  assert.equal(limiterCycle({ uuid: "C", round: 2, turn: null, started: true, turns: [{ actor: a }] }, a, "turn"), "outOfCombat", "no current turn");
  assert.equal(limiterCycle({ uuid: "C", round: 2, turn: 0, started: true, turns: [{ actor: a }] }, stranger, "turn", { worldTime: 12 }), "time:2", "not a combatant");
  assert.notEqual(limiterCycle(null, a, "turn", { worldTime: 100 }), limiterCycle({ uuid: "C", round: 16, turn: 0, started: true, turns: [{ actor: a }] }, a, "turn"));
});
test("once('turn'): used once per own turn cycle, blocked through others' turns, free again on the next own turn", async () => {
  setup(); defineAll();
  const a = actor(), b = actor(), combat = combatOf([a, b]); globalThis.game.combats = [combat];
  const limiter = once({ scope: "turn", key: "sneak" });
  combat.go(1, 0);
  assert.equal(limiter.check(a), true);
  const writes = a.writes.length; limiter.check(a); assert.equal(a.writes.length, writes, "check() never writes");
  assert.equal(await limiter.mark(a), true);
  assert.equal(limiter.check(a), false);
  assert.equal(await limiter.mark(a), false, "second mark in the same cycle is refused and writes nothing");
  assert.equal(a.writes.length, writes + 1);
  combat.go(1, 1); assert.equal(limiter.check(a), false, "still a's cycle during b's turn");
  combat.go(2, 0); assert.equal(limiter.check(a), true, "a's next own turn");
  assert.equal(await limiter.use(a), true); assert.equal(await limiter.use(a), false);
  assert.equal(limiter.check(b), true, "per-Actor state: b is unaffected");
  assert.deepEqual(Object.keys(a.flags.ak5e.resourcePools), ["_limits"]);
});
test("once('round') is shared across turns and resets on the next round; keys are independent", async () => {
  setup(); const a = actor(), b = actor(), combat = combatOf([a, b]); globalThis.game.combats = [combat];
  const round = once({ scope: "round", key: "reaction" }), other = once({ scope: "round", key: "other" });
  combat.go(1, 0); assert.equal(await round.use(a), true);
  combat.go(1, 1); assert.equal(round.check(a), false); assert.equal(other.check(a), true);
  combat.go(2, 0); assert.equal(round.check(a), true);
});
test("once('creaturePerTurn') tracks creatures separately within a cycle and requires a creature", async () => {
  setup(); const a = actor(), combat = combatOf([a]); globalThis.game.combats = [combat]; combat.go(1, 0);
  const limiter = once({ scope: "creaturePerTurn", key: "mark" });
  assert.throws(() => limiter.check(a), /ctx\.creature/);
  await assert.rejects(limiter.mark(a, {}), /ctx\.creature/);
  assert.equal(await limiter.use(a, { creature: "goblin" }), true);
  assert.equal(await limiter.use(a, { creature: "orc" }), true);
  assert.equal(await limiter.use(a, { creature: "goblin" }), false);
  assert.equal(limiter.check(a, { creature: "orc" }), false); assert.equal(limiter.check(a, { creature: "troll" }), true);
  combat.go(2, 0); assert.equal(limiter.check(a, { creature: "goblin" }), true);
  await limiter.use(a, { creature: "troll" });
  assert.deepEqual(a.flags.ak5e.resourcePools._limits.mark.who, ["troll"], "a new cycle replaces the old creature list");
});
test("once() outside combat: bucketed by world time, so advancing 6 s (or resting) frees it; entering combat starts fresh", async () => {
  setup(); const a = actor(); const limiter = once({ scope: "turn", key: "ooc" });
  assert.equal(await limiter.use(a), true); assert.equal(limiter.check(a), false);
  game.time.worldTime = 101; assert.equal(limiter.check(a), false, "same 6-second bucket (96-101)");
  game.time.worldTime = 102; assert.equal(limiter.check(a), true);
  assert.equal(await limiter.use(a), true);
  const combat = combatOf([a]); game.combats = [combat]; combat.go(1, 0);
  assert.equal(limiter.check(a), true, "combat cycle differs from the world-time cycle");
  game.combats = []; delete game.time; assert.equal(limiter.check(a, {}), true, "no world time: constant 'outOfCombat' bucket differs from the time bucket");
  assert.equal(await limiter.use(a), true); assert.equal(limiter.check(a), false);
  assert.equal(limiter.check(a, { worldTime: 500 }), true, "explicit ctx.worldTime overrides");
  assert.throws(() => once({ scope: "year", key: "k" }), /scope must be/); assert.throws(() => once({ scope: "turn", key: "bad key" }), /limiter key/);
  assert.throws(() => once({ scope: "turn", key: "a.b" }), /limiter key/);
});
test("limiter marks use {diff:false} for token actors and never disturb pool values", async () => {
  setup(); defineAll(); const a = actor({ token: true, classLevels: { "class-vanguard": 1 } });
  await spendPool(a, "resilience", 1);
  await once({ scope: "turn", key: "k" }).mark(a);
  assert.deepEqual(a.writes.at(-1).options, { diff: false });
  assert.equal(getPool(a, "resilience").value, 3);
});

// ---------------------------------------------------------------- B-025 prototype-name ids
test("B-025: pool ids and limiter keys named like Object.prototype members read as fresh, own-property state", async () => {
  setup();
  for (const id of ["constructor", "toString", "hasOwnProperty", "valueOf"]) definePool({ id, max: 3, recovery: [{ on: "lr" }] });
  definePool({ id: "other", max: 2 });
  const a = actor();
  await spendPool(a, "other", 1);                                                  // resourcePools now exists as a plain object
  for (const id of ["constructor", "toString", "hasOwnProperty", "valueOf"]) {
    assert.equal(getPool(a, id).value, 3, `${id} starts fresh at max`);
    assert.equal((await spendPool(a, id, 1)).after, 2, id);
    assert.equal(Object.hasOwn(a.flags.ak5e.resourcePools, id), true, `${id} is stored as an own property`);
    assert.equal((await recoverPool(a, "lr", { poolIds: [id] }))[0].after, 3, id);
  }
  // Simulated inherited members (a polluted or exotic prototype chain) must never be mistaken for stored pool records.
  const inherited = actor();
  inherited.flags.ak5e.resourcePools = Object.create({ constructor: { value: 1 }, toString: { value: 0, receipts: ["lr:1"] } });
  assert.equal(getPool(inherited, "constructor").value, 3, "inherited { value: 1 } is not a stored record");
  assert.equal(getPool(inherited, "toString").value, 3);
  assert.equal((await recoverPool(inherited, "lr", { poolIds: ["toString"], eventKey: "lr:1" }))[0].skipped, undefined, "an inherited receipt list is ignored");
});
test("B-025: a limiter key named 'constructor' / 'toString' is not blocked by inherited members and stores its own mark", async () => {
  setup();
  const a = actor();
  const cycle = limiterCycle(null, a, "turn", { worldTime: 100 });
  a.flags.ak5e.resourcePools = { _limits: Object.create({ constructor: { cycle, who: [] }, toString: { cycle, who: [] } }) };
  for (const key of ["constructor", "toString"]) {
    const limiter = once({ scope: "turn", key });
    assert.equal(limiter.check(a), true, `${key}: an inherited mark does not block`);
    assert.equal(await limiter.use(a), true);
    assert.equal(limiter.check(a), false, `${key}: the real mark now blocks`);
    assert.equal(await limiter.use(a), false);
    assert.equal(Object.hasOwn(a.flags.ak5e.resourcePools._limits, key), true);
  }
  const creature = once({ scope: "creaturePerTurn", key: "valueOf" });
  a.flags.ak5e.resourcePools._limits = Object.create({ valueOf: { cycle, who: ["goblin"] } });
  assert.equal(creature.check(a, { creature: "goblin" }), true);
  assert.equal(await creature.use(a, { creature: "orc" }), true);
  assert.deepEqual(a.flags.ak5e.resourcePools._limits.valueOf.who, ["orc"], "the inherited creature list is not carried into the new mark");
});

// ---------------------------------------------------------------- B-024 corrupt stored values
test("B-024: a corrupt stored value keeps the initial/max fallback but is flagged and warned about once per pool per call", async () => {
  for (const [label, bad] of [["float", 1.5], ["negative", -2], ["string", "3"], ["NaN", NaN], ["null", null], ["boolean", true]]) {
    setup(); defineAll();
    const a = actor({ classLevels: { "class-vanguard": 7 } });                     // Resilience max 6
    a.flags.ak5e.resourcePools = { resilience: { value: bad } };
    assert.deepEqual(getPool(a, "resilience"), { id: "resilience", label: "Resilience", value: 6, max: 6, over: 0, overMax: false, corrupt: true }, label);
    assert.equal(consoleWarnings.length, 0, `${label}: reading never warns or writes`); assert.equal(a.writes.length, 0);
    const spent = await spendPool(a, "resilience", 2);
    assert.equal(spent.before, 6, `${label}: the fallback is still the pre-spend value`); assert.equal(spent.after, 4);
    assert.equal(consoleWarnings.length, 1, `${label}: exactly one warning for the call`);
    assert.equal(consoleWarnings[0][0], "AK5e | Resource pools"); assert.match(consoleWarnings[0][1], /resilience/);
    assert.equal(stateOf(a, "resilience").value, 4, `${label}: the write repaired the stored value`);
    assert.equal(getPool(a, "resilience").corrupt, false);
    await refundPool(a, "resilience", 1); assert.equal(consoleWarnings.length, 1, `${label}: a repaired pool no longer warns`);
  }
});
test("B-024: setPool, refundPool and recoverPool also warn once per corrupt pool per call; other pools do not warn", async () => {
  setup(); defineAll();
  const a = actor({ classLevels: { "class-vanguard": 7 } }); a.flags.ak5e.caster = true;
  a.flags.ak5e.resourcePools = { resilience: { value: -1 }, aggression: { value: 2.5 }, doublecast: { value: 0 } };
  await setPool(a, "resilience", 3);
  assert.equal(consoleWarnings.length, 1);
  a.flags.ak5e.resourcePools.resilience = { value: "x" };
  await refundPool(a, "resilience", 1); assert.equal(consoleWarnings.length, 2);
  a.flags.ak5e.resourcePools.resilience = { value: "x" };
  const results = await recoverPool(a, "lr");                                      // resilience + aggression corrupt, doublecast fine
  assert.equal(consoleWarnings.length, 2 + 2, "one warning each for resilience and aggression");
  assert.deepEqual(consoleWarnings.slice(2).map(w => /resilience|aggression/.exec(w[1])?.[0]).sort(), ["aggression", "resilience"]);
  assert.equal(results.find(r => r.id === "resilience").after, 6);
  assert.equal(stateOf(a, "resilience").value, 6); assert.equal(stateOf(a, "aggression").value, 6);
});
test("B-024: a never-stored (undefined) value and valid values are not corrupt and never warn", async () => {
  setup(); defineAll();
  const a = actor({ classLevels: { "class-vanguard": 7 } });
  assert.equal(getPool(a, "resilience").corrupt, false);
  a.flags.ak5e.resourcePools = { aggression: { last: { op: "x" } } };                // record exists, value never stored
  assert.equal(getPool(a, "aggression").corrupt, false);
  await spendPool(a, "resilience", 1); await recoverPool(a, "lr"); await spendPool(a, "aggression", 1);
  a.flags.ak5e.resourcePools.resilience.value = 0;                                   // zero is valid
  assert.equal(getPool(a, "resilience").corrupt, false); assert.equal(getPool(a, "resilience").value, 0);
  assert.equal(consoleWarnings.length, 0);
});

// ---------------------------------------------------------------- B-022 recovery precedence
test("B-022: the caller's trigger order picks the recovery entry, not the pool's definition order", async () => {
  setup();
  definePool({ id: "srFirst", max: 6, appliesTo: () => true, recovery: [{ on: "sr", amount: 2 }, { on: "lr", amount: "full" }] });
  definePool({ id: "lrFirst", max: 6, appliesTo: () => true, recovery: [{ on: "lr", amount: "full" }, { on: "sr", amount: 2 }] });
  const a = actor();
  await setPool(a, "srFirst", 0); await setPool(a, "lrFirst", 0);
  const longRest = await recoverPool(a, ["lr", "sr"]);
  assert.deepEqual(longRest.map(r => [r.id, r.trigger, r.after]).sort(), [["lrFirst", "lr", 6], ["srFirst", "lr", 6]], "a long rest uses the lr entry whichever is listed first");
  assert.equal(stateOf(a, "srFirst").last.trigger, "lr");
  await setPool(a, "srFirst", 0); await setPool(a, "lrFirst", 0);
  await recoverPool(a, "sr");
  assert.deepEqual([getPool(a, "srFirst").value, getPool(a, "lrFirst").value], [2, 2], "a short rest still uses the sr entry");
  await setPool(a, "srFirst", 0);
  await recoverPool(a, ["sr", "lr"]);
  assert.equal(getPool(a, "srFirst").value, 2, "trigger order is the caller's: sr listed first wins");
});
test("B-022: a failing 'when' on the preferred trigger falls through to the next trigger's entry", async () => {
  setup();
  definePool({ id: "gated", max: 6, appliesTo: () => true, recovery: [{ on: "sr", amount: 2 }, { on: "lr", amount: "full", when: (a, ctx) => ctx.allowed === true }] });
  const a = actor(); await setPool(a, "gated", 0);
  assert.equal((await recoverPool(a, ["lr", "sr"], { context: { allowed: false } }))[0].after, 2, "lr gate closed: sr entry applies");
  assert.equal((await recoverPool(a, ["lr", "sr"], { context: { allowed: true } }))[0].after, 6);
});
test("B-022: a real long rest through the restCompleted hook uses the lr entry of an [sr, lr] pool", async () => {
  setup();
  definePool({ id: "ordered", max: 6, appliesTo: () => true, recovery: [{ on: "sr", amount: 2 }, { on: "lr", amount: "full" }] });
  registerResourcePoolHooks();
  const a = actor(); await setPool(a, "ordered", 0);
  await fire("dnd5e.restCompleted", a, { type: "long" }, { type: "long" });
  assert.equal(getPool(a, "ordered").value, 6);
});

// ---------------------------------------------------------------- B-021 per-kind receipt history
test("B-021: receipts are trimmed per event kind, so turnStart and turnEnd each keep 24 and order is preserved", async () => {
  setup();
  definePool({ id: "busy", max: 99, initial: 0, appliesTo: () => true, recovery: [{ on: "turnStart", amount: 1 }, { on: "turnEnd", amount: 1 }] });
  const a = actor();
  for (let i = 0; i < 30; i++) { await recoverPool(a, "turnStart", { eventKey: `turnStart:cmb:${i}` }); await recoverPool(a, "turnEnd", { eventKey: `turnEnd:cmb:${i}` }); }
  const receipts = stateOf(a, "busy").receipts;
  assert.ok(Array.isArray(receipts) && receipts.every(r => typeof r === "string"), "stored shape stays a string array");
  const starts = receipts.filter(r => r.startsWith("turnStart:")), ends = receipts.filter(r => r.startsWith("turnEnd:"));
  assert.equal(starts.length, 24); assert.equal(ends.length, 24);
  assert.deepEqual(starts, Array.from({ length: 24 }, (_, i) => `turnStart:cmb:${i + 6}`), "the newest 24 of each kind, in order");
  assert.deepEqual(ends, Array.from({ length: 24 }, (_, i) => `turnEnd:cmb:${i + 6}`));
  assert.equal(getPool(a, "busy").value, 60);
  const writes = a.writes.length;
  const replay = await recoverPool(a, "turnStart", { eventKey: "turnStart:cmb:29" });          // recent: still remembered
  assert.equal(replay[0].skipped, "receipt"); assert.equal(a.writes.length, writes);
  assert.equal((await recoverPool(a, "turnEnd", { eventKey: "turnEnd:cmb:6" }))[0].skipped, "receipt", "oldest kept key of its kind");
  const evicted = await recoverPool(a, "turnStart", { eventKey: "turnStart:cmb:0" });           // evicted: regrants
  assert.equal(evicted[0].skipped, undefined); assert.equal(evicted[0].applied, 1); assert.equal(getPool(a, "busy").value, 61);
  assert.equal(stateOf(a, "busy").receipts.filter(r => r.startsWith("turnStart:")).length, 24);
  assert.equal(stateOf(a, "busy").receipts.filter(r => r.startsWith("turnEnd:")).length, 24, "the other kind is untouched");
});
test("B-021: one busy kind cannot evict another kind's history, and keys without ':' form their own kind", async () => {
  setup();
  definePool({ id: "mix", max: 99, initial: 0, appliesTo: () => true, recovery: [{ on: "initiative", amount: 1 }, { on: "turnStart", amount: 1 }, { on: "combatEnd", amount: 1 }] });
  const a = actor();
  await recoverPool(a, "initiative", { eventKey: "initiative:cmb:c0" });
  await recoverPool(a, "combatEnd", { eventKey: "plainkey" });
  for (let i = 0; i < 60; i++) await recoverPool(a, "turnStart", { eventKey: `turnStart:cmb:${i}` });
  assert.ok(stateOf(a, "mix").receipts.includes("initiative:cmb:c0"), "initiative receipt survives 60 turnStart events");
  assert.ok(stateOf(a, "mix").receipts.includes("plainkey"));
  assert.equal((await recoverPool(a, "initiative", { eventKey: "initiative:cmb:c0" }))[0].skipped, "receipt");
  assert.equal(stateOf(a, "mix").receipts.filter(r => r.startsWith("turnStart:")).length, 24);
});

// ---------------------------------------------------------------- B-023 rest dedupe on result only
test("B-023: rest dedupe keys on the result object only: a reused config with fresh results recovers each time", async () => {
  setup();
  definePool({ id: "rest", max: 3, recovery: [{ on: "lr" }] }); registerResourcePoolHooks();
  const a = actor(), config = { type: "long" };
  await setPool(a, "rest", 0);
  await fire("dnd5e.restCompleted", a, { type: "long" }, config);
  assert.equal(getPool(a, "rest").value, 3);
  await spendPool(a, "rest", 3);
  await fire("dnd5e.restCompleted", a, { type: "long" }, config);                  // same config object, a new rest
  assert.equal(getPool(a, "rest").value, 3, "a second rest with a reused config recovers again");
  await spendPool(a, "rest", 2);
  const result = { type: "long" };
  await fire("dnd5e.restCompleted", a, result, config);
  assert.equal(getPool(a, "rest").value, 3);
  await spendPool(a, "rest", 3);
  await fire("dnd5e.restCompleted", a, result, config);                              // same result object: a replay
  assert.equal(getPool(a, "rest").value, 0, "the same result object recovers once");
});
test("B-023: a non-object result is processed without dedupe (config identity is never used)", async () => {
  setup();
  definePool({ id: "rest", max: 3, recovery: [{ on: "lr" }] }); registerResourcePoolHooks();
  const a = actor(), config = { type: "long" };
  for (const result of [undefined, null, "done", 7]) {
    await setPool(a, "rest", 0);
    await fire("dnd5e.restCompleted", a, result, config);
    assert.equal(getPool(a, "rest").value, 3, `result ${String(result)} with a reused config still recovers`);
  }
});
