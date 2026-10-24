## 2026-10-13T04:01:16Z

You are the Medic Subclasses Spec Miner.
Your assigned working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_medic_subclasses/

MANDATORY INPUTS:
- Read /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (under section ## Follow-up — 2026-10-13T03:54:12Z)
- Read /home/patch/AK5e-Foundry/PROJECT.md
- Read /home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (Physician: lines 4871–4905, Triage: lines 5011–5048)

YOUR OBJECTIVE:
Perform a comprehensive, read-only extraction and specification of the Physician and Triage Medic subclasses from Chapter 3:
1. Physician Subclass:
   - Identification (`isPhysician(actor)`) and theme.
   - Focused Treatment (1st lvl): Add PB to HP restored or damage dealt to a single creature.
   - Intravenous Line (4th lvl): 10 Life Support Action to tune to a creature within 15 ft for 10 minutes. Unwilling creature makes CON save vs Spell Save DC (failure = tuned, success = 2d8 Necrotic damage). While tuned: sense direction, sense when <50% max HP, once/turn add 1d6 (+2d6 at 7th level) to damage dealt or HP restored to that creature.
   - Hypocritic Oath (7th lvl): When rolling to determine HP restored, choose to harm instead. CON save vs DC; takes Necrotic damage equal to rolled healing on failure, or half on success. Counted as restoring HP for feature trigger purposes.
   - Inpatient Care / Healing Reverberations (11th lvl): Reaction on rolling HP restored to a creature; expend 15 Life Support. At start of Medic's next turn, target recovers HP equal to max(floor(healed / 2), 15).
   - Surgeon-General (15th lvl): When restoring HP to a single creature using Life Support, Art, or Operator Skill, double total HP restored.
2. Triage Subclass:
   - Identification (`isTriage(actor)`) and theme.
   - Rapid Response / On the Scene (1st lvl): 10 Life Support Action: move up to Speed without provoking Opportunity Attacks. Choose up to PB other creatures moved within 5 ft of:
     * Heal: Restore 1d6 + Spellcasting mod HP (upgraded to 2d6 + mod at 7th level).
     * Harm: Melee Spell Attack; on hit, 1d6 + Spellcasting mod Necrotic damage (upgraded to 2d6 + mod at 7th level).
   - Urgent Care Centre (4th lvl): When rolling to restore HP to self with a levelled Art, all other creatures within 10 ft recover HP equal to half the amount rolled.
   - Emergency Medicine / Stop the Flow (7th lvl): 20 Life Support Action to touch a Dying creature. Target immediately gains 6 Mettle, allowing temporary exceedance of max Mettle of 6 up to hard cap of 8. Target cannot be affected again until no longer Dying.
   - Touch of Life and Death (11th lvl): When dealing damage or restoring HP via On the Scene, expend 10 Life Support (no action):
     * Heal: End condition with duration <= 1 hr (if > 1 hr, pause for 1 hr).
     * Harm: Target is Poisoned until beginning of Medic's next turn.
   - Mobile Hospital (15th lvl): 1/Long Rest Bonus Action: project 30-ft radius aura for 1 minute. When creature enters aura or aura enters creature's space, restore 3d6 + Spellcasting mod HP (max 1/round per creature, resetting at turn start).
3. Cross-Feature Interactions & Edge Cases:
   - How Surgeon-General doubles Touch Heal, On the Scene, and Inpatient Care.
   - How Focused Treatment interacts with On the Scene, Intravenous Line, and Hypocritic Oath.
   - How Stop the Flow interacts with Mettle rules in AK5e.
   - Encounter-window undo requirements and WORKFLOW §3.2 table play constraints for all subclass actions.

DELIVERABLE:
Write your structured specification report to:
`/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_medic_subclasses/handoff.md`
Cite exact source lines and numbers. DO NOT write or edit production code. When done, send a message to orchestrator with your report summary and path.
