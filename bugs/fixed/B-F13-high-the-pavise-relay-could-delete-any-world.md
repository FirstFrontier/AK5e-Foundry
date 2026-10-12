# B-F13 · High · The Pavise relay could delete any World document

**B-F13 (2026-10-11, review, High) · The Pavise relay could delete any World document.**
- A player could forge a Pavise marker receipt on their own Sentry and send a relay request.
- The GM's client would then delete whatever UUID the forged record named.
- Fixed: the engine refuses `local` target kinds through the relay (`play-uses.mjs`), and the Pavise marker and Reaction refund are local.
- The marker deletes or recreates only this Sentry's flagged circle templates, and records a removal before deleting.
- Regression test: `sentry.test.mjs`, mutation-checked.
