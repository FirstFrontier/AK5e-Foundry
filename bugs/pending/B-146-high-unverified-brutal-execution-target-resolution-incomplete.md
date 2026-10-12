# B-146 · High · Unverified: Brutal Execution target resolution is incomplete

Area: Centurion / targets, saves, conditions and GM relay

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L457) supplies no targets. [centurion-features.mjs](../../ak5e/scripts/centurion-features.mjs#L121) marks API targets ready before saves and omits tag.condition; [feature-tags.mjs](../../ak5e/scripts/feature-tags.mjs#L160) therefore supplies no status. Missing validateTarget fails [play-uses.mjs](../../ak5e/scripts/play-uses.mjs#L207). Source: [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2573).

**Reproduce:** Sheet use spends Aggression with no target changes. The prior API relay probe failed with 'The recorded change is not one this use can make.' Owned targets can receive a label without an actual Frightened status.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Collect affected targets, provide owner-clicked WIS saves, resolve only the reviewed outcome, and validate automatic unowned-target relay/undo. Show kill/timing/range warnings; do not silently add GM approval.
