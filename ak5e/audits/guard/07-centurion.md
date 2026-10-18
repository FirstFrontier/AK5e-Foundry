# Guard audit 07: Centurion subclass

Audit and fix (2026-10-18, Claude Sonnet 5.5, worktree from `audit/guard-baseline` d4b92b2). Edited only `ak5e/scripts/centurion-features.mjs`, `ak5e/test/centurion.test.mjs`, this file and `bugs/`.

## Scope
- Source: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` L2549-2632 (Centurion, read in full), Press the Attack base (L1874-1890), Martial DC (Ch.1 L211), Frightened and Bleeding (Ch.1 conditions).
- Code: `centurion-features.mjs` (all), `centurion.test.mjs` (all); read-only: `play-uses.mjs`, `guard-uses.mjs`, `guard-rules.mjs` (`centurionDC`), `feature-tags.mjs` (`applyFeatureTag`), `trigger-events.mjs` (Reaction budget), `protector-features.mjs` and `defender-uses.mjs` (patterns), `guard-progression.mjs` (Intimidating), `test/guard-fixture.mjs`, and the sheet contract from PR #6 (`gh pr diff 6`).

## Checks run
- `npm run test:guard`: 118/118 at baseline; 143 after (33 in `centurion.test.mjs`). `npm run check:files`: pass. `npm run test:automation` fails identically on the untouched baseline (B-226).
- Mutation check: replacing the relay `sameEntry` check with `true` made the tamper test fail (so the relay tests catch an edited receipt).
- Live, disposable Foundry V13 + D&D5e 5.3.3 (`/tmp/ak5e-guard-u7`, port 30187; port 30000 untouched), Playwright through `launchTestBrowser()`: `test-guard-live.mjs` ran to its last Weaponmaster step (killed by my 280 s timeout at that point; its only report error is the closed browser). My own flow (`/tmp/ak5e-guard-u7/flow.mjs`) used a GM plus a non-GM "U7 Player" who owns the Centurion and Foe A but not Foe B, with an Expertise Centurion (itm mod 1, total 7).
- The live flow ran twice, before and after the code-review fixes; the second run stopped at a harness navigation error after the first Cyclone check. Later changes (missing targets, Shredder source, Fling checks, extra-pool refund, multi-entry initiative) are Node-tested only.

## Bugs fixed
- **B-144** (Fearmonger): outgoing Advantage only for a Centurion level 4+, only when every target is Frightened; incoming Disadvantage only for a Frightened attacker whose targets are all level 4+ Centurions. Live: a Brawler got nothing.
- **B-145** (Cyclone Strike): the tracker is the recorded receipt (`receipt.cyclone`). Below 14: a repeat warns until the Centurion's next Turn begins, even on others' Turns. From 14: once per Turn. Override allowed, undo restores it. Live: same turn and other turn warned, own next turn free.
- **B-147** (Intimidation): damage and DC share `intimidationModifier` (`skills.itm.total`). Live: DC 15 and 7 damage for expertise (mod 1).
- **B-146, plan side** (stays pending for the sheet), **B-148, Ferocious Fling part**, **B-152, Storm of Blood part**, **B-133 and B-135, Centurion parts**: see the Progress notes in each bug file.
- Brutal Execution is two receipts. `brutalExecution` spends 2 Aggression (and the Reaction as `receipt.reaction` when `asReaction`), posts a `[[/save ability=wis]]` link and applies nothing. `brutalExecutionFailed` ({ useId, targetUuid, failedSave }) applies Frightened (`tag.condition: "frightened"`, `nextTurnEnd` on the Centurion) and posts the Psychic Damage as `damageParts` for the owner's Roll. Unowned targets use the GM relay; `validateTarget` accepts only the exact effect entry. Live: owned target applied directly, unowned target applied by the GM client with no dialog, no roll until the card's Roll click, undo removed Frightened and refunded Aggression.
- Ferocious Fling: typed Bludgeoning for the owner's Roll; the Strength attack is the player's own native roll; CON read from `launchedUuid` when not given; size and range warnings; a `brutalExecutionUseId` link refunds one Fling per Brutal Execution (warns on repeat or a different killed Creature).
- Guillotine: typed weapon-dice damage (type from `damageType` or a single equipped weapon, else a warning), DEX (Martial DC) and WIS (Centurion DC) save links. Shredder: typed Slashing for the owner's Roll; doubled only for a Frightened effect created by this Centurion, or when the player confirms; another source warns.
- Storm of Blood: typed 10d8 for the owner's Roll, save link, reversible Long-Arm effect (needs the Shock Trooper Item), and `stormOfBloodRefund` (base or extra Reaction pool, undo spends it again).
- Brutal Execution no longer blocks on a Creature that no longer exists (warns and skips).

## Bugs filed (B-220..B-226)
- B-220 Medium: `validateTarget` inside the returned plan is never read (Liberator x3, Crusher x1); same mistake was in my first draft.
- B-221 Medium: Guillotine and Storm of Blood outcomes (Bleeding, Frightened, half damage, forced movement) are narration.
- B-222 Medium: Cyclone Strike and Shredder are manual cards (no AC comparison, no reach checks).
- B-223 Medium: passive Long-Arm reach is not applied.
- B-224 Low: `centurionDC` duplicates the Intimidation chain. B-225 Low: DECISIONS Centurion text stale. B-226 Low: AUTOMATION_AUDIT.md stale at baseline.

## Existing bugs re-verified
- B-133 / B-135: Centurion no longer mutates `state.data` or calls `spendReaction` in a plan; Artsblade and Brawler untouched.
- B-146 (sheet side), B-148 (Artsblade side) remain pending. B-152 stays pending for the sheet button and B-223.

## Verified clean
- Centurion DC = 8 + Intimidation Modifier; Martial DC for DEX saves; Cyclone limits (1 secondary, 2 from 7th); Fling pool 1/Short Rest from 4th, Guillotine and Storm of Blood 1/Long Rest from 10th and 17th; Guillotine 2 x PB dice; Shredder = STR modifier, doubled when Frightened of you; Storm of Blood 10d8 and 15 ft; Brutal Execution 2 Aggression, 15 ft. Intimidating grants proficiency or expertise in `guard-progression.mjs`.
- No module-started dice: damage and the Fling attack wait for the owner (`rolled` stayed empty in Node; live `roll` stayed null until the click).

## Screenshots (opened and read by me; `/tmp/ak5e-guard-u7/shots-flow/`, first run)
01 Brutal Execution card: PASS (text, DC link, Undo; chat in popup mode). 02 failed-save card with Roll and Undo: PASS. 03 and 04 after the Roll click, native damage card plus result card: PASS. 05 unowned relay card ("Applied by the GM's client"; a "Guard target change confirmed request" whisper from the relay appears): PASS. 06 GM view after relay: UNCERTAIN (canvas only; sidebar collapsed). 07 Foe B sheet: UNCERTAIN (Features tab, effect not visible; effect checked by data). 08 Undone cards: PASS. 09 Cyclone cards: PASS. All cards are light parchment with dark text, no overflow. "Game paused" overlay is a world state, not this change. One report.json error: `#animateTargets` reading `size`, caused by my script deleting `game.user.targets` to restore a faked Fearmonger target set; not from the module.

