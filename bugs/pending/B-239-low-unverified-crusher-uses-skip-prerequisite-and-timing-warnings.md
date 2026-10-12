# B-239 · Low · Unverified: Crusher uses give no equipment or timing warnings

Area: Crusher / warn-don't-block (WORKFLOW §3.2 rule 3)

**Found:** Crusher audit (unit 8), 2026-10-12. Static review plus probe (Heroic Blow level warning only).

**Evidence:** WORKFLOW §3.2 rule 3 requires every failed prerequisite, required-equipment and timing check to be listed as a warning with "Use anyway". The Crusher plans warn only on level, Foecrusher uses and Aggression ([crusher-features.mjs](../../ak5e/scripts/crusher-features.mjs#L133)). Not checked: a Heavy Melee Weapon is wielded for Death's Passing ([L2646](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2646)), Horde Breaker ([L2695](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2695)) and the Heavy Metal hook's wielded state; that Heroic Blow is "during your Turn" ([L2698](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2698)); that Heroic Killing Blow follows a Heroic Blow (L2703); that Overbear follows a Foecrusher (B-235). The Foecrusher and Heroic Blow plans also do not note that they apply to Melee Attacks only.

**Reproduce:** Probe: a level-13 Crusher with no weapon items uses Heroic Blow, Death's Passing and Horde Breaker (with data) with no warning; Heroic Blow at level 12 warns only about level.

**Verification limits:** Node only. Depends on B-230 for a reliable Heavy Melee Weapon test.

**Fixed means:** Each use lists these as warnings (with Use anyway) when token, combat or equipment data exists, and the override appears on the public card. Nothing is blocked.
