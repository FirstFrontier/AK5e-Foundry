# AK5e Foundry implementation decisions

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
