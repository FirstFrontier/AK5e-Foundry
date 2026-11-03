# B-124 · Medium · Unapproachable lacks trigger/repeat warnings

Area: Marksman, Anti-Air and Artilleryman
Context: repaired in the working tree 2026-10-11. `ak5e/MARKSMAN_FIXES.md` records the repair, manual procedure and verification limit. The text below preserves the original audit evidence and pre-fix behaviour; no class certification is implied.

**B-124 (fixed 2026-10-11) · Medium · Unapproachable lacks trigger/repeat warnings.**
Anti-Air lines 220–255 check Reaction/level only, omitting weapon normal range,
movement/hostility and same-Creature-per-Turn facts (C3:3919). Attack/movement
are narrative. Add warnings and owner-operated resolution without turn gates.
