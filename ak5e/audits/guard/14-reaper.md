# Guard audit 14: Reaper subclass

Audit only (2026-10-12, Claude Sonnet 5.5). No production code, test, TODO, DECISIONS or README edits.

## Scope
- Source: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` L3330-3433 (read in full), plus the referenced Press the Attack base (L1874-1890), Martial DC (Ch.1 L211) and Damage Reduction (Ch.1 L207).
- Code: `ak5e/scripts/reaper-features.mjs` (all), `ak5e/test/reaper.test.mjs` (all); read-only: `guard-uses.mjs`, `guard-rules.mjs`, `play-uses.mjs`, `resource-pools.mjs` (pool read/clamp), `play-uses-sheet.mjs#L19`, Reaper parts of `guard-sheet.mjs` (L60, L291-305, L956-1026, L1132) and `ak5e.mjs` (L65, L201, L357), `test/guard-fixture.mjs`.
- Docs: `bugs/README.md`, `ak5e/DECISIONS.md` L472 and L1878-1990; dnd5e 5.3.3 `applyDamage`/`preApplyDamage` read from the local test install (`/tmp/ak5e-guard-test-data`).

## Checks run
- `npm run test:guard`: 118/118 pass (baseline). `npm run check:files`: pass (accepts `ak5e/audits/`). `npm ci` is impossible (no lockfile); `node_modules` was symlinked from the main checkout.
- Throwaway Node probes (outside the repo, scratchpad `probe/p1-p3.mjs`) importing the real module and `guard-fixture.mjs`. Findings below say probe or static review. No Foundry, no Playwright.

## Bugs filed (B-290..B-299)
- B-290 Medium (probe): gain at cap stores 11+, Undo then lowers Ruin below its prior value.
- B-291 Medium (probe): Curtainfall expends all Ruin at confirm, before any hit.
- B-292 Medium (probe): Reap is a text card; no damage roll, save buttons or d20 crit check.
- B-293 Medium (probe/static): crit thresholds, crit riders and Ruin triggers are display or manual only.
- B-294 Medium (probe/static): Fear the Reaper mark is a typed name; no 1d6 Psychic, no expiry.
- B-295 Medium (probe): 0 HP Ruin reset runs on all clients, ungated, no receipt/undo.
- B-296 Medium (probe + dnd5e source): healing penalty hits self-heals/GM edits; exemption dead code.
- B-297 Low (probe): invalid input accepted (TypeError on 1.5), area/mode bypass, missing warnings.
- B-298 Low (static): card/DECISIONS wording diverges; Push/Press renamed silently; invented mechanics in log.
- B-299 Low (static): tests do not run the hooks or the risky paths.

## Existing bugs re-verified
- B-129 (confirm skipped): confirmed for Reaper. Gain Ruin, Ruin Decay and Lingering Violence go through the default path (`guard-sheet.mjs#L1133`) with `confirmed:true` and no dialog unless warned; Reap/Curtainfall/Fear/Memento show an input prompt with a Confirm button but no cost/target summary.
- B-133 (undo retains flags): not reproducible for Reaper. Fear the Reaper's flag and pool are restored by Undo (probe); Reaper plans do not mutate `state.data`.
- B-135 (Reaction spent before receipt): not applicable; no Reaper plan spends a Reaction.

## Verified clean
- Reaper Table: 11/11 rows (Reap/Curtainfall crit bonus, healing penalty) match source L3350-3372 (parsed by probe). Crit threshold = 20 - bonus follows the logged ruling (DECISIONS L1977); thresholds are 20 below level 4.
- Martial DC = 8 + PB + max(STR, DEX) matches Ch.1 L211. Reap Prime level-13 full damage, the 15-ft cone size (sphere radius wording: B-298) and Fear the Reaper 1/Long Rest pool (resets on LR, restored by Undo) match source.
- Curtainfall bonus is a plain `Roll` of `Nd6` (not doubled on a crit, not auto-rolled; owner clicks) and Undo restores Ruin. Lingering Violence spends 1 Aggression and clamps at 0 with a public shortfall.
- Receipts live at `flags.ak5e.guardUses.undo`; no reaction handling, no GM-relay path, no pack/installer code in this unit.
- Push/Press naming: code keeps the "Press" label; DECISIONS L472 (UNRESOLVED) and L1948-1950 (ruled) conflict; reported in B-298, not renamed.

## Limits
- Nothing was run in Foundry; all bugs are "Unverified". The hook argument shapes come from reading dnd5e 5.3.3 only.
- Question not filed: whether the Reap crit-range column should reduce the crit threshold (as logged) is a design ruling already recorded; no new contradiction found in the source.
- Ruin gain/decay triggers being manual buttons is treated as an acceptable manual procedure only if documented (B-293, B-298).
