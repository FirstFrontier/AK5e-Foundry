# B-121 · Medium · A grounded flyer is treated as airborne

Area: Marksman, Anti-Air and Artilleryman
Context: repaired in the working tree 2026-10-11. `ak5e/MARKSMAN_FIXES.md` records the repair, manual procedure and verification limit. The text below preserves the original audit evidence and pre-fix behaviour; no class certification is implied.

**B-121 (fixed 2026-10-11) · Medium · A grounded flyer is treated as airborne.** Anti-Air
lines 66–70 infer airborne state from fly speed or absolute elevation.
The probe and existing test grant the bonus to a grounded fly-capable Actor.
Use reviewed actual airborne/last-Turn movement facts (C3:3887).
