## 2026-10-17T11:15:50Z
Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/worker_m4_8/.
You are the Implementer Worker for Milestone 4: Infuser Subclass Implementation & Tests.

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read first:
- /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (mandatory)
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/SCOPE.md
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/GATE_STATUS.md
- /home/patch/AK5e-Foundry/AGENTS.md, /home/patch/AK5e-Foundry/WORKFLOW.md, /home/patch/AK5e-Foundry/GEMINI.md
- Explorer Handoff Report: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m4_1/handoff.md
- Source rules: /home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (lines 5688–5823)
- Decision log: /home/patch/AK5e-Foundry/ak5e/DECISIONS.md (line 465 regarding Infuser DC)
- Reference Subclasses & Tests:
  - ak5e/scripts/executor-features.mjs
  - ak5e/scripts/hookmaster-features.mjs
  - ak5e/test/executor.test.mjs
  - ak5e/test/hookmaster.test.mjs
  - ak5e/test/base-classes-fixture.mjs

File Ownership & Scope:
- Exclusively create:
  - `ak5e/scripts/infuser-features.mjs`
  - `ak5e/test/infuser.test.mjs`
- Integrate into existing files:
  - `ak5e/scripts/specialist-uses.mjs` (register Infuser plans in `ALL_PLANS`, target validators, and reading `infuserDcReading`)
  - `ak5e/scripts/specialist-sheet.mjs` (Infuser controls buttons, active infusion badge, DC badge in `openSpecialistControls`)
  - `ak5e/scripts/ak5e.mjs` (export `infuser` under `game.ak5e.specialist` and call `registerInfuserHooks()`)

Implementation Requirements (Follow explorer_m4_1/handoff.md Section 4):
1. `ak5e/scripts/infuser-features.mjs`:
   - State model under `flags.ak5e.infuser`: tracks `activeInfusion` on target (`type`, `name`, `infuserUuid`, `infuserId`, `infuserName`, `dc`, `appliedAt`, `expiresAt`), `activeInfusions` on infuser, `leverageLockout`, `invulnerable` (To Defy Science).
   - Exported symbols: `INFUSER_SUBCLASS_ID`, `INFUSIONS` (all 8 infusions from Ch. 3 L5782–5823: Adrenaline Trigger, Flight Reflex Stimulant, Focus Heightener, Hesitation Suppressor, Muscle Strengthener, Procoagulant, Respiration Stimulant, Sensation Nulling), `DOUBLE_BLIND_TABLE` (1d6 mapping to 6 Toxins), `isInfuser`, `calculateInfuserDC` (default `20 - INT - PB` with optional ruling toggle for `8 + INT + PB`), `calculateInfusionRange` (5 ft, 30 ft at Lv 11), `getActiveInfusion`, `hasPrincipleOfDoubleEffect`, `hasNewConcoctions`, `hasDoubleBlindTrial`, `hasStimpack`, `hasExcessiveDosing`, `hasToDefyScience`, `getToxinDC` (base 15, or `15 + PB` with Excessive Dosing).
   - Resource pools: `defineInfuserPools()` registering `alchemicalInfusions` (max `2 * @prof`, LR recovery) and `toDefyScience` (max 1, LR recovery).
   - Hook registrations: `registerInfuserHooks()` registering `dnd5e.preRollDamageV2` (Muscle Strengthener +INT bonus), `dnd5e.preApplyDamage` (To Defy Science invulnerability preventing all HP loss; Sensation Nulling DR), and `onAk5eEvent` for kill/turnStart (prowess gain when Poisoned/Toxined creature drops to 0 HP; prowess gain 1/round when infusion changes failure to success).
   - Hook idempotency: Guard registrations against multiple calls (`if (hooksInstalled !== globalThis.Hooks) { hooksInstalled = globalThis.Hooks; ... }`).
   - Actor traversal: Use `getGameActors()` helper to safely extract Actor documents from Collections, Maps, and Arrays.
2. `ak5e/scripts/specialist-uses.mjs`:
   - Table-play plans adhering strictly to WORKFLOW §3.2:
     `applyInfusion`, `leverageInfusion`, `doubleBlindTrial`, `toDefyScience`, `clearInfusion`.
   - Target validators:
     `applyInfusion.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;`
     `leverageInfusion.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;`
     `clearInfusion.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;`
     `toDefyScience.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;`
     `doubleBlindTrial.validateTarget = () => false;`
   - Adhere to WORKFLOW §3.2: confirmation dialogs, non-blocking warnings with "Use anyway" overrides, clamp-at-0 on overspent resources, no auto-rolled dice (interactive roll buttons for Questionable Rejuvenation 1d10 Temp HP, Double-Blind Trial 1d6 Toxin roll, Procoagulant Hit Die Temp HP, Sensation Nulling 1d6 DR), automatic GM relay via validateTarget, encounter-window undo receipts under `flags.ak5e.specialistUses.undo` handled in `infuserCleanup`.
3. `ak5e/scripts/specialist-sheet.mjs`:
   - Replace placeholder at line 210 with active Infuser action buttons in `openSpecialistControls()`:
     - "Apply Alchemical Infusion (Bonus Action)"
     - "Leverage Active Infusion"
     - "Clear Active Infusion"
     - "Double-Blind Trial (BA, 1 Prowess + 1 Infusion -> 1d6 Toxin)" (when Level >= 5)
     - "To Defy Science (Action, 1/LR Invulnerability)" (when Level >= 20)
   - Status badges: render Infuser DC badge and active infusion badge in `.ak5e-specialist-badge.ak5e-specialist-badge-infuser`.
4. `ak5e/scripts/ak5e.mjs`:
   - Expose `game.ak5e.specialist.infuser`.
   - Call `registerInfuserHooks()` in `ready` hook.
5. `ak5e/test/infuser.test.mjs`:
   - Comprehensive 15-area test suite following Section 5.1 of `explorer_m4_1/handoff.md`.
   - ZERO dummy assertions (`assert.ok(true)` is strictly prohibited!).
   - In Area 15: test empirical listener count invariance (`Hooks._hooks.get("dnd5e.preRollDamageV2")?.length`) before and after repeated calls to `registerInfuserHooks()`.
   - In Area 15: dispatch damage hooks via `await Hooks.callAll("dnd5e.preRollDamageV2", ...)`.
   - Full encounter-window undo test across all plans.
