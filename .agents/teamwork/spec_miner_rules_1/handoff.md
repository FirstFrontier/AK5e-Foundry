# Handoff Report — Specialist Base Class and Subclasses Specification Mining

## 1. Observation

Direct observations from the authoritative rules source `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`, cross-referenced with `04_chapter_4_equipment.txt` and repository files:

### 1.1 Base Specialist Class Chassis (L5161–5226)
- **Hit Dice (L5179):** 1d8 per Specialist level.
- **Hit Points at 1st Level (L5180):** 8 + CON modifier.
- **Hit Points at Higher Levels (L5181):** 1d8 (or 5) + CON modifier per Specialist level after 1st.
- **Proficiencies (L5184–5188):**
  - Armor: Light Armour, Medium Armour, Light Shields.
  - Weapons: Light Melee, Light Ranged.
  - Tools: Two Tool Kits of your Choice.
  - Saving Throws: Dexterity + one of your choice from Wisdom or Charisma.
  - Skills: Choose three from Acrobatics, Sleight of Hand, Stealth, Tech, Perception, Wilderness.
- **Equipment & Currency (L5190–5200):**
  - Choice 1: (A) 1x Light Melee Weapon OR (B) 1x Light Ranged Weapon.
  - Choice 2: (A) 1x Light Melee Weapon OR (B) 1x Light Shield.
  - Choice 3: (A) Reinforced Outfit OR (B) Underarmour.
  - 1x Tool Kit proficient with.
  - OR 1300 LMD.
- **Level Progression Table (L5204–5226):**
  - Level 1: PB +2 | Specialist Branch, Weapon Specialisation
  - Level 2: PB +2 | Basic Operator Skill
  - Level 3: PB +2 | Basic Talent
  - Level 4: PB +2 | Ability Score Improvement, Show Your Style
  - Level 5: PB +3 | Branch Feature
  - Level 6: PB +3 | Ability Score Improvement, Weapon Adept
  - Level 7: PB +3 | Elite 1 - Advanced Operator Skill
  - Level 8: PB +3 | Ability Score Improvement, Basic Talent Module
  - Level 9: PB +4 | Advanced Talent
  - Level 10: PB +4 | Ability Score Improvement
  - Level 11: PB +4 | Branch Feature
  - Level 12: PB +4 | Ability Score Improvement, Weapon Expertise
  - Level 13: PB +5 | Advanced Talent Module
  - Level 14: PB +5 | Elite 2 - Elite Operator Skill
  - Level 15: PB +5 | Branch Feature
  - Level 16: PB +5 | Ability Score Improvement
  - Level 17: PB +6 | Falling Upwards
  - Level 18: PB +6 | Weapon Mastery
  - Level 19: PB +6 | Ability Score Improvement
  - Level 20: PB +6 | Branch Feature
  - Total ASIs: 7 ASIs (Levels 4, 6, 8, 10, 12, 16, 19).

### 1.2 Weapon Specialisation (L5244–5299)
- Choice of Melee Combat or Ranged Combat at 1st level.
- Rule on duplicates (L5249, L5277): "You can’t take a Fighting Style option more than once, even if you later get to choose again."
- **Melee Combat Options (8 Fighting Styles):**
  1. `Brawler` (L5251): On each of your Turns, make an Unarmed Strike as a Bonus Action.
  2. `Deadly Fighter` (L5254): The first time each Turn you make an Attack Roll using a Weapon with Deadly Property, Critical Range increased by 1.
  3. `Defensive` (L5257): When hit by Attack while Melee Weapon or Shield equipped, Reaction to increase AC by 1d4 for duration of that Attack.
  4. `Duelling` (L5260): +1 bonus to Attack and Damage Rolls for Melee Attacks against the first Creature you Attack each Turn.
  5. `Great Weapon Fighting` (L5263): +2 bonus to Damage rolls with Melee Weapons wielded with two hands (must have Two-Handed or Versatile).
  6. `Lightly Armed` (L5266): When wielding Melee Weapon in one hand and no other Weapons or Shields, +2 Bonus to Attack Rolls with that Weapon.
  7. `Spearwall` (L5269): When making Melee Attack while not your Turn, Attack deals an additional dice of Damage.
  8. `Two-Weapon Fighting` (L5272): Add Ability Modifier to Damage of additional Attack(s) in Two-Weapon Fighting; draw/stow two one-handed weapons.
- **Ranged Combat Options (7 Fighting Styles):**
  1. `Braced for Action` (L5279): Once per Turn, when making Damage Roll for Weapon with Brace Keyword, reroll one of those dice.
  2. `Close and Personal` (L5282): No Disadvantage on Ranged Attack Rolls when hostile Creature is within 5 feet.
  3. `Cone of Fire` (L5285): Whenever making Attack using Spread Quality, deal additional Damage even if Attack misses.
  4. `Deadly Fighter` (L5288): The first time each Turn you make an Attack Roll using a Weapon with Deadly Property, Critical Range increased by 1.
  5. `Ranger` (L5291): +2 Bonus to Attack Rolls made with Ranged or Thrown Weapons.
  6. `Smooth Operator` (L5294): When making Attack as Bonus Action using Rapid Fire Property, add Ability Modifier to Damage Roll of additional Attack(s).
  7. `Two-Weapon Fighting` (L5297): Add Ability Modifier to Damage of additional Attack(s) in Two-Weapon Fighting; draw/stow two one-handed weapons.
- *Cross-list Duplicates:* `Deadly Fighter` and `Two-Weapon Fighting` are identical on both lists.

### 1.3 Core Specialist Features (L5312–5357)
- **Show Your Style (4th Level, L5312–5320):**
  - Resource pool: `prowess`. Maximum = Proficiency Bonus (`@prof`).
  - Gained: +1 Prowess on completing Short Rest; +1 Prowess on completing Long Rest. Also gained via Branch-specific triggers.
  - Spend: `Mark of a Specialist` (L5319): When failing on a Skill Check using a Skill you are Proficient in, expend 1 Prowess to reroll the Check. If reroll still fails, Prowess is refunded, but cannot reroll that Check again.
- **Weapon Adept (6th Level, L5321–5327):**
  - Melee Combat: On Attack Action, make one additional Attack as part of that Action (must be Melee). When rolling 1 or 2 on one or more Damage dice for a Melee Attack, reroll those dice (must use new results).
  - Ranged Combat: On Attack Action, make one additional Attack as part of that Action (must be Ranged). When rolling a 1 for a Ranged Attack Roll, reroll that die (must use new result).
- **Weapon Expertise (12th Level, L5336–5342):**
  - Melee Combat: Critical Range for Melee Attacks improved by 1. When rolling Melee Attack damage, expend 1 Prowess as Bonus Action to roll one additional Damage die and add to total.
  - Ranged Combat: Triple Advantage: When having Advantage on Ranged Attack Roll, roll an additional die (keep highest). Bonus Action: expend 1 Prowess to grant Advantage on next Ranged Attack Roll.
