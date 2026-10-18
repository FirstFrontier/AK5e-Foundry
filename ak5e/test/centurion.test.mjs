import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import {
  isCenturion, defineCenturionPools, registerCenturionHooks, centurionPreRollAttack, intimidationModifier, SHOCK_TROOPER_ID
} from "../scripts/centurion-features.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";
import { getReactions } from "../scripts/trigger-events.mjs";
import { getPool } from "../scripts/resource-pools.mjs";
import { centurionDC, martialDC } from "../scripts/guard-rules.mjs";

function setupWorld() {
  const documents = world();
  registerCenturionHooks();
  globalThis.CONFIG = { statusEffects: [{ id: "frightened", img: "icons/svg/terror.svg" }], Dice: { DamageRoll: StubDamageRoll } };
  rolled.length = 0;
  return documents;
}

/** Records every damage roll the engine starts, so a test can prove nothing is rolled until the owner's click. */
const rolled = [];
class StubDamageRoll {
  constructor(formula) { this.formula = String(formula); rolled.push(this.formula); }
  async evaluate() { this.total = /^\d+$/.test(this.formula) ? Number(this.formula) : 45; return this; }
}

const use = (actor, command, data = {}, id = "cent-1") => guardUses.command(actor, command, { confirmed: true, ...data }, id);

async function anyway(actor, command, data = {}, id = "cent-1") {
  try {
    return await use(actor, command, data, id);
  } catch (error) {
    if (error.name !== "AK5eWarnings") throw error;
    return use(actor, command, { ...data, overrides: error.warnings.map(w => w.id) }, id);
  }
}

test("Centurion identification and DC calculations", () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "centurion" });
  assert.equal(isCenturion(actor), true);
  // system.skills.itm.mod = 4 -> Centurion DC = 8 + 4 = 12
  assert.equal(centurionDC(actor), 12);
  // STR mod = 4, PB = 3 -> Martial DC = 8 + 3 + 4 = 15
  assert.equal(martialDC(actor), 15);
});

test("Cyclone Strike enforces target limits by level and allows cleave", async () => {
  setupWorld();
  const actor1 = guardFixture({ level: 5, branch: "centurion" });
  // Level 5: max 1 secondary target. 2 secondary targets should warn.
  await assert.rejects(use(actor1, "cycloneStrike", { targetUuids: ["t1", "t2"] }, "cyc-1"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "targetCount"));
    return true;
  });

  const res1 = await use(actor1, "cycloneStrike", { targetUuids: ["t1"] }, "cyc-ok");
  assert.equal(res1.secondaryCount, 1);
  assert.equal(res1.maxTargets, 1);

  // Level 7: can cleave to 2 secondary targets
  const actor7 = guardFixture({ level: 7, branch: "centurion" });
  const res7 = await use(actor7, "cycloneStrike", { targetUuids: ["t1", "t2"] }, "cyc-7");
  assert.equal(res7.secondaryCount, 2);
  assert.equal(res7.maxTargets, 2);
});

test("Brutal Execution spends 2 Aggression, calculates DC and damage, and queues targets", async () => {
  const documents = setupWorld();
  const actor = guardFixture({ level: 5, branch: "centurion", aggression: 4 });
  const trooperItem = {
    id: "trooper",
    uuid: `${actor.uuid}.Item.trooper`,
    parent: actor,
    name: "Shock Trooper",
    type: "feat",
    flags: { ak5e: { chapterThreeId: "subclass-feature-guard-centurion-1st-level-shock-trooper-1175" } }
  };
  actor.items.set("trooper", trooperItem);

  const enemy = {
    uuid: "Actor.enemy1",
    id: "enemy1",
    name: "Enemy 1",
    documentName: "Actor",
    isOwner: true,
    effects: new Map(),
    items: new Map(),
    system: { attributes: { hp: { value: 20 } } },
    getFlag() {},
    async update() { return this; },
    createEmbeddedDocuments: async () => [{ id: "eff1", update: async () => {} }]
  };
  documents.set(enemy.uuid, enemy);

  const targetRef = { uuid: enemy.uuid, name: enemy.name };
  const result = await use(actor, "brutalExecution", { targets: [targetRef], killed: true }, "brutal-1");
  assert.equal(result.aggressionSpent, 2);
  assert.equal(result.dc, 12);
  assert.equal(result.damage, 4); // Intimidation Modifier (skill total)

  // B-146: the Wisdom save is the owner's click, so nothing is queued or applied at cast.
  const receipt = guardUses.receipt(actor, "brutal-1");
  assert.equal(receipt.targets.length, 0);
  assert.equal(receipt.brutal.targets[0].uuid, "Actor.enemy1");
  assert.equal(receipt.status, "complete");

  // The reviewed failed-save outcome carries the original assertions: one ready "effect" entry for that Creature.
  await use(actor, "brutalExecutionFailed", { useId: "brutal-1", targetUuid: "Actor.enemy1", failedSave: true }, "brutal-1-fail");
  const outcome = guardUses.receipt(actor, "brutal-1-fail");
  assert.equal(outcome.targets.length, 1);
  assert.equal(outcome.targets[0].uuid, "Actor.enemy1");
  assert.equal(outcome.targets[0].kind, "effect");
  assert.equal(outcome.targets[0].ready, true);
  assert.equal(outcome.targets[0].tag.condition, "frightened");
});

