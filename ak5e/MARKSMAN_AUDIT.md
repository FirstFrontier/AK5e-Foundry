# Marksman, Anti-Air and Artilleryman audit

Date: 2026-10-11. Scope: source fidelity, generated content, setup/progression,
runtime code and test adequacy. **Audit only: no gameplay fixes.**

## Result and evidence limits

The generated source inventory is complete for the selected scope, but the
current helpers do not meet the project's gameplay acceptance criteria. The
most serious defects are broken control calls, incomplete undo, placeholder
Artilleryman descriptions, and progression that can repeat ASIs and replace
authored HP. The existing tests pass without exercising these failures.

Source references below use `C3` for
`AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`, `C1` for Chapter 1,
and `C4` for Chapter 4. Runtime locations are relative to `ak5e/scripts/`.
Generated IDs refer to `chapter-three-content.mjs`; they are source identities,
not proof of shipped compendium UUIDs. The manifest currently declares no packs.

Parent: Codex. Delegated read-only work: a GPT-6 Luna rules mapper and progression
explorer, plus a GPT-6.1 Sol independent play/undo reviewer. The parent inspected
their evidence and reran the reviewer probes. No Claude review is claimed.
**Foundry/browser inspection, screenshots, clean-World imports, persistence and
actual renderer verification were not performed.** No screenshot was viewed by
any agent in this audit. Node probes establish code behavior under mocks only.

The rules mapper read Chapter 3 in full, including unrelated classes; referenced
sections include C1:207–300 (DR, Martial DC, conditions, Operator Skills) and
C4:163–201 (weapon properties/Splash). The parent sampled exact source rows and
independently checked every inventory ID/metadata object against generated data.

During the audit, concurrent shared-checkout work added Heavyshot/Hunter/Spreadshot
integration and altered `marksman-rules.mjs`, `marksman-setup.mjs`,
`marksman-sheet.mjs`, `ak5e.mjs` and `marksman-rules.test.mjs`. These changes were
preserved and are outside this audit's subclass scope. The focused 121-assertion
suite and both defect-probe scripts were rerun afterward and still passed their
stated checks. References to shifted setup/sheet lines were refreshed; new
branches are not certified. This audit itself edited only documentation.

## Prioritized findings

Each finding also appears in `../BUGS.md`. High/Medium follow that file's severity
convention. Recommendations describe future fixes, not changes made here.

### B-110 — High: feature and undo controls call incompatible interfaces

`marksman-sheet.mjs:463` passes `(actor, engine, command, data)` to
`confirmPlayUse(title, attempt)` (`play-uses-sheet.mjs:19`). The helper invokes
the engine object as a function and throws `attempt is not a function` before a
dialog/use. The undo button at sheet line 443 reverses `(engine, actor)` and
throws `engine.uses is not a function`. Both failures were reproduced with Node
mocks. Use an actual confirm/quote dialog and a callback to the engine, with
stable operation identity, and correct undo argument order. Acceptance: click
the real controls as GM and player; cancel changes nothing.

### B-111 — High: undo refunds costs while retaining benefits

`play-uses.mjs:343–352` reverses resources and registered cleanups/targets, not
arbitrary updates returned by a plan. Marksman and these branches register no
cleanup for their flags. Probes used the complete engine command/undo path:
Target Lock, The Last Option and a deployed munition remained active after undo,
while their resource returned to 1. Clear/retarget, Weight of Fire and free-option
state have the same missing restoration mechanism. Source durations: C3:3647,
3889, 3942, 3983. Snapshot and restore every changed field, including absence;
review conflicts from later changes before undo. Test every stateful command,
including older receipts, target effects, reaction refresh and encounter locks.

### B-112 — Medium: Marksman cards lack the shared interactive controls

`marksman-sheet.mjs:13` imports `renderPlayUseCard`, but its registration at
471–485 only adds a header button. No Marksman chat-render handler invokes it.
Direct API uses therefore get descriptive cards without the shared Undo/Retry/
Roll controls; the sheet Undo path is also broken. Register the renderer for
Marksman receipts and test owner/GM visibility and non-owner absence. This is a
static wiring finding; actual card rendering remains unverified.

### B-113 — High: all six Artilleryman setup grants lose source descriptions

`marksman-setup.mjs:36–42` uses `class-feature-marksman-artilleryman-*` IDs, but
the generated records use `subclass-feature-marksman-artilleryman-*` IDs.
The fallback at 128–142 creates only `AK5e Marksman Feature: NAME`. An in-memory
level-18 preview produced six placeholders, omitting all rules in C3:3971–4024.
Use existing generated identities and provide a migration that preserves
authored Items; do not casually replace stable IDs. Acceptance: source text on
every new branch grant, safe repair of existing placeholders, idempotent reapply.

### B-114 — High: progression repeats ASIs and overwrites authored HP

`marksman-progression.mjs:106–122` recomputes all Marksman HP and assigns it as
the Actor's entire maximum. Lines 156–163 add each submitted ASI to the current
ability again; stored `asiLevels` are never used to prevent reapplication.
A level-4 mock with STR 12 and max HP 100 became STR 14/max HP 31; the same
choices' next preview gave STR 16. This can also erase Tough's explicit
2×character-level contribution (C3:3810) or other reviewed HP adjustments.
Track applied contributions, preserve other gains, and offer an explicit
already-included migration choice. Test reapply, level-up/down, negative CON,
authored HP/Tough and changed Constitution without inventing retroactive rules.

### B-115 — Medium: advertised character choices are not applied

The inspector lists tools, styles and talents (`marksman-progression.mjs:35–44,
79–89`), but apply only writes the HP/proficiency/save/ASI updates at 120–194.
It neither grants a selected Fighting Style/Talent/module nor equips starting
gear/LMD or applies a tool/vehicle choice. Artilleryman's additional launcher
proficiencies also have no branch-specific grant. Source: C3:3544–3563,
3615–3642, 3655–3668, 3976. Generic feature descriptions and shared Operator Skill
learning are separate and do not implement these choices. Implement reviewed
choice/grant workflows or clearly expose the complete manual procedure. Do not
claim all 42 Talent effects are automated.

