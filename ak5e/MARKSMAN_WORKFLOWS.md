# Marksman Workflow Implementation and Verification — 2026-10-31

Implementation, review corrections, and live browser verification report for Base Marksman,
Anti-Air, Artilleryman, and Besieger workflows in the AK5e Foundry VTT module (v0.5.6) on
Foundry V13.351 and D&D5e 5.3.3. Public release-pack creation remains separate.

## Coverage

| Area | Implemented behavior | Verification status & test evidence |
| --- | --- | --- |
| Setup/progression | Preview/confirm sheet dialog, source-ID grants, styles, milestone Talent/module choices, gear/LMD, stale-preview and retry protection | **VERIFIED**: Automated in `marksman-progression.test.mjs`, `marksman-progression-sheet.test.mjs`, and `marksman-sheet.test.mjs` and verified in private Foundry V13 browser (`02-gm-base-marksman-sheet.png`, `06-player-base-sheet.png`). All 35 Skills and 42 Talents/modules retain source descriptions and manual table adjudications where not fully automated. |
| Shared resolution | Recorded target/weapon/turn snapshots, individual owner rolls, target-owner saves, confirmed typed HP/effect application, GM coordination, target serialization, descendant undo | **VERIFIED**: B-300 persisted roll reconstruction on retry and multi-tier descendant preview in `previewUndo` verified in `play-uses.test.mjs` and `play-uses-b300-adversarial.test.mjs`. Unowned-target relay verified live in dual-client test. |
| Weapon properties | Generated tableData, legacy and native property reader, numeric Splash/Crush/range | **VERIFIED**: Native attack/damage hooks (`preRollAttack`, `preRollDamage`, `postRollAttack`) verified across all weapon categories in `marksman-features.test.mjs` and `marksman-adversarial.test.mjs`. |
| Base Marksman | Target Lock, Enhanced Target Lock (level 11/12 ruling), Unerring with damage continuation, Steel Rain, Martial DC (Str/Dex choice), 8 fighting styles with explicit Defensive end control | **VERIFIED**: Core features, Unerring damage continuation, Defensive style end control, and Martial DC selection verified in `marksman-features.test.mjs`, `marksman-rules.test.mjs`, `marksman-adversarial.test.mjs`, and live browser (`07-player-base-controls.png`, `08-player-target-lock-card.png`). |
| Anti-Air | Weight of Fire, Air Tracking (Pigeon Shooting advantage, Shifting Focus), Versatile Approach (4 options), Unapproachable, Always Another Option, The Last Option | **VERIFIED**: Airborne table fact-entry, Pigeon Shooting advantage, and B-301 Option Recharge initiative recovery routing verified in `anti-air.test.mjs`, `marksman-features.test.mjs`, `marksman-adversarial-m2.test.mjs`, and live browser (`09-player-anti-air-sheet.png`, `10-player-anti-air-controls.png`, `11-player-area-denial-card.png`). |
| Artilleryman | Tools of the Trade, Splash grouped blast with per-target cover DCs, Delayed Detonation munition deployment & reaction, Secondary Detonation (reuse vs roll), Bigger Booms, Scatter Them, Explosive Dawn | **VERIFIED**: Grouped mixed-recipient blast tests, per-target cover DCs, Scatter Them collision/geometry, timer reload suppression persistence, and live interactive execution verified in `artilleryman.test.mjs`, `marksman-adversarial-m2.test.mjs`, `marksman-m2-adversarial.test.mjs`, and live browser (`05-gm-artilleryman-sheet.png`, `15-player-artilleryman-sheet.png`, `16-player-artilleryman-controls.png`, `17-artilleryman-deploy-munition-card.png`, `19-artilleryman-detonate-card.png`, `20-artilleryman-secondary-detonation-card.png`, `21-artilleryman-undo-receipt-card.png`). |
| Besieger | Siege Mode close-range disadvantage, Large Target, Deliberate/Efficient physical DR bypass, Siege Bolt ongoing save ticks with early termination, Goliath's Bane, Godpiercer 8/16 direct HP loss mitigation | **VERIFIED**: Turn-scoped Siege Mode, close-range disadvantage (<= 20 ft), Deliberate/Efficient DR bypass provenance, Siege Bolt save ticks/early termination, and Godpiercer mitigation verified in `besieger.test.mjs`, `marksman-adversarial-m2.test.mjs`, `marksman-m2-adversarial.test.mjs`, and live browser (`04-gm-besieger-sheet.png`, `12-player-besieger-sheet.png`, `13-player-besieger-controls.png`, `14-player-besieger-siege-bolt-card.png`). |

Automatic means hooks calculate a scoped modifier or observe a recorded trigger.
Guided means a player must click each roll/save/application. Manual means the
table adjudicates geometry, trigger facts, unsupported selected Skill/Talent
effects or explicitly identified incomplete integration. No trigger rolls dice.

