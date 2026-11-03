# Five-branch batch: resume point (2026-10-25)

Read this file and nothing else to resume. Do not re-read the source chapters, the worker prompts or the Codex transcripts until a unit needs them.

**Task (owner):** scan Artsblade, Artificer, Bard, Infuser and Witchcraft, plus their parent classes Guard, Supporter, Specialist and Medic, for bugs, and implement whatever is missing, using adversarial pairs. Follow `CLAUDE.md`:
- at most 4 workers live at once
- a Sonnet `implementer` paired with a Haiku `tester` challenger
- Opus `routine-reviewer`
- `foundry-validator` views the screenshots

**Full plan with the worker prompt template:** `~/.claude/plans/scan-these-subclasses-and-groovy-puddle.md`. Open it only to copy the template.

## State

- **Branch.** `feat/five-branches` is pushed. It contains:
  - Codex's previously uncommitted WIP (cba4a0a)
  - the merge of `origin/feat/supporter-base`: Supporter, Hexer, Artificer and Bard, PRs #8–36
  - the Codex `guard-sol-worker` Artsblade corrections
  - U0 (#37)
  - the rulings
  
  Nothing has gone to `main`.
- **Tests.** `node --test ak5e/test/*.test.mjs` gives 2681 tests with 6 failing, all owned by U1:
  - `artsblade.test.mjs:98`
  - `guard-branch-adversarial.test.mjs:195,217,236,361,387`

  The cause is that Cut Through Chaos now needs a selected native melee weapon.
- **Rulings** are in `ak5e/DECISIONS.md` under "Five-branch batch rulings". Items 1–11 cover Medic casting and Witchcraft, 12 covers the Martial DC choice and 13 covers the U0 arbitrations.
- **Confirm contract.** `confirmPlayUse(title, attempt, { preview, confirmed })` confirms each use exactly once. A caller that already has its own Confirm form passes `confirmed: true`.
- **Bug IDs.** The remote owns B-302 (Cancel resolves to the action string). The Infuser bugs are B-303–B-307.
- **Workers cannot use the Skill tool.** Tell them to review their own diff by hand.
- **Worktree base.** `isolation: "worktree"` does not start at HEAD, so every prompt must begin with `git fetch origin && git switch -c <branch> origin/feat/five-branches`.
- **Codex's Foundry server** runs on port 30187 (`/tmp/ak5e-five-branches-x6z5x8s1/...`). Leave it alone.
- **E2E seed.** It was in the session scratchpad and may be gone. To rebuild it, copy the `Config` folder and `Data/{systems,worlds}` from `/tmp/ak5e-five-branches-x6z5x8s1/acceptance-20261024-01/userdata` (Foundry 13.351, D&D5e 5.3.3, World `standard-test`). Then set `dataPath: null` and `upnp: false` in `Config/options.json`, and create an empty `Data/modules`. Ports 30191–30195 are U1–U5.

## Stopped mid-work (uncommitted, in `.claude/worktrees/agent-*`)

| Worktree | Branch | State |
|---|---|---|
| agent-a6b9ad363b0985ebf | five/u1-guard | U1 implementer; 7 files edited, was editing `guard-uses.mjs` |
| agent-a0517126b5328df6c | five/u1-guard-adversarial | U1 challenger draft; it noted its HP-roll tests pass vacuously and need a fresh actor |
| agent-a6cc4993b815e9066 | five/u2-infuser | U2 implementer; barely started (1 file) |
| agent-aa1c37f759d2fbb74 | five/u2-infuser-adversarial | U2 challenger draft; it noted the B-303 tests cascade off the B-305 relay and the progression tests pass vacuously |

To resume, review each worktree's diff with `git -C <worktree> diff --stat`, then decide whether to keep it or restart. Relaunch with the original unit specs in the plan file plus the findings below.

## Next steps

1. **W1.** Finish U1 and U2, which are both pairs. Arbitrate the challenger reds, merge the PRs into `feat/five-branches`, and run the full suite.
2. **W2.** U3 (Medic casting + Witchcraft) and U4 (Supporter + Artificer).
3. **W3.** U5 (Bard), plus `routine-reviewer` over the merged W1 and W2 work.
4. **W4.** `routine-reviewer` on U5, then a `foundry-validator` rendered GM/player pass for all five branches.
5. **Finish.** Update `TODO.md` (header L3–20 and the per-branch sections), move fixed bugs to `bugs/fixed/`, and update `FIVE_BRANCH_WORKFLOWS.md`.

## Unit findings, from the read-only W0 hunts (verify each before fixing)

**U1, Guard + Artsblade.** Owns `guard-*.mjs`, `artsblade-features.mjs` and `tools/test-guard-live.mjs`.
- Fix the six red Cut Through Chaos tests by changing only the fixture: supply a weapon.
- Codex acceptance failure: "same-turn second Blade Art says save was already made".
- B-150 remainder: Casting Unit and the Artsblade feature Items. Reconcile B-129–140, B-150 and B-153.
- F2: progression marks defaulted HP and ASI levels as granted (`guard-progression.mjs:252,669,689`).
- F3: Eternal Aggression's `rolls` are never consumed (`guard-uses.mjs:177,209`). Route them through `useRoll`/`resolveRoll`.
- F4: the Annihilation Protocol handler is `actor =>`, but it receives `event` (`guard-features.mjs:166`). Hunter has the same shape at `hunter-features.mjs:292,303` (not in scope).
- F5: Martial DC uses the higher of STR and DEX. Use the character's choice instead, following `vanguard-rules.mjs:138`.
- F6: Deadly Fighter is not limited to once per turn (`guard-features.mjs:122`, source L1843).
- F7: there is no validation of ASI, HP rolls or skills (`guard-progression.mjs:566,587,438`).
- F12: `askMartialAbility` resolves to "ok" (`guard-sheet.mjs:395`).
- Forms that double-confirm should pass `confirmed: true`. Give the other commands real previews.

**U2, Specialist + Infuser.** Owns `specialist-*.mjs`, `infuser-features.mjs` and `tools/test-specialist-live.mjs`.
- B-303: Leverage should use the owner's native save bridge (`play-uses.mjs` ~244/403 `nativeSaveOutcome`).
- B-304: Double-Blind should take a clicked d6 through `useRoll`/`resolveRoll`.
- B-305: target writes should go through registered `targetKinds` with relay and undo, following `medic-uses.mjs` ~738. Validate the revert too.
- B-306: expire the Infusion, `invulnerableUntil` and the Leverage lockout.
- B-307: the sheet needs an option picker and a range warning.
- F1: the Progression button consumes levels silently (`specialist-sheet.mjs:397`, `specialist-progression.mjs:168`).
- F8: re-applying progression grants twice, and state is written before items are created (`:922` before `:925`).
- F9: the Mark refund has no check for a spent Mark.
- F10: no Specialist passives are implemented (fighting styles, Weapon Adept reroll, Weapon Expertise crit).
- F13: remove the invented "Specialist DC". F5 Martial DC applies here too.
- F14: the Mark default skill is Acrobatics, Defensive Style has no gate, and Weapon Mastery has no per-turn limit.

**U3, Medic casting + Witchcraft.** Owns `medic-*.mjs` and a new `witchcraft-features.mjs`. Implementation follows DECISIONS 1–11.
- Medic Arts never reach `arts-casting.mjs`: no `artsPoints` flag is written. Copy `applyGuardianArts` (`guardian-features.mjs:96`).
- Urgency of Treatment should become a quote discount: `registerArtQuoteOptions`.
- Self-Defence Protocol and the Halfway House pools are grant `reduction`s: `registerArtGrant`.
- Efficient Life Support is a consumer: `registerArtConsumption` (`arts-casting.mjs:29-47`).
- New pools: `healingThroughHarm` (SR) and `lifeThroughDeath` (LR).
- There is no "damage rolled" event kind (`trigger-events.mjs:24`). The head owns that file and must add it.
- `touchHeal` has no range check (`medic-uses.mjs:106`).
- `medicUses` invents dice defaults (`rolledHealing ?? 10/20`); they must come from a clicked roll.
- Add `witchcraft` to `IMPLEMENTED_MEDIC_BRANCHES` (`medic-rules.mjs:17`).
- Medic forms that double-confirm should pass `confirmed: true`.

**U4, Supporter + Artificer.** Owns `supporter-*.mjs` (except `supporter-branches*`) and `artificer-*.mjs`. It may also edit the `play-uses.mjs` revert path.
- HIGH: revert is never target-validated (`play-uses.mjs:201-208`). `fieldsValidate` accepts any uuid listed in the attacker's own automatons list without the `automaton` flag (`artificer-features.mjs:229`). A forged receipt lets the GM relay set any Actor's HP.
- MED: the Advanced Aid temp-HP relay is unbounded and has no pool-debit check (`supporter-uses.mjs:382,87`).
- MED: the Automaton relay trusts client stats (`artificer-features.mjs:318`). The GM should recompute HP as 25 + Tech and to-hit as INT + PB.
- MED: the Advanced Aid crit rider hits the next attack, not the current one (`supporter-uses.mjs:395`).
- MED-LOW: progression is not atomic (`supporter-progression.mjs:609-617`).
- LOW:
  - The Tool/Vehicle choice is never written (`:159`).
  - Re-picking an ASI or HP level re-applies it (`:165`).
  - Unapplied levels default to "keep" (`:282`).
  - The range warnings are dead because `distance: 0` is hardcoded (`supporter-sheet.mjs:219,238`, `artificer-features.mjs:729`).
  - Names are unescaped in cards (`supporter-uses.mjs:226,271`, `artificer-features.mjs:391,566`).
  - The Automaton-cap "crumble" rule is missing (`:428`).
  - Arbalest's once-per-turn limit is not tracked.
  - Progression and setup have no serial lock.
- Known gaps: Armoured Core's two upgrades are advisory only (`:301,656`), Equipment and Proficiency Exchange is missing (C3 L6898), and the Arts Detonator 0-HP use is not enforced.

**U5, Bard.** Owns `bard-*.mjs`. `supporter-sheet.mjs` belongs to U4, so U5 asks the head for any change there.
- An Emergency Improv insert before the cursor does not shift `active.index`, so the Performance repeats or skips an Art (`bard-compose.mjs:204`, `bard-perform.mjs:244`).
- After undo, Soul of the Bard can be redone into Expertise. The undo only restores flags and leaves `system.skills.prf` (`bard-compose.mjs:365,390`).
- Ending the Performance at turn end drops the keep-Concentration choice and the confirm (`bard-perform.mjs:446`).
- The Performance survives a Long Rest and combat end, along with the Crescendo effect. There is no `combatEnd` handler, and the rule needs a ruling first: L7108/7112 are silent.
- Undoing a compose can delete the active Performance (`bard-compose.mjs:231`).
- The Performance cap is `max(1, CHA)` at `bard-compose.mjs:96`, but both the source and DECISIONS say CHA with no minimum.
- Emergency Improv:
  - its one-minute expiry is not enforced (`:288`)
  - it gives no warning when no Aid Dice are left (`:469,489`)
  - an insert into an ended Performance is accepted
- A Performance with zero Arts can be started (`bard-perform.mjs:184`).
- Known gaps: Shatter 5th and Chromatic Orb Thunder have no variants, other Arts' Concentration is not ended, and writes to the `performances` array race.

## Out of scope

Therapist and Ward (also unimplemented), Ritualist and Summoner, release packs, and anything on `main`.
