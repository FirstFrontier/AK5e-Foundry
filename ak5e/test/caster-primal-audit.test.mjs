/**
 * WP caster-c6-primal — regression audit tests (tester draft, POST-CANDIDATE).
 *
 * *** POST-CANDIDATE DRAFT — READ FIRST ***
 * The brief listed this path as a frozen (spec-first, tests-before-code) file, but it never
 * existed and the candidate ak5e/scripts/caster-primal.mjs already shipped in the lane. A true
 * red-first pass is therefore impossible for this file: expectations below were re-derived from
 * the sources listed here, and the candidate was read ONLY for interface names and signatures
 * (primalRest / primalChildApplied / PRIMAL_POOL_ID, the casterRest wiring, and the
 * casterPrimal effect flag shape used by the splash engine). No production logic was copied
 * into an expectation. Every case is reported honestly GREEN/RED against the unchanged
 * candidate in the tester's completion report.
 *
 * Drafted 2026-11-04 by `adversary` ONLY from:
 * - AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt C3:725-812 (Primal):
 *   Residual Suffering 729-750 (12-row Damage Type -> Condition table 733-746, no Poison row,
 *   "no Action required", uses = "twice your Proficiency Bonus", "regain all expended uses
 *   upon finishing a Long Rest" 750); Debilitate and Destroy 755-761 (1/2/3d8 at 3/7/14, once
 *   per Creature per Turn); Elemental Burst 764-771 (Bonus Action, 20-ft-radius Sphere within
 *   100 ft, Dex save vs Spell Save DC, once per Short Rest); Enduring Affliction 782-794
 *   (Charmed -> Speed 0 is the only unambiguous native change); Cardinal Punishment 799-801
 *   (Burst DC +5, Residual on successful save).
 * - BRIEF-caster-c6-primal-IMPL.md §3 (spec) and §4 (acceptance criteria 1 and 6 are the ones
 *   this module owns: "Table, uses, Long Rest restore, confirm, no Poison" and
 *   "parent undo previews and removes child applications without erasing unrelated conditions").
 * - WORKFLOW.md §3.2 (trust the table: unowned-target changes relay through the GM client;
 *   every change undoable within the encounter window).
 * - ak5e/CASTER_IMPLEMENTATION.md Primal rows (per the brief's read-only references).
 *
 * Scope discipline: caster-primal.mjs owns exactly two behaviours — `primalRest` (the Long
 * Rest recovery of the 2 x PB Residual Suffering pool, C3:750) and `primalChildApplied`
 * (recognising a Condition the GM's client applied to an unowned target by the receipt's
 * operation id + caster uuid, so parent undo/preview sees it, C3:755-757 undo posture). The
 * rest of the package (activity types, expiry, Debilitate dice, Burst shape, overlay scoping,
 * manual boundaries) lives behind the shared splash engine and UI and is covered by the
 * combined attack file owned by another tester this round — deliberately NOT duplicated here.
 *
 * Tags on every test:
 * - [E] Existing behaviour frozen as a regression guard (must stay green through C6 and after).
 * - [R] Regression pin on the two candidate-owned mechanisms (green against the shipped
 *       candidate by construction of this post-candidate draft; RED here names a real defect).
 * - [M] Manual boundary / required disclosure.
 *
 * Criterion -> test map:
 *  AC1 table/uses/LR restore/no Poison ...
 *    primal-0  clean child process: pool absent -> primalRest returns [] and writes nothing
 *              (the candidate's getPoolDefinition guard; never throws on a half-loaded world)
 *    primal-1  pool defined with recovery [{on:"lr", amount:"toInitial"}], initial "max",
 *              primal-branch appliesTo (brief §3: "registered with recovery lr toInitial")
 *    primal-2  Long Rest restores all expended uses to exactly 2 x PB (C3:750), PB 2 -> 4,
 *              PB 3 -> 6
 *    primal-3  Short Rest (and any other type) never restores Residual uses (C3:750 names
 *              only the Long Rest; the Short Rest line belongs to Elemental Burst, C3:771)
 *    primal-4  branch gate: core/mystic casters get [] and no write (C3:729 feature is Primal-only)
 *    primal-5  null/undefined actor is a no-op, never throws (no Action, no crash on bad input)
 *    primal-6  already-full pool: LR never over-writes 2 x PB (no overMax drift)
 *    primal-7  end-to-end: the caster rest handler restores Primal uses via primalRest
 *              (brief §1 "Long Rest restores 2xPB uses"; WORKFLOW §3.2 undoable-state hygiene)
 *    primal-8  [E] 12-row damage table exact, no Poison row (C3:733-746)
 *  AC6 parent undo child cleanup ...
 *    primal-9  applied/relayed receipt entries recognised directly
 *    primal-10 GM-client-applied Condition on the target recognised by opId + casterUuid
 *              (the fix this package delivers; C3:755-757 undo posture + WORKFLOW §3.2 relay)
 *    primal-11 exact selection: other opId / other caster / unrelated effects NOT recognised
 *              ("without erasing unrelated conditions")
 *    primal-12 entry-shape and missing-argument gates; unresolvable target uuid is false, not
 *              a crash; Map and array effect collections both handled
 *
 * Assumptions (the manager may reject; none changes an expected AK5e outcome):
 * - The residualSuffering pool definition itself is owned by the shared splash engine
 *   (registerPrimalSplash); primalRest is judged on running the recovery, per brief §1.
 * - "2 x PB" is pinned behaviourally via the pool's max at prof 2 and 3, not by reading the
 *   formula string out of the frozen definition object.
 * - The casterPrimal effect flag carries {opId, casterUuid} as the splash engine's own
 *   apply/undo paths (lines writing "flags.ak5e.casterPrimal") already exchange it; the brief's
 *   frozen surface requires primalChildApplied to agree with that shape, so tests build it here.
 * - primalRest's unregistered-pool guard is exercised in a CLEAN CHILD PROCESS: importing the
 *   caster chain self-registers the pool by design (caster-features.mjs:41, the documented
 *   `registerPrimalSplash(); registerChain(); ...` pattern noted at caster-mystic.mjs:266), so
 *   an in-process file could never observe the absent-pool path. primal-0 imports ONLY
 *   caster-primal.mjs in the child, which is the composition where the guard matters.
 * - primal-7 exercises the public casterRest entry point because brief §1 makes Long Rest
 *   restore observable "through the rest handler"; if the harness chain (baseRest) rejects a
 *   fixture it will be reported, not worked around by skipping.
 * - Sequential in-file order is relied on for the registration-state tests; node:test default
 *   concurrency in a single file is 1.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { primalRest, primalChildApplied, PRIMAL_POOL_ID } from "../scripts/caster-primal.mjs";
import { registerPrimalSplash, PRIMAL_CONDITIONS } from "../scripts/caster-primal-splash.mjs";
import { getPoolDefinition, getPool, setPool } from "../scripts/resource-pools.mjs";
import { casterRest, registerCasterFeatureHooks } from "../scripts/caster-features.mjs";

const storage = {};

// ---------- harness (conventions from the caster-mystic-audit draft, trimmed) ----------
function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = structuredClone(value);
}
const getFlag = function (scope, key) { return this.flags?.[scope]?.[key]; };
function actorDoc(uuid, { owner = true } = {}) {
  return { id: uuid.split(".").at(-1), uuid, documentName: "Actor", type: "npc", name: uuid.split(".").at(-1), isOwner: owner,
    flags: { ak5e: {} }, system: { attributes: { hp: { value: 30, max: 30, temp: 0 } } }, items: new Map(), effects: new Map(), writes: [], getFlag,
    async update(changes) { this.writes.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; } };
}
function world() {
  const documents = new Map();
  globalThis.game = { user: { id: "gm", isGM: true, targets: new Set() }, combat: {
      started: true, uuid: "Combat.c", id: "c", round: 1, turn: 0, combatant: { id: "c1", actor: { uuid: "Actor.caster" } },
      turns: [{ id: "c1", actor: { uuid: "Actor.caster" } }, { id: "c2", actor: { uuid: "Actor.target" } }] },
    time: { worldTime: 0 }, settings: { get: (_m, key) => storage[key] ?? false }, actors: documents, scenes: new Map(), messages: [],
    users: new Map([["gm", { isGM: true }], ["player", { isGM: false }]]), i18n: { localize: key => key } };
  storage.encounterEpoch = 0;
  globalThis.fromUuidSync = uuid => documents.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => documents.get(uuid) ?? null;
  globalThis.foundry = { utils: { randomID: () => Math.random().toString(36).slice(2, 10) } };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), async create(data) { game.messages.push(data); return data; } } };
  globalThis.Roll = class { constructor(formula) { this.formula = formula; this.total = 8; } async evaluate() { return this; } async toMessage() {} };
  globalThis.Hooks = { on() {}, once() {} };
  globalThis.CONFIG = { DND5E: { activityTypes: {} }, statusEffects: Object.values(PRIMAL_CONDITIONS).map(id => ({ id, name: id, img: `${id}.svg` })) };
  registerCasterFeatureHooks();
  return { documents };
}
/** A caster Actor on the given branch, given Proficiency Bonus and given stored residual uses. */
function casterDoc({ branch = "primal", level = 6, poolValue } = {}) {
  const actor = actorDoc("Actor.caster");
  Object.assign(actor, { type: "character", name: "Caster" });
  actor.flags.ak5e = { casting: { enabled: true, ability: "int", recovery: "long" }, artsPoints: { maximum: 35, value: 20, maximumArtLevel: 9 },
    caster: { version: 1, enabled: true, choices: {}, pools: [], operations: [], casts: [], spends: [], rulings: {}, uses: {}, turn: {}, drones: [] } };
  if (poolValue !== undefined) actor.flags.ak5e.resourcePools = { [PRIMAL_POOL_ID]: { value: poolValue } };
  actor.system.abilities = { int: { value: 16, mod: 3 }, dex: { value: 10, mod: 0 } };
  actor.system.attributes = { ...actor.system.attributes,
    prof: level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2, spell: { dc: 13 }, hp: { value: 30, max: 30, temp: 0 } };
  actor.system.currency = { cp: 0 };
  actor.getActiveTokens = () => []; actor.getRollData = () => ({});
  const add = (id, type, flags, system = {}) => actor.items.set(id, { id, type, name: id, system, flags: { ak5e: flags }, parent: actor, uuid: `Actor.caster.Item.${id}`, getFlag });
  add("class", "class", { chapterThreeId: "class-caster" }, { levels: level });
  add("branch", "subclass", { chapterThreeId: `subclass-caster-${branch}` });
  return actor;
}
function ensureRegistered() {
  world();
  if (!getPoolDefinition(PRIMAL_POOL_ID)) registerPrimalSplash();
}
const poolValue = actor => actor.flags.ak5e?.resourcePools?.[PRIMAL_POOL_ID]?.value;
/** One primal caster with N uses already expended, pool registered, world live. */
async function spentPrimal({ branch = "primal", level = 6, left = 1 } = {}) {
  ensureRegistered();
  const actor = casterDoc({ branch, level });
  await setPool(actor, PRIMAL_POOL_ID, left, { reason: "test spend" });
  return actor;
}
/** A target carrying one Primal-origin ActiveEffect as the GM client's client writes it. */
function targetWithEffect({ opId, casterUuid, extraEffects = [] } = {}) {
  const target = actorDoc("Actor.target", { owner: false });
  const effects = [{ id: "e-primal", flags: { ak5e: { casterPrimal: { opId, casterUuid, status: "ak5e-burning", origin: "primal" } } }, getFlag },
    ...extraEffects.map((entry, i) => ({ id: `e-x${i}`, ...entry, getFlag }))];
  for (const effect of effects) target.effects.set(effect.id, effect);
  return target;
}
const RECEIPT = { id: "use-c6-1", title: "Residual Suffering", status: "applied" };
const CHILD_ENTRY = { kind: "condition", status: "ak5e-burning", name: "Burning", uuid: "Actor.target" };

