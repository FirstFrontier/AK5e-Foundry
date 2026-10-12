# B-136 · High · Unverified: Blade Art ignores the selected Arts Pool

Area: Artsblade / sheet-to-plan interface

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L357) submits artPool; [artsblade-features.mjs](../../ak5e/scripts/artsblade-features.mjs#L109) reads pool and defaults to Flame. [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2307) requires damage corresponding to a selected Spellsword Arts Pool.

**Reproduce:** Choose Frost in the sheet prompt. The prior payload probe returned damageType=fire, rather than cold.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Sheet and plan share the same field; every supported selection yields the correct public name and typed damage. Unknown values do not silently substitute Flame.
