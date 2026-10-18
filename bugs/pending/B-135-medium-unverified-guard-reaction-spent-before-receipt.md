# B-135 · Medium · Unverified: Guard Reaction is spent before receipt persistence

Area: Artsblade Cut Through Chaos / Brawler Cross Counter and Slip Off

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [artsblade-features.mjs](../../ak5e/scripts/artsblade-features.mjs#L266) and [brawler-features.mjs](../../ak5e/scripts/brawler-features.mjs#L114) / [brawler-features.mjs](../../ak5e/scripts/brawler-features.mjs#L212) call spendReaction inside plan.apply, before [play-uses.mjs](../../ak5e/scripts/play-uses.mjs#L336) persists the use. Related fixed Marksman case: [B-128](../fixed/B-128-medium-receipt-write-failure-strands-a-spent-reaction.md); it remains fixed.

**Reproduce:** Inject failure into the first guardUses receipt write while using Cut Through Chaos. The prior Node probe left 0 Reactions and no undo receipt.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Persist recoverable intent before side effects; failures/retries cannot strand or double-spend Reactions/resources. Undo restores committed changes and does not refund uncommitted spends.

**Progress (2026-10-18, unit 07, Centurion only):** The Centurion file never called `spendReaction` in a plan. Brutal Execution used as a Reaction (`asReaction:true`) now sets `receipt.reaction = { requested: true, triggerId, ... }`, so `play-uses.mjs` spends it after the receipt persists and undo refunds it; a failed first write leaves the Reaction and Aggression untouched (test "B-135: ..."). Storm of Blood's Attack of Opportunity refund is its own reversible target kind. Artsblade and Brawler remain open.
