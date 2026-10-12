# B-080 · Medium · "Standard Bearer state could not be saved" on every refresh with an unchanged
  state

Area: Defender, Dreadnought and Artshield

**B-080 (fixed 2026-10-10, 0.5.1) · Medium · "Standard Bearer state could not be saved" on every refresh with an unchanged
state.** Seen 7 times (plus UI toasts) during the Defender live run, from `saveState`
(`operation-kernel.mjs:67-70`) called by `refreshStandard` (`standard-bearer.mjs:~472`) for a
leftover "Standard Bearer test" Actor in the cloned World when tokens move or combat changes.
Suspected cause (not reproduced in isolation): `actor.update` of an identical flag returns a
falsy value and `need(result)` throws. Fixed when an unchanged save is a no-op, not an error.
**Resolution:** The kernel compares nested state by value, skips unchanged writes, and accepts an undefined result only if requested state persisted. Real Foundry returned undefined for an unchanged write; repeated kernel saves made zero writes. Standard Bearer runs 3/4/restart and all 18 Defender checks passed without this error.
