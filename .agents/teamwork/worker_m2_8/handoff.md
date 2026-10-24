# Handoff Report: Milestone 2 — Executor Specialist Subclass Implementation & Tests

## 1. Observation

- **Source Authority & Rules Scope:**
  - `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` lines 5498–5578 specify the complete Executor archetype: Hunter vs Bodyguard path choices, Deathmark state mechanics, combat SP recovery, damage progression (+1d4, +2d4, +3d4), In Every Shadow, Sweeper/Smokescreen, Prowess gain triggers, Preysense/Dangersense, In for the Kill/Blade Shield, Mortal Blow, and Ultimate Sword and Shield.
- **Source Code Implementation:**
  - `ak5e/scripts/executor-features.mjs`: Implements subclass detection (`isExecutor`), path resolution/modification (`getExecutorPath`, `setExecutorPath`), Deathmark state machine (`getDeathmarkState`, `setDeathmark`, `recallDeathmark`, `clearDeathmark`), damage bonuses (`calculateDeathmarkDamageBonus`: +1d4 at level 1, +2d4 at level 7, +3d4 at level 14), crit range enhancement (`deathmarkCritRangeBonus`: +1 for Hunter vs marked target), mobility updates (`applyInEveryShadow`: sets swim/climb = walk, upgrades Stealth to proficiency or expertise), attack redirection (`canRedirectAttack`), resource pool (`mortalBlow`: max 1, initial "max", 1/LR recovery), pre-roll hooks (`executorPreRollAttack`, `executorPreRollDamage`), and lifecycle event listeners (`registerExecutorHooks`).
  - `ak5e/scripts/specialist-uses.mjs`: Added dynamic plan registration support, 8 table-play plans (`transferDeathmark`, `recallDeathmark`, `sweeper`, `smokescreen`, `mortalBlow`, `bladeShield`, `attackRedirection`, `dangersense`), 2 rulings (`deathmarkTransferTiming`, `mortalBlowReading`), `getSpecialistRuling(actor, key)`, and `specialistUses.ruling`.
  - `ak5e/scripts/specialist-sheet.mjs`: Integrated Executor Deathmark badge (`Deathmark: Held [Path]` or `Deathmark: Marked -> Target [Path]`) in `getDeathmarkStateText()`, and action buttons (`Transfer Deathmark`, `Recall Deathmark`, `Sweeper`, `Smokescreen`, `Attack Redirection`, `Dangersense`, `Blade Shield`, `Mortal Blow`) in `openSpecialistControls()`.
  - `ak5e/scripts/ak5e.mjs`: Exposed `specialist.executor` namespace, attached `ruling` function, and registered `registerExecutorHooks()` on `ready`.
  - `ak5e/DECISIONS.md`: Logged Executor mechanics and rulings for `deathmarkTransferTiming` and `mortalBlowReading`.
  - `TODO.md`: Checked off implemented Executor tasks.
