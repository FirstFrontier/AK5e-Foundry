# B-135 · Medium · Unverified: Guard Reaction is spent before receipt persistence

Area: Artsblade Cut Through Chaos / Brawler Cross Counter and Slip Off

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [artsblade-features.mjs](../../ak5e/scripts/artsblade-features.mjs#L266) and [brawler-features.mjs](../../ak5e/scripts/brawler-features.mjs#L114) / [brawler-features.mjs](../../ak5e/scripts/brawler-features.mjs#L212) call spendReaction inside plan.apply, before [play-uses.mjs](../../ak5e/scripts/play-uses.mjs#L336) persists the use. Related fixed Marksman case: [B-128](../fixed/B-128-medium-receipt-write-failure-strands-a-spent-reaction.md); it remains fixed.

**Reproduce:** Inject failure into the first guardUses receipt write while using Cut Through Chaos. The prior Node probe left 0 Reactions and no undo receipt.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Persist recoverable intent before side effects; failures/retries cannot strand or double-spend Reactions/resources. Undo restores committed changes and does not refund uncommitted spends.

**Resolution (fixed 2026-11-02, guard-base-polish merge-1):** Base-class fix in guard-uses/sheet/progression/setup (confirm-before-spend, preview key handoff, contributions-once idempotency, exact before-state undo, durable Reaction receipts). Frozen 18/18 (d700bc2d), attack 22/22 + tester r2 15/15, review PASS, main test:guard 297 pass. Subclass slices stay open where they reproduce outside base files.

**REOPENED 2026-11-02 (final QA gv-base-20261102):** base-class slice verified fixed and merged (durable Reaction receipts, review PASS, attack 0 defects). Subclass instances remain: Brawler Cross Counter/Slip Off (`ak5e/scripts/brawler-features.mjs:116,214`) and Duellist (`ak5e/scripts/duellist-features.mjs:244/272/512`) still spend the Reaction inside `plan.apply` before the engine saves the receipt (`play-uses.mjs:584`). Successor fix must cover those call sites with regression tests; engine `rememberData` may already cover B-133's subclass cases — verify.
