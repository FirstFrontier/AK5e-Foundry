# B-023 · Low · Rest dedupe falls back to `config` identity

Area: SI-2 resource pools

**B-023 · Low · Rest dedupe falls back to `config` identity.** `seenRests` is a `WeakSet` keyed
by the rest `result` object, or `config` if `result` is not an object. dnd5e always passes a
fresh `result`, so this is latent; numeric `+n` rest recoveries have no `eventKey` receipt.

**Resolution (fixed 2026-10-12, 0.5.6):** `onRestCompleted` dedupes on the `result` object only; the `config` fallback is gone, so a reused config no longer suppresses a second rest. A non-object result is processed without dedupe. Accepted limit: numeric `+n` rest recoveries still have no `eventKey` receipt (dnd5e passes a fresh result per rest and fires the hook on the resting client only). Tests in `resource-pools.test.mjs`.