- **Falling Upwards / It's All Skill (17th Level, L5346–5350):**
  - Reaction when you would make a Saving Throw.
  - Expend 3 Prowess before rolling to auto-succeed as if rolling the minimum amount required.
- **Weapon Mastery (18th Level, L5351–5357):**
  - Melee Combat: Once per Turn on Melee Attack hit, deal additional Weapon Damage equal to `floor(SpecialistLevel / 2)`.
  - Ranged Combat: Once per Turn on Ranged Attack Roll, double Proficiency Bonus for the purpose of that roll.

### 1.4 Specialist Talents (L5446–5493)
- **Basic Talents (15 options, L5446–5465):**
  1. `Alacrity`: Speed +10 ft. Module: On Dash Action, add PB to AC until end of Turn.
  2. `Alert`: +PB to Initiative Rolls. Module: Advantage on Initiative Rolls.
  3. `Beneath Me`: 1/Turn, Advantage on Attack Roll vs creature of smaller Size. Module: On hit with that Advantage, +PB damage.
  4. `Bird Hunter`: Ranged Attacks vs non-grounded creatures deal +PB damage. Module: Reaction to attack a flying creature moving within Normal Range (PB/LR uses).
  5. `Critical Edge`: Critical Range +1. Module: Roll one additional damage die on Critical Hit extra damage.
  6. `Giant Killer`: Attacks vs Huge or larger creatures deal +1 damage die. Module: Attacks vs Huge or larger made with Advantage.
  7. `Hunter (X)`: Choose Aberration, Beast, Celestials, Construct, Fiends, Monstrosity, Plants, or Undead. Attacks deal +PB damage vs that type. Module: +PB to Attack Rolls vs that type.
  8. `Iron Guard`: When attacked, controlled/created Construct within 10 ft can use Reaction to redirect attack to itself. Module: Intercepting Construct is Resistant to all damage types for that attack.
  9. `Lasting Sting`: Creatures dealt Poison Damage during a turn take 2d10 Poison Damage at end of turn. Module: End of turn, target must also pass DC 15 CON save or be Poisoned until end of next turn.
  10. `Lucky`: 2 Luck Points. 1 pt -> Advantage on d20 roll OR force enemy Disadvantage on attack roll vs you. Long Rest recovery. Module: Maximum Luck Points = PB.
  11. `Parry`: Reaction when hit by attack while wielding melee weapon or shield -> +1d4 AC for that attack (+2d4 if also has Defensive Fighting Style). Module: d4 improved to d6.
  12. `Savage Attacker`: 1/Turn, when dealing attack damage, roll damage twice and choose result. Module: Deal +PB damage when using this feature.
  13. `Tough`: Max HP + 2 * Character Level (+2 each level thereafter). Module: When spending Hit Die, recover additional HP = PB.
  14. `Unarmoured Agility`: While wearing no armor, Speed +20 ft. Module: While wearing no armor, +PB to DEX saving throws.
  15. `Will of the Rat`: 1/LR, when taking damage, gain THP = Character Level first. Module: Also take half damage from triggering instance of damage.
- **Advanced Talents (18 options, L5471–5492):**
  1. `Alpha Strike`: First time dealing attack damage to a creature (resets on Initiative roll): +1d12 weapon damage. Module: +2d12 weapon damage instead.
  2. `Ambush`: After rolling Initiative, deal +1 damage die with attacks until end of next turn. Module: Applies to all damage dealt, not just attacks.
  3. `Crownslayer`: Outside combat, deal +2d10 damage to creatures also not in combat. Module: Outside combat, treat damage dice rolls of 1 or 2 as 3.
  4. `Curtain Call`: After dealing damage when not your turn, Crit Range vs that creature +1 until end of next turn. Module: Crit Range +2 instead.
  5. `Danger Sense`: While conscious, Advantage on DEX saves vs seen effects. Module: Invisible creatures don't get Advantage against you; cannot be Surprised while conscious.
  6. `Hidden Technique`: Gain 2 Grit Points (recover on SR/LR); learn 3 Basic Brawler Techniques from Guard Brawler branch. Module: +1 Grit Point, learn 2 more Techniques (total 3 Grit, 5 Techniques).
  7. `Jumpstart`: Start SP of Operator Skills increased by 5. Module: Increased by 10 instead.
  8. `Kingslayer`: Damage Resistance against all damage = PB when damage is from Elite or Leader. Module: Attacks vs Elite/Leader deal +1d8 Force damage.
  9. `Lone Journey`: At end of turn, if no other creatures within 10 ft, Damage Resistance = PB against all damage. Module: Allies no longer count as creatures within 10 ft.
  10. `One Moment`: While Skill is active, when dealing damage during your turn, deal +1d6 Force damage. Module: Increased to +1d10 Force damage.
  11. `One With Shadow`: Reaction when attacked without Advantage: force Disadvantage on attack roll (PB/LR uses). Module: Usable even if attack has Advantage.
  12. `Opportunist`: Attacks vs creatures with reduced Speed deal +PB damage. Module: Also applies against creatures with any detrimental Status Condition.
  13. `Reliable Talent`: On proficient skill check, treat d20 roll of 8 or less as 8. Module: Cannot have Disadvantage on any proficient skill or tool check.
  14. `Revenger`: If taken damage since last turn, first attack on turn deals +1d8 damage. Module: First attack roll also made with Advantage.
  15. `Running on Fumes`: 1/LR, when reduced to 0 HP but not killed, drop to 1 HP instead and gain THP = Constitution Score. Module: THP doubled.
  16. `Tactical Mind`: 1/LR, Reaction to reroll a d20 and add 1d10. Module: Recovers on Short Rest.
  17. `True Fang`: Knife attacks can take -5 attack penalty to ignore all Damage Reduction on target. Module: Also ignores Resistance to Physical Damage.
  18. `Unbalancer`: On forcibly moving a hostile creature, target must pass save vs Martial DC or Speed reduced by 10 ft until end of next turn (1/round per creature). Module: Speed reduction = max(10 ft, half distance moved).
- **Cross-Class Note on Part-Time Inventor:**
  - `Part-Time Inventor` is present in other classes' Advanced Talents tables (Defender L1184, Guard L2171, Sniper L3859, Supporter L6849, Vanguard L8205): "You gain the Equipment Modification Feature of the Inventor Specialist. However, your maximum number of Inventions is 1, and you cannot apply any Modification marked as Dangerous. Module: Your maximum number of Inventions becomes 2."
  - It is absent from Specialist's Advanced Talents table because the `Inventor` branch is an authored Specialist subclass (L5847) that Specialists can choose directly.

