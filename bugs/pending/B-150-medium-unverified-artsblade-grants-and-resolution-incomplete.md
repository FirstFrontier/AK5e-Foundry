# B-150 · Medium · Unverified: Artsblade grants and Art resolution are incomplete

Area: Artsblade / setup and automation/manual boundary

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [guard-setup.mjs](../../ak5e/scripts/guard-setup.mjs#L8) grants core features only; [guard-progression.mjs](../../ak5e/scripts/guard-progression.mjs#L344) grants a branch Item without Arts pool/feature grants. [artsblade-features.mjs](../../ak5e/scripts/artsblade-features.mjs#L191) records a free-text Art; most Resonance riders, Unleash and True Spellsword remain unimplemented. Source: [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2206), [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2249), [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2274), [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2351).

**Reproduce:** Configure an Artsblade and inspect learned pools, Arts-Touched, source feature Items, Casting Unit behavior and selected Art resolution. Generic receipts do not resolve the chosen Art or its source target transformations.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Provide reviewed grants and either faithful resolution or clearly visible, accurate manual procedures. Cover selected-pool restrictions, riders, attack/save/self/area placement, Unleash and True Spellsword; label manual mechanics honestly.
