# B-254 · Medium · Unverified: Once More Unto The Breach only spends its use; no Instructions are issued

Area: Instructor / 17th level

**Found:** Guard audit unit 10 (Instructor), 2026-10-12. Node probe.

**Evidence:** Source [L2889](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2889): an Action; Help every allied Creature within 60 ft who can see or hear, and an Instruction to each, without spending dice. The plan ([instructor-features.mjs](../../ak5e/scripts/instructor-features.mjs#L281)) has no Instruction choice and no `rolls`/formula, so no Roll button exists and no Instruction Die is ever rolled; `data.targets` is stored unvalidated as `result.targets` ([L299](../../ak5e/scripts/instructor-features.mjs#L299)). The sheet button has no dialog, so one click spends the use ([guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L1133); link B-129). ak5e/DECISIONS.md L1446-1447 and TODO.md L85 say it grants the Instructions.

**Reproduce:** Probe, L17: `targets:[{uuid:"Actor.a"},"garbage",5]` returns `targetCount:3`, status `complete`, `formula` undefined, `receipt.targets` `[]`.

**Verification limits:** Node only.

**Fixed means:** A confirm step lists the allies in 60 ft; one Instruction per ally is chosen; each gets its own owner-clicked Instruction Die roll (d10 from 13th); malformed targets are rejected; the docs match the behaviour.