test("Ferocious Fling spends pool use and provides refund when Brutal Execution is flagged", async () => {
  setupWorld();
  const actor = guardFixture({ level: 4, branch: "centurion" });
  // Normal fling spends 1 use of ferociousFling pool
  const res1 = await use(actor, "ferociousFling", { targetConMod: 3, targetUuid: "Actor.t2" }, "fling-1");
  assert.equal(res1.conMod, 3);
  assert.equal(res1.brutalRefund, false);

  // Fling with brutalExecution flag does not spend pool use (refunded)
  const res2 = await use(actor, "ferociousFling", { targetConMod: 2, brutalExecution: true }, "fling-refund");
  assert.equal(res2.brutalRefund, true);
});

test("Guillotine (10th) rolls 2*PB d6, applies Bleeding, and pulses Frightened on Elite/Leader", async () => {
  setupWorld();
  const actor = guardFixture({ level: 10, branch: "centurion" });
  actor.system.attributes.prof = 4;
  const result = await use(actor, "guillotine", { eliteOrLeader: true, damageType: "slashing" }, "guill-1");
  assert.equal(result.diceCount, 8); // 2 * PB(4) = 8
  assert.equal(result.eliteOrLeader, true);

  const receipt = guardUses.receipt(actor, "guill-1");
  assert.equal(receipt.formula, "8d6");
});

test("Shredder (13th) deals STR modifier damage, doubled if target is Frightened", async () => {
  setupWorld();
  const actor = guardFixture({ level: 13, branch: "centurion" });
  // STR mod = 4
  const resNormal = await use(actor, "shredder", { targetFrightened: false }, "shred-1");
  assert.equal(resNormal.damage, 4);

  const resFrightened = await use(actor, "shredder", { targetFrightened: true }, "shred-2");
  assert.equal(resFrightened.damage, 8);
});

test("Storm of Blood (17th) rolls 10d8 Slashing and sets DC", async () => {
  setupWorld();
  const actor = guardFixture({ level: 17, branch: "centurion" });
  const result = await use(actor, "stormOfBlood", {}, "storm-1");
  assert.equal(result.damageFormula, "10d8");

  const receipt = guardUses.receipt(actor, "storm-1");
  assert.equal(receipt.formula, "10d8");
});

test("Fearmonger grants Advantage against Frightened targets and Disadvantage on incoming attacks", () => {
  const documents = setupWorld();
  const centurion = guardFixture({ level: 4, branch: "centurion" });
  const enemy = {
    uuid: "Actor.enemyFrightened",
    id: "enemyFrightened",
    name: "Frightened Goblin",
    statuses: new Set(["frightened"]),
    flags: { ak5e: {} }
  };
  documents.set(enemy.uuid, enemy);

  // 1. Centurion attacks Frightened enemy -> Advantage
  globalThis.game.user.targets = new Set([{ actor: enemy }]);
  const atkConfig1 = { subject: { actor: centurion }, rolls: [{ options: {} }] };
  centurionPreRollAttack(atkConfig1);
  assert.equal(atkConfig1.rolls[0].options.advantage, true);

  // 2. Frightened enemy attacks Centurion -> Disadvantage
  globalThis.game.user.targets = new Set([{ actor: centurion }]);
  const atkConfig2 = { subject: { actor: enemy }, rolls: [{ options: {} }] };
  centurionPreRollAttack(atkConfig2);
  assert.equal(atkConfig2.rolls[0].options.disadvantage, true);
});

/* ------------------------------------------------------------------ helpers for the audit-fix tests */

function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part] ??= {};
  if (last.startsWith("-=")) delete target[last.slice(2)];
  else target[last] = structuredClone(value);
}
/** Flag merges mark emptied maps with "==key"; the fixture stores them literally, so rename them to the real keys. */
function unmarkReplace(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key.startsWith("==") ? key.slice(2) : key, unmarkReplace(inner)]));
}
function realReactions(actor) {
  const update = actor.update.bind(actor);
  actor.update = changes => update(Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, unmarkReplace(value)])));
  return actor;
}
const centurionFixture = options => realReactions(guardFixture({ branch: "centurion", ...options }));

/** A Creature with real-enough effects: applyFeatureTag creates, and the relay or undo deletes, ActiveEffects. */
function creature(documents, id, { owned = true, con = 2, size = "med" } = {}) {
  const effects = new Map();
  const actor = {
    uuid: `Actor.${id}`, id, name: id, documentName: "Actor", isOwner: owned, effects, items: new Map(), statuses: new Set(),
    flags: { ak5e: {} }, system: { attributes: { hp: { value: 20 } }, abilities: { con: { mod: con } }, traits: { size } },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; },
    async createEmbeddedDocuments(_type, data) {
      return data.map((entry, index) => {
        const effect = { ...structuredClone(entry), id: `${id}-fx${effects.size + index}`, parent: actor,
          getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
          async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); },
          async delete() { effects.delete(this.id); } };
        effects.set(effect.id, effect);
        for (const status of effect.statuses ?? []) actor.statuses.add(status);
        return effect;
      });
    },
    async deleteEmbeddedDocuments(_type, ids) {
      for (const effectId of ids) { const effect = effects.get(effectId); for (const status of effect?.statuses ?? []) actor.statuses.delete(status); effects.delete(effectId); }
    }
  };
  documents.set(actor.uuid, actor);
  return actor;
}
const frightenedEffects = target => [...target.effects.values()].filter(effect => effect.statuses?.includes("frightened"));
function addShockTrooper(actor) {
  actor.items.set("trooper", { id: "trooper", uuid: `${actor.uuid}.Item.trooper`, parent: actor, name: "Shock Trooper", type: "feat",
    flags: { ak5e: { chapterThreeId: SHOCK_TROOPER_ID } }, getFlag(scope, key) { return this.flags?.[scope]?.[key]; } });
}
function combatOf(actors, { round = 1, turn = 0 } = {}) {
  const combat = { id: "combat1", started: true, round, turn, turns: actors.map((actor, index) => ({ id: `cb${index}`, actor })),
    get combatant() { return this.turns[this.turn]; } };
  globalThis.game.combat = combat;
  return combat;
}
const aggression = actor => actor.flags.ak5e.resourcePools.aggression.value;

