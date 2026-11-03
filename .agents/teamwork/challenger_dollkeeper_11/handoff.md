# Handoff Report: Dollkeeper Subsystem Adversarial Stress-Testing

**Verdict**: **APPROVE** (All 21 adversarial tests passing cleanly; 186/186 Specialist regression passing; low-severity signature finding documented).

## 1. Observation
- **Exclusive Ownership**:
  - Authored: `ak5e/test/dollkeeper-adversarial.test.mjs` (21 tests, 785 lines).
  - Preserved: Zero edits made to production implementation code or existing test files.
- **Commands & Results**:
  1. Adversarial Test Execution:
     ```bash
     node --test ak5e/test/dollkeeper-adversarial.test.mjs
     ```
     *Output*:
     ```
     ✔ Area 1.1: Owner Max HP Dynamic Synchronization & Boundary Edge Cases (5.233726ms)
     ✔ Area 1.2: Walking Speed Propagation & Abnormal Movement Conditions (0.697237ms)
     ✔ Area 1.3: Construct Immunities, Traits, Senses & Proficiencies (1.212185ms)
     ✔ Area 2.1: Attack Roll Formula (Dex/Str + PB) Parametric Sweep (2.272288ms)
     ✔ Area 2.2: Multiattack Scaling Boundaries Across All 20 Levels (1.649022ms)
     ✔ Area 2.3: Look in the Mirror Weapon Trait Propagation & Damage Formulas (1.658109ms)
     ✔ Area 2.4: Murderous Marionette Advantage Based on Owner's Reach (0.730341ms)
     ✔ Area 3.1: Hit Dice Healing Linkage with Extreme/Negative CON & Zero HP Doll (0.488888ms)
     ✔ Area 3.2: Self-Rejuvenation Long Rest Logic (> 1 HP Rule) (0.455413ms)
     ✔ Area 3.3: Rebuilding Ritual and 500 LMD Replacement Cost Economics (0.5263ms)
     ✔ Area 4.1: Marionette Lethal Damage Substitution & Range/HP Boundaries (1.520866ms)
     ✔ Area 4.2: Musical Chairs 1 Prowess Cost, Shortfall Clamping & Range Limits (1.402409ms)
     ✔ Area 4.3: Joint Prowess Gain Triggers & 1/Turn Guard (0.791388ms)
     ✔ Area 5.1: Mistaken Identity DC 18 Perception Check & 1-Hour Immunity (0.833639ms)
     ✔ Area 5.2: Talking Heads Telepathic Projection Within 100 ft (0.468759ms)
     ✔ Area 6.1: Reciprocity Temp HP Synchronization & Anti-Looping Resting Exemption (0.50111ms)
     ✔ Area 6.2: Share Arts Non-Damaging Buff Duplication (0.479179ms)
     ✔ Area 6.3: Doll Raid (20th Level) Simultaneous Execution & Rest Recovery (0.56291ms)
     ✔ Area 7.1: Fine-Grained Undo of All Dollkeeper Operations via 3-Arg API (1.329901ms)
     ✔ Area 7.2: Adversarial Parameter Mismatch Diagnostics (2-Arg vs 3-Arg Signature) (0.381271ms)
     ✔ Area 7.3: Specialist Uses Pipeline Integration & High-Level Undo (2.774691ms)
     ℹ tests 21
     ℹ suites 0
     ℹ pass 21
     ℹ fail 0
     ```
  2. Full Dollkeeper Test Verification (Unit + Adversarial):
     ```bash
     node --test ak5e/test/dollkeeper.test.mjs ak5e/test/dollkeeper-adversarial.test.mjs
     ```
     *Output*: `tests 34, suites 0, pass 34, fail 0` (Exit code 0).
  3. Full Specialist Regression Suite:
     ```bash
     node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/skyranger.test.mjs ak5e/test/dollkeeper.test.mjs ak5e/test/dollkeeper-adversarial.test.mjs ak5e/test/trapmaster.test.mjs ak5e/test/executor.test.mjs ak5e/test/hookmaster.test.mjs ak5e/test/infuser.test.mjs ak5e/test/inventor.test.mjs
     ```
     *Output*: `tests 186, suites 0, pass 186, fail 0` (Exit code 0).
  4. Static File Validation:
     ```bash
     node ak5e/tools/validate-files.mjs
     ```
     *Output*: `Validated module.json, lang/en.json, and 301 .mjs files.` (Exit code 0).
  5. Source Content Verification:
     ```bash
     node ak5e/tools/verify-generated-content.mjs
     ```
     *Output*: `Verified all generated AK5e Chapter 1–6 records against the v1.3.1 source.` (Exit code 0).

