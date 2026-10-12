# B-286 · Medium · Unverified: Reset Not Yet DC is a free button with no warning

Area: Guard / Musha / Not Yet reset

**Found:** Guard audit unit 13 (Musha), 2026-10-12.

**Evidence:** [musha-features.mjs](../../ak5e/scripts/musha-features.mjs#L160) mushaResetNotYet returns warnings: [] and always writes DC 10; the sheet exposes it as a button ([guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L278)). Source [Ch.3 L3271](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3271) and [L3316](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3316): reset only on finishing a Long Rest, or from 17th level at full HP. WORKFLOW §3.2.3 requires failed source conditions to be listed as warnings with Use anyway. Rest and full-HP resets are automatic hooks (L337, L345), so the manual use is the exception and should be flagged.

**Reproduce:** Level 5 Musha, DC 15, no rest: mushaResetNotYet succeeds with no warning (probe: DC 10, no AK5eWarnings).

**Verification limits:** Node probe against the real module and guard-fixture; undo of the reset was probed and restores the prior DC.

**Fixed means:** Without a just-finished Long Rest (or level 17 and HP at max) the use lists a warning and offers Use anyway; the override shows on the public card; undo keeps restoring the prior DC.
