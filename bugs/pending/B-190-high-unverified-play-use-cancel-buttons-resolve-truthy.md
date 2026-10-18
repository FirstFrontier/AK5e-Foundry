# B-190 · High · Unverified: Cancel on warning, reading and undo dialogs resolves to a truthy value

Area: play-uses-sheet.mjs (shared by Guard, Defender, Marksman and other play-use sheets)

**Found:** Guard unit 04 (sheet audit), 2026-10-18, by reading Foundry V13 `client/applications/api/dialog.mjs` L242 and a live run.

**Evidence:** DialogV2 resolves a pressed button to `(await button.callback?.(...)) ?? button.action`, so a Cancel button whose callback is `() => null` resolves to the string `"cancel"`. [play-uses-sheet.mjs](../../ak5e/scripts/play-uses-sheet.mjs) builds Cancel buttons that way in `confirmPlayUse` (warnings: `if (!accepted) return null`; readings: `if (!reading) return null`), `openPlayUndo` (`if (!accepted) return null`) and `openPlayUndoList` (`useId`), and tests the result with a plain truthiness check. `"cancel"` is truthy, so Cancel is read as acceptance.

**Reproduce:** Guard with 1 Aggression, Smite for 3, press Cancel on the "check before use" dialog. Observed live (Foundry V13, 2026-10-18): Aggression went 1 to 0, a second receipt was recorded and the card posted, as if "Use anyway" had been pressed. The reading, Undo review and Undo list dialogs use the same `callback: () => null` pattern and were not each clicked live (static finding only).

**Fixed means:** Cancel (button, Escape or close) on every confirm-loop, reading, undo review and undo-list dialog returns without a write; test with a DialogV2 mock that applies the `?? button.action` rule. Marksman and other sheets using the same `{ action: "cancel", callback: () => null }` pattern are checked too.
