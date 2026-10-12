# B-281 · High · Unverified: Blood Price applies no Hit Point loss and records a made-up amount

Area: Guard / Musha / Blood Price

**Found:** Guard audit unit 13 (Musha), 2026-10-12.

**Evidence:** [musha-features.mjs](../../ak5e/scripts/musha-features.mjs#L186) mushaBloodPrice returns {} (L219) and never writes HP. L196 sets hpCostRoll to data.hpLost or the average 9 (18 Greater) and L218 stores it as result.hpLost; the sheet ([guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L922)) never sends hpLost. receipt.formula (L215) only makes the Roll button roll 2d8, which is then discarded ([play-uses.mjs](../../ak5e/scripts/play-uses.mjs#L363)). The bypass policy exists but is unused: [damage-pipeline.mjs](../../ak5e/scripts/damage-pipeline.mjs#L43) HP_LOSS_PRESETS.BLOOD_PRICE. Source: [Ch.3 L3287](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3287) "you lose 2d8 Hit Points; this cannot be reduced in any way, and you may not expend Temporary Hit Points". The L199 shortfall warning also tests the 9/18 estimate, not a roll.

**Reproduce:** Level 13 Musha 30/45 HP, 7 Temp HP: mushaBloodPrice digDeep, then useRoll. Probe: result.hpLost 9, roll 9, HP 30, temp 7 unchanged. At 12 HP no warning, at 8 HP a warning (estimate-driven).

**Verification limits:** Node probe against the real module and ak5e/test/guard-fixture.mjs (Roll mocked); not reproduced in Foundry V13 + D&D5e 5.3.3.

**Fixed means:** The owner-clicked 2d8 (4d8 if Greater) roll reduces real HP only (no DR or resistance, Temp HP untouched, never negative), the rolled value is what the card and option effects use, no estimate is stored, and undo restores HP.
