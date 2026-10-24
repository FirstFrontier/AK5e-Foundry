# Handoff Report — Specialist: Inventor Subclass Specification Mining

**Agent**: `spec_miner_inventor_1`  
**Role**: Specification Miner  
**Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_inventor_1`  
**Target Milestone**: Specialist: Inventor Subclass Specification Mining  
**Date**: 2026-10-20  

---

## 1. Observation

### 1.1 Direct Source Text Citations & References
- **Rules Authority**: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`
  - **Lines 5847–5867**: Subclass intro, Inventor DC definition, 1st Level Equipment Modification, Inventions pool, Modifying procedure, Instability, Breakdown roll & HP loss.
  - **Lines 5881–5901**: 5th Level Strange Contraption (30 ft throw, 1/LR each, table of 8 contraptions).
  - **Lines 5905–5909**: 5th Level Mobile Modding (Action, 1 Prowess, 5 ft willing creature, 1 min duration, 0 Inventions) & Inventor Prowess Gain Trigger (1 Prowess when creature activating mod reduces enemy to 0 HP, max 1/turn).
  - **Lines 5910–5916**: 11th Level Risk Assessment (Speciality Modding -1 Instability, Trained Operator -1 Instability).
  - **Lines 5917–5932**: 15th Level Stranger Contraptions (Enhanced versions of all 8 contraptions).
  - **Lines 5934–5946**: 20th Level The Big One (Action, 1/LR, choice of FLASH, SHARD, QUASAR).
  - **Lines 5950–5956**: Inventor Modifications preface & Dangerous Modifications rule (+1 extra Instability; equipment disabled/broken on breakdown until repaired with Maintenance Kit).
  - **Lines 5958–6018**: 10 Melee Weapon Modifications (Boom Module, Burning Edge, Collapsible Weapon, Flexible Weapon, Laser Cutter [Dangerous], Returner, Rotary Blade, Shock Engine, Telescopic Weapon, Trick Weapon).
  - **Lines 6020–6078**: 8 Ranged Weapon Modifications (Arts Cannon [Dangerous], Collapsible Weapon, Explosive Shots, Electrobolts, Flame Gout, Homing Shots, Melee Attachment, Safety Removal).
  - **Lines 6079–6140**: 10 Armour Modifications (Adrenal Overloader [Dangerous], Artsfield Generator, Camouflage Cloak, Exoskeleton, Jetboots, Life Support, Powered Gauntlet, Refocuser, Shock Absorbers, Wingsuit).
- **Project Requirements & Architecture Context**:
  - `ORIGINAL_REQUEST.md` (lines 536–628): Requirements R1 (Chassis & Instability), R2 (31 modifications catalog), R3 (Contraptions, Mobile Modding, Risk Assessment, The Big One), R4 (Table-play philosophy & reversibility).
  - `TODO.md` (lines 974–983): Inventor branch tasks, 42 records inventory, 4 key rulings to log, manual boundaries.
  - `WORKFLOW.md` (§3.2, lines 80–145): Trust the table (no GM approval or turn gates for player actions, unowned target automatic relay, warn without blocking, confirm before use, never auto-roll dice, encounter-window reversibility).
  - `ak5e/scripts/chapter-three-content.mjs` (lines 24805–25800): 42 pre-allocated Chapter 3 content IDs matching every heading, note, and modification.
  - `ak5e/AUTOMATION_AUDIT.md` (lines 6632, 6717, 6969, 7153, 7433): Cross-class talent `Part-Time Inventor` (grants Equipment Modification with 1 max Invention [2 if upgraded], prohibits Dangerous mods).

### 1.2 Exact Numbers & Formulae Extracted
1. **Inventor DC**:
   $$\text{Inventor DC} = 8 + \text{Intelligence Modifier} + \text{Proficiency Bonus}$$
   *(Distinct from Specialist Martial DC which uses $\max(\text{STR}, \text{DEX})$).*
2. **Inventions Resource Pool**:
   $$\text{Max Inventions} = 2 \times \text{PB} = @\text{prof} \times 2$$
   - Consumed on application (1 Invention per modification).
   - Refunded on removal (1 Invention per modification removed).
   - Allocation-based tracking: $\text{Active Modifications} + \text{Available Inventions} = \text{Max Inventions}$.
3. **Instability Calculation**:
   $$\text{Instability} = 3 + (\text{Total Modifications} - 1) + (\text{Number of Dangerous Modifications}) - (\text{Risk Assessment Reductions})$$
   - Base = 3 (for the 1st modification).
   - +1 per modification after the first.
   - +1 extra for each Dangerous modification.
   - Level 11 Reductions:
     - Speciality Modding: $-1$ if weapon matches Weapon Specialisation category.
     - Trained Operator: $-1$ if equipment is wielded or worn by the Inventor.
     - Both stack: $-2$ total if Inventor wields their specialised modified weapon.
   - Minimum Instability clamp: $\max(1, \text{Instability})$.
