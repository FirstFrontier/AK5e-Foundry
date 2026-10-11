/**
 * Chain Caster branch (Ch.3 L456–549), following WORKFLOW.md §3.2:
 * - Chain Art and Ouroboros are cast options (caster-casting.mjs); their use is a Caster undo receipt;
 * - Subtle Spark effects are uses on the shared Caster use engine (caster-primal-splash.mjs): warnings with
 *   "Use anyway", the player's reading where the GM has not ruled, GM relay for unowned targets, undo receipts;
 * - Spark Saving Throws are buttons for the target's owner; nothing is rolled by this module.
 */
import { casterLevel, casterBranch, casterState } from "./caster-rules.mjs";
import { casterEnabled } from "./caster-casting.mjs";
import { applyFeatureTag } from "./feature-tags.mjs";
import { flag, values, need, opaqueKey, esc } from "./operation-kernel.mjs";
import { definePool, getPool, getPoolDefinition } from "./resource-pools.mjs";
import { currentEpoch, PlayReading } from "./play-undo.mjs";
import { tokenPoint, withinFeet } from "./standard-bearer-rules.mjs";
import { casterSpellDC, registerCasterUses } from "./caster-primal-splash.mjs";

export const CHAIN_FEATURES = Object.freeze({
  chainArt: "subclass-feature-caster-chain-1st-level-chain-art-358",
  subtleSpark: "subclass-feature-caster-chain-3rd-level-subtle-spark-1138"
});
const CHAIN_POOL_PATH = "flags.ak5e.resourcePools.chainArt.value", SPARK_POOL_PATH = "flags.ak5e.resourcePools.subtleSparks.value";
const ATTACK_KEYS = ["mwak", "rwak", "msak", "rsak"];
const bonusChanges = (value, kinds = ["attack", "damage"]) => ATTACK_KEYS.flatMap(key => kinds.map(kind => ({ key: `system.bonuses.${key}.${kind}`, mode: 2, value })));
const walk = value => [{ key: "system.attributes.movement.walk", mode: 2, value: String(value) }];
const dexSave = value => [{ key: "system.abilities.dex.bonuses.save", mode: 2, value }];
/**
 * Subtle Spark additional effects (Ch.3 L517–548). `changes(upgraded, keepsBase)` returns native Active Effect changes;
 * Bolster Defences and Shred Defences carry a DR adjustment flag instead, read by the reviewed damage helpers.
 */
export const SPARK_EFFECTS = Object.freeze({
  accelerate: { name: "Accelerate", save: false,
    text: "Movement Speed increased by 10 ft.", upgradeText: "When it makes a Dexterity Saving Throw, it may roll 1d4 and add it to the result.",
    changes: (upgraded, keepsBase) => [...(!upgraded || keepsBase ? walk(10) : []), ...(upgraded ? dexSave("+1d4") : [])] },
  bolster: { name: "Bolster Defences", save: false,
    text: "Gains 2 DR against all Damage.", upgradeText: "Gains 4 DR against all Damage.",
    changes: () => [], dr: upgraded => upgraded ? 4 : 2 },
  decelerate: { name: "Decelerate", save: true,
    text: "Movement Speed reduced by 10 ft.", upgradeText: "When it makes a Dexterity Saving Throw, it must roll 1d4 and subtract it from the result.",
    changes: (upgraded, keepsBase) => [...(!upgraded || keepsBase ? walk(-10) : []), ...(upgraded ? dexSave("-1d4") : [])] },
  enervate: { name: "Enervate", save: true,
    text: "−1 penalty to all Attack and Damage Rolls.", upgradeText: "When it makes an Attack or Damage Roll, it rolls 1d4 and subtracts it from the result.",
    changes: upgraded => bonusChanges(upgraded ? "-1d4" : "-1") },
  innervate: { name: "Innervate", save: false,
    text: "+1 bonus to its Attack and Damage Rolls.", upgradeText: "When it makes an Attack or Damage Roll, it may roll 1d4 and add it to the result.",
    changes: upgraded => bonusChanges(upgraded ? "+1d4" : "+1") },
  shred: { name: "Shred Defences", save: true,
    text: "Any DR it has is reduced by 2.", upgradeText: "Any DR it has is reduced by 4.",
    changes: () => [], dr: upgraded => upgraded ? -4 : -2 }
});
/** Readings offered when the GM has not ruled (DECISIONS.md "Chain branch"). Values match recordable rulings. */
export const CHAIN_READINGS = Object.freeze({
  sparkCost: { label: "Subtle Spark cost when the Art affects several Creatures", options: [
    { value: "perCast", label: "1 Spark for the cast, applied to every Creature it affects" },
    { value: "perCreature", label: "1 Spark for each Creature the effect is applied to" }] },
  sparkUpgradeBase: { label: "Upgraded Accelerate or Decelerate and the original Speed change", options: [
    { value: "addsToBase", label: "The upgrade adds the 1d4 to the Speed change" },
    { value: "replacesBase", label: "The upgrade replaces the Speed change (\"instead\")" }] }
});
export const CHAIN_COMMANDS = Object.freeze(["spark", "sparkCondition"]);