/* ------------------------------------------------------------------ B-144 Fearmonger */

test("B-144: Fearmonger Advantage is only for a Centurion of 4th Level or higher", () => {
  setupWorld();
  const frightened = { actor: { statuses: new Set(["frightened"]), flags: { ak5e: {} } } };
  const attack = actor => ({ subject: { actor }, rolls: [{ options: {} }] });
  globalThis.game.user.targets = new Set([frightened]);

  for (const branch of ["brawler", "artsblade", "crusher"]) {
    const config = attack(guardFixture({ level: 5, branch }));
    centurionPreRollAttack(config);
    assert.equal(config.rolls[0].options.advantage, undefined, `${branch} gets no Fearmonger Advantage`);
  }
  const lowCenturion = attack(centurionFixture({ level: 3 }));
  centurionPreRollAttack(lowCenturion);
  assert.equal(lowCenturion.rolls[0].options.advantage, undefined, "Fearmonger starts at 4th Level");
  const centurion = attack(centurionFixture({ level: 4 }));
  centurionPreRollAttack(centurion);
  assert.equal(centurion.rolls[0].options.advantage, true);
});

test("B-144: Fearmonger leaves a roll alone when any targeted Creature is not Frightened", () => {
  setupWorld();
  const frightened = { actor: { statuses: new Set(["frightened"]), flags: { ak5e: {} } } };
  const calm = { actor: { statuses: new Set(), flags: { ak5e: {} } } };
  globalThis.game.user.targets = new Set([frightened, calm]);
  const config = { subject: { actor: centurionFixture({ level: 8 }) }, rolls: [{ options: {} }] };
  centurionPreRollAttack(config);
  assert.equal(config.rolls[0].options.advantage, undefined);
});

test("B-144: incoming Disadvantage is tied to the actual Centurion target", () => {
  setupWorld();
  const frightenedAttacker = { statuses: new Set(["frightened"]), flags: { ak5e: {} } };
  const roll = targets => {
    globalThis.game.user.targets = new Set(targets.map(actor => ({ actor })));
    const config = { subject: { actor: frightenedAttacker }, rolls: [{ options: {} }] };
    centurionPreRollAttack(config);
    return config.rolls[0].options;
  };
  assert.equal(roll([centurionFixture({ level: 4 })]).disadvantage, true);
  assert.equal(roll([guardFixture({ level: 8, branch: "brawler" })]).disadvantage, undefined, "a Brawler target is not a Fearmonger");
  assert.equal(roll([centurionFixture({ level: 3 })]).disadvantage, undefined, "a level 3 Centurion has no Fearmonger yet");
  assert.equal(roll([centurionFixture({ level: 6 }), guardFixture({ level: 6, branch: "brawler" })]).disadvantage, undefined, "mixed targets keep the normal roll");
  const calmAttacker = { subject: { actor: { statuses: new Set(), flags: { ak5e: {} } } }, rolls: [{ options: {} }] };
  globalThis.game.user.targets = new Set([{ actor: centurionFixture({ level: 6 }) }]);
  centurionPreRollAttack(calmAttacker);
  assert.equal(calmAttacker.rolls[0].options.disadvantage, undefined);
});

/* ------------------------------------------------------------------ B-145 Cyclone Strike frequency */

test("B-145: below 14th Level Cyclone Strike waits for the Centurion's next Turn, even on other Creatures' Turns", async () => {
  setupWorld();
  const actor = centurionFixture({ level: 9 });
  const ally = { uuid: "Actor.ally", name: "Ally" };
  const combat = combatOf([actor, ally], { round: 1, turn: 0 });

  await use(actor, "cycloneStrike", { targetUuids: ["t1"] }, "cyc-a");
  assert.equal(guardUses.state(actor).data.cycloneStrikeTurn, undefined, "the tracker is the receipt, not state.data");

  // Same Turn, and then another Creature's Turn before the Centurion's next Turn begins: both warn.
  for (const turn of [0, 1]) {
    combat.turn = turn;
    await assert.rejects(use(actor, "cycloneStrike", { targetUuids: ["t1"] }, `cyc-b${turn}`), error => {
      assert.equal(error.name, "AK5eWarnings");
      assert.ok(error.warnings.some(w => w.id === "frequency" && /beginning of your next Turn/.test(w.text)));
      return true;
    });
  }
  // The public override is allowed (the module warns, it never blocks).
  const overridden = await anyway(actor, "cycloneStrike", { targetUuids: ["t1"] }, "cyc-b1");
  assert.equal(overridden.secondaryCount, 1);
  assert.ok(guardUses.receipt(actor, "cyc-b1").overridden.some(text => /already used/.test(text)));

  // The beginning of the Centurion's next Turn: available again.
  combat.round = 2; combat.turn = 0;
  const again = await use(actor, "cycloneStrike", { targetUuids: ["t1"] }, "cyc-c");
  assert.equal(again.secondaryCount, 1);
});