## Verification Evidence

### 1. Automated Test Suites (`npm run test:marksman`)
All 18 test files executed by `npm run test:marksman` pass with 147 passing tests, 0 failures, and 0 errors:
1. `ak5e/test/marksman-features.test.mjs`: 14 tests — Core Marksman features, Target Lock, Martial DC, B-301 recovery serialization.
2. `ak5e/test/anti-air.test.mjs`: 12 tests — Anti-Air features, airborne fact-entry, Pigeon Shooting, B-301 Option Recharge initiative routing.
3. `ak5e/test/artilleryman.test.mjs`: 12 tests — Artilleryman features, Splash grouped blasts, cover DCs, Scatter Them geometry, timer suppression.
4. `ak5e/test/besieger.test.mjs`: 10 tests — Besieger features, Siege Bolt ongoing saves, close-range disadvantage, DR bypass, Godpiercer mitigation.
5. `ak5e/test/play-uses.test.mjs`: 8 tests — Shared play engine, B-300 ChatMessage retry publication without rerolling, descendant undo preview.
6. `ak5e/test/marksman-rules.test.mjs`: 9 tests — Level step calculations, proficiencies, style detection, fighting style scaling.
7. `ak5e/test/marksman-progression.test.mjs`: 14 tests — Character sheet setup, progression preview, idempotent item grants, ASI tracking, migration normalization.
8. `ak5e/test/marksman-progression-sheet.test.mjs`: 2 tests — Progression form rendering, 8 styles, source choices, owner permissions.
9. `ak5e/test/marksman-sheet.test.mjs`: 3 tests — Sheet hooks, save controls, Splash detonation card weapon provenance.
10. `ak5e/test/marksman-resolution.test.mjs`: 9 tests — Native attack/damage hooks, save controls, Splash card provenance, concurrent serialization.
11. `ak5e/test/deadeye.test.mjs`: 5 tests — Deadeye subclass features (Deadshot, Vital Strike, Deathblow).
12. `ak5e/test/flinger.test.mjs`: 5 tests — Flinger subclass features (Bound Weapons, Manipulation Arts).
13. `ak5e/test/heavyshot.test.mjs`: 5 tests — Heavyshot subclass features (Weapon Tuning, Heartseeker, Devastator).
14. `ak5e/test/hunter.test.mjs`: 5 tests — Hunter subclass features (Empowered Shot, Railgun, Let the Light In).
15. `ak5e/test/spreadshot.test.mjs`: 6 tests — Spreadshot subclass features (Spread weapons, FIFO shell crafting/loading).
16. `ak5e/test/marksman-adversarial.test.mjs`: 7 tests — Target lock concurrency, descendant undo trees, roll publication faults.
17. `ak5e/test/marksman-adversarial-m2.test.mjs`: 9 tests — Grouped blast rollGroupId, per-target cover DCs, Siege Attacker Vehicle doubling, Godpiercer 16 HP loss, Scatter Them solid surface collisions.
18. `ak5e/test/marksman-m2-adversarial.test.mjs`: 12 tests — Extreme cover clamping (DC floor >= 1), Anti-Air off-ground verification, Besieger close-range disadvantage flags.
Total: 147 tests.

### 2. Adversarial Suites
The three Marksman-specific adversarial suites are executed as part of `npm run test:marksman` (suites 16–18 above, 28 tests total):
- `ak5e/test/marksman-adversarial.test.mjs`: 7 tests — Target lock concurrency, descendant undo trees, roll publication faults.
- `ak5e/test/marksman-adversarial-m2.test.mjs`: 9 tests — Grouped blast rollGroupId, per-target cover DCs, Siege Attacker Vehicle doubling, Godpiercer 16 HP loss, Scatter Them solid surface collisions.
- `ak5e/test/marksman-m2-adversarial.test.mjs`: 12 tests — Extreme cover clamping (DC floor >= 1), Anti-Air off-ground verification, Besieger close-range disadvantage flags.

Shared play engine adversarial verification:
- `ak5e/test/play-uses-b300-adversarial.test.mjs`: 11 tests — Dice publication failure retry edge cases and deep descendant undo tree locks (executed via `npm run test:play` and `npm test`).

### 3. Static Integrity & Repository Suites
- `node ak5e/tools/validate-files.mjs`: Validated `module.json`, `lang/en.json`, and 379 `.mjs` files with 0 errors.
- `npm run check:generated`: Regenerated Chapters 1–6, RollTables, and content map; generated files are unchanged.
- `npm test`: Full test suite completes successfully (exit code 0).

