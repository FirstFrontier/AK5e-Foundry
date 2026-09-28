# Changelog

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
