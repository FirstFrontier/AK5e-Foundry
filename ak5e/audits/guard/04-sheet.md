# Guard audit/fix 04: Guard sheet (`guard-sheet.mjs`)

Audit and fix (2026-10-18, Claude Sonnet 5.5, isolated worktree branched from `audit/guard-baseline` d4b92b2). Production edits: `ak5e/scripts/guard-sheet.mjs` only. New test: `ak5e/test/guard-sheet.test.mjs`. No edits to plans, `play-uses*`, styles, `TODO.md` or `DECISIONS.md`.

## Scope
- Source: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` base Guard L1740-2200 (Press the Attack L1883-1890, Unrelenting L1895-1941), Artsblade L2202-2417, Brawler L2423-2546, Centurion L2549-2632, all read in full. WORKFLOW §2, §3.2 and `bugs/README.md` read first.
- Code: `guard-sheet.mjs` (controls and summary, core commands, generic default path, setup and undo buttons, Artsblade/Brawler/Centurion sections). Read-only references: `guard-setup.mjs`, `guard-uses.mjs`, `artsblade-features.mjs`, `brawler-features.mjs`, `centurion-features.mjs`, `play-uses.mjs`, `play-uses-sheet.mjs`, Foundry V13 `client/applications/api/dialog.mjs`. Other subclasses' prompts (Crusher, Instructor, Duellist, Liberator, Lord, Musha, Reaper, Weaponmaster) were left as they were except that they now route through the same confirm helper.

## Checks run
- `npm run test:guard`: 141/141 pass (baseline 118 + 23 new in `guard-sheet.test.mjs`). `npm run check:files`: pass.
- Mutation checks: making Cancel proceed fails 5 tests; reverting the setup `accepted !== true` check fails the setup-Cancel test.
- Code-review skill run on the diff; its findings are in "Bugs filed/fixed" below (Pursuit Unrelenting button reverted to visible; Press the Attack amount validated; Blade Art `targetUuid`; confirm labels; `formOf` unified; Force of Will filed as B-191; Unrelenting Aggression default as B-193).
- Live: disposable Foundry V13 + D&D5e 5.3.3 (`/tmp/ak5e-guard-u4`, port 30184, standard-test world; the user's port 30000 was not touched). Playwright via `launchTestBrowser()`. Actors: Guard 11 (no branch), Artsblade 17, Brawler 17, Centurion 17, an unconfigured Guard 3, two NPC tokens targeted with real `game.user.targets`.
  - Results (Gamemaster, plus one non-GM Player user with OWNER on a Guard): 27 checks PASS, 1 FAIL (B-190, in `play-uses-sheet.mjs`, not this file). Smite, Body Check, Blade Art (Frost produced a `cold` damage part) and Augmented Assault Confirm each spent the right Aggression and posted one card; Cancel on Smite, Body Check, Augmented Assault, Brutal Execution and the setup preview left Aggression, receipts, items and messages unchanged; Setup Grant added the features and enabled Guard; the Player's Cancel changed nothing and Confirm spent 1 Aggression with no GM step. Browser console and page errors: 0 (report.json and player-report.json).
  - FAIL, B-190: after the sheet confirm, a shortfall opened the shared "check before use" dialog; Cancel there still applied the use (Aggression 1 to 0, receipt and card created).
  - Screenshots (all in `/tmp/ak5e-guard-u4/shots/`, each opened and read by me, not delegated; images 01-13 were read from the run just before the final identical-code run, which regenerated the same files; 14-21 from the final run). Checked for missing text, clipping, dark-theme readability, buttons and permissions. PASS unless noted. 01 controls core L11. 02 Smite confirm (cost, pools, targets, amount, Confirm/Cancel). 03 chat card with Undo (toast; chat sidebar collapsed). 04 Pursuit Unrelenting confirm. 04b shortfall warning dialog (renders correctly; see B-190). 05 Brawler controls L17. 06 Body Check confirm. 07 Chokehold (STR 18 / DEX 14, no CON). 08 Mountainbreaker (radio text from source; the unchecked radio is dark grey on dark and faint but visible). 09 Artsblade controls. 10 Augmented Assault (Unleash box). 11 Cut Through Chaos. 12 Spellsword (maximum 5, no select). 13 Blade Art. 14 Centurion controls. 15 Brutal Execution with two targets. 16 Brutal Execution, none selected (warning, Confirm still offered). 17 Ferocious Fling inputs. 18 unconfigured controls. 19 setup preview (6 features at level 3). 21 Player Strike True confirm (non-GM). 20 actor sheet is UNCERTAIN: the Skills tab was showing, so the Guard panel on the Features tab was not seen (its presence was confirmed by DOM query only).

## Bugs fixed
- **B-129** (confirm skipped): one `guardPrompt` confirm dialog on every path, including the default path; cost, current pools, selected tokens, notes, explicit Cancel; `confirmPlayUse` runs after it with one operation ID.
- **B-130** (Augmented Assault cancel): Cancel returns `null` before the engine; unchecked Unleash is `false`.
- **B-131** (setup preview key): `confirmGuardSetup` previews, lists adds/kept, applies with the preview `contextKey`; only an explicit `true` accepts (a Cancel press resolves to the truthy id "cancel", found live).
- **B-149** (prompt text): Cut Through Chaos, Chokehold, Mountainbreaker now quote the source (see the bug file).
- **B-195** (new, fixed): inputs the plans read but the sheet never sent (Fling CON modifier/refund, Guillotine Elite/Leader, Shredder Frightened, Pursuit Action/Bonus Action, Unrelenting Aggression dice, Feint/Tag In target).
- **B-196** (new, fixed): unescaped Weaponmaster names in the controls HTML.
- Sheet halves only (stay pending, progress noted): **B-136** (`artPool` + `pool`), **B-138** (maximum level read-only; `level` and `castingLevel`), **B-146** (`data.targets = [{ uuid, name }]` for Brutal Execution, Fling, Guillotine, Shredder, Storm of Blood, Cyclone Strike; warning only when none).

## Bugs filed (B-190..B-199)
- **B-190 High** (live): Cancel on the "check before use", reading and undo dialogs of `play-uses-sheet.mjs` resolves to the truthy id "cancel" and is read as acceptance. Observed: Guard with 1 Aggression, Smite for 3, Cancel on the warning dialog still spent the Aggression and posted the card. Needs a one-line fix in `play-uses-sheet.mjs` (not this unit's file).
- **B-191 Medium**: Force of Will commits Will Attunement before its own confirm/warnings finish.
- **B-192 Medium**: Blade Art lists all 11 Arts Pools; the module records no selected pools.
- **B-193 Low**: `unrelentingAggression` plan falls back to an invented 1d8.
- **B-194 Low**: most Brawler/Centurion plans ignore the `data.targets` the sheet now sends; Cyclone Strike cannot tell original from cleaved Creatures.

## Existing bugs re-verified
- B-129, B-130, B-131, B-149: reproduced by reading the old code (static), fixed and re-tested (Node and live).
- B-136, B-138, B-146: sheet halves verified live (Frost produced a `cold` damage part; Spellsword showed maximum level 5 with no level select; Brutal Execution listed both tokens and warned with none). Plan halves are other units'.
- B-135 (Reaction spent before receipt) and B-133 (undo retains flags): not in this file's scope, not re-run.

## Verified clean
- Button labels and level gates against the source: Press the Attack costs (1-3), Unrelenting (3rd), Pursuit Unrelenting (11th; button deliberately shown earlier, the plan warns), Unrelenting Aggression (15th, 2 Aggression, Reaction); all 15 Brawler techniques' costs and Actions (Basic from 1st, Advanced from 10th, Mountainbreaker 17th); Artsblade Blade Art, Spellsword Art (1 SP), Augmented Assault (2 Aggression), Cut Through Chaos (4th), Ultimate Blade Art (17th); Centurion Cyclone Strike, Brutal Execution (2 Aggression), Ferocious Fling (4th), Guillotine (10th), Shredder (13th), Storm of Blood (17th).
- Martial DC and Centurion DC badges, Max Art Level badge and Bob and Weave AC use the module's helpers; summary text is escaped.
- Ability checks and saves are not wrapped in the new confirm step (none are started from this sheet).
- Opening Guard Controls or any dialog writes nothing; every write goes through `guardUses.command` after a confirm.

## Proposed DECISIONS
1. **Augmented Assault with Unleash (L2245 and L2376).** Augmented Assault permits two Spellsword Arts "but both must be Blade Art" (a Self cantrip), yet High Fantasy says Unleash applies "when you use your Augmented Assault Feature to cast a Spellsword Art that has an area". The sheet offers the Unleash box at 13th level with the source wording and applies no area mechanic.
2. **Casting level.** "Maximum level you can cast that Art at" is read as the Artsblade table maximum for every Art; an Art with a lower own maximum is not modelled.
3. **Ferocious Fling CON.** The plan's `targetConMod` is the launched Creature's Constitution modifier (source L2588), not the Creature hit; the sheet asks for it.
4. **Single-target fields.** `targetUuid` (Blade Art, Feint, Fling) and `allyUuid` (Tag In) are sent only when exactly one token is selected.
5. **Level prerequisites warn, they do not hide.** Pursuit Unrelenting stays visible below 11th level (WORKFLOW §3.2 rule 3); other level-gated buttons keep their existing hide rule.
6. **Selected Arts Pools** (B-192): where the 1 + 2 chosen Spellsword pools are stored.
7. **Cancel semantics (B-190):** Foundry's DialogV2 turns a null callback into the action id; every confirm loop must test for explicit acceptance.

## Limits
- Cost text is a sheet-side table (`COMMAND_INFO`) beside the plans' own costs; it can drift if a plan changes (the plans do not expose cost metadata).
- Other subclasses' prompts keep their text and free-text target names; only the confirm wrapper, escaping and Force of Will's attunement call changed. Their plans and rules were not audited here.
- Brutal Execution's plan-side relay was not confirmed live (it belongs to the Centurion unit); Confirm was exercised for Smite, Body Check, Blade Art and Augmented Assault only.
- B-190 is observed on the live warning dialog; the reading and undo dialogs share the same pattern but were not each clicked live.
