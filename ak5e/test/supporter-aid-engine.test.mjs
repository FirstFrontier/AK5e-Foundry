import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import {
  SUPPORTER_CLASS_ID, isArtificer, isBard, isHexer, supporterLevel, supporterBranch,
  aidDieSize, pbForLevel, aidDieMax, aidAbilityKey, calculateSupporterProfile
} from "../scripts/supporter-rules.mjs";
import {
  aidDieFormula, spendAidDice, rollAidDieButton, findAidDieEffect, registerSupporterHooks,
  defineSupporterPools, onSupporterTurnStart, onSupporterTurnEnd, hasSelfSupportDie
} from "../scripts/supporter-features.mjs";
import { supporterUses, registerSupporterPlans } from "../scripts/supporter-uses.mjs";
import { getPool } from "../scripts/resource-pools.mjs";
import { emitAk5eEvent, getReactions } from "../scripts/trigger-events.mjs";

let docs;

test.beforeEach(() => {
  setupFoundryGlobals();
  docs = new Map();
  globalThis.fromUuidSync = uuid => docs.get(uuid) ?? null;
  defineSupporterPools();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

function supporter(level = 1, { abilities = {}, flags = {}, items = [] } = {}) {
  const sClass = createTestItem({
    name: "Supporter", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } }
  });
  const actor = createTestActor({
    name: "Supporter",
    items: [sClass, ...items],
    system: {
      attributes: { prof: pbForLevel(level) },
      abilities: {
        int: { mod: 1, value: 12 }, wis: { mod: 2, value: 14 }, cha: { mod: 3, value: 16 },
        con: { mod: 1, value: 12 }, dex: { mod: 0, value: 10 }, str: { mod: 0, value: 10 },
        ...abilities
      }
    },
    flags: { ak5e: { supporter: { enabled: true, aidAbility: "cha", ...flags } } }
  });
  docs.set(actor.uuid, actor);
  return actor;
}

const subclass = (key, extra = {}) => createTestItem({ name: `Supporter: ${key}`, type: "subclass", ...extra });

/** Plants the Aid Die Active Effect that Provide Aid creates. */
async function holdAidDie(actor, data = {}) {
  const level = supporterLevel(actor) ?? 1;
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: "Aid Die",
    flags: { ak5e: {
      supporterUsesEffect: { aidDie: true, opId: "test-hold", sourceUuid: "Actor.supporter" },
      featureTag: { data: { dieSize: aidDieSize(level), supporterLevel: level, supporterPB: pbForLevel(level),
        advancedAid: level >= 5, willIntoBeing: level >= 20, ...data } }
    } }
  }]);
  return findAidDieEffect(actor);
}

/* ---- predicates and branch detection (mirrors isTrapmaster) ---- */

test("branch predicates: stored branch flag, subclass chapterThreeId, identifier and name", () => {
  const byFlag = supporter(3, { flags: { branch: "bard" } });
  assert.equal(isBard(byFlag), true);
  assert.equal(isArtificer(byFlag), false);

  const byId = supporter(3, { items: [subclass("x", { flags: { ak5e: { chapterThreeId: "subclass-supporter-hexer" } } })] });
  assert.equal(isHexer(byId), true);

  const byIdentifier = supporter(3, { items: [subclass("x", { system: { identifier: "artificer" } })] });
  assert.equal(isArtificer(byIdentifier), true);

  const byName = supporter(3, { items: [subclass("Bard")] });
  assert.equal(isBard(byName), true);
  assert.equal(isHexer(byName), false);

  assert.equal(isArtificer(supporter(3)), false);
});

test("supporterBranch reports the subclass branch for the profile", () => {
  assert.equal(supporterBranch(supporter(3, { items: [subclass("x", { flags: { ak5e: { chapterThreeId: "subclass-supporter-bard" } } })] })), "bard");
});

/* ---- Aid Die maximum (R1) and formula ---- */

