# B-151 · Medium · Unverified: Brawler native benefits are incomplete

Area: Brawler / setup and automation/manual boundary

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [brawler-features.mjs](../../ak5e/scripts/brawler-features.mjs#L23) exposes a die helper without applying it to damage; [guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L49) shows Bob and Weave as a badge only. Setup grants no Brawler feature Items. Source: [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2430), [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2443) and [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2445).

**Reproduce:** Configure a Brawler and inspect actual AC, unarmed damage at levels 1/7/14, Crush (3), Flurry and Dexterity Grapple/Shove choices. Helper results and a badge do not establish native mechanics.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Grant visible source instructions and implement or explicitly document manual handling for each benefit. Check actual sheets/activities and distinguish the Brawler Fighting Style's bonus strike from subclass Flurry.