test("B-145: from 14th Level Cyclone Strike is once on each Turn", async () => {
  setupWorld();
  const actor = centurionFixture({ level: 14 });
  const combat = combatOf([actor, { uuid: "Actor.ally", name: "Ally" }], { round: 1, turn: 0 });

  await use(actor, "cycloneStrike", { targetUuids: ["t1", "t2"] }, "cyc-1");
  await assert.rejects(use(actor, "cycloneStrike", { targetUuids: ["t1"] }, "cyc-2"), error => {
    assert.ok(error.warnings.some(w => w.id === "frequency" && /once on each Turn/.test(w.text)));
    return true;
  });
  // Another Creature's Turn is a new Turn, so the Feature is available again (Reaction or Opportunity Attack use).
  combat.turn = 1;
  await use(actor, "cycloneStrike", { targetUuids: ["t1"] }, "cyc-3");
  await assert.rejects(use(actor, "cycloneStrike", { targetUuids: ["t1"] }, "cyc-4"), /Use anyway/);
});

test("B-145 / B-133: undoing Cyclone Strike restores the use tracker", async () => {
  setupWorld();
  for (const level of [9, 14]) {
    const actor = centurionFixture({ level });
    combatOf([actor], { round: 1, turn: 0 });
    await use(actor, "cycloneStrike", { targetUuids: ["t1"] }, "cyc-u1");
    await assert.rejects(use(actor, "cycloneStrike", { targetUuids: ["t1"] }, "cyc-u2"), /Use anyway/);
    await guardUses.command(actor, "undoUse", { useId: "cyc-u1", confirmed: true }, "undo-cyc");
    assert.equal(guardUses.receipt(actor, "cyc-u1").status, "undone");
    const retry = await use(actor, "cycloneStrike", { targetUuids: ["t1"] }, "cyc-u3");
    assert.equal(retry.secondaryCount, 1, `level ${level}: available again after the undo`);
  }
});

/* ------------------------------------------------------------------ B-147 Intimidation Modifier */

test("B-147: Brutal Execution damage and the DC use the same Intimidation Modifier (proficiency and expertise)", async () => {
  setupWorld();
  // [value, skill mod (CHA), total]: untrained, proficient, expertise at PB 3. The prior code read `mod` for damage.
  const cases = [[0, 1, 1], [1, 1, 4], [2, 1, 7]];
  for (const [value, mod, total] of cases) {
    const actor = centurionFixture({ level: 5, aggression: 4 });
    actor.system.skills.itm = { value, mod, total };
    assert.equal(intimidationModifier(actor), total);
    assert.equal(centurionDC(actor), 8 + total);
    const result = await use(actor, "brutalExecution", { killed: true, targets: [] }, `ie-${value}`).catch(error => {
      if (error.name !== "AK5eWarnings") throw error;
      return use(actor, "brutalExecution", { killed: true, targets: [], overrides: error.warnings.map(w => w.id) }, `ie-${value}`);
    });
    assert.equal(result.dc, 8 + total, `value ${value}: DC`);
    assert.equal(result.damage, total, `value ${value}: Psychic Damage equals the skill total, not the ability modifier`);
  }
});

test("B-147: with no skill total the same fallback chain feeds the DC and the damage", () => {
  const actor = centurionFixture({ level: 5 });
  actor.system.skills.itm = { mod: 2 };
  assert.equal(intimidationModifier(actor), 2);
  assert.equal(centurionDC(actor), 10);
  delete actor.system.skills.itm;
  assert.equal(intimidationModifier(actor), 1);
  assert.equal(centurionDC(actor), 9);
});

/* ------------------------------------------------------------------ B-146 / B-135 / B-133 Brutal Execution */

async function brutalExecutionSetup() {
  const documents = setupWorld();
  const actor = centurionFixture({ level: 5, aggression: 4 });
  addShockTrooper(actor);
  const owned = creature(documents, "owned"), unowned = creature(documents, "unowned", { owned: false });
  const cast = await use(actor, "brutalExecution", { killed: true, targets: [{ uuid: owned.uuid, name: "owned" }, { uuid: unowned.uuid, name: "unowned" }] }, "be-1");
  return { documents, actor, owned, unowned, cast };
}

test("B-146: Brutal Execution lists the targets, posts the save, applies nothing and rolls nothing", async () => {
  const { actor, owned, unowned, cast } = await brutalExecutionSetup();
  const receipt = guardUses.receipt(actor, "be-1");
  assert.equal(cast.targets, 2);
  assert.deepEqual(receipt.brutal.targets.map(t => t.uuid), [owned.uuid, unowned.uuid]);
  assert.equal(receipt.targets.length, 0, "no target entry is ready at cast");
  assert.match(receipt.summary, /\[\[\/save ability=wis dc=12\]\]/);
  assert.equal(aggression(actor), 2);
  assert.equal(frightenedEffects(owned).length + frightenedEffects(unowned).length, 0);
  assert.deepEqual(rolled, []);
});

