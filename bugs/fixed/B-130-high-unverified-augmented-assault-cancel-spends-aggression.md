# B-130 · High · Unverified: Cancelling Augmented Assault still spends Aggression

Area: Artsblade / Guard sheet

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L404) continues to the command when the level-13 Unleash prompt returns null. [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2245) gives the 2-Aggression cost; [WORKFLOW §3.2](../../WORKFLOW.md) requires cancellation to change nothing.

**Reproduce:** At level 13, dismiss the Augmented Assault prompt. The prior in-memory null-result probe spent 2 Aggression and recorded a use.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Cancel/close exits before spending or recording a use; an unchecked Unleash option remains distinguishable from cancellation.

**Resolution (fixed 2026-10-18, unreleased):** `ak5e/scripts/guard-sheet.mjs`: the Augmented Assault dialog returns `null` on
Cancel/close (the sheet returns before the engine is called) and `false` for an unchecked Unleash box, which continues to the
confirmed use. Test: `ak5e/test/guard-sheet.test.mjs` ("B-130" cases, 13th level and below).
