# B-038 · Low · Test mock gaps

Area: SI-3 trigger events

**B-038 · Low · Test mock gaps.** Reaction/rider tests now mimic Foundry's recursive flag merge,
but `tagged()` and effect creation are mocked in the Tip tests, so they pin option shapes, not
real Foundry effects.