test("B-146: a failed save applies Frightened to an owned target; Psychic Damage waits for the owner's Roll; undo reverts", async () => {
  const { actor, owned } = await brutalExecutionSetup();
  const outcome = await use(actor, "brutalExecutionFailed", { useId: "be-1", targetUuid: owned.uuid, failedSave: true }, "be-1-owned");
  assert.equal(outcome.damage, 4);
  const receipt = guardUses.receipt(actor, "be-1-owned");
  assert.equal(receipt.status, "awaitingRoll");
  assert.deepEqual(receipt.damageParts, [{ formula: "4", type: "psychic" }]);
  assert.equal(frightenedEffects(owned).length, 1);
  assert.ok(owned.statuses.has("frightened"), "a real Frightened status, not only a label");
  assert.deepEqual(rolled, [], "the module never rolls the damage itself");

  await use(actor, "useRoll", { useId: "be-1-owned" }, "roll-1");
  assert.deepEqual(rolled, ["4"]);
  assert.deepEqual(guardUses.receipt(actor, "be-1-owned").rollParts, [{ type: "psychic", total: 4 }]);

  await guardUses.command(actor, "undoUse", { useId: "be-1-owned", confirmed: true }, "undo-owned");
  assert.equal(frightenedEffects(owned).length, 0);
  assert.equal(owned.statuses.has("frightened"), false);
  assert.equal(guardUses.receipt(actor, "be-1-owned").status, "undone");
  assert.equal(aggression(actor), 2, "undoing the outcome does not refund the Aggression of the use itself");
  await guardUses.command(actor, "undoUse", { useId: "be-1", confirmed: true }, "undo-be");
  assert.equal(aggression(actor), 4);
});

test("B-146: a failed-save outcome warns, never blocks, and does not double up", async () => {
  const { actor, owned } = await brutalExecutionSetup();
  await assert.rejects(use(actor, "brutalExecutionFailed", { useId: "be-1", targetUuid: owned.uuid }, "be-w1"), error => {
    assert.ok(error.warnings.some(w => w.id === "failedSave"));
    return true;
  });
  await use(actor, "brutalExecutionFailed", { useId: "be-1", targetUuid: owned.uuid, failedSave: true }, "be-w2");
  await assert.rejects(use(actor, "brutalExecutionFailed", { useId: "be-1", targetUuid: owned.uuid, failedSave: true }, "be-w3"),
    error => error.warnings.some(w => w.id === "repeat"));
  await assert.rejects(use(actor, "brutalExecutionFailed", { useId: "nope", targetUuid: owned.uuid, failedSave: true }, "be-w4"), /recorded Brutal Execution/);
});

test("B-146: Brutal Execution warns on no kill, no targets, and a missing Reaction, and an override is public", async () => {
  const documents = setupWorld();
  const actor = centurionFixture({ level: 5, aggression: 1 });
  const ids = async data => {
    try { await use(actor, "brutalExecution", data, "be-warn"); return []; }
    catch (error) { if (error.name !== "AK5eWarnings") throw error; return error.warnings.map(w => w.id); }
  };
  assert.deepEqual((await ids({})).sort(), ["aggression", "kill", "targets"]);
  const enemy = creature(documents, "e1");
  assert.deepEqual(await ids({ killed: true, targets: [enemy.uuid], asReaction: true, reaction: true }), ["aggression"]);
  assert.equal(aggression(actor), 1, "warnings write nothing");
  const done = await anyway(actor, "brutalExecution", { targets: [{ uuid: enemy.uuid }] }, "be-warn");
  assert.equal(done.targets, 1);
  assert.equal(aggression(actor), 0, "an overspent Aggression clamps at 0");
  const receipt = guardUses.receipt(actor, "be-warn");
  assert.ok(receipt.overridden.some(text => /killed a Creature/.test(text)));
  assert.ok(receipt.shortfalls.some(text => /Aggression short by 1/.test(text)));
});

test("B-146: an unowned target needs the GM's client; the relay accepts only the Frightened effect this use creates", async () => {
  const { actor, owned, unowned } = await brutalExecutionSetup();
  // No GM connected: the use is recorded and retryable, and the target is untouched.
  await assert.rejects(use(actor, "brutalExecutionFailed", { useId: "be-1", targetUuid: unowned.uuid, failedSave: true }, "be-un"), /Not applied yet: no GM is connected/);
  let receipt = guardUses.receipt(actor, "be-un");
  assert.equal(receipt.status, "pending");
  assert.equal(frightenedEffects(unowned).length, 0);

  const gm = { id: "gm", isGM: true };
  const relay = (command, id, targetUuid) => guardUses.relayedTargetChange(actor, command, { useId: id, targetUuid }, gm);
  // Tampered receipts are refused (the receipt lives in a flag its owner can write).
  const tamper = change => {
    const stored = actor.flags.ak5e.guardUses.undo.find(entry => entry.id === "be-un");
    change(stored.targets[0]);
  };
  for (const [label, change] of [["feature", entry => { entry.featureId = "subclass-feature-guard-centurion-4th-level-mow-them-down-2123"; }],
    ["condition", entry => { entry.tag.condition = "paralyzed"; }], ["label", entry => { entry.tag.label = "Anything"; }],
    ["extra meta", entry => { entry.meta = { x: 1 }; }], ["kind", entry => { entry.kind = "heal"; }]]) {
    const original = structuredClone(actor.flags.ak5e.guardUses.undo.find(entry => entry.id === "be-un").targets[0]);
    tamper(change);
    unowned.isOwner = true; // the GM's client
    await assert.rejects(relay("apply", "be-un", unowned.uuid), /not one this use can make/, `tampered ${label}`);
    unowned.isOwner = false;
    actor.flags.ak5e.guardUses.undo.find(entry => entry.id === "be-un").targets[0] = original;
  }
  assert.equal(frightenedEffects(unowned).length, 0);
  // A Creature the receipt does not name cannot be changed through it.
  await assert.rejects(relay("apply", "be-un", owned.uuid), /not part of the recorded use/);

  // The genuine entry: the GM's client applies it, and revert removes it.
  unowned.isOwner = true;
  await relay("apply", "be-un", unowned.uuid);
  assert.equal(frightenedEffects(unowned).length, 1);
  assert.ok(unowned.statuses.has("frightened"));
  await relay("revert", "be-un", unowned.uuid);
  assert.equal(frightenedEffects(unowned).length, 0);
  receipt = guardUses.receipt(actor, "be-un");
  assert.equal(receipt.command, "brutalExecutionFailed");
});

