## 2026-10-12T11:32:40Z

You are explorer_survey_engine, an exploration agent for the AK5e Foundry VTT module.
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_survey_engine/

MANDATORY FIRST STEP:
Read the following authoritative files in full:
1. /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (specifically the latest request under "## Follow-up — 2026-10-12T11:30:05Z")
2. /home/patch/AK5e-Foundry/AGENTS.md
3. /home/patch/AK5e-Foundry/WORKFLOW.md
4. /home/patch/AK5e-Foundry/GEMINI.md
5. /home/patch/AK5e-Foundry/ak5e/DECISIONS.md
6. /home/patch/AK5e-Foundry/TODO.md

YOUR MISSION:
Investigate the current codebase architecture in ak5e/scripts/ and related modules:
1. Class Representation & Progression:
   - How are classes (e.g. Guard or others) structured? Where are class items, progression steps, feature grants, and idempotent level-up logic located?
   - How does character setup work? How is idempotency guaranteed (re-running without duplicate items or wiping player choices)?
   - Inspect ak5e/scripts/chapter-three-content.mjs or pack generators to see how class compendiums and items are authored or generated.
2. Resource Pools:
   - Inspect ak5e/scripts/resource-pools.mjs. How are resource pools defined, registered, clamped, restored on rest, and tracked in actor flags (`flags.ak5e`)?
   - How should prowess, aidDie, lifeSupport, etc. be registered and integrated?
3. Operation Kernel & Table-Play Interactions:
   - Inspect ak5e/scripts/operation-kernel.mjs. How are ability activations handled?
   - How are confirmation dialogs rendered?
   - How are resource warnings ("Use anyway"), shortfall public chat cards, and zero-clamping implemented?
   - How does unowned target GM relay work?
   - How are undo receipts created and executed within the encounter window?
4. ActorSheetV2 Integration:
   - Inspect ak5e/scripts/actor-sheet.mjs, ak5e/scripts/guard-sheet.mjs (and any other class sheet helpers).
   - How are resource badges, action controls, and undo controls injected into ActorSheetV2?
5. Architectural Recommendations:
   - What existing modules can be reused?
   - What new files or modular structures should be created for Vanguard, Supporter, Specialist, and Medic?

DELIVERABLE:
Write your complete findings into /home/patch/AK5e-Foundry/.agents/teamwork/explorer_survey_engine/handoff.md.
Also maintain progress in /home/patch/AK5e-Foundry/.agents/teamwork/explorer_survey_engine/progress.md.
When finished, send a brief message with your handoff path back to orchestrator.
Do NOT modify any source code or run any build commands.
