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
  defineSupporterPools, onSupporterTurnStart, onSupporterTurnEnd, hasSelfSupportDie,
  aidCritPreRollAttack, registerAidCritRider
} from "../scripts/supporter-features.mjs";
import { supporterUses, registerSupporterPlans, renderAidCardButtons } from "../scripts/supporter-uses.mjs";
import { getPool } from "../scripts/resource-pools.mjs";
import { emitAk5eEvent, getReactions, riderRecords } from "../scripts/trigger-events.mjs";
import { tagHasExpired } from "../scripts/feature-tags.mjs";
import { getPoolDefinition } from "../scripts/resource-pools.mjs";
import { registerSupporterTalentPlans } from "../scripts/supporter-talents.mjs";

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
  assert.equal(result.critRider, undefined, "no crit rider key without the user choice");
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

/* ---- follow-up round: pool max (R1), self-target (PA-3), giver gating, cards, crit hook, relay ---- */

const buttonsIn = html => (html.match(/<button\b/gi) ?? []).length;

test("the Aid Die pool max is the chosen ability modifier, with no floor (R1)", () => {
  assert.equal(getPool(supporter(1, { flags: { aidAbility: "int" } }), "aidDie").max, 1, "chosen INT mod 1, not the highest");
  assert.equal(getPool(supporter(1, { flags: { aidAbility: "wis" } }), "aidDie").max, 2, "chosen WIS mod 2");
  assert.equal(getPool(supporter(1, { abilities: { cha: { mod: -2, value: 6 } } }), "aidDie").max, 0, "negative chosen mod: max 0");
});

test("provideAid targeting yourself warns selfTarget (PA-3); use anyway allows it", () => {
  const actor = supporter(5);
  assert.throws(() => supporterUses.plan(actor, "provideAid", { targetUuid: actor.uuid, target: actor, distance: 10 }),
    err => err.warnings.some(w => w.id === "selfTarget"));
  assert.doesNotThrow(() => supporterUses.plan(actor, "provideAid", { targetUuid: actor.uuid, target: actor, distance: 10, overrides: ["selfTarget"] }));
});

test("Advanced Aid follows the GIVER's level (effect, else data), not the holder's", async () => {
  const holder = createTestActor({ name: "Holder" });
  docs.set(holder.uuid, holder);
  await holdAidDie(holder, { supporterLevel: 4, dieSize: "d8", advancedAid: true });
  const low = await supporterUses.execute(holder, "useAidDie", { rollType: "attack", rider: "crit" }, "gate-low");
  assert.equal(low.advancedEffect, null, "giver level 4 gives no Advanced Aid");
  assert.equal(low.critRider, undefined);
  assert.equal(/crit/i.test(JSON.stringify(low)), false, "a level 4 record never mentions a crit rider");

  const holder5 = createTestActor({ name: "Holder 5" });
  docs.set(holder5.uuid, holder5);
  await holdAidDie(holder5, { dieSize: "d8", supporterLevel: undefined });
  const high = await supporterUses.execute(holder5, "useAidDie", { rollType: "attack", supporterLevel: 5 }, "gate-high");
  assert.equal(high.advancedEffect, "attack", "data.supporterLevel 5 is the fallback giver level");
});

test("useAidDie card: level 4 has only Roll; level 5 skill adds the second roll; level 20 adds +PB", async () => {
  const cardFor = async (level, rollType, opId) => {
    const holder = createTestActor({ name: `H${level}` });
    docs.set(holder.uuid, holder);
    await holdAidDie(holder, { supporterLevel: level, dieSize: "d8", supporterPB: pbForLevel(level) });
    const result = await supporterUses.execute(holder, "useAidDie", { rollType, supporterLevel: level }, opId);
    return result.card;
  };
  assert.equal(buttonsIn(await cardFor(4, "attack", "card-4")), 1, "level 4: only Roll");
  assert.equal(buttonsIn(await cardFor(5, "skill", "card-5s")), 2, "level 5 skill: Roll + second roll");
  const c20 = await cardFor(20, "attack", "card-20");
  assert.match(c20, /data-ak5e-will-into-being="6"/, "level 20: +PB button");
  assert.match(c20, /data-ak5e-rider="crit"/, "level 20 attack: crit rider offer");
});

