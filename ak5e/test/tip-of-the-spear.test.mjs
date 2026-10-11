import test from "node:test";
import assert from "node:assert/strict";
import { TIP_INSTRUCTIONS } from "../scripts/standard-bearer-rules.mjs";
import { TIP_OUTCOMES, TIP_VARIANTS, change, speedChanges, attackChanges, useTip, useTipVariant, useTipSP, validateTipTarget,
  tipCount, tipOutcome, tipCritReduction, tipCritThreshold, adjustAttackConfig, agentTip, chargerTip, devastatingBlowTip,
  leadingLanceTip, pioneerTip, tacticianTip } from "../scripts/tip-of-the-spear.mjs";

// Verbatim copies of the pre-extraction helpers from standard-bearer.mjs (L14-17).
const oldChange = (key, value, mode = 2) => ({ key, value: String(value), mode, priority: mode === 5 ? 99 : 20 });
const oldSpeedChanges = (actor, value, mode = 2) => ["walk", "fly", "swim", "climb", "burrow"]
  .filter(key => Number(actor.system?.attributes?.movement?.[key]) > 0).map(key => oldChange(`system.attributes.movement.${key}`, value, mode));
const oldAttackChanges = value => ["mwak", "rwak", "msak", "rsak"].map(type => oldChange(`system.bonuses.${type}.attack`, value));

const bearer = { uuid: "Actor.bearer", system: { attributes: { prof: 6 } } };
const recipient = { uuid: "Actor.ally", system: { attributes: { movement: { walk: 30, fly: 10, swim: 0, climb: 0, burrow: 0 } } } };
const targetToken = { actor: recipient };
const op = { id: "op1" };

function harness(rolls = []) {
  const log = { dice: [], tagged: [], temp: [] };
  const helpers = {
    dice: async (o, key, formula, actor) => { log.dice.push({ key, formula }); return rolls.length ? rolls.shift() : 3; },
    tagged: async (actor, item, targetActor, id, options, metadata) => { log.tagged.push({ actor, item, targetActor, id, options, metadata }); return { id }; },
    temporaryHP: async (targetActor, amount, additive, id, actor) => { log.temp.push({ targetActor, amount, additive, id, actor }); }
  };
  return { log, helpers };
}
const item = { name: "Tip of the Spear" };
const effectFor = (n, extra = {}) => ({
  label: `Tip of the Spear (${n})`, trigger: "turnStart", expiryActor: "source", changes: [], instructions: TIP_INSTRUCTIONS[n - 1], actions: n === 1 ? ["used"] : [], ...extra });

test("change helpers are identical to the former Standard Bearer helpers", () => {
  const movers = [recipient, { system: { attributes: { movement: { walk: 0 } } } }, { system: {} }, { system: { attributes: { movement: { burrow: 5, climb: "20" } } } }];
  for (const actor of movers) for (const [value, mode] of [[10, 2], [-15, 2], [0, 5], [30, 5]]) assert.deepEqual(speedChanges(actor, value, mode), oldSpeedChanges(actor, value, mode));
  assert.deepEqual(attackChanges(2), oldAttackChanges(2));
  assert.deepEqual(change("k", 5), oldChange("k", 5));
  assert.deepEqual(change("k", 5, 5), oldChange("k", 5, 5));
});

