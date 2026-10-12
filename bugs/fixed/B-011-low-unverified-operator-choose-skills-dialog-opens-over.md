# B-011 · Low · Unverified: Operator "Choose Skills" dialog opens over the Vanguard sheet

Area: Standard Bearer UI

**B-011 · Low · Unverified: Operator "Choose Skills" dialog opens over the Vanguard sheet.**
Opening the test Vanguard's sheet showed the "Choose Skills" dialog on top of it. This is
probably intended for an Actor with unchosen tiers; confirm it is not triggered for a class
that has no Operator Skill choices to make.

**Resolution (fixed 2026-10-12, 0.5.6):** No defect. Live check on a Vanguard + Standard Bearer fixture: no dialog at class level 1; dialog at level 2 (Basic) and level 17 (Basic/Advanced/Elite) with no Skills learned; no dialog after all three are learned. Matches `getOperatorSkillChoices`, now pinned by a test in `operator-progression.test.mjs`. GM view only; the player-owner path was not rendered.
