# B-144 · High · Unverified: Fearmonger affects other Guard subclasses

Area: Centurion / attack hook

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [centurion-features.mjs](../../ak5e/scripts/centurion-features.mjs#L261) checks Guard level but omits isCenturion(actor) on the outgoing advantage branch. [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2581) grants Fearmonger to Centurions with Mow Them Down.

**Reproduce:** Roll as a level-5 Brawler against a Frightened target. The prior Node probe received advantage from the Centurion hook.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Only eligible Centurions receive outgoing Fearmonger advantage; incoming disadvantage is tied to the actual Centurion target. Unrelated Actors and other targeted creatures retain their normal rolls.

**Resolution (fixed 2026-10-18, unreleased):** `centurionPreRollAttack` in `ak5e/scripts/centurion-features.mjs` now gives outgoing Advantage only to a Centurion of 4th Level or higher, and only when every targeted Creature is Frightened. Incoming Disadvantage applies only to a Frightened attacker whose targets are all Fearmonger Centurions; mixed target sets keep the normal roll. Tests in `ak5e/test/centurion.test.mjs` ("B-144: ...": Brawler, Artsblade and Crusher get nothing; level 3 Centurion gets nothing; mixed targets). Live check on a disposable Foundry V13: a Brawler got no Advantage, the Centurion did. Node plus one live pass; not a full table session.
