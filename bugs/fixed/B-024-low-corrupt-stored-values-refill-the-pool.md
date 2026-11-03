# B-024 · Low · Corrupt stored values refill the pool

Area: SI-2 resource pools

**B-024 · Low · Corrupt stored values refill the pool.** A float, negative or string stored
`value` silently falls back to the initial/max value on read. Surface it instead of masking it.

**Resolution (fixed 2026-10-12, 0.5.6):** `snapshot()` now returns `corrupt` (a stored value that is present but not a non-negative integer; `undefined` is fresh, `null` is corrupt). `getPool` exposes it; `spendPool`/`refundPool`/`setPool`/`recoverPool` emit one `console.warn` per corrupt pool per call and the following write repairs the record even when the fallback equals the result. `caster-branches.test.mjs` updated for the new `corrupt: false` field. Tests in `resource-pools.test.mjs`.
