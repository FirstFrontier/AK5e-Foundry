# Project: Guard Subclasses Batch 1 (Duellist, Liberator, Lord)

## Architecture
- **Engine Core:** `ak5e/scripts/guard-uses.mjs` uses `createPlayUses` (`play-uses.mjs`). Subclasses register plans via `guardUses.register({ plans })`.
- **Subclass Feature Modules:**
  - `ak5e/scripts/duellist-features.mjs`: Duelling Blades finesse hook, `duellistPoints` pool (0–10), opponent declaration, Parry & Riposte, 9 Engagements, Grand Challenge, Master Duellist.
  - `ak5e/scripts/liberator-features.mjs`: `liberty` pool (0–6), Guide the Masses (Advocate/Empower/Uplift), Righteous Outburst (Flash of Anger, The Right Moment), Rising Tide, Praxis (Face Me), Révolution.
  - `ak5e/scripts/lord-features.mjs`: `flags.ak5e.lord.hasAuthority`, `manifestation` pool (`@prof`), Manifest Will, King's Domain (Castle Doctrine, Pursuit of Power), By Lordly Decree (Make It So, A Leader Leads), Force of Will.
- **UI & Controls:**
  - `ak5e/scripts/guard-sheet.mjs`: Summary badges (Duel Points, Liberty, Authority, Manifestation), action groups in `openGuardControls()`, interactive prompts in `executeGuardDialog()`.
  - `ak5e/scripts/guard-rules.mjs`: Appended `"duellist"`, `"liberator"`, `"lord"` to `IMPLEMENTED_GUARD_BRANCHES`.
  - `ak5e/scripts/ak5e.mjs`: Hooks registration and API exports on `game.ak5e.guard`.
- **Table-Play Philosophy (WORKFLOW §3.2):**
  - Uses register in `guardUses`.
  - Confirm before use; cancel changes nothing; ability checks and saves require no confirm dialog.
  - No auto-rolled dice; chat cards render roll buttons.
  - Resource shortfalls warn but do not block with "Use anyway"; clamp at 0 and report shortfall publicly.
  - Unowned target modifications relay automatically through active GM client.
  - Every action records an encounter-window undo receipt under `flags.ak5e.guardUses.undo`.
- **Test Infrastructure:**
  - Unit tests: `ak5e/test/duellist.test.mjs`, `ak5e/test/liberator.test.mjs`, `ak5e/test/lord.test.mjs`.
  - `package.json`: Updated `"test:guard"` (90 passing tests across 9 suites).
  - Static tools: `validate-files.mjs` (213 files validated) and `verify-generated-content.mjs` (2,193 records verified).
  - Live Browser Test: `ak5e/tools/test-guard-live.mjs` run via `/tmp/run-guard-live.sh` on port 30175 with `launchTestBrowser()`, producing 40 screenshots.
  - Screenshot review: Delegated to `foundry-validator` per AGENTS.md §6.2 (17/17 PASS).
  - Forensic audit: `teamwork_preview_auditor` verified CLEAN.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Duellist Identification | `isDuellist(actor)` checking guard enabled and branch `"duellist"` | M1 | Ch. 3 L2739 |
