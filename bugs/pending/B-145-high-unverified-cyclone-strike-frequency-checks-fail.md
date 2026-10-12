# B-145 · High · Unverified: Cyclone Strike frequency checks fail

Area: Centurion / Cyclone Strike

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [centurion-features.mjs](../../ak5e/scripts/centurion-features.mjs#L78) disables frequency checks at level 14; below 14 it tracks the global turn. [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2558) limits reuse until the Centurion's next turn begins, then permits once on each turn from level 14.

**Reproduce:** Use Cyclone Strike twice on one turn at level 14. The prior Node probe accepted both without warnings. Below level 14, inspect reuse on another combatant's turn before the Centurion's next turn.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Track both source-defined intervals; warn on repeat use and allow a public override, rather than imposing a turn gate. Undo restores the use tracker.
