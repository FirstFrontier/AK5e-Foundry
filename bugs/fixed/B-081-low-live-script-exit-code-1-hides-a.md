# B-081 · Low · Live script exit code 1 hides a green run

Area: Defender, Dreadnought and Artshield

**B-081 (fixed 2026-10-10, 0.5.1) · Low · Live script exit code 1 hides a green run.** `test-defender-live.mjs` fails on
any console error, including B-080. Fix B-080 rather than filtering the message.
**Resolution:** The Standard Bearer exemption was removed. The Luna Defender run exited 0 with 18/18 checks and no unexpected console/page errors. Existing environment-warning filters remain; see smoke-test limits.