const warn = (list, id, text) => list.push({ id, text });
const ruled = (state, key) => { const record = state.rulings?.[key]; return record?.source?.trim() && record.value !== undefined ? record.value : undefined; };
const chainItem = (actor, key) => values(actor.items).find(entry => flag(entry, "chapterThreeId") === CHAIN_FEATURES[key]);
function actorAt(uuid, label = "the target") {
  const target = globalThis.fromUuidSync?.(uuid);
  need(target?.documentName === "Actor", `Choose ${label}.`);
  return target;
}
const tokenActorUuid = uuid => { const doc = globalThis.fromUuidSync?.(uuid); return doc?.documentName === "Token" ? doc.actor?.uuid ?? null : doc?.documentName === "Actor" ? doc.uuid : null; };

export function chainPools(actor) {
  if (casterBranch(actor) !== "chain" || !getPoolDefinition("chainArt")) return null;
  return { chainArt: getPool(actor, "chainArt"), sparks: getPool(actor, "subtleSparks") };
}
/** Chain Art reach: two additional Creatures, three from Great Chain of Being (Ch.3 L461, L502). */
export const chainLimit = actor => casterLevel(actor) >= 15 ? 3 : 2;

/* ---------------------------------------------------------------- cast-time Chain Art and Ouroboros */

/**
 * Validate the cast's Chain Art option. Source limits are warnings (WORKFLOW.md §3.2); only impossible input stops.
 * Returns the normalised option and its warnings. Distances are measured on the Scene when both tokens are placed.
 */
export function validateChainContext(actor, input) {
  need(casterBranch(actor) === "chain", "Chain Art is a Chain Caster feature.");
  need(input && ["chain", "ouroboros"].includes(input.mode), "Choose Chain Art or Ouroboros.");
  const warnings = [], level = casterLevel(actor);
  const original = globalThis.fromUuidSync?.(input.originalTokenUuid);
  need(original?.documentName === "Token" && original.actor, "Choose the Art's original target token.");
  const chained = Array.isArray(input.chainedTokenUuids) ? input.chainedTokenUuids : [];
  if (input.mode === "chain") {
    need(chained.length > 0, "Choose at least one Creature to chain the Art to.");
    need(chained.every(uuid => typeof uuid === "string" && uuid) && new Set(chained).size === chained.length && !chained.includes(original.uuid), "Choose distinct Creatures other than the original target.");
    if (chained.length > chainLimit(actor)) warn(warnings, "chainCount", `Chain Art reaches up to ${chainLimit(actor)} other Creatures${level >= 15 ? "" : " (3 from Great Chain of Being, level 15)"}.`);
    for (const uuid of chained) {
      const token = globalThis.fromUuidSync?.(uuid);
      need(token?.documentName === "Token" && token.actor, "Choose placed tokens to chain the Art to.");
      if (token.parent?.id !== original.parent?.id || !original.parent?.grid) warn(warnings, `chainRange_${opaqueKey(uuid)}`, `${token.name}: range to the original target could not be measured.`);
      else if (!withinFeet(original.parent, tokenPoint(original), token, 15)) warn(warnings, `chainRange_${opaqueKey(uuid)}`, `${token.name} is more than 15 feet from ${original.name}, the original target.`);
    }
  } else if (level < 6) warn(warnings, "ouroborosLevel", `Ouroboros is a Chain level 6 feature; this Caster is level ${level}.`);
  if (input.singleTarget !== true) warn(warnings, "singleTarget", "You did not confirm that this Art can only affect a single Creature (Ch.3 L465).");
  const pool = chainPools(actor)?.chainArt;
  if (pool && pool.value < 1) warn(warnings, "chainUses", "No Chain Art uses remain until a Long Rest; the count stays at 0.");
  return { warnings, chain: { mode: input.mode, singleTarget: input.singleTarget === true, originalTokenUuid: original.uuid, originalActorUuid: original.actor.uuid, originalName: original.name,
    chainedTokenUuids: input.mode === "chain" ? [...chained] : [], chainedActorUuids: input.mode === "chain" ? chained.map(tokenActorUuid) : [],
    chainedNames: input.mode === "chain" ? chained.map(uuid => globalThis.fromUuidSync?.(uuid)?.name ?? "Creature") : [] } };
}
/**
 * Record one Chain Art use for a consumed cast, in the same Actor update as the cast's AP. The use is a Caster
 * undo receipt: undoing it restores the use (the Art itself keeps the Arts cast undo).
 */
