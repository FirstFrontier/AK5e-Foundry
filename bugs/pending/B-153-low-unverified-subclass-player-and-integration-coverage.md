# B-153 · Low · Unverified: Subclass player and integration coverage is insufficient

Area: Artsblade, Brawler and Centurion / validation evidence

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [test-guard-live.mjs](../../ak5e/tools/test-guard-live.mjs#L58) joins only Gamemaster and manually creates/configures Actors; [test-guard-live.mjs](../../ak5e/tools/test-guard-live.mjs#L281) opens Centurion controls without exercising a feature. The prior audit ran 58 Guard tests (22 subclass tests), all passing despite B-129–B-152.

**Reproduce:** Review the live script and the existing /tmp/ak5e-guard-live/report.json/screenshots. Historical images were viewed by the audit validator; no fresh live run, clean-pack import, player relay or restart test was performed.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** Add source-derived behavioral coverage for the tickets and exercise safe clean-World pack imports, real GM/player clicks, cancel/override, owner dice/saves, relay/undo, encounter locks and reload/restart. Use the sanctioned browser launcher and actually inspect images.
