# B-026 · Low · Test adequacy

Area: SI-2 resource pools

**B-026 · Low · Test adequacy.** Hook tests depend on a 15 ms `settle()`; the Doublecast test
asserts a bare `lr` trigger does not refill an SR-only pool (a quirk of the rest split, not a real
long rest); no test covers a real long rest on Doublecast.

**Resolution (fixed 2026-10-12, 0.5.6):** Tests only. The fixed 15 ms `settle()` timer is removed from `resource-pools.test.mjs`: `fire()` awaits the handlers' promises and a `setImmediate` `flush()` replaces it elsewhere. The Doublecast test is reworded (a bare `lr` does not refill an SR-only pool) and a new test runs a real long rest through `dnd5e.restCompleted`, which refills Doublecast via the `sr` entry. Five consecutive green runs.
