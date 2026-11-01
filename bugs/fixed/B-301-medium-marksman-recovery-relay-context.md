# B-301 · Medium · Marksman recovery relay needs plain context data

Area: Marksman recovery coordination and Anti-Air initiative routing
Context: repaired in Milestone 1 on 2026-10-31. `marksman-uses.mjs` introduces `plainRecoveryContext(context)` which filters context objects to primitive scalar values (string, number, boolean, null) before passing into `coordinated(actor, "recover", ...)`, preventing `TypeError: Converting circular structure to JSON` and actor flag bloat when D&D5e rest hooks supply circular Document/App references. In `anti-air-features.mjs`, `antiAirRollInitiative` at 15th level now imports and routes Option Recharge through `recoverMarksmanPool(actor, "initiative", { poolIds: ["versatileApproach"], eventKey: event.eventId, context: { marksmanEvent: true, actorUuid: actor.uuid, combatantId: event.combatantId ?? null, combatUuid: event.combatUuid ?? null } })`, ensuring all resource mutations pass through the serial coordinator.

**B-301 (fixed 2026-10-31) · Medium · Marksman recovery relay needs plain context data.**
Forward only required plain context fields, route Anti-Air initiative through the coordinator, and verify rest/initiative recovery concurrent with spending without circular serialization or lost resource changes.

Verified by: `node --test ak5e/test/marksman-features.test.mjs` ("B-301: recoverMarksmanPool handles circular options.context without TypeError: Converting circular structure to JSON") and `node --test ak5e/test/anti-air.test.mjs` ("B-301: antiAirRollInitiative routes through recoverMarksmanPool and the serial coordinator").
