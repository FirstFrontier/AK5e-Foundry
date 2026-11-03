# B-041 · Medium · Unverified: dice-rule adapter on critical hits

Area: SI-4 damage pipeline and Standard Bearer wiring

**B-041 · Medium · Unverified: dice-rule adapter on critical hits.** It is not known whether
dnd5e's critical-hit dice configuration keeps the modifiers appended by
`applyDiceRulesToRolls`. The maximise adapter uses `min{faces}` because `options.maximize` has no
effect at `postDamageRollConfiguration`; explosions are refused on rolls with several dice terms.