### B-116 — Medium: the preview key does not bind ASI values

`marksman-progression.mjs:170` hashes field names, not values/choices or current
ability scores. A +1 STR preview key was accepted when apply submitted +2 STR.
The ASI loop also lacks a source-budget check, and skill arrays lack the
three-from-the-printed-list warning (C3:3548, 3658–3659). Bind the full reviewed
before/after values and choices to the preview; malformed numbers must fail
before writes, while valid source-rule overrides follow WORKFLOW §3.2. Test
changed choice values, authored edits after preview and cancellation.

### B-117 — High: Target Lock has no functional one-minute expiry

`marksman-uses.mjs:65–72` records only active state/turn key; consumers at
`marksman-features.mjs:110` and `marksman-rules.mjs:197` inspect active/UUID without
elapsed-time checks. A mock old lock still qualified after world time advanced.
Shifting Focus (`anti-air-features.mjs:113–119`) replaces the lock and inserts a
new wall-clock start instead of preserving remaining duration; there is no
dead-current-target prerequisite warning. Source: C3:3647–3650, 3889. Store and
enforce the original one-minute expiry across combat, rest, reload and retarget,
and warn on missing trigger/visibility/hostility facts without turn gating.

### B-118 — High: both initiative recovery paths are ineffective

`marksman-features.mjs:180` treats an AK5e event as an Actor, but the event bus
supplies an object with `.raw.actor` (`trigger-events.mjs:79,239–241`). The membership
check therefore skips Enhanced Target Lock recovery. Anti-Air recovery at
`anti-air-features.mjs:319` writes `flags.ak5e.pools`, while canonical storage is
`flags.ak5e.resourcePools` (`resource-pools.mjs:224,249`). Engine/event mocks left
both real pools at 0; the latter created an unused value of 1. Use canonical,
receipt-aware recovery and actual event payloads. Test initiative at 0, partial
and full pool values, repeat delivery, and owners/elected GM. Source:
C3:3675,3931; Enhanced's unlock level remains an unresolved source conflict.

### B-119 — Medium: Fighting Style hook boundaries diverge from source

Deadly Fighter expands critical range on every matching attack instead of the
first each Turn (`marksman-features.mjs:144–149`; C3:3628). Close and Personal
only clears disadvantage when advantage is false (lines 134–139), so it leaves
both flags set when another feature grants advantage despite C3:3622 saying the
character does not have disadvantage in the adjacent-hostile case. Correct
scoped roll adjustments, track the first qualifying attack reversibly, and
test repeated rolls and competing advantage/disadvantage. Whether the wording
also removes unrelated disadvantage needs an explicit reading, not an invented
cause filter. Smooth Operator's optional modifier and possible native double
application need rendered verification. Four other styles remain manual.

### B-120 — High: Weight of Fire permanently suppresses advantage

`anti-air-features.mjs:90` sets `weightOfFireActive`; lines 305–307 read it on all
future attacks, including melee. No consumption/turn reset exists and the
repeated ranged attack is only narrated. A probe's second, unrelated melee roll
also lost advantage. Source C3:3882 requires an advantaged ranged attack in the
Attack Action, once per Turn, against the same Creature. Hold the chosen attack,
offer the additional owner-clicked attack, and consume the scoped flag. Warn on
nonqualifying/repeated use and test cancel, replay, next attack and next Turn.

### B-121 — Medium: flight capability is mistaken for being airborne

`anti-air-features.mjs:66–70` treats positive fly speed or positive absolute
elevation as airborne. A grounded Actor with fly speed 30 received Pigeon
Shooting eligibility. C3:3887 requires actual ground separation or 60 feet
moved during the last Turn. Movement flags are read but have no writer in the
audited helpers. Use reviewed current airborne/movement evidence or expose a
manual fact choice, distinguishing a raised floor from flight. Test grounded
flyers, elevated floors, actual airborne targets and 59/60-foot boundaries.

### B-122 — High: The Last Option neither expires nor resets its free use

`anti-air-features.mjs:136–137,164,275–276` uses persistent booleans without an
expiry or own-turn reset. After the first free Option, future Turns consume
paid uses; the stance can remain active indefinitely. Its additional Attack
Action attack has no execution helper, only summary text. Source C3:3942–3945:
one minute, one free Option on each own Turn, one extra ranged attack per Attack
Action. Track duration and turn identity, expose explicit owner-clicked attacks
or a clearly manual procedure, and test free/paid use across Turn boundaries.

### B-123 — Medium: Versatile Approach lacks required inputs and resolution

The sheet supplies only option/first target (`marksman-sheet.mjs:451–460`). The
plans (`anti-air-features.mjs:171–212`) record narrative `result` fields, not
`receipt.formula`, saves, placed geometry or validated target changes. Area
Denial has no chosen point/height or delayed trigger; immunity nominees and
lingering entry/end-turn effects are absent. Shoot to Kill defaults to one
instance because no damage ledger or count prompt is supplied, and there is no
one-Option-per-Attack warning. Source C3:3903–3915,3934–3937. Crowd Control's
15-foot repeats/half damage, Stop their Approach's WIS save/20-foot reduction/
cumulative duration and 15th-level 10-foot success result are described but not
resolved. Add guided inputs, save/roll controls and reviewed operations, or
document the full manual process; do not label these cards effect automation.

### B-124 — Medium: Unapproachable omits trigger and repeat-limit warnings

`anti-air-features.mjs:220–255` checks only class level and Reaction availability
for an unlocked target. It does not warn on weapon normal range, movement,
hostility, or repeating against the same Creature before the next own Turn;
the attack and half-Speed movement are summaries. Source C3:3919–3921. Keep
out-of-turn use permitted, but gather/warn on trigger facts and previous target
uses, then expose owner-clicked attack and reviewed manual/native movement.
Test normal-range entry versus movement within 30 feet, locked-target free
Reaction, repeated same target and Reaction undo after a refresh.

### B-125 — High: Artilleryman damage hooks ignore Thunder qualification

