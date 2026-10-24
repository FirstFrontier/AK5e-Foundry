## 2026-10-12T11:45:14Z
From: orchestrator_3 (b61e001c-514d-4e47-9fa5-7a8016fd2580)
Priority: MESSAGE_PRIORITY_HIGH

You are the Chapter 3 Rules Spec Miner (spec_miner_guard_ch3).
Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_guard_ch3/.

CRITICAL: You are READ-ONLY. Do NOT write or edit source code, tests, or bug files.
Write only to your working directory: /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_guard_ch3/handoff.md and progress.md.

MANDATORY FIRST STEPS:
1. Read /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md in full.
2. Read AGENTS.md, WORKFLOW.md, and GEMINI.md.

OBJECTIVE:
Investigate the authoritative rules source:
`AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (lines 1740–3520 covering Guard and all Guard subclasses).
Extract exact, unambiguous specifications for the rules and mechanics addressed by the 65 Guard defect reports in `bugs/pending/` (B-129–B-153, B-230–B-239, B-250–B-259, B-280–B-289, B-290–B-299):
- Base Guard: Hit dice, progression, Aggression/Unrelenting pools, Martial DC, Combat Superiority / Augmented Assault, Reaction economy, undo behavior.
- Centurion: Fearmonger, Cyclone Strike, Brutal Execution, Cut Through Chaos, Ferocious Fling, Guillotine, Shredder, Storm of Blood, reach modifiers, Aggression refunds.
- Artsblade: Blade Art durations/expiry, pool selection (SP vs spell slots), casting frequencies, spell level limits, Resonance rolls, save immunity recording, subclass grants.
- Brawler: Armor restrictions (light armor / unarmored), Dexterity/Strength bonuses (avoiding double-counting), target validation, Bob & Weave, Art of the Fist, native benefits.
- Crusher: Heavy melee weapon definitions (AK5e category definitions vs simple/martial), Renewing Strike hit die expenditure, Extreme Fortitude, Singular Strike, Foecrusher / Overbear riders, 10th & 17th passives, prerequisite and timing warnings.
- Instructor: Renowned Instructor initiative tracking, instruction recipients, Keep Fighting temporary HP relay, Once More Unto the Breach, timing/frequency limits, instruction dice / cost summaries.
- Musha: Soloblade HP restoration, Blood Price self-damage and options, Stand Alone self-heal exemption and stacking, Not Yet save DC and survival HP, Retaliator Go Forth prerequisite, Living on the Edge bonuses.
- Reaper: Ruin gain/loss and caps, Curtainfall timing and Ruin expenditure on hit, Reap save damage and crit rolls, Reaper crit ranges, Fear the Reaper mark effects and expiry, healing penalty scope (incoming heals only).

OUTPUT REQUIREMENTS:
Write a comprehensive, structured report to `/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_guard_ch3/handoff.md` detailing:
1. Exact source quotes and line numbers from Chapter 3 for every feature listed above.
2. Mathematical formulas, dice sizes, action economy (Action, Bonus Action, Reaction, Turn Start, Turn End, On Hit).
3. Conditions, durations, and saving throw rules.
4. Any ambiguities or potential conflicts and how they align with WORKFLOW.md §3.2.

When complete, send a message to orchestrator_3 (b61e001c-514d-4e47-9fa5-7a8016fd2580) summarizing your findings and linking to your handoff.md.

