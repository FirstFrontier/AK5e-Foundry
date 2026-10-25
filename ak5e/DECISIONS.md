# AK5e Foundry implementation decisions

## Marksman workflow checkpoint (2026-10-18)

The current implementation adds guided, owner-operated rolls/saves/application
and managed effects to the scoped Marksman branches. This supersedes older
manual-only descriptions only for implemented paths. See
[MARKSMAN_WORKFLOWS.md](MARKSMAN_WORKFLOWS.md) for the coverage and unfinished
acceptance; the user requested a checkpoint before API limits.

Enhanced Target Lock's level-11/12 conflict and branch-level conflict remain
explicit choices. Secondary Detonation offers fresh-roll/original-total readings;
the latter requires recorded or reviewed original damage. Godpiercer requires an
explicit mitigation policy. These are per-use choices unless a sourced GM ruling
is recorded; this checkpoint does not settle the underlying source ambiguity.
CON retroactive HP changes remain manual under the existing decision. Geometry,
collision and unsupported Skill/Talent effects remain manual. No complete class
automation, full rendered acceptance, or release-pack acceptance is claimed.

## Marksman audit repairs (2026-10-12)

This supersedes contradictory automation claims in the historical Marksman
blocks only for the repaired paths. Evidence and remaining manual boundaries:
[MARKSMAN_FIXES.md](MARKSMAN_FIXES.md). No owner/GM ruling is created by this patch.

- **Enhanced Target Lock (source conflict / per-use representation):** C3 table
  says 11 and heading says 12. At 11 the confirm flow offers both string-valued
  readings; a recorded GM ruling takes precedence. Store the chosen attack
  bonus on that one expiring lock, and retain it on Shifting Focus. Initiative
  recovery at 11 is manual without a recorded ruling, with an owner notice;
  12+ recovery uses the canonical pool/event receipt. Setup retains the original
  source feature text and existing grant level; adding a descriptive Item at 11
  does not silently decide when its mechanical benefits unlock.
- **Martial DC (explicit source / representation):** C1:211 permits STR or DEX,
  the player's choice. The panel's confirmed choice is reversible. An unchosen
  ability yields no invented DC; Anti-Air accepts a per-use choice or publicly
  warns that the table must calculate it manually.
- **Close and Personal (representation / manual discretion):** the hook follows
  C3:3622's literal no-Disadvantage wording when an adjacent hostile is present,
  including when Advantage is also set. Native roll dialogs remain editable so
  the player can retain unrelated Disadvantage for the table's reading. This
  does not add an invented disadvantage-cause classification.
- **Expiry and Turn facts (representation / manual):** new Target Lock and Last
  Option durations use Foundry world-time seconds. Legacy durationless locks
  grant no permanent bonus; old millisecond expiry timestamps, when present,
  retain their wall-clock expiry. Air Tracking uses explicit off-ground facts
  or flying/hovering status and prior-Turn movement facts, never mere fly speed
  or absolute elevation. Turn allowances outside combat are tracked manually.
- **Area/munition resolution (manual):** guided notes and printed public-card
  instructions cover Area Denial's actual selected height, immunity nominations,
  delayed/lingering saves, cumulative reductions, Secondary no-chaining, Splash,
  ten-minute detonation, five-foot disarm and collision. The owner clicks native
  weapon/save/damage controls; the helpers do not claim automatic target effects.
  A missing point/damage stays unspecified rather than becoming `(0,0)` or 0.
- **Artilleryman typed benefits (representation / manual):** only definite
  Thunder components gain Explosive Expertise dice. Alternative/unknown types
  remain untouched. Siege Attacker doubling is manual per Vehicle/Structure
  recipient; D&D5e 5.3.3 ignores the old `options.multiply` field. Trap DC retains
  its original reviewed base; Sharpened Shrapnel's +2 applies only to Splash.
  X doubling, Loading removal and Thunder/self-damage defenses are explicitly
  manual, including delayed and secondary damage provenance.
- **Progression migration (representation):** existing authored HP/abilities are
  retained; select only new gains. Saved version-1 ASIs are known to have been
  added by the old apply path and migrate as already included. Style/Talent/module
  and equipment grants have visible source-derived manual procedures where
  native automatic grants are incomplete. No class/subclass is newly certified.
- **Undo/retry (implementation):** persist prepared changes first, then commit
  benefits/costs and their applied marker atomically. Deferred Reactions use a
  stable ledger receipt. Undo of uncommitted changes refunds nothing; retry of
  committed changes preserves later spends. Returned flag changes restore only
  when still matching the receipt, with conflict notes before undo. Whole-state
  cross-client receipt races remain separate tracked work (B-020/B-091).

## Caster / Core / Mystic / Mech-Accord (0.4.0)

The implementation map is [CASTER_IMPLEMENTATION.md](CASTER_IMPLEMENTATION.md).
Source rules, native fields, helper transactions and manual confirmations are
distinct there. No rules interpretation below is silently selected for play.
The GM records each applicable ruling, reason and author on the Caster before
the affected interaction can run. Test-fixture rulings are not project defaults.
These are GM-gated workflow records on an owned Actor. Foundry ownership still
permits programmatic Actor-data edits; these receipts do not provide server-side
authorization or tamper-proof records.

- Combined Growing Power, Savant, configured reductions/minimums and alternate
  origin surcharges require a cost-order ruling. Selected cast level controls
  Growing Power; an Art's printed level does not establish eligibility after
  upcasting. Free/ritual alternate origins also require review.
- Unending compares its recorded d6 with the recorded actual expenditure only
  after the GM records that interpretation. Refunds are separate transactions;
  they never create another cast/expenditure event. Repeat-cast costs for
  Doublecast and Death from Above require a normal-cost or free-cost ruling.
  Cantrip Duplication requires a ruling about its 1 AP cost plus Translocation.
- Savant Cantrip eligibility and whether qualifying low dice reroll once or
  repeatedly require recorded rulings. Individual manual die replacements keep
  their own persisted results. Signature selection does not edit an Art's
  authored activities/effects. DR/resistance bypass retains vulnerability and
  immunity and uses the reviewed damage helper. Native Apply Damage does not
  enforce this exception. Replacing the Signature removes only managed benefits.
- Potent Cantrip handles reviewed single-outcome damage without additional
  effects. Multi-attack, split damage and unusual structures require a recorded
  procedure and explicit reviewed outcome/defenses; no hit is inferred from AC
  or visibility. Existing first-Cantrip damage bonus remains separate.
- Technology Modifier in Arts Master HP is undefined in the companion section.
  The GM must choose and explain Technology total or Intelligence modifier
  before creation/synchronization. These are offered interpretations, not a
  claim that either is explicitly printed. The source statblock remains visible.
- The Arts Master prints Wisdom 4 with modifier -4, while native D&D5e derives
  -3 from that score. Keep the printed score and source text; a passive
  Perception bonus of -1 preserves the explicit passive Perception 6. Other
  Wisdom checks/saves need GM review of this source inconsistency.
- Setup offers an explicit "already included" choice per HP/ASI level for
  migration of existing characters. It records that level without changing
  authored totals. Fixed/rolled choices add only the explicitly selected
  missing gains and preserve current HP. The preview exposes before/after
  totals; source contributions already represented must not be added twice.
  Retroactive HP adjustments for a changed Constitution modifier remain a
  reviewed manual procedure rather than an inferred AK5e rule.
- The source gives no procedure for replacing selected Standard Pools. Setup
  blocks removal of recorded pool choices until the GM records an explicit
  `poolReplacement: retainKnownArts` exception. That exception deliberately
  retains previously known Arts and changes only selected-pool benefits; it is
  not a source entitlement. Additional pools at eligible levels remain ordinary
  grants. Items and independent learned copies are never deleted.
- Each drone has its own Reaction budget. Reset at the creator's next actual
  Turn requires a recorded timing interpretation. Wolfpack uses a completed
  current-turn cast and visible-target confirmation. Native drone movement and
  action economy remain manual. Players own and use their drones directly;
  creation/placement/linking is GM-only.
- Multiple Army of One expenditures in one Turn require a latest-spend or sum
  ruling. An unresolved second expenditure suspends the rider for review.
  Jury Rigging's Construct healing exception is explicit; excess temporary HP
  replacement versus addition requires a ruling. Other Construct healing is
  not broadly enabled. Destruction retains the Actor. Rebuilding requires
  completed Long Rest activity; 500 LMD replaces missing components only.
- Rabbit expires its borrowed grant at Long Rest without deleting independent
  grants or authored Items. Mystic Charge starts at zero and Long Rest clears
  it; recovery must not refill it. Initiative gain observes actual successful
  rolls, including rerolls, rather than once-per-combat edits.
- Prepared operations and failed consumed casts retain receipts and block
  further spending. Retry identical operation IDs/choices or have the GM review
  resources, targets, charge/uses, rolls, and map state and record reconciliation.
  Reconciliation itself does not invent refunds or undo already applied effects.
  Existing guarded Arts undo restores AP/free-use/ninth-limit counters only;
  the GM must separately reconcile branch side effects.
- Single operating client per caster/drone group remains required. Persistent
  receipts and per-Actor queues do not establish cross-client transaction locking.
  Setup preserves authored content/current resources and leaves reduced or
  removed progression for explicit review. This batch is not a public release:
  redistribution permission, locked packs, UUID import and release installation
  remain the separate release gates.

### Primal and Splash branches (0.5.2)

Source: C3:725–812 (Primal) and C3:818–873 (Splash). E = explicit source rule,
F = faithful Foundry representation, M = manual table procedure, P = proposed
interpretation that the helper applies until the GM records otherwise.

