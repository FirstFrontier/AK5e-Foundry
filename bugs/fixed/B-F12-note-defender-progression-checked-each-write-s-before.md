# B-F12 · note · Defender progression checked each write's `before`
  against the Actor as it went

**B-F12 (2026-10-11, Juggernaut/Protector/Sentry increment)** Defender progression checked each write's `before`
against the Actor as it went. A second write to the same path therefore always failed with "changed after preview":
Fortress's launcher proficiency (latent since 0.5.6) and Sentry's ranged proficiency after the class's own
weapon write. Same-path writes now chain their expected value, and a write that already has a receipt does not
feed the chain (review follow-up). Regression tests are in `ak5e/test/defender-progression.test.mjs`.
