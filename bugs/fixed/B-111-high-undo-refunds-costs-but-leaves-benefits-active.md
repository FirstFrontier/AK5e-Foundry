# B-111 · High · Undo refunds costs but leaves benefits active

Area: Marksman, Anti-Air and Artilleryman
Context: repaired in the working tree 2026-10-11. `ak5e/MARKSMAN_FIXES.md` records the repair, manual procedure and verification limit. The text below preserves the original audit evidence and pre-fix behaviour; no class certification is implied.

**B-111 (fixed 2026-10-11) · High · Undo refunds costs but leaves benefits active.**
`play-uses.mjs:343–352` has no snapshot/cleanup for Marksman plan flag updates.
Engine probes leave Target Lock, Last Option and munitions active with uses
refunded. Record/restore every changed flag and review later conflicts.
