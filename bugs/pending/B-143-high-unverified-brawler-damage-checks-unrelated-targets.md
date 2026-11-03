# B-143 · High · Unverified: Brawler damage bonus checks unrelated selected targets

Area: Brawler / Kick Them While They're Down

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [brawler-features.mjs](../../ak5e/scripts/brawler-features.mjs#L458) checks any game.user.targets token, rather than the creature hit. [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2456) grants the PB bonus for the affected creature hit by that unarmed strike. Related targeting concern: [B-032](B-032-low-hit-miss-uses-current-targets.md).

**Reproduce:** Select a healthy creature and a Prone creature, then damage the healthy one. The prior mixed-target probe appended PB despite not establishing that the damaged creature had a detrimental condition.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Bind the bonus to the actual hit target and source-defined detrimental condition, preserve its Bludgeoning type, and test mixed targets without inventing an exhaustive source condition list.
