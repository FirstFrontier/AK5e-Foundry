# B-196 · Low · Unverified: Guard Controls inject unescaped Weaponmaster names into HTML

Area: Guard sheet / Weaponmaster summary and Detonate prompt

**Found:** Guard unit 04 (sheet audit), 2026-10-18.

**Evidence:** The summary badge printed `flags.ak5e.weaponmaster.signatureWeaponName` and the Detonate Judgement Cut prompt printed `judgementCut.targetName` into `innerHTML` without `esc()`. Both values come from item or target names a user can type, so a name containing markup rendered as HTML in the Guard dialog.

**Fixed means:** Every actor- or user-supplied string in the controls and prompts is escaped.

**Resolution (fixed 2026-10-18, unreleased):** `ak5e/scripts/guard-sheet.mjs` escapes both. Test: `ak5e/test/guard-sheet.test.mjs` ("summary text is escaped", uses a signature weapon named `<img src=x onerror=...>`).
