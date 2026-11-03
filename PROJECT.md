# Project: AK5e Base Character Classes (Vanguard, Supporter, Specialist, Medic)

## Architecture

The base character classes implementation models four core classes from AK5e Chapter 3 (`AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`) for Foundry VTT Version 13 and the D&D5e system.

The architecture follows a strict 6-module structure per class, matching established project patterns (`guard-*`, `defender-*`, `marksman-*`):
1. **`<class>-rules.mjs`**: Pure functional calculations: hit dice, HP formulas, level step tables, DCs, saving throw options, weapon/armor proficiencies, fighting style options, and profile checks. Pure logic, zero Foundry dependencies.
2. **`<class>-features.mjs`**: Feature mechanics, resource pool registration (`resource-pools.mjs`), passive and active modifiers, rest recovery triggers, and die-rolling hooks.
3. **`<class>-setup.mjs`**: `preview<Class>Setup` and `apply<Class>Setup`. Pure preview and transactional embedded document creation from `chapter-three-content.mjs`, verified via `contextKey` hash. Retains existing authored items and customizations (idempotency).
4. **`<class>-progression.mjs`**: Level 1–20 choice resolution, saving throw and skill validation, equipment grant resolution, ASI and talent allocation, and `preview<Class>Progression` / `apply<Class>Progression`.
5. **`<class>-uses.mjs`**: Table-play active abilities powered by `createPlayUses({ ns: "<class>Uses" })`. Enforces WORKFLOW §3.2:
   - Confirmation dialogs for all active uses;
   - Non-blocking warnings with "Use anyway" overrides;
   - Resource clamping at 0 with public chat card shortfall notices;
   - Automatic GM relay for unowned target modifications;
   - Interactive roll buttons on chat cards (no auto-rolled dice);
   - Encounter-window undo receipts under `flags.ak5e`.
6. **`<class>-sheet.mjs`**: ActorSheetV2 integration:
   - Status badge and controls button injected into `.tab[data-tab="features"]`;
   - Window header control button;
   - Interactive dialog for triggering active features;
   - Recent undo receipt list dialog.

All classes are exposed canonically on `game.ak5e` and wired into Foundry lifecycle hooks in `ak5e/scripts/ak5e.mjs`.

## Code Layout