These helpers follow WORKFLOW.md §3.2 ("trust the table"; see "Player agency over
GM gating" below). In the entries that follow, "warning" means the dialog lists
the problem and offers **Use anyway**; the public card then lists it.

- **Residual Suffering.** E: Spell Attack hit or failed save. At 15, Suffering
  Unmatched also allows a successful save. The condition is chosen from the damage
  types the Art deals and lasts until the end of the Caster's next Turn. Uses are
  2×PB and recover on a Long Rest. F: the helper offers only damage types the cast
  activity deals; another type is a warning. It applies the table condition as a
  tracked effect with `nextTurnEnd` expiry. A target the player does not own is
  changed by the active GM's client (relay, below). P: one application per Creature
  per Art cast (a repeat is a warning); a retry reuses the same effect. With no use
  left, the warning can be overridden and the count stays at 0, with the shortfall
  shown on the card. M: Poison has no row, so there is nothing to apply (see
  "Residual Suffering Poison" above). Outside combat, the effect is removed manually.
- **Debilitate and Destroy.** E: 1d8/2d8/3d8 HP loss at levels 3/7/14, once per
  Creature per Turn, after dealing Damage to a Creature with a negative Status
  Condition. M: the player confirms the damage and that the Creature has a
  negative Status Condition (see "Status Condition" above); unconfirmed, these are
  warnings. The HP-loss policy uses the GM's `debilitateLoss` ruling when recorded;
  otherwise the player picks one reading for that use (shown on the card, never
  stored):
  - `bypassDRResist`: ignores DR and Resistance; Temporary HP absorbs it.
  - `bypassAll`: also ignores Temporary HP.

  F: the use card offers **Roll Xd8**; no die is rolled until the Caster's owner
  (or a GM) clicks it. "Turn" is the current combat Turn, and the HP write is
  idempotent per use.
- **Elemental Burst / Cardinal Punishment.** E: Bonus Action on own Turn, once per
  Short Rest, 20-ft Sphere, Dexterity save against Spell Save DC (+5 at 15).
  F: the chat card has a native save link. The Condition is applied to targets the
  player confirms failed; an unconfirmed save, a later Turn, a second use before a
  Short Rest or use outside the Caster's Turn are warnings. M: the template is
  placed with Foundry's tools; range and sight are confirmed at the table.
- **Enduring Affliction.** E: the overlays in C3:784–794. F: only Charmed's Speed 0
  is a native change. M: the other overlays appear as effect instructions (Nervous
  Impairment: see the entry above).
- **Controlled Detonation.** E: +2 Spell Save DC for Arts that target a Sphere,
  Cone, Cube, Cylinder or Line. F: applied to the save DC of the activity being
  cast, on the working clone only. Other D&D5e template shapes are not inferred as
  areas.
- **Splashing Cantrips.** E: halve a single-target damaging Cantrip. Creatures
  within 10 ft make a Dexterity save at DC +2 (Controlled Detonation) or take the
  halved Damage. The Caster passes automatically. P: halving rounds down. The
  original target takes the halved Damage without a save, and a successful save
  takes none. Maximum Burst does not apply, because the source treats the Cantrip as
  an area Art only for Controlled Detonation.
- **Safe Zone.** E: up to 1 + cast level Creatures automatically succeed and take
  no Damage where a success would halve it. F: the count is enforced at
  consumption; the damage helper gives 0 to a chosen Creature. P: an Art with no
  saving throw is unaffected.
- **Safe Zone with Maximum Burst.** The row "Safe Zone / Maximum Burst" above stays
  unresolved as a rules question. The helper applies the GM's
  `safeZoneVsMaximumBurst` ruling when recorded; otherwise the player picks
  `safeZone` or `maximumBurst` for that use (shown on the card, never stored).
- **Maximum Burst.** E: area-Art Damage is never less than half the rolled
  Damage, despite Resistance, damage-reducing abilities or DR, except for
  immunity. F: the damage helper floors the final Damage at half the roll,
  rounding down (see the P1 pipeline entry). P: the floor also applies to Arts
  whose successful save prevents all Damage.
- **Overwhelming Detonation.** E: up to 2×PB extra AP. Growth per AP: Cone +10 ft,
  Cube +10 ft, Line +20 ft, Sphere +5 ft. F: Cylinder is not listed and is refused.
  When the activity does not override its Item's target, the Item's template size
  is grown on the working clone, because that is what D&D5e reads. P: the extra AP
  is added after Economics of Violence's minimum.
- **Economics of Violence.** E: −1 AP for area Arts of 5th level or lower, minimum 1,
  applied after Growing Power. P: the minimum never raises a cost that is already 0.
  This does not resolve the cross-class cost order (see "AP discounts and two
  casts").
- **Implements of Destruction.** E: two Standard-pool Arts that target an area,
  always Prepared. M: a GM confirms that the exact chosen pair targets an area.
  Changing either Art requires a new review.
- **Further interpretations found in review.**
  - P: Economics of Violence tests the level the Art is cast at, so an Art upcast
    to 6th level or higher loses it.
  - P: Overwhelming Detonation AP is charged on every cast mode, including free,
    ritual and Cantrip casts.
  - F: area growth is written to the Item's target on the working clone when the
    activity inherits it, so every inheriting activity on that clone grows.
  - M: Residual Suffering accepts any recent completed cast. It does not check the
    Turn or whether the Creature was a recorded target, because area Arts affect
    Creatures that were never targeted. The user confirms the qualifying hit or
    save.
  - M: an Elemental Burst used outside combat has no Turn key, so its Conditions
    can be applied until the next burst. The table confirms the timing.
  - M: All-Consuming gives Disadvantage only to saves rolled from that cast's chat
    card. Saves rolled elsewhere need manual Disadvantage.
- **Splash Damage once per cast and Creature (F).** A second Splash Damage
  application to the same Creature from the same cast, under a new receipt, is a
  warning (for example a separate ongoing Damage instance, or a corrected
  Splashing Cantrips result). A retry of the same receipt does not apply twice.
- **Splash cast options (F, WORKFLOW.md §3.2).** Level gates, more than 2×PB
  Overwhelming AP, more Safe Zone Creatures than 1 + cast level, and a second
  All-Consuming before a Short Rest are warnings in the cast form; overrides are
  posted publicly after the cast. A non-Splash Caster or an Art with no area is a
  hard stop because there is nothing to modify. Overwhelming AP above 12 is
  impossible in the AP quote.
- **GM relay for unowned targets (F, WORKFLOW.md §3.2).** Each Primal/Splash use
  is a receipt in `flags.ak5e.caster.undo`. A Condition or Hit Point change to a
  Creature the user cannot write is sent to the active GM's client through an
  operation-kernel instance (`casterRelay`). That client applies it with no prompt,
  and only if the Caster's own receipt records that exact change. Without a
  connected GM, the use is saved as "Not applied yet", reported on the card, and
  retried from the panel with the same receipt.
- **Undo and encounter windows (F, WORKFLOW.md §3.2).** Every use can be undone by
  the acting user, the Caster's owners or a GM, from its card or the panel, while
  its encounter window is open. Undo is delta-based: it restores the Residual
  Suffering uses spent, clears Elemental Burst's use and the use's ledger entries,
  removes the use's Condition, and adds back the Hit Points and Temporary HP the
  use removed. Changes since the use are shown before confirming. The hidden world
  setting `encounterEpoch` advances (elected GM client) when a combat starts and
  when a started combat is deleted; a receipt from another epoch shows as locked.
  A GM may still undo a locked use. The Art cast itself (AP, All-Consuming use)
  keeps the existing Arts undo, which is part of the Caster-wide audit.
- **Retry safety (implementation).** Residual Suffering and Elemental Burst
  Conditions check the feature Item and the Condition registration before
  saving a receipt. The Condition registration needs the Chapter 1 rules setting.
  A missing prerequisite therefore cannot lock the Caster behind a prepared
  receipt. Elemental Burst accepts a retry of its own receipt after its Short Rest
  use was recorded.
- **Working-clone preparation (implementation).** D&D5e 5.3.3 re-reads the cast
  activity from its working Item clone after `updateSource`. Until the clone's data
  and final attributes are prepared again, that activity has no template type or DC
  value. All Caster clone writes now follow D&D5e's own usage-scaling pattern:
  `_embeddedPreparation` is set during `updateSource`, then
  `prepareFinalAttributes()` runs. This was found in the
  rendered Splash cast; it also affects Death from Above's activation and Mystic
  Power Surge DCs.

### Chain branch (0.5.3)

Source: C3:456–549. Tags as in the Primal and Splash entry (E/F/M/P). All Chain
helpers follow WORKFLOW.md §3.2 and reuse the Caster use engine: receipts in
`flags.ak5e.caster.undo`, the `casterRelay` GM relay and encounter-window undo.

- **Chain Art use (E/P).** E: PB uses, Long Rest; one back per Short Rest from 15.
  P: one use per cast, however many Creatures are chained. "You can use this
  Feature" counts uses of the Feature, and one use chains to "up to two" Creatures.
  P: Great Chain of Being's "one additional Creature (for a total of 3)" means
  three chained Creatures in addition to the original target, four targets total.
  This preserves the existing implementation; the source's parenthetical is
  recorded as an interpretation, not rewritten source text.
- **Single-Creature Arts (M).** E: the note at L465 excludes Arts that could deal
  Damage, restore HP, grant Temporary HP or apply an effect to several Creatures
  from one cast. M: the player confirms this for the Art; unconfirmed is a
  warning. Activity data is not used to infer it.
- **Chained targets (F/P).** F: the chained tokens are recorded on the cast and
  the working clone's `target.affects.count` becomes 1 + chained, so the Art's
  native card lists every target. P: an attack Art makes one native attack roll,
  compared with each target's AC. P: reach is measured from the original token's
  centre to any space the chained token occupies. A token on another Scene, or a
  Scene without a grid, is an "unmeasured" warning.
- **Ouroboros (E/F).** E: instead of chaining, the target has Disadvantage on
  saves against that Art this Turn. F: only saves rolled from the cast's card, by
  the original target, on the cast's Turn. Outside combat the GM applies it.
- **Spark cost (P, reading `sparkCost`).** L475 says effects "consume Sparks" and
  each effect lists "(1 Spark)", but not whether that is per cast or per Creature
  when the Art affects several. A recorded ruling applies; otherwise the player
  picks `perCast` or `perCreature` for that use. One Creature is never ambiguous.
- **One Spark effect per cast (P).** "Apply an additional effect" is read as one
  effect per cast; a second effect for the same cast is a warning.
- **Upgraded effects (E/P, reading `sparkUpgradeBase`).** E: L496 says the
  upgraded effect is applied "instead". Bolster/Shred raise the value; Enervate and
  Innervate say "instead of" the ±1. Accelerate and Decelerate do not say whether
  the 1d4 replaces or adds to the Speed change. A ruling applies; otherwise the
  player picks in the use form, shown on the card.
- **"May roll" (P).** Upgraded Accelerate and Innervate say the Creature "may"
  roll 1d4. The native +1d4 bonus is always applied, because it only helps.
- **Native changes (F).** Walk speed ±10 only; other movement types are manual.
  Attack and damage bonuses for melee/ranged weapon and spell attacks. Dexterity
  save bonus ±1d4. The effects expire at the start of the Caster's next Turn
  (`turnStart`), or manually outside combat.
- **Bolster and Shred Defences (F/P).** F: a signed `drAdjustment` effect flag
  (+2/+4, −2/−4). `resolveDamage({ adjustment })` and the World-rules DR preview
  add it to the resolved DR, never below 0. P: before Corroded halves DR. P:
  Bolster adds to existing DR and opposite effects net out; DR stacking in
  general remains unresolved (see the P1 pipeline entry), so damage helpers that
  take entered DR leave the total to the table.
- **Save effects (F).** Decelerate, Enervate and Shred post a native
  `[[/save ability=con dc=…]]` link at the Caster's Spell Save DC. The effect is
  applied with a separate use to each Creature the player confirms failed.

### Mech-Accord completion (0.5.6)

Source: C3:554–668 and Caster Unending. This supersedes the 0.5.4
attack-continuation and creation/linking undo boundaries below.

- **Refund accounting (F).** A Jury Rigging receipt retains its actual AP spend
  and established Unending refund. Undo reverses the net expenditure, once;
  refunds never generate another expenditure event.
- **Native attack continuation (F).** After a public warning override, resume
  the held `rollAttack` configuration. Do not start another activity use or
  authorize unrelated attacks for a time interval. Native D&D5e 5.3.3 hook
  suffixes are removed only when reconstructing this specific held roll.
- **Legacy operations (F).** Recover a prepared operation only from established
  receipts. Missing evidence produces explicit reconciliation guidance; the
  helper does not guess whether AP, dice or target changes already occurred.
- **Creation/linking undo (F).** Record prior links and module-managed fields
  within the encounter window. Remove operation-created Actors/tokens only
  while unchanged and exclusively attributable to that operation. Later edits,
  additional links or tokens make removal unsafe: preview the preservation and
  restore only the safe links/managed fields. Immutable GM-authored whispered
  authority records establish provenance; owner-editable snapshots never
  authorize deletion. Retrying creation never replaces its original snapshot.
- **Partial failure (F).** Persist deletion intent and progress before removing
  documents, recheck the current documents immediately before deletion, and
  reuse the receipt on retry. Keep all receipts in the current encounter window.
  Normal unowned writes use the registered automatic relay; no play approval
  is introduced. Historical mechanics still use the selected per-use readings.

### Mech-Accord and WORKFLOW.md §3.2 (0.5.4)

Source: C3:554–668. This supersedes the Mech-Accord rows of the 0.4.0 entry that
made a GM ruling or GM action a precondition. Recorded rulings still apply.

- **Readings instead of required rulings (F).** `technologyModifier` (drone
  creation and refresh), `juryTempHP` (only when the rolled maximum could exceed
  the missing HP), `duplicationCost` (1 or 2 AP), `deathAboveCost` (normal or free)
  and `residualStacking` use a recorded GM ruling, otherwise the player's reading
  for that use, shown on the card and never stored.
- **Drone Reaction timing (P).** `droneReactionTiming` had one value: each drone
  has its own Reaction, reset at the start of its creator's Turn. That is now the
  default and no ruling is required.
- **Army of One with several levelled Arts in a Turn (F/P).** A recorded
  `residualStacking` ruling applies and no reading is offered. Otherwise the latest
  Art's AP applies (P) and the owners get a whispered card saying so when the second
  levelled Art is cast; the player can pick "latest" or "sum" for that Turn with
  **Residual Energy: choose a reading** (undoable). The rider is never suspended.
  This default is a deliberate exception to "the player picks before the use": the
  rider is added to a drone's damage roll, which cannot pause for a dialog.
- **Warnings, not blocks (F).** Level gates; drone-origin level, Scene and
  destroyed state; 100-ft command and repair range (an unmeasurable range is its
  own warning); visibility; the 2×PB repair cap; command timing and cap; Wolfpack
  same-Turn and one Reaction; the Duplication lock; repeat-cast timing, Art,
  Cantrip, level and Action checks; Duplication's same targets; rebuild without the
  Long Rest activity or a non-destroyed drone; and the drone cap on creation or
  linking. AP and LMD shortfalls clamp at 0 and show the shortfall on the card.
  Only identity stays a hard stop: the drone must be linked to this creator.
- **Originium Spark (F).** A prohibited Spark (Duplication lock, destroyed, beyond
  the cap, unlinked) opens a dialog listing the problems. **Use anyway** posts them
  publicly and repeats the use; the override covers that Spark's attack roll for
  one minute.
- **Jury Rigging dice (F).** Confirming spends the AP (one Actor update with the
  receipt). The card's **Roll Nd8** button rolls once, stores the result and
  applies it; a retry reuses the stored roll. Excess healing becomes Temporary HP
  by the reading. Undo restores the AP and removes the repaired HP and the added
  Temporary HP (restoring the prior value when unchanged since).
- **Undo (F).** Jury Rigging, drone commands (token moves), Wolfpack Doctrine,
  rebuilding and the Residual Energy reading are receipts in `flags.ak5e.caster.undo`
  with the encounter-window lock. Changes to drones the user cannot write go
  through the `casterRelay` GM relay.
- **Creating and linking Arts Masters (F).** The owner requests it; the active GM's
  client creates the World Actor and token (or links it) through an operation-kernel
  request (`casterDroneRelay`). Without a connected GM nothing changes and the owner
  is told. Creation and refresh are not undo receipts (they create or resynchronise
  documents); a GM deletes an unwanted Actor.
- **Relay validation (F, independent review 2026-10-11).** A receipt is stored in a
  flag its owner can write, so the GM's client re-checks every relayed change before
  applying it: each target kind lists the uses that may record it, and drone kinds
  must target a drone created by and linked to this Caster (moves need finite
  coordinates; Jury Rigging heals must equal their recorded roll and dice). Chain
  Sparks must be defined effects; their native changes always come from code. The
  same rule applies to the Defender engine (`play-uses.mjs`): a plan without
  `validateTarget` cannot change other players' Creatures through the relay.
- **Other review fixes (F).** Drone cap warnings are checked on the requesting
  client (so "Use anyway" is offered before the request is relayed) and a public
  card lists drone requests with overrides and the Technology Modifier reading; on
  the GM's client a recorded ruling wins over the request. Undo restores AP that was
  above its maximum exactly, and a deleted target (for example a drone token) no
  longer blocks an undo. An undone Ouroboros stops giving Disadvantage. A Wolfpack
  Reaction taken outside combat resets on a rest. Upgraded Accelerate/Decelerate ask
  their reading through the reading dialog (several readings per use are keyed).
- **Left for the Caster-wide audit (TODO).** `undoLastArt` (GM-only, latest only),
  the interrupted-operation lock in `casterCommand`, the Arts cast AP clamp, Core/
  Mystic damage helpers refusing unowned targets, and GM-only reconcile.

## P0 content foundation (0.3.8)

P0 adds descriptive `feat` Items to the development Chapter 3 installer, with
`ak5e.classes` as their future pack. A Talent's Effect and Module Effect remain
in the same Item; choosing/upgrading it, paying costs and applying effects are
manual. Aggregate references and full class/branch descriptions remain intact.
The source has 289 Talent rows, 15 Brawling Techniques (8 Basic, 7 Advanced),
9 Engagements, 10 Instructions and 27 Rituals (12 Ephemeral, 15 Permanent).
The existing 9 Therapies, 10 Tactics, 28 Inventor modifications and 21 Heavy Duty
upgrades are enriched in place, without duplicate Items.

All 1,106 existing Chapter 3 source IDs are retained. New option IDs include
class, branch where applicable, category, tier and option name. Nine feature
descriptions stop before standalone Skill/Talent catalogues, while legitimate
subordinate rules remain. The baseline fixture records old IDs/descriptions;
77 affected existing descriptions have scoped 0.3.8 revisions and previous
description hashes. V13's equivalent `<br>` / `<br />` serialization is
normalized for canonical comparisons; added text or other edits still prevent
migration. Four-star Homebrewery labels in option HTML render as valid emphasis;
raw source quotations remain exact. The installer changes descriptions and AK5e provenance only
when the description is canonical or matches that baseline. Customized
descriptions produce a reconciliation warning. Names, images, folders, chat
descriptions, activities, effects, other authored fields and Actor-owned copies
are preserved. Other Chapter 3 records receive no version-driven refresh.

Four native development-World RollTables retain exact source result text and
stable result IDs. Double-Blind Trial, Machine Personality and Tip of the Spear
use `1d6`; Hole in the World uses the **sum** of `2d10`, with results 2–20.
Replacement permits repeated draws. Effects, toxins, personalities and summons
are applied manually. `installRollTables()` is an explicit GM action at `ready`;
hooks do not import content. Repeated calls preserve existing tables. Overlapping
calls on one client share an installation; use one GM for installation across
clients. `ak5e.tables` remains a future release pack; P0 creates no LevelDB pack.

### Confirmed source issues and corrections to the audit

Locations below use the authoritative source filenames: C1 =
`01_chapter_1_changing_the_game.txt`, C3 =
`03_chapter_3_character_classes.txt`, C4 =
`04_chapter_4_equipment.txt`, C5 = `05_chapter_5_arts.txt`, C6 =
`06_chapter_6_dwellers_of_terra.txt`. **UNRESOLVED** means P0 retains the printed
rule and does not choose a gameplay interpretation. A verified spelling or
overlay relationship does not settle the remaining mechanical question.

| Issue | Source quotations and conflicting references | Status and manual boundary |
| --- | --- | --- |
| Bulwark | C3:1644 says “Shield with the Bulwark Property”; C4:252–259 instead lists and defines “Bastion”. No Bulwark definition was found. | **UNRESOLVED.** Retain Bulwark wording; do not silently grant Bastion. GM must resolve eligibility. |
| Infuser DC | C3:5689 prints “20 - Your Intelligence Modifier - Your Proficiency Bonus”. | **UNRESOLVED.** Preserve subtraction exactly; do not replace it with a conventional D&D5e DC. |
| Revivify | Medic C3:4712 says “cast Revivify” without AP, once per Long Rest; C3:4718 modifies its restored HP. C5 has no Revivify entry. | **UNRESOLVED.** Retain feature text; no invented Art, cost, range, components or death limit. |
| Marksman branch levels | Class table C3:3586 includes an 18th-level “Branch Feature”; prose C3:3596 lists “1st Level, and again at 4th, 10th, and 15th Level”. Branches also contain level-18 features. | **UNRESOLVED.** Preserve table, prose and individual features; no progression rule chosen. |
| Residual Suffering Poison | C3:734–747 lists damage-type effects but has no Poison row. | **UNRESOLVED.** Do not invent a Poison condition/effect. GM must resolve use with Poison damage. |
| Grit | Hidden Technique C3:1177 (also 4832, 5479, 8199) says “You gain 2 Grit Points” and grants Basic Brawler Techniques, with Short/Long Rest recovery. Brawler Techniques instead spend Aggression. | **UNRESOLVED.** Keep Grit and Aggression separate; no expenditure conversion or substitute pool. |
| Special Inspiration | Lord C3:3190 grants “Special Inspiration that expires after 1 minute”; Supporter C3:6821 grants “special Inspiration” expiring on a Long Rest, noncumulative and consumed only when it causes success. | **UNRESOLVED.** Retain each local procedure; no shared definition or stock D&D5e Inspiration automation inferred. |
| Safe Zone / Maximum Burst | C3:840 permits selected creatures to automatically save and take no damage; C3:873 prevents area damage below half the rolled dice except immunity. | **UNRESOLVED.** GM decides precedence. The Splash damage helper refuses this case until the GM records `safeZoneVsMaximumBurst` on the Caster (see "Primal and Splash branches"). |
| Guard feature names | C3:1793 says “Push the Advantage”, C3:1874 heads “Press the Attack”, and Reaper C3:3342 says “Push the Attack” while its body refers to Press the Attack. | **UNRESOLVED.** Keep original names and references; do not silently rename or add mechanics. |
| Medical / Technology skill wording | Medic C3:4659 says “Medical Skill”; C1:67, 113, 138, 226 uses Medicine. C3:608, 6882 says “Technology Skill”, but C1:173 explicitly defines “Intelligence (Technology)” as shortened to “Intelligence (Tech)”. | Medical equivalence **UNRESOLVED**; GM selects an appropriate check. Technology is a **verified source alias**, not a missing skill rule. |
| Status Condition | C3:755 says “negative Status Condition”; C1 supplies named conditions but no general Status Condition classification. | **UNRESOLVED.** GM decides which conditions qualify; no arbitrary keyword classification. |
| Nervous Impairment | C1:248–250 allows Move or Action and loses 3 HP when hit. Enduring Affliction C3:782 says its effect is “added to that Condition”; C3:794 adds HP loss on movement/Action/Bonus Action triggers. | **UNRESOLVED trigger frequency.** This is a verified conditional **overlay**, not a replacement/conflicting definition. Retain the base and added effect; GM resolves once-total versus once-per-trigger wording. |

### Audit-reported concerns awaiting complete branch acceptance

The references are verified review leads. P0 does not adjudicate their gameplay
interactions; each remains **UNRESOLVED** until its branch is implemented and
tested against the relevant cross-chapter rules.

| Concern | Verified quotations / references | Manual boundary |
| --- | --- | --- |
| AP discounts and two casts | Growing Power C3:175, Core Savant 433–440, Splash Caster 853 (“after Growing Power”), Guardian 1539–1542, Flinger 4179–4182, Medic 4656 / 4698–4701 and Witchcraft 5099–5102 supply separate cost rules. Doublecast 197–200 and Death from Above 647–650 allow two casts without a complete combined-cost procedure. Summoner 7731 is a post-cast AP refund, not a discount. | No universal order/minimum or second-cast cost invented. GM resolves applicable rules and records AP manually. |
| Elite / Leader eligibility | C6:12–16 explicitly describes “Elites” and “Leaders”; parsed creatures already retain category metadata. | The earlier claim that definitions are absent is corrected. Classification of arbitrary/custom creatures remains GM-confirmed; no heuristic based on CR/name. |
| Taunted / Off Balance | Protector C3:1639 says a Taunted creature must attack if able; C3:1651–1653 defines a local Off Balance duration and Advantage against it. C1 has no general entries for these names. | Retain those local effects; do not invent additional global condition rules. |
| Aid Die minimum | C3:6631–6639 bases the maximum on the chosen ability modifier and does not state a minimum when that modifier is zero/negative. | No automatic minimum of one; GM resolves eligibility/cap. |
| Automaton caps / Protocol | Artificer C3:6895 permits one Automaton, 6938 two; upgrades at 6925 / 6945 change separately. Protocol: Medical 4767 and Juggernaut/Soaring 6755 / 6768 explicitly exclude their constructs from the maximum. C4:425 separately excludes its turret. | Preserve explicit exemptions. Simultaneous companions, commands and interaction with upgrades remain manual; no global cap inference. |
| Greater Slayer Constitution | C3:7806 prints `16 (+0)` in the CON column. | Preserve both printed score and modifier in the source statblock. No silent arithmetic correction or claim that a native derived modifier reproduces it. |
| Bard missing Arts / variants | Performance Arts C3:7168–7211 includes “Chromatic Orb (Thunder only)” (7186), “Shatter (2nd Level)” (7208) and “Shatter (5th Level)” (7210). C5:283 lists Shatter at 2nd level but no higher-level definition. Eleven names are absent from C5 (corrected 2026-10-24: Bless was missing from the earlier list of ten): Bless, Pyrotechnics, Cause Fear, Colour Spray, Ray of Enfeeblement, Shield of Faith, Chromatic Orb, Crusader's Mantle, Haste, Tasha's Mind Whip, Aura of Life. | Preserve 34 performance rows and printed Muse Costs. No stock spells substituted for absent AK5e Arts, and no invented Shatter upcast or Chromatic Orb restriction implementation. |

## Origin placement, resources and temporary creature tags

Move the visible Origins shortcut into a labelled Origin section beside native
race/background in the character Details sidebar, with attached Species,
Nationality and Background names. Keep the three-dot menu entry. Both summaries
and trackers render on full/partial ActorSheetV2 renders without document writes.
Selectors follow the installed D&D5e 5.3.3 Details layout; other sheet layouts
need an explicit adapter.

Review all Chapter 2 and Chapter 1 before adding 33 source-defined Origin use
pools and ten choice/list/additional-counter definitions. Prefer native Item
uses/recovery and preserve custom maxima/spent uses. Older features initialize
native uses only when their tracker is edited. Officer's +3 remains a manual
merge if a Tactician exists; do not display a separate Officer pool in that case.
See [RESOURCE_AUDIT.md](RESOURCE_AUDIT.md) for the complete-module candidate
scan and remaining class/equipment/NPC mappings. Class resources can be manually
configured as one native pool on an AK5e feat; scanning is not rules validation.

The requested temporary creature changes use non-transfer Active Effects and
optional tagged feature copies. Owners may edit their own Actors/embedded
documents; installers and World collection mutations remain GM-only. Applying a
tag requires ownership of source and target, with no socket permission elevation.
One active GM (or elected active owner) handles expiration. Each tag/copy keeps a
namespaced receipt for scoped cleanup and manual recovery. Effects-tab removal
also cleans copies; orphan copies retain a visible Remove tag action.

Generic tags support time, source/target/active-combatant turn boundaries, rests,
combat end, manual confirmation events, OR expiry and shared replacement groups.
Next-turn end excludes the currently active turn; legacy `turnEnd` preserves its
current/next-end meaning. Turn receipts are bound to a Combat; deleting that
Combat ends its turn tags. Concentration profiles bind to one native effect UUID,
including all recipients of that casting, and reconcile missing/disabled effects
on reload. Damage/save/use confirmation stays manual and scoped to one tag.
Native effect edits are explicit; prose never becomes arbitrary changes.

Chapter 4 and Chapter 5 were read in full for the 53 Origin/Art/equipment profiles.
Weapon targets are embedded D&D5e enchantments, using the inspected 5.3.3 keys
`system.damage.base.bonus`, `system.damage.versatile.bonus` and
`activities[attack].attack.bonus`; Actor fields are never used to modify a weapon.
Consumed/deleted source Items retain these applied profiles, while sustained
feature grants can opt into source-deletion cleanup. Replacement creates its
new receipt before removing the old tags; permission/creation failures preserve
the old state, and cleanup failures leave visible receipts blocking another
conflicting replacement. Same-client locks do not serialize other clients.

Flock membership uses target-wide replacement and half-PB capacity rounded up;
recipient counters recover independently. Source-side written member notes are
not silently overwritten by linked tags. Treatise choices exclude Rare Species,
Ancient Versatility and Species with Cling to the World; owners explicitly confirm
the feature grants no Arts and its Treatise was written. This preserves the
rule rather than inferring grants from keyword mentions. The exact borrowed card,
including drawbacks, is removable. Its derived tags expire when that borrowed
card is removed, with reload recovery for missed cleanup. Skill/proficiency and
other prose choices on that card remain manual.

Class/NPC and spatial candidates are supported through the source-guided custom
workflow. Source-specific class progression, per-turn Damage/HP costs, saves,
roll consumption, targeting advantage and aura movement remain manual pending
complete chapter review and clean-World validation. AK5e condition statuses are
markers unless the native system supplies mechanics: do not claim that a Dazed,
Corroded or Frozen marker alone computes all its consequences. Repeated native
bonuses require GM review of stacking and replacement; no generic prose parser
guesses non-stacking rules or lets ending an Art cancel an already incurred cost.

Ægir's Ever the Student, Ever the Master explicitly replaces the previous
Student/Teacher when a new creature is selected, and states no downed/death
termination. Do not infer one. A linked owned creature receives a reversible
UPGRADE skill effect (proficiency or expertise); base proficiencies remain
untouched. Persist the new link before cleaning the previous link, and retain a
recovery receipt if cleanup fails. Record-only choices remain available when
the other creature cannot be edited. Rest-activity timing and willingness are
resolved by the players/GM.

Repository regressions cover permissions, tracker bounds/rests, expiry,
relationship replacement, rollback, orphan recovery and Details placement.
Live-World effects/rests/token persistence and multiple-client tests are pending.

## Character-sheet reopen control (0.2.5)

The original 0.2.4 reopen shortcut queried `.window-header` from the generic
`renderApplicationV2` hook. Foundry v13 provides only the application's inner
HTML to that hook, so the outer window header was unreachable and the control
was never inserted. Register the supported `getHeaderControlsApplicationV2`
hook for an owner-visible entry in the top-right window-controls menu. Also add
a visible shortcut to D&D5e's inner `.sheet-header .right` container. Both call
the same idempotent `openActorOrigins(actor)` API; opening an Actor from the
directory does not automatically show a completed setup on every sheet render.

The manifest version advances to 0.2.5 while `CONTENT_VERSION` remains 0.2.4:
this is a runtime UI fix and should not refresh all installer-managed content.

## Player origin wizard (0.2.4)

The user requested a real setup menu after the stock background advancement
dialog was empty and suppressing it left no player workflow. Use a module-local
DialogV2 wizard for AK5e-tagged origin Items only. Native 2024 background default
advancements remain suppressed; no D&D5e files or global drop behavior are patched.
The initiating owner's createItem hook opens setup, with an Actor-sheet button
for existing Items and saved choices. Apply is explicit. In response to the
player-facing request, owned-Actor/embedded-Item writes are allowed for players;
World imports and migrations remain GM-only. No ownership elevation is used.

Full Chapter 2 and referenced Chapter 1 skill rules, Chapter 3 Tactician section,
and Chapter 4 equipment/tool/instrument tables were consulted. Source text is
reused from generated records. Source inconsistencies: “Makeup Kit” in the
equipment table / “Makeover Kit” in the detailed rule and backgrounds are the
same setup proficiency label; “Lethanian” is displayed as the language-list
“Leithanian”. No new rule is inferred from those spelling differences.

Add namespaced tools and Lore/Wilderness/Technology skills during init via
CONFIG.DND5E, preserving the stock skill list. Tool Intelligence (instruments:
Charisma) is a configurable display/roll default, not an imposed AK5e rule.
Unique weapon/armour proficiencies use custom trait names, and granted weapons
have explicit item proficiency; no blanket simple/martial proficiency is granted.
Languages use native custom language text, as Terra has no D&D5e Common.

Pathfinder conversion, species ASIs/Arts/feature choices, conditional roll
advantages and damage, and later Tactician/Officer pool merging remain explicitly
GM-resolved. Wizard completion records only the listed grants, not full mechanics
automation. A recovery journal precedes writes so failed multi-document work
cannot silently duplicate grants. This is a guarded workflow, not a distributed
database transaction; simultaneous setup by two different owners is unsupported.
Respec/replacement needs a future provenance-aware reversal workflow.

## D&D5e module, not a custom system

AK5e remains a Foundry VTT 13 module that depends on D&D5e. The source is
close enough to D&D5e that replacing the entire Actor, Item, advancement, and
sheet stack would create more maintenance than it resolves.

## Native fields and source-preserving fallbacks

- Explicit scalar data is mapped to native fields: class hit dice; species
  type/movement/senses; equipment weight, armor, damage, range, and recognized
  weapon properties; Art metadata; and creature core statistics and defenses.
- AK5e-only equipment properties and rules whose target, duration, or stacking
  behavior cannot be represented exactly remain in descriptions and flags.
- Summons whose statistics depend on their summoner retain the exact formulas
  in their biography, statblock flag, and raw-source flag. Their template Actor
  must be adjusted for the summoner; the installer does not invent a fixed
  proficiency bonus, ability score, AC, or HP value.
- Species size is retained in `flags.ak5e.speciesSize`; D&D5e 5.x applies size
  through a Size advancement, so the importer does not insert an unverified
  advancement structure before the content has stable compendium UUIDs.
- NPC actions and traits are embedded as feature Items for navigation, but do
  not receive speculative roll activities. Their exact source text remains the
  authority until each activity is tested in D&D5e 5.x.

## Content installation and migration

The console installers are development-World importers. Documents carry a
content version and are refreshed when that version changes. Embedded NPC
feature Items created by this module are replaced during such a refresh;
unmanaged Items on the Actor are preserved.

## Arts casting adapter — development increment

### Native Arts sheet UI (0.3.1)

Registered character/NPC ActorSheetV2 sheets reuse the native spell tab and
activities, with an Arts label, header AP controls and an expanded Arts summary.
Only adopted rows lose preparation/slot controls; ordinary excluded spells
retain native controls. Availability comes from the same read-only quote
catalogue used by the casting dialog. Missing activities are shown as references.
Unlimited free grants precede AP; limited grants follow AP. Only-free grants
omit AP mode. Rituals remain explicit unless the only legal mode.
Mode/level change events normalize legal choices; final confirmation retains
the submitted level so consumption can reject a request invalidated by a later
resource change without silently casting a different Art level.

Saving configuration uses `adopt: false`, preserving AP, ninth use and free
counters without Item writes. Review/adoption remains explicit and default API
behavior is retained. NPC Arts recovery uses the existing rest rules without HP
or other feature recovery. Native Item uses are not merged with AK5e free grants.
No schema migration, class progression, property inference, or NPC spell/activity
generation is included. Managed Spellcasting and explicitly labelled `(Art)`
NPC features are linked as source references; their costs, limits and DCs are
never guessed from names.
An interrupted adoption remains visible as a setup prompt even when the Actor
was already registered. The default ability applies to adoption/new Arts;
ordinary configuration saves preserve each existing Item's explicit ability.

The native layouts and activity pipeline were exercised in an isolated clean
World on Foundry 13.351 / D&D5e 5.3.3 with GM, player and observer Chromium
clients. This proves the recorded sheet/resource flows, not full Art-effect
automation or compatibility with alternate sheet modules. See the smoke-test
record for scope and environmental warnings.

Arts replacement is opt-in per owned World Actor, under `flags.ak5e.casting`.
Setup previews spell adoption, preserves spent AP and the ninth-level limit,
and retains original spell preparation/material fields in Item flags. Existing
slot data is retained, but adopted Arts use a registered slotless casting method.
No installed D&D5e files are modified. The adapter wraps the activity-use boundary
for cleanup and same-client exclusion; resource updates use the system's activity
consumption hook. AP, ninth-level state and limited free-use counters share one
Actor update. Failures after consumption require explicit GM review/undo, not an
automatic refund which might make a resolved cast free. Undo restores only Arts
resources, not other activity costs, effects, concentration or chat messages.

This increment targets the inspected D&D5e 5.3.3 activity API. Automated tests
cover pure rules and mocked activity calls; live coverage is recorded separately
in the smoke-test checklist. Simultaneous operations by different clients are not serialized;
use one operating client per Actor. Class progression and source-specific modes
remain manual. GM exception configuration records its source; ritual eligibility
is a GM-adjudicated mapping, not inferred from class or spell properties, and the
additional ten minutes must be tracked manually. Casting Unit selection checks
equipped state but does not yet validate the equipment property or implement
Conductive/Infected consequences. Cantrip turn bonuses and pool grants are pending.

## Compendium release step

### Individual enhanced weapons (0.3.2)

The combined Arts Staff, Arts Wand, Launcher and Weapon +1/+2/+3 headings are
rules references, not usable variants. Generate 81 `magic-weapon` records as
native weapon Items and retain the four original equipment-reference IDs.
Keep enhanced weapons separate from `weapon` records so Origin starting gear
does not offer magical upgrades. Eligible ordinary upgrades include the Heavy
Defender Shield weapon profile: only Arts Staff, Arts Wand and Special Ranged
Weapons are excluded by the generic enhancement source.

Arts Staff upgrades increase its existing Conductive 1 to 2/3/4; Wand upgrades
gain Conductive 1/2/3. Do not put these values in native weapon magicalBonus,
which would incorrectly improve melee Attack/Damage. Conductive remains manual
and only the highest equipped value applies. Launcher upgrades grant only a
Splash Martial DC increase; a damage-only activity avoids D&D5e's default weapon
attack activity. Add the Ability Modifier, resolve saves, non-proficiency
Advantage and half damage manually. Ordinary upgrades use magicalBonus plus
the native magical property, avoiding duplicated activity/damage bonuses.

All variants retain base weight/damage/range/properties, use the specified
rarities, and require no Attunement. Source magic-item prices are advisory;
do not impose fixed native prices. Source headings/paragraphs/table rows remain
traceable. Generated variant IDs use base weapon names and bonus, not offsets.
Per-record content version 0.3.2 migrates only the four affected references
and identifies new variants; the shared chapter content version is unchanged.
Reference migration retains custom text/fields and document IDs and never
touches Actor copies. Named magic items remain references pending separate work.

The repository does not fabricate LevelDB compendium data outside Foundry.
After a clean-World import and verification, the generated folders must be
exported from Foundry VTT 13 with stable document IDs into the packs declared
for the release. Until that export is performed, this is a development build,
not a finished distributable content-pack release.

## Chapter 6 appendix boundary

The generated Chapter 6 rules content stops before `## Character Sheet`. The
remaining source consists of printable sheet-image markup and historical patch
notes, not current creature rules or Foundry documents. Those appendix sections
are therefore excluded from the generated journals and Actors. Current rules
described by the patch notes are verified against their actual Chapter 1–6 source
sections rather than importing the change history as playable content.

## Operator Skills and SP (0.3.3)

The 0.3.4 progression increment below supersedes this section's original manual
ordinary-selection boundary. Its SP and special-feature boundaries still apply.

Chapter 1 supplies ordinary SP charging and lifecycle rules; Chapter 3 was read
in full before adding all 320 individual Skill feats. Retain existing table
references and IDs. New IDs use class/branch, tier and Skill name. Each repeated
Continued section is parsed independently, including the two Advanced Guard
Skills Continued tables. Specialist Cluster Bombs has an extra empty cell
between its effect and Instant duration: remove only that cell for structured
mapping, retain the original row in rawSource, and record the correction in
operatorSkill.mapping. No source effects or numerical values are rewritten.

Learned embedded feats under flags.ak5e.operatorSkill determine the shared
maximum (highest cost), Start SP (highest start), and charging counts. Copies
with the same source ID count once. Opt-in under flags.ak5e.operatorSkills.enabled
preserves existing manual Actors until enabled and never refills on learning.
Methods are a list, including an empty list, so GM configuration can represent
Liberator, Dreadnought and other source exceptions without guessing progression.
Individual Skill effects, selection eligibility, class progression and
class/talent/equipment SP modifiers remain explicitly manual in this increment.

Use successful forward updateCombat notifications rather than pre-update
combatTurn events. Native attack messages establish Defensive triggers even
on misses; their damage does not charge Defensive again. Damage receipts compare
HP and temporary HP before and after successful native applications. Offensive
Attack identity comes from the original attack message chain, never the last
attack made. Positive hostile damage consumes one receipt per Attack across
parts and targets; immunity does not consume that receipt. Hostility requires
opposing friendly/hostile token dispositions in the same scene. Missing targets,
ambiguous hostility, unidentified Attacks and missing provenance require owner
confirmation. The separate native temporary-HP action loses its caster in
D&D5e 5.3.3, so its confirmation control is the supported path.

Activation commits cost and lifecycle state once, then displays the source card
with explicit Skill-origin flags. Instant Skills end on that commit; linked
deferred effects retain provenance. Resolve as part of Skill marks manually
performed attacks/Arts. Timed expiry follows the activation initiative point,
captured by stable combatant ID, including reactions on another turn. Outside
combat, use world time and the configured round length. Combat ending alone is
not an ending trigger. One-Attack and special early endings remain manual.
Completed Long Rests end Until Long Rest Skills and raise SP only when below
Start SP; repeated native rest notifications use the same operation receipt.

All integrated commits require the designated active GM. Owner actions use
namespaced whisper request cards, with ownership checked against Foundry's
actual initiating user and referenced documents validated by that GM. Serialize
per Actor UUID, persist SP and receipts together, and recheck authority before
commit. Blocked/capped turn events also receive receipts. Failed or prevented
commits reject without changing SP. Synthetic token commits use diff: false
for the SP flag so equal initial values are stored in ActorDelta; otherwise
later base-Actor gains can leak into an unlinked token's pool. Other Actor/Item
data retains native inheritance and is not rewritten. Rendering never writes.

Repository regressions and an isolated Foundry 13.351 / D&D5e 5.3.3 playable
slice passed; see FOUNDRY_SMOKE_TEST.md for the native multi-client coverage and
renderer limitation. Release deployment and locked LevelDB pack export remain
separate tasks.

## Operator Skill progression choices (0.3.4)

The owner requested fixed Skill choices at levels 2/7/14, including catch-up and
Choose Later. Use the reviewed Chapter 3 catalogue without regenerating content
or changing its rules. Class Item levels and canonical Chapter 3 class/Branch IDs
determine options. Guard Liberator adds its own tier tables at level 1. Defender
Sentry's Marksman Training and Medic Witchcraft's Witchdoctor grant cross-class
tables at level 4. Evaluate access at the slot's granting level: the Basic slot
therefore stays within the original class even when completed late. This is an
explicit implementation interpretation of delayed selection, not a new source
rule allowing retraining. The owner approved this interpretation in the plan.

Persist selections by class source ID and tier in flags.ak5e.operatorSkills.
progression.choices; embedded Items also carry flags.ak5e.operatorSkillChoice.
Rendering computes a read-only view. Infer a single eligible legacy source per
tier, deduplicating copies even when integration is disabled. Conflicting,
unknown or ineligible legacy sources require GM reconciliation. Preserve saved
choices across level reduction, class Item replacement, Branch changes and
deleted Skill Items. Restoring the same source repairs missing Item references.
Do not delete customized/legacy Items or implement respec. Preserve the whole
SP namespace in existing manual-resource helpers so they cannot erase choices.

Learning uses the existing designated-GM queue and server-attributed whisper
requests. Recheck owner, context, granting level, pending slots and legal options
before creation; identical concurrent selections return existing grants and
different selections reject. Embedded markers recover partial creation or a
prevented/failed Actor flag save. Character owners cannot use unrestricted
catalogue learning; GM exceptional grants and owned NPC learning remain manual.
Choosing Skills never enables integration or awards SP.

Coalesce direct class/Branch changes from the initiating client. Native
advancement completion requests an authoritative notification after its clone
has been committed. Suppress automatic prompts during advancement and rerenders;
the assigned active player, deterministic active owner, or designated GM receives
the notification. Catch-up runs on the first owned sheet opening after login.
Close a pending choice dialog when native advancement starts, and defer manual
reopening until it finishes or closes. Its pre-completion hook preserves current
AK5e SP/choice flags and learned Skill grants when applying an earlier Actor
snapshot; unrelated Actor namespaces and native advancement data stay intact.
Dialogs and dismissal suppression are per Actor/client/session, while durable
choices and cross-client deduplication belong to the GM. Exceptional Skill grants,
Breakthrough exchanges, Alternate Classes and branch SP modifiers stay manual.

## World-wide AK5e replacement rules (2026-09-28)

The Chapter 1 World setting is the master switch for changed base mechanics on
all character and NPC Actors. Stock D&D5e catalogues and actor-owned Items are
not rewritten. The change is tested initially against Foundry 13.351 / D&D5e
5.3.3 in both rule modes; other D&D5e 5.x releases remain unverified.

- Frightened and Surprised keep stock status IDs so existing effects still
  identify them. Remove native Surprised initiative disadvantage and link both
  definitions to the AK5e Chapter 1 journal. Foundry cannot reliably infer
  distance moved or whether an Action was already spent, so the recorded turn
  choice and enforcement of movement/actions remain GM-confirmed.
- Dying is an AK5e Actor flag and condition marker, while native success/failure
  counters are held at zero. Native death rolls are reused only for their d20
  result. Natural 1/20 special outcomes are discarded because Chapter 1 does not
  state them. Three failed AK5e saves or massive damage mark Dead. The GM still
  confirms beginning/end of turn and Medicine triage timing. The source does not
  define automatic recovery from Dead, so this module does not infer it.
- A separate sheet represents each optional Alternate Class. The GM reviews
  the two swapped abilities and inventory, queues a switch, and completes the
  Long Rest. Inventory and level changes after review require continued GM
  reconciliation; moving native Items between sheets would risk losing their
  custom state. Hit Dice recovery is withheld on the switch rest.
- Combined skills use the highest proficiency or expertise. Original stock and
  AK5e values are retained in `flags.ak5e.skillReconciliation` for a reviewed
  reversal. Existing stock skill fields stay present for imported content.
- World-wide casting has no inferred spell-slot-to-AP conversion. Stock casters
  require GM-set AP and maximum Art level. Selected Casting Units must have the
  source property, except for an explicit exception. D&D5e's separate healing
  and target APIs cannot prove every healing event's origin, so direct HP edits
  and unselected targets require GM adjudication for Constructs.
- Chapter 4 converts 1 cp/1 sp/1 gp to 1/10/100 LMD. It gives no electrum or
  platinum conversion. These denominations are excluded from the LMD sum.
  Chapter 4 also does not state how several equipped DR sources combine; the
  calculator requires a GM override instead of inventing stacking. Native
  damage application is separate so the preview cannot silently double-apply
  resistance, vulnerability or DR.
- D&D5e feat Items with native feature subtype `class` are treated as Class
  Features, alongside AK5e-provenance Chapter 3 feats. Chapter 4's Medical Kit
  is treated as the named Medicine equipment source. Other item names are not
  inferred to be Medicine. Source-defined exceptions
  are represented by `flags.ak5e.constructHealingException` on the healing Item.
  The source's general use of "Medicine Skill" also covers skill checks, whose
  result must be applied by the GM because D&D5e has no healing provenance for
  a plain skill check.

## SP audit and Skill targeting (0.3.6, 2026-10-02)

- Source IDs key profiles; similarly named class versions retain their own
  damage and target limits. All 320 source rows remain exact. Reviewed profiles
  are distinguished from manual mappings in `SP_SKILL_AUDIT.md`.
- Positive native post-defense damage establishes damage charging even without
  an HP delta at zero HP. Healing still requires actual HP restoration; Art
  temporary HP requires an increase. Direct HP edits cannot prove damage origin.
  The Chapter 1 damage hook requests a Dying save only for an active Dying flag;
  a zero-HP Actor without that state must not call the Dying-only API.
- Native fallback Spell Save DC does not establish a casting ability. Missing
  DC prerequisites block activation; narrative prerequisites require explicit
  confirmation. No omitted range, DC, damage formula, or event is inferred.
- Geometry uses occupied square/hex cell centers and gridless token centers,
  in 2D. Source heights and elevation are retained for manual review. Cubes use
  the placed rectangle origin; ordinary cones use native flat-cone geometry,
  while explicit 180-degree cones use a semicircle. Only module-marked templates
  extend configured MeasuredTemplate geometry; core templates are unaffected.
- Ordinary walls block center-to-cell paths. Corner-spreading areas use paths
  around endpoints through open passages inside the area. Directional, limited,
  proximity, thickness, and non-wall obstruction interpretations need GM review;
  explicit piercing requires GM confirmation. This cannot infer physical walls
  from scene artwork.
- Neutral/secret dispositions do not prove ally or enemy status. The initiating
  user explicitly selects narrative relationships. Hidden targets are stored in
  GM-only messages, excluded from shared Actor receipts and player results.
- Activation is a recoverable prepared/template/SP commit. Retry IDs deduplicate
  spending and rolls. Later phases reuse the original provenance; Instant Skills
  can retain delayed effects. Mandatory observed events prompt rather than
  applying effects automatically. Optional phases remain user initiated.
  Template reuse and cleanup require both activation ID and Skill UUID so
  different casters cannot share or delete each other's areas through an ID
  collision. Blood Boil counter corrections use a GM-only receipt command with
  a source reason rather than an untracked direct flag edit.
- Native saves/damage/healing/weapon attacks are offered only when faithful.
  Damage, healing, conditions, movement, linked Arts, summons, tether outcomes,
  and derived conditional formulas remain confirmed/manual. Manual effects can
  use the public provenance helper; direct HP edits require counter correction.
- Grand Cross's changing cost/action, class/talent/equipment grants, charging
  replacements, refunds, and their rest resets remain manual. Managed updates
  add missing activities only; existing user-edited activities take precedence.

## Player agency over GM gating (2026-10-11)

Project-owner direction, recorded as a project rule in WORKFLOW.md §3.2 ("trust
the table"). The module assists the table and does not police it; the party is
assumed to play in good faith and to defer to the GM.

- **No approval gates for play.** An Actor's owner uses that Actor's abilities,
  Skills, features, Arts, items and resources without GM approval, including out
  of turn and outside combat. Turn, combat-state and GM-presence checks are
  warnings, not blocks.
- **Unowned targets (owner's choice: automatic relay).** Changes to documents
  the player does not own go to the active GM's client, which applies them
  automatically with no human prompt, through the operation kernel's
  elected-GM commit or the module socket. If no GM is connected, the player is
  told the change was not applied.
- **Warnings (owner's choice: warn and allow).** Out-of-range targets, missing
  prerequisites, resource shortfalls and timing problems are listed in the
  confirm dialog with **Use anyway**. Only technical impossibilities hard-stop.
  Overridden warnings are listed on the use's **public chat card**.
- **Overspend (owner's choice: clamp at 0).** An overridden resource shortfall
  sets the resource to 0, never negative, and the chat card shows the shortfall.
  Undo restores the exact prior value.
- **Missing GM ruling (owner's choice: player picks per use).** The confirm
  dialog offers the possible readings of the unresolved source text. The
  player's pick applies to that use only, is shown on the chat card, and is
  never stored as a ruling. A recorded GM ruling takes precedence.
- **Confirm before use, except ability checks.** Every ability, AK5e Skill,
  feature, Art or item use that the module starts or wraps has a confirm step
  that changes nothing on cancel. Ability checks (including skill checks) and
  saving throws, from D&D5e or the module, need no confirm step.
- **Never auto-roll the player's dice (owner's choice).** Damage, healing
  (including temporary HP), attack, saving throw and feature/cost dice are
  rolled only when the player (or, for NPCs, the GM) clicks. Saves are offered
  as a button for the target's owner. Module code may modify a roll the player starts, but must
  not start one.
- **Reversible per encounter window (owner's choice).** Every module-initiated
  change records an undo receipt under `flags.ak5e`. The acting user or the
  Actor's owner can undo any receipt in the current window, and so can any GM,
  including relayed target changes. Starting a combat locks receipts from
  before it, and ending a combat locks that combat's receipts. Undos are noted
  on the public chat card.
- **Still GM-only.** World administration (installers, imports, migrations,
  world settings, pack edits, RollTable/folder installation) and recording a
  *ruling* on unresolved source text.

**Supersedes** earlier entries in this log that make GM approval, a GM-recorded
reason, or a GM-recorded ruling a *precondition* for a player's action (for
example the Caster rulings preamble, Splash/Safe Zone refusal, Burst
reconciliation, GM-only undo, and "the GM must apply to an unowned target").
Recorded GM rulings remain valid and are applied when present. When one is
missing, the player sees a warning instead of a refusal. Existing code has not
yet been brought into line. See the "Player-agency compliance audit" in
`TODO.md`.

## Operation kernel (SI-1)

- **What moved.** The request / elected-GM commit / receipt / serial-queue /
  reconcile machinery in Standard Bearer is now `scripts/operation-kernel.mjs`
  (`createOperationKernel`, `keyedSerial`, `opaqueKey`), and the branch-free sheet
  helpers (retry-with-same-ID tracker, open-once guard, DOM builders) are in
  `scripts/operation-panel.mjs`. The kernel is configured with flag names, a state
  getter, an ownership-exempt command list, a gate, `beforeRun`, `perform` and
  `afterPerform`; it knows nothing about classes. `reconcile` is a kernel built-in.
- **Behaviour is unchanged, with one deliberate relaxation.** `perform()`,
  Battlecries, Tip of the Spear, aura and map code stay in `standard-bearer.mjs`;
  error wording, the 15-second retry message and the operation lifecycle are the
  same. `reconcile` now runs before any source-token or target resolution, so a GM
  can recover an interrupted operation without choosing a token first (it
  previously failed with "Choose the bearer's source token" when none resolved).
  Its GM-only, reason (10+ characters) and confirmation requirements are unchanged.
- **Wire and data compatibility (explicit choice).** The Standard Bearer instance
  keeps its original flag names (`standardBearer`, `standardApplications`,
  `standardBenefit`, `standardRequest`, `standardResponse`, `standardRoll`) and the
  `standardKey()` hash, so existing Worlds, receipts and in-flight requests keep
  working. A new branch supplies its own names. No migration is needed or provided.
- **Operator Skills boundary.** Its journal has a different shape (`{ id, result }`
  replay, no `prepared` status, an `application` side-command), so only its private
  per-Actor queue was replaced by `keyedSerial`. A fuller migration is deferred; it
  would change SP-ledger replay semantics and needs its own tests.
- **Still manual / not implemented.** Tip extraction (SI-12), the aura/zone engine
  (SI-6) and rules for any other branch. This is a refactor, not a rules change; no
  source ruling was made.

## P1 kernels: resource pools, triggers, damage pipeline, Tip of the Spear (SI-2, SI-3, SI-4, SI-12)

Labels: **E** explicit source rule, **F** faithful representation, **M** manual
procedure, **P** proposed interpretation awaiting the owner. Nothing here changes a
rule; where the source is silent the kernels take an explicit parameter.

**SI-2 `scripts/resource-pools.mjs`** (new flag `flags.ak5e.resourcePools`; the
existing `featureTracking` flags and native `system.uses` are untouched)
- F: Resilience, Aggression, Sparks of Creation, Mystic Charge, Life Support and
  Momentum maxima are the source tables. `full` raises to max and never lowers;
  `toMax` sets exactly (drops Healing through Harm excess on a Long Rest, L5104);
  over-maximum pools spend the excess first.
- P: "once per Turn" is the actor's own turn cycle (generalising `turnCycle`);
  "round" is the combat round. Outside combat the limiter uses a world-time bucket
  (`floor(worldTime / 6)`), the alternative being block-until-rest.
- P: initiative recovery fires once per combatant per combat (a reroll does not
  re-grant Momentum); skipped turns fire no turnStart/turnEnd; replayed turns do not
  re-trigger (event receipts).
- Review fixes: a turn index shift of the same combatant in the same round is not a
  new turn; combat-end recovery requires a started combat; `toInitial` is clamped to
  max unless over-maximum is allowed. Known limits (M): receipts are capped at 24 per
  pool, so a very old event could regrant after a long replay; concurrent writes from
  two clients can lose an update; a pool's recovery list applies only the first
  matching entry (a long rest matches `lr` then `sr`).
- F/M: rest recovery runs on the resting client (`actor.isOwner`) because
  `dnd5e.restCompleted` is local; combat recovery runs on the active GM.
- M: gain conditions that need other kernels (Liberty L2946-2949, Mystic AP gains,
  Momentum hits, Eternal Aggression d4 refund, Healing through Harm roll amount,
  Summoner merge refunds) are caller logic.

**SI-3 `scripts/trigger-events.mjs`**
- Events: attack, hit, crit, hitTaken, save, initiative, turnStart, turnEnd, kill,
  combatEnd over verified dnd5e 5.3.3 / Foundry 13.351 hooks; no adapter cancels a
  hook or mutates shared `options`. Gaps (M): HP edited directly on a sheet is not a
  `kill`; death saves are not emitted; combat events need an active GM; chat attacks
  without an activity have no actor; rider expiry on time/rest/concentration is not
  wired.
- P: base Reactions per creature is 1, inferred from Reactive ("two Reactions instead
  of only one", L1033); Chapter 1 does not state it. Reactions regain at the start of
  the creature's own Turn.
- P (unresolved, TODO L280): the scope of "one Reaction per trigger". `perTrigger`
  defaults on per the Reactive wording and every spend names a `triggerId`; refunds do
  not clear the per-trigger mark unless asked.
- E: Well-Drilled's extra Reaction is restricted to the tactician's Strategies or
  Tactics (L8760). P: when it ends is unresolved; callers must choose
  `atTurnStart: regain | expire | keep`.
- F: `hitTaken` means damage amount > 0; "hit by an Attack" uses `hit` filtered by
  target. P: concentration saves emit `save`.
- M: the combat-end Reaction reset is not implemented. Reaction state sits behind a
  store interface so it can later be backed by an SI-2 pool.
- Review fixes (independent review, before any consumer exists): emptied Reaction
  `triggers`/`receipts` are force-replaced (`==`) because Foundry merges flag objects
  recursively; the turn handler walks from the last state it processed because core
  mutates `combat.previous` in place on a quick double advance; death saves (no
  ability) are not emitted and a concentration save arrives as one `save` marked
  `concentration`; rider IDs may not contain `.`; rider expiries must carry the anchor
  fields `tagHasExpired` reads; unstarted combats emit no `combatEnd`.
- Known limits (M): per-Actor queues order writes within one client only, so a GM
  refresh and a player spend at the same instant can lose an update; a consumed
  `once` rider blocks re-registering the same ID until a non-attack expiry pass prunes
  it; hit/miss uses the user's current targets and their AC at roll time.

**SI-4 `scripts/damage-pipeline.mjs`** (calculation only; Standard Bearer now uses it
for Temp HP, the post-calculation Temp HP/HP step and the Defiant Roar preview)
- E: DR applies before Resistance/Vulnerability and cannot reduce below 1 (Ch.1
  L207-209); Corroded halves DR rounding down (L234). F: the existing "minimum 1 after
  Resistance" in `reductionPreview` is retained for compatibility; the source states
  the minimum only for DR. The pipeline matches `reductionPreview` on 728 input
  combinations and `damageAfterReduction` for valid numbers; only malformed input
  differs (it throws instead of returning NaN/0).
- E: Blood Price HP loss cannot be reduced and may not expend Temp HP (L3287): the only
  HP-loss preset. M: Debilitate, Godpiercer, Mortal Blow, Light of Hope and Nervous
  Impairment have no stated policy; `hpLoss` requires an explicit `{bypassDR,
  bypassResistance, bypassTemp}`. P (not applied): HP loss bypasses DR and Resistance
  but not Temp HP. F: Blood Boil (L1122) is `ignoreDR` + `ignoreResistance`.
- P: stacking of several DR sources is undefined; the pipeline returns `requiresGM`
  unless `policy.stacking` is `'sum'`. Temp HP has no general rule: the mode is required
  on every call (Tip and Heroic additive, Power Projection replace).
- P: Maximum Burst "half of the rolled Damage" rounds down (caller supplies
  `minimumTaken`). Weapon Tuning explosions require `explode.recursive` to be stated;
  Heartseeker with exploding dice throws until ruled. M: Savant/Savage Shots rerolls are
  chosen per die (`rerollIndices`), not automatic. Crit range (L399-400) and damage-type
  override (L220) are not implemented.
- P (unlogged until review): for HP loss, bypassing Resistance also bypasses
  Vulnerability (`bypassResistance`); the source only says Blood Price "cannot be
  reduced". Healing never lowers HP (HP above a reduced effective max is kept).
- F: `confirmedDamage` now runs its Temp HP/HP step through the pipeline. Integer
  results are identical; an undefined `hp.value` or negative `hp.temp` now throws
  before any write (previously NaN / extra damage), and `preApplyDamage` receives the
  same value that is applied. The UI only accepts whole-number reviewed totals.
- F: Ch.1 L250 Nervous Impairment (lose 3 HP when hit) and the L794 overlay are
  additive per TODO L656; whether overlay triggers stack and whether it interacts with
  Temp HP/DR remains open.

**SI-12 `scripts/tip-of-the-spear.mjs`**
- Standard Bearer's Tip, Tip SP and the critical-range hook now delegate to it;
  effect ids, labels and metadata are unchanged so existing receipts replay.
- E: base targeting is "an allied Creature you can see within 60 feet" (L7997).
  P: the text does not say "other than you" (Herald does), so the bearer is not
  excluded; self-targeting is a GM ruling. The module enforces nothing here.
- F: variants only fix count/range: Tactician unlimited range (L8707), Leading Lance
  twice (L8091), Last Stand repeat on the same creature (L8585), Pioneer count supplied
  by the caller (L8434/L8451). M: Tactician's "From 4th Level" gate (TODO L629-630),
  Agent's Invisible clause, Charger's Mark/0 HP trigger, Devastating Blow's trigger and
  Pioneer SP accounting are not enforced. P: Leading Lance's two uses share a target by
  default (source silent). No non-Vanguard branch is wired (P3).

## Standard Bearer helpers (0.3.7)

- The source remains authoritative for Vanguard eligibility and effects. The
  repository helper is player-confirmed and elected-GM committed; aura geometry
  never establishes visibility, allegiance, willingness, hearing, or source
  eligibility. The prop is a map representation only and is not a creature,
  combatant, target, obstruction, or gameplay-HP Actor. Its persistence and
  rendering still require clean-World inspection.
- Setup/update is a previewed idempotent addition of a missing source weapon and
  managed activities. It preserves existing Items, IDs, counters, and authored
  activities. Do not mass-replace the character inventory or pack.
- For planted Tip of the Spear, the generic trigger says “Creature,” while the
  feature's eligibility says a visible ally within 60 feet. The helper retains
  the base eligibility and one-recipient-per-cycle limit. Enemies, neutral,
  unseen, and out-of-range entrants require an explicit GM decision; no broader
  rule was inferred. The source also does not say whether another creature
  wielding the standard inherits Vanguard features. Pickup/handoff records the
  holder, but branch powers remain tied to the original Vanguard pending a GM
  ruling.
- During The Last Stand, the second Tip use is a separately recorded roll and
  application. The text does not specify whether Directed Engagement can make a
  different choice for that additional use; the helper reuses the confirmed
  choice, with a GM ruling available if the table interprets it differently.
- Temporary HP from Tip and Heroic Proclamation is applied additively; Power
  Projection's friendly/neutral result uses ordinary temporary HP replacement
  (`max(existing, rolled)`). These source cases must not be conflated.
- Last Stand extra turns use a guided pause/manual-turn/resume procedure and do
  not rewrite initiative. SP redirection is limited to a recorded pending event
  before application; already-applied or unobserved grants need manual GM
  reconciliation. The controller does not subtract already-spent points or
  infer a second SP gain.
- Defiant Roar's source Damage Reduction is applied before resistance or
  vulnerability, and damage has a minimum of 1. The preview does not apply
  damage. Entering a manually reviewed final total bypasses further defenses;
  confirm the total already includes AK5e DR and applicable defenses. The native
  D&D5e calculation path keeps native defenses but cannot infer combined AK5e
  DR reliably; when Defiant Roar applies, the helper requires a reviewed final
  total or manual resolution. Other ambiguous DR sources and stacking require
  GM review rather than an assumed sum.
- A prepared operation is not silently repeated with new choices. Retry the same
  operation ID and choices; otherwise a GM must inspect and reconcile its
  effects, resource use, and map state with a reason. This recovery procedure
  cannot establish what happened outside recorded receipts.

## Defender, Dreadnought and Artshield (0.5.0)

Authority: Chapter 3 L896-1292 and L1324-1361; the per-feature ledger is
`DEFENDER_IMPLEMENTATION.md`. Ambiguities below are resolved with the most literal
reading, shipped as the automatic default, and recorded here; a GM can override by
editing the managed effect or adjusting resources manually.

- **Scope.** Defender chassis, Dreadnought and Artshield only. The 0.5.2 finish
  increment below adds native progression and all 42 Talent choices, with five
  Shelter/SP workflows. Operator Skill choices retain their existing chooser;
  the other 37 Talent effects and other five branches remain manual.
- **Dreadnought is not a charging replacement.** Earlier notes (above, and the SP audit)
  call it one. L1334 only grants Skill Points while the Advance is active; no Skill's
  Charging Methods are changed.
- **Shelter** (L992): proximity is evaluated when the Attack is rolled, not when Shelter
  is declared. The user confirms the allies; geometry never decides allegiance. A roll
  with several targets is one roll, so any sheltered target gives Disadvantage. Enforced by
  `dnd5e.preRollAttackV2` on the attacker's client; outside that hook it is a reminder.
- **Leaping Defence** (L1029): "hits regardless of your Armour Class" is applied by telling
  the table to apply the Attack's damage to the Defender; the posted roll cannot be
  rewritten and a Critical Hit follows that roll (Adamantine Defence aside). "One Reaction
  per trigger" (L1034) is per named Attack / Damage / Art-cast / Save label.
- **Indestructible** (L1043): Damage Reduction is not a stored statistic, so the user
  enters it. With no DR, doubling changes nothing.
- **Adamantine Defence** (L1048): a notice only; the posted roll is not rewritten.
- **Opportunity Attacks and "no Action required".** Chapter 1 L291 lists "no Action
  required" as an activation category separate from Reaction. Leaping Offence and Tear
  them Down are therefore free of the Reaction; Reactive Defence (no such phrase) uses it.
- **Advance Skill Points** (L1334): one award per Attack Roll message made by, and once
  per Attack Roll message made against, the Dreadnought; misses and no-target rolls count.
  Awards are GM-run and idempotent by message ID. The SP engine's maximum and its
  no-gain-while-an-Operator-Skill-is-active rule still apply; a refusal is whispered, not
  hidden. "Melee Attacks" is read as native melee weapon attacks.
- **Advance end check** (L1331): at the end of the Dreadnought's Turn the Advance ends
  unless an Attack, Damage dealt, forced Saving Throw or Damage taken was observed or
  recorded since the last check. Forced Saves and unseen Damage cannot be observed, so the
  owner can record them and the GM can reinstate a wrongly ended Advance (no resource change).
  The window includes qualifying activity before activation; only the active Advance grants SP.
- **Crownsplitter** (L1344): the tier comes from the bestiary `category` flag; an unknown
  or mixed-target tier is never guessed. The Strength modifier is added once and the table
  is told to add it again if the target is Elite or Leader. A negative modifier is added as
  printed.
- **Legendary Might** (L1361): "increased by 6, to a maximum of 26" overrides the usual
  20 cap; implemented as ADD 6 then DOWNGRADE 26. The preview warns only when the derived STR is
  already above 26 (the only case where the cap lowers a score). Confirmed in a rendered session
  2026-10-10 (18/20/22 became 24/26/26).
- **Martial DC** (Ch.1 L211) in generated activities uses the higher of STR and DEX
  modifiers, the player's printed "choice".
- **Wrecking Wall** (L1347): Stunned and the DR/Resistance bypass are not applied by
  Foundry's native Apply Damage; they are procedures in the activity's chat flavour.
- **Arts Absorption** (L1256): the source gives no cap or duration, so one charge is
  stored until expelled or a Long Rest; re-absorbing while stored does nothing. "10ft
  Square" is a 10-ft cube template. Expel is an Action on the Defender's Turn.
- **Reactive Defence** (L1266): "Unit" means any Creature; hostility is confirmed by the
  owner. Reach is the larger of 5 ft and the equipped melee weapons' reach.
- **Arts Resistance / Spellshield** (L1229-1231): Advantage is applied only to Saves
  rolled from an Art's chat card (the Save hook carries no item). Spellshield's "Arts you
  can see" is confirmed separately for each originating Art message during the
  active Shelter. The current ally proximity is checked again on the Save.
- **Concentration Breaker** (L1268): a receipt for actual positive Damage dealt
  by the Artshield, tied to the target's current Art concentration instance and
  explicit native Concentration Save. Cancelled and unrelated Saves retain it.
  An elected-GM claim prevents two clients consuming the same receipt.
- **Eye of the Storm** (L1283-1291): the barrier template, inside list, duration and the
  list of Art-origin effects are tracked; immunity to Arts, Art-like effects and Arts
  Damage is not modelled and stays a table procedure ("Arts Damage" and "Art-like" are
  not defined as Foundry damage types).

## Guardian branch (0.5.5)

Source: C3:1494–1586 (Guardian Arts Casting table L1510–1531), C5:415–435 (Healing
Arts), C1:138 (Constructs). Tags as in the Primal and Splash entry. All uses follow
WORKFLOW.md §3.2 through the Defender use engine (`play-uses.mjs`).

- **Guardian of Life (E/F/M).** E: the table, Long Rest recovery, INT/WIS/CHA
  "when you gain this Feature", shields as Casting Units, every Healing Arts Art of
  5th level or less always prepared. F: a previewed setup writes the Arts flags
  (`castingUnit: "shield"`: any equipped shield satisfies the focus check, without
  the world-rules property text) and grants the Arts idempotently. M: 14 of the 16
  Arts are D&D spells with no AK5e record; they need a GM-approved spell mapping
  (the Caster mapping store) and are listed until mapped. P: a level-up re-run
  raises the maximum but never changes current AP; changing the ability after it
  was chosen is a table decision (warning).
- **Not Today (E/F/P).** E: once per Turn, any Resilience, no Action, minimum 0.
  F: the discount is an AP-quote option applied after every other modifier and
  consumed by the next committed Art cast, including free and ritual modes, in the
  same Actor update as its AP. Cancelled casts consume nothing. P: the
  discount equals the Resilience actually expended (an overridden shortfall clamps).
  P: "the next Art you cast" includes a Cantrip, which consumes it at no saving. P: a
  second use while a discount is waiting replaces it (warning); undo the first use
  to get its Resilience back.
- **Anaesthesia (E/M, reading `anaesthesiaTempHP`).** E: 2d6, or 4d6 for 1
  Resilience, when you restore Hit Points. M: the player confirms the healing. The
  Temporary HP combine with existing ones by GM ruling or the player's reading
  (`replace` keeps the higher, `additive`) only when the Creature already has some.
- **Aura of Mercy (E/F/M/P, reading `auraIncludesSelf`).** E: +PB when an allied
  Creature within 10 ft recovers HP. F: any HP increase (not a rest, not the Aura's
  own HP) near a level 12+ Guardian posts a whispered prompt to its owners. M:
  allegiance is confirmed by the player; geometry never decides it. P: Temporary HP
  are not "recovering Hit Points", so Anaesthesia does not trigger it. P: once per
  healing instance and Creature. Whether the Guardian is "an allied Creature within
  10 feet of you" is a reading.
- **The Best Medicine (E/F/P).** E: Bonus Action, one minute, once per Long Rest;
  "whenever you make a Melee Attack" (hit or miss), 2d6 to a Creature you can see
  within 30 ft. F: a 60-second tracked effect; a whispered prompt after each melee
  attack roll. P: one heal per Melee Attack. E (C1:138): Constructs do not regain
  HP from it.

## Fortress branch and four-branch completion (0.5.6)

Authority: Chapter 3 L1387–1490 (Fortress), L456–549 (Chain), L554–668
(Mech-Accord), L1494–1586 (Guardian); Chapter 1 Constructs, Martial DC and
conditions; Chapter 4 launcher statistics and Splash. Development acceptance
evidence is recorded separately in `FOUNDRY_SMOKE_TEST.md`.

- **Entrench (E/F/M).** E: at the beginning of the Defender's Turn until the
  beginning of their next Turn; Speed 0 and cannot increase, or −20 ft from
  level 9. F: the initial effect overrides all native movement speeds with
  priority 50; Moving Fortress reduces native walking speed. M: reduce other
  movement modes by 20 ft manually. An edited higher-priority effect needs table
  review; priority 50 does not establish immunity to all possible custom effects.
- **Barrage and Danger Close (E/M).** E: the benefits require Entrench. Barrage
  ignores Two-Handed and Brace during the Attack Action. Danger Close applies to
  any Saving Throw the Fortress forces, up to PB other Creatures automatically
  succeeding and taking no Damage when success normally halves it. F: the volley
  helper records chosen exempt Creatures. M: apply Danger Close to other saves
  manually; native Apply Damage does not infer exemptions.
- **Munitions (E/F/P).** E: five Dice, d4/d6/d8 at levels 4/7/14, Long Rest;
  one die to load as an Action, or also 1 Resilience for a Bonus Action; PB loaded
  per launcher, no duplicates; lost on unequip or Incapacitated. P: Damage dice
  are rolled once for the volley, shared across its targets. F: typed native
  DamageRolls are requested only by the player's Roll button. Save outcomes and
  Damage application remain the table's explicit native actions.
- **Weapon Damage (reading `munitionWeaponDamage`).** Chapter 3 says weapon
  Damage plus loaded Munitions; Chapter 4 Splash separately adds an ability
  modifier. A GM ruling applies, otherwise the player chooses weapon dice or
  weapon dice plus ability modifier for this volley. The choice is public and
  never becomes a saved ruling.
- **Target point (E/M).** E: within 100 ft, 15-ft radius; an unseen point requires
  neither the Fortress nor the point to be under a roof. M: use Foundry's template
  tools and confirm the point/roof conditions. The helper does not automate roof
  or visibility geometry.
- **Riders (E/F/M).** Apply only after a confirmed failed Save. Concussive: Dazed
  and half Speed through the target's next Turn end. Corrosive: Corroded until its
  Action removes it, with manual removal. Flare: no Invisible benefit and Attack
  Advantage through the Fortress's next Turn end, as visible instructions.
  Incendiary/Shrapnel use the printed Burning/Bleeding condition procedures.
  Explosive has no rider and permits Acid, Fire or Thunder.
- **Stronghold (E/F).** Fortification is Shelter without an Action once per Turn
  while Entrenched. Stop their Advance spends 1 Resilience and one named-trigger
  Reaction; exhaustion/timing are overridable warnings. Its receipt restores
  only its own Reaction spend, never an already-refreshed budget.
- **Automatic consequences (E/F).** Creeping Barrage restores the count to two
  on Initiative if below two; loaded-Munition loss follows unequip/Incapacitated.
  These passive consequences have public receipts and encounter-window undo;
  they neither roll dice nor initiate a new optional feature use.
- **Guardian Constructs (E/F).** Chapter 1 ordinarily prohibits class-feature
  HP recovery for Constructs. An explicit table override is warned before the
  use, recorded publicly and validated on the GM relay. Temporary HP are separate
  from HP recovery. Not Today undo never reprices a completed Art.

## Defender finish increment (0.5.2, 2026-10-11)

- **Progression authority:** attached Defender class levels gate setup; preserve
  an existing branch. Initial saves/skills/tool/equipment and selected Talent
  slots are immutable setup receipts. Existing HP and ASIs default to included;
  only explicitly unapplied gains change base data. Retraining is separate.
- **Native representation:** all-melee proficiency uses a custom note because
  native Simple/Martial include ranged weapons. All armour and shields use native
  proficiency fields. Tools preserve authored ability/proficiency data. Equipment
  or 1300 LMD uses stable Chapter 4 IDs and quantity receipts; currency keeps the
  existing CP mapping. Current HP, temporary HP and resource pools are preserved.
- **HP/ASI:** first-level d12 gives 12, later fixed gains 7 or an entered d12.
  ASIs at 4/6/8/10/12/16/19 use base scores capped at 20; Legendary Might remains
  a separate +6/cap26 effect. New Constitution ASIs adjust all included levels'
  maximum HP, following the [5e SRD 5.1 Constitution advancement rule](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf).
  Field and level receipts prevent retry/repeated-level duplication.
- **Talent state:** Basic/Advanced at 3/9, upgrade or an additional different
  Talent at 8/13, retaining the original. Trigger amounts use the eligible
  Talent/Module state recorded at that event; no client-supplied SP amount.
- **Interlocking Shields:** retain the existing logged half-PB rounding-up
  default; use the strongest contribution without stacking the Feature with
  itself, recheck active Shelter/range, and guide damage application.
- **Arts Damage:** Chapter 1 L145–162 defines Arts damage types and treats all
  damage dealt by Arts as Arts Damage. A known Arts type can qualify without a
  spell; spell Physical-type damage also qualifies. Unknowns require GM review.
- **Native evidence and privacy:** authenticated Attack cards use native Actor
  UUID target descriptors, resolved only to an unambiguous scene token. The GM
  independently records actual HP updates. GM-local native damage application
  binds the originating message directly, including cards without target lists;
  remote hints require explicit GM source-provenance review. Trigger geometry
  and Skill snapshots persist in GM-whispered ChatMessages with opaque map keys;
  player Actor flags contain event references and public receipts. Player pickers
  exclude unseen Creatures. Missing recipient range/Skill facts require explicit
  GM confirmation; known invalid facts cannot be overridden.
- **SP execution:** source ownership authorizes optional recipient selection;
  recipient ownership is unnecessary. The active GM enforces SP caps and
  Chapter 1 Skill-origin/active-Skill restrictions. Per-recipient prepared and
  committed receipts survive partial failures. Refreshment reserves its Turn
  before committing SP, including capped attempts. Temporary HP is excluded;
  outside combat only a GM-confirmed observed Turn marker qualifies.
- **Guided boundaries:** Leaping Ward provides Resistance only to its triggering
  Art; 1 Resilience refunds exactly its spent Reaction once and never after reset.
  Outside combat the owner explicitly ends Shelter at the next observed Turn.
  DR, immunity, critical adjustments and posted-roll redirection remain guided.
  No release packs or publishing are part of this increment.

## Guard class, Centurion, Crusher, and Instructor branches (0.6.0, 2026-10-11)

Authority: Chapter 3 L1740–2201 (Guard base), L2549–2632 (Centurion), L2633–2738 (Crusher),
L2846–2936 (Instructor); referenced Chapter 1 (Martial DC L211, conditions, DR),
Chapter 4 (equipment, Heavy and Crush properties), Chapter 6 (Elites and Leaders).

- **Guard Progression & Setup (E/F):**
  - Chassis saves: Strength + choose 1 of Constitution or Dexterity (L1773).
  - Skills: choose 3 of Acrobatics, Athletics, Lore, Insight, Intimidation, Wilderness (L1774).
  - Starting equipment: Heavy Melee Weapon OR Light Melee Weapon; Light Melee Weapon OR Light Shield;
    Reinforced Outfit OR Combat Gear; one kit proficient with (or 1300 LMD as CP) (L1776–1786).
  - Fighting Styles: Lightly Armed, Ranger, Spearwall, Great Weapon Fighting, Deadly Fighter,
    Defensive, Duelling, Two-Weapon Fighting, Brawler (L1837–1865).
  - ASIs at 4/6/8/10/12/16/19; Hit Dice d10 (fixed 6 or entered roll).
  - Basic/Advanced Talents slots at levels 3/8/9/13.
  - Setup is idempotent and opt-in: `previewGuardSetup` / `applyGuardSetup` grant level-appropriate
    features without duplicates and never auto-import on drop or sheet render.

- **Resource Pools (`resource-pools.mjs`):**
  - `aggression`: 4 at 1st, 6 at 7th, 8 at 14th level (Short/Long Rest recovery).
  - `unrelenting`: 1 at 3rd level, 2 at 11th level (Long Rest recovery).
  - `foecrusher`: `@prof` uses (Short Rest recovery).
  - `instructionDice`: 4 at 1st, 5 at 7th, 6 at 14th level; d6 scaling to d10 at 13th
    (Superior Instruction); Short/Long Rest recovery.
  - `breach`: 1 use (Long Rest recovery).
  - `ferociousFling` (1/SR), `guillotine` (1/LR), `stormOfBlood` (1/LR) for Centurion.

- **Table Play & Verification (`guardUses` engine):**
  - Adheres strictly to WORKFLOW §3.2 (Trust the Table):
    - No turn-gating or GM approval required for player actions.
    - Relay of unowned targets goes through the GM client automatically.
    - Warnings on resource shortfalls, level gates, or missing reactions never block;
      "Use anyway" clamps resource at 0 and records shortfall on the public chat card.
    - Dice are never auto-rolled; receipts store formulas and player clicks the Roll button.
    - All actions recorded with reversible receipts in `flags.ak5e.guardUses` and supported
      by encounter-window undo.

- **Centurion Subclass (E/F):**
  - Fearmonger grants Advantage on attack rolls against Frightened targets.
  - Cyclone Strike enforces target limits by level (1 up to 6th, 2 at 7+).
  - Brutal Execution spends 2 Aggression, applies Psychic damage and WIS save for Frightened.
  - Ferocious Fling refunds its use when Brutal Execution is triggered.
  - Guillotine rolls 2×PB d6 Slashing and inflicts Bleeding, pulsing Frightened on Elite/Leader.
  - Shredder deals STR modifier damage, doubled if target is Frightened.
  - Storm of Blood rolls 10d8 Slashing, sets Long-Arm and reaction refund on AoO hits.

- **Crusher Subclass (E/F):**
  - Maximum Bulk adds `3 * level` to maximum HP.
  - Extreme Fortitude rolls 2 Hit Dice on rests and takes the highest.
  - Heavy Metal adds +1 die of the weapon's base damage die to Heavy Melee weapons.
  - Singular Strike limits Attack Action to 1 attack and computes damage bonus for extra
    attacks that would have been available: `additionalAttacks * (weaponBase + STR + bonus)`.
  - Death's Passing deals half damage as Thunder Damage on a miss with Heavy Melee weapons.
  - Foecrusher offers Staggering, Dazing, Renewing (Hit Die + CON healing), and Smashing strikes.
  - Press the Attack: Overbear spends 2 Aggression, adds 1d10, and applies two distinct riders.
  - Horde Breaker applies excess damage directly to an adjacent foe within Reach without rolling.
  - Heroic Blow spends 1 Foecrusher use, enables damage dice rerolls, and gains Crush (2×PB + existing).
  - Heroic Killing Blow executes foes reduced below 50 HP and ignores Physical Damage resistance.

- **Instructor Subclass (E/F):**
  - Squad Leader enables Help as a Bonus Action following Attack Action, and extends Help range to 30 ft.
  - 10 Instruction Options: Defend Yourself!, Focus!, Get out of there!, Go!, Hang in there!,
    Keep fighting!, Now's your chance!, Snap out of it!, Steel Yourself!, Strike!.
  - Press the Attack: Cooperative Combat spends 1 Aggression to grant the Instructor the instruction benefit.
  - Kingmaker at 10th level grants a second instruction to an ally within 30 ft for free, using a fixed d6.
  - Teach from Experience at 4th level grants turn-start self instruction for free.
  - Renowned Instructor recovers instruction dice up to half (ceil) on initiative if below half.
  - Once More Unto The Breach (17th) grants mass Help and Instructions to all allies within 60 ft without
    consuming instruction dice.

## Guard Subclasses: Artsblade and Brawler (0.6.0, 2026-10-11)

Authority: Chapter 3 L2202–2417 (Artsblade), L2423–2546 (Brawler); referenced Chapter 1 (Martial DC L211,
Conditions, DR), Chapter 4 (Equipment, Light Shields, Weapons), Chapter 5 (Arts Pools, Resonance).

- **Artsblade Subclass (E/F):**
  - Sword and Sorcery (L2221–2257): Spellsword Points (1 at 1st, 2 at 7th, 3 at 14th; Short/Long Rest recovery),
    Max Art Level table (1st: 1, 5th: 2, 9th: 3, 13th: 4, 17th: 5), Infused Melee Attacks (Martial DC save on hit
    with infused weapon), Augmented Assault (spends 2 Aggression to allow two Blade Arts on the turn; at 13th level
    High Fantasy allows Unleash as normal AoE).
  - Resonance (L2259–2327): Arts-Touched, Blade Art cantrip (1d6 scaling to 2d6 at 5th, 3d6 at 11th, 4d6 at 17th),
    11 Standard Arts pools and damage types (Corrosion/acid, Crude/force, Earth/bludgeoning, Electric/lightning,
    Flame/fire, Fluid/piercing, Frost/cold, Light/radiant, Psychic/psychic, Spatial/thunder, Wind/slashing), and associated riders.
  - Cut Through Chaos (4th level, L2338–2353): PB/Long Rest uses, reaction spend. Modes: Spell Attack (impose
    disadvantage on incoming spell attack), Saving Throw (gain advantage and Clear Path), Reaction Art (trigger free
    Blade Art reaction against attacker/spellcaster).
  - Sharpened Mind, Sharpened Weapon (10th level, L2355–2366): 2 extra pools, Improved Resonance (+1/+3 Crude hit bonus,
    +1d10 Flame damage, etc.).
  - High Fantasy (13th level, L2368–2380): Clear Path, Unleash normal AoE.
  - Power Overwhelming (17th level, L2382–2417): Ceaseless (+1 SP on Initiative if below max), True Spellsword,
    Ultimate Blade Art (1/Long Rest, mass elemental burst).

- **Brawler Subclass (E/F):**
  - Guns Out (L2434–2451): Art of the Fist (Unarmed Strikes deal 1d4 scaling to 1d6 at 7th, 1d8 at 14th; Dexterous
    attacks; Unarmed Bonus Action), Bob and Weave (AC = 10 + STR + DEX when unarmored or in Light Armour; Light Shields permitted).
  - Basic Brawling Techniques (1st level, L2453–2508): 8 techniques costing 1–2 Aggression:
    - Body Check (1 Aggression, push 10 ft on unarmed hit)
    - Cross Counter (1 Aggression, Reaction on melee attack miss vs Brawler, counter-attack)
    - Feint (1 Aggression, Bonus Action, Advantage on next melee attack)
    - Follow Up (1 Aggression, on unarmed hit, free Shove or Disarm attempt)
    - Footwork (1 Aggression, Disengage as Bonus Action or ignore difficult terrain)
    - Guard Up (1 Aggression, Bonus Action, Dodge until start of next turn)
    - Slip Off (2 Aggression, Reaction on melee hit, reduce damage by 1d10 + STR + level)
    - Tag In (2 Aggression, swap positions with willing ally within 5 ft)
  - Advanced Brawling Techniques (10th level, L2510–2535): 7 techniques costing 2–3 Aggression:
    - Chokehold (2 Aggression, grapple/restrain contested check vs STR or CON)
    - CQC (2 Aggression, Close Quarters Combat, advantage on attacks vs grappled target)
    - Disarm (3 Aggression, forced drop of held weapon or object)
    - Human Shield (2 Aggression, Reaction when targeted while grappling a creature, redirect attack to grappled creature)
    - Menace (2 Aggression, Bonus Action, Frighten target with Intimidation check vs WIS save)
    - Skullshaker (2 Aggression, on unarmed hit, CON save or Stunned until end of next turn)
    - Weigh In (2 Aggression, on unarmed hit vs creature smaller/equal size, knock Prone and deal extra damage)
  - Kick Them While They're Down (13th level, L2537–2539): +PB damage on unarmed strikes against targets suffering
    detrimental conditions (Prone, Stunned, Restrained, Grappled, Incapacitated, Paralyzed, Unconscious).
  - Mountainbreaker (17th level, L2541–2546): 1/Long Rest pool. Modes: Flurry of Blows (Action, make 4 unarmed attacks)
    vs Knockout Blow (Action, single strike + CON save or Stunned for 1 minute).

## Marksman Subclasses: Anti-Air, Artilleryman, Besieger, Deadeye, and Flinger (0.6.0)

**Audit warning (2026-10-11):** This historical implementation block contains
incorrect Anti-Air summaries and unverified automation claims. The later
"Marksman, Anti-Air and Artilleryman audit" addendum records source corrections,
current code behavior and unresolved progression mappings. Neither this block's
standardization language nor the audit constitutes a new owner-approved ruling.

Source: C3:3521–3876 (Marksman), C3:3876–3950 (Anti-Air), C3:3968–4035 (Artilleryman), C3:4040–4100 (Besieger),
C3:4106–4160 (Deadeye), C3:4163–4295 (Flinger).
Implemented via `marksman-rules.mjs`, `marksman-features.mjs`, `marksman-setup.mjs`, `marksman-progression.mjs`,
`anti-air-features.mjs`, `artilleryman-features.mjs`, `besieger-features.mjs`, `deadeye-features.mjs`,
`flinger-features.mjs`, `marksman-sheet.mjs`, and `marksman-uses.mjs`.

- **Branch Progression Levels (E/F):**
  - Source L3596 states branches grant features at 1, 4, 10, and 15, but the class table (L3586)
    and all branch descriptions explicitly provide an 18th-level feature.
  - Standardized on levels 1, 4, 10, 15, and 18; L3596 is logged as a source omission.

- **Enhanced Target Lock Milestone (F):**
  - Class table L3579 lists Enhanced Target Lock at 11th level, while section heading L3670 lists 12th level.
  - Standardized to 11th level in `TARGET_LOCK_BONUS` and feature progression, adhering to the 5e Tier 3 threshold.

- **Target Lock Registry & Scope (E/F):**
  - Action-free declaration on own turn against a seen hostile Creature for 1 minute; provides +1 (+2 from 11th)
    bonus to Attack Rolls against the Target. 1 use per Short Rest.
  - Enhanced Target Lock restores 1 use upon rolling Initiative if exhausted.
  - Target Lock bonus feeds into Artilleryman Controlled Demolition (+bonus to Splash/Trap DC), Besieger
    Large Target (Advantage vs Large+ Target), and Flinger AP cost discount.

- **Fighting Styles (E/F):**
  - 8 styles: Braced for Action, Close and Personal, Cone of Fire, Deadly Fighter, Defensive,
    Ranger, Smooth Operator, and Two-Weapon Fighting.
  - Ranger provides +2 to ranged/thrown weapon attacks; Close and Personal suppresses 5-ft disadvantage;
    Deadly Fighter expands critical range on first attack per turn; Smooth Operator adds ability modifier
    to Rapid Fire bonus attacks.

- **Anti-Air Subclass (E/F):**
  - Pigeon Shooting (1st): Advantage on attack rolls against flying creatures or creatures that have moved 60+ ft this turn.
  - Versatile Approach (1st, PB/SR-LR): Four tactical stances/options:
    - Area Denial: 10-ft radius cylinder (10 ft high standard) delayed zone. Dex save vs Martial DC or 2d8 Bludgeoning damage and Prone.
    - Crowd Control: Target plus adjacent creature must make Dex save vs Martial DC or suffer half damage of the attack.
    - Stop their Approach: Ranged weapon hit reduces target Speed by 20 ft until start of Marksman's next turn.
    - Shoot to Kill: Successive damage instances vs Target Lock target deal escalating damage (+1d4, +1d6, +1d8, max +1d10).
  - Weight of Fire (4th): When making an attack with Advantage, can forgo advantage to make a second attack against the same target.
  - Shifting Focus (4th): When Target Lock target drops to 0 HP, Marksman can use Bonus Action to immediately transfer Target Lock to another visible hostile creature without spending a use.
  - Unapproachable (10th): Reaction attack when hostile enters within 30 ft, followed by moving up to half Speed away without provoking opportunity attacks. Does not consume reaction if triggered by Target Lock target.
  - Option Recharge (15th): Always Another Option restores 1 Versatile Approach option upon rolling Initiative if pool is 0.
  - The Last Option (18th, 1/LR): 1-minute stance. Once per turn, apply a Versatile Approach option without expending a pool use. When taking the Attack action, make one additional weapon attack.

- **Artilleryman Subclass (E/F):**
  - Tools of the Trade grants Grenade Launcher and Rocket Launcher proficiencies.
  - Controlled Demolition increases Splash(X) DC against Target Lock target by attack bonus.
  - Sharpened Shrapnel (10th) adds +2 Martial DC to Splash(X).
  - Explosive Expertise scales Thunder damage on Splash(X) weapons (+1d at 1st, +2d at 7th, +3d at 14th).
  - Delayed Detonation plants burrowed munition with Reaction trigger on movement or 10-minute timeout.
  - Secondary Detonation (PB/LR) triggers halved Thunder damage in 15-ft blast, with 0 damage on successful save.
  - Scatter Them (1/SR) flings creatures 30 ft away, dealing 4d8 Bludgeoning damage upon solid collision.
  - Explosive Dawn removes Loading from Grenade/Rocket Launchers, grants Thunder resistance, and grants
    immunity to self-inflicted Thunder damage.

- **Besieger Subclass (E/F):**
  - Siege Mode declared at start of turn: Speed 0 (cannot be increased), disadvantage on ranged attacks within 20 ft,
    +1d8 Damage (pre-18th), Crush(2×PB) added to ranged weapons, ignores Brace and long range disadvantage.
  - Additive Crush Stacking: L4048 explicitly specifies adding Crush values together (`Crush(existing + 2×PB)`).
  - Large Target: Advantage vs Target Lock target if Large+, and +1 additional weapon damage die vs Large+ creatures.
  - Deliberate, Efficient (4th): Single attack with Attack Action deals +1d8 Damage (pre-18th) and ignores
    Physical Resistances and Damage Reduction.
  - Siege Bolt (10th, 1/LR): 100 ft Dex save vs Martial DC, dealing 5d8 Piercing immediately, plus 5d8 Piercing
    at the end of next two turns on failed save (turn-start re-save to end early); ignores Piercing DR/Resistance.
  - Goliath's Bane (15th, PB/LR): On ranged hit in Siege Mode, forces Con save vs Martial DC or Stunned until
    end of next turn.
  - Godpiercer (18th): Replaces +1d8 damage bonuses of Siege Mode and Deliberate Efficient with 8 flat Hit Point loss
    per hit (16 HP loss if both apply), directly reducing HP and bypassing DR.

- **Deadeye Subclass (E/F):**
  - Deadshot (1st): Bonus Action toggle. Negates long range disadvantage, sets minimum damage die roll to 3, and adds double PB to attack roll. Ends upon attack or end of turn.
  - Target Shooting (1st): Expanded critical hit range against Target Lock target (+1 regular, +2 for Elite/Leader).
  - Target of Opportunity (4th): Declare Target Lock as a Bonus Action when rolling initiative or on own turn.
  - Vital Strike (4th): Once per turn when hitting with a ranged weapon from unseen/stealth or at long range, add +2d6 (scales to +3d6 at 10th, +4d6 at 15th) Piercing damage.
  - Anti-Sniper Training (10th): Ranged attacks ignore half cover and three-quarters cover. Entering Deadshot grants half cover until start of next turn if prone or braced.
  - Deathblow (15th): On ranged hit against creature with HP below Marksman level (or below 2x Marksman level for Elite/Leader), execute creature to 0 HP instantly. Triggers Killchain.
  - Killchain (15th): Immediate reaction attack upon executing a creature with Deathblow.
  - Nevermiss (18th): While in Deadshot, a d20 roll of 9 or lower on a ranged attack roll is treated as a 10.

- **Flinger Subclass (E/F):**
  - Bound Weapons Subsystem:
    - 10-minute binding ritual (or Bonus Action recall). Capacity: 1 weapon at 1st level, 2 at 5th level, 3 at 14th level.
    - Command Bound Weapons: Bonus Action to move bound weapons 30 ft and make melee/ranged spell attacks using Intelligence.
    - Aftershock (4th): Bound weapon hits deal +1d6 Thunder damage.
    - Pass-through Strike (15th): Moving bound weapons through creature space deals 2d8 Piercing damage (Dex save vs Spell DC).
  - Flinger Arts Casting & Points:
    - Scales per class table (`FLINGER_ARTS_POINTS`).
    - Caster standard Arts pools up to 4th level.
    - Self / Target Lock discount: 1 AP reduction (minimum 0 AP) when targeting self or locked target.
  - Kinetic Strike (10th, 1/LR): 100 ft Dex save vs Spell DC; deals 4d8 Bludgeoning damage per currently bound weapon.
  - Whirling Death (18th, 1/LR): 50-ft radius sphere storm centered within 100 ft lasting 3 turns. Deals 8d8 Slashing damage on entry or turn start (Dex save vs Spell DC).

- **Table Play & Verification (`marksmanUses` engine):**
  - Follows WORKFLOW.md §3.2 (Trust the table):
    - No turn-gating or GM approval required for player actions.
    - Unowned target condition changes (Stunned) and damage relay through the GM client automatically.
    - Warnings on resource exhaustion, level gates, or range limits never block; "Use anyway" clamps resource at 0
      and records shortfall on the public chat card.
    - Dice are never auto-rolled; chat cards provide interactive roll buttons.
    - All actions recorded with reversible receipts in `flags.ak5e.marksmanUses` with encounter-window undo support.


## Juggernaut, Protector and Sentry branches (2026-10-11)

**Authority:** Chapter 3 L1591–1623 (Juggernaut), L1628–1673 (Protector) and L1679–1722 (Sentry).

**Referenced sections:**
- Shelter (L991–994) and Leaping Defence (L1028).
- Chapter 4 shields and the Bastion property (L240–259).
- The Marksman Fighting Styles (L3615–3642).
- The earlier Taunted / Off Balance entry above, which this section keeps.

**Labels used below:**
- E: the explicit rule.
- F: the Foundry representation.
- M: the manual procedure.
- P: a proposed interpretation. Where several readings exist, they are offered per use until a GM ruling exists.

### Native damage modifiers (E/F, owner decision 2026-10-11)

Superheavy, Improved Taunt and Greater Improved Shelter are mandatory rules. `defender-damage-mods.mjs` applies them in D&D5e native damage application.

- The `dnd5e.calculateDamage` hook only recalculates the amount. Previews call it repeatedly, so it must not write anything.
- `dnd5e.preApplyDamage`, which runs once per application and only when Damage is applied, reserves a Barrier layer synchronously. A second application calculated before the first shatter is saved therefore cannot halve with the same layer (review fix).
- `dnd5e.applyDamage`, on the applying client, records the consequences:
  - A shatter is an undoable use.
  - A used-up Greater Improved Shelter or Punishment effect is only disabled; re-enabling it on the Effects tab restores it.
  - A public note shows each automatic change that posts no card of its own.
- `options.ignore === true` is honoured.
- **P:** only Damage applied from a chat card with a speaker counts. Hand-edited Hit Point bars and no-origin Damage are never changed.
- **P:** Resistance from these features halves only damage parts that the Actor does not already resist or is immune to. Resistance from two sources does not stack.
- **P:** halving uses D&D5e truncation.
- **DR order (P, review).** Chapter 1 L208 applies DR before Resistance, but DR stays a manual step everywhere in this module. Applying equipped DR automatically would change every Actor's damage and is a separate world-rule decision. The automatic halving therefore applies to the native amount. The shatter card and the public note state the DR-first rule (the reduced Damage halved, rounded down), so the table corrects HP by hand when it applies DR.

### Juggernaut

- **Superheavy, "another Creature" (P).** The speaker of the originating card must be a different Actor from the Juggernaut.
- **Superheavy, Heavy Armour (P).** Layers are suspended, not lost, while no Heavy Armour (`system.type.value === "heavy"`) is equipped. With none worn, nothing is halved.
- **Superheavy, recovery (P).** The source gives no rest recovery, only Reform, so layers recover only by reforming. Out of combat a table can reform freely.
- **Superheavy, small amounts (E/F).** A layer shatters even when halving leaves 0.
- **Shatterstorm (F).** The shatter card has a Roll button for 1d8 + CON Force. The player applies it with the native controls to Creatures of their choice within 10 feet.
- **Rolling Boulder (M).** D&D5e derives Speed from conditions during data preparation, so an effect cannot safely keep it. A panel reminder tells the table to ignore Speed reductions imposed by other Creatures or Conditions. Self-imposed effects such as Fortress Entrench are outside its wording.
- **Bullrush DC (P).** The DC is unstated. The Martial DC is used, as for Groundbreaker, and the card says so.
- **Bullrush movement (M).** The path, movement through Creatures and objects, and knockback are moved by hand.
- **Overwhelming Might (P).** "An additional die of Damage" means one more die of the size of the weapon's first damage die. It is added as a separate Force roll to melee attack activities while a layer holds.

### Protector

- **Bulwark Property (P).** L1644 names a "Bulwark Property" that Chapter 4 never defines. Anchor Point checks for an equipped Bastion shield (Defender Shield or Heavy Defender Shield). A missing one is a warning, never a block. In Shelter the player confirms it with the Anchor Point box, which is pre-checked when a Bastion shield is equipped.
- **Improved Shelter radius (F).** The Shelter state stores `radius: 10` when the box is checked by a level 4+ Protector.
- **Improved Shelter saves (P).** Advantage on STR and DEX saves is preselected for sheltered allies inside that radius. "Against effects you can see" is left to the player, who can change it in the roll dialog.
- **Impenetrable rounding (P).** No rounding is given. The rounding is a reading, down or up; up is offered because Stormchaser explicitly rounds up.
- **Impenetrable stacking (P).** "Not cumulative" means one Impenetrable per instance of Damage and Creature. Further uses warn.
- **Centre of Attention uses (P).** The uses equal the CON modifier, with a minimum of 0. The source gives no minimum.
- **Taunted, Off Balance and Punishment (F).** These are tracked effects built from fixed definitions on the applying client. The relay checks only which effects each use may create. Feature levels are warnings that "Use anyway" overrides, so the relay never checks them (review fix).
- **Taunt enforcement (M).** It is a reminder when a Taunted Creature attacks someone else. It never blocks.
- **Off Balance (F).** Off Balance gives native Advantage.
- **Punishment (F).** Punishment gives native Disadvantage on the Creature's next Attack Roll, then the effect is disabled.
- **Punishment triggers (F/M).** Hits apply Punishment automatically, and a later hit renews it. A failed save needs the panel use; Taunt and Stone Wall's failed-save uses include it.
- **Unending Defence (F).** It runs automatically at the end of the Protector's Turn and can be undone.
- **Greater Improved Shelter (F).** When a level 15 Protector declares Shelter, the sheltered allies get a GIS effect through the relay. It is disabled on their first applied instance of Damage, even one already resisted ("the first instance"), and expires at the Protector's next Turn start.
- **Improved Shelter sight (E).** L1648 says effects "you" can see, meaning the Protector; the save notice names the Protector.
- **Reaction refunds (F).** Undoing an Impenetrable or Advance and Fire refund spends the Reaction again; if none is left to spend, the undo says so.

### Sentry

- **Pavise marker (owner decision).** The marker is a 10-foot circle template; players may create one. A token the player or GM placed can be linked instead: any prop creature, which can be moved, targeted and re-imaged.
- **Pavise security (review fix).** The marker and the refund change only the Sentry's own documents. They are never applied through the GM relay; the engine refuses `local` target kinds. Only this Sentry's flagged circle templates are ever deleted or recreated.
- **Pavise geometry (P).** "Opposite side of the shield from that Creature's perspective" means the attacker is beyond the shield as seen from the target: (S − T) · (A − S) > 0, using token centres. The target must be within 10 feet of the shield and on the player's ally list, which always includes the Sentry.
- **Pavise, planted shield (P).** Whether the planted shield is still equipped is a reading. "Unequip" removes its AC and DR until it is recovered; undo and recovery restore it.
- **Half Cover (M).** Half Cover is applied by hand.
- **Advance and Fire (P).** It triggers on any Attack against the Sentry or a Creature benefitting from its Shelter or Pavise, Art attacks included.
- **Advance and Fire roll (F).** The player rolls the weapon's own attack.
- **Retributor (P).** It is tracked once per combat Round. Outside combat it warns.
- **Torrent of Lead, Wall of Steel (P).** It lasts until the second end of the Sentry's Turn after activation; outside combat it is ended from the panel. Its extra attack is an instruction on Advance and Fire cards.
- **Bar the Gates (F/M).** It is used after Leaping Defence and warns if none is recorded. Recovering first costs 1 Resilience.
- **Heads Down (M).** It is an instruction: the native save is not suppressed, and the table treats it as a success.
- **Marksman Training (F/M).**
  - Operator Skill access is unchanged (`operator-progression.mjs`).
  - The Fighting Style is chosen in Defender progression from the eight Marksman styles in the generated Chapter 3 content and granted as its feature Item. Its effect follows the Marksman automation where that exists, or its printed text.
- **Equipment Exchange (F).** It offers Light and Heavy Ranged Weapons without the Firearm property.

## Marksman, Anti-Air and Artilleryman audit (2026-10-11)

Audit-only record; no gameplay code, schema, pack or World change and **no new
source interpretation selected**. Full evidence, the 117-entry inventory and
pending rendered acceptance are in [MARKSMAN_AUDIT.md](MARKSMAN_AUDIT.md).
Confirmed code/mapping defects B-110–128 are tracked in `../bugs/fixed/`; outstanding
work and class/subclass cross-verification checkpoints are in `../TODO.md`.

| Question or mapping | Explicit source | Current representation and audit disposition |
| --- | --- | --- |
| Marksman branch feature at 18 | C3:3586 class table and the Anti-Air/Artilleryman headings C3:3939/4016 include 18; C3:3596 prose lists only 1/4/10/15. | Setup grants individual 18th-level features. Earlier decision row says unresolved; historical 0.6.0 block claims standardized. **Source conflict remains open; current implementation is recorded, not newly approved.** Preserve both texts/IDs. |
| Enhanced Target Lock unlock | C3:3579 table says 11; C3:3670 heading says 12. | Generated feature level is 12; setup, bonus and initiative hook use 11. The historical D&D tier rationale is not AK5e source authority. **No new default chosen.** A reviewed ruling/per-use representation is still needed. Initiative recovery's event-payload bug is separate from this conflict. |
| Martial DC ability | C1:211–212 says STR or DEX modifier, the character's choice. | `marksman-rules.mjs:177` takes the higher modifier without storing a choice. Record this implementation shortcut; expose the actual choice before claiming exact fidelity. |
| Close and Personal / other disadvantage | C3:3622 says the character does not have disadvantage on ranged attack rolls when a hostile Creature is within 5 feet. | Whether that removes unrelated disadvantage also needs a stated reading. Do not silently invent a cause filter. Independently, the hook fails to clear disadvantage when advantage is also true (B-119). |
| Target Lock replacement | C3:3648 permits selecting a seen hostile target for one minute, once per Short Rest; C3:3889 explicitly allows Anti-Air retarget on the target reaching 0 HP, for the remainder. | Preserve that explicit Anti-Air exception and the original expiry. General retarget permission remains an open question; the audit does not extend it. Current no-expiry and missing-trigger behavior is defective, not a source reading. |
| Area Denial height | C3:3909 gives a 10-foot-radius cylinder whose height reaches up to the chosen point. | The historical fixed 10-foot height is **not supported by the text**. Coordinate/origin mapping needs guided selection/manual confirmation, without imposing an invented height. |
| Artilleryman trap DC | C3:3976 increases trap/Splash DC versus the Target by the Target Lock bonus; C4:197–198 defines Splash's Dex save/Martial DC. | The text does not define a general base DC for every trap. Keep a trap's existing source/reviewed base DC; do not invent one or apply Sharpened Shrapnel's Splash-only +2 to every trap. |
| Last Maniac Standing / own delayed blasts | C3:4021 grants Thunder resistance and immunity to Thunder Damage dealt by the Artilleryman. | Retain source damage provenance for delayed/secondary blasts; exact native defense integration remains unverified. Do not infer an exclusion from the source or claim current immunity automation. |
| Artilleryman feature source identities | Generated records have `subclass-feature-marksman-artilleryman-*`; setup requests `class-feature-marksman-artilleryman-*`. | All six grants fall back to placeholder descriptions. This is a confirmed mapping bug (B-113), not an optional interpretation. Future repair must preserve customized Items/stable source identities. |

**Corrections to historical Anti-Air prose (source facts, not new mechanics):**

- Weight of Fire and Air Tracking/Shifting Focus are level 1 (C3:3879–3889);
  Versatile Approach is level 4 (3902). Weight of Fire is an advantaged ranged
  roll in the Attack Action, once each Turn, repeated against the same Creature.
- Pigeon Shooting uses actual lack of ground contact or 60 feet moved during
  the target's **last** Turn (3887), not merely a fly-speed trait/current Turn.
- Area Denial is **3d6 Piercing**, Dex save for half, flying-save disadvantage
  and failed-save Flying Speed halved until the target's next Turn ends (3909).
  It does not deal 2d8 Bludgeoning or impose Prone.
- Crowd Control repeats the ranged attack against another Creature within
  15 feet, dealing half damage (3911); it does not convert the attacks to saves.
- Stop their Approach has a **Wisdom save**, cumulative 20-foot reduction until
  the target's next Turn ends; at 15, success still reduces Speed by 10 feet
  (3913/3936). It does not end at the Marksman's next Turn start.
- Shoot to Kill adds **1d4 per damage instance** dealt to that Creature since
  the Marksman's last Turn, excluding this Option; at 15, each die becomes d6
  (3915/3937). It is not restricted to Target Lock or an escalating capped die.
- Unapproachable uses normal-range entry **or** movement within 30 feet,
  once per Creature until the Marksman's next Turn starts, with a free Reaction
  against its Target and optional half-Speed movement (3919–3921).
- Option Recharge restores one when **below maximum**, not only at zero
  (3931). Last Option lasts one minute with one free Option on each own Turn
  and an additional ranged weapon attack per Attack Action (3942–3945).

**Automation boundary:** printed descriptions are retained for all 35 Marksman
Skills, 42 Talents/modules and eight Fighting Styles. Shared SP/use/targeting
support does not implement every printed effect. Four style hooks exist;
Braced for Action, Cone of Fire, Defensive and Two-Weapon Fighting remain manual.
Marksman progression lists Talent/style/tool choices without applying them.
Unerring and Steel Rain currently track use costs and narrate resolution.
Anti-Air options and Artilleryman blasts largely narrate results, with no
complete native/save/roll/target operations. Historical claims of per-target
damage ledgers, buried props, automatic delayed triggers, complete defense
automation, interactive roll cards or reversible flag effects are not verified
and several are contradicted by the audit probes.

**Unresolved-reading interface:** no readings are registered by the audited
Marksman/core/Anti-Air/Artilleryman plans. The exported ruling function does not
by itself implement a choice for the above source conflicts. Future work must
distinguish an owner/GM-recorded source decision from a temporary player choice
under WORKFLOW §3.2; this audit does not set either.

**Evidence limit:** Codex static/Node audit with Luna mapping/progression and Sol
independent review; no Claude execution or rendered Foundry check. All 155
existing assertions pass, but full player confirm/cancel, relay/save-owner
controls, undo, failure recovery, two-client concurrency, imports and persistence
remain pending in the separate checklist. No automatic dice-start behavior was
found in these two branches; their mostly narrative cards also lack the required
owner roll/save controls. Manifest-declared release packs remain absent.

## Marksman Subclasses: Heavyshot, Hunter, and Spreadshot (2026-10-11)

**Authority:** Chapter 3 L4308–4388 (Heavyshot), L4393–4457 (Hunter), and L4472–4540 (Spreadshot).

**Referenced sections:**
- Marksman Core (L3521–3876): Target Lock, Martial DC, High Ground, Unerring.
- Chapter 4: Heavy Ranged Weapons (Heavy Crossbow), Spread weapon property, Loading property.
- Resource Pools & Undo engine (`resource-pools.mjs`, `play-undo.mjs`, `play-uses.mjs`).

**Labels:** E = explicit source rule, F = faithful Foundry representation, M = manual table procedure, P = proposed interpretation.

### Heavyshot (L4308–4388)

- **Weapon Tuning (Custom Job) (E/F):** Modifying a Heavy Ranged Weapon cuts its normal and long range in half (minimum 5 ft), grants Exploding Damage (dice rolling max explode up to PB extra dice), and grants Heaviest Shot (an extra damage die on weapons with the Loading property). Only the Marksman is proficient with the tuned weapon.
- **Loading Extra Die (P):** The extra damage die from Loading is added to the base damage roll formula rather than evaluated separately.
- **Exploding Dice & PB Cap (E/F):** Up to Proficiency Bonus extra dice can explode per attack damage roll.
- **Savage Shots (E/F):** Bonus Action to activate (PB / Long Rest). May reroll damage dice against the locked Target within Normal Range until the end of the Turn.
- **Devastator (E/F):** +1 Critical Hit range (e.g. 19–20) when attacking targets within normal range. On dropping a target to 0 HP, excess damage can be cleaved into a secondary target within range.
- **Heartseeker (E/F):** 1/Long Rest. The Marksman does not roll damage; each damage die automatically scores its maximum value on hit. Reversible via undo receipts.

### Hunter (L4393–4457)

- **Hunter Charges Pool (E/F):** 2 at 1st level, 4 at 7th level, 6 at 14th level. Recover on Short or Long Rest, or via an Action (or Bonus Action during Let the Light In).
- **Empowered Shots (E/F):** Ranged attack rider offering tactical shot options:
  - *Piercing Shot:* +1d8 Piercing damage (+2d8 Force at 15th level).
  - *Concussive Shot:* Martial DC STR Save or pushed 10 ft away (and speed halved at 15th level).
  - *Dazing Shot:* Martial DC CON Save or Dazed until end of next turn (and Blinded at 15th level).
  - *Fragmentation Shot:* Creatures within 10 ft take 1d8 Thunder damage (1d12 at 15th level).
  - *Seeking Shot:* +1d6 to Attack Roll (+2d4 at 15th level).
- **Locked Target Discount (E/F):** Attacking the locked Target reduces the charge cost by 1 (the first option is free).
- **Double Up (E/F):** At 4th level, multiple Empowered Shot options can be applied to a single attack, each costing 1 charge (minus 1 if attacking locked Target).
- **Energy Retention (E/F):** Speed increases by 10 ft per Charge expended this turn (manual movement tracker).
- **Railgun (E/F):** 1/Long Rest at 10th level. Fires a 100-foot line (5 ft wide) consuming 1 or more Hunter Charges. Each creature in line makes a DEX Save against Martial DC, taking 2d6 Force damage per charge spent (half on success).
- **Let the Light In (E/F):** 1/Long Rest at 18th level. 1-minute stance that immediately refills Hunter Charges and allows regaining expended charges as a Bonus Action.

### Spreadshot (L4472–4540)

- **Spread Property & Point Blank (E/F):** Point Blank is defined as less than 10 feet. Attacking at Point Blank provides Advantage on Attack Rolls and suppresses the 5-ft ranged disadvantage.
- **Native vs Gained Spread (P):** Native Spread weapons deal +1 additional weapon damage die at Point Blank.
- **Specialized Shell Inventory (E/F):** Crafting shells during Short Rest is capped at PB shells per rest, with a maximum inventory limit of 10 total shells held. Four types: Dragon's Breath, Flechette, Slug, Beanbag.
- **Chambered Queue (E/F):** Weapon holds up to 5 loaded shells in a FIFO queue (`flags.ak5e.marksman.loadedShells`).
- **Break Contact (E/F):** Reaction to a melee attack against the Marksman. The Marksman makes a half-damage ranged weapon attack with a Spread weapon. If no longer in reach, triggering attack misses automatically.
- **Gut Shot (E/F):** PB / Short Rest. On hit at Point Blank, deals +PB damage and knocks the target back 10 feet.
- **Both Barrels (E/F):** 1/Long Rest at 18th level. Unleashes both barrels consuming the lead chambered shell:
  - *Dragon's Breath:* 50-ft Cone, DEX Save vs Martial DC, 8d8 Fire damage & Burning.
  - *Flechette:* 50-ft Cone, DEX Save vs Martial DC, 8d8 Piercing damage & halved Speed.
  - *Slug:* Target within 60 ft, CON Save vs Martial DC, 5× weapon attack damage ignoring DR.
  - *Beanbag:* 50-ft Cone, DEX Save vs Martial DC, 8d8 Bludgeoning damage & Dazed (non-lethal).

## Guard Subclasses Batch 1: Duellist, Liberator, and Lord (0.6.0, 2026-10-12)

Authority: Chapter 3 L2739–2845 (Duellist), L2938–3039 (Liberator), L3013–3248 (Lord); referenced Chapter 1 (Martial DC L211, conditions, DR, Elites and Leaders), Chapter 4 (Equipment, Greatswords, Polearms), Chapter 5 (Arts Pools, Operator Skills).

- **Duellist Subclass (E/F):**
  - Identification & Weapons (L2739–2745): `isDuellist(actor)` validates Guard class and `duellist` branch. Duelling Blades grants the Finesse property to Greatswords and Polearms via `dnd5e.preRollAttack` hook, enabling Dexterity-based attack and damage rolls with two-handed heavy/reach weapons.
  - Rules of Engagement & Points Ledger (L2748–2769): Bonus Action Opponent declaration against a seen creature within 30 ft. Tracks `duellistPoints` pool (0–10 max). Points gain: +1 on declaration (+2 at 10th level), +1 at combat turn start if the opponent was damaged since the Duellist's last turn (+2 at 10th level), +1 at combat turn start if the Duellist was not damaged by the opponent since last turn (+2 at 10th level), and +1 when hitting the opponent with a non-heavy weapon (once per turn). Points reset to 0 if 1 minute passes without either combatant damaging the other or if the opponent drops to 0 HP / surrenders (prior to 17th level).
  - Parry & Riposte (L2770–2782): Parry reduces the reaction cost of the first Forestall used in each combat round to 0 and reduces its Aggression cost by 1 (minimum 0). Riposte (Press the Attack rider): when a hostile creature misses the Duellist with a melee attack, spend 1 Aggression as a Reaction to make an Opportunity Attack against the attacker.
  - Principles of Defence (4th level, L2783–2795): Every Victory grants +1 Aggression when the opponent dies or surrenders. Lightning Reflexes: spend 1 Aggression as a Reaction when subjected to an effect seen by the Duellist that allows a Dexterity saving throw to make the save. Punish Every Opening: if that Dexterity save succeeds, the Duellist can immediately make an Opportunity Attack without expending their reaction.
  - Engagements (9 options, L2796–2829): Tactical combat options consuming Duellist Points, usable once per turn:
    - *Analysis* (0 pts): Learn opponent AC, remaining HP percentage, and damage vulnerabilities/resistances.
    - *Balestra* (2 pts): Leap 10 ft toward opponent without provoking AoO, gaining Advantage on next melee attack.
    - *Derobement* (1 pt): Reaction when opponent declares melee attack; attacker suffers Disadvantage.
    - *Displacement* (1 pt): On melee hit, swap positions with opponent or push opponent 5 ft if size Large or smaller.
    - *En Garde* (1 pt): Bonus Action to enter defensive stance; +2 AC against opponent until start of next turn.
    - *Feint* (1 pt): Bonus Action; opponent makes Wisdom save vs Martial DC or Duellist gains Advantage on attacks this turn.
    - *Fleche* (2 pts): Move up to full Speed in a straight line toward opponent; melee hit deals +2d8 Slashing/Piercing damage.
    - *Redoublement* (1 pt): When missing opponent with a melee attack, immediately reroll the attack roll.
    - *Score* (1 pt): On melee hit against opponent, add +PB Slashing/Piercing damage to the damage roll.
  - Grand Challenge (13th level, L2830–2841): 1/Long Rest Action declaring Grand Challenge on Opponent for 1 minute:
    - Corps à Corps: when Opponent makes an attack against anyone other than the Duellist, the Duellist can make an Opportunity Attack against the Opponent.
    - Displacement: Duellist gains Resistance to all damage originating from creatures other than the Opponent.
    - Coup de Grâce: on a melee hit against Opponent while holding 10 Duellist Points, expend all 10 points to deal 8d8 Slashing or Piercing damage that cannot be reduced by Damage Reduction or Resistance.
  - Master Duellist (17th level, L2842–2845): Declaring an Opponent requires no action (free on own turn or upon rolling Initiative). When the Opponent drops to 0 HP or surrenders, the Duellist retains all accumulated Duellist Points and can immediately declare a new Opponent.

- **Liberator Subclass (E/F):**
  - Identification & Liberty Pool (L2938–2944): `isLiberator(actor)` validates Guard class and `liberator` branch. Manages `liberty` pool (0–6 max). In-combat generation: if the Liberator takes no Attack action, casts no Arts/spells, and activates no Operator Skills on their turn, they gain 1 Liberty (2 at 17th level via Time to Act) at turn end.
  - Guide the Masses (L2945–2963): Action (Bonus Action at 7th level, free action at 17th level via Champion of the Worthy) targeting a visible ally within 20 ft (40 ft at 10th level); generates 1 Liberty (2 with Time to Act):
    - *Advocate:* Ally regains Hit Points equal to max(2×PB, 2×Liberty) or receives that amount as bonus healing on their next heal.
    - *Empower:* Ally gains Damage Reduction equal to max(PB, Liberty) against all damage until start of Liberator's next turn.
    - *Uplift:* Ally adds max(PB, Liberty) bonus damage to their next successful weapon or Art attack.
  - Righteous Outburst (L2964–2984):
    - Flash of Anger: On a melee hit, expend 1 to current Liberty. Adds +1d6 (+1d10 at 10th level) bonus damage per Liberty spent. Damage does not multiply on critical hits. If the attack reduces the target to 0 HP, refund 1 spent Liberty. At 13th level (Caught in the Crossfire), damage type becomes Force (or active Operator Skill damage type) and splashes the full bonus damage to all hostile creatures within 10 ft of the target.
    - The Right Moment: When activating an Operator Skill, expend all available Liberty to add +1d8 damage per Liberty consumed to the skill's damage effects.
  - Rising Tide (4th level, L2985–2994): Operator Skills are treated as simultaneously possessing Automatic, Offensive, and Defensive charging methods, gaining SP charge from all three triggers.
  - Praxis (10th level, L2995–3002): Press the Attack: Face Me. Spends 2 Aggression as a Bonus Action to cast Compelled Duel without spell slots, using Martial DC as the save DC.
  - Révolution (17th level, L3003–3039): 1/Long Rest Action unleashes a 20-ft radius revolutionary burst. All hostile creatures must make a Dexterity save vs Martial DC, taking 1d12 Force damage per point of Liberty consumed (half on success). Triggers 10-minute benefits:
    - Champion of the Worthy: Guide the Masses requires no action (free once per turn).
    - Shield of Belief: Liberator gains Temporary HP equal to their Guard level at the start of each of their turns.
    - Time to Act: Whenever Liberty is gained or refunded, gain +1 additional Liberty (subject to 6 max).

- **Lord Subclass (E/F):**
  - Identification & Authority State (L3013–3139): `isLord(actor)` validates Guard class and `lord` branch. Tracks Authority state flag (`flags.ak5e.lord.hasAuthority`). While holding Authority, the Lord gains 1d8 Temporary HP at the start of each of their turns, and gains Overruled: can make Intelligence, Wisdom, and Charisma saving throws against ongoing afflictions at both the start and end of their turn.
  - Authority Acquisition & Loss Triggers (L3122–3139):
    - Gain Authority when: reducing an Elite or Leader creature to 0 HP that the Lord damaged since their last turn; reducing 2 or more hostile creatures to 0 HP in a single turn; or killing a hostile creature from full HP in a single strike.
    - Lose Authority when: reduced to 0 HP; failing a saving throw at the end of their turn; knocked Prone at the end of their turn; or rolling Initiative (start of combat reset).
    - Press the Attack: Manifest Destiny: When a loss trigger occurs, spend 3 Aggression as a Reaction to retain Authority.
  - Manifest Will (L3140–3164): `manifestation` pool (`@prof` uses, Long Rest recovery). Bonus Action to activate for 1 minute:
    - Melee weapons gain Range 30/- (can be thrown or project force up to 30 ft).
    - Uses Strength modifier for attack and damage rolls of ranged attacks made with Manifested weapons.
    - Attacks deal additional Force damage equal to the Lord's Charisma modifier.
    - Will Attunement: 10-minute ritual allows changing the Manifestation and Force of Will damage type to any damage type associated with the Lord's active Operator Skills.
    - Authority Marks: When holding Authority, hitting a creature marks them with a Melee or Ranged Mark. An attack of the opposite type against a marked creature deals +1d6 bonus damage and consumes the mark. At 17th level (Divine Right), this bonus damage splashes to all hostile creatures within 10 ft.
  - King's Domain (4th level, L3165–3189): Selected when activating Manifest Will:
    - *Castle Doctrine:* Creates a 15-ft radius domain around the Lord. Reaction when an enemy moves within or enters the zone: move up to half Speed toward the creature and make a melee attack. Hitting a non-elite creature refunds the Reaction. With Authority active, the enemy's Speed is halved (reduced to 0 on failed Wisdom save vs Martial DC at 17th level).
    - *Pursuit of Power:* Hitting an enemy allows the Lord to move their full Speed without provoking Opportunity Attacks and doubles their jump distance. With Authority active, this movement benefit can trigger multiple times per turn. At 17th level, moving adjacent to enemies deals passive Charisma modifier damage to each.
  - By Lordly Decree (10th level, L3190–3211):
    - Make It So: Spend 1 Manifestation use when making any d20 roll (attack roll, ability check, or saving throw) to add Charisma modifier + Proficiency Bonus (or Charisma modifier + 2×PB Expertise bonus while holding Authority) to the roll. At 17th level, if the roll still fails, reroll once.
    - Press the Attack: A Leader Leads: Spend 1 or more Aggression to grant Special Inspiration (bonus d6/d8 on d20 roll) to allies within 30 ft.
  - Force of Will (13th level, L3212–3234): PB uses per Long Rest, usable once per turn when taking the Attack action, categorized into 3 elemental groups:
    - *Group 1 (Fire, Psychic, Force, Thunder):* 10-ft radius burst centered on Lord, 3d6 damage (Dexterity save vs Martial DC for half).
    - *Group 2 (Bludgeoning, Piercing, Slashing, Radiant):* 50-ft line (5 ft wide), 8d6 damage (Dexterity save vs Martial DC for half).
    - *Group 3 (Acid, Cold, Lightning, Necrotic, Poison):* Melee weapon attack rider, 6d6 damage on hit (Constitution save vs Martial DC or afflicted with condition/half damage).
  - Divine Right (17th level, L3235–3248): Capstone augmenting Authority Marks (10-ft splash damage), Castle Doctrine (WIS save vs Martial DC to reduce Speed to 0), Pursuit of Power (passive CHA aura damage on adjacent move), and Make It So (reroll on failure).

- **Table Play & Philosophy Compliance (WORKFLOW §3.2):**
  - All uses register in `guardUses` in `ak5e/scripts/guard-uses.mjs` via `createPlayUses`.
  - Confirm dialogs precede all expenditures; cancelling leaves actor state completely unchanged.
  - Ability checks and saving throws (Overruled saves, Make It So) require no confirmation prompt.
  - No dice are auto-rolled: roll buttons are rendered on chat cards for user execution.
  - Resource shortfalls warn but do not hard-block; "Use anyway" clamps resource spend at 0 and reports shortfall publicly on the chat card.
  - Modifications to unowned targets (Marks, Advocate healing, Empower DR, Uplift bonus) relay automatically through the GM client.
  - Every action writes an undo receipt under `flags.ak5e.guardUses.undo`, supporting full encounter-window undo and restoration.

## Guard Subclasses Batch 2: Musha, Reaper, and Weaponmaster (0.6.0, 2026-10-12)

Authority: Chapter 3 L3252–3325 (Musha), L3326–3450 (Reaper), L3451–3515 (Weaponmaster); referenced Chapter 1 (Martial DC L211, conditions, damage reduction, resistances), Chapter 4 (Weapons, Versatile, Heavy, Two-Handed), Chapter 5 (Operator Skills, Skill Points).

- **Musha Subclass (E/F):**
  - Identification & Tenacity (L3252–3270): `isMusha(actor)` validates Guard class and `musha` branch.
    - Nothing to Lose: When at or below 50% HP, the Musha can make 1 additional melee weapon attack when taking the Attack action; at or below 10% HP, this increases to 2 additional melee weapon attacks.
    - Soloblade: On a successful melee weapon hit, the Musha regains HP by rolling 2d6 (scaling to 2d8 at 7th level, and 2d10 at 14th level). Per L3287, Soloblade healing is explicitly forbidden on attacks made as part of a Blood Price action. Chat cards render interactive roll buttons; dice are never auto-rolled.
    - Stand Alone: Healing received from sources other than the Musha's own features (such as ally spells or potions) does not restore HP directly, but instead grants Temporary HP equal to the healing rolled.
  - Enduring Resolve (L3271–3278): Musha gains proficiency in Wisdom saving throws.
    - Not Yet: When reduced to 0 HP, the Musha makes a Wisdom saving throw (DC starts at 10). On a success, the Musha does not fall unconscious and instead remains standing with Hit Points equal to 2×PB. Each successive use in combat increases the DC by 5 (10 -> 15 -> 20 -> 25...).
    - Reset: DC resets to 10 on a Long Rest, or immediately upon reaching maximum HP at 17th level via To Laugh at Death (`mushaResetNotYet`).
  - Blood Price (4th level, L3279–3300): Bonus Action causing the Musha to take 2d8 unreducible self-damage (cannot be prevented, resisted, or absorbed by Temporary HP). Supports 4 tactical options:
    - *Center Oneself:* Immediately ends or suppresses one condition currently afflicting the Musha.
    - *Dig Deep:* The Musha gains Skill Points (SP) equal to the exact HP lost.
    - *Iai:* The Musha moves up to their Speed in a straight line without provoking Opportunity Attacks and makes a melee weapon attack; on hit, deals bonus damage equal to half the HP lost.
    - *Ichimonji:* The Musha makes a single devastating melee attack; on hit, deals bonus damage equal to the full HP lost and imposes the Off Balance condition on the target.
    - Greater Blood Price (13th level, L3310): Self-damage escalates to 4d8 unpreventable HP, scaling bonus damage and SP gains accordingly.
  - Warrior Spirit (10th level, L3301–3309):
    - Go Forth: Reaction when a hostile creature ends its turn within 30 ft: move up to half Speed toward the creature without provoking Opportunity Attacks.
    - Retaliator: Press the Attack rider: spend 2 Aggression to make an immediate melee attack or execute an Iai strike.
  - Found Alongside Death (13th level, L3310–3319):
    - Living on the Edge: When at or below 50% HP, gain a bonus to AC and saving throws equal to ceil(PB / 2); when at or below 10% HP, this bonus increases to full PB.
  - To Laugh at Death (17th level, L3320–3325): The Musha cannot be killed outright by massive damage; surviving any drop to 0 HP resets Not Yet DC to 10 once at full HP.

- **Reaper Subclass (E/F):**
  - Identification & Ruin Pool (L3326–3360): `isReaper(actor)` validates Guard class and `reaper` branch. Tracks `reaperRuin` resource pool (0–10 max).
    - Ruin Gain & Decay: Gain +1 Ruin on a melee critical hit or when reducing a hostile creature to 0 HP (+2 for Elite/Leader). At the end of each turn in combat, if the Reaper dealt no damage to a hostile creature, 1 Ruin decays.
    - Press the Attack: Lingering Violence: Spend 1 Aggression at turn end to prevent 1 Ruin decay.
  - Reaper Table Inverse Scaling (L3361–3387):
    - Low Ruin favors Reap: +10 crit range at Ruin 0 (crit threshold 10+), scaling down by 1 per Ruin to +0 at Ruin 10 (crit threshold 20).
    - High Ruin favors Curtainfall: +0 crit range at Ruin 0 (crit 20), scaling up by 1 per Ruin to +10 at Ruin 10 (crit threshold 10+).
    - Healing Penalty: Healing received is penalized by −2 per Ruin (0 penalty at Ruin 0, down to −20 at Ruin 10).
    - Unlocked Passives: Advantage on Intimidation at Ruin 3+; +10 ft Speed at Ruin 6+; Resistance to Necrotic and Cold damage at Ruin 9+.
  - Death's Design (L3388–3410):
    - *Reap:* Replaces the Attack action. 15-ft cone (cleaving cone; upgrades to 10-ft sphere centered on self at 13th level with Master of the Scythe). Targets make a Dexterity save vs Martial DC. On a failed save, targets take half weapon damage (full damage at 13th level via Reaper Prime); 0 damage on a success. Crits apply Vulnerability to the damage to non-elites.
    - *Curtainfall:* Replaces the Attack action. Single-target melee attack dealing +1d6 bonus damage per Ruin currently held. Upon dealing damage, all Ruin is expended. Critical hits ignore Physical Damage Resistance.
  - Death's Due (4th level, L3411–3418): Reap and Curtainfall crits unlock additional riders (Vulnerability and DR bypass).
  - Fear the Reaper (10th level, L3419–3429): 1/Long Rest Action marking a hostile creature within 60 ft for 1 hour. The Reaper senses the target's exact direction, sees through its invisibility, and deals 1d6 Psychic damage to it whenever gaining Ruin.
  - Master of the Scythe (13th level, L3430–3439): Reap can be unleashed as a 10-ft sphere, and failed saves take full damage.
  - Memento Mori (17th level, L3440–3450): When Curtainfall or Reap crits, choose between inflicting Vulnerability + DR bypass, or dealing a 10-ft splash of 1d6 Psychic damage to secondary hostile creatures.

- **Weaponmaster Subclass (E/F):**
  - Identification & Martial Mastery (L3451–3485): `isWeaponmaster(actor)` validates Guard class and `weaponmaster` branch.
    - Martial Mastery Table: Resolves 6 weapon properties based on weapon baseItem and category:
      - *Can Opener:* +1d6 damage against creatures with Physical Damage Reduction.
      - *Cornering:* Hitting reduces target Speed by 5 ft until end of its next turn.
      - *Drive:* Hitting pushes target 10 ft straight away; Weaponmaster can advance 10 ft without provoking AoO.
      - *Executioner:* +2d6 damage against Prone, Stunned, or Incapacitated targets.
      - *Flourish:* Once per turn on a missed melee attack, make a secondary flourish dealing 1d6 damage.
      - *Lethality:* +1d6 damage against creatures with no Physical Damage Reduction.
  - Judgement Cut (4th level, L3486–3490): 1/Short Rest Bonus Action on melee hit: mark target for 2 turns or until weapon is stowed. Tracks accumulated weapon damage dealt to that creature. When detonated or mark ends, deals Slashing damage equal to half the accumulated damage.
  - A Master's Weapon (10th level, L3491–3495):
    - Designate Signature Weapon: Long Rest training designates one weapon in possession as the Signature Weapon, granting +1 bonus to attack and damage rolls made with it.
    - Every Part of the Weapon: Bonus Action to shift grip on Signature Weapon, replacing its Martial Mastery property with any of the 6 table properties until the end of the turn.
  - Untouchable (13th level, L3496–3502): 2/Long Rest Reaction when an enemy in reach makes an attack against the Weaponmaster: make an immediate melee attack. If the attack deals damage, the enemy's attack automatically misses.
  - Song of Steel (17th level, L3503–3515): 1/Long Rest Bonus Action activating a 1-minute battle stance: +1 Critical Range on weapon attacks, critical hits ignore Physical Damage Resistance, and attack rolls made with the Signature Weapon have Advantage.

- **Table Play & Philosophy Compliance (WORKFLOW §3.2):**
  - All uses register in `guardUses` in `ak5e/scripts/guard-uses.mjs`.
  - Confirmation precedes all actions; cancelling changes nothing.
  - No dice are auto-rolled: Soloblade healing, Curtainfall Ruin dice, Judgement Cut detonation, and Blood Price self-damage render manual roll buttons on chat cards.
  - Resource shortfalls warn and allow "Use anyway", clamping at 0 and posting shortfalls publicly.
  - All modifications record undo receipts in `flags.ak5e.guardUses.undo`, supporting full encounter-window undo and state recovery.

## Guard Base Class and Subclasses Leftover Rulings (0.6.0, 2026-10-12)

The following 15 rulings resolve ambiguities and align mechanics across Chapter 3 and `TODO.md` (lines 644–759):

### 1. Guard Base Class
- **"Push the Advantage" vs "Press the Attack" vs "Push the Attack" (L1793, L1874, L3342):**
  - Source text uses "Push the Advantage" in the class table (L1793), "Press the Attack" in the feature header (L1874), and "Push the Attack" in Reaper (L3342).
  - *Ruling:* All are verified stylistic variations for the same core mechanic. Implemented canonically under "Press the Attack" powered by the Aggression pool.
- **Pursuit Unrelenting Off-Turn Action Timing (L1933):**
  - Source text: "When you would use your Unrelenting Feature, you may expend an additional use of it to take an Action or Bonus Action in place of the Attack you would normally make."
  - *Ruling:* Since Unrelenting triggers as a Reaction when another creature ends its turn, Pursuit Unrelenting permits taking an Action or Bonus Action off-turn during that reaction window.
- **Spearwall Bonus Damage Die Size (L1862):**
  - Source text: "When you make a Melee Attack while it is not your Turn, that Attack deals an additional dice of Damage."
  - *Ruling:* The additional damage die matches the weapon's base damage die formula (e.g. 1d8 for a longsword, 1d10 for a pike/halberd).
- **Fighting Style "Brawler" vs Subclass "Brawler" Name Collision (L1840 vs L2423):**
  - *Ruling:* Guard Fighting Style "Brawler" grants a Bonus Action Unarmed Strike. Subclass "Brawler" provides unarmored AC, unarmed damage die scaling (d4 -> d8), and Brawler Techniques. Both are distinct, valid, and fully stack.
- **"Grit" Definition Scope (L1177, L4832, L5479, L8199):**
  - Source text mentions "Grit" only in the cross-class talent "Hidden Technique" (Defender, Specialist, Supporter, Vanguard), granting 2 Grit Points to learn Brawler techniques.
  - *Ruling:* In the Guard class, Brawler Techniques natively consume Aggression (1 Aggression per technique). Non-Guard classes taking Hidden Technique track their own Grit Points; Guard Brawlers use their class Aggression pool.
- **Fortitude Ally Healing Roll Bonus (L2114):**
  - Source text: "When another Creature rolls to cause you to regain Hit Points, they roll 1 additional dice; you recover additional Hit Points equal to the result of this dice."
  - *Ruling:* Allies rolling healing for the Guard add 1 extra die to their roll (2 extra dice with the Module upgrade). Self-healing is unaffected.

### 2. Musha Subclass
- **Greater Blood Price Scaling (L3308):**
  - Source text: "When you use your Blood Price Feature, you may choose to lose twice as many Hit Points instead."
  - *Ruling:* Since Dig Deep, Iai, and Ichimonji scale directly with "the Hit Points you lost/expended to use this Action", taking 4d8 self-damage doubles the SP gained from Dig Deep and doubles the bonus damage from Iai and Ichimonji.
- **Not Yet vs Outright Kill & Dying (L3271, L3316):**
  - *Ruling:* At 1st level, Not Yet triggers only when reduced to 0 HP but not killed outright by massive damage. At 17th level (To Laugh at Death), Not Yet explicitly functions against outright kill effects as long as the body is not destroyed.
- **Stand Alone External Healing Redirection (L3262):**
  - *Ruling:* Any healing originating from outside the Musha (e.g. ally spells, potions administered by others) is intercepted in `dnd5e.preApplyDamage` and converted into Temporary Hit Points (`system.attributes.hp.temp`). Musha self-healing (such as Soloblade) heals real HP as normal.

### 3. Reaper Subclass
- **Crit-Range Column Semantics ("+10 Critical Range", L3350):**
  - *Ruling:* In the Reaper Table, the critical range columns represent the bonus that expands the critical hit range downwards from 20 (threshold = `20 - bonus`). At Ruin 0, Reap gets +10 Critical Range (crit threshold 10+), while Curtainfall gets +0 (crit threshold 20). At Ruin 10, Curtainfall gets +10 Critical Range (crit threshold 10+), while Reap gets +0 (crit threshold 20).
- **Healing-Penalty Floor (L3340, L3361):**
  - *Ruling:* The Reaper Table healing penalty (-2 per Ruin, up to -20 at Ruin 10) reduces external healing received down to a minimum of 0 net healing. It never inverts healing into damage.
- **"Deathmark" vs "Reaper's Mark" (L3417):**
  - *Ruling:* In Fear the Reaper (10th level), source text refers to "Reaper's Mark" in the first two sentences and "Deathmark" in the last. These are confirmed source synonyms for the same 1/Long Rest feature.
- **Reap Save vs Critical Hit Check (L3388, L3396):**
  - *Ruling:* Reap is an area cleave requiring a DEX save against Martial DC. At level 4+, a separate d20 attack check is rolled to determine whether the strike critically hits (inflicting Vulnerability to non-elites).
- **Reaper and Swarms / Hordes (L3405–3408):**
  - *Ruling:* The maximum HP of a single unit composing the Swarm is the threshold for earning 1 kill/Ruin. Single damage instances dealing multiples of that threshold earn multiple kills (`Math.floor(damage / unitMaxHp)`).

### 4. Weaponmaster Subclass
- **Art of War Proficiencies & Extra Fighting Style (L3440–3444):**
  - *Ruling:* Weaponmaster gains proficiency in all Light Ranged and Heavy Ranged weapons on subclass selection. Additionally, the extra Fighting Style can be selected from either Guard or Marksman styles, and can be exchanged on any Long Rest via `weaponmasterSwapFightingStyle`.
- **Martial Mastery "Additional Effect" Pool (L3493):**
  - *Ruling:* Every Part of the Weapon allows switching the Signature Weapon's Martial Mastery property to any of the 6 table properties (Can Opener, Cornering, Drive, Executioner, Flourish, Lethality) until end of turn.
- **Judgement Cut Duration & Timing (L3487):**
  - *Ruling:* The mark lasts for 2 turns or until ended early during the Weaponmaster's turn by stowing a weapon. Detonation inflicts Slashing damage equal to half of all accumulated weapon damage dealt during that window.
- **Untouchable "Automatically Misses" (L3496):**
  - *Ruling:* As a Reaction when attacked in reach, the Weaponmaster attacks first. If this reaction attack deals at least 1 damage, the attacking creature's attack automatically misses, overriding any hit roll.




## SI-2 resource-pool kernel

- **Recovery precedence across triggers (B-022):**
  - *Ruling:* When a call carries several triggers (a long rest is `['lr','sr']`), the pool applies one recovery entry, chosen by the caller's trigger order and not by the order the pool lists them: an `lr` entry beats an `sr` entry on a long rest. Within one trigger the first entry whose `when` passes applies; if none passes, the next trigger is tried. This is a code-level convention, not a source-book rule.

## Medic Class and Subclasses (Physician, Triage)

### 1. Medic Chassis & Rules Calculations
- **Armor Proficiencies (Ch. 3 L4588):**
  - Source text: "Armor: Light Shields". Medics have NO light, medium, or heavy armor proficiencies. Armor proficiency is strictly Light Shields only (`["shl"]`).
  - *Ruling:* In `medic-rules.mjs` and progression, `MEDIC_ARMOR_PROFS = ["shl"]`. Any attempt to equip light, medium, or heavy armor is treated as non-proficient.
- **Life Support Formula & Pool (Ch. 3 L4620–4648):**
  - Source table progression matches exact closed formula: `20 + 15 * floor(Level / 2)`.
  - Registered under `lifeSupport` with `overMax: true`, `initial: "max"`, `recovery: [{ on: "lr", amount: "toMax" }]` (replenishes to maximum on Long Rest, dropping any excess overMax; Short Rest has 0 recovery).
- **Construct Healing Restriction (Ch. 1 L138):**
  - Source rule: Constructs cannot regain HP from class features or Healing Arts.
  - *Ruling:* In `medic-uses.mjs`, targeting a Construct emits a non-blocking warning citing Ch. 1 L138, which can be overridden with "Use anyway" per WORKFLOW §3.2 table trust.
- **Medical Expertise (Ch. 3 L4658):**
  - Source text: "Your proficiency bonus is doubled for any ability check you make using the Medical Skill."
  - *Ruling:* Implemented canonically as Expertise in Medicine (`system.skills.med.value = 2`).

### 2. Physician Subclass
- **Intravenous Line Unwilling Save Target (Ch. 3 L4878–4890):**
  - Source text: Unwilling target makes CON save vs Spell DC.
  - *Ruling:* On a successful save, target resists tuning but takes 2d8 Necrotic damage. On a failed save, target becomes Tuned to the Medic for 10 minutes.
- **Hypocritic Oath Heal-to-Harm Toggle (Ch. 3 L4891–4898):**
  - Source text: "Whenever you roll to cause a Creature to regain Hit Points, you can instead force that Creature to make a Constitution saving throw... on a failed save, it takes Necrotic damage equal to the total... On a successful save, it takes half as much damage."
  - *Ruling:* Target takes full damage on fail, half on pass. Explicitly counts as restoring HP for feature triggers.
- **Inpatient Care / Healing Reverberations (Ch. 3 L4899–4905):**
  - *Ruling:* Reaction, 15 LS. At the start of the Medic's next turn, target regains `max(floor(healed / 2), 15)` HP.
- **Surgeon-General (Ch. 3 L4906–4910):**
  - *Ruling:* Doubles the total HP restored to a single creature via Life Support, Art, or Operator Skill.

### 3. Triage Subclass
- **Stop the Flow Mettle Extension (Ch. 3 L5031–5040):**
  - Source rule: Target must be Dying (0 HP). Immediately grants 6 Mettle, bypassing the normal 6-mettle cap up to a hard cap of 8. Target cannot receive Stop the Flow again until no longer Dying.
  - *Ruling:* Validated against `flags.ak5e.dying.mettle` and `stopTheFlowReceived`. Clamped at 8 Mettle.
- **Touch of Life and Death (Ch. 3 L5041–5045):**
  - *Ruling:* 10 LS rider on On the Scene. Healed targets end one condition with duration <= 1 hr (pauses if > 1 hr); harmed targets gain the Poisoned condition until start of Medic's next turn.
- **Mobile Hospital Aura (Ch. 3 L5046–5050):**
  - *Ruling:* 1/Long Rest Bonus Action establishing a 30-ft aura for 1 minute. Entering the aura heals `3d6 + mod` HP (once/round per creature, resetting at Medic's turn start).

### 4. Table Play, GM Relay, UI Badges & Undo Integrity
- **Focused Treatment Multi-Target / Flat Roll Evaluation (Ch. 3 L4875):**
  - *Ruling:* Focused Treatment applies exclusively to rolls affecting a single creature. When invoked on multi-target rolls or non-rolled flat amounts, it yields a bonus of 0 without raising an unoverridden warning error, allowing seamless macro/formula resolution.
- **Surgeon-General Touch Heal Ratio (Ch. 3 L4898–4899):**
  - *Ruling:* For a 15th-level Physician, single-target Touch Heal restores 2 Hit Points per 1 Life Support expended (1:2 ratio). 20 LS restores 40 HP (clamped at patient max HP). On undo, the exact prior HP value is restored.
- **GM Relay Validation on All Target Plans (WORKFLOW §3.2):**
  - *Ruling:* All 9 target-mutating plans (`touchHeal`, `resuscitation`, `stopTheFlow`, `intravenousLine`, `hypocriticOath`, `inpatientCare`, `onTheScene`, `urgentCareCentre`, `mobileHospital`) attach `validateTarget(source, receipt, entry, targetDoc)` directly to the plan functions on `MEDIC_PLANS`. This satisfies `play-uses.mjs:207` which checks `PLANS[receipt.command]?.validateTarget`, ensuring unowned ally mutations are relayed through the GM client without throwing validation errors. Non-target plans return `false`.
- **AOE and Rider Target Resolution:**
  - *Ruling:* `onTheScene`, `urgentCareCentre`, and `mobileHospital` resolve targeted actor documents from `data.targetUuids`, `data.targets`, or `data.targetUuid` and populate `receipt.targets` so that targeted creatures receive heal/damage mutations and changes relay automatically when unowned.
- **Intravenous Line World Time Expiry:**
  - *Ruling:* Intravenous Line tuning records `worldTimeExpires: game.time.worldTime + 600` in addition to real-time `expiresAt`, allowing `ActorSheetV2` badges to reflect tuning expiration when game world time is advanced.
- **Features Tab UI Badges:**
  - *Ruling:* The Features tab panel injects `.ak5e-medic-badges` containing distinct `.ak5e-medic-badge` pill elements displaying current Life Support (`value / max`), Spell Save DC, active Subclass name, and Intravenous Line tuning status (with fallback if pool is not yet initialized).

## Executor Specialist Subclass (Hunter, Bodyguard)

### 1. Deathmark Mechanics & State Machine (Ch. 3 L5498–5525)
- **State Storage:**
  - Deathmark is tracked under `flags.ak5e.executor.deathmark`:
    - `held`: boolean (true when held by self, false when on target).
    - `holder`: `"self"` | `"target"`.
    - `targetUuid`: UUID of marked target (or null when held).
    - `targetName`: Name of marked target (or null when held).
    - `transferredTurn`: Combat turn key when transferred.
    - `attackedOrDamagedThisTurn`: boolean tracking attack activity.
- **Transfer Timing Ruling (`deathmarkTransferTiming`):**
  - Source rule: "Whenever you make an attack roll against a creature or hit a creature with an attack, you can transfer your Deathmark to that creature."
  - *Ruling:* Default reading is `onAttackRoll` (transfers upon initiating the attack roll, allowing immediate application of crit threshold reductions and bonus damage). Supported GM ruling or player choice includes `onHit` (transfers only upon confirmed hit).
- **Recall & SP Economy:**
  - Recalling Deathmark (Bonus Action or automatic feature recall) awards +3 Operator Skill Points (SP) and grants a reaction Disengage opportunity.
  - At the start of the Specialist's turn in combat while Deathmark is held, awards +3 SP.
- **Damage Scaling:**
  - Melee/ranged attacks against marked target gain +1d4 damage, scaling to +2d4 at level 7 and +3d4 at level 14.

### 2. Hunter vs Bodyguard Paths (Ch. 3 L5515–5530)
- **Level 1 Path Benefits:**
  - Hunter: Attacks against marked target have critical hit threshold reduced by 1 (e.g. 20 -> 19).
  - Bodyguard: When an ally within 10 ft is targeted by an attack from the marked creature, the Specialist can redirect the attack to themselves without action cost.
- **Level 5 Features:**
  - Shared: In Every Shadow grants climb and swim speeds equal to walk speed, plus Stealth proficiency (upgrades to Expertise if already proficient).
  - Hunter: Sweeper (1 Prowess) increases Reach by 5 ft until end of turn, allows a melee attack against each chosen creature within Reach, transfers Deathmark on hit, and returns mark (+3 SP) at action end.
  - Bodyguard: Smokescreen (1 Prowess, 1 Reaction) creates a 10-ft radius magical darkness sphere at feet until next turn end; one chosen ally inside may use Reaction to move up to their Speed without opportunity attacks.

### 3. Prowess Triggers (Ch. 3 L5526–5535)
- **Trigger Implementations:**
  - Universal: When marked creature drops to 0 HP, Specialist gains 1 Prowess (1/turn) and Deathmark returns to self.
  - Hunter: Dealing >= 30 damage on a single attack roll awards 1 Prowess.
  - Bodyguard: When an ally within 10 ft is attacked and takes 0 damage, Specialist gains 1 Prowess.

### 4. Level 11, 15, and 20 Capstones (Ch. 3 L5536–5578)
- **Level 11:**
  - Hunter (Preysense): Adds one extra weapon damage die to crits against marked target and inflicts Bleeding condition on living creatures.
  - Bodyguard (Dangersense): Reaction to move with an ally within 5 ft up to half Speed out of an AoE; takes 0 damage on save success, half on failure.
- **Level 15:**
  - Hunter (In for the Kill): Transferring Deathmark makes target Vulnerable to Specialist attacks until end of turn.
  - Bodyguard (Blade Shield): Reaction to attack marked creature targeting Specialist or ally; if hit, subtracts PB from their attack roll.
- **Level 20:**
  - Hunter (Mortal Blow): 1/Long Rest Action teleporting within 5 ft of target; target makes DEX save vs Martial DC. Interactive 10d8 Hit Point loss (doubled if target has Bleeding, halved on save). Reading `mortalBlowReading` configures whether HP loss bypasses DR/Resistance (`bypassDRResist`, default) or all mitigations including Temporary HP (`bypassAll`).
  - Bodyguard (Ultimate Sword and Shield): Blade Shield costs 0 Reaction (can be used any number of times per round).

## Hookmaster Specialist Subclass (Ch. 3 L5585–5679)

### 1. Hooked Weapon Conversion & Reversion
- **Weapon Criteria (L5585–5600):**
  - Eligible weapons must be Melee Weapons, deal Slashing or Piercing damage, and must not have the Two-Handed property.
  - Converted Hook properties: Gains Two-Handed (`"two"`) and Thrown (`"thr"`, 30/- ft at level 1–14, 50/- ft at level 15+ with Longer Hook).
  - Mechanical traits: Returns to hand immediately after thrown attacks. Uses Strength modifier instead of Dexterity modifier for ranged Hook attack rolls and damage rolls (implemented dynamically via `hookmasterPreRollAttack` and `hookmasterPreRollDamage`). Only Hookmasters have proficiency.
- **Cost & Free Starting Hook:**
  - The first Hook conversion is free as the starting subclass weapon (`freeConversionUsed: true`). Subsequent conversions or replacements cost 200 LMD and require 1 hour of work.
  - Insufficient currency produces a shortfall warning that clamps currency at 0 when overridden at the table.
- **Reversion & Undo:**
  - Reverting restores original properties, range, and item flags. Reversibility within the encounter window is guaranteed through `hookmasterCleanup` and `revertHookedWeapon`.

### 2. Level 5 Features (L5605–5655)
- **Big Boot:**
  - Unarmed strike hits against targets no more than one size larger allow a 10 ft push.
  - When King of the Urban Jungle is active, forced movement distance is doubled to 20 ft.
- **King of the Urban Jungle:**
  - Requires moving at least 20 ft immediately beforehand during turn.
  - Specialist grapples to a chosen surface point within Hook range (30 ft / 50 ft), gaining Flying Speed equal to 2× Hook range (60 ft / 100 ft). Must travel at least 10 ft in the air.
  - Attack rolls with the Hook are prohibited while flying.
  - The first melee attack immediately upon landing gains +PB bonus damage and doubles forced movement.
- **Bound in Rope:**
  - Action (1 Prowess) against a target within Hook range no more than one size larger. Target makes DEX save vs Martial DC or becomes Grappled.
  - While Grappled, Hook use is locked (`hookLocked: true`).
  - Bonus Action allows dragging target up to 15 ft towards the Specialist.
  - Action allows hogtying target within 5 ft.
  - Releasing grapple clears `grappledTarget` and unlocks Hook.
- **Wrangler:**
  - Action (1 Prowess) against a target within Hook range that is *more than one size larger*.
  - Target makes DEX save vs Martial DC or Specialist latches on, entering its space and moving with it without spending movement.
  - Attacks against latched target have Advantage. Specialist can take a -5 attack penalty to ignore 5 Damage Reduction.

### 3. Prowess Triggers (L5648–5655)
- Specialist gains 1 Prowess (1/turn) when a creature within 30 ft takes falling damage or environmental hazard damage.
- Specialist gains 1 Prowess (1/turn) when moving > 45 ft via flying speed during their turn (e.g. via King of the Urban Jungle or Swing to Safety).

### 4. Capstones (Level 11, 15, and 20) (L5656–5679)
- **Level 11: Mighty Push:**
  - Action, PB / Long Rest (tracked in `mightyPush` pool, max `@prof`).
  - Target makes STR save vs Martial DC. Interactive 8d6 Bludgeoning damage. On fail: full damage and 20 ft knockback; on save: half damage and 10 ft knockback.
  - If target collides with an obstacle, it takes falling damage equal to distance moved (2d6 on fail, 1d6 on save).
- **Level 15: Spider's Essence:**
  - Longer Hook: Hook thrown range extends from 30 ft to 50 ft.
  - Spider's Thread: Action; Specialist gains Climbing Speed equal to Hook range towards chosen surface point until start of next turn; allies starting in the same location gain the Climbing Speed until end of their turn.
  - Swing to Safety: Reaction while falling; triggers King of the Urban Jungle flying movement to grapple a surface point within range, avoiding all falling damage.
- **Level 20: Scorpion Sting:**
  - 1 / Long Rest (tracked in `scorpionSting` pool, max 1).
  - Specialist makes 6 melee attacks with Advantage against target, dealing weapon damage + half Specialist level (+10) bonus damage per hit.
  - If target is already Grappled (Bound in Rope) or Latched (Wrangler), target cannot make the initial save / automatically suffers attacks.

## Infuser Specialist Subclass (Ch. 3 L5684–5840)

Source contract corrected on 2026-10-25. The former summaries below invented several infusion benefits and durations. These corrections describe the printed rules; runtime acceptance is tracked separately in TODO.md.

### 1. Infuser DC Formula & Ruling (Ch. 3 L5688–5690)
- **Source Formula (`20 - INT - PB`):**
  - Source text explicitly states: `20 - Your Intelligence Modifier - Your Proficiency Bonus`.
  - *Ruling:* In accordance with DECISIONS.md L465 ("Infuser DC ... preserve subtraction exactly; do not replace it with a conventional D&D5e DC"), the module computes Infuser DC as `20 - INT mod - PB` by default.
  - *Table-Play Support:* An optional GM ruling toggle (`infuserDCRuling`) is supported, allowing tables to choose standard D&D5e save DC formula (`8 + INT mod + PB`, `standardDnd5e`) if preferred.

### 2. Principle of Double Effect & Alchemical Infusions Pool (Ch. 3 L5692–5700)
- **Proficiency & Restrictions:**
  - Grants Pharmacology Kit proficiency upon taking the subclass.
  - Alchemical Infusions pool is registered under `resourcePools.alchemicalInfusions` with maximum `2 * PB`, restoring to full on Long Rest.
  - Infusions cannot be applied to Constructs or Undead (enforced via non-blocking warning with table-play override).
- **Application & Targeting:**
  - Range: 5 ft at levels 1–10; extends to 30 ft at level 11 with Stimpack.
  - Duration: 1 minute. Leverage does not consume an Infusion.
  - Multi-Target Restriction: Each creature can only have one active Alchemical Infusion at a time; applying a new Infusion overwrites the previous one. Reverting an overwriting application cleanly restores the prior Infusion.

### 3. All 8 Alchemical Infusions & Leverage CON Save Workflow (Ch. 3 L5782–5823)
- **The 8 Alchemical Infusions:**
  1. `adrenalineTrigger`: Reaction after a failed Strength Skill Check/save or missed Melee Attack; add 1d6 to that result.
  2. `flightReflexStimulant`: Reaction after any failed save; add the Infuser's Intelligence bonus to that result.
  3. `focusHeightener`: Reaction after a failed Dexterity Skill Check/save or missed Ranged Attack; add 1d6 to that result.
  4. `hesitationSuppressor`: Reaction when forcing a hostile creature's save; increase its DC by 1d4.
  5. `muscleStrengthener`: Reaction on a Melee Attack hit; increase that Attack's damage by the Infuser's Intelligence bonus.
  6. `procoagulant`: Bonus Action; roll one of the recipient's Hit Dice without expending it, add CON, gain that many Temporary HP and remove Bleeding.
  7. `respirationStimulant`: Bonus Action; +10 feet Speed until the end of the Turn.
  8. `sensationNulling`: Reaction on taking Damage; roll 1d6 for DR against all Damage until the end of that Turn.
- **Leverage Workflow (Ch. 3 L5694–5700):**
  - The recipient chooses to Leverage its active Infusion when the listed scenario occurs.
  - The recipient makes a Constitution saving throw against the Infuser DC.
  - *Success:* Recipient gains the Leverage benefit with no adverse consequences.
  - *Failure:* Recipient still gains the benefit, but is Dazed until the beginning of its own next Turn and cannot Leverage while it has that Condition. There is no encounter-long lockout.
  - Unowned target modifications relay automatically through the GM client without blocking player agency.

### 4. New Concoctions & Double-Blind Trial (Ch. 3 L5705–5743)
- **New Concoctions (Level 5):**
  - Adds Neurological Inhibitor (Berserk on failed save) and Bungarotoxin (Paralyzed on failed save) to the Pharmacology Kit options.
- **Double-Blind Trial (Level 5):**
  - Bonus Action expending 1 Prowess + 1 Alchemical Infusion use.
  - Interactive `1d6` roll button on the chat card determines the random Toxin applied to an untoxined weapon from the Double-Blind table:
    1 = Neurological Inhibitor (printed "Neurologicial"), 2 = Necrotoxin, 3 = Haemotoxin, 4 = Cytotoxin, 5 = Neurotoxin, 6 = Bungarotoxin.
  - Clamps dual resource shortfalls at 0 when overridden at the table.

### 5. Prowess Triggers, Stimpack, Excessive Dosing & To Defy Science (Ch. 3 L5745–5770)
- **Infuser Prowess Gain Triggers (L5745):**
  - Specialist gains 1 Prowess when a creature with Poisoned, or affected by a Toxin created by that Specialist, is reduced to 0 HP. The source adds no once-per-turn limit to this trigger.
  - Specialist gains 1 Prowess (1/round) when an active Infusion turns a failed attack, check, or save into a success.
- **Stimpack (Level 11, L5747–5754):**
  - Infusion application range expands from 5 ft to 30 ft.
  - Questionable Rejuvenation: Target gains 1d10 Temporary HP upon Infusion application and upon succeeding on a Leverage CON save; this Temporary HP stacks additively with Procoagulant.
- **Excessive Dosing (Level 15, L5758–5764):**
  - Succumb: Adds Proficiency Bonus (`+PB`) to the DC of Toxins applied by the Infuser.
  - Toxic Shock: failed Toxin saves additionally cause Poisoned for the duration of that Toxin's Conditions, or until the end of the affected creature's next Turn when the Toxin applies no Condition.
- **To Defy Science (Level 20, L5765–5770):**
  - 1/Long Rest Action targeting a creature within 30 ft (tracked in `toDefyScience` pool, max 1).
  - For 1 minute the chosen creature cannot lose Hit Points. This is not a fixed HP floor that would prevent healing.

## Inventor Specialist Subclass (Ch. 3 L5847–6140)

### 1. Dangerous Modifications & Breakdown Damage Rider (Ch. 3 L5954–5956)
- **Instability Contribution:**
  - Dangerous modifications add +1 extra Instability to modified equipment (+2 total over standard increment: 1 base increment + 1 dangerous increment).
- **Breakdown Equipment Rider:**
  - Source text states: "when equipment suffers a breakdown as a result of activating a Dangerous Modification, that equipment is damaged in addition to the loss of Hit Points. If it is a weapon, it cannot be used; if it is armour, it provides no benefits. It returns to functionality when it is repaired, such as by using a Maintenance Kit."
  - *Ruling:* Equipment damage/disabling occurs **only** when a breakdown is triggered while activating a Dangerous modification. If a piece of equipment has both Dangerous and standard modifications installed, activating a standard modification that results in a breakdown inflicts HP loss but does **not** disable the equipment.
  - *Broken State Representation:* Broken state is stored on the item under `flags.ak5e.isBroken = true`. Usable weapons are rendered unusable and armor AC benefits are suppressed until repaired via `repairBrokenEquipment(item, actor, options)` (simulating Maintenance Kit repair).

### 2. Melee Attachment Attack Modifier Reading (Ch. 3 L6068)
- **Source Ambiguity:**
  - Source text for Melee Attachment states: "they may make melee attacks with that Weapon using Dexterity, dealing 1d8 + their Attack Modifier in Piercing Damage until the end of the Turn."
  - In standard 5e phrasing, "Attack Modifier" typically refers to the total attack roll bonus (`DEX mod + Proficiency Bonus`), whereas damage typically adds only the ability modifier (`DEX mod`).
  - *Ruling:* In accordance with WORKFLOW §3.2 and table-play philosophy:
    - Default reading: `1d8 + DEX mod` (consistent with weapon damage conventions throughout the system).
    - Optional reading: `1d8 + DEX mod + PB` (literal text reading).
    - The module presents both options in the confirmation dialog / chat card, defaulting to standard ability modifier while allowing the table to select the literal reading without blocking play.

### 3. Instability Roll Timing (Ch. 3 L5864)
- **Source Rule:**
  - Source text states: "When a Creature activates a Modification, they roll a number of d6's equal to that equipment's Instability; if any of those dice show the same result as another die, that equipment suffers a breakdown..."
  - *Ruling:* Instability rolls occur **only** on deliberate activation of an equipment modification.
  - Making regular weapon attacks with a modified weapon without activating a modification, holding or stowing modified equipment, or passively wearing modified armor does **not** trigger an Instability roll.

## Skyranger Specialist Subclass (Ch. 3 L6145–6320)

### 1. Flight Suit Starting Equipment & Aerial Movement
- **Flight Suit Integration:**
  - Skyrangers receive a custom Flight Suit (Medium Armor, AC 14 + Dex mod (max 2), Disadvantage on Stealth, Weight 40 lb) upon gaining the Take Flight feature at 1st level.
  - While wearing the Flight Suit, the Skyranger can spend Fuel points to gain a Flying Speed equal to their walking speed for 1 minute (or 10 minutes out of combat).
- **Aerial State Tracking & Elevation:**
  - Ground vs. Aerial target status is determined by token elevation (`elevation > 0`) or active flying conditions/speeds.
  - In accordance with WORKFLOW §3.2, user confirmation dialogs include an editable "Target is Aerial" toggle so table play is never blocked by unconfigured scene elevation.
- **Swooping Dive Range & Strafe Damage Application:**
  - Swooping Dive allows a dive attack from elevation. When Close Air Support doctrine is active, Strafe bonus damage (`calculateStrafeDamage`) applies to the target if within flight path.
- **Evasive Manoeuvres Damage Mitigation Timing:**
  - Evasive Manoeuvres adds PB to AC as a reaction against an incoming attack. If the attack still hits, the incoming damage is halved. Halving applies before DR and resistances.
- **Skyscreamer 20th-Level Transformation:**
  - Once per Long Rest, Skyrangers can activate Skyscreamer mode (1 minute duration), gaining +30 ft Flying Speed, immunity to Grappled and Restrained, Core Cannon (3d8 Force, 100/300 ft, Rapid Fire) and Core Saber (3d8 Force, Reach 10 ft, Finesse), and free Evasive Manoeuvres reactions.

## Dollkeeper Specialist Subclass (Ch. 3 L6325–6480)

### 1. Living Doll Companion & Synchronization
- **Companion Lifecycle:**
  - The Living Doll is a Small Construct companion linked to the Dollkeeper. Its Max HP equals `10 + 5 * (Specialist Level - 1)`, AC equals `10 + PB + Dex mod`, and saving throws add the Dollkeeper's PB.
  - Doll Strike attacks use the Dollkeeper's PB and Dexterity modifier for attack rolls and deal `1d8 + Dex mod` magical bludgeoning damage, scaling to 2 attacks at level 5.
- **Prowess Triggers & Action Economy:**
  - Dollkeeper commands the doll as a Bonus Action within 100 ft.
  - When the Living Doll reduces a creature to 0 HP or when Musical Chairs is used to swap positions and an attack subsequently hits, the Dollkeeper gains 1 Prowess (1/turn limit).
- **Self-Rejuvenation & Rebuilding:**
  - On a Long Rest, if the Doll has more than 1 HP, it regains all missing HP. If reduced to 0 or 1 HP, it must be rebuilt via a 1-hour ritual and 500 LMD component cost (or 8 hours without gold).
- **Feature Name Disambiguation:**
  - Chapter 3 contains two features titled "Living Doll" (1st level companion baseline and 15th level Reciprocity/Share Arts). These are differentiated internally as `livingDoll` and `livingDoll15` / `reciprocity` without modifying source text.

## Trapmaster Specialist Subclass (Ch. 3 L6485–6740)

### 1. Trap DC Calculation & Scaling
- **DC Formula:**
  - Trap DC is calculated as `8 + PB + max(Dex, Int)`.
  - At 20th level, House of Horrors permanently grants +5 to Trap DC (`8 + PB + max(Dex, Int) + 5`).
- **Traps Resource Pool:**
  - The Traps pool maximum is `2 * PB`, fully replenishing on a Long Rest.
  - Sleight of Hand grant automatically confers proficiency, or upgrades existing proficiency to expertise.
- **Trap Catalog & Scaling:**
  - All 8 canonical traps (Alarm, Caltrops, Snare, Flashbang, Net, Spike, Incendiary, Timed Explosive) are supported.
  - Level-based damage scaling triggers at levels 1, 7, and 14 for Spike and Incendiary traps.
- **Environmental Warfare & Improvisation:**
  - Devil's Own Luck allows the Trapmaster to suggest improvised environmental traps using natural features. Timed Explosives cannot be improvised environmentally.
- **Jester's Grace & Safety:**
  - The Trapmaster and designated allies cannot trigger the Trapmaster's planted traps and have advantage on saving throws against friendly trap areas.





## Supporter Class and Artificer / Bard / Hexer Branches (Ch. 3 L6548–7330)

Head rulings fixed before implementation (2026-10-24). Workers implement these and do
not re-decide them. Each one rests on the cited source text.

1. **Aid Die count (C3:6637).** The pool maximum is the chosen INT/WIS/CHA modifier, with no floor of 1 (consistent with the Aid Die minimum row above). At 0 or below the sheet warns and the GM resolves.
2. **No Supporter DC.** The base class prints no DC, so the former `supporterDC` (8 + PB + mental modifier) is removed.
   - The Artificer DC is 8 + INT + PB (C3:6958) and may replace the Martial DC.
   - The Spell Save DC comes from the Arts casting ability.
3. **Lighten the Load vs one die (C3:6633 / 6674).** The bonus die may go to a creature already holding one. Play warns, and the player may use it anyway.
4. **Special dice (C3:6687, 7147).** Self-Supportive and Font of Inspiration dice are separate per-actor flags.
   - Neither counts toward the one-die cap.
   - Each is lost at the end of its turn.
5. **Will Into Being (C3:6692).** It applies to any roll of the Supporter's Aid Die, expended or not, as an opt-in +PB button on the card.
6. **Advanced Aid crit (C3:6658).** The critical range widens by 1 for that attack only (20 → 19–20), as a one-shot rider.
7. **Bard Arts missing from Ch.5.** The ten absent base Arts (including Tasha's Mind Whip once) and undefined Shatter-5th variant require a `manual: true` marker.
   - They can be composed.
   - They are cast through a manual card that points to the "Bard missing Arts / variants" row.
   - No mechanics are invented.
8. **Hexer Arts known (C3:7281).** The Hexer knows every Art of 5th level or below plus the cantrips of the chosen Standard Pool, always Prepared. A second pool is added at level 11.
   - The AP table (C3:7254–7279) is keyed by branch so Ritualist and Summoner can reuse it.
9. **Abjuring and Binding (C3:7290 / 7292).**
   - Abjuring: the creature subtracts ⌊roll/2⌋ from its damage, and the damage stays at least 1.
   - Binding: one roll of 2× the Aid Die per hexed creature, rounded to the nearest 5 ft.
10. **Bard Performance limit (C3:7102).**
    - The source limit is the Charisma Modifier, with no invented minimum of one. At nonpositive modifiers the source offers no slot; source restrictions remain visible, overridable play warnings.
    - Aid Dice expended into Muse stay spent until the Long Rest.
    - Composing happens after the rest refill.
11. **Talent borrows (C3:6837 / 6846 / 6849).** Anti-Arts Training, Lieutenant and Part-Time Inventor are manual-ruling cards.
    - Flat-number talents use Active Effects.
    - Talents with uses or reactions use play-uses plans.

## Vanguard, Agent, Charger and Pioneer development contract (2026-10-24)

- **Authority and scope:** Chapter 3 L7904–8484 and referenced Chapter 1/4
  sections. Source IDs and descriptions remain stable. Skill/Talent selection,
  Module upgrades and class interactions reuse existing workflows; this is not
  a claim to implement every catalogue effect.
- **Native schema:** use installed Foundry 13.351 / D&D5e 5.3.3 fields.
  Saving Throw proficiency is on `system.abilities.<ability>.proficient`;
  Messenger Kit is registered as `system.tools.ak5emessengerkit`. Stock D&D5e
  simple/martial groups do not equal AK5e Light/Heavy Melee categories. Match
  mapped source weapons specifically and preserve authored proficiencies;
  expose unmapped third-party weapon handling for table review.
- **Martial DC (Ch.1 L211–212):** STR or DEX is the player's choice. Do not
  silently choose the higher modifier. Feature levels use Vanguard levels;
  Proficiency Bonus uses the Actor's shared PB, including multiclass Actors.
- **Quick off the Mark (Ch.3 L8016–8017):** unlocks at level 3. The old testing
  checklist's level 2 was documentation error, not an alternative rule.
- **Guided Lightspeed (Ch.3 L8049–8052):** record initiative minus 10 and an
  explicit begin/complete procedure during round 1. Do not add a Combatant,
  reorder native turns or emit synthetic generic turn events. The procedure
  must identify shared refresh/expiry steps requiring table confirmation.
- **Auramancy expenditure (Ch.3 L8434):** count actual committed SP already
  expended toward each 20-SP threshold; carry the remainder. An additional
  20-SP purchase is not in the source and is not charged. Record spend, grants
  and operation IDs durably so retries cannot duplicate benefits. Counter
  reset/overlap questions remain explicit per-use readings until ruled.
- **Tactical Burst (Ch.3 L8451):** preserve the malformed wording, but its
  specified Tip count is `1 + floor(actual activation SP spent / 10)`.
  No unspecified generated resource is invented. Auramancy and Tactical Burst
  are separate benefits of the same qualifying expenditure.
- **Unresolved readings:** Agent Level, Tip self-targeting, Aura of Pressure's
  `5 (1d8)`, and consequential timing/overlap questions must use supported
  per-use choices, shown publicly, unless a recorded GM ruling applies. A
  player's temporary choice never becomes a persistent GM ruling.
- **Acceptance:** helper tests and flags are not evidence of rendered play.
  See `VANGUARD_WORKFLOWS.md` for per-feature state and actual test evidence.

## Supporter branch implementation rulings (2026-10-24)

Rulings made by the head during adversarial-pair integration. Each rests on the cited source text, or on an existing precedent where the source is silent.

**Artificer**
- **A1 (C3:6895 / 6938).** The Automaton cap is 1, rising to 2 at Supporter level 13.
  - Exceeding it warns and never blocks.
  - Exempt (Ch.4 Turret, Protocol) and destroyed Automatons don't count.
  - The Artificer's own `automatons` list decides ownership. The creator flag is only a fallback.
- **A2.** Action economy (Attack Action, Bonus Action command, As One "cannot repeat") is tracked and warned, never enforced.
- **A3 (C3:6893–6895).** Rebuild is a confirmable Long Rest activity or 500 LMD. LMD is stored in `system.currency.cp`, the module convention. A shortfall clamps and is recorded.
- **A4 (C3:6925 / 6945).** The upgrade cap per Automaton is 2, or 3 at level 17. Mobile Cover takes the same cap (the source is silent). A duplicate upgrade on one target warns. Putting an upgrade on the wrong target type (cover vs Automaton) is a hard error.
- **A5.** Upgrades that need both parties to rest recover on the creator's rest only if the Automaton is not destroyed, with a reminder. Recovery for Automatons the player doesn't own needs the GM (open item).
- **A6.** "N rolls of your Aid Die" means N dice of the current Aid Die size, not expended. Only Concussive Maintenance expends one.
- **Technology Modifier (C3:6887; also C3:584).** This is a reading: Tech skill total (`techTotal`) or INT modifier (`intMod`). A recorded GM ruling decides it; otherwise the player chooses per use. Same precedent as caster-drones.mjs.
- **Calculated Strikes.** A flag plus a reminder. dnd5e 5.3.3 has no global per-weapon ability override.

**Hexer**
- **Abjuring (C3:7290).** The die is rolled by the hexed creature at each of its damage rolls, not when the Hex is applied. R9's "⌊roll/2⌋, minimum 1" applies at that damage roll.
- **Force rider (C3:7290–7298).** "Once they have taken this Damage…" makes the limit per hexed creature per Hexer turn cycle. Only Hexes from this Hexer trigger its card.
- **Repeat Hex.** A repeat of the same Hex kind from the same source warns. Using it anyway replaces the existing instance (one instance per kind).
- **Ultimate Hex (C3:7326).** "All options of your Potent Hex Feature" includes the 13th-level Voicethief and Wasting.
- **Duplicate pool.** The same Standard Arts Pool chosen twice warns and is applied once.

**Bard**
- **Muse budget (C3:7099–7104).** Checked after the Muse roll; the card notes when the player went over. Leftover Muse becomes Temporary HP when the roll is committed. Muse left over after inserting an Art (Emergency Improv) is lost.
- **Unknown Art.** An Art name not in the 34-row table is a hard error, because it cannot be resolved.
- **Speak to the Soul (C3:7142).** "Performance Modifier" is the Performance skill total (`system.skills.prf.total`). The card states the value and changes nothing.
- **Emergency Improv (C3:7152–7159).** The use is consumed when attempted. Inserting an Art that breaks the no-consecutive rule warns.
- **Casting Unit (C3:7106–7112).** The Instrument becomes the Casting Unit for the Performance and is restored afterwards. A proficient equipped Instrument is required, and its absence warns.
- **Start flow.** Starting a Performance does not cast at the engine level. A native cast needs the dnd5e dialog, so the UI runs start and then the first cast. The last Art ends the Performance in the same use, and Rising Crescendo still applies to that last Art.
- **Fortissimo.** No warning below level 17; it is a passive multiplier.
- **Font of Inspiration (C3:7146–7147).** Gained only from level 4. It never gates starting a Performance.
- **Known limitations:**
  - Native Concentration effects of other Arts are not ended automatically.
  - Compose and perform both write the whole `performances` array, so concurrent writes can race.

**Shared**
- **Cancel (WORKFLOW §3.2).** Foundry V13 `DialogV2` resolves a click as `callback() ?? action`, so every Cancel callback must return `false`. Fixed in play-uses-sheet.mjs and the Supporter branches. Other classes are tracked in bugs/pending/B-302.
- **Confirm step.** Every Supporter branch control shows a confirm or choice dialog with Cancel before any write. Branch controls render only for the actor's owner.

## Supporter review round R1 rulings (2026-10-25)
The final review of `feat/supporter-base` found the defects below. They were fixed by two adversarial pairs (PRs #33–#36).

**Aid Die and base class**
- **F-R1 Aid Die duration (C3:6635, "once within the next ten minutes").** These dice now expire after 600 s of world time, in and out of combat. They do not expire at a turn start or at combat end:
  - every granted Aid Die (Provide Aid, Lighten the Load, and the Font of Inspiration die once it is granted);
  - the fallback effect, when there is no feature item.
  
  The expiry lives on `flags.ak5e.temporaryTag`, the flag feature-tags expires on. `flags.ak5e.featureTag.data` keeps the giver's die data. The held, ungranted Font die is still lost at the end of the Bard's turn (C3:7147).
- **F-R2 Talent pools.** These are defined when the class registers, not lazily, so rests refill them after a reload.
- **F-R3 Aid card riders.**
  - Temp HP always confirms first, then applies through an undoable receipt.
  - The crit rider confirms. It is a child receipt (`parentUseId`), so undoing the Aid use removes it. A parent that is missing or undone gives a warning.
  - The second roll happens once per use. A repeat click warns "Already rolled", and the player may still confirm.
- **F-R4 Recipients.** Any actor the user can see at LIMITED or higher (NPCs and other actor types), plus the actors of targeted tokens, including unlinked ones.
- **F-R5 Aid ability with no flag.** It falls back to the highest of the INT, WIS and CHA modifiers (ties: CHA > WIS > INT). The sheet warns and offers a chooser. Progression no longer writes CHA over this choice. An explicit choice still applies with no floor of 1 (R1).
- **F-R6 Progression control.** It shows the choice fields (Aid ability, branch, talents) before applying.
- **F-R7 Relay content checks.** The GM rejects an Aid Die change that:
  - has unknown tag keys, `changes`, `condition` or `standardBenefit`;
  - has a die size that does not match the Supporter's level;
  - names a different `supporterUuid`.
  
  The Font of Inspiration relay (H2) uses the same checks.
- **F-R8 Smaller fixes.**
  - Restored Arts keep their ids (`keepId`).
  - The rest hook is owner-guarded and catches errors.
  - A branch plan-name collision is detected before anything registers.

**Branches**
- **F-R4a Rupturing Hex.** One burst card per (Hexer, killed creature). A repeat roll of the same card confirms "Already rolled" (H1). A new kill gets a fresh card.
- **F-R4b Hex Force rider (C3:7287).** One rider card and at most one relay whisper per (Hexer, target) per hit, however many Hexes are on the target.
- **F-R5 Emergency Improv.** A missing recorded check is a warning, not a block.
- **F-R6 Spare the Rod.** At Hexer level 10 and above, the Cursemark command prompts for creatures to exclude.
- **F-R7 Artificer relay.**
  - The validators are attached to the plan functions, which is where the relay reads them. Before this, they were unreachable and every relayed Artificer change was refused.
  - Field paths are whitelisted on apply and on revert.
  - Automatons in the Artificer's own list are accepted (H4).
  - Automaton revert deletes only this source's Automaton from that op.
- **F-R8 Orphan Automaton.** The created Automaton entry is marked attempted, so undoing a pending receipt deletes it. Retrying with the same opId reuses the same id.
- **F-R9.**
  - Cursemark uses the scene's grid distance and size, with a fallback of 5 ft.
  - Expired marks are pruned.
  - The Art-cast Hex prompt claims damage only when the event carries it.

**Accepted and deferred**
- **H3.** If the relay times out after the GM has created an Automaton but before the receipt saves, the Automaton is left orphaned unless the user retries with the same opId. This is accepted.
- **H5.** Temp HP and the crit rider may show a confirm and then a warnings dialog. Cancel works at each step.
- **Deferred:**
  - The upgrade creation-limit warning needs an `eventCount` that no UI supplies.
  - The undo history (`state.undo`) is never pruned, and Hexer Arts receipts embed item data.
  - `game.ak5e.supporter.branches` is a ready-time snapshot.
  - Target-kind collisions in `play-uses.register` are unguarded. Fixing this needs play-uses.mjs.
  - Burst once-keys accumulate on the Hexer.

## Five-branch batch rulings: Medic casting and Witchcraft (2026-10-25)

Head rulings for unit U3. They rest on the cited Chapter 3 text and the existing Arts quote engine (`arts-rules.mjs` applies `grant.reduction` before `discounts` and floors at 0).

1. **Confirm contract.** `confirmPlayUse` confirms every use once. A caller that has already shown its own confirm dialog passes `confirmed: true`. Warnings and readings dialogs still follow.
2. **Medic Arts setup.** The Medic writes the native `artsPoints` / casting flags the Arts engine needs, modelled on `applyGuardianArts` (`guardian-features.mjs:96`). Until it does, no Medic cast reaches `arts-casting.mjs`.
3. **Urgency of Treatment (C3:4656).** This is an `arts-casting` quote discount on Healing Arts Pool Arts only: 1 AP per 10 Life Support, floored at 0. If the discount exceeds the remaining cost, the player gets a warning that the excess Life Support is wasted.
4. **Self-Defence Protocol (C3:4698) and Halfway House (C3:5099).**
   - Each grants a chosen Standard Arts Pool. Self-Defence Protocol grants levelled Arts up to 5th plus cantrips. Halfway House grants the whole pool, bounded by the Medic's maximum Art level.
   - The cost reduction is a grant `reduction`: Self-Defence 1, or 2 from level 11; Halfway House 0 below level 5, 1 from level 5, 2 from level 11.
   - An Art in both pools takes the larger reduction; the two do not stack.
   - Choosing the same pool for both features gets a warning, not a block.
   - Urgency of Treatment stacks on top of either reduction (applied last), and the total floors at 0.
5. **Healing through Harm (C3:5103).** The trigger is the player's own rolled Art damage total before target mitigation, including flat modifiers. The player gains floor(total / 2) Life Support, which may exceed the maximum; the excess is lost on a Long Rest. The feature costs a Reaction and recovers on a Short Rest. It is offered as a prompt and never applied automatically.
6. **Improved Life Support (C3:5110).** Base Life Support healing is Touch (C3:4650). Witchdoctor raises it to 60 ft. Range is a warning only.
7. **Witchcurse (C3:5131).** Only one curse is active per Medic; placing a new one replaces the old. "First time each Turn" counts once per combat turn, keyed by combat:round:turn, including damage taken on other creatures' turns. Several damage parts of one Art count as one instance. Outside combat, each hit is offered with a warning. The 2d6 is clicked by the Medic. The Psychic damage equals the HP actually restored.
8. **Efficient Life Support (C3:5137).** Only levelled Arts count, so cantrips and 0-AP casts give nothing. The Medic gains 2 × the AP actually spent, written in the cast's own Actor update so that undoing the cast reverses it. Life Support healing as an Action or Bonus Action applies for that turn only.
9. **Witch's Boon (C3:5139).** Counts HP actually restored after clamping to the target's maximum; temporary HP does not count. The +1d10 Force applies to every Attack the target makes until the end of its next turn, rolled by the attacker's own damage roll.
10. **Life through Death (C3:5143).** "The amount rolled" is the maximum damage total dealt by that roll, including flat modifiers, before target mitigation. This is an uncertain reading. The HP is divided among chosen creatures within 60 ft, and a remainder may be left unspent. It is once per Long Rest and is mutually exclusive with Healing through Harm on the same roll.
11. **Out of scope:** Revivify remains unresolved (C3:4712; see the Revivify entry above), so Resuscitation is not a real cast.
