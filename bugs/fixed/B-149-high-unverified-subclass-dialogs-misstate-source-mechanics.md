# B-149 · High · Unverified: Subclass dialogs misstate source mechanics

Area: Artsblade and Brawler / prompts and historical summaries

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L385) describes Cut Through Chaos as advantage/disadvantage; [guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L421) offers CON for Chokehold; [guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L439) says four Mountainbreaker attacks or a stun save. Source: [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2327), [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2521), [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2461). Historical [DECISIONS](../../ak5e/DECISIONS.md#L1449) repeats incorrect summaries.

**Reproduce:** Open these prompts. Chokehold's CON value falls through to STR; Mountainbreaker's actual plan narrates different mechanics from its options. These findings were static, not a fresh Foundry reproduction.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Prompts/cards/docs match melee-roll comparisons, STR/DEX score HP loss, and Mountainbreaker's ten-attack cumulative -2 chain or fivefold hit/push/Prone. Preserve source uncertainties as decisions, not invented mechanics.

**Resolution (fixed 2026-10-18, unreleased, sheet prompts only):** `ak5e/scripts/guard-sheet.mjs`: Cut Through Chaos now quotes the three
source uses (melee Attack Roll compared with the Spell Attack Roll or the Saving Throw DC; Reaction Art without a Spellsword Point;
Clear Path from 13th level), with no advantage/disadvantage. Chokehold offers Strength or Dexterity Score (values shown, no CON; an
unsupported value is sent as `str`). Mountainbreaker quotes the ten-attack cumulative -2 chain and the fivefold hit with 20-ft push
and Prone. Tests: `ak5e/test/guard-sheet.test.mjs` ("B-149" cases). Not done here: the historical wording in `ak5e/DECISIONS.md` (L1449)
is the head's to correct.
