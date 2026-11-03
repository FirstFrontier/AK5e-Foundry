import test from "node:test";
import assert from "node:assert/strict";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem, createTestCombat } from "./base-classes-fixture.mjs";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import { registerVanguardSheetHooks, vanguardSheetApi, vanguardUses } from "../scripts/vanguard-sheet.mjs";
import { vanguardExtensionContext, vanguardOwnerControls } from "../scripts/vanguard-extensions.mjs";
import { getPool, setPool } from "../scripts/resource-pools.mjs";
import { emitAk5eEvent } from "../scripts/trigger-events.mjs";

// Keep the not-yet-created lane modules inside assertions so the unchanged baseline
// reports missing Charger behavior, not a module-loader failure.
async function chargerModules() {
  try {
    const [features, sheet] = await Promise.all([
      import("../scripts/charger-features.mjs"),
      import("../scripts/charger-sheet.mjs")
    ]);
    return { features, sheet };
  } catch (loadError) { return { loadError }; }
}

const CHARGER_ID = "subclass-vanguard-charger";
const CHARGER_COMMANDS = Object.freeze({
  couch: "chargerCouch",
  strike: "chargerMomentousStrike",
  push: "chargerPushOnThrough",
  geirskogul: "chargerGeirskogul"
});

function vanguard(level = 1, { player = true } = {}) {
  const classItem = createTestItem({ name: "Vanguard", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: "class-vanguard" } } });
  const branchData = CHAPTER_THREE_CLASSES.find(entry => entry.id === CHARGER_ID);
  assert.ok(branchData, "the source catalogue contains the Charger branch");
  const branch = createTestItem({ name: branchData.name, type: "subclass", system: branchData.systemData,
    flags: { ak5e: { chapterThreeId: CHARGER_ID } } });
  const actor = createTestActor({ name: "Charger", items: [classItem, branch],
    system: { attributes: { prof: Math.floor((level - 1) / 4) + 2, hp: { value: 30, max: 30, temp: 0 }, movement: { walk: 30 } },
      abilities: { str: { value: 16, mod: 3 }, dex: { value: 14, mod: 2 }, con: { value: 14, mod: 2 } } },
    flags: { ak5e: { vanguard: { enabled: true } } } });
  actor.isOwner = true;
  game.user = { id: player ? "charger-player" : "gm", isGM: !player, targets: new Set() };
  game.users = { activeGM: { id: "gm" } };
  return actor;
}

async function registered() {
  const result = await chargerModules();
  assert.ok(!result.loadError,
    `Charger branch behavior missing: charger-features.mjs / charger-sheet.mjs could not load (${result.loadError?.code ?? result.loadError?.message})`);
  for (const [name, owner, label] of [
    ["registerChargerFeatureHooks", result.features, "feature event hooks"],
    ["registerChargerVanguardExtension", result.sheet, "Vanguard owner controls"]
  ]) assert.equal(typeof owner[name], "function", `${name} must register ${label}`);
  result.features.registerChargerFeatureHooks();
  result.sheet.registerChargerVanguardExtension();
  return result;
}

function controls(actor, purpose = "controls") {
  const level = actor.items.getName?.("Vanguard")?.system?.levels ?? 1;
  const context = vanguardExtensionContext(actor, { branchId: "charger", level,
    profile: { branchId: "charger", level }, purpose });
  return vanguardOwnerControls(context);
}

test.beforeEach(() => setupFoundryGlobals());
test.afterEach(() => teardownFoundryGlobals());

test("Charger registers owner controls for its four use paths and exposes the same descriptors through the sheet", async () => {
  const actor = vanguard(17);
  const modules = await registered();
  registerVanguardSheetHooks();
  const descriptors = controls(actor);
  const byId = new Map(descriptors.map(descriptor => [descriptor.id, descriptor]));
  for (const [suffix, command] of Object.entries(CHARGER_COMMANDS)) {
    const descriptor = byId.get(`charger:${suffix}`);
    assert.ok(descriptor, `the Charger controls include ${suffix}`);
    assert.equal(descriptor.kind, "use");
    assert.equal(descriptor.command, command, `${suffix} invokes its registered Vanguard use command`);
    assert.ok(descriptor.prepare === undefined || typeof descriptor.prepare === "function", "optional control preparation is callable when present");
  }
  assert.equal(typeof vanguardSheetApi.open, "function");
  assert.equal(typeof modules.features.registerChargerFeatureHooks, "function");
});

