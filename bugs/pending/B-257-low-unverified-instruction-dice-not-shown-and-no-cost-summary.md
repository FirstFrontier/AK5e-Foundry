# B-257 · Low · Unverified: Instruction Dice and Breach counts are not shown, and the confirm step gives no cost summary

Area: Instructor / Guard Controls panel

**Found:** Guard audit unit 10 (Instructor), 2026-10-12. Static review.

**Evidence:** The Guard panel badge row ([guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L55)) has badges for Aggression, Unrelenting and every other branch's pool but none for `instructionDice` or `breach`; the strings occur nowhere in the sheet. The only visible hint is the button label "Issue Instruction (1 Die)" ([L147](../../ak5e/scripts/guard-sheet.mjs#L147)). With no warnings, [confirmPlayUse](../../ak5e/scripts/play-uses-sheet.mjs#L19) shows no summary of dice left, recipients or cost (see B-129, which this confirms for Breach and affects Instruction and Teach from Experience; not duplicated here). Rules: 4/5/6 dice and d6 -> d10 are correct ([guard-rules.mjs](../../ak5e/scripts/guard-rules.mjs#L30), [L110](../../ak5e/scripts/guard-rules.mjs#L110)).

**Reproduce:** Open Guard Controls for an Instructor: no "Instruction Dice n / max" or die size appears; cost is learned only when the warning fires at 0.

**Verification limits:** Static review; no rendered Foundry inspection (WORKFLOW §5.2).

**Fixed means:** The panel shows "Instruction Dice: n / max (dX)" and, from 17th, the Breach use; the confirm step for Instruction and Breach states dice left after the use, the recipients and the die size. Check the rendered panel in Foundry as a player.
