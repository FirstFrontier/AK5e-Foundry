# B-085 · Low · Concurrent writes can revert Dreadnought Advance watch flags

Area: Defender, Dreadnought and Artshield

**B-085 (fixed 2026-10-10, 0.5.1) · Low · Concurrent writes can revert Dreadnought Advance watch flags.** `persist`
(`defender-features.mjs:114`) writes the whole `flags.ak5e.defender` object while the GM client
writes `advance.watch.*` by dotted path (`dreadnought-features.mjs:175,196`); `serial()` is per
client. The GM reinstate command recovers. Static review.
**Resolution:** Already fixed by B-F10; changed-leaf writes avoid stale sibling overwrites. Concurrent writes to the same leaf still remain last-writer-wins.
