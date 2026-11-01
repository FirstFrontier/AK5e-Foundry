import test from "node:test";
import assert from "node:assert/strict";
import { vanguardExtensionContext, vanguardOwnerControls } from "../scripts/vanguard-extensions.mjs";
import { vanguardUses } from "../scripts/vanguard-uses.mjs";
import { emitAk5eEvent } from "../scripts/trigger-events.mjs";
import { registerAgentFeatureHooks } from "../scripts/agent-features.mjs";
import { registerAgentVanguardExtension } from "../scripts/agent-sheet.mjs";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem } from "./base-classes-fixture.mjs";

function agent(level = 10, { owner = true, extra = {} } = {}) {
  const klass = createTestItem({ name: "Vanguard", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-vanguard" } } });
  const branch = createTestItem({ name: "Agent", type: "subclass", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: "subclass-vanguard-agent" } } });
  return createTestActor({ name: "Agent", owner, items: [klass, branch], flags: { ak5e: { vanguard: { enabled: true } } }, ...extra });
}
function weapon(actor, name, { ranged = false, thrown = false } = {}) {
  const item = createTestItem({ name, type: "weapon", system: { actionType: ranged ? "rwak" : "mwak", properties: new Set(thrown ? ["thr"] : []) } }, actor);
  actor.items.set(item.id, item);
  return item;
}
function runtime(actor, level = 10) {
  registerAgentFeatureHooks(); registerAgentVanguardExtension();
  const context = vanguardExtensionContext(actor, { branchId: "subclass-vanguard-agent", level, purpose: "controls" });
  const controls = vanguardOwnerControls(context);
  const control = pattern => {
    const found = controls.find(item => pattern.test(`${item.label} ${item.hint}`));
    assert.ok(found, `Agent owner control exists for ${pattern}`);
    return found;
  };
  return { context, control };
}
async function hit(actor, item, target, id) {
  const snapshot = { uuid: target.uuid, name: target.name, hit: true, ac: 10 };
  const common = { actorUuid: actor.uuid, itemUuid: item.uuid, attackId: id, targets: [snapshot], targetUuids: [target.uuid] };
  await emitAk5eEvent("attack", { ...common, eventId: `attack:${id}` });
  await emitAk5eEvent("hit", { ...common, eventId: `hit:${id}`, targetUuid: target.uuid });
}
async function closeCase(actor, context, control, target, useId, overrides = []) {
  const data = { targetUuid: target.uuid, targetName: target.name, targetVisible: true, targetDistanceFeet: 10,
    confirmed: true, overrides };
  await vanguardUses.command(actor, "agentShadowstrike", { invisibleAtActionStart: true, confirmed: true }, `${useId}-shadowstrike`);
  return vanguardUses.command(actor, control.command, data, useId);
}

test.beforeEach(() => setupFoundryGlobals());
test.afterEach(() => teardownFoundryGlobals());

test("Fade's manual forced-save end control works; unrelated turns do not expire Fade, the Agent's next turn does", async () => {
  const actor = agent(5), { control } = runtime(actor, 5);
  game.user = { id: "player", isGM: false, targets: new Set() };
  game.combat = { started: true, round: 2, turn: 0, combatant: { actor: createTestActor({ name: "Other turn" }) } };
  const fade = control(/Fade/i), endFade = control(/End Fade/i);
  const setup = { inDarkness: false, expiry: "endOfNextTurn", confirmed: true };
  await vanguardUses.command(actor, fade.command, setup, "attack-fade");
  assert.equal(actor.flags.ak5e.agent.fade.active, true, "non-GM owner can Fade outside their turn");
  await emitAk5eEvent("save", { eventId: "forced-save", actorUuid: createTestActor({ name: "Save target" }).uuid, ability: "dex" });
  assert.equal(actor.flags.ak5e.agent.fade.active, true, "the save adapter has no source attribution; owner can end Fade from its explicit control");
  await vanguardUses.command(actor, endFade.command, { confirmed: true }, "attack-fade-after-save");
  assert.equal(actor.flags.ak5e.agent.fade.active, false, "End Fade removes the effect after a forced save");

  await vanguardUses.command(actor, fade.command, setup, "attack-fade-turn-expiry");
  await emitAk5eEvent("turnStart", { eventId: "other-start", actorUuid: game.combat.combatant.actor.uuid });
  await emitAk5eEvent("turnEnd", { eventId: "other-end", actorUuid: game.combat.combatant.actor.uuid });
  assert.equal(actor.flags.ak5e.agent.fade.active, true, "another Creature's turn does not expire Fade");
  await emitAk5eEvent("turnStart", { eventId: "agent-next-start", actorUuid: actor.uuid });
  await emitAk5eEvent("turnEnd", { eventId: "agent-next-end", actorUuid: actor.uuid });
  assert.equal(actor.flags.ak5e.agent.fade.active, false, "Fade expires at the end of the Agent's next Turn");
});

