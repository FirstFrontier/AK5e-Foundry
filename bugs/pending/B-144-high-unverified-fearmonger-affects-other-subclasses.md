# B-144 · High · Unverified: Fearmonger affects other Guard subclasses

Area: Centurion / attack hook

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [centurion-features.mjs](../../ak5e/scripts/centurion-features.mjs#L261) checks Guard level but omits isCenturion(actor) on the outgoing advantage branch. [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2581) grants Fearmonger to Centurions with Mow Them Down.

**Reproduce:** Roll as a level-5 Brawler against a Frightened target. The prior Node probe received advantage from the Centurion hook.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Only eligible Centurions receive outgoing Fearmonger advantage; incoming disadvantage is tied to the actual Centurion target. Unrelated Actors and other targeted creatures retain their normal rolls.
