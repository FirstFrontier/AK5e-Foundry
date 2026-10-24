# Scope: AK5e Inventor Subclass Implementation & Verification

## Architecture & Module Boundaries
- `ak5e/scripts/inventor-features.mjs`: Core Inventor subclass definitions, Instability calculations, breakdown logic, 31 modifications catalog, contraptions, Mobile Modding, Risk Assessment, and The Big One.
- `ak5e/scripts/specialist-rules.mjs`: Registration of `inventions` resource pool, Inventor DC calculation (`8 + INT + PB`), and Inventor subclass identification.
- `ak5e/scripts/specialist-progression.mjs`: Inventor subclass feature grants and progression (levels 3, 5, 11, 15, 20).
- `ak5e/scripts/specialist-uses.mjs`: Integration of Inventor table-play plans, confirmation dialogs, non-blocking warning overrides, Instability breakdown rolls, undo receipts, and GM relay.
- `ak5e/scripts/specialist-sheet.mjs`: Inventor sheet badges (Inventions pool, Inventor DC, active modifications, Instability score) and action buttons.
- `ak5e/test/inventor.test.mjs`: Unit test suite covering formulas, pool management, all 31 modifications, contraptions, Instability, and table-play.
- `ak5e/test/inventor-adversarial.test.mjs`: Adversarial stress tests covering edge cases, concurrency, breakdown calculations, and undo integrity.
- `ak5e/tools/test-specialist-live.mjs`: Headless browser test exercising GM/player workflows, sheets, dialogs, rolls, and undo in live Foundry V13.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Inventor DC | `8 + INT mod + PB` | M1 | Ch. 3 L5847–5850 |
| 2 | Inventions Pool | Max `@prof * 2`, full on start, refunded on removal | M1 | Ch. 3 L5851–5855 |
| 3 | Equipment Modification Workflow | Apply/remove to non-magical weapon/armor, no duplicates, 1-week expiry | M1 | Ch. 3 L5856–5865 |
| 4 | Instability Calculation | Base 3, +1 per extra mod, +1 per Dangerous mod, -1 Risk Assessment | M1 | Ch. 3 L5950–5956 |
| 5 | Breakdown Roll & Effects | Roll N d6; matching dice trigger `1d8 + 1d8*(Instability-3)` HP loss (min 1 HP); Dangerous breaks item | M1 | Ch. 3 L5952–5956 |
| 6 | Melee Modifications (10) | Boom Module, Burning Edge, Collapsible Weapon, Flexible Weapon, Laser Cutter [Dangerous], Returner, Rotary Blade, Shock Engine, Telescopic Weapon, Trick Weapon | M2 | Ch. 3 L5958–6030 |
| 7 | Ranged Modifications (8) | Arts Cannon [Dangerous], Collapsible Weapon, Explosive Shots, Electrobolts, Flame Gout, Homing Shots, Melee Attachment, Safety Removal | M2 | Ch. 3 L6032–6085 |
| 8 | Armor Modifications (10) | Adrenal Overloader [Dangerous], Artsfield Generator, Camouflage Cloak, Exoskeleton, Jetboots, Life Support, Powered Gauntlet, Refocuser, Shock Absorbers, Wingsuit | M2 | Ch. 3 L6087–6140 |
| 9 | Strange Contraptions (8) | 12 Million Lumen Flashlight, Fun Toy, Musbeast Remover, Needlefly Fumigator, Over-tuned Speaker, Portable Firestarter, Universal Keycard, Unstable Contraption (each 1/LR) | M3 | Ch. 3 L5881–5920 |
| 10 | Mobile Modding | 1 Prowess Action, apply 1 mod to willing ally equipment for 1 min (0 Inventions cost) | M3 | Ch. 3 L5866–5875 |
| 11 | Inventor Prowess Trigger | 1 Prowess when creature activating mod reduces enemy to 0 HP (max 1/turn) | M3 | Ch. 3 L5876–5880 |
| 12 | Risk Assessment | -1 Instability for Speciality weapons, -1 Instability for Inventor-wielded/worn equipment | M3 | Ch. 3 L5922–5927 |
| 13 | Stranger Contraptions (8) | Enhanced versions of the 8 Strange Contraptions at 15th level | M3 | Ch. 3 L5928–5935 |
| 14 | The Big One | 1/LR Action at 20th level: FLASH, SHARD, or QUASAR | M3 | Ch. 3 L5937–5946 |
| 15 | Table-Play & Undo | Confirm before spend, warn without blocking, clamp at 0, no auto-roll, GM relay, undo receipts in flags.ak5e.specialistUses.undo | M4 | WORKFLOW §3.2 |
| 16 | Specialist Sheet Integration | Badges for Inventions, Inventor DC, active modifications list, sheet controls | M4 | R4 & GEMINI.md |
| 17 | Full Specialist Regression | `npm run test:specialist`, `validate-files.mjs`, `verify-generated-content.mjs` | M4 | Acceptance Criteria |
| 18 | Live Headless Browser Test | `test-specialist-live.mjs` with `launchTestBrowser()`, 0 console errors, clean shutdown | M5 | GEMINI.md §5 |
| 19 | Visual Screenshot Inspection | Inspect all captured screenshots per AGENTS.md §6.2 (PASS verdicts) | M5 | AGENTS.md §6.2 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|--------------|--------|
| M0 | Survey & Architecture | Mine rules and map codebase integration points | none | DONE |
| M1 | Core Engine & Instability | Inventor DC, Inventions pool, application/removal, Instability formula, breakdown matching logic, HP loss | M0 | DONE |
| M2 | 31 Modifications Catalog | All melee, ranged, and armor modifications (including 3 Dangerous) | M1 | DONE |
| M3 | Contraptions & Features | Strange/Stranger Contraptions, Mobile Modding, Risk Assessment, The Big One, Prowess trigger | M2 | DONE |
| M4 | Table-Play & Regression | Chat cards, no auto-roll, GM relay, undo receipts, sheet controls, full test suite | M3 | DONE |
| M5 | Live Browser & Visual | Headless Playwright live verification, screenshot review, TODO/DECISIONS updates | M4 | DONE |

## Interface Contracts
### `ak5e/scripts/inventor-features.mjs`
- `calculateInventorDC(actor)`: returns integer `8 + intMod + pb`
- `calculateInstability(item, actor, options)`: returns integer Instability score
- `evaluateBreakdownRoll(rollResults, instability)`: evaluates matching dice, computes HP loss `1d8 + 1d8*(instability-3)`, detects broken equipment if Dangerous
- `getAvailableModifications(itemType, actor)`: lists applicable modifications for weapons/armor
- `applyEquipmentModification(item, modificationId, options)`: attaches modification, spends 1 Invention, calculates new Instability
- `removeEquipmentModification(item, modificationId, options)`: removes modification, refunds 1 Invention
- `MODIFICATIONS_CATALOG`: object describing all 31 modifications with requirements, actions, properties, saves, damage formulas, and dangerous flag
- `CONTRAPTIONS_CATALOG`: object describing Strange (Lv 5) and Stranger (Lv 15) contraptions
