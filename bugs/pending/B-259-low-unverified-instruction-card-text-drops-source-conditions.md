# B-259 · Low · Unverified: Instruction card text drops source conditions; Squad Leader is description-only though docs say enabled

Area: Instructor / Instruction Options text, Squad Leader

**Found:** Guard audit unit 10 (Instructor), 2026-10-12. Static review.

**Evidence:** (1) Hang in there! ([instructor-features.mjs](../../ak5e/scripts/instructor-features.mjs#L131)) says "next Death Saving Throw", but the source ([L2911](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2911)) limits it to one rolled "before the end of their next Turn". (2) Snap out of it! ([L149](../../ak5e/scripts/instructor-features.mjs#L149)) omits the condition that the Creature is under an effect needing a save at the start or end of its Turn ([L2920](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2920)). (3) ak5e/DECISIONS.md L1438 and TODO.md L84-85 say Squad Leader "enables Help as a Bonus Action ... and extends Help range to 30 ft"; no plan, hook or warning implements it (only the Item text exists). Everything else checked matches the source: dice 4/5/6, d6 -> d10 at 13th, Kingmaker d6, Breach 60 ft and 1/Long Rest, ten Instruction names and dice counts.

**Reproduce:** Read the two `summary` strings against the quoted source lines; grep "squad" in ak5e/scripts finds no behaviour.

**Verification limits:** Static review only.

**Fixed means:** The two summaries carry the source conditions verbatim; DECISIONS/TODO say Squad Leader is a manual Item description (or a reminder is added); a test compares each summary's key numbers and timing words to the source.
