# B-253 · Medium · Unverified: Keep fighting! never applies or relays Temporary HP, and the roll card is empty

Area: Instructor / Instruction Options (Keep fighting!)

**Found:** Guard audit unit 10 (Instructor), 2026-10-12. Node probe.

**Evidence:** Source [L2914](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2914): the Creature gains Temporary Hit Points equal to one roll. The plan ([instructor-features.mjs](../../ak5e/scripts/instructor-features.mjs#L237)) records only `formula` and a summary, never a `receipt.targets` entry. The engine already offers a `tempHP` target kind with GM relay and undo ([play-uses.mjs](../../ak5e/scripts/play-uses.mjs#L126), [relay L194](../../ak5e/scripts/play-uses.mjs#L194)) and requires `plan.validateTarget`; the plan defines none. The card says "gains 1d6 Temporary Hit Points", reading as automatic (WORKFLOW §4.4.6). WORKFLOW §3.2.2 applies when the ally is not owned.

**Reproduce:** Probe: use Keep fighting!, then `useRoll`: ally untouched; the second chat card is `<h3>Instruction: Keep fighting!: result</h3>` with an empty body.

**Verification limits:** Node only. Depends on B-252 for a recipient.

**Fixed means:** After the owner clicks Roll, the total becomes the ally's Temporary HP through the `tempHP` kind (relayed to the GM client for unowned allies, `validateTarget` capping at the dice maximum) and undo reverses it; or DECISIONS records it as a manual procedure and the card says "apply manually".
