# Guard audit 13: Musha subclass

Audit only (2026-10-12, Claude Sonnet 5.5). No production code, tests, TODO.md or DECISIONS.md changed.

## Scope and reading
- Source: AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt L3251-3316 read in full (no outside section referenced beyond Ch.1 Construct healing, already cited by damage-pipeline.mjs). README.txt, AGENTS.md, WORKFLOW.md, bugs/README.md read.
- Code read in full: ak5e/scripts/musha-features.mjs, ak5e/test/musha.test.mjs, ak5e/scripts/guard-uses.mjs, play-uses.mjs, play-uses-sheet.mjs. Musha paths only: guard-sheet.mjs (L59, L271-288, L909-953, L1133), guard-rules.mjs (L16, L21), guard-progression.mjs (L394-397), ak5e.mjs (L64, L193-199, L356).
- dnd5e 5.3.3 (read-only, local install): applyDamage / preApplyDamage / restCompleted.

## Checks run
- npm test:guard 118/118 pass at baseline; npm run check:files passed with the new ak5e/audits/ folder and bug files in place ("Validated module.json, lang/en.json, and 219 .mjs files"); test:guard still 118/118.
- Four Node probes (outside the repo, scratchpad) against the real modules and guard-fixture: Soloblade/Blood Price + useRoll, Not Yet/Reset, Retaliator, Stand Alone hook, updateActor hook, Go Forth with injected write failure, undo of Reset/Retaliator/Go Forth.

## Filed (all "Unverified": Node probe or static review, not Foundry)
- B-280 High Soloblade restores no HP. B-281 High Blood Price applies no HP loss, stores an invented 9/18.
- B-282 Medium Blood Price options have no effect, dialog wording. B-283 Medium Stand Alone self-heal exemption never matches dnd5e options.
- B-284 Low Question: Stand Alone amount / Temp HP stacking. B-285 Medium Not Yet has no save button or survival HP.
- B-286 Medium Reset Not Yet DC unwarned. B-287 Medium Retaliator ignores Go Forth prerequisite, Iai unreachable.
- B-288 Medium updateActor reset on every client, non-idempotent registration. B-289 Medium Living on the Edge display-only.

## Existing bugs re-verified
- B-135 confirmed for Musha: mushaGoForth spends the Reaction inside apply (musha-features.mjs#L245); injected receipt-write failure left 0 Reactions and no receipt.
- B-129 confirmed by static review: Musha sheet commands (guard-sheet.mjs#L918, #L953, #L1133) pass confirmed:true and confirmPlayUse opens a dialog only for warnings.
- B-133 not reproducible for Musha: no plan mutates state.data; Not Yet/Reset/Retaliator restore through flagChanges and resources.
- B-132 (progression repeats HP/ASIs) not exercised; only the Wis save line (guard-progression.mjs#L395) was read.

## Verified clean
- Soloblade dice scale 2d6 / 2d8 (7th) / 2d10 (14th); Nothing to Lose thresholds (<=50% one, <=10% two; floor is exact for integer HP); Edge tiers and ceil(PB/2); Not Yet base DC 10 and +5; surviveHp = 2 x PB; Wis save proficiency granted at setup; Go Forth text matches L3301; Retaliator costs 2 Aggression, clamps at 0, undo refunds; undo of Reset, Retaliator, Not Yet restores values and explains a stale first receipt ("Won't restore ...").
- Never auto-rolls: Soloblade/Blood Price dice roll only from the card button.

## Notes for the owner (outside my write scope)
- DECISIONS.md L1883-1901 restates the source wrongly in places: Nothing to Lose "when taking the Attack action" (source: Bonus Action), Blood Price "Bonus Action" (source: Action), Go Forth "creature ends its turn within 30 ft / half Speed" (source L3301: Creature makes an Attack against you / up to your Speed), Ichimonji "Off Balance condition". Greater Blood Price as 4d8 (DECISIONS L1967) versus doubling a single 2d8 roll is a logged interpretation; same average, different variance.
- Nothing to Lose has no use plan or button, only the badge count (shows "0 Bonus Attack(s)" above 50% HP).
- musha.test.mjs titles ("unreducible self-damage", "without auto-rolling") assert receipt fields only, never HP; this is why B-280/B-281 pass.

## Limits
- No Foundry run, no browser, no screenshots. Roll was mocked. The fixture does not implement Foundry's "==" force-replace, so Reaction refund/undo cannot be judged in Node (refund returned "missing" for core forestall too) and is not claimed.
- Fan-out of updateActor across clients and dnd5e option shapes come from API/source reading, not a live session.