test("B-135: Brutal Execution as a Reaction is spent after the receipt persists and undo refunds it", async () => {
  const documents = setupWorld();
  const actor = centurionFixture({ level: 5, aggression: 4 });
  const enemy = creature(documents, "e1");
  assert.equal(getReactions(actor).available, 1);

  // A failed first receipt write leaves the Reaction and the Aggression alone (nothing was spent before the receipt).
  const update = actor.update.bind(actor);
  let failures = 1;
  actor.update = async changes => { if (failures-- > 0) throw new Error("write failed"); return update(changes); };
  await assert.rejects(use(actor, "brutalExecution", { killed: true, asReaction: true, targets: [enemy.uuid] }, "be-rx"), /write failed/);
  actor.update = update;
  assert.equal(getReactions(actor).available, 1);
  assert.equal(aggression(actor), 4);
  assert.equal(guardUses.receipt(actor, "be-rx"), null);

  await use(actor, "brutalExecution", { killed: true, asReaction: true, targets: [enemy.uuid] }, "be-rx");
  const receipt = guardUses.receipt(actor, "be-rx");
  assert.equal(receipt.reaction.requested, true);
  assert.equal(receipt.reaction.spent, true);
  assert.equal(getReactions(actor).available, 0);

  // With no Reaction left a second Reaction use warns first.
  await assert.rejects(use(actor, "brutalExecution", { killed: true, asReaction: true, targets: [enemy.uuid] }, "be-rx2"),
    error => error.warnings.some(w => w.id === "reaction"));

  await guardUses.command(actor, "undoUse", { useId: "be-rx", confirmed: true }, "undo-rx");
  assert.equal(getReactions(actor).available, 1);
  assert.equal(aggression(actor), 4);

  // A Bonus Action use spends no Reaction.
  await use(actor, "brutalExecution", { killed: true, targets: [enemy.uuid] }, "be-bonus");
  assert.equal(getReactions(actor).available, 1);
});

/* ------------------------------------------------------------------ B-148 Ferocious Fling */

test("B-148: Ferocious Fling posts typed Bludgeoning for the owner's Roll and never rolls an attack", async () => {
  const documents = setupWorld();
  const actor = centurionFixture({ level: 6, aggression: 4 });
  const thrown = creature(documents, "thrown", { con: 3, size: "med" });
  actor.system.traits = { size: "med" };
  const result = await use(actor, "ferociousFling", { launchedUuid: thrown.uuid }, "fl-1");
  assert.equal(result.conMod, 3, "read from the launched Creature");
  const receipt = guardUses.receipt(actor, "fl-1");
  assert.deepEqual(receipt.damageParts, [{ formula: "3", type: "bludgeoning" }]);
  assert.equal(receipt.status, "awaitingRoll");
  assert.match(receipt.summary, /Ranged Weapon Attack with your own attack roll, using Strength/);
  assert.deepEqual(rolled, []);
  assert.equal(actor.flags.ak5e.resourcePools.ferociousFling.value, 0);
  await guardUses.command(actor, "undoUse", { useId: "fl-1", confirmed: true }, "undo-fl");
  assert.equal(actor.flags.ak5e.resourcePools.ferociousFling.value, 1);
});

test("B-148: Ferocious Fling warns about size and about an unmatched Brutal Execution link, and refunds a matched one", async () => {
  const documents = setupWorld();
  const actor = centurionFixture({ level: 6, aggression: 4 });
  actor.system.traits = { size: "med" };
  const giant = creature(documents, "giant", { con: 5, size: "huge" });
  await assert.rejects(use(actor, "ferociousFling", { launchedUuid: giant.uuid }, "fl-size"), error => error.warnings.some(w => w.id === "size"));
  await assert.rejects(use(actor, "ferociousFling", { targetConMod: 2, brutalExecutionUseId: "ghost" }, "fl-ghost"), error => error.warnings.some(w => w.id === "brutalUse"));

  await use(actor, "brutalExecution", { killed: true, targets: [] }).catch(() => null);
  await anyway(actor, "brutalExecution", { targets: [] }, "be-link");
  const refunded = await use(actor, "ferociousFling", { targetConMod: 2, brutalExecutionUseId: "be-link" }, "fl-link");
  assert.equal(refunded.brutalRefund, true);
  assert.equal(getPool(actor, "ferociousFling").value, 1, "a refunded use spends nothing");
});

