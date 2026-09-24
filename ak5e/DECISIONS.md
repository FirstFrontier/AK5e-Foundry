# AK5e Foundry implementation decisions

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
cover pure rules and mocked activity calls; they do not establish clean-World
compatibility. Simultaneous operations by different clients are not serialized;
use one operating client per Actor. Class progression and source-specific modes
remain manual. GM exception configuration records its source; ritual eligibility
is a GM-adjudicated mapping, not inferred from class or spell properties, and the
additional ten minutes must be tracked manually. Casting Unit selection checks
equipped state but does not yet validate the equipment property or implement
Conductive/Infected consequences. Cantrip turn bonuses and pool grants are pending.

## Compendium release step

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
