# Medic Architecture Exploration Report: Base Medic, Physician & Triage

**Agent Identity:** Medic Architecture Explorer  
**Working Directory:** `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_medic_arch/`  
**Parent Agent:** `4dc2c4af-2b0a-43dd-b0c1-68e8edd29582`  
**Date:** 2026-10-13  
**Status:** COMPLETE / HARD HANDOFF  
**Deliverable Target:** `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_medic_arch/handoff.md`  

---

## 1. Observation

### 1.1 Direct Source Citations (Rules Authority)
From `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`:

1. **Medic Chassis & Proficiencies (L4582–4593):**
   - **Hit Dice:** `1d6 per Medic Level` (L4583).
   - **Hit Points at 1st Level:** `6 + your Constitution Modifier` (L4584).
   - **Hit Points at Higher Levels:** `1d6 (or 4) + your Constitution Modifier per Medic Level after 1st` (L4585).
   - **Armor Proficiencies:** `Light Shields` (L4588). *Crucial: Medics have no light armor proficiency; they are proficient strictly with Light Shields only. Light armor is obtained only if taking the Armoured Caster talent (L4801).*
   - **Weapon Proficiencies:** `Light Melee` (L4589).
   - **Tool Proficiencies:** `A Tool Kit/Vehicle Proficiency of your Choice` (L4590).
   - **Saving Throws:** `Choose Two from the following: Constitution, Intelligence, Wisdom` (L4591).
   - **Skills:** `Medicine + Two from: Lore, Arts, Tech, Insight, Perception, Persuasion` (L4592).
   - **Starting Equipment (L4594–4603):** Choice A: 1x Light Melee Weapon OR 1x Light Shield; Choice B: Arts Wand OR Arts Staff; Choice C: One Tool Kit proficient with; OR cash alternative `1300 LMD`.

2. **Arts Casting & Ability Choice (L4605–4615):**
   - **Arts Pool:** `You learn all of the Arts in the Healing Arts Special Arts Pool, and they are always Prepared` (L4608).
   - **Arts Points & Max Art Level:** Governed by the Medic Features table (L4620–4644).
   - **Spellcasting Ability:** `When you gain this Feature, choose either Intelligence or Wisdom; that is your Spellcasting Ability` (L4614).

3. **Medic Features Table (L4620–4644):**
   - **1st:** PB +2, Features: `Elite 0- Arts Casting, Life Support, Medical Expertise, Medic Branch`, Max Art Level 1, AP 3, Life Support 20.
   - **2nd:** PB +2, `Basic Operator Skill`, Max Art Level 1, AP 4, Life Support 35.
   - **3rd:** PB +2, `Basic Talent`, Max Art Level 2, AP 6, Life Support 35.
   - **4th:** PB +2, `Ability Score Improvement, Branch Feature`, Max Art Level 2, AP 7, Life Support 50.
   - **5th:** PB +3, `Self-Defence Protocol`, Max Art Level 3, AP 10, Life Support 50.
   - **6th:** PB +3, `Ability Score Improvement`, Max Art Level 3, AP 11, Life Support 65.
   - **7th:** PB +3, `Elite 1- Branch Feature, Advanced Operator Skill`, Max Art Level 4, AP 12, Life Support 65.
   - **8th:** PB +3, `Ability Score Improvement, Basic Talent Module`, Max Art Level 4, AP 15, Life Support 80.
   - **9th:** PB +4, `Advanced Talent`, Max Art Level 5, AP 16, Life Support 80.
   - **10th:** PB +4, `Ability Score Improvement`, Max Art Level 5, AP 17, Life Support 95.
   - **11th:** PB +4, `Branch Feature`, Max Art Level 6, AP 20, Life Support 95.
   - **12th:** PB +4, `Ability Score Improvement, Resuscitation`, Max Art Level 6, AP 21, Life Support 110.
   - **13th:** PB +5, `Advanced Talent Mastery`, Max Art Level 7, AP 22, Life Support 110.
   - **14th:** PB +5, `Elite 2- Elite Operator Skill`, Max Art Level 7, AP 25, Life Support 125.
   - **15th:** PB +5, `Branch Feature`, Max Art Level 8, AP 26, Life Support 125.
   - **16th:** PB +5, `Ability Score Improvement`, Max Art Level 8, AP 27, Life Support 140.
   - **17th:** PB +6, `9th Level Arts`, Max Art Level 9, AP 30, Life Support 140.
   - **18th:** PB +6, `To Rob the Ferryman`, Max Art Level 9, AP 31, Life Support 155.
   - **19th:** PB +6, `Ability Score Improvement`, Max Art Level 9, AP 32, Life Support 155.
   - **20th:** PB +6, `Chosen of Asclepius`, Max Art Level 9, AP 35, Life Support 170.