// ---------- AC1: pool registration, 2 x PB uses, Long Rest restore ----------

test("primal-0 [E] with the residualSuffering pool absent, primalRest returns [] and performs no write instead of throwing (C3:729-750 is a branch Feature; the candidate guards on getPoolDefinition; the pool registers only through the caster chain, so this runs in a clean child process)", () => {
  const candidate = new URL("../scripts/caster-primal.mjs", import.meta.url).href;
  const poolsUrl = new URL("../scripts/resource-pools.mjs", import.meta.url).href;
  const child = [
    `import { primalRest } from ${JSON.stringify(candidate)};`,
    `import { getPoolDefinition } from ${JSON.stringify(poolsUrl)};`,
    `const getFlag = function (scope, key) { return this.flags?.[scope]?.[key]; };`,
    `const actor = { uuid: "Actor.caster", type: "character", items: new Map([["b", { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-caster-primal" } }, getFlag }]]), flags: { ak5e: {} }, getFlag };`,
    `const registered = Boolean(getPoolDefinition("residualSuffering"));`,
    `const result = await primalRest(actor, "long");`,
    `process.stdout.write(JSON.stringify({ registered, result, flags: actor.flags }));`,
  ].join("\n");
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", child], { encoding: "utf8" });
  assert.equal(run.status, 0, `clean-process guard run must not throw; stderr: ${run.stderr}`);
  const out = JSON.parse(run.stdout);
  assert.equal(out.registered, false, "the child genuinely sees no registered pool");
  assert.deepEqual(out.result, [], "an unregistered pool recovers nothing instead of crashing");
  assert.deepEqual(out.flags, { ak5e: {} }, "no pool state is fabricated when the pool is absent");
});

