# BRIEFING — 2026-10-13T04:10:00Z

## Mission
Analyze and document the architectural patterns to be followed for Medic, Physician, and Triage classes and tooling.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, architecture exploration, synthesis
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_medic_arch
- Original parent: 4dc2c4af-2b0a-43dd-b0c1-68e8edd29582
- Milestone: Medic Architecture Exploration

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Analyze and document architectural patterns for Medic, Physician, Triage
- Preserve AK5e rules fidelity, WORKFLOW.md and AGENTS.md compliance
- Produce structured 5-component handoff.md

## Current Parent
- Conversation ID: 4dc2c4af-2b0a-43dd-b0c1-68e8edd29582
- Updated: 2026-10-13T04:01:30Z

## Investigation State
- **Explored paths**:
  * `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (Medic L4560–4870, Physician L4871–4905, Triage L5011–5048)
  * `AK5e_1.3.1_Foundry_Source/01_chapter_1_changing_the_game.txt` (Mettle L50–78, Construct restrictions L138)
  * `ak5e/scripts/chapter-three-content.mjs` (compendium entries)
  * Vanguard, Supporter, Specialist implementations (`*-rules.mjs`, `*-features.mjs`, `*-setup.mjs`, `*-progression.mjs`, `*-uses.mjs`)
  * `ak5e/scripts/resource-pools.mjs`, `ak5e/scripts/play-uses.mjs`, `ak5e/scripts/ak5e.mjs`
  * Test fixtures & runners: `ak5e/test/base-classes-fixture.mjs`, `vanguard-*.test.mjs`, `supporter-*.test.mjs`, `specialist-*.test.mjs`, `package.json`
  * Browser test harness: `ak5e/tools/test-browser.mjs`, `test-guard-live.mjs`
- **Key findings**:
  * Complete 6-module architecture designed for Medic, Physician, Triage
  * Exact closed formulas for Life Support ($20 + 15 \times \lfloor \text{Level} / 2 \rfloor$), AP, Max Art Level, Hit Points (1d6 HD, 6+CON, 4+CON higher)
  * Proficiencies: Light Shields ONLY (no light armor), Light Melee, Tool/Vehicle, Saves CON/INT/WIS pick 2, Skills Medicine (Expertise) + 2 of 6
  * Resource pool `lifeSupport` registered with `overMax: true` and `toMax` recovery on Long Rest
  * Full table-play plans with confirmation loops, non-blocking warnings, shortfall clamp at 0, GM relay, chat card roll buttons, and undo receipts
  * Browser live test suite plan for port 30175 with launchTestBrowser() and subagent screenshot review
- **Unexplored areas**: None for this architecture phase.

## Key Decisions Made
- Documented complete architecture in `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_medic_arch/handoff.md`.

## Artifact Index
- /home/patch/AK5e-Foundry/.agents/teamwork/explorer_medic_arch/handoff.md — Final architecture exploration report
