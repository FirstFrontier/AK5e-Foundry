## 2026-10-13T04:01:16Z

[Message] timestamp=2026-10-13T04:01:16Z sender=4dc2c4af-2b0a-43dd-b0c1-68e8edd29582 priority=MESSAGE_PRIORITY_HIGH content=You are the Medic Architecture Explorer.
Your assigned working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_medic_arch/

MANDATORY INPUTS:
- Read /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (under section ## Follow-up — 2026-10-13T03:54:12Z)
- Read /home/patch/AK5e-Foundry/PROJECT.md
- Inspect the existing base class implementations:
  * Vanguard: `ak5e/scripts/vanguard-rules.mjs`, `vanguard-features.mjs`, `vanguard-setup.mjs`, `vanguard-progression.mjs`, `vanguard-uses.mjs`
  * Supporter: `ak5e/scripts/supporter-rules.mjs`, `supporter-features.mjs`, `supporter-setup.mjs`, `supporter-progression.mjs`, `supporter-uses.mjs`
  * Specialist: `ak5e/scripts/specialist-rules.mjs`, `specialist-features.mjs`, `specialist-setup.mjs`, `specialist-progression.mjs`, `specialist-uses.mjs`
- Inspect `ak5e/scripts/resource-pools.mjs` (for Life Support registration), `ak5e/scripts/ak5e.mjs` (for registration and sheet hooks), and `ak5e/scripts/chapter-three-content.mjs`.
- Inspect test fixtures and patterns: `ak5e/test/base-classes-fixture.mjs`, `ak5e/test/vanguard-*.test.mjs`, `package.json` test scripts.

YOUR OBJECTIVE:
Analyze and document the architectural patterns to be followed for Medic, Physician, and Triage:
1. Module Breakdown & Signatures:
   - `ak5e/scripts/medic-rules.mjs`: `calculateMedicProfile(actor)`, `isMedic(actor)`, `isPhysician(actor)`, `isTriage(actor)`, HD/HP math, DC calculations, level step tables, spellcasting ability resolution.
   - `ak5e/scripts/medic-features.mjs`: feature definitions, hooks, pool registration (`lifeSupport`), recovery hooks.
   - `ak5e/scripts/medic-setup.mjs`: `previewMedicSetup(actor)` and `applyMedicSetup(actor, options)` with contextKey hashing and idempotency.
   - `ak5e/scripts/medic-progression.mjs`: `inspectMedicFields(actor)`, `previewMedicProgression(actor, choices)`, `applyMedicProgression(actor, options)`.
   - `ak5e/scripts/medic-uses.mjs`: `createPlayUses({ ns: "medicUses", label: "Medic" })`, command handlers for Touch Heal, Intravenous Line, Hypocritic Oath, On the Scene, Stop the Flow, Mobile Hospital, etc., enforcing confirmation dialogs, non-blocking warnings, clamp at 0, GM relay, and undo receipts.
   - `ak5e/scripts/medic-sheet.mjs`: ActorSheetV2 badge, header buttons, action dialogs, undo receipt viewer.
2. Registration & Lifecycle:
   - How `resource-pools.mjs` registers `lifeSupport` (max scaling 20->170, overMax allowed, long rest recovery).
   - How `ak5e.mjs` exports `game.ak5e.medic`, registers sheet hooks, and integrates with dnd5e.
3. Test Scaffolding:
   - What test files need to be authored (`ak5e/test/medic-rules.test.mjs`, `medic-features.test.mjs`, `medic-progression.test.mjs`, `medic-uses.test.mjs`, and adversarial/subclass tests).
   - How to add `"test:medic"` to `package.json`.
4. Browser Test Harness & Evidence Setup:
   - How `ak5e/tools/test-browser.mjs` and `launchTestBrowser()` are used for live tests against port 30175.
   - What live test script `ak5e/tools/test-medic-live.mjs` should cover.

DELIVERABLE:
Write your structured architecture exploration report to:
`/home/patch/AK5e-Foundry/.agents/teamwork/explorer_medic_arch/handoff.md`
Cite exact file paths, line references, and patterns. DO NOT write or edit production code. When done, send a message to orchestrator with your report summary and path.
