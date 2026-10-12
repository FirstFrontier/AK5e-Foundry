# B-238 · Low · Unverified: Question: Heroic Blow rider, Singular Strike scope and Horde Breaker "excess" are unruled and unlogged

Area: Crusher / rules questions

**Found:** Crusher audit (unit 8), 2026-10-12. Static review of the source and DECISIONS.

**Evidence:** (1) [Heroic Blow](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2698) spends "a use of your Foecrusher Feature to make that Attack a Heroic Blow"; the source does not say whether it also carries one of the four Foecrusher Effects. The plan ([crusher-features.mjs](../../ak5e/scripts/crusher-features.mjs#L245)) applies none, silently. (2) [Singular Strike](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2650) says "when you take the Attack Action"; whether Extra Attack, Bonus Action attacks or Unrelenting attacks count as "additional Attacks" is unstated. (3) [Horde Breaker](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2695) "excess Damage": overkill after resistance, and whether Heroic Blow / Death's Passing damage counts, are unstated. [TODO.md](../../TODO.md#L693) lists these as "Rulings to log" but [DECISIONS.md](../../ak5e/DECISIONS.md#L1425) has no entry; no `reading` is registered, so the player cannot pick a reading per WORKFLOW §3.2.

**Reproduce:** Search DECISIONS.md for "Heroic Blow" riders, "Extra Attack" and "excess": only the Crusher summary lines match.

**Verification limits:** Source ambiguity; no mechanics invented here.

**Fixed means:** Each question gets a DECISIONS.md entry, and where a use depends on it the confirm step offers the readings (player picks for this use; a GM-recorded ruling replaces the choice).