## Proposed DECISIONS
1. Brutal Execution "Intimidation Modifier" is the final skill bonus (total), as the Centurion DC already uses; damage is flat, minimum 0.
2. Fearmonger applies to a single roll: Advantage only when every targeted Creature is Frightened; Disadvantage only when every target is a Fearmonger Centurion (a roll cannot differ per target).
3. Cyclone Strike below 14th: the wait ends at the start of the Centurion's next initiative entry; from 14th: once on each combatant's Turn. Not tracked outside a started combat.
4. Storm of Blood's Attack of Opportunity refund has no stated duration; it is available whenever a Storm of Blood use is recorded. Long-Arm is shown as an effect but weapon Reach is applied by hand.
5. Ferocious Fling: the source says Strength for the Attack and Damage Rolls yet Damage equals the launched Creature's CON modifier. The module posts the CON modifier as the Damage and leaves the attack proficiency to the player's native roll. "On the Creature you threw" is read as the Creature that Brutal Execution followed (`killedUuid`).
6. Guillotine damage type is the wielded weapon's (not Slashing as DECISIONS says); the player names it when it cannot be read. Shredder doubles only for Frightened "of you".

## Limits
- The sheet (PR #6) sends `targets`, `targetUuid`, `targetConMod`, `brutalExecution`, `eliteOrLeader`, `targetFrightened`; it does not send `killed`, `killedUuid`, `asReaction`, `damageType`, `useId`, a failed-save control or a `stormOfBloodRefund` button (see B-146, B-152). Until then every Brutal Execution warns "no kill" and Frightened cannot be applied from the sheet.
- The existing assertions were kept, except where B-146 removes the premature `receipt.targets` entry (moved to the failed-save receipt), and the Brutal Execution and Guillotine test inputs now carry `killed:true` and `damageType`, which the new warnings require.
- GM relay `apply` and `revert` were exercised through `relayedTargetChange` in Node and live with a real GM client; the no-GM path in Node only. Range warnings were not exercised (no scene tokens).
