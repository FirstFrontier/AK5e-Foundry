# B-095 · Low · Defender panel scroll area has no visible scroll affordance

Area: Juggernaut, Protector and Sentry
Context: found by the independent review (critical-reviewer, Opus) and the live runs of `ak5e/tools/test-defender-jps-live.mjs`, 2026-10-11. Rulings: `ak5e/DECISIONS.md` "Juggernaut, Protector and Sentry branches"; checks still to run: `VERIFY.md`.

**B-095 · Low · Defender panel scroll area has no visible scroll affordance.**
- The panel body now scrolls inside the dialog (fix for the clipping in B-F15).
- In the run-5 screenshots no scrollbar is visible; only the cut-off "Manual procedures" heading hints at more content.
- Fixed means: a visible scrollbar or fade on `.ak5e-defender-dialog .ak5e-defender-panel` (`styles/defender.css`).
