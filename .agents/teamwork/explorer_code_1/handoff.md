# Handoff Report — Specialist Base Class and Subclasses Codebase Investigation

## 1. Observation

### 1.1 Existing Specialist Files & Status
- **`ak5e/scripts/specialist-rules.mjs`** (304 lines):
  - Pure calculation module defining:
    - `SPECIALIST_CLASS_ID = "class-specialist"`
    - `SPECIALIST_BRANCH_IDS` mapping:
      ```javascript
      export const SPECIALIST_BRANCH_IDS = Object.freeze({
        "subclass-specialist-executor": "executor",
        "subclass-specialist-hookmaster": "hookmaster",
        "subclass-specialist-infuser": "infusion",
        "subclass-specialist-inventor": "inventor",
        "subclass-specialist-skyranger": "skyranger",
        "subclass-specialist-dollkeeper": "dollkeeper",
        "subclass-specialist-trapmaster": "trapmaster"
      });
      ```
    - `MELEE_FIGHTING_STYLES` (8 styles: Brawler, Deadly Fighter, Defensive, Duelling, Great Weapon Fighting, Lightly Armed, Spearwall, Two-Weapon Fighting) and `RANGED_FIGHTING_STYLES` (7 styles: Braced for Action, Close and Personal, Cone of Fire, Deadly Fighter, Ranger, Smooth Operator, Two-Weapon Fighting).
    - Progression level steps (`SPECIALIST_LEVEL_STEPS`), Hit points calculations (`hitPointsAtLevel`), DC formulas (`specialistDC = 8 + PB + DEX`, `martialDC = 8 + PB + max(STR, DEX)`), Weapon Mastery bonuses (`weaponMasteryMeleeBonus`, `weaponMasteryRangedBonus`).
    - Profile inspectors (`specialistProfile`, `specialistEnabled`, `specialistLevel`, `specialistBranch`, `calculateSpecialistProfile`).
    - **Missing Exports**: Does not export `isSpecialist(actor)`, `isExecutor(actor)`, `isHookmaster(actor)`, or `isInfuser(actor)`.
- **`ak5e/scripts/specialist-progression.mjs`** (673 lines):
  - Implements `inspectSpecialistFields`, `specialistChoices`, `previewSpecialistProgression`, and `applySpecialistProgression`.
  - Enforces:
    - Dex automatic save + 1 choice from Wis/Cha (`SPECIALIST_SAVES`).
    - Exactly 3 skills from `SPECIALIST_SKILLS`.
    - Weapon Category (`melee` or `ranged`) and valid style matching category.
    - Starting Equipment: Items package or 1300 LMD (added to CP).
    - HP per level: Level 1 fixed 8 + CON, levels 2–20 fixed 5 or rolled 1d8.
    - ASIs at levels 4, 6, 8, 10, 12, 16, 19 (+2 to one stat or +1/+1 to two stats, max 20).
    - Talents at levels 3 (Basic), 8 (Basic Module or second Basic), 9 (Advanced), 13 (Advanced Module or second Advanced).
    - Idempotency via `state.hpLevels` and `state.asiLevels` tracking.
- **`ak5e/scripts/specialist-setup.mjs`** (105 lines):
  - `SPECIALIST_CORE_FEATURES` lists 13 features across levels 1 to 18.
  - Implements `previewSpecialistSetup` and `applySpecialistSetup` with deterministic `contextKey` and idempotency.
- **`ak5e/scripts/specialist-features.mjs`** (82 lines):
  - Predicates: `hasWeaponSpecialisation`, `getWeaponSpecialisation`, `hasShowYourStyle`, `hasWeaponAdept`, `hasWeaponExpertise`, `hasFallingUpwards`, `hasWeaponMastery`.
  - Pool registration: `defineSpecialistPools()` defines `prowess` (max `@prof`, initial 0, applies to level >= 4 or `prowessEarlyUnlocked`, recovery: `1 on sr`, `1 on lr`).
  - Rest recovery hook: `onSpecialistRest` calls `recoverPool(actor, trigger)`.
  - **Incomplete / Missing Hooks**: Missing all runtime roll/attack/damage hooks for Fighting Styles, Weapon Adept extra attacks/damage rerolls, Weapon Expertise crit/advantage, and Weapon Mastery damage/PB doubling.