test("six outcomes: exact effect options and metadata literals", async () => {
  assert.equal(TIP_OUTCOMES.length, 6);
  const expected = {
    1: { options: effectFor(1, { actions: ["used"] }), metadata: { kind: "tip1", value: 6 } },
    3: { options: effectFor(3, { changes: [
      { key: "system.attributes.movement.walk", value: "10", mode: 2, priority: 20 },
      { key: "system.attributes.movement.fly", value: "10", mode: 2, priority: 20 }] }), metadata: { kind: "tip3", value: 1 } },
    4: { options: effectFor(4, { changes: [
      { key: "system.bonuses.mwak.attack", value: "2", mode: 2, priority: 20 },
      { key: "system.bonuses.rwak.attack", value: "2", mode: 2, priority: 20 },
      { key: "system.bonuses.msak.attack", value: "2", mode: 2, priority: 20 },
      { key: "system.bonuses.rsak.attack", value: "2", mode: 2, priority: 20 }] }), metadata: { kind: "tip4", value: 1 } },
    5: { options: effectFor(5), metadata: { kind: "tip5", value: 1 } },
    6: { options: effectFor(6), metadata: { kind: "tip6", value: 1 } }
  };
  for (const n of [1, 3, 4, 5, 6]) {
    const { log, helpers } = harness();
    await useTip({ actor: bearer, item, target: targetToken, op, directed: true, choice: n, helpers });
    assert.equal(log.tagged.length, 1); assert.equal(log.temp.length, 0); assert.equal(log.dice.length, 0);
    const call = log.tagged[0];
    assert.equal(call.id, `op1:Actor.ally:tip:0`);
    assert.equal(call.item, item); assert.equal(call.actor, bearer); assert.equal(call.targetActor, recipient);
    assert.deepEqual(call.options, expected[n].options);
    assert.deepEqual(call.metadata, expected[n].metadata);
    assert.deepEqual(Object.keys(call.options), ["label", "trigger", "expiryActor", "changes", "instructions", "actions"]);
  }
  // Literal instruction text is pinned so silent edits to the source wording fail here.
  assert.equal(TIP_INSTRUCTIONS[2], "Speed increases by 10 feet.");
  assert.equal(TIP_INSTRUCTIONS[3], "+2 to Attack Rolls.");
  assert.equal(TIP_OUTCOMES[2].instructions, "Speed increases by 10 feet.");
  // Outcome 2: additive 1d6 Temporary HP, no effect.
  const { log, helpers } = harness([4]);
  const result = await useTip({ actor: bearer, item, target: targetToken, op, directed: true, choice: 2, helpers });
  assert.deepEqual(log.dice, [{ key: "op1:Actor.ally:tip:0", formula: "1d6" }]);
  assert.deepEqual(log.temp, [{ targetActor: recipient, amount: 4, additive: true, id: "op1:Actor.ally:tip:0", actor: bearer }]);
  assert.equal(log.tagged.length, 0); assert.equal(result.effect, null); assert.equal(result.outcome, 2);
});

test("outcome 1 value is the bearer Proficiency Bonus and speed skips zero movement types", async () => {
  const strong = { uuid: "Actor.b2", system: { attributes: { prof: 4 } } };
  const { log, helpers } = harness();
  await useTip({ actor: strong, item, target: targetToken, op, directed: true, choice: 1, helpers });
  assert.deepEqual(log.tagged[0].metadata, { kind: "tip1", value: 4 });
  const stuck = { actor: { uuid: "Actor.s", system: { attributes: { movement: { walk: 0 } } } } };
  const h2 = harness();
  await useTip({ actor: bearer, item, target: stuck, op, directed: true, choice: 3, helpers: h2.helpers });
  assert.deepEqual(h2.log.tagged[0].options.changes, []);
});

test("rolled versus directed choice", async () => {
  const rolled = harness([5]);
  const result = await useTip({ actor: bearer, item, target: targetToken, op, index: 1, helpers: rolled.helpers });
  assert.deepEqual(rolled.log.dice, [{ key: "tip:1", formula: "1d6" }]);
  assert.equal(result.outcome, 5); assert.equal(rolled.log.tagged[0].id, "op1:Actor.ally:tip:1");
  // A directed choice never rolls and ignores the dice helper.
  const chosen = harness([1]);
  const result2 = await useTip({ actor: bearer, item, target: targetToken, op, directed: true, choice: "6", helpers: chosen.helpers });
  assert.equal(chosen.log.dice.length, 0); assert.equal(result2.outcome, 6);
});

