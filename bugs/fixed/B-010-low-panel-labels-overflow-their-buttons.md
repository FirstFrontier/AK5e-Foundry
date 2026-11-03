# B-010 · Low · Panel labels overflow their buttons

Area: Standard Bearer UI

**B-010 (fixed 2026-10-10, 0.5.1) · Low · Panel labels overflow their buttons.** In the Standard Bearer dialog the labels
"Preview standard setup", "Hand the Standard to a willing creature within 5 feet" and
"Additional Tip: confirm a qualifying Skill Point gain" spill out of their button boxes
(screenshot reviewed 2026-10-10). Fix in `styles/standard-bearer.css` (allow wrapping/min-height)
or shorten the strings in `standard-bearer-sheet.mjs` `text()`.
**Resolution:** Buttons grow vertically and wrap labels. GM/player screenshots were reviewed, and every panel label passed the rendered bounds check in runs 3 and 4.
