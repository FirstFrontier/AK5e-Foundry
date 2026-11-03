# B-134 · High · Unverified: Ultimate Blade Art never expires

Area: Artsblade / Power Overwhelming

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [artsblade-features.mjs](../../ak5e/scripts/artsblade-features.mjs#L303) sets a persistent boolean; [artsblade-features.mjs](../../ak5e/scripts/artsblade-features.mjs#L205) treats it as active for every later cast. No expiry handler clears it. [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2407) limits the effect through the end of the next turn.

**Reproduce:** Activate Ultimate Blade Art and advance beyond the end of the next turn. Static tracing shows the casting-limit bypass remains; the prior probe also confirmed the flag survives undo (B-133).

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** The bypass ends at the source duration, remains ended across reloads, and is reversible. Turn/Round wording follows a recorded ruling or a public per-use reading.