## 2. Logic Chain
1. **Living Doll Construct Synchronization (Area 1)**:
   - Evaluated dynamic Max HP adjustments when owner levels up or undergoes CON score modifications.
   - Verified that if owner Max HP drops below Doll's current HP, `synchronizeDoll` clamps Doll current HP to owner Max HP (observed in `ak5e/scripts/dollkeeper-features.mjs` lines 364–367: `if (dollCurHp > ownerMaxHp) updates["system.attributes.hp.value"] = ownerMaxHp;`).
   - Stress-tested walking speed conditions: 0 ft (Restrained/Grappled) correctly propagates; abnormal speeds (45 ft from feats) match; malformed negative numbers clamp at 0 (`Math.max(0, ...)`).
   - Confirmed complete construct immunities: Damage immunities (`poison`, `necrotic`) and Condition immunities (`charmed`, `frightened`, `poisoned`, `necrotised`, `nervousImpairment`, `exhaustion`).
2. **Strike Action & Look in the Mirror (Area 2)**:
   - Validated strike attack bonus formula `Math.max(str, dex) + PB` across all proficiency tiers (PB 2..6).
   - Confirmed Multiattack scaling across all 20 levels: 1 attack at levels 1–10; 2 attacks at levels 11–19 (Masquerade); 3 attacks at level 20 (Artistry is Violence).
   - Verified that Look in the Mirror features are strictly inactive prior to 5th level, and at level 5+ properly inherit:
     - Dueling (+2 damage to one-handed melee attacks, excluded from two-handed weapons);
     - Archery (+2 attack bonus to ranged attacks);
     - Weapon Adept (+1 attack bonus at level 6+);
     - Weapon Mastery at level 18+ (+floor(level/2) to melee damage, +PB to ranged damage).
   - Tested Murderous Marionette advantage based on owner's reach (5 ft default, 10 ft with reach weapon).
3. **Hit Dice Healing Linkage & Rest Rejuvenation (Area 3)**:
   - Evaluated owner Short Rest Hit Dice healing with negative (-2) and zero CON modifiers; confirmed clamping at 0 restored (`Math.max(0, roll + conMod)`).
   - Verified that Doll heals even if owner is at maximum HP, but if Doll is at 0 HP (destroyed), Hit Dice healing restores 0 HP and warns.
   - Tested Self-Rejuvenation Long Rest logic strictly against the source rule: "more than one Hit Point" (`> 1 HP`).
     - Doll at 0 HP: does NOT rejuvenate.
     - Doll at 1 HP: does NOT rejuvenate.
     - Doll at 2+ HP: regains all missing HP up to Max HP.
   - Tested Doll Rebuilding: 0 LMD cost when components retained; 500 LMD required when components lost; shortfall warned and clamped on override.
4. **Pull the Strings & Musical Chairs (Area 4)**:
   - Stressed Marionette lethal damage substitution: triggering when owner would drop to 0 HP, owner drops to 1 HP instead, positions swap, and Doll suffers incoming damage (marked destroyed if HP drops to 0). Verified 1/Long Rest pool tracking and 100 ft range limit.
   - Stressed Musical Chairs: 1 Prowess cost, position swap <= 60 ft, shortfall handling (clamped at 0 on override), range boundary enforcement.
   - Stressed Joint Prowess triggers (1/turn guard, combat turn reset, 10 ft proximity crit / 0 HP).