test("aidDieMax uses the chosen ability with no floor of 1 (R1)", () => {
  assert.equal(aidDieMax(supporter(1)), 3, "default CHA");
  assert.equal(aidAbilityKey(supporter(1, { flags: { aidAbility: "int" } })), "int");
  assert.equal(aidDieMax(supporter(1, { flags: { aidAbility: "int" } })), 1, "chosen INT mod 1");
  assert.equal(aidDieMax(supporter(1, { flags: { aidAbility: "wis" } })), 2, "chosen WIS mod 2");
  assert.equal(aidDieMax(supporter(1, { abilities: { cha: { mod: -2 } } })), 0, "negative chosen mod gives 0, not 1");
  assert.equal(aidDieMax(supporter(1, { abilities: { cha: { mod: 0, value: 10 } } })), 0);
});

test("profile carries the chosen-ability maximum and a warning at 0", () => {
  const ok = calculateSupporterProfile(supporter(5));
  assert.equal(ok.resources.aidDie.max, 3);
  assert.equal(ok.resources.aidDie.maxFormula, "max(0, @abilities.cha.mod)");
  assert.deepEqual(ok.resources.aidDie.warnings, []);

  const zero = calculateSupporterProfile(supporter(5, { abilities: { cha: { mod: -1 } } }));
  assert.equal(zero.resources.aidDie.max, 0);
  assert.deepEqual(zero.resources.aidDie.warnings, ["0 Aid Dice — GM resolves"]);
});

test("aidDieFormula steps d8 / d10 / d12 by Supporter level", () => {
  assert.equal(aidDieFormula(supporter(1)), "1d8");
  assert.equal(aidDieFormula(supporter(6)), "1d8");
  assert.equal(aidDieFormula(supporter(7)), "1d10");
  assert.equal(aidDieFormula(supporter(13)), "1d10");
  assert.equal(aidDieFormula(supporter(14)), "1d12");
  assert.equal(aidDieFormula(supporter(20)), "1d12");
});

test("spendAidDice clamps at 0 and records the shortfall on the receipt", async () => {
  const actor = supporter(1);
  await actor.update({ "flags.ak5e.resourcePools.aidDie.value": 1 });
  const receipt = { id: "spend-1" };
  const update = spendAidDice(actor, 3, receipt);
  assert.equal(update["flags.ak5e.resourcePools.aidDie.value"], 0);
  assert.ok(receipt.shortfalls?.some(text => text.includes("short by 2")));
});

test("rollAidDieButton returns card markup with a roll button and never rolls", () => {
  let rolled = false;
  globalThis.Roll = class { constructor() { rolled = true; } };
  const actor = supporter(7);
  const html = rollAidDieButton({ actor, label: "Roll Aid Die", formula: "1d10", extra: { willIntoBeingPB: 0, riders: [{ id: "second", label: "Roll again" }] } });
  assert.match(html, /data-ak5e-aid-roll="1d10"/);
  assert.match(html, /data-ak5e-rider="second"/);
  assert.equal(rolled, false, "no Roll is constructed by the helper");
  const html20 = rollAidDieButton({ actor, formula: "1d12", extra: { willIntoBeingPB: 6 } });
  assert.match(html20, /Will Into Being/);
});

/* ---- turn hooks ---- */

test("registerSupporterHooks is idempotent and wires turn start and end to the AK5e event bus", async () => {
  const actor = supporter(18);
  registerSupporterHooks();
  registerSupporterHooks();   // second call is a no-op
  await emitAk5eEvent("turnStart", { actorUuid: actor.uuid });
  assert.equal(hasSelfSupportDie(actor), true, "Self-Supportive die granted at turn start");
  await emitAk5eEvent("turnEnd", { actorUuid: actor.uuid });
  assert.equal(hasSelfSupportDie(actor), false, "Self-Supportive die lost at turn end (R4)");
});

test("turn start regains an empty pool to 1 for Ever Reliable; turn end clears the Self-Supportive die", async () => {
  const actor = supporter(15);
  await actor.update({ "flags.ak5e.resourcePools.aidDie.value": 0 });
  await onSupporterTurnStart(actor);
  assert.equal(getPool(actor, "aidDie").value, 1);
  await onSupporterTurnEnd(actor);
  assert.equal(hasSelfSupportDie(actor), false, "a level 15 Supporter never has the level 18 die");
});

/* ---- plan registry ---- */

