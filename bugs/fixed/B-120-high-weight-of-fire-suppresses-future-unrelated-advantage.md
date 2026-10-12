# B-120 · High · Weight of Fire suppresses future unrelated advantage

Area: Marksman, Anti-Air and Artilleryman
Context: repaired in the working tree 2026-10-11. `ak5e/MARKSMAN_FIXES.md` records the repair, manual procedure and verification limit. The text below preserves the original audit evidence and pre-fix behaviour; no class certification is implied.

**B-120 (fixed 2026-10-11) · High · Weight of Fire suppresses future unrelated advantage.**
Anti-Air lines 90/305–307 set/read a permanent flag, never consume/reset it,
and narrate rather than expose the repeat attack. A later melee roll also
loses advantage. Scope to one chosen ranged Attack Action roll and track use.