4. **Life Support & Base Features (L4647–4722):**
   - **Life Support (L4647–4648):** Replenishes on Long Rest.
   - **Touch Heal (L4650):** Action to touch creature and expend any amount of current Life Support to restore that many missing HP (1:1 conversion).
   - **Construct Restriction (Ch. 1 L138):** Constructs cannot regain HP from healing arts or features without explicit exception.
   - **Preserver (L4654):** Expend 5 Life Support to reroll any number of healing or temp HP dice for another creature (must use new results).
   - **Urgency of Treatment (L4656):** When casting from Healing Arts Pool, expend Life Support in multiples of 10 to reduce AP cost by 1 per 10 LS (minimum 0 AP).
   - **Medical Expertise (L4659):** Expertise in Medicine skill (double PB).
   - **Self-Defence Protocol (L4701):** 5th Level: Learn standard Caster Arts pool of <=5th level; cost 1 fewer AP (min 0), upgraded to 2 fewer AP at 11th level.
   - **Resuscitation (L4712):** 12th Level: 1/Long Rest cast Revivify without AP.
   - **To Rob the Ferryman (L4718):** 18th Level: Target revived with Revivify recovers HP equal to `3 * Medic Level`.
   - **Chosen of Asclepius (L4721):** 20th Level: Optional toggle to maximize all healing dice instead of rolling.

5. **Physician Subclass Features (L4871–4905):**
   - **Focused Treatment (1st Level, L4875):** When rolling to determine HP restored or damage dealt to only a single creature, add Proficiency Bonus to total.
   - **Intravenous Line (4th Level, L4880–4884):** 10 Life Support Action, creature within 15 ft, tune Arts for 10 minutes (or until used again). Unwilling creature makes CON save vs Spell Save DC (failure = tuned, success = 2d8 Necrotic damage). While tuned: sense direction, sense <50% max HP, once/turn add 1d6 (+2d6 at 7th level) to damage dealt or HP restored.
   - **Hypocritic Oath (7th Level, L4889–4891):** When rolling HP restored, choose to harm instead. Target makes CON save vs Spell Save DC: full Necrotic damage equal to rolled HP on failure, half on success. Counts as restoring HP for feature triggers.
   - **Inpatient Care / Healing Reverberations (11th Level, L4896):** Reaction on rolling HP restored to a creature; expend 15 Life Support. At start of Medic's next turn, target recovers HP equal to `max(floor(healed / 2), 15)`.
   - **Surgeon-General (15th Level, L4899):** When restoring HP to a single creature using Life Support, an Art, or an Operator Skill, double total HP restored.

6. **Triage Subclass Features (L5011–5048) & Mettle Rules (Ch. 1 L50–78):**
   - **Rapid Response / On the Scene (1st Level, L5017–5022):** 10 Life Support Action: move up to Speed without provoking Opportunity Attacks. Choose up to PB creatures moved within 5 ft: Heal restores 1d6 + Spellcasting Mod HP (2d6 + mod at 7th level); Harm melee spell attack deals 1d6 + Spellcasting Mod Necrotic damage on hit (2d6 + mod at 7th level).
   - **Urgent Care Centre (4th Level, L5026):** When rolling to restore HP to self with a levelled Art, all other creatures within 10 ft recover HP equal to half the amount rolled (`floor(rolled / 2)`).
   - **Emergency Medicine / Stop the Flow (7th Level, L5035):** 20 Life Support Action to touch a Dying creature. Target immediately gains 6 Mettle, allowing temporary exceedance of maximum Mettle of 6 up to hard cap of 8. Target cannot be affected again until no longer Dying.
   - **Touch of Life and Death (11th Level, L5038–5040):** When dealing damage or restoring HP via On the Scene, expend 10 Life Support: Heal ends condition with duration <= 1 hour (if > 1 hour, pauses for 1 hour); Harm inflicts Poisoned until beginning of Medic's next turn.
   - **Mobile Hospital (15th Level, L5045):** 1/Long Rest Bonus Action: 30 ft radius aura for 1 minute centered on Medic. When creature enters aura or aura enters space, restore 3d6 + Spellcasting Mod HP (no action, max once/round per creature).

### 1.2 Observed Existing Architectural Patterns
Inspected implementations in `ak5e/scripts/`:
- **Rules Modules (`vanguard-rules.mjs`, `supporter-rules.mjs`, `specialist-rules.mjs`):**
  - Pure functional calculations with zero Foundry globals required at import time.
  - Exported identifiers: `<CLASS>_CLASS_ID`, `<CLASS>_BRANCH_IDS`, `IMPLEMENTED_<CLASS>_BRANCHES`, `<CLASS>_SKILLS`, `<CLASS>_SAVES`, `<CLASS>_ARMOR_PROFS`, `<CLASS>_WEAPON_PROFS`, `<CLASS>_TOOL_CHOICES`, `ASI_LEVELS`, `<CLASS>_LEVEL_STEPS`, `STARTING_EQUIPMENT_OPTIONS`.
  - Core inspection functions: `checkLevel(level)`, `pbForLevel(level)`, `hitPointsAtLevel(level, conMod, options)`, `<class>Profile(actor)`, `<class>Enabled(actor)`, `<class>Level(actor)`, `<class>Branch(actor)`, `is<Class>(actor)`, `calculate<Class>Profile(actor)`.
