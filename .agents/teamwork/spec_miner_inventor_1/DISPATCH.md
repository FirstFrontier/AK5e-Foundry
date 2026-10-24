# DISPATCH — spec_miner_inventor_1
Timestamp: 2026-10-20T02:10:45Z
Role: Specification Miner
Working Directory: /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_inventor_1

## Objective
Read the authoritative rules for the AK5e Inventor Subclass of the Specialist class and extract an exhaustive, precise specification of all features, mechanics, formulas, modifications, contraptions, and rulings.

## Authoritative Sources to Read
1. `/home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md` (specifically lines 536 to 628)
2. `/home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (lines 5847 to 6140 — Inventor subclass section)
3. `/home/patch/AK5e-Foundry/TODO.md` (lines 974 to 983)
4. `/home/patch/AK5e-Foundry/ak5e/DECISIONS.md`
5. `/home/patch/AK5e-Foundry/WORKFLOW.md` (§3.2 table-play philosophy)

## Scope & Deliverables
Extract and document in `/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_inventor_1/handoff.md`:
1. Core Chassis & Formulas:
   - Inventor DC calculation (`8 + INT + PB`).
   - Inventions resource pool: max formula (`@prof * 2`), starting count, short/long rest recovery, refund on removal.
   - Equipment Modification procedure: non-magical weapon/armor targets, 10-minute application/removal, duplicate prohibition, 1-week maintenance expiry.
2. Instability & Breakdown Mechanics:
   - Instability calculation formula: base 3, +1 per additional mod after 1st, +1 per Dangerous mod, reductions from Risk Assessment.
   - Breakdown roll: rolling N d6 dice (N = Instability) upon activation of a modification; condition for breakdown (any two or more matching dice / duplicates).
   - Breakdown consequences: HP loss formula `1d8 + 1d8 * (Instability - 3)` (cannot reduce below 1 HP).
   - Dangerous breakdown consequence: equipment rendered broken/disabled (weapon unusable, armor gives no AC/benefits) until repaired with a Maintenance Kit.
3. Complete Catalog of all 31 Modifications:
   - 10 Melee: Boom Module, Burning Edge, Collapsible Weapon, Flexible Weapon, Laser Cutter [Dangerous], Returner, Rotary Blade, Shock Engine, Telescopic Weapon, Trick Weapon.
   - 8 Ranged: Arts Cannon [Dangerous], Collapsible Weapon, Explosive Shots, Electrobolts, Flame Gout, Homing Shots, Melee Attachment, Safety Removal.
   - 10 Armor: Adrenal Overloader [Dangerous], Artsfield Generator, Camouflage Cloak, Exoskeleton, Jetboots, Life Support, Powered Gauntlet, Refocuser, Shock Absorbers, Wingsuit.
   - For each: exact requirements (weapon/armor type), action type (Action, BA, Reaction, on-hit, on-attack), saving throw (type and DC), damage formula/dice, conditions applied, duration, and whether it requires an Instability breakdown roll on activation.
4. Contraptions, Mobile Modding, Risk Assessment, The Big One:
   - 8 Strange Contraptions (Lv 5): 12 Million Lumen Flashlight, Fun Toy, Musbeast Remover, Needlefly Fumigator, Over-tuned Speaker, Portable Firestarter, Universal Keycard, Unstable Contraption (each 1/LR, Action, 30 ft throw).
   - Mobile Modding (Lv 5): 1 Prowess Action, 5 ft willing creature equipment, 1 min, 0 Inventions cost.
   - Inventor Prowess Trigger: 1 Prowess when creature activating mod reduces enemy to 0 HP (max 1/turn).
   - Risk Assessment (Lv 11): Speciality Modding (-1 Instability) and Trained Operator (-1 Instability).
   - 8 Stranger Contraptions (Lv 15): enhanced versions of all 8.
   - The Big One (Lv 20): 1/LR Action: FLASH, SHARD, QUASAR.
5. Rulings & Interpretations for `ak5e/DECISIONS.md`:
   - Dangerous modifications instability addition.
   - Instability breakdown roll timing (when does it roll: on every active modification use vs passive modifications).
   - Duplicate Collapsible Weapon across melee and ranged.
   - Melee Attachment attack modifier wording.
   - Manual vs automated features per WORKFLOW §3.2.

Maintain `progress.md` with timestamps during your work. Write your full report to `handoff.md` and send a message when complete.

## 2026-10-20T02:11:29Z
You are spec_miner_inventor_1. Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_inventor_1/.
Read your dispatch instructions in /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_inventor_1/DISPATCH.md.
Also read:
- /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (specifically lines 536 to 628)
- /home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (lines 5847 to 6140 — Inventor subclass section)
- /home/patch/AK5e-Foundry/TODO.md (lines 974 to 983)
- /home/patch/AK5e-Foundry/ak5e/DECISIONS.md
- /home/patch/AK5e-Foundry/WORKFLOW.md (§3.2)

Mine and document every rule, formula, DC, Instability calculation, breakdown roll mechanic (matching d6 dice, HP loss, dangerous item break), all 31 modifications (10 melee, 8 ranged, 10 armor, 3 dangerous), all 8 Strange and 8 Stranger contraptions, Mobile Modding, Risk Assessment, and The Big One.
Maintain your progress in progress.md. Write your comprehensive report in handoff.md and send a message back to the orchestrator when complete.