`artilleryman-features.mjs:209–219` appends Expertise dice to any Splash damage,
without checking Thunder. A level-15 Piercing Splash mock changed `2d6` to
`2d6 + 3d6`. Lines 224–230 request doubling of the whole first roll against the
first targeted vehicle/structure, also without checking damage type; a
Piercing mock got `multiply:2`. Source C3:3978,4014 qualifies Thunder Damage.
Scope bonuses per actual typed Thunder component and recipient; do not infer
the rest of an area from the first selected target. Verify the native roll
adapter and mixed targets in Foundry before claiming doubling works.

### B-126 — Medium: Artilleryman blast helpers are incomplete manual cards

Deploy stores a default `{x:0,y:0}` and weapon name but no weapon UUID/effective
Splash/range or gameplay-time timeout (`artilleryman-features.mjs:100–115`).
Detonate only flips active state and spends a Reaction (122–144), without
resolving the saved Splash attack. No ten-minute timeout/disarm helper exists.
Secondary Detonation defaults `originalDamage` to zero (157–166), and the sheet
never provides it, a selected centre, a damage-origin receipt or target list.
Neither its no-chaining rule nor Scatter Them's qualifying hit/movement/collision
resolution is implemented. Source C3:3983–3990,4012. Preserve source weapon and
geometry, use gameplay time, gather reviewed results, and expose native/manual
owner roll/save actions and reversible movement. Test trigger, timeout, disarm,
half damage, save-for-zero, recursion warning and solid collisions.

### B-127 — Medium: key Artilleryman benefits have no effective consumers

`artillerymanSplashDC` exists (`artilleryman-features.mjs:74`), but callers only
expose the public helper and a sheet number; it does not update native Splash/
trap DCs. The display omits a target UUID, hence the Target Lock increment.
Enhanced Payload doubling of X, removing Loading from the launchers, Thunder
resistance and self-inflicted Thunder immunity have no effect/native data
implementation in these scripts. Source C3:3976–3978,3996–3998,4019–4021; C4:197–198
defines Splash as a Dex save instead of an attack roll. Generated weapon
descriptions correctly retain manual Splash instructions. Implement faithful
native/guided consumers or label all of these benefits manual. Keep the
undefined trap base DC and self-damage provenance questions unresolved.

### B-128 — Medium: a failed receipt write can strand a spent Reaction

`artilleryman-features.mjs:137` spends a Reaction inside `plan.apply`, before
`play-uses.mjs:265–268` persists the use receipt. A fault-injection probe rejected
that receipt update after the Reaction update succeeded: availability became 0,
the munition remained active, and no Marksman undo receipt existed. This is a
confirmed mocked failure path, not a live Foundry incident. Persist prepared
operation state before side effects and make retry/rollback idempotent. Test
failed Actor receipt writes and reaction commits without double-spending.

## Source ambiguities and documentation corrections

- **Branch levels:** C3:3586/table and both branches explicitly include level 18;
  C3:3596/prose lists 1/4/10/15. `DECISIONS.md:413` says unresolved, while its later
  Marksman section says standardized. Runtime already grants the branch's 18th
  feature. This audit records the conflict and chooses no new rule.
- **Enhanced Target Lock:** table C3:3579 says 11, heading C3:3670 says 12.
  Generated Item retains level 12; setup/hooks use 11. The decision log's
  rationale about a D&D tier does not settle AK5e source intent. Both readings
  and the current behavior are retained in the decision addendum.
- **Incorrect historical Anti-Air summaries:** the decision block says Weight
  of Fire/Shifting Focus at level 4 and Versatile Approach at level 1; source
  says 1/1/4. It describes Area Denial as 2d8 Bludgeoning/Prone, a fixed 10-foot
  height, automatic Stop their Approach ending at the Marksman's next Turn,
  escalating Target-only Shoot to Kill dice, and Option Recharge only at zero.
  Source instead gives 3d6 Piercing/Dex half, height up to the chosen point,
  WIS save/cumulative slow until the target's next Turn ends, d4 per qualifying
  damage instance to the hit Creature (d6 at 15), and +1 below maximum. These
  summaries are errors, not alternative readings or evidence of automation.
- **Martial DC choice:** C1:211–212 gives STR or DEX modifier at the character's
  choice; `marksman-rules.mjs:177` takes their maximum. Usually beneficial, but
  not a persisted choice. Record/offer the actual choice before claiming exact
  DC fidelity. Splash target-specific DCs must keep this distinction.
- **Manual effects are acceptable:** all 42 Talent effects/modules and four
  Fighting Styles are descriptive/manual. SP costs, native activity fields,
  targeting and expiry support are separate from skill-specific effects.
  The TODO statement that the weapon-property engine gates every subclass is
  not evidence that the audited branch mechanics are actually connected.
- **Pack/release boundary:** no manifest-declared packs exist. This is an
  established project-wide release blocker, not a new Marksman-only defect.
  Locked-pack imports, stable compendium links and licensing remain unverified.

## Executed verification and test gaps

Node v24.18.0 was used. Read-only commands and results:

| Check | Result | What it establishes |
| --- | --- | --- |
| `node --test ak5e/test/marksman-*.test.mjs ak5e/test/anti-air.test.mjs ak5e/test/artilleryman.test.mjs ak5e/test/resource-pools.test.mjs ak5e/test/trigger-events.test.mjs ak5e/test/operation-kernel.test.mjs ak5e/test/operator-runtime.test.mjs` | 121 assertions passed | Existing focused/shared tests; no rendered acceptance |
| `node --test ak5e/test/enhanced-weapons.test.mjs ak5e/test/class-options.test.mjs ak5e/test/operator-progression.test.mjs ak5e/test/operator-targeting.test.mjs` | 34 assertions passed | Generated option/weapon fidelity and generic progression/targeting |
| `node ak5e/tools/validate-files.mjs` | Passed: manifest, translations, 195 `.mjs` initially; 201 after concurrent additions | Required approved subprocess execution after sandbox `EPERM` |
| `node ak5e/tools/verify-generated-content.mjs` | Passed: 2,193 top-level records, 801 Chapter 6 embedded features | Source/generation consistency across six chapters |
| `node --experimental-vm-modules /tmp/marksman-audit-generated-check.mjs` | All eight generator outputs byte-identical | Parent intercepted generator `writeFile` in memory; no actual writes |
| `node /tmp/marksman-audit-probes.mjs` | 11 observations confirmed | Current wrong results/input gaps, not corrected acceptance tests |
| `node /tmp/ak5e-marksman-agency-audit-probes.mjs` | Ten observations confirmed | Eight interface/state/event defects, a fault-injected receipt-write failure and a two-client concurrency model |

