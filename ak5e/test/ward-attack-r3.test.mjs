/** Regression: native attack and damage cards differ but share their use-card origin. */
import test from "node:test";
import assert from "node:assert/strict";
import { medicUses } from "../scripts/medic-uses.mjs";
import { defineMedicPools, setLifeSupport } from "../scripts/medic-features.mjs";
import { clearPoolRegistry } from "../scripts/resource-pools.mjs";
import { setReactionStore, flagReactionStore } from "../scripts/trigger-events.mjs";
import { applyArtDamageResolvers } from "../scripts/art-correlation.mjs";
import { registerWardHooks, wardDamageResolver } from "../scripts/ward-features.mjs";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem } from "./base-classes-fixture.mjs";

test.before(async () => {
  setupFoundryGlobals({ isGM: false, worldTime: 300, settings: { "ak5e.artReceiptEpoch": 0 } });
  defineMedicPools();
  await registerWardHooks();
});
test.after(() => teardownFoundryGlobals());

function medic(id) {
  clearPoolRegistry(); defineMedicPools(); setReactionStore(flagReactionStore);
  const actor = createTestActor({
    name: id, level: 15, abilities: { dex: { value: 12, mod: 1 }, wis: { value: 16, mod: 3 } },
    system: { details: { type: { value: "humanoid" } }, attributes: { hp: { value: 40, max: 40, temp: 0 } } }
  });
  actor.flags.ak5e.medic = { enabled: true, spellcastingAbility: "wis", spellDC: 15 };
  actor.flags.ak5e.resourcePools = { lifeSupport: { value: 100, max: 125 } };
  actor.items.set("class", createTestItem({ id: "class", type: "class", name: "Medic", system: { levels: 15 }, flags: { ak5e: { chapterThreeId: "class-medic" } } }, actor));
  actor.items.set("subclass", createTestItem({ id: "subclass", type: "subclass", name: "Ward", flags: { ak5e: { chapterThreeId: "subclass-medic-ward" } } }, actor));
  setLifeSupport(actor, 100, "r3 fixture");
  actor.uuid = `Actor.${id}`;
  globalThis._ak5eTestDocs.set(actor.uuid, actor); game.actors.set(actor.id, actor);
  return actor;
}
function patient(name, temp = 0) {
  return createTestActor({ name, system: { details: { type: { value: "humanoid" } }, attributes: { hp: { value: 40, max: 40, temp } } } });
}
function ward(target, source, amount) {
  target.system.attributes.hp.temp = amount;
  target.flags.ak5e.ward = { medicUuid: source.uuid, grantedAt: "r3", amount, observedTemp: amount };
}
function msg(id, origin) {
  return { uuid: `ChatMessage.${id}`, flags: { dnd5e: origin === undefined ? {} : { originatingMessage: origin } } };
}

test("R3 H2: failed Treat binds distinct attack and damage cards via their shared use-card, survives serialization and undo", async () => {
  const source = medic("R3Correlation"), target = patient("Warded"), attacker = patient("Attacker");
  ward(target, source, 8);
  const attack = msg("attack", "use-one"), damage = msg("damage", "use-one"), other = msg("other", "use-two");
  globalThis._ak5eTestDocs.set(attack.uuid, attack);
  await medicUses.command(source, "treatTheCause", { confirmed: true, targetUuid: target.uuid, attackerUuid: attacker.uuid,
    attackerDistanceFeet: 10, saveDC: 15, ownerRoll2d10: 11, ownerRollDexSave: 8, attackMessageUuid: attack.uuid }, "r3-treat");
  const receipt = source.flags.ak5e.medicUses.undo.find(use => use.id === "r3-treat");
  assert.equal(receipt.wardCorrelation.originatingMessage, "use-one");
  source.flags.ak5e.medicUses = JSON.parse(JSON.stringify(source.flags.ak5e.medicUses));
  const context = message => ({ actor: target, amount: 6, message, messageUuid: message.uuid });
  assert.equal(wardDamageResolver(context(damage)).reduce, 6);
  assert.equal(wardDamageResolver(context(attack)).reduce, 6);
  assert.equal(wardDamageResolver(context(other)), null);
  assert.equal(wardDamageResolver(context(msg("no-origin"))), null);
  assert.equal(wardDamageResolver({ ...context(damage), actor: attacker }), null);
  const updates = { "system.attributes.hp.temp": 2, "system.attributes.hp.value": 40 };
  applyArtDamageResolvers(target, 6, updates, { originatingMessage: damage });
  assert.equal(updates["system.attributes.hp.temp"], 8, "native damage application is prevented");
  await medicUses.command(source, "undoUse", { useId: "r3-treat" }, "r3-undo");
  assert.equal(wardDamageResolver(context(damage)), null, "undone receipt no longer prevents damage");
});

