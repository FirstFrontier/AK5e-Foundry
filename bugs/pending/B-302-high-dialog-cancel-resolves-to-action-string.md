# B-302 · High · Dialog Cancel resolves to the action string and continues

Area: dialogs (play-use confirm, readings, undo) and every other DialogV2 Cancel that returns null

**Found:** head review of U10 "Cancel must cancel" (2026-10-24), read against
`/home/patch/FoundryV13/client/applications/api/dialog.mjs` (~L242).

**Mechanism:** `DialogV2._onSubmit` does `const result = (await button?.callback?.(event, target, this)) ?? button?.action;`.
A Cancel whose callback returns `null` or `undefined` therefore resolves `DialogV2.wait` to the string `"cancel"`,
which is truthy. Callers that test `if (!result) return` then continue. A Cancel button with no callback resolves to
its action name in the same way.

**Evidence:** `ak5e/test/play-uses-cancel.test.mjs` (U10) emulates this resolution. Against the pre-fix
`play-uses-sheet.mjs` (`callback: () => null`), 10 of 21 tests fail: the warnings Cancel reruns the use with
overrides, the readings Cancel resubmits with reading `"cancel"`, and the undo list resubmits with useId `"choose"`.

**Fixed in U10 (Supporter branch):** `ak5e/scripts/play-uses-sheet.mjs` (Cancel callbacks return `false`, checks are
strict). The Supporter files already return `false`.

**Still open (not fixed here), `callback: () => null` or Cancel with no callback:**
- `ak5e/scripts/caster-sheet.mjs`: 194, 247, 273, 439, 584, 600, 610, 628, 634, 646, 647, 658, 691, 724, 754 (the file
  has a comment at 179 showing awareness). 634 and 658 also use `value || null`, which resolves a blank submit to the
  action name.
- `ak5e/scripts/marksman-sheet.mjs:111`; `ak5e/scripts/marksman-resolution.mjs:375`
- `ak5e/scripts/marksman-progression-sheet.mjs:45, 64`; `ak5e/scripts/defender-progression-sheet.mjs:52, 63`
- `ak5e/scripts/guardian-sheet.mjs:40`; `ak5e/scripts/operator-sheet.mjs:69`
- `ak5e/scripts/standard-bearer-sheet.mjs:163, 232, 256`
- `ak5e/scripts/world-rules.mjs:88, 376, 421`
- Cancel with no callback: `ak5e/scripts/arts-casting.mjs:515, 531, 546, 570`;
  `ak5e/scripts/sheet-themes.mjs:100`; `ak5e/scripts/origin-setup.mjs:296` (its caller checks `result === "cancel"`,
  so it is handled there).

**Fixed means:** every Cancel, close and "skip" path in the listed files resolves to a falsy non-action value
(`callback: () => false`), and each caller accepts only an explicit success value. A node test emulating
`(await callback()) ?? action` covers each dialog.
