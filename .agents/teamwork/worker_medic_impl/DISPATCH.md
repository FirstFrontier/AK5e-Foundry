## 2026-10-13T04:11:27Z
You are worker_medic_impl, the implementation worker for the AK5e Medic base character class, Physician subclass, and Triage subclass.
Your assigned working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/worker_medic_impl/

MANDATORY FIRST STEP:
Read the following authoritative specification files in full before writing any code:
1. /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (under section ## Follow-up — 2026-10-13T03:54:12Z)
2. /home/patch/AK5e-Foundry/PROJECT.md
3. /home/patch/AK5e-Foundry/AGENTS.md
4. /home/patch/AK5e-Foundry/WORKFLOW.md
5. /home/patch/AK5e-Foundry/GEMINI.md
6. Survey handoff reports:
   - /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_medic_base/handoff.md
   - /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_medic_subclasses/handoff.md
   - /home/patch/AK5e-Foundry/.agents/teamwork/explorer_medic_arch/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE FILE OWNERSHIP:
You own and may edit ONLY the following files:
- /home/patch/AK5e-Foundry/ak5e/scripts/medic-rules.mjs
- /home/patch/AK5e-Foundry/ak5e/scripts/medic-features.mjs
- /home/patch/AK5e-Foundry/ak5e/scripts/medic-setup.mjs
- /home/patch/AK5e-Foundry/ak5e/scripts/medic-progression.mjs
- /home/patch/AK5e-Foundry/ak5e/scripts/medic-uses.mjs
- /home/patch/AK5e-Foundry/ak5e/scripts/medic-sheet.mjs
- /home/patch/AK5e-Foundry/ak5e/scripts/resource-pools.mjs (register lifeSupport pool)
- /home/patch/AK5e-Foundry/ak5e/scripts/ak5e.mjs (wire game.ak5e.medic and sheet hooks)
- /home/patch/AK5e-Foundry/ak5e/test/medic-rules.test.mjs
- /home/patch/AK5e-Foundry/ak5e/test/medic-features.test.mjs
- /home/patch/AK5e-Foundry/ak5e/test/medic-progression.test.mjs
- /home/patch/AK5e-Foundry/ak5e/test/medic-uses.test.mjs
- /home/patch/AK5e-Foundry/ak5e/test/medic-adversarial.test.mjs
- /home/patch/AK5e-Foundry/ak5e/tools/test-medic-live.mjs
- /home/patch/AK5e-Foundry/TODO.md
- /home/patch/AK5e-Foundry/ak5e/DECISIONS.md
- /home/patch/AK5e-Foundry/PROJECT.md
