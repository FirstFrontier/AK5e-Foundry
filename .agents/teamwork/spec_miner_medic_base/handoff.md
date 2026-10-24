# Medic Base Character Class Specification Report

**Author**: Medic Rules Spec Miner  
**Date**: 2026-10-13  
**Status**: COMPLETE / HARD HANDOFF  
**Target Path**: `/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_medic_base/handoff.md`  
**Rules Authority**: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (Medic section: lines 4560–4870)  
**Cross-References**: 
- `AK5e_1.3.1_Foundry_Source/01_chapter_1_changing_the_game.txt` (Construct healing restriction lines 137–138, No Feat replacement lines 134–135, No Multiclassing lines 140–144)
- `AK5e_1.3.1_Foundry_Source/05_chapter_5_arts.txt` (Arts rules, Healing Arts Special Pool lines 415–435, Standard Arts Pools lines 60–310, No Material Components lines 36–37, 9th Level Arts restriction lines 56–58)

---

## 1. Observation

Direct, verbatim source text, line citations, and numerical values extracted from `AK5e_1.3.1_Foundry_Source/`:

### 1.1 Class Chassis & Proficiencies
- **Hit Dice** (Ch. 3 L4583): `1d6 per Medic Level`
- **Hit Points at 1st Level** (Ch. 3 L4584): `6 + your Constitution Modifier`
- **Hit Points at Higher Levels** (Ch. 3 L4585): `1d6 (or 4) + your Constitution Modifier per Medic Level after 1st`
- **Armor Proficiencies** (Ch. 3 L4588): `Light Shields`
  *(Note: Medics do NOT have Light, Medium, or Heavy armor proficiencies. Armor proficiency is strictly Light Shields only.)*
- **Weapon Proficiencies** (Ch. 3 L4589): `Light Melee`
  *(Note: No ranged weapons, no martial weapons.)*
- **Tool Proficiencies** (Ch. 3 L4590): `A Tool Kit/Vehicle Proficiency of your Choice`
- **Saving Throws** (Ch. 3 L4591): `Choose Two from the following: Constitution, Intelligence, Wisdom`
- **Skills** (Ch. 3 L4592): `Medicine + Two from: Lore, Arts, Tech, Insight, Perception, Persuasion`
  *(Automatic Medicine skill proficiency + player choice of 2 skills from the 6 listed options.)*
- **Starting Equipment** (Ch. 3 L4594–4603):
  - Choice 1: **A)** 1x Light Melee Weapon OR **B)** 1x Light Shield
  - Choice 2: **A)** Arts Wand OR **B)** Arts Staff
  - Proficient Tool: One Tool Kit you are Proficient with
  - OR Cash Alternative: `1300 LMD`

### 1.2 Arts Casting (Ch. 3 L4605–4615)
- **Arts Pool** (Ch. 3 L4608): `You learn all of the Arts in the Healing Arts Special Arts Pool, and they are always Prepared.`
- **Arts Points** (Ch. 3 L4610): Regain all expended Arts Points upon completing a Long Rest.
- **Maximum Arts Level** (Ch. 3 L4612): Governed by the Medic Features table (1st to 9th level).
- **Spellcasting Ability** (Ch. 3 L4614): `When you gain this Feature, choose either Intelligence or Wisdom; that is your Spellcasting Ability.`
- **Spell Save DC & Attack Mod** (Ch. 5 & Core System):
  - `Spell Save DC = 8 + Proficiency Bonus + Spellcasting Ability Modifier (INT or WIS)`
  - `Spell Attack Modifier = Proficiency Bonus + Spellcasting Ability Modifier (INT or WIS)`
