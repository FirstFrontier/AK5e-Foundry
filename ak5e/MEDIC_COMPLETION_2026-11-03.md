# Medic Track Completion Report — 2026-11-03

Manager: `head` (OpenClaw; this run resolved to `opencode-go/muse-spark-1.3-contributor`).
Scope: Medic casting foundation (Wave 1 A/B/C), Witchcraft / Therapist / Ward runtime
(Wave 2 D/E/F), Ward relay hardening (W2F + W2F-4), Wave 1 rendered acceptance.
Branch: `feat/five-branches`. Rules authority: `AK5e_1.3.1_Foundry_Source/`
(Ch. 3), WORKFLOW.md §3.2 table-play rules throughout.

## Outcome

All packages merged, reviewed, and green. `npm run test:medic`: **782 tests —
781 pass, 0 fail, 1 pre-existing skip.** Joint final QA PASS. No open advisories.

| Package | State |
|---|---|
| Wave 1 A `medic-foundation` (native casting, cast options, linked receipts, damage correlation/resolvers, reaction context) | Merged + QA PASS (8/8 recheck items + NEW-D commit re-validation) |
| Wave 1 B `therapy-rules` / C `ward-rules` (pure catalogues) | Merged (independent review passed) |
| Wave 2 D `witchcraft` (Witchcurse relay, Boon, Life-through-Death) | Merged + joint final QA PASS |
| Wave 2 E `therapist` (9 Therapies, Doctor Is In, Early Onset, Concentration) | Merged + joint final QA PASS |
| Wave 2 F `ward` (grants, pool choice, depletion, Collective settlement, regen) | Merged + joint final QA PASS |
| W2F relay pin (duplicate/target/expiry/empty bypasses) + W2F-4 sibling binding | Merged + narrow re-review PASS |
| Wave 1 rendered acceptance 7/7 (W1-1..4 + B-310/311/312) | PASS (W1-4 closed as NOT-OUR-DEFECT: panel opened all along, test locator repaired) |

## Agents used (resolved models; no overrides)

- `impl-t1` → `opencode-go/deepseek-v4.1-flash` (bulk implementation, W2F/W2F-4/W1-4; 0 counted failures on W2F-4)
- `impl-t2` → `openai/gpt-6.1-terra` (Ward promotion after 2 T1 failures; 1 counted T2 failure before fix round went green)
- `impl-t3` → `openai/gpt-6.1-sol` (foundation tier-3 repair)
- `adversary` → `opencode-go/qwen3.8-flash` (spec-first attack tests, red-first proofs)
- `adversary-review` → `openai/gpt-6-luna` (review gates; all screenshots viewed via `read` tool — the image viewer rejects `/tmp`)
- `adversary-review-alt` → `anthropic/claude-sonnet-5-5` (used wherever an OpenAI model implemented)
- `final-qa` → `opencode-go/muse-spark-1.3-contributor` (joint final QA: 767/767 medic, 148 caster, 257+1todo guard, 155 defender, 5 live screenshots PASS, 0 console errors)

Notable failure-ladder events: Ward T1→T2 promotion (overbroad d8 gate regressions, adjudicated back); foundation F2 engine-ownership dispute (Ledger/Engine owns life-support accounting; `applyArtCastOptions` reconciles staged to live total).

## Key design decisions (see `ak5e/DECISIONS.md`)

- U3-3: upcast discount computed at cast level, not base level.
- F2: quoted aggregate is source of truth for life-support accounting.
- W2F relay pin: `wardTempEntryValid` binds `entry.uuid` + resolved doc to receipt `targetUuid` (canonical set compare, target/expiry binding, nonempty-recorded).
- W1-4: test-only repair (new-dialog-by-id assertion); no production change.

## Evidence

- Suites: `npm run test:medic` 781 pass / 0 fail / 1 skip; red-first proofs per fix (r2/r3/r4/r5 attack files document the defect each kills).
- Live: private Foundry V13 + D&D5e 5.3.3, GM + player clients, `launchTestBrowser()` only; mouse-driven proofs for Treat-the-Cause, forced-miss rekey, native-cancel refund halves; restart persistence verified.
- Screenshots: implementers and reviewers viewed every reported image (PASS/FAIL/UNCERTAIN per AGENTS §6.2); review reports under `/tmp/ak5e-visual/` (swept after 90 min by schedule; logs kept in `.codex-work/ledger/2026-11-01-medic-resume.md`, git-ignored).

## Files in this commit

New runtime: `art-correlation.mjs`, `therapist-{features,rules,sheet}.mjs`,
`ward-{features,rules,sheet}.mjs`, `witchcraft-{features,sheet}.mjs`.
Extended: `arts-casting/arts-ledger/medic-{features,rules,setup,progression,sheet}.mjs`,
`ak5e.mjs` (hook registration), `play-uses-sheet.mjs` (collective-Ward retry preview),
`trigger-events.mjs`, `lang/en.json` (Medic strings), `templates/arts-usage.hbs`
(cast-option fields). Tests: 6 foundation + 4 therapist + 3 therapy-rules +
7 ward + 2 ward-rules + 3 witchcraft + 1 wave-1-acceptance (new); `medic-rules.test.mjs`
(branch list), `base-classes-fixture.mjs` (activeGM setter my relay tests assign through),
`package.json` (`test:medic` glob only).

## Limits / not done

- No redistribution rights established: release packs, licensing, attribution remain separate (WORKFLOW §7). Do not publish this module.
- `ak5e/MEDIC_WORKFLOWS.md` coverage publication still open (TODO).
- Shared docs (`TODO.md`, `DECISIONS.md`, `AGENTS.md` roster notes incl. Terra-final-QA-only-if-implementer-Muse) advance in the working tree, committed separately.
- Roster ops note: `impl-t2`→Muse Spark needs owner hand (no CLI path); gateway heap cap (`--max-old-space-size=7683` in `openclaw-gateway.service`) is owner-configurable; a 3 GB cap was discussed but not applied (would OOM this workload — hygiene first).
