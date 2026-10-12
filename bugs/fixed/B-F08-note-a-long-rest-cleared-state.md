# B-F08 · note · A Long Rest cleared `state

**B-F08 (2026-10-10, fixes B-082)** A Long Rest cleared `state.barrier` before the Artshield rest
handler ran, so the Eye of the Storm template stayed on the map. Branch rest handlers now run
first (`defender-features.mjs` `defenderRest`); test "a Long Rest removes the Eye of the Storm
template from the map".