### 1.5 Executor Subclass (L5498–5578)
- **The Wolf and the Shepherd (Level 1, L5501–5516):**
  - Choice: `Hunter` vs `Bodyguard`.
  - `Deathmark` tracking:
    - Held by Specialist: At beginning of combat turn, gain +3 SP. Hide Action can be taken as a Bonus Action.
    - Transfer: Transferred from self to a hostile creature "by making an Attack against them" (L5506).
    - Return conditions: When target drops to 0 HP, OR at end of turn if Specialist has not Attacked or dealt Damage to the marked creature.
    - Return bonus: Specialist gains +3 SP and can immediately take Disengage Action as a Reaction.
    - While target is marked: Specialist deals +1d4 damage on hit (+2d4 at Lv 7, +3d4 at Lv 14).
    - Hunter benefit: Critical Range of attacks against marked creature increased by 1.
    - Bodyguard benefit: When marked creature attacks a target while both Specialist and target are in reach/range and within 10 ft of each other, Specialist can redirect the attack to target Specialist (no action required).
- **In Every Shadow (Level 5, L5517–5523):**
  - Movement: Gain Climbing and Swimming speeds equal to Walking Speed.
  - Stealth: Gain Stealth proficiency; if already proficient, gain Expertise (double PB).
- **Spring the Ambush / Escape the Ambush (Level 5, L5529–5541):**
  - Hunter (`Sweeper`): While Hiding or Invisible, expend 1 Prowess as an Action. Reach +5 ft until end of turn. Melee Attack each chosen creature within reach (1 attack per creature). On hit, target immediately gains Deathmark (even if already on another). At end of Action, Deathmark returns to Specialist.
  - Bodyguard (`Smokescreen`): Expend 1 Prowess as a Reaction to create 10-ft-radius sphere of smoke centered at feet until end of next turn (Magical Darkness). Choose one ally inside: they can use Reaction to move up to their Speed.
  - Prowess triggers:
    - Base: Gain 1 Prowess when marked creature reduced to 0 HP (max 1/turn until start of next turn).
    - Hunter: Gain 1 Prowess when dealing >= 30 damage with a single attack.
    - Bodyguard: Gain 1 Prowess at end of ally's turn if ally was attacked while within 10 ft of Specialist but took 0 damage from hostiles.
- **Preysense / Dangersense (Level 11, L5549–5555):**
  - Hunter: On Critical Hit, roll 1 additional damage die on extra damage; on Critical Hit against a living creature, also inflict Bleeding.
  - Bodyguard: Reaction when ally within 5 ft faces effect with STR/DEX save for half damage. Move together up to half Speed. If outside AoE: 0 damage on save success, half damage on save fail.
- **In for the Kill / Blade Shield (Level 15, L5556–5562):**
  - Hunter: When transferring Deathmark to hostile creature, target is Vulnerable against all damage dealt by Specialist's attacks until end of turn.
  - Bodyguard: Reaction when marked creature attacks Specialist while within reach: make Weapon Attack against that creature; on hit, subtract PB from creature's attack roll.
- **Mortal Blow / Ultimate Sword and Shield (Level 20, L5563–5571):**
  - Hunter (`Mortal Blow`): 1/LR Action. Choose creature within Speed, teleport to unoccupied space within 5 ft. Target makes DEX save vs Martial DC. Roll 10d8: fails lose rolled HP, succeeds lose half rolled HP. If Bleeding, HP loss is DOUBLED (20d8 equivalent). Bypasses DR and Resistance (direct HP loss).
  - Bodyguard (`Ultimate Sword and Shield`): Resistant to all damage from marked creature. Blade Shield no longer costs Reaction. Reaction when another creature within 10 ft is attacked: transfer Deathmark (wherever it is) to the attacking creature.

### 1.6 Hookmaster Subclass (L5585–5679)
- **Hooked (Level 1, L5588–5598):**
  - Weapon Conversion: Non-Two-Handed melee weapon dealing Slashing or Piercing damage.
  - Cost: Free starting melee weapon on adopting branch; or 200 LMD + 1 hour uninterrupted + melee weapon.
  - Properties gained:
    1. Proficiency: Only Hookmasters are proficient.
    2. Thrown (30/-), returning immediately after attack. (Increases to 50/- at Lv 15).
    3. Gains Two-Handed property.
    4. STR bonus may be used for Ranged Attack and Damage rolls.
    5. Pull on hit: Hit creature <= size + 1 -> pull 10 ft towards Specialist.
    6. Bonus Action Ranged Attack: Can make a Ranged Attack using Hook as Bonus Action. Restriction: Cannot make, or have made, any Ranged Attacks with Hook on a Turn you do this.
    7. Reversible via undo.
- **Covering Ground, Covering Options (Level 5, L5616–5627):**
  - `Big Boot`: On hitting creature <= size + 1 with Unarmed Strike, push 10 ft directly away.
  - `King of the Urban Jungle`: Prerequisite: moved >= 20 ft immediately beforehand during turn. Choose point on visible surface within Hook range (no action). Expires after move or end of turn:
    - Cannot attack with Hook.
    - Flying Speed = 2 * Hook range (60 ft, or 100 ft at Lv 15). Cannot move further from point than Hook range, cannot move higher than point, must move at least 10 ft from start.
    - Melee strike bonus: If dealing Melee Attack damage immediately after flying movement: deal +PB damage and DOUBLE any resulting forced movement distance!
- **Ensnare and Entangle (Level 5, L5635–5649):**
  - `Bound in Rope`: 1 Prowess Action while Hook equipped. Target <= size + 1 within Hook range. DEX save vs Martial DC or Grappled.
    - Reattempt save as Action. Ends if beyond Hook range or ended on turn (no action).
    - Bonus Action: drag target up to 15 ft towards Specialist.
    - Action when within 5 ft: hogtie (same effect as Manacles).
    - Hook lockout: While grappling this way, cannot use Hook to make attacks or use features.
  - `Wrangler`: 1 Prowess Action while Hook equipped. Target > size + 1 (more than one size larger). DEX save vs Martial DC or Hook latches on.
    - Move to target's space; occupy same space for duration; move with target without spending own movement.
    - Advantage on attacks against only that creature.
    - Optional -5 attack penalty to ignore all Damage Reduction on that creature.
    - Reattempt save at end of target's turn to shake off (possible falling damage). Can end on turn (no action).
  - Prowess triggers:
    - Gain 1 Prowess when causing a creature to take damage from the environment (falling, burning area).
    - Gain 1 Prowess at end of turn where Specialist moved > 45 ft with Flying Speed.
- **Mighty Push (Level 11, L5653–5657):**
  - Action within 5 ft. PB / Long Rest uses.
  - STR save vs Martial DC. Fail: 8d6 Bludgeoning damage + 20 ft knockback. Success: half damage + 10 ft knockback.
  - Collision: With wall/solid surface -> damage as if fallen that distance (20 ft = 2d6, 10 ft = 1d6). With creature -> both take falling damage.
- **Spider's Essence (Level 15, L5658–5666):**
  - Longer Hook: Thrown range becomes (50/-). (King of Urban Jungle flying speed becomes 2 * 50 = 100 ft).
  - Spider's Thread: Action, grapple surface above you. Climbing Speed = Hook range (50 ft) towards point from start until start of next turn. Allies starting from same location gain climb speed = Hook range until end of their turn.
  - Swing to Safety: King of Urban Jungle usable as Reaction while falling, if height sufficient for falling damage.
