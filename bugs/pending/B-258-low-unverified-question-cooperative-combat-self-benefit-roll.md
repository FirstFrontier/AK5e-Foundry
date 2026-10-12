# B-258 · Low · Unverified: Question: does Cooperative Combat's self-benefit use the same Instruction Die roll?

Area: Instructor / Press the Attack: Cooperative Combat (4th)

**Found:** Guard audit unit 10 (Instructor), 2026-10-12. Static review plus Node probe.

**Evidence:** Source [L2874](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2874): "you also gain the benefit of that Instruction", and each Instruction is "one roll of your Instruction Die" ([L2899](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2899)). It does not say whether the Instructor's own benefit shares the recipient's roll or rolls again, nor whether it may pair with a Kingmaker second Instruction. The plan ([instructor-features.mjs](../../ak5e/scripts/instructor-features.mjs#L237)) records one `formula`, so one roll serves both, and a Kingmaker use accepts `cooperativeCombat` too ([L197](../../ak5e/scripts/instructor-features.mjs#L197)). No entry exists in ak5e/DECISIONS.md (Guard section L1379-1450 does not list it).

**Reproduce:** Probe: `instruction` + `cooperativeCombat:true` -> one `awaitingRoll` receipt, `1d6`, summary "Guard also gains the benefit for 1 Aggression".

**Verification limits:** Ambiguity in the source; no Foundry run.

**Fixed means:** The GM-owner records the reading in DECISIONS. Until a GM ruling exists, the confirm dialog offers the readings (same roll / separate roll) as a per-use player choice shown on the card (WORKFLOW §3.2.3), and the Kingmaker-plus-Cooperative case is likewise resolved.
