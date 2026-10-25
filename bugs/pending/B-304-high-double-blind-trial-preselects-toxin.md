# B-304 · High · Double-Blind Trial preselects its toxin before the clicked roll

Area: Specialist / Infuser

Found by the adversarial Luna pair and verified by parent source/code inspection, 2026-10-25.

Evidence: `specialist-uses.mjs` selects `rolledToxin ?? rollResult ?? 1` during apply, before the displayed d6 is rolled. No resolver links that roll to the weapon's toxin.

Reproduce: use Double-Blind Trial from the sheet and roll its card. The preselected result remains result 1.

**Fixed means:** the owner's clicked d6 determines the printed Chapter 3 table result, persisted before a bounded weapon operation. Spending, repeated clicks, interrupted writes and undo are idempotent. No client-supplied result silently replaces the roll.
