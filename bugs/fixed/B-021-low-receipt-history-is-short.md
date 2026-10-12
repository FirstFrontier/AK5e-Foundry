# B-021 · Low · Receipt history is short

Area: SI-2 resource pools

**B-021 · Low · Receipt history is short.** Receipts are capped at 24 per pool and shared by
all event types, so a pool with turn-start and turn-end triggers keeps about 12 rounds. An
old event replayed after eviction (GM stepping back, initiative reroll) regrants.

**Resolution (fixed 2026-10-12, 0.5.6):** `addReceipt`/`receiptKind` in `ak5e/scripts/resource-pools.mjs` now trim receipts per event kind (key text before the first ":"), keeping the newest 24 of each, so a busy kind cannot evict another's history. Stored shape is unchanged. Tests in `ak5e/test/resource-pools.test.mjs` (30 turnStart + 30 turnEnd keep 24 each; evicted keys regrant).
