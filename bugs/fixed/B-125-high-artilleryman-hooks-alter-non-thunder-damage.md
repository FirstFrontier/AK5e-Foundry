# B-125 · High · Artilleryman hooks alter non-Thunder damage

Area: Marksman, Anti-Air and Artilleryman
Context: repaired in the working tree 2026-10-11. `ak5e/MARKSMAN_FIXES.md` records the repair, manual procedure and verification limit. The text below preserves the original audit evidence and pre-fix behaviour; no class certification is implied.

**B-125 (fixed 2026-10-11) · High · Artilleryman hooks alter non-Thunder damage.**
`artilleryman-features.mjs:209–230` never checks damage type for extra dice or
vehicle/structure multiplier. A Piercing Splash mock receives +3d6; a Piercing
vehicle roll gets multiply 2. Scope per actual Thunder component/recipient.