- **Feature Modules (`vanguard-features.mjs`, `supporter-features.mjs`, `specialist-features.mjs`):**
  - Pure feature checkers: `has<Feature>(actor)`.
  - Pool registration: `define<Class>Pools()` calling `definePool()` in `resource-pools.mjs`.
  - Rest/recovery hooks: `on<Class>Rest(actor, restType)` hooking `dnd5e.restCompleted`.
- **Setup Modules (`vanguard-setup.mjs`, `supporter-setup.mjs`, `specialist-setup.mjs`):**
  - Core features array from Chapter 3: `{ id, level, name }`.
  - `preview<Class>Setup(actor)` returning `{ level, creates, kept, contextKey, actorUpdates }`.
  - `apply<Class>Setup(actor, { confirmed, contextKey })` ensuring strict transactional idempotency.
- **Progression Modules (`vanguard-progression.mjs`, `supporter-progression.mjs`, `specialist-progression.mjs`):**
  - Schema inspection: `inspect<Class>Fields(actor, choices)`.
  - Validation & preview: `preview<Class>Progression(actor, choices)`.
  - Application: `apply<Class>Progression(actor, { confirmed, contextKey, choices })` storing `state.hpLevels`, `state.asiLevels`, `state.startingEquipmentGranted` under `flags.ak5e.<class>Progression` to guarantee that re-running setup/progression never duplicates HP increases, ASIs, or equipment.
- **Table-Play Uses Modules (`vanguard-uses.mjs`, `supporter-uses.mjs`, `specialist-uses.mjs`):**
  - Built on `createPlayUses({ ns: "<class>Uses", label: "<Class>", isMember })`.
  - Strict enforcement of WORKFLOW §3.2:
    * Confirmation dialogs before committing state;
    * Non-blocking warnings with "Use anyway" overrides;
    * Resource shortfalls clamp at 0 and broadcast on chat cards;
    * Automatic GM relay for unowned target changes without human gates;
    * Interactive roll buttons on chat cards (no auto-rolled dice);
    * Reversible undo receipts in `flags.ak5e.<class>Uses.undo`.
- **Resource Pools Kernel (`resource-pools.mjs`):**
  - Normalizes max via `normalizeMax`: supports integers, formula strings, step arrays, and level row mappings (`steps`).
  - Supports `overMax: true` (line 177).
  - Recovery triggers: `"lr"`, `"sr"`, etc., with amounts `"full"`, `"toMax"`, `"toInitial"`.
- **Test Infrastructure (`ak5e/test/base-classes-fixture.mjs`):**
  - High-fidelity in-memory Foundry document mocks: `createTestActor(options)`, `setupFoundryGlobals()`, `teardownFoundryGlobals()`, `triggerShortRest()`, `triggerLongRest()`, `createTestCombat()`.
  - Test suites execute via `node --test` with 0 external dependencies.

---

## 2. Logic Chain

### 2.1 Module Breakdown & Implementation Contracts

```
ak5e/scripts/
├── medic-rules.mjs        # Pure math, level tables, proficiencies, DCs, profile checks
├── medic-features.mjs     # Feature predicates, lifeSupport pool definition, rest hooks
├── medic-setup.mjs        # previewMedicSetup & applyMedicSetup (idempotent embedded feature items)
├── medic-progression.mjs  # inspectMedicFields, previewMedicProgression, applyMedicProgression
├── medic-uses.mjs         # createPlayUses({ ns: "medicUses" }), command handlers, WORKFLOW §3.2
└── medic-sheet.mjs        # ActorSheetV2 badge, header buttons, action dialogs, undo viewer
```

#### 1. `ak5e/scripts/medic-rules.mjs`
- **Chassis Math & Closed Formulas:**
  - Hit Dice: `1d6 per Medic Level`.
  - Base HP at 1st level: `6 + conMod`.
  - HP per level after 1st: `4 + conMod` (fixed) or `rolled 1d6 + conMod`. Clamped to minimum 1 HP gain per level.
  - Life Support formula across levels 1–20:
    $$\text{Life Support} = 20 + 15 \times \lfloor \text{Level} / 2 \rfloor$$
    Exact table: Level 1: 20; Lv 2–3: 35; Lv 4–5: 50; Lv 6–7: 65; Lv 8–9: 80; Lv 10–11: 95; Lv 12–13: 110; Lv 14–15: 125; Lv 16–17: 140; Lv 18–19: 155; Lv 20: 170.
  - Arts Points (AP) table: `[3, 4, 6, 7, 10, 11, 12, 15, 16, 17, 20, 21, 22, 25, 26, 27, 30, 31, 32, 35]`.
  - Maximum Art Level table: `[1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 9]`.
