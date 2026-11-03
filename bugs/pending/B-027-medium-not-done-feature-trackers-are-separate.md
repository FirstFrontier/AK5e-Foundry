# B-027 · Medium · Not done: feature trackers are separate

Area: SI-2 resource pools

**B-027 · Medium · Not done: feature trackers are separate.** `feature-trackers.mjs` still
computes maxima by string equality (`@prof`, one tier formula) and silently drops a tracker
whose formula it does not recognise (`Number.isFinite` check, ~L164). Migrating consumers onto
pools was deliberately deferred (flags and native `system.uses` data).
