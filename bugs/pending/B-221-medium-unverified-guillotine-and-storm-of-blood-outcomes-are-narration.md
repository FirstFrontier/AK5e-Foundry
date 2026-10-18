# B-221 · Medium · Unverified: Guillotine and Storm of Blood outcomes are narration only

Area: Centurion / Guillotine and Storm of Blood

**Found:** Guard audit unit 07 (Centurion), Sonnet 5.5, 2026-10-18; static review.

**Evidence:** [centurion-features.mjs](../../ak5e/scripts/centurion-features.mjs) posts one typed damage roll and `[[/save]]` links for Guillotine (DEX Martial DC; WIS Centurion DC for an Elite or Leader) and Storm of Blood (DEX Martial DC). It does not record which Creatures failed, so Bleeding, Frightened, the half-damage success, the "must move directly away" rider and the Elite/Leader pulse are applied by hand. Source: [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2592) and [L2610](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2610). Brutal Execution already has the two-step pattern (use, then "failed save" per Creature) that these could reuse.

**Reproduce:** Use Guillotine or Storm of Blood: the card lists the saves and effects, but no target receives a Frightened or Bleeding effect and nothing can be undone for it.

**Verification limits:** Static review and Node tests of the card/receipt; not exercised on targets in Foundry.

**Fixed means:** Per-Creature failed-save outcomes apply the condition with expiry through reversible receipts and the GM relay (owner-clicked saves, no auto-roll), or the card is documented as a complete manual procedure.