test("primal-1 [E] registerPrimalSplash defines residualSuffering with Long Rest toInitial recovery, initial at max, Primal-branch appliesTo (brief §3: 'recovery: [{ on: \"lr\", amount: \"toInitial\" }]')", () => {
  ensureRegistered();
  const def = getPoolDefinition(PRIMAL_POOL_ID);
  assert.ok(def, "the pool definition exists after registration");
  assert.equal(def.initial, "max", "initial equals max so 'toInitial' restores the full allowance");
  assert.equal(def.max.kind, "formula", "the allowance is level/PB-derived, not a flat integer");
  assert.equal(def.max.formula.source, "2 * @prof", "uses equal twice the Proficiency Bonus (C3:750)");
  assert.deepEqual(def.max.formula.variables, ["prof"], "the formula reads only the Proficiency Bonus");
  assert.equal(def.recovery.length, 1, "exactly one recovery entry");
  assert.equal(def.recovery[0].on, "lr", "the recovery trigger is the Long Rest (C3:750)");
  assert.equal(def.recovery[0].amount, "toInitial", "regain ALL expended uses (C3:750), not a fixed +n");
  assert.equal(def.appliesTo(casterDoc({ branch: "primal" })), true, "the pool belongs to Primal casters");
  assert.equal(def.appliesTo(casterDoc({ branch: "core" })), false, "not to Core casters (C3:729)");
});