- **Scorpion Sting (Level 20, L5667–5674):**
  - 1 / Long Rest, Action while Hook equipped. Target within Hook range.
  - DEX save vs Martial DC. Auto-fails if already Grappled or Hooked (ignoring Hook restrictions).
  - Pull: Pull target to 5 ft (if <= size + 1) or pull self to 5 ft (if > size + 1).
  - Make 6 Attacks with Hook with Advantage!
  - Each attack deals additional Weapon Damage equal to `floor(SpecialistLevel / 2)` (+10 damage at Lv 20).

### 1.7 Infuser Subclass (L5684–5840)
- **Infuser DC (L5688–5690):**
  - Formula: `20 - Intelligence Modifier - Proficiency Bonus`.
  - Exact rule text: "Your Infuser DC is calculated as 20 - Your Intelligence Modifier - Your Proficiency Bonus."
- **Principle of Double Effect (Level 1, L5692–5700):**
  - Pharmacology Kit proficiency.
  - Alchemical Infusions pool: `2 * PB / Long Rest`.
  - Application: Bonus Action, willing creature seen within 5 ft (30 ft at Lv 11), duration 1 minute.
  - Restriction: Cannot target Construct or Undead. Only 1 infusion active per creature (applying second removes prior).
  - Leverage Workflow:
    - Infusion not consumed on Leverage.
    - Recipient makes CON save vs Infuser DC.
    - Pass: Gains Infusion benefit cleanly.
    - Fail: Gains Infusion benefit, BUT is Dazed until start of next turn and locked out of Leverages while Dazed.
- **All 8 Alchemical Infusions (L5782–5823):**
  1. `Adrenaline Trigger`: Reaction on failing STR check, STR save, or missing melee attack -> roll +1d6 to total.
  2. `Flight Reflex Stimulant`: Reaction on failing ANY saving throw -> add Infuser's INT modifier to result.
  3. `Focus Heightener`: Reaction on failing DEX check, DEX save, or missing ranged attack -> roll +1d6 to total.
  4. `Hesitation Suppressor`: Reaction when forcing hostile creature to make a save -> roll +1d4 added to save DC.
  5. `Muscle Strengthener`: Reaction on hitting with melee attack -> +INT modifier to damage.
  6. `Procoagulant`: Bonus Action -> roll one Hit Die (not expended) + CON mod as Temporary HP; remove Bleeding.
  7. `Respiration Stimulant`: Bonus Action -> Speed +10 ft until end of turn.
  8. `Sensation Nulling`: Reaction on taking damage -> roll 1d6, gain Damage Reduction = result against all damage until end of turn.
- **New Concoctions (Level 5, L5705–5726):**
  - Added to Pharmacology Kit Toxicology proficient use (Weight 1 lb, Cost 140 LMD):
    1. `Neurological Inhibitor`: On weapon (10 min): 1st hit/turn -> DC 15 CON save or Berserk until end of next turn (must attack closest creature). Food/drink: DC 15 CON save -> Berserk 1 hr on fail, 1 min on success.
    2. `Bungarotoxin`: On weapon (10 min or until hit): hit -> DC 15 CON save. Fail: 2d10 Poison damage and Paralyzed (repeat save at end of turn). Success: 2d10 Poison damage, not Paralyzed. Food/drink: DC 15 CON save -> Paralyzed & Unconscious 24 hr on fail, Paralyzed 1 hr on success.
- **Double-Blind Trial (Level 5, L5732–5743):**
  - Bonus Action while wielding weapon without toxin and have access to Pharmacology Kit.
  - Cost: 1 Prowess + 1 Alchemical Infusion use.
  - Roll 1d6 to apply corresponding Toxin:
    - 1: Neurological Inhibitor
    - 2: Necrotoxin (Ch. 4 L868: 1st hit/turn DC 15 CON save, 1d8 Poison + Necrotised; half on save)
    - 3: Haemotoxin (Ch. 4 L857: 1st hit/turn DC 15 CON save, 2d10 Poison; half on save)
    - 4: Cytotoxin (Ch. 4 L847: 10 min, +1d6 Poison damage on every hit)
    - 5: Neurotoxin (Ch. 4 L884: 1st hit/turn DC 15 CON save, 1d8 Poison + Nervous Impairment; half on save)
    - 6: Bungarotoxin
- **Infuser Prowess Triggers (L5745):**
  - Gain 1 Prowess when a creature that has Poisoned condition or is affected by Specialist's Toxin is reduced to 0 HP.
  - Gain 1 Prowess when Infusion effect causes creature to succeed on Attack Roll, Skill Check, or Saving Throw it would otherwise have failed (max 1/round).
- **Stimpack (Level 11, L5747–5754):**
  - Delivery Service: Range of Infusions increased from 5 ft to 30 ft.
  - Questionable Rejuvenation: When applying Infusion, AND when creature succeeds on saving throw against Infusion: target gains 1d10 Temporary HP (additive with Procoagulant THP).
- **Excessive Dosing (Level 15, L5758–5764):**
  - Succumb: DC of Specialist's Toxins increased by Proficiency Bonus (+PB).
  - Toxic Shock: Creatures failing save against Toxins are additionally Poisoned for same duration as Toxin's conditions (or until end of next turn if Toxin has no failed save condition, e.g. Haemotoxin).
- **To Defy Science (Level 20, L5765–5770):**
  - 1 / Long Rest, Action. Choose creature within 30 ft. Target cannot lose Hit Points for 1 minute (Invulnerability effect).

---

## 2. Logic Chain

1. **Class Chassis & Proficiencies:**
   - Source L5179–5200 explicitly defines 1d8 HD, 8+CON base HP, Light/Medium armor, Light Shields, Light Melee and Light Ranged weapons, 2 tool kits, DEX + choice of WIS or CHA saves, and 3 skills from a 6-skill list.
   - 7 ASIs are granted at 4, 6, 8, 10, 12, 16, 19, matching the Martial class chassis (Guard/Fighter).
2. **Fighting Style Rejection:**
   - Both Melee and Ranged lists include `Deadly Fighter` and `Two-Weapon Fighting`. The rule "You can’t take a Fighting Style option more than once, even if you later get to choose again" requires cross-list duplicate checking when selecting styles (e.g. via Parabellum or multiclassing).
3. **Prowess Resource Mechanics:**
   - Defined as `max = PB`. Source L5315 states: "You gain 1 Prowess whenever you complete a Short or Long Rest." The pool regenerates +1 on SR and +1 on LR, plus distinct subclass triggers during combat.
   - `Mark of a Specialist`: costs 1 Prowess on a failed proficient skill check; if the reroll also fails, 1 Prowess is refunded, but no further rerolls are permitted.
