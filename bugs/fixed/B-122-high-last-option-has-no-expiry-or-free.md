# B-122 · High · Last Option has no expiry or free-use Turn reset

Area: Marksman, Anti-Air and Artilleryman
Context: repaired in the working tree 2026-10-11. `ak5e/MARKSMAN_FIXES.md` records the repair, manual procedure and verification limit. The text below preserves the original audit evidence and pre-fix behaviour; no class certification is implied.

**B-122 (fixed 2026-10-11) · High · Last Option has no expiry or free-use Turn reset.**
Anti-Air lines 136–137/164/275–276 retain booleans indefinitely. Only its first
free Option is free; extra attack is narrative. Track the source minute and
own-Turn allowance, expose owner attacks/manual boundary, test next Turn.