test("registerSupporterPlans merges plans, exposes them to .plan and rejects duplicate names", () => {
  const plan = (actor, state, data) => ({
    title: `Test plan ${data.tag ?? ""}`,
    warnings: [],
    apply() { return {}; }
  });
  registerSupporterPlans({ plans: { testMerge: plan } });
  const actor = supporter(3);
  assert.equal(supporterUses.plan(actor, "testMerge", { tag: "ok" }).title, "Test plan ok");
  assert.throws(() => registerSupporterPlans({ plans: { testMerge: plan } }), /already registered/);
  assert.throws(() => registerSupporterPlans({ plans: { provideAid: plan } }), /already registered/);
  assert.throws(() => supporterUses.plan(actor, "noSuchPlan", {}), /Unknown Supporter plan/);
});

/* ---- plans through plan() and apply() ---- */

test("provideAid resolves the target via fromUuidSync and warns on a target that already holds an Aid Die", async () => {
  const actor = supporter(5);
  const ally = createTestActor({ name: "Ally" });
  docs.set(ally.uuid, ally);
  await holdAidDie(ally);

  assert.throws(() => supporterUses.plan(actor, "provideAid", { targetUuid: ally.uuid, distance: 30 }),
    err => err.warnings.some(w => w.id === "targetHasAidDie"));
  // The duplicate check reads the Aid Die effect, not an old flag
  const clean = createTestActor({ name: "Clean" });
  docs.set(clean.uuid, clean);
  assert.doesNotThrow(() => supporterUses.plan(actor, "provideAid", { targetUuid: clean.uuid, distance: 30 }));
});

test("provideAid warns with 0 Aid Dice when the chosen ability modifier is 0 or lower", () => {
  const actor = supporter(5, { abilities: { cha: { mod: 0, value: 10 } } });
  assert.throws(() => supporterUses.plan(actor, "provideAid", { distance: 10, target: createTestActor({ name: "X" }) }),
    err => err.warnings.some(w => w.id === "aidMax"));
});

test("useAidDie expends the holder's Aid Die effect, stores it for undo, and posts a roll button without rolling", async () => {
  const actor = supporter(7);
  const holder = createTestActor({ name: "Holder" });
  docs.set(holder.uuid, holder);
  const effect = await holdAidDie(actor);   // the Supporter's own die, for a simple round trip
  assert.ok(effect);
  const opId = "use-aid-expend";
  const result = await supporterUses.execute(actor, "useAidDie", { rollType: "skill" }, opId);
  assert.equal(result.dieSize, "d10");
  assert.equal(findAidDieEffect(actor), null, "the Aid Die effect is expended");
  const receipt = supporterUses.receipt(actor, opId);
  assert.equal(receipt.formula, "1d10");
  assert.equal(receipt.status, "awaitingRoll", "the die waits for the user's Roll button");
  assert.ok(receipt.summary.includes("data-ak5e-aid-roll"));

  await supporterUses.undo(actor, opId);
  assert.ok(findAidDieEffect(actor), "undo restores the Aid Die effect from the receipt snapshot");
});

test("useAidDie: a holder who is not a Supporter can run it, with a warning when no die is held", async () => {
  const holder = createTestActor({ name: "Plain ally" });
  docs.set(holder.uuid, holder);
  assert.throws(() => supporterUses.plan(holder, "useAidDie", { rollType: "attack" }),
    err => err.warnings.some(w => w.id === "noAidDie"));
  await holdAidDie(holder, { dieSize: "d8", supporterLevel: 2 });
  const result = await supporterUses.execute(holder, "useAidDie", { rollType: "attack" }, "holder-use");
  assert.equal(result.dieSize, "d8");
});

test("useAidDie: Advanced Aid crit rider (R6) registers only when chosen, and undo removes it", async () => {
  const actor = supporter(5);
  await holdAidDie(actor);
  const opId = "use-crit";
  const result = await supporterUses.execute(actor, "useAidDie", { rollType: "attack", rider: "crit" }, opId);
  assert.equal(result.advancedEffect, "attack");
  assert.equal(result.critRider, `aidcrit-${opId}`);
  const riders = actor.flags.ak5e.triggerRiders ?? {};
  assert.ok(riders[`aidcrit-${opId}`], "the one-shot crit rider is registered on the holder");

  await supporterUses.undo(actor, opId);
  assert.equal(actor.flags.ak5e.triggerRiders?.[`aidcrit-${opId}`], undefined, "undo removes the rider record");
});