export function recordChainUse(actor, state, context, castId, actorUpdates) {
  const chain = context.chain, pool = chainPools(actor)?.chainArt;
  need(pool, "Chain Art has no use pool on this Actor; run Caster setup.");
  const id = `${castId}-chain`, after = Math.max(0, pool.value - 1);
  state.undo = (state.undo ?? []).filter(entry => entry.id !== id);
  const ouroboros = chain.mode === "ouroboros";
  const receipt = { id, command: "chainArt", title: ouroboros ? "Ouroboros" : "Chain Art", userId: game.user.id, epoch: currentEpoch(), createdAt: Date.now(),
    status: "complete", data: { castId }, overridden: chain.overridden ?? [], targets: [],
    caster: { pool: { id: "chainArt", label: "Chain Art", path: CHAIN_POOL_PATH, before: pool.value, after } },
    summary: ouroboros ? `${chain.originalName} has Disadvantage on Saving Throws against this Art this Turn.`
      : `The Art chains from ${chain.originalName} to ${chain.chainedNames.join(", ")}; they are also targets of the Art.`,
    result: { castId, remaining: after } };
  if (pool.value < 1) receipt.shortfall = "Chain Art uses short by 1";
  state.undo = [...state.undo, receipt].slice(-60);
  actorUpdates["flags.ak5e.caster.undo"] = state.undo;
  actorUpdates[CHAIN_POOL_PATH] = after;
  return receipt;
}

/* ---------------------------------------------------------------- Subtle Spark effects on targets */

/** One Spark effect, until the start of the Caster's next Turn. A retry reuses the applied effect. */
async function applySpark(caster, useId, entry, target) {
  const existing = values(target.effects).find(effect => flag(effect, "casterSpark")?.opId === useId && flag(effect, "casterSpark")?.casterUuid === caster.uuid);
  if (existing) return true;
  const item = chainItem(caster, "subtleSpark");
  need(item, "Run Caster setup to add the Subtle Spark feature Item first.");
  const definition = SPARK_EFFECTS[entry.effect], combatant = game.combat?.started && values(game.combat.turns).some(c => c.actor?.uuid === caster.uuid);
  const text = entry.upgraded ? (entry.keepsBase ? `${definition.text} ${definition.upgradeText}` : definition.upgradeText) : definition.text;
  const dr = definition.dr?.(entry.upgraded) ?? 0;
  const effect = await applyFeatureTag(caster, item, target, {
    label: `${definition.name}${entry.upgraded ? " (upgraded)" : ""} (Subtle Spark)`, trigger: combatant ? "turnStart" : "manual", expiryActor: "source",
    instructions: [`${text} Until the start of ${caster.name}'s next Turn.`, combatant ? "" : "Outside combat, remove it manually at the start of the Caster's next Turn.",
      dr ? "Enter the adjusted DR when applying Damage; it is never reduced below 0." : ""].filter(Boolean).join(" "),
    replacement: { family: `chainSpark:${entry.effect}:${caster.uuid}`, scope: "target" },
    changes: definition.changes(entry.upgraded, entry.keepsBase) });
  try { await effect.update({ "flags.ak5e.casterSpark": { opId: useId, casterUuid: caster.uuid, effect: entry.effect, upgraded: !!entry.upgraded }, ...(dr ? { "flags.ak5e.drAdjustment": dr } : {}) }); }
  catch (error) { await effect.delete(); throw error; }
  return true;
}
async function revertSpark(caster, useId, _entry, target) {
  const effects = values(target.effects).filter(effect => flag(effect, "casterSpark")?.opId === useId && flag(effect, "casterSpark")?.casterUuid === caster.uuid);
  if (effects.length) await target.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
  return { removed: effects.length };
}
function previewSpark(_caster, receipt, entry, target) {
  const name = SPARK_EFFECTS[entry.effect]?.name ?? entry.effect;
  const present = values(target?.effects).some(effect => flag(effect, "casterSpark")?.opId === receipt.id);
  return present ? `${entry.name}: removes ${name}.` : `${entry.name}: ${name} is already gone; nothing to remove.`;
}