- **DCs & Attack Modifiers:**
  - `medicSpellcastingAbility(actor)`: Resolves from `flags.ak5e.medic.spellcastingAbility` or progression choices (`"int"` or `"wis"`). If unspecified, defaults to the higher of INT or WIS modifier, falling back to `"wis"`.
  - `medicSpellDC(actor)`: `8 + pb + spellcastingMod`.
  - `medicSpellAttackMod(actor)`: `pb + spellcastingMod`.
  - `medicMartialDC(actor)`: `8 + pb + Math.max(strMod, dexMod)` (Ch. 1 L211).
- **Subclass & Profile Predicates:**
  - `MEDIC_CLASS_ID = "class-medic"`
  - `MEDIC_BRANCH_IDS = { "subclass-medic-physician": "physician", "subclass-medic-therapist": "therapist", "subclass-medic-triage": "triage", "subclass-medic-ward": "ward", "subclass-medic-witchcraft": "witchcraft" }`
  - `IMPLEMENTED_MEDIC_BRANCHES = ["physician", "triage"]`
  - `medicProfile(actor)`: Checks applicable character, valid class item, single class, level 1–20, branch item matching `chapterThreeId` or name.
  - `medicEnabled(actor)`: Returns `Boolean(profile.applicable && profile.configured && !profile.blocked.length)`.
  - `isMedic(actor)`: Returns `Boolean(medicEnabled(actor))`.
  - `isPhysician(actor)`: Returns `Boolean(medicEnabled(actor) && medicBranch(actor) === "physician")`.
  - `isTriage(actor)`: Returns `Boolean(medicEnabled(actor) && medicBranch(actor) === "triage")`.
  - `calculateMedicProfile(actor)`: Returns full object `{ level, pb, hp, saves, proficiencies, resources, features, dc, branch, branchId, classItem, branchItem }` matching PROJECT.md interface contract.

#### 2. `ak5e/scripts/medic-features.mjs`
- **Feature Level Checks:**
  - Base: `hasTouchHeal(actor)`, `hasPreserver(actor)`, `hasUrgencyOfTreatment(actor)`, `hasMedicalExpertise(actor)`, `hasSelfDefenceProtocol(actor)` (Lv 5), `hasResuscitation(actor)` (Lv 12), `hasToRobTheFerryman(actor)` (Lv 18), `hasChosenOfAsclepius(actor)` (Lv 20).
  - Physician: `hasFocusedTreatment(actor)` (Lv 1), `hasIntravenousLine(actor)` (Lv 4), `hasHypocriticOath(actor)` (Lv 7), `hasInpatientCare(actor)` (Lv 11), `hasSurgeonGeneral(actor)` (Lv 15).
  - Triage: `hasOnTheScene(actor)` (Lv 1), `hasUrgentCareCentre(actor)` (Lv 4), `hasStopTheFlow(actor)` (Lv 7), `hasTouchOfLifeAndDeath(actor)` (Lv 11), `hasMobileHospital(actor)` (Lv 15).
- **Resource Pool Registration:**
  ```javascript
  export function defineMedicPools() {
    if (!getPoolDefinition("lifeSupport")) {
      definePool({
        id: "lifeSupport",
        label: "Life Support",
        max: {
          1: 20, 2: 35, 3: 35, 4: 50, 5: 50, 6: 65, 7: 65, 8: 80, 9: 80, 10: 95,
          11: 95, 12: 110, 13: 110, 14: 125, 15: 125, 16: 140, 17: 140, 18: 155, 19: 155, 20: 170
        },
        initial: "max",
        overMax: true,
        classId: "class-medic",
        levelBasis: "classLevel",
        appliesTo: medicEnabled,
        recovery: [{ on: "lr", amount: "toMax" }]
      });
    }
  }
  ```
- **Lifecycle & Hook Wiring:**
  - `registerMedicHooks()`: Defines pools and registers listener on `dnd5e.restCompleted`.
  - On Long Rest: replenishes `lifeSupport` to max (`toMax`), resets 1/LR features (`resuscitation`, `mobileHospital`). Short Rest: zero Life Support recovery.

