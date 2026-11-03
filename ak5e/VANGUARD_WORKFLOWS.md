# Vanguard workflows — implementation and acceptance

This development increment covers base Vanguard, Agent, Charger and Pioneer.
The source authority is AK5e 1st Edition v1.3.1, Chapter 3, lines 7904–8484,
with the shared Operator Skill rules in Chapter 1. Skills and Talents reuse
the existing workflows; this increment does not claim every catalogue effect
is newly automated. Public release packs and redistribution are separate work.

## Queue and adversarial review

Each queue item requires two sequential pairs: an implementation worker with
a read-only source adversary, then an integration/test worker with a Foundry
validator. The parent reviews code and evidence before advancing the queue.

| Queue item | Implementation/source pair | Integration/Foundry pair | Acceptance |
| --- | --- | --- | --- |
| Base Vanguard | Code/source pass complete; guided boundaries recorded below | In progress | Pending |
| Agent | Pending | Pending | Pending |
| Charger | Pending | Pending | Pending |
| Pioneer | Pending | Pending | Pending |

The planning rules mapper read all 8,856 lines of Chapter 3 sequentially without
truncation. Independent runtime and test investigators confirmed that the
previous Vanguard helpers were not registered by the module entrypoint and
that passing helper tests did not establish playable subclass workflows.

Base implementation pair: `base_vanguard_worker` and
`base_vanguard_adversary` (configured Luna roles). The source review closed
progression replay/stale-preview defects, equipment reconciliation, missing
managed-effect migration, Tip dice/target validation and visible guided
Attack Action/Uncanny procedures. Storm's multiple-component reading and the
Skill/Tip bridge were handed explicitly to the acceptance pair, not certified
complete. Acceptance pair: `base_vanguard_integration` and
`base_vanguard_validator`.

## Required feature coverage

Rows remain pending until runtime behavior and the relevant rendered workflow
have been verified. Source-preserving descriptions alone do not establish
automation. Voluntary movement, Quicklaunch, darkness visibility, Geirskögul's
movement chain and Lightspeed's manual turn steps must remain visibly guided
where native behavior is unreliable.

| Feature group | Required behavior | Status |
| --- | --- | --- |
| Chassis/progression | d8; native saves/proficiencies; equipment or LMD; HP/ASI; branch/feature grants; Skill/Talent choices and upgrades; repeat/stale-preview safety | Pending |
| Landstrider | +10 ft walking; target-specific Nimble for the rest of the Turn | Pending |
| Tip of the Spear | Six cumulative outcomes; visible ally within 60 ft; owner-click dice; additive THP; source-start expiry; counted grants | Pending |
| Quick off the Mark | Optional initiative +PB from level 3 | Pending |
| Extra Attack | Two attacks with Attack action from level 5 | Pending |
| Uncanny Dodge | Reaction; halve a seen attacker's Attack damage, rounded down | Pending |
| Directed Engagement | Reaction; choose Tip outcomes through end of the Turn | Pending |
| Lightspeed | Round-one second turn at initiative −10, with guided begin/complete bookkeeping | Pending |
| Approaching Storm | Optional half Vanguard level added to first-round damage rolls | Pending |
| Skill interactions | Leading Lance: two Tips and 10 SP on qualifying kill; Devastating Blow: Tip; no duplicate counted grants | Pending |
| Agent — Strike from the Shadows | Quicklaunch instructions; Invisible Attack-action snapshot; one additional attack; Tip on qualifying hits | Pending |
| Agent — Secret Agent | Expertise; Fade PB/LR, free in Darkness, correct expiry and early ending | Pending |
| Agent — Surgical Strike | Once-per-Turn movement allowance; target-specific Second Strike | Pending |
| Agent — Closing the Case | Bonus Action, 30 ft, qualifying hit count, d8/double-d8 at level 14 | Pending |
| Agent — Consummate Professional | Mechanism Kit proficiency and unlimited access | Pending |
| Agent — Smoke and Mirrors | 10-ft darkness, own vision guidance, action/reaction choice, SR recovery, kill exemption | Pending |
| Charger — Gathering Momentum | Max 6; initiative/qualifying-hit/Couch gains; combat-exit reset | Pending |
| Charger — Couch/Momentous Strike | Speed phases and stored attack bonus; spend all Momentum; d6/d8/d10 scaling | Pending |
| Charger — Crash and Bash | Heavy Melee proficiency/exchange; per-target Marks and Tip-on-zero-HP | Pending |
| Charger — Onto the Next | Bonus-action attack allowance; Unbalancing Charge advantage | Pending |
| Charger — Deathblow/Renewing Momentum | Ignore Resistances at 5+ Momentum; once-per-Turn kill gain | Pending |
| Charger — Geirskögul | LR use; increased Martial DC; owner-operated saves; guided movement; reviewed collision damage | Pending |
| Pioneer — Heavy Duty | Heavy Melee/Medium Armour; equipment exchange; +2 HP at grant and later levels without duplication | Pending |
| Pioneer — Auramancy | Ten effects; 15/30-ft moving radius; Action toggle; incapacitation; LR selection; recipient eligibility and overlap | Pending |
| Pioneer — SP thresholds | Actual committed SP spend; each 20 grants inactive aura plus Tip; remainder and deduplication | Pending |
| Pioneer — Moment of Power | Skill Haste; Tactical Burst count 1 + floor(actual activation SP / 10) | Pending |
| Pioneer — Cycle of Violence | Additional auras; qualifying Skill-end refund | Pending |
| Pioneer — Breakthrough Skill | Separate Elite slot; five eligible class tables; ignore charging method; LR exchange | Pending |

