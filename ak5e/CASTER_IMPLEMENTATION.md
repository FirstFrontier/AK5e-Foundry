# Caster implementation map

Authority: full Chapter 3, Chapter 1 casting/rest/Construct/damage rules,
Chapter 4 Casting Units/Engineering Kit/currency, and Chapter 5 casting and
Standard pools in `AK5e_1.3.1_Foundry_Source/`. Stable IDs remain those of the
existing catalogues. This batch adds Actor workflows, without replacing packs.

| Source feature | Explicit rules | Native representation / helper | Manual boundary or required ruling |
| --- | --- | --- | --- |
| Caster chassis | d6; 6+CON initially, d6 or4+CON later; two mental saves; three listed skills; kit/vehicle choice | Previewed HP/proficiency choices and source Items | Preserve current HP and authored class data; explicitly record gains already included in an existing character |
| Equipment | Light melee or shield, Wand or Staff, proficient kit, or1300LMD | Source Items or cp, once on initial setup | Explicit Casting Unit; no imports on rendering/drop |
| Progression table | Exact 20-level AP/casting limits | Sole AP balance `flags.ak5e.artsPoints`; table in `caster-rules.mjs` | Update preserves current AP, excess, spent uses and ninth-level limit |
| Arts Casting | INT/WIS/CHA; Standard pool; Detect Magic2; Counterspell/Dispel Magic5; distinct pool11 | Source-first known/prepared grants, including above cap | GM-approved UUIDs for absent named D&D Arts; unresolved mappings block setup |
| Talents | Basic3/Advanced9; Module or new talent8/13 | Choice/state/source descriptions retained | Existing per-talent automation boundaries |
| Operator Skills | Choices2/7/14 | Existing Skill chooser | Existing Skill effect boundaries |
| ASIs | 4/6/8/10/12/16/19, cap20 | Recorded previewed increases with cumulative validation | No feat substitution; changed/reduced levels require review |
| Growing Power | Discount1 from5,2 from11 when selected cast level below maximum | Selected-level quotes | Combined discounts/minimum/surcharge order requires GM ruling |
| Unending | Level18 d6 equals AP spent refunds expenditure | Persisted roll and separate refund; Jury Rigging undo subtracts its established refund before restoring the spend | Recorded actual-spend basis; refunds are not expenditure events |
| Doublecast | Level20 second Art after Action Art, once Short Rest | Separate guided native cast/receipt | GM repeat-cost procedure; immediate action economy confirmed |
| Versatile Caster | Core additional distinct pool | Same setup/grant catalogue | Duplicate prevention |
| Rabbit from the Hat | Action, once Long Rest, Standard Art <=cap until next Long Rest | Borrowed grant/use receipt; expired managed-only grant blocked | Independently learned grants preserved |
| Power from Within | Completed Short Rest activity, ceil(Caster level/2) AP, once Long Rest | Explicit completion and capped recovery | Full Rest Action, one Rest Action at a time |
| Empowered Arts | Core6 once Turn PB plus casting modifier for levelled Arts | Optional qualifying damage-roll bonus consumed on completed roll | Confirm eligible cast this Turn; cancelled rolls retain use |
| Master of the Elements | Core10 pool/type resistance; AP-funded type substitution | Managed native resistance effect and cast-scoped Maverick | Core table controls Earth=piercing, Fluid=bludgeoning; underlying Art unchanged |
| Savant | Core15 known Art<=5 via Long Rest activity; low-die rerolls; ignore DR/resistance, retain vulnerability; nondamage discount2 | Signature state/roll modifiers/reviewed damage helper/quote | Cantrip eligibility, reroll repetition and cost order require rulings; native Apply Damage does not bypass defenses |
| Mystic Charge | Initial0,cap2/3at10, Long Rest clears | Registered pool | Single operating client; no cross-client locking |
| Charge turn gain | End own Turn, AP spent and no Charge spent | Deduplicated actual expenditure/charge ledger | Skipped turns do not grant |
| Charging ritual | Stationary/concentration-like minute, then up to3AP | Begin/complete/cancel; movement interruption | Time advancement and concentration/completion confirmations |
| Burst | All N charges, N+1 separate Action Cantrip uses, no critical damage | Individual native casts/receipts/critical suppression | Each outcome separate; interruption remains visible |
| Potent Cantrip | Mystic3 half damage on miss/successful save, no extra effects | Reviewed outcome/defenses damage helper | Multi-attack/unusual structures require GM ruling |
| Power Surge | Mystic6 Cantrip attack/DC bonus from Charges spent this Turn | Scoped native attack/DC modifications | No bonus beyond Turn |
| Turbocharger | Mystic10 charge on actual initiative rolls | Native initiative-message receipts and roll-object deduplication, rerolls allowed | Combatant edits and fixed initiative are not rolls |
| Feedback Loop | Mystic15 AP-funded cast +1charge, additional1level6+ | Completed cast event, actual spend, capped pool | Free/fully discounted casts do not qualify |
| Engineering Kit | Mech kit exchanges, Technology proficiency/expertise, Vehicles(Drones) | Previewed source Items/native fields | Authored choices/proficiencies preserved |
| Arts Master | Mech cap1/2at10; printed Small Construct | Owner request; the GM's client creates/links player-owned Actors/tokens/native Spark; cap is a warning; encounter-scoped creation/link receipts restore prior links and managed fields | Pristine, exclusively attributable created documents may be removed on undo; later edits are preserved with a preview. Technology Modifier by GM ruling or per-use reading; refresh managed stats after creator changes; native movement/action economy manual |
| Commands / Arts-Linked | Bonus Action within100ft move OR statblock Action; both at10 | Range/cap gate, map move or native sheet guide | Speed/path, vision/hearing, visibility, targets and action economy manual |
| Wolfpack Doctrine | Each drone Reaction Spark when creator casts Art | Undoable use; each drone's own Reaction, reset at its creator's Turn start; repeats, timing and locks are warnings | Visible target/immediacy confirmed |
| Jury Rigging | Mech3 visible within100ft, up to2PBAP,d8/AP, Construct healing exception, excess tempHP | AP spent on confirmation (clamped); card Roll button; stored roll; undoable receipt; range/visibility/cap are warnings | Excess Temporary HP by GM ruling or per-use reading |
| Translocation | Mech6 drone-space origin +1AP, creator ability/AP/concentration | Scoped origin/template/native clone | Table confirms range/line-of-effect |
| Duplication | Mech6 once Turn same Cantrip/creature or area1AP; drone no attacks until next creator Turn | Separate receipt/attack lock; target, Turn and repeat checks are warnings; an overridden native attack resumes its held roll without another activity use | Surcharge by GM ruling or per-use reading; same-area confirmation |
| Army of One | Mech10 levelled Art actual-spend Spark rider until Turn end | Creator receipt/native drone damage part; latest Art until a ruling or the player's per-Turn reading | None beyond the reading |
| Death from Above | Mech15 immediate Bonus Action repeat of Action Art<=3 from drone | Guided same-Art native cast; level/Action/timing are warnings | Repeat cost by GM ruling or per-use reading; immediate timing at the table |
| Destroy/rebuild | 0HP destroyed; Long Rest activity; missing components500LMD | Retained Actor/destroyed flag/completion/payment receipts | Payment alone does not rebuild |
| Residual Suffering | Primal1 Spell Attack hit or failed save; table condition by dealt damage type until end of next Turn; 2×PB uses, Long Rest | Registered pool; tracked condition effect with `nextTurnEnd` expiry; repeats, unlisted damage types and no uses left are warnings (count clamps at 0); unowned targets via the GM relay | Poison has no row; outside combat expiry is manual |
| Debilitate and Destroy | Primal3 1d8/2d8/3d8 at 3/7/14 HP loss after Damage to a Creature with a negative Status Condition; once per Creature per Turn | Card with a Roll button (no auto-roll); idempotent HP loss with Turn ledger; GM ruling or the player's per-use reading | The player confirms the negative condition (warning if not) |
| Elemental Burst | Primal6 Bonus Action, 20ft Sphere within 100ft, DEX save or chosen condition until end of next Turn; once per Short Rest | Chat card with native save link; per-target condition after confirmed failure; second use, wrong Turn and unconfirmed save are warnings | Template placement, range and sight at the table |
| Enduring Affliction | Primal10 overlay added to each condition | Overlay text on the effect; native Speed 0 for Charmed | Other overlays resolved at the table |
| Cardinal Punishment | Primal15 Elemental Burst DC +5; Residual Suffering after a successful save | Same helpers at level 15 | None beyond the above |
| Controlled Detonation | Splash1 +2 Spell Save DC for Sphere/Cone/Cube/Cylinder/Line Arts | Working-clone DC on the cast activity and chat card | Other native shapes are not areas |
| Splashing Cantrips | Splash3 halve single-target Cantrip; 10ft DEX save at DC +2 or halved Damage; Caster passes | Receipt, card and halved-Damage application by role | Single-target confirmation; Caster self-exclusion at the table |
| Sculpt Arts | Splash6 Safe Zone 1+cast level Creatures; Overwhelming Detonation up to 2×PB AP area growth | Safe Zone count/save notice/zero Damage; template growth on the inherited Item or activity size; AP surcharge in the quote | Cylinder refused (not listed) |
| Implements of Destruction | Splash10 two Standard-pool area Arts always Prepared; −1 AP to area Arts ≤5th after Growing Power, minimum 1 | Setup grants with GM area review of the exact pair; quote modifier | Cross-class cost order still unresolved |
| Unavoidable | Splash15 All-Consuming Disadvantage on saves this Turn once per Short Rest; Maximum Burst floor of half rolled area Damage except immunity | Save hook gives Disadvantage from that cast's card on the same Turn; damage helper floor | GM ruling or the player's per-use reading for Safe Zone with Maximum Burst; native Apply Damage does not enforce the floor |
| Chain Art | Chain1 an Art that can only affect a single Creature chains to up to 2 other Creatures within 15 ft, who are also targets; PB uses, Long Rest | `chainArt` pool; cast-form option with original/chained tokens; use spent in the cast's own update with an undo receipt and public card; working clone lists 1 + chained targets | Player confirms the single-Creature note (L465); 15-ft reach measured from the original token, unmeasurable range and over-count are warnings |
| Subtle Spark | Chain3 additional effect on all Creatures a single-Creature Art affects; Sparks 6/8/10/12 at 3/7/11/14, Long Rest; Con save at Spell Save DC | `subtleSparks` pool; post-cast use with tracked effects until the start of the Caster's next Turn; save effects post a Con save button and apply to Creatures confirmed as failing | GM ruling or per-use reading for the Spark cost with several Creatures; one Spark effect per cast (repeat is a warning) |
| Additional Effects | Accelerate, Bolster, Decelerate, Enervate, Innervate, Shred (L517-548) | Native changes: walk ±10, attack/damage bonuses ±1, Dex save ±1d4 (upgraded); Bolster/Shred carry a signed `drAdjustment` flag read by the damage pipeline and DR preview | Other movement types and "may" rolls are always applied; Bolster/Shred DR entered when applying Damage |
| Ouroboros | Chain6 instead of chaining, the target has Disadvantage on saves against that Art this Turn | Cast option; save hook gives Disadvantage only to the original target, from that cast's card, on the same Turn | Saves rolled elsewhere need manual Disadvantage |
| Subtle Spark Upgraded | Chain10 apply the upgraded effect instead | Upgraded checkbox; below level 10 is a warning | GM ruling or per-use reading: whether upgraded Accelerate/Decelerate keep the Speed change |
| Great Chain of Being | Chain15 three chained Creatures; +1 Chain Art use per Short Rest | Pool Short Rest recovery at level 15; three additional targets, four total | Retained interpretation: the three chained Creatures are additional to the original target |

