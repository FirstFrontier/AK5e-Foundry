# B-191 · Medium · Unverified: Force of Will commits Will Attunement before Force of Will itself is confirmed

Area: Lord / Guard sheet (`guard-sheet.mjs`, `forceOfWill` branch)

**Found:** Guard unit 04 (sheet audit) and its code review, 2026-10-18.

**Evidence:** When the chosen element group differs from the current attunement, the sheet runs the separate `willAttunement` use (a 10-minute ritual, Ch.3 Lord) first and only then runs `forceOfWill`. Before unit 04 that first call bypassed the warning loop entirely; it now goes through the Force of Will confirm dialog and `confirmPlayUse`, but the attunement is still committed before the Force of Will use has passed its own "check before use" step. Cancelling there leaves the attunement changed and a second receipt in the undo list.

**Verification limits:** static review and Node tests only; Lord rules and plans (`lord-features.mjs`) were not audited in this unit.

**Fixed means:** One confirm covers both steps, or the plan applies the attunement as part of the single Force of Will receipt so Cancel anywhere writes nothing and one Undo restores both. Whether the ritual belongs in this use at all is a Lord rules question for `ak5e/DECISIONS.md`.
