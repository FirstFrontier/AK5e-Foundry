# B-139 · High · Unverified: Resonance roll bonuses have incorrect scope and duration

Area: Artsblade / Crude and improved Flame Resonance

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [artsblade-features.mjs](../../ak5e/scripts/artsblade-features.mjs#L327) / [artsblade-features.mjs](../../ak5e/scripts/artsblade-features.mjs#L344) match only the current combat turn and do not restrict attacks to melee. [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2284) / [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2360) retain benefits through the end of the next turn; Flame specifically affects melee weapon attacks.

**Reproduce:** Cast Crude at level 10, roll a ranged attack, then advance to another combatant. The prior probe added +3 to the ranged roll and removed the bonus immediately on turn change.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Apply each bonus only to its source-defined attacks for the full duration, preserve Flame's Fire damage type, and provide accurate outside-combat manual expiry where necessary.