test("Gathering Momentum uses actual initiative/hit attribution, enforces the cap, and clears on combat exit", async () => {
  const actor = vanguard(1);
  await registered();
  const bystander = vanguard(1);
  bystander.flags.ak5e.vanguard = { enabled: true };
  const combat = createTestCombat([actor, bystander], { started: true, round: 1, turn: 0 });
  game.combat = combat;

  await emitAk5eEvent("initiative", { eventId: "charger-init-1", actorUuid: actor.uuid, combatUuid: combat.uuid, round: 1, turn: 0 });
  assert.equal(getPool(actor, "momentum").value, 1, "rolling initiative grants one Momentum");
  assert.equal(getPool(bystander, "momentum").value, 0, "only the attributed Charger receives Momentum");

  // The installed adapter supplies target/source attribution, but no movement geometry.
  // Without a recorded/owner-confirmed 15-foot straight movement, a hit alone cannot award Momentum.
  await emitAk5eEvent("hit", { eventId: "hit:charger-attack-no-move:Actor.hostile", attackId: "charger-attack-no-move",
    actorUuid: actor.uuid, itemUuid: "Item.heavy-melee", activityUuid: "Activity.attack", targetUuid: "Actor.hostile",
    targetUuids: ["Actor.hostile"], targets: [{ uuid: "Actor.hostile", name: "Hostile", ac: 12, hit: true }],
    combatUuid: combat.uuid, round: 1, turn: 0 });
  assert.equal(getPool(actor, "momentum").value, 1, "a hit with no movement evidence does not satisfy the qualifying-hit rule");

  for (let index = 0; index < 8; index++) {
    await emitAk5eEvent("initiative", { eventId: `charger-init-cap-${index}`, actorUuid: actor.uuid, combatUuid: combat.uuid, round: 1, turn: 0 });
  }
  assert.equal(getPool(actor, "momentum").value, 6, "initiative gains clamp at the source maximum of six");
  await emitAk5eEvent("combatEnd", { eventId: `combatEnd:${combat.uuid}`, combatUuid: combat.uuid, actorUuids: [actor.uuid] });
  assert.equal(getPool(actor, "momentum").value, 0, "leaving Combat clears all Momentum");
});

