import test from "node:test";
import assert from "node:assert/strict";
import {
  aggressionMax, unrelentingMax, instructionDiceMax, instructionDieFaces,
  martialDC, martialDCChoice, centurionDC, guardProfile, guardLevel, guardBranch, guardEnabled,
  guardState, GUARD_CLASS_ID, GUARD_BRANCH_IDS, FIGHTING_STYLES
} from "../scripts/guard-rules.mjs";
import { guardFixture, world } from "./guard-fixture.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";
import { previewGuardProgression, applyGuardProgression } from "../scripts/guard-progression.mjs";
import { previewGuardSetup } from "../scripts/guard-setup.mjs";
import {
  registerGuardFeatureHooks, guardPreRollAttack, guardPostRollAttack, resetDeadlyFighterLedger, annihilationProtocol, aggression, unrelenting
} from "../scripts/guard-features.mjs";
import {
  registerArtsbladeHooks, artsbladeCastingUnits, hasCastingUnitProperty, isMeleeWeaponItem
} from "../scripts/artsblade-features.mjs";
import { askPrompt, askMartialAbility, runGuardUse, executeGuardDialog } from "../scripts/guard-sheet.mjs";
import { emitAk5eEvent, setReactionStore } from "../scripts/trigger-events.mjs";
import { opaqueKey } from "../scripts/operation-kernel.mjs";

const item = (type, chapterThreeId, system = {}) => ({
  id: chapterThreeId,
  type,
  system,
  name: chapterThreeId,
  flags: { ak5e: { chapterThreeId } }
});

const actor = (items, flags = {}) => ({
  type: "character",
  items: new Map(items.map(i => [i.id, i])),
  flags: { ak5e: flags },
  system: {
    attributes: { prof: 3 },
    abilities: { str: { mod: 4 }, dex: { mod: 2 }, cha: { mod: 1 } },
    skills: { itm: { total: 5, mod: 5 } }
  }
});

test("Aggression pool follows the Guard table (4 at 1st, 6 at 7th, 8 at 14th)", () => {
  const expected = [
    4, 4, 4, 4, 4, 4,
    6, 6, 6, 6, 6, 6, 6,
    8, 8, 8, 8, 8, 8, 8
  ];
  assert.deepEqual(Array.from({ length: 20 }, (_, i) => aggressionMax(i + 1)), expected);
  assert.throws(() => aggressionMax(0), RangeError);
  assert.throws(() => aggressionMax(21), RangeError);
  assert.throws(() => aggressionMax(1.5), RangeError);
});

test("Unrelenting uses step at levels 3 (1 use) and 11 (2 uses)", () => {
  assert.equal(unrelentingMax(1), 0);
  assert.equal(unrelentingMax(2), 0);
  assert.equal(unrelentingMax(3), 1);
  assert.equal(unrelentingMax(10), 1);
  assert.equal(unrelentingMax(11), 2);
  assert.equal(unrelentingMax(20), 2);
});

test("Instruction Dice step at 1 (4 dice), 7 (5 dice), 14 (6 dice)", () => {
  assert.equal(instructionDiceMax(1), 4);
  assert.equal(instructionDiceMax(6), 4);
  assert.equal(instructionDiceMax(7), 5);
  assert.equal(instructionDiceMax(13), 5);
  assert.equal(instructionDiceMax(14), 6);
  assert.equal(instructionDiceMax(20), 6);
});

test("Instruction Die size upgrades from d6 to d10 at 13th level", () => {
  assert.equal(instructionDieFaces(1), 6);
  assert.equal(instructionDieFaces(12), 6);
  assert.equal(instructionDieFaces(13), 10);
  assert.equal(instructionDieFaces(20), 10);
});

test("Martial DC is 8 + PB + the STR or DEX modifier the character chose (Ch.1 L211-212)", () => {
  // PB = 3, STR = 4, DEX = 2
  assert.equal(martialDC(actor([], { guard: { martialDCAbility: "str" } })), 15);
  assert.equal(martialDC(actor([], { guard: { martialDCAbility: "dex" } })), 13, "a stored Dexterity choice is honoured even when Strength is higher");
  assert.equal(martialDCChoice(actor([], { guard: { martialDCAbility: "dex" } })), "dex");
  // A per-use choice overrides the stored one
  assert.equal(martialDC(actor([], { guard: { martialDCAbility: "str" } }), "dex"), 13);
});

