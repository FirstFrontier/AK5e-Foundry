# Guard & Vanguard Quality-Pass Report — 2026-11-03

Owner session: sibling `head` dashboard session (`d3fa8c30…`; all workers `done`).
This commit consolidates its uncommitted output. Earlier Oct-31 lanes
(agent/charger/pioneer/shared scaffolds) were already snapshotted in the Nov-1
`backup` commit; what lands here is the Nov 2–3 quality pass.
Branch: `feat/five-branches`.

## Outcome

| Lane (status) | Content | Gate evidence |
|---|---|---|
| `guard-base-polish` (merged) | Base-class fixes in guard-uses/sheet/progression/setup: confirm-before-spend, preview-key handoff, contributions-once idempotency, exact before-state undo, durable Reaction receipts | Frozen 18/18, attack 22/22 + r2 15/15, Luna review PASS |
| `vanguard-base-polish` (merged ×2) | B-308 slice across rules/progression/setup/features/resolution | Pipeline below; `test:vanguard` 373/373 |
| `vanguard-shared` (merged ×2) | B-308 + shared Tip/Operator hooks; chat-card refresh helpers (`displayedMessages`/`rerenderChatMessages`/`refreshChatMessages` in `play-uses-sheet.mjs` — rode in commit `32fabbd`) | Luna review; Sonnet final QA |
| `vanguard-b309` (merged) | Agent progression/damage-scaling fixes | Merged; tests in suite |
| `vanguard-charger` / `vanguard-pioneer` (merged) | Branch workflows, sheets, frozen+attack tests | Merged Oct-31, in `backup` |

Pipeline (from session records): Qwen attack drafts → DeepSeek implement
→ Luna review gate → Terra T2 fix promotion → Sonnet S3 alt-review (Luna S3
killed mid-run, superseded) → Sonnet final QA `gv-base` → Luna visual checkpoint
→ Terra checkpoint fix → Sonnet checkpoint-fix review. All sessions `done`.

## Bugs closed / moved

- **B-129 (high), B-131, B-132 (high), B-133 (high): FIXED** — base-class slices
  verified (frozen/attack/review above); moved `bugs/pending/` → `bugs/fixed/`.
  Subclass slices stay open where they reproduce outside base files.
- **B-135 (medium): base slice fixed, REOPENED for subclass sites** — Brawler
  Cross Counter/Slip Off (`brawler-features.mjs:116,214`) and Duellist
  (`duellist-features.mjs:244/272/512`) still spend Reaction inside
  `plan.apply` before receipt persistence. Stays in `bugs/pending/` with the
  successor note. (Stays pending in this commit.)

## Rendered evidence (Luna visual checkpoint, `/tmp/ak5e-visual/gv-base-20261102/`)

Foundry V13.351 + D&D5e 5.3.3, GM + player, `launchTestBrowser()`.
Guard PASS (setup preview/apply/replay-0, 5 controls, 4 clean cancels, Strike
True, UA 1d8 / Eternal Aggression 1d4 explicit-roll cards, stale-preview red
alert, encounter-locked receipts, reload + restart persistence). Vanguard PASS
except replay (progression replay retained values but rewrote 10 actor fields —
not a strict no-op; recorded). 14 screenshots viewed, all PASS; Tip/Lightspeed/
post-restart screens programmatic-only (allowance exhausted). One intentional
console error (stale-preview conflict); otherwise clean.

## Manager-verified gates (this commit, working tree)

- `npm run test:guard`: **298 tests — 297 pass, 0 fail, 1 todo**
- `npm run test:vanguard`: **373 tests — 373 pass, 0 fail**
- `git diff --check`: clean. `npm run check:files`: validated (with this report).

## Files in this commit

Scripts: `guard-{rules,progression,setup,uses,features,sheet}.mjs`,
`vanguard-{rules,progression,setup,features,resolution}.mjs`.
Tests (new): `guard-base-polish-{frozen,attack}`, `vanguard-base-polish-{frozen,attack}`.
Bugs: B-129/131/132/133 pending→fixed; B-135 updated (reopened note).
Shared `play-uses-sheet.mjs` refresh helpers already pushed in `32fabbd`; no
further GV edits to that file since.

## Limits

- B-135 subclass sites + subclass slices of B-129..133 remain open (tracked in files).
- Vanguard replay strict-idempotency failure recorded, unfixed.
- Release packs/licensing still separate; no redistribution rights established.