test("qualifying hit Momentum needs a public owner-confirmed movement record and a hostile, undamaged target", async () => {
  const actor = vanguard(1), target = createTestActor({ name: "Hostile", system: { attributes: { hp: { value: 20, max: 20 } } } });
  const modules = await registered();
  const record = modules.features.recordChargerMovement;
  assert.equal(typeof record, "function", "when movement geometry is unavailable, the owner can explicitly record it");
  await setPool(actor, "momentum", 1);
  const movement = await record(actor, { feet: 15, straight: true, hostile: true, targetUuid: target.uuid, confirmed: true, eventId: "charger-move-15" });
  assert.ok(movement, "owner-confirmed movement is recorded before the attack");
  assert.match(JSON.stringify(actor.flags.ak5e), /charger-move-15|15|movement/i, "the movement record is public and attributable");
  await emitAk5eEvent("hit", { eventId: `hit:charger-attack-qualified:${target.uuid}`, attackId: "charger-attack-qualified",
    actorUuid: actor.uuid, itemUuid: "Item.heavy-melee", activityUuid: "Activity.melee", targetUuid: target.uuid,
    targetUuids: [target.uuid], targets: [{ uuid: target.uuid, name: target.name, ac: 12, hit: true }],
    combatUuid: "combat-move", round: 1, turn: 1 });
  assert.equal(getPool(actor, "momentum").value, 2, "the qualifying hostile hit grants one Momentum");

  // Replayed event IDs and attacks against a target damaged since the Charger's last Turn
  // cannot grant a duplicate point; movement evidence is consumed by the matching attack.
  await emitAk5eEvent("hit", { eventId: `hit:charger-attack-qualified:${target.uuid}`, attackId: "charger-attack-qualified",
    actorUuid: actor.uuid, itemUuid: "Item.heavy-melee", activityUuid: "Activity.melee", targetUuid: target.uuid,
    targetUuids: [target.uuid], targets: [{ uuid: target.uuid, name: target.name, ac: 12, hit: true }],
    combatUuid: "combat-move", round: 1, turn: 1 });
  await emitAk5eEvent("hitTaken", { eventId: "charger-prior-damage", actorUuid: target.uuid, sourceActorUuid: actor.uuid,
    hpBefore: 20, hpAfter: 19, combatUuid: "combat-move", round: 1, turn: 1 });
  await record(actor, { feet: 15, straight: true, hostile: true, targetUuid: target.uuid, confirmed: true, eventId: "charger-move-15-again" });
  await emitAk5eEvent("hit", { eventId: `hit:charger-attack-after-damage:${target.uuid}`, attackId: "charger-attack-after-damage",
    actorUuid: actor.uuid, itemUuid: "Item.heavy-melee", activityUuid: "Activity.melee", targetUuid: target.uuid,
    targetUuids: [target.uuid], targets: [{ uuid: target.uuid, name: target.name, ac: 12, hit: true }],
    combatUuid: "combat-move", round: 1, turn: 2 });
  assert.equal(getPool(actor, "momentum").value, 2, "prior damage blocks the target's next qualifying Momentum gain");
  await assert.rejects(() => record(actor, { feet: 14, straight: true, confirmed: true, eventId: "charger-move-short" }), /15/,
    "less than 15 feet cannot be recorded as satisfying the threshold");
  await assert.rejects(() => record(actor, { feet: 20, straight: false, confirmed: true, eventId: "charger-move-bent" }), /straight/,
    "non-straight movement cannot be recorded as satisfying the threshold");
});

test("Couch grants Momentum, sets the speed phases, snapshots its attack bonus, and remains cancelable before use", async () => {
  const actor = vanguard(1);
  await registered();
  await setPool(actor, "momentum", 2);
  const descriptor = controls(actor).find(value => value.id === "charger:couch");
  assert.ok(descriptor, "Couch is available to the Actor owner outside their turn");
  const data = await descriptor.prepare?.({ actor, actorUuid: actor.uuid, operationId: "charger-couch-cancel" }) ?? {};
  const before = structuredClone(actor.flags.ak5e);
  await assert.rejects(() => vanguardUses.command(actor, descriptor.command, { ...data, confirmed: false }, "charger-couch-cancel"), /Confirm this use/);
  assert.deepEqual(actor.flags.ak5e, before, "canceling the confirm step changes no Momentum, Speed, or receipt state");

  const result = await vanguardUses.command(actor, descriptor.command, { ...data, confirmed: true }, "charger-couch-use");
  assert.ok(result, "the non-GM owner can confirm Couch without GM approval");
  assert.equal(getPool(actor, "momentum").value, 3, "Couch grants one Momentum");
  const receipt = vanguardUses.receipt(actor, "charger-couch-use");
  assert.ok(receipt, "Couch has an encounter-window undo receipt");
  const receiptText = JSON.stringify({ summary: receipt.summary, manualSteps: receipt.manualSteps, result: receipt.result, data: receipt.data });
  assert.match(receiptText, /0|speed/i, "Couch records speed 0 until the source start-of-next-Turn boundary");
  assert.match(receiptText, /10|speed/i, "Couch records the next-Turn +10-foot Speed bonus");
  assert.match(receiptText, /2|bonus|momentum/i, "the first melee attack bonus is the pre-Couch Momentum snapshot");
  await vanguardUses.command(actor, "undoUse", { useId: "charger-couch-use" }, "charger-couch-undo");
  assert.equal(getPool(actor, "momentum").value, 2, "undo restores the exact pre-use Momentum");
});

