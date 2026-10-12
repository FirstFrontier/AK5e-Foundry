# B-F10 · note · Defender state was saved as one object, so a stale copy could
  overwrite a key another client had changed

**B-F10 (2026-10-10, fixes B-085)** Defender state was saved as one object, so a stale copy could
overwrite a key another client had changed. `writeDefenderState` now writes only the leaves a
state object changed (`stateChanges` in `defender-rules.mjs`), including `-=` deletions, and skips
empty writes. Cross-client writes to the same leaf are still last-writer-wins.
