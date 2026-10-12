# B-284 · Low · Unverified: Question: Stand Alone amount (rolled vs recoverable) and Temp HP stacking

Area: Guard / Musha / Stand Alone (rules question)

**Found:** Guard audit unit 13 (Musha), 2026-10-12.

**Evidence:** [Ch.3 L3262](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3262): Temporary HP "equal to the Hit Points you would have recovered". [musha-features.mjs](../../ak5e/scripts/musha-features.mjs#L302) uses the full incoming amount even when the Musha was near max (readings: the rolled amount, or only the part below max HP). L311 keeps the higher of existing Temp HP and the new amount (D&D5e replace rule); the source does not say whether Temporary HP add up. Neither choice is logged in DECISIONS.md (L1972 says only "converted").

**Reproduce:** Probe: heal -20 at 48/50 HP produces 20 Temp HP; only 2 HP were recoverable.

**Verification limits:** Node probe only; the source text is ambiguous, so this is a question, not a confirmed defect.

**Fixed means:** The readings are logged in DECISIONS.md and offered as a per-use player reading (WORKFLOW §3.2.3) until a GM ruling exists; the card shows the chosen reading. No invented default.