```
ak5e/scripts/
├── vanguard-rules.mjs
├── vanguard-features.mjs
├── vanguard-setup.mjs
├── vanguard-progression.mjs
├── vanguard-uses.mjs
├── vanguard-sheet.mjs
├── supporter-rules.mjs
├── supporter-features.mjs
├── supporter-setup.mjs
├── supporter-progression.mjs
├── supporter-uses.mjs
├── supporter-sheet.mjs
├── specialist-rules.mjs
├── specialist-features.mjs
├── specialist-setup.mjs
├── specialist-progression.mjs
├── specialist-uses.mjs
├── specialist-sheet.mjs
├── medic-rules.mjs
├── medic-features.mjs
├── medic-setup.mjs
├── medic-progression.mjs
├── medic-uses.mjs
├── medic-sheet.mjs
└── ak5e.mjs (registration & lifecycle wiring)

ak5e/test/
├── base-classes-fixture.mjs
├── vanguard-rules.test.mjs
├── vanguard-features.test.mjs
├── vanguard-progression.test.mjs
├── supporter-rules.test.mjs
├── supporter-features.test.mjs
├── supporter-progression.test.mjs
├── specialist-rules.test.mjs
├── specialist-features.test.mjs
├── specialist-progression.test.mjs
├── medic-rules.test.mjs
├── medic-features.test.mjs
└── medic-progression.test.mjs

ak5e/tools/
└── test-base-classes-live.mjs
```

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---|---|---|---|
| 1 | Test Harness & Mocking Fixture | In-memory Foundry document mocks and test runners for 4 base classes | M1 | Survey |
| 2 | Vanguard Chassis | 1d8 HD, 8+CON base HP, light armor/shields/melee, messenger kit, Dex+(Str/Cha) saves, 3 skills | M2 | Ch. 3 L7917–7927 |
| 3 | Vanguard Landstrider | +10 ft walking speed, attack hit grants Nimble (no AoO from hit target for the turn) | M2 | Ch. 3 L7987–7993 |
| 4 | Vanguard Tip of the Spear | 1d6 roll table applied to ally within 60 ft; cumulative; #2 additive THP | M2 | Ch. 3 L7994–8008 |
| 5 | Vanguard Quick off the Mark | Add Proficiency Bonus to Initiative rolls | M2 | Ch. 3 L8016–8018 |
| 6 | Vanguard Extra Attack | 2 attacks on Attack action at level 5 | M2 | Ch. 3 L8031–8033 |
| 7 | Vanguard Uncanny Dodge | Reaction to halve attack damage against self from seen attacker at level 11 | M2 | Ch. 3 L8040–8042 |
| 8 | Vanguard Directed Engagement | Reaction at level 15 to choose Tip of the Spear effect instead of rolling | M2 | Ch. 3 L8046–8048 |
| 9 | Vanguard Lightspeed | Second turn in Round 1 of combat at Initiative - 10 at level 18 | M2 | Ch. 3 L8049–8053 |
| 10 | Vanguard Approaching Storm | +floor(Level/2) damage on damage rolls in Round 1 of combat at level 20 | M2 | Ch. 3 L8054–8058 |
| 11 | Vanguard Idempotent Progression | Level 1–20 setup and progression with contextKey hashing and no duplicate items | M2 | Ch. 3 L7949–7973 |
| 12 | Vanguard Table Play & Uses | Confirmation dialogs, warnings, shortfall cards, GM relay, undo receipts | M2 | WORKFLOW §3.2 |
| 13 | Supporter Chassis | 1d6 HD, 6+CON base HP, light armor/shields/melee, tool/vehicle, 2 saves from Con/Cha/Wis, 3 skills | M3 | Ch. 3 L6594–6605 |
| 14 | Supporter Provide Aid | Bonus Action grant Aid Die (d8->d10->d12) to ally within 60 ft for 10 min | M3 | Ch. 3 L6630–6640 |
| 15 | Supporter Aid Die Pool | `aidDie` pool: max = chosen ability mod (Int/Wis/Cha), Long Rest recovery | M3 | Ch. 3 L6637–6639 |
| 16 | Supporter Advanced Aid | Riders when Aid Die rolled: Crit +1 (attack), 2nd die (skill), THP (save/heal), 10ft splash (damage) | M3 | Ch. 3 L6652–6663 |
| 17 | Supporter Lighten the Load | Reaction at level 11 on ally rolling Aid Die: grant free Aid Die to another ally | M3 | Ch. 3 L6673–6675 |
| 18 | Supporter Ever Reliable | Turn start regain 1 Aid Die if at 0; Short Rest recover ceil(max/2) at level 15 | M3 | Ch. 3 L6679–6685 |
| 19 | Supporter Self-Supportive | Turn start regain special personal Aid Die at level 18 | M3 | Ch. 3 L6686–6688 |
| 20 | Supporter Will Into Being | Add Proficiency Bonus to any Aid Die rolled at level 20 | M3 | Ch. 3 L6689–6693 |
| 21 | Supporter Idempotent Progression | Level 1–20 setup and progression with contextKey hashing and no duplicate items | M3 | Ch. 3 L6555–6579 |
| 22 | Supporter Table Play & Uses | Confirmation dialogs, warnings, shortfall cards, GM relay, undo receipts | M3 | WORKFLOW §3.2 |
| 23 | Specialist Chassis | 1d8 HD, 8+CON base HP, light/med armor, shields, light melee/ranged, 2 tools, Dex+(Wis/Cha) saves, 3 skills | M4 | Ch. 3 L5178–5188 |
| 24 | Specialist Weapon Specialisation | Choose Melee (8 styles) or Ranged (7 styles) combat styles | M4 | Ch. 3 L5244–5299 |
| 25 | Specialist Show Your Style & Prowess | `prowess` pool (max = PB, +1 on SR/LR); Mark of a Specialist check reroll with refund | M4 | Ch. 3 L5312–5320 |
| 26 | Specialist Weapon Adept | Extra attack (melee/ranged) + damage reroll 1-2 (melee) or attack reroll 1 (ranged) at level 6 | M4 | Ch. 3 L5321–5327 |
| 27 | Specialist Weapon Expertise | Crit +1 / bonus damage die (melee) vs 3d20 keep highest / advantage (ranged) at level 12 | M4 | Ch. 3 L5336–5342 |
| 28 | Specialist Falling Upwards | It's All Skill: Reaction before save roll, spend 3 Prowess to auto-succeed at level 17 | M4 | Ch. 3 L5346–5350 |
| 29 | Specialist Weapon Mastery | Once/turn hit +floor(Lvl/2) damage (melee) vs once/turn double PB attack (ranged) at level 18 | M4 | Ch. 3 L5351–5357 |
| 30 | Specialist Idempotent Progression | Level 1–20 setup and progression with contextKey hashing and no duplicate items | M4 | Ch. 3 L5202–5226 |
| 31 | Specialist Table Play & Uses | Confirmation dialogs, warnings, shortfall cards, GM relay, undo receipts | M4 | WORKFLOW §3.2 |
| 32 | Medic Chassis | 1d6 HD, 6+CON base HP, light shields ONLY, light melee, 1 tool, 2 saves from Con/Int/Wis, Medicine + 2 skills | M5 | Ch. 3 L4582–4593 |
| 33 | Medic Arts Casting | Healing Arts Special Pool always prepared, AP table (3->35), Max Art Level table (1->9) | M5 | Ch. 3 L4605–4615 |
| 34 | Medic Life Support Pool | `lifeSupport` pool: 20->170 step table, overMax allowed, Long Rest recovery | M5 | Ch. 3 L4620–4648 |
| 35 | Medic Touch Heal | Action spend X Life Support to restore X missing HP (1:1 conversion); Construct warning | M5 | Ch. 3 L4647–4651 |
| 36 | Medic Preserver | Spend 5 Life Support on healing/THP roll to reroll any number of dice | M5 | Ch. 3 L4654–4655 |
| 37 | Medic Urgency of Treatment | Spend multiples of 10 Life Support to reduce Healing Art AP cost by 1 per 10 spent | M5 | Ch. 3 L4656–4657 |
| 38 | Medic Medical Expertise | Double proficiency bonus for Medicine skill checks at level 1 | M5 | Ch. 3 L4658–4660 |
| 39 | Medic Self-Defence Protocol | Learn standard Arts pool <= 5th level; AP cost reduced by 1 (Lv 5) / 2 (Lv 11) | M5 | Ch. 3 L4698–4702 |
| 40 | Medic Resuscitation | 1/Long Rest free Revivify cast at level 12 | M5 | Ch. 3 L4709–4713 |
| 41 | Medic To Rob the Ferryman | Revivify restores 3 * Medic Level HP at level 18 | M5 | Ch. 3 L4717–4719 |
| 42 | Medic Chosen of Asclepius | Optional maximum value on all healing dice at level 20 | M5 | Ch. 3 L4720–4722 |
| 43 | Medic Idempotent Progression | Level 1–20 setup and progression with contextKey hashing and no duplicate items | M5 | Ch. 3 L4620–4644 |
| 44 | Medic Table Play & Uses | Confirmation dialogs, warnings, shortfall cards, GM relay, undo receipts | M5 | WORKFLOW §3.2 |
| 45 | ActorSheetV2 Panels & Header Controls | Feature tab panels, resource badges, header buttons, action dialogs for all 4 classes | M6 | WORKFLOW §3.2, R4 |
| 46 | Canonical Module Registration | `game.ak5e.<class>` exposure, pool definitions, sheet hooks in `ak5e.mjs` | M6 | System Wiring |
| 47 | In-Foundry Live Browser Suite | Headless Chromium Playwright test on port 30175 with launchTestBrowser() | M7 | AGENTS §6.2, R5 |
| 48 | Subagent Screenshot Inspection | Delegation of screenshots to subagent validator with PASS/FAIL report | M7 | AGENTS §6.2 |
| 49 | Full Test Suite Pass & Static Cleanliness | 100% pass on npm test, validate-files.mjs, verify-generated-content.mjs | M7 | Acceptance Criteria |

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Test Track Infrastructure & Fixtures | `base-classes-fixture.mjs`, unit test scaffolding, package.json scripts | none | DONE |
| M2 | Vanguard Base Class | `vanguard-rules.mjs`, `vanguard-features.mjs`, `vanguard-setup.mjs`, `vanguard-progression.mjs`, `vanguard-uses.mjs`, and unit tests | M1 | DONE |
| M3 | Supporter Base Class | `supporter-rules.mjs`, `supporter-features.mjs`, `supporter-setup.mjs`, `supporter-progression.mjs`, `supporter-uses.mjs`, and unit tests | M1 | DONE |
| M4 | Specialist Base Class | `specialist-rules.mjs`, `specialist-features.mjs`, `specialist-setup.mjs`, `specialist-progression.mjs`, `specialist-uses.mjs`, and unit tests | M1 | IN_PROGRESS |
| M5 | Medic Base Class | `medic-rules.mjs`, `medic-features.mjs`, `medic-setup.mjs`, `medic-progression.mjs`, `medic-uses.mjs`, and unit tests | M1 | DONE |
| M6 | Sheet Integration & Registration | `vanguard-sheet.mjs`, `supporter-sheet.mjs`, `specialist-sheet.mjs`, `medic-sheet.mjs`, `ak5e.mjs` wiring | M2, M3, M4, M5 | PLANNED |
| M7 | Live In-Foundry Browser Validation & Audit | `test-base-classes-live.mjs`, `/tmp/run-base-classes-live.sh`, screenshot inspection, static checks | M6 | PLANNED |

