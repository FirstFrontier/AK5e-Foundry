# B-222 · Medium · Unverified: Cyclone Strike and Shredder are manual cards

Area: Centurion / Cyclone Strike and Shredder

**Found:** Guard audit unit 07 (Centurion), Sonnet 5.5, 2026-10-18; static review.

**Evidence:** [centurion-features.mjs](../../ak5e/scripts/centurion-features.mjs) Cyclone Strike counts secondary Creatures and tracks its frequency, but offers no secondary attack comparison ("greater than the second Creature's Armour Class"), no Reach / within-10-ft check and no damage for the cleaved Attack. Shredder posts a typed Slashing roll from a card the player starts; it is not tied to the triggering melee hit and has no 10-ft check. Source: [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2556) and [L2597](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2597). No module-started attack roll is allowed ([WORKFLOW §3.2](../../WORKFLOW.md)), so any fix is a native-roll hook.

**Reproduce:** Use Cyclone Strike: only a narration card and a frequency record are produced.

**Verification limits:** Static review only.

**Fixed means:** A `dnd5e.rollAttack` / damage hook (or documented manual steps) compares the same roll with each secondary Creature's AC and adds range warnings; Shredder's damage is offered from the triggering hit. No attack or damage dice auto-roll.