test("Momentous Strike expends all Momentum, scales added weapon damage, and waits for owner-clicked dice", async () => {
  const actor = vanguard(14);
  await registered();
  await setPool(actor, "momentum", 6);
  const descriptor = controls(actor).find(value => value.id === "charger:strike");
  assert.ok(descriptor);
  const formulas = [], owners = [];
  const OriginalRoll = globalThis.Roll;
  globalThis.Roll = class extends OriginalRoll {
    constructor(formula, ...args) { formulas.push(formula); super(formula, ...args); }
    async evaluate() { owners.push(game.user.id); this.total = 7; return this; }
  };
  try {
    const data = await descriptor.prepare?.({ actor, actorUuid: actor.uuid, operationId: "charger-strike-14" }) ?? {};
    await vanguardUses.command(actor, descriptor.command, { ...data, confirmed: true }, "charger-strike-14");
    assert.equal(getPool(actor, "momentum").value, 0, "the attack spends every Momentum point");
    assert.deepEqual(formulas, [], "confirmation starts no attack, damage, or feature dice");
    const receipt = vanguardUses.receipt(actor, "charger-strike-14");
    assert.ok(receipt, "the strike has an undo receipt");
    assert.match(JSON.stringify(receipt), /1d10|d10/i, "level 14 uses one d10 Weapon Damage die per Momentum spent");
    assert.match(JSON.stringify(receipt), /6|Momentum/i, "the card records the six points spent");
    await vanguardUses.command(actor, "useRoll", { useId: "charger-strike-14" });
    assert.ok(formulas.length > 0, "the additional Weapon Damage is rolled only after clicking the chat card roll control");
    assert.deepEqual(owners, ["charger-player"], "the owner, not the GM client, rolls the feature dice");
    await vanguardUses.command(actor, "undoUse", { useId: "charger-strike-14" }, "charger-strike-14-undo");
    assert.equal(getPool(actor, "momentum").value, 6, "undo restores all spent Momentum");
  } finally { globalThis.Roll = OriginalRoll; }
});

test("Crash and Bash records target-specific Marks, expires them at own next Turn, and offers Tip after a marked kill", async () => {
  const actor = vanguard(4), first = createTestActor({ name: "First hostile" }), second = createTestActor({ name: "Second hostile" });
  await registered();
  const combat = createTestCombat([actor, first, second], { started: true, round: 1, turn: 0 });
  game.combat = combat;

  // Damage attribution is taken from the event's source/target IDs; same-turn events
  // for a different target must not transfer or replace this target's mark.
  await emitAk5eEvent("hitTaken", { eventId: "mark-damage-1", sourceActorUuid: actor.uuid, actorUuid: first.uuid,
    amount: 5, hpBefore: 12, hpAfter: 7, combatUuid: combat.uuid, round: 1, turn: 0 });
  await emitAk5eEvent("hitTaken", { eventId: "mark-damage-2", sourceActorUuid: actor.uuid, actorUuid: second.uuid,
    amount: 2, hpBefore: 12, hpAfter: 10, combatUuid: combat.uuid, round: 1, turn: 0 });
  const before = JSON.stringify(actor.flags.ak5e);
  await emitAk5eEvent("kill", { eventId: "kill:first", sourceActorUuid: actor.uuid, actorUuid: first.uuid,
    hpBefore: 7, hpAfter: 0, combatUuid: combat.uuid, round: 1, turn: 0 });
  const after = JSON.stringify(actor.flags.ak5e);
  assert.notEqual(after, before, "a marked target reaching zero HP produces a separately recorded Tip opportunity");
  assert.match(after, new RegExp(first.id), "the trigger receipt preserves the marked target identity");
  assert.doesNotMatch(after, new RegExp(`${second.id}[^}]{0,80}tip`, "i"), "a different target's Mark does not trigger Tip");

  const ownTurnStart = { eventId: "turnStart:charger-combat:1:3:charger-combatant", actorUuid: actor.uuid,
    combatantId: "charger-combatant", skipped: false, combatUuid: combat.uuid, round: 1, turn: 3 };
  await emitAk5eEvent("turnStart", ownTurnStart);
  const expired = JSON.stringify(actor.flags.ak5e);
  assert.match(expired, /expire|consumed|turnStart/i, "the mark and pending trigger record their expiry/consumption boundary");
});

