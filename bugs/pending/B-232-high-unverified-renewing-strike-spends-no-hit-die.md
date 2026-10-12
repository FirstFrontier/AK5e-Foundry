# B-232 · High · Unverified: Renewing Strike heals without expending a Hit Die

Area: Crusher / Foecrusher (Renewing Strike)

**Found:** Crusher audit (unit 8), 2026-10-12. Probe: Node, real module + guard-fixture.

**Evidence:** [Renewing Strike](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L2674): "you may expend and roll one of your Hit Dice, and recover Hit Points equal to the amount rolled plus your Constitution Modifier". The plan ([crusher-features.mjs](../../ak5e/scripts/crusher-features.mjs#L147)) builds `1d{hd.denom ?? 10} + CON` and returns only the Foecrusher spend. No Hit Die is spent, no Hit Die availability is checked or warned, and no `system.attributes.hd` or class `hd.spent` write exists in the file. `hd.denom` is not a documented dnd5e field, so the die is in practice the d10 fallback.

**Reproduce:** Probe: an actor with `hd {value:0,max:4}` uses Renewing with no warning; with `hd {value:4}` the Hit Dice are 4 before and after and no write touches hd. Rolling the heal and undoing it work (HP 20 -> 27 -> 20), so only the missing cost is wrong.

**Verification limits:** Node only; the real dnd5e Hit Dice fields (class item `system.hd.spent`) were not inspected on a live Actor.

**Fixed means:** Renewing Strike warns when no Hit Die remains, spends one Hit Die (class hit die size) in the same receipt, restores it on undo and clamps at 0 on an overridden shortfall; the roll uses the class hit die. Related: B-233.