#### 3. `ak5e/scripts/medic-setup.mjs`
- **Core Features Catalog:**
  Maps Chapter 3 IDs:
  - Lv 1: `class-feature-medic-1st-level-arts-casting-4605`, `class-feature-medic-1st-level-life-support-4647`, `class-feature-medic-1st-level-medical-expertise-4658`, `class-feature-medic-1st-level-medic-branch-4665`.
  - Lv 2: `class-feature-medic-2nd-level-basic-operator-skill-4678`.
  - Lv 3: `class-feature-medic-3rd-level-basic-talent-4681`.
  - Lv 4: `class-feature-medic-4th-level-ability-score-improvement-4695`.
  - Lv 5: `class-feature-medic-5th-level-self-defence-protocol-4698`.
  - Lv 6: `class-feature-medic-6th-level-ability-score-improvement-4695`.
  - Lv 7: `class-feature-medic-7th-level-advanced-operator-skill-4703`.
  - Lv 8: `class-feature-medic-8th-level-ability-score-improvement-4695`, `class-feature-medic-8th-level-basic-talent-module-4681`.
  - Lv 9: `class-feature-medic-9th-level-advanced-talent-4706`.
  - Lv 10: `class-feature-medic-10th-level-ability-score-improvement-4695`.
  - Lv 12: `class-feature-medic-12th-level-ability-score-improvement-4695`, `class-feature-medic-12th-level-resuscitation-4709`.
  - Lv 13: `class-feature-medic-13th-level-advanced-talent-mastery-4706`.
  - Lv 14: `class-feature-medic-14th-level-elite-operator-skill-4714`.
  - Lv 16: `class-feature-medic-16th-level-ability-score-improvement-4695`.
  - Lv 18: `class-feature-medic-18th-level-to-rob-the-ferryman-4717`.
  - Lv 19: `class-feature-medic-19th-level-ability-score-improvement-4695`.
  - Lv 20: `class-feature-medic-20th-level-chosen-of-asclepius-4720`.
- **Preview & Idempotent Apply:**
  - `previewMedicSetup(actor)` partitions features into `creates` and `kept` based on whether items already exist on actor matching `chapterThreeId` or name.
  - `contextKey` hash: `JSON.stringify([actor.uuid, level, creates.map(c => c.name), kept])`.
  - `applyMedicSetup(actor, { confirmed, contextKey })` checks `confirmed === true` and `contextKey === plan.contextKey`. Updates `flags.ak5e.medic.enabled = true` and creates embedded items.

#### 4. `ak5e/scripts/medic-progression.mjs`
- **Choices Schema (`inspectMedicFields`):**
  - `branch`: Physician or Triage (if no subclass attached).
  - `spellcastingAbility`: Intelligence or Wisdom.
  - `saves`: Choose 2 from Constitution, Intelligence, Wisdom.
  - `skills`: Medicine is automatic (with expertise); choose 2 from Lore, Arts, Tech, Insight, Perception, Persuasion.
  - `tool`: A Tool Kit or Vehicle proficiency of choice.
  - `startingEquipment`: mode ("items" or "cash" [1300 LMD]). Items: Weapon (1x Light Melee Weapon OR 1x Light Shield), Focus (Arts Wand OR Arts Staff), Tool (1x Tool Kit).
  - `hp`: level 1 (fixed 6 or existing), higher levels (fixed 4 or rolled 1–6).
  - `asi`: levels 4, 6, 8, 10, 12, 16, 19 (+2 single or +1/+1 split).
  - `talents`: basic (Lv 3), basicModule (Lv 8), advanced (Lv 9), advancedModule (Lv 13).
- **Validation & Snapshot (`previewMedicProgression`):**
  - Validates exact counts: 2 saves, 2 skills, valid ASI increments (cannot exceed 20).
  - Computes writes:
    * `system.traits.saves.value`: chosen 2 saves.
    * `system.traits.armorProf.value`: `["shl"]` (Light Shields only).
    * `system.traits.weaponProf.value`: `["sim"]` (Light Melee).
    * `system.skills.med.value`: 2 (Medical Expertise).
    * `system.skills.<chosen>.value`: 1.
    * `system.attributes.hp.max`: computed HP.
    * `flags.ak5e.medic.spellcastingAbility`: `"int"` or `"wis"`.
  - Context key: `actorSnapshotKey(actor, choices, profile)`.
- **Idempotency Execution (`applyMedicProgression`):**
  - Stores `hpLevels`, `asiLevels`, `startingEquipmentGranted` in `flags.ak5e.medicProgression`.
  - Future runs treat previously granted levels as `{ mode: "existing" }`, strictly preventing duplicate HP increments or duplicate ASIs.