- **`ak5e/scripts/specialist-uses.mjs`** (283 lines):
  - Registered `specialistUses = createPlayUses({ ns: "specialistUses", label: "Specialist", ... })`.
  - Core plans implemented: `markOfASpecialist`, `refundMarkOfASpecialist`, `weaponExpertiseMelee`, `weaponExpertiseRanged`, `itsAllSkill`, `weaponMasteryMelee`, `weaponMasteryRanged`, `defensiveStyle`.
  - **Missing Subclass Plans**: 0 plans registered for Executor, Hookmaster, or Infuser.

### 1.2 Missing Files
- **`ak5e/scripts/specialist-sheet.mjs`**: MISSING (0 bytes, file does not exist).
- **`ak5e/scripts/executor-features.mjs`**: MISSING (file does not exist).
- **`ak5e/scripts/hookmaster-features.mjs`**: MISSING (file does not exist).
- **`ak5e/scripts/infuser-features.mjs`**: MISSING (file does not exist).
- **`ak5e/test/executor.test.mjs`**: MISSING (file does not exist).
- **`ak5e/test/hookmaster.test.mjs`**: MISSING (file does not exist).
- **`ak5e/test/infuser.test.mjs`**: MISSING (file does not exist).
- **`ak5e/tools/test-specialist-live.mjs`**: MISSING (file does not exist).

### 1.3 Module Registration & Integration
- **`ak5e/scripts/ak5e.mjs`**:
  - `specialist` is NOT imported.
  - `game.ak5e.specialist` is NOT registered.
  - `registerSpecialistHooks()` is NOT called in `Hooks.once("ready", ...)`.
  - `specialistUses.handleRelay` is NOT registered in `Hooks.on("createChatMessage", ...)`.
  - `registerSpecialistSheetHooks()` is NOT called.
- **`ak5e/scripts/resource-pools.mjs`**:
  - `prowess` pool is NOT registered inside `resource-pools.mjs`. (It is currently defined dynamically inside `ak5e/scripts/specialist-features.mjs:52–68`).

### 1.4 Compendium & Source Assets
- **`ak5e/scripts/chapter-three-content.mjs`**:
  - `class-specialist` is present at line 21246.
  - `subclass-specialist-executor` is present at line 24357.
  - `subclass-specialist-hookmaster` is present at line 24450.
  - `subclass-specialist-infuser` is present at line 24543.
  - All 15 Basic Talents and 18 Advanced Talents are present.
  - All 34 Operator Skills are present.

### 1.5 Test Verification
- Executed: `npm run test:specialist` (`node --test ak5e/test/specialist-*.test.mjs`)
  - `ak5e/test/specialist-adversarial.test.mjs`: 24 passing tests.
  - `ak5e/test/specialist-features.test.mjs`: 8 passing tests.
  - `ak5e/test/specialist-progression.test.mjs`: 7 passing tests.
  - `ak5e/test/specialist-rules.test.mjs`: 9 passing tests.
  - Total: **48 passing tests, 0 failures, 0 skipped**.
- Executed: `node ak5e/tools/validate-files.mjs`
  - Validated module.json, lang/en.json, and 266 .mjs files. Exit code 0.
- Executed: `node ak5e/tools/verify-generated-content.mjs`
  - Verified 2,193 top-level records and 801 embedded Chapter 6 features against source. Exit code 0.

### 1.6 Decisions Log & Rulings
- **`ak5e/DECISIONS.md`**:
  - Line 465: `Infuser DC | C3:5689 prints “20 - Your Intelligence Modifier - Your Proficiency Bonus”. | UNRESOLVED. Preserve subtraction exactly; do not replace it with a conventional D&D5e DC.`
  - Line 469: `Grit | Hidden Technique C3:1177 (also 4832, 5479, 8199) says “You gain 2 Grit Points” and grants Basic Brawler Techniques, with Short/Long Rest recovery. Brawler Techniques instead spend Aggression. | UNRESOLVED. Keep Grit and Aggression separate; no expenditure conversion or substitute pool.`
