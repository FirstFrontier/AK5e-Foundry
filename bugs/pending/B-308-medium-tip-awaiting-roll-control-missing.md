# B-308 · Medium · Tip awaiting-roll card may omit its Roll control
Area: Vanguard — Tip of the Spear

**Found:** Fresh Foundry V13 Build 351 / D&D5e 5.3.3 private-World recheck after V0 merge (2026-10-31). An owner-controlled player selected a visible, in-range ally and created an `awaitingRoll` Tip receipt. The public card said “Click Roll to determine the outcome” but exposed no Roll button; no d6, outcome or benefit was produced. The pending use was undone without changing HP or effects. The validator reported no console errors and captured no screenshot.

An earlier V0 Foundry run successfully exposed and used the explicit d6 control, so this symptom is inconsistent and needs reproduction across the card-render lifecycle and owner context. Tip outcome 1 and its Longsword damage modifier/consumption receipt remain unverified.

**Fixed means:** an owner with an `awaitingRoll` Tip receipt can see and use the explicit Roll control (or the card clearly presents the valid guided procedure); confirmation and cancellation preserve player agency, and a confirmed roll resolves the selected outcome and records an undoable receipt without auto-rolling.
