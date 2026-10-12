# B-138 · High · Unverified: Spellsword casting accepts a below-maximum level

Area: Artsblade / maximum casting level

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [artsblade-features.mjs](../../ak5e/scripts/artsblade-features.mjs#L215) uses Math.min(supplied castingLevel, maximum), accepting lower levels; [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2212) requires the maximum level that Art can be cast at. [guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L374) submits level instead of castingLevel.

**Reproduce:** At Guard level 17, pass castingLevel=1. The prior Node probe recorded level 1 with maximum 5. The sheet's lower-level choices are separately ignored.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Normal casting uses the source-required maximum for the chosen Art; unsupported levels are validated, any deliberate override is public, and the prompt/card agree on the actual level.
