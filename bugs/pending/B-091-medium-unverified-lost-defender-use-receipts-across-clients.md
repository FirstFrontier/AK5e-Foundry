# B-091 · Medium · Unverified: lost Defender use receipts across clients

Area: Juggernaut, Protector and Sentry
Context: found by the independent review (critical-reviewer, Opus) and the live runs of `ak5e/tools/test-defender-jps-live.mjs`, 2026-10-11. Rulings: `ak5e/DECISIONS.md` "Juggernaut, Protector and Sentry branches"; checks still to run: `VERIFY.md`.

**B-091 · Medium · Unverified: lost Defender use receipts across clients.**
- Every Defender use saves the whole `flags.ak5e.defenderUses` object (`play-uses.mjs` `save`), and the `undo` array is replaced wholesale.
- Some automatic uses run on the GM client for player-owned Actors: a shatter when the GM applies Damage, Unending Defence, and the Torrent of Lead Turn-end write (`sentry-features.mjs` `torrentTurnEnd`).
- A player use committed at the same moment can drop one of those receipts, or restore a stale `data.torrent`, so Torrent lasts an extra Turn.
- Same class of problem as B-020 and the pre-0.5.1 B-085.
- Fixed means: leaf-level writes or GM-routed commits for these flags.
