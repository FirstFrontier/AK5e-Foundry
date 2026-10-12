# B-140 · High · Unverified: Blade Art save immunity is recorded before a save

Area: Artsblade / Resonance save tracking

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [artsblade-features.mjs](../../ak5e/scripts/artsblade-features.mjs#L131) writes bladeArtSaves during casting; [artsblade-features.mjs](../../ak5e/scripts/artsblade-features.mjs#L120) compares the current global turn. [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2274) starts exemption only after a creature makes the save, lasting until the Artsblade's next turn begins.

**Reproduce:** Supply a targetUuid and cast twice without resolving any save. Static tracing marks the second cast exempt; moving to another combatant ends the exemption too early. The sheet supplies no targetUuid.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Record an actual owner-resolved save, retain the correct source-actor duration, and support target selection and undo. Do not auto-roll or pre-empt the first required save.
