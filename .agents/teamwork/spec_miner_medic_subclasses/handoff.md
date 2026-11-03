# Medic Subclasses Specification Report: Physician & Triage

**Working Directory:** `/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_medic_subclasses/`  
**Authoritative Rules Source:** `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (Medic: L4560–4870, Physician: L4871–4905, Triage: L5011–5048), `AK5e_1.3.1_Foundry_Source/01_chapter_1_changing_the_game.txt` (Mettle: L50–78).  
**Compendium Data:** `ak5e/scripts/chapter-three-content.mjs` (L20550–20628 for Physician, L21006–21084 for Triage).  
**Design & Table-Play Authority:** `WORKFLOW.md` §3.2, `AGENTS.md`, `GEMINI.md`, `PROJECT.md`.

---

## 1. Observation

### 1.1 Direct Source Citations: Physician Subclass (Ch. 3 L4871–4905)
From `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`:

```text
4871: ### Physician
4872: Physicians are the most common of the diaspora of Medics, and for good reason; they reliably deliver potent, targeted aid, pulling their assigned charges back from the brink of death, while able to fight off those who would take advantage of their supposed vulnerability.
4873: 
4874: #### 1st Level: Focused Treatment
4875: Whenever you roll to determine the amount of Hit Points you restore, or the Damage you deal to only a single Creature, you may add your Proficiency Bonus to the amount restored or dealt. 
4876: 
4877: #### 4th Level: Intravenous Line
4878: You gain an additional way to use your Life Support Feature:
4879: 
4880: **Intravenous Line.** As an Action, you can expend 10 Life Support to choose a Creature you can see within 15 feet, and tune your Arts to that Creature's biorhythms for 10 minutes, or until you use this Feature again. An unwilling Creature must make a Constitution Saving Throw against your Spell Save DC, being affected by this feature on a failed Save, or taking 2d8 Necrotic Damage on a successful Save. 
4881: :
4882: While tuned to a Creature, you know the direction that Creature is in, and you can sense when it has less than half of its maximum Hit Points. In addition, once per Turn, when you deal Damage or restore Hit Points to that Creature, roll 1d6; the amount restored or dealt is increased by the amount rolled. 
4883: :
4884: This amount is increased to 2d6 at Level 7. 
4885: 
4886: #### 7th Level: Hypocritic Oath
4887: All medicine has at least two outcomes, depending on the dose.
4888: :
4889: When you roll to determine the Hit Points restored to a Creature, you may instead choose to harm them. That Creature must make a Constitution Saving Throw against your Spell Save DC; on a failed Save, they instead take Necrotic Damage equal to the amount of Hit Points they would have recovered. On a successful Save, they take half as much Necrotic Damage.
4890: :
4891: This Damage is still considered to be restoring Hit Points for the purpose of any Features that require it. 
4892: 
4893: #### 11th Level: Inpatient Care
4894: You gain an additional way to use your Life Support Feature:
4895: 
4896: **Healing Reverberations.** As a Reaction when you roll to determine Hit Points restored to a Creature, you can expend 15 Life Support. At the beginning of your next Turn, that Creature recovers Hit Points equal to half of the amount they recovered from the triggering instance, or 15 Hit Points; whichever is greater. 
4897: 
4898: #### 15th Level: Surgeon-General
4899: When you restore Hit Points to a single Creature using your Life Support Feature, an Art, or an Operator Skill, the amount of Hit Points you restore is doubled.
```

### 1.2 Direct Source Citations: Triage Subclass (Ch. 3 L5011–5048)
From `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`:

```text
5011: ### Triage
5012: All Medics specialise in saving lives, of course, but for Triage Medics, it is their primary and foremost concern. Their role is not to nurse a patient back to full health, but to save their life and move on to the next wounded.
5013: 
5014: #### 1st Level: Rapid Response
5015: You gain an additional way to use your Life Support Feature:
5016: 
5017: **On the Scene.** As an Action, you can expend 10 Life Support to move up to your Speed without provoking Opportunity Attacks. After you finish this movement, choose a number of other Creatures equal to your Proficiency Bonus that you moved within 5 feet of during this movement (you can only choose each Creature once per use of this Feature), and apply one of the following effects:
5018: - **Heal.** Restore a number of Hit Points to that Creature equal to 1d6 + your Spellcasting Ability Modifier.
5019: - **Harm.** Make a Melee Spell Attack against that Creature as if they were within your Reach; on a hit, that Creature takes Necrotic Damage equal to 1d6 + your Spellcasting Ability Modifier.
5020: 
5021: {{align-text:left
5022: The amount of Hit Points recovered and Necrotic Damage dealt is increased to 2d6 + your Spellcasting Ability Modifier at 7th Level. 
5023: }}
5024: 
5025: #### 4th Level: Urgent Care Centre
5026: When the wounded are all around you, you are exactly where you need to be. When you roll to restore Hit Points to yourself with a levelled Art, you can can cause your medical arts to wash out from you in a wave; all other Creatures within 10 feet of you recover Hit Points equal to half of the amount rolled.
5027: 
5032: #### 7th Level: Emergency Medicine
5033: You gain an additional way to use your Life Support Feature:
5034: 
5035: **Stop the Flow.** As an Action, you can expend 20 Life Support and touch a Creature that is **Dying.** That Creature immediately gains 6 Mettle; this Mettle gain allows them to temporarily exceed the maximum Mettle of 6, to a maximum of 8. Once a Creature has been the target of this Feature, this Feature cannot be used on them again until they are no longer **Dying**.
5036: 
5037: #### 11th Level: Touch of Life and Death
5038: Your phantasmagoric hands can snatch life and preserve it with the same gentle caress. When you deal Damage or restore Hit Points to a Creature as a result of your On the Scene Feature, you can expend 10 Life Support (no Action required) to cause an additional effect.
5039: - **Heal.** You can end a Condition with a duration of 1 hour or less on that Creature; if the Duration is greater than 1 hour, it is instead paused for 1 hour.
5040: - **Harm.** That Creature is Poisoned until the beginning of your next Turn.
5041: 
5042: #### 15th Level: Mobile Hospital
5043: Your mere presence is enough to ward off death. 
5044: :
5045: Once per Long Rest, you may activate this Feature as a Bonus Action. For the next minute, your project an aura in a 30-foot radius; the aura moves with you, and is centred on you. When a Creature enters the aura, or the aura enters a Creature's space, you can restore Hit Points to that Creature equal to 3d6 + your Spellcasting Ability Modifier (no Action required). Once you have restored Hit Points to a Creature in this way, they cannot benefit from this Feature again until the beginning of your next Turn.
```

### 1.3 Direct Source Citations: Mettle & Dying Rules (Ch. 1 L50–78)
From `AK5e_1.3.1_Foundry_Source/01_chapter_1_changing_the_game.txt`:

```text
50: When a Creature that can make Death Saving Throws is reduced to 0 Hit Points, they do not fall Unconscious, and instead enter the **Dying** state...
54: Mettle is the "currency" required to act in the **Dying** state, spent on Death's Door Actions. It can only be gained by a Creature who is **Dying**, and is lost when that Creature is no longer **Dying.** The maximum Mettle a Creature can have is six.
70: A **Dying** Creature does not act normally during its Turn. Instead, it takes Death's Door Actions by expending Mettle; these Actions all do not require any Action, and so can performed as many times in a Creature's Turn as wanted...
72: - **Lash Out (1 Mettle).** You make a single Attack.
74: - **Stagger Away (1 Mettle).** You move up to half your Speed.
76: - **Take Action (2 Mettle).** You take an Action or Bonus Action that would normally be available to you.
78: - **Stabilise (6 Mettle).** You settle the injury enough to live another day. At the beginning of your next Turn, you do not need to make a Death Saving Throw, you leave the **Dying** state, and if you have 0 Hit Points, you regain 1 Hit Point.
```

### 1.4 Direct Compendium IDs from `chapter-three-content.mjs`
- Physician:
  - Subclass item: `subclass-medic-physician` (L20550, identifier: `"physician"`, classIdentifier: `"medic"`)
  - 1st Level: `subclass-feature-medic-physician-1st-level-focused-treatment-287` (L20565)
  - 4th Level: `subclass-feature-medic-physician-4th-level-intravenous-line-510` (L20578)
  - 7th Level: `subclass-feature-medic-physician-7th-level-hypocritic-oath-1370` (L20591)
  - 11th Level: `subclass-feature-medic-physician-11th-level-inpatient-care-1937` (L20604)
  - 15th Level: `subclass-feature-medic-physician-15th-level-surgeon-general-2352` (L20617)
- Triage:
  - Subclass item: `subclass-medic-triage` (L21006, identifier: `"triage"`, classIdentifier: `"medic"`)
  - 1st Level: `subclass-feature-medic-triage-1st-level-rapid-response-241` (L21021)
  - 4th Level: `subclass-feature-medic-triage-4th-level-urgent-care-centre-1178` (L21034)
  - 7th Level: `subclass-feature-medic-triage-7th-level-emergency-medicine-1678` (L21047)
  - 11th Level: `subclass-feature-medic-triage-11th-level-touch-of-life-and-death-2148` (L21060)
  - 15th Level: `subclass-feature-medic-triage-15th-level-mobile-hospital-2697` (L21073)

---

## 2. Logic Chain

### 2.1 Subclass Identification & Progression Model
1. **Identification Predicates:**
   - Following established class conventions (`isDuellist`, `isBrawler`, `isArtshield`), the identification helpers must be:
     - `isPhysician(actor)`: `Boolean(medicEnabled(actor) && medicBranch(actor) === "physician")`
     - `isTriage(actor)`: `Boolean(medicEnabled(actor) && medicBranch(actor) === "triage")`
   - These check the active class progression and embedded `subclass-medic-physician` / `subclass-medic-triage` items.
2. **Subclass Level Steps:**
   - Both subclasses gain features at levels 1, 4, 7, 11, and 15 (Ch. 3 L4620–4644 and L4666).
   - Setup and progression generators must idempotently grant the corresponding compendium items at each milestone.

### 2.2 Physician Mechanical Architecture
1. **Focused Treatment (1st Level):**
   - Pure modifier hook on rolling damage or healing dice.
   - Filter criteria:
     * Only applies when *rolling* to determine HP restored or damage dealt (does NOT apply to flat amounts without a roll, such as base Touch Heal).
     * Only applies if the roll affects *only a single Creature*.
   - Value: `+PB` added to the total rolled amount.
   - Player agency: "you may add", so UI dialogs or roll card buttons must permit enabling/disabling the bonus.
2. **Intravenous Line (4th Level):**
   - Active ability using Life Support: Action, 10 LS cost, range 15 ft.
   - Unwilling target branch: CON save vs Spell Save DC (`8 + PB + spellcastingAbilityMod`).
     * Success: takes 2d8 Necrotic damage (interactive damage roll on chat card).
     * Failure: becomes tuned.
   - Willing target branch: becomes tuned immediately without a save.
   - Tuned state:
     * Exclusivity: Only 1 creature can be tuned at a time; tuning a new creature ends previous tuning.
     * Duration: 10 minutes (600 seconds) or until used again.
     * Passive sensors: direction known; detects when target is < 50% max HP.
     * Numerical rider: Once per turn, when dealing damage or restoring HP to that tuned creature, add 1d6 (upgraded to 2d6 at 7th level).
3. **Hypocritic Oath (7th Level):**
   - Modifier on rolling healing for any creature.
   - Inversion: instead of healing, deals Necrotic damage.
   - Target makes CON save vs Spell Save DC:
     * Failure: takes Necrotic damage equal to 100% of the rolled healing.
     * Success: takes Necrotic damage equal to 50% (`floor(damage / 2)`).
   - Recursive trigger rule: "This Damage is still considered to be restoring Hit Points for the purpose of any Features that require it."
     * Triggers Focused Treatment (adds PB).
     * Triggers Intravenous Line (+2d6 bonus).
     * Compatible with Surgeon-General at 15th level.
4. **Inpatient Care / Healing Reverberations (11th Level):**
   - Reaction ability triggered when rolling HP restored to a creature.
   - Cost: 15 Life Support + Reaction.
   - Delayed resolution: At the start of the Medic's next turn, target recovers HP equal to `max(Math.floor(triggeringHeal / 2), 15)`.
   - Requires queueing a pending reverberation record under `flags.ak5e.physician.pendingReverberations`.
5. **Surgeon-General (15th Level):**
   - Passive multiplier: doubles total HP restored when healing a single creature via Life Support, an Art, or an Operator Skill.
   - Touch Heal: spend X LS -> heals `2 * X` HP.
   - Single-target Art: heals `2 * (baseRoll + mods)`.
   - Single-target Operator Skill (e.g., Emergency Aid, Empathic Rejuvenation): heals `2 * (base + mods)`.

### 2.3 Triage Mechanical Architecture
1. **Rapid Response / On the Scene (1st Level):**
   - Active ability: Action, 10 LS cost.
   - Free movement: move up to Speed without provoking Opportunity Attacks.
   - Target selection: after movement, choose up to `PB` other creatures moved within 5 ft of during that movement.
   - Modalities (chosen per target):
     * Heal: restore `1d6 + mod` HP (scales to `2d6 + mod` at 7th level).
     * Harm: Melee Spell Attack (`d20 + PB + mod` vs AC); on hit, deals `1d6 + mod` Necrotic damage (scales to `2d6 + mod` at 7th level).
2. **Urgent Care Centre (4th Level):**
   - Reactive wave when rolling HP restored to *self* with a *levelled Art* (Arts level >= 1).
   - Wave area: 10 ft radius centered on Medic.
   - Effect: all other creatures within 10 ft recover `Math.floor(amountRolled / 2)` HP.
3. **Emergency Medicine / Stop the Flow (7th Level):**
   - Active ability: Action, 20 LS cost, range Touch (5 ft).
   - Prerequisite check: Target must be in the **Dying** state (0 HP).
   - Re-use lock: Target cannot have received Stop the Flow while in the current Dying instance.
   - Mettle grant: Target gains 6 Mettle immediately, temporarily bypassing the standard 6-Mettle ceiling up to a hard cap of 8.
   - Enables target to immediately afford Stabilise (cost 6) on their turn.
4. **Touch of Life and Death (11th Level):**
   - Free rider when dealing damage or restoring HP via On the Scene.
   - Cost: 10 LS per target affected.
   - Modalities:
     * Heal: End a condition with duration <= 1 hour (3600s); if duration > 1 hour, pause condition for 1 hour.
     * Harm: Target gains `Poisoned` condition until the beginning of the Medic's next turn.
5. **Mobile Hospital (15th Level):**
   - Active ability: Bonus Action, 1/Long Rest.
   - Duration: 1 minute (10 rounds / 60 seconds).
   - Aura: 30 ft radius centered on Medic, moving with Medic.
   - Trigger: when a creature enters the aura or the aura enters a creature's space.
   - Benefit: restore `3d6 + mod` HP (no action).
   - Frequency per creature: once per round, resetting at the beginning of the *Medic's* next turn.

### 2.4 Table-Play Philosophy & WORKFLOW §3.2 Compliance
1. **No Auto-Rolled Dice:**
   - Damage, healing, attack, and saving throw dice are never automatically calculated.
   - Chat cards render interactive buttons for:
     * Saving throws (CON saves for Intravenous Line, Hypocritic Oath).
     * Attack rolls (Melee Spell Attack for On the Scene Harm).
     * Damage rolls (Intravenous Line 2d8 save damage, On the Scene harm 1d6/2d6 necrotic, Hypocritic Oath damage).
     * Healing rolls (On the Scene heal 1d6/2d6, Mobile Hospital 3d6+mod).
2. **Confirmation Dialogs:**
   - Every active command (`intravenousLine`, `onTheScene`, `stopTheFlow`, `healingReverberations`, `mobileHospital`) prompts the player with costs, targets, and prerequisite checks.
   - Cancelling dialog commits zero writes.
3. **Non-Blocking Warnings & Clamping:**
   - Range, Dying state, and Life Support shortfalls display clear warnings with a "Use anyway" checkbox.
   - Shortfall overrides clamp pools at 0 and broadcast the shortfall publicly on the resulting chat card.
4. **Automatic GM Relay:**
   - Updates to unowned tokens (HP healing/damage, Mettle changes, condition additions/removals) automatically route through the active GM socket without modal approval gates.
5. **Encounter-Window Undo Receipts:**
   - Every operation records a complete receipt in `flags.ak5e.medicUses`:
     * Reverts spent Life Support.
     * Reverts target HP changes.
     * Reverts target Mettle changes (Stop the Flow).
     * Reverts applied/removed conditions (Poisoned, Tuned, ended/paused conditions).
     * Reverts reaction and 1/LR usage.

---

## 3. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Physician (1st) | Focused Treatment | Add PB to HP restored or damage dealt when rolling for only a single creature | Actor PB, roll instance, single target flag | +PB to rolled total | Disabled if multi-target or no roll | Ch. 3 L4874–4875 |
| 2 | Physician (4th) | Intravenous Line | Tune to a creature within 15 ft for 10 min (Action, 10 LS). Unwilling makes CON save (failure = tuned; success = 2d8 Necrotic damage). While tuned: sense direction, sense <50% HP, +1d6 (scales to +2d6 at 7th) to heal/damage once/turn | Target UUID, 10 LS, willing/unwilling toggle | Tuned effect, directional sense, +1d6/+2d6 roll bonus, or 2d8 Necrotic on save | Warns on range >15ft, shortfall clamps at 0 on override | Ch. 3 L4877–4885 |
| 3 | Physician (7th) | Hypocritic Oath | When rolling HP restored, choose to harm target. Target makes CON save vs DC; takes Necrotic damage equal to rolled healing (failure) or half (success). Counts as restoring HP for triggers | Target UUID, rolled healing, CON save roll | Necrotic damage card (full or half) | Standard save DC calculation; aborts if healing cancelled | Ch. 3 L4886–4892 |
| 4 | Physician (11th) | Inpatient Care / Healing Reverberations | Reaction when rolling HP restored; expend 15 LS. At start of Medic's next turn, target recovers max(floor(healed/2), 15) HP | Triggering healed HP, 15 LS, 1 reaction | Pending reverberation flag, turn-start heal card | Warns on missing reaction or LS shortfall | Ch. 3 L4893–4897 |
| 5 | Physician (15th) | Surgeon-General | Double total HP restored when healing a single creature using Life Support, an Art, or an Operator Skill | Restored HP amount, source type (LS/Art/Skill), single target flag | 2x total restored HP | Does not apply if targeting multiple creatures or non-qualifying source | Ch. 3 L4898–4900 |
| 6 | Triage (1st) | Rapid Response / On the Scene | Action, 10 LS: move up to Speed without AoO. Choose up to PB other creatures moved within 5 ft: Heal (1d6+mod HP) or Harm (Melee Spell Attack, 1d6+mod Necrotic). Upgrades to 2d6+mod at 7th | 10 LS, movement, up to PB targets, mode per target (Heal/Harm) | Chat card with interactive roll/attack/damage buttons | Warns on >PB targets, target not within 5ft, or LS shortfall | Ch. 3 L5014–5023 |
| 7 | Triage (4th) | Urgent Care Centre | When rolling HP restored to self with a levelled Art, all other creatures within 10 ft recover floor(rolled/2) HP | Levelled Art healing roll, tokens within 10 ft | Wave heal applied to other creatures in radius | Does not trigger on cantrips or flat non-rolled healing | Ch. 3 L5025–5027 |
| 8 | Triage (7th) | Emergency Medicine / Stop the Flow | Action, 20 LS: touch Dying creature. Target immediately gains 6 Mettle (can exceed max 6 up to hard cap 8). Target cannot be affected again until no longer Dying | Target UUID, 20 LS | Target Mettle +6 (clamped at 8), re-use lock flag | Warns if target not Dying, range >5ft, already used, or LS shortfall | Ch. 3 L5032–5036 |
| 9 | Triage (11th) | Touch of Life and Death | Rider on On the Scene: expend 10 LS per target (no action). Heal: end condition <=1 hr (pause 1 hr if >1 hr). Harm: target Poisoned until Medic's next turn start | On the Scene trigger, 10 LS, target mode | Condition removed/paused or Poisoned status added | Warns on LS shortfall; pauses if duration > 3600s | Ch. 3 L5037–5041 |
| 10 | Triage (15th) | Mobile Hospital | Bonus Action, 1/Long Rest: 30-ft radius aura for 1 minute. When creature enters aura or aura enters creature's space, restore 3d6+mod HP (max 1/round per creature, resets Medic's turn start) | 1/LR usage, 30-ft aura template/flag | Interactive 3d6+mod heal card per eligible creature | Warns if 1/LR used; blocks repeat heal on same creature before turn start | Ch. 3 L5042–5046 |

---

## 4. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Focused Treatment | Multi-target heal/damage spell (e.g. Mass Cure Wounds) | Feature does NOT apply if more than one creature is affected. If cast such that only 1 creature is in the area/targeted, PB is added. |
| 2 | Focused Treatment + Touch Heal | Base Medic Touch Heal (flat spend X LS -> X HP) | Touch Heal has no roll; Focused Treatment specifies "Whenever you roll to determine...". Focused Treatment does not add PB to flat Touch Heal. |
| 3 | Focused Treatment + Hypocritic Oath | Healing roll converted to Necrotic damage against single creature | Hypocritic Oath explicitly counts as restoring HP for feature triggers, AND deals damage to a single creature. Focused Treatment adds PB to the base roll before save halving. |
| 4 | Focused Treatment + Intravenous Line | Damage/healing roll against tuned single creature | The base roll gains PB, and the once-per-turn 1d6/2d6 rider adds to the roll. PB is added once to the instance total, not twice. |
| 5 | Intravenous Line | Tuning a second creature while already tuned to creature A | Creature A's tuning immediately terminates; only one creature can be tuned at a time ("until you use this Feature again"). |
| 6 | Intravenous Line | Unwilling creature succeeds on CON save | Target takes 2d8 Necrotic damage (clickable roll button on card) and is NOT tuned. Target unowned HP change relays via GM. |
| 7 | Hypocritic Oath | Target creature makes successful CON save | Target takes floor(rolled_healing / 2) Necrotic damage instead of full. |
| 8 | Hypocritic Oath + Healing Reverberations | Hypocritic Oath used to harm target; Medic reactions with Inpatient Care | Healing Reverberations triggers ("when you roll to determine Hit Points restored... This Damage is still considered to be restoring Hit Points"). At Medic's next turn start, target recovers max(floor(harm / 2), 15) HP. |
| 9 | Inpatient Care | Triggering heal is small (e.g. 8 HP) | Delayed heal computes `max(floor(8/2), 15) = max(4, 15) = 15 HP`. Target recovers 15 HP. |
| 10 | Inpatient Care | Medic drops unconscious/dying before next turn | The reverberation was already paid and scheduled; at the start of the Medic's turn in initiative, the healing resolves regardless of Medic consciousness. |
| 11 | Surgeon-General + Touch Heal | Spend 25 Life Support on Touch Heal on single creature | Touch Heal is a use of the Life Support feature on a single creature. Total HP restored is doubled from 25 to 50 HP (1:2 ratio). |
| 12 | Surgeon-General + Multi-Target Art | Cast Art affecting 2+ creatures | Surgeon-General specifies "restore Hit Points to a single Creature". Multi-target healing is NOT doubled. |
| 13 | Surgeon-General + Inpatient Care | Healing Reverberations resolves on single creature | Resolves from Life Support on a single creature. The triggering heal was doubled, and the secondary echo delivers `max(floor(healed / 2), 15)`. If treated as an independent LS heal, doubles the echo; standard reading treats it as echoing the already-doubled instance. |
| 14 | On the Scene | Medic selects self as one of the PB targets | Disallowed: source text states "choose a number of other Creatures". Medic cannot target self with On the Scene. |
| 15 | On the Scene | Medic moves within 5 ft of same creature multiple times during move | Disallowed: "you can only choose each Creature once per use of this Feature". |
| 16 | Urgent Care Centre | Medic casts Cantrip that restores HP to self | Disallowed: source requires a "levelled Art" (level >= 1). Cantrips do not trigger Urgent Care Centre. |
| 17 | Urgent Care Centre | Medic heals self and ally with a levelled Art | Allowed: feature triggers "When you roll to restore Hit Points to yourself with a levelled Art". The 10-ft wave washes out to all other creatures regardless. |
| 18 | Urgent Care Centre | Hostile creatures within 10 ft of Medic | Source text states "all other Creatures within 10 feet". UI must present detected creatures with checkboxes (defaulting to allies) so the GM/player can include/exclude per table ruling. |
| 19 | Stop the Flow | Target is at 0 HP but already stabilized | If target is 0 HP and not yet conscious, they are Dying until they leave the state (regain 1+ HP). If target is already at 1+ HP, Stop the Flow is invalid (warns non-blocking). |
| 20 | Stop the Flow | Target already has 2 Mettle before Stop the Flow | Target gains 6 Mettle: `2 + 6 = 8 Mettle` (hits the hard cap of 8). |
| 21 | Stop the Flow | Target already has 4 Mettle before Stop the Flow | Target gains 6 Mettle: `4 + 6 = 10`, but clamped at hard cap of 8. Target has 8 Mettle. |
| 22 | Stop the Flow | Target receives Stop the Flow, spends Mettle, remains Dying, Medic tries Stop the Flow again | Disallowed: "Once a Creature has been the target of this Feature, this Feature cannot be used on them again until they are no longer Dying." Target cannot be targeted again until Dying state ends. |
| 23 | Touch of Life and Death | Healed target has condition with duration of 1 minute | 1 minute <= 1 hour (3600s): condition is ENDED (removed from actor). |
| 24 | Touch of Life and Death | Healed target has condition with duration of 8 hours | 8 hours > 1 hour: condition is PAUSED for 1 hour (suppressed with a 1-hour resume timer). |
| 25 | Touch of Life and Death | Harmed target takes Necrotic damage and Touch rider | Target gains `Poisoned` status condition with expiration set to the beginning of the Medic's next turn. |
| 26 | Mobile Hospital | Ally enters aura, exits, and re-enters in same round | Benefited creature flag prevents receiving healing a second time before the beginning of the Medic's next turn. |
| 27 | Mobile Hospital | Medic moves through 3 allies during Medic's turn | Aura enters each ally's space: each ally triggers `3d6 + mod` healing once. |
| 28 | Resource Shortfall (Any Feature) | Medic has 4 Life Support, activates Intravenous Line (costs 10) | Confirmation dialog warns "Insufficient Life Support: requires 10, current 4". Checking "Use anyway" spends remaining 4 LS, clamps pool at 0, broadcasts public shortfall card, and executes action. |
| 29 | Encounter-Window Undo | Medic undoes On the Scene that healed 2 allies and harmed 1 enemy | Single undo operation cleanly reverts: 10 LS refunded, 2 allies have healed HP subtracted, 1 enemy has damage removed, any conditions added/removed by Touch of Life and Death reverted. |

---

## 5. Caveats

1. **Subclass Exclusivity:** Under AK5e Chapter 3 rules (L4666), a Medic chooses one Branch at 1st level (e.g. Physician or Triage). Cross-subclass interactions (such as Surgeon-General doubling an On the Scene heal) will not occur on standard single-class characters; however, the engine should evaluate features modularly so homebrew, multiclass, or dual-branch test actors resolve interactions cleanly.
2. **Urgent Care Centre Friend/Foe Distinction:** The RAW source text says "all other Creatures within 10 feet of you recover Hit Points equal to half of the amount rolled." In tabletop play, Medics rarely want to heal adjacent hostile enemies. The implementation dialog should detect all creatures within 10 ft and present a pre-checked list of friendly/neutral tokens, allowing the player to deselect hostiles unless the GM strictly enforces indiscriminate healing.
3. **Condition Pausing Implementation:** Foundry V13 does not have a native "pause active effect" method. The implementation should store `flags.ak5e.pausedCondition = { originalData, resumeAt }` on the target actor and temporarily disable the ActiveEffect, with a timer/hook restoring it after 1 hour.
4. **Surgeon-General + Inpatient Care Doubling Interpretation:** As noted in Edge Case #13, Inpatient Care reverberation heals half the triggering amount. If the triggering amount was already doubled by Surgeon-General on Turn 1 (e.g., 30 -> 60), half is 30. If Surgeon-General also doubles the reverberation on Turn 2, it becomes 60 again. The recommended rule interpretation is that Surgeon-General doubles the *triggering heal*, and the reverberation delivers `max(floor(healed / 2), 15)` based on the actually recovered HP, without double-compounding.

---

## 6. Conclusion

The specification for the **Physician** and **Triage** Medic subclasses is thoroughly documented and grounded in verbatim Chapter 3 rules and Chapter 1 Mettle rules.

- **Physician** is a high-precision, single-target specialist providing:
  * Scaled healing/damage rolls (+PB via Focused Treatment at 1st level).
  * Long-duration biorhythm tethering (Intravenous Line at 4th level, 10 LS, 15 ft range, direction/<50% HP sensing, +1d6/+2d6 bonus, or 2d8 Necrotic damage on save).
  * Healing-to-harm inversion (Hypocritic Oath at 7th level, CON save for full/half damage, retains healing-trigger status).
  * Delayed secondary care (Inpatient Care / Healing Reverberations at 11th level, Reaction, 15 LS, `max(floor(healed/2), 15)` at next turn start).
  * Multiplied potency (Surgeon-General at 15th level, 2x HP restored on single creature via Life Support/Art/Skill).
- **Triage** is a high-mobility, multi-target crisis manager providing:
  * Dash-and-treat field mobility (On the Scene at 1st level, Action, 10 LS, no AoO, heals or harms up to PB targets within 5 ft for `1d6+mod` / `2d6+mod`).
  * Emitted splash healing (Urgent Care Centre at 4th level, 10-ft wave of `floor(rolled/2)` when healing self with a levelled Art).
  * Dying threshold intervention (Stop the Flow at 7th level, Action, 20 LS, grants 6 Mettle immediately and raises maximum Mettle ceiling to 8 for a Dying creature).
  * Condition manipulation rider (Touch of Life and Death at 11th level, 10 LS rider on On the Scene, ends <=1 hr / pauses >1 hr condition on heal, inflicts Poisoned on harm).
  * Mobile restorative aura (Mobile Hospital at 15th level, Bonus Action, 1/LR, 30-ft aura for 1 min, `3d6+mod` HP once/round per creature).

Both subclasses integrate fully into `ak5e` architecture:
- Exposed on `medicUses` via `createPlayUses({ ns: "medicUses" })`.
- Registered under `flags.ak5e.medicUses`.
- Strict WORKFLOW §3.2 adherence: interactive roll buttons, confirm-before-use, warnings with "Use anyway", automatic GM socket relay for unowned targets, and encounter-window undo receipts.

---

## 7. Verification Method

### 7.1 Static Code & Schema Verification
Once implementation begins, verify that all files conform to module standards:
```bash
node ak5e/tools/validate-files.mjs
node ak5e/tools/verify-generated-content.mjs
```

### 7.2 Subclass Unit Test Suite Requirements
Author dedicated test suites (e.g. `ak5e/test/physician.test.mjs` and `ak5e/test/triage.test.mjs`):
1. **Physician Suite (`physician.test.mjs`):**
   - Verify `isPhysician(actor)` returns true only for Physician Medics.
   - Test Focused Treatment: confirms PB is added to single-target damage/heal rolls, and NOT added to multi-target rolls or flat values.
   - Test Intravenous Line: confirms 10 LS spend, willing/unwilling branches, CON save resolution (save = 2d8 Necrotic damage; fail = tuned status), +1d6 (lvl 4) and +2d6 (lvl 7) bonus once per turn, direction and <50% HP sensing.
   - Test Hypocritic Oath: verifies healing converted to Necrotic damage, CON save (fail = 100%, pass = 50%), and confirms it triggers features requiring HP restoration.
   - Test Inpatient Care: verifies Reaction + 15 LS spend, delayed turn-start calculation `max(floor(healed / 2), 15)`, and turn-start delivery.
   - Test Surgeon-General: verifies 2x multiplier on Touch Heal (1:2 LS-to-HP), single-target Arts, and single-target Operator Skills.
   - Test Undo: verifies all spent resources, damage, and tuning flags cleanly revert.
2. **Triage Suite (`triage.test.mjs`):**
   - Verify `isTriage(actor)` returns true only for Triage Medics.
   - Test On the Scene: verifies 10 LS spend, up to PB targets moved within 5 ft, Heal (`1d6+mod` / `2d6+mod`) and Harm (Melee Spell Attack + `1d6+mod` / `2d6+mod` Necrotic), no AoO.
   - Test Urgent Care Centre: verifies 10 ft wave of `floor(rolled/2)` triggers on self-healing levelled Art, and fails on cantrips.
   - Test Stop the Flow: verifies 20 LS spend, Dying status gate, +6 Mettle grant allowing Mettle up to 8, and re-use lock while Dying.
   - Test Touch of Life and Death: verifies 10 LS spend rider, condition end (<=1 hr), condition pause (>1 hr), and Poisoned condition application.
   - Test Mobile Hospital: verifies 1/LR Bonus Action activation, 30 ft aura duration 1 min, `3d6+mod` HP per creature, and once/round per creature limit resetting on Medic turn start.
   - Test Undo: verifies multi-target heals, harms, mettle, conditions, and LS cleanly revert within the encounter window.

### 7.3 Live In-Foundry Browser Verification
Exercise Medic, Physician, and Triage on a clean Foundry V13 test world:
```bash
export AK5E_FOUNDRY_PATH=/home/patch/FoundryV13
export AK5E_TEST_DATA=/tmp/test-medic-instance
export AK5E_TEST_PORT=30175
export AK5E_TEST_OUTPUT=/tmp/test-medic-evidence
export AK5E_PLAYWRIGHT=/home/patch/AK5e-Foundry/node_modules/playwright/index.mjs
# Execute test script via launchTestBrowser() with standard process traps
```
Verify `report.errors.length === 0`, inspect rendered sheets, dialogs, chat cards, and undo receipts.
