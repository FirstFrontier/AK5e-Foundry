# B-131 · Medium · Unverified: Guard setup button omits the required preview key

Area: Guard setup / all three subclasses

**Found:** Codex Artsblade/Centurion/Brawler audit, 2026-10-12.

**Evidence:** [guard-sheet.mjs](../../ak5e/scripts/guard-sheet.mjs#L220) calls applyGuardSetup without contextKey; [guard-setup.mjs](../../ak5e/scripts/guard-setup.mjs#L92) requires the preview key.

**Reproduce:** Open an unconfigured Guard and click Grant Core Guard Features. The prior Node probe returned the changed-character error before granting features.

**Verification limits:** Recorded from the prior audit's Node probes and/or static review; no new runtime tests or fresh Foundry reproduction in this tracking change. Historical screenshots alone do not certify player behavior.

**Fixed means:** The sheet previews setup, shows its changes, and passes the accepted current key. Cancel changes nothing; repeated setup preserves existing Items.

**Resolution (fixed 2026-10-18, unreleased):** `ak5e/scripts/guard-sheet.mjs` `confirmGuardSetup`: the setup button calls
`previewGuardSetup`, lists the features it will add and those already present, and on Grant calls `applyGuardSetup` with the
preview's `contextKey`. Cancel (button or close) changes nothing; a Cancel press resolves to the action id "cancel", so only an
explicit `true` accepts. Re-running keeps existing Items. Tests: `ak5e/test/guard-sheet.test.mjs` ("B-131" cases, including a
character that changes between preview and Grant).