test("R3 L4: receipt formula includes only the selected die and actual AP bonus", async () => {
  const source = medic("R3Formula"), target = patient("Formula");
  const plain = await medicUses.command(source, "wardGrant", { confirmed: true, targetUuid: target.uuid, healingAmount: 5, actionType: "action" }, "r3-plain");
  assert.equal(plain.formula, "5"); assert.equal(plain.die, null);
  const withDie = await medicUses.command(source, "wardGrant", { confirmed: true, targetUuid: target.uuid, healingAmount: 5, actionType: "action",
    fromArt: true, apSpent: 2, extraTempHP: true, ownerRoll1d8: 3, keepOrReplace: "replace" }, "r3-die");
  assert.equal(withDie.formula, "5 + 1d8 + 2"); assert.equal(withDie.die, 3);
  await assert.rejects(medicUses.command(source, "wardGrant", { confirmed: true, targetUuid: target.uuid, healingAmount: 5,
    actionType: "action", extraTempHP: true, ownerRoll1d8: 9 }, "r3-bad-die"), /1-8/);
});


test("R3 L1: reordered identical donor provenance permits commit, changed provenance blocks", async () => {
  const source = medic("R3Order"), donor = patient("Donor"), target = patient("Recipient");
  ward(donor, source, 6); ward(target, source, 1);
  const getFlag = donor.getFlag.bind(donor);
  let reads = 0;
  donor.getFlag = (module, key) => {
    const value = getFlag(module, key);
    if (module !== "ak5e" || key !== "ward" || !value) return value;
    reads++;
    if (reads === 1) return value;
    return Object.fromEntries(Object.entries(value).reverse());
  };
  await medicUses.command(source, "collectiveWard", { confirmed: true, targetUuid: target.uuid, damage: 5, recipientDistanceFeet: 10,
    donors: [{ uuid: donor.uuid, distanceFeet: 10 }], removals: { [donor.uuid]: 3 } }, "r3-ordered");
  assert.equal(donor.system.attributes.hp.temp, 3);
  ward(target, source, 1);
  const changed = patient("Changed"); ward(changed, source, 6);
  const getChanged = changed.getFlag.bind(changed);
  let changedReads = 0;
  changed.getFlag = (module, key) => {
    const value = getChanged(module, key);
    if (module !== "ak5e" || key !== "ward" || !value) return value;
    changedReads++;
    return changedReads === 1 ? value : { ...value, grantedAt: "different" };
  };
  await assert.rejects(medicUses.command(source, "collectiveWard", { confirmed: true, targetUuid: target.uuid, damage: 5, recipientDistanceFeet: 10,
    donors: [{ uuid: changed.uuid, distanceFeet: 10 }], removals: { [changed.uuid]: 3 } }, "r3-changed"), /pool changed before commit/);
  assert.equal(changed.system.attributes.hp.temp, 6);
});

test("R3 L3: reuse on the same turn warns, new turn and undo do not", async () => {
  const source = medic("R3Regen");
  game.combat = { started: true, uuid: "Combat.r3", round: 1, turn: 0, combatant: { actor: source } };
  const data = { confirmed: true, targetUuid: source.uuid, turnStart: true, offerTurnKey: "Combat.r3:1:0" };
  await medicUses.command(source, "wardRegeneration", data, "r3-regen");
  source.system.attributes.hp.temp = 0; source.flags.ak5e.ward = null;
  const preview = medicUses.preview(source, "wardRegeneration", data);
  assert.ok(preview.warnings.some(w => w.id === "alreadyUsed"));
  await assert.rejects(medicUses.command(source, "wardRegeneration", data, "r3-reuse"), error => error.warnings?.some(w => w.id === "alreadyUsed"));
  await medicUses.command(source, "wardRegeneration", { ...data, overrides: ["alreadyUsed"] }, "r3-reuse-override");
  game.combat.turn = 1;
  source.system.attributes.hp.temp = 0; source.flags.ak5e.ward = null;
  assert.ok(!medicUses.preview(source, "wardRegeneration", { ...data, offerTurnKey: "Combat.r3:1:1" }).warnings.some(w => w.id === "alreadyUsed"));
  const other = medic("R3UndoRegen");
  game.combat = { started: true, uuid: "Combat.r3undo", round: 1, turn: 0, combatant: { actor: other } };
  const otherData = { confirmed: true, targetUuid: other.uuid, turnStart: true, offerTurnKey: "Combat.r3undo:1:0" };
  await medicUses.command(other, "wardRegeneration", otherData, "r3-regen-undo");
  await medicUses.command(other, "undoUse", { useId: "r3-regen-undo" }, "r3-undo-regen");
  assert.ok(!medicUses.preview(other, "wardRegeneration", otherData).warnings.some(w => w.id === "alreadyUsed"));
  game.combat = null;
});