test("invalid outcomes are rejected with the existing wording", async () => {
  const { helpers, log } = harness();
  const run = (choice, directed = true, rolls) => useTip({ actor: bearer, item, target: targetToken, op, directed, choice, helpers: rolls ? harness(rolls).helpers : helpers });
  await assert.rejects(run(0), /Tip choice must be an integer of at least 1\./);
  await assert.rejects(run(7), /Tip choices range from 1 to 6\./);
  await assert.rejects(run(2.5), /Tip choice must be an integer/);
  await assert.rejects(run(undefined), /Tip choice must be an integer/);
  await assert.rejects(run(undefined, false, [7]), /Tip choices range from 1 to 6\./);
  await assert.rejects(run(undefined, false, [0]), /Tip choices range from 1 to 6\./);
  assert.equal(log.tagged.length + log.temp.length, 0);
  assert.throws(() => tipOutcome(0), /1 to 6/);
  assert.throws(() => tipOutcome(7), /1 to 6/);
  assert.equal(tipOutcome(6).kind, "tip6");
});

test("range: 60 feet boundary, error text, and Infinity (Tactician)", () => {
  const source = { parent: "scene" }, calls = [];
  const within = limit => (scene, origin, token, feet) => { calls.push(feet); return token.d <= limit && feet >= token.d; };
  const helpers = limit => ({ withinFeet: within(limit), tokenPoint: () => "p" });
  assert.equal(validateTipTarget({ source, target: { d: 60 }, helpers: helpers(60) }), true);
  assert.deepEqual(calls, [60]);
  assert.throws(() => validateTipTarget({ source, target: { d: 61 }, helpers: helpers(61) }),
    /^Error: Tip of the Spear requires a visible ally within 60 feet; no planted exception is invented\.$/);
  // Infinity never calls the distance helper.
  calls.length = 0;
  assert.equal(validateTipTarget({ source, target: { d: 99999 }, range: Infinity, helpers: { withinFeet: () => { throw new Error("must not run"); } } }), true);
  assert.equal(validateTipTarget({ source, target: { d: 99999 }, range: Infinity }), true);
  assert.throws(() => validateTipTarget({ source, target: { d: 1 }, range: -5, helpers: helpers(9) }), /positive/);
  assert.throws(() => validateTipTarget({ source, target: { d: 1 }, helpers: {} }), /distance helper/);
  assert.deepEqual(calls, []);
});

test("count, repeat on the same target, and targets semantics", async () => {
  assert.equal(tipCount(2), 2);
  assert.throws(() => tipCount(0), /Tip count/);
  assert.throws(() => tipCount(1.5), /Tip count/);
  // Default is one use, indexed 0 (matches today's single call).
  let h = harness([2, 3]);
  let out = await useTipVariant({ actor: bearer, item, target: targetToken, op, helpers: h.helpers });
  assert.equal(out.length, 1); assert.deepEqual(h.log.dice.map(d => d.key), ["tip:0", "op1:Actor.ally:tip:0"]);
  // Last Stand: second call with index 1 on the same target.
  h = harness([3, 3]);
  out = await useTipVariant({ actor: bearer, item, target: targetToken, op, repeatOnSameTarget: true, helpers: h.helpers });
  assert.deepEqual(h.log.tagged.map(t => t.id), ["op1:Actor.ally:tip:0", "op1:Actor.ally:tip:1"]);
  assert.deepEqual(h.log.dice.map(d => d.key), ["tip:0", "tip:1"]);
  // Leading Lance: twice, same target by default; with repeat, four sequential uses.
  h = harness([3, 4]);
  await leadingLanceTip({ actor: bearer, item, target: targetToken, op, helpers: h.helpers });
  assert.deepEqual(h.log.tagged.map(t => t.id), ["op1:Actor.ally:tip:0", "op1:Actor.ally:tip:1"]);
  h = harness([3, 3, 3, 3]);
  out = await leadingLanceTip({ actor: bearer, item, target: targetToken, op, repeatOnSameTarget: true, helpers: h.helpers });
  assert.deepEqual(out.map(r => r.id.at(-1)), ["0", "1", "2", "3"]);
  // Distinct targets for the two Leading Lance uses; count must match.
  const other = { actor: { uuid: "Actor.other", system: {} } };
  h = harness([3, 3]);
  await leadingLanceTip({ actor: bearer, item, targets: [targetToken, other], op, helpers: h.helpers });
  assert.deepEqual(h.log.tagged.map(t => t.id), ["op1:Actor.ally:tip:0", "op1:Actor.other:tip:1"]);
  await assert.rejects(leadingLanceTip({ actor: bearer, item, targets: [targetToken], op, helpers: harness().helpers }), /Tip count must equal/);
  // Pioneer: caller-supplied count only.
  h = harness([3, 3, 3]);
  out = await pioneerTip({ actor: bearer, item, target: targetToken, op, count: 3, helpers: h.helpers });
  assert.equal(out.length, 3);
  await assert.rejects(pioneerTip({ actor: bearer, item, target: targetToken, op, count: 0, helpers: harness().helpers }), /Tip count/);
  // Directed choices: scalar reused, array indexed per use.
  h = harness();
  await useTipVariant({ actor: bearer, item, target: targetToken, op, directed: true, choice: [5, 6], count: 2, helpers: h.helpers });
  assert.deepEqual(h.log.tagged.map(t => t.metadata.kind), ["tip5", "tip6"]);
  h = harness();
  await useTipVariant({ actor: bearer, item, target: targetToken, op, directed: true, choice: 5, repeatOnSameTarget: true, helpers: h.helpers });
  assert.deepEqual(h.log.tagged.map(t => t.metadata.kind), ["tip5", "tip5"]);
  await assert.rejects(useTipVariant({ actor: bearer, item, op, helpers: harness().helpers }), /Choose a creature/);
});

