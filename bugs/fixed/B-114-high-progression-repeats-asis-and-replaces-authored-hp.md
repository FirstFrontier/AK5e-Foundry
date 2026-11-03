# B-114 · High · Progression repeats ASIs and replaces authored HP

Area: Marksman, Anti-Air and Artilleryman
Context: repaired in the working tree 2026-10-11. `ak5e/MARKSMAN_FIXES.md` records the repair, manual procedure and verification limit. The text below preserves the original audit evidence and pre-fix behaviour; no class certification is implied.

**B-114 (fixed 2026-10-11) · High · Progression repeats ASIs and replaces authored HP.**
`marksman-progression.mjs:106–122,156–163` recomputes whole HP and reapplies ASIs
to current abilities. A level-4 probe changes STR 12→14, then previews 16 for
the same choices, and replaces max HP 100 with 31. Track contributions and
already-included choices; preserve Tough/other authored HP and test reapply.
