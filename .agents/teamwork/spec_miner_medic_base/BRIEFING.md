# BRIEFING — 2026-10-13T04:08:15Z

## Mission
Perform a comprehensive, read-only extraction and specification of the AK5e Medic base character class rules from Chapter 3 lines 4560–4870.

## 🔒 My Identity
- Archetype: Specification Miner
- Roles: spec-miner, external domain expert
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_medic_base
- Original parent: 4dc2c4af-2b0a-43dd-b0c1-68e8edd29582
- Milestone: Medic Class Specification & Implementation Batch 1

## 🔒 Key Constraints
- Read-only: DO NOT write or edit production code.
- Write only to /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_medic_base/
- AK5e_1.3.1_Foundry_Source/ is the rules authority. Preserve wording and numbers, never invent mechanics.
- Cite exact source lines and numbers for all extracted features and tables.
- Table format: Features Discovered and Edge Cases tables.

## Current Parent
- Conversation ID: 4dc2c4af-2b0a-43dd-b0c1-68e8edd29582
- Updated: not yet

## Task Summary
- **What to build**: Comprehensive rules specification report (handoff.md) for the Medic base class in AK5e.
- **Success criteria**: Full extraction and exact line citations for chassis, arts casting, life support resource pool, core features, progression table (1-20), operator skills, talents, ASIs, subclass grant levels.
- **Interface contracts**: /home/patch/AK5e-Foundry/PROJECT.md
- **Code layout**: Read-only extraction. Report at /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_medic_base/handoff.md

## Key Decisions Made
- Focusing extraction strictly on Chapter 3 Medic base class rules (lines 4560–4870) and referenced rules/definitions in Chapter 3 & Chapter 5 (Arts) if referenced.
- Derived exact closed-form formula for Life Support: `20 + 15 * Math.floor(level / 2)` across all levels 1–20.
- Confirmed `lifeSupport` uses `overMax: true` and recovery `{ on: "lr", amount: "toMax" }` with no Short Rest recovery based on Witchcraft L5104 and `ak5e/test/resource-pools.test.mjs`.
- Confirmed Construct healing prohibition from Ch. 1 L138 applies to Touch Heal, Healing Arts, and Medic features.
- Completed full 35-feature specification and 15 edge cases in `handoff.md`.

## Artifact Index
- /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_medic_base/DISPATCH.md — Dispatch log
- /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_medic_base/BRIEFING.md — Persistent context & situational awareness
- /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_medic_base/progress.md — Progress and heartbeat log
- /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_medic_base/handoff.md — Final deliverable report

## Loaded Skills
- None explicitly loaded.
