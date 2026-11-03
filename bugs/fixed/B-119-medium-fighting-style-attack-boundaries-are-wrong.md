# B-119 · Medium · Fighting Style attack boundaries are wrong

Area: Marksman, Anti-Air and Artilleryman
Context: repaired in the working tree 2026-10-11. `ak5e/MARKSMAN_FIXES.md` records the repair, manual procedure and verification limit. The text below preserves the original audit evidence and pre-fix behaviour; no class certification is implied.

**B-119 (fixed 2026-10-11) · Medium · Fighting Style attack boundaries are wrong.**
`marksman-features.mjs:144–149` expands Deadly Fighter's crit range on every
roll, not the first each Turn (C3:3628). Close and Personal leaves disadvantage
set when advantage is already true (134–139). Test repeated/opposing flags;
unrelated-disadvantage wording remains an explicit interpretation question.
