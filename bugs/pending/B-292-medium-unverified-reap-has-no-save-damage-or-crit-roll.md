# B-292 · Medium · Unverified: Reap posts a text card only: no weapon damage roll, Dexterity save buttons or d20 crit check

Area: Guard / Reaper / Death's Design: Reap, Crescendo of Violence, Reaper Prime

**Found:** Guard audit unit 14 (Reaper), 2026-10-12.

**Evidence:** Source: Reap rolls the weapon's Damage, targets make a Dexterity save against Martial DC, take half (full from 13th via Reaper Prime) on a fail and none on a save ([source](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3388)); from 4th level the Reaper rolls a d20 "as if making an Attack" and a crit makes non-Elite, non-Leader creatures Vulnerable to its Damage ([source](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3396)). [reaper-features.mjs](../../ak5e/scripts/reaper-features.mjs#L228) returns no `rolls`/`formula`/`damageParts`, no target entries and no `validateTarget`; `apply` only writes a summary ([L248](../../ak5e/scripts/reaper-features.mjs#L248)). WORKFLOW §3.2.5 requires owner-clicked rolls and a save button for the target's owner.

**Reproduce:** Node probe: Reaper level 5 `reaperReap`: receipt `formula`/`damageParts` undefined, `targets: []`, status `complete`; no way to roll the weapon damage, the d20 crit check or the saves from the card. The level 13 sphere option only changes the text.

**Verification limits:** Node probe only. If Reap is meant as a documented manual procedure the card must say so; today it reads as a resolved use and DECISIONS L1913 describes the mechanics as implemented.

**Fixed means:** Reap offers player-clicked weapon-damage and d20 crit rolls and per-target Dexterity save buttons (halving by level), applies or relays results with undo, or the card and DECISIONS explicitly label it a manual procedure.
