# B-152 · Medium · Unverified: Centurion reach and Reaction refunds are incomplete

Area: Centurion / Long-Arm and Storm of Blood

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [centurion-features.mjs](../../ak5e/scripts/centurion-features.mjs#L223) narrates extended reach and AoO Reaction refunds without recording/applying them; the only registered roll hook is Fearmonger ([centurion-features.mjs](../../ak5e/scripts/centurion-features.mjs#L288)). Source: [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2571) and [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2614).

**Reproduce:** Inspect weapon reach on/off the Centurion's turn, then use Storm of Blood and make an opportunity-attack hit. Static tracing finds no Long-Arm state or refund consumer.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Apply source-defined reach/refunds or supply complete visible manual instructions and remove automatic-completion claims. Any automated benefits use reversible receipts, correct duration and no module-started attack rolls.