#### 5. `ak5e/scripts/medic-uses.mjs`
- Initialized via `createPlayUses({ ns: "medicUses", label: "Medic", isMember: medicEnabled })`.
- **Command Handlers & Plans:**
  1. **Base Medic:**
     - `touchHeal`: Action. Data: `{ amount, targetUuid }`.
       * Warnings:
         - Construct check: If target is a Construct, warn: `"Creatures of the Construct type cannot regain Hit Points from Medical features."`
         - Range check: Target distance > 5 ft triggers Touch range warning.
         - Shortfall check: If `amount > lifeSupport.value`, warn shortfall.
       * Spend: `spendResource(actor, receipt, { pool: "lifeSupport", amount, label: "Life Support" })`. Clamps at 0 if overridden; broadcasts shortfall.
       * Target Change: `targets: [{ uuid: targetUuid, kind: "heal", amount, ready: true }]`. Relays to GM automatically.
     - `preserver`: Data: `{ targetUuid }`.
       * Cost: 5 Life Support. Warnings: shortfall if < 5 LS.
       * Summary: `"Expends 5 Life Support to reroll healing or Temporary HP dice."`
     - `urgencyOfTreatment`: Data: `{ lsAmount }`.
       * Enforces multiples of 10 LS: `need(lsAmount % 10 === 0 && lsAmount >= 10, "Urgency of Treatment requires Life Support in multiples of 10.")`.
       * AP discount: `floor(lsAmount / 10)` AP.
       * Spends LS; updates receipt.
     - `resuscitation`: Level 12 gate. Cast Revivify 1/Long Rest without AP.
     - `chosenOfAsclepius`: Level 20 toggle flag `flags.ak5e.medic.chosenOfAsclepiusActive`.
  2. **Physician Subclass:**
     - `focusedTreatment`: Passive modifier flag / helper `focusedTreatmentBonus(actor)` returning PB when rolling healing/damage for a single creature.
     - `intravenousLine`: Action. Cost: 10 LS. Range: 15 ft. Data: `{ targetUuid, unwilling }`.
       * Target CON save vs Spell Save DC (`8 + pb + spellMod`).
       * Chat card renders Save button.
       * If unwilling and passes save: takes 2d8 Necrotic damage (interactive damage roll button).
       * If willing or fails save: sets tuning flag `flags.ak5e.physician.intravenousTuned = { targetUuid, tunedAt: worldTime }`.
       * Exclusivity: removes prior tuning.
       * Tuned bonus: +1d6 (Lv 4) / +2d6 (Lv 7) once/turn to damage or healing on tuned target.
     - `hypocriticOath`: Reaction / toggle when rolling healing.
       * Target CON save vs Spell Save DC.
       * Failed save: Necrotic damage = 100% of rolled healing. Successful save: 50% damage.
       * Interactive save & damage buttons on chat card. Counts as restoring HP for feature triggers.
     - `inpatientCare` / `healingReverberations`: Reaction when rolling healing. Cost: 15 LS.
       * Delayed heal scheduled for start of Medic's next turn: `max(floor(healed / 2), 15)`.
     - `surgeonGeneral`: Level 15 passive multiplier: doubles total HP restored on single target from LS, Art, or Operator Skill.
  3. **Triage Subclass:**
     - `onTheScene`: Action. Cost: 10 LS. Data: `{ targets: [{ uuid, mode: "heal"|"harm" }] }`.
       * Movement: up to Speed without provoking Opportunity Attacks.
       * Validates `targets.length <= pb`.
       * Heal targets: 1d6 + spellMod HP (2d6 at Lv 7). Card renders clickable heal roll button.
       * Harm targets: Melee spell attack. On hit, 1d6 + spellMod Necrotic damage (2d6 at Lv 7). Card renders attack roll and damage roll buttons.
     - `urgentCareCentre`: Level 4 trigger when healing self with levelled Art: allies within 10 ft recover `floor(healed / 2)` HP.
     - `stopTheFlow`: Action. Cost: 20 LS. Target: Dying creature (Touch range).
       * Warning if target is not Dying (`!hasStatus(target, "dying")`).
       * Warning if target already had Stop the Flow applied during this Dying episode (`flag(target, "triageStopTheFlowApplied")`).
       * Target Mettle update: adds 6 Mettle. Can exceed standard max 6 up to hard cap 8.
       * Relayed to GM; recorded in receipt.
     - `touchOfLifeAndDeath`: 10 LS rider on On the Scene.
       * Heal: ends condition with duration <= 1 hr, or pauses condition if > 1 hr.
       * Harm: inflicts Poisoned until beginning of Medic's next turn.
     - `mobileHospital`: Bonus Action. 1/Long Rest.
       * 30 ft aura for 1 minute (600 worldTime seconds).
       * Creature entering or entered: restores 3d6 + spellMod HP (once per round per creature). Clickable roll button on card.

#### 6. `ak5e/scripts/medic-sheet.mjs`
- Injects `.ak5e-medic-badge` into `.tab[data-tab="features"]`:
  * Displays current/max Life Support (with overMax badge if current > max).
  * Displays Spellcasting Ability (INT/WIS) and Spell DC.
  * Displays Subclass badge (Physician / Triage) and tuning status.
- Header button `Medic Controls` opens `DialogV2` with action triggers:
  * Touch Heal (spend X LS input dialog);
  * Preserver (5 LS);
  * Urgency of Treatment (10 LS multiple);
  * Physician: Intravenous Line, Inpatient Care;
  * Triage: On the Scene (target selector), Stop the Flow, Mobile Hospital;
  * Undo recent use dialog (`openPlayUndoList(medicUses, actor)`).
