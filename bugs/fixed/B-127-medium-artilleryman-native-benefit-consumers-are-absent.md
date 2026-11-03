# B-127 · Medium · Artilleryman native benefit consumers are absent

Area: Marksman, Anti-Air and Artilleryman
Context: repaired in the working tree 2026-10-11. `ak5e/MARKSMAN_FIXES.md` records the repair, manual procedure and verification limit. The text below preserves the original audit evidence and pre-fix behaviour; no class certification is implied.

**B-127 (fixed 2026-10-11) · Medium · Artilleryman native benefit consumers are absent.**
`artillerymanSplashDC` only supplies a displayed/public calculation; no native
trap/Splash DC path reads it. X doubling, removing Loading, Thunder resistance
and self-damage immunity are not implemented. Integrate faithfully or label
them manual; no source trap base DC is invented.