test("primal-2 [R] a Long Rest restores every expended Residual Suffering use to exactly 2 x Proficiency Bonus (C3:750)", async () => {
  const pb3 = await spentPrimal({ level: 6, left: 1 }); // prof 3 -> allowance 6
  const results = await primalRest(pb3, "long");
  assert.equal(Array.isArray(results), true, "primalRest returns the recovery results");
  const entry = results.find(r => r.id === PRIMAL_POOL_ID);
  assert.ok(entry, "the residual pool participates in the lr recovery call");
  assert.equal(entry.trigger, "lr", "recovered on the Long Rest trigger");
  assert.equal(entry.after, 6, "2 x PB = 6 at proficiency 3 (C3:750)");
  assert.equal(entry.applied, 5, "all 5 expended uses come back");
  assert.equal(poolValue(pb3), 6, "the Actor now stores 6 uses");

  const pb2 = await spentPrimal({ level: 4, left: 0 }); // prof 2 -> allowance 4
  await primalRest(pb2, "long");
  assert.equal(poolValue(pb2), 4, "2 x PB = 4 at proficiency 2 (C3:750)");
  assert.equal(getPool(pb2, PRIMAL_POOL_ID).max, 4, "the allowance itself is 2 x PB, not a flat number");
});

test("primal-3 [E] a Short Rest (or any other rest type) never restores Residual Suffering uses (C3:750 names only the Long Rest; the Short Rest line belongs to Elemental Burst, C3:771)", async () => {
  const actor = await spentPrimal({ level: 9, left: 2 });
  assert.deepEqual(await primalRest(actor, "short"), [], "short rest is not the registered trigger");
  assert.deepEqual(await primalRest(actor, undefined), [], "no type is not a Long Rest");
  assert.deepEqual(await primalRest(actor, "none"), [], "an unknown type is not a Long Rest");
  assert.equal(poolValue(actor), 2, "the spent uses are untouched by non-Long-Rest calls");
});

test("primal-4 [E] the branch gate: a Core or Mystic caster's Long Rest call recovers nothing through this Feature and writes nothing (C3:729 'As a Primal Caster...')", async () => {
  for (const branch of ["core", "mystic"]) {
    const actor = await spentPrimal({ branch, level: 6, left: 1 });
    const writesBefore = actor.writes.length;
    assert.deepEqual(await primalRest(actor, "long"), [], `${branch} branch returns no recovery results`);
    assert.equal(poolValue(actor), 1, `${branch} branch leaves stored uses unchanged (no cross-branch restore)`);
    assert.equal(actor.writes.length, writesBefore, `${branch} branch performs no Actor update`);
  }
});

