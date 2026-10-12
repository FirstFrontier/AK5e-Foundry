# B-289 · Medium · Unverified: Living on the Edge bonus is shown but never applied

Area: Guard / Musha / Found Alongside Death

**Found:** Guard audit unit 13 (Musha), 2026-10-12.

**Evidence:** livingOnTheEdgeBonus ([musha-features.mjs](../../ak5e/scripts/musha-features.mjs#L58)) is read only by the sheet badge ([guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L59)) and the game.ak5e API; no Active Effect, AC or save change uses it. Source [Ch.3 L3310](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3310): AC and a Saving Throw Bonus "against effects you can see" of half PB (rounded up) at 50% or less, PB at 10% or less. The badge says "Edge AC/Save: +N" with no note that it is manual or limited to seen effects. The thresholds and rounding themselves are correct (probe: PB 5 gives 3 at 50%, 5 at 10%). Relates to WORKFLOW §4.4.6 (do not label manual instructions as automatic).

**Reproduce:** Probe: level 13 Musha at 5/45 HP: bonus 2, actor.effects empty, no writes.

**Verification limits:** Node probe plus a repository-wide search for callers; not checked in Foundry V13.

**Fixed means:** Either an undo-safe effect applies the AC bonus and the save bonus is described as against effects you can see, or the badge states "apply manually" with the condition. The tier must follow HP changes (50% vs 10%).
