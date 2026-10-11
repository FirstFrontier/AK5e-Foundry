# Changelog

## Unreleased

- Defender increment: add the Juggernaut, Protector and Sentry Branches on the
  Defender use engine (`juggernaut-*`, `protector-*` and `sentry-*` features and
  sheets). They are selectable in Defender progression.
  - New `defender-damage-mods.mjs` applies Superheavy halving, Improved Taunt and
    Greater Improved Shelter in native D&D5e damage application. It acts only on
    Damage applied from a chat card; previews are side-effect free, and the
    consequences are undoable uses.
  - Shelter can record a 10-foot Improved Shelter radius.
  - Sentry gets ranged proficiencies, the Equipment Exchange and a Marksman
    Fighting Style.
  - Fix: progression writes that target the same field now chain their expected
    values. A Fortress or Sentry weapon proficiency no longer fails apply with
    "changed after preview".
  - The module version is not bumped here, because concurrent increments share
    the working tree.

- 0.5.6 four-branch completion: add the guided Fortress workflow, all six
  Munitions, Entrench, Stronghold and Creeping Barrage; account for Stop Their
  Advance's Reaction with overridable warnings and undo. Consume Guardian's
  Not Today on every committed Art mode, including Cantrips; expose Construct
  healing restrictions as public overrides. Retain Chain's level-15 reading of
  three additional targets. Complete Mech-Accord refund-aware undo, held native
  attack continuation, evidence-based legacy recovery, and safe creation/linking
  undo. Retain current-window receipts and validate operation-specific relays.
  Development acceptance and release-pack acceptance
  are tracked separately.

