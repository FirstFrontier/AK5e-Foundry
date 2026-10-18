# B-224 · Low · Unverified: Centurion DC duplicates the Intimidation fallback chain

Area: Centurion / guard-rules.mjs and centurion-features.mjs

**Found:** Guard audit unit 07 (Centurion), Sonnet 5.5, 2026-10-18; review finding.

**Evidence:** [guard-rules.mjs](../../ak5e/scripts/guard-rules.mjs#L122) `centurionDC` computes `skills.itm.total ?? skills.itm.mod ?? CHA mod`. B-147's fix added `intimidationModifier` in [centurion-features.mjs](../../ak5e/scripts/centurion-features.mjs) with the same chain so the DC and the Psychic Damage match. The two copies can drift. guard-rules.mjs was out of scope for unit 07.

**Fixed means:** One exported helper in guard-rules.mjs (`centurionDC = 8 + intimidationModifier(actor)`) used by both; the existing DC and Intimidation tests still pass.
