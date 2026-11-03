# B-040 · Medium · Duplicate reduction logic remains

Area: SI-4 damage pipeline and Standard Bearer wiring

**B-040 · Medium · Duplicate reduction logic remains.** `ak5e.mjs` `damageAfterReduction`
(and `world-rules.mjs` `previewDamage`) still use their own arithmetic. They agree with the
pipeline for valid numbers but differ on malformed input (returns 0/`NaN` instead of throwing).
Reconcile and delete the duplicates.
