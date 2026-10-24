# Dispatch Log

## 2026-10-16T08:46:19Z

[Message] timestamp=2026-10-16T08:46:19Z sender=ba1b406d-cfdb-4601-bb26-146b2396bbcd priority=MESSAGE_PRIORITY_HIGH content=You are the Specialist Project Orchestrator.
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_6/
Your identity and initial context are in: /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_6/context.md
The full authoritative request is recorded in: /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (under header ## 2026-10-16T08:44:15Z).

You must maintain BRIEFING.md and progress.md in your working directory (/home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_6/).
The Sentinel monitors progress.md (Cron 1: */8 min) and liveness (Cron 2: */10 min).

## Scope & Requirements:
Implement and verify the AK5e **Specialist** base class and its **Executor**, **Hookmaster**, and **Infuser** subclasses in Foundry VTT v13 (dnd5e 5.3.3), including progression, table-play uses (WORKFLOW.md §3.2), sheet controls, unit/adversarial tests, and live headless Chromium verification.
Use Gemini 3.8 agents for implementation per repository instructions and GEMINI.md.

### R1. Base Specialist Class & Module Integration (Ch. 3 L5161–5493)
- Implement/complete base Specialist class across:
  - `ak5e/scripts/specialist-rules.mjs`
  - `ak5e/scripts/specialist-progression.mjs`
  - `ak5e/scripts/specialist-features.mjs`
  - `ak5e/scripts/specialist-setup.mjs`
  - `ak5e/scripts/specialist-uses.mjs`
  - `ak5e/scripts/specialist-sheet.mjs`
  - Wire `game.ak5e.specialist` and hooks in `ak5e/scripts/ak5e.mjs`.
- Features & mechanics: d8 Hit Dice, proficiencies, 1300 LMD / starting equipment, Weapon Specialisation (8 Melee and 7 Ranged Fighting Styles with cross-list duplicate rejection), Show Your Style (`prowess` pool max PB, +1 on SR and +1 on LR, Mark of a Specialist reroll and refund on second failure), Weapon Adept (Lv 6), Weapon Expertise (Lv 12), Falling Upwards / It's All Skill (Lv 17), Weapon Mastery (Lv 18), and all 15 Basic + 18 Advanced Talents (including Hidden Technique granting Grit pool and Basic Brawler Techniques, Jumpstart increasing Operator Skill Start SP by 5 or 10 with Module, and Part-Time Inventor).

### R2. Executor Subclass (Ch. 3 L5498–5578)
- Implement Executor in `ak5e/scripts/executor-features.mjs`:
  - Hunter / Bodyguard path choice
  - Deathmark state tracking (holder, transfer on attack with `onAttackRoll` vs `onHitOnly` reading, return on 0 HP or end of turn without attacking/damaging, +3 SP on return with Reaction Disengage, +3 SP at combat turn start while held, Bonus Action Hide, +1d4/+2d4/+3d4 damage scaling at levels 1/7/14, Hunter +1 crit range, Bodyguard attack redirection within 10 ft)
  - In Every Shadow (Lv 5 Climb/Swim speeds equal to Walking Speed and Stealth Proficiency/Expertise)
  - Sweeper (Lv 5 Hunter Prowess spend) and Smokescreen (Lv 5 Bodyguard Prowess spend)
  - Executor Prowess gain triggers (1/turn on Deathmark target reduced to 0 HP, Hunter >=30 single-attack damage, Bodyguard ally within 10 ft attacked taking 0 damage)
  - Preysense / Dangersense (Lv 11)
  - In for the Kill / Blade Shield (Lv 15)
  - Mortal Blow (Lv 20 Hunter: 1/LR Action, DEX save vs Martial DC, interactive `10d8` roll button, HP loss on fail/half on success, doubled if target has `bleeding`, with `bypassDRResist` vs `bypassAll` reading) / Ultimate Sword and Shield (Lv 20 Bodyguard: Resistance to all damage from Deathmark holder, free Blade Shield without spending Reaction, Reaction transfer of Deathmark when creature within 10 ft is attacked).

### R3. Hookmaster Subclass (Ch. 3 L5585–5679)
- Implement Hookmaster in `ak5e/scripts/hookmaster-features.mjs`:
  - Hooked weapon conversion (free starting melee weapon or 200 LMD + 1 hour; Slashing/Piercing non-Two-Handed melee weapon gains Two-Handed, Thrown 30/- or 50/- at Lv 15, returning, STR-based ranged attacks, 10 ft pull vs <= +1 size, Bonus Action ranged Hook attack restriction, reversible via undo)
  - Big Boot (Lv 5 Unarmed Strike 10 ft push)
  - King of the Urban Jungle (Lv 5: 20 ft pre-move -> Flying Speed = 2x Hook range, cannot attack with Hook while flying, immediate melee damage deals +PB damage and doubles forced movement; Lv 15 Swing to Safety allows Reaction trigger while falling)
  - Bound in Rope (Lv 5: 1 Prowess Action, DEX save vs Martial DC -> Grappled, 15 ft BA drag, Action hogtie within 5 ft, locks Hook use while grappling)
  - Wrangler (Lv 5: 1 Prowess Action vs > +1 size, DEX save vs Martial DC -> latch and share space, Advantage on attacks vs target, optional -5 attack penalty to ignore DR)
  - Hookmaster Prowess gain triggers (environmental/falling/collision damage or >45 ft flying movement in a turn)
  - Mighty Push (Lv 11: PB/LR Action within 5 ft, STR save vs Martial DC, interactive `8d6` Bludgeoning roll button + 20 ft knockback, half damage and 10 ft on save, collision damage)
  - Spider's Essence (Lv 15: Longer Hook 50/-, Spider's Thread climbing speed, Swing to Safety)
  - Scorpion Sting (Lv 20: 1/LR Action, DEX save vs Martial DC auto-failed if Grappled/Hooked ignoring Hook restrictions, pull to 5 ft, 6 advantaged Hook attacks each dealing +half Specialist level weapon damage).