4. **Breakdown Roll**:
   - Dice rolled: $N = \text{Instability}$ `d6` dice ($N\text{d}6$).
   - Trigger Condition: When a creature **activates** a modification.
   - Breakdown Condition: Any two or more dice show the exact same face (duplicate/matching dice).
5. **Breakdown Consequences**:
   - Wielder/wearer loses HP:
     $$\text{HP Loss} = 1\text{d}8 + \max(0, \text{Instability} - 3) \times 1\text{d}8$$
   - Safety Clamp: HP loss cannot reduce the creature below 1 Hit Point:
     $$\text{Actual HP Lost} = \min(\text{Rolled Loss}, \max(0, \text{Current HP} - 1))$$
   - Dangerous Breakdown Rider: If breakdown occurs while activating a **Dangerous Modification**, the equipment suffers damage:
     - Weapon: cannot be used (disabled).
     - Armour: provides no benefits (AC bonus negated, properties disabled).
     - Restoration: Requires repair with a **Maintenance Kit**.

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Core Chassis | **Inventor DC** | Subclass save DC calculated as $8 + \text{INT} + \text{PB}$. | Actor INT modifier, Proficiency Bonus | Integer DC | None; default ability fallback | C3 L5850–5853 |
| 2 | Core Chassis | **Inventions Pool** | Dedicated resource pool with max equal to $2 \times \text{PB}$ (@prof * 2). | Actor PB | Resource pool (current / max) | Overdraw clamped at 0 with warning | C3 L5858 |
| 3 | Core Chassis | **Modifying Equipment** | 10-minute ritual to apply/remove modifications on non-magical weapon/armour. Duplicate modifications prohibited. 1-week maintenance expiry. | Equipment item, selected modifications | Modified item with flags, updated Inventions pool | Rejects magical items, duplicate mods, or insufficient Inventions | C3 L5860 |
| 4 | Instability Engine | **Instability Calculation** | Computes item Instability: Base 3 + 1 per extra mod + 1 per Dangerous mod - Risk Assessment reductions. | Item modifications list, wielder identity, weapon specialisation | Integer Instability value ($\ge 1$) | Clamps at minimum 1 | C3 L5864, L5911–5916, L5954–5956 |
| 5 | Instability Engine | **Breakdown Roll** | Rolls $N\text{d}6$ ($N = \text{Instability}$) on mod activation; checks for duplicate dice faces. | Active item Instability | Roll result, breakdown boolean flag | Safe if all dice distinct; breakdown if any duplicates | C3 L5864 |
| 6 | Instability Engine | **Breakdown HP Loss** | Inflicts $1\text{d}8 + \max(0, \text{Instability}-3)\text{d}8$ HP loss on wielder/wearer, clamped to not drop below 1 HP. | Item Instability, wielder current HP | Damage roll, applied HP loss receipt | Clamped at current HP - 1 (min 1 HP remaining) | C3 L5864 |
| 7 | Instability Engine | **Dangerous Breakdown Damage** | When breakdown occurs from activating a Dangerous mod, equipment is broken/disabled until repaired with Maintenance Kit. | Activated modification, equipment item | Equipment marked broken (`flags.ak5e.isBroken = true`) | Weapon unusable, armor benefits suppressed | C3 L5954–5956 |
| 8 | Subclass Feature (Lv 5) | **Strange Contraption** | Action to throw 1 of 8 contraptions up to 30 ft. Each option usable 1/Long Rest. | Chosen contraption, target point (30 ft) | Chat card, template, effect execution | Rejects already-used option before LR | C3 L5881–5883 |
| 9 | Contraption (Lv 5) | **12 Million Lumen Flashlight** | 15 ft radius sphere; DEX save vs Inventor DC or Blinded until end of next turn. | Target point (30 ft) | DEX save prompt, Blinded condition | Full save negates at Lv 5 | C3 L5893 |
| 10 | Contraption (Lv 5) | **Fun Toy** | Creates Tiny Construct Mobile Camera at target point for 10 min (18 AC, 10 HP, 20 ft move, 60 ft Darkvision, BA to see/hear). | Target point (30 ft) | Mobile Camera token/actor | Limited to 100 ft command range | C3 L5894 |
| 11 | Contraption (Lv 5) | **Musbeast Remover** | 10 ft radius sphere for 2 rounds. Initial & on-entry DEX save: 4d8 Piercing (half on save). Ignores non-full cover. | Target point (30 ft) | 10 ft sphere template, DEX save, 4d8 Piercing | Half damage on success | C3 L5895 |
| 12 | Contraption (Lv 5) | **Needlefly Fumigator** | 20 ft radius sphere for 1 min (spreads around corners). On entry or turn start: CON save vs Inventor DC or 2d8 Poison + Poisoned condition. | Target point (30 ft) | 20 ft sphere template, CON save, 2d8 Poison | Half damage, no condition on success | C3 L5896 |
| 13 | Contraption (Lv 5) | **Over-tuned Speaker** | Creates chosen sound loud enough to be heard up to 100 ft for up to 1 minute. | Target point (30 ft), sound description | Chat card / audio cue notification | Manual adjudication | C3 L5897 |
| 14 | Contraption (Lv 5) | **Portable Firestarter** | 10 ft radius sphere; DEX save: 2d8 Fire + Burning condition (half damage, no burn on save). Unattended objects ignite. | Target point (30 ft) | 10 ft sphere template, DEX save, 2d8 Fire + Burning | Half damage on success | C3 L5898 |
| 15 | Contraption (Lv 5) | **Universal Keycard** | Removes electronic lock/restriction within 5 ft; leaves digital trace. DM discretion. | Target object within 5 ft | Unlock event, forensic trace notice | DM discretion on invalid target | C3 L5899 |
| 16 | Contraption (Lv 5) | **Unstable Contraption** | 10 ft radius sphere; DEX save: 5d8 Thunder (half on save). | Target point (30 ft) | 10 ft sphere template, DEX save, 5d8 Thunder | Half damage on success | C3 L5900 |
| 17 | Subclass Feature (Lv 5) | **Mobile Modding** | Action, 1 Prowess: apply 1 mod to equipment of willing creature within 5 ft for 1 min (0 Inventions cost). | Target willing creature, equipment, chosen mod | Temporary modification applied (1 min duration) | Rejects duplicate mod on item; warns on Prowess shortfall | C3 L5905–5906 |
| 18 | Subclass Feature (Lv 5) | **Inventor Prowess Gain Trigger** | Gain 1 Prowess when a creature who activated one of your mods this turn reduces a creature to 0 HP (max 1/turn). | Combat drop-to-0 HP event, mod activation history | +1 Prowess | Clamped at max Prowess; capped at 1/turn | C3 L5908 |
| 19 | Subclass Feature (Lv 11) | **Risk Assessment: Speciality Modding** | Modified weapons matching Weapon Specialisation choice have Instability reduced by 1. | Modified weapon item, Actor specialisation | -1 Instability | Only applies to matching weapon category | C3 L5913 |
| 20 | Subclass Feature (Lv 11) | **Risk Assessment: Trained Operator** | Modified equipment wielded or worn by the Inventor has Instability reduced by 1. | Modified equipment item, Actor identity | -1 Instability | Only applies when Inventor wields/wears item | C3 L5915 |
| 21 | Subclass Feature (Lv 15) | **Stranger: 12 Million Lumen Flashlight** | Flashlight enhanced: creatures that succeed on the save are Dazed until end of next turn. | Target creatures in 15 ft sphere | DEX save; Fail=Blinded, Pass=Dazed | Dazed applied on pass | C3 L5923 |
| 22 | Subclass Feature (Lv 15) | **Stranger: Fun Toy** | Fun Toy enhanced: Mobile Camera gains the Invisible Condition. | Fun Toy activation | Mobile Camera construct with Invisible condition | None | C3 L5924 |
| 23 | Subclass Feature (Lv 15) | **Stranger: Musbeast Remover** | Musbeast Remover enhanced: creatures that fail the save also suffer the Bleeding condition. | Target creatures in 10 ft sphere | DEX save: 4d8 Piercing + Bleeding condition | Half damage, no bleed on pass | C3 L5925 |
| 24 | Subclass Feature (Lv 15) | **Stranger: Needlefly Fumigator** | Needlefly Fumigator enhanced: Inventor chooses any number of creatures to be immune until end of next turn. | Target creatures, nominated immune allies | Immunity flag / filter on area save | Nominated allies take 0 damage and no condition | C3 L5926 |
| 25 | Subclass Feature (Lv 15) | **Stranger: Over-tuned Speaker** | Speaker enhanced: user can control volume and pick a specific direction. | Sound volume, directional heading | Chat card / audio description | Manual adjudication | C3 L5927 |
| 26 | Subclass Feature (Lv 15) | **Stranger: Portable Firestarter** | Firestarter enhanced: Burning damage inflicted by this contraption is increased by Inventor's INT modifier. | Burning damage roll | +INT fire damage bonus on ongoing burn ticks | Only applies to burn caused by this contraption | C3 L5928 |
| 27 | Subclass Feature (Lv 15) | **Stranger: Universal Keycard** | Keycard enhanced: no longer leaves any trace. | Target electronic lock/system | Silent unlock event, no trace left | DM discretion on invalid target | C3 L5929 |
| 28 | Subclass Feature (Lv 15) | **Stranger: Unstable Contraption** | Unstable Contraption enhanced: damage increased from 5d8 to 8d8 Thunder. | Target creatures in 10 ft sphere | DEX save: 8d8 Thunder (half on pass) | Half damage on success | C3 L5930 |
| 29 | Subclass Feature (Lv 20) | **The Big One: FLASH** | Action, 1/LR: choose up to 4 points within 100 ft; 10 ft radius spheres deal 8d6 Thunder + Burning (half on save). Overlapping areas trigger save once. | Up to 4 target points within 100 ft | 4x 10 ft sphere templates, DEX save: 8d6 Thunder + Burning | Half damage, no burn on pass; max 1 save per creature | C3 L5939 |
| 30 | Subclass Feature (Lv 20) | **The Big One: SHARD** | Action, 1/LR: 50 ft cone originating from user deals 10d6 Slashing + Bleeding (half on save). Ignores cover. | 50 ft cone template | DEX save: 10d6 Slashing + Bleeding; ignores cover | Half damage, no bleed on pass | C3 L5941 |
| 31 | Subclass Feature (Lv 20) | **The Big One: QUASAR** | Action, 1/LR: 100 ft long, 10 ft wide line deals 14d6 Radiant (half on save). | 100x10 ft line template | DEX save: 14d6 Radiant | Half damage on success | C3 L5943 |
| 32 | Melee Mod (1/10) | **Boom Module** | Item: Weapon dealing Bludgeoning damage. Once/turn on hit (no action): +1 die Thunder damage, STR save vs Inventor DC or pushed 20 ft & Prone. | Hit with bludgeoning weapon | Instability roll, +1 die Thunder damage, STR save prompt | Save negates push & prone | C3 L5960–5963 |
| 33 | Melee Mod (2/10) | **Burning Edge** | Item: Melee weapon. Once/turn on Attack Action: weapon attack damage converted to Fire until end of turn. | Attack Action | Instability roll, weapon damage type converted to Fire | None | C3 L5965–5968 |
| 34 | Melee Mod (3/10) | **Collapsible Weapon (Melee)** | Item: Melee weapon. Action: folds to half size & disguise (improvised weapon). Bonus Action: revert. | Action / Bonus Action | Instability roll on activation, folded/reverted state | Improvised weapon when folded | C3 L5970–5974 |
| 35 | Melee Mod (4/10) | **Flexible Weapon** | Item: Melee weapon. Once/turn on melee attack: ignores target shield AC bonus. Bonus Action: repeat attack on different creature within 10 ft. | Attack roll / Bonus Action | Instability roll, shield bonus bypass, bonus attack prompt | None | C3 L5977–5981 |
| 36 | Melee Mod (5/10) [Dangerous] | **Laser Cutter** | Item: Melee weapon. On Attack Action, forgo 1 attack: 15 ft cone DEX save for 3d8 (Lv 1-6) / 4d8 (Lv 7-13) / 5d8 (Lv 14-20) Radiant (half on save). Dangerous mod (+1 extra Instability, broken on breakdown). | Forgo attack, 15 ft cone | Instability roll, DEX save, Radiant damage | Half damage on pass; equipment broken on breakdown | C3 L5982–5987 |
| 37 | Melee Mod (6/10) | **Returner** | Item: Melee weapon. On Attack Action: gains Returning property until end of turn. If dropped/disarmed: Bonus Action recall within normal range. | Attack Action / Bonus Action | Instability roll, Returning property, weapon recalled to hand | Fails if out of normal range | C3 L5989–5993 |
| 38 | Melee Mod (7/10) | **Rotary Blade** | Item: Melee weapon dealing Slashing or Piercing. Once/turn on hit: +1 die Slashing damage + DEX save vs Inventor DC or Bleeding. | Hit with slashing/piercing melee weapon | Instability roll, +1 die Slashing damage, DEX save prompt | Save negates Bleeding | C3 L5994–5998 |
| 39 | Melee Mod (8/10) | **Shock Engine** | Item: Melee weapon. Once/turn on hit: damage converted to Lightning + DEX save vs Inventor DC or Dazed until end of next turn. | Hit with melee weapon | Instability roll, damage converted to Lightning, DEX save prompt | Save negates Dazed | C3 L6003–6007 |
| 40 | Melee Mod (9/10) | **Telescopic Weapon** | Item: Melee weapon. Once/turn on Attack Action: gains Reach property until end of turn (or 15 ft reach if already Reach). | Attack Action | Instability roll, weapon reach increased to Reach / 15 ft | None | C3 L6008–6012 |
| 41 | Melee Mod (10/10) | **Trick Weapon** | Item: Melee weapon. On mod install: select another Light/Heavy melee weapon. Bonus Action: transform into selected weapon for 1 min. Wielder proficient with base weapon is proficient with transformed weapon. | Bonus Action | Instability roll, weapon transformed for 1 min | Reverts after 1 minute | C3 L6013–6017 |
| 42 | Ranged Mod (1/8) [Dangerous] | **Arts Cannon** | Item: Ranged weapon with Two-Handed property. Action: 60 ft range, 10 ft radius sphere DEX save for 3d8 (Lv 1-6) / 4d8 (Lv 7-13) / 5d8 (Lv 14-20) Force (half on save). Dangerous mod (+1 extra Instability, broken on breakdown). | Action, target point (60 ft) | Instability roll, DEX save, Force damage | Half damage on pass; equipment broken on breakdown | C3 L6022–6027 |
| 43 | Ranged Mod (2/8) | **Collapsible Weapon (Ranged)** | Item: Ranged weapon. Action: folds to half size & disguise (improvised weapon). Bonus Action: revert. | Action / Bonus Action | Instability roll on activation, folded/reverted state | Improvised weapon when folded | C3 L6029–6033 |
| 44 | Ranged Mod (3/8) | **Explosive Shots** | Item: Light or Heavy Ranged weapon. On attack (no action): roll damage even on miss; all other creatures within 10 ft DEX save for half damage as Thunder. | Ranged attack | Instability roll, damage roll, DEX save for 10 ft splash | Save negates splash damage | C3 L6034–6038 |
| 45 | Ranged Mod (4/8) | **Electrobolts** | Item: Ranged weapon without Splash or Firearm. On hit: Bonus Action converts damage to Lightning + CON save vs Inventor DC or Nervous Impairment until start of next turn. | Hit with qualifying ranged weapon, Bonus Action | Instability roll, damage converted to Lightning, CON save prompt | Save negates Nervous Impairment | C3 L6048–6052 |
| 46 | Ranged Mod (5/8) | **Flame Gout** | Item: Ranged weapon with Two-Handed property. Action: 15 ft cone DEX save for 1d8 (Lv 1-6) / 2d8 (Lv 7-13) / 3d8 (Lv 14-20) Fire + Burning (half damage, no burn on save). | Action, 15 ft cone | Instability roll, DEX save, Fire damage + Burning | Half damage, no burn on pass | C3 L6053–6058 |
| 47 | Ranged Mod (6/8) | **Homing Shots** | Item: Light or Heavy Ranged weapon. On miss: Reaction to reroll attack (must use new result, cannot reroll again). | Missed ranged attack, Reaction | Instability roll, attack reroll | Must take new result; max 1 reroll | C3 L6060–6064 |
| 48 | Ranged Mod (7/8) | **Melee Attachment** | Item: Ranged weapon. Bonus Action during turn or as part of Opportunity Attack: make melee attacks using DEX for 1d8 + modifier Piercing until end of turn. | Bonus Action / Opportunity Attack | Instability roll, melee mode enabled until end of turn | Reverts at end of turn | C3 L6065–6070 |
| 49 | Ranged Mod (8/8) | **Safety Removal** | Item: Ranged weapon with Firearm property. On Attack Action (no action): make 1 additional attack as part of action, but all attacks in action have Disadvantage. | Attack Action | Instability roll, +1 attack in action, Disadvantage on all attacks | Disadvantage on all attacks in that action | C3 L6074–6078 |
| 50 | Armour Mod (1/10) [Dangerous] | **Adrenal Overloader** | Item: Any Armour. During turn (no action): gain 1 additional Action this turn (1/Short Rest, 1/turn). Dangerous mod (+1 extra Instability, broken on breakdown). | Activation during turn | Instability roll, +1 additional Action | Limited to 1/SR and 1/turn; armor broken on breakdown | C3 L6081–6085 |
| 51 | Armour Mod (2/10) | **Artsfield Generator** | Item: Medium or Heavy Armour. Reaction when creature within 5 ft is hit by an attack: grant that creature Resistance against 1 damage type present on that attack. | Creature within 5 ft hit, Reaction | Instability roll, Resistance against selected damage type | Only mitigates triggering attack | C3 L6086–6090 |
| 52 | Armour Mod (3/10) | **Camouflage Cloak** | Item: Light Armour or Clothing. Action: for 1 min, Advantage on DEX (Stealth) checks, and WIS (Perception) checks to see wearer made at Disadvantage. | Action | Instability roll, Active Effect: Advantage Stealth, Disadv Perception to spot | 1 minute duration | C3 L6091–6095 |
| 53 | Armour Mod (4/10) | **Exoskeleton** | Item: Any Armour. Bonus Action: until start of next turn, treated 1 size larger for push/pull/carry, double jump, Advantage on STR (Athletics), not slowed carrying $\le$ size creature. | Bonus Action | Instability roll, Exoskeleton active effect until start of next turn | Expires at start of next turn | C3 L6096–6100 |
| 54 | Armour Mod (5/10) | **Jetboots** | Item: Any Armour. Bonus Action: immediately take Dash Action, but must move in a single straight line as part of Dash. | Bonus Action | Instability roll, straight-line Dash action | Movement restricted to single straight line | C3 L6110–6114 |
| 55 | Armour Mod (6/10) | **Life Support** | Item: Any Armour. When below half max HP, Bonus Action: roll 1 Hit Die + CON mod and recover that many HP. Expends Hit Die. | Current HP < half max HP, Bonus Action, 1 Hit Die | Instability roll, 1 HD expended, HP recovered ($1\text{HD} + \text{CON}$) | Requires HP < 50% max and available HD | C3 L6115–6119 |
| 56 | Armour Mod (7/10) | **Powered Gauntlet** | Item: Any Armour. On hit with Unarmed Strike (no action): attack deals +1 additional die of Lightning damage. | Unarmed Strike hit | Instability roll, +1 die Lightning damage | None | C3 L6120–6124 |
| 57 | Armour Mod (8/10) | **Refocuser** | Item: Any Armour or Clothing. Reaction when failing CON save to maintain Concentration on an Art: reroll save with Advantage. | Failed CON concentration save, Reaction | Instability roll, save reroll with Advantage | Must accept new result | C3 L6125–6129 |
| 58 | Armour Mod (9/10) | **Shock Absorbers** | Item: Any Armour. Reaction when making STR or DEX save: add Inventor's INT modifier to the result of the roll. | STR or DEX save, Reaction | Instability roll, +Inventor INT mod added to save roll | Only applies to triggering save | C3 L6130–6134 |
| 59 | Armour Mod (10/10) | **Wingsuit** | Item: Light Armour or Clothing. Reaction when falling far enough to take fall damage: gain Flying Speed 30 ft until landing (cannot ascend, must descend $\ge 10$ ft/turn). | Falling trigger, Reaction | Instability roll, 30 ft gliding fly speed until landing | Cannot ascend, must descend $\ge 10$ ft/turn | C3 L6135–6139 |
| 60 | Cross-Class Talent | **Part-Time Inventor** | Talent: Defender, Guard, Marksman, Supporter, Vanguard gain Equipment Modification with max 1 Invention (2 if module upgraded) and prohibited from applying Dangerous mods. | Talent selection, item to modify | Equipment Modification enabled with capped pool (1 or 2) | Prohibits Dangerous modifications | C3 L1184 / Audit L6632 |

