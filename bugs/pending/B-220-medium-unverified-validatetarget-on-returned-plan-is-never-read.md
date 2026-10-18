# B-220 · Medium · Unverified: validateTarget placed on the returned plan is never read

Area: Shared use engine / Liberator and Crusher plans (GM relay for unowned targets)

**Found:** Guard audit unit 07 (Centurion), Sonnet 5.5, 2026-10-18; static review plus a Node probe.

**Evidence:** [play-uses.mjs](../../ak5e/scripts/play-uses.mjs#L207) reads `PLANS[receipt.command]?.validateTarget`, a property of the plan *function*. [liberator-features.mjs](../../ak5e/scripts/liberator-features.mjs#L257) (also L356, L477) and [crusher-features.mjs](../../ak5e/scripts/crusher-features.mjs#L173) define `validateTarget` inside the object the plan returns, where the engine never looks. The Sentry/Protector/Guardian files assign it correctly (`PLANS.name.validateTarget = ...`). Centurion had the same mistake in its first draft; the Node probe for it returned "The recorded change is not one this use can make." for a genuine, owner-recorded entry.

**Reproduce:** Use a Liberator effect on a Creature the user does not own with a GM connected. The relay refuses with "The recorded change is not one this use can make." (Crusher's Foecrusher heals the Crusher, so it never relays and hides the problem.)

**Verification limits:** Node probe and static review only; not reproduced for Liberator in Foundry.

**Fixed means:** Each plan's `validateTarget` is assigned on the plan function (or the engine also reads it from the returned plan), a Liberator and Crusher unowned-target test passes the relay, and a tampered entry is refused.