test("Closing the Case applies Piercing resistance after the owner clicks its damage roll", async () => {
  const actor = agent(10), { control } = runtime(actor, 10), target = createTestActor({ name: "Resistant target",
    hp: { value: 20, max: 20, temp: 2 }, system: { traits: { dr: { value: new Set(["piercing"]) } } } });
  game.user = { id: "player", isGM: false, targets: new Set() };
  const knife = weapon(actor, "Thrown Knife", { ranged: true, thrown: true });
  await hit(actor, knife, target, "case-resistance-hit");
  await closeCase(actor, null, control(/Closing the Case/i), target, "case-resistance");
  assert.equal(vanguardUses.receipt(actor, "case-resistance").status, "awaitingRoll", "no damage is applied before the explicit card roll");
  const OriginalRoll = globalThis.Roll;
  globalThis.Roll = class extends OriginalRoll { async evaluate(...args) { const value = await super.evaluate(...args); value.total = 8; return value; } };
  try { await vanguardUses.command(actor, "useRoll", { useId: "case-resistance" }, "case-resistance-roll"); }
  finally { globalThis.Roll = OriginalRoll; }
  assert.equal(target.system.attributes.hp.temp, 0, "damage consumes temporary HP first");
  assert.equal(target.system.attributes.hp.value, 18, "Piercing resistance halves the 8 damage before the remaining amount reaches HP");
});

test("Closing the Case excludes ranged weapon hits without the Thrown property", async () => {
  const actor = agent(10), { control } = runtime(actor, 10), target = createTestActor({ name: "Not a thrown hit" });
  const ranged = weapon(actor, "Bow", { ranged: true });
  game.user = { id: "player", isGM: false, targets: new Set() };
  await hit(actor, ranged, target, "case-non-thrown-ranged-hit");
  const attack = control(/Closing the Case/i);
  await vanguardUses.command(actor, "agentShadowstrike", { invisibleAtActionStart: true, confirmed: true }, "case-non-thrown-shadowstrike");
  const setup = await attack.prepare(vanguardExtensionContext(actor, { branchId: "subclass-vanguard-agent", level: 10,
    purpose: "controls", targetUuid: target.uuid, targetVisible: true, targetDistanceFeet: 10 }));
  assert.equal(setup.qualifyingHitCount, 0, "a ranged hit without Thrown contributes no Closing the Case die");
  const preview = vanguardUses.preview(actor, attack.command, { ...setup });
  assert.ok(preview.warnings.some(warning => /qualifying hit/i.test(warning.text)), "the zero-hit use is publicly warned");
});

test("Closing the Case relays only its rolled damage to the GM for an unowned target and undo relays the reversal", async () => {
  const actor = agent(10), { control } = runtime(actor, 10), target = createTestActor({ name: "GM-owned target", owner: false, hp: { value: 20, max: 20, temp: 3 } });
  const gm = game.users.activeGM, player = { id: "player", isGM: false, targets: new Set() };
  game.users = new Map([[gm.id, gm], [player.id, player]]); game.users.activeGM = gm; game.user = player;
  actor.ownership = { default: 0, player: 3 }; actor.isOwner = true;
  target.ownership = { default: 0, [gm.id]: 3 }; target.isOwner = false;
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : uuid === target.uuid ? target : null;
  const knife = weapon(actor, "Relay Knife", { ranged: true, thrown: true });
  await hit(actor, knife, target, "case-relay-hit");
  await closeCase(actor, null, control(/Closing the Case/i), target, "case-relay");
  const OriginalRoll = globalThis.Roll;
  globalThis.Roll = class extends OriginalRoll { async evaluate(...args) { const value = await super.evaluate(...args); value.total = 7; return value; } };
  const requests = new Set();
  const nextRequest = async () => {
    for (let i = 0; i < 2000; i++) {
      const found = game.messages.find(message => Object.keys(message.flags?.ak5e ?? {}).some(key => /RelayRequest/.test(key)) && !requests.has(message));
      if (found) { requests.add(found); return found; }
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.fail("validated target change produced no GM relay request");
  };
  const gmHandle = async request => {
    game.user = gm; target.isOwner = true;
    try { await vanguardUses.handleRelay(request, {}, player.id); }
    finally { target.isOwner = false; game.user = player; }
    Hooks.call("updateChatMessage", request);
  };
  try {
    const rolling = vanguardUses.command(actor, "useRoll", { useId: "case-relay" }, "case-relay-roll").then(value => ({ value }), error => ({ error }));
    const applyRequest = await nextRequest();
    assert.equal(target.system.attributes.hp.value, 20, "player does not mutate the unowned target directly");
    await gmHandle(applyRequest);
    const rolled = await rolling;
    assert.ok(rolled.value, `GM-applied roll finishes: ${rolled.error?.message ?? ""}`);
    assert.equal(target.system.attributes.hp.temp, 0, "GM relay applies the rolled damage to temporary HP first");
    assert.equal(target.system.attributes.hp.value, 16, "only remaining damage reduces target HP");

    const undoing = vanguardUses.command(actor, "undoUse", { useId: "case-relay", confirmed: true }, "case-relay-undo").then(value => ({ value }), error => ({ error }));
    const undoRequest = await nextRequest(); await gmHandle(undoRequest);
    const undone = await undoing;
    assert.ok(undone.value, `GM-applied undo completes: ${undone.error?.message ?? ""}`);
    assert.equal(target.system.attributes.hp.temp, 3, "undo restores the exact prior temporary HP");
    assert.equal(target.system.attributes.hp.value, 20, "undo restores the exact prior HP");
  } finally { globalThis.Roll = OriginalRoll; game.user = gm; }
});
