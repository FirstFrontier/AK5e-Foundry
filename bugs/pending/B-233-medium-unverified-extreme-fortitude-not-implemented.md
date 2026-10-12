# B-233 · Medium · Unverified: Extreme Fortitude (two Hit Dice, discard lowest) is not implemented

Area: Crusher / Towering Might

**Found:** Crusher audit (unit 8), 2026-10-12. Static review plus grep.

**Evidence:** [Extreme Fortitude](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2639): "Whenever you roll a Hit Die, roll two dice and discard the lowest result." The only occurrences in code are a header comment ([crusher-features.mjs](../../ak5e/scripts/crusher-features.mjs#L6)) and a progression label ([guard-progression.mjs](../../ak5e/scripts/guard-progression.mjs#L219)) that asks the player to type one number. No hook changes Hit Die rolls, and Renewing Strike rolls a single die (B-232). [DECISIONS.md](../../ak5e/DECISIONS.md#L1427) says "rolls 2 Hit Dice on rests and takes the highest" and [TODO.md](../../TODO.md#L691) marks it done.

**Reproduce:** `grep -rn "Extreme Fortitude" ak5e/scripts ak5e/test` finds no executable path or test. Short-rest Hit Dice from the native dnd5e rest dialog roll one die.

**Verification limits:** Static review; the dnd5e Hit Die roll hook was not exercised in Foundry. Maximum Bulk was probed and works only when the player opts in per level in progression (default choice is "existing" so nothing is added); repeat application is B-132.

**Fixed means:** Hit Die rolls by a Crusher (rest dialog, Renewing Strike, level-up) roll two dice and keep the higher, shown on the card; or the manual procedure is documented on the Towering Might item and the DECISIONS/TODO claims are corrected.
