# B-117 · High · Target Lock never expires; retarget loses its duration

Area: Marksman, Anti-Air and Artilleryman
Context: repaired in the working tree 2026-10-11. `ak5e/MARKSMAN_FIXES.md` records the repair, manual procedure and verification limit. The text below preserves the original audit evidence and pre-fix behaviour; no class certification is implied.

**B-117 (fixed 2026-10-11) · High · Target Lock never expires; retarget loses its duration.**
`marksman-uses.mjs:65` and `marksman-rules.mjs:197` do not enforce C3:3648's
minute. `anti-air-features.mjs:113` replaces the lock without retaining expiry
or warning on the dead-target prerequisite (C3:3889). Preserve and test expiry.
