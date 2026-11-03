# B-118 · High · Initiative recovery does not restore actual uses

Area: Marksman, Anti-Air and Artilleryman
Context: repaired in the working tree 2026-10-11. `ak5e/MARKSMAN_FIXES.md` records the repair, manual procedure and verification limit. The text below preserves the original audit evidence and pre-fix behaviour; no class certification is implied.

**B-118 (fixed 2026-10-11) · High · Initiative recovery does not restore actual uses.**
`marksman-features.mjs:180` mistakes an event for its `raw.actor`; Anti-Air
line 319 writes `pools` instead of `resourcePools`. Event mocks leave both
canonical pools at 0. Use canonical receipt-aware recovery and test payloads.
