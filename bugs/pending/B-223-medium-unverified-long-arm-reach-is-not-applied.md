# B-223 · Medium · Unverified: Long-Arm reach is not applied

Area: Centurion / Shock Trooper Long-Arm

**Found:** Guard audit unit 07 (Centurion), Sonnet 5.5, 2026-10-18; static review. Split out of B-152, which tracks Storm of Blood.

**Evidence:** [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2571) gives every Centurion's wielded Melee Weapons Reach (or +5 ft) during their Turn. No code or card records or applies it; the only trace is a Long-Arm effect created by Storm of Blood ([centurion-features.mjs](../../ak5e/scripts/centurion-features.mjs)), which shows the benefit but does not change weapon Reach. Cyclone Strike has no Reach check either.

**Reproduce:** Equip a melee weapon on a Centurion and check its Reach on and off the Centurion's Turn: unchanged.

**Verification limits:** Static review; the dnd5e 5.3.3 weapon Reach field (`system.range.reach`) has not been tried with an Active Effect.

**Fixed means:** Either a reversible, turn-scoped Reach change on wielded melee weapons (via native effects) or a visible manual instruction on the sheet; the Storm of Blood Long-Arm uses the same mechanism.
