## 2026-10-12T11:55:14Z
You are worker_m1_it2, a remediation worker for Milestone 1 of the AK5e Foundry VTT module.
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/worker_m1_it2/

MANDATORY FIRST STEP:
Read the following authoritative files in full:
1. /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (specifically the latest request under "## Follow-up — 2026-10-12T11:30:05Z")
2. /home/patch/AK5e-Foundry/AGENTS.md
3. /home/patch/AK5e-Foundry/WORKFLOW.md
4. /home/patch/AK5e-Foundry/GEMINI.md
5. Reviewer reports:
   - /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m1_1/handoff.md
   - /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m1_2/handoff.md
   - /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m1_1/handoff.md
6. Target file to fix: /home/patch/AK5e-Foundry/ak5e/test/base-classes-fixture.mjs
7. Adversarial stress test file: /home/patch/AK5e-Foundry/ak5e/test/base-classes-fixture-stress.test.mjs

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

SCOPE & EXCLUSIVE WRITE OWNERSHIP:
You own exclusively:
- /home/patch/AK5e-Foundry/ak5e/test/base-classes-fixture.mjs
- /home/patch/AK5e-Foundry/ak5e/test/base-classes-fixture-stress.test.mjs

TASK ASSIGNMENT (Fix all Milestone 1 Defects in `base-classes-fixture.mjs`):
1. Prototype Pollution Defense: In `setPropertyByPath`, guard against `"__proto__"`, `"constructor"`, and `"prototype"`. If intermediate properties are primitives, replace with `{}`.
2. Serialization `toObject()`: Implement clean data serialization on `createTestActor` and `createTestItem` that extracts document state (`id`, `name`, `type`, `system`, `flags`, `img`, `items`, `effects`, `ownership`) without passing functions to `structuredClone()`.
3. Force-Keys (`==`): Implement Foundry's `==key` force-replace semantics in `setPropertyByPath`: when a key starts with `==`, strip `==` and replace the property value entirely without recursive merging.
4. Deletion (`-=`): Ensure `-=` keys anywhere in dotted paths or object updates delete the target property cleanly.
5. Missing Actor Methods:
   - Implement `actor.updateEmbeddedDocuments(embeddedName, updates, options)` which updates matching documents in `items` or `effects` and returns `Promise<Document[]>`.
   - Update `deleteEmbeddedDocuments` to return `Promise<Document[]>` (the deleted Document instances, matching Foundry API) rather than string IDs.
   - Clean up deleted items from `actor.created` to prevent memory leaks.
6. Permissions in `testUserPermission`:
   - Parse permission levels: `0` (NONE), `1` (LIMITED), `2` (OBSERVER), `3` (OWNER).
   - If user is GM, return `true`.
   - Look up user level in `this.ownership[user.id] ?? this.ownership?.default ?? 0`.
   - Compare numeric level against requested permission.
7. Collections & Globals:
   - Ensure `game.users` is a `TestCollection` with `find`, `filter`, `map`, `some`, `every`.
   - Ensure `game.messages` has `get(id)`.
   - In `createTestCombat`, make `combatants` a `TestCollection`.
   - In `createEmbeddedDocuments("ActiveEffect", ...)`, set `documentName: "ActiveEffect"` and handle deletion from `parent.effects`.
8. Update `ak5e/test/base-classes-fixture-stress.test.mjs`:
   - Update assertions so that they verify the corrected behavior (prototype pollution blocked, toObject() succeeds, == force-replaces, updateEmbeddedDocuments works, permissions work).
9. Verify your changes:
   - Run `node --test ak5e/test/base-classes-fixture-stress.test.mjs` (must pass 100%).
   - Run `node --test ak5e/test/resource-pools.test.mjs ak5e/test/operation-kernel.test.mjs`.
   - Run `npm run test:base-classes`.
   - Run `node ak5e/tools/validate-files.mjs`.
   - Document all changes and verification outputs in your handoff report.

DELIVERABLE:
Write your handoff report to /home/patch/AK5e-Foundry/.agents/teamwork/worker_m1_it2/handoff.md.
Also maintain progress in /home/patch/AK5e-Foundry/.agents/teamwork/worker_m1_it2/progress.md.
When finished, send a brief message with your handoff path back to orchestrator.