4. **Subclass Mechanics & Readings:**
   - **Executor Deathmark:**
     - Transfer: L5506 states "by making an Attack against them". This literal reading (`onAttackRoll`) triggers when the attack action/roll is initiated. In contrast, Sweeper (L5532) explicitly specifies "If you hit a Creature with an Attack...". Thus, standard transfer triggers on attack roll declaration, though an optional GM toggle for `onHitOnly` can be supported.
     - Return: Triggers at 0 HP or at turn end if NOT attacked or dealt damage. Grants +3 SP and Reaction Disengage.
     - Damage bonus: Scales +1d4 (Lv 1) -> +2d4 (Lv 7) -> +3d4 (Lv 14).
     - Mortal Blow (Lv 20): Specifies "loses Hit Points equal to amount rolled", doubled if Bleeding. In 5e/AK5e rules, direct HP loss is distinct from damage, bypassing DR and Damage Resistance (`bypassDRResist`).
   - **Hookmaster Hooked Weapon:**
     - Conversion of non-Two-Handed Slashing/Piercing weapon adds Two-Handed, Thrown (30/-, returning), STR-based ranged attack/damage, and 10 ft pull on hit vs size <= +1.
     - Bonus Action Ranged Attack has strict lockout: no other ranged Hook attacks permitted on that turn.
     - Flying movement from King of Urban Jungle (Lv 5) doubles Hook range (60 ft, or 100 ft at Lv 15); moving >45 ft in a turn triggers +1 Prowess.
   - **Infuser DC Formula:**
     - L5689 states `20 - INT - PB`.
     - Allies make CON saves when *benefiting* (Leveraging) an Infusion. Failing the save inflicts Dazed and locks out future Leverages. Therefore, a lower DC protects allies. Higher INT and higher PB reduce the DC (`20 - INT - PB`), modeling higher pharmacological purity with fewer adverse side-effects.
     - For offensive Toxins, the DC is fixed in Chapter 4 (DC 15 / DC 18) and boosted by +PB at Level 15 (Excessive Dosing: Succumb).
     - DECISIONS.md L465 prescribes preserving `20 - INT - PB` exactly.

---

## 3. Caveats

- **Invulnerability in To Defy Science (L5768):** Source states "cannot lose Hit Points for the next minute, as if they were under the effect of Invulnerability." In 5e, Invulnerability is a 9th-level spell granting immunity to all damage. Direct HP loss effects should be evaluated by the GM as to whether they are prevented; source text specifies "cannot lose Hit Points", making it absolute HP loss prevention.
- **Hookmaster Hook Return:** Hook returns immediately after attack. If the Hook is latched (Wrangler) or hogtied/grappling (Bound in Rope), the Hook cannot be used for attacks until released.
- **Part-Time Inventor Scope:** Identified as cross-class; no implementation required inside Specialist class features, as Inventor is a full Specialist subclass.

---

## 4. Conclusion

The specification for the Specialist Base Class and the Executor, Hookmaster, and Infuser subclasses is 100% extracted, verified, and mapped to Chapter 3 and Chapter 4 source rules. All features, formulas, conditions, action types, resource pools, and rulings are documented in full below.

---

## 5. Verification Method

To verify:
1. Inspect `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`:
   - Base Specialist: L5161–5493
   - Executor: L5498–5578
   - Hookmaster: L5585–5679
   - Infuser: L5684–5840
