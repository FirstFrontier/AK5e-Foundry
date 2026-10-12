# B-230 · High · Unverified: Crusher Heavy Melee Weapon detection never matches the module's own weapons

Area: Crusher / Heavy Metal (crusher-features.mjs)

**Found:** Crusher audit (unit 8), 2026-10-12. Probe: Node, real module + guard-fixture.

**Evidence:** [crusher-features.mjs](../../ak5e/scripts/crusher-features.mjs#L81) decides "heavy" from the D&D5e `hvy` property. AK5e has no Heavy property: "Heavy Melee Weapons" is a category ([04_chapter_4_equipment.txt](../../AK5e_1.3.1_Foundry_Source/04_chapter_4_equipment.txt#L83): Greataxe, Greatsword, Heavy Hammer, Polearm). The module's Greatsword has `properties: ["two"]`, `type: simpleM` ([chapter-four-content.mjs](../../ak5e/scripts/chapter-four-content.mjs#L522)); the category survives only in `flags.ak5e.tableData.category` ([ak5e.mjs](../../ak5e/scripts/ak5e.mjs#L1177)), which Crusher never reads. `actionType` does not exist on dnd5e 5.x items, so `!actionType` makes any `hvy` weapon qualify, ranged included. In the hook, `roll.formula` ([L307](../../ak5e/scripts/crusher-features.mjs#L307)) is not a field of a dnd5e roll config (it has `parts`); the die comes from `item.system.damage.base.formula` or silently falls back to `1d10`.

**Reproduce:** Probe: module Greatsword and Polearm give `isHeavyMeleeWeapon` false and `crusherPreRollDamage` leaves `["2d6"]` unchanged (Heavy Metal never applies). A 5e `hvy` Heavy Crossbow (martialR) gives true and `["2d10","1d10"]`. An `hvy` melee d12 weapon with no readable base formula gets `1d10` added. The test fixture invents an `hvy` greatsword, so the suite passes.

**Verification limits:** Node only; the dnd5e roll-config shape and `DamageData.formula` are from static knowledge, not a live V13 roll.

**Fixed means:** Heavy Metal applies to exactly the four Heavy Melee Weapons (category flag or equivalent), never to ranged weapons, and adds one die of the weapon's own die size; tests use real module weapon data. Related: Duellist uses the same `hvy` test (duellist-features.mjs#L38, another unit).
