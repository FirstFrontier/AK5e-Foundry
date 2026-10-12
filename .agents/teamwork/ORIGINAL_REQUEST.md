# Original User Request

## Initial Request — 2026-10-12T00:05:05Z

Implement Batch 1 of the remaining Guard subclasses (Duellist, Liberator, and Lord) for the AK5e Foundry VTT module according to AK5e v1.3.1 Chapter 3 source rules and WORKFLOW.md §3.2 table-play philosophy.

Working directory: /home/patch/AK5e-Foundry
Integrity mode: development

## Requirements

### R1. Duellist Subclass Rules & Table Play (Ch. 3 L2739–2845)
- **Identification & Weapons:** `isDuellist(actor)`; Duelling Blades (Greatswords and Polearms gain Finesse property).
- **Rules of Engagement:** Bonus Action Opponent declaration; Points ledger (0–10 max) with entry conditions (+1 on declaration, +1 at turn start if damaged opponent, +1 if not damaged by opponent; upgraded to +2 at 10th level).
- **Parry & Riposte:** Parry (1st Forestall/round costs 0 reaction, -1 Aggression); Press the Attack: Riposte (1 Aggression, Reaction on melee miss -> Attack of Opportunity).
- **Principles of Defence (4th Level):** Every Victory (+1 Aggression on opponent defeat/surrender); Press the Attack: Lightning Reflexes (1 Aggression, Reaction -> DEX save against seen effect); Punish Every Opening (free Riposte without reaction on successful save).
- **Engagements (9 options):** Analysis (0 pts), Balestra (2 pts), Derobement (1 pt), Displacement (1 pt), En Garde (1 pt), Feint (1 pt), Fleche (2 pts), Redoublement (1 pt), Score (1 pt).
- **Grand Challenge (13th Level):** 1/Long Rest, Corps à Corps (AoO when opponent attacks others), Displacement (damage resistance against all non-opponents), Coup de Grâce (8d8 Slashing/Piercing unreduced at 10 points).
- **Master Duellist (17th Level):** Retain points when opponent dies/surrenders; declaration requires no action.

### R2. Liberator Subclass Rules & Table Play (Ch. 3 L2938–3039)
- **Identification & Pools:** `isLiberator(actor)`; Liberty resource pool (0–6 max, combat generation at turn end if no attack/cast/skill was used, or via Guide the Masses).
- **Guide the Masses:** Action (or Bonus Action at 7th level) targeting an ally within 20 ft (40 ft at 10th):
  - Advocate: bonus healing equal to max(2×PB, 2×Liberty).
  - Empower: damage reduction equal to max(PB, Liberty).
  - Uplift: bonus damage on next hit equal to max(PB, Liberty).
- **Righteous Outburst:**
  - Flash of Anger: expend Liberty on melee hit for +1d6 (d10 at 10th) damage per Liberty, refund 1 on kill; becomes Force damage (or Skill damage type) at 13th with Caught in the Crossfire 10-ft splash.
  - The Right Moment: consumes all Liberty on Operator Skill activation for bonus damage.
- **Rising Tide (4th Level):** Operator Skills considered Automatic, Offensive, and Defensive charging.
- **Praxis (10th Level):** Press the Attack: Face Me (2 Aggression, Bonus Action Compelled Duel with Martial DC).
- **Révolution (17th Level):** 1/Long Rest Action, 20-ft burst DEX save vs Martial DC for 1d12 Force per Liberty; Champion of the Worthy (free Guide the Masses); Shield of Belief (THP = Guard level at turn start); Time to Act (+1 Liberty on gain/refund).

### R3. Lord Subclass Rules & Table Play (Ch. 3 L3013–3248)
- **Identification & State:** `isLord(actor)`; Authority state (`flags.ak5e.lord.hasAuthority`); Overruled (INT/WIS/CHA saves at both start and end of turn); 1d8 Temporary HP at turn start while holding Authority.
- **Authority Acquisition & Loss:**
  - Gain on: Elite/Leader kill damaged since last turn, 2+ kills in a turn, or 1-shot full HP kill.
  - Lose on: 0 HP, end-of-turn save affliction, Prone at end of turn, or Initiative.
  - Press the Attack: Manifest Destiny (3 Aggression, prevent loss of Authority).
