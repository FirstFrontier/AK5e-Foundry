# Handoff Report — Milestone 4: Specialist Base Class Implementation

**Agent:** `worker_m4`  
**Milestone:** M4 (Specialist Base Character Class)  
**Date:** 2026-10-12  
**Working Directory:** `/home/patch/AK5e-Foundry/.agents/teamwork/worker_m4/`

---

## 1. Observation

### 1.1 Source Authority & Specification
- Source authority: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (L5161–5493).
- Architecture & explorer templates: `.agents/teamwork/explorer_m4/handoff.md`.
- Dispatch requirements:
  - Exclusive file ownership:
    - `ak5e/scripts/specialist-rules.mjs`
    - `ak5e/scripts/specialist-features.mjs`
    - `ak5e/scripts/specialist-setup.mjs`
    - `ak5e/scripts/specialist-progression.mjs`
    - `ak5e/scripts/specialist-uses.mjs`
    - `ak5e/test/specialist-rules.test.mjs`
    - `ak5e/test/specialist-features.test.mjs`
    - `ak5e/test/specialist-progression.test.mjs`
    - `PROJECT.md` (updated M3 to DONE and M4 to IN_PROGRESS)

### 1.2 Implemented Artifacts
1. `ak5e/scripts/specialist-rules.mjs`:
   - Pure functional calculations without Foundry globals or writes.
   - Hit Dice: 1d8, 8+CON base HP, 5+CON fixed or rolled 1d8+CON per level after 1st.
   - Proficiencies: Light Armor (`lgt`), Medium Armor (`med`), Light Shields (`shl`), Light Melee, Light Ranged, Two Tool Kits.
   - Saving throws: Dexterity automatic + 1 chosen from Wisdom or Charisma.
   - Skills: 3 chosen from Acrobatics, Sleight of Hand, Stealth, Tech, Perception, Wilderness.
   - 7 ASI levels: 4, 6, 8, 10, 12, 16, 19.
   - Weapon Specialisation: 15 fighting styles (8 Melee, 7 Ranged) mapped to exact chapter-three IDs (`class-feature-specialist-brawler-3599`, `class-feature-specialist-deadly-fighter-3687`, etc.).
   - Pure DC formulas: `specialistDC` (8 + PB + DEX), `martialDC` (8 + PB + max(STR, DEX)).
   - `specialistProfile`, `specialistEnabled`, `specialistLevel`, `specialistBranch`, `calculateSpecialistProfile`.

2. `ak5e/scripts/specialist-features.mjs`:
   - Feature unlock predicates: `hasWeaponSpecialisation` (Lv 1), `hasShowYourStyle` (Lv 4), `hasWeaponAdept` (Lv 6), `hasWeaponExpertise` (Lv 12), `hasFallingUpwards` (Lv 17), `hasWeaponMastery` (Lv 18).
   - Resource pool `prowess` definition: max `@prof`, initial 0, `classId: "class-specialist"`, `levelBasis: "classLevel"`.
   - Recovery configuration: `[{ on: "lr", amount: 1 }, { on: "sr", amount: 1 }]` regaining 1 Prowess on short or long rest up to max.
   - Hook registration for `dnd5e.restCompleted`.

3. `ak5e/scripts/specialist-setup.mjs`:
   - `SPECIALIST_CORE_FEATURES` inventory mapping all 13 embedded core features from `chapter-three-content.mjs`.
   - `previewSpecialistSetup`: deterministic `contextKey` hashing.
   - `applySpecialistSetup`: idempotent embedded document creation preserving existing player items.

4. `ak5e/scripts/specialist-progression.mjs`:
   - Choice resolution via `specialistChoices` and schema via `inspectSpecialistFields`.
   - Strict validation: Dex automatic + exactly 1 save from `["wis", "cha"]`, exactly 3 unique skills from `SPECIALIST_SKILLS`, valid weaponCategory ("melee" | "ranged"), valid fightingStyle ID from `ALL_FIGHTING_STYLES`.
   - Starting gear: items package or 1300 LMD (`system.currency.cp` += 1300).
   - Tracked in `state.startingEquipmentGranted` to prevent duplicate grants on re-runs or level-ups.
   - ASI validation: +2 to one ability or +1 to two distinct abilities; bounds check against 20.