| 2 | Duelling Blades | Greatswords & Polearms gain Finesse property | M1 | Ch. 3 L2742 |
| 3 | Rules of Engagement | Opponent declaration, Duel Points pool (0–10), turn-start & entry conditions | M1 | Ch. 3 L2748 |
| 4 | Parry & Riposte | Parry: 1st Forestall/round costs 0 reaction, -1 Aggression; Riposte: Reaction on melee miss | M1 | Ch. 3 L2770 |
| 5 | Principles of Defence | 4th lvl: Every Victory (+1 Aggression), Lightning Reflexes (DEX save), Punish Opening | M1 | Ch. 3 L2783 |
| 6 | 9 Engagements | Analysis, Balestra, Derobement, Displacement, En Garde, Feint, Fleche, Redoublement, Score | M1 | Ch. 3 L2796 |
| 7 | Grand Challenge | 13th lvl: Corps à Corps AoO, Displacement resistance, Coup de Grâce 8d8 | M1 | Ch. 3 L2830 |
| 8 | Master Duellist | 17th lvl: Retain points on opponent defeat/surrender; free declaration | M1 | Ch. 3 L2842 |
| 9 | Liberator Identification & Pools | `isLiberator(actor)`, `liberty` pool (0–6 max), combat generation | M2 | Ch. 3 L2937 |
| 10 | Guide the Masses | Advocate (heal), Empower (DR), Uplift (damage) targeting ally; generates Liberty | M2 | Ch. 3 L2945 |
| 11 | Righteous Outburst | Flash of Anger (bonus damage per Liberty, kill refund, splash at 13th), The Right Moment | M2 | Ch. 3 L2964 |
| 12 | Rising Tide | 4th lvl: Operator Skills count as Automatic, Offensive, Defensive charging | M2 | Ch. 3 L2985 |
| 13 | Praxis | 10th lvl: Face Me (2 Aggression, Compelled Duel vs Martial DC) | M2 | Ch. 3 L2995 |
| 14 | Révolution | 17th lvl: 20-ft burst 1d12 Force per Liberty; Champion, Shield of Belief, Time to Act | M2 | Ch. 3 L3003 |
| 15 | Lord Identification & State | `isLord(actor)`, `flags.ak5e.lord.hasAuthority`, Overruled saves, 1d8 THP | M3 | Ch. 3 L3109 |
| 16 | Authority Acquisition & Loss | Kill triggers, loss triggers, Manifest Destiny (3 Aggression to prevent loss) | M3 | Ch. 3 L3122 |
| 17 | Manifest Will | `manifestation` pool (`@prof`), 30-ft melee range, STR ranged, +CHA dmg, Will Attunement | M3 | Ch. 3 L3140 |
| 18 | King's Domain | 4th lvl: Castle Doctrine (15-ft zone, reaction move+attack), Pursuit of Power | M3 | Ch. 3 L3165 |
| 19 | By Lordly Decree | 10th lvl: Make It So (spend Manifestation for CHA+Prof/Expertise), A Leader Leads | M3 | Ch. 3 L3190 |
| 20 | Force of Will | 13th lvl: PB uses/LR, 3 damage element groups (burst, line, melee hit) | M3 | Ch. 3 L3212 |
| 21 | Divine Right | 17th lvl: Marks splash, Castle Doctrine WIS save, Pursuit aura, Make It So reroll | M3 | Ch. 3 L3235 |
| 22 | Table-Play & Undo Integration | Warning shortfalls, clamp at 0, public chat indicators, unowned relay, undo receipts | M1, M2, M3 | WORKFLOW §3.2 |
| 23 | Guard Sheet UI & Dialogs | Badges in sheet, action buttons in `openGuardControls()`, prompts in `executeGuardDialog()` | M4 | R5 |
| 24 | Core Hooks & Branch Registration | Append to `IMPLEMENTED_GUARD_BRANCHES`, register hooks in `ak5e.mjs` | M4 | R4 |
| 25 | Unit Tests Authoring | `duellist.test.mjs`, `liberator.test.mjs`, `lord.test.mjs`, update `"test:guard"` | M1, M2, M3, M4 | R6 |
| 26 | Live Browser Playwright Test | Expand `test-guard-live.mjs` for 3 subclasses, execute via `/tmp/run-guard-live.sh` on 30175 | M5 | R6, §5.3 |
| 27 | Visual Screenshot Review | Screenshot inspection delegated to `foundry-validator` per AGENTS.md §6.2 | M5 | AGENTS §6.2 |
| 28 | Static & Documentation Polish | `validate-files.mjs`, `verify-generated-content.mjs`, update `TODO.md`, `ak5e/DECISIONS.md` | M6 | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Duellist Subclass | `duellist-features.mjs`, `duellist.test.mjs`, Parry in `guard-uses.mjs` | none | DONE |
| M2 | Liberator Subclass | `liberator-features.mjs`, `liberator.test.mjs` | none | DONE |
| M3 | Lord Subclass | `lord-features.mjs`, `lord.test.mjs` | none | DONE |
| M4 | UI & Core Integration | `guard-sheet.mjs`, `guard-rules.mjs`, `ak5e.mjs`, `package.json` | M1, M2, M3 | DONE |
| M5 | Live Playwright & Visual Inspection | `test-guard-live.mjs`, `/tmp/run-guard-live.sh`, `foundry-validator` screenshots | M4 | DONE |
| M6 | Static Polish & Final Audit | `validate-files.mjs`, `verify-generated-content.mjs`, `TODO.md`, `DECISIONS.md`, forensic audit | M5 | DONE |