---

## 3. Edge Cases & Boundary Conditions

| # | Feature | Input / Trigger Condition | Observed / Required Behavior |
|---|---------|---------------------------|------------------------------|
| 1 | Instability Engine | Instability reduced to 1 or 2 via Risk Assessment (e.g. Speciality Modding -1 and Trained Operator -1 on a single-mod item, base 3 becomes 1). | Rolling 1d6 cannot roll duplicate matching dice; breakdown probability is 0.00%. Rolling 2d6 has 1/6 (16.67%) breakdown probability. The engine must support Instability values 1 and 2 without throwing index or range errors. |
| 2 | Instability Engine | Instability reaches 7 or more (e.g. 5 mods on weapon, 2 of which are dangerous). | By the Pigeonhole Principle, rolling 7 or more 6-sided dice is guaranteed (100.00%) to contain at least one duplicate pair, causing an automatic breakdown every activation. |
| 3 | Breakdown HP Loss | Breakdown HP loss formula at Instability 1 or 2 ($1\text{d}8 + (\text{Instability}-3)\text{d}8$). | The additional term $(\text{Instability}-3)$ must be clamped at 0 (`Math.max(0, Instability - 3)`). At Instability 1, 2, or 3, the damage is $1\text{d}8$. At Instability 4 it is $2\text{d}8$, at Instability 5 it is $3\text{d}8$, etc. |
| 4 | Breakdown HP Loss | Creature has 1 HP (or rolls damage exceeding `currentHP - 1`). | The rule states "cannot reduce you below 1 Hit Point". The engine must clamp applied damage: if current HP is 1, 0 damage is deducted; if current HP is 5 and 7 is rolled, only 4 damage is deducted. |
| 5 | Dangerous Breakdown | Item has both Dangerous and Non-Dangerous mods installed; wielder activates a Non-Dangerous mod and suffers a breakdown. | Per L5955 ("when equipment suffers a breakdown as a result of activating a Dangerous Modification"), the broken equipment rider triggers **only** when activating a Dangerous modification. Activating a non-dangerous mod on the same item inflicts HP loss but does **not** break the equipment. |
| 6 | Instability Timing | Creature makes a basic attack with a modified weapon without activating any modification (e.g. Telescopic Weapon or Boom Module not activated). | No Instability roll occurs. Instability rolls trigger **only** when a creature deliberately activates a modification. Passive holding, wearing, or non-modified attacks never roll Instability. |
| 7 | Collapsible Weapon | Weapon folded into disguise (Action); wielder attacks with it in folded state. | Treated as an improvised melee weapon: deals $1\text{d}4 + \text{STR}$ (or DEX if versatile/finesse rule allows), and normal weapon properties (reach, heavy, etc.) are suspended until reverted as a Bonus Action. |
| 8 | Melee Attachment | Attack and damage calculation ("1d8 + their Attack Modifier in Piercing Damage", L6068). | Ambiguity between literal attack roll bonus (`DEX + PB`) vs intended ability modifier (`DEX`). Per WORKFLOW §3.2, present both readings in the confirm dialog, defaulting to `1d8 + DEX mod`. |
| 9 | Duplicate Mods | Attempting to apply Collapsible Weapon (Melee) to a Ranged Weapon, or Boom Module twice to the same weapon. | Hard block: non-matching equipment categories are rejected; duplicate modifications on the same piece of equipment are strictly disallowed per L5860. |
| 10 | Mobile Modding | Applying a modification via Mobile Modding to equipment already modified. | Allowed, provided it is not a duplicate of an existing mod on that equipment. Temporarily increases total modification count and item Instability by +1 (+2 if Dangerous) for 1 minute; costs 0 Inventions. |
| 11 | Inventor Prowess Gain | Ally activates an Inventor's modification and downs a monster on the ally's turn. | The Inventor gains 1 Prowess immediately (relayed through state tracking), even though it is not the Inventor's turn. Capped at 1 Prowess gain per turn. |
| 12 | The Big One: FLASH | A creature stands in the overlapping radius of 2 or more of the 4 targeted points. | Explicit source exception: "If a Creature would be within multiple affected areas, they only make the Saving Throw once." (Take 8d6 Thunder + Burning once). |
| 13 | The Big One: SHARD | Target creature is behind three-quarters cover (+5 AC/Dex saves) or half cover (+2 AC/Dex saves). | Source rule: "Creatures do not gain the benefit of cover against this effect." Save DC and roll are unmodified by cover bonuses. |
| 14 | Returner Recall | Weapon dropped or disarmed; wielder uses Bonus Action to recall. Normal range evaluation on a melee weapon without the Thrown property. | If weapon lacks Thrown property, normal range is treated as reach / 5 ft (or Thrown range 20/60 if improvised thrown). If weapon has Thrown property, uses its printed normal range. |
| 15 | Trick Weapon | Transformed weapon proficiency: character is proficient with a Dagger (Light Melee) with Trick Weapon set to a Greatsword (Heavy Melee). | Source rule: "a Creature Proficient with the original Weapon is considered Proficient with the transformed Weapon." Character adds PB to Greatsword attacks during the 1-minute transformation. |
| 16 | Life Support | Wearer uses Bonus Action when exactly at 50% max HP (e.g. 20/40 HP). | Source text: "below half of their maximum Hit Points" ($< 50\%$). At exactly 50%, feature cannot be activated (warns in dialog). Must be strictly less than half (e.g. 19/40 HP). |
| 17 | Wingsuit | Wearer falls only 5 feet (not enough to take falling damage, which requires $\ge 10$ feet in 5e). | Trigger condition is "falling a distance great enough for them to take falling Damage" ($\ge 10$ ft). 5 ft fall does not qualify for Reaction activation. |
| 18 | Part-Time Inventor | Character with Part-Time Inventor attempts to modify a weapon with Laser Cutter [Dangerous]. | Hard block: Part-Time Inventor explicitly forbids applying any modification marked as Dangerous. Inventions pool capped at 1 (or 2 if upgraded). |