- **`TODO.md` Open Interpretations**:
  - Specialist: Duplicate styles across lists / Parabellum (L5249, L5391); Spearwall die; Weapon Mastery rounding (L5354); Short Rest Prowess +1 only.
  - Executor: Attack miss vs hit for Deathmark transfer; multiple Deathmark holders; Mortal Blow HP loss vs Temp HP / DR; level 7/14 class vs character level scaling.
  - Hookmaster: Hook "must not have / gains Two-Handed" (L5589 / 5594); same-space Wrangler; environmental damage source for Prowess.
  - Infuser: Infuser DC formula `20 - INT - PB` vs `8 + INT + PB` (per-use reading / GM ruling option); branch identifier "infusion" vs "infuser"; Invulnerability definition (1 minute prevent HP loss); Toxin DC + PB scaling.

### 1.7 Repository State & Git Status
- Working branch: `audit/guard-baseline`
- Uncommitted modifications: `TODO.md`, `ak5e/DECISIONS.md`, `ak5e/scripts/ak5e.mjs`, `ak5e/scripts/resource-pools.mjs`, `ak5e/styles/ak5e.css`, `package.json`, `.agents/teamwork/ORIGINAL_REQUEST.md`, `.agents/teamwork/sentinel/*`.
- Untracked files: base class files for Vanguard, Supporter, Specialist, Medic.
- MANDATORY constraint: All uncommitted edits must be strictly preserved.

---

## 2. Logic Chain

1. **Base Chassis & Progression Quality**:
   - Observations 1.1 and 1.5 confirm that base Specialist rules (`specialist-rules.mjs`), setup (`specialist-setup.mjs`), progression (`specialist-progression.mjs`), and base uses (`specialist-uses.mjs`) have already been authored and pass 48 automated tests covering level 1–20 chassis, proficiencies, starting gear / 1300 LMD, ASIs, HP, fighting style selection, and base prowess expenditures.
2. **Missing Subclass Modules**:
   - Observation 1.2 shows that `executor-features.mjs`, `hookmaster-features.mjs`, and `infuser-features.mjs` do not exist.
   - Observation 1.1 shows that `specialist-uses.mjs` has only 8 base plans and no subclass plans.
   - Therefore, the 3 required subclasses (Executor, Hookmaster, Infuser) are completely unimplemented.
3. **Missing Sheet UI & Badges**:
   - Observation 1.2 shows `specialist-sheet.mjs` does not exist.
   - Comparing against `medic-sheet.mjs` (Observation 1.7) reveals that Specialist lacks the ActorSheetV2 panel, Prowess status badge, subclass badges (Deathmark, Hook, Infusions), interactive controls dialog, and roll button cards.
4. **Missing Namespace & Hook Integration**:
   - Observation 1.3 shows `ak5e/scripts/ak5e.mjs` has no imports or registrations for `specialist`.
   - Without registering `game.ak5e.specialist`, calling `registerSpecialistHooks()`, and attaching `specialistUses.handleRelay`, the class cannot function in live Foundry V13 sessions or relay unowned target updates.
5. **Prowess Registration Consistency**:
   - Observation 1.3 shows `resource-pools.mjs` does not register `prowess` directly, unlike other classes. While `specialist-features.mjs` defines it on hook init, adding `registerProwessPool()` to `resource-pools.mjs` (or calling it from `registerResourcePoolHooks`) ensures standard system-wide pool registration.
6. **Subclass Identification & Rulings**:
   - Observation 1.1 reveals `specialist-rules.mjs` lacks `isSpecialist`, `isExecutor`, `isHookmaster`, and `isInfuser` export functions.
   - Observation 1.6 highlights that `subclass-specialist-infuser` is mapped to `"infusion"` in `SPECIALIST_BRANCH_IDS` (matching the class table L5232), while the chapter heading is "Infuser" (L5684). Both identifiers should be supported.
   - Observation 1.6 highlights the unresolved Infuser DC formula (`20 - INT - PB`) which should be retained with an optional per-use reading for standard DC (`8 + INT + PB`) per DECISIONS.md.

---

## 3. Caveats

