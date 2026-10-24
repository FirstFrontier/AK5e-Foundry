# BRIEFING — 2026-10-12T17:43:40Z

## Mission
Independent high-reliability review and adversarial stress-testing of Milestone 2 (Vanguard Base Class) implementation for robustness, edge cases, boundary levels, additive THP, and WORKFLOW §3.2 compliance.

## 🔒 My Identity
- Archetype: reviewer_critic
- Roles: reviewer, critic
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m2_2_o4/
- Original parent: e4e8eb8b-5d74-43ee-ad08-c5ba6d91bed6
- Milestone: Milestone 2 (Vanguard Base Class)
- Instance: 2 of 2

## 🔒 Key Constraints
- Review-only — do NOT modify implementation code
- Actively check for integrity violations (hardcoded test results, facade implementations, shortcuts, fabricated verification, self-certifying work)
- Adhere to WORKFLOW.md (§3.1, §3.2, etc.) and AGENTS.md rules

## Current Parent
- Conversation ID: e4e8eb8b-5d74-43ee-ad08-c5ba6d91bed6
- Updated: 2026-10-12T17:43:40Z

## Review Scope
- **Files to review**:
  - `ak5e/scripts/vanguard-rules.mjs`
  - `ak5e/scripts/vanguard-features.mjs`
  - `ak5e/scripts/vanguard-setup.mjs`
  - `ak5e/scripts/vanguard-progression.mjs`
  - `ak5e/scripts/vanguard-uses.mjs`
  - `ak5e/test/vanguard-rules.test.mjs`
  - `ak5e/test/vanguard-features.test.mjs`
  - `ak5e/test/vanguard-progression.test.mjs`
- **Interface contracts**: PROJECT.md, WORKFLOW.md, AK5e 1.3.1 source (03_chapter_3_character_classes.txt lines 7904–8085)
- **Review criteria**: correctness, robustness, boundary conditions, additive THP, WORKFLOW §3.2 compliance, integrity verification

## Review Checklist
- **Items reviewed**:
  - `vanguard-rules.mjs`: functional calculations, level checking, hit points, DC formulas, profile calculations, boundary validation.
  - `vanguard-features.mjs`: Landstrider/Nimble tracking, Quick off the Mark PB to init, Extra Attack, Uncanny Dodge damage halving + reaction spend, Directed Engagement state, Lightspeed Round 1 init - 10, Approaching Storm damage bonus, `applyAdditiveTempHP` additive stacking.
  - `vanguard-setup.mjs`: preview and apply setup idempotency, feature deduplication, authored item preservation, contextKey hashing.
  - `vanguard-progression.mjs`: level 1-20 progression choices, saves/skills validation, HP/ASI application, starting equipment idempotency.
  - `vanguard-uses.mjs`: play-uses table integration, non-blocking warnings, overrides, GM relay, dice buttons, undo receipts.
  - Unit tests: `npm run test:vanguard` (62 pass), `npm run test:base-classes` (clean exit), `validate-files.mjs` (229 files pass).
- **Verdict**: REQUEST_CHANGES
- **Unverified claims**: none; all claims empirically tested and verified.

## Attack Surface
- **Hypotheses tested**:
  - Multivariant and negative inputs to rules formulas (robust, verified clamped).
  - Additive temporary HP with null, zero, positive, token wrapper, multiple applications (robust, verified).
  - Boundary levels: 1, 5, 11, 15, 18, 20 feature unlocks (verified correct).
  - Progression choice validation for saves (VULNERABILITY FOUND: arbitrary saves like INT accepted).
  - Progression choice validation for skills (VULNERABILITY FOUND: duplicate skills and out-of-class skills like Arcana accepted).
  - Progression level-up starting equipment idempotency (VULNERABILITY FOUND: starting equipment / cash duplicated on subsequent level-ups).
  - Unbounded rolled HP and ASI increases (VULNERABILITY FOUND: out-of-bounds HP rolls and ASI amounts accepted).
- **Vulnerabilities found**:
  1. Critical: Saving throw choices not validated against `VANGUARD_SAVES.choices` or restricted to count = 1.
  2. Critical: Skill choices not validated against `VANGUARD_SKILLS` or checked for uniqueness (set size = 3).
  3. Critical: Starting equipment not marked as granted, leading to re-granting items or cash on subsequent level-ups.
  4. Major: Rolled HP and ASI amounts unbounded in `previewVanguardProgression`.
- **Untested angles**: none within M2 scope.

## Key Decisions Made
- Confirmed implementation has NO integrity violations (no dummy implementations or hardcoded facade values).
- Issued REQUEST_CHANGES due to critical progression validation and idempotency vulnerabilities.

## Artifact Index
- /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m2_2_o4/DISPATCH.md — Task assignment
- /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m2_2_o4/BRIEFING.md — Working memory
- /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m2_2_o4/progress.md — Liveness heartbeat
- /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m2_2_o4/handoff.md — Final review report
