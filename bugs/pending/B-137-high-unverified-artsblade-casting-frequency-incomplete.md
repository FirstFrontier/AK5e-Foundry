# B-137 · High · Unverified: Artsblade casting frequency warnings are incomplete

Area: Artsblade / Blade Art, Spellsword Arts and Augmented Assault

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [artsblade-features.mjs](../../ak5e/scripts/artsblade-features.mjs#L106) does not track Blade Art casts. [artsblade-features.mjs](../../ak5e/scripts/artsblade-features.mjs#L202) bypasses warnings for Augmented Assault without counting two casts or restricting their identity. [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2245) and [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2249) define the limits.

**Reproduce:** Cast Blade Art twice in one turn without Augmented Assault: the prior Node probe accepted both without warnings. With Augmented Assault, inspect third-cast and non-Blade-Art paths.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Count qualifying casts consistently; present source timing/frequency and eligible-Art warnings before use, allow public overrides, and preserve cancellation/undo. Resolve Unleash/source wording explicitly.
