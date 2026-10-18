# B-192 · Medium · Unverified: Blade Art and Spellsword prompts offer all eleven Arts Pools, not the character's selected pools

Area: Artsblade / Guard sheet and setup

**Found:** Guard unit 04 (sheet audit), 2026-10-18.

**Evidence:** Source ([Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2306)): Blade Art's damage type corresponds to "one of the Arts Pools you have selected for your Spellsword Arts" (one at 1st level, two more at 10th). Nothing in the module records those selections (`grep` for selected pools in `ak5e/scripts` finds none), so `guard-sheet.mjs` lists every entry of `ARTS_POOLS` and any damage type can be chosen.

**Verification limits:** static review; the sheet cannot fix this without a stored selection.

**Fixed means:** A decision on where the 1 + 2 chosen pools are stored (Guard setup/progression flag or Items), the prompt lists only those pools (with a clear way to choose when none are recorded), and a use outside them warns rather than blocks.