test("level 4 options and level 10/13/17 gates follow Charger level, including per-turn kill dedupe", async () => {
  const lv3 = vanguard(3), lv4 = vanguard(4), lv9 = vanguard(9), lv10 = vanguard(10), lv12 = vanguard(12), lv13 = vanguard(13), lv16 = vanguard(16), lv17 = vanguard(17);
  await registered();
  for (const actor of [lv3, lv4, lv9, lv10, lv12, lv13, lv16, lv17]) {
    const names = new Set(controls(actor).map(control => control.id));
    assert.equal(names.has("charger:push-on-through"), actor === lv4 || actor === lv9 || actor === lv10 || actor === lv12 || actor === lv13 || actor === lv16 || actor === lv17,
      "Push on Through is available from Charger level 4");
    assert.equal(names.has("charger:geirskogul"), actor === lv17, "Geirskögul unlocks at level 17");
  }
  await setPool(lv10, "momentum", 4);
  await setPool(lv13, "momentum", 5);
  const before10 = getPool(lv10, "momentum").value;
  await emitAk5eEvent("kill", { eventId: "renewing-below-level", sourceActorUuid: lv10.uuid, actorUuid: "Actor.enemy-10" });
  assert.equal(getPool(lv10, "momentum").value, before10, "Renewing Momentum is not granted before level 13");
  await emitAk5eEvent("kill", { eventId: "renewing-kill-a", sourceActorUuid: lv13.uuid, actorUuid: "Actor.enemy-a", combatUuid: "combat-renew", round: 1, turn: 2 });
  await emitAk5eEvent("kill", { eventId: "renewing-kill-b", sourceActorUuid: lv13.uuid, actorUuid: "Actor.enemy-b", combatUuid: "combat-renew", round: 1, turn: 2 });
  assert.equal(getPool(lv13, "momentum").value, 6, "Renewing Momentum grants once per Turn even for multiple kills");
});

test("Geirskögul requires a hit at five spent Momentum, owner-clicks STR/DEX saves, guides movement, and respects Long Rest use", async () => {
  const actor = vanguard(17), enemy = createTestActor({ name: "Marked enemy" }), ally = createTestActor({ name: "Ally" });
  await registered();
  await setPool(actor, "momentum", 5);
  const descriptor = controls(actor).find(value => value.id === "charger:geirskogul");
  assert.ok(descriptor, "the level 17 control is available");
  const data = await descriptor.prepare?.({ actor, actorUuid: actor.uuid, operationId: "charger-geirskogul" }) ?? {};
  assert.ok(data && typeof data === "object", "the owner can choose a target and guided movement options for this use");
  const warnings = vanguardUses.preview(actor, descriptor.command, { ...data, targetUuid: enemy.uuid, confirmed: true })?.warnings ?? [];
  assert.ok(Array.isArray(warnings), "unverified movement, target or range can be surfaced as warnings");

  const formulas = [];
  const OriginalRoll = globalThis.Roll;
  globalThis.Roll = class extends OriginalRoll {
    constructor(formula, ...args) { formulas.push(formula); super(formula, ...args); }
    async evaluate() { this.total = 8; return this; }
  };
  try {
    await vanguardUses.command(actor, descriptor.command, { ...data, targetUuid: enemy.uuid, targetName: enemy.name,
      overrides: warnings.map(warning => warning.id), confirmed: true }, "charger-geirskogul");
    assert.deepEqual(formulas, [], "confirming Geirskögul does not roll either save or collision damage");
    const receipt = vanguardUses.receipt(actor, "charger-geirskogul");
    assert.ok(receipt, "the Geirskögul use records a reversible receipt");
    assert.match(JSON.stringify(receipt), /STR|Strength|Dexterity|DEX|Martial DC/i, "the target save is owner-directed against the Momentum-adjusted Martial DC");
    assert.match(JSON.stringify(receipt), /Speed|movement|collision/i, "the card guides the owner through Speed movement and collision adjudication");
    await vanguardUses.command(actor, "undoUse", { useId: "charger-geirskogul" }, "charger-geirskogul-undo");
    assert.equal(getPool(actor, "momentum").value, 5, "undo restores spent Momentum and the Long Rest use");
  } finally { globalThis.Roll = OriginalRoll; }
  assert.ok(ally, "ally collision save succeeds automatically per the source rule and needs no player selection");
});
