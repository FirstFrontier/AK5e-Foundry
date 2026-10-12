# B-252 · Medium · Unverified: Instruction recipients are never chosen, so range and ally checks cannot run

Area: Instructor / Instruction, Kingmaker, Press the Attack: Cooperative Combat

**Found:** Guard audit unit 10 (Instructor), 2026-10-12. Node probe plus static review.

**Evidence:** The Issue Instruction dialog ([guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L450)) offers only an Instruction, a Cooperative Combat box and a Kingmaker box; it never sends `targetUuid` or `targetName`. The plan ([instructor-features.mjs](../../ak5e/scripts/instructor-features.mjs#L219)) then writes the literal word "target" into the public card and leaves `receipt.targets` empty. So there is no 30 ft Kingmaker range or "allied Creature" warning (WORKFLOW §3.2.3), no per-recipient record, and Kingmaker's second ally is not identified. Source: [L2857](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2857), [L2877](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2877).

**Reproduce:** Probe: `instruction` with `isKingmaker:true`, no target: card reads "Guard directs target to strike: ... +1d6 damage."; `receipt.targets` is `[]`.

**Verification limits:** Node only. Token and range data were not available in the fixture.

**Fixed means:** The dialog takes the helped Creature (and the Kingmaker ally) from selected/targeted tokens; each is stored on the receipt and named on the card; non-allies and distances over 30 ft appear as "Use anyway" warnings.
