# B-037 · Low · Two interpretations of turn events coexist

Area: SI-3 trigger events

**B-037 · Low · Two interpretations of turn events coexist.** `trigger-events.mjs`
(`combatTurnChange`) and `resource-pools.mjs` (`updateCombat` + `combat.previous/current`)
each derive turn start/end independently. Pick one source of truth when the Reaction budget is
moved onto an SI-2 pool.
