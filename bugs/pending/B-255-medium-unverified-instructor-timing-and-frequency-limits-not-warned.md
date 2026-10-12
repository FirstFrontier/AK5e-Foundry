# B-255 · Medium · Unverified: Kingmaker, Cooperative Combat and Teach from Experience timing limits are never warned

Area: Instructor / Kingmaker (10th), Teach from Experience (4th)

**Found:** Guard audit unit 10 (Instructor), 2026-10-12. Node probe.

**Evidence:** Source: Kingmaker is once per Turn, only "when you issue an Instruction", and issues "the same Instruction" ([L2877](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2877)); Cooperative Combat may not be repeated "until the beginning of your next Turn" ([L2874](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2874)); From Experience is "at the beginning of your Turn during Combat" ([L2872](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2872)). The plans ([instructor-features.mjs](../../ak5e/scripts/instructor-features.mjs#L199), [L210](../../ak5e/scripts/instructor-features.mjs#L210), [L254](../../ak5e/scripts/instructor-features.mjs#L254)) warn only about level, dice and Aggression. WORKFLOW §3.2.3 lists timing and frequency conditions as warnings. `once()` in resource-pools.mjs and `ownTurn` in guard-features.mjs already exist.

**Reproduce:** Probe, L12 Instructor, no combat: two Kingmaker uses with different Instructions and no earlier Instruction, two Cooperative Combat uses, and two Teach from Experience uses all succeeded with zero warnings (Aggression 4 -> 2).

**Verification limits:** Node only. "Same Instruction" needs the first use remembered (or a Kingmaker field on the original use).

**Fixed means:** Each case lists a "Use anyway" warning (second Kingmaker in a Turn, Kingmaker without or differing from the Instruction just issued, second Cooperative Combat before the next Turn start, From Experience outside Combat or off the user's own Turn start) and the override shows on the public card; undo clears the counters (see B-133).
