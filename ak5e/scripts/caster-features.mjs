/** Explicit owner-operated Caster features; GM-reviewed exceptions and durable receipts. */
import { casterLevel, casterBranch, casterState, casterProfile, casterFeatures, standardPools } from "./caster-rules.mjs";
import { resolveCasterArtData } from "./caster-setup.mjs";
import { casterEnabled, casterTurn, casterRuling, coreDamageTypes, castCasterArt, casterAttackConfig, registerCasterCastingHooks } from "./caster-casting.mjs";
import { baseCommand, baseRest, baseEvent, basePlans, setBaseCastArt, BASE_COMMANDS, BASE_READINGS } from "./caster-base.mjs";
import { createCasterDrone, syncCasterDrones, droneAttackGate } from "./caster-drones.mjs";
import { artsState, recoveryValue, integer } from "./arts-rules.mjs";
import { flag, values, need } from "./operation-kernel.mjs";
import { definePool, getPoolDefinition } from "./resource-pools.mjs";
import { onAk5eEvent, emitAk5eEvent } from "./trigger-events.mjs";
import { resolveDamage } from "./damage-pipeline.mjs";
import { PRIMAL_CONDITIONS, PRIMAL_CONDITION_NAMES, ENDURING_AFFLICTION, residualSuffering, casterSpellDC, primalSplashCommand,
  primalSplashUses, registerPrimalSplash, registerCasterUses, handleCasterRelay, isCasterUseCommand, casterStateSerial } from "./caster-primal-splash.mjs";
import { registerChain, chainPools, SPARK_EFFECTS, CHAIN_READINGS } from "./caster-chain.mjs";
import { registerMystic, MYSTIC_MANUAL, MYSTIC_COMMANDS, mysticCharge } from "./caster-mystic.mjs";
export { MYSTIC_MANUAL, mysticCharge };
import { registerMech, handleDroneRelay, requestCasterDrone, MECH_READINGS } from "./caster-mech.mjs";
import { primalRest } from "./caster-primal.mjs";
import { useRabbitFromHat, powerFromWithin, armEmpoweredArts, selectSignatureArt, rerollSignatureDice, undoCoreUse, coreRest, validateCoreContext, CORE_FEATURES } from "./caster-core.mjs";
export { SPARK_EFFECTS, CHAIN_READINGS, MECH_READINGS, requestCasterDrone };
export { createCasterDrone, syncCasterDrones, castCasterArt, PRIMAL_CONDITIONS, PRIMAL_CONDITION_NAMES, ENDURING_AFFLICTION, residualSuffering, casterSpellDC };
const serial = casterStateSerial, seenInitiative = new WeakSet();
let baseInstalled = false;
/**
 * Base registration seam (§3.3). `castArt` is injected by the live startup path so the base module
 * never imports the casting facade back. Registration is idempotent, adds one consumer/readings set
 * and never executes a use.
 */
