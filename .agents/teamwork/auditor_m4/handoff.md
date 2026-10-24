# Forensic Audit Report — Milestone 4: Specialist Base Class

**Work Product**: Milestone 4 Specialist Implementation (`ak5e/scripts/specialist-*.mjs` and `ak5e/test/specialist-*.test.mjs`)  
**Profile**: General Project (Development Mode per `ORIGINAL_REQUEST.md`)  
**Verdict**: **CLEAN**

---

## 1. Observation

### 1.1 Scope and Files Audited
The forensic audit inspected the following Milestone 4 files directly:
- `ak5e/scripts/specialist-rules.mjs` (304 lines)
- `ak5e/scripts/specialist-features.mjs` (88 lines)
- `ak5e/scripts/specialist-setup.mjs` (105 lines)
- `ak5e/scripts/specialist-progression.mjs` (672 lines)
- `ak5e/scripts/specialist-uses.mjs` (283 lines)
- `ak5e/test/specialist-rules.test.mjs` (261 lines)
- `ak5e/test/specialist-features.test.mjs` (259 lines)
- `ak5e/test/specialist-progression.test.mjs` (341 lines)

### 1.2 Phase Results
- **Hardcoded Test Results & Constant Stubs**: **PASS** — Zero hardcoded constants in place of dynamic computations. Hit points, proficiency bonus, DCs, weapon mastery damage, and resource pool maximums are dynamically computed from actor state.
- **Facade Implementations**: **PASS** — Zero empty stubs or dummy `return true / return <constant>` patterns. All functions perform authentic calculations, input validations, or transactional updates.
- **Tautological Assertions**: **PASS** — Automated AST / regex scan of all test suites revealed zero tautological assertions (`assert.equal(1, 1)`, `assert.ok(true)`, etc.). Tests exercise real boundary values and expected exception paths.
- **Fabricated Verification Outputs**: **PASS** — No pre-existing or orphaned `.log`, `.output`, or result files found predating auditor execution.
- **Static AST & File Validation**: **PASS** — `node ak5e/tools/validate-files.mjs` validated `module.json`, `lang/en.json`, and 249 `.mjs` files with 0 syntax or lint errors.
- **Specialist Test Suite Execution**: **PASS** — `npm run test:specialist` executed 24 tests across 3 suites, passing 24/24 in 171.69ms with 0 failures.
- **Base Classes Regression Suite Execution**: **PASS** — `npm run test:base-classes` executed Vanguard (74 pass), Supporter (44 pass), and Specialist (24 pass), passing 142/142 with 0 failures.
- **Full Repository Regression Suite**: **PASS** — `npm test` passed 100% of all repository test suites (linters, parsers, installers, origins, casters, defenders, guards, marksmans, base classes) with 0 regressions.
- **Rules Authority Alignment**: **PASS** — Formulas and level steps match AK5e Chapter 3 (`03_chapter_3_character_classes.txt` L5161–5360) exactly (1d8 HD, 8+CON base HP, 5+CON / 1d8+CON higher levels, Light/Med armor, Light Shields, Dex + Wis/Cha saves, 3 skills from 6, 15 fighting styles, Show Your Style at Lv 4 with Prowess max = PB regaining 1 on SR/LR, Mark of a Specialist with refund on failure, Weapon Adept at Lv 6, Weapon Expertise at Lv 12, Falling Upwards at Lv 17, Weapon Mastery at Lv 18).
- **Table-Play Philosophy (WORKFLOW §3.2)**: **PASS** — All active uses require confirmation dialogs, support non-blocking shortfall warnings with overrides, clamp shortfalls at zero with public chat notifications, consume reactions via `spendReaction`, and log reversible undo receipts under `flags.ak5e.specialistUses`.

---

## 2. Logic Chain

