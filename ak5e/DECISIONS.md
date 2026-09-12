# AK5e Foundry implementation decisions

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
