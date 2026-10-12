# B-282 · Medium · Unverified: Blood Price options do nothing and the dialog misstates two of them

Area: Guard / Musha / Blood Price options

**Found:** Guard audit unit 13 (Musha), 2026-10-12.

**Evidence:** All four options share one plan that only builds a summary ([musha-features.mjs](../../ak5e/scripts/musha-features.mjs#L213)). Dig Deep ([Ch.3 L3291](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3291)) grants no Skill Points (see grantOperatorSP, [ak5e.mjs](../../ak5e/scripts/ak5e.mjs#L19)); Iai (L3293) and Ichimonji (L3295) post no bonus-damage figure; Center Oneself (L3289) offers no Condition choice. Soloblade has no exclusion for attacks made as part of an option (L3287) and no warning. [guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L931) labels Iai "Dash straight line" (source: move up to half Speed, no Dash) and omits Advantage; L932 says "Off Balance" as if a Condition (source: "knocked off balance" plus Advantage until end of Turn). A greaterBloodPrice request below level 13 is silently ignored ([musha-features.mjs](../../ak5e/scripts/musha-features.mjs#L194)).

**Reproduce:** Probe: digDeep at level 13 wrote nothing matching skill points; a level 5 request with greaterBloodPrice returned formula 2d8, isGreater false, no warning.

**Verification limits:** Node probe against the real module and guard-fixture; not reproduced in Foundry V13 + D&D5e.

**Fixed means:** Dig Deep adds Skill Points equal to the HP lost (undoable); Iai and Ichimonji cards state the bonus damage (half and full of the rolled HP lost) for the owner to add to a roll they start; Center Oneself lists the five Conditions; dialog wording matches the source; a Soloblade-after-Blood-Price warning exists; Greater below 13 warns. Depends on [B-281](B-281-high-unverified-blood-price-applies-no-hit-point-loss.md).