test("named entries: range validation, Tactician Infinity, and default 60", async () => {
  const source = { parent: "scene" }, far = { actor: recipient, d: 500 }, near = { actor: recipient, d: 40 };
  const helpersFor = h => ({ ...h.helpers, withinFeet: (scene, origin, token, feet) => token.d <= feet, tokenPoint: () => "p" });
  let h = harness([3]);
  await tacticianTip({ actor: bearer, item, source, target: far, op, helpers: helpersFor(h) });
  assert.equal(h.log.tagged.length, 1);
  for (const run of [agentTip, chargerTip, devastatingBlowTip]) {
    h = harness([3]);
    await assert.rejects(run({ actor: bearer, item, source, target: far, op, helpers: helpersFor(h) }), /within 60 feet/);
    assert.equal(h.log.tagged.length, 0);
    h = harness([3]);
    assert.equal((await run({ actor: bearer, item, source, target: near, op, helpers: helpersFor(h) })).length, 1);
  }
  // Without `source`, nothing is validated (existing command validates before calling).
  h = harness([3]);
  await agentTip({ actor: bearer, item, target: far, op, helpers: helpersFor(h) });
  assert.equal(h.log.tagged.length, 1);
  assert.equal(TIP_VARIANTS.tactician.range, Infinity);
  assert.equal(TIP_VARIANTS.leadingLance.count, 2);
  for (const v of Object.values(TIP_VARIANTS)) assert.ok(v.manual.length > 0 && /^L\d+/.test(v.source));
  assert.ok(TIP_VARIANTS.agent.manual.some(m => /Invisible/.test(m)));
  assert.ok(TIP_VARIANTS.tactician.manual.some(m => /4th Level/.test(m)));
});

const effect = (kind, disabled = false) => ({ disabled, flags: { ak5e: { standardBenefit: { kind } } } });
const withEffects = (...effects) => ({ effects: new Map(effects.map((e, i) => [`e${i}`, e])) });