export function registerBase({ castArt } = {}) {
  setBaseCastArt(castArt);
  if (baseInstalled) return;
  baseInstalled = true;
  registerCasterUses({ plans: basePlans, readings: { unendingBasis: BASE_READINGS.unendingBasis, doublecastCost: BASE_READINGS.doublecastCost } });
}
/** True when `useId` names a base (non-branch) receipt, so `useRoll`/`undoUse` route to the base layer. */
function isBaseUse(actor, useId) {
  if (typeof useId !== "string" || !useId) return false;
  return (casterState(actor).undo ?? []).some(entry => entry.id === useId && entry.base === true);
}
// Branch use plans and pools are pure registries (no Foundry side effects), so commands route even before `ready`.
registerPrimalSplash(); registerChain(); registerMech(); registerMystic();
let installed = false;
const safe = promise => Promise.resolve(promise).catch(error => { console.error("AK5e | Caster", error); ui.notifications.error(error.message); });
const RULINGS = Object.freeze({
  costOrder: ["discountsThenSurcharge", "surchargeThenDiscounts"], unendingBasis: ["actualSpend"],
  doublecastCost: ["normal", "free"], deathAboveCost: ["normal", "free"], signatureCantrips: [true, false],
  signatureRerollOnce: [true, false], technologyModifier: ["techTotal", "intMod"], residualStacking: ["latest", "sum"],
  juryTempHP: ["replace", "add"], duplicationCost: [1, 2], potentMultiAttack: [true, false], droneReactionTiming: ["ownBudget"],
  poolReplacement: ["retainKnownArts"], debilitateLoss: ["bypassDRResist", "bypassAll"], safeZoneVsMaximumBurst: ["safeZone", "maximumBurst"],
  sparkCost: ["perCast", "perCreature"], sparkUpgradeBase: ["addsToBase", "replacesBase"]
});
export async function recordCasterRuling(actor, key, value, source) {
  need(game.user.isGM && actor.isOwner, "Only the GM may record Caster rule interpretations.");
  need(RULINGS[key]?.includes(value), "Choose a supported explicit ruling value.");
  need(typeof source === "string" && source.trim().length >= 10, "Record the source and reason for this ruling (at least 10 characters).");
  return serial(actor, async () => {
    const state = casterState(actor); state.rulings[key] = { value, source: source.trim(), approvedBy: game.user.id };
    if (key==="residualStacking" && state.residual?.active && state.residual.amounts?.length > 1) {
      state.residual.amount=value==="sum" ? state.residual.amounts.reduce((sum,amount)=>sum+amount,0) : state.residual.amounts.at(-1);
      state.residual.choice=value;
    }
    await actor.update({ "flags.ak5e.caster": state }); return state.rulings[key];
  });
}
// MYSTIC_COMMANDS (beginRitual/finishRitual/cancelRitual/potent) is engine-routed via registerMystic();
// the import above pins the routed set for review. The inline Mystic branches now live in caster-mystic.mjs.
export function getCasterView(actor) {
  const state = casterState(actor), profile = casterProfile(actor);
  return { profile, state, ap: artsState(actor), charge: casterBranch(actor)==="mystic" ? mysticCharge(actor) : null, residual: residualSuffering(actor), chain: chainPools(actor), casts: state.casts ?? [], spends: state.spends ?? [],
    // Branch-engine receipts (state.undo) share the review queue: a committed-but-unreconciled engine
    // receipt (applying/pending/eventFailed) needs the same retry-or-reconcile path as an inline operation.
    pending: [...state.operations.filter(o => ["prepared","applying","eventFailed"].includes(o.status)), ...(state.undo ?? []).filter(u => ["applying","pending","eventFailed"].includes(u.status)).map(u => ({ id: u.id, command: u.command, status: u.status, label: u.title })), ...state.casts.filter(c => c.status === "failed").map(c => ({ ...c, command:"interrupted cast" })),
      ...(state.burst?.remaining>0 && (state.burst.interrupted || state.burst.turn!==casterTurn(actor)) ? [{id:`burst_${state.burst.castIds[0]}`,status:"interrupted",command:"interrupted burst",label:"Unfinished Mystic burst requires GM review"}] : [])], drones: state.drones.map(uuid => {
      const drone = globalThis.fromUuidSync?.(uuid); return { uuid, name: drone?.name ?? "Missing Arts Master", hp: drone?.system?.attributes?.hp,
        destroyed: flag(drone, "artsMaster")?.destroyed ?? false, tokens: drone?.getActiveTokens?.(true,true)?.map(t => ({ uuid: (t.document ?? t).uuid, name: t.name })) ?? [] };
    }), sourceEntries: casterFeatures(actor), manual: ["Use one operating client for each caster/drone group; receipts are not cross-client locks.",
      "Confirm action economy, rest completion, visibility, targets and concentration at the table. Only one Rest Action can be performed at a time.",
      "Talents, Module effects, Operator Skill riders and Arts without reviewed native activities retain their printed manual procedures.",
      "Apply Signature/Potent damage through the reviewed damage helper; ordinary native Apply Damage does not enforce these exceptions.",
      ...(state.residual?.active && state.residual.amounts?.length > 1 && !state.residual.choice ? [`Army of One: several levelled Arts this Turn; the latest Art's AP (${state.residual.amount}) applies until you choose a reading with "Residual Energy: choose a reading".`] : []),
      ...(casterBranch(actor)==="mech-accord" ? ["Jury Rigging, drone commands, Wolfpack Doctrine and rebuilding follow WORKFLOW.md §3.2: warnings with Use anyway, Roll buttons, and undo from their cards. Drone Actors are created or linked by the GM's client on request."] : []),
      ...(casterBranch(actor)==="primal" ? ["Residual Suffering and Elemental Burst apply the Condition; any Enduring Affliction effect other than Charmed's Speed 0 is resolved at the table.",
        "Debilitate and Destroy: you confirm the target's negative Status Condition; the GM can correct it."] : []),
      ...(casterBranch(actor)==="splash" ? ["Controlled Detonation adds +2 to the DC on Art chat cards for Sphere, Cone, Cube, Cylinder and Line areas. Safe Zone creatures succeed automatically at the table.",
        "Apply Splash area Damage through the reviewed damage helper to enforce Safe Zone and Maximum Burst; native Apply Damage does not."] : []),
      ...(casterBranch(actor)==="chain" ? ["Chain Art and Ouroboros are cast options: target the original and chained Creatures before casting. You confirm that the Art can only affect a single Creature.",
        "Subtle Spark effects last until the start of your next Turn. Bolster and Shred Defences change DR: enter the adjusted DR when applying Damage."] : []),
      ...(casterBranch(actor)==="mystic" ? MYSTIC_MANUAL : []),
      ...(["primal","splash","chain"].includes(casterBranch(actor)) ? ["Changes to Creatures you do not own are applied by the GM's client automatically. Undo a use from its chat card until the encounter window closes."] : [])],
    // Core (C2) and Mystic (C5) receipts live in the same undo ledger, so the sheet's undo and
    // retry controls serve them too; primalSplashUses reads that ledger generically.
    uses: ["primal","splash","chain","mech-accord","core","mystic"].includes(casterBranch(actor)) ? primalSplashUses(actor) : [] };
}
function enabled(actor) { need(actor?.isOwner && !actor.pack && casterEnabled(actor), "Choose an owned, configured Caster."); }
function branchGate(actor, branch, level) { need(casterBranch(actor) === branch && casterLevel(actor) >= level, `This feature requires ${branch} level ${level}.`); }
function currentCast(state, id) { const cast = state.casts?.find(c => c.id === id); need(cast?.completed, "Choose a recorded completed cast."); return cast; }
function sameTurn(actor, cast) { need(cast.turn && cast.turn === casterTurn(actor), "The Art must have been cast during the current Turn."); }
async function rollOnce(actor, state, op, formula) {
  if (op.roll !== undefined) return op.roll;
  const roll = await new Roll(formula, actor.getRollData?.() ?? {}).evaluate();
  op.roll = roll.total;
  await actor.update({ "flags.ak5e.caster": state });
  await roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: "Caster feature", flags: { ak5e: { casterOperation: op.id } } });
  return op.roll;
}
function spendUpdates(actor, state, op, amount, reason) {
  const ap = artsState(actor); need(amount <= ap.value, `Not enough AP: ${amount} required.`);
  const receipt = { id: op.id, amount, reason, turn: casterTurn(actor), before: ap.value, after: ap.value - amount };
  state.spends = [...state.spends, receipt].slice(-40); op.spend = receipt;
  return { "flags.ak5e.artsPoints.value": receipt.after, "flags.ak5e.lastArtCast": null };
}
/** Cast sequences use the native casting receipt; cancellation before consumption spends nothing. */
export async function casterCommand(actor, command, data = {}, operationId = globalThis.foundry?.utils?.randomID?.()) {
  enabled(actor);
  // Base commands (Unending, Doublecast) and base receipt continuations route to the base layer once (§3.3).
  if (BASE_COMMANDS.includes(command) || (["useRoll", "undoUse"].includes(command) && isBaseUse(actor, data?.useId)))
    return baseCommand(actor, command, data, operationId);
  // Branch-engine recovery contract: a committed-but-unreconciled engine receipt (eventFailed) blocks
  // NEW branch uses until it is retried (same operation ID) or reconciled. Prepared inline operations
  // stay on the engine's own legacy path (LEGACY_COMMANDS recovery), not this gate. Receipt
  // continuations (useRoll/undoUse/debilitateRoll) always run; the engine resolves their receipts.
  if (isCasterUseCommand(command) && !["useRoll", "undoUse", "debilitateRoll"].includes(command)) {
    const ledger = casterState(actor);
    const interrupted = (ledger.undo ?? []).some(entry => entry.status === "eventFailed" && entry.id !== operationId);
    need(!interrupted, "Retry or reconcile the interrupted operation before using another feature.");
  }
  // Unending and base-cast undo/rolls stay local; Primal/Splash use their own engine.
  if ((command === "useRoll" || command === "undoUse") && data?.useId) {
    const local = casterState(actor);
    const localOp = local.operations?.find(o => o.id === data.useId);
    const localUndo = local.undo?.find(e => e.id === data.useId);
    const localSpend = local.spends?.find(s => s.id === data.useId);
    if (localOp?.command === "unending" || localUndo?.command === "unending" || localUndo?.command === "baseCast" || (localSpend && !localUndo)) {
      // fall through to local handling below
    } else if (command === "undoUse" && (casterState(actor).undo ?? []).some(entry => entry.id === data.useId && ["rabbit", "powerWithin", "signature", "empower", "signatureDice"].includes(entry.command))) return undoCoreUse(actor, data.useId);
    else if (isCasterUseCommand(command) || (command === "damage" && casterBranch(actor) === "splash")) return primalSplashCommand(actor, command, data, operationId, serial);
  } else if (isCasterUseCommand(command) || (command === "damage" && casterBranch(actor) === "splash")) return primalSplashCommand(actor, command, data, operationId, serial);
  // Core branch delegation (C2): the Core module owns its own per-Actor serial, so its commands
  // return here and never enter the outer serial / burst handling below. The recovery gate is
  // preserved: prepared inline work or a failed cast blocks a new Core use until retry or reconcile.
  if (["rabbit", "powerWithin", "signature", "empower", "signatureDice"].includes(command)) {
    const ledger = casterState(actor);
    need(!(ledger.operations ?? []).some(o => ["prepared", "applying", "eventFailed"].includes(o.status) && o.id !== operationId) && !(ledger.casts ?? []).some(c => c.status === "failed"),
      "Retry or reconcile the interrupted operation before using another feature.");
    if (command === "rabbit") return useRabbitFromHat(actor, data, operationId);
    if (command === "powerWithin") return powerFromWithin(actor, data, operationId);
    if (command === "signature") return selectSignatureArt(actor, data, operationId);
    if (command === "empower") return armEmpoweredArts(actor, data, operationId);
    return rerollSignatureDice(actor, data, operationId);
  }
  if (!["useRoll", "undoUse"].includes(command)) need(data.confirmed === true, "Confirm this feature's source requirements before applying it.");
  const state = casterState(actor);
  if (["burst", "nextBurst", "duplicate", "deathAbove"].includes(command)) {
    need(!state.operations.some(o => ["prepared","applying"].includes(o.status)), "Reconcile or retry the prepared operation first.");
    if (command === "burst") return castCasterArt(actor, data.itemId, { mode: "ap", burstStart: true });
    if (command === "nextBurst") return castCasterArt(actor, state.burst?.itemId, { mode: "ap", burstStep: true });
    const cast = state.casts?.find(c => c.id === data.castId);
    need(cast, "Choose a recorded Art cast to repeat.");
    // Duplication and Death from Above checks are warnings in the cast validation (WORKFLOW.md §3.2).
    return castCasterArt(actor, cast.itemId,
      { mode: "ap", level: cast.level, repeat: command,
        previousCastId: cast.id, droneTokenUuid: data.droneTokenUuid, ...(command === "duplicate" ? {sameTargets:data.sameTargets} : {}),
        ...(data.overrides ? { overrides: data.overrides } : {}), ...(data.reading !== undefined ? { reading: data.reading } : {}) });
  }
  need(typeof operationId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(operationId), "A stable operation ID is required.");
  const result = await serial(actor, async () => {
    const next = casterState(actor), previous = next.operations.find(o => o.id === operationId);
    if (previous) {
      need(previous.command === command && JSON.stringify(previous.data) === JSON.stringify(data), "Retry with the same operation ID and exact choices.");
      if (["complete","eventFailed"].includes(previous.status)) return { ...previous.result, spend:previous.spend };
      need(previous.status === "prepared", "This operation was already reconciled.");
    }
    if (command === "reconcile") {
      need(game.user.isGM && data.reason?.trim().length >= 10, "A GM must review resources, targets and rolls and record a reconciliation reason.");
      const abandonedBurst = next.burst?.remaining>0 && data.operationId===`burst_${next.burst.castIds[0]}` && (next.burst.interrupted || next.burst.turn!==casterTurn(actor));
      if (abandonedBurst) {
        next.burstRecovery={...next.burst,reason:data.reason,approvedBy:game.user.id,status:"reconciled"}; next.burst=null;
        await actor.update({"flags.ak5e.caster":next}); return {reconciled:data.operationId};
      }
      const pending = next.operations.find(o => o.id === data.operationId && ["prepared","eventFailed"].includes(o.status)) ?? next.casts.find(c => c.id === data.operationId && c.status === "failed"); need(pending, "Choose an interrupted operation.");
      pending.status = "reconciled"; pending.reason = data.reason; await actor.update({ "flags.ak5e.caster": next }); return { reconciled: pending.id };
    }
    if (!["useRoll", "undoUse"].includes(command)) need(!next.operations.some(o => ["prepared","applying","eventFailed"].includes(o.status) && o.id !== operationId) && !next.casts.some(c => c.status === "failed"), "Retry or reconcile the interrupted operation before using another feature.");
    const op = previous ?? { id: operationId, command, data: structuredClone(data), status: "prepared" };
    if (!previous) { next.operations = [...next.operations.filter(o => o.status === "prepared" || o.id !== operationId).slice(-39), op]; }
    // Validate source gates BEFORE preparing a receipt; invalid input never blocks the actor.
    // Core commands (rabbit/powerWithin/signature/empower/signatureDice) return through the Core
    // module above and never reach this inline handling; Mystic commands route via the use engine.
    need(["damage","unending","useRoll","undoUse"].includes(command), "Unknown Caster command.");
    const updates = {}; let output = {};
    if (command === "unending") {
      need(casterLevel(actor)>=18,"Unending requires Caster level 18."); need(casterRuling(actor,"unendingBasis")==="actualSpend","Review Unending's expenditure basis.");
      const spend=next.spends.find(s=>s.id===data.spendId); need(spend?.amount>0&&!spend.refundRolled,"Choose an AP expenditure awaiting its Unending roll.");
      output={awaitingRoll:true,formula:"1d6",spendId:spend.id}; op.awaitingUnending=spend.id;
    } else if (command === "useRoll") {
      const targetOp=next.operations.find(o=>o.id===data.useId);
      need(targetOp?.command==="unending"&&targetOp.awaitingUnending,"Choose a use that is waiting for its roll.");
      need(targetOp.status!=="undone","That use was undone.");
      if (targetOp.status==="complete"&&targetOp.result?.roll!==undefined) { output={...targetOp.result}; }
      else {
        const spend=next.spends.find(s=>s.id===targetOp.awaitingUnending); need(spend?.amount>0,"Choose an AP expenditure awaiting its Unending roll.");
        if (spend.refundRolled&&spend.refundRoll!==undefined) { output={roll:spend.refundRoll,refunded:spend.refundRoll===spend.amount?spend.amount:0}; }
        else {
          await actor.update({"flags.ak5e.caster":next}); const rolled=await rollOnce(actor,next,targetOp,"1d6"); spend.refundRolled=true; spend.refundRoll=rolled;
          const refunded=rolled===spend.amount?spend.amount:0;
          if(refunded>0) updates["flags.ak5e.artsPoints.value"]=artsState(actor).value+refunded;
          next.undo??=[];
          const undo={id:targetOp.id,command:"unending",title:"Unending refund",epoch:next.operations.length,createdAt:Date.now(),status:"complete",targets:[],caster:{pool:{path:"flags.ak5e.artsPoints.value",before:artsState(actor).value,after:artsState(actor).value+refunded,poolLabel:"Arts Points",unit:"AP"}},spendId:spend.id,refunded};
          if(!next.undo.some(e=>e.id===undo.id)) next.undo=[...next.undo,undo].slice(-60);
          if(!next.undo.some(e=>e.id===spend.id)) next.undo=[...next.undo,{id:spend.id,command:"baseCast",title:"Art cast AP spend",status:"complete",targets:[],caster:{pool:{path:"flags.ak5e.artsPoints.value",before:(artsState(actor).value+spend.amount),after:artsState(actor).value,poolLabel:"Arts Points",unit:"AP"}},spendId:spend.id}].slice(-60);
          const use = next.undo?.find(entry => entry.id === spend.id && entry.caster?.pool?.path === "flags.ak5e.artsPoints.value");
          if (use&&refunded>0) { use.caster.pool.refunds ??= []; if (!use.caster.pool.refunds.includes(targetOp.id)) use.caster.pool.refunds.push(targetOp.id); use.caster.pool.refunded = use.caster.pool.refunds.length * spend.amount; }
          output={roll:rolled,refunded}; targetOp.result=output; targetOp.status="complete"; delete targetOp.awaitingUnending;
        }
      }
    } else if (command === "undoUse") {
      const receipt=next.undo?.find(e=>e.id===data.useId);
      if (receipt) {
        if (receipt.status==="undone") { output={undone:receipt.id,already:true}; }
        else if (receipt.command==="unending") {
          const spend=next.spends.find(s=>s.id===receipt.spendId);
          if (spend&&receipt.refunded>0) { updates["flags.ak5e.artsPoints.value"]=Math.max(0,artsState(actor).value-receipt.refunded); spend.refundRolled=undefined; spend.refundRoll=undefined; }
          else if (spend) { spend.refundRolled=undefined; spend.refundRoll=undefined; }
          receipt.status="undone"; output={undone:receipt.id};
        } else if (receipt.command==="baseCast") {
          const pool=receipt.caster?.pool;
          if (pool?.path&&pool.before!==undefined) {
            const restore=Math.max(0,Number(pool.before)-Number(pool.after)-Number(pool.refunded??0));
            updates[pool.path]=artsState(actor).value+restore;
          } else {
            const spend=next.spends.find(s=>s.id===receipt.spendId||s.id===receipt.id);
            if (spend) updates["flags.ak5e.artsPoints.value"]=artsState(actor).value+spend.amount;
          }
          receipt.status="undone"; output={undone:receipt.id};
        } else { need(false,"This use cannot be undone here."); }
      } else {
        const spend=next.spends.find(s=>s.id===data.useId); need(spend,"This use is no longer recorded.");
        if (spend.refundRoll!==undefined) { updates["flags.ak5e.artsPoints.value"]=artsState(actor).value; }
        else updates["flags.ak5e.artsPoints.value"]=artsState(actor).value+spend.amount;
        output={undone:spend.id};
      }
    } else if (command === "damage") {
      const cast=currentCast(next,data.castId),target=fromUuidSync(data.targetUuid); need(target?.documentName==="Actor"&&(game.user.isGM||target.isOwner),"The GM must apply Damage to an unowned target.");
      let amount=integer(data.amount,"Reviewed rolled Damage",0),signature=casterBranch(actor)==="core"&&casterLevel(actor)>=15&&next.signature?.itemId===cast.itemId;
      need(Number.isFinite(data.reduction)&&typeof data.resistance==="boolean"&&typeof data.vulnerability==="boolean"&&typeof data.immunity==="boolean","Confirm DR, resistance, vulnerability and immunity before applying Damage.");
      const result=op.damageResult ?? resolveDamage({amount:data.immunity?0:amount,type:data.type,reduction:data.reduction,resistance:data.resistance,vulnerability:data.vulnerability,ignoreDR:signature,ignoreResistance:signature,hp:target.system.attributes.hp});
      op.damageResult = result;
      await actor.update({"flags.ak5e.caster":next});
      if(!flag(target,"casterReceipts")?.[op.id]) await target.update({"system.attributes.hp.value":result.newHp,"system.attributes.hp.temp":result.newTemp,"flags.ak5e.casterReceipts":{...(flag(target,"casterReceipts")??{}),[op.id]:true}});
      output={...result};
    }
    if (output?.awaitingRoll) { op.status="prepared"; op.result=output; Object.assign(updates,{"flags.ak5e.caster":next}); await actor.update(updates); return {...output,spend:op.spend}; }
    op.status="complete"; op.result=output; Object.assign(updates,{"flags.ak5e.caster":next}); await actor.update(updates); return {...output,spend:op.spend};
  });
  if(result?.spend?.amount>0) {
    const event=await emitAk5eEvent("apSpent",{actorUuid:actor.uuid,operationId:result.spend.id,amount:result.spend.amount,turn:result.spend.turn,reason:result.spend.reason});
    await serial(actor,async()=>{
      const state=casterState(actor), op=state.operations.find(o=>o.id===operationId);
      if(op && (event.errors || op.status==="eventFailed")) {op.status=event.errors?"eventFailed":"complete";op.error=event.errors?"Resources committed but AP event handling failed; retry the same receipt or obtain GM reconciliation.":null;await actor.update({"flags.ak5e.caster":state});}
    });
    need(!event.errors,"Resources were consumed but AP event handling failed. Retry this receipt or obtain GM reconciliation.");
  }
  return result;
}
export async function handleCasterEvent(event) {
  const actor=fromUuidSync(event.actorUuid); if(!actor||!casterEnabled(actor)||!actor.isOwner)return;
  // Base expenditure/cast bookkeeping is owned by caster-base (§3.3): one delegated base event, then
  // the branch state below. `baseEvent` serializes its own write and is idempotent for a replay.
  await baseEvent(event);
  return serial(actor,async()=>{
    const state=casterState(actor),receipt=`${event.kind}_${event.operationId}`;
    state.events??=[]; if(state.events.includes(receipt))return;
    state.events=[...state.events,receipt].slice(-160);
    const updates={}; let residualNotice=null;
    if(event.kind==="apSpent") {
      // The base layer already recorded the trigger and the Turn tally.
    } else if(event.kind==="artCast") {
      if(casterBranch(actor)==="mystic"&&casterLevel(actor)>=15&&event.amount>0)updates["flags.ak5e.resourcePools.mysticCharge.value"]=Math.min(mysticCharge(actor).max,mysticCharge(actor).value+1+(event.level>=6?1:0));
      if(casterBranch(actor)==="mech-accord"&&casterLevel(actor)>=10&&event.level>0&&event.amount>=0&&event.turn){
        // Several levelled Arts this Turn: a GM ruling, otherwise the player's reading (residualReading); until then the latest applies.
        const old=state.residual, amounts=old?.active?[...(old.amounts??[old.amount]),event.amount]:[event.amount];
        const choice=state.rulings.residualStacking?.value ?? (old?.active ? old.choice ?? null : null);
        state.residual={turn:event.turn,active:true,amount:choice==="sum"?amounts.reduce((sum,amount)=>sum+amount,0):event.amount,amounts,choice};
        if(amounts.length===2&&!choice)residualNotice=amounts;
      }
    }
    updates["flags.ak5e.caster"]=state; await actor.update(updates);
    // No ruling: the latest Art applies until the player picks a reading for this Turn; say so (WORKFLOW.md §3.2).
    if(residualNotice) await ChatMessage.implementation.create({speaker:ChatMessage.implementation.getSpeaker({actor}),whisper:values(game.users).filter(u=>u.isGM||actor.testUserPermission?.(u,"OWNER")).map(u=>u.id),
      content:`<h3>Residual Energy Recyclers</h3><p>Several levelled Arts this Turn (${residualNotice.join(", ")} AP). The GM has not ruled how they combine, so the latest Art's AP applies. Choose "Residual Energy: choose a reading" on the Caster panel to add them instead for this Turn.</p>`});
  });
}
export async function casterTurnEvent(event) {
  const actor=fromUuidSync(event.actorUuid); if(!actor||!actor.isOwner||!casterEnabled(actor))return;
  return serial(actor,async()=>{
    const state=casterState(actor),updates={},id=`${event.kind}_${event.combatUuid}_${event.round}_${event.combatantId??event.turn}`;
    state.events??=[];if(state.events.includes(id))return;state.events.push(id);state.events=state.events.slice(-160);
    const endedTurn = `${event.combatUuid}:${event.round}:${event.combatantId??event.turn}`;
    if(event.kind==="turnEnd"&&casterBranch(actor)==="mystic"&&state.turn.key===endedTurn&&state.turn.apSpent>0&&!state.turn.chargesSpent&&!event.skipped)updates["flags.ak5e.resourcePools.mysticCharge.value"]=Math.min(mysticCharge(actor).max,mysticCharge(actor).value+1);
    if(event.kind==="turnEnd"&&casterBranch(actor)==="mech-accord"&&!event.skipped)state.residual=null;
    if(event.kind==="turnEnd"&&state.burst?.remaining>0&&!event.skipped)state.burst.interrupted=true;
    if(event.kind==="turnStart"&&!event.skipped) {state.turn={key:endedTurn,apSpent:0,chargesSpent:0};state.attackLocks={};
      for(const uuid of state.drones){const d=fromUuidSync(uuid);if(d?.isOwner)await d.update({"flags.ak5e.artsMaster.reactionTurn":null});}}
    updates["flags.ak5e.caster"]=state;await actor.update(updates);
  });
}
export async function casterRest(actor,type) {
  if(!actor.isOwner||!casterEnabled(actor))return;
  // Base recovery (AP on a Long Rest, ninth-level flag, the once-per-Short-Rest Doublecast use) is
  // delegated to caster-base once (§3.3); the branch state below joins a following write.
  if(type==="short"||type==="long") await baseRest(actor,type);
  return serial(actor,async()=>{
    const state=casterState(actor),updates={};
    if(type==="short"||type==="long"){
      state.uses.doublecast=false;state.uses.elementalBurst=false;state.uses.allConsuming=false;
      // A Wolfpack Reaction taken outside combat has no creator Turn to reset it; a rest does.
      for(const uuid of state.drones){const d=fromUuidSync(uuid);if(d?.isOwner&&String(flag(d,"artsMaster")?.reactionTurn??"").startsWith("outside_"))await d.update({"flags.ak5e.artsMaster.reactionTurn":null});}}
    if(type==="long"){
      state.uses.rabbit=false;state.uses.powerWithin=false;state.turn={};
      if(state.burst?.remaining>0) state.burst.interrupted=true;
      else state.burst=null;
      state.ritual=null;state.attackLocks={};state.residual=null;
      if(casterBranch(actor)==="mystic")updates["flags.ak5e.resourcePools.mysticCharge.value"]=0;
      state.borrowed=null;
      const res=await primalRest(actor,type);
      for (const r of (res??[])) {
        if (r?.error) throw new Error(`Residual Suffering recovery failed: ${r.error}`);
        if (r?.poolId&&r?.value!==undefined) updates[`flags.ak5e.resourcePools.${r.poolId}.value`]=r.value;
      }
    }
    updates["flags.ak5e.caster"]=state;await actor.update(updates);
  });
}
export async function casterCombatEnd(event) {
  for (const uuid of event.actorUuids ?? []) {
    const actor = fromUuidSync(uuid);
    if (!actor?.isOwner || !casterEnabled(actor)) continue;
    await serial(actor, async () => {
      const state = casterState(actor);
      state.residual = null;
      state.attackLocks = {};
      state.turn = {};
      if (state.burst?.remaining>0) state.burst.interrupted=true;
      // An unfinished burst remains visible for reviewed recovery; it cannot
      // silently resume with its old combat Turn outside that combat.
      await actor.update({ "flags.ak5e.caster":state });
    });
  }
}
export async function reviewCasterEligibility(actor) {
  if (!actor?.isOwner || !casterState(actor).enabled) return;
  const eligible = casterEnabled(actor) && casterBranch(actor) === "core" && casterLevel(actor) >= 10;
  if (eligible) return;
  for (const effect of values(actor.effects)) {
    if (!flag(effect,"casterManagedEffect") || effect.disabled) continue;
    await effect.update({disabled:true,"flags.ak5e.casterManagedEffect.active":false,"flags.ak5e.casterManagedEffect.reviewRequired":true});
  }
}
export async function casterInitiative(actor, roll = actor?._cachedInitiativeRoll, operationId = null) {
  if(!actor?.isOwner||!casterEnabled(actor)||casterBranch(actor)!=="mystic"||casterLevel(actor)<10)return;
  if (!roll || seenInitiative.has(roll)) return;
  seenInitiative.add(roll);
  return serial(actor,async()=>{
    const state=casterState(actor), id=operationId ? `initiative_${operationId}` : null;
    state.events??=[];
    if(id&&state.events.includes(id))return;
    if(id)state.events=[...state.events,id].slice(-160);
    await actor.update({"flags.ak5e.caster":state,"flags.ak5e.resourcePools.mysticCharge.value":Math.min(mysticCharge(actor).max,mysticCharge(actor).value+1)});
  });
}
export async function casterInitiativeMessage(message, userId) {
  if (userId !== game.user.id || !message.getFlag?.("core","initiativeRoll")) return;
  const roll=values(message.rolls)[0];
  if (!roll?.dice?.length) return; // Fixed initiative and direct edits are not rolls.
  const speaker=message.speaker ?? {};
  const actor=game.scenes?.get(speaker.scene)?.tokens?.get(speaker.token)?.actor ?? game.actors?.get(speaker.actor);
  return casterInitiative(actor,roll,message.uuid??message.id);
}
export function registerCasterFeatureHooks() {
  if(installed)return;installed=true;
  // The live startup path injects the facade's own cast callback exactly once (§3.3): the base
  // module never imports the casting facade back, and a later redundant registration is inert.
  registerBase({ castArt: castCasterArt });
  if(!getPoolDefinition("mysticCharge"))definePool({id:"mysticCharge",label:"Mystic Charge",max:{1:2,10:3},initial:0,classId:"class-caster",levelBasis:"classLevel",appliesTo:a=>casterEnabled(a)&&casterBranch(a)==="mystic",recovery:[{on:"lr",amount:"toInitial"}]});
  registerPrimalSplash();
  registerChain();
  registerMech();
  registerMystic();
  registerCasterCastingHooks();
  onAk5eEvent("apSpent",handleCasterEvent);onAk5eEvent("artCast",handleCasterEvent);onAk5eEvent("turnStart",casterTurnEvent);onAk5eEvent("turnEnd",casterTurnEvent);
  onAk5eEvent("combatEnd",casterCombatEnd);
  // One `createChatMessage` listener dispatches initiative, Caster relay and Arts Master relay, so
  // registering the hooks twice can never stack a second listener for the same event (§3.3).
  Hooks.on("createChatMessage",(message,options,userId)=>{
    safe(casterInitiativeMessage(message,userId));
    Promise.resolve(handleCasterRelay(message,options,userId)).catch(error=>console.error("AK5e | Caster relay",error));
    Promise.resolve(handleDroneRelay(message,options,userId)).catch(error=>console.error("AK5e | Arts Master relay",error));
  });
  Hooks.on("dnd5e.restCompleted",(actor,result,config={})=>safe(casterRest(actor,config.type??result?.type)));
  Hooks.on("dnd5e.preUseActivity",(activity,usage)=>droneAttackGate(activity,{stage:"use",args:[usage]}));
  // One `dnd5e.preRollAttackV2` listener: the Caster attack configuration (Power Surge on a damaging
  // cantrip, C1:197-198) runs first, then the drone gate, exactly as the two separate registrations
  // did, so a repeated registration can never stack listeners (§3.3).
  Hooks.on("dnd5e.preRollAttackV2",(config,dialog,message)=>{casterAttackConfig(config);droneAttackGate(config.subject,{stage:"attack",args:[config,dialog,message]});});
  const classChanged = (item, userId) => {
    if (game.user.id === userId && ["class","subclass"].includes(item.type)) safe(reviewCasterEligibility(item.parent));
  };
  Hooks.on("updateItem",(item,_changes,_options,userId)=>classChanged(item,userId));
  Hooks.on("deleteItem",(item,_options,userId)=>classChanged(item,userId));
  Hooks.on("updateActor",(actor,changed,_options,userId)=>{
    if(game.user.id!==userId||!actor.isOwner)return;
    if(flag(actor,"artsMaster")&&actor.system.attributes.hp.value===0&&!flag(actor,"artsMaster").destroyed)safe(actor.update({"flags.ak5e.artsMaster.destroyed":true}));
  });
  Hooks.on("updateToken",(token,changed,_options,userId)=>{
    if(!["x","y","elevation"].some(k=>k in changed)||game.user.id!==userId)return;
    const actor=token.actor;if(!actor?.isOwner||!casterState(actor).ritual)return;
    safe(serial(actor,async()=>{const state=casterState(actor);if(state.ritual){state.ritual.interrupted=true;await actor.update({"flags.ak5e.caster":state});}}));
  });
}