test("primal-5 [E] a missing Actor is a safe no-op (C3:731 is player-triggered 'may cause'; the rest handler must not crash on bad input)", async () => {
  ensureRegistered();
  assert.deepEqual(await primalRest(null, "long"), [], "null actor -> []");
  assert.deepEqual(await primalRest(undefined, "long"), [], "undefined actor -> []");
});

test("primal-6 [E] Long Rest replay at full uses never writes more than 2 x PB (no overMax drift; C3:750 restores expended uses, it does not grant extras)", async () => {
  const actor = await spentPrimal({ level: 6, left: 6 }); // already full
  const results = await primalRest(actor, "long");
  const entry = results.find(r => r.id === PRIMAL_POOL_ID);
  assert.equal(entry.after, 6, "after equals the 2 x PB allowance");
  assert.equal(entry.applied, 0, "nothing is added on top of a full pool");
  assert.equal(getPool(actor, PRIMAL_POOL_ID).over, 0, "no over-maximum value appears");
});

test("primal-7 [R] end-to-end through the rest handler: casterRest('long') restores the Primal pool; casterRest('short') does not (brief §1 'Long Rest restores 2xPB uses'; WORKFLOW §3.2 undoable-state hygiene)", async () => {
  const actor = await spentPrimal({ level: 6, left: 1 });
  await casterRest(actor, "short");
  assert.equal(poolValue(actor), 1, "a Short Rest keeps the expended Residual uses (C3:771 scope)");
  await casterRest(actor, "long");
  assert.equal(poolValue(actor), 6, "the Long Rest path actually runs the lr recovery (C3:750)");
});

test("primal-8 [E] the Residual Suffering table is exactly the 12 printed rows and has no Poison row (C3:733-746; brief §3 'no Poison row')", () => {
  assert.deepEqual(Object.keys(PRIMAL_CONDITIONS).slice().sort(),
    ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "psychic", "radiant", "slashing", "thunder"],
    "exactly 12 damage types (C3:733-746)");
  assert.equal(Object.hasOwn(PRIMAL_CONDITIONS, "poison"), false, "no Poison row exists (C3:733-746 omits it)");
  assert.equal(PRIMAL_CONDITIONS.acid, "ak5e-corroded");
  assert.equal(PRIMAL_CONDITIONS.bludgeoning, "frightened");
  assert.equal(PRIMAL_CONDITIONS.cold, "ak5e-frozen");
  assert.equal(PRIMAL_CONDITIONS.fire, "ak5e-burning");
  assert.equal(PRIMAL_CONDITIONS.force, "blinded");
  assert.equal(PRIMAL_CONDITIONS.lightning, "ak5e-nervous-impairment");
  assert.equal(PRIMAL_CONDITIONS.necrotic, "ak5e-necrotised");
  assert.equal(PRIMAL_CONDITIONS.piercing, "ak5e-bleeding");
  assert.equal(PRIMAL_CONDITIONS.psychic, "charmed");
  assert.equal(PRIMAL_CONDITIONS.radiant, "blinded");
  assert.equal(PRIMAL_CONDITIONS.slashing, "ak5e-bleeding");
  assert.equal(PRIMAL_CONDITIONS.thunder, "frightened");
});

// ---------- AC6: parent-undo recognition of relayed/GM-applied child effects ----------

test("primal-9 [E] a receipt entry the engine already marked applied or relayed is recognised directly (WORKFLOW §3.2: unowned changes go through the GM client)", () => {
  ensureRegistered();
  const actor = casterDoc({});
  assert.equal(primalChildApplied(actor, RECEIPT, { ...CHILD_ENTRY, applied: true }), true, "applied marker");
  assert.equal(primalChildApplied(actor, RECEIPT, { ...CHILD_ENTRY, relayed: true }), true, "relayed marker");
  assert.equal(primalChildApplied(actor, RECEIPT, { kind: "damage", relayed: true }), true, "relay marker needs no target lookup");
});

test("primal-10 [R] a Condition the GM's client applied to the target is recognised by the receipt's operation id + caster uuid, so parent undo/preview sees it (C3:755-757 undo posture; WORKFLOW §3.2; the fix this package delivers)", () => {
  const { documents } = ensureRegisteredWorld();
  const actor = casterDoc({});
  documents.set(actor.uuid, actor);
  documents.set("Actor.target", targetWithEffect({ opId: RECEIPT.id, casterUuid: actor.uuid }));
  assert.equal(primalChildApplied(actor, RECEIPT, CHILD_ENTRY), true,
    "no entry.applied flag, yet the child effect IS on the target: undo must recognise it");
});

