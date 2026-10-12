# B-129 · High · Unverified: Guard uses skip confirmation

Area: Guard sheet / all three subclasses

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L457) passes confirmed=true directly; [play-uses-sheet.mjs](../../ak5e/scripts/play-uses-sheet.mjs#L19) opens a dialog only for warnings/readings. [WORKFLOW §3.2](../../WORKFLOW.md) requires confirmation before every feature use.

**Reproduce:** Click Body Check with sufficient Aggression. The prior in-memory sheet probe opened only Guard Controls and reduced Aggression from 4 to 3.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** A normal use displays cost, targets and warnings before changes; Cancel writes nothing. Player checks/saves keep their native no-extra-confirm behavior.