test("Martial DC falls back to the higher of STR and DEX only when nothing is chosen", () => {
  const a = actor([]);
  assert.equal(martialDCChoice(a), null);
  assert.equal(martialDC(a), 15);
  assert.equal(martialDC(actor([], { guard: { martialDCAbility: "cha" } })), 15, "an unsupported stored value is not a choice");
  const dexFirst = actor([], {});
  dexFirst.system.abilities.dex.mod = 5;
  assert.equal(martialDC(dexFirst), 16);
  assert.equal(martialDC(dexFirst, "str"), 15);
});

test("Centurion DC is 8 + Intimidation modifier", () => {
  const a = actor([]);
  // Intimidation total = 5 -> 8 + 5 = 13
  assert.equal(centurionDC(a), 13);
});

test("Guard profile detects class, branch, and flags invalid configurations", () => {
  const g = item("class", GUARD_CLASS_ID, { levels: 5 });
  const a = actor([g, item("subclass", "subclass-guard-centurion")]);
  assert.equal(guardLevel(a), 5);
  assert.equal(guardBranch(a), "centurion");

  const profile = guardProfile(a);
  assert.equal(profile.applicable, true);
  assert.equal(profile.configured, false);
  assert.deepEqual(profile.blocked, []);

  // Multi-class blocked
  assert.deepEqual(guardProfile(actor([g, item("class", "class-caster", { levels: 1 })])).blocked, ["MultipleClasses"]);
  // Invalid level blocked
  assert.deepEqual(guardProfile(actor([item("class", GUARD_CLASS_ID, { levels: 25 })])).blocked, ["InvalidClassLevel"]);
});

test("guardState merges defaults and recognizes enabled flag", () => {
  const a1 = actor([]);
  assert.equal(guardState(a1).enabled, false);

  const a2 = actor([], { guard: { enabled: true, fightingStyle: "duelling" } });
  assert.equal(guardState(a2).enabled, true);
  assert.equal(guardState(a2).fightingStyle, "duelling");
});

/* ================================================================ U1: Guard + Artsblade finish */

const use = (actor, command, data = {}, id = "u1-use") => guardUses.command(actor, command, { confirmed: true, ...data }, id);
const meleeWeapon = (actor, id = "longsword", equipped = true) => {
  const weapon = { id, uuid: `${actor.uuid}.Item.${id}`, type: "weapon", name: `Weapon ${id}`,
    system: { equipped, type: { value: "martialM" }, activities: new Map([["melee", { id: "melee", type: "attack", attack: { type: { value: "melee" } } }]]) } };
  actor.items.set(id, weapon);
  return weapon;
};
function u1World(combat = null) {
  const documents = world(combat);
  const reactions = new Map();
  setReactionStore({ read: actor => reactions.get(actor.uuid), async write(actor, state) { reactions.set(actor.uuid, structuredClone(state)); } });
  registerGuardFeatureHooks();
  registerArtsbladeHooks();
  return documents;
}
let rolls;
const countedRoll = total => {
  rolls = 0;
  globalThis.Roll = class { constructor(formula) { this.formula = formula; } async evaluate() { rolls++; this.total = total; return this; } async toMessage() { return this; } };
};

test("U1 F5: choosing the Martial DC ability is a confirmed, undoable use that Blade Art then honours", async () => {
  u1World();
  const actor = guardFixture({ level: 5, branch: "artsblade" });  // PB 3, STR +4, DEX +2
  await assert.rejects(use(actor, "bladeArt", { artPool: "frost" }, "no-choice"), error => error.name === "AK5eWarnings" && error.warnings.some(w => w.id === "martialDCAbility"),
    "with no choice made and none supplied the player is warned (and can Use anyway)");
  await assert.rejects(use(actor, "chooseMartialDC", { ability: "int" }, "bad-ability"), /Strength or Dexterity/);
  await use(actor, "chooseMartialDC", { ability: "dex" }, "choose-dex");
  assert.equal(martialDCChoice(actor), "dex");
  assert.equal(martialDC(actor), 13, "8 + PB 3 + DEX 2, although STR is higher");
  const result = await use(actor, "bladeArt", { artPool: "frost" }, "uses-stored-choice");
  assert.equal(result.martialDC, 13, "no per-use choice and a stored one: no warning and the stored ability is used");
  const override = await use(actor, "bladeArt", { artPool: "frost", martialDcAbility: "str", overrides: ["frequency"] }, "per-use-override");
  assert.equal(override.martialDC, 15, "a per-use choice overrides the stored one");
  await guardUses.command(actor, "undoUse", { useId: "choose-dex" }, "undo-choose");
  assert.equal(martialDCChoice(actor), null, "undo removes the stored choice");
});

