# B-226 · Low · Unverified: AUTOMATION_AUDIT.md is stale, so npm run test:automation fails

Area: Tooling / ak5e/tools/audit-automation.mjs

**Found:** Guard audit unit 07 (Centurion), Sonnet 5.5, 2026-10-18; run on the untouched `audit/guard-baseline` (d4b92b2) and again with unit 07's changes.

**Evidence:** `npm run test:automation` ends with `AUTOMATION_AUDIT.md is stale; run node ak5e/tools/audit-automation.mjs --write.` (audit-automation.mjs L298). It fails identically with the unit 07 changes stashed, so it is not caused by them. It is outside `npm run test:guard` and `npm run check:files`, so the Guard unit runs do not catch it.

**Fixed means:** The audit document is regenerated with `--write` by whoever owns it (after the Guard units merge, since they change the scanned scripts), and `npm run test:automation` passes.
