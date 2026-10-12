# B-084 · Low · Setup re-enables a Legendary Might effect the GM disabled

Area: Defender, Dreadnought and Artshield

**B-084 (fixed 2026-10-10, 0.5.1) · Low · Setup re-enables a Legendary Might effect the GM disabled.**
`dreadnought-features.mjs:58` passes `disabled: false` and `defender-setup.mjs:35` writes it on
every setup, contradicting "an edited managed effect is kept". Static review; not reproduced.
**Resolution:** Already fixed by B-F09; current regression verifies a manual Legendary Might disable is preserved and a module disable restored.