test("Tip SP: needs active tip6 effects and multiplies by their count", async () => {
  const grants = [];
  const grantSP = async (...args) => { grants.push(args); };
  const args = (target, amount) => ({ target, amount, op, grantSP, actor: bearer });
  await assert.rejects(useTipSP(args(withEffects(), 2)), /The recipient has no active Tip SP benefit\./);
  await assert.rejects(useTipSP(args(withEffects(effect("tip6", true), effect("tip5")), 2)), /no active Tip SP benefit/);
  assert.equal(grants.length, 0);
  const one = withEffects(effect("tip6"), effect("tip5"));
  await useTipSP(args(one, 3));
  const two = withEffects(effect("tip6"), effect("tip6"), effect("tip6", true));
  await useTipSP(args(two, 3));
  assert.deepEqual(grants[0], [one, 3, "op1", "Tip of the Spear: confirmed extra SP for qualifying gains", false, bearer]);
  assert.deepEqual(grants[1], [two, 6, "op1", "Tip of the Spear: confirmed extra SP for qualifying gains", false, bearer]);
  await assert.rejects(useTipSP(args(one, 0)), /Qualifying points must be an integer of at least 1\./);
  await assert.rejects(useTipSP(args(one, "x")), /Qualifying points/);
  assert.equal(grants.length, 2);
});

test("critical threshold: 0/1/2 effects and the minimum-1 clamp", () => {
  const none = withEffects(effect("tip4")), one = withEffects(effect("tip5")), two = withEffects(effect("tip5"), effect("tip5"), effect("tip5", true));
  assert.deepEqual([none, one, two].map(tipCritReduction), [0, 1, 2]);
  assert.deepEqual([none, one, two].map(a => tipCritThreshold(a)), [20, 19, 18]);
  assert.equal(tipCritThreshold(two, 2), 1);
  assert.equal(tipCritThreshold(two, 1), 1);
  assert.equal(tipCritThreshold({}, 19), 19);

  const config = actor => ({ subject: { actor }, rolls: [{ options: { criticalSuccess: 19 } }, { options: {} }, {}] });
  let c = adjustAttackConfig(config(none));
  assert.deepEqual(c.rolls, [{ options: { criticalSuccess: 19 } }, { options: {} }, {}]);
  c = adjustAttackConfig(config(one));
  assert.deepEqual(c.rolls, [{ options: { criticalSuccess: 18 } }, { options: { criticalSuccess: 19 } }, { options: { criticalSuccess: 19 } }]);
  c = adjustAttackConfig(config(two));
  assert.deepEqual(c.rolls.map(r => r.options.criticalSuccess), [17, 18, 18]);
  const low = { subject: { actor: two }, rolls: [{ options: { criticalSuccess: 2 } }, { options: { criticalSuccess: 1 } }] };
  assert.deepEqual(adjustAttackConfig(low).rolls.map(r => r.options.criticalSuccess), [1, 1]);
  // Subject may be the actor itself; missing rolls and missing actor are safe.
  assert.doesNotThrow(() => adjustAttackConfig({ subject: one }));
  assert.doesNotThrow(() => adjustAttackConfig({ rolls: [{}] }));
  assert.deepEqual(adjustAttackConfig({ rolls: [{}] }).rolls, [{}]);
  const direct = adjustAttackConfig({ subject: one, rolls: [{}] });
  assert.equal(direct.rolls[0].options.criticalSuccess, 19);
});

test("tip numbers and source constants are untouched", () => {
  assert.deepEqual(TIP_OUTCOMES.map(o => o.id), ["tip1", "tip2", "tip3", "tip4", "tip5", "tip6"]);
  assert.deepEqual(TIP_OUTCOMES.map(o => o.label), [1, 2, 3, 4, 5, 6].map(n => `Tip of the Spear (${n})`));
  assert.deepEqual(TIP_OUTCOMES.map(o => o.instructions), TIP_INSTRUCTIONS);
  assert.deepEqual(TIP_OUTCOMES[1].temporaryHP, { formula: "1d6", additive: true });
  assert.deepEqual(TIP_OUTCOMES.map(o => o.actions), [["used"], [], [], [], [], []]);
  assert.ok(TIP_OUTCOMES.every(o => o.trigger === "turnStart" && o.expiryActor === "source"));
  assert.ok(Object.isFrozen(TIP_OUTCOMES) && Object.isFrozen(TIP_OUTCOMES[0]));
});
