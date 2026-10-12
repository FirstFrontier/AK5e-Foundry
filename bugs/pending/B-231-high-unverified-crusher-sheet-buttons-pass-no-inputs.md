# B-231 · High · Unverified: Crusher sheet buttons for Death's Passing, Horde Breaker, Heroic Blow and Heroic Killing Blow supply no inputs

Area: Crusher / Guard sheet

**Found:** Crusher audit (unit 8), 2026-10-12. Probe: Node, real module + guard-fixture.

**Evidence:** [guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L124) renders these four buttons, but [executeGuardDialog](../../ak5e/scripts/guard-sheet.mjs#L1133) has no branch for them and sends only `{confirmed:true}`. The plans read their numbers from `data`: `damageTotal` ([crusher-features.mjs](../../ak5e/scripts/crusher-features.mjs#L212)), `excessDamage` ([L231](../../ak5e/scripts/crusher-features.mjs#L231)), `existingCrush` ([L256](../../ak5e/scripts/crusher-features.mjs#L256)) and `targetHp`, which defaults to 100 ([L276](../../ak5e/scripts/crusher-features.mjs#L276)). Source: [Death's Passing](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2646), [Horde Breaker](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2695), [Heroic Blow](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2698), [Execution](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2703).

**Reproduce:** Probe with the sheet payload: Death's Passing posts "takes 0 Thunder Damage (half of 0)"; Horde Breaker always throws "requires excess damage"; Heroic Killing Blow reports `executed:false` for a target that would be at 10 HP; Heroic Blow gives Crush (6) at PB 3 even when the weapon already has Crush (5) (L2698 says add them, 11). Only the unit tests, which pass the numbers directly, succeed.

**Verification limits:** Node only; the dialogs were not opened in Foundry. All four also skip the confirm dialog unless a warning fires (B-129).

**Fixed means:** Each button collects (or reads from the last roll/target) the needed values and shows them in the confirm step before anything is recorded; Crush reads the wielded weapon's own Crush(X); Horde Breaker and Death's Passing give a result the player can apply. Shared: B-129.