/* ------------------------------------------------------------------ the rest of the audit */

test("Guillotine posts typed weapon-dice damage and both save links, and warns when the weapon's type is unknown", async () => {
  setupWorld();
  const actor = centurionFixture({ level: 10 });
  await assert.rejects(use(actor, "guillotine", {}, "g-1"), error => error.warnings.some(w => w.id === "damageType"));
  actor.items.set("sword", { id: "sword", type: "weapon", system: { equipped: true, damage: { base: { types: new Set(["piercing"]) } } }, getFlag() {} });
  await use(actor, "guillotine", { eliteOrLeader: true }, "g-2");
  const receipt = guardUses.receipt(actor, "g-2");
  assert.deepEqual(receipt.damageParts, [{ formula: "6d6", type: "piercing" }], "one wielded weapon: its type is used");
  assert.match(receipt.summary, /ability=dex dc=15/);
  assert.match(receipt.summary, /ability=wis dc=12/);
  assert.deepEqual(rolled, []);
});

test("Shredder doubles only against a Creature Frightened of this Centurion and posts Slashing for the owner's Roll", async () => {
  const documents = setupWorld();
  const actor = centurionFixture({ level: 13 });
  const scared = creature(documents, "scared"), other = creature(documents, "other"), calm = creature(documents, "calm");
  await scared.createEmbeddedDocuments("ActiveEffect", [{ name: "Frightened", statuses: ["frightened"], flags: { ak5e: { guardUsesEffect: { sourceUuid: actor.uuid } } } }]);
  await other.createEmbeddedDocuments("ActiveEffect", [{ name: "Frightened", statuses: ["frightened"], flags: { ak5e: { guardUsesEffect: { sourceUuid: "Actor.someoneElse" } } } }]);
  assert.equal((await use(actor, "shredder", { targetUuid: scared.uuid }, "sh-1")).damage, 8);
  assert.equal((await use(actor, "shredder", { targetUuid: calm.uuid }, "sh-2")).damage, 4);
  assert.deepEqual(guardUses.receipt(actor, "sh-1").damageParts, [{ formula: "8", type: "slashing" }]);
  // Frightened by someone else: single damage and a warning; the player may confirm it is Frightened of them.
  await assert.rejects(use(actor, "shredder", { targetUuid: other.uuid }, "sh-3"), error => error.warnings.some(w => w.id === "frightenedSource"));
  assert.equal((await use(actor, "shredder", { targetUuid: other.uuid, targetFrightened: true }, "sh-4")).damage, 8);
  assert.deepEqual(rolled, []);
});

test("Brutal Execution warns about, and skips, a listed Creature that no longer exists", async () => {
  const documents = setupWorld();
  const actor = centurionFixture({ level: 5 });
  const live = creature(documents, "live");
  await assert.rejects(use(actor, "brutalExecution", { killed: true, targets: [{ uuid: live.uuid }, { uuid: "Actor.gone", name: "Goner" }] }, "be-gone"),
    error => error.warnings.length === 1 && error.warnings[0].id === "missingTarget" && /Goner/.test(error.warnings[0].text));
  await anyway(actor, "brutalExecution", { killed: true, targets: [{ uuid: live.uuid }, { uuid: "Actor.gone", name: "Goner" }] }, "be-gone");
  assert.deepEqual(guardUses.receipt(actor, "be-gone").brutal.targets.map(t => t.uuid), [live.uuid]);
});

test("Ferocious Fling: one Brutal Execution refunds one Fling, for the Creature it followed", async () => {
  const documents = setupWorld();
  const actor = centurionFixture({ level: 6, aggression: 4 });
  const first = creature(documents, "first"), second = creature(documents, "second");
  await use(actor, "brutalExecution", { killed: true, killedUuid: first.uuid, targets: [] }, "be-k").catch(() => anyway(actor, "brutalExecution", { killedUuid: first.uuid, targets: [] }, "be-k"));
  await use(actor, "ferociousFling", { targetConMod: 2, launchedUuid: first.uuid, brutalExecutionUseId: "be-k" }, "fl-k1");
  await assert.rejects(use(actor, "ferociousFling", { targetConMod: 2, launchedUuid: first.uuid, brutalExecutionUseId: "be-k" }, "fl-k2"),
    error => error.warnings.some(w => w.id === "brutalRepeat"));
  await assert.rejects(use(actor, "ferociousFling", { targetConMod: 2, launchedUuid: second.uuid, brutalExecutionUseId: "be-k" }, "fl-k3"),
    error => error.warnings.some(w => w.id === "brutalCreature"));
  // Undoing the first refunded Fling frees the link again.
  await guardUses.command(actor, "undoUse", { useId: "fl-k1", confirmed: true }, "undo-fl-k1");
  await use(actor, "ferociousFling", { targetConMod: 2, launchedUuid: first.uuid, brutalExecutionUseId: "be-k" }, "fl-k4");
});

test("B-145: a Centurion with two initiative entries waits for the earliest next one", async () => {
  setupWorld();
  const actor = centurionFixture({ level: 6 });
  const ally = { uuid: "Actor.ally", name: "Ally" };
  const combat = combatOf([actor, ally, actor], { round: 1, turn: 1 });
  await use(actor, "cycloneStrike", { targetUuids: ["t1"] }, "cyc-m1");
  combat.turn = 2; // the Centurion's second entry in the same round begins their next Turn
  await use(actor, "cycloneStrike", { targetUuids: ["t1"] }, "cyc-m2");
});

