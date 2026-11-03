# Specification Mining Handoff: Four Base Character Classes (Vanguard, Supporter, Specialist, Medic)

## 1. Observation

### 1.1 Authoritative Sources Inspected
- **Rules Authority**: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`
  - Vanguard: Lines 7904–8085
  - Supporter: Lines 6548–6692
  - Specialist: Lines 5161–5493
  - Medic: Lines 4560–4871
- **Cross-Chapter Rules**:
  - `AK5e_1.3.1_Foundry_Source/01_chapter_1_changing_the_game.txt`: Lines 137–141 (No Healing for Constructs), Lines 186–196 (Arts Points & Casting Rules), Lines 211–214 (Martial DC Calculation: `8 + PB + STR or DEX mod`).
  - `AK5e_1.3.1_Foundry_Source/05_chapter_5_arts.txt`: Lines 415–436 (Healing Arts Special Arts Pool).
- **Project Guidelines & Decisions**:
  - `WORKFLOW.md`: §1–3 (Module conventions), §3.2 (Table-play philosophy: confirm before use, warn don't block, no auto-rolled dice, GM relay for unowned targets, encounter-window undo).
  - `ak5e/DECISIONS.md`: L466 (Revivify ruling status), L473 (Medical skill alias), L485 (AP discounts), L1120–1155 (Tip of the Spear additive THP and targets).
  - `ak5e/scripts/chapter-three-content.mjs`: Content entries for `class-vanguard` (L30915), `class-supporter` (L26262), `class-specialist` (L21246), and `class-medic` (L17818).

---

### 1.2 Vanguard Class Specification (Ch. 3 L7904–8085)

#### Chassis (L7917–7939)
- **Hit Dice**: 1d8 per Vanguard Level (L7918).
- **Hit Points at 1st Level**: 8 + Constitution Modifier (L7919).
- **Hit Points at Higher Levels**: 1d8 (or 5) + Constitution Modifier per Vanguard Level after 1st (L7920).
- **Primary Ability**: Dexterity (with Strength or Charisma as secondary based on branch).
- **Armor Proficiencies**: Light Armour, Light Shields (L7923).
- **Weapon Proficiencies**: Light Melee (L7924).
- **Tool Proficiencies**: Messenger Kit (L7925).
- **Saving Throw Proficiencies**: Dexterity + one of choice from: Strength, Charisma (L7926).
- **Skill Choices**: Choose three from: Acrobatics, Athletics, Perception, Persuasion, Stealth, Wilderness (L7927).
- **Starting Equipment (L7929–7939)**:
  - 1x Light Melee Weapon
  - **A)** 1x Light Melee Weapon OR **B)** 1x Light Shield
  - **A)** Reinforced Outfit OR **B)** Light Combat Gear
  - 1x Tool Kit that you are Proficient with
  - *OR starting wealth*: 1300 LMD

#### Level 1–20 Progression Table (L7949–7973)
| Level | PB | Features Gained |
|:-----:|:--:|:----------------|
| 1st   | +2 | Elite 0- Vanguard Branch, Landstrider, Tip of the Spear |
| 2nd   | +2 | Basic Skill |
| 3rd   | +2 | Basic Talent, Quick off the Mark |
| 4th   | +2 | Ability Score Improvement, Branch Feature |
| 5th   | +3 | Extra Attack |
| 6th   | +3 | Ability Score Improvement |
| 7th   | +3 | Elite 1- Advanced Skill |
| 8th   | +3 | Ability Score Improvement, Basic Talent Module |
| 9th   | +4 | Advanced Talent |
| 10th  | +4 | Ability Score Improvement, Branch Feature |
| 11th  | +4 | Uncanny Dodge |
| 12th  | +4 | Ability Score Improvement |
| 13th  | +5 | Advanced Talent Module, Branch Feature |
| 14th  | +5 | Elite 2- Elite Skill |
| 15th  | +5 | Directed Engagement |
| 16th  | +5 | Ability Score Improvement |
| 17th  | +6 | Branch Feature |
| 18th  | +6 | Lightspeed |
| 19th  | +6 | Ability Score Improvement |
| 20th  | +6 | Approaching Storm |

#### Feature Definitions & Mechanics
- **1st Level: Vanguard Branch (L7979–7985)**: Choose one branch from Agent, Charger, Pioneer, Standard Bearer, Tactician. Grants branch features at levels 1, 4, 10, 13, and 17.
- **1st Level: Landstrider (L7987–7993)**:
  - *Speed Increase*: Walking Speed increased by 10 feet (passive).
  - *Nimble*: When you hit a Creature with an Attack, you do not provoke Opportunity Attacks from that Creature for the rest of the Turn (passive trigger on hit).
- **1st Level: Tip of the Spear (L7994–8008)**:
  - *Trigger/Conditions*: Provided by Vanguard Branches, Skills, and Talents.
  - *Target/Range*: Choose an allied Creature you can see within 60 feet.
  - *Duration*: Until start of Vanguard's next Turn. Effects are cumulative.
  - *Action*: No action required (granted as a rider by triggering feature/branch), unless Directed Engagement is used.
  - *Mechanic*: Roll 1d6 (or choose if Directed Engagement is active) and apply the effect:
    - `1`: Additional Damage equal to Proficiency Bonus on one Damage Roll of their choice.
    - `2`: Gain 1d6 Temporary Hit Points; **additive** with any existing Temporary Hit Points.
    - `3`: Speed increased by 10 feet.
    - `4`: +2 Bonus to Attack Rolls.
    - `5`: Critical Range increased by 1.
    - `6`: Whenever they gain a Skill Point, they gain 1 more.
- **3rd Level: Quick off the Mark (L8016–8018)**:
  - *Trigger*: Whenever you roll Initiative.
  - *Action*: Passive roll modifier.
  - *Mechanic*: Add Proficiency Bonus to Initiative roll result.
- **5th Level: Extra Attack (L8031–8033)**:
  - *Action*: Attack Action.
  - *Mechanic*: Make two attacks instead of one.
- **11th Level: Uncanny Dodge (L8040–8042)**:
  - *Trigger*: When a Creature you can see hits you with an Attack.
  - *Action*: Reaction.
  - *Mechanic*: Halve that Attack's Damage against you, rounding down.
- **15th Level: Directed Engagement (L8046–8048)**:
  - *Trigger*: When you would use your Tip of the Spear Feature.
  - *Action*: Reaction.
  - *Mechanic*: Choose what effects are applied with Tip of the Spear, rather than rolling, until the end of that Turn.
- **18th Level: Lightspeed (L8049–8053)**:
  - *Trigger*: First Round of combat.
  - *Action*: Passive turn structure modifier.
  - *Mechanic*: Take two Turns during the first Round of combat; second Turn is taken at Initiative Score - 10.
- **20th Level: Approaching Storm (L8054–8058)**:
  - *Trigger*: First Round of combat, when rolling to determine Damage dealt.
  - *Action*: Passive damage modifier.
  - *Mechanic*: Add half of Vanguard Level (`floor(@classes.vanguard.levels / 2)` = +10 at Level 20) to the damage result rolled.

---

### 1.3 Supporter Class Specification (Ch. 3 L6548–6692)

#### Chassis (L6594–6616)
- **Hit Dice**: 1d6 per Supporter Level (L6595).
- **Hit Points at 1st Level**: 6 + Constitution Modifier (L6596).
- **Hit Points at Higher Levels**: 1d6 (or 4) + Constitution Modifier per Supporter Level after 1st (L6597).
- **Primary Ability**: Intelligence, Wisdom, or Charisma (selected at 1st Level upon gaining Provide Aid: L6637).
- **Armor Proficiencies**: Light Armour, Light Shields (L6600).
- **Weapon Proficiencies**: Light Melee (L6601).
- **Tool Proficiencies**: A Tool Kit / Vehicle Proficiency of choice (L6602).
- **Saving Throw Proficiencies**: Choose two from: Constitution, Charisma, Wisdom (L6603).
- **Skill Choices**: Choose three from: Arts, Lore, Tech, Insight, Deception, Persuasion (L6604).
- **Starting Equipment (L6606–6616)**:
  - **A)** 1x Light Melee Weapon
  - **A)** 1x Light Melee Weapon OR **B)** 1x Light Shield
  - Protective Clothing
  - Two Tool Kits you are Proficient with
  - *OR starting wealth*: 1300 LMD

#### Level 1–20 Progression Table (L6555–6579)
| Level | PB | Features Gained | Aid Die Size |
|:-----:|:--:|:----------------|:------------:|
| 1st   | +2 | Elite 0- Supporter Branch, Provide Aid | d8 |
| 2nd   | +2 | Basic Skill | d8 |
| 3rd   | +2 | Basic Talent | d8 |
| 4th   | +2 | Ability Score Improvement, Branch Feature | d8 |
| 5th   | +3 | Advanced Aid | d8 |
| 6th   | +3 | Ability Score Improvement | d8 |
| 7th   | +3 | Elite 1- Advanced Skill | d10 |
| 8th   | +3 | Ability Score Improvement, Basic Talent Module | d10 |
| 9th   | +4 | Advanced Talent | d10 |
| 10th  | +4 | Ability Score Improvement, Branch Feature | d10 |
| 11th  | +4 | Lighten the Load | d10 |
| 12th  | +4 | Ability Score Improvement | d10 |
| 13th  | +5 | Branch Feature, Advanced Talent Module | d10 |
| 14th  | +5 | Elite 2- Elite Skill | d12 |
| 15th  | +5 | Ever Reliable | d12 |
| 16th  | +5 | Ability Score Improvement | d12 |
| 17th  | +6 | Branch Feature | d12 |
| 18th  | +6 | Self-Supportive | d12 |
| 19th  | +6 | Ability Score Improvement | d12 |
| 20th  | +6 | Will Into Being | d12 |

#### Feature Definitions & Mechanics
- **1st Level: Supporter Branch (L6622–6629)**: Choose Artificer, Bard, Hexer, Ritualist, or Summoner. Branch features at levels 1, 4, 10, 13, and 17.
- **1st Level: Provide Aid (L6630–6640)**:
  - *Action Economy*: Bonus Action.
  - *Target/Range*: Another Creature within 60 feet who can see or hear you.
  - *Cost*: Consumes 1 Aid Die (`aidDie`).
  - *Constraint*: A Creature can only have one Aid Die at a time.
  - *Duration*: 10 minutes.
  - *Usage*: Once within next 10 minutes, when the creature makes an Attack Roll, Skill Check, Saving Throw (except Death Saving Throws), Damage Roll, or Healing Roll, they expend and roll the Aid Die, adding it to the total.
  - *Resource Pool*: Maximum uses equal chosen ability modifier (Intelligence, Wisdom, or Charisma Modifier, min 1). Refills on Long Rest.
  - *Die Size*: d8 (Levels 1–6), d10 (Levels 7–13), d12 (Levels 14–20).
- **5th Level: Advanced Aid (L6652–6663)**:
  - *Trigger*: When a Creature expends an Aid Die.
  - *Action Economy*: Passive rider upon die roll.
  - *Mechanic*: Additional effect based on roll type:
    - *Attack Roll*: Critical Range increased by 1.
    - *Skill Check*: Roll Aid Die an additional time and choose which result to use.
    - *Saving Throw*: Gain Temporary Hit Points equal to Aid Die roll + Supporter's Proficiency Bonus.
    - *Damage Roll*: Choose a different Creature within 10 feet of a damaged creature; that additional Creature takes Force Damage equal to the Aid Die roll.
    - *Healing Roll*: Creatures recovering Hit Points from this roll also gain Temporary Hit Points equal to the Aid Die roll.
- **11th Level: Lighten the Load (L6673–6675)**:
  - *Trigger*: When a Creature other than yourself within 60 feet rolls one of your Aid Dice.
  - *Action Economy*: Reaction.
  - *Target/Range*: A different Creature that can hear you, except yourself, within 60 feet.
  - *Effect*: Grant them one of your Aid Dice without expending any of your Aid Dice pool.
  - *Constraint*: Cannot use Lighten the Load on these supplementary Aid Dice (no chaining).
- **15th Level: Ever Reliable (L6679–6685)**:
  - *Aid Die Regeneration*: If your Turn begins and you have no Aid Dice remaining (0), regain 1 Aid Die.
  - *Short Rest Refill*: Recover Aid Dice equal to half maximum Aid Dice, rounding up (`ceil(max / 2)`).
- **18th Level: Self-Supportive (L6686–6688)**:
  - *Trigger*: Beginning of your Turn.
  - *Action Economy*: Passive turn start.
  - *Mechanic*: Gain a special Aid Die granted automatically to yourself. Cannot be granted to another creature or used by other features. May be expended as if you were the target of your own Provide Aid.
- **20th Level: Will Into Being (L6689–6693)**:
  - *Trigger*: When a Creature rolls one of your Aid Dice.
  - *Action Economy*: Passive roll modifier.
  - *Mechanic*: Add Supporter's Proficiency Bonus to the Aid Die roll result.

---

### 1.4 Specialist Class Specification (Ch. 3 L5161–5493)

#### Chassis (L5178–5201)
- **Hit Dice**: 1d8 per Specialist Level (L5179).
- **Hit Points at 1st Level**: 8 + Constitution Modifier (L5180).
- **Hit Points at Higher Levels**: 1d8 (or 5) + Constitution Modifier per Specialist Level after 1st (L5181).
- **Primary Ability**: Dexterity (with secondary Strength, Wisdom, or Charisma depending on style/branch).
- **Armor Proficiencies**: Light Armour, Medium Armour, Light Shields (L5184).
- **Weapon Proficiencies**: Light Melee, Light Ranged (L5185).
- **Tool Proficiencies**: Two Tool Kits of choice (L5186).
- **Saving Throw Proficiencies**: Dexterity + one of choice from: Wisdom, Charisma (L5187).
- **Skill Choices**: Choose three from: Acrobatics, Sleight of Hand, Stealth, Tech, Perception, Wilderness (L5188).
- **Starting Equipment (L5190–5201)**:
  - **A)** 1x Light Melee Weapon OR **B)** 1x Light Ranged Weapon
  - **A)** 1x Light Melee Weapon OR **B)** 1x Light Shield
  - **A)** Reinforced Outfit OR **B)** Underarmour
  - 1x Tool Kit you are Proficient with
  - *OR starting wealth*: 1300 LMD

#### Level 1–20 Progression Table (L5202–5226)
| Level | PB | Features Gained |
|:-----:|:--:|:----------------|
| 1st   | +2 | Specialist Branch, Weapon Specialisation |
| 2nd   | +2 | Basic Operator Skill |
| 3rd   | +2 | Basic Talent |
| 4th   | +2 | Ability Score Improvement, Show Your Style |
| 5th   | +3 | Branch Feature |
| 6th   | +3 | Ability Score Improvement, Weapon Adept |
| 7th   | +3 | Elite 1- Advanced Operator Skill |
| 8th   | +3 | Ability Score Improvement, Basic Talent Module |
| 9th   | +4 | Advanced Talent |
| 10th  | +4 | Ability Score Improvement |
| 11th  | +4 | Branch Feature |
| 12th  | +4 | Ability Score Improvement, Weapon Expertise |
| 13th  | +5 | Advanced Talent Module |
| 14th  | +5 | Elite 2- Elite Operator Skill |
| 15th  | +5 | Branch Feature |
| 16th  | +5 | Ability Score Improvement |
| 17th  | +6 | Falling Upwards |
| 18th  | +6 | Weapon Mastery |
| 19th  | +6 | Ability Score Improvement |
| 20th  | +6 | Branch Feature |

#### Feature Definitions & Mechanics
- **1st Level: Specialist Branch (L5228–5237)**: Choose Executor, Hookmaster, Infusion, Inventor, Skyranger, Dollkeeper, or Trapmaster. Branch features at levels 1, 5, 11, 15, and 20.
- **1st Level: Weapon Specialisation (L5244–5299)**:
  - Choose either **Melee Combat** or **Ranged Combat**, then select one Fighting Style:
  - *Melee Combat Options (L5249–5274)*:
    - `Brawler`: Bonus Action Unarmed Strike on each turn.
    - `Deadly Fighter`: First time each Turn making an Attack Roll with a Deadly weapon, Critical Range +1.
    - `Defensive`: Reaction when hit while Melee Weapon or Shield equipped, increase AC by 1d4 for that attack.
    - `Duelling`: +1 bonus to Attack and Damage Rolls for Melee Attacks against the first Creature attacked each turn.
    - `Great Weapon Fighting`: +2 bonus to Damage rolls with Melee Weapons wielded two-handed (Two-Handed or Versatile).
    - `Lightly Armed`: When wielding Melee Weapon in one hand and no other weapon/shield, +2 Attack bonus.
    - `Spearwall`: When making Melee Attack when not your Turn, deal an additional die of Damage.
    - `Two-Weapon Fighting`: Add Ability Modifier to damage of additional attack(s); draw/stow two one-handed weapons.
  - *Ranged Combat Options (L5276–5299)*:
    - `Braced for Action`: Once per Turn, when making Damage Roll with Brace weapon, reroll one die.
    - `Close and Personal`: No Disadvantage on Ranged Attack Rolls when hostile creature within 5 feet.
    - `Cone of Fire`: Whenever attacking using Spread quality, deal additional damage even if attack misses.
    - `Deadly Fighter`: First time each Turn making an Attack Roll with a Deadly weapon, Critical Range +1.
    - `Ranger`: +2 bonus to Attack Rolls with Ranged or Thrown weapons.
    - `Smooth Operator`: Bonus Action attack using Rapid Fire property adds Ability Modifier to damage.
    - `Two-Weapon Fighting`: Add Ability Modifier to damage of additional attack(s); draw/stow two one-handed weapons.
- **4th Level: Show Your Style (L5312–5320)**:
  - *Resource*: Prowess (`prowess`).
  - *Maximum*: Equal to Proficiency Bonus (`@prof`).
  - *Recovery*: Gain 1 Prowess on completing Short or Long Rest (+1 per rest, does not auto-fill to max). Additional prowess gained via branch conditions.
  - *Mark of a Specialist*: When you fail a Skill Check using a proficient skill, expend 1 Prowess to reroll. If you still fail, Prowess is refunded, but you cannot reroll that check again.
- **6th Level: Weapon Adept (L5321–5327)**:
  - *Melee Combat*: Extra Attack on Attack Action (must be Melee Attack). Additionally, when rolling 1 or 2 on Melee damage dice, reroll those dice (must use new results).
  - *Ranged Combat*: Extra Attack on Attack Action (must be Ranged Attack). Additionally, when rolling 1 on a Ranged Attack roll, reroll that die (must use new result).
- **12th Level: Weapon Expertise (L5336–5342)**:
  - *Melee Combat*: Critical Range for Melee Attacks improved by 1. Bonus Action & spend 1 Prowess to add one additional damage die to a Melee Attack damage roll.
  - *Ranged Combat*: When you have Advantage on a Ranged Attack Roll, roll an additional die (3d20 keep highest). Bonus Action & spend 1 Prowess to give yourself Advantage on your next Ranged Attack Roll.
- **17th Level: Falling Upwards — It's All Skill (L5346–5350)**:
  - *Trigger*: When you would make a Saving Throw (before rolling).
  - *Action Economy*: Reaction.
  - *Cost*: Expend 3 Prowess.
  - *Mechanic*: Automatically succeed on that Saving Throw as if rolled minimum required.
- **18th Level: Weapon Mastery (L5351–5357)**:
  - *Melee Combat*: Once per Turn when you hit with a Melee Attack, deal additional Weapon Damage equal to half Specialist Level (`floor(@classes.specialist.levels / 2)` = +9 at 18th, +10 at 20th).
  - *Ranged Combat*: Once per Turn when making a Ranged Attack Roll, double Proficiency Bonus for that attack roll only (`2 * @prof` = +12 at 18–20th).

---

### 1.5 Medic Class Specification (Ch. 3 L4560–4871)

#### Chassis (L4582–4604)
- **Hit Dice**: 1d6 per Medic Level (L4583).
- **Hit Points at 1st Level**: 6 + Constitution Modifier (L4584).
- **Hit Points at Higher Levels**: 1d6 (or 4) + Constitution Modifier per Medic Level after 1st (L4585).
- **Primary Ability**: Intelligence or Wisdom (chosen at 1st Level: L4614).
- **Armor Proficiencies**: Light Shields (L4588) (*no light, medium, or heavy armor proficiency!*).
- **Weapon Proficiencies**: Light Melee (L4589).
- **Tool Proficiencies**: A Tool Kit / Vehicle Proficiency of choice (L4590).
- **Saving Throw Proficiencies**: Choose two from: Constitution, Intelligence, Wisdom (L4591).
- **Skill Choices**: Medicine (automatic) + two from: Lore, Arts, Tech, Insight, Perception, Persuasion (L4592).
- **Starting Equipment (L4594–4604)**:
  - **A)** 1x Light Melee Weapon OR **B)** 1x Light Shield
  - **A)** Arts Wand OR **B)** Arts Staff
  - One Tool Kit you are Proficient with
  - *OR starting wealth*: 1300 LMD

#### Level 1–20 Progression Table (L4620–4644)
| Level | PB | Features Gained | Max Art Level | AP | Life Support Pool |
|:-----:|:--:|:----------------|:-------------:|:--:|:-----------------:|
| 1st   | +2 | Elite 0- Arts Casting, Life Support, Medical Expertise, Medic Branch | 1 | 3 | 20 |
| 2nd   | +2 | Basic Operator Skill | 1 | 4 | 35 |
| 3rd   | +2 | Basic Talent | 2 | 6 | 35 |
| 4th   | +2 | Ability Score Improvement, Branch Feature | 2 | 7 | 50 |
| 5th   | +3 | Self-Defence Protocol | 3 | 10 | 50 |
| 6th   | +3 | Ability Score Improvement | 3 | 11 | 65 |
| 7th   | +3 | Elite 1- Branch Feature, Advanced Operator Skill | 4 | 12 | 65 |
| 8th   | +3 | Ability Score Improvement, Basic Talent Module | 4 | 15 | 80 |
| 9th   | +4 | Advanced Talent | 5 | 16 | 80 |
| 10th  | +4 | Ability Score Improvement | 5 | 17 | 95 |
| 11th  | +4 | Branch Feature | 6 | 20 | 95 |
| 12th  | +4 | Ability Score Improvement, Resuscitation | 6 | 21 | 110 |
| 13th  | +5 | Advanced Talent Mastery | 7 | 22 | 110 |
| 14th  | +5 | Elite 2- Elite Operator Skill | 7 | 25 | 125 |
| 15th  | +5 | Branch Feature | 8 | 26 | 125 |
| 16th  | +5 | Ability Score Improvement | 8 | 27 | 140 |
| 17th  | +6 | 9th Level Arts | 9 | 30 | 140 |
| 18th  | +6 | To Rob the Ferryman | 9 | 31 | 155 |
| 19th  | +6 | Ability Score Improvement | 9 | 32 | 155 |
| 20th  | +6 | Chosen of Asclepius | 9 | 35 | 170 |

#### Feature Definitions & Mechanics
- **1st Level: Arts Casting (L4605–4615)**:
  - *Arts Pool*: Learns all Arts in Healing Arts Special Arts Pool, always Prepared.
  - *Arts Points (AP)*: 3 at 1st, scaling up to 35 at 20th. Regained on Long Rest.
  - *Max Art Level*: Scales from 1 at 1st–2nd up to 9 at 17th–20th. Single 9th level Art cast per Long Rest (C1:193).
  - *Spellcasting Ability*: Intelligence or Wisdom (chosen at 1st level).
- **1st Level: Life Support (L4647–4657)**:
  - *Pool*: Pool of points starting at 20, increasing by 15 every two levels (20, 35, 50, 65, 80, 95, 110, 125, 140, 155, 170). Replenishes on Long Rest.
  - *Touch Heal*: Action to touch a Creature and expend any amount of current Life Support; the Creature recovers that many missing Hit Points (direct 1:1 conversion).
  - *Preserver*: When rolling dice to determine Hit Points recovered or Temporary Hit Points gained by another Creature, expend 5 Life Support to reroll any number of those dice (must use new results).
  - *Urgency of Treatment*: When casting an Art from Healing Arts Pool, expend Life Support in multiples of 10 to reduce Arts Point cost by 1 for every 10 Life Support expended (min 0).
- **1st Level: Medical Expertise (L4658–4660)**:
  - Gain Expertise in Medical (Medicine) Skill.
- **1st Level: Medic Branch (L4665–4672)**:
  - Choose Physician, Therapist, Triage, Ward, or Witchcraft. Branch features at levels 1, 4, 7, 11, and 15.
- **5th Level: Self-Defence Protocol (L4698–4702)**:
  - Choose one Standard Arts Pool available to Caster not previously chosen.
  - Learn all Arts of 5th level or less from that pool, including Cantrips.
  - Cost reduction: These Arts cost 1 fewer AP (min 0). At 11th Level, cost 2 fewer AP (min 0).
- **12th Level: Resuscitation (L4709–4713)**:
  - Once per Long Rest, cast Revivify Art without expending any Arts Points.
- **18th Level: To Rob the Ferryman (L4717–4719)**:
  - When reviving someone using the Revivify Art, they recover Hit Points equal to 3 * Medic Level (`3 * @classes.medic.levels`, e.g. 54 HP at 18th, 60 HP at 20th).
- **20th Level: Chosen of Asclepius (L4720–4722)**:
  - Whenever rolling to determine Hit Points restored to a Creature, can choose not to roll and instead use highest possible number for each die.

---

### 1.6 Resource Pools Summary Table

| Pool Name | Resource ID | Class | Formula / Progression | Cap | Short Rest Recovery | Long Rest Recovery |
|---|---|---|---|---|---|---|
| **Aid Dice** | `aidDie` | Supporter | `@abilities.<int/wis/cha>.mod` (chosen at 1st level) | Ability Mod (min 1) | Levels 1–14: 0<br>Level 15+: `ceil(max / 2)` | Full (`toMax`) |
| **Self-Supportive Die** | `selfSupportiveAidDie` | Supporter | 1 (Level 18+) | 1 | 0 (Regained at Turn Start) | 0 (Regained at Turn Start) |
| **Prowess** | `prowess` | Specialist | `@prof` (Level 4–20: 2, 3, 4, 5, 6) | Proficiency Bonus | +1 point (gain 1, not to max) | +1 point (gain 1, not to max) |
| **Life Support** | `lifeSupport` | Medic | Level table: 20, 35, 35, 50, 50, 65, 65, 80, 80, 95, 95, 110, 110, 125, 125, 140, 140, 155, 155, 170 | Table maximum | 0 | Full (`toMax`) |
| **Arts Points (AP)** | `ap` | Medic | Level table: 3, 4, 6, 7, 10, 11, 12, 15, 16, 17, 20, 21, 22, 25, 26, 27, 30, 31, 32, 35 | Table maximum | 0 | Full (`toMax`) |
| **Resuscitation** | `resuscitation` | Medic | 1 use (Level 12+) | 1 | 0 | 1 (`toMax`) |

---

## 2. Logic Chain

1. **Class Progression & Chassis Isolation**:
   - Each class possesses an explicit chassis that defines hit dice, weapon/armor proficiencies, tool proficiencies, saving throw choices, and starting equipment in Chapter 3.
   - For all four classes, saving throw proficiencies follow a pattern: one fixed primary save (Vanguard: Dex, Specialist: Dex) or two chosen saves from a list (Supporter: Con, Cha, or Wis; Medic: Con, Int, or Wis).
   - In Medic, armor proficiencies explicitly grant only Light Shields, giving 0 body armor proficiencies.
   - Idempotent progression requires checking existing actor items by `flags.ak5e.chapterThreeId` or exact name before creating new items, preserving existing HP rolls, ASIs, and user customizations.

2. **Table Play Philosophy (WORKFLOW §3.2)**:
   - *Confirmation step*: Every active feature (Provide Aid, Touch Heal, Directed Engagement, Mark of a Specialist, Weapon Expertise, Falling Upwards, Resuscitation) requires a confirmation dialog presenting costs, targets, and any warnings.
   - *Warnings vs Hard-stops*: If an actor attempts to use Provide Aid out of 60 ft range, or Touch Heal when Life Support is insufficient, display a clear warning with "Use anyway". Hard-stop only when the target is missing or malformed.
   - *Resource Clamping & Public Card*: When overspending under "Use anyway", resource pool clamps at 0 (never negative), and the shortfall is publicly posted to the chat card.
   - *No Auto-rolled Dice*:
     - Vanguard Tip of the Spear: The 1d6 roll or additive THP roll is triggered by clicking a button on the card.
     - Supporter Aid Die: Recipient rolls the die via interactive roll button on their chat card or sheet.
     - Medic Touch Heal: Pure arithmetic HP restoration (no dice). When Preserver rerolls healing dice, the player rolls the reroll.
   - *Unowned Target Relay*:
     - When Provide Aid targets an ally, or Touch Heal restores an ally's HP, the update is dispatched via `operation-kernel.mjs` to the GM client, applying cleanly without human approval.
   - *Encounter-Window Undo*:
     - Every feature execution records an undo receipt in `flags.ak5e` capturing initial pool values and document states, allowing single-click rollback during the combat window.

3. **Special Rules Interactions**:
   - *Additive THP (Tip of the Spear)*: Unlike 5e's non-stacking THP, AK5e Tip of the Spear #2 explicitly states THP is additive with existing THP.
   - *Construct Healing Immunity*: Chapter 1:137 prohibits Constructs from restoring HP from Healing Arts, Operator Skills, Class Features, or Medicine unless explicitly allowed. Touch Heal must warn when targeting a Construct.
   - *Specialist Mark of a Specialist Refund*: If the rerolled check still fails, the 1 spent Prowess is refunded, but the check cannot be rerolled again.

---

## 3. Caveats

1. **Subclass-Specific Features**:
   - Subclasses (Branches) for Vanguard (Agent, Charger, Pioneer, Standard Bearer, Tactician), Supporter (Artificer, Bard, Hexer, Ritualist, Summoner), Specialist (Executor, Hookmaster, Infusion, Inventor, Skyranger, Dollkeeper, Trapmaster), and Medic (Physician, Therapist, Triage, Ward, Witchcraft) each introduce branch-specific resource pools (e.g. Momentum, Aura, Sparks of Creation) and branch features at levels 1, 4/5, 7/10/11, 13/15, 17/20. These are distinct from the base class chassis documented here.
2. **Revivify Art Definition**:
   - Per `ak5e/DECISIONS.md` L466, Revivify is granted by Medic Level 12 Resuscitation, but Chapter 5 has no separate "Revivify" Art text entry. It refers to the native 5e Revivify spell mechanism while being modified by Level 18 To Rob the Ferryman.
3. **Medical vs Medicine Skill**:
   - Per `ak5e/DECISIONS.md` L473, Medic Level 1 Medical Expertise refers to the "Medical Skill", while the core skill list names it "Medicine". They represent the same proficiency in the D&D5e system.

---

## 4. Conclusion

The four base character classes—Vanguard, Supporter, Specialist, and Medic—form a cohesive, distinct foundation in AK5e v1.3.1. Each possesses a defined progression table, distinct resource pools (`aidDie`, `prowess`, `lifeSupport`, `ap`), and explicit action economies. All base mechanics can be fully implemented idempotently with complete adherence to WORKFLOW §3.2 player-agency rules, confirmation flows, GM target relays, and encounter-window undo receipts.

---

## 5. Verification Method

1. **Source Line Verification**:
   - Vanguard: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` L7904–8085.
   - Supporter: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` L6548–6692.
   - Specialist: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` L5161–5493.
   - Medic: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` L4560–4871.
2. **Item & Feature ID Verification**:
   - Inspect `ak5e/scripts/chapter-three-content.mjs` lines 17818–18060 (Medic), 21246–21540 (Specialist), 26262–26881 (Supporter), 30915–31170 (Vanguard).
3. **Automated Verification Commands**:
   - `node ak5e/tools/validate-files.mjs`
   - `node ak5e/tools/verify-generated-content.mjs`
   - `node --test ak5e/test/resource-pools.test.mjs`

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|---|---|---|---|---|---|---|
| 1 | Vanguard Chassis | Hit Dice & HP | 1d8 HD; 8 + CON at 1st, 1d8 (or 5) + CON per level after 1st | Level, CON mod | Max HP | Missing CON defaults to 0 | Ch. 3 L7918–7920 |
| 2 | Vanguard Chassis | Proficiencies | Light Armour, Light Shields, Light Melee, Messenger Kit, Dex + (Str or Cha) saves, 3 skills | User selections | Actor proficiencies | Missing selection warns user | Ch. 3 L7923–7927 |
| 3 | Vanguard Feature | Landstrider | +10 ft walking speed; attacks prevent opportunity attacks from hit target for the turn | Movement, melee hit | +10 ft speed, Nimble flag | Applied only to hit target | Ch. 3 L7987–7993 |
| 4 | Vanguard Feature | Tip of the Spear | 1d6 roll applied to visible ally within 60 ft until start of next turn; cumulative effects | Target ally within 60 ft | 1d6 table effect on target | Out of range/unseen warns | Ch. 3 L7994–8008 |
| 5 | Vanguard Feature | Quick off the Mark | Add Proficiency Bonus to Initiative rolls | Initiative roll | Roll + PB | Passive; always applies | Ch. 3 L8016–8018 |
| 6 | Vanguard Feature | Extra Attack | Make two attacks instead of one on Attack Action | Attack Action | 2 attacks | Passive | Ch. 3 L8031–8033 |
| 7 | Vanguard Feature | Uncanny Dodge | Reaction to halve attack damage against self from seen attacker | Reaction, triggering hit | Damage halved (floor) | Blinded/unseen attacker prevents | Ch. 3 L8040–8042 |
| 8 | Vanguard Feature | Directed Engagement | Reaction when using Tip of the Spear to choose effect instead of rolling | Reaction on Tip trigger | Selected Tip effect | Reaction spent | Ch. 3 L8046–8048 |
| 9 | Vanguard Feature | Lightspeed | Take two turns in Round 1 of combat; 2nd turn at Initiative - 10 | Combat start (Round 1) | Additional combat turn | Only active in Round 1 | Ch. 3 L8049–8053 |
| 10 | Vanguard Feature | Approaching Storm | Add half Vanguard level to damage rolls in Round 1 of combat | Damage roll in Round 1 | Damage + floor(Lvl/2) | Only active in Round 1 | Ch. 3 L8054–8058 |
| 11 | Supporter Chassis | Hit Dice & HP | 1d6 HD; 6 + CON at 1st, 1d6 (or 4) + CON per level after 1st | Level, CON mod | Max HP | Missing CON defaults to 0 | Ch. 3 L6595–6597 |
| 12 | Supporter Chassis | Proficiencies | Light Armour, Light Shields, Light Melee, Tool/Vehicle, 2 saves from Con/Cha/Wis, 3 skills | User selections | Actor proficiencies | Missing selection warns user | Ch. 3 L6600–6605 |
| 13 | Supporter Feature | Provide Aid | Bonus Action: grant Aid Die (d8->d10->d12) to creature within 60 ft for 10 min | Target ally, 1 Aid Die | Aid Die flag on target | Target already has die warns | Ch. 3 L6630–6640 |
| 14 | Supporter Feature | Advanced Aid | Riders when Aid Die rolled: Crit +1 (attack), 2nd die choice (skill), THP (save/heal), 10ft splash (damage) | Triggering roll type | Rider bonus/THP/splash | Passive on roll | Ch. 3 L6652–6663 |
| 15 | Supporter Feature | Lighten the Load | Reaction when ally within 60 ft rolls Aid Die: grant free Aid Die to another ally | Reaction, secondary ally | Aid Die granted without pool spend | Chaining on free die disallowed | Ch. 3 L6673–6675 |
| 16 | Supporter Feature | Ever Reliable | Regain 1 Aid Die at turn start if at 0; recover ceil(max/2) on Short Rest | Turn start / Short Rest | Restored Aid Dice | Pool clamped at max | Ch. 3 L6679–6685 |
| 17 | Supporter Feature | Self-Supportive | Regain special self-only Aid Die at start of each turn | Turn start | 1 personal Aid Die | Cannot grant to others | Ch. 3 L6686–6688 |
| 18 | Supporter Feature | Will Into Being | Add Supporter's PB to result of any Aid Die rolled by a creature | Aid Die roll | Roll + PB | Passive | Ch. 3 L6689–6693 |
| 19 | Specialist Chassis | Hit Dice & HP | 1d8 HD; 8 + CON at 1st, 1d8 (or 5) + CON per level after 1st | Level, CON mod | Max HP | Missing CON defaults to 0 | Ch. 3 L5179–5181 |
| 20 | Specialist Chassis | Proficiencies | Light/Med Armour, Light Shields, Light Melee/Ranged, 2 tools, Dex + (Wis or Cha) saves, 3 skills | User selections | Actor proficiencies | Missing selection warns user | Ch. 3 L5184–5188 |
| 21 | Specialist Feature | Weapon Specialisation | Choose Melee or Ranged combat; pick 1 style (Brawler, Deadly, Defensive, Duelling, etc.) | Style choice | Fighting style bonus | Duplicate style disallowed | Ch. 3 L5244–5299 |
| 22 | Specialist Feature | Show Your Style | Prowess pool (max PB, +1 on SR/LR); Mark of a Specialist: spend 1 to reroll failed proficient check | Failed check, 1 Prowess | Check reroll; refund on failure | Non-proficient check disallowed | Ch. 3 L5312–5320 |
| 23 | Specialist Feature | Weapon Adept | Melee: Extra attack (melee only), reroll damage 1-2. Ranged: Extra attack (ranged only), reroll attack 1 | Attack Action / damage roll | Extra attack, die rerolls | Limited to chosen style | Ch. 3 L5321–5327 |
| 24 | Specialist Feature | Weapon Expertise | Melee: Crit +1, BA + 1 Prowess for +1 damage die. Ranged: 3d20 keep high on Adv, BA + 1 Prowess for Adv | BA, 1 Prowess, attack/damage | Extra die / Advantage | Insufficient prowess warns | Ch. 3 L5336–5342 |
| 25 | Specialist Feature | Falling Upwards | It's All Skill: Reaction before save roll, spend 3 Prowess to auto-succeed minimum DC | Triggering save, 3 Prowess | Automatic save success | Must use before roll | Ch. 3 L5346–5350 |
| 26 | Specialist Feature | Weapon Mastery | Melee: 1/turn hit deals +floor(Lvl/2) damage. Ranged: 1/turn attack roll doubles PB | 1/turn attack or hit | Bonus damage / doubled PB | Once per turn clamp | Ch. 3 L5351–5357 |
| 27 | Medic Chassis | Hit Dice & HP | 1d6 HD; 6 + CON at 1st, 1d6 (or 4) + CON per level after 1st | Level, CON mod | Max HP | Missing CON defaults to 0 | Ch. 3 L4583–4585 |
| 28 | Medic Chassis | Proficiencies | Light Shields only (no armor!), Light Melee, 1 tool, 2 saves from Con/Int/Wis, Medicine + 2 skills | User selections | Actor proficiencies | Wearing armor gives penalty | Ch. 3 L4588–4593 |
| 29 | Medic Feature | Arts Casting | Learn all Healing Arts (always prepared), AP table (3->35), Max Art Level table (1->9) | AP, Art level | Cast Art | Exceeding Max Level disallowed | Ch. 3 L4605–4615 |
| 30 | Medic Feature | Life Support: Touch Heal | Action: touch creature, spend X Life Support to restore X missing HP | Target creature, X points | Creature heals X HP | Healing Construct warns | Ch. 3 L4647–4651 |
| 31 | Medic Feature | Life Support: Preserver | Spend 5 Life Support on healing/THP roll to reroll any number of dice | Healing roll, 5 points | Rerolled dice | Must use new results | Ch. 3 L4654–4655 |
| 32 | Medic Feature | Life Support: Urgency | Spend multiples of 10 Life Support to reduce Healing Art AP cost by 1 per 10 points | Casting Healing Art, 10n pts | Reduced AP cost (min 0) | Cannot reduce below 0 AP | Ch. 3 L4656–4657 |
| 33 | Medic Feature | Medical Expertise | Double proficiency bonus for Medicine skill checks | Medicine check | Double PB bonus | Passive | Ch. 3 L4658–4660 |
| 34 | Medic Feature | Self-Defence Protocol | Learn standard Arts pool <= 5th lvl. Cast at -1 AP (5th level) / -2 AP (11th level) | Casting off-pool Art | AP discount applied | Cannot reduce below 0 AP | Ch. 3 L4698–4702 |
| 35 | Medic Feature | Resuscitation | Cast Revivify Art 1/Long Rest without expending AP | Target dead <= 1 min | Revived target | 1 use per LR clamp | Ch. 3 L4709–4713 |
| 36 | Medic Feature | To Rob the Ferryman | Creatures revived by Revivify recover 3 * Medic Level Hit Points | Revivify casting | Restored HP = 3 * Lvl | Replaces 1 HP default | Ch. 3 L4717–4719 |
| 37 | Medic Feature | Chosen of Asclepius | Choose not to roll healing dice; take maximum possible value for each die | Healing dice roll | Max value on all dice | Optional per roll | Ch. 3 L4720–4722 |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---|---|---|
| 1 | Tip of the Spear #2 | Ally has 10 THP, rolls 4 on 1d6 THP | Ally receives 4 additive THP for a new total of 14 THP (explicit AK5e source exception to 5e replacement rule). |
| 2 | Directed Engagement | Multiple Tip uses triggered in one turn (e.g. Leading Lance kill) | Directed Engagement expends 1 Reaction and applies "until the end of that Turn", allowing choices for all uses that turn. |
| 3 | Lightspeed | Combat ends during Round 1 | Second turn occurs only in Round 1. If combat ends before Initiative - 10, no second turn occurs. |
| 4 | Approaching Storm | Multiple attacks / skills during Round 1 | Bonus damage equal to half Vanguard level applies to all damage rolls dealt by Vanguard during Round 1. |
| 5 | Provide Aid | Ally already has an active Aid Die | The feature states "A Creature can only have one Aid Die at a time." Confirm dialog warns player; override replaces or rejects. |
| 6 | Provide Aid | Recipient makes a Death Saving Throw | Explicitly excluded by source text: "Saving Throw (except Death Saving Throws)". Dialog blocks or warns against usage. |
| 7 | Lighten the Load | Triggered by an ally who received a supplementary Aid Die | Source explicitly states: "You cannot use this Feature on these supplementary Aid Dice", preventing infinite chaining loops. |
| 8 | Ever Reliable | Supporter has 1 Aid Die remaining at turn start | Regeneration does not trigger; only triggers if current count is strictly 0. Short Rest recovers ceil(max / 2). |
| 9 | Show Your Style: Mark of a Specialist | Rerolled skill check still fails | The 1 spent Prowess is refunded to the actor, and the check cannot be rerolled again. |
| 10 | Specialist Weapon Adept | Melee specialist attempts Extra Attack with a ranged weapon | Feature specifies: "this Attack must be a Melee Attack." Warns player if attempted with ranged weapon. |
| 11 | Falling Upwards: It's All Skill | Actor rolls saving throw before activating feature | Source specifies: "you must do so before you roll the Saving Throw." Confirm prompt must appear prior to roll evaluation. |
| 12 | Medic Touch Heal | Targeting a Construct token | Chapter 1:137 forbids healing constructs via class features/healing arts. Dialog displays hard warning for Construct targets. |
| 13 | Medic Urgency of Treatment | Medic casts 1st level Healing Art (1 AP) and spends 10 Life Support | AP cost is reduced by 1 to 0 AP. Life Support decrements by 10. |
| 14 | Medic Chosen of Asclepius | Medic uses Touch Heal | Touch Heal has no dice roll (it converts flat Life Support points to HP). Chosen of Asclepius only modifies dice rolls. |
| 15 | Medic Armor Proficiency | Medic equips Light Armor (e.g. Reinforced Outfit) | Actor is not proficient with light armor; suffers standard D&D5e lack-of-proficiency penalties on checks/saves and spellcasting. |