- **Inventor, Skyranger, Dollkeeper, Trapmaster**: These other Specialist subclasses from Chapter 3 were not investigated in depth, as the user request is strictly scoped to Base Specialist, Executor, Hookmaster, and Infuser.
- **Headless Chromium Session**: In-Foundry live browser testing (`ak5e/tools/test-specialist-live.mjs`) was not executed during this turn, because the live script and the subclass implementations do not yet exist.
- **No Production Modifications**: Per explorer role constraints, zero production files were modified.

---

## 4. Conclusion

The AK5e Specialist base class has a solid foundation already authored on disk (`specialist-rules.mjs`, `specialist-progression.mjs`, `specialist-setup.mjs`, `specialist-features.mjs`, `specialist-uses.mjs`) with 48 passing tests.

However, the following work remains to achieve 100% completion of the user request:
1. **Helper Functions & Rulings**:
   - Export `isSpecialist`, `isExecutor`, `isHookmaster`, and `isInfuser` from `specialist-rules.mjs`.
   - Normalize Infuser branch identification (accepting both `infuser` and `infusion`).
   - Register Infuser DC ruling support in `specialist-rules.mjs` / `specialist-uses.mjs`.
2. **Subclass Implementations**:
   - Create `ak5e/scripts/executor-features.mjs` with Hunter/Bodyguard choice, Deathmark tracking and returns, Sweeper, Smokescreen, Preysense/Dangersense, In for the Kill/Blade Shield, Mortal Blow/Ultimate Sword and Shield.
   - Create `ak5e/scripts/hookmaster-features.mjs` with Hook conversion, Big Boot, King of the Urban Jungle, Bound in Rope, Wrangler, Mighty Push, Spider's Essence, Scorpion Sting.
   - Create `ak5e/scripts/infuser-features.mjs` with Alchemical Infusions (8 types), Leverage CON save workflow, New Concoctions (Neurological Inhibitor, Bungarotoxin), Double-Blind Trial (1d6 roll), Stimpack, Excessive Dosing, To Defy Science.
3. **Table-Play Uses Expansion**:
   - Register all Executor, Hookmaster, and Infuser action plans in `ak5e/scripts/specialist-uses.mjs` with confirm dialogs, non-blocking warnings, shortfall overrides, no auto-rolled dice, GM target relay, and undo receipts.
4. **Sheet UI**:
   - Create `ak5e/scripts/specialist-sheet.mjs` with Prowess and subclass badges on `ActorSheetV2`, `openSpecialistControls()` dialog, and card roll buttons.
   - Add `.ak5e-specialist-badge` styles in `ak5e/styles/ak5e.css`.
5. **Module Integration**:
   - Wire `specialist` into `ak5e/scripts/ak5e.mjs`: expose `game.ak5e.specialist`, register hooks, sheet hooks, and chat relay.
   - Register `registerProwessPool()` in `ak5e/scripts/resource-pools.mjs`.
6. **Subclass & Adversarial Tests**:
   - Author `ak5e/test/executor.test.mjs`, `ak5e/test/hookmaster.test.mjs`, and `ak5e/test/infuser.test.mjs`.
7. **Live Browser Verification**:
   - Author and execute `ak5e/tools/test-specialist-live.mjs` via `launchTestBrowser()` on port 30175 with screenshot capture and inspection.

---

## 5. Verification Method

To independently verify these findings:

1. **Verify Existing Tests**:
   ```bash
   npm run test:specialist
   ```
   *Expected outcome*: 48 passed tests across 4 test suites.

2. **Verify File Validation**:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   *Expected outcome*: Exits with code 0.

3. **Verify Generated Content Integrity**:
   ```bash
   node ak5e/tools/verify-generated-content.mjs
   ```
   *Expected outcome*: Exits with code 0 (2193 top-level records, 801 embedded features).

4. **Verify Absence of Subclass Files**:
   ```bash
   ls ak5e/scripts/executor-features.mjs ak5e/scripts/hookmaster-features.mjs ak5e/scripts/infuser-features.mjs ak5e/scripts/specialist-sheet.mjs
   ```
   *Expected outcome*: "No such file or directory" for each.

5. **Verify ak5e.mjs Registration**:
   ```bash
   grep -n "specialist" ak5e/scripts/ak5e.mjs
   ```
   *Expected outcome*: 0 matches.
