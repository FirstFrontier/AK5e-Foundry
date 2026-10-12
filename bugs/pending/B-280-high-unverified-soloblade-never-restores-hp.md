# B-280 · High · Unverified: Soloblade never restores Hit Points

Area: Guard / Musha / Soloblade

**Found:** Guard audit unit 13 (Musha), 2026-10-12.

**Evidence:** [musha-features.mjs](../../ak5e/scripts/musha-features.mjs#L101) mushaSoloblade sets receipt.formula and returns {} with no heal target and no HP write. [play-uses.mjs](../../ak5e/scripts/play-uses.mjs#L346) useRoll then only rolls the formula and posts a plain Roll message (L363), so nothing is applied. Source: [Ch.3 L3260](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3260) "you can recover 2d6 Hit Points". Crusher Renewing Strike ([crusher-features.mjs](../../ak5e/scripts/crusher-features.mjs#L162)) uses a self "heal" target with validateTarget; Soloblade has neither. The plain roll card has no native apply control, and if a table applies it natively, [B-283](B-283-medium-unverified-stand-alone-self-heal-exemption-never-matches.md) converts it to Temporary HP.

**Reproduce:** Level 7 Musha at 20/45 HP: command mushaSoloblade, then useRoll. Probe: status awaitingRoll then complete, roll 9, targets [], HP still 20. [musha.test.mjs](../../ak5e/test/musha.test.mjs#L67) asserts only result.formula.

**Verification limits:** Node probe against the real module and ak5e/test/guard-fixture.mjs (Roll mocked, dnd5e not loaded); not reproduced in Foundry V13 + D&D5e 5.3.3. Probe scripts were kept outside the repo.

**Fixed means:** After the owner clicks Roll, the rolled 2d6/2d8/2d10 is applied to the Musha's own HP via the heal target kind (clamped to max, Construct warning kept), shown on the card, and undo restores the prior HP. Dice still roll only from the button.
