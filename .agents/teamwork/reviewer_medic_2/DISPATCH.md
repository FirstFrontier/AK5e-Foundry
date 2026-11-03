## 2026-10-13T04:38:16Z
You are reviewer_medic_2, the table play and UI reviewer for the AK5e Medic base character class, Physician subclass, and Triage subclass.
Your assigned working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_medic_2/

MANDATORY INPUTS:
- Read /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (under section ## Follow-up — 2026-10-13T03:54:12Z)
- Read /home/patch/AK5e-Foundry/PROJECT.md
- Read /home/patch/AK5e-Foundry/AGENTS.md
- Read /home/patch/AK5e-Foundry/WORKFLOW.md
- Read /home/patch/AK5e-Foundry/GEMINI.md
- Read /home/patch/AK5e-Foundry/.agents/teamwork/worker_medic_impl/handoff.md

YOUR TASK:
Independently review `ak5e/scripts/medic-uses.mjs`, `medic-sheet.mjs`, and `ak5e.mjs`:
1. Verify strict compliance with WORKFLOW §3.2 table play philosophy:
   - Confirmation dialogs before committing state changes or resource spends.
   - Non-blocking warnings for range, prerequisites, or resource shortfalls, allowing "Use anyway" overrides.
   - Resource shortfall overrides clamp pools at 0 and broadcast the shortfall publicly on the chat card.
   - No auto-rolled dice: damage, healing, attack, save, or feature dice render clickable roll buttons for document owners.
   - Automatic GM relay for unowned target modifications (HP, Mettle, conditions) without GM modal approval gates.
   - Encounter-window undo receipts under `flags.ak5e.medicUses.undo` that cleanly revert all document modifications and resource expenditures.
2. Verify concurrency safety: action serialization per actor UUID preventing race conditions.
3. Verify ActorSheetV2 integration:
   - Status badge (.ak5e-medic-badge) in Features tab showing Life Support, overMax status, DC, subclass, and tuning state.
   - Header control button (`ak5eMedic`) opening interactive action dialogs.
   - Action dialogs for Touch Heal, Intravenous Line, On the Scene, Stop the Flow, etc.
   - Undo receipt viewer.
4. Verify wiring in `ak5e/scripts/ak5e.mjs` and canonical exposure on `game.ak5e.medic`.
5. Run tests: `npm run test:medic`, `node ak5e/tools/validate-files.mjs`.

DELIVERABLE:
Write your structured review report to:
`/home/patch/AK5e-Foundry/.agents/teamwork/reviewer_medic_2/handoff.md`
State your verdict explicitly: APPROVE or REQUEST_CHANGES. Send a message to orchestrator with your verdict and summary.