- Card controls: `renderPlayUseCard(medicUses, message, html)` injecting Roll, Retry, and Undo buttons.

---

### 2.2 Registration & Lifecycle Integration

1. **Resource Pools Registration (`resource-pools.mjs`):**
   - In `defineMedicPools()`, register `lifeSupport` with:
     * `overMax: true` to support temporary exceedance (e.g. Witchcraft and features);
     * `recovery: [{ on: "lr", amount: "toMax" }]` to restore pool to maximum on Long Rest and drop excess;
     * `classId: "class-medic"`;
     * `levelBasis: "classLevel"`.
2. **Canonical Module Exposure (`ak5e.mjs`):**
   - Register on `game.ak5e.medic`:
     ```javascript
     game.ak5e.medic = Object.freeze({
       preview: previewMedicSetup,
       apply: applyMedicSetup,
       choices: inspectMedicFields,
       previewProgression: previewMedicProgression,
       applyProgression: applyMedicProgression,
       profile: calculateMedicProfile,
       isMedic,
       isPhysician,
       isTriage,
       use: medicUses.command,
       uses: medicUses.uses,
       previewUndo: medicUses.previewUndo,
       open: openMedicControls,
       definePools: defineMedicPools
     });
     ```
   - Wire `registerMedicHooks()` and `registerMedicSheetHooks()` into `Hooks.once("ready", ...)` or `Hooks.once("init", ...)`.

---

### 2.3 Test Scaffolding Plan

Authored test suites under `ak5e/test/`:
1. `ak5e/test/medic-rules.test.mjs`:
   - `checkLevel`, `pbForLevel`, `hitPointsAtLevel` (1d6 HD, 6+CON at Lv 1, 4+CON at higher levels, min 1 HP clamp).
   - Life Support closed formula math ($20 + 15 \times \lfloor \text{Level} / 2 \rfloor$).
   - AP table (3 to 35) and Max Art Level table (1 to 9).
   - Saving throw choices (CON/INT/WIS pick 2) and skill choices (Medicine automatic + 2 of 6).
   - Proficiencies verification: Light Shields ONLY (no light armor).
   - Spell DC ($8 + \text{PB} + \text{MOD}$) and Martial DC ($8 + \text{PB} + \max(\text{STR}, \text{DEX})$).
   - Profile calculations and predicates (`isMedic`, `isPhysician`, `isTriage`).
2. `ak5e/test/medic-features.test.mjs`:
   - `lifeSupport` pool registration, initial value (`"max"`), overMax support.
   - Long Rest recovery to max; Short Rest provides zero recovery.
   - Feature predicates across levels 1–20.
3. `ak5e/test/medic-progression.test.mjs`:
   - `previewMedicSetup` and `applyMedicSetup` idempotency (no duplicate items on multiple runs).
   - `inspectMedicFields` schema options.
   - `previewMedicProgression` choice validation (rejects invalid saves, invalid skills, invalid ASI schemes).
   - Multi-level progression (Level 1 -> 4 -> 12 -> 20) verifying HP, ASIs, proficiencies, and talents.
   - Strict idempotency: re-running progression treats granted levels as existing and does not duplicate HP or ASIs.
4. `ak5e/test/medic-uses.test.mjs`:
   - Table-play uses: `touchHeal` (1:1 conversion, Construct warning, range warning, shortfall override clamp at 0).
   - `preserver` (5 LS spend and reroll summary).
   - `urgencyOfTreatment` (multiples of 10 LS validation and AP discount).
   - Physician uses: `intravenousLine` (10 LS, 15 ft range, CON save on unwilling, tuning state, 1d6/2d6 damage/heal bonus), `hypocriticOath` (heal-to-harm CON save), `inpatientCare` (15 LS reaction delayed heal), `surgeonGeneral` (doubling).
   - Triage uses: `onTheScene` (10 LS move speed, PB targets heal/harm with card roll buttons), `urgentCareCentre` (half heal splash), `stopTheFlow` (20 LS Dying touch, +6 Mettle up to 8 hard cap, Dying gate), `touchOfLifeAndDeath` (10 LS condition clear/poison rider), `mobileHospital` (1/LR BA 30 ft aura).
   - WORKFLOW §3.2 verification: confirm loops, interactive roll buttons on chat cards, unowned target GM relay, and reversible undo receipts.
5. `ak5e/test/medic-adversarial.test.mjs`:
   - Adversarial boundary testing: negative/zero numbers, out-of-range targets, non-Dying targets for Stop the Flow, exceeding hard cap 8 on Mettle, Construct healing attempts, simultaneous/replayed undo receipts.

*Package.json Status:* `"test:medic": "node --test ak5e/test/medic-*.test.mjs"` is already registered in `package.json` line 30, and included in `"test:base-classes"`.

