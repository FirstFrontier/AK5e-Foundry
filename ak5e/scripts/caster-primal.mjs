/**
 * Primal Caster branch (Ch.3 L725-812).
 *
 * The shared Caster use engine (`caster-primal-splash.mjs`) records each Primal use as an undo
 * receipt and applies changes to Creatures the Caster does not own through the active GM's client.
 * Two Primal behaviours belong to this branch rather than to the shared engine, so the engine and
 * the rest handler delegate to them here:
 *
 * - `primalRest`: Residual Suffering has 2 x Proficiency Bonus uses and a Long Rest regains all of
 *   them (C3:731). The pool is registered with `recovery: [{ on: "lr", amount: "toInitial" }]`; the
 *   rest handler must actually run that recovery.
 * - `primalChildApplied`: a Condition the GM's client applied is recorded on the target, not as
 *   `applied` on the Caster's receipt. Undo and its preview must recognise that child effect by the
 *   receipt's operation ID and remove exactly it, leaving unrelated Conditions alone (C3:755-757).
 */
import { casterBranch } from "./caster-rules.mjs";
import { getPoolDefinition, recoverPool } from "./resource-pools.mjs";
import { flag, values } from "./operation-kernel.mjs";

export const PRIMAL_POOL_ID = "residualSuffering";

/** Long Rest: restore Residual Suffering to its 2 x PB initial value. Returns the recovery results. */
export async function primalRest(actor, type) {
  if (!actor || type !== "long" || casterBranch(actor) !== "primal") return [];
  if (!getPoolDefinition(PRIMAL_POOL_ID)) return [];
  return recoverPool(actor, "lr", { poolIds: [PRIMAL_POOL_ID] });
}

/** True when this receipt's child change is present on the target, however it was applied. */
export function primalChildApplied(actor, receipt, entry) {
  if (!actor || !receipt || !entry) return false;
  if (entry.applied || entry.relayed) return true;
  if (entry.kind !== "condition" || !entry.status) return false;
  const target = globalThis.fromUuidSync?.(entry.uuid);
  return values(target?.effects).some(effect => flag(effect, "casterPrimal")?.opId === receipt.id
    && flag(effect, "casterPrimal")?.casterUuid === actor.uuid);
}
