# B-094 · Low · Shelter still hard-stops player actions (pre-existing, WORKFLOW §3.2)

Area: Juggernaut, Protector and Sentry
Context: found by the independent review (critical-reviewer, Opus) and the live runs of `ak5e/tools/test-defender-jps-live.mjs`, 2026-10-11. Rulings: `ak5e/DECISIONS.md` "Juggernaut, Protector and Sentry branches"; checks still to run: `VERIFY.md`.

**B-094 · Low · Shelter still hard-stops player actions (pre-existing, WORKFLOW §3.2).**
- `defender-features.mjs` `shelter` uses `needOwnTurn` and requires the ally confirmation, unlike the new Branch uses, which warn.
- This affects Protector Anchor Point and Greater Improved Shelter, which depend on Shelter.
- Tracked by the player-agency audit in `TODO.md`.