### 4. Private Foundry V13 / D&D5e Live Browser Acceptance
Live interactive dual-client verification executed via `ak5e/tools/test-marksman-live.mjs` using `launchTestBrowser()` with Playwright Chromium under `ANGLE (Mesa, AMD CEDAR, OpenGL ES 3.1)` on isolated port `30175` using a disposable clone of `standard-test`.
- **Evidence Directory**: `/tmp/ak5e-marksman-evidence/`
- **JSON Reports**: `browser-report.json` (0 errors), `pre-restart-snapshot.json`, `restart-report.json` (0 errors, 100% actor and message state match post-restart).
- **Process & Network**: Server PID stopped cleanly with SIGTERM; port 30175 confirmed released with zero lingering listeners.
- **Visual Inspection**: All 26 captured screenshots inspected and verified (all **PASS** verdicts):
  - `01-baseline-world.png`: Clean world baseline post-join. (PASS)
  - `02-gm-base-marksman-sheet.png`: GM sheet view of Base Marksman actor. (PASS)
  - `03-gm-anti-air-sheet.png`: GM sheet view of Anti-Air actor. (PASS)
  - `04-gm-besieger-sheet.png`: GM sheet view of Besieger actor. (PASS)
  - `05-gm-artilleryman-sheet.png`: GM sheet view of Artilleryman actor with Heavy Mortar Launcher. (PASS)
  - `06-player-base-sheet.png`: Player sheet view of Base Marksman actor. (PASS)
  - `07-player-base-controls.png`: Subsystem Controls Dialog for Base Marksman. (PASS)
  - `08-player-target-lock-card.png`: Chat log showing Target Lock activation (+1 bonus vs Target Dummy) with Undo button. (PASS)
  - `09-player-anti-air-sheet.png`: Player sheet view of Anti-Air actor. (PASS)
  - `10-player-anti-air-controls.png`: Subsystem Controls Dialog for Anti-Air Marksman. (PASS)
  - `11-player-area-denial-card.png`: Chat log showing Area Denial card via relay. (PASS)
  - `12-player-besieger-sheet.png`: Player sheet view of Besieger actor. (PASS)
  - `13-player-besieger-controls.png`: Subsystem Controls Dialog for Besieger Marksman. (PASS)
  - `14-player-besieger-siege-bolt-card.png`: Chat log showing Siege Bolt attack and Siege Mode card. (PASS)
  - `15-player-artilleryman-sheet.png`: Player sheet view of Artilleryman actor. (PASS)
  - `16-player-artilleryman-controls.png`: Subsystem Controls Dialog for Artilleryman Marksman. (PASS)
  - `17-artilleryman-deploy-munition-card.png`: Chat card deploying Delayed Detonation munition at (500,500). (PASS)
  - `18-warning-delayed-detonation-shortfall.png`: Warning dialog caught when attempting shortfall action. (PASS)
  - `19-artilleryman-detonate-card.png`: Chat card detonating munition as a reaction. (PASS)
  - `20-artilleryman-secondary-detonation-card.png`: Chat card resolving Secondary Detonation. (PASS)
  - `21-artilleryman-undo-receipt-card.png`: Chat card showing receipt after player clicked Undo. (PASS)
  - `29-pre-restart-gm-overview.png`: Full GM overview before restart (53 chat messages). (PASS)
  - `30-pre-restart-player-overview.png`: Full Player overview before restart. (PASS)
  - `31-post-restart-gm-overview.png`: GM overview post-restart with clean initialization. (PASS)
  - `32-post-restart-player-sheet.png`: Player sheet post-restart with intact actor items and flags. (PASS)
  - `33-post-restart-chat-cards.png`: Chat log history post-restart with all 53 interactive cards preserved. (PASS)

## Milestone Resolutions Summary

1. **Defect B-300 Resolved**: Repaired in `ak5e/scripts/play-uses.mjs`. Evaluated rolls are serialized in `receipt.serializedRoll` / `receipt.serializedRolls` with publication state tracked by `receipt.diceMessagePublished`. Failed ChatMessage creations retry without rerolling or duplicate messages. `previewUndo` recursively inspects multi-tier child receipts in reverse tree order, aggregating target HP reversals, conditions, and lock statuses.
2. **Defect B-301 Resolved**: Repaired in `ak5e/scripts/marksman-uses.mjs` and `ak5e/scripts/anti-air-features.mjs`. `plainRecoveryContext` sanitizes recovery options to primitive scalars, preventing circular JSON serialization errors during rest events. Anti-Air Option Recharge (level 15) initiative recovery routes strictly through `recoverMarksmanPool` and the serial queue coordinator.
3. **Subclass Integration Completed**: Base Marksman (Unerring continuation, Defensive end control, Str/Dex Martial DC), Anti-Air (Airborne fact-entry, Pigeon Shooting, Option Recharge), Artilleryman (Tools of the Trade, Splash grouped blasts, per-target cover DCs, Scatter Them geometry/collision, timer suppression), and Besieger (Siege Bolt ongoing saves, close-range disadvantage, DR bypass, Godpiercer mitigation) are fully integrated and verified.
4. **Release Compendiums**: Clean public release-pack export and verification remain an independent release-gate milestone per project policy.