- **Verification Commands & Verbatim Outputs:**
  - Command: `node --test ak5e/test/executor.test.mjs`
    ```text
    ✔ Area 1: Executor Identification & Path Choice (3.828807ms)
    ✔ Area 2: Deathmark Transfer & Recall State Machine (7.89604ms)
    ✔ Area 3: Combat SP Grants & Disengage Reaction (1.787912ms)
    ✔ Area 4: Damage Scaling (+1d4, +2d4, +3d4) (1.342943ms)
    ✔ Area 5: Hunter Crit Range (+1) vs Bodyguard Attack Redirection (1.567231ms)
    ✔ Area 6: Level 5: In Every Shadow (0.798023ms)
    ✔ Area 7: Level 5: Sweeper (Hunter) (3.252637ms)
    ✔ Area 8: Level 5: Smokescreen (Bodyguard) (1.717267ms)
    ✔ Area 9: Executor Prowess Gain Triggers (1.78682ms)
    ✔ Area 10: Level 11: Preysense (Hunter) & Dangersense (Bodyguard) (2.524478ms)
    ✔ Area 11: Level 15: In for the Kill (Hunter) & Blade Shield (Bodyguard) (1.645029ms)
    ✔ Area 12: Level 20: Mortal Blow (Hunter) & Ultimate Sword and Shield (Bodyguard) (0.999457ms)
    ✔ Area 13: Full Encounter-Window Undo Reversibility (WORKFLOW §3.2) (1.667603ms)
    ℹ tests 13
    ℹ suites 0
    ℹ pass 13
    ℹ fail 0
    ```
  - Command: `node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs`
    ```text
    ℹ tests 61
    ℹ suites 0
    ℹ pass 61
    ℹ fail 0
    ```
  - Command: `node --test ak5e/test/resource-pools.test.mjs ak5e/test/operation-kernel.test.mjs`
    ```text
    ℹ tests 71
    ℹ suites 0
    ℹ pass 71
    ℹ fail 0
    ```
  - Command: `node ak5e/tools/validate-files.mjs`
    ```text
    Validated module.json, lang/en.json, and 269 .mjs files.
    ```
  - Command: `node ak5e/tools/verify-generated-content.mjs`
    ```text
    Verified all generated AK5e Chapter 1–6 records against the v1.3.1 source.
    Top-level records: 2193; Chapter 6 embedded features: 801.
    ```

## 2. Logic Chain

1. **Faithful Rules Alignment:** The source rules (Ch. 3 L5498–5578) define the Executor subclass of the Specialist class, branching into Hunter and Bodyguard paths. Every mechanical benefit was implemented directly in `executor-features.mjs` and mapped through `specialist-uses.mjs`.
2. **Table Play Philosophy (WORKFLOW §3.2):**
   - Confirmation is required before any state-mutating execution (`data.confirmed: true`).
   - Prerequisites and resource limits (e.g. Prowess shortfall, reaction spent, out of range, level mismatch) emit descriptive warnings that never hard-block; passing `overrides: [...]` allows the player to "Use anyway", logging the shortfall and clamping expenditure at 0 floor.
   - Zero auto-rolled dice: Mortal Blow outputs formula `10d8` to the card for interactive table rolls.
   - Encounter-window undo: Every use generates an entry in `flags.ak5e.specialistUses.undo`; calling `specialistUses.undo(actor, opId)` cleanly restores prior flag states and resource pool values.
3. **Architecture & Clean Integration:**
   - Resource pools are idempotent: `defineExecutorPools()` registers `mortalBlow` safely without redefinition errors.
   - Hook isolation: `registerExecutorHooks()` guards `onAk5eEvent` listeners with a module flag (`ak5eEventsInstalled`), preventing listener duplication across successive test environments.
   - Target relay compatibility: Target UUIDs and names are preserved on receipt metadata without registering invalid target kind entries, allowing smooth lifecycle completion.
4. **Zero Regressions:** All existing 48 Specialist tests and 71 kernel/pool tests pass 100%, and all static repo files pass validation without errors.

## 3. Caveats

- Foundry V13 UI live rendered browser testing was not conducted in this headless node session, though all DOM generation in `specialist-sheet.mjs` was constructed via standard helper patterns (`node`, `button`) matching existing verified sheet tabs.
- Multi-client concurrency locks are delegated to `keyedSerial` in `play-uses.mjs`.
- No caveats regarding rule fidelity or automated test coverage.

## 4. Conclusion

Milestone 2 (Executor Subclass Implementation & Tests) is fully implemented, verified, and complete. All 13 test areas pass cleanly with authentic state management and reversible undo support.

## 5. Verification Method

To independently verify the implementation, execute the following commands in `/home/patch/AK5e-Foundry`:

```bash
# 1. Run Executor test suite
node --test ak5e/test/executor.test.mjs

# 2. Run all Specialist test suites
node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs

# 3. Run kernel & resource pool tests
node --test ak5e/test/resource-pools.test.mjs ak5e/test/operation-kernel.test.mjs

# 4. Run static validation tools
node ak5e/tools/validate-files.mjs
node ak5e/tools/verify-generated-content.mjs
```
Invalidation conditions: Any failing test, file validation error, or failure to reverse state on undo.
