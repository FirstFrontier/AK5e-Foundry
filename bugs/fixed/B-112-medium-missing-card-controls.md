# B-112 · Medium · Missing card controls

Area: Marksman, Anti-Air and Artilleryman
Context: repaired in the working tree 2026-10-11. `ak5e/MARKSMAN_FIXES.md` records the repair, manual procedure and verification limit. The text below preserves the original audit evidence and pre-fix behaviour; no class certification is implied.

**B-112 (fixed 2026-10-11) · Medium · Missing card controls.** `marksman-sheet.mjs:471–485`
never registers the imported `renderPlayUseCard`. Direct API cards have no
shared Undo/Retry/Roll controls. Register and render-check owner visibility.