- **Healing Arts Special Pool Inventory** (Ch. 5 L419–431):
  - Cantrips: *Abjure*, *Toll the Dead*
  - 1st Level: *Cure Wounds*, *Healing Word*
  - 2nd Level: *Aid*, *Bolster*, *Lesser Restoration\**, *Prayer of Healing*, *Protection from Poison*, *Warding Bond*
  - 3rd Level: *Aura of Vitality*, *Beacon of Hope*, *Mass Healing Word*
  - 4th Level: *Death Ward*
  - 5th Level: *Greater Restoration\**, *Mass Cure Wounds*
  - 6th Level: *Fizban's Platinum Shield*, *Heal\**
  - 7th Level: None
  - 8th Level: None
  - 9th Level: *Mass Heal\**  
  *(Ch. 5 L434: Arts with an asterisk cannot heal diseases, as disease is the purview of traditional medicine).*
- **General Arts Rules** (Ch. 5 L11, L27, L36–37, L56–58):
  - Prepared: All known Arts are always prepared (L11).
  - Casting Unit: Must have a Casting Unit equipped (L27).
  - Components: No material components required for any Arts (L36–37).
  - 9th Level Arts: Only 1 single 9th-level Art can be cast per Long Rest regardless of remaining AP (L56–58).

### 1.3 Progression Table (Ch. 3 L4620–4644)
Verbatim values across all 20 levels:

| Level | PB | Features | Max Art Level | Arts Points (AP) | Life Support |
|:-----:|:--:|:---------------------------------------------------------------------------------|:-------------:|:----------------:|:------------:|
| 1st   | +2 | Elite 0- Arts Casting, Life Support, Medical Expertise, Medic Branch             | 1             | 3                | 20           |
| 2nd   | +2 | Basic Operator Skill                                                             | 1             | 4                | 35           |
| 3rd   | +2 | Basic Talent                                                                     | 2             | 6                | 35           |
| 4th   | +2 | Ability Score Improvement, Branch Feature                                        | 2             | 7                | 50           |
| 5th   | +3 | Self-Defence Protocol                                                            | 3             | 10               | 50           |
| 6th   | +3 | Ability Score Improvement                                                        | 3             | 11               | 65           |
| 7th   | +3 | Elite 1- Branch Feature, Advanced Operator Skill                                 | 4             | 12               | 65           |
| 8th   | +3 | Ability Score Improvement, Basic Talent Module                                   | 4             | 15               | 80           |
| 9th   | +4 | Advanced Talent                                                                  | 5             | 16               | 80           |
| 10th  | +4 | Ability Score Improvement                                                        | 5             | 17               | 95           |
| 11th  | +4 | Branch Feature                                                                   | 6             | 20               | 95           |
| 12th  | +4 | Ability Score Improvement, Resuscitation                                         | 6             | 21               | 110          |
| 13th  | +5 | Advanced Talent Mastery                                                          | 7             | 22               | 110          |
| 14th  | +5 | Elite 2- Elite Operator Skill                                                    | 7             | 25               | 125          |
| 15th  | +5 | Branch Feature                                                                   | 8             | 26               | 125          |
| 16th  | +5 | Ability Score Improvement                                                        | 8             | 27               | 140          |
| 17th  | +6 | 9th Level Arts                                                                   | 9             | 30               | 140          |
| 18th  | +6 | To Rob the Ferryman                                                              | 9             | 31               | 155          |
| 19th  | +6 | Ability Score Improvement                                                        | 9             | 32               | 155          |
| 20th  | +6 | Chosen of Asclepius                                                              | 9             | 35               | 170          |

### 1.4 Life Support Pool Mechanics (Ch. 3 L4647–4657)
- **Pool Max Formula**: Level 1 has 20. For levels 1–20, exact closed formula is:
  $$\text{Life Support} = 20 + 15 \times \lfloor \text{Level} / 2 \rfloor$$