test("useAidDie: no crit rider without the user's choice, and nothing is registered at Level 4", async () => {
  const actor = supporter(5);
  await holdAidDie(actor);
  const result = await supporterUses.execute(actor, "useAidDie", { rollType: "attack" }, "use-plain");
  assert.equal(result.critRider, null);
  assert.equal(Object.keys(actor.flags.ak5e.triggerRiders ?? {}).length, 0);
});

test("lightenTheLoad: a holder target warns and is allowed; the Reaction is spent and refunded on undo; the bonus die is free", async () => {
  const actor = supporter(11);
  const ally1 = createTestActor({ name: "Ally 1" });
  const ally2 = createTestActor({ name: "Ally 2" });
  docs.set(ally1.uuid, ally1);
  docs.set(ally2.uuid, ally2);
  await holdAidDie(ally2);

  // R3: warn about the holder, allow with Use anyway
  assert.throws(() => supporterUses.plan(actor, "lightenTheLoad", { targetUuid: ally2.uuid, triggerUuid: ally1.uuid }),
    err => err.warnings.some(w => w.id === "targetHasAidDie"));

  const before = getPool(actor, "aidDie").value;
  const opId = "lighten-reaction";
  const reactionsBefore = getReactions(actor).available;
  await supporterUses.execute(actor, "lightenTheLoad", {
    targetUuid: ally1.uuid, targetName: ally1.name, triggerUuid: ally2.uuid, distance: 20,
    overrides: ["targetHasAidDie"]
  }, opId);
  assert.equal(getPool(actor, "aidDie").value, before, "the bonus die spends no pool die");
  assert.equal(getReactions(actor).available, reactionsBefore - 1, "spendReaction is called for the Reaction");

  await supporterUses.undo(actor, opId);
  assert.equal(getReactions(actor).available, reactionsBefore, "undo refunds the Reaction");
});

test("lightenTheLoad warns with no Reaction left and does not block", async () => {
  const actor = supporter(11);
  const ally = createTestActor({ name: "Ally" });
  docs.set(ally.uuid, ally);
  await actor.update({ "flags.ak5e.reactionBudget": { max: 1, spent: 1, extra: [], triggers: {}, receipts: {} } });
  assert.throws(() => supporterUses.plan(actor, "lightenTheLoad", { targetUuid: ally.uuid, triggerUuid: "Actor.other" }),
    err => err.warnings.some(w => w.id === "reaction"));
  const result = await supporterUses.execute(actor, "lightenTheLoad", {
    targetUuid: ally.uuid, targetName: ally.name, triggerUuid: "Actor.other", overrides: ["reaction"]
  }, "lighten-no-reaction");
  assert.equal(result.supplementary, true);
});

test("selfSupportiveDie spends the per-Turn flag, expends it as a roll on the card, and is undoable", async () => {
  const actor = supporter(18);
  await onSupporterTurnStart(actor);
  assert.equal(hasSelfSupportDie(actor), true);
  const opId = "self-die";
  const result = await supporterUses.execute(actor, "selfSupportiveDie", { rollType: "save" }, opId);
  assert.equal(result.selfSupportive, true);
  assert.equal(result.dieSize, "d12");
  assert.equal(hasSelfSupportDie(actor), false);
  assert.equal(supporterUses.receipt(actor, opId).formula, "1d12");

  await supporterUses.undo(actor, opId);
  assert.equal(hasSelfSupportDie(actor), true);
});

test("selfSupportiveDie warns when no die is held, and cannot be given to another creature", () => {
  const actor = supporter(18);
  assert.throws(() => supporterUses.plan(actor, "selfSupportiveDie", { rollType: "skill" }),
    err => err.warnings.some(w => w.id === "noSelfSupportDie"));
  const plan = supporterUses.plan(actor, "selfSupportiveDie", { rollType: "skill", overrides: ["noSelfSupportDie"] });
  assert.ok(plan.title.includes("Self-Supportive"));
});
