# B-290 · Medium · Unverified: Reaper gain at the Ruin cap stores an over-max value and Undo then removes real Ruin

Area: Guard / Reaper / Ruin pool (`reaperRuin`, 0-10)

**Found:** Guard audit unit 14 (Reaper), 2026-10-12.

**Evidence:** [reaper-features.mjs](../../ak5e/scripts/reaper-features.mjs#L144) warns "gaining N caps at 10", but [reaper-features.mjs](../../ak5e/scripts/reaper-features.mjs#L156) calls `spendResource` with a negative amount, and [play-uses.mjs](../../ak5e/scripts/play-uses.mjs#L60) computes `after = max(0, before - amount)` with no max clamp. The receipt records `after` above 10 (the undo preview says "Removes the 1 Ruin it gave"). [resource-pools.mjs](../../ak5e/scripts/resource-pools.mjs#L238) clamps only on read, so the stored flag stays 11. Undo ([play-uses.mjs](../../ak5e/scripts/play-uses.mjs#L432)) restores `current + (before - after)` = 10 + (10 - 11) = 9. Source: Ruin is a 0-10 pool ([source](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3350)); WORKFLOW §3.2.6 requires an exact undo.

**Reproduce:** Node probe with the guard fixture: Reaper at Ruin 10, `reaperGainRuin {amount:1}` (override the "caps" warning): stored flag 11; then `undoUse`: Ruin reads 9 (expected 10). From 9 with amount 3: stored 12, undo gives 7 (expected 9). From Ruin 4, `amount: 999` stores 1003.

**Verification limits:** Node probe only (guard-fixture); not run in Foundry. Shared-engine neighbour: B-133 (undo and flags).

**Fixed means:** Gaining Ruin writes min(10, Ruin + n) and the receipt records the real before/after, so Undo restores the exact prior Ruin at the cap; a gain at 10 does not demand a misleading "Use anyway" override.
