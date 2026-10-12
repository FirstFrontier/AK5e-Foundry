# Milestone M1: Duellist Subclass Implementation — Handoff Report

**Agent:** `worker_duellist`  
**Milestone:** M1: Duellist Subclass  
**Working Directory:** `/home/patch/AK5e-Foundry/.agents/teamwork/worker_duellist/`  
**Date:** 2026-10-12  

---

## 1. Observation

### 1.1 Source Rules Authority & Requirements
- Source rules: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`, Lines 2739–2845:
  - Duelling Blades (L2746): Greatswords and Polearms gain Finesse while wielded by the character.
  - Rules of Engagement (L2748–2754): Bonus Action Opponent declaration; Duel Points ledger (0–10 max). +1 point on declaration (+2 at 10th level), +1 extra if not wielding Heavy Melee weapon. +1 point at turn start if damaged opponent since last turn (+2 at 10th), +1 if opponent did not damage character. Points lost on opponent 0 HP, surrender, 1 min without damage, or declaring new opponent.
  - Parry & Riposte (L2761–2767): Parry (1st Forestall/round costs 0 reaction, -1 Aggression, min 0). Riposte (1 Aggression, Reaction on melee miss -> Attack of Opportunity).
  - Principles of Defence (4th Level, L2773–2781): Every Victory (+1 Aggression on opponent defeat/surrender). Lightning Reflexes (1 Aggression, Reaction on save against seen effect -> DEX save). Punish Every Opening (free Riposte without reaction on successful save).
  - 9 Engagements (L2804–2827): Analysis (0 pts), Balestra (2 pts), Derobement (1 pt), Displacement (1 pt), En Garde (1 pt), Feint (1 pt), Fleche (2 pts), Redoublement (1 pt), Score (1 pt). Max once per turn.
  - Grand Challenge (13th Level, L2785–2795): 1/Long Rest. Corps à Corps (AoO when opponent attacks others), Displacement (damage resistance against non-opponents), Coup de Grâce (8d8 Slashing or Piercing unreduced by Resistance or DR at 10 points; ends Grand Challenge).
  - Master Duellist (17th Level, L2796–2798): Retain points on defeat/surrender or declaring new opponent without Grand Challenge; declaration requires no action (Free Action).
- Table-play requirements: WORKFLOW.md §3.2 (no auto-rolled dice, table-play confirmation, warning shortfalls clamping at 0 with 'Use anyway', encounter-window undo receipts).

### 1.2 Created and Modified Files
- Created: `/home/patch/AK5e-Foundry/ak5e/scripts/duellist-features.mjs` (28.3 KB)
  - Exports: `isDuellist(actor)`, `isDuellingBladeWeapon(item)`, `isWieldingHeavyMeleeWeapon(actor)`, `defineDuellistPools()`, `registerDuellistHooks()`, `duellistPreRollAttack(config)`, `duellistPreRollDamage(config)`, `DUELLIST_PLANS`.
  - Registered plans: `declareOpponent` (alias `rulesOfEngagement`), `duelTurnStart`, `riposte`, `lightningReflexes`, `punishOpening` (alias `punishEveryOpening`), `everyVictory`, `engagementAnalysis` (alias `analysis`), `engagementBalestra` (alias `balestra`), `engagementDerobement` (alias `derobement`), `engagementDisplacement` (alias `displacement`), `engagementEnGarde` (alias `enGarde`), `engagementFeint` (alias `feint`), `engagementFleche` (alias `fleche`), `engagementRedoublement` (alias `redoublement`), `engagementScore` (alias `score`), `grandChallenge`, `coupDeGrace`.
- Modified: `/home/patch/AK5e-Foundry/ak5e/scripts/guard-uses.mjs`
  - In `CORE_PLANS.forestall`, added Parry handling for Duellists: first Forestall each round costs 0 reaction and 1 fewer Aggression (min 0). Tracks `roundKey` and previous receipts in `state.undo`.
- Created: `/home/patch/AK5e-Foundry/ak5e/test/duellist.test.mjs` (18.7 KB)
  - 10 comprehensive tests covering identification, Duelling Blades finesse property, Rules of Engagement & points ledger, Parry & Riposte, Principles of Defence, all 9 Engagements, Grand Challenge, Coup de Grâce, Master Duellist, warning shortfalls, and encounter-window undo receipts.

### 1.3 Execution Evidence
- Command: `node --test ak5e/test/duellist.test.mjs`
  ```
  ✔ Duellist identification (1.483497ms)
  ✔ Duelling Blades: Greatswords and Polearms gain Finesse (0.686329ms)
  ✔ Rules of Engagement: Opponent declaration and Points ledger (7.43503ms)
  ✔ Parry: 1st Forestall per round costs 0 reaction and 1 fewer Aggression (min 0) (3.675696ms)
  ✔ Riposte: Reaction on melee miss spends 1 Aggression (1.763401ms)
  ✔ Principles of Defence (4th Level): Lightning Reflexes, Punish Opening, Every Victory (2.028295ms)
  ✔ All 9 Engagements: point costs, effects, and once-per-turn limit (6.214635ms)
  ✔ Grand Challenge (13th Level) and Coup de Grâce (2.357974ms)
  ✔ Master Duellist (17th Level): Retains points and free declaration (0.597629ms)
  ✔ Encounter-window undo and receipt restoration (0.720694ms)
  ℹ tests 10
  ℹ suites 0
  ℹ pass 10
  ℹ fail 0
  ```
- Command: `node --test ak5e/test/guard-*.test.mjs ak5e/test/centurion.test.mjs ak5e/test/crusher.test.mjs ak5e/test/instructor.test.mjs ak5e/test/artsblade.test.mjs ak5e/test/brawler.test.mjs ak5e/test/duellist.test.mjs`
  ```
  ℹ tests 68
  ℹ suites 0
  ℹ pass 68
  ℹ fail 0
  ```
- Command: `node ak5e/tools/validate-files.mjs`
  ```
  Validated module.json, lang/en.json, and 209 .mjs files.
  ```

---

## 2. Logic Chain

1. **Premise:** The dispatch required implementing Milestone M1: Duellist Subclass with genuine logic, no shortcuts, and exclusive ownership of `ak5e/scripts/duellist-features.mjs`, `ak5e/test/duellist.test.mjs`, and Parry in `ak5e/scripts/guard-uses.mjs`.
2. **Identification & Weapons:**
   - `isDuellist(actor)` evaluates `guardEnabled(actor) && guardBranch(actor) === "duellist"`.
   - `isDuellingBladeWeapon(item)` detects Greatswords and Polearms (Glaive, Halberd, Pike, Spear, Quarterstaff).
   - `duellistPreRollAttack` and `duellistPreRollDamage` add the `fin` property to the weapon's property set and apply DEX modifier scaling over STR when DEX > STR.
3. **Pools & Rules of Engagement:**
   - `duellistPoints` is registered via `definePool` with max 10, min 0, initial 0.
   - `grandChallenge` is registered via `definePool` with max 1, initial "max", Long Rest recovery, gated to level >= 13.
   - `declareOpponent` checks heavy melee weapon status (`isWieldingHeavyMeleeWeapon`), awards +1 point (+2 at 10th level, +1 extra for non-heavy weapon), sets opponent flag, and respects 17th level Master Duellist points retention and free action cost.
4. **Parry in Core Plans:**
   - In `CORE_PLANS.forestall`, `isDuellist` is checked.
   - The first Forestall in a round (`isFirstThisRound`) costs 0 reaction and reduces Aggression cost by 1 (min 0). Subsequent Forestalls in the same round cost 1 reaction and full Aggression.
   - Shortfall checks, warnings, and reaction checks reflect this dynamically, and undo receipts snapshot the modified resource spending and reaction expenditure.
5. **Principles of Defence & Engagements:**
   - 4th level gating is verified on `lightningReflexes` and `punishOpening`.
   - All 9 Engagements enforce point costs, warn on shortfalls, support "Use anyway" overrides with zero clamping, and track once-per-turn limits via combat turn keys.
   - `engagementEnGarde` invokes `refundReaction`.
6. **Grand Challenge & Coup de Grâce:**
   - 13th level gating is verified.
   - `grandChallenge` spends the 1/LR pool use and sets the 1-minute state.
   - `coupDeGrace` requires 10 Duel points, configures an 8d8 roll card button without auto-rolling (satisfying WORKFLOW §3.2), and terminates the Grand Challenge state.
7. **Reversibility:**
   - All plan executions record undo receipts in `flags.ak5e.guardUses.undo`.
   - Tested and verified that calling `guardUses.command(actor, "undoUse", { useId })` restores prior resource and flag states.

---

## 3. Caveats

- UI sheet panels and dialogs (`guard-sheet.mjs`), `guard-rules.mjs` branch registration list, and `ak5e.mjs` exports are scoped under Milestone M4 (UI & Core Integration) per `PROJECT.md` and the dispatch instructions ("Files you own exclusively: ak5e/scripts/duellist-features.mjs, ak5e/test/duellist.test.mjs, and ak5e/scripts/guard-uses.mjs. Do NOT touch other files.").
- All Duellist plans and hooks are self-contained and fully functional directly via `guardUses.command(actor, ...)` and D&D5e hooks.

---

## 4. Conclusion

Milestone M1 (Duellist Subclass) is 100% complete, fully tested, and meets all requirements from the AK5e v1.3.1 source rules and WORKFLOW §3.2. All 10 unit tests pass, all 68 Guard tests pass without regressions, and static file validation passes with 0 syntax errors.

---

## 5. Verification Method

To independently verify this implementation:
1. Run unit tests for Duellist:
   ```bash
   node --test ak5e/test/duellist.test.mjs
   ```
   (Must pass 10/10 tests cleanly).
2. Run full Guard test suite:
   ```bash
   node --test ak5e/test/guard-*.test.mjs ak5e/test/centurion.test.mjs ak5e/test/crusher.test.mjs ak5e/test/instructor.test.mjs ak5e/test/artsblade.test.mjs ak5e/test/brawler.test.mjs ak5e/test/duellist.test.mjs
   ```
   (Must pass 68/68 tests cleanly).
3. Validate static syntax:
   ```bash
   node ak5e/tools/validate-files.mjs
   ```
   (Must validate all 209 .mjs files with exit code 0).
