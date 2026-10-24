# Scope: AK5e Specialist Base Class and Subclasses (Executor, Hookmaster, Infuser)

## Architecture

The Specialist implementation provides complete level 1–20 character class rules, subclass features, table-play interactions (WORKFLOW §3.2), ActorSheetV2 controls, unit/adversarial tests, and headless Playwright verification in Foundry VTT v13 (dnd5e 5.3.3).

### Module Layout
1. **`ak5e/scripts/specialist-rules.mjs`**: Pure functional calculations: hit dice (1d8), HP formulas, level step tables, DCs (`specialistDC`, `martialDC`, `infuserDC`), saving throw options, weapon/armor proficiencies, fighting style options (8 melee, 7 ranged), profile checks, and exports (`isSpecialist`, `isExecutor`, `isHookmaster`, `isInfuser`).
2. **`ak5e/scripts/specialist-features.mjs`**: Core feature predicates, resource pool registration (`prowess`), rest recovery hooks.
3. **`ak5e/scripts/specialist-setup.mjs`**: Idempotent `previewSpecialistSetup` and `applySpecialistSetup` with deterministic `contextKey`.
4. **`ak5e/scripts/specialist-progression.mjs`**: Level 1–20 choice resolution, saving throw and skill validation, equipment grant resolution, ASI (7 levels) and talent allocation, and `previewSpecialistProgression` / `applySpecialistProgression`.
5. **`ak5e/scripts/executor-features.mjs`**: Executor subclass mechanics (Hunter/Bodyguard path, Deathmark state tracking, Sweeper/Smokescreen, Preysense/Dangersense, In for the Kill/Blade Shield, Mortal Blow/Ultimate Sword and Shield).
6. **`ak5e/scripts/hookmaster-features.mjs`**: Hookmaster subclass mechanics (Hooked weapon conversion, Big Boot, King of the Urban Jungle, Bound in Rope, Wrangler, Mighty Push, Spider's Essence, Scorpion Sting).
7. **`ak5e/scripts/infuser-features.mjs`**: Infuser subclass mechanics (Infuser DC, Principle of Double Effect, 8 Alchemical Infusions, Leverage CON save workflow, New Concoctions, Double-Blind Trial, Stimpack, Excessive Dosing, To Defy Science).
8. **`ak5e/scripts/specialist-uses.mjs`**: Table-play active abilities powered by `createPlayUses({ ns: "specialistUses" })`. Enforces WORKFLOW §3.2:
   - Confirmation dialogs for all active uses;
   - Non-blocking warnings with "Use anyway" overrides;
   - Resource clamping at 0 with public chat card shortfall notices;
   - Automatic GM relay for unowned target modifications via `validateTarget`;
   - Interactive roll buttons on chat cards (no auto-rolled dice);
   - Encounter-window undo receipts under `flags.ak5e.specialistUses.undo`.
9. **`ak5e/scripts/specialist-sheet.mjs`**: ActorSheetV2 integration:
   - Status badges (.ak5e-specialist-badge) and controls button injected into `.tab[data-tab="features"]`;
   - Window header control button;
   - Interactive dialog for triggering active features;
   - Recent undo receipt list dialog.
10. **`ak5e/scripts/ak5e.mjs`**: Canonical module registration:
    - Exposes `game.ak5e.specialist`;
    - Hooks `init`, `ready`, `renderActorSheetV2`, `getHeaderControlsApplicationV2`, and `createChatMessage` (relay).

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---|---|---|---|
| 1 | Specialist Class Identification & Exports | `isSpecialist`, `isExecutor`, `isHookmaster`, `isInfuser` export functions in `specialist-rules.mjs` | M1 | Codebase Survey |
| 2 | Canonical Module Registration & Hooks | Expose `game.ak5e.specialist`, register lifecycle hooks, sheet hooks, and chat relay in `ak5e.mjs` | M1 | Architecture |
| 3 | Prowess Resource Pool Registration | Standard system-wide pool registration in `resource-pools.mjs` (max `@prof`, +1 SR, +1 LR) | M1 | Ch. 3 L5312–5320 |
| 4 | Base Specialist Chassis & Progression | 1d8 HD, 8+CON base HP, proficiencies, 1300 LMD/gear, 7 ASIs, talents, Fighting Styles | M1 | Ch. 3 L5161–5493 |
| 5 | Base Table-Play Uses | Mark of a Specialist, Weapon Expertise, Falling Upwards (It's All Skill), Weapon Mastery, Defensive Style | M1 | WORKFLOW §3.2 |
| 6 | Specialist ActorSheetV2 Panel & Badges | Inject `.ak5e-specialist-sheet-panel` into Features tab: Prowess badge, subclass badges (Deathmark, Hook, Infusions), Open Specialist Controls button | M1 | WORKFLOW §3.2, R4 |
| 7 | Specialist Window Header Control | Inject Specialist action icon in `ActorSheetV2` window header | M1 | Architecture |
| 8 | Interactive Controls & Undo Dialogs | `openSpecialistControls()` dialog for triggering actions and inspecting/reverting undo receipts | M1 | WORKFLOW §3.2 |
| 9 | Specialist CSS Styles | Add `.ak5e-specialist-badge` styles in `ak5e/styles/ak5e.css` | M1 | Styling |
| 10 | Executor Path Choice | Hunter vs Bodyguard path selection at Level 1 | M2 | Ch. 3 L5501–5505 |
| 11 | Deathmark State Tracking | State machine for Deathmark (held vs marked token, transfers on attack, returns on 0 HP/turn end, +3 SP & Disengage reaction on return, +3 SP & BA Hide while held, +1d4/+2d4/+3d4 damage scaling) | M2 | Ch. 3 L5506–5516 |
| 12 | Executor Path Benefits | Hunter +1 crit range vs Bodyguard 10 ft attack redirection | M2 | Ch. 3 L5512–5516 |
| 13 | In Every Shadow | Level 5: Climb/Swim speed = Walking speed; Stealth proficiency/expertise | M2 | Ch. 3 L5517–5523 |
| 14 | Sweeper & Smokescreen | Level 5 Prowess spends: Sweeper (Hunter reach +5 ft multi-attack mark cycle) vs Smokescreen (Bodyguard 10 ft darkness + ally reaction move) | M2 | Ch. 3 L5529–5541 |
| 15 | Executor Prowess Triggers | Gain 1 Prowess on marked 0 HP (1/turn), Hunter >=30 single-attack dmg, Bodyguard 10 ft 0-dmg ally attack | M2 | Ch. 3 L5542–5548 |
| 16 | Preysense & Dangersense | Level 11: Preysense (Hunter +1 crit die & Bleeding) vs Dangersense (Bodyguard reaction move together out of save AoE) | M2 | Ch. 3 L5549–5555 |
| 17 | In for the Kill & Blade Shield | Level 15: In for the Kill (Hunter mark transfer grants Vulnerability to Specialist attacks) vs Blade Shield (Bodyguard reaction attack subtracting PB from enemy attack) | M2 | Ch. 3 L5556–5562 |
| 18 | Mortal Blow & Ultimate Sword/Shield | Level 20: Mortal Blow (Hunter 1/LR Action, DEX save, 10d8 HP loss doubled if Bleeding, bypasses DR/Resistance) vs Ultimate Sword/Shield (Bodyguard Resistance to marked, free Blade Shield, reaction mark transfer) | M2 | Ch. 3 L5563–5571 |
| 19 | Executor Table-Play Plans & Undo | Full table-play plans, warnings, interactive rolls, GM relay, and undo receipts for Executor | M2 | WORKFLOW §3.2 |
| 20 | Hooked Weapon Conversion | Convert Slashing/Piercing non-Two-Handed melee weapon (free starting or 200 LMD + 1 hr); gains Two-Handed, Thrown (30/- or 50/- at Lv 15, returning), STR ranged attack/dmg, 10 ft pull on <= +1 size; reversible | M3 | Ch. 3 L5588–5598 |
| 21 | Big Boot | Level 5: 10 ft push on Unarmed Strike vs <= +1 size | M3 | Ch. 3 L5618–5620 |
| 22 | King of the Urban Jungle | Level 5: 20 ft pre-move -> Flying Speed = 2x Hook range, cannot attack with hook while flying, immediate melee strike deals +PB damage and doubles forced movement; Lv 15 Swing to Safety falling reaction | M3 | Ch. 3 L5621–5627 |
| 23 | Bound in Rope | Level 5: 1 Prowess Action, DEX save vs Martial DC -> Grappled, 15 ft BA drag, Action hogtie within 5 ft, locks Hook while grappling | M3 | Ch. 3 L5635–5642 |
| 24 | Wrangler | Level 5: 1 Prowess Action vs > +1 size, DEX save vs Martial DC -> latch and share space, Advantage on attacks, optional -5 attack penalty to ignore DR | M3 | Ch. 3 L5643–5649 |
| 25 | Hookmaster Prowess Triggers | Gain 1 Prowess on causing environmental/falling/collision damage, or >45 ft flying movement in a turn | M3 | Ch. 3 L5650–5652 |
| 26 | Mighty Push | Level 11: PB/LR Action within 5 ft, STR save vs Martial DC, interactive 8d6 roll button + 20 ft knockback, half dmg + 10 ft on save, collision damage | M3 | Ch. 3 L5653–5657 |
| 27 | Spider's Essence | Level 15: Longer Hook (50/- range), Spider's Thread (50 ft climbing speed aura), Swing to Safety falling reaction | M3 | Ch. 3 L5658–5666 |
| 28 | Scorpion Sting | Level 20: 1/LR Action within Hook range, auto-fail DEX save if Grappled/Hooked, pull to 5 ft, 6 advantaged attacks + half level weapon damage | M3 | Ch. 3 L5667–5674 |
| 29 | Hookmaster Table-Play Plans & Undo | Full table-play plans, warnings, interactive rolls, GM relay, and undo receipts for Hookmaster | M3 | WORKFLOW §3.2 |
| 30 | Infuser DC Calculation | Exact formula `20 - INT - PB` per DECISIONS.md L465 with optional GM ruling toggle for `8 + INT + PB` | M4 | Ch. 3 L5688–5690 |
| 31 | Principle of Double Effect | Pharmacology Kit proficiency, Alchemical Infusions pool (`2*PB/LR`), 5 ft range (30 ft at Lv 11), 1 min duration, max 1 active infusion/creature, Construct/Undead guard | M4 | Ch. 3 L5692–5700 |
| 32 | All 8 Alchemical Infusions & Leverage | Adrenaline Trigger, Flight Reflex Stimulant, Focus Heightener, Hesitation Suppressor, Muscle Strengthener, Procoagulant, Respiration Stimulant, Sensation Nulling; Leverage CON save workflow (pass = benefit, fail = benefit + Dazed & Leverage lockout) | M4 | Ch. 3 L5782–5823 |
| 33 | New Concoctions | Level 5: Neurological Inhibitor (Berserk) & Bungarotoxin (Paralyzed) added to Pharmacology Kit Toxicology | M4 | Ch. 3 L5705–5726 |
| 34 | Double-Blind Trial | Level 5: BA, 1 Prowess + 1 Infusion -> interactive 1d6 roll applying corresponding Toxin to untoxined weapon | M4 | Ch. 3 L5732–5743 |
| 35 | Infuser Prowess Triggers | Gain 1 Prowess on Poisoned/Toxined creature drops to 0 HP, or 1/round when Infusion turns failure into success | M4 | Ch. 3 L5745 |
| 36 | Stimpack | Level 11: 30 ft range, Questionable Rejuvenation interactive 1d10 Temp HP roll on apply and save success, additive with Procoagulant | M4 | Ch. 3 L5747–5754 |
| 37 | Excessive Dosing | Level 15: Succumb (+PB Toxin DC) & Toxic Shock (Poisoned rider on failed Toxin save) | M4 | Ch. 3 L5758–5764 |
| 38 | To Defy Science | Level 20: 1/LR Action within 30 ft, 1-min Invulnerability effect preventing all HP loss | M4 | Ch. 3 L5765–5770 |
| 39 | Infuser Table-Play Plans & Undo | Full table-play plans, warnings, interactive rolls, GM relay, and undo receipts for Infuser | M4 | WORKFLOW §3.2 |
| 40 | Unit & Adversarial Test Regression | 100% pass across all Specialist unit tests: rules, progression, features, adversarial, executor, hookmaster, infuser | M5 | Acceptance Criteria |
| 41 | Static Code & Content Validation | `validate-files.mjs` and `verify-generated-content.mjs` exit 0 | M5 | Acceptance Criteria |
| 42 | Live Headless Playwright Verification | `test-specialist-live.mjs` runs on port 30175 with `launchTestBrowser()` exercising GM/Player flows with 0 errors | M5 | GEMINI.md §5 |
| 43 | Subagent Screenshot Inspection | Subagent reviewer inspects all 15 captured screenshots per AGENTS §6.2 with PASS verdicts | M5 | AGENTS §6.2 |
| 44 | Documentation & Decision Log Update | `TODO.md` and `ak5e/DECISIONS.md` updated with completed status and logged rulings | M5 | Completion |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Base Specialist Class, Sheet UI & Module Integration | Export predicates in `specialist-rules.mjs`, wire `ak5e/scripts/ak5e.mjs`, wire `resource-pools.mjs` for `prowess`, author `specialist-sheet.mjs` & CSS, verify 48 existing unit tests pass | none | DONE |
| M2 | Executor Subclass Implementation & Tests | Author `ak5e/scripts/executor-features.mjs`, wire Executor table-play plans in `specialist-uses.mjs`, author `ak5e/test/executor.test.mjs` | M1 | DONE |
| M3 | Hookmaster Subclass Implementation & Tests | Author `ak5e/scripts/hookmaster-features.mjs`, wire Hookmaster table-play plans in `specialist-uses.mjs`, author `ak5e/test/hookmaster.test.mjs` | M1 | DONE |
| M4 | Infuser Subclass Implementation & Tests | Author `ak5e/scripts/infuser-features.mjs`, wire Infuser table-play plans in `specialist-uses.mjs`, author `ak5e/test/infuser.test.mjs` | M1 | DONE |
| M5 | Full Test Regression, Headless Browser & Visual Verification | Run all unit tests, static checks, execute `test-specialist-live.mjs` on port 30175 with `launchTestBrowser()`, inspect screenshots per AGENTS §6.2, update `TODO.md` and `ak5e/DECISIONS.md` | M2, M3, M4 | DONE |

---

## Interface Contracts

### `<class>-rules.mjs`
- `isSpecialist(actor)` -> boolean
- `isExecutor(actor)` -> boolean
- `isHookmaster(actor)` -> boolean
- `isInfuser(actor)` -> boolean
- `calculateSpecialistProfile(actor)` -> `{ level, pb, hp, saves, proficiencies, resources, features, branch }`
- Pure math, no database writes.

### `executor-features.mjs`
- `getExecutorPath(actor)` -> `"hunter"` | `"bodyguard"` | `null`
- `getDeathmarkState(actor)` -> `{ holder: "self" | "target" | null, targetUuid: string | null }`
- Hook triggers for Deathmark damage bonus (+1d4/+2d4/+3d4), crit range (+1 for Hunter), attack redirection (Bodyguard).

### `hookmaster-features.mjs`
- `isHookedWeapon(item)` -> boolean
- `convertHookedWeapon(actor, item, { free })` -> `{ success, receipt }`
- `revertHookedWeapon(actor, item)` -> `{ success, receipt }`
- King of the Urban Jungle and grapple/drag hook states.

### `infuser-features.mjs`
- `calculateInfuserDC(actor)` -> `20 - INT - PB` (with optional GM ruling toggle)
- `getActiveInfusion(target)` -> `{ type, infuserId, appliedAt }`
- `INFUSIONS`: dictionary of all 8 infusions with `name`, `trigger`, `effect`, `conSave`.

### `specialist-uses.mjs`
- Returns an instance of `createPlayUses({ ns: "specialistUses", label: "Specialist" })`
- Plans: `execute(actor, command, data)`
- Enforces WORKFLOW §3.2 (confirmations, warnings, clamp-at-0, unowned-target GM relay with `validateTarget`, undo receipts in `flags.ak5e.specialistUses.undo`).

### `specialist-sheet.mjs`
- `openSpecialistControls(actor)` -> renders DialogV2
- `registerSpecialistSheetHooks()` -> hooks `renderActorSheetV2` and `getHeaderControlsApplicationV2`.