test("The sheet's `targets` list feeds Cyclone Strike's count warning and Shredder's target", async () => {
  const documents = setupWorld();
  const actor = centurionFixture({ level: 13 });
  const refs = ["a", "b", "c", "d"].map(id => ({ uuid: creature(documents, id).uuid, name: id }));
  await assert.rejects(use(actor, "cycloneStrike", { targets: refs }, "sheet-cyc"), error => error.warnings.some(w => w.id === "targetCount"));
  await use(actor, "cycloneStrike", { targets: refs.slice(0, 3) }, "sheet-cyc-ok");
  const scared = documents.get(refs[0].uuid);
  await scared.createEmbeddedDocuments("ActiveEffect", [{ name: "Frightened", statuses: ["frightened"], flags: { ak5e: { guardUsesEffect: { sourceUuid: actor.uuid } } } }]);
  assert.equal((await use(actor, "shredder", { targets: [refs[0]] }, "sheet-sh")).damage, 8);
});

test("B-152: the Storm of Blood refund also returns a Reaction spent from an extra pool", async () => {
  const documents = setupWorld();
  const actor = centurionFixture({ level: 17 });
  documents.set(actor.uuid, actor);
  const { spendReaction, grantExtraReaction: grantExtra } = await import("../scripts/trigger-events.mjs");
  await use(actor, "stormOfBlood", {}, "sb-e1");
  await grantExtra(actor, { id: "bonus", count: 1, atTurnStart: "regain" });
  await spendReaction(actor, { triggerId: "aoo-extra", receipt: "aoo-extra", pool: "bonus" }); // only the extra is spent
  assert.equal(getReactions(actor).available, 1);
  await use(actor, "stormOfBloodRefund", { hit: true }, "sb-e2");
  assert.equal(getReactions(actor).available, 2, "the extra Reaction came back");
  await guardUses.command(actor, "undoUse", { useId: "sb-e2", confirmed: true }, "undo-sb-e2");
  assert.equal(getReactions(actor).available, 1);
});

test("B-152: Storm of Blood shows Long-Arm on the Centurion until undone, and an Attack of Opportunity hit refunds the Reaction", async () => {
  const documents = setupWorld();
  const actor = centurionFixture({ level: 17 });
  addShockTrooper(actor);
  actor.effects = new Map();
  actor.documentName = "Actor";
  actor.deleteEmbeddedDocuments = async (_type, ids) => { for (const id of ids) actor.effects.delete(id); };
  const create = actor.createEmbeddedDocuments;
  actor.createEmbeddedDocuments = async (type, data) => {
    if (type !== "ActiveEffect") return create(type, data);
    return data.map((entry, index) => {
      const effect = { ...structuredClone(entry), id: `fx${actor.effects.size + index}`, getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
        async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); }, async delete() { actor.effects.delete(this.id); } };
      actor.effects.set(effect.id, effect);
      return effect;
    });
  };
  documents.set(actor.uuid, actor);

  await use(actor, "stormOfBlood", {}, "sb-1");
  const storm = guardUses.receipt(actor, "sb-1");
  assert.deepEqual(storm.damageParts, [{ formula: "10d8", type: "slashing" }]);
  assert.equal(storm.formula, "10d8");
  assert.equal(storm.result.longArm, true);
  const longArm = [...actor.effects.values()].filter(effect => /Long-Arm/.test(effect.name));
  assert.equal(longArm.length, 1);
  assert.match(storm.summary, /ability=dex dc=15/);
  assert.deepEqual(rolled, []);

  // The Centurion makes an Attack of Opportunity (a spent Reaction); a hit refunds it.
  await assert.rejects(use(actor, "stormOfBloodRefund", { hit: true }, "sb-r0"), error => error.warnings.some(w => w.id === "noReaction"));
  const { spendReaction } = await import("../scripts/trigger-events.mjs");
  await spendReaction(actor, { triggerId: "aoo-1", receipt: "aoo-1" });
  assert.equal(getReactions(actor).available, 0);
  await assert.rejects(use(actor, "stormOfBloodRefund", {}, "sb-r1"), error => error.warnings.some(w => w.id === "hit"));
  await use(actor, "stormOfBloodRefund", { hit: true }, "sb-r2");
  assert.equal(getReactions(actor).available, 1);
  // Undo spends it again, so a refund cannot be undone into a free Reaction.
  await guardUses.command(actor, "undoUse", { useId: "sb-r2", confirmed: true }, "undo-sb-r");
  assert.equal(getReactions(actor).available, 0);

  await guardUses.command(actor, "undoUse", { useId: "sb-1", confirmed: true }, "undo-sb");
  assert.equal([...actor.effects.values()].filter(effect => /Long-Arm/.test(effect.name)).length, 0);
  assert.equal(actor.flags.ak5e.resourcePools.stormOfBlood.value, 1);
});

test("Storm of Blood refund warns when no Storm of Blood is recorded", async () => {
  setupWorld();
  const actor = centurionFixture({ level: 17 });
  await assert.rejects(use(actor, "stormOfBloodRefund", { hit: true }, "sb-x"), error => error.warnings.some(w => w.id === "noStorm"));
});

