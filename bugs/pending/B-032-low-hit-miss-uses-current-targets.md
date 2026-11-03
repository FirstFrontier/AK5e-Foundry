# B-032 · Low · Hit/miss uses current targets

Area: SI-3 trigger events

**B-032 · Low · Hit/miss uses current targets.** Hits are computed from the user's targets and
their AC at `postRollAttack` time, not the targets dnd5e stored on the message.

**Update (2026-10-12):** `postRollAttack` now takes targets/ACs from dnd5e's message snapshot (`roll.parent.flags.dnd5e.targets`), else the rolled AC (`roll.options.target`) for a single target (`attackTargets` in `trigger-events.mjs`, tests in `trigger-events.test.mjs`). Node-verified against dnd5e.mjs source only. **Still open until** a live attack confirms `roll.parent` is the chat message at hook time; legacy formula attacks with several targets still use current targets.