- 0.5.5 Defender increment: add the Guardian branch (`guardian-features.mjs`,
  `guardian-sheet.mjs`) on a new branch-free table-play engine (`play-uses.mjs`,
  `play-uses-sheet.mjs`, `defender-uses.mjs`): Guardian Arts setup with the Guardian
  table, shield Casting Units and the Healing Arts pool; Not Today as an AP-quote
  discount consumed by the next cast; Anaesthesia, Aura of Mercy and The Best Medicine
  with Roll buttons, prompts, readings, the GM relay (validated on the GM's client) and
  undo. Guardian and Fortress are selectable in Defender progression. The Arts adapter
  gains quote-option and consumption hooks. Independent-review fixes for 0.5.3/0.5.4:
  validated Caster relay, drone cap override and public drone card, Army of One ruling
  and notice, Spark upgrade reading, exact over-cap undo, undo past deleted targets.

- 0.5.4 Caster increment: Mech-Accord follows WORKFLOW.md §3.2 (`caster-mech.mjs`).
  Jury Rigging, drone commands, Wolfpack Doctrine, rebuilding and a new Residual
  Energy reading run on the shared Caster use engine with warnings, readings,
  public cards, the GM relay and undo. Jury Rigging's d8s are rolled from the
  card. Technology Modifier, excess Temporary HP, Duplication and Death from Above
  costs and Army of One stacking use the GM's ruling or the player's per-use
  reading instead of blocking; Army of One is no longer suspended. Drone-origin,
  repeat-cast and Originium Spark problems are warnings with Use anyway. Owners
  request Arts Master creation/linking and the GM's client performs it
  (`game.ak5e.caster.requestDrone`). The shared engine gains Token targets,
  AP/currency receipts, a generic roll step and the `apSpent` event.

- 0.5.3 Caster increment: add the Chain branch (`caster-chain.mjs`). Chain Art
  and Ouroboros are cast options with a receipt-backed use, a public card and
  undo; chained tokens become targets on the Art's card, and Ouroboros gives the
  original target Disadvantage on saves from that card this Turn. Subtle Spark
  applies the six effects (and their upgrades) until the start of the Caster's
  next Turn, with Constitution save buttons, the GM relay for unowned Creatures
  and undo. Sparks 6/8/10/12 and Great Chain of Being's Short Rest use are
  resource pools. The Spark cost with several Creatures and upgraded
  Accelerate/Decelerate use a GM ruling or the player's per-use reading. The
  damage pipeline and DR preview accept a signed DR adjustment for Bolster and
  Shred Defences. The Primal/Splash use engine now accepts registered branch
  plans, readings and target kinds. `AUTOMATION_AUDIT.md` is regenerated.

- 0.5.2 Defender increment: add previewed native progression, HP/ASI receipts,
  source proficiencies and starting equipment, all 42 Talent choices and Module
  upgrades/additional Talents. Add the five Shelter/SP workflows with active-GM
  validation, private trigger evidence and retry-safe recipient receipts. Repair
  Leaping Ward's exact Reaction refund and Art-specific guidance, per-Art
  Spellshield sight, damage-correlated native Concentration saves and GM claims,
  and pre-activation Advance activity tracking. Other 37 Talent effects and five
  Defender branches remain manual; release packs and publishing remain separate.

- 0.5.2 Caster increment: add the Primal and Splash branches. Primal covers
  Residual Suffering, Debilitate and Destroy, Elemental Burst, Enduring Affliction
  notes and Cardinal Punishment. Splash covers Controlled Detonation, Splashing
  Cantrips, Safe Zone, Overwhelming Detonation, Implements of Destruction,
  Economics of Violence, All-Consuming and Maximum Burst. Fix found in rendered
  testing: D&D5e re-reads an unprepared activity from the cast's working Item
  clone, so area Arts lost their template and DC. The clone is now re-prepared,
  and area/activation changes target the field D&D5e actually reads. Caster
  feature cards are now de-duplicated per Caster rather than world-wide. The Art
  list shows "1st/2nd/3rd level". Debilitate HP loss and Safe Zone with Maximum
  Burst require GM rulings; other Enduring Affliction overlays and Poison remain
  manual. See `DECISIONS.md` and `CASTER_IMPLEMENTATION.md`.
  Primal and Splash then follow WORKFLOW.md §3.2 (new `caster-primal-splash.mjs`
  and the shared `play-undo.mjs`):
  - Source problems are warnings with **Use anyway**, listed on a public card.
  - Debilitate and Destroy and Safe Zone with Maximum Burst use the GM's ruling
    or the player's per-use reading, never a block.
  - Debilitate's dice are rolled only when the player clicks.
  - Changes to unowned Creatures are applied by the GM's client automatically,
    with a "Not applied yet" retry when no GM is connected.
  - Each use can be undone from its card until combat starts or ends. The hidden
    `encounterEpoch` world setting tracks this window.

- 0.5.1 development repairs: skip unchanged operation-kernel state saves while
  retaining GM authorization and failed-write checks; wrap Standard Bearer panel
  labels; reset disposable browser fixtures, wait for canvas/templates, use a
  configurable private port, exercise interrupted-operation retry, and verify
  persisted state after reload/restart. Defender live checks now fail on Standard
  Bearer save errors. Public APIs, IDs and flag formats are unchanged. Live
  acceptance evidence and remaining limits are recorded in `FOUNDRY_SMOKE_TEST.md`.

- 0.5.0 development increment: add previewed, idempotent Defender setup and
  Defender class helpers (Resilience pool, Shelter with attack-time Disadvantage,
  Reactive, Leaping Defence, Stand Behind Me, Indestructible, Adamantine Defence
  notice), Dreadnought (the Advance with GM-observed Skill Point awards, Crownsplitter,
  Wrecking Wall, Sword of Damocles, Legendary Might) and Artshield (Arts Resistance,
  Spellshield, Arts Absorption and Expel, Empowered Strikes, Reactive Defence,
  Concentration Breaker, Stormchaser, Leaping Ward, Eye of the Storm), with a new
  exported GM-run `grantOperatorSP`. Not rendered-verified. Known limitations: posted
  rolls cannot be rewritten (Leaping Defence, Adamantine Defence, Spellshield and Eye of
  the Storm immunity are guided procedures); Defender Talents, including those that grant
  Skill Points or read Shelter, remain descriptive; the other five Branches have class-level
  support only. See `DEFENDER_IMPLEMENTATION.md` and `DECISIONS.md`. Review fixes: Defender state is
  now saved by changed leaf (no stale-copy overwrites), a Long Rest removes the Eye of the Storm
  template, and setup keeps a Legendary Might effect the GM switched off.

- 0.4.0 development increment: add explicit Caster setup/update and reviewed
  named-Art mappings, source progression/talent choices, Growing Power quotes,
  separate receipt-backed AP/cast events and recovery evidence. Add Core
  borrowed Arts/recovery/Empowered/elemental/Signature controls, Mystic Charge
  and burst/ritual/initiative/cast workflows, and player-owned Mech-Accord
  drones, repairs, reactions, origin/repeat casts and rebuild procedures.
  Unresolved rulings require a GM record; native action economy, visibility,
  rest completion and existing talent/Art effect boundaries remain visible.
  Review corrections preserve unfinished Burst evidence across Long Rest,
  keep natural-20 accuracy while suppressing Burst critical damage, require
  an explicit GM exception for pool replacement, use persistence-safe receipt
  keys, and retain the drone's printed passive Perception despite AK5e skill defaults.
  Repairs without excess healing preserve existing temporary HP; setup previews
  count only missing grants and duplicate casts revalidate the original targets.
  This increment does not create or publish release compendium packs.

- Add the P1 kernels as calculation/event APIs under `game.ak5e` (`resourcePools`,
  `triggers`, `damagePipeline`, `tipOfTheSpear`): resource pools with a safe formula
  evaluator and once-per-turn limiter (SI-2), normalised combat/attack/damage events,
  riders and a Reaction budget (SI-3), the ordered damage/HP-loss/Temp HP/healing
  pipeline (SI-4), and Tip of the Spear extracted from Standard Bearer (SI-12).
  Standard Bearer behaviour, flags and stored data are unchanged; no class feature is
  newly automated. Unresolved rulings are explicit parameters (see `DECISIONS.md`).

- Add the SI-1 operation kernel (`scripts/operation-kernel.mjs`) and shared sheet
  helpers (`scripts/operation-panel.mjs`), extracted from Standard Bearer with no
  behaviour, flag-name or stored-data change. Operator Skills now uses the shared
  per-Actor queue. New kernel tests use a non-Standard-Bearer branch.

## 0.3.8 (P0 development content)

- Correct nine Chapter 3 feature boundaries while retaining full aggregate
  references. Add 350 standalone Talents, Brawling Techniques, Engagements,
  Instructions and Rituals; enrich 68 existing Therapies, Tactics, Inventor
  modifications and Heavy Duty upgrades without duplicate Items.
- Preserve all 1,106 existing Chapter 3 source IDs. Use scoped revisions and
  previous-description hashes to migrate canonical descriptions while retaining
  customized descriptions, authored fields, activities, effects and Actor copies.
  Accept equivalent V13 line-break serialization and render four-star option
  labels as valid HTML without changing raw source text.
- Add explicit GM-only `installRollTables()` for four native development-World
  tables, with exact wording, stable result IDs, replacement and manual outcomes.
- Record confirmed source conflicts, corrected audit assumptions and unresolved
  branch concerns. Release packs, gameplay rulings and publishing remain later
  work. P0 content and rendered Foundry acceptance pass, including GM/player
  interaction and reload/server-restart persistence; evidence and environment
  limitations are recorded in `FOUNDRY_SMOKE_TEST.md`.

## 0.3.7 (development; Foundry UI validation pending)

- Add a Standard Bearer branch controller with previewable, idempotent setup,
  a source-defined Battle Standard, persistent noncombat flag prop and linked
  aura previews, confirmed operations, GM-authoritative player requests, and
  recoverable operation receipts.
- Add confirmed Tip of the Spear, Fervour, six Battlecry/Chorus workflows,
  Symbol of Authority, Power Projection, Proclaimer, and The Last Stand
  procedures, including cooldowns, resource costs, target selection and
  source-defined recovery where represented by the helper.
- Keep table actions and narrative eligibility that Foundry cannot establish
  under user/GM confirmation. Standard Bearer unit tests and the source-backed
  automation audit are present; rendered clean-World inspection and persistence
  validation remain pending. This repository version is not the installed 0.3.5.

## 0.3.6

- Correct damage charging at zero HP and reject unavailable Spell Save DC
  prerequisites before spending SP. Preserve healing, immunity, charging limits,
  Skill-origin exclusions, opt-in state, and independent synthetic pools.
  Require an active Dying state before its damage-save API is called.
- Add configurable Ctrl+T/Shift targeting, local area previews, GM validation,
  occupied-cell geometry, source-aware walls, Grand Cross and Cluster Bombs.
- Offer native rolls for reviewed profiles and controls for subsequent,
  recurring, delayed, movement, and ending phases. Applications remain manual.
- Persist activation provenance and recoverable receipts; canceled placement
  spends nothing and retries cannot charge twice. Whisper hidden-token details.
- Add a previewable GM update preserving edited activities, IDs, counters,
  choices, and SP. Audit all 320 exact source rows and document manual mappings
  and special SP exceptions in `SP_SKILL_AUDIT.md`.

## 0.3.5

- Add 20 Terra nation themes to native D&D5e character sheets, including light
  and dark palettes, distinct header motifs, and a locally bundled ornament.
- Follow AK5e nationality Items automatically, with a per-character Sheet Theme
  menu for an explicit nation or the original sheet. Store the choice under
  `flags.ak5e.sheetTheme`.

## 0.3.4

- Prompt AK5e character owners for source-approved Operator Skills at class
  levels 2/7/14, including catch-up, branch options, full rule previews and
  Choose Later with a sheet shortcut.
- Save fixed choices, preserve SP and automation opt-in, deduplicate concurrent
  owner requests, and recover interrupted grants without duplicate Items.
- Defer prompts until native advancement completes and notify one active owner.
  Preserve existing Skills; ambiguous mappings require GM reconciliation.
- Keep exceptional grants, retraining, Alternate Classes, Breakthrough exchanges
  and branch-specific SP modifiers manual. Installed module deployment and
  locked release-pack export remain separate tasks.
- Preserve current AK5e state and learned Skill Items when native advancement
  commits its earlier Actor snapshot; defer manual choices while that menu is open.
- Pass all 123 repository tests, including 15 new progression regressions, and
  isolated Foundry 13.351 / D&D5e 5.3.3 owner/GM browser checks and persistence.

## 0.3.3

- Add all 320 individual Chapter 3 Operator Skills with exact source effects and
  structured costs, charging methods, activation, duration, and attribution.
- Add opt-in shared SP charging from learned Skills, stacked methods, limits,
  GM-authoritative owner requests, and persistent event/operation receipts.
- Integrate forward combat turns, targeted attacks including misses, and actual
  native HP applications; preserve Skill origins and confirm ambiguous events.
- Add activation, Instant/round/Long Rest lifecycle, manual ending/extension,
  Details/NPC controls, and source-backed GM adjustments. Individual effects,
  class progression, and source-specific SP exceptions remain manual.
- Preserve legacy manual Actors until explicit adoption. Deployment and release
  compendium exports remain separate.
- Persist independent SP for unlinked token Actors and deduplicate completed
  Long Rest notifications. Failed/prevented commits leave SP unchanged.
- Pass 108 repository tests (20 SP regressions) and native Foundry 13.351 /
  D&D5e 5.3.3 checks for setup, attacks, player HP/rests, two owners/two GMs,
  synthetic Actors, all 320 Skill Items, reload and server-restart persistence.

## 0.3.2

- Add 81 individual enhanced weapon Items with inherited base stats, rarity,
  versatile/thrown modes and native ordinary-weapon Attack/Damage bonuses.
- Give Staff variants Conductive 2/3/4, Wand variants 1/2/3, and launchers a
  manual Splash Martial DC increase with damage-only activities. Conductive,
  Splash, Brace and Loading remain manual.
- Move the four combined upgrade entries into Magic Item References, preserving
  IDs, custom names/text/fields and Actor-owned copies on explicit GM installation.
- Add complete variant/source and migration regressions; enhanced weapons stay
  out of starting-equipment choices. Release compendium exports remain pending.

## Development: expanded temporary tags

- Add 53 Origin, Art and equipment profiles, owned weapon enchantments, exact
  concentration links, OR expiry, distinct next-turn deadlines and replacement
  groups. Keep applied profiles after consuming their source item.
- Add Flock member counters, upcast Missile Barrier motes, removable Treatise
  cards and scoped save/use/damage/antidote confirmations.
- Support source-guided custom class/NPC and aura tags. Conditional rolls,
  Damage, costs and spatial eligibility remain manual; clean-World checks are
  pending. Add 16 tag regressions; preserve owner/GM manual removal.

## 0.3.1

- Add inline AP controls, Arts summaries, costs, availability filtering and
  Casting Unit shortcuts to registered native character and NPC sheets.
- Simplify casting choices and show projected AP and specific blockers.
- Separate configuration saves from spell adoption; add Arts-only NPC recovery,
  direct GM casting-rule controls and stat-block reference links.
- Add DOM and activity regressions. Special casting workflows, class/pool
  automation, Conductive benefits and cantrip bonuses remain outside this update.
- Validate core native sheet/casting flows in a clean Foundry 13.351 / D&D5e
  5.3.3 World with GM, player and observer clients. See the smoke-test record for
  the tested scope and remaining release checks.
