# B-128 · Medium · Receipt-write failure strands a spent Reaction

Area: Marksman, Anti-Air and Artilleryman
Context: repaired in the working tree 2026-10-11. `ak5e/MARKSMAN_FIXES.md` records the repair, manual procedure and verification limit. The text below preserves the original audit evidence and pre-fix behaviour; no class certification is implied.

**B-128 (fixed 2026-10-11) · Medium · Receipt-write failure strands a spent Reaction.**
Artilleryman line 137 spends before `play-uses.mjs:265–268` saves the use.
Fault injection leaves Reaction 0, active munition and no undo receipt.
Persist prepared state before side effects; test retry/rollback without a
double spend. This is a confirmed mocked failure, not a live Foundry incident.
