/** Explicit owner-operated Caster features; GM-reviewed exceptions and durable receipts. */
import { casterLevel, casterBranch, casterState, casterProfile, casterFeatures, standardPools } from "./caster-rules.mjs";
import { resolveCasterArtData } from "./caster-setup.mjs";
import { casterEnabled, casterTurn, casterRuling, coreDamageTypes, castCasterArt, registerCasterCastingHooks } from "./caster-casting.mjs";
import { createCasterDrone, syncCasterDrones, droneAttackGate } from "./caster-drones.mjs";
import { artsState, recoveryValue, integer } from "./arts-rules.mjs";
import { flag, values, need } from "./operation-kernel.mjs";
import { definePool, getPoolDefinition } from "./resource-pools.mjs";
import { onAk5eEvent, emitAk5eEvent } from "./trigger-events.mjs";
import { resolveDamage } from "./damage-pipeline.mjs";
import { PRIMAL_CONDITIONS, PRIMAL_CONDITION_NAMES, ENDURING_AFFLICTION, residualSuffering, casterSpellDC, primalSplashCommand,
  primalSplashUses, registerPrimalSplash, handleCasterRelay, isCasterUseCommand, casterStateSerial } from "./caster-primal-splash.mjs";
import { registerChain, chainPools, SPARK_EFFECTS, CHAIN_READINGS } from "./caster-chain.mjs";
import { registerMech, handleDroneRelay, requestCasterDrone, MECH_READINGS } from "./caster-mech.mjs";
export { SPARK_EFFECTS, CHAIN_READINGS, MECH_READINGS, requestCasterDrone };
export { createCasterDrone, syncCasterDrones, castCasterArt, PRIMAL_CONDITIONS, PRIMAL_CONDITION_NAMES, ENDURING_AFFLICTION, residualSuffering, casterSpellDC };
const serial = casterStateSerial, seenInitiative = new WeakSet();
// Branch use plans and pools are pure registries (no Foundry side effects), so commands route even before `ready`.
registerPrimalSplash(); registerChain(); registerMech();
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
export function mysticCharge(actor) {
  const stored = flag(actor, "resourcePools")?.mysticCharge?.value ?? 0, max = casterLevel(actor) >= 10 ? 3 : 2;
  return { value: Math.min(max, Number(stored) || 0), max };
}
export function getCasterView(actor) {
  const state = casterState(actor), profile = casterProfile(actor);
  return { profile, state, ap: artsState(actor), charge: casterBranch(actor)==="mystic" ? mysticCharge(actor) : null, residual: residualSuffering(actor), chain: chainPools(actor), casts: state.casts ?? [], spends: state.spends ?? [],
    pending: [...state.operations.filter(o => ["prepared","applying","eventFailed"].includes(o.status)), ...state.casts.filter(c => c.status === "failed").map(c => ({ ...c, command:"interrupted cast" })),
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
      ...(["primal","splash","chain"].includes(casterBranch(actor)) ? ["Changes to Creatures you do not own are applied by the GM's client automatically. Undo a use from its chat card until the encounter window closes."] : [])],
    uses: ["primal","splash","chain","mech-accord"].includes(casterBranch(actor)) ? primalSplashUses(actor) : [] };
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
  // Primal and Splash follow WORKFLOW.md §3.2 (warnings, readings, GM relay, undo); see caster-primal-splash.mjs.
  if (isCasterUseCommand(command) || (command === "damage" && casterBranch(actor) === "splash")) return primalSplashCommand(actor, command, data, operationId, serial);
  need(data.confirmed === true, "Confirm this feature's source requirements before applying it.");
  const state = casterState(actor);
  if (["burst", "nextBurst", "doublecast", "duplicate", "deathAbove"].includes(command)) {
    need(!state.operations.some(o => ["prepared","applying"].includes(o.status)), "Reconcile or retry the prepared operation first.");
    if (command === "burst") return castCasterArt(actor, data.itemId, { mode: "ap", burstStart: true });
    if (command === "nextBurst") return castCasterArt(actor, state.burst?.itemId, { mode: "ap", burstStep: true });
    const cast = command === "doublecast" ? currentCast(state, data.castId) : state.casts?.find(c => c.id === data.castId);
    need(cast, "Choose a recorded Art cast to repeat.");
    // Duplication and Death from Above checks are warnings in the cast validation (WORKFLOW.md §3.2).
    return castCasterArt(actor, command === "doublecast" ? data.itemId : cast.itemId,
      { mode: "ap", level: command === "doublecast" ? data.level : cast.level, repeat: command,
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
    need(!next.operations.some(o => ["prepared","applying","eventFailed"].includes(o.status) && o.id !== operationId) && !next.casts.some(c => c.status === "failed"), "Retry or reconcile the interrupted operation before using another feature.");
    const op = previous ?? { id: operationId, command, data: structuredClone(data), status: "prepared" };
    if (!previous) { next.operations = [...next.operations.filter(o => o.status === "prepared" || o.id !== operationId).slice(-39), op]; }
    // Validate source gates BEFORE preparing a receipt; invalid input never blocks the actor.
    if (["rabbit", "powerWithin", "signature", "empower", "signatureDice"].includes(command)) branchGate(actor, "core", { rabbit:1,powerWithin:3,signature:15,empower:6,signatureDice:15 }[command]);
    if (["beginRitual","finishRitual","cancelRitual","potent"].includes(command)) branchGate(actor,"mystic",command === "potent" ? 3 : 1);
    need(["rabbit","powerWithin","signature","empower","signatureDice","beginRitual","finishRitual","cancelRitual","potent","damage","unending"].includes(command), "Unknown Caster command.");
    const updates = {}; let output = {};
    if (command === "rabbit") {
      need(!next.uses.rabbit, "Rabbit from the Hat has been used since the last Long Rest.");
      const art = standardPools.flatMap(p => p.members).find(a => a.name === data.poolArtName);
      need(art && art.level <= artsState(actor).maximumArtLevel, "Choose a Standard-pool Art no higher than your maximum Art level.");
      let item = values(actor.items).find(i => flag(i,"casterPoolName") === art.name || flag(i,"casterArtGrant")?.sourceName === art.name || flag(i,"casterArtGrants")?.some?.(grant => grant.sourceName === art.name) || flag(i,"chapterFiveId") === art.sourceId && art.sourceId);
      if (!item) {
        const source = await resolveCasterArtData(art.name); need(source, "The GM must review a spell mapping for this Art first.");
        await actor.update({ "flags.ak5e.caster": next });
        const already = values(actor.items).find(i => flag(i,"casterRabbitOperation") === op.id);
        item = already ?? (await actor.createEmbeddedDocuments("Item", [{ ...source, flags: { ...source.flags, ak5e: { ...source.flags?.ak5e, casterBorrowed: true, casterRabbitOperation: op.id,
          casterArtGrant:source.flags?.ak5e?.casterArtGrants?.[0], casterArtGrants: ["rabbit"] } } }]))[0];
        need(item, "The borrowed Art could not be added.");
      }
      next.borrowed = { itemId:item.id, name:art.name }; next.uses.rabbit = true; output = next.borrowed;
    } else if (command === "powerWithin") {
      need(data.restCompleted === true && !next.uses.powerWithin, "Complete the Short Rest activity; it is usable once per Long Rest.");
      updates["flags.ak5e.artsPoints.value"] = recoveryValue(artsState(actor), Math.ceil(casterLevel(actor)/2));
      next.uses.powerWithin = true; output = { recovered:updates["flags.ak5e.artsPoints.value"]-artsState(actor).value };
    } else if (command === "signature") {
      need(data.restCompleted === true, "Complete the Signature selection Long Rest activity.");
      const item = actor.items.get(data.itemId); need(item?.type === "spell" && item.system.level <= 5, "Choose a known Art of level 5 or less.");
      if (item.system.level === 0) need(casterRuling(actor,"signatureCantrips") === true,"The GM must permit Cantrip Signature selection.");
      need(typeof data.damaging === "boolean", "Confirm whether this Art can deal Damage.");
      next.signature = { itemId:item.id, damaging:data.damaging }; output = next.signature;
    } else if (command === "empower") {
      const cast = currentCast(next,data.castId); sameTurn(actor,cast); need(next.uses.empowered !== cast.turn,"Empowered Arts has already been used this Turn.");
      next.empowerCastId = cast.id; output = { armed:cast.id, instruction:"Roll damage from this cast's chat card; the optional bonus is consumed only when a damage roll completes." };
    } else if (command === "signatureDice") {
      const cast = currentCast(next,data.castId); need(cast.itemId === next.signature?.itemId,"Choose a Signature Art damage roll.");
      const indices = data.indices; need(Array.isArray(indices) && indices.every(i=>Number.isInteger(i) && data.results?.[i] <= 3),"Choose only original dice showing 3 or less.");
      need(casterRuling(actor,"signatureRerollOnce") === true,"Recursive or interacting rerolls need a manually reviewed procedure.");
      need(Array.isArray(data.results) && data.results.every(r=>Number.isInteger(r)&&r>=1&&r<=data.faces),"Enter the reviewed original die results.");
      if (!op.result) {
        // Persist replacements before chat/application so retry never re-rolls.
        op.diceRolls ??= {};
        const replacements=[]; for(const i of [...new Set(indices)]) {
          const die = op.diceRolls[i] ??= { id:`${op.id}_${i}` };
          replacements.push({ index:i,value:await rollOnce(actor,next,die,`1d${integer(data.faces,"Die faces",2,100)}`) });
        }
        op.result = { results:data.results.map((r,i)=>replacements.find(v=>v.index===i)?.value??r), replacements };
      }
      output = op.result;
    } else if (command === "beginRitual") {
      need(!next.ritual,"A charging ritual is already pending.");
      next.ritual = { start:game.time.worldTime, positions:actor.getActiveTokens?.(true,true)?.map(t=>{const d=t.document??t;return {uuid:d.uuid,x:d.x,y:d.y,elevation:d.elevation};})??[], interrupted:false };
      output = { started:true };
    } else if (command === "finishRitual") {
      const n=integer(data.ap,"Ritual AP",0,3); need(next.ritual && !next.ritual.interrupted,"Start a new uninterrupted charging ritual.");
      need(data.stationary===true&&data.concentration===true&&data.minuteCompleted===true,"Confirm the full stationary, concentration-like minute completed.");
      need(game.time.worldTime >= next.ritual.start+60,"Advance World time after the one-minute ritual is completed.");
      const charge=mysticCharge(actor); Object.assign(updates,spendUpdates(actor,next,op,n,"Mystic Charge ritual"));
      updates["flags.ak5e.resourcePools.mysticCharge.value"]=Math.min(charge.max,charge.value+n); next.ritual=null; output={charge:updates["flags.ak5e.resourcePools.mysticCharge.value"]};
    } else if (command === "cancelRitual") { next.ritual=null; output={canceled:true};
    } else if (command === "unending") {
      need(casterLevel(actor)>=18,"Unending requires Caster level 18."); need(casterRuling(actor,"unendingBasis")==="actualSpend","Review Unending's expenditure basis.");
      const spend=next.spends.find(s=>s.id===data.spendId); need(spend?.amount>0&&!spend.refundRolled,"Choose an AP expenditure awaiting its Unending roll.");
      await actor.update({"flags.ak5e.caster":next}); const rolled=await rollOnce(actor,next,op,"1d6"); spend.refundRolled=true; spend.refundRoll=rolled;
      if(rolled===spend.amount) {
        updates["flags.ak5e.artsPoints.value"]=artsState(actor).value+spend.amount;
        const use = next.undo?.find(entry => entry.id === spend.id && entry.caster?.pool?.path === "flags.ak5e.artsPoints.value");
        if (use) {
          use.caster.pool.refunds ??= [];
          if (!use.caster.pool.refunds.includes(op.id)) use.caster.pool.refunds.push(op.id);
          use.caster.pool.refunded = use.caster.pool.refunds.length * spend.amount;
        }
      }
      output={roll:rolled,refunded:rolled===spend.amount?spend.amount:0};
    } else if (command === "damage" || command === "potent") {
      const cast=currentCast(next,data.castId),target=fromUuidSync(data.targetUuid); need(target?.documentName==="Actor"&&(game.user.isGM||target.isOwner),"The GM must apply Damage to an unowned target.");
      let amount=integer(data.amount,"Reviewed rolled Damage",0),signature=casterBranch(actor)==="core"&&casterLevel(actor)>=15&&next.signature?.itemId===cast.itemId;
      if(command==="potent") {need(cast.level===0&&["miss","save"].includes(data.outcome),"Potent Cantrip requires a missed Cantrip attack or successful save."); if(data.multiAttack) need(casterRuling(actor,"potentMultiAttack")===true,"Review multi-attack Cantrip damage."); amount=Math.floor(amount/2);}
      need(Number.isFinite(data.reduction)&&typeof data.resistance==="boolean"&&typeof data.vulnerability==="boolean"&&typeof data.immunity==="boolean","Confirm DR, resistance, vulnerability and immunity before applying Damage.");
      const result=op.damageResult ?? resolveDamage({amount:data.immunity?0:amount,type:data.type,reduction:data.reduction,resistance:data.resistance,vulnerability:data.vulnerability,ignoreDR:signature,ignoreResistance:signature,hp:target.system.attributes.hp});
      op.damageResult = result;
      await actor.update({"flags.ak5e.caster":next});
      if(!flag(target,"casterReceipts")?.[op.id]) await target.update({"system.attributes.hp.value":result.newHp,"system.attributes.hp.temp":result.newTemp,"flags.ak5e.casterReceipts":{...(flag(target,"casterReceipts")??{}),[op.id]:true}});
      output={...result,noAdditionalEffects:command==="potent"};
    }
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
  return serial(actor,async()=>{
    const state=casterState(actor),receipt=`${event.kind}_${event.operationId}`;
    state.events??=[]; if(state.events.includes(receipt))return;
    state.events=[...state.events,receipt].slice(-160);
    const updates={}; let residualNotice=null;
    if(event.kind==="apSpent") {
      if(!state.spends.some(s=>s.id===event.operationId))state.spends=[...state.spends,{id:event.operationId,amount:event.amount,turn:event.turn,level:event.level,reason:event.reason??"Art cast"}].slice(-40);
      if(event.turn){state.turn=state.turn.key===event.turn?state.turn:{key:event.turn,apSpent:0,chargesSpent:0};state.turn.apSpent+=event.amount;}
    } else if(event.kind==="artCast") {
      const cast=state.casts.find(c=>c.id===event.operationId); if(cast){cast.completed=true;cast.status="complete";}
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
  return serial(actor,async()=>{
    const state=casterState(actor),updates={};
    if(type==="short"||type==="long"){state.uses.doublecast=false;state.uses.elementalBurst=false;state.uses.allConsuming=false;
      // A Wolfpack Reaction taken outside combat has no creator Turn to reset it; a rest does.
      for(const uuid of state.drones){const d=fromUuidSync(uuid);if(d?.isOwner&&String(flag(d,"artsMaster")?.reactionTurn??"").startsWith("outside_"))await d.update({"flags.ak5e.artsMaster.reactionTurn":null});}}
    if(type==="long"){
      state.uses.rabbit=false;state.uses.powerWithin=false;state.turn={};
      if(state.burst?.remaining>0) state.burst.interrupted=true;
      else state.burst=null;
      state.ritual=null;state.attackLocks={};state.residual=null;
      if(casterBranch(actor)==="mystic")updates["flags.ak5e.resourcePools.mysticCharge.value"]=0;
      state.borrowed=null;
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
  if(!getPoolDefinition("mysticCharge"))definePool({id:"mysticCharge",label:"Mystic Charge",max:{1:2,10:3},initial:0,classId:"class-caster",levelBasis:"classLevel",appliesTo:a=>casterEnabled(a)&&casterBranch(a)==="mystic",recovery:[{on:"lr",amount:"toInitial"}]});
  registerPrimalSplash();
  registerChain();
  registerMech();
  registerCasterCastingHooks();
  onAk5eEvent("apSpent",handleCasterEvent);onAk5eEvent("artCast",handleCasterEvent);onAk5eEvent("turnStart",casterTurnEvent);onAk5eEvent("turnEnd",casterTurnEvent);
  onAk5eEvent("combatEnd",casterCombatEnd);
  Hooks.on("createChatMessage",(message,_options,userId)=>safe(casterInitiativeMessage(message,userId)));
  Hooks.on("createChatMessage",(message,options,userId)=>Promise.resolve(handleCasterRelay(message,options,userId)).catch(error=>console.error("AK5e | Caster relay",error)));
  Hooks.on("createChatMessage",(message,options,userId)=>Promise.resolve(handleDroneRelay(message,options,userId)).catch(error=>console.error("AK5e | Arts Master relay",error)));
  Hooks.on("dnd5e.restCompleted",(actor,result,config={})=>safe(casterRest(actor,config.type??result?.type)));
  Hooks.on("dnd5e.preUseActivity",(activity,usage)=>droneAttackGate(activity,{stage:"use",args:[usage]}));
  Hooks.on("dnd5e.preRollAttackV2",(config,dialog,message)=>droneAttackGate(config.subject,{stage:"attack",args:[config,dialog,message]}));
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