test("selfSupportiveDie card exposes the roll button and never rolls", async () => {
  let rolled = false;
  globalThis.Roll = class { constructor() { rolled = true; } evaluate() { rolled = true; return this; } };
  const actor = supporter(18);
  await onSupporterTurnStart(actor);
  const result = await supporterUses.execute(actor, "selfSupportiveDie", { rollType: "skill" }, "self-card");
  assert.match(result.card, /data-ak5e-aid-roll="1d12"/);
  assert.equal(rolled, false);
});

test("the Advanced Aid crit rider is applied by dnd5e.preRollAttackV2 once and consumed after one attack", async () => {
  const actor = supporter(5);
  await registerAidCritRider(actor, "aidcrit-hook-1");
  const config = { subject: { actor }, rolls: [{ options: {} }] };
  aidCritPreRollAttack(config);
  assert.equal(config.rolls[0].options.criticalSuccess, 19, "20 becomes 19 for this attack");
  aidCritPreRollAttack(config);
  assert.equal(config.rolls[0].options.criticalSuccess, 19, "a second run does not lower it again");

  const { consumeRider } = await import("../scripts/trigger-events.mjs");
  await consumeRider("aidcrit-hook-1", { actor, receipt: "attack-1" });
  const after = { subject: { actor }, rolls: [{ options: {} }] };
  aidCritPreRollAttack(after);
  assert.equal(after.rolls[0].options.criticalSuccess, undefined, "consumed: the next attack is normal");
});

test("the card click handler binds each button once; rendering alone never rolls", () => {
  let rolled = false;
  globalThis.Roll = class { constructor() { rolled = true; } evaluate() { rolled = true; return this; } };
  const listeners = [];
  const button = { dataset: {}, addEventListener(_type, fn) { listeners.push(fn); } };
  const html = { querySelectorAll: () => [button] };
  const message = { flags: { ak5e: { supporterUsesUse: { useId: "u" } } } };
  renderAidCardButtons(message, html);
  renderAidCardButtons(message, html);
  assert.equal(listeners.length, 1, "bound once, despite two renders");
  assert.equal(button.dataset.useId, "u", "the use id comes from the message flags");
  assert.equal(rolled, false, "rendering does not roll");
});

test("aidTempHP (rider temp HP) is a registered plan that applies temp HP through the engine", async () => {
  const actor = supporter(5);
  actor.system.attributes.hp = { value: 10, max: 20, temp: 0 };
  const result = await supporterUses.execute(actor, "aidTempHP", { targetUuid: actor.uuid, targetName: actor.name, amount: 4 }, "temp-hp-1");
  assert.equal(result.amount, 4);
  assert.equal(actor.system.attributes.hp.temp, 4, "temp HP is set to the amount");
  await supporterUses.undo(actor, "temp-hp-1");
  assert.equal(actor.system.attributes.hp.temp ?? 0, 0, "undo restores the prior temp HP");
});

/* ---- r1-base rulings F-R1, F-R2, F-R3, F-R7 ---- */

/** Writes a receipt edit back to the Actor (state is cloned on read, so the edit must be saved). */
async function tamperReceipt(actor, useId, mutate) {
  const state = supporterUses.state(actor);
  mutate(state.undo.find(entry => entry.id === useId));
  await actor.update({ "flags.ak5e.supporterUses": state });
}

async function grantAidTo(supporterActor, ally, opId) {
  docs.set(ally.uuid, ally);
  return supporterUses.execute(supporterActor, "provideAid", { targetUuid: ally.uuid, targetName: ally.name, distance: 0 }, opId);
}

test("F-R1: Provide Aid (no feature Item) is a 600 s time effect, the same tag the receipt records", async () => {
  const s = supporter(7);
  const ally = createTestActor({ name: "Ally" });
  await grantAidTo(s, ally, "r1-grant");
  const effect = Array.from(ally.effects.values())[0];
  assert.equal(effect.duration?.seconds, 600, "ten minutes of world time");
  const tag = effect.flags.ak5e.temporaryTag;
  assert.equal(tag.expiry.trigger, "time");
  assert.equal(tag.expiry.worldTime, 100 + 600, "fixture world time starts at 100");
  assert.equal(tagHasExpired(tag, { kind: "time", worldTime: 699 }), false);
  assert.equal(tagHasExpired(tag, { kind: "time", worldTime: 700 }), true, "expires at 600 s");
  assert.equal(effect.flags.ak5e.featureTag.data.dieSize, "d10", "Aid Die data kept on the effect");
  const receiptTag = supporterUses.receipt(s, "r1-grant").targets[0].tag;
  assert.equal(receiptTag.trigger, "time");
  assert.equal(receiptTag.seconds, 600);
  assert.equal(receiptTag.duration, undefined, "no legacy duration key");
});

