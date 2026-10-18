# B-193 · Low · Unverified: Unrelenting Aggression falls back to an invented 1d8

Area: Guard core plans (`guard-uses.mjs`, `unrelentingAggression`)

**Found:** Guard unit 04 (sheet audit and code review), 2026-10-18.

**Evidence:** [Source](../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L1941): "roll the Damage for that Attack, but do not add your Ability Score Modifier". The plan uses `String(data.formula ?? "1d8")`, a die the source does not give. The sheet now asks for the weapon's damage dice (prefilled from an equipped weapon's `system.damage.base` when present) and sends `formula` only when the player typed one, so a blank field reaches the plan as "no formula".

**Verification limits:** static review and Node tests of the sheet; the plan itself was not changed (not this unit's file).

**Fixed means:** The plan requires a typed formula (or warns and lets the player choose "Use anyway" with a stated default) instead of silently rolling 1d8; the card shows the dice actually used.
