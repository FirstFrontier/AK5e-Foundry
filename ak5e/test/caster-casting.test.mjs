import test from "node:test";
import assert from "node:assert/strict";
import { casterAttackConfig, casterConsumption, casterGrant, casterQuoteOptions, completeCasterConsumption, completeCasterUse,
  casterTurn, powerSurge, prepareCasterActivity, validateCasterContext, patchCasterDamage, registerCasterCastingHooks, markCasterCastFailure } from "../scripts/caster-casting.mjs";
import { patchCantripDamage } from "../scripts/cantrip-damage.mjs";
import { onAk5eEvent, offAk5eEvent } from "../scripts/trigger-events.mjs";
import { consumeArt, wrapActivityUse } from "../scripts/arts-casting.mjs";
import { recordExternalCasterUse } from "../scripts/caster-primal-splash.mjs";
import { artsState, quoteArt } from "../scripts/arts-rules.mjs";
import { casterState } from "../scripts/caster-rules.mjs";

function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = structuredClone(value);
}
function fixture({ branch = "core", level = 11, ap = 20, artLevel = 6, combat = true } = {}) {
  const actor = { id: "caster", uuid: "Actor.caster", documentName: "Actor", type: "character", isOwner: true,
    flags: { ak5e: { casting: { enabled: true, ability: "int", castingUnit: "wand" }, artsPoints: { maximum: 30, value: ap, maximumArtLevel: artLevel },
      caster: { enabled: true, version: 1, choices: {}, pools: ["standard-art-pool-corrosion-arts-407"], operations: [], casts: [], spends: [], rulings: {}, uses: {}, turn: {}, drones: [] },
      resourcePools: { mysticCharge: { value: 0 } } } },
    system: { attributes: { spellcasting: "int", prof: 4, spell: { attack: 7 }, hp: { value: 10, max: 10 } }, abilities: { int: { value: 18, mod: 4 } } },
    items: new Map(), updates: [],
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(changes) { this.updates.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } };
  const classItem = { id: "class", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-caster" } }, getFlag(s,k) { return this.flags?.[s]?.[k]; } };
  const branchId = { core: "subclass-caster-core", mystic: "subclass-caster-mystic", "mech-accord": "subclass-caster-mech-accord" }[branch];
  actor.items.set(classItem.id, classItem);
  actor.items.set("branch", { id: "branch", type: "subclass", flags: { ak5e: { chapterThreeId: branchId } }, getFlag(s,k) { return this.flags?.[s]?.[k]; } });
  const combatDoc = combat ? { started: true, uuid: "Combat.c1", id: "c1", round: 2, turn: 1, combatant: { id: "turn-1", actor } } : null;
  globalThis.game = { user: { id: "player", isGM: false, targets: new Set() }, combat: combatDoc, settings: { get: () => false } };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
  return actor;
}
function art(actor, { id = "acid", level = 1, activation = "action" } = {}) {
  return { id, type: "spell", name: "Acid Surge", actor, system: { level, activities: new Map([["activity", { id: "activity", activation: { type: activation } }]]) },
    flags: { ak5e: { enabled: true } }, getFlag(scope, key) { return this.flags?.[scope]?.[key]; } };
}
function applyActorChanges(actor, changes) { for (const [path, value] of Object.entries(changes)) setPath(actor, path, value); }

test("Caster cast quotes include Growing Power, Savant, translocation surcharge, origin, and reviewed cost order", () => {
  const actor = fixture({ level: 15, ap: 20, artLevel: 8 });
  const item = art(actor, { level: 1 });
  actor.flags.ak5e.caster.signature = { itemId: item.id, damaging: false };
  actor.flags.ak5e.caster.rulings.costOrder = undefined;
  const grant = casterGrant(actor, item, {});
  assert.equal(grant.caster.signatureNonDamaging, true);
  const selection = { ak5eCaster: { droneTokenUuid: "Scene.s.Token.drone" } };
  const options = casterQuoteOptions(actor, item, selection);
  assert.equal(options.surcharge, 1);
  assert.equal(options.origin, "Scene.s.Token.drone");
  assert.throws(() => quoteArt(artsState(actor), 1, 2, grant, { ...options, mode: "ap" }), error => error.key === "CasterRuling");

  grant.caster.costOrder = "discountsThenSurcharge";
  const quote = quoteArt(artsState(actor), 1, 2, grant, { ...options, mode: "ap" });
  assert.equal(quote.cost, 1);
  assert.equal(quote.remaining, 19);
  assert.equal(quote.origin, "Scene.s.Token.drone");
  assert.deepEqual(quote.modifiers.map(modifier => [modifier.source, modifier.amount]), [
    ["Growing Power", -2], ["Savant", -2], ["Arts Translocation", 1]
  ]);
  grant.caster.costOrder = "surchargeThenDiscounts";
  const otherOrder = quoteArt(artsState(actor), 1, 2, grant, { ...options, mode: "ap" });
  assert.equal(otherOrder.cost, 0);
  assert.equal(quoteArt(artsState(actor), 1, 8, grant, { ...options, mode: "ap" }).modifiers.some(m => m.source === "Growing Power"), false,
    "Growing Power does not reduce an Art cast at the current maximum level");
});

test("repeat-cast cost interactions require an explicit GM ruling; overrides cannot be supplied by users", () => {
  const actor = fixture({ level: 20 });
  const item = art(actor, { level: 1 });
  const turn = casterTurn(actor);
  actor.flags.ak5e.caster.casts = [{ id: "prior", itemId: item.id, level: 1, turn, activation: "action", targets: [], completed: true }];
  assert.throws(() => validateCasterContext(actor, item, { repeat: "doublecast", previousCastId: "prior" }), /GM must record a ruling/);
  actor.flags.ak5e.caster.rulings.doublecastCost = { value: "free", source: "Reviewed printed wording and free repeat policy." };
  const context = validateCasterContext(actor, item, { repeat: "doublecast", previousCastId: "prior" });
  assert.equal(context.overrideCost, 0);
  const quoted = quoteArt(artsState(actor), 1, 1, casterGrant(actor, item, { caster: { level: 20, branch: "core", costOrder: "discountsThenSurcharge" } }),
    { mode: "ap", overrideCost: context.overrideCost });
  assert.equal(quoted.cost, 0);
  const spoofed = validateCasterContext(actor, item, { overrideCost: 0 });
  assert.equal(spoofed.overrideCost, undefined, "unreviewed callers cannot inject a free cast cost");
});

test("Mystic Burst guides N+1 independent Action cantrip uses and suppresses critical damage", () => {
  const actor = fixture({ branch: "mystic", level: 1, ap: 4 });
  actor.flags.ak5e.resourcePools.mysticCharge.value = 2;
  const item = art(actor, { level: 0, activation: "action" });
  const firstContext = validateCasterContext(actor, item, { burstStart: true });
  assert.equal(firstContext.burstCharges, 2);
  assert.equal(firstContext.noCritical, true);
  const updates = { actor: {} }, firstReceipt = { id: "burst-0", itemId: item.id, level: 0, cost: 0 };
  casterConsumption({ actor, item, activation: { type: "action" } }, { ak5eCaster: firstContext }, updates, firstReceipt);
  applyActorChanges(actor, updates.actor);
  assert.deepEqual({ remaining: actor.flags.ak5e.caster.burst.remaining, total: actor.flags.ak5e.caster.burst.total }, { remaining: 2, total: 3 });
  assert.equal(actor.flags.ak5e.resourcePools.mysticCharge.value, 0);
  for (const [i, id] of ["burst-1", "burst-2"].entries()) {
    const context = validateCasterContext(actor, item, { burstStep: true });
    const next = { actor: {} };
    casterConsumption({ actor, item, activation: { type: "action" } }, { ak5eCaster: context }, next, { id, itemId: item.id, level: 0, cost: 0 });
    applyActorChanges(actor, next.actor);
  }
  assert.equal(actor.flags.ak5e.caster.casts.length, 3);
  assert.equal(actor.flags.ak5e.caster.burst.remaining, 0);
  const activity = { actor, item: { ...item, flags: { ak5e: { casterCast: { noCritical: true } } }, getFlag(s,k) { return this.flags?.[s]?.[k]; } } };
  const roll = { options: { criticalSuccess: 20 } };
  casterAttackConfig({ subject: activity, rolls: [roll] });
  assert.equal(roll.options.criticalSuccess, 20, "Burst suppresses critical damage while preserving native critical-hit accuracy");
});

test("Cantrip Duplication warns without same-target confirmation or with changed targets, and uses the cost ruling or the player's reading", () => {
  const actor=fixture({branch:"mech-accord",level:6}),item=art(actor,{level:0}),scene={id:"scene"};
  const drone={uuid:"Actor.drone",isOwner:true,system:{attributes:{hp:{value:25}}},flags:{ak5e:{artsMaster:{creatorUuid:actor.uuid,destroyed:false}}}};
  const token={uuid:"Scene.scene.Token.drone",documentName:"Token",actor:drone,parent:scene};
  actor.getActiveTokens=()=>[{parent:scene}];
  actor.flags.ak5e.caster.drones=[drone.uuid];
  actor.flags.ak5e.caster.rulings.duplicationCost={value:1,source:"GM-reviewed one AP total duplication"};
  globalThis.fromUuidSync=uuid=>uuid===token.uuid?token:null;
  actor.flags.ak5e.caster.casts=[{id:"original",itemId:item.id,level:0,activation:"action",completed:true,turn:casterTurn(actor),targets:["Scene.scene.Token.enemy"]}];
  const options={mode:"ap",level:0,repeat:"duplicate",previousCastId:"original",droneTokenUuid:token.uuid};
  // WORKFLOW.md §3.2: these are warnings with Use anyway, not refusals.
  assert.throws(()=>validateCasterContext(actor,item,options),error=>error.name==="AK5eWarnings"&&error.warnings.some(w=>w.id==="duplicateTargets"));
  game.user.targets=new Set([{uuid:"Scene.scene.Token.other"}]);
  assert.throws(()=>validateCasterContext(actor,item,{...options,sameTargets:true}),error=>error.warnings?.some(w=>w.id==="duplicateTargetChange"));
  const overridden=validateCasterContext(actor,item,{...options,sameTargets:true,overrides:["duplicateTargetChange"]});
  assert.match(overridden.overridden.join(" "),/differ from the original/);
  game.user.targets=new Set([{uuid:"Scene.scene.Token.enemy"}]);
  const reviewed=validateCasterContext(actor,item,{...options,sameTargets:true});
  assert.equal(reviewed.overrideCost,1);
  assert.equal(reviewed.readingNote,undefined,"a GM ruling is applied without a player's reading");
  game.user.targets.clear();
  assert.throws(()=>validateCasterContext(actor,item,reviewed),error=>error.warnings?.some(w=>w.id==="duplicateTargetChange"));
  // Without a ruling, the player picks the cost for this cast; it is shown on the card and never stored.
  delete actor.flags.ak5e.caster.rulings.duplicationCost;
  game.user.targets=new Set([{uuid:"Scene.scene.Token.enemy"}]);
  assert.throws(()=>validateCasterContext(actor,item,{...options,sameTargets:true}),error=>error.name==="AK5eReading"&&error.key==="duplicationCost");
  const read=validateCasterContext(actor,item,{...options,sameTargets:true,reading:"2"});
  assert.equal(read.overrideCost,2);
  assert.match(read.readingNote,/2 AP/);
  assert.equal(actor.flags.ak5e.caster.rulings.duplicationCost,undefined);
  assert.equal(actor.flags.ak5e.artsPoints.value,20);
});

test("AP consumption and completed Art use emit separate receipt-backed events", async () => {
  const actor = fixture({ level: 11, ap: 5 });
  const item = art(actor, { level: 1 });
  const received = [];
  onAk5eEvent("apSpent", event => received.push(event));
  onAk5eEvent("artCast", event => received.push(event));
  const receipt = { id: "cast-success", itemId: item.id, level: 1, cost: 1 };
  const updates = { actor: {} };
  casterConsumption({ actor, item, activation: { type: "action" } }, {}, updates, receipt);
  applyActorChanges(actor, updates.actor);
  actor.flags.ak5e.lastArtCast = receipt;
  await completeCasterConsumption(actor, receipt);
  assert.deepEqual(received.map(event => event.kind), ["apSpent"]);
  assert.equal(received[0].operationId, receipt.id);
  assert.equal(received[0].amount, 1);
  assert.equal(received[0].level, 1);
  assert.equal(received[0].actorUuid, actor.uuid);
  await completeCasterUse(actor, receipt);
  assert.deepEqual(received.map(event => event.kind), ["apSpent", "artCast"]);
  assert.equal(received[1].operationId, receipt.id);

  const canceled = { ...receipt, id: "cancelled-cast" };
  actor.flags.ak5e.lastArtCast = { id: "different-operation" };
  await completeCasterConsumption(actor, canceled);
  await completeCasterUse(actor, canceled);
  assert.equal(received.length, 2, "a stale or canceled receipt emits neither event");
});

test("native cast commit serializes against drone receipts and releases before AP event handlers", async () => {
  const actor = fixture({ branch: "mech-accord", level: 3, ap: 6 });
  globalThis.foundry = { utils: { randomID: () => "pending-cast" } };
  game.i18n = { localize: key => key, format: key => key };
  let castWarning = "";
  globalThis.ui = { notifications: { warn: message => { castWarning = message; }, error() {}, info() {} } };
  const item = art(actor, { level: 1 }); item.getFlag = (scope, key) => item.flags?.[scope]?.[key]; item.flags.ak5e.art = { noCastingUnit: true };
  let begin, release;
  const started = new Promise(resolve => { begin = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  class NativeCast {
    actor = actor; item = item;
    async use(usage) {
      begin(); await held;
      const updates = { actor: {} }, message = { data: {} };
      assert.notEqual(consumeArt(this, usage, message, updates), false, castWarning);
      applyActorChanges(actor, updates.actor);
      return true;
    }
  }
  wrapActivityUse(NativeCast.prototype);
  const handler = onAk5eEvent("apSpent", async event => {
    await recordExternalCasterUse(actor, { id: `event-${event.operationId}`, command: "external", title: "AP event receipt", epoch: 0, status: "complete" });
  });
  try {
    const cast = new NativeCast().use({ ak5eLevel: 1, ak5eMode: "ap" });
    await started;
    const request = recordExternalCasterUse(actor, { id: "drone-request-race", command: "droneRequest", title: "Create Arts Master", epoch: 0, status: "applying" });
    release();
    await Promise.all([cast, request]);
    assert.equal(actor.flags.ak5e.lastArtCast?.cost, 1, "native AP activity committed its real quote");
    assert.equal(actor.flags.ak5e.artsPoints.value, 5);
    assert.ok(actor.flags.ak5e.caster.casts.some(receipt => receipt.id === "pending-cast"), "native consumption writes the cast ledger");
    assert.deepEqual(actor.flags.ak5e.caster.undo.map(receipt => receipt.id).sort(), ["drone-request-race", "event-pending-cast"],
      "the concurrent external receipt and the AP event handler both survive the cast commit");
  } finally { offAk5eEvent("apSpent", handler); }
});

test("AP spend event deduplication updates turn totals once; Mystic Feedback Loop waits for artCast", async () => {
  const actor = fixture({ branch: "mystic", level: 15, ap: 5 });
  const item = art(actor, { level: 6 });
  const received = [];
  onAk5eEvent("apSpent", event => received.push(event));
  onAk5eEvent("artCast", event => received.push(event));
  const receipt = { id: "ap-funded", itemId: item.id, level: 6, cost: 4 };
  const updates = { actor: {} };
  casterConsumption({ actor, item, activation: { type: "action" } }, {}, updates, receipt);
  applyActorChanges(actor, updates.actor);
  actor.flags.ak5e.lastArtCast = receipt;
  await completeCasterConsumption(actor, receipt);
  assert.equal(received.some(event => event.kind === "artCast"), false, "consumption alone is not a completed Art use");
  await completeCasterUse(actor, receipt);
  assert.equal(received.some(event => event.kind === "artCast"), true);
});

test("Mystic Power Surge counts only charges expended on the current Turn", () => {
  const actor = fixture({ branch: "mystic", level: 6 });
  const turn = casterTurn(actor);
  actor.flags.ak5e.caster.turn = { key: turn, apSpent: 0, chargesSpent: 2 };
  assert.equal(powerSurge(actor), 2);
  actor.flags.ak5e.caster.turn.key = "old turn";
  assert.equal(powerSurge(actor), 0);
  const item=art(actor,{level:0});item.flags.ak5e.casterCast={surge:2};
  const config={subject:{actor,item},rolls:[{parts:[]}]};
  casterAttackConfig(config);assert.deepEqual(config.rolls[0].parts,[],"old chat context cannot retain a prior Turn's bonus");
  actor.flags.ak5e.caster.turn={key:casterTurn(actor),chargesSpent:1};
  casterAttackConfig(config);assert.deepEqual(config.rolls[0].parts,["1"],"current expenditure controls the bonus rather than its cached value");
  actor.items.delete("class");
  const removed={subject:{actor,item},rolls:[{parts:[]}]};casterAttackConfig(removed);
  assert.deepEqual(removed.rolls[0].parts,[]);
});

test("native AP/cast event persistence failures retain failed receipts for reconciliation", async () => {
  for (const kind of ["apSpent","artCast"]) {
    const actor=fixture();const item=art(actor);
    const receipt={id:`event-${kind}`,itemId:item.id,level:3,cost:1};const updates={actor:{}};
    casterConsumption({actor,item,activation:{type:"action"}},{},updates,receipt);
    applyActorChanges(actor,updates.actor);actor.flags.ak5e.lastArtCast=receipt;
    const handler=onAk5eEvent(kind,()=>{throw new Error("injected persistence failure");});
    try {await assert.rejects(kind==="apSpent"?completeCasterConsumption(actor,receipt):completeCasterUse(actor,receipt),/handler failed/);}
    finally {offAk5eEvent(kind,handler);}
    await markCasterCastFailure(actor,receipt,new Error("event persistence failed"));
    assert.equal(actor.flags.ak5e.caster.casts[0].status,"failed");
    await assert.rejects(Promise.resolve().then(()=>validateCasterContext(actor,item)),/reconciliation/);
  }
});

test("native damage wrappers retain first-cantrip bonus, add Empowered once, and cancel without consuming", async () => {
  const actor = fixture({level:11});
  game.system = {id:"dnd5e"}; game.settings.get = () => true;
  actor.setFlag = async (scope,key,value) => {actor.flags[scope][key]=value;};
  const item = art(actor,{level:0});
  item.flags.ak5e.casterCast = {castId:"empowered",empowered:true};
  actor.flags.ak5e.caster.casts = [{id:"empowered",level:0,turn:casterTurn(actor),completed:true}];
  class Activity {
    static metadata={usage:{actions:{}}};
    constructor() {this.actor=actor;this.item=item;this.cancel=false;}
    _processDamagePart() {}
    getDamageConfig() {return {rolls:[{parts:["1d8"],options:{}}]};}
    async rollDamage() {return this.cancel ? [] : [{...this.getDamageConfig().rolls[0],toJSON(){return {parts:this.parts};}}];}
  }
  globalThis.CONFIG = {DND5E:{activityTypes:{test:{documentClass:Activity}}}};
  patchCantripDamage(); patchCasterDamage();
  const activity = new Activity(); activity.cancel=true;
  await activity.rollDamage();
  assert.equal(actor.flags.ak5e.caster.uses.empowered,undefined);
  assert.equal(actor.flags.ak5e.cantripDamageTurn,undefined);
  activity.cancel=false;
  assert.deepEqual((await activity.rollDamage())[0].parts,["1d8","4","4"]);
  assert.deepEqual((await activity.rollDamage())[0].parts,["1d8"],"both benefits apply once after a successful roll");
});

test("native origin is the drone token while actor ownership and roll data stay with the caster", () => {
  const actor=fixture({branch:"mech-accord",level:6});
  const item=art(actor); item.flags.ak5e.casterCast={droneTokenUuid:"Scene.test.Token.drone"};
  const origin={documentName:"Token",actor:{uuid:"Actor.drone"},uuid:"Scene.test.Token.drone"};
  globalThis.fromUuidSync = uuid => uuid===origin.uuid ? origin : null;
  class Activity {static metadata={usage:{actions:{}}};constructor(){this.actor=actor;this.item=item;}getUsageToken(){return {uuid:"Token.caster"};}}
  globalThis.CONFIG={DND5E:{activityTypes:{test:{documentClass:Activity}}}};
  patchCasterDamage();
  const activity=new Activity();
  assert.equal(activity.getUsageToken(),origin);
  assert.equal(activity.actor,actor);
  delete item.flags.ak5e.casterCast;
  assert.equal(activity.getUsageToken().uuid,"Token.caster");
});

test("Burst suppresses actual DamageRoll critical configuration and Savant refuses nonterminating rerolls", () => {
  const actor=fixture({branch:"mystic",level:6});
  const item=art(actor,{level:0}); item.flags.ak5e.casterCast={noCritical:true};
  class Activity {static metadata={usage:{actions:{}}};constructor(){this.item=item;this.actor=actor;}getDamageConfig(){return {critical:{allow:true},isCritical:true,rolls:[{parts:["1d8"],options:{isCritical:true}}]};}}
  globalThis.CONFIG={DND5E:{activityTypes:{test:{documentClass:Activity}}}};
  const hooks={}; globalThis.Hooks={on:(key,fn)=>{hooks[key]=fn;}};
  registerCasterCastingHooks();
  const activity=new Activity(), config=activity.getDamageConfig();
  assert.equal(config.critical.allow,false); assert.equal(config.rolls[0].options.isCritical,false);
  const roll={options:{isCritical:true},terms:[],configureDamage(){this.reconfigured=true;}};
  hooks["dnd5e.postDamageRollConfiguration"]([roll],{subject:activity});
  assert.equal(roll.options.isCritical,false);assert.equal(roll.reconfigured,true);
  item.flags.ak5e.casterCast={signatureReroll:true,signatureRerollOnce:false};
  actor.items.get("class").system.levels=15;
  actor.items.get("branch").flags.ak5e.chapterThreeId="subclass-caster-core";
  actor.flags.ak5e.caster.signature={itemId:item.id};
  assert.throws(()=>hooks["dnd5e.postDamageRollConfiguration"]([{terms:[{faces:2,modifiers:[]}]}],{subject:activity}),/cannot terminate/);
  actor.flags.ak5e.caster.signature={itemId:"replacement"};
  const oldDie={faces:8,modifiers:[]};
  hooks["dnd5e.postDamageRollConfiguration"]([{terms:[oldDie]}],{subject:activity});
  assert.deepEqual(oldDie.modifiers,[],"replacing the Signature removes module rerolls on an old chat card");
});