---

## 4. Logic Chain

1. **Premise 1 (Source Authority & Scope)**: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (lines 5847–6140) provides the authoritative definition of the Inventor subclass. Cross-referencing `ak5e/scripts/chapter-three-content.mjs` confirms exactly 42 pre-allocated document records: 1 subclass item, 6 progression feature items, 7 headers/notes, and 28 modifications.
2. **Premise 2 (Modification Count Discrepancy Reconciliation)**: While `ORIGINAL_REQUEST.md` line 540 mentions "all 28 standard + 3 dangerous Modifications" (suggesting 31), lines 558–588 and the source text enumerate:
   - 10 Melee Modifications (9 standard, 1 Dangerous: Laser Cutter);
   - 8 Ranged Modifications (7 standard, 1 Dangerous: Arts Cannon);
   - 10 Armour Modifications (9 standard, 1 Dangerous: Adrenal Overloader).
   $10 + 8 + 10 = 28$ modifications in total (25 standard + 3 dangerous). `DECISIONS.md` line 443 explicitly corroborates this: *"The existing 9 Therapies, 10 Tactics, 28 Inventor modifications..."*. The number 31 arose from double-counting the 3 dangerous modifications on top of the 28 total.
3. **Premise 3 (Inventions Pool Model)**: Inventions are not expendable per-rest spell slots; they are an allocation pool ($2 \times \text{PB}$). Applying a modification locks 1 Invention; removing the modification unlocks/refunds 1 Invention. Mobile Modding bypasses this pool (0 Inventions cost).
4. **Premise 4 (Instability & Duplicate Dice Math)**: Instability starts at 3 for 1 modification, +1 per additional modification, and +1 extra for Dangerous modifications. The breakdown condition tests for duplicate dice among $N$ `d6`s. The probability of breakdown is:
   - $N=1$: 0% (safe).
   - $N=2$: $1 - \frac{6 \times 5}{6^2} = \frac{6}{36} = 16.67\%$.
   - $N=3$: $1 - \frac{6 \times 5 \times 4}{6^3} = 1 - \frac{120}{216} = 44.44\%$.
   - $N=4$: $1 - \frac{6 \times 5 \times 4 \times 3}{6^4} = 1 - \frac{360}{1296} = 72.22\%$.
   - $N=5$: $1 - \frac{6 \times 5 \times 4 \times 3 \times 2}{6^5} = 1 - \frac{720}{7776} = 90.74\%$.
   - $N=6$: $1 - \frac{6!}{6^6} = 1 - \frac{720}{46656} = 98.46\%$.
   - $N \ge 7$: 100% (guaranteed breakdown by Dirichlet's box principle).
   HP loss is $1\text{d}8 + \max(0, N-3)\text{d}8$, clamped so current HP $\ge 1$.
5. **Premise 5 (Table-Play Integration per WORKFLOW §3.2)**: Every modification activation, contraption throw, and Big One blast must follow:
   - Confirm dialog with warnings (range, prerequisites, broken equipment, resource shortfalls).
   - Interactive chat cards with roll buttons: Instability dice button, damage buttons, save buttons for targets.
   - GM relay via `validateTarget` for unowned targets (damage, conditions).
   - Full encounter-window undo receipts recorded under `flags.ak5e.specialistUses.undo`.

---

## 5. Caveats

- **No Caveats Regarding Source Rules**: The source text in Chapter 3 is unambiguous regarding mechanics, DC formulas, and modification catalog.
- **Rulings Identified for `ak5e/DECISIONS.md`**:
  1. *Melee Attachment*: Source specifies "1d8 + their Attack Modifier". Default to `1d8 + DEX mod`, but provide a runtime selection for `1d8 + (PB + DEX)` per WORKFLOW §3.2 rule on ambiguous source text.
  2. *Dangerous Breakdown Damage Rider*: Applies only when a Dangerous modification is activated, not when a standard modification on the same item triggers a breakdown.
  3. *Duplicate Collapsible Weapon*: Melee and Ranged variants share identical functionality but are restricted to their respective item types; they cannot be cross-applied.
  4. *Part-Time Inventor*: Must be supported by the modification engine for non-Specialists holding that talent (cap 1 or 2 Inventions, dangerous modifications blocked).

---

## 6. Conclusion

The specification for the **Inventor** subclass of the Specialist class is completely mapped and verified against authoritative sources:
1. **Core Chassis**: Inventor DC ($8 + \text{INT} + \text{PB}$), Inventions allocation pool ($2 \times \text{PB}$), 10-minute modification workflow, non-magical weapon/armor targeting, 1-week maintenance expiry.
2. **Instability Engine**: Base 3, +1 per extra mod, +1 extra per Dangerous mod, -1 Speciality Modding, -1 Trained Operator; $N\text{d}6$ matching-dice breakdown roll; $1\text{d}8 + (N-3)\text{d}8$ HP loss (clamped at $\ge 1$ HP); Dangerous breakdown disabled equipment rider.
3. **Full 28 Modifications Catalog**: 10 Melee (1 Dangerous: Laser Cutter), 8 Ranged (1 Dangerous: Arts Cannon), 10 Armour (1 Dangerous: Adrenal Overloader).
4. **Subclass Progression**: Strange Contraptions (8 options, 1/LR each), Mobile Modding (1 Prowess, Action, 1 min, 0 Inventions), Inventor Prowess Gain Trigger (1/turn on downing enemy), Risk Assessment (Lv 11), Stranger Contraptions (Lv 15), The Big One (Lv 20: FLASH, SHARD, QUASAR).
5. **Table-Play Compliance**: Fully conforms to `WORKFLOW.md` §3.2 with confirm dialogs, non-blocking warnings, interactive dice rolls, GM target relays, and encounter-window undo receipts.

---

## 7. Verification Method

To independently verify the facts, quotes, line numbers, and formulas documented in this report:
1. **Source Text Audit**:
   ```bash
   sed -n '5847,6140p' /home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt
   ```
2. **Pre-allocated Database IDs Inspection**:
   ```bash
   grep -n "subclass-.*specialist-inventor" /home/patch/AK5e-Foundry/ak5e/scripts/chapter-three-content.mjs
   ```
3. **Cross-Class Talent Verification**:
   ```bash
   grep -n "Part-Time Inventor" /home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt
   ```
4. **Foundry Pack & Code Validation**:
   ```bash
   node ak5e/tools/validate-files.mjs
   node ak5e/tools/verify-generated-content.mjs
   ```