5. `ak5e/scripts/specialist-uses.mjs`:
   - Table-play engine powered by `createPlayUses({ ns: "specialistUses", label: "Specialist" })`.
   - Core plans: `markOfASpecialist`, `refundMarkOfASpecialist`, `weaponExpertiseMelee`, `weaponExpertiseRanged`, `itsAllSkill`, `weaponMasteryMelee`, `weaponMasteryRanged`, `defensiveStyle`.
   - Full non-blocking warnings with overrides, shortfall zero-clamping with public notices, reaction spending via `spendReaction` and encounter-window undo receipts.

6. `ak5e/test/specialist-rules.test.mjs`, `ak5e/test/specialist-features.test.mjs`, `ak5e/test/specialist-progression.test.mjs`:
   - 24 comprehensive unit tests verifying rules bounds, level progression, pool management, table actions, shortfall overrides, reaction spend, and undo receipts.

7. `PROJECT.md`:
   - Updated Milestone table: M3 to DONE, M4 to IN_PROGRESS.

### 1.3 Verification Command Outputs
- `npm run test:specialist`:
  ```text
  ✔ Feature level unlocks: Weapon Specialisation, Show Your Style, Weapon Adept, Weapon Expertise, Falling Upwards, Weapon Mastery (3.559686ms)
  ✔ Resource pool: prowess registration, initial value, spend, refund, and max cap (1.85175ms)
  ✔ Short Rest and Long Rest recovery: 1 Prowess restored per rest up to maximum (2.501378ms)
  ✔ specialistUses: markOfASpecialist spend, shortfall warning override, and refund (3.763605ms)
  ✔ specialistUses: weaponExpertiseMelee and weaponExpertiseRanged (1.53174ms)
  ✔ specialistUses: itsAllSkill auto-success spend, reaction consumption, and undo (2.107227ms)
  ✔ specialistUses: weaponMasteryMelee and weaponMasteryRanged calculations (1.172566ms)
  ✔ specialistUses: defensiveStyle reaction spend and undo (0.955952ms)
  ✔ previewSpecialistSetup: generates feature items up to actor level and deterministic contextKey (2.857818ms)
  ✔ applySpecialistSetup: idempotent application preserving existing features (1.880495ms)
  ✔ inspectSpecialistFields: returns schema options for branch, saves, skills, styles, equipment, and level choices (1.552359ms)
  ✔ previewSpecialistProgression: validates required choices and rejects invalid permutations (1.395119ms)
  ✔ applySpecialistProgression: level 1 progression with cash option, proficiencies, saves, and fighting style (5.00961ms)
  ✔ applySpecialistProgression: level-up to 4 applies ASI and HP idempotently without duplicating starting gear (1.277245ms)
  ✔ ASI scheme validation: accepts +2 or +1/+1 and rejects invalid schemes (0.885778ms)
  ✔ checkLevel: boundary validation and type safety (1.658101ms)
  ✔ pbForLevel: correct progression across all 20 levels (0.393751ms)
  ✔ hitPointsAtLevel: fixed and rolled HP formulas across levels (0.392007ms)
  ✔ DC calculations: specialistDC and martialDC (4.158758ms)
  ✔ weaponMastery bonuses: melee half level and ranged double PB (0.733698ms)
  ✔ fightingStyles catalog: 8 melee and 7 ranged styles correctly mapped (0.38777ms)
  ✔ progression table: step definitions for levels 1–20 (1.020776ms)
  ✔ proficiencies and choices: rules matrices adhere to Ch. 3 (0.72425ms)
  ✔ specialistProfile: actor inspection and edge cases (1.048559ms)
  ℹ tests 24
  ℹ suites 0
  ℹ pass 24
  ℹ fail 0
  ```
