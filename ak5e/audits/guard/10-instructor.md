# Guard audit 10: Instructor subclass

Date 2026-10-12. Auditor: Claude Sonnet 5.5 (audit only; no production code or tests changed).

## Scope and reads
- Source: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` L2846-2936 in full (Squad Leader, Instruction, Teach from Experience, Kingmaker, Superior Instruction, Once More Unto The Breach, ten Instruction Options).
- Code: `ak5e/scripts/instructor-features.mjs` (all), `ak5e/test/instructor.test.mjs` (all), `guard-rules.mjs` (all), `guard-uses.mjs` (all), `play-uses.mjs` (all), `play-uses-sheet.mjs`, `play-undo.mjs` (head), `resource-pools.mjs` (all), Instructor paths in `guard-sheet.mjs` (L28-160, L366-500, L1128-1135), `guard-features.mjs` pools, `ak5e.mjs` hook wiring, generated Instructor Items in `chapter-three-content.mjs`, DECISIONS L1379-1450, TODO L63-102.
- Docs read: AGENTS.md, WORKFLOW.md, bugs/README.md, source README.txt. Installed D&D5e 5.3.3 (`dnd5e.mjs` L37875-37902, L79090-79125) read only, for hook routing.

## Checks run
- `npm ci`; `npm run test:guard` 118/118 pass; `npm run check:files` passes (new `ak5e/audits/` accepted).
- Node probe (scratchpad, outside repo) driving the real module with `guard-fixture.mjs`: inherited-key choices, double Kingmaker/Cooperative/From Experience, zero-dice and `free`, Keep fighting! receipt/roll/undo, Breach at L5 and L17 with junk targets, Renowned Instructor at L12/L13, short/long rest recovery, dice and die size at L1/6/7/13/14/20, stray-feature `isInstructor`.

## Bugs filed (B-250..B-259)
- B-250 Medium: Renowned Instructor hook skips Combat Tracker initiative rolls (static, dnd5e source).
- B-251 Medium: Renowned Instructor writes the pool with no card, receipt or undo (probe).
- B-252 Medium: no recipient is ever chosen or recorded; card says "target" (probe).
- B-253 Medium: Keep fighting! Temporary HP never applied or relayed; result card empty (probe).
- B-254 Medium: Once More Unto The Breach only spends the use; no Instructions, rolls or validated targets (probe).
- B-255 Medium: no warnings for Kingmaker once-per-Turn/same-Instruction, Cooperative Combat repeat, From Experience timing (probe).
- B-256 Low: `free` flag, silent default Instruction, stray-feature `isInstructor` (probe).
- B-257 Low: Instruction Dice/Breach not shown on the panel; no cost summary (static).
- B-258 Low: Question: Cooperative Combat self-benefit roll (source ambiguity).
- B-259 Low: two summaries drop source conditions; Squad Leader description-only vs docs (static).

## Existing bugs re-verified
- B-129 (uses skip confirmation): confirmed for Breach (one click, [guard-sheet.mjs L1133](../../scripts/guard-sheet.mjs#L1133)); Instruction and Teach from Experience show only a chooser dialog, no cost/target summary. Not duplicated (see B-257).
- B-133 (undo retains gameplay flags): not reproducible for Instructor. Plans keep no internal state; undo restores dice, Aggression and Breach exactly (probe: 3 -> 4). It will matter once B-255 adds counters.
- B-135 (Reaction spent before receipt): not applicable; no Instructor plan spends a Reaction.

## Verified clean
- Dice 4/5/6 at L1/7/14 and d6 -> d10 at L13; Kingmaker fixed d6; dice counts per option (1, or 3 for Get out of there! and Go!), each costing one Instruction Die.
- Rest recovery: Instruction Dice on short and long rest, Breach on long rest only (probe).
- Renowned Instructor arithmetic: below ceil(max/2) restored to ceil(max/2); no effect at L12 or when at/above half.
- Shortfall clamps at 0, overrides listed on the card, undo restores the exact prior count; owner-clicked Roll (no auto-roll).
- Generated Item text for all Instructor features equals the source.

## Limits
- Node only. No Foundry session, no rendered inspection, no player relay or restart test (WORKFLOW §5.2 not met); every bug is Unverified.
- Instruction effects (AC, bonuses, movement) are text only; not filed as bugs because Active Effects need unambiguous durations (WORKFLOW §4.4.3).
- instructor.test.mjs covers only happy paths: no warning, override, undo, rest, L7/L14 pool or negative-input cases.
