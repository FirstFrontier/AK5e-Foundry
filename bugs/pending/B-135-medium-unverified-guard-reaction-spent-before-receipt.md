# B-135 · Medium · Unverified: Guard Reaction is spent before receipt persistence

Area: Artsblade Cut Through Chaos / Brawler Cross Counter and Slip Off

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [artsblade-features.mjs](../../ak5e/scripts/artsblade-features.mjs#L266) and [brawler-features.mjs](../../ak5e/scripts/brawler-features.mjs#L114) / [brawler-features.mjs](../../ak5e/scripts/brawler-features.mjs#L212) call spendReaction inside plan.apply, before [play-uses.mjs](../../ak5e/scripts/play-uses.mjs#L336) persists the use. Related fixed Marksman case: [B-128](../fixed/B-128-medium-receipt-write-failure-strands-a-spent-reaction.md); it remains fixed.

**Reproduce:** Inject failure into the first guardUses receipt write while using Cut Through Chaos. The prior Node probe left 0 Reactions and no undo receipt.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Persist recoverable intent before side effects; failures/retries cannot strand or double-spend Reactions/resources. Undo restores committed changes and does not refund uncommitted spends.