/* ---------------------------------------------------------------- use plans */

function castOf(state, id) { const cast = state.casts?.find(entry => entry.id === id); need(cast, "Choose a recorded cast."); return cast; }
const PLANS = {
  spark(actor, state, data) {
    need(casterBranch(actor) === "chain", "Subtle Spark is a Chain Caster feature.");
    const definition = SPARK_EFFECTS[data.effect]; need(definition, "Choose a Subtle Spark effect.");
    need(chainItem(actor, "subtleSpark"), "Run Caster setup to add the Subtle Spark feature Item first.");
    const cast = castOf(state, data.castId), uuids = Array.isArray(data.targetUuids) ? data.targetUuids : [];
    need(uuids.length > 0 && new Set(uuids).size === uuids.length, "Choose the distinct Creatures the Art affected.");
    const targets = uuids.map(uuid => actorAt(uuid)), warnings = [], level = casterLevel(actor), upgraded = data.upgraded === true;
    if (level < 3) warn(warnings, "level", `Subtle Spark is a Chain level 3 feature; this Caster is level ${level}.`);
    if (upgraded && level < 10) warn(warnings, "upgradeLevel", `Upgraded effects need Subtle Spark Upgraded (Chain level 10); this Caster is level ${level}.`);
    if (!cast.completed) warn(warnings, "castIncomplete", "That Art cast has not been recorded as complete.");
    if (data.singleTarget !== true) warn(warnings, "singleTarget", "You did not confirm that this Art can only affect a single Creature (Ch.3 L465).");
    const castActors = new Set([...(cast.targets ?? []).map(tokenActorUuid), cast.context?.chain?.originalActorUuid, ...(cast.context?.chain?.chainedActorUuids ?? [])].filter(Boolean));
    for (const target of targets) if (castActors.size && !castActors.has(target.uuid)) warn(warnings, `notTarget_${opaqueKey(target.uuid)}`, `${target.name} was not recorded as a target of that Art.`);
    if ((state.chain?.sparks ?? []).some(entry => entry.castId === cast.id)) warn(warnings, "repeat", "A Subtle Spark effect was already applied with that Art.");
    const ruling = ruled(state, "sparkCost"), perCreature = targets.length > 1 && (ruling ?? data.reading) === "perCreature";
    const cost = perCreature ? targets.length : 1, pool = chainPools(actor)?.sparks;
    need(pool, "Subtle Spark has no Spark pool on this Actor; run Caster setup.");
    if (pool.value < cost) warn(warnings, "sparks", `${cost} Spark${cost === 1 ? "" : "s"} needed and ${pool.value} remain until a Long Rest; the count stays at 0.`);
    // Upgraded Accelerate/Decelerate: a GM ruling, otherwise the player's per-use reading chosen in the use form.
    const baseReading = upgraded && ["accelerate", "decelerate"].includes(data.effect) ? "sparkUpgradeBase" : null;
    const baseRuling = baseReading ? ruled(state, baseReading) : undefined, upgradeBase = baseRuling ?? data.upgradeBase ?? data.readings?.sparkUpgradeBase;
    if (baseReading && !["addsToBase", "replacesBase"].includes(upgradeBase))
      throw new PlayReading("sparkUpgradeBase", CHAIN_READINGS.sparkUpgradeBase.label, CHAIN_READINGS.sparkUpgradeBase.options);
    const dc = casterSpellDC(actor), text = upgraded ? definition.upgradeText : definition.text;
    return { warnings, title: `Subtle Spark: ${definition.name}`, reading: targets.length > 1 ? "sparkCost" : null, apply(next, receipt, reading) {
      const spent = targets.length > 1 && reading === "perCreature" ? targets.length : 1, after = Math.max(0, pool.value - spent);
      const keeps = upgradeBase !== "replacesBase";
      next.chain ??= {};
      next.chain.sparks = [...(next.chain.sparks ?? []), { id: receipt.id, castId: cast.id, effect: data.effect, upgraded, keepsBase: keeps, dc, save: definition.save,
        targets: targets.map(target => target.uuid), applied: [] }].slice(-20);
      receipt.caster = { pool: { id: "subtleSparks", label: "Spark", path: SPARK_POOL_PATH, before: pool.value, after } };
      if (pool.value < spent) receipt.shortfall = `Sparks short by ${spent - pool.value}`;
      if (baseReading && baseRuling === undefined)
        receipt.reading = [receipt.reading, CHAIN_READINGS.sparkUpgradeBase.options.find(option => option.value === upgradeBase).label].filter(Boolean).join("; ");
      const names = targets.map(target => esc(target.name)).join(", ");
      if (definition.save) {
        receipt.summary = `${names}: each must succeed on [[/save ability=con dc=${dc}]] or, until the start of ${esc(actor.name)}'s next Turn: ${esc(text)} Apply it to each Creature that failed from the Caster panel.`;
        receipt.html = true;
      } else {
        receipt.targets = targets.map(target => ({ uuid: target.uuid, name: target.name, kind: "spark", effect: data.effect, upgraded, keepsBase: keeps, ready: true }));
        receipt.summary = `${targets.map(target => target.name).join(", ")}: ${text} Until the start of ${actor.name}'s next Turn.`;
      }
      receipt.result = { sparkId: receipt.id, effect: definition.name, spent, remaining: after, dc: definition.save ? dc : null };
      return { [SPARK_POOL_PATH]: after };
    } };
  },
  sparkCondition(actor, state, data) {
    need(casterBranch(actor) === "chain", "Subtle Spark is a Chain Caster feature.");
    const spark = (state.chain?.sparks ?? []).find(entry => entry.id === data.sparkId);
    need(spark?.save, "Choose a recorded Subtle Spark effect that calls for a Saving Throw.");
    const target = actorAt(data.targetUuid), key = opaqueKey(target.uuid), warnings = [], definition = SPARK_EFFECTS[spark.effect];
    if (data.failedSave !== true) warn(warnings, "failedSave", "You did not confirm that this Creature failed its Constitution Saving Throw.");
    if (!spark.targets.includes(target.uuid)) warn(warnings, "notTarget", `${target.name} was not one of that Spark's Creatures.`);
    if (spark.applied.some(entry => entry.key === key)) warn(warnings, "repeat", `${target.name} already suffers that Spark.`);
    return { warnings, title: `Subtle Spark: ${definition.name} (failed save)`, apply(next, receipt) {
      const current = next.chain.sparks.find(entry => entry.id === spark.id); current.applied = [...current.applied, { key, op: receipt.id }];
      receipt.targets = [{ uuid: target.uuid, name: target.name, kind: "spark", effect: spark.effect, upgraded: spark.upgraded, keepsBase: spark.keepsBase, ready: true }];
      receipt.summary = `${target.name}: ${spark.upgraded ? definition.upgradeText : definition.text} Until the start of ${actor.name}'s next Turn.`;
      receipt.result = { effect: definition.name, targetUuid: target.uuid };
      return {};
    } };
  }
};
function cleanup(state, receiptId) {
  if (!state.chain?.sparks) return;
  state.chain.sparks = state.chain.sparks.filter(entry => entry.id !== receiptId)
    .map(entry => ({ ...entry, applied: entry.applied.filter(applied => applied.op !== receiptId) }));
}