1. **Source Fidelity Verification:**
   - In `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`:
     - L5179–5181 specifies 1d8 HD, 8+CON base HP, 5+CON fixed or 1d8+CON rolled.
     - L5184–5188 specifies proficiencies: Light Armour, Medium Armour, Light Shields, Light Melee, Light Ranged, Two Tool Kits, Dex saving throw + choice of Wis or Cha, 3 skills from 6.
     - L5206–5226 defines the 1–20 level progression table.
     - L5312–5320 specifies Show Your Style at Level 4: Prowess max equals Proficiency Bonus, regain 1 on Short or Long Rest, Mark of a Specialist spends 1 Prowess to reroll proficient skill check with refund on second failure.
     - L5321–5327 specifies Weapon Adept at Level 6 (Melee: extra attack, reroll 1-2 damage; Ranged: extra attack, reroll 1 attack).
     - L5336–5342 specifies Weapon Expertise at Level 12 (Melee: +1 crit range, 1 Prowess bonus action +1 damage die; Ranged: 3d20 keep highest on advantage, 1 Prowess bonus action advantage).
     - L5346–5350 specifies Falling Upwards at Level 17 (It's All Skill: Reaction before save roll, 3 Prowess auto-succeed).
     - L5351–5357 specifies Weapon Mastery at Level 18 (Melee: +floor(Lvl/2) damage 1/turn; Ranged: double PB on attack 1/turn).
   - In `ak5e/scripts/specialist-rules.mjs` and `specialist-features.mjs`:
     - Every mathematical formula (`pbForLevel`, `hitPointsAtLevel`, `specialistDC`, `martialDC`, `weaponMasteryMeleeBonus`, `weaponMasteryRangedBonus`) is implemented as an unadulterated dynamic calculation matching these exact source equations.

2. **Anti-Cheating & Facade Analysis:**
   - Code inspection of `specialist-rules.mjs`, `specialist-features.mjs`, `specialist-setup.mjs`, `specialist-progression.mjs`, and `specialist-uses.mjs` shows zero hardcoded outputs matching specific test values.
   - Searching for tautological assertions or bypass mechanisms (`assert.equal(1, 1)`, `assert.ok(true)`) produced 0 matches.
   - All tests in `specialist-rules.test.mjs`, `specialist-features.test.mjs`, and `specialist-progression.test.mjs` execute real state transitions, asserting boundary conditions (e.g., negative CON clamping, out-of-range level errors, invalid ASI allocations, mismatched context keys).

3. **Idempotence & Reversibility:**
   - `specialist-setup.mjs` and `specialist-progression.mjs` implement deterministic `contextKey` hashes.
   - Re-running progression preserves previously applied hit points, ability score improvements, and prevents duplicate starting gear or cash grants (`state.startingEquipmentGranted`).
   - `specialist-uses.mjs` correctly records receipts with resource and reaction state, allowing encounter-window reversal via `specialistUses.undo(actor, opId)`.

4. **Empirical Test Verification:**
   - Independent execution of `npm run test:specialist`, `npm run test:base-classes`, and `npm test` verified that all suites execute and pass cleanly on the native Node.js test runner with zero regressions.

---

## 3. Caveats

- Individual subclass mechanics (Executor, Hookmaster, Infusion, Inventor, Skyranger, Dollkeeper, Trapmaster) are intentionally scoped to subclass milestones per `PROJECT.md`; base class setup and progression correctly support branch item assignment and subclass item grants.
- No other caveats.

---

## 4. Conclusion

The work product for Milestone 4 (Specialist Base Character Class) is authentic, robust, dynamic, and fully compliant with the AK5e v1.3.1 rules authority, WORKFLOW §3.2 table-play philosophy, and repository architectural standards. Zero integrity violations or prohibited patterns were found.

**Verdict: CLEAN**

---

## 5. Verification Method & Raw Evidence

### 5.1 Static Validation
```bash
node ak5e/tools/validate-files.mjs
```
*Raw Output:*
```text
Validated module.json, lang/en.json, and 249 .mjs files.
Exit code: 0
```

### 5.2 Specialist Unit Test Suite
```bash
npm run test:specialist
```
*Raw Output:*
```text
✔ Feature level unlocks: Weapon Specialisation, Show Your Style, Weapon Adept, Weapon Expertise, Falling Upwards, Weapon Mastery (3.658203ms)
✔ Resource pool: prowess registration, initial value, spend, refund, and max cap (1.905633ms)
✔ Short Rest and Long Rest recovery: 1 Prowess restored per rest up to maximum (5.646995ms)
✔ specialistUses: markOfASpecialist spend, shortfall warning override, and refund (3.808821ms)
✔ specialistUses: weaponExpertiseMelee and weaponExpertiseRanged (1.596754ms)
✔ specialistUses: itsAllSkill auto-success spend, reaction consumption, and undo (2.078483ms)
✔ specialistUses: weaponMasteryMelee and weaponMasteryRanged calculations (1.116749ms)
✔ specialistUses: defensiveStyle reaction spend and undo (0.982483ms)
✔ previewSpecialistSetup: generates feature items up to actor level and deterministic contextKey (2.863208ms)
✔ applySpecialistSetup: idempotent application preserving existing features (1.868432ms)
✔ inspectSpecialistFields: returns schema options for branch, saves, skills, styles, equipment, and level choices (1.533924ms)
✔ previewSpecialistProgression: validates required choices and rejects invalid permutations (1.396021ms)
✔ applySpecialistProgression: level 1 progression with cash option, proficiencies, saves, and fighting style (4.790061ms)
✔ applySpecialistProgression: level-up to 4 applies ASI and HP idempotently without duplicating starting gear (1.242027ms)
✔ ASI scheme validation: accepts +2 or +1/+1 and rejects invalid schemes (0.861192ms)
✔ checkLevel: boundary validation and type safety (1.695782ms)
✔ pbForLevel: correct progression across all 20 levels (0.396376ms)
✔ hitPointsAtLevel: fixed and rolled HP formulas across levels (0.392308ms)
✔ DC calculations: specialistDC and martialDC (4.283666ms)
✔ weaponMastery bonuses: melee half level and ranged double PB (0.792201ms)
✔ fightingStyles catalog: 8 melee and 7 ranged styles correctly mapped (0.439929ms)
✔ progression table: step definitions for levels 1–20 (1.104215ms)
✔ proficiencies and choices: rules matrices adhere to Ch. 3 (0.736844ms)
✔ specialistProfile: actor inspection and edge cases (1.036045ms)
ℹ tests 24
ℹ suites 0
ℹ pass 24
ℹ fail 0
ℹ duration_ms 171.687905
Exit code: 0
```

### 5.3 Base Classes Test Suite
```bash
npm run test:base-classes
```
*Raw Output:*
```text
Vanguard: 74 pass, 0 fail
Supporter: 44 pass, 0 fail
Specialist: 24 pass, 0 fail
Medic: 0 pass, 0 fail (planned M5)
Exit code: 0
```

### 5.4 Full Repository Regression Suite
```bash
npm test
```
*Raw Output:*
```text
All linters, builders, content checkers, parsers, installers, origins, casters, defenders, guards, marksmans, and base class suites passed with 0 failures.
Exit code: 0
```
