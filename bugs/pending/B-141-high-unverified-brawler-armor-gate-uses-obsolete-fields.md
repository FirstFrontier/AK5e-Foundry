# B-141 · High · Unverified: Brawler armor gate uses obsolete D&D5e fields

Area: Brawler / Guns Out

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [brawler-features.mjs](../../ak5e/scripts/brawler-features.mjs#L30) checks type.value=armor and armor.type/subType; audited D&D5e 5.3.3 stores medium/heavy directly in system.type.value. [Chapter 3](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2430) excludes Medium and Heavy Armour.

**Reproduce:** Equip a native equipment Item with type.value=heavy. The prior schema-shaped Node probe incorrectly returned true from isUnarmoredOrLight.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Recognize the installed native armor schema, distinguish shields, and apply/display Guns Out eligibility accurately. Any table override is explicit rather than an undetected armor mismatch.