## Interface Contracts
### Duellist ↔ Engine
- File: `ak5e/scripts/duellist-features.mjs`
- Exports: `isDuellist(actor)`, `defineDuellistPools()`, `registerDuellistHooks()`, `DUELLIST_PLANS`.
- Plans register with `guardUses.register({ plans: DUELLIST_PLANS })`.
- Resource pool: `duellistPoints` (0–10). Opponent flag: `flags.ak5e.guard.duellist.opponent`.

### Liberator ↔ Engine
- File: `ak5e/scripts/liberator-features.mjs`
- Exports: `isLiberator(actor)`, `defineLiberatorPools()`, `registerLiberatorHooks()`, `LIBERATOR_PLANS`.
- Plans register with `guardUses.register({ plans: LIBERATOR_PLANS })`.
- Resource pools: `liberty` (0–6), `revolution` (0–1).

### Lord ↔ Engine
- File: `ak5e/scripts/lord-features.mjs`
- Exports: `isLord(actor)`, `defineLordPools()`, `registerLordHooks()`, `LORD_PLANS`.
- Plans register with `guardUses.register({ plans: LORD_PLANS })`.
- Authority flag: `flags.ak5e.lord.hasAuthority`. Resource pools: `manifestation` (`@prof`), `forceOfWill` (`@prof`).

### Subclasses ↔ UI (`ak5e/scripts/guard-sheet.mjs`)
- `openGuardControls(actor)` checks `isDuellist(actor)`, `isLiberator(actor)`, `isLord(actor)`.
- Renders dedicated badges and button grids (`data-guard-cmd="<command>"`).
- `executeGuardDialog(actor, cmd)` provides DialogV2 prompts for Engagements, Guide the Masses, Flash of Anger, King's Domain, Make It So, Force of Will.

## Code Layout
- `ak5e/scripts/duellist-features.mjs`: Duellist mechanics and plans.
- `ak5e/scripts/liberator-features.mjs`: Liberator mechanics and plans.
- `ak5e/scripts/lord-features.mjs`: Lord mechanics and plans.
- `ak5e/scripts/guard-uses.mjs`: Core plans and Parry integration.
- `ak5e/scripts/guard-rules.mjs`: Branch declarations (`IMPLEMENTED_GUARD_BRANCHES`).
- `ak5e/scripts/guard-sheet.mjs`: Sheet badges and controls dialogs.
- `ak5e/scripts/ak5e.mjs`: Hook registrations and exports.
- `ak5e/test/duellist.test.mjs`: Duellist unit tests.
- `ak5e/test/liberator.test.mjs`: Liberator unit tests.
- `ak5e/test/lord.test.mjs`: Lord unit tests.
- `ak5e/tools/test-guard-live.mjs`: Live Foundry V13 Playwright browser test.
- `package.json`: `"test:guard"` script update.
- `TODO.md` and `ak5e/DECISIONS.md`: Progress and rules rulings tracking.
