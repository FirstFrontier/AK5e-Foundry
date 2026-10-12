# B-113 · High · Artilleryman setup loses every feature's rules

Area: Marksman, Anti-Air and Artilleryman
Context: repaired in the working tree 2026-10-11. `ak5e/MARKSMAN_FIXES.md` records the repair, manual procedure and verification limit. The text below preserves the original audit evidence and pre-fix behaviour; no class certification is implied.

**B-113 (fixed 2026-10-11) · High · Artilleryman setup loses every feature's rules.**
`marksman-setup.mjs:36–42` uses `class-feature-*` instead of the six generated
`subclass-feature-*` IDs. A level-18 preview emits six placeholder descriptions.
Correct source lookup and safely repair existing placeholders without erasing
authored changes or casually replacing source IDs.
