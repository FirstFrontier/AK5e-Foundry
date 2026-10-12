# B-031 · Medium · Kill detection misses direct HP edits

Area: SI-3 trigger events

**B-031 · Medium · Kill detection misses direct HP edits.** `kill` is derived from
`dnd5e.applyDamage` only; HP changed on the sheet, by macro or by a healing/effect path is not
seen. Also: no events when no GM is online; chat attacks without an activity have no actor.