The first sandboxed Node test runs reported passing *files* rather than individual
assertions. The authoritative 121/34 counts above come from approved runs that
actually displayed the individual tests. The source worker mistakenly ran the
regenerating `check-generated-content.mjs`; it reported unchanged files. Parent
hash comparisons confirm source/generated files were preserved, and the independent
in-memory run matches all eight outputs. Concurrent runtime changes are identified
above. This is a workflow deviation, not a claim that
the regenerating command is read-only. No gameplay fix or World write was made.

The current branch tests call `PLANS.apply` directly, so they bypass the broken
sheet interfaces, command/undo lifecycle and event payloads. The airborne test
explicitly expects a grounded Actor with a fly-speed trait to count as airborne,
preserving B-121. The level-11 bonus assertion hardcodes an unresolved source
choice. Missing tests include repeated ASI apply, stale values, source IDs,
duration/retarget, first-per-Turn rolls, Last Option Turn reset, canonical
initiative recovery, negative/mixed typed damage, geometry inputs, and full
cancel/player/relay/undo behavior. Existing shared tests are not substitutes for
Marksman integration assertions.

The reviewer's independent-engine concurrency model lost one receipt and failed
its completion after simultaneous writes. This is a **runtime risk**, not a
confirmed real Foundry two-client reproduction. Per-engine queues and whole
receipt-array snapshots need an actual two-client check before claiming safety.

## Separate Foundry V13 GM/player verification checklist

These checks are pending. Use an already authorized disposable D&D5e World or
private copy, never production data or a newly created World by default. Enable
only AK5e. Use `launchTestBrowser()` for Chromium, close in `finally`, record
actual Foundry/system/module versions and the WebGL renderer. Delegate screenshot
viewing to a validator that opens each image and reports PASS/FAIL/UNCERTAIN.

- [ ] Install/open source-backed class, branch, feature, Skill and Talent Items;
  inspect all six Artilleryman descriptions and locked release-pack UUID links
  when packs exist. Verify only GM administration can import/edit packs.
- [ ] Inspect sheet/header/controls and cards as GM, player owner and non-owner:
  text, images, dark-theme readability, clipping, tooltips, links and console.
  Exercise actual clicks; do not substitute API calls with `confirmed:true`.
- [ ] Confirm each use shows cost, targets and all warnings before changes;
  cancel leaves resources, Items, flags, effects and targets unchanged. Ability
  checks and saves have no module confirmation. Use outside own Turn/combat.
- [ ] Override range, prerequisite, timing and resource warnings; verify public
  override/shortfall text and clamp-at-zero behavior with exact undo restoration.
  Test malformed inputs separately from valid table-rule overrides.
- [ ] Verify missing rulings offer per-use choices, while a GM ruling removes
  that choice. No new progression interpretation is implicitly approved.
- [ ] Target Lock: hostile/visible target selection, bonus, initiative recovery,
  one-minute expiry in/out of combat, retarget preserving remaining duration.
- [ ] Styles/progression: actual style and talent/module/tool/gear choices,
  launcher proficiencies, HP preservation, ASI reapply, stale previews, authored
  Items, duplicate/retry and cancel. Exercise all eight styles manually or natively.
- [ ] Anti-Air at 1/4/10/15/18: airborne/60-foot facts, held advantaged ranged
  roll/repeated attack, each Option's save/damage/geometry/trigger, one per Attack,
  upgrades, Unapproachable target limit/Reaction, initiative partial refill,
  Last Option expiry and one free use each own Turn.
- [ ] Artilleryman at 1/4/7/10/14/15/18: actual Splash/save versus attack flow,
  target-specific DCs, Thunder-only extra dice, buried point/reaction/ten-minute
  timeout/disarm, relocated secondary centre/half/save-zero/no chaining,
  Enhanced Payload, fling/collision, structure damage, Loading and resistance/
  self-immunity. Include mixed damage types and mixed area recipients.
- [ ] No attack/damage/healing/save/feature die starts before its owner clicks;
  target owners operate save buttons. Unowned target changes relay automatically
  through the elected GM; no-GM failures are visible, retained for retry and not
  silently queued. Confirm retry applies the requested operation once.
- [ ] Undo every changed flag/resource/effect/movement and relayed target result,
  including an older receipt and a later conflicting change. Verify locks at
  combat start/end, public undo notes and Reaction undo after Turn refresh.
- [ ] Run simultaneous player/GM uses on the same Actor, duplicate deliveries,
  and a failed save/commit/retry. Verify no lost receipt or resource delta.
- [ ] Reload and restart the authorized test server; re-open Items, choices,
  targets, pending operations, expiry state, receipts and links. Leave the audit
  cross-verification boxes unchecked until this acceptance evidence exists.

## Complete generated-entry inventory

The tables below map all 117 selected generated records. Every row links to its
original Chapter 3 line and names its existing stable source ID. Full effect
wording and numeric metadata remain in the generated descriptions/records and
authoritative source; this audit does not replace either. Runtime labels describe
actual helper boundaries, not successful Foundry acceptance.

### Class and subclass documents (3)

| Document and generated ID | Source | Representation |
| --- | --- | --- |
| Marksman<br>`class-marksman` | [C3:3521](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3521) | `class` with printed source; world installer, no declared pack. |
| Marksman: Anti-Air<br>`subclass-marksman-anti-air` | [C3:3876](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3876) | `subclass` with printed source; world installer, no declared pack. |
| Marksman: Artilleryman<br>`subclass-marksman-artilleryman` | [C3:3968](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3968) | `subclass` with printed source; world installer, no declared pack. |

