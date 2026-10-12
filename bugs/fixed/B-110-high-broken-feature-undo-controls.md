# B-110 · High · Broken feature/Undo controls

Area: Marksman, Anti-Air and Artilleryman
Context: repaired in the working tree 2026-10-11. `ak5e/MARKSMAN_FIXES.md` records the repair, manual procedure and verification limit. The text below preserves the original audit evidence and pre-fix behaviour; no class certification is implied.

**B-110 (fixed 2026-10-11) · High · Broken feature/Undo controls.** `marksman-sheet.mjs:463`
passes an engine object instead of `confirmPlayUse`'s callback; line 443
reverses Undo helper arguments. Probes throw `attempt is not a function` and
`engine.uses is not a function`. Fix the interfaces and exercise real clicks
with confirm/cancel as both owner and GM.
