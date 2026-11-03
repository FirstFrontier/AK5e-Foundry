# B-022 · Low · Recovery list order matters

Area: SI-2 resource pools

**B-022 · Low · Recovery list order matters.** Only the first matching entry applies and a long
rest matches `lr` then `sr`; a pool defined `[{sr:+2},{lr:full}]` gets only +2 on a long rest.
Make `definePool` reject or reorder ambiguous lists, or apply all matching entries.

**Resolution (fixed 2026-10-12, 0.5.6):** `recoverPool` picks the recovery entry by the caller's trigger order, so a long rest (`['lr','sr']`) applies an `lr` entry before an `sr` entry whatever order the pool lists them. Within one trigger the first entry whose `when` passes wins. Logged in `ak5e/DECISIONS.md`. Tests: the `[sr +2, lr full]` pool on a long rest, a short rest, and the `when` fall-through.
