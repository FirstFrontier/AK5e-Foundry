/**
 * The Defender branches' table-play use engine (play-uses.mjs, WORKFLOW.md §3.2): Guardian and Fortress register their
 * plans here. Receipts live in `flags.ak5e.defenderUses`; GM rulings are read from the Defender state's `rulings`.
 */
import { createPlayUses } from "./play-uses.mjs";
import { defenderEnabled } from "./defender-features.mjs";
import { defenderState } from "./defender-rules.mjs";
import { need, flag, opaqueKey } from "./operation-kernel.mjs";
import { refundReaction, spendReaction } from "./trigger-events.mjs";

export const defenderUses = createPlayUses({
  ns: "defenderUses", label: "Defender", isMember: actor => defenderEnabled(actor),
  ruling: (actor, key) => {
    const record = defenderState(actor).rulings?.[key];
    return record?.source?.trim?.() && record.value !== undefined ? record.value : undefined;
  }
});

/** GM-only: record a ruling for an unresolved reading. A recorded ruling replaces the player's per-use reading. */
export async function recordDefenderRuling(actor, key, value, source) {
  need(game.user.isGM && actor?.isOwner, "Only the GM may record Defender rulings.");
  const reading = defenderUses.readings()[key];
  need(reading?.options.some(option => option.value === value), "Choose a supported ruling value.");
  need(typeof source === "string" && source.trim().length >= 10, "Record the source and reason for this ruling (at least 10 characters).");
  await actor.update({ [`flags.ak5e.defender.rulings.${key}`]: { value, source: source.trim(), approvedBy: game.user.id } });
  return defenderState(actor).rulings[key];
}

/**
 * "Expend 1 Resilience to refund use of your Reaction" (Protector Impenetrable, Sentry Advance and Fire): the Reaction a
 * recorded use spent comes back. Undo spends it again (a new spend, so the refund cannot be used for a free Reaction);
 * if no Reaction is left to spend by then, the undo says so. Applied only on the Defender's own client.
 */
defenderUses.register({ targetKinds: { reactionRefund: {
  local: true,
  async apply(_source, useId, entry, target) {
    const key = opaqueKey(useId), done = flag(target, defenderUses.appliedFlag)?.[key];
    if (done) return done;
    const result = await refundReaction(target, { receipt: entry.receiptId });
    const record = { refunded: result?.ok === true && !result.replayed };
    await target.update({ [`flags.ak5e.${defenderUses.appliedFlag}.${key}`]: record });
    return record;
  },
  async revert(_source, useId, entry, target) {
    const key = opaqueKey(useId), record = flag(target, defenderUses.appliedFlag)?.[key];
    let respent = null;
    if (record?.refunded) respent = await spendReaction(target, { triggerId: `${entry.triggerId ?? entry.receiptId}:refund-undone:${useId}`, perTrigger: false, receipt: `${entry.receiptId}_undo_${useId}` });
    await target.update({ [`flags.ak5e.${defenderUses.appliedFlag}.${key}`]: null });
    return { respent: respent?.ok === true };
  },
  preview(_source, receipt, _entry, target) {
    const record = flag(target, defenderUses.appliedFlag)?.[opaqueKey(receipt.id)];
    return record?.refunded ? "Spends the refunded Reaction again (if one is available)." : "No Reaction was refunded; nothing to spend again.";
  }
} } });
