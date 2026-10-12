# B-F14 · note · Superheavy: one layer could halve two quick applications on one client

**B-F14 (2026-10-11, review) · Superheavy: one layer could halve two quick applications on one client.**
- The layer is now reserved synchronously in `dnd5e.preApplyDamage` and released after the shatter is saved.
- The cross-client case remains as B-092.
- Regression test: `juggernaut.test.mjs`, mutation-checked.
