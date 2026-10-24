# Specification Mining Report: Guard Class and Subclasses (Chapter 3)
**Author:** Specification Miner (`spec_miner_guard_ch3`)  
**Target:** Guard Defect Reports in `bugs/pending/` (B-129–B-153, B-230–B-239, B-250–B-259, B-280–B-289, B-290–B-299)  
**Authoritative Source:** `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (lines 1740–3520), `01_chapter_1_changing_the_game.txt` (lines 204–213), `04_chapter_4_equipment.txt` (lines 83–87)  
**Governing Policies:** `WORKFLOW.md` §3.2 (Table-play philosophy), `AGENTS.md`, `GEMINI.md`  

---

## 1. Executive Summary

This specification mining report establishes the authoritative, unambiguous rules baseline for the Guard base class and all seven audited Guard subclasses (Centurion, Artsblade, Brawler, Crusher, Instructor, Musha, and Reaper). It provides the exact mechanical specifications, mathematical formulas, action economies, condition durations, saving throw rules, and WORKFLOW §3.2 table-play contracts required to resolve all 65 pending defect reports in `bugs/pending/`:
- **Base Guard:** B-129, B-130, B-131, B-132, B-133, B-135, B-149, B-153
- **Artsblade:** B-134, B-136, B-137, B-138, B-139, B-140, B-150
- **Brawler:** B-141, B-142, B-143, B-151
- **Centurion:** B-144, B-145, B-146, B-147, B-148, B-152
- **Crusher:** B-230, B-231, B-232, B-233, B-234, B-235, B-236, B-237, B-238, B-239
- **Instructor:** B-250, B-251, B-252, B-253, B-254, B-255, B-256, B-257, B-258, B-259
- **Musha:** B-280, B-281, B-282, B-283, B-284, B-285, B-286, B-287, B-288, B-289
- **Reaper:** B-290, B-291, B-292, B-293, B-294, B-295, B-296, B-297, B-298, B-299

---

## 2. Five-Component Handoff Report

### 2.1 Observation
Direct inspections of the source text, existing codebase, and pending defect reports revealed the following concrete evidence:

1. **Base Guard Chassis & Martial DC:**
   - Source: `03_chapter_3_character_classes.txt` L1764–1775: Hit Die is `1d10 per Guard Level`. Hit Points at 1st Level: `10 + CON`. Higher Levels: `1d10 (or 6) + CON`. Saving throws: Strength + choice of Constitution or Dexterity.
   - Source: `01_chapter_1_changing_the_game.txt` L211–213: `Martial DC = 8 + PB + max(STR, DEX)`.
   - Aggression progression (`03_chapter_3_character_classes.txt` L1877–1879): 4 Aggression at 1st level, +2 at 7th level (6 total), +2 at 14th level (8 total). Recovers on Short or Long Rest.
   - Unrelenting progression (L1895–1898, L1931): 1 use at 3rd level, 2 uses at 11th level. Recovers on Long Rest.
   - Defects B-129, B-130, B-131, B-132, B-133, B-135 document that confirmation dialogs were bypassed (`confirmed: true`), cancelling Augmented Assault spent Aggression, setup omitted preview keys, progression repeated HP and ASIs upon re-run, undo retained internal flags, and reactions were spent before receipt persistence.

2. **Centurion:**
   - Source: `03_chapter_3_character_classes.txt` L2554–2556: Centurion DC is explicitly `8 + Intimidation Modifier` (`skills.itm.total`).
   - Brutal Execution (L2573): Costs 2 Aggression, triggers as Bonus Action or Reaction immediately after killing a creature; hostile creatures within 15 ft make WIS save vs Centurion DC or take Psychic damage equal to Intimidation Modifier and become Frightened until the end of your next Turn. 0 HP causes Unconsciousness rather than death.
   - Ferocious Fling (L2583–2591): 1/Short Rest, no action. Ranged weapon attack using STR, range 30 ft, deals Bludgeoning damage equal to thrown creature's CON modifier. If Brutal Execution was used on that creature, use of Ferocious Fling is refunded.
   - Fearmonger (L2581): Centurions have Advantage against Frightened targets, and Frightened creatures have Disadvantage on attacks against the Centurion. Defect B-144 proved the attack hook applied to non-Centurion guards.
   - Cyclone Strike (L2558–2565): 1 secondary target within Reach and within 10 ft of primary; 2 secondary targets at 7th level. Frequency: Once until beginning of next turn (1st–13th), once per turn from 14th level. Defect B-145 proved frequency checks failed at 14th level.
   - Long-Arm (L2571): Melee weapons gain Reach during the Centurion's turn; existing Reach weapons gain +5 ft. Storm of Blood (L2617) extends this off-turn until end of next turn and refunds AoO reactions. Defect B-152 showed reach and refunds were unapplied.

3. **Artsblade:**
   - Source: `03_chapter_3_character_classes.txt` L2205–2249: Spellsword Points: 1 (levels 1–6), 2 (levels 7–13), 3 (levels 14–20); recovers on Short/Long Rest. Max Art Level: 1st: 1; 5th: 2; 9th: 3; 13th: 4; 17th: 5. Arts MUST be cast at maximum available level.
   - Casting Frequency: 1 Spellsword Art per turn. Augmented Assault (2 Aggression, L2245) allows 2 Spellsword Arts per turn, but BOTH must be Blade Art. Ultimate Blade Art (17th, L2407) removes casting frequency limit per round until end of next turn (1/Long Rest).
   - Resonance (L2267–2324): 11 damage types corresponding to 11 Standard Arts pools. Once a creature makes a save against Blade Art, it is exempt until the beginning of the Artsblade's next turn. Defects B-136, B-137, B-138, B-139, B-140 showed pool selection was ignored (defaulting to Flame), casting frequency was unchecked, lower spell levels were accepted, Crude/Flame durations and attack scopes were wrong, and save immunity was recorded before a save was rolled.
   - Cut Through Chaos (L2327–2336): PB/Long Rest uses, Reaction. Opposed melee attack roll vs incoming spell attack roll, or melee attack roll vs spell save DC. Defect B-148 and B-149 showed roll definitions were dropped and dialogs misstated mechanics as advantage/disadvantage.

4. **Brawler:**
   - Source: `03_chapter_3_character_classes.txt` L2430–2439: Guns Out applies while not wearing Medium or Heavy Armour (unarmored or Light armor).
   - Bob and Weave (L2434): Base AC = `10 + STR modifier + DEX modifier`.
   - Dexterous Attacks (L2436): Option to use DEX instead of STR for attack/damage of Unarmed Strikes and Athletics checks for Grapple/Shove. Defect B-142 proved DEX was added twice when an activity already used DEX.
   - Art of the Fist (L2438): Unarmed strike damage scales: 1d4 (1st), 1d6 (7th), 1d8 (14th).
   - Kick Them While They're Down (13th, L2459): Additional Bludgeoning damage equal to PB against creatures with detrimental status conditions. Defect B-143 showed targeting checked random selected tokens instead of the actual hit creature.
   - Techniques (L2478–2541): Body Check, Cross Counter, Feint, Follow Up, Footwork, Guard Up, Slip Off, Tag In (Basic); Chokehold, CQC, Disarm, Human Shield, Menace, Skullshaker, Weigh In (Advanced). Fueled by Aggression.

5. **Crusher:**
   - Source: `04_chapter_4_equipment.txt` L83–87: "Heavy Melee Weapons" is an explicit category containing Greataxe (1d10), Greatsword (2d6), Heavy Hammer (1d10), and Polearm (1d10). It is NOT the D&D5e `hvy` property. Defect B-230 proved module weapons were missed because code looked for `hvy`.
   - Extreme Fortitude (L2639): "Whenever you roll a Hit Die, roll two dice and discard the lowest result." Defect B-233 showed this was unimplemented.
   - Singular Strike (L2650–2662): Replaces multi-attack in Attack Action with 1 attack. Adds `(weaponBaseDice + STR mod + magicBonus)` for each forgone attack. Defect B-234 showed this was an unused helper.
   - Death's Passing (L2646): Miss on Heavy Melee Weapon during Attack Action deals half rolled damage as Thunder damage.
   - Foecrusher (L2666–2685): PB uses/Short Rest. Riders: Staggering (half speed), Dazing (Dazed), Renewing (spend 1 Hit Die, recover roll + CON HP), Smashing (pushed 15 ft, advance half speed without AoO). Defect B-232 proved Renewing Strike spent 0 Hit Dice.
   - Overbear (L2680): 2 Aggression, +1d10 damage, applies second distinct rider. Defect B-235 proved it accepted any string and didn't verify an active Foecrusher attack.

6. **Instructor:**
   - Source: `03_chapter_3_character_classes.txt` L2854–2862: Instruction Dice: 4 (1st), 5 (7th), 6 (14th). d6 scaling to d10 at 13th (Superior Instruction). Recovers Short/Long Rest.
   - Renowned Instructor (13th, L2884): On Initiative roll, if dice < half max, regain to ceil(max/2). Defect B-250 and B-251 showed combat tracker initiative was missed and pool writes lacked receipts/undo.
   - 10 Instruction Options (L2895–2927): Defend Yourself!, Focus!, Get out of there!, Go!, Hang in there!, Keep fighting!, Now's your chance!, Snap out of it!, Steel Yourself!, Strike!.
   - Keep Fighting! (L2914): Grants Temporary HP equal to 1 Instruction Die roll. Defect B-253 showed THP was never applied or relayed.
   - Once More Unto The Breach (17th, L2889): Action, 1/Long Rest. Mass Help to all allies within 60 ft (see/hear), issues Instruction to each with no dice spent. Defect B-254 showed it only spent a use without issuing Instructions.

7. **Musha:**
   - Source: `03_chapter_3_character_classes.txt` L3255–3264: Soloblade recovers 2d6 HP on melee hit (2d8 at 7th, 2d10 at 14th). Defect B-280 showed HP was never written.
   - Stand Alone (L3262): Healing from another creature becomes Temporary HP. Defect B-283 showed self-heal exemption failed against native D&D5e options.
   - Not Yet (L3271, L3316): When reduced to 0 HP by hostile action: DC 10 WIS save (DC +5 per use, resets on Long Rest; resets on Max HP at 17th via To Laugh at Death). Success: survive with `2×PB` HP. Defect B-285 and B-286 showed no save button was offered and DC resets lacked warnings.
   - Blood Price (L3286–3297): Lose 2d8 HP (4d8 with Greater Blood Price at 13th). Unreducible, cannot spend Temp HP. Attacks cannot trigger Soloblade. Options: Center Oneself, Dig Deep (gain SP = HP lost), Iai (+half HP lost damage), Ichimonji (+HP lost damage, Advantage). Defect B-281 and B-282 showed no HP loss was applied and options had no mechanical effect.
   - Go Forth & Retaliator (L3301–3304): Go Forth Reaction moves up to speed towards attacker. Retaliator (2 Aggression) requires Go Forth prerequisite; allows melee attack or Iai. Defect B-287 showed prerequisite was unchecked.

8. **Reaper:**
   - Source: `03_chapter_3_character_classes.txt` L3333–3374: Ruin pool (0–10 max). Gain 1 on Crit or kill. Lose 1 at turn end if no damage dealt to hostile creature (Push the Attack: Lingering Violence spends 1 Aggression to prevent). Lose all at 0 HP. Defect B-290, B-291, B-295 showed gain at cap broke undo, Curtainfall spent Ruin before hit, and 0 HP reset was un-gated and lacked receipts.
   - Healing Penalty: Healing received from another creature reduced by table value (0 at Ruin 0 down to -20 at Ruin 10). Min net healing 0. Defect B-296 showed self-healing and GM edits were erroneously penalized.
   - Reap & Curtainfall (L3385–3404): Reap: 15-ft cone (or 10-ft sphere at 13th via Reaper Prime), DEX save vs Martial DC, half damage on fail (full at 13th), 0 on save. Level 4+ rolls d20 attack check; crit inflicts Vulnerability on non-elites. Curtainfall: melee attack, +1d6 per Ruin on hit (unmultiplied by crit), ignores physical resistance on crit; spends all Ruin AFTER damage dealt. Defect B-292 and B-293 showed rolls and crit ranges were missing.
   - Fear the Reaper (10th, L3414–3420): 1/Long Rest Bonus Action, marks hostile creature seen for 1 hour. Deals 1d6 Psychic when creature sees/hears Reaper gain Ruin (immune to Frightened takes 0). Memento Mori (17th, L3424) triggers on this psychic damage. Defect B-294 showed mark was a free-text name with no psychic damage or expiry.
   - Divergence in DECISIONS.md: Defect B-298 proved DECISIONS L1905–1918 invented mechanics not present in source ("+2 Ruin for Elite/Leader", "Advantage on Intimidation at Ruin 3+", "+10 ft Speed at Ruin 6+", "Resistance to Necrotic and Cold at Ruin 9+", "Death's Due", "Master of the Scythe").

### 2.2 Logic Chain
1. **Source Supremacy:** `WORKFLOW.md` §2 establishes `AK5e_1.3.1_Foundry_Source/` as the sole rules authority. All mechanics must reflect the exact source text; invented mechanics in `DECISIONS.md` or code must be purged.
2. **Table-Play Philosophy (`WORKFLOW.md` §3.2):**
   - Every active feature, technique, instruction, or art use must present a confirmation dialog summarizing costs, targets, and warnings prior to committing document edits or resource expenditures.
   - Prerequisite, range, timing, or resource shortfalls must warn, not block. Clicking "Use anyway" clamps resource spends at 0, records the shortfall publicly on the chat card, and writes an undo receipt restoring prior state.
   - Player dice (damage, healing, attack rolls, saving throws) must NEVER be auto-evaluated by module code. Cards must render interactive roll and save buttons for participants.
   - Changes to unowned target tokens/documents must relay automatically through the GM client without human approval gates.
   - All operations must write reversible undo receipts under `flags.ak5e.guardUses` valid within the active encounter window.
3. **Subclass Isolation & Identity:**
   - Identity checkers (`isCenturion`, `isCrusher`, `isInstructor`, `isMusha`, `isReaper`, etc.) must strictly check the Actor's active subclass Item (`guardBranch(actor)`), not merely stray feature Items left over from respeccing or previous imports.
4. **Clean Hook Registration:**
   - Lifecycle hooks (`dnd5e.preApplyDamage`, `dnd5e.rollInitiative`, `updateActor`, etc.) must be idempotent, execute writes only on the owning or elected GM client, and generate undo receipts for state alterations.

### 2.3 Caveats
1. **Source Ambiguities Documented as Decisions / Per-Use Readings:**
   - *Crusher Heroic Blow Rider:* Source text states Heroic Blow expends a use of Foecrusher to make the attack a Heroic Blow, rerolling damage dice and gaining Crush(2×PB). It is ambiguous whether it also carries one of the four base Foecrusher effects (Staggering, Dazing, Renewing, Smashing). Recommended ruling: Player chooses per-use reading (Heroic Blow only vs Heroic Blow + Foecrusher rider) until ruled by GM.
   - *Crusher Singular Strike Scope:* Source text says "when you take the Attack Action". Attacks from Bonus Actions (e.g. Brawler Fighting Style) or Reactions (Unrelenting) are separate actions and do not add to or consume Singular Strike.
   - *Crusher Horde Breaker Excess:* Source text specifies "excess Damage from the original Attack". This represents overkill damage beyond what reduced the target to 0 HP.
   - *Instructor Cooperative Combat Dice:* Source text says "you also gain the benefit of that Instruction". Does the Instructor share the recipient's roll result or roll a separate die? Confirm dialog should offer player per-use choice (shared roll vs separate roll) until GM records a ruling.
   - *Musha Stand Alone Amount:* When another creature heals the Musha, does the Musha gain Temp HP equal to the nominal heal rolled, or clamped to missing HP? Source text ("equal to the Hit Points you would have recovered") supports nominal heal or missing HP. Player picks per-use until GM records ruling.
   - *Centurion Brutal Execution Text:* Source text L2573 omits the word "take" ("must succeed on a Wisdom Saving Throw against your Centurion DC or Psychic Damage equal to your Intimidation Modifier"). Canonically parsed as: on a failed save, take Psychic Damage equal to Intimidation Modifier and become Frightened until end of next turn.
2. **Scope of Specification:**
   - This specification covers Base Guard and the 7 audited subclasses. Duellist, Liberator, and Lord were specified in the preceding batch and are already documented in `TODO.md` and `DECISIONS.md`.

### 2.4 Conclusion
The authoritative specification from Chapter 3 resolves all 65 pending defect reports completely. No rules invention is necessary. Implementing the exact source formulas, dice scaling, action economies, and WORKFLOW §3.2 table-play contracts will bring the Guard module into 100% compliance with AK5e 1st Edition v1.3.1.

### 2.5 Verification Method
1. **Static Validation:**
   - `node ak5e/tools/validate-files.mjs`
   - `node ak5e/tools/verify-generated-content.mjs`
2. **Automated Unit Tests:**
   - `npm run test:guard`
   - `node --test ak5e/test/guard-*.test.mjs ak5e/test/centurion.test.mjs ak5e/test/artsblade.test.mjs ak5e/test/brawler.test.mjs ak5e/test/crusher.test.mjs ak5e/test/instructor.test.mjs ak5e/test/musha.test.mjs ak5e/test/reaper.test.mjs`
3. **In-Foundry Playwright Headless Verification:**
   - Run `/tmp/run-guard-live.sh` on port 30175 with `launchTestBrowser()` exercising sheets, controls, confirmation dialogs, roll buttons, GM target relays, and encounter-window undo receipts.

---

## 3. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Base Guard | Hit Points & Progression | Level 1–20 chassis: d10 Hit Die, HP formula, ASIs (4/6/8/10/12/16/19), Extra Attack at 5th | Level, CON mod, ASI selections | Max HP, Hit Dice pool, feature grants | Clamps to max 20 Ability Score; re-run idempotent | Ch.3 L1764–1813 |
| 2 | Base Guard | Aggression Pool | Resource fueling Press the Attack options (Forestall, Smite, Strike True). Caps: 4 (1st), 6 (7th), 8 (14th) | Rest trigger, ability spend | Current Aggression value | Shortfall warns with "Use anyway"; clamps at 0 | Ch.3 L1874–1891 |
| 3 | Base Guard | Unrelenting Pool | Off-turn attack when another creature ends turn. 1/LR at 3rd, 2/LR at 11th. Pursuit at 11th allows Action/BA | Reaction on turn end, spend 1 or 2 uses | Off-turn attack/action window | Warns if 0 uses; "Use anyway" clamps at 0 | Ch.3 L1895–1899, L1928–1934 |
| 4 | Base Guard | Martial DC | Core saving throw DC for martial abilities and infused Arts | STR or DEX mod (choice), PB | `8 + PB + max(STR, DEX)` | N/A (derived property) | Ch.1 L211–213 |
| 5 | Base Guard | Unrelenting Aggression | 15th level Press the Attack (2 Aggression): Melee attack miss deals damage rolled without ability mod | Reaction on melee miss, 2 Aggression | Damage roll without ability modifier | Warns on missing reaction or Aggression | Ch.3 L1938–1942 |
| 6 | Base Guard | Eternal Aggression | 18th level: When expend use of Unrelenting, roll 1d4 and regain that much Aggression | Unrelenting expenditure | Regained Aggression (1d4, clamped to max 8) | Does not exceed maximum Aggression | Ch.3 L1943–1947 |
| 7 | Base Guard | Annihilation Protocol | 20th level: On Initiative roll, if 0 Unrelenting uses remain, regain 1 use | Initiative roll event | +1 Unrelenting use | Fired once per initiative roll; idempotent | Ch.3 L1948–1950 |
| 8 | Centurion | Centurion DC | Subclass save DC based on Intimidation modifier | Intimidation total skill bonus | `8 + Intimidation Modifier` | Distinguishes ability mod from total skill bonus | Ch.3 L2554–2556 |
| 9 | Centurion | Cyclone Strike | Cleave melee attack to 1 secondary target in Reach and within 10 ft of primary; 2 targets at 7th | Melee weapon attack roll | Secondary attack hit/damage resolution | Warns on reuse before next turn (1st–13th) or >1/turn (14th) | Ch.3 L2558–2565 |
| 10 | Centurion | Long-Arm | Melee weapons gain Reach during turn; existing Reach gains +5 ft | Active turn state, wielded melee weapon | +5 ft Reach during turn | Reverts outside turn unless Storm of Blood active | Ch.3 L2571–2572 |
| 11 | Centurion | Brutal Execution | Press the Attack (2 Aggression): Bonus Action/Reaction on kill; 15-ft burst WIS save vs Centurion DC | Kill event, 2 Aggression, BA or Reaction | Psychic dmg = Intimidation mod, Frightened condition | Warns if target not killed; non-lethal (0 HP = Unconscious) | Ch.3 L2573–2575 |
| 12 | Centurion | Fearmonger | Advantage on attacks against Frightened targets; Frightened targets have Disadvantage vs Centurion | Attack roll event, target conditions | Roll advantage/disadvantage | Restricted strictly to Centurion actors | Ch.3 L2581–2582 |
| 13 | Centurion | Ferocious Fling | 1/SR no action: throw killed creature <= own size within Reach up to 30 ft as ranged weapon attack | 0 HP creature in Reach, STR attack | Ranged attack dealing thrown creature's CON mod dmg | Refunded if Brutal Execution was used on thrown creature | Ch.3 L2583–2591 |
| 14 | Centurion | Guillotine | 10th level 1/LR Action: Melee weapon attack forces DEX save vs Martial DC for 2×PB d6 + Bleeding | Action, 1/LR use, melee weapon target | Xd6 weapon dmg (X=2×PB), Bleeding condition; Elite pulse | Elite/Leader fail pulses 30-ft WIS save vs Centurion DC Frightened | Ch.3 L2602–2608 |
| 15 | Centurion | Shredder | 13th level passive: On melee hit, secondary creature within 10 ft takes STR mod Slashing dmg | Melee weapon damage dealt | Secondary creature takes STR dmg (2×STR if Frightened) | Warns if no secondary creature within 10 ft | Ch.3 L2609–2613 |
| 16 | Centurion | Storm of Blood | 17th level 1/LR Action: 15-ft burst DEX save vs Martial DC for 10d8 Slashing + Frightened | Action, 1/LR use, targets within 15 ft | 10d8 Slashing, Frightened (flee); off-turn Long-Arm, AoO refund | Half dmg and not Frightened on save | Ch.3 L2614–2620 |
| 17 | Artsblade | Sword and Sorcery | Learn all levelled Arts <= 5th from 1 Standard Arts Pool. Spellsword Points: 1 (1st), 2 (7th), 3 (14th) | Short/Long Rest, Arts pool selection | SP pool (1–3), learned Spellsword Arts list | Spellsword Arts cannot be cast normally | Ch.3 L2205–2241 |
| 18 | Artsblade | Max Art Level & Casting | Cast as part of melee attack during turn (1 SP, max level). Must cast at max level | Melee attack, 1 SP, chosen Art | Infused Art resolution on target | Warns if casting below maximum level; 1 Art/turn limit | Ch.3 L2212–2260 |
| 19 | Artsblade | Augmented Assault | Press the Attack (2 Aggression): Turn (no action). Allows 2 Spellsword Arts this turn, both Blade Art | 2 Aggression, turn state | Unlocks 2nd Blade Art cast on turn | Cancel changes nothing; cannot use if already cast non-Blade Art | Ch.3 L2245–2246 |
| 20 | Artsblade | Resonance | Blade Art cantrip deals +1d6 Arts dmg (scales 2d6 at 5th, 3d6 at 11th, 4d6 at 17th) with pool riders | Blade Art cast, damage type selection | Typed damage and rider (Acid, Cold, Fire, Force, etc.) | Target save exemption recorded only after save, lasts to turn start | Ch.3 L2267–2324 |
| 21 | Artsblade | Cut Through Chaos | 4th level PB/LR Reaction: Melee attack roll vs spell attack or vs save DC; or cast Reaction Art free | Incoming spell attack or Art save, Reaction | Opposed roll comparison or free reaction Art cast | Uses tracked in pool; Clear Path (13th) grants no/half dmg | Ch.3 L2327–2336, L2374 |
| 22 | Artsblade | Unleash | 13th level passive: When Augmented Assault casts area Art, affects full normal area; immune to own dmg | Augmented Assault area Art cast | Area burst/cone/cube centered on target or line/cone from self | Target must be included in area | Ch.3 L2376–2377 |
| 23 | Artsblade | Power Overwhelming | 17th level: Ceaseless (+1 SP on init if < max), True Spellsword (melee deals Arts dmg), Ultimate Blade Art | Level 17 passives, 1/LR turn start activation | SP gain, Arts damage type, removes round cast limit to next turn end | Ultimate Blade Art expires cleanly at end of next turn | Ch.3 L2400–2409 |
| 24 | Brawler | Guns Out | Unencumbered & not wearing Med/Heavy Armour: Bob & Weave AC, DEX for Unarmed/Athletics, scaling fist dmg | Equipped armor check, STR, DEX mods | Base AC 10+STR+DEX, Unarmed 1d4/1d6/1d8 + mod | Inactive if Medium or Heavy Armour equipped | Ch.3 L2430–2439 |
| 25 | Brawler | Rain of Blows | 4th level: Denting Blows (Unarmed has Crush 3), Flurry (Attack Action grants +1 Unarmed Strike) | Attack Action, Unarmed Strike | Crush (3) property, 1 extra attack in Attack Action | Distinguishable from Bonus Action strike of Brawler Fighting Style | Ch.3 L2440–2446 |
| 26 | Brawler | Always Ready | 10th level passive: Regain 1 expended Aggression at beginning of turn in combat | Turn start combat event | +1 Aggression (clamped at maximum) | Inactive outside combat | Ch.3 L2450 |
| 27 | Brawler | Kick Them While They're Down | 13th level passive: Unarmed hit on creature with detrimental status condition deals +PB Bludgeoning dmg | Unarmed strike hit, target conditions | +PB Bludgeoning damage | Only applies to target hit with detrimental status condition | Ch.3 L2456–2460 |
| 28 | Brawler | Mountainbreaker | 17th level 1/LR Action: 10-attack chain with cumulative -2 to hit, OR single attack with 5× damage + push | Action, 1/LR use, mode selection | Chain attack sequence OR 5× damage hit + 20-ft push + Prone | Sequence terminates on first miss or 10 attacks | Ch.3 L2461–2470 |
| 29 | Brawler | Brawling Techniques | 15 techniques fueled by Aggression (Body Check, Cross Counter, Chokehold, Human Shield, Skullshaker, etc.) | Aggression spend, specific action triggers | Technique-specific movement, grapple, shove, damage, or condition | Overspent Aggression clamps at 0 with public warning | Ch.3 L2478–2541 |
| 30 | Crusher | Heavy Melee Weapons | Category definition: Greataxe, Greatsword, Heavy Hammer, Polearm (Chapter 4 L83) | Wielded weapon category | Qualifies for Heavy Metal, Death's Passing, Singular Strike | Does not match ranged or non-category weapons | Ch.4 L83–87 |
| 31 | Crusher | Extreme Fortitude | 1st level passive: Whenever roll a Hit Die, roll two dice and discard the lowest result | Hit die roll event (rest, Renewing Strike) | Kept highest die of two rolled | Applied to all Hit Die rolls | Ch.3 L2639 |
| 32 | Crusher | Singular Strike | Attack Action restricted to 1 attack; adds weaponBase + STR + magicBonus per forgone attack | Attack Action, forgone attack count | Scaled single attack damage formula | Melee attacks only; does not affect BA or reaction attacks | Ch.3 L2650–2662 |
| 33 | Crusher | Death's Passing | Miss with Heavy Melee Weapon during Attack Action deals half rolled damage as Thunder damage | Attack Action miss with Heavy Melee Weapon | Half damage dealt as Thunder damage | Only applies on Attack Action with Heavy Melee Weapon | Ch.3 L2646 |
| 34 | Crusher | Foecrusher | PB uses/Short Rest: Staggering (half speed), Dazing (Dazed), Renewing (spend HD, heal), Smashing (push 15) | Melee attack hit, Foecrusher use spend | Chosen rider applied to target or self | Renewing Strike spends 1 Hit Die; warns if 0 HD | Ch.3 L2666–2679 |
| 35 | Crusher | Overbear | Press the Attack (2 Aggression): Apply to Foecrusher attack; +1d10 damage, add second distinct rider free | Foecrusher attack, 2 Aggression | +1d10 damage, second distinct Foecrusher effect | Warns if not used on Foecrusher attack; riders must differ | Ch.3 L2680 |
| 36 | Crusher | Horde Breaker | 10th level passive: Reduce creature to 0 HP with Heavy Melee, repeat attack on adjacent foe for excess dmg | 0 HP kill with Heavy Melee Weapon | Repeat attack dealing unrolled excess damage | Stops when attack misses, target survives, or excess damage 0 | Ch.3 L2695 |
| 37 | Crusher | Heroic Blow | 13th level: Spend 1 Foecrusher use on melee attack; reroll damage dice, gain Crush (2×PB + existing) | Foecrusher use, melee attack during turn | Damage reroll option, Crush (2×PB + weapon Crush) | Warns if not during turn or no Foecrusher uses | Ch.3 L2697–2699 |
| 38 | Crusher | Heroic Killing Blow | 17th level passives: Execution (reduces target < 50 HP with Heroic Blow kills instantly), Realmrending | Heroic Blow hit, target HP | Instant kill if target HP < 50; ignores Physical Resistance | Only applies to Heroic Blows | Ch.3 L2700–2706 |
| 39 | Instructor | Instruction Dice Pool | 4 dice (1st), 5 (7th), 6 (14th); d6 scaling to d10 at 13th. Short or Long Rest recovery | Help Action, Instruction selection | Expends 1 Instruction Die | Shortfall warns with "Use anyway"; clamps at 0 | Ch.3 L2854–2862 |
| 40 | Instructor | Renowned Instructor | 13th level passive: On Initiative roll, if dice < half max, regain to ceil(max/2) | Initiative roll event | Restores Instruction Dice to ceil(max/2) | Fired once per initiative roll; creates receipt with undo | Ch.3 L2884 |
| 41 | Instructor | 10 Instruction Options | Defend Yourself!, Focus!, Get out of there!, Go!, Hang in there!, Keep fighting!, etc. | Target ally within Help range, 1 die spend | Stat bonus, movement, save bonus, THP, or strike | Keep Fighting! applies THP via GM relay; Strike! reactions | Ch.3 L2895–2927 |
| 42 | Instructor | Kingmaker | 10th level: 1/Turn when issue Instruction, issue same Instruction to 2nd ally within 30 ft free (fixed d6) | 1st Instruction use, 2nd ally target | Free 2nd Instruction using d6 die | Warns if reused on same turn or different instruction | Ch.3 L2876–2878 |
| 43 | Instructor | Cooperative Combat | Press the Attack (1 Aggression): When issue Instruction, Instructor also gains benefit of that Instruction | Instruction issue event, 1 Aggression | Instructor receives instruction benefit | 1/Round limit (until start of next turn); warns on repeat | Ch.3 L2874–2875 |
| 44 | Instructor | Once More Unto The Breach | 17th level 1/LR Action: Help all allies within 60 ft (see/hear); issue Instruction to each free of dice cost | Action, 1/LR use, allies within 60 ft | Mass Help and free Instructions to all allies in range | Cannot trigger Kingmaker; warns if reused before Long Rest | Ch.3 L2886–2892 |
| 45 | Musha | Soloblade | On melee hit, recover 2d6 HP (2d8 at 7th, 2d10 at 14th). Clamped to max HP | Melee attack hit | Heals 2d6/2d8/2d10 HP to Musha | Inactive on attacks made as part of Blood Price | Ch.3 L3260, L3287 |
| 46 | Musha | Stand Alone | When another creature would restore HP to Musha, Musha gains Temporary HP instead | External heal event | Grants Temporary HP instead of real HP | Does NOT affect self-healing (Soloblade, rest dice, potions) | Ch.3 L3262 |
| 47 | Musha | Not Yet | Reduced to 0 HP by hostile action: DC 10 WIS save (+5 per use, resets LR). Success: survive with 2×PB HP | Drop to 0 HP event, WIS save | Survives with 2×PB HP (recovers up to it) | DC increases by 5; 17th level resets on Max HP | Ch.3 L3271, L3316 |
| 48 | Musha | Blood Price Options | Lose 2d8 HP (4d8 at 13th with Greater). Center Oneself, Dig Deep (SP=HP), Iai, Ichimonji | Action, 2d8 unreducible HP loss | Option-specific condition cure, SP gain, or attack bonus | Cannot spend Temp HP; Soloblade cannot trigger | Ch.3 L3286–3297, L3308 |
| 49 | Musha | Go Forth & Retaliator | Go Forth: Reaction to move up to speed towards attacker. Retaliator: 2 Aggression to strike or Iai | Attack against Musha, Reaction, 2 Aggression | Movement towards attacker; melee attack or Iai | Retaliator requires Go Forth prerequisite; warns if missing | Ch.3 L3301–3304 |
| 50 | Musha | Living on the Edge | 13th level: <=50% HP grants +ceil(PB/2) to AC & seen saves; <=10% HP grants +PB to AC & seen saves | Current HP / Max HP threshold | AC bonus and Saving Throw bonus against seen effects | Updates dynamically as HP changes | Ch.3 L3310 |
| 51 | Reaper | Ruin Pool & Decay | Pool 0–10. Gain 1 on Crit or kill. Lose 1 at turn end if no hostile dmg. Lose all at 0 HP | Crit, kill, turn end, 0 HP event | Current Ruin value (0–10) | Capped at 10; undo restores exact prior value | Ch.3 L3333–3343 |
| 52 | Reaper | Lingering Violence | Push the Attack (1 Aggression): Prevent Ruin decay at turn end when no damage dealt | Turn end Ruin decay event, 1 Aggression | Prevents 1 Ruin decay | Warns if insufficient Aggression; clamps at 0 | Ch.3 L3342 |
| 53 | Reaper | Healing Penalty | External healing received reduced by table value (0 at Ruin 0 down to -20 at Ruin 10) | Incoming external heal event | Heal reduced by table value (minimum 0 net heal) | Penalty applies ONLY to healing from another creature | Ch.3 L3340, L3350 |
| 54 | Reaper | Reap | Replace Attack Action: 15-ft cone (10-ft sphere at 13th), DEX save vs Martial DC for half weapon dmg | Replace Attack Action, Melee weapon wielded | Half weapon dmg on fail (full at 13th), 0 on save | Level 4+ rolls d20 attack check; crit makes non-elites Vulnerable | Ch.3 L3388, L3396, L3422 |
| 55 | Reaper | Curtainfall | Replace Attack Action: Melee attack; on hit deals +1d6 dmg per Ruin held (not crit multiplied). Spends all Ruin | Replace Attack Action, Melee weapon hit | +1d6 per Ruin bonus dmg; Ruin resets to 0 AFTER damage | Ruin spent ONLY after attack hits and deals damage | Ch.3 L3390, L3398 |
| 56 | Reaper | Critical Scaling | Reap & Curtainfall crit ranges increase based on Reaper Table (Reap: +10 down to +0; Curtain: +0 up to +10) | Active Ruin level | Expanded critical hit threshold on d20 roll (`20 - bonus`) | Recomputes with Ruin changes; applies to owner's roll | Ch.3 L3350, L3401 |
| 57 | Reaper | Fear the Reaper | 10th level 1/LR Bonus Action: Mark hostile creature seen for 1 hour. Deals 1d6 Psychic on Ruin gain | Bonus Action, 1/LR use, hostile target seen | 1-hour mark; 1d6 Psychic on Ruin gain (Frightened immune takes 0) | Senses direction/movement; sees invisible target | Ch.3 L3414–3420 |
| 58 | Reaper | Memento Mori | 17th level no action: When marked target takes Psychic dmg, choose Vulnerability+no DR OR 10-ft splash 1d6 | Marked target takes psychic dmg | Target Vulnerable + ignores DR OR 10-ft splash 1d6 Psychic | Requires marked target taking mark psychic damage | Ch.3 L3424–3428 |

---

## 4. Edge Cases Discovered

| # | Feature | Input / Scenario | Observed / Required Behavior per Authoritative Spec |
|---|---------|------------------|------------------------------------------------------|
| 1 | Base Guard Progression | Running progression setup twice on the same actor at level 4 with unchanged choices | Second run must NOT add additional HP, duplicate ASIs, or re-grant existing items; state is strictly idempotent (B-132). |
| 2 | Base Guard Undo | Player uses a feature, triggers an internal flag (e.g. `Follow Up` used this turn), then executes Undo | Undo must revert both resource spends AND internal gameplay flags within the encounter window (B-133). |
| 3 | Reaction Spend | Operation kernel persistence failure or network error during a reaction use (e.g. Cut Through Chaos) | Reaction must not be spent if the receipt write fails; operations must be sequenced or atomic so reactions are never stranded (B-135). |
| 4 | Artsblade Pool | Artsblade selects "Frost" pool in sheet prompt | Payload must map to Cold damage type and Frost Resonance rider; must never silently default to Flame (B-136). |
| 5 | Artsblade Casting Level | Level 17 Artsblade (Max Art Level 5) attempts to cast a Spellsword Art at level 1 | Normal casting MUST cast at maximum available level (Level 5); manual override warns publicly (B-138). |
| 6 | Blade Art Save Immunity | Target creature is subjected to Blade Art save, but has not yet resolved the roll | Creature is NOT immune to subsequent saves until it actually makes a saving throw; once rolled, exemption lasts strictly until the start of the Artsblade's next turn (B-140). |
| 7 | Ultimate Blade Art Expiry | Level 17 Artsblade activates Ultimate Blade Art and combat advances past the end of their next turn | The casting-limit bypass flag must expire at the end of the next turn, surviving reloads and cleanly reverting on undo (B-134). |
| 8 | Brawler Armor Gate | Brawler equips native D&D5e Heavy Armor (`system.type.value = "heavy"`) | Guns Out features (Bob & Weave AC, Dexterous Attacks, Art of the Fist) must become inactive; warns if attempted (B-141). |
| 9 | Brawler Ability Double-Count | Brawler has STR +2, DEX +4, and rolls an Unarmed Strike activity that already has ability set to Dexterity | Code must NOT blindly append DEX - STR; ability modifier must contribute exactly once (+4, not +6) (B-142). |
| 10 | Brawler Kick Them Down | Brawler targets a healthy token while having another Prone token selected in Foundry canvas | Bonus damage (+PB) must evaluate the actual token HIT, not unrelated canvas selections (B-143). |
| 11 | Centurion Fearmonger Scope | Non-Centurion Guard (e.g. Brawler) attacks a Frightened target | Centurion attack hook must verify `isCenturion(actor)` and grant advantage ONLY to eligible Centurions (B-144). |
| 12 | Centurion Cyclone Strike Frequency | Level 14 Centurion uses Cyclone Strike twice on their turn | Second use on the same turn must warn of frequency limit; below 14th, reuse before the Centurion's next turn warns (B-145). |
| 13 | Brutal Execution Intimidation | Actor has Intimidation ability mod +2, proficiency bonus +4, expertise +4 (total +10) | Centurion DC is `8 + 10 = 18`; Psychic damage dealt is `10` (total Intimidation Modifier, not base CHA mod) (B-147). |
| 14 | Crusher Weapon Detection | Crusher wields module Greatsword (`flags.ak5e.tableData.category = "Heavy Melee Weapons"`, properties `["two"]`) | Must qualify as Heavy Melee Weapon for Heavy Metal (+1 die), Death's Passing, and Singular Strike without requiring 5e `hvy` (B-230). |
| 15 | Renewing Strike Cost | Crusher hits with Foecrusher Renewing Strike while having 0 Hit Dice remaining | Must warn of 0 Hit Dice shortfall; if overridden, spends 1 Hit Die, clamps at 0, and restores Hit Die on undo (B-232). |
| 16 | Extreme Fortitude Rest Roll | Crusher spends Hit Dice during Short Rest or Renewing Strike | Two dice must be rolled and the lower discarded; card displays both dice and kept result (B-233). |
| 17 | Overbear Prerequisites | Crusher activates Overbear without an active Foecrusher attack, or picks identical riders | Must warn if no Foecrusher attack is active and reject identical primary/secondary riders (B-235). |
| 18 | Crusher Branch Identity | Actor has Centurion subclass item but has a leftover Crusher feature item from a previous test | `isCrusher` must be false; branch identity must derive strictly from the active subclass Item (B-237). |
| 19 | Renowned Instructor Initiative | Instructor rolls initiative from Combat Tracker ("Roll All" or tracker d20 button) | Tracker event must trigger dice restoration to `ceil(max/2)` if below half, creating an undoable receipt (B-250, B-251). |
| 20 | Keep Fighting! Temporary HP | Instructor issues Keep Fighting! to an ally token owned by another player | Roll result must apply to ally's Temporary HP via automatic GM relay without human approval gates (B-253). |
| 21 | Once More Unto The Breach | Level 17 Instructor activates Once More Unto The Breach | Must prompt for Instruction selection per ally within 60 ft, generating separate roll buttons without consuming dice (B-254). |
| 22 | Soloblade Healing | Musha hits with a melee attack and rolls Soloblade healing (2d6) | Rolled healing must be applied to Musha's real HP (clamped to max HP) and reversed on undo (B-280). |
| 23 | Blood Price Self-Damage | Musha activates Dig Deep, rolling 2d8 on Blood Price | 2d8 self-damage must reduce real HP only (bypassing DR, resistance, and Temp HP); SP gained equals rolled HP lost (B-281, B-282). |
| 24 | Stand Alone External Heal | Ally casts Cure Wounds on Musha for 15 HP | Intercepted in `preApplyDamage`; Musha gains 15 Temporary HP instead of real HP. Self-healing (Soloblade) is exempt (B-283). |
| 25 | Not Yet Outright Kill | Level 5 Musha takes massive damage exceeding max HP | Outright kill warning displayed; at level 17 (To Laugh at Death), Not Yet explicitly functions against outright kills (B-285). |
| 26 | Reaper Ruin Cap Undo | Reaper at Ruin 10 gains 1 Ruin, then clicks Undo | Ruin gain at 10 clamps at 10; undo must restore exact prior value (10), not reduce Ruin to 9 (B-290). |
| 27 | Curtainfall Miss | Reaper confirms Curtainfall, but the melee attack roll misses | Ruin must NOT be expended on a miss; Ruin is spent only after the attack hits and deals bonus damage (B-291). |
| 28 | Reap Critical Hit | Level 5 Reaper uses Reap and rolls a natural 20 on the d20 weapon check | Non-Elite, non-Leader creatures failing or succeeding the save are Vulnerable to its damage (B-292). |
| 29 | Fear the Reaper Psychic Damage | Marked creature sees or hears Reaper gain Ruin | Marked creature takes 1d6 Psychic damage via GM relay, unless immune to Frightened condition (B-294). |
| 30 | Reaper Healing Penalty Scope | Reaper at Ruin 4 (penalty -8) drinks a healing potion or receives GM token bar correction | Self-healing and GM edits are EXEMPT from penalty; penalty applies only when another creature restores HP (B-296). |

---

## 5. Detailed Rules Specifications by Subclass / Feature Group

### 5.1 Base Guard

#### 5.1.1 Chassis, Progression & Pools
- **Hit Die:** 1d10 per Guard Level (L1765).
- **1st Level HP:** 10 + CON modifier (L1766).
- **Higher Level HP:** 1d10 (or fixed 6) + CON modifier per Guard level (L1767).
- **Proficiencies:** Light Armour, Medium Armour, Light Shields, all Melee Weapons, Maintenance Kit (L1770–1772).
- **Saves:** Strength + choice of Constitution or Dexterity (L1773).
- **Skills:** Choose 3 from Acrobatics, Athletics, Lore, Insight, Intimidation, Wilderness (L1774).
- **Martial DC:** `8 + Proficiency Bonus + max(STR mod, DEX mod)` (Ch.1 L211–213).
- **Aggression Pool:**
  - Value: 4 (1st–6th), 6 (7th–13th), 8 (14th–20th) (L1877–1879).
  - Recovery: Short or Long Rest.
  - Spends: Press the Attack options (Forestall: 1–3 Aggression; Smite: 1–3 Aggression; Strike True: 1–3 Aggression; Unrelenting Aggression: 2 Aggression; Subclass techniques).
- **Unrelenting Pool:**
  - Value: 1 (3rd–10th), 2 (11th–20th) (L1898, L1931).
  - Recovery: Long Rest.
  - Action Economy: Reaction when another creature ends its turn.
  - Base Effect: Immediately make a single Attack (L1896).
  - Pursuit Unrelenting (11th): Expend additional use to take an Action or Bonus Action instead of an Attack (L1933).
  - Eternal Aggression (18th): Expending a use of Unrelenting rolls 1d4; recover that much expended Aggression (L1946).
  - Annihilation Protocol (20th): Rolling Initiative with 0 Unrelenting uses regains 1 use (L1949).

---

### 5.2 Centurion Subclass

#### 5.2.1 Rules & Formulas
- **Centurion DC:** `8 + Intimidation Modifier` (`skills.itm.total`) (L2554–2556).
- **Cyclone Strike (1st Level):**
  - Trigger: Melee Weapon Attack against only 1 creature (L2562).
  - Scope: Cleave to 1 secondary creature within Reach and within 10 ft of primary (2 creatures from 7th level) (L2562, L2564).
  - Resolution: Secondary target takes weapon damage if attack roll > secondary AC, independent of primary hit (L2562).
  - Frequency: Once until beginning of next turn (1st–13th level); once per turn from 14th level (L2562, L2564).
- **Shock Trooper (1st Level):**
  - Intimidating: Proficiency in Intimidation, or Expertise if already proficient (L2569).
  - Long-Arm: Melee weapons gain Reach during the Centurion's turn; existing Reach weapons gain +5 ft during turn (L2571).
  - Press the Attack: Brutal Execution (2 Aggression):
    - Trigger: Bonus Action or Reaction immediately after killing a creature (L2573).
    - Area: Hostile creatures within 15 ft (L2573).
    - Save: WIS save vs Centurion DC (L2573).
    - Effect: On fail, take Psychic damage equal to Intimidation Modifier and become Frightened until end of Centurion's next turn (L2573).
    - Non-lethal: 0 HP reduces targets to Unconscious rather than dead (L2573).
- **Mow Them Down (4th Level):**
  - Fearmonger: Advantage on attack rolls against Frightened creatures; Frightened creatures have Disadvantage against the Centurion (L2581).
  - Ferocious Fling: 1/Short Rest, no action. Creature <= own size reduced to 0 HP within Reach is thrown up to 30 ft as a STR ranged weapon attack. On hit, deals Bludgeoning damage equal to thrown creature's CON modifier. If Brutal Execution was used on thrown creature, Ferocious Fling is refunded (L2583–2591).
- **Guillotine (10th Level):**
  - Action, 1/Long Rest. Melee weapon target in Reach makes DEX save vs Martial DC.
  - Fail: Takes `2×PB` d6 weapon damage and begins Bleeding. If target was Elite or Leader, hostile creatures within 30 ft must make WIS save vs Centurion DC or become Frightened until end of Centurion's next turn.
  - Success: Half damage, no other effects (L2602–2608).
- **Shredder (13th Level):**
  - On melee weapon damage, different creature within 10 ft takes STR mod Slashing damage (doubled if Frightened) (L2609–2613).
- **Storm of Blood (17th Level):**
  - Action, 1/Long Rest. Creatures of choice within 15 ft make DEX save vs Martial DC.
  - Fail: 10d8 Slashing damage and Frightened until end of next turn (must flee).
  - Success: Half damage, not Frightened.
  - Rider: Long-Arm applies off-turn until end of next turn; hitting with AoO refunds Reaction (L2614–2620).

---

### 5.3 Artsblade Subclass

#### 5.3.1 Rules & Formulas
- **Spellsword Points (SP):**
  - Progression: 1 SP (1st–6th), 2 SP (7th–13th), 3 SP (14th–20th) (L2216–2241).
  - Recovery: Short or Long Rest.
- **Maximum Art Level:**
  - 1st–4th: 1st Level; 5th–8th: 2nd Level; 9th–12th: 3rd Level; 13th–16th: 4th Level; 17th–20th: 5th Level (L2216–2241).
  - Restriction: Spellsword Arts MUST be cast at maximum available level (L2212).
- **Casting Spellsword Arts:**
  - Trigger: Make a Melee Weapon Attack during turn; expend 1 SP to cast Art with casting time of Action or Bonus Action as part of that attack (L2249).
  - Frequency: 1 Spellsword Art per turn (L2249).
- **Press the Attack: Augmented Assault (2 Aggression):**
  - Trigger: During turn (no action), if no Spellsword Art cast yet this turn (L2245).
  - Effect: May cast 2 Spellsword Arts this turn, but BOTH must be Blade Art (L2245).
- **Blade Art Cantrip & Resonance:**
  - Casting Time: Action (infused as part of melee attack); Range: Self; Duration: Instant.
  - Damage: 1d6 Arts damage (scales to 2d6 at 5th, 3d6 at 11th, 4d6 at 17th) (L2306, L2323).
  - Save Exemption: Once a creature rolls a save against Blade Art, exempt from further Blade Art saves until beginning of Artsblade's next turn (L2274).
  - 11 Resonance Riders (L2278–2291, upgraded at 10th level L2355–2368):
    - *Corrosion (Acid):* End of next turn takes equal Acid damage. (10th: Corroded condition).
    - *Earth (Bludgeoning):* Double Reach until end of turn. (10th: STR save vs Martial DC or Prone).
    - *Frost (Cold):* CON save vs Martial DC or half speed. (10th: Disadvantage on attack rolls).
    - *Flame (Fire):* DEX save vs Martial DC or Burning. (10th: Melee weapon attacks deal +1d10 Fire to next turn end).
    - *Crude (Force):* +1 to melee attack and damage rolls to next turn end. (10th: Increased to +3).
    - *Electric (Lightning):* 2nd creature in 15 ft takes half Lightning dmg. (10th: Up to 2 secondary creatures).
    - *Fluid (Piercing):* CON save vs Martial DC or no reactions to next turn end. (10th: Action or BA only on next turn).
    - *Psychic (Psychic):* Target loses 1d6 HP. (10th: Loses 2d6 HP).
    - *Light (Radiant):* Creatures in 10 ft take PB Radiant dmg. (10th: Radius doubled to 20 ft).
    - *Wind (Slashing):* CON save vs Martial DC or Bleeding. (10th: Automatic Bleeding, no save).
    - *Spatial (Thunder):* STR save vs Martial DC or pushed 20 ft. (10th: Collision deals 3d10 Thunder).
- **Cut Through Chaos (4th Level):**
  - PB/Long Rest uses. Reaction.
  - Mode 1: Opposed melee attack roll vs incoming spell attack roll (hits miss on >) (L2330).
  - Mode 2: Opposed melee attack roll vs incoming Art save DC (succeeds on >) (L2331).
  - Mode 3: Cast Reaction Spellsword Art without expending SP (L2332).
  - Clear Path (13th): No damage on save success, half on failure (L2374).
- **High Fantasy (13th Level) - Unleash:**
  - Augmented Assault area Art affects normal area; Artsblade immune to own damage (L2376).
- **Power Overwhelming (17th Level):**
  - Ceaseless: Gain 1 SP on Initiative if below max (L2403).
  - True Spellsword: Expending SP makes melee attacks Arts damage until next turn start (L2405).
  - Ultimate Blade Art: 1/Long Rest, turn start (no action): Round cast limit removed until next turn end (L2407).

---

### 5.4 Brawler Subclass

#### 5.4.1 Rules & Formulas
- **Guns Out (1st Level):**
  - Armor Gate: Inactive if wearing Medium or Heavy Armour (L2432).
  - Bob and Weave: Base AC = `10 + STR modifier + DEX modifier` (L2434).
  - Dexterous Attacks: Can use DEX instead of STR for attack/damage of Unarmed Strikes and Athletics Grapple/Shove (L2436).
  - Art of the Fist: Unarmed Strike damage = 1d4 + mod (scales to 1d6 at 7th, 1d8 at 14th) (L2438).
- **Rain of Blows (4th Level):**
  - Denting Blows: Unarmed strikes gain Crush (3) property (L2443).
  - Flurry: Attack Action grants 1 additional Unarmed Strike as part of that Action (L2445).
- **No Ordinary Pugilist (10th Level):**
  - Always Ready: Regain 1 expended Aggression at beginning of turn in combat (L2450).
  - Master Brawler: Unlocks Advanced Brawling Techniques (L2452).
- **Kick Them While They're Down (13th Level):**
  - Unarmed hit against creature with detrimental status condition deals +PB Bludgeoning damage (L2459).
- **Mountainbreaker (17th Level):**
  - Action, 1/Long Rest. Choose:
    - Chain: Unarmed strike chain up to 10 attacks; each attack after first suffers cumulative -2 to hit; terminates on miss (L2465).
    - Big KO: Single unarmed strike dealing 5× damage; if target <= 1 size larger, pushed 20 ft and knocked Prone (L2466).
- **Techniques Fueled by Aggression:**
  - Basic: Body Check (1 Agg), Cross Counter (1 Agg), Feint (1 Agg), Follow Up (1 Agg, 1/turn), Footwork (1 Agg), Guard Up (1 Agg), Slip Off (2 Agg), Tag In (2 Agg, 1/turn) (L2487–2514).
  - Advanced: Chokehold (2 Agg, target loses STR or DEX score HP), CQC (2 Agg), Disarm (3 Agg), Human Shield (2 Agg), Menace (2 Agg, WIS save vs Martial DC Frightened), Skullshaker (2 Agg, double damage + Dazed), Weigh In (2 Agg, WIS save vs Martial DC goad) (L2521–2540).

---

### 5.5 Crusher Subclass

#### 5.5.1 Rules & Formulas
- **Heavy Melee Weapons Authority:**
  - Explicit category in Chapter 4 L83: Greataxe, Greatsword, Heavy Hammer, Polearm.
  - Flag: `flags.ak5e.tableData.category = "Heavy Melee Weapons"` or matching name.
- **Towering Might (1st Level):**
  - Extreme Fortitude: Whenever roll a Hit Die, roll two dice and discard the lowest result (L2639).
  - Maximum Bulk: Hit Point maximum increases by 3; +3 per level thereafter (L2641).
- **Crushing Blows (1st Level):**
  - Heavy Metal: Heavy Melee Weapons wielded deal +1 die of weapon base damage (L2648).
  - Death's Passing: Miss with Heavy Melee Weapon during Attack Action deals half rolled damage as Thunder damage (L2646).
  - Singular Strike: Attack Action limited to 1 attack. Adds `additionalAttacks * (weaponBaseDice + STR mod + magicBonus)` to that attack (L2650–2662).
- **Foecrusher (4th Level):**
  - Uses: `@prof` per Short Rest (L2678).
  - Riders:
    - Staggering Strike: Target speed halved to end of next turn (L2670).
    - Dazing Strike: Target Dazed to end of next turn (L2672).
    - Renewing Strike: On hit, expend 1 Hit Die, recover `1 Hit Die + CON mod` HP (L2674).
    - Smashing Strike: Pushed 15 ft; move up to half speed towards target without AoO (L2676).
  - Press the Attack: Overbear (2 Aggression):
    - Triggers on Foecrusher attack; deals +1d10 damage and adds second distinct rider without consuming Foecrusher use (L2680).
- **Divided when Conquered (10th Level):**
  - Additional Reach: Heavy Melee Weapons wielded gain Reach property (L2693).
  - Horde Breaker: 0 HP kill with Heavy Melee repeats attack on adjacent foe in Reach within 10 ft for excess unrolled damage (L2695).
- **Heroic Blow (13th Level):**
  - Melee attack during turn, expend 1 Foecrusher use: reroll damage dice, gain Crush (`2×PB + existing Crush`) (L2698).
- **Heroic Killing Blow (17th Level):**
  - Execution: Heroic Blow reducing target to < 50 HP kills instantly (L2703).
  - Realmrending Blow: Heroic Blows ignore Physical Damage Resistance (L2705).

---

### 5.6 Instructor Subclass

#### 5.6.1 Rules & Formulas
- **Squad Leader (1st Level):**
  - Help as Bonus Action following Attack Action; Help range extended to 30 ft (L2852).
- **Instruction Dice Pool:**
  - Count: 4 (1st–6th), 5 (7th–13th), 6 (14th–20th) (L2859–2861).
  - Die Size: d6 (1st–12th), d10 (13th–20th via Superior Instruction) (L2859, L2882).
  - Recovery: Short or Long Rest.
- **Superior Instruction (13th Level):**
  - Improved Instruction Dice: Dice become d10s (L2882).
  - Renowned Instructor: On Initiative roll, if dice < half max, restore to `ceil(max / 2)` (L2884).
- **Teach from Experience (4th Level):**
  - From Experience: Turn start in combat, gain benefit of 1 Instruction free (L2872).
  - Press the Attack: Cooperative Combat (1 Aggression): When issue Instruction, Instructor also gains benefit. 1/Round limit (L2874).
- **Kingmaker (10th Level):**
  - 1/Turn when issue Instruction, issue same Instruction to second ally within 30 ft free; die is always d6 (L2877).
- **Once More Unto The Breach (17th Level):**
  - Action, 1/Long Rest. Help all allies within 60 ft (see/hear); issue Instruction to each free of dice cost (L2889).
- **10 Instruction Options (L2898–2926):**
  - Defend Yourself!: AC + `ceil(roll / 2)` until end of next turn.
  - Focus!: +roll to next skill check before start of next turn.
  - Get out of there!: Move `3 * roll` (round to nearest 5 ft) without AoO from starting reach.
  - Go!: Move `half speed + 3 * roll` (round to nearest 5 ft).
  - Hang in there!: +roll to death save before end of next turn (>20 counts as nat 20).
  - Keep fighting!: Gains Temporary HP equal to 1 roll (relayed automatically to GM for unowned targets).
  - Now's your chance!: +roll to next attack roll before end of next turn.
  - Snap out of it!: Immediate save against start/end of turn effect with +roll bonus.
  - Steel Yourself!: +roll to next save within 1 minute.
  - Strike!: Reaction to make Attack or Action-cantrip, dealing +roll damage.

---

### 5.7 Musha Subclass

#### 5.7.1 Rules & Formulas
- **Tenacity (1st Level):**
  - Nothing to Lose: <= 50% HP: Bonus Action 1 melee weapon attack. <= 10% HP: Bonus Action 2 melee weapon attacks (L3258).
  - Soloblade: On melee hit, recover 2d6 HP (2d8 at 7th, 2d10 at 14th) (L3260).
  - Stand Alone: Healing received from another creature becomes Temporary HP instead (L3262).
- **Enduring Resolve (1st Level):**
  - WIS saving throw proficiency (L3269).
  - Not Yet: Reduced to 0 HP by hostile action: DC 10 WIS save (+5 per use, resets Long Rest). Success: survive with `2×PB` HP (L3271).
- **Blood Price (4th Level):**
  - Self-Damage: Lose 2d8 HP (4d8 at 13th via Greater Blood Price). Unreducible, cannot spend Temp HP (L3287, L3308).
  - Restriction: Attacks from Blood Price options CANNOT trigger Soloblade (L3287).
  - Options:
    - Center Oneself: Action. End Charmed, Dazed, Frightened, Paralyzed, or Stunned if duration < 24h (if > 1 min, suppress for 1 min) (L3289).
    - Dig Deep: Action. Gain SP equal to rolled HP lost (L3291).
    - Iai: Action. Move half speed straight line without AoO; melee attack at Advantage against creature passed through dealing +half HP lost damage (L3293).
    - Ichimonji: Action. Melee attack dealing +HP lost damage; Advantage on melee attacks against target to turn end (L3295).
- **Warrior Spirit (10th Level):**
  - Go Forth: Reaction when creature attacks you: move up to speed towards attacker (L3301).
  - Press the Attack: Retaliator (2 Aggression): After Go Forth, if attacker in reach: melee attack or Iai against attacker (L3303).
- **Found Alongside Death (13th Level):**
  - Greater Blood Price: Lose 4d8 HP for double benefits (L3308).
  - Living on the Edge: <= 50% HP: +ceil(PB/2) to AC & seen saves; <= 10% HP: +PB to AC & seen saves (L3310).
- **To Laugh at Death (17th Level):**
  - Not Yet DC resets to 10 whenever HP == Max HP. Functions against outright kills if body not destroyed (L3316).

---

### 5.8 Reaper Subclass

#### 5.8.1 Rules & Formulas
- **Ruin Pool (0–10 Max):**
  - Gain: +1 on Critical Hit or when reducing creature to 0 HP (L3336).
  - Decay: Lose 1 at turn end if no damage dealt to hostile creature (L3336).
  - Drop to 0 HP: Lose all Ruin (L3336).
  - Push the Attack: Lingering Violence (1 Aggression): Prevent turn end Ruin decay (L3342).
- **Healing Penalty:**
  - Reduces healing received from another creature by table value: `-2 * Ruin` (0 at Ruin 0 down to -20 at Ruin 10) (L3340, L3350).
  - Minimum net heal is 0. Penalty applies ONLY to incoming external healing (L3340).
- **Reaper Table & Cumulative Passives (L3350–3374):**
  - Ruin 0: Reap +10 crit range (crit on 10+), Curtainfall +0 (crit on 20), heal penalty 0.
  - Ruin 1: Reap +9, Curtainfall +1, heal -2.
  - Ruin 2: Reroll 1 on damage die (must use new); Reap +8, Curtainfall +2, heal -4.
  - Ruin 3: Reap +7, Curtainfall +3, heal -6.
  - Ruin 4: Movement does not provoke AoO from non-Elite/Leader; Reap +6, Curtainfall +4, heal -8.
  - Ruin 5: Reap +5, Curtainfall +5, heal -10.
  - Ruin 6: Move through hostile spaces (difficult terrain, cannot end in same space); Reap +4, Curtainfall +6, heal -12.
  - Ruin 7: Reap +3, Curtainfall +7, heal -14.
  - Ruin 8: Roll damage additional time and choose either total; Reap +2, Curtainfall +8, heal -16.
  - Ruin 9: Reap +1, Curtainfall +9, heal -18.
  - Ruin 10: Attacks or Reap reducing creature < 5 + Guard level HP kills instantly; Reap +0, Curtainfall +10, heal -20.
- **Death's Design (1st Level):**
  - Reap: Replaces Attack Action. 15-ft cone (or 10-ft sphere at 13th via Reaper Prime). Targets make DEX save vs Martial DC. Fail: half weapon damage (full at 13th). Save: 0 damage (L3388, L3422).
  - Curtainfall: Replaces Attack Action. Melee attack; on hit deals +1d6 damage per Ruin held (not multiplied on crit). Spends all Ruin AFTER damage dealt (L3390).
- **Crescendo of Violence (4th Level):**
  - Reap Crit: Roll d20 weapon attack check; on crit, non-Elite/non-Leader creatures are Vulnerable to its damage (L3396).
  - Curtainfall Crit: Ignores Physical Damage Resistance (L3398).
  - Critical Scaling: Reap crit threshold = `20 - tableBonus`; Curtainfall crit threshold = `20 - tableBonus` (L3350, L3401).
- **Fear the Reaper (10th Level):**
  - 1/Long Rest Bonus Action. Mark hostile creature seen for 1 hour. Target takes 1d6 Psychic when creature sees/hears Reaper gain Ruin (immune to Frightened takes 0). Sense direction/movement; see while Invisible (L3414–3420).
- **Memento Mori (17th Level):**
  - When marked target takes Psychic dmg from mark, choose: target Vulnerable + ignores DR, OR 10-ft splash 1d6 Psychic (L3424–3428).
- **Swarms & Hordes Ruling:**
  - Constituent unit max HP is kill threshold; `Math.floor(damage / unitMaxHp)` = kills/Ruin gained (L3406–3408).

---

## 6. WORKFLOW.md §3.2 Table-Play Architecture Alignment

All Guard and subclass gameplay actions must satisfy the six core principles of `WORKFLOW.md` §3.2:

1. **No GM Approval for Play (§3.2.1):**
   - Players may trigger any Guard feature, Technique, Instruction, Art, or subclass ability at any time without GM gatekeepers or turn-order hard stops.
2. **Automatic GM Relay (§3.2.2):**
   - Target updates on unowned documents (e.g. damage, conditions, Frightened status, Keep Fighting Temporary HP, Fear the Reaper mark) relay automatically through `operation-kernel.mjs` to the elected GM client without human approval prompts.
3. **Warn, Don't Block (§3.2.3):**
   - Resource shortfalls, missing equipment, out-of-range targets, or unfulfilled timing conditions appear as warnings with "Use anyway". Overridden resource expenditures clamp at 0, broadcast the shortfall on the chat card, and record prior values on undo receipts.
4. **Always Confirm Before Use (§3.2.4):**
   - Every active ability displays a confirmation dialog summarizing costs, targets, and warnings before committing changes. Cancelling exits cleanly with zero document alterations. Ability checks and saving throws retain native D&D5e behavior without extra confirmation dialogs.
5. **Never Auto-Roll Player Dice (§3.2.5):**
   - Damage, healing, attack, and saving throw dice are never automatically rolled by module logic. Chat cards render interactive buttons clicked by the document owner.
6. **Encounter-Window Undoability (§3.2.6):**
   - Every operation creates a reversible undo receipt under `flags.ak5e.guardUses` restoring modified documents and internal flags. Combat start locks previous receipts; combat end locks encounter receipts.