### Class features and Fighting Styles (25)

| Feature and generated ID | Source / generated level | Runtime or manual boundary |
| --- | --- | --- |
| Hit Points<br>`class-feature-marksman-hit-points-78` | [C3:3539](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3539) / — | Progression preview/apply; HP preservation defect B-114. |
| Proficiencies<br>`class-feature-marksman-proficiencies-302` | [C3:3544](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3544) / — | Partial native/custom grants; tool choice absent B-115. |
| Equipment<br>`class-feature-marksman-equipment-695` | [C3:3553](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3553) / — | Printed manual choices; no gear/LMD grant B-115. |
| 1st Level: Marksman Branch<br>`class-feature-marksman-1st-level-marksman-branch-2188` | [C3:3595](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3595) / 1 | Branch detection and setup; source 18th-level conflict. |
| 1st Level: High Ground<br>`class-feature-marksman-1st-level-high-ground-4140` | [C3:3612](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3612) / 1 | marksmanPreRollAttack/checkHighGround; first selected target only; rendered check pending. |
| 1st Level: Fighting Style<br>`class-feature-marksman-1st-level-fighting-style-4311` | [C3:3615](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3615) / 1 | Catalogue Item; selection/grant missing B-115. |
| 1st Level: Target Lock<br>`class-feature-marksman-1st-level-target-lock-5879` | [C3:3647](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3647) / 1 | Core use + attack hook + pool; B-111/B-117/B-118. |
| 2nd Level: Basic Operator Skill<br>`class-feature-marksman-2nd-level-basic-operator-skill-6278` | [C3:3652](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3652) / 2 | Shared operator-progression learning at 2; SP/use/target engine, effects below. |
| 3rd Level: Basic Talent<br>`class-feature-marksman-3rd-level-basic-talent-6441` | [C3:3655](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3655) / 3 | Printed selection at 3, replacement/module at 8; no grant B-115. |
| 4th Level: Ability Score Improvement<br>`class-feature-marksman-4th-level-ability-score-improvement-6685` | [C3:3658](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3658) / 4 | Progression levels 4/6/8/10/12/16/19; B-114/B-116. |
| 5th Level: Extra Attack<br>`class-feature-marksman-5th-level-extra-attack-7003` | [C3:3661](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3661) / 5 | Setup grants descriptive Item; taking two attacks remains manual. |
| 7th Level: Advanced Operator Skill<br>`class-feature-marksman-7th-level-advanced-operator-skill-7125` | [C3:3664](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3664) / 7 | Shared operator-progression learning at 7; effects below. |
| 9th Level: Advanced Talent<br>`class-feature-marksman-9th-level-advanced-talent-7301` | [C3:3667](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3667) / 9 | Printed selection at 9, replacement/module at 13; no grant B-115. |
| 12th Level: Enhanced Target Lock<br>`class-feature-marksman-12th-level-enhanced-target-lock-7562` | [C3:3670](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3670) / 12 | Generated unlock 12; setup/hook use 11; recovery B-118. |
| 14th Level: Elite Operator Skill<br>`class-feature-marksman-14th-level-elite-operator-skill-7865` | [C3:3679](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3679) / 14 | Shared operator-progression learning at 14; effects below. |
| 17th Level: Unerring<br>`class-feature-marksman-17th-level-unerring-8030` | [C3:3682](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3682) / 17 | Tracked 1/SR-LR use/card; adjusting missed roll to minimum hit remains manual. |
| 20th Level: Steel Rain<br>`class-feature-marksman-20th-level-steel-rain-8300` | [C3:3685](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3685) / 20 | Tracked 1/SR use/card; taking the bonus Attack Action remains manual. |
| Braced for Action<br>`class-feature-marksman-braced-for-action-4536` | [C3:3618](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3618) / — | Manual 1/Turn reroll; no Marksman reroll control. |
| Close and Personal<br>`class-feature-marksman-close-and-personal-4675` | [C3:3621](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3621) / — | marksmanPreRollAttack; B-119 and interpretation boundary. |
| Cone of Fire<br>`class-feature-marksman-cone-of-fire-4808` | [C3:3624](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3624) / — | Manual Spread damage on miss; no Marksman consumer. |
| Deadly Fighter<br>`class-feature-marksman-deadly-fighter-4945` | [C3:3627](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3627) / — | marksmanPreRollAttack; first-per-Turn limit missing B-119. |
| Defensive<br>`class-feature-marksman-defensive-5110` | [C3:3630](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3630) / — | Manual equipped melee/shield Reaction +1d4 AC for triggering attack. |
| Ranger<br>`class-feature-marksman-ranger-5331` | [C3:3633](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3633) / — | marksmanPreRollAttack adds +2 for ranged/thrown weapon roll. |
| Smooth Operator<br>`class-feature-marksman-smooth-operator-5421` | [C3:3636](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3636) / — | marksmanPreRollDamage positive modifier path; native/optional roll behavior pending. |
| Two-Weapon Fighting<br>`class-feature-marksman-two-weapon-fighting-5600` | [C3:3639](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3639) / — | Manual damage modifier and draw/stow; no Marksman consumer. |

### Subclass features (12)