2. Inspect `AK5e_1.3.1_Foundry_Source/04_chapter_4_equipment.txt` L643–900 for Pharmacology Kit and Toxin statistics.
3. Validate against existing code in `ak5e/scripts/specialist-rules.mjs`, `ak5e/scripts/specialist-features.mjs`, and `ak5e/scripts/specialist-uses.mjs`.

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Base Class | Hit Dice & HP | 1d8 HD; 8+CON at 1st level; 1d8 (or 5) + CON thereafter | Level, CON mod, mode (fixed/rolled) | Max HP, Hit Dice string | Min 1 HP gained per level | Ch. 3 L5179–5181 |
| 2 | Base Class | Proficiencies | Light/Med armor, Light Shields, Light Melee/Ranged weapons, 2 tool kits, DEX + WIS/CHA saves, 3 skills | User selections | Proficiency flags | Reject invalid counts or disallowed skills | Ch. 3 L5184–5188 |
| 3 | Base Class | Starting Equipment | Weapons, armor, tools package OR 1300 LMD | Equipment choice | Starting inventory items or currency | Mutually exclusive with 1300 LMD cash option | Ch. 3 L5190–5200 |
| 4 | Fighting Style | Brawler (Melee) | Bonus Action Unarmed Strike on each turn | Bonus Action | Unarmed Strike attack roll | Requires Melee specialisation | Ch. 3 L5251 |
| 5 | Fighting Style | Deadly Fighter (Melee/Ranged) | First attack roll/turn with Deadly weapon has +1 Crit range | Attack roll, Deadly weapon | +1 Crit range threshold | Once per turn only; duplicate rejected across lists | Ch. 3 L5254, L5288 |
| 6 | Fighting Style | Defensive (Melee) | Reaction when hit while melee weapon/shield equipped: +1d4 AC | Reaction, incoming hit | +1d4 AC for triggering attack | Requires equipped melee weapon or shield | Ch. 3 L5257 |
| 7 | Fighting Style | Duelling (Melee) | +1 Attack and Damage vs first creature attacked each turn | First attack/turn, melee | +1 to hit, +1 damage | Only first creature attacked per turn | Ch. 3 L5260 |
| 8 | Fighting Style | Great Weapon Fighting (Melee) | +2 Damage when wielding Two-Handed or Versatile melee weapon in two hands | Two-handed melee damage | +2 damage | Weapon must have Two-Handed or Versatile | Ch. 3 L5263 |
| 9 | Fighting Style | Lightly Armed (Melee) | +2 Attack rolls when wielding melee weapon in one hand, no other weapon/shield | One-handed melee attack | +2 to hit | Must have no other weapon or shield equipped | Ch. 3 L5266 |
| 10 | Fighting Style | Spearwall (Melee) | Melee attack when not your turn deals +1 damage die | Off-turn melee attack | +1 damage die | Triggers only outside actor's turn | Ch. 3 L5269 |
| 11 | Fighting Style | Two-Weapon Fighting (Melee/Ranged) | Add ability mod to offhand attack damage; draw/stow 2 weapons | Offhand attack roll | Ability mod added to damage | Duplicate rejected across lists | Ch. 3 L5272, L5297 |
| 12 | Fighting Style | Braced for Action (Ranged) | 1/turn reroll one damage die for weapon with Brace keyword | Brace damage roll | Rerolled damage die | Once per turn only | Ch. 3 L5279 |
| 13 | Fighting Style | Close and Personal (Ranged) | No Disadvantage on ranged attacks when hostile creature within 5 ft | Ranged attack within 5 ft | Removes Disadvantage | Hostile must be within 5 ft | Ch. 3 L5282 |
| 14 | Fighting Style | Cone of Fire (Ranged) | Spread quality additional damage applies even if attack misses | Spread attack miss | Spread damage dealt | Requires Spread weapon quality | Ch. 3 L5285 |
| 15 | Fighting Style | Ranger (Ranged) | +2 Attack rolls with Ranged or Thrown weapons | Ranged/Thrown attack | +2 to hit | Applies only to ranged/thrown weapons | Ch. 3 L5291 |
| 16 | Fighting Style | Smooth Operator (Ranged) | Rapid Fire bonus action attack adds ability mod to damage | Rapid Fire BA attack | Ability mod added to damage | Requires Rapid Fire property | Ch. 3 L5294 |
| 17 | Core Feature | Show Your Style: Prowess Pool | Max Prowess = PB; +1 on SR, +1 on LR, plus subclass triggers | Rest event / trigger | Prowess resource pool updated | Clamped at 0 min, PB max | Ch. 3 L5312–5315 |
| 18 | Core Feature | Mark of a Specialist | Expend 1 Prowess to reroll failed proficient skill check; refund on 2nd fail | Failed check, 1 Prowess | Reroll d20; refund receipt on 2nd failure | No further rerolls allowed on that check | Ch. 3 L5319 |
| 19 | Core Feature | Weapon Adept (Melee) | Attack Action grants +1 melee attack; reroll 1s and 2s on melee damage dice | Attack Action / damage roll | Extra attack / rerolled damage dice | Must use new results; melee only | Ch. 3 L5324 |
| 20 | Core Feature | Weapon Adept (Ranged) | Attack Action grants +1 ranged attack; reroll 1s on ranged attack rolls | Attack Action / attack roll | Extra attack / rerolled attack roll | Must use new result; ranged only | Ch. 3 L5326 |
| 21 | Core Feature | Weapon Expertise (Melee) | +1 Crit range on melee attacks; BA 1 Prowess for +1 damage die | Bonus Action, 1 Prowess | +1 Crit range passive; +1 damage die on hit | Requires Melee specialisation | Ch. 3 L5339 |
| 22 | Core Feature | Weapon Expertise (Ranged) | Triple Advantage on ranged attacks; BA 1 Prowess for Advantage on next attack | Bonus Action, 1 Prowess | Triple d20 roll on advantage; Advantage flag | Requires Ranged specialisation | Ch. 3 L5341 |
| 23 | Core Feature | Falling Upwards: It's All Skill | Reaction before rolling save: expend 3 Prowess to auto-succeed at min roll | Reaction, 3 Prowess | Saving throw auto-success | Must be declared before rolling save | Ch. 3 L5349 |
| 24 | Core Feature | Weapon Mastery (Melee) | 1/turn on melee hit: deal +floor(SpecialistLevel / 2) weapon damage | Melee hit (1/turn) | Additional weapon damage | Once per turn limit | Ch. 3 L5354 |
| 25 | Core Feature | Weapon Mastery (Ranged) | 1/turn on ranged attack roll: double PB for that roll | Ranged attack roll (1/turn) | +PB added to attack roll | Once per turn limit | Ch. 3 L5356 |
| 26 | Talent | Basic Talents (15) | Alacrity, Alert, Beneath Me, Bird Hunter, Critical Edge, Giant Killer, Hunter (X), Iron Guard, Lasting Sting, Lucky, Parry, Savage Attacker, Tough, Unarmoured Agility, Will of the Rat | Talent choice (Lv 3, module Lv 8) | Passive / active talent benefits | Module unlocks enhanced effect | Ch. 3 L5446–5465 |
| 27 | Talent | Advanced Talents (18) | Alpha Strike, Ambush, Crownslayer, Curtain Call, Danger Sense, Hidden Technique, Jumpstart, Kingslayer, Lone Journey, One Moment, One With Shadow, Opportunist, Reliable Talent, Revenger, Running on Fumes, Tactical Mind, True Fang, Unbalancer | Talent choice (Lv 9, module Lv 13) | Passive / active talent benefits | Module unlocks enhanced effect | Ch. 3 L5471–5492 |
| 28 | Talent | Hidden Technique | Grants Grit pool (2 base, +1 module) and 3 Basic Brawler Techniques (5 with module) | Short/Long Rest | Grit pool, Brawler technique abilities | Uses Grit instead of Aggression | Ch. 3 L5479, L2478–2514 |
| 29 | Talent | Jumpstart | Increases Start SP of Operator Skills by 5 (10 with Module) | Operator Skill activation | Boosted initial SP | Cannot exceed SP cost cap | Ch. 3 L5480 |
| 30 | Talent (Cross-class) | Part-Time Inventor | Grants Equipment Modification of Inventor Specialist (max 1, no Dangerous; max 2 on module) | Rest activity | Item modification | Absent from Specialist table (subclass is native) | Ch. 3 L1184, L2171, L3859, L6849, L8205 |
| 31 | Executor | Path Selection | Choice of Hunter or Bodyguard at Level 1 | Subclass choice | Subclass path flags | Irrevocable path commitment | Ch. 3 L5504 |
| 32 | Executor | Deathmark State Tracking | Tracks holder (self vs target); +3 SP at turn start and BA Hide while held | Combat turn start | SP gain, BA Hide enabled | Mutually exclusive (self OR creature) | Ch. 3 L5506–5510 |
| 33 | Executor | Deathmark Transfer | Transferred to hostile creature on attack (`onAttackRoll` default, `onHitOnly` optional) | Attack action / roll | Mark transferred to target token | Requires hostile target | Ch. 3 L5506 |
| 34 | Executor | Deathmark Return | Returns on target 0 HP or end of turn without attacking/damaging marked target | Turn end / target 0 HP | Mark returns to self, +3 SP, Reaction Disengage | Must attack/damage marked target to retain | Ch. 3 L5508 |
| 35 | Executor | Deathmark Damage Scaling | +1d4 (Lv 1) -> +2d4 (Lv 7) -> +3d4 (Lv 14) damage on attack hit vs marked creature | Attack hit on marked target | Additional damage | Applies only to marked target | Ch. 3 L5512 |
| 36 | Executor | Hunter Deathmark Perk | +1 Critical Range against marked creature | Attack roll vs marked target | Expanded crit range | Hunter path only | Ch. 3 L5514 |
| 37 | Executor | Bodyguard Attack Redirection | Redirect attack from ally within 10 ft to self if in reach/range | Incoming attack on ally | Attack retargeted to Specialist | No action required; Bodyguard path only | Ch. 3 L5515 |
| 38 | Executor | In Every Shadow (Lv 5) | Climb/Swim speed = Walking speed; Stealth proficiency/expertise | Level 5 progression | Speeds updated; Stealth proficiency/expertise | If already proficient, gains Expertise | Ch. 3 L5517–5523 |
| 39 | Executor | Sweeper (Hunter Lv 5) | 1 Prowess Action while Hidden/Invisible: +5 ft reach, melee attack each creature, apply Mark, return Mark | Action, 1 Prowess | Melee attack per creature, Mark cycle | Requires Hidden or Invisible | Ch. 3 L5532 |
| 40 | Executor | Smokescreen (Bodyguard Lv 5) | 1 Prowess Reaction: 10 ft radius magical darkness at feet until next turn end; ally reaction move | Reaction, 1 Prowess | Darkness template; ally movement | Bodyguard path only | Ch. 3 L5534 |
| 41 | Executor | Executor Prowess Triggers | +1 on marked target 0 HP (1/turn); Hunter: >=30 dmg hit; Bodyguard: ally attacked within 10 ft taking 0 dmg | Combat event | +1 Prowess | 1/turn limit on marked target death | Ch. 3 L5536–5541 |
| 42 | Executor | Preysense (Hunter Lv 11) | Crit deals +1 damage die; crit on living creature inflicts Bleeding | Critical hit | Extra damage die, Bleeding condition | Hunter path only | Ch. 3 L5552 |
| 43 | Executor | Dangersense (Bodyguard Lv 11) | Reaction when ally within 5 ft saves vs AoE: move half speed together; 0 dmg on pass, half on fail | Reaction, AoE save | Movement, upgraded damage mitigation | Bodyguard path only | Ch. 3 L5554 |
| 44 | Executor | In for the Kill (Hunter Lv 15) | Transferring Mark makes target Vulnerable to Specialist attacks until turn end | Mark transfer | Vulnerability flag on target | Hunter path only; lasts until turn end | Ch. 3 L5559 |
| 45 | Executor | Blade Shield (Bodyguard Lv 15) | Reaction when marked creature attacks within reach: hit with weapon reduces attack roll by PB | Reaction, incoming attack | Attack roll penalty equal to PB | Bodyguard path only | Ch. 3 L5561 |
| 46 | Executor | Mortal Blow (Hunter Lv 20) | 1/LR Action: teleport within 5 ft, DEX save vs Martial DC, 10d8 HP loss (doubled if Bleeding) | Action, 1/LR, target seen | 10d8 / 20d8 direct HP loss | Direct HP loss bypasses DR and Resistance | Ch. 3 L5568 |
| 47 | Executor | Ultimate Sword and Shield (Bodyguard Lv 20) | Resistance to marked target damage; Blade Shield reaction-free; Reaction transfer Mark when ally attacked within 10 ft | Incoming attacks / triggers | Damage resistance; free reaction; mark transfer | Bodyguard path only | Ch. 3 L5570 |
| 48 | Hookmaster | Hooked Weapon Conversion | Convert non-2H Slashing/Piercing weapon to Hook (Free at Lv 1, or 200 LMD + 1 hr) | Melee weapon, 200 LMD | Converted Hook weapon item | Slashing/Piercing only; non-Two-Handed | Ch. 3 L5588–5598 |
| 49 | Hookmaster | Hooked Properties | Two-Handed, Thrown (30/- returning), STR for ranged attack/damage, 10 ft pull on hit vs size <= +1 | Attack roll with Hook | Ranged attack, pull effect | Restricted proficiency (Hookmasters only) | Ch. 3 L5592–5596 |
| 50 | Hookmaster | Hook BA Ranged Attack | Bonus Action Ranged Attack with Hook (lockout: no other ranged Hook attacks that turn) | Bonus Action | Ranged Hook attack roll | Locked out if any other ranged Hook attack made | Ch. 3 L5597 |
| 51 | Hookmaster | Big Boot (Lv 5) | On Unarmed Strike hit vs creature <= size + 1: push 10 ft directly away | Unarmed strike hit | 10 ft push | Creature must be <= size + 1 | Ch. 3 L5619 |
| 52 | Hookmaster | King of the Urban Jungle (Lv 5) | Pre-move >= 20 ft -> Flying Speed = 2x Hook range (60 ft / 100 ft); melee strike deals +PB & doubles push | Pre-movement >= 20 ft | Flying speed; +PB damage & double forced move | Cannot attack with Hook while flying | Ch. 3 L5621–5627 |
| 53 | Hookmaster | Bound in Rope (Lv 5) | 1 Prowess Action: DEX save vs Martial DC or Grappled; BA 15 ft drag; Action hogtie; Hook locked | Action, 1 Prowess | Grappled condition, drag, hogtie | Locks Hook from attacks/features | Ch. 3 L5638–5640 |
| 54 | Hookmaster | Wrangler (Lv 5) | 1 Prowess Action vs size > +1: DEX save or latch/share space; Advantage; -5 attack to ignore DR | Action, 1 Prowess | Latch state, shared space, Advantage, DR bypass | Target must be > size + 1 | Ch. 3 L5642–5646 |
| 55 | Hookmaster | Hookmaster Prowess Triggers | +1 on causing environmental/falling/fire damage; +1 on moving > 45 ft flying in a turn | Combat event / turn end | +1 Prowess | Triggers on environment damage or >45 ft flight | Ch. 3 L5648 |
| 56 | Hookmaster | Mighty Push (Lv 11) | PB/LR Action: 5 ft, STR save vs Martial DC, 8d6 Bludgeoning + 20 ft knockback; collision falling dmg | Action, 5 ft, PB/LR | 8d6 roll, knockback, collision damage | Collision deals distance falling damage | Ch. 3 L5653–5657 |
| 57 | Hookmaster | Spider's Essence (Lv 15) | Thrown range becomes 50/-; Spider's Thread 50 ft climb speed; Swing to Safety reaction falling | Action / Reaction | 50/- range, climbing aura, falling reaction | Swing to Safety requires fall height for dmg | Ch. 3 L5658–5666 |
| 58 | Hookmaster | Scorpion Sting (Lv 20) | 1/LR Action: DEX save (auto-fail if grappled/hooked), pull to 5 ft, 6 advantaged attacks dealing +half level dmg | Action, 1/LR | Pull, 6 advantaged attacks with +10 dmg | Ignores hook usage restrictions on grappled | Ch. 3 L5667–5674 |
| 59 | Infuser | Infuser DC Formula | `20 - INT - PB` (formulation purity; lower DC makes saves easier for willing allies) | Actor INT mod, PB | Target DC number | Preserved per DECISIONS.md L465 | Ch. 3 L5688–5690 |
| 60 | Infuser | Principle of Double Effect | Pharmacology Kit proficiency; Infusions pool `2*PB/LR`; 5 ft range (30 ft Lv 11); 1 min duration | Bonus Action, 1 Infusion | Active infusion state | Max 1 infusion/creature; no Construct/Undead | Ch. 3 L5692–5700 |
| 61 | Infuser | Leverage Workflow | Recipient CON save vs Infuser DC: pass = clean benefit; fail = benefit + Dazed & Leverage lockout | Recipient trigger | CON save roll, benefit applied, Dazed on fail | Dazed prevents leveraging while active | Ch. 3 L5699 |
| 62 | Infuser | Alchemical Infusions (8) | Adrenaline Trigger, Flight Reflex, Focus Heightener, Hesitation Suppressor, Muscle Strengthener, Procoagulant, Respiration, Sensation Nulling | Leverage condition | Respective mechanical benefit | Each tied to specific trigger | Ch. 3 L5782–5823 |
| 63 | Infuser | New Concoctions (Lv 5) | Neurological Inhibitor (DC 15 CON or Berserk) & Bungarotoxin (DC 15 CON or 2d10 Poison + Paralyzed) | Pharmacology Kit activity | Weapon/food poison items | Weight 1 lb, Cost 140 LMD | Ch. 3 L5705–5726 |
| 64 | Infuser | Double-Blind Trial (Lv 5) | BA, 1 Prowess + 1 Infusion: roll 1d6 applying random Toxin (1–6) to weapon | Bonus Action, 1 Prowess, 1 Infusion | 1d6 roll, toxin applied to weapon | Weapon must not already have a toxin | Ch. 3 L5732–5743 |
| 65 | Infuser | Infuser Prowess Triggers | +1 when Poisoned/Toxined target drops to 0 HP; +1 when Infusion turns failure to success (1/round) | Target 0 HP / d20 success | +1 Prowess | Max 1/round on failure-to-success conversion | Ch. 3 L5745 |
| 66 | Infuser | Stimpack (Lv 11) | Infusion range becomes 30 ft; Questionable Rejuvenation grants 1d10 THP on apply and save pass | Infusion apply / save pass | 1d10 THP roll button | Additive with Procoagulant THP | Ch. 3 L5747–5754 |
| 67 | Infuser | Excessive Dosing (Lv 15) | Succumb: Toxin DC + PB; Toxic Shock: failed save inflicts Poisoned for condition duration | Toxin save event | Increased DC (+PB); Poisoned rider | Applies to all toxins created by Infuser | Ch. 3 L5758–5764 |
| 68 | Infuser | To Defy Science (Lv 20) | 1/LR Action: target within 30 ft cannot lose Hit Points for 1 minute (Invulnerability effect) | Action, 1/LR, target within 30 ft | Complete HP loss immunity for 1 min | 1/Long Rest limit | Ch. 3 L5765–5770 |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Weapon Specialisation | Selecting `Deadly Fighter` or `Two-Weapon Fighting` when already chosen | Reject duplicate selection: source L5249/L5277 explicitly forbids taking any style option more than once. |
| 2 | Mark of a Specialist | Prowess pool empty (0 Prowess) | Warn on shortfall; if forced with "Use anyway", clamp pool at 0 and broadcast shortfall notice on chat card. |
| 3 | Mark of a Specialist | Second roll also fails | 1 Prowess is refunded to the actor; check cannot be rerolled again. |
| 4 | Weapon Adept (Melee) | Rolling 1s or 2s on damage dice | Reroll all 1s and 2s; must take the new results even if 1 or 2 is rolled again. |
| 5 | Weapon Adept (Ranged) | Rolling a 1 on attack roll | Reroll the 1 on the attack roll; must use the new result. |
| 6 | It's All Skill | Reaction declared after rolling Saving Throw | Invalid / rejected: feature text states "you must do so before you roll the Saving Throw". |
| 7 | It's All Skill | Prowess pool < 3 | Warn on shortfall; if overridden, clamp at 0 and broadcast override on card. |
| 8 | Weapon Mastery (Melee) | Hitting with multiple melee attacks in a turn | Triggers only once per turn: deals +floor(SpecialistLevel / 2) weapon damage on chosen hit. |
| 9 | Weapon Mastery (Ranged) | Making multiple ranged attack rolls in a turn | Triggers only once per turn: doubles PB (+PB additional) for that single attack roll. |
| 10 | Deathmark Transfer | Making an attack roll that misses (`onAttackRoll` vs `onHitOnly`) | Source L5506 states "by making an Attack against them". Under `onAttackRoll`, mark transfers on attack declaration. Under `onHitOnly`, mark transfers only on hit. Engine supports `onAttackRoll` default with toggle. |
| 11 | Deathmark Return | Specialist does not attack or damage marked creature on turn | At end of Specialist's turn, Mark returns to Specialist; Specialist gains +3 SP and Reaction Disengage. |
| 12 | Deathmark Return | Marked creature drops to 0 HP | Mark returns to Specialist immediately; Specialist gains +3 SP and Reaction Disengage, plus +1 Prowess. |
| 13 | Sweeper | Sweeper action resolves | At end of Sweeper action, Deathmark returns to Specialist, regardless of who was hit. |
| 14 | Mortal Blow | Target has Bleeding condition | Roll 10d8: failed save loses 20d8 HP equivalent; successful save loses 10d8 HP equivalent (direct HP loss, bypassing DR/Resist). |
| 15 | Hook Conversion | Attempting to convert a Greatsword or Greataxe (Two-Handed) | Rejected: source L5589 requires weapon must NOT have Two-Handed property before conversion. |
| 16 | Hook Conversion | Attempting to convert a Warhammer or Club (Bludgeoning) | Rejected: source L5589 requires weapon must deal Slashing or Piercing damage. |
| 17 | Hook BA Attack | Specialist made an Attack Action ranged Hook attack earlier in turn | Bonus Action Hook attack rejected/warned: source L5597 forbids making BA attack if any ranged Hook attacks were made on that turn. |
| 18 | King of Urban Jungle | Specialist moved only 15 ft prior to activation | Rejected/warned: source L5621 requires moving at least 20 ft immediately beforehand. |
| 19 | King of Urban Jungle | Attempting to attack with Hook while flying | Forbidden: source L5622 states "You cannot attack with your Hook" while this flying effect is active. |
| 20 | Bound in Rope | Target size is 2 sizes larger (e.g. Medium Specialist vs Huge Giant) | Bound in Rope rejected (requires size <= +1); must use `Wrangler` instead. |
| 21 | Bound in Rope | Hookmaster attempts to attack with Hook while target is Grappled | Forbidden: source L5640 states "While you have a Creature Grappled in this way, you cannot use that Hook to make Attacks, or to use your Features." |
| 22 | Wrangler | Target size is equal or smaller (e.g. Medium Specialist vs Medium foe) | Wrangler rejected (requires target > size + 1); must use `Bound in Rope` instead. |
| 23 | Scorpion Sting | Target is already Grappled or Hooked by Specialist | Target automatically fails the Dexterity Saving Throw against Scorpion Sting; Hook usage restrictions are ignored. |
| 24 | Infuser DC | High INT (+4) and high PB (+4) Infuser | Infuser DC = 20 - 4 - 4 = 12 (easier for allies to pass CON save to avoid Dazed condition). |
| 25 | Principle of Double Effect | Attempting to apply Infusion to Construct or Undead | Blocked / warned: source L5697 explicitly excludes Constructs and Undead. |
| 26 | Principle of Double Effect | Applying second Infusion to creature with active Infusion | Allowed, but previous Infusion is immediately removed (max 1 active Infusion per creature). |
| 27 | Leverage Workflow | Creature fails CON save against Infuser DC | Creature still gains the Infusion benefit, but gains Dazed condition until start of next turn and cannot Leverage any Infusions while Dazed. |
| 28 | Double-Blind Trial | Weapon already has an active Toxin applied | Rejected/warned: source L5733 requires wielding a weapon that does not have a Toxin applied. |
| 29 | Stimpack THP | Applied on Procoagulant Infusion | Questionable Rejuvenation 1d10 THP is added directly to Procoagulant Hit Die + CON THP. |
| 30 | To Defy Science | Target takes damage from any source while active | Target cannot lose Hit Points for 1 minute; damage taken is prevented/mitigated. |
