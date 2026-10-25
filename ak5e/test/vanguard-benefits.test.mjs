import test from "node:test";
import assert from "node:assert/strict";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor } from "./base-classes-fixture.mjs";
import { vanguardBenefitsEngine, vanguardBenefitPreRoll, vanguardBenefitPostMessage } from "../scripts/vanguard-benefits.mjs";

const managedEffect = (id, kind, bearerUuid = "Actor.bearer", value = 3) => ({
  _id: id, id, name: `Tip ${kind}`, disabled: false,
  flags: { ak5e: { vanguardUsesEffect: { opId: `giver-${id}`, sourceUseId: `giver-${id}`, sourceUuid: bearerUuid,
    createdAt: 100, standardBenefit: { kind, bearerUuid, value } } } }
});

test.beforeEach(() => setupFoundryGlobals());
test.afterEach(() => teardownFoundryGlobals());

test("Tip 1 arms without dice, cancellation keeps it ready, matching native damage ChatMessage consumes it, undo restores only the effect", async () => {
  const actor = createTestActor({ name: "Tip recipient" });
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [managedEffect("tip-damage", "tip1")]);
  effect.disabled = false;
  let message;
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : uuid === message?.uuid ? message : null;
  await vanguardBenefitsEngine.command(actor, "armTipDamage", { effectId: effect.id, componentIndex: 1, confirmed: true }, "tip-benefit-arm");
  const receipt = vanguardBenefitsEngine.receipt(actor, "tip-benefit-arm");
  assert.equal(receipt.status, "awaitingNativeRoll");
  assert.equal(effect.disabled, false);
  const firstRoll = { parts: ["1d6"], options: {} }, roll = { parts: ["1d8"], options: {} };
  const config = { subject: { actor }, rolls: [firstRoll, roll] }, messageConfig = {};
  vanguardBenefitPreRoll(config, {}, messageConfig);
  assert.deepEqual(firstRoll.parts, ["1d6"]);
  assert.deepEqual(roll.parts, ["1d8", "3"], "native config receives the bonus but no die is evaluated here");
  vanguardBenefitPreRoll(config, {}, messageConfig);
  assert.deepEqual(roll.parts, ["1d8", "3"], "duplicate native pre-roll hook does not add the bonus twice");
  assert.equal(vanguardBenefitsEngine.receipt(actor, "tip-benefit-arm").status, "awaitingNativeRoll", "cancel has no post message and leaves the receipt armed");
  const marker = roll.options._ak5eVanguardTipDamage;
  message = { documentName: "ChatMessage", uuid: "ChatMessage.native-damage", author: { id: game.user.id },
    speaker: { actor: actor.id }, flags: { dnd5e: { roll: { type: "damage" } }, ak5e: messageConfig.data.flags.ak5e }, rolls: [roll] };
  await vanguardBenefitPostMessage(message, game.user.id);
  assert.equal(vanguardBenefitsEngine.receipt(actor, "tip-benefit-arm").status, "complete");
  assert.equal(vanguardBenefitsEngine.receipt(actor, "tip-benefit-arm").nativeRoll.chatMessageUuid, message.uuid);
  assert.equal(effect.disabled, true);
  assert.equal(marker.useId, "tip-benefit-arm");
  await vanguardBenefitsEngine.command(actor, "undoUse", { useId: "tip-benefit-arm" }, "undo-tip-benefit-arm");
  assert.equal(effect.disabled, false, "undo restores a still-present benefit it consumed");
});

test("Tip 1 rejects an unmanaged effect and a non-damage or foreign-author ChatMessage", async () => {
  const actor = createTestActor({ name: "Tip recipient" });
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{ _id: "unmanaged", id: "unmanaged", name: "Lookalike", disabled: false,
    flags: { ak5e: { standardBenefit: { kind: "tip1", bearerUuid: "Actor.bearer", value: 9 } } } }]);
  await assert.rejects(() => vanguardBenefitsEngine.command(actor, "armTipDamage", { effectId: effect.id, confirmed: true }, "fake-tip-arm"), /managed Tip/);
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
  const foreign = { documentName: "ChatMessage", author: { id: "other" }, speaker: { actor: actor.id },
    flags: { dnd5e: { roll: { type: "damage" } } }, rolls: [{ options: { _ak5eVanguardTipDamage: { actorUuid: actor.uuid, useId: "fake", effectId: "unmanaged", kind: "tipBenefitEffect" } } }] };
  await vanguardBenefitPostMessage(foreign, "other");
  assert.equal(vanguardBenefitsEngine.uses(actor).length, 0);
});

test("Tip 6 multiplies only a committed positive SP gain by active benefit count, caps, dedupes, and undoes by delta", async () => {
  const actor = createTestActor({ name: "Tip recipient", flags: { ak5e: { operatorSkills: { enabled: true, points: 18, maximum: 20,
    receipts: [{ id: "base-gain-1", before: 14, after: 18, gained: 4 }], operatorEvents: [] } } } });
  await actor.createEmbeddedDocuments("ActiveEffect", [managedEffect("tip-sp-1", "tip6"), managedEffect("tip-sp-2", "tip6")]);
  await vanguardBenefitsEngine.command(actor, "tipSkillPointBonus", { effectId: "tip-sp-1", eventId: "base-gain-1", amount: 999,
    confirmed: true, overrides: ["timing-unverified"] }, "tip6-bonus-1");
  const operator = actor.getFlag("ak5e", "operatorSkills");
  assert.equal(operator.points, 20);
  assert.equal(vanguardBenefitsEngine.receipt(actor, "tip6-bonus-1").result.requested, 8, "caller-supplied amount is ignored");
  await assert.rejects(() => vanguardBenefitsEngine.command(actor, "tipSkillPointBonus", { effectId: "tip-sp-2", eventId: "base-gain-1",
    confirmed: true, overrides: ["timing-unverified"] }, "tip6-bonus-duplicate"), /already received/);
  await actor.update({ "flags.ak5e.operatorSkills.points": 19 });
  await vanguardBenefitsEngine.command(actor, "undoUse", { useId: "tip6-bonus-1" }, "undo-tip6-bonus");
  assert.equal(actor.getFlag("ak5e", "operatorSkills").points, 17, "undo removes only the two SP the benefit actually added, preserving the later one-point delta");
});

test("Tip 6 refuses a gain known to predate the active benefit or known to be invalidated", async () => {
  const actor = createTestActor({ name: "Late Tip recipient", flags: { ak5e: { operatorSkills: { enabled: true, points: 1, maximum: 20,
    receipts: [{ id: "old-gain", before: 0, after: 1, gained: 1, createdAt: 50 }], operatorEvents: [] } } } });
  await actor.createEmbeddedDocuments("ActiveEffect", [managedEffect("late-tip-sp", "tip6")]);
  await assert.rejects(() => vanguardBenefitsEngine.command(actor, "tipSkillPointBonus", {
    effectId: "late-tip-sp", eventId: "old-gain", confirmed: true
  }, "late-tip-reject"), /created after/);
  const operator = actor.getFlag("ak5e", "operatorSkills");
  operator.receipts[0].createdAt = 200;
  operator.receipts[0].undone = true;
  await actor.update({ "flags.ak5e.operatorSkills": operator });
  await assert.rejects(() => vanguardBenefitsEngine.command(actor, "tipSkillPointBonus", {
    effectId: "late-tip-sp", eventId: "old-gain", confirmed: true
  }, "undone-tip-reject"), /undone or invalidated/);
});