| Feature and generated ID | Source / level | Runtime or manual boundary |
| --- | --- | --- |
| Anti-Air: 1st Level: Weight of Fire<br>`subclass-feature-marksman-anti-air-1st-level-weight-of-fire-385` | [C3:3879](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3879) / 1 | Plan + attack hook; persistent flag/repeated attack gap B-120. |
| Anti-Air: 1st Level: Air Tracking<br>`subclass-feature-marksman-anti-air-1st-level-air-tracking-729` | [C3:3884](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3884) / 1 | Pigeon Shooting hook and Shifting Focus plan; B-117/B-121. |
| Anti-Air: 4th Level: Versatile Approach<br>`subclass-feature-marksman-anti-air-4th-level-versatile-approach-1446` | [C3:3902](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3902) / 4 | PB/SR-LR pool; four narrative options, B-123. |
| Anti-Air: 10th Level: Unapproachable<br>`subclass-feature-marksman-anti-air-10th-level-unapproachable-3441` | [C3:3918](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3918) / 10 | Reaction spend/card; attack/movement manual, B-124. |
| Anti-Air: 15th Level: Always Another Option<br>`subclass-feature-marksman-anti-air-15th-level-always-another-option-4043` | [C3:3928](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3928) / 15 | Option upgrade summaries; recharge wrong path B-118, resolution B-123. |
| Anti-Air: 18th Level: The Last Option<br>`subclass-feature-marksman-anti-air-18th-level-the-last-option-5243` | [C3:3939](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3939) / 18 | 1/LR pool + stance flag; duration/reset/extra attack B-122. |
| Artilleryman: 1st Level: Tools of the Trade<br>`subclass-feature-marksman-artilleryman-1st-level-tools-of-the-trade-313` | [C3:3971](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3971) / 1 | Wrong setup ID B-113; DC calculation only B-127, typed dice defect B-125; proficiencies manual. |
| Artilleryman: 1st Level: Delayed Detonation<br>`subclass-feature-marksman-artilleryman-1st-level-delayed-detonation-1025` | [C3:3980](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3980) / 1 | Wrong setup ID B-113; 1/SR-LR deploy/detonate flags/cards B-126/B-128. |
| Artilleryman: 4th Level: Secondary Detonation<br>`subclass-feature-marksman-artilleryman-4th-level-secondary-detonation-1692` | [C3:3985](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3985) / 4 | Wrong setup ID B-113; PB/LR pool + half-damage summary B-126. |
| Artilleryman: 10th Level: Bigger Booms<br>`subclass-feature-marksman-artilleryman-10th-level-bigger-booms-2381` | [C3:3993](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3993) / 10 | Wrong setup ID B-113; DC calculation exists; X doubling manual B-127. |
| Artilleryman: 15th Level: Force of Nature<br>`subclass-feature-marksman-artilleryman-15th-level-force-of-nature-2913` | [C3:4009](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L4009) / 15 | Wrong setup ID B-113; Scatter 1/SR card B-126; Siege roll multiplier B-125. |
| Artilleryman: 18th Level: Explosive Dawn<br>`subclass-feature-marksman-artilleryman-18th-level-explosive-dawn-3520` | [C3:4016](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L4016) / 18 | Wrong setup ID B-113; Loading/resistance/self-immunity manual B-127. |

### Operator Skills (35)

All rows are native `feat` Items with generated Operator Skill/activity data.
Shared learning, SP charging/spending and duration tracking are handled by
`operator-progression.mjs` and `operator-skills.mjs`; target profiles by
`operator-target-profiles.mjs`/`operator-targeting.mjs`. Target profile status
does **not** establish skill-specific damage, conditions, modifiers or triggers.
Those printed effects remain manual unless a separate tested consumer exists;
none of these rows is classified as fully automated by this audit. Effect text
and numeric fields were cross-checked with the generated source records.

