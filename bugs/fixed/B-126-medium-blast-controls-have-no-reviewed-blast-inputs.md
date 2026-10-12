# B-126 · Medium · Blast controls have no reviewed blast inputs

Area: Marksman, Anti-Air and Artilleryman
Context: repaired in the working tree 2026-10-11. `ak5e/MARKSMAN_FIXES.md` records the repair, manual procedure and verification limit. The text below preserves the original audit evidence and pre-fix behaviour; no class certification is implied.

**B-126 (fixed 2026-10-11) · Medium · Blast controls have no reviewed blast inputs.**
Artilleryman lines 100–166 default deployment to `{x:0,y:0}` and secondary
damage to 0; sheet supplies neither. Weapon/Splash origin, automatic ten-minute
detonation, disarm, saves, no-chaining and Scatter/collision resolution are
missing. Add guided inputs/resolution or explicit complete manual boundaries.