## Validation environment

Private test data: `/tmp/ak5e-vanguard-oarpw3q9`; disposable World ID:
`standard-test`, explicitly marked `flags.ak5e.disposableVanguardTest`.
The existing installed World and system files are not modified. Foundry
13.351 runs on Node 22.22.1 at localhost port 30186 with D&D5e 5.3.3 and
only AK5e enabled. The module is served from this checkout through a private
test-data symlink. Module version at bootstrap: 0.5.6.

Browser bootstrap through `launchTestBrowser()` succeeded: the GM joined,
the module loaded, and separate player/observer accounts were created in the
disposable World. This establishes test infrastructure only. Renderer,
gameplay screenshots, player relay, reload and restart acceptance are pending.

The test runner reports file-level counts in this environment. An intentional
failing test under `/tmp` correctly exited nonzero, confirming failure
propagation; directly running `vanguard-adversarial.test.mjs` on Node 22 also
ran and passed its 15 named assertions. File counts are not assertion counts.

| Check | Result/evidence |
| --- | --- |
| Previous focused Vanguard suite | PASS before implementation; helper-only evidence |
| Source/number/ID checks | Planning audit complete; final implementation review pending |
| Focused/new regression suites | First-pair `npm run test:vanguard`: six test-file passes, zero failures; final integration regressions pending |
| Shared/Standard Bearer regressions | Pending |
| Full suite and generated-content checks | Pending |
| GM/player interaction and relay | Pending |
| Screenshot inspection | Pending; validator must open every reported image |
| Reload/server restart | Pending |
| Locked release-pack import | Not part of this development increment; remains unverified |

## Decisions and reporting

Unresolved readings belong in `DECISIONS.md`; source text is retained.
Confirmed source behavior: Auramancy counts SP already expended and does not
charge another 20 SP. Tactical Burst grants the clearly stated Tip count;
its malformed wording defines no additional generated resource. Record actual
spend and grants together under stable operation IDs, and reverse dependent
state conservatively on undo.

The completion report must distinguish static review, Node tests, actual
rendered interactions, screenshot viewers, guided/manual boundaries and any
remaining unverified behavior. No release or publishing claim follows from
development acceptance.