| Skill and generated ID | Source / tier | SP cost / start | Charging | Activation / duration | Target profile |
| --- | --- | --- | --- | --- | --- |
| Hidden Might<br>`operator-skill-marksman-basic-hidden-might` | [C3:3701](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3701) / Basic | 10 / 5 | offensive | Bonus Action / 1 Round | manual; effects manual |
| Mark Prey<br>`operator-skill-marksman-basic-mark-prey` | [C3:3702](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3702) / Basic | 15 / 15 | automatic | Bonus Action / 3 Rounds | supported-with-manual-effects; effects manual |
| Meditation<br>`operator-skill-marksman-basic-meditation` | [C3:3703](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3703) / Basic | 10 / 5 | automatic | Action / Instant | manual; effects manual |
| Overpacked Charges<br>`operator-skill-marksman-basic-overpacked-charges` | [C3:3704](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3704) / Basic | 15 / 5 | offensive | Bonus Action / 2 Rounds | manual; effects manual |
| Parting Shot<br>`operator-skill-marksman-basic-parting-shot` | [C3:3705](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3705) / Basic | 20 / 5 | offensive | Action / Instant | supported-with-manual-effects; effects manual |
| Power Strike<br>`operator-skill-marksman-basic-power-strike` | [C3:3706](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3706) / Basic | 15 / 5 | automatic | No Action Required / 2 Rounds | manual; effects manual |
| Splinter Shot<br>`operator-skill-marksman-basic-splinter-shot` | [C3:3707](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3707) / Basic | 15 / 5 | offensive | Bonus Action / 1 Round | manual; effects manual |
| Tracer<br>`operator-skill-marksman-basic-tracer` | [C3:3708](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3708) / Basic | 20 / 10 | offensive | Bonus Action / 1 Attack | manual; effects manual |
| Twinshot<br>`operator-skill-marksman-basic-twinshot` | [C3:3709](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3709) / Basic | 15 / 10 | offensive | Bonus Action / 1 Attack | manual; effects manual |
| Wounding Blow<br>`operator-skill-marksman-basic-wounding-blow` | [C3:3710](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3710) / Basic | 15 / 0 | offensive | Bonus Action / 1 Attack | manual; effects manual |
| Area Overwatch<br>`operator-skill-marksman-advanced-area-overwatch` | [C3:3720](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3720) / Advanced | 30 / 15 | automatic | Action / 4 Rounds | manual; effects manual |
| Armour-Piercer<br>`operator-skill-marksman-advanced-armour-piercer` | [C3:3721](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3721) / Advanced | 20 / 10 | automatic | Action / Instant | manual; effects manual |
| Breacher Round<br>`operator-skill-marksman-advanced-breacher-round` | [C3:3722](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3722) / Advanced | 40 / 20 | automatic | Action / Instant | supported-with-manual-effects; effects manual |
| Cluster Bombs<br>`operator-skill-marksman-advanced-cluster-bombs` | [C3:3734](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3734) / Advanced | 35 / 20 | automatic | Action / Instant | supported-with-manual-effects; effects manual |
| Fleeting Night<br>`operator-skill-marksman-advanced-fleeting-night` | [C3:3735](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3735) / Advanced | 30 / 0 | automatic | Bonus Action / 3 Rounds | manual; effects manual |
| Flexible Camouflage<br>`operator-skill-marksman-advanced-flexible-camouflage` | [C3:3736](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3736) / Advanced | 35 / 15 | automatic | Action / 5 Rounds | manual; effects manual |
| Incendiary Shots<br>`operator-skill-marksman-advanced-incendiary-shots` | [C3:3737](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3737) / Advanced | 20 / 20 | automatic | Bonus Action / 3 Rounds | manual; effects manual |
| Radar Sweep<br>`operator-skill-marksman-advanced-radar-sweep` | [C3:3738](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3738) / Advanced | 20 / 20 | automatic | Action / 10 Rounds | manual; effects manual |
| Ricochet<br>`operator-skill-marksman-advanced-ricochet` | [C3:3739](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3739) / Advanced | 35 / 10 | offensive | Bonus Action / 1 Attack | manual; effects manual |
| Saturation Fire<br>`operator-skill-marksman-advanced-saturation-fire` | [C3:3740](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3740) / Advanced | 40 / 10 | offensive | Bonus Action / 3 Rounds | manual; effects manual |
| Search and Destroy<br>`operator-skill-marksman-advanced-search-and-destroy` | [C3:3741](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3741) / Advanced | 30 / 10 | automatic | Bonus Action / 3 Rounds | manual; effects manual |
| Self-Defence Shock<br>`operator-skill-marksman-advanced-self-defence-shock` | [C3:3742](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3742) / Advanced | 20 / 20 | defensive | Action / Instant | supported-with-manual-effects; effects manual |
| Spinning Edge<br>`operator-skill-marksman-advanced-spinning-edge` | [C3:3743](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3743) / Advanced | 35 / 15 | automatic | Action / 3 Rounds | supported-with-manual-effects; effects manual |
| Umbral Ambush<br>`operator-skill-marksman-advanced-umbral-ambush` | [C3:3744](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3744) / Advanced | 40 / 10 | offensive | Bonus Action / 2 Rounds | manual; effects manual |
| Afterimage<br>`operator-skill-marksman-elite-afterimage` | [C3:3759](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3759) / Elite | 80 / 40 | automatic | Bonus Action / 3 Rounds | manual; effects manual |
| Assault Tactics<br>`operator-skill-marksman-elite-assault-tactics` | [C3:3760](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3760) / Elite | 50 / 20 | automatic | Action / Instant | supported-with-manual-effects; effects manual |
| Continental Style<br>`operator-skill-marksman-elite-continental-style` | [C3:3761](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3761) / Elite | 40 / 30 | automatic | Bonus Action / 5 Rounds | manual; effects manual |
| Eternal Hunt<br>`operator-skill-marksman-elite-eternal-hunt` | [C3:3762](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3762) / Elite | 65 / 30 | automatic | Bonus Action / 2 Rounds | supported-with-manual-effects; effects manual |
| Fortcracker<br>`operator-skill-marksman-elite-fortcracker` | [C3:3763](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3763) / Elite | 65 / 30 | automatic | Bonus Action / 3 Rounds | supported-with-manual-effects; effects manual |
| Harpoon Shot<br>`operator-skill-marksman-elite-harpoon-shot` | [C3:3764](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3764) / Elite | 65 / 30 | automatic | Action / Instant | supported-with-manual-effects; effects manual |
| Inexorable<br>`operator-skill-marksman-elite-inexorable` | [C3:3765](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3765) / Elite | 80 / 35 | offensive | Bonus Action / 3 Rounds | manual; effects manual |
| No Escape<br>`operator-skill-marksman-elite-no-escape` | [C3:3766](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3766) / Elite | 65 / 30 | automatic | Bonus Action / 2 Rounds | supported-with-manual-effects; effects manual |
| Silencer<br>`operator-skill-marksman-elite-silencer` | [C3:3767](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3767) / Elite | 65 / 35 | offensive | Bonus Action / 3 Rounds | manual; effects manual |
| The Hunt is On<br>`operator-skill-marksman-elite-the-hunt-is-on` | [C3:3768](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3768) / Elite | 35 / 35 | automatic | Reaction / Instant | manual; effects manual |
| Like a Scythe through Wheat<br>`operator-skill-marksman-elite-like-a-scythe-through-wheat` | [C3:3769](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3769) / Elite | 65 / 30 | offensive | Bonus Action / 3 Rounds | manual; effects manual |

### Talents and Module effects (42)

All rows are descriptive `feat` Items. Each preserves the source row's Effect
and Module Effect in `classOption` and its description. No Marksman Talent
effect/module consumer or native choice/grant is implemented here (B-115).
Basic selection occurs at 3 and replacement/module at 8; Advanced at 9 and 13.
Cross-class grants (Martial Acumen, Lieutenant, Part-Time Inventor) are manual
and retain their original references and exceptions.