## Interface Contracts

### `<class>-rules.mjs`
- `calculate<Class>Profile(actor)` -> `{ level, pb, hp, saves, proficiencies, resources, features }`
- Pure math, no database writes.

### `<class>-setup.mjs`
- `preview<Class>Setup(actor)` -> `{ creates, kept, contextKey }`
- `apply<Class>Setup(actor, { confirmed, contextKey })` -> `{ success, createdCount, keptCount }`

### `<class>-progression.mjs`
- `inspect<Class>Fields(actor, choices)` -> schema options for saves, skills, gear, ASIs, talents
- `preview<Class>Progression(actor, choices)` -> `{ plan, contextKey }`
- `apply<Class>Progression(actor, { confirmed, contextKey, choices })` -> `{ success, updatedFields }`

### `<class>-uses.mjs`
- Returns an instance of `createPlayUses({ ns: "<class>Uses", label: "<Class>" })`
- Plans: `execute(actor, command, data)`
- Enforces WORKFLOW §3.2 (confirmations, warnings, clamp-at-0, unowned-target GM relay, undo receipts).

### `<class>-sheet.mjs`
- `open<Class>Controls(actor)` -> renders DialogV2
- `register<Class>SheetHooks()` -> hooks `renderActorSheetV2` and `getHeaderControlsApplicationV2`