test("primal-11 [R] exact selection: a different opId, a different caster, or an unrelated effect is NOT recognised — parent undo removes exactly its own child, never a neighbour's Conditions (brief §3 'without erasing unrelated conditions')", () => {
  const { documents } = ensureRegisteredWorld();
  const actor = casterDoc({});
  documents.set(actor.uuid, actor);

  const foreignOp = targetWithEffect({ opId: "some-other-use", casterUuid: actor.uuid });
  documents.set("Actor.target", foreignOp);
  assert.equal(primalChildApplied(actor, RECEIPT, CHILD_ENTRY), false, "same caster, different operation -> not this receipt's child");

  const foreignCaster = targetWithEffect({ opId: RECEIPT.id, casterUuid: "Actor.somethingElse" });
  documents.set("Actor.target", foreignCaster);
  assert.equal(primalChildApplied(actor, RECEIPT, CHILD_ENTRY), false, "same opId but another caster's effect -> not this receipt's child");

  const unrelated = targetWithEffect({ opId: RECEIPT.id, casterUuid: actor.uuid,
    extraEffects: [{ flags: { ak5e: { concent: { source: "Actor.target" } } } }, { flags: {} }] });
  documents.set("Actor.target", unrelated);
  assert.equal(primalChildApplied(actor, RECEIPT, CHILD_ENTRY), true, "the matching child is still found among unrelated effects");
  assert.equal(primalChildApplied({ uuid: "Actor.otherCaster", items: new Map(), flags: {}, getFlag }, RECEIPT, CHILD_ENTRY), false,
    "a different caster's own undo does not claim this effect (casterUuid is checked)");

  const onlyStranger = actorDoc("Actor.target", { owner: false });
  onlyStranger.effects.set("e1", { id: "e1", flags: { ak5e: { casterPrimal: { opId: "unrelated-use", casterUuid: "Actor.other" } } }, getFlag });
  documents.set("Actor.target", onlyStranger);
  assert.equal(primalChildApplied(actor, RECEIPT, CHILD_ENTRY), false, "a neighbour's Primal effect alone is not recognised");
});

test("primal-12 [E] input hygiene: non-condition entries, missing status, absent arguments and unresolvable targets all read as false without throwing", () => {
  const { documents } = ensureRegisteredWorld();
  const actor = casterDoc({});
  documents.set(actor.uuid, actor);
  assert.equal(primalChildApplied(null, RECEIPT, CHILD_ENTRY), false, "no actor");
  assert.equal(primalChildApplied(actor, null, CHILD_ENTRY), false, "no receipt");
  assert.equal(primalChildApplied(actor, RECEIPT, null), false, "no entry");
  assert.equal(primalChildApplied(actor, RECEIPT, { kind: "damage", status: "ak5e-burning", uuid: "Actor.target" }), false,
    "damage entries are not child Condition applications");
  assert.equal(primalChildApplied(actor, RECEIPT, { kind: "condition", uuid: "Actor.target" }), false,
    "an entry without a status has nothing to match");

  documents.set("Actor.target", targetWithEffect({ opId: RECEIPT.id, casterUuid: actor.uuid }));
  assert.equal(primalChildApplied(actor, RECEIPT, { kind: "condition", status: "ak5e-burning", uuid: "Actor.nowhere" }), false,
    "a target uuid that does not resolve reads as not applied");

  const arrayTarget = actorDoc("Actor.target", { owner: false });
  arrayTarget.effects = [{ id: "e1", flags: { ak5e: { casterPrimal: { opId: RECEIPT.id, casterUuid: actor.uuid } } }, getFlag }];
  documents.set("Actor.target", arrayTarget);
  assert.equal(primalChildApplied(actor, RECEIPT, CHILD_ENTRY), true, "effect collections as a plain array are read the same as a Map");
});

// Helper: world() already ran once per test above; this returns the live documents map for
// tests that need to register actors/targets for fromUuidSync.
function ensureRegisteredWorld() {
  const documents = globalThis.game.actors;
  if (!getPoolDefinition(PRIMAL_POOL_ID)) { registerPrimalSplash(); }
  return { documents };
}