| Talent and generated ID | Source | Tier / effect and Module handling |
| --- | --- | --- |
| Alacrity<br>`class-option-marksman-talent-basic-alacrity` | [C3:3782](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3782) | Basic; exact printed Effect/Module, manual |
| Alert<br>`class-option-marksman-talent-basic-alert` | [C3:3783](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3783) | Basic; exact printed Effect/Module, manual |
| All Out Attack<br>`class-option-marksman-talent-basic-all-out-attack` | [C3:3784](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3784) | Basic; exact printed Effect/Module, manual |
| Back-to-Back<br>`class-option-marksman-talent-basic-back-to-back` | [C3:3785](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3785) | Basic; exact printed Effect/Module, manual |
| Bird Hunter<br>`class-option-marksman-talent-basic-bird-hunter` | [C3:3786](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3786) | Basic; exact printed Effect/Module, manual |
| Clean Sweep<br>`class-option-marksman-talent-basic-clean-sweep` | [C3:3787](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3787) | Basic; exact printed Effect/Module, manual |
| Critical Edge<br>`class-option-marksman-talent-basic-critical-edge` | [C3:3788](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3788) | Basic; exact printed Effect/Module, manual |
| Fragile Focus<br>`class-option-marksman-talent-basic-fragile-focus` | [C3:3789](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3789) | Basic; exact printed Effect/Module, manual |
| Hunter (X)<br>`class-option-marksman-talent-basic-hunter-x` | [C3:3790](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3790) | Basic; exact printed Effect/Module, manual |
| Illuminant Eyes<br>`class-option-marksman-talent-basic-illuminant-eyes` | [C3:3791](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3791) | Basic; exact printed Effect/Module, manual |
| Lasting Sting<br>`class-option-marksman-talent-basic-lasting-sting` | [C3:3792](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3792) | Basic; exact printed Effect/Module, manual |
| Lucky<br>`class-option-marksman-talent-basic-lucky` | [C3:3793](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3793) | Basic; exact printed Effect/Module, manual |
| Martial Acumen<br>`class-option-marksman-talent-basic-martial-acumen` | [C3:3805](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3805) | Basic; exact printed Effect/Module, manual |
| Maximum Muzzle Velocity<br>`class-option-marksman-talent-basic-maximum-muzzle-velocity` | [C3:3806](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3806) | Basic; exact printed Effect/Module, manual |
| Precise Strike<br>`class-option-marksman-talent-basic-precise-strike` | [C3:3807](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3807) | Basic; exact printed Effect/Module, manual |
| Prey Seeker<br>`class-option-marksman-talent-basic-prey-seeker` | [C3:3808](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3808) | Basic; exact printed Effect/Module, manual |
| Priority Target<br>`class-option-marksman-talent-basic-priority-target` | [C3:3809](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3809) | Basic; exact printed Effect/Module, manual |
| Tough<br>`class-option-marksman-talent-basic-tough` | [C3:3810](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3810) | Basic; exact printed Effect/Module, manual |
| Unarmoured Agility<br>`class-option-marksman-talent-basic-unarmoured-agility` | [C3:3811](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3811) | Basic; exact printed Effect/Module, manual |
| Alpha Strike<br>`class-option-marksman-talent-advanced-alpha-strike` | [C3:3830](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3830) | Advanced; exact printed Effect/Module, manual |
| Ambush<br>`class-option-marksman-talent-advanced-ambush` | [C3:3831](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3831) | Advanced; exact printed Effect/Module, manual |
| Crossfire<br>`class-option-marksman-talent-advanced-crossfire` | [C3:3832](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3832) | Advanced; exact printed Effect/Module, manual |
| Cycle of Life and Death<br>`class-option-marksman-talent-advanced-cycle-of-life-and-death` | [C3:3833](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3833) | Advanced; exact printed Effect/Module, manual |
| Danger Sense<br>`class-option-marksman-talent-advanced-danger-sense` | [C3:3834](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3834) | Advanced; exact printed Effect/Module, manual |
| Dig In<br>`class-option-marksman-talent-advanced-dig-in` | [C3:3835](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3835) | Advanced; exact printed Effect/Module, manual |
| Eagle Eyes<br>`class-option-marksman-talent-advanced-eagle-eyes` | [C3:3836](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3836) | Advanced; exact printed Effect/Module, manual |
| Graceful Shadow<br>`class-option-marksman-talent-advanced-graceful-shadow` | [C3:3837](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3837) | Advanced; exact printed Effect/Module, manual |
| Hammer and Anvil<br>`class-option-marksman-talent-advanced-hammer-and-anvil` | [C3:3838](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3838) | Advanced; exact printed Effect/Module, manual |
| Help Yourself<br>`class-option-marksman-talent-advanced-help-yourself` | [C3:3839](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3839) | Advanced; exact printed Effect/Module, manual |
| Jumpstart<br>`class-option-marksman-talent-advanced-jumpstart` | [C3:3840](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3840) | Advanced; exact printed Effect/Module, manual |
| Kingslayer<br>`class-option-marksman-talent-advanced-kingslayer` | [C3:3841](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3841) | Advanced; exact printed Effect/Module, manual |
| Lieutenant<br>`class-option-marksman-talent-advanced-lieutenant` | [C3:3842](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3842) | Advanced; exact printed Effect/Module, manual |
| Lone Journey<br>`class-option-marksman-talent-advanced-lone-journey` | [C3:3843](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3843) | Advanced; exact printed Effect/Module, manual |
| One Moment<br>`class-option-marksman-talent-advanced-one-moment` | [C3:3844](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3844) | Advanced; exact printed Effect/Module, manual |
| One With Shadow<br>`class-option-marksman-talent-advanced-one-with-shadow` | [C3:3856](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3856) | Advanced; exact printed Effect/Module, manual |
| Opportunist<br>`class-option-marksman-talent-advanced-opportunist` | [C3:3857](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3857) | Advanced; exact printed Effect/Module, manual |
| Overwhelming Strike<br>`class-option-marksman-talent-advanced-overwhelming-strike` | [C3:3858](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3858) | Advanced; exact printed Effect/Module, manual |
| Part-Time Inventor<br>`class-option-marksman-talent-advanced-part-time-inventor` | [C3:3859](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3859) | Advanced; exact printed Effect/Module, manual |
| Reliable Talent<br>`class-option-marksman-talent-advanced-reliable-talent` | [C3:3860](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3860) | Advanced; exact printed Effect/Module, manual |
| Sniper's Intuition<br>`class-option-marksman-talent-advanced-sniper-s-intuition` | [C3:3861](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3861) | Advanced; exact printed Effect/Module, manual |
| Tactical Mind<br>`class-option-marksman-talent-advanced-tactical-mind` | [C3:3862](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3862) | Advanced; exact printed Effect/Module, manual |
| Weighted Shots<br>`class-option-marksman-talent-advanced-weighted-shots` | [C3:3863](../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt#L3863) | Advanced; exact printed Effect/Module, manual |
