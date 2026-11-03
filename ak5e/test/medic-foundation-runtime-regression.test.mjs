/** Post-candidate runtime regressions for the tier-2 Medic foundation repair addendum. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import * as MedicSetup from "../scripts/medic-setup.mjs";
import * as Ledger from "../scripts/arts-ledger.mjs";
import * as Arts from "../scripts/arts-casting.mjs";
import * as Damage from "../scripts/art-correlation.mjs";
import * as Trigger from "../scripts/trigger-events.mjs";

const FLAME = "standard-art-pool-flame-arts-3917";
let warnings, errors;
test.beforeEach(() => {
  warnings = []; errors = [];
  setupFoundryGlobals({ isGM: false, settings: { "ak5e.artReceiptEpoch": 0 },
    onWarn: message => warnings.push(message), onError: message => errors.push(message) });
});
test.afterEach(() => teardownFoundryGlobals());

function medic(id) {
  const actor = createTestActor({ id, name: "Runtime Medic", class: "class-medic", level: 1, owner: true,
    hp: { value: 20, max: 20, temp: 0 } });
  actor.type = "character";
  return actor;
}
function art(actor, id = "runtime-art") {
  const item = createTestItem({ id, type: "spell", name: "Runtime Art", system: { level: 1 },
    flags: { ak5e: { art: { enabled: true, pool: FLAME }, pool: FLAME } } }, actor);
  actor.items.set(id, item);
  return item;
}
function itemIds(receipt) { return (receipt?.items ?? []).map(item => item.id); }

class NativeActivity {
  constructor(actor, item) { this.actor = actor; this.item = item; this.type = "cast"; this.activation = { type: "reaction" }; }
  async use(usage = {}, dialog = {}, message = {}) {
    const workingUsage = { ...usage }, workingDialog = { ...dialog };
    const workingMessage = { data: structuredClone(message.data ?? {}), update: async () => {
      if (message.failUpdate) throw new Error("fixture: chat-card update rejected");
    } };
    for (const hook of Hooks._hooks.get("dnd5e.preUseActivity") ?? []) {
      if (hook(this, workingUsage, workingDialog, workingMessage) === false) return null;
    }
    const updates = { actor: {} };
    for (const hook of Hooks._hooks.get("dnd5e.activityConsumption") ?? []) {
      if (hook(this, workingUsage, workingMessage, updates) === false) return null;
    }
    if (!Object.keys(updates.actor).length) return null;
    await this.actor.update(updates.actor);
    return { message: workingMessage };
  }
  async consume() {}
  async _prepareUsageConfig() {}
}
function prepareReactionCast(actor, item) {
  actor.flags.ak5e.casting = { enabled: true, ability: "wis", recovery: "long", castingUnit: "focus" };
  actor.items.set("focus", createTestItem({ id: "focus", type: "weapon", name: "Arts Wand",
    system: { equipped: true }, flags: { ak5e: { tableData: { properties: "Casting Unit" } } } }, actor));
  actor.flags.ak5e.artsPoints = { maximum: 10, value: 10, maximumArtLevel: 5, ninthLevelCast: false };
  actor.flags.ak5e.reactionBudget = { max: 1, spent: 0, extra: [], triggers: {}, receipts: {} };
  Arts.wrapActivityUse(NativeActivity.prototype);
  Hooks.on("dnd5e.preUseActivity", Arts.prepareArtUse);
  Hooks.on("dnd5e.activityConsumption", Arts.consumeArt);
  return new NativeActivity(actor, item);
}
function reactionReceipt(actor, castId) {
  return actor.flags.ak5e.artReceipts?.find(entry => entry.id === castId &&
    entry.changes?.some(change => change.path === "flags.ak5e.reactionBudget"));
}

// Emulate Foundry's cross-client chat transport: the request is created by the player,
// createChatMessage is delivered to the elected GM, and the GM's response update wakes submit().
function enableRelayChatDelivery() {
  const original = ChatMessage.implementation.create.bind(ChatMessage.implementation);
  ChatMessage.implementation.create = async (data, options) => {
    const message = await original(data, options);
    const update = message.update.bind(message);
    message.update = async changes => {
      const result = await update(changes);
      await Hooks.callAll("updateChatMessage", message, {}, game.user.id);
      return result;
    };
    queueMicrotask(async () => {
      const authoringUser = game.user;
      game.user = game.users.activeGM;
      try { await Hooks.callAll("createChatMessage", message, {}, message.author.id); }
      finally { game.user = authoringUser; }
    });
    return message;
  };
}

function hasBoundReactionRecovery(actor, castId) {
  if (reactionReceipt(actor, castId)) return true;
  if (actor.flags.ak5e.medicReactionRecovery?.[castId]?.receiptId === castId) return true;
  const seen = new Set();
  const visit = value => {
    if (!value || typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    const bound = value.receiptId === castId || value.castId === castId;
    const describesReaction = Object.keys(value).some(key => /reaction|pool/i.test(key));
    return (bound && describesReaction) || Object.values(value).some(visit);
  };
  return visit(actor.flags.ak5e);
}

test("A1: setup receipts identify actual Item IDs when Foundry regenerates IDs without keepId", async () => {
  const actor = medic("runtime-item-identity");
  const nativeCreate = actor.createEmbeddedDocuments.bind(actor);
  const createOptions = [];
  actor.createEmbeddedDocuments = async (type, entries, options = {}) => {
    createOptions.push(options);
    const nativeEntries = type === "Item" && !options.keepId
      ? entries.map(({ _id, id, ...data }) => data) : entries;
    return nativeCreate(type, nativeEntries, options);
  };
  const preview = await MedicSetup.previewMedicSetup(actor);
  const result = await MedicSetup.applyMedicSetup(actor, { confirmed: true, contextKey: preview.contextKey });
  const actualIds = new Set([...actor.items.keys()]);
  assert.ok(createOptions.some(options => options.keepId === true) ||
    itemIds(result.receipt).length > 0 && itemIds(result.receipt).every(id => actualIds.has(id)),
  "a receipt must identify the actual native-created documents, either through keepId or returned IDs");
});

test("A1: undo preserves and visibly warns about a granted Item whose system data changed", async () => {
  const actor = medic("runtime-item-modified");
  const preview = await MedicSetup.previewMedicSetup(actor);
  const result = await MedicSetup.applyMedicSetup(actor, { confirmed: true, contextKey: preview.contextKey });
  const createdId = itemIds(result.receipt)[0];
  const granted = actor.items.get(createdId);
  assert.ok(granted, "fixture setup should create at least one receipt-tracked Item");
  granted.system.quantity = 9;
  await Arts.undoArtReceipt(actor, result.receipt.id);
  assert.ok(actor.items.has(createdId), "modified Item data must not be deleted as an unchanged grant");
  assert.ok(warnings.some(message => /changed after this use|modified granted Item/i.test(message)),
    "preserving a modified Item must be visible to the user");
});

test("A6: registered operation preserves its exact-path validator for apply and restore", () => {
  const id = "review.medic.validator-registration";
  const path = "flags.ak5e.medic.validatorProbe.rank";
  const validateUpdate = (_target, updates, context) => Object.keys(updates).length === 1 &&
    Object.keys(updates)[0] === path && Number.isInteger(updates[path]) &&
    ["apply", "restore"].includes(context?.phase);
  Ledger.registerRelayOperation(id, {
    validate: (_target, data) => Number.isInteger(data?.rank),
    apply: (_target, data) => ({ [path]: data.rank }),
    validateUpdate
  });
  const registered = Ledger.relayOperationFor(id);
  assert.equal(typeof registered?.validateUpdate, "function",
    "the named registration must retain its optional apply/inverse update validator");
  const target = createTestActor({ id: "runtime-validator-target" });
  assert.equal(registered.validateUpdate(target, { [path]: 3 }, { phase: "apply" }), true);
  assert.equal(registered.validateUpdate(target, { [path]: 1 }, { phase: "restore" }), true);
  assert.equal(registered.validateUpdate(target, { "flags.ak5e.casting.enabled": true }, { phase: "apply" }), false);
});

test("A6: registerArtRelayHooks idempotently handles incoming GM createChatMessage requests", async () => {
  const register = Ledger.registerArtRelayHooks;
  assert.equal(typeof register, "function", "the parent must have an explicit ready-time Medic relay registrar");
  register();
  const firstCount = (Hooks._hooks.get("createChatMessage") ?? []).length;
  register();
  const handlers = Hooks._hooks.get("createChatMessage") ?? [];
  assert.equal(firstCount, 1, "the incoming request handler is attached to the native message-create boundary");
  assert.equal(handlers.length, firstCount, "repeated ready wiring must not attach duplicate request handlers");

  const source = medic("runtime-relay-source"), target = createTestActor({ id: "runtime-relay-target", owner: false,
    hp: { value: 10, max: 20, temp: 0 } });
  const request = { actorUuid: source.uuid, id: "runtime-hp-request", command: "apply",
    data: { confirmation: true, targetUuid: target.uuid, operation: { id: "hp-damage", data: { amount: 3 } } } };
  const message = { id: "runtime-request-message", author: game.users.get("player"),
    flags: { ak5e: { medicRelayRequest: request } }, getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(changes) { for (const [path, value] of Object.entries(changes)) foundry.utils.setProperty(this, path, value); return this; } };
  const requester = game.user;
  game.user = game.users.activeGM;
  try { await Hooks.callAll("createChatMessage", message, {}, "player"); }
  finally { game.user = requester; }
  assert.equal(target.system.attributes.hp.value, 7, "the registered GM handler must execute a valid request through the kernel");
  assert.equal(message.flags.ak5e.medicRelayResponse.ok, true);
});

test("A6: named relay validates exact branch paths for forward and inverse updates over GM transport", async () => {
  const registerHooks = Ledger.registerArtRelayHooks;
  assert.equal(typeof registerHooks, "function", "relay transport registration is required before an owner request");
  registerHooks();
  const validateUpdateCalls = [];
  const operationId = "review.medic.rider-test";
  const path = "flags.ak5e.medic.testRider.charges";
  Ledger.registerRelayOperation(operationId, {
    validate: (_target, data) => Number.isInteger(data?.charges) && data.charges >= 0 && data.charges <= 10,
    apply: (_target, data) => ({ [path]: data.charges }),
    validateUpdate: (target, updates, context) => {
      validateUpdateCalls.push({ phase: context?.phase, sourceUuid: context?.sourceActor?.uuid,
        data: structuredClone(context?.data ?? {}), operationId: context?.id ?? context?.operationId ?? context?.operation?.id });
      return target.documentName === "Actor" && Object.keys(updates).length === 1 &&
        Object.keys(updates)[0] === path && Number.isInteger(updates[path]) && updates[path] >= 0 && updates[path] <= 10 &&
        ["apply", "restore"].includes(context?.phase);
    }
  });
  const source = medic("runtime-custom-source"), target = createTestActor({ id: "runtime-custom-target", owner: false });
  foundry.utils.setProperty(target, path, 2);
  const parent = { id: "runtime-custom-parent", actorUuid: source.uuid, status: "available", epoch: 0, changes: [] };
  await source.update({ "flags.ak5e.artReceipts": [parent] });
  enableRelayChatDelivery();
  game.user = game.users.get("player");
  const child = await Ledger.appendLinkedReceipt(source, parent.id, { id: "runtime-custom-child", relay: {
    targetUuid: target.uuid, operation: { id: operationId, data: { charges: 7 } }
  } });
  assert.equal(foundry.utils.getProperty(target, path), 7, "GM transport applies the validated forward update");
  assert.equal(child.relay.restore[path], 2, "receipt stores the GM-captured true before-state");
  await Arts.undoArtReceipt(source, child.id);
  assert.equal(foundry.utils.getProperty(target, path), 2, "child-only undo transports the validated inverse");
  assert.ok(validateUpdateCalls.some(call => call.phase === "apply"), "forward apply is validated");
  assert.ok(validateUpdateCalls.some(call => call.phase === "restore"), "inverse restore is validated");
  for (const phase of ["apply", "restore"]) {
    assert.ok(validateUpdateCalls.some(call => call.phase === phase && call.sourceUuid === source.uuid && call.operationId === operationId),
      `${phase} validation retains its source and registered operation context`);
  }
});

test("A6: unknown, tampered, and generic flag relay requests fail closed before target writes", async () => {
  const actor = medic("runtime-relay-negative-source");
  const target = createTestActor({ id: "runtime-relay-negative-target", owner: false });
  const parent = { id: "runtime-negative-parent", actorUuid: actor.uuid, status: "available", epoch: 0, changes: [] };
  await actor.update({ "flags.ak5e.artReceipts": [parent] });
  let writes = 0;
  const original = target.update.bind(target);
  target.update = async changes => { writes += 1; return original(changes); };
  await assert.rejects(Ledger.appendLinkedReceipt(actor, parent.id, { id: "runtime-unknown", relay: {
    targetUuid: target.uuid, operation: { id: "unregistered.operation", data: { amount: 1 } }
  } }));
  await assert.rejects(Ledger.appendLinkedReceipt(actor, parent.id, { id: "runtime-generic", relay: {
    targetUuid: target.uuid, changes: { "flags.ak5e.casting.enabled": true },
    restore: { "flags.ak5e.casting.enabled": false }
  } }));
  assert.equal(writes, 0, "unregistered operations and generic caller maps cannot mutate an unowned target");
});

test("A6: GM transport rejects tampered named data, unknown operations, and generic flag maps", async () => {
  const register = Ledger.registerArtRelayHooks;
  assert.equal(typeof register, "function", "security checks must run at the registered GM request boundary");
  register();
  const actor = medic("runtime-relay-tamper-source"), target = createTestActor({ id: "runtime-relay-tamper-target", owner: false });
  const path = "flags.ak5e.medic.reviewBranch";
  Ledger.registerRelayOperation("review.medic.transport-negative", {
    validate: (_target, data) => Number.isInteger(data?.rank) && data.rank >= 0 && data.rank <= 4,
    apply: (_target, data) => ({ [path]: { rank: data.rank } }),
    validateUpdate: (_target, updates) => Object.keys(updates).length === 1 && Object.keys(updates)[0] === path
  });
  let writes = 0;
  const update = target.update.bind(target);
  target.update = async changes => { writes += 1; return update(changes); };
  let sequence = 0;
  const send = async data => {
    const message = { id: `runtime-forged-${++sequence}`, author: game.users.get("player"),
      flags: { ak5e: { medicRelayRequest: { actorUuid: actor.uuid, id: `runtime-forged-op-${sequence}`, command: "apply",
        data: { confirmation: true, targetUuid: target.uuid, ...data } } } },
      getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
      async update(changes) { for (const [key, value] of Object.entries(changes)) foundry.utils.setProperty(this, key, value); return this; } };
    const requester = game.user;
    game.user = game.users.activeGM;
    try { await Hooks.callAll("createChatMessage", message, {}, "player"); }
    finally { game.user = requester; }
    return message.flags.ak5e.medicRelayResponse;
  };
  const tampered = await send({ operation: { id: "review.medic.transport-negative", data: { rank: 99 } } });
  const unknown = await send({ operation: { id: "review.medic.not-registered", data: { rank: 1 } } });
  const generic = await send({ changes: { "flags.ak5e.casting.enabled": true } });
  assert.equal(tampered?.ok, false, "the GM recomputes and validates named operation data");
  assert.equal(unknown?.ok, false, "unknown operation IDs fail closed");
  assert.equal(generic?.ok, false, "the request transport does not accept generic Actor update maps");
  assert.equal(writes, 0, "all rejected requests leave the target untouched");
});

test("A8: equal raw and native aggregates with offsetting type changes use the native per-type split", () => {
  assert.equal(typeof Damage.registerArtCorrelation, "function");
  const target = createTestActor({ id: "runtime-offset-damage", hp: { value: 100, max: 100, temp: 0 } });
  Damage.registerDamageResolver(context => context?.options?.runtimeOffset ? { resistTypes: ["fire"] } : {});
  Damage.registerArtCorrelation();
  const message = { uuid: "ChatMessage.runtime-offset", rolls: [
    { total: 10, options: { type: "fire" } }, { total: 10, options: { type: "cold" } }
  ] };
  const options = { runtimeOffset: true, originatingMessage: message };
  const nativeParts = [{ type: "fire", value: 15 }, { type: "cold", value: 5 }];
  // This is the D&D5e calculateDamage post-native hook boundary; native total remains 20,
  // while the per-type values differ from the raw card by +5 Fire / -5 Cold.
  Hooks.call("dnd5e.calculateDamage", target, nativeParts, options);
  const updates = { "system.attributes.hp.value": 80, "system.attributes.hp.temp": 0 };
  Hooks.call("dnd5e.preApplyDamage", target, 20, updates, options);
  assert.equal(updates["system.attributes.hp.value"], 88,
    "Fire Resistance halves native Fire 15 to 7 while preserving native Cold 5 (12 total damage)");
});

test("A5: successful Actor receipt persistence plus chat-card update failure does not refund Reaction", async () => {
  const actor = medic("runtime-reaction-message-failure"), item = art(actor);
  const native = prepareReactionCast(actor, item);
  const result = await native.use({ ak5eContext: { castingTime: "reaction" } },
    { applicationClass: class NativeDialog {} }, { failUpdate: true });
  assert.ok(result, "the confirmed native cast remains committed");
  const id = actor.flags.ak5e.lastArtCast?.id;
  assert.equal(Trigger.getReactions(actor).spent, 1, "a message-display write failure cannot refund a durable Reaction spend");
  assert.ok(reactionReceipt(actor, id), "the Actor receipt durably records the Reaction change for exact undo");
});

test("A5: cascading receipt, refund, and recovery-marker failures leave no unexplained Reaction spend", async () => {
  const actor = medic("runtime-reaction-cascade"), item = art(actor);
  const native = prepareReactionCast(actor, item);
  const originalUpdate = actor.update.bind(actor);
  let reactionWrites = 0;
  actor.update = async changes => {
    const ledger = changes["flags.ak5e.artReceipts"];
    const castId = actor.flags.ak5e.lastArtCast?.id;
    if (Array.isArray(ledger) && ledger.some(entry => entry.id === castId &&
      entry.changes?.some(change => change.path === "flags.ak5e.reactionBudget"))) {
      throw new Error("fixture: Actor reaction receipt write failed");
    }
    if (changes["flags.ak5e.reactionBudget"] !== undefined && ++reactionWrites > 1) {
      throw new Error("fixture: Reaction refund write failed");
    }
    if (Object.keys(changes).some(path => path.startsWith("flags.ak5e.medicReactionRecovery."))) {
      throw new Error("fixture: recovery marker write failed");
    }
    return originalUpdate(changes);
  };
  const result = await native.use({ ak5eContext: { castingTime: "reaction" } }, { applicationClass: class NativeDialog {} });
  assert.ok(result, "the confirmed cast remains committed despite recovery-write failures");
  const id = actor.flags.ak5e.lastArtCast?.id;
  assert.ok(Trigger.getReactions(actor).spent === 0 || hasBoundReactionRecovery(actor, id),
    "if the Reaction remains spent, a durable receipt or recovery record must bind the spend to this cast");
  if (Trigger.getReactions(actor).spent > 0) {
    assert.ok(warnings.length || errors.length, "an unresolved but durably identified spend must be visible to the table");
  }
});
