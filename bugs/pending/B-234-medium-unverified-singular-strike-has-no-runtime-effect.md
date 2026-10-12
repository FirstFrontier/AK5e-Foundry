# B-234 · Medium · Unverified: Singular Strike has no runtime effect (helper only)

Area: Crusher / Crushing Blows

**Found:** Crusher audit (unit 8), 2026-10-12. Static review plus grep.

**Evidence:** [Singular Strike](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2650) limits the Attack Action to one Attack and, for a Melee Attack, adds (weapon damage + STR modifier + weapon +N bonus) per forgone Attack (example L2655-2661). `singularStrikeBonus` ([crusher-features.mjs](../../ak5e/scripts/crusher-features.mjs#L101)) is exported and unit-tested but called nowhere: `grep -rn singularStrikeBonus ak5e --include=*.mjs` hits only its definition and the test. No plan, sheet button, hook or card uses it, and the Attack Action limit is neither enforced nor warned. The helper's arithmetic matches the example (4 attacks, 3d6, STR 5 gives 12d6+20 with the base), but it has no melee-only condition and relies on the caller passing the Heavy Metal die. [TODO.md](../../TODO.md#L691) and [DECISIONS.md](../../ak5e/DECISIONS.md#L1429) record it as done; TODO L693 notes the Extra Attack / Bonus Action / Unrelenting rulings were never logged (B-238).

**Reproduce:** Search as above; a Crusher with Extra Attack on a Greatsword makes normal damage rolls with no Singular Strike prompt, bonus or warning.

**Verification limits:** Static review; no live attack was rolled.

**Fixed means:** Either a confirm-first Singular Strike use (or roll patch the player starts) adds the extra damage for the number of forgone Attacks and warns about the one-Attack limit, or the Crushing Blows item is documented as a manual procedure and TODO/DECISIONS stop claiming automation. Related: B-230.
