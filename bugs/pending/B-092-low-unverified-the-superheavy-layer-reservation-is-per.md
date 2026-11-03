# B-092 · Low · Unverified: the Superheavy layer reservation is per client

Area: Juggernaut, Protector and Sentry
Context: found by the independent review (critical-reviewer, Opus) and the live runs of `ak5e/tools/test-defender-jps-live.mjs`, 2026-10-11. Rulings: `ak5e/DECISIONS.md` "Juggernaut, Protector and Sentry branches"; checks still to run: `VERIFY.md`.

**B-092 · Low · Unverified: the Superheavy layer reservation is per client.**
- The `dnd5e.preApplyDamage` reservation stops one client halving two instances with one layer (B-F13).
- Two different clients applying Damage to the same Juggernaut at the same moment (for example the GM and the Juggernaut's player) can still both halve with the last layer and offer Shatterstorm twice.
- The second shatter card shows "Barrier layer short by 1"; undo it.
