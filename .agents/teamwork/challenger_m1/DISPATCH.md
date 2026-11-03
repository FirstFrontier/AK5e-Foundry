# DISPATCH — challenger_m1
Timestamp: 2026-10-20T02:18:45Z
Role: Instability Adversarial Challenger
Working Directory: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m1

## Objective
Author an adversarial stress test suite in `ak5e/test/inventor-adversarial.test.mjs` targeting the Inventor subclass, Instability mechanics, and equipment modification engine.

## Attack Vectors & Stress Cases to Verify
1. Instability Calculation Boundary Conditions:
   - Instability with 0 modifications (should be 0 or invalid).
   - Instability with 1 modification (base 3).
   - Instability with 1 dangerous modification (base 3 + 1 = 4).
   - Instability with multiple modifications (e.g. 3 standard + 1 dangerous = 3 + 2 + 1 = 6).
   - Risk Assessment stacking: Level 11 Inventor wielding their specialized weapon (reductions: -1 Speciality, -1 Trained Operator = -2 total).
   - Instability reduction clamping: ensure Instability cannot drop below 1 (e.g. 1 standard mod base 3 with -2 reductions = 1; if any further reduction existed, clamp at 1).
2. Breakdown Roll Mathematics & Edge Cases:
   - Instability = 1: rolling 1d6 CANNOT have duplicate dice; breakdown probability is strictly 0%.
   - Instability >= 7: rolling 7d6 (or more) MUST ALWAYS have duplicate dice (Pigeonhole Principle); breakdown is guaranteed 100%.
   - Arbitrary dice results: test dice arrays with all distinct values (e.g. `[1, 2, 3]`, `[1, 3, 5, 6]`) -> breakdown is FALSE.
   - Dice arrays with at least one matching pair (e.g. `[2, 4, 2]`, `[6, 6]`, `[1, 2, 3, 4, 5, 5]`) -> breakdown is TRUE.
   - Multi-way matches (triples, quads, two pairs) -> breakdown is TRUE.
3. Breakdown HP Loss & Clamping:
   - Damage formula at Instability 1, 2, 3: additional term `max(0, Instability - 3)` is 0, so damage is 1d8.
   - Damage formula at Instability 4: 2d8; Instability 5: 3d8; Instability 6: 4d8.
   - HP Clamping: if creature has 1 HP, damage applied MUST be 0 (cannot drop below 1 HP).
   - If creature has 5 HP and roll is 8, damage applied MUST be exactly 4 (remaining HP = 1).
4. Dangerous Breakdown Equipment Rider Isolation:
   - Activating a Dangerous mod that breaks down MUST flag the item as broken (`isBrokenEquipment(item) === true`).
   - Activating a NON-DANGEROUS mod on an item that ALSO HAS a Dangerous mod installed, and suffering a breakdown: MUST inflict HP loss but MUST NOT break the equipment (dangerous breakdown rider triggers only when activating the dangerous mod).
   - Attempting to use a broken equipment piece must be rejected or warned.
   - Maintenance Kit repair must restore the broken equipment cleanly.
5. Inventions Pool Integrity & Modification Gating:
   - Disallow duplicate modifications on the same equipment piece.
   - Disallow modifications on magical items.
   - Inventions pool accounting: applying mods decrements available Inventions; removing mods refunds Inventions; pool cannot overdraw.
   - 1-week maintenance expiry tracking.

Allowed write files:
- `ak5e/test/inventor-adversarial.test.mjs`
- Files in `/home/patch/AK5e-Foundry/.agents/teamwork/challenger_m1/`

Read:
- `/home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md` (lines 536 to 628)
- `/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_inventor_1/handoff.md`
- `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_inventor_1/handoff.md`
- `WORKFLOW.md` (§3.2)
- `ak5e/scripts/inventor-features.mjs` and `ak5e/scripts/specialist-rules.mjs` (as updated by worker)

Run commands:
- `node --test ak5e/test/inventor-adversarial.test.mjs`
- `node ak5e/tools/validate-files.mjs`

Maintain progress in `progress.md`. When complete, write report in `handoff.md` with test output and notify orchestrator.

## 2026-10-20T02:19:03Z
[Message] timestamp=2026-10-20T02:19:03Z sender=cf5c8a2a-802f-473e-8274-6566de462e7c priority=MESSAGE_PRIORITY_HIGH content=You are challenger_m1. Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m1/.
Read your dispatch instructions in /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m1/DISPATCH.md.

Implement the adversarial stress test suite in ak5e/test/inventor-adversarial.test.mjs.
Attack all edge cases and stress vectors:
1. Instability calculation boundary conditions (0 mods, 1 mod, 1 dangerous, multiple mods, Risk Assessment stacking, clamp at min 1).
2. Breakdown roll mathematics (Instability 1 -> 0% breakdown, Instability >= 7 -> 100% guaranteed duplicate dice by Pigeonhole Principle, arbitrary dice arrays with distinct vs matching faces).
3. Breakdown HP loss & clamping (1d8 + max(0, N-3)d8, clamping so current HP never drops below 1).
4. Dangerous breakdown rider isolation (activating dangerous mod breaks equipment; activating non-dangerous mod on mixed item damages HP but does NOT break equipment; broken equipment blocks use until repaired by Maintenance Kit).
5. Inventions pool accounting, no duplicate mods on same item, no mods on magical items.

Run:
- node --test ak5e/test/inventor-adversarial.test.mjs
- node ak5e/tools/validate-files.mjs

Maintain progress in progress.md. Write your full report in handoff.md and notify the orchestrator when complete.