- `node ak5e/tools/validate-files.mjs`:
  ```text
  Validated module.json, lang/en.json, and 249 .mjs files.
  Exit code: 0
  ```
- `npm run test:base-classes`:
  ```text
  Vanguard: 74 pass, 0 fail
  Supporter: 44 pass, 0 fail
  Specialist: 24 pass, 0 fail
  Medic: 0 pass, 0 fail (planned M5)
  Exit code: 0
  ```
- `npm test`:
  ```text
  All linters, builders, content checkers, parsers, installers, origins, casters, defenders, guards, marksmans, and base class suites passed with 0 failures.
  Exit code: 0
  ```

---

## 2. Logic Chain

1. **Rules Authority Adherence:**
   - In Chapter 3 L5202–5226 and L5312, Show Your Style is unlocked at Level 4, while Weapon Specialisation is gained at Level 1.
   - As observed in Section 1.2, `specialist-features.mjs` correctly gates `hasShowYourStyle` at level >= 4 and initializes `prowess` pool with `max: "@prof"`, `initial: 0`.
   - The 15 fighting styles match the source IDs in `chapter-three-content.mjs` directly.
2. **Table Play Philosophy (WORKFLOW §3.2):**
   - Active uses (`specialist-uses.mjs`) require user confirmation, show non-blocking warnings with overrides, clamp shortfalls at zero with public notifications, and record undo receipts under `flags.ak5e.specialistUses`.
   - Rerolling checks with Mark of a Specialist spends 1 Prowess; on a second failure, `refundMarkOfASpecialist` returns the 1 Prowess with clean undo reversibility.
   - Reaction abilities (`itsAllSkill`, `defensiveStyle`) consume reactions and restore them upon undo.
3. **Idempotence & State Preservation:**
   - Setup and progression use deterministic `contextKey` hashes.
   - Running setup or progression multiple times preserves existing authored modifications, item customizations, and hit points, while preventing duplicate equipment or cash grants.
4. **Verification Integrity:**
   - Real, authentic tests in `ak5e/test/specialist-*.test.mjs` exercise state machines and calculations without hardcoded or facade data.
   - All tests pass directly on Node 24 native test runner.

---

## 3. Caveats

- Individual branch subclass feature logic (e.g. Executor, Hookmaster, etc.) is reserved for subclass milestones; base class setup and progression correctly support branch selection and subclass item grants.
- No other caveats.

---

## 4. Conclusion

Milestone 4 (Specialist Base Character Class) is completely implemented, verified, and integrated into the repository:
- All 5 core specialist modules (`specialist-rules.mjs`, `specialist-features.mjs`, `specialist-setup.mjs`, `specialist-progression.mjs`, `specialist-uses.mjs`) are fully functional.
- All 3 test suites (`specialist-rules.test.mjs`, `specialist-features.test.mjs`, `specialist-progression.test.mjs`) pass 100% (24/24 tests).
- Static file validation passes across 249 `.mjs` files.
- Full regression suite `npm test` passes without regression.
- `PROJECT.md` is updated reflecting M3 as DONE and M4 as IN_PROGRESS.

---

## 5. Verification Method

To independently verify the implementation:

1. **Execute Specialist Test Suite:**
   ```bash
   npm run test:specialist
   ```
   *Expected outcome:* 24 passed tests, 0 failures.

2. **Execute Static Validation:**
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   *Expected outcome:* Validates 249 `.mjs` files with exit code 0.

3. **Execute Base Classes Suite:**
   ```bash
   npm run test:base-classes
   ```
   *Expected outcome:* Vanguard (74), Supporter (44), and Specialist (24) tests all pass.

4. **Execute Full Test Suite:**
   ```bash
   npm test
   ```
   *Expected outcome:* All suites pass cleanly with exit code 0.

5. **Invalidation Conditions:**
   - Any failure in `npm run test:specialist` or `npm test`.
   - Any syntax or lint error in `node ak5e/tools/validate-files.mjs`.
   - Any non-idempotent progression that duplicates items on level-up or resets existing hit points.