- **Manifest Will:**
  - Manifestation pool (`@prof` uses, Long Rest recovery). Duration 1 minute: melee weapons gain Range 30/-, STR for ranged attack/damage, +CHA mod Force damage.
  - Will Attunement (10-minute ritual to change damage type to an Operator Skill type).
  - Authority bonus: Ranged/Melee marks; opposite attack deals +1d6 damage (splashes 10 ft at 17th).
- **King's Domain (4th Level):** Choice during Manifestation:
  - Castle Doctrine: 15-ft zone, reaction move half speed and melee attack, refund reaction on non-elite hit; Authority reduces speed by half (or 0 with WIS save at 17th).
  - Pursuit of Power: hit allows full movement without AoO, 2x jump; Authority removes once/turn limit; deals passive CHA damage to adjacent foes at 17th.
- **By Lordly Decree (10th Level):**
  - Make It So: spend Manifestation use to add CHA mod + Proficiency (or Expertise with Authority) to any d20 roll; reroll once on failure at 17th.
  - Press the Attack: A Leader Leads (1+ Aggression, grant Special Inspiration to allies).
- **Force of Will (13th Level):** PB/Long Rest uses, 1/turn:
  - Fire/Psychic/Force/Thunder: 10-ft burst 3d6 DEX save.
  - Bludgeoning/Piercing/Slashing/Radiant: 50-ft line 8d6 DEX save.
  - Acid/Cold/Lightning/Necrotic/Poison: melee hit 6d6 CON save.

### R4. Table-Play Philosophy & Engine Integration (WORKFLOW §3.2)
- All uses register in `guardUses` in `ak5e/scripts/guard-uses.mjs`.
- Confirm before use; cancel changes nothing.
- Ability checks and saves require no confirm dialog.
- Never auto-roll damage, healing, attack, save, or feature dice; cards render roll buttons clicked by the user.
- Resource shortfalls warn but do not block with "Use anyway"; clamp at 0 and report shortfall publicly on chat card.
- Unowned target modifications relay automatically through the active GM client.
- Every action records an undo receipt in `flags.ak5e.guardUses` supporting encounter-window undo.

### R5. Guard Sheet UI & Dialogs
- Add summary badges in `ak5e/scripts/guard-sheet.mjs`: Duellist Points, Liberty, Authority, Manifestation uses.
- Add subclass action groups in `openGuardControls()`.
- Interactive prompts in `executeGuardDialog()` for choices (Engagements, Guide the Masses target bonuses, King's Domain modes, Force of Will, Make It So).

### R6. Verification & Validation
- Unit tests: author `ak5e/test/duellist.test.mjs`, `ak5e/test/liberator.test.mjs`, and `ak5e/test/lord.test.mjs`. Update `"test:guard"` in `package.json` to include them. All must pass cleanly with 0 failures.
- Static verification: `node ak5e/tools/validate-files.mjs` and `node ak5e/tools/verify-generated-content.mjs`.
- In-Foundry Playwright live browser test: expand `ak5e/tools/test-guard-live.mjs` to exercise Duellist, Liberator, and Lord actors, dialogs, rolls, and undo. Run via `/tmp/run-guard-live.sh` against clean `standard-test` World copy on port 30175 with `launchTestBrowser()`.
- Screenshot inspection: delegate all captured screenshots to `foundry-validator` subagent per AGENTS.md §6.2.

## Acceptance Criteria

### Automated Tests & Quality Checks
- [ ] `npm run test:guard` passes 100% of test suites with 0 failures.
- [ ] `node ak5e/tools/validate-files.mjs` validates all `.mjs`, `module.json`, and `lang/en.json` files.
- [ ] `node ak5e/tools/verify-generated-content.mjs` confirms zero regressions against Chapter 1–6 source records.

### Live Browser & Visual Inspection
- [ ] Live Foundry V13 test suite runs cleanly on port 30175 with `errors: []` in `report.json`.
- [ ] All captured screenshots for Duellist, Liberator, and Lord inspected and verified PASS by the `foundry-validator` subagent.
- [ ] Task progress updated in `TODO.md` and rulings documented in `ak5e/DECISIONS.md`.
