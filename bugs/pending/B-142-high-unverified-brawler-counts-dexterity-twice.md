# B-142 · High · Unverified: Brawler can count Dexterity twice

Area: Brawler / Dexterous Attacks

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [brawler-features.mjs](../../ak5e/scripts/brawler-features.mjs#L426) / [brawler-features.mjs](../../ak5e/scripts/brawler-features.mjs#L446) blindly append DEX minus STR, regardless of the activity's existing ability. [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2436) substitutes Dexterity for Strength and permits the player's choice.

**Reproduce:** With STR +2 and DEX +4, roll an unarmed activity already using native @mod=4. The prior Node probe appended +2, yielding a +6 ability contribution.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Use the chosen STR/DEX modifier exactly once for attack and damage; retain the player's source-defined choice and verify native Dexterity and Strength activities separately.