- **Recovery**: Replenishes to maximum on Long Rest (Ch. 3 L4648). Short Rest provides zero recovery.
- **OverMax Support**: The pool allows exceeding maximum (e.g. Witchcraft's *Healing through Harm*, Ch. 3 L5104). On Long Rest, excess is removed via `toMax` recovery.
- **Touch Heal** (Ch. 3 L4650): `As an Action, you can touch a Creature and expend any amount of your current Life Support; the Creature recovers that many missing Hit Points.` (1:1 conversion).
  - Construct Restriction (Ch. 1 L138): `Creatures of the Construct Creature Type cannot restore Hit Points as a result of Healing Arts, Operator Skills, Class Features, or use of the Medicine Skill unless specified otherwise.`
- **Preserver** (Ch. 3 L4654): `When you roll dice to determine the Hit Points recovered by another Creature, or the Temporary Hit Points gained by another Creature, you can expend 5 Life Support to reroll any number of those dice; you must use the new results.`
- **Urgency of Treatment** (Ch. 3 L4656): `When you would cast an Art from your Healing Arts Pool, you can expend Life Support in multiples of 10 to reduce the Arts Point cost of that casting by 1 for every 10 Life Support expended, to a minimum of 0.`

### 1.5 Medical Expertise (Ch. 3 L4658–4660)
- `No matter the origin of your medical knowledge, you are adept at saving lives; you gain Expertise in the Medical Skill.`
- Effect: Double Proficiency Bonus applied to Wisdom (Medicine) checks.

### 1.6 Higher-Level Base Features
- **Self-Defence Protocol** (5th Level, Ch. 3 L4698–4702):
  - `choose one of the Standard Arts Pools available to the Caster Class that you have not chosen previously; you learn all of the Arts from that Pool of 5th Level or less, including Cantrips.`
  - Standard pools available: Corrosion, Crude, Earth, Electric, Flame, Fluid, Frost, Light, Psychic, Spatial, Wind (Ch. 5 L70–310).
  - Discount: `These Arts cost 1 fewer Arts Point to cast, to a minimum of 0. From 11th Level, these Arts instead cost 2 fewer Arts Points.`
- **Resuscitation** (12th Level, Ch. 3 L4709–4713):
  - `Once per Long Rest, you can cast the Revivify Art without expending any Arts Points.`
- **To Rob the Ferryman** (18th Level, Ch. 3 L4717–4719):
  - `When you revive someone using the Revivify Art, they recover Hit Points equal to three times your Medic Level.` (54 HP at 18th, 57 HP at 19th, 60 HP at 20th).
- **Chosen of Asclepius** (20th Level, Ch. 3 L4720–4722):
  - `Whenever you would roll to determine the amount of Hit Points you restore to a Creature, you can choose not to roll, and instead use the highest number possible for each die.`

### 1.7 Medic Branches (Subclasses) (Ch. 3 L4665–4672)
- Subclass is chosen at **1st Level** (`Elite 0`).
- Branch Features granted at **Levels 1, 4, 7, 11, and 15**.
- Five branches:
  1. **Physician** (Single target healing specialist, Intravenous Line, Hypocritic Oath, Surgeon-General; Ch. 3 L4871–4905)
  2. **Therapist** (Arts modification via Therapies; Ch. 3 L4921–5001)
  3. **Triage** (Multi-target emergency healing, On the Scene, Stop the Flow, Mobile Hospital; Ch. 3 L5011–5048)
  4. **Ward** (Damage prevention, Ward Temporary HP; Ch. 3 L5053–5094)
  5. **Witchcraft** (Offensive Arts blending, OverMax Life Support via Healing through Harm; Ch. 3 L5096–5159)

---

## 2. Logic Chain

1. **Chassis & Proficiencies**:
   - Source Ch. 3 L4588 specifies `Armor: Light Shields`. Unlike standard D&D5e spellcasters or AK5e classes that have `Light Armour, Shields`, Medic is explicitly restricted to `Light Shields` only (no armor proficiency whatsoever). This is corroborated by the Basic Talent *Armoured Caster* (Ch. 3 L4801), which specifically grants `Proficiency with Light Armour`.
   - Saving Throws (L4591) grant `Choose Two from the following: Constitution, Intelligence, Wisdom`. The implementation must support a 2-choice picker among these three ability scores during character setup.
   - Skills (L4592) automatically grants `Medicine` plus a picker of 2 from `Lore, Arts, Tech, Insight, Perception, Persuasion`. Combined with *Medical Expertise* (L4659), Medicine automatically acquires Expertise (double PB).

2. **Arts Casting & Progression**:
   - Medics cast via Arts Points (AP) rather than spell slots (Ch. 5 L50). The AP pool scales from 3 (Level 1) to 35 (Level 20).
   - Maximum Art Level follows $M = \min(9, \lceil \text{Level} / 2 \rceil)$. Medics reach 9th level Arts at Level 17.
   - Per Ch. 5 L56–58, a creature can only cast a single 9th-level Art per Long Rest regardless of available AP.
   - The Healing Arts pool is completely known and always prepared (Ch. 3 L4608).

3. **Life Support Resource Pool (`lifeSupport`)**:
   - The pool progression follows a step pattern: increases by +15 at every even level (2, 4, 6, 8, 10, 12, 14, 16, 18, 20) and stays unchanged at odd levels (3, 5, 7, 9, 11, 13, 15, 17, 19).
   - In `resource-pools.mjs`, this is modeled via a step dictionary or closed-form formula `20 + 15 * Math.floor(level / 2)`.
   - Recovery configuration: `{ on: "lr", amount: "toMax" }`. This satisfies standard replenishment while dropping any excess from OverMax effects (e.g. Witchcraft Ch. 3 L5104). Short Rest has no recovery.
   - Touch Heal converts Life Support 1:1 into restored HP as an Action. Under WORKFLOW §3.2, selecting a Construct target triggers a non-blocking warning citing Ch. 1 L138, which can be overridden with "Use anyway".

4. **Life Support Tactical Spends (Preserver & Urgency of Treatment)**:
   - In Chapter 3 source text, both *Preserver* (L4654) and *Urgency of Treatment* (L4656) are defined under `#### 1st Level: Life Support` as baseline expenditures of the Life Support pool.
   - *Preserver*: 5 LS to reroll dice rolled for another creature's healing or THP.
   - *Urgency of Treatment*: Multiples of 10 LS to reduce AP cost of Healing Arts casting by 1 per 10 LS (min 0).

5. **Self-Defence Protocol (Level 5 & Level 11 Upgrade)**:
   - Grants all Arts $\le 5\text{th}$ level (including cantrips) from one unchosen Standard Caster Arts pool.
   - Casting discount is 1 AP at Levels 5–10, upgrading to 2 AP at Level 11 (minimum 0 AP).
   - Cantrips (base 0 AP) remain 0 AP. 1st-level Arts (1 AP) cost 0 AP starting at Level 5. 2nd-level Arts (2 AP) cost 0 AP starting at Level 11.

6. **Revivify Interactions (Resuscitation & To Rob the Ferryman)**:
   - At Level 12, *Resuscitation* grants 1 free cast of *Revivify* per Long Rest without expending AP. Per Ch. 5 L36–37, material components (the 300 gp diamond) are never required in AK5e.
   - At Level 18, *To Rob the Ferryman* enhances *any* Revivify cast by the Medic: the revived target recovers $3 \times \text{Medic Level}$ HP (54–60 HP) instead of 1 HP.

7. **Chosen of Asclepius (Level 20)**:
   - Provides a toggleable replacement for all healing rolls: automatically maximizes all rolled dice ($X\text{d}Y \to X \times Y$).

---

## 3. Caveats

1. **Subclass-Specific Features**: This specification establishes the core Medic base class rules and progression. The two active subclasses (Physician and Triage) have distinct feature trees (Ch. 3 L4871–4905 and L5011–5048) that interact with the base Life Support pool; their exact implementation details are detailed in the Feature Inventory table below and covered by companion miners.
2. **Standard Arts Pools List**: Self-Defence Protocol allows selecting from any Standard Arts Pool available to the Caster class. In AK5e Ch. 5, these are: Corrosion, Crude, Earth, Electric, Flame, Fluid, Frost, Light, Psychic, Spatial, and Wind. Special pools (Healing, Banshee, Blood, Elven, Necrotic, Witchcraft) are excluded from this choice.
3. **No Feats for ASIs**: Per Ch. 1 L134–135, Medics cannot substitute ASIs for Feats. Progression must enforce standard ability score increments (+2 or +1/+1 up to 20).
4. **Construct Healing Exclusion**: Per Ch. 1 L138, all Healing Arts, Medic Class Features, Operator Skills, and Medicine skill checks cannot heal Constructs unless specifically stated otherwise.

---

## 4. Conclusion

The AK5e Medic base character class represents a full Arts-caster chassis designed around direct HP and status remediation, sustained by the unique `lifeSupport` resource pool (scaling 20 to 170). Its rules are completely and authoritatively documented in Chapter 3 (lines 4560–4870) and Chapter 5 (lines 415–435).

The class is fully ready for modular implementation across the project architecture:
- Pure functional calculations in `ak5e/scripts/medic-rules.mjs`
- Feature mechanics, resource pool registration, and hooks in `ak5e/scripts/medic-features.mjs`
- Preview and transactional setup in `ak5e/scripts/medic-setup.mjs`
- Idempotent Level 1–20 choice progression in `ak5e/scripts/medic-progression.mjs`
- Table-play confirmations, GM relays, shortfall clamping, and undo receipts in `ak5e/scripts/medic-uses.mjs`

---

## 5. Verification Method

To independently verify all claims, numbers, and references in this specification:
1. **Source Inspection**:
   - View `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` lines 4560–4870.
   - Confirm chassis numbers (HD 1d6, HP 6+CON, Light Shields only, saves, skills, equipment).
   - Confirm table values: Life Support (20 to 170), AP (3 to 35), Max Art Level (1 to 9).
2. **Construct Rule Inspection**:
   - View `AK5e_1.3.1_Foundry_Source/01_chapter_1_changing_the_game.txt` lines 137–138 to confirm the Construct healing prohibition.
3. **Healing Arts Inspection**:
   - View `AK5e_1.3.1_Foundry_Source/05_chapter_5_arts.txt` lines 415–435 for the full Healing Arts spell list.
4. **Existing Resource Pool Test Validation**:
   - Run `node --test ak5e/test/resource-pools.test.mjs` to verify existing tests for `lifeSupport` table steps, OverMax behavior, and Long Rest recovery.
5. **Compendium Consistency**:
   - Grep `class-medic` and `class-feature-medic` entries in `ak5e/scripts/chapter-three-content.mjs`.

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Chassis | Hit Dice & HP | 1d6 HD per level; Lv 1: 6 + CON mod; Lv 2+: 1d6 (or 4) + CON mod | Medic Level, CON mod | Max HP, Hit Dice pool | Reject level < 1 or > 20 | Ch. 3 L4583–4585 |
| 2 | Chassis | Armor Proficiency | Light Shields ONLY (No light, medium, or heavy armor) | Actor document | Armor proficiencies (`["shl"]`) | Flag invalid armor | Ch. 3 L4588 |
| 3 | Chassis | Weapon Proficiency | Light Melee weapons ONLY | Actor document | Weapon proficiencies (`["Light Melee"]`) | None | Ch. 3 L4589 |
| 4 | Chassis | Tool Proficiency | Choice of 1 Tool Kit or Vehicle proficiency | Player choice | Tool proficiency | Reject unselected tool | Ch. 3 L4590 |
| 5 | Chassis | Saving Throws | Choice of 2 from Constitution, Intelligence, Wisdom | Player choice (2 of 3) | Save proficiencies | Reject invalid count / duplicates | Ch. 3 L4591 |
| 6 | Chassis | Skill Proficiencies | Medicine (automatic) + Choice of 2 from Lore, Arts, Tech, Insight, Perception, Persuasion | Player choice (2 of 6) | Skill proficiencies | Reject unselected / duplicates | Ch. 3 L4592 |
| 7 | Chassis | Starting Equipment | (Light Melee or Light Shield) + (Arts Wand or Staff) + Tool Kit OR 1300 LMD | Equipment choice / cash | Inventory items or currency | Reject invalid package | Ch. 3 L4594–4603 |
| 8 | Arts Casting | Healing Arts Pool | Learns all Arts in Healing Arts Special Pool; always prepared | Healing Arts list | Known & prepared arts | Non-healing arts rejected | Ch. 3 L4608, Ch. 5 L415–435 |
| 9 | Arts Casting | Arts Points (AP) Pool | 3 to 35 AP scaling table; restores on Long Rest | Medic Level | AP max (3–35), current AP | Clamps at 0; short rest no restore | Ch. 3 L4622–4644 |
| 10 | Arts Casting | Max Art Level | 1st to 9th level scaling: $\min(9, \lceil\text{Lvl}/2\rceil)$; 9th level 1/LR limit | Medic Level | Max Art Level (1–9) | Block cast if Art level > Max | Ch. 3 L4612, Ch. 5 L56–58 |
| 11 | Arts Casting | Spellcasting Ability | Player chooses INT or WIS; determines Save DC & Spell Attack Mod | Ability choice (INT/WIS) | DC = 8+PB+mod, Attack = PB+mod | Reject non-INT/WIS choice | Ch. 3 L4614 |
| 12 | Resource Pool | Life Support Pool | Dedicated `lifeSupport` pool: $20 + 15 \times \lfloor\text{Lvl}/2\rfloor$ (20 to 170) | Medic Level | Pool max (20–170), value | Clamps at 0 on shortfall; OverMax allowed | Ch. 3 L4622–4648 |
| 13 | Resource Pool | Long Rest Recovery | Restores to maximum (`toMax`), dropping any OverMax excess | Long Rest trigger (`lr`) | Value = max | Short Rest provides no recovery | Ch. 3 L4648, Ch. 3 L5104 |
| 14 | Core Feature | Medical Expertise | Expertise (double Proficiency Bonus) on Medicine skill checks | Medicine check | Roll modifier (+2*PB) | None | Ch. 3 L4658–4660 |
| 15 | Core Feature | Touch Heal | Action: expend X Life Support to restore X missing HP (1:1) to touched creature | Target, LS amount ($X$) | Target HP +$X$, Pool -$X$ | Warn if target is Construct | Ch. 3 L4650, Ch. 1 L138 |
| 16 | Core Feature | Preserver | Reaction/trigger: spend 5 LS to reroll healing or THP dice for another creature | 5 Life Support, dice roll | Rerolled dice values | Target cannot be self; must use new | Ch. 3 L4654 |
| 17 | Core Feature | Urgency of Treatment | Spend multiples of 10 LS to reduce Healing Art AP cost by 1 per 10 LS (min 0 AP) | Multiples of 10 LS, Art | Reduced AP cost | Clamped at 0 AP; Healing pool only | Ch. 3 L4656 |
| 18 | Progression | Subclass Choice | Choose Medic Branch at 1st level (Physician, Therapist, Triage, Ward, Witchcraft) | Branch selection | Branch item & features | Require 1 valid branch | Ch. 3 L4665–4672 |
| 19 | Progression | Operator Skills | Grants Basic (Lv 2), Advanced (Lv 7), and Elite (Lv 14) skills | Operator skill choice | Learned skill item | Reject wrong skill tier | Ch. 3 L4678, L4703, L4714 |
| 20 | Progression | Talents | Basic Talent (Lv 3), Module (Lv 8), Advanced (Lv 9), Mastery (Lv 13) | Talent choice | Learned talent item | Reject invalid talent prerequisites | Ch. 3 L4681, L4706 |
| 21 | Progression | ASIs | +2 to one ability or +1 to two abilities at Levels 4, 6, 8, 10, 12, 16, 19 | Ability increments | Updated abilities (max 20) | No feat substitution allowed | Ch. 3 L4695, Ch. 1 L134–135 |
| 22 | Core Feature | Self-Defence Protocol | Learn Standard Arts Pool $\le 5\text{th}$ lvl; -1 AP (Lv 5) / -2 AP (Lv 11) discount (min 0) | Caster Standard Pool choice | Learned Arts, AP discount | Special pools ineligible | Ch. 3 L4698–4702 |
| 23 | Core Feature | Resuscitation | 1/Long Rest cast Revivify without expending Arts Points or material components | Revivify cast | Revives target at 0 AP cost | Exceeding 1/LR requires normal AP | Ch. 3 L4709–4713, Ch. 5 L36–37 |
| 24 | Core Feature | To Rob the Ferryman | Creature revived with Revivify recovers $3 \times \text{Medic Level}$ HP | Target revived via Revivify | Target HP = $3 \times \text{Lvl}$ | Only applies on Revivify | Ch. 3 L4717–4719 |
| 25 | Core Feature | Chosen of Asclepius | Optional toggle to use maximum possible die value on all healing rolls | Healing dice roll | Maximized roll total | Damage rolls ineligible | Ch. 3 L4720–4722 |
| 26 | Subclass (Physician) | Focused Treatment | Add PB to HP restored or damage dealt to a single creature | Healing/damage roll | Total + PB | Only applies to single target | Ch. 3 L4874–4875 |
| 27 | Subclass (Physician) | Intravenous Line | 10 LS Action: tune to creature within 15 ft for 10 min; CON save or 2d8 Necrotic; +1d6 (+2d6) | 10 LS, target | Tuned flag, +1d6/+2d6 | Unwilling save pass takes 2d8 Necrotic | Ch. 3 L4877–4885 |
| 28 | Subclass (Physician) | Hypocritic Oath | Convert healing roll to Necrotic damage: CON save vs Spell DC (half on success) | Healing roll, target | Necrotic damage roll | Save halves damage | Ch. 3 L4886–4892 |
| 29 | Subclass (Physician) | Healing Reverberations | Reaction on heal roll: spend 15 LS; target regains $\max(\lfloor\text{healed}/2\rfloor, 15)$ HP next turn | 15 LS, heal receipt | Scheduled turn-start heal | LS shortfall warns & clamps | Ch. 3 L4893–4897 |
| 30 | Subclass (Physician) | Surgeon-General | Double total HP restored to a single target via Life Support, Art, or Operator Skill | Single-target heal action | Doubled HP restored | Multi-target ineligible | Ch. 3 L4898–4900 |
| 31 | Subclass (Triage) | On the Scene | 10 LS Action: move Speed without AoO; up to PB creatures healed/harmed for 1d6+mod (2d6+mod) | 10 LS, movement path, targets | 1d6+mod heal or Melee Spell harm | Exceeding PB targets rejected | Ch. 3 L5014–5023 |
| 32 | Subclass (Triage) | Urgent Care Centre | Rolling healing to self with levelled Art washes out: others within 10 ft heal $\lfloor\text{roll}/2\rfloor$ | Self-heal levelled Art roll | 10-ft splash heal | Cantrips do not trigger | Ch. 3 L5025–5027 |
| 33 | Subclass (Triage) | Stop the Flow | 20 LS Action: touch Dying creature; immediately gains 6 Mettle (can exceed cap to 8) | 20 LS, dying target | +6 Mettle (cap 8) | Target must be Dying; max 1/dying | Ch. 3 L5032–5036 |
| 34 | Subclass (Triage) | Touch of Life and Death | Spend 10 LS on On the Scene: Heal ends condition $\le 1$ hr / pauses; Harm poisons 1 turn | 10 LS, On the Scene trigger | Condition clear or Poisoned | Non-On the Scene ineligible | Ch. 3 L5037–5041 |
| 35 | Subclass (Triage) | Mobile Hospital | 1/Long Rest Bonus Action: 30-ft aura for 1 min; heals 3d6 + mod HP on enter (1/round/creature) | 1/LR Bonus Action | Aura zone, 3d6+mod heal | Max 1 trigger per round per creature | Ch. 3 L5042–5046 |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Touch Heal | Target has Creature Type `Construct` | Per Ch. 1 L138, Constructs cannot be healed by Class Features. System displays warning: `"Constructs cannot regain Hit Points from class features"`. Under WORKFLOW §3.2, player can select `"Use anyway"`, clamping spend at 0 and posting a public shortfall/override notice to chat. |
| 2 | Life Support Pool | Spending more Life Support than current value | System prompts confirmation with shortfall warning. If overridden with `"Use anyway"`, pool clamps at 0, action executes with available or clamped resources, and shortfall is broadcast publicly on the chat card. |
| 3 | Life Support OverMax | Witchcraft *Healing through Harm* adds LS above max | Pool value increases beyond max (`overMax: true`). When a Long Rest is completed, recovery trigger `{ on: "lr", amount: "toMax" }` drops all excess Life Support back to the level maximum. Short rest leaves excess intact. |
| 4 | Preserver | Medic rolls healing dice for self | Preserver explicitly specifies: `"when you roll dice to determine the Hit Points recovered by another Creature"`. Self-healing rolls are ineligible and cannot trigger Preserver. |
| 5 | Preserver | Medic rolls Touch Heal (flat HP) | Touch Heal restores flat HP (1:1 conversion) without rolling dice. Preserver cannot be used because no dice were rolled. |
| 6 | Urgency of Treatment | Medic casts an Art from Self-Defence Protocol | Urgency of Treatment explicitly specifies: `"When you would cast an Art from your Healing Arts Pool"`. Non-Healing Arts (such as Fire or Earth arts from Self-Defence Protocol) cannot reduce AP cost via Urgency of Treatment. |
| 7 | Urgency of Treatment | Medic spends 20 LS on a 1st-level Art (cost 1 AP) | The AP cost is reduced by 1 per 10 LS down to a minimum of 0 AP. The cost cannot become negative. Interface should limit selectable spend to $\min(\text{LS}, 10 \times \text{AP cost})$. |
| 8 | Self-Defence Protocol | Medic casts a Cantrip from chosen Standard Pool | Cantrips have base AP cost 0. Applying the -1 AP discount clamps at minimum 0 AP. Cantrips remain 0 AP. |
| 9 | Self-Defence Protocol | Medic reaches Level 11 and casts a 2nd-level Art | Base cost is 2 AP. At Level 11, the discount is 2 AP. $2 - 2 = 0$ AP. The 2nd-level Art from this pool is cast for 0 AP. |
| 10 | Resuscitation | Casting Revivify without 300 gp diamonds | In standard 5e, Revivify requires 300 gp diamonds. In AK5e Ch. 5 L36–37, material components are completely eliminated for all Arts. Revivify requires only an equipped Casting Unit. |
| 11 | To Rob the Ferryman | Reviving a creature with normal AP Revivify (not Resuscitation) | Ch. 3 L4718 states: `"When you revive someone using the Revivify Art, they recover Hit Points equal to three times your Medic Level."` This applies to all casts of Revivify, regardless of whether cast via free Resuscitation or via standard AP. Target revives with 54 HP (at Lv 18) instead of 1 HP. |
| 12 | Chosen of Asclepius | Physician rolls damage with Intravenous Line | Intravenous Line adds 1d6/2d6 to damage or healing. Chosen of Asclepius specifies `"amount of Hit Points you restore to a Creature"`. When rolling damage, dice are rolled normally; when rolling healing, dice are maximized. |
| 13 | Stop the Flow (Triage) | Target creature is at 1 HP (not Dying) | Stop the Flow specifies: `"touch a Creature that is Dying"`. Targeting an conscious or stable creature displays a non-blocking prerequisite warning. |
| 14 | Stop the Flow (Triage) | Target creature already has 7 Mettle | Stop the Flow grants 6 Mettle up to a hard cap of 8. If creature had 7 Mettle, Mettle increases to 8 (clamped at 8). Once used, cannot be used on that creature again until they are no longer dying. |
| 15 | Idempotent Setup | Re-running Medic setup on an existing Level 5 Medic | Setup inspects `contextKey` and existing items. No duplicate class items, features, or spells are granted; existing authored customizations and HP values are preserved unchanged. |
