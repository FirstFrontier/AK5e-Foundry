# B-145 · High · Unverified: Cyclone Strike frequency checks fail

Area: Centurion / Cyclone Strike

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [centurion-features.mjs](../../ak5e/scripts/centurion-features.mjs#L78) disables frequency checks at level 14; below 14 it tracks the global turn. [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2558) limits reuse until the Centurion's next turn begins, then permits once on each turn from level 14.

**Reproduce:** Use Cyclone Strike twice on one turn at level 14. The prior Node probe accepted both without warnings. Below level 14, inspect reuse on another combatant's turn before the Centurion's next turn.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Track both source-defined intervals; warn on repeat use and allow a public override, rather than imposing a turn gate. Undo restores the use tracker.

**Resolution (fixed 2026-10-18, unreleased):** Cyclone Strike's frequency is read from the Centurion's recorded, non-undone receipts (`receipt.cyclone`, in `ak5e/scripts/centurion-features.mjs`), so undo restores the tracker and nothing is kept in `state.data`. Below 14th Level a repeat warns until the Centurion's next Turn begins (including on other Creatures' Turns, and with several initiative entries); from 14th Level it warns on a second use in the same Turn. The public override is allowed. The tracker works only in a started combat where the Centurion is a combatant. Tests: "B-145: ..." in `ak5e/test/centurion.test.mjs`. Live check: first use ok, same-turn and other-turn repeats warned, the Centurion's next turn was free.
