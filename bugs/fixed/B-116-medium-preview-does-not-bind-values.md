# B-116 · Medium · Preview does not bind values

Area: Marksman, Anti-Air and Artilleryman
Context: repaired in the working tree 2026-10-11. `ak5e/MARKSMAN_FIXES.md` records the repair, manual procedure and verification limit. The text below preserves the original audit evidence and pre-fix behaviour; no class certification is implied.

**B-116 (fixed 2026-10-11) · Medium · Preview does not bind values.** Progression line 170
hashes only update names; a +1 STR preview key accepts +2 STR at apply.
ASI budgets/three allowed skill picks lack warnings. Bind full values and
source choices; reject malformed data, warn on legal table-rule overrides.
