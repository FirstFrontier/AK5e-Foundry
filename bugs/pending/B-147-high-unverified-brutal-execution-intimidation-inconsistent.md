# B-147 · High · Unverified: Brutal Execution uses an inconsistent Intimidation modifier

Area: Centurion / DC and Psychic damage

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [centurion-features.mjs](../../ak5e/scripts/centurion-features.mjs#L108) uses skills.itm.mod; [guard-rules.mjs](../../ak5e/scripts/guard-rules.mjs#L122) uses skills.itm.total for DC. Audited D&D5e 5.3.3 distinguishes ability modifier from final skill bonus. [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2555) / [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2573) use the same Intimidation Modifier wording.

**Reproduce:** Set Intimidation mod=2 and total=8. The prior Node probe returned DC 16 but Psychic damage 2, rather than the same modifier used by DC.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Use a consistent source/reviewed modifier for DC and damage, with proficiency/expertise fixtures. Any genuinely unresolved reading follows DECISIONS/per-use procedures rather than an implicit substitution.