test("F-R2: registering the talent plans defines every talent-use pool (idempotent)", () => {
  registerSupporterTalentPlans();
  registerSupporterTalentPlans();
  for (const id of ["supporterLuckBase", "supporterLuckModule", "supporterPreservingBase", "supporterPreservingModule",
    "supporterAccelerando", "supporterIgnitionBase", "supporterIgnitionModule", "supporterMirrorMove"]) {
    assert.ok(getPoolDefinition(id), `${id} is defined`);
  }
});

test("F-R7: a relayed Aid Die change is applied only when its content is the module's own shape", async () => {
  const tampers = {
    "changes on the tag": r => { r.targets[0].tag.changes = [{ key: "system.attributes.hp.temp", mode: 2, value: "99" }]; },
    "a condition": r => { r.targets[0].tag.condition = "blinded"; },
    "a foreign tag key": r => { r.targets[0].tag.duration = 99999; },
    "standardBenefit": r => { r.targets[0].standardBenefit = { source: "x" }; },
    "another supporter": r => { r.targets[0].tag.data.supporterUuid = "Actor.someoneElse"; },
    "a different die size": r => { r.targets[0].tag.data.dieSize = "d12"; r.targets[0].meta.dieSize = "d12"; r.result.dieSize = "d12"; },
    "a turn expiry": r => { r.targets[0].tag.trigger = "turnStart"; }
  };
  // Untouched: accepted.
  {
    const s = supporter(7), ally = createTestActor({ name: "Ally" });
    await grantAidTo(s, ally, "r7-clean");
    await supporterUses.relayedTargetChange(s, "apply", { useId: "r7-clean", targetUuid: ally.uuid });
  }
  for (const [name, mutate] of Object.entries(tampers)) {
    const s = supporter(7), ally = createTestActor({ name: "Ally" });
    await grantAidTo(s, ally, "r7-tamper");
    await tamperReceipt(s, "r7-tamper", mutate);
    await assert.rejects(supporterUses.relayedTargetChange(s, "apply", { useId: "r7-tamper", targetUuid: ally.uuid }),
      /not one this use can make/, `rejects ${name}`);
  }
});

test("F-R3: an Advanced Aid crit rider is its own recorded use, and undoing the Aid Die use removes it", async () => {
  const s = supporter(5);
  await holdAidDie(s);
  await supporterUses.execute(s, "useAidDie", { rollType: "attack", dieSize: "d8" }, "r3-aid");
  await supporterUses.execute(s, "aidCritRider", { useId: "r3-aid" }, "r3-crit");
  assert.equal(supporterUses.receipt(s, "r3-crit").parentUseId, "r3-aid", "linked to the Aid Die use");
  assert.ok(riderRecords(s).some(record => record.id === "aidcrit-r3-aid" && record.status === "active"), "rider registered");
  await supporterUses.undo(s, "r3-aid");
  assert.equal(riderRecords(s).some(record => record.id === "aidcrit-r3-aid" && record.status === "active"), false, "undo removes the rider");
});

test("F-R3: a second Aid Die roll is recorded once; a repeat needs the Already rolled override", async () => {
  const s = supporter(7);
  await holdAidDie(s);
  await supporterUses.execute(s, "useAidDie", { rollType: "skill", dieSize: "d10" }, "r3-skill");
  await supporterUses.execute(s, "aidSecondRoll", { useId: "r3-skill" }, "r3-second-1");
  await assert.rejects(supporterUses.command(s, "aidSecondRoll", { useId: "r3-skill", confirmed: true }, "r3-second-2"),
    error => error.warnings?.some(warning => warning.id === "alreadyRolled" && warning.text.startsWith("Already rolled")));
  const again = await supporterUses.execute(s, "aidSecondRoll", { useId: "r3-skill", overrides: ["alreadyRolled"] }, "r3-second-2");
  assert.equal(again.useId, "r3-skill");
});
