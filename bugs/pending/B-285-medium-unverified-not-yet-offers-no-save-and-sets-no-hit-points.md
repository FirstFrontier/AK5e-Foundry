# B-285 · Medium · Unverified: Not Yet offers no Wisdom save and applies no survival HP

Area: Guard / Musha / Not Yet

**Found:** Guard audit unit 13 (Musha), 2026-10-12.

**Evidence:** [musha-features.mjs](../../ak5e/scripts/musha-features.mjs#L127) mushaNotYet only raises flags.ak5e.musha.notYetDc (L151) and posts a card; it has no rolls entry, no save button and no HP write. Source [Ch.3 L3271](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3271): on a success you survive with twice PB HP (recovering up to it if you had less). The sheet button reads "Not Yet (Wisdom Save)" ([guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L277)). data.outrightKill (L131) is never sent by any UI, so the pre-17 warning is unreachable. WORKFLOW §3.2.5 asks for a save button the owner clicks.

**Reproduce:** Level 5 Musha at 0 HP: mushaNotYet. Probe: DC 10 to 15, surviveHp 6, HP still 0, no formula or roll.

**Verification limits:** Node probe against the real module and guard-fixture; not reproduced in Foundry V13 + D&D5e.

**Fixed means:** The card carries a Wisdom save button against the recorded DC; on success the owner can apply HP = 2 x PB (undoable, never auto-rolled); the outright-kill choice is reachable in the use dialog; whether the DC rises on a failed save follows a logged reading.