---

### 2.4 Headless In-Foundry Browser Validation & Evidence Plan

1. **Harness Requirements (GEMINI.md §5, AGENTS.md §5.3):**
   - Playwright launcher: `launchTestBrowser()` from `ak5e/tools/test-browser.mjs`.
   - Host port: 30175 with clean `/tmp` user data copy of `standard-test`.
   - Strict Bash signal traps (`AK5E_TEST_PID`, EXIT, INT, TERM) stopping server on failure or completion.
2. **Live Script (`ak5e/tools/test-medic-live.mjs`):**
   - Launches Chromium with `launchTestBrowser(chromium)`.
   - Authenticates as `Gamemaster` and `Player`.
   - Creates or inspects three test actors:
     * Base Medic (Level 3);
     * Physician Medic (Level 7);
     * Triage Medic (Level 7).
   - Renders ActorSheetV2 sheets and verifies `.ak5e-medic-badge` displays Life Support and status.
   - Exercises action controls:
     * Triggers Touch Heal (verifying confirmation dialog and shortfall handling);
     * Triggers Intravenous Line (verifying tuning state badge);
     * Triggers On the Scene (verifying multi-target selection and chat card roll buttons);
     * Triggers Stop the Flow on a Dying actor (verifying Mettle update to 8);
     * Executes undo from the chat card or undo viewer (verifying state reversal).
   - Captures screenshots to `/tmp/ak5e-medic-live/`:
     * `01-medic-sheet-baseline.png`
     * `02-medic-touch-heal-dialog.png`
     * `03-physician-sheet-tuning.png`
     * `04-triage-on-the-scene-card.png`
     * `05-triage-stop-the-flow-undo.png`
   - Verifies `report.errors.length === 0`.
   - Delegates screenshot viewing to subagent per AGENTS.md §6.2.

---

## 3. Caveats

1. **Unimplemented Subclasses:** Therapist, Ward, and Witchcraft are out of scope for this batch (Physician and Triage only). Their branch IDs are cataloged in `MEDIC_BRANCH_IDS` for future implementation.
2. **Revivify Spell Record:** Chapter 5 does not contain a discrete *Revivify* Art entry. As documented in `DECISIONS.md` line 466, Resuscitation retains literal feature text; no invented Art, components, or limits are created. A standard or placeholder item is used if needed.
3. **Multi-Source AP Discounts:** Urgency of Treatment (10 LS per 1 AP) and Self-Defence Protocol (-1 or -2 AP) interact with other cost rules. As noted in `DECISIONS.md` line 485, no universal discount order is invented; GM resolves order and records AP manually when ambiguous.
4. **Mettle & Dying Hook Independence:** Stop the Flow allows exceeding max Mettle of 6 up to a hard cap of 8. The engine must check that target has the Dying condition and that this feature was not previously applied during the same Dying episode.
5. **Read-Only Scope:** This report represents pure architecture exploration; no production files were modified.

---

## 4. Conclusion

The architecture for the AK5e Medic base class and its Physician and Triage subclasses is fully mapped and conforms strictly to Chapter 3 source rules (`03_chapter_3_character_classes.txt` L4560–5048), `WORKFLOW.md` §3.2, `GEMINI.md`, and the established patterns of `vanguard-*`, `supporter-*`, and `specialist-*`.

The 6 target scripts (`medic-rules.mjs`, `medic-features.mjs`, `medic-setup.mjs`, `medic-progression.mjs`, `medic-uses.mjs`, `medic-sheet.mjs`), lifecycle wiring in `resource-pools.mjs` and `ak5e.mjs`, unit test scaffolding under `ak5e/test/medic-*.test.mjs`, and the browser validation harness `test-medic-live.mjs` have clear, deterministic specifications ready for immediate implementation.

---

## 5. Verification Method

1. **Static Validation & File Integrity:**
   ```bash
   node ak5e/tools/validate-files.mjs
   node ak5e/tools/verify-generated-content.mjs
   ```
2. **Unit Test Execution:**
   ```bash
   npm run test:medic
   npm run test:base-classes
   ```
3. **Progression Stress Testing:**
   ```bash
   node --test ak5e/test/medic-progression.test.mjs ak5e/test/medic-adversarial.test.mjs
   ```
4. **Live In-Foundry Headless Browser Validation:**
   ```bash
   # Run against disposable /tmp test data copy on port 30175 with launchTestBrowser()
   AK5E_TEST_PORT=30175 node ak5e/tools/test-medic-live.mjs
   # Inspect generated browser-report.json for errors: []
   cat /tmp/ak5e-medic-live/browser-report.json
   ```
5. **Screenshot Inspection:**
   Delegate all captured screenshots in `/tmp/ak5e-medic-live/` to a reviewer subagent per AGENTS.md §6.2.