test("U1: a second Blade Art against a creature that already made its save says so in the confirm preview", async () => {
  u1World({ started: true, id: "c1", round: 1, turn: 0, turns: [{ actor: { uuid: "Actor.guard1" } }, { actor: { uuid: "Actor.other" } }] });
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.guardProgression = { choices: { artPools: ["frost"] } };
  const target = "Actor.foe";
  const data = { artPool: "frost", targetUuid: target, targetName: "Foe", martialDcAbility: "str" };
  assert.doesNotMatch(guardUses.preview(actor, "bladeArt", data).targets[0].name, /already made/, "no save made yet: nothing to say");
  actor.flags.ak5e.guardUses = { data: { bladeArtSaves: { [opaqueKey(target)]: { targetUuid: target, combatId: "c1", untilTurnKey: "c1:2:0" } } } };
  const preview = guardUses.preview(actor, "bladeArt", data);
  assert.match(preview.targets[0].name, /Foe .*already made this Cantrip's saving throw.*exempt from repeating it/);
  assert.equal((await use(actor, "bladeArt", data, "second-art")).immuneToSave, true);
  assert.equal(guardUses.receipt(actor, "second-art").saves.length, 0, "no second save request is posted");
  game.combat.round = 2; game.combat.turn = 0;
  assert.doesNotMatch(guardUses.preview(actor, "bladeArt", data).targets[0].name, /already made/, "the exemption ends when the Artsblade's next Turn begins");
});

test("U1 B-150: Resonance makes wielded melee weapons Casting Units, and the Blade Art card says which", async () => {
  u1World();
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  assert.deepEqual(artsbladeCastingUnits(actor), []);
  const sword = meleeWeapon(actor, "sword"), idle = meleeWeapon(actor, "spare", false);
  actor.items.set("bow", { id: "bow", type: "weapon", name: "Bow", system: { equipped: true, type: { value: "simpleR" }, activities: new Map([["a", { id: "a", type: "attack", attack: { type: { value: "ranged" } } }]]) } });
  assert.equal(isMeleeWeaponItem(sword), true);
  assert.equal(isMeleeWeaponItem(actor.items.get("bow")), false);
  assert.deepEqual(artsbladeCastingUnits(actor).map(item => item.id), ["sword"], "only wielded (equipped) melee weapons");
  assert.equal(hasCastingUnitProperty(actor, sword), true);
  assert.equal(hasCastingUnitProperty(actor, idle), false);
  await use(actor, "bladeArt", { artPool: "frost", martialDcAbility: "str" }, "casting-unit-card");
  assert.match(guardUses.receipt(actor, "casting-unit-card").manualSteps.join(" "), /Casting Unit \(Resonance\): Weapon sword counts as a Casting Unit while wielded, so you may ignore the Somatic Components/);
  const bare = guardFixture({ level: 5, branch: "artsblade" });
  await use(bare, "bladeArt", { artPool: "frost", martialDcAbility: "str" }, "no-weapon-card");
  assert.match(guardUses.receipt(bare, "no-weapon-card").manualSteps.join(" "), /No melee weapon is equipped/);
  const other = guardFixture({ level: 5, branch: "duellist" });
  meleeWeapon(other);
  assert.deepEqual(artsbladeCastingUnits(other), [], "the property belongs to the Artsblade branch only");
});

test("U1 B-150: setup grants every Artsblade source Feature at its level, once", async () => {
  u1World();
  const features = level => previewGuardSetup(guardFixture({ level, branch: "artsblade" })).then(plan => plan.creates.map(item => item.name));
  const high = await features(17);
  for (const name of ["Sword and Sorcery", "Resonance", "Blade Art", "Cut Through Chaos", "Sharpened Mind", "High Fantasy", "Power Overwhelming", "Artsblade Table", "Resolving Spellsword Arts"])
    assert.ok(high.some(entry => entry.includes(name)), `${name} is granted at level 17`);
  const low = await features(1);
  assert.ok(low.some(entry => entry.includes("Resonance")) && !low.some(entry => entry.includes("Cut Through Chaos")), "4th level and later Features wait for their level");
  const plain = await previewGuardSetup(guardFixture({ level: 17 }));
  assert.ok(!plain.creates.some(item => item.name.includes("Artsblade")), "no Artsblade Feature Items without the branch");
});

test("U1 B-134: Ultimate Blade Art lifts the once-per-Turn limit only through the end of the Artsblade's next Turn", async () => {
  const combat = { started: true, id: "c2", round: 1, turn: 0, turns: [{ actor: { uuid: "Actor.guard1" } }, { actor: { uuid: "Actor.other" } }] };
  u1World(combat);
  const actor = guardFixture({ level: 17, branch: "artsblade" });
  actor.flags.ak5e.resourcePools.ultimateBladeArt = { value: 1, max: 1 };
  actor.flags.ak5e.guardProgression = { choices: { artPools: ["frost"] } };
  const cast = (id, overrides) => use(actor, "bladeArt", { artPool: "frost", martialDcAbility: "str", ...(overrides ? { overrides } : {}) }, id);
  await use(actor, "ultimateBladeArt", {}, "ultimate");
  await cast("a1"); await cast("a2"); await cast("a3");   // no frequency warning while it is active
  combat.round = 2;
  await cast("b1"); await cast("b2");                       // still active through the end of the next Turn
  combat.turn = 1;                                          // the Artsblade's next Turn is over
  combat.round = 2;
  await cast("c1", ["frequency"]);
  combat.round = 3; combat.turn = 0;
  await cast("d1");
  await assert.rejects(cast("d2"), error => error.name === "AK5eWarnings" && error.warnings.some(w => w.id === "frequency"), "the limit is back after the window");
});

test("U1 F6: Deadly Fighter adds +1 Critical Range to the first Deadly attack roll each Turn only", () => {
  u1World({ started: true, id: "c3", round: 1, turn: 0 });
  resetDeadlyFighterLedger();
  const actor = guardFixture({ level: 5 });
  actor.flags.ak5e.guard.fightingStyle = "deadlyFighter";
  const deadly = { uuid: "Item.axe", system: { properties: new Set(["deadly"]) } };
  const plain = { uuid: "Item.stick", system: { properties: new Set() } };
  const attack = (item, roll = { options: {}, parts: [] }) => { guardPreRollAttack({ subject: { actor, item, actionType: "mwak" }, rolls: [roll] }); return roll; };
  const first = attack(deadly);
  assert.equal(first.options.criticalSuccess, 19);
  attack(deadly, first);
  assert.equal(first.options.criticalSuccess, 19, "reprocessing one roll never stacks the range");
  assert.equal(attack(plain).options.criticalSuccess, undefined, "a weapon without Deadly gets nothing");
  guardPostRollAttack([], { subject: { actor, item: deadly } });
  assert.equal(attack(deadly).options.criticalSuccess, undefined, "the second Deadly roll in the same Turn gets nothing");
  game.combat.turn = 1;
  assert.equal(attack(deadly).options.criticalSuccess, 19, "a new Turn restores it; a cancelled roll dialog used nothing up");
});

test("U1 F4: Annihilation Protocol restores one Unrelenting use once per combat, reading the event's actor", async () => {
  u1World();
  const actor = guardFixture({ level: 20, unrelenting: 0 });
  const event = { eventId: "e1", combatUuid: "Combat.1", raw: { actor } };
  assert.equal(await annihilationProtocol({ actorUuid: actor.uuid, raw: { actor }, combatUuid: "Combat.1" }) !== null, true);
  assert.equal(unrelenting(actor).value, 1);
  actor.flags.ak5e.resourcePools.unrelenting.value = 0;
  assert.equal(await annihilationProtocol(event), null, "a repeat Initiative roll in the same combat does not refund again");
  assert.equal(unrelenting(actor).value, 0);
  assert.notEqual(await annihilationProtocol({ ...event, combatUuid: "Combat.2" }), null, "a new combat does");
  const low = guardFixture({ level: 19, unrelenting: 0 });
  assert.equal(await annihilationProtocol({ raw: { actor: low }, combatUuid: "Combat.9" }), null, "20th level only");
  const some = guardFixture({ level: 20, unrelenting: 1 });
  assert.equal(await annihilationProtocol({ raw: { actor: some }, combatUuid: "Combat.9" }), null, "only with no uses remaining");
});

test("U1 F4: the registered initiative handler receives the event and refunds the Actor", async () => {
  u1World();
  const actor = guardFixture({ level: 20, unrelenting: 0 });
  const { errors } = await emitAk5eEvent("initiative", { eventId: "i1", actorUuid: actor.uuid, combatUuid: "Combat.77", raw: { actor } });
  assert.equal(errors, 0);
  assert.equal(unrelenting(actor).value, 1);
});

test("U1 F3: Eternal Aggression waits for the player's roll, recovers the clicked total (capped) and undoes", async () => {
  u1World({ started: true, id: "c-eternal", round: 1, turn: 0 });
  const actor = guardFixture({ level: 18, aggression: 2, unrelenting: 2 });   // Aggression maximum is 8 at this level
  countedRoll(3);
  await use(actor, "unrelenting", {}, "eternal-1");
  let receipt = guardUses.receipt(actor, "eternal-1");
  assert.equal(receipt.status, "awaitingRoll");
  assert.equal(receipt.formula, "1d4");
  assert.equal(rolls, 0, "the confirmed use rolls nothing");
  assert.equal(aggression(actor).value, 2, "Aggression is unchanged until the owner clicks Roll");
  await guardUses.command(actor, "useRoll", { useId: "eternal-1" }, "eternal-1-roll");
  assert.equal(rolls, 1);
  assert.equal(aggression(actor).value, 5);
  assert.match(guardUses.receipt(actor, "eternal-1").summary, /Eternal Aggression: rolled 3, recovered 3 Aggression \(2 to 5\)/);
  await guardUses.command(actor, "useRoll", { useId: "eternal-1" }, "eternal-1-again");
  assert.equal(aggression(actor).value, 5, "a replayed Roll click recovers nothing more");
  await guardUses.command(actor, "undoUse", { useId: "eternal-1" }, "eternal-1-undo");
  assert.equal(aggression(actor).value, 2);
  assert.equal(unrelenting(actor).value, 2);

  actor.flags.ak5e.resourcePools.aggression.value = 7;
  countedRoll(7);
  await use(actor, "pursuitUnrelenting", {}, "eternal-2");
  assert.equal(guardUses.receipt(actor, "eternal-2").formula, "2d4", "two expended uses roll one d4 each");
  await guardUses.command(actor, "useRoll", { useId: "eternal-2" }, "eternal-2-roll");
  assert.equal(aggression(actor).value, 8, "recovery stops at the maximum");

  const early = guardFixture({ level: 17, unrelenting: 1 });
  early.uuid = "Actor.early";
  await use(early, "unrelenting", {}, "no-eternal");
  assert.equal(guardUses.receipt(early, "no-eternal").formula, undefined, "Eternal Aggression is an 18th level Feature");
});

test("U1 F3: Unrelenting Aggression offers its miss-damage roll on the card instead of rolling it", async () => {
  u1World();
  const actor = guardFixture({ level: 15, aggression: 4 });
  countedRoll(9);
  await assert.rejects(use(actor, "unrelentingAggression", { formula: "fireball()" }, "bad-formula"), /weapon's damage dice/);
  await use(actor, "unrelentingAggression", { formula: "2d6" }, "miss-damage");
  const receipt = guardUses.receipt(actor, "miss-damage");
  assert.deepEqual([receipt.status, receipt.formula, rolls], ["awaitingRoll", "2d6", 0]);
  await guardUses.command(actor, "useRoll", { useId: "miss-damage" }, "miss-damage-roll");
  assert.deepEqual([rolls, guardUses.receipt(actor, "miss-damage").roll], [1, 9]);
});

const level5Choices = extra => ({
  branch: "subclass-guard-centurion", fightingStyle: "duelling", saves: ["con"], skills: ["ath", "itm", "ak5elore"], tool: "Maintenance Kit",
  startingEquipment: { mode: "cash" }, ...extra
});

test("U1 F2: levels with no supplied HP or ASI choice are not marked as granted, so they can still be taken later", async () => {
  u1World();
  const actor = guardFixture({ level: 5 });
  const bare = await previewGuardProgression(actor, level5Choices({}));
  assert.deepEqual(bare.pending, []);
  assert.deepEqual([bare.progression.hpLevels, bare.progression.asiLevels], [[], []], "nothing supplied, nothing marked");
  assert.equal(bare.writes["system.attributes.hp.max"], undefined);
  await applyGuardProgression(actor, { confirmed: true, contextKey: bare.contextKey, ...level5Choices({}) });
  assert.deepEqual([actor.flags.ak5e.guardProgression.hpLevels, actor.flags.ak5e.guardProgression.asiLevels], [[], []]);

  const later = level5Choices({ hp: { 1: { mode: "fixed", roll: 10 }, 2: { mode: "rolled", roll: 7 } }, asi: { 4: { increases: [{ ability: "con", amount: 2 }] } } });
  const plan = await previewGuardProgression(actor, later);
  assert.deepEqual([plan.progression.hpLevels, plan.progression.asiLevels], [[1, 2], [4]]);
  assert.equal(plan.writes["system.attributes.hp.max"], 45 + (10 + 4) + (7 + 4), "Hit Points are added for the supplied levels only, at the CON modifier after the supplied Ability Score Improvement (16 + 2 = +4)");
});

test("U1 F2: an explicit existing choice is a supplied choice and marks its level, adding no Hit Points", async () => {
  u1World();
  const actor = guardFixture({ level: 5 });
  const choices = level5Choices({ hp: { 1: { mode: "existing" }, 2: { mode: "existing" } }, asi: { 4: { mode: "existing" } } });
  const plan = await previewGuardProgression(actor, choices);
  assert.deepEqual([plan.progression.hpLevels, plan.progression.asiLevels], [[1, 2], [4]]);
  assert.equal(plan.writes["system.attributes.hp.max"], undefined);
});

test("U1 F7: structurally impossible progression choices are rejected before anything is previewed or written", async () => {
  u1World();
  const reject = async (extra, pattern) => {
    const actor = guardFixture({ level: 8 });
    await assert.rejects(previewGuardProgression(actor, level5Choices(extra)), pattern);
    await assert.rejects(applyGuardProgression(actor, { confirmed: true, contextKey: "x", ...level5Choices(extra) }), pattern);
    assert.equal(actor.writes.length, 0, "a rejected choice writes nothing");
  };
  await reject({ asi: { 4: { increases: [{ ability: "str", amount: 2 }, { ability: "dex", amount: 1 }] } } }, /must be \+2 to one ability or \+1 to two/);
  await reject({ asi: { 4: { increases: [{ ability: "str", amount: 1 }, { ability: "str", amount: 1 }] } } }, /must be \+2 to one ability or \+1 to two/);
  await reject({ asi: { 4: { increases: [{ ability: "luck", amount: 2 }] } } }, /Ability Score Improvement/);
  await reject({ asi: { 5: { increases: [{ ability: "str", amount: 2 }] } } }, /not an Ability Score Improvement level/);
  await reject({ hp: { 2: { mode: "rolled", roll: "abc" } } }, /is not a number/);
  await reject({ hp: { 2: { mode: "magic" } } }, /fixed or rolled/);
  await reject({ skills: ["ath", "ath", "itm"] }, /more than once/);
  await reject({ skills: ["ath", "itm", "stealth"] }, /Guard list/);
  await reject({ skills: ["ath", "itm", "acr", "ins"] }, /choose three skills/);
  await reject({ saves: ["str"] }, /one saving throw/);
  await reject({ saves: ["con", "dex"] }, /one saving throw/);
  await reject({ fightingStyle: "bogus" }, /not a Guard Fighting Style/);
  await reject({ martialDCAbility: "cha" }, /Strength or Dexterity/);
});

test("U1 F7: out-of-range HP rolls and over-20 ability increases warn and are corrected, never silently kept", async () => {
  u1World();
  const actor = guardFixture({ level: 5 });
  actor.system.abilities.str.value = 19;
  const plan = await previewGuardProgression(actor, level5Choices({ hp: { 2: { mode: "rolled", roll: 14 }, 3: { mode: "rolled", roll: 0 } }, asi: { 4: { increases: [{ ability: "str", amount: 2 }] } } }));
  assert.ok(plan.warnings.some(text => /roll 14 is outside 1 to 10/.test(text)));
  assert.ok(plan.warnings.some(text => /roll 0 is outside 1 to 10/.test(text)));
  assert.ok(plan.warnings.some(text => /STR 19 \+ 2 is above 20/.test(text)));
  assert.equal(plan.writes["system.abilities.str.value"], 20);
  assert.equal(plan.writes["system.attributes.hp.max"], 45 + (10 + 3) + (1 + 3), "rolls are clamped to the d10");
  const ignored = await previewGuardProgression(actor, level5Choices({ hp: { 9: { mode: "fixed", roll: 6 } } }));
  assert.ok(ignored.warnings.some(text => /Ignoring the level 9 Hit Point choice/.test(text)));
  assert.deepEqual(ignored.progression.hpLevels, []);
});

test("U1 F5: progression stores the Martial DC ability choice", async () => {
  u1World();
  const actor = guardFixture({ level: 5 });
  const plan = await previewGuardProgression(actor, level5Choices({ martialDCAbility: "dex" }));
  assert.equal(plan.writes["flags.ak5e.guard.martialDCAbility"], "dex");
  await applyGuardProgression(actor, { confirmed: true, contextKey: plan.contextKey, ...level5Choices({ martialDCAbility: "dex" }) });
  assert.equal(martialDCChoice(actor), "dex");
});

/* ---- Sheet: confirm contract, Cancel (B-302 / F12) and B-129 / B-130 ---- */

/** Emulate DialogV2.wait: `(await button.callback(...)) ?? button.action`, with the test choosing which button to press. */
function stubDialogs(answers) {
  const seen = [];
  globalThis.foundry.applications = { api: { DialogV2: {
    async wait(config) {
      seen.push(config);
      // DialogV2 merges every option; an explicitly undefined one (for example `position`) throws inside Foundry.
      for (const [key, value] of Object.entries(config)) assert.notEqual(value, undefined, `DialogV2 option ${key} must not be undefined`);
      const answer = answers.shift() ?? { action: "cancel" };
      const button = config.buttons.find(entry => entry.action === answer.action);
      const control = { form: { elements: Object.fromEntries(Object.entries(answer.values ?? {}).map(([key, value]) => [key, { value, checked: value === true }])) } };
      control.closest = () => control.form;
      return (await button.callback?.({}, control, {})) ?? button.action;
    }
  } } };
  return seen;
}

test("U1 F12 / B-302: Martial DC prompt resolves to the chosen ability, and false on Cancel or close", async () => {
  u1World();
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  const seen = stubDialogs([{ action: "ok", values: { ability: "dex" } }, { action: "cancel" }, { action: "ok", values: { ability: "" } }, { action: "ok", values: { ability: "int" } }]);
  assert.equal(await askMartialAbility(actor, "Blade Art"), "dex");
  assert.equal(await askMartialAbility(actor, "Blade Art"), false, "Cancel is not an answer");
  assert.equal(await askMartialAbility(actor, "Blade Art"), false, "an empty answer is not an ability");
  assert.equal(await askMartialAbility(actor, "Blade Art"), false, "only STR or DEX are accepted");
  assert.match(seen[0].content, /<option value="str" selected>/, "starts on the higher modifier until a choice is stored");
  actor.flags.ak5e.guard.martialDCAbility = "dex";
  stubDialogs([{ action: "cancel" }]);
  assert.equal(await askMartialAbility(actor, "Blade Art"), false);
  const stored = stubDialogs([{ action: "cancel" }]);
  await askMartialAbility(actor, "Blade Art");
  assert.match(stored[0].content, /<option value="dex" selected>/, "starts on the stored choice");
});

test("U1 B-302: askPrompt never turns Cancel into the truthy action name", async () => {
  u1World();
  stubDialogs([{ action: "cancel" }, { action: "ok", values: { mode: "castle" } }, { action: "ok", values: { box: false } }]);
  const spec = reader => ({ window: { title: "t" }, content: "", ok: { label: "Review use", callback: (_e, target) => reader(target.form) } });
  assert.equal(await askPrompt(spec(form => form.elements.mode.value)), null);
  assert.equal(await askPrompt(spec(form => form.elements.mode.value)), "castle");
  assert.equal(await askPrompt(spec(form => form.elements.box.checked)), false, "an unchecked box stays distinguishable from Cancel");
});

test("U1 B-129: every Guard use confirms once with a real preview (cost, warnings) and Cancel writes nothing", async () => {
  u1World();
  const actor = guardFixture({ level: 5, aggression: 0 });
  const before = actor.writes.length;
  const seen = stubDialogs([{ action: "cancel" }]);
  assert.equal(await runGuardUse(actor, "Press the Attack: smite", "smite", { amount: 2 }), null);
  assert.equal(actor.writes.length, before, "Cancel changes nothing");
  assert.match(seen[0].content, /Cost:<\/strong> 2 Aggression/, "the confirm names the cost");
  assert.match(seen[0].content, /2 Aggression needed and 0 remain/, "and lists the warning");
  assert.equal(seen[0].buttons[0].label, "Use anyway");
  assert.equal(seen.length, 1, "no further dialog and no spend after Cancel");

  const confirmed = stubDialogs([{ action: "use" }]);
  const result = await runGuardUse(actor, "Press the Attack: smite", "smite", { amount: 2 });
  assert.equal(confirmed.length, 1, "confirmed exactly once: the override warning does not ask a second time");
  assert.ok(result, "the use ran");
  assert.equal(aggression(actor).value, 0, "an overspent resource clamps at 0");
  assert.match(guardUses.receipt(actor, guardUses.uses(actor)[0].id).shortfalls[0], /Aggression short by 2/);

  const given = stubDialogs([]);
  const pre = guardFixture({ level: 5, aggression: 4 });
  await runGuardUse(pre, "Smite", "smite", { amount: 1 }, { confirmed: true });
  assert.equal(given.length, 0, "a caller that already confirmed shows no second dialog");
  assert.equal(aggression(pre).value, 3);
});

test("U1 B-130: cancelling the Augmented Assault form spends no Aggression and records no use", async () => {
  u1World();
  const actor = guardFixture({ level: 13, branch: "artsblade", aggression: 4 });
  stubDialogs([{ action: "cancel" }]);
  await executeGuardDialog(actor, "augmentedAssault");
  assert.equal(aggression(actor).value, 4);
  assert.equal(guardUses.uses(actor).length, 0);
  stubDialogs([{ action: "ok", values: { unleash: false } }, { action: "cancel" }]);
  await executeGuardDialog(actor, "augmentedAssault");
  assert.equal(aggression(actor).value, 4, "an unchecked Unleash then Cancel on the confirm still changes nothing");
  stubDialogs([{ action: "ok", values: { unleash: false } }, { action: "use" }]);
  await executeGuardDialog(actor, "augmentedAssault");
  assert.equal(aggression(actor).value, 2);
  assert.equal(guardUses.receipt(actor, guardUses.uses(actor)[0].id).data.unleash, false, "unchecked Unleash is false, not cancellation");
});

test("U1: Cut Through Chaos from the sheet sends the selected native melee weapon", async () => {
  u1World();
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.resourcePools.cutThroughChaos = { value: 3, max: 3 };
  const sword = meleeWeapon(actor);
  stubDialogs([{ action: "ok", values: { mode: "spellAttack", weaponUuid: sword.uuid, incomingTotal: "18", incomingDC: "" } }, { action: "use" }]);
  await executeGuardDialog(actor, "cutThroughChaos");
  const receipt = guardUses.receipt(actor, guardUses.uses(actor)[0].id);
  assert.deepEqual(receipt.nativeAttack, { weaponUuid: sword.uuid, activityId: "melee" });
  assert.equal(receipt.data.incomingTotal, 18);
  assert.equal(receipt.formula, undefined, "no generic attack formula is rolled for the player");
});