export function registerChain() {
  if (!getPoolDefinition("chainArt")) definePool({ id: "chainArt", label: "Chain Art", max: "@prof", initial: "max", classId: "class-caster",
    appliesTo: actor => casterEnabled(actor) && casterBranch(actor) === "chain",
    // Long Rest first: only the first matching recovery entry applies, and a Long Rest also carries the Short Rest trigger.
    recovery: [{ on: "lr", amount: "toInitial" }, { on: "sr", amount: 1, when: actor => casterLevel(actor) >= 15 }] });
  if (!getPoolDefinition("subtleSparks")) definePool({ id: "subtleSparks", label: "Sparks", max: { 3: 6, 7: 8, 11: 10, 14: 12 }, initial: "max", classId: "class-caster",
    levelBasis: "classLevel", appliesTo: actor => casterEnabled(actor) && casterBranch(actor) === "chain", recovery: [{ on: "lr", amount: "toInitial" }] });
  registerCasterUses({ plans: PLANS, readings: CHAIN_READINGS, cleanup, targetKinds: { spark: { apply: applySpark, revert: revertSpark, preview: previewSpark,
    // GM-side relay check: only a defined Spark effect, whose native changes come from SPARK_EFFECTS, never from the receipt.
    commands: ["spark", "sparkCondition"], validate: (_caster, _receipt, entry) => Object.hasOwn(SPARK_EFFECTS, entry.effect) && typeof entry.upgraded === "boolean" } } });
}