Primal, Splash, Chain and Mech-Accord uses follow WORKFLOW.md §3.2. Source problems are warnings with
**Use anyway**, and a missing GM ruling becomes a per-use reading. Unowned targets
go through the GM relay, and each use has a receipt that its user, the Caster's
owners or a GM can undo within the encounter window. See `scripts/caster-primal-splash.mjs`,
`scripts/caster-chain.mjs`, `scripts/caster-mech.mjs`, `scripts/play-undo.mjs` and `DECISIONS.md`.

`game.ak5e.caster` exposes `preview`, `apply`, `choices`, `inspect`, `open`,
`openSetup`, `command`, `cast`, `createDrone`, `linkDrone`, `requestDrone`, `syncDrones`,
`recordRuling`, and `mapArt`. Owners operate their caster/drone group; the GM
creates World Actors/tokens, approves mappings/rulings, reconciles failures, and
changes unowned targets. Native action economy/rest/visibility are confirmations.

`apSpent` and `artCast` are separate receipt-backed events. Positive expenditures
include branch features; refunds are separate. Failures after consumption retain
evidence and block further operations until GM reconciliation. Partially applied
features retry identical choices/operation IDs. Legacy prepared operations recover
only from established receipts; otherwise they show explicit reconciliation guidance.
Drone removal uses GM-authored authority evidence, never owner-supplied snapshots.
Receipts do not provide cross-client
locking. Removed branches/reduced levels retain authored Items and choices; review
retained HP/ASIs/effects and limits. Validation evidence lives in `TODO.md` and
`FOUNDRY_SMOKE_TEST.md`; public packs, licensing and publishing remain separate.

HP and ASI choices distinguish missing gains from gains already included in an
existing character. Setup never assumes existing authored capacity is unearned.
Constitution changes and pre-existing HP adjustments require a reviewed manual
update. Arts Master Wisdom prints an inconsistent modifier; the native score is
retained and passive Perception is explicitly represented as 6 (see decisions).
Replacing recorded Standard Pools requires an explicit GM exception because the
source gives no replacement procedure. Ordinary level grants retain earlier
pool choices. An approved replacement retains known Arts and authored Items;
the selected pools control current managed pool benefits.

The installed SRD does not include every named Art from the book's pools. GMs
must supply and approve legitimate spell documents for missing names. Live tests
use clearly marked mechanics-free references for unavailable names; those have
no native activity and cannot be cast. They are test fixtures, not shipped spell
mechanics or proof that every pool member has a playable activity.
