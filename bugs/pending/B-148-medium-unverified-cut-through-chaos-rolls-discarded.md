# B-148 · Medium · Unverified: Cut Through Chaos roll definitions are discarded

Area: Artsblade / shared use engine roll interface

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [artsblade-features.mjs](../../ak5e/scripts/artsblade-features.mjs#L263) returns plan.rolls, but [play-uses.mjs](../../ak5e/scripts/play-uses.mjs#L336) never transfers them and [play-uses.mjs](../../ak5e/scripts/play-uses.mjs#L346) requires receipt.formula. [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2327) needs a melee attack comparison for two modes. Ferocious Fling's attack roll has the same interface gap ([centurion-features.mjs](../../ak5e/scripts/centurion-features.mjs#L154)).

**Reproduce:** Use Cut Through Chaos in spellAttack mode. The prior Node probe produced status=complete with neither formula nor rolls; the card cannot offer the advertised attack roll.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Expose the required player-clicked native melee attack and comparison in the appropriate modes, preserving weapon bonuses/ability choice. Reaction-Art mode does not invent an attack; no dice auto-roll.

**Progress (2026-10-18, unit 07):** Ferocious Fling part addressed in `ak5e/scripts/centurion-features.mjs`: the discarded `rolls` are gone; the use posts typed Bludgeoning (`damageParts`, the launched Creature's CON modifier) for the owner's Roll button, and the Ranged Weapon Attack (Strength) is described as the player's own native roll, never started by the module. The Cut Through Chaos (Artsblade) part and the shared-engine `plan.rolls` interface are untouched; keep this bug open for the Artsblade side.