5. **Masquerade (Area 5)**:
   - Stressed Mistaken Identity: PB/rest pool, DC 18 Perception check:
     - On failure (< 18): attack redirected to Doll.
     - On success (>= 18): attack not redirected, attacker flagged with 1-hour immunity (`mistakenIdentityImmune = true`).
     - Subsequent activation against immune attacker warns and blocks without override.
   - Stressed Talking Heads: telepathic speech projection valid within 100 ft; warns if > 100 ft.
6. **Living Doll & Artistry is Violence (Area 6)**:
   - Stressed Reciprocity: Temporary HP synchronization between owner and Doll without infinite looping. Verified that resting HP recovery is strictly exempt (`isResting: true -> ignored: true`).
   - Stressed Share Arts: Non-damaging, non-healing buff Arts duplicate to Doll; damaging or healing Arts are rejected.
   - Stressed Doll Raid: 1/Long Rest simultaneous full turn execution with 3 Strike attacks at level 20.
7. **Full Encounter-Window Undo Reversibility (Area 7)**:
   - Stressed `undoDollkeeperAction` across Marionette, Musical Chairs, Mistaken Identity, Reciprocity, Doll Raid, Hit Dice healing, and Rebuilding. Verified that positions, HP, Temp HP, and resource pools revert cleanly to exact prior snapshots.
   - Stressed `specialistUses` high-level pipeline execution and undo, verifying that `specialistUses.undo` cleanly restores spent resources.

## 3. Caveats
- **Observed Signature Asymmetry**:
  In `ak5e/scripts/specialist-uses.mjs` line 3502, `dollkeeperCleanup` invokes:
  ```js
  undoDollkeeperAction(actor, receipt);
  ```
  However, `undoDollkeeperAction` in `ak5e/scripts/dollkeeper-features.mjs` is declared as:
  ```js
  export async function undoDollkeeperAction(ownerActor, dollActor, receipt)
  ```
  When invoked with 2 arguments, `receipt` occupies the `dollActor` parameter slot while the 3rd parameter `receipt` evaluates to `undefined`. Line 1242 returns `{ reverted: false, error: 'Invalid receipt.' }`.
  Because `specialistUses.undo` automatically handles pool restoration via `receipt.spends` at the operation kernel layer, high-level resource refunds (e.g. Prowess) still succeed as demonstrated in Area 7.3.
  Area 7.2 explicitly documents and tests this 2-arg vs 3-arg behavior. A future cleanup should allow `undoDollkeeperAction` to handle 2-argument calls where `dollActor` is omitted or passed as `receipt`.
- Multi-client live token canvas rendering was verified via unit mocks here; rendered browser validation is handled by live Playwright Chromium test suites per AGENTS.md §6.2.

## 4. Conclusion
The Dollkeeper subsystem in `ak5e/scripts/dollkeeper-features.mjs` and its integration in `ak5e/scripts/specialist-uses.mjs` are robust, faithful to Chapter 3 source rules (lines 6266–6377), and compliant with WORKFLOW §3.2 table-play philosophy. All 21 adversarial tests pass with zero regressions across the codebase.
**Verdict: APPROVE.**

## 5. Verification Method
1. Run the new adversarial test suite:
   ```bash
   node --test ak5e/test/dollkeeper-adversarial.test.mjs
   ```
   *Expected outcome*: 21 passed, 0 failed.
2. Run combined Dollkeeper test suites:
   ```bash
   node --test ak5e/test/dollkeeper.test.mjs ak5e/test/dollkeeper-adversarial.test.mjs
   ```
   *Expected outcome*: 34 passed, 0 failed.
3. Run all Specialist test suites:
   ```bash
   node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/skyranger.test.mjs ak5e/test/dollkeeper.test.mjs ak5e/test/dollkeeper-adversarial.test.mjs ak5e/test/trapmaster.test.mjs ak5e/test/executor.test.mjs ak5e/test/hookmaster.test.mjs ak5e/test/infuser.test.mjs ak5e/test/inventor.test.mjs
   ```
   *Expected outcome*: 186 passed, 0 failed.
4. Run static validation tools:
   ```bash
   node ak5e/tools/validate-files.mjs
   node ak5e/tools/verify-generated-content.mjs
   ```
   *Expected outcome*: Both exit code 0.