### R4. Infuser Subclass (Ch. 3 L5684–5840)
- Implement Infuser in `ak5e/scripts/infuser-features.mjs`:
  - Infuser DC (`20 - INT - PB` vs `8 + INT + PB` per-use reading / GM ruling)
  - Principle of Double Effect (Pharmacology Kit proficiency, Alchemical Infusions pool `2 * PB / LR`, 5 ft range -> 30 ft at Lv 11, 1 min duration, single active Infusion per creature overwriting prior Infusion, Construct/Undead guard)
  - All 8 Alchemical Infusions (`adrenalineTrigger`, `flightReflexStimulant`, `focusHeightener`, `hesitationSuppressor`, `muscleStrengthener`, `procoagulant`, `respirationStimulant`, `sensationNulling`) and the recipient Leverage workflow (CON save vs Infuser DC -> benefit on pass/fail, Dazed until start of next turn + Leverage lockout on fail)
  - New Concoctions (Lv 5 Neurological Inhibitor and Bungarotoxin items/actions)
  - Double-Blind Trial (Lv 5 BA, 1 Prowess + 1 Infusion use -> interactive `1d6` roll button applying corresponding Toxin from table to untoxined weapon)
  - Infuser Prowess gain triggers (Poisoned/Toxined creature reduced to 0 HP, or 1/round when Infusion turns a failed roll into a success)
  - Stimpack (Lv 11: 30 ft range, Questionable Rejuvenation `1d10` Temp HP roll button on apply and on save success, additive with Procoagulant)
  - Excessive Dosing (Lv 15: Succumb +PB Toxin DC and Toxic Shock Poisoned rider on failed Toxin save)
  - To Defy Science (Lv 20: 1/LR Action within 30 ft, 1-minute Invulnerability effect preventing HP loss).

### R5. Table-Play Philosophy & Foundry V13 Guardrails (WORKFLOW.md §3.2)
- Confirm before spending or mutating; warn without blocking; clamp overspent resources at 0 with shortfall reporting; never auto-roll player dice (interactive chat card roll/save buttons); automatic GM relay for unowned targets; reversible encounter-window undo receipts under `flags.ak5e.specialistUses`.
- Log all rulings in `ak5e/DECISIONS.md` and update `TODO.md`.
- Preserve all existing uncommitted working-tree changes.

### Acceptance Criteria:
- Unit & static checks:
  `node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs ak5e/test/hookmaster.test.mjs ak5e/test/infuser.test.mjs` passes 100% with 0 failures.
  `node ak5e/tools/validate-files.mjs` and `node ak5e/tools/verify-generated-content.mjs` exit 0.
- Live browser & visual checks:
  `ak5e/tools/test-specialist-live.mjs` launches an isolated `/tmp` copy of `standard-test` with `launchTestBrowser()`, exercises GM and Player workflows for Base Specialist, Executor, Hookmaster, and Infuser, verifies 0 console/page errors, and cleanly releases the server port on exit.
  Captured screenshots of Specialist sheet panel, dialogs, and chat cards for each subclass are inspected by a sub-agent per AGENTS.md §6.2 and receive PASS verdicts.
- TODO.md and ak5e/DECISIONS.md are updated.


## 2026-10-16T11:53:34Z

[Message] timestamp=2026-10-16T11:53:34Z sender=ba1b406d-cfdb-4601-bb26-146b2396bbcd priority=MESSAGE_PRIORITY_HIGH content=[Sentinel Resume & Recovery Directive]
The environment experienced a server restart which stopped running background tasks and put subagents into idle.
- Please check the state of your subagents (`manage_subagents(Action="list")`), specifically `worker_m1` (`9c118419-9034-4e3a-8aa5-d9141c23c76e`, working directory `.agents/teamwork/worker_m1/`) for Milestone 1.
- Revive or re-dispatch `worker_m1` to complete Milestone 1 (Base Specialist Class, Sheet UI & Module Integration) including `ak5e/scripts/specialist-rules.mjs`, `ak5e/scripts/resource-pools.mjs`, `ak5e/scripts/specialist-sheet.mjs`, `ak5e/styles/ak5e.css`, and `ak5e/scripts/ak5e.mjs`.
- Continue through the full decomposition pipeline: Milestone 2 (Executor), Milestone 3 (Hookmaster), Milestone 4 (Infuser), and Milestone 5 (Full E2E regression, headless browser tests with `launchTestBrowser()`, and visual screenshot review per AGENTS.md §6.2).
- Re-establish your internal heartbeat / safety timers as needed, update `progress.md`, and notify the Sentinel upon final completion so the independent Victory Audit can be launched.
